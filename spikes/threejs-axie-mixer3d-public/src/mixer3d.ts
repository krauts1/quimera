import {
  ThreeAxieAssembler,
  type ThreeAxieAddonFactoryLoader,
} from './assembler';
import {
  RefCountedAxieAssetStore,
  type RefCountedAxieAssetStoreOptions,
} from './asset-store';
import type { AxieDiagnosticEvent } from './diagnostics';
import {
  AxieCharacter3D,
  AxieInstantiationParams,
} from './character3d';
import {
  AXIE_GENES_DECODER,
} from './genes-decoder';
import type { AxieMixerManifest } from './manifest';
import {
  AXIE_PLAN_BUILDER,
} from './plan-builder';
import { SampledAnimationJsonLoader } from './sampled-animation';
import type {
  AxieAssembler,
  AxieAssetStore,
  AxieCreateRequest,
  AxieGenesMixRequest,
  AxieMaterialFactory,
  AxieMixRequest,
  AxieMixer3D,
  AxiePlanBuilder,
} from './runtime';
import type {
  AxieDescriptor,
  AxieGenesDecoder,
} from './domain';
import {
  AXIE_UNITY_COMPATIBILITY_QUALITY,
} from './quality';
import {
  createHttpAxieResolver,
  type AxieResolver,
} from './axie-id';
import type {
  AxieIdMixRequest,
  AxieIdResolveRequest,
} from './runtime';

export interface ThreeAxieMixer3DOptions {
  readonly manifest: AxieMixerManifest;
  /** Defaults to the same-origin /api/axies/{id} resolver shipped by the demo. */
  readonly axieResolver?: AxieResolver;
  readonly genes?: AxieGenesDecoder;
  readonly planBuilder?: AxiePlanBuilder;
  readonly assetStore?: AxieAssetStore;
  readonly assetStoreOptions?: RefCountedAxieAssetStoreOptions;
  readonly materialFactory?: AxieMaterialFactory;
  /** @deprecated Prefer extensions.addons for an explicit browser override. */
  readonly addons?: false | ThreeAxieAddonFactoryLoader;
  readonly extensions?: ThreeAxieMixer3DExtensions;
  readonly animationLoader?: SampledAnimationJsonLoader;
  readonly assembler?: AxieAssembler;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  /** Opt in when a supplied store is owned exclusively by this facade. */
  readonly disposeSuppliedAssetStore?: boolean;
  /** Opts into the process-global source-shaped AxieCharacter3D static factory bridge. */
  readonly registerAsDefaultCharacterFactory?: boolean;
}

/** Browser-only construction policies; omitted fields retain AxieFactory behavior. */
export interface ThreeAxieMixer3DExtensions {
  /** False explicitly omits generated Mystic add-on catalogs/effects. */
  readonly addons?: false | ThreeAxieAddonFactoryLoader;
}

function compatibilityQuality(instantiationParams: AxieInstantiationParams) {
  const requestedLod = Math.trunc(instantiationParams.lodLevel);
  return Object.freeze({
    ...AXIE_UNITY_COMPATIBILITY_QUALITY,
    requestedLod,
  });
}

function sourceCompatibleRequest(request: AxieCreateRequest): AxieMixRequest {
  const extensions = request.extensions;
  return {
    descriptor: request.descriptor,
    quality: extensions?.quality ?? request.quality ?? AXIE_UNITY_COMPATIBILITY_QUALITY,
    artMode: extensions?.artMode ?? request.artMode ?? 'faithful',
    strict: extensions?.strict ?? request.strict ?? false,
    animationSet: extensions?.animationSet ?? request.animationSet,
    signal: request.signal,
    onProgress: request.onProgress,
  };
}

/**
 * AxieFactory.CoerceDescriptor copies the descriptor's part list, then applies
 * its intended coercion only to discarded struct values. The observable result
 * is therefore a value-preserving list/part copy.
 */
function sourceCompatibleDescriptorCopy(descriptor: AxieDescriptor): AxieDescriptor {
  const parts = descriptor.parts.map((part) => ({ ...part }));
  parts.forEach((part) => {
    const discarded = { ...part };
    discarded.skin = discarded.skin === 1 && discarded.variant === 2 ? 1 : 0;
    discarded.level = 1;
  });
  return { ...descriptor, parts };
}

function disposeFailedAssembly(assembly: Awaited<ReturnType<AxieAssembler['assemble']>>) {
  for (let index = assembly.addonRuntimes.length - 1; index >= 0; index -= 1) {
    assembly.addonRuntimes[index].dispose();
  }
  assembly.ownedMaterials.forEach((material) => material.dispose());
  for (let index = assembly.leases.length - 1; index >= 0; index -= 1) {
    assembly.leases[index].release();
  }
  assembly.wrapper.removeFromParent();
  assembly.wrapper.clear();
}

/** Public facade for deterministic planning, loading, assembly and playback. */
export class ThreeAxieMixer3D implements AxieMixer3D {
  readonly manifest: AxieMixerManifest;
  readonly genes: AxieGenesDecoder;
  readonly axieResolver: AxieResolver;
  readonly #planBuilder: AxiePlanBuilder;
  readonly #assets: AxieAssetStore;
  readonly #assembler: AxieAssembler;
  readonly #disposeAssets: boolean;
  readonly #onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly #removeDefaultCharacterFactory?: () => void;
  readonly #characters = new Set<AxieCharacter3D>();
  #disposed = false;

  constructor(options: ThreeAxieMixer3DOptions) {
    this.manifest = options.manifest;
    this.genes = options.genes ?? AXIE_GENES_DECODER;
    this.axieResolver = options.axieResolver ?? createHttpAxieResolver();
    this.#planBuilder = options.planBuilder ?? AXIE_PLAN_BUILDER;
    this.#onDiagnostic = options.onDiagnostic;
    const upstreamDiagnostic = options.assetStoreOptions?.onDiagnostic;
    this.#assets = options.assetStore ?? new RefCountedAxieAssetStore({
      ...options.assetStoreOptions,
      onDiagnostic: (event) => {
        upstreamDiagnostic?.(event);
        options.onDiagnostic?.(event);
      },
    });
    this.#disposeAssets = !options.assetStore || options.disposeSuppliedAssetStore === true;
    this.#assembler = options.assembler ?? new ThreeAxieAssembler({
      manifest: this.manifest,
      assets: this.#assets,
      materials: options.materialFactory,
      addons: options.extensions?.addons ?? options.addons,
      animations: options.animationLoader,
      onDiagnostic: options.onDiagnostic,
    });
    if (options.registerAsDefaultCharacterFactory === true) {
      // Resources/AxieMixer3D/AxieFactory.asset serializes lodLevel 2, false
      // material-property blocks, and no layer overrides. Unity merges every
      // public static-factory request into that asset before body lookup.
      const defaultInstantiationParams = new AxieInstantiationParams({
        lodLevel: AXIE_UNITY_COMPATIBILITY_QUALITY.requestedLod,
        useMaterialPropertyBlocks: false,
        partLayerOverrides: [],
      });
      this.#removeDefaultCharacterFactory = AxieCharacter3D.InstallDefaultFactory({
        createFromDescriptor: async (descriptor, instantiationParams) => {
          const compatible = sourceCompatibleDescriptorCopy(descriptor);
          const merged = defaultInstantiationParams.Merge(instantiationParams);
          // AxieFactory logs and returns null when the body Resources.Load
          // misses. Keep the general plan/create API diagnostic-first, but the
          // source-shaped static facade must retain this nullable boundary.
          if (!this.manifest.assets.bodies[compatible.body]) {
            this.#onDiagnostic?.({
              severity: 'error',
              code: 'body-missing',
              message: `Cannot find body ${compatible.body}.`,
              assetId: compatible.body,
            });
            return null;
          }
          return this.#createCharacter({
            descriptor: compatible,
            quality: compatibilityQuality(merged),
            artMode: 'faithful',
            animationSet: 'full',
          }, merged);
        },
        createFromGenes: async (genes, instantiationParams) => {
          const descriptor = sourceCompatibleDescriptorCopy(this.decodeGenes(genes).descriptor);
          const merged = defaultInstantiationParams.Merge(instantiationParams);
          if (!this.manifest.assets.bodies[descriptor.body]) {
            this.#onDiagnostic?.({
              severity: 'error',
              code: 'body-missing',
              message: `Cannot find body ${descriptor.body}.`,
              assetId: descriptor.body,
            });
            return null;
          }
          return this.#createCharacter({
            descriptor,
            quality: compatibilityQuality(merged),
            artMode: 'faithful',
            animationSet: 'full',
          }, merged);
        },
      });
    }
  }

  plan(request: AxieCreateRequest) {
    this.#assertActive();
    const resolved = sourceCompatibleRequest(request);
    const plan = this.#buildPlan(resolved);
    return plan;
  }

  create(request: AxieCreateRequest) {
    return this.#createCharacter(request);
  }

  async #createCharacter(
    request: AxieCreateRequest,
    instantiationParams?: AxieInstantiationParams,
  ) {
    this.#assertActive();
    const resolved = sourceCompatibleRequest(request);
    const plan = this.#buildPlan(resolved);
    const effectiveInstantiationParams = instantiationParams ?? new AxieInstantiationParams({
      lodLevel: plan.quality.requestedLod,
      useMaterialPropertyBlocks: false,
      partLayerOverrides: [],
    });
    const assembly = await this.#assembler.assemble(plan, resolved, {
      useMaterialPropertyBlocks: effectiveInstantiationParams.useMaterialPropertyBlocks,
    });
    if (this.#disposed) {
      disposeFailedAssembly(assembly);
      throw new Error('Axie mixer was disposed during character creation.');
    }
    try {
      const character = new AxieCharacter3D(assembly, plan, effectiveInstantiationParams, {
        manifest: this.manifest,
        assets: this.#assets,
        onDiagnostic: this.#onDiagnostic,
        onDispose: (disposed) => {
          this.#characters.delete(disposed as AxieCharacter3D);
        },
      });
      this.#characters.add(character);
      return character;
    } catch (error) {
      disposeFailedAssembly(assembly);
      throw error;
    }
  }

  createFromGenes(request: AxieGenesMixRequest) {
    this.#assertActive();
    const decoded = this.genes.decode(request.genes);
    const { genes: _genes, ...mixRequest } = request;
    return this.#createCharacter({
      ...mixRequest,
      // AxieFactory keeps every decoded descriptor value. A missing part
      // resource is skipped by the plan/assembly path, not deleted from the
      // descriptor stored on the resulting character.
      descriptor: decoded.descriptor,
    });
  }

  resolveAxieId(request: AxieIdResolveRequest) {
    this.#assertActive();
    return (request.resolver ?? this.axieResolver).resolve(request.axieId, {
      signal: request.signal,
    });
  }

  async createFromAxieId(request: AxieIdMixRequest) {
    this.#assertActive();
    const resolved = await (request.resolver ?? this.axieResolver).resolve(request.axieId, {
      signal: request.signal,
    });
    this.#assertActive();
    const { axieId: _axieId, resolver: _resolver, ...mixRequest } = request;
    return this.createFromGenes({
      ...mixRequest,
      genes: resolved.genes,
    });
  }

  decodeGenes(genes: string) {
    this.#assertActive();
    return this.genes.decode(genes);
  }

  cacheDiagnostics() {
    return this.#assets.diagnostics();
  }

  clearCache() {
    this.#assertActive();
    this.#assembler.clearCache?.();
    // Active characters retain leases and remain valid. Only unleased immutable
    // sources are evicted, which is the closest safe web equivalent to dropping
    // Unity's factory-owned add-on lookup cache.
    this.#assets.evictUnused(0);
  }

  #buildPlan(request: AxieMixRequest) {
    request.onProgress?.({ stage: 'plan', completed: 0, total: 1 });
    const plan = this.#planBuilder.build(this.manifest, request);
    request.onProgress?.({ stage: 'plan', completed: 1, total: 1, assetId: plan.key });
    return plan;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#removeDefaultCharacterFactory?.();
    // Characters own materials/add-on runtimes and hold source leases. Release
    // all of them before clearing loader caches or destroying the owned store.
    [...this.#characters].forEach((character) => character.dispose());
    this.#characters.clear();
    this.#assembler.clearCache?.();
    if (this.#disposeAssets) this.#assets.dispose();
  }

  #assertActive() {
    if (this.#disposed) throw new Error('Axie mixer is disposed.');
  }
}
