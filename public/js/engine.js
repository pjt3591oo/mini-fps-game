// 렌더러 / 씬 / 카메라 / 후처리 — 모든 모듈이 공유하는 기본 객체
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { G } from './state.js';

export const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

// ---------- 색 설계: 해 질 녘 ----------
// 따뜻한 햇빛 + 차가운 그림자. 안개는 지평선 색과 맞춰 멀리 있는 것이 노을에 녹아들게 한다.
export const PALETTE = { skyTop: '#2f5fa8', skyMid: '#8fb6dc', horizon: '#ffd3a1', fog: 0xf3cfa4, sun: 0xffc98f };

export const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.fog);
scene.fog = new THREE.Fog(PALETTE.fog, 30, 110);

export const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
camera.rotation.order = 'YXZ';
scene.add(camera);

scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x8a7663, 1.55));
export const sun = new THREE.DirectionalLight(PALETTE.sun, 2.9);
sun.position.set(48, 40, 26);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0005;
sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 200 });
scene.add(sun);

// 하늘 돔 + 해
{
  const c = document.createElement('canvas');
  c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, PALETTE.skyTop);
  grad.addColorStop(0.36, PALETTE.skyMid);
  grad.addColorStop(0.49, PALETTE.horizon);
  grad.addColorStop(0.53, '#f3cfa4');
  grad.addColorStop(1, '#f3cfa4');
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -2;
  scene.add(sky);

  const s = document.createElement('canvas');
  s.width = s.height = 128;
  const sg = s.getContext('2d');
  const rg = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.12, 'rgba(255,240,210,1)');
  rg.addColorStop(0.3, 'rgba(255,190,120,.45)');
  rg.addColorStop(1, 'rgba(255,160,90,0)');
  sg.fillStyle = rg; sg.fillRect(0, 0, 128, 128);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(s), color: new THREE.Color(2.2, 1.9, 1.5), blending: THREE.AdditiveBlending,
    fog: false, depthWrite: false, depthTest: true, transparent: true,
  }));
  disc.position.copy(sun.position).normalize().multiplyScalar(280);
  disc.scale.setScalar(120);
  disc.renderOrder = -1;
  scene.add(disc);
}

export const clock = new THREE.Clock();

// ---------- 후처리: 빛 번짐 + 비네트/색 보정 ----------
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, vignette: { value: 0.42 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float vignette; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, 1.12);                       // 채도 약간 올림
      c.rgb = mix(c.rgb * vec3(0.94, 0.98, 1.08), c.rgb * vec3(1.05, 1.0, 0.94), smoothstep(0.05, 0.6, l)); // 그림자는 차갑게, 밝은 곳은 따뜻하게
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.0);
      gl_FragColor = c;
    }`,
};

let composer = null, bloom = null;
function buildComposer() {
  const pr = renderer.getPixelRatio();
  const target = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.55, 1.0);
  composer.addPass(bloom);
  composer.addPass(new ShaderPass(GradeShader));
  composer.addPass(new OutputPass());
}
try { buildComposer(); } catch (e) { console.warn('후처리를 사용할 수 없어 기본 렌더링으로 전환합니다', e); composer = null; }

export function render() {
  if (composer && G.settings.gfx !== 'low') composer.render();
  else renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});

// 밝기가 1을 넘는 색(빛 번짐 대상)을 만든다
export function glow(hex, k = 2.5) { return new THREE.Color(hex).multiplyScalar(k); }

// 캔버스 기반 타일 텍스처 생성 (외부 이미지 없이 사용)
export function tileTexture(base, line, repeat, size = 128, lineWidth = 6) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 2; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * size, Math.random() * size, 3, 3);
  }
  g.strokeStyle = line; g.lineWidth = lineWidth; g.strokeRect(0, 0, size, size);
  return finishTexture(c, repeat);
}

export function finishTexture(canvas, repeat = 1) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
