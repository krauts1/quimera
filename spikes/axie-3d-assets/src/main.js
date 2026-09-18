import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import './style.css';

const canvasWrap = document.querySelector('#canvas-wrap');
const status = document.querySelector('#viewer-status');
const modelSelect = document.querySelector('#model-select');
const modelName = document.querySelector('#model-name');
const modelDetail = document.querySelector('#model-detail');
const animationButtons = document.querySelector('#animation-buttons');
const downloadLink = document.querySelector('#download-link');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#10192b');

const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
canvasWrap.append(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 0.2;
controls.maxDistance = 50;

scene.add(new THREE.HemisphereLight(0xdbeafe, 0x293241, 2.8));
const keyLight = new THREE.DirectionalLight(0xffffff, 4.2);
keyLight.position.set(3, 4, 5);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x7dd3fc, 2.2);
rimLight.position.set(-4, 2, -4);
scene.add(rimLight);

const loader = new GLTFLoader();
const clock = new THREE.Clock();
const baseUrl = import.meta.env.BASE_URL;
let currentRoot;
let currentMixer;
let currentClips = [];
let currentAction;
let idleClip;
let requestId = 0;

function assetUrl(path) {
  return `${baseUrl}${path}`;
}

function disposeMaterial(material) {
  for (const value of Object.values(material)) {
    if (value?.isTexture) value.dispose();
  }
  material.dispose();
}

function disposeCurrent() {
  if (!currentRoot) return;
  scene.remove(currentRoot);
  currentRoot.traverse((node) => {
    node.geometry?.dispose();
    if (Array.isArray(node.material)) node.material.forEach(disposeMaterial);
    else if (node.material) disposeMaterial(node.material);
  });
  currentMixer?.stopAllAction();
  currentRoot = undefined;
  currentMixer = undefined;
  currentAction = undefined;
  currentClips = [];
  idleClip = undefined;
}

function frameModel(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.62 || 1;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));

  controls.target.copy(center);
  camera.near = Math.max(distance / 200, 0.01);
  camera.far = distance * 50;
  camera.position.set(
    center.x + distance * 0.72,
    center.y + radius * 0.32,
    center.z + distance * 1.06,
  );
  camera.updateProjectionMatrix();
  controls.update();
}

function isOneShot(name) {
  return /(attack|skill|dead|greeting)/i.test(name);
}

function playClip(clip) {
  if (!currentMixer || !clip) return;
  const next = currentMixer.clipAction(clip);
  next.reset();
  next.enabled = true;
  next.clampWhenFinished = isOneShot(clip.name);
  next.setLoop(isOneShot(clip.name) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
  if (currentAction && currentAction !== next) currentAction.fadeOut(0.16);
  next.fadeIn(0.16).play();
  currentAction = next;

  for (const button of animationButtons.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.clip === clip.name);
  }
}

function showAnimationButtons() {
  animationButtons.replaceChildren();
  if (currentClips.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Static model';
    animationButtons.append(empty);
    return;
  }

  for (const clip of currentClips) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.clip = clip.name;
    button.textContent = clip.name;
    button.addEventListener('click', () => playClip(clip));
    animationButtons.append(button);
  }
}

async function loadModel(model) {
  const thisRequest = ++requestId;
  status.hidden = false;
  status.textContent = `Loading ${model.name}…`;
  modelSelect.disabled = true;

  try {
    const gltf = await loader.loadAsync(assetUrl(model.path));
    if (thisRequest !== requestId) return;
    disposeCurrent();
    currentRoot = gltf.scene;
    currentClips = gltf.animations;
    scene.add(currentRoot);
    frameModel(currentRoot);

    if (currentClips.length) {
      currentMixer = new THREE.AnimationMixer(currentRoot);
      idleClip = currentClips.find((clip) => clip.name === 'Idle') ?? currentClips[0];
      currentMixer.addEventListener('finished', () => {
        if (idleClip && currentAction?.getClip() !== idleClip) playClip(idleClip);
      });
    }

    modelName.textContent = model.name;
    const clipLabel = model.animations.length === 1 ? '1 animation' : `${model.animations.length} animations`;
    modelDetail.textContent = `${model.familyLabel} · ${clipLabel} · ${(model.bytes / 1_000_000).toFixed(1)} MB`;
    downloadLink.href = assetUrl(model.path);
    downloadLink.download = model.path.split('/').at(-1);
    showAnimationButtons();
    if (idleClip) playClip(idleClip);
    status.hidden = true;
  } catch (error) {
    console.error(error);
    status.hidden = false;
    status.textContent = `Could not load ${model.name}.`;
  } finally {
    if (thisRequest === requestId) modelSelect.disabled = false;
  }
}

function fillModelSelect(models) {
  const groups = new Map();
  for (const model of models) {
    const group = groups.get(model.familyLabel) ?? [];
    group.push(model);
    groups.set(model.familyLabel, group);
  }

  modelSelect.replaceChildren();
  for (const [label, modelsInGroup] of groups) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    for (const model of modelsInGroup) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      optgroup.append(option);
    }
    modelSelect.append(optgroup);
  }
}

async function start() {
  const response = await fetch(`${baseUrl}catalog.json`);
  if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
  const catalog = await response.json();
  const models = catalog.models.filter((model) => model.family !== 'equipment');
  fillModelSelect(models);
  modelSelect.addEventListener('change', () => {
    const model = models.find((entry) => entry.id === modelSelect.value);
    if (model) loadModel(model);
  });
  modelSelect.value = 'kotaro';
  await loadModel(models.find((model) => model.id === 'kotaro') ?? models[0]);
}

function resize() {
  const width = Math.max(canvasWrap.clientWidth, 1);
  const height = Math.max(canvasWrap.clientHeight, 1);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

new ResizeObserver(resize).observe(canvasWrap);

renderer.setAnimationLoop(() => {
  const delta = Math.min(clock.getDelta(), 0.05);
  currentMixer?.update(delta);
  controls.update();
  renderer.render(scene, camera);
});

start().catch((error) => {
  console.error(error);
  status.textContent = 'Could not load the asset catalog.';
});
