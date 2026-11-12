// 협동: 지원 수당, 내려찍기 원 표시, 상점
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const S = [];
  for (const name of ['Alice', 'Bob']) {
    const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'], defaultViewport: { width: 1280, height: 720 } });
    const page = await browser.newPage();
    page.on('pageerror', e => console.log(`[${name} pageerror]`, e.message));
    await page.goto('http://localhost:3000/?debug', { waitUntil: 'networkidle2' });
    await page.waitForFunction('window.__game');
    await page.evaluate((n) => { window.__game.G.settings.gfx = 'low'; document.getElementById('inName').value = n; document.getElementById('inRoom').value = 'c2'; }, name);
    await page.click('#btnMulti');
    await page.waitForFunction('window.__game.net.connected');
    S.push({ browser, page });
    await sleep(800);
  }
  const [A, B] = S.map(s => s.page);
  await A.evaluate(() => { window.__game.waves.timer = 9999; });
  await sleep(1000);
  const ids = { a: await A.evaluate(() => window.__game.net.id), b: await B.evaluate(() => window.__game.net.id), aHost: await A.evaluate(() => window.__game.net.isHost) };
  console.log('ids', JSON.stringify(ids));

  // ---- 1) 지원 수당 ----
  const cred = async () => [await A.evaluate(() => window.__game.G.credits), await B.evaluate(() => window.__game.G.credits)];
  console.log('크레딧 시작 [A, B]:', await cred());
  await A.evaluate(async (bid) => { const en = await import('/js/enemies.js'); const { net } = window.__game;
    const e1 = en.spawnEnemy('grunt', 30, 0, 30); e1.speed = 0; const e2 = en.spawnEnemy('tank', 32, 0, 30); e2.speed = 0;
    window.__e = [e1, e2]; }, ids.b);
  await sleep(500);
  await A.evaluate(() => { window.__e[0].takeDamage(9999, false, window.__game.net.id); });   // A가 병사 처치
  await sleep(500);
  console.log('A가 병사(점수 100) 처치 → [A, B]:', await cred(), ' 기대 [10, 3]');
  await A.evaluate((bid) => { window.__e[1].takeDamage(9999, false, bid); }, ids.b);          // B가 중장갑 처치
  await sleep(500);
  console.log('B가 중장갑(점수 300) 처치 → [A, B]:', await cred(), ' 기대 [10+8, 3+30]');

  // ---- 2) 내려찍기 원이 참가자 화면에 보이는가 ----
  await A.evaluate(async () => { const en = await import('/js/enemies.js'); const { player, step } = window.__game;
    player.p.set(-30, 0, 40);
    const b = en.spawnEnemy('boss', -27.5, 0, 40); b.speed = 0; b.rangedCd = 99; b.chargeCd = 99; b.summonCd = 99; window.__boss = b; });
  let seen = { slamFrames: 0, ringVisible: 0, samples: 0, hostTele: 0 };
  for (let i = 0; i < 40; i++) {
    await sleep(80);
    const r = await B.evaluate(() => { const b = window.__game.G.enemies.find(e => e.def.boss); return b ? { k: b.teleKind, t: b.tele, ring: b.slamRing.visible, disc: +b.slamDisc.scale.x.toFixed(2) } : null; });
    const h = await A.evaluate(() => window.__boss.tele > 0 && window.__boss.teleKind === 'slam');
    if (h) seen.hostTele++;
    if (r) { seen.samples++; if (r.k === 'slam' && r.t > 0) seen.slamFrames++; if (r.ring) seen.ringVisible++; }
  }
  console.log('내려찍기 (3.2초 관찰): 호스트 예고 횟수', seen.hostTele, '/ 참가자 화면: 보스 보임', seen.samples, '· 내려찍기 예고', seen.slamFrames, '· 원 표시', seen.ringVisible);
  await A.evaluate(() => { const { player } = window.__game; console.log; return player.lastSrc; }).then(v => console.log('호스트가 맞은 출처:', v));
  await A.evaluate(() => { window.__boss.takeDamage(999999, false, -1); window.__game.player.hp = 100; });
  await sleep(500);

  // ---- 2b) 포격 예고 원이 참가자 화면에 보이는가 (포격대장, 플레이어 폭격) ----
  await A.evaluate(async () => { const en = await import('/js/enemies.js'); const w = en.spawnEnemy('warlord', 20, 0, 30); w.speed = 0; w.mortarCd = 0.1; w.rangedCd = 99; w.summonCd = 99; window.__wl = w; });
  let maxCircles = 0;
  for (let i = 0; i < 30; i++) { await sleep(100); const n = await B.evaluate(() => window.__game.scene ? 0 : document.querySelectorAll('x').length); }
  const circ = await B.evaluate(async () => { const en = await import('/js/enemies.js'); return en.strikeCount ? en.strikeCount() : -1; });
  console.log('포격대장 포격 중 참가자 화면의 예고 원 수:', circ);
  await A.evaluate(() => { window.__wl.takeDamage(999999, false, -1); });
  await sleep(2500);
  await A.evaluate(async () => { const en = await import('/js/enemies.js'); en.callStrike(10, 0, 10); });
  await sleep(600);
  console.log('호스트의 폭격 요청 → 참가자 화면의 예고 원 수:', await B.evaluate(async () => (await import('/js/enemies.js')).strikeCount()));
  await sleep(2500);

  // ---- 3) 협동 상점 ----
  // 웨이브 1을 "클리어" 상태로 만든다
  await A.evaluate(() => { const { G, waves, net } = window.__game; waves.queue.length = 0; for (const e of [...G.enemies]) e.takeDamage(99999, false, net.id); });
  await sleep(1200);
  console.log('host debug:', await A.evaluate(() => { const { G, waves, net } = window.__game; return JSON.stringify({ en: G.enemies.map(e => e.type + ':' + e.hp + ':' + e.dead), q: waves.queue.length, inter: waves.inter, host: net.isHost, mode: G.mode, time: G.time.toFixed(1) }); }));
  const inter = () => Promise.all([A, B].map(p => p.evaluate(() => { const { G, waves, net } = window.__game;
    return { host: net.isHost, inter: waves.inter, timer: +waves.timer.toFixed(1), interEnd: +(G.interEnd - G.time).toFixed(1), interText: document.getElementById('inter').innerText.replace(/\s+/g, ' '), perk: document.getElementById('perks').classList.contains('show'), credits: G.credits }; })));
  console.log('웨이브 클리어 직후:', JSON.stringify(await inter()));
  // B(참가자)가 상점을 연다
  const opened = await B.evaluate(() => { window.__game.shop.showShop(); return window.__game.G.shopOpen; });
  await sleep(1500);
  console.log('B 상점 열림:', opened, '|', await B.evaluate(() => JSON.stringify({ time: document.getElementById('shoptime').textContent, perksDisplay: getComputedStyle(document.getElementById('perks')).display, cred: document.getElementById('shopcred').textContent })));
  await B.screenshot({ path: 'tools/coop-shop.png' });
  const bought = await B.evaluate(() => { window.__game.shop.addCredits(200); const b = document.querySelector('#shopbody button[data-act="up"][data-key="rifle"]'); b.click(); return { lv: window.__game.W.lv.rifle, credits: window.__game.G.credits }; });
  console.log('B 소총 강화 클릭:', JSON.stringify(bought));
  // A(호스트)도 상점을 연다: 협동에서는 타이머가 멈추지 않아야 한다
  const t1 = await A.evaluate(() => { window.__game.shop.showShop(); return window.__game.waves.timer; });
  await sleep(2000);
  const t2 = await A.evaluate(() => window.__game.waves.timer);
  console.log(`A(호스트) 상점 중 타이머: ${t1.toFixed(1)} → ${t2.toFixed(1)} (협동은 계속 줄어야 함)`);
  // 웨이브 시작 → 두 사람의 상점이 강제로 닫히고 특성이 무작위 지급되는가
  await A.evaluate(() => { window.__game.waves.timer = 1.0; });
  await sleep(2500);
  for (const [n, p] of [['A', A], ['B', B]]) console.log(n, '웨이브 시작 후:', await p.evaluate(() => { const { G } = window.__game; return JSON.stringify({ wave: G.wave, shop: G.shopOpen, mode: G.mode, shopVisible: document.getElementById('shop').classList.contains('show'), perks: G.perks, perkCards: document.getElementById('perks').classList.contains('show') }); }));
  for (const s of S) await s.browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
