// Rng sembrado (mulberry32). El motor jamás usa Math.random.
export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Entero uniforme en [0, n). */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Elige un elemento; requiere lista no vacía. */
export function rngPick<T>(rng: Rng, items: readonly T[]): T {
  const item = items[rngInt(rng, items.length)];
  if (item === undefined && items.length === 0) throw new Error('rngPick: lista vacía');
  return item as T;
}
