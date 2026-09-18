import * as THREE from 'three';

export type MysticShaderFamily =
  | 'debuff-rimlight'
  | 'mystic-opaque'
  | 'mystic-transparent'
  | 'mystic-final'
  | 'mystic-final-transparent'
  | 'cel-standard'
  | 'cel-standard-mystic'
  | 'star'
  | 'dissolve'
  | 'dissolve-stencil';

export interface MysticShaderDefinition {
  readonly guid: string;
  readonly sourceName: string;
  readonly family: MysticShaderFamily;
  readonly transparent: boolean;
  readonly side: THREE.Side;
  readonly depthWrite: boolean;
  readonly alphaTest: number;
  readonly outline: boolean;
  readonly depthOnly: boolean;
  readonly shadowCaster: boolean;
  readonly fragmentShader: string;
  readonly depthFragmentShader: string;
}

/** One declaration block is injected into both mesh and particle programs. */
export const MYSTIC_VERTEX_VARYINGS = /* glsl */`
  varying vec2 vMysticUv;
  varying vec2 vMysticUv0Zw;
  varying vec2 vMysticUv2;
  varying vec3 vMysticNormalWS;
  varying vec3 vMysticNormalVS;
  varying vec3 vMysticViewDirectionWS;
  varying vec3 vMysticWorldPosition;
  varying vec3 vMysticObjectPosition;
  varying vec3 vMysticObjectNormal;
  varying float vMysticEyeDepth;
  varying vec4 vMysticScreenPosition;
  varying vec4 vMysticColor;
  varying vec4 vMysticCustom0;
`;

/**
 * Mesh varyings intentionally match the particle billboard vertex shader.
 * uv1 is glTF TEXCOORD_1; absent attributes receive WebGL's zero default.
 */
export const MYSTIC_MESH_VERTEX_SHADER = /* glsl */`
  ${MYSTIC_VERTEX_VARYINGS}

  attribute vec2 uv1;
  uniform mat4 uMysticUnityObjectFromGeometry;

  #include <common>
  #include <batching_pars_vertex>
  #include <morphtarget_pars_vertex>
  #include <skinning_pars_vertex>

  void main() {
    vMysticUv = uv;
    // A regular Mesh UV channel supplies TEXCOORD0.xy only. Particle vertex
    // streams may pack Custom1.xy into TEXCOORD0.zw; their dedicated vertex
    // program fills this varying explicitly.
    vMysticUv0Zw = vec2(0.0);
    vMysticUv2 = uv1;
    vMysticColor = vec4(1.0);
    vMysticCustom0 = vec4(uv1, 0.0, 0.0);

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

    vMysticObjectPosition = (
      uMysticUnityObjectFromGeometry * vec4(transformed, 1.0)
    ).xyz;
    vMysticObjectNormal = normalize(
      mat3(uMysticUnityObjectFromGeometry) * objectNormal
    );
    vec4 worldPosition = modelMatrix * vec4(transformed, 1.0);
    vMysticWorldPosition = worldPosition.xyz;
    vMysticNormalVS = normalize(transformedNormal);
    vMysticNormalWS = inverseTransformDirection(vMysticNormalVS, viewMatrix);
    vMysticViewDirectionWS = normalize(cameraPosition - worldPosition.xyz);
    vec4 mvPosition = viewMatrix * worldPosition;
    vMysticEyeDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
    vMysticScreenPosition = gl_Position;
  }
`;

const MYSTIC_FRAGMENT_PREAMBLE = /* glsl */`
  precision highp float;

  uniform float uMysticTime;
  uniform float uMysticDetail;
  uniform float uMysticGammaBlendPass;
  uniform float uAlphaClipEnabled;
  uniform float uAlphaCutoff;
  uniform float uAlpha;
  uniform float uBrightness;
  uniform float uEmission;
  uniform float uEdgeWidth;
  uniform float uMatcapStrength;
  uniform float uMatcap2Strength;
  uniform float uRimShadow;
  uniform float uRimOffset;
  uniform float uTopMidOffset;
  uniform float uUv2Threshold;
  uniform float uUv1Alpha;
  uniform float uScaleNoise;
  uniform float uColorTime;
  uniform float uColorSwitch;
  uniform float uShadowAmount;
  uniform float uShadowSmoothness;
  uniform float uIndoor;
  uniform float uSnowOnTop;
  uniform float uOnPoisoned;
  uniform float uOnBurned;
  uniform float uAlphaEmission;
  uniform float uAlphaMainTex;
  uniform float uAlphaMainTexKeyword;
  uniform float uUnityGammaWorkflow;
  uniform float uMysticCameraIsOrthographic;
  uniform float uMysticCameraNear;
  uniform float uCelLength;
  uniform float uCelOffset;

  uniform vec4 uMainTexTransform;
  uniform vec4 uMaskTransform;
  uniform vec4 uBodyMaskTransform;
  uniform vec4 uEmissionTransform;
  uniform vec4 uColor0;
  uniform vec4 uColor1;
  uniform vec4 uColor2;
  uniform vec4 uTop;
  uniform vec4 uMid;
  uniform vec4 uBottom;
  uniform vec4 uRimColor;
  uniform vec4 uBaseColor;
  uniform vec4 uPrimaryColor;
  uniform vec4 uSecondaryColor;
  uniform vec4 uUv2Color;
  uniform vec4 uSolidColor;
  uniform vec4 uMasterColor;
  uniform vec4 uEmissionColor;
  uniform vec4 uTopMidStep;
  uniform vec4 uRimFalloff;
  uniform vec4 uVector0;
  uniform vec4 uVector1;
  uniform vec4 uVector2;
  uniform vec4 uVector3;
  uniform vec3 uMysticCameraViewDirectionWS;
  uniform vec3 uMainLightPosition;

  uniform sampler2D uMainTex;
  uniform sampler2D uMaskTex;
  uniform sampler2D uMatcapTex;
  uniform sampler2D uMatcap2Tex;
  uniform sampler2D uNoiseTex;
  uniform sampler2D uNoise2Tex;
  uniform sampler2D uNoise3Tex;
  uniform sampler2D uUv2Tex;
  uniform sampler2D uBodyMaskTex;
  uniform sampler2D uGradientTex;
  uniform sampler2D uEmissionTex;
  uniform sampler2D uDissolveTex;

  ${MYSTIC_VERTEX_VARYINGS}

  vec2 transformedUv(vec2 source, vec4 transform) {
    return source * transform.xy + transform.zw;
  }

  vec2 screenUv() {
    vec2 ndc = vMysticScreenPosition.xy / max(vMysticScreenPosition.w, 0.00001);
    return ndc * 0.5 + 0.5;
  }

  vec2 matcapUv() {
    return vMysticNormalVS.xy * 0.5 + 0.5;
  }

  vec3 addonViewDirectionWS() {
    if (uMysticCameraIsOrthographic > 0.5) {
      return normalize(uMysticCameraViewDirectionWS);
    }
    return normalize(cameraPosition - vMysticWorldPosition);
  }

  vec2 importedProceduralUv(vec2 source) {
    // Unity-import PNGs are vertically reflected during the deterministic
    // export. Mesh TEXCOORDs carry the matching glTF reflection, but generated
    // screen/view UVs do not, so compensate only at procedural samplers.
    return vec2(source.x, 1.0 - source.y);
  }

  float safeSmoothstep(float edge0, float edge1, float value) {
    if (abs(edge1 - edge0) < 0.000001) return step(edge0, value);
    float t = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
  }

  vec3 unitySrgbToLinear(vec3 value) {
    vec3 low = value / 12.92;
    vec3 high = pow((max(value, vec3(0.0)) + 0.055) / 1.055, vec3(2.4));
    return mix(low, high, step(vec3(0.04045), value));
  }

  vec4 sampleFiveColorMysticGradient(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(1.0, 0.1970911, 0.0);
    vec3 c1 = vec3(1.0, 0.8276376, 0.0);
    vec3 c2 = vec3(0.4292929, 1.0, 0.0);
    vec3 c3 = vec3(0.3527098, 0.0, 1.0);
    vec3 c4 = vec3(1.0, 0.1960784, 0.0);
    if (t < 0.1566033) return vec4(mix(c0, c1, t / 0.1566033), 1.0);
    if (t < 0.3773556) return vec4(mix(c1, c2, (t - 0.1566033) / 0.2207523), 1.0);
    if (t < 0.6490577) return vec4(mix(c2, c3, (t - 0.3773556) / 0.2717021), 1.0);
    return vec4(mix(c3, c4, (t - 0.6490577) / 0.3509423), 1.0);
  }

  vec4 mysticMatcap() {
    return texture2D(uMatcapTex, importedProceduralUv(matcapUv())) * uMatcapStrength;
  }

  float mysticRim() {
    // URP GetWorldSpaceNormalizeViewDir is per-fragment and returns the camera
    // forward direction for orthographic cameras.
    float ndv = dot(normalize(vMysticNormalWS), addonViewDirectionWS());
    float rim = 1.0 - clamp(ndv + uRimOffset, 0.0, 1.0);
    return (1.0 - uRimShadow) * safeSmoothstep(uRimFalloff.x, uRimFalloff.y, rim);
  }

  float addonRim() {
    float ndv = dot(normalize(vMysticNormalWS), addonViewDirectionWS());
    float rim = 1.0 - clamp(ndv + uRimOffset, 0.0, 1.0);
    return (1.0 - uRimShadow) * safeSmoothstep(uRimFalloff.x, uRimFalloff.y, rim);
  }

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

  float celCameraDepthDither() {
    float numerator = vMysticEyeDepth - uMysticCameraNear - uCelOffset;
    float depthFade = abs(uCelLength) < 0.000001
      ? step(0.0, numerator)
      : clamp(numerator / uCelLength, 0.0, 1.0);
    return step(dither8x8Bayer(gl_FragCoord.xy), clamp(depthFade * 1.00001, 0.0, 1.0));
  }

  vec3 axieBodyShade() {
    // Mystic_Final copies the Base V4 body graph, which consumes the raw
    // interpolated TransformObjectToWorldNormal varying here.
    vec3 normalWS = vMysticNormalWS;
    float lightDot = dot(vec3(-15.0, 80.0, -30.0), normalWS);
    float lightWeight = safeSmoothstep(-0.25, 0.55, lightDot);
    // IsGammaSpace() branches from the pinned Unity project. The linear-space
    // alternatives are 0.5209957 and 0.4633656 respectively.
    vec3 shaded = clamp(mix(uPrimaryColor.rgb, vec3(0.7490196) * uPrimaryColor.rgb, 1.0 - lightWeight), 0.0, 1.0);
    float ndv = dot(normalWS, addonViewDirectionWS());
    float fresnel = 0.2 * pow(1.0 - ndv, 5.0);
    float rimWeight = 0.6980392 * clamp(safeSmoothstep(0.9, 1.0, lightDot * fresnel), 0.0, 1.0);
    vec3 source = vec3(0.7106918);
    vec3 overlay = mix(shaded + 2.0 * (source - 0.5), shaded + 2.0 * source - 1.0, step(vec3(0.5), source));
    return clamp(mix(shaded, overlay, rimWeight), 0.0, 1.0);
  }
`;

const OUTPUT = /* glsl */`
    if (uMysticGammaBlendPass > 0.5) {
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), clamp(alpha, 0.0, 1.0));
      return;
    }
    if (uUnityGammaWorkflow > 0.5) color = unitySrgbToLinear(color);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

function fragment(body: string) {
  return `${MYSTIC_FRAGMENT_PREAMBLE}\nvoid main() {\n${body}\n${OUTPUT}`;
}

function depthFragment(body: string) {
  return `${MYSTIC_FRAGMENT_PREAMBLE}\n#include <packing>\nvoid main() {\n${body}\n`
    + `  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;\n`
    + `  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);\n}\n`;
}

const DEBUFF_FRAGMENT = fragment(/* glsl */`
  vec4 baseSample = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform));
  vec2 viewUv = addonViewDirectionWS().xy;
  vec2 noiseUv = viewUv * uVector0.xy + uMysticTime * uVector0.zw;
  vec2 secondUv = viewUv * uVector1.xy + uMysticTime * uVector1.zw;
  vec4 noise = texture2D(uNoiseTex, noiseUv) * texture2D(uNoise2Tex, secondUv) * uEmission;
  vec4 noiseColor = mix(vec4(0.0), uColor0, noise);
  vec4 surface = mix(uColor1, baseSample, mix(vec4(0.0), noiseColor, noiseColor));
  float vertical = safeSmoothstep(uTopMidStep.x, uTopMidStep.y, vMysticObjectPosition.y + uTopMidOffset);
  vec4 gradient = mix(uTop, uMid, vertical);
  vec3 color = (surface * gradient * mysticMatcap()).rgb + addonRim() * uRimColor.rgb;
  float alpha = uAlpha;
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const SIMPLE_MYSTIC_BODY = /* glsl */`
  vec4 source = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform));
  vec2 gradientUv = screenUv() * uVector0.xy + uMysticTime * uVector0.zw;
  float vertical = safeSmoothstep(uTopMidStep.x, uTopMidStep.y, vMysticObjectPosition.y + uTopMidOffset);
  vec4 verticalColor = mix(uTop, uBottom, vertical);
  vec3 color = (uColor0 * source * uBrightness * texture2D(uGradientTex, gradientUv) * verticalColor).rgb;
  color += addonRim() * uRimColor.rgb;
`;

const MYSTIC_OPAQUE_FRAGMENT = fragment(/* glsl */`
  ${SIMPLE_MYSTIC_BODY}
  color += texture2D(uEmissionTex, transformedUv(vMysticUv, uEmissionTransform)).rgb * uEmissionColor.rgb;
  color *= mysticMatcap().rgb;
  float alpha = source.a;
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const MYSTIC_TRANSPARENT_FRAGMENT = fragment(/* glsl */`
  ${SIMPLE_MYSTIC_BODY}
  float alpha = source.a * vertical;
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const MYSTIC_FINAL_BODY = /* glsl */`
  vec2 uv = transformedUv(vMysticUv, uMainTexTransform);
  vec4 matcap = mysticMatcap();
  vec4 baseSurface = texture2D(uMainTex, uv) * matcap + mysticRim() * uRimColor;

  vec2 centeredScreen = (screenUv() * 2.0 - 1.0) * uScaleNoise;
  vec2 noiseUv1 = centeredScreen * uVector0.xy + uMysticTime * uVector0.zw;
  vec2 noiseUv2 = centeredScreen * uVector1.xy + uMysticTime * uVector1.zw;
  vec4 animatedNoise = texture2D(uNoiseTex, importedProceduralUv(noiseUv1))
    * texture2D(uNoise2Tex, importedProceduralUv(noiseUv2)) * uEmission * uMysticDetail;
  vec4 noiseColor = mix(vec4(0.0), uColor0, animatedNoise);
  vec4 layeredNoise = mix(uColor1, noiseColor, noiseColor);

  float vertical = safeSmoothstep(uTopMidStep.x, uTopMidStep.y, vMysticObjectPosition.y + uTopMidOffset);
  float movingGradientPhase = fract(uMysticTime * uColorTime + 0.5);
  // The generated graph multiplies by float4(gradient.rgb, 0); moving color's
  // arbitrary gradient alpha must not leak into later mixes.
  vec4 movingColor = vec4(sampleFiveColorMysticGradient(movingGradientPhase).rgb * 11.98431, 0.0);
  vec4 middle = mix(uMid, movingColor, step(0.5, uColorSwitch));
  vec4 verticalColor = mix(uTop, middle, vertical);

  vec2 noise3Uv = centeredScreen * uVector2.xy + uMysticTime * uVector2.zw;
  // glTF TEXCOORD_1 and the imported texture are both V-reflected relative to
  // Unity. Transport the authored velocity through that basis exactly once.
  vec2 uv2Animated = vMysticUv2 + uMysticTime * vec2(uVector3.x, -uVector3.y);
  vec4 uv2Mask = texture2D(uUv2Tex, uv2Animated);
  vec4 inner = layeredNoise * verticalColor * matcap;
  inner += mysticRim() * uRimColor;
  inner += vec4(uColor2.rgb * texture2D(uNoise3Tex, importedProceduralUv(noise3Uv)).rgb, 0.0) * uMysticDetail;
  vec4 uv2Matcap = vec4(texture2D(uMatcap2Tex, importedProceduralUv(matcapUv())).rgb * uMatcap2Strength * uUv2Color.rgb, 0.0);
  vec4 special = mix(inner, uv2Matcap, 1.0 - step(uv2Mask.r, uUv2Threshold));
  vec4 mysticSurface = mix(baseSurface, special, texture2D(uMaskTex, transformedUv(vMysticUv, uMaskTransform)).r);
`;

const MYSTIC_FINAL_FRAGMENT = fragment(/* glsl */`
  ${MYSTIC_FINAL_BODY}
  vec3 color = mix(
    axieBodyShade(),
    mysticSurface.rgb,
    texture2D(uBodyMaskTex, transformedUv(vMysticUv, uBodyMaskTransform)).r
  );
  float alpha = mix(uUv1Alpha, 1.0, uv2Mask.r);
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const MYSTIC_FINAL_TRANSPARENT_FRAGMENT = fragment(/* glsl */`
  ${MYSTIC_FINAL_BODY}
  vec3 color = mysticSurface.rgb;
  float alpha = mix(uUv1Alpha, 1.0, uv2Mask.r);
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const CEL_BODY = /* glsl */`
  vec4 sampled = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform));
  vec3 base = mix(sampled.rgb, uSolidColor.rgb, uSolidColor.a);
  float lightDot = dot(vec3(0.0, 150.0, 200.0) * uMainLightPosition, vMysticNormalWS);
  float toon = floor(safeSmoothstep(uShadowAmount, uShadowAmount + uShadowSmoothness, lightDot) * 128.0) / 128.0;
  vec3 shaded = mix(base, base * toon, 0.25);
  // IsGammaSpace() branches from the pinned Unity project. Linear-project
  // alternatives are (1, .7681513, .5394797), (.6239606, .9911022,
  // .9911022), (.1878208, .6444799, .03954625), and
  // (.9911022, .1746475, .1412633).
  shaded = mix(shaded, shaded * vec3(1.0, 0.8901961, 0.7607844), uIndoor);
  float bottom = 1.0 - safeSmoothstep(-0.5, 0.5, vMysticObjectNormal.y);
  vec3 snowy = mix(shaded, vec3(0.8117648, 0.9960785, 0.9960785), 0.6980392 * bottom);
  shaded = mix(shaded, snowy, uSnowOnTop);
  shaded = mix(shaded, vec3(0.4705883, 0.8235295, 0.2196079) * shaded, uOnPoisoned);
  shaded = clamp(shaded, 0.0, 1.0);
  shaded = mix(shaded, vec3(0.9960785, 0.454902, 0.4117647) * shaded, uOnBurned);
`;

const CEL_FRAGMENT = fragment(/* glsl */`
  ${CEL_BODY}
  vec3 color = uMasterColor.rgb * clamp(shaded, 0.0, 1.0);
  float alpha = sampled.a * celCameraDepthDither();
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const CEL_MYSTIC_FRAGMENT = fragment(/* glsl */`
  ${CEL_BODY}
  float emissionMask = texture2D(uEmissionTex, transformedUv(vMysticUv, uEmissionTransform)).r;
  vec2 panned = addonViewDirectionWS().xy * uVector1.xy + uMysticTime * uVector1.zw;
  vec3 emission = clamp(emissionMask, 0.0, 1.0) * texture2D(uNoise2Tex, panned).rgb * uEmissionColor.rgb;
  vec3 color = mix(uAlphaEmission, 1.0, 1.0 - emissionMask) * (shaded + emission) * mysticMatcap().rgb;
  float alpha = sampled.a * celCameraDepthDither();
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const STAR_BODY = /* glsl */`
  vec2 panned = screenUv() * uVector0.xy + uMysticTime * uVector0.zw;
  float diagonalA = abs(vMysticUv.x - vMysticUv.y);
  float diagonalB = abs(vMysticUv.x - (1.0 - vMysticUv.y));
  float starDistance = clamp(diagonalB / max(1.0 - diagonalA, 0.00001), 0.0, 1.0)
    * clamp(diagonalA / max(1.0 - diagonalB, 0.00001), 0.0, 1.0);
  // The source particle vertex stream packs Custom1.x into TEXCOORD0.z.
  // PARTICLE_VERTEX_SHADER transports that exact channel as vMysticUv2.x.
  float customWidth = (1.0 - 0.9) * vMysticUv2.x;
  float fill = step(starDistance, customWidth);
  vec4 result = texture2D(uMainTex, panned) * fill * uColor1;
  result += (step(pow(starDistance, uEdgeWidth), customWidth) - fill) * uColor0 * vMysticColor;
`;

const STAR_FRAGMENT = fragment(/* glsl */`
  ${STAR_BODY}
  vec3 color = result.rgb;
  float alpha = result.r;
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const DISSOLVE_BODY = /* glsl */`
  vec2 mainUv = vMysticUv + vMysticUv0Zw + (vMysticUv * (uVector0.xy - 1.0)) + uMysticTime * uVector0.zw;
  vec4 mainSample = texture2D(uMainTex, mainUv);
  float vertical = clamp(0.5 * vMysticCustom0.y, 0.0, 0.5);
  vec2 dissolveUv = vMysticUv * uVector1.xy + uMysticTime * uVector1.zw;
  vec4 dissolveSample = texture2D(uDissolveTex, dissolveUv);
  float dissolve = ((dissolveSample.r * dissolveSample.a - 0.1) / 1.0) + (1.0 - vMysticCustom0.x * 2.0);
  float mask = safeSmoothstep(vertical, 1.0 - vertical, dissolve);
  vec3 color = (mainSample * uBaseColor * vMysticColor).rgb;
  float edge = safeSmoothstep(vertical, 1.0 - vertical, dissolve) - safeSmoothstep(vertical, 1.0 - vertical, dissolve);
  color += vec3(edge);
  float alpha = texture2D(uMaskTex, transformedUv(vMysticUv, uMaskTransform)).r * mainSample.a * vMysticColor.a * mask;
`;

const DISSOLVE_FRAGMENT = fragment(/* glsl */`
  ${DISSOLVE_BODY}
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const DISSOLVE_STENCIL_FRAGMENT = fragment(/* glsl */`
  ${DISSOLVE_BODY}
  alpha *= mix(1.0, mainSample.r * mainSample.a, uAlphaMainTexKeyword);
  if (uAlphaClipEnabled > 0.5 && alpha < uAlphaCutoff) discard;
`);

const DEBUFF_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  float alpha = uAlpha;
`);

const MYSTIC_OPAQUE_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  float alpha = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform)).a;
`);

const MYSTIC_TRANSPARENT_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  float vertical = safeSmoothstep(uTopMidStep.x, uTopMidStep.y, vMysticObjectPosition.y + uTopMidOffset);
  float alpha = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform)).a * vertical;
`);

const MYSTIC_FINAL_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  vec4 uv2Mask = texture2D(
    uUv2Tex,
    vMysticUv2 + uMysticTime * vec2(uVector3.x, -uVector3.y)
  );
  float alpha = mix(uUv1Alpha, 1.0, uv2Mask.r);
`);

const CEL_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  float alpha = texture2D(uMainTex, transformedUv(vMysticUv, uMainTexTransform)).a
    * celCameraDepthDither();
`);

const STAR_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  ${STAR_BODY}
  float alpha = result.r;
`);

const DISSOLVE_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  ${DISSOLVE_BODY}
`);

const DISSOLVE_STENCIL_DEPTH_FRAGMENT = depthFragment(/* glsl */`
  ${DISSOLVE_BODY}
  alpha *= mix(1.0, mainSample.r * mainSample.a, uAlphaMainTexKeyword);
`);

const definitions: readonly MysticShaderDefinition[] = Object.freeze([
  { guid: '29914acfa7bac4ad6a5c0a0766b2e83f', sourceName: 'AxieMixer3D/AmplifyShaderPack/URP/Debuff_effect_rimlight', family: 'debuff-rimlight', transparent: true, side: THREE.FrontSide, depthWrite: false, alphaTest: 0.5, outline: true, depthOnly: true, shadowCaster: false, fragmentShader: DEBUFF_FRAGMENT, depthFragmentShader: DEBUFF_DEPTH_FRAGMENT },
  { guid: '6e954fe247bda4462bff3e929106c439', sourceName: 'AxieMixer3D/Mystic opaque', family: 'mystic-opaque', transparent: false, side: THREE.FrontSide, depthWrite: true, alphaTest: 0, outline: false, depthOnly: true, shadowCaster: false, fragmentShader: MYSTIC_OPAQUE_FRAGMENT, depthFragmentShader: MYSTIC_OPAQUE_DEPTH_FRAGMENT },
  { guid: 'f4a5ec39cbd0a480a981365aff803418', sourceName: 'AxieMixer3D/Mystic trans', family: 'mystic-transparent', transparent: true, side: THREE.FrontSide, depthWrite: false, alphaTest: 0, outline: false, depthOnly: true, shadowCaster: false, fragmentShader: MYSTIC_TRANSPARENT_FRAGMENT, depthFragmentShader: MYSTIC_TRANSPARENT_DEPTH_FRAGMENT },
  { guid: '60164f492e4ea48b2ababdd12de37ef3', sourceName: 'AxieMixer3D/Mystic_Final', family: 'mystic-final', transparent: false, side: THREE.FrontSide, depthWrite: true, alphaTest: 0.5, outline: true, depthOnly: true, shadowCaster: false, fragmentShader: MYSTIC_FINAL_FRAGMENT, depthFragmentShader: MYSTIC_FINAL_DEPTH_FRAGMENT },
  { guid: '9094d94677cc54675920ba39886d1aaf', sourceName: 'AxieMixer3D/Mystic_Final_transparent', family: 'mystic-final-transparent', transparent: true, side: THREE.FrontSide, depthWrite: false, alphaTest: 0.5, outline: true, depthOnly: true, shadowCaster: false, fragmentShader: MYSTIC_FINAL_TRANSPARENT_FRAGMENT, depthFragmentShader: MYSTIC_FINAL_DEPTH_FRAGMENT },
  { guid: '8eaeef9ff6b3f439ea90238799bb95d9', sourceName: 'AxieMixer3D/S_Cel_Standard_Amplify', family: 'cel-standard', transparent: false, side: THREE.FrontSide, depthWrite: true, alphaTest: 0.5, outline: true, depthOnly: true, shadowCaster: false, fragmentShader: CEL_FRAGMENT, depthFragmentShader: CEL_DEPTH_FRAGMENT },
  { guid: 'd71704b2b22f84f7b828e9ef6e4d049f', sourceName: 'AxieMixer3D/S_Cel_Standard_Amplify_Mystic_test', family: 'cel-standard-mystic', transparent: false, side: THREE.FrontSide, depthWrite: true, alphaTest: 0.5, outline: true, depthOnly: true, shadowCaster: false, fragmentShader: CEL_MYSTIC_FRAGMENT, depthFragmentShader: CEL_DEPTH_FRAGMENT },
  { guid: '47061017283e64a83a6e8b82560df4ad', sourceName: 'AxieMixer3D/Star', family: 'star', transparent: true, side: THREE.DoubleSide, depthWrite: true, alphaTest: 0.5, outline: false, depthOnly: true, shadowCaster: false, fragmentShader: STAR_FRAGMENT, depthFragmentShader: STAR_DEPTH_FRAGMENT },
  { guid: '11272c6e6444b4dbb9b53c043a520bc3', sourceName: 'AxieMixer3D/ProjectT_VFX/disslove_mobile', family: 'dissolve', transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0, outline: false, depthOnly: true, shadowCaster: false, fragmentShader: DISSOLVE_FRAGMENT, depthFragmentShader: DISSOLVE_DEPTH_FRAGMENT },
  { guid: 'f406d4489c4ab4c6984d69084e5b9b75', sourceName: 'AxieMixer3D/ProjectT_VFX/disslove_mobile_stencil', family: 'dissolve-stencil', transparent: true, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0, outline: false, depthOnly: true, shadowCaster: false, fragmentShader: DISSOLVE_STENCIL_FRAGMENT, depthFragmentShader: DISSOLVE_STENCIL_DEPTH_FRAGMENT },
]);

export const MYSTIC_SHADER_DEFINITIONS: ReadonlyMap<string, MysticShaderDefinition> = new Map(
  definitions.map((definition) => [definition.guid, definition]),
);

export function resolveMysticShaderDefinition(shaderGuid: string): MysticShaderDefinition {
  const definition = MYSTIC_SHADER_DEFINITIONS.get(shaderGuid);
  if (!definition) {
    throw new Error(`Unsupported Axie Mystic/VFX shader GUID: ${shaderGuid}`);
  }
  return definition;
}
