import * as THREE from 'three';
import type { AxieTextureManifest } from './manifest';

export interface AxieTextureSampling {
  readonly minFilter: THREE.MinificationTextureFilter;
  readonly magFilter: THREE.MagnificationTextureFilter;
}

/**
 * Exact WebGL/Three mapping of Unity TextureImporter.filterMode.
 *
 * Unity Bilinear performs bilinear filtering within one mip level, so its
 * mipmapped WebGL equivalent is LINEAR_MIPMAP_NEAREST. Trilinear alone blends
 * across adjacent mip levels (LINEAR_MIPMAP_LINEAR).
 */
export function resolveAxieTextureSampling(
  texture: Pick<AxieTextureManifest, 'filterMode' | 'mipmaps'>,
): AxieTextureSampling {
  if (texture.filterMode === 'point') {
    return {
      minFilter: texture.mipmaps ? THREE.NearestMipmapNearestFilter : THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
    };
  }
  if (texture.filterMode === 'bilinear') {
    return {
      minFilter: texture.mipmaps ? THREE.LinearMipmapNearestFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
  }
  if (texture.filterMode === 'trilinear') {
    return {
      minFilter: texture.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
  }
  throw new RangeError(`Unsupported Axie texture filter mode: ${String(texture.filterMode)}`);
}
