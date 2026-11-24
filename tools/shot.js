// Drive the built page in headless Chrome: collect console errors and take screenshots.
const { chromium } = require('playwright');
const CHROME = process.env.CHROME || (require('fs').existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);   // the browser to drive: $CHROME, the system Chrome, or the one Playwright installs
const path = require('path');
const out = n => path.join(__dirname, '../shots', n + '.png');
(async () => {
  const which = process.argv[2] || 'basic';
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const phone = which.indexOf('mobile') === 0, shell = which === 'shell' || which === 'mobile5';     // the shell scenarios start at the title screen; the rest start in a new game with How to play open
  const vp = phone ? { width: 390, height: 780 } : which === 'small' ? { width: 1100, height: 700 } : { width: 1440, height: +process.env.VH || 900 };     // VH: a taller desktop window, DPR: sharper shots
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: +process.env.DPR || (phone ? 2 : 1), hasTouch: phone });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
  await page.goto('file://' + path.join(__dirname, '../dist/preview.html'));
  await page.waitForTimeout(900);
  if (!shell) await page.evaluate(() => { CH.ui.begin(); CH.ui.act.modal({ name: 'help' }); });
  const steps = require('./scenarios.js')[which] || require('./scenarios.js').basic;
  await steps(page, async (n) => { await page.screenshot({ path: out(which + '-' + n) }); console.log('shot', which + '-' + n); });
  console.log(errs.length ? 'CONSOLE:\n' + errs.join('\n') : 'no console errors');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
