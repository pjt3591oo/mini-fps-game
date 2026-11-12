// 적 AI, 투사체, 웨이브, 픽업, 폭발
// 호스트(오프라인이면 본인)가 적을 시뮬레이션하고, 다른 클라이언트는 스냅샷을 보간해 표시한다.
import * as THREE from 'three';
import { scene, glow } from './engine.js';
import { ENEMY_TYPES, PICKUPS, PLAYER, NET_RATE, DIFFICULTY, MUTATORS, ITEMS } from './config.js';
import { G } from './state.js';
import { blocked, moveBody, lineOfSight, world, removeBarrel, resetBarrels } from './world.js';
import { player, hurtPlayer, healPlayer } from './player.js';
import { net } from './net.js';
import { burst, explosionFx, damageNumber } from './effects.js';
import { sfx } from './audio.js';
import { navDir } from './nav.js';
import { attachLook, updateLook, lookShoot, lookDie } from './enemyLook.js';

const TYPE_KEYS = Object.keys(ENEMY_TYPES);
const D = () => DIFFICULTY[G.diff] || DIFFICULTY.normal;
let nextEnemyId = 1, nextPickupId = 1;

export const waves = { inter: true, timer: 3, queue: [], spawnT: 0, remoteQueue: 0 };

// ---------- 공용 지오메트리 ----------
const capGeo = new THREE.CapsuleGeometry(0.34, 0.42, 4, 10);
const legGeo = new THREE.BoxGeometry(0.17, 0.52, 0.19).translate(0, -0.26, 0);   // 위쪽 끝이 회전축
const limbGeo = new THREE.BoxGeometry(0.12, 0.5, 0.12).translate(0, -0.25, 0);
const headGeo = new THREE.SphereGeometry(0.26, 14, 10);
const visorGeo = new THREE.BoxGeometry(0.34, 0.08, 0.12);
const armGeo = new THREE.BoxGeometry(0.12, 0.12, 0.6);
const padGeo = new THREE.BoxGeometry(0.3, 0.22, 0.4);
const hornGeo = new THREE.ConeGeometry(0.09, 0.4, 8);
const projGeo = new THREE.SphereGeometry(0.16, 10, 8);
const projMat = new THREE.MeshBasicMaterial({ color: glow(0xff5ad0, 2.6) });
const bossProjMat = new THREE.MeshBasicMaterial({ color: glow(0xff4020, 3) });
const pickupGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
const barBgMat = new THREE.SpriteMaterial({ color: 0x101010, transparent: true, opacity: 0.7 });
const barFgMat = new THREE.SpriteMaterial({ color: 0xff5040 });
const laneGeo = new THREE.PlaneGeometry(4.4, 17);   // 돌진 판정 폭(반지름 + 1.2m)과 같게
const laneMat = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.32, depthWrite: false });

// ---------- 대상(플레이어) 목록 ----------
const _targets = [];
function getTargets() {
  _targets.length = 0;
  if (!player.dead) _targets.push({ id: net.id, p: player.p, local: true });
  for (const rp of net.players.values()) if (!rp.dead && !rp.fresh) _targets.push({ id: rp.id, p: rp.target, local: false });
  return _targets;
}
function damageTarget(t, dmg, from, src) {
  dmg = Math.round(dmg * D().dmg);
  if (t.local) hurtPlayer(dmg, from, src);
  else net.sendTo(t.id, 'dmg', { dmg, x: from.x, y: from.y, z: from.z, src });
}

// ---------- 적 ----------
const eyeA = new THREE.Vector3(), eyeB = new THREE.Vector3(), _nav = { x: 0, z: 0 }, _perch = new THREE.Vector3();
const slamMat = new THREE.MeshBasicMaterial({ color: 0xff2010, transparent: true, opacity: 0.4, depthWrite: false });
// 표적에게서 가려져 있고 사거리 안인 포대 지점 중 가장 가까운 곳 (없으면 -1)
function pickPerch(pos, tp, m) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < world.perches.length; i++) {
    const [x, z] = world.perches[i];
    const dt = Math.hypot(tp.x - x, tp.z - z);
    if (dt < m.min || dt > m.max) continue;
    eyeA.set(x, 1.4, z); eyeB.set(tp.x, tp.y + 1.2, tp.z);
    if (lineOfSight(eyeA, eyeB)) continue;
    const d = Math.hypot(pos.x - x, pos.z - z);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
const STEER = [0, 40, -40, 80, -80, 125, -125].map(d => d * Math.PI / 180);

export class Enemy {
  constructor(type, x, y, z, id, hpMul = 1) {
    const def = ENEMY_TYPES[type];
    this.id = id; this.type = type; this.def = def;
    this.maxHp = Math.round(def.hp * hpMul);
    this.hp = this.maxHp;
    this.speed = def.speed * (0.9 + Math.random() * 0.2);
    this.r = 0.4 * def.scale; this.h = 1.8 * def.scale;
    this.vy = 0; this.onGround = true; this.dead = false;
    this.attackCd = 0.5; this.flash = 0; this.walk = Math.random() * 10; this.lunge = 0;
    this.rangedCd = def.ranged ? 1 + Math.random() * 2 : 0;
    this.tele = 0; this.teleKind = '';
    this.chargeCd = def.charge ? 5 : 0; this.charging = 0; this.chargeDir = new THREE.Vector3(); this.chargeHit = false;
    this.summonCd = def.summon ? 10 : 0;
    this.mortarCd = def.mortar ? 4 : 0;
    this.losT = Math.random() * 0.3; this.los = false;
    this.detour = 0; this.detourT = 0; this.side = Math.random() < 0.5 ? 1 : -1;
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.target = null; this.retarget = 0;
    this.stun = 0; this.stunImmune = 0; this.bar = null;
    this.perch = -1; this.perchT = Math.random();
    this.stunAcc = 0; this.stunAccT = -1;
    this.netPos = new THREE.Vector3(x, y, z); this.netRy = 0; // 비호스트 보간용

    this.group = new THREE.Group();
    this.group.position.set(x, y, z);
    this.p = this.group.position;
    this.model = new THREE.Group();
    this.model.scale.setScalar(def.scale);
    this.group.add(this.model);

    this.bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.5, metalness: 0.15, emissiveIntensity: 2 });
    this.headMat = new THREE.MeshStandardMaterial({ color: ENEMY_TYPES[type].boss ? 0x2a2a30 : 0x8a8f99, roughness: 0.4, metalness: 0.5 });
    this.visorMat = new THREE.MeshBasicMaterial({ color: 0xffe040 });
    const body = new THREE.Mesh(capGeo, this.bodyMat); body.position.y = 1.02;
    const head = new THREE.Mesh(headGeo, this.headMat); head.position.y = 1.62;
    const visor = new THREE.Mesh(visorGeo, this.visorMat); visor.position.set(0, 1.64, 0.2);
    this.parts = [body, head, visor];
    body.userData = { enemy: this, part: 'body' };
    head.userData = { enemy: this, part: 'head' };
    visor.userData = { enemy: this, part: 'head' };
    const deco = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      m.userData = { enemy: this, part: 'body' };
      this.parts.push(m); return m;
    };
    this.legs = [deco(legGeo, this.bodyMat, 0.15, 0.52, 0), deco(legGeo, this.bodyMat, -0.15, 0.52, 0)];
    this.arms = [deco(limbGeo, this.bodyMat, -0.44, 1.4, 0)];
    if (def.ranged) deco(armGeo, this.headMat, 0.42, 1.15, 0.25);
    else this.arms.push(deco(limbGeo, this.bodyMat, 0.44, 1.4, 0));
    if (type === 'tank' || ENEMY_TYPES[type].boss) { deco(padGeo, this.headMat, 0.45, 1.3, 0); deco(padGeo, this.headMat, -0.45, 1.3, 0); }
    if (ENEMY_TYPES[type].boss) {
      deco(hornGeo, this.visorMat, 0.16, 1.95, 0).rotation.z = -0.35;
      deco(hornGeo, this.visorMat, -0.16, 1.95, 0).rotation.z = 0.35;
    }
    for (const p of this.parts) { p.castShadow = true; this.model.add(p); }
    if (def.boss && def.melee > 0) {
      // 내려찍기 예고 (발밑의 붉은 원)
      this.slamRing = new THREE.Mesh(strikeRingGeo, strikeRingMat);
      this.slamDisc = new THREE.Mesh(strikeGeo, slamMat);
      for (const m of [this.slamRing, this.slamDisc]) { m.scale.setScalar(def.meleeRange); m.position.y = 0.09; m.visible = false; this.group.add(m); }
    }
    if (def.charge) {
      // 돌진 경로 예고 (바닥의 붉은 띠)
      this.lane = new THREE.Mesh(laneGeo, laneMat);
      this.lane.rotation.x = -Math.PI / 2;
      this.lane.position.set(0, 0.07, 8.5);
      this.lane.visible = false;
      this.group.add(this.lane);
    }
    this.look = attachLook(this);   // 외부 캐릭터 모델 (없으면 기본 도형 그대로)
    scene.add(this.group);
    G.hooks.enemySeen?.(type);
  }

  // ----- 호스트 시뮬레이션 -----
  update(dt) {
    const def = this.def, pos = this.p;
    this.stunImmune -= dt;
    if (this.stun > 0) {
      // 경직: 잠시 움직이지 못하고 준비 중이던 공격이 끊긴다
      this.stun -= dt;
      this.tele = 0;
      moveBody(this, 0, 0, dt, this.r, this.h);
      return;
    }
    this.retarget -= dt;
    if (this.retarget <= 0 || !this.target) {
      this.retarget = 0.5;
      let best = null, bd = Infinity;
      for (const t of getTargets()) {
        const d = t.p.distanceToSquared(pos);
        if (d < bd) { bd = d; best = t; }
      }
      this.target = best ? { ...best } : null;
    }
    const tgt = this.target;
    if (!tgt) { moveBody(this, 0, 0, dt, this.r, this.h); return; }

    const dx = tgt.p.x - pos.x, dz = tgt.p.z - pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const dy = tgt.p.y - pos.y;
    const nx = dx / dist, nz = dz / dist;
    if (!this.charging) this.group.rotation.y = Math.atan2(dx, dz);

    this.losT -= dt;
    if (this.losT <= 0 && (def.ranged || def.charge)) {
      this.losT = 0.3;
      eyeA.set(pos.x, pos.y + 1.4 * def.scale, pos.z);
      eyeB.set(tgt.p.x, tgt.p.y + 1.2, tgt.p.z);
      this.los = lineOfSight(eyeA, eyeB);
    }

    let mx = 0, mz = 0, speed = this.speed;

    if (this.charging > 0) {
      // 보스 돌진
      this.charging -= dt;
      if (this.charging <= 0) this.stun = 0.8;   // 돌진 뒤 빈틈
      mx = this.chargeDir.x; mz = this.chargeDir.z; speed = def.charge.speed;
      if (!this.chargeHit) {
        for (const t of getTargets()) {
          if (Math.hypot(t.p.x - pos.x, t.p.z - pos.z) < this.r + 1.2 && Math.abs(t.p.y - pos.y) < this.h) {
            damageTarget(t, def.charge.dmg, pos, def.name + ' 돌진'); this.chargeHit = true;
          }
        }
      }
    } else if (this.tele > 0) {
      // 공격 예고 (제자리)
      this.tele -= dt;
      if (this.tele <= 0) {
        if (this.teleKind === 'shot') this.fire(tgt);
        else if (this.teleKind === 'boom') { killEnemy(this, -1, false); return; }
        else if (this.teleKind === 'mortar') this.fireMortar(tgt);
        else if (this.teleKind === 'slam') {
          // 내려찍기: 원 안의 모든 플레이어에게 피해
          this.lunge = 0.4;
          for (const t of getTargets()) {
            if (Math.hypot(t.p.x - pos.x, t.p.z - pos.z) < def.meleeRange && Math.abs(t.p.y - pos.y) < this.h + 0.4) damageTarget(t, def.melee, pos, def.name + ' 내려찍기');
          }
          burst(new THREE.Vector3(pos.x, pos.y + 0.3, pos.z), 0xaaaaaa, 14, 5);
        }
        else if (this.teleKind === 'charge') {
          this.charging = def.charge.dur; this.chargeHit = false;
          this.chargeDir.set(nx, 0, nz);
        }
      }
    } else {
      const rg = def.ranged;
      const inBand = rg && this.los && dist <= rg.max && dist >= rg.min * 0.6;
      if (rg) {
        this.rangedCd -= dt;
        if (this.rangedCd <= 0 && this.los && dist <= rg.max + 4) {
          this.rangedCd = rg.cd * (0.85 + Math.random() * 0.3);
          this.tele = rg.telegraph; this.teleKind = 'shot';
        }
      }
      if (def.charge) {
        this.chargeCd -= dt;
        if (this.chargeCd <= 0 && this.los && dist > 5 && dist < 22 && Math.abs(dy) < 1.5) {
          this.chargeCd = def.charge.cd; this.tele = 0.6; this.teleKind = 'charge';
          sfx.bossRoar(); net.send('fx', { k: 'roar' });
        }
      }
      if (def.explode && dist < def.explode.trigger && Math.abs(dy) < 2.5) {
        this.tele = def.explode.fuse; this.teleKind = 'boom';
      }
      if (def.mortar) {
        // 포격: 대상 주변 여러 곳에 예고 원을 띄운 뒤 폭발
        const m = def.mortar;
        this.mortarCd -= dt;
        if (this.mortarCd <= 0) {
          if (m.max && dist > m.max) this.mortarCd = 0.5;           // 사거리 밖이면 쏘지 않는다
          else {
            this.mortarCd = m.cd;
            if (m.tele) { this.tele = m.tele; this.teleKind = 'mortar'; } else this.fireMortar(tgt);
          }
        }
      }
      if (def.summon) {
        this.summonCd -= dt;
        if (this.summonCd <= 0) {
          this.summonCd = def.summon.cd;
          for (let i = 0; i < def.summon.count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sx = pos.x + Math.cos(a) * 2.5, sz = pos.z + Math.sin(a) * 2.5;
            if (!blocked(sx, sz, 0.4, pos.y + 0.1, pos.y + 1.6)) spawnEnemy(def.summon.type, sx, pos.y, sz).summoned = true;   // 소환병은 크레딧·보급품을 주지 않는다
          }
          burst(new THREE.Vector3(pos.x, pos.y + 1, pos.z), 0xff3020, 20, 6, 0.5, true);
        }
      }

      const perching = def.mortar && def.mortar.hold && !G.enemies.every(e => e.def.mortar && e.def.mortar.hold);
      if (perching) {
        // 척탄병: 표적에게서 가려진 포대 지점으로 이동해 머문다 (남은 적이 척탄병뿐이면 그냥 접근)
        const m = def.mortar;
        this.perchT -= dt;
        if (this.perchT <= 0) { this.perchT = 1; this.perch = pickPerch(pos, tgt.p, m); }
        if (this.perch >= 0) {
          const pp = world.perches[this.perch];
          if (Math.hypot(pp[0] - pos.x, pp[1] - pos.z) > 1.2) {
            _perch.set(pp[0], 0, pp[1]);
            if (navDir('perch' + this.perch, _perch, pos.x, pos.y, pos.z, G.time, _nav)) { mx = _nav.x; mz = _nav.z; }
            else { const l = Math.hypot(pp[0] - pos.x, pp[1] - pos.z); mx = (pp[0] - pos.x) / l; mz = (pp[1] - pos.z) / l; }
          }
        } else if (dist > m.hold) {
          mx = nx; mz = nz;
          if (navDir(tgt.id, tgt.p, pos.x, pos.y, pos.z, G.time, _nav)) { mx = _nav.x; mz = _nav.z; }
        } else if (dist < m.min) { mx = -nx; mz = -nz; }
      } else if (inBand && !this.def.boss) {
        // 사거리 안: 좌우로 천천히 움직이며 사격
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 1 + Math.random() * 2; this.strafeDir = Math.random() < 0.3 ? 0 : -this.strafeDir || 1; }
        mx = -nz * this.strafeDir; mz = nx * this.strafeDir; speed *= 0.45;
        if (dist < rg.min) { mx -= nx; mz -= nz; }
      } else if (dist > def.meleeRange * 0.75) {
        mx = nx; mz = nz;
        // 멀리 있거나 높이가 다르면 길찾기 경로를 따른다
        if ((dist > 2.5 || Math.abs(dy) > 0.8) && navDir(tgt.id, tgt.p, pos.x, pos.y, pos.z, G.time, _nav)) { mx = _nav.x; mz = _nav.z; }
      }

      // 근접 공격
      this.attackCd -= dt;
      if (def.melee > 0 && dist < def.meleeRange && Math.abs(dy) < this.h + 0.4 && this.attackCd <= 0) {
        if (def.boss) { this.attackCd = 1.6; this.tele = 0.6; this.teleKind = 'slam'; }
        else {
          this.attackCd = this.type === 'rusher' ? 0.7 : 1;
          this.lunge = 0.4;
          damageTarget(tgt, def.melee, pos, def.name + ' 근접');
        }
      }
    }

    // 이동 + 장애물 회피 조향
    if (mx || mz) {
      const l = Math.hypot(mx, mz); mx /= l; mz /= l;
      if (!this.charging) {
        this.detourT -= dt;
        const look = this.r + 0.7;
        const free = (ang) => {
          const c = Math.cos(ang), s = Math.sin(ang);
          const ax = mx * c - mz * s, az = mx * s + mz * c;
          return !blocked(pos.x + ax * look, pos.z + az * look, this.r, pos.y + PLAYER.STEP + 0.05, pos.y + this.h);
        };
        let ang = 0;
        if (this.detourT > 0 && free(this.detour)) ang = this.detour;
        else if (!free(0)) {
          ang = null;
          for (let i = 1; i < STEER.length; i++) {
            const a = STEER[i] * this.side;
            if (free(a)) { ang = a; break; }
          }
          if (ang === null) { ang = Math.PI; this.side = -this.side; }
          this.detour = ang; this.detourT = 0.5;
        }
        if (ang) {
          const c = Math.cos(ang), s = Math.sin(ang);
          const ax = mx * c - mz * s, az = mx * s + mz * c;
          mx = ax; mz = az;
        }
      }
      const step = speed * dt;
      const hit = moveBody(this, mx * step, mz * step, dt, this.r, this.h);
      if (hit && this.charging > 0) { this.charging = 0; this.stun = 0.8; burst(pos.clone().setY(pos.y + 1), 0xaaaaaa, 10, 4); }
      else if (hit && this.detourT <= 0.3 && Math.random() < 0.02) this.side = -this.side;
      this.walk += dt * speed * 3;
    } else {
      moveBody(this, 0, 0, dt, this.r, this.h);
    }

    // 다른 적과 겹치지 않도록 밀어내기
    for (const o of G.enemies) {
      if (o === this) continue;
      const ex = pos.x - o.p.x, ez = pos.z - o.p.z;
      const d = Math.hypot(ex, ez), min = this.r + o.r + 0.1;
      if (d > 0 && d < min && Math.abs(pos.y - o.p.y) < 1.5) {
        const push = (min - d) * 0.5 * (o.def.boss ? 2 : 1);
        const px = pos.x + (ex / d) * push, pz = pos.z + (ez / d) * push;
        if (!this.def.boss && !blocked(px, pz, this.r, pos.y + PLAYER.STEP + 0.05, pos.y + this.h)) { pos.x = px; pos.z = pz; }
      }
    }
  }

  fireMortar(tgt) {
    const m = this.def.mortar;
    for (const t of m.single ? [tgt] : getTargets()) {
      for (let i = 0; i < m.count; i++) {
        const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 2 + Math.random() * m.spread;
        const st = { x: +(t.p.x + Math.cos(a) * r).toFixed(1), y: +t.p.y.toFixed(1), z: +(t.p.z + Math.sin(a) * r).toFixed(1), t: m.delay + i * 0.25, r: m.r, pd: Math.round(m.pd * D().dmg), src: m.src };
        net.send('strike', { ...st, d: st.t });   // 't'는 메시지 종류라 지연 시간은 d로 보낸다
        addStrike(st, true);
      }
    }
  }

  fire(tgt) {
    lookShoot(this);
    const rg = this.def.ranged, pos = this.p, s = this.def.scale;
    const ox = pos.x, oy = pos.y + 1.25 * s, oz = pos.z;
    let dx = tgt.p.x - ox, dy = tgt.p.y + 1.1 - oy, dz = tgt.p.z - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const n = rg.fan ? Math.min(7, rg.fan + 2 * Math.max(0, Math.floor(G.wave / 5) - 1)) : 1;
    for (let i = 0; i < n; i++) {
      const a = (i - (n - 1) / 2) * 0.16 + (Math.random() - 0.5) * 0.04;
      const c = Math.cos(a), sn = Math.sin(a);
      const vx = (dx * c - dz * sn) * rg.speed, vz = (dx * sn + dz * c) * rg.speed;
      const vy = (dy + (Math.random() - 0.5) * 0.03) * rg.speed;
      const data = { x: ox + dx * 0.6, y: oy, z: oz + dz * 0.6, vx, vy, vz, dmg: Math.round(rg.dmg * D().dmg), b: this.def.boss ? 1 : 0 };
      spawnProjectile(data);
      net.send('proj', data);
    }
  }

  // ----- 비호스트: 스냅샷 보간 -----
  updateRemote(dt) {
    if (this.teleKind === 'slam' && this.tele > 0.05) this.tele -= dt;
    const k = 1 - Math.exp(-12 * dt);
    const before = this.p.x + this.p.z;
    this.p.lerp(this.netPos, k);
    let d = this.netRy - this.group.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.group.rotation.y += d * k;
    this.walk += Math.abs(this.p.x + this.p.z - before) * 3;
  }

  // ----- 공통 표시 갱신 -----
  updateVisual(dt) {
    updateLook(this, dt);
    this.model.position.y = this.look ? 0 : Math.abs(Math.sin(this.walk)) * 0.07;
    this.lunge = Math.max(0, this.lunge - dt * 2.5);
    this.model.position.z = this.lunge * 0.9;
    const sw = Math.sin(this.walk) * 0.7, reach = -this.lunge * 3.4;
    this.legs[0].rotation.x = sw; this.legs[1].rotation.x = -sw;
    this.arms[0].rotation.x = sw * 0.8 + reach;
    if (this.arms[1]) this.arms[1].rotation.x = -sw * 0.8 + reach;
    this.flash -= dt;
    let e = 0x000000;
    if (this.flash > 0) e = 0xff5050;
    else if (this.tele > 0) e = this.teleKind === 'shot' ? 0x9030ff : 0xff2000;
    else if (this.def.explode) e = Math.sin(G.time * 9 + this.id) > 0.2 ? 0x705000 : 0x201800;
    else if (this.charging > 0) e = 0xff2000;
    this.bodyMat.emissive.setHex(e);
    this.headMat.emissive.setHex(this.flash > 0 ? 0xff5050 : 0);
    this.visorMat.color.setHex(this.tele > 0 ? 0xff40ff : 0xffe040).multiplyScalar(this.tele > 0 ? 3.2 : 2);
    this.model.rotation.x = this.stun > 0 && !this.look ? -0.3 : 0;
    if (this.hp < this.maxHp && !this.def.boss) {
      if (!this.bar) {
        const w = 0.9 * this.def.scale, y = 1.95 * this.def.scale + 0.28;
        const bg = new THREE.Sprite(barBgMat), fg = new THREE.Sprite(barFgMat);
        bg.scale.set(w + 0.06, 0.13, 1); bg.position.y = y;
        fg.position.y = y; fg.renderOrder = 1;
        this.group.add(bg, fg);
        this.bar = { bg, fg, w };
      }
      this.bar.fg.scale.set(Math.max(0.001, this.hp / this.maxHp) * this.bar.w, 0.07, 1);
    }
    if (this.lane) this.lane.visible = this.tele > 0 && this.teleKind === 'charge' || this.charging > 0;
    if (this.slamRing) {
      const on = this.tele > 0 && this.teleKind === 'slam';
      this.slamRing.visible = this.slamDisc.visible = on;
      if (on) this.slamDisc.scale.setScalar(this.def.meleeRange * Math.max(0.05, 1 - this.tele / 0.6));
    }
  }

  takeDamage(dmg, head, by) {
    if (this.dead) return false;
    this.hp -= dmg;
    this.flash = 0.08;
    if (this.hp <= 0) { killEnemy(this, by, head); return true; }
    if (G.time - this.stunAccT > 0.08) { this.stunAcc = 0; this.stunAccT = G.time; }
    this.stunAcc += dmg;
    if (!this.def.boss && this.stunImmune <= 0 && this.charging <= 0 && this.stunAcc >= this.maxHp * 0.25) { this.stun = 0.35; this.stunImmune = 1.2; this.stunAcc = 0; }
    return false;
  }

  serialize() {
    const p = this.p;
    const flags = (this.tele > 0 ? (this.teleKind === 'shot' ? 1 : this.teleKind === 'slam' ? 32 : 2) : 0) | (this.charging > 0 ? 4 : 0) | (this.lunge > 0.3 ? 8 : 0) | (this.stun > 0 ? 16 : 0);
    return [this.id, TYPE_KEYS.indexOf(this.type), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2),
      +this.group.rotation.y.toFixed(2), Math.ceil(this.hp), flags, this.maxHp];
  }
  applySnapshot(s) {
    this.netPos.set(s[2], s[3], s[4]);
    this.netRy = s[5];
    if (s[6] < this.hp) this.hp = s[6];
    else if (s[6] > this.hp + 1 && this.flash <= -0.5) this.hp = s[6];
    const f = s[7];
    // 내려찍기(32)는 남은 시간을 모르므로 처음 볼 때 0.6초부터 줄인다
    if (f & 32) { if (this.teleKind !== 'slam' || this.tele <= 0) this.tele = 0.6; this.teleKind = 'slam'; this.slamNet = 0.2; }
    else { this.tele = f & 3 ? 0.2 : 0; this.teleKind = f & 2 ? (this.def.charge ? 'charge' : 'mortar') : 'shot'; }
    this.charging = f & 4 ? 0.2 : 0;
    if (f & 8 && this.lunge <= 0) this.lunge = 0.4;
    this.stun = f & 16 ? 0.2 : 0;
    this.maxHp = s[8];
  }

  // 처치 연출: 뒤로 쓰러진 뒤 가라앉는다 (보스·자폭병은 폭발하므로 즉시 제거)
  die() {
    if (this.def.boss || this.def.explode) { this.remove(); return; }
    this.dead = true;
    this.bodyMat.emissive.setHex(0); this.headMat.emissive.setHex(0);
    this.visorMat.color.setHex(0x333333);
    if (this.bar) { this.bar.bg.visible = this.bar.fg.visible = false; }
    lookDie(this);
    corpses.push({ e: this, t: 0 });
    if (corpses.length > 24) corpses.shift().e.remove();
  }

  remove() {
    this.dead = true;
    scene.remove(this.group);
    this.bodyMat.dispose(); this.headMat.dispose(); this.visorMat.dispose();
  }
}

const corpses = [];
function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i];
    c.t += dt;
    const k = Math.min(1, c.t / 0.35);
    if (c.e.look) c.e.look.mixer.update(dt);   // 쓰러지는 애니메이션
    else c.e.model.rotation.x = -k * k * Math.PI / 2;
    if (c.t > 1.8) c.e.group.position.y -= dt * 0.5;
    if (c.t > 2.8) { c.e.remove(); corpses.splice(i, 1); }
  }
}

function hpMulForWave(n) { return (1 + Math.max(0, n - 1) * 0.07) * D().hp; }

export function spawnEnemy(type, x, y, z, hpMul = hpMulForWave(G.wave)) {
  const m = ENEMY_TYPES[type].boss ? null : G.mut;
  const e = new Enemy(type, x, y, z, nextEnemyId++, hpMul * (m?.hp || 1));
  if (m?.speed) e.speed *= m.speed;
  G.enemies.push(e);
  return e;
}

// 플레이어가 적을 맞혔을 때 호출 (로컬 연출 + 호스트 판정)
export function damageEnemy(e, dmg, point, head) {
  if (e.dead) return false;
  if (head && e.def.headMul) dmg *= e.def.headMul;
  if (head) dmg *= G.mods.head;
  dmg = Math.round(dmg * G.mods.dmg * (G.time < G.buffs.amp ? 2 : 1));
  burst(point, 0x9a1010, head ? 8 : 4);
  e.flash = 0.08;
  const willKill = e.hp - dmg <= 0;
  damageNumber(point, dmg, head, willKill);
  if (net.isHost) return e.takeDamage(dmg, head, net.id);
  net.send('hit', { id: e.id, dmg, head });
  e.hp -= dmg;
  return willKill;
}

function killEnemy(e, by, head) {
  const info = { id: e.id, by, ty: e.type, head: !!head, x: e.p.x, y: e.p.y, z: e.p.z, nr: e.summoned ? 1 : 0 };
  // 픽업 드롭
  if (!e.summoned && Math.random() < e.def.drop * (G.mut?.drop || 1)) {
    const n = e.def.boss ? 4 : 1;
    for (let i = 0; i < n; i++) {
      const type = Math.random() < 0.45 ? 'health' : 'ammo';
      spawnPickup({ id: nextPickupId++, type, x: e.p.x + (Math.random() - 0.5) * n, y: e.p.y + 0.5, z: e.p.z + (Math.random() - 0.5) * n }, true);
    }
  }
  net.send('kill', info);
  onEnemyKilled(info);
  if (e.def.explode) pendingBooms.push({ pos: new THREE.Vector3(e.p.x, e.p.y + 0.8, e.p.z), t: 0.06, ...e.def.explode, src: '자폭병' });
}

const _kp = new THREE.Vector3();
function onEnemyKilled(info) {
  const i = G.enemies.findIndex(e => e.id === info.id);
  if (i >= 0) { G.enemies[i].die(); G.enemies.splice(i, 1); }
  const def = ENEMY_TYPES[info.ty];
  _kp.set(info.x, info.y + def.scale, info.z);
  // 보관함 '처치 연출': 내가 처치했을 때 내 화면에서만 파편 색을 바꾼다
  burst(_kp, info.by === net.id && G.killFx != null ? G.killFx : def.color, def.boss ? 60 : 18, def.boss ? 10 : 5, 0.8);
  if (def.boss) { explosionFx(_kp, 5); sfx.explosion(0.8); }
  const mine = info.by === net.id;
  if (mine) {
    G.combo++; G.comboTimer = 4;
    const mult = 1 + Math.min(G.combo - 1, 10) * 0.1;
    const pts = Math.round(def.score * mult * (info.head ? 1.5 : 1) * D().score * (G.mut?.score || 1));
    if (G.mods.killBoom && !def.explode) pendingBooms.push({ pos: new THREE.Vector3(info.x, info.y + 0.8 * def.scale, info.z), t: 0.12, r: 3.6, dmg: 70, pd: 0, quiet: true });
    G.score += pts; G.kills++;
    if (G.mods.lifesteal) healPlayer(G.mods.lifesteal);
    sfx.kill();
    if (G.combo > 1) sfx.combo(G.combo);
    G.hooks.kill?.(def, info.head, pts, info.nr);
  }
  if (info.by === -1) return; // 자폭
  if (!mine && !info.nr) G.hooks.assist?.(def);   // 협동: 동료가 처치해도 일부를 받는다
  const who = mine ? (net.connected ? net.name : '나') : (net.players.get(info.by)?.name || '?');
  G.hooks.feed?.(`${who} ▸ ${def.name}`, mine, info.head ? 'head' : 'skull');
}

// ---------- 투사체 ----------
export function spawnProjectile(d) {
  const mesh = new THREE.Mesh(projGeo, d.b ? bossProjMat : projMat);
  mesh.position.set(d.x, d.y, d.z);
  if (d.b) mesh.scale.setScalar(1.5);
  scene.add(mesh);
  G.projectiles.push({ mesh, p: mesh.position, v: new THREE.Vector3(d.vx, d.vy, d.vz), dmg: d.dmg, life: 4, r: d.b ? 0.26 : 0.18, src: d.b ? '보스 탄' : '사수 탄' });
  const dist = mesh.position.distanceTo(player.p);
  sfx.enemyShot(Math.max(0.15, 1 - dist / 40));
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i], p = pr.p;
    p.addScaledVector(pr.v, dt);
    pr.life -= dt;
    let gone = pr.life <= 0;
    if (!gone && (p.y < 0 || blocked(p.x, p.z, pr.r * 0.6, p.y - pr.r * 0.6, p.y + pr.r * 0.6))) {
      gone = true; burst(p, 0xff5ad0, 5, 2, 0.5, true);
    }
    if (!gone && !player.dead) {
      const pp = player.p;
      if (Math.hypot(p.x - pp.x, p.z - pp.z) < PLAYER.R + pr.r && p.y > pp.y - 0.1 && p.y < pp.y + player.height + 0.15) {
        hurtPlayer(pr.dmg, p.clone().addScaledVector(pr.v, -0.5), pr.src);
        gone = true;
      }
    }
    if (gone) { scene.remove(pr.mesh); G.projectiles.splice(i, 1); }
  }
}

// ---------- 픽업 ----------
export function spawnPickup(d, broadcast = false) {
  const def = PICKUPS[d.type];
  const mat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 1.6, roughness: 0.4 });
  let mesh = new THREE.Mesh(pickupGeo, mat), fall = 0;
  if (d.type === 'supply') {
    // 보급품: 큰 상자 + 멀리서도 보이는 빛기둥, 하늘에서 떨어진다
    mesh.scale.setScalar(2);
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 30;
    const g = new THREE.Group();
    g.add(mesh, beam);
    g.userData.spin = mesh;
    mesh = g; fall = 1.3;
    sfx.supply();
    G.hooks.supply?.();
  }
  mesh.position.set(d.x, d.y, d.z);
  scene.add(mesh);
  G.pickups.push({ id: d.id, type: d.type, mesh, mat, baseY: d.y, life: def.life || 35, fall });
  if (broadcast) net.send('pk', d);
}
function removePickup(i) {
  const pk = G.pickups[i];
  scene.remove(pk.mesh); pk.mat.dispose();
  G.pickups.splice(i, 1);
}
function updatePickups(dt) {
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    pk.life -= dt;
    (pk.mesh.userData.spin || pk.mesh).rotation.y += dt * 2.5;
    if (pk.fall > 0) { pk.fall -= dt; pk.mesh.position.y = pk.baseY + Math.max(0, pk.fall) * 28; continue; }
    pk.mesh.position.y = pk.baseY + Math.sin(G.time * 3 + pk.id) * 0.12;
    pk.mesh.visible = pk.life > 5 || Math.floor(pk.life * 5) % 2 === 0;
    if (pk.life <= 0) { removePickup(i); continue; }
    if (player.dead) continue;
    const pp = player.p;
    if (Math.hypot(pk.mesh.position.x - pp.x, pk.mesh.position.z - pp.z) < 1.4 && Math.abs(pk.baseY - pp.y - 0.5) < 1.6) {
      if (pk.type === 'supply') G.hooks.supplyPick?.();
      else if (pk.type === 'health') {
        if (player.hp >= G.mods.maxHp) continue;
        healPlayer(PICKUPS.health.amount);
        G.hooks.feed?.(`체력 +${PICKUPS.health.amount}`, true, 'heal');
      } else {
        G.hooks.ammo?.(PICKUPS.ammo.amount);
        G.hooks.feed?.('탄약 보급', true, 'ammo');
      }
      sfx.pickup();
      net.send('pkt', { id: pk.id });
      removePickup(i);
    }
  }
}

// ---------- 폭발 ----------
// 폭발을 일으킨 쪽이 호출: 연출 + 적 피해 + (본인) 플레이어 피해. 다른 클라이언트에는 boom으로 전달.
export function explode(pos, radius, dmg, playerDmg, broadcast = true, src = '폭발') {
  boomLocal(pos, radius, playerDmg, src);
  if (broadcast) net.send('boom', { x: pos.x, y: pos.y, z: pos.z, r: radius, pd: playerDmg, src });
  if (dmg > 0) for (const e of [...G.enemies]) {
    const d = Math.hypot(e.p.x - pos.x, e.p.y + e.h / 2 - pos.y, e.p.z - pos.z) - e.r;
    if (d < radius) damageEnemy(e, dmg * (1 - 0.7 * Math.max(0, d) / radius) / G.mods.dmg, new THREE.Vector3(e.p.x, e.p.y + e.h * 0.6, e.p.z), false);
  }
  for (const b of world.barrels) {
    if (b.alive && b.pos.distanceTo(pos) < radius && b.pos.distanceTo(pos) > 0.01) damageBarrel(b, 100, true);
  }
}
function boomLocal(pos, radius, playerDmg, src = '폭발') {
  const v = pos.isVector3 ? pos : new THREE.Vector3(pos.x, pos.y, pos.z);
  explosionFx(v, radius);
  const dist = v.distanceTo(player.p);
  sfx.explosion(Math.max(0.2, 1 - dist / 50));
  const d = Math.hypot(player.p.x - v.x, player.p.y + 0.9 - v.y, player.p.z - v.z);
  if (d < radius && playerDmg > 0) hurtPlayer(Math.round(playerDmg * (1 - 0.8 * d / radius)), v, src);
  else if (d < radius * 3) player.shake = Math.min(0.5, player.shake + 0.3 * (1 - d / (radius * 3)));
}

const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 60, 8, 1, true);
const beamMat = new THREE.MeshBasicMaterial({ color: 0x40d8ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, fog: false });
// ---------- 포격 예고 ----------
const strikes = [];
const strikeGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
const strikeRingGeo = new THREE.RingGeometry(0.93, 1, 48).rotateX(-Math.PI / 2);
function addStrike(st, own = false) {
  // 플레이어가 부른 폭격(st.ally)은 하늘색으로 구분한다
  const mat = new THREE.MeshBasicMaterial({ color: st.ally ? 0x40d8ff : 0xff2010, transparent: true, opacity: 0.12, depthWrite: false });
  const disc = new THREE.Mesh(strikeGeo, mat);
  const ring = new THREE.Mesh(strikeRingGeo, st.ally ? allyRingMat : strikeRingMat);
  const g = new THREE.Group();
  g.add(disc, ring);
  g.scale.setScalar(st.r);
  g.position.set(st.x, st.y + 0.09, st.z);
  scene.add(g);
  strikes.push({ ...st, g, mat, disc, own, max: st.t });
  G.hooks.strike?.();
}
export function strikeCount() { return strikes.length; }   // 테스트용
function updateStrikes(dt) {
  for (let i = strikes.length - 1; i >= 0; i--) {
    const s = strikes[i];
    s.t -= dt;
    const k = 1 - Math.max(0, s.t) / s.max;
    s.mat.opacity = 0.12 + k * 0.45;
    s.disc.scale.setScalar(Math.max(0.05, k));   // 안쪽 원이 차오르면 폭발
    if (s.t <= 0) {
      scene.remove(s.g); s.mat.dispose();
      strikes.splice(i, 1);
      // 예고를 만든 쪽(호스트)만 폭발을 일으키고 나머지는 boom 메시지로 받는다
      if (s.own) explode(new THREE.Vector3(s.x, s.y + 0.5, s.z), s.r, s.dmg || 0, s.pd, true, s.ally ? '아군 폭격' : s.src || '포격');
    }
  }
}
const strikeRingMat = new THREE.MeshBasicMaterial({ color: 0xff4020, transparent: true, opacity: 0.9, depthWrite: false });
const allyRingMat = new THREE.MeshBasicMaterial({ color: 0x70e4ff, transparent: true, opacity: 0.9, depthWrite: false });
// 아이템 '폭격 요청': 부른 사람이 폭발을 일으키고 다른 클라이언트에는 예고만 보낸다
export function callStrike(x, y, z) {
  const it = ITEMS.strike;
  const st = { x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1), t: it.delay, r: it.r, pd: it.pd, ally: 1 };
  net.send('strike', { ...st, d: st.t });
  addStrike({ ...st, dmg: it.dmg }, true);
}

const pendingBarrels = [], pendingBooms = [];
export function damageBarrel(b, dmg, delayed = false) {
  if (!b.alive) return;
  if (!net.isHost) { net.send('hit', { b: b.id, dmg }); return; }
  b.hp = (b.hp ?? 30) - dmg;
  if (b.hp > 0 || b.fuse) return;
  if (delayed) { b.fuse = true; pendingBarrels.push({ b, t: 0.12 + Math.random() * 0.15 }); return; }
  explodeBarrel(b);
}
function explodeBarrel(b) {
  if (!b.alive) return;
  const pos = b.pos.clone(); pos.y = 0.8;
  removeBarrel(b);
  net.send('bx', { id: b.id });
  explode(pos, 6.5, 170, 55, true, '드럼통 폭발');
}

// ---------- 웨이브 ----------
function buildWave(n, players) {
  const q = [];
  const mul = 1 + 0.6 * (players - 1);
  if (n % 5 === 0) {
    q.push(n % 10 === 0 ? 'warlord' : 'boss');
    const extra = Math.round((2 + n / 5 * 2) * mul * D().count);
    for (let i = 0; i < extra; i++) q.push(Math.random() < 0.5 ? 'grunt' : 'shooter');
  } else {
    const mut = G.mut;
    const count = Math.round((4 + n * 1.7) * mul * D().count * (mut?.count || 1));
    const tanks = n >= 4 ? Math.floor(n / 4) : 0;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      let type = 'grunt';
      if (i < tanks) type = 'tank';
      else if (n >= 4 && r < 0.12) type = 'bomber';
      else if (n >= 2 && r < 0.25) type = 'rusher';
      else if (n >= 3 && r < 0.47) type = 'shooter';
      if (mut?.comp && type !== 'tank' && Math.random() < 0.6) type = mut.comp;
      if (mut?.count && type === 'tank') type = 'grunt';
      q.push(type);
    }
    // 6웨이브부터 병사 일부를 척탄병으로 바꾼다 (물량 공세 변이 제외)
    let gren = n >= 6 && !mut?.count ? Math.min(3, Math.floor((n - 2) / 4)) : 0;
    for (let i = 0; i < q.length && gren > 0; i++) if (q[i] === 'grunt') { q[i] = 'grenadier'; gren--; }
    q.sort(() => Math.random() - 0.5);
  }
  return q;
}

function pickSpawn(far = false) {
  const targets = getTargets();
  let best = null, bestScore = -1;
  for (let tries = 0; tries < 12; tries++) {
    const s = world.enemySpawns[Math.floor(Math.random() * world.enemySpawns.length)];
    if (!s) break;
    const x = s[0] + (Math.random() - 0.5) * 4, z = s[1] + (Math.random() - 0.5) * 4;
    if (blocked(x, z, 0.7, 0.1, 2)) continue;
    let near = Infinity;
    for (const t of targets) near = Math.min(near, Math.hypot(t.p.x - x, t.p.z - z));
    if (!far && near > 20) return [x, z];
    if (near > bestScore) { bestScore = near; best = [x, z]; }
  }
  return best || [world.size - 5, world.size - 5];
}

// 분대 스폰: 적이 몇 마리씩 한 방면에서 묶여 온다. 분대마다 방면을 바꾼다.
const squad = { left: 0, anchor: null, last: null };
function squadSpawn() {
  const pts = world.enemySpawns;
  if (squad.left <= 0 || !squad.anchor) {
    squad.left = Math.min(6, 3 + Math.floor(G.wave / 4));
    squad.tank = false;
    const targets = getTargets();
    const ok = pts.filter(s => targets.every(t => Math.hypot(t.p.x - s[0], t.p.z - s[1]) > 20) &&
      (!squad.last || Math.hypot(squad.last[0] - s[0], squad.last[1] - s[1]) > 27));
    squad.anchor = ok.length ? ok[Math.floor(Math.random() * ok.length)] : null;
    squad.last = squad.anchor;
  }
  squad.left--;
  if (squad.anchor) {
    const targets = getTargets();
    let near = pts.filter(s => Math.hypot(squad.anchor[0] - s[0], squad.anchor[1] - s[1]) <= 27 && targets.every(t => Math.hypot(t.p.x - s[0], t.p.z - s[1]) > 20));
    if (!near.length) near = [squad.anchor];
    for (let tries = 0; tries < 8; tries++) {
      const s = near[Math.floor(Math.random() * near.length)];
      const x = s[0] + (Math.random() - 0.5) * 4, z = s[1] + (Math.random() - 0.5) * 4;
      if (!blocked(x, z, 0.7, 0.1, 2)) return [x, z];
    }
  }
  return pickSpawn();
}

function startWave(n) {
  G.wave = n;
  waves.inter = false;
  const keys = Object.keys(MUTATORS);
  const mut = n >= 3 && n % 5 !== 0 && Math.random() < 0.4 ? keys[Math.floor(Math.random() * keys.length)] : '';
  G.mut = MUTATORS[mut] || null;
  waves.queue = buildWave(n, 1 + net.players.size);
  waves.spawnT = 0.5;
  waves.supplyT = n >= 2 ? 10 + Math.random() * 12 : Infinity;
  squad.left = 0; squad.last = null;
  const info = { n, boss: n % 5 === 0, mut };
  net.send('wave', info);
  onWaveStart(info);
}
function onWaveStart(info) {
  G.wave = info.n;
  G.inWave = true;   // 보급 드롭 판정: 웨이브 진행 중에만
  G.mut = MUTATORS[info.mut] || null;
  resetBarrels();
  sfx.wave();
  if (info.boss) setTimeout(() => sfx.bossRoar(), 600);
  G.hooks.waveStart?.(info);
}
function onWaveClear(info) {
  G.mut = null;
  G.inWave = false;
  sfx.waveClear();
  G.hooks.waveClear?.(info);
}

function dropSupply() {
  for (let tries = 0; tries < 30; tries++) {
    const a = Math.random() * Math.PI * 2, r = world.size * (0.45 + Math.random() * 0.4);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (blocked(x, z, 1.4, 0.05, 3)) continue;
    spawnPickup({ id: nextPickupId++, type: 'supply', x, y: 0.6, z }, true);
    return;
  }
}

export function updateWaves(dt) {
  if (!net.isHost) return;
  if (!waves.inter && G.enemies.length + waves.queue.length > 2) {
    waves.supplyT -= dt;
    if (waves.supplyT <= 0) { waves.supplyT = Infinity; dropSupply(); }
  }
  if (waves.queue.length) {
    waves.spawnT -= dt;
    if (waves.spawnT <= 0 && G.enemies.length < 40) {
      let qi = 0;
      if (squad.left > 0 && squad.tank && waves.queue[0] === 'tank') { const j = waves.queue.findIndex(t => t !== 'tank' && !ENEMY_TYPES[t].boss); if (j > 0) qi = j; }
      const type = waves.queue.splice(qi, 1)[0];
      const [x, z] = ENEMY_TYPES[type].boss ? pickSpawn(true) : squadSpawn();
      spawnEnemy(type, x, 0, z, hpMulForWave(G.wave) * (ENEMY_TYPES[type].boss ? 1 + (G.wave / 5 - 1) * 0.4 + 0.5 * net.players.size : 1));
      if (type === 'tank') squad.tank = true;
      waves.spawnT = ENEMY_TYPES[type].boss ? 1.5 : squad.left > 0 ? 0.3 : Math.max(1.5, 3.5 - 0.15 * G.wave);
    }
    return;
  }
  if (G.enemies.length > 0) return;
  if (!waves.inter) {
    waves.inter = true;
    waves.timer = G.wave > 0 ? (net.connected ? 20 : 10) : 3;   // 협동은 상점을 볼 시간을 더 준다
    if (G.wave > 0) {
      const info = { n: G.wave, dur: waves.timer };   // 't'는 메시지 종류 필드라 쓰면 안 된다
      net.send('clear', info);
      onWaveClear(info);
    }
  }
  // 특성을 고르는 동안에는 잠시 대기 (최대 대기 시간은 timer로 제한)
  if (G.hooks.shopFreeze?.()) return;   // 솔로: 상점을 보는 동안 멈춘다
  waves.timer -= dt;
  if (waves.timer <= 0) startWave(G.wave + 1);
}

export function skipIntermission() { if (waves.inter && waves.timer > 1.5) waves.timer = 1.5; }

// ---------- 매 프레임 ----------
let snapT = 0;
export function updateEnemies(dt) {
  if (net.isHost) {
    for (const e of [...G.enemies]) if (!e.dead) e.update(dt);
    for (let i = pendingBarrels.length - 1; i >= 0; i--) {
      const pb = pendingBarrels[i];
      pb.t -= dt;
      if (pb.t <= 0) { pendingBarrels.splice(i, 1); explodeBarrel(pb.b); }
    }
    if (net.connected) {
      snapT -= dt;
      if (snapT <= 0) {
        snapT = 1 / NET_RATE;
        net.send('es', { w: G.wave, d: G.diff, map: G.map, m: G.mut ? Object.keys(MUTATORS).find(k => MUTATORS[k] === G.mut) : '', q: waves.queue.length, i: waves.inter ? 1 : 0, l: G.enemies.map(e => e.serialize()) });
      }
    }
  } else {
    for (const e of G.enemies) e.updateRemote(dt);
  }
  for (let i = pendingBooms.length - 1; i >= 0; i--) {
    const b = pendingBooms[i];
    b.t -= dt;
    if (b.t <= 0) { pendingBooms.splice(i, 1); explode(b.pos, b.r, b.dmg, b.pd, true, b.src); }
  }
  // 안개 변이: 시야 거리를 부드럽게 바꾼다
  const fog = scene.fog, fk = 1 - Math.exp(-1.5 * dt);
  fog.near += ((G.mut?.fog ? 6 : 30) - fog.near) * fk;
  fog.far += ((G.mut?.fog ? 32 : 110) - fog.far) * fk;
  for (const e of G.enemies) e.updateVisual(dt);
  updateCorpses(dt);
  updateStrikes(dt);
  updateProjectiles(dt);
  updatePickups(dt);
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
}

export function remainingEnemies() {
  return G.enemies.length + (net.isHost ? waves.queue.length : waves.remoteQueue);
}

export function resetEnemies() {
  for (const e of G.enemies) e.remove();
  G.enemies.length = 0;
  for (const c of corpses) c.e.remove();
  corpses.length = 0;
  for (const p of G.projectiles) scene.remove(p.mesh);
  G.projectiles.length = 0;
  while (G.pickups.length) removePickup(0);
  pendingBarrels.length = 0; pendingBooms.length = 0;
  for (const s of strikes) { scene.remove(s.g); s.mat.dispose(); }
  strikes.length = 0;
  Object.assign(waves, { inter: true, timer: 3, queue: [], spawnT: 0, remoteQueue: 0 });
  G.wave = 0; G.mut = null;
  resetBarrels();
}

// ---------- 네트워크 수신 ----------
net.on('es', (msg) => {
  if (net.isHost) return;
  if (msg.map && msg.map !== G.map) G.hooks.mapChange?.(msg.map);
  G.wave = msg.w; G.diff = msg.d || 'normal'; G.mut = MUTATORS[msg.m] || null; waves.remoteQueue = msg.q; waves.inter = !!msg.i;
  const seen = new Set();
  for (const s of msg.l) {
    seen.add(s[0]);
    let e = G.enemies.find(x => x.id === s[0]);
    if (!e) {
      e = new Enemy(TYPE_KEYS[s[1]], s[2], s[3], s[4], s[0]);
      e.maxHp = s[8]; e.hp = s[6];
      G.enemies.push(e);
    }
    e.applySnapshot(s);
  }
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    if (!seen.has(G.enemies[i].id)) { G.enemies[i].remove(); G.enemies.splice(i, 1); }
  }
  nextEnemyId = Math.max(nextEnemyId, ...msg.l.map(s => s[0] + 1), 1);
});
net.on('hit', (msg) => {
  if (!net.isHost) return;
  if (msg.b !== undefined) {
    const b = world.barrels[msg.b];
    if (b) damageBarrel(b, msg.dmg);
    return;
  }
  const e = G.enemies.find(x => x.id === msg.id);
  if (e) e.takeDamage(msg.dmg, msg.head, msg.from);
});
net.on('kill', onEnemyKilled);
net.on('proj', spawnProjectile);
net.on('strike', (msg) => addStrike({ ...msg, t: msg.d }));
net.on('pk', (d) => { spawnPickup(d); nextPickupId = Math.max(nextPickupId, d.id + 1); });
net.on('pkt', (msg) => {
  const i = G.pickups.findIndex(p => p.id === msg.id);
  if (i >= 0) {
    if (G.pickups[i].type === 'supply') G.hooks.supplyPickOther?.();   // 협동: 동료가 주운 보급품도 각자 드롭을 굴린다
    removePickup(i);
  }
});
net.on('boom', (msg) => boomLocal(msg, msg.r, msg.pd, msg.src));
net.on('bx', (msg) => { const b = world.barrels[msg.id]; if (b) removeBarrel(b); });
net.on('wave', onWaveStart);
net.on('clear', onWaveClear);
net.on('fx', (msg) => { if (msg.k === 'roar') sfx.bossRoar(); });
net.on('to:dmg', (msg) => hurtPlayer(msg.dmg, new THREE.Vector3(msg.x, msg.y, msg.z), msg.src));
net.on('host', () => {
  if (net.isHost) { for (const s of strikes) if (!s.ally) s.own = true; waves.queue = []; waves.inter = G.enemies.length === 0; waves.timer = 5; }
});
