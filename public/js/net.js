// WebSocket 클라이언트 + 원격 플레이어 표시
import * as THREE from 'three';
import { scene } from './engine.js';

const handlers = new Map();
export const net = {
  ws: null,
  connected: false,
  id: 0,             // 오프라인이면 0
  isHost: true,      // 오프라인이면 항상 호스트 (적 시뮬레이션 담당)
  name: 'Player',
  room: '',
  players: new Map(), // id -> RemotePlayer

  on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  },
  emit(type, msg) { for (const fn of handlers.get(type) || []) fn(msg); },
  send(t, data = {}) {
    // 메시지 종류(t)가 항상 이기도록 뒤에 둔다. data에 t가 있어도 종류를 덮어쓰지 못한다.
    if (this.connected) this.ws.send(JSON.stringify({ ...data, t }));
  },
  sendTo(to, k, data = {}) { this.send('to', { to, k, ...data }); },

  connect(name, room) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${location.host}`);
      let done = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: 'join', name, room }));
      ws.onerror = () => { if (!done) { done = true; reject(new Error('서버에 연결할 수 없습니다')); } };
      ws.onclose = () => {
        const was = this.connected;
        this.connected = false; this.isHost = true; this.id = 0; this.ws = null;
        for (const p of this.players.values()) p.dispose();
        this.players.clear();
        if (was) this.emit('disconnected', {});
        if (!done) { done = true; reject(new Error('연결이 끊어졌습니다')); }
      };
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'welcome') {
          this.ws = ws; this.connected = true; this.id = msg.id; this.name = name; this.room = msg.room;
          this.isHost = msg.hostId === msg.id;
          for (const p of msg.players) this.players.set(p.id, new RemotePlayer(p.id, p.name));
          done = true; resolve(msg);
        } else if (msg.t === 'playerJoined') {
          this.players.set(msg.id, new RemotePlayer(msg.id, msg.name));
        } else if (msg.t === 'playerLeft') {
          const p = this.players.get(msg.id);
          if (p) { p.dispose(); this.players.delete(msg.id); }
        } else if (msg.t === 'host') {
          this.isHost = msg.id === this.id;
        } else if (msg.t === 'ps') {
          const p = this.players.get(msg.from);
          if (p) p.setState(msg);
          return;
        }
        this.emit(msg.t === 'to' ? 'to:' + msg.k : msg.t, msg);
      };
    });
  },
  disconnect() { if (this.ws) this.ws.close(); },
};

// ---------- 원격 플레이어 아바타 ----------
const bodyGeo = new THREE.CapsuleGeometry(0.34, 0.75, 4, 10);
const headGeo = new THREE.SphereGeometry(0.24, 14, 10);
const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.6);
const COLORS = [0x3d8bff, 0x35c46a, 0xffb020, 0xd656e0, 0x30c8c8];

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, "Malgun Gothic", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(text, 128, 32);
  g.fillStyle = '#fff'; g.fillText(text, 128, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(1.6, 0.4, 1);
  return s;
}

class RemotePlayer {
  constructor(id, name) {
    this.id = id; this.name = name;
    this.p = new THREE.Vector3(0, -50, 0);       // 표시 위치 (보간됨)
    this.target = new THREE.Vector3(0, -50, 0);
    this.ry = 0; this.rx = 0; this.hp = 100; this.dead = false; this.weapon = 'rifle';
    this.fresh = true; this.score = 0; this.kills = 0;

    const color = COLORS[id % COLORS.length];
    this.group = new THREE.Group();
    this.mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(bodyGeo, this.mat); body.position.y = 0.72;
    this.head = new THREE.Mesh(headGeo, new THREE.MeshStandardMaterial({ color: 0xe8c9a0, roughness: 0.7 }));
    this.head.position.y = 1.55;
    this.gun = new THREE.Mesh(gunGeo, new THREE.MeshStandardMaterial({ color: 0x25282d, metalness: 0.6, roughness: 0.5 }));
    this.gun.position.set(0.28, 1.25, -0.35);
    body.castShadow = this.head.castShadow = true;
    this.label = nameSprite(name);
    this.label.position.y = 2.15;
    this.group.add(body, this.head, this.gun, this.label);
    this.group.visible = false;
    scene.add(this.group);
  }
  setState(s) {
    this.target.set(s.x, s.y, s.z);
    this.ry = s.ry; this.rx = s.rx; this.hp = s.hp; this.dead = !!s.dead; this.weapon = s.w;
    this.score = s.sc || 0; this.kills = s.k || 0;
    if (this.fresh) { this.p.copy(this.target); this.fresh = false; }
    this.group.visible = true;
  }
  update(dt) {
    this.p.lerp(this.target, 1 - Math.exp(-14 * dt));
    this.group.position.copy(this.p);
    // 쓰러지면 누운 자세로 표시 (동료가 부활시킬 수 있다)
    const lie = this.dead ? Math.PI / 2 : 0;
    this.group.rotation.z += (lie - this.group.rotation.z) * (1 - Math.exp(-10 * dt));
    if (this.dead) this.group.position.y += 0.3;
    this.group.rotation.y = this.ry;
    this.gun.rotation.x = this.rx;
  }
  dispose() { scene.remove(this.group); this.mat.dispose(); }
}

export function updateRemotePlayers(dt) {
  for (const p of net.players.values()) p.update(dt);
}
