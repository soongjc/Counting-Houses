/* Counting House — the engine. Pure logic: no drawing, no DOM. The whole game is one plain-JSON object. */
(function (root) {
  'use strict';
  var CH = root.CH, D = CH.DEF, T = D.T, W = D.W, H = D.H, N = W * H, TPY = D.tpy, G = D.goods;
  var WD = CH.genWorld();
  /* TMIN/HOR: a market's comfortable stock of a good is HOR years of its trade, never less than TMIN loads.
     Price is twice the base on bare shelves, the base at the comfortable stock, half the base at three times it. */
  var K = CH.K = { TMIN: 2, HOR: 0.5, DUES: 0.05, NOSELL: 0.4, DWELL: 5, PATIENCE: 60, CREDIT: -1500, SATK: 1 / 90, GROW: 20, FREE: 15, LATENT: 2, RESALE: 0.5, GLUT: 1, EDGE: 1 };
  var DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

  function I(x, y) { return y * W + x; }
  function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function rnd(S) { var t = (S.rs = (S.rs + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function year(S) { return D.span[0] + Math.floor(S.tick / TPY); }
  function ter(S, i) { var t = WD.terr[i]; return t === T.FOREST && S.clear[i] ? T.GRASS : t; }
  function isLand(t) { return t === T.GRASS || t === T.FOREST || t === T.HILL; }
  function live(S, e) { return (!e.from || !!S.flags[e.from]) && !(e.until && S.flags[e.until]); }
  function mkt(S, id) { return S.mk[id - 1]; }
  function has(S, a) { return !a || !!S.adv[a]; }
  function say(S, s, k, x, y) { S.news.push({ t: S.tick, s: s, k: k || '', x: x, y: y }); if (S.news.length > 40) S.news.shift(); S.nn = (S.nn || 0) + 1; }
  function pay(S, n, cat) { S.coins -= n; S.led.cur[cat] = (S.led.cur[cat] || 0) - n; }
  function earn(S, n, cat) { S.coins += n; S.led.cur[cat] = (S.led.cur[cat] || 0) + n; }
  function no(why) { return { ok: false, why: why }; }
  function fee(S) { return S.fee == null ? K.DUES : S.fee; }      // the market fee of this game: its difficulty sets it
  function short(S, cost) { return 'Needs ' + cost + ' coins. You have ' + Math.floor(S.coins) + '.'; }
  var OK = { ok: true };

  /* ---------- lookups rebuilt from the state, never saved ---------- */
  function disc(cx, cy, r, fn) { for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) { if (dx * dx + dy * dy > r * r + r) continue; var x = cx + dx, y = cy + dy; if (inb(x, y)) fn(I(x, y), x, y); } }
  function rt(S) {
    if (S.__rt) return S.__rt;
    var r = { own: new Int16Array(N), at: new Array(N), pv: 1, tv: 1, fl: {}, sp: {}, pc: {}, pcv: 0, dirty: [], fx: [], snd: [] };
    Object.defineProperty(S, '__rt', { value: r, enumerable: false, writable: true });
    WD.sites.forEach(function (s, k) { r.at[I(s.x, s.y)] = { k: 'site', i: k }; });
    r.at[I(WD.hq.x, WD.hq.y)] = { k: 'hq' };
    S.bl.forEach(function (b) { r.at[I(b.x, b.y)] = { k: 'bld', b: b }; });
    S.hs.forEach(function (h) { r.at[I(h[0], h[1])] = { k: 'house', h: h }; });
    S.mk.forEach(function (m) { r.at[I(m.x, m.y)] = { k: 'mkt', m: m }; disc(m.x, m.y, D.sizes[m.sz].r, function (i) { r.own[i] = m.id; }); });
    return r;
  }
  function clearTile(S, i) { if (WD.terr[i] === T.FOREST && !S.clear[i]) { S.clear[i] = 1; rt(S).dirty.push(i); } }

  /* ---------- what a market trades, and so what things cost there ---------- */
  function flows(S, m) {            // loads a year the market uses (c) and makes (p)
    var r = rt(S), f = r.fl[m.id];
    if (f && f.v === r.tv) return f;
    f = r.fl[m.id] = { v: r.tv, c: {}, p: {} };
    function add(o, g, n) { o[g] = (o[g] || 0) + n; }
    var pop = Math.max(m.pop, K.LATENT);
    D.house.forEach(function (e) { if (live(S, e)) add(f.c, e.g, pop * TPY / e.per); });
    WD.sites.forEach(function (s, k) { if (S.st[k].mk !== m.id) return; var d = D.sites[s.t]; if (live(S, d)) add(f.p, d.g, TPY / d.per); });
    S.bl.forEach(function (b) {
      if (b.mk !== m.id) return; var d = D.bld[b.t], g;
      if (d.kind === 'works') { if (b.own && b.mode === 'off') return; for (g in d.inp) add(f.c, g, d.inp[g] * TPY / d.time); for (g in d.out) add(f.p, g, d.out[g] * TPY / d.time); }
      else if (d.kind === 'demand') { d.want.forEach(function (e) { if (live(S, e)) add(f.c, e.g, TPY / e.per); }); (d.land || []).forEach(function (e) { add(f.p, e.g, TPY / e.per); }); }
    });
    return f;
  }
  function tOf(f, g) { var c = f.c[g] || 0, p = f.p[g] || 0; return (c > 0 || p > 0) ? Math.max(K.TMIN, K.HOR * Math.max(c, p)) : 0; }
  function mult(t, s) { var q = 2 * t / ((s > 0 ? s : 0) + t); return q > 2 ? 2 : q < 0.5 ? 0.5 : q; }
  function price(S, m, g) { var t = tOf(flows(S, m), g); return G[g].p * (t ? mult(t, m.stock[g] || 0) : 0.5); }
  /* what the market pays for the next load, and asks for the next load; dl = loads already added (+) or taken (-) */
  function sellP(S, m, g, dl) { var t = tOf(flows(S, m), g); return G[g].p * (t ? mult(t, (m.stock[g] || 0) + (dl || 0) + 0.5) : K.NOSELL); }
  function buyP(S, m, g, dl) { var t = tOf(flows(S, m), g); return G[g].p * (t ? mult(t, (m.stock[g] || 0) + (dl || 0) - 0.5) : 0.5); }

  /* ---------- markets ---------- */
  function nameFor(S, x, y) {
    var used = {}, best = null, bd = 1e9, i; S.mk.forEach(function (m) { used[m.name] = 1; });
    D.places.forEach(function (p) { var d = Math.hypot(p.x - x, p.y - y); if (!used[p.n] && d < bd) { bd = d; best = p.n; } });
    if (best && bd <= 9) return best;
    for (i = 0; i < D.spare.length; i++) if (!used[D.spare[i]]) return D.spare[i];
    return 'Market ' + (S.mk.length + 1);
  }
  function cover(S, x, y, sz, skip) {   // what a market of this size here would take in, and which market it would run into
    var r = rt(S), c = { sites: {}, houses: 0, blds: [], clash: 0 };
    disc(x, y, D.sizes[sz].r, function (i) {
      if (r.own[i] && r.own[i] !== skip) c.clash = r.own[i];
      var o = r.at[i]; if (!o) return;
      if (o.k === 'site' && !S.st[o.i].mk) { var t = WD.sites[o.i].t; if (live(S, D.sites[t])) c.sites[t] = (c.sites[t] || 0) + 1; }
      else if (o.k === 'house' && !o.h[2]) c.houses++;
      else if (o.k === 'bld' && !o.b.mk) c.blds.push(o.b.t);
    });
    return c;
  }
  function take(S, m) {                  // bring everything inside the market's reach under it
    var r = rt(S), n = 0;
    disc(m.x, m.y, D.sizes[m.sz].r, function (i) {
      r.own[i] = m.id; var o = r.at[i]; if (!o) return;
      if (o.k === 'site' && !S.st[o.i].mk) S.st[o.i].mk = m.id;
      else if (o.k === 'house' && !o.h[2]) { o.h[2] = m.id; m.pop++; n++; }
      else if (o.k === 'bld' && !o.b.mk) o.b.mk = m.id;
    });
    D.house.forEach(function (e) {                     // a hamlet brings a year of its own stores with it
      if (m.sat[e.g] == null) m.sat[e.g] = m.pop ? 0.8 : 0;
      if (n && live(S, e)) m.stock[e.g] = (m.stock[e.g] || 0) + Math.ceil(n * TPY / e.per);
    });
    r.tv++; r.pv++;
  }
  CH.can = {}; CH.act = {};
  CH.can.market = function (S, x, y, sz) {
    if (!inb(x, y)) return no('Outside the map.');
    var r = rt(S), i = I(x, y), d = D.sizes[sz];
    if (!has(S, d.adv)) return no('Requires research: ' + D.adv[d.adv].n + '.');
    if (!isLand(ter(S, i))) return no('Build on land.');
    if (r.at[i]) return no('Tile occupied.');
    var c = cover(S, x, y, sz, 0);
    if (c.clash) return no('Range overlaps ' + mkt(S, c.clash).name + '. Build further away.');
    if (S.coins < d.cost) return no(short(S, d.cost));
    return { ok: true, cover: c, cost: d.cost };
  };
  CH.act.market = function (S, x, y, sz) {
    var q = CH.can.market(S, x, y, sz); if (!q.ok) return q;
    var r = rt(S), i = I(x, y), m = { id: S.mk.length + 1, x: x, y: y, sz: sz, name: nameFor(S, x, y), stock: {}, need: {}, sat: {}, pop: 0, t0: S.tick, full: 0 };
    S.mk.push(m); r.at[i] = { k: 'mkt', m: m }; clearTile(S, i);
    pay(S, q.cost, 'build'); take(S, m);
    say(S, m.name + ' founded.', 'good', x, y);
    return { ok: true, m: m };
  };
  CH.can.enlarge = function (S, m) {
    if (m.sz >= D.sizes.length - 1) return no('Maximum size reached.');
    var d = D.sizes[m.sz + 1], cost = d.cost - D.sizes[m.sz].cost;
    if (!has(S, d.adv)) return no('Requires research: ' + D.adv[d.adv].n + '.');
    var c = cover(S, m.x, m.y, m.sz + 1, m.id);
    if (c.clash) return no('Blocked: the larger range overlaps ' + mkt(S, c.clash).name + '.');
    if (S.coins < cost) return no(short(S, cost));
    return { ok: true, cost: cost, cover: c };
  };
  CH.act.enlarge = function (S, m) {
    var q = CH.can.enlarge(S, m); if (!q.ok) return q;
    m.sz++; m.full = 0; pay(S, q.cost, 'build'); take(S, m);
    say(S, m.name + ' upgraded to ' + D.sizes[m.sz].n.toLowerCase() + '.', 'good', m.x, m.y);
    return OK;
  };

  /* ---------- buildings ---------- */
  function waterBy(x, y, navOnly) {      // a water tile on one of the four sides, the sea for preference
    var best = -1;
    for (var k = 0; k < 4; k++) {
      var nx = x + DX[k], ny = y + DY[k]; if (!inb(nx, ny)) continue;
      var j = I(nx, ny), t = WD.terr[j];
      if ((t !== T.SEA && t !== T.RIVER) || (navOnly && !WD.nav[j])) continue;
      if (best < 0 || t === T.SEA) best = j;
    }
    return best;
  }
  function mkBld(S, t, x, y, own) {
    var b = { id: S.nid++, t: t, x: x, y: y, mk: 0, own: own, mode: 'auto', st: 'idle', left: 0, need: {}, pr: [0, 0], why: '', n: 0 };
    if (t === 'harbour') { var w = waterBy(x, y, true); b.wx = w % W; b.wy = (w / W) | 0; }
    return b;
  }
  function depot(S, mk, t) { for (var i = 0; i < S.bl.length; i++) if (S.bl[i].mk === mk.id && S.bl[i].t === t) return S.bl[i]; return null; }
  CH.can.build = function (S, t, x, y) {
    var d = D.bld[t]; if (!inb(x, y)) return no('Outside the map.');
    var r = rt(S), i = I(x, y);
    if (!has(S, d.adv)) return no('Requires research: ' + D.adv[d.adv].n + '.');
    if (!isLand(ter(S, i))) return no('Build on land.');
    if (r.at[i]) return no('Tile occupied.');
    if (S.path[i]) return no('Tile occupied by a path.');
    var m = mkt(S, r.own[i]); if (!m) return no('Build inside a market’s range.');
    if (d.water && waterBy(x, y, t === 'harbour') < 0) return no(t === 'harbour' ? 'Build on the shore of the sea or the lower river.' : 'Build next to water.');
    if (d.kind !== 'works' && depot(S, m, t)) return no('Limit: 1 ' + d.n.toLowerCase() + ' per market.');
    if (S.coins < d.cost) return no(short(S, d.cost));
    return { ok: true, m: m, cost: d.cost };
  };
  CH.act.build = function (S, t, x, y) {
    var q = CH.can.build(S, t, x, y); if (!q.ok) return q;
    var r = rt(S), b = mkBld(S, t, x, y, 1); b.mk = q.m.id; S.bl.push(b); r.at[I(x, y)] = { k: 'bld', b: b }; clearTile(S, I(x, y));
    pay(S, q.cost, 'build'); r.tv++; r.pv++;
    if (D.bld[t].kind === 'works') S.cnt.works = (S.cnt.works || 0) + 1;
    return { ok: true, b: b };
  };
  CH.buyCost = function (b) { return Math.round((D.bld[b.t].cost || 0) * K.RESALE); };
  CH.act.buyBld = function (S, b) {
    var cost = CH.buyCost(b);
    if (b.own || D.bld[b.t].kind !== 'works') return no('Already owned.');
    if (!b.mk) return no('Outside market range.');
    if (S.coins < cost) return no(short(S, cost));
    b.own = 1; pay(S, cost, 'build'); S.cnt.works = (S.cnt.works || 0) + 1; rt(S).tv++;
    return OK;
  };
  CH.act.mode = function (S, b, mode) { if (!b.own) return no('Buy the workshop first.'); b.mode = mode; if (b.st !== 'run') b.st = 'idle'; rt(S).tv++; return OK; };

  /* ---------- finding a way ---------- */
  function search(a, b, enter, flat, wall) {   // cheapest way from tile a to tile b. enter(i) = cost of stepping onto i, 0 where nobody can step
    if (a === b) return [a];
    var dist = new Float64Array(N).fill(1e30), prev = new Int32Array(N).fill(-1), hk = [0], hv = [a], n = 1;
    dist[a] = 0;
    while (n) {
      var d = hk[0], u = hv[0]; n--;
      if (n) { var lk = hk[n], lv = hv[n], p = 0; for (;;) { var c = 2 * p + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[p] = hk[c]; hv[p] = hv[c]; p = c; } hk[p] = lk; hv[p] = lv; }
      if (d > dist[u]) continue;
      if (u === b) break;
      var ux = u % W, uy = (u / W) | 0;
      for (var k = 0; k < 8; k++) {
        var x = ux + DX[k], y = uy + DY[k]; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        var v = y * W + x, e = enter(v); if (!(e > 0)) continue;
        if (k > 3 && wall(uy * W + x) && wall(y * W + ux)) continue;                         // no squeezing between two walls
        var nd = d + (flat ? e + (k > 3 ? 0.07 : 0.05) : e * (k > 3 ? 1.4142 : 1));
        if (nd < dist[v]) {
          dist[v] = nd; prev[v] = u;
          var q = n++; while (q > 0) { var par = (q - 1) >> 1; if (hk[par] <= nd) break; hk[q] = hk[par]; hv[q] = hv[par]; q = par; } hk[q] = nd; hv[q] = v;
        }
      }
    }
    if (prev[b] < 0) return null;
    var out = []; for (var t = b; t !== -1; t = prev[t]) out.push(t);
    return out.reverse();
  }
  function landWall(i) { var t = WD.terr[i]; return t === T.SEA || t === T.MOUNT; }
  function seaWall(i) { return !WD.nav[i]; }
  function grid(S, cls) {                // how fast each kind of transporter crosses each tile, as a share of its own pace; 0 = cannot
    var r = rt(S), g = r.sp[cls];
    if (g && g.v === r.pv) return g.a;
    var a = new Float32Array(N), foot = cls === 'foot';
    for (var i = 0; i < N; i++) {
      var t = ter(S, i), p = S.path[i] | 0, o = r.at[i], v = 0, hub = o && (o.k === 'mkt' || o.k === 'hq');
      if (cls === 'boat') v = WD.nav[i] ? (t === T.SEA ? 1 : 0.8) : 0;
      else if (cls === 'deep') v = t === T.SEA ? 1 : 0;
      else if (cls === 'cart') v = (p === 2 || hub) ? 1 : 0;
      else if (t !== T.SEA && t !== T.MOUNT) {
        if (p === 2) v = foot ? 1.25 : 1.1;
        else if (p === 1 || hub) v = 1;
        else if (t === T.RIVER) v = foot ? 0.12 : 0.3;
        else { v = foot ? (t === T.GRASS ? 0.5 : t === T.FOREST ? 0.36 : 0.3) : (t === T.GRASS ? 0.8 : t === T.FOREST ? 0.7 : 0.55); if (o && (o.k === 'bld' || o.k === 'site')) v *= 0.5; }
      }
      a[i] = v;
    }
    r.sp[cls] = { v: r.pv, a: a };
    return a;
  }
  function way(S, cls, a, b) {
    var r = rt(S); if (r.pcv !== r.pv) { r.pc = {}; r.pcv = r.pv; }
    var key = cls + ':' + a + ':' + b, c = r.pc[key];
    if (c !== undefined) return c;
    var sp = grid(S, cls);
    return (r.pc[key] = search(a, b, function (i) { var v = sp[i]; return v > 0 ? 1 / v : 0; }, false, cls === 'boat' || cls === 'deep' ? seaWall : landWall));
  }
  function layCost(S, kind, i) {         // coins to lay this kind of path on one tile; -1 where none can go; 0 where it is laid already
    var t = WD.terr[i], o = rt(S).at[i], d = D.path[kind], have = S.path[i] | 0;
    if (t === T.SEA || t === T.MOUNT) return -1;
    if (o && o.k !== 'mkt' && o.k !== 'hq' && o.k !== 'house') return -1;      // a house will move aside; nothing else will
    if (have >= d.code) return 0;
    var c = d.cost * (t === T.RIVER ? 6 : t === T.HILL ? 2.5 : (t === T.FOREST && !S.clear[i]) ? 1.5 : 1);
    if (have) c -= D.path.trail.cost * 0.5;
    return Math.round(c);
  }
  CH.planPath = function (S, kind, a, b) {
    var d = D.path[kind];
    if (!has(S, d.adv)) return no('Requires research: ' + D.adv[d.adv].n + '.');
    if (layCost(S, kind, a) < 0) return no('Start on open ground or at a market.');
    if (layCost(S, kind, b) < 0) return no('End on open ground or at a market.');
    var at = rt(S).at, tiles = search(a, b, function (i) { var c = layCost(S, kind, i); return c < 0 ? 0 : c + 0.3 + (at[i] && at[i].k === 'house' ? 5 : 0); }, true, landWall);
    if (!tiles) return no('Path blocked by terrain.');
    var cost = 0, n = 0; tiles.forEach(function (i) { var c = layCost(S, kind, i); if (c > 0) { cost += c; n++; } });
    return { ok: true, tiles: tiles, cost: cost, n: n };
  };
  CH.act.path = function (S, kind, a, b) {
    var q = CH.planPath(S, kind, a, b); if (!q.ok) return q;
    if (!q.n) return no('Already built.');
    if (S.coins < q.cost) return no(short(S, q.cost));
    var code = D.path[kind].code;
    var r = rt(S);
    q.tiles.forEach(function (i) {
      var o = r.at[i];
      if (o && o.k === 'house') { var hm = mkt(S, o.h[2]); S.hs.splice(S.hs.indexOf(o.h), 1); r.at[i] = null; if (hm) hm.pop--; S.path[i] = code; if (hm) addHouse(S, hm, true); }
      if ((S.path[i] | 0) < code) S.path[i] = code; clearTile(S, i);
    });
    pay(S, q.cost, 'build'); r.pv++; r.tv++; S.cnt[kind] = (S.cnt[kind] || 0) + q.n;
    return { ok: true, cost: q.cost, n: q.n };
  };

  /* ---------- merchants ---------- */
  function hireCost(S) {              // a house with no merchant at all can always find one for nothing
    return !S.ms.length ? 0 : Math.min(D.hire.max, Math.round(D.hire.base * Math.pow(D.hire.grow, Math.max(0, S.hired - 1)) / 10) * 10);
  }
  function rollCands(S) {
    var used = {}, abs = Object.keys(D.abil), out = [];
    S.ms.forEach(function (m) { used[m.nm] = 1; });
    while (out.length < 3) { var nm = D.names[Math.floor(rnd(S) * D.names.length)]; if (used[nm]) continue; used[nm] = 1; out.push({ nm: nm, ab: abs[Math.floor(rnd(S) * abs.length)] }); }
    S.cand = out;
  }
  function capFor(m, t) { var c = D.trans[t].cap; return m.ab === 'load' ? Math.floor(c * 1.25) : c; }
  function load(m) { var n = 0; for (var g in m.cargo) n += m.cargo[g]; return n; }
  function routeOf(S, id) { for (var i = 0; i < S.rt.length; i++) if (S.rt[i].id === id) return S.rt[i]; return null; }
  function where(S, m) { return m.st === 'go' ? null : m.at ? mkt(S, m.at) : m.hq ? 'hq' : null; }   // where a standing merchant is
  CH.act.hire = function (S, k) {
    var c = S.cand[k], cost = hireCost(S); if (!c) return no('Candidate unavailable.');
    if (S.ms.length >= D.hire.cap) return no('Merchant limit reached: ' + D.hire.cap + '.');
    if (S.coins < cost) return no(short(S, cost));
    var m = { id: S.nid++, nm: c.nm, ab: c.ab, tr: 'porter', x: WD.hq.x, y: WD.hq.y, rt: 0, si: 0, st: 'idle', path: null, pi: 0, pf: 0, cargo: {}, got: {}, sold: 0, w: 0, dw: 0, at: 0, hq: 1,
      pr: 0, yr: [0, 0], round: 0, last: null, trips: 0, why: '', dir: 1, re: 0, qt: null };
    S.ms.push(m); S.hired++; pay(S, cost, 'hire'); rollCands(S);
    return { ok: true, m: m };
  };
  CH.act.dismiss = function (S, m) { var i = S.ms.indexOf(m); if (i >= 0) S.ms.splice(i, 1); return OK; };
  CH.can.trans = function (S, m, t) {
    var d = D.trans[t], old = D.trans[m.tr];
    if (t === m.tr) return no('Already in use.');
    if (!has(S, d.adv)) return no('Requires research: ' + D.adv[d.adv].n + '.');
    var cost = Math.max(0, d.cost - Math.round(old.cost * K.RESALE));
    if (S.coins < cost) return no(short(S, cost));
    var at = where(S, m);
    if (!at) return m.rt ? { ok: true, cost: cost, later: true } : no('Change transport at a market or the counting house.');
    if (load(m) > capFor(m, t)) return no('Cargo exceeds ' + d.n.toLowerCase() + ' capacity. Sell cargo first.');
    if (d.cls === 'cart' && at === 'hq') {              // carts are fitted out in the market square, where the road is
      at = mkt(S, rt(S).own[I(WD.hq.x, WD.hq.y)]); if (!at) return no('Switch to ox carts at a market.');
    }
    if (d.mode === 'water' && at !== 'hq') {
      var h = depot(S, at, 'harbour'); if (!h) return no(at.name + ' needs a harbour.');
      if (d.cls === 'deep' && WD.terr[I(h.wx, h.wy)] !== T.SEA) return no('A junk needs a sea harbour. The harbour at ' + at.name + ' is on the river.');
    }
    return { ok: true, cost: cost, at: at };
  };
  function swap(S, m, t, q) {
    var d = D.trans[t], at = q.at, p, h;
    pay(S, q.cost, 'hire'); m.tr = t; m.qt = null; m.path = null;
    if (d.mode === 'water') { if (at === 'hq') p = [WD.hq.wx, WD.hq.wy]; else { h = depot(S, at, 'harbour'); p = [h.wx, h.wy]; } }
    else p = at === 'hq' ? [WD.hq.x, WD.hq.y] : [at.x, at.y];
    if (at !== 'hq' && m.hq) { m.hq = 0; m.at = at.id; }
    m.x = p[0]; m.y = p[1]; if (m.st === 'stuck') m.st = 'idle'; m.re = 1;
  }
  CH.act.trans = function (S, m, t) {
    var q = CH.can.trans(S, m, t); if (!q.ok) return q;
    if (q.later) { m.qt = t; return { ok: true, later: true }; }
    swap(S, m, t, q); return OK;
  };
  /* routes: an ordered list of stops, each saying exactly what to unload and what to load */
  function touch(S, R) { S.ms.forEach(function (m) { if (m.rt === R.id) m.re = 1; }); }
  CH.act.newRoute = function (S, name) { var R = { id: S.nid++, name: name || ('Route ' + (S.rt.length + 1)), stops: [] }; S.rt.push(R); return { ok: true, R: R }; };
  /* Orders a careful merchant would write for himself: at each stop, load what that market can spare and the next
     one is short of, in the amounts the next one uses in a round, best bargain first, until he is full. */
  function legTicks(S, m, A, B) {        // roughly how long he takes between two markets
    var d = D.trans[m ? m.tr : 'porter'], a = m ? stopTile(S, m, A) : I(A.x, A.y), b = m ? stopTile(S, m, B) : I(B.x, B.y), t = K.DWELL, i;
    if (typeof a === 'string' || typeof b === 'string') return 120;
    var p = way(S, d.cls, a, b), sp = grid(S, d.cls); if (!p) return 120;
    for (i = 1; i < p.length; i++) t += ((p[i] % W !== p[i - 1] % W && ((p[i] / W) | 0) !== ((p[i - 1] / W) | 0)) ? 1.4142 : 1) / (sp[p[i]] * d.spd || 0.1);
    return t;
  }
  function spare(S, A, g, yrs) {         // how many loads of a good a market can give up every round without running dry or going short itself
    var f = flows(S, A), p = f.p[g] || 0, c = f.c[g] || 0, s = A.stock[g] || 0, t = tOf(f, g);
    return p > c ? Math.max(1, Math.floor((p - c) * yrs + s / 10)) : c > 0 ? (s > 2 * t ? Math.floor((s - 2 * t) / 2) : 0) : s;
  }
  function suggestStop(S, R, k, cap, sd, bd, yrs) {
    var st = R.stops[k], A = mkt(S, st.m), B = mkt(S, R.stops[(k + 1) % R.stops.length].m), ld = {}, c = 0, cand = [], i, g;
    if (A !== B) {
      var fA = flows(S, A), fB = flows(S, B);
      for (i = 0; i < D.goodIds.length; i++) {
        g = D.goodIds[i]; var sp = spare(S, A, g, yrs); if (sp < 1 || ((A.stock[g] || 0) < 1 && !(fA.p[g] > 0))) continue;     // only what is there, or is made there
        var cb = fB.c[g] || 0, pb = fB.p[g] || 0, t = tOf(fB, g), sb = B.stock[g] || 0; if (!(cb > pb)) continue;             // the next stop makes all it uses
        var dem = (cb - pb) * yrs + Math.max(0, t - sb) / 2, q = Math.min(sp, Math.round(dem)); if (q < 1) { if (dem < 0.25) continue; q = 1; }
        var gain = G[g].p * Math.max(1, mult(t, sb + 0.5)) * sd - buyP(S, A, g) * bd; if (gain <= 2) continue;                 // judged at a fair price there, not today's glut
        cand.push([gain, g, q]);
      }
      cand.sort(function (x, y) { return y[0] - x[0]; });
      for (i = 0; i < cand.length && c < cap; i++) { var n = Math.min(cand[i][2], cap - c); ld[cand[i][1]] = n; c += n; }
    }
    st.ld = ld; st.un = 'all'; return c;
  }
  function terms(S, R) {                 // the carrier and the bargaining of the first merchant on a route, and how long a round takes
    var m = null, i, share = 0, round = 0;
    for (i = 0; i < S.ms.length; i++) if (S.ms[i].rt === R.id) { if (!m) m = S.ms[i]; share++; }
    R.stops.forEach(function (st, k) { round += legTicks(S, m, mkt(S, st.m), mkt(S, R.stops[(k + 1) % R.stops.length].m)); });
    return { cap: m ? capFor(m, m.tr) : D.trans.porter.cap, sd: m && m.ab === 'sell' ? 1 : 1 - fee(S), bd: m && m.ab === 'buy' ? 1 : 1 + fee(S), yrs: round / TPY / (share || 1) };
  }
  CH.act.own = function (S, R, k) {       // the player takes a stop over: its orders start as what a careful merchant would write there
    if (!R.stops[k]) return no(''); if (R.stops.length < 2) return no('Add 2 stops first.');
    var t = terms(S, R), un = R.stops[k].un; suggestStop(S, R, k, t.cap, t.sd, t.bd, t.yrs); R.stops[k].un = un; R.stops[k].auto = 0; touch(S, R); return OK;
  };
  CH.act.free = function (S, R, k) { var s = R.stops[k]; if (!s) return no(''); s.auto = 1; s.ld = {}; touch(S, R); return OK; };   // and hands it back
  CH.act.suggest = function (S, R) {     // written orders at every stop
    if (R.stops.length < 2) return no('Add 2 stops first.');
    var n = 0; R.stops.forEach(function (st, k) { CH.act.own(S, R, k); for (var g in st.ld) n += st.ld[g]; }); return { ok: true, n: n };
  };
  CH.act.setRoute = function (S, m, rid) { m.rt = rid; m.si = 0; m.re = 1; m.round = 0; m.last = null; return OK; };
  CH.act.addStop = function (S, R, mid) {
    var n = R.stops.length; if (n && R.stops[n - 1].m === mid) return no('Already the last stop.');
    if (n >= 8) return no('Stop limit reached: 8.');
    R.stops.push({ m: mid, ld: {}, un: 'all', auto: 1 }); touch(S, R); return OK;
  };
  CH.act.delStop = function (S, R, k) { if (!R.stops[k]) return no(''); R.stops.splice(k, 1); touch(S, R); return OK; };
  CH.act.moveStop = function (S, R, k, d) { var j = k + d; if (!R.stops[k] || !R.stops[j]) return no(''); var t = R.stops[k]; R.stops[k] = R.stops[j]; R.stops[j] = t; touch(S, R); return OK; };
  CH.act.setLoad = function (S, R, k, g, n) { var s = R.stops[k]; if (!s || !G[g]) return no(''); s.auto = 0; if (n > 0) s.ld[g] = Math.min(40, n); else delete s.ld[g]; touch(S, R); return OK; };
  CH.act.setUnload = function (S, R, k, g, n) {
    var s = R.stops[k]; if (!s || (g && g !== 'all' && !G[g])) return no('');
    if (g === 'all') s.un = 'all'; else { if (s.un === 'all') s.un = {}; if (g) { if (n > 0) s.un[g] = Math.min(40, n); else delete s.un[g]; } }
    touch(S, R); return OK;
  };
  CH.act.strict = function (S, R, on) { R.strict = on ? 1 : 0; return OK; };          // to the letter, or only what pays
  CH.act.delRoute = function (S, R) { S.ms.forEach(function (m) { if (m.rt === R.id) { m.rt = 0; m.re = 1; } }); var i = S.rt.indexOf(R); if (i >= 0) S.rt.splice(i, 1); return OK; };

  function stopTile(S, m, mk) {          // the tile he must reach to trade there, or a sentence saying why he cannot
    var d = D.trans[m.tr];
    if (d.mode === 'water') {
      var h = depot(S, mk, 'harbour'); if (!h) return mk.name + ' needs a harbour';
      var j = I(h.wx, h.wy); if (d.cls === 'deep' && WD.terr[j] !== T.SEA) return 'A junk needs a sea harbour at ' + mk.name;
      return j;
    }
    if (d.depot && !depot(S, mk, d.depot)) return mk.name + ' needs a caravansary';
    return I(mk.x, mk.y);
  }
  function stuck(m, why) { m.st = 'stuck'; m.why = why; m.path = null; }
  function snap(m) { if (m.path && m.path[m.pi + 1] != null) { var t = m.pf > 0.5 ? m.path[m.pi + 1] : m.path[m.pi]; m.x = t % W; m.y = (t / W) | 0; } else { m.x = Math.round(m.x); m.y = Math.round(m.y); } }
  function head(S, m, R) {               // set off for the stop he is due at
    var st = R.stops[m.si], mk = mkt(S, st.m), tile = stopTile(S, m, mk);
    if (typeof tile === 'string') return stuck(m, tile + '.');
    var p = way(S, D.trans[m.tr].cls, I(Math.round(m.x), Math.round(m.y)), tile);
    if (!p) return stuck(m, (m.tr === 'cart' ? 'Needs a road to ' : D.trans[m.tr].mode === 'water' ? 'Needs a water route to ' : 'Needs a land route to ') + mk.name + '.');
    m.path = p; m.pi = 0; m.pf = 0; m.st = 'go'; m.why = ''; m.hq = 0;
    if (p.length < 2) arrive(S, m, R); else m.at = 0;
  }
  function arrive(S, m, R) {
    m.st = 'trade'; m.dw = K.DWELL; m.at = R.stops[m.si].m; m.sold = 0; m.got = {}; m.w = 0; m.path = null; m.x = Math.round(m.x); m.y = Math.round(m.y);
    if (m.qt) {
      var q = CH.can.trans(S, m, m.qt);
      if (q.ok && !q.later) swap(S, m, m.qt, q);
      else { say(S, m.nm + ': switch to ' + D.trans[m.qt].n.toLowerCase() + ' cancelled at ' + mkt(S, m.at).name + '. ' + (q.why || ''), 'warn'); m.qt = null; }
    }
  }
  function move(S, m, R) {
    var d = D.trans[m.tr], sp = grid(S, d.cls), p = m.path, left = 1, guard = 0, a, b;
    var sea = d.mode === 'water' && m.ab === 'sea' ? 1.25 : 1, wise = d.mode === 'land' && m.ab === 'trail';
    while (left > 0 && guard++ < 12) {
      a = p[m.pi]; b = p[m.pi + 1];
      var v = sp[b]; if (!(v > 0)) { m.re = 1; return; }                  // the ground has changed under him
      var len = (a % W !== b % W && ((a / W) | 0) !== ((b / W) | 0)) ? 1.4142 : 1;
      v *= d.spd * sea * (wise && (S.path[b] | 0) < 2 ? 1.33 : 1);
      var need = (1 - m.pf) * len / v;
      if (need <= left) { left -= need; m.pi++; m.pf = 0; if (m.pi >= p.length - 1) { m.x = b % W; m.y = (b / W) | 0; arrive(S, m, R); return; } }
      else { m.pf += left * v / len; left = 0; }
    }
    a = p[m.pi]; b = p[m.pi + 1];
    var ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0, sx = (bx - ax) - (by - ay);
    m.x = ax + (bx - ax) * m.pf; m.y = ay + (by - ay) * m.pf; if (sx) m.dir = sx > 0 ? 1 : -1;
  }
  function tally(m, p) { m.pr += p; m.yr[0] += p; m.round += p; m.sm = (m.sm || 0) + p; if (p > 0) m.ss = (m.ss || 0) + p; }
  function heard(S, e) { var q = rt(S).snd; if (q.length < 24) q.push(e); }          // something worth a sound: the interface plays it if it is near the view
  function moved(mk, k, g) { var t = mk.tf || (mk.tf = { c: { i: {}, o: {} }, p: { i: {}, o: {} } }); t.c[k][g] = (t.c[k][g] || 0) + 1; }   // loads merchants bring in (i) and take out (o), this year (c) and last (p)
  function traded(S, mk, k, g) { var t = mk.tf; return t ? (t.c[k][g] || 0) + (t.p[k][g] || 0) * (1 - (S.tick % TPY) / TPY) : 0; }       // the same as a yearly rate: this year so far, plus the rest of a year at last year's pace
  function sellOne(S, m, mk, g) { var p = sellP(S, mk, g) * (m.ab === 'sell' ? 1 : 1 - fee(S)); moved(mk, 'i', g); mk.stock[g] = (mk.stock[g] || 0) + 1; if (--m.cargo[g] <= 0) delete m.cargo[g]; earn(S, p, 'sales'); tally(m, p); }
  function buyOne(S, m, mk, g) { var p = buyP(S, mk, g) * (m.ab === 'buy' ? 1 : 1 + fee(S)); moved(mk, 'o', g); mk.stock[g]--; m.cargo[g] = (m.cargo[g] || 0) + 1; pay(S, p, 'buys'); tally(m, -p); }
  /* How a merchant buys. At a stop left to him he takes whatever pays best among the goods that are cheap there: a
     load is worth buying only while it will fetch more at the stop where it comes off than it costs here, dues and
     all, and he never draws a market's shelves below the stock that keeps its price at the usual. Where the player has written the orders he loads those goods and no others, up to the numbers given: only
     while they pay, unless the route says to follow orders to the letter. Either way he does not walk on with empty
     hands unless something worth carrying is waiting further on. */
  function note(S, k, d) { var a = rt(S).les || (rt(S).les = []); if (a.length < 12) a.push({ k: k, d: d }); }   // a moment for the Lessons book, which reads and clears these
  function outlet(S, R, k, g) {          // the market where a good loaded at stop k comes off again
    for (var j = 1, n = R.stops.length; j < n; j++) { var q = R.stops[(k + j) % n]; if (q.un === 'all' ? !(q.ld[g] > 0) : q.un[g] > 0) return mkt(S, q.m); }
    return null;
  }
  function margin(S, mk, o, g, sd, bd, aboard, dl) {   // what one more load would clear: sold where it comes off, after the ones already aboard
    return sellP(S, o, g, ((dl && dl[o.id + g]) || 0) + aboard) * sd - buyP(S, mk, g, (dl && dl[mk.id + g]) || 0) * bd;
  }
  function choose(S, R, k, mk, sd, bd, cargo, dl) {    // the next load he would take of his own accord at stop k, or null
    var f = flows(S, mk), best = null, bv = K.EDGE;
    for (var i = 0; i < D.goodIds.length; i++) {
      var g = D.goodIds[i], s = (mk.stock[g] || 0) + ((dl && dl[mk.id + g]) || 0);
      if (s < 1 || s <= tOf(f, g)) continue;                                                        // only what is cheap here: he never draws a market below its comfortable stock
      var o = outlet(S, R, k, g); if (!o || o === mk) continue;
      var v = margin(S, mk, o, g, sd, bd, cargo[g] || 0, dl); if (v > bv) { bv = v; best = g; }
    }
    return best;
  }
  function ahead(S, m, R, sd, bd) {      // is anything at a later stop worth going to fetch right now?
    for (var j = 1, n = R.stops.length; j < n; j++) {
      var k = (m.si + j) % n, st = R.stops[k], mk = mkt(S, st.m), g, o;
      if (st.auto) { if (choose(S, R, k, mk, sd, bd, {}, null)) return true; }
      else for (g in st.ld) if ((mk.stock[g] || 0) >= 1 && (R.strict || ((o = outlet(S, R, k, g)) && o !== mk && margin(S, mk, o, g, sd, bd, 0, null) > K.EDGE))) return true;
    }
    return false;
  }
  function trade(S, m, R) {              // unload first, then load
    var st = R.stops[m.si], mk = mkt(S, st.m), g, n, careful = st.auto || !R.strict, dear = 0;
    var sd = m.ab === 'sell' ? 1 : 1 - fee(S), bd = m.ab === 'buy' ? 1 : 1 + fee(S);
    if (!m.sold) {
      m.sold = 1;
      if (st.un === 'all') { for (g in m.cargo) if (!(st.ld[g] > 0)) { n = m.cargo[g]; while (n-- > 0) sellOne(S, m, mk, g); } }
      else for (g in st.un) { n = Math.min(st.un[g], m.cargo[g] || 0); while (n-- > 0) sellOne(S, m, mk, g); }
    }
    var cap = capFor(m, m.tr), done = true, why = '';
    if (st.auto) {
      n = 0; done = false; dear = 1;
      while (load(m) < cap && n++ < 80) {
        if (S.coins < K.CREDIT) { why = '$'; break; }
        g = choose(S, R, m.si, mk, sd, bd, m.cargo, null); if (!g) break;
        buyOne(S, m, mk, g); m.got[g] = (m.got[g] || 0) + 1;
      }
      var seen = S.les || {};                // did he stop for want of profit with room to spare, or for want of room with profit to spare?
      if (why !== '$' && load(m) < cap && !seen.margin) {
        for (g in m.got) if ((mk.stock[g] || 0) > Math.max(1, tOf(flows(S, mk), g))) { var ob = outlet(S, R, m.si, g); if (ob && ob !== mk) { note(S, 'margin', { ms: m.id, a: mk.id, b: ob.id, g: g, n: m.got[g], cap: cap }); break; } }
      } else if (why !== '$' && load(m) >= cap && !seen.choice && (g = choose(S, R, m.si, mk, sd, bd, m.cargo, null))) {
        note(S, 'choice', { ms: m.id, a: mk.id, g: g, v: margin(S, mk, outlet(S, R, m.si, g), g, sd, bd, m.cargo[g] || 0, null), cap: cap, took: JSON.parse(JSON.stringify(m.got)) });
      }
    } else for (g in st.ld) {
      n = st.ld[g] - (m.got[g] || 0);
      var o = careful && n > 0 ? outlet(S, R, m.si, g) : null;
      while (n > 0 && load(m) < cap) {
        if ((mk.stock[g] || 0) < 1) { done = false; if (why !== '$') why = g; break; }
        if (S.coins < K.CREDIT) { done = false; why = '$'; break; }
        if (careful && !(o && o !== mk && margin(S, mk, o, g, sd, bd, m.cargo[g] || 0, null) > K.EDGE)) { if (o && o !== mk && m.got[g] > 0) note(S, 'margin', { ms: m.id, a: mk.id, b: o.id, g: g, n: m.got[g], cap: cap }); done = false; if (!why) { why = g; dear = 1; } break; }
        buyOne(S, m, mk, g); m.got[g] = (m.got[g] || 0) + 1; n--;
      }
    }
    if (careful) {                         // he goes on with whatever paid; with nothing, only if there is something to fetch
      if (done || load(m) > 0 || ahead(S, m, R, sd, bd)) return leave(S, m, R);
      m.st = 'wait'; m.why = why; m.wd = dear; return;
    }
    m.wd = 0;
    if (done || (m.w >= K.PATIENCE && (load(m) > 0 || R.stops.some(function (q, i) { if (i === m.si) return false; if (q.auto) return true; for (var g in q.ld) return true; return false; })))) return leave(S, m, R);   // to the letter he waits a while for goods that are not there; with empty hands and nothing to load anywhere else he stays
    m.st = 'wait'; m.why = why;
  }
  function leave(S, m, R) {
    if (m.si === R.stops.length - 1) { m.trips++; m.last = m.round; m.round = 0; if (m.tr === 'cart' && m.rc) S.cnt.cart = 1; m.rc = m.tr === 'cart' ? 1 : 0; }
    var fx = rt(S).fx; if (m.sm && fx.length < 40) fx.push({ x: m.x, y: m.y, v: m.sm });
    if (m.sm || m.ss) heard(S, { k: 'trade', x: m.x, y: m.y, sold: m.ss || 0, net: m.sm || 0 }); m.sm = 0; m.ss = 0;
    m.si = (m.si + 1) % R.stops.length; m.why = ''; m.wd = 0; head(S, m, R);
  }
  function tickMerchant(S, m) {
    var R = m.rt ? routeOf(S, m.rt) : null;
    if (!R || R.stops.length < 2) { if (m.st !== 'idle') { snap(m); m.st = 'idle'; m.path = null; m.why = ''; } m.re = 0; return; }
    if (m.si >= R.stops.length) m.si = 0;
    if (!load(m) && !R.stops.some(function (q) { if (q.auto) return true; for (var g in q.ld) return true; return false; })) {
      if (m.st === 'go') snap(m); if (m.st !== 'idle') { m.st = 'idle'; m.path = null; } m.why = 'orders'; m.re = 0; return;
    }
    if (m.re) { m.re = 0; if (!((m.st === 'trade' || m.st === 'wait') && R.stops[m.si].m === m.at)) { snap(m); head(S, m, R); } }
    else if (m.st === 'idle') head(S, m, R);
    else if (m.st === 'stuck') { if ((S.tick + m.id) % 20 === 0) head(S, m, R); }
    else if (m.st === 'go') move(S, m, R);
    else if (m.st === 'trade') { if (--m.dw <= 0) trade(S, m, R); }
    else if (m.st === 'wait') { m.w++; if (m.w % 3 === 0) trade(S, m, R); }
  }

  /* ---------- sites, workshops, palaces ---------- */
  function bought(S, b, m, g) {
    if (b.t === 'quarter') {             // the ships pay in cloth, and now and then porcelain
      if (g === 'ore' || g === 'tin') S.cnt.tin = (S.cnt.tin || 0) + 1;
      if ((m.stock.cloth || 0) < 40) m.stock.cloth = (m.stock.cloth || 0) + 1;
      if (b.n % 4 === 0 && (m.stock.porc || 0) < 10) m.stock.porc = (m.stock.porc || 0) + 1;
    }
    if (b.t === 'istana' && g === 'orn') S.cnt.orn = (S.cnt.orn || 0) + 1;
  }
  function tickBld(S, b, m) {
    var d = D.bld[b.t], g, k, e;
    if (d.kind === 'works') {
      if (b.st === 'run') {
        if (--b.left > 0) return;
        var rev = 0; for (g in d.out) for (k = 0; k < d.out[g]; k++) { rev += sellP(S, m, g); m.stock[g] = (m.stock[g] || 0) + 1; }
        if (b.own) { earn(S, rev, 'works'); b.pr[0] += rev; }
        b.n++; b.st = 'idle';
      }
      var mode = b.own ? b.mode : 'auto';
      if (mode === 'off') { b.st = 'off'; return; }
      if ((S.tick + b.id) % 4) return;
      for (g in d.inp) if ((m.stock[g] || 0) < d.inp[g]) { b.st = 'wait'; b.why = g; return; }
      var cost = 0, out = 0, glut = false, pile = 0, f = flows(S, m);
      for (g in d.inp) for (k = 0; k < d.inp[g]; k++) cost += buyP(S, m, g, -k);
      for (g in d.out) { for (k = 0; k < d.out[g]; k++) out += sellP(S, m, g, k); pile = m.stock[g] || 0; if (pile >= 3 * tOf(f, g)) glut = true; }
      if (mode === 'auto' ? (glut || out <= cost) : pile >= 40) { b.st = 'wait'; b.why = glut ? '+' : '$'; return; }
      var paid = 0; for (g in d.inp) for (k = 0; k < d.inp[g]; k++) { paid += buyP(S, m, g); m.stock[g]--; }
      if (b.own) { pay(S, paid, 'works'); b.pr[0] -= paid; }
      b.st = 'run'; b.left = d.time; b.why = '';
    } else if (d.kind === 'demand') {
      for (k = 0; k < d.want.length; k++) {
        e = d.want[k]; if (!live(S, e)) continue; g = e.g;
        var nd = (b.need[g] || 0) + 1 / e.per;
        if (nd >= 1 && (m.stock[g] || 0) >= 1) { m.stock[g]--; nd -= 1; b.n++; bought(S, b, m, g); }
        b.need[g] = nd > 3 ? 3 : nd;
      }
      if (d.land) for (k = 0; k < d.land.length; k++) {
        e = d.land[k]; var lp = (b.need['_' + e.g] || 0) + 1;
        if (lp >= e.per) { lp = 0; if ((m.stock[e.g] || 0) < e.cap) m.stock[e.g] = (m.stock[e.g] || 0) + 1; }
        b.need['_' + e.g] = lp;
      }
    }
  }

  /* ---------- houses ---------- */
  function mood(S, m) {                  // k: -1 families leaving, 0 steady, 1 growing slowly, 2 growing
    var fmin = 1, met = 0, non = 0, miss = [], low = [];
    D.house.forEach(function (e) {
      if (!live(S, e)) return; var s = m.sat[e.g] || 0;
      if (e.food) { if (s < fmin) fmin = s; if (s < 0.75) miss.push(e.g); if (s < 0.35) low.push(e.g); }
      else { non++; if (s >= 0.6) met++; else miss.push(e.g); }
    });
    return { k: fmin < 0.35 ? -1 : (fmin >= 0.75 && met >= non - 1) ? (met === non ? 2 : 1) : 0, miss: miss, low: low, full: !!m.full };
  }
  function addHouse(S, m, quiet) {
    var r = rt(S), R = D.sizes[m.sz].r, best = -1, bs = -1e9;
    for (var n = 0; n < 48; n++) {
      var x = m.x + Math.round((rnd(S) * 2 - 1) * R), y = m.y + Math.round((rnd(S) * 2 - 1) * R); if (!inb(x, y)) continue;
      var i = I(x, y), t = WD.terr[i];
      if (r.own[i] !== m.id || r.at[i] || S.path[i] || (t !== T.GRASS && t !== T.FOREST) || (Math.abs(x - m.x) <= 1 && Math.abs(y - m.y) <= 1)) continue;
      var sc = -Math.hypot(x - m.x, y - m.y) - (ter(S, i) === T.FOREST ? 3 : 0) + rnd(S) * 3;
      for (var k = 0; k < 8; k++) {
        var nx = x + DX[k], ny = y + DY[k]; if (!inb(nx, ny)) continue;
        var j = I(nx, ny), o = r.at[j];
        if (o && o.k === 'house') sc += 0.5; else if (o && o.k === 'site') sc -= 0.6;
        if (S.path[j]) sc += 0.7;
      }
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best < 0) return false;
    var h = [best % W, (best / W) | 0, m.id, Math.floor(rnd(S) * 4)];
    S.hs.push(h); r.at[best] = { k: 'house', h: h }; clearTile(S, best); m.pop++; r.tv++;
    if (!quiet && r.fx.length < 40) r.fx.push({ x: h[0], y: h[1], s: '+1 house' });
    if (!quiet) heard(S, { k: 'house', x: h[0], y: h[1], n: m.pop });
    return true;
  }
  function dropHouse(S, m) {
    var r = rt(S), best = -1, bd = -1;
    for (var i = 0; i < S.hs.length; i++) { var h = S.hs[i]; if (h[2] !== m.id) continue; var d = Math.hypot(h[0] - m.x, h[1] - m.y) + rnd(S) * 2; if (d > bd) { bd = d; best = i; } }
    if (best < 0) return;
    var g = S.hs[best]; S.hs.splice(best, 1); r.at[I(g[0], g[1])] = null; m.pop--; r.tv++; m.lost = S.tick;
    if (r.fx.length < 40) r.fx.push({ x: g[0], y: g[1], s: '\u22121 house' }); heard(S, { k: 'left', x: g[0], y: g[1] });
  }
  function tickTown(S, m) {
    for (var k = 0; k < D.house.length; k++) {
      var e = D.house[k]; if (!live(S, e)) continue;
      var g = e.g, st = m.stock[g] || 0, alt = e.sub ? m.stock[e.sub] || 0 : 0, nd = m.need[g] || 0;
      if (m.pop) {
        nd += m.pop / e.per;
        if (nd >= 1) { if (st >= 1) { m.stock[g] = --st; nd -= 1; } else if (alt >= 1) { m.stock[e.sub] = --alt; nd -= 1; } else if (nd > 1.5) nd = 1.5; }
        m.need[g] = nd;
      }
      // a need is met while the good is on the shelves, or while nobody has yet gone home without it
      var s0 = m.sat[g] || 0; m.sat[g] = s0 + ((st >= 1 || alt >= 1 || (m.pop > 0 && nd < 1) ? 1 : 0) - s0) * K.SATK;
    }
    if ((S.tick + m.id * 7) % K.GROW) return;
    var md = mood(S, m);
    var ga = m.ga || 0;                                       // a steady drift of families in or out, not a lottery
    if (md.k > 0) { if (ga < 0) ga = 0; ga += Math.min(12, 2 + 0.12 * m.pop) * (md.k === 2 ? 1 : 0.4) * K.GROW / TPY; if (ga >= 1) { ga -= 1; m.full = addHouse(S, m) ? 0 : 1; } }
    else if (md.k < 0 && m.pop > 0) { if (ga > 0) ga = 0; ga -= 0.35; if (ga <= -1) { ga += 1; dropHouse(S, m); } }
    else ga *= 0.9;
    m.ga = ga;
  }

  /* ---------- the calendar ---------- */
  function newYear(S) {
    var y = year(S), wages = 0, id, r = rt(S);
    S.ms.forEach(function (m) { wages += (m.ab === 'thrift' ? 0 : D.hire.wage) + D.trans[m.tr].keep; m.yr = [0, m.yr[0]]; });
    if (wages) pay(S, wages, 'wages');
    S.bl.forEach(function (b) { b.pr = [0, b.pr[0]]; });
    S.mk.forEach(function (m) { if (m.tf) m.tf = { c: { i: {}, o: {} }, p: m.tf.c }; });
    S.hist.push(Math.round(S.coins)); S.led.prev = S.led.cur; S.led.cur = {};
    for (id in D.adv) {
      var a = D.adv[id]; if (S.adv[id]) continue;
      if (a.y === y) say(S, 'Research available: ' + a.n + '. ' + a.d, 'adv');
      else if (y >= a.y + K.FREE) { S.adv[id] = 2; r.tv++; say(S, 'Research unlocked for free: ' + a.n + '.', 'adv'); }
    }
    D.events.forEach(function (e) {
      if (e.warn && y === e.y - e.lead) say(S, e.warn, 'warn');
      if (y >= e.y && !S.flags[e.flag]) {
        S.flags[e.flag] = 1; r.tv++; say(S, e.t, 'warn');
        D.house.forEach(function (h) { if (h.from === e.flag && h.sub) S.mk.forEach(function (m) { m.sat[h.g] = m.sat[h.sub] || 0; m.need[h.g] = m.need[h.sub] || 0; }); });
      }
    });
    rollCands(S);
    if (y >= D.span[1] && !S.over) { S.over = 1; S.final = Math.round(S.coins); say(S, y + ': the Portuguese fleet arrives at Malacca. Game over. Final score recorded.', 'end'); }
  }
  function reward(S, g) { return Math.round(g.r * (D.diffs[S.diff] || D.diffs.normal).goal); }
  function goals(S) {
    var top = 0; S.mk.forEach(function (m) { if (m.pop > top) top = m.pop; });
    if (top > (S.top || 0)) S.top = top;
    if (S.coins < 200 && S.mk.length < 2 && !S.cnt.loan) { S.cnt.loan = 1; earn(S, 600, 'goals'); say(S, 'Guild grant: +600 coins, one time. Enough for a trading post and a trail.', 'goal'); }
    var ok = { market: S.mk.length > 0, trip: S.ms.some(function (m) { return m.trips > 0; }), h10: top >= 10, adv: S.cnt.adv > 0, works: S.cnt.works > 0, tin20: S.cnt.tin >= 20,
      road: !!S.cnt.cart, h40: top >= 40, orn: S.cnt.orn > 0, c50: S.coins >= 50000, h100: top >= 100 };
    D.goals.forEach(function (g) {
      if (!ok[g.id] || S.goals[g.id]) return;
      var r = reward(S, g); S.goals[g.id] = S.tick || 1; if (r) earn(S, r, 'goals');
      say(S, 'Goal complete: ' + g.t + '.' + (r ? ' Reward: +' + r + ' coins.' : ''), 'goal');
    });
  }
  CH.tick = function (S) {
    var i, k, m;
    rt(S); S.tick++;
    for (k = 0; k < S.st.length; k++) {
      var st = S.st[k]; if (!st.mk) continue;
      var d = D.sites[WD.sites[k].t]; if (d.from && !S.flags[d.from]) continue;
      m = S.mk[st.mk - 1];
      if (!st.g) { st.g = 1; m.stock[d.g] = (m.stock[d.g] || 0) + Math.ceil(TPY / d.per * K.GLUT); st.p = Math.floor(rnd(S) * d.per); }   // the first glut
      if ((m.stock[d.g] || 0) >= 3 * tOf(flows(S, m), d.g)) { st.on = 0; continue; }          // nobody digs for a price that has hit the floor
      st.on = 1; if (++st.p >= d.per) { st.p = 0; m.stock[d.g] = (m.stock[d.g] || 0) + 1; }
    }
    for (i = 0; i < S.bl.length; i++) if (S.bl[i].mk) tickBld(S, S.bl[i], S.mk[S.bl[i].mk - 1]);
    for (i = 0; i < S.mk.length; i++) tickTown(S, S.mk[i]);
    for (i = 0; i < S.ms.length; i++) tickMerchant(S, S.ms[i]);
    if (S.tick % TPY === 0) newYear(S);
    if (S.tick % 10 === 0) goals(S);
    if (S.tick % 20 === 0 && CH.learn) CH.learn.scan(S);          // the Lessons book looks over the game for anything worth a lesson
  };

  /* ---------- advances ---------- */
  CH.advPrice = function (S, id) { var a = D.adv[id], y = D.span[0] + S.tick / TPY; return Math.max(0, Math.round(a.cost * (1 - Math.max(0, y - a.y) / K.FREE) / 10) * 10); };
  CH.advState = function (S, id) { return S.adv[id] ? 'own' : year(S) >= D.adv[id].y ? 'avail' : 'later'; };
  CH.act.buyAdv = function (S, id) {
    if (S.adv[id]) return no('Already researched.');
    if (year(S) < D.adv[id].y) return no('Available later.');
    var c = CH.advPrice(S, id); if (S.coins < c) return no(short(S, c));
    S.adv[id] = 1; pay(S, c, 'adv'); S.cnt.adv = (S.cnt.adv || 0) + 1; rt(S).tv++;
    return OK;
  };

  /* ---------- starting, saving ---------- */
  CH.newGame = function (o) {
    o = o || {}; var seed = (o.seed || 20011) | 0, id, diff = D.diffs[o.diff] ? o.diff : 'normal';
    var S = { v: 3, seed: seed, rs: seed, tick: 0, name: String(o.name || D.company).slice(0, 32), diff: diff, fee: D.diffs[diff].fee, coins: D.diffs[diff].coins, mk: [], bl: [], hs: [], st: [], path: {}, clear: {}, ms: [], rt: [], adv: {}, flags: {}, goals: {}, news: [], nn: 0,
      led: { cur: {}, prev: {} }, hist: [], cnt: {}, nid: 1, hired: 0, over: 0, cand: [], top: 0 };
    WD.sites.forEach(function () { S.st.push({ mk: 0, p: 0, g: 0, on: 0 }); });
    WD.fixed.forEach(function (f) { S.bl.push(mkBld(S, f.t, f.x, f.y, 0)); });
    WD.houses.forEach(function (h) { S.hs.push([h[0], h[1], 0, Math.floor(rnd(S) * 4)]); });
    rollCands(S);
    for (id in D.adv) if (D.adv[id].y <= D.span[0]) say(S, 'Research available: ' + D.adv[id].n + '. ' + D.adv[id].d, 'adv');
    return S;
  };
  CH.serialize = function (S) { return JSON.stringify(S); };
  CH.revive = function (o) {
    if (!o || o.v !== 3 || !Array.isArray(o.mk) || !Array.isArray(o.ms) || !Array.isArray(o.st) || o.st.length !== WD.sites.length) throw new Error('Save from another game version.');
    if (!D.diffs[o.diff]) o.diff = 'normal'; if (typeof o.fee !== 'number') o.fee = D.diffs[o.diff].fee; if (!o.name) o.name = D.company;      // saves from before a game had a name and a difficulty
    rt(o); return o;
  };
  /* What a save list shows about a game, without opening it. */
  CH.summary = function (S) {
    var pop = 0; S.mk.forEach(function (m) { pop += m.pop; });
    return { name: S.name || D.company, diff: S.diff || 'normal', year: year(S), coins: Math.round(S.coins), rank: CH.rank(S.over ? S.final : S.coins), pop: pop, mk: S.mk.length, ms: S.ms.length, over: S.over ? 1 : 0, tick: S.tick };
  };

  /* ---------- what the interface asks ---------- */
  CH.view = {
    market: function (S, m) {            // a row for every good the market stocks, makes or uses
      var f = flows(S, m), rows = [];
      D.goodIds.forEach(function (g) {
        var s = m.stock[g] || 0, c = f.c[g] || 0, p = f.p[g] || 0; if (!s && !c && !p) return;
        var t = tOf(f, g), net = Math.round(traded(S, m, 'i', g) - traded(S, m, 'o', g));          // imp, exp: whole loads a year that merchants bring in or take out, net
        rows.push({ g: g, s: s, price: price(S, m, g), mult: t ? mult(t, s) : 0.5, c: c, p: p, t: t, imp: net > 0 ? net : 0, exp: net < 0 ? -net : 0 });
      });
      return rows;
    },
    needs: function (S, m) { return D.house.filter(function (e) { return live(S, e); }).map(function (e) { return { g: e.g, food: !!e.food, sat: m.sat[e.g] || 0, s: m.stock[e.g] || 0, sub: e.sub, alt: e.sub ? m.stock[e.sub] || 0 : 0 }; }); },
    mood: mood,
    trade: function (S, m) {             // what is worth buying here, and what this market pays well for
      var cheap = [], dear = [];
      CH.view.market(S, m).forEach(function (w) { if (w.s >= 1 && w.mult <= 0.8) cheap.push(w); if (w.c > 0 && w.mult >= 1.3) dear.push(w); });
      cheap.sort(function (a, b) { return a.mult - b.mult; }); dear.sort(function (a, b) { return b.price - a.price; });
      return { cheap: cheap.slice(0, 6), dear: dear.slice(0, 6) };
    },
    route: function (S, R, m) {          // what one round would carry and earn at today's prices and from today's shelves, stop by stop
      var cap = m ? capFor(m, m.tr) : D.trans.porter.cap, cargo = {}, n = 0, out = [], total = 0, dl = {}, over = false;
      var sd = m && m.ab === 'sell' ? 1 : 1 - fee(S), bd = m && m.ab === 'buy' ? 1 : 1 + fee(S);
      for (var pass = 0; pass < 2; pass++) {
        dl = {}; out = []; total = 0; over = false;
        R.stops.forEach(function (st, k) {
          var mk = mkt(S, st.m), money = 0, g, q, j, key, sold = {}, got = {}, careful = st.auto || !R.strict;
          function sell(g, q) { key = mk.id + g; for (j = 0; j < q; j++) { money += sellP(S, mk, g, dl[key] || 0) * sd; dl[key] = (dl[key] || 0) + 1; } cargo[g] -= q; n -= q; sold[g] = q; }
          function buy(g) { key = mk.id + g; money -= buyP(S, mk, g, dl[key] || 0) * bd; dl[key] = (dl[key] || 0) - 1; cargo[g] = (cargo[g] || 0) + 1; n++; got[g] = (got[g] || 0) + 1; }
          if (st.un === 'all') { for (g in cargo) if (cargo[g] > 0 && !(st.ld[g] > 0)) sell(g, cargo[g]); }
          else for (g in st.un) { q = Math.min(st.un[g], cargo[g] || 0); if (q > 0) sell(g, q); }
          if (st.auto) { j = 0; while (n < cap && j++ < 80 && (g = choose(S, R, k, mk, sd, bd, cargo, dl))) buy(g); }
          else for (g in st.ld) {
            q = Math.min(st.ld[g], cap - n); if (q < st.ld[g]) over = true;
            var o = careful ? outlet(S, R, k, g) : null;
            for (j = 0; j < q; j++) {
              if (careful && ((mk.stock[g] || 0) + (dl[mk.id + g] || 0) < 1 || !(o && o !== mk && margin(S, mk, o, g, sd, bd, cargo[g] || 0, dl) > K.EDGE))) break;   // not on the shelves, or would not pay
              buy(g);
            }
          }
          var hold = {}; for (g in cargo) if (cargo[g] > 0) hold[g] = cargo[g];
          out.push({ carry: n, money: money, sold: sold, got: got, hold: hold }); total += money;
        });
      }
      return { stops: out, total: total, cap: cap, over: over };
    }
  };
  CH.rank = function (c) { var r = D.ranks[0][1]; D.ranks.forEach(function (q) { if (c >= q[0]) r = q[1]; }); return r; };
  CH.year = year; CH.price = price; CH.cover = cover; CH.hireCost = hireCost; CH.capFor = capFor; CH.load = load; CH.where = where; CH.flows = flows; CH.tOf = tOf;
  CH.depot = depot; CH.routeOf = routeOf; CH.mkt = mkt; CH.ter = ter; CH.rt = rt; CH.way = way; CH.stopTile = stopTile; CH.layCost = layCost; CH.live = live; CH.disc = disc;
  CH.sellP = sellP; CH.buyP = buyP; CH.I = I; CH.mult = mult; CH.outlet = outlet; CH.traded = traded; CH.fee = fee; CH.reward = reward;
})(typeof window !== 'undefined' ? window : globalThis);
