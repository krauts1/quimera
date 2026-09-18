#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { access, lstat, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const requireTracked = process.argv.includes('--require-tracked');
const officialGraphqlEndpoint = 'https://api-gateway.skymavis.com/graphql/axie-marketplace';
const ignoredDirectories = new Set(['.git', 'demo-dist', 'dist', 'node_modules']);

async function repositoryFiles(directory = root, relative = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!relative && ignoredDirectories.has(entry.name)) continue;
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) files.push({ path: nextRelative, absolute, symbolicLink: true });
    else if (entry.isDirectory()) files.push(...await repositoryFiles(absolute, nextRelative));
    else if (entry.isFile()) files.push({ path: nextRelative, absolute, symbolicLink: false });
  }
  return files;
}

async function requireFile(path) {
  const absolute = resolve(root, path);
  await access(absolute);
  assert((await lstat(absolute)).isFile(), `${path} must be a regular repository file.`);
}

const requiredFiles = [
  'README.md',
  'RIGHTS.md',
  'THIRD_PARTY_NOTICES.md',
  'SECURITY.md',
  'public/assets/axie/manifest.json',
  'public/assets/axie/provenance/paired-weapon-animations.json',
  'content-integrity.json',
  'server/axie-lookup.ts',
  'src/index.ts',
  'src/clear-eye-source.generated.ts',
  'src/kotaro-eye-source.generated.ts',
];
await Promise.all(requiredFiles.map(requireFile));

const files = await repositoryFiles();
const symbolicLinks = files.filter((file) => file.symbolicLink).map((file) => file.path);
assert.deepEqual(symbolicLinks, [], `Repository resources must not depend on symlinks: ${symbolicLinks.join(', ')}`);

let trackedRepositoryFiles = null;
if (requireTracked) {
  const untrackedResult = spawnSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(untrackedResult.status, 0, `Unable to inspect untracked Git files: ${untrackedResult.stderr}`);
  const untracked = untrackedResult.stdout.split('\0').filter(Boolean);
  assert.deepEqual(untracked, [], `A fresh Git clone would omit these repository files:\n${untracked.join('\n')}`);

  const trackedResult = spawnSync('git', ['ls-files', '--cached', '-z'], { cwd: root, encoding: 'utf8' });
  assert.equal(trackedResult.status, 0, `Unable to inspect tracked Git files: ${trackedResult.stderr}`);
  const tracked = new Set(trackedResult.stdout.split('\0').filter(Boolean));
  const missingTracked = requiredFiles.filter((path) => !tracked.has(path));
  assert.deepEqual(missingTracked, [], `Required resources are absent from the Git index:\n${missingTracked.join('\n')}`);
  trackedRepositoryFiles = tracked.size;
}

const scanPaths = files.filter(({ path, symbolicLink }) => (
  !symbolicLink
  && path !== 'scripts/validate-self-contained.mjs'
  && !path.startsWith('public/assets/axie/shaders/')
  && /\.(?:css|html|js|json|jsonc|md|mjs|ts|txt)$/u.test(path)
));

const forbiddenReferences = [
  [/\/(?:Users|Volumes)\//u, 'machine-specific path'],
  [/(?:drive|docs)\.google\.com/iu, 'private document host'],
  [/\b(?:notion|slack|coolify|cloudflare)\b/iu, 'internal service reference'],
  [/\b(?:folderId|google-drive-folder-snapshot)\b/iu, 'private source-delivery identifier'],
  [/\bdesign-source\//iu, 'private design-source path'],
  [/\bfunctions\/_shared\//iu, 'private deployment path'],
  [/github\.com\/(?:jaatster|axieinfinity)\/unity-axie-mixer3d/iu, 'private source repository'],
  [/(?:BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})/u, 'credential material'],
];
const referenceFailures = [];
for (const file of scanPaths) {
  const source = await readFile(file.absolute, 'utf8');
  for (const [pattern, label] of forbiddenReferences) {
    if (pattern.test(source)) referenceFailures.push(`${file.path}: ${label}`);
  }
}
assert.deepEqual(referenceFailures, [], `Non-public references found:\n${referenceFailures.join('\n')}`);

const browserFiles = scanPaths.filter(({ path }) => path.startsWith('src/') || path.startsWith('demo/'));
const browserSecretReferences = [];
const browserOfficialEndpointReferences = [];
for (const file of browserFiles) {
  const source = await readFile(file.absolute, 'utf8');
  if (source.includes('SKY_MAVIS_API_KEY')) browserSecretReferences.push(file.path);
  if (source.includes(officialGraphqlEndpoint)) browserOfficialEndpointReferences.push(file.path);
}
assert.deepEqual(browserSecretReferences, [], 'Browser code must not name or read the Sky Mavis API key.');
assert.deepEqual(browserOfficialEndpointReferences, [], 'Browser code must not call Sky Mavis GraphQL directly.');

const serverResolver = await readFile(resolve(root, 'server/axie-lookup.ts'), 'utf8');
assert(serverResolver.includes(officialGraphqlEndpoint), 'Server resolver must use the official Sky Mavis marketplace GraphQL endpoint.');
assert(serverResolver.includes("'X-API-Key'"), 'Server resolver must authenticate with the server-only API key header.');

const packageJson = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
assert.equal(packageJson.private, true, 'Rights-gated package must remain private.');
assert.equal(packageJson.license, 'SEE LICENSE IN RIGHTS.md');
for (const requiredPackagePath of ['dist', 'public/assets/axie', 'scripts/copy-assets.mjs']) {
  assert(packageJson.files.includes(requiredPackagePath), `Package files must include ${requiredPackagePath}.`);
}

const manifest = JSON.parse(await readFile(resolve(root, 'public/assets/axie/manifest.json'), 'utf8'));
assert.equal(manifest.source.repository, 'https://github.com/jaatster/threejs-axie-mixer3d-public');
assert.equal(manifest.source.commit, 'public-content-v1');

const integrity = JSON.parse(await readFile(resolve(root, 'content-integrity.json'), 'utf8'));
assert.equal(integrity.orphanedFiles.length, 0, 'Runtime content receipt must have zero orphaned files.');
assert.equal(integrity.fileCount, 5821, 'Runtime content closure cardinality drift.');
assert.ok(integrity.totalBytes > 500_000_000, 'Runtime content closure is unexpectedly small.');

console.log(JSON.stringify({
  ok: true,
  officialApi: officialGraphqlEndpoint,
  browserDirectApiCalls: 0,
  browserSecretReferences: 0,
  nonPublicReferences: 0,
  repositorySymlinks: 0,
  gitTrackedGate: requireTracked,
  trackedRepositoryFiles,
  requiredRepositoryResources: requiredFiles.length,
  runtimeContentFiles: integrity.fileCount,
  runtimeContentBytes: integrity.totalBytes,
  runtimeContentSha256: integrity.aggregateSha256,
}, null, 2));
