import * as THREE from 'three';
import {
  AxieAvatarRenderParams,
} from './avatar';
import {
  AxieCharacter3D,
  type AxieCharacter3DFactory,
} from './character3d';
import type { AxieDescriptor } from './domain';

export interface AxieCharacter3DBehaviourOptions {
  readonly renderer: THREE.WebGLRenderer;
  readonly transform?: THREE.Group;
  readonly factory?: AxieCharacter3DFactory;
  readonly createRenderTarget?: () => THREE.WebGLRenderTarget;
}

/** ARGB32-equivalent RGBA8 target with an explicit unsigned 16-bit depth texture. */
export function createAxieAvatarRenderTarget() {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  target.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedShortType);
  target.depthTexture.format = THREE.DepthFormat;
  target.texture.name = 'AxieAvatar:ARGB32';
  target.depthTexture.name = 'AxieAvatar:Depth16';
  target.texture.userData.axieAvatarFormat = 'ARGB32';
  target.depthTexture.userData.axieAvatarDepthBits = 16;
  return target;
}

/** Async browser equivalent of the Unity lifecycle component. */
export class AxieCharacter3DBehaviour {
  axieGenes = '';
  axieDescriptor: AxieDescriptor = {
    colorVariant: 0,
    body: 'normal',
    parts: [],
  };
  avatarRenderParams: AxieAvatarRenderParams[] = [];
  readonly transform: THREE.Group;
  readonly #renderer: THREE.WebGLRenderer;
  readonly #factory?: AxieCharacter3DFactory;
  readonly #createRenderTarget: () => THREE.WebGLRenderTarget;
  #character: AxieCharacter3D | null = null;
  #avatars: THREE.WebGLRenderTarget[] = [];
  #revision = 0;
  #disposed = false;

  constructor(options: AxieCharacter3DBehaviourOptions) {
    this.#renderer = options.renderer;
    this.transform = options.transform ?? new THREE.Group();
    this.#factory = options.factory;
    this.#createRenderTarget = options.createRenderTarget ?? createAxieAvatarRenderTarget;
  }

  get Character() {
    return this.#character;
  }

  get Avatars(): readonly THREE.WebGLRenderTarget[] {
    return this.#avatars;
  }

  get disposed() {
    return this.#disposed;
  }

  async Start() {
    if (!this.#character) return this.Rebuild();
    return this.#character;
  }

  /** @deprecated Use Rebuild(). */
  Refresh() {
    return this.Rebuild();
  }

  async Rebuild() {
    if (this.#disposed) throw new Error('AxieCharacter3DBehaviour is disposed.');
    const revision = ++this.#revision;
    this.#cleanup();
    const genes = this.axieGenes;
    let character: AxieCharacter3D | undefined;
    const avatars: THREE.WebGLRenderTarget[] = [];
    try {
      const created = genes.trim()
        ? await (this.#factory
          ? this.#factory.createFromGenes(genes)
          : AxieCharacter3D.FromGenes(genes))
        : await (this.#factory
          ? this.#factory.createFromDescriptor(this.axieDescriptor)
          : AxieCharacter3D.FromDescriptor(this.axieDescriptor));
      // AxieFactory.CreateCharacter returns null for a missing body. Unity's
      // component then fails when it dereferences Character.Root; keep the
      // static factory nullable while surfacing the component failure clearly.
      if (!created) {
        throw new Error(`Cannot rebuild AxieCharacter3DBehaviour: body ${this.axieDescriptor.body} is missing.`);
      }
      character = created;
      if (this.#disposed || revision !== this.#revision) {
        character.dispose();
        return null;
      }
      if (genes.trim()) this.axieDescriptor = character.descriptor;
      this.#character = character;
      // Object3D.add keeps the root's local transform while changing its
      // parent, which is the Three.js equivalent of SetParent(transform,
      // worldPositionStays: false).
      this.transform.add(character.Root);

      // Intentionally do not normalize a runtime null: Unity's Select call throws.
      for (const renderParams of this.avatarRenderParams) {
        const avatar = this.#createRenderTarget();
        avatars.push(avatar);
        character.RenderAvatar(this.#renderer, avatar, renderParams);
      }
      if (this.#disposed || revision !== this.#revision) {
        avatars.forEach((avatar) => avatar.dispose());
        character.dispose();
        return null;
      }
      this.#avatars = avatars;
      return character;
    } catch (error) {
      avatars.forEach((avatar) => avatar.dispose());
      if (this.#character === character) this.#character = null;
      character?.dispose();
      throw error;
    }
  }

  OnDestroy() {
    this.dispose();
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#revision += 1;
    this.#cleanup();
  }

  #cleanup() {
    this.#character?.dispose();
    this.#character = null;
    this.#avatars.forEach((avatar) => avatar.dispose());
    this.#avatars = [];
  }
}
