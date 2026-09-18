import * as THREE from 'three';
import type { AxieExporterRestPoseV1 } from './exporter-schema';
import { buildAxieAddonBoneBasis } from './addon-basis';

const UNITY_TO_GLTF_HANDEDNESS = new THREE.Matrix4().makeScale(-1, 1, 1);

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

function sceneRootOf(node: THREE.Object3D) {
  let root = node;
  while (root.parent) root = root.parent;
  return root;
}

export interface AxiePartAttachmentBasis {
  /** Local matrix assigned to the cloned rigid part under Root_*_JNT. */
  readonly localMatrix: THREE.Matrix4;
  /** Standalone part FBX/glTF export basis retained above its selected mesh. */
  readonly partExportMatrix: THREE.Matrix4;
  /** Exact GLB-bone-local bridge into X-reflected Unity coordinates. */
  readonly attachBridgeMatrix: THREE.Matrix4;
  /**
   * Converts a Unity object-space distance into the standalone GLB mesh's
   * retained object units. Blender keeps source vertices centimeter-valued
   * beneath a uniform 0.01 exporter basis, so this is 100 for every current
   * production rigid-part LOD. Deriving it from the measured hierarchy keeps
   * the shader bridge truthful if that exporter basis ever changes.
   */
  readonly sourceObjectUnitScale: number;
  /** Maps converted GLB geometry coordinates back to Unity renderer object space. */
  readonly unityObjectFromGeometry: THREE.Matrix4;
  readonly sourcePath: string;
  readonly reconstructionError: number;
}

export interface AxieBodyRestPartAttachmentBasis {
  /** Local matrix assigned under the target bone. */
  readonly localMatrix: THREE.Matrix4;
  /** Target bone transform relative to the complete body scene root. */
  readonly attachRestMatrix: THREE.Matrix4;
  /** Canonical source-body socket in exact Unity world coordinates. */
  readonly referenceAttachRestMatrix: THREE.Matrix4;
  /** Source node transform relative to its complete converted GLB scene root. */
  readonly partRestMatrix: THREE.Matrix4;
  /** Part transform after the canonical source socket is retargeted to the target body socket. */
  readonly retargetedPartRestMatrix: THREE.Matrix4;
  readonly sourceObjectUnitScale: number;
  readonly unityObjectFromGeometry: THREE.Matrix4;
  readonly sourcePath: string;
  readonly reconstructionError: number;
}

export interface AxieSocketLocalPartAttachmentBasis {
  /** Unity AxieFactory parents the generated renderer with identity local TRS. */
  readonly localMatrix: THREE.Matrix4;
  /** Authored Unity/FBX meshes use centimeters beneath the body exporter root. */
  readonly sourceObjectUnitScale: number;
  /** No standalone exporter or cross-body shader bridge remains at runtime. */
  readonly unityObjectFromGeometry: THREE.Matrix4;
  readonly sourcePath: string;
  readonly reconstructionError: number;
}

/**
 * Validate the production artifact contract used by Unity's AxieFactory:
 * shared mesh geometry is already socket-local and its new renderer object is
 * identity-local beneath the last matching Root_*_JNT transform.
 */
export function buildAxieSocketLocalPartAttachmentBasis(
  partSourceRoot: THREE.Object3D,
  selectedPartNode: THREE.Object3D,
  objectUnitsPerMeter = 100,
): AxieSocketLocalPartAttachmentBasis {
  if (!isDescendantOf(selectedPartNode, partSourceRoot)) {
    throw new Error(`Axie socket-local part node ${selectedPartNode.name} is outside its source GLB root.`);
  }
  if (!Number.isFinite(objectUnitsPerMeter) || objectUnitsPerMeter <= 0) {
    throw new Error(`Axie socket-local part ${selectedPartNode.name} has invalid object units per meter ${objectUnitsPerMeter}.`);
  }
  selectedPartNode.updateMatrix();
  const identity = new THREE.Matrix4();
  const reconstructionError = matrixMaxError(selectedPartNode.matrix, identity);
  if (!Number.isFinite(reconstructionError) || reconstructionError > 1e-7) {
    throw new Error(
      `Axie socket-local part ${selectedPartNode.name} is not identity-local (${reconstructionError}).`,
    );
  }
  return {
    localMatrix: identity,
    sourceObjectUnitScale: objectUnitsPerMeter,
    unityObjectFromGeometry: new THREE.Matrix4(),
    sourcePath: `socket-local:${selectedPartNode.name}`,
    reconstructionError,
  };
}

/** Recover the reciprocal uniform scale retained by a converted part GLB. */
export function axieSourceObjectUnitScale(exportMatrix: THREE.Matrix4) {
  const elements = exportMatrix.elements;
  const scales = [
    Math.hypot(elements[0], elements[1], elements[2]),
    Math.hypot(elements[4], elements[5], elements[6]),
    Math.hypot(elements[8], elements[9], elements[10]),
  ];
  const minimum = Math.min(...scales);
  const maximum = Math.max(...scales);
  if (!Number.isFinite(minimum) || minimum <= 0 || maximum / minimum > 1.00001) {
    throw new Error(
      `Axie standalone part export basis must have a finite uniform scale; received ${scales.join(', ')}.`,
    );
  }
  return 1 / Math.cbrt(scales[0] * scales[1] * scales[2]);
}

/**
 * Unity creates each rigid MeshRenderer GameObject identity-local beneath the
 * body attach Transform. The shipping part mesh, however, was converted in a
 * standalone FBX/glTF and its exporter basis lives in ancestors above the
 * selected scene node. Dropping those ancestors and attaching identity-local
 * loses that basis (the visible 90-degree/offset bug).
 *
 * The exact replacement is:
 *
 *   L_part = B_attach * C_partExport
 *
 * where B_attach satisfies G_bone * B_attach = H * U_bone * H and
 * C_partExport is measured from the actual standalone part GLB hierarchy.
 */
export function buildAxiePartAttachmentBasis(
  bodyRoot: THREE.Object3D,
  restPose: AxieExporterRestPoseV1,
  attachNode: THREE.Object3D,
  partSourceRoot: THREE.Object3D,
  selectedPartNode: THREE.Object3D,
): AxiePartAttachmentBasis {
  if (!isDescendantOf(attachNode, bodyRoot)) {
    throw new Error(`Axie part attach node ${attachNode.name} is outside body root ${bodyRoot.name}.`);
  }
  if (!isDescendantOf(selectedPartNode, partSourceRoot)) {
    throw new Error(`Axie part node ${selectedPartNode.name} is outside its source GLB root.`);
  }
  const records = restPose.transforms.filter((record) => record.name === attachNode.name);
  if (records.length !== 1) {
    throw new Error(`Axie rest pose expected one ${attachNode.name}; found ${records.length}.`);
  }
  const record = records[0];
  const attachBasis = buildAxieAddonBoneBasis(bodyRoot, restPose, attachNode);

  partSourceRoot.updateWorldMatrix(true, true);
  const sourceParentInverse = partSourceRoot.parent
    ? partSourceRoot.parent.matrixWorld.clone().invert()
    : new THREE.Matrix4();
  const partExportMatrix = sourceParentInverse.multiply(selectedPartNode.matrixWorld);
  const sourceObjectUnitScale = axieSourceObjectUnitScale(partExportMatrix);
  // C_partExport maps converted geometry into the standalone glTF basis. The
  // exporter mirrors X relative to Unity, hence U_object = H * C * G_object.
  const unityObjectFromGeometry = UNITY_TO_GLTF_HANDEDNESS.clone()
    .multiply(partExportMatrix);
  const localMatrix = attachBasis.bridgeMatrix.clone().multiply(partExportMatrix);
  const reconstructed = attachBasis.bridgeMatrix.clone().invert().multiply(localMatrix);
  const reconstructionError = Math.max(
    attachBasis.reconstructionError,
    matrixMaxError(reconstructed, partExportMatrix),
  );
  if (!Number.isFinite(reconstructionError) || reconstructionError > 1e-5) {
    throw new Error(
      `Axie rigid part basis for ${selectedPartNode.name} failed reconstruction (${reconstructionError}).`,
    );
  }
  return {
    localMatrix,
    partExportMatrix,
    attachBridgeMatrix: attachBasis.bridgeMatrix,
    sourceObjectUnitScale,
    unityObjectFromGeometry,
    sourcePath: record.path,
    reconstructionError,
  };
}

/**
 * Attach a rigid surface whose vertices were authored in the whole Axie rest
 * frame. Unity creates the corresponding rigid MeshRenderer identity-local
 * under its socket. If U_r is the source/reference Unity socket, U_t is the
 * target Unity socket, and C is the converted visible part matrix, the exact
 * desired rest world is U_t U_r^-1 C. The actual glTF attach matrix G_t is
 * used only to solve the local matrix G_t^-1 U_t U_r^-1 C. Handedness
 * conjugation belongs to the skeleton bridge, not to visible geometry; using
 * H U H here swaps bilateral surfaces and visibly displaces wide bodies.
 */
export function buildAxieBodyRestPartAttachmentBasis(
  bodyRoot: THREE.Object3D,
  attachNode: THREE.Object3D,
  partSourceRoot: THREE.Object3D,
  selectedPartNode: THREE.Object3D,
  referenceUnityAttachRestMatrix: THREE.Matrix4,
  targetUnityAttachRestMatrix: THREE.Matrix4,
): AxieBodyRestPartAttachmentBasis {
  if (!isDescendantOf(attachNode, bodyRoot)) {
    throw new Error(`Axie body-rest attach node ${attachNode.name} is outside body root ${bodyRoot.name}.`);
  }
  if (!isDescendantOf(selectedPartNode, partSourceRoot)) {
    throw new Error(`Axie body-rest part node ${selectedPartNode.name} is outside its source GLB root.`);
  }
  if (!referenceUnityAttachRestMatrix || !targetUnityAttachRestMatrix) {
    throw new Error(
      `Axie body-rest part ${selectedPartNode.name} requires authoritative source and target rest socket matrices.`,
    );
  }

  const bodySceneRoot = sceneRootOf(bodyRoot);
  bodySceneRoot.updateWorldMatrix(true, true);
  partSourceRoot.updateWorldMatrix(true, true);
  // Final converted vertices are authored in complete-Axie scene coordinates,
  // while the body rig retains an internal FBX exporter basis (including its
  // 0.01 unit scale and axis rotation) above Root_Character. Solve against the
  // complete body scene root, not Root_Character, so the bone-local matrix
  // exactly cancels that internal basis instead of shrinking/rotating the part.
  const attachRestMatrix = bodySceneRoot.matrixWorld.clone()
    .invert()
    .multiply(attachNode.matrixWorld);
  const partRestMatrix = partSourceRoot.matrixWorld.clone()
    .invert()
    .multiply(selectedPartNode.matrixWorld);
  const retargetedPartRestMatrix = targetUnityAttachRestMatrix.clone()
    .multiply(referenceUnityAttachRestMatrix.clone().invert())
    .multiply(partRestMatrix);
  const localMatrix = attachRestMatrix.clone().invert().multiply(retargetedPartRestMatrix);
  const reconstructed = attachRestMatrix.clone().multiply(localMatrix);
  const reconstructionError = matrixMaxError(reconstructed, retargetedPartRestMatrix);
  if (!Number.isFinite(reconstructionError) || reconstructionError > 1e-5) {
    throw new Error(
      `Axie body-rest part basis for ${selectedPartNode.name} failed reconstruction (${reconstructionError}).`,
    );
  }
  return {
    localMatrix,
    attachRestMatrix,
    referenceAttachRestMatrix: referenceUnityAttachRestMatrix.clone(),
    partRestMatrix,
    retargetedPartRestMatrix,
    sourceObjectUnitScale: 1,
    // Final body-rest assets use the regular BaseV4 material family. Their
    // geometry is already expressed in runtime meters, so no legacy Unity
    // standalone-export bridge is required by material shaders.
    unityObjectFromGeometry: new THREE.Matrix4(),
    sourcePath: `body-rest:${selectedPartNode.name}`,
    reconstructionError,
  };
}
