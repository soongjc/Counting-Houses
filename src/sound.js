/* Counting House: sound.

   Every sound is a recording: field recordings of a market crowd, a beach, an ox cart, coins on a table, and so on
   (assets/sounds/CREDITS.md names each one and its licence; tools/sounds/ cuts them). The build embeds them in the
   page as small MP3s (CH.sounddata). This file decodes them when the page starts and plays them: effects when
   things happen, and an ambience mixed from what the map view shows: market chatter where there are houses, waves
   along the coast, a forest where there are trees, and now and then an ox, a cart, a gull, a rooster or a hammer
   from whatever is in sight. */
(function (root) {
  'use strict';
  var CH = root.CH = root.CH || {}, DATA = CH.sounddata || {};
  var api = CH.sound = { names: Object.keys(DATA) }, COUNT = {};
  api.names.forEach(function (id) { COUNT[id] = DATA[id].files.length; });
  api.versions = function (id) { return COUNT[id] || 0; };
  api.isLoop = function (id) { return !!(DATA[id] && DATA[id].loop); };

  var AC = root.AudioContext || root.webkitAudioContext, OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
  var ctx = null, dec = null, master = null, busAmb = null, busFx = null, tap = null;
  var bank = {}, loops = {}, queue = [], busy = 0, wait = [], begun = false, todo = 0, done = 0, failed = 0, voices = 0, lv = { on: 1, master: 0.7, amb: 0.6, fx: 0.8 }, due = {}, lastCoin = 0, lastBig = -99, lastSpot = 0, tuneEnds = 0, owed = 0, usual = 0, played = {};
  api.pace = 1;                             // the game's speed: at 8x the coins of every trade would be a din, so they are spaced out
  api.big = 60;                             // the least a stop must earn to ring the cash register; above that it takes twice the usual earnings of a stop

  /* ---------- decoding ---------- */
  function bytes(b64) { var s = root.atob(b64), n = s.length, a = new Uint8Array(n), i; for (i = 0; i < n; i++) a[i] = s.charCodeAt(i); return a.buffer; }
  /* A loop that repeats without a seam: the last stretch is folded over the first, each fading through the other. MP3 pads its ends with silence, so a little is cut from both first. */
  function seamless(b, xf) {
    var sr = b.sampleRate, skip = Math.floor(0.06 * sr), x = Math.floor(xf * sr), m = b.length - 2 * skip - x, out, c, i;
    if (m < x) return b;
    out = dec.createBuffer(b.numberOfChannels, m, sr);
    for (c = 0; c < b.numberOfChannels; c++) {
      var src = b.getChannelData(c), dst = out.getChannelData(c);
      for (i = 0; i < m; i++) dst[i] = src[skip + i];
      for (i = 0; i < x; i++) { var k = i / x; dst[i] = src[skip + i] * Math.sin(k * Math.PI / 2) + src[skip + m + i] * Math.cos(k * Math.PI / 2); }      // the start begins as the end's continuation
    }
    return out;
  }
  function next() {                         // two recordings decode at a time, the short effects first; the browser decodes off the page's own thread
    while (busy < 2 && queue.length) (function (q) {
      var id = q[0], k = q[1], buf;
      function fin() { busy--; done++; DATA[id].files[k] = null; next(); }
      busy++;
      try { buf = bytes(DATA[id].files[k]); } catch (err) { failed++; fin(); return; }
      dec.decodeAudioData(buf, function (b) {
        try { if (DATA[id].loop) b = seamless(b, DATA[id].loop); (bank[id] = bank[id] || []).push(b); if (DATA[id].loop && ctx) startLoop(id, b); } catch (err) { failed++; }
        fin();
      }, function () { failed++; fin(); });
    })(queue.shift());
    if (wait.length) wait = wait.filter(function (w) { if (Date.now() > w[2]) return false; if (!bank[w[0]]) return true; api.play(w[0], w[1]); return false; });      // a sound asked for while it was still being decoded
  }
  /* Decoding starts when the page does, so that the first click already has its sound: a browser lets sound play only from a click or a key, but decoding needs no permission. */
  api.prepare = function () {
    if (begun || !AC || !lv.on || !api.names.length || !root.atob) return;
    if (!dec) { try { dec = OAC ? new OAC(1, 1, 44100) : ctx; } catch (err) { dec = ctx; } }
    if (!dec) return;                       // a browser without an offline decoder: wait for the first click
    begun = true;
    api.names.forEach(function (id) { if (!DATA[id].loop) for (var k = 0; k < COUNT[id]; k++) queue.push([id, k]); });
    api.names.forEach(function (id) { if (DATA[id].loop) queue.push([id, 0]); });
    todo = queue.length; root.setTimeout(next, 200);
  };

  /* ---------- playing ---------- */
  function apply() { if (!ctx) return; var t = ctx.currentTime; master.gain.setTargetAtTime(lv.on ? lv.master : 0, t, 0.05); busAmb.gain.setTargetAtTime(lv.amb, t, 0.05); busFx.gain.setTargetAtTime(lv.fx, t, 0.05); }
  function startLoop(id, b) { if (loops[id]) return; var s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = b; s.loop = true; g.gain.value = 0; s.connect(g); g.connect(busAmb); s.start(); loops[id] = g; }
  api.wake = function () {                  // called on a click or a key: browsers only let sound start from one
    if (!AC || !lv.on) return;
    if (!ctx) {
      try { ctx = new AC(); } catch (err) { ctx = null; return; }
      master = ctx.createGain(); busAmb = ctx.createGain(); busFx = ctx.createGain(); master.gain.value = 0;
      var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
      var out = ctx.createGain(); out.gain.value = 1.5;      // the mix leaves the compressor about 8 dB under full scale: this brings it up to the level of other things a phone plays
      busAmb.connect(master); busFx.connect(master); master.connect(comp); comp.connect(out); out.connect(ctx.destination);
      if (ctx.createAnalyser) { tap = ctx.createAnalyser(); tap.fftSize = 2048; out.connect(tap); }
      api.names.forEach(function (id) { if (DATA[id].loop && bank[id]) startLoop(id, bank[id][0]); });      // what was decoded while the page waited for its first click
      apply(); api.prepare();
    }
    if (ctx.state !== 'running' && ctx.state !== 'closed' && ctx.resume) { try { var pr = ctx.resume(); if (pr && pr.catch) pr.catch(function () {}); } catch (err) { /* the next click tries again */ } }      // suspended, or interrupted by a call on a phone
  };
  api.sleep = function () { if (ctx && ctx.state === 'running' && ctx.suspend) ctx.suspend(); };
  api.levels = function () { return { on: lv.on, master: lv.master, amb: lv.amb, fx: lv.fx }; };
  api.set = function (k, v) { if (k === 'on') { lv.on = v ? 1 : 0; if (lv.on) api.wake(); else api.sleep(); } else if (k in lv) lv[k] = Math.max(0, Math.min(1, +v || 0)); apply(); };
  api.load = function (p) { if (!p || typeof p !== 'object') return; ['master', 'amb', 'fx'].forEach(function (k) { if (typeof p[k] === 'number' && p[k] >= 0 && p[k] <= 1) lv[k] = p[k]; }); if (p.on === 0 || p.on === 1) lv.on = p.on; apply(); };
  api.state = function () { return { has: !!AC, ctx: ctx ? ctx.state : 'none', made: done, of: todo, failed: failed, voices: voices, loops: Object.keys(loops).map(function (k) { return k + ':' + loops[k].gain.value.toFixed(2); }), played: played }; };
  api.level = function () { if (!tap) return 0; var d = new Float32Array(tap.fftSize), s = 0, i; if (tap.getFloatTimeDomainData) tap.getFloatTimeDomainData(d); for (i = 0; i < d.length; i++) s += d[i] * d[i]; return Math.sqrt(s / d.length); };
  api.seconds = function (id) { return (bank[id] || []).map(function (b) { return +b.duration.toFixed(2); }); };
  api.seam = function (id) {                // for the checks: the step where a loop wraps round, against its usual step from one sample to the next
    var b = bank[id] && bank[id][0]; if (!b) return null; var d = b.getChannelData(0), n = d.length, s = 0, i;
    for (i = 1; i < n; i += 7) s += Math.abs(d[i] - d[i - 1]); return +(Math.abs(d[0] - d[n - 1]) / (s / Math.floor(n / 7))).toFixed(2);
  };
  var TUNE = { start: 2.0, goal: 2.6, milestone: 3.0, lesson: 1.4, chime: 1.6, warn: 1.0, hire: 0.8, over: 4.0 };      // the tunes, and how long each holds the floor
  api.play = function (id, o) {             // one sound, once. o: gain 0..1, pan -1..1, amb = it belongs to the ambience, delay in seconds
    if (!ctx || !lv.on) return false;
    if (!bank[id]) { if (DATA[id] && done < todo && wait.length < 4) wait.push([id, o, Date.now() + 2500]); return false; }
    if (ctx.state !== 'running' || voices > 22) return false;
    o = o || {};
    var turn = 0; if (TUNE[id]) { turn = Math.max(0, tuneEnds - ctx.currentTime); if (turn > 4 && id !== 'over') return false; tuneEnds = ctx.currentTime + turn + TUNE[id]; }      // tunes take turns: one that arrives while another plays waits for it, and a queue of them is cut short
    var v = bank[id], s = ctx.createBufferSource(), g = ctx.createGain(), last = g;
    s.buffer = v[Math.floor(Math.random() * v.length)]; s.playbackRate.value = (o.rate || 1) * (TUNE[id] ? 1 : 0.97 + Math.random() * 0.06);      // a recording played a shade faster or slower each time sounds less like a recording; the tunes keep their pitch
    g.gain.value = Math.max(0, Math.min(1.5, (o.gain == null ? 1 : o.gain) * DATA[id].level));
    s.connect(g);
    if (ctx.createStereoPanner && o.pan) { last = ctx.createStereoPanner(); last.pan.value = Math.max(-1, Math.min(1, o.pan)) * 0.8; g.connect(last); }
    last.connect(o.amb ? busAmb : busFx); voices++; played[id] = (played[id] || 0) + 1; s.onended = function () { voices--; };
    s.start(ctx.currentTime + (o.delay || 0) + turn); return true;
  };
  /* What the engine reports (a trade, a new house, a house gone), with where it is on the screen: pan -1..1, near 0..1 (1 = in view, 0 = out of earshot). */
  api.event = function (e, pan, near) {
    if (!ctx) return;
    var t = ctx.currentTime;
    if (e.k === 'trade') {
      if (e.net > api.big && e.net >= 2 * usual && t - lastBig > 6 + 3 * (api.pace - 1)) { lastBig = t; lastCoin = t; owed = 0; api.play('register', { gain: 0.5 + 0.4 * near, pan: pan * 0.6 }); }      // a stop that earned twice the usual: the cash register, wherever on the map it was
      else if (near <= 0) { /* out of earshot */ }
      else if (e.sold > 0) {
        owed += Math.max(0, e.net);
        if (t - lastCoin >= 0.16 + 0.12 * (api.pace - 1)) { lastCoin = t; api.play(owed >= 18 ? 'coins' : 'coin', { gain: 0.9 * near, pan: pan }); owed = 0; }      // many merchants at once: one sound speaks for the lot, as big as their takings together
      } else if (e.net < 0 && near > 0.5 && t - lastCoin > 0.3) { lastCoin = t; api.play('buy', { gain: 0.7 * near, pan: pan }); }
      if (e.net > 0) usual = usual ? usual * 0.9 + e.net * 0.1 : e.net;
      return;
    }
    if (e.k === 'house') { if (e.n === 10 || e.n === 40 || e.n === 100) api.play('milestone', { gain: 0.6 + 0.4 * near, pan: pan * 0.5 }); else if (near > 0.5) api.play('pop', { gain: 0.8, pan: pan }); }      // a town reaching 10, 40 or 100 houses is heard from anywhere
    else if (e.k === 'left' && near > 0.5) api.play('left', { gain: 0.8, pan: pan });
  };
  var NEWS = { goal: 'goal', lesson: 'lesson', adv: 'chime', warn: 'warn', good: 'chime', end: 'over' };
  api.news = function (kind) { if (NEWS[kind]) api.play(NEWS[kind], { gain: 0.9 }); };
  /* What is in view, a few times a second. beds: crowd, waves, forest, fire, each 0..1. spots: things that make a noise now and then,
     { ox: [pan, near], cart, gull, bird, hammer, pick, chop, saw, cluck, rooster, splash }. Each kind keeps its own clock. */
  var SPOT = { ox: ['moo', 16, 36, 1], cart: ['cart', 7, 16, 1], gull: ['gull', 7, 18, 1], bird: ['bird', 6, 14, 1], hammer: ['hammer', 6, 13, 0.8], pick: ['pick', 3, 7, 0.8], chop: ['chop', 6, 13, 0.8], saw: ['saw', 8, 18, 0.8], cluck: ['cluck', 12, 28, 0.9], rooster: ['rooster', 45, 110, 0.9], splash: ['splash', 6, 13, 0.9] };      // sound, least and most seconds between two of them, level
  var BED = { crowd: 0.75, waves: 0.8, forest: 0.8, fire: 0.5 };      // the beds sit under the things heard now and then
  api.scene = function (s) {
    if (!ctx || ctx.state !== 'running') return;
    var t = ctx.currentTime, k;
    for (k in BED) if (loops[k]) loops[k].gain.setTargetAtTime(Math.max(0, Math.min(1, (s.beds && s.beds[k]) || 0)) * BED[k] * DATA[k].level * 1.25, t, 0.5);
    for (k in SPOT) {
      var at = s.spots && s.spots[k], q = SPOT[k];
      if (!at) { if (due[k] && due[k] - t > q[1]) due[k] = t + q[1] * Math.random(); continue; }
      if (!due[k]) due[k] = t + q[1] * (0.2 + 0.8 * Math.random());
      if (t >= due[k] && t - lastSpot >= 1.1) { lastSpot = t; api.play(q[0], { gain: q[3] * at[1], pan: at[0], amb: true }); due[k] = t + q[1] + (q[2] - q[1]) * Math.random(); }      // one at a time: two that fall due together take turns
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
