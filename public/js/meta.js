// 판 사이 성장 (사이클 11~12): 계급(XP) · 보급 슬롯 · 훈장 · 무기 숙련도 · 보관함(수치 없는 수집품) · 해금 특성
// 저장: localStorage 'fps-meta'. 판 안의 적립 상태는 메모리의 run에 둔다.
// 원칙은 config.js의 META 주석 참고 (영구 수치 보너스 없음, 메타 효과는 로컬에서만).
import { META, WEAPON_ORDER } from './config.js';
import { G } from './state.js';
import { W } from './weapons.js';
import { player } from './player.js';

const KEY = 'fps-meta';
const SKIN_WEAPONS = ['rifle', 'shotgun', 'sniper', 'pistol', 'rocket'];
const blank = () => ({
  v: 2, xp: 0, best: 0, kit: [null, null], ach: {}, perksOff: [],
  inv: { owned: {}, fresh: [], equip: { skin: Object.fromEntries(SKIN_WEAPONS.map(k => [k, null])), title: null, killfx: null } },
  tot: { runs: 0, kw: {}, mutClears: {}, mapClear: {}, revives: 0, supply: 0 },
});

function load() {
  let m = null;
  try { m = JSON.parse(localStorage.getItem(KEY)); } catch {}
  if (!m) {
    m = blank();
    // 기존 플레이어 이관: 누적 처치와 최고 웨이브로 시작 XP (훈장은 소급하지 않음)
    try {
      const r = JSON.parse(localStorage.getItem('fps-records') || '{}');
      if (r.runs > 0) { m.xp = Math.min(300, (r.kills || 0) + (r.bestWave || 0) * 20); m.best = r.bestWave || 0; }
    } catch {}
  }
  const b = blank();
  const out = { ...b, ...m, tot: { ...b.tot, ...m.tot },
    inv: { ...b.inv, ...m.inv, equip: { ...b.inv.equip, ...m.inv?.equip, skin: { ...b.inv.equip.skin, ...m.inv?.equip?.skin } } } };
  // 사이클 11 → 12 이관 (한 번만): 전체 공통 색을 무기별로, 보급 누적 칸, 이미 딴 상급·숙련 훈장의 확정 드롭 소급
  if ((m.v || 1) < 2) {
    if (m.skin && m.skin !== 'base') for (const k of SKIN_WEAPONS) out.inv.equip.skin[k] = m.skin;
    out.tot.supply = m.ach?.['first-supply'] ? 1 : 0;
    out.v = 2;
    out._retro = Object.keys(m.ach || {});   // 아래 retroDrops에서 처리 (ACH 정의가 필요)
  }
  return out;
}
export const meta = load();

// 봇·자동 테스트(?debug)는 기록을 남기지 않는다. 테스트가 저장을 확인할 때만 G.metaTest = true
export function saveMeta() {
  if (G.debug && !G.metaTest) return;
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch {}
}

// ---------- 계급 ----------
export function rankOf(xp = meta.xp) {
  const th = [0, ...META.ranks];
  let rank = 1;
  while (rank < th.length && xp >= th[rank]) rank++;
  let cur = th[rank - 1], next = th[rank];
  if (rank >= th.length) {   // 10 이후: 계급당 +after
    const extra = Math.floor((xp - th[th.length - 1]) / META.after);
    rank = th.length + extra;
    cur = th[th.length - 1] + extra * META.after; next = cur + META.after;
  }
  const t = META.titles;
  return { rank, cur, next, title: rank <= t.length ? t[rank - 1] : `${t[t.length - 1]} ★${rank - t.length}` };
}
export function slotCount(rank = rankOf().rank) {
  let n = 0;
  for (const [r, s] of META.slots) if (rank >= r) n = s;
  return n;
}
export const kitOpen = (k, rank = rankOf().rank) => !!META.kit[k] && rank >= META.kit[k].rank;
// 보관함 물건을 가졌는가 (weapon: 숙련 금장처럼 무기마다 다른 것)
export function has(id, weapon) {
  const it = META.items[id];
  if (!it) return false;
  switch (it.src) {
    case 'rank': return rankOf().rank >= it.rank;
    case 'mastery': return weapon ? masteryTier(weapon).tier >= 3 : SKIN_WEAPONS.some(w => masteryTier(w).tier >= 3);
    case 'drop': return !!meta.inv.owned[id];
    case 'ach': return !!meta.ach[it.ach];
    case 'map': return (meta.tot.mapClear[it.map] || 0) >= it.wave;
    case 'mut': return Object.keys(meta.tot.mutClears).length >= it.n;
    case 'rank-title': return true;
  }
  return false;
}
export const itemName = (id) => id === 'rank' ? rankOf().title : META.items[id]?.name || '';
// 물건을 얻는 곳 (보관함 수집 탭)
export function itemSource(id) {
  const it = META.items[id];
  switch (it.src) {
    case 'rank': return `계급 ${it.rank}`;
    case 'mastery': return '그 무기 숙련 3단계 (무기마다)';
    case 'drop': return '드롭 — 보스 웨이브 클리어·웨이브 중 보급품·상급 이상 훈장';
    case 'ach': return `훈장 '${ACH.find(a => a.id === it.ach)?.name}'`;
    case 'map': return `${it.map === 'arena' ? '요새 광장' : '창고 지구'}에서 웨이브 ${it.wave} 클리어`;
    case 'mut': return `서로 다른 변이 ${it.n}종 클리어`;
  }
  return '';
}
export function masteryTier(w) {
  const n = meta.tot.kw[w] || 0, th = META.mastery[w] || [];
  let t = 0; while (t < th.length && n >= th[t]) t++;
  return { tier: t, n, next: th[t] ?? null };
}

// 계급이 오를 때 새로 열리는 것 (결과 화면·메뉴의 "다음에 열릴 것")
export function unlocksAt(rank) {
  const out = [];
  for (const [r, s] of META.slots) if (r === rank) out.push(`보급 슬롯 ${s}개`);
  for (const k in META.kit) if (META.kit[k].rank === rank) out.push(`지참품: ${META.kit[k].name}`);
  for (const k in META.items) if (META.items[k].src === 'rank' && META.items[k].rank === rank) out.push(`무기 색: ${META.items[k].name}`);
  if (rank <= META.titles.length) out.push(`계급명 '${META.titles[rank - 1]}'`);
  return out;
}

// ---------- 훈장 ----------
const maxLv = () => Math.max(0, ...WEAPON_ORDER.map(k => W.lv[k] || 0));
const wv = () => (run && run.firstWave <= 1 ? run.cleared : 0);   // 웨이브 번호 훈장은 1웨이브부터 함께한 판만
const kwAll = () => ['rifle', 'shotgun', 'sniper', 'pistol'].filter(k => (G.stats.kw[k] || 0) > 0).length;
// prog: [현재, 목표] — 메뉴·결과 화면의 "가까운 훈장"에 쓴다 (판 안 조건은 이번 판 값)
export const ACH = [
  { id: 'first-kill',   tier: '입문', name: '첫 처치',       desc: '적을 처치한다',                  prog: () => [G.kills, 1] },
  { id: 'first-head',   tier: '입문', name: '첫 헤드샷',     desc: '머리를 맞힌다',                  prog: () => [G.stats.heads, 1] },
  { id: 'first-clear',  tier: '입문', name: '첫 웨이브',     desc: '웨이브 1을 클리어한다',          prog: () => [run?.cleared || 0, 1] },
  { id: 'first-perk',   tier: '입문', name: '첫 특성',       desc: '특성 카드를 직접 고른다',        prog: () => [run?.pickedPerk ? 1 : 0, 1] },
  { id: 'first-shop',   tier: '입문', name: '첫 거래',       desc: '웨이브 사이에 B로 상점을 열어 무엇이든 산다', prog: () => [Object.keys(G.bought || {}).length ? 1 : 0, 1] },
  { id: 'first-supply', tier: '입문', name: '보급 수령',     desc: '하늘색 빛기둥의 보급품을 줍는다', prog: () => [G.stats.supplyPicked, 1] },
  { id: 'wave-3',       tier: '초급', name: '버티기',        desc: '웨이브 3을 클리어한다',          prog: () => [wv(), 3] },
  { id: 'kills-30',     tier: '초급', name: '30처치',        desc: '한 판에 30처치',                 prog: () => [G.kills, 30] },
  { id: 'up-3',         tier: '초급', name: '정비병',        desc: '무기 하나를 +3까지 강화',         prog: () => [maxLv(), 3] },
  { id: 'rare-perk',    tier: '초급', name: '행운',          desc: '희귀 특성을 얻는다',             prog: () => [Object.keys(G.perks).some(n => G.rarePerks?.has(n)) ? 1 : 0, 1] },
  { id: 'item-use',     tier: '초급', name: '준비된 자',     desc: '아이템(Z·X·T)을 사용한다',       prog: () => [Object.values(G.used || {}).reduce((a, b) => a + b, 0), 1] },
  { id: 'boss-1',       tier: '중급', name: '첫 보스',       desc: '웨이브 5(보스)를 클리어한다',     prog: () => [wv(), 5] },
  { id: 'all-guns',     tier: '중급', name: '만능',          desc: '한 판에 네 무기로 모두 처치',      prog: () => [kwAll(), 4] },
  { id: 'up-5',         tier: '중급', name: '무기 장인',     desc: '무기 하나를 +5까지 강화',         prog: () => [maxLv(), 5] },
  { id: 'heads-40',     tier: '중급', name: '명중 사수',     desc: '명중 30 이상에서 헤드샷 비율 40%', prog: () => [G.stats.hits >= 30 ? Math.round(G.stats.heads / G.stats.hits * 100) : 0, 40] },
  { id: 'mut-3',        tier: '중급', name: '변이 경험',     desc: '서로 다른 변이 웨이브 3종 클리어(누적)', prog: () => [Object.keys(meta.tot.mutClears).length, 3] },
  { id: 'maps-2',       tier: '중급', name: '두 전장',       desc: '두 맵에서 모두 웨이브 3 클리어(누적)', prog: () => [['arena', 'depot'].filter(m => (meta.tot.mapClear[m] || 0) >= 3).length, 2] },
  { id: 'warlord',      tier: '상급', name: '포격 사냥꾼',   desc: '웨이브 10(포격대장)을 클리어한다', prog: () => [wv(), 10] },
  { id: 'hard-5',       tier: '상급', name: '강철 신병',     desc: '어려움으로 웨이브 5 클리어',      prog: () => [G.diff === 'hard' ? wv() : 0, 5] },
  { id: 'up-7-other',   tier: '상급', name: '다른 길',       desc: '소총이 아닌 무기를 +7까지 강화',   prog: () => [Math.max(...['shotgun', 'sniper', 'pistol'].map(k => W.lv[k] || 0)), 7] },
  { id: 'revive-5',     tier: '상급', name: '전우',          desc: '협동에서 동료를 5번 부활(누적)',   prog: () => [meta.tot.revives, 5] },
  { id: 'wave-15',      tier: '숙련', name: '불굴',          desc: '웨이브 15를 클리어한다',          prog: () => [wv(), 15] },
  { id: 'hard-10',      tier: '숙련', name: '강철',          desc: '어려움으로 웨이브 10 클리어',     prog: () => [G.diff === 'hard' ? wv() : 0, 10] },
  { id: 'bare-10',      tier: '숙련', name: '맨몸',          desc: '보급 슬롯을 비우고 웨이브 10 클리어', prog: () => [run?.kitEmpty ? wv() : 0, 10] },
];
export const achXp = (a) => META.tierXp[a.tier];

// 화면 알림 (main.js에서 연결): { kind: 'ach', a, xp } | { kind: 'drop', id } | { kind: 'dup', xp }
let notify = null;
export function setMetaListener(fn) { notify = fn; }

// ---------- 드롭 (사이클 12) ----------
const DROPS = Object.keys(META.items).filter(k => META.items[k].src === 'drop');
const GRADE_ORDER = ['legend', 'rare', 'common'];
const missing = (g) => DROPS.filter(k => META.items[k].grade === g && !meta.inv.owned[k]);
// 등급을 굴리고(또는 확정 등급) 그 등급에서 아직 없는 것을 준다. 등급이 다 찼으면 남은 등급 중 가장 높은 것, 다 모았으면 XP
export function rollDrop(grade = null, rng = Math.random) {
  if (!grade) {
    const gs = META.grades, tot = Object.values(gs).reduce((a, g) => a + g.w, 0);
    let x = rng() * tot;
    for (const [k, g] of Object.entries(gs)) { if ((x -= g.w) < 0) { grade = k; break; } }
    grade ||= 'common';
  }
  let pool = missing(grade);
  if (!pool.length) { const g = GRADE_ORDER.find(g => missing(g).length); pool = g ? missing(g) : []; }
  if (!pool.length) {   // 다 모았다 → XP (판당 상한 밖)
    const xp = META.drop.dupXp;
    meta.xp += xp;
    if (run) { run.dropXp += xp; run.xpGain += xp; }
    notify?.({ kind: 'dup', xp });
    saveMeta();
    return null;
  }
  const id = pool[Math.floor(rng() * pool.length)];
  meta.inv.owned[id] = Date.now();
  if (!meta.inv.fresh.includes(id)) meta.inv.fresh.push(id);
  if (run) run.drops.push(id);
  notify?.({ kind: 'drop', id });
  saveMeta();
  return id;
}
// 드롭이 나왔을 때 그 물건일 확률 (보관함 수집 탭 표시용, rollDrop과 같은 규칙)
export function dropChance(id) {
  const it = META.items[id];
  if (!it || it.src !== 'drop' || meta.inv.owned[id]) return 0;
  const gs = META.grades, tot = Object.values(gs).reduce((a, g) => a + g.w, 0);
  let p = 0;
  for (const [g, d] of Object.entries(gs)) {
    let target = missing(g).length ? g : GRADE_ORDER.find(x => missing(x).length);
    if (target === it.grade) p += d.w / tot / missing(target).length;
  }
  return p;
}

export function checkAch() {
  if (!run || run.ended || !run.active) return;
  for (const a of ACH) {
    if (meta.ach[a.id]) continue;
    const [c, g] = a.prog();
    if (c < g) continue;
    meta.ach[a.id] = Date.now();
    const xp = achXp(a);
    meta.xp += xp; run.achXp += xp; run.xpGain += xp;
    run.ach.push(a.id);
    notify?.({ kind: 'ach', a, xp });
    const sure = META.drop.achGrade[a.tier];
    if (sure) rollDrop(sure);   // 상급 → 희귀, 숙련 → 전설 확정
  }
}

// ---------- 판 적립 ----------
let run = null;
export const currentRun = () => run;

// 지참품 지급 (resetGame 끝에서). 기존 필드·기존 상한만 쓴다.
function applyKit() {
  const rank = rankOf().rank, n = slotCount(rank), used = [];
  for (const k of meta.kit.slice(0, n)) {
    if (!k || !kitOpen(k, rank) || used.includes(k)) continue;
    used.push(k);
    if (k === 'medkit') G.inv.medkit = Math.max(G.inv.medkit || 0, 1);
    else if (k === 'grenade') player.grenades = Math.min(4, player.grenades + 1);
    else if (k === 'reroll') G.tickets.reroll = Math.max(G.tickets.reroll, 1);
    else if (k === 'credits') G.credits += META.kit.credits.amount;   // G.earned에는 넣지 않는다 (번 크레딧과 구분)
  }
  return used;
}

export function startRun() {
  if (run && !run.ended) endRun('quit');   // 웨이브가 한 번도 시작되지 않은 판은 endRun이 집계하지 않는다
  const kit = applyKit();
  computeUnlocks();
  const fx = meta.inv.equip.killfx;
  G.killFx = fx && has(fx) ? META.items[fx].color : null;
  run = { active: false, firstWave: 0, waveSeen: 0, drops: [], dropXp: 0, specOffered: {}, clears: 0, base: 0, record: 0, achXp: 0, xpGain: 0, cleared: 0, boss: 0, kills: 0, mut: '', ach: [],
    prevBest: meta.best, kit, kitEmpty: kit.length === 0, pickedPerk: false, kwBanked: {}, ended: false, rankBefore: rankOf().rank, xpBefore: meta.xp };
}

function baseXp(withJoin) {
  const X = META.xp, joined = withJoin && (G.time >= 30 || G.kills >= 1);
  const raw = ((joined ? X.join : 0) + X.perWave * run.clears + Math.floor(run.kills / X.killDiv) + run.boss) * (X.diff[G.diff] || 1);
  return Math.min(X.cap, Math.round(raw));
}
// 지금까지 번 XP를 meta로 옮긴다. 같은 값을 두 번 적립하지 않도록 차이만 더한다.
function bank(withJoin) {
  const b = baseXp(withJoin);
  if (b > run.base) { meta.xp += b - run.base; run.xpGain += b - run.base; run.base = b; }
  // 최고 웨이브 기록·맵 기록은 1웨이브부터 함께한 판만 (협동 중간 참가로 기록을 건너뛰지 않게)
  if (fullRun()) {
    const X = META.xp, reached = Math.max(run.cleared, G.wave);
    const rec = Math.min(X.recordCap, X.recordPer * Math.max(0, reached - run.prevBest));
    if (rec > run.record) { meta.xp += rec - run.record; run.xpGain += rec - run.record; run.record = rec; }
    meta.best = Math.max(meta.best, reached);
  }
  for (const [k, v] of Object.entries(G.stats.kw)) {
    const d = v - (run.kwBanked[k] || 0);
    if (d > 0) { meta.tot.kw[k] = (meta.tot.kw[k] || 0) + d; run.kwBanked[k] = v; }
  }
  if (G.map && run.cleared && fullRun()) meta.tot.mapClear[G.map] = Math.max(meta.tot.mapClear[G.map] || 0, run.cleared);
}

// ---------- 판 안 사건 (main.js 훅에서 호출) ----------
export function metaKill(noReward) { if (!run || run.ended) return; if (!noReward) run.kills++; checkAch(); }
export function metaWaveStart(info) { if (run) { run.mut = info.mut || ''; run.active = true; run.waveSeen = info.n; if (!run.firstWave) run.firstWave = info.n; } }
// 1웨이브부터 함께한 판인가 (웨이브 번호로 판정하는 기록·훈장의 조건)
const fullRun = () => run && run.firstWave <= 1;
// 협동: 웨이브 XP는 팀 공통(쓰러져 있어도 받음). 호스트가 바뀌어 같은 웨이브가 다시 와도 한 번만 적립
export function metaWaveClear(info) {
  if (!run || run.ended || info.n <= run.cleared) return;
  if (!run.firstWave) run.firstWave = info.n;   // 웨이브 도중에 들어와 시작을 못 본 경우
  run.cleared = info.n;
  run.clears++;
  if (info.n % 5 === 0) run.boss += info.n % 10 === 0 ? META.xp.warlord : META.xp.boss;
  if (run.mut) meta.tot.mutClears[run.mut] = 1;
  bank(false);
  checkAch();
  // 보스 웨이브: 그 웨이브의 시작을 본 사람만 각자 굴린다 (호스트 이전으로 같은 웨이브가 와도 위의 중복 검사에서 걸러짐)
  if (info.n % 5 === 0 && run.waveSeen === info.n && Math.random() < META.drop.boss) rollDrop();
  saveMeta();
}
// 보급품: 웨이브 진행 중에 주웠을 때만 굴린다 (휴식 시간의 안전한 회수는 제외). mine: 내가 주웠나 (누적 기록은 내 것만)
export function metaSupply(mine) {
  if (!run || run.ended) return;
  if (mine) meta.tot.supply++;
  if (G.inWave && Math.random() < META.drop.supply) rollDrop();
  checkAch();
}
export function metaEvent(kind) {
  if (!run || run.ended) return;
  if (kind === 'perk') run.pickedPerk = true;
  if (kind === 'revive') meta.tot.revives++;
  checkAch();
}

// 판 끝: 'over'(게임 오버, 참가 XP 포함) / 'quit'(메뉴로 나감·탭 닫기, 참가 XP 없음)
export function endRun(reason = 'over') {
  if (!run || run.ended) return run;
  if (!run.active) { run.ended = true; return run; }   // 메뉴에서 만든 빈 판
  bank(reason === 'over');
  checkAch();
  run.ended = true;
  meta.tot.runs++;
  saveMeta();
  return run;
}

// 결과 화면용 XP 내역
export function runBreakdown(r = run) {
  const X = META.xp, d = X.diff[G.diff] || 1;
  return {
    join: r.base > 0 && (G.time >= 30 || G.kills >= 1) && r.ended ? X.join : 0,
    waves: X.perWave * r.clears, kills: Math.floor(r.kills / X.killDiv), boss: r.boss, diff: d,
    base: r.base, capped: r.base >= X.cap, record: r.record, achXp: r.achXp, dropXp: r.dropXp || 0, total: r.xpGain,
  };
}

// 가까운 훈장 (아직 못 딴 것 중 진척 비율이 높은 순)
export function nearAch(n = 3) {
  return ACH.filter(a => !meta.ach[a.id]).map(a => { const [c, g] = a.prog(); return { a, c: Math.min(c, g), g, p: Math.min(1, c / g) }; })
    .sort((x, y) => y.p - x.p || achXp(x.a) - achXp(y.a)).slice(0, n);
}

// ---------- 해금 특성 (사이클 12) ----------
// 특성 id → 조건과 설명 (보관함 특성 탭). perks.js는 meta.js를 부르지 않고 G.unlocks만 본다.
export const UNLOCKS = {
  breath:   { cond: () => !!meta.ach['boss-1'], how: "훈장 '첫 보스'" },
  close:    { cond: () => masteryTier('shotgun').tier >= 1, how: '샷건 숙련 1단계' },
  supplier: { cond: () => meta.tot.supply >= 5, how: '보급품 누적 5회 획득' },
  loot:     { cond: () => !!meta.ach['up-5'], how: "훈장 '무기 장인'" },
  'spec-rifle':   { cond: () => masteryTier('rifle').tier >= 2, how: '소총 숙련 2단계' },
  'spec-shotgun': { cond: () => masteryTier('shotgun').tier >= 2, how: '샷건 숙련 2단계' },
  'spec-sniper':  { cond: () => masteryTier('sniper').tier >= 2, how: '저격총 숙련 2단계' },
  'spec-pistol':  { cond: () => masteryTier('pistol').tier >= 2, how: '권총 숙련 2단계' },
};
// 판 시작 때 한 번 계산해 고정한다 (판 도중에 연 특성은 다음 판부터)
export function computeUnlocks() {
  G.unlocks = new Set(Object.keys(UNLOCKS).filter(k => UNLOCKS[k].cond() && !meta.perksOff.includes(k)));
}

// 사이클 11 → 12 이관: 이미 딴 상급·숙련 훈장의 확정 드롭을 알림 없이 지급
if (meta._retro) {
  for (const id of meta._retro) { const a = ACH.find(x => x.id === id); const g = a && META.drop.achGrade[a.tier]; if (g) rollDrop(g); }
  delete meta._retro;
  saveMeta();
}
