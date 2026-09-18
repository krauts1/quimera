import {
  formatAxieDescriptorKey,
  formatAxiePartAssetId,
  type AxiePartAssetId,
  type AxieRigType,
} from './domain';
import type { AxieColorVariantManifest, AxieMixerManifest } from './manifest';
import {
  AXIE_QUALITY_PROFILES,
  resolveAxieBodyLodIndex,
  resolveAxiePartLodIndex,
  type AxieQualityProfile,
} from './quality';
import type {
  AxieMixPlan,
  AxieMixRequest,
  AxiePlanBuilder,
  AxieResolvedLod,
  AxieResolvedPartRig,
} from './runtime';
import type { AxieDiagnosticEvent } from './diagnostics';

export interface AxieResolvedColors {
  readonly variant?: AxieColorVariantManifest;
  /** Present only when AxieFactory.Colorize finds the requested config row. */
  readonly primary?: string;
  /** Present only when AxieFactory.Colorize finds the requested config row. */
  readonly secondary?: string;
  /** False means preserve each material's serialized authored colors. */
  readonly applyUnityColorVariant: boolean;
}

export interface AxiePlannedPartRig extends AxieResolvedPartRig {
  /** Unity instantiates add-on prefabs only once for a repeated rig type. */
  readonly instantiateAddonAttachments: boolean;
}

export interface AxieDeterministicMixPlan extends Omit<AxieMixPlan, 'partRigs'> {
  readonly partRigs: readonly AxiePlannedPartRig[];
  readonly colors: AxieResolvedColors;
  readonly artMode: 'faithful' | 'enhanced';
}

export class AxieMixPlanError extends Error {
  readonly name = 'AxieMixPlanError';

  constructor(
    message: string,
    readonly diagnostic: AxieDiagnosticEvent,
  ) {
    super(message);
  }
}

function resolveQuality(request: AxieMixRequest): AxieQualityProfile {
  if (typeof request.quality !== 'string') return request.quality;
  const profile = AXIE_QUALITY_PROFILES[request.quality];
  if (profile) return profile;
  throw new Error(`Unknown Axie quality profile: ${request.quality as string}`);
}

function resolveLodAsset(
  lods: readonly AxieResolvedLod['asset'][],
  resolvedLod: number,
): AxieResolvedLod['asset'] | undefined {
  // AxieFactory indexes both bodyData.lodMeshes and rigData.lodMeshes directly.
  // sourceLod is audit metadata, not a lookup key.
  return lods[resolvedLod];
}

function fail(event: AxieDiagnosticEvent): never {
  throw new AxieMixPlanError(event.message, event);
}

function issue(
  warnings: AxieDiagnosticEvent[],
  strict: boolean,
  event: AxieDiagnosticEvent,
) {
  if (strict) fail({ ...event, severity: 'error' });
  warnings.push(event);
}

function resolveColors(manifest: AxieMixerManifest, colorVariant: number): AxieResolvedColors {
  const variant = manifest.creator.colorVariants.find((candidate) => candidate.index === colorVariant);
  return variant
    ? {
      variant,
      primary: `#${variant.primary1}`,
      secondary: `#${variant.primary2}`,
      applyUnityColorVariant: true,
    }
    : {
      applyUnityColorVariant: false,
    };
}

/** Pure plan builder that mirrors AxieFactory.CreateCharacter without coercion. */
export class DeterministicAxiePlanBuilder implements AxiePlanBuilder {
  build(manifest: AxieMixerManifest, request: AxieMixRequest): AxieDeterministicMixPlan {
    const strict = request.strict === true;
    const warnings: AxieDiagnosticEvent[] = [];
    const missingParts: AxiePartAssetId[] = [];
    const quality = resolveQuality(request);
    const animationSet = request.animationSet ?? quality.animationSet;
    const artMode = request.artMode ?? 'faithful';
    const body = manifest.assets.bodies[request.descriptor.body];

    if (!body) {
      fail({
        severity: 'error',
        code: 'body-missing',
        message: `Cannot find Axie body ${request.descriptor.body}.`,
        assetId: request.descriptor.body,
      });
    }

    const bodyResolvedLod = resolveAxieBodyLodIndex(
      quality.requestedLod,
      body.lods.length,
      body.prefabLod,
    );
    const bodyLodAsset = resolveLodAsset(body.lods, bodyResolvedLod);
    if (!bodyLodAsset) {
      fail({
        severity: 'error',
        code: 'body-missing',
        message: `Axie body ${body.id} has no prefab/LOD mesh at list index ${bodyResolvedLod}.`,
        assetId: body.id,
      });
    }
    const bodyLod: AxieResolvedLod = {
      requestedLod: quality.requestedLod,
      resolvedLod: bodyResolvedLod,
      asset: bodyLodAsset,
    };

    if (bodyResolvedLod !== quality.requestedLod) {
      warnings.push({
        severity: 'info',
        code: 'lod-clamped',
        message: `Body ${body.id} kept prefab LOD ${bodyResolvedLod} for out-of-range request ${quality.requestedLod}.`,
        assetId: body.id,
        details: { requested: quality.requestedLod, resolved: bodyResolvedLod, policy: 'unity-body-prefab' },
      });
    }

    const colors = resolveColors(manifest, request.descriptor.colorVariant);
    const partRigs: AxiePlannedPartRig[] = [];

    // Intentionally preserve descriptor order and values. Unity's checked-in
    // CoerceDescriptor edits a struct copy without assigning it back, so it is a no-op.
    request.descriptor.parts.forEach((descriptor) => {
      const partId = formatAxiePartAssetId(descriptor);
      const part = manifest.assets.parts[partId];
      if (!part) {
        missingParts.push(partId);
        // AxieFactory's missing-part diagnostic is commented out: Resources.Load
        // failure skips the descriptor even in otherwise strict integrations.
        return;
      }

      const addonRigTypes = new Set<AxieRigType>();
      part.rigs.forEach((rig) => {
        const attachNode = body.attachNodes[rig.type];
        if (!attachNode) {
          // Unity logs this as an error and continues with the remaining rigs.
          warnings.push({
            severity: 'error',
            code: 'attach-node-missing',
            message: `Body ${body.id} has no attach point for ${rig.type}; skipping ${partId}.`,
            assetId: partId,
            details: { rigType: rig.type },
          });
          return;
        }

        const resolvedLod = resolveAxiePartLodIndex(quality.requestedLod, rig.lods.length);
        const lodAsset = resolveLodAsset(rig.lods, resolvedLod);
        if (!lodAsset) {
          issue(warnings, strict, {
            severity: 'warning',
            code: 'part-missing',
            message: `Part ${partId}/${rig.type} has no LOD meshes.`,
            assetId: partId,
            details: { rigType: rig.type },
          });
          return;
        }

        if (resolvedLod !== quality.requestedLod) {
          warnings.push({
            severity: 'info',
            code: 'lod-clamped',
            message: `Part ${partId}/${rig.type} clamped LOD ${quality.requestedLod} to ${resolvedLod}.`,
            assetId: partId,
            details: { requested: quality.requestedLod, resolved: resolvedLod, policy: 'unity-part-clamp' },
          });
        }

        const addon = rig.addonId ? manifest.assets.addons[rig.addonId] : undefined;
        if (rig.addonId && !addon) {
          issue(warnings, strict, {
            severity: 'warning',
            code: 'addon-missing',
            message: `Cannot find Axie add-on ${rig.addonId}.`,
            assetId: rig.addonId,
          });
        }
        const materialId = addon?.materialOverrides[rig.sourcePrefabName] ?? rig.materialId;
        const instantiateAddonAttachments = !addonRigTypes.has(rig.type);
        addonRigTypes.add(rig.type);

        partRigs.push({
          partId,
          partType: descriptor.type,
          rigType: rig.type,
          attachNode,
          rig,
          lod: {
            requestedLod: quality.requestedLod,
            resolvedLod,
            asset: lodAsset,
          },
          materialId,
          addonId: addon ? rig.addonId : undefined,
          instantiateAddonAttachments,
        });
      });
    });

    const descriptorKey = formatAxieDescriptorKey(request.descriptor);
    return {
      key: `${descriptorKey}|q:${quality.id}|a:${animationSet}|art:${artMode}`,
      descriptor: request.descriptor,
      quality,
      animationSet,
      artMode,
      body,
      bodyLod,
      partRigs,
      missingParts,
      warnings,
      colors,
    };
  }
}

export const AXIE_PLAN_BUILDER: AxiePlanBuilder = Object.freeze(new DeterministicAxiePlanBuilder());
