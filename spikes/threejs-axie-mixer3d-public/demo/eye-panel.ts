import './eye-panel.css';
import {
  AXIE_EYE_EXPRESSIONS,
  AXIE_EYE_GAZE_MODES,
  type AxieEyeExpression,
  type AxieEyeGazeMode,
  type AxieEyePerformanceConfig,
  type AxieEyePerformanceConfigPatch,
  type AxieEyeRuntimeInspection,
} from '../src/clear-eye';

export interface AxieEyePanelOptions {
  readonly mount: HTMLElement;
  readonly initialConfig: AxieEyePerformanceConfig;
  readonly onChange: (patch: AxieEyePerformanceConfigPatch) => void;
  readonly onBlink: () => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface AxieEyePanelController {
  readonly isOpen: boolean;
  setState(config: AxieEyePerformanceConfig, inspection?: AxieEyeRuntimeInspection): void;
  open(): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function labelledRange(labelText: string, min: number, max: number, step: number) {
  const label = element('label', 'axie-eye-range');
  const name = element('span');
  name.textContent = labelText;
  const value = element('output');
  const input = element('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.setAttribute('aria-label', labelText);
  label.append(name, value, input);
  return { label, input, value };
}

export function createAxieEyePanel(options: AxieEyePanelOptions): AxieEyePanelController {
  const host = element('div', 'axie-eye-host');
  host.dataset.open = 'false';
  host.dataset.available = 'false';

  const toggle = element('button', 'axie-eye-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'axie-eye-panel');
  toggle.setAttribute('aria-keyshortcuts', 'E');
  const toggleIcon = element('span');
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.textContent = '◉';
  const toggleLabel = element('b');
  toggleLabel.textContent = 'EYES';
  const toggleProfile = element('i');
  toggleProfile.textContent = 'VECTOR';
  toggle.append(toggleIcon, toggleLabel, toggleProfile);

  const panel = element('section', 'axie-eye-panel');
  panel.id = 'axie-eye-panel';
  panel.setAttribute('aria-label', 'Axie eye performance');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;

  const header = element('header', 'axie-eye-header');
  const identity = element('div');
  const kicker = element('span', 'axie-eye-kicker');
  kicker.textContent = 'VECTOR EYE PERFORMANCE';
  const title = element('h2');
  title.textContent = 'Vector Eyes';
  const summary = element('p');
  summary.textContent = 'Gaze, blink and expressions stay on the curved eye mesh.';
  identity.append(kicker, title, summary);
  const close = element('button', 'axie-eye-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close eye controls');
  close.textContent = '×';
  header.append(identity, close);

  const availability = element('p', 'axie-eye-availability');
  availability.textContent = 'Select Clear · Aquatic 04 · L1 or Kotaro · Bug 10 · L1.';

  const expressionSection = element('section', 'axie-eye-section');
  const expressionTitle = element('h3');
  expressionTitle.textContent = 'Expression';
  const expressionGrid = element('div', 'axie-eye-expression-grid');
  const expressionButtons = new Map<AxieEyeExpression, HTMLButtonElement>();
  AXIE_EYE_EXPRESSIONS.forEach((expression) => {
    const button = element('button');
    button.type = 'button';
    button.dataset.expression = expression;
    button.textContent = expression === 'surprised'
      ? 'Surprise'
      : `${expression[0].toUpperCase()}${expression.slice(1)}`;
    button.addEventListener('click', () => options.onChange({ expression }));
    expressionButtons.set(expression, button);
    expressionGrid.append(button);
  });
  const intensity = labelledRange('Intensity', 0, 1, 0.01);
  intensity.input.addEventListener('input', () => {
    options.onChange({ expressionIntensity: Number(intensity.input.value) });
  });
  expressionSection.append(expressionTitle, expressionGrid, intensity.label);

  const gazeSection = element('section', 'axie-eye-section');
  const gazeTitle = element('h3');
  gazeTitle.textContent = 'Gaze';
  const gazeModes = element('div', 'axie-eye-gaze-modes');
  const gazeButtons = new Map<AxieEyeGazeMode, HTMLButtonElement>();
  AXIE_EYE_GAZE_MODES.forEach((mode) => {
    const button = element('button');
    button.type = 'button';
    button.dataset.gaze = mode;
    button.textContent = mode === 'ambient' ? 'Alive' : mode === 'pointer' ? 'Follow pointer' : 'Fixed';
    button.addEventListener('click', () => options.onChange({ gazeMode: mode }));
    gazeButtons.set(mode, button);
    gazeModes.append(button);
  });
  const gazeX = labelledRange('Horizontal', -1, 1, 0.01);
  const gazeY = labelledRange('Vertical', -1, 1, 0.01);
  const updateFixedGaze = () => options.onChange({
    fixedGaze: { x: Number(gazeX.input.value), y: Number(gazeY.input.value) },
  });
  gazeX.input.addEventListener('input', updateFixedGaze);
  gazeY.input.addEventListener('input', updateFixedGaze);
  const center = element('button', 'axie-eye-center');
  center.type = 'button';
  center.textContent = 'Center fixed gaze';
  center.addEventListener('click', () => options.onChange({
    gazeMode: 'fixed',
    fixedGaze: { x: 0, y: 0 },
  }));
  gazeSection.append(gazeTitle, gazeModes, gazeX.label, gazeY.label, center);

  const actions = element('section', 'axie-eye-actions');
  const autoLabel = element('label', 'axie-eye-switch');
  const autoBlink = element('input');
  autoBlink.type = 'checkbox';
  autoBlink.addEventListener('change', () => options.onChange({ autoBlink: autoBlink.checked }));
  const autoText = element('span');
  autoText.textContent = 'Automatic blinking';
  autoLabel.append(autoBlink, autoText);
  const blink = element('button');
  blink.type = 'button';
  blink.textContent = 'Blink now';
  blink.addEventListener('click', options.onBlink);
  const reset = element('button');
  reset.type = 'button';
  reset.textContent = 'Reset eyes';
  reset.addEventListener('click', () => options.onChange({
    expression: 'neutral',
    expressionIntensity: 1,
    gazeMode: 'ambient',
    fixedGaze: { x: 0, y: 0 },
    autoBlink: true,
  }));
  actions.append(autoLabel, blink, reset);

  const diagnostic = element('dl', 'axie-eye-diagnostic');
  for (const label of ['Profile', 'Mesh', 'SVG']) {
    const row = element('div');
    const term = element('dt');
    term.textContent = label;
    const description = element('dd');
    description.textContent = '—';
    row.append(term, description);
    diagnostic.append(row);
  }

  panel.append(header, availability, expressionSection, gazeSection, actions, diagnostic);
  host.append(toggle, panel);
  options.mount.append(host);

  let open = false;
  let config = options.initialConfig;
  let inspection: AxieEyeRuntimeInspection | undefined;

  const setOpen = (next: boolean) => {
    const normalized = Boolean(inspection?.supported) && next;
    if (open === normalized) return;
    const focusWasInside = panel.contains(document.activeElement);
    const openedFromToggle = document.activeElement === toggle;
    open = normalized;
    host.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    if (open && openedFromToggle) queueMicrotask(() => close.focus());
    if (!open && focusWasInside) queueMicrotask(() => toggle.focus());
    options.onOpenChange?.(open);
  };

  const render = () => {
    const available = inspection?.supported === true;
    const profileName = inspection?.profile === 'clear-l1'
      ? 'Clear'
      : inspection?.profile === 'kotaro-l1'
        ? 'Kotaro'
        : 'Vector';
    toggleProfile.textContent = profileName.toUpperCase();
    title.textContent = available ? `${profileName} Eyes` : 'Vector Eyes';
    host.dataset.available = String(available);
    toggle.disabled = !available;
    availability.hidden = available;
    expressionButtons.forEach((button, expression) => {
      button.setAttribute('aria-pressed', String(config.expression === expression));
      button.disabled = !available;
    });
    gazeButtons.forEach((button, mode) => {
      button.setAttribute('aria-pressed', String(config.gazeMode === mode));
      button.disabled = !available;
    });
    intensity.input.value = String(config.expressionIntensity);
    intensity.value.textContent = `${Math.round(config.expressionIntensity * 100)}%`;
    gazeX.input.value = String(config.fixedGaze.x);
    gazeY.input.value = String(config.fixedGaze.y);
    gazeX.value.textContent = config.fixedGaze.x.toFixed(2);
    gazeY.value.textContent = config.fixedGaze.y.toFixed(2);
    const fixedDisabled = !available || config.gazeMode !== 'fixed';
    gazeX.input.disabled = fixedDisabled;
    gazeY.input.disabled = fixedDisabled;
    center.disabled = !available;
    autoBlink.checked = config.autoBlink;
    autoBlink.disabled = !available;
    blink.disabled = !available;
    reset.disabled = !available;
    const values = diagnostic.querySelectorAll('dd');
    values[0].textContent = inspection?.profile ?? 'Unavailable';
    values[1].textContent = available
      ? `${inspection?.boundMeshes ?? 0}/${inspection?.boundMaterials ?? 0}`
      : '0/0';
    values[2].textContent = inspection?.sourceSvgSha256?.slice(0, 8) ?? '—';
    if (!available) setOpen(false);
  };

  toggle.addEventListener('click', () => setOpen(!open));
  close.addEventListener('click', () => setOpen(false));
  render();

  return {
    get isOpen() { return open; },
    setState(nextConfig, nextInspection) {
      config = nextConfig;
      inspection = nextInspection;
      render();
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    dispose() {
      host.remove();
    },
  };
}
