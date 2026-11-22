// Shared helpers for scripted play: find sensible tiles the way a player would by eye.
const path = require('path');
require(path.join(__dirname, '../src/world.js'));
require(path.join(__dirname, '../src/sim.js'));
require(path.join(__dirname, '../src/learn.js'));
const CH = globalThis.CH, D = CH.DEF, WD = CH.genWorld(), W = D.W, H = D.H;
const I = (x, y) => y * W + x;
function place(name) { return D.places.find(p => p.n === name); }
function found(S, name, sz, spread = 2) {            // best-covering valid tile near the named place
  const p = place(name); let best = null, bs = -1;
  for (let dy = -spread; dy <= spread; dy++) for (let dx = -spread; dx <= spread; dx++) {
    const q = CH.can.market(S, p.x + dx, p.y + dy, sz); if (!q.ok) continue;
    const c = q.cover, sc = Object.values(c.sites).reduce((a, b) => a + b, 0) * 3 + c.houses + c.blds.length * 4 - Math.hypot(dx, dy) * 0.3;
    if (sc > bs) { bs = sc; best = [p.x + dx, p.y + dy]; }
  }
  if (!best) return { ok: false, why: CH.can.market(S, p.x, p.y, sz).why };
  return CH.act.market(S, best[0], best[1], sz);
}
function build(S, t, m, near) {                        // nearest valid tile to `near` (default: the market)
  const r = D.sizes[m.sz].r, nx = near ? near[0] : m.x, ny = near ? near[1] : m.y; let best = null, bd = 1e9, why = '';
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = m.x + dx, y = m.y + dy, q = CH.can.build(S, t, x, y); if (!q.ok) { why = why && /reach|ground|stands|path/.test(q.why) ? why : q.why; continue; }
    if (q.m !== m) continue;
    const d = Math.hypot(x - nx, y - ny); if (d < bd && d >= 1.2) { bd = d; best = [x, y]; }
  }
  if (!best) return { ok: false, why };
  return CH.act.build(S, t, best[0], best[1]);
}
function link(S, a, b, kind = 'trail') { return CH.act.path(S, kind, I(a.x, a.y), I(b.x, b.y)); }
function hire(S, want) { let k = 0; if (want) { const j = S.cand.findIndex(c => c.ab === want); if (j >= 0) k = j; } return CH.act.hire(S, k); }
function route(S, m, name, stops) {                    // stops: [market, {load}, unload='all']
  const R = CH.act.newRoute(S, name).R;
  stops.forEach((s, k) => { CH.act.addStop(S, R, s[0].id); for (const g in s[1] || {}) CH.act.setLoad(S, R, k, g, s[1][g]); if (s[2] && s[2] !== 'all') { CH.act.setUnload(S, R, k, null); for (const g in s[2]) CH.act.setUnload(S, R, k, g, s[2][g]); } });
  if (m) CH.act.setRoute(S, m, R.id);
  return R;
}
function run(S, ticks) { for (let i = 0; i < ticks; i++) CH.tick(S); }
function siteOf(m, t) { const s = WD.sites.find((s, k) => s.t === t && (s.x - m.x) ** 2 + (s.y - m.y) ** 2 <= D.sizes[m.sz].r ** 2 + D.sizes[m.sz].r); return s ? [s.x, s.y] : null; }
function town(S, m) { const n = CH.view.needs(S, m).map(q => q.g.slice(0, 2) + Math.round(q.sat * 9)).join(' '); return `${m.name} ${m.pop}h [${n}] mood ${CH.view.mood(S, m).k}`; }
module.exports = { CH, D, WD, I, place, found, build, link, hire, route, run, siteOf, town };
