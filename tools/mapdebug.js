// Top-down picture of the generated terrain with sites and places, plus what a market at each named place would cover.
const path = require('path');
require(path.join(__dirname, '../src/world.js'));
const CH = globalThis.CH, D = CH.DEF, Wd = CH.genWorld(), { W, H, T } = Wd;
const S = 12;
const col = { 0: '#16254a', 1: '#7fb0e8', 2: '#8da066', 3: '#3f6d4c', 4: '#8c7a55', 5: '#5d5248' };
const sc = { cotton: '#ff9ad5', paddy: '#7fd08a', fishery: '#9fe0f5', saltpan: '#ffffff', timber: '#1f3d2a', clay: '#c06a3a', mine: '#222', goldpit: '#ffd24a', pepper: '#b6f07a', resin: '#e0a020' };
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W * S}" height="${H * S}">`;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) svg += `<rect x="${x * S}" y="${y * S}" width="${S}" height="${S}" fill="${Wd.terr[y * W + x] === 1 && Wd.nav[y * W + x] ? '#2c5a96' : col[Wd.terr[y * W + x]]}"/>`;
for (const s of Wd.sites) svg += `<rect x="${s.x * S + 2}" y="${s.y * S + 2}" width="${S - 4}" height="${S - 4}" fill="${sc[s.t]}" stroke="#000" stroke-width=".6"/>`;
for (const f of Wd.fixed) svg += `<circle cx="${f.x * S + S / 2}" cy="${f.y * S + S / 2}" r="5" fill="#f2b632" stroke="#000"/><text x="${f.x * S + 9}" y="${f.y * S + 2}" font-size="9" fill="#fff">${f.t}</text>`;
for (const h of Wd.houses) svg += `<rect x="${h[0] * S + 3}" y="${h[1] * S + 3}" width="${S - 6}" height="${S - 6}" fill="#f2e6c9"/>`;
svg += `<rect x="${Wd.hq.x * S}" y="${Wd.hq.y * S}" width="${S}" height="${S}" fill="#e0527a" stroke="#fff"/>`;
for (const p of D.places) svg += `<circle cx="${p.x * S + S / 2}" cy="${p.y * S + S / 2}" r="${5 * S}" fill="none" stroke="#fff" stroke-dasharray="3 3" opacity=".5"/><text x="${p.x * S + 8}" y="${p.y * S + 16}" font-size="12" font-weight="bold" fill="#fff" stroke="#000" stroke-width=".4">${p.n}</text>`;
svg += '</svg>';
const count = {}; for (let i = 0; i < W * H; i++) count[Wd.terr[i]] = (count[Wd.terr[i]] || 0) + 1;
console.log('terrain tiles:', Object.entries(T).map(([k, v]) => k + ' ' + (count[v] || 0)).join(', '));
console.log('sites placed:', Wd.sites.length, 'of planned', Object.entries(Wd.sites.reduce((a, s) => (a[s.t] = (a[s.t] || 0) + 1, a), {})).map(e => e.join(' ')).join(', '));
for (const p of D.places) {
  for (const r of [3, 5]) {
    const c = {}; Wd.sites.forEach(s => { if ((s.x - p.x) ** 2 + (s.y - p.y) ** 2 <= r * r + r) c[s.t] = (c[s.t] || 0) + 1; });
    const hs = Wd.houses.filter(h => Math.hypot(h[0] - p.x, h[1] - p.y) <= r).length, fx = Wd.fixed.filter(f => Math.hypot(f.x - p.x, f.y - p.y) <= r).map(f => f.t);
    if (r === 5) console.log(p.n.padEnd(15), 'r5:', (Object.entries(c).map(e => e[1] + ' ' + e[0]).join(', ') || '-').padEnd(52), 'houses', hs, fx.join(','));
  }
}
console.log('hq', Wd.hq, 'fixed', JSON.stringify(Wd.fixed));
require('sharp')(Buffer.from(svg)).png().toFile(path.join(__dirname, '../shots/map.png')).then(() => console.log('wrote shots/map.png'));
