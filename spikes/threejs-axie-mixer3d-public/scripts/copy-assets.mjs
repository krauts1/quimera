#!/usr/bin/env node
import { cp, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const packageRoot = path.resolve(import.meta.dirname, '..');
const source = path.join(packageRoot, 'public/assets/axie');
const targetArgument = process.argv.slice(2).find((argument) => !argument.startsWith('-'));
const target = path.resolve(process.cwd(), targetArgument ?? 'public/assets/axie');
const receipt = JSON.parse(await readFile(path.join(packageRoot, 'content-integrity.json'), 'utf8'));
await mkdir(path.dirname(target), { recursive: true });
await cp(source, target, { recursive: true, force: true });
console.log(`Copied ${receipt.fileCount} sealed runtime files (${receipt.totalBytes} bytes) to ${target}`);
