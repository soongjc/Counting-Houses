/* Counting House — what the trade teaches. Charts of the engine's own price rule, and a book of lessons that the
   game notes the first time each one happens in play, told with the player's own figures. Nothing here touches the
   page: everything is worked out from the state and handed over as strings of HTML, so it runs under Node as well. */
(function (root) {
  'use strict';
  var CH = root.CH, D = CH.DEF, G = D.goods, K = CH.K, TPY = D.tpy, WD = CH.genWorld();
  var api = CH.learn = { strict: false };

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function n0(v) { return Math.round(v).toLocaleString('en-US'); }
  function n1(v) { return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function uc(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function gl(g) { return lc(G[g].n); }
  function gi(g) { return '<canvas class="gi" data-ico="g_' + g + '" width="36" height="36" aria-hidden="true"></canvas>'; }
  function yr(t) { return D.span[0] + Math.floor(t / TPY); }
  function loads(n) { return n + (n === 1 ? ' load' : ' loads'); }
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function mk(S, id) { return id > 0 && id <= S.mk.length ? S.mk[id - 1] : null; }
  function M(S, id) { var m = mk(S, id); return m ? m.name : 'that market'; }
  function sg(v) { v = Math.round(v); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US'); }
  function who(S, id) { for (var i = 0; i < S.ms.length; i++) if (S.ms[i].id === id) return S.ms[i]; return null; }
  function btn(label, act, data, cls, attrs) {      // the same button the interface writes, so focus and clicks behave alike
    var d = '', k = act, key;
    for (key in data || {}) { d += ' data-' + key + '="' + esc(String(data[key])) + '"'; k += ':' + data[key]; }
    return '<button type="button" class="' + (cls || 'btn') + '" data-act="' + act + '"' + d + ' data-fk="' + esc(k) + '"' + (attrs || '') + '>' + label + '</button>';
  }
  function safe(f) { try { return f(); } catch (e) { if (api.strict) throw e; return ''; } }

  /* ---------- drawing ---------- */
  var VW = 320;
  function svg(h, body, label) { return '<svg class="chart" viewBox="0 0 ' + VW + ' ' + h + '" role="img" aria-label="' + esc(label) + '">' + body + '</svg>'; }
  function tx(x, y, s, cls, anchor) { return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" class="' + cls + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(s) + '</text>'; }
  function ln(xa, ya, xb, yb, cls) { return '<line x1="' + xa.toFixed(1) + '" y1="' + ya.toFixed(1) + '" x2="' + xb.toFixed(1) + '" y2="' + yb.toFixed(1) + '" class="' + cls + '"/>'; }
  function toneOf(p, P) { return p / P >= 1.35 ? 'dear' : p / P <= 0.75 ? 'cheap' : 'mid'; }

  /* Supply and demand for one good at one market, as the engine works it. The line is demand: what the market pays for
     a load at each level of stock. The upright is supply: what is on the shelves today. Where they meet is the price.
     o.n draws a trade on top (loads sold here, or bought if negative); o.ghost is an older comfortable stock, drawn
     as the line the market had then. */
  function curve(S, m, g, o) {
    o = o || {};
    var f = CH.flows(S, m), T = CH.tOf(f, g); if (!T) return '';
    var P = G[g].p, s = m.stock[g] || 0, n = o.n || 0, gh = o.ghost > 0 && Math.abs(o.ghost - T) / T >= 0.2 ? o.ghost : 0;
    var m2 = o.also || null, T2 = m2 ? CH.tOf(CH.flows(S, m2), g) : 0, s2 = m2 ? m2.stock[g] || 0 : 0;       // another market's line, to set beside this one
    var xmax = Math.max(8, 3.6 * T, (s + Math.max(0, n)) * 1.1 + 1, gh ? 3.3 * gh : 0, T2 ? 3.4 * T2 : 0, T2 ? s2 * 1.1 + 1 : 0), ymax = 2.2 * P, x0 = 30, x1 = 312, y0 = 8, y1 = 146, h = '';
    function X(v) { return x0 + (x1 - x0) * Math.max(0, Math.min(v, xmax)) / xmax; }
    function Y(v) { return y1 - (y1 - y0) * v / ymax; }
    function pr(t, v) { return P * CH.mult(t, v); }
    function path(t, a, b) { var d = '', j, v; for (j = 0; j <= 56; j++) { v = a + (b - a) * j / 56; d += (j ? 'L' : 'M') + X(v).toFixed(1) + ' ' + Y(pr(t, v)).toFixed(1); } return d; }
    var p = pr(T, s), tone = toneOf(p, P), made = (f.p[g] || 0) > 0 && !T2, names = '';
    if (made) h += '<rect x="' + X(3 * T).toFixed(1) + '" y="' + y0 + '" width="' + (x1 - X(3 * T)).toFixed(1) + '" height="' + (y1 - y0) + '" class="k-zone"/>';
    [[2 * P, 'max price'], [P, 'base price'], [P / 2, made ? 'min price: production pauses' : 'min price']].forEach(function (q) {
      h += ln(x0, Y(q[0]), x1, Y(q[0]), 'k-gr'); names += tx(x1 - 3, Y(q[0]) + (q[0] < P ? 11 : -4), q[1], 'k-s k-n', 'end');     // the minimum's name goes under its line, where the curve does not run; the names are drawn last, over the lines
      if (T2 || Math.abs(Y(q[0]) - Y(p)) > 11) h += tx(x0 - 5, Y(q[0]) + 4, n0(q[0]), 'k-t', 'end');
    });
    h += ln(x0, y0, x0, y1, 'k-ax') + ln(x0, y1, x1, y1, 'k-ax');
    if (gh) h += '<path d="' + path(gh, 0, xmax) + '" class="k-gh"/>';
    if (n) { var a = Math.max(0, Math.min(s, s + n)), b = Math.max(s, s + n); h += '<path d="' + path(T, a, b) + 'L' + X(b).toFixed(1) + ' ' + y1 + 'L' + X(a).toFixed(1) + ' ' + y1 + 'Z" class="k-wa"/>'; }
    if (T2) h += '<path d="' + path(T2, 0, xmax) + '" class="k-d2"/><circle cx="' + X(s2).toFixed(1) + '" cy="' + Y(pr(T2, s2)).toFixed(1) + '" r="4.6" class="k-pt ' + toneOf(pr(T2, s2), P) + '"/>';
    h += '<path d="' + path(T, 0, xmax) + '" class="k-dm"/>';
    if (!T2) h += ln(X(s), y0 + 2, X(s), y1, 'k-sp');
    if (n) h += ln(X(s + n), y0 + 2, X(s + n), y1, 'k-wi');
    if (!T2) h += ln(x0, Y(p), X(s), Y(p), 'k-ld') + tx(x0 - 5, Y(p) + 4, n0(p), 'k-b ' + tone, 'end');
    if (n) h += '<circle cx="' + X(s + n).toFixed(1) + '" cy="' + Y(pr(T, s + n)).toFixed(1) + '" r="4" class="k-wd"/>';
    h += '<circle cx="' + X(s).toFixed(1) + '" cy="' + Y(p).toFixed(1) + '" r="4.6" class="k-pt ' + tone + '"/>';
    // along the bottom: today's stock, then nothing, the comfortable stock, and the stock at which the price stops falling
    var marks = T2 ? [[0, '0', 'k-t'], [3 * T, n1(3 * T), 'k-t'], [3 * T2, n1(3 * T2), 'k-t']] : [[s, n0(s), 'k-b'], [0, '0', 'k-t'], [T, n1(T), 'k-t'], [3 * T, n1(3 * T), 'k-t']], put = [];
    if (n) marks.unshift([s + n, n0(s + n), 'k-b gold']);
    marks.forEach(function (q) { var x = X(q[0]); if (q[0] > xmax || put.some(function (v) { return Math.abs(v - x) < 17; })) return; put.push(x); h += tx(x, y1 + 13, q[1], q[2], 'middle'); });
    h += names + tx(x1, y1 + 27, 'loads in stock', 'k-s', 'end');
    return svg(y1 + 32, h, G[g].n + ' at ' + m.name + ': stock ' + loads(s) + ', price ' + n0(p) + ', base price ' + P + '.' + (T2 ? ' ' + m2.name + ': stock ' + loads(s2) + ', price ' + n0(pr(T2, s2)) + '.' : ''));
  }
  function curveKey(S, m, g, ghostYear) {
    var T = CH.tOf(CH.flows(S, m), g), P = G[g].p, s = m.stock[g] || 0, p = P * CH.mult(T, s);
    return '<p class="kkey"><span><i class="ks"></i>demand</span><span><i class="ks sp"></i>supply: ' + s + ' in stock</span><span><i class="ks pt ' + toneOf(p, P) + '"></i>price: ' + n0(p) + '</span>' +
      (ghostYear ? '<span><i class="ks gh"></i>demand in ' + ghostYear + '</span>' : '') + '</p>';
  }
  function ghostOf(S, m, g) { var T = CH.tOf(CH.flows(S, m), g), r = m.ref && m.ref.T[g]; return r > 0 && T && Math.abs(r - T) / T >= 0.2 ? r : 0; }
  function parts(S, m, g) {                // who uses a good at a market and who makes it there, in loads a year: the same sums as the engine's flows
    var use = [], make = [], pop = Math.max(m.pop, K.LATENT), n = {}, hs = null;
    function add(a, name, v) { for (var i = 0; i < a.length; i++) if (a[i][0] === name) { a[i][1] += v; return; } a.push([name, v]); }
    D.house.forEach(function (e) { if (e.g === g && CH.live(S, e)) { add(use, 'Houses', pop * TPY / e.per); hs = { n: m.pop, each: TPY / e.per }; } });
    WD.sites.forEach(function (s, k) { var d = D.sites[s.t]; if (S.st[k].mk === m.id && d.g === g && CH.live(S, d)) { n[d.n] = (n[d.n] || 0) + 1; add(make, d.n, TPY / d.per); } });
    S.bl.forEach(function (b) {
      if (b.mk !== m.id) return; var d = D.bld[b.t];
      if (d.kind === 'works') { if (b.own && b.mode === 'off') return; n[d.n] = (n[d.n] || 0) + 1; if (d.inp[g]) add(use, d.n, d.inp[g] * TPY / d.time); if (d.out[g]) add(make, d.n, d.out[g] * TPY / d.time); }
      else if (d.kind === 'demand') { d.want.forEach(function (e) { if (e.g === g && CH.live(S, e)) add(use, d.n, TPY / e.per); }); (d.land || []).forEach(function (e) { if (e.g === g) add(make, d.n, TPY / e.per); }); }
    });
    return { use: use, make: make, n: n, hs: hs };
  }
  api.parts = parts;
  function flowLine(S, m, g, who) {        // demand and supply a year, what merchants add or take, and so which way the stock is heading; who = name the users and the makers
    var f = CH.flows(S, m), T = CH.tOf(f, g), p = f.p[g] || 0, c = f.c[g] || 0, s = m.stock[g] || 0;
    var net = Math.round(CH.traded(S, m, 'i', g) - CH.traded(S, m, 'o', g)), imp = net > 0 ? net : 0, exp = net < 0 ? -net : 0, d = p + imp - c - exp;
    var t = p > 0 && s >= 3 * T ? 'Stock full. Price at minimum. Production paused.' : c > 0 && s < 1 ? 'Stock 0. Price at maximum.'
      : d > 0.4 ? 'Stock rising by ' + n1(d) + ' a year. Price falling.' : d < -0.4 ? 'Stock falling by ' + n1(-d) + ' a year. Price rising.' : 'Balanced. Price steady.';
    if (who) {
      var w = parts(S, m, g), names = function (a) {      // each user or maker with its loads a year; for houses, the count and what one house uses
        return a.length ? ': ' + a.map(function (q) { return q[0] === 'Houses' && w.hs ? (w.hs.n < K.LATENT ? 'new market minimum ' + n1(q[1]) : w.hs.n + ' houses × ' + Math.round(w.hs.each * 100) / 100 + (a.length > 1 ? ' = ' + n1(q[1]) : '')) : esc(q[0]) + (w.n[q[0]] > 1 ? ' ×' + w.n[q[0]] : '') + ' ' + n1(q[1]); }).join(', ') : '';
      };
      return '<p class="kwho"><i class="sw sw-d"></i>Demand <b>' + (c ? n1(c) : '0') + '</b> a year' + names(w.use) + '</p><p class="kwho"><i class="sw sw-s"></i>Supply <b>' + (p ? n1(p) : '0') + '</b> a year' + names(w.make) + '</p>' +
        (imp ? '<p class="kwho"><i class="sw sw-x"></i>Imported <b>' + n1(imp) + '</b> a year by merchants</p>' : '') + (exp ? '<p class="kwho"><i class="sw sw-x"></i>Exported <b>' + n1(exp) + '</b> a year by merchants</p>' : '') + '<p class="kline">' + t + '</p>';
    }
    return '<p class="kstat"><span>Demand <b>' + (c ? n1(c) : '0') + '</b> a year</span><span>Supply <b>' + (p ? n1(p) : '0') + '</b> a year</span>' + (imp ? '<span>Imported <b>' + n1(imp) + '</b> a year</span>' : '') + (exp ? '<span>Exported <b>' + n1(exp) + '</b> a year</span>' : '') + '</p><p class="kline">' + t + '</p>';
  }
  api.clampTrade = function (m, g, n) { var s = m ? m.stock[g] || 0 : 0; return Math.max(-Math.min(12, s), Math.min(12, n || 0)); };
  function tradeLine(S, m, g, n) {
    var a = [], k, sum = 0, T = CH.tOf(CH.flows(S, m), g), after = G[g].p * CH.mult(T, (m.stock[g] || 0) + n);
    for (k = 0; k < Math.abs(n); k++) { a.push(n > 0 ? CH.sellP(S, m, g, k) : CH.buyP(S, m, g, -k)); sum += a[k]; }
    return (n > 0 ? 'Sell ' + n + ': ' : 'Buy ' + (-n) + ': ') + n0(sum) + ' coins before fees' + (a.length > 1 && a.length <= 6 ? ' (' + a.map(n0).join(', ') + ')' : '') + '. Price after: ' + n0(after) + '.';
  }
  /* the card under a good in a market's list */
  api.priceCard = function (S, m, g, n) {
    return safe(function () {
      var T = CH.tOf(CH.flows(S, m), g), P = G[g].p;
      if (!T) return '<div class="kcard"><p class="kline">' + esc(G[g].n) + ' at ' + esc(m.name) + ': demand 0, supply 0. Sell price ' + n0(P * K.NOSELL) + ', buy price ' + n0(P * 0.5) + '.</p></div>';
      n = api.clampTrade(m, g, n);
      var gh = ghostOf(S, m, g);
      return '<div class="kcard">' + curve(S, m, g, { n: n, ghost: gh }) + curveKey(S, m, g, gh ? yr(m.ref.t) : 0) + flowLine(S, m, g, true) +
        '<div class="ktry"><span>Try a trade</span><span class="step">' + btn('−', 'whatif', { d: -1 }, 'sbtn', ' aria-label="Buy one more load"') + '<b>' + (n > 0 ? 'sell ' + n : n < 0 ? 'buy ' + (-n) : '0 loads') + '</b>' + btn('+', 'whatif', { d: 1 }, 'sbtn', ' aria-label="Sell one more load"') + '</span></div>' +
        (n ? '<p class="kline gold">' + tradeLine(S, m, g, n) + '</p>' : '') + '<p class="hint">' + btn('Lesson: supply and demand', 'lesson', { id: 'price' }, 'link') + '</p></div>';
    });
  };

  /* Carrying one good from A to B, load by load. Each load bought lifts the price at A; each sold presses it down at
     B. The rising steps are what the next load costs, the falling steps what it fetches, both with the market's dues.
     He carries until they meet, and the gold between them is the profit of the trip. */
  function terms(m, auto) { return { sd: m && m.ab === 'sell' ? 1 : 1 - K.DUES, bd: m && m.ab === 'buy' ? 1 : 1 + K.DUES, cap: m ? CH.capFor(m, m.tr) : D.trans.porter.cap, auto: !!auto }; }
  function legOf(S, A, B, g, o) {
    var s = A.stock[g] || 0, T = CH.tOf(CH.flows(S, A), g), cost = [], rev = [], k, avail = 0, n = 0, tot = 0, N = 32;
    for (k = 0; k < N; k++) { if (s - k < 1 || (o.auto && s - k <= T)) break; avail++; }     // left to himself he never draws a market below its comfortable stock
    for (k = 0; k < N; k++) { cost.push(CH.buyP(S, A, g, -k) * o.bd); rev.push(CH.sellP(S, B, g, k) * o.sd); }
    while (n < avail && rev[n] - cost[n] > K.EDGE) { tot += rev[n] - cost[n]; n++; }
    return { cost: cost, rev: rev, avail: avail, n: n, tot: tot };
  }
  function cross(S, A, B, g, o, L) {
    L = L || legOf(S, A, B, g, o); if (!L.avail) return '';
    var cap = o.cap, show = Math.max(5, Math.min(12, Math.max(L.n + 2, Math.min(cap, L.avail) + 1))), k, vals = [];
    for (k = 0; k < show; k++) { vals.push(L.rev[k]); if (k < L.avail) vals.push(L.cost[k]); }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max(1, (hi - lo) * 0.16), ylo = Math.max(0, lo - pad * 1.5), yhi = hi + pad;
    var x0 = 30, x1 = 312, y0 = 20, y1 = 140, w = (x1 - x0) / show, h = '';
    function X(i) { return x0 + w * i; }
    function Y(v) { return y1 - (y1 - y0) * (v - ylo) / (yhi - ylo); }
    function steps(a, cnt) { var d = '', j; for (j = 0; j < cnt; j++) d += (j ? 'L' : 'M') + X(j).toFixed(1) + ' ' + Y(a[j]).toFixed(1) + 'L' + X(j + 1).toFixed(1) + ' ' + Y(a[j]).toFixed(1); return d; }
    for (k = 0; k < Math.min(L.n, show); k++) h += '<rect x="' + (X(k) + 0.5).toFixed(1) + '" y="' + Y(L.rev[k]).toFixed(1) + '" width="' + (w - 1).toFixed(1) + '" height="' + Math.max(0, Y(L.cost[k]) - Y(L.rev[k])).toFixed(1) + '" class="' + (k < cap ? 'k-pf' : 'k-pf2') + '"/>';
    h += ln(x0, y0 - 6, x0, y1, 'k-ax') + ln(x0, y1, x1, y1, 'k-ax');
    if (cap < show) { var far = X(cap) > x1 - 78; h += ln(X(cap), y0 - 6, X(cap), y1, 'k-cp') + tx(X(cap) + (far ? -4 : 4), y1 - 5, 'capacity ' + cap, 'k-s', far ? 'end' : 'start'); }
    if (L.n > 0 && L.n < show) { var xs = X(L.n); h += ln(xs, y0 - 6, xs, y1, 'k-st') + tx(xs < 62 ? x0 + 2 : xs > x1 - 44 ? x1 : xs, y0 - 10, L.n + ' profitable', 'k-b', xs < 62 ? 'start' : xs > x1 - 44 ? 'end' : 'middle'); }
    h += '<path d="' + steps(L.rev, show) + '" class="k-rv"/><path d="' + steps(L.cost, Math.min(show, L.avail)) + '" class="k-co"/>';
    var r0 = Y(L.rev[0]), c0 = Y(L.cost[0]); if (Math.abs(r0 - c0) < 12) { var mid = (r0 + c0) / 2, up = r0 <= c0; r0 = mid + (up ? -6 : 6); c0 = mid + (up ? 6 : -6); }
    h += tx(x0 - 5, r0 + 4, n0(L.rev[0]), 'k-b cheap', 'end') + tx(x0 - 5, c0 + 4, n0(L.cost[0]), 'k-b dear', 'end');
    for (k = 0; k < show; k++) if (show <= 9 || k % 2 === 0) h += tx(X(k) + w / 2, y1 + 13, String(k + 1), 'k-t', 'middle');
    h += tx(x1, y1 + 27, 'loads bought, in order', 'k-s', 'end');
    return svg(y1 + 32, h, G[g].n + ' from ' + A.name + ' to ' + B.name + ': ' + (L.n ? L.n + (L.n === 1 ? ' profitable load' : ' profitable loads') + ', total profit ' + n0(L.tot) : '0 profitable loads') + '.');
  }
  function crossKey(A, B) { return '<p class="kkey"><span><i class="ks co"></i>buy cost at ' + esc(A.name) + '</span><span><i class="ks rv"></i>sell price at ' + esc(B.name) + '</span><span><i class="ks pf"></i>profit</span></p>'; }
  function legLine(A, B, g, o, L) {
    if (!L.avail) return esc(G[g].n) + ' at ' + esc(A.name) + (o.auto ? ': stock at or below target. Auto orders buy above target stock.' : ': stock 0.');
    if (!L.n) return '0 profitable loads. First load: buy ' + n0(L.cost[0]) + ' at ' + esc(A.name) + ', sell ' + n0(L.rev[0]) + ' at ' + esc(B.name) + ', fees included.';
    var t = (L.n >= 32 ? 'Over ' : '') + L.n + (L.n === 1 ? ' profitable load: ' : ' profitable loads: ') + sg(L.tot) + '. First ' + sg(L.rev[0] - L.cost[0]) + (L.n > 1 ? ', last ' + sg(L.rev[L.n - 1] - L.cost[L.n - 1]) : '') + '.';
    if (L.n < L.avail) t += ' Next load: ' + sg(L.rev[L.n] - L.cost[L.n]) + '.';
    else if (L.n < 32) t += ' Stock limit reached at ' + esc(A.name) + '.';
    if (o.cap < L.n) { var lost = 0, k; for (k = o.cap; k < L.n; k++) lost += L.rev[k] - L.cost[k]; t += ' Capacity ' + o.cap + ': ' + sg(lost) + ' of profit stays behind.'; }
    return t;
  }
  function legBody(S, A, B, g, o) { var L = legOf(S, A, B, g, o); return cross(S, A, B, g, o, L) + (L.avail ? crossKey(A, B) : '') + '<p class="kline">' + legLine(A, B, g, o, L) + '</p>'; }
  /* the card under a good at a stop on a route */
  api.legCard = function (S, R, k, g, m) {
    return safe(function () {
      var st = R.stops[k]; if (!st || !G[g]) return '';
      var A = mk(S, st.m), B = CH.outlet(S, R, k, g);
      if (!B || B === A) return '<div class="kcard"><p class="kline">Set a later stop to unload ' + gl(g) + '.</p></div>';
      return '<div class="kcard"><p class="khead">' + gi(g) + esc(G[g].n) + ', ' + esc(A.name) + ' to ' + esc(B.name) + '</p>' + legBody(S, A, B, g, terms(m, st.auto)) +
        '<p class="hint">' + btn('Lesson: diminishing returns', 'lesson', { id: 'margin' }, 'link') + '</p></div>';
    });
  };
  /* the good at a stop that comes nearest to paying: what to show when nothing does */
  api.bestLeg = function (S, R, k, m) {
    var st = R.stops[k], A = st && mk(S, st.m), o = terms(m, st && st.auto), best = null, bv = -1e9; if (!A) return null;
    D.goodIds.forEach(function (g) {
      if ((A.stock[g] || 0) < 1) return; var B = CH.outlet(S, R, k, g); if (!B || B === A || !CH.tOf(CH.flows(S, B), g)) return;
      var v = CH.sellP(S, B, g, 0) * o.sd - CH.buyP(S, A, g, 0) * o.bd; if (v > bv) { bv = v; best = g; }
    });
    return best;
  };

  /* the same good in a small market and a large one: one shape, stretched */
  function two(S, a, b, g) {
    if (!CH.tOf(CH.flows(S, a), g) || !CH.tOf(CH.flows(S, b), g)) return '';
    return curve(S, a, g, { also: b }) + '<p class="kkey"><span><i class="ks"></i>demand at ' + esc(a.name) + '</span><span><i class="ks d2"></i>demand at ' + esc(b.name) + '</span><span><i class="ks pt"></i>current price</span></p>' +
      '<p class="kline">Same curve shape. The ' + esc(b.name) + ' curve spans more loads, so each load moves its price less.</p>';
  }

  /* what goes into a batch, what comes out, and the worth of the work between */
  function batchOf(S, d, m) { var cost = 0, val = 0, g, k; for (g in d.inp) for (k = 0; k < d.inp[g]; k++) cost += CH.buyP(S, m, g, -k); for (g in d.out) for (k = 0; k < d.out[g]; k++) val += CH.sellP(S, m, g, k); return { cost: cost, val: val }; }
  api.valueCard = function (S, d, m) {
    return safe(function () {
      var q = batchOf(S, d, m); q.cost = Math.round(q.cost); q.val = Math.round(q.val); var top = Math.max(q.cost, q.val, 1), a = Math.min(q.cost, q.val) / top * 100, b = Math.abs(q.val - q.cost) / top * 100, gain = q.val >= q.cost;
      return '<div class="vbar" role="img" aria-label="Batch: inputs ' + n0(q.cost) + ', output ' + n0(q.val) + '."><div class="vrow"><span>In</span><span class="vt"><i style="width:' + (q.cost / top * 100).toFixed(1) + '%"></i></span><b>' + n0(q.cost) + '</b></div>' +
        '<div class="vrow"><span>Out</span><span class="vt"><i class="out" style="width:' + (q.val / top * 100).toFixed(1) + '%"></i></span><b>' + n0(q.val) + '</b></div>' +
        '<div class="vrow"><span>' + (gain ? 'Profit' : 'Loss') + '</span><span class="vt"><i class="' + (gain ? 'add' : 'loss') + '" style="left:' + a.toFixed(1) + '%;width:' + b.toFixed(1) + '%"></i></span><b class="' + (gain ? 'pos' : 'neg') + '">' + (gain ? '+' : '−') + n0(Math.abs(q.val - q.cost)) + '</b></div></div>';
    });
  };
  function years(v) { return v < 0.95 ? 'under a year' : v < 1.25 ? 'about a year' : 'about ' + n1(Math.round(v * 2) / 2) + ' years'; }
  api.payback = function (S, b) {
    var d = D.bld[b.t]; if (!b.own || !(b.pr[1] > 0)) return '';
    return '<p class="hint">Payback: ' + years(d.cost / b.pr[1]) + ' at last year’s profit (cost ' + d.cost + '). ' + btn('Lesson: payback', 'lesson', { id: 'invest' }, 'link') + '</p>';
  };
  function carriers() {
    var h = '<table class="tbl"><thead><tr><th>Transport</th><th class="num">Capacity</th><th class="num">Wage + upkeep</th><th class="num">Per load</th></tr></thead><tbody>';
    ['porter', 'cart', 'sampan', 'junk'].forEach(function (t) { var q = D.trans[t], c = D.hire.wage + q.keep; h += '<tr><td>' + esc(q.n) + '</td><td class="num">' + q.cap + '</td><td class="num">' + c + '</td><td class="num">' + (c / q.cap).toFixed(1) + '</td></tr>'; });
    return h + '</tbody></table>';
  }
  function fig(caption, inner) { return inner ? '<figure class="lfig"><figcaption>' + caption + '</figcaption>' + inner + '</figure>' : ''; }
  function curveFig(S, d) { var m = mk(S, d.m); if (!m || !CH.tOf(CH.flows(S, m), d.g)) return ''; var gh = ghostOf(S, m, d.g); return fig(gi(d.g) + esc(G[d.g].n) + ' at ' + esc(m.name) + ' today', curve(S, m, d.g, { ghost: gh }) + curveKey(S, m, d.g, gh ? yr(m.ref.t) : 0) + flowLine(S, m, d.g)); }
  function legFig(S, d) { var A = mk(S, d.a), B = mk(S, d.b); return A && B ? fig(gi(d.g) + esc(G[d.g].n) + ', ' + esc(A.name) + ' to ' + esc(B.name) + ' today', legBody(S, A, B, d.g, terms(who(S, d.ms), true))) : ''; }

  /* ---------- the lessons ----------
     Each is a card: the name economists give the idea, the rule in one line, the figures of the moment it first showed
     in this game, a chart of the same place today, and one thing to do about it. see(S) looks at the game and returns
     those figures if the thing has happened; lessons with `ev` wait instead for the engine to say so. */
  var LESSONS = api.list = [
    { id: 'price', part: 'Prices', t: 'Supply and demand', rule: 'High stock: low price. Low stock: high price.', how: 'you build a market',
      see: function (S) {
        var m = S.mk[0], best = null, bv = 9; if (!m || S.tick - m.t0 < 45) return null; var f = CH.flows(S, m);      // a moment after the founding, so its own notice is read first
        D.goodIds.forEach(function (g) { var T = CH.tOf(f, g), s = m.stock[g] || 0; if (!T || s < 1) return; var mu = CH.mult(T, s); if (mu < bv) { bv = mu; best = g; } });
        return best ? { m: m.id, g: best, s: m.stock[best], T: CH.tOf(f, best), p: Math.round(CH.price(S, m, best)) } : null;
      },
      note: function (S, d) { return G[d.g].n + ' at ' + M(S, d.m) + ': stock ' + d.s + ', price ' + d.p + ' (base ' + G[d.g].p + ').'; },
      stats: function (S, d) { return [[G[d.g].n + ' at ' + M(S, d.m), 'stock ' + d.s], ['Target stock', n1(d.T)], ['Price', d.p + ' (base ' + G[d.g].p + ')']]; },
      fig: curveFig, tip: function () { return 'Tap a good in a market to open its price chart.'; } },
    { id: 'glut', part: 'Prices', need: 'price', t: 'Surplus', rule: 'Supply above demand: stock rises, price falls to the minimum, production pauses.', how: 'a site’s output exceeds local demand',
      see: function (S) {
        for (var k = 0; k < S.st.length; k++) {
          var st = S.st[k]; if (!st.mk || !st.g || st.on) continue;
          var sd = D.sites[WD.sites[k].t]; if (!CH.live(S, sd)) continue;
          var m = mk(S, st.mk), f = CH.flows(S, m), p = f.p[sd.g] || 0, c = f.c[sd.g] || 0; if (!m || S.tick - m.t0 < 60 || !(p > c)) continue;
          return { m: m.id, g: sd.g, st: WD.sites[k].t, p: p, c: c, fl: Math.round(CH.price(S, m, sd.g)) };
        }
        return null;
      },
      note: function (S, d) { return G[d.g].n + ' at ' + M(S, d.m) + ' fell to the minimum price: ' + d.fl + '. ' + uc(D.sites[d.st].pl) + ' paused.'; },
      stats: function (S, d) { return [[G[d.g].n + ' at ' + M(S, d.m), 'supply ' + n1(d.p) + ' a year'], ['Demand', (d.c ? n1(d.c) : '0') + ' a year'], ['Price', d.fl + ' (minimum)'], [uc(D.sites[d.st].pl), 'paused']]; },
      fig: curveFig, tip: function (S, d) { return 'Export it to a town with a shortage. Buying restarts the ' + D.sites[d.st].pl + '.'; } },
    { id: 'short', part: 'Prices', need: 'price', t: 'Shortage', rule: 'Demand with stock at 0: price at the maximum.', how: 'a town runs out of a good it uses',
      see: function (S) {
        for (var i = 0; i < S.mk.length; i++) {
          var m = S.mk[i], f = CH.flows(S, m), best = null, bc = 0; if (S.tick - m.t0 < 150) continue;
          D.goodIds.forEach(function (g) { var c = (f.c[g] || 0) * (m.pop > 0 && HOUSE[g] ? 100 : 1); if (c > bc && (m.stock[g] || 0) < 1 && !(f.p[g] > 0)) { bc = c; best = g; } });     // what the houses lack comes before what the ships lack
          if (best) return { m: m.id, g: best, c: f.c[best], hi: 2 * G[best].p };
        }
        return null;
      },
      note: function (S, d) { return G[d.g].n + ' at ' + M(S, d.m) + ': stock 0, price at the maximum: ' + d.hi + '.'; },
      stats: function (S, d) { return [[G[d.g].n + ' at ' + M(S, d.m), 'demand ' + n1(d.c) + ' a year'], ['Stock', '0'], ['Price', d.hi + ' (maximum)']]; },
      fig: curveFig, tip: function (S, d) { return 'Bring ' + gl(d.g) + ' to ' + M(S, d.m) + '. The first loads earn the most.'; } },
    { id: 'shift', part: 'Prices', need: 'price', t: 'Shift in demand', rule: 'More houses raise demand: the same stock sells at a higher price.', how: 'a town grows well past its first-year size',
      see: function (S) {
        for (var i = 0; i < S.mk.length; i++) {
          var m = S.mk[i], r = m.ref, f, best = null, br = 1.4; if (!r || m.pop < r.pop + 4) continue; f = CH.flows(S, m);
          D.house.forEach(function (e) { var g = e.g, T0 = r.T[g], T1 = CH.tOf(f, g); if (best === 'rice' || !T0 || !((f.c[g] || 0) > (f.p[g] || 0)) || T1 - T0 < 2) return; if (T1 / T0 >= br || (g === 'rice' && T1 / T0 >= 1.4)) { br = T1 / T0; best = g; } });
          if (best) { var T0 = r.T[best], T1 = CH.tOf(f, best), x = Math.max(1, Math.round(T0)), P = G[best].p; return { m: m.id, g: best, t0: r.t, n0: r.pop, n1: m.pop, T0: T0, T1: T1, x: x, p0: Math.round(P * CH.mult(T0, x)), p1: Math.round(P * CH.mult(T1, x)) }; }
        }
        return null;
      },
      note: function (S, d) { return M(S, d.m) + ' grew from ' + d.n0 + ' to ' + d.n1 + ' houses. ' + G[d.g].n + ' price at stock ' + d.x + ' rose from ' + d.p0 + ' to ' + d.p1 + '.'; },
      stats: function (S, d, y) { return [[G[d.g].n + ' at ' + M(S, d.m), loads(d.x) + ' in stock'], [yr(d.t0) + ', ' + d.n0 + ' houses', 'price ' + d.p0], [y + ', ' + d.n1 + ' houses', 'price ' + d.p1]]; },
      fig: curveFig, tip: function () { return 'Growing towns pay more each year. Keep your customer towns supplied with food.'; } },
    { id: 'depth', part: 'Prices', need: 'price', t: 'Market depth', rule: 'Small markets saturate after a few loads. Large markets absorb big cargoes.', how: 'a small town and a large town use the same good',
      see: function (S) {
        var out = null, br = 3;
        D.goodIds.forEach(function (g) {
          var lo = null, hi = null, P = G[g].p;
          S.mk.forEach(function (m) { var f = CH.flows(S, m), T = CH.tOf(f, g); if (!T || !(f.c[g] > 0) || S.tick - m.t0 < TPY) return; if (!lo || T < lo.T) lo = { m: m, T: T }; if (!hi || T > hi.T) hi = { m: m, T: T }; });
          if (!lo || lo.m === hi.m || hi.T / lo.T < br) return;
          var sa = lo.m.stock[g] || 0, sb = hi.m.stock[g] || 0, a0 = P * CH.mult(lo.T, sa), a5 = P * CH.mult(lo.T, sa + 5), b0 = P * CH.mult(hi.T, sb), b5 = P * CH.mult(hi.T, sb + 5);
          if (a0 - a5 < 0.25 * P || b0 < 0.7 * P || (a0 - a5) / a0 < 2 * (b0 - b5) / b0 + 0.15) return;
          br = hi.T / lo.T; out = { g: g, a: lo.m.id, b: hi.m.id, a0: Math.round(a0), a5: Math.round(a5), b0: Math.round(b0), b5: Math.round(b5) };
        });
        return out;
      },
      note: function (S, d) { return '5 loads of ' + gl(d.g) + ' move the price from ' + d.a0 + ' to ' + d.a5 + ' at ' + M(S, d.a) + (d.b0 === d.b5 ? '. At ' + M(S, d.b) + ' the price holds at ' + d.b0 : ' and from ' + d.b0 + ' to ' + d.b5 + ' at ' + M(S, d.b)) + '.'; },
      stats: function (S, d) { return [['Sell 5 loads of ' + gl(d.g) + ' at ' + M(S, d.a), 'price ' + d.a0 + ' to ' + d.a5], ['Sell 5 at ' + M(S, d.b), d.b0 === d.b5 ? 'price holds at ' + d.b0 : 'price ' + d.b0 + ' to ' + d.b5]]; },
      fig: function (S, d) { var a = mk(S, d.a), b = mk(S, d.b); return a && b ? fig(gi(d.g) + esc(G[d.g].n) + ' at ' + esc(a.name) + ' and ' + esc(b.name) + ' today', two(S, a, b, d.g)) : ''; },
      tip: function () { return 'Sell big cargoes in big towns, or split them between small ones.'; } },

    { id: 'arb', part: 'Trade', need: 'price', t: 'Arbitrage', rule: 'Buy low, sell high. The price gap is the profit.', how: 'a merchant completes a trip at a profit',
      see: function (S) {
        for (var i = 0; i < S.ms.length; i++) {
          var m = S.ms[i], R = m.rt && CH.routeOf(S, m.rt); if (!R || R.stops.length < 2 || !(m.trips > 0) || !(m.last > 0)) continue;
          var est = CH.view.route(S, R, m), k, g;
          for (k = 0; k < R.stops.length; k++) for (g in est.stops[k].got) {
            var A = mk(S, R.stops[k].m), B = CH.outlet(S, R, k, g); if (!A || !B || B === A) continue;
            var pa = CH.buyP(S, A, g, 0), pb = CH.sellP(S, B, g, 0); if (pb - pa < 2) continue;
            return { ms: m.id, nm: m.nm, a: A.id, b: B.id, g: g, pa: Math.round(pa), pb: Math.round(pb), last: Math.round(m.last) };
          }
        }
        return null;
      },
      note: function (S, d) { return d.nm + ' buys ' + gl(d.g) + ' at ' + M(S, d.a) + ' for ' + d.pa + ' and sells it at ' + M(S, d.b) + ' for ' + d.pb + '.'; },
      stats: function (S, d) { return [[d.nm + ' buys ' + gl(d.g) + ' at ' + M(S, d.a), d.pa + ' a load'], ['Sells at ' + M(S, d.b), d.pb + ' a load'], ['Last trip', sg(d.last)]]; },
      fig: legFig, tip: function () { return 'Tap a good on a route to see the profit of each load.'; } },
    { id: 'margin', part: 'Trade', need: 'arb', ev: 'margin', t: 'Diminishing returns', rule: 'Each extra load costs more to buy and sells for less. Stop at the last profitable load.', how: 'a merchant leaves a stop with spare capacity',
      see: function (S, e) {
        var m = who(S, e.ms), A = mk(S, e.a), B = mk(S, e.b); if (!m || !A || !B || !(e.n > 0)) return null;
        var o = terms(m, true), m1 = CH.sellP(S, B, e.g, 0) * o.sd - CH.buyP(S, A, e.g, e.n) * o.bd, mx = CH.sellP(S, B, e.g, e.n) * o.sd - CH.buyP(S, A, e.g, 0) * o.bd;
        return e.n >= 2 && m1 > mx + 2 && m1 >= 4 ? { ms: m.id, nm: m.nm, a: A.id, b: B.id, g: e.g, n: e.n, cap: e.cap, m1: Math.round(m1), mx: Math.round(mx) } : null;
      },
      note: function (S, d) { return d.nm + ' loaded ' + d.n + ' ' + gl(d.g) + ' and kept spare capacity. Profit of the next load: ' + sg(d.mx) + '.'; },
      stats: function (S, d) { return [[d.nm + ' bought at ' + M(S, d.a), loads(d.n) + ' of ' + gl(d.g)], ['Profit, first load', sg(d.m1)], ['Profit, next load', sg(d.mx)]]; },
      fig: legFig, tip: function () { return 'Spare capacity is correct here. Extra loads would sell at a loss.'; } },
    { id: 'gap', part: 'Trade', need: 'arb', t: 'Law of one price', rule: 'Trade closes the price gap between two markets down to the market fees. Then the route stops paying.', how: 'a merchant on an established route finds 0 profitable loads',
      see: function (S) {
        for (var i = 0; i < S.ms.length; i++) {
          var m = S.ms[i], R = m.rt && CH.routeOf(S, m.rt); if (!R || R.stops.length < 2 || m.trips < 2 || m.st !== 'wait' || !m.wd || m.why === '$') continue;
          var k = m.si, A = mk(S, R.stops[k].m), g = G[m.why] ? m.why : api.bestLeg(S, R, k, m); if (!A || !g) continue;
          var B = CH.outlet(S, R, k, g), o = terms(m, R.stops[k].auto); if (!B || B === A) continue;
          var pa = CH.buyP(S, A, g, 0), pb = CH.sellP(S, B, g, 0); if (pb * o.sd - pa * o.bd > K.EDGE) continue;
          return { ms: m.id, nm: m.nm, a: A.id, b: B.id, g: g, pa: Math.round(pa), pb: Math.round(pb) };
        }
        return null;
      },
      note: function (S, d) { return d.nm + ' waits at ' + M(S, d.a) + '. ' + G[d.g].n + ': buy ' + d.pa + ' there, sell ' + d.pb + ' at ' + M(S, d.b) + '. Profitable loads: 0.'; },
      stats: function (S, d) { return [[G[d.g].n + ' at ' + M(S, d.a), 'buy ' + d.pa], ['At ' + M(S, d.b), 'sell ' + d.pb], ['Market fee', Math.round(K.DUES * 100) + '% at each end'], ['Profitable loads', '0']]; },
      fig: legFig, tip: function () { return 'To revive the route: add a stop, grow a town, or build a buyer for the goods.'; } },
    { id: 'choice', part: 'Trade', need: 'arb', ev: 'choice', t: 'Opportunity cost', rule: 'A full cargo leaves other profitable goods behind. That lost profit is the opportunity cost.', how: 'a merchant leaves at full capacity while other profitable goods stay in stock',
      see: function (S, e) { var m = who(S, e.ms), A = mk(S, e.a); return m && A && e.v > 1.5 && G[e.g] && e.took && !e.took[e.g] ? { ms: m.id, nm: m.nm, a: A.id, g: e.g, v: Math.round(e.v), cap: e.cap, took: e.took } : null; },
      note: function (S, d) { return d.nm + ' left ' + M(S, d.a) + ' at full capacity. ' + G[d.g].n + ' worth ' + sg(d.v) + ' a load stayed behind.'; },
      stats: function (S, d) { return [[d.nm + ' carried from ' + M(S, d.a), list(Object.keys(d.took || {}).map(function (g) { return d.took[g] + ' ' + gl(g); }))], ['Capacity used', d.cap + '/' + d.cap], ['Left behind', gl(d.g) + ', ' + sg(d.v) + ' a load']]; },
      tip: function () { return 'Add a second merchant or switch to bigger transport to collect it.'; } },
    { id: 'road', part: 'Trade', need: 'arb', t: 'Transport costs', rule: 'Higher capacity lowers the cost per load. Low-margin trades become profitable.', how: 'a merchant switches from porters to an ox cart, sampan or junk',
      see: function (S) { for (var i = 0; i < S.ms.length; i++) { var m = S.ms[i]; if ((m.tr === 'cart' || m.tr === 'sampan' || m.tr === 'junk') && m.trips > 0 && m.st === 'go') return { ms: m.id, nm: m.nm, tr: m.tr }; } return null; },
      note: function (S, d) { return d.nm + ' carries ' + D.trans[d.tr].cap + ' loads a trip by ' + lc(D.trans[d.tr].n) + '. Porters carry ' + D.trans.porter.cap + '.'; },
      stats: function (S, d) { var q = D.trans[d.tr], p = D.trans.porter, w = D.hire.wage; return [[d.nm + ', ' + lc(q.n), q.cap + ' loads a trip'], ['Porters', p.cap + ' loads a trip'], ['Wage + upkeep per load', ((w + q.keep) / q.cap).toFixed(1) + ' a year (porters ' + ((w + p.keep) / p.cap).toFixed(1) + ')']]; },
      fig: function () { return fig('Transport compared', carriers()); }, tip: function () { return 'Routes that lose money with porters can profit by cart or boat.'; } },

    { id: 'value', part: 'Production', need: 'price', t: 'Value added', rule: 'Output value minus input cost = the workshop’s profit.', how: 'a workshop you own completes a batch',
      see: function (S) { for (var i = 0; i < S.bl.length; i++) { var b = S.bl[i], d = D.bld[b.t]; if (b.own && b.mk && d.kind === 'works' && b.n > 0) { var q = batchOf(S, d, mk(S, b.mk)); if (q.val > q.cost) return { b: b.id, t: b.t, m: b.mk, cost: Math.round(q.cost), val: Math.round(q.val) }; } } return null; },
      note: function (S, d) { return 'Your ' + lc(D.bld[d.t].n) + ' at ' + M(S, d.m) + ' turns goods worth ' + d.cost + ' into goods worth ' + d.val + '.'; },
      stats: function (S, d) { var w = D.bld[d.t]; return [[w.n + ' at ' + M(S, d.m), 'one batch'], ['In: ' + side(w.inp), String(d.cost)], ['Out: ' + side(w.out), String(d.val)], ['Profit', sg(d.val - d.cost)]]; },
      fig: function (S, d) { var m = mk(S, d.m); return m ? fig('A batch at ' + esc(m.name) + ' today', api.valueCard(S, D.bld[d.t], m)) : ''; },
      tip: function (S, d) { var i = gl(Object.keys(D.bld[d.t].inp)[0]); return 'It buys ' + i + ' here, which raises the local ' + i + ' price. Import more ' + i + '.'; } },
    { id: 'invest', part: 'Production', need: 'value', t: 'Payback', rule: 'Cost ÷ yearly profit = payback time in years.', how: 'you own a workshop for a full year at a profit',
      see: function (S) { for (var i = 0; i < S.bl.length; i++) { var b = S.bl[i], d = D.bld[b.t]; if (b.own && b.mk && d.kind === 'works' && b.pr[1] > 0) return { b: b.id, t: b.t, m: b.mk, cost: d.cost, pr: Math.round(b.pr[1]) }; } return null; },
      note: function (S, d) { return 'Your ' + lc(D.bld[d.t].n) + ' at ' + M(S, d.m) + ' earned ' + n0(d.pr) + ' last year. Payback on its cost of ' + d.cost + ': ' + years(d.cost / d.pr) + '.'; },
      stats: function (S, d, y) { return [[D.bld[d.t].n + ' at ' + M(S, d.m), 'cost ' + d.cost], ['Profit in ' + (y - 1), sg(d.pr)], ['Payback', years(d.cost / d.pr)]]; },
      tip: function () { return 'Before building, compare the payback time with the years left until ' + D.span[1] + '.'; } },
    { id: 'change', part: 'Production', need: 'price', t: 'Change in tastes', rule: 'Buyers switch goods. Demand for the old good collapses and demand for the new one jumps.', how: 'the foreign quarter, the Istana or households switch goods',
      see: function (S) { var out = null; D.events.forEach(function (e) { if (!out && S.flags[e.flag] && e.flag !== 'cotton') out = { f: e.flag }; }); return out; },
      note: function () { return 'Buyers switched goods. Prices follow the new demand.'; },
      stats: function (S, d) { var e = D.events.filter(function (q) { return q.flag === d.f; })[0]; return e ? [['News, ' + e.y, e.t]] : []; },
      tip: function () { return 'News warns of demand changes years ahead. Build for the new good before the switch.'; } }
  ];
  function side(o) { return list(Object.keys(o).map(function (g) { return o[g] + ' ' + gl(g); })); }
  var BY = {}, HOUSE = {}; LESSONS.forEach(function (x) { BY[x.id] = x; }); D.house.forEach(function (e) { HOUSE[e.g] = 1; });

  /* ---------- noticing ---------- */
  var GAP = 200;                           // ticks between one new lesson and the next, so that they arrive one at a time
  function refOf(S, m) { var f = CH.flows(S, m), T = {}; D.goodIds.forEach(function (g) { var t = CH.tOf(f, g); if (t) T[g] = Math.round(t * 10) / 10; }); return { t: S.tick, pop: m.pop, T: T }; }
  api.scan = function (S) {
    var L = S.les || (S.les = {}), r = CH.rt(S), ev = r.les || (r.les = []), i, j, x, d;
    for (i = 0; i < S.mk.length; i++) if (!S.mk[i].ref && S.tick - (S.mk[i].t0 || 0) >= TPY) S.mk[i].ref = refOf(S, S.mk[i]);     // each market's demand as it stood a year after its founding
    if (!(S.lesT && S.tick - S.lesT < GAP)) for (i = 0; i < LESSONS.length; i++) {
      x = LESSONS[i]; if (L[x.id] || (x.need && !L[x.need])) continue;
      d = null;
      try { if (x.ev) { for (j = 0; j < ev.length && !d; j++) if (ev[j].k === x.ev) d = x.see(S, ev[j].d); } else d = x.see(S); }
      catch (e) { if (api.strict) throw e; d = null; }
      if (d) {
        L[x.id] = { t: S.tick, d: d, r: 0 }; S.lesT = S.tick;
        S.news.push({ t: S.tick, s: 'Lesson unlocked: ' + x.t + '. ' + x.note(S, d), k: 'lesson', l: x.id }); if (S.news.length > 40) S.news.shift(); S.nn = (S.nn || 0) + 1;
        break;
      }
    }
    ev.length = 0;
  };
  api.unread = function (S) { var n = 0, id; for (id in S.les || {}) if (BY[id] && !S.les[id].r) n++; return n; };
  api.read = function (S, id) { if (S.les && S.les[id]) S.les[id].r = 1; };
  api.latest = function (S) {              // the lesson to open the book at: the newest unread, else the newest of all
    var best = null, bt = -1, id, q, any = false; for (id in S.les || {}) if (BY[id] && !S.les[id].r) any = true;
    for (id in S.les || {}) { q = S.les[id]; if (BY[id] && (!any || !q.r) && q.t > bt) { bt = q.t; best = id; } }
    return best;
  };

  /* ---------- the book ---------- */
  api.book = function (S, open) {
    var L = S.les || {}, seen = 0, h, part = '';
    LESSONS.forEach(function (x) { if (L[x.id]) seen++; });
    h = '<p class="ls-count"><b>' + seen + '/' + LESSONS.length + '</b> unlocked. Lessons unlock as events happen in your game.</p>';
    LESSONS.forEach(function (x) {
      if (x.part !== part) { h += (part ? '</ul>' : '') + '<h3>' + x.part + '</h3><ul class="book">'; part = x.part; }
      var q = L[x.id], on = open === x.id;
      if (!q) { h += '<li class="todo"><div class="ls-h"><span class="ls-t">' + esc(x.t) + '</span><span class="ls-y">locked</span></div><p class="ls-rule">' + esc(x.rule) + '</p><p class="ls-how">Unlocks when ' + esc(x.how) + '.</p></li>'; return; }
      h += '<li class="seen' + (on ? ' open' : '') + '"' + (on ? ' data-open="1"' : '') + '>' + btn('<span class="ls-t">' + esc(x.t) + '</span><span class="ls-y">' + (q.r ? '' : '<i class="badge">new</i> ') + yr(q.t) + '</span>', 'lesson', { id: x.id }, 'ls-h', ' aria-expanded="' + on + '"') + '<p class="ls-rule">' + esc(x.rule) + '</p>';
      if (on) h += safe(function () {
        var y = yr(q.t), rows = x.stats(S, q.d, y).map(function (r) { return '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>'; }).join('');
        return '<div class="ls-b"><p class="ls-in">In your game, ' + y + '</p><dl class="ls-s">' + rows + '</dl>' + (x.fig ? x.fig(S, q.d) : '') + '<p class="ls-tip"><b>Tip</b>' + esc(x.tip(S, q.d)) + '</p></div>';
      });
      h += '</li>';
    });
    return h + '</ul>';
  };
  api.curve = curve; api.cross = cross; api.legOf = legOf; api.terms = terms;
})(typeof window !== 'undefined' ? window : globalThis);
