// 모듈 간에 공유하는 게임 상태
export const G = {
  mode: 'menu',        // menu | playing | paused | over
  time: 0,
  wave: 0,
  score: 0,
  kills: 0,
  combo: 0, comboTimer: 0,
  keys: {},
  enemies: [],
  projectiles: [],
  pickups: [],
  grenades: [],
  hooks: {},           // 모듈 간 콜백 (main.js에서 등록)
  perks: {},           // 획득한 특성 { id: 횟수 }
  mods: { dmg: 1, reload: 1, speed: 1, maxHp: 100, lifesteal: 0, fireRate: 1, ammo: 1, killBoom: false, airJumps: 0, dashCd: 1, head: 1, guard: false },
  pings: [],
  map: 'arena',        // 현재 맵 (협동에서는 호스트 설정)
  mut: null,
  buffs: { amp: 0, shield: 0 },
  credits: 0, earned: 0,      // 상점 재화
  inv: {}, used: {}, bought: {},
  tickets: { reroll: 0, rare: 0 },   // 특성 개입권          // 소모 아이템 보유 수 / 사용 횟수
  shopOpen: false, shopSeen: false,   // 일시 강화 효과가 끝나는 시각           // 이번 웨이브의 변이
  stats: { shots: 0, hits: 0, heads: 0, taken: 0, by: {}, kw: {}, supplySeen: 0, supplyPicked: 0 },
  diff: 'normal',      // 이번 판의 난이도 (협동에서는 호스트 설정)
  settings: { sens: 1, fov: 75, volume: 0.6, difficulty: 'normal', map: 'arena', gfx: 'high' },
  debug: new URLSearchParams(location.search).has('debug'),
  test: new URLSearchParams(location.search).has('test'),   // 일부러 끝내는 시험 판: 판 기록에 test 표시, 순위표 제외
};

try { Object.assign(G.settings, JSON.parse(localStorage.getItem('fps-settings') || '{}')); } catch {}
export function saveSettings() {
  try { localStorage.setItem('fps-settings', JSON.stringify(G.settings)); } catch {}
}
