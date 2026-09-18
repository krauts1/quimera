import type { AxiePartAssetId, AxieRigType } from './domain';
import type { AxieAnimationSet, AxieShaderFidelity } from './manifest';
import type { AxieQualityId } from './quality';

export type AxieDiagnosticSeverity = 'info' | 'warning' | 'error';

export type AxieDiagnosticCode =
  | 'manifest-invalid'
  | 'source-inventory-mismatch'
  | 'genes-invalid'
  | 'body-missing'
  | 'part-missing'
  | 'attach-node-missing'
  | 'lod-clamped'
  | 'texture-variant-fallback'
  | 'texture-missing'
  | 'shader-missing'
  | 'shader-fallback'
  | 'material-missing'
  | 'addon-missing'
  | 'animation-missing'
  | 'animation-track-unbound'
  | 'weapon-missing'
  | 'weapon-anchor-missing'
  | 'weapon-basis-missing'
  | 'weapon-load-failed'
  | 'load-aborted'
  | 'webgl-context-lost';

export interface AxieDiagnosticEvent {
  readonly severity: AxieDiagnosticSeverity;
  readonly code: AxieDiagnosticCode;
  readonly message: string;
  readonly assetId?: string;
  readonly details?: Readonly<Record<string, string | number | boolean | null>>;
}

export interface AxieRigResolutionDiagnostics {
  readonly partId: AxiePartAssetId;
  readonly rigType: AxieRigType;
  readonly requestedLod: number;
  readonly resolvedLod: number;
  readonly attachNode: string;
  readonly attached: boolean;
}

export interface AxieShaderResolutionDiagnostics {
  readonly materialId: string;
  readonly shaderId: string;
  readonly fidelity: AxieShaderFidelity;
  readonly fallbackUsed: boolean;
}

export interface AxieAssemblyDiagnostics {
  readonly descriptorKey: string;
  readonly quality: AxieQualityId;
  readonly animationSet: AxieAnimationSet;
  readonly requestedLod: number;
  readonly bodyResolvedLod: number;
  readonly rigs: readonly AxieRigResolutionDiagnostics[];
  readonly shaders: readonly AxieShaderResolutionDiagnostics[];
  readonly missingParts: readonly AxiePartAssetId[];
  readonly events: readonly AxieDiagnosticEvent[];
  readonly loadDurationMs: number;
  readonly ready: boolean;
}

export interface AxieCacheDiagnostics {
  readonly entries: number;
  readonly activeLeases: number;
  readonly inFlightLoads: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly estimatedBytes: number;
}

export interface AxieRendererDiagnostics {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly geometries: number;
  readonly textures: number;
  readonly shaderPrograms: number;
}

export interface AxieParityMeasurement {
  readonly fixtureId: string;
  readonly unityImage: string;
  readonly threeImage: string;
  readonly ssim: number;
  readonly meanDeltaE: number;
  readonly maxDeltaE: number;
  readonly passed: boolean;
}

export interface AxieCoverageReport {
  readonly sourceCommit: string;
  readonly bodyCoverage: Readonly<{ expected: number; exported: number }>;
  readonly partDescriptorCoverage: Readonly<{ expected: number; exported: number }>;
  readonly rigCoverage: Readonly<{ expected: number; exported: number }>;
  readonly lodCoverage: Readonly<{ expected: number; exported: number }>;
  readonly materialCoverage: Readonly<{ expected: number; ported: number }>;
  readonly shaderCoverage: Readonly<{ expected: number; ported: number }>;
  readonly addonCoverage: Readonly<{ expected: number; exported: number }>;
  readonly animationCoverage: Readonly<{ expected: number; exported: number }>;
  readonly failures: readonly AxieDiagnosticEvent[];
  readonly complete: boolean;
}

export interface AxieDiagnosticsSink {
  emit(event: AxieDiagnosticEvent): void;
}

/** Stable browser-test surface written onto the game shell's dataset. */
export interface AxieDatasetDiagnostics {
  readonly axieReady: 'true' | 'false';
  readonly axieDescriptorKey: string;
  readonly axieQuality: AxieQualityId;
  readonly axieRequestedLod: string;
  readonly axieBodyLod: string;
  readonly axieRigCount: string;
  readonly axieAnimationSet: AxieAnimationSet;
  readonly axieAnimationCount: string;
  readonly axieWeapon: string;
  readonly axieWeaponLoading: string;
  readonly axieWeaponCount: string;
  readonly axieWeaponAvailable: string;
  readonly axieMissingParts: string;
  readonly axieShaderFallbacks: string;
  readonly axieCacheEntries: string;
  readonly axieCacheLeases: string;
  readonly axieCacheInFlight: string;
  readonly axieCacheHits: string;
  readonly axieCacheMisses: string;
  readonly axieCacheEvictions: string;
  readonly axieCacheBytes: string;
  readonly axieLoadMs: string;
  readonly axieDrawCalls: string;
  readonly axieTriangles: string;
  readonly axieGeometries: string;
  readonly axieTextures: string;
  readonly axiePrograms: string;
  readonly axieWebglContext: 'ready' | 'lost' | 'restored';
}
