// Assemble the single-file game from src/.
//
//   node build.js
//
// writes index.html: the whole game in one page, with its typefaces from Google Fonts. Open it in a browser; it
// needs no server. The build itself needs nothing but Node. The sounds in assets/sounds/ go into the page as base64
// (tools/sounds/make.js cuts them from their source recordings; the build only reads the finished files).
//
// It also fills dist/ (not kept in git): a copy of index.html, and preview.html, the same page with the typefaces
// embedded so the browser checks in tools/ can run offline. The preview needs the font files that `npm install`
// brings, and is skipped without them.
const fs = require('fs'), path = require('path');
const at = f => path.join(__dirname, f);
const src = f => fs.readFileSync(at('src/' + f), 'utf8');
const snd = JSON.parse(fs.readFileSync(at('assets/sounds/sounds.json'), 'utf8')), sounddata = {};
for (const id in snd) sounddata[id] = { level: snd[id].level, loop: snd[id].loop || 0, files: snd[id].files.map(f => fs.readFileSync(at('assets/sounds/' + f)).toString('base64')) };
const sounds = 'CH.sounddata = ' + JSON.stringify(sounddata) + ';\nCH.credits = ' + fs.readFileSync(at('assets/sounds/credits.json'), 'utf8').trim() + ';';
const js = [src('world.js'), src('sim.js'), src('learn.js'), sounds, src('sound.js'), src('draw.js'), src('ui.js')].join('\n').replace('__VERSION__', () => require('./package.json').version);
if (/<\/script/i.test(js)) throw new Error('script would be cut short by a closing tag inside the code');
const css = src('style.css');
const fontsLink = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n' +
  '<link href="https://fonts.googleapis.com/css2?family=Alegreya:ital,wght@0,400..900;1,400..900&family=Alegreya+Sans:wght@400;500;700&display=swap" rel="stylesheet">';
const page = fonts => src('index.template.html').replace('<!--FONTS-->', () => fonts).replace('/*CSS*/', () => css).replace('/*JS*/', () => js);
const kb = f => (fs.statSync(at(f)).size / 1024).toFixed(0) + ' KB';

fs.writeFileSync(at('index.html'), page(fontsLink));
fs.mkdirSync(at('dist'), { recursive: true });
fs.copyFileSync(at('index.html'), at('dist/index.html'));

// the preview, with the typefaces embedded
const face = (fam, pkg, file, weight, style) => {
  const p = at(path.join('node_modules/@fontsource', pkg, 'files', file));
  return `@font-face{font-family:"${fam}";font-weight:${weight};font-style:${style};src:url(data:font/woff2;base64,${fs.readFileSync(p).toString('base64')}) format("woff2");}`;
};
let preview = '';
try {
  let faces = '';
  for (const w of [400, 500, 600, 700, 800, 900]) for (const st of ['normal', 'italic']) faces += face('Alegreya', 'alegreya', `alegreya-latin-${w}-${st}.woff2`, w, st);
  for (const w of [400, 500, 700]) faces += face('Alegreya Sans', 'alegreya-sans', `alegreya-sans-latin-${w}-normal.woff2`, w, 'normal');
  fs.writeFileSync(at('dist/preview.html'), page('<style>' + faces + '</style>'));
  preview = 'dist/preview.html ' + kb('dist/preview.html');
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
  preview = 'no dist/preview.html: run npm install for the font files it embeds';
}
console.log('index.html', kb('index.html'), '|', preview);
