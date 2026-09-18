import type { AxieAnimationDescriptor, AxieWeaponCapability } from './runtime';
import './animation-panel.css';

export interface AxieAnimationPanelOptions {
  readonly mount: HTMLElement;
  readonly onPlay: (clip: AxieAnimationDescriptor) => void | Promise<void>;
  readonly onResumeLocomotion: () => void;
  readonly onEquipWeapon: (id?: string) => void;
  readonly onGameplayFocus?: () => void;
  readonly onOpenChange?: (open: boolean) => void;
}

export interface AxieAnimationPanelController {
  readonly host: HTMLElement;
  readonly isOpen: boolean;
  setAvailable(available: boolean): void;
  setAnimations(clips: readonly AxieAnimationDescriptor[]): void;
  setWeapons(weapons: readonly AxieWeaponCapability[]): void;
  setActive(name: string | undefined, overridden: boolean): void;
  setActiveWeapon(id: string | undefined, loading: string | undefined): void;
  open(): void;
  close(): void;
  toggle(): void;
  dispose(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function displayName(clip: AxieAnimationDescriptor) {
  const separator = clip.name.indexOf('.');
  return separator >= 0 ? clip.name.slice(separator + 1) : clip.name;
}

function durationLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
}

export function createAxieAnimationPanel(
  options: AxieAnimationPanelOptions,
): AxieAnimationPanelController {
  const host = element('div', 'axie-animation-host');
  host.dataset.active = 'false';
  host.dataset.open = 'false';

  const toggle = element('button', 'axie-animation-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'axie-animation-panel');
  toggle.setAttribute('aria-keyshortcuts', 'K');
  const toggleIcon = element('span');
  toggleIcon.setAttribute('aria-hidden', 'true');
  toggleIcon.textContent = '▶';
  const toggleLabel = element('b');
  toggleLabel.textContent = 'ANIMATIONS';
  const toggleCount = element('i');
  toggleCount.textContent = '0';
  toggle.append(toggleIcon, toggleLabel, toggleCount);

  const panel = element('section', 'axie-animation-panel');
  panel.id = 'axie-animation-panel';
  panel.setAttribute('aria-label', 'Axie animations');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;

  const header = element('header', 'axie-animation-header');
  const identity = element('div');
  const kicker = element('span', 'axie-animation-kicker');
  kicker.textContent = 'EXPORTED CLIP LIBRARY';
  const title = element('h2');
  title.textContent = 'Animations';
  const summary = element('p');
  summary.textContent = 'Choose an action, then keep moving with WASD.';
  identity.append(kicker, title, summary);
  const close = element('button', 'axie-animation-close');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close animations');
  close.textContent = '×';
  header.append(identity, close);

  const now = element('div', 'axie-animation-now');
  const nowLabel = element('span');
  nowLabel.textContent = 'Playing';
  const nowValue = element('strong');
  nowValue.textContent = 'Default.Idle';
  const resume = element('button');
  resume.type = 'button';
  resume.textContent = 'Resume locomotion';
  resume.disabled = true;
  now.append(nowLabel, nowValue, resume);

  const weapon = element('label', 'axie-animation-weapon');
  const weaponLabel = element('span');
  weaponLabel.textContent = 'Weapon';
  const weaponSelect = element('select');
  weaponSelect.setAttribute('aria-label', 'Equip Axie weapon');
  const weaponStatus = element('small');
  weaponStatus.textContent = 'Default / none';
  weapon.append(weaponLabel, weaponSelect, weaponStatus);

  const tools = element('div', 'axie-animation-tools');
  const search = element('input');
  search.type = 'search';
  search.placeholder = 'Search all animations';
  search.setAttribute('aria-label', 'Search Axie animations');
  const group = element('select');
  group.setAttribute('aria-label', 'Filter animation group');
  tools.append(search, group);

  const results = element('div', 'axie-animation-results');
  const empty = element('p', 'axie-animation-empty');
  empty.textContent = 'No animations match this filter.';
  empty.hidden = true;
  panel.append(header, now, weapon, tools, results, empty);
  host.append(toggle, panel);
  options.mount.append(host);

  let clips: readonly AxieAnimationDescriptor[] = [];
  let weapons: readonly AxieWeaponCapability[] = [];
  let open = false;
  let available = false;
  let selectedGroup = 'all';
  let activeName = '';

  const render = () => {
    const query = search.value.trim().toLocaleLowerCase();
    const filtered = clips.filter((clip) => (
      (selectedGroup === 'all' || clip.group === selectedGroup)
      && (!query || clip.name.toLocaleLowerCase().includes(query))
    ));
    results.replaceChildren();
    const byGroup = new Map<string, AxieAnimationDescriptor[]>();
    filtered.forEach((clip) => {
      const list = byGroup.get(clip.group) ?? [];
      list.push(clip);
      byGroup.set(clip.group, list);
    });
    [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([name, entries]) => {
      const section = element('section', 'axie-animation-group');
      const heading = element('h3');
      const headingLabel = element('span');
      headingLabel.textContent = name;
      const headingCount = element('i');
      headingCount.textContent = String(entries.length);
      heading.append(headingLabel, headingCount);
      const grid = element('div');
      entries.forEach((clip) => {
        const button = element('button', 'axie-animation-button');
        button.type = 'button';
        button.dataset.animation = clip.name;
        button.setAttribute('aria-pressed', String(clip.name === activeName));
        const label = element('span');
        label.textContent = displayName(clip);
        const metadata = element('small');
        metadata.textContent = `${clip.looping ? 'LOOP' : 'ONCE'} · ${durationLabel(clip.duration)}`;
        button.append(label, metadata);
        grid.append(button);
      });
      section.append(heading, grid);
      results.append(section);
    });
    empty.hidden = filtered.length !== 0;
  };

  const setOpen = (next: boolean) => {
    const normalized = available && next;
    if (normalized === open) return;
    open = normalized;
    host.dataset.open = String(open);
    toggle.setAttribute('aria-expanded', String(open));
    panel.setAttribute('aria-hidden', String(!open));
    panel.inert = !open;
    options.onOpenChange?.(open);
  };

  toggle.addEventListener('click', () => {
    setOpen(!open);
    options.onGameplayFocus?.();
  });
  close.addEventListener('click', () => {
    setOpen(false);
    options.onGameplayFocus?.();
  });
  resume.addEventListener('click', () => {
    options.onResumeLocomotion();
    options.onGameplayFocus?.();
  });
  search.addEventListener('input', render);
  group.addEventListener('change', () => {
    selectedGroup = group.value;
    render();
  });
  results.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-animation]');
    const clip = clips.find((candidate) => candidate.name === button?.dataset.animation);
    if (!clip) return;
    void options.onPlay(clip);
    options.onGameplayFocus?.();
  });
  weaponSelect.addEventListener('change', () => {
    options.onEquipWeapon(weaponSelect.value || undefined);
    options.onGameplayFocus?.();
  });

  const controller: AxieAnimationPanelController = {
    host,
    get isOpen() { return open; },
    setAvailable(next) {
      available = next;
      host.dataset.active = String(available);
      toggle.disabled = !available;
      if (!available) setOpen(false);
    },
    setAnimations(next) {
      clips = [...next].sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
      toggleCount.textContent = String(clips.length);
      const groups = [...new Set(clips.map((clip) => clip.group))].sort((a, b) => a.localeCompare(b));
      group.replaceChildren();
      const all = element('option');
      all.value = 'all';
      all.textContent = `All groups · ${clips.length}`;
      group.append(all);
      groups.forEach((name) => {
        const option = element('option');
        option.value = name;
        option.textContent = name;
        group.append(option);
      });
      selectedGroup = 'all';
      group.value = selectedGroup;
      search.value = '';
      render();
    },
    setWeapons(next) {
      weapons = [...next];
      weaponSelect.replaceChildren();
      const none = element('option');
      none.value = '';
      none.textContent = 'Default / none';
      weaponSelect.append(none);
      weapons.forEach((entry) => {
        const option = element('option');
        option.value = entry.id;
        option.textContent = entry.available
          ? entry.label
          : `${entry.label} · unavailable`;
        option.disabled = !entry.available;
        if (entry.unavailableReason) option.title = entry.unavailableReason;
        weaponSelect.append(option);
      });
      weaponSelect.value = '';
      weaponStatus.textContent = `${weapons.filter((entry) => entry.available).length}/${weapons.length} available`;
    },
    setActive(name, overridden) {
      activeName = name ?? '';
      nowValue.textContent = name ?? 'None';
      resume.disabled = !overridden;
      host.dataset.overridden = String(overridden);
      results.querySelectorAll<HTMLButtonElement>('[data-animation]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.animation === activeName));
      });
    },
    setActiveWeapon(id, loading) {
      const selected = loading ?? id ?? '';
      if ([...weaponSelect.options].some((option) => option.value === selected)) {
        weaponSelect.value = selected;
      }
      weaponSelect.disabled = Boolean(loading);
      weaponStatus.textContent = loading
        ? `Loading ${loading}…`
        : id
          ? `${id} equipped`
          : 'Default / none';
      host.dataset.weapon = id ?? '';
      host.dataset.weaponLoading = loading ?? '';
    },
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    dispose() {
      host.remove();
      clips = [];
      weapons = [];
    },
  };
  return controller;
}
