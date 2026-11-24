// Serve the published file the way an artifact host might: strict CSP, inside a sandboxed frame with an opaque origin.
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const CHROME = process.env.CHROME || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);   // the browser to drive: $CHROME, the system Chrome, or the one Playwright installs
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'));
const csp = "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src data: blob:; connect-src 'none'";
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/frame')) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp }); res.end(html); }
  else { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><body style="margin:0"><iframe sandbox="allow-scripts" src="/frame.html" style="border:0;width:1280px;height:800px"></iframe>'); }
}).listen(0, async () => {
  const port = srv.address().port;
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text()); });
  await p.goto('http://localhost:' + port + '/'); await p.waitForTimeout(1500);
  const f = p.frames().find(fr => fr.url().includes('/frame'));
  const info = await f.evaluate(() => { let ls = 'ok'; try { localStorage.getItem('x'); } catch (e) { ls = 'throws ' + e.name; } const S = CH.ui.state(); return { localStorage: ls, screen: CH.ui.ui.screen, title: !!document.querySelector('#title .tmenu'), year: CH.year(S), sites: S.st.length, canvas: document.getElementById('map').width, canStore: CH.ui.ui.canStore }; });
  await f.click('#title [data-name=newgame]'); await f.click('#modal [data-act=startnew]'); await p.waitForTimeout(400);     // through the title screen: New game, Start game, then the first game's How to play
  await f.click('#modal .mfoot [data-act=close]'); await p.waitForTimeout(400);
  await f.click('#build [data-act=tool][data-k=market][data-t="1"]');
  const pos = await f.evaluate(() => { const u = CH.ui, q = CH.draw.toScreen(u.st, u.ui.cam, 23, 27), r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + q[0], y: r.top + q[1] }; });
  await p.mouse.move(pos.x, pos.y); await p.mouse.click(pos.x, pos.y); await p.waitForTimeout(400);
  await f.click('#roster [data-act=modal][data-name=hire]'); await f.click('#modal .cand >> nth=0 >> [data-act=hire]'); await p.waitForTimeout(2500);
  const later = await f.evaluate(() => { const S = CH.ui.state(); return { tick: S.tick, markets: S.mk.length, merchants: S.ms.length, icons: [...document.querySelectorAll('canvas[data-ico]')].length }; });
  await f.click('#menu [data-name=menu]'); await f.click('#modal [data-name=help]'); await p.waitForTimeout(300);
  const toast = await f.evaluate(() => document.querySelector('#modal .body').textContent.slice(-130));
  for (let i = 0; i < 40; i++) { const s = await f.evaluate(() => CH.sound.state()); if (s.of && s.made === s.of) break; await p.waitForTimeout(250); }
  const sound = await f.evaluate(() => { const s = CH.sound.state(); return { ctx: s.ctx, made: s.made + '/' + s.of, loops: s.loops.length, plays: CH.sound.play('coin') }; });
  await p.screenshot({ path: path.join(__dirname, '../shots/csp.png') });
  console.log(JSON.stringify(info), JSON.stringify(later), '| help ends:', toast);
  console.log('sound in the sandboxed frame:', JSON.stringify(sound));
  console.log(errs.length ? errs.join('\n') : 'no script errors under CSP in a sandboxed frame');
  await b.close(); srv.close();
});
