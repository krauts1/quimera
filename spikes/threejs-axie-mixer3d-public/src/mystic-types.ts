import type * as THREE from 'three';

export type MysticQualityId = 'faithful' | 'enhanced' | 'reduced';

export type MysticDiagnosticSeverity = 'info' | 'warning' | 'error';

export type MysticDiagnosticCode =
  | 'mystic-catalog-invalid'
  | 'mystic-shader-unsupported'
  | 'mystic-material-missing'
  | 'mystic-texture-missing'
  | 'addon-prefab-missing'
  | 'addon-particle-module-unsupported'
  | 'addon-render-mode-unsupported'
  | 'addon-material-missing'
  | 'addon-particle-budget-clamped';

export interface MysticDiagnostic {
  readonly severity: MysticDiagnosticSeverity;
  readonly code: MysticDiagnosticCode;
  readonly message: string;
  readonly assetId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export type MysticDiagnosticSink = (diagnostic: MysticDiagnostic) => void;

export interface MysticQualityProfile {
  readonly id: MysticQualityId;
  /** Authored density is never increased; enhanced raises only capacity/precision. */
  readonly emissionScale: number;
  readonly particleCapacityScale: number;
  readonly perSystemParticleCap: number;
  readonly fixedStepSeconds: number;
  readonly maxCatchUpSteps: number;
  readonly prewarm: boolean;
  readonly shaderDetail: 'full' | 'reduced';
}

export interface MysticTextureSlotSchema {
  readonly guid: string;
  readonly path: string;
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
  /** Built-in ShaderLab texture used by a source-only material default. */
  readonly builtin?: 'white' | 'black' | 'gray' | 'bump' | 'red';
}

export type MysticNumberSchema = number | 'Infinity' | '-Infinity' | 'NaN';
export type MysticColorTuple = readonly [number, number, number, number];
export type MysticMaterialVectorTuple = readonly [
  MysticNumberSchema,
  MysticNumberSchema,
  MysticNumberSchema,
  MysticNumberSchema,
];

export interface MysticShaderSourceSchema {
  readonly id: string;
  readonly guid: string;
  readonly name: string;
  readonly path: string;
  readonly sha256: string;
  readonly materialCount: number;
  readonly properties: readonly string[];
  readonly passes: readonly string[];
  readonly includes: readonly string[];
  readonly tags: readonly string[];
  readonly usesTime: boolean;
  readonly usesSceneDepth: boolean;
  readonly usesSceneNormals: boolean;
  readonly usesMatcap: boolean;
  readonly transparent: boolean;
  /** Exact values from the ShaderLab Properties block for `new Material(shader)`. */
  readonly defaults: Readonly<{
    readonly textures: Readonly<Record<string, MysticTextureSlotSchema>>;
    readonly floats: Readonly<Record<string, MysticNumberSchema>>;
    readonly colors: Readonly<Record<string, MysticMaterialVectorTuple>>;
  }>;
}

export interface MysticMaterialSchema {
  /** Source-relative Unity material path; stable and collision-free. */
  readonly id: string;
  readonly guid: string;
  readonly name: string;
  readonly shaderGuid: string;
  readonly shaderName: string;
  readonly validKeywords: readonly string[];
  readonly invalidKeywords: readonly string[];
  readonly disabledPasses: readonly string[];
  readonly renderQueue: number;
  readonly enableInstancing: boolean;
  readonly doubleSidedGi: boolean;
  readonly textures: Readonly<Record<string, MysticTextureSlotSchema>>;
  readonly floats: Readonly<Record<string, MysticNumberSchema>>;
  readonly colors: Readonly<Record<string, MysticMaterialVectorTuple>>;
}

export interface MysticCurveKeySchema {
  readonly time: number;
  readonly value: number;
  readonly inSlope: number;
  readonly outSlope: number;
  readonly weightedMode: number;
  readonly inWeight: number;
  readonly outWeight: number;
}

export interface MysticCurveSchema {
  readonly keys: readonly MysticCurveKeySchema[];
  readonly preInfinity: number;
  readonly postInfinity: number;
}

/** Unity ParticleSystem.MinMaxCurve, kept losslessly for the authored modes. */
export interface MysticMinMaxCurveSchema {
  /** Constant=0, Curve=1, TwoCurves=2, TwoConstants=3. */
  readonly mode: number;
  readonly multiplier: number;
  readonly minMultiplier: number;
  readonly maxCurve: MysticCurveSchema;
  readonly minCurve: MysticCurveSchema;
}

export interface MysticGradientKeySchema {
  readonly time: number;
  readonly color: MysticColorTuple;
}

export interface MysticGradientSchema {
  readonly mode: number;
  readonly colorKeys: readonly MysticGradientKeySchema[];
  readonly alphaKeys: readonly Readonly<{ time: number; alpha: number }>[];
}

/** Unity ParticleSystem.MinMaxGradient. */
export interface MysticMinMaxGradientSchema {
  /** Color=0, Gradient=1, TwoColors=2, TwoGradients=3, RandomColor=4. */
  readonly mode: number;
  readonly minColor: MysticColorTuple;
  readonly maxColor: MysticColorTuple;
  readonly minGradient: MysticGradientSchema;
  readonly maxGradient: MysticGradientSchema;
}

export interface AddonTransformSchema {
  readonly fileId: string;
  readonly gameObjectId: string;
  readonly name: string;
  readonly parentFileId: string;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
  readonly active: boolean;
}

export interface AddonParticleBurstSchema {
  readonly time: number;
  readonly count: MysticMinMaxCurveSchema;
  readonly cycleCount: number;
  readonly repeatInterval: number;
  readonly probability: number;
}

export interface AddonParticleRendererSchema {
  readonly renderMode: number;
  readonly sortMode: number;
  readonly alignment: number | null;
  readonly minParticleSize: number;
  readonly maxParticleSize: number;
  readonly sortingOrder: number;
  readonly materialIds: readonly string[];
}

export interface AddonParticleSystemSchema {
  readonly id: string;
  readonly fileId: string;
  readonly gameObjectId: string;
  readonly name: string;
  readonly duration: number;
  readonly simulationSpeed: number;
  readonly looping: boolean;
  readonly prewarm: boolean;
  readonly playOnAwake: boolean;
  readonly useUnscaledTime: boolean;
  readonly simulationSpace: number;
  readonly scalingMode: number;
  readonly randomSeed: number;
  readonly autoRandomSeed: boolean;
  readonly startDelay: MysticMinMaxCurveSchema;
  readonly enabledModules: readonly string[];
  readonly initial: Readonly<{
    startLifetime: MysticMinMaxCurveSchema;
    startSpeed: MysticMinMaxCurveSchema;
    startColor: MysticMinMaxGradientSchema;
    startSize: MysticMinMaxCurveSchema;
    startSizeY: MysticMinMaxCurveSchema;
    startSizeZ: MysticMinMaxCurveSchema;
    startRotationX: MysticMinMaxCurveSchema;
    startRotationY: MysticMinMaxCurveSchema;
    startRotation: MysticMinMaxCurveSchema;
    randomizeRotationDirection: number;
    maxParticles: number;
    size3d: boolean;
    rotation3d: boolean;
    gravityModifier: MysticMinMaxCurveSchema;
  }>;
  readonly shape: Readonly<{
    enabled: boolean;
    type: number;
    angle: number;
    length: number;
    radius: number;
    radiusThickness: number;
    position: readonly [number, number, number];
    rotation: readonly [number, number, number];
    scale: readonly [number, number, number];
    alignToDirection: boolean;
    randomDirectionAmount: number;
    sphericalDirectionAmount: number;
    randomPositionAmount: number;
  }>;
  readonly emission: Readonly<{
    rateOverTime: MysticMinMaxCurveSchema;
    rateOverDistance: MysticMinMaxCurveSchema;
    bursts: readonly AddonParticleBurstSchema[];
  }>;
  readonly sizeOverLifetime: Readonly<{
    enabled: boolean;
    separateAxes: boolean;
    x: MysticMinMaxCurveSchema;
    y: MysticMinMaxCurveSchema;
    z: MysticMinMaxCurveSchema;
  }>;
  readonly rotationOverLifetime: Readonly<{
    enabled: boolean;
    separateAxes: boolean;
    x: MysticMinMaxCurveSchema;
    y: MysticMinMaxCurveSchema;
    z: MysticMinMaxCurveSchema;
  }>;
  readonly colorOverLifetime: Readonly<{
    enabled: boolean;
    color: MysticMinMaxGradientSchema;
  }>;
  readonly textureSheet: Readonly<{
    enabled: boolean;
    /** Unity ParticleSystemAnimationMode: Grid=0, Sprites=1. */
    mode: number;
    timeMode: number;
    fps: number;
    frameOverTime: MysticMinMaxCurveSchema;
    startFrame: MysticMinMaxCurveSchema;
    tilesX: number;
    tilesY: number;
    animationType: number;
    rowIndex: number;
    cycles: number;
    rowMode: number;
    flipU: number;
    flipV: number;
    readonly sprites: readonly Readonly<{
      fileId: string;
      guid: string;
      type: number;
      path: string;
    }>[];
  }>;
  readonly customData: Readonly<{
    enabled: boolean;
    mode0: number;
    mode1: number;
    componentCount0: number;
    componentCount1: number;
    color0: MysticMinMaxGradientSchema;
    color1: MysticMinMaxGradientSchema;
    vector0: readonly MysticMinMaxCurveSchema[];
    vector1: readonly MysticMinMaxCurveSchema[];
  }>;
  readonly renderer: AddonParticleRendererSchema;
}

export interface AddonPrefabSchema {
  readonly id: string;
  readonly guid: string;
  readonly addonId: string;
  readonly transforms: readonly AddonTransformSchema[];
  readonly particles: readonly AddonParticleSystemSchema[];
}

export interface MysticSourceCatalog {
  readonly sourceCommit: string;
  readonly generatedAt: string;
  readonly shaders: readonly MysticShaderSourceSchema[];
  readonly materials: readonly MysticMaterialSchema[];
}

export interface AddonSourceCatalog {
  readonly sourceCommit: string;
  readonly generatedAt: string;
  readonly prefabs: readonly AddonPrefabSchema[];
}

export type MysticTextureResolver = (
  slot: MysticTextureSlotSchema,
  material: MysticMaterialSchema,
) => THREE.Texture | null | undefined;

export interface MysticMaterialFactoryOptions {
  readonly quality?: MysticQualityId | MysticQualityProfile;
  readonly resolveTexture: MysticTextureResolver;
  readonly onDiagnostic?: MysticDiagnosticSink;
  /** Body colors injected by AxieFactory for Mystic_Final materials. */
  readonly primaryColor?: THREE.ColorRepresentation;
  readonly secondaryColor?: THREE.ColorRepresentation;
  /** Optional explicit URP `_MainLightPosition.xyz` equivalent for CEL probes. */
  readonly mainLightPosition?: readonly [number, number, number];
}

export interface MysticMaterialBundle {
  readonly surface: THREE.ShaderMaterial;
  readonly outline?: THREE.ShaderMaterial;
  readonly depth?: THREE.Material;
  readonly distance?: THREE.Material;
  /** True only when the generated source contains an enabled ShadowCaster pass. */
  readonly castShadow: boolean;
  readonly fidelity: 'source-faithful' | 'enhanced' | 'reduced';
  readonly fallbackUsed: false;
  dispose(): void;
}

export interface AddonParticleRuntime {
  readonly id: string;
  readonly object: THREE.Object3D;
  readonly diagnostics: readonly MysticDiagnostic[];
  play(): void;
  pause(): void;
  stop(clear?: boolean): void;
  reset(options?: AddonParticleResetOptions): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}

export interface AddonParticleResetOptions {
  /** Defaults to the selected runtime quality profile. */
  readonly prewarm?: boolean;
}

export interface AddonPrefabRuntime {
  readonly id: string;
  readonly object: THREE.Group;
  readonly particles: readonly AddonParticleRuntime[];
  readonly diagnostics: readonly MysticDiagnostic[];
  resetParticles(options?: AddonParticleResetOptions): void;
  update(deltaSeconds: number): void;
  dispose(): void;
}
