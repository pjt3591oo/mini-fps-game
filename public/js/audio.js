// 효과음: 녹음 샘플(CC0, public/assets/sounds)을 우선 쓰고, 없거나 아직 못 받았으면 WebAudio 합성음으로 대신한다
let ac = null, noiseBuf = null, master = null, verb = null, volume = 0.6;

// 샘플 이름 → 변형 개수 (1이면 name.m4a, 2 이상이면 name_0.m4a ...)
const SAMPLES = {
  shot_rifle: 1, shot_shotgun: 1, shot_sniper: 1, shot_pistol: 1, shot_far: 1,
  reload_rifle: 1, reload_pistol: 1, pump: 1, shell_in: 1,
  step: 5, impact: 5, impact_metal: 3, hit_body: 3,
  explosion: 3, boom_low: 1, enemy_shot: 3, rocket: 1, shield: 1,
};
const raw = {}, buffers = {};
export function preloadSounds(base) {
  for (const [name, n] of Object.entries(SAMPLES)) {
    const files = n === 1 ? [name] : Array.from({ length: n }, (_, i) => `${name}_${i}`);
    raw[name] = Promise.all(files.map(f => fetch(`${base}${f}.m4a`).then(r => { if (!r.ok) throw new Error(f); return r.arrayBuffer(); })))
      .catch(e => { console.warn('효과음 로드 실패:', e.message); return null; });
  }
  if (ac) decodeAll();
}
function decodeAll() {
  for (const [name, p] of Object.entries(raw)) {
    if (buffers[name]) continue;
    buffers[name] = [];
    p.then(list => list && Promise.all(list.map(b => ac.decodeAudioData(b.slice(0)))))
      .then(bufs => { if (bufs) buffers[name] = bufs; })
      .catch(e => console.warn('효과음 디코드 실패:', name, e));
  }
}

// 디버그·테스트용: 디코드된 샘플 수
export function soundStatus() { return Object.fromEntries(Object.entries(buffers).map(([k, v]) => [k, v.length])); }

// 잔향: 짧은 노이즈 감쇠로 만든 임펄스 응답 (야외 벽에 반사되는 정도)
function makeReverb() {
  const len = ac.sampleRate * 1.4, ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2) * (i < 600 ? i / 600 : 1);
  }
  const conv = ac.createConvolver(); conv.buffer = ir;
  const g = ac.createGain(); g.gain.value = 0.5;
  conv.connect(g).connect(master);
  return conv;
}

// 샘플 재생. 성공하면 true (없으면 호출한 쪽이 합성음으로 대신)
// o.rate: 재생 속도, o.lp: 저역 통과 주파수(멀리서 들리는 소리), o.rev: 잔향 비율, o.delay: 지연(초)
function sample(name, vol = 1, o = {}) {
  const list = ac && buffers[name];
  if (!list || !list.length) return false;
  const t = ac.currentTime + (o.delay || 0);
  const src = ac.createBufferSource();
  src.buffer = list[Math.floor(Math.random() * list.length)];
  src.playbackRate.value = (o.rate || 1) * (1 + (Math.random() - 0.5) * (o.vary ?? 0.08));
  const g = ac.createGain(); g.gain.value = vol;
  let node = src;
  if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
  node.connect(g).connect(master);
  if (o.rev && verb) { const s = ac.createGain(); s.gain.value = o.rev; g.connect(s).connect(verb); }
  src.start(t);
  return true;
}
// 거리 배율(0~1)을 먹먹함으로: 멀수록 고음이 깎인다
const farLp = v => 700 + Math.pow(Math.min(1, v), 2) * 17000;

export function setVolume(v) { volume = v; if (master) master.gain.value = v; }

export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new AudioContext();
  master = ac.createGain();
  master.gain.value = volume;
  master.connect(ac.destination);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  verb = makeReverb();
  decodeAll();
}

function noise(dur, vol, f0, f1, type = 'lowpass') {
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noiseBuf;
  const f = ac.createBiquadFilter(); f.type = type;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
}

export function tone(freq, dur, vol, type = 'sine', endFreq = freq, delay = 0) {
  if (!ac) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(freq, t); o.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 20), t + dur);
  const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

// vol: 거리 감쇠용 배율 (다른 플레이어/적의 소리)
export const sfx = {
  shot(weapon, vol = 1) {
    const far = vol < 1;
    if (sample(far && weapon === 'rifle' ? 'shot_far' : 'shot_' + weapon, (far ? 0.9 : 0.75) * vol, { lp: far ? farLp(vol) : 0, rev: far ? 0.5 : 0.22, vary: 0.06 })) {
      // 손에 전해지는 저음 (내 총만)
      if (!far) tone(weapon === 'pistol' ? 120 : 80, 0.12, weapon === 'shotgun' || weapon === 'sniper' ? 0.35 : 0.18, 'sine', 40);
      if (weapon === 'shotgun' && !far) sample('pump', 0.5, { delay: 0.32, vary: 0.04 });
      return;
    }
    if (weapon === 'shotgun') { noise(0.35, 0.6 * vol, 2500, 120); tone(90, 0.25, 0.4 * vol, 'sine', 40); }
    else if (weapon === 'sniper') { noise(0.5, 0.6 * vol, 6000, 200); tone(140, 0.4, 0.45 * vol, 'sine', 35); }
    else if (weapon === 'pistol') { noise(0.12, 0.3 * vol, 5000, 500); tone(220, 0.08, 0.15 * vol, 'square', 90); }
    else { noise(0.15, 0.35 * vol, 4000, 250); tone(160, 0.07, 0.12 * vol, 'square', 70); }
  },
  empty() { tone(1200, 0.03, 0.12, 'square'); },
  // 재장전 시간(dur)에 맞춰 녹음을 늘이거나 줄인다
  reloadStart(weapon, dur = 1.5) {
    if (weapon === 'shotgun' ? sample('shell_in', 0.7) :
        weapon === 'rocket' ? sample('impact_metal', 0.5, { rate: 0.7 }) :
        sample(weapon === 'pistol' ? 'reload_pistol' : 'reload_rifle', 0.7, { rate: Math.min(1.4, Math.max(0.8, 1.4 / dur)), vary: 0.02 })) return;
    tone(500, 0.06, 0.14, 'square', 350);
  },
  reloadEnd(weapon) {
    if (weapon === 'shotgun' && sample('pump', 0.6)) return;
    if (weapon !== 'shotgun' && sample('impact_metal', 0.25, { rate: 1.6 })) return;
    tone(800, 0.05, 0.14, 'square', 1200);
  },
  switchWeapon() { noise(0.08, 0.12, 3000, 800, 'bandpass'); },
  hit(head) { tone(head ? 1500 : 950, 0.06, 0.2, 'triangle'); sample('hit_body', head ? 0.35 : 0.22, { rate: head ? 1.3 : 1 }); },
  // 총알이 벽·바닥에 맞는 소리
  impact(metal, vol = 1) { sample(metal ? 'impact_metal' : 'impact', 0.22 * vol, { rate: 1.2, lp: farLp(vol), vary: 0.2 }); },
  // 발소리 (달리면 크고, 앉으면 작게)
  step(vol = 1) { sample('step', 0.28 * vol, { vary: 0.14 }); },
  shield() { if (!sample('shield', 0.5)) tone(600, 0.3, 0.15, 'sine', 900); },
  kill() { tone(320, 0.25, 0.22, 'sawtooth', 80); tone(1800, 0.1, 0.12, 'triangle', 2400); },
  hurt() { tone(140, 0.2, 0.4, 'square', 60); },
  pickup() { tone(660, 0.08, 0.2, 'sine'); tone(990, 0.12, 0.2, 'sine', 990, 0.07); },
  enemyShot(vol = 1) { if (!sample('enemy_shot', 0.35 * vol, { lp: farLp(vol), rev: 0.3 })) tone(700, 0.18, 0.15 * vol, 'sawtooth', 200); },
  explosion(vol = 1) {
    if (sample('explosion', 0.95 * vol, { lp: farLp(vol), rev: 0.6, rate: 0.85 })) { sample('boom_low', 0.9 * vol, { rev: 0.3 }); return; }
    noise(0.9, 0.9 * vol, 1800, 40); tone(70, 0.6, 0.6 * vol, 'sine', 25);
  },
  bossRoar() { tone(90, 1.2, 0.5, 'sawtooth', 45); noise(1.0, 0.3, 600, 80); },
  wave() { tone(440, 0.15, 0.2, 'triangle'); tone(660, 0.25, 0.2, 'triangle', 660, 0.15); },
  waveClear() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 0.18, 'triangle', f, i * 0.09)); },
  perk() { tone(880, 0.1, 0.2, 'sine'); tone(1320, 0.2, 0.2, 'sine', 1320, 0.08); },
  throwG() { noise(0.15, 0.15, 800, 2500, 'bandpass'); },
  rocket() {
    if (sample('rocket', 0.8, { rev: 0.3 })) { tone(80, 0.25, 0.35, 'sine', 40); return; }
    noise(0.5, 0.5, 900, 3000, 'bandpass'); tone(110, 0.3, 0.3, 'sawtooth', 50);
  },
  supply() { [660, 880, 1320].forEach((f, i) => tone(f, 0.25, 0.18, 'sine', f, i * 0.12)); },
  ping() { tone(1400, 0.08, 0.16, 'sine'); tone(1900, 0.12, 0.14, 'sine', 1900, 0.08); },
  dash() { noise(0.22, 0.25, 400, 3500, 'bandpass'); },
  hint() { tone(1200, 0.06, 0.08, 'sine'); },
  jump() { noise(0.08, 0.06, 500, 1200, 'bandpass'); },
  combo(n) { tone(500 + Math.min(n, 12) * 60, 0.08, 0.12, 'triangle'); },
  die() { tone(300, 0.9, 0.4, 'sawtooth', 40); },
};
