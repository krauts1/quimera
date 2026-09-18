import type {
  AxieBodyType,
  AxieDescriptor,
  AxiePartAssetId,
  AxiePartType,
  AxieUnsupportedGeneClass,
} from './domain';
import type {
  AxieColorVariantManifest,
  AxiePartAssetManifest,
} from './manifest';
import type { AxieArtMode } from './runtime';
import type { AxieQualityId } from './quality';

export const AXIE_CREATOR_URL_VERSION = 1 as const;

/** Prefixed keys avoid collisions with Male A's existing skin/hair/outfit params. */
export const AXIE_CREATOR_QUERY_KEYS = Object.freeze({
  character: 'character',
  version: 'axieV',
  genes: 'axieGenes',
  body: 'axieBody',
  color: 'axieColor',
  back: 'axieBack',
  ear: 'axieEar',
  eye: 'axieEye',
  horn: 'axieHorn',
  mouth: 'axieMouth',
  tail: 'axieTail',
  quality: 'axieQuality',
  art: 'axieArt',
  studio: 'axieStudio',
} as const);

export type AxiePartSelection = Readonly<Record<AxiePartType, AxiePartAssetId>>;

export interface AxieCreatorPreferences {
  readonly quality: AxieQualityId;
  readonly artMode: AxieArtMode;
  readonly studioOpen: boolean;
}

export interface AxieManualCreatorState extends AxieCreatorPreferences {
  readonly mode: 'manual';
  readonly descriptor: AxieDescriptor;
  /** Exactly one manifest-backed part per creator slot. */
  readonly parts: AxiePartSelection;
}

export interface AxieGenesCreatorState extends AxieCreatorPreferences {
  readonly mode: 'genes';
  readonly genes: string;
  readonly descriptor: AxieDescriptor;
  /** Unknown 5-bit class codes preserved as null by Unity compatibility mode. */
  readonly unsupportedClasses: readonly AxieUnsupportedGeneClass[];
  /** Hybrid or unavailable genes can leave a slot unresolved. */
  readonly resolvedParts: Readonly<Partial<Record<AxiePartType, AxiePartAssetId>>>;
}

export type AxieCreatorState = AxieManualCreatorState | AxieGenesCreatorState;

export interface AxieCreatorBodyOption {
  readonly id: AxieBodyType;
  readonly label: string;
  readonly previewUrl?: string;
  readonly available: boolean;
}

export interface AxieCreatorColorOption extends AxieColorVariantManifest {
  /** False only for catalog colors not usable by the exported mixer. */
  readonly available: boolean;
}

export interface AxieCreatorPartOption {
  readonly id: AxiePartAssetId;
  readonly asset: AxiePartAssetManifest;
  readonly label: string;
  readonly previewUrl?: string;
  readonly available: boolean;
}

export interface AxieCreatorCatalog {
  readonly bodies: readonly AxieCreatorBodyOption[];
  readonly colors: readonly AxieCreatorColorOption[];
  readonly parts: Readonly<Record<AxiePartType, readonly AxieCreatorPartOption[]>>;
}

export interface AxieCreatorStateCodec {
  read(parameters: URLSearchParams): AxieCreatorState | undefined;
  /** Same parser with a stable reason for rejected/restoration URLs. */
  readDetailed(parameters: URLSearchParams): AxieCreatorStateReadResult;
  write(parameters: URLSearchParams, state: AxieCreatorState): URLSearchParams;
}

export type AxieCreatorUrlErrorCode =
  | 'not-axie'
  | 'unsupported-version'
  | 'invalid-quality'
  | 'invalid-art-mode'
  | 'invalid-genes'
  | 'incomplete-manual-state'
  | 'invalid-body'
  | 'invalid-color'
  | 'invalid-part';

export type AxieCreatorStateReadResult =
  | { readonly ok: true; readonly state: AxieCreatorState }
  | {
    readonly ok: false;
    readonly code: AxieCreatorUrlErrorCode;
    readonly message: string;
    readonly queryKey?: string;
    readonly genesErrorCode?: string;
  };

export type AxieCreatorChangeReason =
  | 'body'
  | 'color'
  | 'part'
  | 'genes'
  | 'quality'
  | 'art-mode'
  | 'reset'
  | 'external';

export interface AxieCreatorChangeEvent {
  readonly state: AxieCreatorState;
  readonly reason: AxieCreatorChangeReason;
  readonly changedPart?: AxiePartType;
}

/** DOM UI boundary; implementation owns no Three.js objects. */
export interface AxieCreatorController {
  readonly isOpen: boolean;
  readonly state: AxieCreatorState;
  readonly catalog: AxieCreatorCatalog;
  open(): void;
  close(options?: { readonly restoreFocus?: boolean }): void;
  setState(state: AxieCreatorState, options?: { readonly notify?: boolean }): void;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

export interface AxieCreatorOptions {
  readonly mount: HTMLElement;
  readonly initialState: AxieCreatorState;
  readonly catalog: AxieCreatorCatalog;
  readonly onChange?: (event: AxieCreatorChangeEvent) => void;
  readonly onOpenChange?: (open: boolean) => void;
}
