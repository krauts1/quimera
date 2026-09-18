import * as THREE from 'three';
import type {
  AxieDescriptor,
  AxiePartType,
} from './domain';
import {
  renderAxieAvatar,
  type AxieAvatarRenderOptions,
} from './avatar';
import {
  ThreeAxiePlayableCharacter,
  type ThreeAxiePlayableOptions,
} from './playable';
import type {
  AxieAssemblyResult,
  AxieMixPlan,
} from './runtime';

export interface AxiePartLayerOverride {
  type: AxiePartType;
  layer: number;
}

/** Source-shaped AxieInstantiationParams, including Unity's pairwise Merge rules. */
export class AxieInstantiationParams {
  lodLevel = 0;
  useMaterialPropertyBlocks = false;
  partLayerOverrides: AxiePartLayerOverride[] = [];

  constructor(values: Partial<AxieInstantiationParams> = {}) {
    if (values.lodLevel !== undefined) this.lodLevel = values.lodLevel;
    if (values.useMaterialPropertyBlocks !== undefined) {
      this.useMaterialPropertyBlocks = values.useMaterialPropertyBlocks;
    }
    if (values.partLayerOverrides !== undefined) {
      this.partLayerOverrides = values.partLayerOverrides.map((entry) => ({ ...entry }));
    }
  }

  Merge(other: AxieInstantiationParams | null | undefined) {
    if (other == null) return this;
    const overrides = this.partLayerOverrides.map((entry) => ({ ...entry }));
    other.partLayerOverrides.forEach((override) => {
      const index = overrides.findIndex((entry) => entry.type === override.type);
      if (index >= 0) overrides[index] = { ...override };
      else overrides.push({ ...override });
    });
    return new AxieInstantiationParams({
      lodLevel: other.lodLevel < 0 ? this.lodLevel : other.lodLevel,
      useMaterialPropertyBlocks: other.useMaterialPropertyBlocks,
      partLayerOverrides: overrides,
    });
  }

  merge(other: AxieInstantiationParams | null | undefined) {
    return this.Merge(other);
  }
}

export interface AxieCharacter3DFactory {
  /** Unity returns null when the requested body resource is absent. */
  createFromDescriptor(
    descriptor: AxieDescriptor,
    instantiationParams?: AxieInstantiationParams | null,
  ): Promise<AxieCharacter3D | null>;
  /** Unity decodes first, then preserves the same nullable body lookup. */
  createFromGenes(
    genes: string,
    instantiationParams?: AxieInstantiationParams | null,
  ): Promise<AxieCharacter3D | null>;
}

interface FactoryRegistration {
  readonly token: symbol;
  readonly factory: AxieCharacter3DFactory;
}

const DEFAULT_FACTORIES: FactoryRegistration[] = [];

function defaultFactory() {
  const factory = DEFAULT_FACTORIES.at(-1)?.factory;
  if (!factory) {
    throw new Error(
      'AxieCharacter3D default factory is not initialized. Install a factory or construct ThreeAxieMixer3D with registerAsDefaultCharacterFactory: true.',
    );
  }
  return factory;
}

function renderable(node: THREE.Object3D) {
  const candidate = node as THREE.Object3D & {
    isMesh?: boolean;
    isPoints?: boolean;
    isLine?: boolean;
    isSprite?: boolean;
  };
  return !!(candidate.isMesh || candidate.isPoints || candidate.isLine || candidate.isSprite);
}

/**
 * Source-compatible character surface over the playable Three.js runtime.
 * Static creation is necessarily asynchronous because browser assets are fetched.
 */
export class AxieCharacter3D extends ThreeAxiePlayableCharacter {
  readonly InstantiationParams: AxieInstantiationParams;
  readonly Root: THREE.Group;
  readonly RightWeaponAttachPoint?: THREE.Object3D;
  readonly LeftWeaponAttachPoint?: THREE.Object3D;
  readonly AnimationNames: readonly string[];

  constructor(
    assembly: AxieAssemblyResult,
    plan: AxieMixPlan,
    instantiationParams = new AxieInstantiationParams({ lodLevel: plan.quality.requestedLod }),
    playableOptions?: ThreeAxiePlayableOptions,
  ) {
    super(assembly, plan, playableOptions);
    this.InstantiationParams = new AxieInstantiationParams(instantiationParams);
    // AxieFactory returns the instantiated body prefab, not a game/runtime
    // helper wrapper. The converted body scene is the closest source object;
    // camera/collision helpers remain outside this compatibility surface.
    this.Root = this.model;
    this.RightWeaponAttachPoint = this.anchors.rightWeapon;
    this.LeftWeaponAttachPoint = this.anchors.leftWeapon;
    this.AnimationNames = this.animationNames;
    this.#applyPartLayerOverrides(plan);
  }

  static InstallDefaultFactory(factory: AxieCharacter3DFactory) {
    const registration = { token: Symbol('AxieCharacter3DFactory'), factory };
    DEFAULT_FACTORIES.push(registration);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      const index = DEFAULT_FACTORIES.findIndex((entry) => entry.token === registration.token);
      if (index >= 0) DEFAULT_FACTORIES.splice(index, 1);
    };
  }

  static FromDescriptor(
    descriptor: AxieDescriptor,
    instantiationParams: AxieInstantiationParams | null = null,
  ) {
    return defaultFactory().createFromDescriptor(descriptor, instantiationParams);
  }

  static FromGenes(
    genes: string,
    instantiationParams: AxieInstantiationParams | null = null,
  ) {
    return defaultFactory().createFromGenes(genes, instantiationParams);
  }

  /**
   * @deprecated This source property is a hard compile error in C#. The web port
   * exposes `never` and throws at runtime; use the lite/full lookup methods.
   */
  get Animations(): never {
    throw new Error(
      'Animations is obsolete. Use GetLiteAnimationClip(name) or GetFullAnimationClip(name) instead.',
    );
  }

  GetLiteAnimationClip(name: string) {
    return this.getLiteAnimationClip(name);
  }

  GetFullAnimationClip(name: string) {
    return this.getFullAnimationClip(name);
  }

  RenderAvatar(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions,
  ) {
    if (this.disposed) throw new Error('Cannot render an avatar for a disposed Axie character.');
    return renderAxieAvatar(renderer, this.Root, target, options);
  }

  Dispose() {
    this.dispose();
  }

  override setVisible(visible: boolean) {
    if (this.disposed) return;
    // Root may have been reparented exactly like Behaviour.SetParent(false).
    this.Root.visible = visible;
    this.wrapper.visible = visible;
  }

  override dispose() {
    if (this.disposed) return;
    // AxieCharacter3DBehaviour reparents Root away from the web ownership
    // wrapper. Detach it explicitly, then let the playable runtime release its
    // mixer, add-ons, material instances, and leases before clearing the body.
    this.Root.removeFromParent();
    super.dispose();
    this.Root.clear();
  }

  #applyPartLayerOverrides(plan: AxieMixPlan) {
    if (this.InstantiationParams.partLayerOverrides.length === 0) return;
    const partTypeByOccurrence = new Map(
      plan.partRigs.map((rig) => [`${rig.partId}:${rig.rigType}`, rig.partType]),
    );
    this.model.traverse((node) => {
      const partId = typeof node.userData.axiePartId === 'string' ? node.userData.axiePartId : undefined;
      const rigType = typeof node.userData.axieRigType === 'string' ? node.userData.axieRigType : undefined;
      if (!partId || !rigType || typeof node.userData.axieAddonId === 'string') return;
      const partType = partTypeByOccurrence.get(`${partId}:${rigType}`);
      const override = this.InstantiationParams.partLayerOverrides.find((entry) => entry.type === partType);
      if (!override) return;
      node.traverse((child) => {
        if (renderable(child)) child.layers.set(Math.max(0, Math.min(31, Math.trunc(override.layer))));
      });
    });
  }
}
