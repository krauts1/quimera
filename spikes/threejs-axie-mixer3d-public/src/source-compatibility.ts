import * as THREE from 'three';
import {
  AXIE_BODY_TYPES,
  AXIE_PART_TYPES,
  AXIE_RIG_TO_PART_TYPE,
  AXIE_RIG_TYPES,
  formatAxieAddonId,
  formatAxiePartAssetId,
  type AxieBodyType,
  type AxieDescriptor,
  type AxiePartDescriptor,
  type AxiePartType,
  type AxieRigType,
} from './domain';
import { decodeAxieGenes } from './genes-decoder';
import type {
  AxieBodyAssetManifest,
  AxieMixerManifest,
} from './manifest';
import {
  resolveAxieBodyLodIndex,
  resolveAxiePartLodIndex,
} from './quality';
import { AxieInstantiationParams } from './character3d';

/** Source commit whose public/runtime semantics this compatibility layer models. */
export const AXIE_SOURCE_COMPATIBILITY_COMMIT = 'public-content-v1' as const;
export const AXIE_FACTORY_RESOURCE_PATH = 'AxieMixer3D/AxieFactory' as const;
export const AXIE_DATA_RESOURCE_PATH = 'AxieMixer3D/Data' as const;
export const AXIE_PRIMARY_COLOR_PROPERTY = '_PrimaryColor' as const;
export const AXIE_SECONDARY_COLOR_PROPERTY = '_SecondaryColor' as const;

/** Explicit browser policy for source defects that cannot be inferred safely. */
export const AXIE_SOURCE_EDGE_POLICIES = Object.freeze({
  nullParts: 'throw-during-unity-coercion',
  coercion: 'preserve-source-no-op',
  unsupportedPart: 'omit-missing-resource-key',
  missingEyeMouth: 'preserve-48-known-absences',
  classCase: 'resource-key-is-case-sensitive',
  missingBody: 'return-null-from-compatibility-factory',
  bodyLodThree: 'retain-prefab-body-and-clamp-parts; public-quality-range-0-2',
  animationTrackMismatch: 'warn-and-keep-playable-tracks',
  missingColor: 'preserve-authored-material-when-palette-row-is-absent',
  obsoleteAnimations: 'never-type-plus-runtime-error',
  readmeConstructor: 'reject-source-readme-constructor-shape',
  readmeClips: 'exact-dictionary-lookup-throws-for-absent-names',
  stackalloc: 'deterministically-zero-initialize-web-decoder',
  overlongGenes: 'deterministic-too-long-error-at-129-contiguous-hex-digits',
  invalidGeneCharacter: 'truncate-higher-prefix-like-source',
  noSourceTests: 'use-source-pinned-web-oracles-and-retained-evidence',
} as const);

const SOURCE_BODY_NAMES: Readonly<Record<AxieBodyType, string>> = Object.freeze({
  normal: 'Normal',
  spiky: 'Spiky',
  fuzzy: 'Fuzzy',
  curly: 'Curly',
  sumo: 'Sumo',
  wetdog: 'Wetdog',
  bigyak: 'Bigyak',
  frosty: 'Frosty',
});

/** Runtime declaration sets mirrored from the three source enums. */
export const AXIE_SOURCE_ENUMS = Object.freeze({
  AxieBodyType: AXIE_BODY_TYPES,
  AxiePartType: AXIE_PART_TYPES,
  AxieRigType: AXIE_RIG_TYPES,
});

export function ToAxiePartType(rigType: AxieRigType): AxiePartType {
  const partType = AXIE_RIG_TO_PART_TYPE[rigType];
  if (!partType) throw new Error(`Unknown AxieRigType: ${String(rigType)}`);
  return partType;
}

export const AxieRigTypeExtensions = Object.freeze({ ToAxiePartType });

/** Browser marker corresponding to Unity's property-only LayerFieldAttribute. */
export class LayerFieldAttribute {
  readonly kind = 'layer-field' as const;
}

/** DOM/editor adapter for the source drawer's integer-layer behavior. */
export class LayerFieldAttributeDrawer {
  OnGUI<T>(value: T, selectedLayer?: number): T | number {
    if (typeof value !== 'number' || !Number.isInteger(value)) return value;
    return selectedLayer === undefined ? value : Math.trunc(selectedLayer);
  }
}

/** Mutable source-shaped descriptor used by compatibility/editor examples. */
export class AxiePartDescriptorCompatibility implements AxiePartDescriptor {
  type: AxiePartType;
  skin: number;
  class: AxiePartDescriptor['class'];
  variant: number;
  level: number;

  constructor(values: Partial<AxiePartDescriptor> = {}) {
    this.type = values.type ?? 'back';
    this.skin = values.skin ?? 0;
    this.class = values.class ?? null;
    this.variant = values.variant ?? 0;
    this.level = values.level ?? 0;
  }
}

/** Source-shaped AxieDescriptor, including its static FromGenes entry point. */
export class AxieDescriptorCompatibility implements AxieDescriptor {
  colorVariant: number;
  body: AxieBodyType;
  parts: AxiePartDescriptorCompatibility[];

  constructor(values: Partial<AxieDescriptor> = {}) {
    this.colorVariant = values.colorVariant ?? 0;
    this.body = values.body ?? 'normal';
    this.parts = (values.parts ?? []).map((part) => new AxiePartDescriptorCompatibility(part));
  }

  static FromGenes(genes: string) {
    return new AxieDescriptorCompatibility(decodeAxieGenes(genes).descriptor);
  }
}

export class AxieAnimationDataCompatibility<TClip = unknown> {
  constructor(
    public name = '',
    public clip: TClip | null = null,
  ) {}
}

export class AxieBodyDataCompatibility<TPrefab = unknown, TMesh = unknown, TClip = unknown> {
  prefab: TPrefab | null;
  lodMeshes: TMesh[];
  liteAnimations: AxieAnimationDataCompatibility<TClip>[];
  fullAnimations: AxieAnimationDataCompatibility<TClip>[];
  LiteAnimations: ReadonlyMap<string, AxieAnimationDataCompatibility<TClip>>;
  FullAnimations: ReadonlyMap<string, AxieAnimationDataCompatibility<TClip>>;

  constructor(values: Partial<AxieBodyDataCompatibility<TPrefab, TMesh, TClip>> = {}) {
    this.prefab = values.prefab ?? null;
    this.lodMeshes = [...(values.lodMeshes ?? [])];
    this.liteAnimations = [...(values.liteAnimations ?? [])];
    this.fullAnimations = [...(values.fullAnimations ?? [])];
    this.LiteAnimations = new Map(this.liteAnimations.map((animation) => [animation.name, animation]));
    this.FullAnimations = new Map(this.fullAnimations.map((animation) => [animation.name, animation]));
  }
}

export class AxieRigDataCompatibility<TPrefab = unknown, TMesh = unknown> {
  type: AxieRigType;
  prefab: TPrefab | null;
  lodMeshes: TMesh[];

  constructor(values: Partial<AxieRigDataCompatibility<TPrefab, TMesh>> = {}) {
    this.type = values.type ?? 'Back_L';
    this.prefab = values.prefab ?? null;
    this.lodMeshes = [...(values.lodMeshes ?? [])];
  }
}

export class AxiePartDataCompatibility<TPrefab = unknown, TMesh = unknown> {
  rigs: AxieRigDataCompatibility<TPrefab, TMesh>[];

  constructor(rigs: readonly AxieRigDataCompatibility<TPrefab, TMesh>[] = []) {
    this.rigs = [...rigs];
  }
}

export interface AxieMixerColorVariantInput {
  readonly index?: unknown;
  readonly key?: unknown;
  readonly skin?: unknown;
  readonly class?: unknown;
  readonly color_value?: unknown;
  readonly primary1?: unknown;
  readonly primary2?: unknown;
}

export class AxieMixerColorVariantCompatibility {
  index = 0;
  key: string | null = null;
  skin = 0;
  class: string | null = null;
  color_value = 0;
  primary1: string | null = null;
  primary2: string | null = null;

  constructor(values: AxieMixerColorVariantInput = {}) {
    if (typeof values.index === 'number') this.index = Math.trunc(values.index);
    if (typeof values.key === 'string') this.key = values.key;
    if (typeof values.skin === 'number') this.skin = Math.trunc(values.skin);
    if (typeof values.class === 'string') this.class = values.class;
    if (typeof values.color_value === 'number') this.color_value = Math.trunc(values.color_value);
    if (typeof values.primary1 === 'string') this.primary1 = values.primary1;
    if (typeof values.primary2 === 'string') this.primary2 = values.primary2;
  }
}

export class AxieMixerItemsCompatibility {
  colors: AxieMixerColorVariantCompatibility[] | null;

  constructor(colors: readonly AxieMixerColorVariantCompatibility[] | null = null) {
    this.colors = colors ? [...colors] : null;
  }
}

export class AxieMixerConfigCompatibility {
  items: AxieMixerItemsCompatibility;

  constructor(items = new AxieMixerItemsCompatibility()) {
    this.items = items;
  }
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/** Unity JsonUtility projection: only fields present in the C# structs survive. */
export function importAxieMixerConfigJson(json: string): AxieMixerConfigCompatibility {
  const root = objectRecord(JSON.parse(json));
  const items = objectRecord(root?.items);
  const rows = Array.isArray(items?.colors) ? items.colors : null;
  const colors = rows?.map((row) => new AxieMixerColorVariantCompatibility(
    objectRecord(row) as AxieMixerColorVariantInput | undefined,
  )) ?? null;
  return new AxieMixerConfigCompatibility(new AxieMixerItemsCompatibility(colors));
}

export function projectManifestToAxieMixerConfig(manifest: AxieMixerManifest) {
  return new AxieMixerConfigCompatibility(new AxieMixerItemsCompatibility(
    manifest.creator.colorVariants.map((color) => new AxieMixerColorVariantCompatibility({
      index: color.index,
      key: color.key,
      skin: color.skin,
      class: color.class,
      color_value: color.colorValue,
      primary1: color.primary1,
      primary2: color.primary2,
    })),
  ));
}

export type AxieResolvedSourceColors =
  | {
    readonly variant: undefined;
    readonly primary: undefined;
    readonly secondary: undefined;
    readonly warnings: readonly string[];
  }
  | {
    readonly variant: AxieMixerColorVariantCompatibility;
    readonly primary: string;
    readonly secondary: string;
    readonly warnings: readonly string[];
  };

function normalizedHtmlColor(value: string | null, property: string, warnings: string[]) {
  if (value && /^(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.test(value)) {
    const expanded = value.length === 3 || value.length === 4
      ? value.split('').map((digit) => `${digit}${digit}`).join('')
      : value;
    return `#${expanded.slice(0, 6).toLowerCase()}`;
  }
  warnings.push(`Cannot parse ${property} color #${value ?? ''}`);
  return '#ffffff';
}

/** First-index lookup plus Unity's white fallback for invalid fields on a found row. */
export function resolveAxieUnityColors(
  config: AxieMixerConfigCompatibility | null | undefined,
  colorVariant: number,
): AxieResolvedSourceColors {
  const warnings: string[] = [];
  const variant = config?.items.colors?.find((candidate) => candidate.index === colorVariant);
  // AxieFactory.Colorize returns before initializing colors or touching any
  // renderer when FirstOrDefault cannot find the requested palette row.
  if (!variant) {
    return {
      variant: undefined,
      primary: undefined,
      secondary: undefined,
      warnings,
    };
  }
  return {
    variant,
    primary: normalizedHtmlColor(variant.primary1, AXIE_PRIMARY_COLOR_PROPERTY, warnings),
    secondary: normalizedHtmlColor(variant.primary2, AXIE_SECONDARY_COLOR_PROPERTY, warnings),
    warnings,
  };
}

export interface AxieColorizableRenderer {
  material: THREE.Material | THREE.Material[];
  userData: Record<string, unknown>;
}

function setSourceMaterialColors(material: THREE.Material, colors: AxieResolvedSourceColors) {
  material.userData.axieSourceColorProperties = Object.freeze({
    [AXIE_PRIMARY_COLOR_PROPERTY]: colors.primary,
    [AXIE_SECONDARY_COLOR_PROPERTY]: colors.secondary,
  });
}

/**
 * Engine-neutral proof adapter for Unity's property-block/material ownership.
 * Production shaders consume the same two property names elsewhere; this helper
 * intentionally changes ownership only and never edits shader code.
 */
export function applyAxieUnityColorization(
  renderers: readonly AxieColorizableRenderer[],
  config: AxieMixerConfigCompatibility | null | undefined,
  colorVariant: number,
  useMaterialPropertyBlocks: boolean,
) {
  const colors = resolveAxieUnityColors(config, colorVariant);
  const ownedMaterials: THREE.Material[] = [];
  if (!colors.variant) {
    return { ...colors, propertyValues: undefined, ownedMaterials };
  }
  const propertyValues = Object.freeze({
    [AXIE_PRIMARY_COLOR_PROPERTY]: colors.primary,
    [AXIE_SECONDARY_COLOR_PROPERTY]: colors.secondary,
  });

  renderers.forEach((renderer) => {
    if (useMaterialPropertyBlocks) {
      renderer.userData.axieMaterialPropertyBlock = propertyValues;
      return;
    }
    const sources = Array.isArray(renderer.material) ? renderer.material : [renderer.material];
    const clones = sources.map((material) => {
      const clone = material.clone();
      setSourceMaterialColors(clone, colors);
      ownedMaterials.push(clone);
      return clone;
    });
    renderer.material = Array.isArray(renderer.material) ? clones : clones[0];
  });

  return { ...colors, propertyValues, ownedMaterials };
}

export type AxieAddonCompatibilityAsset<TMaterial, TPrefab> =
  | { readonly kind: 'material'; readonly name: string; readonly value: TMaterial }
  | { readonly kind: 'prefab'; readonly value: TPrefab };

export interface AxieAddonCompatibilitySet<TMaterial, TPrefab> {
  readonly materials: ReadonlyMap<string, TMaterial>;
  readonly prefabs: readonly TPrefab[];
}

/** Exact cache/precedence shape used by AxieFactory.GetAddons. */
export class AxieAddonCacheCompatibility<TMaterial, TPrefab> {
  readonly #cache = new Map<string, AxieAddonCompatibilitySet<TMaterial, TPrefab>>();

  get size() {
    return this.#cache.size;
  }

  GetAddons(
    addonName: string,
    addonPaths: readonly string[],
    loadAll: (path: string, addonName: string) => readonly AxieAddonCompatibilityAsset<TMaterial, TPrefab>[],
  ) {
    const cached = this.#cache.get(addonName);
    if (cached) return cached;
    const materials = new Map<string, TMaterial>();
    const prefabs: TPrefab[] = [];
    addonPaths.forEach((path) => {
      loadAll(path, addonName).forEach((asset) => {
        if (asset.kind === 'material') materials.set(asset.name, asset.value);
        else prefabs.push(asset.value);
      });
    });
    const result = Object.freeze({ materials, prefabs: Object.freeze(prefabs) });
    this.#cache.set(addonName, result);
    return result;
  }

  ClearCache() {
    this.#cache.clear();
  }
}

export function formatAxieBodyResourceKey(body: AxieBodyType) {
  return `${AXIE_DATA_RESOURCE_PATH}/Bodies/${SOURCE_BODY_NAMES[body]}`;
}

export function resolveAxieBodyOrNull(
  manifest: AxieMixerManifest,
  body: AxieBodyType | string,
): AxieBodyAssetManifest | null {
  return manifest.assets.bodies[body as AxieBodyType] ?? null;
}

export const AxieFactorySemantics = Object.freeze({
  formatPartKey: formatAxiePartAssetId,
  formatAddonKey: formatAxieAddonId,
  resolveBodyLod: resolveAxieBodyLodIndex,
  resolvePartLod: resolveAxiePartLodIndex,
});

export interface AxieCollectedAttachPoints {
  readonly attachPoints: ReadonlyMap<AxieRigType, THREE.Object3D>;
  readonly leftWeaponAttachPoint: THREE.Object3D | undefined;
  readonly rightWeaponAttachPoint: THREE.Object3D | undefined;
}

/** Exact ^Root_(\w+)_JNT$ collection and case-sensitive enum parsing. */
export function collectAxieAttachPoints(root: THREE.Object3D): AxieCollectedAttachPoints {
  const attachPoints = new Map<AxieRigType, THREE.Object3D>();
  let leftWeaponAttachPoint: THREE.Object3D | undefined;
  let rightWeaponAttachPoint: THREE.Object3D | undefined;
  root.traverse((node) => {
    const match = /^Root_(\w+)_JNT$/u.exec(node.name);
    if (!match) return;
    const rigTypeName = match[1];
    if ((AXIE_RIG_TYPES as readonly string[]).includes(rigTypeName)) {
      attachPoints.set(rigTypeName as AxieRigType, node);
      return;
    }
    if (rigTypeName === 'Weapon_R') rightWeaponAttachPoint = node;
    else if (rigTypeName === 'Weapon_L') leftWeaponAttachPoint = node;
  });
  return { attachPoints, leftWeaponAttachPoint, rightWeaponAttachPoint };
}

export interface AxieAvatarPassMaterialCompatibility {
  FindPass(name: 'ExtraPrePass' | 'Forward'): number;
}

export interface AxieAvatarPassRendererCompatibility {
  readonly materials: readonly AxieAvatarPassMaterialCompatibility[];
}

export interface AxieAvatarPassDraw {
  readonly rendererIndex: number;
  readonly subMeshIndex: number;
  readonly passName: 'ExtraPrePass' | 'Forward';
  readonly passIndex: number;
}

/** Executes the source avatar command order for each skinned submesh. */
export function executeAxieAvatarShaderPasses(
  renderers: readonly AxieAvatarPassRendererCompatibility[],
  draw: (command: AxieAvatarPassDraw) => void,
) {
  const commands: AxieAvatarPassDraw[] = [];
  renderers.forEach((renderer, rendererIndex) => {
    renderer.materials.forEach((material, subMeshIndex) => {
      for (const passName of ['ExtraPrePass', 'Forward'] as const) {
        const passIndex = material.FindPass(passName);
        if (passIndex < 0) continue;
        const command = { rendererIndex, subMeshIndex, passName, passIndex };
        commands.push(command);
        draw(command);
      }
    });
  });
  return commands;
}

/**
 * Reproduces the checked-in struct-copy bug: the returned list is copied, but
 * intended skin/level edits are applied only to discarded local values.
 */
export function coerceAxieDescriptorUnityCompatible(
  descriptor: AxieDescriptor | (Omit<AxieDescriptor, 'parts'> & { readonly parts: null }),
): AxieDescriptor {
  // Spreading null deliberately throws, matching descriptor.parts.ToList().
  const parts = [...descriptor.parts as readonly AxiePartDescriptor[]]
    .map((part) => ({ ...part }));
  for (let index = 0; index < parts.length; index += 1) {
    const local = { ...parts[index] };
    local.skin = local.skin === 1 && local.variant === 2 ? 1 : 0;
    local.level = 1;
    void local;
  }
  return { ...descriptor, parts };
}

export interface AxieFactoryCompatibilityAdapter<TCharacter> {
  create(
    descriptor: AxieDescriptor,
    instantiationParams: AxieInstantiationParams,
  ): Promise<TCharacter> | TCharacter;
  clearCache?(): void;
}

/** Browser facade for AxieFactory.Default/CreateCharacter/ClearCache. */
export class AxieFactoryCompatibility<TCharacter = unknown> {
  static readonly DefaultResourcePath = AXIE_FACTORY_RESOURCE_PATH;
  static #defaultFactory: AxieFactoryCompatibility<unknown> | undefined;

  static get Default() {
    return this.#defaultFactory;
  }

  static InstallDefault<T>(factory: AxieFactoryCompatibility<T>) {
    const previous = this.#defaultFactory;
    this.#defaultFactory = factory as AxieFactoryCompatibility<unknown>;
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      if (this.#defaultFactory === factory) this.#defaultFactory = previous;
    };
  }

  readonly defaultInstantiationParams: AxieInstantiationParams;

  constructor(
    readonly manifest: AxieMixerManifest,
    readonly adapter: AxieFactoryCompatibilityAdapter<TCharacter>,
    defaultInstantiationParams = new AxieInstantiationParams({ lodLevel: 2 }),
  ) {
    this.defaultInstantiationParams = new AxieInstantiationParams(defaultInstantiationParams);
  }

  async CreateCharacter(
    descriptor: AxieDescriptor,
    instantiationParams: AxieInstantiationParams | null = null,
  ): Promise<TCharacter | null> {
    const compatible = coerceAxieDescriptorUnityCompatible(descriptor);
    if (!resolveAxieBodyOrNull(this.manifest, compatible.body)) return null;
    const merged = this.defaultInstantiationParams.Merge(instantiationParams);
    return this.adapter.create(compatible, merged);
  }

  ClearCache() {
    this.adapter.clearCache?.();
  }
}
