import * as THREE from 'three';

export type AxieAvatarRenderMode = 'unity-skinned-only' | 'complete-character';

/**
 * Source-shaped avatar parameters from AxieAvatarRenderParams.cs.
 *
 * The mutable fields intentionally mirror Unity's serializable parameter object.
 * `viewCenter` is the local camera position despite the source comment calling it
 * a focal point: the implementation passes it as the eye of Matrix4x4.LookAt.
 */
export class AxieAvatarRenderParams {
  width = 128;
  height = 128;
  modelHeading = 180;
  viewCenter = new THREE.Vector3(0, 0.75, 0);
  viewDirection = new THREE.Vector3(-1, -1, -1);

  constructor(values: Partial<AxieAvatarRenderParams> = {}) {
    if (values.width !== undefined) this.width = values.width;
    if (values.height !== undefined) this.height = values.height;
    if (values.modelHeading !== undefined) this.modelHeading = values.modelHeading;
    if (values.viewCenter !== undefined) this.viewCenter.copy(values.viewCenter);
    if (values.viewDirection !== undefined) this.viewDirection.copy(values.viewDirection);
  }
}

export interface AxieAvatarRenderOptions extends Partial<AxieAvatarRenderParams> {
  /**
   * Unity compatibility excludes the generated rigid MeshRenderer parts because
   * AxieCharacter3D.RenderAvatar enumerates SkinnedMeshRenderer only. The complete
   * mode is the explicit corrected production option.
   */
  readonly mode?: AxieAvatarRenderMode;
}

export interface AxieAvatarRenderResult {
  readonly target: THREE.WebGLRenderTarget;
  readonly camera: THREE.OrthographicCamera;
  readonly mode: AxieAvatarRenderMode;
  readonly renderedObjects: number;
  readonly omittedObjects: number;
}

function normalizedParams(values: AxieAvatarRenderOptions) {
  const params = new AxieAvatarRenderParams(values);
  // Unity explicitly rejects only zero. Negative values are deliberately allowed
  // to reach the render-target implementation for observable source compatibility.
  if (params.width === 0) throw new Error('Render width cannot be zero!');
  if (params.height === 0) throw new Error('Render height cannot be zero!');
  return params;
}

/** Exact camera construction for the source local-space LookAt + Ortho contract. */
export function createAxieAvatarCamera(
  root: THREE.Object3D,
  options: AxieAvatarRenderOptions = {},
) {
  const params = normalizedParams(options);
  const aspect = params.height / params.width;
  const camera = new THREE.OrthographicCamera(-1, 1, aspect, -aspect, -2, 2);
  root.updateWorldMatrix(true, true);
  camera.position.copy(params.viewCenter).applyMatrix4(root.matrixWorld);
  const target = params.viewCenter.clone().add(params.viewDirection).applyMatrix4(root.matrixWorld);
  camera.up.set(0, 1, 0).transformDirection(root.matrixWorld);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  camera.userData.axieAvatar = {
    width: params.width,
    height: params.height,
    modelHeading: params.modelHeading,
    aspect,
  };
  return camera;
}

function isRenderable(node: THREE.Object3D) {
  const renderable = node as THREE.Object3D & {
    isMesh?: boolean;
    isPoints?: boolean;
    isLine?: boolean;
    isSprite?: boolean;
  };
  return !!(renderable.isMesh || renderable.isPoints || renderable.isLine || renderable.isSprite);
}

/**
 * Render the already assembled character into a caller-owned target.
 *
 * Renderer, model rotation and visibility state are restored in `finally`, so an
 * avatar capture cannot perturb the live playable character even if rendering
 * throws. The renderer uses the character's owned materials without cloning.
 */
export function renderAxieAvatar(
  renderer: THREE.WebGLRenderer,
  root: THREE.Object3D,
  target: THREE.WebGLRenderTarget,
  options: AxieAvatarRenderOptions = {},
): AxieAvatarRenderResult {
  const params = normalizedParams(options);
  const mode = options.mode ?? 'unity-skinned-only';
  if (target.width !== params.width || target.height !== params.height) {
    // WebGLRenderTarget.setSize disposes/recreates its GPU allocation when changed,
    // matching Unity's Release -> resize -> Create lifecycle.
    target.setSize(params.width, params.height);
  }

  const originalQuaternion = root.quaternion.clone();
  const originalRotationOrder = root.rotation.order;
  const hidden: Array<{ object: THREE.Object3D; visible: boolean }> = [];
  let renderedObjects = 0;
  let omittedObjects = 0;
  const previousTarget = renderer.getRenderTarget();
  const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousClearAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;

  try {
    root.rotation.set(0, THREE.MathUtils.degToRad(params.modelHeading), 0, originalRotationOrder);
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
      if (!isRenderable(node)) return;
      const skinned = (node as THREE.SkinnedMesh).isSkinnedMesh === true;
      if (mode === 'unity-skinned-only' && !skinned) {
        hidden.push({ object: node, visible: node.visible });
        node.visible = false;
        omittedObjects += 1;
      } else if (node.visible) {
        renderedObjects += 1;
      }
    });

    const camera = createAxieAvatarCamera(root, params);
    renderer.autoClear = false;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, true);
    renderer.render(root, camera);
    return { target, camera, mode, renderedObjects, omittedObjects };
  } finally {
    hidden.forEach(({ object, visible }) => { object.visible = visible; });
    root.quaternion.copy(originalQuaternion);
    root.updateWorldMatrix(true, true);
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousClearColor, previousClearAlpha);
    renderer.autoClear = previousAutoClear;
  }
}
