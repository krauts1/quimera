import './creator.css';

import {
  AXIE_PART_TYPES,
  formatAxiePartAssetId,
  type AxieBodyType,
  type AxiePartAssetId,
  type AxiePartType,
} from './domain';
import {
  type AxieCreatorCatalog,
  type AxieCreatorChangeEvent,
  type AxieCreatorChangeReason,
  type AxieCreatorController,
  type AxieCreatorOptions,
  type AxieCreatorState,
  type AxieManualCreatorState,
} from './creator-state';
import { AXIE_GENES_DECODER } from './genes-decoder';
import { AXIE_QUALITY_IDS, AXIE_QUALITY_PROFILES } from './quality';
import {
  createDefaultAxieCreatorState,
  formatAxieSkinLabel,
  createManualAxieCreatorState,
  manualizeAxieCreatorState,
  normalizeAxieCreatorState,
  randomizeAxieCreatorState,
  resolveAxieCreatorParts,
} from './creator-model';
import type { AxieArtMode } from './runtime';

export const AXIE_CREATOR_CHANGE_EVENT = 'axiecreatorchange' as const;
export const AXIE_CREATOR_OPEN_EVENT = 'axiecreatoropenchange' as const;

export type AxieCreatorStatusTone = 'neutral' | 'success' | 'warning' | 'error';

export interface AxieCreatorViewOptions extends AxieCreatorOptions {
  readonly trigger?: HTMLButtonElement;
  readonly title?: string;
  readonly keyboardShortcut?: string | false;
  readonly postprocess?: {
    readonly enabled: boolean;
    readonly supported: boolean;
    readonly onChange?: (enabled: boolean) => void;
  };
}

export interface AxieCreatorViewController extends AxieCreatorController {
  readonly host: HTMLDivElement;
  readonly panel: HTMLElement;
  readonly trigger: HTMLButtonElement;
  setPostprocessEnabled(enabled: boolean): void;
  setLoading(loading: boolean, message?: string): void;
  setStatus(message: string, tone?: AxieCreatorStatusTone): void;
}

interface PartGroupElements {
  readonly details: HTMLDetailsElement;
  readonly selected: HTMLSpanElement;
  readonly count: HTMLSpanElement;
  readonly grid: HTMLDivElement;
  readonly empty: HTMLParagraphElement;
  readonly buttons: readonly HTMLButtonElement[];
}

type CreatorMode = AxieCreatorState['mode'];

const PART_LABELS: Readonly<Record<AxiePartType, string>> = Object.freeze({
  back: 'Back',
  ear: 'Ears',
  eye: 'Eyes',
  horn: 'Horn',
  mouth: 'Mouth',
  tail: 'Tail',
});

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let creatorInstance = 0;

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function textElement<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text: string) {
  const node = element(tag, className);
  node.textContent = text;
  return node;
}

function withStudioOpen(state: AxieCreatorState, studioOpen: boolean): AxieCreatorState {
  return Object.freeze({ ...state, studioOpen });
}

function availablePartOption(
  catalog: AxieCreatorCatalog,
  type: AxiePartType,
  id: AxiePartAssetId,
) {
  return catalog.parts[type].find((option) => option.id === id && option.available);
}

function colorHex(value: string) {
  return /^#?[0-9a-f]{6}$/iu.test(value) ? `#${value.replace(/^#/u, '')}` : '#ffffff';
}

function shortPartLabel(catalog: AxieCreatorCatalog, type: AxiePartType, id?: string) {
  const option = id ? availablePartOption(catalog, type, id) : undefined;
  if (!option) return 'Unavailable';
  const descriptor = option.asset.descriptor;
  const suffix = descriptor.skin === 0 ? '' : ` · ${formatAxieSkinLabel(descriptor.skin)}`;
  return `${descriptor.class} ${descriptor.variant.toString().padStart(2, '0')}${suffix}`;
}

function copyManualSelection(state: AxieManualCreatorState) {
  return { ...state.parts } as Record<AxiePartType, AxiePartAssetId>;
}

export class AxieCreator implements AxieCreatorViewController {
  readonly host: HTMLDivElement;
  readonly panel: HTMLElement;
  readonly trigger: HTMLButtonElement;
  readonly catalog: AxieCreatorCatalog;

  private currentState: AxieCreatorState;
  private readonly resetState: AxieCreatorState;
  private readonly options: AxieCreatorViewOptions;
  private readonly ownsTrigger: boolean;
  private readonly abort = new AbortController();
  private readonly scrim: HTMLButtonElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly doneButton: HTMLButtonElement;
  private readonly content: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly statusText: HTMLSpanElement;
  private readonly statusSpinner: HTMLSpanElement;
  private readonly announcer: HTMLParagraphElement;
  private currentBadge!: HTMLSpanElement;
  private readonly manualPanel: HTMLElement;
  private readonly genesPanel: HTMLElement;
  private geneForm!: HTMLFormElement;
  private geneInput!: HTMLTextAreaElement;
  private geneFeedback!: HTMLParagraphElement;
  private geneResolution!: HTMLDListElement;
  private searchInput!: HTMLInputElement;
  private classFilter!: HTMLSelectElement;
  private skinFilter!: HTMLSelectElement;
  private levelFilter!: HTMLSelectElement;
  private qualitySelect!: HTMLSelectElement;
  private postprocessToggle!: HTMLButtonElement;
  private readonly modeButtons = new Map<CreatorMode, HTMLButtonElement>();
  private readonly bodyButtons = new Map<AxieBodyType, HTMLButtonElement>();
  private readonly colorButtons = new Map<number, HTMLButtonElement>();
  private readonly artButtons = new Map<AxieArtMode, HTMLButtonElement>();
  private readonly partGroups = new Map<AxiePartType, PartGroupElements>();
  private openState = false;
  private disabledState = false;
  private loadingState = false;
  private destroyed = false;
  private viewMode: CreatorMode;
  private postprocessEnabled: boolean;
  private readonly postprocessSupported: boolean;
  private lastFocused?: HTMLElement;
  private geneTimer?: number;

  constructor(options: AxieCreatorViewOptions) {
    this.options = options;
    this.catalog = options.catalog;
    this.currentState = normalizeAxieCreatorState(options.initialState, this.catalog);
    this.resetState = normalizeAxieCreatorState(options.initialState, this.catalog);
    this.viewMode = this.currentState.mode;
    this.postprocessSupported = options.postprocess?.supported ?? false;
    this.postprocessEnabled = this.postprocessSupported && (options.postprocess?.enabled ?? false);
    const id = `axie-creator-${++creatorInstance}`;

    this.host = element('div', 'axie-creator-host');
    this.host.dataset.open = 'false';
    this.host.dataset.mode = this.viewMode;
    this.host.dataset.loading = 'false';
    this.host.dataset.disabled = 'false';

    this.ownsTrigger = !options.trigger;
    this.trigger = options.trigger ?? element('button', 'axie-creator-toggle');
    this.configureTrigger(id, options.keyboardShortcut === undefined ? 'KeyX' : options.keyboardShortcut);
    if (this.ownsTrigger) this.host.append(this.trigger);

    this.scrim = element('button', 'axie-creator-scrim');
    this.scrim.type = 'button';
    this.scrim.tabIndex = -1;
    this.scrim.setAttribute('aria-label', 'Close Axie Creator');
    this.host.append(this.scrim);

    this.panel = element('aside', 'axie-creator-panel');
    this.panel.id = id;
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.setAttribute('aria-label', options.title ?? 'Axie Creator');
    this.panel.inert = true;
    this.host.append(this.panel);

    const header = element('header', 'axie-creator-header');
    const identity = element('div', 'axie-creator-identity');
    const kicker = textElement('span', 'axie-creator-kicker', '3D MIXER · LIVE');
    const title = textElement('h2', 'axie-creator-title', options.title ?? 'Axie Creator');
    const subtitle = textElement('p', 'axie-creator-subtitle', 'Build from exported parts or decode 512-bit genes.');
    identity.append(kicker, title, subtitle);
    this.closeButton = element('button', 'axie-creator-close');
    this.closeButton.type = 'button';
    this.closeButton.setAttribute('aria-label', 'Close Axie Creator');
    this.closeButton.textContent = '×';
    header.append(identity, this.closeButton);
    this.panel.append(header);

    const modeTabs = element('div', 'axie-creator-tabs');
    modeTabs.setAttribute('role', 'tablist');
    modeTabs.setAttribute('aria-label', 'Axie creation mode');
    (['manual', 'genes'] as const).forEach((mode, index) => {
      const button = element('button');
      button.type = 'button';
      button.id = `${id}-${mode}-tab`;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-controls', `${id}-${mode}-panel`);
      button.setAttribute('aria-selected', String(this.viewMode === mode));
      button.tabIndex = this.viewMode === mode ? 0 : -1;
      button.textContent = mode === 'manual' ? 'Build manually' : 'Use genes';
      button.dataset.mode = mode;
      modeTabs.append(button);
      this.modeButtons.set(mode, button);
      if (index === 0 && this.viewMode !== 'manual') button.tabIndex = -1;
    });
    this.panel.append(modeTabs);

    this.status = element('div', 'axie-creator-status');
    this.status.setAttribute('role', 'status');
    this.status.dataset.tone = 'neutral';
    this.statusSpinner = element('span', 'axie-creator-spinner');
    this.statusSpinner.setAttribute('aria-hidden', 'true');
    this.statusText = textElement('span', 'axie-creator-status-text', 'Ready to mix.');
    this.status.append(this.statusSpinner, this.statusText);
    this.panel.append(this.status);

    this.content = element('div', 'axie-creator-content');
    this.manualPanel = element('section', 'axie-creator-mode-panel');
    this.manualPanel.id = `${id}-manual-panel`;
    this.manualPanel.setAttribute('role', 'tabpanel');
    this.manualPanel.setAttribute('aria-labelledby', `${id}-manual-tab`);
    this.manualPanel.append(
      this.createBodySection(),
      this.createColorSection(),
    );

    const partIntro = element('section', 'axie-creator-part-intro');
    const partTitle = textElement('div', 'axie-creator-section-heading', 'Parts');
    const partTruth = textElement(
      'p',
      'axie-creator-catalog-note',
      'Only exported mixer assets appear. Unsupported grid cells are intentionally absent.',
    );
    partIntro.append(partTitle, partTruth, this.createFilters());
    this.manualPanel.append(partIntro);
    AXIE_PART_TYPES.forEach((type) => this.manualPanel.append(this.createPartGroup(type)));

    this.genesPanel = this.createGenesPanel(id);
    this.content.append(this.manualPanel, this.genesPanel, this.createRenderSection());
    this.panel.append(this.content);

    const footer = element('footer', 'axie-creator-footer');
    const reset = textElement('button', 'axie-creator-reset', 'Reset');
    reset.type = 'button';
    reset.dataset.action = 'reset';
    const randomize = textElement('button', 'axie-creator-randomize', 'Randomize');
    randomize.type = 'button';
    randomize.dataset.action = 'randomize';
    this.doneButton = textElement('button', 'axie-creator-done', 'Done');
    this.doneButton.type = 'button';
    footer.append(reset, randomize, this.doneButton);
    this.panel.append(footer);

    this.announcer = element('p', 'axie-creator-sr-only');
    this.announcer.setAttribute('aria-live', 'polite');
    this.panel.append(this.announcer);

    options.mount.append(this.host);
    this.bindEvents();
    this.syncAll();
    if (this.currentState.studioOpen) this.open();
  }

  get isOpen() {
    return this.openState;
  }

  get state() {
    return this.currentState;
  }

  open() {
    this.assertAlive();
    if (this.openState || this.disabledState) return;
    this.openState = true;
    this.currentState = withStudioOpen(this.currentState, true);
    this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    this.host.dataset.open = 'true';
    this.trigger.setAttribute('aria-expanded', 'true');
    this.panel.setAttribute('aria-hidden', 'false');
    this.panel.inert = false;
    this.options.onOpenChange?.(true);
    this.host.dispatchEvent(new CustomEvent(AXIE_CREATOR_OPEN_EVENT, {
      bubbles: true,
      detail: { open: true },
    }));
    queueMicrotask(() => this.closeButton.focus({ preventScroll: true }));
  }

  close(options: { readonly restoreFocus?: boolean } = {}) {
    this.assertAlive();
    if (!this.openState) return;
    this.openState = false;
    this.currentState = withStudioOpen(this.currentState, false);
    this.host.dataset.open = 'false';
    this.trigger.setAttribute('aria-expanded', 'false');
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.inert = true;
    this.options.onOpenChange?.(false);
    this.host.dispatchEvent(new CustomEvent(AXIE_CREATOR_OPEN_EVENT, {
      bubbles: true,
      detail: { open: false },
    }));
    if (options.restoreFocus !== false) {
      (this.lastFocused?.isConnected ? this.lastFocused : this.trigger).focus({ preventScroll: true });
    }
  }

  setState(state: AxieCreatorState, options: { readonly notify?: boolean } = {}) {
    this.assertAlive();
    const next = normalizeAxieCreatorState(state, this.catalog);
    const shouldOpen = next.studioOpen;
    this.currentState = next;
    this.viewMode = next.mode;
    this.syncAll();
    if (shouldOpen && !this.openState) this.open();
    else if (!shouldOpen && this.openState) this.close({ restoreFocus: false });
    if (options.notify) this.notify('external');
  }

  setDisabled(disabled: boolean) {
    this.assertAlive();
    this.disabledState = disabled;
    this.host.dataset.disabled = String(disabled);
    this.trigger.disabled = disabled;
    this.updateInteractivity();
  }

  setPostprocessEnabled(enabled: boolean) {
    this.assertAlive();
    this.postprocessEnabled = this.postprocessSupported && enabled;
    this.syncPostprocess();
  }

  setLoading(loading: boolean, message = loading ? 'Mixing Axie assets…' : 'Axie ready.') {
    this.assertAlive();
    this.loadingState = loading;
    this.host.dataset.loading = String(loading);
    this.panel.setAttribute('aria-busy', String(loading));
    this.setStatus(message, loading ? 'neutral' : 'success');
    this.updateInteractivity();
  }

  setStatus(message: string, tone: AxieCreatorStatusTone = 'neutral') {
    this.assertAlive();
    this.status.dataset.tone = tone;
    this.statusText.textContent = message;
    this.announcer.textContent = message;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.geneTimer !== undefined) window.clearTimeout(this.geneTimer);
    this.abort.abort();
    this.host.remove();
    if (!this.ownsTrigger) {
      this.trigger.removeAttribute('aria-controls');
      this.trigger.removeAttribute('aria-expanded');
    }
  }

  private configureTrigger(panelId: string, keyboardShortcut: string | false) {
    this.trigger.type = 'button';
    this.trigger.classList.add('axie-creator-toggle');
    this.trigger.setAttribute('aria-controls', panelId);
    this.trigger.setAttribute('aria-expanded', 'false');
    this.trigger.setAttribute('aria-haspopup', 'dialog');
    this.trigger.replaceChildren();
    const icon = textElement('span', 'axie-creator-toggle-icon', 'AX');
    icon.setAttribute('aria-hidden', 'true');
    const label = textElement('span', 'axie-creator-toggle-label', 'AXIE CREATOR');
    this.currentBadge = textElement('span', 'axie-creator-current', 'NEW');
    this.trigger.append(icon, label, this.currentBadge);
    if (keyboardShortcut) this.trigger.title = `Open Axie Creator (${keyboardShortcut.replace(/^Key/u, '')})`;
  }

  private createBodySection() {
    const fieldset = element('fieldset', 'axie-creator-section');
    const legend = textElement('legend', '', 'Body');
    const grid = element('div', 'axie-creator-body-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Axie body');
    this.catalog.bodies.forEach((option) => {
      const button = element('button', 'axie-creator-body-card');
      button.type = 'button';
      button.dataset.body = option.id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.disabled = !option.available;
      const glyph = textElement('span', 'axie-creator-body-glyph', option.label.slice(0, 2).toUpperCase());
      const label = textElement('span', 'axie-creator-body-label', option.label);
      button.append(glyph, label);
      grid.append(button);
      this.bodyButtons.set(option.id, button);
    });
    fieldset.append(legend, grid);
    return fieldset;
  }

  private createColorSection() {
    const details = element('details', 'axie-creator-section axie-creator-color-section');
    details.open = true;
    const summary = element('summary');
    summary.append(
      textElement('span', 'axie-creator-section-heading', `Color · ${this.catalog.colors.length}`),
      textElement('span', 'axie-creator-summary-hint', 'All source palettes'),
    );
    const grid = element('div', 'axie-creator-color-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Axie color palette');
    this.catalog.colors.forEach((option) => {
      const button = element('button', 'axie-creator-color-card');
      button.type = 'button';
      button.dataset.color = String(option.index);
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.disabled = !option.available;
      button.title = `${option.key} · source index ${option.index}`;
      button.style.setProperty('--axie-color-a', colorHex(option.primary1));
      button.style.setProperty('--axie-color-b', colorHex(option.primary2));
      const swatch = element('span', 'axie-creator-color-swatch');
      swatch.setAttribute('aria-hidden', 'true');
      const copy = element('span', 'axie-creator-color-copy');
      copy.append(
        textElement('span', 'axie-creator-color-name', option.key),
        textElement('span', 'axie-creator-color-index', `#${option.index}`),
      );
      button.append(swatch, copy);
      grid.append(button);
      this.colorButtons.set(option.index, button);
    });
    details.append(summary, grid);
    return details;
  }

  private createFilters() {
    const filters = element('div', 'axie-creator-filters');
    const searchLabel = element('label', 'axie-creator-search');
    searchLabel.append(textElement('span', 'axie-creator-sr-only', 'Search parts'));
    this.searchInput = element('input');
    this.searchInput.type = 'search';
    this.searchInput.placeholder = 'Search class, variant or asset id';
    this.searchInput.autocomplete = 'off';
    searchLabel.append(this.searchInput);

    const classes = [...new Set(AXIE_PART_TYPES.flatMap(
      (type) => this.catalog.parts[type].map((option) => option.asset.descriptor.class),
    ))].sort();
    const skins = [...new Set(AXIE_PART_TYPES.flatMap(
      (type) => this.catalog.parts[type].map((option) => option.asset.descriptor.skin),
    ))].sort((a, b) => a - b);
    const levels = [...new Set(AXIE_PART_TYPES.flatMap(
      (type) => this.catalog.parts[type].map((option) => option.asset.descriptor.level),
    ))].sort((a, b) => a - b);

    this.classFilter = this.createFilterSelect('Class', classes.map((value) => [value, value]));
    this.skinFilter = this.createFilterSelect('Skin', skins.map((value) => [String(value), formatAxieSkinLabel(value)]));
    this.levelFilter = this.createFilterSelect('Level', levels.map((value) => [String(value), `Level ${value}`]));
    const reset = textElement('button', 'axie-creator-filter-reset', 'Clear');
    reset.type = 'button';
    reset.dataset.action = 'clear-filters';
    filters.append(searchLabel, this.classFilter, this.skinFilter, this.levelFilter, reset);
    return filters;
  }

  private createFilterSelect(label: string, options: readonly (readonly [string, string])[]) {
    const select = element('select');
    select.setAttribute('aria-label', `${label} filter`);
    const all = document.createElement('option');
    all.value = '';
    all.textContent = label === 'Class' ? 'All classes' : `All ${label.toLowerCase()}s`;
    select.append(all);
    options.forEach(([value, copy]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = copy;
      select.append(option);
    });
    return select;
  }

  private createPartGroup(type: AxiePartType) {
    const details = element('details', 'axie-creator-part-group');
    details.dataset.partType = type;
    const summary = element('summary');
    const identity = element('span', 'axie-creator-part-identity');
    identity.append(
      textElement('span', 'axie-creator-part-icon', PART_LABELS[type].slice(0, 1)),
      textElement('span', 'axie-creator-part-name', PART_LABELS[type]),
    );
    const selected = textElement('span', 'axie-creator-part-selected', 'Not selected');
    const count = textElement('span', 'axie-creator-part-count', String(this.catalog.parts[type].length));
    summary.append(identity, selected, count);
    const grid = element('div', 'axie-creator-part-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', `${PART_LABELS[type]} options`);
    const buttons = this.catalog.parts[type].map((option) => {
      const descriptor = option.asset.descriptor;
      const button = element('button', 'axie-creator-part-card');
      button.type = 'button';
      button.dataset.partType = type;
      button.dataset.partId = option.id;
      button.dataset.partClass = descriptor.class;
      button.dataset.skin = String(descriptor.skin);
      button.dataset.level = String(descriptor.level);
      button.dataset.search = `${option.id} ${option.label} ${descriptor.class} ${descriptor.variant}`.toLowerCase();
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.disabled = !option.available;
      const badge = textElement('span', 'axie-creator-part-badge', descriptor.class.slice(0, 2).toUpperCase());
      badge.dataset.skin = String(descriptor.skin);
      const copy = element('span', 'axie-creator-part-copy');
      copy.append(
        textElement('span', 'axie-creator-part-option-name', `${descriptor.class} ${descriptor.variant.toString().padStart(2, '0')}`),
        textElement('span', 'axie-creator-part-meta', `${formatAxieSkinLabel(descriptor.skin)} · L${descriptor.level}`),
      );
      button.append(badge, copy);
      grid.append(button);
      return button;
    });
    const empty = textElement('p', 'axie-creator-part-empty', 'No exported parts match these filters.');
    empty.hidden = true;
    details.append(summary, grid, empty);
    this.partGroups.set(type, { details, selected, count, grid, empty, buttons });
    return details;
  }

  private createGenesPanel(id: string) {
    const panel = element('section', 'axie-creator-mode-panel axie-creator-genes');
    panel.id = `${id}-genes-panel`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `${id}-genes-tab`);
    const intro = textElement(
      'p',
      'axie-creator-genes-intro',
      'Paste Axie genes. Unity-compatible decoding preserves hybrid or unknown classes and omits only parts the source mixer cannot load.',
    );
    this.geneForm = element('form', 'axie-creator-gene-form');
    const label = textElement('label', '', 'Axie genes');
    this.geneInput = element('textarea');
    this.geneInput.rows = 5;
    this.geneInput.spellcheck = false;
    this.geneInput.autocomplete = 'off';
    this.geneInput.placeholder = '0x…';
    this.geneInput.setAttribute('aria-describedby', `${id}-gene-feedback`);
    label.append(this.geneInput);
    const apply = textElement('button', 'axie-creator-apply-genes', 'Decode & apply');
    apply.type = 'submit';
    this.geneFeedback = textElement('p', 'axie-creator-gene-feedback', 'Changes apply automatically when the value is valid.');
    this.geneFeedback.id = `${id}-gene-feedback`;
    this.geneFeedback.setAttribute('aria-live', 'polite');
    this.geneForm.append(label, apply, this.geneFeedback);
    const heading = textElement('h3', 'axie-creator-resolution-title', 'Resolved mixer assets');
    this.geneResolution = element('dl', 'axie-creator-resolution');
    panel.append(intro, this.geneForm, heading, this.geneResolution);
    return panel;
  }

  private createRenderSection() {
    const section = element('section', 'axie-creator-render');
    section.append(textElement('h3', 'axie-creator-section-heading', 'Rendering'));
    const qualityLabel = element('label', 'axie-creator-quality');
    qualityLabel.append(textElement('span', '', 'Quality'));
    this.qualitySelect = element('select');
    AXIE_QUALITY_IDS.forEach((quality) => {
      const profile = AXIE_QUALITY_PROFILES[quality];
      const option = document.createElement('option');
      option.value = quality;
      option.textContent = `${profile.label} · LOD ${profile.requestedLod}`;
      this.qualitySelect.append(option);
    });
    qualityLabel.append(this.qualitySelect);
    const art = element('fieldset', 'axie-creator-art');
    art.append(textElement('legend', '', 'Art direction'));
    const choices = element('div', 'axie-creator-art-choices');
    choices.setAttribute('role', 'radiogroup');
    choices.setAttribute('aria-label', 'Axie art direction');
    (['faithful', 'enhanced'] as const).forEach((mode) => {
      const button = element('button');
      button.type = 'button';
      button.dataset.artMode = mode;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', 'false');
      button.append(
        textElement('strong', '', mode === 'faithful' ? 'Faithful' : 'Enhanced'),
        textElement('small', '', mode === 'faithful' ? 'Unity-matched shader' : 'Refined light & FX'),
      );
      choices.append(button);
      this.artButtons.set(mode, button);
    });
    art.append(choices);
    const postprocess = element('div', 'axie-creator-postprocess');
    const postprocessCopy = element('span', 'axie-creator-postprocess-copy');
    postprocessCopy.append(
      textElement('strong', '', 'Unity post outline'),
      textElement(
        'small',
        '',
        this.postprocessSupported
          ? 'Optional renderer-feature edge pass'
          : 'Unavailable on this graphics device',
      ),
    );
    this.postprocessToggle = element('button', 'axie-creator-postprocess-toggle');
    this.postprocessToggle.type = 'button';
    this.postprocessToggle.setAttribute('role', 'switch');
    this.postprocessToggle.setAttribute('aria-label', 'Unity post-process outline');
    this.postprocessToggle.append(
      textElement('span', 'axie-creator-postprocess-track', ''),
      textElement('span', 'axie-creator-postprocess-state', ''),
    );
    postprocess.append(postprocessCopy, this.postprocessToggle);
    section.append(qualityLabel, art, postprocess);
    return section;
  }

  private bindEvents() {
    const signal = this.abort.signal;
    this.trigger.addEventListener('click', () => this.openState ? this.close() : this.open(), { signal });
    this.scrim.addEventListener('click', () => this.close(), { signal });
    this.closeButton.addEventListener('click', () => this.close(), { signal });
    this.doneButton.addEventListener('click', () => this.close(), { signal });

    this.modeButtons.forEach((button, mode) => {
      button.addEventListener('click', () => this.selectMode(mode), { signal });
      button.addEventListener('keydown', (event) => this.handleTabArrows(event, mode), { signal });
    });
    this.bodyButtons.forEach((button, body) => {
      button.addEventListener('click', () => this.selectBody(body), { signal });
      button.addEventListener('keydown', (event) => this.handleRadioArrows(event, [...this.bodyButtons.values()]), { signal });
    });
    this.colorButtons.forEach((button, color) => {
      button.addEventListener('click', () => this.selectColor(color), { signal });
      button.addEventListener('keydown', (event) => this.handleRadioArrows(event, [...this.colorButtons.values()]), { signal });
    });
    this.partGroups.forEach((group, type) => {
      group.buttons.forEach((button) => {
        button.addEventListener('click', () => this.selectPart(type, button.dataset.partId ?? ''), { signal });
        button.addEventListener('keydown', (event) => this.handleRadioArrows(event, group.buttons), { signal });
      });
      group.details.addEventListener('toggle', () => {
        if (!group.details.open) return;
        this.partGroups.forEach((other, otherType) => {
          if (otherType !== type) other.details.open = false;
        });
      }, { signal });
    });

    const filter = () => this.applyPartFilters();
    this.searchInput.addEventListener('input', filter, { signal });
    this.classFilter.addEventListener('change', filter, { signal });
    this.skinFilter.addEventListener('change', filter, { signal });
    this.levelFilter.addEventListener('change', filter, { signal });
    this.host.querySelector<HTMLButtonElement>('[data-action="clear-filters"]')?.addEventListener('click', () => {
      this.searchInput.value = '';
      this.classFilter.value = '';
      this.skinFilter.value = '';
      this.levelFilter.value = '';
      this.applyPartFilters();
      this.searchInput.focus();
    }, { signal });

    this.geneForm.addEventListener('submit', (event) => {
      event.preventDefault();
      this.applyGenes();
    }, { signal });
    this.geneInput.addEventListener('input', () => {
      if (this.geneTimer !== undefined) window.clearTimeout(this.geneTimer);
      this.geneTimer = window.setTimeout(() => this.applyGenes(true), 420);
    }, { signal });

    this.qualitySelect.addEventListener('change', () => {
      if (this.disabledState || this.loadingState) return;
      const quality = this.qualitySelect.value;
      if (!(AXIE_QUALITY_IDS as readonly string[]).includes(quality)) return;
      this.commit({ ...this.currentState, quality } as AxieCreatorState, 'quality', undefined, this.viewMode);
    }, { signal });
    this.artButtons.forEach((button, artMode) => {
      button.addEventListener('click', () => {
        if (this.disabledState || this.loadingState) return;
        this.commit({ ...this.currentState, artMode } as AxieCreatorState, 'art-mode', undefined, this.viewMode);
      }, { signal });
      button.addEventListener('keydown', (event) => this.handleRadioArrows(event, [...this.artButtons.values()]), { signal });
    });
    this.postprocessToggle.addEventListener('click', () => {
      if (this.disabledState || this.loadingState || !this.postprocessSupported) return;
      this.postprocessEnabled = !this.postprocessEnabled;
      this.syncPostprocess();
      this.options.postprocess?.onChange?.(this.postprocessEnabled);
    }, { signal });

    this.host.querySelector<HTMLButtonElement>('[data-action="reset"]')?.addEventListener('click', () => {
      if (this.disabledState || this.loadingState) return;
      const reset = withStudioOpen(this.resetState, this.openState);
      this.viewMode = reset.mode;
      this.commit(reset, 'reset');
      this.setStatus('Creator reset to its initial Axie.', 'success');
    }, { signal });
    this.host.querySelector<HTMLButtonElement>('[data-action="randomize"]')?.addEventListener('click', () => {
      if (this.disabledState || this.loadingState) return;
      this.viewMode = 'manual';
      this.commit(randomizeAxieCreatorState(this.catalog, {
        quality: this.currentState.quality,
        artMode: this.currentState.artMode,
        studioOpen: this.openState,
      }), 'external');
      this.setStatus('Random manifest-backed Axie created.', 'success');
    }, { signal });

    document.addEventListener('keydown', (event) => this.handleDocumentKeydown(event), { signal });
    const shortcut = this.options.keyboardShortcut === undefined ? 'KeyX' : this.options.keyboardShortcut;
    if (shortcut) {
      document.addEventListener('keydown', (event) => {
        if (event.code !== shortcut || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
        event.preventDefault();
        this.openState ? this.close() : this.open();
      }, { signal });
    }
  }

  private selectMode(mode: CreatorMode) {
    if (this.disabledState || this.loadingState || mode === this.viewMode) return;
    this.viewMode = mode;
    if (mode === 'manual' && this.currentState.mode === 'genes') {
      this.commit(manualizeAxieCreatorState(this.currentState, this.catalog), 'external');
    } else {
      this.syncMode();
      if (mode === 'genes') queueMicrotask(() => this.geneInput.focus());
    }
  }

  private selectBody(body: AxieBodyType) {
    if (this.disabledState || this.loadingState) return;
    const manual = manualizeAxieCreatorState(this.currentState, this.catalog);
    this.commit(createManualAxieCreatorState(this.catalog, {
      body,
      colorVariant: manual.descriptor.colorVariant,
      parts: manual.parts,
    }, manual), 'body');
  }

  private selectColor(colorVariant: number) {
    if (this.disabledState || this.loadingState) return;
    const manual = manualizeAxieCreatorState(this.currentState, this.catalog);
    this.commit(createManualAxieCreatorState(this.catalog, {
      body: manual.descriptor.body,
      colorVariant,
      parts: manual.parts,
    }, manual), 'color');
  }

  private selectPart(type: AxiePartType, id: string) {
    if (this.disabledState || this.loadingState) return;
    if (!availablePartOption(this.catalog, type, id)) return;
    const manual = manualizeAxieCreatorState(this.currentState, this.catalog);
    const parts = copyManualSelection(manual);
    parts[type] = id;
    this.commit(createManualAxieCreatorState(this.catalog, {
      body: manual.descriptor.body,
      colorVariant: manual.descriptor.colorVariant,
      parts,
    }, manual), 'part', type);
  }

  private applyGenes(quiet = false) {
    if (this.disabledState || this.loadingState) return;
    const value = this.geneInput.value;
    if (!value) {
      this.geneInput.removeAttribute('aria-invalid');
      this.geneFeedback.dataset.tone = 'neutral';
      this.geneFeedback.textContent = 'Paste genes to decode an Axie.';
      return;
    }
    try {
      const decoded = AXIE_GENES_DECODER.decode(value);
      const resolvedParts = resolveAxieCreatorParts(this.catalog, decoded.descriptor);
      const next = normalizeAxieCreatorState(Object.freeze({
        mode: 'genes',
        genes: decoded.genes,
        descriptor: decoded.descriptor,
        unsupportedClasses: decoded.unsupportedClasses,
        resolvedParts,
        quality: this.currentState.quality,
        artMode: this.currentState.artMode,
        studioOpen: this.openState,
      }), this.catalog);
      const currentGenes = this.currentState.mode === 'genes' ? this.currentState.genes : undefined;
      const nextGenes = next.mode === 'genes' ? next.genes : undefined;
      const alreadyApplied = currentGenes !== undefined && currentGenes === nextGenes;
      this.geneInput.removeAttribute('aria-invalid');
      if (!alreadyApplied) this.commit(next, 'genes');
      else {
        this.syncGeneFeedback();
        this.syncGeneResolution();
      }
    } catch (error) {
      this.geneInput.setAttribute('aria-invalid', 'true');
      this.geneFeedback.dataset.tone = 'error';
      this.geneFeedback.textContent = error instanceof Error ? error.message : 'Genes could not be decoded.';
      if (!quiet) this.announcer.textContent = this.geneFeedback.textContent;
    }
  }

  private commit(
    state: AxieCreatorState,
    reason: AxieCreatorChangeReason,
    changedPart?: AxiePartType,
    viewMode: CreatorMode = state.mode,
  ) {
    this.currentState = normalizeAxieCreatorState(withStudioOpen(state, this.openState), this.catalog);
    this.viewMode = viewMode;
    this.syncAll();
    this.notify(reason, changedPart);
  }

  private notify(reason: AxieCreatorChangeReason, changedPart?: AxiePartType) {
    const event: AxieCreatorChangeEvent = Object.freeze({
      state: this.currentState,
      reason,
      ...(changedPart ? { changedPart } : {}),
    });
    this.options.onChange?.(event);
    this.host.dispatchEvent(new CustomEvent<AxieCreatorChangeEvent>(AXIE_CREATOR_CHANGE_EVENT, {
      bubbles: true,
      detail: event,
    }));
  }

  private syncAll() {
    this.syncMode();
    this.syncSelections();
    this.syncGeneFeedback();
    this.syncGeneResolution();
    this.applyPartFilters();
    this.qualitySelect.value = this.currentState.quality;
    this.artButtons.forEach((button, mode) => {
      const selected = this.currentState.artMode === mode;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.syncPostprocess();
    const body = this.currentState.descriptor.body;
    this.currentBadge.textContent = body.slice(0, 3).toUpperCase();
    this.trigger.setAttribute('aria-label', `Open Axie Creator. Current body: ${body}.`);
  }

  private syncMode() {
    this.host.dataset.mode = this.viewMode;
    this.modeButtons.forEach((button, mode) => {
      const selected = mode === this.viewMode;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.manualPanel.hidden = this.viewMode !== 'manual';
    this.genesPanel.hidden = this.viewMode !== 'genes';
    if (this.currentState.mode === 'genes' && this.geneInput.value !== this.currentState.genes) {
      this.geneInput.value = this.currentState.genes;
    }
  }

  private syncSelections() {
    const state = this.currentState;
    const selectedParts: Readonly<Partial<Record<AxiePartType, AxiePartAssetId>>> = state.mode === 'manual'
      ? state.parts
      : state.resolvedParts;
    const body = state.descriptor.body;
    const color = state.descriptor.colorVariant;
    this.bodyButtons.forEach((button, id) => {
      const selected = body === id;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.colorButtons.forEach((button, index) => {
      const selected = color === index;
      button.setAttribute('aria-checked', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    this.partGroups.forEach((group, type) => {
      const selectedId = selectedParts[type];
      group.selected.textContent = shortPartLabel(this.catalog, type, selectedId);
      group.buttons.forEach((button) => {
        const selected = button.dataset.partId === selectedId;
        button.setAttribute('aria-checked', String(selected));
        button.tabIndex = selected ? 0 : -1;
      });
    });
  }

  private syncGeneResolution() {
    const state = this.currentState;
    const descriptor = state.descriptor;
    const resolved: Readonly<Partial<Record<AxiePartType, AxiePartAssetId>>> = state.mode === 'genes'
      ? state.resolvedParts
      : state.parts;
    this.geneResolution.replaceChildren();
    const rows: readonly (readonly [string, string, boolean])[] = [
      ['Body', descriptor.body, this.catalog.bodies.some((option) => option.id === descriptor.body && option.available)],
      ['Color', this.catalog.colors.find((option) => option.index === descriptor.colorVariant)?.key ?? `Index ${descriptor.colorVariant}`, this.catalog.colors.some((option) => option.index === descriptor.colorVariant && option.available)],
      ...AXIE_PART_TYPES.map((type) => {
        const part = descriptor.parts.find((candidate) => candidate.type === type);
        const resolvedId = resolved[type];
        const missingLabel = part
          ? `${part.class ?? 'Unknown class'} ${part.variant.toString().padStart(2, '0')} · omitted (${formatAxiePartAssetId(part)})`
          : 'Descriptor slot missing · omitted';
        return [
          PART_LABELS[type],
          resolvedId ? shortPartLabel(this.catalog, type, resolvedId) : missingLabel,
          Boolean(resolvedId),
        ] as const;
      }),
    ];
    rows.forEach(([label, value, available]) => {
      const term = textElement('dt', '', label);
      const description = textElement('dd', '', value);
      description.dataset.available = String(available);
      if (!available) description.title = 'Not available in the exported Three.js mixer manifest.';
      this.geneResolution.append(term, description);
    });
  }

  private syncGeneFeedback() {
    const state = this.currentState;
    if (state.mode !== 'genes') {
      this.geneInput.removeAttribute('aria-invalid');
      this.geneFeedback.dataset.tone = 'neutral';
      this.geneFeedback.textContent = 'Paste genes to decode an Axie.';
      return;
    }
    const resolvedCount = Object.keys(state.resolvedParts).length;
    const unsupportedCount = state.unsupportedClasses.length;
    this.geneInput.removeAttribute('aria-invalid');
    this.geneFeedback.dataset.tone = resolvedCount === AXIE_PART_TYPES.length && unsupportedCount === 0
      ? 'success'
      : 'warning';
    const resolution = resolvedCount === AXIE_PART_TYPES.length
      ? 'all six parts resolved'
      : `${resolvedCount} of six exported parts resolved`;
    const unsupported = unsupportedCount > 0
      ? ` · ${unsupportedCount} unknown class ${unsupportedCount === 1 ? 'code' : 'codes'} preserved for Unity-compatible omission`
      : '';
    this.geneFeedback.textContent = `Unity-compatible genes · ${resolution}${unsupported}.`;
  }

  private applyPartFilters() {
    const query = this.searchInput.value.trim().toLowerCase();
    const classValue = this.classFilter.value;
    const skinValue = this.skinFilter.value;
    const levelValue = this.levelFilter.value;
    this.partGroups.forEach((group) => {
      let visible = 0;
      group.buttons.forEach((button) => {
        const matches = (!query || button.dataset.search?.includes(query))
          && (!classValue || button.dataset.partClass === classValue)
          && (!skinValue || button.dataset.skin === skinValue)
          && (!levelValue || button.dataset.level === levelValue);
        button.hidden = !matches;
        if (matches) visible += 1;
      });
      group.count.textContent = `${visible}/${group.buttons.length}`;
      group.empty.hidden = visible > 0;
    });
  }

  private updateInteractivity() {
    const busy = this.disabledState || this.loadingState;
    this.content.inert = busy;
    this.content.setAttribute('aria-disabled', String(busy));
    this.modeButtons.forEach((button) => {
      button.disabled = busy;
    });
    this.host.querySelectorAll<HTMLButtonElement>('.axie-creator-footer button:not(.axie-creator-done)').forEach((button) => {
      button.disabled = busy;
    });
    this.postprocessToggle.disabled = busy || !this.postprocessSupported;
  }

  private syncPostprocess() {
    const enabled = this.postprocessSupported && this.postprocessEnabled;
    this.postprocessToggle.setAttribute('aria-checked', String(enabled));
    this.postprocessToggle.dataset.supported = String(this.postprocessSupported);
    const state = this.postprocessToggle.querySelector<HTMLElement>('.axie-creator-postprocess-state');
    if (state) state.textContent = this.postprocessSupported ? (enabled ? 'On' : 'Off') : 'N/A';
    this.postprocessToggle.disabled = this.disabledState || this.loadingState || !this.postprocessSupported;
  }

  private handleDocumentKeydown(event: KeyboardEvent) {
    if (!this.openState) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [...this.panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
      (candidate) => !candidate.hidden && candidate.getClientRects().length > 0 && !candidate.closest('[hidden]'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  private handleTabArrows(event: KeyboardEvent, current: CreatorMode) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const next = current === 'manual' ? 'genes' : 'manual';
    this.selectMode(next);
    this.modeButtons.get(next)?.focus();
  }

  private handleRadioArrows(event: KeyboardEvent, candidates: readonly HTMLButtonElement[]) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const visible = candidates.filter((button) => !button.disabled && !button.hidden && button.getClientRects().length > 0);
    if (visible.length === 0) return;
    event.preventDefault();
    const currentIndex = Math.max(0, visible.indexOf(event.currentTarget as HTMLButtonElement));
    const direction = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? visible.length - 1
        : (currentIndex + direction + visible.length) % visible.length;
    visible[nextIndex].focus();
    visible[nextIndex].click();
  }

  private assertAlive() {
    if (this.destroyed) throw new Error('Axie Creator has been destroyed.');
  }
}

export function createAxieCreator(options: AxieCreatorViewOptions): AxieCreatorViewController {
  return new AxieCreator(options);
}

export { createAxieCreatorCatalog, createAxieCreatorStateCodec, createDefaultAxieCreatorState } from './creator-model';
