// The Lessons book and its charts, checked against a long scripted game: every lesson that is noticed must tell
// itself with sound figures, and every chart the interface can ask for must come back whole.
//   node test/learn.js [years] [-v]     -v prints each lesson as the player would read it
const YEARS = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : '60', LOUD = process.argv.includes('-v');
process.argv = [process.argv[0], 'bot', YEARS, '-q', '--auto'];
const { CH, D } = require('./kit');
CH.learn.strict = true;                               // a fault in a lesson stops the test instead of being swallowed
const quiet = console.log; console.log = () => {};    // the scripted player prints its own diary; not wanted here
const { S } = require('./bot');
console.log = quiet;
const L = CH.learn, bad = /NaN|undefined|Infinity|\[object|null/;
const text = h => h.replace(/<\/(dd|p|figcaption)>/g, ' | ').replace(/<svg[\s\S]*?<\/svg>/g, ' [chart] ').replace(/<table[\s\S]*?<\/table>/g, ' [table] ').replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
let checks = 0, fails = 0;
function ok(what, html, need) {
  checks++;
  const m = bad.exec(html), open = (html.match(/<(div|p|svg|figure|table|span|b|button)\b/g) || []).length, close = (html.match(/<\/(div|p|svg|figure|table|span|b|button)>/g) || []).length;
  if (m || open !== close || (need && !need.test(html))) { fails++; console.log('FAIL', what, m ? 'has ' + m[0] : open !== close ? `tags ${open}/${close}` : 'lacks ' + need, '\n   ', html.slice(0, 300)); }
}
// every good at every market, with and without a trade tried on it
S.mk.forEach(m => D.goodIds.forEach(g => [0, 3, -2, 40, -40].forEach(n => ok(`price ${m.name} ${g} ${n}`, L.priceCard(S, m, g, n), /kcard/))));
// who uses and who makes each good must add up to the engine's own demand and supply; merchants' net trade is whole loads on one side
S.mk.forEach(m => { const f = CH.flows(S, m), rows = CH.view.market(S, m); D.goodIds.forEach(g => { const w = L.parts(S, m, g), sum = a => a.reduce((t, q) => t + q[1], 0); checks++; if (Math.abs(sum(w.use) - (f.c[g] || 0)) > 1e-6 || Math.abs(sum(w.make) - (f.p[g] || 0)) > 1e-6) { fails++; console.log('FAIL parts', m.name, g, sum(w.use), f.c[g], sum(w.make), f.p[g]); } }); rows.forEach(w => { checks++; if (!(w.imp >= 0 && w.exp >= 0 && w.imp * w.exp === 0 && w.imp % 1 === 0 && w.exp % 1 === 0)) { fails++; console.log('FAIL trade', m.name, w.g, w.imp, w.exp); } }); });
const moved = S.mk.reduce((t, m) => t + (m.tf ? Object.keys(m.tf.c.i).length + Object.keys(m.tf.p.i).length + Object.keys(m.tf.c.o).length + Object.keys(m.tf.p.o).length : 0), 0);
checks++; if (!moved) { fails++; console.log('FAIL no merchant trade recorded at any market'); }
// every stop of every route, for every good in stock there
let legs = 0, paying = 0;
S.rt.forEach(R => R.stops.forEach((st, k) => { const A = CH.mkt(S, st.m), m = S.ms.find(q => q.rt === R.id) || null; D.goodIds.forEach(g => { if (!(A.stock[g] >= 1)) return; const h = L.legCard(S, R, k, g, m); ok(`leg ${R.name} ${k} ${g}`, h, /kcard/); legs++; if (/profitable loads?: /.test(h)) paying++; }); L.bestLeg(S, R, k, m); }));
// a leg's sums must agree with the engine's own estimate of what a merchant left to himself would load
let agree = 0, differ = 0;
S.ms.forEach(m => { const R = m.rt && CH.routeOf(S, m.rt); if (!R || R.stops.length !== 2 || !R.stops.every(s => s.auto)) return; const est = CH.view.route(S, R, m); R.stops.forEach((st, k) => { const got = est.stops[k].got, gs = Object.keys(got); if (gs.length !== 1) return; const A = CH.mkt(S, st.m), B = CH.outlet(S, R, k, gs[0]), q = L.legOf(S, A, B, gs[0], L.terms(S, m, true)); if (Math.min(q.n, L.terms(S, m).cap) === got[gs[0]]) agree++; else { differ++; console.log('DIFFER', m.nm, gs[0], 'chart says', q.n, 'engine loads', got[gs[0]]); } }); });
S.bl.forEach(b => { const d = D.bld[b.t]; if (d.kind === 'works' && b.mk) { ok('value ' + b.t, L.valueCard(S, d, CH.mkt(S, b.mk)), /vbar/); ok('payback ' + b.t, L.payback(S, b) || '<p></p>'); } });
// the book itself, closed and opened at every lesson seen
ok('book closed', L.book(S, ''), /book/);
const seen = L.list.filter(x => S.les && S.les[x.id]);
seen.forEach(x => {
  const h = L.book(S, x.id), body = /data-open="1">([\s\S]*?)<\/li>/.exec(h);
  ok('lesson ' + x.id, h, /ls-b/);
  if (LOUD && body) console.log(`\n== ` + text(body[1]) + '\n   notice: ' + S.news.concat(S.old || []).filter(n => n.l === x.id).map(n => n.s).join('') );
});
console.log(`${checks} checks, ${fails} failed | ${S.mk.length} markets, ${legs} legs (${paying} paying), estimate agrees on ${agree} stops, differs on ${differ}`);
console.log('lessons seen by ' + CH.year(S) + ': ' + L.list.map(x => S.les && S.les[x.id] ? x.id + ' ' + (D.span[0] + Math.floor(S.les[x.id].t / D.tpy)) : x.id + ' -').join(', '));
console.log('notices: ' + S.news.filter(n => n.k === 'lesson').length + ' of the last ' + S.news.length + ' are lessons; unread ' + L.unread(S) + ', book opens at ' + L.latest(S));
if (fails || differ) process.exit(1);
