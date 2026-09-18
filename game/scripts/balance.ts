// Suite de balance headless (T2, semilla de T13).
// Corre runs sembrados con el bot jugador en 3 niveles y reporta la curva de muerte.
// Uso: npm run balance [-- runs=60]
import { BOT_PROFILES, botInput } from '../src/engine/botPlayer';
import { TICK_HZ } from '../src/engine/constants';
import { createRng } from '../src/engine/rng';
import { createSim, step } from '../src/engine/sim';

const RUNS = Number(process.argv.find((a) => a.startsWith('runs='))?.slice(5) ?? 60);
const CAP_TICKS = TICK_HZ * 60 * 12; // 12 min: tope de seguridad

interface RunResult {
  wave: number;
  seconds: number;
  devours: number;
  rips: number;
  capped: boolean;
  won: boolean;
}

function runOne(seed: number, profileName: keyof typeof BOT_PROFILES): RunResult {
  const profile = BOT_PROFILES[profileName];
  const rng = createRng(seed);
  let sim = createSim();
  let devours = 0;
  let rips = 0;
  while ((sim.phase === 'running' || sim.phase === 'molt') && sim.tick < CAP_TICKS) {
    sim = step(sim, botInput(sim, rng, profile), rng);
    for (const e of sim.events) {
      if (e.type === 'devour') devours += 1;
      if (e.type === 'rip') rips += 1;
    }
  }
  return {
    wave: sim.wave.wave,
    seconds: sim.tick / TICK_HZ,
    devours,
    rips,
    capped: sim.phase === 'running',
    won: sim.phase === 'victory',
  };
}

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

console.log(`balance: ${RUNS} runs por perfil, cap ${CAP_TICKS / TICK_HZ / 60} min\n`);
console.log('perfil  | p25 med p75 oleada fin | %win | seg med | devorar | arrancar | cap');
console.log('--------|------------------------|------|---------|---------|----------|----');
for (const name of ['casual', 'medio', 'bueno'] as const) {
  const results: RunResult[] = [];
  for (let seed = 1; seed <= RUNS; seed += 1) results.push(runOne(seed * 7919, name));
  const waves = results.map((r) => r.wave).sort((a, b) => a - b);
  const secs = results.map((r) => r.seconds).sort((a, b) => a - b);
  const devours = results.reduce((s, r) => s + r.devours, 0) / RUNS;
  const rips = results.reduce((s, r) => s + r.rips, 0) / RUNS;
  const capped = results.filter((r) => r.capped).length;
  const wins = results.filter((r) => r.won).length;
  console.log(
    `${name.padEnd(7)} | ${String(pct(waves, 25)).padStart(3)} ${String(pct(waves, 50)).padStart(3)} ${String(pct(waves, 75)).padStart(3)}${' '.repeat(12)}| ${String(Math.round((100 * wins) / RUNS)).padStart(3)}% | ${pct(secs, 50).toFixed(0).padStart(7)} | ${devours.toFixed(1).padStart(7)} | ${rips.toFixed(1).padStart(8)} | ${capped}`,
  );
}
console.log('\nobjetivo: victoria (oleada final = 9, doble Alfa) alcanzable para bueno');
console.log('(~30–60% win), rara para medio (<20%), casi nula para casual. cap debe ser 0.');
