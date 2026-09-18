// Simulación del run a tick fijo. Pura: sin Three, sin DOM, sin Math.random.
// step(prev, input, rng) devuelve un estado nuevo; jamás muta prev.
import {
  ABILITY_BASE,
  ALFA_DAMAGE_MULT,
  ALFA_HP_MULT,
  ALFA_SPEED_MULT,
  ANGRY_DAMAGE_MULT,
  ARENA_EDGE_MARGIN,
  ARENA_RADIUS,
  ATTACK_LUNGE_BASE,
  ATTACK_LUNGE_MAX,
  ATTACK_MAGNET_CONE_COS,
  ATTACK_MAGNET_STOP,
  AVENGE_RADIUS,
  AVENGE_SECONDS,
  BEAST_BRAVE_RANGE_MUL,
  BIRD_ZIGZAG_AMPLITUDE,
  BODY_RADIUS,
  BUG_PAUSE_MUL,
  BUG_SPRINT_MUL,
  CLASS_DELTA,
  DODGE_COOLDOWN_SECONDS,
  DODGE_SECONDS,
  DODGE_SPEED,
  ENEMY_ATTACK_COOLDOWN_SECONDS,
  ENEMY_ATTACK_RANGE,
  ENEMY_BASE_HP,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_CORNERED_RANGE,
  ENEMY_FIGHT_RANGE,
  ENEMY_FLEE_SPEED,
  ENEMY_KNOCKBACK_SPEED,
  ENEMY_SEPARATION_RADIUS,
  ENEMY_SPEED,
  ENEMY_DMG_SCALE_PER_WAVE,
  ENEMY_HP_SCALE_PER_WAVE,
  ENEMY_STRIKE_GRACE,
  ENEMY_TELEGRAPH_SECONDS,
  FINAL_WAVE,
  FINAL_WAVE_ALFAS,
  FLEE_AQUATIC_SPEED_MUL,
  FLEE_PLANT_SPEED_MUL,
  HERD_FIRST_DIST,
  HERD_HOME_RADIUS,
  HERD_SPAWN_RING,
  HERD_STEP_MAX,
  HERD_STEP_MIN,
  METEOR_NEAR_PLAYER,
  PICKUP_COUNT,
  PICKUP_HEAL,
  PICKUP_RADIUS,
  PICKUP_ULT,
  ROVER_MOUNT_COOLDOWN_SECONDS,
  ROVER_MOUNT_RANGE,
  ROVER_SPEED_MUL,
  BOUNTY_SCORE,
  BOUNTY_ULT,
  FAST_CLEAR_SCORE,
  FAST_CLEAR_SECONDS,
  GOLDEN_MOLT_CHANCE,
  KNOCKDOWN_HEAL,
  MOMENTUM_SECONDS,
  MOMENTUM_SPEED_BONUS,
  SECOND_WIND_HP_FRACTION,
  SECOND_WIND_INVULN_SECONDS,
  WILD_COUNT,
  WILD_FERAL_CHANCE,
  WILD_MAX_DIST,
  WILD_MIN_DIST,
  WILD_RESPAWN_SECONDS,
  FERAL_HUNT_RANGE,
  WEAPON_TOOL_MULT,
  WEAPON_TOOL_SECONDS,
  GOLDEN_CHANCE,
  GOLDEN_FLEE_CAP,
  GOLDEN_FLEE_MUL,
  NEMESIS_FIGHT_RANGE_MUL,
  NEMESIS_HP_MULT,
  SCORE_GOLDEN,
  SCORE_NEMESIS,
  INTERACT_CHANNEL_SECONDS,
  INTERACT_RANGE,
  KNOCKBACK_SECONDS,
  KNOCKBACK_SPEED,
  KNOCKDOWN_SECONDS,
  METEOR_DAMAGE_PLAYER,
  METEOR_DAMAGE_PREY,
  METEOR_FIRST_DELAY_SECONDS,
  METEOR_INTERVAL_SECONDS,
  METEOR_RADIUS,
  METEOR_WARN_SECONDS,
  MUT_CARRONERA_SECONDS,
  MUT_CAZADORA_SPEED,
  MUT_FURIA_DAMAGE,
  MUT_FURIA_HP,
  MUT_PIEL_REDUCTION,
  MUT_REFLEJOS_MUL,
  MUT_SED_DAMAGE,
  MUT_VORAZ_HEAL,
  MUT_ZARPA_BONUS,
  MUTATION_IDS,
  type MutationId,
  BEAST_KNOCKBACK_TICKS_MUL,
  BOSS_CHARGE_DAMAGE,
  BOSS_CHARGE_SECONDS,
  BOSS_CHARGE_SPEED,
  BOSS_CHARGE_WARN_SECONDS,
  BOSS_PATTERN_COOLDOWN_SECONDS,
  BOSS_PATTERN_RANGE,
  BOSS_ROAR_RADIUS,
  BOSS_ROAR_WARN_SECONDS,
  BOSS_TIRED_SECONDS,
  CHARGE_CRASH_STUN_SECONDS,
  CONTRACT_KNOCK_TARGET,
  CRIT_CHANCE,
  CRIT_MULT,
  PERFECT_DODGE_WINDOW_TICKS,
  POISON_DPS,
  PRIMORDIAL_HP_MULT,
  SLEEP_CHANCE,
  SLEEP_WAKE_RANGE,
  STUN_SECONDS,
  TERRITORIES,
  territoryIndex,
  ULT_BIRD_DMG,
  ULT_BIRD_HITS,
  ULT_CHARGE_DEVOUR,
  ULT_CHARGE_KNOCKDOWN,
  ULT_CHARGE_RIP,
  ULT_DAMAGE,
  ULT_DASH_DISTANCE,
  ULT_HEAL_PER_HIT,
  ULT_POISON_SECONDS,
  ULT_RADIUS,
  ULT_STUN_SECONDS,
  OBSTACLE_CENTER_CLEAR,
  OBSTACLE_COUNT,
  OBSTACLE_MAX_RADIUS,
  OBSTACLE_MIN_RADIUS,
  PART_LEVEL_DAMAGE_BONUS,
  PART_MAX_LEVEL,
  PLANT_PREY_ARMOR,
  PLAYER_MAX_HP,
  REPTILE_AMBUSH_RANGE_MUL,
  REPTILE_STRIKE_MUL,
  SCORE_ALFA_BONUS,
  SCORE_ASSIMILATE,
  SCORE_DEVOUR,
  SCORE_KNOCKDOWN,
  SCORE_RIP,
  SCORE_VICTORY,
  SCORE_WAVE_CLEAR,
  PLAYER_SPEED,
  SPAWN_RADIUS,
  TICK_HZ,
  TICK_SECONDS,
  WAVE_INTERMISSION_SECONDS,
} from './constants';
import {
  AXIE_CLASSES,
  classGroup,
  devourHealFraction,
  dominantGroup,
  generatePreyLoadout,
  makePart,
  synergyMultiplier,
} from './parts';
import { createRng, rngInt, rngPick, type Rng } from './rng';
import type { ActiveSlot, AxieClass, CatalogAxie, ChimeraLoadout, Loadout } from './types';
import { applyDeaths, applySpawns, isAlfaWave, spawnBudget, startWave, type WaveState } from './waves';

const DODGE_TICKS = Math.round(DODGE_SECONDS * TICK_HZ);
const DODGE_COOLDOWN_TICKS = Math.round(DODGE_COOLDOWN_SECONDS * TICK_HZ);
const KNOCKDOWN_TICKS = Math.round(KNOCKDOWN_SECONDS * TICK_HZ);
const CHANNEL_TICKS = Math.round(INTERACT_CHANNEL_SECONDS * TICK_HZ);
const INTERMISSION_TICKS = Math.round(WAVE_INTERMISSION_SECONDS * TICK_HZ);
const ENEMY_ATTACK_COOLDOWN_TICKS = Math.round(ENEMY_ATTACK_COOLDOWN_SECONDS * TICK_HZ);
const TELEGRAPH_TICKS = Math.round(ENEMY_TELEGRAPH_SECONDS * TICK_HZ);
const KNOCKBACK_TICKS = Math.round(KNOCKBACK_SECONDS * TICK_HZ);
const AVENGE_TICKS = Math.round(AVENGE_SECONDS * TICK_HZ);
const METEOR_WARN_TICKS = Math.round(METEOR_WARN_SECONDS * TICK_HZ);

export type InteractIntent = { kind: 'devour' } | { kind: 'rip'; slot: ActiveSlot };

/** Contrato de caza: objetivo secundario del territorio. */
export interface Contract {
  readonly kind: 'knock_class' | 'absorb_group' | 'no_devour' | 'meteor_knock';
  readonly cls?: AxieClass;
  readonly group?: 'beast' | 'aquatic' | 'plant';
  readonly territory: number;
  readonly text: string;
  progress: number;
  readonly target: number;
  failed: boolean;
  done: boolean;
}

export interface PlayerInput {
  /** En phase 'molt': índice de la mutación elegida (0-2). */
  chooseMutation: number | null;
  /** Dirección de movimiento, componentes en [-1, 1]. */
  moveX: number;
  moveY: number;
  /** Dirección de apuntado (no necesita estar normalizada). */
  aimX: number;
  aimY: number;
  /** Flancos: true solo el tick en que se presiona. */
  dodge: boolean;
  attack: ActiveSlot | null;
  /** Mantenido: canal de arrancar/devorar sobre la presa derribada más cercana. */
  interact: InteractIntent | null;
}

export const IDLE_INPUT: PlayerInput = {
  chooseMutation: null,
  moveX: 0,
  moveY: 0,
  aimX: 0,
  aimY: 0,
  dodge: false,
  attack: null,
  interact: null,
};

export type PickupKind = 'relic' | 'heal' | 'ult' | 'fang';

export interface Pickup {
  readonly x: number;
  readonly y: number;
  readonly kind: PickupKind;
  readonly taken: boolean;
}

export interface EnemyState {
  readonly id: number;
  readonly archetype: AxieClass;
  /** Genes del Axie real que encarna esta presa ('' si es sintética). */
  readonly genes: string;
  /** QUERENCIA: el ancla de su manada — la presa no huye lejos de su hogar. */
  readonly homeX: number;
  readonly homeY: number;
  loadout: Loadout;
  readonly isAlfa: boolean;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  readonly contactDamage: number;
  attackCooldown: number;
  /** >0: derribado (ventana de cosecha). */
  knockdownTicks: number;
  /** >0: telegraph en curso; el golpe se resuelve cuando llega a 0. */
  windupTicks: number;
  /** >0: empujado por un golpe del jugador; no persigue mientras dura. */
  knockbackTicks: number;
  knockbackDirX: number;
  knockbackDirY: number;
  /** true: huyendo de la Quimera este tick (para render: correr mirando lejos). */
  fleeing: boolean;
  /** >0: vengando a un caído — pelea aunque normalmente huiría. */
  angryTicks: number;
  /** >0: ATURDIDA — quieta, indefensa, estrellitas. */
  stunTicks: number;
  /** DORMIDA (La Cicatriz): despierta por cercanía o daño; golpearla = crítico. */
  sleeping: boolean;
  /** >0: envenenada (PLAGA) — pierde vida por tick. */
  poisonTicks: number;
  /** PRESA DORADA: rarísima, huye el doble, jamás pelea; botín L2 + puntos. */
  readonly golden: boolean;
  /** PRESA MARCADA: el bounty de esta manada — derribarla premia extra. */
  readonly bounty: boolean;
  /** FAUNA SALVAJE: errante, no pertenece a la manada (no cuenta para la oleada). */
  readonly wild: boolean;
  /** FERAL: fauna que no huye — te caza a ti si te acercas. */
  readonly feral: boolean;
  /** CICATRIZADA (némesis): te recuerda — más dura, pelea de lejos, no duerme. */
  readonly nemesis: boolean;
  /** ── Patrones de jefe (solo Alfas/Guardianes) ── */
  readonly primordial: boolean;
  patternCooldown: number;
  chargeWarnTicks: number; // telegraph de CARGA (línea)
  chargeTicks: number; // cargando a toda velocidad
  chargeDirX: number;
  chargeDirY: number;
  tiredTicks: number; // exhausto tras cargar: ventana de CRÍTICO
  roarWarnTicks: number; // telegraph de RUGIDO
}

export interface ChannelState {
  readonly intent: InteractIntent;
  readonly targetId: number;
  ticksLeft: number;
}

export interface PlayerState {
  x: number;
  y: number;
  faceX: number;
  faceY: number;
  hp: number;
  loadout: ChimeraLoadout;
  cooldowns: Record<ActiveSlot, number>;
  dodgeTicks: number;
  dodgeCooldown: number;
  dodgeDirX: number;
  dodgeDirY: number;
  knockbackTicks: number;
  knockbackDirX: number;
  knockbackDirY: number;
  channel: ChannelState | null;
  /** La esquiva PERFECTA carga tu siguiente golpe: crítico garantizado. */
  critNext: boolean;
  /** Carga de ULTIMATE (0..1): se llena cazando; el dorso la libera. */
  ult: number;
  /** A bordo del rover: rapidísimo, pero no cazas (atacar/esquivar desmonta). */
  riding: boolean;
  roverCooldown: number;
  /** INSTINTO SALVAJE: el revive único del run ya se usó. */
  revived: boolean;
  /** >0: invulnerable (ventana del instinto salvaje). */
  invulnTicks: number;
  /** >0: FLUJO DE CAZA — conectaste hace poco, corres más. */
  momentumTicks: number;
  /** >0: COLMILLO DE METEORO — tus golpes hacen ×WEAPON_TOOL_MULT. */
  weaponTicks: number;
}

export type SimEvent =
  | { type: 'waveStart'; wave: number }
  | {
      type: 'spawn';
      enemyId: number;
      isAlfa: boolean;
      golden?: boolean;
      nemesis?: boolean;
      bounty?: boolean;
    }
  | { type: 'attack'; slot: ActiveSlot; range: number; arcDegrees: number }
  | { type: 'hit'; enemyId: number; damage: number; crit?: boolean }
  | { type: 'perfectDodge'; enemyId: number }
  | { type: 'wake'; enemyId: number }
  | { type: 'bossChargeWarn'; enemyId: number; dirX: number; dirY: number }
  | { type: 'bossCrash'; enemyId: number }
  | { type: 'bossRoarWarn'; enemyId: number }
  | { type: 'bossRoar'; enemyId: number }
  | { type: 'ultimate'; cls: AxieClass; x: number; y: number }
  | { type: 'contractNew'; text: string }
  | { type: 'contractDone' }
  | { type: 'contractFail' }
  | { type: 'knockdown'; enemyId: number }
  | { type: 'telegraph'; enemyId: number }
  | { type: 'expired'; enemyId: number }
  | { type: 'devour'; enemyId: number; heal: number }
  | {
      type: 'rip';
      enemyId: number;
      slot: ActiveSlot;
      partId: string;
      outcome: 'equip' | 'swap' | 'assimilate';
      level: number;
    }
  | { type: 'playerHurt'; damage: number }
  | { type: 'molt'; mutation: MutationId; golden?: boolean }
  | { type: 'secondWind' }
  | { type: 'fastClear' }
  | { type: 'moltOffer'; choices: readonly MutationId[] }
  | { type: 'pickup'; kind: PickupKind; x: number; y: number }
  | { type: 'roverMount' }
  | { type: 'roverDismount' }
  | { type: 'meteorWarn'; x: number; y: number }
  | { type: 'meteorHit'; x: number; y: number }
  | { type: 'death' }
  | { type: 'victory' };

export interface Obstacle {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/** Prop del mundo: el MOTOR decide dónde vive (y su colisión); el render lo viste. */
export type PropKind = 'shuttle' | 'antenna' | 'monolith' | 'lander' | 'flag' | 'crater' | 'cave';
export interface Prop {
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly kind: PropKind;
}

export interface MeteorState {
  readonly x: number;
  readonly y: number;
  /** Ticks de aviso restantes; al llegar a 0, impacta. */
  ticksLeft: number;
}

export interface SimState {
  readonly tick: number;
  /** 'molt' = LA MUDA: el mundo espera mientras eliges tu mutación. */
  readonly phase: 'running' | 'dead' | 'victory' | 'molt';
  /** Mutaciones acumuladas este run. */
  readonly mutations: readonly MutationId[];
  /** Opciones de la muda en curso (solo en phase 'molt'). */
  readonly moltChoices: readonly MutationId[] | null;
  /** Última oleada cuya muda ya se ofreció. */
  readonly moltDoneWave: number;
  /** Contrato de caza del territorio actual (cumplirlo = muda extra). */
  contract: Contract | null;
  readonly wave: WaveState;
  readonly intermissionTicks: number;
  readonly obstacles: readonly Obstacle[];
  /** Anclas de las manadas (índice = oleada - 1): la cacería es un VIAJE. */
  readonly herds: readonly { x: number; y: number }[];
  /** Herramientas esparcidas por la luna: reliquia / cristal de vida / núcleo. */
  readonly pickups: readonly Pickup[];
  /** El rover abandonado (posición donde quedó aparcado). */
  readonly rover: { x: number; y: number };
  /** Props del mundo (restos, cuevas): posiciones y colisión del motor. */
  readonly props: readonly Prop[];
  meteor: MeteorState | null;
  meteorCooldown: number;
  /** Presas reales disponibles; vacío = generador sintético. */
  readonly catalog: readonly CatalogAxie[];
  /** Oleada a la que se refiere el conteo de Alfas ya spawneadas. */
  readonly alfaSpawnedWave: number;
  readonly alfaSpawnedCount: number;
  /** Oleada que ya tiene su PRESA MARCADA asignada. */
  readonly bountyAssignedWave: number;
  /** Tick en que empezó la oleada actual (para el bonus de CAZA VELOZ). */
  readonly waveStartTick: number;
  /** Ticks hasta que la luna repone otra presa salvaje. */
  readonly wildRespawnTicks: number;
  /** Territorio que aún DEBE su presa dorada garantizada (-1 = ya pagó). */
  readonly goldenOwedTerr: number;
  readonly nextEnemyId: number;
  /** Puntaje del run: derribos, cosecha, oleadas, victoria. */
  readonly score: number;
  readonly player: PlayerState;
  readonly enemies: readonly EnemyState[];
  /** Eventos ocurridos SOLO en el último step (para render/sfx/tests). */
  readonly events: readonly SimEvent[];
}

/** La Quimera nace casi vacía: solo su mordida. El resto se caza. */
export function startingLoadout(): ChimeraLoadout {
  return { mouth: makePart('mouth', 'beast') };
}

/** Rocas del mapa: deterministas por semilla, sin encimarse ni tapar el centro. */
function generateObstacles(seed: number): Obstacle[] {
  const rng = createRng(seed);
  const obstacles: Obstacle[] = [];
  let guard = 0;
  while (obstacles.length < OBSTACLE_COUNT && guard < 400) {
    guard += 1;
    const r = OBSTACLE_MIN_RADIUS + rng() * (OBSTACLE_MAX_RADIUS - OBSTACLE_MIN_RADIUS);
    const angle = rng() * Math.PI * 2;
    const dist = OBSTACLE_CENTER_CLEAR + r + rng() * (ARENA_RADIUS - 3 - OBSTACLE_CENTER_CLEAR - r);
    const x = Math.cos(angle) * dist;
    const y = Math.sin(angle) * dist;
    if (obstacles.some((o) => len(o.x - x, o.y - y) < o.r + r + 1.2)) continue;
    obstacles.push({ x, y, r });
  }
  return obstacles;
}

/** Saca un cuerpo circular de todas las rocas (desliza por el borde).
 * El contacto RESBALA levemente (normal rotada ~6°): empujar de frente exacto
 * contra un círculo ya no ancla a nadie — sin paredes pegajosas ni deadlocks
 * (medido: presas/jefes trabados contra las guaridas colgaban runs). */
const SLIDE_COS = Math.cos(0.1);
const SLIDE_SIN = Math.sin(0.1);
function pushOut(x: number, y: number, obstacles: readonly Obstacle[]): [number, number] {
  for (const o of obstacles) {
    const dx = x - o.x;
    const dy = y - o.y;
    const d = len(dx, dy);
    const min = o.r + BODY_RADIUS;
    if (d >= min) continue;
    if (d < 1e-6) {
      x = o.x + min;
      continue;
    }
    const nx = (dx / d) * SLIDE_COS - (dy / d) * SLIDE_SIN;
    const ny = (dx / d) * SLIDE_SIN + (dy / d) * SLIDE_COS;
    x = o.x + nx * min;
    y = o.y + ny * min;
  }
  return [x, y];
}

export function createSim(
  initialWave = 1,
  catalog: readonly CatalogAxie[] = [],
  mapSeed = 20260903,
  initialMutations: readonly MutationId[] = [], // empezar en territorio avanzado
): SimState {
  // con catálogo, la mordida inicial es la del Axie base real (coherencia rig↔motor)
  const baseMouth = catalog[0]?.parts.find((p) => p.type === 'mouth');
  // ── La geografía del run: manadas, herramientas y el rover, todo de la semilla ──
  const worldRng = createRng((mapSeed ^ 0x51ab3d) >>> 0);
  const herds: { x: number; y: number }[] = [];
  let herdAngle = worldRng() * Math.PI * 2;
  let herdDist = HERD_FIRST_DIST;
  for (let w = 1; w <= FINAL_WAVE; w += 1) {
    herds.push({ x: Math.cos(herdAngle) * herdDist, y: Math.sin(herdAngle) * herdDist });
    if (w >= initialWave) {
      // el viaje se aleja del inicio con giros: la luna se RECORRE
      herdAngle += 0.7 + worldRng() * 1.3;
      herdDist = Math.min(
        ARENA_RADIUS - 12,
        herdDist + HERD_STEP_MIN + worldRng() * (HERD_STEP_MAX - HERD_STEP_MIN),
      );
    }
  }
  const pickups: Pickup[] = [];
  const KINDS: readonly PickupKind[] = ['relic', 'heal', 'ult', 'fang'];
  for (let i = 0; i < PICKUP_COUNT; i += 1) {
    const a = worldRng() * Math.PI * 2;
    const d = 10 + worldRng() * (ARENA_RADIUS - 18);
    pickups.push({
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      kind: KINDS[rngInt(worldRng, KINDS.length)]!,
      taken: false,
    });
  }
  const roverAngle = worldRng() * Math.PI * 2;
  const rover = {
    x: Math.cos(roverAngle) * (30 + worldRng() * 14),
    y: Math.sin(roverAngle) * (30 + worldRng() * 14),
  };
  // ── PROPS del mundo: el motor los coloca y les da CUERPO (colisión) — antes
  // el render los ponía al azar y se atravesaban como fantasmas (Luis, 9 sep)
  const props: Prop[] = [];
  const propSpot = (r: number): [number, number] => {
    for (let tries = 0; tries < 40; tries += 1) {
      const a = worldRng() * Math.PI * 2;
      const d = 18 + worldRng() * (ARENA_RADIUS - 32);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      if (herds.some((h) => Math.hypot(h.x - x, h.y - y) < 13 + r)) continue;
      if (props.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + r + 9)) continue;
      if (Math.hypot(x - rover.x, y - rover.y) < r + 4) continue;
      return [x, y];
    }
    const a = worldRng() * Math.PI * 2;
    return [Math.cos(a) * 40, Math.sin(a) * 40];
  };
  const PROP_KINDS: readonly [PropKind, number][] = [
    ['shuttle', 3.0],
    ['antenna', 1.7],
    ['monolith', 1.3],
    ['lander', 2.0],
    ['flag', 0.35],
    ['crater', 0], // el gran cráter se camina (r 0 = sin colisión)
  ];
  for (const [kind, r] of PROP_KINDS) {
    const [x, y] = propSpot(Math.max(r, 1));
    props.push({ x, y, r, kind });
  }
  // las GUARIDAS: cuerpo detrás de la boca (el frente queda libre para pelear)
  for (const w of [3, 6, 9]) {
    const h = herds[w - 1];
    if (!h) continue;
    const hl = Math.hypot(h.x, h.y) || 1;
    props.push({ x: h.x + (h.x / hl) * 5.5, y: h.y + (h.y / hl) * 5.5, r: 3.2, kind: 'cave' });
  }
  return {
    tick: 0,
    phase: 'running',
    wave: startWave(initialWave),
    intermissionTicks: 0,
    // los props CON cuerpo entran al sistema de colisión (jugador, presas y
    // cargas de jefe los respetan — estrellarse contra tu cueva: aturdido)
    obstacles: [
      ...generateObstacles(mapSeed),
      ...props.filter((p) => p.r > 0).map(({ x, y, r }) => ({ x, y, r })),
    ],
    herds,
    pickups,
    rover,
    props,
    meteor: null,
    meteorCooldown: Math.round(METEOR_FIRST_DELAY_SECONDS * TICK_HZ),
    catalog,
    alfaSpawnedWave: 0,
    alfaSpawnedCount: 0,
    bountyAssignedWave: 0,
    waveStartTick: 0,
    wildRespawnTicks: 0,
    goldenOwedTerr: territoryIndex(initialWave), // cada territorio garantiza UNA dorada
    score: 0,
    mutations: [...initialMutations],
    moltChoices: null,
    moltDoneWave: initialWave - 1,
    contract: null,
    nextEnemyId: 1,
    player: {
      x: 0,
      y: 0,
      faceX: 0,
      faceY: 1,
      hp: PLAYER_MAX_HP,
      loadout: baseMouth ? { mouth: baseMouth } : startingLoadout(),
      cooldowns: { mouth: 0, horn: 0, tail: 0, back: 0 },
      dodgeTicks: 0,
      dodgeCooldown: 0,
      dodgeDirX: 0,
      dodgeDirY: 1,
      knockbackTicks: 0,
      knockbackDirX: 0,
      knockbackDirY: 0,
      channel: null,
      critNext: false,
      ult: 0,
      riding: false,
      roverCooldown: 0,
      revived: false,
      invulnTicks: 0,
      momentumTicks: 0,
      weaponTicks: 0,
    },
    enemies: [],
    events: [],
  };
}

function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

function clampToArena(px: number, py: number): [number, number] {
  const d = len(px, py);
  if (d <= ARENA_RADIUS) return [px, py];
  return [(px / d) * ARENA_RADIUS, (py / d) * ARENA_RADIUS];
}

function spawnEnemy(
  rng: Rng,
  wave: number,
  id: number,
  isAlfa: boolean,
  catalog: readonly CatalogAxie[],
  anchorX: number,
  anchorY: number,
  bounty: boolean,
  opts: { wild?: boolean; forceGolden?: boolean; feral?: boolean } = {},
): EnemyState {
  const wild = opts.wild === true;
  const feral = opts.feral === true;
  let archetype: AxieClass;
  let loadout: Loadout;
  let genes = '';
  let nemesis = false;
  // PRESA DORADA: rareza pura — el grito de "¡ahí va!" (jamás en Alfas).
  // Cada territorio garantiza una (forceGolden) para que el jugador la CONOZCA.
  const golden = !isAlfa && (opts.forceGolden === true || rng() < GOLDEN_CHANCE);
  // el territorio dicta qué clases habitan aquí
  const terr = TERRITORIES[territoryIndex(wave)]!;
  const terrCatalog = catalog.filter((a) => (terr.classes as readonly string[]).includes(a.class));
  const pool = terrCatalog.length > 0 ? terrCatalog : catalog;
  if (pool.length > 0) {
    const entry = rngPick(rng, pool);
    archetype = entry.class;
    genes = entry.genes;
    nemesis = !isAlfa && entry.nemesis === true;
    loadout = {};
    for (const part of entry.parts) {
      // botín premium: Alfas, doradas y cicatrizadas traen activas a nivel 2
      const premium = isAlfa || golden || nemesis;
      const level = premium && part.type !== 'eyes' && part.type !== 'ears' ? 2 : part.level;
      loadout[part.type] = level === part.level ? part : { ...part, level };
    }
  } else {
    archetype = rngPick(rng, AXIE_CLASSES);
    loadout = generatePreyLoadout(rng, archetype);
    if (golden) {
      for (const slot of Object.keys(loadout) as (keyof Loadout)[]) {
        const p = loadout[slot];
        if (p && p.type !== 'eyes' && p.type !== 'ears') loadout[slot] = { ...p, level: 2 };
      }
    }
  }
  const angle = rng() * Math.PI * 2;
  const hpScale = 1 + ENEMY_HP_SCALE_PER_WAVE * (wave - 1);
  const dmgScale = 1 + ENEMY_DMG_SCALE_PER_WAVE * (wave - 1);
  const primordial = isAlfa && wave >= FINAL_WAVE;
  const hp =
    ENEMY_BASE_HP *
    hpScale *
    (primordial ? PRIMORDIAL_HP_MULT : isAlfa ? ALFA_HP_MULT : 1) *
    (nemesis ? NEMESIS_HP_MULT : 1);
  // La Cicatriz: algunas presas duermen — acércate en silencio y el golpe es crítico
  // (doradas y cicatrizadas jamás duermen: unas escapan, otras te buscan)
  const sleeping =
    !isAlfa &&
    !golden &&
    !nemesis &&
    !feral && // el feral no duerme: caza
    territoryIndex(wave) === TERRITORIES.length - 1 &&
    rng() < SLEEP_CHANCE;
  return {
    id,
    archetype,
    genes,
    homeX: anchorX,
    homeY: anchorY,
    loadout,
    isAlfa,
    primordial,
    // la manada vive alrededor de SU ancla, no del jugador
    x: anchorX + Math.cos(angle) * HERD_SPAWN_RING * (0.5 + rng() * 0.5),
    y: anchorY + Math.sin(angle) * HERD_SPAWN_RING * (0.5 + rng() * 0.5),
    hp,
    maxHp: hp,
    contactDamage: ENEMY_CONTACT_DAMAGE * dmgScale * (isAlfa ? ALFA_DAMAGE_MULT : 1),
    attackCooldown: ENEMY_ATTACK_COOLDOWN_TICKS,
    knockdownTicks: 0,
    windupTicks: 0,
    knockbackTicks: 0,
    knockbackDirX: 0,
    knockbackDirY: 0,
    fleeing: !isAlfa && !sleeping,
    angryTicks: 0,
    stunTicks: 0,
    sleeping,
    poisonTicks: 0,
    golden,
    nemesis,
    bounty,
    wild,
    feral: feral && !golden, // la dorada nunca pelea, ni siendo feral
    patternCooldown: Math.round(BOSS_PATTERN_COOLDOWN_SECONDS * TICK_HZ * 0.5),
    chargeWarnTicks: 0,
    chargeTicks: 0,
    chargeDirX: 0,
    chargeDirY: 0,
    tiredTicks: 0,
    roarWarnTicks: 0,
  };
}

/**
 * Un tick de simulación. Orden fijo (importa para el determinismo):
 * oleada/spawns → jugador (esquiva, movimiento, ataque, canal) → enemigos
 * (derribo, persecución, golpe) → limpieza y fin de run.
 */
function mutCount(mutations: readonly MutationId[], id: MutationId): number {
  let n = 0;
  for (const m of mutations) if (m === id) n += 1;
  return n;
}

export function step(prev: SimState, input: PlayerInput, rng: Rng): SimState {
  // LA MUDA: el mundo espera tu elección
  if (prev.phase === 'molt') {
    const idx = input.chooseMutation;
    if (idx === null || !prev.moltChoices || !prev.moltChoices[idx]) return prev;
    // MUDA DORADA: a veces la elección aplica DOBLE — recompensa variable
    const goldenMolt = rng() < GOLDEN_MOLT_CHANCE;
    const chosen = prev.moltChoices[idx]!;
    return {
      ...prev,
      phase: 'running',
      mutations: goldenMolt ? [...prev.mutations, chosen, chosen] : [...prev.mutations, chosen],
      moltChoices: null,
      intermissionTicks: Math.round(WAVE_INTERMISSION_SECONDS * TICK_HZ),
      events: [{ type: 'molt', mutation: chosen, golden: goldenMolt }],
    };
  }
  if (prev.phase !== 'running') return prev;

  const events: SimEvent[] = [];
  const player: PlayerState = {
    ...prev.player,
    cooldowns: { ...prev.player.cooldowns },
    channel: prev.player.channel ? { ...prev.player.channel } : null,
  };
  let enemies: EnemyState[] = prev.enemies.map((e) => ({ ...e, loadout: { ...e.loadout } }));
  let wave = prev.wave;
  let intermissionTicks = prev.intermissionTicks;
  let alfaSpawnedWave = prev.alfaSpawnedWave;
  let alfaSpawnedCount = prev.alfaSpawnedCount;
  let bountyAssignedWave = prev.bountyAssignedWave;
  let waveStartTick = prev.waveStartTick;
  let nextEnemyId = prev.nextEnemyId;
  let score = prev.score;

  // ── Oleada: intermedio y goteo de spawns ──
  if (wave.pending === 0 && wave.alive === 0) {
    if (intermissionTicks > 0) {
      intermissionTicks -= 1;
      if (intermissionTicks === 0) {
        wave = startWave(wave.wave + 1);
        waveStartTick = prev.tick + 1; // arranca el reloj de CAZA VELOZ
        events.push({ type: 'waveStart', wave: wave.wave });
      }
    }
  }
  let budget = spawnBudget(wave);
  while (budget > 0) {
    if (alfaSpawnedWave !== wave.wave) {
      alfaSpawnedWave = wave.wave;
      alfaSpawnedCount = 0;
    }
    const alfaTarget =
      wave.wave === FINAL_WAVE ? FINAL_WAVE_ALFAS : isAlfaWave(wave.wave) ? 1 : 0;
    const wantAlfa = alfaSpawnedCount < alfaTarget;
    // PRESA MARCADA: la primera no-Alfa de cada manada lleva el bounty
    const wantBounty = !wantAlfa && bountyAssignedWave !== wave.wave;
    const anchor = prev.herds[wave.wave - 1] ?? { x: 0, y: 0 };
    const enemy = spawnEnemy(
      rng, wave.wave, nextEnemyId, wantAlfa, prev.catalog, anchor.x, anchor.y, wantBounty,
    );
    if (wantAlfa) alfaSpawnedCount += 1;
    if (wantBounty) bountyAssignedWave = wave.wave;
    nextEnemyId += 1;
    enemies.push(enemy);
    wave = applySpawns(wave, 1);
    events.push({
      type: 'spawn',
      enemyId: enemy.id,
      isAlfa: enemy.isAlfa,
      golden: enemy.golden,
      nemesis: enemy.nemesis,
      bounty: enemy.bounty,
    });
    budget -= 1;
  }

  // ── FAUNA SALVAJE: la luna repone presas errantes lejos de ti ──
  let wildRespawnTicks = Math.max(0, prev.wildRespawnTicks - 1);
  let goldenOwedTerr = prev.goldenOwedTerr;
  {
    const wildAlive = enemies.filter((e) => e.wild).length;
    if (wildAlive < WILD_COUNT && wildRespawnTicks === 0) {
      const a = rng() * Math.PI * 2;
      const d = WILD_MIN_DIST + rng() * (WILD_MAX_DIST - WILD_MIN_DIST);
      const [wx, wy] = clampToArena(
        player.x + Math.cos(a) * d,
        player.y + Math.sin(a) * d,
      );
      // el territorio paga su DORADA garantizada con el primer errante que nace
      const forceGolden = goldenOwedTerr === territoryIndex(wave.wave);
      if (forceGolden) goldenOwedTerr = -1;
      const wildOne = spawnEnemy(rng, wave.wave, nextEnemyId, false, prev.catalog, wx, wy, false, {
        wild: true,
        forceGolden,
        feral: rng() < WILD_FERAL_CHANCE,
      });
      nextEnemyId += 1;
      enemies.push(wildOne);
      events.push({
        type: 'spawn',
        enemyId: wildOne.id,
        isAlfa: false,
        golden: wildOne.golden,
        nemesis: wildOne.nemesis,
      });
      // el arranque llena rápido; después, goteo pausado
      wildRespawnTicks = Math.round(
        (wildAlive < WILD_COUNT - 1 ? 0.8 : WILD_RESPAWN_SECONDS) * TICK_HZ,
      );
    }
  }

  // ── Jugador: esquiva y movimiento ──
  const moveLen = len(input.moveX, input.moveY);
  const moveX = moveLen > 1 ? input.moveX / moveLen : input.moveX;
  const moveY = moveLen > 1 ? input.moveY / moveLen : input.moveY;

  if (player.dodgeCooldown > 0) player.dodgeCooldown -= 1;
  if (player.invulnTicks > 0) player.invulnTicks -= 1;
  if (player.momentumTicks > 0) player.momentumTicks -= 1;
  if (player.weaponTicks > 0) player.weaponTicks -= 1;
  const muts = prev.mutations;

  // ── ROVER: cazar y conducir son excluyentes — atacar/esquivar/cosechar desmonta ──
  let rover = { x: prev.rover.x, y: prev.rover.y };
  if (player.roverCooldown > 0) player.roverCooldown -= 1;
  if (player.riding && (input.attack !== null || input.interact !== null || input.dodge)) {
    player.riding = false;
    player.roverCooldown = Math.round(ROVER_MOUNT_COOLDOWN_SECONDS * TICK_HZ);
    rover = { x: player.x, y: player.y }; // aparca donde saltaste
    events.push({ type: 'roverDismount' });
  }
  if (input.dodge && player.dodgeTicks === 0 && player.dodgeCooldown === 0) {
    player.dodgeTicks = DODGE_TICKS;
    player.dodgeCooldown = Math.round(
      DODGE_COOLDOWN_TICKS * Math.pow(MUT_REFLEJOS_MUL, mutCount(muts, 'reflejos')),
    );
    if (moveLen > 0.01) {
      player.dodgeDirX = input.moveX / moveLen;
      player.dodgeDirY = input.moveY / moveLen;
    } else {
      player.dodgeDirX = player.faceX;
      player.dodgeDirY = player.faceY;
    }
    player.channel = null;
    player.knockbackTicks = 0; // esquivar corta el empujón
  }

  if (player.dodgeTicks > 0) {
    player.dodgeTicks -= 1;
    player.x += player.dodgeDirX * DODGE_SPEED * TICK_SECONDS;
    player.y += player.dodgeDirY * DODGE_SPEED * TICK_SECONDS;
  } else if (player.knockbackTicks > 0) {
    player.knockbackTicks -= 1;
    player.x += player.knockbackDirX * KNOCKBACK_SPEED * TICK_SECONDS;
    player.y += player.knockbackDirY * KNOCKBACK_SPEED * TICK_SECONDS;
  } else {
    const speed =
      PLAYER_SPEED *
      (1 + MUT_CAZADORA_SPEED * mutCount(muts, 'cazadora')) *
      (player.riding ? ROVER_SPEED_MUL : 1) *
      (player.momentumTicks > 0 ? 1 + MOMENTUM_SPEED_BONUS : 1); // FLUJO DE CAZA
    player.x += moveX * speed * TICK_SECONDS;
    player.y += moveY * speed * TICK_SECONDS;
    if (moveLen > 0.1) player.channel = null; // moverse interrumpe el canal
  }
  [player.x, player.y] = clampToArena(player.x, player.y);
  [player.x, player.y] = pushOut(player.x, player.y, prev.obstacles);

  // el rover viaja contigo; a pie, pisarlo en movimiento te sube
  if (player.riding) {
    rover = { x: player.x, y: player.y };
  } else if (
    player.roverCooldown === 0 &&
    moveLen > 0.1 &&
    len(player.x - rover.x, player.y - rover.y) <= ROVER_MOUNT_RANGE
  ) {
    player.riding = true;
    events.push({ type: 'roverMount' });
  }

  // ── Herramientas de la luna: pisar una la reclama ──
  let pickups: Pickup[] | null = null; // copia perezosa: solo si algo cambió
  let relicFound = false;
  prev.pickups.forEach((p, i) => {
    if (p.taken || pickups?.[i]?.taken) return;
    if (len(player.x - p.x, player.y - p.y) > PICKUP_RADIUS) return;
    if (!pickups) pickups = prev.pickups.map((q) => ({ ...q }));
    pickups[i] = { ...p, taken: true };
    events.push({ type: 'pickup', kind: p.kind, x: p.x, y: p.y });
    if (p.kind === 'heal') player.hp = Math.min(PLAYER_MAX_HP, player.hp + PICKUP_HEAL);
    else if (p.kind === 'ult') player.ult = Math.min(1, player.ult + PICKUP_ULT);
    else if (p.kind === 'fang')
      player.weaponTicks = Math.round(WEAPON_TOOL_SECONDS * TICK_HZ); // ¡ARMA!
    else relicFound = true; // RELIQUIA: tu cuerpo quiere cambiar (muda extra)
  });

  const aimLen = len(input.aimX, input.aimY);
  if (aimLen > 0.001) {
    player.faceX = input.aimX / aimLen;
    player.faceY = input.aimY / aimLen;
  }

  // ── Jugador: ataque ──
  for (const slot of ['mouth', 'horn', 'tail', 'back'] as const) {
    if (player.cooldowns[slot] > 0) player.cooldowns[slot] -= 1;
  }
  const knockedThisStep: number[] = [];
  let waveKills = 0; // solo la manada cuenta para la oleada (la fauna no)
  let landedAnyHit = false;
  let meteorForced: { x: number; y: number } | null = null; // llamado del Primordial
  let contract: Contract | null = prev.contract ? { ...prev.contract } : null;
  let contractJustDone = false;

  // ── Contrato de caza: uno nuevo al entrar a cada territorio ──
  const terrIdx = territoryIndex(wave.wave);
  if (!contract || contract.territory !== terrIdx) {
    if (contract && !contract.done) {
      if (contract.kind === 'no_devour' && !contract.failed) {
        contract.done = true; // sobreviviste el territorio sin devorar
        contractJustDone = true;
        events.push({ type: 'contractDone' });
      } else {
        events.push({ type: 'contractFail' });
      }
    }
    const terr = TERRITORIES[terrIdx]!;
    const roll = rng();
    if (roll < 0.4) {
      const cls = rngPick(rng, terr.classes as readonly AxieClass[]);
      contract = {
        kind: 'knock_class',
        cls,
        territory: terrIdx,
        text: `derriba ${CONTRACT_KNOCK_TARGET} presas ${cls}`,
        progress: 0,
        target: CONTRACT_KNOCK_TARGET,
        failed: false,
        done: false,
      };
    } else if (roll < 0.7) {
      const group = rngPick(rng, ['beast', 'aquatic', 'plant'] as const);
      contract = {
        kind: 'absorb_group',
        group,
        territory: terrIdx,
        text: `absorbe una parte del grupo ${group}`,
        progress: 0,
        target: 1,
        failed: false,
        done: false,
      };
    } else if (roll < 0.85) {
      contract = {
        kind: 'no_devour',
        territory: terrIdx,
        text: 'cruza este territorio sin devorar',
        progress: 0,
        target: 1,
        failed: false,
        done: false,
      };
    } else {
      contract = {
        kind: 'meteor_knock',
        territory: terrIdx,
        text: 'derriba 1 presa con un meteorito',
        progress: 0,
        target: 1,
        failed: false,
        done: false,
      };
    }
    events.push({ type: 'contractNew', text: contract.text });
  }
  // derribo centralizado (ataques, ultimate, meteoritos, veneno)
  const knockEnemy = (enemy: EnemyState, baseTicks: number): void => {
    enemy.knockdownTicks =
      baseTicks + Math.round(MUT_CARRONERA_SECONDS * TICK_HZ) * mutCount(muts, 'carronera');
    enemy.stunTicks = 0;
    enemy.sleeping = false;
    if (!enemy.wild) waveKills += 1;
    knockedThisStep.push(enemy.id);
    events.push({ type: 'knockdown', enemyId: enemy.id });
    for (const other of enemies) {
      if (other.id === enemy.id || other.knockdownTicks > 0) continue;
      if (len(other.x - enemy.x, other.y - enemy.y) <= AVENGE_RADIUS) {
        other.angryTicks = AVENGE_TICKS;
      }
    }
  };

  // ── ULTIMATE del dorso: se libera con la carga llena ──
  if (input.attack === 'back' && player.channel === null) {
    const part = player.loadout.back;
    if (part && player.ult >= 1) {
      player.ult = 0;
      events.push({ type: 'ultimate', cls: part.class, x: player.x, y: player.y });
      const inRadius = (e: EnemyState, r: number) =>
        e.knockdownTicks === 0 && len(e.x - player.x, e.y - player.y) <= r;
      const ultHit = (e: EnemyState, dmg: number): void => {
        const dealt = dmg * (e.archetype === 'plant' ? PLANT_PREY_ARMOR : 1);
        e.hp -= dealt;
        e.sleeping = false;
        events.push({ type: 'hit', enemyId: e.id, damage: dealt, crit: true });
        if (e.hp <= 0) knockEnemy(e, KNOCKDOWN_TICKS);
      };
      switch (part.class) {
        case 'beast': // RUGIDO: daño + azote masivo
          for (const e of enemies) {
            if (!inRadius(e, ULT_RADIUS)) continue;
            ultHit(e, ULT_DAMAGE);
            if (e.hp > 0) {
              const d = len(e.x - player.x, e.y - player.y);
              e.knockbackTicks = KNOCKBACK_TICKS * 3;
              e.knockbackDirX = d > 1e-6 ? (e.x - player.x) / d : 1;
              e.knockbackDirY = d > 1e-6 ? (e.y - player.y) / d : 0;
            }
          }
          break;
        case 'aquatic': { // MAREA: dash devastador en línea + esquiva lista
          const sx = player.x;
          const sy = player.y;
          player.x += player.faceX * ULT_DASH_DISTANCE;
          player.y += player.faceY * ULT_DASH_DISTANCE;
          [player.x, player.y] = clampToArena(player.x, player.y);
          [player.x, player.y] = pushOut(player.x, player.y, prev.obstacles);
          for (const e of enemies) {
            if (e.knockdownTicks > 0) continue;
            // distancia al segmento del dash
            const vx = player.x - sx;
            const vy = player.y - sy;
            const L2 = vx * vx + vy * vy;
            const t = L2 > 1e-6 ? Math.max(0, Math.min(1, ((e.x - sx) * vx + (e.y - sy) * vy) / L2)) : 0;
            if (len(e.x - (sx + vx * t), e.y - (sy + vy * t)) <= 1.7) ultHit(e, ULT_DAMAGE * 0.8);
          }
          player.dodgeCooldown = 0;
          break;
        }
        case 'plant': // ESPORAS: drena a la manada
          for (const e of enemies) {
            if (!inRadius(e, ULT_RADIUS)) continue;
            ultHit(e, ULT_DAMAGE * 0.7);
            player.hp = Math.min(PLAYER_MAX_HP, player.hp + ULT_HEAL_PER_HIT);
          }
          break;
        case 'bird': { // TORMENTA: ráfaga de plumas repartida
          const targets = enemies.filter((e) => inRadius(e, ULT_RADIUS + 2));
          for (let k = 0; k < ULT_BIRD_HITS && targets.length > 0; k += 1) {
            const t = targets[k % targets.length]!;
            if (t.knockdownTicks === 0) ultHit(t, ULT_BIRD_DMG);
          }
          break;
        }
        case 'bug': // PLAGA: veneno a todo lo cercano
          for (const e of enemies) {
            if (!inRadius(e, ULT_RADIUS)) continue;
            ultHit(e, 10);
            if (e.hp > 0) e.poisonTicks = Math.round(ULT_POISON_SECONDS * TICK_HZ);
          }
          break;
        case 'reptile': // PARÁLISIS: aturde a la manada entera
          for (const e of enemies) {
            if (!inRadius(e, ULT_RADIUS)) continue;
            ultHit(e, 12);
            if (e.hp > 0) {
              e.stunTicks = Math.round(ULT_STUN_SECONDS * TICK_HZ);
              e.windupTicks = 0;
            }
          }
          break;
      }
    }
  }

  const attackPart =
    input.attack && input.attack !== 'back' ? player.loadout[input.attack] : undefined;
  if (input.attack && input.attack !== 'back' && attackPart && player.cooldowns[input.attack] === 0 && player.channel === null) {
    const slot = input.attack;
    const part = attackPart;
    const base = ABILITY_BASE[slot];
    const delta = CLASS_DELTA[part.class];
    const synergy = synergyMultiplier(player.loadout);
    const levelMul = 1 + PART_LEVEL_DAMAGE_BONUS * (part.level - 1);
    // mutaciones: SED acumulable + FURIA con vida baja
    const mutMul =
      (1 + MUT_SED_DAMAGE * mutCount(muts, 'sed')) *
      (mutCount(muts, 'furia') > 0 && player.hp < PLAYER_MAX_HP * MUT_FURIA_HP
        ? 1 + MUT_FURIA_DAMAGE
        : 1) *
      (player.weaponTicks > 0 ? WEAPON_TOOL_MULT : 1); // el COLMILLO muerde por ti
    const damage = base.damage * delta.damageMul * synergy * levelMul * mutMul;
    const range = base.range * delta.rangeMul;
    const arcCos = Math.cos(((base.arcDegrees / 2) * Math.PI) / 180);
    player.cooldowns[slot] = Math.round(base.cooldownSeconds * delta.cooldownMul * TICK_HZ);
    // zarpazo magnético: dentro del cono gana la presa MÁS ALINEADA con el
    // encare (la marcada tiene dot≈1 y siempre gana), no la más cercana —
    // si no, el zarpazo se iba hacia otra presa de reojo.
    let magnet: EnemyState | null = null;
    let magnetD = 0;
    let magnetScore = -Infinity;
    const lungeMax = ATTACK_LUNGE_MAX + MUT_ZARPA_BONUS * mutCount(muts, 'zarpa');
    const maxReach = range + lungeMax;
    for (const enemy of enemies) {
      if (enemy.knockdownTicks > 0 || enemy.hp <= 0) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = len(dx, dy);
      if (d >= maxReach || d < 1e-6) continue;
      const dot = (dx / d) * player.faceX + (dy / d) * player.faceY;
      if (dot < ATTACK_MAGNET_CONE_COS) continue;
      const score = dot - (d / maxReach) * 0.05; // alineación manda; distancia desempata
      if (score <= magnetScore) continue;
      magnet = enemy;
      magnetD = d;
      magnetScore = score;
    }
    let lunge = ATTACK_LUNGE_BASE;
    if (magnet) {
      player.faceX = (magnet.x - player.x) / magnetD;
      player.faceY = (magnet.y - player.y) / magnetD;
      if (magnetD > range * ATTACK_MAGNET_STOP) {
        lunge = Math.min(lungeMax, magnetD - range * ATTACK_MAGNET_STOP);
      } else {
        lunge = 0;
      }
    }
    player.x += player.faceX * lunge;
    player.y += player.faceY * lunge;
    [player.x, player.y] = clampToArena(player.x, player.y);
    [player.x, player.y] = pushOut(player.x, player.y, prev.obstacles);
    events.push({ type: 'attack', slot, range, arcDegrees: base.arcDegrees });

    // CRÍTICO: un tiro por zarpazo; garantizado tras esquiva perfecta,
    // contra exhaustos (jefes cansados) y contra dormidas
    const swingCrit = player.critNext || rng() < CRIT_CHANCE;
    player.critNext = false;
    for (const enemy of enemies) {
      if (enemy.knockdownTicks > 0 || enemy.hp <= 0) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const d = len(dx, dy);
      if (d > range) continue;
      const inArc =
        base.arcDegrees >= 360 ||
        (d > 1e-6 && (dx / d) * player.faceX + (dy / d) * player.faceY >= arcCos) ||
        d <= 1e-6;
      if (!inArc) continue;
      const crit = swingCrit || enemy.tiredTicks > 0 || enemy.sleeping;
      // plant se hace bola: recibe menos daño de tus golpes
      const dealt =
        damage * (enemy.archetype === 'plant' ? PLANT_PREY_ARMOR : 1) * (crit ? CRIT_MULT : 1);
      enemy.hp -= dealt;
      enemy.sleeping = false; // el golpe la despierta (tarde)
      landedAnyHit = true;
      events.push({ type: 'hit', enemyId: enemy.id, damage: dealt, crit });
      if (delta.lifesteal > 0) {
        player.hp = Math.min(PLAYER_MAX_HP, player.hp + damage * delta.lifesteal);
      }
      if (enemy.hp <= 0) {
        knockEnemy(enemy, Math.round(KNOCKDOWN_TICKS * delta.knockdownMul));
      } else {
        // empujón corto; beast AZOTA: la presa sale volando el doble de tiempo
        enemy.knockbackTicks =
          KNOCKBACK_TICKS * (part.class === 'beast' ? BEAST_KNOCKBACK_TICKS_MUL : 1);
        enemy.knockbackDirX = d > 1e-6 ? dx / d : player.faceX;
        enemy.knockbackDirY = d > 1e-6 ? dy / d : player.faceY;
      }
    }
    // aquatic: conectar RESETEA tu esquiva — el build de movilidad
    if (landedAnyHit && part.class === 'aquatic') player.dodgeCooldown = 0;
    // FLUJO DE CAZA: conectar te acelera un instante — el combate FLUYE
    if (landedAnyHit) player.momentumTicks = Math.round(MOMENTUM_SECONDS * TICK_HZ);
  }

  // ── Jugador: canal de arrancar/devorar ──
  const devoured = new Set<number>();
  if (input.interact === null) {
    player.channel = null;
  } else {
    const current = player.channel;
    const sameIntent =
      current !== null &&
      current.intent.kind === input.interact.kind &&
      (current.intent.kind !== 'rip' ||
        (input.interact.kind === 'rip' && current.intent.slot === input.interact.slot));
    if (!sameIntent) {
      // buscar presa derribada más cercana al alcance
      let best: EnemyState | null = null;
      let bestD = INTERACT_RANGE;
      for (const enemy of enemies) {
        if (enemy.knockdownTicks <= 0) continue;
        const d = len(enemy.x - player.x, enemy.y - player.y);
        if (d <= bestD) {
          bestD = d;
          best = enemy;
        }
      }
      player.channel = best ? { intent: input.interact, targetId: best.id, ticksLeft: CHANNEL_TICKS } : null;
    }
    if (player.channel) {
      const target = enemies.find((e) => e.id === player.channel!.targetId);
      const targetValid =
        target !== undefined &&
        target.knockdownTicks > 0 &&
        len(target.x - player.x, target.y - player.y) <= INTERACT_RANGE;
      if (!targetValid) {
        player.channel = null;
      } else {
        player.channel.ticksLeft -= 1;
        if (player.channel.ticksLeft <= 0) {
          const intent = player.channel.intent;
          if (intent.kind === 'devour') {
            const heal =
              devourHealFraction(target.loadout) * PLAYER_MAX_HP +
              MUT_VORAZ_HEAL * mutCount(muts, 'voraz');
            player.hp = Math.min(PLAYER_MAX_HP, player.hp + heal);
            devoured.add(target.id);
            events.push({ type: 'devour', enemyId: target.id, heal });
          } else {
            const part = target.loadout[intent.slot];
            if (part) {
              const current = player.loadout[intent.slot];
              let outcome: 'equip' | 'swap' | 'assimilate';
              if (!current) {
                // ranura vacía: la habilidad se desbloquea
                player.loadout = { ...player.loadout, [intent.slot]: part };
                outcome = 'equip';
              } else if (classGroup(part.class) === classGroup(current.class)) {
                // mismo grupo: la Quimera asimila — su parte crece de nivel
                const level = Math.min(PART_MAX_LEVEL, Math.max(current.level + 1, part.level));
                player.loadout = { ...player.loadout, [intent.slot]: { ...current, level } };
                outcome = 'assimilate';
              } else {
                // grupo distinto: cambio de parte (sidegrade)
                player.loadout = { ...player.loadout, [intent.slot]: part };
                outcome = 'swap';
              }
              delete target.loadout[intent.slot];
              events.push({
                type: 'rip',
                enemyId: target.id,
                slot: intent.slot,
                partId: part.id,
                outcome,
                level: player.loadout[intent.slot]!.level,
              });
            }
          }
          player.channel = null;
        }
      }
    }
  }

  // ── Enemigos ──
  // Modo APEX (sinergia 4/4): las presas de tu grupo dominante te temen
  const apexDom = dominantGroup(player.loadout);
  const apexGroup = apexDom.count >= 4 ? apexDom.group : null;
  const expired = new Set<number>();
  for (const enemy of enemies) {
    if (devoured.has(enemy.id)) continue;
    // el tick del derribo no consume ventana: la presa cae con KNOCKDOWN completo
    if (knockedThisStep.includes(enemy.id)) continue;
    if (enemy.knockdownTicks > 0) {
      enemy.knockdownTicks -= 1;
      if (enemy.knockdownTicks === 0) {
        expired.add(enemy.id); // la presa se disuelve sin recompensa
        events.push({ type: 'expired', enemyId: enemy.id });
      }
      continue;
    }
    if (enemy.attackCooldown > 0) enemy.attackCooldown -= 1;

    // VENENO: gotea vida por tick (puede derribar)
    if (enemy.poisonTicks > 0) {
      enemy.poisonTicks -= 1;
      enemy.hp -= POISON_DPS * TICK_SECONDS;
      if (enemy.hp <= 0 && !knockedThisStep.includes(enemy.id)) {
        knockEnemy(enemy, Math.round(KNOCKDOWN_SECONDS * TICK_HZ));
        continue;
      }
    }
    // ATURDIDA: quieta e indefensa (el windup se cancela)
    if (enemy.stunTicks > 0) {
      enemy.stunTicks -= 1;
      enemy.windupTicks = 0;
      enemy.fleeing = false;
      continue;
    }
    // DORMIDA: no hace nada hasta que te acercas (o la golpeas)
    if (enemy.sleeping) {
      enemy.fleeing = false;
      if (len(player.x - enemy.x, player.y - enemy.y) <= SLEEP_WAKE_RANGE) {
        enemy.sleeping = false;
        events.push({ type: 'wake', enemyId: enemy.id });
      } else {
        continue;
      }
    }
    // ── Patrones de jefe (Guardianes / Alfa Primordial) ──
    if (enemy.isAlfa) {
      if (enemy.tiredTicks > 0) {
        enemy.tiredTicks -= 1; // exhausto: ventana de crítico, no actúa
        enemy.fleeing = false;
        continue;
      }
      if (enemy.chargeTicks > 0) {
        enemy.chargeTicks -= 1;
        const beforeX = enemy.x;
        const beforeY = enemy.y;
        enemy.x += enemy.chargeDirX * BOSS_CHARGE_SPEED * TICK_SECONDS;
        enemy.y += enemy.chargeDirY * BOSS_CHARGE_SPEED * TICK_SECONDS;
        [enemy.x, enemy.y] = clampToArena(enemy.x, enemy.y);
        [enemy.x, enemy.y] = pushOut(enemy.x, enemy.y, prev.obstacles);
        const moved = len(enemy.x - beforeX, enemy.y - beforeY);
        if (moved < BOSS_CHARGE_SPEED * TICK_SECONDS * 0.4) {
          // ¡SE ESTRELLÓ contra una roca o el borde! Aturdido largo
          enemy.chargeTicks = 0;
          enemy.stunTicks = Math.round(CHARGE_CRASH_STUN_SECONDS * TICK_HZ);
          events.push({ type: 'bossCrash', enemyId: enemy.id });
          continue;
        }
        // arrollar al jugador
        if (
          len(player.x - enemy.x, player.y - enemy.y) <= 1.3 &&
          player.dodgeTicks === 0 &&
          player.invulnTicks === 0
        ) {
          const hide = Math.pow(MUT_PIEL_REDUCTION, mutCount(muts, 'piel'));
          player.hp -= BOSS_CHARGE_DAMAGE * hide;
          player.channel = null;
          player.knockbackTicks = KNOCKBACK_TICKS * 2;
          const pd2 = len(player.x - enemy.x, player.y - enemy.y);
          player.knockbackDirX = pd2 > 1e-6 ? (player.x - enemy.x) / pd2 : 1;
          player.knockbackDirY = pd2 > 1e-6 ? (player.y - enemy.y) / pd2 : 0;
          events.push({ type: 'playerHurt', damage: BOSS_CHARGE_DAMAGE * hide });
          enemy.chargeTicks = 0;
          enemy.tiredTicks = Math.round(BOSS_TIRED_SECONDS * TICK_HZ);
        }
        if (enemy.chargeTicks === 0 && enemy.stunTicks === 0 && enemy.tiredTicks === 0) {
          enemy.tiredTicks = Math.round(BOSS_TIRED_SECONDS * TICK_HZ); // terminó: exhausto
        }
        continue;
      }
      if (enemy.chargeWarnTicks > 0) {
        enemy.chargeWarnTicks -= 1;
        enemy.fleeing = false;
        if (enemy.chargeWarnTicks === 0) enemy.chargeTicks = Math.round(BOSS_CHARGE_SECONDS * TICK_HZ);
        continue; // plantado apuntándote: ESQUÍVALO
      }
      if (enemy.roarWarnTicks > 0) {
        enemy.roarWarnTicks -= 1;
        enemy.fleeing = false;
        if (enemy.roarWarnTicks === 0) {
          events.push({ type: 'bossRoar', enemyId: enemy.id });
          for (const other of enemies) {
            if (other.id === enemy.id || other.knockdownTicks > 0) continue;
            if (len(other.x - enemy.x, other.y - enemy.y) <= BOSS_ROAR_RADIUS) {
              other.angryTicks = AVENGE_TICKS;
              other.sleeping = false;
            }
          }
          const pd3 = len(player.x - enemy.x, player.y - enemy.y);
          if (pd3 <= 4 && player.dodgeTicks === 0) {
            player.knockbackTicks = KNOCKBACK_TICKS * 2;
            player.knockbackDirX = pd3 > 1e-6 ? (player.x - enemy.x) / pd3 : 1;
            player.knockbackDirY = pd3 > 1e-6 ? (player.y - enemy.y) / pd3 : 0;
          }
        }
        continue;
      }
      if (enemy.patternCooldown > 0) enemy.patternCooldown -= 1;
      const pd4 = len(player.x - enemy.x, player.y - enemy.y);
      if (enemy.patternCooldown === 0 && pd4 <= BOSS_PATTERN_RANGE && pd4 > 1e-6) {
        enemy.patternCooldown = Math.round(BOSS_PATTERN_COOLDOWN_SECONDS * TICK_HZ);
        const roll = rng();
        if (roll < 0.55) {
          // CARGA: fija la dirección AHORA — muévete
          enemy.chargeWarnTicks = Math.round(BOSS_CHARGE_WARN_SECONDS * TICK_HZ);
          enemy.chargeDirX = (player.x - enemy.x) / pd4;
          enemy.chargeDirY = (player.y - enemy.y) / pd4;
          events.push({
            type: 'bossChargeWarn',
            enemyId: enemy.id,
            dirX: enemy.chargeDirX,
            dirY: enemy.chargeDirY,
          });
          continue;
        } else if (roll < 0.85 || !enemy.primordial) {
          enemy.roarWarnTicks = Math.round(BOSS_ROAR_WARN_SECONDS * TICK_HZ);
          events.push({ type: 'bossRoarWarn', enemyId: enemy.id });
          continue;
        } else if (!meteorForced) {
          // solo el PRIMORDIAL: llama un meteorito sobre ti
          meteorForced = { x: player.x, y: player.y };
        }
      }
    }
    // MIEDO: la dorada jamás pelea; en modo APEX (4/4) tu grupo dominante te
    // teme — pero un animal aterrado y ACORRALADO todavía muerde (si no, el
    // apex elimina el daño entrante y el balance se desfonda: medido +30% win)
    const apexFeared =
      apexGroup !== null &&
      !enemy.isAlfa &&
      !enemy.nemesis &&
      classGroup(enemy.archetype) === apexGroup;
    // acorralada = pegada de verdad al límite de su querencia
    const corneredNow =
      len(enemy.x - enemy.homeX, enemy.y - enemy.homeY) > HERD_HOME_RADIUS - 0.8;
    const feared = enemy.golden || (apexFeared && !corneredNow);
    // knockback recibido: desplaza y suprime persecución; el windup sigue corriendo
    if (enemy.knockbackTicks > 0) {
      enemy.knockbackTicks -= 1;
      enemy.x += enemy.knockbackDirX * ENEMY_KNOCKBACK_SPEED * TICK_SECONDS;
      enemy.y += enemy.knockbackDirY * ENEMY_KNOCKBACK_SPEED * TICK_SECONDS;
    } else if (enemy.windupTicks === 0) {
      const cx = player.x - enemy.x;
      const cy = player.y - enemy.y;
      const cd = len(cx, cy);
      // La caza invertida: la presa huye; pelea solo si el Alfa es ella, si la
      // Quimera está encima, o si está acorralada contra el borde.
      const centerDist = len(enemy.x, enemy.y);
      const nearEdge = centerDist > ARENA_RADIUS - ARENA_EDGE_MARGIN;
      if (enemy.angryTicks > 0) enemy.angryTicks -= 1;
      // Personalidad por clase: cada presa se caza distinto.
      // beast se planta antes; reptile nunca huye (acecha inmóvil hasta que llegas)
      const fightRange =
        ENEMY_FIGHT_RANGE *
        (enemy.archetype === 'beast'
          ? BEAST_BRAVE_RANGE_MUL
          : enemy.archetype === 'reptile'
            ? REPTILE_AMBUSH_RANGE_MUL
            : 1) *
        (enemy.nemesis ? NEMESIS_FIGHT_RANGE_MUL : 1); // te recuerda: viene por ti
      const scared = enemy.golden || (apexFeared && !(corneredNow && cd <= ENEMY_CORNERED_RANGE));
      const fights =
        !scared &&
        (enemy.isAlfa ||
          enemy.angryTicks > 0 ||
          (enemy.feral && cd <= FERAL_HUNT_RANGE) || // el feral te huele y viene
          cd <= fightRange ||
          (corneredNow && cd <= ENEMY_CORNERED_RANGE));
      const ambushing = !fights && enemy.archetype === 'reptile'; // quieta, mirándote
      enemy.fleeing = !fights && !ambushing;
      if (fights) {
        if (cd > ENEMY_ATTACK_RANGE * 0.8 && cd > 1e-6) {
          const speed = ENEMY_SPEED * (enemy.isAlfa ? ALFA_SPEED_MULT : 1);
          enemy.x += (cx / cd) * speed * TICK_SECONDS;
          enemy.y += (cy / cd) * speed * TICK_SECONDS;
        }
      } else if (!ambushing && cd > 1e-6) {
        let fxDir = -cx / cd;
        let fyDir = -cy / cd;
        // QUERENCIA: la presa no abandona el territorio de su manada — al
        // llegar al límite arquea rodeando su hogar (cazable por intercepción;
        // sin esto, la luna abierta volvía toda persecución infinita)
        const hx = enemy.x - enemy.homeX;
        const hy = enemy.y - enemy.homeY;
        const hd = len(hx, hy);
        if (hd > HERD_HOME_RADIUS && hd > 1e-6) {
          let tx = -hy / hd;
          let ty = hx / hd;
          if (tx * fxDir + ty * fyDir < 0) {
            tx = -tx;
            ty = -ty;
          }
          fxDir = tx * 0.75 - (hx / hd) * 0.65;
          fyDir = ty * 0.75 - (hy / hd) * 0.65;
          const fl = len(fxDir, fyDir);
          fxDir /= fl;
          fyDir /= fl;
        }
        // bird: zigzag (componente perpendicular senoidal); determinista por id
        if (enemy.archetype === 'bird') {
          const weave = Math.sin(prev.tick * 0.09 + enemy.id * 1.7) * BIRD_ZIGZAG_AMPLITUDE;
          const perpX = -fyDir;
          const perpY = fxDir;
          fxDir += perpX * weave;
          fyDir += perpY * weave;
          const fl = len(fxDir, fyDir);
          fxDir /= fl;
          fyDir /= fl;
        }
        let fleeSpeed = ENEMY_FLEE_SPEED;
        if (enemy.archetype === 'aquatic') fleeSpeed *= FLEE_AQUATIC_SPEED_MUL;
        else if (enemy.archetype === 'plant') fleeSpeed *= FLEE_PLANT_SPEED_MUL;
        else if (enemy.archetype === 'bug') {
          // arranques y pausas: sprint nervioso
          fleeSpeed *=
            Math.sin(prev.tick * 0.12 + enemy.id * 2.3) > -0.25 ? BUG_SPRINT_MUL : BUG_PAUSE_MUL;
        }
        if (enemy.golden) {
          // ¡se te va, se te va! — pero siempre alcanzable (si no, atora la oleada)
          fleeSpeed = Math.min(fleeSpeed * GOLDEN_FLEE_MUL, PLAYER_SPEED * GOLDEN_FLEE_CAP);
        }
        enemy.x += fxDir * fleeSpeed * TICK_SECONDS;
        enemy.y += fyDir * fleeSpeed * TICK_SECONDS;
      }
    } else {
      enemy.fleeing = false; // en wind-up: plantada, peleando
    }
    [enemy.x, enemy.y] = clampToArena(enemy.x, enemy.y);
    [enemy.x, enemy.y] = pushOut(enemy.x, enemy.y, prev.obstacles);

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const d = len(dx, dy);

    if (enemy.windupTicks > 0) {
      enemy.windupTicks -= 1;
      if (enemy.windupTicks === 0) {
        // el golpe se resuelve: conecta solo si el jugador sigue cerca y no esquiva
        enemy.attackCooldown = ENEMY_ATTACK_COOLDOWN_TICKS;
        if (
          d <= ENEMY_ATTACK_RANGE * ENEMY_STRIKE_GRACE &&
          player.dodgeTicks > DODGE_TICKS - PERFECT_DODGE_WINDOW_TICKS
        ) {
          // ¡ESQUIVA PERFECTA! El atacante queda aturdido y tu golpe se carga
          enemy.stunTicks = Math.round(STUN_SECONDS * TICK_HZ);
          player.critNext = true;
          events.push({ type: 'perfectDodge', enemyId: enemy.id });
        } else if (
          d <= ENEMY_ATTACK_RANGE * ENEMY_STRIKE_GRACE &&
          player.dodgeTicks === 0 &&
          player.invulnTicks === 0
        ) {
          const fury = enemy.angryTicks > 0 ? ANGRY_DAMAGE_MULT : 1;
          const ambush = enemy.archetype === 'reptile' ? REPTILE_STRIKE_MUL : 1;
          const hide = Math.pow(MUT_PIEL_REDUCTION, mutCount(muts, 'piel'));
          player.hp -= enemy.contactDamage * fury * ambush * hide;
          // el canal de cosecha NO se cancela por daño: tragar bajo fuego
          // cuesta la vida que te quitan mientras, no el canal
          player.knockbackTicks = KNOCKBACK_TICKS;
          player.knockbackDirX = d > 1e-6 ? -dx / d : -player.faceX;
          player.knockbackDirY = d > 1e-6 ? -dy / d : -player.faceY;
          events.push({ type: 'playerHurt', damage: enemy.contactDamage * fury * ambush });
        }
      }
    } else if (
      !feared && // una presa con miedo nunca lanza el golpe
      enemy.knockbackTicks === 0 &&
      d <= ENEMY_ATTACK_RANGE &&
      enemy.attackCooldown === 0
    ) {
      enemy.windupTicks = TELEGRAPH_TICKS;
      events.push({ type: 'telegraph', enemyId: enemy.id });
    }
  }

  // ── Separación entre presas activas (no se apilan) ──
  const standing = enemies.filter(
    (e) => e.knockdownTicks === 0 && !devoured.has(e.id) && !knockedThisStep.includes(e.id),
  );
  for (let i = 0; i < standing.length; i += 1) {
    for (let j = i + 1; j < standing.length; j += 1) {
      const a = standing[i]!;
      const b = standing[j]!;
      const sx = b.x - a.x;
      const sy = b.y - a.y;
      const sd = len(sx, sy);
      if (sd >= ENEMY_SEPARATION_RADIUS) continue;
      // dirección determinista incluso con solape exacto
      const nx = sd > 1e-6 ? sx / sd : 1;
      const ny = sd > 1e-6 ? sy / sd : 0;
      const push = (ENEMY_SEPARATION_RADIUS - sd) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      [a.x, a.y] = clampToArena(a.x, a.y);
      [b.x, b.y] = clampToArena(b.x, b.y);
      [a.x, a.y] = pushOut(a.x, a.y, prev.obstacles);
      [b.x, b.y] = pushOut(b.x, b.y, prev.obstacles);
    }
  }

  // ── Meteorito: aviso → impacto (daña a la Quimera; derriba presas) ──
  let meteor: MeteorState | null = prev.meteor ? { ...prev.meteor } : null;
  let meteorCooldown = prev.meteorCooldown;
  if (!meteor && meteorForced) {
    // el ALFA PRIMORDIAL llama fuego del cielo sobre ti
    meteor = { x: meteorForced.x, y: meteorForced.y, ticksLeft: METEOR_WARN_TICKS };
    events.push({ type: 'meteorWarn', x: meteor.x, y: meteor.y });
  } else if (!meteor) {
    meteorCooldown -= 1;
    if (meteorCooldown <= 0) {
      // en la luna abierta el fuego te SIGUE: cae cerca del jugador
      const angle = rng() * Math.PI * 2;
      const dist = rng() * METEOR_NEAR_PLAYER;
      const [mx, my] = clampToArena(
        player.x + Math.cos(angle) * dist,
        player.y + Math.sin(angle) * dist,
      );
      meteor = { x: mx, y: my, ticksLeft: METEOR_WARN_TICKS };
      events.push({ type: 'meteorWarn', x: meteor.x, y: meteor.y });
    }
  } else {
    meteor.ticksLeft -= 1;
    if (meteor.ticksLeft <= 0) {
      events.push({ type: 'meteorHit', x: meteor.x, y: meteor.y });
      const pd = len(player.x - meteor.x, player.y - meteor.y);
      if (pd <= METEOR_RADIUS && player.dodgeTicks === 0 && player.invulnTicks === 0) {
        player.hp -= METEOR_DAMAGE_PLAYER * Math.pow(MUT_PIEL_REDUCTION, mutCount(muts, 'piel'));
        player.knockbackTicks = KNOCKBACK_TICKS;
        player.knockbackDirX = pd > 1e-6 ? (player.x - meteor.x) / pd : 1;
        player.knockbackDirY = pd > 1e-6 ? (player.y - meteor.y) / pd : 0;
        events.push({ type: 'playerHurt', damage: METEOR_DAMAGE_PLAYER });
      }
      for (const enemy of enemies) {
        if (enemy.knockdownTicks > 0 || devoured.has(enemy.id)) continue;
        if (knockedThisStep.includes(enemy.id)) continue;
        if (len(enemy.x - meteor.x, enemy.y - meteor.y) > METEOR_RADIUS) continue;
        enemy.hp -= METEOR_DAMAGE_PREY;
        enemy.sleeping = false;
        events.push({ type: 'hit', enemyId: enemy.id, damage: METEOR_DAMAGE_PREY });
        if (enemy.hp <= 0) {
          knockEnemy(enemy, Math.round(KNOCKDOWN_SECONDS * TICK_HZ));
          if (contract && contract.kind === 'meteor_knock' && !contract.done) {
            contract.progress += 1;
            if (contract.progress >= contract.target) {
              contract.done = true;
              contractJustDone = true;
              events.push({ type: 'contractDone' });
            }
          }
        }
      }
      meteor = null;
      // cada territorio tiene su clima: el Mar de Polvo llueve fuego
      meteorCooldown = Math.round(
        METEOR_INTERVAL_SECONDS * TERRITORIES[terrIdx]!.meteorMul * TICK_HZ * (0.6 + rng() * 0.8),
      );
    }
  }

  // ── Limpieza y contabilidad de oleada ──
  // El derribo cuenta como baja (sale del combate); devorar/disolverse solo retira el cuerpo.
  if (waveKills > 0) wave = applyDeaths(wave, waveKills);
  enemies = enemies.filter((e) => !devoured.has(e.id) && !expired.has(e.id));

  let phase: SimState['phase'] = 'running';
  let moltChoices = prev.moltChoices;
  let moltDoneWave = prev.moltDoneWave;
  if (wave.pending === 0 && wave.alive === 0) {
    if (wave.wave >= FINAL_WAVE) {
      // limpiar la oleada final = victoria (los cuerpos derribados no cuentan)
      phase = 'victory';
      events.push({ type: 'victory' });
      score += SCORE_WAVE_CLEAR + SCORE_VICTORY;
    } else if (intermissionTicks === 0 && moltDoneWave < wave.wave) {
      // oleada limpia: se espera a que coseches los cuerpos, y entonces LA MUDA
      // la fauna salvaje no bloquea la muda: solo cuentan los cuerpos de la manada
      if (enemies.filter((e) => !e.wild).length === 0) {
        moltDoneWave = wave.wave;
        // CAZA VELOZ: limpiar la manada a ritmo premia el flow
        if (prev.tick - waveStartTick < FAST_CLEAR_SECONDS * TICK_HZ) {
          score += FAST_CLEAR_SCORE;
          events.push({ type: 'fastClear' });
        }
        const pool = [...MUTATION_IDS];
        const drawn: MutationId[] = [];
        for (let k = 0; k < 3 && pool.length > 0; k += 1) {
          const i = rngInt(rng, pool.length);
          drawn.push(pool[i]!);
          pool.splice(i, 1);
        }
        moltChoices = drawn;
        phase = 'molt';
        events.push({ type: 'moltOffer', choices: drawn });
        score += SCORE_WAVE_CLEAR;
      }
      // con cuerpos aún en el suelo: sin intermedio — cosecha en paz
    }
  }

  // ── Puntaje, carga de ultimate y progreso de contrato por eventos ──
  for (const event of events) {
    if (event.type === 'knockdown') {
      const target = enemies.find((e) => e.id === event.enemyId);
      score +=
        SCORE_KNOCKDOWN +
        (target?.isAlfa ? SCORE_ALFA_BONUS : 0) +
        (target?.golden ? SCORE_GOLDEN : 0) +
        (target?.nemesis ? SCORE_NEMESIS : 0) +
        (target?.bounty ? BOUNTY_SCORE : 0);
      player.ult = Math.min(
        1,
        player.ult + ULT_CHARGE_KNOCKDOWN + (target?.bounty ? BOUNTY_ULT : 0),
      );
      // SED DEL DEPREDADOR: agredir cura — cazar es sobrevivir
      player.hp = Math.min(PLAYER_MAX_HP, player.hp + KNOCKDOWN_HEAL);
      // BOTÍN DEL GUARDIÁN: el jefe caído suelta una RELIQUIA
      if (target?.isAlfa) {
        if (!pickups) pickups = prev.pickups.map((q) => ({ ...q }));
        pickups.push({ x: target.x, y: target.y, kind: 'relic', taken: false });
      }
      if (
        contract &&
        contract.kind === 'knock_class' &&
        !contract.done &&
        target?.archetype === contract.cls
      ) {
        contract.progress += 1;
        if (contract.progress >= contract.target) {
          contract.done = true;
          contractJustDone = true;
          events.push({ type: 'contractDone' });
        }
      }
    } else if (event.type === 'rip') {
      score += event.outcome === 'assimilate' ? SCORE_ASSIMILATE : SCORE_RIP;
      player.ult = Math.min(1, player.ult + ULT_CHARGE_RIP);
      if (contract && contract.kind === 'absorb_group' && !contract.done) {
        const grafted = player.loadout[event.slot];
        if (grafted && classGroup(grafted.class) === contract.group) {
          contract.done = true;
          contractJustDone = true;
          events.push({ type: 'contractDone' });
        }
      }
    } else if (event.type === 'devour') {
      score += SCORE_DEVOUR;
      player.ult = Math.min(1, player.ult + ULT_CHARGE_DEVOUR);
      if (contract && contract.kind === 'no_devour' && !contract.done && !contract.failed) {
        contract.failed = true;
        events.push({ type: 'contractFail' });
      }
    }
  }
  // contrato cumplido o RELIQUIA pisada = MUDA EXTRA inmediata (el mundo espera)
  if ((contractJustDone || relicFound) && phase === 'running') {
    const pool = [...MUTATION_IDS];
    const drawn: MutationId[] = [];
    for (let k = 0; k < 3 && pool.length > 0; k += 1) {
      const i = rngInt(rng, pool.length);
      drawn.push(pool[i]!);
      pool.splice(i, 1);
    }
    moltChoices = drawn;
    phase = 'molt';
    events.push({ type: 'moltOffer', choices: drawn });
  }

  // recibir daño a bordo = el golpe te tira del rover (queda aparcado aquí)
  if (player.riding && player.hp < prev.player.hp) {
    player.riding = false;
    player.roverCooldown = Math.round(ROVER_MOUNT_COOLDOWN_SECONDS * TICK_HZ);
    events.push({ type: 'roverDismount' });
  }

  if (player.hp <= 0) {
    if (!player.revived) {
      // INSTINTO SALVAJE: la Quimera se niega a morir — UNA vez por cacería
      player.revived = true;
      player.hp = PLAYER_MAX_HP * SECOND_WIND_HP_FRACTION;
      player.invulnTicks = Math.round(SECOND_WIND_INVULN_SECONDS * TICK_HZ);
      player.knockbackTicks = 0;
      events.push({ type: 'secondWind' });
    } else {
      player.hp = 0;
      phase = 'dead'; // morir pisa cualquier victoria o muda simultánea
      events.push({ type: 'death' });
    }
  }

  return {
    tick: prev.tick + 1,
    phase,
    wave,
    intermissionTicks,
    obstacles: prev.obstacles,
    herds: prev.herds,
    pickups: pickups ?? prev.pickups,
    rover,
    meteor,
    meteorCooldown,
    catalog: prev.catalog,
    props: prev.props,
    alfaSpawnedWave,
    alfaSpawnedCount,
    bountyAssignedWave,
    waveStartTick,
    wildRespawnTicks,
    goldenOwedTerr,
    score,
    mutations: prev.mutations,
    moltChoices,
    moltDoneWave,
    contract,
    nextEnemyId,
    player,
    enemies,
    events,
  };
}
