// A diligent scripted player: expands in a sensible order and re-writes each merchant's exact orders twice a year
// from the prices he can see. Prints a line a year so the pace of money and towns can be judged.
const { CH, D, WD, I, found, build, link, hire, route, run, siteOf, town } = require('./kit');
const YEARS = +process.argv[2] || 40, QUIET = process.argv.includes('-q'), STRICT = process.argv.includes('--strict'), HANDS_OFF = process.argv.includes('--auto');
const S = CH.newGame({ seed: +process.argv[3] || 7 });
const mk = {}, ms = {}, R = {}, log = [];
function tune(m, R) {
  const cap = CH.capFor(m, m.tr), ab = m.ab;
  R.stops.forEach((st, k) => {
    const A = CH.mkt(S, st.m), B = CH.mkt(S, R.stops[(k + 1) % R.stops.length].m), ld = {}, dA = {}, dB = {}; let n = 0;
    while (n < cap) {
      let best = null, bp = 3;
      for (const g of D.goodIds) {
        if ((A.stock[g] || 0) + (dA[g] || 0) < 1) continue;
        const p = CH.sellP(S, B, g, dB[g] || 0) * (ab === 'sell' ? 1 : 0.95) - CH.buyP(S, A, g, dA[g] || 0) * (ab === 'buy' ? 1 : 1.05);
        if (p > bp) { bp = p; best = g; }
      }
      if (!best) break;
      ld[best] = (ld[best] || 0) + 1; dA[best] = (dA[best] || 0) - 1; dB[best] = (dB[best] || 0) + 1; n++;
    }
    for (const g in st.ld) if (!ld[g]) CH.act.setLoad(S, R, k, g, 0);
    for (const g in ld) CH.act.setLoad(S, R, k, g, ld[g]);
  });
}
const wishes = [];
const wish = (m, t) => { wishes.push([m, t]); grant(); };
const grant = () => wishes.forEach(w => { const m = w[0]; if (m.tr === w[1] || m.qt === w[1] || !S.ms.includes(m)) return; const q = CH.can.trans(S, m, w[1]); if (q.ok && S.coins >= (q.cost || 0) + 100) CH.act.trans(S, m, w[1]); });
const need = (q, what) => { if (!q.ok) { log.push(`${CH.year(S)} FAILED ${what}: ${q.why}`); } return q; };
const steps = [
  [400, () => { mk.mal = need(found(S, 'Malacca', 1), 'Malacca').m; }],
  [350, () => need(build(S, 'potter', mk.mal, siteOf(mk.mal, 'clay')), 'potter')],
  [700, () => { mk.nan = need(found(S, 'Naning', 1), 'Naning').m; need(link(S, mk.mal, mk.nan), 'trail nan'); ms.a = need(hire(S), 'hire').m; R.a = route(S, ms.a, 'Naning run', [[mk.nan], [mk.mal]]); }],
  [500, () => { mk.mer = need(found(S, 'Merlimau', 0), 'Merlimau').m; need(link(S, mk.mal, mk.mer), 'trail mer'); ms.b = need(hire(S), 'hire').m; R.b = route(S, ms.b, 'Salt run', [[mk.mer], [mk.mal]]); }],
  [900, () => { mk.su = need(found(S, 'Sungai Ujong', 1), 'Sungai Ujong').m; need(link(S, mk.nan, mk.su), 'trail su'); ms.c = need(hire(S), 'hire').m; R.c = route(S, ms.c, 'Tin run', [[mk.su], [mk.mal]]); }],
  [600, () => need(CH.act.buyAdv(S, 'boat'), 'adv boat')],
  [900, () => { need(build(S, 'harbour', mk.mal), 'harbour mal'); need(build(S, 'harbour', mk.mer), 'harbour mer'); wish(ms.b, 'sampan'); }],
  [900, () => { need(CH.act.buyBld(S, S.bl.find(b => b.t === 'carpenter')), 'buy carpenter'); mk.jas = need(found(S, 'Jasin', 0), 'Jasin').m; need(link(S, mk.mal, mk.jas), 'trail jas'); ms.d = need(hire(S), 'hire').m; R.d = route(S, ms.d, 'Timber run', [[mk.jas], [mk.mal]]); }],
  [700, () => { if (CH.advState(S, 'eleph') === 'later') return false; need(CH.act.buyAdv(S, 'eleph'), 'adv eleph'); }],
  [700, () => wish(ms.c, 'eleph')],
  [1000, () => { mk.lin = need(found(S, 'Linggi', 1), 'Linggi').m; need(build(S, 'harbour', mk.lin), 'harbour lin'); ms.e = need(hire(S), 'hire').m; wish(ms.e, 'sampan'); R.e = route(S, ms.e, 'Linggi run', [[mk.lin], [mk.mal]]); }],
  [1100, () => { if (CH.advState(S, 'smelt') === 'later') return false; need(CH.act.buyAdv(S, 'smelt'), 'adv smelt'); }],
  [900, () => need(build(S, 'smelter', mk.mal), 'smelter')],
  [1000, () => { if (CH.advState(S, 'cart') === 'later') return false; need(CH.act.buyAdv(S, 'cart'), 'adv cart'); }],
  [1500, () => { need(link(S, mk.mal, mk.nan, 'road'), 'road nan'); need(build(S, 'caravan', mk.mal), 'caravan mal'); need(build(S, 'caravan', mk.nan), 'caravan nan'); wish(ms.a, 'cart'); }],
  [900, () => { mk.mua = need(found(S, 'Muar', 1), 'Muar').m; need(build(S, 'harbour', mk.mua), 'harbour mua'); ms.f = need(hire(S), 'hire').m; wish(ms.f, 'sampan'); R.f = route(S, ms.f, 'Muar run', [[mk.mua], [mk.mal]]); }],
  [1400, () => { if (CH.advState(S, 'bazaar') === 'later') return false; need(CH.act.buyAdv(S, 'bazaar'), 'adv bazaar'); }],
  [700, () => need(CH.act.enlarge(S, mk.mal), 'enlarge mal')],
  [900, () => { if (CH.advState(S, 'curing') === 'later') return false; need(CH.act.buyAdv(S, 'curing'), 'adv curing'); }],
  [800, () => { need(build(S, 'curing', mk.mer), 'curing mer'); need(build(S, 'curing', mk.lin), 'curing lin'); }],
  [2200, () => { ms.g = need(hire(S), 'hire').m; wish(ms.g, 'sampan'); CH.act.setRoute(S, ms.g, R.b.id); ms.h = need(hire(S), 'hire').m; CH.act.setRoute(S, ms.h, R.a.id); }],
  [1200, () => { mk.led = need(found(S, 'Ledang', 1), 'Ledang').m; need(link(S, mk.led, mk.mua), 'trail led'); ms.i = need(hire(S), 'hire').m; R.i = route(S, ms.i, 'Gold run', [[mk.led], [mk.mua]]); }],
  [1800, () => { if (CH.advState(S, 'gold') === 'later') return false; need(CH.act.buyAdv(S, 'gold'), 'adv gold'); need(build(S, 'goldsmith', mk.mal), 'goldsmith'); }],
];
let step = 0;
for (let y = 0; y < YEARS; y++) {
  for (let t = 0; t < D.tpy; t++) {
    if (t % 30 === 0) while (step < steps.length && S.coins >= steps[step][0] + 150) { const before = S.coins; let r; try { r = steps[step][1](); } catch (e) { log.push(`${CH.year(S)} step ${step} THREW ${e.message}`); } if (r === false) break; log.push(`${CH.year(S)} step ${step} spent ${Math.round(before - S.coins)}`); step++; }
    if (t % 50 === 0) grant();
    if (STRICT) S.rt.forEach(r => { r.strict = 1; });
    if (t % 150 === 0 && !HANDS_OFF) S.ms.forEach(m => { const r = CH.routeOf(S, m.rt); if (r && r.stops.length > 1) tune(m, r); });
    CH.tick(S);
  }
  if (!QUIET || y % 5 === 4) {
    const pr = S.led.prev, n = k => Math.round(pr[k] || 0);
    console.log(CH.year(S), 'coins', String(Math.round(S.coins)).padStart(6), 'net', String(n('sales') + n('buys') + n('works') + n('wages')).padStart(5), `(trade ${n('sales') + n('buys')} works ${n('works')} wages ${n('wages')})`,
      '| pops', S.mk.map(m => m.name.slice(0, 3) + m.pop).join(' '), '| m', S.ms.map(m => (m.tr[0]) + Math.round(m.yr[1])).join(' '));
  }
}
console.log(log.join('\n'));
console.log('towns:'); S.mk.forEach(m => console.log('  ', town(S, m)));
console.log('merchants:'); S.ms.forEach(m => { const r = CH.routeOf(S, m.rt); console.log('  ', m.nm.padEnd(9), m.tr.padEnd(6), m.ab.padEnd(6), 'trips', String(m.trips).padStart(3), 'life', String(Math.round(m.pr)).padStart(6), m.st, m.why, r ? r.stops.map(s => CH.mkt(S, s.m).name.slice(0, 3) + ':' + Object.entries(s.ld).map(e => e[0].slice(0, 3) + e[1]).join(',')).join(' > ') : ''); });
console.log('works:'); S.bl.filter(b => D.bld[b.t].kind === 'works').forEach(b => console.log('  ', b.t.padEnd(9), b.own ? 'own' : 'loc', b.st, b.why, 'made', b.n, 'profit last yr', Math.round(b.pr[1])));
console.log('goals', Object.keys(S.goals).join(' '), '| cnt', JSON.stringify(S.cnt), '| rank', CH.rank(S.coins));
