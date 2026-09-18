import type {
  AddonParticleResetOptions,
} from './mystic-types';
import type {
  AnimationClip,
  Group,
  Material,
  Object3D,
  Texture,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type {
  AxieAvatarRenderOptions,
  AxieAvatarRenderResult,
} from './avatar';
import type {
  AxieDecodedGenes,
  AxieDescriptor,
  AxieGenesDecoder,
  AxiePartAssetId,
  AxiePartType,
  AxieRigType,
} from './domain';
import type {
  AxieAnimationSet,
  AxieBodyAssetManifest,
  AxieLodManifest,
  AxieMaterialManifest,
  AxieMixerManifest,
  AxiePartRigManifest,
  AxieTextureManifest,
  AxieWeaponManifest,
  AxieWeaponPairedAnimationState,
} from './manifest';
import type { AxieQualityId, AxieQualityProfile } from './quality';
import type {
  AxieAssemblyDiagnostics,
  AxieCacheDiagnostics,
  AxieDiagnosticEvent,
} from './diagnostics';
import type {
  AxieIdInput,
  AxieLookup,
  AxieResolver,
} from './axie-id';

export const AXIE_SOURCE_ART_MODE = 'faithful' as const;
export type AxieSourceArtMode = typeof AXIE_SOURCE_ART_MODE;
export type AxieWebExtensionArtMode = 'enhanced';
export type AxieArtMode = AxieSourceArtMode | AxieWebExtensionArtMode;
export type AxieLocomotion = 'idle' | 'walk' | 'run' | 'air';
export type AxieLoadStage =
  | 'manifest'
  | 'plan'
  | 'body'
  | 'parts'
  | 'textures'
  | 'materials'
  | 'addons'
  | 'animations'
  | 'finalize';

export interface AxieLoadProgress {
  readonly stage: AxieLoadStage;
  readonly completed: number;
  readonly total: number;
  readonly assetId?: string;
}

export interface AxieMixRequest {
  readonly descriptor: AxieDescriptor;
  readonly quality: AxieQualityId | AxieQualityProfile;
  /** Explicit browser extension. Source-compatible entry points use faithful. */
  readonly artMode?: AxieArtMode;
  /** Browser extension: fail instead of retaining Unity's log-and-continue behavior. */
  readonly strict?: boolean;
  /** Browser playback preference; Unity retains both dictionaries on the character. */
  readonly animationSet?: AxieAnimationSet;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: AxieLoadProgress) => void;
}

/**
 * Browser-only policy knobs. Omitting this object gives the serialized
 * AxieFactory defaults: Unity quality, faithful art, non-strict loading, and
 * the profile's full animation playback set.
 */
export interface AxieWebMixExtensions {
  readonly quality?: AxieQualityId | AxieQualityProfile;
  readonly artMode?: AxieArtMode;
  readonly strict?: boolean;
  readonly animationSet?: AxieAnimationSet;
}

/** Public mixer request; legacy top-level policy fields remain accepted. */
export interface AxieCreateRequest extends Omit<
  AxieMixRequest,
  'quality' | 'artMode' | 'strict' | 'animationSet'
> {
  /** @deprecated Prefer extensions.quality for an explicit browser override. */
  readonly quality?: AxieQualityId | AxieQualityProfile;
  /** @deprecated Prefer extensions.artMode for an explicit browser override. */
  readonly artMode?: AxieArtMode;
  /** @deprecated Prefer extensions.strict for an explicit browser override. */
  readonly strict?: boolean;
  /** @deprecated Prefer extensions.animationSet for an explicit browser override. */
  readonly animationSet?: AxieAnimationSet;
  readonly extensions?: AxieWebMixExtensions;
}

export interface AxieGenesMixRequest extends Omit<AxieCreateRequest, 'descriptor'> {
  readonly genes: string;
}

export interface AxieIdResolveRequest {
  readonly axieId: AxieIdInput;
  readonly resolver?: AxieResolver;
  readonly signal?: AbortSignal;
}

export interface AxieIdMixRequest extends Omit<AxieCreateRequest, 'descriptor'> {
  readonly axieId: AxieIdInput;
  /** Overrides the mixer-level resolver for this request only. */
  readonly resolver?: AxieResolver;
}

export interface AxieResolvedLod {
  readonly requestedLod: number;
  readonly resolvedLod: number;
  readonly asset: AxieLodManifest;
}

export interface AxieResolvedPartRig {
  readonly partId: AxiePartAssetId;
  readonly partType: AxiePartType;
  readonly rigType: AxieRigType;
  readonly attachNode: string;
  readonly rig: AxiePartRigManifest;
  readonly lod: AxieResolvedLod;
  readonly materialId: string;
  readonly addonId?: string;
}

export interface AxieMixPlan {
  readonly key: string;
  readonly descriptor: AxieDescriptor;
  readonly quality: AxieQualityProfile;
  readonly animationSet: AxieAnimationSet;
  readonly body: AxieBodyAssetManifest;
  readonly bodyLod: AxieResolvedLod;
  readonly partRigs: readonly AxieResolvedPartRig[];
  readonly missingParts: readonly AxiePartAssetId[];
  readonly warnings: readonly AxieDiagnosticEvent[];
}

export interface AxiePlanBuilder {
  build(manifest: AxieMixerManifest, request: AxieMixRequest): AxieMixPlan;
}

export interface AxieLoadedGlb {
  readonly scene: Group;
  readonly animations: readonly AnimationClip[];
}

export interface AxieAssetLease<T> {
  readonly key: string;
  readonly value: T;
  readonly released: boolean;
  release(): void;
}

/**
 * Shared, reference-counted cache. Acquired source objects are immutable; callers
 * clone scene instances before attaching them to a character.
 */
export interface AxieAssetStore {
  acquireGlb(url: string, signal?: AbortSignal): Promise<AxieAssetLease<AxieLoadedGlb>>;
  acquireTexture(
    texture: AxieTextureManifest,
    quality: AxieQualityProfile,
    signal?: AbortSignal,
  ): Promise<AxieAssetLease<Texture>>;
  diagnostics(): AxieCacheDiagnostics;
  evictUnused(maxEntries?: number): void;
  dispose(): void;
}

export interface AxieMaterialContext {
  readonly manifest: AxieMixerManifest;
  readonly material: AxieMaterialManifest;
  readonly textures: Readonly<Record<string, Texture>>;
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly quality: AxieQualityProfile;
  readonly artMode: AxieArtMode;
}

export interface AxieMaterialFactory {
  create(context: AxieMaterialContext): Material;
  /** Creates the Unity front-cull normal-extrusion outline for authored materials. */
  createGeometryOutline(context: AxieMaterialContext): Material | undefined;
}

/** Character-owned component runtime, currently used by Mystic add-on prefabs. */
export interface AxieAssemblyAddonRuntime {
  readonly id: string;
  readonly object: Object3D;
  resetParticles(options?: AddonParticleResetOptions): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface AxieAssemblyResult {
  readonly wrapper: Group;
  readonly model: Group;
  readonly clips: readonly AnimationClip[];
  /** Both Unity body-data animation dictionaries, compiled against this instance. */
  readonly clipSets: Readonly<Record<AxieAnimationSet, readonly AnimationClip[]>>;
  readonly leases: readonly AxieAssetLease<unknown>[];
  readonly ownedMaterials: readonly Material[];
  readonly addonRuntimes: readonly AxieAssemblyAddonRuntime[];
  /** Lazy production hook backed by setMysticMaterialTime. */
  readonly setMysticMaterialTime?: (root: Object3D, seconds: number) => number;
  readonly diagnostics: AxieAssemblyDiagnostics;
}

/** Source parameters that affect renderer material identity during assembly. */
export interface AxieAssemblyCompatibilityOptions {
  readonly useMaterialPropertyBlocks: boolean;
}

export interface AxieAssembler {
  assemble(
    plan: AxieMixPlan,
    request: AxieMixRequest,
    compatibility?: AxieAssemblyCompatibilityOptions,
  ): Promise<AxieAssemblyResult>;
  /** Drops loader-owned immutable payload caches; live character clips remain valid. */
  clearCache?(): void;
}

export interface AxieAnimationCapabilities {
  readonly set: AxieAnimationSet;
  readonly names: readonly string[];
  readonly clips: readonly AxieAnimationDescriptor[];
  readonly hasIdle: boolean;
  readonly hasWalk: boolean;
  readonly hasRun: boolean;
  readonly hasStun: boolean;
  readonly hasDead: boolean;
  readonly weaponPrefixes: readonly string[];
}

export interface AxieAnimationDescriptor {
  /** Unity source clip name accepted by playAnimation(). */
  readonly name: string;
  readonly runtimeName: string;
  readonly group: string;
  readonly duration: number;
  readonly looping: boolean;
}

export interface AxiePlayableAnchors {
  readonly cameraTarget: Object3D;
  readonly leftWeapon?: Object3D;
  readonly rightWeapon?: Object3D;
}

export interface AxieCollisionShape {
  readonly type: 'capsule';
  readonly radius: number;
  readonly height: number;
  readonly centerY: number;
}

export interface AxieAnimationPlayOptions {
  readonly transition?: number;
  readonly loop?: boolean;
  readonly timeScale?: number;
  readonly restart?: boolean;
  /** Hold this full-body action while movement continues; one-shots release on finish. */
  readonly lockLocomotion?: boolean;
}

/** Exporter-shaped source event retained on an Axie animation clip. */
export interface AxieAnimationCueSourceEvent {
  readonly time: number;
  readonly functionName: string;
  readonly stringParameter: string;
  readonly floatParameter: number;
  readonly intParameter: number;
  readonly objectParameterId: string;
}

/**
 * Renderer-agnostic notification emitted when playback crosses an authored
 * animation event. Consumers decide whether it drives VFX, SFX, camera,
 * hitstop, UI, or a gameplay request; the mixer never applies damage itself.
 */
export interface AxieAnimationCue {
  readonly sourceName: string;
  readonly runtimeName: string;
  readonly clipDuration: number;
  readonly clipTime: number;
  /** Zero-based playback pass. Repeating clips increment this after each wrap. */
  readonly loop: number;
  /** Stable source-array position, including when several cues share a time. */
  readonly eventIndex: number;
  readonly sourceEvent: AxieAnimationCueSourceEvent;
  /** JSON-decoded stringParameter when possible; otherwise undefined. */
  readonly payload: unknown;
}

export type AxieAnimationCueListener = (cue: AxieAnimationCue) => void;

export interface AxieWeaponCapability {
  readonly id: string;
  readonly label: string;
  readonly manifest: AxieWeaponManifest;
  readonly available: boolean;
  readonly unavailableReason?: string;
}

export interface AxiePairedWeaponBoneTransformInspection {
  readonly side: 'left' | 'right' | '';
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

/**
 * Immutable browser/headless proof of the optional source-authored weapon
 * animator. It deliberately exposes values, never mixers, actions, or nodes.
 */
export interface AxiePairedWeaponAnimationInspection {
  readonly family: string | undefined;
  readonly selection: string | undefined;
  readonly paired: boolean;
  readonly state: AxieWeaponPairedAnimationState | undefined;
  readonly clipName: string | undefined;
  readonly duration: number | undefined;
  readonly time: number | undefined;
  readonly timeScale: number | undefined;
  readonly looping: boolean | undefined;
  readonly mixerCount: number;
  readonly instanceCount: number;
  readonly bones: readonly AxiePairedWeaponBoneTransformInspection[];
}

/** Adapter consumed by the playground's player/camera loop. */
export interface AxiePlayableCharacter {
  readonly kind: 'axie';
  readonly key: string;
  readonly descriptor: AxieDescriptor;
  readonly wrapper: Group;
  readonly model: Group;
  readonly quality: AxieQualityProfile;
  readonly animations: AxieAnimationCapabilities;
  /** Read-only source-order snapshot of the lite animation dictionary keys. */
  readonly animationNames: readonly string[];
  readonly anchors: AxiePlayableAnchors;
  readonly collision: AxieCollisionShape;
  readonly diagnostics: AxieAssemblyDiagnostics;
  readonly disposed: boolean;
  readonly activeAnimation: string | undefined;
  readonly animationOverrideActive: boolean;
  readonly weapons: readonly AxieWeaponCapability[];
  /** Active source family, used to resolve the paired Axie animation prefix. */
  readonly activeWeapon: string | undefined;
  /** Exact equipped family or variant selection id. */
  readonly activeWeaponSelection: string | undefined;
  readonly weaponLoading: string | undefined;
  /** Exact family or variant selection id currently being acquired. */
  readonly weaponLoadingSelection: string | undefined;
  /** Read-only proof of a separate paired weapon animator and its live bone pose. */
  inspectPairedWeaponAnimation(): AxiePairedWeaponAnimationInspection;
  /** Deterministic component timeline control used by parity and replay tooling. */
  resetAddonParticles(options?: AddonParticleResetOptions): void;
  /** Unity AnimatorSample Move Speed parameter, clamped to its 0..3 slider range. */
  setMoveSpeed(value: number, transition?: number): void;
  /** Convenience anchors for the source blend tree: idle=0, walk=2, run=3. */
  setLocomotion(state: AxieLocomotion, transition?: number): void;
  /**
   * Accepts an exact case-sensitive request synchronously. A weapon-prefixed
   * clip never equips a prefab and is rejected unless that family is active.
   */
  playAnimation(name: string, options?: AxieAnimationPlayOptions): boolean;
  /** Resolves queued Animator exit-time requests; it never acquires a weapon. */
  playAnimationAsync(name: string, options?: AxieAnimationPlayOptions): Promise<boolean>;
  /** Subscribe to crossed source events without transferring gameplay authority to the mixer. */
  subscribeAnimationCues(listener: AxieAnimationCueListener): () => void;
  /** Equips an exact source family or one of its declared variant ids. */
  equipWeapon(weaponId?: string | null): Promise<boolean>;
  getLiteAnimationClip(name: string): AnimationClip;
  getFullAnimationClip(name: string): AnimationClip;
  renderAvatar(
    renderer: WebGLRenderer,
    target: WebGLRenderTarget,
    options?: AxieAvatarRenderOptions,
  ): AxieAvatarRenderResult;
  resumeLocomotion(transition?: number): void;
  update(deltaSeconds: number): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}

export interface AxieMixer3D {
  readonly manifest: AxieMixerManifest;
  readonly genes: AxieGenesDecoder;
  readonly axieResolver: AxieResolver;
  plan(request: AxieCreateRequest): AxieMixPlan;
  create(request: AxieCreateRequest): Promise<AxiePlayableCharacter>;
  createFromGenes(request: AxieGenesMixRequest): Promise<AxiePlayableCharacter>;
  resolveAxieId(request: AxieIdResolveRequest): Promise<AxieLookup>;
  createFromAxieId(request: AxieIdMixRequest): Promise<AxiePlayableCharacter>;
  decodeGenes(genes: string): AxieDecodedGenes;
  cacheDiagnostics(): AxieCacheDiagnostics;
  /** Unity-compatible explicit cache clear that never invalidates active leases. */
  clearCache(): void;
  dispose(): void;
}
