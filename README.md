# Counting House

A build-and-trade game set on the Malacca coast, 1400 to 1511. Build markets, grow towns, build workshops
and roads, and run merchants between markets: buy low, sell high. The game ends in 1511. Score: coins held.

## Play

Open `index.html` in a browser. That one file is the whole game: no server, no install, no build step.

- The title screen has Continue, New game, Load game, Records, How to play and Settings. A new game takes a
  company name and a difficulty: Easy, Normal or Hard set the starting coins, the market fee and the goal rewards.
- The game autosaves in the browser's local storage. Save game keeps up to ten more saves. Export moves a
  game to another device or browser as a file or as a code; Load game, Import reads it back.
- Records lists finished games, best first.
- Sound follows the map view: a market crowd where houses are, waves along the coast, birds over forest, and
  oxen, carts, roosters, gulls, hammers, axes and saws from whatever is in sight. Trades ring coins, a stop that
  earns twice the usual rings a cash register, and goals, lessons and town milestones have their own sounds.
  Settings has volume for ambience and effects; M turns sound on or off. Every sound is a recording under an open
  licence, embedded in the page; Credits on the title screen names them.
- Every market shows demand against supply for each good, with stock and price. Tap a good in a market for
  its price chart, or a good on a route for its profit chart. Thirteen lessons (surplus, arbitrage,
  opportunity cost and more) unlock as they happen in your game.
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
| `src/world.js` | The setting, as data: goods, sites, buildings, transport, research, events, and the map generator. Another setting is another world file. |
| `src/sim.js` | The engine: prices, towns, workshops, pathfinding, merchants. It has no DOM in it and runs in Node. |
| `src/learn.js` | The teaching: supply and demand charts, trade charts, and the lessons with the rules that unlock them. No DOM; runs in Node. |
| `src/sound.js` | Sound: decodes the embedded recordings, plays effects when things happen and mixes the ambience from what the view shows. |
| `assets/sounds/` | The recordings as small mono MP3s, `sounds.json` (the list the build embeds) and `CREDITS.md` (every recording, its author and licence). |
| `src/draw.js` | The map: painted ground, pictures drawn in code, tags, hit-testing. |
| `src/ui.js` | Title screen, panels, dialogs, input, saves, records, settings. |
| `src/style.css`, `src/index.template.html` | The look and the page skeleton. |

### Sounds

`assets/sounds/` holds the finished recordings and the build embeds them. `tools/sounds/recipe.js` names each source
recording (download address, author, licence) and each cut (start, length, fades, level).

```
node tools/sounds/make.js --fetch     # download the source recordings and cut every sound
node tools/sounds/make.js coin moo    # recut only these
node tools/sounds/listen.js all.mp3   # every sound in one file, to listen through
node build.js
```

To change a sound, edit its entry in the recipe: another cut, another `level`, or another recording. Use recordings
under CC0 or CC BY; `make.js` writes `CREDITS.md` and the game's Credits screen from the recipe. It needs ffmpeg.

## Test it

The engine tests run in Node:

```
npm test                      # all of the below, shortened
node test/first.js            # the first steps of a game
node test/shell.js            # difficulty, saves from older versions, the save round trip, the sound event queue
node test/sound.js            # the recordings: every sound the game asks for has its files, sources, licences and credits
node test/monkey.js 1 70      # random actions for 70 game years, with a save and reload (seed, years)
node test/bot.js 111 -q       # a scripted player through the whole game
node test/learn.js 60 -v      # every lesson and chart, checked against a scripted game (-v prints the lessons)
```

`test/bot.js` takes `--auto` to set every stop to auto orders and `--strict` to run manual orders in
exact-amounts mode. `test/bot.js` and `test/monkey.js` read `DIFF=easy` or `DIFF=hard` from the environment.

The browser checks drive the built page in headless Chrome by real clicks and taps, and save screenshots
to `shots/`. They need the font files and Playwright:

```
npm install
npm install --no-save playwright
npx playwright install chromium
node build.js
node tools/shot.js play       # also: basic, info, learn, market, small, mobile, mobile2, mobile3, mobile4, modals, soak, over, room, look
node tools/shot.js shell      # the title screen, new game, saves, export and import, records (mobile5: the same on a phone)
node tools/shot.js sound      # the sound engine: it starts on a click, decodes its recordings, and the ambience follows the view
node tools/shot.js sweep      # every panel and dialog read as text into shots/sweep.txt
node tools/csp.js             # the page under a strict content security policy, in a sandboxed frame
node tools/hosted.js          # the page inside Claude's artifact viewer (file export through the viewer) and sound start on a touch screen
node tools/badsave.js         # damaged saves and blocked storage
```

They drive the browser `CHROME` points at if it is set, else the system Chrome at `/usr/bin/google-chrome`
if there is one, else the Chromium that `npx playwright install chromium` downloads.
