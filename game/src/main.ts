// QUIMERA — greybox jugable: la simulación pura corre a tick fijo y el render
// (Three + mixer) solo consume estado. La Quimera es un Axie real; las presas
// son cápsulas de color por clase hasta que entren al pool de mixer.
import * as THREE from 'three';
import { createAxieMixer3D, formatAxiePartAssetId } from '@jaatster/threejs-axie-mixer3d-public';
import {
  ARENA_RADIUS,
  INTERACT_CHANNEL_SECONDS,
  INTERACT_RANGE,
  KNOCKDOWN_SECONDS,
  METEOR_RADIUS,
  NEMESIS_ESCAPES_TO_SCAR,
  METEOR_WARN_SECONDS,
  PLAYER_MAX_HP,
  TICK_HZ,
  TICK_SECONDS,
} from './engine/constants';
import {
  ABILITY_BASE,
  CLASS_DELTA,
  FINAL_WAVE,
  MUTATION_IDS,
  MUTATIONS,
  SYNERGY_THRESHOLD,
  TERRITORIES,
  territoryIndex,
  type MutationId,
} from './engine/constants';
import { classGroup, dominantGroup } from './engine/parts';
import { initAudio, setMusicState, sfx } from './audio';
import { createSim, step, type PlayerInput, type Prop, type SimState } from './engine/sim';
import { createRng, type Rng } from './engine/rng';
import type { ActiveSlot, AxieClass, CatalogAxie, Part } from './engine/types';

const CLASS_COLOR: Record<AxieClass, number> = {
  beast: 0xf6b73c,
  bug: 0xe0455a,
  aquatic: 0x3aa8e0,
  bird: 0xf29ac0,
  plant: 0x6fce62,
  reptile: 0xa76fe8,
};

const boot = document.getElementById('boot');
const IS_TOUCH = matchMedia('(pointer: coarse)').matches;

// ── i18n: el jurado no habla español — auto-detección por navegador + toggle
// en el título (persistido). El motor NO emite texto de UI: los contratos se
// redactan aquí desde sus campos, y territorios/mutaciones se mapean por id.
type Lang = 'es' | 'en';
const LANG: Lang = (() => {
  const saved = localStorage.getItem('quimera.lang');
  if (saved === 'es' || saved === 'en') return saved;
  return (navigator.language ?? 'en').toLowerCase().startsWith('es') ? 'es' : 'en';
})();
const STRINGS = {
  es: {
    terr: ['LOS PRADOS', 'EL MAR DE POLVO', 'LA CICATRIZ'],
    slot: { mouth: 'BOCA', horn: 'CUERNO', tail: 'COLA', back: 'DORSO' },
    ult: { beast: '¡RUGIDO!', aquatic: '¡MAREA!', plant: '¡ESPORAS!', bird: '¡TORMENTA!', bug: '¡PLAGA!', reptile: '¡PARÁLISIS!' },
    mut: {
      sed: { name: 'SED DE PODER', desc: '+10% daño (acumulable)' },
      furia: { name: 'FURIA HERIDA', desc: '+25% daño con vida baja' },
      piel: { name: 'PIEL DE ROCA', desc: '−15% daño recibido (acumulable)' },
      voraz: { name: 'VORAZ', desc: 'devorar cura +12 extra' },
      zarpa: { name: 'ZARPA LARGA', desc: 'el zarpazo cierra +0.8 más lejos' },
      reflejos: { name: 'REFLEJOS', desc: 'la esquiva recarga 35% más rápido' },
      carronera: { name: 'CARROÑERA', desc: 'los derribos duran +1 s' },
      cazadora: { name: 'CAZADORA', desc: '+9% velocidad (acumulable)' },
    },
    tagline: 'El Primordial te despedazó. Recupérate parte por parte.',
    cardHunt: ['CAZA', 'las presas huyen de ti — persíguelas y derríbalas'],
    cardAbsorb: ['ABSORBE', 'sus partes REALES se injertan en tu cuerpo'],
    cardSurvive: ['SOBREVIVE', '3 territorios; devora al Primordial al final'],
    controlsTouch: 'mitad izquierda: joystick · botones: atacar y esquivar',
    controlsDesk: 'WASD mover · Space esquiva · LMB boca · RMB cuerno · E cola · Q dorso',
    wake: (touch: boolean) => (touch ? '— TOCA PARA DESPERTAR —' : '— CLICK PARA DESPERTAR —'),
    axiePlaceholder: 'ID de tu Axie (opcional)',
    axieBtn: 'CAZAR CON MI AXIE',
    axieBad: 'escribe el número de ID (p. ej. 11423061)',
    axieSearching: 'buscando en Lunacia…',
    axieRetry: 'aún despertando, reintenta',
    axieNotFound: 'no se encontró ese Axie (¿sin conexión?)',
    axieOk: (id: string, h: string) => `✓ tu Quimera nace del Axie #${id}${h} — click para cazar`,
    axieHistory: (runs: number, best: number) => ` (${runs} cacerías, su récord ${best})`,
    axieTag: (id: string) => `QUIMERA DEL AXIE #${id}`,
    startIn: 'EMPEZAR LA CACERÍA EN:',
    dailyBtn: '🌙 CACERÍA DEL DÍA',
    dailyHint: 'misma luna para TODOS hoy — compite por el récord y compártelo',
    bestiaryBtn: 'BESTIARIO',
    bestiaryTitle: 'BESTIARIO',
    bestiarySub: (n: number, t: number) => `${n} / ${t} partes absorbidas · toca para cerrar`,
    bestiaryMarket: 'cada parte absorbida es REAL — tócala: copia su nombre y abre el marketplace (pégalo en el filtro Parts) ↗',
    bestiaryToast: (id: string, n: number, t: number) => `☑ bestiario: ${id} (${n}/${t})`,
    tut: (touch: boolean) =>
      touch
        ? ['ARRASTRA en la mitad izquierda para MOVERTE', 'PERSIGUE a una presa y ATACA con los botones', 'SÍGUELE PEGANDO hasta DERRIBARLA', 'sobre la caída: toca una PARTE para ABSORBERLA<br>…o DEVORAR para curarte', '¡Eso es todo! CAZA · ABSORBE · SOBREVIVE']
        : ['MUÉVETE con WASD', 'PERSIGUE a una presa y MUERDE con CLICK IZQUIERDO', 'SÍGUELE PEGANDO hasta DERRIBARLA', 'sobre la caída: CLICK en una PARTE para ABSORBERLA<br>…o DEVORAR (F) para curarte', '¡Eso es todo! CAZA · ABSORBE · SOBREVIVE'],
    wave: (w: number, f: number) => `MANADA ${w} / ${f}`,
    waveFinal: 'LA GUARIDA FINAL',
    primordialCome: 'EL ALFA PRIMORDIAL',
    primordialFall: 'EL PRIMORDIAL CAE',
    travel: 'LA QUIMERA VIAJA…',
    golden: '✨ ¡PRESA DORADA!',
    scarredToast: (id: string) => `☠ CICATRIZADA${id ? ` #${id}` : ''} — te recuerda`,
    scarWarn: (id: string) => `☠ la presa #${id} escapó otra vez… te recordará`,
    revenge: '☠ VENGANZA CUMPLIDA',
    apexOn: '★ APEX ★',
    synergy: 'SINERGIA',
    crit: '¡CRÍTICO!',
    perfect: '¡PERFECTA!',
    crashed: '¡SE ESTRELLÓ! ✶✶',
    contractPrefix: 'CONTRATO: ',
    contractDone: '¡CONTRATO CUMPLIDO!',
    contractFail: '✗ contrato perdido',
    contractKnock: (n: number, cls: string) => `derriba ${n} presas ${cls}`,
    contractAbsorb: (g: string) => `absorbe una parte del grupo ${g}`,
    contractNoDevour: 'cruza este territorio sin devorar',
    contractMeteor: 'derriba 1 presa con un meteorito',
    moltTitle: 'LA MUDA',
    moltSub: 'tu cuerpo quiere cambiar — elige',
    devourBtn: 'DEVORAR',
    devourHold: 'DEVORAR (mantén)',
    devouring: 'devorando…',
    ripping: (s: string) => `arrancando ${s}…`,
    hvHelpDesk: 'mantén <b>click</b> en una parte: ARRANCAR (injerta)<br>mantén <b>F</b>: DEVORAR (cura)',
    hvHelpTouch: 'toca una parte: <b>ABSORBER</b><br>toca <b>DEVORAR</b>: cura',
    hvHelpDesk2: 'click en una parte: <b>ABSORBER</b><br>click <b>DEVORAR</b> (o mantén F): cura',
    dodgeBtn: 'ESQUIVA',
    dead: 'LA QUIMERA CAE',
    deadHint: 'R (o toca) para renacer · B = bestiario',
    win: 'LUNACIA ES TUYA',
    winHint: 'el monstruo que construiste · R para cazar de nuevo',
    shareDead: 'COMPARTIR MI CACERÍA',
    shareWin: 'COMPARTIR MI CONQUISTA',
    shared: '✓ COPIADO',
    shareText: (win: boolean, wave: number) => (win ? '¡LUNACIA ES MÍA!' : `caí en la oleada ${wave}`),
    shareWith: (id: string) => ` con mi Axie #${id}`,
    shareDaily: ' · CACERÍA DEL DÍA',
    points: 'PUNTOS',
    record: (b: number) => `récord ${b}`,
    newRecord: 'RÉCORD NUEVO',
    statsAxie: (id: string, runs: number, best: number) => ` · axie #${id}: cacería nº${runs}, su récord ${best}`,
    statsBestiary: (n: number, t: number) => `bestiario ${n}/${t}`,
    kbhint:
      'WASD mover · cursor elige presa · rueda = zoom · click sostenido + arrastrar (o ←→) gira la cámara · Space esquiva · LMB boca · RMB cuerno · E cola · Q dorso · R reiniciar · H modo foto<br>presa derribada: click en una parte = ABSORBER · click DEVORAR (o F) = curar',
    webglFail: 'tu navegador no pudo crear WebGL — el juego lo necesita.<br>prueba Chrome, Edge o Safari actualizados (y sin modo de ahorro extremo de batería).',
    langBtn: 'IN ENGLISH',
    guardian: (terr: string) => `GUARDIÁN DE ${terr}`,
    streak: (n: number) => `¡RACHA ×${n}!`,
    titleRecord: (best: number, parts: number) => `TU RÉCORD ${best} · BESTIARIO ${parts}`,
    followBeacon: 'sigue la SEÑAL dorada hasta la manada',
    roverOn: '🛞 ROVER — a toda velocidad (atacar desmonta)',
    roverOff: '🛞 rover aparcado',
    pickupNames: { relic: '⬥ RELIQUIA LUNAR', heal: '⬥ CRISTAL DE VIDA', ult: '⬥ NÚCLEO DE PODER', fang: '⚔ FIERRO' },
    weaponNames: ['TUBO DE LA ESTACIÓN', 'LLAVE DE MISIÓN', 'PUNTAL DEL CASCO'],
    weaponGrab: (n: string) => `⚔ ¡${n}!`,
    weaponBroke: '⚔ el fierro se rompió de tanto madrazo…',
    secondWind: '¡INSTINTO SALVAJE!',
    fastClear: '⚡ CAZA VELOZ +100',
    bountyToast: '◎ hay una PRESA MARCADA en la manada',
    bountyDown: '◎ MARCADA +150',
    goldenMolt: '★ MUDA DORADA: DOBLE ★',
    revancha: 'REVANCHA (misma luna)',
    streakTitle: (n: number) => `🔥 RACHA ${n} DÍAS`,
    gestasTitle: (n: number, t: number) => `🏅 GESTAS ${n}/${t}`,
    gestaToast: (name: string) => `🏅 GESTA: ${name}`,
    gestas: {
      primer_injerto: 'PRIMER INJERTO',
      apex: 'DEPREDADOR APEX',
      dorada: 'CAZADOR DE DORADAS',
      venganza: 'VENGANZA CUMPLIDA',
      guardian: 'MATA-GUARDIANES',
      victoria: 'LUNACIA ES TUYA',
      coleccionista: 'COLECCIONISTA (20 partes)',
      jinete: 'JINETE LUNAR',
    },
    taunts: [
      ['«¿Eso es todo lo que juntaste?»', '«Ni siquiera oliste mi territorio.»', '«Vuelve cuando tengas más partes que miedo.»', '«Los Prados te comieron a ti.»', '«Una quimera de una sola boca. Qué tierno.»'],
      ['«Llegaste lejos… para ser un remiendo.»', '«El Mar de Polvo guarda tus huesos.»', '«Casi hueles la Cicatriz. Casi.»', '«Cada parte que robaste volverá a mí.»', '«Te faltó hambre.»'],
      ['«…empiezas a preocuparme, remiendo.»', '«Estuviste a un zarpazo. Lo sentí.»', '«La Cicatriz recordará tu sangre.»', '«La próxima vez, tráeme esa furia completa.»', '«Nadie había llegado tan hondo. Nadie sale.»'],
    ],
    winLines: ['«Bien cazado… remiendo. Lunacia… es tuya.»', '«Al fin… un monstruo digno de mi trono.»', '«Cada parte que me robaste… úsala bien.»', '«No eras presa. Nunca fuiste presa.»', '«Recuérdame… cuando algo te cace a ti.»'],
  },
  en: {
    terr: ['THE MEADOWS', 'THE DUST SEA', 'THE SCAR'],
    slot: { mouth: 'MOUTH', horn: 'HORN', tail: 'TAIL', back: 'BACK' },
    ult: { beast: 'ROAR!', aquatic: 'TIDE!', plant: 'SPORES!', bird: 'STORM!', bug: 'PLAGUE!', reptile: 'PARALYSIS!' },
    mut: {
      sed: { name: 'THIRST FOR POWER', desc: '+10% damage (stacks)' },
      furia: { name: 'WOUNDED FURY', desc: '+25% damage at low HP' },
      piel: { name: 'STONE HIDE', desc: '−15% damage taken (stacks)' },
      voraz: { name: 'VORACIOUS', desc: 'devouring heals +12 extra' },
      zarpa: { name: 'LONG CLAW', desc: 'strikes lunge +0.8 farther' },
      reflejos: { name: 'REFLEXES', desc: 'dodge recharges 35% faster' },
      carronera: { name: 'SCAVENGER', desc: 'knockdowns last +1 s' },
      cazadora: { name: 'HUNTRESS', desc: '+9% speed (stacks)' },
    },
    tagline: 'The Primordial tore you apart. Rebuild yourself, part by part.',
    cardHunt: ['HUNT', 'prey flee from YOU — chase them down'],
    cardAbsorb: ['ABSORB', 'their REAL parts graft onto your body'],
    cardSurvive: ['SURVIVE', '3 territories; devour the Primordial at the end'],
    controlsTouch: 'left half: joystick · buttons: attack & dodge',
    controlsDesk: 'WASD move · Space dodge · LMB mouth · RMB horn · E tail · Q back',
    wake: (touch: boolean) => (touch ? '— TAP TO AWAKEN —' : '— CLICK TO AWAKEN —'),
    axiePlaceholder: 'Your Axie ID (optional)',
    axieBtn: 'HUNT AS MY AXIE',
    axieBad: 'type the ID number (e.g. 11423061)',
    axieSearching: 'searching Lunacia…',
    axieRetry: 'still waking up, retry',
    axieNotFound: 'Axie not found (offline?)',
    axieOk: (id: string, h: string) => `✓ your Chimera is born from Axie #${id}${h} — click to hunt`,
    axieHistory: (runs: number, best: number) => ` (${runs} hunts, its best ${best})`,
    axieTag: (id: string) => `CHIMERA OF AXIE #${id}`,
    startIn: 'START THE HUNT IN:',
    dailyBtn: '🌙 DAILY HUNT',
    dailyHint: 'same moon for EVERYONE today — compete for the record and share it',
    bestiaryBtn: 'BESTIARY',
    bestiaryTitle: 'BESTIARY',
    bestiarySub: (n: number, t: number) => `${n} / ${t} parts absorbed · tap to close`,
    bestiaryMarket: 'every absorbed part is REAL — tap it: copies its name and opens the marketplace (paste it in the Parts filter) ↗',
    bestiaryToast: (id: string, n: number, t: number) => `☑ bestiary: ${id} (${n}/${t})`,
    tut: (touch: boolean) =>
      touch
        ? ['DRAG on the left half to MOVE', 'CHASE a prey and ATTACK with the buttons', 'KEEP HITTING until it is KNOCKED DOWN', 'over the fallen: tap a PART to ABSORB it<br>…or DEVOUR to heal', "That's it! HUNT · ABSORB · SURVIVE"]
        : ['MOVE with WASD', 'CHASE a prey and BITE with LEFT CLICK', 'KEEP HITTING until it is KNOCKED DOWN', 'over the fallen: CLICK a PART to ABSORB it<br>…or DEVOUR (F) to heal', "That's it! HUNT · ABSORB · SURVIVE"],
    wave: (w: number, f: number) => `HERD ${w} / ${f}`,
    waveFinal: 'THE FINAL LAIR',
    primordialCome: 'THE PRIMORDIAL ALPHA',
    primordialFall: 'THE PRIMORDIAL FALLS',
    travel: 'THE CHIMERA TRAVELS…',
    golden: '✨ GOLDEN PREY!',
    scarredToast: (id: string) => `☠ SCARRED${id ? ` #${id}` : ''} — it remembers you`,
    scarWarn: (id: string) => `☠ prey #${id} escaped again… it will remember you`,
    revenge: '☠ VENGEANCE FULFILLED',
    apexOn: '★ APEX ★',
    synergy: 'SYNERGY',
    crit: 'CRITICAL!',
    perfect: 'PERFECT!',
    crashed: 'CRASHED! ✶✶',
    contractPrefix: 'CONTRACT: ',
    contractDone: 'CONTRACT FULFILLED!',
    contractFail: '✗ contract lost',
    contractKnock: (n: number, cls: string) => `knock down ${n} ${cls} prey`,
    contractAbsorb: (g: string) => `absorb a part of the ${g} group`,
    contractNoDevour: 'cross this territory without devouring',
    contractMeteor: 'knock down 1 prey with a meteor',
    moltTitle: 'THE MOLT',
    moltSub: 'your body wants to change — choose',
    devourBtn: 'DEVOUR',
    devourHold: 'DEVOUR (hold)',
    devouring: 'devouring…',
    ripping: (s: string) => `tearing off ${s}…`,
    hvHelpDesk: 'hold <b>click</b> on a part: TEAR OFF (grafts)<br>hold <b>F</b>: DEVOUR (heals)',
    hvHelpTouch: 'tap a part: <b>ABSORB</b><br>tap <b>DEVOUR</b>: heal',
    hvHelpDesk2: 'click a part: <b>ABSORB</b><br>click <b>DEVOUR</b> (or hold F): heal',
    dodgeBtn: 'DODGE',
    dead: 'THE CHIMERA FALLS',
    deadHint: 'R (or tap) to be reborn · B = bestiary',
    win: 'LUNACIA IS YOURS',
    winHint: 'the monster you built · R to hunt again',
    shareDead: 'SHARE MY HUNT',
    shareWin: 'SHARE MY CONQUEST',
    shared: '✓ COPIED',
    shareText: (win: boolean, wave: number) => (win ? 'LUNACIA IS MINE!' : `I fell on wave ${wave}`),
    shareWith: (id: string) => ` with my Axie #${id}`,
    shareDaily: ' · DAILY HUNT',
    points: 'SCORE',
    record: (b: number) => `best ${b}`,
    newRecord: 'NEW RECORD',
    statsAxie: (id: string, runs: number, best: number) => ` · axie #${id}: hunt #${runs}, its best ${best}`,
    statsBestiary: (n: number, t: number) => `bestiary ${n}/${t}`,
    kbhint:
      'WASD move · cursor picks prey · wheel = zoom · hold click + drag (or ←→) orbits the camera · Space dodge · LMB mouth · RMB horn · E tail · Q back · R restart · H photo mode<br>knocked prey: click a part = ABSORB · click DEVOUR (or F) = heal',
    webglFail: 'your browser could not create WebGL — the game needs it.<br>try an up-to-date Chrome, Edge or Safari (and disable extreme battery saver).',
    langBtn: 'EN ESPAÑOL',
    guardian: (terr: string) => `GUARDIAN OF ${terr}`,
    streak: (n: number) => `STREAK ×${n}!`,
    titleRecord: (best: number, parts: number) => `YOUR BEST ${best} · BESTIARY ${parts}`,
    followBeacon: 'follow the golden BEACON to the herd',
    roverOn: '🛞 ROVER — full speed (attacking dismounts)',
    roverOff: '🛞 rover parked',
    pickupNames: { relic: '⬥ LUNAR RELIC', heal: '⬥ LIFE CRYSTAL', ult: '⬥ POWER CORE', fang: '⚔ SCRAP WEAPON' },
    weaponNames: ['STATION PIPE', 'MISSION WRENCH', 'HULL STRUT'],
    weaponGrab: (n: string) => `⚔ ${n}!`,
    weaponBroke: '⚔ the weapon broke from all that smashing…',
    secondWind: 'FERAL INSTINCT!',
    fastClear: '⚡ SWIFT HUNT +100',
    bountyToast: '◎ there is a MARKED PREY in the herd',
    bountyDown: '◎ MARKED +150',
    goldenMolt: '★ GOLDEN MOLT: DOUBLE ★',
    revancha: 'REMATCH (same moon)',
    streakTitle: (n: number) => `🔥 ${n}-DAY STREAK`,
    gestasTitle: (n: number, t: number) => `🏅 FEATS ${n}/${t}`,
    gestaToast: (name: string) => `🏅 FEAT: ${name}`,
    gestas: {
      primer_injerto: 'FIRST GRAFT',
      apex: 'APEX PREDATOR',
      dorada: 'GOLDEN HUNTER',
      venganza: 'VENGEANCE FULFILLED',
      guardian: 'GUARDIAN SLAYER',
      victoria: 'LUNACIA IS YOURS',
      coleccionista: 'COLLECTOR (20 parts)',
      jinete: 'MOON RIDER',
    },
    taunts: [
      ['"Is that all you gathered?"', '"You never even smelled my territory."', '"Come back with more parts than fear."', '"The Meadows ate YOU."', '"A one-mouth chimera. How cute."'],
      ['"You got far… for a patchwork."', '"The Dust Sea keeps your bones."', '"You almost smelled the Scar. Almost."', '"Every part you stole will return to me."', '"You lacked hunger."'],
      ['"…you are starting to worry me, patchwork."', '"You were one claw away. I felt it."', '"The Scar will remember your blood."', '"Next time, bring me that fury whole."', '"No one had come this deep. No one leaves."'],
    ],
    winLines: ['"Well hunted… patchwork. Lunacia… is yours."', '"At last… a monster worthy of my throne."', '"Every part you stole from me… use it well."', '"You were never prey. Never."', '"Remember me… when something hunts YOU."'],
  },
} as const;
const T = STRINGS[LANG];
/** El motor guarda el contrato como datos; la UI lo redacta en su idioma. */
function contractText(c: { kind: string; cls?: string; group?: string; target: number }): string {
  switch (c.kind) {
    case 'knock_class':
      return T.contractKnock(c.target, c.cls ?? '');
    case 'absorb_group':
      return T.contractAbsorb(c.group ?? '');
    case 'no_devour':
      return T.contractNoDevour;
    default:
      return T.contractMeteor;
  }
}

// ── Escena ──
// Sin WebGL no hay juego: mejor un mensaje claro que un "despertando…" eterno
// (visto en QA headless: THREE lanza al crear el contexto y el boot se colgaba)
function createRenderer(): THREE.WebGLRenderer {
  try {
    return new THREE.WebGLRenderer({ antialias: true });
  } catch (error) {
    if (boot) {
      boot.innerHTML =
        '<div><div style="font-size:22px;letter-spacing:4px;margin-bottom:10px">QUIMERA</div>' +
        T.webglFail +
        '</div>';
    }
    throw error;
  }
}
const renderer = createRenderer();
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; // look fílmico: colores ricos
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; // rocas y decoración anclan el mundo con sombra
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1024);
// niebla color horizonte: el mar lunar se funde con el cielo, sin costura
scene.fog = new THREE.Fog(0x1c1440, 32, 125);

// far 160 → 300: la Tierra-horizonte y el domo viven lejos (la niebla sigue
// ocultando el terreno distante; lo celeste tiene fog:false)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 300);

const hemiLight = new THREE.HemisphereLight(0xcfd8ff, 0x2a2a3e, 1.5);
scene.add(hemiLight);
// sol direccional: la escenografía estática proyecta sombras suaves (los rigs
// del mixer usan shaders propios — sus sombras son blobs falsos, ver abajo)
const dirLight = new THREE.DirectionalLight(0xfff2d8, 1.05);
dirLight.position.set(30, 44, -36);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(1024, 1024);
dirLight.shadow.camera.left = -27;
dirLight.shadow.camera.right = 27;
dirLight.shadow.camera.top = 27;
dirLight.shadow.camera.bottom = -27;
dirLight.shadow.camera.near = 10;
dirLight.shadow.camera.far = 130;
dirLight.shadow.bias = -0.0006;
scene.add(dirLight);
const moonlight = new THREE.DirectionalLight(0xdfe8ff, 1.8);
moonlight.position.set(4, 9, 5);
scene.add(moonlight);

// La Tierra en el horizonte (estamos parados en la Luna) — textura procedural
function makeEarthTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1d55a0';
  g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 14; i += 1) {
    // continentes: manchas verdes/ocres irregulares
    const x = Math.random() * 256;
    const y = 15 + Math.random() * 98;
    g.fillStyle = Math.random() < 0.6 ? '#3f7a3a' : '#8a7a45';
    for (let j = 0; j < 6; j += 1) {
      g.beginPath();
      g.arc(x + (Math.random() - 0.5) * 34, y + (Math.random() - 0.5) * 20, 5 + Math.random() * 13, 0, Math.PI * 2);
      g.fill();
    }
  }
  // casquetes polares y nubes
  g.fillStyle = 'rgba(240,248,255,0.9)';
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 118, 256, 10);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 26; i += 1) {
    g.beginPath();
    g.ellipse(Math.random() * 256, Math.random() * 128, 8 + Math.random() * 22, 3 + Math.random() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const earthMat = new THREE.MeshStandardMaterial({ map: makeEarthTexture(), roughness: 1 });
earthMat.fog = false; // el cielo no se traga con la niebla de la arena
// ── CIELO INFINITO: todo lo celeste vive en un grupo que SIGUE al jugador —
// se ve igual desde cualquier punto de la luna y jamás se alcanza caminando
// (antes la Tierra estaba clavada en el mundo y podías pararte debajo, jaja)
const skyGroup = new THREE.Group();
scene.add(skyGroup);

// EARTHRISE (pedido de Luis): la Tierra ENORME asomándose sobre el horizonte —
// lejos, baja y gigante, como en la foto del Apolo. Inalcanzable (skyGroup).
const earth = new THREE.Mesh(new THREE.SphereGeometry(22, 48, 48), earthMat);
earth.position.set(-46, 33, -100);
skyGroup.add(earth);
const atmoMat = new THREE.MeshBasicMaterial({
  color: 0x7fb4ff,
  transparent: true,
  opacity: 0.18,
  side: THREE.BackSide,
});
atmoMat.fog = false;
const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(23.2, 48, 48), atmoMat);
atmosphere.position.copy(earth.position);
skyGroup.add(atmosphere);

// El Sol: disco cegador + halo (sprite con gradiente radial), lejísimos
{
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  sunMat.fog = false;
  const sun = new THREE.Mesh(new THREE.SphereGeometry(4.2, 24, 24), sunMat);
  sun.position.set(58, 26, -88);
  skyGroup.add(sun);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 6, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,246,216,0.9)');
  grad.addColorStop(0.35, 'rgba(255,220,150,0.28)');
  grad.addColorStop(1, 'rgba(255,220,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const haloMat = new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(c),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  haloMat.fog = false;
  const halo = new THREE.Sprite(haloMat);
  halo.position.copy(sun.position);
  halo.scale.setScalar(30);
  skyGroup.add(halo);
}

// ── RELIEVE LUNAR (9 sep, Luis: "todo es plano, no siento la luna") ──
// Ondulación suave y DETERMINISTA bajo el área jugable. El motor sigue siendo
// 2D puro: esta altura es solo visual, y TODO lo que pisa la luna (Quimera,
// presas, rocas, gemas, rover, faro, huellas…) se asienta sobre ella.
function terrainY(x: number, z: number): number {
  return (
    Math.sin(x * 0.035) * Math.cos(z * 0.041) * 0.95 +
    Math.sin(x * 0.013 + z * 0.017) * 1.35 +
    Math.cos(x * 0.083) * Math.sin(z * 0.074) * 0.3
  );
}

let groundMat: THREE.MeshStandardMaterial; // el territorio le cambia el color
// Suelo lunar: textura procedural (cráteres y manchas) — sin ella el piso es
// una plancha negra y el movimiento no se percibe (cero paralaje).
function makeGroundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2a2f4a';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 160; i += 1) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 4 + Math.random() * 26;
    const light = Math.random() < 0.45;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, light ? 'rgba(120,130,185,0.28)' : 'rgba(8,10,22,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Terreno lunar: la arena de caza es plana; alrededor, el mar lunar de verdad —
// cráteres con borde, colinas suaves y la curvatura del horizonte cayendo lejos.
{
  const SIZE = 640; // la luna abierta v2 (r120): el horizonte queda lejos
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, 150, 150);
  const flatRadius = ARENA_RADIUS + 3;
  // cráteres fuera de la zona jugable (tazón + borde levantado)
  const craters: Array<{ x: number; z: number; r: number; depth: number }> = [];
  for (let i = 0; i < 16; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const dist = flatRadius + 9 + Math.random() * 95;
    const r = 3 + Math.random() * 11;
    craters.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      r,
      depth: r * (0.18 + Math.random() * 0.14),
    });
  }
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = -pos.getY(i); // el plano se rota a horizontal después
    const d = Math.hypot(x, z);
    const rolling = terrainY(x, z); // la luna ONDULA también donde se juega
    if (d <= flatRadius) {
      pos.setZ(i, rolling);
      continue;
    }
    const t = d - flatRadius;
    // curvatura del horizonte + colinas que crecen con la distancia
    let y = -t * t * 0.0011;
    y += (Math.sin(x * 0.09) * Math.cos(z * 0.075) + Math.sin(x * 0.05 + z * 0.06)) *
      Math.min(1, t / 22) * 2.1;
    for (const c of craters) {
      const u = Math.hypot(x - c.x, z - c.z) / c.r;
      if (u < 1) y += -c.depth * (1 - u * u); // tazón
      else if (u < 1.4) y += c.depth * 0.4 * (1 - (u - 1) / 0.4); // borde levantado
    }
    // transición suave desde el borde de la zona jugable (ondulación se funde)
    pos.setZ(i, y * Math.min(1, t / 6) + rolling * Math.max(0, 1 - t / 20));
  }
  geo.computeVertexNormals();
  const tex = makeGroundTexture();
  tex.repeat.set(58, 58);
  groundMat = new THREE.MeshStandardMaterial({ color: 0xaeb6da, map: tex, roughness: 1 });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

const rimMat = new THREE.MeshBasicMaterial({ color: 0x7f8cd9, side: THREE.DoubleSide });
const rim = new THREE.Mesh(new THREE.RingGeometry(ARENA_RADIUS - 0.2, ARENA_RADIUS, 96), rimMat);
rim.rotation.x = -Math.PI / 2;
rim.position.y = 0.02;
scene.add(rim);

// Guijarros decorativos chicos (no bloquean; las rocas GRANDES vienen del motor)
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const rockMat = new THREE.MeshStandardMaterial({
  color: 0x4a5178,
  roughness: 0.95,
  flatShading: true,
});
{
  for (let i = 0; i < 72; i += 1) {
    const pebble = new THREE.Mesh(rockGeo, rockMat);
    const angle = Math.random() * Math.PI * 2;
    const radius = 5 + Math.random() * (ARENA_RADIUS - 4);
    const s = 0.12 + Math.random() * 0.22;
    pebble.position.set(Math.cos(angle) * radius, s * 0.3, Math.sin(angle) * radius);
    pebble.position.y += terrainY(pebble.position.x, pebble.position.z);
    pebble.scale.set(s, s * 0.55, s);
    pebble.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.5);
    scene.add(pebble);
  }
}

// cristal compartido: su latido se anima una sola vez en el loop
const crystalMat = new THREE.MeshStandardMaterial({
  color: 0x9a5cff,
  emissive: 0x5a2fa0,
  emissiveIntensity: 0.8,
  roughness: 0.3,
});

/** Rocas-obstáculo: exactamente donde el motor las puso (colisionan).
 * Su FORMA cambia por territorio: peñascos (Prados), lajas apiladas (Mar de
 * Polvo), agujas afiladas (la Cicatriz) — el viaje se ve, no solo se anuncia. */
const shardGeo = new THREE.ConeGeometry(1, 2.4, 5);
// geometría de cristal COMPARTIDA (antes se creaba una por roca en cada cambio
// de territorio y jamás se disponía: fuga lenta de GPU)
const crystalGeo = new THREE.OctahedronGeometry(1);
const obstacleMeshes: THREE.Object3D[] = [];
function buildObstacleRocks(
  obstacles: readonly { x: number; y: number; r: number }[],
  terrIdx = 0,
): void {
  for (const m of obstacleMeshes) scene.remove(m); // cada run, otra luna
  obstacleMeshes.length = 0;
  const add = (m: THREE.Object3D) => {
    m.castShadow = true;
    m.position.y += terrainY(m.position.x, m.position.z); // asentar en el relieve
    scene.add(m);
    obstacleMeshes.push(m);
  };
  for (const o of obstacles) {
    if (terrIdx === 2) {
      // LA CICATRIZ: agujas de roca muerta, torcidas
      const shard = new THREE.Mesh(shardGeo, rockMat);
      shard.position.set(o.x, o.r * 0.9, o.y);
      shard.scale.set(o.r * 0.75, o.r * 0.95, o.r * 0.75);
      shard.rotation.set(Math.sin(o.x) * 0.22, o.y * 0.7, Math.cos(o.y) * 0.22);
      add(shard);
      const side = new THREE.Mesh(shardGeo, rockMat);
      side.position.set(o.x + o.r * 0.5, o.r * 0.4, o.y - o.r * 0.3);
      side.scale.set(o.r * 0.35, o.r * 0.5, o.r * 0.35);
      side.rotation.set(0.35, o.x, -0.3);
      add(side);
    } else if (terrIdx === 1) {
      // EL MAR DE POLVO: lajas erosionadas apiladas
      const slab = new THREE.Mesh(rockGeo, rockMat);
      slab.position.set(o.x, o.r * 0.28, o.y);
      slab.scale.set(o.r * 1.2, o.r * 0.5, o.r * 0.95);
      slab.rotation.set(0.08, o.y * 0.7, 0.05);
      add(slab);
      const top = new THREE.Mesh(rockGeo, rockMat);
      top.position.set(o.x + o.r * 0.15, o.r * 0.68, o.y - o.r * 0.1);
      top.scale.set(o.r * 0.8, o.r * 0.32, o.r * 0.65);
      top.rotation.set(-0.06, o.x * 1.3, 0.1);
      add(top);
    } else {
      // LOS PRADOS: peñascos redondeados (la forma original)
      const rock = new THREE.Mesh(rockGeo, rockMat);
      rock.position.set(o.x, o.r * 0.45, o.y);
      rock.scale.set(o.r, o.r * 0.85, o.r);
      rock.rotation.set(o.x * 1.3, o.y * 0.7, 0.3);
      add(rock);
    }
    // algunos con cristal encima (color por territorio; late en el loop)
    if ((o.x + o.y) % 2 > 0.8) {
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      crystal.scale.setScalar(o.r * 0.35);
      crystal.position.set(o.x, o.r * (terrIdx === 2 ? 1.6 : 1.05), o.y);
      crystal.rotation.y = o.x;
      add(crystal);
    }
  }
}

// ── Decoración por territorio (visual, no colisiona): el suelo cuenta el bioma ──
const decorMeshes: THREE.Object3D[] = [];
const decorMats: THREE.Material[] = [];
const decorGeos: THREE.BufferGeometry[] = [];
/** Luces de emergencia de los restos: parpadean en el loop. */
const blinkMats: THREE.MeshBasicMaterial[] = [];
function buildTerritoryDecor(terrIdx: number, props: readonly Prop[] = []): void {
  for (const m of decorMeshes) scene.remove(m);
  decorMeshes.length = 0;
  for (const m of decorMats) m.dispose();
  decorMats.length = 0;
  for (const g of decorGeos) g.dispose();
  decorGeos.length = 0;
  blinkMats.length = 0; // sus materiales viven en decorMats (ya dispuestos)
  const spot = (maxR: number): [number, number] => {
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * (maxR - 3);
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const add = (m: THREE.Object3D, shadow = true) => {
    m.castShadow = shadow;
    m.position.y += terrainY(m.position.x, m.position.z); // asentar en el relieve
    scene.add(m);
    decorMeshes.push(m);
  };
  // cráteres 3D por toda la luna: geometría real, del color del terreno — la
  // luz y las sombras hacen el trabajo (sin decals, tercera es la vencida)
  {
    const groundTint = new THREE.Color(
      TERR_PALETTE[Math.min(terrIdx, TERR_PALETTE.length - 1)]!.ground,
    ).multiplyScalar(0.88);
    const craterMat = new THREE.MeshStandardMaterial({
      color: groundTint,
      roughness: 1,
      flatShading: true,
    });
    decorMats.push(craterMat);
    const placed: Array<[number, number, number]> = [];
    let guard = 0;
    while (placed.length < 16 && guard < 120) {
      guard += 1;
      const [x, z] = spot(ARENA_RADIUS + 10);
      const s = 2.5 + Math.random() * 4;
      // sin encimarse ni invadir el punto de partida
      if (placed.some(([px2, pz2, ps]) => Math.hypot(px2 - x, pz2 - z) < (ps + s) * 1.1)) continue;
      if (Math.hypot(x, z) < 12) continue;
      placed.push([x, z, s]);
      const crater = new THREE.Mesh(craterGeo, craterMat);
      crater.position.set(x, 0, z);
      // el borde no crece tan rápido como el radio (los grandes serían murallas)
      crater.scale.set(s, Math.min(s, 3.2), s);
      crater.rotation.y = Math.random() * Math.PI * 2;
      crater.castShadow = true;
      crater.receiveShadow = true;
      add(crater);
    }
  }
  // ── Íconos lunares globales (uno de cada uno por luna): la humanidad pasó por aquí ──
  {
    // LA BANDERA plantada — tiesa: no hay viento que la ondee
    const flagProp = props.find((pp) => pp.kind === 'flag');
    const [fx, fz] = flagProp ? [flagProp.x, flagProp.y] : spot(ARENA_RADIUS - 10);
    const flag = new THREE.Group();
    flag.position.set(fx, 0, fz);
    flag.rotation.y = Math.random() * Math.PI * 2;
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xd8dce8, roughness: 0.4, metalness: 0.6 });
    const poleGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6);
    const clothMat = new THREE.MeshStandardMaterial({ color: 0x9a5cff, roughness: 0.9, side: THREE.DoubleSide });
    const clothGeo = new THREE.PlaneGeometry(1.0, 0.62);
    decorMats.push(poleMat, clothMat);
    decorGeos.push(poleGeo, clothGeo);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.2;
    const cloth = new THREE.Mesh(clothGeo, clothMat);
    cloth.position.set(0.52, 2.05, 0);
    cloth.rotation.x = 0.06; // rígida, apenas doblada — la broma lunar clásica
    flag.add(pole, cloth);
    flag.traverse((m) => { m.castShadow = true; });
    add(flag);
  }
  {
    // EL MÓDULO DE ATERRIZAJE: patas, cuerpo de foil dorado… y huellas alrededor
    const landerProp = props.find((pp) => pp.kind === 'lander');
    const [lx, lz] = landerProp ? [landerProp.x, landerProp.y] : spot(ARENA_RADIUS - 8);
    const lander = new THREE.Group();
    lander.position.set(lx, 0, lz);
    lander.rotation.y = Math.random() * Math.PI * 2;
    const foilMat = new THREE.MeshStandardMaterial({ color: 0xc8a03a, roughness: 0.35, metalness: 0.8 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x8a8ea0, roughness: 0.6, metalness: 0.5 });
    decorMats.push(foilMat, legMat);
    const bodyGeo = new THREE.CylinderGeometry(0.85, 1.0, 0.9, 8);
    const topGeo = new THREE.CylinderGeometry(0.4, 0.62, 0.55, 8);
    const legGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.5, 6);
    const padGeo = new THREE.CylinderGeometry(0.22, 0.26, 0.08, 8);
    decorGeos.push(bodyGeo, topGeo, legGeo, padGeo);
    const body = new THREE.Mesh(bodyGeo, foilMat);
    body.position.y = 1.15;
    const top = new THREE.Mesh(topGeo, legMat);
    top.position.y = 1.85;
    lander.add(body, top);
    for (let k = 0; k < 4; k += 1) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(Math.cos(a) * 1.15, 0.7, Math.sin(a) * 1.15);
      leg.rotation.z = Math.cos(a) * 0.5;
      leg.rotation.x = -Math.sin(a) * 0.5;
      const pad = new THREE.Mesh(padGeo, legMat);
      pad.position.set(Math.cos(a) * 1.5, 0.05, Math.sin(a) * 1.5);
      lander.add(leg, pad);
    }
    lander.traverse((m) => { m.castShadow = true; });
    add(lander);
    // las huellas de quien bajó — y nunca volvió a subir
    const stepMat = new THREE.MeshBasicMaterial({ map: printTex, transparent: true, opacity: 0.3, depthWrite: false });
    const stepGeo = new THREE.PlaneGeometry(0.24, 0.4);
    decorMats.push(stepMat);
    decorGeos.push(stepGeo);
    let px = lx + 1.8;
    let pz = lz;
    let pa = Math.random() * Math.PI * 2;
    for (let k = 0; k < 12; k += 1) {
      const stepP = new THREE.Mesh(stepGeo, stepMat);
      pa += (Math.random() - 0.5) * 0.5;
      px += Math.cos(pa) * 0.5;
      pz += Math.sin(pa) * 0.5;
      stepP.position.set(px + (k % 2 === 0 ? 0.12 : -0.12), 0.013, pz);
      stepP.rotation.x = -Math.PI / 2;
      stepP.rotation.z = -pa + Math.PI / 2;
      add(stepP, false);
    }
  }
  {
    // EL GRAN CRÁTER: el impacto antiguo — geometría real, con su anillo de escombros
    const craterProp = props.find((pp) => pp.kind === 'crater');
    const [gx, gz] = craterProp ? [craterProp.x, craterProp.y] : spot(ARENA_RADIUS - 14);
    const bigMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(
        TERR_PALETTE[Math.min(terrIdx, TERR_PALETTE.length - 1)]!.ground,
      ).multiplyScalar(0.82),
      roughness: 1,
      flatShading: true,
    });
    decorMats.push(bigMat);
    const big = new THREE.Mesh(craterGeo, bigMat);
    big.position.set(gx, 0, gz);
    big.scale.set(8, 4.2, 8);
    big.castShadow = true;
    big.receiveShadow = true;
    add(big);
    for (let k = 0; k < 9; k += 1) {
      const a = Math.random() * Math.PI * 2;
      const r = 7.5 + Math.random() * 2.5;
      const chunk = new THREE.Mesh(rockGeo, rockMat);
      const s = 0.3 + Math.random() * 0.7;
      chunk.position.set(gx + Math.cos(a) * r, s * 0.35, gz + Math.sin(a) * r);
      chunk.scale.set(s, s * 0.7, s);
      chunk.rotation.set(Math.random(), Math.random() * Math.PI, Math.random() * 0.6);
      add(chunk);
    }
  }
  // ── LANDMARK del territorio: la luna tiene historia (idea de Luis, 8 sep:
  // "vehículos como transbordador, carritos robot" → restos que se encuentran) ──
  // los TRES restos viven SIEMPRE en la luna, donde el motor los colocó (y
  // ahora tienen cuerpo: sus círculos están en el sistema de colisión)
  for (const wreck of ['shuttle', 'antenna', 'monolith'] as const) {
  const prop = props.find((pp) => pp.kind === wreck);
  const lmAngle = Math.random() * Math.PI * 2;
  const lmX = prop ? prop.x : Math.cos(lmAngle) * 30;
  const lmZ = prop ? prop.y : Math.sin(lmAngle) * 30;
  const landmark = new THREE.Group();
  landmark.position.set(lmX, 0, lmZ);
  landmark.rotation.y = Math.atan2(lmX, lmZ) + Math.PI; // de espaldas al centro
  if (wreck === 'shuttle') {
    // transbordador estrellado, semi-enterrado y cubierto de musgo
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.6, metalness: 0.3 });
    const hullGeo = new THREE.CylinderGeometry(0.55, 0.75, 4.2, 10);
    decorMats.push(hullMat);
    decorGeos.push(hullGeo);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.z = Math.PI / 2 - 0.28; // clavado de nariz
    hull.position.y = 0.7;
    landmark.add(hull);
    const finGeo = new THREE.BoxGeometry(0.08, 1.1, 0.7);
    decorGeos.push(finGeo);
    for (const side of [-1, 1]) {
      const fin = new THREE.Mesh(finGeo, hullMat);
      fin.position.set(-1.7, 1.15, side * 0.5);
      fin.rotation.x = side * 0.5;
      landmark.add(fin);
    }
    const mossMat = new THREE.MeshStandardMaterial({ color: 0x5fae6a, roughness: 1 });
    const mossGeo = new THREE.IcosahedronGeometry(0.5, 1);
    decorMats.push(mossMat);
    decorGeos.push(mossGeo);
    const moss = new THREE.Mesh(mossGeo, mossMat);
    moss.scale.set(1.6, 0.5, 1.3);
    moss.position.set(0.7, 0.25, 0);
    landmark.add(moss);
    // detalle: toberas quemadas, cúpula de cabina, surco de arrastre y baliza
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x22242e, roughness: 0.5, metalness: 0.6 });
    const nozzleGeo = new THREE.CylinderGeometry(0.22, 0.34, 0.5, 10);
    decorMats.push(nozzleMat);
    decorGeos.push(nozzleGeo);
    for (const nz of [-0.35, 0.35]) {
      const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
      nozzle.rotation.z = Math.PI / 2 - 0.28;
      nozzle.position.set(1.95, 1.25, nz);
      landmark.add(nozzle);
    }
    const domeGeo = new THREE.SphereGeometry(0.42, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const domeMat = new THREE.MeshStandardMaterial({ color: 0x101828, roughness: 0.15, metalness: 0.7 });
    decorGeos.push(domeGeo);
    decorMats.push(domeMat);
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.set(-1.75, 0.55, 0);
    dome.rotation.z = 1.0;
    landmark.add(dome);
    // surco de arrastre: se estrelló y DERRAPÓ hasta aquí
    const skidMat = new THREE.MeshBasicMaterial({ map: printTex, transparent: true, opacity: 0.4, depthWrite: false });
    decorMats.push(skidMat);
    const skid = new THREE.Mesh(shadowGeo, skidMat);
    skid.rotation.x = -Math.PI / 2;
    skid.position.set(-6.5, 0.014, 0);
    skid.scale.set(2.2, 9, 1);
    skid.rotation.z = Math.PI / 2;
    landmark.add(skid);
    // escombros del casco regados en el surco
    const chipGeo = new THREE.BoxGeometry(0.4, 0.12, 0.3);
    decorGeos.push(chipGeo);
    for (let k = 0; k < 4; k += 1) {
      const chip = new THREE.Mesh(chipGeo, hullMat);
      chip.position.set(-3.5 - k * 2.1, 0.08, (Math.random() - 0.5) * 1.6);
      chip.rotation.y = Math.random() * Math.PI;
      landmark.add(chip);
    }
    // baliza de emergencia: sigue parpadeando después de años
    const beaconMatL = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true });
    decorMats.push(beaconMatL);
    blinkMats.push(beaconMatL);
    const beaconL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), beaconMatL);
    decorGeos.push(beaconL.geometry);
    beaconL.position.set(-1.6, 1.75, 0.5);
    landmark.add(beaconL);
  } else if (wreck === 'antenna') {
    // antena de estación caída (el rover REAL anda por ahí, montable)
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc8, roughness: 0.7, metalness: 0.3 });
    decorMats.push(dishMat);
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 3.4, 8);
    const dishGeo = new THREE.SphereGeometry(1.1, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.4);
    decorGeos.push(poleGeo, dishGeo);
    const pole = new THREE.Mesh(poleGeo, dishMat);
    pole.rotation.z = 1.25; // derribada
    pole.position.set(0, 0.55, 0);
    landmark.add(pole);
    const dish = new THREE.Mesh(dishGeo, dishMat);
    dish.position.set(1.7, 0.65, 0);
    dish.rotation.z = -0.9;
    landmark.add(dish);
  } else {
    // monolito antiguo con la grieta encendida — algo vivió aquí antes
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x241d38, roughness: 1, flatShading: true });
    decorMats.push(stoneMat);
    const stoneGeo = new THREE.BoxGeometry(1.1, 3.6, 0.7);
    decorGeos.push(stoneGeo);
    const stone = new THREE.Mesh(stoneGeo, stoneMat);
    stone.position.y = 1.7;
    stone.rotation.z = 0.06;
    landmark.add(stone);
    const veinMat = new THREE.MeshBasicMaterial({
      color: 0xff4a2a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const veinGeo = new THREE.PlaneGeometry(0.1, 2.8);
    decorMats.push(veinMat);
    decorGeos.push(veinGeo);
    for (const side of [1, -1]) {
      const vein = new THREE.Mesh(veinGeo, veinMat);
      vein.position.set(0.12 * side, 1.7, side * 0.36);
      vein.rotation.y = side > 0 ? 0 : Math.PI;
      vein.rotation.z = side * 0.12;
      landmark.add(vein);
    }
  }
  landmark.traverse((m) => {
    m.castShadow = true;
  });
  add(landmark);
  }
  if (terrIdx === 0) {
    // LOS PRADOS: matas de pasto lunar y flores que brillan
    const tuftGeo = new THREE.ConeGeometry(0.06, 0.5, 4);
    const tuftMat = new THREE.MeshStandardMaterial({ color: 0x5fae6a, roughness: 1, flatShading: true });
    decorGeos.push(tuftGeo);
    decorMats.push(tuftMat);
    for (let i = 0; i < 300; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 16);
      const tuft = new THREE.Mesh(tuftGeo, tuftMat);
      const s = 0.6 + Math.random() * 1.1;
      tuft.position.set(x, 0.22 * s, z);
      tuft.scale.setScalar(s);
      tuft.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * Math.PI, (Math.random() - 0.5) * 0.5);
      add(tuft);
    }
    const flowerGeo = new THREE.OctahedronGeometry(0.11);
    const flowerMat = new THREE.MeshBasicMaterial({ color: 0xaef29a });
    decorGeos.push(flowerGeo);
    decorMats.push(flowerMat);
    for (let i = 0; i < 40; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 10);
      const f = new THREE.Mesh(flowerGeo, flowerMat);
      f.position.set(x, 0.12, z);
      add(f);
    }
  } else if (terrIdx === 1) {
    // EL MAR DE POLVO: ondas de duna y huesos de coral lunar
    const rippleGeo = new THREE.BoxGeometry(1.7, 0.07, 0.22);
    const rippleMat = new THREE.MeshStandardMaterial({ color: 0xcbb187, roughness: 1 });
    decorGeos.push(rippleGeo);
    decorMats.push(rippleMat);
    for (let i = 0; i < 170; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 16);
      const rip = new THREE.Mesh(rippleGeo, rippleMat);
      rip.position.set(x, 0.03, z);
      rip.scale.set(0.7 + Math.random() * 1.6, 1, 1);
      rip.rotation.y = Math.atan2(x, z) + Math.PI / 2 + (Math.random() - 0.5) * 0.7;
      add(rip);
    }
    const boneGeo = new THREE.TorusGeometry(0.5, 0.07, 6, 10, Math.PI);
    const boneMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.9, flatShading: true });
    decorGeos.push(boneGeo);
    decorMats.push(boneMat);
    for (let i = 0; i < 28; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 12);
      const bone = new THREE.Mesh(boneGeo, boneMat);
      const s = 0.7 + Math.random() * 1.4;
      bone.position.set(x, 0.02, z);
      bone.scale.setScalar(s);
      bone.rotation.y = Math.random() * Math.PI;
      add(bone);
    }
  } else {
    // LA CICATRIZ: grietas incandescentes y púas de roca muerta
    const crackGeo = new THREE.PlaneGeometry(2.6, 0.15);
    const crackMat = new THREE.MeshBasicMaterial({
      color: 0xff4a2a,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    decorGeos.push(crackGeo);
    decorMats.push(crackMat);
    for (let i = 0; i < 84; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 14);
      const crack = new THREE.Mesh(crackGeo, crackMat);
      crack.position.set(x, 0.035, z);
      crack.rotation.x = -Math.PI / 2;
      crack.rotation.z = Math.random() * Math.PI;
      crack.scale.set(0.5 + Math.random() * 1.4, 1, 1);
      add(crack, false); // luz aditiva plana: sin sombra
    }
    const spikeGeo = new THREE.ConeGeometry(0.16, 1.3, 5);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x241d38, roughness: 1, flatShading: true });
    decorGeos.push(spikeGeo);
    decorMats.push(spikeMat);
    for (let i = 0; i < 56; i += 1) {
      const [x, z] = spot(ARENA_RADIUS + 14);
      const spike = new THREE.Mesh(spikeGeo, spikeMat);
      const s = 0.5 + Math.random() * 1.3;
      spike.position.set(x, 0.55 * s, z);
      spike.scale.setScalar(s);
      spike.rotation.set((Math.random() - 0.5) * 0.45, Math.random() * Math.PI, (Math.random() - 0.5) * 0.45);
      add(spike);
    }
  }
}

// Estrellas fugaces (visual): rayitas que cruzan el cielo de vez en cuando
interface ShootingStar {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}
const shootingStars: ShootingStar[] = [];
let nextShootingStar = 2;
function updateShootingStars(dt: number): void {
  nextShootingStar -= dt;
  if (nextShootingStar <= 0 && shootingStars.length < 3) {
    nextShootingStar = 2 + Math.random() * 5;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 2.6),
      new THREE.MeshBasicMaterial({ color: 0xdfe8ff, transparent: true, opacity: 0.9 }),
    );
    mesh.position.set((Math.random() - 0.5) * 120, 30 + Math.random() * 20, -30 - Math.random() * 40);
    const vel = new THREE.Vector3((Math.random() - 0.5) * 30, -22 - Math.random() * 10, 0);
    mesh.lookAt(mesh.position.clone().add(vel));
    skyGroup.add(mesh); // el cielo viaja contigo: las fugaces también
    shootingStars.push({ mesh, vel, life: 1.1 });
  }
  for (let i = shootingStars.length - 1; i >= 0; i -= 1) {
    const s = shootingStars[i]!;
    s.life -= dt;
    s.mesh.position.addScaledVector(s.vel, dt);
    (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / 1.1) * 0.9;
    if (s.life <= 0) {
      skyGroup.remove(s.mesh);
      s.mesh.geometry.dispose();
      (s.mesh.material as THREE.Material).dispose();
      shootingStars.splice(i, 1);
    }
  }
}

// Domo de cielo: gradiente vertical (horizonte violeta → cenit casi negro)
{
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#04050d');
  grad.addColorStop(0.55, '#0e1130');
  grad.addColorStop(1, '#2a1b4e');
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const skyTex = new THREE.CanvasTexture(c);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide });
  skyMat.fog = false;
  skyGroup.add(new THREE.Mesh(new THREE.SphereGeometry(130, 24, 24), skyMat));
}

// Viñeta del piso: el centro respira luz, los bordes se apagan (profundidad)
{
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(128, 128, 40, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.75, 'rgba(4,5,13,0.25)');
  grad.addColorStop(1, 'rgba(4,5,13,0.75)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const vignette = new THREE.Mesh(
    new THREE.CircleGeometry(ARENA_RADIUS + 4, 64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  vignette.rotation.x = -Math.PI / 2;
  vignette.position.y = 0.015;
  scene.add(vignette);
}

// Polvo lunar: motas flotando a la deriva — el aire se ve vivo
const DUST_COUNT = 130;
const dustGeo = new THREE.BufferGeometry();
const dustBase = new Float32Array(DUST_COUNT * 3);
// PUNTO REDONDO para todos los Points: sin esto, three dibuja CUADRADOS
// (los "cuadros feos" de la captura de Luis eran las partículas crudas)
const dotTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();

const dustPhase = new Float32Array(DUST_COUNT);
for (let i = 0; i < DUST_COUNT; i += 1) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * (ARENA_RADIUS + 2);
  dustBase[i * 3] = Math.cos(angle) * radius;
  dustBase[i * 3 + 2] = Math.sin(angle) * radius;
  dustBase[i * 3 + 1] = 0.4 + Math.random() * 3.2 + terrainY(dustBase[i * 3]!, dustBase[i * 3 + 2]!);
  dustPhase[i] = Math.random() * Math.PI * 2;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(dustBase), 3));
const dust = new THREE.Points(
  dustGeo,
  new THREE.PointsMaterial({
    color: 0xa89aff,
    size: 0.09,
    map: dotTex,
    transparent: true,
    opacity: 0.65,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
scene.add(dust);
function updateDust(elapsed: number): void {
  const arr = dustGeo.attributes.position!.array as Float32Array;
  for (let i = 0; i < DUST_COUNT; i += 1) {
    arr[i * 3] = dustBase[i * 3]! + Math.sin(elapsed * 0.13 + dustPhase[i]!) * 0.9;
    arr[i * 3 + 1] = dustBase[i * 3 + 1]! + Math.sin(elapsed * 0.4 + dustPhase[i]! * 2) * 0.5;
    arr[i * 3 + 2] = dustBase[i * 3 + 2]! + Math.cos(elapsed * 0.11 + dustPhase[i]!) * 0.9;
  }
  dustGeo.attributes.position!.needsUpdate = true;
}

// Estrellas
{
  const starPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i += 1) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI * 0.45;
    starPos[i * 3] = Math.sin(phi) * Math.cos(theta) * 90;
    starPos[i * 3 + 1] = Math.cos(phi) * 90 + 4;
    starPos[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * 90;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({
    color: 0xaab4ff,
    size: 0.7,
    map: dotTex,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  });
  starMat.fog = false;
  skyGroup.add(new THREE.Points(starGeo, starMat));
}

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── HUD (DOM, sin números salvo la oleada) ──
const hud = document.createElement('div');
hud.style.cssText =
  'position:fixed;inset:0;pointer-events:none;font-family:ui-monospace,monospace;color:#dfe4ff';
hud.innerHTML = `
  <div style="position:absolute;left:16px;top:14px;width:220px">
    <div id="wave" style="font-size:14px;letter-spacing:2px;margin-bottom:6px">${T.wave(1, 9)}</div>
    <div style="height:10px;background:#232338;border:1px solid #3a3a5c">
      <div id="hpbar" style="height:100%;width:100%;background:#7fe07f;transition:width .12s"></div>
    </div>
    <div id="score" style="font-size:11px;letter-spacing:1px;margin-top:6px;opacity:.85">${T.points} 0</div>
    <div id="axietag" style="font-size:10px;letter-spacing:1px;margin-top:4px;opacity:.65;color:#b8a5ff"></div>
    <div id="contract" style="font-size:10px;letter-spacing:1px;margin-top:4px;opacity:.8;color:#ffd27f"></div>
  </div>
  <div id="parttoast" style="position:absolute;left:50%;bottom:120px;transform:translateX(-50%);
    font-size:12px;letter-spacing:1px;color:#b8ffb0;opacity:0;transition:opacity .3s;white-space:nowrap"></div>
  <div id="hurtvignette" style="position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at center, transparent 55%, #c0303080 100%)"></div>
  <div id="waveflash" style="position:absolute;left:50%;top:26%;transform:translateX(-50%);
    font-size:26px;letter-spacing:6px;opacity:0;transition:opacity .4s;color:#fff2c0;
    text-shadow:0 0 14px #fff2c066;white-space:nowrap"></div>
  <div id="deadmsg" style="position:absolute;inset:0;display:none;place-items:center;background:#0a0a14aa">
    <div style="text-align:center">
      <div style="font-size:28px;letter-spacing:4px">${T.dead}</div>
      <div id="dead-taunt" style="font-size:14px;margin-top:10px;color:#b8a5ff;font-style:italic;
        letter-spacing:1px;max-width:340px;margin-left:auto;margin-right:auto"></div>
      <div id="dead-build" style="display:flex;gap:10px;justify-content:center;margin-top:16px"></div>
      <div id="dead-stats" style="font-size:13px;margin-top:12px;color:#fff2c0"></div>
      <button id="share-dead" style="margin-top:14px;padding:8px 16px;pointer-events:auto;
        font:11px ui-monospace,monospace;letter-spacing:2px;color:#dfe4ff;background:transparent;
        border:1px solid #3a3a5c;cursor:pointer">${T.shareDead}</button>
      <button id="revancha-btn" style="margin-top:14px;margin-left:8px;padding:8px 16px;pointer-events:auto;
        font:bold 11px ui-monospace,monospace;letter-spacing:2px;color:#0a0a14;background:#ffd24a;
        border:1px solid #0a0a14;cursor:pointer">${T.revancha}</button>
      <div style="font-size:13px;margin-top:10px;opacity:.8">${T.deadHint}</div>
    </div>
  </div>
  <div id="winmsg" style="position:absolute;inset:0;display:none;place-items:center;background:#0a0a14aa">
    <div style="text-align:center">
      <div style="font-size:28px;letter-spacing:4px;color:#fff2c0">${T.win}</div>
      <div id="win-taunt" style="font-size:14px;margin-top:10px;color:#b8a5ff;font-style:italic;
        letter-spacing:1px;max-width:340px;margin-left:auto;margin-right:auto"></div>
      <div id="win-build" style="display:flex;gap:10px;justify-content:center;margin-top:16px"></div>
      <div id="win-stats" style="font-size:13px;margin-top:12px;color:#fff2c0"></div>
      <button id="share-win" style="margin-top:14px;padding:8px 16px;pointer-events:auto;
        font:11px ui-monospace,monospace;letter-spacing:2px;color:#0a0a14;background:#fff2c0;
        border:1px solid #0a0a14;cursor:pointer">${T.shareWin}</button>
      <div style="font-size:13px;margin-top:10px;opacity:.8">${T.winHint}</div>
    </div>
  </div>
  <div id="kbhint" style="position:absolute;left:16px;bottom:12px;font-size:11px;opacity:.55;line-height:1.6">
    ${T.kbhint}
  </div>`;
document.body.appendChild(hud);
const hpBar = hud.querySelector<HTMLDivElement>('#hpbar')!;
const waveLabel = hud.querySelector<HTMLDivElement>('#wave')!;
const waveFlash = hud.querySelector<HTMLDivElement>('#waveflash')!;
let waveFlashTtl = 0;
function announceWave(text: string): void {
  waveFlash.textContent = text;
  waveFlash.style.opacity = '1';
  waveFlashTtl = 1.6;
}
const deadMsg = hud.querySelector<HTMLDivElement>('#deadmsg')!;
const winMsg = hud.querySelector<HTMLDivElement>('#winmsg')!;
const scoreLabel = hud.querySelector<HTMLDivElement>('#score')!;
const partToast = hud.querySelector<HTMLDivElement>('#parttoast')!;
let partToastTtl = 0;

// ── Persistencia local: récord y Bestiario (las partes reales que has absorbido) ──
const BEST_KEY = 'quimera.best';
const BESTIARY_KEY = 'quimera.bestiario';
function loadBestiary(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(BESTIARY_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
const bestiary = loadBestiary();
let bestiaryTotal = 0; // se calcula del catálogo al arrancar
function registerPart(id: string): boolean {
  if (bestiary.has(id)) return false;
  bestiary.add(id);
  localStorage.setItem(BESTIARY_KEY, JSON.stringify([...bestiary]));
  return true;
}
// ── NÉMESIS: la presa que se te disuelve sin cosechar te recuerda entre runs ──
const NEMESIS_KEY = 'quimera.nemesis';
function loadEscapes(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NEMESIS_KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}
const nemesisEscapes = loadEscapes();
function saveEscapes(): void {
  localStorage.setItem(NEMESIS_KEY, JSON.stringify(nemesisEscapes));
}
function isScarred(id: string): boolean {
  return (nemesisEscapes[id] ?? 0) >= NEMESIS_ESCAPES_TO_SCAR;
}

// ── El Primordial te habla al morir (una línea por derrota, según qué tan lejos llegaste) ──
function deathTaunt(wave: number): string {
  const pool = T.taunts[wave >= 7 ? 2 : wave >= 4 ? 1 : 0]!;
  return pool[Math.floor(Math.random() * pool.length)]!;
}
// …y sus últimas palabras cuando TÚ lo devoras a él
const WIN_LINES = T.winLines;

// ── RACHA DE DÍAS [Wordle/Duolingo]: el hábito de volver, sin castigo cruel ──
function dayStr(offset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
function loadDays(): { last: string; streak: number } {
  try {
    return { last: '', streak: 0, ...JSON.parse(localStorage.getItem('quimera.days') ?? '{}') };
  } catch {
    return { last: '', streak: 0 };
  }
}
const dayState = loadDays();
function bumpDayStreak(): void {
  const today = dayStr();
  if (dayState.last === today) return;
  dayState.streak = dayState.last === dayStr(-1) ? dayState.streak + 1 : 1;
  dayState.last = today;
  localStorage.setItem('quimera.days', JSON.stringify(dayState));
}
/** Racha mostrable: válida si jugaste hoy o ayer (perdón de un día al mostrar). */
function visibleStreak(): number {
  return dayState.last === dayStr() || dayState.last === dayStr(-1) ? dayState.streak : 0;
}

// ── GESTAS: 8 medallas persistentes — la colección que pide "una más" ──
const GESTA_IDS = [
  'primer_injerto', 'apex', 'dorada', 'venganza', 'guardian', 'victoria',
  'coleccionista', 'jinete',
] as const;
type GestaId = (typeof GESTA_IDS)[number];
function loadGestas(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem('quimera.gestas') ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
const gestas = loadGestas();
let awardGestaFx: ((name: string) => void) | null = null; // el loop lo conecta
function awardGesta(id: GestaId): void {
  if (gestas.has(id)) return;
  gestas.add(id);
  localStorage.setItem('quimera.gestas', JSON.stringify([...gestas]));
  awardGestaFx?.(T.gestas[id]);
}

function bestScore(): number {
  return Number(localStorage.getItem(BEST_KEY) ?? '0');
}
let cachedBest = bestScore(); // visible DURANTE el run: el "casi lo supero"
function endStats(score: number): string {
  const best = bestScore();
  const isRecord = score > best;
  if (isRecord) {
    localStorage.setItem(BEST_KEY, String(score));
    cachedBest = score;
  }
  const record = isRecord ? T.newRecord : T.record(best);
  // TU Axie acumula su propia historia de caza (semilla del gancho AXP de R2)
  let tag = '';
  if (personalAxieId) {
    const key = `quimera.axiestats.${personalAxieId}`;
    let s = { runs: 0, best: 0 };
    try {
      s = { ...s, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<typeof s>) };
    } catch {
      /* stats corruptas: se reinician */
    }
    s.runs += 1;
    s.best = Math.max(s.best, score);
    localStorage.setItem(key, JSON.stringify(s));
    tag = T.statsAxie(personalAxieId, s.runs, s.best);
  }
  return `${T.points} ${score} · ${record} · ${T.statsBestiary(bestiary.size, bestiaryTotal)}${tag}`;
}
const hurtVignette = hud.querySelector<HTMLDivElement>('#hurtvignette')!;
let hurtTtl = 0;
let hpFlashTtl = 0; // curación entrante (devorar / robo de vida): la barra respira verde

// ── Panel de cosecha (anclado a la presa derribada) ──
const SLOT_LABEL: Record<ActiveSlot, string> = T.slot;
const CHANNEL_TICKS = Math.round(INTERACT_CHANNEL_SECONDS * TICK_HZ);
const KNOCKDOWN_TICKS_UI = Math.round(KNOCKDOWN_SECONDS * TICK_HZ);

const harvest = document.createElement('div');
harvest.style.cssText =
  'position:fixed;left:0;top:0;transform:translate(-50%,-100%);display:none;' +
  'pointer-events:none;font-family:ui-monospace,monospace;color:#dfe4ff;text-align:center;' +
  'background:#0a0a14d9;border:1px solid #3a3a5c;padding:8px 10px;min-width:180px';
harvest.innerHTML = `
  <div id="hv-chips" style="display:flex;gap:6px;justify-content:center;margin-bottom:6px"></div>
  <div id="hv-help" style="font-size:10px;opacity:.85;line-height:1.5">${T.hvHelpDesk}</div>
  <button id="hv-devour" style="display:none;pointer-events:auto;margin-top:6px;padding:6px 12px;
    font:bold 11px ui-monospace,monospace;color:#0a0a14;background:#7fe07f;border:1px solid #0a0a14;
    touch-action:none;user-select:none;-webkit-user-select:none">${T.devourHold}</button>
  <div id="hv-ring" style="display:none;width:26px;height:26px;border-radius:50%;margin:6px auto 0"></div>
  <div id="hv-channel" style="font-size:10px;margin-top:2px;opacity:.9"></div>
  <div style="height:4px;background:#232338;margin-top:6px">
    <div id="hv-window" style="height:100%;background:#e0b055;width:100%"></div>
  </div>`;
document.body.appendChild(harvest);
const hvChips = harvest.querySelector<HTMLDivElement>('#hv-chips')!;
const hvRing = harvest.querySelector<HTMLDivElement>('#hv-ring')!;
const hvChannel = harvest.querySelector<HTMLDivElement>('#hv-channel')!;
const hvWindow = harvest.querySelector<HTMLDivElement>('#hv-window')!;
let heldRipSlot: ActiveSlot | null = null;
let hvKey = ''; // presa+partes renderizadas; se reconstruye solo al cambiar

function hexColor(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

function rebuildChips(prey: SimState['enemies'][number]): void {
  hvChips.innerHTML = '';
  for (const slot of ['mouth', 'horn', 'tail', 'back'] as const) {
    const part = prey.loadout[slot];
    if (!part) continue;
    const chip = document.createElement('button');
    chip.textContent = SLOT_LABEL[slot];
    const pad = '10px 12px';
    const font = '12px';
    chip.style.cssText =
      `pointer-events:auto;cursor:grab;border:1px solid #0a0a14;padding:${pad};touch-action:none;` +
      `font:bold ${font} ui-monospace,monospace;color:#0a0a14;background:${hexColor(CLASS_COLOR[part.class])}`;
    chip.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      heldRipSlot = slot;
      heldDevour = false;
    });
    hvChips.appendChild(chip);
  }
}

// Cosecha pegajosa en AMBAS plataformas: un click/toque en una parte basta —
// el canal corre solo hasta completarse; se cancela al atacar/esquivar/alejarse.

// ── HUD de build: las 4 ranuras de la Quimera + sinergia ──
const KEY_HINT: Record<ActiveSlot, string> = { mouth: 'LMB', horn: 'RMB', tail: 'E', back: 'Q' };
const BUILD_SLOTS: readonly ActiveSlot[] = ['mouth', 'horn', 'tail', 'back'];

const buildHud = document.createElement('div');
buildHud.style.cssText =
  'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);text-align:center;' +
  'pointer-events:none;font-family:ui-monospace,monospace';
const synergyLabel = document.createElement('div');
synergyLabel.textContent = T.synergy;
synergyLabel.style.cssText =
  'font-size:10px;letter-spacing:4px;margin-bottom:5px;opacity:.2;color:#dfe4ff;transition:opacity .25s,color .25s,text-shadow .25s';
buildHud.appendChild(synergyLabel);
const buildRow = document.createElement('div');
buildRow.style.cssText = 'display:flex;gap:8px;justify-content:center';
buildHud.appendChild(buildRow);
document.body.appendChild(buildHud);

interface BuildChip {
  root: HTMLDivElement;
  cooldownFill: HTMLDivElement;
  partId: string;
}
const buildChips = new Map<ActiveSlot, BuildChip>();
for (const slot of BUILD_SLOTS) {
  const root = document.createElement('div');
  root.style.cssText =
    'position:relative;width:58px;padding:6px 0 4px;border:1px solid #0a0a14;overflow:hidden;' +
    'color:#0a0a14;transition:box-shadow .25s,transform .12s;pointer-events:auto;cursor:pointer;' +
    'touch-action:none;user-select:none;-webkit-user-select:none';
  root.innerHTML =
    `<div style="font:bold 10px ui-monospace,monospace">${SLOT_LABEL[slot]}</div>` +
    `<div class="chip-sub" style="font-size:9px;opacity:.75">${KEY_HINT[slot]}</div>`;
  const cooldownFill = document.createElement('div');
  cooldownFill.style.cssText =
    'position:absolute;left:0;bottom:0;width:100%;height:0%;background:#0a0a14;opacity:.55';
  root.appendChild(cooldownFill);
  // los chips también son botones de ataque (imprescindible en táctil)
  root.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pendingAttack = slot;
    heldRipSlot = null; // atacar cancela la cosecha pegajosa
    heldDevour = false;
  });
  buildRow.appendChild(root);
  buildChips.set(slot, { root, cooldownFill, partId: '' });
}

const LEVEL_MARK = ['', '', '▲', '▲▲'];

/** Fila de chips del build (pantallas de fin: el monstruo que eras). */
function buildRowHtml(loadout: SimState['player']['loadout']): string {
  return BUILD_SLOTS.map((slot) => {
    const part = loadout[slot];
    if (!part) {
      return `<div style="padding:10px 12px;border:1px dashed #3a3a5c;color:#3a3a5c;font:11px ui-monospace,monospace">${SLOT_LABEL[slot]}</div>`;
    }
    const marks = LEVEL_MARK[Math.min(part.level, 3)] ?? '';
    return `<div style="padding:10px 12px;border:1px solid #0a0a14;color:#0a0a14;font:bold 11px ui-monospace,monospace;background:${hexColor(CLASS_COLOR[part.class])}">${SLOT_LABEL[slot]} ${marks}</div>`;
  }).join('');
}

function syncBuildHud(state: SimState): void {
  const loadout = state.player.loadout;
  const { group, count } = dominantGroup(loadout);
  const synergyOn = count >= SYNERGY_THRESHOLD;
  for (const slot of BUILD_SLOTS) {
    const part = loadout[slot];
    const chip = buildChips.get(slot)!;
    if (!part) {
      // ranura vacía: apagada, punteada — se llena cazando
      if (chip.partId !== '') chip.partId = '';
      chip.root.style.background = 'transparent';
      chip.root.style.border = '1px dashed #3a3a5c';
      chip.root.style.color = '#3a3a5c';
      chip.root.style.boxShadow = 'none';
      chip.cooldownFill.style.height = '0%';
      continue;
    }
    const stamp = `${part.id}:${part.level}`;
    if (chip.partId !== stamp) {
      // parte recién injertada o asimilada: pop para que el cambio se vea
      chip.partId = stamp;
      chip.root.style.background = hexColor(CLASS_COLOR[part.class]);
      chip.root.style.border = '1px solid #0a0a14';
      chip.root.style.color = '#0a0a14';
      const sub = chip.root.querySelector<HTMLDivElement>('.chip-sub');
      if (sub) {
        sub.textContent = `${touchMode ? '' : KEY_HINT[slot]} ${LEVEL_MARK[Math.min(part.level, 3)] ?? ''}`.trim();
      }
      chip.root.style.transform = 'scale(1.35)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chip.root.style.transform = 'scale(1)';
      }));
    }
    const inSynergy = synergyOn && classGroup(part.class) === group;
    if (slot === 'back') {
      // el dorso es tu ULTIMATE: el chip muestra la carga (dorado = listo)
      const full = state.player.ult >= 1;
      chip.cooldownFill.style.background = '#f6b73c';
      chip.cooldownFill.style.opacity = '0.85';
      chip.cooldownFill.style.height = `${state.player.ult * 100}%`;
      chip.root.style.boxShadow = full
        ? '0 0 16px 4px #f6b73c'
        : inSynergy
          ? '0 0 12px 2px #fff2c0'
          : 'none';
      continue;
    }
    chip.root.style.boxShadow = inSynergy ? '0 0 12px 2px #fff2c0' : 'none';
    const base = ABILITY_BASE[slot];
    const maxTicks = Math.max(1, Math.round(base.cooldownSeconds * CLASS_DELTA[part.class].cooldownMul * TICK_HZ));
    chip.cooldownFill.style.height = `${(100 * state.player.cooldowns[slot]) / maxTicks}%`;
  }
  const apexOn = count >= 4;
  synergyLabel.textContent = apexOn ? T.apexOn : T.synergy;
  synergyLabel.style.opacity = synergyOn ? '1' : '0.2';
  synergyLabel.style.color = apexOn ? '#ffd24a' : synergyOn ? hexColor(CLASS_COLOR[group]) : '#dfe4ff';
  synergyLabel.style.textShadow = apexOn
    ? '0 0 14px #ffd24a'
    : synergyOn
      ? `0 0 10px ${hexColor(CLASS_COLOR[group])}`
      : 'none';
}

/** La misma presa que elegiría el motor: derribada más cercana al alcance. */
function harvestTarget(state: SimState): SimState['enemies'][number] | null {
  let best: SimState['enemies'][number] | null = null;
  let bestD = INTERACT_RANGE;
  for (const e of state.enemies) {
    if (e.knockdownTicks <= 0) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

const projected = new THREE.Vector3();
function syncHarvestPanel(state: SimState): void {
  const prey = harvestTarget(state);
  if (!prey || state.phase !== 'running') {
    harvest.style.display = 'none';
    heldRipSlot = null;
    heldDevour = false;
    hvKey = '';
    return;
  }
  const key = `${prey.id}:${['mouth', 'horn', 'tail', 'back']
    .map((s) => (prey.loadout[s as ActiveSlot] ? '1' : '0'))
    .join('')}`;
  if (key !== hvKey) {
    hvKey = key;
    rebuildChips(prey);
  }
  projected.set(prey.x, 1.6, prey.y).project(camera);
  harvest.style.display = 'block';
  harvest.style.left = `${(projected.x * 0.5 + 0.5) * innerWidth}px`;
  harvest.style.top = `${(-projected.y * 0.5 + 0.5) * innerHeight}px`;
  hvWindow.style.width = `${Math.min(1, prey.knockdownTicks / KNOCKDOWN_TICKS_UI) * 100}%`;

  const channel = state.player.channel;
  if (channel && channel.targetId === prey.id) {
    const progress = 1 - channel.ticksLeft / CHANNEL_TICKS;
    hvRing.style.display = 'block';
    hvRing.style.background = `conic-gradient(#fff2c0 ${progress * 360}deg, #ffffff22 0deg)`;
    hvChannel.textContent =
      channel.intent.kind === 'devour' ? T.devouring : T.ripping(SLOT_LABEL[channel.intent.slot]);
  } else {
    hvRing.style.display = 'none';
    hvChannel.textContent = '';
  }
}

// ── "Caza con TU Axie": opt-in, dato público, sin wallet ──
// Invariante amendado (3 sep, decisión de Luis): el juego sigue 100% local por
// defecto; SOLO si el jugador escribe un ID se consulta el gateway público.
let personalAxieId: string | null = null;
let adoptAxieHook: ((entry: CatalogAxie) => void) | null = null;

async function fetchAxie(id: string): Promise<CatalogAxie | null> {
  try {
    const res = await fetch('https://graphql-gateway.axieinfinity.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query:
          'query($id: ID!){ axie(axieId:$id){ id class newGenes parts { id class type } } }',
        variables: { id },
      }),
    });
    const json = (await res.json()) as {
      data?: {
        axie?: {
          id: string;
          class: string;
          newGenes: string;
          parts: Array<{ id: string; class: string; type: string }>;
        };
      };
    };
    const a = json.data?.axie;
    if (!a?.newGenes || !a.class || !Array.isArray(a.parts)) return null;
    // normalizar casing en la frontera: la API habla "Beast"/"Mouth", el motor no
    const cls = a.class.toLowerCase() as AxieClass;
    if (!(cls in CLASS_COLOR)) return null;
    const parts = a.parts.map((p) => ({
      id: p.id,
      class: p.class.toLowerCase() as AxieClass,
      type: p.type.toLowerCase() as Part['type'],
      level: 1,
    }));
    if (parts.length !== 6 || parts.some((p) => !(p.class in CLASS_COLOR))) return null;
    return { id: a.id, class: cls, genes: a.newGenes, parts };
  } catch {
    return null;
  }
}

// ── Vitrina del Bestiario: la colección con huecos que pican ──
let catalogPartList: Array<{ id: string; class: AxieClass; type: string }> = [];
let bestiaryVisible = false;
const bestiaryOverlay = document.createElement('div');
bestiaryOverlay.style.cssText =
  'position:fixed;inset:0;display:none;background:#0a0a14f0;z-index:20;overflow-y:auto;' +
  'font-family:ui-monospace,monospace;color:#dfe4ff;padding:28px 16px;text-align:center';
document.body.appendChild(bestiaryOverlay);

function renderBestiary(): void {
  const bySlot = new Map<string, typeof catalogPartList>();
  for (const p of catalogPartList) {
    if (!bySlot.has(p.type)) bySlot.set(p.type, []);
    bySlot.get(p.type)!.push(p);
  }
  let html = `<div style="font-size:22px;letter-spacing:4px;color:#fff2c0">${T.bestiaryTitle}</div>
    <div style="font-size:12px;opacity:.75;margin:6px 0 4px">${T.bestiarySub(bestiary.size, bestiaryTotal)}</div>
    <div style="font-size:10px;opacity:.55;margin-bottom:16px">${T.bestiaryMarket}</div>`;
  for (const slot of ['mouth', 'horn', 'tail', 'back'] as const) {
    const parts = (bySlot.get(slot) ?? []).slice().sort((a, b) => a.id.localeCompare(b.id));
    html += `<div style="font-size:13px;letter-spacing:3px;margin:14px 0 8px;opacity:.85">${SLOT_LABEL[slot]}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;max-width:640px;margin:0 auto">`;
    for (const p of parts) {
      const name = p.id.replace(`${slot}-`, '');
      // parte absorbida = puente al marketplace real: copia el nombre y abre
      // el filtro de partes (el deep-link ?part= ya no filtra — visto 7 sep)
      html += bestiary.has(p.id)
        ? `<a href="https://app.axieinfinity.com/marketplace/axies/"
             target="_blank" rel="noreferrer" onpointerdown="event.stopPropagation()"
             onclick="navigator.clipboard&&navigator.clipboard.writeText('${name}')"
             style="padding:5px 8px;font:bold 10px ui-monospace,monospace;color:#0a0a14;
             background:${hexColor(CLASS_COLOR[p.class])};text-decoration:none">${name} ↗</a>`
        : `<div style="padding:5px 8px;font:10px ui-monospace,monospace;color:#3a3a5c;border:1px dashed #3a3a5c">???</div>`;
    }
    html += '</div>';
  }
  bestiaryOverlay.innerHTML = html;
}
function toggleBestiary(): void {
  bestiaryVisible = !bestiaryVisible;
  if (bestiaryVisible) renderBestiary();
  bestiaryOverlay.style.display = bestiaryVisible ? 'block' : 'none';
}
bestiaryOverlay.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  toggleBestiary();
});

// ── Pantalla de título: una frase, controles, y el click desbloquea el audio ──
let titleVisible = true;
const title = document.createElement('div');
title.style.cssText =
  'position:fixed;inset:0;display:grid;place-items:center;background:#0a0a14e6;z-index:10;' +
  'font-family:ui-monospace,monospace;color:#dfe4ff;text-align:center;cursor:pointer';
title.innerHTML = `
  <style>
    @keyframes qGlow {
      0%, 100% { text-shadow: 0 0 22px #9a5cff77, 0 0 60px #9a5cff2c; }
      50% { text-shadow: 0 0 38px #b47affbb, 0 0 90px #9a5cff55; }
    }
    @keyframes qPulse { 0%, 100% { opacity: .95; } 50% { opacity: .35; } }
  </style>
  <div style="max-width:560px;padding:0 14px">
    <div style="font-size:11px;letter-spacing:6px;color:#b8a5ff;opacity:.75;margin-bottom:8px">LUNACIA</div>
    <div style="font-size:52px;letter-spacing:12px;margin-bottom:8px;color:#f2ecff;animation:qGlow 3.2s ease-in-out infinite">QUIMERA</div>
    <div style="font-size:14px;letter-spacing:3px;color:#fff2c0;margin-bottom:22px">${T.tagline}</div>
    <div style="display:flex;gap:10px;justify-content:center;margin-bottom:16px;flex-wrap:wrap">
      <div style="width:140px;padding:10px 8px;background:#141428cc;border:1px solid #3a3a5c">
        <div style="font-size:18px;margin-bottom:5px">🐾</div>
        <div style="font-size:11px;letter-spacing:2px;color:#fff2c0;margin-bottom:4px">${T.cardHunt[0]}</div>
        <div style="font-size:10px;opacity:.7;line-height:1.5">${T.cardHunt[1]}</div>
      </div>
      <div style="width:140px;padding:10px 8px;background:#141428cc;border:1px solid #3a3a5c">
        <div style="font-size:18px;margin-bottom:5px">🦷</div>
        <div style="font-size:11px;letter-spacing:2px;color:#fff2c0;margin-bottom:4px">${T.cardAbsorb[0]}</div>
        <div style="font-size:10px;opacity:.7;line-height:1.5">${T.cardAbsorb[1]}</div>
      </div>
      <div style="width:140px;padding:10px 8px;background:#141428cc;border:1px solid #3a3a5c">
        <div style="font-size:18px;margin-bottom:5px">⛰</div>
        <div style="font-size:11px;letter-spacing:2px;color:#fff2c0;margin-bottom:4px">${T.cardSurvive[0]}</div>
        <div style="font-size:10px;opacity:.7;line-height:1.5">${T.cardSurvive[1]}</div>
      </div>
    </div>
    <div style="font-size:11px;opacity:.6;line-height:1.9;margin-bottom:6px">${
      IS_TOUCH ? T.controlsTouch : T.controlsDesk
    }</div>
    <div style="font-size:14px;letter-spacing:3px;margin-top:16px;color:#fff2c0;animation:qPulse 1.8s ease-in-out infinite">${T.wake(IS_TOUCH)}</div>
    ${
      cachedBest > 0
        ? `<div style="font-size:11px;color:#ffd24a;margin-top:10px;letter-spacing:2px">${T.titleRecord(cachedBest, bestiary.size)}</div>`
        : ''
    }
    <div style="font-size:11px;margin-top:6px;letter-spacing:2px;color:#b8a5ff">
      ${visibleStreak() >= 2 ? T.streakTitle(visibleStreak()) : ''}
      ${gestas.size > 0 ? ` ${T.gestasTitle(gestas.size, 8)}` : ''}
    </div>
    <div id="axie-row" style="margin-top:20px;pointer-events:auto">
      <input id="axie-id-input" inputmode="numeric" placeholder="${T.axiePlaceholder}"
        style="padding:8px 10px;width:180px;font:12px ui-monospace,monospace;color:#dfe4ff;
        background:#141428;border:1px solid #3a3a5c;outline:none" />
      <button id="axie-id-btn" style="padding:8px 12px;font:bold 11px ui-monospace,monospace;
        letter-spacing:1px;color:#0a0a14;background:#9a5cff;border:1px solid #0a0a14;cursor:pointer">
        ${T.axieBtn}</button>
      <div id="axie-id-status" style="font-size:11px;margin-top:8px;min-height:14px;color:#b8ffb0"></div>
    </div>
    <div id="terr-row" style="margin-top:16px;pointer-events:auto;display:none">
      <div style="font-size:10px;opacity:.6;margin-bottom:6px">${T.startIn}</div>
      <div id="terr-buttons" style="display:flex;gap:8px;justify-content:center"></div>
    </div>
    <div style="margin-top:16px;display:flex;gap:8px;justify-content:center;pointer-events:auto">
      <button id="title-daily" style="padding:8px 16px;font:11px ui-monospace,monospace;
        letter-spacing:2px;color:#dfe4ff;background:transparent;border:1px solid #3a3a5c;
        cursor:pointer">${T.dailyBtn}</button>
      <button id="title-bestiary" style="padding:8px 16px;font:11px ui-monospace,monospace;
        letter-spacing:2px;color:#dfe4ff;background:transparent;border:1px solid #3a3a5c;
        cursor:pointer">${T.bestiaryBtn}</button>
      <button id="title-lang" style="padding:8px 16px;font:11px ui-monospace,monospace;
        letter-spacing:2px;color:#b8a5ff;background:transparent;border:1px solid #3a3a5c;
        cursor:pointer">${T.langBtn}</button>
    </div>
    <div id="daily-hint" style="font-size:10px;opacity:.6;margin-top:8px;display:none">
      ${T.dailyHint}</div>
  </div>`;
document.body.appendChild(title);
title.querySelector<HTMLButtonElement>('#title-bestiary')!.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  toggleBestiary();
});
// idioma: persiste y recarga (todos los textos se construyen al cargar)
title.querySelector<HTMLButtonElement>('#title-lang')!.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  localStorage.setItem('quimera.lang', LANG === 'es' ? 'en' : 'es');
  location.reload();
});
// CACERÍA DEL DÍA: semilla derivada de la fecha — la misma luna para todo el
// mundo hoy. Competitivo sin servidor: el motor determinista hace el resto.
let dailyMode = false;
function todaySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}
{
  const btn = title.querySelector<HTMLButtonElement>('#title-daily')!;
  const hint = title.querySelector<HTMLDivElement>('#daily-hint')!;
  btn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dailyMode = !dailyMode;
    if (dailyMode) {
      startWave = 1; // la diaria siempre arranca del principio: cancha pareja
      startMutations = [];
    }
    btn.style.background = dailyMode ? '#fff2c0' : 'transparent';
    btn.style.color = dailyMode ? '#0a0a14' : '#dfe4ff';
    hint.style.display = dailyMode ? 'block' : 'none';
  });
}
{
  const row = title.querySelector<HTMLDivElement>('#axie-row')!;
  const input = title.querySelector<HTMLInputElement>('#axie-id-input')!;
  const btn = title.querySelector<HTMLButtonElement>('#axie-id-btn')!;
  const status = title.querySelector<HTMLDivElement>('#axie-id-status')!;
  input.value = localStorage.getItem('quimera.axieid') ?? '';
  row.addEventListener('pointerdown', (e) => e.stopPropagation()); // no arranca el juego
  btn.addEventListener('click', async () => {
    const id = input.value.trim().replace(/^#/, '');
    if (!/^\d+$/.test(id)) {
      status.style.color = '#ff8a8a';
      status.textContent = T.axieBad;
      return;
    }
    btn.disabled = true;
    status.style.color = '#dfe4ff';
    status.textContent = T.axieSearching;
    const entry = await fetchAxie(id);
    if (!entry || !adoptAxieHook) {
      btn.disabled = false;
      status.style.color = '#ff8a8a';
      status.textContent = entry ? T.axieRetry : T.axieNotFound;
      return;
    }
    adoptAxieHook(entry);
    localStorage.setItem('quimera.axieid', id);
    status.style.color = '#b8ffb0';
    let history = '';
    try {
      const s = JSON.parse(localStorage.getItem(`quimera.axiestats.${id}`) ?? '{}') as {
        runs?: number;
        best?: number;
      };
      if (s.runs) history = T.axieHistory(s.runs, s.best ?? 0);
    } catch {
      /* sin historia previa */
    }
    status.textContent = T.axieOk(id, history);
    btn.disabled = false;
  });
}
// Territorios desbloqueados: llega a uno y podrás empezar ahí (con mudas de ventaja)
let startWave = 1;
let startMutations: MutationId[] = [];
{
  const maxTerr = Number(localStorage.getItem('quimera.maxterr') ?? '0');
  if (maxTerr >= 1) {
    const row = title.querySelector<HTMLDivElement>('#terr-row')!;
    const buttons = title.querySelector<HTMLDivElement>('#terr-buttons')!;
    row.style.display = 'block';
    row.addEventListener('pointerdown', (e) => e.stopPropagation());
    TERRITORIES.forEach((_t, i) => {
      if (i > maxTerr) return;
      const b = document.createElement('button');
      b.textContent = T.terr[i] ?? '';
      b.style.cssText =
        'padding:7px 10px;font:10px ui-monospace,monospace;letter-spacing:1px;cursor:pointer;' +
        (i === 0
          ? 'color:#0a0a14;background:#9a5cff;border:1px solid #0a0a14'
          : 'color:#dfe4ff;background:#141428;border:1px solid #3a3a5c');
      b.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        startWave = i * 3 + 1;
        startMutations = Array.from(
          { length: i },
          () => MUTATION_IDS[Math.floor(Math.random() * MUTATION_IDS.length)]!,
        );
        for (const other of buttons.children) {
          (other as HTMLButtonElement).style.background = '#141428';
          (other as HTMLButtonElement).style.color = '#dfe4ff';
        }
        b.style.background = '#9a5cff';
        b.style.color = '#0a0a14';
      });
      buttons.appendChild(b);
    });
  }
}

title.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  initAudio();
  titleVisible = false;
  title.remove();
  bumpDayStreak(); // hoy cazaste: la racha vive
  // la sim se creó ANTES de que eligieras territorio/Axie: reconstruir con la
  // elección actual (sin esto, "empezar en la Cicatriz" arrancaba en los Prados)
  pendingRestart = true;
});

// ── Tutorial del primer minuto: se enseña JUGANDO, una sola vez (localStorage) ──
const tutHint = document.createElement('div');
tutHint.style.cssText =
  'position:fixed;left:50%;bottom:26%;transform:translateX(-50%);display:none;z-index:7;' +
  'font:bold 14px ui-monospace,monospace;color:#fff2c0;text-align:center;letter-spacing:1px;' +
  'background:#0a0a14cc;border:1px solid #6a5a2c;padding:10px 16px;pointer-events:none;' +
  'text-shadow:0 2px 8px #000;max-width:78vw;line-height:1.6';
document.body.appendChild(tutHint);
const TUT_TEXTS = T.tut(IS_TOUCH);

// ── Input ──
const keys = new Set<string>();
let pointerNdc = new THREE.Vector2(0, 0);
let pendingAttack: ActiveSlot | null = null;
let pendingDodge = false;
let pendingRestart = false;
let pendingMutation: number | null = null;

// ── LA MUDA: 3 cartas al limpiar la oleada — elige cómo evoluciona tu Quimera ──
const moltOverlay = document.createElement('div');
moltOverlay.style.cssText =
  'position:fixed;inset:0;display:none;place-items:center;background:#0a0a14cc;z-index:15;' +
  'font-family:ui-monospace,monospace;color:#dfe4ff';
moltOverlay.innerHTML = `
  <div style="text-align:center">
    <div style="font-size:24px;letter-spacing:5px;color:#b8a5ff;text-shadow:0 0 14px #9a5cff88">${T.moltTitle}</div>
    <div style="font-size:12px;opacity:.75;margin:6px 0 18px">${T.moltSub}</div>
    <div id="molt-cards" style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap"></div>
  </div>`;
document.body.appendChild(moltOverlay);
const moltCards = moltOverlay.querySelector<HTMLDivElement>('#molt-cards')!;
let moltShownKey = '';
function syncMoltOverlay(state: SimState): void {
  if (state.phase !== 'molt' || !state.moltChoices) {
    moltOverlay.style.display = 'none';
    moltShownKey = '';
    return;
  }
  moltOverlay.style.display = 'grid';
  const key = state.moltChoices.join(',') + state.wave.wave;
  if (key === moltShownKey) return;
  moltShownKey = key;
  moltCards.innerHTML = '';
  state.moltChoices.forEach((id, i) => {
    const info = T.mut[id];
    const card = document.createElement('button');
    card.innerHTML = `<div style="font-size:13px;letter-spacing:1px;margin-bottom:8px">${info.name}</div>
      <div style="font-size:11px;opacity:.8;font-weight:normal">${info.desc}</div>
      <div style="font-size:10px;opacity:.5;margin-top:10px">${i + 1}</div>`;
    card.style.cssText =
      'width:150px;padding:16px 12px;font:bold 12px ui-monospace,monospace;color:#dfe4ff;' +
      'background:#141428;border:1px solid #9a5cff;cursor:pointer;touch-action:none;' +
      'user-select:none;-webkit-user-select:none';
    card.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pendingMutation = i;
    });
    moltCards.appendChild(card);
  });
}

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return; // escribir un ID no juega
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === ' ' || k === 'arrowleft' || k === 'arrowright') e.preventDefault();
  if (k === ' ') pendingDodge = true;
  if (k === 'e') pendingAttack = 'tail';
  if (k === 'q') pendingAttack = 'back';
  if (k === 'r') pendingRestart = true;
  if (k === 'b') toggleBestiary();
  if (k === 'h') setPhotoMode(!photoMode); // modo foto: HUD fuera, capturas limpias
  if (k === '1' || k === '2' || k === '3') pendingMutation = Number(k) - 1;
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('pointermove', (e) => {
  pointerNdc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});
window.addEventListener('pointerdown', (e) => {
  if (touchMode) return; // en táctil, atacar = chips del HUD; tocar mueve/apunta
  if (e.button === 0) pendingAttack = 'mouth';
  if (e.button === 2) pendingAttack = 'horn';
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();
const lastAim = { x: 0, z: 0 }; // último punto del cursor en el suelo (PC)
let cursorTargetId = -1; // presa seleccionada por el cursor (PC)

/** Alcance del auto-apuntado táctil: más allá, ni marcador ni snap. */
const AUTO_TARGET_RANGE = 7;
let lockedTargetId = -1; // histéresis: el marcador no parpadea entre objetivos
function autoTarget(state: SimState): SimState['enemies'][number] | null {
  let best: SimState['enemies'][number] | null = null;
  let bestD = AUTO_TARGET_RANGE;
  let locked: SimState['enemies'][number] | null = null;
  let lockedD = Infinity;
  for (const e of state.enemies) {
    if (e.knockdownTicks > 0) continue;
    const d = Math.hypot(e.x - state.player.x, e.y - state.player.y);
    if (e.id === lockedTargetId && d <= AUTO_TARGET_RANGE * 1.2) {
      locked = e;
      lockedD = d;
    }
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  // conserva el objetivo actual salvo que otro esté claramente más cerca
  const chosen = locked && bestD > lockedD * 0.7 ? locked : best;
  lockedTargetId = chosen?.id ?? -1;
  return chosen;
}

// ── Táctil: joystick virtual izquierdo + auto-apuntado + botones ──
const touchMode = IS_TOUCH;
renderer.domElement.style.touchAction = 'none';
document.body.style.overscrollBehavior = 'none';

let joyPointerId: number | null = null;
let joyOriginX = 0;
let joyOriginY = 0;
let joyX = 0;
let joyY = 0;
const JOY_RADIUS = 56;

const joyBase = document.createElement('div');
joyBase.style.cssText =
  'position:fixed;width:112px;height:112px;border-radius:50%;border:2px solid #3a3a5c;' +
  'background:#23233833;display:none;pointer-events:none;transform:translate(-50%,-50%)';
const joyKnob = document.createElement('div');
joyKnob.style.cssText =
  'position:fixed;width:44px;height:44px;border-radius:50%;background:#dfe4ff55;' +
  'display:none;pointer-events:none;transform:translate(-50%,-50%)';
document.body.append(joyBase, joyKnob);

if (touchMode) {
  window.addEventListener('pointerdown', (e) => {
    if (titleVisible || joyPointerId !== null) return;
    if (e.clientX > innerWidth * 0.5) return; // mitad izquierda = mover
    joyPointerId = e.pointerId;
    joyOriginX = e.clientX;
    joyOriginY = e.clientY;
    joyBase.style.display = joyKnob.style.display = 'block';
    joyBase.style.left = joyKnob.style.left = `${e.clientX}px`;
    joyBase.style.top = joyKnob.style.top = `${e.clientY}px`;
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointerId) return;
    let dx = (e.clientX - joyOriginX) / JOY_RADIUS;
    let dy = (e.clientY - joyOriginY) / JOY_RADIUS;
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    // curva de respuesta: zona muerta 12%, velocidad máxima al 65% de palanca
    const mag = Math.min(1, len);
    const t = Math.min(1, Math.max(0, (mag - 0.12) / 0.53));
    joyX = mag > 1e-4 ? (dx / mag) * t : 0;
    joyY = mag > 1e-4 ? (dy / mag) * t : 0;
    joyKnob.style.left = `${joyOriginX + dx * JOY_RADIUS}px`;
    joyKnob.style.top = `${joyOriginY + dy * JOY_RADIUS}px`;
  });
  const joyEnd = (e: PointerEvent) => {
    if (e.pointerId !== joyPointerId) return;
    joyPointerId = null;
    joyX = 0;
    joyY = 0;
    joyBase.style.display = joyKnob.style.display = 'none';
  };
  window.addEventListener('pointerup', joyEnd);
  window.addEventListener('pointercancel', joyEnd);

  // un dedo en la mitad derecha: orbitar la cámara
  window.addEventListener('pointerdown', (e) => {
    if (e.clientX <= innerWidth * 0.5 || rotPointerId !== null) return;
    rotPointerId = e.pointerId;
    lastRotX = e.clientX;
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId !== rotPointerId || pinchPointers.size >= 2) return;
    camYawTarget += (e.clientX - lastRotX) * 0.0045;
    lastRotX = e.clientX;
  });
  const rotEnd = (e: PointerEvent) => {
    if (e.pointerId === rotPointerId) rotPointerId = null;
  };
  window.addEventListener('pointerup', rotEnd);
  window.addEventListener('pointercancel', rotEnd);

  // botón de esquiva (los ataques son los chips del build HUD)
  const dodgeBtn = document.createElement('div');
  dodgeBtn.textContent = T.dodgeBtn;
  dodgeBtn.style.cssText =
    'position:fixed;right:22px;bottom:22px;width:82px;height:82px;border-radius:50%;' +
    'border:2px solid #3a3a5c;background:#23233866;color:#dfe4ff;display:grid;place-items:center;' +
    'font:11px ui-monospace,monospace;letter-spacing:1px;touch-action:none;user-select:none;-webkit-user-select:none';
  dodgeBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    pendingDodge = true;
    heldRipSlot = null;
    heldDevour = false;
  });
  document.body.appendChild(dodgeBtn);

  // layout táctil: ataques en cluster 2×2 sobre la esquiva, al alcance del pulgar
  buildHud.style.left = 'auto';
  buildHud.style.right = '16px';
  buildHud.style.bottom = '118px';
  buildHud.style.transform = 'none';
  buildRow.style.display = 'grid';
  buildRow.style.gridTemplateColumns = 'repeat(2, 68px)';
  buildRow.style.gap = '10px';
  for (const { root } of buildChips.values()) {
    root.style.width = '68px';
    root.style.padding = '14px 0 12px';
  }
  hud.querySelector<HTMLDivElement>('#kbhint')!.style.display = 'none';
}

// ── Órbita 360°: flechas ←→ / arrastre de botón central (PC) · arrastre de un
// dedo en la mitad derecha (táctil). El movimiento es relativo a cámara. ──
let camYaw = 0;
let camYawTarget = 0;
// PC: mantener CUALQUIER click y arrastrar horizontal = orbitar
let mouseRotating = false;
let lastDragX = 0;
window.addEventListener('pointerdown', (e) => {
  if (IS_TOUCH) return;
  if (e.button === 1) e.preventDefault(); // botón central: sin autoscroll
  mouseRotating = true;
  lastDragX = e.clientX;
});
window.addEventListener('pointerup', () => {
  mouseRotating = false;
});
window.addEventListener('pointermove', (e) => {
  if (!mouseRotating) return;
  if (e.buttons === 0) {
    mouseRotating = false;
    return;
  }
  camYawTarget += (e.clientX - lastDragX) * 0.0038;
  lastDragX = e.clientX;
});
// táctil: un dedo en la mitad derecha orbita (dos dedos = pinch/zoom)
let rotPointerId: number | null = null;
let lastRotX = 0;

// Botones VISIBLES de giro (mantener presionado) — bajo el radar, ambas plataformas
let rotateHold = 0; // -1, 0, +1
{
  const makeRotBtn = (label: string, dir: number, right: number) => {
    const b = document.createElement('div');
    b.textContent = label;
    b.style.cssText =
      `position:fixed;right:${right}px;top:138px;width:52px;height:40px;display:grid;` +
      'place-items:center;font:20px ui-monospace,monospace;color:#dfe4ff;background:#23233866;' +
      'border:1px solid #3a3a5c;border-radius:8px;cursor:pointer;touch-action:none;' +
      'user-select:none;-webkit-user-select:none;z-index:5';
    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      rotateHold = dir;
    });
    document.body.appendChild(b);
    return b;
  };
  makeRotBtn('⟲', -1, 74);
  makeRotBtn('⟳', 1, 12);
  window.addEventListener('pointerup', () => {
    rotateHold = 0;
  });
  window.addEventListener('pointercancel', () => {
    rotateHold = 0;
  });
}

// ── Zoom: rueda (PC) y pinch (táctil). Al alejarte, la cámara se tumba y ves
// el horizonte: la Tierra, el Sol, las estrellas. ──
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 3.1; // luna abierta: aléjate para leer el viaje entre manadas
let zoomTarget = 1;
let zoom = 1;
window.addEventListener(
  'wheel',
  (e) => {
    zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomTarget + e.deltaY * 0.0014));
  },
  { passive: true },
);
// pinch: dos dedos que no sean el joystick
const pinchPointers = new Map<number, { x: number; y: number }>();
let lastPinchDist = 0;
window.addEventListener('pointerdown', (e) => {
  if (e.pointerId === joyPointerId) return;
  pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  lastPinchDist = 0;
});
window.addEventListener('pointermove', (e) => {
  if (!pinchPointers.has(e.pointerId)) return;
  pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchPointers.size === 2) {
    const [a, b] = [...pinchPointers.values()];
    const d = Math.hypot(b!.x - a!.x, b!.y - a!.y);
    if (lastPinchDist > 0) {
      zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomTarget - (d - lastPinchDist) * 0.006));
    }
    lastPinchDist = d;
  }
});
const endPinch = (e: PointerEvent) => {
  pinchPointers.delete(e.pointerId);
  lastPinchDist = 0;
};
window.addEventListener('pointerup', endPinch);
window.addEventListener('pointercancel', endPinch);

let heldDevour = false;
{
  const hvDevourBtn = harvest.querySelector<HTMLButtonElement>('#hv-devour')!;
  hvDevourBtn.style.display = 'inline-block';
  hvDevourBtn.textContent = T.devourBtn;
  harvest.querySelector<HTMLDivElement>('#hv-help')!.innerHTML = touchMode
    ? T.hvHelpTouch
    : T.hvHelpDesk2;
  hvDevourBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    heldDevour = true;
    heldRipSlot = null;
  });
  // el panel se traga sus clicks: clickearlo jamás dispara un ataque al mundo
  harvest.style.pointerEvents = 'auto';
  harvest.addEventListener('pointerdown', (e) => e.stopPropagation());
}
// en táctil, las pantallas de fin se tocan para renacer
for (const panel of [deadMsg, winMsg]) {
  panel.style.pointerEvents = 'auto';
  panel.addEventListener('pointerdown', () => {
    pendingRestart = true;
  });
}

// ── Modo foto (tecla H): esconde todo el HUD para thumbnail/video limpios ──
let photoMode = false;
function setPhotoMode(on: boolean): void {
  photoMode = on;
  const vis = on ? 'hidden' : 'visible';
  // radar se declara más abajo; para cuando alguien presiona H ya existe
  for (const el of [hud, harvest, buildHud, tutHint, radar]) el.style.visibility = vis;
}

function sampleInput(state: SimState): PlayerInput {
  let moveX = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  let moveY = (keys.has('s') ? 1 : 0) - (keys.has('w') ? 1 : 0); // +y del motor = +z de la escena
  if (joyPointerId !== null) {
    moveX = joyX;
    moveY = joyY;
  }
  // movimiento relativo a cámara: "arriba" siempre es hacia donde miras
  {
    const cy = Math.cos(camYaw);
    const sy = Math.sin(camYaw);
    const wx = moveX * cy + moveY * sy;
    const wz = -moveX * sy + moveY * cy;
    moveX = wx;
    moveY = wz;
  }
  let aimX = state.player.faceX;
  let aimY = state.player.faceY;
  if (touchMode) {
    // Regla táctil: el cuerpo mira hacia donde CAMINAS (locomoción legible);
    // solo al presionar un ataque, el apuntado hace snap al objetivo marcado.
    const moving = Math.hypot(moveX, moveY) > 0.1;
    const target = autoTarget(state);
    if (pendingAttack && target) {
      aimX = target.x - state.player.x;
      aimY = target.y - state.player.y;
    } else if (moving) {
      aimX = moveX;
      aimY = moveY;
    } else if (target) {
      // quieto: encarar al objetivo, listo para atacar
      aimX = target.x - state.player.x;
      aimY = target.y - state.player.y;
    }
  } else {
    // PC: el cursor SELECCIONA presa (radio de gracia) — apuntar es elegir,
    // la precisión la pone el zarpazo magnético
    raycaster.setFromCamera(pointerNdc, camera);
    if (raycaster.ray.intersectPlane(groundPlane, aimPoint)) {
      lastAim.x = aimPoint.x;
      lastAim.z = aimPoint.z;
      let picked: SimState['enemies'][number] | null = null;
      let bestD = 3.5;
      for (const e of state.enemies) {
        if (e.knockdownTicks > 0) continue;
        const d = Math.hypot(e.x - aimPoint.x, e.y - aimPoint.z);
        if (d < bestD) {
          bestD = d;
          picked = e;
        }
      }
      cursorTargetId = picked?.id ?? -1;
      if (picked) {
        aimX = picked.x - state.player.x;
        aimY = picked.y - state.player.y;
      } else {
        aimX = aimPoint.x - state.player.x;
        aimY = aimPoint.z - state.player.y;
      }
    }
  }
  const input: PlayerInput = {
    chooseMutation: pendingMutation,
    moveX,
    moveY,
    aimX,
    aimY,
    dodge: pendingDodge,
    attack: pendingAttack,
    interact: heldRipSlot
      ? { kind: 'rip', slot: heldRipSlot }
      : keys.has('f') || heldDevour
        ? { kind: 'devour' }
        : null,
  };
  pendingAttack = null;
  pendingDodge = false;
  pendingMutation = null;
  return input;
}

// ── Presas: Axies reales del mixer con pool por clase (cápsula mientras carga) ──
type Mixer3D = Awaited<ReturnType<typeof createAxieMixer3D>>;
type AxieInst = Awaited<ReturnType<Mixer3D['createFromGenes']>>;
interface AxieEntry {
  id: string;
  class: string;
  genes: string;
  parts: Array<{ id: string; class: string; type: string; level: number }>;
}

/** Convierte las entradas sembradas al catálogo que consume el motor. */
function buildCatalog(entries: AxieEntry[]): CatalogAxie[] {
  const catalog: CatalogAxie[] = [];
  for (const e of entries) {
    const cls = e.class as AxieClass;
    if (!(cls in CLASS_COLOR) || !Array.isArray(e.parts) || e.parts.length !== 6) continue;
    const parts = e.parts
      .filter((p) => p.class in CLASS_COLOR)
      .map((p) => ({ id: p.id, class: p.class as AxieClass, type: p.type as Part['type'], level: p.level || 1 }));
    if (parts.length !== 6) continue;
    catalog.push({ id: e.id, class: cls, genes: e.genes, parts });
  }
  return catalog;
}

// ── Sombra blob compartida: los shaders del mixer no soportan el pase de
// profundidad de las sombras reales — un radial oscuro bajo cada criatura
// ancla igual de bien y no cuesta nada.
const shadowTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(0,0,0,0.5)');
  grad.addColorStop(0.7, 'rgba(0,0,0,0.28)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
})();
const shadowGeo = new THREE.PlaneGeometry(1, 1);
const shadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  depthWrite: false,
});

// ── Cráteres pintados: tazón oscuro con borde iluminado — la luna se ve LUNA ──
// Cráter de GEOMETRÍA REAL (tras dos decals fallidos, capturas de Luis): malla
// de revolución con la morfología de un cráter lunar simple — borde levantado,
// tazón parabólico y falda de eyecta que baja a cero. La ILUMINACIÓN hace el
// resto: lado del sol claro, interior en sombra, sombra proyectada real.
const craterGeo = (() => {
  const pts = [
    [0.0, 0.028], // fondo del tazón (levantado apenas: nunca pelea con el plano)
    [0.42, 0.038],
    [0.7, 0.085], // pared interior parabólica
    [0.88, 0.16], // sube al borde
    [0.96, 0.185], // CRESTA del borde levantado
    [1.08, 0.09], // cae al exterior
    [1.28, 0.028], // falda de eyecta
    [1.5, 0.0], // se funde con el suelo
  ].map(([r, y]) => new THREE.Vector2(r!, y!));
  return new THREE.LatheGeometry(pts, 24);
})();

// ── HUELLAS: la Quimera (y el rover) marcan el polvo — en la luna no hay viento ──
const PRINT_MAX = 72;
const printTex = (() => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 48;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(16, 24, 2, 16, 24, 22);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(16, 24, 11, 20, 0, 0, Math.PI * 2);
  g.fill();
  return new THREE.CanvasTexture(c);
})();
const printGeo = new THREE.PlaneGeometry(0.36, 0.54);
interface Print {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
}
const prints: Print[] = [];
let printCursor = 0;
for (let i = 0; i < PRINT_MAX; i += 1) {
  const mat = new THREE.MeshBasicMaterial({
    map: printTex,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(printGeo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -999;
  scene.add(mesh);
  prints.push({ mesh, mat, age: 99 });
}
function stampPrint(x: number, z: number, yaw: number, side: number, wide: boolean): void {
  const p = prints[printCursor]!;
  printCursor = (printCursor + 1) % PRINT_MAX;
  const off = (wide ? 0.55 : 0.2) * side;
  p.mesh.position.set(x + Math.cos(yaw) * off, terrainY(x, z) + 0.018, z - Math.sin(yaw) * off);
  p.mesh.rotation.z = -yaw;
  p.mesh.scale.setScalar(wide ? 1.7 : 1);
  p.mat.opacity = 0.34;
  p.age = 0;
}
function updatePrints(dt: number): void {
  for (const p of prints) {
    if (p.age > 8) continue;
    p.age += dt;
    p.mat.opacity = Math.max(0, 0.34 * (1 - p.age / 8)); // el polvo se asienta
  }
}
function makeBlobShadow(scale: number): THREE.Mesh {
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.015;
  m.scale.setScalar(scale);
  return m;
}

// ── Partículas de impacto: pool fijo de Points aditivos (el "juice" barato) ──
const P_MAX = 320;
const pPos = new Float32Array(P_MAX * 3);
const pCol = new Float32Array(P_MAX * 3);
const pVel = new Float32Array(P_MAX * 3);
const pBase = new Float32Array(P_MAX * 3);
const pLife = new Float32Array(P_MAX);
const pMaxLife = new Float32Array(P_MAX);
for (let i = 0; i < P_MAX; i += 1) pPos[i * 3 + 1] = -999;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const points = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({
    size: 0.17,
    map: dotTex, // redondo: los Points crudos se dibujan como CUADRADOS
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
points.frustumCulled = false;
scene.add(points);
let pCursor = 0;
const pTmpColor = new THREE.Color();
function spawnBurst(
  x: number,
  z: number,
  color: number,
  count: number,
  speed: number,
  up = 3.2,
  y = 0.8,
): void {
  pTmpColor.set(color);
  for (let k = 0; k < count; k += 1) {
    const i = pCursor;
    pCursor = (pCursor + 1) % P_MAX;
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.4 + Math.random() * 0.8);
    pPos[i * 3] = x;
    pPos[i * 3 + 1] = terrainY(x, z) + y + Math.random() * 0.5;
    pPos[i * 3 + 2] = z;
    pVel[i * 3] = Math.cos(a) * s;
    pVel[i * 3 + 1] = up * (0.4 + Math.random() * 0.8);
    pVel[i * 3 + 2] = Math.sin(a) * s;
    pLife[i] = pMaxLife[i] = 0.35 + Math.random() * 0.3;
    pBase[i * 3] = pTmpColor.r;
    pBase[i * 3 + 1] = pTmpColor.g;
    pBase[i * 3 + 2] = pTmpColor.b;
  }
}
function updateParticles(dt: number): void {
  for (let i = 0; i < P_MAX; i += 1) {
    if (pLife[i]! <= 0) continue;
    pLife[i]! -= dt;
    if (pLife[i]! <= 0) {
      pPos[i * 3 + 1] = -999;
      pCol[i * 3] = pCol[i * 3 + 1] = pCol[i * 3 + 2] = 0;
      continue;
    }
    pVel[i * 3 + 1]! -= 7.5 * dt; // gravedad lunar-ish
    pPos[i * 3]! += pVel[i * 3]! * dt;
    pPos[i * 3 + 1]! += pVel[i * 3 + 1]! * dt;
    pPos[i * 3 + 2]! += pVel[i * 3 + 2]! * dt;
    const floorY = terrainY(pPos[i * 3]!, pPos[i * 3 + 2]!) + 0.03;
    if (pPos[i * 3 + 1]! < floorY) {
      pPos[i * 3 + 1] = floorY;
      pVel[i * 3 + 1]! *= -0.4; // rebote amortiguado
      pVel[i * 3]! *= 0.8;
      pVel[i * 3 + 2]! *= 0.8;
    }
    const f = pLife[i]! / pMaxLife[i]!; // aditivo: desvanecer = ir a negro
    pCol[i * 3] = pBase[i * 3]! * f;
    pCol[i * 3 + 1] = pBase[i * 3 + 1]! * f;
    pCol[i * 3 + 2] = pBase[i * 3 + 2]! * f;
  }
  pGeo.attributes.position!.needsUpdate = true;
  pGeo.attributes.color!.needsUpdate = true;
}

/** Tope de instancias del mixer VIVAS + libres en pool. Al toparse, se desaloja
 * una libre de otros genes (sin dispose: los materiales del mixer son
 * compartidos y disponerlos rompe el resto — lección aprendida). */
const MAX_MIXER_PREYS = 16;

function createPreySystem(mixer: Mixer3D) {
  // pool por genes: la presa encarna SU axie real; al morir, la instancia se
  // reutiliza para la siguiente presa con los mismos genes (incluso entre runs)
  const freePool = new Map<string, AxieInst[]>();
  let totalAxies = 0;

  interface Rec {
    group: THREE.Group;
    body: THREE.Object3D;
    axie: AxieInst | null;
    genes: string;
    ringMat: THREE.MeshBasicMaterial;
    /** Corona flotante del Guardián (solo Alfas). */
    crown?: THREE.Mesh;
    idle?: string;
    walk?: string;
    stun?: string;
    playing: string;
    flashTtl: number;
    /** Mallas ocultas porque la Quimera se llevó esa parte (restaurar al reciclar). */
    hidden: THREE.Object3D[];
    /** Carga del rig en vuelo (no duplicar). */
    pending: boolean;
    /** Cápsula a la espera: reintenta adquirir rig cada tanto. */
    retryIn: number;
    retries: number;
  }
  const recs = new Map<number, Rec>();
  const capsuleGeo = new THREE.CapsuleGeometry(0.55, 0.9, 4, 12);
  const ringGeo = new THREE.RingGeometry(0.55, 0.8, 32);

  function attach(rec: Rec, inst: AxieInst): void {
    rec.group.remove(rec.body);
    if (rec.body instanceof THREE.Mesh) (rec.body.material as THREE.Material).dispose();
    rec.body = inst.wrapper;
    rec.axie = inst;
    const names = inst.animations.clips.map((c) => c.name);
    rec.idle = names.find((n) => n.includes('Default.Idle')) ?? names[0];
    rec.walk = names.find((n) => n.includes('Default.Walk')) ?? rec.idle;
    rec.stun = names.find((n) => n.includes('Default.Stun'));
    rec.playing = '';
    inst.wrapper.position.set(0, 0, 0);
    inst.wrapper.rotation.set(0, 0, 0);
    rec.group.add(inst.wrapper);
  }

  function acquire(rec: Rec, enemyId: number): void {
    if (!rec.genes || rec.pending || rec.axie) return; // sintética / ya en vuelo / ya tiene rig
    const pool = freePool.get(rec.genes);
    if (pool && pool.length > 0) {
      attach(rec, pool.pop()!);
      return;
    }
    if (totalAxies >= MAX_MIXER_PREYS) {
      // el pool es POR GENES: sin esto, tras ~16 axies distintos toda presa
      // nueva se quedaba en cápsula para siempre (bug visto por Luis, 4 sep).
      // Desalojar una instancia LIBRE de otros genes y ceder su cupo.
      let evicted = false;
      for (const arr of freePool.values()) {
        if (arr.length > 0) {
          arr.pop(); // sin dispose: materiales/geometrías compartidos del mixer
          totalAxies -= 1;
          evicted = true;
          break;
        }
      }
      if (!evicted) {
        rec.retryIn = 0.9; // todo en uso (oleada cargada): reintentar al liberar
        return;
      }
    }
    totalAxies += 1;
    rec.pending = true;
    mixer
      .createFromGenes({
        genes: rec.genes,
        extensions: { quality: 'balanced', artMode: 'faithful', strict: false, animationSet: 'full' },
      })
      .then((inst) => {
        rec.pending = false;
        const current = recs.get(enemyId);
        if (!current || current !== rec || current.axie) {
          // la presa ya no existe: la instancia va directo al pool
          if (!freePool.has(rec.genes)) freePool.set(rec.genes, []);
          freePool.get(rec.genes)!.push(inst);
          return;
        }
        attach(rec, inst);
      })
      .catch((err) => {
        rec.pending = false;
        rec.retries += 1;
        rec.retryIn = 1.2;
        totalAxies -= 1;
        console.warn('presa mixer falló, se queda la cápsula', err);
      });
  }

  function release(id: number, rec: Rec): void {
    scene.remove(rec.group);
    for (const node of rec.hidden) node.visible = true; // la instancia vuelve íntegra al pool
    rec.hidden = [];
    if (rec.axie) {
      rec.group.remove(rec.axie.wrapper);
      if (!freePool.has(rec.genes)) freePool.set(rec.genes, []);
      freePool.get(rec.genes)!.push(rec.axie);
    } else if (rec.body instanceof THREE.Mesh) {
      (rec.body.material as THREE.Material).dispose();
    }
    rec.ringMat.dispose();
    if (rec.crown) (rec.crown.material as THREE.Material).dispose();
    recs.delete(id);
  }

  return {
    flash(enemyId: number): void {
      const rec = recs.get(enemyId);
      if (rec) rec.flashTtl = 0.08;
    },
    /** Clona las mallas de una parte de la presa (y se las oculta: la pierde a la vista). */
    clonePartMeshes(enemyId: number, prefix: string): THREE.Object3D[] {
      const rec = recs.get(enemyId);
      if (!rec?.axie) return [];
      const clones = bakeCloneMeshes(rec.axie.wrapper, prefix, (node) => {
        node.visible = false;
        rec.hidden.push(node);
      });
      console.info('[quimera] absorbida', prefix, '→', clones.length, 'mallas');
      return clones;
    },
    clear(): void {
      for (const [id, rec] of [...recs]) release(id, rec);
    },
    /** Precalienta el pool durante el título: menos cápsulas en el primer minuto. */
    warm(genesList: readonly string[]): void {
      for (const genes of genesList) {
        if (!genes || totalAxies >= MAX_MIXER_PREYS - 4) break; // deja cupo vivo
        if (freePool.get(genes)?.length) continue;
        totalAxies += 1;
        mixer
          .createFromGenes({
            genes,
            extensions: { quality: 'balanced', artMode: 'faithful', strict: false, animationSet: 'full' },
          })
          .then((inst) => {
            if (!freePool.has(genes)) freePool.set(genes, []);
            freePool.get(genes)!.push(inst);
          })
          .catch(() => {
            totalAxies -= 1;
          });
      }
    },
    sync(state: SimState, prev: SimState, alpha: number, dt: number): void {
      const prevById = new Map(prev.enemies.map((e) => [e.id, e]));
      const playerX = prev.player.x + (state.player.x - prev.player.x) * alpha;
      const playerY = prev.player.y + (state.player.y - prev.player.y) * alpha;
      const seen = new Set<number>();
      for (const enemy of state.enemies) {
        seen.add(enemy.id);
        let rec = recs.get(enemy.id);
        if (!rec) {
          const group = new THREE.Group();
          const capsule = new THREE.Mesh(
            capsuleGeo,
            new THREE.MeshStandardMaterial({ color: CLASS_COLOR[enemy.archetype], roughness: 0.7 }),
          );
          capsule.position.y = 1.0;
          const ringMat = new THREE.MeshBasicMaterial({
            color: CLASS_COLOR[enemy.archetype],
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.y = 0.04;
          ring.scale.setScalar(enemy.isAlfa ? 1.6 : enemy.golden || enemy.nemesis ? 1.25 : 1);
          group.add(capsule, ring, makeBlobShadow(enemy.isAlfa ? 2.7 : 1.9));
          let crown: THREE.Mesh | undefined;
          if (enemy.isAlfa || enemy.bounty) {
            // corona flotante: Guardián (roja) o PRESA MARCADA (dorada)
            crown = new THREE.Mesh(
              crystalGeo,
              new THREE.MeshBasicMaterial({ color: enemy.isAlfa ? 0xff5a3c : 0xffd24a }),
            );
            if (enemy.isAlfa) {
              crown.scale.set(0.22, 0.34, 0.22);
              crown.userData.baseY = 2.7;
            } else {
              crown.scale.set(0.14, 0.22, 0.14);
              crown.userData.baseY = 2.2;
            }
            crown.position.y = crown.userData.baseY as number;
            group.add(crown);
          }
          scene.add(group);
          rec = {
            group,
            body: capsule,
            axie: null,
            genes: enemy.genes,
            ringMat,
            crown,
            playing: '',
            flashTtl: 0,
            hidden: [],
            pending: false,
            retryIn: 0,
            retries: 0,
          };
          recs.set(enemy.id, rec);
          // luna abierta: el rig solo se carga CERCA del jugador (la fauna
          // lejana es cápsula tras la niebla; al acercarte, el retry lo viste)
          if (Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < 38) {
            acquire(rec, enemy.id);
          }
        }
        // cápsula a la espera: reintentar el rig (pool liberado, cupo desalojado,
        // fallo transitorio, o porque ya te ACERCASTE) — máx 3 intentos creados
        if (!rec.axie && rec.genes && !rec.pending && rec.retries < 3) {
          rec.retryIn -= dt;
          if (
            rec.retryIn <= 0 &&
            Math.hypot(enemy.x - state.player.x, enemy.y - state.player.y) < 38
          ) {
            rec.retryIn = 0.9;
            acquire(rec, enemy.id);
          }
        }

        const knocked = enemy.knockdownTicks > 0;
        const winding = enemy.windupTicks > 0;
        const base = enemy.isAlfa ? 1.5 : 1;
        const pe = prevById.get(enemy.id);
        const ex = pe ? pe.x + (enemy.x - pe.x) * alpha : enemy.x;
        const ey = pe ? pe.y + (enemy.y - pe.y) * alpha : enemy.y;
        rec.group.position.set(ex, terrainY(ex, ey), ey);
        rec.body.scale.set(
          base * (winding ? 1.12 : 1),
          base * (winding ? 0.78 : 1),
          base * (winding ? 1.12 : 1),
        );
        if (rec.axie) {
          // derribo: anim Stun (aturdida = cosechable); si el rig no la trae, cae de lado
          const hasStun = Boolean(rec.stun);
          rec.body.position.y = knocked && !hasStun ? 0.35 : 0;
          rec.body.rotation.z = knocked && !hasStun ? Math.PI / 2 : 0;
          if (!knocked) {
            // huyendo corre mirando lejos; peleando encara a la Quimera
            rec.body.rotation.y = enemy.fleeing
              ? Math.atan2(ex - playerX, ey - playerY)
              : Math.atan2(playerX - ex, playerY - ey);
          }
          const stunned = enemy.stunTicks > 0;
          const idling = winding || enemy.sleeping || enemy.tiredTicks > 0;
          const target =
            (knocked || stunned ? (rec.stun ?? rec.idle) : idling ? rec.idle : rec.walk) ?? '';
          if (target && target !== rec.playing) {
            rec.playing = target;
            rec.axie.playAnimation(target, { loop: true });
          }
          rec.axie.update(dt);
        } else {
          rec.body.position.y = knocked ? 0.55 : 1.0 * (winding ? 0.85 : 1);
          rec.body.rotation.z = knocked ? Math.PI / 2 : 0;
          const mat = (rec.body as THREE.Mesh).material as THREE.MeshStandardMaterial;
          mat.color.set(knocked ? 0x8888a0 : CLASS_COLOR[enemy.archetype]);
        }

        if (rec.crown) {
          rec.crown.rotation.y = state.tick * 0.05;
          rec.crown.position.y =
            (rec.crown.userData.baseY as number) + 0.18 * Math.sin(state.tick * 0.07);
        }
        // Zzz de las dormidas (La Cicatriz)
        if (enemy.sleeping && Math.random() < dt * 0.6) {
          floatText(enemy.x, enemy.y, 'z Z z', '#9aa4c8', 12);
        }
        // la DORADA chisporrotea al correr — que se vea el jackpot huyendo
        if (enemy.golden && enemy.knockdownTicks === 0 && Math.random() < dt * 1.2) {
          floatText(enemy.x, enemy.y, '✦', '#ffd24a', 13);
        }
        // anillo de estado: golpe > aturdida > exhausto > derribo > dormida > telegraph > clase
        if (rec.flashTtl > 0) {
          rec.flashTtl -= dt;
          rec.ringMat.color.set(0xffffff);
        } else if (enemy.stunTicks > 0) {
          rec.ringMat.color.set(enemy.stunTicks % 16 < 8 ? 0xffffff : 0x8888a0); // parpadeo
        } else if (enemy.tiredTicks > 0) {
          rec.ringMat.color.set(enemy.tiredTicks % 14 < 7 ? 0xf6b73c : 0x8a6a20); // ¡crítico gratis!
        } else if (knocked) {
          rec.ringMat.color.set(0xe0b055);
        } else if (enemy.sleeping) {
          rec.ringMat.color.set(CLASS_COLOR[enemy.archetype]);
          rec.ringMat.color.multiplyScalar(0.18); // apagada: duerme
        } else if (winding) {
          rec.ringMat.color.set(0xff5a3c);
        } else if (enemy.golden) {
          // DORADA: anillo de oro palpitante — inconfundible
          rec.ringMat.color.set(0xffd24a).multiplyScalar(0.7 + 0.3 * Math.sin(state.tick * 0.2));
        } else if (enemy.nemesis) {
          // CICATRIZADA: latido rojo oscuro — te está buscando
          rec.ringMat.color.set(0xd23030).multiplyScalar(state.tick % 40 < 20 ? 1 : 0.45);
        } else if (enemy.feral && !enemy.fleeing) {
          // FERAL a la caza: naranja encendido — el cazador eres TÚ… ¿seguro?
          rec.ringMat.color.set(0xff7a3c).multiplyScalar(0.7 + 0.3 * Math.sin(state.tick * 0.25));
        } else {
          rec.ringMat.color.set(CLASS_COLOR[enemy.archetype]);
          // pulso de vida: el anillo se apaga conforme baja el hp (sin números)
          rec.ringMat.color.multiplyScalar(0.35 + 0.65 * Math.max(0, enemy.hp / enemy.maxHp));
        }
      }
      for (const [id, rec] of [...recs]) {
        if (!seen.has(id)) release(id, rec);
      }
    },
  };
}

// ── Flash de ataque (sector plano que se desvanece) ──
interface Flash {
  mesh: THREE.Mesh;
  ttl: number;
}
const flashes: Flash[] = [];

function spawnAttackFlash(state: SimState, range: number, arcDegrees: number, tint: number): void {
  const arc = (arcDegrees * Math.PI) / 180;
  const facing = Math.atan2(state.player.faceX, state.player.faceY);
  const geo = new THREE.CircleGeometry(range, 24, Math.PI / 2 - arc / 2, arc);
  // color de clase de la parte, aclarado: el arco dice qué ranura Y qué clase
  const color = new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.35);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = -facing;
  mesh.position.set(state.player.x, terrainY(state.player.x, state.player.y) + 0.06, state.player.y);
  scene.add(mesh);
  flashes.push({ mesh, ttl: 0.15 });
}

// ── Texto flotante de combate: ¡CRÍTICO!, ¡PERFECTA!, Zzz, aturdidos… ──
interface FloatingText {
  el: HTMLDivElement;
  x: number;
  z: number;
  t: number;
}
const floatingTexts: FloatingText[] = [];
const floatProj = new THREE.Vector3();
function floatText(x: number, z: number, text: string, color = '#fff2c0', size = 14): void {
  if (floatingTexts.length > 14) return; // sin spam
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    `position:fixed;left:-100px;top:-100px;transform:translate(-50%,-50%);` +
    `font:bold ${size}px ui-monospace,monospace;color:${color};pointer-events:none;` +
    'text-shadow:0 2px 6px #0a0a14;white-space:nowrap;z-index:8';
  document.body.appendChild(el);
  floatingTexts.push({ el, x, z, t: 0 });
}
function updateFloatingTexts(dt: number): void {
  for (let i = floatingTexts.length - 1; i >= 0; i -= 1) {
    const f = floatingTexts[i]!;
    f.t += dt;
    if (f.t >= 1) {
      f.el.remove();
      floatingTexts.splice(i, 1);
      continue;
    }
    floatProj.set(f.x, terrainY(f.x, f.z) + 1.7 + f.t * 1.4, f.z).project(camera);
    f.el.style.left = `${(floatProj.x * 0.5 + 0.5) * innerWidth}px`;
    f.el.style.top = `${(-floatProj.y * 0.5 + 0.5) * innerHeight}px`;
    f.el.style.opacity = String(1 - f.t * f.t);
  }
}

// ── Paleta por territorio: cada tercio de la cacería es otro mundo ──
const TERR_PALETTE = [
  // LOS PRADOS: pradera lunar viva
  { ground: 0x9fc6a8, rock: 0x50735a, hemi: 1.5, fog: 0x16241c, fogFar: 125,
    rim: 0x8fd9a0, crystal: 0x7fe07f, crystalEm: 0x2fa05a },
  // EL MAR DE POLVO: desierto que llueve fuego
  { ground: 0xd8c9a8, rock: 0x8a7c5e, hemi: 1.35, fog: 0x2a2338, fogFar: 110,
    rim: 0xe0c07f, crystal: 0xffc46b, crystalEm: 0xa06a2f },
  // LA CICATRIZ: NOCHE cerrada — tu aura es la única luz (el rig la sube solo)
  { ground: 0x584a80, rock: 0x3a3158, hemi: 0.38, fog: 0x060410, fogFar: 44,
    rim: 0xb45aff, crystal: 0xff5a3c, crystalEm: 0xa02f2f },
] as const;

// Textura de suelo POR territorio (el color tiñe; el patrón cuenta el bioma)
const groundTexCache: Array<THREE.CanvasTexture | null> = [null, null, null];
function territoryGroundTexture(style: number): THREE.CanvasTexture {
  const cached = groundTexCache[style];
  if (cached) return cached;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  if (style === 0) {
    // PRADOS: parches de musgo + motas de pasto
    g.fillStyle = '#39423a';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 10 + Math.random() * 42;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, Math.random() < 0.55 ? 'rgba(130,175,120,0.22)' : 'rgba(14,24,16,0.3)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(150,200,140,0.5)';
    for (let i = 0; i < 700; i += 1) {
      g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 2.5);
    }
  } else if (style === 1) {
    // MAR DE POLVO: vetas diagonales de duna
    g.fillStyle = '#4e4536';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 60; i += 1) {
      const y0 = Math.random() * 512;
      const light = Math.random() < 0.5;
      g.strokeStyle = light ? 'rgba(220,195,150,0.16)' : 'rgba(20,14,8,0.22)';
      g.lineWidth = 3 + Math.random() * 9;
      g.beginPath();
      g.moveTo(-20, y0);
      g.bezierCurveTo(170, y0 - 45 - Math.random() * 40, 340, y0 + 45 + Math.random() * 40, 532, y0);
      g.stroke();
    }
  } else {
    // CICATRIZ: roca muerta con grietas incandescentes
    g.fillStyle = '#181425';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 70; i += 1) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 8 + Math.random() * 30;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(4,3,10,0.5)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.shadowColor = '#ff3a1a';
    g.shadowBlur = 7;
    g.strokeStyle = 'rgba(255,84,42,0.85)';
    for (let i = 0; i < 16; i += 1) {
      g.lineWidth = 1.5 + Math.random() * 1.5;
      let x = Math.random() * 512;
      let y = Math.random() * 512;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k += 1) {
        x += (Math.random() - 0.5) * 90;
        y += (Math.random() - 0.5) * 90;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    g.shadowBlur = 0;
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(58, 58);
  t.colorSpace = THREE.SRGBColorSpace;
  groundTexCache[style] = t;
  return t;
}

function applyTerritoryPalette(idx: number): void {
  const p = TERR_PALETTE[Math.min(idx, TERR_PALETTE.length - 1)]!;
  groundMat.color.set(p.ground);
  groundMat.map = territoryGroundTexture(Math.min(idx, 2));
  groundMat.needsUpdate = true;
  rockMat.color.set(p.rock);
  rimMat.color.set(p.rim);
  crystalMat.color.set(p.crystal);
  crystalMat.emissive.set(p.crystalEm);
  hemiLight.intensity = p.hemi;
  (scene.fog as THREE.Fog).color.set(p.fog);
  (scene.fog as THREE.Fog).far = p.fogFar;
}

/** El cambio de territorio COMPLETO: paleta + rocas con otra forma + decoración. */
function dressTerritory(
  idx: number,
  obstacles: readonly { x: number; y: number; r: number }[],
  props: readonly Prop[] = [],
): void {
  applyTerritoryPalette(idx);
  // los círculos de los props colisionan pero NO son rocas: sin peñasco encima
  const isProp = (o: { x: number; y: number }) =>
    props.some((pp) => pp.r > 0 && Math.abs(pp.x - o.x) < 1e-6 && Math.abs(pp.y - o.y) < 1e-6);
  buildObstacleRocks(obstacles.filter((o) => !isProp(o)), idx);
  buildTerritoryDecor(idx, props);
}

// ── FARO de la manada activa: pilar de luz — la brújula diegética de la luna ──
const beaconMat = new THREE.MeshBasicMaterial({
  color: 0xffd24a,
  transparent: true,
  opacity: 0.22,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const beacon = new THREE.Group();
{
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.9, 34, 12, 1, true), beaconMat);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 34, 8, 1, true), beaconMat);
  outer.position.y = 17;
  inner.position.y = 17;
  beacon.add(outer, inner);
  scene.add(beacon);
}

// ── Guaridas: boca de cueva donde vive cada Guardián (manadas Alfa) ──
// v2 (Luis: "no veo las cuevas"): el DOBLE de grandes, con montículo detrás y
// DOS OJOS ROJOS latiendo dentro de la oscuridad mientras el Guardián viva.
const caveMeshes: THREE.Object3D[] = [];
const caveEyeMats: THREE.MeshBasicMaterial[] = [];
const caveEyeWave: number[] = []; // qué oleada apaga cada par de ojos
function buildCaves(herds: readonly { x: number; y: number }[], alfaWaves: readonly number[]): void {
  for (const m of caveMeshes) scene.remove(m);
  caveMeshes.length = 0;
  for (const m of caveEyeMats) m.dispose();
  caveEyeMats.length = 0;
  caveEyeWave.length = 0;
  for (const w of alfaWaves) {
    const anchor = herds[w - 1];
    if (!anchor) continue;
    const cave = new THREE.Group();
    cave.position.set(anchor.x, terrainY(anchor.x, anchor.y), anchor.y);
    cave.rotation.y = Math.atan2(-anchor.x, -anchor.y); // la boca mira al centro
    // montículo de respaldo: la cueva ES un cerro, no un adorno
    const mound = new THREE.Mesh(rockGeo, rockMat);
    mound.scale.set(6.5, 4.6, 5);
    mound.position.set(0, 1.4, -6.2);
    mound.castShadow = true;
    cave.add(mound);
    // dos colmillos de roca inclinados + dintel: una boca oscura GRANDE
    for (const side of [-1, 1]) {
      const fang = new THREE.Mesh(shardGeo, rockMat);
      fang.scale.set(2.6, 4.4, 2.6);
      fang.position.set(side * 3.4, 3.4, -3.5);
      fang.rotation.z = -side * 0.35;
      fang.castShadow = true;
      cave.add(fang);
    }
    const lintel = new THREE.Mesh(rockGeo, rockMat);
    lintel.scale.set(5, 1.8, 2.4);
    lintel.position.set(0, 6.4, -3.6);
    lintel.castShadow = true;
    cave.add(lintel);
    const mouth = new THREE.Mesh(
      new THREE.CircleGeometry(3.1, 22),
      new THREE.MeshBasicMaterial({ color: 0x020206 }),
    );
    mouth.position.set(0, 2.6, -3.4);
    cave.add(mouth);
    // los OJOS: algo respira ahí adentro
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true });
    caveEyeMats.push(eyeMat);
    caveEyeWave.push(w);
    const eyeGeo = new THREE.SphereGeometry(0.17, 8, 6);
    for (const side of [-0.7, 0.7]) {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side, 3.1, -3.3);
      cave.add(eye);
    }
    scene.add(cave);
    caveMeshes.push(cave);
  }
}

// ── El ROVER (funcional: móntalo) — malla única que sigue al estado del motor ──
const roverGroup = new THREE.Group();
{
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xcbb187, roughness: 0.8, metalness: 0.2 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x3a3a44, roughness: 1 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 1.2), bodyMat);
  body.position.y = 0.72;
  body.castShadow = true;
  roverGroup.add(body);
  for (const wx of [-0.7, 0, 0.7]) {
    for (const wz of [-0.72, 0.72]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 10), wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.32, wz);
      wheel.name = 'wheel';
      roverGroup.add(wheel);
    }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 6), bodyMat);
  mast.position.set(0.6, 1.5, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.14), wheelMat);
  head.position.set(0.6, 2.0, 0);
  roverGroup.add(mast, head);
  // detalle: panel solar, antena de plato, faros y el RTG trasero
  const panelMat = new THREE.MeshStandardMaterial({ color: 0x2a4a8a, roughness: 0.3, metalness: 0.6 });
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.05, 0.95), panelMat);
  panel.position.set(-0.2, 1.12, 0);
  panel.rotation.z = 0.12;
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.45),
    bodyMat,
  );
  dish.position.set(-0.75, 1.35, 0.3);
  dish.rotation.x = -0.9;
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2c0 });
  for (const lz of [-0.35, 0.35]) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), lightMat);
    lamp.position.set(0.98, 0.78, lz);
    roverGroup.add(lamp);
  }
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 8), wheelMat);
  rtg.rotation.z = Math.PI / 2;
  rtg.position.set(-0.95, 0.85, -0.25);
  roverGroup.add(panel, dish, rtg);
  roverGroup.traverse((m) => { m.castShadow = true; });
  roverGroup.add(makeBlobShadow(2.4));
  scene.add(roverGroup);
}

// ── FIERROS de chatarra lunar: armas que se VEN — tiradas en el suelo, cargadas
// en la boca de la Quimera, y rotas de tanto madrazo (por eso duran 22 s) ──
const scrapMat = new THREE.MeshStandardMaterial({ color: 0x9aa0b4, roughness: 0.45, metalness: 0.75 });
const scrapDarkMat = new THREE.MeshStandardMaterial({ color: 0x4a4e60, roughness: 0.6, metalness: 0.6 });
function makeScrapWeapon(variant: number): THREE.Group {
  const g = new THREE.Group();
  if (variant === 0) {
    // TUBO DE LA ESTACIÓN
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.5, 8), scrapMat);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.16, 8), scrapDarkMat);
    cap.position.y = 0.72;
    g.add(pipe, cap);
  } else if (variant === 1) {
    // LLAVE DE MISIÓN
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.2, 8), scrapMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.09), scrapDarkMat);
    head.position.y = 0.68;
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.09), scrapDarkMat);
    jaw.position.set(0.13, 0.84, 0);
    g.add(handle, head, jaw);
  } else {
    // PUNTAL DEL CASCO (el bate)
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.045, 1.35, 8), scrapMat);
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 8), scrapDarkMat);
    grip.position.y = -0.62;
    g.add(bat, grip);
  }
  g.traverse((m) => {
    m.castShadow = true;
  });
  return g;
}

// ── Herramientas de la luna: reliquia / cristal de vida / núcleo de ultimate ──
const PICKUP_COLOR: Record<string, number> = {
  relic: 0x9a5cff,
  heal: 0x7fe07f,
  ult: 0xf6b73c,
  fang: 0xff5a3c, // el ARMA: rojo depredador
};
const pickupMeshes: THREE.Group[] = [];
function buildPickups(pickups: readonly { x: number; y: number; kind: string }[]): void {
  for (const m of pickupMeshes) scene.remove(m);
  pickupMeshes.length = 0;
  pickups.forEach((p, i) => {
    const g = new THREE.Group();
    g.position.set(p.x, terrainY(p.x, p.y), p.y);
    const color = PICKUP_COLOR[p.kind] ?? 0xffffff;
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    if (p.kind === 'fang') {
      // el FIERRO se ve como lo que es: chatarra tirada/clavada en el polvo
      const weapon = makeScrapWeapon(i % 3);
      weapon.position.y = 0.5;
      weapon.rotation.z = 0.95; // en ángulo, medio clavado
      weapon.rotation.y = i * 1.7;
      g.add(weapon, halo);
      g.userData.weapon = true;
    } else {
      const gem = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({ color }));
      gem.scale.set(0.28, 0.42, 0.28);
      gem.position.y = 0.9;
      g.add(gem, halo);
    }
    scene.add(g);
    pickupMeshes.push(g);
  });
}

// ── Fundido de VIAJE entre territorios (el mundo espera; la Quimera camina) ──
const travelFade = document.createElement('div');
travelFade.style.cssText =
  'position:fixed;inset:0;background:#06060c;opacity:0;pointer-events:none;z-index:9;' +
  'display:grid;place-items:center;font-family:ui-monospace,monospace';
const travelText = document.createElement('div');
travelText.style.cssText =
  'color:#fff2c0;font-size:24px;letter-spacing:6px;text-shadow:0 0 18px #fff2c055;text-align:center';
travelFade.appendChild(travelText);
document.body.appendChild(travelFade);
const TRAVEL_SECONDS = 2.8;

// ── Intro de jefe: letterbox de cine + nombre del Guardián ──
const bossBarTop = document.createElement('div');
const bossBarBot = document.createElement('div');
for (const [bar, side] of [
  [bossBarTop, 'top'],
  [bossBarBot, 'bottom'],
] as const) {
  bar.style.cssText =
    `position:fixed;left:0;right:0;${side}:0;height:0;background:#06060c;z-index:8;` +
    'pointer-events:none;transition:height .35s ease';
  document.body.appendChild(bar);
}
const bossNameEl = document.createElement('div');
bossNameEl.style.cssText =
  'position:fixed;left:50%;top:16%;transform:translateX(-50%);z-index:8;pointer-events:none;' +
  'font:bold 22px ui-monospace,monospace;letter-spacing:6px;color:#ff9a7a;' +
  'text-shadow:0 0 18px #ff5a3c88;opacity:0;transition:opacity .35s;white-space:nowrap';
document.body.appendChild(bossNameEl);

// ── Pings del radar (la DORADA se anuncia también en el mapa) ──
const radarPings: Array<{ x: number; y: number; born: number }> = [];

// ── Radar: dónde está la manada (las presas huyen; sin esto la cacería se pierde) ──
const RADAR_SIZE = 136;
const radar = document.createElement('canvas');
radar.width = RADAR_SIZE;
radar.height = RADAR_SIZE;
radar.style.cssText =
  'position:fixed;right:12px;top:12px;width:118px;height:118px;pointer-events:none;opacity:.92';
document.body.appendChild(radar);
const radarCtx = radar.getContext('2d')!;

function syncRadar(state: SimState): void {
  // LUNA ABIERTA: el radar es LOCAL, centrado en ti; la manada lejana se marca
  // con una flecha dorada en el borde (la brújula del viaje)
  const ctx = radarCtx;
  const c = RADAR_SIZE / 2;
  const RANGE = 26;
  const scale = (c - 6) / RANGE;
  const px0 = state.player.x;
  const py0 = state.player.y;
  const rx = (wx: number) => c + (wx - px0) * scale;
  const ry = (wy: number) => c + (wy - py0) * scale;
  const near = (wx: number, wy: number, margin = 0) =>
    Math.hypot(wx - px0, wy - py0) <= RANGE + margin;
  ctx.clearRect(0, 0, RADAR_SIZE, RADAR_SIZE);
  // el radar gira con la cámara: arriba = hacia donde miras
  ctx.save();
  ctx.translate(c, c);
  ctx.rotate(camYaw);
  ctx.translate(-c, -c);
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10,10,20,0.6)';
  ctx.fill();
  ctx.strokeStyle = '#3a3a5c';
  ctx.lineWidth = 2;
  ctx.stroke();
  // rocas cercanas
  ctx.fillStyle = 'rgba(90,100,150,0.45)';
  for (const o of state.obstacles) {
    if (!near(o.x, o.y, o.r)) continue;
    ctx.beginPath();
    ctx.arc(rx(o.x), ry(o.y), Math.max(1.5, o.r * scale), 0, Math.PI * 2);
    ctx.fill();
  }
  // herramientas sin reclamar (rombos por tipo)
  for (const p of state.pickups) {
    if (p.taken || !near(p.x, p.y)) continue;
    ctx.save();
    ctx.translate(rx(p.x), ry(p.y));
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = hexColor(PICKUP_COLOR[p.kind] ?? 0xffffff);
    ctx.fillRect(-2.4, -2.4, 4.8, 4.8);
    ctx.restore();
  }
  // el rover aparcado (cuadrito blanco)
  if (!state.player.riding && near(state.rover.x, state.rover.y)) {
    ctx.fillStyle = '#e8e8f2';
    ctx.fillRect(rx(state.rover.x) - 3, ry(state.rover.y) - 3, 6, 6);
  }
  // meteorito entrante
  if (state.meteor && near(state.meteor.x, state.meteor.y, METEOR_RADIUS)) {
    ctx.beginPath();
    ctx.arc(rx(state.meteor.x), ry(state.meteor.y), METEOR_RADIUS * scale, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff5a3c';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  for (const e of state.enemies) {
    if (!near(e.x, e.y)) continue;
    const x = rx(e.x);
    const y = ry(e.y);
    ctx.beginPath();
    ctx.arc(x, y, e.isAlfa ? 5 : e.golden ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle =
      e.knockdownTicks > 0 ? '#e0b055' : e.golden ? '#ffd24a' : hexColor(CLASS_COLOR[e.archetype]);
    ctx.fill();
    if (e.isAlfa || e.nemesis || e.feral) {
      ctx.strokeStyle = e.isAlfa ? '#ff5a3c' : e.nemesis ? '#d23030' : '#ff7a3c';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  // pings: círculo que se expande donde apareció la DORADA
  const nowMs = performance.now();
  for (let i = radarPings.length - 1; i >= 0; i -= 1) {
    const ping = radarPings[i]!;
    const age = (nowMs - ping.born) / 1000;
    if (age > 2.4) {
      radarPings.splice(i, 1);
      continue;
    }
    if (!near(ping.x, ping.y, 6)) continue;
    const phase = (age % 0.8) / 0.8;
    ctx.beginPath();
    ctx.arc(rx(ping.x), ry(ping.y), 3 + phase * 16, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,210,74,${(1 - phase) * 0.9})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  // la MANADA activa: estrella dorada cerca, flecha en el borde si está lejos
  const anchor = state.herds[state.wave.wave - 1];
  if (anchor && (state.wave.pending > 0 || state.wave.alive > 0)) {
    if (near(anchor.x, anchor.y)) {
      ctx.beginPath();
      ctx.arc(rx(anchor.x), ry(anchor.y), 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffd24a';
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      const dx = anchor.x - px0;
      const dy = anchor.y - py0;
      const dl = Math.hypot(dx, dy);
      const bx = c + (dx / dl) * (c - 9);
      const by = c + (dy / dl) * (c - 9);
      ctx.beginPath();
      ctx.arc(bx, by, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24a';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 4.5 + 2.5 * Math.abs(Math.sin(nowMs / 300)), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,74,0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(c, c, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

/**
 * Clona las mallas cuyo nombre empiece con `prefix`, HORNEANDO su transform de
 * mundo relativo a `root` (posición/rotación/escala del esqueleto incluidas —
 * sin esto los clones quedan fuera de lugar o microscópicos).
 */
function bakeCloneMeshes(
  root: THREE.Object3D,
  prefix: string,
  onOriginal?: (node: THREE.Object3D) => void,
): THREE.Object3D[] {
  root.updateWorldMatrix(true, true);
  const invRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const clones: THREE.Object3D[] = [];
  root.traverse((node) => {
    if (!node.name.startsWith(prefix) || !(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    const clone = mesh.clone();
    const rel = new THREE.Matrix4().multiplyMatrices(invRoot, node.matrixWorld);
    rel.decompose(clone.position, clone.quaternion, clone.scale);
    // rotación limpia: la orientación la pone el anclaje, no la pose de la presa
    clone.quaternion.identity();
    // las partes de Axie son planas y de una sola cara: doble cara para que se
    // vean desde cualquier ángulo del montaje. OJO: NO clonar el material — los
    // shaders del mixer tienen estado interno (gammaSpace) y clone() los rompe;
    // mutar el flag `side` del material compartido es inocuo.
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (m && m.side !== THREE.DoubleSide) {
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    }
    clone.visible = true;
    clones.push(clone);
    onOriginal?.(node);
  });
  return clones;
}

// ── La Quimera: RIG REAL de Axie con vestido de monstruo ──
// (3 sep, decisión de Luis tras ver a la competencia: el arte profesional del
// mixer como protagonista. Nace incompleta —solo boca/ojos/orejas— y cada parte
// absorbida reconstruye el rig con la parte REAL en su socket correcto.)
const SLOT_TO_PART_TYPE: Record<ActiveSlot, string> = {
  mouth: 'mouth',
  horn: 'horn',
  tail: 'tail',
  back: 'back',
};
const CHIMERA_CORE_TYPES = new Set(['eye', 'ear', 'mouth']);
const CHIMERA_SCALE = 1.12; // un pelín más grande que sus presas

async function createChimeraRig(mixer: Mixer3D, baseGenes: string) {
  const group = new THREE.Group();

  // vestido de monstruo: aura que respira + luz propia + anillo de contacto
  const aura = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.15, 2),
    new THREE.MeshBasicMaterial({
      color: 0x9a5cff,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  aura.position.y = 0.95;
  group.add(aura);
  const glow = new THREE.PointLight(0xb98cff, 30, 11, 2);
  glow.position.y = 1.4;
  group.add(glow);
  const contact = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.0, 40),
    new THREE.MeshBasicMaterial({
      color: 0x9a5cff,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    }),
  );
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.04;
  group.add(contact);
  group.add(makeBlobShadow(2.3));

  const accent = new THREE.Color(0x9a5cff);
  const accentTarget = new THREE.Color(0x9a5cff);
  let apexOn = false; // modo APEX (4/4): el aura crece y el brillo se dispara
  let nightOn = false; // la Cicatriz: tu aura es la única luz — más lumen, más alcance

  type Desc = ReturnType<Mixer3D['decodeGenes']>['descriptor'];
  const strip = (d: Desc): Desc => ({
    ...d,
    parts: d.parts.filter((p) => CHIMERA_CORE_TYPES.has(p.type)),
  });
  let genes = baseGenes;
  let desc: Desc = strip(mixer.decodeGenes(genes).descriptor);
  let inst: AxieInst | null = null;
  let idleClip: string | undefined;
  let walkClip: string | undefined;
  let attackClips: Record<ActiveSlot, string | undefined> = {
    mouth: undefined,
    horn: undefined,
    tail: undefined,
    back: undefined,
  };
  let playing = '';
  let attackTtl = 0;
  let building = false;
  let dirty = false;

  async function rebuild(): Promise<void> {
    if (building) {
      dirty = true;
      return;
    }
    building = true;
    try {
      const next = await mixer.create({
        descriptor: desc,
        extensions: { quality: 'balanced', artMode: 'faithful', strict: false, animationSet: 'full' },
      });
      if (inst) {
        group.remove(inst.wrapper);
        inst.dispose();
      }
      inst = next;
      inst.wrapper.scale.setScalar(CHIMERA_SCALE);
      group.add(inst.wrapper);
      const names = inst.animations.clips.map((c) => c.name);
      const pick = (...cands: string[]) => {
        for (const c of cands) {
          const hit = names.find((n) => n.includes(c));
          if (hit) return hit;
        }
        return undefined;
      };
      idleClip = pick('Default.Idle') ?? names[0];
      walkClip = pick('Default.Walk', 'Default.Run') ?? idleClip;
      attackClips = {
        mouth: pick('Action.AttackHead', 'Action.AttackCombo'),
        horn: pick('Action.AttackCombo'),
        tail: pick('Action.RunAttack', 'Action.AttackCombo'),
        back: pick('Action.AttackRange', 'Action.AttackCombo'),
      };
      playing = '';
      attackTtl = 0;
    } catch (err) {
      console.warn('rebuild de la Quimera falló; se conserva el rig anterior', err);
    } finally {
      building = false;
      if (dirty) {
        dirty = false;
        void rebuild();
      }
    }
  }
  await rebuild();

  return {
    group,
    /** Adoptar TU Axie: el rig renace desde sus genes. */
    setBase(g: string): void {
      genes = g;
      desc = strip(mixer.decodeGenes(genes).descriptor);
      void rebuild();
    },
    /** Renacer incompleta: solo boca/ojos/orejas. */
    reset(): void {
      desc = strip(mixer.decodeGenes(genes).descriptor);
      void rebuild();
    },
    /** Injerto real: la parte de la presa entra a SU socket del rig. */
    graft(slot: ActiveSlot, preyGenes: string, level: number): void {
      if (!preyGenes) return;
      const type = SLOT_TO_PART_TYPE[slot];
      const donor = mixer.decodeGenes(preyGenes).descriptor.parts.find((p) => p.type === type);
      if (!donor) return;
      desc = {
        ...desc,
        parts: [...desc.parts.filter((p) => p.type !== type), { ...donor, level: Math.min(level, 2) }],
      };
      void rebuild();
    },
    /** Asimilar: tu parte sube de nivel (visual hasta L2 — GLB distinto). */
    assimilate(slot: ActiveSlot, level: number): void {
      const type = SLOT_TO_PART_TYPE[slot];
      const current = desc.parts.find((p) => p.type === type);
      const visual = Math.min(level, 2);
      if (!current || current.level === visual) return;
      desc = {
        ...desc,
        parts: desc.parts.map((p) => (p.type === type ? { ...p, level: visual } : p)),
      };
      void rebuild();
    },
    playAttack(slot: ActiveSlot): void {
      const name = attackClips[slot];
      if (!name || !inst) return;
      playing = name;
      inst.playAnimation(name, { loop: false });
      const clip = inst.animations.clips.find((c) => c.name === name);
      attackTtl = Math.min(clip?.duration ?? 0.5, 0.8);
    },
    setSynergy(color: number | null): void {
      accentTarget.set(color ?? 0x9a5cff);
    },
    setApex(on: boolean): void {
      apexOn = on;
    },
    setNight(on: boolean): void {
      nightOn = on;
      glow.distance = on ? 16 : 11;
    },
    update(dt: number, elapsed: number, moving: boolean, dodging: boolean): void {
      accent.lerp(accentTarget, Math.min(1, dt * 3));
      (aura.material as THREE.MeshBasicMaterial).color.copy(accent);
      (contact.material as THREE.MeshBasicMaterial).color.copy(accent);
      glow.color.copy(accent);
      const apexMul = apexOn ? 1.4 : 1;
      aura.scale.setScalar(apexMul * (1 + (apexOn ? 0.1 : 0.06) * Math.sin(elapsed * 2.2)));
      glow.intensity = (apexOn ? 1.7 : 1) * ((nightOn ? 52 : 30) + Math.sin(elapsed * 3.1) * 5);
      if (inst) {
        attackTtl = Math.max(0, attackTtl - dt);
        if (attackTtl === 0) {
          const target = moving ? walkClip : idleClip;
          if (target && target !== playing) {
            playing = target;
            inst.playAnimation(target, { loop: true });
          }
        }
        // esquiva: estirón vertical breve (los i-frames se ven)
        inst.wrapper.scale.set(
          CHIMERA_SCALE * (dodging ? 0.9 : 1),
          CHIMERA_SCALE * (dodging ? 1.15 : 1),
          CHIMERA_SCALE * (dodging ? 0.9 : 1),
        );
        inst.update(dt);
      }
    },
  };
}
type ChimeraRig = Awaited<ReturnType<typeof createChimeraRig>>;

// ── Línea de CARGA del Guardián: telegraph rojo en el suelo — quítate ──
const chargeLineGeo = new THREE.PlaneGeometry(0.8, 13);
chargeLineGeo.rotateX(-Math.PI / 2);
const chargeLine = new THREE.Mesh(
  chargeLineGeo,
  new THREE.MeshBasicMaterial({
    color: 0xff5a3c,
    transparent: true,
    opacity: 0.4,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
);
chargeLine.position.y = 0.08;
chargeLine.visible = false;
scene.add(chargeLine);
function syncChargeLine(state: SimState, elapsed: number): void {
  const boss = state.enemies.find((e) => e.chargeWarnTicks > 0);
  if (!boss || state.phase !== 'running') {
    chargeLine.visible = false;
    return;
  }
  chargeLine.visible = true;
  chargeLine.position.set(
    boss.x + boss.chargeDirX * 6.2,
    terrainY(boss.x, boss.y) + 0.35,
    boss.y + boss.chargeDirY * 6.2,
  );
  chargeLine.rotation.y = Math.atan2(boss.chargeDirX, boss.chargeDirY);
  (chargeLine.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.3 * Math.sin(elapsed * 16);
}

const ULT_NAMES: Record<AxieClass, string> = T.ult;

// ── Meteorito: aviso en el suelo + roca cayendo (estado del motor) ──
const METEOR_WARN_TICKS_UI = Math.round(METEOR_WARN_SECONDS * TICK_HZ);
const meteorWarnRing = new THREE.Mesh(
  new THREE.RingGeometry(METEOR_RADIUS - 0.18, METEOR_RADIUS, 48),
  new THREE.MeshBasicMaterial({ color: 0xff5a3c, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
);
meteorWarnRing.rotation.x = -Math.PI / 2;
meteorWarnRing.position.y = 0.06;
meteorWarnRing.visible = false;
scene.add(meteorWarnRing);
const meteorRock = new THREE.Mesh(
  new THREE.IcosahedronGeometry(0.55, 0),
  new THREE.MeshBasicMaterial({ color: 0xffb46b }),
);
meteorRock.visible = false;
scene.add(meteorRock);
// estela de fuego: cilindro aditivo apuntando contra la caída
const meteorDir = new THREE.Vector3(7, 32, 4).normalize();
const meteorTrail = new THREE.Mesh(
  new THREE.CylinderGeometry(0.08, 0.34, 5.5, 8, 1, true),
  new THREE.MeshBasicMaterial({
    color: 0xff8a3c,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }),
);
meteorTrail.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), meteorDir.clone().negate());
meteorTrail.visible = false;
scene.add(meteorTrail);

function syncMeteor(state: SimState, elapsed: number): void {
  const m = state.meteor;
  if (!m || state.phase !== 'running') {
    meteorWarnRing.visible = false;
    meteorRock.visible = false;
    meteorTrail.visible = false;
    return;
  }
  meteorWarnRing.visible = true;
  meteorWarnRing.position.set(m.x, terrainY(m.x, m.y) + 0.06, m.y);
  (meteorWarnRing.material as THREE.MeshBasicMaterial).opacity = 0.4 + 0.35 * Math.sin(elapsed * 12);
  const t = m.ticksLeft / METEOR_WARN_TICKS_UI; // 1 → lejos, 0 → impacto
  meteorRock.visible = true;
  meteorRock.position.set(m.x + t * 7, t * 32, m.y + t * 4);
  meteorRock.rotation.x += 0.2;
  meteorTrail.visible = true;
  meteorTrail.position.copy(meteorRock.position).addScaledVector(meteorDir, 2.9);
}

// ── Orbe de absorción: la esencia vuela de la presa a tu cuerpo ──
interface AbsorbFx {
  mesh: THREE.Mesh;
  sx: number;
  sz: number;
  t: number;
  dur: number;
  onArrive: () => void;
}
const absorbFxList: AbsorbFx[] = [];
const absorbGeo = new THREE.SphereGeometry(0.22, 12, 12);

function spawnAbsorbFx(x: number, z: number, color: number, onArrive: () => void): void {
  const mesh = new THREE.Mesh(
    absorbGeo,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.position.set(x, 0.8, z);
  scene.add(mesh);
  absorbFxList.push({ mesh, sx: x, sz: z, t: 0, dur: 0.45, onArrive });
}

function updateAbsorbFx(dt: number, targetX: number, targetZ: number): void {
  for (let i = absorbFxList.length - 1; i >= 0; i -= 1) {
    const fx = absorbFxList[i]!;
    fx.t += dt;
    const k = Math.min(1, fx.t / fx.dur);
    const ease = k * k * (3 - 2 * k);
    fx.mesh.position.set(
      fx.sx + (targetX - fx.sx) * ease,
      0.8 + Math.sin(k * Math.PI) * 1.7, // arco parabólico
      fx.sz + (targetZ - fx.sz) * ease,
    );
    fx.mesh.scale.setScalar(1 - k * 0.4);
    if (k >= 1) {
      scene.remove(fx.mesh);
      (fx.mesh.material as THREE.Material).dispose();
      absorbFxList.splice(i, 1);
      fx.onArrive();
    }
  }
}

function clearAbsorbFx(): void {
  for (const fx of absorbFxList) {
    scene.remove(fx.mesh);
    (fx.mesh.material as THREE.Material).dispose();
  }
  absorbFxList.length = 0;
}

// ── Marcador de objetivo (táctil): a quién le vas a pegar ──
const targetMarker = new THREE.Mesh(
  new THREE.ConeGeometry(0.26, 0.5, 12),
  new THREE.MeshBasicMaterial({ color: 0xfff2c0 }),
);
targetMarker.rotation.x = Math.PI; // punta hacia abajo
targetMarker.visible = false;
scene.add(targetMarker);
let markerX = 0;
let markerZ = 0;

// Retícula de cursor en el suelo (solo PC): dónde estás apuntando
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.28, 0.4, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
);
reticle.rotation.x = -Math.PI / 2;
reticle.position.y = 0.05;
reticle.visible = false;
scene.add(reticle);

function syncTargetMarker(state: SimState, dt: number, elapsed: number): void {
  if (!touchMode) {
    reticle.visible = state.phase === 'running';
    reticle.position.set(lastAim.x, terrainY(lastAim.x, lastAim.z) + 0.05, lastAim.z);
  }
  const target =
    state.phase !== 'running'
      ? null
      : touchMode
        ? autoTarget(state)
        : (state.enemies.find((e) => e.id === cursorTargetId && e.knockdownTicks === 0) ?? null);
  if (!target) {
    targetMarker.visible = false;
    return;
  }
  const t = 1 - Math.exp(-14 * dt);
  if (!targetMarker.visible) {
    markerX = target.x;
    markerZ = target.y;
  } else {
    markerX += (target.x - markerX) * t;
    markerZ += (target.y - markerZ) * t;
  }
  targetMarker.visible = true;
  targetMarker.position.set(markerX, terrainY(markerX, markerZ) + 2.5 + Math.sin(elapsed * 5) * 0.12, markerZ);
}

function updateFlashes(dt: number): void {
  for (let i = flashes.length - 1; i >= 0; i -= 1) {
    const f = flashes[i]!;
    f.ttl -= dt;
    (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (f.ttl / 0.15) * 0.5);
    if (f.ttl <= 0) {
      scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
      flashes.splice(i, 1);
    }
  }
}

// ── Arranque ──
async function start() {
  const mixer = await createAxieMixer3D({ renderer, assetBaseUrl: './assets/axie/' });
  const response = await fetch('./data/axies.json');
  const axies = (await response.json()) as AxieEntry[];
  let catalog = buildCatalog(axies);
  // catálogo vivo: las presas CICATRIZADAS (némesis) entran marcadas al motor
  const liveCatalog = () => catalog.map((a) => (isScarred(a.id) ? { ...a, nemesis: true } : a));
  const catalogIdByGenes = (genes: string) => catalog.find((a) => a.genes === genes)?.id;
  // total del Bestiario: partes activas distintas que existen en el catálogo
  function recomputeBestiaryCatalog(): void {
    const seen = new Map<string, { id: string; class: AxieClass; type: string }>();
    for (const a of catalog) {
      for (const p of a.parts) {
        if (p.type === 'eyes' || p.type === 'ears') continue;
        if (!seen.has(p.id)) seen.set(p.id, { id: p.id, class: p.class, type: p.type });
      }
    }
    catalogPartList = [...seen.values()];
    bestiaryTotal = catalogPartList.length;
  }
  recomputeBestiaryCatalog();
  const first = catalog[0] ?? null;
  if (!first) throw new Error('axies.json vacío o sin entradas válidas');
  let chimeraBaseGenes = first.genes;
  const preySystem = createPreySystem(mixer);

  // ── La Quimera: rig real de Axie, nace incompleta (solo boca/ojos/orejas) ──
  const blob = await createChimeraRig(mixer, chimeraBaseGenes);
  scene.add(blob.group);

  /** Al arrancar, la presa PIERDE la parte a la vista (sus mallas se ocultan). */
  function hidePreyPart(slot: ActiveSlot, enemyId: number, preyGenes: string): void {
    if (!preyGenes) return;
    const donor = mixer
      .decodeGenes(preyGenes)
      .descriptor.parts.find((p) => p.type === SLOT_TO_PART_TYPE[slot]);
    if (donor) preySystem.clonePartMeshes(enemyId, formatAxiePartAssetId(donor));
  }

  boot?.remove();
  // precalentar rigs del primer territorio mientras el jugador lee el título
  {
    const terr0 = TERRITORIES[territoryIndex(startWave)]!;
    const warmGenes = catalog
      .filter((a) => (terr0.classes as readonly string[]).includes(a.class))
      .slice(0, 5)
      .map((a) => a.genes);
    preySystem.warm(warmGenes);
  }

  // CACERÍA DEL DÍA: mapa Y rng salen de la fecha — el mismo mundo para todos.
  // REVANCHA: reintenta EXACTAMENTE la misma luna (misma semilla de mapa y rng).
  let currentSeed = 0;
  let currentRngSeed = 0;
  let revanchaSeed: { map: number; rng: number } | null = null;
  const newMapSeed = () => (currentSeed = dailyMode ? todaySeed() : (Math.random() * 0xffffffff) >>> 0);
  const newRng = () => {
    currentRngSeed = dailyMode ? todaySeed() : Date.now() >>> 0;
    return createRng(currentRngSeed);
  };
  let sim = createSim(startWave, liveCatalog(), newMapSeed(), startMutations);
  dressTerritory(territoryIndex(sim.wave.wave), sim.obstacles, sim.props);
  blob.setNight(territoryIndex(sim.wave.wave) === 2);
  buildCaves(sim.herds, [3, 6, 9]);
  buildPickups(sim.pickups);
  let prevSim = sim; // estado anterior: el render interpola entre ambos
  let rng: Rng = newRng();
  let visualYaw = 0; // giro del personaje amortiguado (el motor gira instantáneo)
  const camPos = { x: 0, z: 9 };

  function shortestAngle(a: number): number {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  function restart() {
    // revancha = misma luna; si no, otra luna, otra cacería
    const mapSeed = revanchaSeed ? revanchaSeed.map : newMapSeed();
    const rngSeed = revanchaSeed ? revanchaSeed.rng : (dailyMode ? todaySeed() : Date.now() >>> 0);
    currentSeed = mapSeed;
    currentRngSeed = rngSeed;
    revanchaSeed = null;
    sim = createSim(startWave, liveCatalog(), mapSeed, startMutations);
    lastTerr = territoryIndex(sim.wave.wave);
    dressTerritory(lastTerr, sim.obstacles, sim.props);
    blob.setNight(lastTerr === 2);
    buildCaves(sim.herds, [3, 6, 9]);
    buildPickups(sim.pickups);
    travelTtl = 0;
    travelFade.style.opacity = '0';
    if (startWave > 1) tutStep = -1; // en territorio avanzado no hay tutorial
    rng = createRng(rngSeed);
    preySystem.clear(); // el pool de axies del mixer se conserva entre runs
    clearAbsorbFx(); // orbes en vuelo mueren con el run
    blob.reset(); // renacer incompleta: solo boca/ojos/orejas
  }

  // Adoptar TU Axie: se vuelve la base de la Quimera (su boca es tu arma inicial)
  adoptAxieHook = (entry) => {
    catalog = [entry, ...catalog.filter((a) => a.id !== entry.id)];
    chimeraBaseGenes = entry.genes;
    personalAxieId = entry.id;
    hud.querySelector<HTMLDivElement>('#axietag')!.textContent = T.axieTag(entry.id);
    recomputeBestiaryCatalog();
    blob.setBase(entry.genes); // TU Axie es ahora el personaje en pantalla
    restart();
  };

  // ── COMPARTIR el run: texto listo para pegar en Discord/X ──
  const wireShare = (id: string): void => {
    const btn = hud.querySelector<HTMLButtonElement>(`#${id}`);
    if (!btn) return;
    btn.addEventListener('pointerdown', (e) => e.stopPropagation()); // no reinicia
    btn.addEventListener('click', () => {
      const win = sim.phase === 'victory';
      const axieTag = personalAxieId ? T.shareWith(personalAxieId) : '';
      const dailyTag = dailyMode ? T.shareDaily : '';
      const text =
        `QUIMERA 🌙 ${T.shareText(win, sim.wave.wave)}` +
        `${axieTag} · ${sim.score} pts${dailyTag} · ${T.statsBestiary(bestiary.size, bestiaryTotal)}\n${location.href}`;
      const done = () => {
        btn.textContent = T.shared;
        window.setTimeout(() => {
          btn.textContent = id === 'share-win' ? T.shareWin : T.shareDead;
        }, 1600);
      };
      if (navigator.share) void navigator.share({ text }).then(done).catch(() => {});
      else void navigator.clipboard.writeText(text).then(done).catch(() => {});
    });
  };
  wireShare('share-dead');
  wireShare('share-win');
  // REVANCHA: "puedo ganarle a ESTA luna" — el gancho del casi-lo-logro
  {
    const btn = hud.querySelector<HTMLButtonElement>('#revancha-btn');
    if (btn) {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
      btn.addEventListener('click', () => {
        revanchaSeed = { map: currentSeed, rng: currentRngSeed };
        pendingRestart = true;
      });
    }
  }
  // GESTAS: el toast de medalla nueva
  awardGestaFx = (name) => {
    partToast.textContent = T.gestaToast(name);
    partToast.style.opacity = '1';
    partToastTtl = 3;
    sfx.contract();
  };

  // ── Guardia de rendimiento: si un dispositivo no aguanta, degradar solo ──
  let perfFrames = 0;
  let perfTime = 0;
  let perfDegraded = false;

  // Contador de FPS para el check de rendimiento de T5: abrir con ?fps
  let fpsLabel: HTMLDivElement | null = null;
  let fpsFrames = 0;
  let fpsWindow = 0;
  if (location.search.includes('fps')) {
    fpsLabel = document.createElement('div');
    fpsLabel.style.cssText =
      'position:fixed;right:12px;top:184px;font:12px ui-monospace,monospace;color:#dfe4ff;opacity:.8';
    document.body.appendChild(fpsLabel);
  }

  let last = performance.now();
  let accumulator = 0;
  let lastSynergyOn = false;
  let lastApexOn = false;
  let hitStopTtl = 0; // congelamiento breve al conectar: el golpe pesa
  let bossBannerTtl = 0; // letterbox de "entró el Guardián"
  let manualRotTimer = 0; // giro manual reciente: la cámara no auto-sigue
  // el fierro EN LA BOCA: tres variantes montadas en la Quimera, una visible
  const heldWeapons = [0, 1, 2].map((v) => {
    const w = makeScrapWeapon(v);
    w.visible = false;
    w.position.set(0.12, 0.82, 0.58); // cargado en la boca, cruzado
    w.rotation.set(0.2, 0.35, 1.35);
    blob.group.add(w);
    return w;
  });
  let heldVariant = 0;
  let weaponSwingTtl = 0;
  let lastArmed = false;
  let printAcc = 0; // distancia acumulada para la siguiente huella
  let printSide = 1;
  let streakCount = 0; // derribos encadenados (ventana de 4 s)
  let streakTimer = 0;
  let heartbeatIn = 0; // latido con vida baja
  let victoryCineTtl = 0; // órbita de victoria antes del panel
  let distantRoarIn = 25 + Math.random() * 30; // el Primordial se oye antes de verse
  let elapsed = 0;
  let shakeTtl = 0;
  let slowMoTtl = 0;
  let blobX = 0;
  let blobY = 0;
  let lastPhase: SimState['phase'] = 'running';
  let lastTerr = territoryIndex(sim.wave.wave); // ya vestido arriba
  let travelTtl = 0; // fundido de viaje entre territorios
  let travelApplied = false;
  // tutorial: solo la primera vez, y solo si empiezas desde los Prados
  let tutStep = localStorage.getItem('quimera.tutorial') === 'done' || startWave > 1 ? -1 : 0;
  let tutMoveAcc = 0;
  let tutDoneTtl = 0;

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const rawDt = Math.min((now - last) / 1000, 0.1);
    let dt = rawDt;
    last = now;
    // guardia de perf: 3 s consecutivos bajo 42 fps → sombras fuera + menos pixeles
    if (!perfDegraded && elapsed > 10 && !titleVisible) {
      perfFrames += 1;
      perfTime += rawDt;
      if (perfTime >= 3) {
        if (perfFrames / perfTime < 42) {
          perfDegraded = true;
          dirLight.castShadow = false;
          renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
          renderer.setSize(window.innerWidth, window.innerHeight);
          console.info('[quimera] perf: sombras y pixelRatio degradados para sostener fps');
        }
        perfFrames = 0;
        perfTime = 0;
      }
    }
    if (hitStopTtl > 0) {
      hitStopTtl -= dt;
      dt *= 0.05; // hit-stop: 2-5 frames de mundo congelado
    } else if (slowMoTtl > 0) {
      slowMoTtl -= dt;
      dt *= 0.45; // cámara lenta de la esquiva perfecta
    }

    if (pendingRestart) {
      pendingRestart = false;
      restart();
    }

    accumulator += dt;
    if (titleVisible || bestiaryVisible) accumulator = 0; // el mundo espera
    while (accumulator >= TICK_SECONDS) {
      accumulator -= TICK_SECONDS;
      prevSim = sim;
      sim = step(sim, sampleInput(sim), rng);
      let attackedWithLifesteal = false;
      let landedHit = false;
      for (const event of sim.events) {
        if (event.type === 'attack') {
          const part = sim.player.loadout[event.slot];
          if (part) {
            // el CUERPO da el latigazo YA hacia donde golpea — sin esto, el
            // arco salía "por la espalda" mientras el modelo giraba suave
            visualYaw = Math.atan2(sim.player.faceX, sim.player.faceY);
            if (sim.player.weaponTicks > 0) weaponSwingTtl = 0.16; // ¡MADRAZO!
            spawnAttackFlash(sim, event.range, event.arcDegrees, CLASS_COLOR[part.class]);
            blob.playAttack(event.slot);
            if (CLASS_DELTA[part.class].lifesteal > 0) attackedWithLifesteal = true;
          }
        }
        if (event.type === 'hit') {
          preySystem.flash(event.enemyId);
          landedHit = true;
          const e = sim.enemies.find((x) => x.id === event.enemyId) ??
            prevSim.enemies.find((x) => x.id === event.enemyId);
          // hit-stop: el mundo se congela un suspiro — el golpe PESA
          hitStopTtl = Math.max(hitStopTtl, event.crit ? 0.075 : 0.04);
          if (e) {
            spawnBurst(
              e.x, e.y,
              event.crit ? 0xfff2c0 : CLASS_COLOR[e.archetype],
              event.crit ? 14 : 7,
              event.crit ? 4 : 2.8,
            );
          }
          if (event.crit) {
            if (e) floatText(e.x, e.y, T.crit, '#ffb84d', 15);
            sfx.crit();
          } else {
            sfx.hit();
          }
        }
        if (event.type === 'perfectDodge') {
          floatText(sim.player.x, sim.player.y, T.perfect, '#b8ffb0', 17);
          sfx.perfect();
          slowMoTtl = 0.5; // el tiempo se dobla ante tu elegancia
          spawnBurst(sim.player.x, sim.player.y, 0xb8ffb0, 12, 3);
        }
        if (event.type === 'wake') {
          const e = sim.enemies.find((x) => x.id === event.enemyId);
          if (e) floatText(e.x, e.y, '!', '#ff5a5a', 20);
        }
        if (event.type === 'bossChargeWarn' || event.type === 'bossRoarWarn') sfx.growl();
        if (event.type === 'bossRoar') {
          sfx.roar();
          shakeTtl = 0.3;
          const e = sim.enemies.find((x) => x.id === event.enemyId);
          if (e) {
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.5, 9, 40),
              new THREE.MeshBasicMaterial({
                color: 0xff5a3c,
                transparent: true,
                opacity: 0.5,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(e.x, terrainY(e.x, e.y) + 0.07, e.y);
            scene.add(ring);
            flashes.push({ mesh: ring, ttl: 0.15 });
          }
        }
        if (event.type === 'bossCrash') {
          const e = sim.enemies.find((x) => x.id === event.enemyId);
          if (e) floatText(e.x, e.y, T.crashed, '#ffd27f', 15);
          sfx.stun();
          shakeTtl = 0.25;
        }
        if (event.type === 'ultimate') {
          sfx.ultimate();
          shakeTtl = 0.4;
          hitStopTtl = Math.max(hitStopTtl, 0.12);
          spawnBurst(event.x, event.y, CLASS_COLOR[event.cls], 26, 5, 4.5);
          announceWave(ULT_NAMES[event.cls]);
          const ring = new THREE.Mesh(
            new THREE.RingGeometry(0.6, 6.5, 48),
            new THREE.MeshBasicMaterial({
              color: CLASS_COLOR[event.cls],
              transparent: true,
              opacity: 0.6,
              side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending,
              depthWrite: false,
            }),
          );
          ring.rotation.x = -Math.PI / 2;
          ring.position.set(event.x, terrainY(event.x, event.y) + 0.09, event.y);
          scene.add(ring);
          flashes.push({ mesh: ring, ttl: 0.15 });
        }
        if (event.type === 'contractNew') {
          partToast.textContent = T.contractPrefix + (sim.contract ? contractText(sim.contract) : event.text);
          partToast.style.opacity = '1';
          partToastTtl = 3;
        }
        if (event.type === 'contractDone') {
          announceWave(T.contractDone);
          sfx.contract();
        }
        if (event.type === 'contractFail') {
          partToast.textContent = T.contractFail;
          partToast.style.opacity = '1';
          partToastTtl = 1.6;
        }
        if (event.type === 'telegraph') sfx.telegraph();
        if (event.type === 'waveStart') {
          announceWave(event.wave >= FINAL_WAVE ? T.primordialCome : T.wave(event.wave, FINAL_WAVE));
          sfx.wave();
          // manada lejana: apunta al faro (la brújula del viaje)
          const anchor = sim.herds[event.wave - 1];
          if (anchor && Math.hypot(anchor.x - sim.player.x, anchor.y - sim.player.y) > 26) {
            partToast.textContent = T.followBeacon;
            partToast.style.opacity = '1';
            partToastTtl = 3.5;
          }
        }
        if (event.type === 'pickup') {
          const label = T.pickupNames[event.kind];
          floatText(event.x, event.y, label, hexColor(PICKUP_COLOR[event.kind] ?? 0xffffff), 15);
          spawnBurst(event.x, event.y, PICKUP_COLOR[event.kind] ?? 0xffffff, 16, 3);
          if (event.kind === 'relic') sfx.golden();
          else if (event.kind === 'heal') {
            hpFlashTtl = 0.45;
            sfx.devour();
          } else if (event.kind === 'fang') {
            // ¿cuál fierro era? (la variante visual vive en el índice del pickup)
            const idx = sim.pickups.findIndex((pp) => pp.x === event.x && pp.y === event.y);
            heldVariant = (idx >= 0 ? idx : 0) % 3;
            announceWave(T.weaponGrab(T.weaponNames[heldVariant]!));
            sfx.crit();
            hitStopTtl = Math.max(hitStopTtl, 0.08);
          } else sfx.synergy();
        }
        if (event.type === 'roverMount') {
          awardGesta('jinete');
          partToast.textContent = T.roverOn;
          partToast.style.opacity = '1';
          partToastTtl = 2.5;
          sfx.contract();
        }
        if (event.type === 'roverDismount') {
          partToast.textContent = T.roverOff;
          partToast.style.opacity = '1';
          partToastTtl = 1.6;
        }
        if (event.type === 'molt') {
          if (event.golden) {
            announceWave(T.goldenMolt); // recompensa variable: el jackpot de la muda
            sfx.golden();
            shakeTtl = Math.max(shakeTtl, 0.2);
          } else {
            announceWave(T.mut[event.mutation].name);
            sfx.synergy();
          }
        }
        if (event.type === 'secondWind') {
          announceWave(T.secondWind);
          sfx.apex();
          slowMoTtl = 0.6;
          shakeTtl = 0.35;
          hpFlashTtl = 0.6;
          spawnBurst(sim.player.x, sim.player.y, 0xff5a3c, 30, 5);
        }
        if (event.type === 'fastClear') {
          floatText(sim.player.x, sim.player.y, T.fastClear, '#ffd24a', 15);
          sfx.contract();
        }
        if (event.type === 'knockdown') {
          sfx.knockdown();
          hitStopTtl = Math.max(hitStopTtl, 0.1);
          const e = sim.enemies.find((x) => x.id === event.enemyId);
          if (e) spawnBurst(e.x, e.y, 0xe0b055, 16, 3.6);
          if (e?.bounty) floatText(e.x, e.y, T.bountyDown, '#ffd24a', 15);
          if (e?.golden) awardGesta('dorada');
          if (e?.isAlfa) awardGesta('guardian');
          // RACHA: derribos encadenados en ventana de 4 s — premia el momentum
          streakCount = streakTimer > 0 ? streakCount + 1 : 1;
          streakTimer = 4;
          if (streakCount >= 2 && e) {
            floatText(e.x, e.y, T.streak(streakCount), '#ffd24a', Math.min(14 + streakCount * 2, 24));
            if (streakCount >= 4) sfx.golden();
          }
          if (e?.primordial) {
            // EL momento del run: el tirano cae — cámara lenta larga y fanfarria
            slowMoTtl = 1.3;
            shakeTtl = 0.5;
            announceWave(T.primordialFall);
            spawnBurst(e.x, e.y, 0xfff2c0, 40, 6, 5);
            sfx.stinger();
          }
        }
        if (event.type === 'playerHurt') {
          hurtTtl = 0.35;
          sfx.playerHurt();
        }
        if (event.type === 'devour') {
          hpFlashTtl = 0.45;
          heldDevour = false; // el toque pegajoso se consume al completarse
          const prey = prevSim.enemies.find((e) => e.id === event.enemyId);
          if (prey) {
            spawnAbsorbFx(prey.x, prey.y, 0x7fe07f, () => {});
            spawnBurst(prey.x, prey.y, 0x7fe07f, 18, 3.2);
          }
          sfx.devour();
        }
        if (event.type === 'rip') {
          // la esencia vuela de la presa a tu cuerpo; la parte se monta al llegar
          const prey = prevSim.enemies.find((e) => e.id === event.enemyId);
          const part = sim.player.loadout[event.slot];
          const color = part ? CLASS_COLOR[part.class] : 0xffffff;
          const fromX = prey?.x ?? sim.player.x;
          const fromZ = prey?.y ?? sim.player.y;
          // celebración del injerto: ES la toma del juego — que se sienta ganada
          const celebrate = () => {
            const label = `+${SLOT_LABEL[event.slot]}${part ? ` ${part.class.toUpperCase()}` : ''}${
              event.level > 1 ? ` ★L${event.level}` : ''
            }`;
            floatText(sim.player.x, sim.player.y, label, hexColor(color), 16);
            spawnBurst(blobX, blobY, color, 22, 3.6);
            slowMoTtl = Math.max(slowMoTtl, 0.28);
            const ring = new THREE.Mesh(
              new THREE.RingGeometry(0.4, 2.4, 40),
              new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
              }),
            );
            ring.rotation.x = -Math.PI / 2;
            ring.position.set(blobX, terrainY(blobX, blobY) + 0.08, blobY);
            scene.add(ring);
            flashes.push({ mesh: ring, ttl: 0.15 });
          };
          if (event.outcome === 'assimilate') {
            spawnAbsorbFx(fromX, fromZ, color, () => {
              blob.assimilate(event.slot, event.level);
              celebrate();
            });
          } else {
            const livePrey = sim.enemies.find((e) => e.id === event.enemyId);
            const preyGenes = livePrey?.genes ?? prey?.genes ?? '';
            hidePreyPart(event.slot, event.enemyId, preyGenes);
            spawnAbsorbFx(fromX, fromZ, color, () => {
              blob.graft(event.slot, preyGenes, event.level);
              celebrate();
            });
          }
          heldRipSlot = null; // el toque pegajoso se consume al completarse
          awardGesta('primer_injerto');
          if (bestiary.size >= 20) awardGesta('coleccionista');
          if (registerPart(event.partId)) {
            partToast.textContent = T.bestiaryToast(event.partId, bestiary.size, bestiaryTotal);
            partToast.style.opacity = '1';
            partToastTtl = 2.4;
          }
          sfx.rip();
        }
        // tutorial: cada paso avanza con la acción real, no con un botón de "ok"
        if (tutStep === 1 && event.type === 'hit') tutStep = 2;
        if (tutStep === 2 && event.type === 'knockdown') tutStep = 3;
        if (tutStep === 3 && (event.type === 'rip' || event.type === 'devour')) {
          tutStep = 4;
          tutDoneTtl = 3.2;
          localStorage.setItem('quimera.tutorial', 'done');
        }
        if (event.type === 'death') sfx.death();
        if (event.type === 'victory') sfx.victory();
        if (event.type === 'spawn') {
          if (event.isAlfa) {
            sfx.stinger(); // entró el jefe: golpe de orquesta
            // intro de cine: letterbox + nombre del Guardián de este territorio
            bossBannerTtl = 2.2;
            bossNameEl.textContent =
              sim.wave.wave >= FINAL_WAVE
                ? T.primordialCome
                : T.guardian(T.terr[territoryIndex(sim.wave.wave)] ?? '');
          }
          if (event.golden) {
            announceWave(T.golden);
            sfx.golden();
            const g = sim.enemies.find((x) => x.id === event.enemyId);
            if (g) radarPings.push({ x: g.x, y: g.y, born: performance.now() });
          } else if (event.nemesis) {
            const e = sim.enemies.find((x) => x.id === event.enemyId);
            const id = e ? catalogIdByGenes(e.genes) : undefined;
            partToast.textContent = T.scarredToast(id ?? '');
            partToast.style.opacity = '1';
            partToastTtl = 3;
            if (e) floatText(e.x, e.y, '☠', '#d23030', 18);
            sfx.growl();
          }
          if (event.bounty) {
            partToast.textContent = T.bountyToast;
            partToast.style.opacity = '1';
            partToastTtl = 2.6;
          }
        }
        if (event.type === 'expired') {
          // se disolvió sin cosecha: ESA presa se te escapó — y te recordará
          const prey = prevSim.enemies.find((e) => e.id === event.enemyId);
          if (prey) spawnBurst(prey.x, prey.y, 0x9aa4c8, 12, 1.2, 1.6); // se deshace en polvo
          const id = prey && prey.genes ? catalogIdByGenes(prey.genes) : undefined;
          if (id && !prey!.isAlfa) {
            nemesisEscapes[id] = (nemesisEscapes[id] ?? 0) + 1;
            saveEscapes();
            if (nemesisEscapes[id] === NEMESIS_ESCAPES_TO_SCAR) {
              partToast.textContent = T.scarWarn(id);
              partToast.style.opacity = '1';
              partToastTtl = 3;
              sfx.growl();
            }
          }
        }
        if (event.type === 'devour' || event.type === 'rip') {
          // cosechar a una CICATRIZADA = venganza cumplida: la marca se borra
          const prey = prevSim.enemies.find((e) => e.id === event.enemyId);
          if (prey?.nemesis) {
            const id = catalogIdByGenes(prey.genes);
            if (id && nemesisEscapes[id]) {
              delete nemesisEscapes[id];
              saveEscapes();
              announceWave(T.revenge);
              awardGesta('venganza');
            }
          }
        }
        if (event.type === 'meteorWarn') sfx.meteorWarn();
        if (event.type === 'meteorHit') {
          sfx.meteorHit();
          shakeTtl = 0.3;
          spawnBurst(event.x, event.y, 0xffb46b, 24, 5.5, 5);
          // onda expansiva
          const boom = new THREE.Mesh(
            new THREE.RingGeometry(0.3, METEOR_RADIUS, 32),
            new THREE.MeshBasicMaterial({ color: 0xffb46b, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
          );
          boom.rotation.x = -Math.PI / 2;
          boom.position.set(event.x, terrainY(event.x, event.y) + 0.07, event.y);
          scene.add(boom);
          flashes.push({ mesh: boom, ttl: 0.15 });
        }
      }
      // robo de vida (plant): la barra de vida respira verde al conectar
      if (attackedWithLifesteal && landedHit) hpFlashTtl = 0.3;
      // sinergia recién activada: suena una vez y tiñe el núcleo
      const dom = dominantGroup(sim.player.loadout);
      const synergyOn = dom.count >= SYNERGY_THRESHOLD;
      if (synergyOn && !lastSynergyOn) sfx.synergy();
      lastSynergyOn = synergyOn;
      blob.setSynergy(synergyOn ? CLASS_COLOR[dom.group] : null);
      // APEX (4/4): jackpot — anuncio, acorde y aura desatada; tu grupo te teme
      const apexNow = dom.count >= 4;
      if (apexNow && !lastApexOn) {
        awardGesta('apex');
        announceWave(T.apexOn);
        sfx.apex();
        shakeTtl = Math.max(shakeTtl, 0.25);
      }
      lastApexOn = apexNow;
      blob.setApex(apexNow);
      // música adaptativa: intensidad = progreso; peligro = Alfa activo o manada furiosa
      setMusicState(
        sim.wave.wave / FINAL_WAVE,
        sim.enemies.some((e) => e.knockdownTicks === 0 && (e.isAlfa || e.angryTicks > 0)),
        territoryIndex(sim.wave.wave), // cada territorio trae su sección de orquesta
      );
    }

    // Interpolación: el motor va a 60 Hz fijo, el render a lo que dé la pantalla
    const alpha = Math.min(1, accumulator / TICK_SECONDS);
    const lerp = (a: number, b: number) => a + (b - a) * alpha;
    const px = lerp(prevSim.player.x, sim.player.x);
    const py = lerp(prevSim.player.y, sim.player.y);
    const fx = lerp(prevSim.player.faceX, sim.player.faceX);
    const fy = lerp(prevSim.player.faceY, sim.player.faceY);

    // Quimera — deslizamiento visual: el zarpazo del motor es instantáneo, el
    // cuerpo lo alcanza en ~80 ms (se ve felino, no teletransporte)
    elapsed += dt;
    const glide = 1 - Math.exp(-24 * dt);
    blobX += (px - blobX) * glide;
    blobY += (py - blobY) * glide;
    blob.group.position.set(blobX, terrainY(blobX, blobY), blobY);
    const targetYaw = Math.atan2(fx, fy);
    visualYaw += shortestAngle(targetYaw - visualYaw) * Math.min(1, dt * 14);
    blob.group.rotation.y = visualYaw;
    const moving =
      travelTtl > 0 || // durante el viaje, la Quimera camina (se ve el trayecto)
      joyPointerId !== null ||
      keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') || sim.player.dodgeTicks > 0;
    blob.update(dt, elapsed, moving, sim.player.dodgeTicks > 0);
    updateAbsorbFx(dt, blobX, blobY);
    // trail de esquiva: estela de chispas del color del acento
    if (sim.player.dodgeTicks > 0) spawnBurst(blobX, blobY, 0xb98cff, 2, 0.6, 0.8, 0.5);
    updateParticles(dt);
    // huellas en el polvo (rover: rodadas anchas a ambos lados)
    {
      const stepDx = sim.player.x - prevSim.player.x;
      const stepDy = sim.player.y - prevSim.player.y;
      printAcc += Math.hypot(stepDx, stepDy) * Math.min(1, dt * TICK_HZ);
      if (printAcc > (sim.player.riding ? 0.9 : 0.55)) {
        printAcc = 0;
        if (sim.player.riding) {
          stampPrint(blobX, blobY, visualYaw, 1, true);
          stampPrint(blobX, blobY, visualYaw, -1, true);
        } else {
          printSide = -printSide;
          stampPrint(blobX, blobY, visualYaw, printSide, false);
        }
      }
    }
    updatePrints(dt);
    // balizas de emergencia: parpadean desde hace años
    for (const bm of blinkMats) bm.opacity = 0.25 + 0.75 * Math.abs(Math.sin(elapsed * 3.2));
    // ojos de las guaridas: laten mientras SU Guardián siga con vida
    caveEyeMats.forEach((em, i) => {
      const alive = sim.wave.wave <= (caveEyeWave[i] ?? 0);
      em.opacity = alive ? 0.55 + 0.45 * Math.abs(Math.sin(elapsed * 1.7 + i)) : 0;
    });
    // polvo levantado al correr (gris, bajo, sutil — es regolito, no humo)
    if (moving && !titleVisible && sim.player.dodgeTicks === 0 && Math.random() < dt * 5) {
      spawnBurst(blobX, blobY, 0x8a8aa0, 1, 0.5, 0.9, 0.15);
    }
    // APEX: el mundo SATURA — la exposición sube mientras dura el jackpot
    renderer.toneMappingExposure +=
      ((lastApexOn ? 1.34 : 1.15) - renderer.toneMappingExposure) * Math.min(1, dt * 3);

    // Territorio: al cruzar, la Quimera VIAJA — fundido a negro, el mundo se
    // reviste entero (suelo, rocas, decoración, luz) y amanece el nuevo bioma
    const terrIdxNow = territoryIndex(sim.wave.wave);
    if (terrIdxNow !== lastTerr) {
      lastTerr = terrIdxNow;
      const maxTerr = Number(localStorage.getItem('quimera.maxterr') ?? '0');
      if (terrIdxNow > maxTerr) localStorage.setItem('quimera.maxterr', String(terrIdxNow));
      travelTtl = TRAVEL_SECONDS;
      travelApplied = false;
      travelText.textContent = T.travel;
      sfx.growl();
    }
    if (travelTtl > 0) {
      travelTtl -= dt;
      accumulator = 0; // el mundo espera: nadie te muerde en el camino
      const t = TRAVEL_SECONDS - travelTtl;
      const op = t < 0.8 ? t / 0.8 : t < 1.7 ? 1 : Math.max(0, 1 - (t - 1.7) / 1.1);
      travelFade.style.opacity = String(op);
      if (!travelApplied && t >= 0.9) {
        travelApplied = true; // con la pantalla en negro: se cambia TODO
        dressTerritory(terrIdxNow, sim.obstacles, sim.props);
        blob.setNight(terrIdxNow === 2);
        travelText.textContent = T.terr[terrIdxNow] ?? '';
      }
      if (travelTtl <= 0) {
        travelFade.style.opacity = '0';
        announceWave(T.terr[terrIdxNow] ?? '');
        sfx.wave();
      }
    }

    // El PRIMORDIAL existe antes de aparecer: rugido lejano cada tanto,
    // más fuerte conforme te acercas a la Cicatriz (en la final calla: YA ESTÁ AQUÍ)
    if (sim.phase === 'running' && !titleVisible && sim.wave.wave < FINAL_WAVE) {
      distantRoarIn -= dt;
      if (distantRoarIn <= 0) {
        distantRoarIn = 55 + Math.random() * 50;
        const intensity = (terrIdxNow + 1) / TERRITORIES.length;
        sfx.distantRoar(intensity);
        if (terrIdxNow >= TERRITORIES.length - 1) shakeTtl = Math.max(shakeTtl, 0.12);
      }
    }

    // Luna abierta: faro de la manada, gemas y rover
    {
      const anchor = sim.herds[sim.wave.wave - 1];
      const hunting = sim.wave.pending > 0 || sim.wave.alive > 0;
      beacon.visible = Boolean(anchor) && hunting && sim.phase === 'running';
      if (anchor) beacon.position.set(anchor.x, terrainY(anchor.x, anchor.y), anchor.y);
      beaconMat.opacity = 0.16 + 0.1 * Math.sin(elapsed * 2.4);
      beacon.rotation.y = elapsed * 0.5;
      // el Guardián caído SUELTA reliquia: si aparecieron pickups nuevos, re-armar
      if (sim.pickups.length !== pickupMeshes.length) buildPickups(sim.pickups);
      sim.pickups.forEach((p, i) => {
        const m = pickupMeshes[i];
        if (!m) return;
        m.visible = !p.taken;
        if (!p.taken && !m.userData.weapon) {
          m.children[0]!.rotation.y = elapsed * 1.6;
          m.children[0]!.position.y = 0.9 + 0.15 * Math.sin(elapsed * 2.2 + i);
        }
      });
      // el fierro cargado: visible mientras dura, SE BLANDE al atacar, se rompe
      const armed = sim.player.weaponTicks > 0;
      heldWeapons.forEach((w, v) => {
        w.visible = armed && v === heldVariant;
      });
      if (armed) {
        weaponSwingTtl = Math.max(0, weaponSwingTtl - dt);
        const sw = weaponSwingTtl > 0 ? Math.sin((1 - weaponSwingTtl / 0.16) * Math.PI) : 0;
        heldWeapons[heldVariant]!.rotation.z = 1.35 - sw * 1.9;
      }
      if (!armed && lastArmed) {
        partToast.textContent = T.weaponBroke;
        partToast.style.opacity = '1';
        partToastTtl = 2.2;
        spawnBurst(blobX, blobY, 0x9aa0b4, 14, 2.5);
        sfx.stun();
      }
      lastArmed = armed;
      const groundHere = terrainY(blobX, blobY);
      if (sim.player.riding) {
        roverGroup.position.set(blobX, groundHere, blobY);
        roverGroup.rotation.y = visualYaw;
        for (const w of roverGroup.children) {
          if (w.name === 'wheel') w.rotation.y += dt * 9; // ruedas girando
        }
        blob.group.position.y = groundHere + 0.62; // la Quimera va montada
      } else {
        roverGroup.position.set(sim.rover.x, terrainY(sim.rover.x, sim.rover.y), sim.rover.y);
        blob.group.position.y = groundHere;
      }
    }
    // Presas y efectos
    preySystem.sync(sim, prevSim, alpha, dt);
    syncTargetMarker(sim, dt, elapsed);
    syncChargeLine(sim, elapsed);
    updateFloatingTexts(dt);
    syncMeteor(sim, elapsed);
    updateShootingStars(dt);
    updateDust(elapsed);
    crystalMat.emissiveIntensity = 0.55 + 0.45 * Math.sin(elapsed * 1.8);
    earth.rotation.y += dt * 0.008;
    updateFlashes(dt);
    // intro de jefe: barras de cine que entran y salen
    if (bossBannerTtl > 0) {
      bossBannerTtl -= dt;
      const on = bossBannerTtl > 0.35;
      bossBarTop.style.height = on ? '54px' : '0';
      bossBarBot.style.height = on ? '54px' : '0';
      bossNameEl.style.opacity = on ? '1' : '0';
    }
    streakTimer = Math.max(0, streakTimer - dt);
    // vida baja: el corazón se oye y la pantalla respira rojo
    hurtTtl = Math.max(0, hurtTtl - dt);
    const lowHp = sim.phase === 'running' && sim.player.hp < PLAYER_MAX_HP * 0.3;
    if (lowHp && !titleVisible) {
      heartbeatIn -= dt;
      if (heartbeatIn <= 0) {
        heartbeatIn = 1.1;
        sfx.heartbeat();
      }
    }
    const lowPulse = lowHp ? 0.22 + 0.14 * Math.sin(elapsed * 5.5) : 0;
    hurtVignette.style.opacity = String(Math.max(hurtTtl / 0.35, lowPulse));
    if (waveFlashTtl > 0) {
      waveFlashTtl -= dt;
      if (waveFlashTtl <= 0) waveFlash.style.opacity = '0';
    }

    // Cámara: sigue al jugador con amortiguación + zoom con inclinación + órbita
    if (keys.has('arrowleft')) camYawTarget -= dt * 1.6;
    if (keys.has('arrowright')) camYawTarget += dt * 1.6;
    camYawTarget += rotateHold * dt * 1.6;
    // AUTO-SEGUIMIENTO (pedido de Luis): la cámara gira hacia tu rumbo — pero
    // si TÚ giraste hace poco, manda tu mano (2.5 s de gracia)
    const manualRot =
      keys.has('arrowleft') || keys.has('arrowright') || rotateHold !== 0 ||
      mouseRotating || rotPointerId !== null;
    if (manualRot) manualRotTimer = 2.5;
    else manualRotTimer = Math.max(0, manualRotTimer - dt);
    {
      const mdx = sim.player.x - prevSim.player.x;
      const mdy = sim.player.y - prevSim.player.y;
      if (
        manualRotTimer <= 0 &&
        sim.player.dodgeTicks === 0 &&
        Math.hypot(mdx, mdy) > 0.02 &&
        sim.phase === 'running'
      ) {
        const heading = Math.atan2(-mdx, -mdy);
        camYawTarget += shortestAngle(heading - camYawTarget) * Math.min(1, dt * 1.3);
      }
    }
    camYaw += shortestAngle(camYawTarget - camYaw) * Math.min(1, dt * 10);
    zoom += (zoomTarget - zoom) * Math.min(1, dt * 8);
    const zt = (zoom - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN); // 0 cerca → 1 lejos
    const camH = 11 * zoom * (1 - 0.28 * zt); // al alejarse baja el ángulo…
    const camBack = 9 * zoom * (1 + 0.55 * zt); // …y se echa hacia atrás: horizonte
    const lookY = 0.8 + 3.4 * zt;
    const camT = 1 - Math.exp(-8 * dt);
    camPos.x += (px - camPos.x) * camT;
    camPos.z += (py - camPos.z) * camT;
    // el cielo infinito viaja contigo: la Tierra jamás se alcanza caminando
    skyGroup.position.set(camPos.x, 0, camPos.z);
    shakeTtl = Math.max(0, shakeTtl - dt);
    const sx = (Math.random() - 0.5) * shakeTtl * 1.2;
    const sz = (Math.random() - 0.5) * shakeTtl * 1.2;
    // la cámara respira con el relieve: sube y baja suave con el terreno local
    const camGround = terrainY(camPos.x, camPos.z);
    camera.position.set(
      camPos.x + Math.sin(camYaw) * camBack + sx,
      camH + camGround * 0.8,
      camPos.z + Math.cos(camYaw) * camBack + sz,
    );
    camera.lookAt(camPos.x + sx, lookY + camGround * 0.8, camPos.z + sz);

    // Panel de cosecha (necesita la cámara ya actualizada para proyectar)
    syncHarvestPanel(sim);
    syncBuildHud(sim);
    syncMoltOverlay(sim);

    // HUD
    syncRadar(sim);
    hpBar.style.width = `${(100 * sim.player.hp) / PLAYER_MAX_HP}%`;
    hpFlashTtl = Math.max(0, hpFlashTtl - dt);
    hpBar.style.background =
      hpFlashTtl > 0 ? '#b8ffb0' : sim.player.hp < PLAYER_MAX_HP * 0.3 ? '#e05a5a' : '#7fe07f';
    hpBar.style.boxShadow = hpFlashTtl > 0 ? '0 0 10px #b8ffb0' : 'none';
    waveLabel.textContent =
      (sim.wave.wave >= FINAL_WAVE ? T.waveFinal : T.wave(sim.wave.wave, FINAL_WAVE)) +
      (sim.player.weaponTicks > 0 ? ' · ⚔' : ''); // el colmillo sigue mordiendo
    const contractEl = hud.querySelector<HTMLDivElement>('#contract')!;
    if (sim.contract && !sim.contract.failed) {
      const progress =
        sim.contract.target > 1 ? ` (${sim.contract.progress}/${sim.contract.target})` : '';
      contractEl.textContent = sim.contract.done
        ? `✓ ${contractText(sim.contract)}`
        : `◈ ${contractText(sim.contract)}${progress}`;
      contractEl.style.color = sim.contract.done ? '#b8ffb0' : '#ffd27f';
    } else {
      contractEl.textContent = sim.contract ? `✗ ${contractText(sim.contract)}` : '';
      contractEl.style.color = '#5a5a72';
    }
    scoreLabel.textContent =
      cachedBest > 0 ? `${T.points} ${sim.score} · ${T.record(cachedBest)}` : `${T.points} ${sim.score}`;
    scoreLabel.style.color = sim.score > cachedBest && cachedBest > 0 ? '#fff2c0' : '';
    if (partToastTtl > 0) {
      partToastTtl -= dt;
      if (partToastTtl <= 0) partToast.style.opacity = '0';
    }
    // Tutorial del primer minuto
    if (tutStep >= 0) {
      if (tutStep === 0) {
        tutMoveAcc += Math.hypot(sim.player.x - prevSim.player.x, sim.player.y - prevSim.player.y);
        if (tutMoveAcc > 4) tutStep = 1;
      }
      if (tutStep === 4) {
        tutDoneTtl -= dt;
        if (tutDoneTtl <= 0) tutStep = -1;
      }
      const tutShow =
        tutStep >= 0 && !titleVisible && !bestiaryVisible && sim.phase === 'running' && travelTtl <= 0;
      tutHint.style.display = tutShow ? 'block' : 'none';
      if (tutShow) tutHint.innerHTML = TUT_TEXTS[tutStep]!;
    } else {
      tutHint.style.display = 'none';
    }
    deadMsg.style.display = sim.phase === 'dead' ? 'grid' : 'none';
    // victoria: 1.8 s de órbita triunfal alrededor del monstruo antes del panel
    if (sim.phase === 'victory' && lastPhase !== 'victory') {
      victoryCineTtl = 1.8;
      awardGesta('victoria');
    }
    if (victoryCineTtl > 0 && sim.phase === 'victory') {
      victoryCineTtl -= dt;
      camYawTarget += dt * 1.1;
    }
    winMsg.style.display = sim.phase === 'victory' && victoryCineTtl <= 0 ? 'grid' : 'none';
    if (sim.phase === 'dead' && lastPhase !== 'dead') {
      hud.querySelector<HTMLDivElement>('#dead-stats')!.textContent = endStats(sim.score);
      hud.querySelector<HTMLDivElement>('#dead-build')!.innerHTML = buildRowHtml(sim.player.loadout);
      hud.querySelector<HTMLDivElement>('#dead-taunt')!.textContent = deathTaunt(sim.wave.wave);
    }
    if (sim.phase === 'victory' && lastPhase !== 'victory') {
      hud.querySelector<HTMLDivElement>('#win-stats')!.textContent = endStats(sim.score);
      hud.querySelector<HTMLDivElement>('#win-build')!.innerHTML = buildRowHtml(sim.player.loadout);
      hud.querySelector<HTMLDivElement>('#win-taunt')!.textContent =
        WIN_LINES[Math.floor(Math.random() * WIN_LINES.length)]!;
    }
    lastPhase = sim.phase;

    if (fpsLabel) {
      fpsFrames += 1;
      fpsWindow += dt;
      if (fpsWindow >= 0.5) {
        fpsLabel.textContent = `${Math.round(fpsFrames / fpsWindow)} fps`;
        fpsFrames = 0;
        fpsWindow = 0;
      }
    }

    renderer.render(scene, camera);
  });
}

start().catch((error) => {
  if (boot) boot.textContent = `error al despertar: ${error instanceof Error ? error.message : error}`;
  console.error(error);
});
