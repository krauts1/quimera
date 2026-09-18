import * as THREE from 'three';

const OBJECT_NORMAL_OUTLINE_VERTEX = /* glsl */`
  uniform float uOutlineThickness;
  uniform float uOutlineSourceObjectUnitScale;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
    #include <morphinstance_vertex>
    #include <batching_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    vec3 outlinePositionOS = transformed
      + objectNormal * uOutlineThickness * uOutlineSourceObjectUnitScale;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(outlinePositionOS, 1.0);
  }
`;

const OBJECT_NORMAL_OUTLINE_FRAGMENT = /* glsl */`
  uniform vec3 uOutlineColor;

  void main() {
    gl_FragColor = vec4(uOutlineColor, 1.0);
    #include <colorspace_fragment>
  }
`;

export interface MysticObjectOutlineMaterialOptions {
  readonly thickness: number;
  readonly color: THREE.ColorRepresentation;
  readonly name: string;
}

/** Debuff and Mystic_Final ExtraPrePass: `positionOS + normalOS * _outline`. */
export class MysticObjectOutlineMaterial extends THREE.ShaderMaterial {
  readonly source = 'mystic-object-normal-extra-prepass';

  constructor(options: MysticObjectOutlineMaterialOptions) {
    super({
      name: options.name,
      vertexShader: OBJECT_NORMAL_OUTLINE_VERTEX,
      fragmentShader: OBJECT_NORMAL_OUTLINE_FRAGMENT,
      uniforms: {
        uOutlineThickness: { value: options.thickness },
        uOutlineSourceObjectUnitScale: { value: 1 },
        uOutlineColor: { value: new THREE.Color(options.color) },
      },
      side: THREE.BackSide,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: true,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    });
  }
}

const CEL_FRESNEL_OUTLINE_VERTEX = /* glsl */`
  uniform float uOutlineThickness;
  uniform float uOutlineSourceObjectUnitScale;
  uniform float uMysticCameraIsOrthographic;
  uniform vec3 uMysticCameraViewDirectionWS;

  varying float vCelEyeDepth;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
    #include <morphinstance_vertex>
    #include <batching_vertex>
    #include <beginnormal_vertex>
    #include <morphnormal_vertex>
    #include <skinbase_vertex>
    #include <skinnormal_vertex>
    #include <defaultnormal_vertex>
    #include <begin_vertex>
    #include <morphtarget_vertex>
    #include <skinning_vertex>

    vec4 sourceWorldPosition = modelMatrix * vec4(transformed, 1.0);
    vec3 normalWS = inverseTransformDirection(normalize(transformedNormal), viewMatrix);
    vec3 viewDirectionWS = uMysticCameraIsOrthographic > 0.5
      ? normalize(uMysticCameraViewDirectionWS)
      : normalize(cameraPosition - sourceWorldPosition.xyz);
    float fresnel = pow(1.0 - dot(normalWS, viewDirectionWS), 5.0);
    float extrusion = clamp(clamp(fresnel, 0.0, 1.0) * uOutlineThickness, 0.0, 1.0);
    vec3 outlinePositionOS = transformed
      + objectNormal * extrusion * uOutlineSourceObjectUnitScale;
    vec4 sourceViewPosition = viewMatrix * sourceWorldPosition;
    vCelEyeDepth = -sourceViewPosition.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(outlinePositionOS, 1.0);
  }
`;

const CEL_FRESNEL_OUTLINE_FRAGMENT = /* glsl */`
  uniform vec3 uOutlineColor;
  uniform float uAlphaClipEnabled;
  uniform float uMysticCameraNear;
  uniform float uCelLength;
  uniform float uCelOffset;

  varying float vCelEyeDepth;

  float dither8x8Bayer(vec2 pixelPosition) {
    float x = mod(floor(pixelPosition.x), 8.0);
    float y = mod(floor(pixelPosition.y), 8.0);
    if (y < 0.5) {
      if (x < 0.5) return 1.0 / 64.0; if (x < 1.5) return 49.0 / 64.0;
      if (x < 2.5) return 13.0 / 64.0; if (x < 3.5) return 61.0 / 64.0;
      if (x < 4.5) return 4.0 / 64.0; if (x < 5.5) return 52.0 / 64.0;
      if (x < 6.5) return 16.0 / 64.0; return 64.0 / 64.0;
    }
    if (y < 1.5) {
      if (x < 0.5) return 33.0 / 64.0; if (x < 1.5) return 17.0 / 64.0;
      if (x < 2.5) return 45.0 / 64.0; if (x < 3.5) return 29.0 / 64.0;
      if (x < 4.5) return 36.0 / 64.0; if (x < 5.5) return 20.0 / 64.0;
      if (x < 6.5) return 48.0 / 64.0; return 32.0 / 64.0;
    }
    if (y < 2.5) {
      if (x < 0.5) return 9.0 / 64.0; if (x < 1.5) return 57.0 / 64.0;
      if (x < 2.5) return 5.0 / 64.0; if (x < 3.5) return 53.0 / 64.0;
      if (x < 4.5) return 12.0 / 64.0; if (x < 5.5) return 60.0 / 64.0;
      if (x < 6.5) return 8.0 / 64.0; return 56.0 / 64.0;
    }
    if (y < 3.5) {
      if (x < 0.5) return 41.0 / 64.0; if (x < 1.5) return 25.0 / 64.0;
      if (x < 2.5) return 37.0 / 64.0; if (x < 3.5) return 21.0 / 64.0;
      if (x < 4.5) return 44.0 / 64.0; if (x < 5.5) return 28.0 / 64.0;
      if (x < 6.5) return 40.0 / 64.0; return 24.0 / 64.0;
    }
    if (y < 4.5) {
      if (x < 0.5) return 3.0 / 64.0; if (x < 1.5) return 51.0 / 64.0;
      if (x < 2.5) return 15.0 / 64.0; if (x < 3.5) return 63.0 / 64.0;
      if (x < 4.5) return 2.0 / 64.0; if (x < 5.5) return 50.0 / 64.0;
      if (x < 6.5) return 14.0 / 64.0; return 62.0 / 64.0;
    }
    if (y < 5.5) {
      if (x < 0.5) return 35.0 / 64.0; if (x < 1.5) return 19.0 / 64.0;
      if (x < 2.5) return 47.0 / 64.0; if (x < 3.5) return 31.0 / 64.0;
      if (x < 4.5) return 34.0 / 64.0; if (x < 5.5) return 18.0 / 64.0;
      if (x < 6.5) return 46.0 / 64.0; return 30.0 / 64.0;
    }
    if (y < 6.5) {
      if (x < 0.5) return 11.0 / 64.0; if (x < 1.5) return 59.0 / 64.0;
      if (x < 2.5) return 7.0 / 64.0; if (x < 3.5) return 55.0 / 64.0;
      if (x < 4.5) return 10.0 / 64.0; if (x < 5.5) return 58.0 / 64.0;
      if (x < 6.5) return 6.0 / 64.0; return 54.0 / 64.0;
    }
    if (x < 0.5) return 43.0 / 64.0; if (x < 1.5) return 27.0 / 64.0;
    if (x < 2.5) return 39.0 / 64.0; if (x < 3.5) return 23.0 / 64.0;
    if (x < 4.5) return 42.0 / 64.0; if (x < 5.5) return 26.0 / 64.0;
    if (x < 6.5) return 38.0 / 64.0; return 22.0 / 64.0;
  }

  void main() {
    float numerator = vCelEyeDepth - uMysticCameraNear - uCelOffset;
    float depthFade = abs(uCelLength) < 0.000001
      ? step(0.0, numerator)
      : clamp(numerator / uCelLength, 0.0, 1.0);
    float alpha = step(
      dither8x8Bayer(gl_FragCoord.xy),
      clamp(depthFade * 1.00001, 0.0, 1.0)
    );
    if (uAlphaClipEnabled > 0.5 && alpha < 0.5) discard;
    gl_FragColor = vec4(uOutlineColor, alpha);
    #include <colorspace_fragment>
  }
`;

export interface MysticCelOutlineMaterialOptions {
  readonly thickness: number;
  readonly alphaClipEnabled: boolean;
  readonly length: number;
  readonly offset: number;
  readonly name: string;
}

/** CEL ExtraPrePass: Fresnel-scaled object-normal extrusion and camera-depth Bayer alpha. */
export class MysticCelOutlineMaterial extends THREE.ShaderMaterial {
  readonly source = 'cel-fresnel-object-normal-extra-prepass';
  readonly #cameraViewDirection = new THREE.Vector3(0, 0, 1);

  constructor(options: MysticCelOutlineMaterialOptions) {
    super({
      name: options.name,
      vertexShader: CEL_FRESNEL_OUTLINE_VERTEX,
      fragmentShader: CEL_FRESNEL_OUTLINE_FRAGMENT,
      uniforms: {
        uOutlineThickness: { value: options.thickness },
        uOutlineSourceObjectUnitScale: { value: 1 },
        uOutlineColor: {
          value: new THREE.Color().setRGB(0.2, 0.2, 0.2, THREE.SRGBColorSpace),
        },
        uAlphaClipEnabled: { value: options.alphaClipEnabled ? 1 : 0 },
        uMysticCameraIsOrthographic: { value: 0 },
        uMysticCameraViewDirectionWS: { value: new THREE.Vector3(0, 0, 1) },
        uMysticCameraNear: { value: 0.1 },
        uCelLength: { value: options.length },
        uCelOffset: { value: options.offset },
      },
      side: THREE.BackSide,
      transparent: false,
      blending: THREE.NoBlending,
      depthTest: true,
      depthWrite: true,
      fog: false,
      toneMapped: false,
    });
  }

  override onBeforeRender(
    _renderer: THREE.WebGLRenderer,
    _scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const perspective = camera as THREE.PerspectiveCamera;
    camera.getWorldDirection(this.#cameraViewDirection).multiplyScalar(-1);
    this.uniforms.uMysticCameraIsOrthographic.value = (camera as THREE.OrthographicCamera).isOrthographicCamera ? 1 : 0;
    (this.uniforms.uMysticCameraViewDirectionWS.value as THREE.Vector3)
      .copy(this.#cameraViewDirection);
    this.uniforms.uMysticCameraNear.value = Number.isFinite(perspective.near) ? perspective.near : 0.1;
  }
}
