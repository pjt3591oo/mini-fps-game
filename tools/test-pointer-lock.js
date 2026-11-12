// 실제 마우스 잠금 흐름 테스트 (테스트 모드 아님: ?expose 로 상태만 노출)
const puppeteer = require('puppeteer-core');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const headless = process.argv[2] === 'headed' ? false : 'new';
  const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio', '--window-size=1280,800'], defaultViewport: { width: 1280, height: 720 } });
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://localhost:3000/?expose', { waitUntil: 'networkidle2' });
  await page.waitForFunction('window.__game');
  await page.evaluate(() => { window.__game.G.settings.gfx = 'low'; window.__lockErr = 0; document.addEventListener('pointerlockerror', () => window.__lockErr++); });
  const st = () => page.evaluate(() => { const { G, waves } = window.__game; return { locked: !!document.pointerLockElement, mode: G.mode, shop: G.shopOpen, inter: waves.inter, wave: G.wave, credits: G.credits,
    overlay: !document.getElementById('overlay').classList.contains('hidden'), ovsub: document.getElementById('ovsub').innerText.slice(0, 40), lockErr: window.__lockErr, timer: +waves.timer.toFixed(1) }; });
  const log = async (label) => console.log(label.padEnd(44), JSON.stringify(await st()));

  await page.click('#btnSolo'); await sleep(700);
  await log('1. 솔로 시작 (클릭)');
  // 1웨이브를 강제로 끝내 웨이브 사이로 간다
  await page.evaluate(() => { const { G, waves } = window.__game; waves.timer = 0.05; });
  await sleep(1500);
  await page.evaluate(() => { const { G, waves, shop } = window.__game; waves.queue.length = 0; for (const e of [...G.enemies]) e.takeDamage(99999, false, 0); shop.addCredits(1000); });
  await sleep(600);
  await page.keyboard.press('Digit1'); await sleep(700); await page.keyboard.press('Digit1');   // 특성 선택 (입력 유예 뒤)
  await sleep(300);
  await log('2. 웨이브 사이');

  await page.keyboard.press('KeyB'); await sleep(500);
  await log('3. B로 상점 열기');
  const btn = await page.$('#shopbody button[data-act="item"][data-key="medkit"]');
  const box = await btn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await sleep(300);
  console.log('   실제 마우스 클릭으로 구급 주사 구매 → 보유', await page.evaluate(() => window.__game.G.inv.medkit));
  await page.keyboard.press('KeyB'); await sleep(600);
  await log('4. B로 닫기 (잠금 복귀?)');

  await page.keyboard.press('KeyB'); await sleep(500);
  await page.keyboard.press('Escape'); await sleep(600);
  await log('5. 다시 열고 Esc로 닫기');

  await page.keyboard.press('KeyB'); await sleep(500);
  await page.click('#shopclose'); await sleep(600);
  await log('6. 다시 열고 닫기 버튼 클릭');

  await page.keyboard.press('KeyB'); await sleep(200); await page.keyboard.press('KeyB'); await sleep(200); await page.keyboard.press('KeyB'); await sleep(200); await page.keyboard.press('KeyB'); await sleep(700);
  await log('7. B 빠르게 네 번 (열고 닫고 열고 닫고)');

  // 협동에서 웨이브가 시작돼 상점이 강제로 닫히는 경우: 사용자 입력 없이 잠금을 요청하게 된다
  await page.keyboard.press('KeyB'); await sleep(2500);    // 마지막 입력으로부터 시간이 지나게 둔다
  await page.evaluate(() => window.__game.shop.hideShop()); await sleep(800);
  await log('8. 입력 없이 강제 닫기 (2.5초 뒤)');
  if ((await st()).overlay) { await sleep(900); await page.click('#btnResume'); await sleep(700); await log('   → 계속하기 클릭'); }

  // 오래 열어 둔 뒤 강제 닫기
  await page.keyboard.press('KeyB'); await sleep(7000);
  await page.evaluate(() => window.__game.shop.hideShop()); await sleep(800);
  await log('9. 입력 없이 강제 닫기 (7초 뒤)');
  if ((await st()).overlay) { await sleep(900); await page.click('#btnResume'); await sleep(700); await log('   → 계속하기 클릭'); }

  // 전투 중 잠금이 풀리는 경우 (Esc와 같은 경로): 일시정지 → Enter로 복귀
  await page.evaluate(() => document.exitPointerLock()); await sleep(500);
  await log('10. 잠금 해제 → 일시정지');
  await sleep(900); await page.keyboard.press('Enter'); await sleep(700);
  await log('11. Enter로 계속하기');
  await page.evaluate(() => document.exitPointerLock()); await sleep(1000);
  await page.click('#btnQuit'); await sleep(300);
  console.log('12. 메인 메뉴 한 번 클릭 →', await page.evaluate(() => document.getElementById('btnQuit').textContent + ' / mode=' + window.__game.G.mode));
  await page.click('#btnQuit'); await sleep(400);
  await log('13. 한 번 더 클릭');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
