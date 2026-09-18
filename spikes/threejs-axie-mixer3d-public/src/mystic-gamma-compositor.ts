import * as THREE from 'three';
import type { MysticSourceMaterial } from './mystic-material-factory';

type UnityGammaSourceMaterial = THREE.ShaderMaterial & {
  readonly uniforms: Record<string, THREE.IUniform>;
};

type UnityDepthSourceMaterial = UnityGammaSourceMaterial & {
  readonly uniforms: Record<string, THREE.IUniform> & {
    readonly uUnityCameraDepthTexture: THREE.IUniform<THREE.Texture | null>;
    readonly uUnityDepthViewport: THREE.IUniform<THREE.Vector2>;
    readonly uUnityCameraNearFar: THREE.IUniform<THREE.Vector2>;
    readonly uUnityCameraOrthographic: THREE.IUniform<number>;
    readonly uUnityHasSceneDepth: THREE.IUniform<number>;
  };
};

const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Sampling an SRGB8 target returns linear values. Re-encode them before
// writing to the RGBA8 NoColorSpace accumulation target. The matched Browser
// oracle asserts byte identity across the entire transported baseline.
const COPY_ENCODED_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D uSource;
  varying vec2 vUv;

  vec3 linearToSrgb(vec3 value) {
    vec3 low = value * 12.92;
    vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), value));
  }

  void main() {
    vec4 source = texture2D(uSource, vUv);
    gl_FragColor = vec4(linearToSrgb(source.rgb), source.a);
  }
`;

// The accumulator stores encoded Gamma RGB numerically. Decode it to Three's
// linear working domain, apply the renderer's proved output transform exactly
// once, and let the real destination encode exactly once. Three intentionally
// disables renderer tone mapping for ordinary WebGLRenderTargets, so the
// present pass cannot rely on material.toneMapped when it serves both the
// default framebuffer and world-capture targets.
const PRESENT_FRAGMENT = /* glsl */`
  precision highp float;
  uniform sampler2D uSource;
  uniform int uPresentToneMapping;
  varying vec2 vUv;

  // Use Three r178's own NeutralToneMapping implementation and
  // toneMappingExposure uniform rather than maintaining a local approximation.
  #include <tonemapping_pars_fragment>

  vec3 srgbToLinear(vec3 value) {
    vec3 low = value / 12.92;
    vec3 high = pow((max(value, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
    return mix(low, high, step(vec3(0.04045), value));
  }

  void main() {
    vec4 source = texture2D(uSource, vUv);
    vec3 linearColor = srgbToLinear(source.rgb);
    if (uPresentToneMapping == 1) {
      linearColor = NeutralToneMapping(linearColor);
    }
    gl_FragColor = vec4(linearColor, source.a);
    #include <colorspace_fragment>
  }
`;

const PRESENT_NO_TONE_MAPPING = 0;
const PRESENT_NEUTRAL_TONE_MAPPING = 1;

function configurePresentToneMapping(
  renderer: THREE.WebGLRenderer,
  material: THREE.ShaderMaterial,
) {
  const toneMapping = renderer.toneMapping;
  if (toneMapping !== THREE.NoToneMapping && toneMapping !== THREE.NeutralToneMapping) {
    throw new Error(
      'Mystic Gamma encoded composition supports only Three r178 NoToneMapping '
      + `(${THREE.NoToneMapping}) or NeutralToneMapping (${THREE.NeutralToneMapping}); `
      + `received unproved tone-mapping mode ${toneMapping}.`,
    );
  }
  const exposure = renderer.toneMappingExposure;
  if (!Number.isFinite(exposure) || exposure < 0) {
    throw new Error(
      `Mystic Gamma encoded composition requires a finite non-negative tone-mapping exposure; received ${exposure}.`,
    );
  }
  material.uniforms.uPresentToneMapping.value = toneMapping === THREE.NeutralToneMapping
    ? PRESENT_NEUTRAL_TONE_MAPPING
    : PRESENT_NO_TONE_MAPPING;
  material.uniforms.toneMappingExposure.value = exposure;
}

type Renderable = THREE.Object3D & { material: THREE.Material | THREE.Material[] };

function isMysticSourceMaterial(material: THREE.Material): material is MysticSourceMaterial {
  const candidate = material as MysticSourceMaterial;
  const marker = candidate.userData?.axieMystic as {
    readonly faithful?: unknown;
    readonly shaderFamily?: unknown;
    readonly requiresGammaComposition?: unknown;
  } | undefined;
  return candidate.isShaderMaterial === true
    && marker?.faithful === true
    && typeof marker.shaderFamily === 'string'
    && marker.requiresGammaComposition === true
    && typeof candidate.setTime === 'function'
    && candidate.uniforms?.uMysticGammaBlendPass !== undefined;
}

function unityGammaPassUniform(material: THREE.Material): THREE.IUniform<number> | null {
  const candidate = material as UnityGammaSourceMaterial;
  if (isMysticSourceMaterial(material)) {
    return candidate.uniforms.uMysticGammaBlendPass as THREE.IUniform<number>;
  }
  const marker = material.userData?.unityGammaBlend as {
    readonly faithful?: unknown;
    readonly activeColorSpace?: unknown;
    readonly family?: unknown;
  } | undefined;
  if (candidate.isShaderMaterial !== true
    || marker?.faithful !== true
    || marker.activeColorSpace !== 'Gamma'
    || typeof marker.family !== 'string'
    || candidate.uniforms?.uUnityGammaBlendPass === undefined) return null;
  return candidate.uniforms.uUnityGammaBlendPass as THREE.IUniform<number>;
}

/** Realm-safe public contract used by exact-source Gamma material adapters. */
export function isUnityGammaCompositorTargetMaterial(
  material: THREE.Material,
): material is UnityGammaSourceMaterial {
  return material.transparent && unityGammaPassUniform(material) !== null;
}

type MaterialRecord = {
  readonly object: Renderable;
  readonly original: THREE.Material | THREE.Material[];
  readonly slots: readonly THREE.Material[];
  readonly target: readonly boolean[];
};

interface RendererTargetState {
  readonly target: THREE.WebGLRenderTarget | null;
  readonly faceOrLayer: number;
  readonly mipmapLevel: number;
}

export interface MysticGammaCompositorHooks {
  /** Runs before any color draw; use it for URP-style depth/normal inputs. */
  readonly beforeColor?: () => void;
  /** Runs on the encoded-Gamma target after transparent streams, before present. */
  readonly beforePresent?: (encodedGammaTarget: THREE.WebGLRenderTarget) => void;
  /** Force the encoded path even when no transparent Mystic material is visible. */
  readonly forceEncodedGamma?: boolean;
}

function rendererTargetState(renderer: THREE.WebGLRenderer): RendererTargetState {
  return {
    target: renderer.getRenderTarget(),
    faceOrLayer: renderer.getActiveCubeFace(),
    mipmapLevel: renderer.getActiveMipmapLevel(),
  };
}

function restoreRendererTarget(renderer: THREE.WebGLRenderer, state: RendererTargetState) {
  renderer.setRenderTarget(state.target, state.faceOrLayer, state.mipmapLevel);
}

function materialRecords(root: THREE.Object3D) {
  const records: MaterialRecord[] = [];
  root.traverseVisible((object) => {
    const candidate = object as Partial<Renderable>;
    if (!candidate.material) return;
    const slots = Array.isArray(candidate.material) ? candidate.material : [candidate.material];
    const target = slots.map((material) => (
      material.visible && isUnityGammaCompositorTargetMaterial(material)
    ));
    records.push({
      object: candidate as Renderable,
      original: candidate.material,
      slots,
      target,
    });
  });
  return records;
}

function assignSlots(
  records: readonly MaterialRecord[],
  keepTarget: boolean,
  invisible: THREE.Material,
) {
  records.forEach(({ object, original, slots, target }) => {
    const next = slots.map((material, index) => target[index] === keepTarget ? material : invisible);
    object.material = Array.isArray(original) ? next : next[0];
  });
}

function restoreSlots(records: readonly MaterialRecord[]) {
  records.forEach(({ object, original }) => { object.material = original; });
}

function targetMaterials(records: readonly MaterialRecord[]) {
  const result = new Set<UnityGammaSourceMaterial>();
  records.forEach(({ slots, target }) => slots.forEach((material, index) => {
    if (target[index]) result.add(material as UnityGammaSourceMaterial);
  }));
  return result;
}

/** True only when a visible hierarchy contains an active source Gamma target. */
export function sceneRequiresUnityGammaComposition(root: THREE.Object3D) {
  return targetMaterials(materialRecords(root)).size > 0;
}

function interleavableTransparentMaterials(records: readonly MaterialRecord[]) {
  const result = new Set<THREE.Material>();
  records.forEach(({ slots, target }) => slots.forEach((material, index) => {
    if (material.visible && material.transparent && !target[index]) result.add(material);
  }));
  return result;
}

function allMaterials(records: readonly MaterialRecord[]) {
  return new Set(records.flatMap(({ slots }) => slots));
}

function makeTarget(
  name: string,
  colorSpace: THREE.ColorSpace,
  samples: number,
  stencilBuffer = true,
) {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    samples,
  });
  target.texture.name = name;
  target.texture.colorSpace = colorSpace;
  return target;
}

function attachSampleableDepth(target: THREE.WebGLRenderTarget) {
  const depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
  depth.name = `${target.texture.name}:SceneDepth`;
  depth.format = THREE.DepthFormat;
  depth.minFilter = THREE.NearestFilter;
  depth.magFilter = THREE.NearestFilter;
  depth.generateMipmaps = false;
  target.depthTexture = depth;
  return target;
}

function assertIndependentUnitySceneDepth(
  depth: THREE.DepthTexture | null,
  drawTarget: THREE.WebGLRenderTarget,
) {
  if (!depth) {
    throw new Error('Unity scene-depth composition has no sampleable camera-depth texture.');
  }
  if (depth === drawTarget.depthTexture || depth === drawTarget.texture) {
    throw new Error(
      'Unity scene-depth composition refused a read/write feedback loop on the active Gamma target.',
    );
  }
}

function isUnityDepthSourceMaterial(material: UnityGammaSourceMaterial): material is UnityDepthSourceMaterial {
  const required = material.userData?.vfxRequiresUnitySceneDepth === true;
  const uniforms = material.uniforms;
  const complete = uniforms.uUnityCameraDepthTexture !== undefined
    && uniforms.uUnityDepthViewport !== undefined
    && uniforms.uUnityCameraNearFar !== undefined
    && uniforms.uUnityCameraOrthographic !== undefined
    && uniforms.uUnityHasSceneDepth !== undefined;
  if (required && !complete) {
    throw new Error(`Unity Gamma material ${material.name || material.uuid} requires scene depth without the exact uniform contract.`);
  }
  return required && complete;
}

function configureUnitySceneDepth(
  materials: ReadonlySet<UnityGammaSourceMaterial>,
  depth: THREE.DepthTexture | null,
  camera: THREE.Camera,
  width: number,
  height: number,
  enabled: boolean,
) {
  const source = camera as THREE.Camera & { readonly near?: number; readonly far?: number };
  materials.forEach((material) => {
    if (!isUnityDepthSourceMaterial(material)) return;
    const near = source.near;
    const far = source.far;
    if (enabled && (!depth || typeof near !== 'number' || typeof far !== 'number'
      || !Number.isFinite(near) || !Number.isFinite(far) || near <= 0 || far <= near)) {
      throw new Error(`Unity scene-depth material ${material.name || material.uuid} has no exact camera depth input.`);
    }
    material.uniforms.uUnityCameraDepthTexture.value = enabled ? depth : null;
    material.uniforms.uUnityDepthViewport.value.set(Math.max(1, width), Math.max(1, height));
    material.uniforms.uUnityCameraNearFar.value.set(near ?? 0.1, far ?? 1000);
    material.uniforms.uUnityCameraOrthographic.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    material.uniforms.uUnityHasSceneDepth.value = enabled ? 1 : 0;
  });
}

function renderDirect(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  output: THREE.WebGLRenderTarget | null,
) {
  const previous = rendererTargetState(renderer);
  const targetChanged = output !== previous.target;
  try {
    if (targetChanged) renderer.setRenderTarget(output);
    renderer.render(scene, camera);
    return false;
  } finally {
    if (targetChanged) restoreRendererTarget(renderer, previous);
  }
}

/**
 * Preserves Unity Gamma-project SrcAlpha blending for audited Mystic materials
 * and source PostProcess overlays.
 *
 * Opaque/non-Mystic content is rendered to SRGB8. Its stored encoded bytes are
 * reconstructed in an RGBA8 NoColorSpace accumulator, depth is rebuilt with
 * the original vertex programs, ordered transparent Mystic surfaces render in
 * raw-Gamma mode, and `beforePresent` can add the PostProcess overlay in that
 * same domain. The accumulator is decoded once for the real destination.
 */
export class MysticGammaCompositor {
  readonly #base: THREE.WebGLRenderTarget;
  readonly #gamma: THREE.WebGLRenderTarget;
  readonly #sceneDepth: THREE.WebGLRenderTarget;
  readonly #camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #copyScene = new THREE.Scene();
  readonly #presentScene = new THREE.Scene();
  readonly #geometry = new THREE.PlaneGeometry(2, 2);
  readonly #copyMaterial = new THREE.ShaderMaterial({
    name: 'AxieMysticGamma:CopyEncoded',
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: COPY_ENCODED_FRAGMENT,
    uniforms: { uSource: { value: null } },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  readonly #presentMaterial = new THREE.ShaderMaterial({
    name: 'AxieMysticGamma:Present',
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: PRESENT_FRAGMENT,
    uniforms: {
      uSource: { value: null },
      uPresentToneMapping: { value: PRESENT_NO_TONE_MAPPING },
      toneMappingExposure: { value: 1 },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
    toneMapped: false,
    transparent: false,
  });
  readonly #invisible = new THREE.MeshBasicMaterial({ visible: false });
  readonly #size = new THREE.Vector2();
  readonly #strictGlobalTransparentOrder: boolean;
  readonly #onDiagnostic?: (message: string, materials: readonly THREE.Material[]) => void;
  readonly #maxSamplePixels: number;
  #requestedSamples: number;
  #reportedOrderRisk = false;
  #lastRoute: 'direct' | 'direct-fallback' | 'encoded' = 'direct';
  #disposed = false;

  constructor(options: {
    readonly strictGlobalTransparentOrder?: boolean;
    readonly onDiagnostic?: (message: string, materials: readonly THREE.Material[]) => void;
    readonly samples?: number;
    readonly maxSamplePixels?: number;
  } = {}) {
    this.#requestedSamples = Math.max(0, Math.trunc(options.samples ?? 0));
    this.#maxSamplePixels = Math.max(0, options.maxSamplePixels ?? Number.POSITIVE_INFINITY);
    this.#base = makeTarget('AxieMysticGamma:Base-sRGB8', THREE.SRGBColorSpace, 0);
    this.#gamma = makeTarget('AxieMysticGamma:Encoded-RGBA8', THREE.NoColorSpace, 0);
    // Unity's camera depth texture is a resolved, independently sampleable
    // resource. Never attach it to #gamma: target materials draw into #gamma,
    // and sampling an attachment of the active framebuffer is a WebGL
    // read/write feedback loop with undefined pixels.
    this.#sceneDepth = attachSampleableDepth(
      makeTarget('AxieMysticGamma:CameraDepth', THREE.NoColorSpace, 0, false),
    );
    this.#strictGlobalTransparentOrder = options.strictGlobalTransparentOrder === true;
    this.#onDiagnostic = options.onDiagnostic;
    this.#copyScene.add(new THREE.Mesh(this.#geometry, this.#copyMaterial));
    this.#presentScene.add(new THREE.Mesh(this.#geometry, this.#presentMaterial));
  }

  setSamples(samples: number) {
    if (this.#disposed) throw new Error('Mystic Gamma compositor is disposed.');
    this.#requestedSamples = Math.max(0, Math.trunc(samples));
    return this;
  }

  get lastRoute() { return this.#lastRoute; }

  get disposed() { return this.#disposed; }

  #configureSamples(width: number, height: number) {
    const affordable = Math.floor(this.#maxSamplePixels / Math.max(1, width * height));
    const capped = Math.min(this.#requestedSamples, affordable);
    const samples = capped >= 4 ? 4 : capped >= 2 ? 2 : 0;
    for (const target of [this.#base, this.#gamma]) {
      if (target.samples === samples) continue;
      target.samples = samples;
      target.dispose();
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    output: THREE.WebGLRenderTarget | null = renderer.getRenderTarget(),
    hooks: MysticGammaCompositorHooks = {},
  ) {
    if (this.#disposed) throw new Error('Mystic Gamma compositor is disposed.');
    const records = materialRecords(scene);
    const targets = targetMaterials(records);
    const encodedPath = targets.size > 0
      || hooks.forceEncodedGamma === true
      || hooks.beforePresent !== undefined;
    if (!encodedPath) {
      this.#lastRoute = 'direct';
      return renderDirect(renderer, scene, camera, output);
    }

    const interleavable = [...interleavableTransparentMaterials(records)];
    if (interleavable.length > 0) {
      const names = interleavable.map((material) => material.name || material.type).join(', ');
      const message = 'Mystic Gamma composition cannot split the global transparent order; '
        + `found ${interleavable.length} visible non-Mystic transparent material(s): ${names}`;
      if (this.#strictGlobalTransparentOrder) throw new Error(message);
      if (!this.#reportedOrderRisk) {
        this.#reportedOrderRisk = true;
        this.#onDiagnostic?.(message, interleavable);
      }
      this.#lastRoute = 'direct-fallback';
      return renderDirect(renderer, scene, camera, output);
    }

    // Validate and snapshot the output transform before touching scene or
    // renderer state. Unsupported modes fail closed instead of producing a
    // frame whose encoded path silently differs from Three's direct path.
    configurePresentToneMapping(renderer, this.#presentMaterial);

    if (output) this.#size.set(output.width, output.height);
    else renderer.getDrawingBufferSize(this.#size);
    const width = Math.max(1, Math.floor(this.#size.x));
    const height = Math.max(1, Math.floor(this.#size.y));
    this.#configureSamples(width, height);
    this.#base.setSize(width, height);
    this.#gamma.setSize(width, height);
    this.#sceneDepth.setSize(width, height);

    const previousTarget = rendererTargetState(renderer);
    const previousAutoClear = renderer.autoClear;
    const previousBackground = scene.background;
    const previousShadowAutoUpdate = renderer.shadowMap.autoUpdate;
    const previousXr = renderer.xr.enabled;
    const colorWrite = new Map<THREE.Material, boolean>();

    try {
      renderer.xr.enabled = false;
      hooks.beforeColor?.();

      // Base scene and opaque ExtraPrePass outlines use the ordinary Three path.
      assignSlots(records, false, this.#invisible);
      renderer.setRenderTarget(this.#base);
      renderer.autoClear = true;
      renderer.render(scene, camera);

      // Hardware decodes the SRGB8 sample. Re-encoding in the copy shader makes
      // the RGBA8 NoColorSpace attachment byte-identical to the stored baseline.
      this.#copyMaterial.uniforms.uSource.value = this.#base.texture;
      renderer.setRenderTarget(this.#gamma);
      renderer.autoClear = false;
      renderer.clear(true, true, true);
      renderer.render(this.#copyScene, this.#camera);

      // Rebuild both depth resources from the same non-target draw set with the
      // original vertex/alpha programs. #gamma owns the destination depth used
      // by fixed-function depth testing. #sceneDepth owns the independently
      // sampleable resolved camera depth used by exact soft-particle shaders.
      scene.background = null;
      renderer.shadowMap.autoUpdate = false;
      for (const material of allMaterials(records)) {
        colorWrite.set(material, material.colorWrite);
        material.colorWrite = false;
      }

      renderer.setRenderTarget(this.#sceneDepth);
      renderer.clear(true, true, true);
      renderer.render(scene, camera);

      renderer.setRenderTarget(this.#gamma);
      renderer.clear(false, true, true);
      renderer.render(scene, camera);
      colorWrite.forEach((value, material) => { material.colorWrite = value; });
      colorWrite.clear();

      // Three retains its ordinary transparent ordering, ZWrite, and blend
      // factors while these audited materials output encoded RGB numerically.
      assignSlots(records, true, this.#invisible);
      targets.forEach((material) => { unityGammaPassUniform(material)!.value = 1; });
      assertIndependentUnitySceneDepth(this.#sceneDepth.depthTexture, this.#gamma);
      configureUnitySceneDepth(targets, this.#sceneDepth.depthTexture, camera, width, height, true);
      renderer.render(scene, camera);
      configureUnitySceneDepth(targets, null, camera, width, height, false);
      targets.forEach((material) => { unityGammaPassUniform(material)!.value = 0; });

      hooks.beforePresent?.(this.#gamma);

      this.#presentMaterial.uniforms.uSource.value = this.#gamma.texture;
      if (output === previousTarget.target) {
        restoreRendererTarget(renderer, previousTarget);
      } else {
        renderer.setRenderTarget(output);
      }
      renderer.render(this.#presentScene, this.#camera);
      this.#lastRoute = 'encoded';
      return true;
    } finally {
      configureUnitySceneDepth(targets, null, camera, this.#gamma.width, this.#gamma.height, false);
      targets.forEach((material) => { unityGammaPassUniform(material)!.value = 0; });
      colorWrite.forEach((value, material) => { material.colorWrite = value; });
      restoreSlots(records);
      scene.background = previousBackground;
      renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      renderer.xr.enabled = previousXr;
      renderer.autoClear = previousAutoClear;
      restoreRendererTarget(renderer, previousTarget);
    }
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#base.dispose();
    this.#gamma.dispose();
    this.#sceneDepth.dispose();
    this.#geometry.dispose();
    this.#copyMaterial.dispose();
    this.#presentMaterial.dispose();
    this.#invisible.dispose();
  }
}
