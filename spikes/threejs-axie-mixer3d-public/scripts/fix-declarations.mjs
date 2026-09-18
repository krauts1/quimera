#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const declarationsRoot = path.resolve(import.meta.dirname, '../dist/types');

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return declarationFiles(absolute);
    return entry.isFile() && entry.name.endsWith('.d.ts') ? [absolute] : [];
  }));
  return nested.flat();
}

let changedFiles = 0;
let changedSpecifiers = 0;
for (const file of await declarationFiles(declarationsRoot)) {
  const before = await readFile(file, 'utf8');
  const withoutStyleSideEffects = before.replace(/^import\s+['"]\.\.?\/[^'"\r\n]+\.css['"];?\r?\n/gm, '');
  const after = withoutStyleSideEffects.replace(/(['"])(\.\.?\/[^'"\r\n]+)(['"])/g, (match, open, specifier, close) => {
    if (open !== close || /\.(?:[cm]?js|json|css|wasm|node)$/i.test(specifier)) return match;
    changedSpecifiers += 1;
    return `${open}${specifier}.js${close}`;
  });
  if (after === before) continue;
  await writeFile(file, after);
  changedFiles += 1;
}

console.log(`Normalized ${changedSpecifiers} ESM declaration specifiers across ${changedFiles} files.`);
