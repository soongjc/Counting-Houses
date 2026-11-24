// Cuts the game's sounds from their source recordings and writes assets/sounds/: one small mono MP3 per take,
// sounds.json (what the build embeds), credits.json (what the game's Credits screen shows) and CREDITS.md. recipe.js says where each recording comes from and how it is cut.
//
//   node tools/sounds/make.js            cut every sound; the sources must be in tools/sounds/cache/
//   node tools/sounds/make.js --fetch    download any missing source first
//   node tools/sounds/make.js coin moo   only these sounds (the others keep their files)
//
// Needs ffmpeg on the path. Changing a sound: edit its entry in recipe.js (or point it at another recording), run this, then node build.js.
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const R = require('./recipe.js'), HERE = __dirname, CACHE = path.join(HERE, 'cache'), OUT = path.join(HERE, '..', '..', 'assets', 'sounds'), SR = 44100;
const args = process.argv.slice(2), FETCH = args.includes('--fetch'), ONLY = args.filter(a => a[0] !== '-');
const REF = -15, CEIL = -1, LOOPRMS = -20;      // one-shots: the loudest 150 ms sits at REF dBFS; loops: the whole at LOOPRMS; nothing peaks above CEIL
const db = x => 20 * Math.log10(Math.max(x, 1e-9)), lin = d => Math.pow(10, d / 20);

const cacheOf = k => path.join(CACHE, k + path.extname(new URL(R.sources[k].url).pathname).toLowerCase());
async function need(k) {
  const f = cacheOf(k); if (fs.existsSync(f) && fs.statSync(f).size > 1000) return f;
  if (!FETCH) throw new Error('source "' + k + '" is missing: ' + f + '\n  run with --fetch, or download ' + R.sources[k].url);
  const r = await fetch(R.sources[k].url); if (!r.ok) throw new Error(r.status + ' for ' + R.sources[k].url);
  fs.mkdirSync(CACHE, { recursive: true }); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); console.log('fetched', k, fs.statSync(f).size, 'bytes');
  return f;
}
function decode(file, c) {                  // a stretch of a recording as mono samples
  const af = ['aresample=' + SR]; if (c.rate && c.rate !== 1) af.push('asetrate=' + Math.round(SR * c.rate), 'aresample=' + SR);
  if (c.hp) af.push('highpass=f=' + c.hp, 'highpass=f=' + c.hp); else af.push('highpass=f=40');      // a named high-pass is steep (two stages); otherwise only the rumble goes
  if (c.lp) af.push('lowpass=f=' + c.lp);
  const b = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', String(c.at || 0), '-t', String(c.len), '-i', file, '-af', af.join(','), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  return new Float32Array(b.buffer, b.byteOffset, b.length >> 2).slice();
}
function fade(a, fin, fout) {               // raised-cosine ends: no clicks
  const ni = Math.min(a.length >> 1, Math.round((fin == null ? 0.004 : fin) * SR)), no = Math.min(a.length >> 1, Math.round((fout == null ? 0.05 : fout) * SR));
  for (let i = 0; i < ni; i++) a[i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / ni);
  for (let i = 0; i < no; i++) a[a.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / no);
  return a;
}
const peakOf = a => { let p = 0; for (let i = 0; i < a.length; i++) { const v = Math.abs(a[i]); if (v > p) p = v; } return p; };
const rmsOf = (a, i0, i1) => { let s = 0; for (let i = i0; i < i1; i++) s += a[i] * a[i]; return Math.sqrt(s / Math.max(1, i1 - i0)); };
function loudest(a) { const w = Math.min(a.length, Math.round(0.15 * SR)), hop = Math.round(0.01 * SR); let m = 0; for (let i = 0; i + w <= a.length; i += hop) m = Math.max(m, rmsOf(a, i, i + w)); return m; }
async function take(t, loop) {
  let a;
  if (t.mix) {
    const parts = []; for (const c of t.mix) parts.push({ c, a: fade(decode(await need(c.from), c), c.in, c.out) });
    a = new Float32Array(Math.max(...parts.map(p => p.a.length + Math.round((p.c.delay || 0) * SR))));
    for (const p of parts) { const o = Math.round((p.c.delay || 0) * SR), g = (p.c.gain == null ? 1 : p.c.gain) / Math.max(1e-6, loudest(p.a)); for (let i = 0; i < p.a.length; i++) a[o + i] += p.a[i] * g; }      // parts matched in loudness, then their own gain
    fade(a, 0, t.out);
  } else a = decode(await need(t.from), t);
  if (loop) { fade(a, 0.002, 0.002); const g = Math.min(lin(LOOPRMS) / rmsOf(a, 0, a.length), lin(CEIL) / peakOf(a)); for (let i = 0; i < a.length; i++) a[i] *= g; }
  else { if (!t.mix) fade(a, t.in, t.out); const g = Math.min(lin(REF) / loudest(a), lin(CEIL) / peakOf(a)); for (let i = 0; i < a.length; i++) a[i] *= g; }
  return a;
}
function encode(a, file, loop) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-map_metadata', '-1', '-id3v2_version', '0', '-write_id3v1', '0', '-c:a', 'libmp3lame', '-q:a', loop ? '6' : '5', '-ar', loop ? '32000' : String(SR), file], { input: Buffer.from(a.buffer, a.byteOffset, a.byteLength) });
  if (r.status !== 0) throw new Error('ffmpeg: ' + r.stderr);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manFile = path.join(OUT, 'sounds.json'), old = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : {}, man = {}, rows = [];
  for (const s of R.sounds) {
    if (ONLY.length && !ONLY.includes(s.id)) { if (!old[s.id]) throw new Error(s.id + ' has no files yet: run without names first'); man[s.id] = Object.assign({}, old[s.id], { what: s.what, level: s.level }); if (s.loop) man[s.id].loop = s.loop; continue; }      // not recut: its level and loop still follow the recipe
    const m = man[s.id] = { what: s.what, level: s.level, files: [], secs: [] }; if (s.loop) m.loop = s.loop;
    for (let k = 0; k < s.takes.length; k++) {
      const a = await take(s.takes[k], s.loop), name = s.id + (s.takes.length > 1 ? '-' + (k + 1) : '') + '.mp3', file = path.join(OUT, name);
      encode(a, file, s.loop); m.files.push(name); m.secs.push(+(a.length / SR).toFixed(2));
      rows.push([name, (a.length / SR).toFixed(2), fs.statSync(file).size, db(peakOf(a)).toFixed(1), db(s.loop ? rmsOf(a, 0, a.length) : loudest(a)).toFixed(1)]);
    }
  }
  fs.writeFileSync(manFile, JSON.stringify(man, null, 1) + '\n');
  const keep = new Set(Object.values(man).flatMap(m => m.files)); for (const f of fs.readdirSync(OUT)) if (/\.mp3$/.test(f) && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
  // credits: every recording used, who made it, under which licence, and the sounds cut from it
  const used = {}; for (const s of R.sounds) for (const t of s.takes) for (const c of t.mix || [t]) (used[c.from] = used[c.from] || new Set()).add(s.id);
  const line = k => { const q = R.sources[k]; return '- ' + (q.pack ? q.pack + ': ' : '') + '"' + q.title + '" by ' + q.by + ', ' + q.lic + '. ' + q.page + ' (' + [...used[k]].join(', ') + ')'; };
  const keys = Object.keys(R.sources).filter(k => used[k]), by = lic => keys.filter(k => R.sources[k].lic === lic);
  fs.writeFileSync(path.join(OUT, 'CREDITS.md'), ['# Sound credits', '',
    'Every sound in the game is cut from a recording published under an open licence. Each one was trimmed, faded, levelled and encoded as MP3 by `tools/sounds/make.js`; `tools/sounds/recipe.js` holds the exact cuts and download addresses.', '',
    '## Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/)', '', 'These recordings require credit. Changes made: trimmed, faded, levelled, converted to mono MP3.', '', ...by('CC BY 4.0').map(line), '',
    '## Public domain, CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/)', '', 'No credit is required for these. Thank you to the people who recorded and shared them.', '', ...by('CC0 1.0').map(line), ''].join('\n'));
  // the same for the game's Credits screen: one entry per pack or recording
  const seen = {}, list = []; for (const k of keys) { const q = R.sources[k], id = q.pack || q.page; if (seen[id]) continue; seen[id] = 1; list.push({ title: q.pack || q.title, by: q.by, lic: q.lic, page: q.page }); }
  fs.writeFileSync(path.join(OUT, 'credits.json'), JSON.stringify(list.sort((a, b) => (a.lic === b.lic ? 0 : a.lic === 'CC BY 4.0' ? -1 : 1)), null, 1) + '\n');
  if (rows.length) { console.log('file'.padEnd(20) + 'secs   bytes   peak  loud'); rows.forEach(r => console.log(r[0].padEnd(20) + r[1].padStart(5) + String(r[2]).padStart(8) + r[3].padStart(7) + r[4].padStart(6))); }
  const all = [...keep].map(f => fs.statSync(path.join(OUT, f)).size), secs = Object.values(man).reduce((t, m) => t + m.secs.reduce((x, y) => x + y, 0), 0);
  console.log(Object.keys(man).length + ' sounds, ' + all.length + ' files, ' + secs.toFixed(0) + ' s, ' + Math.round(all.reduce((x, y) => x + y, 0) / 1024) + ' KB');
})().catch(e => { console.error(String(e.message || e)); process.exit(1); });
