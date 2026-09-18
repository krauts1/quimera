import type { AxieAnimationSet, AxieTextureVariant } from './manifest';

/** The only profile sourced from the serialized AxieFactory defaults. */
export const AXIE_UNITY_COMPATIBILITY_QUALITY_ID = 'unity-default' as const;

/** Browser-only quality policies; these are not AxieFactory behavior. */
export const AXIE_WEB_EXTENSION_QUALITY_IDS = ['ultra', 'balanced', 'performance'] as const;
export type AxieWebExtensionQualityId = typeof AXIE_WEB_EXTENSION_QUALITY_IDS[number];

export const AXIE_QUALITY_IDS = [
  AXIE_UNITY_COMPATIBILITY_QUALITY_ID,
  ...AXIE_WEB_EXTENSION_QUALITY_IDS,
] as const;
export type AxieQualityId = typeof AXIE_QUALITY_IDS[number];

/** Public LOD levels documented by the source Unity package. */
export const AXIE_UNITY_LOD_LEVELS = [0, 1, 2] as const;
export type AxieUnityLodLevel = typeof AXIE_UNITY_LOD_LEVELS[number];

export type AxieOutlineMode = 'unity-geometry' | 'screen-space' | 'off';
export type AxieMysticFxQuality = 'full' | 'reduced';

export interface AxieQualityProfile {
  readonly id: AxieQualityId;
  readonly label: string;
  /** Requested Unity lodLevel. Part rigs clamp this to their last available LOD. */
  readonly requestedLod: number;
  readonly textureVariant: AxieTextureVariant;
  readonly maxTextureDimension: number;
  readonly pixelRatioCap: number;
  readonly anisotropy: number;
  readonly animationSet: AxieAnimationSet;
  readonly outlineMode: AxieOutlineMode;
  readonly mysticFx: AxieMysticFxQuality;
  readonly shadowMapSize: 1024 | 2048 | 4096;
}

/**
 * Defaults grounded in the package:
 * - AxieFactory.asset requests LOD 2.
 * - the source package documents LOD 0, 1, and 2 as its quality choices.
 * - source textures are at most 2048px (most are 1024px).
 * - the package exposes both lite and full animation sets.
 * - its authored outline is the front-cull geometry pass.
 */
export const AXIE_UNITY_COMPATIBILITY_QUALITY: AxieQualityProfile = Object.freeze({
  id: AXIE_UNITY_COMPATIBILITY_QUALITY_ID,
  label: 'Unity default',
  requestedLod: 2,
  textureVariant: 'unity-import',
  maxTextureDimension: 512,
  pixelRatioCap: 2,
  anisotropy: 1,
  animationSet: 'full',
  outlineMode: 'unity-geometry',
  mysticFx: 'full',
  shadowMapSize: 2048,
});

export const AXIE_WEB_EXTENSION_QUALITY_PROFILES: Readonly<
  Record<AxieWebExtensionQualityId, AxieQualityProfile>
> = Object.freeze({
  ultra: Object.freeze({
    id: 'ultra',
    label: 'Ultra',
    requestedLod: 0,
    textureVariant: 'source',
    maxTextureDimension: 2048,
    pixelRatioCap: 2,
    anisotropy: 8,
    animationSet: 'full',
    outlineMode: 'unity-geometry',
    mysticFx: 'full',
    shadowMapSize: 4096,
  }),
  balanced: Object.freeze({
    id: 'balanced',
    label: 'Balanced',
    requestedLod: 1,
    textureVariant: 'source',
    maxTextureDimension: 1024,
    pixelRatioCap: 1.5,
    anisotropy: 4,
    animationSet: 'full',
    outlineMode: 'unity-geometry',
    mysticFx: 'full',
    shadowMapSize: 2048,
  }),
  performance: Object.freeze({
    id: 'performance',
    label: 'Performance (lite)',
    // Keep the request inside Unity's documented 0..2 range. At 3, Unity
    // retains the prefab body mesh (LOD 0) while clamping each part, producing
    // an unintended high-detail-body/low-detail-parts mix.
    requestedLod: 2,
    textureVariant: 'unity-import',
    maxTextureDimension: 512,
    pixelRatioCap: 1,
    anisotropy: 2,
    animationSet: 'lite',
    outlineMode: 'unity-geometry',
    mysticFx: 'reduced',
    shadowMapSize: 1024,
  }),
});

/**
 * Backward-compatible combined lookup. Source-shaped entry points default to
 * AXIE_UNITY_COMPATIBILITY_QUALITY; the other entries require explicit opt-in.
 */
export const AXIE_QUALITY_PROFILES: Readonly<Record<AxieQualityId, AxieQualityProfile>> = Object.freeze({
  [AXIE_UNITY_COMPATIBILITY_QUALITY_ID]: AXIE_UNITY_COMPATIBILITY_QUALITY,
  ...AXIE_WEB_EXTENSION_QUALITY_PROFILES,
});

/** Unity clamps each part rig's list index, rather than searching by mesh name. */
export function resolveAxiePartLodIndex(requestedLod: number, availableLodCount: number): number {
  if (!Number.isInteger(availableLodCount) || availableLodCount <= 0) return -1;
  return Math.min(Math.max(Math.trunc(requestedLod), 0), availableLodCount - 1);
}

/** Unity keeps the prefab body mesh when lodLevel is outside its body LOD list. */
export function resolveAxieBodyLodIndex(
  requestedLod: number,
  availableLodCount: number,
  prefabLod: number,
): number {
  const requested = Math.trunc(requestedLod);
  return requested >= 0 && requested < availableLodCount ? requested : prefabLod;
}
