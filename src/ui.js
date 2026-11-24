/* Counting House — the interface: panels, tools, pointer and keys, and the loop that drives the game. */
(function (root) {
  'use strict';
  var CH = root.CH, D = CH.DEF, R = CH.draw, WD = CH.genWorld(), W = D.W, H = D.H, doc = document, G = D.goods, TPY = D.tpy;
  var S, st, SAVE_KEY = 'countinghouse.save.v3', TICKS = 6, VERSION = '__VERSION__';
  var ui = { sel: null, tool: null, hover: null, preview: null, cam: { x: 0, y: 0, z: 1 }, speed: 1, paused: false, modal: null, tab: 'house', reach: false, pick: null, touch: false, confirm: null, canStore: true, lens: null, plain: false, alpha: 1, prev: new WeakMap(), chart: null, whatif: 0, leg: null, lesson: '', sc: {}, screen: 'title', setup: null, msg: '', code: '' };
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
  function select(s) { if (!s || s.k !== 'm' || !ui.sel || ui.sel.k !== 'm' || ui.sel.id !== s.id) ui.pick = null; if (!s || !ui.sel || s.k !== ui.sel.k || s.id !== ui.sel.id || s.i !== ui.sel.i) { ui.chart = s && s.k === 'mkt' && ui.lens && G[ui.lens] ? ui.lens : null; ui.whatif = 0; ui.leg = null; } ui.sel = s; if (s) ui.tab = 'sel'; refresh(); }
  function sfx(id, o) { if (CH.sound) CH.sound.play(id, o); }
  function run(q, good_) { if (!q.ok) { if (q.why) { toast(q.why); sfx('deny'); } } else if (good_) toast(good_); refresh(); return q.ok; }

  /* ---------- words for states ---------- */
  function mstat(m) {
    var Rt = m.rt ? CH.routeOf(S, m.rt) : null, mk = Rt && Rt.stops[m.si] ? CH.mkt(S, Rt.stops[m.si].m) : null;
    if (!Rt) return 'Needs a route';
    if (Rt.stops.length < 2) return 'Route needs 2 stops';
    if (m.st === 'idle' && m.why === 'orders') return 'Needs orders';
    if (m.st === 'go') return 'Travelling to ' + mk.name;
    if (m.st === 'trade') return 'Trading at ' + mk.name;
    if (m.st === 'wait') return m.why === '$' ? 'Credit limit reached at ' + mk.name : m.wd ? (G[m.why] ? 'Waiting at ' + mk.name + ': ' + lc(gn(m.why)) + ' margin too low' : 'Waiting at ' + mk.name + ' for a profitable load') : 'Waiting for ' + lc(gn(m.why)) + ' at ' + mk.name;
    if (m.st === 'stuck') return m.why.replace(/\.$/, '');
    return 'Idle';
  }
  function bstat(b) {
    var d = D.bld[b.t];
    if (!b.mk) return 'Outside market range';
    if (d.kind !== 'works') return '';
    if (b.st === 'run') return 'Working';
    if (b.st === 'off') return 'Off';
    if (b.st === 'wait') return b.why === '+' ? 'Paused: output stock is full' : b.why === '$' ? 'Paused: inputs cost more than the output' : 'Waiting for ' + lc(gn(b.why));
    return 'Ready';
  }
  function moodText(m, md) {
    var miss = md.miss.map(function (g) { return lc(gn(g)); });
    if (!m.pop) return md.k > 0 ? 'Needs met. First houses arriving.' : 'Empty. Houses arrive while rice and fish are in stock, plus 2 of salt, cloth and pottery.';
    if (md.k < 0) return 'Shrinking. Low on ' + listing(md.low.map(function (g) { return lc(gn(g)); })) + '.';
    if (md.full && md.k > 0) return 'Full. Upgrade the market to add houses.';
    if (md.k === 2) return 'Growing. All needs met.';
    if (md.k === 1) return 'Growing slowly. Missing: ' + listing(miss) + '.';
    return 'Growth paused. Missing: ' + listing(miss) + '.';
  }
  function pics(o) { return Object.keys(o).map(function (g) { return '<span class="rq">' + (o[g] > 1 ? o[g] : '') + gi(g, 1) + '</span>'; }).join(''); }
  function recipePics(d) { return '<div class="recipe">' + pics(d.inp) + '<span class="dim">makes</span>' + pics(d.out) + '</div>'; }
  function recipe(d) {
    function side(o) { return listing(Object.keys(o).map(function (g) { return o[g] + ' ' + lc(gn(g)); })); }
    return side(d.inp) + ' → ' + side(d.out) + ', ' + rate(TPY / d.time) + ' batches a year';
  }

  /* ---------- top bar ---------- */
  function renderTop() {
    var y = CH.year(S), part = (S.tick % TPY) / TPY, n = 0, id, nl = CH.learn.unread(S);
    for (id in D.adv) if (CH.advState(S, id) === 'avail') n++;
    setHTML($('date'), '<span class="lab">Year</span><b>' + y + '</b><span class="yr" aria-hidden="true"><i style="width:' + Math.round(part * 100) + '%"></i></span>');
    var net = 0, pop = 0; for (id in S.led.cur) net += S.led.cur[id]; S.mk.forEach(function (m) { pop += m.pop; });
    setHTML($('coins'), '<span class="lab">Coins</span><b class="' + (S.coins < 0 ? 'neg' : '') + '">' + fmt(S.coins) + '</b>' + (Math.round(net) ? '<span class="delta ' + tone(net) + '" title="Net income this year">' + signed(net) + '<span class="lab"> this year</span></span>' : ''));
    setHTML($('pop'), '<span class="lab">Houses</span><b>' + pop + '</b>');
    var sp = B('Pause', 'pause', null, 'spd' + (ui.paused ? ' on' : ''), ' aria-pressed="' + ui.paused + '"');
    [1, 2, 4, 8].forEach(function (v) { sp += B(v + '×', 'speed', { v: v }, 'spd' + (!ui.paused && ui.speed === v ? ' on' : ''), ' aria-pressed="' + (!ui.paused && ui.speed === v) + '"'); });
    setHTML($('speed'), sp);
    setHTML($('menu'), B('Research' + (n ? '<span class="badge">' + n + '</span>' : ''), 'modal', { name: 'adv' }, 'mbtn') + B('Prices', 'modal', { name: 'prices' }, 'mbtn') + B('Finances', 'modal', { name: 'ledger' }, 'mbtn') + B('Lessons' + (nl ? '<span class="badge">' + nl + '</span>' : ''), 'modal', { name: 'lessons' }, 'mbtn') + B('Menu', 'modal', { name: 'menu' }, 'mbtn'));
  }

  /* ---------- left: what can be built, and the merchants ---------- */
  var TOOLS = [
    ['Markets and paths', [['market', 0], ['market', 1], ['market', 2], ['market', 3], ['path', 'trail'], ['path', 'road']]],
    ['Workshops', [['bld', 'potter'], ['bld', 'carpenter'], ['bld', 'smelter'], ['bld', 'curing'], ['bld', 'weaver'], ['bld', 'goldsmith'], ['bld', 'batikw']]],
    ['Buyers', [['bld', 'balai'], ['bld', 'mosque'], ['bld', 'shipyard'], ['bld', 'stockade']]],
    ['Depots', [['bld', 'harbour'], ['bld', 'caravan']]]
  ];
  function toolDef(k, t) {
    if (k === 'market') return { n: D.sizes[t].n, cost: D.sizes[t].cost + '', adv: D.sizes[t].adv, ic: 'market' + t, d: 'Range ' + D.sizes[t].r + ' tiles. Sites in range start producing. Workshops and houses are built in range.' };
    if (k === 'path') return { n: D.path[t].n, cost: D.path[t].cost + ' a tile', adv: D.path[t].adv, ic: 'i_' + t, d: t === 'trail' ? 'Full speed for porters and elephants. Forest, hills and river crossings cost more.' : 'Faster than a trail. Required for ox carts.' };
    var d = D.bld[t], ws = d.kind === 'demand' ? d.want.filter(function (e) { return CH.live(S, e); }) : null;
    return { n: d.n, cost: d.cost + '', adv: d.adv, ic: 'b_' + t, d: d.d, pics: d.kind === 'works' ? '<span class="tp">' + Object.keys(d.inp).map(function (g) { return gi(g, 1); }).join('') + '<i>▸</i>' + Object.keys(d.out).map(function (g) { return gi(g, 1); }).join('') + '</span>' : ws ? '<span class="tp"><i>buys</i>' + ws.map(function (e) { return gi(e.g, 1); }).join('') + '</span>' : '' };
  }
  function hireLabel() { var c = CH.hireCost(S); return c ? 'Hire merchant: ' + fmt(c) + ' coins' : 'Hire merchant: free'; }
  function renderLeft() {
    var h = '<h2>Build</h2>';
    TOOLS.forEach(function (grp) {
      var rows = '';
      grp[1].forEach(function (q) {
        var d = toolDef(q[0], q[1]); if (d.adv && CH.advState(S, d.adv) === 'later') return;
        var locked = d.adv && !S.adv[d.adv], on = ui.tool && ui.tool.k === q[0] && ui.tool.t === q[1];
        var inner = ico(d.ic) + '<span class="tn">' + esc(d.n) + '</span><span class="tc">' + (locked ? 'requires ' + esc(D.adv[d.adv].n) : d.cost + (d.pics || '')) + '</span>';
        rows += locked ? B(inner, 'why', { why: d.n + ' requires research: ' + D.adv[d.adv].n + '. Open Research.' }, 'tool off', ' aria-disabled="true"') : B(inner, 'tool', { k: q[0], t: q[1] }, 'tool' + (on ? ' on' : ''), ' aria-pressed="' + !!on + '"');
      });
      if (rows) h += '<h3>' + grp[0] + '</h3><div class="tools">' + rows + '</div>';
    });
    setHTML($('build'), h);
    h = '<h2>Merchants <span class="count">' + S.ms.length + '/' + D.hire.cap + '</span></h2>';
    h += B(hireLabel(), 'modal', { name: 'hire' }, 'btn wide');
    if (!S.ms.length) h += '<p class="hint">Merchants carry goods between markets. New hires start at the counting house.</p>';
    h += '<ul class="roster">';
    S.ms.forEach(function (m) {
      var on = ui.sel && ui.sel.k === 'm' && ui.sel.id === m.id, warn = m.st === 'stuck' || !m.rt || (m.st === 'idle' && m.why === 'orders'), cap = CH.capFor(m, m.tr), ld = CH.load(m);
      h += '<li>' + B('<span class="mi">' + ico('m_' + m.tr) + '<span class="mf" title="Cargo ' + ld + '/' + cap + '"><i style="width:' + Math.round(ld / cap * 100) + '%"></i></span></span><span class="mn">' + esc(m.nm) + '</span><span class="mp ' + tone(m.last || 0) + '">' + (m.last == null ? '' : signed(m.last)) + '</span><span class="ms' + (warn ? ' warn' : '') + '">' + esc(mstat(m)) + '</span>', 'sel', { k: 'm', id: m.id }, 'mrow' + (on ? ' on' : '')) + '</li>';
    });
    setHTML($('roster'), h + '</ul>');
  }

  /* ---------- right: whatever is chosen ---------- */
  function head(title, sub, extra) { return '<header class="ih"><div><h2>' + esc(title) + '</h2>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (extra || '') + '</header>'; }
  function find(x, y) { return B('Go to', 'center', { x: Math.round(x), y: Math.round(y) }, 'btn tiny'); }
  function inspHouse() {
    var h = head(S.name, 'Rank: ' + CH.rank(S.coins) + '. ' + (S.over ? 'Game ended in ' + D.span[1] + '.' : (D.span[1] - CH.year(S)) + ' years left. Game ends in ' + D.span[1] + '.')), next = true;
    h += '<h3>Goals</h3><ol class="goals">';
    D.goals.forEach(function (g) {
      var done = !!S.goals[g.id]; h += '<li class="' + (done ? 'done' : next ? 'next' : '') + '"><span class="gt">' + esc(g.t) + '</span>' + (g.r ? '<span class="gr">' + CH.reward(S, g) + '</span>' : '') + (!done && next && g.h ? '<p class="hint">' + esc(g.h) + '</p>' : '') + '</li>';
      if (!done) next = false;
    });
    h += '</ol>';
    if (S.mk.length) {
      h += '<h3>Towns</h3><table class="tbl"><thead><tr><th>Market</th><th class="num">Houses</th><th>Growth</th><th>Needs</th></tr></thead><tbody>';
      S.mk.forEach(function (m) { var md = CH.view.mood(S, m); h += '<tr><td>' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '</td><td class="num">' + m.pop + '</td><td class="' + (!m.pop ? 'dim' : md.k < 0 ? 'neg' : md.k > 0 ? 'pos' : '') + '">' + (!m.pop && md.k <= 0 ? 'Empty' : md.k < 0 ? 'Shrinking' : md.k === 2 ? 'Growing' : md.k === 1 ? 'Slow' : 'Paused') + '</td><td>' + pips(m) + '</td></tr>'; });
      h += '</tbody></table>';
    }
    h += '<h3>News</h3><ul class="news">';
    S.news.slice(-7).reverse().forEach(function (n) { h += '<li class="' + n.k + '"><span class="ny">' + (D.span[0] + Math.floor(n.t / TPY)) + '</span>' + esc(n.s) + (n.l ? ' ' + B('Open lesson', 'lesson', { id: n.l }, 'link') : '') + '</li>'; });
    return h + '</ul>';
  }
  function pips(m) {                        // the household needs as pictures, underlined by how well each is supplied
    return '<span class="pips">' + CH.view.needs(S, m).map(function (n) { var k = n.sat >= (n.food ? 0.75 : 0.6) ? 'ok' : n.sat >= 0.35 ? 'mid' : 'low'; return '<span class="pip ' + k + '" title="' + esc(gn(n.g)) + ': ' + (k === 'ok' ? 'supplied' : k === 'mid' ? 'low' : 'missing') + '">' + gi(n.g) + '</span>'; }).join('') + '</span>';
  }
  var TOPS = [4, 6, 8, 10, 12, 16, 20, 30, 40, 60, 80, 100, 120, 160, 200, 300, 400, 600, 800, 1000, 1200, 1600, 2000];
  function topFor(v) { for (var i = 0; i < TOPS.length; i++) if (TOPS[i] >= v) return TOPS[i]; return Math.ceil(v / 1000) * 1000; }
  function sdScale(m, rows) {               // the loads a year at the far end of every bar on a market's board: its largest demand or supply, rounded up. It grows at once and comes down only when well clear, so trade arriving in batches does not make it flicker
    var big = 0; rows.forEach(function (w) { big = Math.max(big, w.c + w.exp, w.p + w.imp); });
    var s = ui.sc[m.id] || 0, t = topFor(big), low = topFor(big * 1.2);
    if (t > s) s = t; else if (low < s) s = low;
    return (ui.sc[m.id] = s);
  }
  function sdBars(w, top) {                 // one good's demand over its supply, on the scale every good at the market shares; gold is what merchants add to either side
    var dem = w.c + w.exp, sup = w.p + w.imp;
    function seg(v, cls) { return v > 0 ? '<i class="' + cls + '" style="width:' + Math.min(100, v / top * 100).toFixed(1) + '%"></i>' : ''; }
    function num(v) { return rate(v) || '0'; }
    var say = 'Demand ' + num(dem) + ' a year' + (w.exp ? ' (' + num(w.c) + ' used, ' + num(w.exp) + ' exported)' : '') + '. Supply ' + num(sup) + ' a year' + (w.imp ? ' (' + num(w.p) + ' made, ' + num(w.imp) + ' imported)' : '') + '.';
    return '<span class="sd" role="img" aria-label="' + say + '" title="' + say + '"><span class="sdl"><span class="sdt">' + seg(w.c, 'b-d') + seg(w.exp, 'b-x') + '</span><b>' + num(dem) + '</b></span><span class="sdl"><span class="sdt">' + seg(w.p, 'b-s') + seg(w.imp, 'b-x') + '</span><b>' + num(sup) + '</b></span></span>';
  }
  function stockGauge(w) {                  // stock against the target stock; at the tick the price is the base price
    if (!w.t) return '<span class="sg"><b>' + w.s + '</b></span>';
    return '<span class="sg ' + (w.mult >= 1.35 ? 'lo' : w.mult <= 0.75 ? 'hi' : '') + '" title="Stock ' + w.s + ', target ' + (rate(w.t) || '0') + '"><b>' + w.s + '</b><span class="sgt"><i style="width:' + Math.min(100, w.s / (3 * w.t) * 100).toFixed(1) + '%"></i><u></u></span></span>';
  }
  function inspMarket(m) {
    var sz = D.sizes[m.sz], md = CH.view.mood(S, m), h = head(m.name, sz.n + ', range ' + sz.r + ' tiles', find(m.x, m.y)), here = {}, list = '';
    if (m.sz < D.sizes.length - 1) { var q = CH.can.enlarge(S, m), nx = D.sizes[m.sz + 1]; if (!nx.adv || CH.advState(S, nx.adv) !== 'later') h += gated('Upgrade to ' + lc(nx.n) + ': ' + (nx.cost - sz.cost) + ' coins', 'enlarge', { id: m.id }, q, 'btn wide') + (q.ok ? '' : '<p class="hint">' + esc(q.why) + '</p>'); }
    h += '<p class="mood ' + (md.k < 0 ? 'neg' : md.k > 0 ? 'pos' : '') + '"><b>' + m.pop + (m.pop === 1 ? ' house.' : ' houses.') + '</b> ' + moodText(m, md) + '</p>';
    h += '<div class="trade"><span class="tl">Needs</span><span class="tv">' + pips(m) + '</span></div>';
    var alt = CH.view.needs(S, m).filter(function (n) { return n.alt && !n.s; })[0];
    if (alt) h += '<p class="hint">' + esc(gn(alt.g)) + ' stock 0: households eat ' + esc(lc(gn(alt.sub))) + '.</p>';
    h += '<h3>Supply and demand</h3><p class="sdkey"><span><i class="sw sw-d"></i>Demand: used</span><span><i class="sw sw-s"></i>Supply: made</span><span><i class="sw sw-x"></i>Merchant trade</span><span><i class="sw sw-t"></i>Target stock</span></p>';
    var rows = CH.view.market(S, m), top = sdScale(m, rows);
    h += '<table class="tbl goods sdb"><thead><tr><th class="c1">Good</th><th class="c2">Loads a year<span class="ax" aria-hidden="true"><span class="axt"><i>0</i><i>' + top / 2 + '</i><i>' + top + '</i></span></span></th><th class="num c3">Stock</th><th class="num c4">Price</th></tr></thead><tbody>';
    rows.forEach(function (w) {
      var on = ui.chart === w.g;
      h += '<tr' + (on ? ' class="on"' : '') + '><td>' + B(good(w.g), 'chart', { g: w.g }, 'gl', ' aria-expanded="' + on + '"') + '</td><td>' + sdBars(w, top) + '</td><td class="num">' + stockGauge(w) + '</td><td class="num ' + (w.mult >= 1.35 ? 'dear' : w.mult <= 0.75 ? 'cheap' : '') + '" title="' + (w.t ? Math.round(w.mult * 100) + '% of base price ' + G[w.g].p : 'Demand 0') + '">' + (w.t ? fmt(w.price) : '<span class="dim">' + fmt(w.price) + '</span>') + '</td></tr>' + (on ? '<tr class="crow"><td colspan="4">' + CH.learn.priceCard(S, m, w.g, ui.whatif) + '</td></tr>' : '');
    });
    h += '</tbody></table><p class="hint">Tap a good for its price chart.</p>';
    WD.sites.forEach(function (s, k) { if (S.st[k].mk === m.id && CH.live(S, D.sites[s.t])) here[s.t] = (here[s.t] || 0) + 1; });
    Object.keys(here).forEach(function (t) { list += '<li>' + esc(D.sites[t].n) + (here[t] > 1 ? ' ×' + here[t] : '') + '<span class="dim"> makes ' + lc(gn(D.sites[t].g)) + '</span></li>'; });
    S.bl.forEach(function (b) { if (b.mk !== m.id) return; var d = D.bld[b.t], s = bstat(b); list += '<li>' + B(esc(d.n), 'sel', { k: 'bld', id: b.id }, 'link') + (d.kind === 'works' ? '<span class="dim"> ' + (b.own ? 'owned' : 'local') + (s ? ', ' + lc(s) : '') + '</span>' : d.kind === 'demand' ? '<span class="dim"> buys ' + listing(d.want.filter(function (e) { return CH.live(S, e); }).map(function (e) { return lc(gn(e.g)); })) + '</span>' : '') + '</li>'; });
    if (list) h += '<h3>In range</h3><ul class="plain">' + list + '</ul>';
    var call = S.ms.filter(function (q) { var Rt = q.rt && CH.routeOf(S, q.rt); return Rt && Rt.stops.some(function (s) { return s.m === m.id; }); });
    if (call.length) h += '<h3>Merchants stopping here</h3><p>' + call.map(function (q) { return B(esc(q.nm), 'sel', { k: 'm', id: q.id }, 'link'); }).join(', ') + '</p>';
    return h;
  }
  function stepper(n, act, data) { var a = {}, b = {}, k; for (k in data) { a[k] = data[k]; b[k] = data[k]; } a.d = -1; b.d = 1; return '<span class="step">' + B('−', act, a, 'sbtn', ' aria-label="Decrease"') + '<b>' + n + '</b>' + B('+', act, b, 'sbtn', ' aria-label="Increase"') + '</span>'; }
  function legOn(Rt, k, g) { return !!ui.leg && ui.leg.r === Rt.id && ui.leg.k === k && ui.leg.g === g; }
  function legBox(Rt, k, m) { return ui.leg && ui.leg.r === Rt.id && ui.leg.k === k ? CH.learn.legCard(S, Rt, k, ui.leg.g, m) : ''; }      // the chart of one good's trade, under the stop it leaves from
  function inspMerchant(m) {
    var d = D.trans[m.tr], Rt = m.rt ? CH.routeOf(S, m.rt) : null, cap = CH.capFor(m, m.tr), h = head(m.nm, esc(D.abil[m.ab].n) + '. ' + esc(D.abil[m.ab].d), find(m.x, m.y)), t, g;
    var cargo = Object.keys(m.cargo).map(function (g) { return m.cargo[g] + ' ' + lc(gn(g)); });
    h += '<div class="card">' + ico('m_' + m.tr) + '<div><b>' + esc(d.n) + '</b>, capacity ' + cap + '. ' + esc(mstat(m)) + '.<br>' + (cargo.length ? 'Cargo: ' + cargo.join(', ') + '.' : 'Cargo: empty.') + (m.qt ? '<br>Switching to ' + lc(D.trans[m.qt].n) + ' at the next stop.' : '') + '</div></div>';
    var slots = '', used = 0; for (g in m.cargo) for (t = 0; t < m.cargo[g]; t++) { slots += '<span class="slot">' + gi(g, 1) + '</span>'; used++; } for (; used < cap; used++) slots += '<span class="slot"></span>';
    h += '<div class="slots">' + slots + '</div>';
    h += '<p class="money">Profit: last trip <b class="' + tone(m.last || 0) + '">' + (m.last == null ? '–' : signed(m.last)) + '</b>, this year <b class="' + tone(m.yr[0]) + '">' + signed(m.yr[0]) + '</b>, total <b class="' + tone(m.pr) + '">' + signed(m.pr) + '</b></p>';
    h += '<label class="field"><span>Transport</span><select data-ch="trans" data-m="' + m.id + '" data-fk="trans' + m.id + '">';
    for (t in D.trans) { var td = D.trans[t]; if (td.adv && CH.advState(S, td.adv) === 'later') continue; var q = t === m.tr ? { ok: true, cost: 0 } : CH.can.trans(S, m, t); h += '<option value="' + t + '"' + (t === m.tr ? ' selected' : '') + (q.ok ? '' : ' disabled') + '>' + esc(td.n) + ', capacity ' + capFor(m, t) + (t === m.tr ? '' : q.ok ? ' (' + q.cost + ' coins' + (q.later ? ', at the next stop' : '') + ')' : ' (' + esc(lc(q.why.split('. ')[0]).replace(/\.$/, '')) + ')') + '</option>'; }
    h += '</select></label><p class="hint">' + esc(d.d.replace(/^Capacity \d+\./, 'Capacity ' + cap + '.')) + '</p>';      // this merchant's capacity, trait included
    h += '<h3>Route</h3><div class="rowline"><select data-ch="route" data-m="' + m.id + '" data-fk="route' + m.id + '" aria-label="Route"><option value="0">Unassigned</option>';
    S.rt.forEach(function (q) { h += '<option value="' + q.id + '"' + (q.id === m.rt ? ' selected' : '') + '>' + esc(q.name) + '</option>'; });
    h += '</select>' + B('New route', 'newroute', { m: m.id }, 'btn') + '</div>';
    if (!Rt) h += '<p class="hint">A route is a loop of market stops. Orders are auto by default. Set manual orders at any stop. Merchants can share a route.</p>';
    else {
      var est = CH.view.route(S, Rt, m), n = Rt.stops.length, mates = S.ms.filter(function (q) { return q.rt === Rt.id && q !== m; }).map(function (q) { return esc(q.nm); });
      h += '<label class="field"><span>Name</span><input type="text" maxlength="28" value="' + esc(Rt.name) + '" data-ch="rname" data-r="' + Rt.id + '" data-fk="rname' + Rt.id + '"></label>';
      if (mates.length) h += '<p class="hint">Shared with ' + listing(mates) + '. Changes apply to all of them.</p>';
      h += '<ol class="stops">';
      Rt.stops.forEach(function (s, k) {
        var mk = CH.mkt(S, s.m), e = est.stops[k], prev = est.stops[(k - 1 + n) % n].hold, cur = m.si === k && n > 1, a = { r: Rt.id, k: k }, rows = '', opts = '', rest = '';
        h += '<li class="stop' + (cur ? ' cur' : '') + '"><div class="sh"><span class="sn">' + (k + 1) + '</span>' + B(esc(mk.name), 'sel', { k: 'mkt', id: mk.id }, 'link big') + '<span class="sbtns">' + B('▲', 'mvstop', { r: Rt.id, k: k, d: -1 }, 'sbtn', ' aria-label="Move up"') + B('▼', 'mvstop', { r: Rt.id, k: k, d: 1 }, 'sbtn', ' aria-label="Move down"') + B('×', 'delstop', a, 'sbtn', ' aria-label="Remove stop"') + '</span></div>';
        if (s.un === 'all') h += '<div class="ord"><span class="ol">Unload</span><span class="ov">All cargo ' + B('Set amounts', 'unpick', a, 'link') + '</span></div>';
        else {
          var gs = {}; for (g in prev) gs[g] = 1; for (g in s.un) gs[g] = 1;
          for (g in gs) rows += '<div class="chip">' + good(g) + stepper(s.un[g] || 0, 'un', { r: Rt.id, k: k, g: g }) + '</div>';
          h += '<div class="ord"><span class="ol">Unload</span><span class="ov">' + (rows || 'Arrives empty. ') + B('All cargo', 'unall', a, 'link') + '</span></div>';
        }
        rows = '';
        if (s.auto) {                        // left to him: he takes whatever will sell for more at the stop where it comes off
          var today = Object.keys(e.got).map(function (g) { return B(e.got[g] + gi(g, 1), 'leg', { r: Rt.id, k: k, g: g }, 'rq lk', ' aria-expanded="' + legOn(Rt, k, g) + '"'); }).join(''), near = today ? null : CH.learn.bestLeg(S, Rt, k, m);
          h += '<div class="ord"><span class="ol">Load</span><span class="ov">Auto: best profit ' + B('Set manually', 'own', a, 'link') + (n > 1 ? '<span class="today">' + (today ? 'Now: ' + today : 'Now: 0 profitable loads. ' + (near ? B('Show chart', 'leg', { r: Rt.id, k: k, g: near }, 'link', ' aria-expanded="' + legOn(Rt, k, near) + '"') : '')) + '</span>' : '') + '</span></div>';
          h += '<div class="sf">Cargo on leaving: ' + e.carry + '/' + est.cap + '<b class="' + tone(e.money) + '">' + (Math.round(e.money) ? signed(e.money) : '') + '</b></div>' + legBox(Rt, k, m) + '</li>';
          return;
        }
        for (g in s.ld) rows += '<div class="chip">' + B(good(g), 'leg', { r: Rt.id, k: k, g: g }, 'gl', ' aria-expanded="' + legOn(Rt, k, g) + '"') + stepper(s.ld[g], 'ld', { r: Rt.id, k: k, g: g }) + '<span class="cs">stock ' + (mk.stock[g] || 0) + ', price ' + fmt(CH.price(S, mk, g)) + '</span></div>';
        var fl = CH.flows(S, mk);            // only what this market has on its shelves or makes: he cannot load what is never there
        D.goodIds.forEach(function (g) { if (s.ld[g] || (!mk.stock[g] && !(fl.p[g] > 0))) return; var o = '<option value="' + g + '">' + esc(gn(g)) + (mk.stock[g] ? ': stock ' + mk.stock[g] + ', price ' + fmt(CH.price(S, mk, g)) : '') + '</option>'; if (mk.stock[g]) opts += o; else rest += o; });
        h += '<div class="ord"><span class="ol">Load</span><span class="ov">' + rows + '<select data-ch="addload" data-r="' + Rt.id + '" data-s="' + k + '" data-fk="addload' + Rt.id + '.' + k + '" aria-label="Add a good to load at ' + esc(mk.name) + '"><option value="">' + (opts || rest ? 'Add a good…' : 'All goods added') + '</option>' + (opts ? '<optgroup label="In stock">' + opts + '</optgroup>' : '') + (rest ? '<optgroup label="Made here, stock 0">' + rest + '</optgroup>' : '') + '</select><span class="today">' + B('Switch to auto', 'free', a, 'link') + '</span></span></div>';
        h += '<div class="sf">Cargo on leaving: ' + e.carry + '/' + est.cap + '<b class="' + tone(e.money) + '">' + (Math.round(e.money) ? signed(e.money) : '') + '</b></div>' + legBox(Rt, k, m) + '</li>';
      });
      h += '</ol>';
      if (est.over) h += '<p class="warn">Orders exceed capacity (' + est.cap + '). Goods load in listed order up to capacity.</p>';
      h += '<div class="rowline"><select data-ch="addstop" data-r="' + Rt.id + '" data-fk="addstop' + Rt.id + '" aria-label="Add a stop"><option value="">Add a stop…</option>';
      S.mk.forEach(function (q) { h += '<option value="' + q.id + '">' + esc(q.name) + '</option>'; });
      h += '</select>' + B(ui.pick === Rt.id ? 'Done' : 'Select on map', 'pick', { r: Rt.id }, 'btn' + (ui.pick === Rt.id ? ' on' : '')) + '</div>';
      var mine = Rt.stops.some(function (q) { return !q.auto; }), bare = !Rt.stops.some(function (q) { if (q.auto) return true; for (var g in q.ld) return true; return false; });
      if (n > 1 && mine) h += '<div class="field wide"><span>Manual orders</span><div class="seg" role="group" aria-label="Manual order mode">' + B('Profitable loads', 'strict', { r: Rt.id, v: 0 }, 'spd' + (Rt.strict ? '' : ' on'), ' aria-pressed="' + !Rt.strict + '"') + B('Exact amounts', 'strict', { r: Rt.id, v: 1 }, 'spd' + (Rt.strict ? ' on' : ''), ' aria-pressed="' + !!Rt.strict + '"') + '</div></div>';
      if (n > 1 && bare) h += '<p class="warn">Every stop is manual with an empty load list. Add a good to load, or switch a stop to auto.</p>';
      else if (n > 1 && !Math.round(est.total) && !CH.load(m)) h += '<p class="warn">Waiting: 0 profitable loads on this route at current prices. Add another market, or build a buyer for these goods.</p>';
      if (n > 1) h += '<p class="est">Estimated profit per trip: <b class="' + tone(est.total) + '">' + signed(est.total) + '</b>. ' + (!mine ? 'Auto buys goods above target stock that sell for more at a later stop.' : Rt.strict ? 'Exact amounts: loads the listed amounts at any price and waits for missing stock.' : 'Profitable loads: listed amounts are the maximum. Each load is bought while it still sells at a profit.') + '</p>';
      else h += '<p class="hint">Add 2 or more stops. Orders are auto by default. Set manual orders at any stop.</p>';
    }
    return h + '<p class="foot">' + B('Dismiss ' + esc(m.nm), 'dismiss', { m: m.id }, 'link danger') + '</p>';
  }
  function capFor(m, t) { return CH.capFor(m, t); }
  function inspBld(b) {
    var d = D.bld[b.t], m = b.mk ? CH.mkt(S, b.mk) : null, h = head(d.n, m ? 'Market: ' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') : 'Outside market range', find(b.x, b.y));
    h += '<div class="card">' + ico('b_' + b.t) + '<div>' + esc(d.d) + '</div></div>';
    if (d.kind === 'works') {
      h += '<p><b>' + (b.own ? 'Owner: you.' : 'Owner: local.') + '</b> ' + esc(bstat(b)) + '.</p>' + recipePics(d) + (m ? '<p>' + batch(d, m) + '.</p>' + CH.learn.valueCard(S, d, m) : '') + '<p class="hint">' + recipe(d) + '. Buys inputs from this market and sells the output to it.</p>';
      if (b.own) {
        h += '<div class="seg" role="group" aria-label="Production mode">' + [['auto', 'Auto'], ['on', 'Always on'], ['off', 'Off']].map(function (q) { return B(q[1], 'mode', { id: b.id, mode: q[0] }, 'spd' + (b.mode === q[0] ? ' on' : ''), ' aria-pressed="' + (b.mode === q[0]) + '"'); }).join('') + '</div>';
        h += '<p class="money">Profit: this year <b class="' + tone(b.pr[0]) + '">' + signed(b.pr[0]) + '</b>, last year <b class="' + tone(b.pr[1]) + '">' + signed(b.pr[1]) + '</b>. Batches: ' + b.n + '.</p>' + CH.learn.payback(S, b);
      } else if (m) h += gated('Buy: ' + CH.buyCost(b) + ' coins', 'buybld', { id: b.id }, S.coins >= CH.buyCost(b) ? { ok: true } : { ok: false, why: 'Needs ' + CH.buyCost(b) + ' coins.' }, 'btn wide') + '<p class="hint">Local workshops run on auto. An owned workshop pays you its profit and lets you set the mode.</p>';
    } else if (d.kind === 'demand') {
      h += '<table class="tbl"><thead><tr><th>Buys</th><th class="num">Per year</th><th class="num">Stock</th><th class="num">Price</th></tr></thead><tbody>';
      d.want.forEach(function (e) { if (!CH.live(S, e)) return; h += '<tr><td>' + good(e.g) + '</td><td class="num">' + rate(TPY / e.per) + '</td><td class="num">' + (m ? (m.stock[e.g] || 0) : '') + '</td><td class="num ' + (m && CH.price(S, m, e.g) >= 1.35 * G[e.g].p ? 'dear' : '') + '">' + (m ? fmt(CH.price(S, m, e.g)) : '') + '</td></tr>'; });
      h += '</tbody></table><p class="hint">Buys from this market’s stock. Low stock raises the price your merchants get.</p>';
    }
    return h;
  }
  function inspSite(i) {
    var s = WD.sites[i], d = D.sites[s.t], q = S.st[i], m = q.mk ? CH.mkt(S, q.mk) : null, h = head(d.n, m ? 'Market: ' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') : 'Outside market range', find(s.x, s.y));
    h += '<div class="card">' + ico('s_' + s.t) + '<div>Output: ' + rate(TPY / d.per) + ' loads of ' + gi(d.g) + ' ' + lc(gn(d.g)) + ' a year.</div></div>';
    h += '<p>' + (!m ? 'Idle. Build a market with this tile in range to start production. The market starts with one year of output in stock.' : q.on ? 'Working.' : 'Paused: ' + lc(gn(d.g)) + ' is at the minimum price in ' + esc(m.name) + '. Production resumes when stock falls.') + '</p>';
    if (m) {
      var f = CH.flows(S, m), n = 0; WD.sites.forEach(function (w, k) { if (w.t === s.t && S.st[k].mk === m.id) n++; });
      h += '<h3>' + esc(gn(d.g)) + ' in ' + esc(m.name) + '</h3><table class="tbl facts"><tbody>' +
        '<tr><td>Stock</td><td class="num"><b>' + (m.stock[d.g] || 0) + '</b> loads</td></tr>' +
        '<tr><td>Price</td><td class="num"><b class="' + pcls(m, d.g) + '">' + fmt(CH.price(S, m, d.g)) + '</b> a load <span class="dim">(base ' + G[d.g].p + ')</span></td></tr>' +
        '<tr><td>Supply</td><td class="num"><b>' + rate(f.p[d.g] || 0) + '</b> a year' + (n > 1 ? ' <span class="dim">from ' + n + ' ' + esc(lc(d.pl)) + '</span>' : '') + '</td></tr>' +
        '<tr><td>Demand</td><td class="num"><b>' + (rate(f.c[d.g] || 0) || '0') + '</b> a year</td></tr></tbody></table>' +
        '<p class="hint">' + ((f.p[d.g] || 0) > (f.c[d.g] || 0) ? 'Surplus: supply exceeds demand here. The price falls. Export it.' : 'Local demand takes the full supply.') + '</p>';
    }
    return h;
  }
  function inspHQ() {
    return head('Counting house', 'Headquarters', find(WD.hq.x, WD.hq.y)) + '<div class="card">' + ico('hq') + '<div>New merchants start here. Merchants here can switch transport, boats included.</div></div>' + B(hireLabel(), 'modal', { name: 'hire' }, 'btn wide');
  }
  function inspTool() {
    var t = ui.tool, d = toolDef(t.k, t.t), h = head(d.n, 'Cost: ' + d.cost) + '<div class="card">' + ico(d.ic) + '<div>' + esc(d.d) + '</div></div>';
    if (t.k === 'market') h += '<p class="hint">Market ranges stay separate. Leave room to upgrade. Markets are permanent.</p>';
    if (t.k === 'bld') h += '<p class="hint">Place on open ground inside a market’s range.' + (D.bld[t.t].kind === 'works' ? ' Inputs come from that market: build where they are cheap.' : ' Limit: 1 per market.') + '</p>';
    if (t.k === 'path') h += '<p class="hint">Click the start, then the end. The cheapest line is built, bridges included. Click again to extend. Houses on the line move aside.</p>';
    return h + B('Cancel', 'cancel', null, 'btn wide');
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
    if (s && !ui.tool) h = '<p class="back">' + B('‹ Overview', 'sel', { k: '' }, 'link') + '</p>' + h;
    setHTML($('inspect'), h);
  }
  function renderTitle() {
    var el = $('title'); if (ui.screen !== 'title') { if (!el.hidden) { el.hidden = true; el.__h = ''; el.innerHTML = ''; } return; }
    var s = S.tick > 0 ? CH.summary(S) : null, n = slots().length;
    setHTML(el, '<div class="tcol"><div class="tmark" aria-hidden="true"></div><h1>Counting House</h1><p class="tsub">Build markets. Run merchants. Buy low, sell high.</p><p class="tera">Malacca coast, 1400 to 1511</p><nav class="tmenu" aria-label="Main menu">' +
      (s ? B('<b>Continue</b><span>' + esc(s.name) + ', ' + s.year + ', ' + fmt(s.coins) + ' coins' + (s.over ? ', finished' : '') + '</span>', 'continue', null, 'tbtn lead') : '') +
      B('<b>New game</b>', 'modal', { name: 'newgame' }, 'tbtn' + (s ? '' : ' lead')) +
      B('<b>Load game</b>' + (n ? '<span>' + n + (n === 1 ? ' save' : ' saves') + '</span>' : ''), 'modal', { name: 'load' }, 'tbtn') +
      B('<b>Records</b>', 'modal', { name: 'records' }, 'tbtn') + B('<b>How to play</b>', 'modal', { name: 'help' }, 'tbtn') + B('<b>Settings</b>', 'modal', { name: 'settings' }, 'tbtn') + B('<b>Credits</b>', 'modal', { name: 'credits' }, 'tbtn') +
      '</nav><p class="tfoot">Version ' + VERSION + (ui.canStore ? '. Saves are kept in this browser.' : '. Saving is blocked in this browser. Progress lasts while this page stays open.') + '</p></div>');
    el.hidden = false;
  }
  function renderTabs() {
    var t = [['house', 'Overview'], ['build', 'Build'], ['merch', 'Merchants'], ['sel', 'Selected']], h = '';
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
      h += B(gi(g) + '<span class="' + (!S.mk.length ? '' : !n && used[g] ? 'neg' : !n ? 'dim' : '') + '">' + (S.mk.length ? n : '') + '</span>', 'lens', { g: g }, 'lb' + (on ? ' on' : ''), ' aria-pressed="' + on + '" title="' + esc(gn(g)) + '" aria-label="' + esc(gn(g)) + (S.mk.length ? ': ' + n + ' loads in stock' : '') + '. Show on map."');
    });
    setHTML($('lens'), h);
    var cap = $('lenscap'), g = ui.lens;
    cap.hidden = !g; setHTML(cap, g ? '<span><b>' + esc(gn(g)) + '</b>, base price ' + G[g].p + '. Markets show price and stock. Gold rings: makers and buyers.</span>' + B('Clear', 'lens', { g: g }, 'btn tiny') : '');
    setHTML($('zoom'), B('+', 'zoom', { d: 1 }, 'sbtn', ' aria-label="Zoom in"') + B('−', 'zoom', { d: -1 }, 'sbtn', ' aria-label="Zoom out"') +
      B('◇', 'reach', null, 'sbtn' + (ui.reach ? ' on' : ''), ' aria-pressed="' + !!ui.reach + '" aria-label="Show market ranges" title="Show market ranges"') +
      B('◉', 'plain', null, 'sbtn' + (ui.plain ? '' : ' on'), ' aria-pressed="' + !ui.plain + '" aria-label="Show goods and needs on map" title="Show goods and needs on map"'));
  }
  function renderBanner() {
    var t = ui.tool, el = $('banner'), h = '', pv = ui.preview;
    if (t) {
      var d = toolDef(t.k, t.t);
      if (t.k === 'path') {
        h = t.from == null ? '<b>' + esc(d.n) + '</b>, ' + d.cost + '. Click the start.' : t.pend != null && pv && pv.tiles ? '<b>' + esc(d.n) + ', ' + pv.n + ' tiles</b>: ' + pv.cost + ' coins. ' + (pv.ok ? '</span>' + B('Build', 'lay', null, 'btn gold') + '<span>' : esc(pv.why || '')) : '<b>' + esc(d.n) + '</b>. Click the end.' + (pv && pv.tiles ? ' ' + pv.n + ' tiles, ' + pv.cost + ' coins.' : '');
      } else h = '<b>' + esc(d.n) + '</b>, ' + d.cost + ' coins. ' + (t.k === 'market' ? 'Click a tile to build.' : 'Click a tile inside a market’s range.');
      h = '<span>' + h + '</span>' + B(t.k === 'path' && t.from != null ? 'Finish' : 'Cancel', 'cancel', null, 'btn');
    } else if (ui.pick) { var m = selM(); h = '<span>Click the markets for ' + (m ? esc(m.nm) + '’s' : 'the') + ' route, in order.</span>' + B('Done', 'pick', { r: ui.pick }, 'btn gold'); }
    el.hidden = !h; setHTML(el, h);
  }

  /* ---------- dialogs ---------- */
  var MODALS = {
    help: function () {
      return ['How to play',
        '<p class="lede">Malacca, 1400. You run a trading company with ' + fmt(D.diffs[S.diff].coins) + ' coins. The game ends in ' + D.span[1] + '. Score: coins held.</p><ol class="how"><li><b>Build a market.</b> Sites in its range start producing. Their goods go into the market’s stock.</li>' +
        '<li><b>Grow towns.</b> Houses arrive while rice and fish are in stock, plus 2 of salt, cloth and pottery. Houses leave when food runs low.</li>' +
        '<li><b>Hire merchants.</b> Select the markets on a route. Auto orders buy low and sell high. Manual orders set exact loads at each stop.</li>' +
        '<li><b>Build trails and roads</b> between markets. Porters move at double speed on a trail. Ox carts require a road.</li>' +
        '<li><b>Build workshops and buyers</b> in a market’s range. Workshops turn cheap inputs into higher-priced goods. Buyers add demand.</li>' +
        '<li><b>Research</b> unlocks transport, buildings and larger markets. The price drops every year. Demand shifts to new goods over time.</li>' +
        '<li><b>Lessons</b> unlock as events happen in your game. Tap a good in a market for its price chart. Tap a good on a route for its profit chart.</li></ol>' +
        '<h3>Map icons</h3><ul class="legend"><li><i class="lg ok"></i><span>Disc over a site or workshop: its output. Green ring: working. Pale: idle. Red: waiting for the input shown.</span></li>' +
        '<li><i class="lg low"></i><span>Discs over a buyer: the goods it buys. Red: stock 0, high price.</span></li>' +
        '<li><i class="lg mid"></i><span>Discs under a market name: household needs. Green: supplied. Gold: low. Red: missing. Squares with a tick: surplus goods at a low price.</span></li>' +
        '<li><i class="lg"></i><span>Over a merchant: cargo. Dotted ring: empty. Hover any object for output, stock and price. Select a good in the bar above the map to see its price at every market.</span></li></ul>' +
        '<p class="hint">Drag to move the map. Scroll or pinch to zoom. Space: pause. 1 to 4: speed. Esc: cancel.</p>' +
        '<div class="mfoot">' + B(ui.screen === 'title' ? 'Close' : 'Play', 'close', null, 'btn gold', ' data-autofocus') + '</div>' +
        (ui.canStore ? '' : '<p class="hint">Saving is blocked in this browser. Progress lasts while this page stays open.</p>')];
    },
    hire: function () {
      var cost = CH.hireCost(S), h = '<p>Each merchant has one trait. New hires start at the counting house with porters.</p><div class="cands">';
      S.cand.forEach(function (c, k) { h += '<div class="cand"><h3>' + esc(c.nm) + '</h3><p><b>' + esc(D.abil[c.ab].n) + '.</b> ' + esc(D.abil[c.ab].d) + '</p>' + gated(cost ? 'Hire: ' + fmt(cost) + ' coins' : 'Hire: free', 'hire', { k: k }, S.ms.length >= D.hire.cap ? { ok: false, why: 'Merchant limit reached: ' + D.hire.cap + '.' } : S.coins >= cost ? { ok: true } : { ok: false, why: 'Needs ' + cost + ' coins.' }, 'btn gold') + '</div>'; });
      return ['Hire a merchant', h + '</div><p class="hint">' + (cost ? '' : 'First hire: free. ') + 'Each hire costs more than the last. Wage: ' + D.hire.wage + ' coins a year, plus transport upkeep. Candidates change every year.</p>'];
    },
    adv: function () {
      var av = '', own = '', later = '', id;
      for (id in D.adv) {
        var a = D.adv[id], s = CH.advState(S, id), p = CH.advPrice(S, id);
        if (s === 'avail') av += '<li><div><h3>' + esc(a.n) + '</h3><p>' + esc(a.d) + '</p></div>' + gated('Research: ' + fmt(p) + ' coins', 'adv', { id: id }, S.coins >= p ? { ok: true } : { ok: false, why: 'Needs ' + p + ' coins.' }, 'btn gold') + '</li>';
        else if (s === 'own') own += '<li>' + esc(a.n) + '</li>'; else later += '<li>' + esc(a.n) + '<span class="dim"> ' + a.y + '</span></li>';
      }
      return ['Research', (av ? '<ul class="advs">' + av + '</ul><p class="hint">The price drops every year. Free after ' + CH.K.FREE + ' years.</p>' : '<p>All available research is complete.</p>') +
        (later ? '<h3>Upcoming</h3><ul class="cols">' + later + '</ul>' : '') + (own ? '<h3>Researched</h3><ul class="cols">' + own + '</ul>' : '')];
    },
    prices: function () {
      if (!S.mk.length) return ['Prices', '<p>Build a market to see prices.</p>'];
      var h = '<div class="scroll"><table class="tbl grid"><thead><tr><th>Good</th>', seen = {};
      S.mk.forEach(function (m) { h += '<th class="num">' + B(esc(m.name), 'sel', { k: 'mkt', id: m.id }, 'link') + '</th>'; CH.view.market(S, m).forEach(function (w) { seen[w.g] = 1; }); });
      h += '</tr></thead><tbody>';
      D.goodIds.forEach(function (g) {
        if (!seen[g]) return; h += '<tr><td>' + good(g) + '<span class="dim"> ' + G[g].p + '</span></td>';
        S.mk.forEach(function (m) { var f = CH.flows(S, m), t = CH.tOf(f, g), s = m.stock[g] || 0, p = CH.price(S, m, g), mu = p / G[g].p; h += '<td class="num ' + (!t ? 'dim' : mu >= 1.35 ? 'dear' : mu <= 0.75 ? 'cheap' : '') + '" title="' + s + ' in stock">' + (t || s ? fmt(p) + (s ? '<sub>' + s + '</sub>' : '') : '') + '</td>'; });
        h += '</tr>';
      });
      return ['Prices', h + '</tbody></table></div><p class="hint">Price per load, with stock in small figures. Grey number after a good: base price. <span class="cheap">Low</span>: 75% of base or less. <span class="dear">High</span>: 135% of base or more. Dim: demand 0 at that market.</p>', 'wide'];
    },
    ledger: function () {
      var cats = [['sales', 'Goods sold'], ['buys', 'Goods bought'], ['works', 'Workshops'], ['wages', 'Wages and upkeep'], ['build', 'Construction'], ['hire', 'Hiring and transport'], ['adv', 'Research'], ['goals', 'Goal rewards']], c = S.led.cur, p = S.led.prev, tc = 0, tp = 0;
      var h = '<p>Rank: <b>' + CH.rank(S.coins) + '</b>. ' + D.ranks.map(function (r) { return r[1] + ' from ' + fmt(r[0]); }).join(', ') + '.</p><table class="tbl"><thead><tr><th></th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
      cats.forEach(function (q) { var a = c[q[0]] || 0, b = p[q[0]] || 0; tc += a; tp += b; if (Math.round(a) || Math.round(b)) h += '<tr><td>' + q[1] + '</td><td class="num ' + tone(a) + '">' + signed(a) + '</td><td class="num ' + tone(b) + '">' + signed(b) + '</td></tr>'; });
      h += '<tr class="sum"><td>Net</td><td class="num ' + tone(tc) + '">' + signed(tc) + '</td><td class="num ' + tone(tp) + '">' + signed(tp) + '</td></tr></tbody></table>';
      if (S.ms.length) {
        h += '<h3>Merchants</h3><div class="scroll"><table class="tbl"><thead><tr><th>Name</th><th>Transport</th><th>Route</th><th class="num">Last trip</th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
        S.ms.forEach(function (m) { var Rt = m.rt && CH.routeOf(S, m.rt); h += '<tr><td>' + B(esc(m.nm), 'sel', { k: 'm', id: m.id }, 'link') + '</td><td>' + D.trans[m.tr].n + '</td><td>' + (Rt ? esc(Rt.name) : '<span class="neg">Unassigned</span>') + '</td><td class="num ' + tone(m.last || 0) + '">' + (m.last == null ? '' : signed(m.last)) + '</td><td class="num ' + tone(m.yr[0]) + '">' + signed(m.yr[0]) + '</td><td class="num ' + tone(m.yr[1]) + '">' + signed(m.yr[1]) + '</td></tr>'; });
        h += '</tbody></table></div>';
      }
      var mine = S.bl.filter(function (b) { return b.own && D.bld[b.t].kind === 'works'; });
      if (mine.length) {
        h += '<h3>Owned workshops</h3><table class="tbl"><thead><tr><th>Workshop</th><th>Market</th><th>Status</th><th class="num">This year</th><th class="num">Last year</th></tr></thead><tbody>';
        mine.forEach(function (b) { h += '<tr><td>' + B(D.bld[b.t].n, 'sel', { k: 'bld', id: b.id }, 'link') + '</td><td>' + esc(CH.mkt(S, b.mk).name) + '</td><td>' + esc(bstat(b)) + '</td><td class="num ' + tone(b.pr[0]) + '">' + signed(b.pr[0]) + '</td><td class="num ' + tone(b.pr[1]) + '">' + signed(b.pr[1]) + '</td></tr>'; });
        h += '</tbody></table>';
      }
      return ['Finances', h, 'wide'];
    },
    lessons: function () { if (ui.lesson) CH.learn.read(S, ui.lesson); return ['Lessons', CH.learn.book(S, ui.lesson)]; },
    menu: function () {
      return ['Menu', '<div class="mlist">' + B('Resume', 'close', null, 'btn gold', ' data-autofocus') + B('Save game', 'modal', { name: 'save' }, 'btn') + B('Load game', 'modal', { name: 'load' }, 'btn') + B('New game', 'modal', { name: 'newgame' }, 'btn') +
        B('Settings', 'modal', { name: 'settings' }, 'btn') + B('How to play', 'modal', { name: 'help' }, 'btn') + B('Records', 'modal', { name: 'records' }, 'btn') + B('Main menu', 'tomenu', null, 'btn') + '</div>', 'slim'];
    },
    newgame: function () {
      var su = ui.setup || (ui.setup = { name: prefs.name || D.company, diff: D.diffs[prefs.diff] ? prefs.diff : 'normal' }), h, live = S.tick > 0 && !S.over;
      h = '<label class="field wide"><span>Company name</span><input type="text" maxlength="32" value="' + esc(su.name) + '" data-ch="coname" autocomplete="off" spellcheck="false"></label>';
      h += '<div class="field wide top"><span>Difficulty</span><div class="diffs" role="radiogroup" aria-label="Difficulty">';
      Object.keys(D.diffs).forEach(function (k) {
        var d = D.diffs[k];
        h += B('<b>' + d.n + '</b><span>' + fmt(d.coins) + ' coins. Market fee ' + Math.round(d.fee * 100) + '%.' + (d.goal !== 1 ? ' Goal rewards ×' + d.goal + '.' : '') + '</span>', 'setdiff', { v: k }, 'diff' + (su.diff === k ? ' on' : ''), ' role="radio" aria-checked="' + (su.diff === k) + '"');
      });
      h += '</div></div>' + (live ? '<p class="hint">Starting replaces the autosave of ' + esc(S.name) + ', ' + CH.year(S) + '. Manual saves are kept.</p>' : '');
      return ['New game', h + '<div class="mfoot">' + B('Cancel', 'close', null, 'btn') + B('Start game', 'startnew', null, 'btn gold', ' data-autofocus') + '</div>'];
    },
    load: function () {
      var a = slots(), cur = S.tick > 0 ? CH.summary(S) : null, h = ui.msg ? '<p class="note">' + esc(ui.msg) + '</p>' : '';
      h += '<ul class="saves">' + (cur ? saveRow('Autosave', cur, 0, B('Load', 'loadslot', { id: 'auto' }, 'btn gold')) : '');
      a.forEach(function (q) { h += saveRow(q.s.name, q.s, q.t, B('Load', 'loadslot', { id: q.id }, 'btn gold') + B('Delete', 'delslot', { id: q.id, from: 'load' }, 'btn')); });
      h += '</ul>' + (!cur && !a.length ? '<p>Saved games appear here.</p>' : '');
      h += '<h3>Import a save</h3><p class="hint">From a save file or a save code made with Export.</p><div class="xfer"><label class="btn filebtn">Choose file<input type="file" accept=".json,application/json,text/plain" data-ch="importfile"></label></div>' +
        '<textarea class="code" rows="3" placeholder="Or paste a save code here" data-ch="code" aria-label="Save code" spellcheck="false">' + esc(ui.code) + '</textarea><div class="mfoot">' + B('Close', 'close', null, 'btn') + B('Load code', 'importcode', null, 'btn') + '</div>';
      return ['Load game', h];
    },
    save: function () {
      var a = slots(), h = ui.msg ? '<p class="note">' + esc(ui.msg) + '</p>' : '';
      h += B('Save as a new save', 'saveslot', null, 'btn gold wide', a.length >= MAXSLOTS ? ' disabled' : ' data-autofocus') + '<p class="hint">' + a.length + '/' + MAXSLOTS + ' saves used. The game also autosaves every 20 seconds.</p>';
      h += '<ul class="saves">'; a.forEach(function (q) { h += saveRow(q.s.name, q.s, q.t, B('Overwrite', 'saveslot', { id: q.id }, 'btn') + B('Delete', 'delslot', { id: q.id, from: 'save' }, 'btn')); }); h += '</ul>';
      h += '<h3>Export</h3><p class="hint">Move this game to another device or browser. Load it there with Load game, Import.</p><div class="mfoot left">' + B('Export file', 'exportfile', null, 'btn') + B('Copy save code', 'copycode', null, 'btn') + '</div>';
      return ['Save game', h + '<div class="mfoot">' + B('Close', 'close', null, 'btn') + '</div>'];
    },
    records: function () {
      var a = records(), h;
      if (!a.length) return ['Records', '<p>Finished games appear here. A game finishes in ' + D.span[1] + '.</p><div class="mfoot">' + B('Close', 'close', null, 'btn gold', ' data-autofocus') + '</div>'];
      h = '<table class="tbl rec"><thead><tr><th class="num">#</th><th>Company</th><th>Difficulty</th><th class="num">Coins</th><th>Rank</th><th class="num more">Goals</th><th class="num more">Largest town</th></tr></thead><tbody>';
      a.slice(0, 10).forEach(function (q, k) { h += '<tr><td class="num">' + (k + 1) + '</td><td>' + esc(String(q.name || D.company)) + '</td><td>' + (D.diffs[q.diff] || D.diffs.normal).n + '</td><td class="num"><b>' + fmt(q.coins) + '</b></td><td>' + esc(String(q.rank || CH.rank(q.coins))) + '</td><td class="num more">' + (q.goals | 0) + '/' + D.goals.length + '</td><td class="num more">' + (q.top | 0) + ' houses</td></tr>'; });
      return ['Records', h + '</tbody></table><div class="mfoot">' + B('Close', 'close', null, 'btn gold', ' data-autofocus') + '</div>', 'wide'];
    },
    credits: function () {
      var c = CH.credits || [], h = '<h3 class="first">Sound</h3><p>Every sound is a recording, trimmed and levelled for the game.</p>';
      function rows(lic) { return '<ul class="cred">' + c.filter(function (q) { return (q.lic === 'CC BY 4.0') === lic; }).map(function (q) { return '<li><a href="' + esc(q.page) + '" target="_blank" rel="noopener">' + esc(q.title) + '</a> by ' + esc(q.by) + '</li>'; }).join('') + '</ul>'; }
      h += '<p class="credh"><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">Creative Commons Attribution 4.0</a></p>' + rows(true);
      h += '<p class="credh"><a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">Public domain, CC0 1.0</a></p>' + rows(false);
      h += '<h3>Typefaces</h3><p>Alegreya and Alegreya Sans by Juan Pablo del Peral, Huerta Tipogr\u00e1fica. SIL Open Font License.</p>';
      return ['Credits', h + '<div class="mfoot">' + B('Close', 'close', null, 'btn gold', ' data-autofocus') + '</div>'];
    },
    settings: function () {
      var v = CH.sound ? CH.sound.levels() : null, h = '';
      if (v) {
        h += '<h3 class="first">Audio</h3><div class="field wide vol"><span>Sound</span><div class="seg" role="group" aria-label="Sound">' + B('On', 'soundon', { v: 1 }, 'btn tiny' + (v.on ? ' on' : ''), ' aria-pressed="' + !!v.on + '"') + B('Off', 'soundon', { v: 0 }, 'btn tiny' + (v.on ? '' : ' on'), ' aria-pressed="' + !v.on + '"') + '</div></div>';
        [['master', 'Master volume'], ['amb', 'Ambience'], ['fx', 'Effects']].forEach(function (q) { h += '<label class="field wide vol"><span>' + q[1] + '</span><input type="range" min="0" max="100" step="5" value="' + Math.round(v[q[0]] * 100) + '" data-ch="vol" data-k="' + q[0] + '"><b>' + Math.round(v[q[0]] * 100) + '</b></label>'; });
        h += '<p class="hint">Ambience: markets, water, forest and animals near the view. Effects: trades, building and news. M: sound on or off.</p>';
      }
      return ['Settings', h + '<div class="mfoot">' + B('Credits', 'modal', { name: 'credits' }, 'btn') + B('Close', 'close', null, 'btn gold', ' data-autofocus') + '</div>'];
    },
    over: function () {
      var n = D.goals.filter(function (g) { return S.goals[g.id]; }).length;
      return ['Game over', '<p class="final">' + D.span[1] + ': the Portuguese fleet arrives at Malacca. Final score: <b>' + fmt(S.final) + ' coins</b>. Rank: <b>' + CH.rank(S.final) + '</b>.</p><p>Goals: ' + n + '/' + D.goals.length + '. Largest town: ' + (S.top || 0) + ' houses.</p><div class="mfoot">' + B('Main menu', 'tomenu', null, 'btn') + B('Records', 'modal', { name: 'records' }, 'btn') + B('Keep playing', 'close', null, 'btn gold', ' data-autofocus') + '</div>'];
    },
    confirm: function () { var c = ui.confirm; return [c.title, '<p>' + esc(c.text) + '</p><div class="mfoot">' + B('Cancel', 'close', null, 'btn', ' data-autofocus') + B(c.yes, c.act, c.data, 'btn gold') + '</div>']; }
  };
  function when(t) { var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear() + ', ' + p(d.getHours()) + ':' + p(d.getMinutes()); }
  function saveRow(title, s, t, buttons) {   // one saved game in a list: what it is, where it stands, and what can be done with it
    return '<li><div class="sv"><b>' + esc(String(title)) + '</b><span>' + (s.year | 0) + ', ' + fmt(+s.coins || 0) + ' coins, ' + esc(String(s.rank || '')) + ', ' + (D.diffs[s.diff] || D.diffs.normal).n + (s.over ? ', finished' : '') + '</span>' + (t ? '<span class="dim">Saved ' + when(t) + '</span>' : '<span class="dim">The game in progress</span>') + '</div><div class="svb">' + buttons + '</div></li>';
  }
  function renderModal(first) {
    var el = $('modal'); if (!ui.modal) { el.hidden = true; el.__h = ''; el.innerHTML = ''; return; }
    var m = MODALS[ui.modal](), was = el.querySelector('.dialog'), keep = was && !first ? was.scrollTop : 0;
    el.hidden = false;
    setHTML(el, '<div class="dialog ' + (m[2] || '') + '" role="dialog" aria-modal="true" aria-labelledby="mt"><header><h2 id="mt">' + m[0] + '</h2>' + B('×', 'close', null, 'x', ' aria-label="Close"') + '</header><div class="body">' + m[1] + '</div></div>');
    if (first) { var f = el.querySelector('.body [data-autofocus]') || el.querySelector('.body button, .body select') || el.querySelector('button'); if (f) f.focus({ preventScroll: true }); var dg = el.querySelector('.dialog'); if (dg) dg.scrollTop = 0; }
    else if (keep) { var d2 = el.querySelector('.dialog'); if (d2 && d2.scrollTop !== keep) d2.scrollTop = keep; }
    if (ui.jump) { ui.jump = 0; var op = el.querySelector('[data-open]'); if (op && op.scrollIntoView) op.scrollIntoView({ block: 'nearest' }); }
  }
  function openModal(name) { if (!ui.modal) ui.back = doc.activeElement; if (name !== 'confirm' && name !== ui.modal) { ui.msg = ''; if (name === 'newgame') ui.setup = null; } ui.modal = name; renderModal(true); }
  function closeModal() { ui.modal = null; ui.confirm = null; renderModal(); if (ui.back && doc.contains(ui.back)) ui.back.focus(); refresh(); }
  function ask(title, text, yes, act, data) { ui.confirm = { title: title, text: text, yes: yes, act: act, data: data, back: ui.modal && ui.modal !== 'confirm' ? ui.modal : null }; var m = ui.msg; openModal('confirm'); ui.msg = m; }
  function back(msg) { var b = ui.confirm && ui.confirm.back; ui.confirm = null; if (b) { ui.modal = b; ui.msg = msg || ''; renderModal(true); } else { closeModal(); if (msg) toast(msg); } }      // after a confirmation: return to the dialog that asked

  /* ---------- what buttons do ---------- */
  function setTool(t) { ui.tool = t; ui.preview = null; ui.pick = null; prevKey = ''; if (t) ui.tab = 'build'; refresh(); }
  function sweep() { S.rt.filter(function (r) { return !r.stops.length && !S.ms.some(function (q) { return q.rt === r.id; }); }).forEach(function (r) { CH.act.delRoute(S, r); }); }   // routes nobody ever filled in
  function startRoute(m) { CH.act.setRoute(S, m, 0); sweep(); var q = CH.act.newRoute(S); q.R.an = 1; CH.act.setRoute(S, m, q.R.id); ui.pick = q.R.id; ui.tool = null; }
  function addStop(Rt, id) {                // a route nobody has named takes the names of its markets
    var q = CH.act.addStop(S, Rt, id); if (!run(q)) return;
    if (Rt.an && Rt.stops.length > 1) { var a = CH.mkt(S, Rt.stops[0].m).name, b = CH.mkt(S, Rt.stops[Rt.stops.length - 1].m).name; Rt.name = (Rt.stops.length === 2 ? a + '–' + b : a + ' loop').slice(0, 28); }
  }
  var ACT = {
    why: function (d) { toast(d.why); },
    pause: function () { ui.paused = !ui.paused; },
    speed: function (d) { ui.speed = +d.v; ui.paused = false; },
    tab: function (d) { ui.tab = d.t; if (d.t === 'house') { ui.sel = null; ui.tool = null; ui.pick = null; } },
    modal: function (d) { if (d.name === 'lessons') ui.lesson = CH.learn.latest(S) || ''; openModal(d.name); },
    chart: function (d) { ui.chart = ui.chart === d.g ? null : d.g; ui.whatif = 0; },
    whatif: function (d) { var m = ui.sel && ui.sel.k === 'mkt' ? CH.mkt(S, ui.sel.id) : null; ui.whatif = CH.learn.clampTrade(m, ui.chart, (ui.whatif || 0) + (+d.d)); },
    leg: function (d) { ui.leg = ui.leg && ui.leg.r === +d.r && ui.leg.k === +d.k && ui.leg.g === d.g ? null : { r: +d.r, k: +d.k, g: d.g }; },
    lesson: function (d) { var was = ui.modal === 'lessons'; ui.lesson = was && ui.lesson === d.id ? '' : d.id; ui.jump = ui.lesson ? 1 : 0; if (!was) openModal('lessons'); },
    close: function () { if (ui.modal === 'confirm' && ui.confirm && ui.confirm.back) back(ui.msg); else closeModal(); },
    tool: function (d) { var t = d.k === 'market' ? +d.t : d.t; if (ui.tool && ui.tool.k === d.k && ui.tool.t === t) setTool(null); else setTool({ k: d.k, t: t, from: null, pend: null }); },
    cancel: function () { setTool(null); },
    lay: function () { layPath(ui.tool.pend); },
    sel: function (d) { if (ui.modal) closeModal(); if (!d.k) return select(null); var s = { k: d.k, id: +d.id }, o; if (d.k === 'bld' && (o = bld(d.id))) s.at = [o.x, o.y]; select(s); if (d.k === 'mkt' && (o = CH.mkt(S, +d.id)) && !onScreen(o.x, o.y)) R.center(st, ui.cam, o.x, o.y); },
    center: function (d) { R.center(st, ui.cam, +d.x, +d.y); if (ui.tab !== 'sel') ui.tab = 'sel'; },
    zoom: function (d) { zoomAt(st.vw / 2, st.vh / 2, +d.d > 0 ? 1.35 : 1 / 1.35); },
    reach: function () { ui.reach = !ui.reach; },
    hire: function (d) {
      var q = CH.act.hire(S, +d.k); if (!run(q)) return; sfx('hire');
      closeModal(); select({ k: 'm', id: q.m.id }); if (!onScreen(q.m.x, q.m.y)) R.center(st, ui.cam, q.m.x, q.m.y);
      if (S.mk.length > 1) { startRoute(q.m); toast(q.m.nm + ' hired. Click the markets for his route, in order.'); }      // straight to work: a route of his own, ready for its stops
      else toast(q.m.nm + ' hired. Build a second market to set up a route.');
    },
    dismiss: function (d) { var m = merchant(d.m); if (m) ask('Dismiss ' + m.nm + '?', 'Permanent. His cargo is lost. The next hire costs ' + fmt(CH.hireCost(S)) + ' coins.', 'Dismiss', 'dismiss2', { m: m.id }); },
    dismiss2: function (d) { var m = merchant(d.m); if (m) CH.act.dismiss(S, m); closeModal(); select(null); },
    newroute: function (d) { startRoute(merchant(d.m)); toast('Click the markets for the route, in order. Orders start on auto.'); },
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
    enlarge: function (d) { var m = CH.mkt(S, +d.id); if (run(CH.act.enlarge(S, m))) sfx('build'); },
    buybld: function (d) { if (run(CH.act.buyBld(S, bld(d.id)), 'Workshop bought.')) sfx('coins'); },
    mode: function (d) { run(CH.act.mode(S, bld(d.id), d.mode)); },
    adv: function (d) { if (run(CH.act.buyAdv(S, d.id), 'Researched: ' + D.adv[d.id].n + '.')) sfx('chime'); },
    'continue': function () { enter(); },
    tomenu: function () { closeModal(); toTitle(); },
    setdiff: function (d) { if (ui.setup && D.diffs[d.v]) ui.setup.diff = d.v; },
    startnew: function () {
      var su = ui.setup || {}, name = String(su.name || '').trim().slice(0, 32) || D.company;
      setPref('name', name); setPref('diff', su.diff); closeModal(); newGame({ name: name, diff: su.diff }); enter();
      if (!prefs.helped) { setPref('helped', 1); openModal('help'); }
    },
    loadslot: function (d) {
      if (d.id === 'auto') { closeModal(); enter(); return; }
      var q = slots().filter(function (x) { return x.id === d.id; })[0]; if (!q) return;
      if (S.tick > 0 && !S.over) ask('Load ' + q.s.name + ', ' + q.s.year + '?', 'It becomes the game in progress and replaces the autosave of ' + S.name + ', ' + CH.year(S) + '.', 'Load', 'loadslot2', { id: d.id });
      else ACT.loadslot2(d);
    },
    loadslot2: function (d) { ui.confirm = null; if (openGame(textOf(d.id))) { closeModal(); enter(); toast('Game loaded.'); } else { ui.modal = 'load'; ui.msg = 'This save is unreadable in this version of the game.'; renderModal(true); } },
    saveslot: function (d) {
      if (d.id) { var q = slots().filter(function (x) { return x.id === d.id; })[0]; if (q) return ask('Overwrite this save?', q.s.name + ', ' + q.s.year + ', saved ' + when(q.t) + '. It is replaced by the game in progress.', 'Overwrite', 'saveslot2', { id: d.id }); }
      var r = saveSlot(null); ui.msg = r.ok ? 'Game saved.' : r.why;
    },
    saveslot2: function (d) { var r = saveSlot(d.id); back(r.ok ? 'Game saved.' : r.why); },
    delslot: function (d) { var q = slots().filter(function (x) { return x.id === d.id; })[0]; if (q) ask('Delete this save?', q.s.name + ', ' + q.s.year + ', saved ' + when(q.t) + '. Deleting is permanent.', 'Delete', 'delslot2', { id: d.id }); },
    delslot2: function (d) { dropSlot(d.id); back('Save deleted.'); },
    exportfile: function () { ui.msg = exportFile() ? 'Save file exported: ' + exportName() + '.' : 'File export is blocked in this browser. Use Copy save code.'; },
    copycode: function () {
      var text = CH.serialize(S);
      try { root.navigator.clipboard.writeText(text).then(function () { ui.msg = 'Save code copied. Paste it into Load game, Import on the other device.'; renderModal(); }, function () { ui.code = text; ui.msg = 'Copying is blocked in this browser. Open Load game: the code is in the Import box to copy by hand.'; renderModal(); }); }
      catch (err) { ui.code = text; ui.msg = 'Copying is blocked in this browser. Open Load game: the code is in the Import box to copy by hand.'; }
    },
    importcode: function () { var el = doc.querySelector('#modal textarea.code'), text = el ? el.value.trim() : ''; importText(text); },
    soundon: function (d) { if (CH.sound) { CH.sound.set('on', +d.v ? 1 : 0); setPref('snd', CH.sound.levels()); } }
  };
  function importText(text) {               // a save from a file or pasted as a code becomes the game in progress
    if (!text) { ui.msg = 'Paste a save code or choose a save file first.'; return; }
    if (openGame(text)) { ui.code = ''; closeModal(); enter(); toast('Game loaded.'); }
    else { ui.msg = 'Load failed: invalid save. Use a save file or save code made with Export.'; if (ui.modal) renderModal(); }
  }
  function onClick(e) {
    var b = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!b) { if (e.target.id === 'modal') { ACT.close(); if (ui.modal) renderModal(); } return; }
    if (b.disabled) return;
    if (b.classList.contains('tbtn') || b.classList.contains('tool') || (b.parentNode && b.parentNode.classList.contains('mlist'))) sfx('tick');
    var f = ACT[b.getAttribute('data-act')]; if (f) { f(b.dataset, b); refresh(); if (ui.modal) renderModal(); }
  }
  function onChange(e) {
    var t = e.target, ch = t.getAttribute && t.getAttribute('data-ch'), v = t.value, m, Rt; if (!ch) return;
    if (ch === 'trans') { m = merchant(t.getAttribute('data-m')); var q = CH.act.trans(S, m, v); run(q, q.ok ? (q.later ? m.nm + ' switches to ' + lc(D.trans[v].n) + ' at the next stop.' : m.nm + ' now uses ' + lc(D.trans[v].n) + '.') : ''); }
    else if (ch === 'route') { m = merchant(t.getAttribute('data-m')); CH.act.setRoute(S, m, +v); ui.pick = null; sweep(); }
    else if (ch === 'addstop' && v) addStop(CH.routeOf(S, +t.getAttribute('data-r')), +v);
    else if (ch === 'addload' && v) { Rt = CH.routeOf(S, +t.getAttribute('data-r')); CH.act.setLoad(S, Rt, +t.getAttribute('data-s'), v, 1); }
    else if (ch === 'rname') { Rt = CH.routeOf(S, +t.getAttribute('data-r')); v = v.trim().slice(0, 28); if (Rt && v) { Rt.name = v; Rt.an = 0; } }
    else if (ch === 'coname') { if (ui.setup) ui.setup.name = v; }
    else if (ch === 'code') ui.code = v;
    else if (ch === 'vol') { if (CH.sound) { CH.sound.set(t.getAttribute('data-k'), +v / 100); setPref('snd', CH.sound.levels()); var lab = t.parentNode.querySelector('b'); if (lab) lab.textContent = v; } }
    else if (ch === 'importfile' && t.files && t.files[0]) { var fr = new FileReader(); fr.onload = function () { importText(String(fr.result || '').trim()); refresh(); }; fr.onerror = function () { ui.msg = 'This file is unreadable.'; renderModal(); }; fr.readAsText(t.files[0]); }
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
    else { q = CH.planPath(S, t.t, t.from, t.pend != null ? t.pend : i); ui.preview = q.ok ? { ok: S.coins >= q.cost && q.n > 0, tiles: q.tiles, from: t.from, cost: q.cost, n: q.n, why: !q.n ? 'Already built.' : S.coins < q.cost ? 'Needs ' + q.cost + ' coins. You have ' + Math.floor(S.coins) + '.' : '' } : { ok: false, from: t.from, why: q.why }; }
  }
  function coverText(c) {
    var a = [], t; for (t in c.sites) a.push(c.sites[t] > 1 ? c.sites[t] + ' ' + D.sites[t].pl : (/^[aeiou]/i.test(D.sites[t].n) ? 'an ' : 'a ') + lc(D.sites[t].n));
    c.blds.forEach(function (b) { a.push('the ' + (b === 'istana' ? D.bld[b].n : lc(D.bld[b].n))); }); if (c.houses) a.push(c.houses + (c.houses > 1 ? ' houses' : ' house'));
    return a.length ? 'In range: ' + listing(a) + '.' : 'In range: empty land.';
  }
  function tipText() {                      // with a tool in hand, the pointer says what the tool would do there
    var pv = ui.preview, t = ui.tool;
    if (t) { if (!pv) return ''; if (!pv.ok) return pv.why || ''; if (t.k === 'market') return coverText(pv.cover) + (pv.blocks.length ? ' Blocks future upgrades of ' + listing(pv.blocks) + '.' : ''); if (t.k === 'bld') return 'Market: ' + pv.m.name + '.'; if (pv.tiles) return pv.n + ' tiles, ' + pv.cost + ' coins.'; return ''; }
    return '';
  }
  function layPath(end) {
    var t = ui.tool, q = CH.act.path(S, t.t, t.from, end);
    if (run(q)) { t.from = end; t.pend = null; prevKey = ''; toast('Built ' + q.n + ' tiles for ' + q.cost + ' coins. Click again to extend.'); sfx('path'); } else { t.pend = null; prevKey = ''; }
  }
  function mapClick(sx, sy) {
    var p = R.pick(st, S, ui.cam, sx, sy, !!ui.tool), t = ui.tool, tt = R.toTile(st, ui.cam, sx, sy), x = Math.round(tt[0]), y = Math.round(tt[1]), q;
    if (t) {
      if (t.k === 'path' && (p.k === 'mkt' || p.k === 'hq')) { x = p.x; y = p.y; }      // a click on a market's stalls means the market
      if (!inMap(x, y)) return;
      ui.hover = [x, y]; prevKey = '';
      if (t.k === 'market') { q = CH.act.market(S, x, y, t.t); if (run(q)) { sfx('build'); setTool(null); select({ k: 'mkt', id: q.m.id }); } }
      else if (t.k === 'bld') { q = CH.act.build(S, t.t, x, y); if (run(q)) { sfx('build'); setTool(null); select({ k: 'bld', id: q.b.id, at: [x, y] }); } }
      else if (t.from == null) { if (CH.layCost(S, t.t, y * W + x) < 0) toast('Start on open ground or at a market.'); else t.from = y * W + x; }
      else if (ui.touch) { t.pend = y * W + x; updatePreview(); }
      else layPath(y * W + x);
      refresh(); return;
    }
    if (ui.pick) {                           // choosing stops: the market itself, its sign, or anything inside its reach will do, and a stray click changes nothing
      var mk = p.k === 'mkt' ? p.o.m : p.k === 'house' && p.o.h[2] ? CH.mkt(S, p.o.h[2]) : p.k === 'bld' && p.o.b.mk ? CH.mkt(S, p.o.b.mk) : p.k === 'site' && S.st[p.o.i].mk ? CH.mkt(S, S.st[p.o.i].mk) : null;
      if (!mk && inMap(x, y) && CH.rt(S).own[y * W + x]) mk = CH.mkt(S, CH.rt(S).own[y * W + x]);
      if (mk) addStop(CH.routeOf(S, ui.pick), mk.id); else toast('Click a market or any tile in its range. Press Done to finish.');
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
    return 'stock <b>' + (mk.stock[g] || 0) + '</b>, price <b class="' + pcls(mk, g) + '">' + fmt(CH.price(S, mk, g)) + '</b> <span class="dim">(base ' + G[g].p + ')</span>';
  }
  function batch(d, mk) {                   // what one batch costs to make and fetches, at this market today
    var cost = 0, val = 0, g, k;
    for (g in d.inp) for (k = 0; k < d.inp[g]; k++) cost += CH.buyP(S, mk, g, -k);
    for (g in d.out) for (k = 0; k < d.out[g]; k++) val += CH.sellP(S, mk, g, k);
    return 'Batch: inputs <b>' + fmt(cost) + '</b>, output <b>' + fmt(val) + '</b>, profit <b class="' + tone(val - cost) + '">' + signed(val - cost) + '</b>';
  }
  function tipCard(p) {                     // the card for whatever the pointer is over
    var h = '', m, d, o, q;
    function row(label, body) { return '<div class="tt">' + (label ? '<span class="tl">' + label + '</span>' : '') + '<span class="tb">' + body + '</span></div>'; }
    function top(name, note, cls) { return '<div class="th"><b>' + esc(name) + '</b>' + (note ? '<span class="ts ' + (cls || '') + '">' + note + '</span>' : '') + '</div>'; }
    function priced(a, cls) { return a.map(function (w) { return '<span class="ti ' + cls + '">' + gi(w.g, 1) + fmt(w.price) + '</span>'; }).join(''); }
    if (p.k === 'site') {
      o = WD.sites[p.o.i]; d = D.sites[o.t]; if (!CH.live(S, d)) return ''; q = S.st[p.o.i]; m = q.mk ? CH.mkt(S, q.mk) : null;
      h = top(d.n, !m ? 'outside market range' : q.on ? 'working' : 'paused', !m ? '' : q.on ? 'ok' : 'bad');
      h += row('', gi(d.g) + ' Output: <b>' + rate(TPY / d.per) + '</b> loads of ' + lc(gn(d.g)) + ' a year');
      if (m) h += row('', esc(m.name) + ': ' + shelf(m, d.g)) + (q.on ? '' : row('', 'Paused at the minimum price. Resumes when stock falls.'));
      else h += row('', 'Build a market with this tile in range to start production.');
      return h;
    }
    if (p.k === 'bld') {
      var b = p.o.b; d = D.bld[b.t]; m = b.mk ? CH.mkt(S, b.mk) : null;
      if (d.kind === 'works') {
        h = top(d.n + (b.own ? ', owned' : ''), esc(lc(bstat(b))), b.st === 'run' ? 'ok' : b.st === 'wait' && G[b.why] ? 'bad' : '');
        h += '<div class="tt">' + pics(d.inp) + '<span class="dim">makes</span>' + pics(d.out) + '<span class="tb"><b>' + rate(TPY / d.time) + '</b> batches a year</span></div>';
        if (m) h += row('', batch(d, m));
      } else if (d.kind === 'demand') {
        h = top(d.n, m ? 'buys from ' + esc(m.name) : 'outside market range');
        d.want.forEach(function (e) { if (!CH.live(S, e)) return; h += row('', gi(e.g) + ' ' + esc(gn(e.g)) + ': <b>' + rate(TPY / e.per) + '</b> a year' + (m ? ', price <b class="' + pcls(m, e.g) + '">' + fmt(CH.price(S, m, e.g)) + '</b>' + ((m.stock[e.g] || 0) < 1 ? ' <span class="neg">stock 0</span>' : '') : '')); });
      } else h = top(d.n, m ? 'at ' + esc(m.name) : '') + row('', esc(d.d));
      return h;
    }
    if (p.k === 'mkt') {
      m = p.o.m; var md = CH.view.mood(S, m), tr = CH.view.trade(S, m);
      h = top(m.name, m.pop + (m.pop === 1 ? ' house' : ' houses') + (md.k > 0 ? ', growing' : md.k < 0 ? ', shrinking' : ''), md.k > 0 ? 'ok' : md.k < 0 ? 'bad' : '');
      h += row('Needs', pips(m));
      if (tr.cheap.length) h += row('Low price', priced(tr.cheap, 'cheap'));
      if (tr.dear.length) h += row('High price', priced(tr.dear, 'dear'));
      return h;
    }
    if (p.k === 'm') {
      m = p.m; var cg = Object.keys(m.cargo).map(function (g) { return '<span class="rq">' + m.cargo[g] + gi(g, 1) + '</span>'; }).join('');
      h = top(m.nm, esc(lc(D.trans[m.tr].n))) + row('', esc(mstat(m)));
      h += row('Cargo', (cg || 'empty') + ' <span class="dim">' + CH.load(m) + '/' + CH.capFor(m, m.tr) + '</span>');
      if (m.last != null) h += row('Last trip', '<b class="' + tone(m.last) + '">' + signed(m.last) + '</b>');
      return h;
    }
    if (p.k === 'house') {
      m = p.o.h[2] ? CH.mkt(S, p.o.h[2]) : null;
      return top('House', m ? esc(m.name) : 'outside market range') + row('', 'Yearly use per 4 houses: ' + D.house.filter(function (e) { return CH.live(S, e); }).map(function (e) { return '<span class="rq">' + rate(4 * TPY / e.per) + gi(e.g, 1) + '</span>'; }).join(''));
    }
    if (p.k === 'hq') return top('Counting house', 'headquarters') + row('', 'New merchants start here.');
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
    if (e.key === 'Escape') { if (ui.modal) { ACT.close(); if (ui.modal) renderModal(); } else if (ui.screen !== 'game') return; else if (ui.tool) setTool(null); else if (ui.pick) ui.pick = null; else if (ui.sel) select(null); else openModal('menu'); refresh(); return; }
    if (e.key === 'Enter' && tag === 'input' && e.target.getAttribute('data-ch') === 'coname') { if (ui.setup) ui.setup.name = e.target.value; ACT.startnew(); refresh(); return; }
    if (typing || ui.modal || ui.screen !== 'game' || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase(), pan = 90 / ui.cam.z;
    if (e.key === ' ' && tag !== 'button') { e.preventDefault(); ui.paused = !ui.paused; }
    else if (e.key >= '1' && e.key <= '4') { ui.speed = [1, 2, 4, 8][+e.key - 1]; ui.paused = false; }
    else if (k === 'm' && CH.sound) { var on = CH.sound.levels().on ? 0 : 1; CH.sound.set('on', on); setPref('snd', CH.sound.levels()); toast(on ? 'Sound on.' : 'Sound off.'); }
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
  /* The current game is saved by itself, every 20 seconds and whenever the page is left: that is the autosave. A player can also keep up to
     ten saves of their own, each under its own key with a line in an index that says what is in it. Finished games go on the records list. */
  var KEY = { slots: 'countinghouse.slots.v1', slot: 'countinghouse.slot.', rec: 'countinghouse.records.v1', prefs: 'countinghouse.prefs.v1' }, MAXSLOTS = 10;
  function readJSON(k, d) { try { var t = localStorage.getItem(k); return t ? JSON.parse(t) : d; } catch (err) { return d; } }
  function writeJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (err) { return false; } }
  var prefs = readJSON(KEY.prefs, null); if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) prefs = {};
  function setPref(k, v) { prefs[k] = v; writeJSON(KEY.prefs, prefs); }
  function save() { lastSave = performance.now(); try { localStorage.setItem(SAVE_KEY, CH.serialize(S)); ui.canStore = true; return true; } catch (err) { ui.canStore = false; return false; } }
  function load(text) { try { var s = CH.revive(JSON.parse(text)); CH.tick(s); CH.view.route(s, { stops: [] }, null); s.mk.forEach(function (m) { CH.view.market(s, m); }); CH.summary(s); return s; } catch (err) { return null; } }
  function slots() { var a = readJSON(KEY.slots, []); return Array.isArray(a) ? a.filter(function (q) { return q && typeof q.id === 'string' && q.s && typeof q.s === 'object'; }) : []; }
  function textOf(id) { try { return localStorage.getItem(id === 'auto' ? SAVE_KEY : KEY.slot + id); } catch (err) { return null; } }
  function saveSlot(id) {                   // keep the current game under a save of its own; no id makes a new one
    var a = slots();
    if (!id) { if (a.length >= MAXSLOTS) return { ok: false, why: 'Save limit reached: ' + MAXSLOTS + '. Overwrite or delete a save.' }; id = 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); }
    try { localStorage.setItem(KEY.slot + id, CH.serialize(S)); } catch (err) { return { ok: false, why: 'Browser storage is full or blocked. Export the save to a file.' }; }
    a = a.filter(function (q) { return q.id !== id; }); a.unshift({ id: id, t: Date.now(), s: CH.summary(S) });
    return writeJSON(KEY.slots, a) ? { ok: true, id: id } : { ok: false, why: 'Browser storage is full or blocked. Export the save to a file.' };
  }
  function dropSlot(id) { try { localStorage.removeItem(KEY.slot + id); } catch (err) { /* gone either way */ } writeJSON(KEY.slots, slots().filter(function (q) { return q.id !== id; })); }
  function records() { var a = readJSON(KEY.rec, []); return Array.isArray(a) ? a.filter(function (q) { return q && typeof q.coins === 'number'; }) : []; }
  function record() {                       // a finished game goes on the records list, once; its coins year by year go with it
    if (!S.over || S.rec) return; S.rec = 1;
    var a = records(), s = CH.summary(S);
    a.push({ name: s.name, diff: s.diff, coins: S.final, rank: CH.rank(S.final), goals: D.goals.filter(function (g) { return S.goals[g.id]; }).length, top: S.top || 0, t: Date.now(), hist: S.hist.slice(0, 200) });
    a.sort(function (x, y) { return y.coins - x.coins; }); writeJSON(KEY.rec, a.slice(0, 20)); save();
  }
  function resetView() { ui.sel = null; ui.tool = null; ui.pick = null; ui.preview = null; ui.paused = false; ui.speed = 1; ui.tab = 'house'; ui.sc = {}; ui.chart = null; ui.leg = null; ui.lens = null; newsSeen = S.nn; if (st) { R.ground(st, S); home(); } }
  function newGame(o) { o = o || {}; S = CH.newGame({ seed: (Date.now() % 2147483647) | 1, name: o.name, diff: o.diff }); fromSave = false; camKept = null; resetView(); save(); refresh(); }
  function openGame(text) {                 // make a saved game the current one; false when the text is not a save this version reads
    var s = text ? load(text) : null; if (!s) return false;
    S = s; fromSave = true; loadedTick = S.tick; camKept = null; resetView(); save(); refresh(); return true;
  }
  var camKept = null, driftDir = 1, still = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function frameMap() { if (st) { R.resize(st); R.clamp(st, ui.cam); } }                 // the map's box changes size between the title and the game
  function enter() {                         // from the title screen into the game
    ui.screen = 'game'; ui.paused = false; ui.msg = ''; doc.body.classList.remove('titled'); frameMap();
    if (camKept) { ui.cam.x = camKept.x; ui.cam.y = camKept.y; ui.cam.z = camKept.z; camKept = null; R.clamp(st, ui.cam); } else home();
    if (CH.sound) { CH.sound.wake(); sfx('start', { gain: 0.8 }); } renderTitle(); refresh();
  }
  function toTitle() { save(); camKept = { x: ui.cam.x, y: ui.cam.y, z: ui.cam.z }; ui.screen = 'title'; ui.sel = null; ui.tool = null; ui.pick = null; doc.body.classList.add('titled'); frameMap(); renderTitle(); refresh(); }
  function drift(dt) { if (still) return; var c = ui.cam, x0 = c.x; c.x += driftDir * dt * 9 / c.z; R.clamp(st, c); if (Math.abs(c.x - x0) < 1e-3) driftDir = -driftDir; }      // the coast slides slowly past behind the title
  function exportName() { var s = CH.summary(S); return 'counting-house-' + (s.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'save') + '-' + s.year + '.json'; }
  function exportFile() {
    try { var a = doc.createElement('a'), u = URL.createObjectURL(new Blob([CH.serialize(S)], { type: 'application/json' })); a.href = u; a.download = exportName(); doc.body.appendChild(a); a.click(); a.remove(); root.setTimeout(function () { URL.revokeObjectURL(u); }, 5000); return true; }
    catch (err) { return false; }
  }
  function home() { ui.cam.z = Math.max(R.minZoom(st), Math.min(1, st.vw / 900)); R.center(st, ui.cam, WD.hq.x + 2, WD.hq.y + 1); }

  /* ---------- the loop ---------- */
  var faults = 0, fromSave = false, loadedTick = -1, LIVE = { adv: 1, prices: 1, ledger: 1, lessons: 1, hire: 1 };      // LIVE: dialogs that show the game's figures and are drawn again while open
  function frame(ts) {
    try { step(ts); faults = 0; }
    catch (err) {
      faults++; if (root.console) console.error(err);
      if (fromSave && S.tick <= loadedTick + 2) { fromSave = false; newGame(); toast('Save unreadable. New game started.'); }       // a save that opens and then breaks the first tick
      else { ui.paused = true; toast('Error. Game paused: ' + (err && err.message ? err.message : err)); }
    }
    if (faults < 30) root.requestAnimationFrame(frame);
  }
  var lastHear = 0;
  function hear(ts) {                       // hand the sound engine what the game reported, placed on the screen, and a few times a second what the view holds
    var snd = CH.sound, q = CH.rt(S).snd; if (!snd) { q.length = 0; return; }
    var live = ui.screen === 'game', near = Math.max(0, Math.min(1, (ui.cam.z - 0.3) / 0.8)), vw = st.vw, vh = st.vh, quiet = !!ui.modal;
    function panOf(sx) { return Math.max(-1, Math.min(1, sx / vw * 2 - 1)); }
    function at(x, y) { var p = R.toScreen(st, ui.cam, x, y); return p[0] >= 0 && p[1] >= 0 && p[0] <= vw && p[1] <= vh ? [panOf(p[0]), 0.35 + 0.65 * near] : null; }
    snd.pace = ui.speed;
    while (q.length) {
      var e = q.shift(); if (!live || quiet) continue;
      var p = R.toScreen(st, ui.cam, e.x, e.y), off = Math.max(0, -p[0] / vw, p[0] / vw - 1, -p[1] / vh, p[1] / vh - 1);      // how far outside the view, in screens
      snd.event(e, panOf(p[0]), off <= 0 ? 0.6 + 0.4 * near : ui.speed > 2 ? 0 : off < 1 ? 0.3 * (1 - off) + 0.07 : 0.07);
    }
    if (ts - lastHear < 400) return; lastHear = ts;
    var spots = {}, water = 0, wood = 0, seen = 0, pop = 0, fires = 0, i, j;
    for (i = 0; i < 7; i++) for (j = 0; j < 5; j++) {
      var t = R.toTile(st, ui.cam, (i + 0.5) * vw / 7, (j + 0.5) * vh / 5), tx = Math.round(t[0]), ty = Math.round(t[1]); if (!inMap(tx, ty)) continue;
      seen++; var tr = CH.ter(S, CH.I(tx, ty)); if (tr === D.T.SEA || tr === D.T.RIVER) water++; else if (tr === D.T.FOREST) wood++;
    }
    water = seen ? water / seen : 0.5; wood = seen ? wood / seen : 0;
    function spot(kind, x, y) { if (spots[kind] && Math.random() < 0.5) return; var a = at(x, y); if (a) spots[kind] = a; }      // of several of a kind in view, any one may be the one heard
    S.mk.forEach(function (m) { var c = R.toScreen(st, ui.cam, m.x, m.y), rr = D.sizes[m.sz].r * 44 * ui.cam.z; if (c[0] < -rr || c[1] < -rr || c[0] > vw + rr || c[1] > vh + rr) return; pop += m.pop * (at(m.x, m.y) ? 1 : 0.4); if (m.pop >= 3 && near > 0.25) spot('cluck', m.x, m.y); if (m.pop >= 8 && near > 0.25) spot('rooster', m.x, m.y); });
    S.bl.forEach(function (b) {
      if (!b.mk || (D.bld[b.t].kind === 'works' && b.st !== 'run')) return;
      if ((b.t === 'potter' || b.t === 'smelter' || b.t === 'goldsmith' || b.t === 'curing') && at(b.x, b.y)) fires++;
      if (b.t === 'smelter' || b.t === 'goldsmith' || b.t === 'shipyard') spot('hammer', b.x, b.y); else if (b.t === 'carpenter') spot('saw', b.x, b.y); else if (b.t === 'harbour') spot('gull', b.x, b.y);
    });
    WD.sites.forEach(function (s, n) { if (!S.st[n].on) return; if (s.t === 'timber') spot('chop', s.x, s.y); else if (s.t === 'mine' || s.t === 'goldpit') spot('pick', s.x, s.y); else if (s.t === 'fishery') spot('splash', s.x, s.y); });
    S.ms.forEach(function (m) { var h = R.here(m); if (m.tr === 'cart') { spot('ox', h[0], h[1]); if (m.st === 'go') spot('cart', h[0], h[1]); } else if (D.trans[m.tr].mode === 'water' && m.st === 'go') spot('splash', h[0], h[1]); });
    if (water > 0.2 && !spots.gull) spots.gull = [Math.random() * 1.6 - 0.8, 0.3 + 0.4 * water];
    if (wood > 0.15) spots.bird = [Math.random() * 1.6 - 0.8, (0.3 + 0.7 * near) * Math.min(1, wood * 2)];
    var hush = quiet ? 0.55 : 1, beds = { crowd: Math.min(1, Math.sqrt(pop) / 8) * (0.3 + 0.7 * near) * hush, waves: Math.min(1, water * 1.8) * 0.9 * hush, forest: Math.min(1, wood * 1.7) * (0.35 + 0.65 * near) * hush, fire: Math.min(1, fires * 0.5) * near * hush };
    if (!live) { beds.crowd *= 0.6; beds.fire = 0; spots = spots.gull ? { gull: spots.gull } : {}; }      // behind the title: the sea, a murmur, a gull
    else if (quiet || ui.paused) spots = {};
    snd.scene({ beds: beds, spots: spots });
  }
  function remember() { for (var i = 0; i < S.ms.length; i++) { var m = S.ms[i], q = ui.prev.get(m), h = R.here(m); if (!q) { q = {}; ui.prev.set(m, q); } q.p = m.path; q.s = m.pi + m.pf; q.x = h[0]; q.y = h[1]; } }
  function step(ts) {
    var dt = Math.min(0.12, (ts - lastTs) / 1000 || 0); lastTs = ts;
    var live = ui.screen === 'game';
    if (live && !ui.paused && !ui.modal) { acc += dt * TICKS * ui.speed; var n = 0; while (acc >= 1 && n < 60) { remember(); CH.tick(S); acc -= 1; n++; } if (acc > 3) acc = 0; }
    if (!live && !ui.modal) drift(dt);
    ui.alpha = Math.min(1, acc);
    if (ui.tool && ui.hover) updatePreview();
    R.render(st, S, ui, ts); hear(ts);
    if (S.nn !== newsSeen) { var l = S.news[S.news.length - 1]; newsSeen = S.nn; if (live && l && l.k) { if (!ui.modal) toast(l.s); if (CH.sound) CH.sound.news(l.k); } dirty = true; }
    if (S.over && !S.rec) record();
    if (live && S.over && !S.seenOver && !ui.modal) { S.seenOver = 1; openModal('over'); }
    if (toastUntil && ts > toastUntil) { $('toast').hidden = true; toastUntil = 0; }
    renderTip();
    if ((dirty || ts - lastUi > 260) && ts > holdUntil) {
      dirty = false; lastUi = ts;
      var ae = doc.activeElement, busy = ae && (ae.tagName === 'SELECT' || ae.tagName === 'INPUT') && $('inspect').contains(ae);
      renderTitle(); if (live) { renderTop(); renderLeft(); if (!busy) renderInspect(); renderTabs(); renderBanner(); renderLens(); }
    }
    if (ts - lastMini > 240) { lastMini = ts; R.mini(st, S, ui, $('mini')); }
    if (ui.modal && ts - lastModal > 1000 && ts > holdUntil) { lastModal = ts; var a = doc.activeElement, tag = a ? (a.tagName || '').toLowerCase() : ''; if (tag !== 'select' && tag !== 'input' && LIVE[ui.modal]) renderModal(); }
    if (live && ts - lastSave > 20000) save();
  }
  function start(hot) {
    var text = hot && hot.save ? hot.save : null;
    if (!text) { try { text = localStorage.getItem(SAVE_KEY); } catch (err) { text = null; } }
    S = text ? load(text) : null;
    var fresh = !S; if (S) { fromSave = true; loadedTick = S.tick; } else S = CH.newGame({ seed: (Date.now() % 2147483647) | 1 });
    st = R.init($('map'), S); R.resize(st);
    newsSeen = S.nn; ui.canStore = save();
    if (hot && hot.save) ui.screen = 'game'; else doc.body.classList.add('titled');      // a page reloaded in the middle of work goes straight back to the game; everyone else meets the title
    R.resize(st);
    if (hot && hot.cam) { ui.cam = hot.cam; R.clamp(st, ui.cam); } else home();
    bindMap();
    doc.addEventListener('click', onClick); doc.addEventListener('change', onChange); doc.addEventListener('input', onChange); doc.addEventListener('keydown', onKey);
    doc.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('#left,#inspect,#modal,#top,#hud,#zoom,#tabs')) holdUntil = performance.now() + 700; }, true);
    doc.addEventListener('pointerup', function () { holdUntil = Math.min(holdUntil, performance.now() + 80); }, true);
    function fit() { R.resize(st); R.clamp(st, ui.cam); }
    root.addEventListener('resize', fit); if (root.ResizeObserver) new ResizeObserver(fit).observe($('mapwrap'));
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) { save(); if (CH.sound) CH.sound.sleep(); } else if (CH.sound) CH.sound.wake(); }); root.addEventListener('pagehide', save);
    if (CH.sound) { CH.sound.load(prefs.snd); CH.sound.prepare(); var awake = function () { CH.sound.wake(); }; doc.addEventListener('pointerdown', awake, true); doc.addEventListener('keydown', awake, true); }      // sound may only begin from a click or a key
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { st.tw = {}; refresh(); });      // text measured before the lettering arrived is measured again
    if (root.claude && root.claude.hot && root.claude.hot.snapshot) root.claude.hot.snapshot(function () { return { save: CH.serialize(S), cam: ui.cam }; });
    renderTitle();
    CH.ui = { state: function () { return S; }, ui: ui, act: ACT, st: st, click: mapClick, slots: slots, records: records, prefs: prefs,
      begin: function (o) { if (ui.modal) closeModal(); newGame(o); enter(); } };   // handy from the console and for tests; begin: straight into a new game, past the title
    root.requestAnimationFrame(frame);
  }
  var hot = root.claude && root.claude.hot;
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
})(window);
