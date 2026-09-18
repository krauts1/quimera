import * as THREE from 'three';
import {
  AXIE_OPAQUE_RENDER_QUEUE_MAX,
  AXIE_OPAQUE_RENDER_QUEUE_MIN,
  isAxieDepthNormalsSourceEligible,
  readAxieSourceRenderPasses,
} from './render-pass-registry';

/**
 * Exact browser translation of
 * `Resources/AxieMixer3D/Shaders/Outline/PostProcess.shader`.
 *
 * The Unity shader is an overlay: it does not sample camera colour. It samples
 * the camera depth and normal inputs, emits the configured outline colour, and
 * blends that colour over the already-rendered camera target. The authored
 * shader multiplies `_Thickness` twice; retaining that thickness-squared pixel
 * radius is intentional source parity, not a typo.
 *
 * This is an opt-in translation, not a default mixer render stage. The pinned
 * package requires manual renderer-feature setup, and neither delivered Unity
 * renderer asset installs that feature. Keep it dormant until a newer
 * authoritative renderer graph proves activation; see
 * `docs/outline-postprocess-runtime-verdict.md`.
 */

export const AXIE_OUTLINE_POST_PROCESS_SOURCE =
  'Resources/AxieMixer3D/Shaders/Outline/PostProcess.shader' as const;
export const AXIE_OUTLINE_POSTPROCESS_SHADER_NAME =
  'Axie Mixer 3D/Outline/PostProcess' as const;
export const AXIE_OUTLINE_POST_PROCESS_EVENT =
  'AfterRenderingPostProcessing' as const;
export const AXIE_OUTLINE_POST_PROCESS_INPUTS =
  Object.freeze(['Normal', 'Depth'] as const);

export interface AxieOutlinePostProcessParameters {
  readonly outlineColor?: THREE.ColorRepresentation;
  readonly thickness?: number;
  readonly depthScale?: number;
  readonly depthBias?: number;
  readonly normalScale?: number;
  readonly normalBias?: number;
}

export interface AxieOutlineDepthProjection {
  readonly orthographic: boolean;
  /** Exact Unity `unity_OrthoParams.x` value used by the authored shader. */
  readonly unityOrthoParamX: number;
  readonly reversedZ?: boolean;
  readonly near?: number;
  readonly far?: number;
}

export interface AxieOutlineSobelSample {
  readonly centerDepth: number;
  /** Unity source order: +x, -x, +y, -y. */
  readonly adjacentDepths: readonly [number, number, number, number];
  readonly centerNormal: readonly [number, number, number];
  /** Unity source order: +x, -x, +y, -y. */
  readonly adjacentNormals: readonly [
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
    readonly [number, number, number],
  ];
}

export interface AxieOutlineSobelResult {
  readonly depth: number;
  readonly normal: number;
  readonly alpha: number;
}

export const AXIE_OUTLINE_POST_PROCESS_DEFAULTS = Object.freeze({
  outlineColor: '#000000' as THREE.ColorRepresentation,
  thickness: 1,
  depthScale: 50,
  depthBias: 50,
  normalScale: 0.7,
  normalBias: 10,
});

export const AXIE_OUTLINE_POST_PROCESS_VERTEX_SHADER = /* glsl */`
precision highp float;

attribute vec3 position;
varying vec2 vUv;

void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
  vUv = position.xy * 0.5 + 0.5;
}
`;

export const AXIE_OUTLINE_POST_PROCESS_FRAGMENT_SHADER = /* glsl */`
precision highp float;

uniform sampler2D _CameraDepthTexture;
uniform sampler2D _CameraNormalsTexture;
uniform vec4 _ScreenParams;
uniform float _Thickness;
uniform vec3 _Color;
uniform float _DepthScale;
uniform float _DepthBias;
uniform float _NormalScale;
uniform float _NormalBias;
uniform float _UnityOrthoParamX;
uniform float _ReversedZ;
uniform vec4 _ZBufferParams;

varying vec2 vUv;

float LinearizeDepth(float z) {
  // The pinned source checks unity_OrthoParams.x rather than the projection
  // type in .w. Preserve that authored branch, including its perspective-camera
  // behavior, instead of silently correcting the shader.
  if (_UnityOrthoParamX > 0.5) {
    return _ReversedZ > 0.5 ? 1.0 - z : z;
  }
  return 1.0 / (_ZBufferParams.x * z + _ZBufferParams.y);
}

float SampleLinearDepth(vec2 uv) {
  return LinearizeDepth(texture2D(_CameraDepthTexture, uv).r);
}

vec3 SampleSceneNormals(vec2 uv) {
  return texture2D(_CameraNormalsTexture, uv).xyz;
}

float SobelDepth(vec2 uv, vec2 adjacentUVs[4]) {
  float dc = SampleLinearDepth(uv);
  vec4 d = vec4(
    SampleLinearDepth(adjacentUVs[0]),
    SampleLinearDepth(adjacentUVs[1]),
    SampleLinearDepth(adjacentUVs[2]),
    SampleLinearDepth(adjacentUVs[3])
  );
  return pow(length(d - vec4(dc)) * _DepthScale, _DepthBias);
}

float SobelNormal(vec2 uv, vec2 adjacentUVs[4]) {
  vec3 nc = SampleSceneNormals(uv);
  vec3 n0 = SampleSceneNormals(adjacentUVs[0]) - nc;
  vec3 n1 = SampleSceneNormals(adjacentUVs[1]) - nc;
  vec3 n2 = SampleSceneNormals(adjacentUVs[2]) - nc;
  vec3 n3 = SampleSceneNormals(adjacentUVs[3]) - nc;
  float n = sqrt(dot(n0, n0) + dot(n1, n1) + dot(n2, n2) + dot(n3, n3));
  return pow(n * _NormalScale, _NormalBias);
}

void main() {
  vec3 offset = vec3(_Thickness / _ScreenParams.xy, 0.0) * _Thickness;
  vec2 adjacentUVs[4];
  adjacentUVs[0] = vUv + offset.xz;
  adjacentUVs[1] = vUv - offset.xz;
  adjacentUVs[2] = vUv + offset.zy;
  adjacentUVs[3] = vUv - offset.zy;
  float sobelDepth = SobelDepth(vUv, adjacentUVs);
  float sobelNormal = SobelNormal(vUv, adjacentUVs);
  float sobelAlpha = clamp(max(sobelDepth, sobelNormal), 0.0, 1.0);
  gl_FragColor = vec4(_Color, sobelAlpha);
}
`;

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function zBufferParams(near: number, far: number, reversedZ: boolean) {
  if (reversedZ) {
    const x = -1 + far / near;
    return new THREE.Vector4(x, 1, x / far, 1 / far);
  }
  const x = 1 - far / near;
  const y = far / near;
  return new THREE.Vector4(x, y, x / far, y / far);
}

// The pinned Unity project uses Gamma colour space. Three parses CSS/hex input
// into its linear working space, so convert back to the authored Gamma-domain
// uniform value before the raw post-process shader writes it.
function unityGammaColor(value: THREE.ColorRepresentation) {
  return new THREE.Color(value).convertLinearToSRGB();
}

export function axieOutlineUvOffset(
  thickness: number,
  width: number,
  height: number,
): readonly [number, number] {
  const sourceThickness = finiteNonNegative(thickness, AXIE_OUTLINE_POST_PROCESS_DEFAULTS.thickness);
  const safeWidth = Math.max(1, finiteNonNegative(width, 1));
  const safeHeight = Math.max(1, finiteNonNegative(height, 1));
  return [
    (sourceThickness * sourceThickness) / safeWidth,
    (sourceThickness * sourceThickness) / safeHeight,
  ];
}

export function axieOutlineLinear01Depth(
  rawDepth: number,
  projection: AxieOutlineDepthProjection,
) {
  const z = THREE.MathUtils.clamp(rawDepth, 0, 1);
  if (projection.unityOrthoParamX > 0.5) return projection.reversedZ ? 1 - z : z;
  const near = Math.max(Number.EPSILON, projection.near ?? 0.1);
  const far = Math.max(near + Number.EPSILON, projection.far ?? 1000);
  const params = zBufferParams(near, far, projection.reversedZ ?? false);
  return 1 / (params.x * z + params.y);
}

/** Unity Camera.orthographicSize defaults to 5 even in Perspective mode. */
export const AXIE_UNITY_DEFAULT_ORTHOGRAPHIC_SIZE = 5;
export const AXIE_UNITY_ORTHOGRAPHIC_SIZE_USER_DATA =
  'axieUnityOrthographicSize' as const;

/**
 * Reconstructs URP 12.1.15's `unity_OrthoParams.x`:
 * `camera.orthographicSize * cameraData.aspectRatio`.
 *
 * The source PostProcess shader incorrectly uses this width value as its
 * projection-mode branch. Perspective cameras therefore normally enter the
 * raw-depth branch too. An imported Unity camera can preserve a non-default
 * orthographicSize through `camera.userData.axieUnityOrthographicSize`.
 */
export function axieUnityOrthoParamX(
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  // URP uses cameraData.aspectRatio from the actual camera pixel viewport, not
  // the possibly stale projection aspect stored on the Camera object.
  const aspect = Math.max(Number.EPSILON, width) / Math.max(1, height);
  if (camera instanceof THREE.OrthographicCamera) {
    const zoom = Math.max(Number.EPSILON, Math.abs(camera.zoom));
    const orthographicSize = Math.abs(camera.top - camera.bottom) / (2 * zoom);
    return orthographicSize * aspect;
  }
  const configuredSize = Number(camera.userData[AXIE_UNITY_ORTHOGRAPHIC_SIZE_USER_DATA]);
  const orthographicSize = Number.isFinite(configuredSize) && configuredSize >= 0
    ? configuredSize
    : AXIE_UNITY_DEFAULT_ORTHOGRAPHIC_SIZE;
  return orthographicSize * aspect;
}

function squaredDistance(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
) {
  const x = a[0] - b[0];
  const y = a[1] - b[1];
  const z = a[2] - b[2];
  return x * x + y * y + z * z;
}

/** Deterministic CPU oracle for the authored fragment-shader equations. */
export function evaluateAxieOutlineSobel(
  sample: AxieOutlineSobelSample,
  parameters: AxieOutlinePostProcessParameters = {},
): AxieOutlineSobelResult {
  const depthScale = finiteNonNegative(
    parameters.depthScale ?? AXIE_OUTLINE_POST_PROCESS_DEFAULTS.depthScale,
    AXIE_OUTLINE_POST_PROCESS_DEFAULTS.depthScale,
  );
  const depthBias = finiteNonNegative(
    parameters.depthBias ?? AXIE_OUTLINE_POST_PROCESS_DEFAULTS.depthBias,
    AXIE_OUTLINE_POST_PROCESS_DEFAULTS.depthBias,
  );
  const normalScale = finiteNonNegative(
    parameters.normalScale ?? AXIE_OUTLINE_POST_PROCESS_DEFAULTS.normalScale,
    AXIE_OUTLINE_POST_PROCESS_DEFAULTS.normalScale,
  );
  const normalBias = finiteNonNegative(
    parameters.normalBias ?? AXIE_OUTLINE_POST_PROCESS_DEFAULTS.normalBias,
    AXIE_OUTLINE_POST_PROCESS_DEFAULTS.normalBias,
  );
  const depthLength = Math.sqrt(sample.adjacentDepths.reduce(
    (sum, value) => sum + (value - sample.centerDepth) ** 2,
    0,
  ));
  const normalLength = Math.sqrt(sample.adjacentNormals.reduce(
    (sum, value) => sum + squaredDistance(value, sample.centerNormal),
    0,
  ));
  const depth = Math.pow(depthLength * depthScale, depthBias);
  const normal = Math.pow(normalLength * normalScale, normalBias);
  return {
    depth,
    normal,
    alpha: THREE.MathUtils.clamp(Math.max(depth, normal), 0, 1),
  };
}

export class AxieOutlinePostProcessMaterial extends THREE.RawShaderMaterial {
  constructor(parameters: AxieOutlinePostProcessParameters = {}) {
    const defaults = AXIE_OUTLINE_POST_PROCESS_DEFAULTS;
    super({
      name: 'AxieOutlinePostProcessMaterial',
      uniforms: {
        _CameraDepthTexture: { value: null as THREE.Texture | null },
        _CameraNormalsTexture: { value: null as THREE.Texture | null },
        _ScreenParams: { value: new THREE.Vector4(1, 1, 2, 2) },
        _Thickness: { value: parameters.thickness ?? defaults.thickness },
        _Color: { value: unityGammaColor(parameters.outlineColor ?? defaults.outlineColor) },
        _DepthScale: { value: parameters.depthScale ?? defaults.depthScale },
        _DepthBias: { value: parameters.depthBias ?? defaults.depthBias },
        _NormalScale: { value: parameters.normalScale ?? defaults.normalScale },
        _NormalBias: { value: parameters.normalBias ?? defaults.normalBias },
        _UnityOrthoParamX: { value: 1 },
        _ReversedZ: { value: 0 },
        _ZBufferParams: { value: zBufferParams(0.1, 1000, false) },
      },
      vertexShader: AXIE_OUTLINE_POST_PROCESS_VERTEX_SHADER,
      fragmentShader: AXIE_OUTLINE_POST_PROCESS_FRAGMENT_SHADER,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      // Source `Cull Off` is commented, so ShaderLab's default Cull Back is
      // effective. The fullscreen quad is front-facing.
      side: THREE.FrontSide,
      toneMapped: false,
      fog: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha: THREE.SrcAlphaFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
  }

  setParameters(parameters: AxieOutlinePostProcessParameters) {
    if (parameters.outlineColor !== undefined) {
      (this.uniforms._Color.value as THREE.Color).copy(unityGammaColor(parameters.outlineColor));
    }
    if (parameters.thickness !== undefined) this.uniforms._Thickness.value = parameters.thickness;
    if (parameters.depthScale !== undefined) this.uniforms._DepthScale.value = parameters.depthScale;
    if (parameters.depthBias !== undefined) this.uniforms._DepthBias.value = parameters.depthBias;
    if (parameters.normalScale !== undefined) this.uniforms._NormalScale.value = parameters.normalScale;
    if (parameters.normalBias !== undefined) this.uniforms._NormalBias.value = parameters.normalBias;
    return this;
  }

  setInputTextures(depth: THREE.Texture, normals: THREE.Texture) {
    this.uniforms._CameraDepthTexture.value = depth;
    this.uniforms._CameraNormalsTexture.value = normals;
    return this;
  }

  setSize(width: number, height: number) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    (this.uniforms._ScreenParams.value as THREE.Vector4).set(
      safeWidth,
      safeHeight,
      1 + 1 / safeWidth,
      1 + 1 / safeHeight,
    );
    return this;
  }

  setProjection(projection: AxieOutlineDepthProjection) {
    const near = Math.max(Number.EPSILON, projection.near ?? 0.1);
    const far = Math.max(near + Number.EPSILON, projection.far ?? 1000);
    const reversedZ = projection.reversedZ ?? false;
    this.uniforms._UnityOrthoParamX.value = projection.unityOrthoParamX;
    this.uniforms._ReversedZ.value = reversedZ ? 1 : 0;
    (this.uniforms._ZBufferParams.value as THREE.Vector4).copy(
      zBufferParams(near, far, reversedZ),
    );
    return this;
  }
}

export interface AxieOutlinePostProcessPassOptions extends AxieOutlinePostProcessParameters {
  readonly width?: number;
  readonly height?: number;
}

export const AXIE_DEPTH_NORMALS_VERTEX_SHADER = /* glsl */`
varying vec2 vAxieDepthNormalUv;
varying vec3 vAxieWorldNormal;
uniform vec4 uMainTexTransform;
uniform mat3 uCameraToWorldNormal;

#include <common>
#include <batching_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>

void main() {
  vAxieDepthNormalUv = uv * uMainTexTransform.xy + uMainTexTransform.zw;

  #include <morphinstance_vertex>
  #include <batching_vertex>
  #include <beginnormal_vertex>
  #include <morphnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <defaultnormal_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  #include <skinning_vertex>
  #include <project_vertex>

  // Three's transformedNormal is view-space after skinning, morphing,
  // batching/instancing, and inverse-transpose normal handling. Rotate it back
  // to world space to match URP's TransformObjectToWorldNormal output.
  vAxieWorldNormal = normalize(uCameraToWorldNormal * transformedNormal);
}
`;

export const AXIE_DEPTH_NORMALS_FRAGMENT_SHADER = /* glsl */`
precision highp float;

varying vec2 vAxieDepthNormalUv;
varying vec3 vAxieWorldNormal;
uniform sampler2D uMainTex;
uniform float uAlphaClipEnabled;
uniform float uQuantizeSnorm8;

vec3 QuantizeSnorm8(vec3 value) {
  vec3 clamped = clamp(value, -1.0, 1.0);
  return sign(clamped) * floor(abs(clamped) * 127.0 + 0.5) / 127.0;
}

void main() {
  // The generated V4 pass uses step(0.5, alpha), then clips against 0.01.
  float sourceAlpha = step(0.5, texture2D(uMainTex, vAxieDepthNormalUv).a);
  if (uAlphaClipEnabled > 0.5 && sourceAlpha < 0.01) discard;

  vec3 worldNormal = normalize(vAxieWorldNormal);
  if (uQuantizeSnorm8 > 0.5) worldNormal = QuantizeSnorm8(worldNormal);
  gl_FragColor = vec4(worldNormal, 0.0);
}
`;

export type AxieDepthNormalStorage = 'rgba16f-snorm8-quantized';

export interface AxieOutlinePrepassDiagnostics {
  readonly sourceRenderersVisited: number;
  readonly eligibleRenderers: number;
  readonly eligibleSubmeshes: number;
  readonly excludedOutlineRenderers: number;
  readonly excludedNonMeshRenderers: number;
  readonly excludedWithoutDepthNormalsPass: number;
  readonly excludedByRenderQueue: number;
  readonly excludedInvisibleMaterials: number;
  readonly normalStorage: AxieDepthNormalStorage;
  readonly normalEncoding: 'signed-world-normal';
  readonly snorm8Quantized: true;
  readonly framebufferStatus: number;
}

type AxieShaderMaterial = THREE.ShaderMaterial & {
  readonly uniforms: Record<string, THREE.IUniform>;
};

function requireSourceUniform(
  source: THREE.Material,
  name: string,
): THREE.IUniform {
  const shader = source as AxieShaderMaterial;
  const uniform = shader.isShaderMaterial ? shader.uniforms[name] : undefined;
  if (!uniform) {
    throw new Error(`${source.name || source.uuid} declares DepthNormals but is missing ${name}.`);
  }
  return uniform;
}

class AxieV4DepthNormalsMaterial extends THREE.ShaderMaterial {
  readonly sourceMaterial: THREE.Material;
  readonly #cameraToWorldNormal: THREE.Matrix3;

  constructor(source: THREE.Material) {
    const metadata = readAxieSourceRenderPasses(source);
    if (!metadata?.depthNormals) {
      throw new Error(`${source.name || source.uuid} has no registered DepthNormals source pass.`);
    }
    const sourceAlphaClip = (source as AxieShaderMaterial).uniforms?.uAlphaClipEnabled;
    const cameraToWorldNormal = new THREE.Matrix3();
    super({
      name: `${source.name || source.uuid}:DepthNormalsOnly`,
      vertexShader: AXIE_DEPTH_NORMALS_VERTEX_SHADER,
      fragmentShader: AXIE_DEPTH_NORMALS_FRAGMENT_SHADER,
      uniforms: {
        uMainTex: requireSourceUniform(source, 'uMainTex'),
        uMainTexTransform: requireSourceUniform(source, 'uMainTexTransform'),
        uAlphaClipEnabled: sourceAlphaClip ?? { value: metadata.depthNormals.alphaClipEnabled ? 1 : 0 },
        uQuantizeSnorm8: { value: 1 },
        uCameraToWorldNormal: { value: cameraToWorldNormal },
      },
      side: THREE.FrontSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.LessEqualDepth,
      blending: THREE.NoBlending,
      fog: false,
      toneMapped: false,
    });
    this.#cameraToWorldNormal = cameraToWorldNormal;
    this.sourceMaterial = source;
    this.userData.axieDepthNormalsOnly = Object.freeze({
      sourceShaderGuid: metadata.sourceShaderGuid,
      sourceShaderPath: metadata.sourceShaderPath,
      sourceRenderQueue: metadata.sourceRenderQueue,
      lightMode: metadata.depthNormals.lightMode,
      normalSpace: 'world',
      storageFallback: 'RGBA16F with explicit SNORM8 quantization',
      faithful: true,
    });
  }

  setCamera(camera: THREE.Camera) {
    camera.updateMatrixWorld();
    this.#cameraToWorldNormal.setFromMatrix4(camera.matrixWorld);
    return this;
  }
}

interface AxieRenderableMutation {
  readonly object: THREE.Object3D & {
    material?: THREE.Material | THREE.Material[];
  };
  readonly visible: boolean;
  readonly material?: THREE.Material | THREE.Material[];
}

type AxieSourcePassDiagnostics = Pick<
  AxieOutlinePrepassDiagnostics,
  | 'sourceRenderersVisited'
  | 'eligibleRenderers'
  | 'eligibleSubmeshes'
  | 'excludedOutlineRenderers'
  | 'excludedNonMeshRenderers'
  | 'excludedWithoutDepthNormalsPass'
  | 'excludedByRenderQueue'
  | 'excludedInvisibleMaterials'
>;

interface AxiePreparedSourcePasses {
  readonly mutations: readonly AxieRenderableMutation[];
  readonly diagnostics: AxieSourcePassDiagnostics;
}

interface AxieRendererTargetState {
  readonly target: THREE.WebGLRenderTarget | null;
  readonly activeCubeFace: number;
  readonly activeMipmapLevel: number;
}

function snapshotRendererTargetState(renderer: THREE.WebGLRenderer): AxieRendererTargetState {
  return {
    target: renderer.getRenderTarget(),
    activeCubeFace: renderer.getActiveCubeFace(),
    activeMipmapLevel: renderer.getActiveMipmapLevel(),
  };
}

function restoreRendererTargetState(
  renderer: THREE.WebGLRenderer,
  state: AxieRendererTargetState,
) {
  // setRenderTarget restores the bound target's own viewport, scissor, and
  // scissor-test state (or the canvas globals for a null target). Three's
  // getViewport/getScissor APIs expose canvas-global logical state rather than
  // the active render target state, so applying those values here would corrupt
  // custom render-target rectangles. Transient raw renderer/GL viewport changes
  // while an RT is bound are intentionally outside this pass-owned contract.
  renderer.setRenderTarget(state.target, state.activeCubeFace, state.activeMipmapLevel);
}

function restoreRenderableMutations(mutations: readonly AxieRenderableMutation[]) {
  for (let index = mutations.length - 1; index >= 0; index -= 1) {
    const mutation = mutations[index];
    mutation.object.visible = mutation.visible;
    if (mutation.material !== undefined) mutation.object.material = mutation.material;
  }
}

function referencedMaterialSlots(mesh: THREE.Mesh, slotCount: number) {
  if (!Array.isArray(mesh.material)) return new Set([0]);
  const referenced = new Set<number>();
  for (const group of mesh.geometry.groups) {
    const materialIndex = group.materialIndex;
    const index = typeof materialIndex === 'number' && Number.isInteger(materialIndex)
      ? materialIndex
      : 0;
    if (index >= 0 && index < slotCount && group.count > 0) referenced.add(index);
  }
  return referenced;
}

/**
 * Three/WebGL render adapter for Unity's ScriptableRenderPass contract.
 * Call `render()` only after the colour target has been rendered/postprocessed;
 * the method builds the required normal+depth inputs and alpha-blends the
 * outline onto that existing target without clearing it.
 */
export class AxieOutlinePostProcessPass {
  readonly renderPassEvent = AXIE_OUTLINE_POST_PROCESS_EVENT;
  readonly configuredInputs = AXIE_OUTLINE_POST_PROCESS_INPUTS;
  readonly material: AxieOutlinePostProcessMaterial;
  readonly #overlayScene = new THREE.Scene();
  readonly #overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly #overlayGeometry = new THREE.PlaneGeometry(2, 2);
  readonly #overlay: THREE.Mesh;
  readonly #depthMaterialCache = new WeakMap<THREE.Material, AxieV4DepthNormalsMaterial>();
  readonly #depthMaterials = new Set<AxieV4DepthNormalsMaterial>();
  readonly #ineligibleMaterial = new THREE.MeshBasicMaterial({ visible: false });
  #normalTarget: THREE.WebGLRenderTarget;
  #width: number;
  #height: number;
  #lastDiagnostics: AxieOutlinePrepassDiagnostics | null = null;

  constructor(options: AxieOutlinePostProcessPassOptions = {}) {
    this.#width = Math.max(1, Math.trunc(options.width ?? 1));
    this.#height = Math.max(1, Math.trunc(options.height ?? 1));
    this.material = new AxieOutlinePostProcessMaterial(options).setSize(this.#width, this.#height);
    this.#ineligibleMaterial.name = 'AxieOutlinePostProcess:IneligibleSourcePass';
    this.#overlay = new THREE.Mesh(this.#overlayGeometry, this.material);
    this.#overlay.name = 'AxieOutlinePostProcess:Overlay';
    this.#overlay.frustumCulled = false;
    this.#overlayScene.add(this.#overlay);
    this.#normalTarget = this.#createNormalTarget(this.#width, this.#height);
  }

  #createNormalTarget(width: number, height: number) {
    const target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
      depthBuffer: true,
      stencilBuffer: false,
      samples: 0,
    });
    target.texture.name = 'AxieOutlinePostProcess:CameraNormals';
    target.texture.colorSpace = THREE.NoColorSpace;
    target.depthTexture = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
    target.depthTexture.name = 'AxieOutlinePostProcess:CameraDepth';
    target.depthTexture.format = THREE.DepthFormat;
    target.depthTexture.minFilter = THREE.NearestFilter;
    target.depthTexture.magFilter = THREE.NearestFilter;
    return target;
  }

  get normalTexture() {
    return this.#normalTarget.texture;
  }

  get depthTexture() {
    const depth = this.#normalTarget.depthTexture;
    if (!depth) throw new Error('Axie outline normal target lost its required depth texture.');
    return depth;
  }

  get diagnostics() {
    return this.#lastDiagnostics;
  }

  setParameters(parameters: AxieOutlinePostProcessParameters) {
    this.material.setParameters(parameters);
    return this;
  }

  setSize(width: number, height: number) {
    const nextWidth = Math.max(1, Math.trunc(width));
    const nextHeight = Math.max(1, Math.trunc(height));
    if (nextWidth === this.#width && nextHeight === this.#height) return this;
    this.#width = nextWidth;
    this.#height = nextHeight;
    this.#normalTarget.dispose();
    this.#normalTarget = this.#createNormalTarget(nextWidth, nextHeight);
    this.material.setSize(nextWidth, nextHeight);
    return this;
  }

  #depthMaterial(source: THREE.Material, camera: THREE.Camera) {
    let material = this.#depthMaterialCache.get(source);
    if (!material) {
      material = new AxieV4DepthNormalsMaterial(source);
      this.#depthMaterialCache.set(source, material);
      this.#depthMaterials.add(material);
    }
    return material.setCamera(camera);
  }

  #prepareSourcePasses(scene: THREE.Scene, camera: THREE.Camera) {
    const mutations: AxieRenderableMutation[] = [];
    const candidates: (THREE.Object3D & { material?: THREE.Material | THREE.Material[] })[] = [];
    scene.traverseVisible((node) => {
      const renderable = node as THREE.Object3D & {
        isMesh?: boolean;
        isLine?: boolean;
        isPoints?: boolean;
        isSprite?: boolean;
        material?: THREE.Material | THREE.Material[];
      };
      if (renderable.material !== undefined) candidates.push(renderable);
    });

    let eligibleRenderers = 0;
    let eligibleSubmeshes = 0;
    let excludedOutlineRenderers = 0;
    let excludedNonMeshRenderers = 0;
    let excludedWithoutDepthNormalsPass = 0;
    let excludedByRenderQueue = 0;
    let excludedInvisibleMaterials = 0;

    try {
      for (const object of candidates) {
        const renderable = object as typeof object & { isMesh?: boolean };
        const originalMaterial = renderable.material;
        if (originalMaterial === undefined) continue;
        mutations.push({ object, visible: object.visible, material: originalMaterial });
        if (!renderable.isMesh) {
          renderable.material = Array.isArray(originalMaterial)
            ? originalMaterial.map(() => this.#ineligibleMaterial)
            : this.#ineligibleMaterial;
          excludedNonMeshRenderers += 1;
          continue;
        }
        if (object.userData.axieOutline === true) {
          renderable.material = Array.isArray(originalMaterial)
            ? originalMaterial.map(() => this.#ineligibleMaterial)
            : this.#ineligibleMaterial;
          excludedOutlineRenderers += 1;
          continue;
        }
        if (object.userData.axieDepthNormalsExcluded === true) {
          // Runtime texture-space deformations can reveal geometry directly
          // underneath a source mesh. Omitting that source from this prepass
          // keeps depth/normal outlines consistent with the visible surface.
          object.visible = false;
          excludedInvisibleMaterials += 1;
          continue;
        }

        const slots = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
        const referencedSlots = referencedMaterialSlots(renderable as THREE.Mesh, slots.length);
        const replacements = slots.map((source, slotIndex) => {
          // Three schedules material arrays only through geometry groups. An
          // unused extra slot is not a Unity/Three submesh and must not be
          // validated, counted, or allowed to abort the source prepass.
          if (!referencedSlots.has(slotIndex)) return this.#ineligibleMaterial;
          if (!source.visible) {
            excludedInvisibleMaterials += 1;
            return this.#ineligibleMaterial;
          }
          const metadata = readAxieSourceRenderPasses(source);
          if (!metadata?.depthNormals) {
            excludedWithoutDepthNormalsPass += 1;
            return this.#ineligibleMaterial;
          }
          if (
            metadata.sourceRenderQueue < AXIE_OPAQUE_RENDER_QUEUE_MIN
            || metadata.sourceRenderQueue > AXIE_OPAQUE_RENDER_QUEUE_MAX
          ) {
            excludedByRenderQueue += 1;
            return this.#ineligibleMaterial;
          }
          if (!isAxieDepthNormalsSourceEligible(source)) {
            excludedWithoutDepthNormalsPass += 1;
            return this.#ineligibleMaterial;
          }
          eligibleSubmeshes += 1;
          return this.#depthMaterial(source, camera);
        });
        if (replacements.every((material) => material === this.#ineligibleMaterial)) {
          renderable.material = Array.isArray(originalMaterial) ? replacements : replacements[0];
        } else {
          renderable.material = Array.isArray(originalMaterial) ? replacements : replacements[0];
          eligibleRenderers += 1;
        }
      }
    } catch (error) {
      // Material creation can throw for a malformed registered source. Never
      // leak the already-applied replacements into the host scene.
      restoreRenderableMutations(mutations);
      throw error;
    }

    return {
      mutations,
      diagnostics: {
        sourceRenderersVisited: candidates.length,
        eligibleRenderers,
        eligibleSubmeshes,
        excludedOutlineRenderers,
        excludedNonMeshRenderers,
        excludedWithoutDepthNormalsPass,
        excludedByRenderQueue,
        excludedInvisibleMaterials,
      },
    };
  }

  renderInputs(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has('EXT_color_buffer_float')) {
      throw new Error(
        'Faithful Axie DepthNormals requires WebGL2 EXT_color_buffer_float for signed RGBA16F storage.',
      );
    }
    const previousTargetState = snapshotRendererTargetState(renderer);
    const previousAutoClear = renderer.autoClear;
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = renderer.getClearAlpha();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousEnvironment = scene.environment;
    const previousShadows = renderer.shadowMap.enabled;
    const previousXr = renderer.xr.enabled;
    let prepared: AxiePreparedSourcePasses | undefined;
    try {
      prepared = this.#prepareSourcePasses(scene, camera);
      scene.overrideMaterial = null;
      scene.background = null;
      scene.environment = null;
      renderer.shadowMap.enabled = false;
      renderer.xr.enabled = false;
      renderer.autoClear = true;
      renderer.setClearColor(new THREE.Color(0, 0, 0), 0);
      renderer.setRenderTarget(this.#normalTarget);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);

      const gl = renderer.getContext();
      const framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error(`Axie DepthNormals framebuffer is incomplete: ${framebufferStatus}.`);
      }
      this.material
        .setInputTextures(this.depthTexture, this.#normalTarget.texture)
        .setSize(this.#width, this.#height)
        .setProjection({
          orthographic: camera instanceof THREE.OrthographicCamera,
          unityOrthoParamX: axieUnityOrthoParamX(camera, this.#width, this.#height),
          reversedZ: renderer.capabilities.reverseDepthBuffer,
          near: camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
            ? camera.near
            : 0.1,
          far: camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera
            ? camera.far
            : 1000,
        });
      this.#lastDiagnostics = Object.freeze({
        ...prepared.diagnostics,
        normalStorage: 'rgba16f-snorm8-quantized',
        normalEncoding: 'signed-world-normal',
        snorm8Quantized: true,
        framebufferStatus,
      });
      return this.#lastDiagnostics;
    } finally {
      if (prepared) restoreRenderableMutations(prepared.mutations);
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      scene.environment = previousEnvironment;
      renderer.shadowMap.enabled = previousShadows;
      renderer.xr.enabled = previousXr;
      renderer.autoClear = previousAutoClear;
      renderer.setClearColor(previousClearColor, previousClearAlpha);
      restoreRendererTargetState(renderer, previousTargetState);
    }
  }

  /** Blend the source overlay into an existing encoded-Gamma accumulation target. */
  renderOverlay(
    renderer: THREE.WebGLRenderer,
    colorTarget: THREE.WebGLRenderTarget | null = renderer.getRenderTarget(),
  ) {
    const previousTargetState = snapshotRendererTargetState(renderer);
    const previousAutoClear = renderer.autoClear;
    const targetChanged = colorTarget !== previousTargetState.target;
    try {
      renderer.autoClear = false;
      if (targetChanged) renderer.setRenderTarget(colorTarget);
      renderer.render(this.#overlayScene, this.#overlayCamera);
      return true;
    } finally {
      renderer.autoClear = previousAutoClear;
      if (targetChanged) restoreRendererTargetState(renderer, previousTargetState);
    }
  }

  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    colorTarget: THREE.WebGLRenderTarget | null = renderer.getRenderTarget(),
  ) {
    this.renderInputs(renderer, scene, camera);
    return this.renderOverlay(renderer, colorTarget);
  }

  dispose() {
    this.#overlay.removeFromParent();
    this.#overlayGeometry.dispose();
    this.#ineligibleMaterial.dispose();
    this.#depthMaterials.forEach((material) => material.dispose());
    this.#depthMaterials.clear();
    this.#normalTarget.dispose();
    this.material.dispose();
  }
}
