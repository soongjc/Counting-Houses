// The page as Claude's artifact viewer and as a phone run it.
// 1. With window.claude present, Export file goes through the viewer's downloads capability. Every outcome is played: saved, declined, busy,
//    an app without file saving, a refusal, an unknown code, no capability, and a viewer that answers late.
// 2. Outside the viewer the browser downloads the file.
// 3. On a touch screen, under the browser's own autoplay rule, sound starts on the first tap.
const path = require('path');
const { chromium } = require('playwright');
const CHROME = process.env.CHROME || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);   // the browser to drive: $CHROME, the system Chrome, or the one Playwright installs
const url = 'file://' + path.join(__dirname, '../dist/preview.html');
let bad = 0; const ok = (c, what, got) => { if (!c) bad++; console.log((c ? 'ok   ' : 'FAIL ') + what + (got !== undefined ? ' | ' + got : '')); };
(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--autoplay-policy=user-gesture-required'] });
  const WANT = {
    saved: [1, 'Save file exported.', 1], declined: [1, 'Export cancelled.', 1], rate_limited: [1, 'Export is busy. Try again in a moment.', 1],
    host_unavailable: [1, 'File export is unavailable in this app. Use Copy save code, or open the game in a browser.', 0], unavailable: [1, 'File export is unavailable here. Use Copy save code.', 0],
    weird_new_code: [1, 'File export is unavailable here. Use Copy save code.', 0], none: [0, '', 0], slow: [0, '', 1]
  };
  for (const mode of Object.keys(WANT)) {
    const p = await b.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(mode => {
      window.__saved = [];
      const ns = Object.freeze({ save: o => { window.__saved.push({ filename: o.filename, bytes: String(o.data).length, json: (() => { try { const j = JSON.parse(o.data); return !!j && typeof j === 'object'; } catch (e) { return false; } })() }); return mode === 'saved' || mode === 'slow' ? Promise.resolve({ status: 'saved' }) : Promise.reject({ code: mode, message: 'no' }); } });
      window.claude = Object.freeze({ use: name => new Promise(res => setTimeout(() => res(name === 'downloads' && mode !== 'none' ? ns : null), mode === 'slow' ? 2500 : 300)) });
    }, mode);
    await p.goto(url); await p.waitForTimeout(900);
    await p.evaluate(() => { CH.ui.begin({ name: 'Tin & Pepper Co' }); CH.ui.act.modal({ name: 'save' }); }); await p.waitForTimeout(300);
    const has = await p.locator('#modal [data-act=exportfile]').count(); let msg = '', after = has;
    if (mode === 'slow') { await p.waitForTimeout(2600); after = await p.locator('#modal [data-act=exportfile]').count(); }
    else if (has) { await p.click('#modal [data-act=exportfile]'); await p.waitForTimeout(400); msg = await p.evaluate(() => (document.querySelector('#modal .note') || {}).textContent || ''); after = await p.locator('#modal [data-act=exportfile]').count(); }
    const saved = await p.evaluate(() => window.__saved), w = WANT[mode], copy = await p.locator('#modal [data-act=copycode]').count();
    ok(has === w[0] && msg === w[1] && after === w[2] && copy === 1 && !errs.length && (mode === 'none' || mode === 'slow' || (saved.length === 1 && saved[0].json && /^counting-house-tin-pepper-co-1400\.json$/.test(saved[0].filename))),
      'viewer downloads: ' + mode, 'button ' + has + ' → ' + after + ' | "' + msg + '" | handed over ' + JSON.stringify(saved) + (errs.length ? ' | ERRORS ' + errs.join(' ; ') : ''));
    await p.close();
  }
  // outside the viewer the browser downloads the file
  { const p = await b.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true }); await p.goto(url); await p.waitForTimeout(900);
    await p.evaluate(() => { CH.ui.begin({ name: 'Tin & Pepper Co' }); CH.ui.act.modal({ name: 'save' }); }); await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('#modal [data-act=exportfile]')]);
    ok(!!dl && dl.suggestedFilename() === 'counting-house-tin-pepper-co-1400.json', 'outside the viewer the browser downloads the file', dl ? dl.suggestedFilename() : 'no download'); await p.close(); }
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  for (const first of ['help', 'newgame']) {
    const p = await ctx.newPage(); await p.goto(url); await p.waitForTimeout(1200);
    const before = await p.evaluate(() => CH.sound.state().ctx);
    await p.tap('#title [data-name=' + first + ']'); await p.waitForTimeout(700);
    const after = await p.evaluate(() => { const s = CH.sound.state(); return s.ctx + ', loops ' + s.loops.length + ', plays ' + CH.sound.play('coin'); });
    ok(before === 'none' && after === 'running, loops 4, plays true', 'touch: sound starts on the first tap (' + first + ')', before + ' → ' + after);
    await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} }); await p.close();
  }
  await b.close(); console.log(bad ? bad + ' FAILED' : 'all hosted checks pass'); process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
