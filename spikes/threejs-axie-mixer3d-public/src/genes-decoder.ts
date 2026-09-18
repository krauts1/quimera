import {
  AXIE_GENE_PART_ORDER,
  type AxieBodyType,
  type AxieDecodedGenes,
  type AxieDescriptor,
  type AxieGeneClass,
  type AxieGenesDecodeMode,
  type AxieGenesDecodeOptions,
  type AxieGenesDecoder,
  type AxiePartDescriptor,
  type AxiePartType,
  type AxieUnsupportedGeneClass,
} from './domain';

const GENE_BITS = 512;
const GENE_HEX_DIGITS = GENE_BITS / 4;
const HEX_PATTERN = /^[0-9a-f]+$/iu;

const CLASS_BY_CODE: Readonly<Record<number, AxieGeneClass>> = Object.freeze({
  0: 'Beast',
  1: 'Bug',
  2: 'Bird',
  3: 'Plant',
  4: 'Aquatic',
  5: 'Reptile',
  16: 'Mech',
  17: 'Dawn',
  18: 'Dusk',
});

const BODY_BY_DETAIL: Readonly<Record<number, AxieBodyType>> = Object.freeze({
  1: 'spiky',
  2: 'fuzzy',
  3: 'curly',
  256: 'sumo',
  257: 'wetdog',
  384: 'bigyak',
});

const COLOR_VARIANT_BY_CLASS_AND_PRIMARY: Readonly<Record<string, number>> = Object.freeze({
  'Beast:0': 0,
  'Beast:1': 1,
  'Beast:2': 2,
  'Beast:3': 3,
  'Beast:4': 4,
  'Beast:6': 5,
  'Plant:0': 6,
  'Plant:1': 7,
  'Plant:2': 8,
  'Plant:3': 9,
  'Plant:4': 10,
  'Aquatic:0': 11,
  'Aquatic:1': 12,
  'Aquatic:2': 13,
  'Aquatic:3': 14,
  'Aquatic:4': 15,
  'Aquatic:6': 16,
  'Bug:0': 17,
  'Bug:1': 18,
  'Bug:2': 19,
  'Bug:3': 20,
  'Bug:4': 21,
  'Bird:0': 22,
  'Bird:1': 23,
  'Bird:2': 24,
  'Bird:3': 25,
  'Bird:4': 26,
  'Reptile:0': 27,
  'Reptile:1': 28,
  'Reptile:2': 29,
  'Reptile:3': 30,
  'Reptile:4': 31,
  'Reptile:6': 32,
  'Dawn:0': 33,
  'Dawn:1': 34,
  'Dawn:2': 35,
  'Dawn:3': 36,
  'Dawn:4': 37,
  'Dusk:0': 38,
  'Dusk:1': 39,
  'Dusk:2': 40,
  'Dusk:3': 41,
  'Dusk:4': 42,
  'Mech:0': 43,
  'Mech:1': 44,
  'Mech:2': 45,
  'Mech:3': 46,
  'Mech:4': 47,
});

export type AxieGenesValidationCode =
  | 'empty'
  | 'invalid-hex'
  | 'too-long'
  | 'unknown-main-class'
  | 'unknown-part-class'
  | 'layout-overflow';

export class AxieGenesValidationError extends Error {
  readonly name = 'AxieGenesValidationError';

  constructor(
    readonly code: AxieGenesValidationCode,
    message: string,
    readonly bitOffset?: number,
  ) {
    super(message);
  }
}

class UnityBitReader {
  private bitOffset = 0;

  constructor(private readonly value: bigint) {}

  get offset() {
    return this.bitOffset;
  }

  read(bitCount: number): number {
    if (!Number.isInteger(bitCount) || bitCount <= 0 || this.bitOffset + bitCount > GENE_BITS) {
      throw new AxieGenesValidationError(
        'layout-overflow',
        `Cannot read ${bitCount} bits at Axie genes offset ${this.bitOffset}.`,
        this.bitOffset,
      );
    }
    const shift = BigInt(GENE_BITS - this.bitOffset - bitCount);
    const mask = (1n << BigInt(bitCount)) - 1n;
    const result = Number((this.value >> shift) & mask);
    this.bitOffset += bitCount;
    return result;
  }

  skip(bitCount: number) {
    this.read(bitCount);
  }
}

function resolveMode(options?: AxieGenesDecodeOptions): AxieGenesDecodeMode {
  return options?.mode ?? 'unity-compatible';
}

function hexDigit(value: string): number {
  const code = value.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 65 && code <= 70) return code - 65 + 10;
  if (code >= 97 && code <= 102) return code - 97 + 10;
  return -1;
}

/**
 * Exact safe transcription of AxieDescriptor.ParseGenes. Unity walks from the
 * final character toward the front, stops at the first non-hex character, and
 * therefore naturally treats `0x` as a delimiter. A 129th contiguous suffix
 * digit would write genesBytes[64] and throw in C#; this reports that overflow
 * deterministically instead of relying on an out-of-bounds write.
 */
function normalizeUnityCompatibleGenes(genes: string): string {
  const reversed: string[] = [];
  for (let index = genes.length - 1; index >= 0; index -= 1) {
    const character = genes[index];
    if (hexDigit(character) < 0) break;
    if (reversed.length === GENE_HEX_DIGITS) {
      throw new AxieGenesValidationError(
        'too-long',
        `Axie genes contain more than ${GENE_HEX_DIGITS} contiguous hexadecimal suffix digits; Unity overflows its 512-bit buffer.`,
      );
    }
    reversed.push(character.toLowerCase());
  }
  const hex = reversed.reverse().join('').padStart(GENE_HEX_DIGITS, '0');
  return `0x${hex}`;
}

function normalizeStrictGenes(genes: string): string {
  const trimmed = genes.trim();
  const hex = /^0x/iu.test(trimmed) ? trimmed.slice(2) : trimmed;
  if (hex.length === 0) {
    throw new AxieGenesValidationError('empty', 'Axie genes cannot be empty.');
  }
  if (hex.length > GENE_HEX_DIGITS) {
    throw new AxieGenesValidationError(
      'too-long',
      `Axie genes contain ${hex.length} hex digits; the strict 512-bit layout accepts at most ${GENE_HEX_DIGITS}.`,
    );
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new AxieGenesValidationError('invalid-hex', 'Axie genes must contain hexadecimal digits only.');
  }
  return `0x${hex.toLowerCase().padStart(GENE_HEX_DIGITS, '0')}`;
}

/**
 * Canonicalizes to lowercase 512-bit hexadecimal. The default reproduces
 * Unity's right-to-left suffix parser; strict validation is an explicit opt-in.
 */
export function normalizeAxieGenes(genes: string, options?: AxieGenesDecodeOptions): string {
  return resolveMode(options) === 'strict'
    ? normalizeStrictGenes(genes)
    : normalizeUnityCompatibleGenes(genes);
}

export function decodeAxieGenes(genes: string, options?: AxieGenesDecodeOptions): AxieDecodedGenes {
  const mode = resolveMode(options);
  const normalized = normalizeAxieGenes(genes, { mode });
  const reader = new UnityBitReader(BigInt(normalized));
  const unsupportedClasses: AxieUnsupportedGeneClass[] = [];

  const resolveClass = (
    code: number,
    field: 'main' | 'part',
    bitOffset: number,
    partType?: AxiePartType,
  ): AxieGeneClass | null => {
    const result = CLASS_BY_CODE[code];
    if (result) return result;
    if (mode === 'strict') {
      throw new AxieGenesValidationError(
        field === 'main' ? 'unknown-main-class' : 'unknown-part-class',
        `Unknown Axie ${field} class code ${code} at bit offset ${bitOffset}.`,
        bitOffset,
      );
    }
    unsupportedClasses.push(Object.freeze({
      field,
      code,
      bitOffset,
      ...(partType ? { partType } : {}),
    }));
    return null;
  };

  const mainClassOffset = reader.offset;
  const mainClass = resolveClass(reader.read(5), 'main', mainClassOffset);
  reader.skip(45); // reservation
  reader.skip(5); // contribution

  reader.skip(1); // bodySkinInheritability
  const bodySkin = reader.read(9);
  const bodyDetail0 = reader.read(9);
  reader.skip(9); // bodyDetail1
  reader.skip(9); // bodyDetail2

  const primaryColor0 = reader.read(6);
  reader.skip(6); // primaryColor1
  reader.skip(6); // primaryColor2
  reader.skip(6); // secondaryColor0
  reader.skip(6); // secondaryColor1
  reader.skip(6); // secondaryColor2

  const body: AxieBodyType = bodySkin === 1
    ? 'frosty'
    : BODY_BY_DETAIL[bodyDetail0] ?? 'normal';
  const colorVariant = bodySkin === 1
    ? 48
    : COLOR_VARIANT_BY_CLASS_AND_PRIMARY[`${mainClass}:${primaryColor0}`]
      ?? 0;

  const parts: AxiePartDescriptor[] = [];
  AXIE_GENE_PART_ORDER.forEach((type) => {
    const partStage = reader.read(2);
    reader.skip(13); // reservation
    reader.skip(1); // partSkinInheritability
    const skin = reader.read(9);

    const classOffset = reader.offset;
    const partClass = resolveClass(reader.read(5), 'part', classOffset, type);
    const variant = reader.read(8);
    reader.skip(5); // recessive class 1
    reader.skip(8); // recessive value 1
    reader.skip(5); // recessive class 2
    reader.skip(8); // recessive value 2

    parts.push({
      type,
      skin,
      class: partClass,
      variant,
      level: partStage + 1,
    });
  });

  if (reader.offset !== GENE_BITS) {
    throw new AxieGenesValidationError(
      'layout-overflow',
      `Axie genes decoder consumed ${reader.offset} of ${GENE_BITS} bits.`,
      reader.offset,
    );
  }

  const descriptor: AxieDescriptor = { colorVariant, body, parts };
  return {
    genes: normalized,
    descriptor,
    mode,
    unsupportedClasses: Object.freeze(unsupportedClasses),
  };
}

export class UnityAxieGenesDecoder implements AxieGenesDecoder {
  constructor(readonly defaultMode: AxieGenesDecodeMode = 'unity-compatible') {}

  normalize(genes: string, options?: AxieGenesDecodeOptions) {
    return normalizeAxieGenes(genes, { mode: options?.mode ?? this.defaultMode });
  }

  decode(genes: string, options?: AxieGenesDecodeOptions) {
    return decodeAxieGenes(genes, { mode: options?.mode ?? this.defaultMode });
  }
}

export const AXIE_GENES_DECODER: AxieGenesDecoder = Object.freeze(new UnityAxieGenesDecoder());
export const AXIE_STRICT_GENES_DECODER: AxieGenesDecoder = Object.freeze(new UnityAxieGenesDecoder('strict'));
