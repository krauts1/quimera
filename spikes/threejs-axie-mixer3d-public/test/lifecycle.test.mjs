import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  AxieCharacter3D,
  RefCountedAxieAssetStore,
  SampledAnimationJsonLoader,
} from '../dist/three.js';
import {
  AXIE_QUALITY_PROFILES,
  ThreeAxieMixer3D,
} from '../dist/index.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

function disposableGlb(counters) {
  const geometry = new THREE.BufferGeometry();
  const material = new THREE.MeshBasicMaterial();
  geometry.addEventListener('dispose', () => { counters.geometry += 1; });
  material.addEventListener('dispose', () => { counters.material += 1; });
  const scene = new THREE.Group();
  scene.add(new THREE.Mesh(geometry, material));
  return { scene, animations: [] };
}

test('asset store destroys a GPU payload that completes after dispose', async () => {
  const source = deferred();
  const counters = { geometry: 0, material: 0 };
  const store = new RefCountedAxieAssetStore({
    gltfLoader: { loadAsync: () => source.promise },
  });

  const acquiring = store.acquireGlb('/late.glb');
  store.dispose();
  source.resolve(disposableGlb(counters));

  await assert.rejects(acquiring, /disposed during a load/);
  assert.deepEqual(counters, { geometry: 1, material: 1 });
  assert.equal(store.diagnostics().entries, 0);
});

test('an abandoned load is evicted when the shared payload later completes', async () => {
  const source = deferred();
  const counters = { geometry: 0, material: 0 };
  const store = new RefCountedAxieAssetStore({
    gltfLoader: { loadAsync: () => source.promise },
    maxUnusedEntries: 0,
  });
  const controller = new AbortController();
  const acquiring = store.acquireGlb('/abandoned.glb', controller.signal);
  controller.abort();

  await assert.rejects(acquiring, { name: 'AbortError' });
  source.resolve(disposableGlb(counters));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(counters, { geometry: 1, material: 1 });
  assert.equal(store.diagnostics().entries, 0);
  assert.equal(store.diagnostics().evictions, 1);
});

function restPose(body = 'normal') {
  return {
    schemaVersion: 1,
    body,
    rootName: 'Root',
    transforms: [{
      path: '',
      parentPath: '',
      name: 'Root',
      position: [0, 0, 0],
      quaternion: [0, 0, 0, 1],
      scale: [1, 1, 1],
    }],
  };
}

function encodeAxanim() {
  const encoder = new TextEncoder();
  const header = {
    schemaVersion: 1,
    id: 'idle',
    body: 'normal',
    set: 'full',
    sourceName: 'Default.Idle',
    duration: 1,
    sourceFrameRate: 30,
    sampleRate: 30,
    sampleCount: 1,
    looping: true,
    wrapMode: 'Loop',
    floatByteOffset: 0,
    floatCount: 1,
    sampleTimes: { offset: 0, length: 1 },
    tracks: [],
    curves: [],
    objectCurves: [],
    events: [],
  };
  let bytes;
  for (;;) {
    bytes = encoder.encode(JSON.stringify(header));
    const padding = (4 - ((12 + bytes.length) % 4)) % 4;
    const nextOffset = 12 + bytes.length + padding;
    if (header.floatByteOffset === nextOffset) {
      if (padding) bytes = encoder.encode(`${JSON.stringify(header)}${' '.repeat(padding)}`);
      break;
    }
    header.floatByteOffset = nextOffset;
  }
  const buffer = new ArrayBuffer(header.floatByteOffset + 4);
  const raw = new Uint8Array(buffer);
  raw.set([65, 88, 65, 78, 73, 77, 49, 0]);
  new DataView(buffer).setUint32(8, bytes.length, true);
  raw.set(bytes, 12);
  new Float32Array(buffer, header.floatByteOffset, 1)[0] = 0;
  return buffer;
}

test('animation loader applies one resolver to top-level, rest-pose and AXANIM URLs', async () => {
  const calls = [];
  const fetchedJson = [];
  const fetchedBinary = [];
  const index = {
    schemaVersion: 1,
    body: 'normal',
    set: 'full',
    restPoseUrl: '../rest/normal.json',
    clips: [{
      sourceName: 'Default.Idle',
      runtimeName: 'full:Default.Idle',
      payloadUrl: './clips/idle.axanim',
      duration: 1,
      trackCount: 0,
      looping: true,
    }],
  };
  const loader = new SampledAnimationJsonLoader({
    resolveUrl(url, baseUrl) {
      calls.push([url, baseUrl]);
      return baseUrl ? new URL(url, baseUrl).toString() : new URL(url, 'https://cdn.example/').toString();
    },
    async fetchJson(url) {
      fetchedJson.push(url);
      return url.endsWith('/normal.json') ? restPose() : index;
    },
    async fetchArrayBuffer(url) {
      fetchedBinary.push(url);
      return encodeAxanim();
    },
  });

  const root = new THREE.Group();
  root.name = 'Root';
  const result = await loader.loadBundle('animation/normal/index.json', root);

  assert.equal(result.clips.length, 1);
  assert.deepEqual(calls, [
    ['animation/normal/index.json', undefined],
    ['../rest/normal.json', 'https://cdn.example/animation/normal/index.json'],
    ['./clips/idle.axanim', 'https://cdn.example/animation/normal/index.json'],
  ]);
  assert.deepEqual(fetchedJson, [
    'https://cdn.example/animation/normal/index.json',
    'https://cdn.example/animation/rest/normal.json',
  ]);
  assert.deepEqual(fetchedBinary, ['https://cdn.example/animation/normal/clips/idle.axanim']);
});

test('animation cancellation is consumer-aware and clearCache aborts shared work', async () => {
  const first = deferred();
  let firstSharedSignal;
  let fetchCount = 0;
  const loader = new SampledAnimationJsonLoader({
    fetchJson(_url, signal) {
      fetchCount += 1;
      firstSharedSignal = signal;
      return first.promise;
    },
  });
  const a = new AbortController();
  const b = new AbortController();
  const loadA = loader.loadRestPose('/shared.json', a.signal);
  const loadB = loader.loadRestPose('/shared.json', b.signal);
  await Promise.resolve();
  a.abort();
  await assert.rejects(loadA, { name: 'AbortError' });
  assert.equal(firstSharedSignal.aborted, false);
  first.resolve(restPose());
  assert.equal((await loadB).body, 'normal');
  assert.equal(fetchCount, 1);

  const second = deferred();
  const clearLoader = new SampledAnimationJsonLoader({
    fetchJson(_url, signal) {
      signal.addEventListener('abort', () => second.reject(new DOMException('Aborted', 'AbortError')), { once: true });
      return second.promise;
    },
  });
  const clearing = clearLoader.loadRestPose('/clear.json');
  await Promise.resolve();
  clearLoader.clearCache();
  await assert.rejects(clearing, { name: 'AbortError' });
});

test('mixer disposes owned characters, assembler cache, then its asset store', async () => {
  const order = [];
  const lease = {
    key: 'test',
    value: {},
    released: false,
    release() { order.push('character-release'); },
  };
  const store = {
    acquireGlb: async () => { throw new Error('unused'); },
    acquireTexture: async () => { throw new Error('unused'); },
    diagnostics: () => ({ entries: 0, activeLeases: 0, inFlightLoads: 0, hits: 0, misses: 0, evictions: 0, estimatedBytes: 0 }),
    evictUnused() {},
    dispose() { order.push('asset-store'); },
  };
  const descriptor = { body: 'normal', color: 0, parts: [] };
  const quality = AXIE_QUALITY_PROFILES['unity-default'];
  const body = {
    body: 'normal',
    bounds: { min: [-1, 0, -1], max: [1, 2, 1] },
    restPoseUrl: '',
  };
  const plan = {
    key: 'test-plan', descriptor, quality, animationSet: 'full', body,
    bodyLod: { resolvedLod: 0 }, partRigs: [], missingParts: [], warnings: [],
  };
  const assembler = {
    async assemble() {
      const wrapper = new THREE.Group();
      const model = new THREE.Group();
      wrapper.add(model);
      return {
        wrapper,
        model,
        clips: [],
        clipSets: { lite: [], full: [] },
        leases: [lease],
        ownedMaterials: [],
        addonRuntimes: [],
        diagnostics: {},
      };
    },
    clearCache() { order.push('assembler-cache'); },
  };
  const mixer = new ThreeAxieMixer3D({
    manifest: { assets: { weapons: {} } },
    planBuilder: { build: () => plan },
    assetStore: store,
    disposeSuppliedAssetStore: true,
    assembler,
  });
  assert.throws(
    () => AxieCharacter3D.FromDescriptor(descriptor),
    /registerAsDefaultCharacterFactory: true/,
  );
  const character = await mixer.create({ descriptor, quality });
  mixer.dispose();

  assert.equal(character.disposed, true);
  assert.deepEqual(order, ['character-release', 'assembler-cache', 'asset-store']);
});
