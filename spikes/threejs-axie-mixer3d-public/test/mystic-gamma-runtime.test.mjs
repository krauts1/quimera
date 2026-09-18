import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  MysticGammaCompositor,
  sceneRequiresUnityGammaComposition,
} from '../dist/rendering.js';

function sourceMystic({ transparent, requiresGammaComposition }) {
  const material = new THREE.ShaderMaterial({
    transparent,
    uniforms: { uMysticGammaBlendPass: { value: 0 } },
  });
  material.setTime = () => {};
  material.userData.axieMystic = Object.freeze({
    faithful: true,
    shaderFamily: transparent ? 'mystic-transparent' : 'mystic-opaque',
    requiresGammaComposition,
  });
  return material;
}

class DirectRenderer {
  target = null;
  renderCalls = [];
  setTargetCalls = [];

  getRenderTarget() { return this.target; }
  getActiveCubeFace() { return 0; }
  getActiveMipmapLevel() { return 0; }
  setRenderTarget(target) {
    this.target = target;
    this.setTargetCalls.push(target);
  }
  render(scene, camera) { this.renderCalls.push({ scene, camera }); }
}

test('scene activation is limited to visible source-requiring transparent Mystic materials', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  const base = new THREE.MeshBasicMaterial();
  base.userData.axieMixerV4 = Object.freeze({ faithful: true });
  const opaqueMystic = sourceMystic({ transparent: false, requiresGammaComposition: false });
  const transparentMystic = sourceMystic({ transparent: true, requiresGammaComposition: true });
  const genericTransparent = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5 });
  const mesh = new THREE.Mesh(geometry, [base, opaqueMystic, genericTransparent]);
  scene.add(mesh);

  assert.equal(sceneRequiresUnityGammaComposition(scene), false);
  mesh.material = [base, opaqueMystic, transparentMystic];
  assert.equal(sceneRequiresUnityGammaComposition(scene), true);
  transparentMystic.visible = false;
  assert.equal(sceneRequiresUnityGammaComposition(scene), false);
  transparentMystic.visible = true;
  mesh.visible = false;
  assert.equal(sceneRequiresUnityGammaComposition(scene), false);
  mesh.visible = true;

  // Runtime toggles cannot promote a source-opaque Mystic shader.
  opaqueMystic.transparent = true;
  mesh.material = opaqueMystic;
  assert.equal(sceneRequiresUnityGammaComposition(scene), false);

  geometry.dispose();
  base.dispose();
  opaqueMystic.dispose();
  transparentMystic.dispose();
  genericTransparent.dispose();
});

test('base and source-opaque scenes stay on the unchanged single-render direct route', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  const geometry = new THREE.BufferGeometry();
  const base = new THREE.MeshBasicMaterial();
  const opaqueMystic = sourceMystic({ transparent: false, requiresGammaComposition: false });
  const mesh = new THREE.Mesh(geometry, [base, opaqueMystic]);
  scene.add(mesh);
  const renderer = new DirectRenderer();
  const compositor = new MysticGammaCompositor();

  assert.equal(compositor.render(renderer, scene, camera), false);
  assert.equal(compositor.lastRoute, 'direct');
  assert.deepEqual(renderer.renderCalls, [{ scene, camera }]);
  assert.equal(renderer.setTargetCalls.length, 0);
  assert.strictEqual(mesh.material[0], base);
  assert.strictEqual(mesh.material[1], opaqueMystic);

  compositor.dispose();
  assert.equal(compositor.disposed, true);
  assert.throws(() => compositor.render(renderer, scene, camera), /disposed/u);
  geometry.dispose();
  base.dispose();
  opaqueMystic.dispose();
});
