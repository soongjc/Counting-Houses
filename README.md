# Counting House

A build-and-trade game set on the Malacca coast, 1400 to 1511. You keep a merchant house: found markets,
grow the towns around them, build workshops and roads, and send merchants between markets to buy where a
good is cheap and sell where it is dear. The books close in 1511, and your rank is the coin you hold then.

## Play

Open `index.html` in a browser. That one file is the whole game: no server, no install, no build step.

- The game saves itself in the browser's local storage, so it stays on the device and browser you play on.
- The only thing it asks the network for is two typefaces from Google Fonts. Without them it falls back to
  the system's fonts and plays the same.

To put it online, any static host will do. With GitHub Pages: in the repository's Settings, under Pages,
deploy from the `main` branch, folder `/ (root)`.

## Change it

```
node build.js
```

assembles `index.html` from `src/`. It needs Node and nothing else.

| File | What it holds |
| --- | --- |
| `src/world.js` | The setting, as data: goods, sites, buildings, transport, advances, events, and the map generator. Another setting is another world file. |
| `src/sim.js` | The engine: prices, towns, workshops, pathfinding, merchants. It has no DOM in it and runs in Node. |
| `src/draw.js` | The map: painted ground, pictures drawn in code, tags, hit-testing. |
| `src/ui.js` | Panels, dialogs, input, saving. |
| `src/style.css`, `src/index.template.html` | The look and the page skeleton. |

## Test it

The engine tests run in Node:

```
npm test                      # the three below, shortened
node test/first.js            # the first steps of a game
node test/monkey.js 1 70      # random actions for 70 game years, with a save and reload (seed, years)
node test/bot.js 111 -q       # a scripted player through the whole game
```

`test/bot.js` takes `--auto` to leave every merchant to his own judgment and `--strict` to have written
orders followed to the letter.

The browser checks drive the built page in headless Chrome by real clicks and taps, and save screenshots
to `shots/`. They need the font files and Playwright:

```
npm install
npm install --no-save playwright
npx playwright install chromium
node build.js
node tools/shot.js play       # also: basic, info, mobile, mobile2, modals, soak, over, room, look
node tools/csp.js             # the page under a strict content security policy, in a sandboxed frame
node tools/badsave.js         # damaged saves and blocked storage
```

They drive the browser `CHROME` points at if it is set, else the system Chrome at `/usr/bin/google-chrome`
if there is one, else the Chromium that `npx playwright install chromium` downloads.
