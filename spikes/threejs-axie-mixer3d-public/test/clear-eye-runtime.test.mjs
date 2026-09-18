import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import {
  AXIE_CLEAR_EYE_L1_PART_ID,
  AxieMixerV4Material,
  createAxieEyeController,
} from '../dist/three.js';

const clearDescriptor = Object.freeze({
  body: 'normal',
  colorVariant: 0,
  parts: Object.freeze([
    Object.freeze({ type: 'eye', skin: 0, class: 'Aquatic', variant: 4, level: 1 }),
  ]),
});
const quality = Object.freeze({ textureVariant: 'unity-import', anisotropy: 1 });

function fixture(descriptor = clearDescriptor) {
  const originalTexture = new THREE.Texture();
  const material = new AxieMixerV4Material({
    map: originalTexture,
    primaryColor: '#ffffff',
    secondaryColor: '#ffffff',
    name: 'ClearEyeTest',
  });
  const geometry = new THREE.BufferGeometry();
  const surface = new THREE.Mesh(geometry, material);
  surface.userData.axiePartId = AXIE_CLEAR_EYE_L1_PART_ID;
  surface.castShadow = true;
  const outline = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  outline.userData.axiePartId = AXIE_CLEAR_EYE_L1_PART_ID;
  outline.userData.axieOutline = true;
  const model = new THREE.Group();
  model.add(surface, outline);
  return { target: { model, descriptor, quality }, material, originalTexture, surface, outline };
}

async function withRasterDom(run) {
  const previousDocument = globalThis.document;
  const previousImage = globalThis.Image;
  const previousCreate = URL.createObjectURL;
  const previousRevoke = URL.revokeObjectURL;
  const context = {
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillRect() {},
    drawImage() {},
  };
  const rasterizedBlobs = [];
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      return { width: 0, height: 0, getContext: () => context };
    },
  };
  globalThis.Image = class MockImage {
    decoding = 'auto';
    src = '';
    async decode() {}
  };
  URL.createObjectURL = (blob) => {
    rasterizedBlobs.push(blob);
    return 'blob:clear-eye-test';
  };
  URL.revokeObjectURL = () => {};
  try {
    return await run({ rasterizedBlobs });
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImage === undefined) delete globalThis.Image;
    else globalThis.Image = previousImage;
    URL.createObjectURL = previousCreate;
    URL.revokeObjectURL = previousRevoke;
  }
}

test('controller rasterizes the sealed pupil-free vector derivative and restores ownership', async () => {
  await withRasterDom(async ({ rasterizedBlobs }) => {
    const { target, material, originalTexture, surface, outline } = fixture();
    const originalShader = material.fragmentShader;
    const controller = await createAxieEyeController(target);
    const runtimeTexture = material.uniforms.uMainTex.value;
    let textureDisposeCount = 0;
    runtimeTexture.addEventListener('dispose', () => { textureDisposeCount += 1; });

    assert.equal(controller.supported, true);
    assert.equal(controller.inspect().sourceSvgSha256, 'c431d5623d4d267501761c22a521137f3947ae79f4864ab79c08bcb7aaf39f82');
    assert.equal(controller.inspect().pupilFreeSvgSha256, '9425889489f416f0b69948f8719fc477b90c7ca282095e4a3b3e36dd5367b0ad');
    assert.equal(controller.inspect().textureRevision, 2);
    assert.equal(rasterizedBlobs.length, 1);
    const runtimeSvg = await rasterizedBlobs[0].text();
    const runtimePaths = [...runtimeSvg.matchAll(/<path\b[^>]*\/>/g)].map((match) => match[0]);
    const runtimePathHashes = new Set(runtimePaths.map((path) => (
      createHash('sha256').update(path).digest('hex')
    )));
    assert.equal(runtimePaths.length, 62);
    for (const removedHash of [
      'df0822d174a77b143c0c656aab3fc0fac46364fb2c84cad3b05cc8166682f82c',
      'e64f295c7d59be3811633e61fa5c0a9516572df8e4829bf9d971e0ac8d78fdde',
      '7980f1566c3abb34edcdce3cada8ff8f12680aeba5b958bfe5e13eb4a07627cd',
      '2f93d096e53f6fe33f30eddfc96bec5c755b36302a306b5612d49da693e49760',
      '703548577ac90769b1594266c187d9111bf09f865b4b8a7916cb3391924ef2f8',
    ]) assert.equal(runtimePathHashes.has(removedHash), false);
    assert.notEqual(runtimeTexture, originalTexture);
    assert.match(material.fragmentShader, /axieClearEyeCompose/);
    assert.doesNotMatch(material.fragmentShader, /sourcePupil|irisColor/);
    assert.match(material.fragmentShader, /gazeCommand \/= max\(1\.0, length\(gazeCommand\)\)/);
    assert.match(material.fragmentShader, /gazeCommand\.x >= 0\.0 \? 0\.34 : 0\.35/);
    assert.match(material.fragmentShader, /gazeCommand\.y >= 0\.0 \? 0\.42 : 0\.31/);
    assert.match(material.fragmentShader, /sideForeshorten = 1\.0 - 0\.12/);
    assert.equal(surface.castShadow, false);
    assert.equal(surface.userData.axieDepthNormalsExcluded, true);
    assert.equal(outline.visible, false);

    controller.dispose();
    assert.equal(material.uniforms.uMainTex.value, originalTexture);
    assert.equal(material.fragmentShader, originalShader);
    assert.equal(material.uniforms.uAxieClearEyeEnabled, undefined);
    assert.equal(material.userData.axieEyeRuntime, undefined);
    assert.equal(surface.castShadow, true);
    assert.equal(surface.userData.axieDepthNormalsExcluded, undefined);
    assert.equal(outline.visible, true);
    assert.equal(textureDisposeCount, 1);
  });
});

test('controller normalizes fixed and pointer diagonals and pauses alive planning while controlled', async () => {
  await withRasterDom(async () => {
    const { target } = fixture();
    const controller = await createAxieEyeController(target, { randomSeed: 0xabcddcba });
    controller.update(2);
    const beforeControl = controller.inspect();
    controller.setConfig({ gazeMode: 'fixed', fixedGaze: { x: 1, y: 1 } });
    for (let frame = 0; frame < 600; frame += 1) controller.update(1 / 60);
    const fixed = controller.inspect();
    assert.ok(Math.abs(Math.hypot(fixed.gaze.x, fixed.gaze.y) - 1) < 1e-6);
    assert.ok(Math.abs(Math.hypot(
      controller.config.fixedGaze.x,
      controller.config.fixedGaze.y,
    ) - 1) < 1e-12);
    assert.equal(fixed.ambientSaccadeCount, beforeControl.ambientSaccadeCount);

    controller.setConfig({ gazeMode: 'pointer' });
    controller.setPointerGaze(-1, 1, true);
    for (let frame = 0; frame < 120; frame += 1) controller.update(1 / 60);
    const pointer = controller.inspect();
    assert.ok(Math.abs(Math.hypot(pointer.gaze.x, pointer.gaze.y) - 1) < 1e-6);
    assert.equal(pointer.ambientSaccadeCount, beforeControl.ambientSaccadeCount);
    controller.dispose();
  });
});

test('disabling automatic blinking also suppresses gaze-coordinated blinks', async () => {
  await withRasterDom(async () => {
    const { target } = fixture();
    const controller = await createAxieEyeController(target, {
      randomSeed: 0x434c4541,
      initialConfig: { autoBlink: false, gazeMode: 'ambient' },
    });
    for (let frame = 0; frame < 60 * 180; frame += 1) controller.update(1 / 60);
    const inspection = controller.inspect();
    assert.ok(inspection.ambientSaccadeCount > 100);
    assert.equal(inspection.blinkCount, 0);
    assert.equal(inspection.blinkWeight, 0);
    controller.dispose();
  });
});

test('custom SVG overrides do not claim canonical provenance', async () => {
  await withRasterDom(async () => {
    const { target, material } = fixture();
    const controller = await createAxieEyeController(target, {
      svgSource: '<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h1v1z"/></svg>',
    });
    assert.equal(controller.inspect().sourceSvgSha256, undefined);
    assert.equal(controller.inspect().pupilFreeSvgSha256, undefined);
    assert.equal(material.userData.axieEyeRuntime.sourceSvgCanonical, false);
    controller.dispose();
  });
});

test('constructor failure disposes its CanvasTexture without mutating auxiliary passes', async () => {
  await withRasterDom(async () => {
    const { target, material, originalTexture, surface, outline } = fixture();
    material.userData.axieEyeRuntime = Object.freeze({ occupied: true });
    const originalDispose = THREE.CanvasTexture.prototype.dispose;
    let disposeCount = 0;
    THREE.CanvasTexture.prototype.dispose = function countedDispose() {
      disposeCount += 1;
      return originalDispose.call(this);
    };
    try {
      await assert.rejects(createAxieEyeController(target), /already has an eye runtime/);
    } finally {
      THREE.CanvasTexture.prototype.dispose = originalDispose;
    }
    assert.equal(disposeCount, 1);
    assert.equal(material.uniforms.uMainTex.value, originalTexture);
    assert.equal(surface.castShadow, true);
    assert.equal(surface.userData.axieDepthNormalsExcluded, undefined);
    assert.equal(outline.visible, true);
  });
});

test('unsupported eye descriptors return a no-op controller without touching the scene', async () => {
  const unsupportedDescriptor = {
    ...clearDescriptor,
    parts: [{ type: 'eye', skin: 0, class: 'Aquatic', variant: 2, level: 1 }],
  };
  const { target, surface, outline } = fixture(unsupportedDescriptor);
  const controller = await createAxieEyeController(target);
  assert.equal(controller.supported, false);
  assert.equal(controller.partId, 'S00_Aquatic02_L1_Eye');
  assert.equal(surface.castShadow, true);
  assert.equal(outline.visible, true);
  assert.equal(controller.blink(), false);
  controller.dispose();
  assert.equal(controller.inspect().disposed, true);
});
