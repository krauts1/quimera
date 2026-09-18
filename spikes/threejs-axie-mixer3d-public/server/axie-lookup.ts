import type { AxieLookup, AxiePartRecord } from '../src/axie-id';

export const AXIE_LOOKUP_CACHE_SECONDS = 300;

const AXIE_MARKETPLACE_GRAPHQL = 'https://api-gateway.skymavis.com/graphql/axie-marketplace';

const AXIE_QUERY = `
  query ThreeJsMixerAxie($axieId: ID!) {
    axie(axieId: $axieId) {
      id
      name
      image
      genes
      newGenes
      class
      stage
      bodyShape
      parts {
        id
        name
        class
        type
        specialGenes
        stage
      }
    }
  }
`;

type GraphqlAxiePart = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly class?: unknown;
  readonly type?: unknown;
  readonly specialGenes?: unknown;
  readonly stage?: unknown;
};

type GraphqlAxie = {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly image?: unknown;
  readonly genes?: unknown;
  readonly newGenes?: unknown;
  readonly class?: unknown;
  readonly stage?: unknown;
  readonly bodyShape?: unknown;
  readonly parts?: readonly GraphqlAxiePart[] | null;
};

export interface LoadAxieLookupOptions {
  readonly apiKey?: string;
  readonly fetcher?: typeof fetch;
  readonly signal?: AbortSignal;
}

export function isValidAxieId(id: string) {
  return /^\d{1,12}$/u.test(id) && Number(id) > 0;
}

function isAbort(error: unknown) {
  return error instanceof Error && error.name === 'AbortError';
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberOrNull(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function partSlot(value: unknown): keyof AxiePartRecord<unknown> | undefined {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'eye' || normalized === 'eyes') return 'eyes';
  if (normalized === 'mouth') return 'mouth';
  if (normalized === 'ear' || normalized === 'ears') return 'ears';
  if (normalized === 'horn' || normalized === 'horns') return 'horn';
  if (normalized === 'back') return 'back';
  if (normalized === 'tail') return 'tail';
  return undefined;
}

function normalizeParts(parts: readonly GraphqlAxiePart[] | null | undefined) {
  const normalized: Record<keyof AxiePartRecord<unknown>, GraphqlAxiePart | null> = {
    eyes: null,
    mouth: null,
    ears: null,
    horn: null,
    back: null,
    tail: null,
  };
  for (const part of parts ?? []) {
    const slot = partSlot(part.type);
    if (slot) normalized[slot] = part;
  }
  return normalized;
}

function mapParts<T>(
  parts: ReturnType<typeof normalizeParts>,
  field: keyof GraphqlAxiePart,
  coerce: (value: unknown) => T | null,
): AxiePartRecord<T> {
  return Object.fromEntries(Object.entries(parts).map(([slot, part]) => [
    slot,
    coerce(part?.[field]),
  ])) as AxiePartRecord<T>;
}

function normalizeGraphqlAxie(
  axie: GraphqlAxie,
  requestedId: string,
  source: string,
): AxieLookup | undefined {
  const genes = stringOrNull(axie.newGenes) ?? stringOrNull(axie.genes);
  if (!genes) return undefined;
  const parts = normalizeParts(axie.parts);
  return {
    axieId: String(axie.id ?? requestedId),
    name: stringOrNull(axie.name) ?? `Axie #${requestedId}`,
    image: stringOrNull(axie.image),
    genes,
    class: stringOrNull(axie.class),
    axieStage: numberOrNull(axie.stage),
    bodyShape: stringOrNull(axie.bodyShape),
    parts: mapParts(parts, 'id', stringOrNull),
    partNames: mapParts(parts, 'name', stringOrNull),
    partClasses: mapParts(parts, 'class', stringOrNull),
    partSkins: mapParts(parts, 'specialGenes', stringOrNull),
    partStages: mapParts(parts, 'stage', numberOrNull),
    source,
    cacheTtlSeconds: AXIE_LOOKUP_CACHE_SECONDS,
  };
}

async function fetchGraphqlAxie(
  endpoint: string,
  id: string,
  fetcher: typeof fetch,
  signal: AbortSignal | undefined,
  headers: Record<string, string> = {},
): Promise<GraphqlAxie | undefined> {
  const response = await fetcher(endpoint, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify({ query: AXIE_QUERY, variables: { axieId: id } }),
    signal,
  });
  if (!response.ok) throw new Error(`GraphQL returned HTTP ${response.status}.`);
  const payload = await response.json() as {
    readonly data?: { readonly axie?: GraphqlAxie | null };
    readonly errors?: readonly { readonly message?: unknown }[];
  };
  if (!payload.data?.axie && payload.errors?.length) {
    const message = stringOrNull(payload.errors[0]?.message) ?? 'GraphQL returned an error.';
    throw new Error(message);
  }
  return payload.data?.axie ?? undefined;
}

function failureMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Server-only resolver for the authenticated Sky Mavis marketplace GraphQL API.
 * The API key is mandatory and is never accepted by the browser-facing SDK.
 */
export async function loadAxieLookup(
  id: string,
  options: LoadAxieLookupOptions = {},
): Promise<AxieLookup> {
  const fetcher = options.fetcher ?? fetch;
  const apiKey = options.apiKey?.trim();
  if (!apiKey) {
    throw new Error('SKY_MAVIS_API_KEY is not configured in the server environment.');
  }

  try {
    const axie = await fetchGraphqlAxie(
      AXIE_MARKETPLACE_GRAPHQL,
      id,
      fetcher,
      options.signal,
      { 'X-API-Key': apiKey },
    );
    if (!axie) throw new Error(`Sky Mavis GraphQL returned no Axie #${id}.`);
    const normalized = normalizeGraphqlAxie(axie, id, 'sky-mavis-graphql');
    if (!normalized) throw new Error(`Sky Mavis GraphQL returned Axie #${id} without genes.`);
    return normalized;
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new Error(`Sky Mavis Axie lookup failed (${failureMessage(error)}).`, { cause: error });
  }
}
