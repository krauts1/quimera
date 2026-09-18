import * as THREE from 'three';
import {
  AXIE_MIXER_V4_MATERIAL_FACTORY,
} from './base-v4-material';
import type { AxieShaderFidelity, AxieJsonValue } from './manifest';
import type { AxieMaterialContext, AxieMaterialFactory } from './runtime';
import { AXIE_UNITY_COLOR_SPACE } from './unity-gamma';

export const AXIE_MIXER_V4_SHADER_ID = 'ac091e58a97d048649b904d4e60d5aea';
export const AXIE_MIXER_V4_SHADER_NAME = 'AxieMixer3D/S_Axie_Mixer_V4';

export interface AxieRuntimeMaterialBundle {
  readonly surface: THREE.Material;
  readonly outline?: THREE.Material;
  readonly depth?: THREE.Material;
  readonly distance?: THREE.Material;
  /** Whether the source shader family authors a ShadowCaster-equivalent pass. */
  readonly castShadow?: boolean;
  readonly fidelity: AxieShaderFidelity;
  readonly fallbackUsed: boolean;
}

export interface AxieMaterialBundleFactory extends AxieMaterialFactory {
  createBundle(context: AxieMaterialContext): AxieRuntimeMaterialBundle;
}

export class UnsupportedAxieShaderError extends Error {
  readonly name = 'UnsupportedAxieShaderError';

  constructor(
    readonly materialId: string,
    readonly shaderId: string,
    readonly shaderName: string,
  ) {
    super(
      `Axie material ${materialId} uses ${shaderName || shaderId}; register its exact Three.js shader extension before rendering it.`,
    );
  }
}

function tuple(value: AxieJsonValue | undefined, length: number): number[] | undefined {
  if (!Array.isArray(value) || value.length < length) return undefined;
  const numbers = value.slice(0, length).map((item) => typeof item === 'number' ? item : Number.NaN);
  return numbers.every(Number.isFinite) ? numbers : undefined;
}

function numberProperty(value: AxieJsonValue | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function mainTextureTransform(context: AxieMaterialContext) {
  const explicit = tuple(context.material.properties._MainTex_ST, 4)
    ?? tuple(context.material.properties.mainTexTransform, 4);
  if (explicit) return new THREE.Vector4(explicit[0], explicit[1], explicit[2], explicit[3]);
  const mainTex = context.material.properties._MainTex;
  if (mainTex && typeof mainTex === 'object' && !Array.isArray(mainTex)) {
    const record = mainTex as { readonly [key: string]: AxieJsonValue };
    const scale = tuple(record.scale, 2);
    const offset = tuple(record.offset, 2);
    if (scale && offset) return new THREE.Vector4(scale[0], scale[1], offset[0], offset[1]);
  }
  return new THREE.Vector4(1, 1, 0, 0);
}

function isBaseV4(context: AxieMaterialContext) {
  const shader = context.manifest.assets.shaders[context.material.shaderId];
  return context.material.shaderId === AXIE_MIXER_V4_SHADER_ID
    || shader?.sourceName === AXIE_MIXER_V4_SHADER_NAME
    || /(?:^|\/)S_Axie_Mixer_V4$/i.test(shader?.sourceName ?? '')
    || /axie[-_ ]?mixer[-_ ]?v4/i.test(shader?.runtimeImplementation ?? '');
}

/** Exact base-V4 implementation; every Mystic/VFX shader is an extension point. */
export class ExactAxieBaseV4MaterialFactory implements AxieMaterialBundleFactory {
  create(context: AxieMaterialContext) {
    this.#assertSupported(context);
    const map = this.#mainTexture(context);
    const material = AXIE_MIXER_V4_MATERIAL_FACTORY.createSurface({
      map,
      primaryColor: context.primaryColor,
      secondaryColor: context.secondaryColor,
      gammaSpace: AXIE_UNITY_COLOR_SPACE === 'gamma',
      alphaClipEnabled: context.material.keywords.includes('_ALPHATEST_ON'),
      mainTexTransform: mainTextureTransform(context),
      alphaMaskCutoff: context.material.renderState.alphaCutoff,
      name: context.material.sourceName,
    });
    return material;
  }

  createGeometryOutline(context: AxieMaterialContext) {
    this.#assertSupported(context);
    if (!context.material.geometryOutline.enabled || context.quality.outlineMode !== 'unity-geometry') {
      return undefined;
    }
    const [r, g, b] = context.material.geometryOutline.color;
    const material = AXIE_MIXER_V4_MATERIAL_FACTORY.createOutline({
      thickness: context.material.geometryOutline.thickness,
      color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
      name: `${context.material.sourceName}:ExtraPrePass`,
    });
    return material;
  }

  createBundle(context: AxieMaterialContext): AxieRuntimeMaterialBundle {
    this.#assertSupported(context);
    const [r, g, b] = context.material.geometryOutline.color;
    const bundle = AXIE_MIXER_V4_MATERIAL_FACTORY.createBundle({
      map: this.#mainTexture(context),
      primaryColor: context.primaryColor,
      secondaryColor: context.secondaryColor,
      gammaSpace: AXIE_UNITY_COLOR_SPACE === 'gamma',
      alphaClipEnabled: context.material.keywords.includes('_ALPHATEST_ON'),
      mainTexTransform: mainTextureTransform(context),
      alphaMaskCutoff: numberProperty(
        context.material.properties._AlphaCutoff,
        context.material.renderState.alphaCutoff,
      ),
      name: context.material.sourceName,
    }, {
      enabled: context.material.geometryOutline.enabled
        && context.quality.outlineMode === 'unity-geometry',
      thickness: context.material.geometryOutline.thickness,
      color: new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace),
      name: `${context.material.sourceName}:ExtraPrePass`,
    });
    return { ...bundle, castShadow: true, fidelity: 'exact', fallbackUsed: false };
  }

  #mainTexture(context: AxieMaterialContext) {
    const textureId = context.material.textures._MainTex;
    const map = textureId ? context.textures[textureId] : undefined;
    if (!map) throw new Error(`Base V4 material ${context.material.id} is missing _MainTex.`);
    return map;
  }

  #assertSupported(context: AxieMaterialContext) {
    if (isBaseV4(context)) return;
    const shader = context.manifest.assets.shaders[context.material.shaderId];
    throw new UnsupportedAxieShaderError(
      context.material.id,
      context.material.shaderId,
      shader?.sourceName ?? '',
    );
  }
}

export const AXIE_EXACT_BASE_V4_MATERIAL_FACTORY: AxieMaterialBundleFactory = Object.freeze(
  new ExactAxieBaseV4MaterialFactory(),
);

export function hasAxieMaterialBundleFactory(
  factory: AxieMaterialFactory,
): factory is AxieMaterialBundleFactory {
  return typeof (factory as Partial<AxieMaterialBundleFactory>).createBundle === 'function';
}
