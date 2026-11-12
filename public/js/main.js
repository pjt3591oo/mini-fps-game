// 진입점: 게임 상태, 입력, 메인 루프
import * as THREE from 'three';
import { renderer, camera, clock, render } from './engine.js';
import { NET_RATE, WEAPON_ORDER, ITEMS, CREDITS, WEAPONS } from './config.js';
import { G, saveSettings } from './state.js';
import { loadMap, loadModel, lineOfSight, staticMeshes, world } from './world.js';
import { player, controls, resetPlayer, updatePlayer, jump, dash, healPlayer } from './player.js';
import { W, upgradeGunModels, resetWeapons, updateWeapons, switchWeapon, cycleWeapon, reload, throwGrenade, addAmmo, resetGrenades, setGunVisible, grantRocket, hasFx, magSize } from './weapons.js';
import { updateEnemies, updateWaves, resetEnemies, remainingEnemies, waves, skipIntermission } from './enemies.js';
import { net, updateRemotePlayers } from './net.js';
import { updateEffects, pingFx } from './effects.js';
import { initAudio, setVolume, sfx } from './audio.js';
import { showHud, showBanner, addFeed, hitmarker, setScope, showHurt, updateHUD, clearHud, showHint, setPrompt, setInter, flashMsg } from './hud.js';
import { resetShop, addCredits, openShop, closeShop, canShop, useItem, tryUpgrade, buyItem, upgradeInfo, shopFreezesTimer, updateStrikeAim } from './shop.js';
import { icon, gun } from './icons.js';
import { loadAssets } from './assets.js';
import { offerPerks, choosePerk, closePerks, perkOpen, resetPerks, rerollPerks, updatePerks } from './perks.js';

const $ = id => document.getElementById(id);
const overlay = $('overlay'), ovsub = $('ovsub'), menu = $('menu'), resume = $('resume'), err = $('err');

// ---------- 힌트 (항목마다 한 번만, 저장됨) ----------
let seenHints = {};
try { seenHints = JSON.parse(localStorage.getItem('fps-hints') || '{}'); } catch {}
const hintQueue = [];
let hintT = 0;
function hint(id, text) {
  if (seenHints[id] || hintQueue.some(h => h.id === id)) return;
  hintQueue.push({ id, text });
}
function updateHints(dt) {
  hintT -= dt;
  if (hintT > 0 || !hintQueue.length || perkOpen()) return;   // 특성 카드를 읽는 동안에는 띄우지 않는다
  hintT = 7;
  const h = hintQueue.shift();
  seenHints[h.id] = 1;   // 실제로 화면에 나온 것만 '봤음'으로 저장
  try { localStorage.setItem('fps-hints', JSON.stringify(seenHints)); } catch {}
  showHint(h.text, 6200);
  sfx.hint();
}
const ENEMY_HINTS = {
  rusher: '돌격병은 빠르지만 약합니다. 가까이 오기 전에 샷건(2)으로 맞받아치세요',
  shooter: '보라색 사수는 쏘기 직전에 빛납니다. 옆으로 움직이거나 Q 대시로 탄을 피하세요',
  bomber: '노란 자폭병은 가까이 오면 터집니다. 멀리서 쏘면 주변 적까지 휩쓸립니다',
  tank: '중장갑은 머리가 단단합니다. 수류탄(G)이나 드럼통 폭발이 효과적입니다',
  boss: '보스가 붉게 빛나면 돌진합니다. Q 대시로 옆으로 피하세요. 발밑에 붉은 원이 뜨면 내려찍기이니 원 밖으로 나가세요',
  grenadier: '척탄병은 벽 뒤에 숨어 포탄을 쏩니다. 붉은 원을 피하고, 돌아 들어가거나 수류탄·폭격으로 잡으세요',
  warlord: '바닥의 붉은 원은 포격 지점입니다. 원이 차오르기 전에 밖으로 나가세요',
};

// ---------- 훅 등록 ----------
G.hooks.enemySeen = (type) => { if (ENEMY_HINTS[type] && G.mode === 'playing') hint('enemy-' + type, ENEMY_HINTS[type]); };
G.hooks.feed = addFeed;
G.hooks.hitmarker = hitmarker;
G.hooks.scope = setScope;
G.hooks.ammo = addAmmo;
G.hooks.perkDone = () => !perkOpen();
G.hooks.waveStart = (info) => {
  closePerks(true);
  hideShop();
  revive();
  if (info.n === 1) {
    hint('ads', '우클릭으로 정조준하면 탄이 덜 퍼집니다. 머리를 맞히면 피해가 훨씬 큽니다');
    hint('dash', 'Q로 대시합니다. 대시하는 순간에는 잠깐 무적입니다');
  }
  if (info.n === 2) hint('barrel', '빨간 드럼통을 쏘면 폭발합니다. G로 수류탄도 던질 수 있습니다');
  showBanner(info.boss ? `WAVE ${info.n} — 보스 출현` : `WAVE ${info.n}`,
    !info.boss ? (G.mut ? `변이: ${G.mut.name} — ${G.mut.desc}` : '')
      : info.n % 10 === 0 ? '포격대장 — 바닥의 붉은 원이 차오르기 전에 밖으로 나가세요' : '바닥의 붉은 띠가 돌진 경로입니다. 옆으로 피하세요', info.boss || G.mut ? 3200 : 1800);
};
G.hooks.waveClear = (info) => {
  revive();
  healPlayer(25);
  G.score += 50 * info.n;
  const cr = CREDITS.waveBase + CREDITS.wavePer * info.n;
  addCredits(cr);
  showBanner(`WAVE ${info.n} 클리어`, `크레딧 +${cr} · 체력 +25`, 2200);
  G.interEnd = G.time + (info.dur || 10);
  offerPerks(info.dur || 10);
};
G.hooks.kill = (def, head, pts, noReward) => {
  G.stats.kw[W.current] = (G.stats.kw[W.current] || 0) + 1;
  if (!noReward) addCredits(Math.round(def.score * CREDITS.perScore * (head ? CREDITS.head : 1)));
  // +7 고유 효과: 헤드샷 처치 시 탄 환급(소총 3발, 저격총 1발), 권총은 처치마다 대시 대기 감소
  const k = W.current;
  if (head && hasFx(k, 7) && (k === 'rifle' || k === 'sniper')) W.ammo[k].mag = Math.min(magSize(k), W.ammo[k].mag + (k === 'rifle' ? 3 : 1));
  if (k === 'pistol' && hasFx(k, 7)) player.dashCd = Math.max(0, player.dashCd - 0.5);
};
G.hooks.assist = (def) => addCredits(Math.round(def.score * CREDITS.perScore * CREDITS.assist));
G.hooks.msg = flashMsg;
G.hooks.bought = (k) => hint('item-' + k, `${ITEMS[k].name}: 전투 중 ${ITEMS[k].key} 키로 사용합니다${k === 'strike' ? ' (누르고 있으면 폭격 지점이 보이고, 떼면 요청)' : ''}`);
G.hooks.shopFreeze = shopFreezesTimer;
G.hooks.supply = () => {
  G.stats.supplySeen++;
  showHint('보급품 투하! 하늘색 빛기둥을 찾아가세요 (미니맵의 하늘색 표시)', 5000);
  hintT = Math.max(hintT, 5.5);
};
G.hooks.supplyPick = () => {
  G.stats.supplyPicked++;
  addCredits(CREDITS.supply);
  const r = Math.random();
  if (r < 0.4) { grantRocket(); showBanner('로켓 발사기', '4발 · 5번 키 · 가까이서 쏘면 나도 다칩니다', 2600); }
  else if (r < 0.75) { G.buffs.amp = G.time + 20; showBanner('피해 증폭', '20초 동안 모든 피해 2배', 2600); }
  else { player.hp = Math.min(G.mods.maxHp + 75, player.hp + 75); showBanner('추가 체력', '체력 +75 (최대치 초과 가능)', 2600); }
  sfx.perk();
  addFeed('보급품 획득', true, 'star');
};
player.onHurt = showHurt;
player.onDeath = () => {
  W.firing = false; W.adsHeld = false;
  if (net.connected) {
    showBanner('쓰러졌습니다', '동료가 웨이브를 클리어하면 부활합니다', 4000);
    net.send('ps', playerState());
  }
};

// ---------- 협동: 부활 / 위치 표시 ----------
let reviveT = 0;
function updateRevive(dt) {
  let near = null;
  if (net.connected && !player.dead) {
    for (const rp of net.players.values()) {
      if (rp.dead && !rp.fresh && rp.target.distanceTo(player.p) < 2.6) { near = rp; break; }
      if (rp.dead) hint('revive', '쓰러진 동료 옆에서 F를 길게 누르면 부활시킬 수 있습니다');
    }
  }
  if (!near) { reviveT = 0; setPrompt(null); return; }
  reviveT = G.keys.KeyF ? reviveT + dt : Math.max(0, reviveT - dt * 2);
  setPrompt(`F 길게 눌러 ${near.name} 부활`, reviveT / 2.5);
  if (reviveT >= 2.5) {
    reviveT = 0;
    net.sendTo(near.id, 'revive');
    near.dead = false;
    addFeed(`${near.name} 님을 부활시켰습니다`, true);
    G.score += 150;
  }
}
net.on('to:revive', (msg) => {
  if (!player.dead) return;
  player.dead = false;
  player.hp = 50;
  player.iframe = G.time + 1.5;
  player.lastHurt = G.time;
  showBanner('부활!', `${net.players.get(msg.from)?.name || '동료'} 님이 일으켜 세웠습니다`, 2200);
  sfx.perk();
});

const pingRay = new THREE.Raycaster();
let pingCd = 0;
function ping() {
  if (G.time < pingCd || player.dead) return;
  pingCd = G.time + 0.6;
  pingRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  pingRay.far = 150;
  const hit = pingRay.intersectObjects(staticMeshes.concat(G.enemies.flatMap(e => e.parts)), false)[0];
  if (!hit) return;
  const p = hit.point;
  pingFx(p.x, p.y, p.z);
  sfx.ping();
  net.send('ping', { x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) });
}
net.on('ping', (msg) => {
  pingFx(msg.x, msg.y, msg.z);
  sfx.ping();
  addFeed(`${net.players.get(msg.from)?.name || '동료'} 님이 위치를 표시했습니다`);
});

function revive() {
  if (!player.dead) return;
  resetPlayer(net.id);
  addFeed('부활했습니다', true);
}

// ---------- 맵 ----------
const MAPS = { arena: 'maps/arena.json', depot: 'maps/depot.json' };
let mapLoading = null;
async function ensureMap(id) {
  if (!MAPS[id]) id = 'arena';
  if (G.map === id && world.name) return;
  if (mapLoading) await mapLoading;
  G.map = id;
  mapLoading = loadMap(MAPS[id]);
  await mapLoading;
  mapLoading = null;
}
// 협동: 호스트와 맵이 다르면 따라 바꾼다
G.hooks.mapChange = async (id) => {
  if (mapLoading || !MAPS[id]) return;
  await ensureMap(id);
  resetEnemies();
  resetPlayer(net.id);
  addFeed(`맵: ${world.name}`, true);
};

// ---------- 게임 상태 ----------
function resetGame() {
  Object.assign(G, { time: 0, score: 0, kills: 0, combo: 0, comboTimer: 0 });
  Object.assign(G.stats, { shots: 0, hits: 0, heads: 0, taken: 0, by: {}, kw: {}, supplySeen: 0, supplyPicked: 0 });
  player.lastSrc = '';
  G.pings.length = 0; reviveT = 0; setPrompt(null);
  resetShop(); G.used = {}; G.buffs.shield = 0; G.shopSeen = false; G.aimStrike = false; G.interEnd = 0;
  G.buffs.amp = 0;
  G.diff = G.settings.difficulty;
  hintQueue.length = 0; hintT = 2;
  resetPerks();
  resetEnemies();
  resetWeapons();
  resetGrenades();
  resetPlayer(net.id);
  camera.rotation.set(0, 0, 0);
  clearHud();
}

// 일시정지 화면: 지금 판의 상태를 그림으로 보여 준다
function pauseHtml(note = '', warn = false) {
  const tile = (ico, val, label, cls = '') => `<div class="rt ${cls}">${icon(ico)}<b>${val}</b><span>${label}</span></div>`;
  const max = G.mods.maxHp, hp = Math.max(0, Math.ceil(player.hp));
  const guns = WEAPON_ORDER.filter(k => !WEAPONS[k].dropOnly).map(k =>
    `<div class="${W.current === k ? 'on' : ''}">${gun(k)}${W.lv[k] ? `<em>+${W.lv[k]}</em>` : ''}<span>${W.ammo[k].mag}</span> / ${isFinite(W.ammo[k].reserve) ? W.ammo[k].reserve : '∞'}</div>`).join('');
  const items = Object.entries(ITEMS).map(([k, it]) => `<span class="it ${k}${G.inv[k] ? '' : ' none'}" style="--c:${k === 'medkit' ? 'var(--green)' : k === 'shield' ? 'var(--cyan)' : '#ff7a52'}">${icon(k)}<b>${G.inv[k] || 0}</b></span>`).join('');
  const perks = Object.entries(G.perks).map(([n, c]) => `<span class="${G.rarePerks?.has(n) ? 'rare' : ''}">${icon(n)}${c > 1 ? `<b>${c}</b>` : ''}</span>`).join('');
  return `<div class="ptitle"><span class="pbars"><i></i><i></i></span><b>일시정지</b></div>
    <div class="pnote${warn ? ' warn' : ''}">${note}</div>
    <div class="rgrid">${tile('flag', String(G.wave).padStart(2, '0'), '웨이브')}${tile('star', G.score.toLocaleString(), '점수')}${tile('coin', G.credits.toLocaleString(), '크레딧', 'cr')}</div>
    <div class="php">${icon('heart')}<div class="bar"><u style="width:${Math.min(100, hp / max * 100)}%"></u></div><b>${hp} / ${max}</b></div>
    <div class="pguns">${guns}</div>
    <div class="prow"><label>아이템</label>${items}</div>
    ${perks ? `<div class="prow"><label>특성</label>${perks}</div>` : ''}`;
}

let overlayReadyAt = 0, quitArmed = 0;
function setOverlay(mode, text) {
  overlay.classList.remove('hidden');
  overlay.classList.toggle('m-pause', mode === 'pause');
  overlay.classList.toggle('m-over', mode === 'over');
  ovsub.innerHTML = mode === 'pause' ? pauseHtml(text) : text;
  menu.style.display = mode === 'menu' ? '' : 'none';
  resume.style.display = mode === 'menu' ? 'none' : '';
  $('btnResume').textContent = mode === 'over' ? '다시 시작 (Enter)' : '계속하기 (Enter)';
  $('btnQuit').textContent = '메인 메뉴';
  quitArmed = 0;
  // 사격하던 손이 버튼을 누르지 않게 잠깐 막는다
  overlayReadyAt = mode === 'menu' ? 0 : performance.now() + 800;
  resume.classList.add('wait');
  setTimeout(() => resume.classList.remove('wait'), 800);
}

function enterPlay() {
  initAudio();
  if (G.debug) { onLock(); return; }
  controls.lock();
}
function onLock() {
  overlay.classList.add('hidden');
  showHud(true);
  G.mode = 'playing';
}
function onUnlock() {
  W.firing = false; W.adsHeld = false;
  for (const k in G.keys) G.keys[k] = false;
  if (G.shopOpen) return;   // 상점은 마우스를 쓰기 위해 일부러 잠금을 푼 것
  if (G.mode === 'playing') {
    G.mode = 'paused';
    setOverlay('pause', net.connected ? '협동 중에는 게임이 계속 진행됩니다' : '');
  }
}
// ---------- 상점 열기/닫기 (마우스 잠금 전환) ----------
function showShop() {
  if (!openShop()) return;
  W.firing = false; W.adsHeld = false;
  for (const k in G.keys) G.keys[k] = false;
  if (!G.debug) controls.unlock();
}
function hideShop() {
  if (!closeShop()) return;
  if (!G.debug && G.mode === 'playing') {
    controls.lock();
    // 잠금 요청이 성공도 오류도 내지 않고 무시되는 경우에 대비해 잠시 뒤 확인한다
    setTimeout(() => { if (G.mode === 'playing' && !G.shopOpen && !controls.isLocked) lockFailed(); }, 600);
  }
}
function lockFailed() {
  onUnlock();
  ovsub.innerHTML = pauseHtml('마우스를 다시 잡지 못했습니다. 계속하기를 눌러 주세요', true);
}
$('shopclose').onclick = hideShop;
controls.addEventListener('lock', onLock);
controls.addEventListener('unlock', onUnlock);

function gameOver(fromNet = false) {
  if (G.mode === 'over') return;
  G.mode = 'over';
  if (net.connected && !fromNet) net.send('over');
  const rec = loadRecords();
  const newBest = G.score > rec.bestScore, newWave = G.wave > rec.bestWave;
  rec.bestScore = Math.max(rec.bestScore, G.score); rec.bestWave = Math.max(rec.bestWave, G.wave);
  rec.runs++; rec.kills += G.kills;
  try { localStorage.setItem('fps-records', JSON.stringify(rec)); } catch {}
  submitScore();
  submitRun();
  const st = G.stats, acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
  const mm = Math.floor(G.time / 60), ss = String(Math.floor(G.time % 60)).padStart(2, '0');
  const tile = (ico, val, label, cls = '') => `<div class="rt ${cls}">${icon(ico)}<b>${val}</b><span>${label}</span></div>`;
  const ring = `<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="5"/><circle cx="20" cy="20" r="16" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="${acc} 100" pathLength="100" transform="rotate(-90 20 20)"/></svg>`;
  setOverlay('over', `<b class="res">게임 오버</b>${newBest ? '<b class="rec">신기록</b>' : newWave ? '<b class="rec">최고 웨이브</b>' : ''}
    <div class="rhead"><div><span>WAVE</span><b>${String(G.wave).padStart(2, '0')}</b></div><div><span>점수</span><b>${G.score.toLocaleString()}</b></div>
      <div class="best"><span>최고 기록</span><b>WAVE ${rec.bestWave} · ${rec.bestScore.toLocaleString()}</b></div></div>
    <div class="rgrid">${tile('skull', G.kills, '처치')}<div class="rt acc">${ring}<b>${acc}%</b><span>명중률</span></div>${tile('head', st.heads, '헤드샷')}
      ${tile('hurt', st.taken, '받은 피해')}${tile('clock', `${mm}:${ss}`, '생존')}${tile('coin', G.earned, '번 크레딧', 'cr')}</div>
    ${causeText()}`);
  if (!G.debug) controls.unlock();
}

function loadRecords() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem('fps-records') || '{}'); } catch {}
  return { bestScore: 0, bestWave: 0, runs: 0, kills: 0, ...r };
}
function menuText() {
  const r = loadRecords();
  return '웨이브를 버티고 보스를 쓰러뜨리세요' + (r.runs ? `<br><small>최고 기록: WAVE ${r.bestWave} · ${r.bestScore.toLocaleString()}점 · ${r.runs}판 · 누적 처치 ${r.kills.toLocaleString()}</small>` : '');
}

// ---------- 서버 순위표 ----------
async function loadBoard() {
  try {
    const list = await (await fetch('/api/scores')).json();
    $('board').innerHTML = list.length ? list.slice(0, 5).map((s, i) =>
      `<div class="brow r${i + 1}"><em>${i + 1}</em><span>${s.name.replace(/[<>&]/g, '')}${s.coop ? '<small>협동</small>' : ''}${s.diff === 'hard' ? '<small class="hard">어려움</small>' : s.diff === 'easy' ? '<small>쉬움</small>' : ''}</span><i>W${s.wave}</i><b>${s.score.toLocaleString()}</b></div>`).join('') : '';
  } catch { $('board').innerHTML = ''; }
}
function submitScore() {
  if (G.debug || G.score <= 0) return;
  fetch('/api/scores', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: G.settings.name || 'Player', score: G.score, wave: G.wave, diff: G.diff, coop: net.connected }),
  }).then(loadBoard).catch(() => {});
}

// 결과 화면: 무엇에 쓰러졌고 무엇에 가장 많이 맞았는지
function causeText() {
  if (!player.lastSrc) return '';
  const top = Object.entries(G.stats.by).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const max = top.length ? top[0][1] : 1;
  return `<div class="cause"><div class="ctitle">${icon('skull')}<span><b>${player.lastSrc}</b>에 쓰러짐</span></div>` +
    top.map(([k, v]) => `<div class="cbar"><label>${k}</label><i><u style="width:${Math.round(v / max * 100)}%"></u></i><b>${v}</b></div>`).join('') + '</div>';
}
// 판 기록을 서버에 남긴다 (기획 검증용: data/runs.jsonl)
function submitRun() {
  if (G.debug) return;
  const st = G.stats;
  fetch('/api/runs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ map: G.map, diff: G.diff, coop: net.connected, wave: G.wave, time: Math.round(G.time), score: G.score, kills: G.kills,
      cause: player.lastSrc, bought: G.bought, earned: G.earned, credits: G.credits, lv: W.lv, used: G.used, shopSeen: G.shopSeen, by: st.by, kw: st.kw, shots: st.shots, hits: st.hits, heads: st.heads, supplySeen: st.supplySeen, supplyPicked: st.supplyPicked, perks: G.perks }),
  }).catch(() => {});
}

function toMenu() {
  net.disconnect();
  G.mode = 'menu';
  resetGame();
  showHud(false);
  setOverlay('menu', menuText());
}

// ---------- 메뉴 ----------
$('btnSolo').onclick = () => {
  const name = $('inName').value.trim();
  if (name) { G.settings.name = name; saveSettings(); }
  net.disconnect();
  ensureMap(G.settings.map).then(() => { resetGame(); enterPlay(); });
  initAudio();
};
$('btnMulti').onclick = async () => {
  err.textContent = '';
  const name = $('inName').value.trim() || 'Player';
  const room = $('inRoom').value.trim() || 'default';
  try {
    G.settings.name = name; saveSettings();
    await net.connect(name, room);
    if (net.isHost) await ensureMap(G.settings.map);
    resetGame();
    addFeed(`방 "${net.room}" 입장 — ${net.players.size + 1}명${net.isHost ? ' (호스트)' : ''}`, true);
    enterPlay();
  } catch (e) { err.textContent = e.message + ' — npm start로 서버를 실행했는지 확인하세요'; }
};
$('btnResume').onclick = () => {
  if (performance.now() < overlayReadyAt) return;
  if (G.mode === 'over') {
    if (net.connected) net.send('restart');
    resetGame();
  }
  enterPlay();
};
$('btnQuit').onclick = () => {
  if (performance.now() < overlayReadyAt) return;
  // 일시정지 중에는 한 번 더 눌러야 판을 버린다
  if (G.mode === 'paused' && performance.now() > quitArmed) {
    quitArmed = performance.now() + 3000;
    $('btnQuit').textContent = '한 번 더 누르면 판을 버립니다';
    return;
  }
  toMenu();
};
document.addEventListener('pointerlockerror', () => {
  // 상점을 닫고 다시 잠그지 못했으면 일시정지 화면으로 넘긴다
  if (G.mode === 'playing' && !G.shopOpen) { lockFailed(); return; }
  if (G.mode !== 'playing') $('btnResume').textContent = '잠시 후 다시 눌러 주세요';
});
$('inName').value = G.settings.name || '';
const sens = $('sens');
sens.value = G.settings.sens;
$('sensval').textContent = (+G.settings.sens).toFixed(2);
sens.oninput = () => { G.settings.sens = +sens.value; $('sensval').textContent = (+sens.value).toFixed(2); saveSettings(); };
const fovIn = $('fov'), volIn = $('vol'), diffIn = $('diff');
fovIn.value = G.settings.fov; $('fovval').textContent = G.settings.fov;
fovIn.oninput = () => { G.settings.fov = +fovIn.value; $('fovval').textContent = fovIn.value; saveSettings(); };
volIn.value = G.settings.volume; $('volval').textContent = Math.round(G.settings.volume * 100);
setVolume(G.settings.volume);
volIn.oninput = () => { G.settings.volume = +volIn.value; $('volval').textContent = Math.round(volIn.value * 100); setVolume(G.settings.volume); saveSettings(); };
diffIn.value = G.settings.difficulty;
diffIn.onchange = () => { G.settings.difficulty = diffIn.value; saveSettings(); };
const gfxIn = $('gfx');
gfxIn.value = G.settings.gfx === 'low' ? 'low' : 'high';
gfxIn.onchange = () => { G.settings.gfx = gfxIn.value; saveSettings(); };
// ---------- 메뉴: 맵 카드(미리보기 그림)와 난이도 단추 ----------
const MAP_LABEL = { arena: ['요새 광장', '트인 광장 · 중앙 고지'], depot: ['창고 지구', '건물 사이 근·중거리'] };
function drawMapThumb(def, cv) {
  const g = cv.getContext('2d'), S = def.size || 50, k = cv.width / (S * 2 + 4);
  const X = (x) => (x + S + 2) * k;
  g.fillStyle = '#20252c'; g.fillRect(0, 0, cv.width, cv.height);
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.strokeRect(X(-S), X(-S), S * 2 * k, S * 2 * k);
  const rect = (x, z, w, d, h) => { g.fillStyle = h >= 3 ? '#8f9aa6' : h >= 1.4 ? '#6f7a86' : '#566170'; g.fillRect(X(x - w / 2), X(z - d / 2), w * k, d * k); };
  for (const o of def.objects || []) {
    if (o.type === 'box') {
      const [x, z] = o.pos, [w, h, d] = o.size, m = o.mirror || '';
      const pts = [[x, z]];
      if (m === 'x' || m === 'xz') pts.push([-x, z]);
      if (m === 'z' || m === 'xz') pts.push([x, -z]);
      if (m === 'xz') pts.push([-x, -z]);
      for (const [px, pz] of pts) rect(px, pz, w, d, h + (o.y || 0));
    } else if (o.type === 'stairs') {
      const [ex, ez] = o.edge, [dx, dz] = o.dir, len = o.steps * o.stepD;
      rect(ex + dx * len / 2, ez + dz * len / 2, dx ? len : o.width, dx ? o.width : len, 0.5);
    }
  }
  g.fillStyle = '#ff6a3a';
  for (const [x, z] of def.barrels || []) { g.beginPath(); g.arc(X(x), X(z), 1.6, 0, 7); g.fill(); }
  g.fillStyle = '#ffb224';
  const sp = (def.playerSpawns || [[0, 0, 0]])[0];
  g.beginPath(); g.arc(X(sp[0]), X(sp[2]), 3, 0, 7); g.fill();
}
function buildPickers() {
  const mc = $('mapcards');
  mc.innerHTML = Object.keys(MAPS).map(id => `<button type="button" data-map="${id}"><canvas width="132" height="132"></canvas><b>${MAP_LABEL[id]?.[0] || id}</b><span>${MAP_LABEL[id]?.[1] || ''}</span></button>`).join('');
  for (const b of mc.children) {
    fetch(MAPS[b.dataset.map]).then(r => r.json()).then(def => drawMapThumb(def, b.querySelector('canvas'))).catch(() => {});
    b.onclick = () => { mapIn.value = b.dataset.map; mapIn.onchange(); syncPickers(); };
  }
  const DIFF = { easy: ['쉬움', 1, '피해 −40%'], normal: ['보통', 2, '기본'], hard: ['어려움', 3, '점수 ×1.5'] };
  const ds = $('diffseg');
  ds.innerHTML = Object.entries(DIFF).map(([id, [name, n, sub]]) => `<button type="button" data-diff="${id}"><i>${icon('skull').repeat(n)}</i><b>${name}</b><span>${sub}</span></button>`).join('');
  for (const b of ds.children) b.onclick = () => { diffIn.value = b.dataset.diff; diffIn.onchange(); syncPickers(); };
  syncPickers();
}
function syncPickers() {
  for (const b of $('mapcards').children) b.classList.toggle('on', b.dataset.map === mapIn.value);
  for (const b of $('diffseg').children) b.classList.toggle('on', b.dataset.diff === diffIn.value);
}
const mapIn = $('map');
mapIn.value = MAPS[G.settings.map] ? G.settings.map : 'arena';
mapIn.onchange = () => { G.settings.map = mapIn.value; saveSettings(); ensureMap(mapIn.value); };
buildPickers();

// ---------- 네트워크 이벤트 ----------
net.on('over', () => gameOver(true));
net.on('restart', () => {
  resetGame();
  if (G.mode === 'over') { G.mode = 'paused'; setOverlay('pause', '게임이 재시작되었습니다'); }
});
net.on('playerJoined', (m) => addFeed(`${m.name} 님이 참가했습니다`));
net.on('playerLeft', () => addFeed('플레이어가 나갔습니다'));
net.on('host', () => { if (net.isHost) addFeed('이제 당신이 호스트입니다', true); });
net.on('disconnected', () => { if (G.mode !== 'menu') { addFeed('서버 연결 끊김 — 솔로로 계속합니다', true); } });

function playerState() {
  const p = player.p;
  return {
    x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
    ry: +camera.rotation.y.toFixed(2), rx: +camera.rotation.x.toFixed(2),
    hp: Math.ceil(player.hp), dead: player.dead ? 1 : 0, w: W.current, sc: G.score, k: G.kills,
  };
}

// ---------- 입력 ----------
addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  G.keys[e.code] = true;
  if ((G.mode === 'paused' || G.mode === 'over') && e.code === 'Enter' && !e.repeat) { $('btnResume').click(); return; }
  if (G.mode !== 'playing' || e.repeat) return;
  if (G.shopOpen) { if (e.code === 'KeyB' || e.code === 'Escape' || e.code === 'Enter') hideShop(); return; }
  if (e.code === 'KeyB') { if (canShop()) showShop(); else addFeed('상점은 웨이브 사이에만 열 수 있습니다'); return; }
  if (e.code === ITEMS.strike.code && G.inv.strike > 0) { G.aimStrike = true; return; }   // 떼는 순간 요청
  for (const k in ITEMS) if (e.code === ITEMS[k].code) { useItem(k); return; }
  if (e.code.startsWith('Digit')) {
    const n = +e.code.slice(5);
    if (perkOpen() && n >= 1 && n <= 3) { choosePerk(n - 1); return; }
    if (n >= 1 && n <= WEAPON_ORDER.length) switchWeapon(WEAPON_ORDER[n - 1]);
  }
  if (e.code === 'KeyR') { if (perkOpen()) rerollPerks(); else reload(); }
  if (e.code === 'KeyG') throwGrenade();
  if (e.code === 'KeyV') ping();
  if (e.code === 'KeyQ') dash();
  if (e.code === 'KeyE') cycleWeapon(1);
  if (e.code === 'Space') { jump(); e.preventDefault(); }
  if (e.code === 'Enter' && !perkOpen()) skipIntermission();
  if (e.code === 'Tab') e.preventDefault();
});
addEventListener('keyup', (e) => {
  G.keys[e.code] = false;
  if (e.code === ITEMS.strike.code && G.aimStrike) { G.aimStrike = false; if (G.mode === 'playing' && !G.shopOpen) useItem('strike'); }
});
addEventListener('mousedown', (e) => {
  if (G.mode !== 'playing' || G.shopOpen) return;
  if (e.button === 0) { W.firing = true; W.triggerFresh = true; }
  if (e.button === 2) W.adsHeld = true;
  if (e.button === 1) { ping(); e.preventDefault(); }
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) W.firing = false;
  if (e.button === 2) W.adsHeld = false;
});
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (G.mode === 'playing') cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });
addEventListener('blur', () => { for (const k in G.keys) G.keys[k] = false; W.firing = false; W.adsHeld = false; });

// .glb / .gltf 파일을 끌어다 놓으면 플레이어 앞에 배치
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = [...e.dataTransfer.files].find(f => /\.(glb|gltf)$/i.test(f.name));
  if (!file) return;
  const url = URL.createObjectURL(file);
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
  try {
    await loadModel(url, { position: [player.p.x + dir.x * 6, player.p.y, player.p.z + dir.z * 6] });
    addFeed(`모델 배치: ${file.name}`, true);
  } catch { addFeed(`모델 로드 실패: ${file.name}`); }
});

// ---------- 테스트용 자동 조종 (?debug) ----------
const botAim = new THREE.Vector3(), botEye = new THREE.Vector3(), botErr = new THREE.Vector3();
let botErrT = 0;
function updateBot(dt) {
  if (player.dead) return;
  if (perkOpen()) choosePerk(0);
  // 웨이브 사이: 소총 강화 → 구급 주사 순으로 산다. 체력이 낮으면 구급 주사를 쓴다.
  if (waves.inter && G.wave > 0) {
    const up = upgradeInfo('rifle');
    if (up && G.credits >= up.cost) tryUpgrade('rifle');
    else if (G.inv.medkit < 2) buyItem('medkit');
  }
  if (player.hp < 40) useItem('medkit');
  let best = null, bd = Infinity;
  botEye.copy(camera.position);
  for (const e of G.enemies) {
    const d = e.p.distanceTo(player.p);
    if (d >= bd) continue;
    botAim.set(e.p.x, e.p.y + 1.62 * e.def.scale, e.p.z);
    if (!lineOfSight(botEye, botAim)) continue;
    bd = d; best = e;
  }
  const keys = G.keys;
  keys.KeyW = keys.KeyS = keys.KeyA = keys.KeyD = false;
  if (!best) { W.firing = false; return; }
  // 사람처럼 조준 오차를 준다 (__botSkill: 0 서툼 ~ 1 완벽)
  const skill = window.__botSkill ?? 0.5;
  botErrT -= dt;
  if (botErrT <= 0) {
    botErrT = 0.25;
    const m = (1 - skill) * 0.07 * bd;
    botErr.set((Math.random() - 0.5) * m, (Math.random() - 0.5) * m * 0.6, (Math.random() - 0.5) * m);
  }
  const aimH = skill > 0.8 ? 1.62 : 1.15;
  botAim.set(best.p.x, best.p.y + aimH * best.def.scale, best.p.z).add(botErr);
  camera.lookAt(botAim);
  const cur = W.pending || W.current;
  let want = bd < 8 ? 'shotgun' : bd > 38 || best.def.boss && bd > 20 ? 'sniper' : 'rifle';
  if (cur === 'sniper' && bd > 28 || cur === 'shotgun' && bd < 11) want = cur; // 잦은 교체 방지
  const has = (k) => W.ammo[k].mag + W.ammo[k].reserve > 0;
  const pick = has(want) ? want : has('rifle') ? 'rifle' : 'pistol';
  if (cur !== pick) switchWeapon(pick);
  W.adsHeld = bd > 14;
  W.firing = W.current !== 'sniper' || W.ads > 0.9;
  W.triggerFresh = true;
  if (bd < 7) keys.KeyS = true;
  if (Math.sin(G.time * 1.3) > 0) keys.KeyA = true; else keys.KeyD = true;
  // 위협 회피: 가까운 투사체나 보스 돌진 예고가 보이면 대시
  if (skill >= 0.5 && player.dashCd <= 0) {
    const threat = G.projectiles.some(pr => pr.p.distanceTo(player.p) < 5) ||
      G.enemies.some(e => (e.tele > 0 && e.teleKind === 'charge' || e.charging > 0) && e.p.distanceTo(player.p) < 16);
    if (threat) dash();
  }
  if (player.grenades > 0 && G.enemies.length > 8 && bd > 10 && bd < 22 && Math.random() < 0.01) throwGrenade();
}

// ---------- 메인 루프 ----------
let netT = 0, deathT = 0, menuT = 0;
function step(dt) {
  const active = G.mode === 'playing';
  if (G.mode === 'menu') {
    // 메뉴 배경: 맵을 천천히 도는 카메라
    menuT += dt * 0.08;
    camera.position.set(Math.cos(menuT) * world.size * 0.92, world.size * 0.48, Math.sin(menuT) * world.size * 0.92);
    camera.lookAt(0, 1, 0);
    setGunVisible(false);
    return;
  }
  // 협동 중에는 일시정지해도 세계가 계속 진행됨
  if (!(active || (net.connected && G.mode !== 'menu'))) return;
  G.time += dt;
  if (G.debug && window.__bot && active) updateBot(dt);
  const sprinting = updatePlayer(dt, W.ads > 0.5);
  updateWeapons(dt, sprinting);
  updateEnemies(dt);
  updateWaves(dt);
  updateRemotePlayers(dt);
  updateEffects(dt);
  updateHUD(dt, W, remainingEnemies());
  updateRevive(dt);
  updatePerks(dt, shopFreezesTimer());
  const left = net.isHost ? waves.timer : (G.interEnd || 0) - G.time;
  setInter(canShop() && !G.shopOpen, left, net.isHost && !perkOpen());
  if (G.shopOpen) $('shoptime').textContent = net.connected ? `다음 웨이브까지 ${Math.max(0, Math.ceil(left))}초` : '상점을 보는 동안 시간이 멈춥니다';
  updateStrikeAim();
  if (G.shopOpen && !canShop()) hideShop();
  if (active) {
    updateHints(dt);
    const a = W.ammo[W.current];
    if (a.mag === 0 && a.reserve === 0) hint('noammo', '탄약이 떨어지면 4번 권총(탄약 무한)으로 바꾸세요. 적이 노란 탄약 상자를 떨어뜨립니다');
    if (!player.dead && player.hp < 35) hint('lowhp', '5초 동안 맞지 않으면 체력이 서서히 회복됩니다. 초록 상자는 체력 팩입니다');
  }

  // 솔로: 쓰러진 뒤 잠시 후 게임 오버
  if (player.dead && !net.connected && active) { deathT += dt; if (deathT > 1.2) gameOver(); } else deathT = 0;

  if (net.connected) {
    netT -= dt;
    if (netT <= 0) { netT = 1 / NET_RATE; net.send('ps', playerState()); }
    // 전원 사망 시 게임 오버 (호스트가 판정)
    if (net.isHost && player.dead && G.mode !== 'over' && [...net.players.values()].every(p => p.dead)) gameOver();
  }
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  step(dt);
  render();
});

// ---------- 시작 ----------
// 외부 애셋(모델·텍스처·효과음)을 먼저 받는다. 실패한 것은 절차적 애셋으로 대신한다.
setOverlay('menu', '애셋을 불러오는 중… 0%');
menu.style.display = 'none';   // 다 받기 전에는 시작 버튼을 숨긴다
const assets = await loadAssets(p => { ovsub.textContent = `애셋을 불러오는 중… ${Math.round(p * 100)}%`; });
upgradeGunModels(assets.models);
await ensureMap(G.settings.map);
loadBoard();
resetGame();
setOverlay('menu', menuText());

if (G.debug || new URLSearchParams(location.search).has('expose')) {
  window.__game = { G, player, W, net, waves, camera, step, switchWeapon, throwGrenade, toMenu, dash, grantRocket, shop: { addCredits, showShop, hideShop, tryUpgrade, buyItem, useItem } };
  window.__step = (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) step(dt); render(); };
}
