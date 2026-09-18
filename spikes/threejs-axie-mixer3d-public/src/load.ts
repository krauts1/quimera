import type * as THREE from 'three';
import { createAxieAssetLocator, AXIE_PINNED_SOURCE_COMMIT, type AxieAssetLocatorOptions } from './asset-locator';
import { AXIE_BODY_TYPES } from './domain';
import type { AxieMixerManifest } from './manifest';
import { AXIE_MANIFEST_SCHEMA_VERSION } from './manifest';
import { ThreeAxieMixer3D, type ThreeAxieMixer3DOptions } from './mixer3d';
import { SampledAnimationJsonLoader } from './sampled-animation';

export type AxieManifestValidationMode = 'schema' | 'source-pinned';

export interface ValidateAxieManifestOptions {
  readonly mode?: AxieManifestValidationMode;
  readonly expectedSourceCommit?: string;
}

export interface LoadAxieManifestOptions extends AxieAssetLocatorOptions, ValidateAxieManifestOptions {
  readonly manifestUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
}

export interface CreateAxieMixer3DOptions
  extends AxieAssetLocatorOptions,
    ValidateAxieManifestOptions,
    Omit<ThreeAxieMixer3DOptions, 'manifest' | 'assetStoreOptions' | 'animationLoader'> {
  readonly manifest?: AxieMixerManifest;
  readonly manifestUrl?: string;
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
  readonly renderer?: Pick<THREE.WebGLRenderer, 'extensions'>;
  readonly maxUnusedEntries?: number;
  readonly preferRawUnityS3tc?: boolean;
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function count(value: unknown) {
  return record(value) ? Object.keys(value).length : -1;
}

const SHA256 = /^[0-9a-f]{64}$/u;
/** Exact AnimatorSample.weaponPrefabs order and CreateWeapon behavior. */
const UNITY_SAMPLE_WEAPONS = Object.freeze({
  Axe: Object.freeze({ sampleOrder: 0, attach: 'right', mirrorLeft: false }),
  Bow: Object.freeze({ sampleOrder: 1, attach: 'left', mirrorLeft: false }),
  Cannon: Object.freeze({ sampleOrder: 2, attach: 'right', mirrorLeft: false }),
  Flag: Object.freeze({ sampleOrder: 3, attach: 'right', mirrorLeft: false }),
  Gauntlet: Object.freeze({ sampleOrder: 4, attach: 'both', mirrorLeft: true }),
  Mala: Object.freeze({ sampleOrder: 5, attach: 'right', mirrorLeft: false }),
  Staff: Object.freeze({ sampleOrder: 6, attach: 'right', mirrorLeft: false }),
  Sword: Object.freeze({ sampleOrder: 7, attach: 'right', mirrorLeft: false }),
  Tome: Object.freeze({ sampleOrder: 8, attach: 'right', mirrorLeft: false }),
} as const);
const UNITY_SAMPLE_WEAPON_IDS = Object.freeze(Object.keys(UNITY_SAMPLE_WEAPONS));
const PAIRED_WEAPON_FAMILIES = new Set(['Flag', 'Talisman', 'Tome']);
const PAIRED_WEAPON_STATES = Object.freeze(['Idle', 'Walk', 'Run', 'Attack', 'Skill'] as const);
const PAIRED_WEAPON_LOOPING_STATES = new Set(['Idle', 'Walk', 'Run']);
const WEAPON_SOURCE_KINDS = new Set(['unity-sample-rig', 'expanded-rigid', 'source-static']);
const BODY_IDS = new Set<string>(AXIE_BODY_TYPES);
const ANIMATION_COORDINATE_SPACES = new Set([
  'unity-source-local-v1',
  'target-glb-local-v1',
]);

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} must be a non-empty string.`);
  return value;
}

function sha256(value: unknown, label: string) {
  const result = nonEmptyString(value, label);
  if (!SHA256.test(result)) throw new TypeError(`${label} must be a lowercase SHA-256 hash.`);
  return result;
}

function uniqueStrings(
  value: unknown,
  label: string,
  options: Readonly<{ allowEmpty?: boolean; allowed?: ReadonlySet<string> }> = {},
) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array.`);
  if (!options.allowEmpty && value.length === 0) throw new TypeError(`${label} must not be empty.`);
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    const selected = nonEmptyString(entry, `${label} entry`);
    if (seen.has(selected)) throw new TypeError(`${label} repeats ${selected}.`);
    if (options.allowed && !options.allowed.has(selected)) throw new TypeError(`${label} contains unsupported value ${selected}.`);
    seen.add(selected);
    result.push(selected);
  }
  return result;
}

function bodyIds(value: unknown, label: string, allowEmpty = false) {
  return uniqueStrings(value, label, { allowEmpty, allowed: BODY_IDS });
}

function nonNegativeInteger(value: unknown, label: string) {
  if (!Number.isInteger(value) || (value as number) < 0) throw new TypeError(`${label} must be a non-negative integer.`);
  return value as number;
}

function weaponUrl(value: unknown, label: string) {
  const url = nonEmptyString(value, label);
  if (
    !url.startsWith('/assets/axie/weapons/')
    || !url.endsWith('.glb')
    || url.includes('..')
    || url.includes('%')
    || url.includes('\\')
    || url.includes('?')
    || url.includes('#')
  ) {
    throw new TypeError(`${label} must be a portable Axie weapon GLB URL.`);
  }
  return url;
}

function validateWeaponSockets(
  bodies: Record<string, unknown>,
  supportedBodyIds: readonly string[],
  instances: readonly string[],
  label: string,
) {
  for (const bodyId of supportedBodyIds) {
    const body = bodies[bodyId];
    if (!record(body)) throw new TypeError(`${label} references missing body ${bodyId}.`);
    if (body.weaponAttachNodes !== undefined && !record(body.weaponAttachNodes)) {
      throw new TypeError(`${label} body ${bodyId} has malformed weapon socket metadata.`);
    }
    // A body with a sealed rest pose uses the exact Unity attachment bridge at
    // runtime. Such a body cannot be declared compatible when the matching
    // left/right source socket is absent. Legacy bodies without a rest pose may
    // still discover anchors directly from their loaded hierarchy.
    if (!record(body.weaponAttachNodes)) {
      if (typeof body.restPoseUrl === 'string' && body.restPoseUrl.length > 0) {
        throw new TypeError(`${label} body ${bodyId} has no weapon socket metadata.`);
      }
      continue;
    }
    for (const instance of instances) {
      const socket = body.weaponAttachNodes[instance];
      if (socket === undefined && typeof body.restPoseUrl === 'string' && body.restPoseUrl.length > 0) {
        throw new TypeError(`${label} body ${bodyId} has no ${instance} weapon socket.`);
      }
      if (socket !== undefined) nonEmptyString(socket, `${label} ${bodyId} ${instance} weapon socket`);
    }
  }
}

function bodyClipNames(body: Record<string, unknown>) {
  if (!record(body.animations)) return [];
  const names: string[] = [];
  for (const bundle of Object.values(body.animations)) {
    if (!record(bundle) || !Array.isArray(bundle.clips)) continue;
    for (const clip of bundle.clips) {
      if (record(clip) && typeof clip.sourceName === 'string') names.push(clip.sourceName);
    }
  }
  return names;
}

function validateAnimationCatalog(assets: Record<string, unknown>) {
  if (!record(assets.bodies)) throw new TypeError('Axie manifest is missing its body catalog.');
  for (const bodyId of AXIE_BODY_TYPES) {
    const body = assets.bodies[bodyId];
    if (!record(body) || !record(body.animations)) {
      throw new TypeError(`Axie manifest body ${bodyId} is missing animation bundles.`);
    }
    for (const set of ['lite', 'full']) {
      const bundle = body.animations[set];
      const label = `Axie manifest body ${bodyId} ${set} animation bundle`;
      if (!record(bundle)) throw new TypeError(`${label} is required.`);
      if (bundle.set !== set) throw new TypeError(`${label} set must be ${set}.`);
      if (!ANIMATION_COORDINATE_SPACES.has(String(bundle.coordinateSpace))) {
        throw new TypeError(`${label} has unsupported coordinateSpace ${String(bundle.coordinateSpace)}.`);
      }
      const url = nonEmptyString(bundle.url, `${label} URL`);
      if (url !== `/assets/axie/animations/${bodyId}/${set}/index.json`) {
        throw new TypeError(`${label} URL must target its canonical index.`);
      }
      sha256(bundle.contentHash, `${label} contentHash`);
      if (!Array.isArray(bundle.clips) || bundle.clips.length === 0) {
        throw new TypeError(`${label} clips must be a non-empty array.`);
      }
      for (const [index, clip] of bundle.clips.entries()) {
        if (!record(clip)) throw new TypeError(`${label} clip ${index} must be an object.`);
        nonEmptyString(clip.sourceName, `${label} clip ${index} sourceName`);
        nonEmptyString(clip.runtimeName, `${label} clip ${index} runtimeName`);
        sha256(clip.contentHash, `${label} clip ${index} contentHash`);
      }
    }
  }
}

function sameStringMembers(actual: readonly string[], expected: readonly string[], label: string) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (
    sortedActual.length !== sortedExpected.length
    || sortedActual.some((entry, index) => entry !== sortedExpected[index])
  ) {
    throw new TypeError(`${label} does not match the weapon catalog.`);
  }
}

function hashedPath(value: unknown, label: string) {
  if (!record(value)) throw new TypeError(`${label} must be an object.`);
  nonEmptyString(value.path, `${label} path`);
  sha256(value.sha256, `${label} sha256`);
}

function validateLatestUnityWeaponParity(value: unknown, weapons: Record<string, unknown>) {
  const label = 'Axie manifest latest Unity weapon source provenance';
  if (!record(value)) throw new TypeError(`${label} is required.`);
  if (value.schemaVersion !== 1) throw new TypeError(`${label} schemaVersion must be 1.`);
  nonEmptyString(value.generatedBy, `${label} generatedBy`);
  sha256(value.contentHash, `${label} contentHash`);

  if (!record(value.sourceCatalog)) throw new TypeError(`${label} sourceCatalog must be an object.`);
  nonEmptyString(value.sourceCatalog.path, `${label} sourceCatalog path`);
  sha256(value.sourceCatalog.fileSha256, `${label} sourceCatalog fileSha256`);
  sha256(value.sourceCatalog.contentHash, `${label} sourceCatalog contentHash`);
  nonEmptyString(value.sourceCatalog.snapshot, `${label} sourceCatalog snapshot`);
  if (!record(value.sourceCatalog.sourceArchives)) {
    throw new TypeError(`${label} sourceCatalog sourceArchives must be an object.`);
  }
  const archiveKeys = Object.keys(value.sourceCatalog.sourceArchives).sort();
  if (archiveKeys.length !== 2 || archiveKeys[0] !== 'body' || archiveKeys[1] !== 'weapon') {
    throw new TypeError(`${label} sourceCatalog sourceArchives must contain exactly body and weapon.`);
  }
  for (const archiveId of archiveKeys) {
    const archive = value.sourceCatalog.sourceArchives[archiveId];
    if (!record(archive)) throw new TypeError(`${label} source archive ${archiveId} must be an object.`);
    nonEmptyString(archive.fileName, `${label} source archive ${archiveId} fileName`);
    nonNegativeInteger(archive.bytes, `${label} source archive ${archiveId} bytes`);
    sha256(archive.sha256, `${label} source archive ${archiveId} sha256`);
  }

  if (!Array.isArray(value.conversionReports) || value.conversionReports.length === 0) {
    throw new TypeError(`${label} conversionReports must be a non-empty array.`);
  }
  value.conversionReports.forEach((report, index) => hashedPath(report, `${label} conversion report ${index}`));

  if (Object.hasOwn(value, 'flagSkillReport')) {
    throw new TypeError(`${label} must not promote a derived paired Flag animation.`);
  }

  hashedPath(value.attachmentConfig, `${label} attachmentConfig`);
  hashedPath(value.inputManifest, `${label} inputManifest`);

  if (!record(value.coverage)) throw new TypeError(`${label} coverage must be an object.`);
  const riggedFamilies = uniqueStrings(value.coverage.riggedFamilies, `${label} coverage riggedFamilies`, { allowEmpty: true });
  const staticFamilies = uniqueStrings(value.coverage.staticFamilies, `${label} coverage staticFamilies`, { allowEmpty: true });
  const totalFamilies = nonNegativeInteger(value.coverage.totalFamilies, `${label} coverage totalFamilies`);
  const totalVariants = nonNegativeInteger(value.coverage.totalVariants, `${label} coverage totalVariants`);
  if (Object.hasOwn(value.coverage, 'pairedActions') || Object.hasOwn(value.coverage, 'actionInstanceRules')) {
    throw new TypeError(`${label} coverage must not claim inferred paired actions or action-instance rules.`);
  }

  if (!record(value.generated)) throw new TypeError(`${label} generated must be an object.`);
  const generatedFamilies = uniqueStrings(value.generated.familyIds, `${label} generated familyIds`);
  const generatedVariantIds = uniqueStrings(value.generated.variantIds, `${label} generated variantIds`);
  const generatedUrls = uniqueStrings(value.generated.urls, `${label} generated URLs`);
  generatedUrls.forEach((url, index) => weaponUrl(url, `${label} generated URL ${index}`));
  const generatedHashes = uniqueStrings(value.generated.contentHashes, `${label} generated contentHashes`);
  generatedHashes.forEach((hash, index) => sha256(hash, `${label} generated contentHash ${index}`));

  const families = Object.entries(weapons);
  const variants = families.flatMap(([, family]) => record(family) && Array.isArray(family.variants) ? family.variants : []);
  const variantRecords = variants.filter(record);
  const actualFamilyIds = families.map(([familyId]) => familyId);
  const actualVariantIds = variantRecords.map((variant) => nonEmptyString(variant.id, `${label} catalog variant id`));
  const actualUrls = variantRecords.map((variant) => nonEmptyString(variant.url, `${label} catalog variant URL`));
  const actualHashes = variantRecords.map((variant) => sha256(variant.contentHash, `${label} catalog variant contentHash`));
  sameStringMembers(generatedFamilies, actualFamilyIds, `${label} generated familyIds`);
  sameStringMembers(generatedVariantIds, actualVariantIds, `${label} generated variantIds`);
  sameStringMembers(generatedUrls, actualUrls, `${label} generated URLs`);
  sameStringMembers(generatedHashes, actualHashes, `${label} generated contentHashes`);

  const expectedRigged = families
    .filter(([, family]) => record(family) && family.sourceKind !== 'source-static')
    .map(([familyId]) => familyId);
  const expectedStatic = families
    .filter(([, family]) => record(family) && family.sourceKind === 'source-static')
    .map(([familyId]) => familyId);
  sameStringMembers(riggedFamilies, expectedRigged, `${label} coverage riggedFamilies`);
  sameStringMembers(staticFamilies, expectedStatic, `${label} coverage staticFamilies`);
  if (totalFamilies !== families.length) throw new TypeError(`${label} coverage totalFamilies does not match the weapon catalog.`);
  if (totalVariants !== variantRecords.length) throw new TypeError(`${label} coverage totalVariants does not match the weapon catalog.`);
}

function validateWeaponCatalog(assets: Record<string, unknown>) {
  if (!record(assets.weapons) || !record(assets.bodies)) {
    throw new TypeError('Axie manifest is missing weapon or body catalogs.');
  }
  const weapons = assets.weapons;
  const familyKeys = Object.keys(weapons);
  const missingUnitySampleWeapons = UNITY_SAMPLE_WEAPON_IDS.filter((familyId) => (
    !Object.prototype.hasOwnProperty.call(weapons, familyId)
  ));
  if (missingUnitySampleWeapons.length > 0) {
    throw new TypeError(
      `Axie manifest is missing official Unity AnimatorSample weapon${missingUnitySampleWeapons.length === 1 ? '' : 's'} ${missingUnitySampleWeapons.join(', ')}.`,
    );
  }

  const familyIds = new Set<string>();
  const familyUrls = new Set<string>();
  const variantIds = new Set<string>();
  const variantUrls = new Set<string>();

  for (const familyKey of familyKeys) {
    const family = weapons[familyKey];
    if (!record(family)) throw new TypeError(`Weapon family ${familyKey} must be an object.`);
    const label = `Weapon family ${familyKey}`;
    const familyId = nonEmptyString(family.id, `${label} id`);
    if (familyId !== familyKey) throw new TypeError(`${label} id must match its catalog key.`);
    if (familyIds.has(familyId)) throw new TypeError(`Weapon family id ${familyId} is duplicated.`);
    familyIds.add(familyId);

    const familyUrl = weaponUrl(family.url, `${label} URL`);
    if (familyUrls.has(familyUrl)) throw new TypeError(`Weapon family URL ${familyUrl} is duplicated.`);
    familyUrls.add(familyUrl);
    nonEmptyString(family.label, `${label} label`);
    const animationPrefix = nonEmptyString(family.animationPrefix, `${label} animationPrefix`);
    const clipPrefixes = uniqueStrings(family.clipPrefixes, `${label} clipPrefixes`);
    nonEmptyString(family.sourceFile, `${label} sourceFile`);
    nonEmptyString(family.textureSourceFile, `${label} textureSourceFile`);
    sha256(family.sourceSha256, `${label} sourceSha256`);
    sha256(family.textureSha256, `${label} textureSha256`);
    sha256(family.contentHash, `${label} contentHash`);
    if (typeof family.textureEmbedded !== 'boolean') throw new TypeError(`${label} textureEmbedded must be boolean.`);
    uniqueStrings(family.meshNames, `${label} meshNames`);
    const familyArmatures = nonNegativeInteger(family.armatureCount, `${label} armatureCount`);
    const sourceClipCount = nonNegativeInteger(family.sourceClipCount, `${label} sourceClipCount`);
    const sourceKind = nonEmptyString(family.sourceKind, `${label} sourceKind`);
    if (!WEAPON_SOURCE_KINDS.has(sourceKind)) throw new TypeError(`${label} has unsupported sourceKind ${sourceKind}.`);
    if (sourceKind === 'unity-sample-rig' && familyArmatures === 0) {
      throw new TypeError(`${label} unity-sample-rig must contain an armature.`);
    }
    if ((sourceKind === 'expanded-rigid' || sourceKind === 'source-static') && familyArmatures !== 0) {
      throw new TypeError(`${label} ${sourceKind} must remain armature-free.`);
    }
    if (family.attach !== 'left' && family.attach !== 'right' && family.attach !== 'both') {
      throw new TypeError(`${label} has unsupported attachment side ${String(family.attach)}.`);
    }
    if (typeof family.mirrorLeft !== 'boolean') throw new TypeError(`${label} mirrorLeft must be boolean.`);
    if (family.locomotionStyle !== 'controller' && family.locomotionStyle !== 'action') {
      throw new TypeError(`${label} has unsupported locomotionStyle ${String(family.locomotionStyle)}.`);
    }
    if (Object.hasOwn(family, 'actionInstances')) {
      throw new TypeError(`${label} must not expose inferred action-instance rules.`);
    }
    if (PAIRED_WEAPON_FAMILIES.has(familyKey)) {
      if (!record(family.pairedAnimations) || family.pairedAnimations.schemaVersion !== 1) {
        throw new TypeError(`${label} must declare its exact source pairedAnimations.`);
      }
      if (!record(family.pairedAnimations.clips)) {
        throw new TypeError(`${label} pairedAnimations clips must be an object.`);
      }
      const stateKeys = Object.keys(family.pairedAnimations.clips).sort();
      const expectedStates = [...PAIRED_WEAPON_STATES].sort();
      if (
        stateKeys.length !== expectedStates.length
        || stateKeys.some((state, index) => state !== expectedStates[index])
      ) {
        throw new TypeError(`${label} pairedAnimations must contain exactly ${expectedStates.join(', ')}.`);
      }
      for (const state of PAIRED_WEAPON_STATES) {
        const clip = family.pairedAnimations.clips[state];
        const clipLabel = `${label} paired animation ${state}`;
        if (!record(clip)) throw new TypeError(`${clipLabel} must be an object.`);
        weaponUrl(clip.url, `${clipLabel} URL`);
        sha256(clip.contentHash, `${clipLabel} contentHash`);
        nonEmptyString(clip.sourceFile, `${clipLabel} sourceFile`);
        sha256(clip.sourceSha256, `${clipLabel} sourceSha256`);
        if (typeof clip.duration !== 'number' || !Number.isFinite(clip.duration) || clip.duration <= 0) {
          throw new TypeError(`${clipLabel} duration must be finite and positive.`);
        }
        if (clip.looping !== PAIRED_WEAPON_LOOPING_STATES.has(state)) {
          throw new TypeError(`${clipLabel} looping does not match the source controller state.`);
        }
        uniqueStrings(clip.requiredBones, `${clipLabel} requiredBones`);
        uniqueStrings(clip.animatedBones, `${clipLabel} animatedBones`);
      }
    } else if (family.pairedAnimations !== undefined) {
      throw new TypeError(`${label} has no source-authored weapon-local animation and must not declare pairedAnimations.`);
    }
    if (family.sampleOrder !== null) nonNegativeInteger(family.sampleOrder, `${label} sampleOrder`);
    const familyBodyIds = bodyIds(family.supportedBodyIds, `${label} supportedBodyIds`, true);
    const familyInstances = family.attach === 'both' ? ['left', 'right'] : [family.attach];

    const unitySample = UNITY_SAMPLE_WEAPONS[familyKey as keyof typeof UNITY_SAMPLE_WEAPONS];
    if (unitySample) {
      if (sourceKind !== 'unity-sample-rig') {
        throw new TypeError(`${label} official Unity sample sourceKind must be unity-sample-rig.`);
      }
      if (familyUrl !== `/assets/axie/weapons/${familyKey}.glb`) {
        throw new TypeError(`${label} official Unity sample URL must reference its base prefab GLB.`);
      }
      if (family.sampleOrder !== unitySample.sampleOrder) {
        throw new TypeError(`${label} official Unity sampleOrder must be ${unitySample.sampleOrder}.`);
      }
      if (family.attach !== unitySample.attach || family.mirrorLeft !== unitySample.mirrorLeft) {
        throw new TypeError(
          `${label} official Unity sample attachment must be ${unitySample.attach}${unitySample.mirrorLeft ? ' with mirrored left instance' : ''}.`,
        );
      }
      if (animationPrefix !== familyKey || family.locomotionStyle !== 'controller') {
        throw new TypeError(`${label} official Unity sample must use the exact ${familyKey} controller overrides.`);
      }
      if (!familyBodyIds.includes('normal')) {
        throw new TypeError(`${label} must retain the Normal clips used by the official Unity sample.`);
      }
    } else if (family.sampleOrder !== null) {
      throw new TypeError(`${label} is source inventory only and must not claim an AnimatorSample order.`);
    }

    validateWeaponSockets(assets.bodies, familyBodyIds, familyInstances, label);
    for (const bodyId of familyBodyIds) {
      const body = assets.bodies[bodyId];
      const matchingClip = record(body) && bodyClipNames(body).some((sourceName) => (
        sourceName === animationPrefix
        || sourceName.startsWith(`${animationPrefix}.`)
        || clipPrefixes.some((prefix) => sourceName.startsWith(prefix))
      ));
      if (!matchingClip) {
        throw new TypeError(`${label} body ${bodyId} has no clip matching its animationPrefix or clipPrefixes.`);
      }
    }
    // AnimBodyFbx can provide exact body/socket motion for an otherwise rigid
    // Static source weapon. `source-static` describes the weapon payload itself; it no
    // longer implies that the corresponding Axie body clips are absent.

    if (!Array.isArray(family.variants) || family.variants.length === 0) {
      throw new TypeError(`${label} must declare source-authored variants.`);
    }
    const defaultVariantId = nonEmptyString(family.defaultVariantId, `${label} defaultVariantId`);
    const localVariantIds = new Set<string>();
    let defaultVariantBodyIds: readonly string[] | undefined;
    for (const variantValue of family.variants) {
      if (!record(variantValue)) throw new TypeError(`${label} variant must be an object.`);
      const variantId = nonEmptyString(variantValue.id, `${label} variant id`);
      const variantLabel = `${label} variant ${variantId}`;
      if (Object.hasOwn(variantValue, 'animations')) {
        throw new TypeError(`${variantLabel} must not expose an inferred paired animation.`);
      }
      const normalizedVariantId = variantId.toLowerCase();
      if (localVariantIds.has(variantId) || variantIds.has(normalizedVariantId)) {
        throw new TypeError(`Weapon variant id ${variantId} is duplicated.`);
      }
      localVariantIds.add(variantId);
      variantIds.add(normalizedVariantId);
      const variantUrl = weaponUrl(variantValue.url, `${variantLabel} URL`);
      if (variantUrls.has(variantUrl)) throw new TypeError(`Weapon variant URL ${variantUrl} is duplicated.`);
      variantUrls.add(variantUrl);
      sha256(variantValue.contentHash, `${variantLabel} contentHash`);
      nonEmptyString(variantValue.sourceFile, `${variantLabel} sourceFile`);
      sha256(variantValue.sourceSha256, `${variantLabel} sourceSha256`);
      nonEmptyString(variantValue.textureSourceFile, `${variantLabel} textureSourceFile`);
      sha256(variantValue.textureSha256, `${variantLabel} textureSha256`);
      uniqueStrings(variantValue.meshNames, `${variantLabel} meshNames`);
      // Keep exact source payloads catalogued even when no converted Axie body
      // clip can currently place them faithfully. An empty support set is a
      // deliberate fail-closed runtime contract, not missing metadata.
      const variantBodyIds = bodyIds(variantValue.supportedBodyIds, `${variantLabel} supportedBodyIds`, true);
      if (variantId === defaultVariantId) defaultVariantBodyIds = variantBodyIds;
      validateWeaponSockets(assets.bodies, variantBodyIds, familyInstances, variantLabel);
      const armatureCount = nonNegativeInteger(variantValue.armatureCount, `${variantLabel} armatureCount`);
      const requiredBones = armatureCount > 0
        ? uniqueStrings(variantValue.requiredBones, `${variantLabel} requiredBones`)
        : uniqueStrings(variantValue.requiredBones ?? [], `${variantLabel} requiredBones`, { allowEmpty: true });
      if (armatureCount > 0) {
        sha256(variantValue.skeletonSignature, `${variantLabel} skeletonSignature`);
      } else if (variantValue.skeletonSignature !== undefined || requiredBones.length > 0) {
        throw new TypeError(`${variantLabel} armature-free payload must not claim a skeleton or required bones.`);
      }
      if (sourceKind === 'source-static' && armatureCount !== 0) {
        throw new TypeError(`${variantLabel} source-static payload must remain armature-free.`);
      }
      if (
        variantValue.level !== undefined
        && (typeof variantValue.level !== 'number' || !Number.isInteger(variantValue.level) || variantValue.level <= 0)
      ) {
        throw new TypeError(`${variantLabel} level must be a positive integer.`);
      }
      if (
        variantValue.outlineMode !== undefined
        && variantValue.outlineMode !== 'outline'
        && variantValue.outlineMode !== 'no-outline'
      ) {
        throw new TypeError(`${variantLabel} has unsupported outlineMode ${String(variantValue.outlineMode)}.`);
      }
    }
    if (!localVariantIds.has(defaultVariantId)) {
      throw new TypeError(`${label} defaultVariantId ${defaultVariantId} does not resolve to a declared variant.`);
    }
    const missingDefaultBodies = familyBodyIds.filter((bodyId) => !defaultVariantBodyIds?.includes(bodyId));
    if (missingDefaultBodies.length > 0) {
      throw new TypeError(`${label} default variant must support every family body; missing ${missingDefaultBodies.join(', ')}.`);
    }
  }
}

export function validateAxieMixerManifest(
  value: unknown,
  options: ValidateAxieManifestOptions = {},
): asserts value is AxieMixerManifest {
  if (!record(value)) throw new TypeError('Axie manifest must be an object.');
  if (value.schemaVersion !== AXIE_MANIFEST_SCHEMA_VERSION) {
    throw new TypeError(`Unsupported Axie manifest schema ${String(value.schemaVersion)}.`);
  }
  if (!record(value.source) || typeof value.source.commit !== 'string') {
    throw new TypeError('Axie manifest is missing its source identity.');
  }
  const expectedCommit = options.expectedSourceCommit ?? AXIE_PINNED_SOURCE_COMMIT;
  if ((options.mode ?? 'source-pinned') === 'source-pinned' && value.source.commit !== expectedCommit) {
    throw new TypeError(`Axie manifest source commit ${value.source.commit} does not match ${expectedCommit}.`);
  }
  if (!record(value.assets) || !record(value.creator)) {
    throw new TypeError('Axie manifest is missing assets or creator catalogs.');
  }
  if (!record(value.source.finalUnityParity) || !record(value.source.finalUnityStandardParity)) {
    throw new TypeError('Axie manifest is missing its final art-team source provenance.');
  }
  const expected = Object.freeze({ bodies: 8, parts: 576, textures: 1088, materials: 1001, shaders: 13, addons: 46 });
  for (const [key, expectedCount] of Object.entries(expected)) {
    const actual = count(value.assets[key]);
    if (actual !== expectedCount) throw new TypeError(`Axie manifest expected ${expectedCount} ${key}; received ${actual}.`);
  }
  if (!Array.isArray(value.creator.colorVariants) || value.creator.colorVariants.length !== 67) {
    throw new TypeError('Axie manifest must expose all 67 source color variants.');
  }
  if (!Array.isArray(value.creator.bodyIds) || value.creator.bodyIds.length !== 8) {
    throw new TypeError('Axie manifest must expose all eight source bodies.');
  }
  const creatorBodyIds = bodyIds(value.creator.bodyIds, 'Axie creator bodyIds');
  if (AXIE_BODY_TYPES.some((bodyId) => !creatorBodyIds.includes(bodyId))) {
    throw new TypeError('Axie manifest must expose each canonical source body exactly once.');
  }
  validateAnimationCatalog(value.assets);
  validateWeaponCatalog(value.assets);
  validateLatestUnityWeaponParity(value.source.latestUnityWeaponParity, value.assets.weapons as Record<string, unknown>);
}

export async function loadAxieManifest(options: LoadAxieManifestOptions = {}) {
  const locator = createAxieAssetLocator(options);
  const url = options.manifestUrl ?? locator.manifestUrl;
  const response = await (options.fetcher ?? fetch)(url, { signal: options.signal });
  if (!response.ok) throw new Error(`Could not load Axie manifest ${url}: HTTP ${response.status}.`);
  const manifest: unknown = await response.json();
  validateAxieMixerManifest(manifest, options);
  return manifest;
}

/** High-level, relocation-safe production constructor for normal consumers. */
export async function createAxieMixer3D(options: CreateAxieMixer3DOptions = {}) {
  const locator = createAxieAssetLocator(options);
  const manifest = options.manifest ?? await loadAxieManifest({ ...options, manifestUrl: options.manifestUrl ?? locator.manifestUrl });
  validateAxieMixerManifest(manifest, options);
  const fetcher = options.fetcher ?? fetch;
  const animationLoader = new SampledAnimationJsonLoader({
    resolveUrl: locator.resolve,
    fetchJson: async (url, signal) => {
      const response = await fetcher(url, { signal });
      if (!response.ok) throw new Error(`Could not load Axie animation ${url}: HTTP ${response.status}.`);
      return response.json() as Promise<unknown>;
    },
    fetchArrayBuffer: async (url, signal) => {
      const response = await fetcher(url, { signal });
      if (!response.ok) throw new Error(`Could not load Axie animation ${url}: HTTP ${response.status}.`);
      return response.arrayBuffer();
    },
    onDiagnostic: options.onDiagnostic,
  });
  return new ThreeAxieMixer3D({
    manifest,
    genes: options.genes,
    planBuilder: options.planBuilder,
    assetStore: options.assetStore,
    materialFactory: options.materialFactory,
    addons: options.addons,
    assembler: options.assembler,
    onDiagnostic: options.onDiagnostic,
    disposeSuppliedAssetStore: options.disposeSuppliedAssetStore,
    registerAsDefaultCharacterFactory: options.registerAsDefaultCharacterFactory ?? false,
    animationLoader,
    assetStoreOptions: {
      renderer: options.renderer,
      fetcher: (url) => fetcher(url),
      maxUnusedEntries: options.maxUnusedEntries,
      preferRawUnityS3tc: options.preferRawUnityS3tc,
      resolveUrl: locator.resolve,
      onDiagnostic: options.onDiagnostic,
    },
  });
}
