// 맵 로딩(JSON + glTF), 충돌 판정, 이동 처리
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { scene } from './engine.js';
import * as T from './textures.js';
import { A } from './assets.js';
import { PLAYER } from './config.js';

export const colliders = [];     // THREE.Box3 목록
export const staticMeshes = [];  // 사격 레이캐스트 대상
export const world = { navDirty: true, size: 50, playerSpawns: [[0, 0, 0]], enemySpawns: [], name: '', barrels: [] };

const mapGroup = new THREE.Group();
scene.add(mapGroup);

let materials = null;
// 외부 재질 세트(색·노멀·거칠기)가 있으면 그것을, 없으면 절차적 텍스처를 쓴다
function pbr(set, fallback, o = {}) {
  const s = A.textures[set];
  if (!s) return new THREE.MeshStandardMaterial({ map: fallback(), roughness: 0.85, ...o });
  return new THREE.MeshStandardMaterial({
    map: s.map.clone(), normalMap: s.normalMap.clone(), roughnessMap: s.roughnessMap.clone(),
    normalScale: new THREE.Vector2(1.2, 1.2), roughness: 1, ...o,
  });
}
function getMaterials() {
  if (materials) return materials;
  materials = {
    floor: pbr('floor', () => T.asphalt(1), { roughness: 0.95 }),
    crate: pbr('wood', T.crate, { color: 0xd8c8b0 }),
    concrete: pbr('concrete', () => T.concrete('#aca496'), { color: 0xe6ddd0 }),
    metal: new THREE.MeshStandardMaterial({ map: T.hazard(), roughness: 0.55, metalness: 0.2,
      ...(A.textures.steel && { normalMap: A.textures.steel.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) }) }),
    dark: pbr('steel', T.steel, { metalness: 0.55, color: 0xb8c0cc }),
    wall: pbr('concrete', () => T.concrete('#7d7a76', true), { color: 0x9a948c }),
    barrel: new THREE.MeshStandardMaterial({ map: T.barrel(), roughness: 0.5, metalness: 0.35, emissive: 0x401000, emissiveIntensity: 0.6 }),
    // 컨테이너는 색을 섞어 쓴다 (외부 텍스처는 무채색 골함석에 색을 곱한다)
    containers: ['#2f7f93', '#b5532c', '#c79a2a', '#4f6b3c'].map(c => A.textures.corrugated
      ? pbr('corrugated', null, { color: new THREE.Color(c).multiplyScalar(1.5), metalness: 0.45 })
      : new THREE.MeshStandardMaterial({ map: T.corrugated(c), roughness: 0.6, metalness: 0.3 })),
    skyline: new THREE.MeshStandardMaterial({ color: 0x343c4c, roughness: 1, emissive: 0xffffff, emissiveMap: T.windows(), emissiveIntensity: 0.55 }),
  };
  return materials;
}

function addBox(x, y, z, w, h, d, matName) {
  const mats = getMaterials();
  const geo = new THREE.BoxGeometry(w, h, d);
  if (matName !== 'crate' || A.textures.wood) {
    // 면 크기에 맞춰 UV를 늘려 텍스처가 2m마다 반복되게 한다 (면 순서: ±x, ±y, ±z)
    const uv = geo.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    const tile = matName === 'metal' ? 1 : 2;
    for (let i = 0; i < uv.count; i++) {
      const [fu, fv] = dims[Math.floor(i / 4)];
      uv.setXY(i, uv.getX(i) * fu / tile, uv.getY(i) * fv / tile);
    }
  }
  // 컨테이너 색은 위치로 정해 모든 클라이언트에서 같게 한다
  const mat = matName === 'container' ? mats.containers[Math.abs(Math.round(x * 7 + z * 13)) % mats.containers.length] : mats[matName] || mats.crate;
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  mapGroup.add(m);
  staticMeshes.push(m);
  const box = new THREE.Box3().setFromObject(m);
  colliders.push(box);
  return { mesh: m, box };
}

function mirrored(pos, size, mode) {
  const [x, z] = pos, [w, h, d] = size;
  const out = [{ x, z, w, d }];
  if (mode === 'x' || mode === 'xz') out.push({ x: -x, z, w, d });
  if (mode === 'z' || mode === 'xz') out.push({ x, z: -z, w, d });
  if (mode === 'xz') out.push({ x: -x, z: -z, w, d });
  return out.map(o => ({ ...o, h }));
}

function clearMap() {
  for (const c of [...mapGroup.children]) {
    mapGroup.remove(c);
    c.traverse?.(o => o.geometry && o.geometry.dispose());
  }
  colliders.length = 0;
  staticMeshes.length = 0;
  world.barrels.length = 0;
}

export async function loadMap(url) {
  const def = await (await fetch(url)).json();
  clearMap();
  const mats = getMaterials();
  const S = world.size = def.size || 50;
  world.name = def.name || '';
  world.playerSpawns = def.playerSpawns || [[0, 0, 0]];
  world.perches = def.perches || [];
  world.enemySpawns = def.enemySpawns || [];

  // 바닥
  for (const t of [mats.floor.map, mats.floor.normalMap, mats.floor.roughnessMap]) t?.repeat.set(S / 2, S / 2);   // 4m 타일
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(S * 2, S * 2), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  mapGroup.add(floor);
  staticMeshes.push(floor);

  // 외벽
  const wh = def.wallHeight || 6;
  addBox(0, 0, -S - 1, S * 2 + 4, wh, 2, 'wall');
  addBox(0, 0, S + 1, S * 2 + 4, wh, 2, 'wall');
  addBox(-S - 1, 0, 0, 2, wh, S * 2, 'wall');
  addBox(S + 1, 0, 0, 2, wh, S * 2, 'wall');

  buildSkyline(S);

  for (const o of def.objects || []) {
    if (o.type === 'box') {
      for (const b of mirrored(o.pos, o.size, o.mirror)) addBox(b.x, o.y || 0, b.z, b.w, b.h, b.d, o.mat);
    } else if (o.type === 'stairs') {
      const [ex, ez] = o.edge, [dx, dz] = o.dir;
      for (let k = 0; k < o.steps; k++) {
        const h = (o.steps - k) * o.stepH;
        const cx = ex + dx * (k + 0.5) * o.stepD, cz = ez + dz * (k + 0.5) * o.stepD;
        const w = dx ? o.stepD : o.width, d = dx ? o.width : o.stepD;
        addBox(cx, o.y || 0, cz, w, h, d, o.mat);
      }
    }
  }

  world.barrelDefs = def.barrels || [];
  resetBarrels();
  world.navDirty = true;

  for (const m of def.models || []) {
    try { await loadModel(m.url, m); } catch (e) { console.warn('모델 로드 실패:', m.url, e); }
  }
  return def;
}

// 벽 바깥의 건물 실루엣 (충돌·사격 판정 없음). 안개에 묻혀 원근감을 만든다.
function buildSkyline(S) {
  const mat = getMaterials().skyline;
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rnd() * 0.15, dist = S + 26 + rnd() * 50;
    const w = 9 + rnd() * 16, d = 9 + rnd() * 16, h = 12 + rnd() * 38;
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv, dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
    for (let k = 0; k < uv.count; k++) { const [fu, fv] = dims[Math.floor(k / 4)]; uv.setXY(k, uv.getX(k) * fu / 12, uv.getY(k) * fv / 12); }
    const m = new THREE.Mesh(geo, mat);
    m.position.set(Math.cos(a) * dist, h / 2 - 1, Math.sin(a) * dist);
    m.rotation.y = rnd() * Math.PI;
    mapGroup.add(m);
  }
}

// ---------- 폭발 드럼통 ----------
const barrelGeo = new THREE.CylinderGeometry(0.45, 0.45, 1.2, 14);
const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
let barrelLook = null;
// Poly Haven barrel_03 (반지름 0.32, 높이 0.93)을 판정 원통 크기(0.45 × 1.2)에 맞춘다
function barrelModel() {
  if (barrelLook || !A.models.barrel) return barrelLook;
  barrelLook = A.models.barrel.scene;
  barrelLook.scale.set(0.45 / 0.32, 1.2 / 0.93, 0.45 / 0.32);
  barrelLook.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = o.receiveShadow = true;
    // 폭발물임을 알 수 있게 은은하게 달아오른 느낌을 유지
    o.material.emissive = new THREE.Color(0x401000); o.material.emissiveIntensity = 0.5;
  });
  return barrelLook;
}
export function resetBarrels() {
  for (const b of world.barrels) removeBarrel(b, true);
  world.barrels.length = 0;
  world.navDirty = true;
  (world.barrelDefs || []).forEach(([x, z], i) => {
    const mesh = new THREE.Mesh(barrelGeo, getMaterials().barrel);
    mesh.position.set(x, 0.6, z);
    mesh.castShadow = true;
    mapGroup.add(mesh);
    staticMeshes.push(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    // 외부 모델이 있으면 판정용 원통은 숨기고 모델을 겉모습으로 붙인다
    if (barrelModel()) {
      mesh.material = hiddenMat;
      const look = barrelModel().clone();
      look.position.y = -0.6;
      look.rotation.y = i * 2.1;
      mesh.add(look);
    }
    colliders.push(box);
    const barrel = { id: i, mesh, box, alive: true, pos: mesh.position };
    mesh.userData.barrel = barrel;
    world.barrels.push(barrel);
  });
}
export function removeBarrel(b) {
  if (!b.alive) return;
  b.alive = false;
  world.navDirty = true;
  mapGroup.remove(b.mesh);
  let i = staticMeshes.indexOf(b.mesh); if (i >= 0) staticMeshes.splice(i, 1);
  i = colliders.indexOf(b.box); if (i >= 0) colliders.splice(i, 1);
}

// ---------- glTF 모델 ----------
const gltfLoader = new GLTFLoader();
export function loadModel(url, opts = {}) {
  return new Promise((resolve, reject) => {
    gltfLoader.load(url, (gltf) => {
      const root = gltf.scene;
      if (opts.position) root.position.fromArray(opts.position);
      if (opts.rotation) root.rotation.y = opts.rotation;
      if (opts.scale) root.scale.setScalar(opts.scale);
      root.updateMatrixWorld(true);
      root.traverse(o => {
        if (!o.isMesh) return;
        o.castShadow = o.receiveShadow = true;
        staticMeshes.push(o);
        if (opts.collide !== false) colliders.push(new THREE.Box3().setFromObject(o));
      });
      mapGroup.add(root);
      world.navDirty = true;
      resolve(root);
    }, undefined, reject);
  });
}

// ---------- 충돌 ----------
// 원(x,z,r)과 높이 구간 [yMin, yMax]이 겹치는 콜라이더를 반환
export function blocked(x, z, r, yMin, yMax) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z &&
        yMin < b.max.y && yMax > b.min.y) return b;
  }
  return null;
}

// 몸체(body = { p, vy, onGround })를 이동. 벽 미끄러짐 / 계단 오르기 / 중력 처리.
// 수평으로 막혔으면 true 반환.
export function moveBody(b, dx, dz, dt, r, h, step = PLAYER.STEP) {
  const p = b.p;
  let hit = false;
  for (let a = 0; a < 2; a++) {
    const axis = a === 0 ? 'x' : 'z';
    const d = a === 0 ? dx : dz;
    if (!d) continue;
    const old = p[axis];
    p[axis] += d;
    const c = blocked(p.x, p.z, r, p.y + 0.05, p.y + h);
    if (!c) continue;
    const rise = c.max.y - p.y;
    if (b.onGround && rise <= step && !blocked(p.x, p.z, r, c.max.y + 0.02, c.max.y + h)) {
      p.y = c.max.y; // 턱 오르기
    } else {
      p[axis] = d > 0 ? c.min[axis] - r - 0.001 : c.max[axis] + r + 0.001;
      if (blocked(p.x, p.z, r, p.y + 0.05, p.y + h)) p[axis] = old;
      hit = true;
    }
  }
  b.vy -= PLAYER.GRAV * dt;
  p.y += b.vy * dt;
  b.onGround = false;
  if (p.y <= 0) { p.y = 0; b.vy = 0; b.onGround = true; }
  const c = blocked(p.x, p.z, r, p.y, p.y + h);
  if (c) {
    if (b.vy <= 0) { p.y = c.max.y; b.onGround = true; }
    else p.y = c.min.y - h - 0.001;
    b.vy = 0;
  }
  return hit;
}

// 두 점 사이 시야 확인
const losRay = new THREE.Raycaster();
const losDir = new THREE.Vector3();
export function lineOfSight(from, to) {
  losDir.subVectors(to, from);
  const dist = losDir.length();
  if (dist < 0.01) return true;
  losRay.set(from, losDir.divideScalar(dist));
  losRay.far = dist;
  return losRay.intersectObjects(staticMeshes, false).length === 0;
}
