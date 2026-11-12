// 파티클, 탄 궤적, 폭발, 피해 숫자
import * as THREE from 'three';
import { scene, camera, glow } from './engine.js';
import { PLAYER } from './config.js';
import { G } from './state.js';

const effects = [];
const particleGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
const matCache = new Map();
// hot: 밝기를 1 위로 올려 빛 번짐이 생기는 불꽃/스파크
function particleMat(color, hot) {
  const key = color + (hot ? 'h' : '');
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshBasicMaterial({ color: hot ? glow(color, 2.6) : color }));
  return matCache.get(key);
}

export function burst(point, color, count, power = 3, life = 0.5, hot = false) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(particleGeo, particleMat(color, hot));
    m.position.copy(point);
    scene.add(m);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5)
      .normalize().multiplyScalar(power * (0.4 + Math.random()));
    const l = life * (0.6 + Math.random() * 0.8);
    effects.push({ obj: m, vel: v, life: l, max: l, shrink: true });
  }
}

// 탄 궤적: 빛나는 가는 막대
const tracerGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);
export function tracer(from, to, color = 0xffd9a0, life = 0.07) {
  const mat = new THREE.MeshBasicMaterial({ color: glow(color, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(tracerGeo, mat);
  m.position.copy(from);
  m.lookAt(to);
  m.scale.set(0.015, 0.015, from.distanceTo(to));
  scene.add(m);
  effects.push({ obj: m, life, max: life, mat, own: true, keepGeo: true });
}

// 탄피
const casingGeo = new THREE.BoxGeometry(0.011, 0.011, 0.032);
const casingMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.35 });
export function casing(pos, vel) {
  const m = new THREE.Mesh(casingGeo, casingMat);
  m.position.copy(pos);
  m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  scene.add(m);
  effects.push({ obj: m, vel, life: 0.9, max: 0.9, spin: 14, gravity: 2 });
}

const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
const smokeMatBase = { color: 0x2b2826, transparent: true, depthWrite: false };
export function explosionFx(point, radius = 6) {
  // 섬광
  const mat = new THREE.MeshBasicMaterial({ color: glow(0xff9a30, 1.6), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const ball = new THREE.Mesh(sphereGeo, mat);
  ball.position.copy(point);
  scene.add(ball);
  effects.push({ obj: ball, life: 0.3, max: 0.3, mat, grow: radius * 0.55, own: true, keepGeo: true });
  // 바닥 충격파
  const rmat = new THREE.MeshBasicMaterial({ color: glow(0xffd9a0, 1.2), transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const ring = new THREE.Mesh(ringGeo, rmat);
  ring.position.set(point.x, Math.max(0.08, point.y - 0.6), point.z);
  scene.add(ring);
  effects.push({ obj: ring, life: 0.45, max: 0.45, mat: rmat, grow: radius * 1.25, own: true, keepGeo: true });
  // 연기
  for (let i = 0; i < 7; i++) {
    const smat = new THREE.MeshBasicMaterial(smokeMatBase);
    const puff = new THREE.Mesh(sphereGeo, smat);
    puff.position.set(point.x + (Math.random() - 0.5) * radius * 0.5, point.y + Math.random() * 0.8, point.z + (Math.random() - 0.5) * radius * 0.5);
    scene.add(puff);
    const l = 1 + Math.random() * 0.8;
    effects.push({ obj: puff, life: l, max: l, mat: smat, alpha: 0.55, grow: 1 + Math.random() * radius * 0.3, vel: new THREE.Vector3(0, 1.5 + Math.random() * 1.5, 0), gravity: 0, own: true, keepGeo: true });
  }
  const light = new THREE.PointLight(0xff9030, 40, radius * 4);
  light.position.copy(point);
  scene.add(light);
  effects.push({ obj: light, life: 0.25, max: 0.25, light: 40 });
  burst(point, 0xff8a20, 26, 9, 0.8, true);
  burst(point, 0x3a3532, 12, 5, 1.1);
}

// 위치 표시: 5초 동안 보이는 노란 빛기둥
const pingGeo = new THREE.CylinderGeometry(0.12, 0.12, 14, 6, 1, true);
export function pingFx(x, y, z) {
  const mat = new THREE.MeshBasicMaterial({ color: glow(0xffe040, 1.8), transparent: true, opacity: 0.8, depthWrite: false, depthTest: false, fog: false });
  const beam = new THREE.Mesh(pingGeo, mat);
  beam.position.set(x, y + 7, z);
  scene.add(beam);
  effects.push({ obj: beam, life: 5, max: 5, mat, own: true, keepGeo: true });
  G.pings.push({ x, z, until: G.time + 5 });
}

export function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    const k = Math.max(0, e.life / e.max);
    if (e.vel) {
      e.vel.y -= PLAYER.GRAV * (e.gravity ?? 0.5) * dt;
      e.obj.position.addScaledVector(e.vel, dt);
      if (e.spin) { e.obj.rotation.x += e.spin * dt; if (e.obj.position.y < 0.02) { e.obj.position.y = 0.02; e.vel.set(0, 0, 0); e.spin = 0; } }
    }
    if (e.shrink) e.obj.scale.setScalar(k);
    if (e.grow) e.obj.scale.setScalar(Math.max(0.001, e.grow * (1 - k * k)));
    if (e.light) e.obj.intensity = e.light * k;
    if (e.mat) e.mat.opacity = k * (e.alpha ?? 1);
    if (e.life <= 0) {
      scene.remove(e.obj);
      if (e.own) { if (!e.keepGeo) e.obj.geometry.dispose(); e.mat.dispose(); }
      effects.splice(i, 1);
    }
  }
  updateDamageNumbers(dt);
}

// ---------- 피해 숫자 (HTML 오버레이) ----------
const numbers = [];
const layer = document.getElementById('dmglayer');
const proj = new THREE.Vector3();
export function damageNumber(point, amount, head, kill) {
  if (!layer) return;
  const el = document.createElement('span');
  el.className = 'dmgnum' + (head ? ' head' : '') + (kill ? ' kill' : '');
  el.textContent = Math.round(amount);
  layer.appendChild(el);
  numbers.push({ el, pos: point.clone(), life: 0.7, ox: (Math.random() - 0.5) * 30 });
}
function updateDamageNumbers(dt) {
  for (let i = numbers.length - 1; i >= 0; i--) {
    const n = numbers[i];
    n.life -= dt;
    n.pos.y += dt * 1.2;
    proj.copy(n.pos).project(camera);
    if (n.life <= 0 || proj.z > 1) { n.el.remove(); numbers.splice(i, 1); continue; }
    n.el.style.transform = `translate(${(proj.x * 0.5 + 0.5) * innerWidth + n.ox}px, ${(-proj.y * 0.5 + 0.5) * innerHeight}px)`;
    n.el.style.opacity = Math.min(1, n.life * 3);
  }
}
