import * as THREE from 'three';
import type {
  AxieTextureManifest,
  AxieTextureMipChainManifest,
} from './manifest';

export interface AxieTextureLikeLoader {
  loadAsync(url: string, onProgress?: (event: ProgressEvent) => void): Promise<THREE.Texture>;
}

export interface AxieMipFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type AxieMipFetcher = (url: string) => Promise<AxieMipFetchResponse>;

export interface AxieUnityMipChainLoadOptions {
  readonly textureLoader: AxieTextureLikeLoader;
  readonly renderer?: Pick<THREE.WebGLRenderer, 'extensions'>;
  readonly fetcher?: AxieMipFetcher;
  readonly resolveUrl?: (url: string) => string;
  readonly preferRawS3tc?: boolean;
  /** @deprecated Use preferRawS3tc. */
  readonly preferRawBc1?: boolean;
}

export interface AxieLoadedUnityMipChain {
  readonly texture: THREE.Texture;
  readonly transport: 'bc1-gpu' | 'bc3-gpu' | 'png-rgba8';
}

function imageDimensions(image: unknown) {
  const dimensions = image as { width?: number; height?: number } | undefined;
  return {
    width: Math.trunc(dimensions?.width ?? 0),
    height: Math.trunc(dimensions?.height ?? 0),
  };
}

function expectedS3tcByteLength(
  sourceFormat: AxieTextureMipChainManifest['sourceFormat'],
  width: number,
  height: number,
) {
  const blockBytes = sourceFormat === 'bc1-rgb' ? 8 : 16;
  return Math.max(1, Math.ceil(width / 4))
    * Math.max(1, Math.ceil(height / 4)) * blockBytes;
}

async function sha256Hex(buffer: ArrayBuffer) {
  if (!globalThis.crypto?.subtle) {
    throw new Error('SHA-256 is unavailable; Unity-authored mip payloads cannot be verified.');
  }
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

async function fetchVerifiedBytes(
  textureId: string,
  label: string,
  url: string,
  expectedByteLength: number,
  expectedContentHash: string,
  fetcher: AxieMipFetcher,
) {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Could not load Unity mip payload ${textureId}/${label}: HTTP ${response.status}.`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength !== expectedByteLength) {
    throw new Error(
      `Unity mip payload ${textureId}/${label} expected ${expectedByteLength} bytes, `
      + `received ${buffer.byteLength}.`,
    );
  }
  const actualContentHash = await sha256Hex(buffer);
  if (actualContentHash !== expectedContentHash) {
    throw new Error(
      `Unity mip payload ${textureId}/${label} failed SHA-256 verification `
      + `(expected ${expectedContentHash}, received ${actualContentHash}).`,
    );
  }
  return buffer;
}

function validateLevels(texture: AxieTextureManifest, chain: AxieTextureMipChainManifest) {
  if (chain.colorSpace !== texture.colorSpace) {
    throw new Error(`Unity mip chain color space mismatch for ${texture.id}.`);
  }
  if (chain.levels.length === 0 || chain.levels[0].level !== 0) {
    throw new Error(`Unity mip chain ${texture.id} has no level zero.`);
  }
  const expectedTransform = chain.sourceFormat === 'bc1-rgb'
    ? 'bc1-flip-y-block-and-selector-rows-v1'
    : chain.sourceFormat === 'bc3-rgba'
      ? 'bc3-flip-y-block-alpha-and-color-selector-rows-v1'
      : 'unity-decoded-png-levels-v1';
  const expectsRawGpu = chain.sourceFormat !== 'bc7-rgba';
  if (
    chain.rawTransform !== expectedTransform
    || chain.rawTransport !== (expectsRawGpu ? 's3tc-gpu' : 'decoded-png-only')
    || (expectsRawGpu && (
      chain.unityRawByteLength !== chain.rawByteLength
      || !chain.rawUrl
      || !chain.rawContentHash
    ))
    || (!expectsRawGpu && (
      chain.rawUrl !== undefined
      || chain.rawByteLength !== undefined
      || chain.rawContentHash !== undefined
    ))
  ) {
    throw new Error(`Unity mip chain ${texture.id} has invalid WebGL transform provenance.`);
  }
  let expectedWidth = texture.width;
  let expectedHeight = texture.height;
  let expectedRawOffset = 0;
  chain.levels.forEach((level, index) => {
    if (
      level.level !== index
      || level.width !== expectedWidth
      || level.height !== expectedHeight
      || level.rawOffset !== expectedRawOffset
      || level.rawByteLength !== expectedS3tcByteLength(
        chain.sourceFormat,
        level.width,
        level.height,
      )
    ) {
      throw new Error(`Unity mip chain ${texture.id} has an invalid level ${index}.`);
    }
    expectedRawOffset += level.rawByteLength;
    expectedWidth = Math.max(1, expectedWidth >> 1);
    expectedHeight = Math.max(1, expectedHeight >> 1);
  });
  if (
    chain.levels.at(-1)?.width !== 1
    || chain.levels.at(-1)?.height !== 1
    || expectedRawOffset !== chain.unityRawByteLength
  ) {
    throw new Error(`Unity mip chain ${texture.id} is incomplete.`);
  }
}

export function supportsAxieUnityBc1MipChain(
  renderer: Pick<THREE.WebGLRenderer, 'extensions'> | undefined,
  colorSpace: AxieTextureManifest['colorSpace'],
) {
  if (!renderer) return false;
  const extension = colorSpace === 'srgb'
    ? 'WEBGL_compressed_texture_s3tc_srgb'
    : 'WEBGL_compressed_texture_s3tc';
  return renderer.extensions.has(extension);
}

export const supportsAxieUnityS3tcMipChain = supportsAxieUnityBc1MipChain;

async function loadRawS3tc(
  texture: AxieTextureManifest,
  chain: AxieTextureMipChainManifest,
  fetcher: AxieMipFetcher,
  resolveUrl: (url: string) => string,
) {
  if (!chain.rawUrl || chain.rawByteLength === undefined || !chain.rawContentHash) {
    throw new Error(`Unity mip chain ${texture.id} has no raw S3TC payload.`);
  }
  const buffer = await fetchVerifiedBytes(
    texture.id,
    chain.sourceFormat === 'bc1-rgb' ? 'chain.bc1' : 'chain.bc3',
    resolveUrl(chain.rawUrl),
    chain.rawByteLength,
    chain.rawContentHash,
    fetcher,
  );
  const mipmaps = chain.levels.map((level) => ({
    data: new Uint8Array(buffer, level.rawOffset, level.rawByteLength),
    width: level.width,
    height: level.height,
  }));
  return new THREE.CompressedTexture(
    mipmaps,
    texture.width,
    texture.height,
    chain.sourceFormat === 'bc1-rgb'
      ? THREE.RGB_S3TC_DXT1_Format
      : THREE.RGBA_S3TC_DXT5_Format,
    THREE.UnsignedByteType,
  );
}

async function loadDecodedPngChain(
  texture: AxieTextureManifest,
  chain: AxieTextureMipChainManifest,
  loader: AxieTextureLikeLoader,
  fetcher: AxieMipFetcher,
  resolveUrl: (url: string) => string,
) {
  const objectUrls: string[] = [];
  const loadedLevels: Array<THREE.Texture | undefined> = new Array(chain.levels.length);
  let retainLevelZero = false;
  try {
    const results = await Promise.allSettled(chain.levels.map(async (level, index) => {
      const bytes = await fetchVerifiedBytes(
        texture.id,
        `mip-${String(level.level).padStart(2, '0')}.png`,
        resolveUrl(level.url),
        level.byteLength,
        level.contentHash,
        fetcher,
      );
      const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
      objectUrls.push(objectUrl);
      loadedLevels[index] = await loader.loadAsync(objectUrl);
    }));
    const failure = results.find((result): result is PromiseRejectedResult => (
      result.status === 'rejected'
    ));
    if (failure) throw failure.reason;
    const completeLevels = loadedLevels as THREE.Texture[];
    completeLevels.forEach((loaded, index) => {
      const expected = chain.levels[index];
      const actual = imageDimensions(loaded.image);
      if (actual.width !== expected.width || actual.height !== expected.height) {
        throw new Error(
          `Unity decoded mip ${texture.id}/${index} expected ${expected.width}x${expected.height}, `
          + `received ${actual.width}x${actual.height}.`,
        );
      }
    });
    const result = completeLevels[0];
    result.image = completeLevels[0].image;
    result.mipmaps = completeLevels.map((level) => level.image);
    result.generateMipmaps = false;
    retainLevelZero = true;
    return result;
  } finally {
    loadedLevels
      .slice(retainLevelZero ? 1 : 0)
      .forEach((level) => level?.dispose());
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  }
}

/**
 * Loads Unity-authored mip levels. BC1/BC3 are retained byte-for-byte when the
 * renderer exposes the matching transfer-aware extension; otherwise every
 * authored level is supplied explicitly as lossless RGBA8 PNG.
 */
export async function loadAxieUnityMipChain(
  texture: AxieTextureManifest,
  options: AxieUnityMipChainLoadOptions,
): Promise<AxieLoadedUnityMipChain | undefined> {
  const chain = texture.unityMipChain;
  if (!chain) return undefined;
  validateLevels(texture, chain);
  const resolveUrl = options.resolveUrl ?? ((url: string) => url);
  const fetcher = options.fetcher ?? (fetch as AxieMipFetcher);
  if (
    (options.preferRawS3tc ?? options.preferRawBc1) !== false
    && chain.rawTransport === 's3tc-gpu'
    && supportsAxieUnityBc1MipChain(options.renderer, texture.colorSpace)
  ) {
    const loaded = await loadRawS3tc(texture, chain, fetcher, resolveUrl);
    const transport = chain.sourceFormat === 'bc1-rgb' ? 'bc1-gpu' : 'bc3-gpu';
    loaded.userData.axieUnityMipTransport = transport;
    loaded.userData.axieUnityMipContentHash = chain.contentHash;
    loaded.userData.axieUnityMipTransform = chain.rawTransform;
    loaded.userData.axieUnitySourceRawContentHash = chain.unityRawContentHash;
    return {
      texture: loaded,
      transport,
    };
  }
  const loaded = await loadDecodedPngChain(
    texture,
    chain,
    options.textureLoader,
    fetcher,
    resolveUrl,
  );
  loaded.userData.axieUnityMipTransport = 'png-rgba8';
  loaded.userData.axieUnityMipContentHash = chain.contentHash;
  loaded.userData.axieUnityMipTransform = chain.rawTransform;
  loaded.userData.axieUnitySourceRawContentHash = chain.unityRawContentHash;
  return {
    texture: loaded,
    transport: 'png-rgba8',
  };
}
