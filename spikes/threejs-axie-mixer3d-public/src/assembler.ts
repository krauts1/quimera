import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  hasAxieMaterialBundleFactory,
  UnsupportedAxieShaderError,
  type AxieRuntimeMaterialBundle,
} from './base-v4-runtime';
import {
  buildAxieAddonBoneBasis,
  buildAxieUnityRestWorldBasis,
} from './addon-basis';
import type { AddonDependencySet } from './addon-prefab-adapter';
import type {
  AxieAssemblyDiagnostics,
  AxieDiagnosticEvent,
  AxieRigResolutionDiagnostics,
  AxieShaderResolutionDiagnostics,
} from './diagnostics';
import type { AxieBodyType } from './domain';
import {
  resolveAxieBodyRestReferenceBody,
  type AxieAnimationSet,
  type AxieMaterialManifest,
  type AxieMixerManifest,
} from './manifest';
import type { AxieExporterRestPoseV1 } from './exporter-schema';
import type { AxieDeterministicMixPlan } from './plan-builder';
import {
  buildAxieBodyRestPartAttachmentBasis,
  buildAxiePartAttachmentBasis,
  buildAxieSocketLocalPartAttachmentBasis,
} from './part-basis';
import { SampledAnimationJsonLoader } from './sampled-animation';
import type {
  AddonPrefabRuntime,
  MysticDiagnostic,
  MysticTextureSlotSchema,
} from './mystic-types';
import type {
  AxieAssembler,
  AxieAssemblyCompatibilityOptions,
  AxieAssemblyAddonRuntime,
  AxieAssemblyResult,
  AxieAssetLease,
  AxieAssetStore,
  AxieLoadedGlb,
  AxieMaterialContext,
  AxieMaterialFactory,
  AxieMixPlan,
  AxieMixRequest,
} from './runtime';

export interface ThreeAxieAssemblerOptions {
  readonly manifest: AxieMixerManifest;
  readonly assets: AxieAssetStore;
  readonly materials?: AxieMaterialFactory;
  readonly animations?: SampledAnimationJsonLoader;
  /** False keeps the generated Mystic catalogs out of this assembler entirely. */
  readonly addons?: false | ThreeAxieAddonFactoryLoader;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
}

export interface ThreeAxieRuntimeAddonFactory {
  dependenciesForAddon(addonId: string): AddonDependencySet;
  createAddon(addonId: string): AddonPrefabRuntime;
}

export interface ThreeAxieAddonFactoryContext {
  readonly quality: AxieMixPlan['quality'];
  readonly artMode: AxieMaterialContext['artMode'];
  /** Present only when AxieFactory.Colorize resolved a config row. */
  readonly primaryColor?: string;
  /** Present only when AxieFactory.Colorize resolved a config row. */
  readonly secondaryColor?: string;
  readonly strict: boolean;
  readonly resolveTexture: (slot: MysticTextureSlotSchema) => THREE.Texture | undefined;
  readonly onDiagnostic: (diagnostic: MysticDiagnostic) => void;
}

export interface ThreeAxieAddonFactoryAdapter {
  readonly factory: ThreeAxieRuntimeAddonFactory;
  /** Compensation already authored onto each generated prefab root. */
  readonly factoryUnitScale: number;
}

export type ThreeAxieAddonFactoryLoader = (
  context: ThreeAxieAddonFactoryContext,
) => Promise<ThreeAxieAddonFactoryAdapter>;

interface RuntimeBundle extends AxieRuntimeMaterialBundle {
  readonly material: AxieMaterialManifest;
  /** Recreates the source shader instance without relying on Three's no-arg Material.clone(). */
  readonly instantiate: () => RuntimeBundle;
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function abortError() {
  return new DOMException('Axie assembly was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function uniqueNodesNamed(root: THREE.Object3D, name: string) {
  const result: THREE.Object3D[] = [];
  root.traverse((node) => { if (node.name === name) result.push(node); });
  return result;
}

function materialSlots(source: THREE.Material | THREE.Material[], replacement: THREE.Material) {
  return Array.isArray(source) ? source.map(() => replacement) : replacement;
}

function runtimeBundleMaterials(bundle: AxieRuntimeMaterialBundle) {
  return [bundle.surface, bundle.outline, bundle.depth, bundle.distance]
    .filter((value): value is THREE.Material => !!value);
}

function cloneRuntimeBundle(bundle: RuntimeBundle): RuntimeBundle {
  return bundle.instantiate();
}

interface UnityMaterialAssignment {
  readonly instantiatePerRenderer: boolean;
  readonly propertyBlock?: Readonly<Record<'_PrimaryColor' | '_SecondaryColor', string>>;
  readonly templateMaterials: Set<THREE.Material>;
  readonly ownedMaterials: Set<THREE.Material>;
}

function serializedUnityColor(material: AxieMaterialManifest, property: string) {
  // Legacy/test manifests predate serialized material properties; Unity's
  // Color locals initialize to white, which is the safe equivalent there.
  const value = material.properties?.[property];
  if (
    Array.isArray(value)
    && value.length >= 3
    && value.slice(0, 3).every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    const hex = value.slice(0, 3).map((component) => (
      Math.round(Math.min(1, Math.max(0, component as number)) * 255)
        .toString(16)
        .padStart(2, '0')
    )).join('');
    return `#${hex}`;
  }
  return '#ffffff';
}

function resolveMaterialColors(
  plan: AxieDeterministicMixPlan,
  material: AxieMaterialManifest,
) {
  if (plan.colors?.applyUnityColorVariant) {
    return {
      primary: plan.colors.primary ?? '#ffffff',
      secondary: plan.colors.secondary ?? '#ffffff',
    };
  }
  // AxieFactory.Colorize returns before touching any renderer when the config
  // row is absent. Reconstruct each Three material from its own serialized
  // Unity values instead of applying one synthetic white character palette.
  return {
    primary: serializedUnityColor(material, '_PrimaryColor'),
    secondary: serializedUnityColor(material, '_SecondaryColor'),
  };
}

function copyRenderableTransform(source: THREE.Object3D, target: THREE.Object3D) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.scale.copy(source.scale);
  target.matrix.copy(source.matrix);
  target.matrixAutoUpdate = source.matrixAutoUpdate;
  target.visible = source.visible;
  target.frustumCulled = source.frustumCulled;
  target.layers.mask = source.layers.mask;
}

function makeOutlineMesh(
  mesh: THREE.Mesh,
  material: THREE.Material,
  sourceObjectUnitScale: number,
) {
  const outlineMaterials = materialSlots(mesh.material, material);
  let outline: THREE.Mesh;
  if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) {
    const source = mesh as THREE.SkinnedMesh;
    const skinned = new THREE.SkinnedMesh(source.geometry, outlineMaterials);
    skinned.bindMode = source.bindMode;
    skinned.bind(source.skeleton, source.bindMatrix);
    skinned.morphTargetDictionary = source.morphTargetDictionary;
    skinned.morphTargetInfluences = source.morphTargetInfluences;
    outline = skinned;
  } else {
    outline = new THREE.Mesh(mesh.geometry, outlineMaterials);
  }
  copyRenderableTransform(mesh, outline);
  outline.name = `${mesh.name || mesh.uuid}:AxieOutline`;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.renderOrder = mesh.renderOrder - 1;
  outline.userData.axieOutline = true;
  outline.userData.axieSourceObjectUnitScale = sourceObjectUnitScale;
  // Mystic and CEL ExtraPrePass shaders extrude in Unity object space. The
  // converted standalone part GLBs retain their exporter scale, so update the
  // shared material uniform immediately before each object's draw.
  outline.onBeforeRender = (
    _renderer,
    _scene,
    _camera,
    _geometry,
    renderMaterial,
  ) => {
    const shader = renderMaterial as THREE.ShaderMaterial;
    const uniform = shader.uniforms?.uOutlineSourceObjectUnitScale;
    if (uniform) uniform.value = sourceObjectUnitScale;
  };
  if (typeof mesh.userData.axiePartId === 'string') {
    outline.userData.axiePartId = mesh.userData.axiePartId;
  }
  if (typeof mesh.userData.axieRigType === 'string') {
    outline.userData.axieRigType = mesh.userData.axieRigType;
  }
  return outline;
}

function applyMaterialBundle(
  root: THREE.Object3D,
  bundle: RuntimeBundle,
  sourceObjectUnitScale = 1,
  unityObjectFromGeometry = new THREE.Matrix4(),
  assignment?: UnityMaterialAssignment,
) {
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && !mesh.userData.axieOutline) meshes.push(mesh);
  });
  meshes.forEach((mesh) => {
    const assignedBundle = assignment?.instantiatePerRenderer
      ? cloneRuntimeBundle(bundle)
      : bundle;
    if (assignment) {
      runtimeBundleMaterials(assignedBundle).forEach((material) => {
        assignment.ownedMaterials.add(material);
        if (!assignment.instantiatePerRenderer) assignment.templateMaterials.delete(material);
      });
      if (assignment.propertyBlock) {
        mesh.userData.axieMaterialPropertyBlock = assignment.propertyBlock;
      }
    }
    const originalMaterial = mesh.material;
    mesh.material = materialSlots(originalMaterial, assignedBundle.surface);
    const previousBeforeRender = mesh.onBeforeRender;
    mesh.onBeforeRender = function axieSourceObjectBridge(
      renderer,
      scene,
      camera,
      geometry,
      renderMaterial,
      group,
    ) {
      previousBeforeRender.call(
        this,
        renderer,
        scene,
        camera,
        geometry,
        renderMaterial,
        group,
      );
      const shader = renderMaterial as THREE.ShaderMaterial;
      const uniform = shader.uniforms?.uMysticUnityObjectFromGeometry;
      if (uniform) (uniform.value as THREE.Matrix4).copy(unityObjectFromGeometry);
    };
    mesh.castShadow = assignedBundle.castShadow ?? true;
    mesh.receiveShadow = true;
    mesh.renderOrder = assignedBundle.material.renderState.renderOrder;
    if (assignedBundle.depth) mesh.customDepthMaterial = assignedBundle.depth;
    if (assignedBundle.distance) mesh.customDistanceMaterial = assignedBundle.distance;
    if (assignedBundle.outline && mesh.parent) {
      const outline = makeOutlineMesh(mesh, assignedBundle.outline, sourceObjectUnitScale);
      if (assignment?.propertyBlock) {
        outline.userData.axieMaterialPropertyBlock = assignment.propertyBlock;
      }
      mesh.parent.add(outline);
    }
  });
}

function disposeMaterial(material: THREE.Material) {
  material.dispose();
}

function releaseAll(leases: readonly AxieAssetLease<unknown>[]) {
  for (let index = leases.length - 1; index >= 0; index -= 1) leases[index].release();
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError';
}

function attachAddonRuntime(
  runtime: AddonPrefabRuntime,
  attachBone: THREE.Object3D,
  correctionMatrix: THREE.Matrix4,
  sourcePath: string,
  reconstructionError: number,
): AxieAssemblyAddonRuntime {
  const correction = new THREE.Group();
  correction.name = `AxieAddonBasis:${runtime.id}`;
  correction.matrixAutoUpdate = false;
  correction.matrix.copy(correctionMatrix);
  correction.userData.axieAddonId = runtime.id;
  correction.userData.axieAddonAttachNode = attachBone.name;
  correction.userData.axieAddonUnityRestPath = sourcePath;
  correction.userData.axieAddonBasisError = reconstructionError;
  attachBone.add(correction);
  correction.add(runtime.object);
  let disposed = false;
  return {
    id: runtime.id,
    object: correction,
    resetParticles: (options) => {
      if (!disposed) runtime.resetParticles(options);
    },
    update: (deltaSeconds) => {
      if (!disposed) runtime.update(deltaSeconds);
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      runtime.dispose();
      correction.removeFromParent();
      correction.clear();
    },
  };
}

function axieEventFromMystic(diagnostic: MysticDiagnostic): AxieDiagnosticEvent {
  const code = diagnostic.code.includes('texture')
    ? 'texture-missing'
    : diagnostic.code.includes('material')
      ? 'material-missing'
      : diagnostic.code.includes('prefab')
        ? 'addon-missing'
        : 'shader-fallback';
  return {
    severity: diagnostic.severity,
    code,
    message: diagnostic.message,
    assetId: diagnostic.assetId,
    details: { ...diagnostic.details, mysticCode: diagnostic.code },
  };
}

async function loadProductionMaterialModule() {
  return import('./mystic-material-factory');
}

const DEFAULT_ADDON_FACTORY_LOADER: ThreeAxieAddonFactoryLoader = async (context) => {
  const [{ ThreeAddonPrefabFactory, AXIE_EXPORTED_BONE_UNIT_SCALE }] = await Promise.all([
    import('./addon-prefab-adapter'),
    // The adapter imports this same module; loading it explicitly keeps the
    // production material/time contract clear while retaining one lazy chunk.
    loadProductionMaterialModule(),
  ]);
  return {
    factory: new ThreeAddonPrefabFactory({
      coordinateBasis: 'exported-glb-bone',
      materialOptions: {
        resolveTexture: context.resolveTexture,
        primaryColor: context.primaryColor,
        secondaryColor: context.secondaryColor,
      },
      quality: context.quality.mysticFx === 'reduced'
        ? 'reduced'
        : context.artMode === 'enhanced' ? 'enhanced' : 'faithful',
      strict: context.strict,
      onDiagnostic: context.onDiagnostic,
    }),
    factoryUnitScale: AXIE_EXPORTED_BONE_UNIT_SCALE,
  };
};

/**
 * Unity-faithful body/part assembly over immutable GLB sources. Body scenes use
 * SkeletonUtils; requested rigid part nodes are cloned independently and reset
 * to identity before being parented to their exact Root_*_JNT attach point.
 */
export class ThreeAxieAssembler implements AxieAssembler {
  readonly #manifest: AxieMixerManifest;
  readonly #assets: AxieAssetStore;
  readonly #materials?: AxieMaterialFactory;
  readonly #animations: SampledAnimationJsonLoader;
  readonly #addons: false | ThreeAxieAddonFactoryLoader;
  readonly #onDiagnostic?: (event: AxieDiagnosticEvent) => void;

  constructor(options: ThreeAxieAssemblerOptions) {
    this.#manifest = options.manifest;
    this.#assets = options.assets;
    this.#materials = options.materials;
    this.#animations = options.animations ?? new SampledAnimationJsonLoader({
      onDiagnostic: options.onDiagnostic,
    });
    this.#addons = options.addons === false
      ? false
      : options.addons ?? DEFAULT_ADDON_FACTORY_LOADER;
    this.#onDiagnostic = options.onDiagnostic;
  }

  clearCache() {
    this.#animations.clearCache?.();
  }

  async assemble(
    plan: AxieMixPlan,
    request: AxieMixRequest,
    compatibility: AxieAssemblyCompatibilityOptions = { useMaterialPropertyBlocks: false },
  ): Promise<AxieAssemblyResult> {
    const startedAt = now();
    const deterministic = plan as AxieDeterministicMixPlan;
    const signal = request.signal;
    const events: AxieDiagnosticEvent[] = [...plan.warnings];
    const rigDiagnostics: AxieRigResolutionDiagnostics[] = [];
    const shaderDiagnostics: AxieShaderResolutionDiagnostics[] = [];
    const leases: AxieAssetLease<unknown>[] = [];
    const addonRuntimes: AxieAssemblyAddonRuntime[] = [];
    const ownedMaterials = new Set<THREE.Material>();
    const templateMaterials = new Set<THREE.Material>();
    const textureLeases = new Map<string, AxieAssetLease<THREE.Texture>>();
    const glbLeases = new Map<string, AxieAssetLease<AxieLoadedGlb>>();
    const materialBundles = new Map<string, RuntimeBundle>();
    const wrapper = new THREE.Group();
    wrapper.name = `Axie:${plan.key}`;
    let mysticMaterialTimeUpdater: AxieAssemblyResult['setMysticMaterialTime'];

    const emit = (event: AxieDiagnosticEvent) => {
      events.push(event);
      this.#onDiagnostic?.(event);
    };
    const progress = (
      stage: Parameters<NonNullable<AxieMixRequest['onProgress']>>[0]['stage'],
      completed: number,
      total: number,
      assetId?: string,
    ) => request.onProgress?.({ stage, completed, total, assetId });

    try {
      throwIfAborted(signal);

      const materialIds = [...new Set([
        plan.body.materialId,
        ...plan.partRigs.map((rig) => rig.materialId),
      ].filter(Boolean))];
      const requiredMaterials = materialIds.map((id) => {
        const material = this.#manifest.assets.materials[id];
        if (!material) throw new Error(`Axie material ${id} is absent from the runtime manifest.`);
        return material;
      });
      const unityColorVariant = deterministic.colors?.applyUnityColorVariant
        ? {
          primary: deterministic.colors.primary ?? '#ffffff',
          secondary: deterministic.colors.secondary ?? '#ffffff',
        }
        : undefined;
      const materialAssignment: UnityMaterialAssignment = {
        // Unity calls renderer.material only after it finds a color row and
        // only when property blocks are disabled. That creates one material
        // instance per Renderer. A fresh source-shader instance is the direct analogue;
        // Three's no-argument Material.clone() cannot reconstruct these shader factories.
        instantiatePerRenderer: !!unityColorVariant && !compatibility.useMaterialPropertyBlocks,
        propertyBlock: unityColorVariant && compatibility.useMaterialPropertyBlocks
          ? Object.freeze({
            _PrimaryColor: unityColorVariant.primary,
            _SecondaryColor: unityColorVariant.secondary,
          })
          : undefined,
        templateMaterials,
        ownedMaterials,
      };
      const textureIdSet = new Set(requiredMaterials.flatMap(
        (material) => Object.values(material.textures),
      ).filter(Boolean));
      const textureIdByGuid = new Map<string, string>();
      Object.keys(this.#manifest.assets.textures).forEach((textureId) => {
        const guid = textureId.split(':', 1)[0];
        const previous = textureIdByGuid.get(guid);
        if (previous && previous !== textureId) {
          throw new Error(`Axie texture GUID ${guid} maps to both ${previous} and ${textureId}.`);
        }
        textureIdByGuid.set(guid, textureId);
      });

      const plannedAddons = deterministic.partRigs.filter((rig) => (
        rig.addonId
        && rig.instantiateAddonAttachments
        && (this.#manifest.assets.addons[rig.addonId]?.attachments.length ?? 0) > 0
      ));
      let addonAdapter: ThreeAxieAddonFactoryAdapter | undefined;
      if (plannedAddons.length > 0 && this.#addons) {
        addonAdapter = await this.#addons({
          quality: plan.quality,
          artMode: deterministic.artMode ?? request.artMode ?? 'faithful',
          // AxieFactory returns from Colorize before traversing renderers when
          // the requested config row is absent. Leaving these undefined lets
          // every add-on/particle material retain its own serialized colors.
          primaryColor: unityColorVariant?.primary,
          secondaryColor: unityColorVariant?.secondary,
          strict: request.strict === true,
          resolveTexture: (slot) => {
            const textureId = textureIdByGuid.get(slot.guid);
            return textureId ? textureLeases.get(textureId)?.value : undefined;
          },
          onDiagnostic: (diagnostic) => emit(axieEventFromMystic(diagnostic)),
        });
        const dependencyGuids = new Set(plannedAddons.flatMap((rig) => (
          addonAdapter!.factory.dependenciesForAddon(rig.addonId!).textureGuids
        )));
        dependencyGuids.forEach((guid) => {
          const textureId = textureIdByGuid.get(guid);
          if (textureId) textureIdSet.add(textureId);
        });
      }

      const textureIds = [...textureIdSet];

      progress('textures', 0, textureIds.length);
      for (let index = 0; index < textureIds.length; index += 1) {
        throwIfAborted(signal);
        const textureId = textureIds[index];
        const texture = this.#manifest.assets.textures[textureId];
        if (!texture) throw new Error(`Axie texture ${textureId} is absent from the runtime manifest.`);
        const lease = await this.#assets.acquireTexture(texture, plan.quality, signal);
        leases.push(lease as AxieAssetLease<unknown>);
        textureLeases.set(textureId, lease);
        progress('textures', index + 1, textureIds.length, textureId);
      }

      let materials = this.#materials;
      if (!materials || addonAdapter) {
        const production = await loadProductionMaterialModule();
        materials ??= production.AXIE_EXACT_PRODUCTION_MATERIAL_FACTORY;
        mysticMaterialTimeUpdater = production.setMysticMaterialTime;
      }

      progress('materials', 0, requiredMaterials.length);
      requiredMaterials.forEach((material, index) => {
        throwIfAborted(signal);
        const shader = this.#manifest.assets.shaders[material.shaderId];
        if (!shader) {
          throw new Error(`Axie shader ${material.shaderId} for ${material.id} is absent from the runtime manifest.`);
        }
        const textures: Record<string, THREE.Texture> = {};
        Object.entries(material.textures).forEach(([property, textureId]) => {
          const texture = textureLeases.get(textureId)?.value;
          if (texture) {
            textures[textureId] = texture;
            textures[property] = texture;
          }
        });
        const resolvedColors = resolveMaterialColors(deterministic, material);
        const context: AxieMaterialContext = {
          manifest: this.#manifest,
          material,
          textures,
          primaryColor: resolvedColors.primary,
          secondaryColor: resolvedColors.secondary,
          quality: plan.quality,
          artMode: deterministic.artMode ?? request.artMode ?? 'faithful',
        };
        const createSourceBundle = (): AxieRuntimeMaterialBundle => {
          let created: AxieRuntimeMaterialBundle;
          if (hasAxieMaterialBundleFactory(materials)) {
            created = materials.createBundle(context);
          } else {
            if (shader.fidelity === 'unsupported') {
              throw new UnsupportedAxieShaderError(material.id, material.shaderId, shader.sourceName);
            }
            created = {
              surface: materials.create(context),
              outline: materials.createGeometryOutline(context),
              fidelity: shader.fidelity,
              fallbackUsed: false,
            };
          }
          if (created.fidelity === 'unsupported') {
            throw new UnsupportedAxieShaderError(material.id, material.shaderId, shader.sourceName);
          }
          return created;
        };
        const instantiate = (): RuntimeBundle => ({
          ...createSourceBundle(),
          material,
          instantiate,
        });
        const bundle = createSourceBundle();
        runtimeBundleMaterials(bundle).forEach((value) => templateMaterials.add(value));
        materialBundles.set(material.id, { ...bundle, material, instantiate });
        shaderDiagnostics.push({
          materialId: material.id,
          shaderId: material.shaderId,
          fidelity: bundle.fidelity,
          fallbackUsed: bundle.fallbackUsed,
        });
        if (bundle.fallbackUsed) {
          emit({
            severity: 'warning',
            code: 'shader-fallback',
            message: `Material ${material.id} used an explicit ${shader.sourceName} fallback.`,
            assetId: material.id,
          });
        }
        progress('materials', index + 1, requiredMaterials.length, material.id);
      });

      progress('body', 0, 1, plan.body.id);
      const bodyLease = await this.#assets.acquireGlb(plan.bodyLod.asset.url, signal);
      leases.push(bodyLease as AxieAssetLease<unknown>);
      glbLeases.set(plan.bodyLod.asset.url, bodyLease);
      const model = cloneSkeleton(bodyLease.value.scene) as THREE.Group;
      // Keep the authored scene node name unique. The GLB scene wrapper is not
      // Unity's prefab root (for production assets it is "Scene" -> "Model").
      model.name = `AxieBodyScene:${plan.body.body}`;
      model.userData.axieBodyLod = plan.bodyLod.resolvedLod;
      // Three.js derives a SkinnedMesh frustum bound from the rest pose. Unity
      // clips such as Gauntlet.Skill move the complete animated rig well beyond
      // that bind-pose volume; leaving the default culling enabled makes only
      // the body disappear while rigid socket parts remain visible. Unity keeps
      // the SkinnedMeshRenderer visible for this motion, so retain the exact
      // authored pose and disable the incompatible static-rest cull.
      model.traverse((node) => {
        if ((node as THREE.SkinnedMesh).isSkinnedMesh) node.frustumCulled = false;
      });
      let bodyAnimationRoot: THREE.Object3D = model;
      if (plan.bodyLod.asset.sceneNode) {
        const selected = uniqueNodesNamed(model, plan.bodyLod.asset.sceneNode);
        if (selected.length !== 1) {
          throw new Error(
            `Body ${plan.body.id} expected one scene node ${plan.bodyLod.asset.sceneNode}; found ${selected.length}.`,
          );
        }
        model.userData.axieSelectedBodySceneNode = selected[0].uuid;
        bodyAnimationRoot = selected[0];
      }
      const bodyBundle = materialBundles.get(plan.body.materialId);
      if (!bodyBundle) throw new Error(`Body ${plan.body.id} has no resolved material ${plan.body.materialId}.`);
      applyMaterialBundle(model, bodyBundle, 1, new THREE.Matrix4(), materialAssignment);
      wrapper.add(model);
      progress('body', 1, 1, plan.body.id);

      let bodyRestPose: AxieExporterRestPoseV1 | undefined;
      if (plan.body.restPoseUrl) {
        try {
          bodyRestPose = await this.#animations.loadRestPose(
            plan.body.restPoseUrl,
            signal,
            plan.body.body,
          );
        } catch (error) {
          const event: AxieDiagnosticEvent = {
            severity: request.strict ? 'error' : 'warning',
            code: 'attach-node-missing',
            message: `Cannot solve exact rigid-part bases for ${plan.body.body}: ${error instanceof Error ? error.message : String(error)}`,
            assetId: plan.body.restPoseUrl,
          };
          emit(event);
          if (request.strict) throw error;
        }
      }

      // Legacy body-rest meshes are authored around a source gallery body. The
      // shipping manifest is socket-local and never enters this compatibility
      // path; these poses remain solely for old third-party manifests.
      //
      // manifest makes that body explicit: most families use Normal, while
      // S04/S05 Xmas geometry comes from Frosty staging bodies. Preserve the
      // authored source socket first, then transfer it to the selected body.
      const bodyRestReferenceBodies = new Set<AxieBodyType>();
      plan.partRigs.forEach((rig) => {
        if ((rig.lod.asset.coordinateSpace ?? 'part-export') !== 'body-rest') return;
        bodyRestReferenceBodies.add(resolveAxieBodyRestReferenceBody(
          rig.lod.asset,
          rig.partId,
        ));
      });
      const bodyRestReferencePoses = new Map<AxieBodyType, AxieExporterRestPoseV1>();
      for (const referenceBodyId of bodyRestReferenceBodies) {
        if (referenceBodyId === plan.body.body && bodyRestPose) {
          bodyRestReferencePoses.set(referenceBodyId, bodyRestPose);
          continue;
        }
        const referenceBody = this.#manifest.assets.bodies[referenceBodyId];
        try {
          if (!referenceBody?.restPoseUrl) {
            throw new Error(`Reference body ${referenceBodyId} has no rest pose.`);
          }
          bodyRestReferencePoses.set(referenceBodyId, await this.#animations.loadRestPose(
            referenceBody.restPoseUrl,
            signal,
            referenceBodyId,
          ));
        } catch (error) {
          const event: AxieDiagnosticEvent = {
            severity: request.strict ? 'error' : 'warning',
            code: 'attach-node-missing',
            message: `Cannot retarget final body-rest parts from ${referenceBodyId} to ${plan.body.body}: ${error instanceof Error ? error.message : String(error)}`,
            assetId: referenceBody?.restPoseUrl ?? referenceBodyId,
          };
          emit(event);
          if (request.strict) throw error;
        }
      }

      const partUrls = [...new Set(plan.partRigs.map((rig) => rig.lod.asset.url))];
      for (const url of partUrls) {
        throwIfAborted(signal);
        if (glbLeases.has(url)) continue;
        const lease = await this.#assets.acquireGlb(url, signal);
        leases.push(lease as AxieAssetLease<unknown>);
        glbLeases.set(url, lease);
      }

      progress('parts', 0, plan.partRigs.length);
      plan.partRigs.forEach((resolved, index) => {
        throwIfAborted(signal);
        const diagnostic: AxieRigResolutionDiagnostics = {
          partId: resolved.partId,
          rigType: resolved.rigType,
          requestedLod: resolved.lod.requestedLod,
          resolvedLod: resolved.lod.resolvedLod,
          attachNode: resolved.attachNode,
          attached: false,
        };
        const attachMatches = uniqueNodesNamed(model, resolved.attachNode);
        const source = glbLeases.get(resolved.lod.asset.url)?.value.scene;
        const sourceMatches = source && resolved.lod.asset.sceneNode
          ? uniqueNodesNamed(source, resolved.lod.asset.sceneNode)
          : [];
        if (attachMatches.length === 0 || sourceMatches.length !== 1) {
          const attachProblem = attachMatches.length === 0;
          const event: AxieDiagnosticEvent = {
            severity: attachProblem || request.strict ? 'error' : 'warning',
            code: attachProblem ? 'attach-node-missing' : 'part-missing',
            message: attachProblem
              ? `Cannot find attach point for ${resolved.rigType}; skipping ${resolved.partId}.`
              : `Part ${resolved.partId}/${resolved.rigType} expected one GLB node ${resolved.lod.asset.sceneNode}; found ${sourceMatches.length}.`,
            assetId: resolved.partId,
            details: { rigType: resolved.rigType, attachMatches: attachMatches.length, sourceMatches: sourceMatches.length },
          };
          emit(event);
          rigDiagnostics.push(diagnostic);
          if (!attachProblem && request.strict) throw new Error(event.message);
          progress('parts', index + 1, plan.partRigs.length, resolved.partId);
          return;
        }
        // CollectAttachPoints overwrites its dictionary during traversal, so
        // duplicate Root_*_JNT names resolve to the last traversed transform.
        const attachPoint = attachMatches[attachMatches.length - 1];

        const coordinateSpace = resolved.lod.asset.coordinateSpace ?? 'part-export';
        if (coordinateSpace === 'part-export' && plan.body.restPoseUrl && !bodyRestPose) {
          rigDiagnostics.push(diagnostic);
          progress('parts', index + 1, plan.partRigs.length, resolved.partId);
          return;
        }

        const partNode = sourceMatches[0].clone(true);
        let sourceObjectUnitScale = 1;
        let unityObjectFromGeometry = new THREE.Matrix4();
        if (coordinateSpace === 'socket-local' && source) {
          const receipt = resolved.lod.asset.socketLocalBake;
          if (!receipt) {
            const error = new Error(
              `Socket-local part ${resolved.partId}/${resolved.rigType} has no immutable bake receipt.`,
            );
            emit({
              severity: 'error',
              code: 'part-missing',
              message: error.message,
              assetId: resolved.partId,
              details: { rigType: resolved.rigType, attachNode: resolved.attachNode },
            });
            rigDiagnostics.push(diagnostic);
            if (request.strict) throw error;
            progress('parts', index + 1, plan.partRigs.length, resolved.partId);
            return;
          }
          const basis = buildAxieSocketLocalPartAttachmentBasis(
            source,
            sourceMatches[0],
            receipt.objectUnitsPerMeter,
          );
          partNode.matrixAutoUpdate = false;
          partNode.matrix.copy(basis.localMatrix);
          partNode.userData.axiePartUnityRestPath = basis.sourcePath;
          partNode.userData.axiePartBasisError = basis.reconstructionError;
          partNode.userData.axieSourceObjectUnitScale = basis.sourceObjectUnitScale;
          partNode.userData.axieCoordinateSpace = coordinateSpace;
          partNode.userData.axiePartReferenceBody = receipt.referenceBody;
          partNode.userData.axiePartBodyRetargeted = false;
          partNode.userData.axiePartSourceUrl = receipt.sourceUrl;
          partNode.userData.axiePartSourceSceneNode = receipt.sourceSceneNode;
          partNode.userData.axiePartBakeMatrixSha256 = receipt.bakeMatrixSha256;
          sourceObjectUnitScale = basis.sourceObjectUnitScale;
          unityObjectFromGeometry = basis.unityObjectFromGeometry;
        } else if (coordinateSpace === 'body-rest' && source) {
          let referenceBodyId: AxieBodyType;
          let bodyRestReference: ReturnType<typeof buildAxieUnityRestWorldBasis>;
          let bodyRestTarget: ReturnType<typeof buildAxieUnityRestWorldBasis>;
          try {
            referenceBodyId = resolveAxieBodyRestReferenceBody(
              resolved.lod.asset,
              resolved.partId,
            );
            const bodyRestReferencePose = bodyRestReferencePoses.get(referenceBodyId);
            if (!bodyRestReferencePose) {
              throw new Error(`Reference body ${referenceBodyId} has no authoritative rest pose.`);
            }
            if (!bodyRestPose) {
              throw new Error(`Target body ${plan.body.body} has no authoritative rest pose.`);
            }
            bodyRestReference = buildAxieUnityRestWorldBasis(
              bodyRestReferencePose,
              resolved.attachNode,
            );
            bodyRestTarget = buildAxieUnityRestWorldBasis(
              bodyRestPose,
              resolved.attachNode,
            );
          } catch (error) {
            const event: AxieDiagnosticEvent = {
              severity: request.strict ? 'error' : 'warning',
              code: 'attach-node-missing',
              message: `Cannot attach body-rest part ${resolved.partId}/${resolved.rigType}: ${error instanceof Error ? error.message : String(error)}`,
              assetId: resolved.partId,
              details: {
                rigType: resolved.rigType,
                attachNode: resolved.attachNode,
                targetBody: plan.body.body,
              },
            };
            emit(event);
            rigDiagnostics.push(diagnostic);
            if (request.strict) throw error;
            progress('parts', index + 1, plan.partRigs.length, resolved.partId);
            return;
          }
          const basis = buildAxieBodyRestPartAttachmentBasis(
            bodyAnimationRoot,
            attachPoint,
            source,
            sourceMatches[0],
            bodyRestReference.matrix,
            bodyRestTarget.matrix,
          );
          partNode.matrixAutoUpdate = false;
          partNode.matrix.copy(basis.localMatrix);
          partNode.userData.axiePartUnityRestPath = basis.sourcePath;
          partNode.userData.axiePartBasisError = basis.reconstructionError;
          partNode.userData.axieSourceObjectUnitScale = basis.sourceObjectUnitScale;
          partNode.userData.axieCoordinateSpace = coordinateSpace;
          partNode.userData.axiePartReferenceBody = referenceBodyId;
          partNode.userData.axiePartReferenceRestPath = bodyRestReference.sourcePath;
          partNode.userData.axiePartBodyRetargeted = plan.body.body !== referenceBodyId;
          sourceObjectUnitScale = basis.sourceObjectUnitScale;
          unityObjectFromGeometry = basis.unityObjectFromGeometry;
        } else if (bodyRestPose && source) {
          const basis = buildAxiePartAttachmentBasis(
            bodyAnimationRoot,
            bodyRestPose,
            attachPoint,
            source,
            sourceMatches[0],
          );
          partNode.matrixAutoUpdate = false;
          partNode.matrix.copy(basis.localMatrix);
          partNode.userData.axiePartUnityRestPath = basis.sourcePath;
          partNode.userData.axiePartBasisError = basis.reconstructionError;
          partNode.userData.axieSourceObjectUnitScale = basis.sourceObjectUnitScale;
          partNode.userData.axieCoordinateSpace = coordinateSpace;
          sourceObjectUnitScale = basis.sourceObjectUnitScale;
          unityObjectFromGeometry = basis.unityObjectFromGeometry;
        } else {
          // Test/legacy manifests without a restPoseUrl retain their authored
          // local transform. Production manifests never take this branch.
          partNode.position.set(0, 0, 0);
          partNode.quaternion.identity();
          partNode.scale.set(1, 1, 1);
          partNode.updateMatrix();
        }
        partNode.name = resolved.lod.asset.sceneNode;
        partNode.traverse((node) => {
          node.userData.axiePartId = resolved.partId;
          node.userData.axieRigType = resolved.rigType;
        });
        const bundle = materialBundles.get(resolved.materialId);
        if (!bundle) throw new Error(`Part ${resolved.partId} has no resolved material ${resolved.materialId}.`);
        attachPoint.add(partNode);
        applyMaterialBundle(
          partNode,
          bundle,
          sourceObjectUnitScale,
          unityObjectFromGeometry,
          materialAssignment,
        );
        rigDiagnostics.push({ ...diagnostic, attached: true });
        progress('parts', index + 1, plan.partRigs.length, resolved.partId);
      });

      progress('addons', 0, addonAdapter ? plannedAddons.length : 0);
      if (addonAdapter && plannedAddons.length > 0) {
        if (bodyRestPose) {
          for (let index = 0; index < plannedAddons.length; index += 1) {
            throwIfAborted(signal);
            const resolved = plannedAddons[index];
            const addonId = resolved.addonId!;
            const attachMatches = uniqueNodesNamed(model, resolved.attachNode);
            if (attachMatches.length === 0) {
              const event: AxieDiagnosticEvent = {
                severity: 'error',
                code: 'attach-node-missing',
                message: `Cannot find attach point for ${resolved.rigType}; skipping add-on ${addonId}.`,
                assetId: addonId,
                details: { rigType: resolved.rigType, attachMatches: attachMatches.length },
              };
              emit(event);
              progress('addons', index + 1, plannedAddons.length, addonId);
              continue;
            }
            const attachPoint = attachMatches[attachMatches.length - 1];

            try {
              const basis = buildAxieAddonBoneBasis(
                bodyAnimationRoot,
                bodyRestPose,
                attachPoint,
                addonAdapter.factoryUnitScale,
              );
              const runtime = addonAdapter.factory.createAddon(addonId);
              const attached = attachAddonRuntime(
                runtime,
                attachPoint,
                basis.factoryCorrectionMatrix,
                basis.sourcePath,
                basis.reconstructionError,
              );
              attached.object.userData.axiePartId = resolved.partId;
              attached.object.userData.axieRigType = resolved.rigType;
              addonRuntimes.push(attached);
            } catch (error) {
              const event: AxieDiagnosticEvent = {
                severity: request.strict ? 'error' : 'warning',
                code: 'addon-missing',
                message: `Could not instantiate exact add-on ${addonId}: ${error instanceof Error ? error.message : String(error)}`,
                assetId: addonId,
                details: { rigType: resolved.rigType, attachNode: resolved.attachNode },
              };
              emit(event);
              if (request.strict) throw error;
            }
            progress('addons', index + 1, plannedAddons.length, addonId);
          }
        }
      }

      // Unity AxieBodyData retains both dictionaries at once. Compile both sets
      // against this clone so callers can perform exact dictionary lookup without
      // rebuilding the character; `clips` remains the selected playback set.
      const animationSets: readonly AxieAnimationSet[] = ['lite', 'full'];
      const animationProgressTotal = animationSets.length;
      const sourceFallbackBySet: Record<AxieAnimationSet, THREE.AnimationClip[]> = {
        lite: [],
        full: [],
      };
      bodyLease.value.animations.forEach((clip) => {
        const set = (clip as THREE.AnimationClip & {
          userData?: { axieAnimationSet?: unknown };
        }).userData?.axieAnimationSet;
        if (set === 'lite' || set === 'full') sourceFallbackBySet[set].push(clip);
      });
      // Legacy/test GLBs do not carry set metadata. Preserve prior behavior by
      // assigning those embedded clips only to the requested playback set.
      if (sourceFallbackBySet.lite.length === 0 && sourceFallbackBySet.full.length === 0) {
        sourceFallbackBySet[plan.animationSet] = [...bodyLease.value.animations];
      }
      const mutableClipSets: Record<AxieAnimationSet, readonly THREE.AnimationClip[]> = {
        lite: sourceFallbackBySet.lite,
        full: sourceFallbackBySet.full,
      };
      for (let index = 0; index < animationSets.length; index += 1) {
        const set = animationSets[index];
        const animationBundle = plan.body.animations[set];
        progress('animations', index, animationProgressTotal, animationBundle?.url);
        if (animationBundle?.url) {
          try {
            const sampled = await this.#animations.loadBundle(
              animationBundle.url,
              bodyAnimationRoot,
              signal,
              animationBundle.clips,
              plan.body.restPoseUrl,
            );
            sampled.events.forEach((event) => {
              if (!events.includes(event)) events.push(event);
            });
            mutableClipSets[set] = sampled.clips;
          } catch (error) {
            if (isAbort(error) || request.strict) throw error;
            emit({
              severity: 'warning',
              code: 'animation-missing',
              message: `Could not load ${plan.body.body}/${set} animations: ${error instanceof Error ? error.message : String(error)}`,
              assetId: animationBundle.url,
            });
          }
        } else if (mutableClipSets[set].length === 0 && set === plan.animationSet) {
          emit({
            severity: 'warning',
            code: 'animation-missing',
            message: `Body ${plan.body.body} has no ${set} animation bundle.`,
            assetId: plan.body.id,
          });
        }
        progress('animations', index + 1, animationProgressTotal, animationBundle?.url);
      }
      const clipSets = Object.freeze({
        lite: Object.freeze([...mutableClipSets.lite]),
        full: Object.freeze([...mutableClipSets.full]),
      });
      const clips = clipSets[plan.animationSet];
      throwIfAborted(signal);

      // Templates cloned for renderer.material semantics are never attached;
      // dispose them now. Shared/property-block templates were claimed above
      // and remain character-owned runtime conversions until Dispose().
      templateMaterials.forEach(disposeMaterial);
      templateMaterials.clear();

      progress('finalize', 0, 1, plan.key);
      const diagnostics: AxieAssemblyDiagnostics = {
        descriptorKey: plan.key,
        quality: plan.quality.id,
        animationSet: plan.animationSet,
        requestedLod: plan.quality.requestedLod,
        bodyResolvedLod: plan.bodyLod.resolvedLod,
        rigs: rigDiagnostics,
        shaders: shaderDiagnostics,
        missingParts: plan.missingParts,
        events,
        loadDurationMs: now() - startedAt,
        ready: true,
      };
      progress('finalize', 1, 1, plan.key);
      return {
        wrapper,
        model,
        clips,
        clipSets,
        leases,
        ownedMaterials: [...ownedMaterials],
        addonRuntimes,
        setMysticMaterialTime: mysticMaterialTimeUpdater,
        diagnostics,
      };
    } catch (error) {
      if (isAbort(error)) {
        this.#onDiagnostic?.({
          severity: 'info',
          code: 'load-aborted',
          message: `Axie assembly ${plan.key} was aborted.`,
          assetId: plan.key,
        });
      }
      for (let index = addonRuntimes.length - 1; index >= 0; index -= 1) {
        addonRuntimes[index].dispose();
      }
      wrapper.removeFromParent();
      wrapper.clear();
      ownedMaterials.forEach(disposeMaterial);
      templateMaterials.forEach(disposeMaterial);
      releaseAll(leases);
      throw error;
    }
  }
}
