// Partes, grupos de clase, sinergias y matemática de devorar. Puro.
import {
  DEVOUR_BONUS_PER_PASSIVE_PART,
  DEVOUR_HEAL_FRACTION,
  PREY_CLASS_WEIGHT,
  SYNERGY_APEX_BONUS,
  SYNERGY_BONUS,
  SYNERGY_THRESHOLD,
} from './constants';
import { rngPick, type Rng } from './rng';
import type {
  ActiveSlot,
  AxieClass,
  ChimeraLoadout,
  ClassGroup,
  Loadout,
  Part,
  PartSlot,
  PassiveSlot,
} from './types';

export const AXIE_CLASSES: readonly AxieClass[] = [
  'beast',
  'bug',
  'aquatic',
  'bird',
  'plant',
  'reptile',
];

export const ACTIVE_SLOTS: readonly ActiveSlot[] = ['mouth', 'horn', 'tail', 'back'];
export const PASSIVE_SLOTS: readonly PassiveSlot[] = ['eyes', 'ears'];
export const ALL_SLOTS: readonly PartSlot[] = [...ACTIVE_SLOTS, ...PASSIVE_SLOTS];

const GROUP_OF: Record<AxieClass, ClassGroup> = {
  beast: 'beast',
  bug: 'beast',
  aquatic: 'aquatic',
  bird: 'aquatic',
  plant: 'plant',
  reptile: 'plant',
};

const CLASSES_IN_GROUP: Record<ClassGroup, readonly AxieClass[]> = {
  beast: ['beast', 'bug'],
  aquatic: ['aquatic', 'bird'],
  plant: ['plant', 'reptile'],
};

export function classGroup(cls: AxieClass): ClassGroup {
  return GROUP_OF[cls];
}

export function makePart(slot: PartSlot, cls: AxieClass, level = 1): Part {
  return { id: `${slot}-${cls}`, class: cls, type: slot, level };
}

/** Grupo dominante entre las ranuras activas ocupadas y cuántas partes lo forman. */
export function dominantGroup(loadout: ChimeraLoadout): { group: ClassGroup; count: number } {
  const counts: Record<ClassGroup, number> = { beast: 0, aquatic: 0, plant: 0 };
  for (const slot of ACTIVE_SLOTS) {
    const part = loadout[slot];
    if (part) counts[classGroup(part.class)] += 1;
  }
  let best: ClassGroup = 'beast';
  for (const group of ['aquatic', 'plant'] as const) {
    if (counts[group] > counts[best]) best = group;
  }
  return { group: best, count: counts[best] };
}

/** 1 + SYNERGY_BONUS con 3/4 del mismo grupo; APEX (4/4) apila el jackpot. */
export function synergyMultiplier(loadout: ChimeraLoadout): number {
  const { count } = dominantGroup(loadout);
  if (count >= 4) return 1 + SYNERGY_BONUS + SYNERGY_APEX_BONUS;
  return count >= SYNERGY_THRESHOLD ? 1 + SYNERGY_BONUS : 1;
}

/**
 * Fracción de PLAYER_MAX_HP curada al devorar: base + bono por cada parte
 * pasiva que la presa conserve. Arrancar antes de devorar reduce la curación.
 */
export function devourHealFraction(prey: Loadout): number {
  let fraction = DEVOUR_HEAL_FRACTION;
  for (const slot of PASSIVE_SLOTS) {
    if (prey[slot]) fraction += DEVOUR_BONUS_PER_PASSIVE_PART;
  }
  return fraction;
}

/**
 * Loadout sintético de presa: cada ranura cae en el grupo del arquetipo con
 * peso PREY_CLASS_WEIGHT, si no, uniforme entre las clases de otros grupos.
 */
export function generatePreyLoadout(rng: Rng, archetype: AxieClass): Loadout {
  const group = classGroup(archetype);
  const inGroup = CLASSES_IN_GROUP[group];
  const outGroup = AXIE_CLASSES.filter((c) => classGroup(c) !== group);
  const loadout: Loadout = {};
  for (const slot of ALL_SLOTS) {
    const cls = rng() < PREY_CLASS_WEIGHT ? rngPick(rng, inGroup) : rngPick(rng, outGroup);
    loadout[slot] = makePart(slot, cls);
  }
  return loadout;
}
