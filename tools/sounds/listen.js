// Every sound of the game in one file, to listen through: each take in turn, group by group, with the time each group starts.
//
//   node tools/sounds/listen.js out.mp3
//
// Needs ffmpeg on the path. Loops play for eight seconds.
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');
const DIR = path.join(__dirname, '..', '..', 'assets', 'sounds'), man = JSON.parse(fs.readFileSync(path.join(DIR, 'sounds.json'), 'utf8')), out = process.argv[2], SR = 44100;
if (!out) { console.error('usage: node tools/sounds/listen.js out.mp3'); process.exit(1); }
const GROUPS = [['Ambience', ['crowd', 'waves', 'forest', 'fire']], ['Animals and transport', ['moo', 'cart', 'rooster', 'cluck', 'gull', 'bird', 'splash']], ['Workshops', ['hammer', 'pick', 'chop', 'saw']],
  ['Trades', ['coin', 'coins', 'register', 'buy']], ['Actions', ['build', 'path', 'hire', 'tick', 'deny']], ['News', ['start', 'pop', 'left', 'lesson', 'chime', 'warn', 'goal', 'milestone', 'over']]];
const missing = Object.keys(man).filter(id => !GROUPS.some(g => g[1].includes(id))); if (missing.length) { console.error('not in any group: ' + missing.join(', ')); process.exit(1); }
const pcm = (f, secs) => { const b = execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', path.join(DIR, f), ...(secs ? ['-t', String(secs)] : []), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 }); return new Float32Array(b.buffer, b.byteOffset, b.length >> 2).slice(); };
const parts = [], gap = s => parts.push(new Float32Array(Math.round(s * SR))), at = () => { const s = Math.round(parts.reduce((t, p) => t + p.length, 0) / SR); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
for (const [name, ids] of GROUPS) {
  console.log(at() + ' ' + name + ': ' + ids.map(id => id + (man[id].files.length > 1 ? ' x' + man[id].files.length : '')).join(', '));
  for (const id of ids) for (const f of man[id].files) {
    const a = pcm(f, man[id].loop ? 8 : 0), g = man[id].level * 2;      // each at the level the game gives it, doubled to fill the file
    for (let i = 0; i < a.length; i++) a[i] *= g * (man[id].loop ? Math.min(1, i / 4000, (a.length - i) / 12000) : 1);
    parts.push(a); gap(0.5);
  }
  gap(0.8);
}
const n = parts.reduce((t, p) => t + p.length, 0), all = new Float32Array(n); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-q:a', '4', out], { input: Buffer.from(all.buffer) });
if (r.status !== 0) { console.error(String(r.stderr)); process.exit(1); }
console.log('wrote ' + out + ', ' + Math.round(n / SR) + ' s');
