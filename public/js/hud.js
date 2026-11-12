// HUD: 체력/탄약/조준선/미니맵/킬 피드/배너
import * as THREE from 'three';
import { camera } from './engine.js';
import { WEAPONS, WEAPON_ORDER, DASH, ITEMS, UPGRADE } from './config.js';
import { G } from './state.js';
import { player } from './player.js';
import { net } from './net.js';
import { colliders, world } from './world.js';
import { icon, gun } from './icons.js';

const $ = id => document.getElementById(id);
const el = {
  hud: $('hud'), hurt: $('hurt'), hurtdir: $('hurtdir'), cross: $('cross'), hitmark: $('hitmark'), scope: $('scope'),
  top: $('top'), combo: $('combo'), bossbar: $('bossbar'), bossfill: $('bossfill'), banner: $('banner'),
  feed: $('feed'), players: $('players'), hptext: $('hptext'), hpfill: $('hpfill'), perklist: $('perklist'),
  nades: $('nades'), wname: $('wname'), ammotext: $('ammotext'), reloadtext: $('reloadtext'), wlist: $('wlist'),
  minimap: $('minimap'), bossname: $('bossname'), items: $('items'), inter: $('inter'), prompt: $('prompt'), promptfill: $('promptfill'), prompttext: $('prompttext'), buff: $('buff'), markers: [...document.querySelectorAll('#markers i')], dashfill: $('dashfill'), hint: $('hint'),
};
// 고정 아이콘
$('hpico').innerHTML = icon('heart');
$('dashico').innerHTML = icon('bolt');
$('bossico').innerHTML = icon('skull');
el.magbar = $('magbar');
let magKey = '', buffHtml = '';

const crossParts = { t: el.cross.querySelector('.t'), b: el.cross.querySelector('.b'), l: el.cross.querySelector('.l'), r: el.cross.querySelector('.r') };
const mm = el.minimap.getContext('2d');

const _mv = new THREE.Vector3();
let hurtAlpha = 0, hurtDirAlpha = 0, hitTimer = 0, bannerTimeout = 0, scoped = false, frame = 0;

export function showHud(show) { el.hud.classList.toggle('hidden', !show); }

export function showBanner(title, sub = '', ms = 1800) {
  el.banner.querySelector('b').textContent = title;
  el.banner.querySelector('span').textContent = sub;
  el.banner.classList.add('show');
  clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => el.banner.classList.remove('show'), ms);
}

let hintTimeout = 0;
export function showHint(text, ms = 6000) {
  el.hint.innerHTML = icon('info') + '<span></span>';
  el.hint.lastChild.textContent = text;
  el.hint.classList.add('show');
  clearTimeout(hintTimeout);
  hintTimeout = setTimeout(() => el.hint.classList.remove('show'), ms);
}

// 화면 중앙 아래 상호작용 안내 (progress: 0~1, null이면 숨김)
export function setPrompt(text, progress = 0) {
  if (!text) { el.prompt.style.display = 'none'; return; }
  el.prompt.style.display = 'block';
  el.prompttext.textContent = text;
  el.promptfill.style.width = progress * 100 + '%';
}

// 웨이브 사이 안내 (상점 / 다음 웨이브)
// secs: 다음 웨이브까지 남은 시간, canSkip: Enter로 넘길 수 있는지
let interHtml = '';
export function setInter(show, secs = 0, canSkip = false) {
  el.inter.style.display = show ? 'block' : 'none';
  if (!show) return;
  const h = `<kbd>B</kbd>${icon('cart')}상점${canSkip ? `<kbd>Enter</kbd>${icon('next')}바로 시작` : ''}<em>${icon('clock')}<b>${Math.max(0, Math.ceil(secs))}</b>초</em>`;
  if (h !== interHtml) { interHtml = h; el.inter.innerHTML = h; }
}

// 조준선 아래 짧은 안내 (아이템을 쓸 수 없을 때 등)
let msgTimeout = 0;
export function flashMsg(text) {
  const m = $('actmsg');
  m.textContent = text;
  m.classList.add('show');
  clearTimeout(msgTimeout);
  msgTimeout = setTimeout(() => m.classList.remove('show'), 1800);
}

export function addFeed(text, mine = false, ico = '') {
  const d = document.createElement('div');
  if (ico) d.innerHTML = icon(ico);
  d.append(text);
  if (mine) d.className = 'mine';
  el.feed.prepend(d);
  while (el.feed.children.length > 6) el.feed.lastChild.remove();
  setTimeout(() => { d.style.opacity = 0; setTimeout(() => d.remove(), 600); }, 4500);
}

export function hitmarker(kill, head) {
  el.hitmark.setAttribute('class', kill ? 'kill' : head ? 'head' : '');
  el.hitmark.style.opacity = 1;
  hitTimer = kill ? 0.3 : 0.14;
}

export function setScope(on) {
  if (on === scoped) return;
  scoped = on;
  el.scope.style.display = on ? 'block' : 'none';
  el.cross.style.display = on ? 'none' : 'block';
}

// 피격 방향 표시
export function showHurt(dmg, from) {
  hurtAlpha = Math.min(1, hurtAlpha + 0.35 + dmg * 0.02);
  if (!from) return;
  const dx = from.x - player.p.x, dz = from.z - player.p.z;
  const ry = camera.rotation.y;
  const fx = -Math.sin(ry), fz = -Math.cos(ry);   // 전방
  const rx = Math.cos(ry), rz = -Math.sin(ry);    // 우측
  const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  el.hurtdir.style.transform = `rotate(${ang}rad)`;
  hurtDirAlpha = 1;
}

export function clearHud() {
  el.feed.innerHTML = '';
  hurtAlpha = hurtDirAlpha = 0;
  el.banner.classList.remove('show');
  el.hint.classList.remove('show');
  setScope(false);
}

export function updateHUD(dt, W, remaining) {
  frame++;
  // 체력
  const hp = Math.ceil(player.hp), max = G.mods.maxHp;
  const hpHtml = player.dead ? '<small>쓰러짐</small>' : `${hp}${max !== 100 || hp > max ? `<small>/ ${max}</small>` : ''}`;
  if (el.hptext.innerHTML !== hpHtml) el.hptext.innerHTML = hpHtml;
  el.hpfill.style.width = Math.min(100, Math.max(0, player.hp / max * 100)) + '%';
  el.hpfill.style.background = hp > max ? '#4fd8ff' : hp > max * 0.5 ? '#5fe07a' : hp > max * 0.25 ? '#ffb224' : '#ff4d3d';

  el.dashfill.style.width = (1 - player.dashCd / (DASH.cd * G.mods.dashCd)) * 100 + '%';
  el.dashfill.style.background = player.dashCd > 0 ? '#7a8792' : '#6ad0ff';

  // 탄약 / 무기
  const def = WEAPONS[W.current], a = W.ammo[W.current];
  const lv = W.lv[W.current] || 0, magMax = Math.round(def.mag * (lv >= UPGRADE.magAt ? 1.25 : 1));
  el.wname.textContent = def.name + (lv ? ` +${lv}` : '');
  el.ammotext.classList.toggle('low', a.mag <= magMax * 0.25);
  el.ammotext.innerHTML = `${a.mag} <small>/ ${isFinite(a.reserve) ? a.reserve : '∞'}</small>`;
  // 탄창 그림: 남은 탄을 눈금으로 보여 준다
  const mk = W.current + magMax + ':' + a.mag;
  if (mk !== magKey) {
    magKey = mk;
    const w = Math.max(2, Math.min(14, Math.floor(200 / magMax) - 2));
    el.magbar.innerHTML = Array.from({ length: magMax }, (_, i) => `<i class="${i < a.mag ? 'on' : ''}" style="width:${w}px"></i>`).join('');
    el.magbar.classList.toggle('low', a.mag <= magMax * 0.25);
  }
  el.reloadtext.textContent = W.reloading > 0 ? '재장전 중...' : a.mag === 0 ? (a.reserve > 0 ? 'R 재장전' : '탄약 없음') : a.mag <= magMax * 0.25 ? '탄약 부족' : '';
  if (frame % 10 === 0) {
    el.wlist.innerHTML = WEAPON_ORDER.map((k, i) => WEAPONS[k].dropOnly && W.ammo[k].mag + W.ammo[k].reserve === 0 ? '' :
      `<span class="${k === (W.pending || W.current) ? 'on' : ''}"><kbd>${i + 1}</kbd>${gun(k, 'gs')}${W.lv[k] ? `<em>+${W.lv[k]}</em>` : ''}</span>`).filter(Boolean).join('');
    const nd = '<kbd>G</kbd>' + [0, 1, 2, 3].map(i => `<span class="${i < player.grenades ? 'on' : ''}">${icon('nade')}</span>`).join('');
    if (el.nades.innerHTML !== nd) el.nades.innerHTML = nd;
    el.top.innerHTML = `<span class="wv">${icon('flag')}WAVE <b>${String(G.wave).padStart(2, '0')}</b></span>${G.mut ? `<span class="mut">${G.mut.name}</span>` : ''}<span class="en">${icon('skull')}<b>${remaining}</b></span><span class="sc">${icon('star')}<b>${G.score.toLocaleString()}</b></span><span class="cr">${icon('coin')}<b>${G.credits.toLocaleString()}</b></span>`;
    const items = Object.entries(ITEMS).map(([k, it]) => `<span class="${k}${G.inv[k] ? '' : ' none'}">${icon(k)}<kbd>${it.key}</kbd><b>${G.inv[k] || 0}</b></span>`).join('');
    if (el.items.innerHTML !== items) el.items.innerHTML = items;
    const perks = Object.entries(G.perks).map(([n, c]) => `<span class="${G.rarePerks?.has(n) ? 'rare' : ''}">${icon(n)}${c > 1 ? `<b>${c}</b>` : ''}</span>`).join('');
    if (el.perklist.innerHTML !== perks) el.perklist.innerHTML = perks;
    if (net.connected) {
      el.players.innerHTML = `<div>${net.name} (나) — ${G.score.toLocaleString()}</div>` +
        [...net.players.values()].map(p => `<div class="${p.dead ? 'dead' : ''}">${p.name} — ${(p.score || 0).toLocaleString()}</div>`).join('');
    } else if (el.players.innerHTML) el.players.innerHTML = '';
  }

  // 일시 강화
  const amp = G.buffs.amp - G.time;
  const sh = G.buffs.shield - G.time;
  const bh = (amp > 0 ? `<span class="amp">${icon('amp')}<b>${Math.ceil(amp)}</b>피해 ×2</span>` : '') + (sh > 0 ? `<span class="sh">${icon('shield')}<b>${Math.ceil(sh)}</b>방어막</span>` : '');
  if (bh !== buffHtml) { buffHtml = bh; el.buff.innerHTML = bh; }
  el.hud.classList.toggle('shielded', sh > 0);

  // 남은 적이 적으면 위치를 표시한다 (화면 밖이면 가장자리 화살표)
  const mark = remaining <= 3 && G.enemies.length <= 3 && !player.dead;
  for (let i = 0; i < el.markers.length; i++) {
    const m = el.markers[i], e = mark ? G.enemies[i] : null;
    if (!e) { m.style.display = 'none'; continue; }
    _mv.set(e.p.x, e.p.y + e.h + 0.45, e.p.z).project(camera);
    let x = _mv.x, y = _mv.y, rot = Math.PI;
    const behind = _mv.z > 1;
    if (behind) { x = -x; y = -y; }
    if (behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.88) {
      const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.88, 1e-6);
      x /= k; y /= k;
      rot = Math.atan2(x, y);
    }
    m.style.display = 'block';
    m.style.transform = `translate(${(x * 0.5 + 0.5) * innerWidth}px, ${(-y * 0.5 + 0.5) * innerHeight}px) rotate(${rot}rad)`;
  }

  // 콤보
  if (G.combo > 1) {
    el.combo.textContent = `${G.combo} 연속 처치  ×${(1 + Math.min(G.combo - 1, 10) * 0.1).toFixed(1)}`;
    el.combo.style.opacity = Math.min(1, G.comboTimer);
  } else el.combo.style.opacity = 0;

  // 보스 체력
  const boss = G.enemies.find(e => e.def.boss);
  el.bossbar.style.display = boss ? 'block' : 'none';
  if (boss && el.bossname.textContent !== boss.def.name) el.bossname.textContent = boss.def.name;
  if (boss) el.bossfill.style.width = Math.max(0, boss.hp / boss.maxHp * 100) + '%';

  // 조준선 (탄 퍼짐에 따라 벌어짐)
  if (!scoped) {
    const gap = 4 + W.spreadNow * innerHeight * 0.5;
    crossParts.t.style.top = (-gap - 8) + 'px';
    crossParts.b.style.top = gap + 'px';
    crossParts.l.style.left = (-gap - 8) + 'px';
    crossParts.r.style.left = gap + 'px';
    el.cross.style.opacity = player.dead ? 0 : W.reloading > 0 || W.switching > 0 ? 0.4 : 1;
  }

  // 피격 / 히트마커 페이드
  hurtAlpha = Math.max(0, hurtAlpha - dt * 1.4);
  const low = !player.dead && player.hp < max * 0.3 ? 0.35 + Math.sin(G.time * 6) * 0.1 : 0;
  el.hurt.style.opacity = Math.max(hurtAlpha, low, player.dead ? 0.8 : 0);
  hurtDirAlpha = Math.max(0, hurtDirAlpha - dt * 1.2);
  el.hurtdir.style.opacity = hurtDirAlpha;
  hitTimer -= dt;
  if (hitTimer <= 0) el.hitmark.style.opacity = 0;

  if (frame % 3 === 0) drawMinimap();
}

function drawMinimap() {
  const S = 170, half = world.size + 2, k = S / (half * 2);
  const X = x => (x + half) * k, Y = z => (z + half) * k;
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = 'rgba(200,208,216,.42)';
  for (const b of colliders) {
    if (b.max.y < 0.8) continue;
    mm.fillRect(X(b.min.x), Y(b.min.z), Math.max(1, (b.max.x - b.min.x) * k), Math.max(1, (b.max.z - b.min.z) * k));
  }
  mm.fillStyle = '#ff7a20';
  for (const b of world.barrels) if (b.alive) mm.fillRect(X(b.pos.x) - 1, Y(b.pos.z) - 1, 2, 2);
  for (const pk of G.pickups) {
    const big = pk.type === 'supply', sz = big ? 7 : 3;
    mm.fillStyle = big ? '#40d8ff' : pk.type === 'health' ? '#3cdc64' : '#ffc83c';
    const px = X(pk.mesh.position.x), py = Y(pk.mesh.position.z);
    // 체력 팩은 십자, 탄약은 사각형 (색만으로 구분하지 않는다)
    if (pk.type === 'health') { mm.fillRect(px - 2.5, py - 0.8, 5, 1.6); mm.fillRect(px - 0.8, py - 2.5, 1.6, 5); }
    else mm.fillRect(px - sz / 2, py - sz / 2, sz, sz);
  }
  for (const e of G.enemies) {
    mm.fillStyle = e.def.boss ? '#ff2a2a' : '#ff5a4a';
    const r = e.def.boss ? 4.5 : e.type === 'tank' ? 3 : 2;
    mm.beginPath(); mm.arc(X(e.p.x), Y(e.p.z), r, 0, 7); mm.fill();
  }
  mm.fillStyle = '#ffe040';
  for (let i = G.pings.length - 1; i >= 0; i--) {
    const pg = G.pings[i];
    if (pg.until < G.time) { G.pings.splice(i, 1); continue; }
    mm.beginPath(); mm.arc(X(pg.x), Y(pg.z), 2 + (G.time * 6 % 4), 0, 7); mm.fill();
  }
  for (const p of net.players.values()) {
    mm.fillStyle = p.dead ? '#888' : '#4aa8ff';
    mm.beginPath(); mm.arc(X(p.p.x), Y(p.p.z), 3, 0, 7); mm.fill();
  }
  // 플레이어 (시선 방향 화살표)
  const ry = camera.rotation.y;
  mm.save();
  mm.translate(X(player.p.x), Y(player.p.z));
  mm.rotate(-ry);
  mm.fillStyle = '#fff';
  mm.beginPath(); mm.moveTo(0, -6); mm.lineTo(4, 5); mm.lineTo(0, 3); mm.lineTo(-4, 5); mm.closePath(); mm.fill();
  mm.restore();
}
