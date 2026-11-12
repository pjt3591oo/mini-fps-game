// 플레이어 이동 / 체력
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { camera } from './engine.js';
import { PLAYER, DASH, ITEMS } from './config.js';
import { G } from './state.js';
import { blocked, moveBody, world } from './world.js';
import { sfx } from './audio.js';

export const controls = new PointerLockControls(camera, document.body);

export const player = {
  p: new THREE.Vector3(),
  vel: new THREE.Vector3(),   // 수평 속도 (x, z)
  vy: 0,
  onGround: true,
  hp: PLAYER.MAX_HP,
  dead: false,
  crouch: false,
  height: PLAYER.H,
  eye: PLAYER.EYE,
  viewY: PLAYER.EYE,
  bob: 0,
  lastHurt: -99,
  grenades: 3,
  shake: 0,
  dashT: 0, dashCd: 0, dashDir: new THREE.Vector3(), iframe: -1, fovKick: 0, airLeft: 0,
  onHurt: null,   // (dmg, fromPos) => void
  onDeath: null,
};

const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();

export function resetPlayer(spawnIndex = 0) {
  const s = world.playerSpawns[spawnIndex % world.playerSpawns.length];
  player.p.set(s[0], s[1], s[2]);
  player.vel.set(0, 0, 0);
  Object.assign(player, {
    vy: 0, onGround: true, hp: G.mods.maxHp, dead: false, crouch: false,
    height: PLAYER.H, eye: PLAYER.EYE, bob: 0, lastHurt: -99, shake: 0,
    dashT: 0, dashCd: 0, iframe: -1, fovKick: 0,
  });
  player.viewY = player.p.y + PLAYER.EYE;
  camera.position.set(player.p.x, player.viewY, player.p.z);
}

// src: 피해 출처 이름 (결과 화면과 판 기록에 쓴다)
export function hurtPlayer(dmg, from, src = '기타') {
  if (player.dead || G.mode !== 'playing' || G.time < player.iframe) return;
  if (G.mods.guard && player.hp < G.mods.maxHp * 0.35) dmg = Math.round(dmg * 0.6);
  if (G.time < G.buffs.shield) dmg = Math.round(dmg * (1 - ITEMS.shield.cut));
  player.hp -= dmg;
  G.stats.taken += dmg;
  G.stats.by[src] = (G.stats.by[src] || 0) + dmg;
  player.lastSrc = src;
  player.lastHurt = G.time;
  player.shake = Math.min(0.6, player.shake + dmg * 0.012);
  sfx.hurt();
  if (player.onHurt) player.onHurt(dmg, from);
  if (player.hp <= 0) {
    player.hp = 0;
    player.dead = true;
    sfx.die();
    if (player.onDeath) player.onDeath();
  }
}

export function healPlayer(amount) {
  // 보호막으로 최대치를 넘긴 체력은 깎지 않는다
  player.hp = Math.max(player.hp, Math.min(G.mods.maxHp, player.hp + amount));
}

// 대시: 이동 방향(입력이 없으면 정면)으로 짧게 돌진, 잠깐 무적
export function dash() {
  if (player.dead || player.dashCd > 0) return false;
  const keys = G.keys, d = player.dashDir;
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize();
  d.set(0, 0, 0);
  if (keys.KeyW) d.add(fwd);
  if (keys.KeyS) d.sub(fwd);
  if (keys.KeyD) d.add(right);
  if (keys.KeyA) d.sub(right);
  if (d.lengthSq() === 0) d.copy(fwd);
  d.normalize();
  player.dashT = DASH.dur; player.dashCd = DASH.cd * G.mods.dashCd;
  player.iframe = G.time + DASH.iframe;
  player.fovKick = 1;
  sfx.dash();
  return true;
}

export function jump() {
  if (player.dead) return;
  if (player.onGround) player.airLeft = G.mods.airJumps;
  else if (player.airLeft > 0) player.airLeft--;
  else return;
  player.vy = PLAYER.JUMP;
  player.onGround = false;
  sfx.jump();
}

export function updatePlayer(dt, ads) {
  const p = player.p, v = player.vel, keys = G.keys;

  // 앉기 (일어설 때 머리 위 공간 확인)
  const wantCrouch = !!keys.KeyC; // Ctrl은 Ctrl+W(탭 닫기)와 겹쳐서 쓰지 않는다
  if (wantCrouch) player.crouch = true;
  else if (player.crouch && !blocked(p.x, p.z, PLAYER.R, p.y + 0.05, p.y + PLAYER.H)) player.crouch = false;
  player.height = player.crouch ? PLAYER.CROUCH_H : PLAYER.H;
  const eyeTarget = player.crouch ? PLAYER.CROUCH_EYE : PLAYER.EYE;
  player.eye += (eyeTarget - player.eye) * (1 - Math.exp(-14 * dt));

  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  right.crossVectors(fwd, camera.up).normalize();
  wish.set(0, 0, 0);
  if (!player.dead) {
    if (keys.KeyW) wish.add(fwd);
    if (keys.KeyS) wish.sub(fwd);
    if (keys.KeyD) wish.add(right);
    if (keys.KeyA) wish.sub(right);
  }
  const sprinting = keys.ShiftLeft && keys.KeyW && !player.crouch && !ads;
  let speed = player.crouch ? PLAYER.CROUCH_SPEED : sprinting ? PLAYER.SPRINT : PLAYER.SPEED;
  if (ads) speed *= 0.6;
  speed *= G.mods.speed;
  if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(speed);

  const accel = player.onGround ? 14 : 3;
  const k = 1 - Math.exp(-accel * dt);
  v.x += (wish.x - v.x) * k;
  v.z += (wish.z - v.z) * k;

  player.dashCd = Math.max(0, player.dashCd - dt);
  player.fovKick = Math.max(0, player.fovKick - dt * 4);
  if (player.dashT > 0) {
    player.dashT -= dt;
    v.x = player.dashDir.x * DASH.speed; v.z = player.dashDir.z * DASH.speed;
  }

  const prevY = p.y;
  moveBody(player, v.x * dt, v.z * dt, dt, PLAYER.R, player.height);

  // 체력 자연 회복
  if (!player.dead && G.time - player.lastHurt > PLAYER.REGEN_DELAY && player.hp < G.mods.maxHp)
    player.hp = Math.min(G.mods.maxHp, player.hp + PLAYER.REGEN_RATE * dt);

  // 카메라: 계단을 오를 때 부드럽게 따라가도록 보간
  const hs = Math.hypot(v.x, v.z);
  if (player.onGround && hs > 0.5) {
    const before = Math.floor(player.bob * 2 / Math.PI);
    player.bob += dt * hs * 1.6;
    // 발이 땅에 닿는 순간(흔들림 주기의 반)마다 발소리
    if (Math.floor(player.bob * 2 / Math.PI) !== before) sfx.step(player.crouch ? 0.4 : Math.min(1.3, hs / PLAYER.SPEED));
  }
  const bobY = Math.sin(player.bob * 2) * 0.03 * Math.min(hs / PLAYER.SPEED, 1.4);
  const targetY = p.y + (player.dead ? 0.35 : player.eye);
  const stepped = player.onGround && Math.abs(p.y - prevY) > 0.2;
  if (stepped || Math.abs(targetY - player.viewY) < 0.6 && player.onGround)
    player.viewY += (targetY - player.viewY) * (1 - Math.exp(-18 * dt));
  else player.viewY = targetY;

  player.shake = Math.max(0, player.shake - dt * 1.8);
  const sh = player.shake * player.shake;
  camera.position.set(
    p.x + (Math.random() - 0.5) * sh * 0.5,
    player.viewY + bobY + (Math.random() - 0.5) * sh * 0.5,
    p.z + (Math.random() - 0.5) * sh * 0.5
  );
  return sprinting;
}
