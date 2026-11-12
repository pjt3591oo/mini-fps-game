// 외부 애셋(CC0) 로더: 모델·텍스처·환경광. 실패하면 각 모듈이 기존 절차적 애셋으로 대체한다.
// 출처와 라이선스는 public/assets/CREDITS.md
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { renderer, scene } from './engine.js';
import { preloadSounds } from './audio.js';

const BASE = 'assets/';
export const A = { models: {}, textures: {}, ready: false };

const gltf = new GLTFLoader();
const texLoader = new THREE.TextureLoader();

const MODELS = ['rifle', 'shotgun', 'sniper', 'pistol', 'rocket', 'soldier', 'barrel/barrel.gltf',
  'health', 'ammo_box/ammo_box.gltf', 'old_military_crate/old_military_crate.gltf'];   // 픽업: 체력 / 탄약 / 보급품
const TEXTURES = ['floor', 'concrete', 'steel', 'corrugated', 'wood'];

function loadGltf(path) {
  const url = BASE + 'models/' + (path.includes('.') ? path : path + '.glb');
  return new Promise((res, rej) => gltf.load(url, res, undefined, rej));
}
function loadTex(url, color) {
  return new Promise((res, rej) => texLoader.load(url, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    if (color) t.colorSpace = THREE.SRGBColorSpace;
    res(t);
  }, undefined, rej));
}

// 재질 세트(색·노멀·거칠기). 쓸 때마다 clone해서 반복 횟수를 따로 줄 수 있다.
async function loadSet(name) {
  const [map, normalMap, roughnessMap] = await Promise.all([
    loadTex(`${BASE}textures/${name}_diff.jpg`, true),
    loadTex(`${BASE}textures/${name}_nor.jpg`),
    loadTex(`${BASE}textures/${name}_rough.jpg`),
  ]);
  return { map, normalMap, roughnessMap };
}

async function loadEnv() {
  const hdr = await new RGBELoader().loadAsync(BASE + 'textures/env_1k.hdr');
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromEquirectangular(hdr).texture;
  hdr.dispose(); pm.dispose();
  scene.environment = env;
}

export async function loadAssets(onProgress = () => {}) {
  preloadSounds(BASE + 'sounds/');
  const jobs = [
    ...MODELS.map(m => loadGltf(m).then(g => { A.models[m.split('/')[0]] = g; })),
    ...TEXTURES.map(t => loadSet(t).then(s => { A.textures[t] = s; })),
    loadEnv(),
  ];
  let done = 0;
  const results = await Promise.allSettled(jobs.map(j => j.finally(() => onProgress(++done / jobs.length))));
  for (const r of results) if (r.status === 'rejected') console.warn('애셋 로드 실패 (절차적 애셋으로 대체):', r.reason);
  A.ready = true;
  return A;
}
