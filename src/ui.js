/* Counting House — the interface: panels, tools, pointer and keys, and the loop that drives the game. */
(function (root) {
  'use strict';
  var CH = root.CH, D = CH.DEF, R = CH.draw, WD = CH.genWorld(), W = D.W, H = D.H, doc = document, G = D.goods, TPY = D.tpy;
  var S, st, SAVE_KEY = 'countinghouse.save.v3', TICKS = 6;
  var ui = { sel: null, tool: null, hover: null, preview: null, cam: { x: 0, y: 0, z: 1 }, speed: 1, paused: false, modal: null, tab: 'house', reach: false, pick: null, touch: false, confirm: null, canStore: true, lens: null, plain: false, alpha: 1, prev: new WeakMap() };
  var acc = 0, lastTs = 0, lastUi = 0, lastModal = 0, holdUntil = 0, dirty = true, toastUntil = 0, lastSave = 0, newsSeen = 0, prevKey = '', lastMini = 0, tipAt = null;
  function $(id) { return doc.getElementById(id); }

  /* ---------- small helpers ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
  function signed(n) { n = Math.round(n); return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('en-US'); }
  function tone(n) { return Math.round(n) > 0 ? 'pos' : Math.round(n) < 0 ? 'neg' : ''; }
  function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
  function listing(a, word) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' ' + (word || 'and') + ' ' + a[a.length - 1]; }
  function rate(v) { return v >= 10 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1).replace(/\.0$/, '') : v > 0 ? v.toFixed(1) : ''; }
  function gn(g) { return G[g].n; }
  function gi(g, alone) { return '<canvas class="gi" data-ico="g_' + g + '" width="36" height="36"' + (alone ? ' role="img" aria-label="' + esc(gn(g)) + '" title="' + esc(gn(g)) + '"' : ' aria-hidden="true"') + '></canvas>'; }   // the good's little picture
  function good(g) { return '<span class="g">' + gi(g) + esc(gn(g)) + '</span>'; }
  function ico(key) { return '<canvas class="ico" data-ico="' + key + '" width="80" height="72"></canvas>'; }
  function B(label, act, data, cls, attrs) {
    var d = '', k = act, key;
    for (key in data || {}) { d += ' data-' + key + '="' + esc(String(data[key])) + '"'; k += ':' + data[key]; }
    return '<button type="button" class="' + (cls || 'btn') + '" data-act="' + act + '"' + d + ' data-fk="' + esc(k) + '"' + (attrs || '') + '>' + label + '</button>';
  }
  /* a button that is live when the check passes, and otherwise says why not */
  function gated(label, act, data, can, cls) {
    return can.ok ? B(label, act, data, cls || 'btn') : B(label, 'why', { why: can.why }, (cls || 'btn') + ' off', ' aria-disabled="true" title="' + esc(can.why) + '"');
  }
  function paintIcons(el) {
    var cs = el.querySelectorAll('canvas[data-ico]');
    for (var i = 0; i < cs.length; i++) { var c = cs[i], s = R.sprite(st, c.getAttribute('data-ico')), k = Math.min(c.width / s.bw, c.height / s.bh, 1.25); c.getContext('2d').drawImage(s.c, s.bx, s.by, s.bw, s.bh, (c.width - s.bw * k) / 2, (c.height - s.bh * k) / 2, s.bw * k, s.bh * k); }
  }
  function setHTML(el, html) {
    if (el.__h === html) return;
    var a = doc.activeElement, key = a && el.contains(a) ? a.getAttribute('data-fk') : null, sc = el.scrollTop;
    var sl = el.scrollLeft; el.__h = html; el.innerHTML = html; el.scrollTop = sc; if (sl) el.scrollLeft = sl; paintIcons(el);
    if (key) { var n = el.querySelector('[data-fk="' + (root.CSS && CSS.escape ? CSS.escape(key) : key) + '"]'); if (n) n.focus({ preventScroll: true }); }
  }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.hidden = false; toastUntil = performance.now() + 5200; }
  function refresh() { dirty = true; }
  function merchant(id) { for (var i = 0; i < S.ms.length; i++) if (S.ms[i].id === +id) return S.ms[i]; return null; }
  function bld(id) { for (var i = 0; i < S.bl.length; i++) if (S.bl[i].id === +id) return S.bl[i]; return null; }
  function selM() { return ui.sel && ui.sel.k === 'm' ? merchant(ui.sel.id) : null; }
  function select(s) { if (!s || s.k !== 'm' || !ui.sel || ui.sel.k !== 'm' || ui.sel.id !== s.id) ui.pick = null; ui.sel = s; if (s) ui.tab = 'sel'; refresh(); }
  function run(q, good_) { if (!q.ok) { if (q.why) toast(q.why); } else if (good_) toast(good_); refresh(); return q.ok; }

  /* ---------- words for states ---------- */
  function mstat(m) {
    var Rt = m.rt ? CH.routeOf(S, m.rt) : null, mk = Rt && Rt.stops[m.si] ? CH.mkt(S, Rt.stops[m.si].m) : null;
    if (!Rt) return 'No route yet';
    if (Rt.stops.length < 2) return 'His route needs two stops';
    if (m.st === 'idle' && m.why === 'orders') return 'No orders at any stop';
    if (m.st === 'go') return 'On the way to ' + mk.name;
    if (m.st === 'trade') return 'Trading at ' + mk.name;
    if (m.st === 'wait') return m.why === '$' ? 'Out of credit at ' + mk.name : m.wd ? (G[m.why] ? gn(m.why) + ' is too dear at ' + mk.name : 'Nothing worth carrying at ' + mk.name + ' yet') : 'Waiting for ' + lc(gn(m.why)) + ' at ' + mk.name;
    if (m.st === 'stuck') return m.why;
    return 'Standing by';
  }
  function bstat(b) {
    var d = D.bld[b.t];
    if (!b.mk) return 'No market reaches it';
    if (d.kind !== 'works') return '';
    if (b.st === 'run') return 'Working';
    if (b.st === 'off') return 'Switched off';
    if (b.st === 'wait') return b.why === '+' ? 'Idle: its goods are piling up unsold' : b.why === '$' ? 'Idle: it would lose money at today’s prices' : 'Waiting for ' + lc(gn(b.why));
    return 'Ready';
  }
  function moodText(m, md) {
    var miss = md.miss.map(function (g) { return lc(gn(g)); });
    if (!m.pop) return md.k > 0 ? 'No houses yet, but the shelves are stocked and families are on their way.' : 'No houses yet. Families settle where rice and fish are on the shelves, with at least two of salt, cloth and pottery.';
    if (md.k < 0) return 'Families are leaving: there is not enough ' + listing(md.low.map(function (g) { return lc(gn(g)); }), 'or') + '.';
    if (md.full && md.k > 0) return 'No room for more houses. Enlarge the market.';
    if (md.k === 2) return 'Growing. Every need is met.';
    if (md.k === 1) return 'Growing slowly: short of ' + listing(miss) + '.';
    return 'Not growing: short of ' + listing(miss) + '.';
  }
  function pics(o) { return Object.keys(o).map(function (g) { return '<span class="rq">' + (o[g] > 1 ? o[g] : '') + gi(g, 1) + '</span>'; }).join(''); }
  function recipePics(d) { return '<div class="recipe">' + pics(d.inp) + '<span class="dim">makes</span>' + pics(d.out) + '</div>'; }
  function recipe(d) {
    function side(o) { return listing(Object.keys(o).map(function (g) { return o[g] + ' ' + lc(gn(g)); })); }
    return side(d.inp) + ' in, ' + side(d.out) + ' out, ' + rate(TPY / d.time) + ' times a year';
  }

  /* ---------- top bar ---------- */
  function renderTop() {
    var y = CH.year(S), part = (S.tick % TPY) / TPY, n = 0, id;
    for (id in D.adv) if (CH.advState(S, id) === 'avail') n++;
    setHTML($('date'), '<span class="lab">Year</span><b>' + y + '</b><span class="yr" aria-hidden="true"><i style="width:' + Math.round(part * 100) + '%"></i></span>');
    var net = 0, pop = 0; for (id in S.led.cur) net += S.led.cur[id]; S.mk.forEach(function (m) { pop += m.pop; });
    setHTML($('coins'), '<span class="lab">Coins</span><b class="' + (S.coins < 0 ? 'neg' : '') + '">' + fmt(S.coins) + '</b>' + (Math.round(net) ? '<span class="delta ' + tone(net) + '" title="Earned and spent so far this year">' + signed(net) + '<span class="lab"> this year</span></span>' : ''));
    setHTML($('pop'), '<span class="lab">Houses</span><b>' + pop + '</b>');
    var sp = B('Pause', 'pause', null, 'spd' + (ui.paused ? ' on' : ''), ' aria-pressed="' + ui.paused + '"');
    [1, 2, 4, 8].forEach(function (v) { sp += B(v + '×', 'speed', { v: v }, 'spd' + (!ui.paused && ui.speed === v ? ' on' : ''), ' aria-pressed="' + (!ui.paused && ui.speed === v) + '"'); });
    setHTML($('speed'), sp);
    setHTML($('menu'), B('Advances' + (n ? '<span class="badge">' + n + '</span>' : ''), 'modal', { name: 'adv' }, 'mbtn') + B('Prices', 'modal', { name: 'prices' }, 'mbtn') + B('Ledger', 'modal', { name: 'ledger' }, 'mbtn') + B('Help', 'modal', { name: 'help' }, 'mbtn'));
  }

  /* ---------- left: what can be built, and the merchants ---------- */
  var TOOLS = [
    ['Markets and paths', [['market', 0], ['market', 1], ['market', 2], ['market', 3], ['path', 'trail'], ['path', 'road']]],
    ['Workshops', [['bld', 'potter'], ['bld', 'carpenter'], ['bld', 'smelter'], ['bld', 'curing'], ['bld', 'weaver'], ['bld', 'goldsmith'], ['bld', 'batikw']]],
    ['Buildings that buy', [['bld', 'balai'], ['bld', 'mosque'], ['bld', 'shipyard'], ['bld', 'stockade']]],
    ['Depots', [['bld', 'harbour'], ['bld', 'caravan']]]
  ];
  function toolDef(k, t) {
    if (k === 'market') return { n: D.sizes[t].n, cost: D.sizes[t].cost + '', adv: D.sizes[t].adv, ic: 'market' + t, d: 'Everything inside its reach of ' + D.sizes[t].r + ' tiles trades through it: sites start working, workshops can be built, houses appear when their needs are met.' };
    if (k === 'path') return { n: D.path[t].n, cost: D.path[t].cost + ' a tile', adv: D.path[t].adv, ic: 'i_' + t, d: t === 'trail' ? 'Porters and elephants move at full pace along a trail. Forest and hill cost more to cut; a river needs a bridge.' : 'A made road is faster than a trail, and the only thing ox carts can use.' };
    var d = D.bld[t], ws = d.kind === 'demand' ? d.want.filter(function (e) { return CH.live(S, e); }) : null;
    return { n: d.n, cost: d.cost + '', adv: d.adv, ic: 'b_' + t, d: d.d, pics: d.kind === 'works' ? '<span class="tp">' + Object.keys(d.inp).map(function (g) { return gi(g, 1); }).join('') + '<i>▸</i>' + Object.keys(d.out).map(function (g) { return gi(g, 1); }).join('') + '</span>' : ws ? '<span class="tp"><i>buys</i>' + ws.map(function (e) { return gi(e.g, 1); }).join('') + '</span>' : '' };
  }
  function renderLeft() {
    var h = '<h2>Build</h2>';
    TOOLS.forEach(function (grp) {
      var rows = '';
      grp[1].forEach(function (q) {
        var d = toolDef(q[0], q[1]); if (d.adv && CH.advState(S, d.adv) === 'later') return;
        var locked = d.adv && !S.adv[d.adv], on = ui.tool && ui.tool.k === q[0] && ui.tool.t === q[1];
        var inner = ico(d.ic) + '<span class="tn">' + esc(d.n) + '</span><span class="tc">' + (locked ? 'needs ' + esc(D.adv[d.adv].n) : d.cost + (d.pics || '')) + '</span>';
        rows += locked ? B(inner, 'why', { why: d.n + ' needs the ' + D.adv[d.adv].n + ' advance. Open Advances to buy it.' }, 'tool off', ' aria-disabled="true"') : B(inner, 'tool', { k: q[0], t: q[1] }, 'tool' + (on ? ' on' : ''), ' aria-pressed="' + !!on + '"');
      });
      if (rows) h += '<h3>' + grp[0] + '</h3><div class="tools">' + rows + '</div>';
    });
    setHTML($('build'), h);
    h = '<h2>Merchants <span class="count">' + S.ms.length + ' of ' + D.hire.cap + '</span></h2>';
    h += B(CH.hireCost(S) ? 'Hire a merchant for ' + fmt(CH.hireCost(S)) : 'Hire your first merchant', 'modal', { name: 'hire' }, 'btn wide');
    if (!S.ms.length) h += '<p class="hint">Merchants do all the carrying between markets. New ones start at the counting house.</p>';
    h += '<ul class="roster">';
    S.ms.forEach(function (m) {
      var on = ui.sel && ui.sel.k === 'm' && ui.sel.id === m.id, warn = m.st === 'stuck' || !m.rt || (m.st === 'idle' && m.why === 'orders'), cap = CH.capFor(m, m.tr), ld = CH.load(m);
      h += '<li>' + B('<span class="mi">' + ico('m_' + m.tr) + '<span class="mf" title="Carrying ' + ld + ' of ' + cap + ' loads"><i style="width:' + Math.round(ld / cap * 100) + '%"></i></span></span><span class="mn">' + esc(m.nm) + '</span><span class="mp ' + tone(m.last || 0) + '">' + (m.last == null ? '' : signed(m.last)) + '</span><span class="ms' + (warn ? ' warn' : '') + '">' + esc(mstat(m)) + '</span>', 'sel', { k: 'm', id: m.id }, 'mrow' + (on ? ' on' : '')) + '</li>';
    });
    setHTML($('roster'), h + '</ul>');
  }

  /* ---------- right: whatever is chosen ---------- */
  function head(title, sub, extra) { return '<header class="ih"><div><h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (extra || '') + '</header>'; }
  function find(x, y) { return B('Show', 'center', { x: Math.round(x), y: Math.round(y) }, 'btn tiny'); }
  function inspHouse() {
    var h = head('The house', 'Rank: ' + CH.rank(S.coins) + '. ' + (S.over ? 'The books closed in ' + D.span[1] + '.' : (D.span[1] - CH.year(S)) + ' years until the books close in ' + D.span[1] + '.')), next = true;
    h += '<h3>Goals</h3><ol class="goals">';
    D.goals.forEach(function (g) {
      var done = !!S.goals[g.id]; h += '<li class="' + (done ? 'done' : next ? 'next' : '') + '"><span class="gt">' + esc(g.t) + '</span>' + (g.r ? '<span class="gr">' + g.r + '</span>' : '') + (!done && next && g.h ? '<p class="hint">' + esc(g.h) + '</p>' : '') + '</li>';
      if (!done) next = false;
    });
    h += '</ol>';
    if (S.mk.length) {
      h += '<h3>Towns</h3><table class="tbl"><thead><tr><th>Market</th><th class="num">Houses</th><th>Mood</th><th>Needs</th></tr></thead><tbody>';
      S.mk.forEach(function (m) { var md = CH.view.mood(S, m); h += '<tr><td>' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '</td><td class="num">' + m.pop + '</td><td class="' + (!m.pop ? 'dim' : md.k < 0 ? 'neg' : md.k > 0 ? 'pos' : '') + '">' + (!m.pop && md.k <= 0 ? 'empty' : md.k < 0 ? 'leaving' : md.k === 2 ? 'growing' : md.k === 1 ? 'slowly' : 'steady') + '</td><td>' + pips(m) + '</td></tr>'; });
      h += '</tbody></table>';
    }
    h += '<h3>Notices</h3><ul class="news">';
    S.news.slice(-7).reverse().forEach(function (n) { h += '<li class="' + n.k + '"><span class="ny">' + (D.span[0] + Math.floor(n.t / TPY)) + '</span>' + esc(n.s) + '</li>'; });
    return h + '</ul>';
  }
  function pips(m) {                        // the household needs as pictures, underlined by how well each is supplied
    return '<span class="pips">' + CH.view.needs(S, m).map(function (n) { var k = n.sat >= (n.food ? 0.75 : 0.6) ? 'ok' : n.sat >= 0.35 ? 'mid' : 'low'; return '<span class="pip ' + k + '" title="' + esc(gn(n.g)) + ': ' + (k === 'ok' ? 'supplied' : k === 'mid' ? 'patchy' : 'missing') + '">' + gi(n.g) + '</span>'; }).join('') + '</span>';
  }
  function tradeRows(m) {                   // what to buy here and what to bring here, at a glance
    var tr = CH.view.trade(S, m), h = '';
    function items(a, cls) { return a.map(function (w) { return '<span class="ti ' + cls + '">' + gi(w.g, 1) + fmt(w.price) + '</span>'; }).join(''); }
    if (tr.cheap.length) h += '<div class="trade"><span class="tl">Cheap here</span><span class="tv">' + items(tr.cheap, 'cheap') + '</span></div>';
    if (tr.dear.length) h += '<div class="trade"><span class="tl">Pays well for</span><span class="tv">' + items(tr.dear, 'dear') + '</span></div>';
    return h;
  }
  function inspMarket(m) {
    var sz = D.sizes[m.sz], md = CH.view.mood(S, m), h = head(m.name, sz.n + ', reach ' + sz.r + ' tiles', find(m.x, m.y)), r = CH.rt(S), here = {}, list = '';
    if (m.sz < D.sizes.length - 1) { var q = CH.can.enlarge(S, m), nx = D.sizes[m.sz + 1]; if (!nx.adv || CH.advState(S, nx.adv) !== 'later') h += gated('Enlarge to ' + lc(nx.n) + ' for ' + (nx.cost - sz.cost), 'enlarge', { id: m.id }, q, 'btn wide') + (q.ok ? '' : '<p class="hint">' + esc(q.why) + '</p>'); }
    h += '<p class="mood ' + (md.k < 0 ? 'neg' : md.k > 0 ? 'pos' : '') + '"><b>' + m.pop + (m.pop === 1 ? ' house.' : ' houses.') + '</b> ' + moodText(m, md) + '</p><div class="needs">';
    CH.view.needs(S, m).forEach(function (n) { h += '<div class="need ' + (n.sat >= (n.food ? 0.75 : 0.6) ? 'ok' : n.sat >= 0.35 ? 'mid' : 'low') + '">' + good(n.g) + '<span class="meter"><i style="width:' + Math.round(n.sat * 100) + '%"></i></span><span class="nv">' + (n.s ? n.s + ' in stock' : n.alt ? 'eating ' + lc(gn(n.sub)) : 'none') + '</span></div>'; });
    h += '</div>' + tradeRows(m) + '<table class="tbl goods"><thead><tr><th>Good</th><th class="num">Stock</th><th class="num">Price</th><th class="num" title="Loads a year the market uses">Uses</th><th class="num" title="Loads a year the market makes">Makes</th></tr></thead><tbody>';
    CH.view.market(S, m).forEach(function (w) {
      h += '<tr><td>' + good(w.g) + '</td><td class="num">' + (w.s || '') + (w.t ? '<span class="sbar ' + (w.mult >= 1.35 ? 'lo' : w.mult <= 0.75 ? 'hi' : '') + '"><i style="width:' + Math.min(100, Math.round(w.s / (3 * w.t) * 100)) + '%"></i></span>' : '') + '</td><td class="num ' + (w.mult >= 1.35 ? 'dear' : w.mult <= 0.75 ? 'cheap' : '') + '" title=""' + (w.t ? Math.round(w.mult * 100) + '% of the usual ' + G[w.g].p : 'Nobody here wants it') + '">' + (w.t ? fmt(w.price) : '<span class="dim">' + fmt(w.price) + '</span>') + '</td><td class="num">' + rate(w.c) + '</td><td class="num">' + rate(w.p) + '</td></tr>';
    });
    h += '</tbody></table><p class="hint">Prices: <span class="cheap">cheap</span> where a good piles up, <span class="dear">dear</span> where the shelves are bare. Each load a merchant sells here lowers the price; each he buys raises it. The bar under the stock fills as the shelves do; full means the price can fall no further.</p>';
    WD.sites.forEach(function (s, k) { if (S.st[k].mk === m.id && CH.live(S, D.sites[s.t])) here[s.t] = (here[s.t] || 0) + 1; });
    Object.keys(here).forEach(function (t) { list += '<li>' + esc(D.sites[t].n) + (here[t] > 1 ? ' ×' + here[t] : '') + '<span class="dim"> makes ' + lc(gn(D.sites[t].g)) + '</span></li>'; });
    S.bl.forEach(function (b) { if (b.mk !== m.id) return; var d = D.bld[b.t], s = bstat(b); list += '<li>' + B(esc(d.n), 'sel', { k: 'bld', id: b.id }, 'link') + (d.kind === 'works' ? '<span class="dim"> ' + (b.own ? 'yours' : 'local') + (s ? ', ' + lc(s) : '') + '</span>' : d.kind === 'demand' ? '<span class="dim"> buys ' + listing(d.want.filter(function (e) { return CH.live(S, e); }).map(function (e) { return lc(gn(e.g)); })) + '</span>' : '') + '</li>'; });
    if (list) h += '<h3>Inside its reach</h3><ul class="plain">' + list + '</ul>';
    var call = S.ms.filter(function (q) { var Rt = q.rt && CH.routeOf(S, q.rt); return Rt && Rt.stops.some(function (s) { return s.m === m.id; }); });
    if (call.length) h += '<h3>Merchants calling here</h3><p>' + call.map(function (q) { return B(esc(q.nm), 'sel', { k: 'm', id: q.id }, 'link'); }).join(', ') + '</p>';
    return h;
  }
  function stepper(n, act, data) { var a = {}, b = {}, k; for (k in data) { a[k] = data[k]; b[k] = data[k]; } a.d = -1; b.d = 1; return '<span class="step">' + B('−', act, a, 'sbtn', ' aria-label="one fewer"') + '<b>' + n + '</b>' + B('+', act, b, 'sbtn', ' aria-label="one more"') + '</span>'; }
  function inspMerchant(m) {
    var d = D.trans[m.tr], Rt = m.rt ? CH.routeOf(S, m.rt) : null, cap = CH.capFor(m, m.tr), h = head(m.nm, esc(D.abil[m.ab].n) + '. ' + esc(D.abil[m.ab].d), find(m.x, m.y)), t, g;
    var cargo = Object.keys(m.cargo).map(function (g) { return m.cargo[g] + ' ' + lc(gn(g)); });
    h += '<div class="card">' + ico('m_' + m.tr) + '<div><b>' + esc(d.n) + '</b>, ' + cap + ' loads. ' + esc(mstat(m)) + '.<br>' + (cargo.length ? 'Carrying ' + listing(cargo) + '.' : 'Carrying nothing.') + (m.qt ? '<br>Changes to ' + lc(D.trans[m.qt].n) + ' at his next stop.' : '') + '</div></div>';
    var slots = '', used = 0; for (g in m.cargo) for (t = 0; t < m.cargo[g]; t++) { slots += '<span class="slot">' + gi(g, 1) + '</span>'; used++; } for (; used < cap; used++) slots += '<span class="slot"></span>';
    h += '<div class="slots">' + slots + '</div>';
    h += '<p class="money">Last round <b class="' + tone(m.last || 0) + '">' + (m.last == null ? 'none yet' : signed(m.last)) + '</b>, this year <b class="' + tone(m.yr[0]) + '">' + signed(m.yr[0]) + '</b>, in all <b class="' + tone(m.pr) + '">' + signed(m.pr) + '</b></p>';
    h += '<label class="field"><span>Travels by</span><select data-ch="trans" data-m="' + m.id + '" data-fk="trans' + m.id + '">';
    for (t in D.trans) { var td = D.trans[t]; if (td.adv && CH.advState(S, td.adv) === 'later') continue; var q = t === m.tr ? { ok: true, cost: 0 } : CH.can.trans(S, m, t); h += '<option value="' + t + '"' + (t === m.tr ? ' selected' : '') + (q.ok ? '' : ' disabled') + '>' + esc(td.n) + ', ' + capFor(m, t) + ' loads' + (t === m.tr ? '' : q.ok ? ' (' + q.cost + ' coins' + (q.later ? ', at his next stop' : '') + ')' : ' (' + esc(lc(q.why).replace(/\.$/, '')) + ')') + '</option>'; }
    h += '</select></label><p class="hint">' + esc(d.d) + '</p>';
    h += '<h3>Route</h3><div class="rowline"><select data-ch="route" data-m="' + m.id + '" data-fk="route' + m.id + '" aria-label="Route"><option value="0">No route</option>';
    S.rt.forEach(function (q) { h += '<option value="' + q.id + '"' + (q.id === m.rt ? ' selected' : '') + '>' + esc(q.name) + '</option>'; });
    h += '</select>' + B('New route', 'newroute', { m: m.id }, 'btn') + '</div>';
    if (!Rt) h += '<p class="hint">A route is a list of markets to call at, round and round. He works out what to carry between them, and you can write exact orders for any stop. Several merchants can share one route.</p>';
    else {
      var est = CH.view.route(S, Rt, m), n = Rt.stops.length, mates = S.ms.filter(function (q) { return q.rt === Rt.id && q !== m; }).map(function (q) { return esc(q.nm); });
      h += '<label class="field"><span>Name</span><input type="text" maxlength="28" value="' + esc(Rt.name) + '" data-ch="rname" data-r="' + Rt.id + '" data-fk="rname' + Rt.id + '"></label>';
      if (mates.length) h += '<p class="hint">Shared with ' + listing(mates) + '. Changes here change their orders too.</p>';
      h += '<ol class="stops">';
      Rt.stops.forEach(function (s, k) {
        var mk = CH.mkt(S, s.m), e = est.stops[k], prev = est.stops[(k - 1 + n) % n].hold, cur = m.si === k && n > 1, a = { r: Rt.id, k: k }, rows = '', opts = '', rest = '';
        h += '<li class="stop' + (cur ? ' cur' : '') + '"><div class="sh"><span class="sn">' + (k + 1) + '</span>' + B(esc(mk.name), 'sel', { k: 'mkt', id: mk.id }, 'link big') + '<span class="sbtns">' + B('▲', 'mvstop', { r: Rt.id, k: k, d: -1 }, 'sbtn', ' aria-label="move up"') + B('▼', 'mvstop', { r: Rt.id, k: k, d: 1 }, 'sbtn', ' aria-label="move down"') + B('×', 'delstop', a, 'sbtn', ' aria-label="remove stop"') + '</span></div>';
        if (s.un === 'all') h += '<div class="ord"><span class="ol">Unload</span><span class="ov">everything on board ' + B('choose', 'unpick', a, 'link') + '</span></div>';
        else {
          var gs = {}; for (g in prev) gs[g] = 1; for (g in s.un) gs[g] = 1;
          for (g in gs) rows += '<div class="chip">' + good(g) + stepper(s.un[g] || 0, 'un', { r: Rt.id, k: k, g: g }) + '</div>';
          h += '<div class="ord"><span class="ol">Unload</span><span class="ov">' + (rows || 'nothing on board when he arrives ') + B('everything', 'unall', a, 'link') + '</span></div>';
        }
        rows = '';
        if (s.auto) {                        // left to him: he takes whatever will sell for more at the stop where it comes off
          var today = Object.keys(e.got).map(function (g) { return '<span class="rq">' + e.got[g] + gi(g, 1) + '</span>'; }).join('');
          h += '<div class="ord"><span class="ol">Load</span><span class="ov">whatever pays best ' + B('choose the goods', 'own', a, 'link') + (n > 1 ? '<span class="today">' + (today ? 'Today that is ' + today : 'Today nothing here is both cheap and worth more at ' + esc(CH.mkt(S, Rt.stops[(k + 1) % n].m).name)) + '</span>' : '') + '</span></div>';
          h += '<div class="sf">Leaves with ' + e.carry + ' of ' + est.cap + ' loads<b class="' + tone(e.money) + '">' + (Math.round(e.money) ? signed(e.money) : '') + '</b></div></li>';
          return;
        }
        for (g in s.ld) rows += '<div class="chip">' + good(g) + stepper(s.ld[g], 'ld', { r: Rt.id, k: k, g: g }) + '<span class="cs">' + (mk.stock[g] || 0) + ' here at ' + fmt(CH.price(S, mk, g)) + '</span></div>';
        var fl = CH.flows(S, mk);            // only what this market has on its shelves or makes: he cannot load what is never there
        D.goodIds.forEach(function (g) { if (s.ld[g] || (!mk.stock[g] && !(fl.p[g] > 0))) return; var o = '<option value="' + g + '">' + esc(gn(g)) + (mk.stock[g] ? ', ' + mk.stock[g] + ' in stock at ' + fmt(CH.price(S, mk, g)) : '') + '</option>'; if (mk.stock[g]) opts += o; else rest += o; });
        h += '<div class="ord"><span class="ol">Load</span><span class="ov">' + rows + '<select data-ch="addload" data-r="' + Rt.id + '" data-s="' + k + '" data-fk="addload' + Rt.id + '.' + k + '" aria-label="Add a good to load at ' + esc(mk.name) + '"><option value="">' + (opts || rest ? 'Add a good…' : 'Nothing else to load here') + '</option>' + (opts ? '<optgroup label="In stock here">' + opts + '</optgroup>' : '') + (rest ? '<optgroup label="Made here, none in stock now">' + rest + '</optgroup>' : '') + '</select><span class="today">' + B('Leave it to him', 'free', a, 'link') + '</span></span></div>';
        h += '<div class="sf">Leaves with ' + e.carry + ' of ' + est.cap + ' loads<b class="' + tone(e.money) + '">' + (Math.round(e.money) ? signed(e.money) : '') + '</b></div></li>';
      });
      h += '</ol>';
      if (est.over) h += '<p class="warn">These orders ask for more than ' + lc(d.n) + ' can carry. He loads in the order listed and leaves the rest.</p>';
      h += '<div class="rowline"><select data-ch="addstop" data-r="' + Rt.id + '" data-fk="addstop' + Rt.id + '" aria-label="Add a stop"><option value="">Add a stop…</option>';
      S.mk.forEach(function (q) { h += '<option value="' + q.id + '">' + esc(q.name) + '</option>'; });
      h += '</select>' + B(ui.pick === Rt.id ? 'Done picking' : 'Pick on the map', 'pick', { r: Rt.id }, 'btn' + (ui.pick === Rt.id ? ' on' : '')) + '</div>';
      var mine = Rt.stops.some(function (q) { return !q.auto; }), bare = !Rt.stops.some(function (q) { if (q.auto) return true; for (var g in q.ld) return true; return false; });
      if (n > 1 && mine) h += '<div class="field wide"><span>Your orders</span><div class="seg" role="group" aria-label="How he follows your orders">' + B('Only while they pay', 'strict', { r: Rt.id, v: 0 }, 'spd' + (Rt.strict ? '' : ' on'), ' aria-pressed="' + !Rt.strict + '"') + B('To the letter', 'strict', { r: Rt.id, v: 1 }, 'spd' + (Rt.strict ? ' on' : ''), ' aria-pressed="' + !!Rt.strict + '"') + '</div></div>';
      if (n > 1 && bare) h += '<p class="warn">He has no orders at any stop, so he waits where he is. Add a good to load, or leave a stop to him.</p>';
      else if (n > 1 && !Math.round(est.total) && !CH.load(m)) h += '<p class="warn">Nothing on these shelves is both cheap and worth more at the next stop today, so he waits. Try other markets, or build something that needs what they make.</p>';
      if (n > 1) h += '<p class="est">At today’s prices a round would make about <b class="' + tone(est.total) + '">' + signed(est.total) + '</b>. ' + (!mine ? 'Left to himself he buys what is cheap where he stands and will sell for more at the next stop. Choose the goods at any stop to give him exact orders.' : Rt.strict ? 'Where you wrote the orders he follows them to the letter, even at a loss, and waits a while for goods that are not there.' : 'Where you wrote the orders, the numbers are the most he will load: he buys a load only while it will sell for more at the stop where it comes off.') + '</p>';
      else h += '<p class="hint">Add at least two stops. He will work out what to carry between them, and you can change his orders at any stop.</p>';
    }
    return h + '<p class="foot">' + B('Dismiss ' + esc(m.nm), 'dismiss', { m: m.id }, 'link danger') + '</p>';
  }
  function capFor(m, t) { return CH.capFor(m, t); }
  function inspBld(b) {
    var d = D.bld[b.t], m = b.mk ? CH.mkt(S, b.mk) : null, h = head(d.n, m ? 'In ' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '’s market' : 'No market reaches it yet', find(b.x, b.y));
    h += '<div class="card">' + ico('b_' + b.t) + '<div>' + esc(d.d) + '</div></div>';
    if (d.kind === 'works') {
      h += '<p><b>' + (b.own ? 'Yours.' : 'A local craftsman’s.') + '</b> ' + esc(bstat(b)) + '.</p>' + recipePics(d) + (m ? '<p>' + batch(d, m) + '.</p>' : '') + '<p class="hint">' + recipe(d) + '. It buys what it needs from the market and sells what it makes back to it.</p>';
      if (b.own) {
        h += '<div class="seg" role="group" aria-label="When it works">' + [['auto', 'When it pays'], ['on', 'Always'], ['off', 'Never']].map(function (q) { return B(q[1], 'mode', { id: b.id, mode: q[0] }, 'spd' + (b.mode === q[0] ? ' on' : ''), ' aria-pressed="' + (b.mode === q[0]) + '"'); }).join('') + '</div>';
        h += '<p class="money">This year <b class="' + tone(b.pr[0]) + '">' + signed(b.pr[0]) + '</b>, last year <b class="' + tone(b.pr[1]) + '">' + signed(b.pr[1]) + '</b>. ' + b.n + ' batches made.</p>';
      } else if (m) h += gated('Buy it for ' + CH.buyCost(b), 'buybld', { id: b.id }, S.coins >= CH.buyCost(b) ? { ok: true } : { ok: false, why: 'Costs ' + CH.buyCost(b) + ' coins.' }, 'btn wide') + '<p class="hint">It works whenever it pays, whoever owns it. Owned, its profit is yours and you can keep it running at a loss or shut it.</p>';
    } else if (d.kind === 'demand') {
      h += '<table class="tbl"><thead><tr><th>Buys</th><th class="num">A year</th><th class="num">On the shelves</th><th class="num">Pays</th></tr></thead><tbody>';
      d.want.forEach(function (e) { if (!CH.live(S, e)) return; h += '<tr><td>' + good(e.g) + '</td><td class="num">' + rate(TPY / e.per) + '</td><td class="num">' + (m ? (m.stock[e.g] || 0) : '') + '</td><td class="num ' + (m && CH.price(S, m, e.g) >= 1.35 * G[e.g].p ? 'dear' : '') + '">' + (m ? fmt(CH.price(S, m, e.g)) : '') + '</td></tr>'; });
      h += '</tbody></table><p class="hint">It takes what it wants from the market’s shelves. Sell to the market and the price you get depends on how bare those shelves are.</p>';
    }
    return h;
  }
  function inspSite(i) {
    var s = WD.sites[i], d = D.sites[s.t], q = S.st[i], m = q.mk ? CH.mkt(S, q.mk) : null, h = head(d.n, m ? 'In ' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '’s market' : 'Outside every market', find(s.x, s.y));
    h += '<div class="card">' + ico('s_' + s.t) + '<div>Makes ' + rate(TPY / d.per) + ' loads of ' + gi(d.g) + ' ' + lc(gn(d.g)) + ' a year once a market reaches it.</div></div>';
    h += '<p>' + (!m ? 'Idle. Found a market close enough for its reach to cover this tile and the site starts working, with a year’s worth ready on the first day.' : q.on ? 'Working.' : 'Idle: ' + lc(gn(d.g)) + ' sells at the floor price in ' + esc(m.name) + ', so nobody bothers. It starts again when the pile is bought down.') + '</p>';
    if (m) {
      var f = CH.flows(S, m), n = 0; WD.sites.forEach(function (w, k) { if (w.t === s.t && S.st[k].mk === m.id) n++; });
      h += '<h3>' + esc(gn(d.g)) + ' in ' + esc(m.name) + '</h3><table class="tbl facts"><tbody>' +
        '<tr><td>On the shelves</td><td class="num"><b>' + (m.stock[d.g] || 0) + '</b> loads</td></tr>' +
        '<tr><td>Price today</td><td class="num"><b class="' + pcls(m, d.g) + '">' + fmt(CH.price(S, m, d.g)) + '</b> a load <span class="dim">(usually ' + G[d.g].p + ')</span></td></tr>' +
        '<tr><td>The market makes</td><td class="num"><b>' + rate(f.p[d.g] || 0) + '</b> a year' + (n > 1 ? ' <span class="dim">from ' + n + ' ' + esc(lc(d.pl)) + '</span>' : '') + '</td></tr>' +
        '<tr><td>and uses</td><td class="num"><b>' + (rate(f.c[d.g] || 0) || '0') + '</b> a year</td></tr></tbody></table>' +
        '<p class="hint">' + ((f.p[d.g] || 0) > (f.c[d.g] || 0) ? 'More is made here than is used, so the rest piles up and gets cheap: a good thing to carry away.' : 'The town uses all it makes, so little is left to carry away.') + '</p>';
    }
    return h;
  }
  function inspHQ() {
    return head('The counting house', 'Where the house keeps its books', find(WD.hq.x, WD.hq.y)) + '<div class="card">' + ico('hq') + '<div>New merchants start here. A merchant standing here can change how he travels, and take a boat from the wharf below.</div></div>' + B('Hire a merchant for ' + fmt(CH.hireCost(S)), 'modal', { name: 'hire' }, 'btn wide');
  }
  function inspTool() {
    var t = ui.tool, d = toolDef(t.k, t.t), h = head(d.n, 'Costs ' + d.cost) + '<div class="card">' + ico(d.ic) + '<div>' + esc(d.d) + '</div></div>';
    if (t.k === 'market') h += '<p class="hint">Two markets cannot share ground, so leave room to enlarge. A market cannot be moved or removed.</p>';
    if (t.k === 'bld') h += '<p class="hint">Place it on open ground inside a market’s reach.' + (D.bld[t.t].kind === 'works' ? ' It draws its supplies from that market, so put it where they are cheap.' : D.bld[t.t].kind === 'demand' ? ' One to a market.' : '') + '</p>';
    if (t.k === 'path') h += '<p class="hint">Click where the path starts, then where it ends. The cheapest line between is laid for you, bridges included, and you can carry on from the end. A house in the way moves aside.</p>';
    return h + B('Put the tool down', 'cancel', null, 'btn wide');
  }
  function renderInspect() {
    var s = ui.sel, h, o;
    if (ui.tool) h = inspTool();
    else if (!s) h = inspHouse();
    else if (s.k === 'mkt' && (o = CH.mkt(S, s.id))) h = inspMarket(o);
    else if (s.k === 'm' && (o = merchant(s.id))) h = inspMerchant(o);
    else if (s.k === 'bld' && (o = bld(s.id))) h = inspBld(o);
    else if (s.k === 'site') h = inspSite(s.i);
    else if (s.k === 'hq') h = inspHQ();
    else { ui.sel = null; h = inspHouse(); }
    if (s && !ui.tool) h = '<p class="back">' + B('‹ The house', 'sel', { k: '' }, 'link') + '</p>' + h;
    setHTML($('inspect'), h);
  }
  function renderTabs() {
    var t = [['house', 'Goals'], ['build', 'Build'], ['merch', 'Merchants'], ['sel', ui.sel ? 'Chosen' : 'House']], h = '';
    if (ui.tab === 'sel' && !ui.sel && !ui.tool) ui.tab = 'house';
    t.forEach(function (q) { if (q[0] === 'sel' && !ui.sel && !ui.tool) return; h += B(q[1], 'tab', { t: q[0] }, 'tabb' + (ui.tab === q[0] ? ' on' : ''), ' aria-pressed="' + (ui.tab === q[0]) + '"'); });
    setHTML($('tabs'), h); $('stage').setAttribute('data-tab', ui.tab);
  }
  function renderLens() {                   // every good in play, with how much of it your markets hold; pick one to see its price everywhere
    var seen = {}, tot = {}, used = {}, h = '';
    WD.sites.forEach(function (s) { var d = D.sites[s.t]; if (CH.live(S, d)) seen[d.g] = 1; });
    S.mk.forEach(function (m) { var f = CH.flows(S, m); D.goodIds.forEach(function (g) { var s = m.stock[g] || 0; if (s || f.c[g] > 0 || f.p[g] > 0) seen[g] = 1; if (f.c[g] > 0) used[g] = 1; tot[g] = (tot[g] || 0) + s; }); });
    if (ui.lens && !G[ui.lens]) ui.lens = null;
    D.goodIds.forEach(function (g) {
      if (!seen[g] && ui.lens !== g) return; var on = ui.lens === g, n = tot[g] || 0;
      h += B(gi(g) + '<span class="' + (!S.mk.length ? '' : !n && used[g] ? 'neg' : !n ? 'dim' : '') + '">' + (S.mk.length ? n : '') + '</span>', 'lens', { g: g }, 'lb' + (on ? ' on' : ''), ' aria-pressed="' + on + '" title="' + esc(gn(g)) + '" aria-label="' + esc(gn(g)) + (S.mk.length ? ', ' + n + ' loads in your markets' : '') + '. Show it on the map."');
    });
    setHTML($('lens'), h);
    var cap = $('lenscap'), g = ui.lens;
    cap.hidden = !g; setHTML(cap, g ? '<span><b>' + esc(gn(g)) + '</b>, usually ' + G[g].p + ' a load. Each market shows its price and stock; gold rings mark who makes or wants it.</span>' + B('Clear', 'lens', { g: g }, 'btn tiny') : '');
    setHTML($('zoom'), B('+', 'zoom', { d: 1 }, 'sbtn', ' aria-label="Zoom in"') + B('−', 'zoom', { d: -1 }, 'sbtn', ' aria-label="Zoom out"') +
      B('◇', 'reach', null, 'sbtn' + (ui.reach ? ' on' : ''), ' aria-pressed="' + !!ui.reach + '" aria-label="Show every market’s reach" title="Show every market’s reach"') +
      B('◉', 'plain', null, 'sbtn' + (ui.plain ? '' : ' on'), ' aria-pressed="' + !ui.plain + '" aria-label="Show goods and needs on the map" title="Show goods and needs on the map"'));
  }
  function renderBanner() {
    var t = ui.tool, el = $('banner'), h = '', pv = ui.preview;
    if (t) {
      var d = toolDef(t.k, t.t);
      if (t.k === 'path') {
        h = t.from == null ? '<b>' + esc(d.n) + '</b>, ' + d.cost + '. Click where it starts.' : t.pend != null && pv && pv.tiles ? '<b>' + pv.n + ' tiles of ' + lc(d.n) + '</b> for ' + pv.cost + ' coins. ' + (pv.ok ? '</span>' + B('Lay it', 'lay', null, 'btn gold') + '<span>' : esc(pv.why || '')) : '<b>' + esc(d.n) + '</b>. Now click where it ends.' + (pv && pv.tiles ? ' ' + pv.n + ' tiles, ' + pv.cost + ' coins.' : '');
      } else h = '<b>' + esc(d.n) + '</b>, ' + d.cost + ' coins. ' + (t.k === 'market' ? 'Click where it should stand.' : 'Click inside a market’s reach.');
      h = '<span>' + h + '</span>' + B(t.k === 'path' && t.from != null ? 'Finish' : 'Cancel', 'cancel', null, 'btn');
    } else if (ui.pick) { var m = selM(); h = '<span>Click each market ' + (m ? esc(m.nm) : 'he') + ' should call at, in order.</span>' + B('Done', 'pick', { r: ui.pick }, 'btn gold'); }
    el.hidden = !h; setHTML(el, h);
  }

  /* ---------- dialogs ---------- */
  var MODALS = {
    help: function () {
      return ['How the house makes money',
        '<p class="lede">Malacca, 1400. You keep a merchant house with ' + fmt(D.startCoins) + ' coins and a hundred and eleven years to grow rich.</p><ol class="how"><li><b>Found a market.</b> Everything inside its reach trades through it: paddies, mines and fisheries start working, and their goods pile up on its shelves.</li>' +
        '<li><b>Houses come and go by themselves.</b> Families settle where rice and fish are always on the shelves, with at least two of salt, cloth and pottery. Bare shelves send them away.</li>' +
        '<li><b>Merchants do the carrying.</b> Hire one and click the markets he should call at. Left to himself he buys whatever is cheap where he stands and dear at his next stop. At any stop you can write his orders yourself: exactly what to unload and what to load, to the letter if you wish.</li>' +
        '<li><b>Lay trails and roads</b> between markets. Porters crawl across open country and stride along a trail.</li>' +
        '<li><b>Build workshops</b> inside a market’s reach to turn cheap goods into dear ones, and buildings that buy what towns do not.</li>' +
        '<li><b>Buy advances</b> as they come up: boats, elephants, ox carts, smelting. Each costs less the longer you wait, and old trades die as new ones arrive.</li></ol>' +
        '<h3>Reading the map</h3><ul class="legend"><li><i class="lg ok"></i><span>A disc over a site or workshop shows what it makes. Green ring: working. Pale: idle. Red: waiting for the good shown.</span></li>' +
        '<li><i class="lg low"></i><span>Discs over a palace, mosque or yard show what it buys. Red means its shelves are bare, so the price is good.</span></li>' +
        '<li><i class="lg mid"></i><span>Under a market’s name, discs show what its houses need: green supplied, gold patchy, red missing. Squares with a small tick show what it has to spare, cheap.</span></li>' +
        '<li><i class="lg"></i><span>Over a merchant: what he carries. A dotted ring means empty hands. Point at anything, or at its tag, for the figures: what it makes in a year, what is on the shelves, today’s price. Pick a good from the bar above the map to see its price at every market.</span></li></ul>' +
        '<p class="hint">Drag the map to move, scroll or pinch to zoom. Space pauses, 1 to 4 set the speed, Esc puts a tool down. The books close in ' + D.span[1] + ': your rank is the coin you hold then.</p>' +
        '<div class="mfoot">' + B('New game', 'asknew', null, 'btn') + B(S.tick ? 'Back to the map' : 'Begin', 'close', null, 'btn gold', ' data-autofocus') + '</div>' +
        (ui.canStore ? '' : '<p class="hint">This browser is not letting the page keep a save, so the game lasts only while the page stays open.</p>')];
    },
    hire: function () {
      var cost = CH.hireCost(S), h = '<p>Each merchant brings one gift. He starts at the counting house with a file of porters.</p><div class="cands">';
      S.cand.forEach(function (c, k) { h += '<div class="cand"><h3>' + esc(c.nm) + '</h3><p><b>' + esc(D.abil[c.ab].n) + '.</b> ' + esc(D.abil[c.ab].d) + '</p>' + gated(cost ? 'Hire for ' + fmt(cost) : 'Hire', 'hire', { k: k }, S.ms.length >= D.hire.cap ? { ok: false, why: 'Thirty merchants is all the house can keep.' } : S.coins >= cost ? { ok: true } : { ok: false, why: 'Hiring costs ' + cost + ' coins.' }, 'btn gold') + '</div>'; });
      return ['Hire a merchant', h + '</div><p class="hint">' + (cost ? '' : 'The first joins for nothing. ') + 'Each hire costs more than the last. A merchant draws ' + D.hire.wage + ' coins a year, plus the keep of whatever carries his goods. New faces turn up every year.</p>'];
    },
    adv: function () {
      var av = '', own = '', later = '', id;
      for (id in D.adv) {
        var a = D.adv[id], s = CH.advState(S, id), p = CH.advPrice(S, id);
        if (s === 'avail') av += '<li><div><h3>' + esc(a.n) + '</h3><p>' + esc(a.d) + '</p></div>' + gated('Buy for ' + fmt(p), 'adv', { id: id }, S.coins >= p ? { ok: true } : { ok: false, why: 'Costs ' + p + ' coins.' }, 'btn gold') + '</li>';
        else if (s === 'own') own += '<li>' + esc(a.n) + '</li>'; else later += '<li>' + esc(a.n) + '<span class="dim"> around ' + a.y + '</span></li>';
      }
      return ['Advances', (av ? '<ul class="advs">' + av + '</ul><p class="hint">An advance gets cheaper every year and is free to all after fifteen. Buying early buys time.</p>' : '<p>Nothing new is on offer just now.</p>') +
        (later ? '<h3>Still to come</h3><ul class="cols">' + later + '</ul>' : '') + (own ? '<h3>Yours</h3><ul class="cols">' + own + '</ul>' : '')];
    },
    prices: function () {
      if (!S.mk.length) return ['Prices', '<p>No markets yet. Found one and its prices appear here.</p>'];
      var h = '<div class="scroll"><table class="tbl grid"><thead><tr><th>Good</th>', seen = {};
      S.mk.forEach(function (m) { h += '<th class="num">' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '</th>'; CH.view.market(S, m).forEach(function (w) { seen[w.g] = 1; }); });
      h += '</tr></thead><tbody>';
      D.goodIds.forEach(function (g) {
        if (!seen[g]) return; h += '<tr><td>' + good(g) + '<span class="dim"> ' + G[g].p + '</span></td>';
        S.mk.forEach(function (m) { var f = CH.flows(S, m), t = CH.tOf(f, g), s = m.stock[g] || 0, p = CH.price(S, m, g), mu = p / G[g].p; h += '<td class="num ' + (!t ? 'dim' : mu >= 1.35 ? 'dear' : mu <= 0.75 ? 'cheap' : '') + '" title="' + s + ' in stock">' + (t || s ? fmt(p) + (s ? '<sub>' + s + '</sub>' : '') : '') + '</td>'; });
        h += '</tr>';
      });
      return ['Prices', h + '</tbody></table></div><p class="hint">The price of one load in each market, with the stock beside it. The grey figure after each name is the usual price. <span class="cheap">Cheap</span> is three-quarters of that or less, <span class="dear">dear</span> a third more or better. Dim figures are goods nobody there uses: they sell for very little.</p>', 'wide'];
    },
    ledger: function () {
      var cats = [['sales', 'Goods sold'], ['buys', 'Goods bought'], ['works', 'Workshops'], ['wages', 'Wages and keep'], ['build', 'Building'], ['hire', 'Hiring and transport'], ['adv', 'Advances'], ['goals', 'Guild rewards']], c = S.led.cur, p = S.led.prev, tc = 0, tp = 0;
      var h = '<p>Rank: <b>' + CH.rank(S.coins) + '</b>. ' + D.ranks.map(function (r) { return r[1] + ' from ' + fmt(r[0]); }).join(', ') + '.</p><table class="tbl"><thead><tr><th></th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
      cats.forEach(function (q) { var a = c[q[0]] || 0, b = p[q[0]] || 0; tc += a; tp += b; if (Math.round(a) || Math.round(b)) h += '<tr><td>' + q[1] + '</td><td class="num ' + tone(a) + '">' + signed(a) + '</td><td class="num ' + tone(b) + '">' + signed(b) + '</td></tr>'; });
      h += '<tr class="sum"><td>In all</td><td class="num ' + tone(tc) + '">' + signed(tc) + '</td><td class="num ' + tone(tp) + '">' + signed(tp) + '</td></tr></tbody></table>';
      if (S.ms.length) {
        h += '<h3>Merchants</h3><div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Travels by</th><th>Route</th><th class="num">Last round</th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
        S.ms.forEach(function (m) { var Rt = m.rt && CH.routeOf(S, m.rt); h += '<tr><td>' + B(esc(m.nm), 'sel', { k: 'm', id: m.id }, 'link') + '</td><td>' + D.trans[m.tr].n + '</td><td>' + (Rt ? esc(Rt.name) : '<span class="neg">none</span>') + '</td><td class="num ' + tone(m.last || 0) + '">' + (m.last == null ? '' : signed(m.last)) + '</td><td class="num ' + tone(m.yr[0]) + '">' + signed(m.yr[0]) + '</td><td class="num ' + tone(m.yr[1]) + '">' + signed(m.yr[1]) + '</td></tr>'; });
        h += '</tbody></table></div>';
      }
      var mine = S.bl.filter(function (b) { return b.own && D.bld[b.t].kind === 'works'; });
      if (mine.length) {
        h += '<h3>Your workshops</h3><table class="tbl"><thead><tr><th>Workshop</th><th>Market</th><th>State</th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
        mine.forEach(function (b) { h += '<tr><td>' + B(D.bld[b.t].n, 'sel', { k: 'bld', id: b.id }, 'link') + '</td><td>' + esc(CH.mkt(S, b.mk).name) + '</td><td>' + esc(bstat(b)) + '</td><td class="num ' + tone(b.pr[0]) + '">' + signed(b.pr[0]) + '</td><td class="num ' + tone(b.pr[1]) + '">' + signed(b.pr[1]) + '</td></tr>'; });
        h += '</tbody></table>';
      }
      return ['Ledger', h, 'wide'];
    },
    over: function () {
      var n = D.goals.filter(function (g) { return S.goals[g.id]; }).length;
      return ['The books are closed', '<p class="final">' + D.span[1] + '. A Portuguese fleet stands off Malacca. The house holds <b>' + fmt(S.final) + ' coins</b>. Your rank: <b>' + CH.rank(S.final) + '</b>.</p><p>' + n + ' of ' + D.goals.length + ' goals met. The largest town reached ' + (S.top || 0) + ' houses.</p><div class="mfoot">' + B('New game', 'asknew', null, 'btn') + B('Keep trading', 'close', null, 'btn gold', ' data-autofocus') + '</div>'];
    },
    confirm: function () { var c = ui.confirm; return [c.title, '<p>' + esc(c.text) + '</p><div class="mfoot">' + B('Cancel', 'close', null, 'btn', ' data-autofocus') + B(c.yes, c.act, c.data, 'btn gold') + '</div>']; }
  };
  function renderModal(first) {
    var el = $('modal'); if (!ui.modal) { el.hidden = true; el.__h = ''; el.innerHTML = ''; return; }
    var m = MODALS[ui.modal]();
    el.hidden = false;
    setHTML(el, '<div class="dialog ' + (m[2] || '') + '" role="dialog" aria-modal="true" aria-labelledby="mt"><header><h2 id="mt">' + m[0] + '</h2>' + B('×', 'close', null, 'x', ' aria-label="Close"') + '</header><div class="body">' + m[1] + '</div></div>');
    if (first) { var f = el.querySelector('.body [data-autofocus]') || el.querySelector('.body button, .body select') || el.querySelector('button'); if (f) f.focus({ preventScroll: true }); var dg = el.querySelector('.dialog'); if (dg) dg.scrollTop = 0; }
  }
  function openModal(name) { ui.back = doc.activeElement; ui.modal = name; renderModal(true); }
  function closeModal() { ui.modal = null; ui.confirm = null; renderModal(); if (ui.back && doc.contains(ui.back)) ui.back.focus(); refresh(); }
  function ask(title, text, yes, act, data) { ui.confirm = { title: title, text: text, yes: yes, act: act, data: data }; openModal('confirm'); }

  /* ---------- what buttons do ---------- */
  function setTool(t) { ui.tool = t; ui.preview = null; ui.pick = null; prevKey = ''; if (t) ui.tab = 'build'; refresh(); }
  function sweep() { S.rt.filter(function (r) { return !r.stops.length && !S.ms.some(function (q) { return q.rt === r.id; }); }).forEach(function (r) { CH.act.delRoute(S, r); }); }   // routes nobody ever filled in
  function startRoute(m) { CH.act.setRoute(S, m, 0); sweep(); var q = CH.act.newRoute(S); q.R.an = 1; CH.act.setRoute(S, m, q.R.id); ui.pick = q.R.id; ui.tool = null; }
  function addStop(Rt, id) {                // a route nobody has named takes the names of its markets
    var q = CH.act.addStop(S, Rt, id); if (!run(q)) return;
    if (Rt.an && Rt.stops.length > 1) { var a = CH.mkt(S, Rt.stops[0].m).name, b = CH.mkt(S, Rt.stops[Rt.stops.length - 1].m).name; Rt.name = (Rt.stops.length === 2 ? a + ' and ' + b : a + ' round').slice(0, 28); }
  }
  var ACT = {
    why: function (d) { toast(d.why); },
    pause: function () { ui.paused = !ui.paused; },
    speed: function (d) { ui.speed = +d.v; ui.paused = false; },
    tab: function (d) { ui.tab = d.t; if (d.t === 'house') { ui.sel = null; ui.tool = null; ui.pick = null; } },
    modal: function (d) { openModal(d.name); },
    close: function () { closeModal(); },
    tool: function (d) { var t = d.k === 'market' ? +d.t : d.t; if (ui.tool && ui.tool.k === d.k && ui.tool.t === t) setTool(null); else setTool({ k: d.k, t: t, from: null, pend: null }); },
    cancel: function () { setTool(null); },
    lay: function () { layPath(ui.tool.pend); },
    sel: function (d) { if (ui.modal) closeModal(); if (!d.k) return select(null); var s = { k: d.k, id: +d.id }, o; if (d.k === 'bld' && (o = bld(d.id))) s.at = [o.x, o.y]; select(s); if (d.k === 'mkt' && (o = CH.mkt(S, +d.id)) && !onScreen(o.x, o.y)) R.center(st, ui.cam, o.x, o.y); },
    center: function (d) { R.center(st, ui.cam, +d.x, +d.y); if (ui.tab !== 'sel') ui.tab = 'sel'; },
    zoom: function (d) { zoomAt(st.vw / 2, st.vh / 2, +d.d > 0 ? 1.35 : 1 / 1.35); },
    reach: function () { ui.reach = !ui.reach; },
    hire: function (d) {
      var q = CH.act.hire(S, +d.k); if (!run(q)) return;
      closeModal(); select({ k: 'm', id: q.m.id }); if (!onScreen(q.m.x, q.m.y)) R.center(st, ui.cam, q.m.x, q.m.y);
      if (S.mk.length > 1) { startRoute(q.m); toast(q.m.nm + ' joins the house. Click the markets he should call at, in order.'); }      // straight to work: a route of his own, ready for its stops
      else toast(q.m.nm + ' joins the house. He needs two markets to carry between.');
    },
    dismiss: function (d) { var m = merchant(d.m); if (m) ask('Dismiss ' + m.nm + '?', 'He leaves the house for good, with whatever he is carrying. Hiring a replacement costs ' + fmt(CH.hireCost(S)) + ' coins.', 'Dismiss him', 'dismiss2', { m: m.id }); },
    dismiss2: function (d) { var m = merchant(d.m); if (m) CH.act.dismiss(S, m); closeModal(); select(null); },
    newroute: function (d) { startRoute(merchant(d.m)); toast('Click the markets he should call at, in order. He works out what to carry between them.'); },
    own: function (d) { run(CH.act.own(S, CH.routeOf(S, +d.r), +d.k)); },
    free: function (d) { run(CH.act.free(S, CH.routeOf(S, +d.r), +d.k)); },
    strict: function (d) { CH.act.strict(S, CH.routeOf(S, +d.r), +d.v); },
    lens: function (d) { ui.lens = ui.lens === d.g ? null : d.g; },
    plain: function () { ui.plain = !ui.plain; },
    pick: function (d) { ui.pick = ui.pick === +d.r ? null : +d.r; ui.tool = null; },
    delstop: function (d) { CH.act.delStop(S, CH.routeOf(S, +d.r), +d.k); },
    mvstop: function (d) { CH.act.moveStop(S, CH.routeOf(S, +d.r), +d.k, +d.d); },
    ld: function (d) { var Rt = CH.routeOf(S, +d.r), s = Rt.stops[+d.k]; CH.act.setLoad(S, Rt, +d.k, d.g, (s.ld[d.g] || 0) + (+d.d)); },
    un: function (d) { var Rt = CH.routeOf(S, +d.r), s = Rt.stops[+d.k]; CH.act.setUnload(S, Rt, +d.k, d.g, ((s.un !== 'all' && s.un[d.g]) || 0) + (+d.d)); },
    unpick: function (d) { CH.act.setUnload(S, CH.routeOf(S, +d.r), +d.k, null); },
    unall: function (d) { CH.act.setUnload(S, CH.routeOf(S, +d.r), +d.k, 'all'); },
    enlarge: function (d) { var m = CH.mkt(S, +d.id); run(CH.act.enlarge(S, m)); },
    buybld: function (d) { run(CH.act.buyBld(S, bld(d.id)), 'It is yours.'); },
    mode: function (d) { run(CH.act.mode(S, bld(d.id), d.mode)); },
    adv: function (d) { run(CH.act.buyAdv(S, d.id), D.adv[d.id].n + ' is yours.'); },
    asknew: function () { ask('Start a new game?', 'The game in progress is lost.', 'Start again', 'newgame'); },
    newgame: function () { closeModal(); newGame(); openModal('help'); }
  };
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) { if (e.target.id === 'modal') closeModal(); return; }
    var f = ACT[b.getAttribute('data-act')]; if (f) { f(b.dataset, b); refresh(); if (ui.modal) renderModal(); }
  }
  function onChange(e) {
    var t = e.target, ch = t.getAttribute && t.getAttribute('data-ch'), v = t.value, m, Rt; if (!ch) return;
    if (ch === 'trans') { m = merchant(t.getAttribute('data-m')); var q = CH.act.trans(S, m, v); run(q, q.ok ? (q.later ? m.nm + ' will change to ' + lc(D.trans[v].n) + ' at his next stop.' : m.nm + ' now travels by ' + lc(D.trans[v].n) + '.') : ''); }
    else if (ch === 'route') { m = merchant(t.getAttribute('data-m')); CH.act.setRoute(S, m, +v); ui.pick = null; sweep(); }
    else if (ch === 'addstop' && v) addStop(CH.routeOf(S, +t.getAttribute('data-r')), +v);
    else if (ch === 'addload' && v) { Rt = CH.routeOf(S, +t.getAttribute('data-r')); CH.act.setLoad(S, Rt, +t.getAttribute('data-s'), v, 1); }
    else if (ch === 'rname') { Rt = CH.routeOf(S, +t.getAttribute('data-r')); v = v.trim().slice(0, 28); if (Rt && v) { Rt.name = v; Rt.an = 0; } }
    if (t.tagName === 'SELECT') t.blur();
    $('inspect').__h = ''; refresh();
  }

  /* ---------- the map: pointer, tools, keys ---------- */
  function onScreen(x, y) { var p = R.toScreen(st, ui.cam, x, y); return p[0] > 40 && p[1] > 60 && p[0] < st.vw - 40 && p[1] < st.vh - 40; }
  function zoomAt(sx, sy, k) { var c = ui.cam, wx = sx / c.z + c.x, wy = sy / c.z + c.y; c.z = Math.max(R.minZoom(st), Math.min(2, c.z * k)); c.x = wx - sx / c.z; c.y = wy - sy / c.z; R.clamp(st, c); }
  function inMap(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
  function updatePreview() {
    var t = ui.tool, hv = ui.hover; if (!t || !hv || !inMap(hv[0], hv[1])) { ui.preview = null; prevKey = ''; return; }
    var i = hv[1] * W + hv[0], key = t.k + t.t + ':' + t.from + ':' + i + ':' + CH.rt(S).pv + ':' + CH.rt(S).tv + ':' + Math.floor(S.coins / 50), q;
    if (key === prevKey) return; prevKey = key;
    if (t.k === 'market') {
      q = CH.can.market(S, hv[0], hv[1], t.t); var blocks = [];
      if (q.ok) S.mk.forEach(function (m) {            // would this one take the ground a neighbour needs to grow?
        if (m.sz >= D.sizes.length - 1) return; var r2 = D.sizes[m.sz + 1].r, hit = false;
        CH.disc(hv[0], hv[1], D.sizes[t.t].r, function (i, x, y) { var dx = x - m.x, dy = y - m.y; if (dx * dx + dy * dy <= r2 * r2 + r2) hit = true; });
        if (hit) blocks.push(m.name);
      });
      ui.preview = { reach: D.sizes[t.t].r, x: hv[0], y: hv[1], ok: q.ok, why: q.why, ghost: 'market' + t.t, cover: CH.cover(S, hv[0], hv[1], t.t, 0), blocks: blocks };
    }
    else if (t.k === 'bld') { q = CH.can.build(S, t.t, hv[0], hv[1]); ui.preview = { ok: q.ok, why: q.why, ghost: 'b_' + t.t, m: q.m }; }
    else if (t.from == null) { q = CH.layCost(S, t.t, i); ui.preview = { ok: q >= 0, why: q < 0 ? 'Start on open ground or at a market.' : '' }; }
    else { q = CH.planPath(S, t.t, t.from, t.pend != null ? t.pend : i); ui.preview = q.ok ? { ok: S.coins >= q.cost && q.n > 0, tiles: q.tiles, from: t.from, cost: q.cost, n: q.n, why: !q.n ? 'That stretch is already laid.' : S.coins < q.cost ? 'Costs ' + q.cost + ' coins. You have ' + Math.floor(S.coins) + '.' : '' } : { ok: false, from: t.from, why: q.why }; }
  }
  function coverText(c) {
    var a = [], t; for (t in c.sites) a.push(c.sites[t] > 1 ? c.sites[t] + ' ' + D.sites[t].pl : (/^[aeiou]/i.test(D.sites[t].n) ? 'an ' : 'a ') + lc(D.sites[t].n));
    c.blds.forEach(function (b) { a.push('the ' + (b === 'istana' ? D.bld[b].n : lc(D.bld[b].n))); }); if (c.houses) a.push(c.houses + (c.houses > 1 ? ' houses' : ' house'));
    return a.length ? 'Takes in ' + listing(a) + '.' : 'Nothing here for a market to work with.';
  }
  function tipText() {                      // with a tool in hand, the pointer says what the tool would do there
    var pv = ui.preview, t = ui.tool;
    if (t) { if (!pv) return ''; if (!pv.ok) return pv.why || ''; if (t.k === 'market') return coverText(pv.cover) + (pv.blocks.length ? ' So close, it would stop ' + listing(pv.blocks) + ' from ever being enlarged.' : ''); if (t.k === 'bld') return 'In ' + pv.m.name + '’s market.'; if (pv.tiles) return pv.n + ' tiles, ' + pv.cost + ' coins.'; return ''; }
    return '';
  }
  function layPath(end) {
    var t = ui.tool, q = CH.act.path(S, t.t, t.from, end);
    if (run(q)) { t.from = end; t.pend = null; prevKey = ''; toast(q.n + ' tiles laid for ' + q.cost + ' coins. Click on to carry on from here.'); } else { t.pend = null; prevKey = ''; }
  }
  function mapClick(sx, sy) {
    var p = R.pick(st, S, ui.cam, sx, sy, !!ui.tool), t = ui.tool, tt = R.toTile(st, ui.cam, sx, sy), x = Math.round(tt[0]), y = Math.round(tt[1]), q;
    if (t) {
      if (t.k === 'path' && (p.k === 'mkt' || p.k === 'hq')) { x = p.x; y = p.y; }      // a click on a market's stalls means the market
      if (!inMap(x, y)) return;
      ui.hover = [x, y]; prevKey = '';
      if (t.k === 'market') { q = CH.act.market(S, x, y, t.t); if (run(q)) { setTool(null); select({ k: 'mkt', id: q.m.id }); } }
      else if (t.k === 'bld') { q = CH.act.build(S, t.t, x, y); if (run(q)) { setTool(null); select({ k: 'bld', id: q.b.id, at: [x, y] }); } }
      else if (t.from == null) { if (CH.layCost(S, t.t, y * W + x) < 0) toast('Start on open ground or at a market.'); else t.from = y * W + x; }
      else if (ui.touch) { t.pend = y * W + x; updatePreview(); }
      else layPath(y * W + x);
      refresh(); return;
    }
    if (ui.pick) {                           // choosing stops: the market itself, its sign, or anything inside its reach will do, and a stray click changes nothing
      var mk = p.k === 'mkt' ? p.o.m : p.k === 'house' && p.o.h[2] ? CH.mkt(S, p.o.h[2]) : p.k === 'bld' && p.o.b.mk ? CH.mkt(S, p.o.b.mk) : p.k === 'site' && S.st[p.o.i].mk ? CH.mkt(S, S.st[p.o.i].mk) : null;
      if (!mk && inMap(x, y) && CH.rt(S).own[y * W + x]) mk = CH.mkt(S, CH.rt(S).own[y * W + x]);
      if (mk) addStop(CH.routeOf(S, ui.pick), mk.id); else toast('Click a market, or anywhere inside its reach. Press Done when the route is complete.');
      refresh(); return;
    }
    if (p.k === 'm') select({ k: 'm', id: p.m.id });
    else if (p.k === 'mkt') select({ k: 'mkt', id: p.o.m.id });
    else if (p.k === 'bld') select({ k: 'bld', id: p.o.b.id, at: [p.x, p.y] });
    else if (p.k === 'site') { if (CH.live(S, D.sites[WD.sites[p.o.i].t])) select({ k: 'site', i: p.o.i, at: [p.x, p.y] }); }
    else if (p.k === 'hq') select({ k: 'hq', at: [p.x, p.y] });
    else if (p.k === 'house' && p.o.h[2]) select({ k: 'mkt', id: p.o.h[2] });
    else if (!ui.pick) select(null);
  }
  function bindMap() {
    var cv = $('map'), ptrs = {}, drag = null, pinch = null;
    function pos(e) { var b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; }
    cv.addEventListener('pointerdown', function (e) {
      if (e.button === 2) return;
      var p = pos(e); ptrs[e.pointerId] = p; ui.touch = e.pointerType === 'touch'; try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      var ids = Object.keys(ptrs);
      if (ids.length === 1) drag = { x: p[0], y: p[1], cx: ui.cam.x, cy: ui.cam.y, moved: false };
      else if (ids.length === 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: ui.cam.z }; if (drag) drag.moved = true; }
    });
    cv.addEventListener('pointermove', function (e) {
      var p = pos(e), ids = Object.keys(ptrs);
      if (ptrs[e.pointerId]) ptrs[e.pointerId] = p;
      if (pinch && ids.length >= 2) { var a = ptrs[ids[0]], b = ptrs[ids[1]], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch.d > 10) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, pinch.z * d / pinch.d / ui.cam.z); return; }
      if (drag && ptrs[e.pointerId]) {
        var dx = p[0] - drag.x, dy = p[1] - drag.y; if (!drag.moved && Math.hypot(dx, dy) > 6) { drag.moved = true; cv.classList.add('drag'); }
        if (drag.moved) { ui.cam.x = drag.cx - dx / ui.cam.z; ui.cam.y = drag.cy - dy / ui.cam.z; R.clamp(st, ui.cam); $('tip').hidden = true; }
        return;
      }
      if (e.pointerType === 'mouse') {
        var t = R.toTile(st, ui.cam, p[0], p[1]), x = Math.round(t[0]), y = Math.round(t[1]);
        if (ui.tool && ui.tool.k === 'path') { var pk = R.pick(st, S, ui.cam, p[0], p[1], true); if (pk.k === 'mkt' || pk.k === 'hq') { x = pk.x; y = pk.y; } }
        ui.hover = inMap(x, y) ? [x, y] : null; tipAt = p;
        if (ui.tool && ui.tool.pend == null) updatePreview();
      }
    });
    function up(e) {
      var was = drag, p = ptrs[e.pointerId]; delete ptrs[e.pointerId];
      if (Object.keys(ptrs).length < 2) pinch = null;
      if (was && !Object.keys(ptrs).length) { drag = null; cv.classList.remove('drag'); if (!was.moved && e.type === 'pointerup' && p) mapClick(p[0], p[1]); }
    }
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', function () { tipAt = null; $('tip').hidden = true; if (!ui.touch) { ui.hover = null; if (ui.tool && ui.tool.pend == null) { ui.preview = ui.tool.from != null ? { from: ui.tool.from, ok: true } : null; prevKey = ''; } } });
    cv.addEventListener('wheel', function (e) { e.preventDefault(); var p = pos(e); zoomAt(p[0], p[1], Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * 0.0045)); }, { passive: false });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); if (ui.tool) setTool(null); else if (ui.pick) ui.pick = null; else select(null); refresh(); });
    $('mini').addEventListener('pointerdown', function (e) { var b = e.currentTarget.getBoundingClientRect(), t = R.miniTile(e.clientX - b.left, e.clientY - b.top); R.center(st, ui.cam, t[0], t[1]); });
  }
  function pcls(mk, g) { var mu = CH.price(S, mk, g) / G[g].p; return mu >= 1.35 ? 'dear' : mu <= 0.75 ? 'cheap' : ''; }
  function shelf(mk, g) {                   // one good at one market in a sentence: how much is there and what a load costs
    return '<b>' + (mk.stock[g] || 0) + '</b> on the shelves at <b class="' + pcls(mk, g) + '">' + fmt(CH.price(S, mk, g)) + '</b> a load <span class="dim">(usually ' + G[g].p + ')</span>';
  }
  function batch(d, mk) {                   // what one batch costs to make and fetches, at this market today
    var cost = 0, val = 0, g, k;
    for (g in d.inp) for (k = 0; k < d.inp[g]; k++) cost += CH.buyP(S, mk, g, -k);
    for (g in d.out) for (k = 0; k < d.out[g]; k++) val += CH.sellP(S, mk, g, k);
    return 'A batch costs <b>' + fmt(cost) + '</b> to make and sells for <b>' + fmt(val) + '</b> at today’s prices: <b class="' + tone(val - cost) + '">' + signed(val - cost) + '</b>';
  }
  function tipCard(p) {                     // the card for whatever the pointer is over
    var h = '', m, d, o, q;
    function row(label, body) { return '<div class="tt">' + (label ? '<span class="tl">' + label + '</span>' : '') + '<span class="tb">' + body + '</span></div>'; }
    function top(name, note, cls) { return '<div class="th"><b>' + esc(name) + '</b>' + (note ? '<span class="ts ' + (cls || '') + '">' + note + '</span>' : '') + '</div>'; }
    function priced(a, cls) { return a.map(function (w) { return '<span class="ti ' + cls + '">' + gi(w.g, 1) + fmt(w.price) + '</span>'; }).join(''); }
    if (p.k === 'site') {
      o = WD.sites[p.o.i]; d = D.sites[o.t]; if (!CH.live(S, d)) return ''; q = S.st[p.o.i]; m = q.mk ? CH.mkt(S, q.mk) : null;
      h = top(d.n, !m ? 'no market reaches it' : q.on ? 'working' : 'idle', !m ? '' : q.on ? 'ok' : 'bad');
      h += row('', gi(d.g) + ' Makes <b>' + rate(TPY / d.per) + '</b> loads of ' + lc(gn(d.g)) + ' a year');
      if (m) h += row('', 'In ' + esc(m.name) + ': ' + shelf(m, d.g)) + (q.on ? '' : row('', 'The price is at its floor, so nobody works it until the pile is bought down.'));
      else h += row('', 'Found a market whose reach covers it and it starts working.');
      return h;
    }
    if (p.k === 'bld') {
      var b = p.o.b; d = D.bld[b.t]; m = b.mk ? CH.mkt(S, b.mk) : null;
      if (d.kind === 'works') {
        h = top(d.n + (b.own ? ', yours' : ''), esc(lc(bstat(b))), b.st === 'run' ? 'ok' : b.st === 'wait' && G[b.why] ? 'bad' : '');
        h += '<div class="tt">' + pics(d.inp) + '<span class="dim">makes</span>' + pics(d.out) + '<span class="tb"><b>' + rate(TPY / d.time) + '</b> times a year</span></div>';
        if (m) h += row('', batch(d, m));
      } else if (d.kind === 'demand') {
        h = top(d.n, m ? 'buys from ' + esc(m.name) : 'no market reaches it');
        d.want.forEach(function (e) { if (!CH.live(S, e)) return; h += row('', gi(e.g) + ' ' + esc(gn(e.g)) + ', <b>' + rate(TPY / e.per) + '</b> a year' + (m ? ', pays <b class="' + pcls(m, e.g) + '">' + fmt(CH.price(S, m, e.g)) + '</b>' + ((m.stock[e.g] || 0) < 1 ? ' <span class="neg">none on the shelves</span>' : '') : '')); });
      } else h = top(d.n, m ? 'at ' + esc(m.name) : '') + row('', esc(d.d));
      return h;
    }
    if (p.k === 'mkt') {
      m = p.o.m; var md = CH.view.mood(S, m), tr = CH.view.trade(S, m);
      h = top(m.name, m.pop + (m.pop === 1 ? ' house' : ' houses') + (md.k > 0 ? ', growing' : md.k < 0 ? ', leaving' : ''), md.k > 0 ? 'ok' : md.k < 0 ? 'bad' : '');
      h += row('Houses need', pips(m));
      if (tr.cheap.length) h += row('Cheap here', priced(tr.cheap, 'cheap'));
      if (tr.dear.length) h += row('Pays well for', priced(tr.dear, 'dear'));
      return h;
    }
    if (p.k === 'm') {
      m = p.m; var cg = Object.keys(m.cargo).map(function (g) { return '<span class="rq">' + m.cargo[g] + gi(g, 1) + '</span>'; }).join('');
      h = top(m.nm, esc(lc(D.trans[m.tr].n))) + row('', esc(mstat(m)));
      h += row('Carrying', (cg || 'nothing') + ' <span class="dim">' + CH.load(m) + ' of ' + CH.capFor(m, m.tr) + ' loads</span>');
      if (m.last != null) h += row('Last round', '<b class="' + tone(m.last) + '">' + signed(m.last) + '</b>');
      return h;
    }
    if (p.k === 'house') {
      m = p.o.h[2] ? CH.mkt(S, p.o.h[2]) : null;
      return top('A house', m ? 'in ' + esc(m.name) : 'no market reaches it') + row('', 'Four households get through, in a year: ' + D.house.filter(function (e) { return CH.live(S, e); }).map(function (e) { return '<span class="rq">' + rate(4 * TPY / e.per) + gi(e.g, 1) + '</span>'; }).join(''));
    }
    if (p.k === 'hq') return top('The counting house', 'yours') + row('', 'New merchants start here.');
    return '';
  }
  function renderTip() {
    var el = $('tip'); if (!tipAt || !ui.hover || ui.touch) { el.hidden = true; return; }
    var pk = ui.tool ? null : R.pick(st, S, ui.cam, tipAt[0], tipAt[1]), tx = pk ? tipCard(pk) : esc(tipText());
    if (!tx) { el.hidden = true; return; }
    setHTML(el, tx); el.hidden = false; el.className = ui.tool && ui.preview && !ui.preview.ok ? 'bad' : '';
    el.style.left = Math.max(8, Math.min(st.vw - el.offsetWidth - 8, tipAt[0] + 16)) + 'px'; el.style.top = Math.max(8, Math.min(st.vh - el.offsetHeight - 8, tipAt[1] + 20)) + 'px';
  }
  function onKey(e) {
    var tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'select' || tag === 'textarea';
    if (e.key === 'Escape') { if (ui.modal) closeModal(); else if (ui.tool) setTool(null); else if (ui.pick) ui.pick = null; else select(null); refresh(); return; }
    if (typing || ui.modal || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase(), pan = 90 / ui.cam.z;
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); ui.paused = !ui.paused; }
    else if (e.key >= '1' && e.key <= '4') { ui.speed = [1, 2, 4, 8][+e.key - 1]; ui.paused = false; }
    else if (e.key === '+' || e.key === '=') zoomAt(st.vw / 2, st.vh / 2, 1.3);
    else if (e.key === '-') zoomAt(st.vw / 2, st.vh / 2, 0.77);
    else if (k === 'arrowleft' || k === 'a') { ui.cam.x -= pan; R.clamp(st, ui.cam); }
    else if (k === 'arrowright' || k === 'd') { ui.cam.x += pan; R.clamp(st, ui.cam); }
    else if (k === 'arrowup' || k === 'w') { ui.cam.y -= pan; R.clamp(st, ui.cam); }
    else if (k === 'arrowdown' || k === 's') { ui.cam.y += pan; R.clamp(st, ui.cam); }
    else return;
    if (k.indexOf('arrow') === 0) e.preventDefault();
    refresh();
  }

  /* ---------- saving ---------- */
  function save() { lastSave = performance.now(); try { localStorage.setItem(SAVE_KEY, CH.serialize(S)); ui.canStore = true; return true; } catch (err) { ui.canStore = false; return false; } }
  function load(text) { try { var s = CH.revive(JSON.parse(text)); CH.tick(s); CH.view.route(s, { stops: [] }, null); s.mk.forEach(function (m) { CH.view.market(s, m); }); return s; } catch (err) { return null; } }
  function newGame() { S = CH.newGame({ seed: (Date.now() % 2147483647) | 1 }); if (st) R.ground(st, S); ui.sel = null; ui.tool = null; ui.pick = null; ui.paused = false; ui.speed = 1; ui.tab = 'house'; newsSeen = S.nn; home(); save(); refresh(); }
  function home() { ui.cam.z = Math.max(R.minZoom(st), Math.min(1, st.vw / 900)); R.center(st, ui.cam, WD.hq.x + 2, WD.hq.y + 1); }

  /* ---------- the loop ---------- */
  var faults = 0, fromSave = false, loadedTick = -1;
  function frame(ts) {
    try { step(ts); faults = 0; }
    catch (err) {
      faults++; if (root.console) console.error(err);
      if (fromSave && S.tick <= loadedTick + 2) { fromSave = false; newGame(); toast('The saved game could not be read, so a new one has begun.'); }
      else { ui.paused = true; toast('Something went wrong and the game has paused: ' + (err && err.message ? err.message : err)); }
    }
    if (faults < 30) root.requestAnimationFrame(frame);
  }
  function remember() { for (var i = 0; i < S.ms.length; i++) { var m = S.ms[i], q = ui.prev.get(m), h = R.here(m); if (!q) { q = {}; ui.prev.set(m, q); } q.p = m.path; q.s = m.pi + m.pf; q.x = h[0]; q.y = h[1]; } }
  function step(ts) {
    var dt = Math.min(0.12, (ts - lastTs) / 1000 || 0); lastTs = ts;
    if (!ui.paused && !ui.modal) { acc += dt * TICKS * ui.speed; var n = 0; while (acc >= 1 && n < 60) { remember(); CH.tick(S); acc -= 1; n++; } if (acc > 3) acc = 0; }
    ui.alpha = Math.min(1, acc);
    if (ui.tool && ui.hover) updatePreview();
    R.render(st, S, ui, ts);
    if (S.nn !== newsSeen) { var l = S.news[S.news.length - 1]; newsSeen = S.nn; if (l && l.k && !ui.modal) toast(l.s); dirty = true; }
    if (S.over && !S.seenOver && !ui.modal) { S.seenOver = 1; openModal('over'); }
    if (toastUntil && ts > toastUntil) { $('toast').hidden = true; toastUntil = 0; }
    renderTip();
    if ((dirty || ts - lastUi > 260) && ts > holdUntil) {
      dirty = false; lastUi = ts;
      var ae = doc.activeElement, busy = ae && (ae.tagName === 'SELECT' || ae.tagName === 'INPUT') && $('inspect').contains(ae);
      renderTop(); renderLeft(); if (!busy) renderInspect(); renderTabs(); renderBanner(); renderLens();
    }
    if (ts - lastMini > 240) { lastMini = ts; R.mini(st, S, ui, $('mini')); }
    if (ui.modal && ts - lastModal > 1000 && ts > holdUntil) { lastModal = ts; var a = doc.activeElement, tag = a ? (a.tagName || '').toLowerCase() : ''; if (tag !== 'select' && tag !== 'input' && ui.modal !== 'help' && ui.modal !== 'confirm' && ui.modal !== 'over') renderModal(); }
    if (ts - lastSave > 20000) save();
  }
  function start(hot) {
    var text = hot && hot.save ? hot.save : null;
    if (!text) { try { text = localStorage.getItem(SAVE_KEY); } catch (err) { text = null; } }
    S = text ? load(text) : null;
    var fresh = !S; if (S) { fromSave = true; loadedTick = S.tick; } else S = CH.newGame({ seed: (Date.now() % 2147483647) | 1 });
    st = R.init($('map'), S); R.resize(st);
    newsSeen = S.nn; ui.canStore = save();
    if (hot && hot.cam) { ui.cam = hot.cam; R.clamp(st, ui.cam); } else home();
    bindMap();
    doc.addEventListener('click', onClick); doc.addEventListener('change', onChange); doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('#left,#inspect,#modal,#top,#hud,#zoom,#tabs')) holdUntil = performance.now() + 700; }, true);
    doc.addEventListener('pointerup', function () { holdUntil = Math.min(holdUntil, performance.now() + 80); }, true);
    function fit() { R.resize(st); R.clamp(st, ui.cam); }
    root.addEventListener('resize', fit); if (root.ResizeObserver) new ResizeObserver(fit).observe($('mapwrap'));
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) save(); }); root.addEventListener('pagehide', save);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { st.tw = {}; refresh(); });      // text measured before the lettering arrived is measured again
    if (root.claude && root.claude.hot && root.claude.hot.snapshot) root.claude.hot.snapshot(function () { return { save: CH.serialize(S), cam: ui.cam }; });
    if (fresh) openModal('help');
    CH.ui = { state: function () { return S; }, ui: ui, act: ACT, st: st, click: mapClick };   // handy from the console and for tests
    root.requestAnimationFrame(frame);
  }
  var hot = root.claude && root.claude.hot;
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})(window);
