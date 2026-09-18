import * as THREE from 'three';
import type {
  AxieExporterRestPoseV1,
  AxieExporterRestTransformRecord,
} from './exporter-schema';

const UNITY_TO_GLTF_HANDEDNESS = new THREE.Matrix4().makeScale(-1, 1, 1);

function restLocalMatrix(transform: AxieExporterRestTransformRecord) {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...transform.position),
    new THREE.Quaternion(...transform.quaternion).normalize(),
    new THREE.Vector3(...transform.scale),
  );
}

function matrixMaxError(left: THREE.Matrix4, right: THREE.Matrix4) {
  let error = 0;
  for (let index = 0; index < 16; index += 1) {
    error = Math.max(error, Math.abs(left.elements[index] - right.elements[index]));
  }
  return error;
}

function isDescendantOf(node: THREE.Object3D, ancestor: THREE.Object3D) {
  for (let current: THREE.Object3D | null = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function buildSourceRestWorlds(restPose: AxieExporterRestPoseV1) {
  const records = [...restPose.transforms].sort((left, right) => {
    const depth = (path: string) => path ? path.split('/').length : 0;
    return depth(left.path) - depth(right.path) || left.path.localeCompare(right.path);
  });
  const worlds = new Map<string, THREE.Matrix4>();
  const byName = new Map<string, AxieExporterRestTransformRecord[]>();
  records.forEach((record) => {
    if (worlds.has(record.path)) throw new Error(`Axie rest pose repeats path ${record.path}.`);
    const parent = record.path === ''
      ? new THREE.Matrix4()
      : worlds.get(record.parentPath);
    if (!parent) {
      throw new Error(`Axie rest pose cannot resolve parent ${record.parentPath} for ${record.path}.`);
    }
    worlds.set(record.path, parent.clone().multiply(restLocalMatrix(record)));
    const named = byName.get(record.name) ?? [];
    named.push(record);
    byName.set(record.name, named);
  });
  return { worlds, byName };
}

export interface AxieConvertedRestWorldBasis {
  /** Unity rest-world matrix converted into the runtime glTF handedness. */
  readonly matrix: THREE.Matrix4;
  readonly sourcePath: string;
}

export interface AxieUnityRestWorldBasis {
  /** Exact Unity rest-world matrix, before any glTF handedness conversion. */
  readonly matrix: THREE.Matrix4;
  readonly sourcePath: string;
}

/** Resolve one unique authoritative rest-pose node in Unity coordinates. */
export function buildAxieUnityRestWorldBasis(
  restPose: AxieExporterRestPoseV1,
  nodeName: string,
): AxieUnityRestWorldBasis {
  const { worlds, byName } = buildSourceRestWorlds(restPose);
  const records = byName.get(nodeName) ?? [];
  if (records.length !== 1) {
    throw new Error(`Axie rest pose expected one ${nodeName}; found ${records.length}.`);
  }
  const record = records[0];
  return {
    matrix: worlds.get(record.path)!.clone(),
    sourcePath: record.path,
  };
}

/** Resolve one unique authoritative rest-pose node in runtime handedness. */
export function buildAxieConvertedRestWorldBasis(
  restPose: AxieExporterRestPoseV1,
  nodeName: string,
): AxieConvertedRestWorldBasis {
  const source = buildAxieUnityRestWorldBasis(restPose, nodeName);
  return {
    matrix: UNITY_TO_GLTF_HANDEDNESS.clone()
      .multiply(source.matrix)
      .multiply(UNITY_TO_GLTF_HANDEDNESS),
    sourcePath: source.sourcePath,
  };
}

export interface AxieAddonBoneBasis {
  /** Exact local matrix needed before a Unity-authored, X-conjugated prefab. */
  readonly bridgeMatrix: THREE.Matrix4;
  /**
   * Correction placed before ThreeAddonPrefabFactory's authored unit bridge.
   * This is identity for the regular bodies and also preserves Frosty's
   * source-specific attachment offsets/rotations instead of assuming them.
   */
  readonly factoryCorrectionMatrix: THREE.Matrix4;
  readonly sourcePath: string;
  readonly reconstructionError: number;
}

/**
 * Solves an add-on attachment from the authoritative Unity prefab rest pose
 * and the actual converted GLB bone. Blender's export mirrors local X and
 * retains centimeter-valued bone locals under Model's 0.01 scale, but that
 * convenient 100x shortcut is not exact for every body (notably Frosty).
 *
 * The solved bridge B satisfies, mechanically:
 *
 *   G_bone * B = H * U_bone * H
 *
 * where H mirrors X, U is the Unity rest-world matrix, and G is the converted
 * GLB rest-world matrix relative to the selected body root's parent.
 */
export function buildAxieAddonBoneBasis(
  bodyRoot: THREE.Object3D,
  restPose: AxieExporterRestPoseV1,
  attachBone: THREE.Object3D,
  factoryUnitScale = 100,
): AxieAddonBoneBasis {
  if (bodyRoot.name !== restPose.rootName) {
    throw new Error(`Axie add-on basis expects root ${restPose.rootName}; received ${bodyRoot.name}.`);
  }
  if (!isDescendantOf(attachBone, bodyRoot)) {
    throw new Error(`Axie add-on attach node ${attachBone.name} is outside body root ${bodyRoot.name}.`);
  }
  if (!Number.isFinite(factoryUnitScale) || factoryUnitScale <= 0) {
    throw new Error(`Axie add-on factory unit scale is invalid: ${factoryUnitScale}.`);
  }

  const source = buildAxieConvertedRestWorldBasis(restPose, attachBone.name);

  bodyRoot.updateWorldMatrix(true, true);
  const rootParentWorldInverse = bodyRoot.parent
    ? bodyRoot.parent.matrixWorld.clone().invert()
    : new THREE.Matrix4();
  const targetWorld = rootParentWorldInverse.multiply(attachBone.matrixWorld);
  const expectedWorld = source.matrix;
  const bridgeMatrix = targetWorld.clone().invert().multiply(expectedWorld);
  const factoryCorrectionMatrix = bridgeMatrix.clone()
    .multiply(new THREE.Matrix4().makeScale(
      1 / factoryUnitScale,
      1 / factoryUnitScale,
      1 / factoryUnitScale,
    ));
  const reconstructed = targetWorld.clone().multiply(bridgeMatrix);
  const reconstructionError = matrixMaxError(reconstructed, expectedWorld);
  if (!Number.isFinite(reconstructionError) || reconstructionError > 1e-5) {
    throw new Error(
      `Axie add-on basis for ${attachBone.name} failed reconstruction (${reconstructionError}).`,
    );
  }
  return {
    bridgeMatrix,
    factoryCorrectionMatrix,
    sourcePath: source.sourcePath,
    reconstructionError,
  };
}
