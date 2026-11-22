// Throw random legal and illegal actions at the engine for decades, saving and reloading on the way.
// Fails loudly on an exception, a NaN, a negative stock or a merchant off the map.
const { CH, D, WD, I } = require('./kit');
CH.learn.strict = true;                               // a fault in the Lessons book stops the run instead of being swallowed
let seed = +process.argv[2] || 1; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
let S = CH.newGame({ seed: 99 + seed }); S.coins = 30000;
const stats = {};
const tally = (k, q) => { const s = stats[k] = stats[k] || [0, 0]; s[q && q.ok ? 0 : 1]++; };
function check(where) {
  if (!isFinite(S.coins)) throw new Error('coins not finite ' + where);
  for (const m of S.mk) { for (const g in m.stock) if (!(m.stock[g] >= 0) || m.stock[g] !== Math.floor(m.stock[g])) throw new Error(`bad stock ${g}=${m.stock[g]} at ${m.name} ${where}`); for (const g in m.sat) if (!(m.sat[g] >= 0 && m.sat[g] <= 1)) throw new Error('bad sat ' + where); if (m.pop !== S.hs.filter(h => h[2] === m.id).length) throw new Error('pop mismatch ' + m.name + ' ' + where); }
  for (const m of S.ms) { if (!(m.x >= 0 && m.x < D.W && m.y >= 0 && m.y < D.H)) throw new Error('merchant off map ' + where); for (const g in m.cargo) if (!(m.cargo[g] > 0)) throw new Error('bad cargo ' + where); if (CH.load(m) > CH.capFor(m, m.tr) + 0.001 && m.st !== 'idle') throw new Error('overloaded ' + m.nm + ' ' + where); }
}
const acts = [
  () => tally('market', CH.act.market(S, Math.floor(rnd() * D.W), Math.floor(rnd() * D.H), Math.floor(rnd() * 4))),
  () => { const p = pick(D.places); tally('market@place', CH.act.market(S, p.x + Math.floor(rnd() * 5) - 2, p.y + Math.floor(rnd() * 5) - 2, Math.floor(rnd() * 2))); },
  () => { if (!S.mk.length) return; const m = pick(S.mk), r = D.sizes[m.sz].r, t = pick(D.bldIds.filter(b => !D.bld[b].fixed)); tally('build', CH.act.build(S, t, m.x + Math.floor(rnd() * (2 * r + 1)) - r, m.y + Math.floor(rnd() * (2 * r + 1)) - r)); },
  () => { if (S.mk.length < 2) return; const a = pick(S.mk), b = pick(S.mk); tally('path', CH.act.path(S, pick(['trail', 'trail', 'road']), I(a.x, a.y), I(b.x, b.y))); },
  () => tally('path-rand', CH.act.path(S, 'trail', Math.floor(rnd() * D.W * D.H), Math.floor(rnd() * D.W * D.H))),
  () => tally('hire', CH.act.hire(S, Math.floor(rnd() * 3))),
  () => { if (S.ms.length > 6 && rnd() < 0.2) tally('dismiss', CH.act.dismiss(S, pick(S.ms))); },
  () => { if (!S.ms.length) return; tally('trans', CH.act.trans(S, pick(S.ms), pick(Object.keys(D.trans)))); },
  () => { if (!S.ms.length || S.mk.length < 2) return; const R = CH.act.newRoute(S).R, n = 2 + Math.floor(rnd() * 3); for (let k = 0; k < n; k++) { CH.act.addStop(S, R, pick(S.mk).id); } R.stops.forEach((s, k) => { for (let j = 0; j < 2; j++) CH.act.setLoad(S, R, k, pick(D.goodIds), 1 + Math.floor(rnd() * 5)); if (rnd() < 0.3) { CH.act.setUnload(S, R, k, null); CH.act.setUnload(S, R, k, pick(D.goodIds), 1 + Math.floor(rnd() * 3)); } }); tally('route', CH.act.setRoute(S, pick(S.ms), R.id)); },
  () => { if (!S.rt.length) return; const R = pick(S.rt), k = Math.floor(rnd() * 5); const f = pick([() => CH.act.delStop(S, R, Math.min(k, R.stops.length - 1)), () => CH.act.moveStop(S, R, k, rnd() < 0.5 ? 1 : -1), () => R.stops[k] && CH.act.setLoad(S, R, k, pick(D.goodIds), Math.floor(rnd() * 6)), () => rnd() < 0.1 && CH.act.delRoute(S, R), () => CH.act.strict(S, R, rnd() < 0.5), () => R.stops.length > 1 && CH.act.suggest(S, R), () => CH.act.own(S, R, k), () => CH.act.free(S, R, k), () => S.mk.length && CH.act.addStop(S, R, pick(S.mk).id)]); if (R.stops.length) tally('route-edit', f() || { ok: false }); },
  () => { if (S.ms.length && S.rt.length) tally('setroute', CH.act.setRoute(S, pick(S.ms), rnd() < 0.15 ? 0 : pick(S.rt).id)); },
  () => tally('adv', CH.act.buyAdv(S, pick(Object.keys(D.adv)))),
  () => { if (S.mk.length) tally('enlarge', CH.act.enlarge(S, pick(S.mk))); },
  () => { const b = pick(S.bl); if (D.bld[b.t].kind === 'works') tally('works', b.own ? CH.act.mode(S, b, pick(['auto', 'on', 'off'])) : CH.act.buyBld(S, b)); },
  () => { S.coins += 4000; }
];
const YEARS = +process.argv[3] || 70;
const draw = () => { const L = CH.learn; S.mk.forEach(m => D.goodIds.forEach(g => L.priceCard(S, m, g, Math.round(rnd() * 30 - 15)))); S.rt.forEach(R => R.stops.forEach((st, k) => { const m = S.ms.find(q => q.rt === R.id) || null; D.goodIds.forEach(g => L.legCard(S, R, k, g, m)); L.bestLeg(S, R, k, m); })); L.list.forEach(x => L.book(S, x.id)); S.bl.forEach(b => { if (D.bld[b.t].kind === 'works' && b.mk) { L.valueCard(S, D.bld[b.t], CH.mkt(S, b.mk)); L.payback(S, b); } }); };
for (let t = 0; t < YEARS * D.tpy; t++) {
  if (rnd() < 0.05) pick(acts)();
  CH.tick(S);
  if (t % 97 === 0) { check('tick ' + t); S.mk.forEach(m => CH.view.market(S, m)); S.rt.forEach(R => CH.view.route(S, R, S.ms[0])); }
  if (t % 997 === 0) draw();
  if (t % 2500 === 1200) { const txt = CH.serialize(S); S = CH.revive(JSON.parse(txt)); CH.tick(S); check('after reload ' + t); }
}
console.log('seed', seed, 'ok:', CH.year(S), 'markets', S.mk.length, 'merchants', S.ms.length, 'houses', S.hs.length, 'paths', Object.keys(S.path).length, 'save', (CH.serialize(S).length / 1024).toFixed(0) + 'KB');
console.log(Object.entries(stats).map(([k, v]) => `${k} ${v[0]}/${v[0] + v[1]}`).join(', '));
console.log('merchant states', JSON.stringify(S.ms.reduce((a, m) => (a[m.tr + ':' + m.st] = (a[m.tr + ':' + m.st] || 0) + 1, a), {})));
