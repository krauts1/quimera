/**
 * Lossless TypeScript representation of AxieWebExporter.cs schema version 1.
 *
 * These records deliberately retain Unity/FBX paths and strings. The shipping
 * manifest adapter can normalize URLs and render state without throwing away
 * source evidence needed for parity diagnostics.
 */

export interface AxieExporterManifestV1 {
  readonly schemaVersion: 1;
  readonly exporterVersion: string;
  readonly sourceRepository: string;
  readonly sourceCommit: string;
  readonly packageVersion: string;
  readonly unityVersion: string;
  readonly exportedAtUtc: string;
  readonly bodies: readonly AxieExporterBodyRecord[];
  readonly parts: readonly AxieExporterPartRecord[];
  readonly addons: readonly AxieExporterAddonRecord[];
  readonly materials: readonly AxieExporterMaterialRecord[];
  readonly textures: readonly AxieExporterTextureRecord[];
  readonly shaders: readonly AxieExporterShaderRecord[];
  readonly animationClips: readonly AxieExporterAnimationClipRecord[];
  readonly coverage: AxieExporterCoverageRecord;
  readonly errors: readonly AxieExporterErrorRecord[];
}

export interface AxieExporterBodyRecord {
  readonly id: string;
  readonly resourcePath: string;
  readonly sourceAssetPath: string;
  readonly prefabName: string;
  readonly prefabAssetPath: string;
  readonly prefabMeshId: string;
  readonly skeletonRoot: string;
  readonly restPoseUrl?: string;
  readonly lods: readonly AxieExporterLodRecord[];
  readonly attachPoints: readonly AxieExporterAttachPointRecord[];
  readonly rendererMaterials: readonly string[];
  readonly liteAnimations: readonly string[];
  readonly fullAnimations: readonly string[];
}

export interface AxieExporterRestPoseV1 {
  readonly schemaVersion: 1;
  readonly body: string;
  readonly rootName: string;
  readonly transforms: readonly AxieExporterRestTransformRecord[];
}

export interface AxieExporterRestTransformRecord {
  /** Unity AnimationUtility path relative to the body prefab root; root is ''. */
  readonly path: string;
  readonly parentPath: string;
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly scale: readonly [number, number, number];
}

export interface AxieExporterAttachPointRecord {
  readonly rig: string;
  readonly nodeName: string;
  readonly path: string;
}

export interface AxieExporterPartRecord {
  readonly id: string;
  readonly sourceAssetPath: string;
  readonly sourceGuid: string;
  readonly skin: number;
  readonly partClass: string;
  readonly variant: number;
  readonly level: number;
  readonly partType: string;
  readonly file: string;
  readonly rigs: readonly AxieExporterRigRecord[];
}

export interface AxieExporterRigRecord {
  readonly type: string;
  readonly attachNode: string;
  readonly prefabName: string;
  readonly prefabAssetPath: string;
  readonly materialId: string;
  readonly lods: readonly AxieExporterLodRecord[];
}

export interface AxieExporterLodRecord {
  readonly index: number;
  readonly file: string;
  readonly sceneNode: string;
  readonly meshId: string;
  readonly meshName: string;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly triangleCount: number;
  readonly subMeshCount: number;
  readonly blendShapeCount: number;
  readonly bindPoseCount: number;
  readonly readable: boolean;
  /** Round-trip numeric strings emitted with C#'s `R` format. */
  readonly boundsCenter: readonly string[];
  readonly boundsSize: readonly string[];
  readonly contentHash: string;
}

export interface AxieExporterMaterialRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceAssetPath: string;
  readonly sourceGuid: string;
  readonly shaderId: string;
  readonly shaderName: string;
  readonly renderQueue: number;
  readonly renderType: string;
  readonly enableInstancing: boolean;
  readonly doubleSidedGi: boolean;
  readonly globalIlluminationFlags: string;
  readonly keywords: readonly string[];
  readonly properties: readonly AxieExporterMaterialPropertyRecord[];
  readonly contentHash: string;
}

export interface AxieExporterMaterialPropertyRecord {
  readonly name: string;
  readonly displayName: string;
  readonly type: string;
  readonly value: readonly string[];
  readonly textureId: string;
  readonly textureScale: readonly string[];
  readonly textureOffset: readonly string[];
}

export interface AxieExporterTextureRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceAssetPath: string;
  readonly sourceGuid: string;
  readonly width: number;
  readonly height: number;
  readonly dimension: string;
  readonly format: string;
  readonly colorSpace: string;
  readonly hasAlpha: boolean;
  readonly mipmaps: boolean;
  readonly wrapU: string;
  readonly wrapV: string;
  readonly filterMode: string;
  readonly anisoLevel: number;
  readonly sourceFile: string;
  readonly contentHash: string;
}

export interface AxieExporterShaderRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceAssetPath: string;
  readonly sourceType: string;
  readonly sourceFile: string;
  readonly contentHash: string;
}

export interface AxieExporterAddonRecord {
  readonly id: string;
  readonly sourceFolder: string;
  readonly materialOverrides: readonly AxieExporterAddonMaterialRecord[];
  readonly attachments: readonly AxieExporterAddonAttachmentRecord[];
}

export interface AxieExporterAddonMaterialRecord {
  readonly lookupName: string;
  readonly materialId: string;
  readonly sourceAssetPath: string;
}

export interface AxieExporterAddonAttachmentRecord {
  readonly id: string;
  readonly name: string;
  readonly sourceAssetPath: string;
  readonly file: string;
  readonly components: readonly AxieExporterComponentRecord[];
  readonly rendererMaterials: readonly string[];
  readonly meshIds: readonly string[];
  readonly contentHash: string;
}

export interface AxieExporterComponentRecord {
  readonly path: string;
  readonly nodeName: string;
  readonly type: string;
  readonly enabled: boolean;
  readonly payload: string;
}

/**
 * Declares exactly which local transform basis the sampled values use.
 *
 * Raw Unity exporter payloads are source-local and need the authoritative
 * source-rest to target-rest change of basis. A sealed target-local payload
 * has already had that conversion applied against the shipped body GLB and
 * must be bound verbatim; applying the retarget a second time is corruption.
 */
export type AxieAnimationCoordinateSpace =
  | 'unity-source-local-v1'
  | 'target-glb-local-v1';

export interface AxieExporterAnimationClipRecord {
  readonly id: string;
  readonly body: string;
  readonly set: string;
  readonly sourceName: string;
  /** Missing only on legacy exporter JSON, where source-local is implied. */
  readonly coordinateSpace?: AxieAnimationCoordinateSpace;
  readonly sourceAssetId: string;
  readonly sourceAssetPath: string;
  readonly duration: number;
  readonly sourceFrameRate: number;
  readonly sampleRate: number;
  readonly wrapMode: string;
  readonly legacy: boolean;
  readonly looping: boolean;
  readonly curveCount: number;
  readonly objectCurveCount: number;
  readonly eventCount: number;
  readonly trackCount: number;
  readonly file: string;
  readonly contentHash: string;
  readonly payloadHash: string;
}

export interface AxieExporterAnimationPayloadV1 {
  readonly schemaVersion: 1;
  readonly metadata: AxieExporterAnimationClipRecord;
  readonly sampleTimes: readonly number[];
  readonly transformTracks: readonly AxieExporterTransformTrackRecord[];
  readonly curves: readonly AxieExporterAnimationCurveRecord[];
  readonly objectCurves: readonly AxieExporterObjectCurveRecord[];
  readonly events: readonly AxieExporterAnimationEventRecord[];
}

export interface AxieExporterTransformTrackRecord {
  /** Unity AnimationUtility path relative to the exported prefab root. */
  readonly path: string;
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly scale: readonly number[];
}

export interface AxieExporterAnimationCurveRecord {
  readonly path: string;
  readonly property: string;
  readonly targetType: string;
  readonly preWrapMode: string;
  readonly postWrapMode: string;
  readonly keys: readonly AxieExporterCurveKeyRecord[];
}

export interface AxieExporterCurveKeyRecord {
  readonly time: number;
  readonly value: number;
  readonly inTangent: number;
  readonly outTangent: number;
  readonly inWeight: number;
  readonly outWeight: number;
  readonly weightedMode: number;
}

export interface AxieExporterObjectCurveRecord {
  readonly path: string;
  readonly property: string;
  readonly targetType: string;
  readonly keys: readonly AxieExporterObjectCurveKeyRecord[];
}

export interface AxieExporterObjectCurveKeyRecord {
  readonly time: number;
  readonly assetId: string;
  readonly assetPath: string;
}

export interface AxieExporterAnimationEventRecord {
  readonly time: number;
  readonly functionName: string;
  readonly stringParameter: string;
  readonly floatParameter: number;
  readonly intParameter: number;
  readonly objectParameterId: string;
}

/** Optional shipping container for many raw exporter payloads. */
export interface AxieSampledAnimationBundleV1 {
  readonly schemaVersion: 1;
  readonly body?: string;
  readonly set?: string;
  readonly clips: readonly AxieExporterAnimationPayloadV1[];
}

/** Optional small index format; file URLs resolve relative to the index URL. */
export interface AxieSampledAnimationIndexV1 {
  readonly schemaVersion: 1;
  readonly body?: string;
  readonly set?: string;
  readonly files: readonly string[];
}

export interface AxieExporterCoverageRecord {
  readonly expectedBodies: number;
  readonly exportedBodies: number;
  readonly expectedParts: number;
  readonly exportedParts: number;
  readonly expectedRigs: number;
  readonly exportedRigs: number;
  readonly expectedPartLods: number;
  readonly exportedPartLods: number;
  readonly expectedBodyAnimations: number;
  readonly exportedBodyAnimations: number;
  readonly expectedSourceAnimationFiles: number;
  readonly exportedSourceAnimationFiles: number;
  readonly expectedMaterials: number;
  readonly exportedMaterials: number;
  readonly expectedTextures: number;
  readonly exportedTextures: number;
  readonly expectedShaders: number;
  readonly exportedShaders: number;
  readonly expectedAddonFolders: number;
  readonly exportedAddonFolders: number;
  readonly expectedAddonPrefabs: number;
  readonly exportedAddonPrefabs: number;
  readonly complete: boolean;
}

export interface AxieExporterErrorRecord {
  readonly category: string;
  readonly assetId: string;
  readonly message: string;
  readonly fatal: boolean;
}

export function isAxieExporterAnimationPayloadV1(
  value: unknown,
): value is AxieExporterAnimationPayloadV1 {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AxieExporterAnimationPayloadV1>;
  return candidate.schemaVersion === 1
    && Array.isArray(candidate.sampleTimes)
    && Array.isArray(candidate.transformTracks)
    && !!candidate.metadata
    && typeof candidate.metadata.sourceName === 'string';
}
