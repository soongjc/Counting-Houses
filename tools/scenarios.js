const wait = (p, ms) => p.waitForTimeout(ms);
const at = (page, x, y) => page.evaluate(([x, y]) => { const u = CH.ui, p = CH.draw.toScreen(u.st, u.ui.cam, x, y), r = document.getElementById('map').getBoundingClientRect(); return { x: r.left + p[0], y: r.top + p[1] }; }, [x, y]);
const tile = async (page, x, y) => { const pos = await at(page, x, y); await page.mouse.move(pos.x, pos.y); await wait(page, 80); await page.mouse.click(pos.x, pos.y); await wait(page, 150); };
const hover = async (page, x, y) => { const pos = await at(page, x, y); await page.mouse.move(pos.x - 3, pos.y - 2); await page.mouse.move(pos.x, pos.y); await wait(page, 200); };
const fast = (page, years) => page.evaluate(y => { const S = CH.ui.state(); for (let i = 0; i < y * CH.DEF.tpy; i++) CH.tick(S); }, years);
const tool = (page, k, t) => page.click(`#build [data-act=tool][data-k=${k}][data-t="${t}"]`);
const center = (page, x, y, z) => page.evaluate(([x, y, z]) => { const u = CH.ui; if (z) u.ui.cam.z = z; CH.draw.center(u.st, u.ui.cam, x, y); }, [x, y, z]);
const state = (page, fn) => page.evaluate(fn);
module.exports = { wait, tile, hover, fast, tool, center, state,
  basic: async (page, shot) => {
    await page.click('#modal .mfoot [data-act=close]'); await wait(page, 400);
    await tool(page, 'market', 1); await hover(page, 23, 27); await wait(page, 300);
    await shot('3-placing-market');
    await tile(page, 23, 27); await wait(page, 500);
    await shot('4-malacca');
    await center(page, 23, 27, 1.6); await wait(page, 400);
    await shot('5-close');
  }
};
// find the nearest tile to (x,y) where the engine would accept the action
const near = (page, kind, t, x, y) => page.evaluate(([kind, t, x, y]) => {
  const S = CH.ui.state(); let best = null, bd = 1e9;
  for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) {
    const q = kind === 'market' ? CH.can.market(S, x + dx, y + dy, t) : CH.can.build(S, t, x + dx, y + dy);
    if (q.ok && Math.hypot(dx, dy) < bd) { bd = Math.hypot(dx, dy); best = [x + dx, y + dy]; }
  }
  return best;
}, [kind, t, x, y]);
module.exports.play = async (page, shot) => {
  const S = fn => page.evaluate(fn);
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await center(page, 30, 24, 0.75);
  await tool(page, 'market', 1); await tile(page, 23, 27);
  let p = await near(page, 'bld', 'potter', 27, 28); await tool(page, 'bld', 'potter'); await hover(page, p[0], p[1]); await shot('1-potter-ghost'); await tile(page, p[0], p[1]);
  p = await near(page, 'market', 1, 37, 19); await tool(page, 'market', 1); await tile(page, p[0], p[1]);
  const mk = await S(() => CH.ui.state().mk.map(m => [m.name, m.x, m.y, m.pop]));
  console.log('markets', JSON.stringify(mk));
  await tool(page, 'path', 'trail'); await tile(page, mk[0][1], mk[0][2]); await hover(page, mk[1][1], mk[1][2]); await wait(page, 300); await shot('2-trail-preview');
  await tile(page, mk[1][1], mk[1][2]); await page.click('#banner [data-act=cancel]');
  await page.click('#roster [data-act=modal][data-name=hire]'); await wait(page, 300); await shot('3-hire');
  await page.click('#modal .cand >> nth=0 >> [data-act=hire]'); await wait(page, 300);
  await center(page, 30, 24, 0.75); await wait(page, 300);
  await shot('3b-pick-stops');                       // hiring with two markets on the map drops straight into picking his stops
  console.log('pick mode after hire:', await S(() => !!CH.ui.ui.pick), '| banner:', await page.textContent('#banner'));
  await tile(page, mk[1][1], mk[1][2]); await tile(page, mk[0][1], mk[0][2]); await wait(page, 300);
  await page.click('#banner [data-act=pick]'); await wait(page, 200);
  console.log('route after picking', JSON.stringify(await S(() => { const s = CH.ui.state(); return s.rt.map(r => [r.name, r.stops.map(q => [CH.mkt(s, q.m).name, q.ld, q.auto])]); })));
  console.log('left to him, today he would load:', JSON.stringify(await S(() => { const s = CH.ui.state(); return CH.view.route(s, s.rt[0], s.ms[0]).stops.map(q => q.got); })));
  await shot('4-left-to-him');
  await page.click('#inspect [data-act=own][data-k="0"]'); await wait(page, 350);       // take the first stop over: the orders start from what a careful merchant would write
  console.log('stop 1 taken over', JSON.stringify(await S(() => CH.ui.state().rt[0].stops[0])));
  const g0 = await S(() => Object.keys(CH.ui.state().rt[0].stops[0].ld)[0] || '');
  if (g0) { await page.click(`#inspect [data-act=ld][data-k="0"][data-g=${g0}][data-d="1"]`); await wait(page, 350); }
  const offered = await page.$$eval('#inspect [data-ch=addload][data-s="0"] option', os => os.map(o => o.value).filter(Boolean));
  console.log('goods offered at stop 1:', offered.join(','));
  if (offered.length) { await page.selectOption('#inspect [data-ch=addload][data-s="0"]', offered[0]); await wait(page, 350); }
  await page.click('#inspect [data-act=strict][data-v="1"]'); await wait(page, 300);
  await shot('4-orders');
  console.log('route', JSON.stringify(await S(() => CH.ui.state().rt)));
  await page.click('#inspect [data-act=strict][data-v="0"]'); await page.click('#inspect [data-act=free][data-k="0"]'); await wait(page, 300);      // and hand it back
  await page.click('#speed [data-v="8"]'); await wait(page, 5000);
  await shot('5-on-the-road');
  await fast(page, 3); await wait(page, 700);
  await shot('6-three-years');
  const r = await S(() => { const s = CH.ui.state(); return { coins: Math.round(s.coins), ms: s.ms.map(m => [m.nm, m.trips, Math.round(m.pr), m.st, m.why]), pops: s.mk.map(m => m.pop), goals: Object.keys(s.goals) }; });
  console.log(JSON.stringify(r));
  await page.click('#menu [data-name=prices]'); await wait(page, 300); await shot('7-prices'); await page.keyboard.press('Escape');
  await page.click('#menu [data-name=adv]'); await wait(page, 300); await shot('8-research'); await page.click('#modal [data-act=adv] >> nth=0'); await wait(page, 200); await page.keyboard.press('Escape');
  await page.click('#menu [data-name=ledger]'); await wait(page, 300); await shot('9-finances'); await page.keyboard.press('Escape');
  await tile(page, mk[0][1], mk[0][2]); await wait(page, 400); await shot('10-market');
};
module.exports.mobile = async (page, shot) => {
  const tap = async (x, y) => { const pos = await at(page, x, y); await page.touchscreen.tap(pos.x, pos.y); await wait(page, 250); };
  await shot('1-help');
  await page.tap('#modal .mfoot [data-act=close]'); await wait(page, 400);
  await shot('2-overview');
  await page.tap('#tabs [data-t=build]'); await wait(page, 300);
  await shot('3-build');
  await page.tap('#build [data-act=tool][data-k=market][data-t="1"]'); await wait(page, 200);
  await center(page, 23, 27, 0.6); await wait(page, 200);
  await tap(23, 27); await wait(page, 400);
  await shot('4-market');
  await page.tap('#tabs [data-t=build]'); await page.tap('#build [data-act=tool][data-k=path][data-t=trail]'); await wait(page, 200);
  await tap(23, 27); await tap(30, 24); await wait(page, 300);
  await shot('5-trail-confirm');
  await page.tap('#banner [data-act=lay]'); await wait(page, 300); await page.tap('#banner [data-act=cancel]');
  await page.tap('#tabs [data-t=merch]'); await wait(page, 200); await page.tap('#roster [data-act=modal][data-name=hire]'); await wait(page, 300);
  await shot('6-hire');
  await page.tap('#modal .cand >> nth=0 >> [data-act=hire]'); await wait(page, 400);
  await shot('7-merchant');
};
module.exports.modals = async (page, shot) => {
  await shot('1-help');
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await tool(page, 'market', 1); await tile(page, 23, 27);
  await page.click('#roster [data-act=modal][data-name=hire]'); await wait(page, 300); await shot('2-hire'); await page.keyboard.press('Escape');
  await page.click('#menu [data-name=adv]'); await wait(page, 300); await shot('3-research'); await page.keyboard.press('Escape');
  await fast(page, 1); await page.click('#menu [data-name=ledger]'); await wait(page, 300); await shot('4-finances'); await page.keyboard.press('Escape');
  await center(page, 23, 27, 0.3); await wait(page, 500); await shot('5-whole-map');
  const ms = await page.evaluate(() => { const u = CH.ui, t0 = performance.now(); for (let i = 0; i < 60; i++) CH.draw.render(u.st, u.state(), u.ui, t0 + i * 16); return (performance.now() - t0) / 60; });
  console.log('frame at widest zoom', ms.toFixed(2), 'ms');
};
module.exports.grow = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 200);
  await tool(page, 'market', 1); await tile(page, 23, 27);
  await page.click('#speed [data-act=pause]');
  const out = await page.evaluate(() => { const S = CH.ui.state(), m = S.mk[0], o = []; for (let q = 0; q < 8; q++) { for (let i = 0; i < 75; i++) CH.tick(S); o.push(m.pop + ':' + JSON.stringify(m.stock) + ' sat ' + Object.values(m.sat).map(v => v.toFixed(2)).join(',')); } return [S.seed, S.tick, o]; });
  console.log(JSON.stringify(out, null, 1));
};
// A mid-game built by script inside the page, then every kind of panel opened while the game runs fast.
const setup = () => {
  const S = CH.ui.state(), D = CH.DEF, W = D.W, I = (x, y) => y * W + x, log = [];
  S.coins = 40000; ['boat', 'eleph', 'cart', 'smelt', 'bazaar', 'curing'].forEach(a => { S.flags; CH.act.buyAdv(S, a) ; }); S.adv.boat = S.adv.eleph = S.adv.cart = S.adv.smelt = S.adv.bazaar = S.adv.curing = 1; CH.rt(S).tv++;
  const found = (name, sz) => { const p = D.places.find(q => q.n === name); let best = null, bs = -1; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const q = CH.can.market(S, p.x + dx, p.y + dy, sz); if (!q.ok) continue; const sc = Object.values(q.cover.sites).reduce((a, b) => a + b, 0) * 3 + q.cover.houses + q.cover.blds.length * 4; if (sc > bs) { bs = sc; best = [p.x + dx, p.y + dy]; } } const r = best ? CH.act.market(S, best[0], best[1], sz) : { ok: false, why: 'no spot' }; if (!r.ok) log.push(name + ': ' + r.why); return r.m; };
  const build = (t, m) => { const r = D.sizes[m.sz].r; let best = null, bd = 1e9; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const q = CH.can.build(S, t, m.x + dx, m.y + dy); if (q.ok && q.m === m) { const d = Math.hypot(dx, dy); if (d < bd && d > 1.5) { bd = d; best = [m.x + dx, m.y + dy]; } } } const q = best ? CH.act.build(S, t, best[0], best[1]) : { ok: false, why: 'no spot for ' + t }; if (!q.ok) log.push(t + '@' + m.name + ': ' + q.why); return q.b; };
  const link = (a, b, k) => { const q = CH.act.path(S, k || 'trail', I(a.x, a.y), I(b.x, b.y)); if (!q.ok) log.push('path ' + a.name + '-' + b.name + ': ' + q.why); };
  const hire = () => CH.act.hire(S, 0).m;
  const route = (m, name, stops) => { const R = CH.act.newRoute(S, name).R; stops.forEach((s, k) => { CH.act.addStop(S, R, s[0].id); for (const g in s[1] || {}) CH.act.setLoad(S, R, k, g, s[1][g]); }); CH.act.setRoute(S, m, R.id); return R; };
  const mal = found('Malacca', 1), nan = found('Naning', 1), mer = found('Merlimau', 1), su = found('Sungai Ujong', 1), jas = found('Jasin', 0), lin = found('Linggi', 1);
  build('potter', mal); build('smelter', mal); build('balai', nan); build('curing', mer); build('harbour', mal); build('harbour', mer); build('harbour', lin); build('caravan', mal); build('caravan', nan);
  link(mal, nan, 'road'); link(nan, su); link(mal, jas); CH.act.buyBld(S, S.bl.find(b => b.t === 'carpenter')); CH.act.enlarge(S, mal);
  const a = hire(), b = hire(), c = hire(), d = hire(), e = hire(), f = hire();
  route(a, 'Naning carts', [[nan, { rice: 6, pepper: 3 }], [mal, { cloth: 2, pottery: 2, fish: 3 }]]); log.push('cart: ' + JSON.stringify(CH.act.trans(S, a, 'cart')));
  route(b, 'Salt boats', [[mer, { salt: 3, fish: 4 }], [mal, { cloth: 1, pottery: 1 }], [lin, { rice: 3 }]]); log.push('sampan: ' + JSON.stringify(CH.act.trans(S, b, 'sampan')));
  route(c, 'Tin run', [[su, { ore: 8 }], [mal, { rice: 2, fish: 2 }]]); log.push('eleph: ' + JSON.stringify(CH.act.trans(S, c, 'eleph')));
  const R = route(d, 'Timber run', [[jas, { timber: 4 }], [mal, {}]]); CH.act.setUnload(S, R, 1, null); CH.act.setUnload(S, R, 1, 'timber', 3);
  route(e, 'Ore carts', [[su, { ore: 4 }], [mal, {}]]); CH.act.trans(S, e, 'cart');
  return { log, ids: { mal: mal.id, mer: mer.id }, ms: S.ms.map(m => m.id), bl: S.bl.map(b => [b.id, b.t]), mk: S.mk.map(m => [m.name, m.x, m.y]) };
};
module.exports.soak = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 200);
  const info = await page.evaluate(setup); console.log('setup', JSON.stringify(info.log));
  await center(page, 30, 26, 0.62); await page.click('#speed [data-v="8"]');
  const sel = s => page.evaluate(s => { CH.ui.ui.sel = s; CH.ui.ui.tool = null; }, s);
  await wait(page, 4000);
  await sel({ k: 'm', id: info.ms[0] }); await wait(page, 500); await shot('1-cart');
  await sel({ k: 'm', id: info.ms[1] }); await wait(page, 500); await shot('2-sampan');
  await sel({ k: 'm', id: info.ms[3] }); await wait(page, 500); await shot('3-exact-unload');
  await sel({ k: 'm', id: info.ms[4] }); await wait(page, 500); await shot('4-stuck-cart');
  for (const t of ['smelter', 'quarter', 'istana', 'harbour', 'carpenter', 'balai', 'curing']) { const b = info.bl.find(q => q[1] === t); await sel({ k: 'bld', id: b[0] }); await wait(page, 350); if (t === 'smelter' || t === 'quarter') await shot('5-' + t); }
  await sel({ k: 'site', i: 0 }); await wait(page, 300); await sel({ k: 'site', i: 20 }); await wait(page, 300); await sel({ k: 'hq' }); await wait(page, 300);
  await sel({ k: 'mkt', id: info.ids.mal }); await wait(page, 400);
  await center(page, 24, 28, 1.25); await wait(page, 1200); await shot('6-malacca-close');
  await page.click('#menu [data-name=prices]'); await wait(page, 300); await shot('7-prices'); await page.keyboard.press('Escape');
  await page.click('#menu [data-name=ledger]'); await wait(page, 300); await shot('8-finances'); await page.keyboard.press('Escape');
  for (let y = 0; y < 12; y++) { await fast(page, 3); await sel(y % 3 === 0 ? { k: 'm', id: info.ms[y % 5] } : y % 3 === 1 ? { k: 'mkt', id: 1 + (y % 6) } : null); await wait(page, 350); }
  await center(page, 30, 26, 0.62); await wait(page, 600); await shot('9-after-36-years');
  const r = await page.evaluate(() => { const s = CH.ui.state(); return { year: CH.year(s), coins: Math.round(s.coins), pops: s.mk.map(m => m.name + ' ' + m.pop), ms: s.ms.map(m => [m.nm, m.tr, m.trips, Math.round(m.pr), m.st, m.why]), goals: Object.keys(s.goals) }; });
  console.log(JSON.stringify(r));
};
module.exports.over = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await shot('1-start-with-place-names');
  await tool(page, 'market', 1); await tile(page, 23, 27);
  await page.evaluate(() => { const S = CH.ui.state(); S.tick = (CH.DEF.span[1] - CH.DEF.span[0]) * CH.DEF.tpy - 40; });
  await page.click('#speed [data-v="8"]'); await wait(page, 2500);
  await shot('2-game-over');
  console.log(await page.evaluate(() => { const S = CH.ui.state(); return JSON.stringify({ year: CH.year(S), over: S.over, final: S.final, modal: CH.ui.ui.modal, adv: Object.keys(S.adv).length }); }));
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 600);
  console.log(await page.evaluate(() => JSON.stringify({ modal: CH.ui.ui.modal, tick: CH.ui.state().tick })));
};
module.exports.room = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await tool(page, 'market', 1); await tile(page, 23, 27);
  await center(page, 28, 30, 0.8); await tool(page, 'market', 1); await hover(page, 30, 36); await wait(page, 400);
  await shot('1-too-close');
  console.log(await page.evaluate(() => document.getElementById('tip').textContent));
  await hover(page, 29, 40); await wait(page, 300);
  console.log(await page.evaluate(() => document.getElementById('tip').textContent));
};
// the look of the map: the opening view, a close-up of a working town, and the whole chart
module.exports.look = async (page, shot) => {
  const t0 = await page.evaluate(() => performance.now());
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await shot('1-start');
  const info = await page.evaluate(setup);
  await page.click('#speed [data-v="8"]'); await wait(page, 3500);
  await page.evaluate(() => { const S = CH.ui.state(); for (let i = 0; i < 900; i++) CH.tick(S); CH.ui.ui.sel = null; });
  await center(page, 24, 28, 1.3); await wait(page, 900); await shot('2-town');
  await center(page, 24, 28, 2); await wait(page, 700); await shot('3-very-close');
  await center(page, 44, 20, 0.7); await wait(page, 700); await shot('4-inland');
  await center(page, 36, 28, 0.3); await wait(page, 700); await shot('5-whole');
  const ms = await page.evaluate(() => { const u = CH.ui, t = performance.now(); for (let i = 0; i < 40; i++) CH.draw.render(u.st, u.state(), u.ui, t + i * 16); return (performance.now() - t) / 40; });
  const g = await page.evaluate(() => { const u = CH.ui, t = performance.now(); CH.draw.ground(u.st, u.state()); return performance.now() - t; });
  console.log('frame at widest zoom', ms.toFixed(1), 'ms; repaint of the whole ground', g.toFixed(0), 'ms');
};
module.exports.shadowdbg = async (page) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 600);
  console.log(JSON.stringify(await page.evaluate(() => {
    const u = CH.ui, s = CH.draw.sprite(u.st, 'house0'), out = { keys: Object.keys(s), w: s.w, h: s.h, ax: s.ax, ay: s.ay, flat: s.flat };
    const cnt = cv => { const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0, a = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; a += d[i]; } return [cv.width, cv.height, n, n ? Math.round(a / n) : 0]; };
    out.sil = cnt(s.sil); if (s.sn) { out.sn = cnt(s.sn.c); out.snMeta = [s.sn.w, s.sn.h, s.sn.ax, s.sn.ay]; } if (s.sf) out.sf = cnt(s.sf.c);
    return out;
  })));
};
// felling forest repaints the ground patch; a new game puts the forest back
module.exports.regrow = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  const r = await page.evaluate(() => {
    const S = CH.ui.state(), D = CH.DEF, W = D.W, I = (x, y) => y * W + x;
    S.coins = 20000; const a = CH.act.market(S, 23, 27, 1), b = CH.act.market(S, 44, 30, 0), p = CH.act.path(S, 'trail', I(23, 27), I(44, 30));
    return { a: a.ok, b: b.ok, path: p.ok ? p.n : p.why, cleared: Object.keys(S.clear).length };
  });
  console.log(JSON.stringify(r));
  await center(page, 34, 29, 0.8); await wait(page, 700); await shot('1-trail-through-forest');
  await page.click('#menu [data-name=help]'); await page.click('#modal [data-act=asknew]'); await page.click('#modal [data-act=newgame]'); await wait(page, 500);
  await page.click('#modal .mfoot [data-act=close]'); await center(page, 34, 29, 0.8); await wait(page, 600); await shot('2-new-game');
  console.log(JSON.stringify(await page.evaluate(() => { const S = CH.ui.state(); return { markets: S.mk.length, cleared: Object.keys(S.clear).length, coins: S.coins }; })));
};
module.exports.fell = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await center(page, 44, 30, 1.2); await wait(page, 500); await shot('1-forest');
  const r = await page.evaluate(() => {
    const S = CH.ui.state(), D = CH.DEF, W = D.W, WD = CH.genWorld(), I = (x, y) => y * W + x; S.coins = 20000; let spot = null;
    for (let y = 28; y < 33 && !spot; y++) for (let x = 42; x < 47; x++) if (WD.terr[I(x, y)] === D.T.FOREST && CH.can.market(S, x, y, 0).ok) { spot = [x, y]; break; }
    const a = CH.act.market(S, spot[0], spot[1], 0), p = CH.act.path(S, 'trail', I(spot[0], spot[1]), I(spot[0] + 5, spot[1] + 4));
    for (let i = 0; i < 6; i++) CH.act.build(S, 'potter', spot[0] - 2 + i, spot[1] + (i % 2 ? 1 : -1));
    return { spot, market: a.ok, path: p.ok ? p.n : p.why, cleared: Object.keys(S.clear).length };
  });
  console.log(JSON.stringify(r)); await wait(page, 700); await shot('2-felled');
};

module.exports.info = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  const info = await page.evaluate(setup);
  await page.evaluate(() => { const S = CH.ui.state(); S.rt.forEach(r => r.stops.forEach(q => { q.auto = 1; q.ld = {}; q.un = 'all'; })); for (let i = 0; i < 900; i++) CH.tick(S); CH.ui.ui.sel = null; });
  await center(page, 25, 27, 1); await wait(page, 900); await shot('1-tags');
  const tipOver = async (x, y, name) => { await hover(page, x, y); await wait(page, 350); console.log(name + ':', (await page.evaluate(() => { const t = document.getElementById('tip'); return t.hidden ? '(no card)' : t.innerText.replace(/\s+/g, ' '); }))); };
  // point at tags the way a player would: find where a tag was drawn and move the pointer onto it
  const tagOf = (kind, t) => page.evaluate(([kind, t]) => { const u = CH.ui, WD = CH.genWorld(), r = document.getElementById('map').getBoundingClientRect(); const q = u.st.hot.find(q => q[4].k === kind && (kind === 'site' ? WD.sites[q[4].i].t === t && u.state().st[q[4].i].mk : kind === 'bld' ? q[4].b.t === t : kind === 'mkt' ? q[4].m.name === t : true)); return q ? { x: r.left + (q[0] + q[2]) / 2, y: r.top + (q[1] + q[3]) / 2 } : null; }, [kind, t]);
  const card = async (name, pos) => { if (!pos) { console.log(name + ': no tag on screen'); return; } await page.mouse.move(pos.x - 3, pos.y - 2); await page.mouse.move(pos.x, pos.y); await wait(page, 350); console.log(name + ':', await page.evaluate(() => { const t = document.getElementById('tip'); return t.hidden ? '(no card)' : t.innerText.replace(/\s+/g, ' '); })); };
  await card('fishing weir tag', await tagOf('site', 'fishery')); await shot('2-card-weir');
  await card('paddy tag', await tagOf('site', 'paddy'));
  await card('potter tag', await tagOf('bld', 'potter')); await shot('3-card-potter');
  await card('smelter tag', await tagOf('bld', 'smelter'));
  await card('istana tag', await tagOf('bld', 'istana'));
  await card('market tag', await tagOf('mkt', 'Malacca')); await shot('4-card-market');
  await card('merchant tag', await tagOf('m'));
  const foot = async (name, x, y) => { await card(name, await at(page, x, y)); };
  const S0 = await page.evaluate(() => { const S = CH.ui.state(), WD = CH.genWorld(); const k = WD.sites.findIndex((s, i) => s.t === 'paddy' && S.st[i].mk === S.mk[0].id), h = S.hs.filter(h => h[2] === S.mk[0].id).pop(); return { paddy: [WD.sites[k].x, WD.sites[k].y], house: h, hq: [WD.hq.x, WD.hq.y] }; });
  await foot('paddy itself', S0.paddy[0], S0.paddy[1]); await foot('a house', S0.house[0], S0.house[1]);
  await page.mouse.move(5, 5);
  await page.click('#lens [data-g=pepper]'); await wait(page, 500); await shot('5-pepper-everywhere');
  console.log('caption:', await page.textContent('#lenscap'));
  await center(page, 34, 27, 0.42); await wait(page, 600); await shot('6-pepper-from-afar');
  await page.click('#lens [data-g=pepper]'); await center(page, 25, 27, 1.5); await wait(page, 600); await shot('7-close');
  await page.evaluate(() => { const u = CH.ui, f = S => S.st.findIndex((q, i) => q.mk); u.ui.sel = { k: 'site', i: f(u.state()) }; }); await wait(page, 400); await shot('8-site-panel');
  await page.evaluate(info => { CH.ui.ui.sel = { k: 'bld', id: info.bl.find(q => q[1] === 'smelter')[0] }; }, info); await wait(page, 400); await shot('9-smelter-panel');
  await page.evaluate(info => { CH.ui.ui.sel = { k: 'm', id: info.ms[0] }; }, info); await wait(page, 400); await shot('10-merchant-panel');
  await page.click('#zoom [data-act=plain]'); await center(page, 25, 27, 1); await wait(page, 500); await shot('11-plain');
  await page.click('#zoom [data-act=plain]');
  // smoothness: where one moving merchant is drawn, frame by frame, at ordinary speed
  await page.click('#speed [data-v="1"]'); await wait(page, 300);
  const sm = await page.evaluate(() => new Promise(done => {
    const u = CH.ui, S = u.state(), m = S.ms.find(m => m.st === 'go' && m.path && m.path.length - m.pi > 8) || S.ms.find(m => m.st === 'go'); if (!m) return done({ none: true });
    const xs = [], raw = []; let n = 0; const f = () => { const p = CH.draw.mpos(m, u.ui), q = CH.draw.toScreen(u.st, u.ui.cam, p[0], p[1]), r = CH.draw.toScreen(u.st, u.ui.cam, m.x, m.y); xs.push([q[0], q[1], m.st]); raw.push(r); if (++n < 120) requestAnimationFrame(f); else {
      const d = [], d0 = []; for (let i = 1; i < xs.length; i++) if (xs[i][2] === 'go' && xs[i - 1][2] === 'go') { d.push(Math.hypot(xs[i][0] - xs[i - 1][0], xs[i][1] - xs[i - 1][1])); d0.push(Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1])); }
      const mean = d.reduce((a, b) => a + b, 0) / (d.length || 1), still = v => v.filter(q => q < 0.02).length, big = v => +Math.max.apply(null, v.concat(0)).toFixed(2);
      done({ frames: d.length, now: { meanStep: +mean.toFixed(2), biggestStep: big(d), framesStandingStill: still(d) }, asItWasBefore: { biggestStep: big(d0), framesStandingStill: still(d0) }, zoom: u.ui.cam.z });
    } }; requestAnimationFrame(f);
  }));
  console.log('movement per frame, in screen pixels', JSON.stringify(sm));
};

// on a phone: a working town, a merchant hired with two markets on the map, his stops tapped, then the panels
module.exports.mobile2 = async (page, shot) => {
  const tap = async (x, y) => { const pos = await at(page, x, y); await page.touchscreen.tap(pos.x, pos.y); await wait(page, 300); };
  await page.tap('#modal .mfoot [data-act=close]'); await wait(page, 300);
  const mk = await page.evaluate(() => { const S = CH.ui.state(); S.coins = 9000; CH.act.market(S, 23, 27, 1); const D = CH.DEF, p = D.places.find(q => q.n === 'Naning'); let b = null; for (let dy = -2; dy <= 2 && !b; dy++) for (let dx = -2; dx <= 2; dx++) if (CH.can.market(S, p.x + dx, p.y + dy, 1).ok) { b = [p.x + dx, p.y + dy]; break; } CH.act.market(S, b[0], b[1], 1); CH.act.path(S, 'trail', 27 * D.W + 23, b[1] * D.W + b[0]); for (let i = 0; i < 200; i++) CH.tick(S); return S.mk.map(m => [m.x, m.y]); });
  await center(page, 30, 24, 0.5); await wait(page, 400);
  await page.tap('#tabs [data-t=merch]'); await wait(page, 200); await page.tap('#roster [data-act=modal][data-name=hire]'); await wait(page, 300);
  await page.tap('#modal .cand >> nth=0 >> [data-act=hire]'); await wait(page, 400);
  await center(page, 30, 24, 0.5); await wait(page, 300); await shot('1-pick-stops');
  await tap(mk[1][0], mk[1][1]); await tap(mk[0][0], mk[0][1]); await wait(page, 300);
  console.log('stops after two taps:', await page.evaluate(() => { const s = CH.ui.state(); return JSON.stringify(s.rt.map(r => [r.name, r.stops.length])); }));
  await page.tap('#banner [data-act=pick]'); await wait(page, 300); await shot('2-route');
  await page.evaluate(() => { document.getElementById('inspect').scrollTop = 420; }); await wait(page, 300); await shot('3-stops');
  await page.evaluate(() => { const S = CH.ui.state(); for (let i = 0; i < 400; i++) CH.tick(S); });
  await center(page, 24, 27, 1); await wait(page, 500);
  await tap(25, 25); await wait(page, 400); await shot('4-tap-a-paddy');
  await page.tap('#lens [data-g=rice]'); await center(page, 30, 24, 0.5); await wait(page, 500); await shot('5-rice-everywhere');
  console.log('phone: lens caption', JSON.stringify(await page.textContent('#lenscap')));
};

// the teaching: a good's supply and demand at a market, a trade tried on it, the chart of a route's trade, and the book
module.exports.learn = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  const info = await page.evaluate(setup);
  await page.evaluate(() => { const S = CH.ui.state(); S.rt.forEach(r => r.stops.forEach(q => { q.auto = 1; q.ld = {}; q.un = 'all'; })); for (let i = 0; i < 1500; i++) CH.tick(S); });
  console.log('lessons seen:', await page.evaluate(() => Object.keys(CH.ui.state().les || {}).join(' ')), '| badge:', await page.evaluate(() => (document.querySelector('#menu .badge:last-of-type') || {}).textContent));
  await page.evaluate(() => { CH.ui.ui.sel = { k: 'mkt', id: 1 }; CH.ui.ui.chart = null; }); await wait(page, 400);
  const goods = await page.$$eval('#inspect [data-act=chart]', b => b.map(q => q.dataset.g));
  console.log('goods listed at the first market:', goods.join(','));
  await page.click('#inspect [data-act=chart][data-g=fish]'); await wait(page, 400);
  await page.evaluate(() => { document.getElementById('inspect').scrollTop = 260; }); await wait(page, 300); await shot('1-curve');
  for (let i = 0; i < 4; i++) { await page.click('#inspect [data-act=whatif][data-d="1"]'); await wait(page, 120); }
  await wait(page, 300); await shot('2-sell-four'); console.log('sell 4:', await page.textContent('#inspect .kline.gold'));
  for (let i = 0; i < 7; i++) { await page.click('#inspect [data-act=whatif][data-d="-1"]'); await wait(page, 120); }
  await wait(page, 300); await shot('3-buy-three'); console.log('buy 3:', await page.textContent('#inspect .kline.gold'));
  await page.click('#inspect [data-act=chart][data-g=rice]'); await wait(page, 400); await shot('4-rice');
  await page.evaluate(info => { CH.ui.ui.sel = { k: 'm', id: info.ms[0] }; }, info); await wait(page, 500);
  const legs = await page.$$eval('#inspect [data-act=leg]', b => b.map(q => q.dataset.k + ':' + q.dataset.g));
  console.log('goods to tap on his route:', legs.join(' '));
  if (legs.length) { await page.click('#inspect [data-act=leg]'); await wait(page, 400); await page.evaluate(() => { const c = document.querySelector('#inspect .kcard'); if (c) c.scrollIntoView({ block: 'center' }); }); await wait(page, 300); await shot('5-leg'); console.log('leg:', (await page.textContent('#inspect .kcard .kline')).slice(0, 220)); }
  await page.evaluate(info => { CH.ui.ui.sel = { k: 'bld', id: info.bl.find(q => q[1] === 'smelter')[0] }; }, info); await wait(page, 400); await shot('6-workshop');
  await page.evaluate(() => { CH.ui.ui.sel = null; }); await wait(page, 400); await shot('7-notices');
  await page.click('#menu [data-name=lessons]'); await wait(page, 500); await shot('8-book');
  const ids = await page.$$eval('#modal .book li.seen [data-act=lesson]', b => b.map(q => q.dataset.id));
  for (const id of ids) { await page.click(`#modal [data-act=lesson][data-id=${id}]`); await wait(page, 250); if (['glut', 'depth', 'arb', 'margin', 'value', 'road', 'shift'].includes(id)) await shot('9-lesson-' + id); }
  console.log('opened', ids.length, 'lessons:', ids.join(' '), '| unread now', await page.evaluate(() => CH.learn.unread(CH.ui.state())));
  await page.click('#modal .x'); await wait(page, 200);
};

// the teaching on a phone: a good's curve in a market's panel, a route's trade, the book
module.exports.mobile3 = async (page, shot) => {
  await page.tap('#modal .mfoot [data-act=close]'); await wait(page, 300);
  const info = await page.evaluate(setup);
  await page.evaluate(() => { const S = CH.ui.state(); S.rt.forEach(r => r.stops.forEach(q => { q.auto = 1; q.ld = {}; q.un = 'all'; })); for (let i = 0; i < 1500; i++) CH.tick(S); CH.ui.ui.sel = { k: 'mkt', id: 1 }; CH.ui.ui.tab = 'sel'; });
  await wait(page, 500); await shot('1-top');
  await page.tap('#inspect [data-act=chart][data-g=fish]'); await wait(page, 400);
  await page.evaluate(() => { const c = document.querySelector('#inspect .kcard'); c.scrollIntoView({ block: 'start' }); }); await wait(page, 300); await shot('2-curve');
  await page.tap('#inspect [data-act=whatif][data-d="1"]'); await page.tap('#inspect [data-act=whatif][data-d="1"]'); await wait(page, 300); await shot('3-sell-two');
  await page.evaluate(info => { CH.ui.ui.sel = { k: 'm', id: info.ms[0] }; }, info); await wait(page, 500);
  await page.tap('#inspect [data-act=leg]'); await wait(page, 400);
  await page.evaluate(() => { const c = document.querySelector('#inspect .kcard'); c.scrollIntoView({ block: 'start' }); }); await wait(page, 300); await shot('4-leg');
  await page.tap('#menu [data-name=lessons]'); await wait(page, 500); await shot('5-book');
  await page.tap('#modal [data-act=lesson][data-id=glut]'); await wait(page, 400); await shot('6-lesson');
  const fits = await page.evaluate(() => { const d = document.querySelector('#modal .dialog'); return { dialog: d.scrollWidth <= d.clientWidth + 1, page: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
  console.log('phone: nothing wider than the screen', JSON.stringify(fits));
  await page.tap('#modal .x'); await wait(page, 200);
};

// a market's panel, top to bottom: growth, needs, and the supply-and-demand board with a chart open. Run as `market`, `small` (narrow desktop) or `mobile4` (phone)
module.exports.market = module.exports.small = module.exports.mobile4 = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 300);
  await page.evaluate(setup);
  await page.evaluate(() => { const S = CH.ui.state(); S.rt.forEach(r => r.stops.forEach(q => { q.auto = 1; q.ld = {}; q.un = 'all'; })); for (let i = 0; i < 1500; i++) CH.tick(S); CH.ui.ui.sel = { k: 'mkt', id: 1 }; CH.ui.ui.tab = 'sel'; CH.ui.ui.chart = null; });
  await wait(page, 500); await shot('1-top');
  await page.evaluate(() => { document.querySelector('#inspect .sdkey').scrollIntoView({ block: 'start' }); }); await wait(page, 300); await shot('2-board');
  const fit = await page.evaluate(() => { const p = document.getElementById('inspect'), t = p.querySelector('.sdb'), r = p.getBoundingClientRect(), q = t.getBoundingClientRect(); return { panel: Math.round(r.width), table: Math.round(q.width), inside: q.right <= r.right + 0.5 && p.scrollWidth <= p.clientWidth + 1, rows: t.querySelectorAll('tbody tr').length, bar: Math.round(t.querySelector('.sdt').getBoundingClientRect().width) }; });
  console.log('board fits its panel:', JSON.stringify(fit));
  // one scale for the whole board: every bar's length is its loads a year over the number at the end of the axis
  const scale = await page.evaluate(() => {
    const t = document.querySelector('#inspect .sdb'), axis = [].map.call(t.querySelectorAll('.axt i'), e => +e.textContent), top = axis[2], S = CH.ui.state(), m = S.mk.find(q => q.id === CH.ui.ui.sel.id), rows = CH.view.market(S, m); let worst = 0, big = 0;
    [].forEach.call(t.querySelectorAll('tbody tr'), (tr, k) => { const w = rows[k], lines = tr.querySelectorAll('.sdt'); [[w.c + w.exp, lines[0]], [w.p + w.imp, lines[1]]].forEach(q => { const track = q[1].getBoundingClientRect().width, len = [].reduce.call(q[1].children, (a, e) => a + e.getBoundingClientRect().width, 0); big = Math.max(big, q[0]); if (q[0] / top * track >= 3) worst = Math.max(worst, Math.abs(len / track * top - q[0])); }); });
    return { axis, largest: Math.round(big * 10) / 10, worstErrorInLoads: Math.round(worst * 100) / 100, proportional: worst < top * 0.03 && big <= top && axis[0] === 0 && axis[1] === top / 2 };
  });
  console.log('one scale for every bar:', JSON.stringify(scale));
  console.log('rows:', await page.$$eval('#inspect .sdb tbody tr', a => a.slice(0, 16).map(r => r.cells[0].innerText.trim() + ' [' + r.querySelector('.sd').getAttribute('aria-label') + '] stock ' + r.cells[2].innerText.trim() + ' price ' + r.cells[3].innerText.trim()).join('\n      ')));
  await page.click('#inspect [data-act=chart][data-g=rice]'); await wait(page, 400);
  await page.evaluate(() => { document.querySelector('#inspect .sdkey').scrollIntoView({ block: 'start' }); }); await wait(page, 300); await shot('3-chart');
  await page.evaluate(() => { CH.ui.ui.sel = { k: 'mkt', id: 2 }; CH.ui.ui.chart = null; }); await wait(page, 400);
  await page.evaluate(() => { document.getElementById('inspect').scrollTop = 0; }); await wait(page, 200); await shot('4-second-market');
};

// every panel and dialog of a long game, read as text: looks for values that failed to print, and lists each distinct line once for proofreading
module.exports.sweep = async (page, shot) => {
  await page.click('#modal .mfoot [data-act=close]'); await wait(page, 200);
  const info = await page.evaluate(setup);
  const seen = new Set(), bad = [];
  const read = async where => {
    const lines = await page.evaluate(() => ['inspect', 'build', 'roster', 'modal', 'banner', 'toast', 'lenscap', 'menu', 'tabs'].map(id => { const e = document.getElementById(id); return e && !e.hidden ? e.innerText : ''; }).join('\n').split('\n').map(s => s.trim()).filter(Boolean));
    const tips = await page.evaluate(() => [].slice.call(document.querySelectorAll('#inspect [title], #inspect [aria-label], #modal [aria-label], #roster [title]')).map(e => e.getAttribute('title') || e.getAttribute('aria-label')));
    lines.concat(tips).forEach(s => { if (/undefined|NaN|null|\[object|Infinity/.test(s)) bad.push(where + ': ' + s); seen.add(s.replace(/[\d,.]*\d/g, '#')); });
  };
  const sel = s => page.evaluate(s => { CH.ui.ui.sel = s; CH.ui.ui.tool = null; CH.ui.ui.chart = null; CH.ui.ui.leg = null; }, s);
  for (const years of [1, 4, 12, 16, 15]) {
    await fast(page, years); await wait(page, 300);
    const S = await page.evaluate(() => { const S = CH.ui.state(); return { y: CH.year(S), mk: S.mk.map(m => m.id), ms: S.ms.map(m => m.id), bl: S.bl.map(b => b.id), st: S.st.map((q, i) => i).filter(i => i % 9 === 0) }; });
    await sel(null); await wait(page, 150); await read('overview ' + S.y);
    for (const id of S.mk) { await sel({ k: 'mkt', id }); await wait(page, 120); await read('market'); const gs = await page.$$eval('#inspect [data-act=chart]', b => b.map(q => q.dataset.g)); for (const g of gs.filter((q, i) => i % 3 === S.y % 3)) { await page.evaluate(g => { CH.ui.ui.chart = g; CH.ui.ui.whatif = g.length % 2 ? 2 : -1; }, g); await wait(page, 90); await read('chart ' + g); } }
    for (const id of S.ms) { await sel({ k: 'm', id }); await wait(page, 120); await read('merchant'); const lg = await page.$$eval('#inspect [data-act=leg]', b => b.map(q => [q.dataset.r, q.dataset.k, q.dataset.g])); for (const q of lg.slice(0, 3)) { await page.evaluate(q => { CH.ui.ui.leg = { r: +q[0], k: +q[1], g: q[2] }; }, q); await wait(page, 90); await read('leg'); } }
    for (const id of S.bl) { await sel({ k: 'bld', id }); await wait(page, 90); await read('building'); }
    for (const i of S.st) { await sel({ k: 'site', i }); await wait(page, 70); await read('site'); }
    await sel({ k: 'hq' }); await wait(page, 100); await read('hq'); await sel(null);
    for (const name of ['help', 'hire', 'adv', 'prices', 'ledger', 'lessons']) { await page.click(`#menu [data-name=${name}], #roster [data-name=${name}]`); await wait(page, 200); await read('dialog ' + name); if (name === 'lessons') { const ids = await page.$$eval('#modal .book li.seen [data-act=lesson]', b => b.map(q => q.dataset.id)); for (const id of ids) { await page.click(`#modal [data-act=lesson][data-id=${id}]`); await wait(page, 120); await read('lesson ' + id); } } await page.click('#modal .x'); await wait(page, 120); }
    for (const t of [['market', 1], ['path', 'trail'], ['bld', 'potter'], ['bld', 'balai'], ['bld', 'harbour']]) { const ok = await page.evaluate(t => { const b = document.querySelector(`#build [data-act=tool][data-k=${t[0]}][data-t="${t[1]}"]`); if (b) b.click(); return !!b; }, t); if (ok) { await wait(page, 120); await read('tool'); await page.keyboard.press('Escape'); } }
  }
  console.log(bad.length ? 'VALUES THAT FAILED TO PRINT:\n  ' + bad.slice(0, 20).join('\n  ') : 'every value printed');
  console.log('distinct lines: ' + seen.size); require('fs').writeFileSync(require('path').join(__dirname, '../shots/sweep.txt'), Array.from(seen).sort().join('\n'));
};
