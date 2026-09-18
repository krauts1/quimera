import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { AxieDiagnosticEvent } from './diagnostics';
import type { AxieTextureManifest, AxieTextureVariant } from './manifest';
import type { AxieQualityProfile } from './quality';
import { resolveAxieTextureSampling } from './texture-sampling';
import {
  loadAxieUnityMipChain,
  type AxieMipFetcher,
} from './unity-mip-chain';
import type {
  AxieAssetLease,
  AxieAssetStore,
  AxieLoadedGlb,
} from './runtime';

export interface AxieAsyncLoader<T> {
  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<T>;
}

export interface RefCountedAxieAssetStoreOptions {
  readonly gltfLoader?: AxieAsyncLoader<GLTF>;
  readonly textureLoader?: AxieAsyncLoader<THREE.Texture>;
  /** KTX2Loader after detectSupport(renderer); intentionally not constructed here. */
  readonly ktx2Loader?: AxieAsyncLoader<THREE.Texture>;
  /** Enables byte-exact BC1/BC3 transport when the renderer supports it. */
  readonly renderer?: Pick<THREE.WebGLRenderer, 'extensions'>;
  readonly fetcher?: AxieMipFetcher;
  readonly preferRawUnityS3tc?: boolean;
  /** @deprecated Use preferRawUnityS3tc. */
  readonly preferRawUnityBc1?: boolean;
  readonly resolveUrl?: (url: string) => string;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly maxUnusedEntries?: number;
}

type CacheKind = 'glb' | 'texture';

interface CacheEntry<T> {
  readonly key: string;
  readonly kind: CacheKind;
  readonly promise: Promise<T>;
  value?: T;
  refs: number;
  /** Acquires waiting for the shared load which have not become leases yet. */
  waiters: number;
  lastUsed: number;
  estimatedBytes: number;
}

function abortError() {
  return new DOMException('Axie asset load was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        cleanup();
        reject(error);
      },
    );
  });
}

function materialArray(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material : [material];
}

function texturesFromMaterial(material: THREE.Material) {
  const textures = new Set<THREE.Texture>();
  Object.values(material as unknown as Record<string, unknown>).forEach((value) => {
    if (value instanceof THREE.Texture) textures.add(value);
  });
  return textures;
}

function disposeGlb(glb: AxieLoadedGlb) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  glb.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry) geometries.add(mesh.geometry);
    materialArray(mesh.material).forEach((material) => {
      materials.add(material);
      texturesFromMaterial(material).forEach((texture) => textures.add(texture));
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

function estimateGeometryBytes(geometry: THREE.BufferGeometry) {
  const seen = new Set<ArrayBuffer>();
  let bytes = 0;
  const add = (array?: ArrayBufferView | null) => {
    if (!array || seen.has(array.buffer as ArrayBuffer)) return;
    seen.add(array.buffer as ArrayBuffer);
    bytes += array.byteLength;
  };
  Object.values(geometry.attributes).forEach((attribute) => add(attribute.array));
  add(geometry.index?.array);
  Object.values(geometry.morphAttributes).flat().forEach((attribute) => add(attribute.array));
  return bytes;
}

function estimateGlbBytes(glb: AxieLoadedGlb) {
  const geometries = new Set<THREE.BufferGeometry>();
  glb.scene.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) geometries.add(mesh.geometry);
  });
  let bytes = 0;
  geometries.forEach((geometry) => { bytes += estimateGeometryBytes(geometry); });
  return bytes;
}

function estimateTextureBytes(texture: THREE.Texture) {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const width = Math.max(0, image?.width ?? 0);
  const height = Math.max(0, image?.height ?? 0);
  // RGBA plus the complete mip chain. Compressed loaders may use less; this is
  // intentionally a stable upper estimate for cache pressure diagnostics.
  return Math.ceil(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
}

function resolveWrap(value: AxieTextureManifest['wrapS']) {
  if (value === 'repeat') return THREE.RepeatWrapping;
  if (value === 'mirror') return THREE.MirroredRepeatWrapping;
  return THREE.ClampToEdgeWrapping;
}

interface TextureChoice {
  readonly variant: AxieTextureVariant;
  readonly url: string;
  readonly compressed: boolean;
}

/**
 * Shared immutable-source cache. Scene instances and character materials are
 * never stored here; an active lease pins their geometry/texture sources.
 */
export class RefCountedAxieAssetStore implements AxieAssetStore {
  readonly #entries = new Map<string, CacheEntry<unknown>>();
  readonly #gltfLoader: AxieAsyncLoader<GLTF>;
  readonly #textureLoader: AxieAsyncLoader<THREE.Texture>;
  readonly #ktx2Loader?: AxieAsyncLoader<THREE.Texture>;
  readonly #renderer?: Pick<THREE.WebGLRenderer, 'extensions'>;
  readonly #fetcher?: AxieMipFetcher;
  readonly #preferRawUnityS3tc: boolean;
  readonly #resolveUrl: (url: string) => string;
  readonly #onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly #maxUnusedEntries: number;
  readonly #reportedFallbacks = new Set<string>();
  #disposed = false;
  #activeLeases = 0;
  #inFlightLoads = 0;
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #clock = 0;

  constructor(options: RefCountedAxieAssetStoreOptions = {}) {
    this.#gltfLoader = options.gltfLoader ?? new GLTFLoader();
    this.#textureLoader = options.textureLoader ?? new THREE.TextureLoader();
    this.#ktx2Loader = options.ktx2Loader;
    this.#renderer = options.renderer;
    this.#fetcher = options.fetcher;
    this.#preferRawUnityS3tc = (
      options.preferRawUnityS3tc ?? options.preferRawUnityBc1
    ) !== false;
    this.#resolveUrl = options.resolveUrl ?? ((url) => url);
    this.#onDiagnostic = options.onDiagnostic;
    this.#maxUnusedEntries = Math.max(0, Math.trunc(options.maxUnusedEntries ?? 32));
  }

  async acquireGlb(url: string, signal?: AbortSignal): Promise<AxieAssetLease<AxieLoadedGlb>> {
    const resolvedUrl = this.#resolveUrl(url);
    const key = `glb:${resolvedUrl}`;
    return this.#acquire(
      key,
      'glb',
      async () => {
        const gltf = await this.#gltfLoader.loadAsync(resolvedUrl);
        const value: AxieLoadedGlb = {
          scene: gltf.scene,
          animations: gltf.animations,
        };
        value.scene.userData.axieImmutableSource = true;
        return value;
      },
      estimateGlbBytes,
      signal,
    );
  }

  async acquireTexture(
    texture: AxieTextureManifest,
    quality: AxieQualityProfile,
    signal?: AbortSignal,
  ): Promise<AxieAssetLease<THREE.Texture>> {
    const choice = this.#chooseTexture(texture, quality.textureVariant);
    const resolvedUrl = this.#resolveUrl(choice.url);
    const key = [
      'texture',
      resolvedUrl,
      texture.colorSpace,
      texture.wrapS,
      texture.wrapT,
      texture.filterMode,
      texture.mipmaps,
      texture.unityMipChain?.contentHash ?? '',
      quality.anisotropy,
    ].join(':');
    const loader = choice.compressed ? this.#ktx2Loader : this.#textureLoader;
    if (!loader) {
      throw new Error(`No KTX2 loader is configured for Axie texture ${texture.id}.`);
    }
    return this.#acquire(
      key,
      'texture',
      async () => {
        const authoredMipChain = choice.variant === 'unity-import'
          ? await loadAxieUnityMipChain(texture, {
            textureLoader: this.#textureLoader,
            renderer: this.#renderer,
            fetcher: this.#fetcher,
            preferRawS3tc: this.#preferRawUnityS3tc,
            resolveUrl: this.#resolveUrl,
          })
          : undefined;
        const loaded = authoredMipChain?.texture ?? await loader.loadAsync(resolvedUrl);
        loaded.name = texture.id;
        loaded.colorSpace = texture.colorSpace === 'srgb'
          ? THREE.SRGBColorSpace
          : THREE.NoColorSpace;
        loaded.wrapS = resolveWrap(texture.wrapS);
        loaded.wrapT = resolveWrap(texture.wrapT);
        loaded.anisotropy = Math.max(1, quality.anisotropy);
        loaded.generateMipmaps = texture.mipmaps && !choice.compressed && !authoredMipChain;
        const sampling = resolveAxieTextureSampling(texture);
        loaded.minFilter = sampling.minFilter;
        loaded.magFilter = sampling.magFilter;
        // These textures are applied to glTF meshes, not to legacy Three UVs.
        loaded.flipY = false;
        loaded.needsUpdate = true;
        return loaded;
      },
      estimateTextureBytes,
      signal,
    );
  }

  diagnostics() {
    let estimatedBytes = 0;
    this.#entries.forEach((entry) => { estimatedBytes += entry.estimatedBytes; });
    return {
      entries: this.#entries.size,
      activeLeases: this.#activeLeases,
      inFlightLoads: this.#inFlightLoads,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions,
      estimatedBytes,
    };
  }

  evictUnused(maxEntries = this.#maxUnusedEntries) {
    const target = Math.max(0, Math.trunc(maxEntries));
    if (this.#entries.size <= target) return;
    const candidates = [...this.#entries.values()]
      .filter((entry) => entry.refs === 0 && entry.waiters === 0 && entry.value !== undefined)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    while (this.#entries.size > target && candidates.length > 0) {
      const entry = candidates.shift()!;
      if (this.#entries.get(entry.key) !== entry) continue;
      this.#disposeEntry(entry);
      this.#entries.delete(entry.key);
      this.#evictions += 1;
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#entries.forEach((entry) => this.#disposeEntry(entry));
    this.#entries.clear();
    this.#activeLeases = 0;
  }

  #chooseTexture(texture: AxieTextureManifest, requested: AxieTextureVariant): TextureChoice {
    const requestedUrl = texture.variants[requested];
    const requestedCompressed = requested.startsWith('ktx2-');
    if (requestedUrl && (!requestedCompressed || this.#ktx2Loader)) {
      return { variant: requested, url: requestedUrl, compressed: requestedCompressed };
    }

    const unityImportUrl = texture.variants['unity-import'];
    if (unityImportUrl) {
      this.#reportTextureFallback(texture, requested, 'unity-import');
      return { variant: 'unity-import', url: unityImportUrl, compressed: false };
    }

    const sourceUrl = texture.variants.source;
    if (sourceUrl) {
      this.#reportTextureFallback(texture, requested, 'source');
      return { variant: 'source', url: sourceUrl, compressed: false };
    }

    const compressedVariant = (['ktx2-uastc', 'ktx2-etc1s'] as const)
      .find((variant) => texture.variants[variant] && this.#ktx2Loader);
    if (compressedVariant) {
      this.#reportTextureFallback(texture, requested, compressedVariant);
      return {
        variant: compressedVariant,
        url: texture.variants[compressedVariant]!,
        compressed: true,
      };
    }
    throw new Error(`Axie texture ${texture.id} has no loadable variants.`);
  }

  #reportTextureFallback(
    texture: AxieTextureManifest,
    requested: AxieTextureVariant,
    resolved: AxieTextureVariant,
  ) {
    if (requested === resolved) return;
    const key = `${texture.id}:${requested}:${resolved}`;
    if (this.#reportedFallbacks.has(key)) return;
    this.#reportedFallbacks.add(key);
    this.#onDiagnostic?.({
      severity: 'warning',
      code: 'texture-variant-fallback',
      message: `Texture ${texture.id} requested ${requested} but loaded ${resolved}.`,
      assetId: texture.id,
      details: { requested, resolved },
    });
  }

  async #acquire<T>(
    key: string,
    kind: CacheKind,
    load: () => Promise<T>,
    estimate: (value: T) => number,
    signal?: AbortSignal,
  ): Promise<AxieAssetLease<T>> {
    if (this.#disposed) throw new Error('Axie asset store is disposed.');
    throwIfAborted(signal);
    let entry = this.#entries.get(key) as CacheEntry<T> | undefined;
    if (entry) {
      this.#hits += 1;
    } else {
      this.#misses += 1;
      this.#inFlightLoads += 1;
      const pending: CacheEntry<T> = {
        key,
        kind,
        promise: Promise.resolve(undefined as T),
        refs: 0,
        waiters: 0,
        lastUsed: ++this.#clock,
        estimatedBytes: 0,
      };
      const promise = load().then(
        (value) => {
          pending.value = value;
          pending.estimatedBytes = estimate(value);
          // dispose() clears pending entries before their loaders can finish.
          // A late result therefore has no cache owner and must be destroyed
          // here instead of leaking GPU resources. The same identity check
          // protects against any future explicit pending-entry invalidation.
          if (this.#disposed || this.#entries.get(key) !== pending) {
            this.#disposeEntry(pending as CacheEntry<unknown>);
            throw new Error('Axie asset store was disposed during a load.');
          }
          // A caller can abandon its wait without cancelling the shared source
          // load. Once that load completes, immediately apply the configured
          // zero-reference cache limit (not only the lease-release path).
          this.evictUnused();
          return value;
        },
        (error: unknown) => {
          if (this.#entries.get(key) === pending) this.#entries.delete(key);
          throw error;
        },
      ).finally(() => {
        this.#inFlightLoads = Math.max(0, this.#inFlightLoads - 1);
      });
      Object.defineProperty(pending, 'promise', { value: promise, enumerable: true });
      entry = pending;
      this.#entries.set(key, entry as CacheEntry<unknown>);
    }

    entry.waiters += 1;
    let value: T;
    try {
      value = await waitWithAbort(entry.promise, signal);
    } catch (error) {
      entry.waiters = Math.max(0, entry.waiters - 1);
      entry.lastUsed = ++this.#clock;
      this.evictUnused();
      throw error;
    }
    entry.waiters = Math.max(0, entry.waiters - 1);
    if (this.#disposed) throw new Error('Axie asset store was disposed during a load.');
    if (signal?.aborted) {
      this.evictUnused();
      throw abortError();
    }
    entry.refs += 1;
    entry.lastUsed = ++this.#clock;
    this.#activeLeases += 1;
    let released = false;
    const store = this;
    return {
      key,
      value,
      get released() { return released; },
      release() {
        if (released) return;
        released = true;
        entry!.refs = Math.max(0, entry!.refs - 1);
        entry!.lastUsed = ++store.#clock;
        store.#activeLeases = Math.max(0, store.#activeLeases - 1);
        store.evictUnused();
      },
    };
  }

  #disposeEntry(entry: CacheEntry<unknown>) {
    if (!entry.value) return;
    if (entry.kind === 'texture') {
      (entry.value as THREE.Texture).dispose();
    } else {
      disposeGlb(entry.value as AxieLoadedGlb);
    }
    entry.value = undefined;
    entry.estimatedBytes = 0;
  }
}
