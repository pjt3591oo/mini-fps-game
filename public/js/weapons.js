// 무기: 모델, 사격, 재장전, 교체, 정조준, 수류탄
import * as THREE from 'three';
import { scene, camera, glow } from './engine.js';
import { WEAPONS, WEAPON_ORDER, PLAYER, UPGRADE } from './config.js';
import { G } from './state.js';
import { staticMeshes, blocked } from './world.js';
import { player, controls } from './player.js';
import { damageEnemy, damageBarrel, explode } from './enemies.js';
import { net } from './net.js';
import { burst, tracer, casing } from './effects.js';
import { sfx } from './audio.js';

export const W = {
  current: 'rifle',
  ammo: {},
  lv: {}, pity: {},   // 무기별 강화 단계 / 실패로 쌓인 확률 보정
  cooldown: 0, frameDt: 0,
  reloading: 0,
  switching: 0, pending: null,
  ads: 0, adsHeld: false,
  firing: false, triggerFresh: false,
  recoil: 0,        // 연사 시 탄 퍼짐 누적 (0~1)
  steady: 0,        // 특화 '호흡 정지' 대기 시간
  spreadNow: 0,     // HUD 조준선 표시용
};

// 강화 단계가 반영된 수치
export function magSize(k) { return Math.round(WEAPONS[k].mag * ((W.lv[k] || 0) >= UPGRADE.magAt ? 1.25 : 1)); }
function reloadTime(k) { return WEAPONS[k].reload * G.mods.reload; }
// 무기 k가 lv 단계 이상인가 (5·7단계 고유 효과 판정)
export function hasFx(k, lv) { return (W.lv[k] || 0) >= lv; }
function levelDmg(k) { return 1 + UPGRADE.dmg * (W.lv[k] || 0); }

export function resetWeapons() {
  for (const k of WEAPON_ORDER) W.ammo[k] = WEAPONS[k].dropOnly ? { mag: 0, reserve: 0 } : { mag: WEAPONS[k].mag, reserve: WEAPONS[k].reserve };
  resetRockets();
  Object.assign(W, { cooldown: 0, reloading: 0, switching: 0, pending: null, ads: 0, adsHeld: false, firing: false, recoil: 0 });
  setCurrent('rifle');
  player.grenades = 3;
}

// ---------- 모델 ----------
const gunRoot = new THREE.Group();
gunRoot.scale.setScalar(0.85);
camera.add(gunRoot);
export function setGunVisible(v) { gunRoot.visible = v; }
const GUN_BASE = new THREE.Vector3(0.21, -0.19, -0.42);
const mDark = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.5, metalness: 0.35 });
const mGrey = new THREE.MeshStandardMaterial({ color: 0x6b7683, roughness: 0.55, metalness: 0.3 });
const mWood = new THREE.MeshStandardMaterial({ color: 0x6b4526, roughness: 0.8 });
const mGlass = new THREE.MeshStandardMaterial({ color: 0x1b3a5a, roughness: 0.1, metalness: 0.9 });

function buildGun(parts, muzzleZ, muzzleY = 0.02) {
  const g = new THREE.Group();
  for (const [w, h, d, x, y, z, mat] of parts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    g.add(m);
  }
  g.userData.muzzle = new THREE.Vector3(0, muzzleY, muzzleZ);
  g.visible = false;
  gunRoot.add(g);
  return g;
}
const models = {
  rifle: buildGun([
    [0.07, 0.1, 0.5, 0, 0, 0, mDark],            // 몸체
    [0.035, 0.035, 0.3, 0, 0.02, -0.38, mGrey],  // 총열
    [0.055, 0.14, 0.07, 0, -0.1, 0.1, mDark],    // 손잡이
    [0.05, 0.17, 0.08, 0, -0.12, -0.08, mGrey],  // 탄창
    [0.06, 0.08, 0.2, 0, -0.01, 0.32, mDark],    // 개머리판
    [0.02, 0.035, 0.02, 0, 0.065, -0.2, mGrey],  // 가늠쇠
    [0.03, 0.03, 0.06, 0, 0.065, 0.12, mGrey],   // 가늠자
  ], -0.55),
  shotgun: buildGun([
    [0.075, 0.09, 0.42, 0, 0, 0.05, mDark],
    [0.05, 0.05, 0.5, 0, 0.025, -0.36, mGrey],
    [0.045, 0.04, 0.42, 0, -0.03, -0.32, mGrey],
    [0.07, 0.06, 0.16, 0, -0.035, -0.28, mWood],  // 펌프
    [0.065, 0.1, 0.26, 0, -0.03, 0.36, mWood],    // 개머리판
    [0.055, 0.12, 0.06, 0, -0.09, 0.14, mDark],
  ], -0.63),
  sniper: buildGun([
    [0.065, 0.09, 0.6, 0, 0, 0, mDark],
    [0.03, 0.03, 0.55, 0, 0.015, -0.55, mGrey],
    [0.05, 0.05, 0.06, 0, 0.015, -0.83, mDark],   // 소염기
    [0.05, 0.05, 0.26, 0, 0.085, -0.02, mDark],   // 조준경
    [0.055, 0.055, 0.02, 0, 0.085, -0.16, mGlass],
    [0.07, 0.1, 0.3, 0, -0.02, 0.42, mWood],
    [0.05, 0.13, 0.06, 0, -0.1, 0.12, mDark],
    [0.045, 0.1, 0.1, 0, -0.09, -0.08, mGrey],
  ], -0.87, 0.015),
  pistol: buildGun([
    [0.05, 0.065, 0.24, 0, 0.01, -0.02, mGrey],
    [0.045, 0.13, 0.065, 0, -0.07, 0.06, mDark],
    [0.015, 0.02, 0.02, 0, 0.05, -0.12, mDark],
  ], -0.15, 0.01),
  rocket: buildGun([
    [0.09, 0.09, 0.6, 0, 0.02, -0.22, mGrey],     // 발사관
    [0.11, 0.11, 0.07, 0, 0.02, -0.53, mDark],
    [0.11, 0.11, 0.08, 0, 0.02, 0.09, mDark],
    [0.045, 0.12, 0.055, 0, -0.08, -0.12, mDark], // 손잡이
    [0.025, 0.05, 0.07, 0.06, 0.09, -0.25, mDark],// 조준기
  ], -0.58, 0.02),
};

// 총구 화염: 별 모양으로 번지는 스프라이트
const flashTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.translate(64, 64);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 60);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,220,150,.9)'); rg.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = rg;
  for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(9, -14); g.lineTo(0, -62); g.lineTo(-9, -14); g.fill(); }
  g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill();
  return new THREE.CanvasTexture(c);
})();
const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, color: glow(0xffc880, 2.4), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true }));
flash.visible = false;
gunRoot.add(flash);
const flashLight = new THREE.PointLight(0xffb347, 0, 9);
gunRoot.add(flashLight);
let flashTimer = 0;

// ---------- 외부 총기 모델 (Quaternius / CreativeTrio, CC0) ----------
// 상자 모델과 같은 자리(앞끝 = 총구, 윗면 = 가늠자 높이)에 맞춰 넣어 정조준 위치(adsPos)를 그대로 쓴다.
// len: 전체 길이, front: 총구 z, top: 윗면 y, ry: 모델 회전(총구가 -z를 향하게)
const GUN_FIT = {
  rifle:   { len: 0.98, front: -0.55, top: 0.085, ry: Math.PI / 2 },
  shotgun: { len: 1.1,  front: -0.62, top: 0.06,  ry: Math.PI / 2 },
  sniper:  { len: 1.45, front: -0.87, top: 0.115, ry: Math.PI / 2 },
  pistol:  { len: 0.3,  front: -0.15, top: 0.06,  ry: Math.PI / 2 },
  rocket:  { len: 0.95, front: -0.6,  top: 0.08,  ry: 0 },
};
const _v = new THREE.Vector3();
export function upgradeGunModels(srcModels) {
  for (const k in GUN_FIT) {
    const src = srcModels[k];
    if (!src) continue;
    const f = GUN_FIT[k], look = src.scene.clone(true);
    look.rotation.y = f.ry;
    const box = new THREE.Box3().setFromObject(look);
    const s = f.len / (box.max.z - box.min.z);
    look.scale.setScalar(s);
    box.setFromObject(look);
    look.position.set(-(box.min.x + box.max.x) / 2, f.top - box.max.y, f.front - box.min.z);
    look.updateMatrixWorld(true);
    // 총구 높이: 앞쪽 4% 구간 정점들의 평균 y
    let sy = 0, n = 0;
    const zCut = f.front + f.len * 0.04;
    look.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = false;
      o.frustumCulled = false;
      const m = o.material;
      // 원본 색이 거의 검정이라 하늘 반사만 보여 파랗게 뜬다: 색을 살짝 올리고 반사를 줄인다
      m.color.multiplyScalar(/glass/i.test(m.name) ? 1 : 2.6);
      m.envMapIntensity = 0.35;
      // 외형 색(setGunSkin)이 바꿀 몸체 재질: 금속·유리가 아닌 것
      if (!/metal|glass/i.test(m.name)) { m.userData.skin = true; m.userData.base = m.color.clone(); }
      if (/metal/i.test(m.name)) { m.metalness = 0.55; m.roughness = 0.42; }
      else if (/black|dark|main|grey/i.test(m.name)) { m.metalness = 0.3; m.roughness = 0.55; }
      else if (/glass/i.test(m.name)) { m.metalness = 0.9; m.roughness = 0.08; m.envMapIntensity = 1; }
      else m.roughness = Math.max(m.roughness ?? 1, 0.65);
      const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        _v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        if (_v.z < zCut) { sy += _v.y; n++; }
      }
    });
    const g = models[k];
    for (const c of g.children) c.visible = false;   // 상자 모델은 숨김 (대체용으로 남겨 둠)
    g.add(look);
    g.userData.muzzle.set(0, n ? sy / n : f.top - 0.03, f.front - 0.02);
  }
  setCurrent(W.current);
}

// 무기 외형 색 (보관함). perWeapon: { 무기: 물건 | 색 숫자 | null } — null이면 원래 색
// 물건 값: color(몸체 색), metal·rough(재질), glow·glowI(발광)
export function setGunSkin(perWeapon) {
  for (const k in models) {
    let v = perWeapon[k] ?? null;
    if (typeof v === 'number') v = { color: v };
    models[k].traverse(o => {
      const m = o.material;
      if (!o.isMesh || !m?.userData.skin) return;
      if (v == null) { m.color.copy(m.userData.base); m.metalness = 0.3; m.roughness = 0.55; m.emissive.setHex(0); return; }
      m.color.setHex(v.color).multiplyScalar(0.55);
      m.metalness = v.metal ?? 0.4; m.roughness = v.rough ?? 0.55;
      if (v.glow) { m.emissive.setHex(v.glow); m.emissiveIntensity = v.glowI ?? 0.35; } else m.emissive.setHex(0);
    });
  }
}

function setCurrent(name) {
  W.current = name;
  for (const k in models) models[k].visible = k === name;
  const mz = models[name].userData.muzzle;
  flash.position.copy(mz);
  flashLight.position.copy(mz);
}

// ---------- 조작 ----------
// 보급 전용 무기는 탄이 있을 때만 꺼낼 수 있다
export function usable(name) {
  return !WEAPONS[name].dropOnly || W.ammo[name].mag + W.ammo[name].reserve > 0;
}
export function grantRocket() {
  const def = WEAPONS.rocket;
  W.ammo.rocket = { mag: def.mag, reserve: def.reserve };
  switchWeapon('rocket');
}

export function switchWeapon(name) {
  if (!WEAPONS[name] || name === W.current && !W.pending || player.dead || !usable(name)) return;
  if (name === W.current) { W.pending = null; return; }
  W.pending = name;
  W.reloading = 0;
  if (W.switching <= 0) W.switching = 0.36;
  sfx.switchWeapon();
}
export function cycleWeapon(dir) {
  const cur = W.pending || W.current;
  let i = WEAPON_ORDER.indexOf(cur);
  do { i = (i + dir + WEAPON_ORDER.length) % WEAPON_ORDER.length; } while (!usable(WEAPON_ORDER[i]));
  switchWeapon(WEAPON_ORDER[i]);
}

export function reload() {
  const a = W.ammo[W.current], def = WEAPONS[W.current];
  if (W.reloading > 0 || W.switching > 0 || a.mag >= magSize(W.current) || a.reserve <= 0 || player.dead) return;
  W.reloading = reloadTime(W.current);
  sfx.reloadStart(W.current, W.reloading);
}

export function addAmmo(frac, nade = true) {
  for (const k of WEAPON_ORDER) {
    const def = WEAPONS[k];
    if (!isFinite(def.reserve) || def.dropOnly) continue;
    const max = Math.round(def.reserve * G.mods.ammo);
    W.ammo[k].reserve = Math.min(max, W.ammo[k].reserve + Math.ceil(def.reserve * frac));
  }
  if (nade) player.grenades = Math.min(4, player.grenades + 1);
}

// ---------- 사격 ----------
const raycaster = new THREE.Raycaster();
raycaster.far = 250;
const ndc = new THREE.Vector2();
const muzzlePos = new THREE.Vector3();
const endPos = new THREE.Vector3(), _cd = new THREE.Vector3(), _cr = new THREE.Vector3();

function currentSpread() {
  const def = WEAPONS[W.current];
  const hip = def.hipSpread ?? def.spread;
  let adsMul = W.current === 'rifle' && hasFx('rifle', 5) ? def.adsSpreadMul * 0.6 : def.adsSpreadMul;
  if (W.current === 'shotgun' && G.mods.slug) adsMul *= 0.6;   // 특화: 슬러그 장전
  let s = hip + (def.spread * adsMul - hip) * W.ads;
  const hs = Math.hypot(player.vel.x, player.vel.z);
  const movePen = (hs > 1 ? 0.012 * Math.min(hs / PLAYER.SPEED, 1.6) : 0) + (player.onGround ? 0 : 0.03);
  s += movePen * (1 - W.ads * 0.6) * (player.crouch ? 0.5 : 1);
  s += W.recoil * 0.022 * (1 - W.ads * 0.5);
  return s;
}

function fire() {
  const def = WEAPONS[W.current], a = W.ammo[W.current];
  a.mag--;
  // 연사 간격: 지난 프레임에서 남은 시간을 넘겨 준다. 그냥 다시 채우면 간격이 프레임 단위로 올림돼
  // 60fps에서 소총이 설계보다 14% 느리게, 화면 주사율마다 다르게 쏜다 (사이클 13).
  // 넘겨 주는 양은 한 프레임까지 — 오래 쉬었다 쏴도 한 프레임에 두 발이 나가지 않는다.
  W.cooldown = Math.max(W.cooldown, -W.frameDt) + def.fireDelay / G.mods.fireRate;
  const spread = currentSpread();
  // 특화 '호흡 정지': 정조준으로 1.5초 멈춰 있었으면 이번 한 발 +25%
  const steadyShot = W.current === 'sniper' && G.mods.steady && W.steady >= 1.5;
  W.steady = 0;

  camera.updateMatrixWorld();
  muzzlePos.copy(models[W.current].userData.muzzle);
  gunRoot.localToWorld(muzzlePos);

  if (def.rocket) {
    // 로켓: 직선으로 날아가 닿는 곳에서 폭발
    raycaster.setFromCamera(ndc.set(0, 0), camera);
    const d = raycaster.ray.direction;
    const mesh = new THREE.Mesh(rocketGeo, rocketMat);
    mesh.position.copy(camera.position).addScaledVector(d, 0.9);
    mesh.position.y -= 0.12;
    mesh.lookAt(mesh.position.clone().add(d));
    scene.add(mesh);
    rockets.push({ mesh, p: mesh.position, v: d.clone().multiplyScalar(def.rocket.speed), life: 4, def, trail: 0 });
    G.stats.shots++;
    W.recoil = 1;
    camera.rotation.x = Math.min(camera.rotation.x + def.recoil, Math.PI / 2 - 0.01);
    gunKick += def.kick;
    sfx.rocket();
    return;
  }

  for (const e of G.enemies) e.group.updateMatrixWorld(); // 이번 프레임 위치로 판정
  const targets = staticMeshes.concat(G.enemies.flatMap(e => e.parts));
  let hitAny = false, killAny = false, headAny = false;
  const ends = [];
  const cur = W.current;
  const pellets = cur === 'shotgun' && hasFx(cur, 5) ? 11 : def.pellets;
  const falloff = cur === 'shotgun' && hasFx(cur, 7) ? def.falloff * 1.5 : def.falloff;
  const headMul = cur === 'pistol' && hasFx(cur, 5) ? 3.5 : def.headMul;
  for (let i = 0; i < pellets; i++) {
    // 원형 분포
    const ang = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * spread;
    ndc.set(Math.cos(ang) * rad / camera.aspect, Math.sin(ang) * rad);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(targets, false);
    let pierce = cur === 'sniper' && hasFx(cur, 5) ? 4 : def.pierce || 0;
    const struck = new Set();
    endPos.copy(raycaster.ray.origin).addScaledVector(raycaster.ray.direction, 120);
    for (const h of hits) {
      const ud = h.object.userData;
      if (ud.enemy) {
        const e = ud.enemy;
        if (e.dead || struck.has(e)) continue;
        struck.add(e);
        const head = ud.part === 'head';
        let dmg = def.dmg * levelDmg(W.current) * (head ? headMul : 1);
        if (falloff) dmg *= Math.max(0.25, 1 - h.distance / falloff * 0.75);
        // 해금 특성 '근접 사격': 샷건·권총, 10m 안, 장수만큼 +20%씩 더한다
        if (G.mods.close && (cur === 'shotgun' || cur === 'pistol') && h.distance < 10) dmg *= 1 + 0.2 * G.mods.close;
        if (steadyShot) dmg *= 1.25;   // 특화: 호흡 정지
        const killed = damageEnemy(e, dmg, h.point, head);
        hitAny = true; killAny ||= killed; headAny ||= head;
        if (pierce-- > 0) continue;
        endPos.copy(h.point);
        break;
      }
      endPos.copy(h.point);
      if (ud.barrel) damageBarrel(ud.barrel, def.dmg);
      else {
        burst(h.point, 0xffc070, 4, 2.4, 0.28, true);
        if (i < 2) sfx.impact(h.object.material?.metalness > 0.2, Math.max(0.2, 1 - h.distance / 50));
      }
      break;
    }
    if (i < 4) { tracer(muzzlePos, endPos); ends.push(+endPos.x.toFixed(1), +endPos.y.toFixed(1), +endPos.z.toFixed(1)); }
  }
  G.stats.shots++;
  if (hitAny) {
    G.stats.hits++; if (headAny) G.stats.heads++;
    sfx.hit(headAny);
    G.hooks.hitmarker?.(killAny, headAny);
  }

  // 반동
  W.recoil = Math.min(1, W.recoil + (def.auto ? 0.22 : 0.5));
  const adsMul = (1 - W.ads * 0.45) * (W.current === 'rifle' && G.mods.recoilCut ? 0.65 : 1);   // 특화: 점사 제어
  camera.rotation.x = Math.min(camera.rotation.x + def.recoil * adsMul, Math.PI / 2 - 0.01);
  camera.rotation.y += (Math.random() - 0.5) * def.recoil * 0.6 * adsMul;
  gunKick += def.kick;
  flash.visible = true;
  flash.scale.setScalar(0.26 * (def.pellets > 1 ? 1.9 : W.current === 'sniper' ? 1.7 : W.current === 'pistol' ? 0.75 : 1) * (0.85 + Math.random() * 0.3));
  flash.material.rotation = Math.random() * Math.PI;
  // 탄피 배출
  camera.getWorldDirection(_cd);
  _cr.crossVectors(_cd, camera.up).normalize();
  casing(muzzlePos.clone().addScaledVector(_cd, -0.35).addScaledVector(_cr, 0.03),
    _cr.clone().multiplyScalar(1.6 + Math.random()).add(new THREE.Vector3(player.vel.x, 2 + Math.random(), player.vel.z)));
  flashLight.intensity = 5;
  flashTimer = 0.045;
  sfx.shot(W.current);
  net.send('shot', { w: W.current, f: [+muzzlePos.x.toFixed(1), +muzzlePos.y.toFixed(1), +muzzlePos.z.toFixed(1)], e: ends });
}

// ---------- 로켓 ----------
const rockets = [];
const rocketGeo = new THREE.BoxGeometry(0.1, 0.1, 0.45);
const rocketMat = new THREE.MeshStandardMaterial({ color: 0xd0d4d8, emissive: 0xff6010, emissiveIntensity: 2.5 });
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i], p = r.p;
    p.addScaledVector(r.v, dt);
    r.life -= dt;
    r.trail -= dt;
    if (r.trail <= 0) { r.trail = 0.03; burst(p, 0xffa040, 1, 0.6, 0.35, true); }
    let hit = r.life <= 0 || p.y < 0.1 || !!blocked(p.x, p.z, 0.12, p.y - 0.12, p.y + 0.12);
    if (!hit) for (const e of G.enemies) {
      if (Math.hypot(e.p.x - p.x, e.p.z - p.z) < e.r + 0.35 && p.y > e.p.y - 0.2 && p.y < e.p.y + e.h + 0.2) { hit = true; break; }
    }
    if (hit) {
      scene.remove(r.mesh);
      rockets.splice(i, 1);
      p.addScaledVector(r.v, -dt * 0.5);
      explode(p.clone(), r.def.rocket.r, r.def.dmg, r.def.rocket.pd, true, '내 로켓');
    }
  }
}
function resetRockets() {
  for (const r of rockets) scene.remove(r.mesh);
  rockets.length = 0;
}

// ---------- 수류탄 ----------
const grenadeGeo = new THREE.SphereGeometry(0.11, 10, 8);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6, emissive: 0x200000 });
const dir = new THREE.Vector3();
export function throwGrenade() {
  if (player.grenades <= 0 || player.dead) return;
  player.grenades--;
  camera.getWorldDirection(dir);
  const mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
  mesh.position.copy(camera.position).addScaledVector(dir, 0.6);
  mesh.position.y -= 0.15;
  scene.add(mesh);
  const v = dir.clone().multiplyScalar(17);
  v.y += 4.5;
  v.x += player.vel.x * 0.5; v.z += player.vel.z * 0.5;
  G.grenades.push({ mesh, p: mesh.position, v, fuse: 1.8 });
  sfx.throwG();
}
function updateGrenades(dt) {
  for (let i = G.grenades.length - 1; i >= 0; i--) {
    const g = G.grenades[i], p = g.p, v = g.v, r = 0.11;
    g.fuse -= dt;
    v.y -= PLAYER.GRAV * dt;
    for (const axis of ['x', 'y', 'z']) {
      const old = p[axis];
      p[axis] += v[axis] * dt;
      if (p.y < r || blocked(p.x, p.z, r, p.y - r, p.y + r)) {
        p[axis] = old;
        v[axis] *= -0.4;
        if (axis === 'y') { v.x *= 0.75; v.z *= 0.75; }
      }
    }
    g.mesh.rotation.x += dt * 8;
    if (g.fuse <= 0) {
      scene.remove(g.mesh);
      G.grenades.splice(i, 1);
      explode(p.clone(), 7.5, 230, 70, true, '내 수류탄');
    }
  }
}
export function resetGrenades() {
  for (const g of G.grenades) scene.remove(g.mesh);
  G.grenades.length = 0;
}

// ---------- 매 프레임 ----------
let gunKick = 0;
const gunTarget = new THREE.Vector3();
export function updateWeapons(dt, sprinting) {
  const def = WEAPONS[W.current], a = W.ammo[W.current];
  W.cooldown -= dt;
  W.frameDt = dt;
  // 특화 '호흡 정지': 저격총 정조준 중 수평 속도 1 이하로 버틴 시간
  const still = W.current === 'sniper' && G.mods.steady && W.ads > 0.9 && Math.hypot(player.vel.x, player.vel.z) <= 1;
  const wasReady = W.steady >= 1.5;
  W.steady = still ? W.steady + dt : 0;
  if (!wasReady && W.steady >= 1.5) G.hooks.steady?.();

  // 무기 교체 (내렸다 올리기)
  if (W.switching > 0) {
    const before = W.switching;
    W.switching -= dt;
    if (before > 0.18 && W.switching <= 0.18 && W.pending) { setCurrent(W.pending); W.pending = null; W.cooldown = 0.1; }
    if (W.switching <= 0 && W.pending) W.switching = 0.36;
  }

  // 재장전
  if (W.reloading > 0) {
    W.reloading -= dt;
    if (W.reloading <= 0) {
      W.reloading = 0;
      const need = magSize(W.current) - a.mag, take = Math.min(need, a.reserve);
      a.mag += take;
      if (isFinite(a.reserve)) a.reserve -= take;
      sfx.reloadEnd(W.current);
    }
  }

  // 사격
  const canAct = !player.dead && W.switching <= 0 && W.reloading <= 0;
  const auto = def.auto || (W.current === 'pistol' && G.mods.autoPistol);   // 특화: 속사 권총
  if (W.firing && canAct && W.cooldown <= 0 && (auto || W.triggerFresh)) {
    W.triggerFresh = false;
    if (a.mag > 0) fire();
    else if (a.reserve > 0) reload();
    else { sfx.empty(); W.cooldown = 0.25; }
  }
  if (canAct && a.mag === 0 && a.reserve > 0 && !W.firing && W.cooldown <= -0.3) reload();
  W.recoil = Math.max(0, W.recoil - dt * 2.2);

  // 정조준
  const wantAds = W.adsHeld && canAct && !sprinting;
  W.ads += ((wantAds ? 1 : 0) - W.ads) * (1 - Math.exp(-(def.scope ? 11 : 16) * dt));
  if (W.ads < 0.001) W.ads = 0;
  const base = G.settings.fov;
  const fov = base + (def.adsFov - base) * W.ads + player.fovKick * 7 * (1 - W.ads);
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  controls.pointerSpeed = G.settings.sens * Math.min(1, fov / base);
  const scoped = !!def.scope && W.ads > 0.8;
  gunRoot.visible = !scoped && !player.dead;
  G.hooks.scope?.(scoped);
  W.spreadNow = currentSpread();

  flashTimer -= dt;
  if (flashTimer <= 0) { flash.visible = false; flashLight.intensity = 0; }

  // 총 위치 애니메이션
  const hs = Math.hypot(player.vel.x, player.vel.z) / PLAYER.SPEED;
  const swayAmt = 1 - W.ads * 0.85;
  const swayX = Math.sin(player.bob) * 0.012 * hs * swayAmt;
  const swayY = Math.abs(Math.cos(player.bob)) * 0.01 * hs * swayAmt;
  const rt = W.reloading > 0 ? Math.sin((1 - W.reloading / reloadTime(W.current)) * Math.PI) : 0;
  const sw = W.switching > 0 ? Math.sin((1 - W.switching / 0.36) * Math.PI) : 0;
  const sp = sprinting ? 1 : 0;
  gunTarget.set(
    GUN_BASE.x + (def.adsPos[0] - GUN_BASE.x) * W.ads + swayX - sp * 0.06,
    GUN_BASE.y + (def.adsPos[1] - GUN_BASE.y) * W.ads + swayY - rt * 0.16 - sw * 0.3 - sp * 0.04,
    GUN_BASE.z + (def.adsPos[2] - GUN_BASE.z) * W.ads
  );
  const k = 1 - Math.exp(-18 * dt);
  gunRoot.position.lerp(gunTarget, k);
  gunKick *= Math.exp(-14 * dt);
  gunRoot.position.z += gunKick * k * 2.2;
  gunRoot.rotation.x = -rt * 0.9 - sw * 0.7 + gunKick * 0.8;
  gunRoot.rotation.z = rt * 0.4;
  gunRoot.rotation.y = sp * 0.5 * (1 - W.ads);

  updateGrenades(dt);
  updateRockets(dt);
  // 보급 무기를 다 쓰면 소총으로 돌아간다
  if (def.dropOnly && a.mag + a.reserve === 0 && !W.pending && W.cooldown < 0.3) switchWeapon('rifle');
}

// 다른 플레이어의 사격 표시
const _f = new THREE.Vector3(), _e = new THREE.Vector3();
net.on('shot', (msg) => {
  _f.fromArray(msg.f);
  for (let i = 0; i + 2 < msg.e.length; i += 3) { _e.set(msg.e[i], msg.e[i + 1], msg.e[i + 2]); tracer(_f, _e); }
  sfx.shot(msg.w, Math.max(0.1, 0.8 - _f.distanceTo(player.p) / 60));
});

resetWeapons();
