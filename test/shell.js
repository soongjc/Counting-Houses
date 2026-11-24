// What the game shell leans on: a company name and a difficulty on every game, a summary a save list can show, old saves that still open, and the events the sound engine listens for.
const { CH, D, found, hire, link, route, run } = require('./kit');
let checks = 0, fails = 0;
const ok = (what, cond, got) => { checks++; if (!cond) { fails++; console.log('FAIL', what, got === undefined ? '' : JSON.stringify(got)); } };

const a = CH.newGame();
ok('default game is normal', a.name === D.company && a.diff === 'normal' && a.fee === 0.05 && a.coins === 2500, [a.name, a.diff, a.fee, a.coins]);
Object.keys(D.diffs).forEach(k => {
  const d = D.diffs[k], S = CH.newGame({ seed: 5, name: 'Tin & Pepper Co', diff: k });
  ok(k + ': coins, fee, name', S.coins === d.coins && CH.fee(S) === d.fee && S.name === 'Tin & Pepper Co', [S.coins, S.fee, S.name]);
  D.goals.forEach(g => ok(k + ': reward ' + g.id, CH.reward(S, g) === Math.round(g.r * d.goal), CH.reward(S, g)));
  const s = CH.summary(S); ok(k + ': summary', s.name === S.name && s.diff === k && s.year === D.span[0] && s.coins === d.coins && s.rank === D.ranks[0][1] && s.pop === 0 && !s.over, s);
  // a first sale pays the base price less this game's fee; the goal pays this difficulty's reward
  const mal = found(S, 'Malacca', 1).m, nan = found(S, 'Naning', 0).m; S.coins = 20000; link(S, mal, nan); const m = hire(S).m; route(S, m, 'Test', [[nan, {}], [mal, {}]]);
  let paid = null; for (let i = 0; i < D.tpy * 3; i++) { CH.tick(S); const n = S.news[S.news.length - 1]; if (paid === null && n && n.k === 'goal' && /trip/.test(n.s)) { const r = /Reward: \+(\d+) coins/.exec(n.s); paid = r ? +r[1] : 0; } }
  ok(k + ': a trip was made', m.trips > 0, m.trips);
  ok(k + ': the trip goal paid this difficulty\'s reward', paid === Math.round(D.goals.find(g => g.id === 'trip').r * d.goal), paid);
  const again = CH.revive(JSON.parse(CH.serialize(S))); ok(k + ': a save keeps its difficulty', again.diff === k && again.fee === d.fee && again.name === S.name);
});
ok('an unknown difficulty plays as normal', CH.newGame({ diff: 'brutal' }).diff === 'normal');
ok('a long name is cut', CH.newGame({ name: 'x'.repeat(80) }).name.length === 32);

// a higher fee leaves less from the same sale
const pay = k => { const S = CH.newGame({ seed: 5, diff: k }), mal = found(S, 'Malacca', 1).m, nan = found(S, 'Naning', 0).m; S.coins = 20000; link(S, mal, nan); const m = hire(S).m; route(S, m, 'Test', [[nan, {}], [mal, {}]]); run(S, D.tpy * 4); return (S.led.cur.sales || 0) + (S.led.prev.sales || 0); };
const pe = pay('easy'), ph = pay('hard'); ok('sales happen at every difficulty', pe > 0 && ph > 0, [pe, ph]);

// a save from before games had a name, a difficulty or trade records still opens, with the defaults
const old = JSON.parse(CH.serialize(CH.newGame({ seed: 9 }))); delete old.name; delete old.diff; delete old.fee;
const back = CH.revive(old); ok('old save: defaults', back.name === D.company && back.diff === 'normal' && back.fee === 0.05, [back.name, back.diff, back.fee]);
let threw = false; try { CH.revive({ v: 2 }); } catch (e) { threw = true; } ok('a save from another version is refused', threw);

// the sound queue: trades and new houses are reported with a place, and the queue stays short when nobody empties it
const S = CH.newGame({ seed: 5 }), mal = found(S, 'Malacca', 1).m, nan = found(S, 'Naning', 0).m; S.coins = 20000; link(S, mal, nan); const m = hire(S).m; route(S, m, 'Test', [[nan, {}], [mal, {}]]);
const kinds = {}; for (let i = 0; i < D.tpy * 6; i++) { CH.tick(S); const q = CH.rt(S).snd; ok('queue stays short', q.length <= 24, q.length); while (q.length) { const e = q.shift(); kinds[e.k] = (kinds[e.k] || 0) + 1; if (typeof e.x !== 'number' || typeof e.y !== 'number') ok('event has a place', false, e); if (e.k === 'trade' && !(e.sold >= 0 && typeof e.net === 'number')) ok('trade event has amounts', false, e); } }
ok('trades are heard', kinds.trade > 0, kinds); ok('new houses are heard', kinds.house > 0, kinds);
for (let i = 0; i < D.tpy * 2; i++) CH.tick(S); ok('an unread queue is capped', CH.rt(S).snd.length <= 24, CH.rt(S).snd.length);
ok('the yearly history grows', S.hist.length === 8, S.hist.length);

console.log(checks + ' checks, ' + fails + ' failed | events heard in 6 years: ' + JSON.stringify(kinds));
process.exit(fails ? 1 : 0);
