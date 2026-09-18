import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AxieLookupError,
  ThreeAxieMixer3D,
  createHttpAxieResolver,
  isValidAxieId,
  normalizeAxieId,
  parseAxieLookup,
  resolveAxieGenes,
} from '../dist/index.js';

const SAMPLE_GENES = '0x3000301600001080000000100080860850400010014082084020001000018208202000300141840c0020003000010a040040001000c1040c406';
const CANONICAL_GENES = `0x${SAMPLE_GENES.slice(2).padStart(128, '0')}`;

test('Axie IDs normalize positive decimal strings, numbers and bigints', () => {
  assert.equal(normalizeAxieId(' 2727 '), '2727');
  assert.equal(normalizeAxieId(2727), '2727');
  assert.equal(normalizeAxieId(2727n), '2727');
  assert.equal(isValidAxieId('2727'), true);
  assert.equal(isValidAxieId('0'), false);
  assert.equal(isValidAxieId('12.5'), false);
  assert.throws(
    () => normalizeAxieId('not-an-id'),
    (error) => error instanceof AxieLookupError && error.code === 'invalid-id',
  );
});

test('lookup parsing accepts newGenes and genes, then emits a stable typed record', () => {
  const parsed = parseAxieLookup({
    id: 2727,
    name: 'Axie 2727',
    newGenes: SAMPLE_GENES.toUpperCase(),
    class: 'Beast',
    stage: '4',
    source: 'fixture',
    parts: { eyes: 'eyes-zeal', mouth: 'mouth-goda' },
  }, '2727');

  assert.equal(parsed.axieId, '2727');
  assert.equal(parsed.name, 'Axie 2727');
  assert.equal(parsed.genes, CANONICAL_GENES);
  assert.equal(parsed.axieStage, 4);
  assert.equal(parsed.parts.eyes, 'eyes-zeal');
  assert.equal(parsed.parts.tail, null);
  assert.equal(parsed.source, 'fixture');
  assert(Object.isFrozen(parsed));

  const legacy = parseAxieLookup({ genes: SAMPLE_GENES }, 2727);
  assert.equal(legacy.name, 'Axie #2727');
  assert.equal(legacy.genes, CANONICAL_GENES);
});

test('HTTP resolver uses a same-origin endpoint template and forwards cancellation', async () => {
  const calls = [];
  const controller = new AbortController();
  const resolver = createHttpAxieResolver({
    endpoint: '/custom/axies/{id}',
    headers: { 'X-App': 'agent-starter' },
    fetcher: async (url, init) => {
      calls.push({ url: String(url), init });
      return Response.json({
        axieId: '2727',
        genes: SAMPLE_GENES,
        source: 'test-proxy',
      });
    },
  });

  const result = await resolver.resolve('2727', { signal: controller.signal });
  assert.equal(result.source, 'test-proxy');
  assert.equal(await resolveAxieGenes(resolver, '2727'), CANONICAL_GENES);
  assert.equal(calls[0].url, '/custom/axies/2727');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.signal, controller.signal);
  assert.equal(new Headers(calls[0].init.headers).get('Accept'), 'application/json');
  assert.equal(new Headers(calls[0].init.headers).get('X-App'), 'agent-starter');
});

test('HTTP resolver surfaces typed status and payload errors', async () => {
  const resolver = createHttpAxieResolver({
    fetcher: async () => Response.json({ error: 'Axie does not exist.' }, { status: 404 }),
  });
  await assert.rejects(
    resolver.resolve('2727'),
    (error) => error instanceof AxieLookupError
      && error.code === 'not-found'
      && error.status === 404
      && error.message === 'Axie does not exist.',
  );
  assert.throws(
    () => parseAxieLookup({ name: 'No genes' }, '2727'),
    (error) => error instanceof AxieLookupError && error.code === 'missing-genes',
  );
  assert.throws(
    () => parseAxieLookup({ genes: SAMPLE_GENES, axieStage: 2 }, '1'),
    (error) => error instanceof AxieLookupError && error.code === 'unsupported-stage',
  );
});

test('HTTP resolver preserves AbortError values across runtime realms', async () => {
  const abortError = Object.assign(new Error('cancelled'), { name: 'AbortError' });
  const resolver = createHttpAxieResolver({
    fetcher: async () => {
      throw abortError;
    },
  });

  await assert.rejects(resolver.resolve('2727'), (error) => error === abortError);
});

test('createFromAxieId resolves metadata and delegates to the genes-first mixer path', async () => {
  let captured;
  const resolver = Object.freeze({
    async resolve(axieId, options) {
      assert.equal(axieId, '2727');
      assert(options.signal instanceof AbortSignal);
      return parseAxieLookup({ axieId, genes: SAMPLE_GENES, source: 'fixture' }, axieId);
    },
  });
  class ProbeMixer extends ThreeAxieMixer3D {
    createFromGenes(request) {
      captured = request;
      return Promise.resolve({ kind: 'probe-character' });
    }
  }
  const mixer = new ProbeMixer({ manifest: {}, axieResolver: resolver });
  const controller = new AbortController();
  const character = await mixer.createFromAxieId({
    axieId: '2727',
    quality: 'balanced',
    artMode: 'faithful',
    signal: controller.signal,
  });

  assert.deepEqual(character, { kind: 'probe-character' });
  assert.equal(captured.genes, CANONICAL_GENES);
  assert.equal(captured.quality, 'balanced');
  assert.equal(captured.signal, controller.signal);
  assert.equal('axieId' in captured, false);
  assert.equal('resolver' in captured, false);
  mixer.dispose();
});
