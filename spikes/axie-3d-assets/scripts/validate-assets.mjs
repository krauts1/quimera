import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { validateBytes } from 'gltf-validator';
import { assetDefinitions } from './asset-definitions.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const assetsRoot = resolve(root, 'assets');
const write = process.argv.includes('--write');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const privatePattern = /(\/Users\/|Documents\/Codex|Downloads\/|sourceVault|Axie-Expanded|drive\.google\.com|file:\/\/|[A-Z]:\\)/i;

function glbJson(bytes) {
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'expected GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'expected glTF 2.0');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB byte length mismatch');
  let offset = 12;
  while (offset < bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(bytes.subarray(start, start + length).toString('utf8').trim());
    }
    offset = start + length;
  }
  throw new Error('GLB has no JSON chunk.');
}

function stableCatalog(models) {
  return `${JSON.stringify({ schemaVersion: 1, models }, null, 2)}\n`;
}

const results = [];
let warningCount = 0;

for (const definition of assetDefinitions) {
  const path = resolve(assetsRoot, definition.path);
  const bytes = await readFile(path);
  const json = glbJson(bytes);
  const jsonText = JSON.stringify(json);
  assert(!privatePattern.test(jsonText), `${definition.id}: private source reference found in GLB metadata`);
  for (const buffer of json.buffers ?? []) {
    assert(!buffer.uri, `${definition.id}: GLB references an external buffer`);
  }
  for (const image of json.images ?? []) {
    assert(!image.uri, `${definition.id}: GLB references an external image`);
  }

  const validator = await validateBytes(new Uint8Array(bytes), {
    uri: definition.path,
    maxIssues: 200,
  });
  assert.equal(validator.issues.numErrors, 0, `${definition.id}: glTF Validator reported errors`);
  const warnings = validator.issues.messages.filter((message) => message.severity === 1);
  assert(
    warnings.every((message) => message.code === 'NODE_SKINNED_MESH_NON_ROOT'),
    `${definition.id}: glTF Validator reported an unexpected warning`,
  );
  warningCount += validator.issues.numWarnings;

  const document = await io.readBinary(new Uint8Array(bytes));
  const documentRoot = document.getRoot();
  const animationObjects = documentRoot.listAnimations();
  const animations = animationObjects.map((animation) => animation.getName());
  assert.deepEqual(animations.toSorted(), definition.animations.toSorted(), `${definition.id}: animation catalog drift`);
  for (const animation of animationObjects) {
    assert(animation.listChannels().length > 0, `${definition.id}/${animation.getName()}: no channels`);
    assert(animation.listSamplers().length > 0, `${definition.id}/${animation.getName()}: no samplers`);
    let hasMotion = false;
    for (const channel of animation.listChannels()) {
      assert(channel.getTargetNode(), `${definition.id}/${animation.getName()}: channel has no target node`);
    }
    for (const sampler of animation.listSamplers()) {
      const input = sampler.getInput();
      const output = sampler.getOutput();
      assert(input && input.getCount() >= 2, `${definition.id}/${animation.getName()}: sampler needs at least two keyframes`);
      assert(output && output.getCount() >= input.getCount(), `${definition.id}/${animation.getName()}: sampler output is incomplete`);
      const times = input.getArray();
      assert(times.every(Number.isFinite), `${definition.id}/${animation.getName()}: non-finite keyframe time`);
      assert(times.at(-1) > times[0], `${definition.id}/${animation.getName()}: animation duration is not positive`);
      const values = output.getArray();
      assert(values.every(Number.isFinite), `${definition.id}/${animation.getName()}: non-finite animation value`);
      const width = output.getElementSize();
      for (let index = width; index < values.length; index += 1) {
        if (Math.abs(values[index] - values[index % width]) > 1e-7) {
          hasMotion = true;
          break;
        }
      }
    }
    assert(hasMotion, `${definition.id}/${animation.getName()}: clip contains no changing values`);
  }
  assert(documentRoot.listMeshes().length > 0, `${definition.id}: no meshes`);
  assert(documentRoot.listMaterials().length > 0, `${definition.id}: no materials`);
  assert(documentRoot.listTextures().length > 0, `${definition.id}: no embedded textures`);

  const bones = new Set();
  for (const skin of documentRoot.listSkins()) {
    for (const joint of skin.listJoints()) bones.add(joint);
  }
  assert(bones.size >= definition.minimumBones, `${definition.id}: expected at least ${definition.minimumBones} bones, found ${bones.size}`);

  results.push({
    id: definition.id,
    name: definition.name,
    family: definition.family,
    familyLabel: definition.familyLabel,
    path: definition.path,
    ...(definition.equipment ? { equipment: definition.equipment } : {}),
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    meshes: documentRoot.listMeshes().length,
    materials: documentRoot.listMaterials().length,
    textures: documentRoot.listTextures().length,
    bones: bones.size,
    animations: definition.animations,
  });
}

const catalog = stableCatalog(results);
const catalogPath = resolve(assetsRoot, 'catalog.json');
if (write) {
  await writeFile(catalogPath, catalog, 'utf8');
} else {
  assert.equal(await readFile(catalogPath, 'utf8'), catalog, 'assets/catalog.json is stale; run npm run catalog');
}

const animated = results.filter((entry) => entry.animations.length > 0);
console.log(`PASS assets: ${results.length} GLBs; ${animated.length} animated models; ${results.reduce((sum, entry) => sum + entry.animations.length, 0)} clips; ${warningCount} validator warnings.`);
