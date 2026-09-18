import * as THREE from 'three';
import {
  MysticSourceMaterial,
  MysticSourceMaterialFactory,
} from './mystic-material-factory';
import { MYSTIC_VERTEX_VARYINGS } from './mystic-shader-registry';
import { resolveMysticQuality } from './mystic-quality';
import type {
  AddonParticleRuntime,
  AddonParticleResetOptions,
  AddonParticleSystemSchema,
  MysticColorTuple,
  MysticDiagnostic,
  MysticDiagnosticSink,
  MysticGradientSchema,
  MysticMaterialFactoryOptions,
  MysticMinMaxCurveSchema,
  MysticMinMaxGradientSchema,
  MysticQualityId,
  MysticQualityProfile,
} from './mystic-types';

export const ADDON_SUPPORTED_PARTICLE_MODULES = Object.freeze(new Set([
  'InitialModule',
  'EmissionModule',
  'ShapeModule',
  'SizeModule',
  'RotationModule',
  'ColorModule',
  'UVModule',
  'CustomDataModule',
]));

const UNITY_PARTICLE_ANIMATION_GRID = 0;
const UNITY_PARTICLE_ANIMATION_SPRITES = 1;

export const ADDON_PARTICLE_VERTEX_SHADER = /* glsl */`
  attribute vec3 aParticlePosition;
  attribute vec2 aParticleSize;
  attribute float aParticleRotation;
  attribute vec4 aParticleColor;
  attribute float aParticleFrame;
  attribute vec4 aParticleCustom0;

  uniform vec2 uParticleTiles;

  ${MYSTIC_VERTEX_VARYINGS}

  void main() {
    float cosine = cos(aParticleRotation);
    float sine = sin(aParticleRotation);
    vec2 corner = position.xy * aParticleSize;
    corner = mat2(cosine, -sine, sine, cosine) * corner;

    vec4 centerVS = modelViewMatrix * vec4(aParticlePosition, 1.0);
    centerVS.xy += corner;
    gl_Position = projectionMatrix * centerVS;

    float columns = max(1.0, uParticleTiles.x);
    float rows = max(1.0, uParticleTiles.y);
    float frame = floor(max(0.0, aParticleFrame));
    float column = mod(frame, columns);
    float row = floor(frame / columns);
    vMysticUv = vec2((uv.x + column) / columns, (uv.y + (rows - 1.0 - row)) / rows);
    // Unity packs UV.xy + Custom1.xy into TEXCOORD0 and Custom1.zw into
    // TEXCOORD1.xy for the authored 00/01/03/04/22 vertex stream.
    vMysticUv0Zw = aParticleCustom0.xy;
    vMysticUv2 = aParticleCustom0.xy;
    vMysticNormalVS = vec3(0.0, 0.0, 1.0);
    vec4 worldCenter = modelMatrix * vec4(aParticlePosition, 1.0);
    vMysticWorldPosition = worldCenter.xyz;
    vMysticViewDirectionWS = normalize(cameraPosition - worldCenter.xyz);
    vMysticNormalWS = vMysticViewDirectionWS;
    vMysticObjectPosition = aParticlePosition;
    vMysticObjectNormal = vec3(0.0, 0.0, 1.0);
    vMysticEyeDepth = -centerVS.z;
    vMysticScreenPosition = gl_Position;
    vMysticColor = aParticleColor;
    vMysticCustom0 = vec4(aParticleCustom0.zw, aParticleCustom0.xy);
  }
`;

interface ParticleState {
  age: number;
  lifetime: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  sizeX: number;
  sizeY: number;
  rotation: number;
  color: MysticColorTuple;
  randomSize: number;
  randomRotation: number;
  randomColor: number;
  randomFrame: number;
  randomCustom: readonly number[];
}

class Mulberry32 {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  next() {
    let value = this.#state += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

/** Cubic Hermite evaluation matching Unity's unweighted particle curves. */
export function evaluateMysticCurve(
  curve: MysticMinMaxCurveSchema['maxCurve'],
  time: number,
) {
  const keys = curve.keys;
  if (keys.length === 0) return 0;
  if (keys.length === 1 || time <= keys[0].time) return keys[0].value;
  const last = keys[keys.length - 1];
  if (time >= last.time) return last.value;
  let rightIndex = 1;
  while (rightIndex < keys.length && keys[rightIndex].time < time) rightIndex += 1;
  const left = keys[rightIndex - 1];
  const right = keys[rightIndex];
  const duration = Math.max(1e-8, right.time - left.time);
  const t = THREE.MathUtils.clamp((time - left.time) / duration, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * left.value
    + h10 * duration * left.outSlope
    + h01 * right.value
    + h11 * duration * right.inSlope;
}

export function evaluateMysticMinMaxCurve(
  curve: MysticMinMaxCurveSchema,
  time: number,
  random: number,
) {
  if (curve.mode === 1) return evaluateMysticCurve(curve.maxCurve, time) * curve.multiplier;
  if (curve.mode === 2) {
    const minimum = evaluateMysticCurve(curve.minCurve, time) * curve.multiplier;
    const maximum = evaluateMysticCurve(curve.maxCurve, time) * curve.multiplier;
    return THREE.MathUtils.lerp(minimum, maximum, random);
  }
  if (curve.mode === 3) return THREE.MathUtils.lerp(curve.minMultiplier, curve.multiplier, random);
  return curve.multiplier;
}

function evaluateGradient(source: MysticGradientSchema, time: number): MysticColorTuple {
  const interpolate = <T extends { readonly time: number }>(
    keys: readonly T[],
    callback: (left: T, right: T, amount: number) => number,
  ) => {
    if (keys.length === 0) return 1;
    if (keys.length === 1 || time <= keys[0].time) return callback(keys[0], keys[0], 0);
    const last = keys[keys.length - 1];
    if (time >= last.time) return callback(last, last, 0);
    let right = 1;
    while (right < keys.length && keys[right].time < time) right += 1;
    const leftKey = keys[right - 1];
    const rightKey = keys[right];
    const amount = source.mode === 1
      ? 0
      : THREE.MathUtils.inverseLerp(leftKey.time, rightKey.time, time);
    return callback(leftKey, rightKey, amount);
  };
  const color = [0, 1, 2].map((channel) => interpolate(
    source.colorKeys,
    (left, right, amount) => THREE.MathUtils.lerp(left.color[channel], right.color[channel], amount),
  ));
  const alpha = interpolate(
    source.alphaKeys,
    (left, right, amount) => THREE.MathUtils.lerp(left.alpha, right.alpha, amount),
  );
  return [color[0], color[1], color[2], alpha];
}

export function evaluateMysticMinMaxGradient(
  source: MysticMinMaxGradientSchema,
  time: number,
  random: number,
): MysticColorTuple {
  if (source.mode === 1) return evaluateGradient(source.maxGradient, time);
  if (source.mode === 2) {
    return source.minColor.map((value, index) => (
      THREE.MathUtils.lerp(value, source.maxColor[index], random)
    )) as unknown as MysticColorTuple;
  }
  if (source.mode === 3) {
    const minimum = evaluateGradient(source.minGradient, time);
    const maximum = evaluateGradient(source.maxGradient, time);
    return minimum.map((value, index) => (
      THREE.MathUtils.lerp(value, maximum[index], random)
    )) as unknown as MysticColorTuple;
  }
  if (source.mode === 4) return evaluateGradient(source.maxGradient, random);
  return source.maxColor;
}

function multiplyColor(left: MysticColorTuple, right: MysticColorTuple): MysticColorTuple {
  return [left[0] * right[0], left[1] * right[1], left[2] * right[2], left[3] * right[3]];
}

function buildParticleGeometry(capacity: number) {
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, -0.5, 0,
    0.5, -0.5, 0,
    0.5, 0.5, 0,
    -0.5, 0.5, 0,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 1, 1, 0, 1,
  ], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute('aParticlePosition', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3));
  geometry.setAttribute('aParticleSize', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2));
  geometry.setAttribute('aParticleRotation', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.setAttribute('aParticleColor', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  geometry.setAttribute('aParticleFrame', new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1));
  geometry.setAttribute('aParticleCustom0', new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4));
  geometry.instanceCount = 0;
  return geometry;
}

export interface ThreeAddonParticleRuntimeOptions {
  readonly schema: AddonParticleSystemSchema;
  readonly materialFactory: MysticSourceMaterialFactory;
  readonly materialOptions: Omit<MysticMaterialFactoryOptions, 'quality'>;
  readonly quality?: MysticQualityId | MysticQualityProfile;
  readonly onDiagnostic?: MysticDiagnosticSink;
  readonly strict?: boolean;
  /** Mirrors Unity local X into the exported glTF coordinate basis. */
  readonly mirrorX?: boolean;
}

export class ThreeAddonParticleRuntime implements AddonParticleRuntime {
  readonly id: string;
  readonly object: THREE.Mesh;
  readonly diagnostics: MysticDiagnostic[] = [];
  readonly #schema: AddonParticleSystemSchema;
  readonly #quality: MysticQualityProfile;
  readonly #capacity: number;
  readonly #geometry: THREE.InstancedBufferGeometry;
  readonly #materialBundle: ReturnType<MysticSourceMaterialFactory['create']>;
  readonly #material: MysticSourceMaterial;
  readonly #mirrorX: boolean;
  #random: Mulberry32;
  #particles: ParticleState[] = [];
  #playing: boolean;
  #disposed = false;
  #accumulator = 0;
  #systemTime = 0;
  #emissionAccumulator = 0;
  #startDelay = 0;
  #rateRandom = 0;

  constructor(options: ThreeAddonParticleRuntimeOptions) {
    this.id = options.schema.id;
    this.#schema = options.schema;
    this.#quality = resolveMysticQuality(options.quality);
    this.#mirrorX = options.mirrorX === true;
    const authoredCapacity = options.schema.initial.maxParticles;
    this.#capacity = Math.max(1, Math.min(
      this.#quality.perSystemParticleCap,
      Math.ceil(authoredCapacity * this.#quality.particleCapacityScale),
    ));
    const diagnostic = (event: MysticDiagnostic) => {
      this.diagnostics.push(event);
      options.onDiagnostic?.(event);
    };

    const unsupported = options.schema.enabledModules.filter(
      (module) => !ADDON_SUPPORTED_PARTICLE_MODULES.has(module),
    );
    unsupported.forEach((module) => diagnostic({
      severity: 'error',
      code: 'addon-particle-module-unsupported',
      message: `Particle module ${module} is enabled but has no Three.js adapter.`,
      assetId: this.id,
      details: { module },
    }));
    if (options.schema.shape.enabled && options.schema.shape.type !== 0) {
      diagnostic({
        severity: 'error',
        code: 'addon-particle-module-unsupported',
        message: `Particle shape type ${options.schema.shape.type} is not implemented; audited content uses Sphere (0).`,
        assetId: this.id,
        details: { module: 'ShapeModule', shapeType: options.schema.shape.type },
      });
    }
    if (options.schema.renderer.renderMode !== 0) {
      diagnostic({
        severity: 'error',
        code: 'addon-render-mode-unsupported',
        message: `Particle render mode ${options.schema.renderer.renderMode} is not a billboard.`,
        assetId: this.id,
        details: { renderMode: options.schema.renderer.renderMode },
      });
    }
    if (unsupported.length > 0 && options.strict !== false) {
      throw new Error(`Unsupported enabled particle modules for ${this.id}: ${unsupported.join(', ')}`);
    }
    if (this.#capacity < authoredCapacity) {
      diagnostic({
        severity: 'info',
        code: 'addon-particle-budget-clamped',
        message: `Particle capacity reduced from ${authoredCapacity} to ${this.#capacity}.`,
        assetId: this.id,
        details: { authoredCapacity, runtimeCapacity: this.#capacity, quality: this.#quality.id },
      });
    }

    const materialId = options.schema.renderer.materialIds[0];
    if (!materialId) {
      const event: MysticDiagnostic = {
        severity: 'error',
        code: 'addon-material-missing',
        message: `Particle ${this.id} has no renderer material.`,
        assetId: this.id,
      };
      diagnostic(event);
      throw new Error(event.message);
    }
    this.#materialBundle = options.materialFactory.create(materialId, {
      ...options.materialOptions,
      quality: this.#quality,
      onDiagnostic: (event) => {
        options.materialOptions.onDiagnostic?.(event);
        diagnostic(event);
      },
    });
    this.#material = this.#materialBundle.surface as MysticSourceMaterial;
    const textureSheet = options.schema.textureSheet;
    if (textureSheet.enabled && textureSheet.mode === UNITY_PARTICLE_ANIMATION_SPRITES) {
      const materialSchema = options.materialFactory.getSchema(materialId);
      // The fallback keeps hot-module updates safe while the generated schema
      // and runtime module are briefly from adjacent builds.
      const sprites = textureSheet.sprites ?? [];
      const sprite = sprites[0];
      if (!materialSchema || sprites.length !== 1 || !sprite) {
        const event: MysticDiagnostic = {
          severity: 'error',
          code: 'addon-particle-module-unsupported',
          message: `Particle ${this.id} requires exactly one authored Sprite-mode texture; found ${sprites.length}.`,
          assetId: this.id,
          details: { module: 'UVModule', spriteCount: sprites.length },
        };
        diagnostic(event);
        if (options.strict !== false) {
          this.#materialBundle.dispose();
          throw new Error(event.message);
        }
      } else {
        const spriteTexture = options.materialOptions.resolveTexture({
          guid: sprite.guid,
          path: sprite.path,
          scale: [1, 1],
          offset: [0, 0],
        }, materialSchema);
        if (!spriteTexture) {
          const event: MysticDiagnostic = {
            severity: 'error',
            code: 'mystic-texture-missing',
            message: `Particle ${this.id} could not resolve authored Sprite-mode texture ${sprite.path || sprite.guid}.`,
            assetId: this.id,
            details: { property: 'UVModule.sprites[0]', textureGuid: sprite.guid },
          };
          diagnostic(event);
          if (options.strict !== false) {
            this.#materialBundle.dispose();
            throw new Error(event.message);
          }
        } else {
          this.#material.uniforms.uMainTex.value = spriteTexture;
          (this.#material.uniforms.uMainTexTransform.value as THREE.Vector4).set(1, 1, 0, 0);
        }
      }
    }
    const particleTiles = {
      value: new THREE.Vector2(
        textureSheet.enabled && textureSheet.mode === UNITY_PARTICLE_ANIMATION_GRID
          ? Math.max(1, textureSheet.tilesX)
          : 1,
        textureSheet.enabled && textureSheet.mode === UNITY_PARTICLE_ANIMATION_GRID
          ? Math.max(1, textureSheet.tilesY)
          : 1,
      ),
    };
    this.#material.vertexShader = ADDON_PARTICLE_VERTEX_SHADER;
    this.#material.uniforms.uParticleTiles = particleTiles;
    this.#material.needsUpdate = true;
    const cameraDepthMaterial = this.#materialBundle.depth;
    if (cameraDepthMaterial instanceof THREE.ShaderMaterial) {
      cameraDepthMaterial.vertexShader = ADDON_PARTICLE_VERTEX_SHADER;
      cameraDepthMaterial.uniforms.uParticleTiles = particleTiles;
      cameraDepthMaterial.needsUpdate = true;
    }
    this.#geometry = buildParticleGeometry(this.#capacity);
    this.object = new THREE.Mesh(this.#geometry, this.#material);
    this.object.name = options.schema.name;
    this.object.renderOrder = options.schema.renderer.sortingOrder;
    this.object.castShadow = this.#materialBundle.castShadow;
    if (cameraDepthMaterial) this.object.customDepthMaterial = cameraDepthMaterial;
    this.object.frustumCulled = false;
    this.object.userData.axieAddonParticleId = this.id;
    this.#random = new Mulberry32(this.#resolveSeed());
    this.#playing = options.schema.playOnAwake;
    this.reset();
  }

  play() {
    this.#assertActive();
    this.#playing = true;
  }

  pause() {
    this.#assertActive();
    this.#playing = false;
  }

  stop(clear = true) {
    this.#assertActive();
    this.#playing = false;
    if (clear) {
      this.#particles.length = 0;
      this.#syncGeometry();
    }
  }

  reset(options: AddonParticleResetOptions = {}) {
    this.#assertActive();
    this.#random = new Mulberry32(this.#resolveSeed());
    this.#particles.length = 0;
    this.#accumulator = 0;
    this.#systemTime = 0;
    this.#emissionAccumulator = 0;
    this.#rateRandom = this.#random.next();
    this.#startDelay = Math.max(0, evaluateMysticMinMaxCurve(
      this.#schema.startDelay,
      0,
      this.#random.next(),
    ));
    this.#playing = this.#schema.playOnAwake;
    const prewarm = options.prewarm ?? this.#quality.prewarm;
    if (this.#schema.prewarm && prewarm) {
      const steps = Math.ceil(this.#schema.duration / this.#quality.fixedStepSeconds);
      for (let index = 0; index < steps; index += 1) {
        this.#step(this.#quality.fixedStepSeconds);
      }
    }
    this.#material.setTime(this.#systemTime);
    this.#syncGeometry();
  }

  update(deltaSeconds: number) {
    this.#assertActive();
    if (!this.#playing || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;
    this.#accumulator += Math.min(deltaSeconds, 0.25) * this.#schema.simulationSpeed;
    let steps = 0;
    while (
      this.#accumulator >= this.#quality.fixedStepSeconds
      && steps < this.#quality.maxCatchUpSteps
    ) {
      this.#step(this.#quality.fixedStepSeconds);
      this.#accumulator -= this.#quality.fixedStepSeconds;
      steps += 1;
    }
    if (steps === this.#quality.maxCatchUpSteps) this.#accumulator = 0;
    this.#material.setTime(this.#systemTime);
    this.#syncGeometry();
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.object.removeFromParent();
    this.#geometry.dispose();
    this.#materialBundle.dispose();
    this.#particles.length = 0;
  }

  #resolveSeed() {
    return this.#schema.autoRandomSeed
      ? stableHash(this.#schema.id)
      : (this.#schema.randomSeed || stableHash(this.#schema.id));
  }

  #step(delta: number) {
    const previousTime = this.#systemTime;
    this.#systemTime += delta;
    this.#updateParticles(delta);
    this.#emit(previousTime, this.#systemTime, delta);
  }

  #emit(previousSystemTime: number, nextSystemTime: number, delta: number) {
    const previous = previousSystemTime - this.#startDelay;
    const next = nextSystemTime - this.#startDelay;
    if (next < 0) return;
    const duration = Math.max(this.#schema.duration, 1e-6);
    if (!this.#schema.looping && previous >= duration) return;
    const localTime = this.#schema.looping
      ? positiveModulo(next, duration)
      : THREE.MathUtils.clamp(next, 0, duration);
    const normalized = localTime / duration;
    const rate = Math.max(0, evaluateMysticMinMaxCurve(
      this.#schema.emission.rateOverTime,
      normalized,
      this.#rateRandom,
    )) * this.#quality.emissionScale;
    this.#emissionAccumulator += rate * delta;
    const continuousCount = Math.floor(this.#emissionAccumulator);
    this.#emissionAccumulator -= continuousCount;
    this.#spawn(continuousCount);

    const firstLoop = Math.max(0, Math.floor(Math.max(previous, 0) / duration));
    const lastLoop = Math.max(firstLoop, Math.floor(Math.max(next, 0) / duration));
    for (let loop = firstLoop; loop <= lastLoop; loop += 1) {
      if (!this.#schema.looping && loop > 0) break;
      const base = loop * duration;
      for (const burst of this.#schema.emission.bursts) {
        const cycles = Math.max(1, burst.cycleCount);
        for (let cycle = 0; cycle < cycles; cycle += 1) {
          const eventTime = base + burst.time + cycle * burst.repeatInterval;
          const crossed = eventTime > previous + 1e-9 && eventTime <= next + 1e-9;
          const initialZero = previousSystemTime === 0 && eventTime === 0;
          if (!crossed && !initialZero) continue;
          if (this.#random.next() > burst.probability) continue;
          const count = Math.max(0, Math.round(evaluateMysticMinMaxCurve(
            burst.count,
            normalized,
            this.#random.next(),
          ) * this.#quality.emissionScale));
          this.#spawn(count);
        }
      }
    }
  }

  #spawn(count: number) {
    const available = this.#capacity - this.#particles.length;
    const amount = Math.min(available, Math.max(0, count));
    for (let index = 0; index < amount; index += 1) {
      const randomLifetime = this.#random.next();
      const lifetime = Math.max(1e-4, evaluateMysticMinMaxCurve(
        this.#schema.initial.startLifetime,
        0,
        randomLifetime,
      ));
      const direction = new THREE.Vector3(0, 0, 1);
      const position = new THREE.Vector3();
      if (this.#schema.shape.enabled && this.#schema.shape.type === 0) {
        const z = this.#random.next() * 2 - 1;
        const azimuth = this.#random.next() * Math.PI * 2;
        const radial = Math.sqrt(Math.max(0, 1 - z * z));
        direction.set(radial * Math.cos(azimuth), z, radial * Math.sin(azimuth));
        const innerRadius = 1 - THREE.MathUtils.clamp(this.#schema.shape.radiusThickness, 0, 1);
        const shell = THREE.MathUtils.lerp(innerRadius, 1, Math.cbrt(this.#random.next()));
        position.copy(direction).multiplyScalar(this.#schema.shape.radius * shell);
        position.multiply(new THREE.Vector3(...this.#schema.shape.scale));
        position.add(new THREE.Vector3(...this.#schema.shape.position));
      }
      const speed = evaluateMysticMinMaxCurve(
        this.#schema.initial.startSpeed,
        0,
        this.#random.next(),
      );
      const randomSize = this.#random.next();
      const startSize = evaluateMysticMinMaxCurve(this.#schema.initial.startSize, 0, randomSize);
      const sizeY = this.#schema.initial.size3d
        ? evaluateMysticMinMaxCurve(this.#schema.initial.startSizeY, 0, randomSize)
        : startSize;
      const randomRotation = this.#random.next();
      let rotation = evaluateMysticMinMaxCurve(
        this.#schema.initial.startRotation,
        0,
        randomRotation,
      );
      if (this.#random.next() < this.#schema.initial.randomizeRotationDirection) rotation *= -1;
      const randomColor = this.#random.next();
      this.#particles.push({
        age: 0,
        lifetime,
        position,
        velocity: direction.multiplyScalar(speed),
        sizeX: startSize,
        sizeY,
        rotation,
        color: evaluateMysticMinMaxGradient(this.#schema.initial.startColor, 0, randomColor),
        randomSize,
        randomRotation,
        randomColor,
        randomFrame: this.#random.next(),
        randomCustom: [this.#random.next(), this.#random.next(), this.#random.next(), this.#random.next()],
      });
    }
  }

  #updateParticles(delta: number) {
    const gravity = new THREE.Vector3(0, -9.81, 0);
    let write = 0;
    for (let read = 0; read < this.#particles.length; read += 1) {
      const particle = this.#particles[read];
      particle.age += delta;
      if (particle.age >= particle.lifetime) continue;
      const normalized = particle.age / particle.lifetime;
      const gravityScale = evaluateMysticMinMaxCurve(
        this.#schema.initial.gravityModifier,
        normalized,
        particle.randomSize,
      );
      particle.velocity.addScaledVector(gravity, gravityScale * delta);
      particle.position.addScaledVector(particle.velocity, delta);
      if (this.#schema.rotationOverLifetime.enabled) {
        particle.rotation += evaluateMysticMinMaxCurve(
          this.#schema.rotationOverLifetime.z,
          normalized,
          particle.randomRotation,
        ) * delta;
      }
      this.#particles[write] = particle;
      write += 1;
    }
    this.#particles.length = write;
  }

  #syncGeometry() {
    const positions = this.#geometry.getAttribute('aParticlePosition') as THREE.InstancedBufferAttribute;
    const sizes = this.#geometry.getAttribute('aParticleSize') as THREE.InstancedBufferAttribute;
    const rotations = this.#geometry.getAttribute('aParticleRotation') as THREE.InstancedBufferAttribute;
    const colors = this.#geometry.getAttribute('aParticleColor') as THREE.InstancedBufferAttribute;
    const frames = this.#geometry.getAttribute('aParticleFrame') as THREE.InstancedBufferAttribute;
    const custom = this.#geometry.getAttribute('aParticleCustom0') as THREE.InstancedBufferAttribute;
    const texture = this.#schema.textureSheet;
    const totalFrames = Math.max(
      1,
      texture.enabled && texture.mode === UNITY_PARTICLE_ANIMATION_GRID
        ? texture.tilesX * texture.tilesY
        : texture.enabled && texture.mode === UNITY_PARTICLE_ANIMATION_SPRITES
          ? (texture.sprites ?? []).length
          : 1,
    );
    for (let index = 0; index < this.#particles.length; index += 1) {
      const particle = this.#particles[index];
      const normalized = particle.age / particle.lifetime;
      let sizeX = particle.sizeX;
      let sizeY = particle.sizeY;
      if (this.#schema.sizeOverLifetime.enabled) {
        sizeX *= evaluateMysticMinMaxCurve(
          this.#schema.sizeOverLifetime.x,
          normalized,
          particle.randomSize,
        );
        sizeY *= evaluateMysticMinMaxCurve(
          this.#schema.sizeOverLifetime.separateAxes
            ? this.#schema.sizeOverLifetime.y
            : this.#schema.sizeOverLifetime.x,
          normalized,
          particle.randomSize,
        );
      }
      let color = particle.color;
      if (this.#schema.colorOverLifetime.enabled) {
        color = multiplyColor(color, evaluateMysticMinMaxGradient(
          this.#schema.colorOverLifetime.color,
          normalized,
          particle.randomColor,
        ));
      }
      const customValues = this.#schema.customData.enabled
        ? this.#schema.customData.vector0.map((curve, component) => evaluateMysticMinMaxCurve(
            curve,
            normalized,
            particle.randomCustom[component],
          ))
        : [0, 0, 0, 0];
      const startFrame = texture.enabled
        ? evaluateMysticMinMaxCurve(texture.startFrame, normalized, particle.randomFrame)
        : 0;
      const frameProgress = texture.enabled
        ? evaluateMysticMinMaxCurve(texture.frameOverTime, normalized, particle.randomFrame) * texture.cycles
        : 0;
      const frame = positiveModulo(Math.floor((startFrame + frameProgress) * totalFrames), totalFrames);
      positions.setXYZ(
        index,
        this.#mirrorX ? -particle.position.x : particle.position.x,
        particle.position.y,
        particle.position.z,
      );
      sizes.setXY(index, sizeX, sizeY);
      rotations.setX(index, this.#mirrorX ? -particle.rotation : particle.rotation);
      colors.setXYZW(index, color[0], color[1], color[2], color[3]);
      frames.setX(index, frame);
      custom.setXYZW(index, customValues[0], customValues[1], customValues[2], customValues[3]);
    }
    this.#geometry.instanceCount = this.#particles.length;
    [positions, sizes, rotations, colors, frames, custom].forEach((attribute) => {
      attribute.needsUpdate = true;
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.#particles.length * attribute.itemSize);
    });
  }

  #assertActive() {
    if (this.#disposed) throw new Error(`Particle runtime ${this.id} is disposed.`);
  }
}
