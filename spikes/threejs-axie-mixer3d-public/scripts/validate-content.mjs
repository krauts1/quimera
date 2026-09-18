#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const contentRoot = path.join(root, 'public/assets/axie');
const integrityPath = path.join(root, 'content-integrity.json');
const write = process.argv.includes('--write');
const pruneOrphaned = process.argv.includes('--prune-orphaned');
assert.ok(!pruneOrphaned || write, '--prune-orphaned requires --write');
const prefix = '/assets/axie/';
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function collectUrls(value, result) {
  if (typeof value === 'string' && value.startsWith(prefix)) result.add(value.slice(prefix.length));
  else if (Array.isArray(value)) value.forEach((item) => collectUrls(item, result));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {
    // A generated bundle's public URL prefix names its containing directory;
    // only concrete runtime file URLs belong in the distributable closure.
    if (key !== 'publicUrlPrefix') collectUrls(item, result);
  });
}

async function allFiles(directory, relative = '') {
  const rows = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) rows.push(...await allFiles(path.join(directory, entry.name), nextRelative));
    else if (entry.isFile()) rows.push(nextRelative);
  }
  return rows;
}

const manifestBytes = await readFile(path.join(contentRoot, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schemaVersion, 2);
assert.equal(manifest.source.commit, 'public-content-v1');
assert.deepEqual({
  bodies: Object.keys(manifest.assets.bodies).length,
  parts: Object.keys(manifest.assets.parts).length,
  textures: Object.keys(manifest.assets.textures).length,
  materials: Object.keys(manifest.assets.materials).length,
  shaders: Object.keys(manifest.assets.shaders).length,
  addons: Object.keys(manifest.assets.addons).length,
  weapons: Object.keys(manifest.assets.weapons).length,
  colors: manifest.creator.colorVariants.length,
}, { bodies: 8, parts: 576, textures: 1088, materials: 1001, shaders: 13, addons: 46, weapons: 16, colors: 67 });

const closure = new Set(['manifest.json']);
collectUrls(manifest, closure);
for (const generated of ['src/addon-source-catalog.generated.ts', 'src/mystic-source-catalog.generated.ts']) {
  const source = await readFile(path.join(root, generated), 'utf8');
  for (const match of source.matchAll(/["'](\/assets\/axie\/[^"']+)["']/gu)) {
    closure.add(match[1].slice(prefix.length));
  }
}

// Animation index JSON points to the body-specific full/lite AXANIM binaries
// indirectly. Walk all
// reachable JSON until the URL closure stops growing.
let previousSize = -1;
while (closure.size !== previousSize) {
  previousSize = closure.size;
  for (const relative of [...closure]) {
    if (!relative.endsWith('.json')) continue;
    const absolute = path.resolve(contentRoot, relative);
    assert(absolute.startsWith(`${contentRoot}${path.sep}`), `Content path escaped root: ${relative}`);
    const document = JSON.parse(await readFile(absolute, 'utf8'));
    collectUrls(document, closure);
  }
}

const rows = [];
for (const relative of [...closure].sort()) {
  assert(!path.isAbsolute(relative) && !relative.startsWith('../'), `Unsafe content path ${relative}`);
  const absolute = path.join(contentRoot, relative);
  const bytes = await readFile(absolute);
  rows.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
}
const all = (await allFiles(contentRoot)).sort();
const orphaned = all.filter((relative) => !closure.has(relative));
if (pruneOrphaned) {
  for (const relative of orphaned) {
    const absolute = path.resolve(contentRoot, relative);
    assert.ok(absolute.startsWith(`${contentRoot}${path.sep}`), `Orphan path escaped content root: ${relative}`);
    await unlink(absolute);
  }
  orphaned.length = 0;
}
const totalBytes = rows.reduce((sum, row) => sum + row.bytes, 0);
const payload = {
  schemaVersion: 1,
  sourceCommit: manifest.source.commit,
  manifestSha256: sha256(manifestBytes),
  fileCount: rows.length,
  totalBytes,
  aggregateSha256: sha256(JSON.stringify(rows)),
  orphanedFiles: orphaned,
  files: rows,
};
const serialized = `${JSON.stringify(payload, null, 2)}\n`;
if (write) await writeFile(integrityPath, serialized);
else assert.equal(await readFile(integrityPath, 'utf8'), serialized, 'Content integrity receipt is stale');

assert.equal(rows.length, 5821, 'Runtime content closure cardinality drift');
assert.ok(totalBytes > 500_000_000, 'Runtime content closure byte count is unexpectedly small');
assert.equal(orphaned.length, 0, 'The distributable content directory must contain runtime-reachable files only');
console.log(JSON.stringify({ ok: true, files: rows.length, bytes: totalBytes, orphaned: orphaned.length, aggregateSha256: payload.aggregateSha256 }, null, 2));
