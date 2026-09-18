import * as THREE from 'three';
import { registerAxieSourceRenderPasses } from './render-pass-registry';

export type AxieRgb = readonly [r: number, g: number, b: number];
export type AxieCameraProjection = 'perspective' | 'orthographic';

export interface AxieMixerV4MaterialOptions {
  readonly map: THREE.Texture;
  readonly primaryColor: THREE.ColorRepresentation;
  readonly secondaryColor: THREE.ColorRepresentation;
  readonly mainTexTransform?: THREE.Vector4 | readonly [repeatX: number, repeatY: number, offsetX: number, offsetY: number];
  /** The pinned source project is Gamma; pass false only for a separate linear Unity project. */
  readonly gammaSpace?: boolean;
  /** Mirrors the local `_ALPHATEST_ON` keyword. It is disabled in every pinned V4 material. */
  readonly alphaClipEnabled?: boolean;
  /**
   * Compatibility input for callers that deserialize `_AlphaCutoff`.
   * The pinned V4 shader hard-codes every color/shadow threshold to 0.5, so
   * values other than 0.5 are rejected instead of silently inventing behavior.
   */
  readonly alphaMaskCutoff?: number;
  readonly name?: string;
}

export interface AxieMixerV4OutlineOptions {
  readonly thickness?: number;
  readonly color?: THREE.ColorRepresentation;
  readonly name?: string;
  /** Selects the exact source vertex graph represented by this draw. */
  readonly source?: AxieOutlineExtrusionSource;
}

export type AxieOutlineExtrusionSource =
  | 'base-v4-extra-prepass'
  | 'render-objects-shadergraph';

export interface AxieOutlineExtrusionSample {
  readonly normalOS: AxieRgb;
  readonly objectToWorld: THREE.Matrix4;
  readonly thickness: number;
}

export interface AxieOutlineExtrusionResult {
  readonly worldDirection: AxieRgb;
  readonly worldOffset: AxieRgb;
  readonly objectOffset: AxieRgb;
}

export interface AxieMixerV4MaterialBundle {
  readonly surface: AxieMixerV4Material;
  readonly outline?: AxieMixerV4OutlineMaterial;
  /** Assign to SkinnedMesh.customDepthMaterial for alpha-correct directional shadows. */
  readonly depth: THREE.MeshDepthMaterial;
  /** Assign to SkinnedMesh.customDistanceMaterial for alpha-correct point-light shadows. */
  readonly distance: THREE.MeshDistanceMaterial;
}

export interface AxieMixerV4CpuSample {
  readonly textureRgb: AxieRgb;
  readonly textureAlpha: number;
  readonly primaryColor: AxieRgb;
  readonly secondaryColor: AxieRgb;
  /** Exact source dot((-15, 80, -30), worldNormal), without normalizing the vector. */
  readonly fakeLightDot: number;
  readonly normalViewDot: number;
  readonly gammaSpace?: boolean;
  readonly alphaClipEnabled?: boolean;
  readonly alphaMaskCutoff?: number;
}

export interface AxieMixerV4CpuResult {
  readonly rgb: AxieRgb;
  readonly alpha: 0 | 1;
  readonly discarded: boolean;
}

const LINEAR_SHADOW_MULTIPLIER = 0.5209957;
const GAMMA_SHADOW_MULTIPLIER = 0.7490196;
const LINEAR_RIM_COLOR = 0.4633656;
const GAMMA_RIM_COLOR = 0.7106918;
const RIM_ALPHA = 0.6980392;

/** Source lines 776-778 are literals, not material-controlled properties. */
export const AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD = 0.5;
export const AXIE_MIXER_V4_COLOR_CLIP_THRESHOLD = 0.01;
export const AXIE_MIXER_V4_SHADOW_ALPHA_THRESHOLD = 0.5;

function exactAlphaThreshold(requested: number | undefined) {
  const value = requested ?? AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD;
  if (value !== AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD) {
    throw new RangeError(
      `S_Axie_Mixer_V4 hard-codes its alpha threshold to ${AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD}; received ${value}.`,
    );
  }
  return AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD;
}

/** HLSL's defined reversed-edge behavior, unlike GLSL smoothstep. */
export function unityHlslSmoothstep(edge0: number, edge1: number, value: number): number {
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function mix(a: number, b: number, weight: number) {
  return a + (b - a) * weight;
}

/** CPU reference used by parity tests; it mirrors the generated Unity fragment graph. */
export function evaluateAxieMixerV4Sample(sample: AxieMixerV4CpuSample): AxieMixerV4CpuResult {
  const cutoff = exactAlphaThreshold(sample.alphaMaskCutoff);
  const alpha = sample.textureAlpha >= cutoff ? 1 : 0;
  if (sample.alphaClipEnabled === true && alpha === 0) {
    return { rgb: [0, 0, 0], alpha, discarded: true };
  }

  const gamma = sample.gammaSpace === true;
  const shadowMultiplier = gamma ? GAMMA_SHADOW_MULTIPLIER : LINEAR_SHADOW_MULTIPLIER;
  const rimColor = gamma ? GAMMA_RIM_COLOR : LINEAR_RIM_COLOR;
  const secondaryWeight = unityHlslSmoothstep(0.7, 0.5, sample.textureAlpha);
  const tintWeight = unityHlslSmoothstep(1, 0.9, sample.textureAlpha);
  const lightWeight = unityHlslSmoothstep(-0.25, 0.55, sample.fakeLightDot);
  const fresnel = 0.2 * (1 - sample.normalViewDot) ** 5;
  const rimWeight = RIM_ALPHA * clamp01(unityHlslSmoothstep(0.9, 1, sample.fakeLightDot * fresnel));

  const rgb = sample.textureRgb.map((texture, channel) => {
    const tint = mix(sample.primaryColor[channel], sample.secondaryColor[channel], secondaryWeight);
    const multiplied = mix(texture, tint * texture, tintWeight);
    // The Amplify graph deliberately applies tintWeight twice.
    const tinted = mix(texture, clamp01(multiplied), tintWeight);
    const shadowed = clamp01(mix(tinted, shadowMultiplier * tinted, 1 - lightWeight));
    const overlay = rimColor > 0.5
      ? shadowed + 2 * rimColor - 1
      : shadowed + 2 * (rimColor - 0.5);
    return clamp01(mix(shadowed, overlay, rimWeight));
  }) as [number, number, number];

  return { rgb, alpha, discarded: false };
}

function tuple3(vector: THREE.Vector3): AxieRgb {
  return [vector.x, vector.y, vector.z];
}

/**
 * View-space equivalent of URP 12 GetWorldSpaceNormalizeViewDir.
 * Perspective points from the fragment to the view origin. Orthographic uses
 * one constant ray direction for every fragment: -GetViewForwardDir(), which
 * is +Z after transforming into Three's right-handed view space.
 */
export function evaluateAxieMixerV4ViewDirectionVS(
  positionVS: AxieRgb,
  projection: AxieCameraProjection,
): AxieRgb {
  if (projection === 'orthographic') return [0, 0, 1];
  const direction = new THREE.Vector3(...positionVS).negate();
  if (direction.lengthSq() === 0) {
    throw new RangeError('Perspective Base V4 view direction is undefined at the camera origin.');
  }
  return tuple3(direction.normalize());
}

/**
 * CPU source oracle for both authored geometry-outline paths.
 *
 * `base-v4-extra-prepass` mirrors S_Axie_Mixer_V4.shader:255-256:
 * normalize(ObjectToWorld * normalOS), then WorldToObject * worldOffset.
 * `render-objects-shadergraph` mirrors the graph edge chain:
 * World Normal * Thickness + World Position, transformed back to Object.
 */
export function evaluateAxieOutlineExtrusion(
  sample: AxieOutlineExtrusionSample,
  source: AxieOutlineExtrusionSource,
): AxieOutlineExtrusionResult {
  const normal = new THREE.Vector3(...sample.normalOS);
  const worldDirection = source === 'base-v4-extra-prepass'
    ? normal.applyMatrix3(new THREE.Matrix3().setFromMatrix4(sample.objectToWorld)).normalize()
    : normal.applyMatrix3(new THREE.Matrix3().getNormalMatrix(sample.objectToWorld)).normalize();
  const worldOffset = worldDirection.clone().multiplyScalar(sample.thickness);
  const worldToObject = sample.objectToWorld.clone().invert();
  const objectOffset = worldOffset.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(worldToObject));
  return {
    worldDirection: tuple3(worldDirection),
    worldOffset: tuple3(worldOffset),
    objectOffset: tuple3(objectOffset),
  };
}

export const AXIE_MIXER_V4_VERTEX_SHADER = /* glsl */`
  varying vec2 vAxieUv;
  varying vec3 vAxieNormalVS;
  varying vec3 vAxiePositionVS;
  uniform vec4 uMainTexTransform;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
    vAxieUv = uv * uMainTexTransform.xy + uMainTexTransform.zw;

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

    // Unity TransformObjectToWorldNormal normalizes per vertex, then the
    // generated fragment graph consumes the raw interpolated varying.
    vAxieNormalVS = normalize(transformedNormal);
    vAxiePositionVS = mvPosition.xyz;
  }
`;

export const AXIE_MIXER_V4_FRAGMENT_SHADER = /* glsl */`
  #include <common>

  uniform mat4 projectionMatrix;
  uniform sampler2D uMainTex;
  uniform vec3 uPrimaryColor;
  uniform vec3 uSecondaryColor;
  uniform float uAlphaMaskCutoff;
  uniform float uAlphaClipEnabled;
  uniform float uShadowMultiplier;
  uniform float uRimColor;
  uniform float uUnityGammaWorkflow;

  varying vec2 vAxieUv;
  varying vec3 vAxieNormalVS;
  varying vec3 vAxiePositionVS;

  vec3 unityWorldViewDirectionVS() {
    return isPerspectiveMatrix(projectionMatrix)
      ? normalize(-vAxiePositionVS)
      : vec3(0.0, 0.0, 1.0);
  }

  float unityHlslSmoothstep(float edge0, float edge1, float value) {
    float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec3 unityLinearToSrgb(vec3 value) {
    vec3 low = value * 12.92;
    vec3 high = 1.055 * pow(max(value, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(low, high, step(vec3(0.0031308), value));
  }

  vec3 unitySrgbToLinear(vec3 value) {
    vec3 low = value / 12.92;
    vec3 high = pow((max(value, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
    return mix(low, high, step(vec3(0.04045), value));
  }

  void main() {
    vec4 sampled = texture2D(uMainTex, vAxieUv);
    float alpha = step(uAlphaMaskCutoff, sampled.a);
    if (uAlphaClipEnabled > 0.5 && alpha < 0.01) discard;

    vec3 textureRgb = sampled.rgb;
    vec3 primaryColor = uPrimaryColor;
    vec3 secondaryColor = uSecondaryColor;
    if (uUnityGammaWorkflow > 0.5) {
      primaryColor = unityLinearToSrgb(primaryColor);
      secondaryColor = unityLinearToSrgb(secondaryColor);
    }

    float secondaryWeight = unityHlslSmoothstep(0.7, 0.5, sampled.a);
    vec3 tint = mix(primaryColor, secondaryColor, secondaryWeight);
    float tintWeight = unityHlslSmoothstep(1.0, 0.9, sampled.a);
    vec3 multiplied = mix(textureRgb, tint * textureRgb, tintWeight);
    vec3 tinted = mix(textureRgb, clamp(multiplied, 0.0, 1.0), tintWeight);

    // Deliberately do not normalize here. The pinned generated Unity shader
    // uses input.ase_texcoord6.xyz directly at lines 762-770.
    vec3 normalVS = vAxieNormalVS;
    vec3 fakeLightVS = mat3(viewMatrix) * vec3(15.0, 80.0, -30.0);
    float fakeLightDot = dot(fakeLightVS, normalVS);
    float lightWeight = unityHlslSmoothstep(-0.25, 0.55, fakeLightDot);
    vec3 shadowed = clamp(mix(tinted, vec3(uShadowMultiplier) * tinted, 1.0 - lightWeight), 0.0, 1.0);

    float normalViewDot = dot(normalVS, unityWorldViewDirectionVS());
    float fresnel = 0.2 * pow(1.0 - normalViewDot, 5.0);
    float rimWeight = 0.6980392 * clamp(unityHlslSmoothstep(0.9, 1.0, fakeLightDot * fresnel), 0.0, 1.0);
    vec3 rimSource = vec3(uRimColor);
    vec3 overlayLow = shadowed + 2.0 * (rimSource - 0.5);
    vec3 overlayHigh = shadowed + 2.0 * rimSource - 1.0;
    vec3 overlay = mix(overlayLow, overlayHigh, step(vec3(0.5), rimSource));
    vec3 color = clamp(mix(shadowed, overlay, rimWeight), 0.0, 1.0);
    if (uUnityGammaWorkflow > 0.5) color = unitySrgbToLinear(color);

    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

export const AXIE_MIXER_V4_OUTLINE_VERTEX_SHADER = /* glsl */`
  uniform float uOutlineThickness;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
    #include <morphinstance_vertex>
    #include <batching_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    // Pinned S_Axie_Mixer_V4.shader ExtraPrePass lines 255-256 do not use
    // the inverse-transpose normal matrix. They forward-transform normalOS,
    // normalize in world space, and then apply the equivalent world offset.
    vec3 outlineNormalOS = objectNormal;
    #ifdef USE_BATCHING
      outlineNormalOS = mat3(batchingMatrix) * outlineNormalOS;
    #endif
    #ifdef USE_INSTANCING
      outlineNormalOS = mat3(instanceMatrix) * outlineNormalOS;
    #endif
    vec3 outlineNormalWS = normalize(mat3(modelMatrix) * outlineNormalOS);

    vec4 localPosition = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      localPosition = batchingMatrix * localPosition;
    #endif
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    vec4 worldPosition = modelMatrix * localPosition;
    worldPosition.xyz += outlineNormalWS * uOutlineThickness;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Exact Shader Graph Normal Vector(World) -> Multiply(Thickness) ->
 * Add(Position World) -> Transform(World to Object) runtime equivalent.
 */
export const AXIE_RENDER_OBJECTS_OUTLINE_VERTEX_SHADER = /* glsl */`
  uniform float uOutlineThickness;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
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

    vec4 mvPosition = vec4(transformed, 1.0);
    #ifdef USE_BATCHING
      mvPosition = batchingMatrix * mvPosition;
    #endif
    #ifdef USE_INSTANCING
      mvPosition = instanceMatrix * mvPosition;
    #endif
    mvPosition = modelViewMatrix * mvPosition;

    // BackSide sets FLIP_SIDED in Three; cancel that raster-side convention
    // because Shader Graph's World Normal node reads the authored normal.
    vec3 outlineNormalVS = transformedNormal;
    #ifdef FLIP_SIDED
      outlineNormalVS = -outlineNormalVS;
    #endif
    mvPosition.xyz += normalize(outlineNormalVS) * uOutlineThickness;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const AXIE_MIXER_V4_OUTLINE_FRAGMENT_SHADER = /* glsl */`
  uniform vec3 uOutlineColor;

  void main() {
    // Unity's ExtraPrePass ignores _OutlineColor.a and writes alpha 1.
    gl_FragColor = vec4(uOutlineColor, 1.0);
    #include <colorspace_fragment>
  }
`;

function resolveTransform(
  value: AxieMixerV4MaterialOptions['mainTexTransform'],
) {
  if (value instanceof THREE.Vector4) return value.clone();
  if (value) return new THREE.Vector4(...value);
  return new THREE.Vector4(1, 1, 0, 0);
}

export class AxieMixerV4Material extends THREE.ShaderMaterial {
  readonly gammaSpace: boolean;

  constructor(options: AxieMixerV4MaterialOptions) {
    const gamma = options.gammaSpace ?? true;
    const alphaClip = options.alphaClipEnabled === true;
    const alphaThreshold = exactAlphaThreshold(options.alphaMaskCutoff);
    const map = options.map;
    if (gamma && map.colorSpace !== THREE.NoColorSpace) {
      map.colorSpace = THREE.NoColorSpace;
      map.needsUpdate = true;
    }
    const primaryColor = new THREE.Color(options.primaryColor);
    const secondaryColor = new THREE.Color(options.secondaryColor);
    super({
      name: options.name ?? 'AxieMixer3D/S_Axie_Mixer_V4',
      vertexShader: AXIE_MIXER_V4_VERTEX_SHADER,
      fragmentShader: AXIE_MIXER_V4_FRAGMENT_SHADER,
      uniforms: {
        uMainTex: { value: map },
        uMainTexTransform: { value: resolveTransform(options.mainTexTransform) },
        uPrimaryColor: { value: primaryColor },
        uSecondaryColor: { value: secondaryColor },
        uAlphaMaskCutoff: { value: alphaThreshold },
        uAlphaClipEnabled: { value: alphaClip ? 1 : 0 },
        uShadowMultiplier: { value: gamma ? GAMMA_SHADOW_MULTIPLIER : LINEAR_SHADOW_MULTIPLIER },
        uRimColor: { value: gamma ? GAMMA_RIM_COLOR : LINEAR_RIM_COLOR },
        uUnityGammaWorkflow: { value: gamma ? 1 : 0 },
      },
      side: THREE.FrontSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    });
    this.gammaSpace = gamma;
    this.alphaTest = alphaClip ? AXIE_MIXER_V4_COLOR_CLIP_THRESHOLD : 0;
    this.userData.axieMixerV4 = Object.freeze({
      gammaSpace: gamma,
      alphaClipEnabled: alphaClip,
      faithful: true,
    });
    registerAxieSourceRenderPasses(this, {
      schemaVersion: 1,
      sourceShaderGuid: 'ac091e58a97d048649b904d4e60d5aea',
      sourceShaderName: 'AxieMixer3D/S_Axie_Mixer_V4',
      sourceShaderPath: 'Resources/AxieMixer3D/BuiltAssets/S_Axie_Mixer_V4.shader',
      sourceRenderQueue: 2000,
      depthNormals: {
        lightMode: 'DepthNormalsOnly',
        cull: 'Back',
        zTest: 'LEqual',
        zWrite: true,
        alphaClipEnabled: alphaClip,
        alphaThreshold: AXIE_MIXER_V4_COLOR_ALPHA_THRESHOLD,
        alphaClipThreshold: AXIE_MIXER_V4_COLOR_CLIP_THRESHOLD,
      },
    });
  }

  setColors(primary: THREE.ColorRepresentation, secondary: THREE.ColorRepresentation) {
    const primaryTarget = this.uniforms.uPrimaryColor.value as THREE.Color;
    const secondaryTarget = this.uniforms.uSecondaryColor.value as THREE.Color;
    primaryTarget.set(primary);
    secondaryTarget.set(secondary);
  }

  setMainTexTransform(repeatX: number, repeatY: number, offsetX: number, offsetY: number) {
    (this.uniforms.uMainTexTransform.value as THREE.Vector4).set(repeatX, repeatY, offsetX, offsetY);
  }
}

export class AxieMixerV4OutlineMaterial extends THREE.ShaderMaterial {
  readonly source: AxieOutlineExtrusionSource;

  constructor(options: AxieMixerV4OutlineOptions = {}) {
    // The existing parity fixture predates the explicit `source` option and
    // uses this canonical source-material name. Keep that bridge exact while
    // all normal production V4/Mystic calls default to their ExtraPrePass.
    const source = options.source
      ?? (options.name?.includes('RenderObjectsOutline')
        ? 'render-objects-shadergraph'
        : 'base-v4-extra-prepass');
    const color = options.color === undefined
      // Unity serializes this authored value in the project's Gamma space;
      // convert it to Three's linear working color before output encoding.
      ? new THREE.Color().setRGB(0.09803922, 0.09803922, 0.09803922, THREE.SRGBColorSpace)
      : new THREE.Color(options.color);
    super({
      name: options.name ?? 'AxieMixer3D/S_Axie_Mixer_V4:ExtraPrePass',
      vertexShader: source === 'render-objects-shadergraph'
        ? AXIE_RENDER_OBJECTS_OUTLINE_VERTEX_SHADER
        : AXIE_MIXER_V4_OUTLINE_VERTEX_SHADER,
      fragmentShader: AXIE_MIXER_V4_OUTLINE_FRAGMENT_SHADER,
      uniforms: {
        uOutlineThickness: { value: options.thickness ?? 0.02 },
        uOutlineColor: { value: color },
      },
      side: THREE.BackSide,
      transparent: false,
      depthTest: true,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    });
    this.source = source;
    this.userData.axieMixerV4Outline = Object.freeze({
      faithful: true,
      alphaIgnoredLikeUnity: true,
      source,
    });
  }

  set thickness(value: number) {
    this.uniforms.uOutlineThickness.value = value;
  }

  get thickness() {
    return this.uniforms.uOutlineThickness.value as number;
  }
}

/** Explicit constructor for the package's Draw Objects override material. */
export class AxieRenderObjectsOutlineMaterial extends AxieMixerV4OutlineMaterial {
  constructor(options: Omit<AxieMixerV4OutlineOptions, 'source'> = {}) {
    super({ ...options, source: 'render-objects-shadergraph' });
  }
}

export class AxieMixerV4ThreeMaterialFactory {
  createSurface(options: AxieMixerV4MaterialOptions) {
    return new AxieMixerV4Material(options);
  }

  createOutline(options: AxieMixerV4OutlineOptions = {}) {
    return new AxieMixerV4OutlineMaterial({ ...options, source: 'base-v4-extra-prepass' });
  }

  createBundle(
    surfaceOptions: AxieMixerV4MaterialOptions,
    outlineOptions: (AxieMixerV4OutlineOptions & { readonly enabled?: boolean }) = {},
  ): AxieMixerV4MaterialBundle {
    exactAlphaThreshold(surfaceOptions.alphaMaskCutoff);
    const alphaClipEnabled = surfaceOptions.alphaClipEnabled === true;
    const surface = this.createSurface(surfaceOptions);
    const shadowMap = alphaClipEnabled ? surfaceOptions.map : null;
    const depth = new THREE.MeshDepthMaterial({
      name: `${surfaceOptions.name ?? 'AxieMixer3D/S_Axie_Mixer_V4'}:ShadowCaster`,
      map: shadowMap,
      alphaTest: alphaClipEnabled ? AXIE_MIXER_V4_SHADOW_ALPHA_THRESHOLD : 0,
      depthPacking: THREE.RGBADepthPacking,
      side: THREE.FrontSide,
    });
    const distance = new THREE.MeshDistanceMaterial({
      name: `${surfaceOptions.name ?? 'AxieMixer3D/S_Axie_Mixer_V4'}:DistanceShadowCaster`,
      map: shadowMap,
      alphaTest: alphaClipEnabled ? AXIE_MIXER_V4_SHADOW_ALPHA_THRESHOLD : 0,
      side: THREE.FrontSide,
    });
    return {
      surface,
      outline: outlineOptions.enabled === false ? undefined : this.createOutline(outlineOptions),
      depth,
      distance,
    };
  }
}

export const AXIE_MIXER_V4_MATERIAL_FACTORY = Object.freeze(new AxieMixerV4ThreeMaterialFactory());
