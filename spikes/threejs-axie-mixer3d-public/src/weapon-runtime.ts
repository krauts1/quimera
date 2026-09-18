import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { AxieDiagnosticEvent } from './diagnostics';
import type { AxieBodyType } from './domain';
import type {
  AxieMixerManifest,
  AxieWeaponManifest,
  AxieWeaponPairedAnimationState,
  AxieWeaponVariantManifest,
} from './manifest';
import type {
  AxieAssetLease,
  AxieAssetStore,
  AxieLoadedGlb,
  AxiePairedWeaponAnimationInspection,
  AxiePlayableAnchors,
  AxieWeaponCapability,
} from './runtime';

export interface AxieWeaponRuntimeOptions {
  readonly manifest: AxieMixerManifest;
  readonly assets: AxieAssetStore;
  readonly anchors: AxiePlayableAnchors;
  readonly body: AxieBodyType;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly onStateChange?: () => void;
}

type WeaponSide = 'left' | 'right';
const WEAPON_SIDE_ORDER = Object.freeze(['right', 'left'] as const);

interface SourceWeaponContract {
  readonly sampleOrder?: number;
  readonly sides: readonly WeaponSide[];
  readonly mirrorLeft: boolean;
}

/** Exact `AnimatorSample.weaponPrefabs` order and `CreateWeapon` cardinality. */
const UNITY_SAMPLE_WEAPONS = Object.freeze({
  Axe: Object.freeze({ sampleOrder: 0, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Bow: Object.freeze({ sampleOrder: 1, sides: Object.freeze(['left'] as const), mirrorLeft: false }),
  Cannon: Object.freeze({ sampleOrder: 2, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Flag: Object.freeze({ sampleOrder: 3, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Gauntlet: Object.freeze({ sampleOrder: 4, sides: WEAPON_SIDE_ORDER, mirrorLeft: true }),
  Mala: Object.freeze({ sampleOrder: 5, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Staff: Object.freeze({ sampleOrder: 6, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Sword: Object.freeze({ sampleOrder: 7, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
  Tome: Object.freeze({ sampleOrder: 8, sides: Object.freeze(['right'] as const), mirrorLeft: false }),
} satisfies Readonly<Record<string, SourceWeaponContract>>);

const UNITY_SAMPLE_CLIP_STATES = Object.freeze(['Idle', 'Walk', 'Run', 'Attack', 'Skill'] as const);

function unitySampleContract(weapon: AxieWeaponManifest) {
  const declared = UNITY_SAMPLE_WEAPONS[weapon.id as keyof typeof UNITY_SAMPLE_WEAPONS];
  if (!declared
    || weapon.sourceKind !== 'unity-sample-rig'
    || weapon.sampleOrder !== declared.sampleOrder
    || weapon.animationPrefix !== weapon.id
    || weapon.locomotionStyle !== 'controller') return undefined;
  const expectedAttach = declared.sides.length === 2 ? 'both' : declared.sides[0];
  if (weapon.attach !== expectedAttach || weapon.mirrorLeft !== declared.mirrorLeft) return undefined;
  return declared;
}

function sourceWeaponContract(weapon: AxieWeaponManifest): SourceWeaponContract | undefined {
  const sample = unitySampleContract(weapon);
  if (sample) return sample;
  if (weapon.id in UNITY_SAMPLE_WEAPONS) return undefined;
  if (
    weapon.animationPrefix !== weapon.id
    || weapon.locomotionStyle !== 'controller'
    || !weapon.clipPrefixes.some((prefix) => prefix === `${weapon.id}.`)
  ) return undefined;
  return {
    sides: weapon.attach === 'both'
      ? WEAPON_SIDE_ORDER
      : Object.freeze([weapon.attach] as const),
    mirrorLeft: weapon.mirrorLeft,
  };
}

function expectedAnchorName(side: WeaponSide) {
  return side === 'left' ? 'Root_Weapon_L_JNT' : 'Root_Weapon_R_JNT';
}

function anchorForSide(anchors: AxiePlayableAnchors, side: WeaponSide) {
  return side === 'left' ? anchors.leftWeapon : anchors.rightWeapon;
}

function lastMatchingAnchor(root: THREE.Object3D, side: WeaponSide) {
  const expectedName = expectedAnchorName(side);
  let match: THREE.Object3D | undefined;
  root.traverse((node) => {
    if (node.name === expectedName) match = node;
  });
  return match;
}

/** Mirrors `AxieFactory.CollectAttachPoints`: later exact matches overwrite earlier ones. */
function collectWeaponAnchors(anchors: AxiePlayableAnchors): AxiePlayableAnchors {
  const root = anchors.cameraTarget.parent
    ?? anchors.leftWeapon?.parent
    ?? anchors.rightWeapon?.parent;
  if (!root) return anchors;
  return {
    cameraTarget: anchors.cameraTarget,
    leftWeapon: lastMatchingAnchor(root, 'left') ?? anchors.leftWeapon,
    rightWeapon: lastMatchingAnchor(root, 'right') ?? anchors.rightWeapon,
  };
}

function familyInstanceSides(weapon: AxieWeaponManifest): readonly WeaponSide[] {
  return sourceWeaponContract(weapon)?.sides ?? Object.freeze([]);
}

function unavailableReason(
  weapon: AxieWeaponManifest,
  anchors: AxiePlayableAnchors,
  body: AxieBodyType,
) {
  const contract = sourceWeaponContract(weapon);
  if (!contract) return `No exact source-authored runtime contract for ${weapon.id}`;
  if (!weapon.supportedBodyIds.includes(body)) {
    return `No exact ${weapon.id} source clips for ${body}`;
  }
  const missing = contract.sides.filter((side) => !anchorForSide(anchors, side));
  if (missing.length > 0) return `Missing ${missing.join(' + ')} weapon anchor`;
  const invalid = contract.sides.filter((side) => (
    anchorForSide(anchors, side)?.name !== expectedAnchorName(side)
  ));
  if (invalid.length > 0) {
    return `Expected exact ${invalid.map(expectedAnchorName).join(' + ')} weapon anchor`;
  }
  return undefined;
}

function configureInstance(
  source: THREE.Group,
  weapon: AxieWeaponManifest,
  side: WeaponSide,
) {
  const instance = cloneSkeleton(source) as THREE.Group;
  instance.name = `AxieWeapon:${weapon.id}:${side}`;
  // AnimatorSample.CreateWeapon calls Instantiate(prefab, attachPoint), which
  // gives the prefab root local identity. The shipping weapon GLBs have their
  // FBX centimeter bridge baked offline. Only Gauntlet's authored left copy
  // receives localScale (1, 1, -1).
  const mirrored = side === 'left' && sourceWeaponContract(weapon)?.mirrorLeft === true;
  instance.position.set(0, 0, 0);
  instance.quaternion.identity();
  instance.scale.set(1, 1, mirrored ? -1 : 1);
  instance.updateMatrix();
  instance.userData.axieWeaponId = weapon.id;
  instance.userData.axieWeaponSide = side;
  instance.userData.axieWeaponMirrorLeft = mirrored;
  return instance;
}

interface ResolvedWeaponSelection {
  readonly capability: AxieWeaponCapability;
  readonly selectionId: string;
  readonly variant?: AxieWeaponVariantManifest;
  readonly url: string;
  readonly key: string;
}

interface IndexedWeaponVariant {
  readonly capability: AxieWeaponCapability;
  readonly variant: AxieWeaponVariantManifest;
}

export interface AxiePairedWeaponAnimationOptions {
  readonly transition?: number;
  readonly timeScale?: number;
  readonly restart?: boolean;
}

/** Character-owned, abort-safe equivalent of `AnimatorSample.EquipWeapon`. */
export class AxieWeaponRuntime {
  readonly capabilities: readonly AxieWeaponCapability[];
  readonly #assets: AxieAssetStore;
  readonly #anchors: AxiePlayableAnchors;
  readonly #body: AxieBodyType;
  readonly #byId = new Map<string, AxieWeaponCapability>();
  readonly #variantsById = new Map<string, IndexedWeaponVariant>();
  readonly #onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly #onStateChange?: () => void;
  #lease?: AxieAssetLease<AxieLoadedGlb>;
  #animationLeases: AxieAssetLease<AxieLoadedGlb>[] = [];
  #instances: THREE.Group[] = [];
  #animationMixers: THREE.AnimationMixer[] = [];
  #pairedClips = new Map<AxieWeaponPairedAnimationState, THREE.AnimationClip>();
  #pairedActions: THREE.AnimationAction[] = [];
  #pairedState?: AxieWeaponPairedAnimationState;
  #active?: string;
  #activeSelection?: string;
  #activeKey?: string;
  #loading?: string;
  #loadingSelection?: string;
  #loadingKey?: string;
  #loadingPromise?: Promise<boolean>;
  #generation = 0;
  #disposed = false;

  constructor(options: AxieWeaponRuntimeOptions) {
    const anchors = collectWeaponAnchors(options.anchors);
    this.#assets = options.assets;
    this.#anchors = anchors;
    this.#body = options.body;
    this.#onDiagnostic = options.onDiagnostic;
    this.#onStateChange = options.onStateChange;
    this.capabilities = Object.values(options.manifest.assets.weapons)
      .sort((a, b) => {
        const aOrder = a.sampleOrder ?? Number.MAX_SAFE_INTEGER;
        const bOrder = b.sampleOrder ?? Number.MAX_SAFE_INTEGER;
        return aOrder - bOrder || a.label.localeCompare(b.label);
      })
      .map((weapon) => {
        const reason = unavailableReason(weapon, anchors, options.body);
        return Object.freeze({
          id: weapon.id,
          label: weapon.label,
          manifest: weapon,
          available: reason === undefined,
          ...(reason ? { unavailableReason: reason } : {}),
        });
      });
    this.capabilities.forEach((capability) => {
      this.#byId.set(capability.id, capability);
      (capability.manifest.variants ?? []).forEach((variant) => {
        this.#variantsById.set(variant.id, { capability, variant });
      });
    });
  }

  get active() { return this.#active; }
  get activeSelection() { return this.#activeSelection; }
  get loading() { return this.#loading; }
  get loadingSelection() { return this.#loadingSelection; }

  inspectPairedAnimation(): AxiePairedWeaponAnimationInspection {
    const clip = this.#pairedState ? this.#pairedClips.get(this.#pairedState) : undefined;
    const source = this.#active && this.#pairedState
      ? this.#byId.get(this.#active)?.manifest.pairedAnimations?.clips[this.#pairedState]
      : undefined;
    const action = this.#pairedActions[0];
    const requiredBones = source?.requiredBones ?? Object.freeze([]);
    const bones = this.#instances.flatMap((instance) => {
      const side = instance.userData.axieWeaponSide;
      const normalizedSide = side === 'left' || side === 'right' ? side : '';
      return requiredBones.flatMap((name) => {
        const bone = instance.getObjectByName(name);
        if (!bone) return [];
        return [Object.freeze({
          side: normalizedSide,
          name,
          position: Object.freeze(bone.position.toArray()) as readonly [number, number, number],
          quaternion: Object.freeze(bone.quaternion.toArray()) as readonly [number, number, number, number],
          scale: Object.freeze(bone.scale.toArray()) as readonly [number, number, number],
        })];
      });
    });
    return Object.freeze({
      family: this.#active,
      selection: this.#activeSelection,
      paired: this.#pairedClips.size > 0,
      state: this.#pairedState,
      clipName: clip?.name,
      duration: clip?.duration,
      time: action?.time,
      timeScale: action?.getEffectiveTimeScale(),
      looping: source?.looping,
      mixerCount: this.#animationMixers.length,
      instanceCount: this.#instances.length,
      bones: Object.freeze(bones),
    });
  }

  capability(id: string) {
    return this.#byId.get(id);
  }

  capabilityForSelection(id: string) {
    return this.#byId.get(id) ?? this.#variantsById.get(id)?.capability;
  }

  isSelectionAvailable(weaponId: string) {
    return this.#resolveSelection(weaponId) !== undefined;
  }

  isActiveSelection(weaponId: string) {
    const resolved = this.#resolveSelection(weaponId);
    return resolved !== undefined && resolved.key === this.#activeKey;
  }

  isLoadingSelection(weaponId: string) {
    const resolved = this.#resolveSelection(weaponId);
    return resolved !== undefined && resolved.key === this.#loadingKey;
  }

  weaponForClip(name: string) {
    const separator = name.indexOf('.');
    if (separator <= 0 || separator !== name.lastIndexOf('.')) return undefined;
    const family = name.slice(0, separator);
    const state = name.slice(separator + 1);
    if (!(UNITY_SAMPLE_CLIP_STATES as readonly string[]).includes(state)) return undefined;
    const capability = this.capability(family);
    return capability?.id === family && sourceWeaponContract(capability.manifest) ? capability : undefined;
  }

  locomotionName(id: string, state: 'Idle' | 'Walk' | 'Run') {
    const capability = this.capability(id);
    if (!capability?.available || !sourceWeaponContract(capability.manifest)) return undefined;
    return `${capability.id}.${state}`;
  }

  /**
   * Starts the exact weapon-local clip paired with the body semantic state.
   * Families without a source-authored weapon Animator deliberately return
   * false and retain their source behavior as rigid socket children.
   */
  playPairedAnimation(
    state: AxieWeaponPairedAnimationState,
    options: AxiePairedWeaponAnimationOptions = {},
  ) {
    if (this.#disposed || this.#animationMixers.length === 0) return false;
    const clip = this.#pairedClips.get(state);
    if (!clip) return false;
    const transition = Math.max(0, options.transition ?? 0);
    const timeScale = options.timeScale ?? 1;
    if (!Number.isFinite(timeScale)) return false;
    const restart = options.restart ?? state !== this.#pairedState;
    const continuing = state === this.#pairedState && !restart;
    if (continuing && this.#pairedActions.length === this.#animationMixers.length) {
      this.#pairedActions.forEach((action) => action.setEffectiveTimeScale(timeScale));
      return true;
    }

    const previous = this.#pairedActions;
    const looping = state === 'Idle' || state === 'Walk' || state === 'Run';
    const next = this.#animationMixers.map((mixer) => {
      const action = mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = !looping;
      action.setLoop(looping ? THREE.LoopRepeat : THREE.LoopOnce, looping ? Infinity : 1);
      action.setEffectiveTimeScale(timeScale);
      action.setEffectiveWeight(1);
      if (restart) action.reset();
      action.play();
      if (transition > 0) action.fadeIn(transition);
      return action;
    });
    previous.forEach((action) => {
      if (next.includes(action)) return;
      if (transition > 0) action.fadeOut(transition);
      else action.stop();
    });
    this.#pairedActions = next;
    this.#pairedState = state;
    return true;
  }

  update(deltaSeconds: number) {
    if (
      this.#disposed
      || !Number.isFinite(deltaSeconds)
      || deltaSeconds <= 0
    ) return;
    this.#animationMixers.forEach((mixer) => mixer.update(deltaSeconds));
  }

  async equip(weaponId?: string | null) {
    if (this.#disposed) return false;
    if (weaponId == null || weaponId === '') {
      const generation = ++this.#generation;
      this.#loading = undefined;
      this.#loadingSelection = undefined;
      this.#loadingKey = undefined;
      this.#loadingPromise = undefined;
      this.#clearActive();
      this.#notify();
      await Promise.resolve();
      return !this.#disposed
        && generation === this.#generation
        && this.#activeKey === undefined
        && this.#loadingKey === undefined;
    }
    if (typeof weaponId !== 'string') {
      this.#emit('warning', 'weapon-missing', 'An Axie weapon selection requires a family or variant string.', '');
      return false;
    }
    const capability = this.capabilityForSelection(weaponId);
    if (!capability) {
      this.#emit('warning', 'weapon-missing', `Unknown Axie weapon ${weaponId}.`, weaponId);
      return false;
    }
    if (!capability.available) {
      this.#emit(
        'warning',
        capability.unavailableReason?.startsWith('Missing')
          ? 'weapon-anchor-missing'
          : 'animation-missing',
        `Cannot equip ${capability.id}: ${capability.unavailableReason}.`,
        capability.id,
      );
      return false;
    }
    const resolved = this.#resolveSelection(weaponId);
    if (!resolved) {
      const indexedVariant = this.#variantsById.get(weaponId);
      const reason = indexedVariant && !indexedVariant.variant.supportedBodyIds.includes(this.#body)
        ? `No exact ${indexedVariant.capability.id} source clips for ${this.#body}`
        : `No exact source-authored runtime selection for ${weaponId}`;
      this.#emit('warning', 'animation-missing', `Cannot equip ${weaponId}: ${reason}.`, weaponId);
      return false;
    }
    const attachmentFailure = this.#selectionAttachmentFailure(resolved);
    if (attachmentFailure) {
      this.#emit(
        'error',
        attachmentFailure.code,
        `Cannot equip ${capability.id}: ${attachmentFailure.message}.`,
        capability.id,
      );
      return false;
    }
    if (this.#activeKey === resolved.key && !this.#loading) {
      const generation = this.#generation;
      await Promise.resolve();
      return !this.#disposed
        && generation === this.#generation
        && this.#activeKey === resolved.key
        && this.#loadingKey === undefined;
    }
    if (this.#loadingKey === resolved.key && this.#loadingPromise) {
      const generation = this.#generation;
      const equipped = await this.#loadingPromise;
      return equipped
        && !this.#disposed
        && generation === this.#generation
        && this.#activeKey === resolved.key
        && this.#loadingKey === undefined;
    }

    const generation = ++this.#generation;
    // Unity destroys the previous prefab before creating the selected one.
    this.#clearActive();
    this.#loading = capability.id;
    this.#loadingSelection = resolved.selectionId;
    this.#loadingKey = resolved.key;
    this.#notify();
    const loadingPromise = this.#load(resolved, generation);
    this.#loadingPromise = loadingPromise;
    const equipped = await loadingPromise;
    if (this.#loadingPromise === loadingPromise) this.#loadingPromise = undefined;
    return equipped
      && !this.#disposed
      && generation === this.#generation
      && this.#activeKey === resolved.key
      && this.#loadingKey === undefined;
  }

  /** Invalidates an in-flight acquisition without unequipping a committed weapon. */
  cancelPending() {
    if (this.#disposed || !this.#loading) return false;
    this.#generation += 1;
    this.#loading = undefined;
    this.#loadingSelection = undefined;
    this.#loadingKey = undefined;
    this.#loadingPromise = undefined;
    this.#notify();
    return true;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#generation += 1;
    this.#loading = undefined;
    this.#loadingSelection = undefined;
    this.#loadingKey = undefined;
    this.#loadingPromise = undefined;
    this.#clearActive();
  }

  #selectionAttachmentFailure(selection: ResolvedWeaponSelection) {
    const sides = familyInstanceSides(selection.capability.manifest);
    const missing = sides.filter((side) => !anchorForSide(this.#anchors, side));
    if (missing.length > 0) {
      return {
        code: 'weapon-anchor-missing' as const,
        message: `Missing ${missing.join(' + ')} weapon anchor`,
      };
    }
    const invalid = sides.filter((side) => (
      anchorForSide(this.#anchors, side)?.name !== expectedAnchorName(side)
    ));
    if (invalid.length > 0) {
      return {
        code: 'weapon-anchor-missing' as const,
        message: `Expected exact ${invalid.map(expectedAnchorName).join(' + ')} weapon anchor`,
      };
    }
    return undefined;
  }

  async #load(selection: ResolvedWeaponSelection, generation: number) {
    const { capability } = selection;
    let lease: AxieAssetLease<AxieLoadedGlb> | undefined;
    let animationLeases: AxieAssetLease<AxieLoadedGlb>[] = [];
    let instances: THREE.Group[] = [];
    try {
      lease = await this.#assets.acquireGlb(selection.url);
      const paired = capability.manifest.pairedAnimations;
      if (paired) {
        const animationResults = await Promise.allSettled(
          UNITY_SAMPLE_CLIP_STATES.map((state) => (
            this.#assets.acquireGlb(paired.clips[state].url)
          )),
        );
        const acquiredAnimationLeases = animationResults.flatMap((result) => (
          result.status === 'fulfilled' ? [result.value] : []
        ));
        const failedAnimation = animationResults.find((result) => result.status === 'rejected');
        if (failedAnimation?.status === 'rejected') {
          acquiredAnimationLeases.forEach((animationLease) => animationLease.release());
          throw failedAnimation.reason;
        }
        animationLeases = acquiredAnimationLeases;
      }
      if (this.#disposed || generation !== this.#generation) {
        lease.release();
        animationLeases.forEach((animationLease) => animationLease.release());
        return false;
      }
      instances = familyInstanceSides(capability.manifest).map((side) => {
        const anchor = anchorForSide(this.#anchors, side);
        if (!anchor) throw new Error(`${side} weapon anchor disappeared during equip`);
        const instance = configureInstance(lease!.value.scene, capability.manifest, side);
        anchor.add(instance);
        return instance;
      });
      const clips = new Map<AxieWeaponPairedAnimationState, THREE.AnimationClip>();
      if (paired) {
        UNITY_SAMPLE_CLIP_STATES.forEach((state, index) => {
          const source = paired.clips[state];
          const animations = animationLeases[index].value.animations;
          if (animations.length !== 1) {
            throw new Error(`${capability.id}.${state} expected one weapon-local clip`);
          }
          const clip = animations[0];
          if (
            clip.name !== `${capability.id}.${state}`
            || Math.abs(clip.duration - source.duration) > 1e-5
          ) {
            throw new Error(`${capability.id}.${state} does not match its source manifest`);
          }
          const missingBones = source.requiredBones.filter((boneName) => (
            instances.some((instance) => instance.getObjectByName(boneName) === undefined)
          ));
          if (missingBones.length > 0) {
            throw new Error(
              `${capability.id}.${state} requires missing bones ${missingBones.join(', ')}`,
            );
          }
          clips.set(state, clip);
        });
      }
      this.#lease = lease;
      this.#animationLeases = animationLeases;
      this.#instances = instances;
      this.#animationMixers = paired
        ? instances.map((instance) => new THREE.AnimationMixer(instance))
        : [];
      instances.forEach((instance) => {
        if (paired) instance.userData.axieWeaponPairedAnimator = true;
      });
      this.#pairedClips = clips;
      this.#active = capability.id;
      this.#activeSelection = selection.selectionId;
      this.#activeKey = selection.key;
      this.#loading = undefined;
      this.#loadingSelection = undefined;
      this.#loadingKey = undefined;
      this.#notify();
      return true;
    } catch (error) {
      instances.forEach((instance) => instance.removeFromParent());
      lease?.release();
      animationLeases.forEach((animationLease) => animationLease.release());
      if (generation === this.#generation) {
        this.#loading = undefined;
        this.#loadingSelection = undefined;
        this.#loadingKey = undefined;
        this.#emit(
          'error',
          'weapon-load-failed',
          `Failed to equip ${capability.id}: ${error instanceof Error ? error.message : String(error)}.`,
          capability.id,
        );
        this.#notify();
      }
      return false;
    }
  }

  #clearActive() {
    this.#pairedActions.forEach((action) => action.stop());
    this.#pairedActions = [];
    this.#pairedState = undefined;
    this.#animationMixers.forEach((mixer, index) => {
      mixer.stopAllAction();
      this.#pairedClips.forEach((clip) => mixer.uncacheClip(clip));
      const instance = this.#instances[index];
      if (instance) mixer.uncacheRoot(instance);
    });
    this.#animationMixers = [];
    this.#pairedClips.clear();
    this.#instances.forEach((instance) => instance.removeFromParent());
    this.#instances = [];
    this.#animationLeases.forEach((lease) => lease.release());
    this.#animationLeases = [];
    this.#lease?.release();
    this.#lease = undefined;
    this.#active = undefined;
    this.#activeSelection = undefined;
    this.#activeKey = undefined;
  }

  #resolveSelection(weaponId: string): ResolvedWeaponSelection | undefined {
    if (typeof weaponId !== 'string' || weaponId === '') return undefined;
    const capability = this.capability(weaponId);
    if (capability?.available) {
      const indexedDefault = this.#variantsById.get(capability.manifest.defaultVariantId);
      if (
        !indexedDefault?.capability.available
        || !indexedDefault.variant.supportedBodyIds.includes(this.#body)
        || !sourceWeaponContract(indexedDefault.capability.manifest)
      ) return undefined;
      return {
        capability,
        selectionId: indexedDefault.variant.id,
        variant: indexedDefault.variant,
        url: indexedDefault.variant.url,
        key: `variant:${indexedDefault.variant.id}`,
      };
    }
    const indexed = this.#variantsById.get(weaponId);
    if (
      !indexed?.capability.available
      || !indexed.variant.supportedBodyIds.includes(this.#body)
      || !sourceWeaponContract(indexed.capability.manifest)
    ) return undefined;
    return {
      capability: indexed.capability,
      selectionId: indexed.variant.id,
      variant: indexed.variant,
      url: indexed.variant.url,
      key: `variant:${indexed.variant.id}`,
    };
  }

  #notify() {
    this.#onStateChange?.();
  }

  #emit(
    severity: AxieDiagnosticEvent['severity'],
    code: AxieDiagnosticEvent['code'],
    message: string,
    assetId: string,
  ) {
    this.#onDiagnostic?.({ severity, code, message, assetId });
  }
}
