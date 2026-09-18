import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  createAxieMixer3D,
  normalizeAxieId,
  type AxieLookup,
  type AxiePairedWeaponAnimationInspection,
  type AxiePlayableCharacter,
  type AxieWeaponManifest,
} from '../src/index';
import {
  AXIE_SPECIAL_SHOWCASE_PRESETS,
  createAxieCreatorCatalog,
  createAxieCreatorStateCodec,
  createAxieSpecialShowcaseState,
  createDefaultAxieCreatorState,
  createManualAxieCreatorState,
  manualizeAxieCreatorState,
  normalizeAxieCreatorState,
  type AxieSpecialShowcasePresetId,
  type AxieCreatorState,
} from '../src/creator-api';
import {
  createAxieAnimationPanel,
  createAxieCreator,
} from '../src/creator-dom';
import {
  AXIE_CLEAR_EYE_L1_PART_ID,
  AXIE_KOTARO_EYE_L1_PART_ID,
  createAxieEyeController,
  type AxieEyeController,
  type AxieEyePerformanceConfig,
  type AxieEyePerformanceConfigPatch,
  type AxieEyeRuntimeInspection,
} from '../src/clear-eye';
import { MysticGammaCompositor } from '../src/rendering';
import { createAxieEyePanel } from './eye-panel';

const app = document.querySelector<HTMLElement>('#app')!;
const canvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const ui = document.querySelector<HTMLElement>('#ui')!;
const status = document.querySelector<HTMLElement>('#status')!;
const axieIdLoader = document.querySelector<HTMLElement>('.axie-id-loader')!;
const axieIdForm = document.querySelector<HTMLFormElement>('#axie-id-form')!;
const axieIdInput = document.querySelector<HTMLInputElement>('#axie-id')!;
const axieIdSubmit = document.querySelector<HTMLButtonElement>('#axie-id-submit')!;
const axieIdFeedback = document.querySelector<HTMLElement>('#axie-id-feedback')!;
const eyePresetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-eye-preset]')];
const specialPresetButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-special-preset]')];
const weaponFamilySelect = document.querySelector<HTMLSelectElement>('#weapon-family')!;
const weaponVariantSelect = document.querySelector<HTMLSelectElement>('#weapon-variant')!;
const weaponFidelity = document.querySelector<HTMLElement>('#weapon-fidelity')!;
const unityTimeScaleInput = document.querySelector<HTMLInputElement>('#unity-time-scale')!;
const unityTimeScaleValue = document.querySelector<HTMLOutputElement>('#unity-time-scale-value')!;
const unityMoveSpeedInput = document.querySelector<HTMLInputElement>('#unity-move-speed')!;
const unityMoveSpeedValue = document.querySelector<HTMLOutputElement>('#unity-move-speed-value')!;
const unityStunnedInput = document.querySelector<HTMLInputElement>('#unity-stunned')!;
const unityDeadButton = document.querySelector<HTMLButtonElement>('#unity-dead')!;
const unityRestartButton = document.querySelector<HTMLButtonElement>('#unity-restart')!;
const unityAttackButton = document.querySelector<HTMLButtonElement>('#unity-attack')!;
const unitySkillButton = document.querySelector<HTMLButtonElement>('#unity-skill')!;
const unityAnimatorFeedback = document.querySelector<HTMLElement>('#unity-animator-feedback')!;
const fields = Object.fromEntries(
  [
    'body',
    'rigs',
    'clips',
    'quality',
    'cache',
    'weapon-active',
  ].map((id) => [id, document.querySelector<HTMLElement>(`#${id}`)!]),
) as Record<
  'body'
  | 'rigs'
  | 'clips'
  | 'quality'
  | 'cache'
  | 'weapon-active',
  HTMLElement
>;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const mysticGammaCompositor = new MysticGammaCompositor();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#83b7ad');
scene.fog = new THREE.Fog('#83b7ad', 13, 30);

const eyePortraitMode = new URLSearchParams(location.search).get('eyePortrait') === '1';
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
if (eyePortraitMode) camera.position.set(2.25, 1.85, 2.65);
else camera.position.set(4.5, 2.8, 5.2);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.minDistance = 2.5;
controls.maxDistance = 10;
controls.maxPolarAngle = Math.PI * 0.49;
scene.add(camera);

scene.add(new THREE.HemisphereLight('#d8fff7', '#48645a', 2.2));
const key = new THREE.DirectionalLight('#fff3da', 3.6);
key.position.set(4, 7, 5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
scene.add(key);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(18, 96),
  new THREE.MeshStandardMaterial({ color: '#5b9a80', roughness: 0.96, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const mixer = await createAxieMixer3D({
  renderer,
  assetBaseUrl: '/assets/axie/',
  maxUnusedEntries: 48,
  onDiagnostic: (event) => {
    if (event.severity === 'error') console.error('[Axie Mixer]', event);
    else if (event.severity === 'warning') console.warn('[Axie Mixer]', event);
  },
});

const catalog = createAxieCreatorCatalog(mixer.manifest);
const codec = createAxieCreatorStateCodec(catalog);
const demoParameters = new URLSearchParams(location.search);
const debugClipInspector = demoParameters.get('debugClips') === '1';
const AXIE_ID_QUERY = 'axieId';
const WEAPON_QUERY = 'weapon';
const WEAPON_VARIANT_QUERY = 'weaponVariant';
const EYE_QUERY = Object.freeze({
  expression: 'axieEyeExpression',
  intensity: 'axieEyeIntensity',
  gaze: 'axieEyeGaze',
  gazeX: 'axieEyeX',
  gazeY: 'axieEyeY',
  autoBlink: 'axieEyeAutoBlink',
});
const DEFAULT_EYE_CONFIG: AxieEyePerformanceConfig = Object.freeze({
  expression: 'neutral',
  expressionIntensity: 1,
  gazeMode: 'ambient',
  fixedGaze: Object.freeze({ x: 0, y: 0 }),
  autoBlink: true,
});

function finiteParameter(parameters: URLSearchParams, key: string, fallback: number) {
  const raw = parameters.get(key);
  if (raw === null || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEyeConfig(parameters: URLSearchParams): AxieEyePerformanceConfig {
  const expression = parameters.get(EYE_QUERY.expression);
  const gazeMode = parameters.get(EYE_QUERY.gaze);
  return Object.freeze({
    expression: expression === 'happy'
      || expression === 'sad'
      || expression === 'angry'
      || expression === 'surprised'
      || expression === 'squint'
      ? expression
      : 'neutral',
    expressionIntensity: THREE.MathUtils.clamp(
      finiteParameter(parameters, EYE_QUERY.intensity, 1),
      0,
      1,
    ),
    gazeMode: gazeMode === 'fixed' || gazeMode === 'pointer' ? gazeMode : 'ambient',
    fixedGaze: Object.freeze({
      x: THREE.MathUtils.clamp(finiteParameter(parameters, EYE_QUERY.gazeX, 0), -1, 1),
      y: THREE.MathUtils.clamp(finiteParameter(parameters, EYE_QUERY.gazeY, 0), -1, 1),
    }),
    autoBlink: parameters.get(EYE_QUERY.autoBlink) !== '0',
  });
}

const requestedWeapon = demoParameters.get(WEAPON_QUERY)?.trim() || undefined;
const requestedWeaponVariant = demoParameters.get(WEAPON_VARIANT_QUERY)?.trim() || undefined;
const requestedAnimation = demoParameters.get('animation')?.trim() || undefined;
let requestedRuntimeStateApplied = false;
let selectedWeaponId = requestedWeapon;
let selectedWeaponVariantId = requestedWeaponVariant;
let creatorState = codec.read(demoParameters) ?? createDefaultAxieCreatorState(catalog);
let currentAxieLookup: AxieLookup | undefined;
let axieLookupController: AbortController | undefined;
let eyeConfig = readEyeConfig(demoParameters);
let character: AxiePlayableCharacter | undefined;
let eyeController: AxieEyeController | undefined;
let pointerEyeAnchor: THREE.Object3D | undefined;
let generation = 0;
let loadController: AbortController | undefined;
let contextDiagnosticRunning = false;
let closeCreatorForAnimation: (() => void) | undefined;
let closeEyeForOtherPanel: (() => void) | undefined;
let evidenceFrozen = false;
let unityTimeScale = 1;
let unityMoveSpeed = 0;
let unityStunned = false;
const showcaseCameraTargetOffset = new THREE.Vector3(0, 1, 0);
app.dataset.debugClips = String(debugClipInspector);

const UNITY_SAMPLE_WEAPON_IDS = Object.freeze([
  'Axe',
  'Bow',
  'Cannon',
  'Flag',
  'Gauntlet',
  'Mala',
  'Staff',
  'Sword',
  'Tome',
] as const);
const UNITY_SAMPLE_WEAPON_ID_SET = new Set<string>(UNITY_SAMPLE_WEAPON_IDS);
const weaponCatalog = Object.freeze(
  Object.values(mixer.manifest.assets.weapons)
    .sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id)),
);

function weaponFamilyManifest(id: string | undefined) {
  if (!id) return undefined;
  const normalized = id.toLocaleLowerCase();
  return weaponCatalog.find((weapon) => weapon.id.toLocaleLowerCase() === normalized);
}

function weaponVariantManifest(
  weapon: AxieWeaponManifest | undefined,
  id: string | undefined,
) {
  if (!weapon || !id) return undefined;
  const normalized = id.toLocaleLowerCase();
  return weapon.variants.find((variant) => variant.id.toLocaleLowerCase() === normalized);
}

function defaultWeaponVariant(weapon: AxieWeaponManifest) {
  const variant = weapon.variants.find((candidate) => candidate.id === weapon.defaultVariantId);
  if (!variant) {
    throw new Error(
      `Weapon family "${weapon.id}" defaultVariantId "${weapon.defaultVariantId}" is missing from its included source inventory.`,
    );
  }
  return variant;
}

weaponCatalog.forEach(defaultWeaponVariant);

function normalizeWeaponSelection() {
  const family = weaponFamilyManifest(selectedWeaponId);
  if (!family) {
    return Object.freeze({
      family: undefined,
      variant: undefined,
    });
  }
  const variant = weaponVariantManifest(family, selectedWeaponVariantId)
    ?? defaultWeaponVariant(family);
  selectedWeaponId = family.id;
  selectedWeaponVariantId = variant.id;
  return Object.freeze({ family, variant });
}

function replaceSelectOptions(
  select: HTMLSelectElement,
  entries: readonly {
    readonly value: string;
    readonly label: string;
    readonly disabled?: boolean;
    readonly title?: string;
  }[],
) {
  select.replaceChildren(...entries.map((entry) => {
    const option = document.createElement('option');
    option.value = entry.value;
    option.textContent = entry.label;
    option.disabled = entry.disabled === true;
    if (entry.title) option.title = entry.title;
    return option;
  }));
}

function renderWeaponPicker() {
  const selection = normalizeWeaponSelection();
  const selectedManifest = selection.family;
  const selectedVariant = selection.variant;
  const capabilities = new Map(character?.weapons.map((entry) => [entry.id, entry]) ?? []);
  replaceSelectOptions(weaponFamilySelect, [
    { value: '', label: 'None' },
    ...weaponCatalog.map((weapon) => {
      const capability = capabilities.get(weapon.id);
      const official = UNITY_SAMPLE_WEAPON_ID_SET.has(weapon.id);
      return {
        value: weapon.id,
        label: `${weapon.label} · ${official ? 'Unity sample + included variants' : 'Included source'}${capability?.available === false ? ' · unavailable' : ''}`,
        disabled: capability?.available === false,
        title: capability?.unavailableReason,
      };
    }),
  ]);
  weaponFamilySelect.value = selectedManifest?.id ?? '';

  replaceSelectOptions(
    weaponVariantSelect,
    selectedManifest
      ? selectedManifest.variants.map((variant) => ({
        value: variant.id,
        label: `${variant.label ?? variant.id}${variant.id === selectedManifest.defaultVariantId ? ' · default' : ''}`,
        title: variant.sourceFile,
        disabled: !variant.supportedBodyIds.includes(creatorState.descriptor.body),
      }))
      : [{ value: '', label: 'Select a family first' }],
  );
  weaponVariantSelect.value = selectedVariant?.id ?? '';

  const capability = selectedManifest
    ? character?.weapons.find((entry) => entry.id === selectedManifest.id)
    : undefined;
  const loading = character?.weaponLoadingSelection === selectedVariant?.id;
  let fidelity: 'unity' | 'catalog' | 'unavailable' | 'loading' = 'catalog';
  let message = 'No weapon selected. Browse all 16 families and 87 included source models.';
  if (selectedWeaponId && !selectedManifest) {
    fidelity = 'unavailable';
    message = `Unknown weapon family: ${selectedWeaponId}. No runtime fallback was selected.`;
  } else if (selectedManifest && capability?.available === false) {
    fidelity = 'unavailable';
    message = `${selectedManifest.label} is unavailable on ${creatorState.descriptor.body}: ${capability.unavailableReason ?? 'no exact source-authored body animation declaration'}.`;
  } else if (selectedManifest && selectedVariant
    && !selectedVariant.supportedBodyIds.includes(creatorState.descriptor.body)) {
    fidelity = 'unavailable';
    message = `${selectedVariant.label ?? selectedVariant.id} has no exact ${creatorState.descriptor.body} body-animation declaration.`;
  } else if (selectedManifest && selectedVariant && loading) {
    fidelity = 'loading';
    message = `Loading ${selectedVariant.label ?? selectedVariant.id} from the included socket-local model…`;
  } else if (selectedManifest && selectedVariant) {
    fidelity = UNITY_SAMPLE_WEAPON_ID_SET.has(selectedManifest.id) ? 'unity' : 'catalog';
    const brushBoundary = selectedManifest.id === 'Brush'
      ? ' Brush has no authored Skill clip, so Skill remains unavailable.'
      : '';
    message = `${selectedVariant.label ?? selectedVariant.id} · included socket-local model with ${selectedManifest.id} Idle, Walk, Run, and Attack body animation${selectedManifest.id === 'Brush' ? '' : ' plus Skill'}.${brushBoundary}`;
  }
  weaponFidelity.dataset.fidelity = fidelity;
  weaponFidelity.textContent = message;
  app.dataset.selectedWeaponFamily = selectedManifest?.id ?? selectedWeaponId ?? '';
  app.dataset.selectedWeaponVariant = selectedVariant?.id ?? '';
  app.dataset.weaponSelectionKind = selectedVariant ? 'exact-variant' : selectedManifest ? 'family' : 'none';
  const controlsDisabled = contextDiagnosticRunning || Boolean(character?.weaponLoading);
  weaponFamilySelect.disabled = controlsDisabled;
  weaponVariantSelect.disabled = controlsDisabled || !selectedManifest;
}

function syncWeaponRuntimeDiagnostics() {
  const active = character?.activeWeapon;
  const loading = character?.weaponLoading;
  const activeSelection = character?.activeWeaponSelection;
  const loadingSelection = character?.weaponLoadingSelection;
  fields['weapon-active'].textContent = loadingSelection
    ? `${loadingSelection}…`
    : activeSelection ?? active ?? 'none';
  app.dataset.activeWeapon = active ?? '';
  app.dataset.weaponLoading = loading ?? '';
  app.dataset.activeWeaponSelection = activeSelection ?? '';
  app.dataset.weaponLoadingSelection = loadingSelection ?? '';
}

async function selectWeapon(
  id?: string,
  options: { readonly writeUrl?: boolean } = {},
) {
  if (contextDiagnosticRunning) return false;
  const manifest = weaponFamilyManifest(id);
  if (id && !manifest) {
    selectedWeaponId = id;
    selectedWeaponVariantId = undefined;
    renderWeaponPicker();
    if (options.writeUrl !== false) writeUrlState();
    return false;
  }
  selectedWeaponId = manifest?.id;
  selectedWeaponVariantId = manifest?.defaultVariantId;
  return applyWeaponSelection(options);
}

async function selectWeaponVariant(
  id?: string,
  options: { readonly writeUrl?: boolean } = {},
) {
  if (contextDiagnosticRunning) return false;
  const family = weaponFamilyManifest(selectedWeaponId);
  const variant = weaponVariantManifest(family, id);
  selectedWeaponVariantId = variant?.id ?? (family ? defaultWeaponVariant(family).id : undefined);
  return applyWeaponSelection(options);
}

async function applyWeaponSelection(
  options: { readonly writeUrl?: boolean } = {},
) {
  const selection = normalizeWeaponSelection();
  renderWeaponPicker();
  if (options.writeUrl !== false) writeUrlState();
  if (contextDiagnosticRunning || !character) return false;
  const targetCharacter = character;
  const requestGeneration = generation;
  const pending = targetCharacter.equipWeapon(selection.variant?.id);
  syncWeaponRuntimeDiagnostics();
  renderWeaponPicker();
  const equipped = await pending;
  if (
    requestGeneration !== generation
    || character !== targetCharacter
    || targetCharacter.disposed
  ) return false;
  syncPanels();
  return Boolean(selection.variant) && equipped;
}

type ShowcaseCameraMode = 'eyes' | 'full-body';

function focusShowcaseCamera(mode: ShowcaseCameraMode) {
  const anchor = mode === 'eyes'
    ? (pointerEyeAnchor ?? character?.anchors.cameraTarget)
    : character?.anchors.cameraTarget;
  const target = anchor?.getWorldPosition(new THREE.Vector3())
    ?? character?.wrapper.position.clone().add(new THREE.Vector3(0, 1, 0))
    ?? new THREE.Vector3(0, 1, 0);
  if (innerWidth <= 680) target.y += mode === 'eyes' ? 0.6 : 0.24;
  showcaseCameraTargetOffset.copy(target).sub(character?.wrapper.position ?? new THREE.Vector3());
  const offset = mode === 'eyes'
    ? new THREE.Vector3(2.8, 1, 3.35)
    : new THREE.Vector3(4.5, 1.8, 5.2);
  controls.target.copy(target);
  camera.position.copy(target).add(offset);
  controls.update();
}

function writeUrlState() {
  const weaponSelection = normalizeWeaponSelection();
  const parameters = codec.write(new URLSearchParams(location.search), creatorState);
  if (currentAxieLookup) parameters.set(AXIE_ID_QUERY, currentAxieLookup.axieId);
  else parameters.delete(AXIE_ID_QUERY);
  parameters.set(EYE_QUERY.expression, eyeConfig.expression);
  parameters.set(EYE_QUERY.intensity, String(eyeConfig.expressionIntensity));
  parameters.set(EYE_QUERY.gaze, eyeConfig.gazeMode);
  parameters.set(EYE_QUERY.gazeX, String(eyeConfig.fixedGaze.x));
  parameters.set(EYE_QUERY.gazeY, String(eyeConfig.fixedGaze.y));
  parameters.set(EYE_QUERY.autoBlink, eyeConfig.autoBlink ? '1' : '0');
  if (selectedWeaponId) parameters.set(WEAPON_QUERY, selectedWeaponId);
  else parameters.delete(WEAPON_QUERY);
  if (weaponSelection.family && weaponSelection.variant) {
    parameters.set(WEAPON_VARIANT_QUERY, weaponSelection.variant.id);
  } else {
    parameters.delete(WEAPON_VARIANT_QUERY);
  }
  const query = parameters.toString();
  history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}${location.hash}`);
}

function setAxieIdStatus(
  tone: 'idle' | 'loading' | 'success' | 'error',
  message: string,
) {
  axieIdLoader.dataset.tone = tone;
  axieIdFeedback.textContent = message;
  app.dataset.axieLookupStatus = tone;
}

function syncAxieLookupIdentity() {
  app.dataset.axieId = currentAxieLookup?.axieId ?? '';
  app.dataset.axieName = currentAxieLookup?.name ?? '';
  app.dataset.axieLookupSource = currentAxieLookup?.source ?? '';
}

function forgetAxieLookup(message = 'Custom creator selection active. Enter an ID to load another Axie.') {
  currentAxieLookup = undefined;
  syncAxieLookupIdentity();
  setAxieIdStatus('idle', message);
}

const EYE_PRESETS = Object.freeze({
  clear: Object.freeze({ label: 'Clear L1', partId: AXIE_CLEAR_EYE_L1_PART_ID }),
  kotaro: Object.freeze({ label: 'Kotaro L1', partId: AXIE_KOTARO_EYE_L1_PART_ID }),
});

type EyePresetId = keyof typeof EYE_PRESETS;

function eyePresetForPart(partId: string): EyePresetId | undefined {
  return (Object.entries(EYE_PRESETS) as [EyePresetId, (typeof EYE_PRESETS)[EyePresetId]][])
    .find(([, preset]) => preset.partId === partId)?.[0];
}

function syncShowcaseButtons() {
  const eyePreset = app.dataset.eyePreset;
  const specialPreset = app.dataset.specialPreset;
  eyePresetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.eyePreset === eyePreset));
  });
  specialPresetButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.specialPreset === specialPreset));
  });
}

function setShowcaseIdentity(
  eyePreset: EyePresetId | undefined,
  specialPreset: AxieSpecialShowcasePresetId | undefined,
) {
  if (!eyePreset && !specialPreset) showcaseCameraTargetOffset.set(0, 1, 0);
  if (eyePreset) app.dataset.eyePreset = eyePreset;
  else delete app.dataset.eyePreset;
  if (specialPreset) app.dataset.specialPreset = specialPreset;
  else delete app.dataset.specialPreset;
  syncShowcaseButtons();
}

function setShowcaseControlsDisabled(disabled: boolean) {
  [...eyePresetButtons, ...specialPresetButtons].forEach((button) => {
    button.disabled = disabled;
  });
}

async function applyAnimatedEyePreset(presetId: EyePresetId): Promise<boolean> {
  const preset = EYE_PRESETS[presetId];
  const previousState = creatorState;
  const previousLookup = currentAxieLookup;
  const previousEyePreset = app.dataset.eyePreset as EyePresetId | undefined;
  const previousSpecialPreset = app.dataset.specialPreset as AxieSpecialShowcasePresetId | undefined;
  const manual = manualizeAxieCreatorState(creatorState, catalog);
  const nextState = createManualAxieCreatorState(catalog, {
    body: manual.descriptor.body,
    colorVariant: manual.descriptor.colorVariant,
    parts: Object.freeze({ ...manual.parts, eye: preset.partId }),
  }, manual);

  axieLookupController?.abort();
  setShowcaseControlsDisabled(true);
  currentAxieLookup = undefined;
  creatorState = nextState;
  creator.setState(nextState, { notify: false });
  syncAxieLookupIdentity();
  writeUrlState();
  setAxieIdStatus('loading', `Mixing ${preset.label} animated vector eyes…`);

  try {
    const assembled = await rebuild(nextState);
    if (!assembled) {
      currentAxieLookup = previousLookup;
      creatorState = previousState;
      creator.setState(previousState, { notify: false });
      syncAxieLookupIdentity();
      writeUrlState();
      setShowcaseIdentity(previousEyePreset, previousSpecialPreset);
      setAxieIdStatus('error', `${preset.label} could not be assembled; the last good Axie is still displayed.`);
      return false;
    }
    setShowcaseIdentity(presetId, undefined);
    focusShowcaseCamera('eyes');
    setAxieIdStatus(
      'success',
      `${preset.label} visible on ${nextState.descriptor.body}. Open Eyes (E) for gaze, blink, and six expressions.`,
    );
    // Keep the model unobstructed after a one-click preview, especially on
    // mobile. The Eyes button and E shortcut still expose all controls.
    eyePanel.close();
    creator.close({ restoreFocus: false });
    return true;
  } finally {
    setShowcaseControlsDisabled(false);
  }
}

async function applySpecialShowcasePreset(presetId: AxieSpecialShowcasePresetId): Promise<boolean> {
  const preset = AXIE_SPECIAL_SHOWCASE_PRESETS[presetId];
  const previousState = creatorState;
  const previousLookup = currentAxieLookup;
  const previousEyePreset = app.dataset.eyePreset as EyePresetId | undefined;
  const previousSpecialPreset = app.dataset.specialPreset as AxieSpecialShowcasePresetId | undefined;
  const nextState = createAxieSpecialShowcaseState(catalog, creatorState, presetId);

  axieLookupController?.abort();
  setShowcaseControlsDisabled(true);
  currentAxieLookup = undefined;
  creatorState = nextState;
  creator.setState(nextState, { notify: false });
  syncAxieLookupIdentity();
  writeUrlState();
  setAxieIdStatus('loading', `Mixing ${preset.label} from the final Unity source…`);

  try {
    const assembled = await rebuild(nextState);
    if (!assembled) {
      currentAxieLookup = previousLookup;
      creatorState = previousState;
      creator.setState(previousState, { notify: false });
      syncAxieLookupIdentity();
      writeUrlState();
      setShowcaseIdentity(previousEyePreset, previousSpecialPreset);
      setAxieIdStatus('error', `${preset.label} could not be assembled; the last good Axie is still displayed.`);
      return false;
    }
    setShowcaseIdentity(eyePresetForPart(nextState.parts.eye), presetId);
    focusShowcaseCamera('full-body');
    eyePanel.close();
    creator.close({ restoreFocus: false });
    setAxieIdStatus(
      'success',
      `${preset.label} selected from the manifest-backed final Unity catalog. Open Creator (X) for every individual option.`,
    );
    return true;
  } finally {
    setShowcaseControlsDisabled(false);
  }
}

function syncUnityAnimatorControls() {
  unityTimeScaleInput.value = String(unityTimeScale);
  unityTimeScaleValue.value = unityTimeScale.toFixed(2);
  unityTimeScaleValue.textContent = unityTimeScale.toFixed(2);
  unityMoveSpeedInput.value = String(unityMoveSpeed);
  unityMoveSpeedValue.value = unityMoveSpeed.toFixed(2);
  unityMoveSpeedValue.textContent = unityMoveSpeed.toFixed(2);
  unityStunnedInput.checked = unityStunned;
  const unavailable = !character || contextDiagnosticRunning;
  unityMoveSpeedInput.disabled = unavailable;
  unityStunnedInput.disabled = unavailable;
  unityDeadButton.disabled = unavailable;
  unityRestartButton.disabled = unavailable;
  const selection = normalizeWeaponSelection();
  const exactWeaponActive = Boolean(
    selection.family
    && selection.variant
    && character?.activeWeapon === selection.family.id
    && character?.activeWeaponSelection === selection.variant.id,
  );
  const weaponActionsUnavailable = unavailable
    || !exactWeaponActive
    || Boolean(character?.weaponLoadingSelection);
  unityAttackButton.disabled = weaponActionsUnavailable;
  unitySkillButton.disabled = weaponActionsUnavailable || selection.family?.id === 'Brush';
  unitySkillButton.title = selectedWeaponId === 'Brush'
    ? 'Brush Skill is absent from the art-authored source set.'
    : weaponActionsUnavailable
      ? 'Equip the exact selected source variant to enable Skill.'
      : '';
  app.dataset.unityTimeScale = String(unityTimeScale);
  app.dataset.unityMoveSpeed = String(unityMoveSpeed);
  app.dataset.unityStunned = String(unityStunned);
}

function setUnityAnimatorFeedback(message: string, tone: 'idle' | 'success' | 'error' = 'idle') {
  unityAnimatorFeedback.textContent = message;
  unityAnimatorFeedback.dataset.tone = tone;
}

function playUnityAnimatorCommand(name: 'Attack' | 'Skill' | 'Stunned' | 'Dead' | 'Restart') {
  if (!character || contextDiagnosticRunning) return false;
  if (name === 'Attack' || name === 'Skill') {
    const selection = normalizeWeaponSelection();
    const exactWeaponActive = Boolean(
      selection.family
      && selection.variant
      && character.activeWeapon === selection.family.id
      && character.activeWeaponSelection === selection.variant.id,
    );
    if (!exactWeaponActive || (selection.family?.id === 'Brush' && name === 'Skill')) {
      const message = selectedWeaponId === 'Brush' && name === 'Skill'
        ? 'Brush Skill is unavailable because it is absent from the art-authored source set.'
        : `${name} requires the exact selected source weapon variant to be active.`;
      setUnityAnimatorFeedback(message, 'error');
      syncUnityAnimatorControls();
      return false;
    }
  }
  const accepted = character.playAnimation(name);
  if (accepted) {
    setUnityAnimatorFeedback(`${name} accepted by the Unity Animator controller.`, 'success');
  } else {
    setUnityAnimatorFeedback(`${name} is unavailable in the current exact Unity controller state.`, 'error');
  }
  syncPanels();
  return accepted;
}

unityTimeScaleInput.addEventListener('input', () => {
  unityTimeScale = THREE.MathUtils.clamp(Number(unityTimeScaleInput.value), 0, 1);
  syncUnityAnimatorControls();
});

unityMoveSpeedInput.addEventListener('input', () => {
  unityMoveSpeed = THREE.MathUtils.clamp(Number(unityMoveSpeedInput.value), 0, 3);
  character?.setMoveSpeed(unityMoveSpeed, 0);
  setUnityAnimatorFeedback(`Move Speed = ${unityMoveSpeed.toFixed(2)}.`, 'success');
  syncUnityAnimatorControls();
});

unityStunnedInput.addEventListener('change', () => {
  unityStunned = unityStunnedInput.checked;
  if (unityStunned) {
    if (!playUnityAnimatorCommand('Stunned')) {
      unityStunned = false;
      syncUnityAnimatorControls();
    }
  } else if (character) {
    character.resumeLocomotion(0.25);
    character.setMoveSpeed(unityMoveSpeed, 0);
    setUnityAnimatorFeedback('Stunned = false; returning to Locomotion over 0.25 s.', 'success');
    syncPanels();
  }
});

unityDeadButton.addEventListener('click', () => { playUnityAnimatorCommand('Dead'); });
unityRestartButton.addEventListener('click', () => {
  if (playUnityAnimatorCommand('Restart')) {
    character?.setMoveSpeed(unityMoveSpeed, 0);
  }
  syncUnityAnimatorControls();
});
unityAttackButton.addEventListener('click', () => { playUnityAnimatorCommand('Attack'); });
unitySkillButton.addEventListener('click', () => { playUnityAnimatorCommand('Skill'); });

const animationPanel = createAxieAnimationPanel({
  mount: ui,
  onPlay: async (clip) => {
    if (!debugClipInspector || contextDiagnosticRunning || !character) return;
    const clipFamily = weaponFamilyManifest(clip.group);
    if (clipFamily && character.activeWeapon !== clipFamily.id) {
      setUnityAnimatorFeedback(
        `Debug clip ${clip.name} was not played because ${clipFamily.label} is not equipped. Clip inspection never auto-equips.`,
        'error',
      );
      return;
    }
    await character?.playAnimationAsync(clip.name, {
      lockLocomotion: !clip.looping,
      loop: clip.looping,
    });
    writeUrlState();
    syncPanels();
  },
  onResumeLocomotion: () => {
    if (!contextDiagnosticRunning) {
      character?.resumeLocomotion();
      character?.setMoveSpeed(unityMoveSpeed, 0);
    }
  },
  onEquipWeapon: (id) => {
    if (!contextDiagnosticRunning) void selectWeapon(id);
  },
  onOpenChange: (open) => {
    if (open) {
      closeCreatorForAnimation?.();
      closeEyeForOtherPanel?.();
    }
  },
});
animationPanel.host.hidden = !debugClipInspector;

const eyePanel = createAxieEyePanel({
  mount: ui,
  initialConfig: eyeConfig,
  onChange: (patch) => {
    eyeController?.setConfig(patch);
    eyeConfig = eyeController?.config ?? eyeConfig;
    writeUrlState();
    syncEyePanel();
  },
  onBlink: () => { eyeController?.blink(); },
  onOpenChange: (open) => {
    if (open) {
      animationPanel.close();
      closeCreatorForAnimation?.();
    }
  },
});
closeEyeForOtherPanel = () => eyePanel.close();

const creator = createAxieCreator({
  mount: ui,
  title: 'Axie Creator',
  catalog,
  initialState: creatorState,
  keyboardShortcut: 'KeyX',
  onOpenChange: (open) => {
    if (open) {
      animationPanel.close();
      eyePanel.close();
    }
  },
  onChange: ({ state }) => {
    setShowcaseIdentity(undefined, undefined);
    const stillResolvedAxie = currentAxieLookup
      && state.mode === 'genes'
      && state.genes === currentAxieLookup.genes;
    if (currentAxieLookup && !stillResolvedAxie) forgetAxieLookup();
    creatorState = state;
    writeUrlState();
    void rebuild(state);
  },
});
closeCreatorForAnimation = () => creator.close({ restoreFocus: false });

async function loadAxieById(input: string): Promise<boolean> {
  let axieId: string;
  try {
    axieId = normalizeAxieId(input);
  } catch (error) {
    setAxieIdStatus('error', error instanceof Error ? error.message : 'Enter a valid Axie ID.');
    axieIdInput.focus();
    axieIdInput.select();
    return false;
  }

  axieLookupController?.abort();
  const controller = new AbortController();
  axieLookupController = controller;
  const previousState = creatorState;
  const previousLookup = currentAxieLookup;
  axieIdInput.disabled = true;
  axieIdSubmit.disabled = true;
  axieIdSubmit.textContent = 'Loading…';
  setAxieIdStatus('loading', `Resolving Axie #${axieId}…`);

  try {
    const lookup = await mixer.resolveAxieId({ axieId, signal: controller.signal });
    if (controller.signal.aborted) return false;
    const decoded = mixer.decodeGenes(lookup.genes);
    const nextState = normalizeAxieCreatorState(Object.freeze({
      mode: 'genes',
      genes: decoded.genes,
      descriptor: decoded.descriptor,
      unsupportedClasses: decoded.unsupportedClasses,
      resolvedParts: Object.freeze({}),
      quality: creatorState.quality,
      artMode: creatorState.artMode,
      studioOpen: creator.isOpen,
    }), catalog);

    currentAxieLookup = lookup;
    creatorState = nextState;
    creator.setState(nextState, { notify: false });
    axieIdInput.value = lookup.axieId;
    syncAxieLookupIdentity();
    writeUrlState();
    const assembled = await rebuild(nextState);
    if (controller.signal.aborted) return false;
    if (!assembled) {
      currentAxieLookup = previousLookup;
      creatorState = previousState;
      creator.setState(previousState, { notify: false });
      syncAxieLookupIdentity();
      writeUrlState();
      setAxieIdStatus('error', `Axie #${lookup.axieId} resolved, but its 3D mix could not be assembled.`);
      return false;
    }

    setShowcaseIdentity(undefined, undefined);
    focusShowcaseCamera('full-body');
    setAxieIdStatus(
      'success',
      `${lookup.name} loaded from ${lookup.source}. Open Creator to inspect its decoded genes and parts.`,
    );
    return true;
  } catch (error) {
    if (controller.signal.aborted) return false;
    setAxieIdStatus('error', error instanceof Error ? error.message : `Axie #${axieId} could not be loaded.`);
    return false;
  } finally {
    if (axieLookupController === controller) {
      axieLookupController = undefined;
      axieIdInput.disabled = false;
      axieIdSubmit.disabled = false;
      axieIdSubmit.textContent = 'Load Axie';
    }
  }
}

axieIdForm.addEventListener('submit', (event) => {
  event.preventDefault();
  void loadAxieById(axieIdInput.value);
});

eyePresetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const presetId = button.dataset.eyePreset;
    if (presetId === 'clear' || presetId === 'kotaro') void applyAnimatedEyePreset(presetId);
  });
});

specialPresetButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const presetId = button.dataset.specialPreset;
    if (presetId && Object.hasOwn(AXIE_SPECIAL_SHOWCASE_PRESETS, presetId)) {
      void applySpecialShowcasePreset(presetId as AxieSpecialShowcasePresetId);
    }
  });
});

weaponFamilySelect.addEventListener('change', () => {
  void selectWeapon(weaponFamilySelect.value || undefined);
});

weaponVariantSelect.addEventListener('change', () => {
  void selectWeaponVariant(weaponVariantSelect.value || undefined);
});

function syncEyeDatasets(inspection = eyeController?.inspect()) {
  const write = (key: string, value: string) => {
    if (app.dataset[key] !== value) app.dataset[key] = value;
  };
  write('eyeSupported', String(inspection?.supported ?? false));
  write('eyePartId', inspection?.partId ?? '');
  write('eyeProfile', inspection?.profile ?? '');
  write('eyeExpression', eyeConfig.expression);
  write('eyeIntensity', String(eyeConfig.expressionIntensity));
  write('eyeGazeMode', eyeConfig.gazeMode);
  write('eyeGazeX', String(inspection?.gaze.x ?? 0));
  write('eyeGazeY', String(inspection?.gaze.y ?? 0));
  write('eyeGazePhase', inspection?.ambientGazePhase ?? '');
  write('eyeGazeTargetX', String(inspection?.ambientGazeTarget.x ?? 0));
  write('eyeGazeTargetY', String(inspection?.ambientGazeTarget.y ?? 0));
  write('eyeSaccadeCount', String(inspection?.ambientSaccadeCount ?? 0));
  write('eyeMicroSaccadeCount', String(inspection?.ambientMicroSaccadeCount ?? 0));
  write('eyeAutoBlink', String(eyeConfig.autoBlink));
  write('eyeBlinkWeight', String(inspection?.blinkWeight ?? 0));
  write('eyeBlinkCount', String(inspection?.blinkCount ?? 0));
  write('eyeBoundMeshes', String(inspection?.boundMeshes ?? 0));
  write('eyeTextureRevision', String(inspection?.textureRevision ?? 0));
  write('eyeTextureCount', String(inspection?.textureCount ?? 0));
  write('eyeSourceSvg', inspection?.sourceSvgSha256 ?? '');
  write('eyePupilFreeSvg', inspection?.pupilFreeSvgSha256 ?? '');
  write('eyePupilOnlySvg', inspection?.pupilOnlySvgSha256 ?? '');
  write('eyeApertureSvg', inspection?.apertureMaskSvgSha256 ?? '');
}

function syncEyePanel() {
  const inspection = eyeController?.inspect();
  eyePanel.setState(eyeConfig, inspection);
  syncEyeDatasets(inspection);
}

function syncPanels() {
  animationPanel.setAvailable(Boolean(character));
  animationPanel.setAnimations(character?.animations.clips ?? []);
  animationPanel.setWeapons(
    character?.weapons.filter((entry) => UNITY_SAMPLE_WEAPON_ID_SET.has(entry.id)) ?? [],
  );
  animationPanel.setActive(character?.activeAnimation, character?.animationOverrideActive ?? false);
  animationPanel.setActiveWeapon(character?.activeWeapon, character?.weaponLoading);
  app.dataset.activeAnimation = character?.activeAnimation ?? '';
  app.dataset.animationOverride = String(character?.animationOverrideActive ?? false);
  app.dataset.characterKey = character?.key ?? '';
  app.dataset.cacheEntries = String(mixer.cacheDiagnostics().entries);
  syncWeaponRuntimeDiagnostics();
  renderWeaponPicker();
  syncUnityAnimatorControls();
  syncEyePanel();
}

async function rebuild(state: AxieCreatorState) {
  const requestGeneration = ++generation;
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  creator.setLoading(true, 'Mixing body, parts, textures, materials, animations, and add-ons…');
  status.textContent = 'Assembling Axie…';
  app.dataset.ready = 'false';
  const request = {
    quality: state.quality,
    artMode: state.artMode,
    strict: true,
    signal: controller.signal,
  } as const;
  const requestIsCurrent = () => (
    !controller.signal.aborted
    && requestGeneration === generation
  );
  try {
    const next = state.mode === 'genes'
      ? await mixer.createFromGenes({ ...request, genes: state.genes })
      : await mixer.create({ ...request, descriptor: state.descriptor });
    const targetCharacter = next;
    if (!requestIsCurrent() || targetCharacter.disposed) {
      if (!targetCharacter.disposed) targetCharacter.dispose();
      return false;
    }
    let nextEyes: AxieEyeController;
    try {
      nextEyes = await createAxieEyeController(targetCharacter, {
        initialConfig: eyeConfig,
        randomSeed: 0x434c4541,
      });
    } catch (error) {
      if (!targetCharacter.disposed) targetCharacter.dispose();
      throw error;
    }
    if (!requestIsCurrent() || targetCharacter.disposed) {
      nextEyes.dispose();
      if (!targetCharacter.disposed) targetCharacter.dispose();
      return false;
    }
    const previousCharacter = character;
    eyeController?.dispose();
    previousCharacter?.wrapper.removeFromParent();
    previousCharacter?.dispose();
    character = targetCharacter;
    const targetIsActive = () => (
      requestIsCurrent()
      && character === targetCharacter
      && !targetCharacter.disposed
    );
    eyeController = nextEyes;
    pointerEyeAnchor = targetCharacter.model.getObjectByName('Root_Eye_M_JNT')
      ?? targetCharacter.anchors.cameraTarget;
    eyeConfig = eyeController.config;
    targetCharacter.wrapper.position.set(0, 0, 0);
    scene.add(targetCharacter.wrapper);
    fields.body.textContent = state.descriptor.body;
    fields.rigs.textContent = String(targetCharacter.diagnostics.rigs.filter((entry) => entry.attached).length);
    fields.clips.textContent = String(targetCharacter.animations.clips.length);
    fields.quality.textContent = state.quality;
    fields.cache.textContent = String(mixer.cacheDiagnostics().entries);
    app.dataset.body = state.descriptor.body;
    app.dataset.quality = state.quality;
    app.dataset.clipCount = String(targetCharacter.animations.clips.length);
    app.dataset.eyePointerAnchor = pointerEyeAnchor.name;
    targetCharacter.setMoveSpeed(unityMoveSpeed, 0);
    const selectedSelection = normalizeWeaponSelection();
    if (selectedSelection.variant) {
      await targetCharacter.equipWeapon(selectedSelection.variant.id);
      if (!targetIsActive()) return false;
    }
    if (unityStunned) targetCharacter.playAnimation('Stunned');
    if (!requestedRuntimeStateApplied) {
      if (debugClipInspector
        && requestedAnimation
        && targetCharacter.animations.clips.some((clip) => clip.name === requestedAnimation)) {
        const clip = targetCharacter.animations.clips.find((candidate) => candidate.name === requestedAnimation)!;
        const clipFamily = weaponFamilyManifest(clip.group);
        if (!clipFamily || targetCharacter.activeWeapon === clipFamily.id) {
          await targetCharacter.playAnimationAsync(clip.name, {
            lockLocomotion: !clip.looping,
            loop: clip.looping,
          });
          if (!targetIsActive()) return false;
        }
      }
      if (!targetIsActive()) return false;
      requestedRuntimeStateApplied = true;
    }
    if (!targetIsActive()) return false;
    app.dataset.ready = 'true';
    creator.setLoading(false, 'Axie ready.');
    status.textContent = 'Ready';
    syncPanels();
    scheduleRequestedContextDiagnostic();
    return true;
  } catch (error) {
    if (!requestIsCurrent()) return false;
    app.dataset.ready = 'false';
    creator.setLoading(false, error instanceof Error ? error.message : String(error));
    status.textContent = 'Load failed';
    console.error(error);
    return false;
  }
}

interface DemoStateSnapshot {
  readonly ready: boolean;
  readonly generation: number;
  readonly characterKey: string;
  readonly body: string;
  readonly quality: string;
  readonly runtimeQuality: string;
  readonly artMode: string;
  readonly activeAnimation: string;
  readonly animationOverride: boolean;
  readonly activeWeapon: string;
  readonly activeWeaponSelection: string;
  readonly weaponLoading: string;
  readonly weaponLoadingSelection: string;
  readonly selectedWeaponFamily: string;
  readonly selectedWeaponVariant: string;
  readonly eyeSupported: boolean;
  readonly eyeProfile: string;
  readonly eyeExpression: string;
  readonly eyeIntensity: number;
  readonly eyeGazeMode: string;
  readonly eyeFixedGaze: readonly [number, number];
  readonly eyeAutoBlink: boolean;
  readonly position: readonly number[];
  readonly quaternion: readonly number[];
  readonly cacheEntries: number;
}

interface RigPoseInspection {
  readonly rootName: string;
  readonly rootPosition: readonly number[];
  readonly rootQuaternion: readonly number[];
  readonly rootScale: readonly number[];
  readonly boundsMin: readonly number[];
  readonly boundsMax: readonly number[];
  readonly boundsSize: readonly number[];
  readonly attachmentPositions: Readonly<Record<string, readonly number[]>>;
  readonly anatomyNodes: Readonly<Record<string, RuntimeNodeInspection>>;
  readonly nodeCount: number;
  readonly meshCount: number;
  readonly skinnedMeshes: readonly {
    readonly name: string;
    readonly visibleInHierarchy: boolean;
    readonly frustumCulled: boolean;
    readonly vertexCount: number;
    readonly skeletonBoneCount: number;
    readonly boneMatricesFinite: boolean;
  }[];
  readonly nonFiniteNodes: readonly string[];
}

interface PartRuntimeInspection {
  readonly partId: string;
  readonly rigType: string;
  readonly nodeName: string;
  readonly coordinateSpace: string;
  readonly referenceBody: string;
  readonly bodyRetargeted: boolean;
  readonly visible: boolean;
  readonly visibleInHierarchy: boolean;
  readonly localMatrix: readonly number[];
  readonly worldMatrix: readonly number[];
  readonly matrixWorldDeterminant: number;
  readonly basisError: number;
  readonly unityRestPath: string;
  readonly boundsMin: readonly number[];
  readonly boundsMax: readonly number[];
  readonly boundsSize: readonly number[];
  readonly meshCount: number;
  readonly vertexCount: number;
}

type QaCameraView = 'front' | 'rear' | 'left' | 'right' | 'front-left' | 'front-right';

interface RuntimeNodeInspection {
  readonly name: string;
  readonly matches: number;
  readonly visibleInHierarchy: boolean;
  readonly localMatrix: readonly number[];
  readonly worldMatrix: readonly number[];
  readonly worldPosition: readonly number[];
  readonly matrixWorldDeterminant: number;
}

interface WeaponInstanceInspection {
  readonly weaponId: string;
  readonly side: 'left' | 'right' | '';
  readonly nodeName: string;
  readonly parentName: string;
  readonly visible: boolean;
  readonly visibleInHierarchy: boolean;
  readonly mirrorLeft: boolean;
  readonly localMatrix: readonly number[];
  readonly worldMatrix: readonly number[];
  readonly matrixWorldDeterminant: number;
  readonly socketBasisError: number;
  readonly socketUnityRestPath: string;
  readonly boundsMin: readonly number[];
  readonly boundsMax: readonly number[];
  readonly boundsSize: readonly number[];
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly embeddedAnimationClipCount: number;
  readonly separateAnimatorMarkers: readonly string[];
  readonly hasSeparateAnimator: boolean;
}

interface UnityAnimatorInspection {
  readonly timeScale: number;
  readonly moveSpeed: number;
  readonly stunned: boolean;
  readonly locomotionWeights: Readonly<Record<'Idle' | 'Walk' | 'Run', number>>;
  readonly activeAnimation: string;
  readonly activeWeapon: string;
  readonly animationOverride: boolean;
  readonly evidenceFrozen: boolean;
}

interface ContextDiagnosticReport {
  readonly supported: boolean;
  readonly status: 'passed' | 'failed';
  readonly cyclesRequested: number;
  readonly cyclesCompleted: number;
  readonly lossEvents: number;
  readonly restoreEvents: number;
  readonly durationMs: number;
  readonly statePreserved: boolean;
  readonly before: DemoStateSnapshot;
  readonly after: DemoStateSnapshot;
  readonly error?: string;
}

interface ContextDiagnosticOptions {
  /** The diagnostic always performs at least two complete loss/restore cycles. */
  readonly cycles?: number;
  readonly timeoutMs?: number;
}

interface AxieMixerDemoDebugApi {
  readonly version: 1;
  readonly lastContextReport: ContextDiagnosticReport | undefined;
  inspectState(): DemoStateSnapshot;
  inspectAxieLookup(): AxieLookup | undefined;
  loadAxieById(axieId: string): Promise<boolean>;
  applyAnimatedEyePreset(presetId: 'clear' | 'kotaro'): Promise<boolean>;
  applySpecialShowcasePreset(presetId: AxieSpecialShowcasePresetId): Promise<boolean>;
  inspectRigPose(): RigPoseInspection | undefined;
  inspectParts(): readonly PartRuntimeInspection[];
  inspectWeaponInstances(): readonly WeaponInstanceInspection[];
  inspectPairedWeaponAnimation(): AxiePairedWeaponAnimationInspection;
  inspectAnimator(): UnityAnimatorInspection;
  inspectEyes(): AxieEyeRuntimeInspection | undefined;
  setEyeConfig(patch: AxieEyePerformanceConfigPatch): AxieEyeRuntimeInspection | undefined;
  blinkEyes(): boolean;
  playAnimation(name: string, options?: {
    readonly loop?: boolean;
    readonly lockLocomotion?: boolean;
    readonly transition?: number;
    readonly restart?: boolean;
  }): Promise<boolean>;
  equipWeapon(id?: string): Promise<boolean>;
  selectWeaponVariant(id?: string): Promise<boolean>;
  resumeLocomotion(transition?: number): boolean;
  setTimeScale(value: number): UnityAnimatorInspection;
  setMoveSpeed(value: number): UnityAnimatorInspection;
  setStunned(value: boolean): boolean;
  triggerAnimator(command: 'Attack' | 'Skill' | 'Dead' | 'Restart'): boolean;
  stepSimulation(seconds: number, fixedStepSeconds?: number): UnityAnimatorInspection;
  setCameraView(view: QaCameraView): readonly number[];
  setEvidenceFrozen(frozen: boolean): boolean;
  runContextLossRestore(options?: ContextDiagnosticOptions): Promise<ContextDiagnosticReport>;
}

declare global {
  interface Window {
    /** Browser-test API for deterministic, opt-in mixer diagnostics. */
    __AXIE_MIXER_DEBUG__: AxieMixerDemoDebugApi;
  }
}

function inspectDemoState(): DemoStateSnapshot {
  return Object.freeze({
    ready: app.dataset.ready === 'true' && Boolean(character) && !character?.disposed,
    generation,
    characterKey: character?.key ?? '',
    body: creatorState.descriptor.body,
    quality: creatorState.quality,
    runtimeQuality: character?.quality.id ?? '',
    artMode: creatorState.artMode,
    activeAnimation: character?.activeAnimation ?? '',
    animationOverride: character?.animationOverrideActive ?? false,
    activeWeapon: character?.activeWeapon ?? '',
    activeWeaponSelection: character?.activeWeaponSelection ?? '',
    weaponLoading: character?.weaponLoading ?? '',
    weaponLoadingSelection: character?.weaponLoadingSelection ?? '',
    selectedWeaponFamily: selectedWeaponId ?? '',
    selectedWeaponVariant: selectedWeaponVariantId ?? '',
    eyeSupported: eyeController?.supported ?? false,
    eyeProfile: eyeController?.inspect().profile ?? '',
    eyeExpression: eyeConfig.expression,
    eyeIntensity: eyeConfig.expressionIntensity,
    eyeGazeMode: eyeConfig.gazeMode,
    eyeFixedGaze: Object.freeze([eyeConfig.fixedGaze.x, eyeConfig.fixedGaze.y]) as readonly [number, number],
    eyeAutoBlink: eyeConfig.autoBlink,
    position: Object.freeze(character?.wrapper.position.toArray() ?? []),
    quaternion: Object.freeze(character?.wrapper.quaternion.toArray() ?? []),
    cacheEntries: mixer.cacheDiagnostics().entries,
  });
}

function visibleInHierarchy(node: THREE.Object3D) {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function finiteMatrixElements(matrix: THREE.Matrix4) {
  return Object.freeze([...matrix.elements]);
}

function inspectRuntimeNode(root: THREE.Object3D, name: string): RuntimeNodeInspection {
  const matches: THREE.Object3D[] = [];
  root.traverse((node) => { if (node.name === name) matches.push(node); });
  const node = matches[0];
  return Object.freeze({
    name,
    matches: matches.length,
    visibleInHierarchy: node ? visibleInHierarchy(node) : false,
    localMatrix: finiteMatrixElements(node?.matrix ?? new THREE.Matrix4()),
    worldMatrix: finiteMatrixElements(node?.matrixWorld ?? new THREE.Matrix4()),
    worldPosition: Object.freeze(node?.getWorldPosition(new THREE.Vector3()).toArray() ?? []),
    matrixWorldDeterminant: node?.matrixWorld.determinant() ?? Number.NaN,
  });
}

function unityLocomotionInspection(moveSpeed: number) {
  if (moveSpeed <= 2) {
    const walk = moveSpeed / 2;
    return Object.freeze({ Idle: 1 - walk, Walk: walk, Run: 0 });
  }
  const run = moveSpeed - 2;
  return Object.freeze({ Idle: 0, Walk: 1 - run, Run: run });
}

function inspectAnimator(): UnityAnimatorInspection {
  return Object.freeze({
    timeScale: unityTimeScale,
    moveSpeed: unityMoveSpeed,
    stunned: unityStunned,
    locomotionWeights: unityLocomotionInspection(unityMoveSpeed),
    activeAnimation: character?.activeAnimation ?? '',
    activeWeapon: character?.activeWeapon ?? '',
    animationOverride: character?.animationOverrideActive ?? false,
    evidenceFrozen,
  });
}

function inspectRigPose(): RigPoseInspection | undefined {
  if (!character || character.disposed) return undefined;
  const stableCharacter = character;
  const root = stableCharacter.model.getObjectByName('Root_Character');
  if (!root) return undefined;
  const bounds = new THREE.Box3().setFromObject(stableCharacter.model, true);
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const attachmentNames = [
    'Elbow_L_JNT',
    'Elbow_R_JNT',
    'Fool_L_JNT',
    'Fool_R_JNT',
    'Root_Back_M_JNT',
    'Root_Ear_L_JNT',
    'Root_Ear_R_JNT',
    'Root_Eye_M_JNT',
    'Root_Mouth_M_JNT',
    'Root_Tail_M_JNT',
  ] as const;
  const attachmentPositions = Object.fromEntries(attachmentNames.map((name) => {
    const node = stableCharacter.model.getObjectByName(name);
    return [name, Object.freeze(node?.getWorldPosition(new THREE.Vector3()).toArray() ?? [])];
  }));
  const anatomyNames = [
    'Root_Eye_M_JNT',
    'Root_Weapon_L_JNT',
    'Root_Weapon_R_JNT',
    'Clavivle_L_JNT',
    'Clavivle_R_JNT',
    'Arm_L_JNT',
    'Arm_R_JNT',
    'Elbow_L_JNT',
    'Elbow_R_JNT',
    'Hand_L_JNT',
    'Hand_R_JNT',
    'HandEnd_L_JNT',
    'HandEnd_R_JNT',
    'Weapon_L_JNT',
    'Weapon_R_JNT',
    'Thin_L_JNT',
    'Thin_R_JNT',
    'Knee_L_JNT',
    'Knee_R_JNT',
    'Fool_L_JNT',
    'Fool_R_JNT',
    'Toe_L_JNT',
    'Toe_R_JNT',
    'ToeEnd_L_JNT',
    'ToeEnd_R_JNT',
  ] as const;
  root.updateWorldMatrix(true, true);
  let nodeCount = 0;
  let meshCount = 0;
  const skinnedMeshes: Array<{
    name: string;
    visibleInHierarchy: boolean;
    frustumCulled: boolean;
    vertexCount: number;
    skeletonBoneCount: number;
    boneMatricesFinite: boolean;
  }> = [];
  const nonFiniteNodes: string[] = [];
  root.traverse((node) => {
    nodeCount += 1;
    if (node instanceof THREE.Mesh) meshCount += 1;
    if (![...node.matrix.elements, ...node.matrixWorld.elements].every(Number.isFinite)) {
      nonFiniteNodes.push(node.name || node.uuid);
    }
  });
  stableCharacter.model.traverse((node) => {
    if (!(node as THREE.SkinnedMesh).isSkinnedMesh || node.userData.axieOutline === true) return;
    let belongsToAttachment = false;
    for (
      let current: THREE.Object3D | null = node;
      current && current !== stableCharacter.model;
      current = current.parent
    ) {
      if (typeof current.userData.axiePartId === 'string'
        || typeof current.userData.axieWeaponId === 'string') {
        belongsToAttachment = true;
        break;
      }
    }
    if (belongsToAttachment) return;
    const skinned = node as THREE.SkinnedMesh;
    skinned.skeleton.update();
    skinnedMeshes.push({
      name: skinned.name || skinned.uuid,
      visibleInHierarchy: visibleInHierarchy(skinned),
      frustumCulled: skinned.frustumCulled,
      vertexCount: skinned.geometry.getAttribute('position')?.count ?? 0,
      skeletonBoneCount: skinned.skeleton.bones.length,
      boneMatricesFinite: [...skinned.skeleton.boneMatrices].every(Number.isFinite),
    });
  });
  const anatomyNodes = Object.fromEntries(
    anatomyNames.map((name) => [name, inspectRuntimeNode(root, name)]),
  );
  return Object.freeze({
    rootName: root.name,
    rootPosition: Object.freeze(root.position.toArray()),
    rootQuaternion: Object.freeze(root.quaternion.toArray()),
    rootScale: Object.freeze(root.scale.toArray()),
    boundsMin: Object.freeze(bounds.min.toArray()),
    boundsMax: Object.freeze(bounds.max.toArray()),
    boundsSize: Object.freeze(boundsSize.toArray()),
    attachmentPositions: Object.freeze(attachmentPositions),
    anatomyNodes: Object.freeze(anatomyNodes),
    nodeCount,
    meshCount,
    skinnedMeshes: Object.freeze(skinnedMeshes.map((mesh) => Object.freeze(mesh))),
    nonFiniteNodes: Object.freeze(nonFiniteNodes),
  });
}

function inspectParts(): readonly PartRuntimeInspection[] {
  if (!character || character.disposed) return Object.freeze([]);
  character.model.updateWorldMatrix(true, true);
  const roots: THREE.Object3D[] = [];
  character.model.traverse((node) => {
    if (node.userData.axieOutline === true) return;
    const partId = typeof node.userData.axiePartId === 'string' ? node.userData.axiePartId : '';
    const parentPartId = typeof node.parent?.userData.axiePartId === 'string'
      ? node.parent.userData.axiePartId
      : '';
    if (partId && partId !== parentPartId) roots.push(node);
  });
  return Object.freeze(roots.map((root) => {
    const bounds = new THREE.Box3().setFromObject(root, true);
    const size = bounds.getSize(new THREE.Vector3());
    let meshCount = 0;
    let vertexCount = 0;
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      meshCount += 1;
      vertexCount += node.geometry.getAttribute('position')?.count ?? 0;
    });
    return Object.freeze({
      partId: String(root.userData.axiePartId),
      rigType: String(root.userData.axieRigType ?? ''),
      nodeName: root.name,
      coordinateSpace: String(root.userData.axieCoordinateSpace ?? ''),
      referenceBody: String(root.userData.axiePartReferenceBody ?? ''),
      bodyRetargeted: root.userData.axiePartBodyRetargeted === true,
      visible: root.visible,
      visibleInHierarchy: visibleInHierarchy(root),
      localMatrix: finiteMatrixElements(root.matrix),
      worldMatrix: finiteMatrixElements(root.matrixWorld),
      matrixWorldDeterminant: root.matrixWorld.determinant(),
      basisError: Number(root.userData.axiePartBasisError),
      unityRestPath: String(root.userData.axiePartUnityRestPath ?? ''),
      boundsMin: Object.freeze(bounds.min.toArray()),
      boundsMax: Object.freeze(bounds.max.toArray()),
      boundsSize: Object.freeze(size.toArray()),
      meshCount,
      vertexCount,
    });
  }));
}

function inspectWeaponInstances(): readonly WeaponInstanceInspection[] {
  if (!character || character.disposed) return Object.freeze([]);
  character.model.updateWorldMatrix(true, true);
  const roots: THREE.Object3D[] = [];
  character.model.traverse((node) => {
    const weaponId = typeof node.userData.axieWeaponId === 'string'
      ? node.userData.axieWeaponId
      : '';
    const parentWeaponId = typeof node.parent?.userData.axieWeaponId === 'string'
      ? node.parent.userData.axieWeaponId
      : '';
    if (weaponId && weaponId !== parentWeaponId) roots.push(node);
  });
  roots.sort((left, right) => {
    const order = (node: THREE.Object3D) => node.userData.axieWeaponSide === 'right' ? 0 : 1;
    return order(left) - order(right) || left.name.localeCompare(right.name);
  });
  return Object.freeze(roots.map((root) => {
    const bounds = new THREE.Box3().setFromObject(root, true);
    const boundsSize = bounds.getSize(new THREE.Vector3());
    const separateAnimatorMarkers = new Set<string>();
    let meshCount = 0;
    let vertexCount = 0;
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        meshCount += 1;
        vertexCount += node.geometry.getAttribute('position')?.count ?? 0;
      }
      Object.keys(node.userData).forEach((key) => {
        if (/animator|animationmixer/iu.test(key)) separateAnimatorMarkers.add(`userData.${key}`);
      });
      Object.keys(node).forEach((key) => {
        if (/^(?:animator|animationMixer)$/iu.test(key)) separateAnimatorMarkers.add(key);
      });
    });
    const embeddedAnimationClipCount = Array.isArray(
      (root as THREE.Object3D & { animations?: unknown[] }).animations,
    )
      ? (root as THREE.Object3D & { animations: unknown[] }).animations.length
      : 0;
    const side = root.userData.axieWeaponSide;
    const parent = root.parent;
    return Object.freeze({
      weaponId: String(root.userData.axieWeaponId),
      side: side === 'left' || side === 'right' ? side : '',
      nodeName: root.name,
      parentName: parent?.name ?? '',
      visible: root.visible,
      visibleInHierarchy: visibleInHierarchy(root),
      mirrorLeft: root.userData.axieWeaponMirrorLeft === true,
      localMatrix: finiteMatrixElements(root.matrix),
      worldMatrix: finiteMatrixElements(root.matrixWorld),
      matrixWorldDeterminant: root.matrixWorld.determinant(),
      socketBasisError: Number(parent?.userData.axieWeaponBasisError),
      socketUnityRestPath: String(parent?.userData.axieWeaponUnityRestPath ?? ''),
      boundsMin: Object.freeze(bounds.min.toArray()),
      boundsMax: Object.freeze(bounds.max.toArray()),
      boundsSize: Object.freeze(boundsSize.toArray()),
      meshCount,
      vertexCount,
      embeddedAnimationClipCount,
      separateAnimatorMarkers: Object.freeze([...separateAnimatorMarkers].sort()),
      hasSeparateAnimator: embeddedAnimationClipCount > 0 || separateAnimatorMarkers.size > 0,
    });
  }));
}

function invariantFingerprint(state: DemoStateSnapshot) {
  return JSON.stringify({
    ready: state.ready,
    generation: state.generation,
    characterKey: state.characterKey,
    body: state.body,
    quality: state.quality,
    runtimeQuality: state.runtimeQuality,
    artMode: state.artMode,
    activeAnimation: state.activeAnimation,
    animationOverride: state.animationOverride,
    activeWeapon: state.activeWeapon,
    weaponLoading: state.weaponLoading,
    eyeSupported: state.eyeSupported,
    eyeProfile: state.eyeProfile,
    eyeExpression: state.eyeExpression,
    eyeIntensity: state.eyeIntensity,
    eyeGazeMode: state.eyeGazeMode,
    eyeFixedGaze: state.eyeFixedGaze,
    eyeAutoBlink: state.eyeAutoBlink,
    position: state.position,
    quaternion: state.quaternion,
  });
}

function waitForCanvasEvent(type: 'webglcontextlost' | 'webglcontextrestored', timeoutMs: number) {
  return new Promise<Event>((resolve, reject) => {
    const onEvent = (event: Event) => {
      clearTimeout(timer);
      resolve(event);
    };
    const timer = window.setTimeout(() => {
      canvas.removeEventListener(type, onEvent);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for ${type}.`));
    }, timeoutMs);
    canvas.addEventListener(type, onEvent, { once: true });
  });
}

async function waitForAnimationFrames(count: number) {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
}

async function waitForStableCharacter(timeoutMs: number) {
  const deadline = performance.now() + timeoutMs;
  while (character?.weaponLoading && performance.now() < deadline) {
    await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
  }
  if (!character || character.disposed || app.dataset.ready !== 'true') {
    throw new Error('Context diagnostic requires a fully assembled, live Axie.');
  }
  if (character.weaponLoading) {
    throw new Error(`Weapon "${character.weaponLoading}" did not finish loading before the context diagnostic.`);
  }
  return character;
}

let contextIsLost = false;
let contextLossEvents = 0;
let contextRestoreEvents = 0;
let contextDiagnosticPromise: Promise<ContextDiagnosticReport> | undefined;
let lastContextReport: ContextDiagnosticReport | undefined;

function renderScene() {
  if (contextIsLost) return false;
  const composed = mysticGammaCompositor.render(renderer, scene, camera);
  app.dataset.mysticGammaRoute = mysticGammaCompositor.lastRoute;
  app.dataset.mysticGammaComposed = String(composed);
  return composed;
}

canvas.addEventListener('webglcontextlost', (event) => {
  // Required by WebGL before an intentionally lost context may be restored.
  event.preventDefault();
  contextIsLost = true;
  contextLossEvents += 1;
  app.dataset.rendererContext = 'lost';
  app.dataset.contextLossEvents = String(contextLossEvents);
});

canvas.addEventListener('webglcontextrestored', () => {
  contextIsLost = false;
  contextRestoreEvents += 1;
  app.dataset.rendererContext = 'available';
  app.dataset.contextRestoreEvents = String(contextRestoreEvents);
});

app.dataset.rendererContext = 'available';
app.dataset.contextLossEvents = '0';
app.dataset.contextRestoreEvents = '0';
app.dataset.contextTestStatus = 'idle';
app.dataset.contextTestCycles = '0';
app.dataset.contextStatePreserved = 'unknown';
app.dataset.contextLossSupported = String(Boolean(renderer.getContext().getExtension('WEBGL_lose_context')));

async function runContextLossRestore(
  options: ContextDiagnosticOptions = {},
): Promise<ContextDiagnosticReport> {
  if (contextDiagnosticPromise) return contextDiagnosticPromise;
  const cyclesRequested = Math.max(2, Math.floor(options.cycles ?? 2));
  const timeoutMs = Math.max(1_000, Math.floor(options.timeoutMs ?? 15_000));

  contextDiagnosticPromise = (async () => {
    const startedAt = performance.now();
    const initialLossEvents = contextLossEvents;
    const initialRestoreEvents = contextRestoreEvents;
    let cyclesCompleted = 0;
    let extension = renderer.getContext().getExtension('WEBGL_lose_context');
    const supported = Boolean(extension);
    let before = inspectDemoState();
    let after = before;

    app.dataset.contextLossSupported = String(supported);
    app.dataset.contextTestStatus = 'running';
    app.dataset.contextTestCycles = `0/${cyclesRequested}`;
    app.dataset.contextStatePreserved = 'unknown';
    delete app.dataset.contextTestError;

    try {
      if (!extension) {
        throw new Error('WEBGL_lose_context is unavailable; this browser cannot run the required restore diagnostic.');
      }

      contextDiagnosticRunning = true;
      creator.setDisabled(true);
      pressed.clear();
      const stableCharacter = await waitForStableCharacter(timeoutMs);
      before = inspectDemoState();
      const expectedFingerprint = invariantFingerprint(before);
      const expectedCharacter = stableCharacter;

      for (let cycle = 1; cycle <= cyclesRequested; cycle += 1) {
        const cycleExtension = extension;
        if (!cycleExtension) {
          throw new Error(`Cycle ${cycle}: WEBGL_lose_context is unavailable.`);
        }
        status.textContent = `Context diagnostic ${cycle}/${cyclesRequested}: losing…`;
        app.dataset.contextTestPhase = 'losing';
        const lost = waitForCanvasEvent('webglcontextlost', timeoutMs);
        cycleExtension.loseContext();
        await lost;
        if (!renderer.getContext().isContextLost()) {
          throw new Error(`Cycle ${cycle}: webglcontextlost fired but the renderer context is not lost.`);
        }

        // Chromium may ignore restoreContext() while it is still dispatching the
        // loss event. Yield a task so the loss lifecycle fully commits first.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 100));

        status.textContent = `Context diagnostic ${cycle}/${cyclesRequested}: restoring…`;
        app.dataset.contextTestPhase = 'restoring';
        const restored = waitForCanvasEvent('webglcontextrestored', timeoutMs);
        cycleExtension.restoreContext();
        await restored;
        await waitForAnimationFrames(2);

        if (renderer.getContext().isContextLost()) {
          throw new Error(`Cycle ${cycle}: renderer context remained lost after webglcontextrestored.`);
        }
        if (character !== expectedCharacter || character.disposed) {
          throw new Error(`Cycle ${cycle}: the active Axie instance was replaced or disposed.`);
        }
        after = inspectDemoState();
        if (invariantFingerprint(after) !== expectedFingerprint) {
          throw new Error(`Cycle ${cycle}: character, action, weapon, quality, or transform state changed across restore.`);
        }

        cyclesCompleted = cycle;
        app.dataset.contextTestCycles = `${cycle}/${cyclesRequested}`;
        app.dataset.contextStatePreserved = 'true';
        extension = renderer.getContext().getExtension('WEBGL_lose_context');
        if (cycle < cyclesRequested && !extension) {
          throw new Error(`Cycle ${cycle}: WEBGL_lose_context disappeared after restoration.`);
        }
      }

      const report: ContextDiagnosticReport = Object.freeze({
        supported,
        status: 'passed',
        cyclesRequested,
        cyclesCompleted,
        lossEvents: contextLossEvents - initialLossEvents,
        restoreEvents: contextRestoreEvents - initialRestoreEvents,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        statePreserved: true,
        before,
        after,
      });
      lastContextReport = report;
      app.dataset.contextTestStatus = 'passed';
      app.dataset.contextTestPhase = 'complete';
      status.textContent = `Ready · context restore ${cyclesCompleted}/${cyclesRequested} passed`;
      console.info('[Axie Mixer] Context loss/restore diagnostic passed.', report);
      return report;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A failed diagnostic should not deliberately strand the demo on a lost
      // context. Keep the original failure, but make one bounded recovery try.
      if (renderer.getContext().isContextLost() && extension) {
        const bestEffortRestore = waitForCanvasEvent('webglcontextrestored', Math.min(timeoutMs, 2_000))
          .catch(() => undefined);
        extension.restoreContext();
        await bestEffortRestore;
        if (!renderer.getContext().isContextLost()) await waitForAnimationFrames(2);
      }
      after = inspectDemoState();
      const report: ContextDiagnosticReport = Object.freeze({
        supported,
        status: 'failed',
        cyclesRequested,
        cyclesCompleted,
        lossEvents: contextLossEvents - initialLossEvents,
        restoreEvents: contextRestoreEvents - initialRestoreEvents,
        durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
        statePreserved: invariantFingerprint(after) === invariantFingerprint(before),
        before,
        after,
        error: message,
      });
      lastContextReport = report;
      app.dataset.contextTestStatus = 'failed';
      app.dataset.contextTestPhase = 'failed';
      app.dataset.contextTestError = message;
      app.dataset.contextStatePreserved = String(report.statePreserved);
      status.textContent = `Context diagnostic failed: ${message}`;
      console.error('[Axie Mixer] Context loss/restore diagnostic failed.', report);
      throw Object.assign(new Error(message), { report });
    } finally {
      contextDiagnosticRunning = false;
      creator.setDisabled(false);
      syncPanels();
    }
  })().finally(() => {
    contextDiagnosticPromise = undefined;
  });

  return contextDiagnosticPromise;
}

function setQaTimeScale(value: number) {
  if (!Number.isFinite(value)) throw new TypeError('Unity Time Scale must be finite.');
  unityTimeScale = THREE.MathUtils.clamp(value, 0, 1);
  syncUnityAnimatorControls();
  return inspectAnimator();
}

function setQaMoveSpeed(value: number) {
  if (!Number.isFinite(value)) throw new TypeError('Unity Move Speed must be finite.');
  unityMoveSpeed = THREE.MathUtils.clamp(value, 0, 3);
  character?.setMoveSpeed(unityMoveSpeed, 0);
  syncUnityAnimatorControls();
  syncPanels();
  return inspectAnimator();
}

function setQaStunned(value: boolean) {
  if (!character || contextDiagnosticRunning) return false;
  const next = Boolean(value);
  if (next === unityStunned) return true;
  if (next) {
    const accepted = character.playAnimation('Stunned');
    if (!accepted) return false;
    unityStunned = true;
  } else {
    unityStunned = false;
    character.resumeLocomotion(0.25);
    character.setMoveSpeed(unityMoveSpeed, 0);
  }
  syncUnityAnimatorControls();
  syncPanels();
  return true;
}

function triggerQaAnimator(command: 'Attack' | 'Skill' | 'Dead' | 'Restart') {
  const accepted = playUnityAnimatorCommand(command);
  if (accepted && command === 'Restart') character?.setMoveSpeed(unityMoveSpeed, 0);
  syncUnityAnimatorControls();
  return accepted;
}

function stepQaSimulation(seconds: number, fixedStepSeconds = 1 / 60) {
  if (!character || character.disposed) throw new Error('No live Axie is available for QA stepping.');
  if (!evidenceFrozen) {
    throw new Error('Deterministic QA stepping requires setEvidenceFrozen(true).');
  }
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new TypeError('QA simulation duration must be a finite non-negative number.');
  }
  if (!Number.isFinite(fixedStepSeconds) || fixedStepSeconds <= 0 || fixedStepSeconds > 0.1) {
    throw new TypeError('QA fixed step must be finite, positive, and no greater than 0.1 seconds.');
  }
  let remaining = seconds;
  while (remaining > 1e-12) {
    const unscaledDelta = Math.min(fixedStepSeconds, remaining);
    const simulationDelta = unscaledDelta * unityTimeScale;
    character.setMoveSpeed(unityMoveSpeed, 0);
    if (unityStunned) character.playAnimation('Stunned');
    eyeController?.update(simulationDelta);
    character.update(simulationDelta);
    remaining -= unscaledDelta;
  }
  character.model.updateWorldMatrix(true, true);
  controls.update();
  renderScene();
  syncPanels();
  return inspectAnimator();
}

function setQaCameraView(view: QaCameraView) {
  if (!character || character.disposed) throw new Error('No live Axie is available for camera QA.');
  character.model.updateWorldMatrix(true, true);
  const bounds = new THREE.Box3().setFromObject(character.model, true);
  const size = bounds.getSize(new THREE.Vector3());
  const target = bounds.getCenter(new THREE.Vector3());
  target.y += size.y * 0.04;
  const distance = Math.max(3.1, Math.max(size.x, size.y, size.z) * 2.65);
  const directions: Readonly<Record<QaCameraView, THREE.Vector3>> = Object.freeze({
    front: new THREE.Vector3(0, 0.08, 1),
    rear: new THREE.Vector3(0, 0.08, -1),
    left: new THREE.Vector3(-1, 0.08, 0),
    right: new THREE.Vector3(1, 0.08, 0),
    'front-left': new THREE.Vector3(-1, 0.12, 1).normalize(),
    'front-right': new THREE.Vector3(1, 0.12, 1).normalize(),
  });
  const direction = directions[view];
  if (!direction) throw new TypeError(`Unknown QA camera view: ${String(view)}.`);
  showcaseCameraTargetOffset.copy(target).sub(character.wrapper.position);
  controls.target.copy(target);
  camera.position.copy(target).addScaledVector(direction, distance);
  camera.near = Math.max(0.01, distance / 100);
  camera.far = Math.max(100, distance * 20);
  camera.updateProjectionMatrix();
  controls.update();
  renderScene();
  return Object.freeze(camera.position.toArray());
}

window.__AXIE_MIXER_DEBUG__ = {
  version: 1,
  get lastContextReport() {
    return lastContextReport;
  },
  inspectState: inspectDemoState,
  inspectAxieLookup: () => currentAxieLookup,
  loadAxieById,
  applyAnimatedEyePreset,
  applySpecialShowcasePreset,
  inspectRigPose,
  inspectParts,
  inspectWeaponInstances,
  inspectPairedWeaponAnimation: () => character?.inspectPairedWeaponAnimation() ?? Object.freeze({
    family: undefined,
    selection: undefined,
    paired: false,
    state: undefined,
    clipName: undefined,
    duration: undefined,
    time: undefined,
    timeScale: undefined,
    looping: undefined,
    mixerCount: 0,
    instanceCount: 0,
    bones: Object.freeze([]),
  }),
  inspectAnimator,
  inspectEyes: () => eyeController?.inspect(),
  setEyeConfig: (patch) => {
    eyeController?.setConfig(patch);
    eyeConfig = eyeController?.config ?? eyeConfig;
    writeUrlState();
    syncEyePanel();
    return eyeController?.inspect();
  },
  blinkEyes: () => eyeController?.blink() ?? false,
  playAnimation: async (name, options = {}) => {
    const clip = character?.animations.clips.find((candidate) => candidate.name === name);
    if (!character || !clip) return false;
    const clipFamily = weaponFamilyManifest(clip.group);
    if (clipFamily && character.activeWeapon !== clipFamily.id) return false;
    const played = await character.playAnimationAsync(name, {
      loop: options.loop ?? clip.looping,
      lockLocomotion: options.lockLocomotion ?? !clip.looping,
      transition: options.transition,
      restart: options.restart,
    });
    writeUrlState();
    syncPanels();
    return played;
  },
  equipWeapon: (id) => selectWeapon(id),
  selectWeaponVariant: (id) => selectWeaponVariant(id),
  resumeLocomotion: (transition = 0.16) => {
    if (!character) return false;
    character.resumeLocomotion(transition);
    return true;
  },
  setTimeScale: setQaTimeScale,
  setMoveSpeed: setQaMoveSpeed,
  setStunned: setQaStunned,
  triggerAnimator: triggerQaAnimator,
  stepSimulation: stepQaSimulation,
  setCameraView: setQaCameraView,
  setEvidenceFrozen: (frozen) => {
    evidenceFrozen = Boolean(frozen);
    return evidenceFrozen;
  },
  runContextLossRestore,
};

const contextDiagnosticRequested = new URLSearchParams(location.search).get('contextTest') === '1';
let requestedContextDiagnosticScheduled = false;
function scheduleRequestedContextDiagnostic() {
  if (!contextDiagnosticRequested || requestedContextDiagnosticScheduled) return;
  requestedContextDiagnosticScheduled = true;
  window.setTimeout(() => {
    void runContextLossRestore().catch(() => {
      // The error and complete report are deliberately exposed through the UI,
      // datasets, console, and window.__AXIE_MIXER_DEBUG__.
    });
  }, 0);
}

const pressed = new Set<string>();
addEventListener('keydown', (event) => {
  if ((event.target as HTMLElement | null)?.matches('input, textarea, select, button')) return;
  if (debugClipInspector && event.code === 'KeyK' && !event.repeat) animationPanel.toggle();
  if (event.code === 'KeyE' && !event.repeat) eyePanel.toggle();
  if (event.code === 'KeyB' && !event.repeat) eyeController?.blink();
  pressed.add(event.code);
});
addEventListener('keyup', (event) => pressed.delete(event.code));
addEventListener('blur', () => pressed.clear());

const pointerNdc = new THREE.Vector2();
const projectedEyeFocus = new THREE.Vector3();
let pointerAvailable = false;
let cameraDragging = false;

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') {
    pointerAvailable = false;
    return;
  }
  const rect = canvas.getBoundingClientRect();
  pointerNdc.set(
    ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1,
    1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2,
  );
  pointerAvailable = true;
}, { passive: true });
canvas.addEventListener('pointerleave', () => { pointerAvailable = false; });
controls.addEventListener('start', () => { cameraDragging = true; });
controls.addEventListener('end', () => { cameraDragging = false; });
addEventListener('blur', () => { pointerAvailable = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) pointerAvailable = false;
});

function updatePointerEyeTarget() {
  if (
    !eyeController
    || eyeConfig.gazeMode !== 'pointer'
    || !pointerAvailable
    || cameraDragging
    || document.hidden
    || !character
  ) {
    eyeController?.setPointerGaze(0, 0, false);
    return;
  }
  (pointerEyeAnchor ?? character.anchors.cameraTarget)
    .getWorldPosition(projectedEyeFocus)
    .project(camera);
  const deltaX = pointerNdc.x - projectedEyeFocus.x;
  const deltaY = pointerNdc.y - projectedEyeFocus.y;
  // Normalize to the actual remaining screen distance on each side of the
  // projected animated eye joint. The old fixed divisors saturated near
  // center and threw away most of the available anatomical eye travel.
  const xDistanceToEdge = deltaX >= 0
    ? 1 - projectedEyeFocus.x
    : 1 + projectedEyeFocus.x;
  const yDistanceToEdge = deltaY >= 0
    ? 1 - projectedEyeFocus.y
    : 1 + projectedEyeFocus.y;
  const x = THREE.MathUtils.clamp(deltaX / Math.max(0.08, xDistanceToEdge), -1, 1);
  const y = THREE.MathUtils.clamp(deltaY / Math.max(0.08, yDistanceToEdge), -1, 1);
  eyeController.setPointerGaze(x, y, true);
}

const clock = new THREE.Clock();
let eyeDatasetElapsed = 0;
const movement = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let frameRequestId = 0;
let demoDisposed = false;
function frame() {
  if (demoDisposed) return;
  const delta = clock.getDelta();
  const simulationDelta = evidenceFrozen ? 0 : delta * unityTimeScale;
  if (!contextDiagnosticRunning && !evidenceFrozen) {
    // AnimatorSample writes both parameters on every Update, even while a
    // trigger-owned state is active. Preserve the same controller inputs.
    character?.setMoveSpeed(unityMoveSpeed, 0);
    if (unityStunned) character?.playAnimation('Stunned');
    movement.set(
      Number(pressed.has('KeyD')) - Number(pressed.has('KeyA')),
      0,
      Number(pressed.has('KeyS')) - Number(pressed.has('KeyW')),
    );
    if (character && movement.lengthSq() > 0) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      right.crossVectors(forward, camera.up).normalize();
      const worldMove = forward.multiplyScalar(-movement.z).add(right.multiplyScalar(movement.x)).normalize();
      const running = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
      character.wrapper.position.addScaledVector(worldMove, simulationDelta * (running ? 3.1 : 1.6));
      character.wrapper.rotation.y = Math.atan2(worldMove.x, worldMove.z);
    }
    updatePointerEyeTarget();
    eyeController?.update(simulationDelta);
    eyeDatasetElapsed += delta;
    character?.update(simulationDelta);
    if (character) {
      const target = character.wrapper.position.clone().add(showcaseCameraTargetOffset);
      controls.target.lerp(target, 1 - Math.exp(-delta * 8));
    }
  }
  controls.update();
  renderScene();
  if (character) {
    fields.cache.textContent = String(mixer.cacheDiagnostics().entries);
    animationPanel.setActive(character.activeAnimation, character.animationOverrideActive);
    animationPanel.setActiveWeapon(character.activeWeapon, character.weaponLoading);
    app.dataset.activeAnimation = character.activeAnimation ?? '';
    app.dataset.animationOverride = String(character.animationOverrideActive);
    app.dataset.cacheEntries = String(mixer.cacheDiagnostics().entries);
    syncWeaponRuntimeDiagnostics();
    if (eyeDatasetElapsed >= 0.1) {
      syncEyeDatasets();
      eyeDatasetElapsed = 0;
    }
  }
  frameRequestId = requestAnimationFrame(frame);
}

function resize() {
  const width = app.clientWidth;
  const height = app.clientHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  // MysticGammaCompositor derives its targets from this drawing-buffer size on
  // every encoded frame, so renderer resize remains the single size authority.
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();
syncAxieLookupIdentity();
syncShowcaseButtons();
renderWeaponPicker();
if (selectedWeaponId) writeUrlState();
app.dataset.axieLookupStatus = 'idle';
const initialAxieId = demoParameters.get(AXIE_ID_QUERY)?.trim();
if (initialAxieId) {
  axieIdInput.value = initialAxieId;
  void loadAxieById(initialAxieId);
} else {
  void rebuild(creatorState);
}
frame();

addEventListener('pagehide', () => {
  demoDisposed = true;
  cancelAnimationFrame(frameRequestId);
  axieLookupController?.abort();
  loadController?.abort();
  animationPanel.dispose();
  eyePanel.dispose();
  creator.destroy();
  eyeController?.dispose();
  mixer.dispose();
  controls.dispose();
  mysticGammaCompositor.dispose();
  renderer.dispose();
}, { once: true });
