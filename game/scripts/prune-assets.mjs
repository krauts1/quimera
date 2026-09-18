// T12: poda del pack de assets (588 MB) al subconjunto que el juego usa.
// Usa el plan-builder determinista del propio toolkit: para cada Axie sembrado
// (nivel 1 y su variante nivel 2 de botín Alfa) construye el plan de mezcla y
// recolecta cada URL de asset. Suma manifest, shaders y animaciones de los
// cuerpos usados. Con --copy <dir> copia el subconjunto (para el deploy).
//
// Uso:  node scripts/prune-assets.mjs            → reporte de tamaño
//       node scripts/prune-assets.mjs --copy dist/assets/axie
import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  decodeAxieGenes,
  DeterministicAxiePlanBuilder,
} from '@jaatster/threejs-axie-mixer3d-public';

const ASSET_ROOT = 'public/assets/axie';
const copyFlag = process.argv.indexOf('--copy');
const outDir = copyFlag !== -1 ? process.argv[copyFlag + 1] : null;

const manifest = JSON.parse(await readFile(join(ASSET_ROOT, 'manifest.json'), 'utf8'));
const axies = JSON.parse(await readFile('public/data/axies.json', 'utf8'));
const builder = new DeterministicAxiePlanBuilder();

/** Recolecta rutas de asset y, aparte, TODO string (para resolver ids después). */
function collectUrls(node, into, strings) {
  if (typeof node === 'string') {
    if (/\.(glb|png|ktx2|basis|jpg|webp|json|axanim|bin)$/i.test(node)) into.add(node);
    strings?.add(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) collectUrls(item, into, strings);
    return;
  }
  if (node && typeof node === 'object') {
    for (const value of Object.values(node)) collectUrls(value, into, strings);
  }
}

const urls = new Set();
const planStrings = new Set();
const usedBodies = new Set();
const request = (descriptor) => ({ descriptor, quality: 'balanced' });
let l2Fallbacks = 0;

for (const entry of axies) {
  const { descriptor } = decodeAxieGenes(entry.genes);
  usedBodies.add(descriptor.body);
  collectUrls(builder.build(manifest, request(descriptor)), urls, planStrings);

  // variante de botín Alfa / injerto: partes activas a nivel 2 (las que existan)
  const activeTypes = new Set(['mouth', 'horn', 'tail', 'back']);
  const l2parts = [];
  for (const part of descriptor.parts) {
    if (!activeTypes.has(part.type)) {
      l2parts.push(part);
      continue;
    }
    const leveled = { ...part, level: 2 };
    try {
      collectUrls(
        builder.build(manifest, request({ ...descriptor, parts: [...descriptor.parts.filter((p) => p !== part), leveled] })),
        urls,
        planStrings,
      );
      l2parts.push(leveled);
    } catch {
      l2Fallbacks += 1;
      l2parts.push(part); // esa parte no tiene asset L2: se queda en L1
    }
  }
}

// Animaciones: AMBOS sets completos (full + lite) de los cuerpos usados.
// VERIFICADO (3 sep, a la mala): el ensamblador del personaje carga los DOS
// diccionarios sin importar animationSet ("Unity retains both dictionaries") —
// recortar lite rompe el boot con "AXANIM payload has an invalid magic header"
// (payload faltante → fallback SPA a index.html). Lo mismo con los payloads
// "de armas": la carga es eager. NO recortar payloads de animación.
for (const body of usedBodies) {
  for (const set of ['full', 'lite']) {
    const indexPath = join(ASSET_ROOT, 'animations', body, set, 'index.json');
    try {
      const index = JSON.parse(await readFile(indexPath, 'utf8'));
      urls.add(`/assets/axie/animations/${body}/${set}/index.json`);
      for (const clip of index.clips ?? []) {
        if (clip.payloadUrl) urls.add(clip.payloadUrl);
      }
    } catch {
      /* cuerpo sin ese set */
    }
  }
}

// Segunda pasada: resolver ids de material/textura/addon que el plan referencia
// sin URL embebida (plan → materialId → material.textures → texture.variants).
const materials = manifest.assets.materials ?? {};
const texturesById = manifest.assets.textures ?? {};
const addons = manifest.assets.addons ?? {};
const textureIds = new Set();
for (const s of planStrings) {
  const material = materials[s];
  if (material) {
    for (const texId of Object.values(material.textures ?? {})) textureIds.add(texId);
    collectUrls(material, urls);
  }
  if (texturesById[s]) textureIds.add(s);
  if (addons[s]) collectUrls(addons[s], urls);
}
for (const texId of textureIds) {
  const tex = texturesById[texId];
  if (tex) collectUrls(tex, urls);
}
console.log(`materiales/texturas resueltos por id: ${textureIds.size} texturas`);

// Fijos: manifest + shaders completos (son chicos y difíciles de trazar).
urls.add('/assets/axie/manifest.json');

/** Ruta relativa dentro del pack a partir de una URL del manifest/plan. */
function toRelative(url) {
  const m = url.match(/assets\/axie\/(.+)$/);
  return m ? m[1] : url.replace(/^\.?\//, '');
}

const files = new Set([...urls].map(toRelative));
// shaders completos (recursivo; solo archivos)
const { readdir } = await import('node:fs/promises');
for (const entry of await readdir(join(ASSET_ROOT, 'shaders'), {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile()) continue;
  const parent = entry.parentPath ?? entry.path;
  const rel = join(parent, entry.name).split('/assets/axie/')[1] ?? `shaders/${entry.name}`;
  files.add(rel.startsWith('shaders') ? rel : `shaders/${entry.name}`);
}

let total = 0;
let missing = 0;
const present = [];
for (const rel of [...files].sort()) {
  try {
    const s = await stat(join(ASSET_ROOT, rel));
    total += s.size;
    present.push(rel);
  } catch {
    missing += 1;
  }
}

const byDir = new Map();
for (const rel of present) {
  const dir = rel.split('/')[0];
  const s = await stat(join(ASSET_ROOT, rel));
  byDir.set(dir, (byDir.get(dir) ?? 0) + s.size);
}
console.log(`axies: ${axies.length} · cuerpos usados: ${[...usedBodies].join(', ')}`);
console.log(`partes sin variante L2 (se quedan L1): ${l2Fallbacks}`);
console.log(`archivos: ${present.length} (${missing} referencias fuera del pack ignoradas)`);
for (const [dir, size] of [...byDir].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${dir.padEnd(14)} ${(size / 1e6).toFixed(1).padStart(8)} MB`);
}
console.log(`TOTAL podado: ${(total / 1e6).toFixed(1)} MB (pack completo: 588 MB)`);

if (outDir) {
  let copied = 0;
  for (const rel of present) {
    const dst = join(outDir, rel);
    await mkdir(dirname(dst), { recursive: true });
    await copyFile(join(ASSET_ROOT, rel), dst);
    copied += 1;
  }
  console.log(`copiados ${copied} archivos a ${outDir}`);
}
