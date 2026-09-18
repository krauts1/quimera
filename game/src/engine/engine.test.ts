import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import {
  applyDeaths,
  applySpawns,
  isAlfaWave,
  isWaveCleared,
  spawnBudget,
  startWave,
  totalEnemiesForWave,
} from './waves';
import { MAX_CONCURRENT_ENEMIES, WAVE_BASE_ENEMIES } from './constants';

describe('rng sembrado', () => {
  it('misma semilla → misma secuencia (determinismo)', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('semillas distintas → secuencias distintas', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toEqual(b());
  });

  it('valores en [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i += 1) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('oleadas', () => {
  it('oleada 1 trae WAVE_BASE_ENEMIES totales', () => {
    expect(totalEnemiesForWave(1)).toBe(WAVE_BASE_ENEMIES);
  });

  it('el campo nunca excede MAX_CONCURRENT_ENEMIES aunque el total sea mayor', () => {
    // Oleada tardía: total >> concurrent
    let s = startWave(9);
    expect(totalEnemiesForWave(9)).toBeGreaterThan(MAX_CONCURRENT_ENEMIES);
    s = applySpawns(s, 999);
    expect(s.alive).toBe(MAX_CONCURRENT_ENEMIES);
    expect(s.pending).toBe(totalEnemiesForWave(9) - MAX_CONCURRENT_ENEMIES);
  });

  it('el goteo rellena el campo cuando caen enemigos', () => {
    let s = startWave(9);
    s = applySpawns(s, 999);
    s = applyDeaths(s, 2);
    expect(spawnBudget(s)).toBe(2);
    s = applySpawns(s, spawnBudget(s));
    expect(s.alive).toBe(MAX_CONCURRENT_ENEMIES);
  });

  it('la oleada se limpia cuando no quedan pendientes ni vivos', () => {
    let s = startWave(1);
    s = applySpawns(s, 999);
    expect(isWaveCleared(s)).toBe(false);
    s = applyDeaths(s, s.alive);
    expect(isWaveCleared(s)).toBe(true);
  });

  it('cada tercera oleada es Alfa', () => {
    expect(isAlfaWave(3)).toBe(true);
    expect(isAlfaWave(6)).toBe(true);
    expect(isAlfaWave(1)).toBe(false);
    expect(isAlfaWave(4)).toBe(false);
  });
});
