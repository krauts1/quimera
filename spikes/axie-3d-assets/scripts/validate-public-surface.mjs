import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ignored = new Set(['.git', 'node_modules', 'dist']);
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.mjs']);
const scannerFiles = new Set([
  'scripts/validate-assets.mjs',
  'scripts/validate-public-surface.mjs',
]);
const forbidden = [
  /\/Users\//,
  /Documents\/Codex/i,
  /Downloads\//i,
  /Axie-Expanded/i,
  /drive\.google\.com/i,
  /sourceVault/i,
  /codex:\/\/threads/i,
  /slack\.com\/archives/i,
];

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const files = await walk(root);
for (const file of files) {
  if (scannerFiles.has(relative(root, file))) continue;
  if (!textExtensions.has(extname(file))) continue;
  const text = await readFile(file, 'utf8');
  for (const pattern of forbidden) {
    assert(!pattern.test(text), `${relative(root, file)} contains non-public reference ${pattern}`);
  }
}

assert(files.some((file) => relative(root, file) === 'RIGHTS.md'), 'RIGHTS.md missing');
assert(files.some((file) => relative(root, file) === 'docs/GETTING_STARTED.md'), 'beginner guide missing');
console.log(`PASS public surface: ${files.length} files checked; no private workspace references.`);
