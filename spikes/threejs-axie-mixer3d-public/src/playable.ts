import * as THREE from 'three';
import {
  renderAxieAvatar,
  type AxieAvatarRenderOptions,
} from './avatar';
import type { AxieAnimationSet, AxieMixerManifest } from './manifest';
import type { AxieDiagnosticEvent } from './diagnostics';
import type {
  AddonParticleResetOptions,
} from './mystic-types';
import type {
  AxieAnimationCapabilities,
  AxieAnimationCue,
  AxieAnimationCueListener,
  AxieAnimationCueSourceEvent,
  AxieAnimationPlayOptions,
  AxieAssemblyResult,
  AxieAssetStore,
  AxieLocomotion,
  AxieMixPlan,
  AxiePlayableCharacter,
  AxieWeaponCapability,
} from './runtime';
import { AxieWeaponRuntime } from './weapon-runtime';

export interface ThreeAxiePlayableOptions {
  readonly manifest: AxieMixerManifest;
  readonly assets: AxieAssetStore;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  /** Internal ownership hook used by mixer facades; called exactly once. */
  readonly onDispose?: (character: ThreeAxiePlayableCharacter) => void;
}

interface ClipMetadata {
  readonly sourceName: string;
  readonly looping: boolean;
}

interface AnimationRequest {
  readonly accepted: boolean;
  readonly ready?: Promise<boolean>;
}

type UnityAnimatorState = 'Locomotion' | 'Attack' | 'Skill' | 'Stun' | 'Dead' | 'Exit';
type UnityLocomotionState = 'Idle' | 'Walk' | 'Run';
type UnityAnimatorTrigger = 'Attack' | 'Skill' | 'Dead' | 'Restart';

interface LocomotionBlendEntry {
  readonly state: UnityLocomotionState;
  readonly sourceName: string;
  readonly action: THREE.AnimationAction;
}

interface LocomotionBlendState {
  readonly entries: readonly LocomotionBlendEntry[];
  normalizedTime: number;
}

interface PendingControllerAnimation {
  readonly state: 'Skill';
  readonly ready: Promise<boolean>;
  readonly resolve: (started: boolean) => void;
}

interface DeadExitTransition {
  readonly action: THREE.AnimationAction;
  remaining: number;
}

const UNITY_ATTACK_SKILL_TRANSITION_SECONDS = 0.1;
const UNITY_STUN_TRANSITION_SECONDS = 0.25;
const UNITY_DEAD_EXIT_TRANSITION_SECONDS = 0.25;
const UNITY_LOCOMOTION_STATES = Object.freeze(['Idle', 'Walk', 'Run'] as const);

function unityLocomotionWeights(moveSpeed: number) {
  if (moveSpeed <= 2) {
    const walk = moveSpeed / 2;
    return Object.freeze({ Idle: 1 - walk, Walk: walk, Run: 0 });
  }
  const run = moveSpeed - 2;
  return Object.freeze({ Idle: 0, Walk: 1 - run, Run: run });
}

function unityLocomotionStateDuration(
  entries: readonly LocomotionBlendEntry[],
  moveSpeed: number,
) {
  const weights = unityLocomotionWeights(moveSpeed);
  return entries.reduce((duration, entry) => (
    duration + entry.action.getClip().duration * weights[entry.state]
  ), 0);
}

function normalizedPhase(value: number) {
  return value - Math.floor(value);
}

/**
 * Source-derived contract for Samples~/Axie Animations/Animations/Axie Controller.controller.
 * The runtime deliberately models this single layer without IK, offsets, or inferred states.
 */
export const AXIE_UNITY_ANIMATOR_CONTROLLER = Object.freeze({
  layers: Object.freeze([
    Object.freeze({ name: 'Base Layer', ikPass: false }),
  ]),
  states: Object.freeze(['Locomotion', 'Attack', 'Skill', 'Stun', 'Dead']),
  stateDefaults: Object.freeze({
    speed: 1,
    writeDefaultValues: true,
    footIk: false,
  }),
  parameters: Object.freeze([
    Object.freeze({ name: 'Move Speed', type: 'float', defaultValue: 0 }),
    Object.freeze({ name: 'Attack', type: 'trigger' }),
    Object.freeze({ name: 'Skill', type: 'trigger' }),
    Object.freeze({ name: 'Stunned', type: 'bool', defaultValue: false }),
    Object.freeze({ name: 'Dead', type: 'trigger' }),
    Object.freeze({ name: 'Restart', type: 'trigger' }),
  ]),
  anyStateOrder: Object.freeze(['Restart', 'Dead', 'Stun']),
  locomotion: Object.freeze({
    parameter: 'Move Speed',
    blendType: '1D Simple',
    minimum: 0,
    maximum: 3,
    childTimeScale: 1,
    thresholds: Object.freeze([
      Object.freeze({ state: 'Idle', value: 0 }),
      Object.freeze({ state: 'Walk', value: 2 }),
      Object.freeze({ state: 'Run', value: 3 }),
    ]),
  }),
  overrides: Object.freeze({
    weaponSpecific: Object.freeze(['Idle', 'Walk', 'Run', 'Attack', 'Skill']),
    stun: 'Default.Stun',
    dead: 'Default.Dead',
  }),
  transitions: Object.freeze([
    Object.freeze({
      from: 'Locomotion',
      to: 'Attack',
      condition: 'Attack',
      duration: UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      hasExitTime: false,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Locomotion',
      to: 'Skill',
      condition: 'Skill',
      duration: UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      hasExitTime: true,
      exitTime: 1,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Attack',
      to: 'Locomotion',
      duration: UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      hasExitTime: true,
      exitTime: 1,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Skill',
      to: 'Locomotion',
      duration: UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      hasExitTime: true,
      exitTime: 1,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Any State',
      to: 'Locomotion',
      condition: 'Restart',
      duration: 0,
      hasExitTime: false,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Any State',
      to: 'Dead',
      condition: 'Dead',
      duration: UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      hasExitTime: false,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'Current State',
      orderedInterruption: true,
      canTransitionToSelf: false,
    }),
    Object.freeze({
      from: 'Any State',
      to: 'Stun',
      condition: 'Stunned == true',
      duration: UNITY_STUN_TRANSITION_SECONDS,
      hasExitTime: false,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'Current State',
      orderedInterruption: true,
      canTransitionToSelf: false,
    }),
    Object.freeze({
      from: 'Stun',
      to: 'Locomotion',
      condition: 'Stunned == false',
      duration: UNITY_STUN_TRANSITION_SECONDS,
      hasExitTime: false,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
    Object.freeze({
      from: 'Dead',
      to: 'Exit',
      duration: UNITY_DEAD_EXIT_TRANSITION_SECONDS,
      hasExitTime: true,
      exitTime: 1,
      fixedDuration: true,
      transitionOffset: 0,
      interruptionSource: 'None',
      orderedInterruption: true,
      canTransitionToSelf: true,
    }),
  ]),
});

interface PreparedAnimationCue {
  readonly eventIndex: number;
  readonly sourceEvent: AxieAnimationCueSourceEvent;
  readonly payload: unknown;
}

interface AnimationCuePlayback {
  readonly action: THREE.AnimationAction;
  readonly sourceName: string;
  readonly runtimeName: string;
  readonly duration: number;
  readonly events: readonly PreparedAnimationCue[];
  previousTime: number;
  loop: number;
  includePreviousTime: boolean;
  loopDelta: number;
}

function parsedCuePayload(value: string) {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function preparedAnimationCues(clip: THREE.AnimationClip) {
  const data = (clip as THREE.AnimationClip & {
    userData?: { axieEvents?: unknown };
  }).userData;
  if (!Array.isArray(data?.axieEvents)) return Object.freeze([]) as readonly PreparedAnimationCue[];
  const duration = Math.max(0, clip.duration);
  const events = data.axieEvents.flatMap((value, eventIndex) => {
    if (!value || typeof value !== 'object') return [];
    const candidate = value as Partial<AxieAnimationCueSourceEvent>;
    if (typeof candidate.time !== 'number'
      || !Number.isFinite(candidate.time)
      || candidate.time < 0
      || candidate.time > duration) return [];
    const sourceEvent = Object.freeze({
      time: candidate.time,
      functionName: typeof candidate.functionName === 'string' ? candidate.functionName : '',
      stringParameter: typeof candidate.stringParameter === 'string' ? candidate.stringParameter : '',
      floatParameter: typeof candidate.floatParameter === 'number' && Number.isFinite(candidate.floatParameter)
        ? candidate.floatParameter
        : 0,
      intParameter: typeof candidate.intParameter === 'number' && Number.isFinite(candidate.intParameter)
        ? candidate.intParameter
        : 0,
      objectParameterId: typeof candidate.objectParameterId === 'string' ? candidate.objectParameterId : '',
    });
    return [{
      eventIndex,
      sourceEvent,
      payload: parsedCuePayload(sourceEvent.stringParameter),
    }];
  });
  events.sort((a, b) => a.sourceEvent.time - b.sourceEvent.time || a.eventIndex - b.eventIndex);
  return Object.freeze(events);
}

function clipMetadata(clip: THREE.AnimationClip): ClipMetadata {
  const data = (clip as THREE.AnimationClip & {
    userData?: { axieSourceName?: unknown; axieLooping?: unknown };
  }).userData;
  const sourceName = typeof data?.axieSourceName === 'string'
    ? data.axieSourceName
    : clip.name.replace(/^(?:lite|full):/, '');
  return {
    sourceName,
    looping: typeof data?.axieLooping === 'boolean' ? data.axieLooping : /\.(?:Idle|Walk|Run)$/.test(sourceName),
  };
}

function makeCapabilities(clips: readonly THREE.AnimationClip[], set: AxieAnimationSet): AxieAnimationCapabilities {
  const descriptors = clips.map((clip) => {
    const metadata = clipMetadata(clip);
    return Object.freeze({
      name: metadata.sourceName,
      runtimeName: clip.name,
      group: metadata.sourceName.includes('.') ? metadata.sourceName.slice(0, metadata.sourceName.indexOf('.')) : 'Other',
      duration: clip.duration,
      looping: metadata.looping,
    });
  });
  const names = [...new Set(descriptors.map((clip) => clip.name))];
  const prefixes = [...new Set(names
    .map((name) => name.includes('.') ? name.slice(0, name.indexOf('.')) : '')
    .filter((prefix) => prefix && prefix !== 'Default' && prefix !== 'Action'))];
  return {
    set,
    names,
    clips: descriptors,
    hasIdle: names.includes('Default.Idle'),
    hasWalk: names.includes('Default.Walk'),
    hasRun: names.includes('Default.Run'),
    hasStun: names.includes('Default.Stun'),
    hasDead: names.includes('Default.Dead'),
    weaponPrefixes: prefixes,
  };
}

function exactClipMap(clips: readonly THREE.AnimationClip[]) {
  const result = new Map<string, THREE.AnimationClip>();
  clips.forEach((clip) => result.set(clipMetadata(clip).sourceName, clip));
  return result as ReadonlyMap<string, THREE.AnimationClip>;
}

function boundsNumbers(plan: AxieMixPlan) {
  const min = plan.body.bounds.min;
  const max = plan.body.bounds.max;
  const width = Math.max(0.01, max[0] - min[0]);
  const height = Math.max(0.01, max[1] - min[1]);
  const depth = Math.max(0.01, max[2] - min[2]);
  return { min, max, width, height, depth };
}

function findLastExact(root: THREE.Object3D, name: string) {
  let match: THREE.Object3D | undefined;
  root.traverse((node) => { if (node.name === name) match = node; });
  return match;
}

/** AnimationMixer adapter consumed by the playground's player/camera loop. */
export class ThreeAxiePlayableCharacter implements AxiePlayableCharacter {
  readonly kind = 'axie' as const;
  readonly key: string;
  readonly descriptor;
  readonly wrapper;
  readonly model;
  readonly quality;
  readonly animations;
  readonly animationNames: readonly string[];
  readonly anchors;
  readonly collision;
  readonly diagnostics;
  readonly weapons: readonly AxieWeaponCapability[];
  readonly #assembly: AxieAssemblyResult;
  readonly #mixer: THREE.AnimationMixer;
  readonly #actions = new Map<string, THREE.AnimationAction>();
  readonly #clipSets: Readonly<Record<AxieAnimationSet, ReadonlyMap<string, THREE.AnimationClip>>>;
  readonly #actionMetadata = new Map<THREE.AnimationAction, ClipMetadata>();
  readonly #finishedListener: (event: THREE.Event & { action?: THREE.AnimationAction }) => void;
  readonly #loopListener: (event: THREE.Event & {
    action?: THREE.AnimationAction;
    loopDelta?: number;
  }) => void;
  readonly #cueListeners = new Set<AxieAnimationCueListener>();
  readonly #weaponRuntime?: AxieWeaponRuntime;
  readonly #onDispose?: (character: ThreeAxiePlayableCharacter) => void;
  #current?: THREE.AnimationAction;
  #currentSourceName?: string;
  #manualAction?: THREE.AnimationAction;
  #pendingControllerAnimation?: PendingControllerAnimation;
  readonly #controllerTriggers = new Set<UnityAnimatorTrigger>();
  #controllerState?: UnityAnimatorState;
  #controllerAction?: THREE.AnimationAction;
  #deadExitTransition?: DeadExitTransition;
  #stunned = false;
  #weaponEquipGeneration = 0;
  #moveSpeed = 0;
  #locomotionBlend?: LocomotionBlendState;
  #weaponPrefix?: string;
  #controllerActionPrefix?: string;
  #cuePlayback?: AnimationCuePlayback;
  #disposed = false;
  #elapsedSeconds = 0;

  constructor(
    assembly: AxieAssemblyResult,
    plan: AxieMixPlan,
    options?: ThreeAxiePlayableOptions,
  ) {
    this.#assembly = assembly;
    this.#onDispose = options?.onDispose;
    this.key = plan.key;
    this.descriptor = plan.descriptor;
    this.wrapper = assembly.wrapper;
    this.model = assembly.model;
    this.quality = plan.quality;
    this.diagnostics = assembly.diagnostics;
    this.animations = makeCapabilities(assembly.clips, plan.animationSet);
    this.#clipSets = Object.freeze({
      lite: exactClipMap(assembly.clipSets.lite),
      full: exactClipMap(assembly.clipSets.full),
    });
    this.animationNames = Object.freeze(
      assembly.clipSets.lite.map((clip) => clipMetadata(clip).sourceName),
    );
    const bounds = boundsNumbers(plan);
    const cameraTarget = new THREE.Object3D();
    cameraTarget.name = 'AxieCameraTarget';
    cameraTarget.position.set(
      (bounds.min[0] + bounds.max[0]) / 2,
      bounds.min[1] + bounds.height * 0.62,
      (bounds.min[2] + bounds.max[2]) / 2,
    );
    this.wrapper.add(cameraTarget);
    this.anchors = {
      cameraTarget,
      leftWeapon: findLastExact(this.model, 'Root_Weapon_L_JNT'),
      rightWeapon: findLastExact(this.model, 'Root_Weapon_R_JNT'),
    };
    this.#mixer = new THREE.AnimationMixer(this.model);
    this.#weaponRuntime = options ? new AxieWeaponRuntime({
      manifest: options.manifest,
      assets: options.assets,
      anchors: this.anchors,
      body: plan.descriptor.body,
      onDiagnostic: options.onDiagnostic,
    }) : undefined;
    this.weapons = this.#weaponRuntime?.capabilities ?? Object.freeze([]);
    this.collision = {
      type: 'capsule' as const,
      radius: Math.max(bounds.width, bounds.depth) * 0.42,
      height: bounds.height,
      centerY: (bounds.min[1] + bounds.max[1]) / 2,
    };

    assembly.clips.forEach((clip) => {
      const metadata = clipMetadata(clip);
      const action = this.#mixer.clipAction(clip);
      action.enabled = true;
      action.clampWhenFinished = !metadata.looping;
      action.setLoop(metadata.looping ? THREE.LoopRepeat : THREE.LoopOnce, metadata.looping ? Infinity : 1);
      this.#actionMetadata.set(action, metadata);
      [clip.name, metadata.sourceName]
        .forEach((name) => this.#actions.set(name, action));
    });
    this.#finishedListener = (event) => {
      if (!event.action || event.action !== this.#current) return;
      if (event.action === this.#controllerAction) {
        if (this.#controllerState === 'Dead') {
          this.#controllerState = 'Exit';
          this.#deadExitTransition = {
            action: event.action,
            remaining: UNITY_DEAD_EXIT_TRANSITION_SECONDS,
          };
          event.action.fadeOut(UNITY_DEAD_EXIT_TRANSITION_SECONDS);
          return;
        }
        if (this.#controllerState === 'Attack' || this.#controllerState === 'Skill') {
          this.#manualAction = undefined;
          this.#controllerAction = undefined;
          this.#controllerState = 'Locomotion';
          this.setMoveSpeed(this.#moveSpeed, UNITY_ATTACK_SKILL_TRANSITION_SECONDS);
          return;
        }
      }
      if (event.action === this.#manualAction) this.#manualAction = undefined;
      this.setMoveSpeed(this.#moveSpeed, 0);
    };
    this.#loopListener = (event) => {
      const playback = this.#cuePlayback;
      if (playback && event.action === playback.action) {
        const loopDelta = event.loopDelta;
        playback.loopDelta += typeof loopDelta === 'number' && Number.isFinite(loopDelta)
          ? Math.trunc(loopDelta)
          : 1;
      }
    };
    this.#mixer.addEventListener('finished', this.#finishedListener);
    this.#mixer.addEventListener('loop', this.#loopListener);
    this.setMoveSpeed(0, 0);
  }

  get disposed() {
    return this.#disposed;
  }

  get activeAnimation() {
    return this.#currentSourceName;
  }

  get animationOverrideActive() {
    return this.#manualAction !== undefined
      || this.#pendingControllerAnimation !== undefined;
  }

  get activeWeapon() {
    return this.#weaponRuntime?.active;
  }

  get activeWeaponSelection() {
    return this.#weaponRuntime?.activeSelection;
  }

  get weaponLoading() {
    return this.#weaponRuntime?.loading;
  }

  get weaponLoadingSelection() {
    return this.#weaponRuntime?.loadingSelection;
  }

  inspectPairedWeaponAnimation() {
    return this.#weaponRuntime?.inspectPairedAnimation() ?? Object.freeze({
      family: undefined,
      selection: undefined,
      paired: false,
      state: undefined,
      clipName: undefined,
      duration: undefined,
      time: undefined,
      timeScale: undefined,
      looping: undefined,
      mixerCount: 0,
      instanceCount: 0,
      bones: Object.freeze([]),
    });
  }

  resetAddonParticles(options: AddonParticleResetOptions = {}) {
    if (this.#disposed) return;
    this.#assembly.addonRuntimes.forEach((runtime) => runtime.resetParticles(options));
  }

  setLocomotion(state: AxieLocomotion, transition = 0) {
    this.setMoveSpeed(state === 'run' ? 3 : state === 'walk' ? 2 : 0, transition);
  }

  setMoveSpeed(value: number, transition = 0) {
    if (this.#disposed) return;
    const clamped = Math.min(3, Math.max(0, value));
    if (!Number.isFinite(clamped)) return;
    this.#moveSpeed = clamped;
    // AnimatorSample keeps writing Move Speed while one-shots own the layer.
    // Preserve that parameter intent, then apply it when Locomotion resumes.
    if (this.#manualAction) return;
    this.#startLocomotionBlend(Math.max(0, transition), false);
  }

  playAnimation(name: string, options: AxieAnimationPlayOptions = {}) {
    return this.#requestAnimation(name, options).accepted;
  }

  /**
   * Subscribes to authored animation events crossed by the active action.
   * Returns an idempotent unsubscribe callback.
   */
  subscribeAnimationCues(listener: AxieAnimationCueListener) {
    if (typeof listener !== 'function') throw new TypeError('Animation cue listener must be a function.');
    if (this.#disposed) return () => {};
    this.#cueListeners.add(listener);
    let subscribed = true;
    return () => {
      if (!subscribed) return;
      subscribed = false;
      this.#cueListeners.delete(listener);
    };
  }

  async playAnimationAsync(name: string, options: AxieAnimationPlayOptions = {}) {
    const request = this.#requestAnimation(name, options);
    return request.ready ?? request.accepted;
  }

  #requestAnimation(name: string, options: AxieAnimationPlayOptions): AnimationRequest {
    if (this.#disposed) return { accepted: false };
    const controllerRequest = this.#requestControllerAnimation(name, options);
    if (controllerRequest) return controllerRequest;
    const exactRequest = this.#requestExactAnimation(name, options);
    if (!exactRequest.accepted) return exactRequest;
    this.#cancelPendingControllerAnimation();
    this.#controllerState = undefined;
    this.#controllerAction = undefined;
    this.#clearDeadExitTransition();
    return exactRequest;
  }

  #findAction(name: string) {
    return this.#actions.get(name);
  }

  #controllerClipName(state: 'Idle' | 'Walk' | 'Run' | 'Attack' | 'Skill') {
    const prefix = state === 'Idle' || state === 'Walk' || state === 'Run'
      ? this.#weaponPrefix
      : this.#controllerActionPrefix;
    if (!prefix) {
      return state === 'Idle' || state === 'Walk' || state === 'Run'
        ? `Default.${state}`
        : undefined;
    }
    if (state === 'Idle' || state === 'Walk' || state === 'Run') {
      return this.#weaponRuntime?.active === prefix
        ? this.#weaponRuntime.locomotionName(prefix, state)
        : undefined;
    }
    const sourceName = `${prefix}.${state}`;
    return this.#weaponRuntime?.weaponForClip(sourceName)?.id === prefix
      ? sourceName
      : undefined;
  }

  #resolveLocomotionEntries() {
    const entries: LocomotionBlendEntry[] = [];
    for (const state of UNITY_LOCOMOTION_STATES) {
      const sourceName = this.#controllerClipName(state);
      const action = sourceName ? this.#actions.get(sourceName) : undefined;
      // AnimatorOverrideController assigns all three exact children together.
      // A partial family is invalid; never substitute a Default child.
      if (!sourceName || !action) return undefined;
      entries.push({ state, sourceName, action });
    }
    return entries as readonly LocomotionBlendEntry[];
  }

  #sameLocomotionEntries(entries: readonly LocomotionBlendEntry[]) {
    const current = this.#locomotionBlend?.entries;
    return current?.length === entries.length
      && current.every((entry, index) => (
        entry.sourceName === entries[index].sourceName
        && entry.action === entries[index].action
      ));
  }

  #synchronizeLocomotionTime(blend: LocomotionBlendState) {
    const phase = normalizedPhase(blend.normalizedTime);
    blend.entries.forEach((entry) => {
      entry.action.time = entry.action.getClip().duration * phase;
    });
  }

  #applyLocomotionWeights(blend: LocomotionBlendState) {
    const { entries } = blend;
    const weights = unityLocomotionWeights(this.#moveSpeed);
    let dominant = entries[0];
    let dominantWeight = -1;
    entries.forEach((entry) => {
      const weight = weights[entry.state];
      entry.action.enabled = true;
      // Unity samples every child at the Blend Tree state's normalized time.
      // Keep Three's child actions evaluable but stop their independent,
      // seconds-based clocks; #advanceLocomotionState owns their shared phase.
      entry.action.paused = true;
      entry.action.clampWhenFinished = false;
      entry.action.setLoop(THREE.LoopRepeat, Infinity);
      entry.action.setEffectiveTimeScale(1);
      entry.action.setEffectiveWeight(weight);
      if (!entry.action.isRunning()) entry.action.play();
      // At exact ties, select the upper threshold for the legacy single-name
      // diagnostic while the rendered pose still uses both exact weights.
      if (weight >= dominantWeight) {
        dominant = entry;
        dominantWeight = weight;
      }
    });
    if (this.#current !== dominant.action) {
      this.#beginAnimationCuePlayback(dominant.action, dominant.sourceName);
    }
    this.#current = dominant.action;
    this.#currentSourceName = dominant.sourceName;
    this.#controllerState = 'Locomotion';
    this.#controllerAction = dominant.action;
    this.#synchronizeLocomotionTime(blend);
    this.#weaponRuntime?.playPairedAnimation(dominant.state, { restart: false });
  }

  #startLocomotionBlend(transition: number, restart: boolean) {
    const entries = this.#resolveLocomotionEntries();
    if (!entries) return false;
    if (this.#sameLocomotionEntries(entries)) {
      const blend = this.#locomotionBlend!;
      if (restart) {
        blend.normalizedTime = 0;
        entries.forEach((entry) => entry.action.reset().play());
      }
      this.#applyLocomotionWeights(blend);
      if (restart) {
        const weights = unityLocomotionWeights(this.#moveSpeed);
        const dominant = entries.reduce((selected, entry) => (
          weights[entry.state] >= weights[selected.state] ? entry : selected
        ), entries[0]);
        this.#weaponRuntime?.playPairedAnimation(dominant.state, {
          transition,
          restart: true,
        });
      }
      if (restart && this.#current && this.#currentSourceName) {
        this.#beginAnimationCuePlayback(this.#current, this.#currentSourceName);
      }
      return true;
    }

    const previous = this.#current;
    const previousBlend = this.#locomotionBlend;
    const normalizedTime = restart ? 0 : previousBlend?.normalizedTime ?? 0;
    const weights = unityLocomotionWeights(this.#moveSpeed);
    const dominant = entries.reduce((selected, entry) => (
      weights[entry.state] >= weights[selected.state] ? entry : selected
    ), entries[0]);
    const nextActions = new Set(entries.map((entry) => entry.action));
    previousBlend?.entries.forEach((entry) => {
      if (entry.action === previous || nextActions.has(entry.action)) return;
      if (transition > 0) entry.action.fadeOut(transition);
      else entry.action.stop();
    });
    entries.forEach((entry) => {
      const reused = previousBlend?.entries.some((current) => current.action === entry.action) === true;
      if (!reused || restart) entry.action.reset();
      entry.action.enabled = true;
      entry.action.paused = true;
      entry.action.clampWhenFinished = false;
      entry.action.setLoop(THREE.LoopRepeat, Infinity);
      entry.action.setEffectiveTimeScale(1);
      entry.action.setEffectiveWeight(weights[entry.state]);
      entry.action.play();
      if (transition > 0 && previous && entry.action !== dominant.action && !reused) {
        entry.action.fadeIn(transition);
      }
    });
    if (previous && previous !== dominant.action) {
      if (transition > 0) previous.crossFadeTo(dominant.action, transition, false);
      else previous.stop();
    }
    const blend = { entries, normalizedTime };
    this.#locomotionBlend = blend;
    this.#current = dominant.action;
    this.#currentSourceName = dominant.sourceName;
    this.#controllerState = 'Locomotion';
    this.#controllerAction = dominant.action;
    this.#manualAction = undefined;
    this.#synchronizeLocomotionTime(blend);
    this.#beginAnimationCuePlayback(dominant.action, dominant.sourceName);
    this.#weaponRuntime?.playPairedAnimation(dominant.state, {
      transition,
      restart,
    });
    return true;
  }

  #advanceLocomotionState(deltaSeconds: number) {
    const blend = this.#locomotionBlend;
    if (this.#controllerState !== 'Locomotion' || !blend) return false;
    const duration = unityLocomotionStateDuration(blend.entries, this.#moveSpeed);
    if (!(duration > 0) || !Number.isFinite(duration)) return false;
    const previousCycle = Math.floor(blend.normalizedTime);
    blend.normalizedTime += deltaSeconds / duration;
    const completedCycles = Math.max(0, Math.floor(blend.normalizedTime) - previousCycle);
    this.#synchronizeLocomotionTime(blend);
    if (completedCycles > 0 && this.#cuePlayback) {
      this.#cuePlayback.loopDelta += completedCycles;
    }
    return completedCycles > 0 && this.#controllerTriggers.has('Skill');
  }

  #leaveLocomotionBlend(transition: number, nextAction: THREE.AnimationAction) {
    const blend = this.#locomotionBlend;
    if (!blend) return false;
    this.#locomotionBlend = undefined;
    blend.entries.forEach((entry) => {
      if (entry.action === this.#current || entry.action === nextAction) return;
      if (transition > 0) entry.action.fadeOut(transition);
      else entry.action.stop();
    });
    return true;
  }

  #isControllerLocomotion() {
    return this.#controllerState === 'Locomotion'
      && this.#locomotionBlend !== undefined
      && this.#current !== undefined
      && this.#controllerAction === this.#current
      && this.#locomotionBlend.entries.some((entry) => entry.action === this.#current);
  }

  #requestControllerAnimation(
    name: string,
    options: AxieAnimationPlayOptions,
  ): AnimationRequest | undefined {
    switch (name) {
      case 'Attack':
        return this.#requestControllerAttack(options);
      case 'Skill':
        return this.#requestControllerSkill(options);
      case 'Stunned':
        return this.#requestControllerStunned(options);
      case 'Dead':
        return this.#requestControllerDead(options);
      case 'Restart':
        return this.#requestControllerRestart(options);
      default:
        return undefined;
    }
  }

  #requestControllerAttack(options: AxieAnimationPlayOptions): AnimationRequest {
    void options;
    if (!this.#weaponRuntime?.active) return { accepted: false };
    const sourceName = this.#controllerClipName('Attack');
    if (!sourceName || !this.#actions.get(sourceName)) return { accepted: false };
    this.#controllerTriggers.add('Attack');
    return { accepted: true };
  }

  #requestControllerSkill(options: AxieAnimationPlayOptions): AnimationRequest {
    void options;
    if (!this.#weaponRuntime?.active) return { accepted: false };
    const sourceName = this.#controllerClipName('Skill');
    const action = sourceName ? this.#actions.get(sourceName) : undefined;
    if (!sourceName || !action) return { accepted: false };
    const existing = this.#pendingControllerAnimation;
    if (existing?.state === 'Skill') return { accepted: true, ready: existing.ready };
    let resolveReady!: (started: boolean) => void;
    const ready = new Promise<boolean>((resolve) => { resolveReady = resolve; });
    this.#pendingControllerAnimation = {
      state: 'Skill',
      ready,
      resolve: resolveReady,
    };
    this.#controllerTriggers.add('Skill');
    return { accepted: true, ready };
  }

  #requestControllerStunned(options: AxieAnimationPlayOptions): AnimationRequest {
    void options;
    const sourceName = AXIE_UNITY_ANIMATOR_CONTROLLER.overrides.stun;
    if (!this.#actions.get(sourceName)) return { accepted: false };
    this.#stunned = true;
    return { accepted: true };
  }

  #requestControllerDead(options: AxieAnimationPlayOptions): AnimationRequest {
    void options;
    const sourceName = AXIE_UNITY_ANIMATOR_CONTROLLER.overrides.dead;
    if (!this.#actions.get(sourceName)) return { accepted: false };
    this.#controllerTriggers.add('Dead');
    return { accepted: true };
  }

  #requestControllerRestart(options: AxieAnimationPlayOptions): AnimationRequest {
    void options;
    if (!this.#resolveLocomotionEntries()) return { accepted: false };
    this.#controllerTriggers.add('Restart');
    return { accepted: true };
  }

  #startControllerState(
    state: 'Attack' | 'Skill' | 'Stun' | 'Dead',
    sourceName: string,
    transition: number,
    loop: boolean,
  ) {
    const action = this.#actions.get(sourceName);
    if (!action) return false;
    const started = this.#startResolvedAnimation(
      action,
      this.#actionMetadata.get(action),
      sourceName,
      {
        transition,
        loop,
        restart: true,
        lockLocomotion: true,
      },
    );
    if (!started) return false;
    this.#controllerState = state;
    this.#controllerAction = this.#current;
    return true;
  }

  #startQueuedSkill() {
    if (!this.#controllerTriggers.has('Skill')
      || !this.#isControllerLocomotion()) return false;
    const sourceName = this.#controllerClipName('Skill');
    if (!sourceName) return false;
    const started = this.#startControllerState(
      'Skill',
      sourceName,
      UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
      false,
    );
    if (!started) return false;
    this.#controllerTriggers.delete('Skill');
    const pending = this.#pendingControllerAnimation;
    this.#pendingControllerAnimation = undefined;
    pending?.resolve(true);
    return true;
  }

  #evaluateControllerTransitions() {
    // Axie Controller.controller serializes Any State in this exact order.
    // Unity evaluates those transitions before state-local transitions.
    if (this.#controllerTriggers.has('Restart') && this.#resolveLocomotionEntries()) {
      this.#controllerTriggers.delete('Restart');
      this.#clearDeadExitTransition();
      this.#manualAction = undefined;
      this.#controllerAction = undefined;
      this.#controllerState = 'Locomotion';
      this.#startLocomotionBlend(0, true);
      return;
    }

    if (this.#controllerTriggers.has('Dead') && this.#controllerState !== 'Dead') {
      const sourceName = AXIE_UNITY_ANIMATOR_CONTROLLER.overrides.dead;
      this.#clearDeadExitTransition();
      if (this.#startControllerState(
        'Dead',
        sourceName,
        UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
        false,
      )) {
        this.#controllerTriggers.delete('Dead');
        return;
      }
    }

    if (this.#stunned && this.#controllerState !== 'Stun') {
      const sourceName = AXIE_UNITY_ANIMATOR_CONTROLLER.overrides.stun;
      this.#clearDeadExitTransition();
      if (this.#startControllerState(
        'Stun',
        sourceName,
        UNITY_STUN_TRANSITION_SECONDS,
        true,
      )) return;
    }

    if (this.#controllerState === 'Stun' && !this.#stunned) {
      this.#manualAction = undefined;
      this.#controllerAction = undefined;
      this.#controllerState = 'Locomotion';
      this.#startLocomotionBlend(UNITY_STUN_TRANSITION_SECONDS, false);
      return;
    }

    if (this.#isControllerLocomotion() && this.#controllerTriggers.has('Attack')) {
      const sourceName = this.#controllerClipName('Attack');
      if (sourceName && this.#startControllerState(
        'Attack',
        sourceName,
        UNITY_ATTACK_SKILL_TRANSITION_SECONDS,
        false,
      )) this.#controllerTriggers.delete('Attack');
    }
  }

  #cancelPendingControllerAnimation() {
    const pending = this.#pendingControllerAnimation;
    const hadTrigger = this.#controllerTriggers.delete('Skill');
    if (!pending) return hadTrigger;
    this.#pendingControllerAnimation = undefined;
    pending.resolve(false);
    return true;
  }

  #clearDeadExitTransition() {
    const transition = this.#deadExitTransition;
    if (!transition) return false;
    this.#deadExitTransition = undefined;
    transition.action.stop();
    if (this.#current === transition.action) {
      this.#current = undefined;
      this.#currentSourceName = undefined;
      this.#cuePlayback = undefined;
    }
    if (this.#manualAction === transition.action) this.#manualAction = undefined;
    if (this.#controllerAction === transition.action) this.#controllerAction = undefined;
    if (this.#controllerState === 'Exit') this.#controllerState = undefined;
    return true;
  }

  #requestExactAnimation(name: string, options: AxieAnimationPlayOptions): AnimationRequest {
    const action = this.#findAction(name);
    if (!action) return { accepted: false };
    const metadata = this.#actionMetadata.get(action);
    const sourceName = metadata?.sourceName ?? name;
    const weapon = this.#weaponRuntime?.weaponForClip(sourceName);
    // AnimatorSample never derives equipment from an animation string. Its
    // Attack/Skill buttons are disabled until a prefab is explicitly selected,
    // and the family override can only run while that exact prefab is active.
    if (weapon && (!weapon.available || weapon.id !== this.#weaponRuntime?.active)) {
      return { accepted: false };
    }

    const started = this.#startResolvedAnimation(action, metadata, sourceName, options);
    return { accepted: started };
  }

  #startResolvedAnimation(
    action: THREE.AnimationAction,
    metadata: ClipMetadata | undefined,
    sourceName: string,
    options: AxieAnimationPlayOptions,
  ) {
    const restart = options.restart ?? action !== this.#current;
    const continuing = action === this.#current && !restart;
    const configuredLoop = options.loop ?? metadata?.looping ?? false;
    const loopMode = continuing && options.loop === undefined
      ? action.loop
      : configuredLoop ? THREE.LoopRepeat : THREE.LoopOnce;
    const repetitions = continuing && options.loop === undefined
      ? action.repetitions
      : configuredLoop ? Infinity : 1;
    const clampWhenFinished = continuing && options.loop === undefined
      ? action.clampWhenFinished
      : !configuredLoop;
    const timeScale = options.timeScale ?? (continuing ? action.timeScale : 1);
    // LegacyAnimationSample calls Animation.Play, not CrossFade. The Animator
    // path supplies each of its source-authored 0/0.1/0.25 durations explicitly.
    const duration = Math.max(0, options.transition ?? 0);
    const previous = this.#current;
    this.#leaveLocomotionBlend(duration, action);
    action.enabled = true;
    action.paused = false;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.clampWhenFinished = clampWhenFinished;
    action.setLoop(loopMode, repetitions);
    if (this.#manualAction && this.#manualAction !== action) this.#manualAction = undefined;
    if (options.lockLocomotion === true) this.#manualAction = action;
    const weapon = this.#weaponRuntime?.weaponForClip(sourceName);
    const weaponState = weapon && weapon.id === this.#weaponRuntime?.active
      ? sourceName.slice(weapon.id.length + 1)
      : undefined;
    if (
      weaponState === 'Idle'
      || weaponState === 'Walk'
      || weaponState === 'Run'
      || weaponState === 'Attack'
      || weaponState === 'Skill'
    ) {
      this.#weaponRuntime?.playPairedAnimation(weaponState, {
        transition: duration,
        timeScale,
        restart,
      });
    }

    if (continuing) {
      this.#currentSourceName = sourceName;
      return true;
    }
    if (restart) action.reset();
    this.#beginAnimationCuePlayback(action, sourceName);
    action.play();
    this.#current = action;
    this.#currentSourceName = sourceName;
    if (previous && previous !== action) {
      // Unity's Animator controller uses fixed-duration transitions while each
      // state keeps its authored playback speed. Three's warp mode instead
      // time-scales both clips to synchronize unlike durations, which visibly
      // distorts the opening of long skills and short attacks.
      if (duration > 0) previous.crossFadeTo(action, duration, false);
      else previous.stop();
    }
    return true;
  }

  #beginAnimationCuePlayback(action: THREE.AnimationAction, sourceName: string) {
    const clip = action.getClip();
    this.#cuePlayback = {
      action,
      sourceName,
      runtimeName: clip.name,
      duration: Math.max(0, clip.duration),
      events: preparedAnimationCues(clip),
      previousTime: action.time,
      loop: 0,
      includePreviousTime: true,
      loopDelta: 0,
    };
  }

  #emitAnimationCueRange(
    playback: AnimationCuePlayback,
    start: number,
    end: number,
    loop: number,
    includeStart: boolean,
  ) {
    if (this.#cueListeners.size === 0 || end < start) return;
    playback.events.forEach((event) => {
      const time = event.sourceEvent.time;
      if ((time > start || (includeStart && time === start)) && time <= end) {
        const cue: AxieAnimationCue = Object.freeze({
          sourceName: playback.sourceName,
          runtimeName: playback.runtimeName,
          clipDuration: playback.duration,
          clipTime: time,
          loop,
          eventIndex: event.eventIndex,
          sourceEvent: event.sourceEvent,
          payload: event.payload,
        });
        [...this.#cueListeners].forEach((listener) => listener(cue));
      }
    });
  }

  #dispatchAnimationCues(
    playback: AnimationCuePlayback,
    nextTime: number,
    effectiveTimeScale: number,
  ) {
    if (effectiveTimeScale <= 0 || playback.duration <= 0) {
      playback.previousTime = nextTime;
      playback.includePreviousTime = false;
      playback.loopDelta = 0;
      return;
    }
    let wraps = Math.max(0, playback.loopDelta);
    // The mixer normally reports wraps. Retain a safe fallback for custom
    // AnimationAction implementations that expose only the wrapped time.
    if (wraps === 0 && nextTime < playback.previousTime) wraps = 1;

    if (wraps === 0) {
      this.#emitAnimationCueRange(
        playback,
        playback.previousTime,
        nextTime,
        playback.loop,
        playback.includePreviousTime,
      );
    } else {
      this.#emitAnimationCueRange(
        playback,
        playback.previousTime,
        playback.duration,
        playback.loop,
        playback.includePreviousTime,
      );
      for (let wrap = 1; wrap < wraps; wrap += 1) {
        this.#emitAnimationCueRange(playback, 0, playback.duration, playback.loop + wrap, true);
      }
      this.#emitAnimationCueRange(playback, 0, nextTime, playback.loop + wraps, true);
      playback.loop += wraps;
    }
    playback.previousTime = nextTime;
    playback.includePreviousTime = false;
    playback.loopDelta = 0;
  }

  async equipWeapon(weaponId?: string | null) {
    if (this.#disposed || !this.#weaponRuntime) return weaponId == null || weaponId === '';
    const capability = weaponId == null || weaponId === ''
      ? undefined
      : this.#weaponRuntime.capabilityForSelection(weaponId);
    const isNone = weaponId == null || weaponId === '';
    const availableSelection = !isNone
      && capability?.available === true
      && this.#weaponRuntime.isSelectionAvailable(weaponId);
    if (!isNone && !availableSelection) {
      // Preserve AxieWeaponRuntime's exact source diagnostic without altering
      // the currently selected prefab or Animator overrides.
      return this.#weaponRuntime.equip(weaponId);
    }

    const requestGeneration = ++this.#weaponEquipGeneration;
    const wasActiveSelection = !isNone && this.#weaponRuntime.isActiveSelection(weaponId);

    // Unity destroys the previous prefab before creating the selected one.
    // When the same button is selected twice AxieWeaponRuntime would otherwise
    // reuse its cache instance, so explicitly reproduce the sample lifecycle.
    if (wasActiveSelection) {
      const removed = await this.#weaponRuntime.equip(null);
      if (!removed || this.#disposed || requestGeneration !== this.#weaponEquipGeneration) {
        return false;
      }
    }

    const equipPromise = this.#weaponRuntime.equip(weaponId);

    const equipped = await equipPromise;
    const selectionIsCurrent = weaponId == null || weaponId === ''
      ? this.#weaponRuntime.active === undefined
        && this.#weaponRuntime.loading === undefined
      : this.#weaponRuntime.isActiveSelection(weaponId);
    if (!equipped
      || this.#disposed
      || requestGeneration !== this.#weaponEquipGeneration
      || !selectionIsCurrent) return false;

    if (isNone) {
      // AnimatorSample UpdateAnimations(null) installs Default Idle/Walk/Run,
      // keeps the last Attack/Skill overrides, then sets Restart. Unity consumes
      // that trigger during the next Animator evaluation.
      this.#weaponPrefix = undefined;
      this.#controllerTriggers.add('Restart');
      return true;
    }

    // Selecting a prefab replaces the five family overrides. It does not fire
    // a trigger or create a source-independent 0.12/0.16 second transition.
    this.#weaponPrefix = this.#weaponRuntime.active;
    this.#controllerActionPrefix = this.#weaponRuntime.active;
    if (this.#isControllerLocomotion()) this.#startLocomotionBlend(0, false);
    return true;
  }

  getLiteAnimationClip(name: string) {
    return this.#requireAnimationClip('lite', name);
  }

  getFullAnimationClip(name: string) {
    return this.#requireAnimationClip('full', name);
  }

  renderAvatar(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions = {},
  ) {
    if (this.#disposed) throw new Error('Cannot render an avatar for a disposed Axie character.');
    return renderAxieAvatar(renderer, this.model, target, options);
  }

  resumeLocomotion(transition?: number) {
    if (this.#disposed) return;
    void transition;
    // AnimatorSample does not command Locomotion directly here; it writes the
    // Stunned bool false and Axie Controller's authored 0.25 s transition owns
    // the state change on the next Animator evaluation.
    this.#stunned = false;
  }

  update(deltaSeconds: number) {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    // AnimatorSample lets Unity's Animator consume the complete scaled frame
    // delta. Capping hitches here would change normalized-time transitions,
    // trigger consumption, and authored event timing relative to the source.
    const delta = deltaSeconds;
    this.#elapsedSeconds += delta;
    this.#evaluateControllerTransitions();
    const cuePlayback = this.#cuePlayback;
    const deadExitTransition = this.#deadExitTransition;
    if (cuePlayback) cuePlayback.loopDelta = 0;
    const skillExitReached = this.#advanceLocomotionState(delta);
    const effectiveTimeScale = cuePlayback
      ? (this.#controllerState === 'Locomotion' ? 1 : cuePlayback.action.getEffectiveTimeScale())
      : 0;
    this.#mixer.update(delta);
    this.#weaponRuntime?.update(delta);
    if (cuePlayback) {
      this.#dispatchAnimationCues(cuePlayback, cuePlayback.action.time, effectiveTimeScale);
    }
    if (skillExitReached) this.#startQueuedSkill();
    // A Dead transition created by the finished event begins at the end of
    // this mixer step. Only a transition that existed before the step spends
    // time here, preserving the controller's complete fixed 0.25 s exit.
    if (deadExitTransition && deadExitTransition === this.#deadExitTransition) {
      deadExitTransition.remaining -= delta;
      if (deadExitTransition.remaining <= 0) this.#clearDeadExitTransition();
    }
    // Mesh Mystic shaders follow character time; particle runtimes then apply
    // their own Unity ParticleSystem clocks to their materials.
    this.#assembly.setMysticMaterialTime?.(this.model, this.#elapsedSeconds);
    this.#assembly.addonRuntimes.forEach((runtime) => runtime.update(delta));
  }

  setVisible(visible: boolean) {
    if (!this.#disposed) this.wrapper.visible = visible;
  }

  dispose() {
    if (this.#disposed) return;
    this.#cancelPendingControllerAnimation();
    this.#clearDeadExitTransition();
    this.#disposed = true;
    this.#mixer.removeEventListener('finished', this.#finishedListener);
    this.#mixer.removeEventListener('loop', this.#loopListener);
    this.#weaponRuntime?.dispose();
    this.#mixer.stopAllAction();
    new Set([
      ...this.#assembly.clipSets.lite,
      ...this.#assembly.clipSets.full,
    ]).forEach((clip) => this.#mixer.uncacheClip(clip));
    this.#mixer.uncacheRoot(this.model);
    for (let index = this.#assembly.addonRuntimes.length - 1; index >= 0; index -= 1) {
      this.#assembly.addonRuntimes[index].dispose();
    }
    this.wrapper.removeFromParent();
    this.#assembly.ownedMaterials.forEach((material) => material.dispose());
    for (let index = this.#assembly.leases.length - 1; index >= 0; index -= 1) {
      this.#assembly.leases[index].release();
    }
    this.wrapper.clear();
    this.#actions.clear();
    this.#actionMetadata.clear();
    this.#current = undefined;
    this.#currentSourceName = undefined;
    this.#manualAction = undefined;
    this.#pendingControllerAnimation = undefined;
    this.#controllerTriggers.clear();
    this.#controllerState = undefined;
    this.#controllerAction = undefined;
    this.#deadExitTransition = undefined;
    this.#locomotionBlend = undefined;
    this.#weaponEquipGeneration += 1;
    this.#weaponPrefix = undefined;
    this.#controllerActionPrefix = undefined;
    this.#cuePlayback = undefined;
    this.#cueListeners.clear();
    this.#onDispose?.(this);
  }

  #requireAnimationClip(set: AxieAnimationSet, name: string) {
    if (this.#disposed) throw new Error('Axie character is disposed.');
    const clip = this.#clipSets[set].get(name);
    if (!clip) throw new Error(`Animation ${name} is not available in the ${set} set.`);
    return clip;
  }
}
