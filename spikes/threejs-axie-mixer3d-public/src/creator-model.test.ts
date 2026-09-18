import { AXIE_BODY_TYPES, AXIE_PART_TYPES, formatAxiePartAssetId, type AxiePartType } from './domain';
import {
  createAxieCreatorCatalog,
  createAxieCreatorStateCodec,
  createDefaultAxieCreatorState,
  randomizeAxieCreatorState,
} from './creator-model';
import type { AxieMixerManifest } from './manifest';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function equal<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function throws(run: () => unknown, match: RegExp, message: string) {
  try {
    run();
  } catch (error) {
    assert(error instanceof Error, `${message}: non-Error thrown`);
    assert(match.test(error.message), `${message}: unexpected message "${error.message}"`);
    return;
  }
  throw new Error(`${message}: expected an error`);
}

function test(name: string, run: () => void) {
  run();
  console.info(`✓ ${name}`);
}

function createTestManifest(): AxieMixerManifest {
  const parts: Record<string, unknown> = {};
  const partIdsByType = {} as Record<AxiePartType, string[]>;
  AXIE_PART_TYPES.forEach((type) => {
    partIdsByType[type] = [0, 1].map((variant) => {
      const descriptor = {
        type,
        skin: 0,
        class: 'Beast' as const,
        variant,
        level: 1,
      };
      const id = formatAxiePartAssetId(descriptor);
      parts[id] = { id, descriptor, rigs: [], contentHash: `hash-${id}` };
      return id;
    });
  });

  const bodies = Object.fromEntries(AXIE_BODY_TYPES.map((body) => [body, { body }]));
  const colorVariants = Array.from({ length: 67 }, (_, index) => ({
    index,
    key: `Palette ${index}`,
    skin: index >= 48 ? 1 : 0,
    class: index % 2 === 0 ? 'Beast' : 'Plant',
    colorValue: index,
    primary1: (0x336699 + index).toString(16).padStart(6, '0'),
    shaded1: '224466',
    primary2: (0x99cc33 + index).toString(16).padStart(6, '0'),
    shaded2: '668822',
    line: '151020',
    partColorShift: 'ffffff',
  }));

  return {
    schemaVersion: 1,
    creator: {
      bodyIds: [...AXIE_BODY_TYPES],
      colorVariants,
      partIdsByType,
      legacyPartRows: [],
    },
    assets: { bodies, parts },
  } as unknown as AxieMixerManifest;
}

const manifest = createTestManifest();
const catalog = createAxieCreatorCatalog(manifest);

test('catalog exposes every backed body and all 67 source palettes', () => {
  equal(catalog.bodies.length, 8, 'body count');
  equal(catalog.colors.length, 67, 'color count');
  equal(new Set(catalog.colors.map((color) => color.index)).size, 67, 'unique color indexes');
});

test('catalog part options are the exact manifest cells, never a synthesized grid', () => {
  AXIE_PART_TYPES.forEach((type) => {
    const expected = manifest.creator.partIdsByType[type];
    const actual = catalog.parts[type].map((option) => option.id);
    equal(actual.length, expected.length, `${type} option count`);
    equal(actual.join('|'), expected.join('|'), `${type} option identity and ordering`);
    assert(!actual.some((id) => id.includes('Beast12')), `${type} synthesized a missing variant`);
  });
});

test('default manual state selects only available manifest assets', () => {
  const state = createDefaultAxieCreatorState(catalog);
  equal(state.mode, 'manual', 'mode');
  equal(state.descriptor.body, 'normal', 'neutral showcase body');
  equal(state.descriptor.colorVariant, 0, 'color');
  AXIE_PART_TYPES.forEach((type) => {
    assert(catalog.parts[type].some((option) => option.id === state.parts[type]), `${type} is available`);
  });
});

test('manual URL codec round-trips all creator choices and preserves unrelated state', () => {
  const codec = createAxieCreatorStateCodec(catalog);
  const source = createDefaultAxieCreatorState(catalog, {
    quality: 'ultra',
    artMode: 'enhanced',
    studioOpen: true,
  });
  const written = codec.write(new URLSearchParams('portrait=close&expression=happy'), source);
  equal(written.get('portrait'), 'close', 'unrelated portrait query');
  equal(written.get('expression'), 'happy', 'unrelated expression query');
  const decoded = codec.read(written);
  assert(decoded?.mode === 'manual', 'manual state did not decode');
  equal(decoded.quality, source.quality, 'quality');
  equal(decoded.artMode, source.artMode, 'art mode');
  equal(decoded.studioOpen, source.studioOpen, 'studio open state');
  equal(decoded.descriptor.body, source.descriptor.body, 'body round trip');
  equal(decoded.descriptor.colorVariant, source.descriptor.colorVariant, 'color round trip');
  AXIE_PART_TYPES.forEach((type) => equal(decoded.parts[type], source.parts[type], `${type} round trip`));
});

test('URL codec rejects a part that is not backed by the manifest', () => {
  const codec = createAxieCreatorStateCodec(catalog);
  const written = codec.write(new URLSearchParams(), createDefaultAxieCreatorState(catalog));
  written.set('axieEye', 'S00_Beast12_L1_Eye');
  equal(codec.read(written), undefined, 'invalid part query');
  const detailed = codec.readDetailed(written);
  assert(!detailed.ok, 'invalid part detailed result accepted');
  equal(detailed.code, 'invalid-part', 'invalid part detailed code');
  equal(detailed.queryKey, 'axieEye', 'invalid part query key');
});

test('genes URL mode preserves canonical 512-bit genes and resolves exported cells', () => {
  const codec = createAxieCreatorStateCodec(catalog);
  const input = new URLSearchParams({ character: 'axie', axieGenes: '0', axieQuality: 'balanced' });
  const state = codec.read(input);
  assert(state?.mode === 'genes', 'genes state did not decode');
  equal(state.genes.length, 130, 'canonical genes length including 0x');
  equal(Object.keys(state.resolvedParts).length, AXIE_PART_TYPES.length, 'resolved part count');
  const written = codec.write(new URLSearchParams('proof=genes'), state);
  equal(written.get('proof'), 'genes', 'unrelated query after gene write');
  equal(written.get('axieGenes'), state.genes, 'canonical gene query');
  equal(written.has('axieBody'), false, 'manual body omitted in genes mode');
});

test('genes URL errors expose stable restoration diagnostics', () => {
  const codec = createAxieCreatorStateCodec(catalog);
  const overlong = codec.readDetailed(new URLSearchParams({
    character: 'axie',
    axieGenes: 'f'.repeat(129),
  }));
  assert(!overlong.ok, 'overlong genes URL was accepted');
  equal(overlong.code, 'invalid-genes', 'overlong genes URL code');
  equal(overlong.genesErrorCode, 'too-long', 'overlong genes validation code');
  equal(overlong.queryKey, 'axieGenes', 'overlong genes query key');
});

test('randomizer stays inside every manifest-backed option set', () => {
  const samples = [0.99, 0, 0.7, 0.2, 0.8, 0.1, 0.51, 0.999];
  let cursor = 0;
  const state = randomizeAxieCreatorState(catalog, undefined, () => samples[cursor++ % samples.length]);
  assert(catalog.bodies.some((option) => option.id === state.descriptor.body), 'random body unavailable');
  assert(catalog.colors.some((option) => option.index === state.descriptor.colorVariant), 'random color unavailable');
  AXIE_PART_TYPES.forEach((type) => {
    assert(catalog.parts[type].some((option) => option.id === state.parts[type]), `random ${type} unavailable`);
  });
});

test('catalog construction fails loudly when an expected body is not exported', () => {
  const incomplete = {
    ...manifest,
    creator: {
      ...manifest.creator,
      bodyIds: manifest.creator.bodyIds.slice(0, -1),
    },
  } as AxieMixerManifest;
  throws(
    () => createAxieCreatorCatalog(incomplete),
    /eight backed body manifests/u,
    'incomplete body catalog',
  );
});
