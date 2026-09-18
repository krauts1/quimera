import * as THREE from 'three';
import { formatAxiePartAssetId, type AxieDescriptor } from './domain';
import type { AxieQualityProfile } from './quality';
import type { AxiePlayableCharacter } from './runtime';
import {
  AXIE_CLEAR_EYE_L1_SVG,
  AXIE_CLEAR_EYE_L1_SVG_SHA256,
  AXIE_CLEAR_EYE_L1_PUPIL_FREE_SVG,
  AXIE_CLEAR_EYE_L1_PUPIL_FREE_SVG_SHA256,
} from './clear-eye-source.generated';
import {
  AXIE_KOTARO_EYE_L1_APERTURE_SVG,
  AXIE_KOTARO_EYE_L1_APERTURE_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG,
  AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG,
  AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_SVG_SHA256,
} from './kotaro-eye-source.generated';
export {
  AXIE_KOTARO_EYE_L1_APERTURE_SVG,
  AXIE_KOTARO_EYE_L1_APERTURE_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_MASTER_PATH_COUNT,
  AXIE_KOTARO_EYE_L1_PUPIL_FREE_PATH_COUNT,
  AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG,
  AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG,
  AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG_SHA256,
  AXIE_KOTARO_EYE_L1_PUPIL_PATH_COUNT,
  AXIE_KOTARO_EYE_L1_PUPIL_PATH_TAGS_SHA256,
  AXIE_KOTARO_EYE_L1_REMOVED_PUPIL_PATH_INDICES,
  AXIE_KOTARO_EYE_L1_SVG_SHA256,
} from './kotaro-eye-source.generated';
import {
  AxieAmbientGazePlanner,
  clampAxieEyeGaze,
  type AxieAmbientGazeInspection,
  type AxieEyeGazePhase,
} from './clear-eye-gaze-planner';

export const AXIE_CLEAR_EYE_L1_PART_ID = 'S00_Aquatic04_L1_Eye' as const;
export const AXIE_KOTARO_EYE_L1_PART_ID = 'S00_Bug10_L1_Eye' as const;
export const AXIE_EYE_EXPRESSIONS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'squint',
] as const;
export const AXIE_EYE_GAZE_MODES = ['ambient', 'fixed', 'pointer'] as const;
export const AXIE_CLEAR_EYE_GAZE_TRAVEL = Object.freeze({
  positiveX: 0.34,
  negativeX: 0.35,
  positiveY: 0.42,
  negativeY: 0.31,
});

export type AxieEyeExpression = typeof AXIE_EYE_EXPRESSIONS[number];
export type AxieEyeGazeMode = typeof AXIE_EYE_GAZE_MODES[number];

export interface AxieEyePerformanceConfig {
  readonly expression: AxieEyeExpression;
  readonly expressionIntensity: number;
  readonly gazeMode: AxieEyeGazeMode;
  readonly fixedGaze: Readonly<{ x: number; y: number }>;
  readonly autoBlink: boolean;
}

export interface AxieEyePerformanceConfigPatch {
  readonly expression?: AxieEyeExpression;
  readonly expressionIntensity?: number;
  readonly gazeMode?: AxieEyeGazeMode;
  readonly fixedGaze?: Readonly<{ x: number; y: number }>;
  readonly autoBlink?: boolean;
}

export interface AxieEyeRuntimeInspection {
  readonly supported: boolean;
  readonly profile: 'clear-l1' | 'kotaro-l1' | undefined;
  readonly partId: string | undefined;
  readonly sourceSvgSha256: string | undefined;
  readonly pupilFreeSvgSha256: string | undefined;
  readonly pupilOnlySvgSha256: string | undefined;
  readonly apertureMaskSvgSha256: string | undefined;
  readonly boundMeshes: number;
  readonly boundMaterials: number;
  readonly textureResolution: number;
  readonly textureRevision: number;
  readonly textureCount: number;
  readonly expression: AxieEyeExpression;
  readonly expressionIntensity: number;
  readonly gazeMode: AxieEyeGazeMode;
  readonly gaze: Readonly<{ x: number; y: number }>;
  readonly ambientGazePhase: AxieEyeGazePhase | undefined;
  readonly ambientGazeTarget: Readonly<{ x: number; y: number }>;
  readonly ambientSaccadeCount: number;
  readonly ambientMicroSaccadeCount: number;
  readonly autoBlink: boolean;
  readonly blinkWeight: number;
  readonly blinkCount: number;
  readonly pointerTargetValid: boolean;
  readonly disposed: boolean;
}

export interface AxieEyeController {
  readonly supported: boolean;
  readonly partId: string | undefined;
  readonly config: AxieEyePerformanceConfig;
  setConfig(patch: AxieEyePerformanceConfigPatch): void;
  setPointerGaze(x: number, y: number, valid?: boolean): void;
  blink(): boolean;
  update(deltaSeconds: number): void;
  inspect(): AxieEyeRuntimeInspection;
  dispose(): void;
}

export interface AxieEyeControllerTarget {
  readonly model: THREE.Object3D;
  readonly descriptor: AxieDescriptor;
  readonly quality: AxieQualityProfile;
}

export interface CreateAxieEyeControllerOptions {
  /** Override with a caller-prepared pupil-free authoring derivative. */
  readonly svgSource?: string;
  /** Defaults to 256 for Unity-import profiles and 1024 for source profiles. */
  readonly textureResolution?: number;
  /** Deterministic seed for ambient gaze and automatic blink scheduling. */
  readonly randomSeed?: number;
  readonly initialConfig?: AxieEyePerformanceConfigPatch;
}

const DEFAULT_CONFIG: AxieEyePerformanceConfig = Object.freeze({
  expression: 'neutral',
  expressionIntensity: 1,
  gazeMode: 'ambient',
  fixedGaze: Object.freeze({ x: 0, y: 0 }),
  autoBlink: true,
});

interface EyeShape {
  aperture: number;
  tilt: number;
  lowerLift: number;
  pupilScale: number;
}

interface MaterialPatch {
  readonly material: THREE.ShaderMaterial;
  readonly originalVertexShader: string;
  readonly originalFragmentShader: string;
  readonly originalTexture: THREE.Texture;
  readonly previousUserData: unknown;
  readonly uniformKeys: readonly string[];
}

interface SurfacePassPatch {
  readonly mesh: THREE.Mesh;
  readonly castShadow: boolean;
  readonly previousDepthNormalsExclusion: unknown;
}

interface OutlineVisibilityPatch {
  readonly mesh: THREE.Mesh;
  readonly visible: boolean;
}

const CLEAR_EYE_UNIFORM_KEYS = [
  'uAxieClearEyeEnabled',
  'uAxieClearEyeGaze',
  'uAxieClearEyeShape',
  'uAxieClearEyeBlink',
] as const;

const KOTARO_EYE_UNIFORM_KEYS = [
  'uAxieKotaroEyeEnabled',
  'uAxieKotaroEyeGaze',
  'uAxieKotaroEyeShape',
  'uAxieKotaroEyeBlink',
  'uAxieKotaroPupilTex',
  'uAxieKotaroApertureTex',
] as const;

const CLEAR_EYE_GLSL = /* glsl */`
  uniform float uAxieClearEyeEnabled;
  uniform vec2 uAxieClearEyeGaze;
  uniform vec4 uAxieClearEyeShape;
  uniform float uAxieClearEyeBlink;

  float axieEyeEllipse(vec2 uv, vec2 center, vec2 radius) {
    return length((uv - center) / radius);
  }

  float axieEyeInside(float distanceValue, float feather) {
    return 1.0 - smoothstep(1.0 - feather, 1.0 + feather, distanceValue);
  }

  vec3 axieClearEyeCompose(vec2 uv, vec3 sourceColor, out float eyeVisibility) {
    eyeVisibility = 1.0;
    vec2 irisRadius = vec2(0.2390, 0.2320);
    vec2 lowerIrisCenter = vec2(0.3070, 0.7150);
    vec2 upperIrisCenter = vec2(0.7020, 0.2830);
    vec2 lowerIrisLocal = (uv - lowerIrisCenter) / irisRadius;
    vec2 upperIrisLocal = (uv - upperIrisCenter) / irisRadius;
    // The two rotated islands overlap around atlas center. Classify every
    // fragment by its nearest measured iris, not overlapping axis-aligned
    // rectangles, or a triangular shard from one eye leaks into the other.
    bool lowerAtlasEye = length(lowerIrisLocal) <= length(upperIrisLocal);
    vec2 restPupil = lowerAtlasEye
      ? vec2(0.322625, 0.719435)
      : vec2(0.690056, 0.288518);
    // Measured from the delivered Clear GLB's UV-to-world Jacobian. The two
    // atlas islands are rotated differently, so raw UV axes cannot drive a
    // coherent screen-space gaze or horizontal lid crease.
    vec2 eyeHorizontal = lowerAtlasEye
      ? vec2(0.69440777, -0.71958172)
      : vec2(0.76780184, 0.64068739);
    vec2 eyeVertical = lowerAtlasEye
      ? vec2(-0.71958172, -0.69440777)
      : vec2(0.64068739, -0.76780184);
    float eyeSide = lowerAtlasEye ? -1.0 : 1.0;
    vec3 pupilColor = vec3(0.02745098, 0.23921569, 0.20392157);
    vec3 highlightColor = vec3(0.87058824, 0.99607843, 0.92549020);

    vec2 irisLocal = lowerAtlasEye ? lowerIrisLocal : upperIrisLocal;
    float irisDistance = length(irisLocal);
    // The runtime texture is compiled from the master SVG with all five
    // pupil-owned vector paths removed. Draw only the live pupil here; a
    // circular shader repaint cannot exactly erase the irregular source art.
    vec3 color = sourceColor;

    vec2 gazeCommand = uAxieClearEyeGaze;
    gazeCommand /= max(1.0, length(gazeCommand));
    vec2 signedTravel = vec2(
      gazeCommand.x >= 0.0 ? ${AXIE_CLEAR_EYE_GAZE_TRAVEL.positiveX.toFixed(2)} : ${AXIE_CLEAR_EYE_GAZE_TRAVEL.negativeX.toFixed(2)},
      gazeCommand.y >= 0.0 ? ${AXIE_CLEAR_EYE_GAZE_TRAVEL.positiveY.toFixed(2)} : ${AXIE_CLEAR_EYE_GAZE_TRAVEL.negativeY.toFixed(2)}
    );
    float pupilScale = clamp(uAxieClearEyeShape.w, 0.62, 1.08);
    float travelScale = clamp(1.0 - 2.0 * max(0.0, pupilScale - 1.0), 0.84, 1.0);
    vec2 gazeInEyeSpace = eyeHorizontal * (gazeCommand.x * signedTravel.x * travelScale)
      + eyeVertical * (gazeCommand.y * signedTravel.y * travelScale);
    vec2 gazeOffset = gazeInEyeSpace * irisRadius;
    vec2 pupilCenter = restPupil + gazeOffset;
    vec2 pupilDelta = uv - pupilCenter;
    vec2 pupilLocal = vec2(dot(pupilDelta, eyeHorizontal), dot(pupilDelta, eyeVertical));
    float sideForeshorten = 1.0 - 0.12 * abs(gazeCommand.x);
    float pupil = axieEyeInside(length(pupilLocal / vec2(
      0.1435 * pupilScale * sideForeshorten,
      0.1435 * pupilScale
    )), 0.018);
    pupil *= axieEyeInside(irisDistance, 0.012);
    color = mix(color, pupilColor, pupil);

    // The supplied SVG is a flattened trace. Restore the two authored
    // catchlights analytically after replacing its baked pupil region.
    vec2 largeCenter = lowerAtlasEye
      ? vec2(0.1535, 0.7115)
      : vec2(0.6445, 0.1280);
    vec2 largeRadius = lowerAtlasEye
      ? vec2(0.0405, 0.0625)
      : vec2(0.0625, 0.0470);
    vec2 smallCenter = lowerAtlasEye
      ? vec2(0.5165, 0.7770)
      : vec2(0.7075, 0.4970);
    float largeHighlight = axieEyeInside(axieEyeEllipse(uv, largeCenter, largeRadius), 0.035);
    float smallHighlight = axieEyeInside(
      axieEyeEllipse(uv, smallCenter, vec2(0.0270, 0.0270)),
      0.04
    );
    color = mix(color, highlightColor, max(largeHighlight, smallHighlight));

    float aperture = clamp(uAxieClearEyeShape.x, 0.28, 1.65);
    float tilt = clamp(uAxieClearEyeShape.y, -0.46, 0.46);
    float lowerLift = clamp(uAxieClearEyeShape.z, 0.0, 0.48);
    vec2 orientedLocal = vec2(
      dot(irisLocal, eyeHorizontal),
      dot(irisLocal, eyeVertical)
    );
    float innerX = -eyeSide * orientedLocal.x;
    float upperEdge = -aperture + 0.12 * orientedLocal.x * orientedLocal.x + tilt * innerX;
    float lowerEdge = aperture - 0.08 * orientedLocal.x * orientedLocal.x - lowerLift;
    float blink = clamp(uAxieClearEyeBlink, 0.0, 1.0);
    upperEdge = mix(upperEdge, -0.015 + 0.080 * orientedLocal.x * orientedLocal.x, blink);
    lowerEdge = mix(lowerEdge, 0.015 - 0.080 * orientedLocal.x * orientedLocal.x, blink);
    float topLid = 1.0 - smoothstep(upperEdge - 0.018, upperEdge + 0.018, orientedLocal.y);
    float bottomLid = smoothstep(lowerEdge - 0.018, lowerEdge + 0.018, orientedLocal.y);
    // Clip the covered parts of the original eye surface so the real body
    // directly underneath becomes the eyelid. This keeps every palette,
    // light, and shader treatment exact without a floating or grey overlay.
    // Covered Eye_M fragments are removed wholesale so the actual body below
    // supplies the eyelid. Bound only the drawn crease to the central authored
    // eye, keeping it short while guaranteeing the full source rim disappears.
    float lidMask = 1.0;
    float creaseMask = axieEyeInside(irisDistance / 0.90, 0.024);
    float lid = max(topLid, bottomLid) * lidMask;
    float fullClosure = smoothstep(0.92, 1.0, blink) * lidMask;
    lid = max(lid, fullClosure);
    float creaseY = -0.012 + 0.065 * orientedLocal.x * orientedLocal.x;
    float crease = (1.0 - smoothstep(0.018, 0.042, abs(orientedLocal.y - creaseY)))
      * creaseMask
      * smoothstep(0.78, 0.98, blink);
    eyeVisibility = max(1.0 - lid, crease);
    color = mix(color, pupilColor, crease);
    return color;
  }
`;

const KOTARO_EYE_GLSL = /* glsl */`
  uniform float uAxieKotaroEyeEnabled;
  uniform vec2 uAxieKotaroEyeGaze;
  uniform vec4 uAxieKotaroEyeShape;
  uniform float uAxieKotaroEyeBlink;
  uniform sampler2D uAxieKotaroPupilTex;
  uniform sampler2D uAxieKotaroApertureTex;

  varying float vAxieKotaroEyeSide;
  varying float vAxieKotaroPrimarySurface;

  vec3 axieKotaroEyeCompose(vec2 uv, vec3 sourceColor, out float eyeVisibility) {
    eyeVisibility = 1.0;
    // The two red upper markings share this material and atlas. Their object-
    // space Z band is disjoint from the two primary eye surfaces, so they must
    // bypass gaze and lids entirely.
    if (vAxieKotaroPrimarySurface < 0.5) return sourceColor;

    float eyeSide = vAxieKotaroEyeSide < 0.0 ? -1.0 : 1.0;
    vec2 eyeHorizontal = eyeSide * vec2(0.84883454, -0.52865861);
    vec2 eyeVertical = vec2(-0.52865861, -0.84883454);
    // glTF UVs and the CanvasTextures intentionally share flipY=false. The
    // source-image row therefore stays 0.598; using 1-v would mirror the pupil.
    vec2 restPupil = vec2(0.46420, 0.59800);

    vec2 gazeCommand = uAxieKotaroEyeGaze;
    gazeCommand /= max(1.0, length(gazeCommand));
    // Source-measured aperture-safe travel. The exact vector aperture clips
    // the authored slit at the irregular yellow boundary instead of exposing a
    // rectangular atlas or leaving a fixed circular footprint.
    vec2 signedTravel = vec2(
      gazeCommand.x >= 0.0 ? 0.13 : 0.13,
      gazeCommand.y >= 0.0 ? 0.012 : 0.19
    );
    float pupilScale = clamp(uAxieKotaroEyeShape.w, 0.62, 1.08);
    float sideForeshorten = 1.0 - 0.10 * abs(gazeCommand.x);
    float travelScale = clamp(1.0 - 1.6 * max(0.0, pupilScale - 1.0), 0.86, 1.0);
    vec2 pupilCenter = restPupil
      + eyeHorizontal * (gazeCommand.x * signedTravel.x * travelScale)
      + eyeVertical * (gazeCommand.y * signedTravel.y * travelScale);
    vec2 pupilDelta = uv - pupilCenter;
    vec2 pupilLocal = vec2(
      dot(pupilDelta, eyeHorizontal),
      dot(pupilDelta, eyeVertical)
    );
    vec2 pupilSampleUv = restPupil + pupilDelta
      + eyeHorizontal * pupilLocal.x * (1.0 / (pupilScale * sideForeshorten) - 1.0)
      + eyeVertical * pupilLocal.y * (1.0 / pupilScale - 1.0);
    vec4 pupilSample = texture2D(uAxieKotaroPupilTex, pupilSampleUv);
    float apertureMask = texture2D(uAxieKotaroApertureTex, uv).a;
    vec3 color = mix(sourceColor, pupilSample.rgb, pupilSample.a * apertureMask);

    // Clip the actual primary eye surface for expressions and blinks. The body
    // immediately beneath becomes the eyelid; no floating translucent overlay
    // is introduced. The red upper markings remain source-authored and static.
    vec2 eyeLocal = vec2(
      dot(uv - restPupil, eyeHorizontal) / 0.52,
      dot(uv - restPupil, eyeVertical) / 0.54
    );
    float aperture = clamp(uAxieKotaroEyeShape.x, 0.28, 1.65);
    float tilt = clamp(uAxieKotaroEyeShape.y, -0.46, 0.46);
    float lowerLift = clamp(uAxieKotaroEyeShape.z, 0.0, 0.48);
    float aperture01 = clamp((aperture - 0.28) / 1.37, 0.0, 1.0);
    float innerX = -eyeSide * eyeLocal.x;
    // Clear and Kotaro have different authored UV silhouettes. Remap the
    // shared semantic aperture into Kotaro's measured -0.70..+0.44 lid space.
    float upperEdge = -mix(0.02, 0.82, aperture01)
      + 0.07 * eyeLocal.x * eyeLocal.x
      + tilt * innerX;
    float lowerEdge = mix(0.16, 0.68, aperture01)
      - 0.04 * eyeLocal.x * eyeLocal.x
      - 1.10 * lowerLift;
    float blink = clamp(uAxieKotaroEyeBlink, 0.0, 1.0);
    upperEdge = mix(upperEdge, -0.012 + 0.070 * eyeLocal.x * eyeLocal.x, blink);
    lowerEdge = mix(lowerEdge, 0.012 - 0.070 * eyeLocal.x * eyeLocal.x, blink);
    float topLid = 1.0 - smoothstep(upperEdge - 0.018, upperEdge + 0.018, eyeLocal.y);
    float bottomLid = smoothstep(lowerEdge - 0.018, lowerEdge + 0.018, eyeLocal.y);
    float lid = max(topLid, bottomLid);
    lid = max(lid, smoothstep(0.92, 1.0, blink));
    float creaseY = -0.008 + 0.060 * eyeLocal.x * eyeLocal.x;
    float crease = (1.0 - smoothstep(0.020, 0.045, abs(eyeLocal.y - creaseY)))
      * (1.0 - smoothstep(0.74, 0.98, abs(eyeLocal.x)))
      * smoothstep(0.78, 0.98, blink);
    eyeVisibility = max(1.0 - lid, crease);
    color = mix(color, vec3(0.28235, 0.16471, 0.09412), crease);
    return color;
  }
`;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function damp(current: number, target: number, rate: number, delta: number) {
  return current + (target - current) * (1 - Math.exp(-rate * delta));
}

function isExpression(value: unknown): value is AxieEyeExpression {
  return typeof value === 'string' && (AXIE_EYE_EXPRESSIONS as readonly string[]).includes(value);
}

function isGazeMode(value: unknown): value is AxieEyeGazeMode {
  return typeof value === 'string' && (AXIE_EYE_GAZE_MODES as readonly string[]).includes(value);
}

function frozenConfig(config: AxieEyePerformanceConfig): AxieEyePerformanceConfig {
  return Object.freeze({
    ...config,
    fixedGaze: Object.freeze({ ...config.fixedGaze }),
  });
}

function normalizedConfig(
  current: AxieEyePerformanceConfig,
  patch: AxieEyePerformanceConfigPatch,
): AxieEyePerformanceConfig {
  const expression = patch.expression ?? current.expression;
  const gazeMode = patch.gazeMode ?? current.gazeMode;
  if (!isExpression(expression)) throw new TypeError(`Unknown Axie eye expression "${expression}".`);
  if (!isGazeMode(gazeMode)) throw new TypeError(`Unknown Axie eye gaze mode "${gazeMode}".`);
  const fixed = patch.fixedGaze ?? current.fixedGaze;
  const fixedGaze = clampAxieEyeGaze(fixed.x, fixed.y);
  return frozenConfig({
    expression,
    expressionIntensity: clamp(
      patch.expressionIntensity ?? current.expressionIntensity,
      0,
      1,
    ),
    gazeMode,
    fixedGaze,
    autoBlink: patch.autoBlink ?? current.autoBlink,
  });
}

export function resolveAxieEyeShape(
  expression: AxieEyeExpression,
  intensity = 1,
): Readonly<EyeShape> {
  const weight = clamp(intensity, 0, 1);
  // The source art extends beyond a unit iris ellipse. Keep neutral genuinely
  // unoccluded; expression intensity zero must preserve the authored rim.
  const neutral: EyeShape = { aperture: 1.55, tilt: 0, lowerLift: 0, pupilScale: 1 };
  const target: EyeShape = expression === 'happy'
    ? { aperture: 0.84, tilt: 0, lowerLift: 0.30, pupilScale: 1.02 }
    : expression === 'sad'
      ? { aperture: 0.82, tilt: -0.30, lowerLift: 0.04, pupilScale: 1.03 }
      : expression === 'angry'
        ? { aperture: 0.72, tilt: 0.38, lowerLift: 0.02, pupilScale: 0.93 }
        : expression === 'surprised'
          ? { aperture: 1.62, tilt: 0, lowerLift: 0, pupilScale: 0.72 }
          : expression === 'squint'
            ? { aperture: 0.46, tilt: 0, lowerLift: 0.08, pupilScale: 0.92 }
            : neutral;
  return Object.freeze({
    aperture: THREE.MathUtils.lerp(neutral.aperture, target.aperture, weight),
    tilt: THREE.MathUtils.lerp(neutral.tilt, target.tilt, weight),
    lowerLift: THREE.MathUtils.lerp(neutral.lowerLift, target.lowerLift, weight),
    pupilScale: THREE.MathUtils.lerp(neutral.pupilScale, target.pupilScale, weight),
  });
}

export function evaluateAxieBlinkWeight(elapsedSeconds: number) {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) return 0;
  const close = 0.064;
  const hold = 0.042;
  const open = 0.112;
  if (elapsedSeconds < close) return smoothstep(elapsedSeconds / close);
  if (elapsedSeconds < close + hold) return 1;
  if (elapsedSeconds < close + hold + open) {
    return 1 - smoothstep((elapsedSeconds - close - hold) / open);
  }
  return 0;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function selectedEyePartId(descriptor: AxieDescriptor) {
  const eye = descriptor.parts.find((part) => part.type === 'eye');
  return eye ? formatAxiePartAssetId(eye) : undefined;
}

function surfaceMeshes(root: THREE.Object3D, partId: string) {
  const matches: THREE.Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      mesh.isMesh
      && mesh.userData.axiePartId === partId
      && mesh.userData.axieOutline !== true
    ) matches.push(mesh);
  });
  return matches;
}

function outlineMeshes(root: THREE.Object3D, partId: string) {
  const matches: THREE.Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (
      mesh.isMesh
      && mesh.userData.axiePartId === partId
      && mesh.userData.axieOutline === true
    ) matches.push(mesh);
  });
  return matches;
}

function shaderMaterials(meshes: readonly THREE.Mesh[]) {
  const result = new Set<THREE.ShaderMaterial>();
  meshes.forEach((mesh) => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const shader = material as THREE.ShaderMaterial;
      if (shader.isShaderMaterial && shader.userData.axieMixerV4) result.add(shader);
    });
  });
  return [...result];
}

function patchedClearFragmentShader(source: string) {
  const uniformMarker = 'uniform sampler2D uMainTex;';
  const mainMarker = 'void main() {';
  const sampleMarker = 'vec4 sampled = texture2D(uMainTex, vAxieUv);';
  if (!source.includes(uniformMarker) || !source.includes(mainMarker) || !source.includes(sampleMarker)) {
    throw new Error('Clear-eye runtime expected the exact Axie V4 fragment shader markers.');
  }
  return source
    // Insert after the complete V4 uniform/helper prelude and immediately
    // before main so this strict patch remains compatible with that shader.
    .replace(mainMarker, `${CLEAR_EYE_GLSL}\n  ${mainMarker}`)
    .replace(
      sampleMarker,
      `${sampleMarker}\n    if (uAxieClearEyeEnabled > 0.5) {\n      float axieClearEyeVisibility = 1.0;\n      sampled.rgb = axieClearEyeCompose(vAxieUv, sampled.rgb, axieClearEyeVisibility);\n      if (axieClearEyeVisibility < 0.5) discard;\n    }`,
    );
}

function patchedKotaroVertexShader(source: string) {
  const varyingMarker = 'varying vec2 vAxieUv;';
  const assignmentMarker = 'vAxieUv = uv * uMainTexTransform.xy + uMainTexTransform.zw;';
  if (!source.includes(varyingMarker) || !source.includes(assignmentMarker)) {
    throw new Error('Kotaro-eye runtime expected the exact Axie V4 vertex shader markers.');
  }
  return source
    .replace(
      varyingMarker,
      `${varyingMarker}\n  varying float vAxieKotaroEyeSide;\n  varying float vAxieKotaroPrimarySurface;`,
    )
    .replace(
      assignmentMarker,
      `${assignmentMarker}\n    vAxieKotaroEyeSide = position.x < 0.0 ? -1.0 : 1.0;\n    vAxieKotaroPrimarySurface = position.z > -8.437511 ? 1.0 : 0.0;`,
    );
}

function patchedKotaroFragmentShader(source: string) {
  const mainMarker = 'void main() {';
  const sampleMarker = 'vec4 sampled = texture2D(uMainTex, vAxieUv);';
  if (!source.includes('uniform sampler2D uMainTex;') || !source.includes(mainMarker) || !source.includes(sampleMarker)) {
    throw new Error('Kotaro-eye runtime expected the exact Axie V4 fragment shader markers.');
  }
  return source
    .replace(mainMarker, `${KOTARO_EYE_GLSL}\n  ${mainMarker}`)
    .replace(
      sampleMarker,
      `${sampleMarker}\n    if (uAxieKotaroEyeEnabled > 0.5) {\n      float axieKotaroEyeVisibility = 1.0;\n      sampled.rgb = axieKotaroEyeCompose(vAxieUv, sampled.rgb, axieKotaroEyeVisibility);\n      if (axieKotaroEyeVisibility < 0.5) discard;\n    }`,
    );
}

async function rasterizeSvg(svgSource: string, resolution: number, alpha = false) {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    throw new Error('Axie SVG eye rasterization requires a browser DOM.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const context = canvas.getContext('2d', { alpha });
  if (!context) throw new Error('Cannot create the Axie vector-eye 2D authoring canvas.');
  if (!alpha) {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, resolution, resolution);
  } else {
    context.clearRect(0, 0, resolution, resolution);
  }
  const blobUrl = URL.createObjectURL(new Blob([svgSource], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = blobUrl;
    await image.decode();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(image, 0, 0, resolution, resolution);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  return canvas;
}

function eyeTextureResolution(target: AxieEyeControllerTarget, requested?: number) {
  const fallback = target.quality.textureVariant === 'unity-import' ? 256 : 1024;
  return Math.round(clamp(requested ?? fallback, 128, 1024));
}

class UnsupportedAxieEyeController implements AxieEyeController {
  readonly supported = false;
  readonly partId;
  #config: AxieEyePerformanceConfig;
  #disposed = false;

  constructor(partId: string | undefined, patch: AxieEyePerformanceConfigPatch = {}) {
    this.partId = partId;
    this.#config = normalizedConfig(DEFAULT_CONFIG, patch);
  }

  get config() { return this.#config; }

  setConfig(patch: AxieEyePerformanceConfigPatch) {
    if (!this.#disposed) this.#config = normalizedConfig(this.#config, patch);
  }

  setPointerGaze() {}
  blink() { return false; }
  update() {}

  inspect(): AxieEyeRuntimeInspection {
    return Object.freeze({
      supported: false,
      profile: undefined,
      partId: this.partId,
      sourceSvgSha256: undefined,
      pupilFreeSvgSha256: undefined,
      pupilOnlySvgSha256: undefined,
      apertureMaskSvgSha256: undefined,
      boundMeshes: 0,
      boundMaterials: 0,
      textureResolution: 0,
      textureRevision: 0,
      textureCount: 0,
      expression: this.#config.expression,
      expressionIntensity: this.#config.expressionIntensity,
      gazeMode: this.#config.gazeMode,
      gaze: Object.freeze({ x: 0, y: 0 }),
      ambientGazePhase: undefined,
      ambientGazeTarget: Object.freeze({ x: 0, y: 0 }),
      ambientSaccadeCount: 0,
      ambientMicroSaccadeCount: 0,
      autoBlink: this.#config.autoBlink,
      blinkWeight: 0,
      blinkCount: 0,
      pointerTargetValid: false,
      disposed: this.#disposed,
    });
  }

  dispose() { this.#disposed = true; }
}

interface EyeTextureSet {
  readonly base: THREE.CanvasTexture;
  readonly pupil?: THREE.CanvasTexture;
  readonly aperture?: THREE.CanvasTexture;
  readonly owned: readonly THREE.CanvasTexture[];
}

interface PreparedEyeShader {
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly uniforms: Readonly<Record<string, THREE.IUniform>>;
}

interface LivelyEyeProfile {
  readonly id: NonNullable<AxieEyeRuntimeInspection['profile']>;
  readonly partId: string;
  readonly textureRevision: number;
  readonly sourceSvgSha256: string;
  readonly pupilFreeSvgSha256: string;
  readonly pupilOnlySvgSha256?: string;
  readonly apertureMaskSvgSha256?: string;
  readonly pupilFreeSvg: string;
  readonly pupilOnlySvg?: string;
  readonly apertureMaskSvg?: string;
  readonly uniformKeys: readonly string[];
  readonly blinkUniformKey: string;
  prepareShader(
    material: THREE.ShaderMaterial,
    textures: EyeTextureSet,
    gaze: THREE.Vector2,
    shape: THREE.Vector4,
  ): PreparedEyeShader;
}

const CLEAR_L1_PROFILE: LivelyEyeProfile = Object.freeze({
  id: 'clear-l1',
  partId: AXIE_CLEAR_EYE_L1_PART_ID,
  textureRevision: 2,
  sourceSvgSha256: AXIE_CLEAR_EYE_L1_SVG_SHA256,
  pupilFreeSvgSha256: AXIE_CLEAR_EYE_L1_PUPIL_FREE_SVG_SHA256,
  pupilFreeSvg: AXIE_CLEAR_EYE_L1_PUPIL_FREE_SVG,
  uniformKeys: CLEAR_EYE_UNIFORM_KEYS,
  blinkUniformKey: 'uAxieClearEyeBlink',
  prepareShader(
    material: THREE.ShaderMaterial,
    _textures: EyeTextureSet,
    gaze: THREE.Vector2,
    shape: THREE.Vector4,
  ) {
    return {
      vertexShader: material.vertexShader,
      fragmentShader: patchedClearFragmentShader(material.fragmentShader),
      uniforms: {
        uAxieClearEyeEnabled: { value: 1 },
        uAxieClearEyeGaze: { value: gaze },
        uAxieClearEyeShape: { value: shape },
        uAxieClearEyeBlink: { value: 0 },
      },
    };
  },
});

const KOTARO_L1_PROFILE: LivelyEyeProfile = Object.freeze({
  id: 'kotaro-l1',
  partId: AXIE_KOTARO_EYE_L1_PART_ID,
  textureRevision: 1,
  sourceSvgSha256: AXIE_KOTARO_EYE_L1_SVG_SHA256,
  pupilFreeSvgSha256: AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG_SHA256,
  pupilOnlySvgSha256: AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG_SHA256,
  apertureMaskSvgSha256: AXIE_KOTARO_EYE_L1_APERTURE_SVG_SHA256,
  pupilFreeSvg: AXIE_KOTARO_EYE_L1_PUPIL_FREE_SVG,
  pupilOnlySvg: AXIE_KOTARO_EYE_L1_PUPIL_ONLY_SVG,
  apertureMaskSvg: AXIE_KOTARO_EYE_L1_APERTURE_SVG,
  uniformKeys: KOTARO_EYE_UNIFORM_KEYS,
  blinkUniformKey: 'uAxieKotaroEyeBlink',
  prepareShader(
    material: THREE.ShaderMaterial,
    textures: EyeTextureSet,
    gaze: THREE.Vector2,
    shape: THREE.Vector4,
  ) {
    if (!textures.pupil || !textures.aperture) {
      throw new Error('Kotaro-eye runtime requires exact pupil and aperture vector textures.');
    }
    return {
      vertexShader: patchedKotaroVertexShader(material.vertexShader),
      fragmentShader: patchedKotaroFragmentShader(material.fragmentShader),
      uniforms: {
        uAxieKotaroEyeEnabled: { value: 1 },
        uAxieKotaroEyeGaze: { value: gaze },
        uAxieKotaroEyeShape: { value: shape },
        uAxieKotaroEyeBlink: { value: 0 },
        uAxieKotaroPupilTex: { value: textures.pupil },
        uAxieKotaroApertureTex: { value: textures.aperture },
      },
    };
  },
});

const LIVELY_EYE_PROFILES = new Map<string, LivelyEyeProfile>([
  [CLEAR_L1_PROFILE.partId, CLEAR_L1_PROFILE],
  [KOTARO_L1_PROFILE.partId, KOTARO_L1_PROFILE],
]);

class LivelyEyeController implements AxieEyeController {
  readonly supported = true;
  readonly partId: string;
  readonly #profile: LivelyEyeProfile;
  readonly #textures: readonly THREE.CanvasTexture[];
  readonly #patches: readonly MaterialPatch[];
  readonly #surfacePassPatches: readonly SurfacePassPatch[];
  readonly #outlineVisibilityPatches: readonly OutlineVisibilityPatch[];
  readonly #boundMeshes: number;
  readonly #resolution: number;
  readonly #sourceSvgSha256: string | undefined;
  readonly #pupilFreeSvgSha256: string | undefined;
  readonly #pupilOnlySvgSha256: string | undefined;
  readonly #apertureMaskSvgSha256: string | undefined;
  readonly #random: () => number;
  readonly #gazeBlinkRandom: () => number;
  readonly #ambientPlanner: AxieAmbientGazePlanner;
  readonly #shape = new THREE.Vector4(1.55, 0, 0, 1);
  readonly #gaze = new THREE.Vector2();
  readonly #pointerGaze = new THREE.Vector2();
  readonly #ambientGaze = new THREE.Vector2();
  #ambientInspection: AxieAmbientGazeInspection;
  #config: AxieEyePerformanceConfig;
  #pointerTargetValid = false;
  #nextBlinkSeconds = 0;
  #blinkElapsed = -1;
  #doubleBlinkDelay = -1;
  #blinkWeight = 0;
  #blinkCount = 0;
  #secondsSinceBlink = 2;
  #disposed = false;

  constructor(
    target: AxieEyeControllerTarget,
    profile: LivelyEyeProfile,
    textures: EyeTextureSet,
    meshes: readonly THREE.Mesh[],
    outlines: readonly THREE.Mesh[],
    materials: readonly THREE.ShaderMaterial[],
    resolution: number,
    sourceSvgSha256: string | undefined,
    pupilFreeSvgSha256: string | undefined,
    sourceSvgCanonical: boolean,
    options: CreateAxieEyeControllerOptions,
  ) {
    this.partId = profile.partId;
    this.#profile = profile;
    this.#textures = textures.owned;
    this.#boundMeshes = meshes.length;
    this.#resolution = resolution;
    this.#sourceSvgSha256 = sourceSvgSha256;
    this.#pupilFreeSvgSha256 = pupilFreeSvgSha256;
    this.#pupilOnlySvgSha256 = profile.pupilOnlySvgSha256;
    this.#apertureMaskSvgSha256 = profile.apertureMaskSvgSha256;
    const randomSeed = options.randomSeed ?? 0x434c4541;
    // Independent streams keep changes to gaze sampling from reshuffling the
    // random values used for ordinary and saccade-coordinated blink decisions.
    this.#random = mulberry32(randomSeed ^ 0x424c494e);
    this.#gazeBlinkRandom = mulberry32(randomSeed ^ 0x53414343);
    this.#ambientPlanner = new AxieAmbientGazePlanner(randomSeed ^ 0x47415a45);
    this.#ambientInspection = this.#ambientPlanner.inspect();
    this.#config = normalizedConfig(DEFAULT_CONFIG, options.initialConfig ?? {});
    this.#nextBlinkSeconds = this.#randomBlinkInterval();
    const prepared = materials.map((material) => {
      if (material.userData.axieEyeRuntime) {
        throw new Error(`Axie material ${material.name} already has an eye runtime.`);
      }
      const originalTexture = material.uniforms.uMainTex?.value as THREE.Texture | undefined;
      if (!originalTexture) throw new Error(`Axie ${profile.id} material ${material.name} has no uMainTex.`);
      const shader = profile.prepareShader(material, textures, this.#gaze, this.#shape);
      return {
        shader,
        patch: {
          material,
          originalVertexShader: material.vertexShader,
          originalFragmentShader: material.fragmentShader,
          originalTexture,
          previousUserData: material.userData.axieEyeRuntime,
          uniformKeys: profile.uniformKeys,
        } satisfies MaterialPatch,
      };
    });
    this.#patches = prepared.map(({ shader, patch }) => {
      const { material } = patch;
      material.vertexShader = shader.vertexShader;
      material.fragmentShader = shader.fragmentShader;
      material.uniforms.uMainTex.value = textures.base;
      Object.assign(material.uniforms, shader.uniforms);
      material.userData.axieEyeRuntime = Object.freeze({
        profile: profile.id,
        partId: profile.partId,
        sourceSvgSha256,
        pupilFreeSvgSha256,
        pupilOnlySvgSha256: profile.pupilOnlySvgSha256,
        apertureMaskSvgSha256: profile.apertureMaskSvgSha256,
        sourceSvgCanonical,
      });
      material.needsUpdate = true;
      return patch;
    });
    this.#surfacePassPatches = meshes.map((mesh) => {
      const patch = {
        mesh,
        castShadow: mesh.castShadow,
        previousDepthNormalsExclusion: mesh.userData.axieDepthNormalsExcluded,
      };
      // Surface fragments are clipped to reveal the real body during lids and
      // blinks. Exclude the protruding eye from auxiliary passes so shadows and
      // screen-space depth outlines cannot retain a stale open-eye silhouette.
      mesh.castShadow = false;
      mesh.userData.axieDepthNormalsExcluded = true;
      return patch;
    });
    this.#outlineVisibilityPatches = outlines.map((mesh) => {
      const patch = { mesh, visible: mesh.visible };
      mesh.visible = false;
      return patch;
    });
    // Touch the target in development builds so accidental mismatch is easier
    // to diagnose without retaining the character beyond this controller.
    void target;
  }

  get config() { return this.#config; }

  setConfig(patch: AxieEyePerformanceConfigPatch) {
    if (this.#disposed) return;
    this.#config = normalizedConfig(this.#config, patch);
    if (!this.#config.autoBlink && this.#blinkElapsed < 0) this.#nextBlinkSeconds = Infinity;
    if (this.#config.autoBlink && !Number.isFinite(this.#nextBlinkSeconds)) {
      this.#nextBlinkSeconds = this.#randomBlinkInterval();
    }
  }

  setPointerGaze(x: number, y: number, valid = true) {
    if (this.#disposed) return;
    const gaze = clampAxieEyeGaze(x, y);
    this.#pointerGaze.set(gaze.x, gaze.y);
    this.#pointerTargetValid = valid;
  }

  blink() {
    if (this.#disposed || this.#blinkElapsed >= 0) return false;
    this.#startBlink(false);
    return true;
  }

  update(deltaSeconds: number) {
    if (this.#disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    const delta = Math.min(deltaSeconds, 0.1);
    const ambientActive = this.#config.gazeMode === 'ambient'
      || (this.#config.gazeMode === 'pointer' && !this.#pointerTargetValid);
    if (ambientActive) {
      this.#ambientInspection = this.#ambientPlanner.update(delta);
      this.#ambientGaze.set(
        this.#ambientInspection.gaze.x,
        this.#ambientInspection.gaze.y,
      );
    }
    const targetGaze = this.#config.gazeMode === 'fixed'
      ? this.#config.fixedGaze
      : this.#config.gazeMode === 'pointer' && this.#pointerTargetValid
        ? this.#pointerGaze
        : this.#ambientGaze;
    const gazeRate = ambientActive
      ? this.#ambientInspection.phase === 'saccade' ? 58 : 26
      : 18;
    this.#gaze.set(
      damp(this.#gaze.x, targetGaze.x, gazeRate, delta),
      damp(this.#gaze.y, targetGaze.y, gazeRate, delta),
    );
    const boundedGaze = clampAxieEyeGaze(this.#gaze.x, this.#gaze.y);
    this.#gaze.set(boundedGaze.x, boundedGaze.y);

    this.#secondsSinceBlink += delta;
    if (
      ambientActive
      && this.#config.autoBlink
      && this.#ambientInspection.saccadeStarted
      && this.#ambientInspection.saccadeDistance > 0.70
      && this.#secondsSinceBlink >= 1.6
      && this.#blinkElapsed < 0
      && this.#gazeBlinkRandom() < 0.16
    ) this.#startBlink(false);

    const targetShape = resolveAxieEyeShape(
      this.#config.expression,
      this.#config.expressionIntensity,
    );
    this.#shape.set(
      damp(this.#shape.x, targetShape.aperture, 12, delta),
      damp(this.#shape.y, targetShape.tilt, 12, delta),
      damp(this.#shape.z, targetShape.lowerLift, 12, delta),
      damp(this.#shape.w, targetShape.pupilScale, 12, delta),
    );
    this.#updateBlink(delta);
    this.#patches.forEach(({ material }) => {
      material.uniforms[this.#profile.blinkUniformKey].value = this.#blinkWeight;
    });
  }

  inspect(): AxieEyeRuntimeInspection {
    return Object.freeze({
      supported: true,
      profile: this.#profile.id,
      partId: this.partId,
      sourceSvgSha256: this.#sourceSvgSha256,
      pupilFreeSvgSha256: this.#pupilFreeSvgSha256,
      pupilOnlySvgSha256: this.#pupilOnlySvgSha256,
      apertureMaskSvgSha256: this.#apertureMaskSvgSha256,
      boundMeshes: this.#boundMeshes,
      boundMaterials: this.#patches.length,
      textureResolution: this.#resolution,
      textureRevision: this.#profile.textureRevision,
      textureCount: this.#textures.length,
      expression: this.#config.expression,
      expressionIntensity: this.#config.expressionIntensity,
      gazeMode: this.#config.gazeMode,
      gaze: Object.freeze({ x: this.#gaze.x, y: this.#gaze.y }),
      ambientGazePhase: this.#ambientInspection.phase,
      ambientGazeTarget: Object.freeze({ ...this.#ambientInspection.target }),
      ambientSaccadeCount: this.#ambientInspection.saccadeCount,
      ambientMicroSaccadeCount: this.#ambientInspection.microSaccadeCount,
      autoBlink: this.#config.autoBlink,
      blinkWeight: this.#blinkWeight,
      blinkCount: this.#blinkCount,
      pointerTargetValid: this.#pointerTargetValid,
      disposed: this.#disposed,
    });
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#patches.forEach((patch) => {
      const { material } = patch;
      material.vertexShader = patch.originalVertexShader;
      material.fragmentShader = patch.originalFragmentShader;
      if (material.uniforms.uMainTex) material.uniforms.uMainTex.value = patch.originalTexture;
      patch.uniformKeys.forEach((key) => { delete material.uniforms[key]; });
      if (patch.previousUserData === undefined) delete material.userData.axieEyeRuntime;
      else material.userData.axieEyeRuntime = patch.previousUserData;
      material.needsUpdate = true;
    });
    this.#surfacePassPatches.forEach((patch) => {
      patch.mesh.castShadow = patch.castShadow;
      if (patch.previousDepthNormalsExclusion === undefined) {
        delete patch.mesh.userData.axieDepthNormalsExcluded;
      } else {
        patch.mesh.userData.axieDepthNormalsExcluded = patch.previousDepthNormalsExclusion;
      }
    });
    this.#outlineVisibilityPatches.forEach((patch) => { patch.mesh.visible = patch.visible; });
    this.#textures.forEach((texture) => texture.dispose());
  }

  #randomBlinkInterval() {
    return 2.2 + this.#random() * 4.3;
  }

  #startBlink(automatic: boolean) {
    this.#blinkElapsed = 0;
    this.#secondsSinceBlink = 0;
    this.#blinkCount += 1;
    this.#doubleBlinkDelay = automatic && this.#random() < 0.11 ? 0.105 : -1;
  }

  #updateBlink(delta: number) {
    if (this.#blinkElapsed >= 0) {
      this.#blinkElapsed += delta;
      this.#blinkWeight = evaluateAxieBlinkWeight(this.#blinkElapsed);
      if (this.#blinkElapsed >= 0.218) {
        this.#blinkElapsed = -1;
        this.#blinkWeight = 0;
        if (this.#doubleBlinkDelay < 0) {
          this.#nextBlinkSeconds = this.#config.autoBlink
            ? this.#randomBlinkInterval()
            : Infinity;
        }
      }
      return;
    }
    if (this.#doubleBlinkDelay >= 0) {
      this.#doubleBlinkDelay -= delta;
      if (this.#doubleBlinkDelay <= 0) {
        this.#doubleBlinkDelay = -1;
        this.#startBlink(false);
      }
      return;
    }
    if (!this.#config.autoBlink) return;
    this.#nextBlinkSeconds -= delta;
    if (this.#nextBlinkSeconds <= 0) this.#startBlink(true);
  }
}

function createEyeTexture(
  canvas: HTMLCanvasElement,
  original: THREE.Texture,
  target: AxieEyeControllerTarget,
  name: string,
  auxiliary = false,
) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = name;
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.wrapS = auxiliary ? THREE.ClampToEdgeWrapping : original.wrapS;
  texture.wrapT = auxiliary ? THREE.ClampToEdgeWrapping : original.wrapT;
  texture.minFilter = original.minFilter;
  texture.magFilter = original.magFilter;
  texture.anisotropy = target.quality.anisotropy;
  texture.generateMipmaps = original.generateMipmaps;
  texture.premultiplyAlpha = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Binds a sealed lively-eye profile to an assembled Axie. SVG layers are
 * rasterized only during construction; gaze, blink and expressions then touch
 * shader uniforms on the original curved Eye_M mesh.
 */
export async function createAxieEyeController(
  target: AxieEyeControllerTarget | AxiePlayableCharacter,
  options: CreateAxieEyeControllerOptions = {},
): Promise<AxieEyeController> {
  const partId = selectedEyePartId(target.descriptor);
  const profile = partId ? LIVELY_EYE_PROFILES.get(partId) : undefined;
  if (!profile) {
    return new UnsupportedAxieEyeController(partId, options.initialConfig);
  }
  const meshes = surfaceMeshes(target.model, profile.partId);
  const outlines = outlineMeshes(target.model, profile.partId);
  const materials = shaderMaterials(meshes);
  if (meshes.length !== 1 || materials.length !== 1) {
    throw new Error(
      `${profile.id} runtime expected one ${partId} surface mesh/material; found ${meshes.length}/${materials.length}.`,
    );
  }
  const resolution = eyeTextureResolution(target, options.textureResolution);
  const canonicalSource = options.svgSource === undefined
    || options.svgSource === profile.pupilFreeSvg
    || (profile.id === 'clear-l1' && options.svgSource === AXIE_CLEAR_EYE_L1_SVG);
  const svgSource = canonicalSource
    ? profile.pupilFreeSvg
    : options.svgSource!;
  const sourceSvgSha256 = canonicalSource
    ? profile.sourceSvgSha256
    : undefined;
  const pupilFreeSvgSha256 = canonicalSource
    ? profile.pupilFreeSvgSha256
    : undefined;
  const [baseCanvas, pupilCanvas, apertureCanvas] = await Promise.all([
    rasterizeSvg(svgSource, resolution),
    profile.pupilOnlySvg ? rasterizeSvg(profile.pupilOnlySvg, resolution, true) : undefined,
    profile.apertureMaskSvg ? rasterizeSvg(profile.apertureMaskSvg, resolution, true) : undefined,
  ]);
  const originalTexture = materials[0].uniforms.uMainTex.value as THREE.Texture;
  const base = createEyeTexture(
    baseCanvas,
    originalTexture,
    target,
    `AxieEye:${profile.id}:Base:${resolution}`,
  );
  const pupil = pupilCanvas
    ? createEyeTexture(
      pupilCanvas,
      originalTexture,
      target,
      `AxieEye:${profile.id}:Pupil:${resolution}`,
      true,
    )
    : undefined;
  const aperture = apertureCanvas
    ? createEyeTexture(
      apertureCanvas,
      originalTexture,
      target,
      `AxieEye:${profile.id}:Aperture:${resolution}`,
      true,
    )
    : undefined;
  const owned = [base, pupil, aperture].filter(
    (texture): texture is THREE.CanvasTexture => texture !== undefined,
  );
  const textures: EyeTextureSet = { base, pupil, aperture, owned };
  try {
    return new LivelyEyeController(
      target,
      profile,
      textures,
      meshes,
      outlines,
      materials,
      resolution,
      sourceSvgSha256,
      pupilFreeSvgSha256,
      canonicalSource,
      options,
    );
  } catch (error) {
    owned.forEach((texture) => texture.dispose());
    throw error;
  }
}
