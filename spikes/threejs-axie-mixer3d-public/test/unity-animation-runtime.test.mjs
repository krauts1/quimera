import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';
import * as ROOT_API from '../dist/index.js';
import * as THREE_API from '../dist/three.js';

const { AXIE_QUALITY_PROFILES } = ROOT_API;
const { ThreeAxieAssembler } = THREE_API;

function fixture() {
  const scene = new THREE.Group();
  const model = new THREE.Group();
  model.name = 'Model';
  const attach = new THREE.Bone();
  attach.name = 'Root_Eye_M_JNT';
  model.add(attach);
  model.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial()));
  scene.add(model);
  const partScene = new THREE.Group();
  const partNode = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  partNode.name = 'FixtureEye';
  partScene.add(partNode);

  const released = [];
  const assets = {
    async acquireGlb(url) {
      const lease = {
        key: url,
        value: { scene: url === '/part.glb' ? partScene : scene, animations: [] },
        released: false,
        release() {
          lease.released = true;
          released.push(url);
        },
      };
      return lease;
    },
    async acquireTexture() { throw new Error('No textures expected.'); },
    diagnostics() { return { entries: 0, activeLeases: 0, inFlightLoads: 0, hits: 0, misses: 0, evictions: 0, estimatedBytes: 0 }; },
    evictUnused() {},
    dispose() {},
  };
  const shader = { id: 'shader', sourceName: 'Fixture', fidelity: 'exact' };
  const material = {
    id: 'body-material',
    shaderId: shader.id,
    textures: {},
    renderState: { renderOrder: 0 },
  };
  const lod = {
    sourceLod: 0,
    url: '/assets/axie/bodies/Normal/lod0.glb',
    sceneNode: 'Model',
    meshName: 'Fixture',
    vertexCount: 0,
    triangleCount: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    contentHash: 'fixture',
  };
  const animationBundle = (set) => ({
    set,
    url: `/base/${set}.json`,
    coordinateSpace: 'target-glb-local-v1',
    clips: [],
    contentHash: set,
  });
  const body = {
    id: 'body:normal',
    body: 'normal',
    sceneRootName: 'Model',
    skeletonRootName: 'Root_Character',
    restPoseUrl: '',
    prefabLod: 0,
    lods: [lod],
    materialId: material.id,
    attachNodes: {},
    weaponAttachNodes: {},
    animations: { lite: animationBundle('lite'), full: animationBundle('full') },
    bounds: lod.bounds,
  };
  const manifest = {
    assets: {
      materials: { [material.id]: material },
      shaders: { [shader.id]: shader },
      textures: {},
      addons: {},
      bodies: { normal: body },
    },
  };
  const plan = {
    key: 'unity-animation-fixture',
    descriptor: { body: 'normal', color: 0, parts: [] },
    quality: AXIE_QUALITY_PROFILES['unity-default'],
    animationSet: 'full',
    body,
    bodyLod: { requestedLod: 0, resolvedLod: 0, asset: lod },
    partRigs: [],
    missingParts: [],
    warnings: [],
  };
  const materials = {
    create() { return new THREE.MeshBasicMaterial(); },
    createGeometryOutline() { return undefined; },
  };
  return { assets, manifest, materials, plan, released };
}

test('assembler loads only the two official Unity body animation dictionaries', async () => {
  const { assets, manifest, materials, plan } = fixture();
  const calls = [];
  const animations = {
    async loadBundle(url) {
      calls.push(url);
      return { clips: [new THREE.AnimationClip(url, 1, [])], events: [], payloads: [] };
    },
    clearCache() {},
  };
  const progress = [];
  const assembler = new ThreeAxieAssembler({
    manifest,
    assets,
    materials,
    animations,
    addons: false,
  });
  const assembly = await assembler.assemble(plan, {
    descriptor: plan.descriptor,
    quality: plan.quality,
    animationSet: 'full',
    strict: true,
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(calls, ['/base/lite.json', '/base/full.json']);
  assert.equal(assembly.clipSets.lite.length, 1);
  assert.equal(assembly.clipSets.full.length, 1);
  assert.strictEqual(assembly.clips, assembly.clipSets.full);
  assert.ok(progress.some((event) => (
    event.stage === 'animations' && event.completed === 2 && event.total === 2
  )));

  assembly.ownedMaterials.forEach((owned) => owned.dispose());
  assembly.leases.forEach((lease) => lease.release());
});

test('non-strict assembly skips body-rest geometry without authoritative socket matrices', async () => {
  const { assets, manifest, materials, plan } = fixture();
  plan.body.restPoseUrl = '/rest/missing-normal.json';
  const partLod = {
    sourceLod: 0,
    url: '/part.glb',
    sceneNode: 'FixtureEye',
    meshName: 'FixtureEye',
    vertexCount: 0,
    triangleCount: 0,
    bounds: { min: [0, 0, 0], max: [0, 0, 0] },
    contentHash: 'part',
    coordinateSpace: 'body-rest',
    bodyRestReferenceBody: 'normal',
  };
  const rig = {
    type: 'Eye_M',
    attachNode: 'Root_Eye_M_JNT',
    sourcePrefabName: 'FixtureEye',
    lods: [partLod],
    materialId: 'body-material',
  };
  plan.partRigs = [{
    partId: 'S00_Beast02_L1_Eye',
    partType: 'eye',
    rigType: 'Eye_M',
    attachNode: rig.attachNode,
    rig,
    lod: { requestedLod: 0, resolvedLod: 0, asset: partLod },
    materialId: rig.materialId,
  }];
  manifest.assets.bodies.normal = plan.body;
  const animations = {
    async loadRestPose() { throw new Error('fixture rest pose is unavailable'); },
    async loadBundle(url) { return { clips: [new THREE.AnimationClip(url, 1, [])], events: [], payloads: [] }; },
    clearCache() {},
  };
  const assembler = new ThreeAxieAssembler({
    manifest,
    assets,
    materials,
    animations,
    addons: false,
  });
  const assembly = await assembler.assemble(plan, {
    descriptor: plan.descriptor,
    quality: plan.quality,
    animationSet: 'full',
    strict: false,
  });

  assert.equal(assembly.diagnostics.rigs.length, 1);
  assert.equal(assembly.diagnostics.rigs[0].attached, false);
  assert.ok(assembly.diagnostics.events.some((event) => (
    event.code === 'attach-node-missing'
      && event.message.includes('Cannot attach body-rest part S00_Beast02_L1_Eye/Eye_M')
  )));
  const attachedEye = assembly.model.getObjectByName('FixtureEye');
  assert.equal(attachedEye, undefined);

  assembly.ownedMaterials.forEach((owned) => owned.dispose());
  assembly.leases.forEach((lease) => lease.release());
});
