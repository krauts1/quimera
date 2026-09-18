// Bot jugador para balance headless (T2/T13). Puro y determinista por semilla.
// No es IA de juego: es un sustituto medible de un humano con cierto nivel.
import {
  ABILITY_BASE,
  CLASS_DELTA,
  ENEMY_ATTACK_RANGE,
  ENEMY_STRIKE_GRACE,
  INTERACT_RANGE,
  PART_MAX_LEVEL,
  PLAYER_MAX_HP,
} from './constants';
import { ACTIVE_SLOTS, classGroup, dominantGroup } from './parts';
import { rngInt, type Rng } from './rng';
import { IDLE_INPUT, type EnemyState, type PlayerInput, type SimState } from './sim';
import type { ActiveSlot, ChimeraLoadout, Loadout } from './types';

export interface BotProfile {
  /** Probabilidad de reaccionar al telegraph con esquiva (0..1). */
  readonly reaction: number;
  /** Devora si hp < esta fracción del máximo; si no, prefiere arrancar. */
  readonly devourBelow: number;
}

export const BOT_PROFILES: Record<'casual' | 'medio' | 'bueno', BotProfile> = {
  // devourBelow = gestión de vida (devorar antes de estar al borde)
  casual: { reaction: 0.35, devourBelow: 0.5 },
  medio: { reaction: 0.6, devourBelow: 0.6 },
  bueno: { reaction: 0.9, devourBelow: 0.7 },
};

function nearest<T extends EnemyState>(list: readonly T[], x: number, y: number): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const e of list) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Prioridad de cosecha: llenar ranura vacía > armar sinergia > asimilar nivel. */
function chooseRip(loadout: ChimeraLoadout, prey: Loadout): ActiveSlot | null {
  for (const slot of ACTIVE_SLOTS) {
    if (!loadout[slot] && prey[slot]) return slot;
  }
  const { group } = dominantGroup(loadout);
  for (const slot of ACTIVE_SLOTS) {
    const part = prey[slot];
    const current = loadout[slot];
    if (!part || !current) continue;
    if (classGroup(part.class) === group && classGroup(current.class) !== group) {
      return slot;
    }
  }
  for (const slot of ACTIVE_SLOTS) {
    const part = prey[slot];
    const current = loadout[slot];
    if (!part || !current) continue;
    // asimilar: mismo grupo y todavía hay nivel que ganar
    if (classGroup(part.class) === classGroup(current.class) && current.level < PART_MAX_LEVEL) {
      return slot;
    }
  }
  return null;
}

export function botInput(state: SimState, rng: Rng, profile: BotProfile): PlayerInput {
  // LA MUDA: el bot elige una mutación al azar (humano proxy simple)
  if (state.phase === 'molt') {
    return { ...IDLE_INPUT, chooseMutation: rngInt(rng, state.moltChoices?.length ?? 1) };
  }
  const player = state.player;
  const standing = state.enemies.filter((e) => e.knockdownTicks === 0);
  const knocked = state.enemies.filter((e) => e.knockdownTicks > 0);
  const input: PlayerInput = { ...IDLE_INPUT };

  // 0) Con hp bajo y presa derribada al alcance, devorar es prioridad absoluta:
  // el jugador real se compromete a tragar aunque le peguen.
  const lowHp = player.hp < profile.devourBelow * PLAYER_MAX_HP;
  if (lowHp) {
    const preyNear = nearest(knocked, player.x, player.y);
    if (preyNear) {
      const d = Math.hypot(preyNear.x - player.x, preyNear.y - player.y);
      if (d <= INTERACT_RANGE * 0.8) {
        input.interact = { kind: 'devour' };
        return input;
      }
      input.moveX = preyNear.x - player.x;
      input.moveY = preyNear.y - player.y;
      return input;
    }
  }

  // 1) Esquivar si un golpe está por resolverse cerca (reacción imperfecta).
  for (const e of standing) {
    if (e.windupTicks === 0 || e.windupTicks > 2) continue;
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d > ENEMY_ATTACK_RANGE * ENEMY_STRIKE_GRACE + 0.4) continue;
    if (rng() < profile.reaction) {
      input.dodge = true;
      input.moveX = player.x - e.x;
      input.moveY = player.y - e.y;
      return input;
    }
  }

  // 2) Cosechar presa derribada si conviene.
  const prey = nearest(knocked, player.x, player.y);
  if (prey) {
    const wantDevour = player.hp < profile.devourBelow * PLAYER_MAX_HP;
    const ripSlot = chooseRip(player.loadout, prey.loadout);
    if (wantDevour || ripSlot) {
      const d = Math.hypot(prey.x - player.x, prey.y - player.y);
      if (d > INTERACT_RANGE * 0.8) {
        input.moveX = prey.x - player.x;
        input.moveY = prey.y - player.y;
      } else {
        input.interact = wantDevour ? { kind: 'devour' } : { kind: 'rip', slot: ripSlot! };
      }
      return input;
    }
  }

  // 3) Combate: como el humano que sigue el faro, la MANADA es el objetivo —
  // la fauna salvaje solo si está de camino (cerca), si no el run jamás avanza.
  const herd = standing.filter((e) => !e.wild);
  const herdTarget = nearest(herd, player.x, player.y);
  const anyTarget = nearest(standing, player.x, player.y);
  const wildD = anyTarget ? Math.hypot(anyTarget.x - player.x, anyTarget.y - player.y) : Infinity;
  const target = herdTarget ?? (wildD <= 10 ? anyTarget : null);
  if (!target) return input;
  input.aimX = target.x - player.x;
  input.aimY = target.y - player.y;
  const d = Math.hypot(input.aimX, input.aimY);
  // ULTIMATE: con la carga llena y presas cerca, suéltala
  if (player.ult >= 1 && player.loadout.back && d <= 5) {
    input.attack = 'back';
    return input;
  }
  const order: readonly ActiveSlot[] = ['horn', 'tail', 'mouth'];
  for (const slot of order) {
    if (player.cooldowns[slot] > 0) continue;
    const part = player.loadout[slot];
    if (!part) continue; // ranura aún vacía: sin habilidad
    const range = ABILITY_BASE[slot].range * CLASS_DELTA[part.class].rangeMul;
    if (d <= range) {
      input.attack = slot;
      break;
    }
  }
  if (d > 1.4) {
    input.moveX = input.aimX;
    input.moveY = input.aimY;
  }
  return input;
}
