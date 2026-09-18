// SFX sintetizados con WebAudio en runtime — cero assets externos.
// Fuera del motor: aquí Math.random es legal (ruido), nada de esto toca la sim.

let ctx: AudioContext | null = null;

// ── Bus maestro: compresor (pega los niveles) + reverb generada (el espacio).
// La reverb es un impulso de ruido con decaimiento exponencial — cero assets.
let master: GainNode | null = null;
let verb: ConvolverNode | null = null;
function ensureBus(): void {
  if (!ctx || master) return;
  master = ctx.createGain();
  master.gain.value = 1;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 6;
  comp.attack.value = 0.004;
  comp.release.value = 0.24;
  master.connect(comp).connect(ctx.destination);
  const len = Math.ceil(ctx.sampleRate * 2.2);
  const impulse = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
  }
  verb = ctx.createConvolver();
  verb.buffer = impulse;
  const verbGain = ctx.createGain();
  verbGain.gain.value = 0.22;
  verb.connect(verbGain).connect(master);
}
function sink(): AudioNode {
  ensureBus();
  return master ?? ctx!.destination;
}
/** Manda una copia del nodo a la reverb (cola espacial). */
function wet(node: AudioNode, amount: number): void {
  if (!verb || !ctx) return;
  const send = ctx.createGain();
  send.gain.value = amount;
  node.connect(send).connect(verb);
}

// ── Overrides por archivo: suelta `public/audio/<nombre>.ogg|mp3` y ese sonido
// reemplaza al sintetizado. Sin archivo, suena el procedural. Nombres válidos:
// hit, crit, perfect, playerHurt, knockdown, rip, devour, synergy, telegraph,
// death, victory, wave, meteorWarn, meteorHit, stun, growl, roar, ultimate,
// contract, distantRoar, golden, apex, stinger — y `music` (loop, apaga la
// música generativa) / `ambient` (loop).
const OVERRIDE_NAMES = [
  'hit', 'crit', 'perfect', 'playerHurt', 'knockdown', 'rip', 'devour', 'synergy',
  'telegraph', 'death', 'victory', 'wave', 'meteorWarn', 'meteorHit', 'stun',
  'growl', 'roar', 'ultimate', 'contract', 'music', 'ambient',
  'distantRoar', 'golden', 'apex', 'stinger', 'heartbeat',
] as const;
const overrides = new Map<string, AudioBuffer>();

async function loadOverrides(): Promise<void> {
  if (!ctx) return;
  await Promise.all(
    OVERRIDE_NAMES.map(async (name) => {
      for (const ext of ['ogg', 'mp3']) {
        try {
          const res = await fetch(`./audio/${name}.${ext}`);
          if (!res.ok || !(res.headers.get('content-type') ?? '').includes('audio')) continue;
          const buf = await ctx!.decodeAudioData(await res.arrayBuffer());
          overrides.set(name, buf);
          console.info(`[quimera] audio: ${name}.${ext} (archivo)`);
          return;
        } catch {
          /* sin archivo: fallback procedural */
        }
      }
    }),
  );
  // loops de música/ambiente por archivo (silencian sus versiones generativas)
  for (const name of ['music', 'ambient'] as const) {
    const buf = overrides.get(name);
    if (!buf) continue;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = name === 'music' ? 0.5 : 0.35;
    src.connect(g).connect(sink());
    src.start();
    if (name === 'music') fileMusic = true;
    else fileAmbient = true;
  }
}
let fileMusic = false;
let fileAmbient = false;

/** true si sonó un archivo (y el procedural debe callarse). */
function playFile(name: string, gain = 1): boolean {
  const buf = overrides.get(name);
  if (!ctx || !buf) return false;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(g).connect(sink());
  wet(g, 0.15);
  src.start();
  return true;
}

let ambientOn = false;

export function initAudio(): void {
  if (!ctx) ctx = new AudioContext();
  ensureBus();
  void ctx.resume();
  // pestaña oculta = silencio (el rAF se pausa pero WebAudio seguía sonando)
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) void ctx.suspend();
    else void ctx.resume();
  });
  void loadOverrides().then(() => {
    if (!fileAmbient) startAmbient();
    if (!fileMusic) startMusic();
  });
}

// ── Música generativa adaptativa ──
// Pads menores en ciclo + arpegio pentatónico que crece con la oleada +
// pulso grave cuando hay peligro (Alfa cazándote / manada vengativa).
let musicOn = false;
let musicIntensity = 0; // 0..1 (oleada / oleada final)
let musicDanger = false;
let musicTerritory = 0; // cada territorio tiene su sección de orquesta

export function setMusicState(intensity: number, danger: boolean, territory = 0): void {
  musicIntensity = Math.max(0, Math.min(1, intensity));
  musicDanger = danger;
  musicTerritory = territory;
}

function envNote(
  dest: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  type: OscillatorType,
  attack: number,
): OscillatorNode {
  const osc = ctx!.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
  return osc;
}

/** Pad rico: dos sierras desafinadas por un lowpass que respira con la oleada. */
function padNote(dest: AudioNode, freq: number, t0: number, dur: number): void {
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(420, t0);
  lp.frequency.linearRampToValueAtTime(850 + musicIntensity * 950, t0 + dur * 0.5);
  lp.connect(dest);
  for (const det of [0.996, 1.004]) {
    envNote(lp, freq * det, t0, dur, 0.012, 'sawtooth', 1.6);
  }
}

/** Hi-hat: soplo de ruido corto filtrado en agudos, programable en el tiempo. */
function hatAt(dest: AudioNode, t0: number, gain: number): void {
  const dur = 0.035;
  const len = Math.ceil(ctx!.sampleRate * dur);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const hp = ctx!.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6200;
  const g = ctx!.createGain();
  g.gain.value = gain;
  src.connect(hp).connect(g).connect(dest);
  src.start(t0);
}

/** Timbal: seno grave con caída de pitch + golpe de baqueta. El peso épico. */
function timpaniAt(dest: AudioNode, t0: number, freq: number, gain: number): void {
  const osc = ctx!.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 1.4, t0);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, t0 + 0.32);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.65);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + 0.7);
  // baqueta: soplo corto de ruido grave
  const len = Math.ceil(ctx!.sampleRate * 0.05);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 850;
  const ng = ctx!.createGain();
  ng.gain.value = gain * 0.5;
  src.connect(lp).connect(ng).connect(dest);
  src.start(t0);
}

/** Coro fantasmal: sierras con vibrato por filtros de FORMANTES ("aah"). */
function choirNote(dest: AudioNode, freq: number, t0: number, dur: number, gain: number): void {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  g.connect(dest);
  for (const [f, q, amt] of [[700, 9, 1], [1150, 11, 0.6], [2600, 14, 0.2]] as const) {
    const bp = ctx!.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const bg = ctx!.createGain();
    bg.gain.value = amt;
    bp.connect(bg).connect(g);
    for (const det of [0.994, 1.006]) {
      const osc = ctx!.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq * det, t0);
      const lfo = ctx!.createOscillator(); // vibrato lento: vende la voz
      lfo.frequency.value = 4.6;
      const lfoG = ctx!.createGain();
      lfoG.gain.value = freq * 0.008;
      lfo.connect(lfoG).connect(osc.frequency);
      lfo.start(t0);
      lfo.stop(t0 + dur + 0.1);
      osc.connect(bp);
      osc.start(t0);
      osc.stop(t0 + dur + 0.1);
    }
  }
}

/** Stab de cuerdas/metales: ensamble de sierras con ataque duro y filtro que cierra. */
function stabAt(dest: AudioNode, freqs: readonly number[], t0: number, gain: number): void {
  const lp = ctx!.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2400, t0);
  lp.frequency.exponentialRampToValueAtTime(480, t0 + 0.4);
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
  lp.connect(g).connect(dest);
  for (const f of freqs) {
    for (const det of [0.994, 1, 1.007]) {
      const o = ctx!.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f * det;
      o.connect(lp);
      o.start(t0);
      o.stop(t0 + 0.5);
    }
  }
}

/** Crescendo de platillo: ruido que crece hacia el compás — anuncia el peligro. */
function swellAt(dest: AudioNode, t0: number, dur: number, gain: number): void {
  const len = Math.ceil(ctx!.sampleRate * dur);
  const buf = ctx!.createBuffer(1, len, ctx!.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * Math.pow(i / len, 2);
  const src = ctx!.createBufferSource();
  src.buffer = buf;
  const hp = ctx!.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3800;
  const g = ctx!.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.25);
  src.connect(hp).connect(g).connect(dest);
  src.start(t0);
}

function startMusic(): void {
  if (!ctx || musicOn) return;
  musicOn = true;
  const music = ctx.createGain();
  music.gain.value = 0.9;
  music.connect(sink());
  wet(music, 0.35);
  // eco para el arpegio
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.375;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.32;
  delay.connect(feedback).connect(delay);
  const echoWet = ctx.createGain();
  echoWet.gain.value = 0.5;
  delay.connect(echoWet).connect(music);

  // progresión menor lunar: Am → F → C → G (registro grave)
  const ROOTS = [110, 87.31, 130.81, 98];
  const PENTA = [2, 2.378, 2.996, 3.564, 4.49]; // pentatónica menor, una octava arriba
  const BAR = 4; // segundos por compás
  let bar = 0;
  let nextBar = ctx.currentTime + 0.15;
  let lastBarDanger = false;

  window.setInterval(() => {
    if (!ctx) return;
    while (nextBar < ctx.currentTime + 1.2) {
      const t0 = nextBar;
      const root = ROOTS[bar % ROOTS.length]!;
      // pad: raíz + tercera menor + quinta — la cama armónica, siempre
      for (const ratio of [1, 1.189, 1.498]) {
        padNote(music, root * ratio, t0, BAR + 1.2);
      }
      // brillo alto cuando la cacería aprieta (octava + quinta, muy tenue)
      if (musicIntensity > 0.55) {
        envNote(music, root * 2.996, t0 + BAR * 0.5, BAR * 0.7, 0.008, 'triangle', 0.8);
      }
      // ── ARREGLO POR TERRITORIO: cada bioma trae su sección de orquesta ──
      const arpNotes =
        musicTerritory === 0
          ? 2 + Math.round(musicIntensity * 6) // PRADOS: arpa pastoral en primer plano
          : musicTerritory === 1
            ? 1 + Math.round(musicIntensity * 3) // MAR: la percusión manda
            : Math.round(musicIntensity * 2); // CICATRIZ: casi silencio — canta el coro
      for (let i = 0; i < arpNotes; i += 1) {
        const t = t0 + (i * BAR) / Math.max(1, arpNotes) + Math.random() * 0.06;
        const freq = root * PENTA[Math.floor(Math.random() * PENTA.length)]!;
        const pluck = envNote(music, freq, t, 0.5, 0.028 * (0.5 + musicIntensity), 'triangle', 0.01);
        pluck.connect(delay);
      }
      if (musicTerritory === 1) {
        // MAR DE POLVO: timbales en 1 y 3; redoble cada 4 compases
        timpaniAt(music, t0, 58, 0.09 + 0.04 * musicIntensity);
        timpaniAt(music, t0 + BAR / 2, 44, 0.07);
        if (bar % 4 === 3) {
          for (let k = 0; k < 4; k += 1) {
            timpaniAt(music, t0 + BAR * 0.75 + k * 0.11, 58, 0.045 + k * 0.012);
          }
        }
      } else if (musicTerritory >= 2) {
        // LA CICATRIZ: coro fantasmal (raíz + quinta) sobre un timbal-latido
        choirNote(music, root * 2, t0, BAR * 1.15, 0.02);
        choirNote(music, root * 2.996, t0 + BAR * 0.5, BAR * 0.85, 0.013);
        timpaniAt(music, t0, 52, 0.075);
      }
      // stabs de cuerdas cuando algo te caza (además del pulso grave)
      if (musicDanger) {
        stabAt(music, [root * 2, root * 2.996], t0, 0.045);
        stabAt(music, [root * 2, root * 2.996], t0 + BAR * 0.75, 0.032);
        if (!lastBarDanger) swellAt(music, t0, BAR * 0.5, 0.03); // crescendo de entrada
      }
      lastBarDanger = musicDanger;
      // batería sutil: crece con la oleada; con peligro, pulso de cacería al doble
      if (musicIntensity > 0.12 || musicDanger) {
        const beats = musicDanger ? 8 : 4;
        for (let k = 0; k < beats; k += 1) {
          const t = t0 + k * (BAR / beats);
          const kick = envNote(
            music, 60, t, 0.15,
            (musicDanger ? 0.11 : 0.045) + 0.05 * musicIntensity, 'sine', 0.004,
          );
          kick.frequency.exponentialRampToValueAtTime(31, t + 0.13);
          if (k % 2 === 1) hatAt(music, t, 0.012 + 0.02 * musicIntensity);
        }
      }
      bar += 1;
      nextBar += BAR;
    }
  }, 400);
}

/** Drone lunar tenue en loop: dos senos desafinados + respiración lenta. */
function startAmbient(): void {
  if (!ctx || ambientOn) return;
  ambientOn = true;
  const master = ctx.createGain();
  master.gain.value = 0.016;
  master.connect(sink());
  wet(master, 0.4);
  for (const [freq, level] of [
    [55, 1],
    [55.6, 0.8],
    [110.4, 0.35],
  ] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = level;
    osc.connect(g).connect(master);
    osc.start();
  }
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.045; // respira cada ~22 s
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.007;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
}

function now(): number {
  return ctx?.currentTime ?? 0;
}

interface ToneOpts {
  freq: number;
  end?: number; // frecuencia final (slide)
  dur: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
}

function tone({ freq, end, dur, type = 'square', gain = 0.08, delay = 0 }: ToneOpts): void {
  if (!ctx) return;
  const t0 = now() + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (end !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(end, 1), t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(sink());
  wet(g, 0.22);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain = 0.06, delay = 0, lowpass = 2400): void {
  if (!ctx) return;
  const t0 = now() + delay;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(sink());
  wet(g, 0.12);
  src.start(t0);
}

/** Cada acción del loop suena distinto. Nombres = eventos del motor. */
export const sfx = {
  hit(): void {
    if (playFile('hit')) return;
    tone({ freq: 220, end: 170, dur: 0.07, gain: 0.05 });
  },
  playerHurt(): void {
    if (playFile('playerHurt')) return;
    tone({ freq: 95, end: 55, dur: 0.18, type: 'sine', gain: 0.14 });
    noise(0.1, 0.05, 0, 900);
  },
  knockdown(): void {
    if (playFile('knockdown')) return;
    tone({ freq: 320, end: 60, dur: 0.28, type: 'sawtooth', gain: 0.09 });
  },
  rip(): void {
    if (playFile('rip')) return;
    noise(0.16, 0.09, 0, 3200);
    tone({ freq: 500, end: 1100, dur: 0.14, type: 'triangle', gain: 0.07, delay: 0.05 });
  },
  devour(): void {
    if (playFile('devour')) return;
    tone({ freq: 160, end: 90, dur: 0.12, type: 'sine', gain: 0.1 });
    tone({ freq: 220, end: 320, dur: 0.16, type: 'sine', gain: 0.08, delay: 0.12 });
  },
  synergy(): void {
    if (playFile('synergy')) return;
    for (const [i, f] of [392, 494, 587].entries()) {
      tone({ freq: f, dur: 0.12, type: 'triangle', gain: 0.07, delay: i * 0.07 });
    }
  },
  telegraph(): void {
    if (playFile('telegraph')) return;
    tone({ freq: 1250, dur: 0.04, type: 'square', gain: 0.025 });
  },
  meteorWarn(): void {
    if (playFile('meteorWarn')) return;
    tone({ freq: 950, end: 180, dur: 0.55, type: 'sawtooth', gain: 0.045 });
  },
  meteorHit(): void {
    if (playFile('meteorHit')) return;
    tone({ freq: 75, end: 28, dur: 0.45, type: 'sine', gain: 0.2 });
    noise(0.35, 0.09, 0, 500);
  },
  wave(): void {
    if (playFile('wave')) return;
    tone({ freq: 294, dur: 0.16, type: 'triangle', gain: 0.07 });
    tone({ freq: 440, dur: 0.2, type: 'triangle', gain: 0.07, delay: 0.14 });
  },
  crit(): void {
    if (playFile('crit')) return;
    tone({ freq: 880, end: 1320, dur: 0.09, type: 'square', gain: 0.06 });
  },
  perfect(): void {
    if (playFile('perfect')) return;
    tone({ freq: 660, dur: 0.1, type: 'triangle', gain: 0.08 });
    tone({ freq: 990, dur: 0.16, type: 'triangle', gain: 0.08, delay: 0.08 });
  },
  stun(): void {
    if (playFile('stun')) return;
    tone({ freq: 400, end: 180, dur: 0.25, type: 'square', gain: 0.06 });
    tone({ freq: 300, end: 140, dur: 0.22, type: 'square', gain: 0.05, delay: 0.1 });
  },
  growl(): void {
    if (playFile('growl')) return;
    tone({ freq: 90, end: 190, dur: 0.6, type: 'sawtooth', gain: 0.09 });
  },
  roar(): void {
    if (playFile('roar')) return;
    tone({ freq: 140, end: 45, dur: 0.7, type: 'sawtooth', gain: 0.16 });
    noise(0.5, 0.08, 0, 700);
  },
  ultimate(): void {
    if (playFile('ultimate')) return;
    tone({ freq: 60, end: 30, dur: 0.6, type: 'sine', gain: 0.2 });
    noise(0.4, 0.1, 0, 1800);
    for (const [i, f] of [330, 415, 495, 660].entries()) {
      tone({ freq: f, dur: 0.18, type: 'triangle', gain: 0.06, delay: i * 0.05 });
    }
  },
  contract(): void {
    if (playFile('contract')) return;
    tone({ freq: 587, dur: 0.09, type: 'square', gain: 0.06 });
    tone({ freq: 880, dur: 0.14, type: 'square', gain: 0.06, delay: 0.09 });
  },
  death(): void {
    if (playFile('death')) return;
    tone({ freq: 240, end: 40, dur: 0.9, type: 'sawtooth', gain: 0.1 });
    noise(0.5, 0.05, 0.1, 600);
  },
  victory(): void {
    if (playFile('victory')) return;
    for (const [i, f] of [392, 494, 587, 784].entries()) {
      tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.09, delay: i * 0.12 });
    }
  },
  /** El PRIMORDIAL existe antes de aparecer: rugido lejano, más fuerte por territorio. */
  distantRoar(intensity: number): void {
    if (playFile('distantRoar', 0.25 + intensity * 0.5)) return;
    const g = 0.025 + intensity * 0.05;
    tone({ freq: 68, end: 32, dur: 1.5, type: 'sawtooth', gain: g });
    tone({ freq: 51, end: 24, dur: 1.9, type: 'sawtooth', gain: g * 0.55, delay: 0.3 }); // eco
    noise(1.1, g * 0.35, 0.15, 280);
  },
  /** ¡PRESA DORADA a la vista! Campanillas de jackpot. */
  golden(): void {
    if (playFile('golden')) return;
    for (const [i, f] of [784, 988, 1175, 1568].entries()) {
      tone({ freq: f, dur: 0.14, type: 'triangle', gain: 0.06, delay: i * 0.06 });
    }
  },
  /** Latido con vida baja: dos golpes sordos — pum-pum. */
  heartbeat(): void {
    if (playFile('heartbeat')) return;
    tone({ freq: 55, end: 40, dur: 0.12, type: 'sine', gain: 0.13 });
    tone({ freq: 50, end: 36, dur: 0.14, type: 'sine', gain: 0.09, delay: 0.18 });
  },
  /** STINGER orquestal: el golpe de "entró el jefe" — timbal + metales + platillo. */
  stinger(): void {
    if (playFile('stinger')) return;
    if (!ctx) return;
    const d = ctx.createGain();
    d.gain.value = 1;
    d.connect(sink());
    wet(d, 0.4);
    const t0 = now();
    swellAt(d, t0, 0.5, 0.045);
    timpaniAt(d, t0 + 0.5, 62, 0.22);
    stabAt(d, [220, 261.6, 329.6], t0 + 0.5, 0.1);
    timpaniAt(d, t0 + 0.82, 46, 0.14);
  },
  /** Modo APEX (sinergia 4/4): acorde de poder que sube. */
  apex(): void {
    if (playFile('apex')) return;
    tone({ freq: 98, end: 196, dur: 0.5, type: 'sawtooth', gain: 0.09 });
    for (const [i, f] of [392, 494, 587, 784, 988].entries()) {
      tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.07, delay: 0.15 + i * 0.06 });
    }
  },
};
