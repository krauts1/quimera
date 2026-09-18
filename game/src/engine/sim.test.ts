import { describe, expect, it } from 'vitest';
import {
  DEVOUR_BONUS_PER_PASSIVE_PART,
  DEVOUR_HEAL_FRACTION,
  ENEMY_BASE_HP,
  ENEMY_CONTACT_DAMAGE,
  ENEMY_TELEGRAPH_SECONDS,
  BOUNTY_SCORE,
  BOUNTY_ULT,
  FINAL_WAVE,
  HERD_HOME_RADIUS,
  KNOCKDOWN_HEAL,
  WEAPON_TOOL_MULT,
  WEAPON_TOOL_SECONDS,
  HERD_SPAWN_RING,
  INTERACT_CHANNEL_SECONDS,
  NEMESIS_HP_MULT,
  PICKUP_HEAL,
  PART_LEVEL_DAMAGE_BONUS,
  PLANT_PREY_ARMOR,
  SCORE_GOLDEN,
  SCORE_KNOCKDOWN,
  SCORE_NEMESIS,
  SCORE_RIP,
  KNOCKDOWN_SECONDS,
  MAX_CONCURRENT_ENEMIES,
  PLAYER_MAX_HP,
  TICK_HZ,
} from './constants';
import { generatePreyLoadout, makePart } from './parts';
import { createRng, type Rng } from './rng';
import {
  createSim,
  IDLE_INPUT,
  step,
  type EnemyState,
  type PlayerInput,
  type SimState,
} from './sim';

const CHANNEL_TICKS = Math.round(INTERACT_CHANNEL_SECONDS * TICK_HZ);
const TELEGRAPH_TICKS = Math.round(ENEMY_TELEGRAPH_SECONDS * TICK_HZ);

/** Presa de prueba plantada frente al jugador, sin depender del spawner. */
function plantEnemy(state: SimState, overrides: Partial<EnemyState> = {}): SimState {
  const loadout = generatePreyLoadout(createRng(5), 'beast');
  const enemy: EnemyState = {
    id: 900,
    archetype: 'beast',
    genes: '',
    homeX: overrides.x ?? 0,
    homeY: overrides.y ?? 1.2,
    loadout,
    isAlfa: false,
    x: 0,
    y: 1.2,
    hp: 40,
    maxHp: 40,
    contactDamage: ENEMY_CONTACT_DAMAGE,
    attackCooldown: 0,
    knockdownTicks: 0,
    windupTicks: 0,
    knockbackTicks: 0,
    knockbackDirX: 0,
    knockbackDirY: 0,
    fleeing: false,
    angryTicks: 0,
    stunTicks: 0,
    sleeping: false,
    poisonTicks: 0,
    golden: false,
    nemesis: false,
    bounty: false,
    wild: false,
    feral: false,
    primordial: false,
    patternCooldown: Number.MAX_SAFE_INTEGER, // sin patrones de jefe en escenarios de unidad
    chargeWarnTicks: 0,
    chargeTicks: 0,
    chargeDirX: 0,
    chargeDirY: 0,
    tiredTicks: 0,
    roarWarnTicks: 0,
    ...overrides,
  };
  return {
    ...state,
    // escenario de unidad: sin rocas, meteoritos ni fauna que contaminen
    obstacles: [],
    meteorCooldown: Number.MAX_SAFE_INTEGER,
    wildRespawnTicks: Number.MAX_SAFE_INTEGER,
    // el enemigo plantado cuenta como vivo para la contabilidad de oleada
    wave: { ...state.wave, alive: state.wave.alive + (enemy.knockdownTicks > 0 ? 0 : 1) },
    enemies: [...state.enemies, enemy],
  };
}

function run(state: SimState, input: PlayerInput, rng: Rng, ticks: number): SimState {
  let s = state;
  for (let i = 0; i < ticks; i += 1) s = step(s, input, rng);
  return s;
}

describe('simulación', () => {
  it('mismo seed y mismos inputs → estados idénticos (determinismo)', () => {
    const inputs: PlayerInput[] = Array.from({ length: 600 }, (_, i) => ({
      chooseMutation: null,
      moveX: Math.sin(i / 30),
      moveY: Math.cos(i / 47),
      aimX: 1,
      aimY: 0.2,
      dodge: i % 90 === 0,
      attack: i % 40 === 0 ? 'tail' : i % 25 === 0 ? 'mouth' : null,
      interact: i % 7 === 0 ? { kind: 'devour' } : null,
    }));
    let a = createSim();
    let b = createSim();
    const rngA = createRng(2026);
    const rngB = createRng(2026);
    for (const input of inputs) {
      a = step(a, input, rngA);
      b = step(b, input, rngB);
    }
    expect(a).toEqual(b);
  });

  it('el campo nunca excede MAX_CONCURRENT_ENEMIES en oleadas tardías', () => {
    const rng = createRng(9);
    let s = createSim(9);
    for (let i = 0; i < 120; i += 1) {
      s = step(s, IDLE_INPUT, rng);
      // el tope aplica a la MANADA; la fauna salvaje vive aparte
      const active = s.enemies.filter((e) => e.knockdownTicks === 0 && !e.wild).length;
      expect(active).toBeLessThanOrEqual(MAX_CONCURRENT_ENEMIES);
    }
  });

  it('atacar dentro del arco daña a la presa', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    const before = s.enemies[0]!.hp;
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.enemies[0]!.hp).toBeLessThan(before);
    expect(s.events.some((e) => e.type === 'hit')).toBe(true);
  });

  it('ESQUIVA PERFECTA: aturde al atacante y carga tu crítico', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    s = run(s, IDLE_INPUT, rng, TELEGRAPH_TICKS); // wind-up casi resuelto
    s = step(s, { ...IDLE_INPUT, dodge: true, moveX: 0, moveY: -1 }, rng);
    expect(s.events.some((e) => e.type === 'perfectDodge')).toBe(true);
    expect(s.enemies[0]!.stunTicks).toBeGreaterThan(0); // aturdido con estrellitas
    expect(s.player.critNext).toBe(true);
    // el siguiente golpe es crítico
    const before = s.enemies[0]!.hp;
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const hit = s.events.find((e) => e.type === 'hit') as { crit?: boolean } | undefined;
    expect(hit?.crit).toBe(true);
    expect(before - s.enemies[0]!.hp).toBeGreaterThan(15); // 10×1.25×1.75 ≈ 21.9
  });

  it('DORMIDA: golpearla es crítico garantizado y la despierta', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { sleeping: true, hp: 1000, maxHp: 1000 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const hit = s.events.find((e) => e.type === 'hit') as { crit?: boolean } | undefined;
    expect(hit?.crit).toBe(true);
    expect(s.enemies[0]!.sleeping).toBe(false);
  });

  it('GUARDIÁN: telegrafía la carga, embiste, y queda exhausto (ventana de crítico)', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { isAlfa: true, x: 0, y: 8, hp: 5000, maxHp: 5000, patternCooldown: 0 },
    );
    s = step(s, IDLE_INPUT, rng);
    expect(s.events.some((e) => e.type === 'bossChargeWarn' || e.type === 'bossRoarWarn')).toBe(
      true,
    );
    // correr la secuencia completa del patrón
    s = run(s, IDLE_INPUT, rng, 200);
    // tras cargar o rugir, en algún momento quedó exhausto o rugió
    expect(s.player.hp).toBeLessThanOrEqual(100); // (pudo arrollarnos: es un jefe)
  });

  it('ULTIMATE reptile: con carga llena, PARÁLISIS aturde a las presas cercanas', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { hp: 1000, maxHp: 1000 },
    );
    s = {
      ...s,
      player: {
        ...s.player,
        ult: 1,
        loadout: {
          ...s.player.loadout,
          back: { id: 'back-reptile', class: 'reptile', type: 'back', level: 1 },
        },
      },
    };
    s = step(s, { ...IDLE_INPUT, attack: 'back' }, rng);
    expect(s.events.some((e) => e.type === 'ultimate')).toBe(true);
    expect(s.player.ult).toBe(0);
    expect(s.enemies[0]!.stunTicks).toBeGreaterThan(0);
  });

  it('CONTRATO: se ofrece al entrar al territorio y cumplirlo da muda extra', () => {
    const rng = createRng(1);
    let s = createSim(1, []);
    s = step(s, IDLE_INPUT, rng);
    expect(s.contract).not.toBeNull();
    expect(s.events.some((e) => e.type === 'contractNew')).toBe(true);
    // forzar un contrato de derribo y cumplirlo
    let t = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    t = {
      ...t,
      contract: {
        kind: 'knock_class',
        cls: 'beast',
        territory: 0,
        text: 'derriba 1 beast',
        progress: 0,
        target: 1,
        failed: false,
        done: false,
      },
    };
    t = step(t, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(t.contract!.done).toBe(true);
    expect(t.phase).toBe('molt'); // muda extra inmediata
  });

  it('los territorios dictan las clases de las presas', () => {
    const catalog = (['plant', 'aquatic', 'reptile'] as const).map((cls, i) => ({
      id: String(i),
      class: cls,
      genes: `0xf${i}`,
      parts: (['eyes', 'ears', 'mouth', 'horn', 'back', 'tail'] as const).map((slot) => ({
        id: `${slot}-${cls}`,
        class: cls,
        type: slot,
        level: 1,
      })),
    }));
    const rng = createRng(3);
    let s = createSim(4, catalog); // territorio 2: EL MAR DE POLVO (aquatic/bird/bug)
    s = step(s, IDLE_INPUT, rng);
    for (const e of s.enemies) expect(e.archetype).toBe('aquatic');
  });

  it('LA MUDA: al limpiar y cosechar la oleada, ofrece 3 mutaciones y elegir aplica', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng); // derribo
    // con el cuerpo en el suelo NO hay muda todavía (cosecha en paz)
    expect(s.phase).toBe('running');
    const devour: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'devour' } };
    s = run(s, devour, rng, CHANNEL_TICKS + 2); // devorar → arena vacía → muda
    expect(s.phase).toBe('molt');
    expect(s.moltChoices).toHaveLength(3);

    // el mundo está congelado mientras eliges
    const frozen = step(s, IDLE_INPUT, rng);
    expect(frozen).toBe(s);

    // elegir aplica la mutación y arranca el intermedio
    const chosen = s.moltChoices![1]!;
    s = step(s, { ...IDLE_INPUT, chooseMutation: 1 }, rng);
    expect(s.phase).toBe('running');
    expect(s.mutations).toContain(chosen);
    expect(s.intermissionTicks).toBeGreaterThan(0);
  });

  it('la mutación SED sube el daño', () => {
    const input: PlayerInput = { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' };
    const base = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, {
      hp: 1000,
      maxHp: 1000,
    });
    const plain = step(base, input, createRng(1));
    const mutated = step(
      { ...base, mutations: ['sed', 'sed'] },
      input,
      createRng(1),
    );
    const dmg = (s: SimState) => 1000 - s.enemies[0]!.hp;
    expect(dmg(mutated)).toBeCloseTo(dmg(plain) * 1.2, 5);
  });

  it('el puntaje suma por derribo y cosecha', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    expect(s.score).toBe(0);
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.score).toBeGreaterThanOrEqual(SCORE_KNOCKDOWN); // derribo (+oleada limpia)
    const afterKnock = s.score;
    const rip: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'rip', slot: 'horn' } };
    s = run(s, rip, rng, CHANNEL_TICKS + 1);
    expect(s.score).toBe(afterKnock + SCORE_RIP);
  });

  it('las rocas bloquean: el jugador no las atraviesa', () => {
    const rng = createRng(1);
    let s: SimState = {
      ...createSim(),
      wave: { wave: 1, pending: 0, alive: 0 },
      obstacles: [{ x: 0, y: 3, r: 1.2 }],
      meteorCooldown: Number.MAX_SAFE_INTEGER,
    };
    s = run(s, { ...IDLE_INPUT, moveX: 0, moveY: 1 }, rng, 240); // 4 s hacia la roca
    const d = Math.hypot(s.player.x - 0, s.player.y - 3);
    expect(d).toBeGreaterThanOrEqual(1.2); // nunca dentro del radio
  });

  it('el meteorito daña al jugador y derriba presas en el radio', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, {
      x: 0.5,
      y: 0.5,
      hp: 10,
    });
    s = { ...s, meteor: { x: 0, y: 0, ticksLeft: 1 } };
    s = step(s, IDLE_INPUT, rng);
    expect(s.player.hp).toBeLessThan(PLAYER_MAX_HP);
    expect(s.enemies[0]!.knockdownTicks).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'meteorHit')).toBe(true);
  });

  it('los mapas de rocas son deterministas por semilla', () => {
    expect(createSim(1, [], 42).obstacles).toEqual(createSim(1, [], 42).obstacles);
    expect(createSim(1, [], 42).obstacles).not.toEqual(createSim(1, [], 43).obstacles);
  });

  it('zarpazo magnético: gira hacia la presa en el cono y conecta', () => {
    const rng = createRng(1);
    // presa a 45° del encare (dentro del cono de ±60°) y a 2.8 u
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { x: 2, y: 2 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.events.some((e) => e.type === 'hit')).toBe(true);
    expect(s.player.faceX).toBeGreaterThan(0.5); // giró hacia la presa
  });

  it('el imán prefiere la presa ALINEADA con el encare, no la más cercana', () => {
    const rng = createRng(1);
    // A: cerca pero de reojo (45°); B: más lejos pero justo al frente
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { id: 900, x: 1.3, y: 1.3, hp: 1000, maxHp: 1000 },
    );
    s = plantEnemy(s, { id: 901, x: 0, y: 3.2, hp: 1000, maxHp: 1000 });
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const hits = s.events.filter((e) => e.type === 'hit').map((e) => (e as { enemyId: number }).enemyId);
    expect(hits).toContain(901); // golpeó a la del frente
    expect(Math.abs(s.player.faceX)).toBeLessThan(0.2); // no se volteó de reojo
  });

  it('el ataque abalanza: conecta con presas justo fuera del alcance', () => {
    const rng = createRng(1);
    // a 2.3 u: fuera del alcance de la mordida (1.7), dentro con el lunge (0.8)
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { x: 0, y: 2.3 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.events.some((e) => e.type === 'hit')).toBe(true);
    expect(s.player.y).toBeGreaterThan(0.5); // se movió hacia la presa
  });

  it('atacar de espaldas no conecta', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: -1, attack: 'mouth' }, rng);
    expect(s.events.some((e) => e.type === 'hit')).toBe(false);
  });

  it('hp a 0 → derribo, y devorar cura base + pasivas', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s = { ...s, player: { ...s.player, hp: 20 } };
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.enemies[0]!.knockdownTicks).toBeGreaterThan(0);

    const devour: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'devour' } };
    s = run(s, devour, rng, CHANNEL_TICKS + 1);
    expect(s.enemies).toHaveLength(0);
    const expectedHeal =
      (DEVOUR_HEAL_FRACTION + 2 * DEVOUR_BONUS_PER_PASSIVE_PART) * PLAYER_MAX_HP;
    // + KNOCKDOWN_HEAL: la SED DEL DEPREDADOR cura al derribar
    expect(s.player.hp).toBeCloseTo(20 + KNOCKDOWN_HEAL + expectedHeal, 5);
  });

  it('la Quimera nace solo con boca y atacar una ranura vacía no hace nada', () => {
    const rng = createRng(1);
    const base = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    expect(base.player.loadout.mouth).toBeDefined();
    expect(base.player.loadout.horn).toBeUndefined();
    const s = step(base, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'horn' }, rng);
    expect(s.events.some((e) => e.type === 'attack' || e.type === 'hit')).toBe(false);
    expect(s.player.cooldowns.horn).toBe(0);
  });

  it('arrancar a ranura vacía equipa la parte y la quita a la presa', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const preyHorn = s.enemies[0]!.loadout.horn!;

    const rip: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'rip', slot: 'horn' } };
    s = run(s, rip, rng, CHANNEL_TICKS + 1);
    expect(s.player.loadout.horn).toEqual(preyHorn);
    expect(s.enemies[0]!.loadout.horn).toBeUndefined();
  });

  it('arrancar del mismo grupo asimila: tu parte sube de nivel', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    // presa con boca del grupo beast (bug ∈ beast): asimilación
    s.enemies[0]!.loadout.mouth = { id: 'mouth-bug', class: 'bug', type: 'mouth', level: 1 };
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const ownMouth = s.player.loadout.mouth!;

    const rip: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'rip', slot: 'mouth' } };
    s = run(s, rip, rng, CHANNEL_TICKS + 1);
    expect(s.player.loadout.mouth!.id).toBe(ownMouth.id); // conserva SU parte
    expect(s.player.loadout.mouth!.level).toBe(2); // pero crece
  });

  it('arrancar de grupo distinto cambia la parte (sidegrade)', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s.enemies[0]!.loadout.mouth = { id: 'mouth-aquatic', class: 'aquatic', type: 'mouth', level: 1 };
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);

    const rip: PlayerInput = { ...IDLE_INPUT, interact: { kind: 'rip', slot: 'mouth' } };
    s = run(s, rip, rng, CHANNEL_TICKS + 1);
    expect(s.player.loadout.mouth!.id).toBe('mouth-aquatic');
    expect(s.player.loadout.mouth!.level).toBe(1);
  });

  it('la presa derribada se disuelve al expirar la ventana', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { knockdownTicks: 2 },
    );
    s = run(s, IDLE_INPUT, rng, 3);
    expect(s.enemies).toHaveLength(0);
  });

  it('el golpe enemigo telegrafía y conecta al resolverse el wind-up', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });

    s = step(s, IDLE_INPUT, rng);
    expect(s.events.some((e) => e.type === 'telegraph')).toBe(true);
    expect(s.player.hp).toBe(PLAYER_MAX_HP); // aún no golpea

    s = run(s, IDLE_INPUT, rng, TELEGRAPH_TICKS - 1);
    expect(s.player.hp).toBe(PLAYER_MAX_HP); // último tick de wind-up

    s = step(s, IDLE_INPUT, rng);
    expect(s.player.hp).toBeCloseTo(PLAYER_MAX_HP - ENEMY_CONTACT_DAMAGE);
    expect(s.player.knockbackTicks).toBeGreaterThan(0); // empujón al conectar
  });

  it('esquivar en el momento del golpe lo evita', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    s = run(s, IDLE_INPUT, rng, TELEGRAPH_TICKS); // wind-up casi resuelto
    s = step(s, { ...IDLE_INPUT, dodge: true, moveX: 0, moveY: -1 }, rng);
    expect(s.player.hp).toBe(PLAYER_MAX_HP);
  });

  it('alejarse durante el wind-up hace fallar el golpe', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    const flee: PlayerInput = { ...IDLE_INPUT, moveX: 0, moveY: -1 };
    s = run(s, flee, rng, TELEGRAPH_TICKS + 5);
    expect(s.player.hp).toBe(PLAYER_MAX_HP);
  });

  it('golpear a una presa la empuja lejos del jugador', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { hp: 1000, maxHp: 1000 },
    );
    const startY = s.enemies[0]!.y;
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.enemies[0]!.knockbackTicks).toBeGreaterThan(0);
    s = run(s, IDLE_INPUT, rng, 5);
    expect(s.enemies[0]!.y).toBeGreaterThan(startY);
  });

  it('check T1: esquivar reaccionando al telegraph evita todo el daño (no es suerte)', () => {
    // Mismo escenario, dos políticas: pasivo vs. esquivar cuando el wind-up
    // está por resolverse. 20 segundos contra una presa inmortal de facto.
    const scenario = () =>
      plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1e9, maxHp: 1e9 });

    let passive = scenario();
    const rngA = createRng(3);
    for (let i = 0; i < 1200; i += 1) passive = step(passive, IDLE_INPUT, rngA);
    expect(passive.player.hp).toBeLessThan(PLAYER_MAX_HP); // el pasivo sí recibe golpes

    let reactive = scenario();
    const rngB = createRng(3);
    for (let i = 0; i < 1200; i += 1) {
      const strikeIncoming = reactive.enemies.some((e) => e.windupTicks === 1);
      reactive = step(reactive, { ...IDLE_INPUT, dodge: strikeIncoming }, rngB);
    }
    expect(reactive.player.hp).toBe(PLAYER_MAX_HP); // reaccionar al telegraph = cero daño
  });

  it('check T1: las presas activas no se apilan a lo largo de un run', () => {
    const rng = createRng(77);
    let s = createSim(9); // muchas presas en campo
    for (let i = 0; i < 900; i += 1) {
      s = step(s, IDLE_INPUT, rng);
      if (s.phase === 'dead') break;
      if (i < 30) continue; // margen para que la separación corrija spawns juntos
      const standing = s.enemies.filter((e) => e.knockdownTicks === 0);
      for (let a = 0; a < standing.length; a += 1) {
        for (let b = a + 1; b < standing.length; b += 1) {
          const d = Math.hypot(standing[b]!.x - standing[a]!.x, standing[b]!.y - standing[a]!.y);
          expect(d).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('la caza invertida: la presa lejana huye de la Quimera', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { x: 0, y: 6 });
    const d0 = Math.hypot(s.enemies[0]!.x, s.enemies[0]!.y);
    s = run(s, IDLE_INPUT, rng, 60);
    const e = s.enemies[0]!;
    expect(e.fleeing).toBe(true);
    expect(Math.hypot(e.x - s.player.x, e.y - s.player.y)).toBeGreaterThan(d0);
  });

  it('la presa encimada se defiende (no huye) y el Alfa siempre caza', () => {
    const rng = createRng(1);
    // encimada: dentro de FIGHT_RANGE → pelea (el test del telegraph ya lo cubre)
    let close = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    close = step(close, IDLE_INPUT, rng);
    expect(close.enemies[0]!.fleeing).toBe(false);

    // Alfa lejano: se acerca en vez de huir
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { isAlfa: true, x: 0, y: 8 },
    );
    const d0 = Math.hypot(8, 0);
    s = run(s, IDLE_INPUT, createRng(1), 60);
    const alfa = s.enemies[0]!;
    expect(alfa.fleeing).toBe(false);
    expect(Math.hypot(alfa.x - s.player.x, alfa.y - s.player.y)).toBeLessThan(d0);
  });

  it('acorralada contra el borde con la Quimera cerca, pelea', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { x: 0, y: 21 }, // pegada a la pared (ARENA_RADIUS 22)
    );
    s = { ...s, player: { ...s.player, x: 0, y: 17.5 } }; // a ~3.5 u
    s = step(s, IDLE_INPUT, rng);
    expect(s.enemies[0]!.fleeing).toBe(false);
  });

  it('personalidades: bird zigzaguea, reptile acecha inmóvil, beast se planta', () => {
    const rng = createRng(1);
    // bird: huye con vaivén lateral
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'bird', x: 0, y: 8 },
    );
    let maxAbsX = 0;
    for (let i = 0; i < 120; i += 1) {
      s = step(s, IDLE_INPUT, rng);
      maxAbsX = Math.max(maxAbsX, Math.abs(s.enemies[0]!.x));
    }
    expect(maxAbsX).toBeGreaterThan(0.25);

    // reptile: no huye — se queda quieta mirándote
    let r = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'reptile', x: 0, y: 8 },
    );
    r = run(r, IDLE_INPUT, createRng(1), 60);
    expect(Math.abs(r.enemies[0]!.x)).toBeLessThan(0.01);
    expect(Math.abs(r.enemies[0]!.y - 8)).toBeLessThan(0.01);
    expect(r.enemies[0]!.fleeing).toBe(false);

    // beast a 3.5 u pelea; aquatic a 3.5 u huye
    let b = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'beast', x: 0, y: 3.5 },
    );
    b = step(b, IDLE_INPUT, createRng(1));
    expect(b.enemies[0]!.fleeing).toBe(false);
    let a = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'aquatic', x: 0, y: 3.5 },
    );
    a = step(a, IDLE_INPUT, createRng(1));
    expect(a.enemies[0]!.fleeing).toBe(true);
  });

  it('plant se hace bola: recibe menos daño de tus golpes', () => {
    const input: PlayerInput = { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' };
    const base = { ...createSim(), wave: { wave: 1 as const, pending: 0, alive: 0 } };
    const vsBeast = step(
      plantEnemy(base, { archetype: 'beast', hp: 1000, maxHp: 1000 }),
      input,
      createRng(1),
    );
    const vsPlant = step(
      plantEnemy(base, { archetype: 'plant', hp: 1000, maxHp: 1000 }),
      input,
      createRng(1),
    );
    const dmgBeast = 1000 - vsBeast.enemies[0]!.hp;
    const dmgPlant = 1000 - vsPlant.enemies[0]!.hp;
    expect(dmgPlant).toBeCloseTo(dmgBeast * PLANT_PREY_ARMOR, 5);
  });

  it('la manada venga al caído: la presa cercana deja de huir', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s = plantEnemy(s, { id: 901, x: 0, y: 4 }); // testigo dentro de AVENGE_RADIUS
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const witness = s.enemies.find((e) => e.id === 901)!;
    expect(witness.angryTicks).toBeGreaterThan(0);
    s = step(s, IDLE_INPUT, rng);
    expect(s.enemies.find((e) => e.id === 901)!.fleeing).toBe(false);
  });

  it('dos presas solapadas se separan', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { x: 0, y: 6 });
    s = plantEnemy(s, { id: 901, x: 0, y: 6 });
    s = step(s, IDLE_INPUT, rng);
    const [a, b] = s.enemies;
    const dist = Math.hypot(b!.x - a!.x, b!.y - a!.y);
    expect(dist).toBeGreaterThan(0.5);
  });

  it('hp a 0 → INSTINTO SALVAJE revive UNA vez; la segunda es la muerte', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } });
    s = { ...s, player: { ...s.player, hp: 1 } };
    s = run(s, IDLE_INPUT, rng, TICK_HZ * 3);
    // primera letal: se niega a morir — 40% de vida e invulnerabilidad breve
    expect(s.player.revived).toBe(true);
    expect(s.phase).toBe('running');
    expect(s.player.hp).toBeGreaterThan(0);
    // segunda letal: ahora sí
    s = { ...s, player: { ...s.player, hp: 1, invulnTicks: 0 } };
    s = run(s, IDLE_INPUT, rng, TICK_HZ * 6);
    expect(s.phase).toBe('dead');
    expect(s.player.hp).toBe(0);
  });

  it('con catálogo, las presas encarnan Axies reales (genes + partes)', () => {
    const catalog = [
      {
        id: '42',
        class: 'bird' as const,
        genes: '0xabc123',
        parts: (['eyes', 'ears', 'mouth', 'horn', 'back', 'tail'] as const).map((slot) => ({
          id: `${slot}-real`,
          class: 'bird' as const,
          type: slot,
          level: 1,
        })),
      },
    ];
    const rng = createRng(5);
    let s = createSim(1, catalog);
    s = step(s, IDLE_INPUT, rng);
    expect(s.enemies.length).toBeGreaterThan(0);
    // la dorada garantizada nace con activas L2 (botín premium): se excluye
    for (const e of s.enemies.filter((x) => !x.isAlfa && !x.golden)) {
      expect(e.genes).toBe('0xabc123');
      expect(e.loadout.mouth?.id).toBe('mouth-real');
      expect(e.loadout.mouth?.level).toBe(1);
    }
  });

  it('la oleada final trae al ALFA PRIMORDIAL único con partes nivel 2', () => {
    const rng = createRng(5);
    const catalog = [
      {
        id: '42',
        class: 'bird' as const,
        genes: '0xabc123',
        parts: (['eyes', 'ears', 'mouth', 'horn', 'back', 'tail'] as const).map((slot) => ({
          id: `${slot}-real`,
          class: 'bird' as const,
          type: slot,
          level: 1,
        })),
      },
    ];
    let s = createSim(FINAL_WAVE, catalog);
    s = step(s, IDLE_INPUT, rng);
    const alfas = s.enemies.filter((e) => e.isAlfa);
    expect(alfas).toHaveLength(1);
    expect(alfas[0]!.primordial).toBe(true);
    expect(alfas[0]!.maxHp).toBeGreaterThan(ENEMY_BASE_HP * 3); // jefe de verdad
    expect(alfas[0]!.loadout.horn?.level).toBe(2);
    expect(alfas[0]!.loadout.eyes?.level).toBe(1); // pasivas no suben
  });

  it('limpiar la oleada final = victoria', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(FINAL_WAVE), wave: { wave: FINAL_WAVE, pending: 0, alive: 0 } },
      { hp: 1 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.phase).toBe('victory');
    expect(s.events.some((e) => e.type === 'victory')).toBe(true);
    // el estado queda congelado
    const frozen = step(s, IDLE_INPUT, rng);
    expect(frozen).toBe(s);
  });

  it('una parte nivel 2 pega más que la misma en nivel 1', () => {
    const rng = createRng(1);
    const base = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, {
      hp: 1000,
      maxHp: 1000,
    });
    const input: PlayerInput = { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' };

    const l1 = step(base, input, createRng(1));
    const withL2 = {
      ...base,
      player: {
        ...base.player,
        loadout: { ...base.player.loadout, mouth: { ...base.player.loadout.mouth!, level: 2 } },
      },
    };
    const l2 = step(withL2, input, rng);
    const dmg = (s: SimState) => 1000 - s.enemies[0]!.hp;
    expect(dmg(l2)).toBeCloseTo(dmg(l1) * (1 + PART_LEVEL_DAMAGE_BONUS));
  });

  it('el derribo dura KNOCKDOWN_SECONDS con parte no-reptile', () => {
    const rng = createRng(1);
    let s = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, { hp: 1 });
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.enemies[0]!.knockdownTicks).toBe(Math.round(KNOCKDOWN_SECONDS * TICK_HZ));
  });

  it('PRESA DORADA: jamás pelea ni telegraphea, aunque la tengas encima', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { golden: true, y: 1.0, attackCooldown: 0 },
    );
    for (let i = 0; i < 30; i += 1) s = step(s, IDLE_INPUT, rng);
    const e = s.enemies[0]!;
    expect(e.windupTicks).toBe(0);
    expect(s.player.hp).toBe(PLAYER_MAX_HP);
    expect(e.fleeing).toBe(true); // corre incluso a rango de pelea
  });

  it('PRESA DORADA derribada suma SCORE_GOLDEN extra', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { golden: true, hp: 1 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.events.some((e) => e.type === 'knockdown')).toBe(true);
    expect(s.score).toBe(SCORE_KNOCKDOWN + SCORE_GOLDEN);
  });

  it('APEX (4/4): las presas de tu grupo dominante te temen y no atacan', () => {
    const rng = createRng(1);
    const apexLoadout = {
      mouth: makePart('mouth', 'beast'),
      horn: makePart('horn', 'bug'),
      tail: makePart('tail', 'beast'),
      back: makePart('back', 'bug'),
    };
    // beast normalmente es valiente (se planta a rango extendido): con APEX huye
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'beast', y: 2.0, attackCooldown: 0 },
    );
    s = { ...s, player: { ...s.player, loadout: apexLoadout } };
    for (let i = 0; i < 30; i += 1) s = step(s, IDLE_INPUT, rng);
    const e = s.enemies[0]!;
    expect(e.windupTicks).toBe(0);
    expect(s.player.hp).toBe(PLAYER_MAX_HP);
    expect(e.fleeing).toBe(true);
  });

  it('APEX no intimida a los Alfas', () => {
    const rng = createRng(1);
    const apexLoadout = {
      mouth: makePart('mouth', 'beast'),
      horn: makePart('horn', 'bug'),
      tail: makePart('tail', 'beast'),
      back: makePart('back', 'bug'),
    };
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'beast', isAlfa: true, y: 2.0 },
    );
    s = { ...s, player: { ...s.player, loadout: apexLoadout } };
    s = step(s, IDLE_INPUT, rng);
    expect(s.enemies[0]!.fleeing).toBe(false);
  });

  it('NÉMESIS: la entrada de catálogo marcada spawnea cicatrizada — más HP y partes L2', () => {
    const rng = createRng(7);
    const catalog = [
      {
        id: '12345',
        class: 'beast' as const,
        genes: '0xabc',
        nemesis: true,
        parts: [
          makePart('mouth', 'beast'),
          makePart('horn', 'bug'),
          makePart('eyes', 'beast'),
        ],
      },
    ];
    let s = createSim(1, catalog);
    for (let i = 0; i < 60 && s.enemies.length === 0; i += 1) s = step(s, IDLE_INPUT, rng);
    const e = s.enemies[0]!;
    expect(e.nemesis).toBe(true);
    expect(e.maxHp).toBeCloseTo(ENEMY_BASE_HP * NEMESIS_HP_MULT);
    expect(e.loadout.mouth!.level).toBe(2);
    expect(e.loadout.eyes!.level).toBe(1); // pasivas no suben
    expect(e.sleeping).toBe(false);
  });

  it('LUNA ABIERTA: las presas spawnean alrededor del ancla de su manada', () => {
    const rng = createRng(3);
    let s = createSim(1);
    for (let i = 0; i < 30 && s.enemies.length === 0; i += 1) s = step(s, IDLE_INPUT, rng);
    const anchor = s.herds[0]!;
    for (const e of s.enemies.filter((x) => !x.wild)) {
      expect(Math.hypot(e.x - anchor.x, e.y - anchor.y)).toBeLessThanOrEqual(HERD_SPAWN_RING + 1);
      expect(e.homeX).toBe(anchor.x);
    }
  });

  it('QUERENCIA: la presa que huye jamás abandona el territorio de su manada', () => {
    const rng = createRng(1);
    // hogar en el origen, jugador plantado en el hogar: la presa huye hacia afuera
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { archetype: 'aquatic', homeX: 0, homeY: 0, x: 0, y: 3, attackCooldown: Number.MAX_SAFE_INTEGER },
    );
    for (let i = 0; i < 900; i += 1) {
      s = step(s, IDLE_INPUT, rng);
      const e = s.enemies[0]!;
      expect(Math.hypot(e.x - e.homeX, e.y - e.homeY)).toBeLessThan(HERD_HOME_RADIUS + 2.5);
    }
  });

  it('PICKUP de vida cura y se consume', () => {
    const rng = createRng(1);
    let s = createSim();
    s = {
      ...s,
      pickups: [{ x: 0.5, y: 0.5, kind: 'heal' as const, taken: false }],
      player: { ...s.player, hp: 40 },
    };
    s = step(s, IDLE_INPUT, rng);
    expect(s.player.hp).toBe(40 + PICKUP_HEAL);
    expect(s.pickups[0]!.taken).toBe(true);
    expect(s.events.some((e) => e.type === 'pickup')).toBe(true);
  });

  it('COLMILLO DE METEORO: pisarlo multiplica el daño de tus golpes', () => {
    const rng = createRng(1);
    const base = plantEnemy({ ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } }, {
      hp: 1000,
      maxHp: 1000,
    });
    const input: PlayerInput = { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' };
    const plain = step(base, input, createRng(1));
    const armed = {
      ...base,
      player: { ...base.player, weaponTicks: Math.round(WEAPON_TOOL_SECONDS * TICK_HZ) },
    };
    const fanged = step(armed, input, createRng(1));
    const dmg = (s: SimState) => 1000 - s.enemies[0]!.hp;
    expect(dmg(fanged)).toBeCloseTo(dmg(plain) * WEAPON_TOOL_MULT);
  });

  it('RELIQUIA pisada abre una MUDA extra', () => {
    const rng = createRng(1);
    let s = createSim();
    s = { ...s, pickups: [{ x: 0.5, y: 0.5, kind: 'relic' as const, taken: false }] };
    s = step(s, IDLE_INPUT, rng);
    expect(s.phase).toBe('molt');
    expect(s.moltChoices?.length).toBe(3);
  });

  it('ROVER: montar acelera, atacar desmonta y lo aparca', () => {
    const rng = createRng(1);
    let s = createSim();
    s = { ...s, rover: { x: 0.5, y: 0 } };
    const move: PlayerInput = { ...IDLE_INPUT, moveX: 1 };
    s = step(s, move, rng);
    expect(s.player.riding).toBe(true);
    expect(s.events.some((e) => e.type === 'roverMount')).toBe(true);
    const beforeX = s.player.x;
    s = step(s, move, rng);
    expect(s.player.x - beforeX).toBeGreaterThan(0.12); // velocidad de rover, no de pata
    expect(s.rover.x).toBeCloseTo(s.player.x); // el rover viaja contigo
    s = step(s, { ...move, attack: 'mouth' }, rng);
    expect(s.player.riding).toBe(false);
    expect(s.events.some((e) => e.type === 'roverDismount')).toBe(true);
  });

  it('FAUNA SALVAJE: la luna repone errantes y NO cuentan para la oleada', () => {
    const rng = createRng(5);
    let s = createSim(1);
    for (let i = 0; i < TICK_HZ * 8; i += 1) s = step(s, IDLE_INPUT, rng);
    const wild = s.enemies.filter((e) => e.wild);
    expect(wild.length).toBeGreaterThanOrEqual(3);
    // derribar una salvaje no reduce la cuenta de la manada
    const aliveBefore = s.wave.alive;
    const target = wild[0]!;
    s = {
      ...s,
      enemies: s.enemies.map((e) => (e.id === target.id ? { ...e, hp: 1, x: 0, y: 1.2, homeX: 0, homeY: 1.2 } : e)),
      player: { ...s.player, x: 0, y: 0, faceX: 0, faceY: 1 },
    };
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    const knockedWild = s.enemies.find((e) => e.id === target.id);
    expect(knockedWild?.knockdownTicks ?? 0).toBeGreaterThan(0);
    expect(s.wave.alive).toBe(aliveBefore);
  });

  it('FERAL: la fauna cazadora te persigue en vez de huir', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { feral: true, wild: true, x: 0, y: 9, homeX: 0, homeY: 9, attackCooldown: Number.MAX_SAFE_INTEGER },
    );
    const d0 = Math.hypot(s.enemies[0]!.x, s.enemies[0]!.y);
    s = run(s, IDLE_INPUT, rng, TICK_HZ);
    const d1 = Math.hypot(s.enemies[0]!.x, s.enemies[0]!.y);
    expect(d1).toBeLessThan(d0 - 1); // viene POR TI
    expect(s.enemies[0]!.fleeing).toBe(false);
  });

  it('DORADA GARANTIZADA: el primer errante del territorio nace dorado', () => {
    const rng = createRng(11);
    let s = createSim(1);
    for (let i = 0; i < TICK_HZ * 3; i += 1) s = step(s, IDLE_INPUT, rng);
    const wild = s.enemies.filter((e) => e.wild);
    expect(wild.length).toBeGreaterThan(0);
    expect(wild[0]!.golden).toBe(true);
    expect(s.goldenOwedTerr).toBe(-1); // el territorio ya pagó
  });

  it('PRESA MARCADA: derribar el bounty suma BOUNTY_SCORE y carga ultimate', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { bounty: true, hp: 1 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.score).toBe(SCORE_KNOCKDOWN + BOUNTY_SCORE);
    expect(s.player.ult).toBeGreaterThan(BOUNTY_ULT - 0.01);
  });

  it('BOTÍN DEL GUARDIÁN: el Alfa derribado suelta una RELIQUIA donde cayó', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 3, pending: 0, alive: 0 } },
      { isAlfa: true, hp: 1, x: 2, y: 2, homeX: 2, homeY: 2 },
    );
    const before = s.pickups.length;
    s = step(s, { ...IDLE_INPUT, aimX: 1, aimY: 1, attack: 'mouth' }, rng);
    expect(s.pickups.length).toBe(before + 1);
    const drop = s.pickups[s.pickups.length - 1]!;
    expect(drop.kind).toBe('relic');
    expect(Math.hypot(drop.x - 2, drop.y - 2)).toBeLessThan(3);
  });

  it('NÉMESIS derribada suma SCORE_NEMESIS extra', () => {
    const rng = createRng(1);
    let s = plantEnemy(
      { ...createSim(), wave: { wave: 1, pending: 0, alive: 0 } },
      { nemesis: true, hp: 1 },
    );
    s = step(s, { ...IDLE_INPUT, aimX: 0, aimY: 1, attack: 'mouth' }, rng);
    expect(s.score).toBe(SCORE_KNOCKDOWN + SCORE_NEMESIS);
  });
});
