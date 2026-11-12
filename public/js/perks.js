// 웨이브 클리어 보상: 3개 중 1개 특성 선택 (희귀 특성은 플레이 방식을 바꾼다)
import { G } from './state.js';
import { player, healPlayer } from './player.js';
import { addAmmo } from './weapons.js';
import { sfx } from './audio.js';
import { icon } from './icons.js';

export const PERKS = [
  { name: '강화 탄환', desc: '모든 피해량 +15%', apply: m => { m.dmg *= 1.15; } },
  { name: '빠른 손', desc: '재장전 시간 20% 단축', apply: m => { m.reload *= 0.8; } },
  { name: '경량 장비', desc: '이동 속도 +8%', apply: m => { m.speed *= 1.08; } },
  { name: '방탄복', desc: '최대 체력 +25, 체력 완전 회복', apply: m => { m.maxHp += 25; player.hp = m.maxHp; } },
  { name: '흡혈', desc: '적 처치 시 체력 +4', apply: m => { m.lifesteal += 4; } },
  { name: '속사', desc: '연사 속도 +12%', apply: m => { m.fireRate *= 1.12; } },
  { name: '탄띠', desc: '예비 탄약 한도 +30%, 즉시 보급', apply: m => { m.ammo *= 1.3; addAmmo(1); } },
  { name: '폭발물 전문가', desc: '수류탄 4개 보급, 체력 +30', apply: () => { player.grenades = 4; healPlayer(30); } },
  // 희귀: 한 번만 얻을 수 있다
  { name: '연쇄 폭발', desc: '내가 처치한 적이 폭발해 주변 적에게 피해', rare: true, apply: m => { m.killBoom = true; } },
  { name: '2단 점프', desc: '공중에서 한 번 더 점프', rare: true, apply: m => { m.airJumps = 1; } },
  { name: '대시 달인', desc: '대시 재사용 대기시간 45% 단축', rare: true, apply: m => { m.dashCd = 0.55; } },
  { name: '급소 사격', desc: '헤드샷 피해 +35%', rare: true, apply: m => { m.head = 1.35; } },
  { name: '불굴', desc: '체력이 35% 아래일 때 받는 피해 40% 감소', rare: true, apply: m => { m.guard = true; } },
  // 해금 특성 (사이클 12): 훈장·숙련도로 열리고 보관함에서 끌 수 있다. lock = 해금 id, max = 최대 장수, w = 뽑힐 가중치
  { name: '숨 고르기', desc: '자연 회복 대기 30% 단축 (2장까지)', lock: 'breath', max: 2, w: 0.5, apply: m => { m.regenDelay *= 0.7; } },
  { name: '근접 사격', desc: '샷건·권총으로 10m 안의 적에게 피해 +20% (2장까지)', lock: 'close', max: 2, w: 0.5, apply: m => { m.close += 1; } },
  { name: '보급 전문가', desc: '보급품을 주우면 효과를 2가지 받는다', rare: true, lock: 'supplier', apply: m => { m.supply2 = true; } },
  { name: '전리품', desc: '처치 크레딧 +30%', rare: true, lock: 'loot', apply: m => { m.loot = 1.3; } },
  // 무기 특화 특성: 그 무기 숙련 2단계 + 이번 판 그 무기로 10처치 → 다음 선택에서 세 번째 카드로 한 번 보장. 그 무기를 들 때만 작동
  { name: '점사 제어', desc: '소총 사격 시 조준점 튐 35% 감소', weapon: 'rifle', lock: 'spec-rifle', apply: m => { m.recoilCut = true; } },
  { name: '슬러그 장전', desc: '샷건 정조준 시 산탄 퍼짐 40% 감소', weapon: 'shotgun', lock: 'spec-shotgun', apply: m => { m.slug = true; } },
  { name: '호흡 정지', desc: '저격총 정조준으로 1.5초 멈춰 있으면 다음 한 발 피해 +25%', weapon: 'sniper', lock: 'spec-sniper', apply: m => { m.steady = true; } },
  { name: '속사 권총', desc: '권총을 누르고 있으면 연사', weapon: 'pistol', lock: 'spec-pistol', apply: m => { m.autoPistol = true; } },
];

G.rarePerks = new Set(PERKS.filter(p => p.rare).map(p => p.name));

const BASE_MODS = { dmg: 1, reload: 1, speed: 1, maxHp: 100, lifesteal: 0, fireRate: 1, ammo: 1, killBoom: false, airJumps: 0, dashCd: 1, head: 1, guard: false,
  regenDelay: 1, close: 0, supply2: false, loot: 1, recoilCut: false, slug: false, steady: false, autoPistol: false };
const WEAPON_NAME = { rifle: '소총', shotgun: '샷건', sniper: '저격총', pistol: '권총' };
// 해금된(그리고 켜 둔) 특성만 풀에 들어간다. G.unlocks는 meta.js가 판 시작 때 정한다
const open = p => !p.lock || G.unlocks?.has(p.lock);
// 가중치 무작위 뽑기 (해금 일반 특성은 0.5 — 기존 특성이 덜 묽어지게)
function pickWeighted(list) {
  const tot = list.reduce((a, p) => a + (p.w ?? 1), 0);
  let x = Math.random() * tot;
  for (let i = 0; i < list.length; i++) { if ((x -= list[i].w ?? 1) < 0) return list.splice(i, 1)[0]; }
  return list.pop();
}
// 이번 선택에서 보장할 특화 특성: 조건을 넘었고 아직 보장받지 않은 무기 중 이번 판 처치가 많은 것 하나
function specFor() {
  let best = null;
  for (const p of PERKS) {
    if (!p.weapon || !open(p) || G.perks[p.name] || G.specOffered?.[p.weapon]) continue;
    const k = G.stats.kw[p.weapon] || 0;
    if (k >= 10 && (!best || k > (G.stats.kw[best.weapon] || 0))) best = p;
  }
  return best;
}
let spec = null;   // 이번 선택에 고정된 특화 카드 (다시 뽑기해도 남는다)

const box = document.getElementById('perks'), hint = document.getElementById('perkhint');
const bar = document.getElementById('perkbar'), barFill = document.getElementById('perkbarfill');
const GRACE = 0.6;
let offerTime = 10;
let choices = null, rerolls = 0, forceRare = false, openedAt = 0;

export function perkOpen() { return !!choices; }

function draw() {
  const common = PERKS.filter(p => !p.rare && !p.weapon && open(p) && !(p.max && G.perks[p.name] >= p.max));
  const rare = PERKS.filter(p => p.rare && open(p) && !G.perks[p.name]);
  choices = [];
  const n = spec ? 2 : 3;
  for (let i = 0; i < n; i++) choices.push(rare.length && (Math.random() < 0.2 || i === 0 && forceRare) ? pickWeighted(rare) : pickWeighted(common));
  if (spec) choices.push(spec);
  box.innerHTML = choices.map((p, i) =>
    `<div class="perk${p.rare ? ' rare' : ''}${p.weapon ? ' spec' : ''}"><span class="tier">${p.weapon ? `${WEAPON_NAME[p.weapon]} 특화` : p.rare ? '희귀' : '일반'}</span><kbd>${i + 1}</kbd><div class="pico">${icon(p.name)}</div><h3>${p.name}</h3><p>${p.desc}</p></div>`).join('');
  hint.textContent = `특성을 선택하세요 (숫자 키 1 · 2 · 3)${rerolls > 0 ? `  ·  R 다시 뽑기 (${rerolls}회)` : ''}  ·  시간이 지나면 무작위 지급`;
}

export function offerPerks(time = 10) {
  if (player.dead) return;
  offerTime = time;
  // 기본 1회 + 상점에서 산 다시 뽑기권. 희귀 보장권이 있으면 첫 카드가 희귀로 나온다 (둘 다 이번 선택에 소모)
  rerolls = 1 + G.tickets.reroll; G.tickets.reroll = 0;
  forceRare = G.tickets.rare > 0 && PERKS.some(p => p.rare && !G.perks[p.name]);
  if (forceRare) G.tickets.rare--;
  spec = specFor();
  if (spec) G.specOffered[spec.weapon] = true;   // 고르지 않아도 이번 판에는 다시 보장하지 않는다
  openedAt = G.time;
  draw();
  bar.style.display = 'block';
  box.classList.add('show');
  hint.style.display = 'block';
}

export function rerollPerks() {
  if (!choices || rerolls <= 0 || G.time - openedAt < GRACE) return false;
  rerolls--;
  draw();
  sfx.switchWeapon();
  return true;
}

// 카드가 뜬 직후에는 무기 교체하려던 키 입력이 선택으로 들어가지 않게 잠깐 막는다
export function choosePerk(i, force = false) {
  if (!choices || !choices[i] || (!force && G.time - openedAt < GRACE)) return false;
  const p = choices[i];
  p.apply(G.mods);
  G.perks[p.name] = (G.perks[p.name] || 0) + 1;
  if (!force) G.hooks.perkPick?.();   // 직접 고름 (시간 초과 무작위 지급 제외)
  sfx.perk();
  G.hooks.feed?.(`특성 획득: ${p.name}`, true, p.name);
  closePerks();
  return true;
}

// 시간 내에 고르지 않으면 무작위로 하나 지급
export function closePerks(auto = false) {
  if (auto && choices) { choosePerk(Math.floor(Math.random() * choices.length), true); return; }
  choices = null; spec = null;
  box.classList.remove('show');
  hint.style.display = 'none';
  bar.style.display = 'none';
}

// 남은 선택 시간 막대
export function updatePerks(dt, frozen) {
  if (!choices) return;
  if (frozen) openedAt += dt;   // 상점을 보는 동안에는 줄어들지 않는다
  barFill.style.width = Math.max(0, 1 - (G.time - openedAt) / offerTime) * 100 + '%';
}

export function resetPerks() {
  closePerks();
  G.perks = {};
  G.specOffered = {};
  Object.assign(G.mods, BASE_MODS);
}
