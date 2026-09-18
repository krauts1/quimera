import type {
  AxieBodyType,
  AxieDescriptor,
  AxieGeneClass,
  AxiePartAssetId,
  AxiePartDescriptor,
  AxiePartType,
  AxieRigType,
} from './domain';
import type { AxieAnimationCoordinateSpace } from './exporter-schema';

export const AXIE_MANIFEST_SCHEMA_VERSION = 2 as const;

export type AxieAnimationSet = 'lite' | 'full';
export type AxiePartCoordinateSpace = 'part-export' | 'body-rest' | 'socket-local';
export type AxieTextureVariant = 'unity-import' | 'source' | 'ktx2-uastc' | 'ktx2-etc1s';
export type AxieColorSpace = 'srgb' | 'linear';
export type AxieTextureFilterMode = 'point' | 'bilinear' | 'trilinear';
export type AxieShaderFidelity = 'exact' | 'source-faithful' | 'enhanced' | 'unsupported';

export type AxieVector3Tuple = readonly [x: number, y: number, z: number];
export type AxieVector4Tuple = readonly [x: number, y: number, z: number, w: number];
export type AxieMatrix4Tuple = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];
export type AxieJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly AxieJsonValue[]
  | { readonly [key: string]: AxieJsonValue };

export interface AxieBoundsManifest {
  readonly min: AxieVector3Tuple;
  readonly max: AxieVector3Tuple;
}

export interface AxieSourceInventoryManifest {
  readonly bodyDescriptors: number;
  readonly partDescriptors: number;
  readonly partRigs: number;
  readonly partLodMeshes: number;
  readonly bodySourceAnimations: number;
  readonly partSourceAnimations: number;
  readonly prefabs: number;
  readonly meshes: number;
  readonly textures: number;
  readonly materials: number;
  readonly shaderFiles: number;
  readonly shaderGraphs: number;
  readonly addonFolders: number;
  readonly addonPrefabs: number;
  readonly addonMaterials: number;
}

/** Portable, hash-sealed provenance for an additive final art-team delivery. */
export interface AxieFinalUnitySourceExtensionManifest {
  readonly schemaVersion: number;
  readonly generatedBy: string;
  readonly coordinateSpace: AxiePartCoordinateSpace;
  readonly contentHash: string;
  readonly [key: string]: AxieJsonValue;
}

export interface AxieLatestUnityWeaponSourceArchiveManifest {
  readonly fileName: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface AxieLatestUnityWeaponHashedPathManifest {
  readonly path: string;
  readonly sha256: string;
}

/** Hash-sealed provenance for the latest art-team weapon delivery. */
export interface AxieLatestUnityWeaponParityManifest {
  readonly schemaVersion: 1;
  readonly generatedBy: string;
  readonly sourceCatalog: Readonly<{
    readonly path: string;
    readonly fileSha256: string;
    readonly contentHash: string;
    readonly snapshot: string;
    readonly sourceArchives: Readonly<Record<'body' | 'weapon', AxieLatestUnityWeaponSourceArchiveManifest>>;
  }>;
  readonly conversionReports: readonly AxieLatestUnityWeaponHashedPathManifest[];
  readonly attachmentConfig: AxieLatestUnityWeaponHashedPathManifest;
  readonly inputManifest: AxieLatestUnityWeaponHashedPathManifest;
  readonly coverage: Readonly<{
    readonly riggedFamilies: readonly string[];
    readonly staticFamilies: readonly string[];
    readonly totalFamilies: number;
    readonly totalVariants: number;
  }>;
  readonly generated: Readonly<{
    readonly familyIds: readonly string[];
    readonly variantIds: readonly string[];
    readonly urls: readonly string[];
    readonly contentHashes: readonly string[];
  }>;
  readonly contentHash: string;
}

/** Hash-sealed output summary for the Unity MeshFilter socket-local bake. */
export interface AxieSocketLocalPartParityManifest {
  readonly schemaVersion: 1;
  readonly generatedBy: string;
  readonly sourceFactory: Readonly<{
    readonly repository: string;
    readonly commit: string;
    readonly path: 'Runtime/AxieFactory.cs';
    readonly sha256: string;
    readonly contract: 'SetParent(attachPoint,false)+sharedMesh';
  }>;
  readonly inputManifestSha256: string;
  readonly partCount: number;
  readonly rigCount: number;
  readonly lodCount: number;
  readonly outputFileCount: number;
  readonly referenceBodies: readonly AxieBodyType[];
  readonly outputAggregateSha256: string;
  readonly contentHash: string;
}

export interface AxieSourceManifest {
  readonly repository: string;
  readonly commit: string;
  readonly packageVersion: string;
  readonly unityVersion: string;
  readonly exportedAt: string;
  readonly exporterVersion: string;
  readonly contentHash: string;
  readonly inventory: AxieSourceInventoryManifest;
  /** Source-backed S01-S12 special-family extension. */
  readonly finalUnityParity?: AxieFinalUnitySourceExtensionManifest;
  /** Source-backed S00 geometry/texture replacement and explicit fallbacks. */
  readonly finalUnityStandardParity?: AxieFinalUnitySourceExtensionManifest;
  /** Source-backed latest weapon models and body-support inventory. */
  readonly latestUnityWeaponParity: AxieLatestUnityWeaponParityManifest;
  /** Baked art-team body/weapon-motion delivery compiled without inferred retarget offsets. */
  readonly animBodyFbx?: AxieFinalUnitySourceExtensionManifest;
  /** Exact source-authored Flag/Talisman/Tome weapon-local deformation clips. */
  readonly pairedWeaponAnimationParity?: AxieFinalUnitySourceExtensionManifest;
  /** Offline conversion from exporter/body-rest surfaces to Unity socket-local meshes. */
  readonly socketLocalPartParity?: AxieSocketLocalPartParityManifest;
}

export interface AxieColorVariantManifest {
  readonly index: number;
  readonly key: string;
  readonly skin: number;
  readonly class: string;
  readonly colorValue: number;
  readonly primary1: string;
  readonly shaded1: string;
  readonly primary2: string;
  readonly shaded2: string;
  readonly line: string;
  readonly partColorShift: string;
}

/** Raw legacy catalog row retained for audit; availability comes from assets.parts. */
export interface AxieLegacyPartCatalogManifest {
  readonly class: string;
  readonly partType: string;
  readonly partValue: number;
  readonly skins: readonly string[];
  readonly skinsLv2: readonly string[];
}

export interface AxieCreatorCatalogManifest {
  readonly colorVariants: readonly AxieColorVariantManifest[];
  readonly bodyIds: readonly AxieBodyType[];
  readonly partIdsByType: Readonly<Record<AxiePartType, readonly AxiePartAssetId[]>>;
  readonly legacyPartRows: readonly AxieLegacyPartCatalogManifest[];
}

export interface AxieLodManifest {
  /** Unity list index passed through AxieInstantiationParams.lodLevel. */
  readonly sourceLod: number;
  readonly url: string;
  readonly sceneNode: string;
  readonly meshName: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly bounds: AxieBoundsManifest;
  readonly contentHash: string;
  /**
   * `socket-local` is the production Unity MeshFilter contract: geometry is
   * already expressed in its Root_*_JNT local space and the renderable node is
   * parented with identity-local TRS. `part-export` is the retained original
   * standalone Unity/FBX attachment basis.
   * `body-rest` means vertices were baked into the complete Axie rest frame
   * and is retained only as conversion provenance.
   * Omitted values retain the original `part-export` behavior.
   */
  readonly coordinateSpace?: AxiePartCoordinateSpace;
  /**
   * Source gallery body whose rest socket framed this baked body-rest mesh.
   * Required for `body-rest`; absent for legacy `part-export` rows.
   */
  readonly bodyRestReferenceBody?: AxieBodyType;
  /** Exact immutable receipt for an offline `socket-local` geometry bake. */
  readonly socketLocalBake?: Readonly<{
    readonly schemaVersion: 1;
    readonly generatedBy: string;
    readonly sourceUrl: string;
    readonly sourceSceneNode: string;
    readonly sourceMeshName: string;
    readonly sourceBounds: AxieBoundsManifest;
    readonly sourceContentHash: string;
    readonly sourceCoordinateSpace: 'part-export' | 'body-rest';
    readonly sourceCoordinateSpaceExplicit: boolean;
    readonly sourceBodyRestReferenceBody?: AxieBodyType;
    readonly sourceFileSha256: string;
    readonly referenceBody: AxieBodyType;
    readonly referenceBodyUrl: string;
    readonly referenceBodyFileSha256: string;
    readonly referenceRestPoseUrl: string;
    readonly referenceRestPoseSha256: string;
    readonly attachNode: string;
    readonly bakeMatrix: AxieMatrix4Tuple;
    readonly bakeMatrixSha256: string;
    readonly objectUnitsPerMeter: number;
    readonly outputFileSha256: string;
    readonly outputGeometrySha256: string;
    readonly referenceWorldMaxError: number;
  }>;
}

export interface AxieAnimationClipManifest {
  /** For example Default.Idle, Sword.Attack, or Action.CutTree. */
  readonly sourceName: string;
  /** Unique glTF/Three name, normally `${set}:${sourceName}`. */
  readonly runtimeName: string;
  readonly duration: number;
  readonly trackCount: number;
  readonly looping: boolean;
  readonly contentHash: string;
}

export interface AxieAnimationBundleManifest {
  readonly set: AxieAnimationSet;
  readonly url: string;
  readonly coordinateSpace: AxieAnimationCoordinateSpace;
  readonly clips: readonly AxieAnimationClipManifest[];
  readonly contentHash: string;
}

export interface AxieBodyAssetManifest {
  readonly id: string;
  readonly body: AxieBodyType;
  readonly sceneRootName: string;
  readonly skeletonRootName: string;
  /** Authoritative Unity prefab local TRS used to retarget AXANIM onto FBX/glTF bones. */
  readonly restPoseUrl: string;
  /** Mesh already present on the exported body before Unity-style LOD replacement. */
  readonly prefabLod: number;
  readonly lods: readonly AxieLodManifest[];
  readonly materialId: string;
  readonly attachNodes: Readonly<Partial<Record<AxieRigType, string>>>;
  readonly weaponAttachNodes: Readonly<Partial<Record<'left' | 'right', string>>>;
  readonly animations: Readonly<Record<AxieAnimationSet, AxieAnimationBundleManifest>>;
  readonly bounds: AxieBoundsManifest;
}

export interface AxiePartRigManifest {
  readonly type: AxieRigType;
  readonly attachNode: string;
  readonly sourcePrefabName: string;
  readonly lods: readonly AxieLodManifest[];
  readonly materialId: string;
  readonly addonId?: string;
}

export interface AxiePartAssetManifest {
  /** Exact Unity Resources key, such as S00_Beast02_L1_Eye. */
  readonly id: AxiePartAssetId;
  /** Exported Resources parts always have a concrete, loadable class name. */
  readonly descriptor: AxiePartDescriptor & { readonly class: AxieGeneClass };
  readonly rigs: readonly AxiePartRigManifest[];
  readonly contentHash: string;
}

export interface AxieTextureMipLevelManifest {
  readonly level: number;
  readonly width: number;
  readonly height: number;
  /** Lossless Unity-decoded fallback for browsers without BC1+sRGB support. */
  readonly url: string;
  readonly byteLength: number;
  readonly contentHash: string;
  /** Byte range inside `rawUrl`, retained for the exact compressed path. */
  readonly rawOffset: number;
  readonly rawByteLength: number;
}

export interface AxieTextureMipChainManifest {
  readonly sourceFormat: 'bc1-rgb' | 'bc3-rgba' | 'bc7-rgba';
  readonly unityVersion: string;
  readonly colorSpace: AxieColorSpace;
  /** Untouched bytes returned by Unity Texture2D.GetRawTextureData. */
  readonly unityRawUrl: string;
  readonly unityRawByteLength: number;
  readonly unityRawContentHash: string;
  /** BC7 cannot be losslessly Y-transformed blockwise, so it uses decoded PNG levels. */
  readonly rawTransport: 's3tc-gpu' | 'decoded-png-only';
  /** Lossless coordinate transform applied to the browser upload payload. */
  readonly rawTransform:
    | 'bc1-flip-y-block-and-selector-rows-v1'
    | 'bc3-flip-y-block-alpha-and-color-selector-rows-v1'
    | 'unity-decoded-png-levels-v1';
  /** WebGL-oriented S3TC bytes; endpoints/selectors are never recompressed. */
  readonly rawUrl?: string;
  readonly rawByteLength?: number;
  readonly rawContentHash?: string;
  readonly decodedContentHash: string;
  readonly levels: readonly AxieTextureMipLevelManifest[];
  readonly contentHash: string;
}

export interface AxieTextureManifest {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly colorSpace: AxieColorSpace;
  readonly hasAlpha: boolean;
  /** `axie-v4-mask` means alpha is both cutout and primary/secondary color data. */
  readonly alphaSemantic: 'opacity' | 'axie-v4-mask' | 'data' | 'none';
  readonly mipmaps: boolean;
  /** Authored Unity TextureImporter.filterMode, preserved for exact sampling parity. */
  readonly filterMode: AxieTextureFilterMode;
  readonly wrapS: 'repeat' | 'clamp' | 'mirror';
  readonly wrapT: 'repeat' | 'clamp' | 'mirror';
  readonly sourceBitDepth: number;
  readonly variants: Readonly<Partial<Record<AxieTextureVariant, string>>>;
  /** Unity-authored mip payload; never regenerated from level zero in WebGL. */
  readonly unityMipChain?: AxieTextureMipChainManifest;
  readonly contentHash: string;
  readonly unityContentHash?: string;
}

export interface AxieRenderStateManifest {
  readonly side: 'front' | 'back' | 'double';
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly alphaCutoff: number;
  readonly blend: 'opaque' | 'alpha' | 'additive' | 'multiply';
  readonly renderOrder: number;
  readonly stencil?: Readonly<{
    reference: number;
    compare: string;
    pass: string;
    fail: string;
    depthFail: string;
  }>;
}

export interface AxieMaterialManifest {
  readonly id: string;
  readonly sourceName: string;
  readonly shaderId: string;
  readonly keywords: readonly string[];
  readonly textures: Readonly<Record<string, string>>;
  readonly properties: Readonly<Record<string, AxieJsonValue>>;
  readonly renderState: AxieRenderStateManifest;
  readonly geometryOutline: Readonly<{
    enabled: boolean;
    thickness: number;
    color: AxieVector4Tuple;
  }>;
  readonly contentHash: string;
}

export interface AxieShaderManifest {
  readonly id: string;
  readonly sourceName: string;
  readonly sourceFiles: readonly string[];
  readonly runtimeImplementation: string;
  readonly fidelity: AxieShaderFidelity;
  readonly requiredTextures: readonly string[];
  readonly requiredProperties: readonly string[];
  readonly requiredExtensions: readonly string[];
  readonly contentHash: string;
}

export interface AxieAddonAttachmentManifest {
  readonly id: string;
  readonly url: string;
  readonly sceneNode: string;
  readonly renderOrder: number;
  readonly contentHash: string;
}

export interface AxieAddonManifest {
  /** Exact folder key used by AxieFactory.GetAddons. */
  readonly id: string;
  readonly materialOverrides: Readonly<Record<string, string>>;
  readonly attachments: readonly AxieAddonAttachmentManifest[];
}

/** Exact source-authored weapon payload selectable through `equipWeapon(id)`. */
export interface AxieWeaponVariantManifest {
  readonly id: string;
  readonly label?: string;
  readonly level?: number;
  readonly outlineMode?: 'outline' | 'no-outline';
  readonly url: string;
  readonly contentHash: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly textureSourceFile: string;
  readonly textureSha256: string;
  readonly meshNames: readonly string[];
  readonly armatureCount: number;
  readonly skeletonSignature?: string;
  readonly requiredBones?: readonly string[];
  /** Exact Unity Flag prefab composition inputs; absent for non-composite variants. */
  readonly compositeSources?: readonly Readonly<{
    readonly role: string;
    readonly variantId?: string;
    readonly contentHash?: string;
    readonly sourceFile?: string;
    readonly sourceSha256?: string;
    readonly convertedInputHash?: string;
  }>[];
  /** Bodies with exact source-authored family motion and required attachment sockets. */
  readonly supportedBodyIds: readonly AxieBodyType[];
}

export type AxieWeaponPairedAnimationState = 'Idle' | 'Walk' | 'Run' | 'Attack' | 'Skill';

export interface AxieWeaponPairedAnimationClipManifest {
  readonly url: string;
  readonly contentHash: string;
  readonly sourceFile: string;
  readonly sourceSha256: string;
  readonly duration: number;
  readonly looping: boolean;
  readonly requiredBones: readonly string[];
  readonly animatedBones: readonly string[];
}

export interface AxieWeaponPairedAnimationSetManifest {
  readonly schemaVersion: 1;
  readonly clips: Readonly<Record<
    AxieWeaponPairedAnimationState,
    AxieWeaponPairedAnimationClipManifest
  >>;
}

export interface AxieWeaponManifest {
  readonly id: string;
  readonly label: string;
  readonly url: string;
  readonly attach: 'left' | 'right' | 'both';
  readonly mirrorLeft: boolean;
  readonly animationPrefix: string;
  /** Exact source-name prefixes that imply this weapon in exported clips. */
  readonly clipPrefixes: readonly string[];
  /** How equipped locomotion resolves Idle/Walk/Run without inventing clips. */
  readonly locomotionStyle: 'controller' | 'action';
  /** Bodies containing at least one exact clip for this authored weapon. */
  readonly supportedBodyIds: readonly AxieBodyType[];
  readonly sourceClipCount: number;
  readonly sourceKind: 'unity-sample-rig' | 'expanded-rigid' | 'source-static';
  /** AnimatorSample weaponPrefabs order; null for expanded-only families. */
  readonly sampleOrder: number | null;
  readonly sourceFile: string;
  readonly textureSourceFile: string;
  readonly sourceSha256: string;
  readonly textureSha256: string;
  readonly textureEmbedded: boolean;
  readonly meshNames: readonly string[];
  readonly armatureCount: number;
  readonly contentHash: string;
  /** Present only when current source bytes author a separate weapon Animator. */
  readonly pairedAnimations?: AxieWeaponPairedAnimationSetManifest;
  /** Executable source inventory in stable presentation order. */
  readonly variants: readonly AxieWeaponVariantManifest[];
  /** Stable variant selected by clients when a family-level variant is not specified. */
  readonly defaultVariantId: string;
}

export interface AxieAssetManifest {
  readonly bodies: Readonly<Record<AxieBodyType, AxieBodyAssetManifest>>;
  readonly parts: Readonly<Record<AxiePartAssetId, AxiePartAssetManifest>>;
  readonly textures: Readonly<Record<string, AxieTextureManifest>>;
  readonly materials: Readonly<Record<string, AxieMaterialManifest>>;
  readonly shaders: Readonly<Record<string, AxieShaderManifest>>;
  readonly addons: Readonly<Record<string, AxieAddonManifest>>;
  readonly weapons: Readonly<Record<string, AxieWeaponManifest>>;
}

export interface AxieMixerManifest {
  readonly schemaVersion: typeof AXIE_MANIFEST_SCHEMA_VERSION;
  readonly source: AxieSourceManifest;
  readonly coordinateSystem: Readonly<{
    upAxis: 'Y';
    forwardAxis: '+Z' | '-Z';
    unitsPerMeter: number;
  }>;
  readonly creator: AxieCreatorCatalogManifest;
  readonly assets: AxieAssetManifest;
  readonly referenceDescriptors: readonly AxieDescriptor[];
}

/** Resolve the source-authored socket frame for one body-rest part asset. */
export function resolveAxieBodyRestReferenceBody(
  lod: AxieLodManifest,
  partId: AxiePartAssetId,
): AxieBodyType {
  if ((lod.coordinateSpace ?? 'part-export') !== 'body-rest') {
    throw new Error(`Axie part ${partId} is not body-rest geometry.`);
  }
  if (!lod.bodyRestReferenceBody) {
    throw new Error(`Axie body-rest part ${partId} has no source reference body.`);
  }
  return lod.bodyRestReferenceBody;
}

export interface AxieManifestLoader {
  load(url: string, signal?: AbortSignal): Promise<AxieMixerManifest>;
}
