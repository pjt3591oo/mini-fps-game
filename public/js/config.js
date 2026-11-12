// 게임 전역 설정값

export const PLAYER = {
  R: 0.35, H: 1.75, EYE: 1.6,
  CROUCH_H: 1.15, CROUCH_EYE: 1.0,
  SPEED: 6, SPRINT: 9.5, CROUCH_SPEED: 3, JUMP: 6.5, GRAV: 20,
  STEP: 0.55,          // 이 높이 이하의 턱은 자동으로 올라감
  MAX_HP: 100,
  REGEN_DELAY: 5, REGEN_RATE: 6,
};

export const WEAPONS = {
  rifle: {
    name: '소총', key: 1,
    // fireDelay 0.117: 연사 버그(사이클 13)를 고치기 전 60fps의 실제 연사(초당 8.58발)를 유지한다. 설계상 0.1이던 값
    mag: 30, reserve: 150, fireDelay: 0.117, reload: 1.5,
    dmg: 30, headMul: 3, spread: 0.006, pellets: 1, auto: true,
    adsFov: 48, adsSpreadMul: 0.4, recoil: 0.008, kick: 0.05,
    adsPos: [0, -0.15, -0.36],
  },
  shotgun: {
    name: '샷건', key: 2,
    mag: 6, reserve: 40, fireDelay: 0.8, reload: 2.4,
    dmg: 16, headMul: 2, spread: 0.045, pellets: 9, auto: false,
    adsFov: 58, adsSpreadMul: 0.7, recoil: 0.035, kick: 0.16,
    adsPos: [0, -0.1, -0.3], falloff: 20,
  },
  sniper: {
    name: '저격총', key: 3,
    mag: 5, reserve: 30, fireDelay: 1.2, reload: 2.6,
    dmg: 140, headMul: 2.5, spread: 0.004, pellets: 1, auto: false,
    adsFov: 14, adsSpreadMul: 0.02, recoil: 0.05, kick: 0.22,
    adsPos: [0, -0.1, -0.3], scope: true, pierce: 2, hipSpread: 0.05,
  },
  pistol: {
    name: '권총', key: 4,
    mag: 12, reserve: Infinity, fireDelay: 0.16, reload: 1.1,
    dmg: 24, headMul: 3, spread: 0.01, pellets: 1, auto: false,
    adsFov: 60, adsSpreadMul: 0.5, recoil: 0.012, kick: 0.07,
    adsPos: [0, -0.1, -0.3],
  },
  // 보급품으로만 얻는 무기
  rocket: {
    name: '로켓', key: 5, dropOnly: true,
    mag: 1, reserve: 3, fireDelay: 0.8, reload: 1.7,
    dmg: 280, headMul: 1, spread: 0, pellets: 1, auto: false,
    adsFov: 58, adsSpreadMul: 1, recoil: 0.045, kick: 0.26,
    adsPos: [0.05, -0.12, -0.3], rocket: { speed: 46, r: 6.5, pd: 60 },
  },
};
export const WEAPON_ORDER = ['rifle', 'shotgun', 'sniper', 'pistol', 'rocket'];

export const ENEMY_TYPES = {
  grunt:   { name: '병사',   hp: 100, speed: 3.2, scale: 1,    color: 0xa8322a, melee: 10, meleeRange: 1.7, score: 100, drop: 0.25 },
  rusher:  { name: '돌격병', hp: 55,  speed: 6.2, scale: 0.8,  color: 0xe07a20, melee: 8,  meleeRange: 1.5, score: 120, drop: 0.2 },
  shooter: { name: '사수',   hp: 80,  speed: 2.6, scale: 1,    color: 0x7a3fb0, melee: 6,  meleeRange: 1.6, score: 150, drop: 0.35,
             ranged: { min: 9, max: 17, cd: 2.2, speed: 15, dmg: 12, telegraph: 0.5 } },
  bomber:  { name: '자폭병', hp: 60,  speed: 5.2, scale: 0.9,  color: 0xb8d020, melee: 0,  meleeRange: 1.2, score: 130, drop: 0.15,
             explode: { trigger: 2.3, fuse: 0.55, r: 5.5, dmg: 150, pd: 45 } },
  tank:    { name: '중장갑', hp: 380, speed: 1.9, scale: 1.45, color: 0x3c5a3a, melee: 28, meleeRange: 2.4, score: 300, drop: 0.6, headMul: 0.6 },
  boss:    { name: '보스',   boss: true, hp: 3200, headMul: 0.5, speed: 2.4, scale: 2.4, color: 0x5a1020, melee: 35, meleeRange: 3.4, score: 2000, drop: 1,
             ranged: { min: 6, max: 30, cd: 2.8, speed: 13, dmg: 16, telegraph: 0.7, fan: 3 },
             charge: { cd: 7, speed: 12, dur: 1.1, dmg: 30 }, summon: { cd: 14, count: 3, type: 'rusher' } },
  // 10웨이브마다 등장하는 두 번째 보스: 돌진 대신 포격으로 자리를 옮기게 만든다
  warlord: { name: '포격대장', boss: true, hp: 3000, headMul: 0.5, speed: 1.7, scale: 2.6, color: 0x1c3050, melee: 40, meleeRange: 3.6, score: 3500, drop: 1,
             ranged: { min: 6, max: 34, cd: 3.4, speed: 15, dmg: 14, telegraph: 0.6, fan: 3 },
             mortar: { cd: 4.4, count: 3, delay: 1.5, r: 4.2, pd: 38, spread: 6, max: 40, tele: 0.8 }, summon: { cd: 12, count: 2, type: 'shooter' } },
  // 척탄병: 플레이어에게서 가려진 포대 지점(맵의 perches)을 찾아가 곡사로 쏜다. 고지에 눌러앉는 플레이어를 움직이게 한다.
  grenadier: { name: '척탄병', hp: 70, speed: 2.8, scale: 1, color: 0x2f8f6a, melee: 6, meleeRange: 1.6, score: 180, drop: 0.4,
               mortar: { cd: 6, count: 1, delay: 1.8, r: 3.2, pd: 26, spread: 0, single: true, min: 12, max: 38, hold: 20, tele: 0.8, src: '척탄병 포격' } },
};

export const PICKUPS = {
  health: { color: 0x3cdc64, amount: 30 },
  ammo:   { color: 0xffc83c, amount: 0.35 }, // 예비 탄약의 비율
  supply: { color: 0x40d8ff, life: 50 },     // 보급품 투하
};

// ---------- 아이템 / 보급 / 강화 (상점) ----------
// 소모 아이템: 상점에서 사서 지정 키로 쓴다
export const ITEMS = {
  medkit: { name: '구급 주사', key: 'Z', code: 'KeyZ', price: 60,  max: 3, heal: 60, desc: '체력 60을 즉시 회복' },
  shield: { name: '방어막',   key: 'X', code: 'KeyX', price: 90,  max: 2, dur: 6, cut: 0.7, desc: '6초 동안 받는 피해 70% 감소' },
  strike: { name: '폭격 요청', key: 'T', code: 'KeyT', price: 140, max: 2, delay: 2, r: 7, dmg: 600, pd: 50, desc: '조준한 곳에 2초 뒤 대형 폭발 (가까우면 나도 다침)' },
};
// 즉시 적용되는 보급
export const SUPPLIES = {
  ammo: { name: '탄약 보급', price: 35, desc: '모든 무기의 예비 탄약 50% 보충' },
  rocket: { name: '로켓 발사기', price: 160, desc: '로켓 4발 (5번 키)' },
  // 특성 개입권: 무료로 고르는 특성의 운을 크레딧으로 다룬다
  reroll: { name: '다시 뽑기권', price: 40, max: 2, desc: '다음 특성 선택에서 R 다시 뽑기 +1' },
  rare: { name: '희귀 보장권', price: 150, max: 1, desc: '다음 특성 선택의 첫 카드가 희귀 특성' },
};
// 무기 강화: 단계마다 피해 +10%, 3단계 탄창 +25%. 5·7단계는 무기마다 다른 고유 효과(UPGRADE_FX)
export const UPGRADE = {
  max: 7, dmg: 0.1, magAt: 3, fxAt: 5, pity: 0.1,
  cost:   [60, 90, 130, 180, 240, 320, 420],
  chance: [1, 1, 0.9, 0.8, 0.65, 0.5, 0.4],
};
// 5단계 / 7단계 고유 효과 (설명 문구. 실제 적용은 weapons.js와 main.js의 처치 훅)
export const UPGRADE_FX = {
  rifle:   { 5: '정조준 탄 퍼짐 40% 감소', 7: '헤드샷 처치 시 3발 환급' },
  shotgun: { 5: '산탄 9발 → 11발', 7: '유효 사거리 +50%' },
  sniper:  { 5: '관통 2 → 4', 7: '헤드샷 처치 시 1발 환급' },
  pistol:  { 5: '헤드샷 배율 3 → 3.5', 7: '처치마다 대시 대기 0.5초 감소' },
};
// 크레딧 획득
export const CREDITS = { perScore: 0.1, head: 1.5, waveBase: 20, wavePer: 5, supply: 40, assist: 0.25 };

export const DIFFICULTY = {
  easy:   { name: '쉬움',   dmg: 0.6,  hp: 0.85, count: 0.8,  score: 0.7 },
  normal: { name: '보통',   dmg: 1,    hp: 1,    count: 1,    score: 1 },
  hard:   { name: '어려움', dmg: 1.35, hp: 1.2,  count: 1.25, score: 1.5 },
};

// 웨이브 변이: 3웨이브부터 일정 확률로 한 가지가 적용된다 (보스 웨이브 제외)
export const MUTATORS = {
  frenzy:  { name: '광란', desc: '적이 25% 빨라집니다', speed: 1.25 },
  armored: { name: '중무장', desc: '적 체력 +40% · 처치 점수 +50%', hp: 1.4, score: 1.5 },
  blast:   { name: '폭발 주의', desc: '자폭병이 몰려옵니다', comp: 'bomber' },
  snipers: { name: '사격 훈련', desc: '사수 부대가 등장합니다', comp: 'shooter' },
  fog:     { name: '짙은 안개', desc: '시야가 좁아집니다 · 처치 점수 +30%', fog: true, score: 1.3 },
  bounty:  { name: '보급의 날', desc: '적이 보급품을 3배로 떨어뜨립니다', drop: 3 },
  swarm:   { name: '물량 공세', desc: '약한 적이 두 배 가까이 몰려옵니다', count: 1.8, hp: 0.5 },
};

export const DASH = { speed: 21, dur: 0.17, cd: 2.5, iframe: 0.25 };

export const NET_RATE = 15; // 초당 상태 전송 횟수

// ---------- 판 사이 성장 (사이클 11) ----------
// 원칙: 영구 피해·체력 % 없음. 힘은 보급 슬롯 2개(상점 가격 60 이하 품목)까지, 그 뒤는 칭호·외형만.
// 메타 효과는 각자 로컬에서만 적용하고 호스트 시뮬레이션(적 체력·스폰·투하)은 바꾸지 않는다.
export const META = {
  // 판 XP = min(cap, (참가 + 웨이브×클리어 + 처치÷killDiv + 보스) × 난이도) + 최고 웨이브 갱신 보너스 + 훈장 XP
  xp: { join: 10, perWave: 5, killDiv: 4, boss: 20, warlord: 30, cap: 150, recordPer: 10, recordCap: 30,
        diff: { easy: 0.8, normal: 1, hard: 1.2 } },
  // 계급 2~10의 누적 XP 문턱. 11부터는 계급당 +after (칭호만)
  ranks: [30, 80, 150, 250, 400, 600, 850, 1150, 1500], after: 500,
  titles: ['신병', '이병', '일병', '상병', '병장', '하사', '중사', '상사', '원사', '베테랑'],   // 계급 1~10, 이후 '베테랑 ★n'
  slots: [[2, 1], [5, 2]],   // [계급, 열리는 슬롯 수]
  // 지참품: 판을 시작할 때 받는다. 모두 상점 가격 60 이하 (밸런스 상한: 두 슬롯 합계 약 110 크레딧어치)
  kit: {
    medkit:  { name: '구급 주사 1개', rank: 2, value: 60 },
    grenade: { name: '수류탄 +1',     rank: 3, value: 20 },
    reroll:  { name: '다시 뽑기권 1장', rank: 4, value: 40 },
    credits: { name: '시작 크레딧 50', rank: 5, value: 50, amount: 50 },
  },
  // ---------- 보관함 물건 (사이클 12) — 모두 수치 없음 ----------
  // kind: skin(무기 색) | title(칭호) | killfx(처치 파편 색)
  // src: rank(계급) | mastery(그 무기 숙련 3단계) | drop(드롭으로 얻어 owned에 기록) | ach(훈장) | map(그 맵 웨이브 n 클리어) | mut(변이 n종 클리어) | rank-title(현재 계급명)
  // skin 값: color(몸체 색), metal·rough(재질), glow·glowI(발광 — 1인칭이라 0.35 이하)
  items: {
    desert:  { kind: 'skin', src: 'rank', rank: 6, name: '사막',   color: 0xb59a6a },
    olive:   { kind: 'skin', src: 'rank', rank: 7, name: '올리브', color: 0x6b7a4a },
    arctic:  { kind: 'skin', src: 'rank', rank: 8, name: '설원',   color: 0xd8dde2 },
    crimson: { kind: 'skin', src: 'rank', rank: 9, name: '진홍',   color: 0x8a2a2a },
    mastery: { kind: 'skin', src: 'mastery', name: '숙련 금장', color: 0xc8a040, metal: 0.7, rough: 0.3 },
    'd-teal':  { kind: 'skin', src: 'drop', grade: 'common', name: '청록', color: 0x2f8f8a },
    'd-navy':  { kind: 'skin', src: 'drop', grade: 'common', name: '해군', color: 0x2a3f6a },
    'd-sand':  { kind: 'skin', src: 'drop', grade: 'common', name: '모래', color: 0xc9b48a },
    'd-rust':  { kind: 'skin', src: 'drop', grade: 'common', name: '녹',   color: 0x9a4a2a },
    'd-slate': { kind: 'skin', src: 'drop', grade: 'common', name: '청회', color: 0x5a6672 },
    'd-bone':  { kind: 'skin', src: 'drop', grade: 'common', name: '상아', color: 0xe8dcc0 },
    'd-moss':  { kind: 'skin', src: 'drop', grade: 'common', name: '이끼', color: 0x4a6a3a },
    'd-plum':  { kind: 'skin', src: 'drop', grade: 'common', name: '자두', color: 0x5a2f5a },
    // 처치 파편 색은 픽업 색(탄약 금색·보급 청록)과 겹치지 않게
    'fx-violet': { kind: 'killfx', src: 'drop', grade: 'common', name: '보랏빛 파편', color: 0xb050ff },
    'fx-white':  { kind: 'killfx', src: 'drop', grade: 'common', name: '백색 파편', color: 0xf0f4ff },
    'd-gunmetal': { kind: 'skin', src: 'drop', grade: 'rare', name: '건메탈', color: 0x4a4e54, metal: 0.8, rough: 0.3 },
    'd-copper':   { kind: 'skin', src: 'drop', grade: 'rare', name: '구리',   color: 0xb87333, metal: 0.8, rough: 0.3 },
    'd-chrome':   { kind: 'skin', src: 'drop', grade: 'rare', name: '크롬',   color: 0xd0d4d8, metal: 0.8, rough: 0.15 },
    'd-cobalt':   { kind: 'skin', src: 'drop', grade: 'rare', name: '코발트', color: 0x2a5ab8, metal: 0.8, rough: 0.3 },
    't-scav':  { kind: 'title', src: 'drop', grade: 'rare', name: '수집가' },
    't-ghost': { kind: 'title', src: 'drop', grade: 'rare', name: '유령' },
    'd-ember':  { kind: 'skin', src: 'drop', grade: 'legend', name: '잔불',   color: 0x3a1a10, glow: 0xff5a1a, glowI: 0.35 },
    'd-aurora': { kind: 'skin', src: 'drop', grade: 'legend', name: '오로라', color: 0x10283a, glow: 0x40ffc8, glowI: 0.35 },
    // 칭호 (드롭 외)
    'rank':       { kind: 'title', src: 'rank-title', name: '계급명' },
    't-warlord':  { kind: 'title', src: 'ach', ach: 'warlord', name: '포격 사냥꾼' },
    't-steel':    { kind: 'title', src: 'ach', ach: 'hard-10', name: '강철' },
    't-bare':     { kind: 'title', src: 'ach', ach: 'bare-10', name: '맨몸' },
    't-comrade':  { kind: 'title', src: 'ach', ach: 'revive-5', name: '전우' },
    't-marksman': { kind: 'title', src: 'ach', ach: 'heads-40', name: '명중 사수' },
    't-plaza':    { kind: 'title', src: 'map', map: 'arena', wave: 10, name: '광장 수비대' },
    't-depot':    { kind: 'title', src: 'map', map: 'depot', wave: 10, name: '창고 지기' },
    't-mutant':   { kind: 'title', src: 'mut', n: 7, name: '변이 정복자' },
  },
  grades: { common: { name: '일반', w: 60 }, rare: { name: '희귀', w: 30 }, legend: { name: '전설', w: 10 } },
  // 드롭: 보스 웨이브 클리어(그 웨이브 시작을 본 사람), 웨이브 진행 중 보급품 획득(방 전원 각자), 상급·숙련 훈장 확정
  drop: { boss: 0.4, supply: 0.1, dupXp: 15, achGrade: { 상급: 'rare', 숙련: 'legend' } },
  // 무기 숙련도 (누적 처치) — 처리 속도가 달라 무기마다 문턱이 다르다. 보상은 칭호·외형만
  mastery: { rifle: [50, 250, 1000], shotgun: [30, 150, 600], sniper: [20, 100, 400], pistol: [20, 100, 400], rocket: [10, 50, 200] },
  tierXp: { 입문: 10, 초급: 20, 중급: 40, 상급: 80, 숙련: 150 },
};
