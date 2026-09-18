import * as THREE from 'three';
import { AXIE_ADDON_SOURCE_CATALOG } from './addon-source-catalog.generated';
import {
  MysticSourceMaterialFactory,
  AXIE_MYSTIC_MATERIAL_FACTORY,
} from './mystic-material-factory';
import { ThreeAddonParticleRuntime } from './addon-particle-runtime';
import type {
  AddonParticleRuntime,
  AddonPrefabRuntime,
  AddonParticleResetOptions,
  AddonPrefabSchema,
  AddonSourceCatalog,
  MysticDiagnostic,
  MysticDiagnosticSink,
  MysticMaterialFactoryOptions,
  MysticQualityId,
  MysticQualityProfile,
} from './mystic-types';

export interface ThreeAddonPrefabFactoryOptions {
  readonly catalog?: AddonSourceCatalog;
  readonly materialFactory?: MysticSourceMaterialFactory;
  readonly materialOptions: Omit<MysticMaterialFactoryOptions, 'quality'>;
  readonly quality?: MysticQualityId | MysticQualityProfile;
  readonly onDiagnostic?: MysticDiagnosticSink;
  readonly strict?: boolean;
  /**
   * `exported-glb-bone` matches the Blender glTF body export: Model is +90° X,
   * 0.01 scale, and local X is mirrored from Unity.
   */
  readonly coordinateBasis?: AddonCoordinateBasis;
}

export type AddonCoordinateBasis = 'unity' | 'exported-glb-bone';

export const AXIE_EXPORTED_BONE_UNIT_SCALE = 100;

export interface AddonDependencySet {
  readonly prefabIds: readonly string[];
  readonly materialIds: readonly string[];
  readonly textureGuids: readonly string[];
  readonly texturePaths: readonly string[];
}

class ThreeAddonPrefabRuntime implements AddonPrefabRuntime {
  readonly diagnostics: MysticDiagnostic[];

  constructor(
    readonly id: string,
    readonly object: THREE.Group,
    readonly particles: readonly AddonParticleRuntime[],
    diagnostics: readonly MysticDiagnostic[],
  ) {
    this.diagnostics = [...diagnostics];
  }

  update(deltaSeconds: number) {
    this.particles.forEach((particle) => particle.update(deltaSeconds));
  }

  resetParticles(options: AddonParticleResetOptions = {}) {
    this.particles.forEach((particle) => particle.reset(options));
  }

  dispose() {
    this.particles.forEach((particle) => particle.dispose());
    this.object.removeFromParent();
    this.object.clear();
  }
}

/** Instantiates every authored Transform and ParticleSystem in an add-on prefab. */
export class ThreeAddonPrefabFactory {
  readonly #catalog: AddonSourceCatalog;
  readonly #materialFactory: MysticSourceMaterialFactory;
  readonly #materialOptions: Omit<MysticMaterialFactoryOptions, 'quality'>;
  readonly #quality?: MysticQualityId | MysticQualityProfile;
  readonly #onDiagnostic?: MysticDiagnosticSink;
  readonly #strict: boolean;
  readonly #coordinateBasis: AddonCoordinateBasis;
  readonly #byId: ReadonlyMap<string, AddonPrefabSchema>;
  readonly #byAddon: ReadonlyMap<string, readonly AddonPrefabSchema[]>;

  constructor(options: ThreeAddonPrefabFactoryOptions) {
    this.#catalog = options.catalog ?? AXIE_ADDON_SOURCE_CATALOG;
    this.#materialFactory = options.materialFactory ?? AXIE_MYSTIC_MATERIAL_FACTORY;
    this.#materialOptions = options.materialOptions;
    this.#quality = options.quality;
    this.#onDiagnostic = options.onDiagnostic;
    this.#strict = options.strict !== false;
    this.#coordinateBasis = options.coordinateBasis ?? 'unity';
    this.#byId = new Map(this.#catalog.prefabs.map((prefab) => [prefab.id, prefab]));
    const grouped = new Map<string, AddonPrefabSchema[]>();
    this.#catalog.prefabs.forEach((prefab) => {
      const list = grouped.get(prefab.addonId) ?? [];
      list.push(prefab);
      grouped.set(prefab.addonId, list);
    });
    this.#byAddon = grouped;
  }

  get catalog() {
    return this.#catalog;
  }

  listPrefabIds() {
    return [...this.#byId.keys()];
  }

  listAddonIds() {
    return [...this.#byAddon.keys()].sort();
  }

  dependenciesForAddon(addonId: string): AddonDependencySet {
    const prefabs = this.#byAddon.get(addonId) ?? [];
    const materialIds = [...new Set(prefabs.flatMap((prefab) => (
      prefab.particles.flatMap((particle) => particle.renderer.materialIds)
    )))];
    const schemas = materialIds
      .map((id) => this.#materialFactory.getSchema(id))
      .filter((schema) => schema !== undefined);
    const spriteSlots = prefabs.flatMap((prefab) => prefab.particles.flatMap((particle) => (
      particle.textureSheet.enabled && particle.textureSheet.mode === 1
        ? (particle.textureSheet.sprites ?? [])
        : []
    )));
    return {
      prefabIds: prefabs.map((prefab) => prefab.id),
      materialIds,
      textureGuids: [...new Set([
        ...schemas.flatMap((schema) => (
          Object.values(schema.textures).map((slot) => slot.guid).filter(Boolean)
        )),
        ...spriteSlots.map((slot) => slot.guid).filter(Boolean),
      ])],
      texturePaths: [...new Set([
        ...schemas.flatMap((schema) => (
          Object.values(schema.textures).map((slot) => slot.path).filter(Boolean)
        )),
        ...spriteSlots.map((slot) => slot.path).filter(Boolean),
      ])],
    };
  }

  create(prefabId: string): AddonPrefabRuntime {
    const schema = this.#byId.get(prefabId);
    if (!schema) {
      const diagnostic: MysticDiagnostic = {
        severity: 'error',
        code: 'addon-prefab-missing',
        message: `Axie add-on prefab is not present: ${prefabId}`,
        assetId: prefabId,
      };
      this.#onDiagnostic?.(diagnostic);
      throw new Error(diagnostic.message);
    }
    return this.#createSchema(schema);
  }

  /** Some Unity folders intentionally contain several prefab attachments. */
  createAddon(addonId: string): AddonPrefabRuntime {
    const schemas = this.#byAddon.get(addonId);
    if (!schemas || schemas.length === 0) {
      const diagnostic: MysticDiagnostic = {
        severity: 'error',
        code: 'addon-prefab-missing',
        message: `Axie add-on folder has no prefab attachments: ${addonId}`,
        assetId: addonId,
      };
      this.#onDiagnostic?.(diagnostic);
      throw new Error(diagnostic.message);
    }
    if (schemas.length === 1) return this.#createSchema(schemas[0]);
    const group = new THREE.Group();
    group.name = `AxieAddon:${addonId}`;
    const children = schemas.map((schema) => this.#createSchema(schema));
    children.forEach((child) => group.add(child.object));
    const particles = children.flatMap((child) => [...child.particles]);
    const diagnostics = children.flatMap((child) => [...child.diagnostics]);
    return new ThreeAddonPrefabRuntime(addonId, group, particles, diagnostics);
  }

  /** Faithful convenience for attaching component-driven effects to exported body bones. */
  createAddonAtBone(addonId: string, bone: THREE.Object3D): AddonPrefabRuntime {
    if (this.#coordinateBasis !== 'exported-glb-bone') {
      throw new Error(
        'createAddonAtBone requires coordinateBasis "exported-glb-bone"; this prevents a silent 100x/basis mismatch.',
      );
    }
    const runtime = this.createAddon(addonId);
    bone.add(runtime.object);
    return runtime;
  }

  #createSchema(schema: AddonPrefabSchema): AddonPrefabRuntime {
    const root = new THREE.Group();
    root.name = `AxieAddonPrefab:${schema.addonId}:${schema.id.split('/').at(-1)}`;
    root.userData.axieAddonPrefabId = schema.id;
    root.userData.axieAddonId = schema.addonId;
    root.userData.axieAddonCoordinateBasis = this.#coordinateBasis;
    if (this.#coordinateBasis === 'exported-glb-bone') {
      // FBX/glTF body bones remain in centimeter-valued locals under Model's
      // 0.01 scale. One compensation at the prefab wrapper restores Unity units.
      root.scale.setScalar(AXIE_EXPORTED_BONE_UNIT_SCALE);
    }
    const diagnostics: MysticDiagnostic[] = [];
    const groupsByTransform = new Map<string, THREE.Group>();
    const transformByObject = new Map<string, THREE.Group>();

    schema.transforms.forEach((transform) => {
      const group = new THREE.Group();
      group.name = transform.name;
      if (this.#coordinateBasis === 'exported-glb-bone') {
        // Blender's body export is the X-reflected conjugate of Unity locals:
        // p' = (-x,y,z), q' = (x,-y,-z,w). This composes exactly at every depth.
        group.position.set(-transform.position[0], transform.position[1], transform.position[2]);
        group.quaternion.set(
          transform.rotation[0],
          -transform.rotation[1],
          -transform.rotation[2],
          transform.rotation[3],
        );
      } else {
        group.position.fromArray(transform.position);
        group.quaternion.fromArray(transform.rotation);
      }
      group.scale.fromArray(transform.scale);
      group.visible = transform.active;
      group.userData.unityTransformFileId = transform.fileId;
      group.userData.unityGameObjectFileId = transform.gameObjectId;
      groupsByTransform.set(transform.fileId, group);
      transformByObject.set(transform.gameObjectId, group);
    });
    schema.transforms.forEach((transform) => {
      const group = groupsByTransform.get(transform.fileId)!;
      const parent = groupsByTransform.get(transform.parentFileId);
      (parent ?? root).add(group);
    });

    const particles = schema.particles.map((particleSchema) => {
      const particle = new ThreeAddonParticleRuntime({
        schema: particleSchema,
        materialFactory: this.#materialFactory,
        materialOptions: this.#materialOptions,
        quality: this.#quality,
        onDiagnostic: (diagnostic) => {
          diagnostics.push(diagnostic);
          this.#onDiagnostic?.(diagnostic);
        },
        strict: this.#strict,
        mirrorX: this.#coordinateBasis === 'exported-glb-bone',
      });
      const parent = transformByObject.get(particleSchema.gameObjectId);
      if (!parent) {
        const diagnostic: MysticDiagnostic = {
          severity: 'error',
          code: 'mystic-catalog-invalid',
          message: `Particle ${particleSchema.id} has no Transform for GameObject ${particleSchema.gameObjectId}.`,
          assetId: particleSchema.id,
        };
        diagnostics.push(diagnostic);
        this.#onDiagnostic?.(diagnostic);
        if (this.#strict) {
          particle.dispose();
          throw new Error(diagnostic.message);
        }
        root.add(particle.object);
      } else {
        parent.add(particle.object);
      }
      return particle;
    });
    return new ThreeAddonPrefabRuntime(schema.id, root, particles, diagnostics);
  }
}
