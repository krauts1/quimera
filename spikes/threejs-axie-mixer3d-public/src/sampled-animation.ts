import * as THREE from 'three';
import type { AxieDiagnosticEvent } from './diagnostics';
import type {
  AxieAnimationCoordinateSpace,
  AxieExporterAnimationPayloadV1,
  AxieExporterRestPoseV1,
  AxieExporterRestTransformRecord,
  AxieExporterTransformTrackRecord,
  AxieSampledAnimationBundleV1,
  AxieSampledAnimationIndexV1,
} from './exporter-schema';
import { isAxieExporterAnimationPayloadV1 } from './exporter-schema';
import type { AxieAnimationClipManifest } from './manifest';

const UNITY_TO_GLTF_HANDEDNESS = new THREE.Matrix4().makeScale(-1, 1, 1);
const ZERO_TRANSLATION = new THREE.Vector3();
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);
const EXPORT_SCALE_RELATIVE_TOLERANCE = 1e-5;
const EXPORT_TRANSLATION_TOLERANCE_METERS = 1e-5;

export interface AxieAnimationCoordinateConverter {
  position(x: number, y: number, z: number): readonly [number, number, number];
  quaternion(x: number, y: number, z: number, w: number): readonly [number, number, number, number];
  scale(x: number, y: number, z: number): readonly [number, number, number];
}

export const AXIE_ANIMATION_IDENTITY_COORDINATES: AxieAnimationCoordinateConverter = Object.freeze({
  position: (x: number, y: number, z: number) => [x, y, z] as const,
  quaternion: (x: number, y: number, z: number, w: number) => [x, y, z, w] as const,
  scale: (x: number, y: number, z: number) => [x, y, z] as const,
});

/**
 * Reflection across Z for a direct Unity-left-handed to Three-right-handed
 * conversion. Use only when the model conversion applies the same reflection;
 * most FBX-to-glTF pipelines bake their own axis transform and should use the
 * identity converter.
 */
export const AXIE_ANIMATION_UNITY_Z_REFLECTION: AxieAnimationCoordinateConverter = Object.freeze({
  position: (x: number, y: number, z: number) => [x, y, -z] as const,
  quaternion: (x: number, y: number, z: number, w: number) => [-x, -y, z, w] as const,
  scale: (x: number, y: number, z: number) => [x, y, z] as const,
});

export interface AxieSampledAnimationResult {
  readonly clips: readonly THREE.AnimationClip[];
  readonly events: readonly AxieDiagnosticEvent[];
  readonly payloads: readonly AxieExporterAnimationPayloadV1[];
}

export interface SampledAnimationJsonLoaderOptions {
  readonly fetchJson?: (url: string, signal?: AbortSignal) => Promise<unknown>;
  readonly fetchArrayBuffer?: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer>;
  /**
   * Resolves every animation resource through one contract. Top-level calls
   * omit baseUrl; rest poses, JSON indexes and AXANIM payloads receive the
   * already-resolved parent URL as baseUrl.
   */
  readonly resolveUrl?: (url: string, baseUrl?: string) => string;
  readonly coordinates?: AxieAnimationCoordinateConverter;
  /** Production AXANIM must use source-rest/GLB-rest change-of-basis retargeting. */
  readonly requireRestPoseForBinary?: boolean;
  readonly onDiagnostic?: (event: AxieDiagnosticEvent) => void;
}

function isFiniteTuple(value: unknown, length: number) {
  return Array.isArray(value)
    && value.length === length
    && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

export function isAxieExporterRestPoseV1(value: unknown): value is AxieExporterRestPoseV1 {
  if (!value || typeof value !== 'object') return false;
  const pose = value as Partial<AxieExporterRestPoseV1>;
  return pose.schemaVersion === 1
    && typeof pose.body === 'string'
    && typeof pose.rootName === 'string'
    && Array.isArray(pose.transforms)
    && pose.transforms.every((transform) => !!transform
      && typeof transform.path === 'string'
      && typeof transform.parentPath === 'string'
      && typeof transform.name === 'string'
      && isFiniteTuple(transform.position, 3)
      && isFiniteTuple(transform.quaternion, 4)
      && isFiniteTuple(transform.scale, 3));
}

function abortError() {
  return new DOMException('Axie animation load was aborted.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError();
}

function waitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  throwIfAborted(signal);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(abortError());
    };
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => { cleanup(); resolve(value); },
      (error: unknown) => { cleanup(); reject(error); },
    );
  });
}

async function defaultFetchJson(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load Axie animation ${url}: HTTP ${response.status}.`);
  return response.json() as Promise<unknown>;
}

async function defaultFetchArrayBuffer(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not load Axie animation ${url}: HTTP ${response.status}.`);
  return response.arrayBuffer();
}

function finiteArray(values: readonly number[], label: string) {
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) throw new Error(`${label}[${index}] is not finite.`);
  });
}

function validatePayload(payload: AxieExporterAnimationPayloadV1) {
  const times = payload.sampleTimes;
  if (times.length === 0) throw new Error(`${payload.metadata.id} has no sample times.`);
  finiteArray(times, `${payload.metadata.id}.sampleTimes`);
  for (let index = 1; index < times.length; index += 1) {
    if (times[index] < times[index - 1]) {
      throw new Error(`${payload.metadata.id} sample times are not monotonic.`);
    }
  }
  payload.transformTracks.forEach((track) => {
    const label = `${payload.metadata.id}:${track.path}`;
    if (!track.path) throw new Error(`${label} has an empty Unity transform path.`);
    if (track.position.length !== times.length * 3) {
      throw new Error(`${label} has ${track.position.length} position scalars; expected ${times.length * 3}.`);
    }
    if (track.quaternion.length !== times.length * 4) {
      throw new Error(`${label} has ${track.quaternion.length} quaternion scalars; expected ${times.length * 4}.`);
    }
    if (track.scale.length !== times.length * 3) {
      throw new Error(`${label} has ${track.scale.length} scale scalars; expected ${times.length * 3}.`);
    }
    finiteArray(track.position, `${label}.position`);
    finiteArray(track.quaternion, `${label}.quaternion`);
    finiteArray(track.scale, `${label}.scale`);
  });
}

function descendByNames(start: THREE.Object3D, names: readonly string[], from: number) {
  let current: THREE.Object3D | undefined = start;
  for (let index = from; index < names.length && current; index += 1) {
    current = current.children.find((child) => child.name === names[index]);
  }
  return current;
}

/** Resolve a Unity animation binding path exactly relative to its Animator root. */
export function resolveAxieUnityTransformPath(root: THREE.Object3D, path: string) {
  if (path === '') return root;
  const names = path.split('/');
  // Unity relative paths never contain an empty segment. Do not normalize a
  // malformed path into a different, potentially valid binding.
  if (names.some((name) => name.length === 0)) return undefined;
  return descendByNames(root, names, 0);
}

function convertVectorSamples(
  values: readonly number[],
  convert: (x: number, y: number, z: number) => readonly [number, number, number],
) {
  const output = new Float32Array(values.length);
  for (let offset = 0; offset < values.length; offset += 3) {
    const converted = convert(values[offset], values[offset + 1], values[offset + 2]);
    output[offset] = converted[0];
    output[offset + 1] = converted[1];
    output[offset + 2] = converted[2];
  }
  return output;
}

function convertQuaternionSamples(
  values: readonly number[],
  convert: (x: number, y: number, z: number, w: number) => readonly [number, number, number, number],
) {
  const output = new Float32Array(values.length);
  for (let offset = 0; offset < values.length; offset += 4) {
    const converted = convert(
      values[offset],
      values[offset + 1],
      values[offset + 2],
      values[offset + 3],
    );
    const length = Math.hypot(converted[0], converted[1], converted[2], converted[3]);
    if (length < 1e-12) throw new Error('Axie animation contains a zero-length quaternion.');
    output[offset] = converted[0] / length;
    output[offset + 1] = converted[1] / length;
    output[offset + 2] = converted[2] / length;
    output[offset + 3] = converted[3] / length;
  }
  return output;
}

interface AxieTrackRetargetBasis {
  readonly parentInverse: THREE.Matrix4;
  readonly child: THREE.Matrix4;
}

function rotationMatrix(quaternion: THREE.Quaternion) {
  return new THREE.Matrix4().compose(
    ZERO_TRANSLATION,
    quaternion.clone().normalize(),
    UNIT_SCALE,
  );
}

function convertedSourceRotation(transform: AxieExporterRestTransformRecord) {
  return UNITY_TO_GLTF_HANDEDNESS.clone()
    .multiply(rotationMatrix(new THREE.Quaternion(...transform.quaternion)))
    .multiply(UNITY_TO_GLTF_HANDEDNESS);
}

function uniformExporterScale(root: THREE.Object3D) {
  const scales = [root.scale.x, root.scale.y, root.scale.z];
  const minimum = Math.min(...scales);
  const maximum = Math.max(...scales);
  if (!Number.isFinite(minimum) || minimum <= 0
    || maximum / minimum > 1 + EXPORT_SCALE_RELATIVE_TOLERANCE) {
    throw new Error(
      `Axie animation root ${root.name} must retain its finite uniform GLB exporter scale; received ${scales.join(', ')}.`,
    );
  }
  if (root.position.length() > EXPORT_TRANSLATION_TOLERANCE_METERS) {
    throw new Error(
      `Axie animation root ${root.name} has a non-zero GLB exporter translation (${root.position.toArray().join(', ')}).`,
    );
  }
  return Math.cbrt(scales[0] * scales[1] * scales[2]);
}

/**
 * Solve the per-node FBX basis from the authoritative Unity rest rotations and
 * the actual GLB exporter transform retained on `Model`.
 *
 * Blender's body export retains one +90-degree X / 0.01 `Model` matrix and
 * mirrors Unity X. The reflection is a coordinate conversion, so a Unity local
 * transform must first be conjugated by H. Every node basis C then has the
 * exporter's uniform scale and a source-derived rotation, but exactly zero
 * translation:
 *
 *   U_h(t) = H * U(t) * H
 *   G_local(t) = inverse(C_parent) * U_h(t) * C_child
 *
 * Solving a general affine C from rest positions also satisfies the single
 * rest frame, but its invented translations rotate during animation and pull
 * limbs and weapon sockets apart. Rotation-only bases preserve every authored
 * segment vector and apply the same equation to deformation bones and
 * Root_Weapon_L/R alike.
 */
export function buildAxieAnimationRetargetBases(
  root: THREE.Object3D,
  restPose: AxieExporterRestPoseV1,
) {
  if (root.name !== restPose.rootName) {
    throw new Error(`Axie rest pose expects root ${restPose.rootName}; received ${root.name}.`);
  }
  const records = [...restPose.transforms].sort((left, right) => {
    const depth = (value: string) => value ? value.split('/').length : 0;
    return depth(left.path) - depth(right.path) || left.path.localeCompare(right.path);
  });
  const uniquePaths = new Set<string>();
  records.forEach((record) => {
    if (uniquePaths.has(record.path)) throw new Error(`Axie rest pose repeats path ${record.path}.`);
    uniquePaths.add(record.path);
  });
  if (!uniquePaths.has('')) throw new Error('Axie rest pose is missing its prefab-root transform.');

  root.updateMatrixWorld(true);
  const exporterScale = uniformExporterScale(root);
  const childBases = new Map<string, THREE.Matrix4>();
  const result = new Map<string, AxieTrackRetargetBasis>();
  const identity = new THREE.Matrix4();
  records.forEach((record) => {
    const node = resolveAxieUnityTransformPath(root, record.path);
    if (!node) return;
    node.updateMatrix();
    const isRoot = record.path === '';
    const parentBasis = isRoot ? identity : childBases.get(record.parentPath);
    if (!parentBasis) {
      throw new Error(`Axie rest pose cannot solve ${record.path}; parent ${record.parentPath} is unbound.`);
    }
    const parentRotation = new THREE.Matrix4().extractRotation(parentBasis);
    const targetRotation = rotationMatrix(node.quaternion);
    const sourceRotation = convertedSourceRotation(record);
    const childRotation = sourceRotation.clone()
      .invert()
      .multiply(parentRotation)
      .multiply(targetRotation);
    const childQuaternion = new THREE.Quaternion()
      .setFromRotationMatrix(childRotation)
      .normalize();
    const childBasis = new THREE.Matrix4().compose(
      ZERO_TRANSLATION,
      childQuaternion,
      new THREE.Vector3(exporterScale, exporterScale, exporterScale),
    );
    if (childBasis.determinant() <= 0) {
      throw new Error(`Axie animation basis for ${record.path || root.name} changed coordinate parity.`);
    }
    childBases.set(record.path, childBasis);
    result.set(record.path, {
      parentInverse: parentBasis.clone().invert(),
      child: childBasis,
    });
  });
  return result;
}

function retargetTrackSamples(
  track: AxieExporterTransformTrackRecord,
  basis: AxieTrackRetargetBasis,
) {
  const sampleCount = track.position.length / 3;
  const position = new Float32Array(track.position.length);
  const quaternion = new Float32Array(track.quaternion.length);
  const scale = new Float32Array(track.scale.length);
  const sourcePosition = new THREE.Vector3();
  const sourceQuaternion = new THREE.Quaternion();
  const sourceScale = new THREE.Vector3();
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const targetScale = new THREE.Vector3();
  const sourceMatrix = new THREE.Matrix4();
  const targetMatrix = new THREE.Matrix4();
  const previousQuaternion = new THREE.Quaternion();
  let hasPrevious = false;

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const positionOffset = sample * 3;
    const quaternionOffset = sample * 4;
    sourcePosition.fromArray(track.position, positionOffset);
    sourceQuaternion.fromArray(track.quaternion, quaternionOffset).normalize();
    sourceScale.fromArray(track.scale, positionOffset);
    sourceMatrix.compose(sourcePosition, sourceQuaternion, sourceScale);
    targetMatrix.copy(basis.parentInverse)
      .multiply(UNITY_TO_GLTF_HANDEDNESS)
      .multiply(sourceMatrix)
      .multiply(UNITY_TO_GLTF_HANDEDNESS)
      .multiply(basis.child);
    targetMatrix.decompose(targetPosition, targetQuaternion, targetScale);
    targetQuaternion.normalize();
    if (hasPrevious && previousQuaternion.dot(targetQuaternion) < 0) {
      targetQuaternion.set(
        -targetQuaternion.x,
        -targetQuaternion.y,
        -targetQuaternion.z,
        -targetQuaternion.w,
      );
    }
    hasPrevious = true;
    previousQuaternion.copy(targetQuaternion);
    targetPosition.toArray(position, positionOffset);
    targetQuaternion.toArray(quaternion, quaternionOffset);
    targetScale.toArray(scale, positionOffset);
  }
  return { position, quaternion, scale };
}

function compileTrack(
  track: AxieExporterTransformTrackRecord,
  node: THREE.Object3D,
  times: Float32Array,
  coordinates: AxieAnimationCoordinateConverter,
  retarget?: AxieTrackRetargetBasis,
) {
  const converted = retarget ? retargetTrackSamples(track, retarget) : undefined;
  // UUID binding prevents duplicate bone names from taking the wrong track.
  const target = node.uuid;
  return [
    new THREE.VectorKeyframeTrack(
      `${target}.position`,
      times,
      converted?.position ?? convertVectorSamples(track.position, coordinates.position),
    ),
    new THREE.QuaternionKeyframeTrack(
      `${target}.quaternion`,
      times,
      converted?.quaternion ?? convertQuaternionSamples(track.quaternion, coordinates.quaternion),
    ),
    new THREE.VectorKeyframeTrack(
      `${target}.scale`,
      times,
      converted?.scale ?? convertVectorSamples(track.scale, coordinates.scale),
    ),
  ];
}

function resolveRelativeUrl(file: string, indexUrl: string) {
  if (file.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(file)) return file;
  try {
    return new URL(file, indexUrl).toString();
  } catch {
    const slash = indexUrl.lastIndexOf('/');
    return slash >= 0 ? `${indexUrl.slice(0, slash + 1)}${file}` : file;
  }
}

function defaultResolveAnimationUrl(url: string, baseUrl?: string) {
  return baseUrl ? resolveRelativeUrl(url, baseUrl) : url;
}

interface SharedAnimationLoad<T> {
  readonly controller: AbortController;
  readonly promise: Promise<T>;
  consumers: number;
  settled: boolean;
}

interface AxAnimSpan {
  readonly offset: number;
  readonly length: number;
}

interface AxAnimTrackHeader {
  readonly path: string;
  readonly position: AxAnimSpan;
  readonly quaternion: AxAnimSpan;
  readonly scale: AxAnimSpan;
}

interface AxAnimHeaderV1 {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly body: string;
  readonly set: string;
  /** Absent only on legacy AXANIM1 payloads, where source-local is implied. */
  readonly coordinateSpace?: AxieAnimationCoordinateSpace;
  readonly sourceName: string;
  readonly duration: number;
  readonly sourceFrameRate: number;
  readonly sampleRate: number;
  readonly looping: boolean;
  readonly sampleCount: number;
  readonly sampleTimes: AxAnimSpan;
  readonly tracks: readonly AxAnimTrackHeader[];
  readonly events: AxieExporterAnimationPayloadV1['events'];
  readonly floatCount: number;
  readonly floatByteOffset: number;
}

interface AxAnimIndexClip {
  readonly sourceName: string;
  readonly runtimeName: string;
  readonly duration: number;
  readonly trackCount: number;
  readonly looping: boolean;
  readonly contentHash: string;
  readonly payloadUrl: string;
}

interface AxAnimIndexV1 {
  readonly schemaVersion: 1;
  readonly body: string;
  readonly set: string;
  /** Absent only on legacy indexes, where source-local is implied. */
  readonly coordinateSpace?: AxieAnimationCoordinateSpace;
  readonly restPoseUrl?: string;
  readonly clips: readonly AxAnimIndexClip[];
}

const UNITY_SOURCE_LOCAL_V1 = 'unity-source-local-v1' as const;
const TARGET_GLB_LOCAL_V1 = 'target-glb-local-v1' as const;

function animationCoordinateSpace(
  value: unknown,
  label: string,
): AxieAnimationCoordinateSpace {
  if (value === undefined) return UNITY_SOURCE_LOCAL_V1;
  if (value === UNITY_SOURCE_LOCAL_V1 || value === TARGET_GLB_LOCAL_V1) return value;
  throw new Error(
    `${label} has unsupported animation coordinate space ${String(value)}.`,
  );
}

function isAxAnimIndexV1(value: unknown): value is AxAnimIndexV1 {
  if (!value || typeof value !== 'object') return false;
  const index = value as Partial<AxAnimIndexV1>;
  return index.schemaVersion === 1
    && typeof index.body === 'string'
    && typeof index.set === 'string'
    && Array.isArray(index.clips)
    && index.clips.every((clip) => !!clip
      && typeof clip.sourceName === 'string'
      && typeof clip.runtimeName === 'string'
      && typeof clip.payloadUrl === 'string');
}

function assertSpan(span: AxAnimSpan, floatCount: number, label: string) {
  if (!Number.isInteger(span.offset) || !Number.isInteger(span.length)
    || span.offset < 0 || span.length < 0 || span.offset + span.length > floatCount) {
    throw new Error(`${label} points outside the AXANIM float payload.`);
  }
}

/** Decode the production AXANIM1 container without changing its Float32 samples. */
export function decodeAxieAnimationBinary(buffer: ArrayBuffer): AxieExporterAnimationPayloadV1 {
  if (buffer.byteLength < 12) throw new Error('AXANIM payload is shorter than its fixed header.');
  const bytes = new Uint8Array(buffer);
  const expectedMagic = [65, 88, 65, 78, 73, 77, 49, 0]; // AXANIM1\0
  if (!expectedMagic.every((value, index) => bytes[index] === value)) {
    throw new Error('AXANIM payload has an invalid magic header.');
  }
  const view = new DataView(buffer);
  const headerLength = view.getUint32(8, true);
  if (headerLength === 0 || 12 + headerLength > buffer.byteLength) {
    throw new Error('AXANIM JSON header length is invalid.');
  }
  const header = JSON.parse(
    new TextDecoder().decode(bytes.subarray(12, 12 + headerLength)),
  ) as AxAnimHeaderV1;
  if (header.schemaVersion !== 1 || !Array.isArray(header.tracks)) {
    throw new Error('Unsupported AXANIM header schema.');
  }
  const coordinateSpace = animationCoordinateSpace(
    header.coordinateSpace,
    `AXANIM ${header.id ?? ''}`,
  );
  if (!Number.isInteger(header.floatByteOffset) || header.floatByteOffset % 4 !== 0
    || !Number.isInteger(header.floatCount) || header.floatCount < 0
    || header.floatByteOffset + header.floatCount * 4 !== buffer.byteLength) {
    throw new Error(`AXANIM ${header.id ?? ''} has an invalid Float32 payload range.`);
  }
  assertSpan(header.sampleTimes, header.floatCount, `${header.id}.sampleTimes`);
  if (header.sampleTimes.length !== header.sampleCount) {
    throw new Error(`AXANIM ${header.id} sample count does not match its time span.`);
  }
  const floats = new Float32Array(buffer, header.floatByteOffset, header.floatCount);
  const slice = (span: AxAnimSpan) => floats.subarray(span.offset, span.offset + span.length);
  const tracks = header.tracks.map((track) => {
    assertSpan(track.position, header.floatCount, `${header.id}:${track.path}.position`);
    assertSpan(track.quaternion, header.floatCount, `${header.id}:${track.path}.quaternion`);
    assertSpan(track.scale, header.floatCount, `${header.id}:${track.path}.scale`);
    if (track.position.length !== header.sampleCount * 3
      || track.quaternion.length !== header.sampleCount * 4
      || track.scale.length !== header.sampleCount * 3) {
      throw new Error(`AXANIM ${header.id}:${track.path} sample dimensions are invalid.`);
    }
    return {
      path: track.path,
      // Float32Array is intentionally retained. It is array-like at runtime and
      // avoids expanding the 28 MiB production set back into JSON-sized arrays.
      position: slice(track.position) as unknown as readonly number[],
      quaternion: slice(track.quaternion) as unknown as readonly number[],
      scale: slice(track.scale) as unknown as readonly number[],
    };
  });
  return {
    schemaVersion: 1,
    metadata: {
      id: header.id,
      body: header.body,
      set: header.set,
      coordinateSpace,
      sourceName: header.sourceName,
      sourceAssetId: '',
      sourceAssetPath: '',
      duration: header.duration,
      sourceFrameRate: header.sourceFrameRate,
      sampleRate: header.sampleRate,
      wrapMode: header.looping ? 'Loop' : 'Default',
      legacy: false,
      looping: header.looping,
      curveCount: 0,
      objectCurveCount: 0,
      eventCount: header.events?.length ?? 0,
      trackCount: tracks.length,
      file: '',
      contentHash: '',
      payloadHash: '',
    },
    sampleTimes: slice(header.sampleTimes) as unknown as readonly number[],
    transformTracks: tracks,
    curves: [],
    objectCurves: [],
    events: header.events ?? [],
  };
}

function payloadList(value: unknown): readonly AxieExporterAnimationPayloadV1[] | undefined {
  if (isAxieExporterAnimationPayloadV1(value)) return [value];
  if (Array.isArray(value) && value.every(isAxieExporterAnimationPayloadV1)) return value;
  if (value && typeof value === 'object') {
    const bundle = value as Partial<AxieSampledAnimationBundleV1>;
    if (Array.isArray(bundle.clips) && bundle.clips.every(isAxieExporterAnimationPayloadV1)) {
      return bundle.clips;
    }
  }
  return undefined;
}

/**
 * Caches raw immutable JSON, then compiles UUID-bound clips per body instance.
 * Source-local missing paths are omitted like Unity's unbound curves. Sealed
 * target-GLB-local payloads instead reject any missing path because their
 * samples were composed against that exact shipped hierarchy.
 */
export class SampledAnimationJsonLoader {
  readonly #fetchJson: (url: string, signal?: AbortSignal) => Promise<unknown>;
  readonly #fetchArrayBuffer: (url: string, signal?: AbortSignal) => Promise<ArrayBuffer>;
  readonly #resolveUrl: (url: string, baseUrl?: string) => string;
  readonly #coordinates: AxieAnimationCoordinateConverter;
  readonly #onDiagnostic?: (event: AxieDiagnosticEvent) => void;
  readonly #requireRestPoseForBinary: boolean;
  readonly #payloadCache = new Map<string, SharedAnimationLoad<unknown>>();
  readonly #binaryCache = new Map<string, SharedAnimationLoad<ArrayBuffer>>();

  constructor(options: SampledAnimationJsonLoaderOptions = {}) {
    this.#fetchJson = options.fetchJson ?? defaultFetchJson;
    this.#fetchArrayBuffer = options.fetchArrayBuffer ?? defaultFetchArrayBuffer;
    this.#resolveUrl = options.resolveUrl ?? defaultResolveAnimationUrl;
    this.#coordinates = options.coordinates ?? AXIE_ANIMATION_IDENTITY_COORDINATES;
    this.#onDiagnostic = options.onDiagnostic;
    this.#requireRestPoseForBinary = options.requireRestPoseForBinary ?? true;
  }

  async loadClip(
    url: string,
    root: THREE.Object3D,
    signal?: AbortSignal,
    runtimeName?: string,
  ): Promise<AxieSampledAnimationResult> {
    const resolvedUrl = this.#resolveUrl(url);
    const document = await this.#loadDocument(resolvedUrl, signal);
    if (!isAxieExporterAnimationPayloadV1(document)) {
      throw new Error(`${resolvedUrl} is not an AxieWebExporter animation payload.`);
    }
    return this.compile([document], root, runtimeName ? new Map([[document.metadata.sourceName, runtimeName]]) : undefined);
  }

  /** Shared cached access for animation retargeting and exact add-on bases. */
  async loadRestPose(
    url: string,
    signal?: AbortSignal,
    expectedBody?: string,
  ): Promise<AxieExporterRestPoseV1> {
    const resolvedUrl = this.#resolveUrl(url);
    return this.#loadResolvedRestPose(resolvedUrl, signal, expectedBody);
  }

  async #loadResolvedRestPose(
    resolvedUrl: string,
    signal?: AbortSignal,
    expectedBody?: string,
  ): Promise<AxieExporterRestPoseV1> {
    const document = await this.#loadDocument(resolvedUrl, signal);
    if (!isAxieExporterRestPoseV1(document)) {
      throw new Error(`${resolvedUrl} is not an Axie exporter rest pose.`);
    }
    if (expectedBody && document.body.toLowerCase() !== expectedBody.toLowerCase()) {
      throw new Error(`Rest pose ${document.body} does not match animation body ${expectedBody}.`);
    }
    return document;
  }

  async loadBundle(
    url: string,
    root: THREE.Object3D,
    signal?: AbortSignal,
    expectedClips: readonly AxieAnimationClipManifest[] = [],
    restPoseUrl?: string,
  ): Promise<AxieSampledAnimationResult> {
    const resolvedUrl = this.#resolveUrl(url);
    const document = await this.#loadDocument(resolvedUrl, signal);
    let payloads = payloadList(document);
    let productionNames: ReadonlyMap<string, string> | undefined;
    let restPose: AxieExporterRestPoseV1 | undefined;
    if (!payloads && isAxAnimIndexV1(document)) {
      const indexCoordinateSpace = animationCoordinateSpace(
        document.coordinateSpace,
        `AXANIM bundle ${resolvedUrl}`,
      );
      const resolvedRestPoseUrl = restPoseUrl ?? document.restPoseUrl;
      if (resolvedRestPoseUrl) {
        restPose = await this.#loadResolvedRestPose(
          this.#resolveUrl(resolvedRestPoseUrl, resolvedUrl),
          signal,
          document.body,
        );
      } else if (this.#requireRestPoseForBinary) {
        throw new Error(
          `AXANIM bundle ${resolvedUrl} has no authoritative Unity rest pose; direct FBX/glTF track binding would be incorrect.`,
        );
      }
      productionNames = new Map(document.clips.map((clip) => [clip.sourceName, clip.runtimeName]));
      payloads = await Promise.all(document.clips.map(async (clip) => {
        const payloadUrl = this.#resolveUrl(clip.payloadUrl, resolvedUrl);
        const buffer = await this.#loadBinary(payloadUrl, signal);
        const payload = decodeAxieAnimationBinary(buffer);
        if (animationCoordinateSpace(
          payload.metadata.coordinateSpace,
          `AXANIM payload ${payloadUrl}`,
        ) !== indexCoordinateSpace
          || payload.metadata.sourceName !== clip.sourceName
          || Math.abs(payload.metadata.duration - clip.duration) > 1e-4
          || payload.metadata.trackCount !== clip.trackCount
          || payload.metadata.looping !== clip.looping) {
          throw new Error(`AXANIM payload ${payloadUrl} does not match its index record.`);
        }
        return payload;
      }));
    }
    if (!payloads && document && typeof document === 'object') {
      const index = document as Partial<AxieSampledAnimationIndexV1>;
      if (Array.isArray(index.files) && index.files.every((item) => typeof item === 'string')) {
        payloads = await Promise.all(index.files.map(async (file) => {
          const payloadUrl = this.#resolveUrl(file, resolvedUrl);
          const payload = await this.#loadDocument(payloadUrl, signal);
          if (!isAxieExporterAnimationPayloadV1(payload)) {
            throw new Error(`${payloadUrl} is not an AxieWebExporter animation payload.`);
          }
          return payload;
        }));
      }
    }
    if (!payloads) throw new Error(`${resolvedUrl} is not an Axie sampled-animation bundle or index.`);
    const runtimeNames = new Map(productionNames ?? []);
    expectedClips.forEach((clip) => runtimeNames.set(clip.sourceName, clip.runtimeName));
    return this.compile(payloads, root, runtimeNames, restPose);
  }

  compile(
    payloads: readonly AxieExporterAnimationPayloadV1[],
    root: THREE.Object3D,
    runtimeNames?: ReadonlyMap<string, string>,
    restPose?: AxieExporterRestPoseV1,
  ): AxieSampledAnimationResult {
    const events: AxieDiagnosticEvent[] = [];
    const coordinateSpaces = payloads.map((payload) => animationCoordinateSpace(
      payload.metadata.coordinateSpace,
      `Animation ${payload.metadata.id}`,
    ));
    const needsSourceRetarget = coordinateSpaces.includes(UNITY_SOURCE_LOCAL_V1);
    const retargetBases = restPose && needsSourceRetarget
      ? buildAxieAnimationRetargetBases(root, restPose)
      : undefined;
    const clips = payloads.map((payload, payloadIndex) => {
      validatePayload(payload);
      const coordinateSpace = coordinateSpaces[payloadIndex];
      const targetGlbLocal = coordinateSpace === TARGET_GLB_LOCAL_V1;
      const times = Float32Array.from(payload.sampleTimes);
      const tracks: THREE.KeyframeTrack[] = [];
      let boundSourceTransformTrackCount = 0;
      payload.transformTracks.forEach((record) => {
        const node = resolveAxieUnityTransformPath(root, record.path);
        // Unity silently ignores curves whose exact relative hierarchy path is
        // absent from the Animator root. Do not bind by a terminal-name guess.
        if (!node) {
          if (targetGlbLocal) {
            throw new Error(
              `Target-local animation ${payload.metadata.sourceName} references missing shipped path ${record.path}.`,
            );
          }
          return;
        }
        const retarget = targetGlbLocal ? undefined : retargetBases?.get(record.path);
        if (!targetGlbLocal && retargetBases && !retarget) {
          const event: AxieDiagnosticEvent = {
            severity: 'warning',
            code: 'animation-track-unbound',
            message: `Animation ${payload.metadata.sourceName} has no rest-pose basis for ${record.path}; the remaining tracks are still playable.`,
            assetId: payload.metadata.id,
            details: { path: record.path },
          };
          events.push(event);
          this.#onDiagnostic?.(event);
          return;
        }
        tracks.push(...compileTrack(
          record,
          node,
          times,
          targetGlbLocal ? AXIE_ANIMATION_IDENTITY_COORDINATES : this.#coordinates,
          retarget,
        ));
        boundSourceTransformTrackCount += 1;
      });
      const runtimeName = runtimeNames?.get(payload.metadata.sourceName)
        ?? `${payload.metadata.set}:${payload.metadata.sourceName}`;
      const clip = new THREE.AnimationClip(runtimeName, payload.metadata.duration, tracks);
      (clip as THREE.AnimationClip & { userData: Record<string, unknown> }).userData = {
        axieSourceName: payload.metadata.sourceName,
        axieAnimationSet: payload.metadata.set,
        axieLooping: payload.metadata.looping,
        axieWrapMode: payload.metadata.wrapMode,
        axieEvents: payload.events,
        axieObjectCurves: payload.objectCurves,
        axieSourceTrackCount: payload.metadata.trackCount,
        axieUnboundTrackCount: payload.transformTracks.length - boundSourceTransformTrackCount,
        axieCoordinateSpace: coordinateSpace,
        axieRestPoseRetargeted: !targetGlbLocal && !!restPose,
        axieWeaponSocketCorrectedTrackCount: 0,
        axieWeaponSocketSynthesizedTrackCount: 0,
      };
      if (!clip.validate()) throw new Error(`Compiled Axie animation ${payload.metadata.id} is invalid.`);
      return clip;
    });
    return { clips, events, payloads };
  }

  clearCache() {
    this.#payloadCache.forEach((entry) => {
      if (!entry.settled) entry.controller.abort();
    });
    this.#binaryCache.forEach((entry) => {
      if (!entry.settled) entry.controller.abort();
    });
    this.#payloadCache.clear();
    this.#binaryCache.clear();
  }

  async #loadDocument(url: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    let entry = this.#payloadCache.get(url);
    if (!entry) {
      entry = this.#createSharedLoad(
        url,
        this.#payloadCache,
        (sharedSignal) => this.#fetchJson(url, sharedSignal),
      );
    }
    return this.#consumeSharedLoad(url, entry, this.#payloadCache, signal);
  }

  async #loadBinary(url: string, signal?: AbortSignal) {
    throwIfAborted(signal);
    let entry = this.#binaryCache.get(url);
    if (!entry) {
      entry = this.#createSharedLoad(
        url,
        this.#binaryCache,
        (sharedSignal) => this.#fetchArrayBuffer(url, sharedSignal),
      );
    }
    return this.#consumeSharedLoad(url, entry, this.#binaryCache, signal);
  }

  #createSharedLoad<T>(
    key: string,
    cache: Map<string, SharedAnimationLoad<T>>,
    load: (signal: AbortSignal) => Promise<T>,
  ) {
    const controller = new AbortController();
    let entry!: SharedAnimationLoad<T>;
    const source = Promise.resolve().then(() => load(controller.signal));
    const promise = waitWithAbort(source, controller.signal)
      .catch((error: unknown) => {
        if (cache.get(key) === entry) cache.delete(key);
        throw error;
      })
      .finally(() => { entry.settled = true; });
    entry = {
      controller,
      promise,
      consumers: 0,
      settled: false,
    };
    cache.set(key, entry);
    return entry;
  }

  async #consumeSharedLoad<T>(
    key: string,
    entry: SharedAnimationLoad<T>,
    cache: Map<string, SharedAnimationLoad<T>>,
    signal?: AbortSignal,
  ) {
    entry.consumers += 1;
    try {
      return await waitWithAbort(entry.promise, signal);
    } finally {
      entry.consumers = Math.max(0, entry.consumers - 1);
      if (!entry.settled && entry.consumers === 0) {
        if (cache.get(key) === entry) cache.delete(key);
        entry.controller.abort();
      }
    }
  }
}
