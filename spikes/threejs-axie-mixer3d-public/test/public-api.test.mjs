import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  AXIE_PINNED_SOURCE_COMMIT,
  createAxieAssetLocator,
  loadAxieManifest,
  validateAxieMixerManifest,
} from '../dist/index.js';
import { createAxieCreatorCatalog } from '../dist/creator-api.js';

const sourceManifest = JSON.parse(await readFile(new URL('../public/assets/axie/manifest.json', import.meta.url), 'utf8'));
const expectedWeaponFamilies = [
  'Axe',
  'Bow',
  'Brush',
  'Cannon',
  'Dagger',
  'Flag',
  'Flute',
  'Gauntlet',
  'Lantern',
  'Mala',
  'Spear',
  'Staff',
  'Sword',
  'Talisman',
  'Tome',
  'Whip',
];
const officialUnitySampleWeaponFamilies = [
  'Axe',
  'Bow',
  'Cannon',
  'Flag',
  'Gauntlet',
  'Mala',
  'Staff',
  'Sword',
  'Tome',
];

function hash(index) {
  return index.toString(16).padStart(64, '0');
}

function hasFinalWeaponSchema(value) {
  const weapons = value.assets?.weapons ?? {};
  return Object.keys(weapons).length === expectedWeaponFamilies.length
    && Object.values(weapons).every((weapon) => Array.isArray(weapon.variants) && weapon.variants.length > 0);
}

function upgradedWeaponManifestFixture(value) {
  const fixture = structuredClone(value);
  const allBodies = [...fixture.creator.bodyIds];
  let hashIndex = 1;
  const nextHash = () => hash(hashIndex++);
  const createVariant = (family, weapon, rigged) => {
    const id = `${family.toLowerCase()}-l1`;
    const skeletonSignature = nextHash();
    return {
      id,
      label: `${family} · Level 1`,
      level: 1,
      url: `/assets/axie/weapons/v2/${family}/${id}.glb`,
      contentHash: nextHash(),
      sourceFile: weapon.sourceFile,
      sourceSha256: weapon.sourceSha256,
      textureSourceFile: weapon.textureSourceFile,
      textureSha256: weapon.textureSha256,
      meshNames: [...weapon.meshNames],
      armatureCount: rigged ? 1 : 0,
      ...(rigged ? { skeletonSignature, requiredBones: [`${family}_Child`] } : {}),
      supportedBodyIds: allBodies,
    };
  };
  const createFamily = (family, sourceKind) => {
    const rigged = sourceKind === 'unity-sample-rig';
    const sourceSha256 = nextHash();
    const textureSha256 = nextHash();
    const contentHash = nextHash();
    const weapon = {
      id: family,
      label: family,
      url: `/assets/axie/weapons/v2/${family}/${family.toLowerCase()}-l1.glb`,
      attach: 'right',
      mirrorLeft: false,
      animationPrefix: family,
      clipPrefixes: [`${family}.`, `Action.${family}`],
      locomotionStyle: 'controller',
      supportedBodyIds: [],
      sourceClipCount: 0,
      sourceKind,
      sampleOrder: null,
      sourceFile: `Latest Unity/${family}/SM_${family}_Lvl1_Rig.fbx`,
      textureSourceFile: `Latest Unity/${family}/T_${family}_C.png`,
      sourceSha256,
      textureSha256,
      textureEmbedded: true,
      meshNames: [`SM_${family}_v1`],
      armatureCount: rigged ? 1 : 0,
      contentHash,
    };
    const variant = createVariant(family, weapon, rigged);
    weapon.variants = [variant];
    weapon.defaultVariantId = variant.id;
    return weapon;
  };

  fixture.assets.weapons.Brush ??= createFamily('Brush', 'source-static');
  fixture.assets.weapons.Lantern ??= createFamily('Lantern', 'unity-sample-rig');
  fixture.assets.weapons.Spear ??= createFamily('Spear', 'source-static');
  fixture.assets.weapons.Talisman ??= createFamily('Talisman', 'unity-sample-rig');
  for (const family of expectedWeaponFamilies) {
    const weapon = fixture.assets.weapons[family];
    const rigged = weapon.armatureCount > 0;
    const variant = createVariant(family, weapon, rigged);
    weapon.variants = [variant];
    weapon.defaultVariantId = variant.id;
  }

  return fixture;
}

const manifest = hasFinalWeaponSchema(sourceManifest)
  ? sourceManifest
  : upgradedWeaponManifestFixture(sourceManifest);

function reconcileSourceWeaponInventoryProvenance(value) {
  const entries = Object.entries(value.assets.weapons);
  const variants = entries.flatMap(([, family]) => family.variants);
  const parity = value.source.latestUnityWeaponParity;
  parity.generated.familyIds = entries.map(([familyId]) => familyId);
  parity.generated.variantIds = variants.map((variant) => variant.id);
  parity.generated.urls = variants.map((variant) => variant.url);
  parity.generated.contentHashes = variants.map((variant) => variant.contentHash);
  parity.coverage.riggedFamilies = entries
    .filter(([, family]) => family.sourceKind !== 'source-static')
    .map(([familyId]) => familyId);
  parity.coverage.staticFamilies = entries
    .filter(([, family]) => family.sourceKind === 'source-static')
    .map(([familyId]) => familyId);
  parity.coverage.totalFamilies = entries.length;
  parity.coverage.totalVariants = variants.length;
  return value;
}

test('asset locator relocates every canonical and nested animation URL', () => {
  const locator = createAxieAssetLocator({ assetBaseUrl: 'https://cdn.example/content/9dc39f/' });
  assert.equal(locator.manifestUrl, 'https://cdn.example/content/9dc39f/manifest.json');
  assert.equal(
    locator.resolve('/assets/axie/animations/payload/clip.axanim'),
    'https://cdn.example/content/9dc39f/animations/payload/clip.axanim',
  );
  assert.equal(
    locator.resolve('../rest/normal.json', 'https://cdn.example/content/9dc39f/animations/normal/index.json'),
    'https://cdn.example/content/9dc39f/animations/rest/normal.json',
  );
});

test('manifest loader validates pinned source, creator catalogs, official sample, and source inventory', async () => {
  const fetched = [];
  const loaded = await loadAxieManifest({
    assetBaseUrl: '/subpath/axie/',
    fetcher: async (url) => {
      fetched.push(String(url));
      return new Response(JSON.stringify(manifest), { status: 200, headers: { 'content-type': 'application/json' } });
    },
  });
  assert.deepEqual(fetched, ['/subpath/axie/manifest.json']);
  assert.equal(loaded.source.commit, AXIE_PINNED_SOURCE_COMMIT);
  assert.equal(loaded.source.finalUnityParity.coordinateSpace, 'body-rest');
  assert.equal(loaded.source.finalUnityStandardParity.coordinateSpace, 'body-rest');
  assert.equal(Object.keys(loaded.assets.weapons).length, 16);
  assert.equal(new Set(Object.values(loaded.assets.weapons).flatMap((weapon) => weapon.variants.map((variant) => variant.id))).size,
    Object.values(loaded.assets.weapons).flatMap((weapon) => weapon.variants).length);
  const catalog = createAxieCreatorCatalog(loaded);
  assert.equal(catalog.bodies.length, 8);
  assert.equal(catalog.colors.length, 67);
  assert.deepEqual(Object.fromEntries(Object.entries(catalog.parts).map(([type, rows]) => [type, rows.length])), {
    back: 106,
    ear: 102,
    eye: 78,
    horn: 110,
    mouth: 78,
    tail: 102,
  });
});

test('source-pinned validation rejects a different source revision', () => {
  const drifted = structuredClone(manifest);
  drifted.source.commit = '0000000000000000000000000000000000000000';
  assert.throws(() => validateAxieMixerManifest(drifted), /does not match/);
  assert.doesNotThrow(() => validateAxieMixerManifest(drifted, { mode: 'schema' }));
});

test('schema 2 validation requires hash-sealed latest Unity weapon provenance in every mode', () => {
  const missing = structuredClone(manifest);
  delete missing.source.latestUnityWeaponParity;
  assert.throws(() => validateAxieMixerManifest(missing), /latest Unity weapon source provenance is required/);
  assert.throws(
    () => validateAxieMixerManifest(missing, { mode: 'schema' }),
    /latest Unity weapon source provenance is required/,
  );

  const invalidHash = structuredClone(manifest);
  invalidHash.source.latestUnityWeaponParity.sourceCatalog.fileSha256 = 'not-a-hash';
  assert.throws(() => validateAxieMixerManifest(invalidHash), /sourceCatalog fileSha256 must be a lowercase SHA-256 hash/);
});

test('weapon catalog validation fails closed on identity, URL, support, hash, and rig drift', async (context) => {
  await context.test('requires the exact nine official Unity sample prefabs while allowing extra source inventory', () => {
    assert.doesNotThrow(() => validateAxieMixerManifest(manifest));

    const missingOfficial = reconcileSourceWeaponInventoryProvenance(structuredClone(manifest));
    delete missingOfficial.assets.weapons.Axe;
    reconcileSourceWeaponInventoryProvenance(missingOfficial);
    assert.throws(
      () => validateAxieMixerManifest(missingOfficial),
      /missing official Unity AnimatorSample weapon Axe/,
    );

    const inventoryWithoutBrush = structuredClone(manifest);
    delete inventoryWithoutBrush.assets.weapons.Brush;
    reconcileSourceWeaponInventoryProvenance(inventoryWithoutBrush);
    assert.doesNotThrow(() => validateAxieMixerManifest(inventoryWithoutBrush));

    const promotedInventory = structuredClone(manifest);
    promotedInventory.assets.weapons.Dagger.sampleOrder = 9;
    assert.throws(
      () => validateAxieMixerManifest(promotedInventory),
      /source inventory only and must not claim an AnimatorSample order/,
    );
  });

  await context.test('seals source-authored official sample order, sockets, mirroring, and base prefab URLs', () => {
    const wrongOrder = structuredClone(manifest);
    wrongOrder.assets.weapons.Axe.sampleOrder = 1;
    assert.throws(() => validateAxieMixerManifest(wrongOrder), /official Unity sampleOrder must be 0/);

    const wrongBowSide = structuredClone(manifest);
    wrongBowSide.assets.weapons.Bow.attach = 'right';
    assert.throws(() => validateAxieMixerManifest(wrongBowSide), /attachment must be left/);

    const missingGauntletMirror = structuredClone(manifest);
    missingGauntletMirror.assets.weapons.Gauntlet.mirrorLeft = false;
    assert.throws(() => validateAxieMixerManifest(missingGauntletMirror), /mirrored left instance/);

    const variantAsBase = structuredClone(manifest);
    variantAsBase.assets.weapons.Sword.url = variantAsBase.assets.weapons.Sword.variants[0].url;
    assert.throws(() => validateAxieMixerManifest(variantAsBase), /base prefab GLB/);
  });

  await context.test('accepts the exact nine-prefab runtime without legacy inferred-action metadata', () => {
    const value = structuredClone(manifest);
    for (const familyId of Object.keys(value.assets.weapons)) {
      if (!officialUnitySampleWeaponFamilies.includes(familyId)) delete value.assets.weapons[familyId];
    }
    for (const family of Object.values(value.assets.weapons)) {
      delete family.actionInstances;
      for (const variant of family.variants) delete variant.animations;
    }
    reconcileSourceWeaponInventoryProvenance(value);

    assert.deepEqual(Object.keys(value.assets.weapons), officialUnitySampleWeaponFamilies);
    assert.doesNotThrow(() => validateAxieMixerManifest(value));
  });

  await context.test('requires family key identity and globally unique family URLs', () => {
    const wrongId = structuredClone(manifest);
    wrongId.assets.weapons.Axe.id = 'NotAxe';
    assert.throws(() => validateAxieMixerManifest(wrongId), /id must match its catalog key/);
    const duplicateUrl = structuredClone(manifest);
    duplicateUrl.assets.weapons.Bow.url = duplicateUrl.assets.weapons.Axe.url;
    assert.throws(() => validateAxieMixerManifest(duplicateUrl), /family URL .* is duplicated/);
  });

  await context.test('requires globally unique variant ids and URLs plus a resolvable default', () => {
    const duplicateId = structuredClone(manifest);
    duplicateId.assets.weapons.Bow.variants[0].id = duplicateId.assets.weapons.Axe.variants[0].id;
    assert.throws(() => validateAxieMixerManifest(duplicateId), /variant id .* is duplicated/);
    const duplicateIdCase = structuredClone(manifest);
    duplicateIdCase.assets.weapons.Bow.variants[0].id = duplicateIdCase.assets.weapons.Axe.variants[0].id.toUpperCase();
    assert.throws(() => validateAxieMixerManifest(duplicateIdCase), /variant id .* is duplicated/);
    const duplicateUrl = structuredClone(manifest);
    duplicateUrl.assets.weapons.Bow.variants[0].url = duplicateUrl.assets.weapons.Axe.variants[0].url;
    assert.throws(() => validateAxieMixerManifest(duplicateUrl), /variant URL .* is duplicated/);
    const missingDefault = structuredClone(manifest);
    missingDefault.assets.weapons.Axe.defaultVariantId = 'missing';
    assert.throws(() => validateAxieMixerManifest(missingDefault), /does not resolve to a declared variant/);
  });

  await context.test('requires exact body support ids and sealed source/content hashes', () => {
    const unsupportedDefault = structuredClone(manifest);
    unsupportedDefault.assets.weapons.Axe.variants[0].supportedBodyIds = [];
    assert.throws(() => validateAxieMixerManifest(unsupportedDefault), /default variant must support every family body/);
    const catalogOnly = structuredClone(manifest);
    catalogOnly.assets.weapons.Brush.supportedBodyIds = [];
    catalogOnly.assets.weapons.Brush.variants[0].supportedBodyIds = [];
    assert.doesNotThrow(() => validateAxieMixerManifest(catalogOnly));
    const invalidBody = structuredClone(manifest);
    invalidBody.assets.weapons.Axe.variants[0].supportedBodyIds = ['dragon'];
    assert.throws(() => validateAxieMixerManifest(invalidBody), /unsupported value dragon/);
    const duplicateBody = structuredClone(manifest);
    duplicateBody.assets.weapons.Axe.variants[0].supportedBodyIds = ['normal', 'normal'];
    assert.throws(() => validateAxieMixerManifest(duplicateBody), /repeats normal/);
    const invalidHash = structuredClone(manifest);
    invalidHash.assets.weapons.Axe.variants[0].contentHash = 'not-a-hash';
    assert.throws(() => validateAxieMixerManifest(invalidHash), /lowercase SHA-256 hash/);
    const unsupportedSocketBody = structuredClone(manifest);
    delete unsupportedSocketBody.assets.bodies.curly.weaponAttachNodes.right;
    assert.throws(() => validateAxieMixerManifest(unsupportedSocketBody), /curly has no right weapon socket/);
  });

  await context.test('requires every family-supported body to contain a declared family clip', () => {
    const value = structuredClone(manifest);
    for (const bundle of Object.values(value.assets.bodies.sumo.animations)) {
      bundle.clips = bundle.clips.filter(({ sourceName }) => !sourceName.startsWith('Axe.'));
    }
    assert.throws(() => validateAxieMixerManifest(value), /body sumo has no clip matching its animationPrefix or clipPrefixes/);
  });

  await context.test('rejects encoded or backslash weapon paths', () => {
    for (const unsafeUrl of [
      '/assets/axie/weapons/v2/Axe/%2e%2e/axe.glb',
      '/assets/axie/weapons/v2/Axe%2faxe.glb',
      '/assets/axie/weapons/v2/Axe\\axe.glb',
    ]) {
      const value = structuredClone(manifest);
      value.assets.weapons.Axe.variants[0].url = unsafeUrl;
      assert.throws(() => validateAxieMixerManifest(value), /portable Axie weapon GLB URL/);
    }
  });

  await context.test('keeps static payloads armature-free and rigged payloads skeleton-sealed', () => {
    const staticSkeleton = structuredClone(manifest);
    staticSkeleton.assets.weapons.Brush.variants[0].skeletonSignature = hash(999);
    assert.throws(() => validateAxieMixerManifest(staticSkeleton), /armature-free payload must not claim a skeleton/);
    const missingRig = structuredClone(manifest);
    delete missingRig.assets.weapons.Axe.variants[0].skeletonSignature;
    assert.throws(() => validateAxieMixerManifest(missingRig), /skeletonSignature must be a non-empty string/);
  });
});
