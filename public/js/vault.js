// 보관함 (사이클 12): 수치 없는 수집품을 보고 장착한다. 메뉴에서만 연다 (I / Esc).
// 탭: 장착(무기별 색·칭호·처치 연출·지참품) / 수집 / 훈장 / 특성(해금 특성 켜고 끄기·무기 숙련)
import { META, WEAPONS } from './config.js';
import { meta, saveMeta, has, itemName, itemSource, dropChance, masteryTier, rankOf, slotCount, kitOpen, ACH, achXp, UNLOCKS } from './meta.js';
import { PERKS } from './perks.js';
import { gun, icon } from './icons.js';

const $ = id => document.getElementById(id);
const SKIN_WEAPONS = ['rifle', 'shotgun', 'sniper', 'pistol', 'rocket'];
const WNAME = { rifle: '소총', shotgun: '샷건', sniper: '저격총', pistol: '권총', rocket: '로켓' };
const hex = c => '#' + c.toString(16).padStart(6, '0');
// 게임은 색을 ×0.55로 어둡게 칠하므로 미리보기도 같은 밝기로
const shade = c => { const r = (c >> 16 & 255) * 0.55, g = (c >> 8 & 255) * 0.55, b = (c & 255) * 0.55; return `rgb(${r | 0},${g | 0},${b | 0})`; };
const GRADE_MARK = { common: '■', rare: '◆', legend: '✦' };
const esc = s => String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

let tab = 'equip', selWeapon = 'rifle', selItem = null, onChange = () => {};
export const vaultOpen = () => !$('vault').hidden;
export const freshCount = () => meta.inv.fresh.length;

export function initVault(changed) {
  onChange = changed;
  const v = $('vault');
  v.addEventListener('click', (e) => {
    const t = e.target.closest('[data-act]');
    if (!t) { if (e.target === v) closeVault(); return; }
    const [act, a, b] = t.dataset.act.split(':');
    if (act === 'tab') tab = a;
    else if (act === 'close') return closeVault();
    else if (act === 'weapon') selWeapon = a;
    else if (act === 'skin') { meta.inv.equip.skin[selWeapon] = a === 'none' ? null : a; changed(); }
    else if (act === 'skinall') { for (const k of SKIN_WEAPONS) meta.inv.equip.skin[k] = meta.inv.equip.skin[selWeapon]; changed(); }
    else if (act === 'title') { meta.inv.equip.title = a === 'none' ? null : a; changed(); }
    else if (act === 'killfx') { meta.inv.equip.killfx = a === 'none' ? null : a; changed(); }
    else if (act === 'item') selItem = a;
    else if (act === 'perk') { const i = meta.perksOff.indexOf(a); if (i >= 0) meta.perksOff.splice(i, 1); else meta.perksOff.push(a); changed(); }
    saveMeta();
    render();
  });
  v.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.kit == null) return;
    meta.kit[+t.dataset.kit] = t.value || null;
    saveMeta(); changed(); render();
  });
}

export function openVault(t = 'equip') {
  tab = t;
  $('vault').hidden = false;
  render();
}
export function closeVault() {
  $('vault').hidden = true;
  onChange();
}
// 메뉴에서의 키: 1~4 탭, Esc 닫기
export function vaultKey(e) {
  if (e.code === 'Escape' || e.code === 'KeyI') { closeVault(); return true; }
  const n = { Digit1: 'equip', Digit2: 'collect', Digit3: 'ach', Digit4: 'perks' }[e.code];
  if (n) { tab = n; render(); return true; }
  return false;
}

function render() {
  // 수집 탭을 열면 새 물건 표시를 지운다 (이번 화면에서는 NEW가 남아 보인다)
  if (tab === 'collect' && meta.inv.fresh.length) { lastFresh = [...meta.inv.fresh]; meta.inv.fresh.length = 0; saveMeta(); }
  const tabs = [['equip', '장착'], ['collect', '수집'], ['ach', '훈장'], ['perks', '특성']];
  const drops = Object.keys(META.items).filter(k => META.items[k].src === 'drop');
  const ownedDrops = drops.filter(k => meta.inv.owned[k]).length;
  $('vault').innerHTML = `<div class="vbox">
    <div class="vhead"><b>보관함</b>
      <nav>${tabs.map(([k, n], i) => `<button data-act="tab:${k}" class="${tab === k ? 'on' : ''}"><kbd>${i + 1}</kbd>${n}${k === 'collect' && meta.inv.fresh.length ? `<i class="new">${meta.inv.fresh.length}</i>` : ''}</button>`).join('')}</nav>
      <span class="vcount">드롭 수집 ${ownedDrops} / ${drops.length}</span>
      <button data-act="close" class="vclose">Esc 닫기</button></div>
    <div class="vbody">${{ equip, collect, ach: achTab, perks: perksTab }[tab]()}</div></div>`;
}
let lastFresh = [];

// ---------- 장착 ----------
function skinChip(id, on) {
  const it = id === 'none' ? null : META.items[id];
  return `<button data-act="skin:${id}" class="chip ${on ? 'on' : ''} ${it?.grade ? 'g-' + it.grade : ''}" title="${it ? esc(it.name) : '기본'}">
    <i style="background:${it ? shade(it.color) : '#3a3e46'}${it?.glow ? `;box-shadow:0 0 8px ${hex(it.glow)}` : ''}"></i><span>${it ? (it.grade ? GRADE_MARK[it.grade] + ' ' : '') + esc(it.name) : '기본'}</span></button>`;
}
function equip() {
  const skins = Object.keys(META.items).filter(k => META.items[k].kind === 'skin');
  const list = SKIN_WEAPONS.map(k => {
    const id = meta.inv.equip.skin[k], it = id && has(id, k) ? META.items[id] : null;
    return `<button data-act="weapon:${k}" class="wrow ${selWeapon === k ? 'on' : ''}"><span class="gunsil" style="color:${it ? shade(it.color) : '#8a919b'}${it?.glow ? `;filter:drop-shadow(0 0 4px ${hex(it.glow)})` : ''}">${gun(k)}</span><b>${WNAME[k]}</b><small>${it ? esc(it.name) : '기본'}</small></button>`;
  }).join('');
  const cur = meta.inv.equip.skin[selWeapon];
  const own = skins.filter(k => has(k, selWeapon));
  const titles = Object.keys(META.items).filter(k => META.items[k].kind === 'title' && has(k));
  const fxs = Object.keys(META.items).filter(k => META.items[k].kind === 'killfx' && has(k));
  const r = rankOf().rank, n = slotCount(r);
  const kit = [0, 1].map(i => {
    if (i >= n) return `<div class="slot lock"><label>슬롯 ${i + 1}</label><span>계급 ${META.slots[i][0]}에 열림</span></div>`;
    const opts = [['', '비움'], ...Object.entries(META.kit).map(([k, d]) => [k, kitOpen(k, r) ? d.name : `${d.name} (계급 ${d.rank})`, !kitOpen(k, r) || meta.kit[1 - i] === k])];
    return `<div class="slot"><label>슬롯 ${i + 1}</label><select data-kit="${i}">${opts.map(([v, t, dis]) => `<option value="${v}"${v === (meta.kit[i] || '') ? ' selected' : ''}${dis ? ' disabled' : ''}>${t}</option>`).join('')}</select></div>`;
  }).join('');
  return `<div class="vcols"><div class="vlist">${list}</div><div class="vdetail">
    <h5>${WNAME[selWeapon]} 색 <small>가진 것 ${own.length}개</small></h5>
    <div class="chips">${skinChip('none', !cur || !has(cur, selWeapon))}${own.map(k => skinChip(k, cur === k)).join('')}</div>
    <button data-act="skinall" class="mini">이 색을 모든 무기에 적용</button>
    <h5>칭호 <small>협동 동료 목록에 이름 앞에 보입니다</small></h5>
    <div class="chips"><button data-act="title:none" class="chip ${!meta.inv.equip.title ? 'on' : ''}"><span>표시 안 함</span></button>${titles.map(k => `<button data-act="title:${k}" class="chip ${meta.inv.equip.title === k ? 'on' : ''} ${META.items[k].grade ? 'g-' + META.items[k].grade : ''}"><span>${esc(itemName(k))}</span></button>`).join('')}</div>
    <h5>처치 연출 <small>내 화면에서만</small></h5>
    <div class="chips"><button data-act="killfx:none" class="chip ${!meta.inv.equip.killfx ? 'on' : ''}"><span>기본 (적 색)</span></button>${fxs.map(k => `<button data-act="killfx:${k}" class="chip ${meta.inv.equip.killfx === k ? 'on' : ''}"><i style="background:${hex(META.items[k].color)}"></i><span>${esc(META.items[k].name)}</span></button>`).join('')}</div>
    <h5>출격 준비 <small>판을 시작할 때 받는 지참품</small></h5><div class="kit">${kit}</div>
  </div></div>`;
}

// ---------- 수집 ----------
function collect() {
  const ids = Object.keys(META.items).filter(k => META.items[k].kind !== 'title' || META.items[k].src === 'drop');
  const sorted = ids.sort((a, b) => (META.items[a].src === 'drop' ? 0 : 1) - (META.items[b].src === 'drop' ? 0 : 1));
  const cell = (k) => {
    const it = META.items[k], got = has(k), fresh = lastFresh.includes(k);
    const sw = it.kind === 'title' ? `<i class="ttl">${icon('star')}</i>` : `<i style="background:${got ? (it.kind === 'killfx' ? hex(it.color) : shade(it.color)) : '#20252c'}${got && it.glow ? `;box-shadow:0 0 8px ${hex(it.glow)}` : ''}"></i>`;
    return `<button data-act="item:${k}" class="cell ${got ? 'got' : 'no'} ${it.grade ? 'g-' + it.grade : ''} ${selItem === k ? 'on' : ''}">${sw}<span>${got ? esc(it.name) : '???'}</span>${fresh ? '<em>NEW</em>' : ''}</button>`;
  };
  const k = selItem && META.items[selItem] ? selItem : sorted[0], it = META.items[k];
  const kindName = { skin: '무기 색', title: '칭호', killfx: '처치 연출' }[it.kind];
  const ch = dropChance(k);
  return `<div class="vnote">드롭은 <b>보스 웨이브 클리어 40%</b> · <b>웨이브 진행 중 보급품 10%</b> · 상급 훈장 희귀 확정 · 숙련 훈장 전설 확정. 이미 가진 것은 다시 나오지 않습니다.</div>
    <div class="vcols"><div class="grid">${sorted.map(cell).join('')}</div><div class="vdetail">
    <h5>${has(k) ? esc(it.name) : '아직 없음'}</h5>
    <p>${kindName}${it.grade ? ` · ${GRADE_MARK[it.grade]} ${META.grades[it.grade].name}` : ''}</p>
    <p class="dim">얻는 곳: ${itemSource(k)}</p>
    ${ch ? `<p class="dim">드롭이 나오면 이것일 확률 약 ${(ch * 100).toFixed(1)}%</p>` : ''}
    ${has(k) && it.src === 'drop' ? `<p class="dim">얻은 날: ${new Date(meta.inv.owned[k]).toLocaleDateString()}</p>` : ''}
  </div></div>`;
}

// ---------- 훈장 ----------
function achTab() {
  const tiers = ['입문', '초급', '중급', '상급', '숙련'];
  return `<div class="achgrid">${tiers.map(t => `<div><h5>${t} <small>${META.tierXp[t]} XP${META.drop.achGrade[t] ? ` · ${META.grades[META.drop.achGrade[t]].name} 드롭 확정` : ''}</small></h5>` +
    ACH.filter(a => a.tier === t).map(a => {
      const got = meta.ach[a.id];
      return `<div class="arow ${got ? 'got' : ''}">${icon('star')}<span><b>${a.name}</b><small>${a.desc}</small></span><em>${got ? (got > 1e12 ? new Date(got).toLocaleDateString() : '✓') : ''}</em></div>`;
    }).join('') + '</div>').join('')}</div>`;
}

// ---------- 특성 ----------
function perksTab() {
  const rows = PERKS.filter(p => p.lock).map(p => {
    const u = UNLOCKS[p.lock], open = u.cond(), off = meta.perksOff.includes(p.lock);
    return `<div class="prow2 ${open ? '' : 'locked'}">${icon(p.name)}<span><b>${p.name}</b>${p.weapon ? `<i class="wtag">${WNAME[p.weapon]} 특화</i>` : p.rare ? '<i class="wtag rare">희귀</i>' : ''}<small>${p.desc}</small></span>
      ${open ? `<button data-act="perk:${p.lock}" class="tog ${off ? '' : 'on'}">${off ? '○ 카드에서 뺌' : '● 카드에 나옴'}</button>` : `<em>${u.how}</em>`}</div>`;
  }).join('');
  const mast = SKIN_WEAPONS.map(k => {
    const m = masteryTier(k), th = META.mastery[k];
    return `<div class="mrow"><span class="gunsil">${gun(k)}</span><b>${WNAME[k]}</b><span>${m.tier}단계 · 누적 ${m.n}처치</span><i><u style="width:${m.next ? Math.round(m.n / m.next * 100) : 100}%"></u></i><small>${m.next ? `다음 ${m.next}` : '최고 단계'} · 2단계 ${th[1]} 특화 특성${k === 'rocket' ? ' 없음' : ''} · 3단계 ${th[2]} 숙련 금장</small></div>`;
  }).join('');
  return `<div class="vnote">해금 특성은 다음 판부터 특성 카드에 나옵니다. 원하는 특성이 덜 나오는 게 싫으면 카드에서 뺄 수 있습니다. 무기 특화 특성은 그 무기 숙련 2단계에서 열리고, 판 중 그 무기로 10처치하면 다음 선택에서 한 번 보장됩니다.</div>
    <div class="vcols"><div class="vlist2">${rows}</div><div class="vdetail"><h5>무기 숙련</h5>${mast}</div></div>`;
}
