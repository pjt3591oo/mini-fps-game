// 판 기록 요약 (기획 회의 근거용): data/runs.jsonl → 표
//   node tools/runs-report.js          테스트 판(test: true) 제외
//   node tools/runs-report.js --all    테스트 판 포함
//   node tools/runs-report.js --json   요약을 JSON으로
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const FILE = path.join(__dirname, '..', 'data', 'runs.jsonl');
let runs = [];
try {
  runs = fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
} catch { console.log('판 기록이 없습니다:', FILE); process.exit(0); }
const testN = runs.filter(r => r.test).length;
if (!args.includes('--all')) runs = runs.filter(r => !r.test);

const count = (arr, f) => arr.reduce((m, r) => { const k = f(r); if (k != null) m[k] = (m[k] || 0) + 1; return m; }, {});
const pct = (a, b) => b ? `${Math.round(a / b * 100)}%` : '-';
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const sum = (a, f) => a.reduce((t, r) => t + (f(r) || 0), 0);
const top = (m, n = 5) => Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, n);

const N = runs.length;
const kw = {};
for (const r of runs) for (const [k, v] of Object.entries(r.kw || {})) kw[k] = (kw[k] || 0) + v;
const kwTotal = Object.values(kw).reduce((a, b) => a + b, 0);
const withMeta = runs.filter(r => r.meta);
const report = {
  runs: N, excludedTest: args.includes('--all') ? 0 : testN,
  period: N ? [runs[0].at, runs[N - 1].at] : null,
  map: count(runs, r => r.map), diff: count(runs, r => r.diff), coop: count(runs, r => r.coop ? '협동' : '솔로'),
  wave: { median: median(runs.map(r => r.wave)), max: Math.max(0, ...runs.map(r => r.wave)), dist: count(runs, r => r.wave >= 10 ? '10+' : r.wave >= 5 ? '5~9' : r.wave >= 3 ? '3~4' : '1~2') },
  timeMedian: median(runs.map(r => r.time)),
  cause: top(count(runs, r => r.cause || '(나감)'), 8),
  shop: { seen: pct(runs.filter(r => r.shopSeen).length, N), bought: pct(runs.filter(r => r.bought && Object.keys(r.bought).length).length, N), items: top(runs.reduce((m, r) => { for (const [k, v] of Object.entries(r.bought || {})) m[k] = (m[k] || 0) + v; return m; }, {}), 8) },
  supply: { seen: sum(runs, r => r.supplySeen), picked: sum(runs, r => r.supplyPicked) },
  itemsUsed: runs.reduce((m, r) => { for (const [k, v] of Object.entries(r.used || {})) m[k] = (m[k] || 0) + v; return m; }, {}),
  weapons: Object.fromEntries(Object.entries(kw).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, pct(v, kwTotal)])),
  upgrade: Object.fromEntries(['rifle', 'shotgun', 'sniper', 'pistol'].map(k => [k, median(runs.map(r => (r.lv || {})[k] || 0))])),
  accuracy: pct(sum(runs, r => r.hits), sum(runs, r => r.shots)), headRate: pct(sum(runs, r => r.heads), sum(runs, r => r.hits)),
  meta: withMeta.length ? {
    runs: withMeta.length,
    rank: count(withMeta, r => r.meta.rank),
    xpGainMedian: median(withMeta.map(r => r.meta.xpGain || 0)),
    kitUse: pct(withMeta.filter(r => (r.meta.kit || []).length).length, withMeta.length),
    kit: withMeta.reduce((m, r) => { for (const k of r.meta.kit || []) m[k] = (m[k] || 0) + 1; return m; }, {}),
    ach: top(withMeta.reduce((m, r) => { for (const a of r.meta.ach || []) m[a] = (m[a] || 0) + 1; return m; }, {}), 10),
    drops: withMeta.reduce((m, r) => { for (const d of r.meta.drops || []) m[d] = (m[d] || 0) + 1; return m; }, {}),
  } : null,
};

if (args.includes('--json')) { console.log(JSON.stringify(report, null, 2)); process.exit(0); }

const line = (k, v) => console.log(`${k.padEnd(14, ' ')} ${v}`);
const fmt = m => Object.entries(m).map(([k, v]) => `${k} ${v}`).join(' · ') || '-';
console.log(`\n판 기록 요약 — ${N}판${report.excludedTest ? ` (테스트 판 ${report.excludedTest}개 제외)` : ''}`);
if (!N) process.exit(0);
console.log(`기간: ${report.period[0]} ~ ${report.period[1]}`);
if (N < 20) console.log('※ 20판 미만: 경향만 참고하고 수치 판정에는 쓰지 말 것');
console.log('');
line('맵', fmt(report.map)); line('난이도', fmt(report.diff)); line('모드', fmt(report.coop));
line('도달 웨이브', `중앙값 ${report.wave.median} · 최고 ${report.wave.max} · ${fmt(report.wave.dist)}`);
line('생존 시간', `중앙값 ${report.timeMedian}초`);
line('사망 원인', report.cause.map(([k, v]) => `${k} ${v}`).join(' · '));
line('상점', `연 판 ${report.shop.seen} · 산 판 ${report.shop.bought} · ${report.shop.items.map(([k, v]) => `${k} ${v}`).join(' · ') || '구매 없음'}`);
line('보급품', `투하 ${report.supply.seen} · 획득 ${report.supply.picked} (${pct(report.supply.picked, report.supply.seen)})`);
line('아이템 사용', fmt(report.itemsUsed));
line('무기 처치 비율', fmt(report.weapons));
line('강화 중앙값', fmt(report.upgrade));
line('명중률', `${report.accuracy} · 명중 중 헤드샷 ${report.headRate}`);
if (report.meta) {
  const m = report.meta;
  console.log(`\n[성장] 메타 기록이 있는 판 ${m.runs}개`);
  line('계급 분포', fmt(m.rank)); line('판당 XP', `중앙값 ${m.xpGainMedian}`);
  line('지참품', `사용한 판 ${m.kitUse} · ${fmt(m.kit)}`);
  line('훈장', m.ach.map(([k, v]) => `${k} ${v}`).join(' · ') || '-');
  line('드롭', fmt(m.drops));
}
console.log('');
