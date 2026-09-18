/**
 * Engine-neutral facade for the source URP renderer feature. It preserves the
 * feature/pass API and command ordering without implementing the shader itself.
 */

export const AXIE_OUTLINE_POST_PROCESS_SHADER_NAME = 'Axie Mixer 3D/Outline/PostProcess' as const;
export const AXIE_OUTLINE_INPUTS = Object.freeze(['Normal', 'Depth'] as const);

export type AxieOutlineColor = readonly [r: number, g: number, b: number, a: number];
export type AxieOutlineRenderPassEvent = 'AfterRenderingPostProcessing' | string | number;

export class OutlinePostProcessSettings {
  outlineColor: AxieOutlineColor = [0, 0, 0, 1];
  thickness = 1;
  depthScale = 50;
  depthBias = 50;
  normalScale = 0.7;
  normalBias = 10;
  renderPassEvent: AxieOutlineRenderPassEvent = 'AfterRenderingPostProcessing';

  constructor(values: Partial<OutlinePostProcessSettings> = {}) {
    if (values.outlineColor) this.outlineColor = [...values.outlineColor] as AxieOutlineColor;
    if (values.thickness !== undefined) this.thickness = Math.trunc(values.thickness);
    if (values.depthScale !== undefined) this.depthScale = values.depthScale;
    if (values.depthBias !== undefined) this.depthBias = values.depthBias;
    if (values.normalScale !== undefined) this.normalScale = values.normalScale;
    if (values.normalBias !== undefined) this.normalBias = values.normalBias;
    if (values.renderPassEvent !== undefined) this.renderPassEvent = values.renderPassEvent;
  }
}

export interface AxieOutlineMaterialCompatibility {
  setFloat(name: string, value: number): void;
  setColor(name: string, value: AxieOutlineColor): void;
  dispose?(): void;
}

export interface AxieOutlineRendererCompatibility {
  enqueuePass(pass: OutlinePass): void;
}

export interface AxieOutlineRenderingDataCompatibility {
  readonly cameraType: string;
  readonly cameraColorTarget: unknown;
}

export interface AxieOutlineCommandCompatibility {
  readonly name: 'AxieMixer3D.OutlinePostProcessRendererFeature';
  readonly source: 'None';
  readonly target: unknown;
  readonly material: AxieOutlineMaterialCompatibility;
  readonly materialPass: 0;
}

export interface AxieOutlineCommandContextCompatibility {
  executeCommand(command: AxieOutlineCommandCompatibility): void;
  releaseCommand?(command: AxieOutlineCommandCompatibility): void;
}

export class OutlinePass {
  renderPassEvent: AxieOutlineRenderPassEvent = 'AfterRenderingPostProcessing';
  configuredInputs: readonly ('Normal' | 'Depth')[] = [];

  constructor(readonly material: AxieOutlineMaterialCompatibility) {}

  ConfigureInput(inputs: readonly ('Normal' | 'Depth')[]) {
    this.configuredInputs = Object.freeze([...inputs]);
  }

  Execute(
    context: AxieOutlineCommandContextCompatibility,
    renderingData: AxieOutlineRenderingDataCompatibility,
  ) {
    const command: AxieOutlineCommandCompatibility = Object.freeze({
      name: 'AxieMixer3D.OutlinePostProcessRendererFeature',
      source: 'None',
      target: renderingData.cameraColorTarget,
      material: this.material,
      materialPass: 0,
    });
    try {
      context.executeCommand(command);
    } finally {
      context.releaseCommand?.(command);
    }
    return command;
  }
}

export class OutlinePostProcessRendererFeature {
  static readonly Settings = OutlinePostProcessSettings;
  static readonly OutlinePass = OutlinePass;
  static readonly ShaderName = AXIE_OUTLINE_POST_PROCESS_SHADER_NAME;

  readonly settings: OutlinePostProcessSettings;
  material: AxieOutlineMaterialCompatibility | undefined;
  outlinePass: OutlinePass | undefined;

  constructor(
    settings: OutlinePostProcessSettings | Partial<OutlinePostProcessSettings> = {},
    readonly createMaterial: (
      shaderName: typeof AXIE_OUTLINE_POST_PROCESS_SHADER_NAME,
    ) => AxieOutlineMaterialCompatibility = () => {
      throw new Error('An outline material factory is required in the browser runtime.');
    },
  ) {
    this.settings = settings instanceof OutlinePostProcessSettings
      ? settings
      : new OutlinePostProcessSettings(settings);
  }

  Create() {
    this.material = this.createMaterial(AXIE_OUTLINE_POST_PROCESS_SHADER_NAME);
    this.outlinePass = new OutlinePass(this.material);
    return this.outlinePass;
  }

  AddRenderPasses(
    renderer: AxieOutlineRendererCompatibility,
    renderingData: AxieOutlineRenderingDataCompatibility,
  ) {
    if (!this.material || !this.outlinePass || renderingData.cameraType === 'Preview') return false;
    this.material.setFloat('_Thickness', this.settings.thickness);
    this.material.setColor('_Color', this.settings.outlineColor);
    this.material.setFloat('_DepthScale', this.settings.depthScale);
    this.material.setFloat('_DepthBias', this.settings.depthBias);
    this.material.setFloat('_NormalScale', this.settings.normalScale);
    this.material.setFloat('_NormalBias', this.settings.normalBias);
    this.outlinePass.renderPassEvent = this.settings.renderPassEvent;
    this.outlinePass.ConfigureInput(AXIE_OUTLINE_INPUTS);
    renderer.enqueuePass(this.outlinePass);
    return true;
  }

  Dispose(disposing = true) {
    if (disposing) this.material?.dispose?.();
    this.material = undefined;
    this.outlinePass = undefined;
  }
}
