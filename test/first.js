// The opening a new player would try: Malacca, a potter, Merlimau for salt and fish, one porter team.
const { CH, D, found, build, link, hire, route, run, siteOf, town } = require('./kit');
const S = CH.newGame();
const say = (l, q) => console.log(l.padEnd(26), q.ok ? 'ok' : 'NO: ' + q.why, 'coins', Math.round(S.coins));
let q = found(S, 'Malacca', 1); say('found Malacca', q); const mal = q.m;
console.log('  cover', JSON.stringify(CH.cover(S, mal.x, mal.y, 1, mal.id)), 'pop', mal.pop, 'at', mal.x, mal.y);
say('build potter', build(S, 'potter', mal, siteOf(mal, 'clay')));
q = found(S, 'Merlimau', 0); say('found Merlimau post', q); const mer = q.m;
console.log('  sites', S.st.filter(s => s.mk === mer.id).length, 'at', mer.x, mer.y);
say('trail', link(S, mal, mer));
q = hire(S); say('hire', q); const a = q.m;
const R = route(S, a, 'Salt run', [[mer, { fish: 2, salt: 2 }], [mal, { cloth: 1 }]]);
for (let y = 0; y < 12; y++) {
  run(S, D.tpy);
  const est = CH.view.route(S, R, a);
  console.log(CH.year(S), 'coins', Math.round(S.coins).toString().padStart(5), '|', town(S, mal), '|', town(S, mer), '|', a.nm, 'trips', a.trips, 'last', a.last == null ? '-' : Math.round(a.last), 'est', Math.round(est.total), a.st, a.why);
}
console.log('Malacca market:'); CH.view.market(S, mal).forEach(r => console.log('  ', r.g.padEnd(8), 'stock', String(r.s).padStart(3), 'price', r.price.toFixed(1).padStart(6), 'x' + r.mult.toFixed(2), 'uses', r.c.toFixed(1), 'makes', r.p.toFixed(1)));
console.log('Merlimau market:'); CH.view.market(S, mer).forEach(r => console.log('  ', r.g.padEnd(8), 'stock', String(r.s).padStart(3), 'price', r.price.toFixed(1).padStart(6), 'x' + r.mult.toFixed(2), 'uses', r.c.toFixed(1), 'makes', r.p.toFixed(1)));
console.log('news:'); S.news.slice(-8).forEach(n => console.log('  ', D.span[0] + Math.floor(n.t / D.tpy), n.s));
console.log('ledger last year', JSON.stringify(Object.fromEntries(Object.entries(S.led.prev).map(([k, v]) => [k, Math.round(v)]))));
