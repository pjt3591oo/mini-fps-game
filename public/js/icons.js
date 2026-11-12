// 화면에 쓰는 그림 모음 (인라인 SVG). 글자로만 보여 주던 정보를 그림으로 바꾸기 위한 공용 모듈.
export const svg = (vb, inner, cls = '') => `<svg class="${cls}" viewBox="${vb}" aria-hidden="true">${inner}</svg>`;

const S = 'fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const p = (d, extra = S) => `<path d="${d}" ${extra}/>`;

// 무기 옆모습 실루엣 (120×48)
export const GUN = {
  rifle: '<path d="M3 17h13l5-4h31l2-4h22l2 4h18v-3h3v3h14v4H99v3H76l-3 3H61l-3 14h-10l2-14h-9l-4 9h-9l3-10h-9l-9 7H3z"/><rect x="60" y="6" width="3" height="4"/>',
  shotgun: '<path d="M3 20l17-6h30v-3h65v4H58v3h46v4H52l-3 3H38l-4 11h-9l3-11h-8l-10 7H3z"/><rect x="62" y="22" width="20" height="5" rx="1"/>',
  sniper: '<path d="M2 19h15l6-4h22v-3h72v3H61v3h-6l-2 3H42l-4 11h-8l3-11h-7l-9 6H2z"/><path d="M36 4h34v6H36zM41 10h4v4h-4zM60 10h4v4h-4z"/><path d="M92 18l5 14h-3l-6-14z"/>',
  pistol: '<path d="M28 9h60v4h5v8H66l-3 5h-9l3 20H40l-4-20h-8z"/><rect x="82" y="5" width="4" height="4"/>',
  rocket: '<path d="M4 16h8l4-3h78l6 3h14l4 4-4 4h-14l-6 3H16l-4-3H4z"/><path d="M40 27h8l2 14h-9zM58 9h10v4H58z"/>',
};
export const gun = (k, cls = 'gun') => svg('0 0 120 48', GUN[k] || GUN.rifle, cls);

// 48×48 선 아이콘
export const ICON = {
  // 아이템 / 보급
  medkit: p('M6 30l14-14 8 8-14 14zM22 14l4-4 12 12-4 4zM10 34l-5 5M30 6l12 12') + p('M15 27l6 6', 'stroke="currentColor" stroke-width="2"'),
  shield: p('M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z') + p('M24 12v24M15 22h18'),
  strike: '<circle cx="24" cy="26" r="13" ' + S + '/><circle cx="24" cy="26" r="4" fill="currentColor"/>' + p('M24 2v14M19 11l5 6 5-6M5 26h6M37 26h6M24 39v6'),
  ammo: p('M9 42V18c0-6 2-10 4-12 2 2 4 6 4 12v24zM21 42V18c0-6 2-10 4-12 2 2 4 6 4 12v24zM33 42V18c0-6 2-10 4-12 2 2 4 6 4 12v24z') + p('M9 34h8M21 34h8M33 34h8', 'stroke="currentColor" stroke-width="2"'),
  nade: '<ellipse cx="23" cy="29" rx="12" ry="14" ' + S + '/>' + p('M17 15v-5h12v5M29 10l10 4-3 9M11 29h24M23 15v28'),
  heal: p('M24 41S7 31 7 18a9 9 0 0 1 17-4 9 9 0 0 1 17 4c0 13-17 23-17 23z') + p('M24 17v12M18 23h12'),
  rocket: p('M6 42l8-2 22-22c4-4 6-10 6-12-2 0-8 2-12 6L8 34z') + p('M14 40l-6-6M26 14l8 8M10 24l-6 4M24 38l-4 6'),
  reroll: p('M40 20A17 17 0 0 0 9 16M8 28a17 17 0 0 0 31 4') + p('M9 6v10h10M39 42V32H29'),
  rare: '<path d="M24 5l5.5 12 13 1.8-9.5 9.2 2.4 13L24 34.8 12.6 41l2.4-13-9.5-9.2 13-1.8z" ' + S + '/>',
  // HUD
  heart: '<path d="M24 42S6 31 6 17.5A9.5 9.5 0 0 1 24 13a9.5 9.5 0 0 1 18 4.5C42 31 24 42 24 42z" fill="currentColor"/>',
  bolt: '<path d="M28 3L10 27h11l-3 18 20-26H26z" fill="currentColor"/>',
  coin: '<circle cx="24" cy="24" r="19" ' + S + '/>' + p('M31 17.5a9 9 0 1 0 0 13M24 9v6M24 33v6'),
  skull: p('M24 5c-10 0-17 7-17 16 0 6 3 10 7 13v7h20v-7c4-3 7-7 7-13 0-9-7-16-17-16z') + '<circle cx="17" cy="22" r="4" fill="currentColor"/><circle cx="31" cy="22" r="4" fill="currentColor"/>' + p('M20 41v-5M28 41v-5'),
  star: '<path d="M24 4l6 13 14 2-10 10 3 14-13-7-13 7 3-14L4 19l14-2z" fill="currentColor"/>',
  flag: p('M10 44V6M10 8h26l-6 9 6 9H10'),
  clock: '<circle cx="24" cy="24" r="18" ' + S + '/>' + p('M24 13v12l8 5'),
  target: '<circle cx="24" cy="24" r="16" ' + S + '/><circle cx="24" cy="24" r="6" ' + S + '/>' + p('M24 2v8M24 38v8M2 24h8M38 24h8'),
  head: '<circle cx="24" cy="16" r="10" ' + S + '/>' + p('M8 44c0-9 7-14 16-14s16 5 16 14') + p('M24 2v6M10 16H4M44 16h-6'),
  hurt: p('M24 4l5 14 14-4-9 12 10 10-15 0-5 10-5-10-15 0 10-10L5 14l14 4z'),
  cart: p('M4 8h7l5 22h22l4-15H14') + '<circle cx="19" cy="38" r="3.5" fill="currentColor"/><circle cx="35" cy="38" r="3.5" fill="currentColor"/>',
  next: p('M10 10l14 14-14 14M26 10l14 14-14 14'),
  info: '<circle cx="24" cy="24" r="19" ' + S + '/>' + p('M24 22v12') + '<circle cx="24" cy="15" r="2.5" fill="currentColor"/>',
  amp: p('M24 44V8M10 20L24 6l14 14') + p('M12 34l12-12 12 12'),
  // 특성
  '강화 탄환': p('M18 44V20c0-8 3-13 6-16 3 3 6 8 6 16v24zM18 36h12') + p('M38 18v-8M34 14h8'),
  '빠른 손': p('M40 20A17 17 0 0 0 9 16M8 28a17 17 0 0 0 31 4') + p('M9 6v10h10M39 42V32H29'),
  '경량 장비': p('M6 12l12 12L6 36M20 12l12 12-12 12M34 12l10 12-10 12'),
  '방탄복': p('M14 5l5 5h10l5-5 8 6-4 9v23H10V20l-4-9z') + p('M17 26h14M17 34h14'),
  '흡혈': p('M24 4C17 15 11 22 11 30a13 13 0 0 0 26 0c0-8-6-15-13-26z') + p('M24 24v12M18 30h12'),
  '속사': p('M6 14h20M6 24h28M6 34h20') + p('M34 12l10 12-10 12'),
  '탄띠': p('M5 14l38 10M5 26l38 10') + p('M12 12v18M22 15v18M32 18v18'),
  '폭발물 전문가': '<circle cx="22" cy="30" r="13" ' + S + '/>' + p('M22 17v-6h8M30 11l4-5M38 8l3-3M36 14h5'),
  '연쇄 폭발': p('M24 3l4 13 12-7-6 13 12 4-12 5 5 12-12-6-3 8-4-9-11 6 5-12-11-5 12-4-6-12 12 7z'),
  '2단 점프': p('M10 22L24 8l14 14M10 38l14-14 14 14'),
  '대시 달인': p('M28 3L10 27h11l-3 18 20-26H26z'),
  '급소 사격': '<circle cx="24" cy="24" r="15" ' + S + '/><circle cx="24" cy="24" r="3.5" fill="currentColor"/>' + p('M24 3v10M24 35v10M3 24h10M35 24h10'),
  '숨 고르기': p('M8 30c6 0 6-8 12-8s6 8 12 8 6-8 8-8') + p('M8 20c6 0 6-8 12-8s6 8 12 8 6-8 8-8'),
  '근접 사격': p('M24 8v8M24 32v8M8 24h8M32 24h8') + p('M24 24m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0'),
  '보급 전문가': p('M8 18l16-9 16 9v18l-16 9-16-9z') + p('M8 18l16 9 16-9M24 27v18'),
  '전리품': p('M24 6a18 18 0 1 0 0.1 0z') + p('M30 17c-1-3-4-4-6-4-4 0-6 2-6 5 0 6 12 4 12 10 0 3-3 5-6 5-3 0-5-1-6-4M24 9v4M24 35v4'),
  '점사 제어': p('M6 34h36M10 34V22M18 34V14M26 34V20M34 34V26'),
  '슬러그 장전': p('M16 6h16v30H16z') + p('M16 14h16M20 36v6h8v-6'),
  '호흡 정지': p('M24 4v10M24 34v10M4 24h10M34 24h10') + p('M24 24m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0'),
  '속사 권총': p('M8 16h26v8H20l-2 14h-8l2-14H8z') + p('M38 14l4-4M38 20h6M38 26l4 4'),
  '불굴': p('M24 4l16 6v12c0 11-7 18-16 22C15 40 8 33 8 22V10z') + p('M24 34s-8-5-8-11a4.5 4.5 0 0 1 8-2 4.5 4.5 0 0 1 8 2c0 6-8 11-8 11z'),
};
export const icon = (k, cls = 'ico') => svg('0 0 48 48', ICON[k] || ICON.info, cls);
