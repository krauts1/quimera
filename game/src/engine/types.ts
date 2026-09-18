// Tipos compartidos del motor. No duplicar tipos en otros módulos.

export type AxieClass = 'beast' | 'bug' | 'aquatic' | 'bird' | 'plant' | 'reptile';

/** Grupos de clase canónicos, nombrados por su clase líder. */
export type ClassGroup = 'beast' | 'aquatic' | 'plant';

export type ActiveSlot = 'mouth' | 'horn' | 'tail' | 'back';
export type PassiveSlot = 'eyes' | 'ears';
export type PartSlot = ActiveSlot | PassiveSlot;

export interface Part {
  readonly id: string;
  readonly class: AxieClass;
  readonly type: PartSlot;
  readonly level: number;
}

/** Loadout de una presa: puede perder partes (arrancadas por la Quimera). */
export type Loadout = Partial<Record<PartSlot, Part>>;

/**
 * Loadout de la Quimera: nace casi vacía (solo boca) y se completa cazando.
 * Ranura vacía = sin habilidad. Arrancar equipa, cambia o asimila (sube nivel).
 */
export type ChimeraLoadout = Partial<Record<ActiveSlot, Part>>;

/** Axie real sembrado (de axies.json), usable como presa. */
export interface CatalogAxie {
  readonly id: string;
  readonly class: AxieClass;
  readonly genes: string;
  readonly parts: readonly Part[];
  /** NÉMESIS: se te escapó demasiadas veces — spawnea CICATRIZADO (más duro,
   * más bravo, botín L2). El render decide quién lo es (persistencia local). */
  readonly nemesis?: boolean;
}

export interface AbilityStats {
  readonly damage: number;
  readonly cooldownSeconds: number;
  readonly range: number;
  readonly arcDegrees: number;
}

/** Delta de clase: la misma habilidad base cambia de sabor según la clase de la parte. */
export interface ClassDelta {
  readonly damageMul: number;
  readonly cooldownMul: number;
  readonly rangeMul: number;
  /** Fracción del daño infligido que cura al atacante (plant). */
  readonly lifesteal: number;
  /** Multiplica la duración del derribo que causan sus golpes letales (reptile). */
  readonly knockdownMul: number;
}
