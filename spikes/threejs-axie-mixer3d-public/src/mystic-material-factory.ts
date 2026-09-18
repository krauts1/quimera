import * as THREE from 'three';
import type { AxieMaterialBundleFactory, AxieRuntimeMaterialBundle } from './base-v4-runtime';
import {
  AXIE_EXACT_BASE_V4_MATERIAL_FACTORY,
  UnsupportedAxieShaderError,
} from './base-v4-runtime';
import type { AxieMaterialContext } from './runtime';
import { AXIE_MYSTIC_SOURCE_CATALOG } from './mystic-source-catalog.generated';
import {
  MYSTIC_MESH_VERTEX_SHADER,
  MYSTIC_SHADER_DEFINITIONS,
  resolveMysticShaderDefinition,
  type MysticShaderDefinition,
  type MysticShaderFamily,
} from './mystic-shader-registry';
import { resolveMysticQuality } from './mystic-quality';
import {
  MysticCelOutlineMaterial,
  MysticObjectOutlineMaterial,
} from './mystic-outline-material';
import type {
  MysticColorTuple,
  MysticDiagnostic,
  MysticMaterialBundle,
  MysticMaterialFactoryOptions,
  MysticMaterialVectorTuple,
  MysticMaterialSchema,
  MysticNumberSchema,
  MysticQualityProfile,
  MysticSourceCatalog,
  MysticShaderSourceSchema,
  MysticTextureSlotSchema,
} from './mystic-types';

const REQUIRED_TEXTURES: Readonly<Record<MysticShaderFamily, readonly string[]>> = Object.freeze({
  'debuff-rimlight': ['_Main_tex', '_TextureSample2', '_second_noise', '_Matcap'],
  'mystic-opaque': ['_TextureSample0', '_gradientmap', '_Matcap'],
  'mystic-transparent': ['_TextureSample0', '_gradientmap'],
  'mystic-final': [
    '_Main_tex', '_Mask_MAP', '_Matcap', '_Matcap_UV2', '_NoiseMap_ViewDir',
    '_NoiseMap_2nd', '_Noise_3', '_UV2_texture',
  ],
  'mystic-final-transparent': [
    '_Main_tex', '_Mask_MAP', '_Matcap', '_Matcap_UV2', '_NoiseMap_ViewDir',
    '_NoiseMap_2nd', '_Noise_3', '_UV2_texture',
  ],
  'cel-standard': ['_ColorTexture'],
  'cel-standard-mystic': ['_ColorTexture', '_emission', '_emissnoise', '_Matcap'],
  star: ['_TextureSample0'],
  dissolve: ['_MainTex', '_DissolveTex'],
  'dissolve-stencil': ['_MainTex', '_DissolveTex'],
});

function finite(value: MysticNumberSchema | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function textureTransform(slot: MysticTextureSlotSchema | undefined) {
  return new THREE.Vector4(
    slot?.scale[0] ?? 1,
    slot?.scale[1] ?? 1,
    slot?.offset[0] ?? 0,
    slot?.offset[1] ?? 0,
  );
}

function tuple(value: MysticMaterialVectorTuple | MysticColorTuple | undefined, fallback: MysticColorTuple) {
  const source = value ?? fallback;
  return new THREE.Vector4(
    finite(source[0], fallback[0]),
    finite(source[1], fallback[1]),
    finite(source[2], fallback[2]),
    finite(source[3], fallback[3]),
  );
}

function makeSolidTexture(r: number, g: number, b: number, a: number, name: string) {
  const texture = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function disposeTextures(textures: Set<THREE.Texture>) {
  textures.forEach((texture) => texture.dispose());
  textures.clear();
}

function floatProperty(schema: MysticMaterialSchema, names: readonly string[], fallback: number) {
  for (const name of names) {
    const value = schema.floats[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return fallback;
}

function colorProperty(
  schema: MysticMaterialSchema,
  names: readonly string[],
  fallback: MysticColorTuple,
) {
  for (const name of names) {
    const value = schema.colors[name];
    if (value) return value;
  }
  return fallback;
}

/** Exact schema used by Unity's `new Material(shader)` source-only probes. */
export function createMysticSourceDefaultMaterialSchema(
  shader: MysticShaderSourceSchema,
  id = `AxieSourceDefault:${shader.guid}`,
): MysticMaterialSchema {
  return {
    id,
    guid: id,
    name: `${shader.name}:SourceDefaults`,
    shaderGuid: shader.guid,
    shaderName: shader.name,
    validKeywords: [],
    invalidKeywords: [],
    disabledPasses: [],
    renderQueue: -1,
    enableInstancing: false,
    doubleSidedGi: false,
    textures: shader.defaults.textures,
    floats: shader.defaults.floats,
    colors: shader.defaults.colors,
  };
}

function zTestFromUnityMaterial(schema: MysticMaterialSchema) {
  // ShaderLab's dynamic `ZTest [_Ztest]` consumes UnityEngine.Rendering.CompareFunction
  // values directly. Some source shaders decorate the property with misleading
  // custom labels, but those labels do not change the serialized numeric contract.
  // Schemas without `_Ztest` use the pass's authored fixed `ZTest LEqual`.
  const authoredValue = schema.floats._Ztest;
  if (typeof authoredValue !== 'number' || !Number.isFinite(authoredValue)) {
    return { depthTest: true, depthFunc: THREE.LessEqualDepth } as const;
  }
  const value = Math.trunc(authoredValue);
  const depthFunctions: Readonly<Record<number, THREE.DepthModes>> = Object.freeze({
    1: THREE.NeverDepth,
    2: THREE.LessDepth,
    3: THREE.EqualDepth,
    4: THREE.LessEqualDepth,
    5: THREE.GreaterDepth,
    6: THREE.NotEqualDepth,
    7: THREE.GreaterEqualDepth,
    8: THREE.AlwaysDepth,
  });
  return {
    depthTest: value !== 0,
    depthFunc: depthFunctions[value] ?? THREE.LessDepth,
  } as const;
}

function alphaClipEnabled(
  schema: MysticMaterialSchema,
  definition: MysticShaderDefinition,
) {
  // Amplify/URP compiles clip() behind this local shader keyword. Numeric
  // properties remain serialized even when the keyword is disabled and must
  // not activate clipping on their own.
  //
  // Star is the one audited exception: its embedded Amplify master-node state
  // records `Alpha Clipping;1`, while the sole serialized material has a stale
  // empty keyword list. Fresh pinned Unity 2021.3.45f2/URP12 Metal captures
  // are byte-identical to the canonical oracle and prove that zero-alpha Star
  // fragments do not claim depth. Honor that authored graph state explicitly;
  // otherwise Cull Off + ZWrite On erases the far-side visible star shell.
  if (definition.family === 'star') return true;
  return schema.validKeywords.includes('_ALPHATEST_ON');
}

function alphaCutoffFromUnityMaterial(
  schema: MysticMaterialSchema,
  definition: MysticShaderDefinition,
) {
  // Each generated Amplify family bakes a distinct threshold expression.
  if (definition.family === 'mystic-opaque') {
    return floatProperty(schema, ['_AlphaClip'], 0);
  }
  if (
    definition.family === 'mystic-transparent'
    || definition.family === 'dissolve'
    || definition.family === 'dissolve-stencil'
  ) return 0;
  return definition.alphaTest;
}

function updateMysticCameraUniforms(
  uniforms: Record<string, THREE.IUniform>,
  camera: THREE.Camera,
  cameraViewDirection: THREE.Vector3,
) {
  camera.getWorldDirection(cameraViewDirection).multiplyScalar(-1);
  uniforms.uMysticCameraIsOrthographic.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
  (uniforms.uMysticCameraViewDirectionWS.value as THREE.Vector3).copy(cameraViewDirection);
  const near = (camera as THREE.PerspectiveCamera).near;
  uniforms.uMysticCameraNear.value = Number.isFinite(near) ? near : 0.1;
}

class MysticCameraDepthMaterial extends THREE.ShaderMaterial {
  readonly #cameraViewDirection = new THREE.Vector3(0, 0, 1);

  override onBeforeRender(
    _renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    updateMysticCameraUniforms(this.uniforms, camera, this.#cameraViewDirection);
  }
}

export class MysticSourceMaterial extends THREE.ShaderMaterial {
  readonly sourceSchema: MysticMaterialSchema;
  readonly shaderDefinition: MysticShaderDefinition;
  readonly #cameraViewDirection = new THREE.Vector3(0, 0, 1);
  readonly #lightPosition = new THREE.Vector3();
  readonly #lightTargetPosition = new THREE.Vector3();
  readonly #autoMainLight: boolean;

  constructor(
    sourceSchema: MysticMaterialSchema,
    shaderDefinition: MysticShaderDefinition,
    uniforms: Record<string, THREE.IUniform>,
    autoMainLight: boolean,
  ) {
    const zTest = zTestFromUnityMaterial(sourceSchema);
    super({
      name: sourceSchema.name,
      vertexShader: MYSTIC_MESH_VERTEX_SHADER,
      fragmentShader: shaderDefinition.fragmentShader,
      uniforms,
      transparent: shaderDefinition.transparent,
      side: shaderDefinition.side,
      depthTest: zTest.depthTest,
      depthWrite: shaderDefinition.depthWrite,
      depthFunc: zTest.depthFunc,
      blending: shaderDefinition.transparent ? THREE.NormalBlending : THREE.NoBlending,
      fog: false,
      toneMapped: false,
    });
    this.sourceSchema = sourceSchema;
    this.shaderDefinition = shaderDefinition;
    this.#autoMainLight = autoMainLight;
    // ShaderLab `Cull Off` is one indexed draw with face culling disabled.
    // Three normally expands transparent DoubleSide materials into separate
    // back-then-front draws; that changes source-order depth self-occlusion
    // for Star, whose authored Forward pass is transparent with ZWrite On.
    // `forceSinglePass` restores Unity's one-draw Cull Off contract.
    if (shaderDefinition.family === 'star') {
      this.forceSinglePass = true;
    }
    this.alphaTest = alphaClipEnabled(sourceSchema, shaderDefinition)
      ? alphaCutoffFromUnityMaterial(sourceSchema, shaderDefinition)
      : 0;
    this.userData.axieMystic = Object.freeze({
      materialId: sourceSchema.id,
      materialGuid: sourceSchema.guid,
      shaderGuid: sourceSchema.shaderGuid,
      shaderName: sourceSchema.shaderName,
      shaderFamily: shaderDefinition.family,
      renderQueue: sourceSchema.renderQueue,
      // Unity's Gamma project needs encoded-domain blending only for source
      // shaders whose authored Forward pass is transparent. Keep this immutable
      // so toggling an opaque material's Three.js `transparent` flag cannot
      // silently opt it into the compositor.
      requiresGammaComposition: shaderDefinition.transparent,
      faithful: true,
    });

    if (
      shaderDefinition.family === 'mystic-opaque'
      || shaderDefinition.family === 'mystic-transparent'
      || shaderDefinition.family === 'cel-standard'
      || shaderDefinition.family === 'cel-standard-mystic'
    ) {
      this.stencilWrite = true;
      this.stencilRef = Math.trunc(floatProperty(sourceSchema, ['_stencil'], 0));
      this.stencilFunc = THREE.AlwaysStencilFunc;
      this.stencilFail = THREE.KeepStencilOp;
      this.stencilZFail = THREE.KeepStencilOp;
      this.stencilZPass = THREE.ReplaceStencilOp;
    }
  }

  override onBeforeRender(
    _renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    updateMysticCameraUniforms(this.uniforms, camera, this.#cameraViewDirection);
    if (!this.#autoMainLight) return;
    let mainLight: THREE.DirectionalLight | undefined;
    scene.traverseVisible((candidate) => {
      if (!mainLight && (candidate as THREE.DirectionalLight).isDirectionalLight) {
        mainLight = candidate as THREE.DirectionalLight;
      }
    });
    if (!mainLight) {
      (this.uniforms.uMainLightPosition.value as THREE.Vector3).set(0, 0, 0);
      return;
    }
    mainLight.getWorldPosition(this.#lightPosition);
    mainLight.target.getWorldPosition(this.#lightTargetPosition);
    (this.uniforms.uMainLightPosition.value as THREE.Vector3)
      .copy(this.#lightPosition)
      .sub(this.#lightTargetPosition)
      .normalize();
  }

  setTime(seconds: number) {
    this.uniforms.uMysticTime.value = Number.isFinite(seconds) ? seconds : 0;
  }

  setBodyColors(primary: THREE.ColorRepresentation, secondary: THREE.ColorRepresentation) {
    const primaryColor = new THREE.Color(primary).convertLinearToSRGB();
    const secondaryColor = new THREE.Color(secondary).convertLinearToSRGB();
    (this.uniforms.uPrimaryColor.value as THREE.Vector4).set(
      primaryColor.r, primaryColor.g, primaryColor.b, 1,
    );
    (this.uniforms.uSecondaryColor.value as THREE.Vector4).set(
      secondaryColor.r, secondaryColor.g, secondaryColor.b, 1,
    );
  }
}

/**
 * Realm-safe identity check for source-faithful Mystic materials. Vite HMR and
 * split bundles can evaluate this module more than once, so `instanceof`
 * cannot be used at renderer boundaries.
 */
export function isMysticSourceMaterial(material: THREE.Material): material is MysticSourceMaterial {
  const candidate = material as MysticSourceMaterial;
  const marker = candidate.userData?.axieMystic as {
    readonly faithful?: unknown;
    readonly shaderFamily?: unknown;
  } | undefined;
  return candidate.isShaderMaterial === true
    && candidate.transparent !== undefined
    && marker?.faithful === true
    && typeof marker.shaderFamily === 'string'
    && typeof candidate.setTime === 'function'
    && candidate.uniforms?.uMysticGammaBlendPass !== undefined;
}

/** Advances every animated Mystic mesh material under a character root. */
export function setMysticMaterialTime(root: THREE.Object3D, seconds: number) {
  const visited = new Set<MysticSourceMaterial>();
  root.traverse((node) => {
    const material = (node as THREE.Mesh).material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    materials.forEach((candidate) => {
      if (isMysticSourceMaterial(candidate) && !visited.has(candidate)) {
        visited.add(candidate);
        candidate.setTime(seconds);
      }
    });
  });
  return visited.size;
}

export interface MysticSourceMaterialFactoryOptions {
  readonly catalog?: MysticSourceCatalog;
}

/** Strict factory for all ten audited Mystic/VFX source shaders. */
export class MysticSourceMaterialFactory {
  readonly #catalog: MysticSourceCatalog;
  readonly #materials: ReadonlyMap<string, MysticMaterialSchema>;
  readonly #white = makeSolidTexture(255, 255, 255, 255, 'AxieMystic:default-white');
  readonly #black = makeSolidTexture(0, 0, 0, 255, 'AxieMystic:default-black');
  readonly #gray = makeSolidTexture(128, 128, 128, 255, 'AxieMystic:default-gray');
  readonly #bump = makeSolidTexture(128, 128, 255, 255, 'AxieMystic:default-bump');
  readonly #red = makeSolidTexture(255, 0, 0, 255, 'AxieMystic:default-red');
  #disposed = false;

  constructor(options: MysticSourceMaterialFactoryOptions = {}) {
    this.#catalog = options.catalog ?? AXIE_MYSTIC_SOURCE_CATALOG;
    const aliases: [string, MysticMaterialSchema][] = [];
    this.#catalog.materials.forEach((material) => {
      aliases.push([material.id, material], [material.guid, material]);
    });
    this.#materials = new Map(aliases);
  }

  get catalog() {
    return this.#catalog;
  }

  getSchema(idOrGuid: string) {
    return this.#materials.get(idOrGuid);
  }

  create(idOrGuid: string, options: MysticMaterialFactoryOptions): MysticMaterialBundle {
    this.#assertActive();
    const schema = this.#materials.get(idOrGuid);
    if (!schema) {
      const diagnostic: MysticDiagnostic = {
        severity: 'error',
        code: 'mystic-material-missing',
        message: `Mystic material schema is not present: ${idOrGuid}`,
        assetId: idOrGuid,
      };
      options.onDiagnostic?.(diagnostic);
      throw new Error(diagnostic.message);
    }
    return this.createFromSchema(schema, options);
  }

  createFromSchema(
    schema: MysticMaterialSchema,
    options: MysticMaterialFactoryOptions,
  ): MysticMaterialBundle {
    this.#assertActive();
    let definition: MysticShaderDefinition;
    try {
      definition = resolveMysticShaderDefinition(schema.shaderGuid);
    } catch (error) {
      options.onDiagnostic?.({
        severity: 'error',
        code: 'mystic-shader-unsupported',
        message: error instanceof Error ? error.message : String(error),
        assetId: schema.id,
        details: { shaderGuid: schema.shaderGuid },
      });
      throw error;
    }
    const quality = resolveMysticQuality(options.quality);
    const rawTextureViews = new Map<THREE.Texture, THREE.Texture>();
    const ownedTextureViews = new Set<THREE.Texture>();
    let uniforms: Record<string, THREE.IUniform>;
    try {
      uniforms = this.#createUniforms(
        schema,
        definition,
        quality,
        options,
        rawTextureViews,
        ownedTextureViews,
      );
    } catch (error) {
      // A resolver can fail after another slot has already produced a raw
      // view. No bundle exists to own those views yet, so release them here.
      disposeTextures(ownedTextureViews);
      rawTextureViews.clear();
      throw error;
    }
    const surface = new MysticSourceMaterial(
      schema,
      definition,
      uniforms,
      options.mainLightPosition === undefined,
    );
    const alphaTest = alphaClipEnabled(schema, definition)
      ? alphaCutoffFromUnityMaterial(schema, definition)
      : 0;

    const outline = (() => {
      if (!definition.outline) return undefined;
      const name = `${schema.name}:ExtraPrePass`;
      const thickness = floatProperty(schema, ['_outline'], 0);
      if (
        definition.family === 'debuff-rimlight'
        || definition.family === 'mystic-final'
        || definition.family === 'mystic-final-transparent'
      ) {
        const [r, g, b] = colorProperty(schema, ['_outlinecolor'], [0, 0, 0, 0]);
        return new MysticObjectOutlineMaterial({
          thickness,
          color: new THREE.Color().setRGB(
            finite(r, 0), finite(g, 0), finite(b, 0), THREE.SRGBColorSpace,
          ),
          name,
        });
      }
      if (definition.family === 'cel-standard' || definition.family === 'cel-standard-mystic') {
        return new MysticCelOutlineMaterial({
          thickness,
          alphaClipEnabled: alphaClipEnabled(schema, definition),
          length: floatProperty(schema, ['_Length'], 0),
          offset: floatProperty(schema, ['_Offset'], 0),
          name,
        });
      }
      return undefined;
    })();

    const mainTexture = uniforms.uMainTex.value as THREE.Texture;
    const disabledPasses = new Set(schema.disabledPasses.map((pass) => pass.toUpperCase()));
    const depthOnly = definition.depthOnly && !disabledPasses.has('DEPTHONLY');
    const castShadow = definition.shadowCaster && !disabledPasses.has('SHADOWCASTER');
    const depth = depthOnly
      ? new MysticCameraDepthMaterial({
          name: `${schema.name}:DepthOnly`,
          vertexShader: MYSTIC_MESH_VERTEX_SHADER,
          fragmentShader: definition.depthFragmentShader,
          uniforms,
          transparent: false,
          side: definition.side,
          alphaTest,
          depthTest: true,
          depthWrite: true,
          depthFunc: THREE.LessEqualDepth,
          blending: THREE.NoBlending,
          fog: false,
          toneMapped: false,
        })
      : undefined;
    const distance = castShadow
      ? new THREE.MeshDistanceMaterial({
          map: mainTexture === this.#white || mainTexture === this.#black ? null : mainTexture,
          alphaTest,
        })
      : undefined;

    let disposed = false;
    const disposeOwnedTextureViews = () => {
      if (disposed) return;
      disposed = true;
      disposeTextures(ownedTextureViews);
      rawTextureViews.clear();
    };
    // AxieMaterialBundleFactory consumers retain only the material objects.
    // Binding raw-view ownership to the surface keeps those paths leak-free,
    // while the bundle's explicit disposer remains the authoritative cleanup.
    surface.addEventListener('dispose', disposeOwnedTextureViews);

    return {
      surface,
      outline,
      depth,
      distance,
      castShadow,
      fidelity: quality.id === 'faithful' ? 'source-faithful' : quality.id,
      fallbackUsed: false,
      dispose: () => {
        surface.dispose();
        outline?.dispose();
        depth?.dispose();
        distance?.dispose();
        disposeOwnedTextureViews();
      },
    };
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#white.dispose();
    this.#black.dispose();
    this.#gray.dispose();
    this.#bump.dispose();
    this.#red.dispose();
  }

  #texture(
    schema: MysticMaterialSchema,
    definition: MysticShaderDefinition,
    names: readonly string[],
    fallback: 'white' | 'black',
    options: MysticMaterialFactoryOptions,
    rawTextureViews: Map<THREE.Texture, THREE.Texture>,
    ownedTextureViews: Set<THREE.Texture>,
  ) {
    for (const name of names) {
      const slot = schema.textures[name];
      if (!slot) continue;
      if (!slot.guid) {
        if (slot.builtin === 'black') return this.#black;
        if (slot.builtin === 'gray') return this.#gray;
        if (slot.builtin === 'bump') return this.#bump;
        if (slot.builtin === 'red') return this.#red;
        if (slot.builtin === 'white') return this.#white;
        return fallback === 'white' ? this.#white : this.#black;
      }
      const resolved = options.resolveTexture(slot, schema);
      if (resolved) {
        // The pinned Unity project evaluates this authored graph in Gamma.
        // Keep encoded color samples raw during graph evaluation, then the
        // shader converts its final result once for Three's linear output. A
        // resolver may own and share the authored sRGB texture, so never
        // relabel it in place: a clone shares the image and copies the exact
        // authored sampler while owning its independent GPU texture state.
        if (resolved.colorSpace !== THREE.SRGBColorSpace) return resolved;
        const existing = rawTextureViews.get(resolved);
        if (existing) return existing;
        const rawTextureView = resolved.clone();
        rawTextureView.name = resolved.name
          ? `${resolved.name}:AxieMysticRaw`
          : `AxieMysticRaw:${schema.id}:${name}`;
        rawTextureView.colorSpace = THREE.NoColorSpace;
        rawTextureView.needsUpdate = true;
        rawTextureViews.set(resolved, rawTextureView);
        ownedTextureViews.add(rawTextureView);
        return rawTextureView;
      }
      const required = REQUIRED_TEXTURES[definition.family].includes(name);
      options.onDiagnostic?.({
        severity: required ? 'error' : 'warning',
        code: 'mystic-texture-missing',
        message: `${required ? 'Required' : 'Optional'} texture ${name} did not resolve for ${schema.id}.`,
        assetId: schema.id,
        details: { property: name, textureGuid: slot.guid, texturePath: slot.path || null },
      });
      return fallback === 'white' ? this.#white : this.#black;
    }
    return fallback === 'white' ? this.#white : this.#black;
  }

  #createUniforms(
    schema: MysticMaterialSchema,
    definition: MysticShaderDefinition,
    quality: MysticQualityProfile,
    options: MysticMaterialFactoryOptions,
    rawTextureViews: Map<THREE.Texture, THREE.Texture>,
    ownedTextureViews: Set<THREE.Texture>,
  ): Record<string, THREE.IUniform> {
    const family = definition.family;
    const mainNames = family === 'debuff-rimlight' || family.startsWith('mystic-final')
      ? ['_Main_tex']
      : family.startsWith('mystic-') || family === 'star'
        ? ['_TextureSample0']
        : family.startsWith('cel-')
          ? ['_ColorTexture']
          : ['_MainTex'];
    const maskNames = family.startsWith('mystic-final') ? ['_Mask_MAP'] : ['_Mask_alpha'];
    const mainSlot = mainNames.map((name) => schema.textures[name]).find(Boolean);
    const maskSlot = maskNames.map((name) => schema.textures[name]).find(Boolean);
    const bodyMaskSlot = schema.textures._maskmapcolorbody1;
    const emissionSlot = schema.textures._emission;

    const primaryTuple: MysticMaterialVectorTuple | MysticColorTuple = options.primaryColor === undefined
      ? colorProperty(schema, ['_PrimaryColor'], [1, 1, 1, 1])
      : (() => {
        const color = new THREE.Color(options.primaryColor).convertLinearToSRGB();
        return [color.r, color.g, color.b, 1] as const;
      })();
    const secondaryTuple: MysticMaterialVectorTuple | MysticColorTuple = options.secondaryColor === undefined
      ? colorProperty(schema, ['_SecondaryColor'], [1, 1, 1, 1])
      : (() => {
        const color = new THREE.Color(options.secondaryColor).convertLinearToSRGB();
        return [color.r, color.g, color.b, 1] as const;
      })();
    const uv2ColorTuple: MysticMaterialVectorTuple | MysticColorTuple = colorProperty(
      schema,
      ['_Color_UV2'],
      [1, 1, 1, 0],
    );

    return {
      uMysticTime: { value: 0 },
      uMysticDetail: { value: quality.shaderDetail === 'full' ? 1 : 0.45 },
      uMysticGammaBlendPass: { value: 0 },
      uAlphaClipEnabled: { value: alphaClipEnabled(schema, definition) ? 1 : 0 },
      uAlphaCutoff: { value: alphaCutoffFromUnityMaterial(schema, definition) },
      uAlpha: { value: floatProperty(schema, ['_Float0', '_Alpha'], 1) },
      uBrightness: { value: floatProperty(schema, ['_Brightness'], 1) },
      uEmission: { value: floatProperty(schema, ['_Emiss', '_Emission'], 1) },
      uEdgeWidth: { value: floatProperty(schema, ['_EdgeWidth'], 1.2) },
      uMatcapStrength: { value: floatProperty(schema, ['_matcap'], 1) },
      uMatcap2Strength: { value: floatProperty(schema, ['_matcap_UV2'], 1) },
      uRimShadow: { value: floatProperty(schema, ['_RimShadow'], 0) },
      uRimOffset: { value: floatProperty(schema, ['_RimOffset'], 0) },
      uTopMidOffset: { value: floatProperty(schema, ['_TopMid_Offset'], 0) },
      uUv2Threshold: { value: floatProperty(schema, ['_UV2_thresholdalpha'], 0.5) },
      uUv1Alpha: { value: floatProperty(schema, ['_Alpha_UV1'], 1) },
      uScaleNoise: { value: floatProperty(schema, ['_Scale_Noisemap'], 1) },
      uColorTime: { value: floatProperty(schema, ['_Color_Time'], 0.5) },
      uColorSwitch: { value: floatProperty(schema, ['_Color_switch'], 0) },
      uShadowAmount: { value: floatProperty(schema, ['_ShadowAmount'], 0) },
      uShadowSmoothness: { value: floatProperty(schema, ['_ShadowSmoothness'], 0.5) },
      uIndoor: { value: floatProperty(schema, ['_Indoor_'], 0) },
      uSnowOnTop: { value: floatProperty(schema, ['_SnowOnTop'], 0) },
      uOnPoisoned: { value: floatProperty(schema, ['_OnPoisoned'], 0) },
      uOnBurned: { value: floatProperty(schema, ['_OnBurned'], 0) },
      uAlphaEmission: { value: floatProperty(schema, ['_alpha_emiss'], 1) },
      uAlphaMainTex: { value: floatProperty(schema, ['_alphamaintex'], 0) },
      uAlphaMainTexKeyword: {
        value: schema.validKeywords.includes('_ALPHAMAINTEX_ON') ? 1 : 0,
      },
      uUnityGammaWorkflow: { value: 1 },
      uMysticCameraIsOrthographic: { value: 0 },
      uMysticCameraNear: { value: 0.1 },
      uMysticUnityObjectFromGeometry: { value: new THREE.Matrix4() },
      uCelLength: { value: floatProperty(schema, ['_Length'], 0) },
      uCelOffset: { value: floatProperty(schema, ['_Offset'], 0) },
      uMainTexTransform: { value: textureTransform(mainSlot) },
      uMaskTransform: { value: textureTransform(maskSlot) },
      uBodyMaskTransform: { value: textureTransform(bodyMaskSlot) },
      uEmissionTransform: { value: textureTransform(emissionSlot) },
      uColor0: { value: tuple(colorProperty(schema, ['_Color0'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uColor1: { value: tuple(colorProperty(schema, ['_Color1'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uColor2: { value: tuple(colorProperty(schema, ['_Color3'], [0, 0, 0, 0]), [0, 0, 0, 0]) },
      uTop: { value: tuple(colorProperty(schema, ['_Top'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uMid: { value: tuple(colorProperty(schema, ['_Mid'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uBottom: { value: tuple(colorProperty(schema, ['_bot', '_Bottom'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uRimColor: { value: tuple(colorProperty(schema, ['_RimColor'], [0, 0, 0, 0]), [0, 0, 0, 0]) },
      uBaseColor: { value: tuple(colorProperty(schema, ['_BaseColor'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uPrimaryColor: { value: tuple(primaryTuple, [1, 1, 1, 1]) },
      uSecondaryColor: { value: tuple(secondaryTuple, [1, 1, 1, 1]) },
      uUv2Color: { value: tuple(uv2ColorTuple, [1, 1, 1, 0]) },
      uSolidColor: { value: tuple(colorProperty(schema, ['_Solid_Color'], [1, 1, 1, 0]), [1, 1, 1, 0]) },
      uMasterColor: { value: tuple(colorProperty(schema, ['_master_Color'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uEmissionColor: { value: tuple(colorProperty(schema, ['_emissioncolor', '_EmissionColor'], [1, 1, 1, 1]), [1, 1, 1, 1]) },
      uTopMidStep: { value: tuple(colorProperty(schema, ['_TopMid_Step'], [0, 1, 0, 0]), [0, 1, 0, 0]) },
      uRimFalloff: { value: tuple(colorProperty(schema, ['_RimFalloff'], [0, 1, 0, 0]), [0, 1, 0, 0]) },
      uVector0: { value: tuple(colorProperty(schema, family === 'debuff-rimlight' ? ['_Gradient2'] : family.startsWith('mystic-final') ? ['_NoiseMap_ViewDIr'] : family.startsWith('mystic-') ? ['_GradientSreenspace'] : family.startsWith('cel-') ? ['_Vector0'] : family === 'star' ? ['_Vector0'] : ['_maintexUV'], [1, 1, 0, 0]), [1, 1, 0, 0]) },
      uVector1: { value: tuple(colorProperty(schema, family === 'debuff-rimlight' ? ['_secondNoise'] : family.startsWith('mystic-final') ? ['_NoiseMap_2'] : family.startsWith('cel-') ? ['_secondNoise'] : ['_DissolveUV'], [1, 1, 0, 0]), [1, 1, 0, 0]) },
      uVector2: { value: tuple(colorProperty(schema, ['_Noise3_UVSPEED'], [1, 1, 0, 0]), [1, 1, 0, 0]) },
      uVector3: { value: tuple(colorProperty(schema, ['_UV2_speed'], [0, 0, 0, 0]), [0, 0, 0, 0]) },
      uMysticCameraViewDirectionWS: { value: new THREE.Vector3(0, 0, 1) },
      uMainLightPosition: {
        value: options.mainLightPosition
          ? new THREE.Vector3(...options.mainLightPosition)
          : new THREE.Vector3(0, 0, 0),
      },
      uMainTex: { value: this.#texture(schema, definition, mainNames, 'white', options, rawTextureViews, ownedTextureViews) },
      uMaskTex: { value: this.#texture(schema, definition, maskNames, 'white', options, rawTextureViews, ownedTextureViews) },
      uMatcapTex: { value: this.#texture(schema, definition, ['_Matcap'], 'white', options, rawTextureViews, ownedTextureViews) },
      uMatcap2Tex: { value: this.#texture(schema, definition, ['_Matcap_UV2'], 'white', options, rawTextureViews, ownedTextureViews) },
      uNoiseTex: { value: this.#texture(schema, definition, family === 'debuff-rimlight' ? ['_TextureSample2'] : family.startsWith('mystic-final') ? ['_NoiseMap_ViewDir'] : family.startsWith('cel-') ? ['_emissnoise'] : ['_Noise'], 'white', options, rawTextureViews, ownedTextureViews) },
      uNoise2Tex: { value: this.#texture(schema, definition, family === 'debuff-rimlight' ? ['_second_noise'] : family.startsWith('mystic-final') ? ['_NoiseMap_2nd'] : ['_emissnoise'], 'white', options, rawTextureViews, ownedTextureViews) },
      uNoise3Tex: { value: this.#texture(schema, definition, ['_Noise_3'], 'white', options, rawTextureViews, ownedTextureViews) },
      uUv2Tex: { value: this.#texture(schema, definition, ['_UV2_texture'], 'white', options, rawTextureViews, ownedTextureViews) },
      uBodyMaskTex: { value: this.#texture(schema, definition, ['_maskmapcolorbody1'], 'white', options, rawTextureViews, ownedTextureViews) },
      uGradientTex: { value: this.#texture(schema, definition, ['_gradientmap'], 'white', options, rawTextureViews, ownedTextureViews) },
      uEmissionTex: { value: this.#texture(schema, definition, ['_emission'], 'black', options, rawTextureViews, ownedTextureViews) },
      uDissolveTex: { value: this.#texture(schema, definition, ['_DissolveTex'], 'white', options, rawTextureViews, ownedTextureViews) },
    };
  }

  #assertActive() {
    if (this.#disposed) throw new Error('Mystic source material factory is disposed.');
  }
}

export const AXIE_MYSTIC_MATERIAL_FACTORY = new MysticSourceMaterialFactory();

/** Axie assembler adapter. Unknown shader/material IDs throw explicitly. */
export class ExactAxieMysticMaterialFactory implements AxieMaterialBundleFactory {
  constructor(
    readonly sourceFactory: MysticSourceMaterialFactory = AXIE_MYSTIC_MATERIAL_FACTORY,
  ) {}

  create(context: AxieMaterialContext) {
    const bundle = this.#bundle(context);
    bundle.outline?.dispose();
    bundle.depth?.dispose();
    bundle.distance?.dispose();
    return bundle.surface;
  }

  createGeometryOutline(context: AxieMaterialContext) {
    const bundle = this.#bundle(context);
    bundle.surface.dispose();
    bundle.depth?.dispose();
    bundle.distance?.dispose();
    if (context.quality.outlineMode !== 'unity-geometry') {
      bundle.outline?.dispose();
      return undefined;
    }
    return bundle.outline;
  }

  createBundle(context: AxieMaterialContext): AxieRuntimeMaterialBundle {
    const bundle = this.#bundle(context);
    if (context.quality.outlineMode !== 'unity-geometry') bundle.outline?.dispose();
    const declaredFidelity = context.manifest.assets.shaders[context.material.shaderId]?.fidelity;
    return {
      surface: bundle.surface,
      outline: context.quality.outlineMode === 'unity-geometry' ? bundle.outline : undefined,
      depth: bundle.depth,
      distance: bundle.distance,
      castShadow: bundle.castShadow,
      fidelity: context.artMode === 'enhanced'
        ? 'enhanced'
        : declaredFidelity === 'exact' ? 'exact' : 'source-faithful',
      fallbackUsed: false,
    };
  }

  #bundle(context: AxieMaterialContext) {
    const schema = this.sourceFactory.getSchema(context.material.id)
      ?? this.sourceFactory.getSchema(context.material.id.split(':', 1)[0])
      ?? this.sourceFactory.getSchema(context.material.contentHash)
      ?? this.sourceFactory.catalog.materials.find((candidate) => (
        candidate.shaderGuid === context.material.shaderId
        && candidate.name === context.material.sourceName
      ));
    if (!schema || !MYSTIC_SHADER_DEFINITIONS.has(context.material.shaderId)) {
      const shader = context.manifest.assets.shaders[context.material.shaderId];
      throw new UnsupportedAxieShaderError(
        context.material.id,
        context.material.shaderId,
        shader?.sourceName ?? '',
      );
    }
    return this.sourceFactory.createFromSchema(schema, {
      quality: context.quality.mysticFx === 'reduced'
        ? 'reduced'
        : context.artMode === 'enhanced' ? 'enhanced' : 'faithful',
      primaryColor: context.primaryColor,
      secondaryColor: context.secondaryColor,
      resolveTexture: (slot) => {
        const property = Object.entries(schema.textures)
          .find(([, candidate]) => candidate === slot)?.[0];
        const textureId = property ? context.material.textures[property] : undefined;
        return (property ? context.textures[property] : undefined)
          ?? (textureId ? context.textures[textureId] : undefined)
          ?? context.textures[slot.guid]
          ?? context.textures[slot.path];
      },
    });
  }
}

export const AXIE_EXACT_MYSTIC_MATERIAL_FACTORY: AxieMaterialBundleFactory = Object.freeze(
  new ExactAxieMysticMaterialFactory(),
);

/** Routes core V4 plus all ten Mystic/VFX GUIDs without a generic fallback. */
export class ExactAxieProductionMaterialFactory implements AxieMaterialBundleFactory {
  constructor(
    readonly base: AxieMaterialBundleFactory = AXIE_EXACT_BASE_V4_MATERIAL_FACTORY,
    readonly mystic: AxieMaterialBundleFactory = AXIE_EXACT_MYSTIC_MATERIAL_FACTORY,
  ) {}

  create(context: AxieMaterialContext) {
    return this.#factory(context).create(context);
  }

  createGeometryOutline(context: AxieMaterialContext) {
    return this.#factory(context).createGeometryOutline(context);
  }

  createBundle(context: AxieMaterialContext) {
    return this.#factory(context).createBundle(context);
  }

  #factory(context: AxieMaterialContext) {
    return MYSTIC_SHADER_DEFINITIONS.has(context.material.shaderId) ? this.mystic : this.base;
  }
}

export const AXIE_EXACT_PRODUCTION_MATERIAL_FACTORY: AxieMaterialBundleFactory = Object.freeze(
  new ExactAxieProductionMaterialFactory(),
);
