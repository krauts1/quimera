import * as THREE from 'three';

export const AXIE_OPAQUE_RENDER_QUEUE_MIN = 0;
export const AXIE_OPAQUE_RENDER_QUEUE_MAX = 2500;

export interface AxieDepthNormalsPassMetadata {
  readonly lightMode: 'DepthNormals' | 'DepthNormalsOnly';
  readonly cull: 'Back';
  readonly zTest: 'LEqual';
  readonly zWrite: true;
  readonly alphaClipEnabled: boolean;
  readonly alphaThreshold: number;
  readonly alphaClipThreshold: number;
}

export interface AxieSourceRenderPassMetadata {
  readonly schemaVersion: 1;
  readonly sourceShaderGuid: string;
  readonly sourceShaderName: string;
  readonly sourceShaderPath: string;
  readonly sourceRenderQueue: number;
  readonly depthNormals?: AxieDepthNormalsPassMetadata;
}

type MaterialWithSourcePasses = THREE.Material & {
  userData: THREE.Material['userData'] & {
    axieSourceRenderPasses?: AxieSourceRenderPassMetadata;
  };
};

/**
 * Registers immutable Unity pass metadata on a translated material. Rendering
 * stages must consult this source contract instead of inferring pass support
 * from whichever Three.js material class happens to implement the surface.
 */
export function registerAxieSourceRenderPasses<T extends THREE.Material>(
  material: T,
  metadata: AxieSourceRenderPassMetadata,
): T {
  const registered = Object.freeze({
    ...metadata,
    depthNormals: metadata.depthNormals
      ? Object.freeze({ ...metadata.depthNormals })
      : undefined,
  });
  (material as MaterialWithSourcePasses).userData.axieSourceRenderPasses = registered;
  return material;
}

export function readAxieSourceRenderPasses(
  material: THREE.Material,
): AxieSourceRenderPassMetadata | undefined {
  return (material as MaterialWithSourcePasses).userData.axieSourceRenderPasses;
}

export function isAxieDepthNormalsSourceEligible(material: THREE.Material) {
  const metadata = readAxieSourceRenderPasses(material);
  return material.visible
    && metadata?.depthNormals !== undefined
    && metadata.sourceRenderQueue >= AXIE_OPAQUE_RENDER_QUEUE_MIN
    && metadata.sourceRenderQueue <= AXIE_OPAQUE_RENDER_QUEUE_MAX;
}
