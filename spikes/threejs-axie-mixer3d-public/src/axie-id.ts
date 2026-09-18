import { normalizeAxieGenes } from './genes-decoder';

export type AxieIdInput = string | number | bigint;

export const AXIE_PART_SLOTS = ['eyes', 'mouth', 'ears', 'horn', 'back', 'tail'] as const;
export type AxiePartSlot = typeof AXIE_PART_SLOTS[number];
export type AxiePartRecord<T> = Readonly<Record<AxiePartSlot, T | null>>;

export interface AxieLookup {
  /** Canonical positive decimal ID. */
  readonly axieId: string;
  readonly name: string;
  readonly image: string | null;
  /** Canonical lowercase 512-bit hexadecimal, including the 0x prefix. */
  readonly genes: string;
  readonly class: string | null;
  readonly axieStage: number | null;
  readonly bodyShape: string | null;
  readonly parts: AxiePartRecord<string> | null;
  readonly partNames: AxiePartRecord<string> | null;
  readonly partClasses: AxiePartRecord<string> | null;
  readonly partSkins: AxiePartRecord<string> | null;
  readonly partStages: AxiePartRecord<number> | null;
  /** Resolver-defined provenance, such as sky-mavis-graphql. */
  readonly source: string;
  readonly cacheTtlSeconds: number | null;
}

export interface ResolveAxieOptions {
  readonly signal?: AbortSignal;
}

/** Application-owned boundary between an Axie ID and authoritative metadata. */
export interface AxieResolver {
  resolve(axieId: AxieIdInput, options?: ResolveAxieOptions): Promise<AxieLookup>;
}

export type AxieResolverEndpoint =
  | string
  | URL
  | ((axieId: string) => string | URL);

export interface CreateHttpAxieResolverOptions {
  /**
   * A {id} template, a base URL to append the ID to, or a callback. Defaults
   * to the same-origin endpoint shipped by the demo: /api/axies/{id}.
   */
  readonly endpoint?: AxieResolverEndpoint;
  readonly fetcher?: typeof fetch;
  readonly headers?: HeadersInit;
}

export type AxieLookupErrorCode =
  | 'invalid-id'
  | 'network'
  | 'not-found'
  | 'http'
  | 'invalid-response'
  | 'missing-genes'
  | 'unsupported-stage';

export class AxieLookupError extends Error {
  readonly name = 'AxieLookupError';

  constructor(
    readonly code: AxieLookupErrorCode,
    message: string,
    readonly axieId?: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const AXIE_ID_PATTERN = /^\d{1,12}$/u;
const DEFAULT_ENDPOINT = '/api/axies/{id}';

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAxieId(input: AxieIdInput): string {
  let value: string;
  if (typeof input === 'bigint') value = input.toString();
  else if (typeof input === 'number') {
    if (!Number.isSafeInteger(input)) {
      throw new AxieLookupError('invalid-id', 'Axie ID numbers must be safe integers. Pass larger IDs as decimal strings.');
    }
    value = String(input);
  } else value = input.trim();

  if (!AXIE_ID_PATTERN.test(value) || value === '0' || value.startsWith('0')) {
    throw new AxieLookupError('invalid-id', 'Axie ID must be a positive decimal number using at most 12 digits.');
  }
  return value;
}

export function isValidAxieId(input: AxieIdInput): boolean {
  try {
    normalizeAxieId(input);
    return true;
  } catch {
    return false;
  }
}

function endpointUrl(endpoint: AxieResolverEndpoint, axieId: string): string {
  if (typeof endpoint === 'function') return String(endpoint(axieId));
  const source = String(endpoint);
  if (source.includes('{id}')) return source.replaceAll('{id}', encodeURIComponent(axieId));
  return `${source.replace(/\/$/u, '')}/${encodeURIComponent(axieId)}`;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function partRecord<T>(
  value: unknown,
  coerce: (field: unknown) => T | null,
): AxiePartRecord<T> | null {
  if (!record(value)) return null;
  return Object.freeze(Object.fromEntries(
    AXIE_PART_SLOTS.map((slot) => [slot, coerce(value[slot])]),
  )) as AxiePartRecord<T>;
}

function responseMessage(payload: unknown): string | undefined {
  if (!record(payload)) return undefined;
  return nullableString(payload.error) ?? nullableString(payload.message) ?? undefined;
}

export function parseAxieLookup(value: unknown, requestedAxieId: AxieIdInput): AxieLookup {
  const requested = normalizeAxieId(requestedAxieId);
  if (!record(value)) {
    throw new AxieLookupError('invalid-response', `Axie #${requested} lookup returned a non-object response.`, requested);
  }

  let axieId = requested;
  const returnedId = value.axieId ?? value.id;
  if (returnedId !== undefined && returnedId !== null) {
    try {
      axieId = normalizeAxieId(typeof returnedId === 'number' ? returnedId : String(returnedId));
    } catch (cause) {
      throw new AxieLookupError(
        'invalid-response',
        `Axie #${requested} lookup returned an invalid Axie ID.`,
        requested,
        undefined,
        { cause },
      );
    }
  }

  const rawGenes = nullableString(value.newGenes) ?? nullableString(value.genes);
  if (!rawGenes) {
    throw new AxieLookupError(
      'missing-genes',
      responseMessage(value) ?? `Axie #${requested} lookup did not return 512-bit genes.`,
      requested,
    );
  }

  let genes: string;
  try {
    genes = normalizeAxieGenes(rawGenes, { mode: 'strict' });
  } catch (cause) {
    throw new AxieLookupError(
      'invalid-response',
      `Axie #${requested} lookup returned invalid genes.`,
      requested,
      undefined,
      { cause },
    );
  }

  const axieStage = nullableNumber(value.axieStage ?? value.stage);
  if (axieStage !== null && axieStage !== 4) {
    throw new AxieLookupError(
      'unsupported-stage',
      `Axie #${requested} is stage ${axieStage}; this 3D mixer currently supports adult stage 4 Axies.`,
      requested,
    );
  }

  return Object.freeze({
    axieId,
    name: nullableString(value.name) ?? `Axie #${axieId}`,
    image: nullableString(value.image),
    genes,
    class: nullableString(value.class),
    axieStage,
    bodyShape: nullableString(value.bodyShape),
    parts: partRecord(value.parts, nullableString),
    partNames: partRecord(value.partNames, nullableString),
    partClasses: partRecord(value.partClasses, nullableString),
    partSkins: partRecord(value.partSkins, nullableString),
    partStages: partRecord(value.partStages, nullableNumber),
    source: nullableString(value.source) ?? 'application-resolver',
    cacheTtlSeconds: nullableNumber(value.cacheTtlSeconds),
  });
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown;
  } catch {
    return undefined;
  }
}

function isAbortError(cause: unknown): boolean {
  return typeof cause === 'object'
    && cause !== null
    && 'name' in cause
    && (cause as { name?: unknown }).name === 'AbortError';
}

/**
 * Creates a browser-safe resolver. API credentials belong in the same-origin
 * server/proxy; this client intentionally has no API-key option.
 */
export function createHttpAxieResolver(
  options: CreateHttpAxieResolverOptions = {},
): AxieResolver {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const fetcher = options.fetcher ?? fetch;
  const headers = new Headers(options.headers);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  return Object.freeze({
    async resolve(input: AxieIdInput, resolveOptions: ResolveAxieOptions = {}) {
      const axieId = normalizeAxieId(input);
      let response: Response;
      try {
        response = await fetcher(endpointUrl(endpoint, axieId), {
          method: 'GET',
          headers,
          signal: resolveOptions.signal,
        });
      } catch (cause) {
        if (isAbortError(cause)) throw cause;
        throw new AxieLookupError(
          'network',
          `Could not reach the Axie #${axieId} resolver.`,
          axieId,
          undefined,
          { cause },
        );
      }

      const payload = await readJson(response);
      if (!response.ok) {
        const code = response.status === 404 ? 'not-found' : 'http';
        throw new AxieLookupError(
          code,
          responseMessage(payload) ?? `Axie #${axieId} lookup failed with HTTP ${response.status}.`,
          axieId,
          response.status,
        );
      }
      return parseAxieLookup(payload, axieId);
    },
  });
}

export async function resolveAxieGenes(
  resolver: AxieResolver,
  axieId: AxieIdInput,
  options?: ResolveAxieOptions,
): Promise<string> {
  return (await resolver.resolve(axieId, options)).genes;
}
