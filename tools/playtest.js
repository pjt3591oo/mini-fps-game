// 헤드리스 플레이테스트 도구 (서버가 켜져 있어야 함: npm start)
//   node tools/playtest.js run <시나리오.js> [스크린샷.png]   시나리오 본문을 게임 페이지에서 실행 (await, shot(path) 사용 가능)
//   node tools/playtest.js balance [초]                        숙련도별 봇으로 도달 웨이브 측정
//   node tools/playtest.js coop [초]                           2인 협동 동기화 확인
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.env.GAME_URL || 'http://localhost:3000/?debug';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function open(name = '') {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,720'],
    defaultViewport: { width: 1280, height: 720 },
  });
  const page = await browser.newPage();
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) console.log(`[${name}console.error]`, m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log(`[${name}pageerror]`, e.message, (e.stack || '').split('\n').slice(1, 4).join(' | ')));
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await page.waitForFunction('window.__game', { timeout: 20000 });
  await page.exposeFunction('shot', (p) => page.screenshot({ path: p }));
  return { browser, page };
}

const BALANCE = `
const { G, player } = window.__game;
window.__bot = true;
const res = [];
for (const skill of [0.3, 0.5, 0.7]) {
  window.__botSkill = skill;
  document.getElementById('btnSolo').click();
  await new Promise(r => setTimeout(r, 300));
  let hpSum = 0, n = 0;
  for (let i = 0; i < LIMIT && G.mode === 'playing'; i++) { window.__step(300, 1 / 60); hpSum += player.hp; n++; }
  res.push('skill=' + skill + ': ' + G.mode + ' wave=' + G.wave + ' time=' + G.time.toFixed(0) + 's kills=' + G.kills + ' score=' + G.score + ' avgHp=' + (hpSum / n).toFixed(0) + ' cause=' + (G.mode === 'over' ? player.lastSrc : '-') + ' perks=' + JSON.stringify(G.perks));
  if (G.mode !== 'over') window.__game.toMenu();
  await new Promise(r => setTimeout(r, 50));
}
return res;`;

(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'run' || cmd === 'balance') {
    const { browser, page } = await open();
    let body = cmd === 'run' ? fs.readFileSync(a, 'utf8') : BALANCE.replace('LIMIT', Math.ceil((+a || 900) / 5));
    if (cmd === 'run' && !body.includes('NO_START')) { await page.click('#btnSolo'); await sleep(300); }
    const out = await page.evaluate(new Function(`return (async()=>{${body}})()`));
    console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1));
    if (cmd === 'run' && b) await page.screenshot({ path: b });
    await browser.close();
  } else if (cmd === 'coop') {
    const sessions = [];
    for (const name of ['Alice', 'Bob']) {
      const s = await open(name + ' ');
      await s.page.evaluate((n) => { document.getElementById('inName').value = n; document.getElementById('inRoom').value = 'test'; }, name);
      await s.page.click('#btnMulti');
      await s.page.waitForFunction('window.__game.net.connected', { timeout: 8000 });
      await s.page.evaluate(() => { window.__bot = true; window.__botSkill = 0.6; });
      sessions.push(s);
    }
    const stat = (page) => page.evaluate(() => {
      const { G, player, net } = window.__game;
      const types = {}; for (const e of G.enemies) types[e.type] = (types[e.type] || 0) + 1;
      return JSON.stringify({ id: net.id, host: net.isHost, mode: G.mode, t: +G.time.toFixed(0), wave: G.wave, hp: Math.ceil(player.hp), dead: player.dead, score: G.score, en: types,
        others: [...net.players.values()].map(p => `${p.name}:${p.hp}${p.dead ? 'D' : ''}`), pk: G.pickups.length });
    });
    const secs = +a || 40;
    for (let t = 0; t < secs; t += 8) { await sleep(8000); for (const s of sessions) console.log(await stat(s.page)); }
    await sessions[0].browser.close();
    await sleep(5000);
    console.log('호스트 퇴장 후:', await stat(sessions[1].page));
    await sessions[1].browser.close();
  } else console.log('사용법: node tools/playtest.js run <파일> [png] | balance [초] | coop [초]');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
