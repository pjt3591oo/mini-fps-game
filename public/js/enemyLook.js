// 적 겉모습: Quaternius SWAT 캐릭터(CC0)를 판정용 도형 위에 입히고 상태에 맞춰 애니메이션한다.
// 사격 판정은 여전히 enemies.js의 기본 도형(parts)이 맡는다. 도형은 보이지 않게만 바꾼다.
// 재질은 Enemy의 bodyMat / headMat / visorMat을 그대로 써서 피격 번쩍임·공격 예고 발광이 모델에 나타난다.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { A } from './assets.js';

const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
const hornGeo = new THREE.ConeGeometry(0.06, 0.3, 8);
const padGeo = new THREE.BoxGeometry(0.22, 0.12, 0.26);
const CLIP = n => 'CharacterArmature|' + n;
// 손에 쥔 총의 자세 (WristR 뼈 기준. three.js가 뼈 이름의 '.'을 지운다)
const GUN_ROT = [0, 0, Math.PI / 2], GUN_POS = [0, 0.05, 0];
let base = null;   // { scene, clips, scale }

function prepare() {
  if (base || !A.models.soldier) return base;
  const g = A.models.soldier;
  // 메시 노드에 ×100 배율이 걸려 있어 일반 경계 상자는 틀린다. 뼈 변환을 반영한 정밀 계산을 쓴다.
  g.scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g.scene, true);
  const h = box.max.y - box.min.y;
  base = { scene: g.scene, clips: new Map(g.animations.map(c => [c.name, c])), scale: 1.8 / h, y: -box.min.y };
  return base;
}

function bone(root, name) {
  let b = null;
  root.traverse(o => { if (!b && o.isBone && o.name === name) b = o; });
  return b;
}

export function attachLook(e) {
  if (!prepare()) return null;
  const look = cloneSkinned(base.scene);
  look.scale.setScalar(base.scale);
  look.position.y = base.y * base.scale;
  // 기본 재질을 적의 재질로 교체 (Swat = 옷, Swat_Black = 장비, Visor = 고글)
  e.headMat.color.setHex(e.def.boss ? 0x1a1a1f : 0x30343b);
  e.headMat.roughness = 0.55; e.headMat.metalness = 0.25;
  e.bodyMat.roughness = 0.75; e.bodyMat.metalness = 0.05;
  look.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.frustumCulled = false;   // 애니메이션으로 경계 밖에 나가도 사라지지 않게
    const n = o.material.name;
    if (n === 'Swat') o.material = e.bodyMat;
    else if (n === 'Swat_Black') o.material = e.headMat;
    else if (n === 'Visor') o.material = e.visorMat;
  });
  // 판정 도형은 숨긴다
  for (const p of e.parts) { p.material = hiddenMat; p.castShadow = false; }
  look.updateMatrixWorld(true);
  // 뼈에 물체를 붙인다. 크기·위치는 미터 단위(적 크기 배율 1 기준)로 받는다
  const attach = (boneName, obj, [x, y, z], scale = 1) => {
    const b = bone(look, boneName);
    if (!b) return;
    const ws = b.getWorldScale(new THREE.Vector3()).x;
    obj.scale.multiplyScalar(scale / ws);
    obj.position.set(x / ws, y / ws, z / ws);
    obj.traverse(o => { if (o.isMesh) o.castShadow = true; });
    b.add(obj);
  };

  // 원거리 적(사수·척탄병)은 소총을 든다
  if ((e.def.ranged || e.def.mortar) && !e.def.boss && A.models.rifle) {
    const gun = A.models.rifle.scene.clone(true);
    const b = new THREE.Box3().setFromObject(gun);
    gun.scale.setScalar(1 / (b.max.x - b.min.x));   // 길이 1m로 맞춘 뒤 attach에서 0.75배
    gun.rotation.set(...GUN_ROT);
    attach('WristR', gun, GUN_POS, 0.75);
  }
  // 보스: 뿔, 중장갑·보스: 어깨 장갑
  if (e.def.boss) {
    for (const s of [1, -1]) {
      const h = new THREE.Mesh(hornGeo, e.visorMat);
      h.rotation.z = -0.35 * s;
      attach('Head', h, [0.1 * s, 0.3, 0]);
    }
  }
  if (e.type === 'tank' || e.def.boss) {
    for (const n of ['ShoulderL', 'ShoulderR']) attach(n, new THREE.Mesh(padGeo, e.headMat), [0, 0.1, 0]);
  }
  e.model.add(look);

  const mixer = new THREE.AnimationMixer(look);
  const act = (name, once) => {
    const c = base.clips.get(CLIP(name));
    if (!c) return null;
    const a = mixer.clipAction(c);
    if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    return a;
  };
  const L = {
    look, mixer, cur: null, oneShot: 0,
    walk: act('Walk'), run: act('Run'), idle: act(e.def.ranged ? 'Idle_Gun' : 'Idle'),
    aim: act('Idle_Gun_Pointing'), shoot: act('Gun_Shoot', true),
    punch: act('Punch_Right', true), hit: act('HitRecieve', true), death: act('Death', true),
    lastX: e.p.x, lastZ: e.p.z, speed: 0,
  };
  mixer.addEventListener('finished', () => { L.oneShot = 0; });
  play(L, L.idle, 0);
  return L;
}

function play(L, a, fade = 0.18, timeScale = 1) {
  if (!a) return;
  a.timeScale = timeScale;
  if (L.cur === a) return;
  a.reset().play();
  if (L.cur) a.crossFadeFrom(L.cur, fade, false);
  L.cur = a;
}

// 매 프레임: 이동 속도·공격 상태로 동작을 고른다 (호스트·비호스트 모두 같은 정보로 판단)
export function updateLook(e, dt) {
  const L = e.look;
  if (!L) return;
  const sp = Math.hypot(e.p.x - L.lastX, e.p.z - L.lastZ) / Math.max(dt, 1e-4);
  L.lastX = e.p.x; L.lastZ = e.p.z;
  L.speed += (Math.min(sp, 20) - L.speed) * Math.min(1, dt * 10);
  const v = L.speed / e.def.scale;   // 몸집이 크면 같은 속도라도 걸음이 느려 보이게

  if (e.lunge > 0.3 && L.cur !== L.punch) { play(L, L.punch, 0.08, 1.6); L.oneShot = 0.5; }
  else if (e.stun > 0 && L.cur !== L.hit) { play(L, L.hit, 0.06, 1.4); L.oneShot = 0.35; }
  L.oneShot -= dt;
  if (L.oneShot <= 0) {
    if (e.tele > 0 && e.teleKind === 'shot') play(L, L.aim, 0.12);
    else if (v > 4.2) play(L, L.run, 0.2, v / 6);
    else if (v > 0.4) play(L, L.walk, 0.2, Math.max(0.6, v / 2.2));
    else play(L, L.idle, 0.3);
  }
  L.mixer.update(dt);
}

// 원거리 공격 발사 순간
export function lookShoot(e) {
  const L = e.look;
  if (!L || !L.shoot) return;
  play(L, L.shoot, 0.05, 1.5); L.oneShot = 0.3;
}

export function lookDie(e) {
  const L = e.look;
  if (!L) return false;
  play(L, L.death, 0.1, 1.3);
  L.oneShot = 99;
  return true;
}
