import {
  AXIE_BODY_TYPES,
  AXIE_GENE_PART_ORDER,
  AXIE_PART_TYPES,
  formatAxiePartAssetId,
  type AxieBodyType,
  type AxieDescriptor,
  type AxiePartAssetId,
  type AxiePartType,
} from './domain';
import {
  AXIE_CREATOR_QUERY_KEYS,
  AXIE_CREATOR_URL_VERSION,
  type AxieCreatorCatalog,
  type AxieCreatorPreferences,
  type AxieCreatorState,
  type AxieCreatorStateCodec,
  type AxieCreatorStateReadResult,
  type AxieManualCreatorState,
  type AxiePartSelection,
} from './creator-state';
import { AXIE_GENES_DECODER, AxieGenesValidationError } from './genes-decoder';
import type { AxieMixerManifest } from './manifest';
import { AXIE_QUALITY_IDS, type AxieQualityId } from './quality';
import type { AxieArtMode } from './runtime';

const PART_QUERY_KEY: Readonly<Record<AxiePartType, string>> = Object.freeze({
  back: AXIE_CREATOR_QUERY_KEYS.back,
  ear: AXIE_CREATOR_QUERY_KEYS.ear,
  eye: AXIE_CREATOR_QUERY_KEYS.eye,
  horn: AXIE_CREATOR_QUERY_KEYS.horn,
  mouth: AXIE_CREATOR_QUERY_KEYS.mouth,
  tail: AXIE_CREATOR_QUERY_KEYS.tail,
});

const DEFAULT_PREFERENCES: AxieCreatorPreferences = Object.freeze({
  quality: 'unity-default',
  artMode: 'faithful',
  studioOpen: false,
});

const AXIE_SKIN_LABELS: Readonly<Record<number, string>> = Object.freeze({
  0: 'Standard',
  1: 'Mystic',
  2: 'Agamo',
  3: 'Japanese',
  4: 'Xmas I',
  5: 'Xmas II',
  6: 'Summer S06',
  7: 'Summer S07',
  8: 'Summer S08',
  9: 'Summer S09',
  10: 'Summer S10',
  11: 'Summer S11',
  12: 'Nightmare',
  13: 'Nightmare Shiny',
});

export const AXIE_SPECIAL_SHOWCASE_PRESET_IDS = [
  'nightmare-body',
  'nightmare-parts',
  'japanese-parts',
  'xmas-i-parts',
  'xmas-ii-parts',
] as const;

export type AxieSpecialShowcasePresetId = typeof AXIE_SPECIAL_SHOWCASE_PRESET_IDS[number];

export interface AxieSpecialShowcasePreset {
  readonly id: AxieSpecialShowcasePresetId;
  readonly label: string;
  readonly description: string;
  readonly body: AxieBodyType;
  readonly colorVariant: number;
  readonly skin: number;
  /** Omitted only by the body-skin preset, which deliberately preserves current parts. */
  readonly parts?: AxiePartSelection;
}

/**
 * Deterministic, source-backed preview states for the art-team families that
 * are otherwise easy to miss in the full Creator catalog.
 *
 * Nightmare body is a skin/palette on the animated Normal rig, matching the
 * Unity genes decoder. Xmas parts use the Frosty staging body supplied by the
 * source project. These are convenience showcases, not additional body types.
 */
export const AXIE_SPECIAL_SHOWCASE_PRESETS: Readonly<
  Record<AxieSpecialShowcasePresetId, AxieSpecialShowcasePreset>
> = Object.freeze({
  'nightmare-body': Object.freeze({
    id: 'nightmare-body',
    label: 'Nightmare Body',
    description: 'Official Beast Nightmare body skin on the animated Normal rig; current parts stay selected.',
    body: 'normal',
    colorVariant: 58,
    skin: 12,
  }),
  'nightmare-parts': Object.freeze({
    id: 'nightmare-parts',
    label: 'Nightmare Parts',
    description: 'Representative source-authored Nightmare L2 set with the Beast Nightmare body palette.',
    body: 'normal',
    colorVariant: 58,
    skin: 12,
    parts: Object.freeze({
      back: 'S12_Beast06_L2_Back',
      ear: 'S12_Bug06_L2_Ear',
      eye: 'S12_Beast04_L2_Eye',
      horn: 'S12_Bug04_L2_Horn',
      mouth: 'S12_Beast04_L2_Mouth',
      tail: 'S12_Beast04_L2_Tail',
    }),
  }),
  'japanese-parts': Object.freeze({
    id: 'japanese-parts',
    label: 'Japanese Parts',
    description: 'Representative source-authored Japanese S03 L2 set.',
    body: 'normal',
    colorVariant: 2,
    skin: 3,
    parts: Object.freeze({
      back: 'S03_Beast08_L2_Back',
      ear: 'S03_Bug12_L2_Ear',
      eye: 'S03_Reptile08_L2_Eye',
      horn: 'S03_Beast08_L2_Horn',
      mouth: 'S03_Bug08_L2_Mouth',
      tail: 'S03_Bug06_L2_Tail',
    }),
  }),
  'xmas-i-parts': Object.freeze({
    id: 'xmas-i-parts',
    label: 'Xmas I Parts',
    description: 'Complete source-authored Xmas I S04 L2 set on Frosty.',
    body: 'frosty',
    colorVariant: 48,
    skin: 4,
    parts: Object.freeze({
      back: 'S04_Bug04_L2_Back',
      ear: 'S04_Beast06_L2_Ear',
      eye: 'S04_Beast04_L2_Eye',
      horn: 'S04_Bird12_L2_Horn',
      mouth: 'S04_Plant04_L2_Mouth',
      tail: 'S04_Reptile08_L2_Tail',
    }),
  }),
  'xmas-ii-parts': Object.freeze({
    id: 'xmas-ii-parts',
    label: 'Xmas II Parts',
    description: 'Complete source-authored Xmas II S05 L2 set on Frosty.',
    body: 'frosty',
    colorVariant: 48,
    skin: 5,
    parts: Object.freeze({
      back: 'S05_Reptile08_L2_Back',
      ear: 'S05_Plant10_L2_Ear',
      eye: 'S05_Bird04_L2_Eye',
      horn: 'S05_Plant10_L2_Horn',
      mouth: 'S05_Reptile10_L2_Mouth',
      tail: 'S05_Reptile06_L2_Tail',
    }),
  }),
});

/** Human-readable legacy skin-family label used by creator surfaces. */
export function formatAxieSkinLabel(skin: number) {
  return AXIE_SKIN_LABELS[skin] ?? `Skin S${Math.max(0, Math.trunc(skin)).toString().padStart(2, '0')}`;
}

function titleCase(value: string) {
  return value.length === 0 ? value : `${value[0].toUpperCase()}${value.slice(1)}`;
}

function isQuality(value: string | null): value is AxieQualityId {
  return value !== null && (AXIE_QUALITY_IDS as readonly string[]).includes(value);
}

function isArtMode(value: string | null): value is AxieArtMode {
  return value === 'faithful' || value === 'enhanced';
}

function parseInteger(value: string | null): number | undefined {
  if (value === null || !/^-?\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function freezeDescriptor(descriptor: AxieDescriptor): AxieDescriptor {
  return Object.freeze({
    colorVariant: Math.trunc(descriptor.colorVariant),
    body: descriptor.body,
    parts: Object.freeze(descriptor.parts.map((part) => Object.freeze({ ...part }))),
  });
}

function freezeSelection(selection: Record<AxiePartType, AxiePartAssetId>): AxiePartSelection {
  return Object.freeze({ ...selection });
}

function normalizePreferences(
  preferences: Partial<AxieCreatorPreferences> | undefined,
): AxieCreatorPreferences {
  const quality = preferences?.quality ?? DEFAULT_PREFERENCES.quality;
  const artMode = preferences?.artMode ?? DEFAULT_PREFERENCES.artMode;
  if (!isQuality(quality)) throw new TypeError(`Unknown Axie quality profile "${quality}".`);
  if (!isArtMode(artMode)) throw new TypeError(`Unknown Axie art mode "${artMode}".`);
  return Object.freeze({
    quality,
    artMode,
    studioOpen: preferences?.studioOpen ?? DEFAULT_PREFERENCES.studioOpen,
  });
}

function partLabel(id: AxiePartAssetId, catalog: AxieMixerManifest['assets']['parts']) {
  const descriptor = catalog[id].descriptor;
  const variant = descriptor.variant.toString().padStart(2, '0');
  const skin = formatAxieSkinLabel(descriptor.skin);
  return `${descriptor.class} ${variant} · ${skin} · L${descriptor.level}`;
}

/**
 * Projects the creator directly from the exported mixer manifest. It never
 * synthesizes a class/variant grid, so unavailable Eye/Mouth cells cannot leak
 * into the UI.
 */
export function createAxieCreatorCatalog(manifest: AxieMixerManifest): AxieCreatorCatalog {
  const bodyIds = [...new Set(manifest.creator.bodyIds)];
  const missingBodies = AXIE_BODY_TYPES.filter(
    (body) => !bodyIds.includes(body) || manifest.assets.bodies[body] === undefined,
  );
  if (missingBodies.length > 0 || bodyIds.length !== AXIE_BODY_TYPES.length) {
    throw new Error(
      `Axie Creator requires the eight backed body manifests; missing or duplicated: ${missingBodies.join(', ') || 'unknown'}.`,
    );
  }

  const colors = manifest.creator.colorVariants.map((color) => Object.freeze({
    ...color,
    available: true,
  }));
  if (colors.length !== 67 || new Set(colors.map((color) => color.index)).size !== colors.length) {
    throw new Error(`Axie Creator expected 67 unique manifest colors, received ${colors.length}.`);
  }

  const parts = {} as Record<AxiePartType, AxieCreatorCatalog['parts'][AxiePartType]>;
  AXIE_PART_TYPES.forEach((partType) => {
    const manifestIds = manifest.creator.partIdsByType[partType];
    const ids = [...new Set(manifestIds)];
    if (ids.length !== manifestIds.length) {
      throw new Error(`Axie Creator ${partType} catalog contains duplicate manifest asset ids.`);
    }
    if (ids.length === 0) throw new Error(`Axie Creator has no manifest-backed ${partType} options.`);
    const options = ids.map((id) => {
      const asset = manifest.assets.parts[id];
      if (!asset) throw new Error(`Axie Creator part catalog references missing asset "${id}".`);
      if (asset.descriptor.type !== partType) {
        throw new Error(`Axie Creator catalog placed ${id} in ${partType}, but its descriptor is ${asset.descriptor.type}.`);
      }
      return Object.freeze({
        id,
        asset,
        label: partLabel(id, manifest.assets.parts),
        available: true,
      });
    });
    parts[partType] = Object.freeze(options);
  });

  return Object.freeze({
    bodies: Object.freeze(bodyIds.map((body) => Object.freeze({
      id: body,
      label: titleCase(body),
      available: true,
    }))),
    colors: Object.freeze(colors),
    parts: Object.freeze(parts) as AxieCreatorCatalog['parts'],
  });
}

function optionForPart(catalog: AxieCreatorCatalog, type: AxiePartType, id: string) {
  return catalog.parts[type].find((option) => option.id === id && option.available);
}

function descriptorFromManualSelection(
  catalog: AxieCreatorCatalog,
  body: AxieBodyType,
  colorVariant: number,
  parts: AxiePartSelection,
): AxieDescriptor {
  return freezeDescriptor({
    body,
    colorVariant,
    parts: AXIE_GENE_PART_ORDER.map((type) => {
      const option = optionForPart(catalog, type, parts[type]);
      if (!option) throw new TypeError(`Unknown manifest-backed ${type} part "${parts[type]}".`);
      return option.asset.descriptor;
    }),
  });
}

export function createManualAxieCreatorState(
  catalog: AxieCreatorCatalog,
  selection: Readonly<{
    body: AxieBodyType;
    colorVariant: number;
    parts: AxiePartSelection;
  }>,
  preferences?: Partial<AxieCreatorPreferences>,
): AxieManualCreatorState {
  if (!catalog.bodies.some((option) => option.id === selection.body && option.available)) {
    throw new TypeError(`Unknown backed Axie body "${selection.body}".`);
  }
  if (!catalog.colors.some((option) => option.index === selection.colorVariant && option.available)) {
    throw new TypeError(`Unknown available Axie color variant ${selection.colorVariant}.`);
  }
  const normalizedPreferences = normalizePreferences(preferences);
  const parts = freezeSelection({ ...selection.parts });
  return Object.freeze({
    mode: 'manual',
    ...normalizedPreferences,
    parts,
    descriptor: descriptorFromManualSelection(
      catalog,
      selection.body,
      selection.colorVariant,
      parts,
    ),
  });
}

export function createDefaultAxieCreatorState(
  catalog: AxieCreatorCatalog,
  preferences?: Partial<AxieCreatorPreferences>,
): AxieManualCreatorState {
  // Normal is the clearest neutral showcase for facial parts and is backed by
  // the full animation catalog. Preserve a catalog-order fallback for custom
  // manifests that intentionally omit it.
  const body = catalog.bodies.find((option) => option.id === 'normal' && option.available)?.id
    ?? catalog.bodies.find((option) => option.available)?.id;
  const color = catalog.colors.find((option) => option.available)?.index;
  if (!body || color === undefined) throw new Error('Axie Creator catalog has no selectable body or color.');
  const selection = {} as Record<AxiePartType, AxiePartAssetId>;
  AXIE_PART_TYPES.forEach((type) => {
    const option = catalog.parts[type].find((candidate) => candidate.available);
    if (!option) throw new Error(`Axie Creator catalog has no selectable ${type}.`);
    selection[type] = option.id;
  });
  return createManualAxieCreatorState(catalog, {
    body,
    colorVariant: color,
    parts: freezeSelection(selection),
  }, preferences);
}

export function resolveAxieCreatorParts(
  catalog: AxieCreatorCatalog,
  descriptor: AxieDescriptor,
): Readonly<Partial<Record<AxiePartType, AxiePartAssetId>>> {
  const resolved: Partial<Record<AxiePartType, AxiePartAssetId>> = {};
  descriptor.parts.forEach((part) => {
    const id = formatAxiePartAssetId(part);
    if (optionForPart(catalog, part.type, id)) resolved[part.type] = id;
  });
  return Object.freeze(resolved);
}

export function normalizeAxieCreatorState(
  state: AxieCreatorState,
  catalog: AxieCreatorCatalog,
): AxieCreatorState {
  const preferences = normalizePreferences(state);
  if (state.mode === 'manual') {
    return createManualAxieCreatorState(catalog, {
      body: state.descriptor.body,
      colorVariant: state.descriptor.colorVariant,
      parts: state.parts,
    }, preferences);
  }
  const decoded = AXIE_GENES_DECODER.decode(state.genes);
  return Object.freeze({
    mode: 'genes',
    ...preferences,
    genes: decoded.genes,
    descriptor: freezeDescriptor(decoded.descriptor),
    unsupportedClasses: decoded.unsupportedClasses,
    resolvedParts: resolveAxieCreatorParts(catalog, decoded.descriptor),
  });
}

export function manualizeAxieCreatorState(
  state: AxieCreatorState,
  catalog: AxieCreatorCatalog,
): AxieManualCreatorState {
  if (state.mode === 'manual') return normalizeAxieCreatorState(state, catalog) as AxieManualCreatorState;
  const fallback = createDefaultAxieCreatorState(catalog, state);
  const selection = { ...fallback.parts } as Record<AxiePartType, AxiePartAssetId>;
  AXIE_PART_TYPES.forEach((type) => {
    const resolved = state.resolvedParts[type];
    if (resolved && optionForPart(catalog, type, resolved)) selection[type] = resolved;
  });
  const body = catalog.bodies.some((option) => option.id === state.descriptor.body && option.available)
    ? state.descriptor.body
    : fallback.descriptor.body;
  const colorVariant = catalog.colors.some(
    (option) => option.index === state.descriptor.colorVariant && option.available,
  ) ? state.descriptor.colorVariant : fallback.descriptor.colorVariant;
  return createManualAxieCreatorState(catalog, {
    body,
    colorVariant,
    parts: freezeSelection(selection),
  }, state);
}

/**
 * Creates a fully validated manual state for one of the special-family
 * showcases. Every explicit part id is checked against the supplied manifest
 * catalog by createManualAxieCreatorState().
 */
export function createAxieSpecialShowcaseState(
  catalog: AxieCreatorCatalog,
  state: AxieCreatorState,
  presetId: AxieSpecialShowcasePresetId,
): AxieManualCreatorState {
  const preset = AXIE_SPECIAL_SHOWCASE_PRESETS[presetId];
  if (!preset) throw new TypeError(`Unknown Axie special showcase preset "${presetId}".`);
  const manual = manualizeAxieCreatorState(state, catalog);
  return createManualAxieCreatorState(catalog, {
    body: preset.body,
    colorVariant: preset.colorVariant,
    parts: preset.parts ?? manual.parts,
  }, manual);
}

function pickRandom<T>(items: readonly T[], random: () => number): T {
  if (items.length === 0) throw new Error('Cannot randomize from an empty Axie Creator option list.');
  const sample = random();
  const value = Number.isFinite(sample) ? Math.max(0, Math.min(0.999999999, sample)) : 0;
  return items[Math.floor(value * items.length)];
}

export function randomizeAxieCreatorState(
  catalog: AxieCreatorCatalog,
  preferences?: Partial<AxieCreatorPreferences>,
  random: () => number = Math.random,
): AxieManualCreatorState {
  const bodies = catalog.bodies.filter((option) => option.available);
  const colors = catalog.colors.filter((option) => option.available);
  const selection = {} as Record<AxiePartType, AxiePartAssetId>;
  AXIE_PART_TYPES.forEach((type) => {
    selection[type] = pickRandom(catalog.parts[type].filter((option) => option.available), random).id;
  });
  return createManualAxieCreatorState(catalog, {
    body: pickRandom(bodies, random).id,
    colorVariant: pickRandom(colors, random).index,
    parts: freezeSelection(selection),
  }, preferences);
}

export function createAxieCreatorStateCodec(
  catalog: AxieCreatorCatalog,
): AxieCreatorStateCodec {
  const rejected = (
    code: Exclude<AxieCreatorStateReadResult, { readonly ok: true }>['code'],
    message: string,
    details: Pick<Exclude<AxieCreatorStateReadResult, { readonly ok: true }>, 'queryKey' | 'genesErrorCode'> = {},
  ): AxieCreatorStateReadResult => Object.freeze({ ok: false, code, message, ...details });

  const readDetailed = (parameters: URLSearchParams): AxieCreatorStateReadResult => {
    if (parameters.get(AXIE_CREATOR_QUERY_KEYS.character) !== 'axie') {
      return rejected('not-axie', 'The URL does not select the Axie character.', {
        queryKey: AXIE_CREATOR_QUERY_KEYS.character,
      });
    }
    const version = parameters.get(AXIE_CREATOR_QUERY_KEYS.version);
    if (version !== null && version !== String(AXIE_CREATOR_URL_VERSION)) {
      return rejected('unsupported-version', `Unsupported Axie creator URL version "${version}".`, {
        queryKey: AXIE_CREATOR_QUERY_KEYS.version,
      });
    }
    const qualityValue = parameters.get(AXIE_CREATOR_QUERY_KEYS.quality);
    const artValue = parameters.get(AXIE_CREATOR_QUERY_KEYS.art);
    if (qualityValue !== null && !isQuality(qualityValue)) {
      return rejected('invalid-quality', `Unknown Axie quality profile "${qualityValue}".`, {
        queryKey: AXIE_CREATOR_QUERY_KEYS.quality,
      });
    }
    if (artValue !== null && !isArtMode(artValue)) {
      return rejected('invalid-art-mode', `Unknown Axie art mode "${artValue}".`, {
        queryKey: AXIE_CREATOR_QUERY_KEYS.art,
      });
    }
    const preferences: AxieCreatorPreferences = {
      quality: qualityValue ?? DEFAULT_PREFERENCES.quality,
      artMode: artValue ?? DEFAULT_PREFERENCES.artMode,
      studioOpen: parameters.get(AXIE_CREATOR_QUERY_KEYS.studio) === '1',
    };

    if (parameters.has(AXIE_CREATOR_QUERY_KEYS.genes)) {
      const genes = parameters.get(AXIE_CREATOR_QUERY_KEYS.genes) ?? '';
      if (!genes) {
        return rejected('invalid-genes', 'The Axie genes URL value is empty.', {
          queryKey: AXIE_CREATOR_QUERY_KEYS.genes,
          genesErrorCode: 'empty',
        });
      }
      try {
        const decoded = AXIE_GENES_DECODER.decode(genes);
        return Object.freeze({
          ok: true,
          state: Object.freeze({
            mode: 'genes',
            ...preferences,
            genes: decoded.genes,
            descriptor: freezeDescriptor(decoded.descriptor),
            unsupportedClasses: decoded.unsupportedClasses,
            resolvedParts: resolveAxieCreatorParts(catalog, decoded.descriptor),
          }),
        });
      } catch (error) {
        return rejected(
          'invalid-genes',
          error instanceof Error ? error.message : 'Axie genes could not be decoded.',
          {
            queryKey: AXIE_CREATOR_QUERY_KEYS.genes,
            ...(error instanceof AxieGenesValidationError ? { genesErrorCode: error.code } : {}),
          },
        );
      }
    }

    const bodyRaw = parameters.get(AXIE_CREATOR_QUERY_KEYS.body);
    const colorRaw = parameters.get(AXIE_CREATOR_QUERY_KEYS.color);
    if (bodyRaw === null || colorRaw === null) {
      return rejected('incomplete-manual-state', 'The Axie URL is missing a manual body or color selection.');
    }
    const bodyValue = bodyRaw as AxieBodyType;
    if (!catalog.bodies.some((option) => option.id === bodyValue && option.available)) {
      return rejected('invalid-body', `Unknown backed Axie body "${bodyRaw}".`, {
        queryKey: AXIE_CREATOR_QUERY_KEYS.body,
      });
    }
    const colorVariant = parseInteger(colorRaw);
    if (colorVariant === undefined || !catalog.colors.some((option) => option.index === colorVariant && option.available)) {
      return rejected('invalid-color', `Unknown available Axie color variant "${colorRaw}".`, {
        queryKey: AXIE_CREATOR_QUERY_KEYS.color,
      });
    }
    const selection = {} as Record<AxiePartType, AxiePartAssetId>;
    for (const type of AXIE_PART_TYPES) {
      const key = PART_QUERY_KEY[type];
      const id = parameters.get(key);
      if (!id) {
        return rejected('incomplete-manual-state', `The Axie URL is missing its ${type} selection.`, { queryKey: key });
      }
      if (!optionForPart(catalog, type, id)) {
        return rejected('invalid-part', `Unknown manifest-backed ${type} part "${id}".`, { queryKey: key });
      }
      selection[type] = id;
    }
    return Object.freeze({
      ok: true,
      state: createManualAxieCreatorState(catalog, {
        body: bodyValue,
        colorVariant,
        parts: freezeSelection(selection),
      }, preferences),
    });
  };

  return Object.freeze({
    read(parameters: URLSearchParams): AxieCreatorState | undefined {
      const result = readDetailed(parameters);
      return result.ok ? result.state : undefined;
    },

    readDetailed,

    write(parameters: URLSearchParams, value: AxieCreatorState): URLSearchParams {
      const state = normalizeAxieCreatorState(value, catalog);
      const next = new URLSearchParams(parameters);
      Object.values(AXIE_CREATOR_QUERY_KEYS).forEach((key) => next.delete(key));
      next.set(AXIE_CREATOR_QUERY_KEYS.character, 'axie');
      next.set(AXIE_CREATOR_QUERY_KEYS.version, String(AXIE_CREATOR_URL_VERSION));
      next.set(AXIE_CREATOR_QUERY_KEYS.quality, state.quality);
      next.set(AXIE_CREATOR_QUERY_KEYS.art, state.artMode);
      if (state.studioOpen) next.set(AXIE_CREATOR_QUERY_KEYS.studio, '1');
      if (state.mode === 'genes') {
        next.set(AXIE_CREATOR_QUERY_KEYS.genes, state.genes);
      } else {
        next.set(AXIE_CREATOR_QUERY_KEYS.body, state.descriptor.body);
        next.set(AXIE_CREATOR_QUERY_KEYS.color, String(state.descriptor.colorVariant));
        AXIE_PART_TYPES.forEach((type) => next.set(PART_QUERY_KEY[type], state.parts[type]));
      }
      return next;
    },
  });
}
