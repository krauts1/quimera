import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AxieGenesValidationError,
  decodeAxieGenes,
  normalizeAxieGenes,
} from '../dist/index.js';

const PART_TYPES = ['eye', 'mouth', 'ear', 'horn', 'back', 'tail'];

function encodeUnityGenes({
  mainClass = 0,
  reservation = 0,
  contribution = 0,
  bodySkinInheritability = 0,
  bodySkin = 0,
  bodyDetails = [0, 0, 0],
  primaryColors = [0, 0, 0],
  secondaryColors = [0, 0, 0],
  parts = [],
} = {}) {
  const bits = [];
  const write = (value, width) => {
    const numeric = BigInt(value);
    assert.ok(numeric >= 0n && numeric < (1n << BigInt(width)));
    for (let bit = width - 1; bit >= 0; bit -= 1) {
      bits.push(Number((numeric >> BigInt(bit)) & 1n));
    }
  };

  write(mainClass, 5);
  write(reservation, 45);
  write(contribution, 5);

  write(bodySkinInheritability, 1);
  bodyDetails = [...bodyDetails];
  primaryColors = [...primaryColors];
  secondaryColors = [...secondaryColors];
  write(bodySkin, 9);
  bodyDetails.forEach((value) => write(value, 9));
  primaryColors.forEach((value) => write(value, 6));
  secondaryColors.forEach((value) => write(value, 6));

  for (let index = 0; index < PART_TYPES.length; index += 1) {
    const part = parts[index] ?? {};
    write(part.stage ?? 0, 2);
    write(part.reservation ?? 0, 13);
    write(part.skinInheritability ?? 0, 1);
    write(part.skin ?? 0, 9);
    write(part.class0 ?? 0, 5);
    write(part.value0 ?? 0, 8);
    write(part.class1 ?? 0, 5);
    write(part.value1 ?? 0, 8);
    write(part.class2 ?? 0, 5);
    write(part.value2 ?? 0, 8);
  }

  assert.equal(bits.length, 512);
  let hex = '';
  for (let index = 0; index < bits.length; index += 4) {
    hex += Number.parseInt(bits.slice(index, index + 4).join(''), 2).toString(16);
  }
  return `0x${hex}`;
}

test('matches the exact AxieDescriptor.FromGenes field layout and dominant part order', () => {
  const genes = encodeUnityGenes({
    mainClass: 18,
    reservation: 0x123456789abn,
    contribution: 17,
    bodySkinInheritability: 1,
    bodySkin: 0,
    bodyDetails: [257, 384, 3],
    primaryColors: [4, 63, 62],
    secondaryColors: [61, 60, 59],
    parts: [
      { stage: 3, reservation: 0x1fff, skinInheritability: 1, skin: 12, class0: 4, value0: 255, class1: 31, value1: 254, class2: 30, value2: 253 },
      { stage: 0, skin: 13, class0: 5, value0: 17, class1: 29, value1: 252, class2: 28, value2: 251 },
      { stage: 1, skin: 6, class0: 2, value0: 42, class1: 27, value1: 250, class2: 26, value2: 249 },
      { stage: 2, skin: 1, class0: 16, value0: 99, class1: 25, value1: 248, class2: 24, value2: 247 },
      { stage: 3, skin: 0, class0: 17, value0: 7, class1: 23, value1: 246, class2: 22, value2: 245 },
      { stage: 0, skin: 2, class0: 18, value0: 128, class1: 21, value1: 244, class2: 20, value2: 243 },
    ],
  });

  const decoded = decodeAxieGenes(genes);

  assert.equal(decoded.descriptor.body, 'wetdog');
  assert.equal(decoded.descriptor.colorVariant, 42);
  assert.deepEqual(decoded.descriptor.parts, [
    { type: 'eye', skin: 12, class: 'Aquatic', variant: 255, level: 4 },
    { type: 'mouth', skin: 13, class: 'Reptile', variant: 17, level: 1 },
    { type: 'ear', skin: 6, class: 'Bird', variant: 42, level: 2 },
    { type: 'horn', skin: 1, class: 'Mech', variant: 99, level: 3 },
    { type: 'back', skin: 0, class: 'Dawn', variant: 7, level: 4 },
    { type: 'tail', skin: 2, class: 'Dusk', variant: 128, level: 1 },
  ]);
  assert.deepEqual(decoded.unsupportedClasses, []);
});

test('only body skin 1 has special behavior in the official Unity decoder', () => {
  const frosty = decodeAxieGenes(encodeUnityGenes({
    mainClass: 5,
    bodySkin: 1,
    bodyDetails: [384, 0, 0],
    primaryColors: [6, 0, 0],
  }));
  assert.equal(frosty.descriptor.body, 'frosty');
  assert.equal(frosty.descriptor.colorVariant, 48);

  const summerCatalogId = decodeAxieGenes(encodeUnityGenes({
    mainClass: 0,
    bodySkin: 2,
    bodyDetails: [384, 0, 0],
    primaryColors: [4, 0, 0],
  }));
  assert.equal(summerCatalogId.descriptor.body, 'bigyak');
  assert.equal(summerCatalogId.descriptor.colorVariant, 4);

  const nightmareCatalogId = decodeAxieGenes(encodeUnityGenes({
    mainClass: 4,
    bodySkin: 3,
    bodyDetails: [256, 0, 0],
    primaryColors: [6, 0, 0],
  }));
  assert.equal(nightmareCatalogId.descriptor.body, 'sumo');
  assert.equal(nightmareCatalogId.descriptor.colorVariant, 16);
});

test('matches every official bodyDetail0 enum branch', () => {
  const cases = [
    [0, 'normal'],
    [1, 'spiky'],
    [2, 'fuzzy'],
    [3, 'curly'],
    [256, 'sumo'],
    [257, 'wetdog'],
    [384, 'bigyak'],
    [511, 'normal'],
  ];
  for (const [bodyDetail0, expected] of cases) {
    const decoded = decodeAxieGenes(encodeUnityGenes({ bodyDetails: [bodyDetail0, 1, 2] }));
    assert.equal(decoded.descriptor.body, expected, `bodyDetail0 ${bodyDetail0}`);
  }
});

test('matches every declared GetColorVariant branch and its zero fallback', () => {
  const families = [
    [0, [0, 1, 2, 3, 4, 6], [0, 1, 2, 3, 4, 5]],
    [3, [0, 1, 2, 3, 4], [6, 7, 8, 9, 10]],
    [4, [0, 1, 2, 3, 4, 6], [11, 12, 13, 14, 15, 16]],
    [1, [0, 1, 2, 3, 4], [17, 18, 19, 20, 21]],
    [2, [0, 1, 2, 3, 4], [22, 23, 24, 25, 26]],
    [5, [0, 1, 2, 3, 4, 6], [27, 28, 29, 30, 31, 32]],
    [17, [0, 1, 2, 3, 4], [33, 34, 35, 36, 37]],
    [18, [0, 1, 2, 3, 4], [38, 39, 40, 41, 42]],
    [16, [0, 1, 2, 3, 4], [43, 44, 45, 46, 47]],
  ];
  for (const [classCode, primaryColors, variants] of families) {
    for (let index = 0; index < primaryColors.length; index += 1) {
      const decoded = decodeAxieGenes(encodeUnityGenes({
        mainClass: classCode,
        primaryColors: [primaryColors[index], 63, 62],
      }));
      assert.equal(decoded.descriptor.colorVariant, variants[index], `${classCode}:${primaryColors[index]}`);
    }
  }

  const undeclared = decodeAxieGenes(encodeUnityGenes({ mainClass: 0, primaryColors: [5, 0, 0] }));
  assert.equal(undeclared.descriptor.colorVariant, 0);
});

test('preserves Unity null classes and source bit offsets in compatible mode', () => {
  const decoded = decodeAxieGenes(encodeUnityGenes({
    mainClass: 31,
    parts: [{ class0: 31, value0: 77 }],
  }));

  assert.equal(decoded.descriptor.colorVariant, 0);
  assert.equal(decoded.descriptor.parts[0].class, null);
  assert.equal(decoded.descriptor.parts[0].variant, 77);
  assert.deepEqual(decoded.unsupportedClasses, [
    { field: 'main', code: 31, bitOffset: 0 },
    { field: 'part', code: 31, bitOffset: 153, partType: 'eye' },
  ]);
});

test('matches Unity right-to-left hexadecimal suffix parsing', () => {
  const genes = encodeUnityGenes({ bodyDetails: [384, 0, 0] });
  const expected = genes.toLowerCase();

  assert.equal(normalizeAxieGenes(`ignored:${genes.slice(2).toUpperCase()}`), expected);
  assert.equal(normalizeAxieGenes('not-genes'), `0x${'0'.repeat(128)}`);
  assert.throws(
    () => normalizeAxieGenes('f'.repeat(129)),
    (error) => error instanceof AxieGenesValidationError && error.code === 'too-long',
  );
});
