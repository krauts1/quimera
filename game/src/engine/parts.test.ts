import { describe, expect, it } from 'vitest';
import {
  DEVOUR_BONUS_PER_PASSIVE_PART,
  DEVOUR_HEAL_FRACTION,
  PREY_CLASS_WEIGHT,
  SYNERGY_APEX_BONUS,
  SYNERGY_BONUS,
} from './constants';
import {
  ACTIVE_SLOTS,
  ALL_SLOTS,
  classGroup,
  devourHealFraction,
  dominantGroup,
  generatePreyLoadout,
  makePart,
  synergyMultiplier,
} from './parts';
import { createRng } from './rng';
import type { AxieClass, ChimeraLoadout } from './types';

function loadoutOf(
  mouth: AxieClass,
  horn: AxieClass,
  tail: AxieClass,
  back: AxieClass,
): ChimeraLoadout {
  return {
    mouth: makePart('mouth', mouth),
    horn: makePart('horn', horn),
    tail: makePart('tail', tail),
    back: makePart('back', back),
  };
}

describe('grupos de clase', () => {
  it('mapea las 6 clases a sus 3 grupos canónicos', () => {
    expect(classGroup('beast')).toBe('beast');
    expect(classGroup('bug')).toBe('beast');
    expect(classGroup('aquatic')).toBe('aquatic');
    expect(classGroup('bird')).toBe('aquatic');
    expect(classGroup('plant')).toBe('plant');
    expect(classGroup('reptile')).toBe('plant');
  });
});

describe('sinergia', () => {
  it('3 activas del mismo grupo activan el bono', () => {
    const loadout = loadoutOf('beast', 'bug', 'beast', 'bird');
    expect(dominantGroup(loadout)).toEqual({ group: 'beast', count: 3 });
    expect(synergyMultiplier(loadout)).toBeCloseTo(1 + SYNERGY_BONUS);
  });

  it('2+2 no activa sinergia', () => {
    const loadout = loadoutOf('beast', 'bug', 'aquatic', 'bird');
    expect(synergyMultiplier(loadout)).toBe(1);
  });

  it('4 del mismo grupo = APEX: el jackpot apila sobre la sinergia', () => {
    const loadout = loadoutOf('plant', 'reptile', 'plant', 'reptile');
    expect(dominantGroup(loadout).count).toBe(4);
    expect(synergyMultiplier(loadout)).toBeCloseTo(1 + SYNERGY_BONUS + SYNERGY_APEX_BONUS);
  });
});

describe('devorar', () => {
  it('presa íntegra: base + 2 bonos pasivos', () => {
    const rng = createRng(7);
    const prey = generatePreyLoadout(rng, 'beast');
    expect(devourHealFraction(prey)).toBeCloseTo(
      DEVOUR_HEAL_FRACTION + 2 * DEVOUR_BONUS_PER_PASSIVE_PART,
    );
  });

  it('sin pasivas: solo la base', () => {
    const prey = generatePreyLoadout(createRng(7), 'beast');
    delete prey.eyes;
    delete prey.ears;
    expect(devourHealFraction(prey)).toBeCloseTo(DEVOUR_HEAL_FRACTION);
  });
});

describe('generador de presas', () => {
  it('llena las 6 ranuras y es determinista por semilla', () => {
    const a = generatePreyLoadout(createRng(42), 'aquatic');
    const b = generatePreyLoadout(createRng(42), 'aquatic');
    expect(a).toEqual(b);
    for (const slot of ALL_SLOTS) {
      expect(a[slot]).toBeDefined();
      expect(a[slot]!.type).toBe(slot);
    }
  });

  it('pesa las partes hacia el grupo del arquetipo', () => {
    const rng = createRng(1234);
    let inGroup = 0;
    let total = 0;
    for (let i = 0; i < 300; i += 1) {
      const prey = generatePreyLoadout(rng, 'plant');
      for (const slot of ACTIVE_SLOTS) {
        total += 1;
        if (classGroup(prey[slot]!.class) === 'plant') inGroup += 1;
      }
    }
    const fraction = inGroup / total;
    expect(fraction).toBeGreaterThan(PREY_CLASS_WEIGHT - 0.1);
    expect(fraction).toBeLessThan(PREY_CLASS_WEIGHT + 0.1);
  });
});
