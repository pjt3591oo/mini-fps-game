// FPS Arena 서버: 정적 파일 제공 + WebSocket 릴레이 (방 단위, 호스트 선출)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.bin': 'application/octet-stream',
  '.m4a': 'audio/mp4',
  '.hdr': 'application/octet-stream',
  '.md': 'text/markdown; charset=utf-8',
};

// ---------- 순위표 (data/scores.json에 저장) ----------
const SCORE_FILE = path.join(__dirname, 'data', 'scores.json');
let scores = [];
try { scores = JSON.parse(fs.readFileSync(SCORE_FILE, 'utf8')); } catch {}
function addScore(s) {
  const entry = {
    name: String(s.name || 'Player').slice(0, 16),
    score: Math.max(0, Math.min(1e9, Math.floor(+s.score || 0))),
    wave: Math.max(0, Math.min(999, Math.floor(+s.wave || 0))),
    diff: ['easy', 'normal', 'hard'].includes(s.diff) ? s.diff : 'normal',
    coop: !!s.coop,
    at: Date.now(),
  };
  if (!entry.score) return;
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  scores = scores.slice(0, 50);
  fs.mkdir(path.dirname(SCORE_FILE), { recursive: true }, () => fs.writeFile(SCORE_FILE, JSON.stringify(scores), () => {}));
}
function handleApi(req, res) {
  const json = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  if (req.method === 'GET') return json(200, scores.slice(0, 10));
  if (req.method !== 'POST') return json(405, {});
  let body = '';
  req.on('data', (c) => { body += c; if (body.length > 2000) req.destroy(); });
  req.on('end', () => {
    try { addScore(JSON.parse(body)); json(200, { ok: true }); } catch { json(400, {}); }
  });
}

const server = http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (url === '/api/scores') return handleApi(req, res);
  if (url === '/api/runs' && req.method === 'POST') {
    // 판 기록 (기획 검증용). 한 줄에 한 판씩 data/runs.jsonl에 쌓는다.
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 4000) req.destroy(); });
    req.on('end', () => {
      try {
        const run = { at: new Date().toISOString(), ...JSON.parse(body) };
        fs.mkdir(path.join(__dirname, 'data'), { recursive: true }, () => fs.appendFile(path.join(__dirname, 'data', 'runs.jsonl'), JSON.stringify(run) + '\n', () => {}));
        res.writeHead(200); res.end('{}');
      } catch { res.writeHead(400); res.end('{}'); }
    });
    return;
  }
  if (url === '/') url = '/index.html';
  if (url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  const file = path.normalize(path.join(PUBLIC, url));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

// ---------- 방 관리 ----------
const rooms = new Map(); // name -> { clients: Map<id, {ws, name}>, hostId }
let nextId = 1;

function getRoom(name) {
  if (!rooms.has(name)) rooms.set(name, { clients: new Map(), hostId: null });
  return rooms.get(name);
}
function send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
function broadcast(room, msg, exceptId = null) {
  const s = JSON.stringify(msg);
  for (const [id, c] of room.clients) if (id !== exceptId && c.ws.readyState === 1) c.ws.send(s);
}

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let id = null, room = null, roomName = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (msg.t === 'join') {
      if (id !== null) return;
      id = nextId++;
      roomName = String(msg.room || 'default').slice(0, 32);
      room = getRoom(roomName);
      const name = String(msg.name || `Player${id}`).slice(0, 16);
      // 칭호는 물건 id만 받는다 (글자를 그대로 넘기지 않음). 받는 쪽이 아는 칭호 id일 때만 표시한다
      const title = typeof msg.title === 'string' && /^[a-z0-9-]{1,24}$/.test(msg.title) ? msg.title : null;
      room.clients.set(id, { ws, name, title });
      if (room.hostId === null) room.hostId = id;
      send(ws, {
        t: 'welcome', id, hostId: room.hostId, room: roomName,
        players: [...room.clients].filter(([pid]) => pid !== id).map(([pid, c]) => ({ id: pid, name: c.name, title: c.title })),
      });
      broadcast(room, { t: 'playerJoined', id, name, title }, id);
      console.log(`[${roomName}] ${name}(#${id}) 입장 — ${room.clients.size}명`);
      return;
    }
    if (id === null || !room) return;

    msg.from = id;
    if (msg.t === 'hit' || msg.t === 'hostOnly') {
      // 호스트에게만 전달 (적 피격 등 권위 있는 처리)
      const host = room.clients.get(room.hostId);
      if (host && host.ws !== ws) send(host.ws, msg);
      else if (host && host.ws === ws) send(ws, msg); // 자기 자신이 호스트면 그대로 돌려줌
      return;
    }
    if (msg.t === 'to' && typeof msg.to === 'number') {
      const c = room.clients.get(msg.to);
      if (c) send(c.ws, msg);
      return;
    }
    // 그 외는 방 전체(본인 제외)에 릴레이
    broadcast(room, msg, id);
  });

  ws.on('close', () => {
    if (id === null || !room) return;
    const c = room.clients.get(id);
    room.clients.delete(id);
    broadcast(room, { t: 'playerLeft', id });
    console.log(`[${roomName}] ${c && c.name}(#${id}) 퇴장 — ${room.clients.size}명`);
    if (room.clients.size === 0) { rooms.delete(roomName); return; }
    if (room.hostId === id) {
      room.hostId = room.clients.keys().next().value;
      broadcast(room, { t: 'host', id: room.hostId });
      console.log(`[${roomName}] 새 호스트: #${room.hostId}`);
    }
  });
});

server.listen(PORT, () => console.log(`FPS Arena 서버 실행 중: http://localhost:${PORT}`));
