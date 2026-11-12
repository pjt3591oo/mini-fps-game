// 마우스 잠금 실패 경로: 잠금 요청이 거부되거나(오류 이벤트) 무시되는(무반응) 상황을 만들어 복구되는지 본다
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'], defaultViewport: { width: 1280, height: 720 } });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/?expose', { waitUntil: 'networkidle2' });
  await page.waitForFunction('window.__game');
  await page.evaluate(() => { window.__game.G.settings.gfx = 'low'; });
  const st = () => page.evaluate(() => { const { G } = window.__game; return { locked: !!document.pointerLockElement, mode: G.mode, shop: G.shopOpen,
    overlay: !document.getElementById('overlay').classList.contains('hidden'), ovsub: document.getElementById('ovsub').innerText.slice(0, 44), btn: document.getElementById('btnResume').textContent }; });
  const log = async (label) => console.log(label.padEnd(40), JSON.stringify(await st()));
  await page.click('#btnSolo'); await sleep(700);
  await page.evaluate(() => { window.__game.waves.timer = 0.05; }); await sleep(1500);
  await page.evaluate(() => { const { G, waves } = window.__game; waves.queue.length = 0; for (const e of [...G.enemies]) e.takeDamage(99999, false, 0); });
  await sleep(600); await page.keyboard.press('Digit1'); await sleep(700); await page.keyboard.press('Digit1'); await sleep(300);

  for (const [name, stub] of [
    ['A. 잠금 거부 (오류 이벤트)', "document.body.requestPointerLock = () => document.dispatchEvent(new Event('pointerlockerror'))"],
    ['B. 잠금 무시 (무반응)', "document.body.requestPointerLock = () => {}"],
  ]) {
    console.log('--- ' + name);
    await page.keyboard.press('KeyB'); await sleep(400);
    await log('상점 열림');
    await page.evaluate((code) => { window.__orig = Element.prototype.requestPointerLock; (0, eval)(code); }, stub);
    await page.keyboard.press('KeyB'); await sleep(1000);
    await log('닫기 시도 (잠금 실패)');
    await page.evaluate(() => { delete document.body.requestPointerLock; });   // 원래 동작 복구
    await sleep(900);
    await page.click('#btnResume'); await sleep(700);
    await log('계속하기 클릭');
  }
  console.log('--- C. 일시정지에서 계속하기를 눌렀는데 잠금이 거부되는 경우');
  await page.evaluate(() => document.exitPointerLock()); await sleep(1000);
  await page.evaluate(() => { document.body.requestPointerLock = () => document.dispatchEvent(new Event('pointerlockerror')); });
  await page.click('#btnResume'); await sleep(500);
  await log('계속하기 (잠금 거부)');
  await page.evaluate(() => { delete document.body.requestPointerLock; });
  await page.click('#btnResume'); await sleep(700);
  await log('다시 계속하기');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
