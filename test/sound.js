// Checks on the game's sounds, which are recordings kept in assets/sounds/ and embedded in the page by the build.
// A browser plays them (node tools/shot.js sound checks that); this file checks what Node can see:
// that every sound the game asks for has its files, that each file is what the list says, that every recording
// has a source, an author and an open licence on record, and that the credits name them all.
//
//   node test/sound.js       the checks and a table
//   node test/sound.js -q    the checks and one line
const fs = require('fs'), path = require('path'), ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'assets', 'sounds'), QUIET = process.argv.includes('-q');
let bad = 0, n = 0;
const ok = (what, cond, detail) => { n++; if (!cond) { bad++; console.log('FAIL ' + what + (detail !== undefined ? ' [' + JSON.stringify(detail) + ']' : '')); } };

const man = JSON.parse(fs.readFileSync(path.join(DIR, 'sounds.json'), 'utf8')), R = require('../tools/sounds/recipe.js');
const credits = JSON.parse(fs.readFileSync(path.join(DIR, 'credits.json'), 'utf8')), creditsMd = fs.readFileSync(path.join(DIR, 'CREDITS.md'), 'utf8');

// 1. every sound the game asks for exists
const src = fs.readFileSync(path.join(ROOT, 'src', 'sound.js'), 'utf8'), ui = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8'), asked = new Set();
for (const m of (src + ui).matchAll(/(?:sfx|api\.play)\('([a-z]+)'/g)) asked.add(m[1]);
for (const m of src.matchAll(/api\.play\([^,]*\? '([a-z]+)' : '([a-z]+)'/g)) { asked.add(m[1]); asked.add(m[2]); }
const table = name => { const m = src.match(new RegExp('var ' + name + ' = \\{([^}]*)\\}')); ok('the ' + name + ' table is found', !!m); return m ? m[1] : ''; };
for (const m of table('NEWS').matchAll(/: '([a-z]+)'/g)) asked.add(m[1]);
for (const m of table('SPOT').matchAll(/\['([a-z]+)'/g)) asked.add(m[1]);
for (const m of table('BED').matchAll(/([a-z]+):/g)) asked.add(m[1]);
for (const m of table('TUNE').matchAll(/([a-z]+):/g)) asked.add(m[1]);
ok('the game asks for sounds', asked.size > 25, asked.size);
asked.forEach(id => ok('"' + id + '" is asked for and exists', !!man[id]));
Object.keys(man).forEach(id => ok('"' + id + '" exists and is asked for', asked.has(id)));

// 2. the files are what the list says
const rows = [], listed = new Set(); let total = 0;
for (const id in man) {
  const m = man[id];
  ok(id + ' has a level between 0 and 1', m.level > 0 && m.level <= 1, m.level);
  ok(id + ' has files', Array.isArray(m.files) && m.files.length > 0 && m.files.length === m.secs.length);
  m.files.forEach((f, k) => {
    listed.add(f); const p = path.join(DIR, f), there = fs.existsSync(p); ok(f + ' is there', there); if (!there) return;
    const b = fs.readFileSync(p); total += b.length;
    ok(f + ' is an MP3', b[0] === 0xff && (b[1] & 0xe0) === 0xe0, [b[0], b[1]]);
    ok(f + ' is a sensible size', b.length > 1500 && b.length < 130000, b.length);
    ok(f + ' has a sensible length', m.loop ? m.secs[k] >= 6 && m.secs[k] <= 30 : m.secs[k] >= 0.2 && m.secs[k] <= 8, m.secs[k]);
    ok(f + ' is about as large as its length says', b.length / m.secs[k] > 3000 && b.length / m.secs[k] < 20000, Math.round(b.length / m.secs[k]));
    rows.push([f, m.loop ? 'loop' : '', m.secs[k].toFixed(2), b.length, m.level]);
  });
  if (m.loop) ok(id + ' loops with a crossfade shorter than itself', m.loop > 0 && m.loop < m.secs[0] / 3, m.loop);
}
fs.readdirSync(DIR).filter(f => /\.mp3$/.test(f)).forEach(f => ok(f + ' is on the list', listed.has(f)));
ok('all sounds together stay under 1.4 MB', total < 1.4 * 1024 * 1024, total);

// 3. every recording has a source, an author and an open licence on record, and the recipe matches the list
const LICENCES = ['CC0 1.0', 'CC BY 4.0'], used = new Set();
ok('the recipe and the list name the same sounds', R.sounds.map(s => s.id).sort().join() === Object.keys(man).sort().join());
R.sounds.forEach(s => {
  const m = man[s.id] || { files: [] };
  ok(s.id + ': the list holds one file per take', m.files.length === s.takes.length, [m.files.length, s.takes.length]);
  ok(s.id + ': the list has the recipe\'s level', m.level === s.level, [m.level, s.level]);
  s.takes.forEach(t => (t.mix || [t]).forEach(c => { used.add(c.from); ok(s.id + ' is cut from a known recording', !!R.sources[c.from], c.from); ok(s.id + ' has a cut with a start and a length', c.at >= 0 && c.len > 0); }));
});
for (const k in R.sources) {
  const q = R.sources[k];
  ok(k + ' is used', used.has(k));
  ok(k + ' has a download address', /^https:\/\/(raw|media)\.githubusercontent\.com\//.test(q.url), q.url);
  ok(k + ' has a page, a title and an author', /^https:\/\//.test(q.page) && !!q.title && !!q.by);
  ok(k + ' has an open licence', LICENCES.includes(q.lic), q.lic);
  ok(k + ' is in CREDITS.md', creditsMd.includes(q.page) && creditsMd.includes(q.by));
  ok(k + ' is in the game\'s credits', credits.some(c => c.by === q.by && c.lic === q.lic && (c.page === q.page || c.title === q.pack)));
}
ok('CREDITS.md links both licences', creditsMd.includes('creativecommons.org/licenses/by/4.0') && creditsMd.includes('creativecommons.org/publicdomain/zero/1.0'));
ok('CREDITS.md says what was changed', /trimmed/.test(creditsMd));

// 4. the page holds them, and the player starts without a browser's sound system
const html = fs.existsSync(path.join(ROOT, 'index.html')) ? fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8') : '';
ok('index.html is built', html.length > 100000);
for (const id in man) { const b64 = fs.readFileSync(path.join(DIR, man[id].files[0])).toString('base64'); ok(id + ' is in the page', html.includes(b64.slice(0, 200)) && html.includes(b64.slice(-200))); }
ok('the page holds the credits', credits.every(c => html.includes(JSON.stringify(c.page).slice(1, -1))));
require('../src/world.js');
const data = {}; for (const id in man) data[id] = { level: man[id].level, loop: man[id].loop || 0, files: man[id].files.map(() => 'AAAA') };
globalThis.CH.sounddata = data; require('../src/sound.js'); const A = globalThis.CH.sound;
ok('the player knows every sound', A.names.sort().join() === Object.keys(man).sort().join());
ok('the player knows the loops', A.names.filter(A.isLoop).sort().join() === 'crowd,fire,forest,waves');
ok('the player counts the takes', A.versions('coin') === man.coin.files.length && A.versions('nothing') === 0);
let threw = ''; try { A.prepare(); A.wake(); A.play('coin'); A.event({ k: 'trade', sold: 50, net: 40, x: 1, y: 1 }, 0, 1); A.news('goal'); A.scene({ beds: { crowd: 1 }, spots: { ox: [0, 1] } }); A.set('master', 0.5); A.load({ fx: 0.3 }); A.sleep(); } catch (e) { threw = e.message; }
ok('without a browser the player stays silent and whole', threw === '', threw);
ok('levels are kept', A.levels().master === 0.5 && A.levels().fx === 0.3);

if (!QUIET) { console.log('file'.padEnd(18) + 'kind  secs   bytes  level'); rows.forEach(r => console.log(r[0].padEnd(18) + r[1].padEnd(6) + r[2].padStart(5) + String(r[3]).padStart(8) + String(r[4]).padStart(6))); }
console.log(n + ' checks, ' + bad + ' failed | ' + Object.keys(man).length + ' sounds in ' + listed.size + ' files, ' + Math.round(total / 1024) + ' KB, from ' + used.size + ' recordings');
process.exit(bad ? 1 : 0);
