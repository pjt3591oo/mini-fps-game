// 크레딧, 소모 아이템, 무기 강화, 상점
// 크레딧은 적 처치·웨이브 클리어로 얻고, 웨이브 사이(B 키)에 상점에서 쓴다.
import * as THREE from 'three';
import { camera, scene } from './engine.js';
import { ITEMS, SUPPLIES, UPGRADE, UPGRADE_FX, WEAPONS, WEAPON_ORDER } from './config.js';
import { G } from './state.js';
import { player, healPlayer } from './player.js';
import { W, addAmmo, magSize, grantRocket } from './weapons.js';
import { callStrike, waves } from './enemies.js';
import { staticMeshes } from './world.js';
import { net } from './net.js';
import { sfx } from './audio.js';
import { svg, icon, GUN } from './icons.js';

const el = document.getElementById('shop'), body = document.getElementById('shopbody'), credEl = document.getElementById('shopcred');

export function resetShop() {
  G.credits = 0;
  G.earned = 0;
  for (const k in ITEMS) G.inv[k] = 0;
  for (const k of WEAPON_ORDER) { W.lv[k] = 0; W.pity[k] = 0; }
  G.tickets.reroll = 0; G.tickets.rare = 0;
  G.bought = {};
  closeShop();
}

export function addCredits(n) {
  G.credits += n;
  G.earned += n;
}

// ---------- 강화 ----------
export function upgradeInfo(k) {
  const lv = W.lv[k];
  if (lv >= UPGRADE.max) return null;
  return { cost: UPGRADE.cost[lv], chance: Math.min(1, UPGRADE.chance[lv] + W.pity[k]) };
}
// 실패하면 크레딧만 잃고 단계는 유지된다. 실패할 때마다 다음 성공 확률이 오른다.
// sure: 확정 강화 — 기대 비용만큼 더 내고 반드시 성공한다
export function sureCost(info) { return Math.ceil(info.cost / info.chance / 10) * 10; }
export function tryUpgrade(k, sure = false) {
  const info = upgradeInfo(k);
  const cost = info && sure ? sureCost(info) : info?.cost;
  if (!info || G.credits < cost || WEAPONS[k].dropOnly) return null;
  G.credits -= cost;
  G.bought.upgrade = (G.bought.upgrade || 0) + 1;
  if (sure || Math.random() < info.chance) {
    W.lv[k]++; W.pity[k] = 0;
    // 탄창이 커지는 단계에서는 바로 채워 준다
    if (W.lv[k] === UPGRADE.magAt) W.ammo[k].mag = magSize(k);
    sfx.perk();
    G.hooks.feed?.(`${WEAPONS[k].name} +${W.lv[k]} 강화 성공`, true, 'amp');
    return true;
  }
  W.pity[k] += UPGRADE.pity;
  sfx.empty();
  G.hooks.feed?.(`${WEAPONS[k].name} 강화 실패 (다음 확률 +${Math.round(UPGRADE.pity * 100)}%)`, false);
  return false;
}

// ---------- 구매 ----------
export function buyItem(k) {
  const it = ITEMS[k];
  if (!it || G.credits < it.price || G.inv[k] >= it.max) return false;
  G.credits -= it.price;
  G.inv[k]++;
  G.bought[k] = (G.bought[k] || 0) + 1;
  sfx.pickup();
  G.hooks.bought?.(k);
  return true;
}
function supplyFull(k) {
  if (k === 'rocket') return W.ammo.rocket.mag + W.ammo.rocket.reserve > 0;
  if (k === 'reroll') return G.tickets.reroll >= SUPPLIES.reroll.max;
  if (k === 'rare') return G.tickets.rare >= SUPPLIES.rare.max || [...G.rarePerks].every(n => G.perks[n]);
  // 탄약: 모든 무기의 예비 탄약이 한도까지 차 있으면 팔지 않는다
  return WEAPON_ORDER.every(w => !isFinite(WEAPONS[w].reserve) || WEAPONS[w].dropOnly || W.ammo[w].reserve >= Math.round(WEAPONS[w].reserve * G.mods.ammo));
}
export function buySupply(k) {
  const s = SUPPLIES[k];
  if (!s || G.credits < s.price) return false;
  if (supplyFull(k)) return false;
  G.credits -= s.price;
  if (k === 'ammo') addAmmo(0.5, false);
  if (k === 'rocket') grantRocket();
  if (k === 'reroll') G.tickets.reroll++;
  if (k === 'rare') G.tickets.rare++;
  G.bought[k] = (G.bought[k] || 0) + 1;
  sfx.pickup();
  return true;
}

// ---------- 아이템 사용 ----------
const ray = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);
export function useItem(k) {
  if (player.dead) return false;
  if (!G.inv[k]) { sfx.empty(); G.hooks.msg?.(`${ITEMS[k].name} 없음 — 웨이브 사이에 상점(B)에서 구매`); return false; }
  if (k === 'medkit') {
    if (player.hp >= G.mods.maxHp) { G.hooks.msg?.('체력이 가득 찼습니다'); return false; }
    healPlayer(ITEMS.medkit.heal);
    sfx.pickup();
  } else if (k === 'shield') {
    G.buffs.shield = G.time + ITEMS.shield.dur;
    sfx.shield();
    sfx.perk();
  } else if (k === 'strike') {
    ray.setFromCamera(center, camera);
    ray.far = 70;
    const hit = ray.intersectObjects(staticMeshes, false)[0];
    if (!hit) { sfx.empty(); G.hooks.msg?.('폭격 지점이 너무 멉니다'); return false; }
    callStrike(hit.point.x, Math.max(0, hit.point.y - 0.3), hit.point.z);
    sfx.ping();
  }
  G.inv[k]--;
  G.used[k] = (G.used[k] || 0) + 1;
  G.hooks.feed?.(`${ITEMS[k].name} 사용`, true, k);
  return true;
}

// ---------- 상점 화면 ----------
export function canShop() {
  return G.mode === 'playing' && !player.dead && waves.inter && G.wave > 0;
}
export function openShop() {
  if (G.shopOpen || !canShop()) return false;
  G.shopOpen = true;
  G.shopSeen = true;
  el.classList.add('show');
  document.body.classList.add('shopping');   // 특성 카드는 상점을 보는 동안 숨긴다
  render();
  return true;
}
export function closeShop() {
  if (!G.shopOpen) return false;
  G.shopOpen = false;
  el.classList.remove('show');
  document.body.classList.remove('shopping');
  // 닫은 뒤 바로 다음 웨이브가 시작되지 않게 최소 3초를 준다
  if (net.isHost && waves.inter) waves.timer = Math.max(waves.timer, 3);
  return true;
}

const COIN = icon('coin', 'coin');

// 강화 단계가 반영된 무기 능력치 (lv 단계 기준)
function statsAt(k, lv) {
  const d = WEAPONS[k];
  return {
    dmg: Math.round(d.dmg * (1 + UPGRADE.dmg * lv) * d.pellets),
    mag: Math.round(d.mag * (lv >= UPGRADE.magAt ? 1.25 : 1)),
    reload: +d.reload.toFixed(2),
    rate: Math.round(60 / d.fireDelay),
  };
}
const STAT_LABEL = { dmg: '피해', mag: '탄창', reload: '재장전', rate: '연사' };
const STAT_UNIT = { dmg: '', mag: '발', reload: '초', rate: '/분' };
const MILESTONE = { [UPGRADE.magAt]: '탄창', [UPGRADE.fxAt]: '고유 1', [UPGRADE.max]: '고유 2' };

let upLock = 0;
let lastResult = null;   // { key, ok } — 방금 강화한 카드에 성공/실패 연출을 붙인다

function render() {
  credEl.textContent = G.credits.toLocaleString();
  document.getElementById('shopwave').textContent = `WAVE ${String(G.wave + 1).padStart(2, '0')} 준비`;
  const price = (n, ok) => `<span class="price${ok ? '' : ' short'}">${COIN}${n}</span>`;

  // ----- 무기 강화 카드 -----
  const upgrades = WEAPON_ORDER.filter(k => !WEAPONS[k].dropOnly).map(k => {
    const lv = W.lv[k], info = upgradeInfo(k);
    const cur = statsAt(k, lv), nxt = info ? statsAt(k, lv + 1) : cur;
    const track = Array.from({ length: UPGRADE.max }, (_, i) =>
      `<u class="${i < lv ? 'on' : i === lv && info ? 'next' : ''}">${MILESTONE[i + 1] ? `<em>${MILESTONE[i + 1]}</em>` : ''}</u>`).join('');
    const stats = Object.keys(STAT_LABEL).map(s => {
      const up = nxt[s] !== cur[s];
      return `<div class="stat${up ? ' up' : ''}"><label>${STAT_LABEL[s]}</label><b>${cur[s]}<small>${STAT_UNIT[s]}</small></b>${up ? `<i>▸ ${nxt[s]}</i>` : ''}</div>`;
    }).join('');
    const afford = info && G.credits >= info.cost;
    const pct = info ? Math.round(info.chance * 100) : 0;
    const res = lastResult && lastResult.key === k ? (lastResult.ok ? ' ok' : ' fail') : '';
    const action = info
      ? `<button data-act="up" data-key="${k}" ${afford ? '' : 'disabled'}>
           <span class="lbl">강화 ${price(info.cost, afford)}</span>
           <span class="chance ${pct >= 90 ? 'hi' : pct >= 60 ? 'mid' : 'lo'}"><i style="width:${pct}%"></i></span>
           <small>성공 확률 ${pct}%</small>
         </button>${pct < 100 ? `<button class="sure" data-act="sure" data-key="${k}" ${G.credits >= sureCost(info) ? '' : 'disabled'}><span class="lbl">확정 강화 ${price(sureCost(info), G.credits >= sureCost(info))}</span></button>` : ''}`
      : '<button disabled><span class="lbl">최대 단계</span></button>';
    return `<div class="wcard${res}${W.current === k ? ' cur' : ''}">
      <div class="wtop">
        <div class="wname">${WEAPONS[k].name}<b class="${lv ? '' : 'zero'}">+${lv}</b>${W.current === k ? '<span>사용 중</span>' : ''}</div>
        ${svg('0 0 120 48', GUN[k], 'gun')}
      </div>
      <div class="track">${track}</div>
      <div class="stats">${stats}</div>
      <div class="fx">${[UPGRADE.fxAt, UPGRADE.max].map(n => `<span class="${lv >= n ? 'on' : lv + 1 === n ? 'next' : ''}"><b>+${n}</b>${UPGRADE_FX[k][n]}</span>`).join('')}</div>
      ${action}
      ${res ? `<div class="toast">${lastResult.ok ? `강화 성공  +${lv}` : `실패 — 다음 확률 +${Math.round(UPGRADE.pity * 100)}%`}</div>` : ''}
    </div>`;
  }).join('');

  // ----- 아이템 카드 -----
  const items = Object.entries(ITEMS).map(([k, it]) => {
    const have = G.inv[k], full = have >= it.max, afford = G.credits >= it.price;
    const pips = Array.from({ length: it.max }, (_, i) => `<u class="${i < have ? 'on' : ''}"></u>`).join('');
    return `<div class="icard ${k}">
      <div class="ibadge">${icon(k)}<kbd>${it.key}</kbd></div>
      <div class="itext"><h5>${it.name}</h5><p>${it.desc}</p><div class="own">${pips}<span>${have} / ${it.max}</span></div></div>
      <button data-act="item" data-key="${k}" ${afford && !full ? '' : 'disabled'}><span class="lbl">${full ? '가득 참' : `구매 ${price(it.price, afford)}`}</span></button>
    </div>`;
  }).join('');

  // ----- 보급 타일 -----
  const supplies = Object.entries(SUPPLIES).map(([k, sp]) => {
    const full = supplyFull(k);
    const afford = G.credits >= sp.price;
    const state = k === 'rocket' ? (full ? '보유 중' : '') : k === 'reroll' || k === 'rare' ? `${G.tickets[k]} / ${sp.max}` : '';
    return `<button class="stile ${k}" data-act="supply" data-key="${k}" ${afford && !full ? '' : 'disabled'} title="${sp.desc}">
      ${icon(k)}<h5>${sp.name}</h5><p>${sp.desc}</p>${state ? `<em>${state}</em>` : ''}
      <span class="lbl">${full ? (k === 'ammo' ? '가득 참' : '보유 한도') : price(sp.price, afford)}</span>
    </button>`;
  }).join('');

  body.innerHTML = `
    <section class="col-w"><h4>무기 강화</h4><div class="wgrid">${upgrades}</div>
      <p class="note">단계마다 피해 +${Math.round(UPGRADE.dmg * 100)}%, +${UPGRADE.fxAt}와 +${UPGRADE.max}에서 무기마다 다른 고유 효과가 열립니다. 실패해도 단계는 내려가지 않고 다음 성공 확률이 오릅니다.</p></section>
    <section class="col-i"><h4>아이템 <span>전투 중 지정 키로 사용</span></h4>${items}
      <h4 style="margin-top:14px">보급 · 특성 개입권 <span>개입권은 다음 특성 선택에 적용</span></h4><div class="sgrid">${supplies}</div></section>`;
  lastResult = null;
}

body.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-act]');
  if (!b || !G.shopOpen) return;
  const { act, key } = b.dataset;
  if (act === 'item') buyItem(key);
  else if (act === 'supply') buySupply(key);
  else if (act === 'up' || act === 'sure') {
    if (performance.now() < upLock) return;   // 연타로 크레딧이 연달아 나가지 않게
    upLock = performance.now() + 400;
    const ok = tryUpgrade(key, act === 'sure');
    if (ok !== null) lastResult = { key, ok };
  }
  render();
});

// ---------- 폭격 조준 미리 보기 (T를 누르고 있는 동안) ----------
const aimRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x70e4ff, transparent: true, opacity: 0.95, depthWrite: false, depthTest: false }));
const aimDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x40d8ff, transparent: true, opacity: 0.16, depthWrite: false, depthTest: false }));
const aimGroup = new THREE.Group();
aimGroup.add(aimRing, aimDisc);
aimGroup.scale.setScalar(ITEMS.strike.r);
aimGroup.visible = false;
scene.add(aimGroup);
export function updateStrikeAim() {
  const on = G.aimStrike && !player.dead && G.inv.strike > 0;
  aimGroup.visible = false;
  if (!on) return;
  ray.setFromCamera(center, camera);
  ray.far = 70;
  const hit = ray.intersectObjects(staticMeshes, false)[0];
  if (!hit) return;
  aimGroup.visible = true;
  aimGroup.position.set(hit.point.x, Math.max(0, hit.point.y - 0.3) + 0.1, hit.point.z);
  // 내가 범위 안이면 붉게 경고
  const danger = Math.hypot(player.p.x - hit.point.x, player.p.z - hit.point.z) < ITEMS.strike.r;
  aimRing.material.color.setHex(danger ? 0xff5040 : 0x70e4ff);
  aimDisc.material.color.setHex(danger ? 0xff3020 : 0x40d8ff);
}

// 솔로에서는 상점을 보는 동안 다음 웨이브가 시작되지 않는다
export function shopFreezesTimer() { return G.shopOpen && !net.connected; }
