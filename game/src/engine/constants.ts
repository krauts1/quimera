// QUIMERA — todos los valores de tuning viven aquí (nunca inline).
// Fuente: design doc "Valores iniciales", medidos/tuneados después con la suite.

/** Motor a tick fijo; el render interpola. La determinación de tests depende de esto. */
export const TICK_HZ = 60;
export const TICK_SECONDS = 1 / TICK_HZ;

/** HP del jugador. Sin regeneración pasiva: curación solo por devorar. */
export const PLAYER_MAX_HP = 100;

/** Oleadas: total de enemigos = WAVE_BASE + (oleada - 1); en campo nunca más de MAX_CONCURRENT. */
export const WAVE_BASE_ENEMIES = 3;
export const WAVE_ENEMIES_PER_WAVE = 1;
export const MAX_CONCURRENT_ENEMIES = 7; // 7 + jugador = presupuesto de 8 criaturas
/** Escalado SEPARADO (3 sep, por feedback de Luis "no siento progresión"):
 * la VIDA de las presas sube poco → matas cada vez más rápido (te sientes
 * fuerte); su DAÑO sube fuerte → los errores cuestan más (tensión). */
export const ENEMY_HP_SCALE_PER_WAVE = 0.05;
/** 0.16 → 0.22 (4 sep) → 0.28 (9 sep, pase 11): cada paquete de poder del
 * jugador (APEX, luego INSTINTO SALVAJE + curas de agresión + reliquias de
 * jefe) se paga con daño tardío — el revive vale media vida y aquí se cobra
 * (objetivo: casual ~25-35 / medio ~55-65 / bueno ~90+). */
export const ENEMY_DMG_SCALE_PER_WAVE = 0.36; // +fauna = +comida gratis: se cobra

/** Alfa: mini-jefe con pool de partes exclusivo. */
export const ALFA_EVERY_WAVES = 3;

/** LA CACERÍA: 3 territorios de 3 oleadas; cada uno custodiado por un Guardián
 * (el Alfa de su oleada 3). El último es EL ALFA PRIMORDIAL. [Tier 1, 4 sep] */
export const TERRITORY_WAVES = 3;
export const TERRITORIES = [
  { name: 'LOS PRADOS', classes: ['plant', 'bug', 'beast'], meteorMul: 1.6 },
  { name: 'EL MAR DE POLVO', classes: ['aquatic', 'bird', 'bug'], meteorMul: 0.55 },
  { name: 'LA CICATRIZ', classes: ['reptile', 'beast', 'plant'], meteorMul: 1.0 },
] as const;
export function territoryIndex(wave: number): number {
  return Math.min(TERRITORIES.length - 1, Math.floor((wave - 1) / TERRITORY_WAVES));
}

/** Oleada final: EL ALFA PRIMORDIAL (jefe único). Limpiarla = victoria. */
export const FINAL_WAVE = 9;
export const FINAL_WAVE_ALFAS = 1;
export const PRIMORDIAL_HP_MULT = 3.6; // pisa al ALFA_HP_MULT en la oleada 9

/** Patrones de jefe de los Guardianes (Alfas). [Tier 1] */
export const BOSS_PATTERN_RANGE = 11; // distancia al jugador para iniciar patrón
export const BOSS_PATTERN_COOLDOWN_SECONDS = 5;
export const BOSS_CHARGE_WARN_SECONDS = 0.9; // telegraph en línea
export const BOSS_CHARGE_SECONDS = 0.7;
export const BOSS_CHARGE_SPEED = 15;
export const BOSS_CHARGE_DAMAGE = 30;
export const BOSS_TIRED_SECONDS = 1.5; // tras cargar queda exhausto: ventana de crítico
export const CHARGE_CRASH_STUN_SECONDS = 1.8; // si se estrella contra una roca
export const BOSS_ROAR_WARN_SECONDS = 0.8;
export const BOSS_ROAR_RADIUS = 9; // enfurece a la manada y te empuja

/** Estados de combate con señal visible. [pedido de Luis, 4 sep] */
export const STUN_SECONDS = 1.1; // aturdido: quieto, estrellitas
export const SLEEP_CHANCE = 0.35; // en La Cicatriz algunas presas duermen
export const SLEEP_WAKE_RANGE = 3.5;
export const CRIT_CHANCE = 0.08;
export const CRIT_MULT = 1.75; // dormidas/exhaustos: crítico garantizado
export const PERFECT_DODGE_WINDOW_TICKS = 8; // esquiva iniciada justo antes del golpe
export const POISON_DPS = 5; // veneno (ultimate bug)

/** ULTIMATE del dorso: se carga cazando, estalla según la clase de tu dorso. */
export const ULT_CHARGE_DEVOUR = 0.34;
export const ULT_CHARGE_KNOCKDOWN = 0.09;
export const ULT_CHARGE_RIP = 0.05;
export const ULT_RADIUS = 6.5;
export const ULT_DAMAGE = 55;
export const ULT_STUN_SECONDS = 1.5; // reptile: PARÁLISIS
export const ULT_HEAL_PER_HIT = 9; // plant: ESPORAS
export const ULT_POISON_SECONDS = 4; // bug: PLAGA
export const ULT_DASH_DISTANCE = 7; // aquatic: MAREA
export const ULT_BIRD_HITS = 8; // bird: TORMENTA
export const ULT_BIRD_DMG = 14;

/** Contratos de caza: 1 por territorio; cumplirlo = MUDA extra. [Tier 2] */
export const CONTRACT_KNOCK_TARGET = 3;

/** LA MUDA: al limpiar una oleada (y cosechar sus cuerpos), eliges 1 de 3
 * mutaciones permanentes del run. Progresión que se SIENTE. [provisional] */
export const MUTATIONS = {
  sed: { name: 'SED DE PODER', desc: '+10% daño (acumulable)' },
  furia: { name: 'FURIA HERIDA', desc: '+25% daño con vida baja' },
  piel: { name: 'PIEL DE ROCA', desc: '−15% daño recibido (acumulable)' },
  voraz: { name: 'VORAZ', desc: 'devorar cura +12 extra' },
  zarpa: { name: 'ZARPA LARGA', desc: 'el zarpazo cierra +0.8 más lejos' },
  reflejos: { name: 'REFLEJOS', desc: 'la esquiva recarga 35% más rápido' },
  carronera: { name: 'CARROÑERA', desc: 'los derribos duran +1 s' },
  cazadora: { name: 'CAZADORA', desc: '+9% velocidad (acumulable)' },
} as const;
export type MutationId = keyof typeof MUTATIONS;
export const MUTATION_IDS = Object.keys(MUTATIONS) as readonly MutationId[];
export const MUT_SED_DAMAGE = 0.1;
export const MUT_FURIA_DAMAGE = 0.25;
export const MUT_FURIA_HP = 0.4; // umbral de vida baja
export const MUT_PIEL_REDUCTION = 0.85; // multiplicativo por stack
export const MUT_VORAZ_HEAL = 12;
export const MUT_ZARPA_BONUS = 0.8;
export const MUT_REFLEJOS_MUL = 0.65;
export const MUT_CARRONERA_SECONDS = 1;
export const MUT_CAZADORA_SPEED = 0.09;

/** Puntaje del run [provisional]: la razón de volver a jugar. */
export const SCORE_KNOCKDOWN = 25;
export const SCORE_ALFA_BONUS = 150; // derribar un Alfa vale oro
export const SCORE_RIP = 40;
export const SCORE_ASSIMILATE = 60; // hacer tuya una parte > solo tomarla
export const SCORE_DEVOUR = 10;
export const SCORE_WAVE_CLEAR = 100;
export const SCORE_VICTORY = 1500;

/** Botín Alfa: sus partes activas van a nivel 2; bono de daño por nivel extra. */
export const PART_LEVEL_DAMAGE_BONUS = 0.15;
/** Asimilar partes del mismo grupo sube nivel hasta este tope (visual solo L1/L2). */
export const PART_MAX_LEVEL = 3;

/** Derribo y radial. */
export const KNOCKDOWN_SECONDS = 3;
export const DEVOUR_HEAL_FRACTION = 0.35;
export const DEVOUR_BONUS_PER_PASSIVE_PART = 0.05; // ojos/orejas de la presa

/** Sinergias: sobre las 4 ranuras activas. */
export const SYNERGY_THRESHOLD = 3;
export const SYNERGY_BONUS = 0.25;
/** APEX (4/4 del mismo grupo): el jackpot — daño extra apilado sobre la
 * sinergia y las presas de tu grupo te TEMEN (salvo Alfas y acorraladas).
 * Medido: con +0.5 el win de todos los perfiles se disparaba (~+30pp);
 * +0.25 (1.5× total con sinergia) conserva el jackpot sin regalar el run. */
export const SYNERGY_APEX_BONUS = 0.25;

/** PRESA DORADA: 2% de spawn, huye rapidísimo, jamás pelea; botín L2 + puntos.
 * Medido: con ×1.9 quedaba INCAZABLE (huida 6.1 > jugador 5.0) y ataraba la
 * oleada (cap del balance 20-25 runs). Se capea bajo PLAYER_SPEED: alcanzable
 * a pie por poco — la esquiva la caza fácil. */
export const GOLDEN_CHANCE = 0.02;
export const GOLDEN_FLEE_MUL = 1.45;
export const GOLDEN_FLEE_CAP = 0.94; // huida total ≤ 94% de PLAYER_SPEED
export const SCORE_GOLDEN = 500;

/** NÉMESIS [Shadow of Mordor-style]: la presa que se te disuelve sin cosechar
 * 2 veces (entre runs) vuelve CICATRIZADA — más dura, más brava, te recuerda.
 * La persistencia vive en el render (localStorage); el motor lee el flag. */
export const NEMESIS_HP_MULT = 1.5;
export const NEMESIS_FIGHT_RANGE_MUL = 1.6;
export const SCORE_NEMESIS = 300;
export const NEMESIS_ESCAPES_TO_SCAR = 2;

/** Generador de loadout de presas: peso hacia el grupo de clase del arquetipo. */
export const PREY_CLASS_WEIGHT = 0.7;

/** Run objetivo: 6–9 oleadas (~4–6 min). Referencia de balance, no regla dura. */
export const TARGET_RUN_WAVES_MIN = 6;
export const TARGET_RUN_WAVES_MAX = 9;

// ─── Valores de combate: PROVISIONALES de greybox (2 sep 2026) ───
// El design doc no fijó números de combate; estos son puntos de partida a ojo.
// Tunear con la suite headless antes de darlos por medidos.

import type { AbilityStats, ActiveSlot, AxieClass, ClassDelta } from './types';

/** Arena circular; el spawn entra por el borde. */
/** LA LUNA ABIERTA (8 sep, decisión de Luis: "vamos a arriesgarnos"): el mundo
 * ya no es una arena — es la luna entera. Las cacerías viven en MANADAS
 * ancladas a lugares; la presa tiene QUERENCIA (no abandona su territorio),
 * lo que preserva la densidad de caza medida en los 9 pases de balance. */
export const ARENA_RADIUS = 120; // 88 → 120 (9 sep, "sigue limitado"): más luna
export const SPAWN_RADIUS = 19; // legado (spawns ahora anclan a la manada)
/** Manadas: anillo de spawn alrededor del ancla y radio de querencia. */
export const HERD_SPAWN_RING = 7;
export const HERD_HOME_RADIUS = 17;
export const HERD_FIRST_DIST = 13; // la primera manada se ve desde el inicio
export const HERD_STEP_MIN = 16; // cada manada siguiente, más lejos
export const HERD_STEP_MAX = 24;
/** FAUNA SALVAJE: la luna VIVE — presas errantes fuera de las manadas, siempre
 * hay algo que cazar en el camino. No cuentan para la manada ni su victoria. */
export const WILD_COUNT = 9;
export const WILD_RESPAWN_SECONDS = 7;
export const WILD_MIN_DIST = 18;
export const WILD_MAX_DIST = 65;
/** FERALES (9 sep, "viajar es aburrido"): parte de la fauna NO huye — te caza
 * en cuanto te hueles cerca. El viaje entre manadas tiene dientes. */
export const WILD_FERAL_CHANCE = 0.35;
export const FERAL_HUNT_RANGE = 12;
/** Herramientas encontrables: reliquia (muda extra), cristal (vida), núcleo
 * (ult) y COLMILLO DE METEORO (el arma de Luis: matar más rápido, un rato). */
export const PICKUP_COUNT = 16;
export const WEAPON_TOOL_SECONDS = 22;
export const WEAPON_TOOL_MULT = 1.6;
export const PICKUP_RADIUS = 1.5;
export const PICKUP_HEAL = 30;
export const PICKUP_ULT = 0.5;
/** El rover abandonado: móntalo para cruzar la luna (atacar/esquivar desmonta). */
export const ROVER_SPEED_MUL = 1.9;
export const ROVER_MOUNT_RANGE = 1.6;
export const ROVER_MOUNT_COOLDOWN_SECONDS = 1.0;
/** Los meteoritos ahora te siguen: caen cerca del jugador, no en toda la luna.
 * 16 → 23 (pase 10): con 16 casi todos amenazaban y casual cayó a 3% de win. */
export const METEOR_NEAR_PLAYER = 23;

/** ── Los 10 robos de retención (8 sep, "la crema y nata") ── */
/** INSTINTO SALVAJE [Hades Death Defiance]: 1 revive por run al 40% + invuln. */
export const SECOND_WIND_HP_FRACTION = 0.3; // 0.4→0.3 (pase 11): media vida era demasiada
export const SECOND_WIND_INVULN_SECONDS = 1.6;
/** SED DEL DEPREDADOR [Doom]: agredir cura — cada derribo devuelve vida. */
export const KNOCKDOWN_HEAL = 4;
/** FLUJO DE CAZA [Dead Cells]: conectar da un empujón breve de velocidad. */
export const MOMENTUM_SECONDS = 0.9;
export const MOMENTUM_SPEED_BONUS = 0.15;
/** PRESA MARCADA [Hunt: Showdown]: 1 bounty por manada — derribarla premia. */
export const BOUNTY_SCORE = 150;
export const BOUNTY_ULT = 0.15;
/** MUDA DORADA [Slay the Spire, recompensa variable]: a veces aplica DOBLE. */
export const GOLDEN_MOLT_CHANCE = 0.12;
/** CAZA VELOZ: limpiar la manada rápido premia (empuja al flow, no al farmeo). */
export const FAST_CLEAR_SECONDS = 45;
export const FAST_CLEAR_SCORE = 100;

/** Rocas lunares: obstáculos reales con colisión (esquinas para acorralar). */
export const OBSTACLE_COUNT = 60; // rocas para toda la luna abierta (r120)
export const OBSTACLE_MIN_RADIUS = 0.9;
export const OBSTACLE_MAX_RADIUS = 1.7;
export const OBSTACLE_CENTER_CLEAR = 4.5; // el centro nace despejado
export const BODY_RADIUS = 0.55; // radio de colisión de criaturas contra rocas

/** Meteoritos: telegrafían un círculo y caen. Peligro para ti; derriban presas. */
export const METEOR_INTERVAL_SECONDS = 8; // promedio (jitter ±40% con el rng)
export const METEOR_WARN_SECONDS = 1.3;
export const METEOR_RADIUS = 2.4;
export const METEOR_DAMAGE_PLAYER = 18;
export const METEOR_DAMAGE_PREY = 45;
export const METEOR_FIRST_DELAY_SECONDS = 6;

/** Movimiento del jugador (unidades/segundo). */
export const PLAYER_SPEED = 5.0;
export const DODGE_SPEED = 13;
export const DODGE_SECONDS = 0.25; // con i-frames toda la esquiva
export const DODGE_COOLDOWN_SECONDS = 0.9;

/** Presas (stats base de oleada 1; escalan con ENEMY_STAT_SCALE_PER_WAVE). */
export const ENEMY_SPEED = 3.8;
/** La caza invertida: las presas HUYEN de la Quimera; pelean solo si no queda de otra. */
export const ENEMY_FLEE_SPEED = 3.2; // más lentas huyendo: la esquiva es tu zarpazo
export const ENEMY_FIGHT_RANGE = 2.4; // jugador encima → se da la vuelta y pelea
/** 5 → 3.2 (pase 10): en la luna abierta el "borde" es la querencia y se toca
 * en CADA persecución — con 5 la presa se volteaba a pelear todo el tiempo. */
export const ENEMY_CORNERED_RANGE = 3.2;
export const ARENA_EDGE_MARGIN = 2;
export const ENEMY_BASE_HP = 60;
export const ENEMY_CONTACT_DAMAGE = 17;
export const ENEMY_ATTACK_RANGE = 1.5;
export const ENEMY_ATTACK_COOLDOWN_SECONDS = 1.2;
export const ALFA_HP_MULT = 2.2;
export const ALFA_DAMAGE_MULT = 1.8;
/** El Alfa te caza: más rápido que la manada (la Quimera apenas le saca ventaja). */
export const ALFA_SPEED_MULT = 1.25;

/** La manada venga a los caídos: al derribar una presa, las cercanas pelean un rato. */
/** 9 → 5.5 (pase 10): la querencia comprime a la manada — con 9, CADA derribo
 * enfurecía al territorio entero y el enjambre fundía a casual (2% win). */
export const AVENGE_RADIUS = 5.5;
export const AVENGE_SECONDS = 6;
/** Los vengadores golpean con furia. */
export const ANGRY_DAMAGE_MULT = 1.4;

/** Telegraph: wind-up visible antes del golpe enemigo; sin él, esquivar es suerte. */
export const ENEMY_TELEGRAPH_SECONDS = 0.3;
/** El golpe conecta si al resolverse el jugador sigue dentro de rango × esta gracia. */
export const ENEMY_STRIKE_GRACE = 1.25;

/** Knockback corto al conectar cualquier golpe (ambos lados). */
export const KNOCKBACK_SPEED = 9;
export const KNOCKBACK_SECONDS = 0.15;
/** Las presas resisten más el empujón: evita el kiteo infinito a base de mordidas. */
export const ENEMY_KNOCKBACK_SPEED = 5;

/** Separación entre presas activas para que no se apilen en un punto. */
export const ENEMY_SEPARATION_RADIUS = 1.2;

/** Personalidades de huida por clase [provisional]: cada presa se caza distinto. */
export const FLEE_AQUATIC_SPEED_MUL = 1.3; // aquatic: la más rápida
export const BIRD_ZIGZAG_AMPLITUDE = 0.9; // bird: huye en zigzag
export const BUG_SPRINT_MUL = 1.4; // bug: arranques y pausas
export const BUG_PAUSE_MUL = 0.25;
export const FLEE_PLANT_SPEED_MUL = 0.55; // plant: lenta pero…
export const PLANT_PREY_ARMOR = 0.72; // …se hace bola: −28% daño de tus golpes
export const BEAST_BRAVE_RANGE_MUL = 1.8; // beast: se planta a pelear antes
export const REPTILE_AMBUSH_RANGE_MUL = 1.6; // reptile: no huye — acecha inmóvil
export const REPTILE_STRIKE_MUL = 1.5; // …y su mordida de emboscada duele

/** Arrancar/devorar: alcance a la presa derribada y canal con F mantenida. */
export const INTERACT_RANGE = 2.2;
export const INTERACT_CHANNEL_SECONDS = 0.8;

export const WAVE_INTERMISSION_SECONDS = 2.5;

/**
 * Zarpazo magnético: al atacar, si hay presa en el cono de encare, la Quimera
 * gira hacia ella y cierra la distancia hasta dejarla en alcance. Tocar atacar
 * debe significar golpear — el apuntado fino no es trabajo del jugador.
 */
export const ATTACK_LUNGE_BASE = 0.35; // paso corto cuando no hay objetivo
export const ATTACK_LUNGE_MAX = 2.2; // cierre máximo hacia la presa
export const ATTACK_MAGNET_CONE_COS = 0.5; // cono de encare: ±60°
export const ATTACK_MAGNET_STOP = 0.6; // frena a alcance × esto (no la atraviesa)

/** 4 habilidades base, una por ranura activa. */
export const ABILITY_BASE: Record<ActiveSlot, AbilityStats> = {
  mouth: { damage: 10, cooldownSeconds: 0.5, range: 1.7, arcDegrees: 80 },
  horn: { damage: 26, cooldownSeconds: 1.4, range: 2.0, arcDegrees: 55 },
  tail: { damage: 15, cooldownSeconds: 0.9, range: 2.1, arcDegrees: 170 },
  back: { damage: 22, cooldownSeconds: 2.4, range: 2.7, arcDegrees: 360 },
};

/** Identidad MECÁNICA por clase (3 sep, feedback de Luis: los deltas numéricos
 * eran invisibles — absorber debe cambiar cómo juegas):
 * beast azota (empujón doble) · aquatic resetea tu esquiva al conectar (build
 * de movilidad) · bird alcanza lejísimos · plant drena de verdad · reptile
 * alarga derribos (build de cosecha) · bug es el híbrido rápido. */
export const CLASS_DELTA: Record<AxieClass, ClassDelta> = {
  beast: { damageMul: 1.25, cooldownMul: 1, rangeMul: 1, lifesteal: 0, knockdownMul: 1 },
  bug: { damageMul: 1.1, cooldownMul: 0.85, rangeMul: 1, lifesteal: 0, knockdownMul: 1 },
  aquatic: { damageMul: 1, cooldownMul: 0.75, rangeMul: 1, lifesteal: 0, knockdownMul: 1 },
  bird: { damageMul: 1, cooldownMul: 1, rangeMul: 1.55, lifesteal: 0, knockdownMul: 1 },
  plant: { damageMul: 1, cooldownMul: 1, rangeMul: 1, lifesteal: 0.22, knockdownMul: 1 },
  reptile: { damageMul: 1, cooldownMul: 1, rangeMul: 1, lifesteal: 0, knockdownMul: 1.8 },
};
/** beast: el golpe azota — la presa sale volando el doble de tiempo. */
export const BEAST_KNOCKBACK_TICKS_MUL = 2;
