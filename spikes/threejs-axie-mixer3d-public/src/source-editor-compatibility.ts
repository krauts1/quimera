import type * as THREE from 'three';
import type { AxieAvatarRenderOptions } from './avatar';
import type { AxieDescriptor } from './domain';
import {
  AxieDescriptorCompatibility,
  AxieMixerConfigCompatibility,
  importAxieMixerConfigJson,
} from './source-compatibility';

/** Same-origin server endpoint shipped by this repository. */
export const AXIE_GENES_API_ENDPOINT = '/api/axies/{id}' as const;
/** @deprecated Use AXIE_GENES_API_ENDPOINT. This alias no longer points at GraphQL. */
export const AXIE_GENES_GRAPHQL_URL = AXIE_GENES_API_ENDPOINT;

export class AxieGenesFetchRequest {
  constructor(public query = '') {}
}

export class AxieGenesDecoderAxie {
  constructor(public newGenes: string | null = null) {}
}

export class AxieGenesDecoderData {
  constructor(public axie: AxieGenesDecoderAxie | null = null) {}
}

export class AxieGenesFetchResponse {
  constructor(public data = new AxieGenesDecoderData()) {}
}

export interface AxieGenesFetchResult {
  readonly ok: boolean;
  json(): Promise<unknown>;
}

export type AxieGenesFetch = (
  input: string,
  init: RequestInit,
) => Promise<AxieGenesFetchResult>;

function responseGenes(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const directGenes = (value as { newGenes?: unknown; genes?: unknown }).newGenes
    ?? (value as { genes?: unknown }).genes;
  if (typeof directGenes === 'string') return directGenes;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return undefined;
  const axie = (data as { axie?: unknown }).axie;
  if (!axie || typeof axie !== 'object') return undefined;
  const genes = (axie as { newGenes?: unknown }).newGenes;
  return typeof genes === 'string' ? genes : undefined;
}

/** Browser editor/debug facade for the source AxieGenesDecoder window. */
export class AxieGenesDecoderEditor {
  id = 0;
  genes = '';
  descriptor = new AxieDescriptorCompatibility();
  readonly fetchGenes: AxieGenesFetch;

  constructor(fetchGenes: AxieGenesFetch = (input, init) => fetch(input, init)) {
    this.fetchGenes = fetchGenes;
  }

  static Open(fetchGenes?: AxieGenesFetch) {
    return new AxieGenesDecoderEditor(fetchGenes);
  }

  BuildRequest(id = this.id) {
    return new AxieGenesFetchRequest(
      `{ axie (axieId: "${Math.trunc(id)}") { id, genes, newGenes } }`,
    );
  }

  DecodeGenes(genes = this.genes) {
    this.genes = genes;
    this.descriptor = AxieDescriptorCompatibility.FromGenes(genes);
    return this.descriptor;
  }

  async FetchGenes(id = this.id) {
    this.id = Math.trunc(id);
    const endpoint = AXIE_GENES_API_ENDPOINT.replace('{id}', encodeURIComponent(String(this.id)));
    const response = await this.fetchGenes(endpoint, {
      method: 'GET',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    const newGenes = responseGenes(await response.json());
    if (newGenes === undefined) return undefined;
    this.genes = newGenes;
    return this.DecodeGenes(newGenes);
  }
}

/** Browser import adapter for Unity's ScriptedImporter/JsonUtility projection. */
export class AxieMixerConfigImporter {
  OnImportAsset(json: string): AxieMixerConfigCompatibility {
    return importAxieMixerConfigJson(json);
  }
}

export interface AxieAvatarPreviewCharacter {
  RenderAvatar?(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions,
  ): unknown;
  renderAvatar?(
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions,
  ): unknown;
}

export interface AxieAvatarPreviewSelection {
  readonly active: boolean;
  readonly character?: AxieAvatarPreviewCharacter;
  readonly cachedAvatars?: readonly THREE.Texture[];
}

export interface AxieAvatarPreviewResult {
  readonly rendered: boolean;
  readonly renderResult?: unknown;
  readonly cachedAvatars: readonly THREE.Texture[];
  readonly message?: string;
}

/** Continuous creator/debug preview equivalent without coupling it to DOM UI. */
export class AxieAvatarPreview {
  static Open() {
    return new AxieAvatarPreview();
  }

  RenderSelection(
    selection: AxieAvatarPreviewSelection | null | undefined,
    renderer: THREE.WebGLRenderer,
    target: THREE.WebGLRenderTarget,
    options: AxieAvatarRenderOptions,
  ): AxieAvatarPreviewResult {
    if (!selection?.active || !selection.character) {
      return {
        rendered: false,
        cachedAvatars: [],
        message: 'Select an active Axie character to preview its avatar.',
      };
    }
    const render = selection.character.RenderAvatar?.bind(selection.character)
      ?? selection.character.renderAvatar?.bind(selection.character);
    if (!render) {
      return {
        rendered: false,
        cachedAvatars: selection.cachedAvatars ?? [],
        message: 'Selected Axie character does not expose avatar rendering.',
      };
    }
    return {
      rendered: true,
      renderResult: render(renderer, target, options),
      cachedAvatars: selection.cachedAvatars ?? [],
    };
  }
}

export interface AxieCharacterBehaviourCompatibility {
  readonly descriptor?: AxieDescriptor;
  readonly Character?: unknown;
  readonly Avatars?: readonly THREE.Texture[];
}
