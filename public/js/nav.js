// 격자 길찾기: 높이맵 + 플레이어로부터의 거리장(BFS).
// 맵에 겹쳐진 층(오버행)이 없다는 전제로, 칸마다 "가장 높은 윗면 높이" 하나만 저장한다.
import { colliders, world } from './world.js';
import { PLAYER } from './config.js';

const CELL = 1, MARGIN = 0.3, UNREACH = 65535;
let N = 0, origin = 0, hgt = null, queue = null;
const fields = new Map(); // 대상 id -> { dist, t }

function build() {
  const size = Math.ceil(world.size) + 2;
  origin = -size;
  const n = size * 2;
  if (n !== N) { N = n; hgt = new Float32Array(N * N); queue = new Int32Array(N * N); fields.clear(); }
  hgt.fill(0);
  for (const b of colliders) {
    const x0 = Math.max(0, Math.floor((b.min.x - MARGIN - origin) / CELL)), x1 = Math.min(N - 1, Math.floor((b.max.x + MARGIN - origin) / CELL));
    const z0 = Math.max(0, Math.floor((b.min.z - MARGIN - origin) / CELL)), z1 = Math.min(N - 1, Math.floor((b.max.z + MARGIN - origin) / CELL));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const i = z * N + x;
      if (b.max.y > hgt[i]) hgt[i] = b.max.y;
    }
  }
  world.navDirty = false;
  for (const f of fields.values()) f.t = -1;
}

const cellOf = (v) => Math.min(N - 1, Math.max(0, Math.floor((v - origin) / CELL)));
const STEP = PLAYER.STEP + 0.05;

function compute(f, px, py, pz) {
  const dist = f.dist;
  dist.fill(UNREACH);
  let head = 0, tail = 0;
  const cx = cellOf(px), cz = cellOf(pz);
  // 시작점: 플레이어 주변에서 플레이어와 같은 높이인 칸. 없으면(상자 위 등) 주변 전체.
  for (let pass = 0; pass < 2 && tail === 0; pass++) {
    const R = pass === 0 ? 1 : 3;
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= N || z >= N) continue;
      const i = z * N + x;
      if (pass === 0 ? Math.abs(hgt[i] - py) > 0.6 : hgt[i] > py + 0.6) continue;
      dist[i] = Math.abs(dx) + Math.abs(dz);
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const c = queue[head++], d = dist[c] + 1, hc = hgt[c];
    const x = c % N, z = (c - x) / N;
    // 이웃 n에서 c로 이동할 수 있어야 한다: 오르막은 STEP 이하, 내리막은 4m 이하
    if (x > 0) { const n = c - 1; if (dist[n] === UNREACH && hc - hgt[n] <= STEP && hgt[n] - hc <= 4) { dist[n] = d; queue[tail++] = n; } }
    if (x < N - 1) { const n = c + 1; if (dist[n] === UNREACH && hc - hgt[n] <= STEP && hgt[n] - hc <= 4) { dist[n] = d; queue[tail++] = n; } }
    if (z > 0) { const n = c - N; if (dist[n] === UNREACH && hc - hgt[n] <= STEP && hgt[n] - hc <= 4) { dist[n] = d; queue[tail++] = n; } }
    if (z < N - 1) { const n = c + N; if (dist[n] === UNREACH && hc - hgt[n] <= STEP && hgt[n] - hc <= 4) { dist[n] = d; queue[tail++] = n; } }
  }
}

// 대상(id, 위치)을 향해 (x, y, z)에서 움직일 방향을 out에 기록. 경로가 없으면 false.
export function navDir(id, target, x, y, z, time, out) {
  if (world.navDirty || !hgt) build();
  let f = fields.get(id);
  if (!f) { f = { dist: new Uint16Array(N * N), t: -1 }; fields.set(id, f); }
  if (f.t < 0 || time - f.t > 0.35) { compute(f, target.x, target.y, target.z); f.t = time; }

  const cx = cellOf(x), cz = cellOf(z), dist = f.dist;
  const ok = (ix, iz) => ix >= 0 && iz >= 0 && ix < N && iz < N && hgt[iz * N + ix] - y <= STEP;
  let best = UNREACH, bx = 0, bz = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const ix = cx + dx, iz = cz + dz;
    if (!ok(ix, iz)) continue;
    if (dx && dz && !(ok(cx + dx, cz) && ok(cx, cz + dz))) continue; // 모서리 가로지르기 금지
    const d = dist[iz * N + ix];
    if (d === UNREACH) continue;
    const cost = d + (dx && dz ? 0.41 : 0) + (dx || dz ? 0 : 0.5);
    if (cost < best) { best = cost; bx = dx; bz = dz; }
  }
  if (best === UNREACH || (!bx && !bz)) return false;
  const tx = origin + (cx + bx + 0.5) * CELL - x, tz = origin + (cz + bz + 0.5) * CELL - z;
  const l = Math.hypot(tx, tz);
  if (l < 0.01) return false;
  out.x = tx / l; out.z = tz / l;
  return true;
}

export function clearNav() { fields.clear(); world.navDirty = true; }
