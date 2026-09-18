import * as THREE from 'three';
import {
  AxieAvatarRenderParams,
  type AxieAvatarRenderOptions,
} from './avatar';
import {
  AXIE_PART_TYPES,
  type AxieBodyType,
  type AxieDescriptor,
  type AxiePartDescriptor,
} from './domain';

export const AXIE_SAMPLE_CLASSES = Object.freeze([
  'Aquatic',
  'Beast',
  'Bird',
  'Bug',
  'Plant',
  'Reptile',
] as const);

export const AXIE_SAMPLE_VARIANTS = Object.freeze([2, 4, 6, 8, 10, 12] as const);

export const AXIE_COLLECTION_CLASS_COLOR_MAP: Readonly<Record<string, number>> = Object.freeze({
  Aquatic: 14,
  Beast: 3,
  Bird: 25,
  Bug: 20,
  Plant: 9,
  Reptile: 30,
});

export interface AxieCollectionEntry {
  readonly descriptor: AxieDescriptor;
  readonly name: string;
  /** Logical six-by-six selector position. */
  readonly grid: readonly [column: number, row: number];
  /** Literal source sample position from `(2f * col, 0f, 2f * row)`. */
  readonly sourcePosition: readonly [x: number, y: number, z: number];
  readonly rotationYDegrees: 180;
  readonly animation: 'Default.Idle';
  readonly loop: true;
}

/** Deterministic browser fixture projection of Samples~/Axie Collection. */
export class AxieCollection {
  body: AxieBodyType = 'normal';
  classes: string[] = [...AXIE_SAMPLE_CLASSES];
  variants: number[] = [...AXIE_SAMPLE_VARIANTS];
  skin = 0;
  level = 1;

  BuildEntries(): AxieCollectionEntry[] {
    const entries: AxieCollectionEntry[] = [];
    this.classes.forEach((axieClass, column) => {
      const colorVariant = AXIE_COLLECTION_CLASS_COLOR_MAP[axieClass] ?? 0;
      this.variants.forEach((variant, row) => {
        const parts: AxiePartDescriptor[] = AXIE_PART_TYPES.map((type) => ({
          class: axieClass as AxiePartDescriptor['class'],
          variant,
          type,
          skin: this.skin,
          level: this.level,
        }));
        entries.push({
          descriptor: { body: this.body, colorVariant, parts },
          name: `${this.body}-${axieClass}-${variant.toString().padStart(2, '0')}`,
          grid: [column, row],
          sourcePosition: [2 * column, 0, 2 * row],
          rotationYDegrees: 180,
          animation: 'Default.Idle',
          loop: true,
        });
      });
    });
    return entries;
  }
}

export interface AxieCameraPointerInput {
  readonly rightMouseHeld: boolean;
  readonly rightMousePressed: boolean;
  readonly x: number;
  readonly y: number;
}

export interface AxieCameraEuler {
  readonly pitch: number;
  readonly yaw: number;
}

/** Source camera sample with right-button orbit and 5..75 degree pitch clamp. */
export class CameraController {
  sensitivity: [number, number] = [0.2, 0.2];
  #lastPosition: [number, number] | undefined;

  Update(input: AxieCameraPointerInput, euler: AxieCameraEuler): AxieCameraEuler {
    if (!input.rightMouseHeld) return euler;
    if (input.rightMousePressed || !this.#lastPosition) {
      this.#lastPosition = [input.x, input.y];
      return euler;
    }
    const deltaX = this.sensitivity[0] * (input.x - this.#lastPosition[0]);
    const deltaY = this.sensitivity[1] * (input.y - this.#lastPosition[1]);
    this.#lastPosition = [input.x, input.y];
    return {
      pitch: Math.min(75, Math.max(5, euler.pitch - deltaY)),
      yaw: euler.yaw + deltaX,
    };
  }
}

export interface AxieSampleAnimator {
  setFloat(name: string, value: number): void;
  setBool(name: string, value: boolean): void;
  setTrigger(name: string): void;
  runtimeAnimatorController?: unknown;
  setRuntimeAnimatorController?(controller: unknown): void;
}

export const AXIE_SAMPLE_WEAPON_NAMES = Object.freeze([
  'Axe',
  'Bow',
  'Cannon',
  'Flag',
  'Gauntlet',
  'Mala',
  'Staff',
  'Sword',
  'Tome',
] as const);

export type AxieSampleWeaponName = typeof AXIE_SAMPLE_WEAPON_NAMES[number];
export type AxieSampleCharacterKind = 'lite' | 'full';
export type AxieSampleWeaponSide = 'left' | 'right';
export type AxieSampleAnimatorTrigger = 'Attack' | 'Skill' | 'Dead' | 'Restart';
export type AxieSampleLegacyAnimationName =
  | 'Idle'
  | 'Walk'
  | 'Run'
  | 'Stun'
  | 'Dead'
  | 'Attack'
  | 'Skill';

export const AXIE_SAMPLE_LEGACY_ANIMATION_NAMES = Object.freeze([
  'Idle',
  'Walk',
  'Run',
  'Stun',
  'Dead',
] as const);

export interface AxieSampleCharacter<TClip = unknown> {
  readonly Root: unknown;
  readonly RightWeaponAttachPoint?: unknown;
  readonly LeftWeaponAttachPoint?: unknown;
  GetLiteAnimationClip(name: string): TClip;
  GetFullAnimationClip(name: string): TClip;
}

export interface AxieSampleCharacterBehaviour<TClip = unknown> {
  axieDescriptor: AxieDescriptor;
  readonly Character: AxieSampleCharacter<TClip> | null;
  Rebuild(): unknown | Promise<unknown>;
}

export interface AxieSampleWeaponRuntimeAdapter<TPrefab = unknown, TInstance = unknown> {
  instantiate(prefab: TPrefab, parent: unknown): TInstance;
  destroy(instance: TInstance): void;
  setLocalScale(instance: TInstance, x: number, y: number, z: number): void;
}

export interface AxieSampleWeaponMount<TInstance = unknown> {
  readonly instance: TInstance;
  readonly character: AxieSampleCharacterKind;
  readonly side: AxieSampleWeaponSide;
  readonly weaponName: string;
}

export class AxieSampleAnimatorOverrideController<TClip = unknown> {
  readonly overrides = new Map<string, TClip>();

  constructor(readonly runtimeAnimatorController: unknown) {}

  SetOverride(name: string, clip: TClip) {
    this.overrides.set(name, clip);
  }

  GetOverride(name: string) {
    return this.overrides.get(name);
  }
}

export interface AnimatorSampleOptions<
  TClip = unknown,
  TPrefab = unknown,
  TInstance = unknown,
> {
  readonly animatorController?: unknown;
  readonly liteCharacterBehaviour?: AxieSampleCharacterBehaviour<TClip>;
  readonly fullCharacterBehaviour?: AxieSampleCharacterBehaviour<TClip>;
  readonly weaponPrefabs?: readonly TPrefab[];
  readonly weaponRuntime?: AxieSampleWeaponRuntimeAdapter<TPrefab, TInstance>;
  readonly createAnimator?: (
    character: AxieSampleCharacter<TClip>,
    controller: AxieSampleAnimatorOverrideController<TClip>,
    kind: AxieSampleCharacterKind,
  ) => AxieSampleAnimator;
}

function buildSampleDescriptor(axieClass: AxiePartDescriptor['class'], variant: number): AxieDescriptor {
  return {
    body: 'normal',
    colorVariant: 0,
    parts: AXIE_PART_TYPES.map((type) => ({
      class: axieClass,
      variant,
      type,
      skin: 0,
      level: 1,
    })),
  };
}

function sourceWeaponName(prefab: unknown) {
  if (prefab == null || typeof prefab !== 'object') return undefined;
  const name = (prefab as { readonly name?: unknown }).name;
  return typeof name === 'string' ? name.split('_')[1] : undefined;
}

function setAnimatorController(
  animator: AxieSampleAnimator,
  controller: AxieSampleAnimatorOverrideController<unknown>,
) {
  if (animator.setRuntimeAnimatorController) animator.setRuntimeAnimatorController(controller);
  else animator.runtimeAnimatorController = controller;
}

function requiredBehaviour<TClip>(
  behaviour: AxieSampleCharacterBehaviour<TClip> | undefined,
  kind: AxieSampleCharacterKind,
) {
  if (!behaviour) throw new Error(`Animator sample requires its ${kind} character behaviour.`);
  return behaviour;
}

function requiredCharacter<TClip>(
  behaviour: AxieSampleCharacterBehaviour<TClip>,
  kind: AxieSampleCharacterKind,
) {
  if (!behaviour.Character) throw new Error(`Animator sample ${kind} character was not rebuilt.`);
  return behaviour.Character;
}

function createSourceWeaponMounts<TClip, TPrefab, TInstance>(
  prefab: TPrefab,
  weaponName: string,
  liteCharacter: AxieSampleCharacter<TClip>,
  fullCharacter: AxieSampleCharacter<TClip>,
  runtime: AxieSampleWeaponRuntimeAdapter<TPrefab, TInstance> | undefined,
) {
  if (!runtime) throw new Error('Animator sample weapon selection requires a weapon runtime adapter.');
  const mounts: AxieSampleWeaponMount<TInstance>[] = [];
  const createForCharacter = (
    character: AxieSampleCharacter<TClip>,
    kind: AxieSampleCharacterKind,
  ) => {
    if (weaponName !== 'Bow') {
      mounts.push({
        instance: runtime.instantiate(prefab, character.RightWeaponAttachPoint),
        character: kind,
        side: 'right',
        weaponName,
      });
    }
    if (weaponName === 'Bow' || weaponName === 'Gauntlet') {
      const instance = runtime.instantiate(prefab, character.LeftWeaponAttachPoint);
      mounts.push({ instance, character: kind, side: 'left', weaponName });
      if (weaponName === 'Gauntlet') runtime.setLocalScale(instance, 1, 1, -1);
    }
  };
  createForCharacter(liteCharacter, 'lite');
  createForCharacter(fullCharacter, 'full');
  return mounts;
}

/** Exact browser compatibility projection of `Samples~/Axie Animations/AnimatorSample.cs`. */
export class AnimatorSample<TClip = unknown, TPrefab = unknown, TInstance = unknown> {
  animatorController: unknown;
  liteCharacterBehaviour: AxieSampleCharacterBehaviour<TClip> | undefined;
  fullCharacterBehaviour: AxieSampleCharacterBehaviour<TClip> | undefined;
  weaponPrefabs: TPrefab[];
  moveSpeed = 0;
  stunned = false;
  axieClass: AxiePartDescriptor['class'] = AXIE_SAMPLE_CLASSES[0];
  axieVariant: number = AXIE_SAMPLE_VARIANTS[0];
  liteAnimatorController: AxieSampleAnimatorOverrideController<TClip> | undefined;
  fullAnimatorController: AxieSampleAnimatorOverrideController<TClip> | undefined;
  #currentWeaponPrefab: TPrefab | null = null;
  #weapons: AxieSampleWeaponMount<TInstance>[] = [];
  readonly #weaponRuntime: AxieSampleWeaponRuntimeAdapter<TPrefab, TInstance> | undefined;
  readonly #createAnimator: AnimatorSampleOptions<TClip, TPrefab, TInstance>['createAnimator'];

  constructor(
    public liteAnimator: AxieSampleAnimator,
    public fullAnimator: AxieSampleAnimator,
    values: AnimatorSampleOptions<TClip, TPrefab, TInstance> = {},
  ) {
    this.animatorController = values.animatorController;
    this.liteCharacterBehaviour = values.liteCharacterBehaviour;
    this.fullCharacterBehaviour = values.fullCharacterBehaviour;
    this.weaponPrefabs = [...(values.weaponPrefabs ?? [])];
    this.#weaponRuntime = values.weaponRuntime;
    this.#createAnimator = values.createAnimator;
  }

  get currentWeaponPrefab() {
    return this.#currentWeaponPrefab;
  }

  get weapons(): readonly AxieSampleWeaponMount<TInstance>[] {
    return this.#weapons;
  }

  get canUseWeaponActions() {
    return this.#weapons.length > 0;
  }

  async Start() {
    this.liteAnimatorController = new AxieSampleAnimatorOverrideController<TClip>(this.animatorController);
    this.fullAnimatorController = new AxieSampleAnimatorOverrideController<TClip>(this.animatorController);
    return this.RebuildAxie();
  }

  Update() {
    for (const animator of [this.liteAnimator, this.fullAnimator]) {
      animator.setFloat('Move Speed', this.moveSpeed);
      animator.setBool('Stunned', this.stunned);
    }
  }

  Trigger(name: AxieSampleAnimatorTrigger) {
    if ((name === 'Attack' || name === 'Skill') && !this.canUseWeaponActions) return false;
    this.liteAnimator.setTrigger(name);
    this.fullAnimator.setTrigger(name);
    return true;
  }

  Attack() {
    return this.Trigger('Attack');
  }

  Skill() {
    return this.Trigger('Skill');
  }

  Dead() {
    return this.Trigger('Dead');
  }

  Restart() {
    return this.Trigger('Restart');
  }

  async SelectAxieClass(axieClass: typeof AXIE_SAMPLE_CLASSES[number]) {
    this.axieClass = axieClass;
    return this.RebuildAxie();
  }

  async SelectAxieVariant(variant: typeof AXIE_SAMPLE_VARIANTS[number]) {
    this.axieVariant = variant;
    return this.RebuildAxie();
  }

  UpdateAnimations(weaponName: string | undefined) {
    const liteBehaviour = requiredBehaviour(this.liteCharacterBehaviour, 'lite');
    const fullBehaviour = requiredBehaviour(this.fullCharacterBehaviour, 'full');
    const liteCharacter = requiredCharacter(liteBehaviour, 'lite');
    const fullCharacter = requiredCharacter(fullBehaviour, 'full');
    const liteController = this.liteAnimatorController;
    const fullController = this.fullAnimatorController;
    if (!liteController || !fullController) throw new Error('Animator sample has not started.');
    const family = weaponName ?? 'Default';

    liteController.SetOverride('Idle', liteCharacter.GetLiteAnimationClip(`${family}.Idle`));
    liteController.SetOverride('Walk', liteCharacter.GetLiteAnimationClip(`${family}.Walk`));
    liteController.SetOverride('Run', liteCharacter.GetLiteAnimationClip(`${family}.Run`));
    liteController.SetOverride('Stun', liteCharacter.GetLiteAnimationClip('Default.Stun'));
    liteController.SetOverride('Dead', liteCharacter.GetLiteAnimationClip('Default.Dead'));

    fullController.SetOverride('Idle', fullCharacter.GetFullAnimationClip(`${family}.Idle`));
    fullController.SetOverride('Walk', fullCharacter.GetFullAnimationClip(`${family}.Walk`));
    fullController.SetOverride('Run', fullCharacter.GetFullAnimationClip(`${family}.Run`));
    fullController.SetOverride('Stun', fullCharacter.GetFullAnimationClip('Default.Stun'));
    fullController.SetOverride('Dead', fullCharacter.GetFullAnimationClip('Default.Dead'));

    if (weaponName !== undefined) {
      liteController.SetOverride('Attack', liteCharacter.GetLiteAnimationClip(`${weaponName}.Attack`));
      liteController.SetOverride('Skill', liteCharacter.GetLiteAnimationClip(`${weaponName}.Skill`));
      fullController.SetOverride('Attack', fullCharacter.GetFullAnimationClip(`${weaponName}.Attack`));
      fullController.SetOverride('Skill', fullCharacter.GetFullAnimationClip(`${weaponName}.Skill`));
    } else {
      this.Restart();
    }
  }

  EquipWeapon(prefab: TPrefab | null) {
    this.#currentWeaponPrefab = prefab;
    for (const mount of this.#weapons) this.#weaponRuntime?.destroy(mount.instance);
    this.#weapons = [];
    const weaponName = sourceWeaponName(prefab);
    if (weaponName !== undefined && prefab !== null) {
      const liteBehaviour = requiredBehaviour(this.liteCharacterBehaviour, 'lite');
      const fullBehaviour = requiredBehaviour(this.fullCharacterBehaviour, 'full');
      this.#weapons = createSourceWeaponMounts(
        prefab,
        weaponName,
        requiredCharacter(liteBehaviour, 'lite'),
        requiredCharacter(fullBehaviour, 'full'),
        this.#weaponRuntime,
      );
    }
    this.UpdateAnimations(weaponName);
  }

  async RebuildAxie() {
    const liteBehaviour = requiredBehaviour(this.liteCharacterBehaviour, 'lite');
    const fullBehaviour = requiredBehaviour(this.fullCharacterBehaviour, 'full');
    const descriptor = buildSampleDescriptor(this.axieClass, this.axieVariant);

    liteBehaviour.axieDescriptor = descriptor;
    await liteBehaviour.Rebuild();
    const liteCharacter = requiredCharacter(liteBehaviour, 'lite');
    if (this.#createAnimator) {
      if (!this.liteAnimatorController) throw new Error('Animator sample has not started.');
      this.liteAnimator = this.#createAnimator(liteCharacter, this.liteAnimatorController, 'lite');
    }
    if (this.liteAnimatorController) {
      setAnimatorController(
        this.liteAnimator,
        this.liteAnimatorController as AxieSampleAnimatorOverrideController<unknown>,
      );
    }

    fullBehaviour.axieDescriptor = descriptor;
    await fullBehaviour.Rebuild();
    const fullCharacter = requiredCharacter(fullBehaviour, 'full');
    if (this.#createAnimator) {
      if (!this.fullAnimatorController) throw new Error('Animator sample has not started.');
      this.fullAnimator = this.#createAnimator(fullCharacter, this.fullAnimatorController, 'full');
    }
    if (this.fullAnimatorController) {
      setAnimatorController(
        this.fullAnimator,
        this.fullAnimatorController as AxieSampleAnimatorOverrideController<unknown>,
      );
    }

    this.EquipWeapon(this.#currentWeaponPrefab);
    return descriptor;
  }
}

export interface AxieSampleLegacyAnimation<TClip = unknown> {
  wrapMode: string;
  addClip(clip: TClip, name: string): void;
  play(name: string): void;
}

export interface AxieSampleLegacyClipRuntime<TClip = unknown> {
  instantiate(clip: TClip): TClip;
  setLegacy(clip: TClip, legacy: boolean): void;
  destroy(clip: TClip): void;
}

export interface LegacyAnimationSampleOptions<
  TClip = unknown,
  TPrefab = unknown,
  TInstance = unknown,
> {
  readonly weaponRuntime?: AxieSampleWeaponRuntimeAdapter<TPrefab, TInstance>;
  readonly createAnimation?: (
    character: AxieSampleCharacter<TClip>,
    kind: AxieSampleCharacterKind,
  ) => AxieSampleLegacyAnimation<TClip>;
  readonly clipRuntime?: AxieSampleLegacyClipRuntime<TClip>;
}

/** Exact browser compatibility projection of `LegacyAnimationSample.cs`. */
export class LegacyAnimationSample<TClip = unknown, TPrefab = unknown, TInstance = unknown> {
  axieClass: AxiePartDescriptor['class'] = AXIE_SAMPLE_CLASSES[0];
  axieVariant: number = AXIE_SAMPLE_VARIANTS[0];
  currentAnimation: AxieSampleLegacyAnimationName = 'Idle';
  liteAnimation: AxieSampleLegacyAnimation<TClip> | undefined;
  fullAnimation: AxieSampleLegacyAnimation<TClip> | undefined;
  #currentWeaponPrefab: TPrefab | null = null;
  #weapons: AxieSampleWeaponMount<TInstance>[] = [];
  readonly #liteClipMap = new Map<string, TClip>();
  readonly #fullClipMap = new Map<string, TClip>();
  readonly #weaponRuntime: AxieSampleWeaponRuntimeAdapter<TPrefab, TInstance> | undefined;
  readonly #createAnimation: LegacyAnimationSampleOptions<TClip, TPrefab, TInstance>['createAnimation'];
  readonly #clipRuntime: AxieSampleLegacyClipRuntime<TClip> | undefined;

  constructor(
    public liteCharacterBehaviour: AxieSampleCharacterBehaviour<TClip>,
    public fullCharacterBehaviour: AxieSampleCharacterBehaviour<TClip>,
    public weaponPrefabs: TPrefab[] = [],
    values: LegacyAnimationSampleOptions<TClip, TPrefab, TInstance> = {},
  ) {
    this.#weaponRuntime = values.weaponRuntime;
    this.#createAnimation = values.createAnimation;
    this.#clipRuntime = values.clipRuntime;
  }

  get currentWeaponPrefab() {
    return this.#currentWeaponPrefab;
  }

  get weapons(): readonly AxieSampleWeaponMount<TInstance>[] {
    return this.#weapons;
  }

  get canUseWeaponActions() {
    return this.#weapons.length > 0;
  }

  async Start() {
    return this.RebuildAxie();
  }

  PlayAnimation(animationName: AxieSampleLegacyAnimationName) {
    const liteAnimation = this.liteAnimation;
    const fullAnimation = this.fullAnimation;
    if (!liteAnimation || !fullAnimation) throw new Error('Legacy animation sample has not started.');
    this.currentAnimation = animationName;
    liteAnimation.play(animationName);
    fullAnimation.play(animationName);
  }

  PlayWeaponAnimation(animationName: 'Attack' | 'Skill') {
    if (!this.canUseWeaponActions) return false;
    this.PlayAnimation(animationName);
    return true;
  }

  async SelectAxieClass(axieClass: typeof AXIE_SAMPLE_CLASSES[number]) {
    this.axieClass = axieClass;
    return this.RebuildAxie();
  }

  async SelectAxieVariant(variant: typeof AXIE_SAMPLE_VARIANTS[number]) {
    this.axieVariant = variant;
    return this.RebuildAxie();
  }

  ReplaceClip(
    animation: AxieSampleLegacyAnimation<TClip>,
    clipMap: Map<string, TClip>,
    clipName: string,
    sourceClip: TClip,
  ) {
    const runtime = this.#clipRuntime;
    if (!runtime) throw new Error('Legacy animation sample requires a clip runtime adapter.');
    const clip = runtime.instantiate(sourceClip);
    runtime.setLegacy(clip, true);
    animation.addClip(clip, clipName);
    const oldClip = clipMap.get(clipName);
    if (oldClip !== undefined) runtime.destroy(oldClip);
    clipMap.set(clipName, clip);
  }

  UpdateAnimations(weaponName: string | undefined) {
    const liteAnimation = this.liteAnimation;
    const fullAnimation = this.fullAnimation;
    if (!liteAnimation || !fullAnimation) throw new Error('Legacy animation sample has not started.');
    const liteCharacter = requiredCharacter(this.liteCharacterBehaviour, 'lite');
    const fullCharacter = requiredCharacter(this.fullCharacterBehaviour, 'full');
    const family = weaponName ?? 'Default';

    this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Idle', liteCharacter.GetLiteAnimationClip(`${family}.Idle`));
    this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Walk', liteCharacter.GetLiteAnimationClip(`${family}.Walk`));
    this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Run', liteCharacter.GetLiteAnimationClip(`${family}.Run`));
    this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Stun', liteCharacter.GetLiteAnimationClip('Default.Stun'));
    this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Dead', liteCharacter.GetLiteAnimationClip('Default.Dead'));

    this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Idle', fullCharacter.GetFullAnimationClip(`${family}.Idle`));
    this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Walk', fullCharacter.GetFullAnimationClip(`${family}.Walk`));
    this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Run', fullCharacter.GetFullAnimationClip(`${family}.Run`));
    this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Stun', fullCharacter.GetFullAnimationClip('Default.Stun'));
    this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Dead', fullCharacter.GetFullAnimationClip('Default.Dead'));

    if (weaponName !== undefined) {
      this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Attack', liteCharacter.GetLiteAnimationClip(`${weaponName}.Attack`));
      this.ReplaceClip(liteAnimation, this.#liteClipMap, 'Skill', liteCharacter.GetLiteAnimationClip(`${weaponName}.Skill`));
      this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Attack', fullCharacter.GetFullAnimationClip(`${weaponName}.Attack`));
      this.ReplaceClip(fullAnimation, this.#fullClipMap, 'Skill', fullCharacter.GetFullAnimationClip(`${weaponName}.Skill`));
    } else if (this.currentAnimation === 'Attack' || this.currentAnimation === 'Skill') {
      this.currentAnimation = 'Idle';
    }

    this.PlayAnimation(this.currentAnimation);
  }

  EquipWeapon(prefab: TPrefab | null) {
    this.#currentWeaponPrefab = prefab;
    for (const mount of this.#weapons) this.#weaponRuntime?.destroy(mount.instance);
    this.#weapons = [];
    const weaponName = sourceWeaponName(prefab);
    if (weaponName !== undefined && prefab !== null) {
      this.#weapons = createSourceWeaponMounts(
        prefab,
        weaponName,
        requiredCharacter(this.liteCharacterBehaviour, 'lite'),
        requiredCharacter(this.fullCharacterBehaviour, 'full'),
        this.#weaponRuntime,
      );
    }
    this.UpdateAnimations(weaponName);
  }

  async RebuildAxie() {
    const descriptor = buildSampleDescriptor(this.axieClass, this.axieVariant);
    if (!this.#createAnimation) {
      throw new Error('Legacy animation sample requires an Animation component factory.');
    }
    this.liteCharacterBehaviour.axieDescriptor = descriptor;
    await this.liteCharacterBehaviour.Rebuild();
    const liteCharacter = requiredCharacter(this.liteCharacterBehaviour, 'lite');
    this.liteAnimation = this.#createAnimation(liteCharacter, 'lite');
    this.liteAnimation.wrapMode = 'Loop';

    this.fullCharacterBehaviour.axieDescriptor = descriptor;
    await this.fullCharacterBehaviour.Rebuild();
    const fullCharacter = requiredCharacter(this.fullCharacterBehaviour, 'full');
    this.fullAnimation = this.#createAnimation(fullCharacter, 'full');
    this.fullAnimation.wrapMode = 'Loop';
    this.EquipWeapon(this.#currentWeaponPrefab);
    return descriptor;
  }
}

export const AXIE_AVATAR_SAMPLE_VIEW_DIRECTION = Object.freeze([
  -0.32139380484326957,
  -0.3420201433256687,
  -0.883022221559489,
] as const);

export interface AxieAvatarSampleCharacter<TClip = THREE.AnimationClip> {
  readonly Root: THREE.Object3D;
  GetLiteAnimationClip(name: string): TClip;
  RenderAvatar(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions,
  ): unknown;
}

export interface AxieAvatarSampleBehaviour<TClip = THREE.AnimationClip> {
  readonly Character: AxieAvatarSampleCharacter<TClip> | null;
  readonly Avatars: readonly (THREE.Texture | THREE.WebGLRenderTarget)[];
  enabled?: boolean;
  Start?(): unknown | Promise<unknown>;
}

export interface AxieAvatarImageTarget {
  texture?: THREE.Texture | THREE.WebGLRenderTarget;
}

export interface AxieAvatarSampleAnimation<TClip = THREE.AnimationClip> {
  addClip(clip: TClip, name: string): void;
  play(name: string): void;
  update?(deltaSeconds: number): void;
}

export interface AxieAvatarSampleAnimationRuntime<TClip = THREE.AnimationClip> {
  instantiate(clip: TClip): TClip;
  setLegacy(clip: TClip, legacy: boolean): void;
  setWrapMode(clip: TClip, mode: 'Loop'): void;
  create(root: THREE.Object3D): AxieAvatarSampleAnimation<TClip>;
}

export interface AxieAvatarsOptions<TClip = THREE.AnimationClip> {
  readonly renderer?: THREE.WebGLRenderer;
  readonly animationRuntime?: AxieAvatarSampleAnimationRuntime<TClip>;
  readonly createRenderTarget?: () => THREE.WebGLRenderTarget;
}

class ThreeAvatarSampleAnimation implements AxieAvatarSampleAnimation<THREE.AnimationClip> {
  readonly #mixer: THREE.AnimationMixer;
  readonly #clips = new Map<string, THREE.AnimationClip>();

  constructor(root: THREE.Object3D) {
    this.#mixer = new THREE.AnimationMixer(root);
  }

  addClip(clip: THREE.AnimationClip, name: string) {
    this.#clips.set(name, clip);
  }

  play(name: string) {
    const clip = this.#clips.get(name);
    if (!clip) return;
    this.#mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity).play();
  }

  update(deltaSeconds: number) {
    this.#mixer.update(deltaSeconds);
  }
}

const THREE_AVATAR_SAMPLE_ANIMATION_RUNTIME: AxieAvatarSampleAnimationRuntime<THREE.AnimationClip> = {
  instantiate(clip) {
    return clip.clone();
  },
  setLegacy(clip, legacy) {
    (clip as THREE.AnimationClip & { legacy?: boolean }).legacy = legacy;
  },
  setWrapMode(clip, mode) {
    (clip as THREE.AnimationClip & { wrapMode?: string }).wrapMode = mode;
  },
  create(root) {
    return new ThreeAvatarSampleAnimation(root);
  },
};

function createAvatarSampleRenderTarget() {
  const target = new THREE.WebGLRenderTarget(512, 512, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.depthTexture = new THREE.DepthTexture(512, 512, THREE.UnsignedShortType);
  target.depthTexture.format = THREE.DepthFormat;
  target.texture.name = 'AxieAvatars:Realtime:ARGB32';
  target.depthTexture.name = 'AxieAvatars:Realtime:Depth16';
  target.texture.userData.axieAvatarFormat = 'ARGB32';
  target.depthTexture.userData.axieAvatarDepthBits = 16;
  return target;
}

/** Exact browser lifecycle projection of `Samples~/Axie Avatars/AxieAvatars.cs`. */
export class AxieAvatars<TClip = THREE.AnimationClip> {
  realtimeAvatar: THREE.WebGLRenderTarget | null = null;
  renderParams: AxieAvatarRenderParams | null = null;
  animationClip: TClip | null = null;
  animation: AxieAvatarSampleAnimation<TClip> | null = null;
  #delayedFrame = 0;
  #started = false;
  #initialized = false;
  #destroyed = false;
  readonly #clock = new THREE.Clock(false);
  readonly #renderer: THREE.WebGLRenderer | undefined;
  readonly #animationRuntime: AxieAvatarSampleAnimationRuntime<TClip>;
  readonly #createRenderTarget: () => THREE.WebGLRenderTarget;

  constructor(
    public characterBehaviour: AxieAvatarSampleBehaviour<TClip>,
    public avatarImage0: AxieAvatarImageTarget,
    public avatarImage1: AxieAvatarImageTarget,
    public renderImage: AxieAvatarImageTarget,
    values: AxieAvatarsOptions<TClip> = {},
  ) {
    this.#renderer = values.renderer;
    this.#animationRuntime = values.animationRuntime
      ?? THREE_AVATAR_SAMPLE_ANIMATION_RUNTIME as AxieAvatarSampleAnimationRuntime<TClip>;
    this.#createRenderTarget = values.createRenderTarget ?? createAvatarSampleRenderTarget;
  }

  get initialized() {
    return this.#initialized;
  }

  get delayedFrame() {
    return this.#delayedFrame;
  }

  /** Starts the coroutine; call AdvanceFrame once per rendered frame. */
  Start() {
    if (this.#destroyed) throw new Error('Axie avatars sample is destroyed.');
    this.#started = true;
    this.#delayedFrame = 0;
  }

  /** Three empty frames, enable CharacterBehaviour, one empty frame, then initialize. */
  async AdvanceFrame() {
    if (!this.#started || this.#initialized || this.#destroyed) return false;
    this.#delayedFrame += 1;
    if (this.#delayedFrame === 3) {
      this.characterBehaviour.enabled = true;
      await this.characterBehaviour.Start?.();
      return false;
    }
    if (this.#delayedFrame < 4) return false;

    const character = this.characterBehaviour.Character;
    if (!character) throw new Error('Axie avatars sample character was not initialized.');
    const sourceClip = character.GetLiteAnimationClip('Default.Run');
    const clip = this.#animationRuntime.instantiate(sourceClip);
    this.#animationRuntime.setLegacy(clip, true);
    this.#animationRuntime.setWrapMode(clip, 'Loop');
    const animation = this.#animationRuntime.create(character.Root);
    animation.addClip(clip, 'Run');
    animation.play('Run');

    const target = this.#createRenderTarget();
    const viewDirection = new THREE.Vector3(...AXIE_AVATAR_SAMPLE_VIEW_DIRECTION);
    const renderParams = new AxieAvatarRenderParams({
      width: 512,
      height: 512,
      viewDirection,
    });

    this.animationClip = clip;
    this.animation = animation;
    this.realtimeAvatar = target;
    this.renderParams = renderParams;
    this.avatarImage0.texture = this.characterBehaviour.Avatars[0];
    this.avatarImage1.texture = this.characterBehaviour.Avatars[1];
    this.renderImage.texture = target;
    this.#initialized = true;
    this.#clock.start();
    return true;
  }

  Update(deltaSeconds?: number) {
    const target = this.realtimeAvatar;
    const renderParams = this.renderParams;
    const character = this.characterBehaviour.Character;
    if (!target || !renderParams || !character) return undefined;
    if (!this.#renderer) throw new Error('Axie avatars sample requires a renderer for Update().');
    this.animation?.update?.(deltaSeconds ?? this.#clock.getDelta());
    return character.RenderAvatar(this.#renderer, target, renderParams);
  }

  OnDestroy() {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#clock.stop();
    this.realtimeAvatar?.dispose();
    this.realtimeAvatar = null;
    this.renderParams = null;
    this.renderImage.texture = undefined;
  }
}
