import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

async function typescriptFiles(relativeDirectory) {
  const directory = path.join(repoRoot, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) files.push(...await typescriptFiles(relativePath));
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(relativePath);
  }

  return files;
}

test('delivered outline postprocess remains absent from default runtime and demo ownership', async () => {
  const implementation = 'src/outline-postprocess-material.ts';
  const candidates = [
    ...await typescriptFiles('src'),
    ...await typescriptFiles('demo'),
  ].filter((file) => file !== implementation);

  const accidentalOwners = [];
  for (const file of candidates) {
    const source = await readFile(path.join(repoRoot, file), 'utf8');
    if (/\bnew\s+AxieOutlinePostProcess(?:Pass|Material)\b/.test(source)) {
      accidentalOwners.push(file);
    }
  }

  assert.deepEqual(
    accidentalOwners,
    [],
    'The delivered Unity renderer graph never instantiates the Axie outline postprocess; '
      + 'default Three.js runtime/demo ownership requires newer authoritative activation evidence.',
  );
});
