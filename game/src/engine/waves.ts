// Spawner de oleadas: puro. Total por oleada crece; el campo respeta MAX_CONCURRENT
// y el resto entra por goteo conforme caen enemigos.
import {
  ALFA_EVERY_WAVES,
  MAX_CONCURRENT_ENEMIES,
  WAVE_BASE_ENEMIES,
  WAVE_ENEMIES_PER_WAVE,
} from './constants';

export interface WaveState {
  readonly wave: number;
  /** Enemigos de esta oleada que aún no entran al campo. */
  readonly pending: number;
  /** Enemigos vivos en el campo. */
  readonly alive: number;
}

export function totalEnemiesForWave(wave: number): number {
  return WAVE_BASE_ENEMIES + (wave - 1) * WAVE_ENEMIES_PER_WAVE;
}

export function isAlfaWave(wave: number): boolean {
  return wave % ALFA_EVERY_WAVES === 0;
}

export function startWave(wave: number): WaveState {
  return { wave, pending: totalEnemiesForWave(wave), alive: 0 };
}

/** Cuántos enemigos deben entrar al campo ahora mismo (goteo). */
export function spawnBudget(state: WaveState): number {
  const room = MAX_CONCURRENT_ENEMIES - state.alive;
  return Math.max(0, Math.min(room, state.pending));
}

export function applySpawns(state: WaveState, count: number): WaveState {
  const n = Math.min(count, spawnBudget(state));
  return { ...state, pending: state.pending - n, alive: state.alive + n };
}

export function applyDeaths(state: WaveState, count: number): WaveState {
  return { ...state, alive: Math.max(0, state.alive - count) };
}

export function isWaveCleared(state: WaveState): boolean {
  return state.pending === 0 && state.alive === 0;
}
