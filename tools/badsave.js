const { chromium } = require('playwright'); const path = require('path');
const CHROME = process.env.CHROME || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);   // the browser to drive: $CHROME, the system Chrome, or the one Playwright installs
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const url = 'file://' + path.join(__dirname, '../dist/preview.html');
  const cases = [['garbage', '{not json'], ['wrong version', JSON.stringify({ v: 2, world: 'monsoon' })],
    ['broken state', JSON.stringify({ v: 3, tick: 5, mk: [{ id: 1 }], ms: [{}], st: new Array(72).fill({}), bl: [], hs: [], rt: [], news: [], led: {}, cnt: {} })],
    ['storage blocked', null]];
  for (const [name, val] of cases) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    if (val === null) await p.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } }); });
    else await p.addInitScript(v => { try { localStorage.setItem('countinghouse.save.v3', v); } catch (e) {} }, val);
    await p.goto(url); await p.waitForTimeout(1200);
    const st = await p.evaluate(() => { const S = CH.ui.state(); return { year: CH.year(S), tick: S.tick, markets: S.mk.length, screen: CH.ui.ui.screen, menu: [].map.call(document.querySelectorAll('#title .tbtn b'), b => b.textContent).join('|'), canStore: CH.ui.ui.canStore, toast: document.getElementById('toast').hidden ? '' : document.getElementById('toast').textContent }; });
    console.log(name.padEnd(16), JSON.stringify(st), errs.length ? 'PAGE ERRORS: ' + errs.join(' | ') : '');
    await ctx.close();
  }
  await b.close();
})();
