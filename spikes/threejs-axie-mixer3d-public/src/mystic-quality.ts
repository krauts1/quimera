import type { AxieQualityProfile } from './quality';
import type { MysticQualityId, MysticQualityProfile } from './mystic-types';

export const MYSTIC_QUALITY_PROFILES: Readonly<Record<MysticQualityId, MysticQualityProfile>> = Object.freeze({
  faithful: Object.freeze({
    id: 'faithful',
    emissionScale: 1,
    particleCapacityScale: 1,
    perSystemParticleCap: 1000,
    fixedStepSeconds: 1 / 60,
    maxCatchUpSteps: 8,
    prewarm: true,
    shaderDetail: 'full',
  }),
  enhanced: Object.freeze({
    id: 'enhanced',
    emissionScale: 1,
    particleCapacityScale: 1.25,
    perSystemParticleCap: 1500,
    fixedStepSeconds: 1 / 120,
    maxCatchUpSteps: 16,
    prewarm: true,
    shaderDetail: 'full',
  }),
  reduced: Object.freeze({
    id: 'reduced',
    emissionScale: 0.5,
    particleCapacityScale: 0.5,
    perSystemParticleCap: 256,
    fixedStepSeconds: 1 / 30,
    maxCatchUpSteps: 4,
    prewarm: false,
    shaderDetail: 'reduced',
  }),
});

export function resolveMysticQuality(
  quality: MysticQualityId | MysticQualityProfile | undefined,
): MysticQualityProfile {
  if (!quality) return MYSTIC_QUALITY_PROFILES.faithful;
  return typeof quality === 'string' ? MYSTIC_QUALITY_PROFILES[quality] : quality;
}

/** Bridges the app's existing Axie quality selector onto the effect runtime. */
export function mysticQualityFromAxieQuality(quality: AxieQualityProfile): MysticQualityId {
  if (quality.mysticFx === 'reduced') return 'reduced';
  return quality.id === 'ultra' ? 'enhanced' : 'faithful';
}
