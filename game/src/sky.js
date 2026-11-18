// The sky, the sun and the light rig for one time of day. Two things do most of the visual work
// here: a gradient dome drawn in the shader from the time-of-day palette (pale zenith, peach
// horizon, a hazy band where the haze pools, and a hard sun bloom), and the environment map made
// from that same dome: because city materials are metallic-and-rough, the sky becomes the
// reflection that makes glass, chrome and wet asphalt look like a Miami morning instead of plastic.
import * as THREE from 'three';
import { TIME_OF_DAY } from './config.js';
import { radialTexture } from './textures.js';

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = projected;
  gl_Position.z = gl_Position.w; // pin to the far plane: the dome never clips a building
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uHaze;
uniform vec3 uSunColor;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uSunSize;
varying vec3 vDirection;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec3 dir = normalize(vDirection);
  float up = clamp(dir.y, -1.0, 1.0);
  // Sky gradient: strongest colour change in the first 15 degrees above the horizon.
  float t = pow(clamp(up, 0.0, 1.0), 0.42);
  vec3 color = mix(uHorizon, uTop, t);
  // Haze band hugging the horizon: the thickness that reads as humid air.
  float haze = exp(-max(up, 0.0) * 7.0);
  color = mix(color, uHaze, haze * 0.72);
  // Below the horizon: a dim ground bounce, so the dome never shows a black seam at the waterline.
  color = mix(color, uHaze * 0.35, clamp(-up * 2.2, 0.0, 1.0));

  // Sun: a small hard disc, a bloom around it and a broad forward-scatter wash across the sky.
  float cosAngle = dot(dir, normalize(uSunDir));
  float disc = smoothstep(0.9992, 0.99965, cosAngle);
  float bloom = pow(max(cosAngle, 0.0), 900.0) * 0.55 + pow(max(cosAngle, 0.0), 60.0) * 0.28;
  float scatter = pow(max(cosAngle, 0.0), 6.0) * 0.30;
  color += uSunColor * (disc * 6.0 * uSunSize + bloom * uSunSize + scatter);

  // Stars: sparse, only at night, and only above the haze.
  if (uNight > 0.02) {
    vec2 grid = floor(dir.xz / max(abs(dir.y) + 0.18, 0.12) * 110.0);
    float star = step(0.9955, hash(grid));
    float twinkle = 0.55 + 0.45 * hash(grid + 3.7);
    color += vec3(0.85, 0.9, 1.0) * star * twinkle * uNight * (1.0 - haze) * smoothstep(0.02, 0.4, up) * 0.85;
    // A warm glow on the horizon from the city: light pollution.
    color += vec3(0.16, 0.10, 0.06) * uNight * exp(-max(up, 0.0) * 14.0);
  }

  // Ordered dither: the gradient is wide and subtle, and 8-bit output would band it.
  color += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(color, 1.0);
}`;

/**
 * Builds the sky dome, the sun/moon disc sprite, the lights and the environment map for a named
 * time of day. Returns handles the renderer and the game can tweak (e.g. the siren's light tint).
 */
export function createSky(scene, renderer, presetName = 'golden') {
  const preset = TIME_OF_DAY[presetName] ?? TIME_OF_DAY.golden;
  const uniforms = {
    uTop: { value: new THREE.Color(preset.sky.top) },
    uHorizon: { value: new THREE.Color(preset.sky.horizon) },
    uHaze: { value: new THREE.Color(preset.sky.haze) },
    uSunColor: { value: new THREE.Color(preset.sky.sun) },
    uSunDir: { value: new THREE.Vector3(...preset.sunDir).normalize() },
    uNight: { value: preset.nightAmount },
    uSunSize: { value: presetName === 'night' ? 0.35 : 1 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), material);
  dome.scale.setScalar(1200);
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  scene.add(dome);

  // The env map is built from a second, identical dome so the sky itself can stay unlit-tonemapped.
  const envScene = new THREE.Scene();
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material.clone());
  envDome.material.uniforms = uniforms;
  envDome.scale.setScalar(100);
  envScene.add(envDome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envTarget = pmrem.fromScene(envScene, 0.02, 0.1, 300);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = presetName === 'night' ? 0.55 : 0.85;
  pmrem.dispose();
  envDome.geometry.dispose();

  const sun = new THREE.DirectionalLight(preset.sunColor, preset.sunIntensity);
  const sunDir = new THREE.Vector3(...preset.sunDir).normalize();
  sun.position.copy(sunDir).multiplyScalar(180);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const shadowSize = presetName === 'night' ? 90 : 120;
  sun.shadow.camera.left = -shadowSize;
  sun.shadow.camera.right = shadowSize;
  sun.shadow.camera.top = shadowSize;
  sun.shadow.camera.bottom = -shadowSize;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 460;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const ambient = new THREE.HemisphereLight(preset.ambient, preset.ground, preset.ambientIntensity);
  scene.add(ambient);

  const fill = new THREE.DirectionalLight(preset.ambient, preset.ambientIntensity * 0.35);
  fill.position.set(-sunDir.x * 60, 40, -sunDir.z * 60);
  scene.add(fill);

  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);
  scene.background = new THREE.Color(preset.fogColor);

  // A soft additive sprite at the sun's place: the lens-flare core without a lens-flare asset.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture('rgba(255,244,220,0.85)', 'rgba(255,214,170,0)', 256),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  }));
  glow.scale.setScalar(presetName === 'night' ? 70 : 210);
  glow.position.copy(sunDir).multiplyScalar(900);
  glow.renderOrder = -999;
  scene.add(glow);

  return {
    preset,
    presetName,
    sunDir,
    sun,
    ambient,
    fill,
    glow,
    dome,
    uniforms,
    /** Keeps the shadow frustum centred on the action: a chase at the pier still gets shadows. */
    follow(x, z) {
      sun.position.set(x + sunDir.x * 180, sunDir.y * 180, z + sunDir.z * 180);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
      sun.shadow.camera.updateProjectionMatrix();
    },
    dispose() {
      scene.remove(dome, glow, sun, sun.target, ambient, fill);
      dome.geometry.dispose();
      material.dispose();
      envTarget.dispose();
      scene.environment = null;
    },
  };
}
