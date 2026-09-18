export type AxieEyeGazePhase = 'fixation' | 'saccade';

export interface AxieEyeGazePoint {
  readonly x: number;
  readonly y: number;
}

export interface AxieAmbientGazeInspection {
  readonly phase: AxieEyeGazePhase;
  readonly gaze: AxieEyeGazePoint;
  readonly target: AxieEyeGazePoint;
  readonly drift: AxieEyeGazePoint;
  readonly microOffset: AxieEyeGazePoint;
  readonly saccadeProgress: number;
  readonly saccadeStarted: boolean;
  readonly saccadeDistance: number;
  readonly saccadeCount: number;
  readonly microSaccadeCount: number;
}

interface MutablePoint {
  x: number;
  y: number;
}

interface MicroSaccade {
  readonly start: number;
  readonly outward: number;
  readonly hold: number;
  readonly returning: number;
  readonly offset: MutablePoint;
}

const DEFAULT_SEED = 0x47415a45;
const MAX_MICRO_AMPLITUDE = 0.028;

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, finite(value)));
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function minimumJerk(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * t * (10 + t * (-15 + 6 * t));
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function triangular(random: () => number) {
  return random() + random() - 1;
}

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Keeps a normalized gaze command inside the circular anatomical travel
 * envelope. Axis-wise clamping lets diagonal commands overdrive a pupil.
 */
export function clampAxieEyeGaze(x: number, y: number): AxieEyeGazePoint {
  const safeX = clamp(x, -1, 1);
  const safeY = clamp(y, -1, 1);
  const length = Math.hypot(safeX, safeY);
  if (length <= 1 || length === 0) return Object.freeze({ x: safeX, y: safeY });
  return Object.freeze({ x: safeX / length, y: safeY / length });
}

/**
 * Deterministic, engine-neutral eye motor. It models quiet fixations separated
 * by fast minimum-jerk saccades, with tiny micro-saccades and ocular drift
 * inside each fixation. Consumers can run it without Three.js or a DOM.
 */
export class AxieAmbientGazePlanner {
  readonly #random: () => number;
  readonly #driftPhaseX: number;
  readonly #driftPhaseY: number;
  #time = 0;
  #phase: AxieEyeGazePhase = 'fixation';
  #phaseStarted = 0;
  #phaseEnds = 0;
  #anchor: MutablePoint = { x: 0, y: 0 };
  #saccadeFrom: MutablePoint = { x: 0, y: 0 };
  #saccadeTarget: MutablePoint = { x: 0, y: 0 };
  #saccadeDistance = 0;
  #saccadeCount = 0;
  #completedMicroSaccades = 0;
  #microSaccades: readonly MicroSaccade[] = [];
  #saccadeStarted = false;

  constructor(seed = DEFAULT_SEED, initialGaze: AxieEyeGazePoint = { x: 0, y: 0 }) {
    this.#random = mulberry32(seed);
    this.#driftPhaseX = this.#random() * Math.PI * 2;
    this.#driftPhaseY = this.#random() * Math.PI * 2;
    const initial = clampAxieEyeGaze(initialGaze.x, initialGaze.y);
    this.#anchor = { ...initial };
    this.#saccadeFrom = { ...initial };
    this.#saccadeTarget = { ...initial };
    this.#startFixation(true);
  }

  update(deltaSeconds: number): AxieAmbientGazeInspection {
    this.#saccadeStarted = false;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return this.inspect();
    const destinationTime = this.#time + Math.min(deltaSeconds, 0.25);
    let transitionGuard = 0;
    while (destinationTime >= this.#phaseEnds && transitionGuard < 8) {
      this.#time = this.#phaseEnds;
      if (this.#phase === 'fixation') {
        this.#completedMicroSaccades += this.#microSaccades.length;
        this.#startSaccade();
      } else {
        this.#anchor = { ...this.#saccadeTarget };
        this.#startFixation(false);
      }
      transitionGuard += 1;
    }
    this.#time = destinationTime;
    return this.inspect();
  }

  inspect(): AxieAmbientGazeInspection {
    const sample = this.#sample();
    const progress = this.#phase === 'saccade'
      ? clamp((this.#time - this.#phaseStarted) / (this.#phaseEnds - this.#phaseStarted), 0, 1)
      : 0;
    const currentMicroCount = this.#phase === 'fixation'
      ? this.#microSaccades.filter((micro) => this.#time - this.#phaseStarted >= micro.start).length
      : 0;
    return Object.freeze({
      phase: this.#phase,
      gaze: Object.freeze({ ...sample.gaze }),
      target: Object.freeze({ ...this.#saccadeTarget }),
      drift: Object.freeze({ ...sample.drift }),
      microOffset: Object.freeze({ ...sample.microOffset }),
      saccadeProgress: progress,
      saccadeStarted: this.#saccadeStarted,
      saccadeDistance: this.#saccadeDistance,
      saccadeCount: this.#saccadeCount,
      microSaccadeCount: this.#completedMicroSaccades + currentMicroCount,
    });
  }

  #startFixation(initial: boolean) {
    this.#phase = 'fixation';
    this.#phaseStarted = this.#time;
    const duration = initial ? 0.58 + this.#random() * 0.62 : this.#fixationDuration();
    this.#phaseEnds = this.#time + duration;
    this.#saccadeTarget = { ...this.#anchor };
    this.#microSaccades = this.#makeMicroSaccades(duration);
  }

  #startSaccade() {
    const current = this.#sample().gaze;
    this.#phase = 'saccade';
    this.#phaseStarted = this.#time;
    this.#saccadeFrom = { ...current };
    this.#saccadeTarget = this.#pickMacroTarget(current);
    this.#saccadeDistance = Math.hypot(
      this.#saccadeTarget.x - current.x,
      this.#saccadeTarget.y - current.y,
    );
    const duration = clamp(0.045 + 0.055 * this.#saccadeDistance, 0.050, 0.115);
    this.#phaseEnds = this.#time + duration;
    this.#saccadeCount += 1;
    this.#saccadeStarted = true;
    this.#microSaccades = [];
  }

  #fixationDuration() {
    const family = this.#random();
    if (family < 0.62) return 0.42 + this.#random() * 0.58;
    if (family < 0.92) return 1.0 + this.#random() * 0.9;
    return 1.9 + this.#random() * 1.6;
  }

  #pickMacroTarget(current: AxieEyeGazePoint): MutablePoint {
    let candidate: AxieEyeGazePoint = current;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const family = this.#random();
      if (family < 0.58) {
        candidate = clampAxieEyeGaze(
          triangular(this.#random) * 0.28,
          triangular(this.#random) * 0.16 + 0.02,
        );
      } else if (family < 0.88) {
        candidate = clampAxieEyeGaze(
          (this.#random() < 0.5 ? -1 : 1) * (0.48 + this.#random() * 0.42),
          triangular(this.#random) * 0.24 + 0.02,
        );
      } else {
        const verticalSign = this.#random() < 0.64 ? 1 : -1;
        candidate = clampAxieEyeGaze(
          triangular(this.#random) * 0.42,
          verticalSign * (0.24 + this.#random() * 0.28),
        );
      }
      if (Math.hypot(candidate.x - current.x, candidate.y - current.y) >= 0.09) break;
    }
    return { ...candidate };
  }

  #makeMicroSaccades(fixationDuration: number): readonly MicroSaccade[] {
    const result: MicroSaccade[] = [];
    let start = 0.28 + this.#random() * 0.58;
    while (start < fixationDuration - 0.2) {
      const angle = this.#random() * Math.PI * 2;
      const amplitude = 0.006 + this.#random() * (MAX_MICRO_AMPLITUDE - 0.006);
      const outward = 0.032 + this.#random() * 0.018;
      const hold = 0.060 + this.#random() * 0.080;
      const returning = 0.040 + this.#random() * 0.025;
      if (start + outward + hold + returning >= fixationDuration - 0.025) break;
      result.push(Object.freeze({
        start,
        outward,
        hold,
        returning,
        offset: { x: Math.cos(angle) * amplitude, y: Math.sin(angle) * amplitude * 0.82 },
      }));
      start += 0.65 + this.#random() * 0.95;
    }
    return Object.freeze(result);
  }

  #sample() {
    if (this.#phase === 'saccade') {
      const rawProgress = (this.#time - this.#phaseStarted) / (this.#phaseEnds - this.#phaseStarted);
      const progress = minimumJerk(rawProgress);
      return {
        gaze: clampAxieEyeGaze(
          lerp(this.#saccadeFrom.x, this.#saccadeTarget.x, progress),
          lerp(this.#saccadeFrom.y, this.#saccadeTarget.y, progress),
        ),
        drift: { x: 0, y: 0 },
        microOffset: { x: 0, y: 0 },
      };
    }

    const localTime = this.#time - this.#phaseStarted;
    // Offset each oscillator by its value at fixation start so gaze never
    // jumps when a saccade lands. Two incommensurate frequencies avoid loops.
    const drift = {
      x: (Math.sin(localTime * 2.17 + this.#driftPhaseX) - Math.sin(this.#driftPhaseX)) * 0.004,
      y: (Math.sin(localTime * 1.61 + this.#driftPhaseY) - Math.sin(this.#driftPhaseY)) * 0.003,
    };
    const microOffset = this.#microOffset(localTime);
    return {
      gaze: clampAxieEyeGaze(
        this.#anchor.x + drift.x + microOffset.x,
        this.#anchor.y + drift.y + microOffset.y,
      ),
      drift,
      microOffset,
    };
  }

  #microOffset(localTime: number): MutablePoint {
    const active = this.#microSaccades.find((micro) => (
      localTime >= micro.start
      && localTime <= micro.start + micro.outward + micro.hold + micro.returning
    ));
    if (!active) return { x: 0, y: 0 };
    const elapsed = localTime - active.start;
    let weight = 1;
    if (elapsed < active.outward) weight = smoothstep(elapsed / active.outward);
    else if (elapsed > active.outward + active.hold) {
      weight = 1 - smoothstep((elapsed - active.outward - active.hold) / active.returning);
    }
    return { x: active.offset.x * weight, y: active.offset.y * weight };
  }
}
