/* Counting House — the isometric map. It reads the game and never changes it.
   The ground is one painting, made texel by texel from smoothed fields (land, river, forest, hill, relief, depth),
   so coasts, rivers and forest edges are curves and not tile steps. It is painted flat, as seen from straight
   above, and laid under the isometric view with a single affine transform. Everything that stands up is a
   small picture drawn once in code, given an outline and a cast shadow, and stamped back to front. */
(function (root) {
  'use strict';
  var CH = root.CH, D = CH.DEF, T = D.T, W = D.W, H = D.H, WD = CH.genWorld();
  var HW = 32, HH = 16, OX = H * HW, OY = 70, WW = (W + H) * HW, WH = (W + H) * HH + OY + 44, SS = 2;
  var R = CH.draw = { HW: HW, HH: HH, WW: WW, WH: WH };
  var GOLD = '#f2b632', WAX = '#f2e6c9', INK = '#0e172b', DEAR = '#f0736e', GREEN = '#4fc3a1', BG = [15, 28, 56], G = D.goods;
  function cx(x, y) { return (x - y) * HW + OX; }
  function cy(x, y) { return (x + y) * HH + OY + HH; }
  R.cx = cx; R.cy = cy;
  function h2(x, y, s) { return CH.hash2(x, y, s); }
  function cl(v, a, b) { return v < a ? a : v > b ? b : v; }
  function vn(x, y, s) {             // smooth value noise, 0..1
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }

  /* ---------------- the ground ---------------- */
  var FG = 4, FW = W * FG, FH = H * FG, NF = 10, K7 = [1, 6, 15, 20, 15, 6, 1], MASKS = ['L', 'R', 'U', 'F', 'H', 'M'];
  var seaD = null;
  function seaDepth() {              // how far each sea tile lies from land: 0 at the shore, 1 in open water
    if (seaD) return seaD; seaD = new Float32Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (WD.terr[y * W + x] !== T.SEA) continue; var best = 5.5;
      for (var dy = -5; dy <= 5; dy++) for (var dx = -5; dx <= 5; dx++) {
        var nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var t = WD.terr[ny * W + nx]; if (t !== T.SEA && t !== T.RIVER) best = Math.min(best, Math.hypot(dx, dy));
      }
      seaD[y * W + x] = Math.min(1, (best - 1) / 4.5);
    }
    return seaD;
  }
  function bil(arr, u, v) {          // a per-tile value read between tile centres
    u = cl(u, 0, W - 1); v = cl(v, 0, H - 1);
    var x = Math.min(W - 2, Math.floor(u)), y = Math.min(H - 2, Math.floor(v)), fx = u - x, fy = v - y, i = y * W + x;
    return arr[i] * (1 - fx) * (1 - fy) + arr[i + 1] * fx * (1 - fy) + arr[i + W] * (1 - fx) * fy + arr[i + W + 1] * fx * fy;
  }
  function masks(st, S, i0, j0, i1, j1) {   // which kind of ground each fine cell is, read through a gentle wobble so no edge runs straight
    var m = st.raw;
    for (var j = Math.max(0, j0); j <= Math.min(FH - 1, j1); j++) for (var i = Math.max(0, i0); i <= Math.min(FW - 1, i1); i++) {
      var u = (i + 0.5) / FG - 0.5, v = (j + 0.5) / FG - 0.5;
      var wu = u + (vn(u / 2.6, v / 2.6, 41) - 0.5) * 0.46 + (vn(u * 1.1, v * 1.1, 43) - 0.5) * 0.14, wv = v + (vn(u / 2.6, v / 2.6, 57) - 0.5) * 0.46 + (vn(u * 1.1, v * 1.1, 59) - 0.5) * 0.14;
      var q = cl(Math.round(wv), 0, H - 1) * W + cl(Math.round(wu), 0, W - 1), t = WD.terr[q], k = j * FW + i;
      m.L[k] = t === T.SEA || t === T.RIVER ? 0 : 1; m.R[k] = t === T.RIVER ? 1 : 0; m.U[k] = t === T.RIVER && !WD.nav[q] ? 1 : 0;
      m.F[k] = t === T.FOREST && !(S && S.clear[q]) ? 1 : 0; m.H[k] = t === T.HILL || t === T.MOUNT ? 1 : 0; m.M[k] = t === T.MOUNT ? 1 : 0;
    }
  }
  function blur(src, dst, i0, j0, i1, j1) { // soften a mask over a rectangle of fine cells
    var a0 = Math.max(0, i0), a1 = Math.min(FW - 1, i1), c0 = Math.max(0, j0), c1 = Math.min(FH - 1, j1), b0 = Math.max(0, c0 - 3), b1 = Math.min(FH - 1, c1 + 3);
    var tw = a1 - a0 + 1, tmp = new Float32Array(tw * (b1 - b0 + 1)), i, j, k, s, q;
    for (j = b0; j <= b1; j++) for (i = a0; i <= a1; i++) { s = 0; for (k = -3; k <= 3; k++) { q = i + k; s += src[j * FW + (q < 0 ? 0 : q >= FW ? FW - 1 : q)] * K7[k + 3]; } tmp[(j - b0) * tw + i - a0] = s / 64; }
    for (j = c0; j <= c1; j++) for (i = a0; i <= a1; i++) { s = 0; for (k = -3; k <= 3; k++) { q = j + k; q = q < b0 ? b0 : q > b1 ? b1 : q; s += tmp[(q - b0) * tw + i - a0] * K7[k + 3]; } dst[j * FW + i] = s / 64; }
  }
  function fields(st, S) {
    var n = FW * FH, f = st.fld = new Float32Array(n * NF), tmp = new Float32Array(n), e = new Float32Array(n), sd = seaDepth(), i, j, k, u, v;
    st.raw = {}; MASKS.forEach(function (key) { st.raw[key] = new Float32Array(n); });
    masks(st, S, 0, 0, FW - 1, FH - 1);
    MASKS.forEach(function (key, c) { blur(st.raw[key], tmp, 0, 0, FW - 1, FH - 1); for (k = 0; k < n; k++) f[k * NF + c] = tmp[k]; });
    for (j = 0; j < FH; j++) for (i = 0; i < FW; i++) {
      k = j * FW + i; u = (i + 0.5) / FG - 0.5; v = (j + 0.5) / FG - 0.5;
      var base = bil(WD.elev, u, v);
      e[k] = base + f[k * NF + 4] * 0.2 * (1 - Math.abs(2 * vn(u * 0.85, v * 0.85, 71) - 1)) + f[k * NF + 5] * 0.3 * vn(u * 1.6, v * 1.6, 73) + 0.02 * vn(u * 2.3, v * 2.3, 75);
      f[k * NF + 7] = bil(sd, u, v); f[k * NF + 8] = vn(u * 0.7, v * 0.7, 81) * 0.6 + vn(u * 2.9, v * 2.9, 83) * 0.4; f[k * NF + 9] = base;
    }
    for (j = 0; j < FH; j++) for (i = 0; i < FW; i++) {       // light from the upper left of the screen
      k = j * FW + i;
      f[k * NF + 6] = cl(0.5 + (e[j * FW + Math.min(FW - 1, i + 1)] - e[j * FW + Math.max(0, i - 1)]) * 6.5 + (e[Math.min(FH - 1, j + 1) * FW + i] - e[Math.max(0, j - 1) * FW + i]) * 2.2, 0, 1);
    }
  }
  function ss(v, a, b) { v = (v - a) / (b - a); v = v < 0 ? 0 : v > 1 ? 1 : v; return v * v * (3 - 2 * v); }
  function paintTex(st, x0, y0, x1, y1) {   // colour the texels of a rectangle of the flat painting
    var P = st.P; x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(W * P, Math.ceil(x1)); y1 = Math.min(H * P, Math.ceil(y1)); if (x1 <= x0 || y1 <= y0) return;
    var img = st.tctx.createImageData(x1 - x0, y1 - y0), d = img.data, f = st.fld, o = 0, kf = FG / P, px, py;
    for (py = y0; py < y1; py++) {
      var fj = (py + 0.5) * kf - 0.5, j0 = Math.floor(fj), wy = fj - j0, ja = cl(j0, 0, FH - 1), jb = cl(j0 + 1, 0, FH - 1), v = (py + 0.5) / P - 0.5;
      for (px = x0; px < x1; px++) {
        var fi = (px + 0.5) * kf - 0.5, i0 = Math.floor(fi), wx = fi - i0, ia = cl(i0, 0, FW - 1), ib = cl(i0 + 1, 0, FW - 1);
        var a = (ja * FW + ia) * NF, b = (ja * FW + ib) * NF, e = (jb * FW + ia) * NF, g = (jb * FW + ib) * NF, w0 = (1 - wx) * (1 - wy), w1 = wx * (1 - wy), w2 = (1 - wx) * wy, w3 = wx * wy;
        var L = f[a] * w0 + f[b] * w1 + f[e] * w2 + f[g] * w3, Rv = f[a + 1] * w0 + f[b + 1] * w1 + f[e + 1] * w2 + f[g + 1] * w3, U = f[a + 2] * w0 + f[b + 2] * w1 + f[e + 2] * w2 + f[g + 2] * w3;
        var n = (((Math.imul(px, 73856093) ^ Math.imul(py, 19349663)) >>> 9) & 255) / 255, r, gg, bb, t, q;
        if (L >= 0.5) {
          var F = f[a + 3] * w0 + f[b + 3] * w1 + f[e + 3] * w2 + f[g + 3] * w3, Hh = f[a + 4] * w0 + f[b + 4] * w1 + f[e + 4] * w2 + f[g + 4] * w3, M = f[a + 5] * w0 + f[b + 5] * w1 + f[e + 5] * w2 + f[g + 5] * w3;
          var Sh = f[a + 6] * w0 + f[b + 6] * w1 + f[e + 6] * w2 + f[g + 6] * w3, Mo = f[a + 8] * w0 + f[b + 8] * w1 + f[e + 8] * w2 + f[g + 8] * w3 - 0.5, El = f[a + 9] * w0 + f[b + 9] * w1 + f[e + 9] * w2 + f[g + 9] * w3;
          var dry = cl(El * 0.9 - 0.12, 0, 0.55);
          r = 110 + 54 * dry + Mo * 24; gg = 155 + 12 * dry + Mo * 20; bb = 78 + 24 * dry + Mo * 10;                       // grass, yellower with height
          t = ss(F, 0.3, 0.62) * 0.92; r += (48 - r) * t; gg += (94 - gg) * t; bb += (58 - bb) * t;                       // forest floor
          t = ss(Hh, 0.35, 0.7); r += (132 + Mo * 26 - r) * t; gg += (146 + Mo * 14 - gg) * t; bb += (86 - bb) * t;        // hill country, olive and dry
          t = ss(M, 0.35, 0.7); r += (84 - r) * t; gg += (110 - gg) * t; bb += (80 - bb) * t;                             // the wooded feet of the mountains
          q = Rv > 0.1 ? 0.07 : 0.15;                                                                                    // sand at the water's edge, narrower on a river bank
          if (L < 0.5 + q) { t = (L - 0.5) / q; var dq = Math.min(1, t * 2.4); t = t * t * (3 - 2 * t); r = (196 + 30 * dq) * (1 - t) + r * t; gg = (178 + 30 * dq) * (1 - t) + gg * t; bb = (134 + 28 * dq) * (1 - t) + bb * t; }
          q = (0.7 + 0.6 * Sh) * (0.968 + 0.064 * n); if (n > 0.988) q *= 0.87; else if (n < 0.012) q *= 1.08;
          r *= q; gg *= q; bb *= q;
        } else {
          var Dp = f[a + 7] * w0 + f[b + 7] * w1 + f[e + 7] * w2 + f[g + 7] * w3;
          if (Dp < 0.35) { t = Dp / 0.35; r = 56 - 22 * t; gg = 134 - 40 * t; bb = 160 - 12 * t; } else { t = (Dp - 0.35) / 0.65; r = 34 - 15 * t; gg = 94 - 50 * t; bb = 148 - 58 * t; }
          t = L * 2; t = t * t * 0.6; r += (104 - r) * t; gg += (182 - gg) * t; bb += (180 - bb) * t;                    // shallows
          t = cl(Rv * 1.8, 0, 1); r += (50 + 34 * U - r) * t; gg += (116 + 30 * U - gg) * t; bb += (160 + 14 * U - bb) * t;   // river water, paler above the head of navigation
          t = 1 - Math.abs(L - 0.462) / 0.038; if (t > 0) { t *= 0.78; r += (246 - r) * t; gg += (238 - gg) * t; bb += (216 - bb) * t; }   // the wax line where water meets land
          q = 0.975 + 0.05 * n; if (U > 0.35 && n > 0.9) q = 1.22; r *= q; gg *= q; bb *= q;
        }
        var u = (px + 0.5) / P - 0.5, ed = Math.min(u + 0.5, v + 0.5, W - 0.5 - u, H - 0.5 - v);                          // the edge of the chart fades out
        if (ed < 1.6) { t = ss(ed, 0, 1.6); r = BG[0] + (r - BG[0]) * t; gg = BG[1] + (gg - BG[1]) * t; bb = BG[2] + (bb - BG[2]) * t; }
        d[o++] = r; d[o++] = gg; d[o++] = bb; d[o++] = 255;
      }
    }
    st.tctx.putImageData(img, x0, y0);
  }
  function project(st, x0, y0, x1, y1) {    // lay a rectangle of the flat painting down under the isometric view
    var g = st.gnd.getContext('2d'), k = st.gs / st.P;
    g.save(); g.setTransform(HW * k, HH * k, -HW * k, HH * k, OX * st.gs, OY * st.gs); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip(); g.drawImage(st.top, 0, 0); g.restore();
  }
  R.ground = function (st, S) {             // paint everything; called at the start and for a new game
    var P = st.P, g;
    if (!st.top) { st.top = mk(W * P, H * P); st.tctx = st.top.getContext('2d'); st.gnd = mk(WW * st.gs, WH * st.gs); }
    fields(st, S); paintTex(st, 0, 0, W * P, H * P);
    g = st.gnd.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgb(' + BG.join(',') + ')'; g.fillRect(0, 0, st.gnd.width, st.gnd.height);
    project(st, 0, 0, W * P, H * P); st.mb = null; st.pv = -1; st.fx = []; st.tag = {}; st.tw = {};
  };
  function cleared(st, S, x, y) {           // a forest tile has been felled: repaint the patch around it
    var P = st.P, i0 = (x - 1) * FG, j0 = (y - 1) * FG, i1 = (x + 2) * FG - 1, j1 = (y + 2) * FG - 1, tmp = st.tmp || (st.tmp = new Float32Array(FW * FH)), i, j;
    masks(st, S, i0, j0, i1, j1); blur(st.raw.F, tmp, i0 - 3, j0 - 3, i1 + 3, j1 + 3);
    for (j = Math.max(0, j0 - 3); j <= Math.min(FH - 1, j1 + 3); j++) for (i = Math.max(0, i0 - 3); i <= Math.min(FW - 1, i1 + 3); i++) st.fld[(j * FW + i) * NF + 3] = tmp[j * FW + i];
    paintTex(st, (x - 2) * P, (y - 2) * P, (x + 3) * P, (y + 3) * P); project(st, Math.max(0, (x - 2) * P), Math.max(0, (y - 2) * P), Math.min(W * P, (x + 3) * P), Math.min(H * P, (y + 3) * P)); st.mb = null;
  }

  /* ---------------- little pictures, drawn once each ---------------- */
  var C = { wl: '#dcc79c', wr: '#b59a70', wood: '#8f6f49', woodD: '#6d5236', th: '#c2a060', thD: '#9a7c44', thE: '#a88a50', nip: '#93805a', nipE: '#7a6946', tile: '#9a5140', tileD: '#733c30',
    wh: '#f1e8d0', whD: '#c9ba98', stone: '#a8a193', stoneD: '#7c766b', dark: '#3d2f20', ind: '#2a4380', indD: '#1b2d5a' };
  var tints = {};
  function tint(hex, k) { var key = hex + k, v = tints[key]; if (v) return v; var n = parseInt(hex.slice(1), 16); return (tints[key] = 'rgb(' + cl(Math.round(((n >> 16) & 255) * k), 0, 255) + ',' + cl(Math.round(((n >> 8) & 255) * k), 0, 255) + ',' + cl(Math.round((n & 255) * k), 0, 255) + ')'); }
  function lit(c, fill, y0, y1) { if (fill.charAt(0) !== '#' || fill.length !== 7 || !(y1 > y0)) return fill; var g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, tint(fill, 1.08)); g.addColorStop(1, tint(fill, 0.86)); return g; }
  function P(c, p, fill) {                  // a filled shape, a little lighter at the top than at the foot
    var y0 = 1e9, y1 = -1e9, i; c.beginPath(); c.moveTo(p[0], p[1]); for (i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath();
    for (i = 1; i < p.length; i += 2) { if (p[i] < y0) y0 = p[i]; if (p[i] > y1) y1 = p[i]; }
    c.fillStyle = lit(c, fill, y0, y1); c.fill();
  }
  function sh() { /* shadows are cast from each picture's outline when it is stamped */ }
  function gsh(c, x, y, rx, ry) { var g = c.createRadialGradient(x, y, 0, x, y, rx); g.addColorStop(0, 'rgba(10,22,30,.4)'); g.addColorStop(1, 'rgba(10,22,30,0)'); c.save(); c.translate(x, y); c.scale(1, ry / rx); c.translate(-x, -y); c.fillStyle = g; c.beginPath(); c.arc(x, y, rx, 0, 6.3); c.fill(); c.restore(); }
  function blob(c, x, y, r, col) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); }
  function leaf(c, x, y, r, dk, md, lt) { var g = c.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.12, x, y, r * 1.02); g.addColorStop(0, lt); g.addColorStop(0.55, md); g.addColorStop(1, dk); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 6.3); c.fill(); }
  function box(c, x, y, hw, hh, h, top, l, r) {
    P(c, [x - hw, y, x, y + hh, x, y + hh - h, x - hw, y - h], l); P(c, [x + hw, y, x, y + hh, x, y + hh - h, x + hw, y - h], r);
    P(c, [x, y - hh - h, x + hw, y - h, x, y + hh - h, x - hw, y - h], top);
  }
  function eave(c, x, y, hw, hh) { c.strokeStyle = 'rgba(24,14,6,.34)'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x - hw, y + 0.8); c.lineTo(x, y + hh + 0.8); c.lineTo(x + hw, y + 0.8); c.stroke(); }
  function gable(c, x, y, hw, hh, wh, rh, k) {       // walls under a ridged roof; the ridge runs down-right. sw lifts the ridge ends
    box(c, x, y, hw, hh, wh, k.rn, k.wl || C.wl, k.wr || C.wr); if (wh > 2) eave(c, x, y - wh, hw, hh);
    var e = k.e == null ? 3 : k.e, yy = y - wh, sw = k.sw || 0, i, t, n;
    var Wx = x - hw - e, Wy = yy, Sx = x, Sy = yy + hh + e * 0.5, ax = x - hw / 2 - e * 0.6, ay = yy - hh / 2 - rh - sw, bx = x + hw / 2 + e * 0.6, by = yy + hh / 2 - rh - sw, mx = (ax + bx) / 2, my = (ay + by) / 2 + sw * 2.2;
    P(c, [Sx, Sy, x + hw + e, yy, bx, by], k.ge || k.wr || C.wr);
    c.beginPath(); c.moveTo(Wx, Wy); c.lineTo(Sx, Sy); c.lineTo(bx, by); c.quadraticCurveTo(mx, my, ax, ay); c.closePath();
    var g = c.createLinearGradient(ax, ay, Sx, Sy); g.addColorStop(0, tint(k.rn, 1.12)); g.addColorStop(1, tint(k.rn, 0.84)); c.fillStyle = g; c.fill();
    c.save(); c.clip(); c.lineWidth = 0.55; c.strokeStyle = k.tex === 'tile' ? 'rgba(40,14,8,.3)' : 'rgba(64,40,14,.26)'; c.beginPath();
    n = Math.max(4, Math.round(hw / 1.5)); for (i = 1; i < n; i++) { t = i / n; c.moveTo(Wx + (Sx - Wx) * t, Wy + (Sy - Wy) * t); c.lineTo(Wx + (Sx - Wx) * t + (ax - Wx) * 1.1, Wy + (Sy - Wy) * t + (ay - Wy) * 1.1 - sw); }
    c.stroke(); c.strokeStyle = 'rgba(255,244,214,.2)'; c.beginPath(); for (i = 1; i < 3; i++) { t = i / 3; c.moveTo(Wx + (ax - Wx) * t, Wy + (ay - Wy) * t); c.lineTo(Sx + (bx - Sx) * t, Sy + (by - Sy) * t); } c.stroke(); c.restore();
    c.strokeStyle = 'rgba(255,240,200,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by); c.quadraticCurveTo(mx, my, ax, ay); c.stroke();
  }
  function pyr(c, x, y, hw, hh, wh, rh, k) {         // walls under a four-sided roof
    if (wh) { box(c, x, y, hw, hh, wh, k.l, k.wl || C.wl, k.wr || C.wr); eave(c, x, y - wh, hw, hh); }
    var e = k.e == null ? 3 : k.e, yy = y - wh;
    P(c, [x - hw - e, yy, x, yy + hh + e * 0.5, x, yy - rh], k.l); P(c, [x + hw + e, yy, x, yy + hh + e * 0.5, x, yy - rh], k.r);
    c.strokeStyle = 'rgba(255,236,200,.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, yy + hh + e * 0.5); c.lineTo(x, yy - rh); c.stroke();
  }
  function tree(c, x, y, s, dk, md, lt) { c.fillStyle = '#5a442c'; c.fillRect(x - 1.1, y - 8 * s, 2.2, 8 * s); leaf(c, x - 4.5 * s, y - 9.5 * s, 5.4 * s, dk, md, lt); leaf(c, x + 4 * s, y - 10.5 * s, 5.2 * s, dk, md, lt); leaf(c, x, y - 14 * s, 6.6 * s, dk, md, lt); }
  function flag(c, x, y, h, col) { c.strokeStyle = C.dark; c.lineWidth = 1.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - h); c.stroke(); P(c, [x, y - h, x + 12, y - h + 4, x, y - h + 8], col); }
  function stall(c, x, y, a, b) { box(c, x, y, 9, 4.5, 4, '#d2b486', '#a98a5c', '#8d7048'); c.fillStyle = C.dark; c.fillRect(x - 9.6, y - 12, 1.2, 12); c.fillRect(x + 8.4, y - 12, 1.2, 12); P(c, [x - 11, y - 9, x, y - 3.5, x, y - 13, x - 11, y - 17], a); P(c, [x + 11, y - 9, x, y - 3.5, x, y - 13, x + 11, y - 17], b); blob(c, x - 3, y - 2.5, 1.4, '#d98a3c'); blob(c, x + 3.5, y - 2.3, 1.4, '#8fb85a'); }
  function logs(c, x, y) { P(c, [x - 7, y - 3, x + 7, y - 3, x + 7, y, x - 7, y], '#8a6844'); P(c, [x - 6, y - 6, x + 6, y - 6, x + 6, y - 3, x - 6, y - 3], '#96724c'); blob(c, x + 7, y - 1.5, 1.6, '#d2b080'); blob(c, x + 6, y - 4.5, 1.6, '#d2b080'); }
  function man(c, x, y, col) { c.fillStyle = col; c.fillRect(x - 1.5, y - 8, 3, 5); c.fillStyle = '#3a2a1c'; c.fillRect(x - 1.5, y - 3, 1.2, 3); c.fillRect(x + 0.3, y - 3, 1.2, 3); blob(c, x, y - 9.6, 1.9, '#c79a6b'); }
  function hull(c, x, y, l, col) { c.fillStyle = col; c.beginPath(); c.moveTo(x - l, y - 4); c.quadraticCurveTo(x, y + 5, x + l + 3, y - 6); c.lineTo(x + l - 1, y - 1); c.quadraticCurveTo(x, y + 3, x - l + 2, y - 1); c.closePath(); c.fill(); }
  function win(c, x, y, w, h, dy) { P(c, [x, y, x + w, y + dy, x + w, y + dy - h, x, y - h], '#2c2118'); }      // a door or shutter on a wall; dy slopes it with the wall
  function plot(c, hw, hh, fill, edge) {    // a patch of worked ground with soft corners, so it does not read as a tile
    c.beginPath(); c.moveTo(-hw * 0.8, -hh * 0.2); c.quadraticCurveTo(-hw, 0, -hw * 0.8, hh * 0.2); c.lineTo(-hw * 0.2, hh * 0.8); c.quadraticCurveTo(0, hh, hw * 0.2, hh * 0.8); c.lineTo(hw * 0.8, hh * 0.2); c.quadraticCurveTo(hw, 0, hw * 0.8, -hh * 0.2); c.lineTo(hw * 0.2, -hh * 0.8); c.quadraticCurveTo(0, -hh, -hw * 0.2, -hh * 0.8); c.closePath();
    c.fillStyle = lit(c, fill, -hh, hh); c.fill(); if (edge) { c.strokeStyle = edge; c.lineWidth = 1.3; c.stroke(); }
  }
  function house(c, k) {
    c.fillStyle = '#4c3a28'; c.fillRect(-12, -2, 1.6, 5); c.fillRect(-1, 4, 1.6, 4); c.fillRect(10, -2, 1.6, 5);
    gable(c, 0, -3, 13, 6.5, 6, 9, k); win(c, 3.5, -2.8, 3.6, 5.6, -1.8); win(c, -9.4, -3.4, 2.6, 2.4, 1.3); c.fillStyle = '#6d5236'; c.fillRect(8, 0.5, 5, 1.3); c.fillRect(9.5, 2.3, 5, 1.3);
  }
  function peak(c, w, h, a, b, g1) {        // a mountain: a lit face, a dark face, and forest creeping up its foot
    var px = -w * 0.08, i;
    P(c, [-w, 8, -w * 0.55, -h * 0.34, -w * 0.3, -h * 0.5, px, -h, w * 0.12, 10], '#5d9052'); P(c, [w, 8, w * 0.6, -h * 0.28, w * 0.28, -h * 0.56, px, -h, w * 0.12, 10], '#2c5a3c');
    P(c, [px, -h, -w * 0.3, -h * 0.5, -w * 0.12, -h * 0.42, w * 0.02, -h * 0.2, w * 0.12, 10, w * 0.02, -h * 0.5], '#3f7446');
    P(c, [px, -h, -w * 0.2, -h * 0.66, -w * 0.1, -h * 0.6, px + 1, -h * 0.72], a); P(c, [px, -h, w * 0.19, -h * 0.7, w * 0.06, -h * 0.62, px + 1, -h * 0.72], b);     // bare rock at the summit
    for (i = 0; i < 9; i++) leaf(c, -w * 0.5 + h2(i, w | 0, 7) * w * 0.9, -h * 0.12 - h2(i, h | 0, 9) * h * 0.4, 4 + h2(i, 3, 5) * 2.5, '#1f4a33', i % 2 ? '#2f6a3e' : '#3b7a45', '#62a058');
    for (i = 0; i < 7; i++) leaf(c, -w * 0.84 + i * w * 0.27, 6 - Math.abs(i - 3) * 1.1, 6.4, '#234b34', g1, '#4f8a55');
  }
  var ART = {
    tree0: [48, 52, 24, 44, function (c) { gsh(c, 4, 1, 13, 5); tree(c, 0, 0, 1.2, '#1f4a33', '#33703f', '#62a058'); }, { flat: 1 }],
    tree1: [48, 52, 24, 44, function (c) { gsh(c, 4, 1, 12, 4.5); tree(c, 0, 0, 1.02, '#27583a', '#3f7d45', '#78b061'); }, { flat: 1 }],
    tree2: [48, 62, 24, 54, function (c) { gsh(c, 4, 1, 11, 4.5); c.fillStyle = '#5a442c'; c.fillRect(-1.2, -20, 2.4, 20); leaf(c, -4, -19, 5, '#1b4430', '#2d6a3c', '#57984f'); leaf(c, 4, -22, 5.4, '#1b4430', '#2d6a3c', '#57984f'); leaf(c, 0, -28, 7.4, '#1b4430', '#2f6e3e', '#5fa055'); }, { flat: 1 }],
    tree3: [48, 44, 24, 36, function (c) { gsh(c, 3, 1, 11, 4); leaf(c, -5, -6, 5.6, '#2a5b36', '#44843f', '#86b85e'); leaf(c, 5, -7, 5.4, '#2a5b36', '#44843f', '#86b85e'); leaf(c, 0, -11, 6.2, '#2a5b36', '#4a8a42', '#8fbe62'); }, { flat: 1 }],
    palm: [52, 60, 26, 52, function (c) {
      gsh(c, 5, 1, 10, 4); c.strokeStyle = '#6b563a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-4, -13, 1, -26); c.stroke(); c.strokeStyle = '#8a7250'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-0.6, -1); c.quadraticCurveTo(-4.6, -13, 0.4, -26); c.stroke();
      [[-14, -22, '#2f6a3c'], [-10, -34, '#3c7d45'], [3, -38, '#4f9150'], [14, -32, '#3c7d45'], [15, -20, '#2f6a3c'], [-3, -17, '#2a6038']].forEach(function (p) { c.strokeStyle = p[2]; c.lineWidth = 3; c.beginPath(); c.moveTo(1, -26); c.quadraticCurveTo((1 + p[0]) / 2, p[1] - 5, p[0], p[1]); c.stroke(); });
      blob(c, 0, -24.5, 1.8, '#7a5a34'); blob(c, 2.6, -24, 1.6, '#6b4c2a'); }, { flat: 1 }],
    mount0: [96, 92, 48, 72, function (c) { peak(c, 40, 58, '#b4aa98', '#6f675f', '#2f6a3e'); }, { flat: 1 }],
    mount1: [96, 92, 48, 72, function (c) { c.save(); c.translate(-14, 4); c.scale(0.62, 0.62); peak(c, 40, 52, '#a69c8c', '#655e57', '#2c6239'); c.restore(); c.save(); c.translate(8, 0); c.scale(0.86, 0.86); peak(c, 40, 60, '#b9af9c', '#746c63', '#2f6a3e'); c.restore(); }, { flat: 1 }],
    mount2: [96, 100, 48, 80, function (c) { peak(c, 42, 70, '#bdb3a0', '#6a625b', '#2f6a3e'); }, { flat: 1 }],
    house0: [64, 56, 32, 42, function (c) { house(c, { rn: C.th, ge: C.thE }); }],
    house1: [64, 56, 32, 42, function (c) { house(c, { rn: C.nip, ge: C.nipE, sw: 1.6 }); }],
    house2: [64, 56, 32, 42, function (c) { house(c, { rn: '#cdab6c', ge: '#b0925a', wl: '#cdb48a', wr: '#a88c64' }); }],
    house3: [64, 56, 32, 42, function (c) { house(c, { rn: C.thD, ge: '#86703f', sw: 2.4 }); }],
    market0: [80, 72, 40, 56, function (c) { stall(c, -4, 2, '#efe2bc', '#c9562f'); flag(c, 10, 2, 26, GOLD); }],
    market1: [80, 76, 40, 60, function (c) { stall(c, -11, 0, '#efe2bc', '#c9562f'); stall(c, 9, 5, '#2f6f8f', '#efe2bc'); flag(c, 0, -4, 32, GOLD); }],
    market2: [96, 84, 48, 66, function (c) { stall(c, -17, -1, '#efe2bc', '#c9562f'); pyr(c, 2, -6, 11, 5.5, 8, 9, { l: C.tile, r: C.tileD }); stall(c, 14, 6, '#2f6f8f', '#efe2bc'); stall(c, -6, 9, '#d9a63a', '#efe2bc'); flag(c, 2, -22, 22, GOLD); }],
    market3: [104, 96, 52, 76, function (c) { stall(c, -24, 0, '#efe2bc', '#c9562f'); pyr(c, 0, -6, 15, 7.5, 11, 8, { l: C.tile, r: C.tileD }); pyr(c, 0, -24, 9, 4.5, 3, 8, { l: C.tile, r: C.tileD, wl: C.wh, wr: C.whD }); stall(c, 21, 6, '#2f6f8f', '#efe2bc'); stall(c, -8, 11, '#d9a63a', '#efe2bc'); stall(c, 9, 13, '#efe2bc', '#7b4a8a'); flag(c, 0, -38, 20, GOLD); }],
    hq: [88, 88, 44, 68, function (c) { box(c, 0, 0, 18, 9, 20, C.ind, C.wh, C.whD); eave(c, 0, -20, 18, 9); win(c, -14, -5.5, 3.6, 6, 1.8); win(c, -7, -2, 3.6, 6, 1.8); win(c, 5, 0.5, 5, 9, -2.5); win(c, 12.5, -6, 3, 5, -1.5); c.strokeStyle = 'rgba(60,44,26,.35)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-18, -10); c.lineTo(0, -1); c.lineTo(18, -10); c.stroke();
      pyr(c, 0, -20, 18, 9, 0, 13, { l: C.ind, r: C.indD, e: 4 }); flag(c, 0, -33, 18, GOLD); }],
    b_potter: [80, 72, 40, 56, function (c) { gable(c, -8, 0, 11, 5.5, 6, 8, { rn: C.th, ge: C.thE }); win(c, -6, 0.5, 3, 5, -1.5); var g = c.createRadialGradient(10, -4, 1, 13, 0, 10); g.addColorStop(0, '#c0704c'); g.addColorStop(1, '#7a4430'); c.fillStyle = g; c.beginPath(); c.ellipse(13, 2, 8.5, 9.5, 0, Math.PI, 0); c.fill(); c.fillStyle = '#20140e'; c.beginPath(); c.arc(11, 1.5, 2.8, Math.PI, 0); c.fill(); c.fillStyle = '#f0903c'; c.beginPath(); c.arc(11, 1.5, 1.5, Math.PI, 0); c.fill(); blob(c, 1, 8, 2.3, '#c9774d'); blob(c, 5, 10, 1.9, '#d98a5c'); blob(c, -3, 10, 1.7, '#b56a44'); blob(c, 1, 7.4, 0.9, '#e2a57a'); }],
    b_carpenter: [80, 72, 40, 56, function (c) { c.fillStyle = C.dark; c.fillRect(-18, -8, 1.8, 9); c.fillRect(-2, 0, 1.8, 9); c.fillRect(13, -8, 1.8, 9); gable(c, -2, -7, 15, 7.5, 1, 8, { rn: C.th, ge: C.thE, wl: C.woodD, wr: C.woodD }); logs(c, 14, 10); P(c, [-11, 2, -2, 6.5, -2, 4.5, -11, 0], '#d2b080'); P(c, [-9, 5, 0, 9.5, 0, 8, -9, 3.5], '#b8925f'); }],
    b_smelter: [80, 80, 40, 64, function (c) { box(c, -4, 0, 13, 6.5, 12, C.stoneD, C.stone, C.stoneD); c.strokeStyle = 'rgba(40,36,30,.35)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-17, -4); c.lineTo(-4, 2.5); c.lineTo(9, -4); c.moveTo(-17, -8); c.lineTo(-4, -1.5); c.lineTo(9, -8); c.stroke(); var g = c.createRadialGradient(-9, 0, 0.5, -9, 0, 4.5); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#e0601c'); c.fillStyle = g; c.beginPath(); c.arc(-9, 0.5, 3.6, Math.PI, 0); c.lineTo(-5.4, 2.4); c.lineTo(-12.6, 2.4); c.fill(); box(c, 4, -12, 4, 2, 17, '#55504a', '#918a7e', '#6b655c'); blob(c, 14, 8, 3, '#c9d2da'); blob(c, 18, 6, 2.4, '#aab4bd'); blob(c, 10, 10, 2.2, '#8d93a0'); blob(c, 13.4, 7.2, 1, '#eef3f6'); }],
    b_curing: [80, 68, 40, 52, function (c) { gable(c, 8, 1, 10, 5, 5, 7, { rn: C.nip, ge: C.nipE }); c.strokeStyle = C.dark; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-20, -2); c.lineTo(-20, -12); c.lineTo(-4, -4); c.lineTo(-4, 6); c.moveTo(-20, -8); c.lineTo(-4, 0); c.stroke(); for (var i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#a9ccd6' : '#8fb7c4'; c.fillRect(-18.5 + i * 3.2, -10 + i * 1.6, 1.8, 4.8); } }],
    b_weaver: [80, 68, 40, 52, function (c) { gable(c, -3, 0, 15, 7.5, 7, 9, { rn: C.th, ge: C.thE }); win(c, 2, 2.5, 3.6, 6, -1.8); c.strokeStyle = C.dark; c.lineWidth = 1; c.beginPath(); c.moveTo(8, 12); c.lineTo(8, 3); c.lineTo(22, -4); c.lineTo(22, 5); c.stroke(); P(c, [9, 4, 14, 1.5, 14, 9, 9, 11.5], '#f1e8d0'); P(c, [15, 1, 21, -2, 21, 4, 15, 7], '#e3a56e'); }],
    b_goldsmith: [80, 68, 40, 52, function (c) { gable(c, 0, 0, 13, 6.5, 8, 9, { rn: C.tile, ge: C.wh, wl: C.wh, wr: C.whD, tex: 'tile' }); win(c, 4, 2, 4, 6.4, -2); blob(c, -6, -1.5, 2.8, GOLD); blob(c, -6.8, -2.3, 1, '#ffe9a8'); c.strokeStyle = C.dark; c.lineWidth = 0.8; c.beginPath(); c.arc(-6, -1.5, 2.8, 0, 6.3); c.stroke(); }],
    b_batikw: [80, 68, 40, 52, function (c) { gable(c, -6, -1, 12, 6, 6, 8, { rn: C.thD, ge: '#86703f', sw: 1.5 }); c.strokeStyle = C.dark; c.lineWidth = 1; c.beginPath(); c.moveTo(6, 12); c.lineTo(6, 0); c.lineTo(23, -8.5); c.lineTo(23, 3.5); c.stroke(); P(c, [7, 1, 12, -1.5, 12, 8, 7, 10.5], '#2a4380'); P(c, [12.5, -1.8, 17.5, -4.3, 17.5, 5, 12.5, 7.5], '#cf6a3c'); P(c, [18, -4.6, 22.5, -6.8, 22.5, 2, 18, 4.2], '#d9a63a'); }],
    b_istana: [128, 124, 64, 102, function (c) {
      gable(c, -24, 4, 14, 7, 8, 10, { rn: C.tile, ge: C.wl, sw: 3, tex: 'tile' }); gable(c, 26, 6, 14, 7, 8, 10, { rn: C.tile, ge: C.wl, sw: 3, tex: 'tile' });
      c.fillStyle = C.dark; for (var i = 0; i < 4; i++) c.fillRect(-20 + i * 13.5, 4 - Math.abs(i - 1.5) * 3, 2, 8);
      box(c, 0, -2, 24, 12, 12, C.tile, C.wl, C.wr); win(c, -19, -4.5, 4.6, 7.6, 2.3); win(c, -10, 0, 4.6, 7.6, 2.3); win(c, 6, 3, 6, 9, -3); win(c, 15, -1.5, 5, 8, -2.5);
      gable(c, 0, -14, 24, 12, 0, 16, { rn: C.tile, ge: C.wl, sw: 5, e: 5, tex: 'tile' }); gable(c, 0, -32, 13, 6.5, 5, 12, { rn: C.tileD, ge: C.wh, wl: C.wh, wr: C.whD, sw: 4.5, e: 4, tex: 'tile' });
      blob(c, 0, -62, 2.4, GOLD); c.fillStyle = GOLD; c.fillRect(-0.7, -62, 1.4, 8); }],
    b_quarter: [120, 96, 60, 74, function (c) { box(c, -22, 2, 15, 7.5, 13, C.tileD, C.wh, C.whD); pyr(c, -22, -11, 15, 7.5, 0, 9, { l: C.tile, r: C.tileD }); win(c, -27, 1, 5, 8.5, 2.5); win(c, -17, 5.2, 3.4, 5, -1.7);
      box(c, 16, 6, 16, 8, 11, C.tileD, '#e6d7b2', '#bfae88'); pyr(c, 16, -5, 16, 8, 0, 9, { l: '#a5604a', r: '#7a4433' }); win(c, 20, 9, 6, 7, -3); win(c, 5, 5.5, 3.4, 5, 1.7);
      P(c, [-5, 9, 4, 9, 4, 14, -5, 14], C.wood); P(c, [-2, 13, 7, 13, 7, 17, -2, 17], '#7a5c3a'); P(c, [0, 6, 7, 6, 7, 10, 0, 10], '#d2b080');
      c.strokeStyle = C.dark; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-42, 6); c.lineTo(-42, -40); c.moveTo(-50, 2); c.lineTo(-50, -26); c.stroke(); P(c, [-42, -38, -31, -34, -42, -18], '#efe2bc'); P(c, [-50, -24, -43, -21, -50, -10], '#d9a63a'); hull(c, -46, 10, 12, '#5a4028'); }, { flat: 1 }],
    b_balai: [96, 80, 48, 62, function (c) { box(c, 0, 2, 20, 10, 3, '#c0a070', '#8f744c', '#7a6240'); c.fillStyle = C.dark; [[-16, -1], [-6, 4], [6, 4], [16, -1], [0, -9]].forEach(function (p) { c.fillRect(p[0] - 1, p[1] - 12, 2.2, 12); });
      gable(c, 0, -12, 20, 10, 0, 13, { rn: C.th, ge: C.thE, sw: 4, e: 4 }); }],
    b_mosque: [96, 104, 48, 86, function (c) { var k = { l: '#a5604a', r: '#7a4433', wl: C.wh, wr: C.whD }; pyr(c, 0, 0, 19, 9.5, 9, 9, k); win(c, 3, 6.5, 5, 7.5, -2.5); win(c, -13, -1, 3, 5, 1.5);
      pyr(c, 0, -18, 13, 6.5, 4, 9, k); pyr(c, 0, -31, 8, 4, 3, 12, k); c.fillStyle = GOLD; c.fillRect(-0.7, -54, 1.4, 8); blob(c, 0, -55, 2, GOLD); }],
    b_shipyard: [100, 76, 50, 58, function (c) { gable(c, -20, -2, 10, 5, 6, 8, { rn: C.nip, ge: C.nipE }); c.strokeStyle = C.wood; c.lineWidth = 1.7; c.beginPath(); for (var i = 0; i < 5; i++) { c.moveTo(-6 + i * 7, 12 - i * 3); c.lineTo(-6 + i * 7, 2 - i * 3); } c.stroke();
      c.fillStyle = '#7a5a38'; c.beginPath(); c.moveTo(-10, 6); c.quadraticCurveTo(8, 12, 30, -10); c.lineTo(26, -3); c.quadraticCurveTo(8, 8, -6, 10); c.closePath(); c.fill(); c.strokeStyle = '#d2b080'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, 7); c.quadraticCurveTo(8, 10, 28, -8); c.stroke(); logs(c, -8, 16); }],
    b_stockade: [96, 88, 48, 70, function (c) { var i; for (i = 0; i < 9; i++) P(c, [-27 + i * 3, -11 - i * 1.5, -24.6 + i * 3, -11 - i * 1.5, -24.6 + i * 3, -1 - i * 1.5, -27 + i * 3, -1 - i * 1.5], '#7a5f3e'); for (i = 0; i < 9; i++) P(c, [i * 3, -23 + i * 1.5, 2.4 + i * 3, -23 + i * 1.5, 2.4 + i * 3, -13 + i * 1.5, i * 3, -13 + i * 1.5], '#6f5638');
      gable(c, 0, 1, 10, 5, 5, 7, { rn: C.th, ge: C.thE }); box(c, 12, -4, 5, 2.5, 22, C.woodD, C.wood, C.woodD); pyr(c, 12, -26, 6, 3, 0, 7, { l: C.th, r: C.thD });
      for (i = 0; i < 9; i++) P(c, [-27 + i * 3, -5 + i * 1.5, -24.6 + i * 3, -5 + i * 1.5, -24.6 + i * 3, 5 + i * 1.5, -27 + i * 3, 5 + i * 1.5], '#8f7048'); for (i = 0; i < 9; i++) P(c, [i * 3, 7 - i * 1.5, 2.4 + i * 3, 7 - i * 1.5, 2.4 + i * 3, 17 - i * 1.5, i * 3, 17 - i * 1.5], '#836642'); }],
    b_caravan: [88, 72, 44, 54, function (c) { P(c, [-24, 0, 0, 12, 24, 0, 0, -12], '#c2ae82'); gable(c, -10, -6, 12, 6, 6, 8, { rn: C.tile, ge: C.wh, wl: C.wh, wr: C.whD, tex: 'tile' }); win(c, -8, -3.5, 3.6, 5.6, -1.8); P(c, [6, 0, 18, 0, 18, 5, 6, 5], C.wood); blob(c, 9, 6, 3, C.dark); blob(c, 16, 6, 3, C.dark); blob(c, 9, 6, 1.2, '#b99a6a'); blob(c, 16, 6, 1.2, '#b99a6a'); c.fillStyle = '#7a5f3e'; c.fillRect(-23, -2, 2, 6); c.fillRect(21, -2, 2, 6); c.fillRect(-1, 9, 2, 6); }],
    b_harbour: [88, 68, 44, 50, function (c) { P(c, [-24, 0, 0, 12, 24, 0, 0, -12], '#b0926a'); c.strokeStyle = '#7a6040'; c.lineWidth = 0.8; c.beginPath(); for (var i = -3; i <= 3; i++) { c.moveTo(i * 6 - 12, i * 3 + 6); c.lineTo(i * 6 + 12, i * 3 - 6); } c.stroke();
      c.fillStyle = C.dark; [[-24, 0], [0, 12], [24, 0], [-12, 6], [12, 6]].forEach(function (p) { c.fillRect(p[0] - 1.2, p[1] - 5, 2.4, 9); }); gable(c, -4, -6, 8, 4, 5, 6, { rn: C.nip, ge: C.nipE }); P(c, [8, -3, 14, -3, 14, 2, 8, 2], '#d2b080'); P(c, [11, 1, 17, 1, 17, 5, 11, 5], C.wood); flag(c, 16, -4, 16, GOLD); }, { flat: 1 }],
    s_paddy: [72, 44, 36, 26, function (c) { plot(c, 28, 14, '#8f9c52', 'rgba(60,70,30,.5)'); plot(c, 23.5, 11.5, '#6fa58a'); c.strokeStyle = 'rgba(232,246,236,.35)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-14, -1); c.lineTo(-4, -6); c.moveTo(2, 6); c.lineTo(12, 1); c.stroke(); c.strokeStyle = '#c2d870'; c.lineWidth = 1.5; c.setLineDash([1.6, 2.2]); c.beginPath(); for (var i = -3; i <= 3; i++) { var w = 1 - Math.abs(i) / 4.4; c.moveTo(i * 5.2 - 10 * w, i * 2.6 + 5 * w); c.lineTo(i * 5.2 + 10 * w, i * 2.6 - 5 * w); } c.stroke(); c.setLineDash([]); }, { flat: 1 }],
    s_fishery: [72, 52, 36, 36, function (c) { c.strokeStyle = '#4c3a26'; c.lineWidth = 1.6; c.beginPath(); for (var i = 0; i < 7; i++) { c.moveTo(-20 + i * 6, 6 - i * 2.4); c.lineTo(-20 + i * 6, -6 - i * 2.4); } c.stroke(); c.strokeStyle = 'rgba(242,230,201,.6)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-20, -2); c.lineTo(16, -16.4); c.moveTo(-20, 2); c.lineTo(16, -12.4); c.stroke(); hull(c, 6, 8, 9, '#6b5034'); man(c, 6, 6, '#efe2bc'); }, { flat: 1 }],
    s_saltpan: [72, 44, 36, 26, function (c) { plot(c, 28, 14, '#a39c88', 'rgba(60,56,44,.45)'); [[-12, 0], [0, -6], [12, 0], [0, 6]].forEach(function (p, i) { c.save(); c.translate(p[0], p[1]); plot(c, 10.5, 5.2, i % 2 ? '#f6f8f8' : '#dfe8ea'); c.restore(); }); blob(c, 18, 7, 3.2, '#ffffff'); blob(c, 22, 5, 2.3, '#eef2f4'); }, { flat: 1 }],
    s_timber: [72, 60, 36, 46, function (c) { tree(c, -16, -2, 0.9, '#1f4a33', '#33703f', '#62a058'); logs(c, 2, 4); logs(c, 12, 9); blob(c, -6, 8, 2.5, '#8a6844'); blob(c, -6, 7.4, 1.6, '#d2b080'); blob(c, 22, 2, 2.2, '#8a6844'); blob(c, 22, 1.5, 1.4, '#d2b080'); }],
    s_clay: [72, 44, 36, 26, function (c) { plot(c, 23, 11.5, '#a2634a', 'rgba(70,36,22,.5)'); c.save(); c.translate(0, 1.5); plot(c, 14, 6.5, '#74412c'); c.restore(); blob(c, 14, -3, 4, '#b56f4c'); blob(c, 18, 0, 3, '#c98660'); blob(c, -17, -1, 2.6, '#b56f4c'); blob(c, 13, -4.4, 1.4, '#d99b78'); }, { flat: 1 }],
    s_mine: [72, 60, 36, 44, function (c) { P(c, [-17, 5, -5, -19, 10, -7, 19, 7], '#9a8c6e'); P(c, [-5, -19, 10, -7, 19, 7, 6, 7], '#6c614e'); P(c, [-8, 6, -8, -6, 2, -6, 2, 6], '#17120e'); c.strokeStyle = C.wood; c.lineWidth = 2.2; c.beginPath(); c.moveTo(-9, 6); c.lineTo(-9, -7); c.lineTo(3, -7); c.lineTo(3, 6); c.stroke(); blob(c, 14, 9, 3.4, '#8d93a0'); blob(c, 19, 7, 2.6, '#a7adb8'); blob(c, 10, 11, 2.4, '#737986'); blob(c, 13.2, 8, 1.1, '#cfd5dd'); }],
    s_goldpit: [72, 56, 36, 40, function (c) { plot(c, 21, 10.5, '#ac9462', 'rgba(70,56,26,.45)'); P(c, [-14, -4, 10, 8, 14, 6, -10, -6], '#6fa8c0'); c.strokeStyle = C.wood; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-14, -4); c.lineTo(10, 8); c.moveTo(-10, -6); c.lineTo(14, 6); c.stroke(); blob(c, -4, 6, 1.5, GOLD); blob(c, 2, -4, 1.3, GOLD); blob(c, 12, 0, 1.5, GOLD); man(c, -12, 4, '#efe2bc'); }],
    s_pepper: [72, 52, 36, 36, function (c) { plot(c, 25, 12.5, '#93a05a', 'rgba(60,70,30,.45)'); for (var r = 0; r < 3; r++) for (var i = 0; i < 4; i++) { var x = -14 + i * 8 + r * 4 - 4, y = 4 - i * 4 + r * 2 - 2; c.fillStyle = '#5a442c'; c.fillRect(x - 0.6, y - 10, 1.2, 10); leaf(c, x, y - 8, 2.8, '#2f5f30', '#4a7f3c', '#7fae58'); leaf(c, x, y - 4.5, 2.3, '#2f5f30', '#558a44', '#86b45c'); } }, { flat: 1 }],
    s_resin: [72, 68, 36, 54, function (c) { c.fillStyle = '#6b563a'; c.fillRect(-3, -24, 6, 24); c.fillStyle = '#8a7250'; c.fillRect(-3, -24, 1.6, 24); leaf(c, -9, -25, 7.6, '#1b4430', '#2d6a3c', '#57984f'); leaf(c, 8, -30, 8, '#1b4430', '#2d6a3c', '#57984f'); leaf(c, 0, -36, 11, '#1b4430', '#2f6e3e', '#5fa055'); blob(c, 3, -6, 2.4, '#d0a332'); c.fillStyle = '#e0b84a'; c.fillRect(-1, -12, 2, 6); logs(c, 14, 6); }],
    s_cotton: [72, 48, 36, 30, function (c) { plot(c, 26, 13, '#8e9858', 'rgba(60,70,30,.45)'); for (var r = 0; r < 4; r++) for (var i = 0; i < 5; i++) { var x = -16 + i * 7 + r * 3.4 - 5, y = 5 - i * 3.5 + r * 1.7 - 2.5; blob(c, x, y - 2, 2, '#55883f'); blob(c, x + 0.6, y - 3.4, 1.4, '#ffffff'); } }, { flat: 1 }],
    g_rice: [24, 24, 12, 12, function (c) { c.fillStyle = lit(c, '#e6dcae', -9, 9); c.beginPath(); c.moveTo(-6.5, 8.5); c.quadraticCurveTo(-9.5, 0, -5, -5); c.lineTo(5, -5); c.quadraticCurveTo(9.5, 0, 6.5, 8.5); c.closePath(); c.fill(); P(c, [-3.5, -5, 3.5, -5, 5, -9.5, -5, -9.5], '#cfc391'); c.strokeStyle = '#8a7a44'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-4, -5); c.lineTo(4, -5); c.stroke(); blob(c, -2, 2, 1.1, '#fffdf0'); blob(c, 2, 4, 1.1, '#fffdf0'); blob(c, 1, 0, 1.1, '#fffdf0'); }, { flat: 1 }],
    g_fish: [24, 24, 12, 12, function (c) { var g = c.createLinearGradient(0, -5, 0, 5); g.addColorStop(0, '#6fa9c4'); g.addColorStop(1, '#d6eef6'); c.fillStyle = g; c.beginPath(); c.ellipse(-1.5, 0, 7.5, 4.6, 0, 0, 6.3); c.fill(); P(c, [5, 0, 10.5, -5, 9, 0, 10.5, 5], '#5d98b4'); blob(c, -5.5, -1, 1.1, '#17212b'); c.strokeStyle = 'rgba(40,80,100,.6)'; c.lineWidth = 0.8; c.beginPath(); c.arc(-3.5, 0, 3.4, -1, 1); c.stroke(); }, { flat: 1 }],
    g_dfish: [24, 24, 12, 12, function (c) { P(c, [-9, 0, -2, -6.5, 6, -3, 10, -6.5, 8.5, 0, 10, 6.5, 6, 3, -2, 6.5], '#c99a5e'); c.strokeStyle = '#7a5630'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-8, 0); c.lineTo(7, 0); for (var i = -4; i <= 4; i += 2.6) { c.moveTo(i, 0); c.lineTo(i + 1.6, -4); c.moveTo(i, 0); c.lineTo(i + 1.6, 4); } c.stroke(); }, { flat: 1 }],
    g_salt: [24, 24, 12, 12, function (c) { P(c, [-9.5, 7, -2.5, -6.5, 1, -3.5, 3.5, -7, 9.5, 7], '#f6f8f9'); P(c, [1, -3.5, 3.5, -7, 9.5, 7, 3, 7], '#c5d0d6'); blob(c, -6, 8.3, 1.2, '#ffffff'); blob(c, 7, 8.3, 1, '#ffffff'); }, { flat: 1 }],
    g_cloth: [24, 24, 12, 12, function (c) { P(c, [-9, -4.5, 6, -4.5, 6, 5.5, -9, 5.5], '#e29c5e'); c.fillStyle = '#c97c40'; c.beginPath(); c.ellipse(6, 0.5, 3, 5, 0, 0, 6.3); c.fill(); blob(c, 6, 0.5, 1.3, '#f3c79a'); c.strokeStyle = 'rgba(255,240,214,.75)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-5.5, -4.5); c.lineTo(-5.5, 5.5); c.moveTo(-1.5, -4.5); c.lineTo(-1.5, 5.5); c.stroke(); }, { flat: 1 }],
    g_pottery: [24, 24, 12, 12, function (c) { c.fillStyle = lit(c, '#d47a50', -9, 9); c.beginPath(); c.moveTo(-3, -9); c.lineTo(3, -9); c.lineTo(2.4, -5.5); c.quadraticCurveTo(9, -1, 5, 8.5); c.lineTo(-5, 8.5); c.quadraticCurveTo(-9, -1, -2.4, -5.5); c.closePath(); c.fill(); c.strokeStyle = '#8a4428'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-6, 1); c.lineTo(6, 1); c.stroke(); c.strokeStyle = 'rgba(255,236,214,.7)'; c.beginPath(); c.moveTo(-3.6, -3); c.quadraticCurveTo(-6, 0, -4.6, 4.5); c.stroke(); }, { flat: 1 }],
    g_timber: [24, 24, 12, 12, function (c) { [[-4.5, 4.5], [4.5, 4.5], [0, -3]].forEach(function (p) { P(c, [p[0] - 6, p[1] - 3.6, p[0] + 3, p[1] - 3.6, p[0] + 3, p[1] + 3.6, p[0] - 6, p[1] + 3.6], '#8c6640'); blob(c, p[0] + 3, p[1], 3.6, '#d9b684'); blob(c, p[0] + 3, p[1], 1.5, '#b08a58'); }); }, { flat: 1 }],
    g_clay: [24, 24, 12, 12, function (c) { c.fillStyle = lit(c, '#b96c48', -6, 8); c.beginPath(); c.moveTo(-9, 7.5); c.quadraticCurveTo(-9, -3, -1, -5.5); c.quadraticCurveTo(7, -7.5, 9.5, 7.5); c.closePath(); c.fill(); blob(c, -3, -1, 1.4, '#d99472'); blob(c, 3, 2.5, 1.2, '#8f4c30'); blob(c, -5, 4, 1, '#8f4c30'); }, { flat: 1 }],
    g_cotton: [24, 24, 12, 12, function (c) { P(c, [-6, 3, 0, 9.5, 6, 3, 0, 5.5], '#5c8c46'); c.strokeStyle = '#6b5334'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, 6); c.lineTo(0, 10); c.stroke(); [[-4, -1], [4, -1], [0, -5.5], [0, 1.5]].forEach(function (p) { leaf(c, p[0], p[1], 4.3, '#cfd6dc', '#f4f6f8', '#ffffff'); }); }, { flat: 1 }],
    g_ore: [24, 24, 12, 12, function (c) { P(c, [-9.5, 7.5, -7.5, -1, -2, -4.5, 2, 1.5, 1, 7.5], '#7f8794'); P(c, [-1, 7.5, 1, -1.5, 5.5, -6.5, 10, 0, 9, 7.5], '#99a1ae'); P(c, [1, -1.5, 5.5, -6.5, 6, 0], '#c3cad4'); blob(c, -5, 2, 1.1, '#d9dee6'); blob(c, 5, 4, 1, '#565d68'); }, { flat: 1 }],
    g_tin: [24, 24, 12, 12, function (c) { [[-1.5, 4.5], [1.5, -3]].forEach(function (p) { P(c, [p[0] - 8, p[1] + 3.6, p[0] - 5.5, p[1] - 3.2, p[0] + 5.5, p[1] - 3.2, p[0] + 8, p[1] + 3.6], '#b9c3cc'); P(c, [p[0] - 5.5, p[1] - 3.2, p[0] + 5.5, p[1] - 3.2, p[0] + 4, p[1] - 0.6, p[0] - 4, p[1] - 0.6], '#eef2f5'); }); }, { flat: 1 }],
    g_pepper: [24, 24, 12, 12, function (c) { c.strokeStyle = '#5b7a3c'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-1, -10); c.quadraticCurveTo(2, -3, 0, 9); c.stroke(); [[-3.5, -5, 0], [3.5, -3, 1], [-3.5, 1, 1], [3.5, 3.5, 0], [-2.5, 6.5, 0], [1, -7.5, 1]].forEach(function (p) { leaf(c, p[0], p[1], 3, p[2] ? '#1c2a16' : '#35501f', p[2] ? '#3a4a2a' : '#5d8236', p[2] ? '#7a8a60' : '#a9c86a'); }); }, { flat: 1 }],
    g_resin: [24, 24, 12, 12, function (c) { var g = c.createRadialGradient(-2.5, 0, 1, 0, 2.5, 9); g.addColorStop(0, '#ffe9a0'); g.addColorStop(0.5, '#e0a82e'); g.addColorStop(1, '#9a6a14'); c.fillStyle = g; c.beginPath(); c.moveTo(0, -9.5); c.quadraticCurveTo(8.5, 2, 5.5, 6.5); c.quadraticCurveTo(0, 11, -5.5, 6.5); c.quadraticCurveTo(-8.5, 2, 0, -9.5); c.fill(); }, { flat: 1 }],
    g_gold: [24, 24, 12, 12, function (c) { c.fillStyle = lit(c, '#e8b72c', -4, 8); c.beginPath(); c.moveTo(-9.5, 7.5); c.quadraticCurveTo(-5, -4.5, 0, -4.5); c.quadraticCurveTo(5, -4.5, 9.5, 7.5); c.closePath(); c.fill(); [[-3, 1], [2.5, -1], [0, 4], [5, 4.5], [-5.5, 5]].forEach(function (p) { blob(c, p[0], p[1], 1.2, '#fff2b0'); }); P(c, [5, -9.5, 6.2, -6.8, 9, -5.6, 6.2, -4.4, 5, -1.6, 3.8, -4.4, 1, -5.6, 3.8, -6.8], '#fff6c8'); }, { flat: 1 }],
    g_furn: [24, 24, 12, 12, function (c) { P(c, [-6.5, -9.5, -4, -9.5, -4, 9.5, -6.5, 9.5], '#8a6238'); P(c, [-6.5, -9.5, 2, -9.5, 2, -7, -6.5, -7], '#a87a48'); P(c, [-6.5, -5, 2, -5, 2, -3, -6.5, -3], '#a87a48'); P(c, [-6.5, 0, 7.5, 0, 7.5, 3, -6.5, 3], '#c1905a'); P(c, [5, 3, 7.5, 3, 7.5, 9.5, 5, 9.5], '#8a6238'); }, { flat: 1 }],
    g_porc: [24, 24, 12, 12, function (c) { c.fillStyle = lit(c, '#f4f6fa', -9, 9); c.beginPath(); c.moveTo(-2.5, -9.5); c.lineTo(2.5, -9.5); c.lineTo(2, -6.5); c.quadraticCurveTo(9, -2, 4, 9); c.lineTo(-4, 9); c.quadraticCurveTo(-9, -2, -2, -6.5); c.closePath(); c.fill(); c.strokeStyle = '#3d6fc4'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-6, -1); c.quadraticCurveTo(0, 2, 6, -1); c.moveTo(-5, 4.5); c.quadraticCurveTo(0, 7, 5, 4.5); c.stroke(); blob(c, 0, -3, 1.2, '#3d6fc4'); }, { flat: 1 }],
    g_batik: [24, 24, 12, 12, function (c) { P(c, [-9, -8, 9, -8, 9, 8, -9, 8], '#2a4380'); P(c, [3.5, 8, 9, 8, 9, 2.5], '#b9642e'); for (var y = -5; y <= 5; y += 5) for (var x = -5.5; x <= 5.5; x += 5.5) { if (x > 2 && y > 2) continue; blob(c, x, y, 1.5, GOLD); blob(c, x + 2.7, y + 2.5, 0.8, '#f1e8d0'); } }, { flat: 1 }],
    g_orn: [24, 24, 12, 12, function (c) { c.strokeStyle = '#b9881c'; c.lineWidth = 4.4; c.beginPath(); c.arc(0, 2.5, 6, 0, 6.3); c.stroke(); c.strokeStyle = '#f6cf4a'; c.lineWidth = 2.6; c.beginPath(); c.arc(0, 2.5, 6, 0, 6.3); c.stroke(); P(c, [0, -10, 4, -6, 0, -2, -4, -6], '#d4423c'); P(c, [0, -10, 4, -6, 0, -6], '#f08a80'); }, { flat: 1 }],
    i_trail: [72, 48, 36, 28, function (c) { plot(c, 27, 13.5, '#86a45c'); c.strokeStyle = 'rgba(60,44,26,.55)'; c.lineWidth = 6; c.beginPath(); c.moveTo(-20, 3); c.quadraticCurveTo(-2, 6, 4, -2); c.quadraticCurveTo(10, -8, 22, -3); c.stroke(); c.strokeStyle = '#cdb98a'; c.lineWidth = 3; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]); }, { flat: 1 }],
    i_road: [72, 48, 36, 28, function (c) { plot(c, 27, 13.5, '#86a45c'); c.strokeStyle = '#5a4a34'; c.lineWidth = 10; c.beginPath(); c.moveTo(-20, 3); c.quadraticCurveTo(-2, 6, 4, -2); c.quadraticCurveTo(10, -8, 22, -3); c.stroke(); c.strokeStyle = '#dccfa8'; c.lineWidth = 6.5; c.stroke(); }, { flat: 1 }],
    m_porter: [52, 40, 26, 30, function (c) { [[-9, 0, '#efe2bc'], [0, 2, '#cf6a3c'], [9, 0, '#efe2bc']].forEach(function (p) { man(c, p[0], p[1], p[2]); P(c, [p[0] - 3, p[1] - 15, p[0] + 3, p[1] - 15, p[0] + 3, p[1] - 10.5, p[0] - 3, p[1] - 10.5], '#96744c'); }); P(c, [9, -19, 15, -17, 9, -15], GOLD); c.fillStyle = C.dark; c.fillRect(8.4, -19, 0.9, 6); }],
    m_eleph: [60, 48, 30, 36, function (c) { c.fillStyle = '#666b78'; c.fillRect(-9, -6, 3.6, 8); c.fillRect(4, -6, 3.6, 8); var g = c.createRadialGradient(-3, -15, 2, 0, -11, 13); g.addColorStop(0, '#a3a8b4'); g.addColorStop(1, '#727784'); c.fillStyle = g; c.beginPath(); c.ellipse(0, -11, 12, 8, 0, 0, 6.3); c.fill(); blob(c, 11, -13, 6, '#8d92a0'); c.strokeStyle = '#8d92a0'; c.lineWidth = 2.8; c.beginPath(); c.moveTo(15, -11); c.quadraticCurveTo(19, -4, 16, 0); c.stroke(); c.fillStyle = '#6a6f7c'; c.beginPath(); c.ellipse(8, -13, 3, 4.5, 0.3, 0, 6.3); c.fill(); P(c, [-8, -20, 6, -20, 6, -16, -8, -16], '#c9562f'); P(c, [-7, -25, 5, -25, 5, -20, -7, -20], '#96744c'); man(c, 8, -15, '#efe2bc'); P(c, [-9, -32, -3, -30, -9, -28], GOLD); c.fillStyle = C.dark; c.fillRect(-9.6, -32, 0.9, 8); }],
    m_cart: [64, 44, 32, 32, function (c) { c.fillStyle = '#7a5a40'; c.beginPath(); c.ellipse(13, -7, 8, 5, 0, 0, 6.3); c.fill(); blob(c, 20, -9, 3.6, '#84634a'); c.fillRect(8, -4, 2.2, 6); c.fillRect(15, -4, 2.2, 6); c.strokeStyle = '#f1e8d0'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(21, -12); c.lineTo(24, -15); c.moveTo(19, -12); c.lineTo(18, -16); c.stroke();
      P(c, [-17, -12, 3, -12, 3, -4, -17, -4], C.wood); P(c, [-15, -17, 1, -17, 1, -12, -15, -12], '#d2b080'); c.fillStyle = C.woodD; c.fillRect(3, -8, 8, 1.4); blob(c, -12, -2, 4.6, C.dark); blob(c, -12, -2, 2, '#b99a6a'); blob(c, -1, -2, 4.6, C.dark); blob(c, -1, -2, 2, '#b99a6a'); man(c, -6, -14, '#efe2bc'); P(c, [-17, -26, -11, -24, -17, -22], GOLD); c.fillStyle = C.dark; c.fillRect(-17.6, -26, 0.9, 14); }],
    m_sampan: [60, 52, 30, 38, function (c) { c.fillStyle = 'rgba(242,236,214,.3)'; c.beginPath(); c.ellipse(0, 2, 19, 4, 0, 0, 6.3); c.fill(); hull(c, 0, 0, 15, '#6b4a2c'); c.strokeStyle = C.dark; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-2, -2); c.lineTo(-2, -28); c.stroke(); P(c, [-1, -27, 12, -22, 10, -8, -1, -6], '#efe2bc'); c.strokeStyle = 'rgba(60,40,20,.4)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(-1, -20); c.lineTo(11, -17); c.moveTo(-1, -13); c.lineTo(10.5, -12); c.stroke(); P(c, [-11, -5, -5, -5, -5, -1.5, -11, -1.5], '#96744c'); man(c, 9, -1, '#cf6a3c'); P(c, [-2, -34, 5, -32, -2, -30], GOLD); }, { flat: 1 }],
    m_junk: [80, 72, 40, 54, function (c) { c.fillStyle = 'rgba(242,236,214,.3)'; c.beginPath(); c.ellipse(0, 3, 28, 5, 0, 0, 6.3); c.fill(); c.fillStyle = '#5c3d24'; c.beginPath(); c.moveTo(-24, -8); c.lineTo(-22, 2); c.quadraticCurveTo(0, 8, 24, -2); c.lineTo(28, -14); c.lineTo(18, -10); c.lineTo(-12, -6); c.closePath(); c.fill(); P(c, [-24, -14, -12, -14, -12, -7, -24, -7], '#7a5434');
      c.strokeStyle = C.dark; c.lineWidth = 1.5; c.beginPath(); c.moveTo(4, -8); c.lineTo(4, -44); c.moveTo(-10, -8); c.lineTo(-10, -32); c.moveTo(18, -10); c.lineTo(18, -28); c.stroke();
      function sail(x, y, w, h) { P(c, [x, y, x + w, y + 3, x + w - 1, y + h, x, y + h - 2], '#c9562f'); c.strokeStyle = 'rgba(40,20,10,.45)'; c.lineWidth = 0.7; c.beginPath(); for (var i = 1; i < 4; i++) { c.moveTo(x, y + h * i / 4); c.lineTo(x + w, y + 3 + (h - 3) * i / 4); } c.stroke(); }
      sail(5, -42, 14, 28); sail(-9, -30, 10, 20); sail(19, -27, 7, 14); P(c, [4, -50, 12, -48, 4, -46], GOLD); c.fillStyle = C.dark; c.fillRect(3.4, -50, 0.9, 8); }, { flat: 1 }]
  };
  function spr(st, key) {                   // draw a picture once, then give it a thin dark outline so it sits crisply on the painted ground
    var s = st.spr[key]; if (s) return s;
    var a = ART[key], sc = /^(b_|house|market|hq)/.test(key) ? 1.14 : 1, w = Math.ceil(a[0] * sc), h = Math.ceil(a[1] * sc), raw = mk(w * SS, h * SS), c = raw.getContext('2d');
    c.scale(SS * sc, SS * sc); c.translate(a[2], a[3]); c.lineCap = 'round'; c.lineJoin = 'round'; a[4](c);
    var sil = mk(w * SS, h * SS), q = sil.getContext('2d'); q.drawImage(raw, 0, 0); q.globalCompositeOperation = 'source-in'; q.fillStyle = '#181410'; q.fillRect(0, 0, w * SS, h * SS);
    var out = mk(w * SS, h * SS), o = out.getContext('2d'); o.globalAlpha = 0.5; [[-1.4, 0], [1.4, 0], [0, -1.4], [0, 1.4]].forEach(function (d) { o.drawImage(sil, d[0], d[1]); }); o.globalAlpha = 1; o.drawImage(raw, 0, 0);
    return (st.spr[key] = { c: out, w: w, h: h, ax: a[2] * sc, ay: a[3] * sc, sil: sil, flat: !!(a[5] && a[5].flat) });
  }
  function shadow(s, flip) {                // the picture's outline, laid over on the ground away from the light
    var key = flip ? 'sf' : 'sn'; if (s[key]) return s[key];
    var kx = 0.95, ky = 0.46, below = s.h - s.ay, w = Math.ceil(s.w + kx * s.h) + 4, h = Math.ceil(ky * s.h) + 6, ax = s.ax + kx * below + 2, ay = ky * below + 3, cv = mk(w * SS, h * SS), c = cv.getContext('2d');
    c.setTransform(SS, 0, -kx * SS, -ky * SS, ax * SS, ay * SS); if (flip) c.scale(-1, 1); c.drawImage(s.sil, -s.ax, -s.ay, s.w, s.h);
    return (s[key] = { c: cv, w: w, h: h, ax: ax, ay: ay });
  }
  function put(c, st, key, X, Y, flip, k) {
    var s = spr(st, key); k = k || 1;
    if (flip) { c.save(); c.translate(X, Y); c.scale(-k, k); c.drawImage(s.c, -s.ax, -s.ay, s.w, s.h); c.restore(); }
    else c.drawImage(s.c, X - s.ax * k, Y - s.ay * k, s.w * k, s.h * k);
  }
  R.sprite = function (st, key) {           // the picture with its empty margins measured, for icons
    var s = spr(st, key); if (s.bx != null) return s;
    var w = s.c.width, h = s.c.height, d = s.c.getContext('2d').getImageData(0, 0, w, h).data, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < x0) { x0 = 0; y0 = 0; x1 = w - 1; y1 = h - 1; }
    s.bx = x0; s.by = y0; s.bw = x1 - x0 + 1; s.bh = y1 - y0 + 1; return s;
  };

  /* ---------------- set-up ---------------- */
  R.init = function (cv, S) {
    var small = Math.min(root.innerWidth || 800, root.innerHeight || 600) < 620;
    var st = { cv: cv, ctx: cv.getContext('2d'), vw: 300, vh: 200, dpr: 1, spr: {}, pv: -1, pp: null, fx: [], gs: small ? 0.5 : 1, P: small ? 12 : 24, dl: { k: [], x: [], y: [], f: [], o: [], s: [] } };
    R.ground(st, S); return st;
  };
  R.resize = function (st) {
    var b = st.cv.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1);
    st.vw = Math.max(50, b.width); st.vh = Math.max(50, b.height); st.dpr = dpr;
    var w = Math.round(st.vw * dpr), h = Math.round(st.vh * dpr); if (st.cv.width !== w || st.cv.height !== h) { st.cv.width = w; st.cv.height = h; }
  };
  R.minZoom = function (st) { return Math.max(0.26, Math.min(st.vw / WW, st.vh / WH) * 0.98); };
  R.clamp = function (st, cam) {
    cam.z = Math.max(R.minZoom(st), Math.min(2, cam.z));
    var w = st.vw / cam.z, h = st.vh / cam.z;
    cam.x = w >= WW ? (WW - w) / 2 : Math.max(-w * 0.35, Math.min(WW - w * 0.65, cam.x));
    cam.y = h >= WH ? (WH - h) / 2 : Math.max(-h * 0.35, Math.min(WH - h * 0.65, cam.y));
  };
  R.center = function (st, cam, x, y) { cam.x = cx(x, y) - st.vw / cam.z / 2; cam.y = cy(x, y) - st.vh / cam.z / 2; R.clamp(st, cam); };
  R.toTile = function (st, cam, sx, sy) {           // screen point -> fractional tile coordinates
    var a = (sx / cam.z + cam.x - OX) / HW, b = (sy / cam.z + cam.y - OY - HH) / HH;
    return [(a + b) / 2, (b - a) / 2];
  };
  R.toScreen = function (st, cam, x, y) { return [(cx(x, y) - cam.x) * cam.z, (cy(x, y) - cam.y) * cam.z]; };
  var TALL = { house: 26, bld: 40, mkt: 38, hq: 52, site: 12 };
  function onPic(st, key, flip, dx, dy) {   // is a point, measured from a picture's foot, on the picture itself, give or take a little?
    var s = spr(st, key), i;
    if (!s.mask) { var w = s.c.width, h = s.c.height, d = s.sil.getContext('2d').getImageData(0, 0, w, h).data, q = s.mask = new Uint8Array(w * h); for (i = 0; i < w * h; i++) q[i] = d[i * 4 + 3] > 50 ? 1 : 0; s.mw = w; s.mh = h; }
    var lx = Math.round(((flip ? -dx : dx) + s.ax) * SS), ly = Math.round((dy + s.ay) * SS), a, b, x, y;
    for (a = -4; a <= 4; a += 4) for (b = -4; b <= 4; b += 4) { x = lx + a; y = ly + b; if (x >= 0 && y >= 0 && x < s.mw && y < s.mh && s.mask[y * s.mw + x]) return true; }
    return false;
  }
  function picOf(o) { return o.k === 'bld' ? 'b_' + o.b.t : o.k === 'site' ? 's_' + WD.sites[o.i].t : o.k === 'mkt' ? 'market' + o.m.sz : o.k === 'hq' ? 'hq' : 'house' + (o.h[3] % 4); }
  R.pick = function (st, S, cam, sx, sy, bare) {   // what is under the pointer: a merchant, a tag (unless a tool is in hand), the nearest picture standing in front, then the ground
    var i, best = null, bd = 20 * 20, wx = sx / cam.z + cam.x, wy = sy / cam.z + cam.y, r = CH.rt(S);
    for (i = 0; i < S.ms.length; i++) { var m = S.ms[i], dx = (cx(m.x, m.y) - wx) * cam.z, dy = (cy(m.x, m.y) - 10 - wy) * cam.z, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = m; } }
    var t = R.toTile(st, cam, sx, sy), tx = Math.round(t[0]), ty = Math.round(t[1]);
    if (best) return { k: 'm', m: best, x: tx, y: ty };
    var hot = bare ? [] : st.hot || [];
    for (i = hot.length - 1; i >= 0; i--) { var q = hot[i]; if (sx >= q[0] && sy >= q[1] && sx <= q[2] && sy <= q[3]) { var hp = q[4]; return hp.k === 'm' ? { k: 'm', m: hp.m, x: tx, y: ty } : { k: hp.k, o: hp, x: hp.x, y: hp.y, tx: tx, ty: ty }; } }
    var cand = [[3, 3], [3, 2], [2, 3], [2, 2], [2, 1], [1, 2], [1, 1], [1, 0], [0, 1], [0, 0]];
    for (i = 0; i < cand.length; i++) {
      var x = tx + cand[i][0], y = ty + cand[i][1]; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      var o = r.at[y * W + x]; if (!o) continue;
      if (onPic(st, picOf(o), o.k === 'house' && (x * 7 + y * 3) % 2 === 1, wx - cx(x, y), wy - cy(x, y))) return { k: o.k, o: o, x: x, y: y, tx: tx, ty: ty };
    }
    var o0 = tx >= 0 && ty >= 0 && tx < W && ty < H ? r.at[ty * W + tx] : null;      // nothing drawn right under the pointer, but the tile itself holds something low
    if (o0) return { k: o0.k, o: o0, x: tx, y: ty, tx: tx, ty: ty };
    return { k: 'tile', x: tx, y: ty };
  };

  /* ---------------- shapes on the ground ---------------- */
  function ring(c, x, y, r) {               // a market's reach: every tile whose centre lies inside this circle, which the view turns into an ellipse
    var q = Math.sqrt(r * r + r + 0.5) * 1.41421; c.ellipse(cx(x, y), cy(x, y), q * HW, q * HH, 0, 0, 6.2832);
  }
  function gridPath(st) {                   // the tile lines, shown only while something is being placed
    if (st.grid) return st.grid; var g = st.grid = new Path2D(), i;
    for (i = 0; i <= W; i++) { g.moveTo(cx(i - 0.5, -0.5), cy(i - 0.5, -0.5)); g.lineTo(cx(i - 0.5, H - 0.5), cy(i - 0.5, H - 0.5)); }
    for (i = 0; i <= H; i++) { g.moveTo(cx(-0.5, i - 0.5), cy(-0.5, i - 0.5)); g.lineTo(cx(W - 0.5, i - 0.5), cy(W - 0.5, i - 0.5)); }
    return g;
  }
  function pathShapes(st, S) {              // trails, roads and bridges as three strokes with rounded bends, rebuilt only when a path is laid
    var r = CH.rt(S); if (st.pp && st.pv === r.pv && st.pS === S) return st.pp;
    var pp = { trail: new Path2D(), road: new Path2D(), bridge: new Path2D() }, P_ = S.path, k, i, d, DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
    for (k in P_) {
      i = +k; var x = i % W, y = (i / W) | 0, X = cx(x, y), Y = cy(x, y), nb = [];
      for (d = 0; d < 8; d++) {
        var nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        var j = ny * W + nx, q = P_[j]; if (!q) continue;
        if (d > 3 && (P_[y * W + nx] || P_[ny * W + x])) continue;        // the corner is already joined the long way round
        nb.push([(X + cx(nx, ny)) / 2, (Y + cy(nx, ny)) / 2, WD.terr[i] === T.RIVER || WD.terr[j] === T.RIVER ? 'bridge' : Math.min(P_[i], q) === 2 ? 'road' : 'trail']);
      }
      if (nb.length === 2 && nb[0][2] === nb[1][2]) { pp[nb[0][2]].moveTo(nb[0][0], nb[0][1]); pp[nb[0][2]].quadraticCurveTo(X, Y, nb[1][0], nb[1][1]); }
      else if (nb.length) nb.forEach(function (n) { pp[n[2]].moveTo(X, Y); pp[n[2]].lineTo(n[0], n[1]); });
      else { pp.trail.moveTo(X - 3, Y); pp.trail.lineTo(X + 3, Y); }
    }
    st.pv = r.pv; st.pS = S; return (st.pp = pp);
  }
  function rr(c, x, y, w, h, r) { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function tileLine(c, tiles) { c.beginPath(); for (var i = 0; i < tiles.length; i++) { var x = tiles[i] % W, y = (tiles[i] / W) | 0; if (i) c.lineTo(cx(x, y), cy(x, y)); else c.moveTo(cx(x, y), cy(x, y)); } }
  function dia(c, X, Y, g) { c.beginPath(); c.moveTo(X, Y - HH - g * 0.5); c.lineTo(X + HW + g, Y); c.lineTo(X, Y + HH + g * 0.5); c.lineTo(X - HW - g, Y); c.closePath(); }
  function along(p, s) {
    var i = Math.min(p.length - 2, Math.max(0, Math.floor(s))), f = cl(s - i, 0, 1), ax = p[i] % W, ay = (p[i] / W) | 0, bx = p[i + 1] % W, by = (p[i + 1] / W) | 0, u, k, qx, qy;
    if (f >= 0.5 && i + 2 < p.length) { qx = p[i + 2] % W; qy = (p[i + 2] / W) | 0; u = f - 0.5; k = 1 - u; return [k * k * (ax + bx) / 2 + 2 * u * k * bx + u * u * (bx + qx) / 2, k * k * (ay + by) / 2 + 2 * u * k * by + u * u * (by + qy) / 2]; }
    if (f < 0.5 && i > 0) { qx = p[i - 1] % W; qy = (p[i - 1] / W) | 0; u = f + 0.5; k = 1 - u; return [k * k * (qx + ax) / 2 + 2 * u * k * ax + u * u * (ax + bx) / 2, k * k * (qy + ay) / 2 + 2 * u * k * ay + u * u * (ay + by) / 2]; }
    return [ax + (bx - ax) * f, ay + (by - ay) * f];
  }
  function here(m) { return m.st === 'go' && m.path && m.path.length > 1 ? along(m.path, m.pi + m.pf) : [m.x, m.y]; }
  function mpos(m, ui) {                    // between two ticks of the game he is drawn part-way, so he glides instead of hopping
    var pr = ui.prev && ui.prev.get(m), a = ui.alpha == null ? 1 : ui.alpha;
    if (!pr || a >= 1) return here(m);
    if (m.st === 'go' && m.path && pr.p === m.path) return along(m.path, pr.s + (m.pi + m.pf - pr.s) * a);
    var cur = here(m), dx = cur[0] - pr.x, dy = cur[1] - pr.y;
    return Math.abs(dx) + Math.abs(dy) < 1.6 ? [pr.x + dx * a, pr.y + dy * a] : cur;
  }
  R.mpos = mpos; R.here = here;
  var waves = null;
  function waveSpots() {                    // where the open sea catches the light
    if (waves) return waves; waves = []; var sd = seaDepth();
    for (var y = 1; y < H - 1; y++) for (var x = 1; x < W - 1; x++) if (WD.terr[y * W + x] === T.SEA && sd[y * W + x] > 0.12 && h2(x, y, 91) < 0.3) waves.push([x + h2(x, y, 92) - 0.5, y + h2(x, y, 93) - 0.5, h2(x, y, 94) * 6.28]);
    return waves;
  }

  /* ---------------- a frame ---------------- */
  R.render = function (st, S, ui, now) {
    var c = st.ctx, cam = ui.cam, z = cam.z, dpr = st.dpr, r = CH.rt(S), i, m, x, y, n, MP = S.ms.map(function (q) { return mpos(q, ui); });
    while (r.dirty.length) { i = r.dirty.pop(); cleared(st, S, i % W, (i / W) | 0); }
    if (r.fx.length > 8) r.fx.splice(0, r.fx.length - 4);
    while (r.fx.length) { var f = r.fx.shift(); f.t0 = now + st.fx.length * 90; st.fx.push(f); }
    c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgb(' + BG.join(',') + ')'; c.fillRect(0, 0, st.cv.width, st.cv.height);
    c.setTransform(dpr * z, 0, 0, dpr * z, -cam.x * z * dpr, -cam.y * z * dpr);
    var vw = st.vw / z, vh = st.vh / z, sx = Math.max(0, cam.x), sy = Math.max(0, cam.y), ex = Math.min(WW, cam.x + vw), ey = Math.min(WH, cam.y + vh), gs = st.gs;
    c.imageSmoothingEnabled = true;
    if (ex > sx && ey > sy) c.drawImage(st.gnd, sx * gs, sy * gs, (ex - sx) * gs, (ey - sy) * gs, sx, sy, ex - sx, ey - sy);
    c.lineCap = 'round'; c.lineJoin = 'round';
    var u0 = (cam.x - OX) / HW - 3, u1 = (cam.x + vw - OX) / HW + 3, d0 = Math.max(0, Math.floor((cam.y - OY - HH) / HH) - 2), d1 = Math.min(W + H - 2, Math.ceil((cam.y + vh - OY) / HH) + 7), far = z < 0.42;

    // light on the open sea
    if (!far) { var ws = waveSpots(); c.lineWidth = 1.1; for (i = 0; i < ws.length; i++) { var wv = ws[i], wd = wv[0] + wv[1], wu = wv[0] - wv[1]; if (wd < d0 || wd > d1 || wu < u0 || wu > u1) continue; var wa = Math.sin(now / 1100 + wv[2]); if (wa < 0.1) continue; c.strokeStyle = 'rgba(244,238,216,' + (wa * 0.26).toFixed(3) + ')'; c.beginPath(); c.arc(cx(wv[0], wv[1]) + Math.sin(now / 2300 + wv[2]) * 4, cy(wv[0], wv[1]) + 4, 8, Math.PI * 1.18, Math.PI * 1.82); c.stroke(); } }

    // whose ground is whose
    var sel = ui.sel, tool = ui.tool, hv = ui.hover, pv = ui.preview, showAll = (tool && (tool.k === 'market' || tool.k === 'bld')) || !!ui.pick;       // while stops are being chosen, every market shows the ground that counts as it
    if (tool && S.mk.length + (hv ? 1 : 0) > 0) {     // tile lines, inside the reaches for a building and round the pointer for anything else
      c.save(); c.beginPath();
      if (tool.k === 'bld') for (i = 0; i < S.mk.length; i++) { m = S.mk[i]; c.moveTo(cx(m.x, m.y), cy(m.x, m.y)); ring(c, m.x, m.y, D.sizes[m.sz].r); }
      else if (hv) ring(c, hv[0], hv[1], tool.k === 'market' ? D.sizes[tool.t].r + 2 : 5);
      c.clip(); c.strokeStyle = 'rgba(244,236,214,.2)'; c.lineWidth = 1; c.stroke(gridPath(st)); c.restore();
    }
    for (i = 0; i < S.mk.length; i++) {
      m = S.mk[i]; var on = sel && sel.k === 'mkt' && sel.id === m.id; if (!on && !showAll && !ui.reach) continue;
      c.beginPath(); ring(c, m.x, m.y, D.sizes[m.sz].r); c.fillStyle = on ? 'rgba(242,182,50,.1)' : 'rgba(242,230,201,.06)'; c.fill();
      c.strokeStyle = 'rgba(14,23,43,.45)'; c.lineWidth = on ? 4.5 : 3; c.stroke(); c.strokeStyle = on ? GOLD : 'rgba(244,236,214,.75)'; c.lineWidth = on ? 2.4 : 1.5; c.setLineDash(on ? [] : [7, 6]); c.stroke(); c.setLineDash([]);
      if (tool && tool.k === 'market' && m.sz < D.sizes.length - 1) { c.beginPath(); ring(c, m.x, m.y, D.sizes[m.sz + 1].r); c.strokeStyle = 'rgba(244,236,214,.42)'; c.lineWidth = 1.3; c.setLineDash([2, 7]); c.stroke(); c.setLineDash([]); }   // the room it needs to grow
    }
    // paths
    var pp = pathShapes(st, S);
    c.strokeStyle = 'rgba(52,40,22,.5)'; c.lineWidth = 6.5; c.stroke(pp.trail); c.strokeStyle = '#b9a272'; c.lineWidth = 4; c.stroke(pp.trail); c.strokeStyle = 'rgba(236,222,180,.55)'; c.lineWidth = 1.6; c.setLineDash([5, 6]); c.stroke(pp.trail); c.setLineDash([]);
    c.strokeStyle = 'rgba(40,30,18,.6)'; c.lineWidth = 11; c.stroke(pp.road); c.strokeStyle = '#cdbd92'; c.lineWidth = 8; c.stroke(pp.road); c.strokeStyle = '#e6dab6'; c.lineWidth = 4.5; c.stroke(pp.road);
    c.strokeStyle = '#33241a'; c.lineWidth = 11; c.stroke(pp.bridge); c.strokeStyle = '#a8845a'; c.lineWidth = 7.5; c.stroke(pp.bridge); c.strokeStyle = 'rgba(46,30,16,.5)'; c.lineWidth = 7.5; c.setLineDash([1.2, 4]); c.lineCap = 'butt'; c.stroke(pp.bridge); c.setLineDash([]); c.lineCap = 'round';

    // what the tool in hand would do
    if (pv && pv.reach) { c.beginPath(); ring(c, pv.x, pv.y, pv.reach); c.fillStyle = pv.ok ? 'rgba(242,182,50,.14)' : 'rgba(240,115,110,.16)'; c.fill(); c.strokeStyle = 'rgba(14,23,43,.45)'; c.lineWidth = 4.5; c.stroke(); c.strokeStyle = pv.ok ? GOLD : DEAR; c.lineWidth = 2.4; c.stroke(); }
    if (pv && pv.tiles) { tileLine(c, pv.tiles); c.strokeStyle = 'rgba(14,23,43,.6)'; c.lineWidth = 8; c.stroke(); c.strokeStyle = pv.ok ? GOLD : DEAR; c.lineWidth = 4; c.setLineDash([9, 6]); c.stroke(); c.setLineDash([]); }
    if (pv && pv.from != null) { dia(c, cx(pv.from % W, (pv.from / W) | 0), cy(pv.from % W, (pv.from / W) | 0), -2); c.strokeStyle = GOLD; c.lineWidth = 2.4; c.stroke(); }
    if (hv && (!pv || !pv.tiles)) { dia(c, cx(hv[0], hv[1]), cy(hv[0], hv[1]), -1.5); c.strokeStyle = pv ? (pv.ok ? GOLD : DEAR) : 'rgba(244,236,214,.55)'; c.lineWidth = 1.8; c.stroke(); if (pv && !pv.ok && !pv.reach) { c.fillStyle = 'rgba(240,115,110,.3)'; c.fill(); } }

    // the chosen merchant's round, and a ring under whatever is chosen
    var sm = sel && sel.k === 'm' ? S.ms.filter(function (q) { return q.id === sel.id; })[0] : null;
    if (sm && sm.rt) {
      var Rt = CH.routeOf(S, sm.rt), cls = D.trans[sm.tr].cls;
      if (Rt && Rt.stops.length > 1) for (i = 0; i < Rt.stops.length; i++) {
        var A = CH.mkt(S, Rt.stops[i].m), B = CH.mkt(S, Rt.stops[(i + 1) % Rt.stops.length].m), ta = CH.stopTile(S, sm, A), tb = CH.stopTile(S, sm, B);
        if (typeof ta === 'string' || typeof tb === 'string') continue; var wy_ = CH.way(S, cls, ta, tb); if (!wy_) continue;
        tileLine(c, wy_); c.strokeStyle = 'rgba(14,23,43,.5)'; c.lineWidth = 6; c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 2.6; c.setLineDash([2, 7]); c.stroke(); c.setLineDash([]);
      }
    }
    var rg = null;
    if (sm) rg = MP[S.ms.indexOf(sm)]; else if (sel && sel.k === 'mkt') { m = CH.mkt(S, sel.id); if (m) rg = [m.x, m.y]; } else if (sel && sel.at) rg = sel.at;
    if (rg) { c.strokeStyle = 'rgba(14,23,43,.5)'; c.lineWidth = 5; c.beginPath(); c.ellipse(cx(rg[0], rg[1]), cy(rg[0], rg[1]), 24, 12, 0, 0, 6.3); c.stroke(); c.strokeStyle = GOLD; c.lineWidth = 2.6; c.stroke(); }

    // everything that stands up, gathered back to front
    var L = st.dl, bk = {}; n = 0;
    function add(key, X, Y, flip, obj, k) { L.k[n] = key; L.x[n] = X; L.y[n] = Y; L.f[n] = flip ? 1 : 0; L.o[n] = obj || null; L.s[n] = k || 1; n++; }
    for (i = 0; i < S.ms.length; i++) { var bq = Math.ceil(MP[i][0] + MP[i][1] - 0.001); (bk[bq] = bk[bq] || []).push(i); }
    for (var d = d0; d <= d1; d++) {
      var xa = Math.max(0, d - H + 1, Math.ceil((d + u0) / 2)), xb = Math.min(W - 1, d, Math.floor((d + u1) / 2));
      for (x = xa; x <= xb; x++) {
        y = d - x; i = y * W + x; var o = r.at[i], X = cx(x, y), Y = cy(x, y), hs = WD.shade[i], tr = WD.terr[i];
        if (o) {
          if (o.k === 'house') add('house' + (o.h[3] % 4), X, Y, (x * 7 + y * 3) % 2 === 1);
          else if (o.k === 'site') { var sd = WD.sites[o.i]; if (CH.live(S, D.sites[sd.t])) add('s_' + sd.t, X, Y, 0, S.st[o.i].mk ? null : o); }
          else if (o.k === 'mkt') add('market' + o.m.sz, X, Y);
          else if (o.k === 'hq') add('hq', X, Y);
          else if (o.k === 'bld') add('b_' + o.b.t, X, Y, 0, o);
        } else if (tr === T.FOREST && !S.clear[i]) {          // three trees a tile, each with its own place, kind and size
          var ha = h2(x, y, 11), hb = h2(x, y, 12), hc = h2(x, y, 13);
          add('tree' + ((ha * 97 | 0) % 4), X - 14 + ha * 12, Y - 6 + hb * 5, ha > 0.5, null, 0.84 + hc * 0.42);
          if (!far) { add('tree' + ((hb * 61 | 0) % 4), X + 5 + hb * 14, Y - 3 + hc * 7, hb > 0.5, null, 0.8 + ha * 0.42); if (z >= 0.62) add('tree' + ((hc * 43 | 0) % 3), X - 9 + hc * 16, Y + 4 + ha * 6, hc < 0.4, null, 0.86 + hb * 0.4); }   // from a distance two trees fill a tile as well as three
        } else if (tr === T.MOUNT) { if (hs > 0.4) add('mount' + ((hs * 53 | 0) % 3), X - 6 + hs * 12, Y + 4, hs > 0.7, null, 0.8 + h2(x, y, 14) * 0.5); else if (!far) { add('tree2', X - 10 + hs * 30, Y - 4, 0, null, 1); add('tree0', X + 6 - hs * 20, Y + 5, 1, null, 0.95); } }
        else if (tr === T.GRASS && !S.path[i] && !far) { if (hs > 0.9) add(WD.elev[i] < 0.14 ? 'palm' : 'tree3', X + 4, Y + 1, hs > 0.95, null, 0.9 + h2(x, y, 15) * 0.3); else if (hs < 0.035 && WD.elev[i] >= 0.14) add('tree1', X - 6, Y + 2); }
        else if (tr === T.HILL && !S.path[i] && !far && hs > 0.6) { add(hs > 0.82 ? 'tree0' : 'tree3', X - 10 + h2(x, y, 16) * 20, Y - 4 + hs * 6, hs > 0.8, null, 0.8 + h2(x, y, 17) * 0.4); if (hs > 0.74) add('tree1', X + 8 - h2(x, y, 18) * 14, Y + 5, 0, null, 0.85); }
      }
      var ms_ = bk[d]; if (ms_) for (i = 0; i < ms_.length; i++) { m = S.ms[ms_[i]]; var mq = MP[ms_[i]], wat = D.trans[m.tr].mode === 'water'; add('m_' + m.tr, cx(mq[0], mq[1]), cy(mq[0], mq[1]) + (wat ? Math.sin(now / 420 + m.id) * 1.2 : (m.st === 'go' ? Math.abs(Math.sin(now / 150 + m.id)) * -1.2 : 0)), m.dir < 0); }
    }
    // shadows first, all of them on the ground, then the things themselves
    if (!far) {
      if (!st.contact) { st.contact = mk(64, 64); var cg = st.contact.getContext('2d'), gr = cg.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(8,16,24,.62)'); gr.addColorStop(0.6, 'rgba(8,16,24,.3)'); gr.addColorStop(1, 'rgba(8,16,24,0)'); cg.fillStyle = gr; cg.fillRect(0, 0, 64, 64); }
      for (i = 0; i < n; i++) { var s = spr(st, L.k[i]); if (s.flat) continue; var q = shadow(s, L.f[i]); c.globalAlpha = 0.36; c.drawImage(q.c, L.x[i] - q.ax, L.y[i] - q.ay, q.w, q.h); c.globalAlpha = 0.8; c.drawImage(st.contact, L.x[i] - s.w * 0.36, L.y[i] - s.w * 0.14, s.w * 0.72, s.w * 0.34); }
      c.globalAlpha = 1;
    }
    for (i = 0; i < n; i++) {
      var X2 = L.x[i], Y2 = L.y[i], ob = L.o[i];
      if (ob && ob.k === 'site') { c.globalAlpha = 0.5; put(c, st, L.k[i], X2, Y2, L.f[i]); c.globalAlpha = 1; continue; }      // a site no market reaches is only half there
      put(c, st, L.k[i], X2, Y2, L.f[i], L.s[i]);
      if (!ob || far) continue;
      var b = ob.b;
      if (b.own && D.bld[b.t].kind === 'works') { c.strokeStyle = '#3d2f20'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(X2 + 22, Y2 - 6); c.lineTo(X2 + 22, Y2 - 34); c.stroke(); c.fillStyle = GOLD; c.beginPath(); c.moveTo(X2 + 22, Y2 - 34); c.lineTo(X2 + 34, Y2 - 30); c.lineTo(X2 + 22, Y2 - 26); c.fill(); }
      if (b.st === 'run') for (var p = 0; p < 4; p++) { var ph = ((now / 2100 + p / 4 + b.id * 0.37) % 1); c.fillStyle = 'rgba(246,240,224,' + (0.36 * (1 - ph)).toFixed(3) + ')'; c.beginPath(); c.arc(X2 + 3 + ph * 12 + Math.sin(ph * 5 + p) * 2, Y2 - 38 - ph * 30, 3 + ph * 6, 0, 6.3); c.fill(); }
    }

    // money made or spent at a stop floats up from it
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.textAlign = 'center'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    for (i = st.fx.length - 1; i >= 0; i--) {
      var e = st.fx[i], age = (now - e.t0) / 1800; if (age > 1 || age < -1) { st.fx.splice(i, 1); continue; } if (age < 0) continue;
      var fx = (cx(e.x, e.y) - cam.x) * z, fy = (cy(e.x, e.y) - cam.y) * z - 30 * z - age * 34;
      c.globalAlpha = age < 0.7 ? 1 : (1 - age) / 0.3; c.font = (e.s ? '600 12.5px' : '700 15px') + ' "Alegreya Sans", system-ui, sans-serif'; c.lineWidth = 3.5; c.strokeStyle = INK;
      var tx = e.s || ((e.v > 0 ? '+' : '\u2212') + Math.abs(Math.round(e.v))); c.strokeText(tx, fx, fy); c.fillStyle = e.s ? (e.s.charAt(0) === '+' ? '#9fe3cd' : DEAR) : e.v > 0 ? GOLD : DEAR; c.fillText(tx, fx, fy);
    }
    c.globalAlpha = 1;
    // names of places nobody has founded yet, in a quiet hand
    var used = {}, p, yy, hot; for (i = 0; i < S.mk.length; i++) used[S.mk[i].name] = 1;
    if (z >= 0.3) for (i = 0; i < D.places.length; i++) {
      var pl = D.places[i]; if (used[pl.n]) continue;
      var qx = (cx(pl.x, pl.y) - cam.x) * z, qy = (cy(pl.x, pl.y) - cam.y) * z - 14 * z; if (qx < -80 || qy < -20 || qx > st.vw + 80 || qy > st.vh + 20) continue;
      c.font = 'italic 500 ' + (z < 0.5 ? 12 : 14) + 'px Alegreya, Georgia, serif'; c.lineWidth = 3; c.strokeStyle = 'rgba(14,23,43,.6)'; c.strokeText(pl.n, qx, qy); c.fillStyle = 'rgba(246,238,216,.82)'; c.fillText(pl.n, qx, qy);
    }

    /* What the map says without being asked. Over every site and workshop, a disc with the good it makes: ringed green
       while it works, pale when idle, red (showing the good it lacks) while it waits. Over a building that buys, a disc
       for each thing it wants, red while the shelves are bare. Under a market's name, a disc for each thing its houses
       need and a square for each good it has to spare. With one good picked from the bar, everything that makes or wants
       it is ringed gold and every market shows its price. */
    var lens = ui.lens && G[ui.lens] ? ui.lens : null, plain = !!ui.plain && !lens, tags = z >= 0.5 && !plain, PALE = 'rgba(242,230,201,.75)', hotl = st.hot = [];
    function mark(x0, y0, x1, y1, o) { hotl.push([x0, y0, x1, y1, o]); }
    function sp(x, y) { return [(cx(x, y) - cam.x) * z, (cy(x, y) - cam.y) * z]; }
    function vis(q) { return q[0] > -60 && q[1] > -20 && q[0] < st.vw + 60 && q[1] < st.vh + 220; }
    function topOf(key) { var q = R.sprite(st, key); return q.ay - q.by / SS; }                  // how far a picture stands above its tile
    function pic(g, x, y, sz) { var q = R.sprite(st, 'g_' + g), k = sz / Math.max(q.bw, q.bh); c.drawImage(q.c, q.bx, q.by, q.bw, q.bh, x - q.bw * k / 2, y - q.bh * k / 2, q.bw * k, q.bh * k); }
    function chip(x, y, rad, ring, lw, a) { c.globalAlpha = a; c.beginPath(); c.arc(x, y, rad, 0, 6.3); c.fillStyle = 'rgba(14,23,43,.9)'; c.fill(); c.lineWidth = lw; c.strokeStyle = ring; c.stroke(); }
    function per(v) { return v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
    var close = z >= 0.9 && !plain && !lens, PIT = close ? 24 : 19, F11 = '700 11px "Alegreya Sans", system-ui, sans-serif';
    function cost(mk, g, x, y) {              // today's price of a good at a market, under its disc: green where it is cheap, red where it is dear
      var pr = CH.price(S, mk, g), mu = pr / G[g].p, t = String(Math.round(pr)); c.font = F11; c.lineWidth = 3; c.strokeStyle = INK; c.strokeText(t, x, y); c.fillStyle = mu <= 0.75 ? '#7fe0c2' : mu >= 1.35 ? '#ff9a94' : WAX; c.fillText(t, x, y);
    }
    function tw(t, font) { var k = font + t, w = (st.tw || (st.tw = {}))[k]; if (w == null) { c.font = font; w = st.tw[k] = c.measureText(t).width; } return w; }
    var F12 = '700 12px "Alegreya Sans", system-ui, sans-serif', placed = [];
    function wide(n) { return z < 0.75 ? 10 : (27 + tw(per(n), F12)) / 2; }                 // half the width of a tag: a disc from afar, a disc and a number close up
    function made(g, n, x, y, ring, lw, a) {     // what a place makes and, close up, how many loads a year
      if (z < 0.75) { chip(x, y, 10, ring, lw, a); pic(g, x, y, 14); return; }
      var t = per(n), w = 27 + tw(t, F12);
      c.globalAlpha = a; c.beginPath(); rr(c, x - w / 2, y - 10, w, 20, 10); c.fillStyle = 'rgba(14,23,43,.9)'; c.fill(); c.lineWidth = lw; c.strokeStyle = ring; c.stroke();
      pic(g, x - w / 2 + 11, y, 14); c.font = F12; c.fillStyle = WAX; c.textAlign = 'left'; c.fillText(t, x - w / 2 + 20, y + 4.2); c.textAlign = 'center';
    }
    var TRY = [[0, 0], [0, -1], [1, 0], [-1, 0], [0, 1], [1, -1], [-1, -1], [0, -2], [1, 1], [-1, 1], [2, 0], [-2, 0], [0, -3]];
    function seat(x, y, hw, hh, loose) {       // a place for a tag at or near where it belongs, clear of the tags already put down; moved, it trails a thread back
      var k, j, q = null, x0, y0, ok;
      if (!loose) for (k = 0; k < TRY.length && !q; k++) {
        x0 = x + TRY[k][0] * (hw * 2 + 3) - hw; y0 = y + TRY[k][1] * (hh * 2 + 2) - hh; ok = true;
        for (j = 0; j < placed.length && ok; j++) if (x0 < placed[j][2] && x0 + hw * 2 > placed[j][0] && y0 < placed[j][3] && y0 + hh * 2 > placed[j][1]) ok = false;
        if (ok) q = [x0 + hw, y0 + hh];
      }
      if (!q) q = [x, y]; if (!loose) placed.push([q[0] - hw, q[1] - hh, q[0] + hw, q[1] + hh]);
      if (q[0] !== x || q[1] !== y) { c.globalAlpha = 0.65; c.strokeStyle = WAX; c.lineWidth = 1; c.beginPath(); c.moveTo(x, y + hh + 2); c.lineTo(q[0], q[1]); c.stroke(); c.globalAlpha = 1; }
      return q;
    }
    function keep(key, q) { var b = R.sprite(st, key); placed.push([q[0] + (b.bx / SS - b.ax) * z, q[1] + (b.by / SS - b.ay) * z, q[0] + ((b.bx + b.bw) / SS - b.ax) * z, q[1] + ((b.by + b.bh) / SS - b.ay) * z]); }   // no tag may sit on this picture
    keep('hq', sp(WD.hq.x, WD.hq.y));
    // markets first: their signs keep their place, and the smaller tags make room
    st.tag = st.tag || {}; var MT = [], F13 = '500 12.5px "Alegreya Sans", system-ui, sans-serif';
    if (z >= 0.3) for (i = 0; i < S.mk.length; i++) {
      m = S.mk[i]; p = sp(m.x, m.y); var top = p[1] - topOf('market' + m.sz) * z - 3; if (p[0] < -120 || top < -12 || p[0] > st.vw + 120 || top > st.vh + 110) continue;
      var rich = z >= 0.45 && !plain, tg = st.tag[m.id]; if (!tg || tg.t !== S.tick) tg = st.tag[m.id] = { t: S.tick, md: CH.view.mood(S, m), nd: CH.view.needs(S, m), ch: CH.view.trade(S, m).cheap };
      var k5 = Math.min(4, tg.ch.length), rowW = lens ? 78 : rich ? tg.nd.length * PIT + (k5 ? 11 + k5 * PIT : 0) : 0, nf = 'italic 600 ' + (z < 0.5 ? 14 : 16) + 'px Alegreya, Georgia, serif';
      var sub = rich ? m.pop + (m.pop === 1 ? ' house' : ' houses') + (tg.md.k > 0 ? ' ▲' : tg.md.k < 0 ? ' ▼' : '') : '', ny = top - 2 - (rowW ? 26 : 0) - (rich ? 14 : 0) - (close ? 12 : 0), hw = Math.max(rowW, tw(m.name, nf), sub ? tw(sub, F13) : 0) / 2 + 3;
      placed.push([p[0] - hw, ny - 14, p[0] + hw, top + 1]); keep('market' + m.sz, p); MT.push({ m: m, x: p[0], top: top, ny: ny, rich: rich, tg: tg, k5: k5, rowW: rowW, nf: nf, sub: sub, hw: hw });
    }
    if (tags || lens) {
      for (i = 0; i < WD.sites.length; i++) {
        var sd3 = WD.sites[i], df = D.sites[sd3.t]; if (!CH.live(S, df)) continue; hot = lens === df.g; if (!tags && !hot) continue;
        p = sp(sd3.x, sd3.y); if (!vis(p)) continue;
        var s3 = S.st[i]; n = wide(D.tpy / df.per); p = seat(p[0], p[1] - topOf('s_' + sd3.t) * z - 12, n + 1, 11, lens && !hot);
        made(df.g, D.tpy / df.per, p[0], p[1], hot ? GOLD : !s3.mk ? 'rgba(242,230,201,.4)' : s3.on ? GREEN : PALE, hot ? 2.6 : 1.6, lens && !hot ? 0.25 : s3.mk ? 1 : 0.62);
        mark(p[0] - n - 2, p[1] - 12, p[0] + n + 2, p[1] + 12, { k: 'site', i: i, x: sd3.x, y: sd3.y });
      }
      for (i = 0; i < S.bl.length; i++) {
        var b3 = S.bl[i], d3 = D.bld[b3.t]; if (d3.kind === 'depot') continue; p = sp(b3.x, b3.y); if (!vis(p)) continue; yy = p[1] - topOf('b_' + b3.t) * z - 12;
        if (d3.kind === 'works') {
          var lack = b3.st === 'wait' && G[b3.why] ? b3.why : null, g3 = lack || Object.keys(d3.out)[0], rate3 = d3.out[Object.keys(d3.out)[0]] * D.tpy / d3.time; hot = !!lens && !!(d3.inp[lens] || d3.out[lens]); if (!tags && !hot) continue;
          n = lack ? 10 : wide(rate3); p = seat(p[0], yy, n + 1, 11, lens && !hot);
          if (lack) { chip(p[0], p[1], 10, hot ? GOLD : DEAR, 2.4, lens && !hot ? 0.25 : 1); pic(g3, p[0], p[1], 14); c.fillStyle = DEAR; c.beginPath(); c.arc(p[0] + 9, p[1] - 8, 5.5, 0, 6.3); c.fill(); c.fillStyle = INK; c.font = '700 10px "Alegreya Sans", system-ui, sans-serif'; c.fillText('!', p[0] + 9, p[1] - 4.5); }
          else made(g3, rate3, p[0], p[1], hot ? GOLD : b3.st === 'run' ? GREEN : PALE, hot ? 2.4 : 1.6, lens && !hot ? 0.25 : b3.mk ? 1 : 0.5);
          mark(p[0] - n - 2, p[1] - 12, p[0] + n + 2, p[1] + 12, { k: 'bld', b: b3, x: b3.x, y: b3.y });
        } else {
          var ws3 = d3.want.filter(function (e) { return CH.live(S, e) && (tags || e.g === lens); }), m3 = b3.mk ? CH.mkt(S, b3.mk) : null; if (!ws3.length) continue;
          var pit = close && m3 ? 25 : 21, dn = close && m3 ? 12 : 0;
          p = seat(p[0], yy - dn / 2, ws3.length * pit / 2 + 1, 11 + dn / 2, lens && !ws3.some(function (e) { return e.g === lens; })); var x3 = p[0] - (ws3.length - 1) * pit / 2, y3 = p[1] - dn / 2;
          for (n = 0; n < ws3.length; n++) { hot = lens === ws3[n].g; chip(x3 + n * pit, y3, 9.5, hot ? GOLD : m3 && (m3.stock[ws3[n].g] || 0) >= 1 ? PALE : DEAR, hot ? 2.6 : 1.6, lens && !hot ? 0.25 : m3 ? 1 : 0.5); pic(ws3[n].g, x3 + n * pit, y3, 13); if (dn) { c.globalAlpha = 1; cost(m3, ws3[n].g, x3 + n * pit, y3 + 21); } }
          mark(x3 - 11, y3 - 11, x3 + (ws3.length - 1) * pit + 11, y3 + 11 + dn, { k: 'bld', b: b3, x: b3.x, y: b3.y });
        }
      }
      c.globalAlpha = 1;
    }
    // the market signs: the name, the houses and which way the town is going; then its needs and its spare goods, or the price of the good picked
    for (i = 0; i < MT.length; i++) {
      var e5 = MT[i]; m = e5.m; tg = e5.tg; var mx = e5.x; top = e5.top; ny = e5.ny;
      c.font = e5.nf; c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(m.name, mx, ny); c.fillStyle = sel && sel.k === 'mkt' && sel.id === m.id ? GOLD : WAX; c.fillText(m.name, mx, ny);
      mark(mx - e5.hw, ny - 14, mx + e5.hw, top + 1, { k: 'mkt', m: m, x: m.x, y: m.y });
      if (e5.sub) { c.font = F13; c.lineWidth = 3; c.strokeStyle = INK; c.strokeText(e5.sub, mx, ny + 15); c.fillStyle = tg.md.k > 0 ? '#9fe3cd' : tg.md.k < 0 ? DEAR : 'rgba(242,230,201,.92)'; c.fillText(e5.sub, mx, ny + 15); }
      if (lens) {
        var t5 = CH.tOf(CH.flows(S, m), lens), s5 = m.stock[lens] || 0, pr5 = CH.price(S, m, lens), mu = pr5 / G[lens].p, live5 = t5 || s5, py = top - 13;
        c.globalAlpha = live5 ? 1 : 0.55; c.fillStyle = !t5 ? 'rgba(14,23,43,.92)' : mu <= 0.75 ? '#12523f' : mu >= 1.35 ? '#7a2a2d' : 'rgba(14,23,43,.92)'; c.strokeStyle = !t5 ? 'rgba(242,230,201,.5)' : mu <= 0.75 ? GREEN : mu >= 1.35 ? DEAR : 'rgba(242,230,201,.75)'; c.lineWidth = 1.4;
        c.beginPath(); rr(c, mx - 39, py - 11, 78, 22, 11); c.fill(); c.stroke(); pic(lens, mx - 27, py, 15);
        c.font = '700 13px "Alegreya Sans", system-ui, sans-serif'; c.textAlign = 'left'; c.fillStyle = WAX; c.fillText(live5 ? String(Math.round(pr5)) : '–', mx - 16, py + 4.5);
        if (s5) { c.font = '500 11.5px "Alegreya Sans", system-ui, sans-serif'; c.fillStyle = 'rgba(242,230,201,.85)'; c.textAlign = 'right'; c.fillText('×' + s5, mx + 33, py + 4); }
        c.textAlign = 'center'; c.globalAlpha = 1;
      } else if (e5.rich) {
        var nd5 = tg.nd, x5 = mx - e5.rowW / 2 + PIT / 2, ry = top - 11 - (close ? 12 : 0);
        for (n = 0; n < nd5.length; n++) { var q5 = nd5[n]; chip(x5 + n * PIT, ry, 8.5, q5.sat >= (q5.food ? 0.75 : 0.6) ? GREEN : q5.sat >= 0.35 ? GOLD : DEAR, 2, 1); pic(q5.g, x5 + n * PIT, ry, 11); if (close) cost(m, q5.g, x5 + n * PIT, ry + 21); }
        x5 += nd5.length * PIT + 11;
        for (n = 0; n < e5.k5; n++) {        // spare goods: a square, with the small downward tick that marks a cheap price in the tables
          var qx = x5 + n * PIT; if (close) cost(m, tg.ch[n].g, qx, ry + 21); c.beginPath(); rr(c, qx - 8.5, ry - 8.5, 17, 17, 3.5); c.fillStyle = 'rgba(14,23,43,.9)'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = 'rgba(242,230,201,.55)'; c.stroke(); pic(tg.ch[n].g, qx, ry - 0.5, 11.5);
          c.fillStyle = GREEN; c.beginPath(); c.moveTo(qx + 3.5, ry + 6); c.lineTo(qx + 10.5, ry + 6); c.lineTo(qx + 7, ry + 11); c.closePath(); c.fill();
        }
      }
    }
    // merchants: what each is carrying, and a mark on any who is stuck or has nothing to do
    for (i = 0; i < S.ms.length; i++) {
      m = S.ms[i]; p = sp(MP[i][0], MP[i][1]); if (!vis(p)) continue; yy = p[1] - topOf('m_' + m.tr) * z - 13;
      var on2 = sm === m, gs5 = Object.keys(m.cargo), bad = m.st === 'stuck' || (m.st === 'wait' && m.w > 20) || !m.rt || (m.st === 'idle' && m.why === 'orders');
      if (tags && gs5.length) {
        var kk = Math.min(3, gs5.length), w5 = kk * 27 + 7; c.fillStyle = 'rgba(14,23,43,.9)'; c.strokeStyle = on2 ? GOLD : 'rgba(242,230,201,.6)'; c.lineWidth = on2 ? 1.8 : 1.1; c.beginPath(); rr(c, p[0] - w5 / 2, yy - 9.5, w5, 19, 9.5); c.fill(); c.stroke();
        c.font = '700 11.5px "Alegreya Sans", system-ui, sans-serif'; c.textAlign = 'left';
        for (n = 0; n < kk; n++) { var x6 = p[0] - w5 / 2 + 11 + n * 27; pic(gs5[n], x6, yy, 13); c.fillStyle = WAX; c.fillText(m.cargo[gs5[n]], x6 + 8, yy + 4); }
        c.textAlign = 'center'; mark(p[0] - w5 / 2, yy - 10, p[0] + w5 / 2, yy + 10, { k: 'm', m: m }); yy -= 19;
      } else if (tags && m.st === 'go') { c.globalAlpha = 0.85; c.strokeStyle = WAX; c.lineWidth = 1.3; c.setLineDash([2.5, 2.5]); c.beginPath(); c.arc(p[0], yy + 3, 5, 0, 6.3); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; yy -= 12; }   // walking with empty hands
      if (on2) { c.font = '700 13px "Alegreya Sans", system-ui, sans-serif'; c.lineWidth = 3.5; c.strokeStyle = INK; c.strokeText(m.nm, p[0], yy + 4); c.fillStyle = GOLD; c.fillText(m.nm, p[0], yy + 4); }
      else if (bad) { c.fillStyle = m.st === 'stuck' ? DEAR : WAX; c.beginPath(); c.arc(p[0], yy, 7, 0, 6.3); c.fill(); c.fillStyle = INK; c.font = '700 11px "Alegreya Sans", system-ui, sans-serif'; c.fillText(m.st === 'stuck' ? '!' : m.rt && m.why !== 'orders' ? '…' : '?', p[0], yy + 4); }
    }
    if (pv && pv.ghost && hv) { var gp = R.toScreen(st, cam, hv[0], hv[1]), gsr = spr(st, pv.ghost); c.globalAlpha = pv.ok ? 0.88 : 0.45; c.drawImage(gsr.c, gp[0] - gsr.ax * z, gp[1] - gsr.ay * z, gsr.w * z, gsr.h * z); c.globalAlpha = 1; }
  };

  /* ---------------- the small map ---------------- */
  var MS = 1.5;
  R.mini = function (st, S, ui, cv) {
    var mw = Math.ceil((W + H) * MS), mh = Math.ceil((W + H) * MS / 2) + 2, c, i, k = MS / st.P;
    if (!st.mb) { st.mb = mk(mw * 2, mh * 2); c = st.mb.getContext('2d'); c.setTransform(2 * k, k, -2 * k, k, 2 * H * MS, 0); c.imageSmoothingQuality = 'high'; c.drawImage(st.top, 0, 0); }
    if (cv.width !== mw * 2) { cv.width = mw * 2; cv.height = mh * 2; cv.style.width = mw + 'px'; cv.style.height = mh + 'px'; }
    c = cv.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0); c.clearRect(0, 0, mw, mh); c.drawImage(st.mb, 0, 0, mw, mh);
    function px(x, y) { return [(x - y + H) * MS, (x + y) * MS / 2 + MS / 2]; }
    c.fillStyle = 'rgba(226,210,160,.95)'; for (var key in S.path) { i = +key; var p = px(i % W, (i / W) | 0); c.fillRect(p[0] - 0.6, p[1] - 0.6, 1.4, 1.2); }
    S.mk.forEach(function (m) { var p = px(m.x, m.y); c.fillStyle = INK; c.fillRect(p[0] - 3, p[1] - 3, 6, 6); c.fillStyle = GOLD; c.fillRect(p[0] - 2, p[1] - 2, 4, 4); });
    c.fillStyle = WAX; S.ms.forEach(function (m) { var p = px(m.x, m.y); c.fillRect(p[0] - 1, p[1] - 1, 2.2, 2.2); });
    var cam = ui.cam, a = R.toTile(st, cam, 0, 0), b = R.toTile(st, cam, st.vw, st.vh), p0 = px(a[0], a[1]), p1 = px(b[0], b[1]);
    c.strokeStyle = WAX; c.lineWidth = 1; c.strokeRect(p0[0] + 0.5, p0[1] + 0.5, p1[0] - p0[0], p1[1] - p0[1]);
  };
  R.miniTile = function (mx, my) { var u = mx / MS - H, v = (my - MS / 2) * 2 / MS; return [(u + v) / 2, (v - u) / 2]; };
})(window);
