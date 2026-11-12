// 절차적 텍스처: 외부 이미지 없이 캔버스로 재질감을 만든다
import { finishTexture } from './engine.js';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d'), size];
}
function speckle(g, s, n, dark = 0.1, light = 0.06) {
  for (let i = 0; i < n; i++) {
    const a = Math.random();
    g.fillStyle = a < 0.6 ? `rgba(0,0,0,${Math.random() * dark})` : `rgba(255,255,255,${Math.random() * light})`;
    const r = 1 + Math.random() * 3;
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
}

// 바닥: 어두운 아스팔트 + 이음매
export function asphalt(repeat) {
  const [c, g, s] = canvas();
  g.fillStyle = '#4a4c50'; g.fillRect(0, 0, s, s);
  speckle(g, s, 2600, 0.16, 0.09);
  // 얼룩
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * s, y = Math.random() * s, r = 20 + Math.random() * 50;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(0,0,0,.12)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 3; g.strokeRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; g.strokeRect(3, 3, s - 6, s - 6);
  return finishTexture(c, repeat);
}

// 콘크리트 패널: 줄눈 + 물때 + 볼트 구멍
export function concrete(base = '#a8a196', dark = false) {
  const [c, g, s] = canvas();
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  speckle(g, s, 1800, 0.1, 0.08);
  for (let i = 0; i < 7; i++) {
    const x = Math.random() * s, w = 6 + Math.random() * 18, h = 40 + Math.random() * 120;
    const lg = g.createLinearGradient(0, 0, 0, h);
    lg.addColorStop(0, `rgba(0,0,0,${dark ? 0.2 : 0.11})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(x, 0, w, h);
  }
  g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 4; g.strokeRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1.5; g.strokeRect(4, 4, s - 8, s - 8);
  g.fillStyle = 'rgba(0,0,0,.45)';
  for (const [x, y] of [[22, 22], [s - 22, 22], [22, s - 22], [s - 22, s - 22]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  return finishTexture(c);
}

// 강판: 테두리 입체감 + 리벳
export function steel() {
  const [c, g, s] = canvas();
  g.fillStyle = '#3a414b'; g.fillRect(0, 0, s, s);
  speckle(g, s, 900, 0.14, 0.05);
  g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, s - 4, s, 4); g.fillRect(s - 4, 0, 4, s);
  for (let i = 0; i < 5; i++) for (const y of [14, s - 14]) {
    const x = 20 + i * (s - 40) / 4;
    g.fillStyle = 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(x + 1, y + 1, 4, 0, 7); g.fill();
    g.fillStyle = '#5c6672'; g.beginPath(); g.arc(x, y, 3.2, 0, 7); g.fill();
  }
  // 긁힌 자국
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const x = Math.random() * s, y = Math.random() * s; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + Math.random() * 40, y + Math.random() * 10 - 5); g.stroke(); }
  return finishTexture(c);
}

// 컨테이너: 세로 골 + 위아래 프레임
export function corrugated(color) {
  const [c, g, s] = canvas();
  g.fillStyle = color; g.fillRect(0, 0, s, s);
  const n = 8, w = s / n;
  for (let i = 0; i < n; i++) {
    const lg = g.createLinearGradient(i * w, 0, (i + 1) * w, 0);
    lg.addColorStop(0, 'rgba(0,0,0,.34)'); lg.addColorStop(0.3, 'rgba(255,255,255,.12)');
    lg.addColorStop(0.6, 'rgba(255,255,255,.04)'); lg.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = lg; g.fillRect(i * w, 0, w, s);
  }
  speckle(g, s, 500, 0.18, 0.04);
  // 녹
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * s, y = s - 30 - Math.random() * 60, r = 8 + Math.random() * 20;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(110,55,20,.5)'); rg.addColorStop(1, 'rgba(110,55,20,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, s, 10); g.fillRect(0, s - 10, s, 10);
  g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 10, s, 2);
  return finishTexture(c);
}

// 나무 상자: 널빤지 + 테두리 + 대각선 보강재
export function crate() {
  const [c, g, s] = canvas();
  const planks = 5, ph = s / planks;
  for (let i = 0; i < planks; i++) {
    const v = 150 + Math.floor(Math.random() * 30);
    g.fillStyle = `rgb(${v + 20},${v - 28},${v - 82})`;
    g.fillRect(0, i * ph, s, ph);
    g.strokeStyle = 'rgba(60,35,10,.35)'; g.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const y = i * ph + Math.random() * ph; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(s * 0.3, y + 3, s * 0.7, y - 3, s, y + 1); g.stroke(); }
    g.fillStyle = 'rgba(40,22,6,.7)'; g.fillRect(0, i * ph, s, 2);
  }
  g.save();
  g.translate(s / 2, s / 2); g.rotate(-Math.PI / 4);
  g.fillStyle = '#8c6234'; g.fillRect(-s, -15, s * 2, 30);
  g.fillStyle = 'rgba(40,22,6,.55)'; g.fillRect(-s, -15, s * 2, 2); g.fillRect(-s, 13, s * 2, 2);
  g.restore();
  g.strokeStyle = '#6f4a22'; g.lineWidth = 34; g.strokeRect(0, 0, s, s);
  g.strokeStyle = 'rgba(30,16,4,.6)'; g.lineWidth = 2; g.strokeRect(17, 17, s - 34, s - 34); g.strokeRect(1, 1, s - 2, s - 2);
  g.fillStyle = '#3d3a36';
  for (const [x, y] of [[9, 9], [s - 9, 9], [9, s - 9], [s - 9, s - 9]]) { g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill(); }
  speckle(g, s, 500, 0.12, 0.05);
  return finishTexture(c);
}

// 경고 줄무늬 (난간)
export function hazard() {
  const [c, g, s] = canvas(128);
  g.fillStyle = '#e9b21d'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#1c1d20';
  for (let i = -s; i < s * 2; i += 44) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 22, 0); g.lineTo(i + 22 - s, s); g.lineTo(i - s, s); g.fill(); }
  speckle(g, s, 400, 0.2, 0.05);
  return finishTexture(c);
}

// 드럼통: 띠 + 경고 표지
export function barrel() {
  const [c, g, s] = canvas(256);
  g.fillStyle = '#c23a22'; g.fillRect(0, 0, s, s);
  const lg = g.createLinearGradient(0, 0, s, 0);
  lg.addColorStop(0, 'rgba(0,0,0,.25)'); lg.addColorStop(0.5, 'rgba(255,255,255,.08)'); lg.addColorStop(1, 'rgba(0,0,0,.25)');
  g.fillStyle = lg; g.fillRect(0, 0, s, s);
  g.fillStyle = '#2a2320';
  for (const y of [18, 84, 162, 228]) g.fillRect(0, y, s, 10);
  for (const x of [64, 192]) {
    g.save(); g.translate(x, 128); g.rotate(Math.PI / 4);
    g.fillStyle = '#f2c230'; g.fillRect(-22, -22, 44, 44);
    g.strokeStyle = '#1c1d20'; g.lineWidth = 4; g.strokeRect(-22, -22, 44, 44);
    g.restore();
    g.fillStyle = '#1c1d20'; g.beginPath(); g.moveTo(x, 110); g.lineTo(x + 12, 140); g.lineTo(x - 12, 140); g.fill();
  }
  speckle(g, s, 700, 0.2, 0.05);
  return finishTexture(c);
}

// 먼 건물: 불 켜진 창문 (발광 맵으로도 사용)
export function windows() {
  const [c, g, s] = canvas(128);
  g.fillStyle = '#000'; g.fillRect(0, 0, s, s);
  for (let y = 6; y < s - 8; y += 16) for (let x = 6; x < s - 8; x += 14) {
    if (Math.random() < 0.13) { g.fillStyle = Math.random() < 0.7 ? '#ffcf8a' : '#bfe2ff'; g.fillRect(x, y, 6, 8); }
  }
  return finishTexture(c);
}
