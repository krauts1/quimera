// QUIMERA Spike A — checks 3 y 4:
//   (3) fps sostenidos con 8 criaturas animadas
//   (4) hitch al componer una criatura nueva mientras las demás animan
// Página local de spike; no forma parte del toolkit.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createAxieMixer3D, type AxiePlayableCharacter } from '../src/index';
import GENES from './stress-genes.json';

const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);
scene.fog = new THREE.Fog(0x0a0a14, 18, 42);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 7, 13);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);

scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x202030, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(5, 10, 6);
scene.add(sun);
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 48),
  new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- mixer
const mixer = await createAxieMixer3D({ renderer, assetBaseUrl: '/assets/axie/' });

interface Slot { char: AxiePlayableCharacter; genes: string; }
const slots: Slot[] = [];
let targetCount = 8;
let genesCursor = 0;

function nextGenes(): string {
  const g = GENES[genesCursor % GENES.length];
  genesCursor += 1;
  return g;
}

function placeInRing(index: number, total: number, wrapper: THREE.Object3D) {
  const angle = (index / total) * Math.PI * 2;
  const radius = total > 1 ? 4.5 : 0;
  wrapper.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  wrapper.rotation.y = -angle + Math.PI / 2;
}

function playSomething(char: AxiePlayableCharacter, index: number) {
  const clips = char.animations.clips.map((c) => c.name);
  const prefs = ['Action.AttackCombo', 'Default.Run', 'Action.RunAttack', 'Default.Walk', 'Default.Idle'];
  const pick = prefs.map((p) => clips.find((n) => n.includes(p))).filter(Boolean) as string[];
  const name = pick[index % Math.max(pick.length, 1)] ?? clips[0];
  if (name) char.playAnimation(name, { loop: true });
}

async function spawn(index: number): Promise<{ ms: number }> {
  const genes = nextGenes();
  const t0 = performance.now();
  const char = await mixer.createFromGenes({
    genes,
    extensions: { quality: 'balanced', artMode: 'faithful', strict: true },
  });
  const ms = performance.now() - t0;
  placeInRing(index, targetCount, char.wrapper);
  scene.add(char.wrapper);
  playSomething(char, index);
  slots[index] = { char, genes };
  return { ms };
}

function despawn(index: number) {
  const s = slots[index];
  if (!s) return;
  scene.remove(s.char.wrapper);
  s.char.dispose();
  delete slots[index];
}

// ---------------------------------------------------------------- métricas
let frames = 0;
let fpsWindowStart = performance.now();
let fps = 0;
let worstFrameMs = 0;
let worstFrameEver = 0;
let lastComposeMs = 0;
let composeCount = 0;
let composeTotalMs = 0;
let lastTime = performance.now();
let swapping = true;

function fmt(n: number) { return n.toFixed(1); }

function updateHud() {
  const composeAvg = composeCount ? composeTotalMs / composeCount : 0;
  const fpsClass = fps >= 55 ? 'b' : 'bad';
  hud.innerHTML =
    `QUIMERA spike — mixer 3D\n` +
    `criaturas: <b>${slots.filter(Boolean).length}/${targetCount}</b>\n` +
    `fps: <${fpsClass}>${fps.toFixed(0)}</${fpsClass}>  peor frame (2s): ${fmt(worstFrameMs)} ms\n` +
    `peor frame total: ${fmt(worstFrameEver)} ms\n` +
    `composición: última ${fmt(lastComposeMs)} ms · media ${fmt(composeAvg)} ms · n=${composeCount}\n` +
    `swap periódico: ${swapping ? 'ON (cada 3 s)' : 'OFF'}\n`;
}

const btnBar = document.createElement('div');
const mkBtn = (label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  btnBar.appendChild(b);
};
mkBtn('8 criaturas', () => setCount(8));
mkBtn('12 criaturas', () => setCount(12));
mkBtn('swap on/off', () => { swapping = !swapping; });
mkBtn('reset picos', () => { worstFrameEver = 0; });
hud.after(btnBar);
hud.appendChild(btnBar);

async function setCount(n: number) {
  targetCount = n;
  for (let i = n; i < slots.length; i += 1) despawn(i);
  slots.length = Math.min(slots.length, n);
  for (let i = 0; i < n; i += 1) {
    if (!slots[i]) {
      const { ms } = await spawn(i);
      lastComposeMs = ms; composeCount += 1; composeTotalMs += ms;
    } else {
      placeInRing(i, n, slots[i].char.wrapper);
    }
  }
}

// swap periódico: el corazón del check 4
setInterval(() => {
  if (!swapping || slots.filter(Boolean).length < targetCount) return;
  const index = Math.floor(Math.random() * targetCount);
  despawn(index);
  void spawn(index).then(({ ms }) => {
    lastComposeMs = ms; composeCount += 1; composeTotalMs += ms;
  });
}, 3000);

// ---------------------------------------------------------------- loop
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  const frameMs = now - lastTime;
  lastTime = now;
  worstFrameMs = Math.max(worstFrameMs, frameMs);
  worstFrameEver = Math.max(worstFrameEver, frameMs);

  frames += 1;
  if (now - fpsWindowStart >= 2000) {
    fps = (frames * 1000) / (now - fpsWindowStart);
    frames = 0;
    fpsWindowStart = now;
    worstFrameMs = frameMs;
    updateHud();
  }

  for (const s of slots) s?.char.update(dt);
  controls.update();
  renderer.render(scene, camera);
});

hud.textContent = 'componiendo 8 criaturas…';
await setCount(8);
updateHud();
