/* Counting House — the world: what exists and what things cost.
   Everything specific to a setting is in this file (goods, sites, buildings, transporters, advances,
   the terrain and what stands on it at the start). The engine and interface read it and nothing else,
   so another setting is another world file. */
(function (root) {
  'use strict';
  var CH = root.CH = root.CH || {};

  var W = 72, H = 56;
  var T = { SEA: 0, RIVER: 1, GRASS: 2, FOREST: 3, HILL: 4, MOUNT: 5 };

  /* p = base price in coins for one load */
  var GOODS = {
    rice:    { n: 'Rice',           p: 10,  c: '#e9e2bd' },
    fish:    { n: 'Fresh fish',     p: 8,   c: '#8fc6d8' },
    dfish:   { n: 'Dried fish',     p: 16,  c: '#5f9fb8' },
    salt:    { n: 'Salt',           p: 12,  c: '#eef2f4' },
    cloth:   { n: 'Cloth',          p: 32,  c: '#e3a56e' },
    pottery: { n: 'Pottery',        p: 22,  c: '#d9835a' },
    timber:  { n: 'Timber',         p: 10,  c: '#a97f52' },
    clay:    { n: 'Clay',           p: 6,   c: '#b56f4c' },
    cotton:  { n: 'Cotton',         p: 14,  c: '#ffffff' },
    ore:     { n: 'Tin ore',        p: 20,  c: '#8d93a0' },
    tin:     { n: 'Tin ingots',     p: 64,  c: '#c9d2da' },
    pepper:  { n: 'Pepper',         p: 30,  c: '#7c8a5c' },
    resin:   { n: 'Resin',          p: 24,  c: '#d0a332' },
    gold:    { n: 'Gold dust',      p: 70,  c: '#f2c744' },
    furn:    { n: 'Furniture',      p: 44,  c: '#c79a68' },
    porc:    { n: 'Porcelain',      p: 80,  c: '#9cc0f0' },
    batik:   { n: 'Batik',          p: 110, c: '#cf6a3c' },
    orn:     { n: 'Gold ornaments', p: 220, c: '#ffd76a' }
  };

  /* Sites are part of the land: they cannot be built or moved. A site works only when a market's reach
     covers it, makes one load every `per` ticks, and stops while its good sells at the floor price. */
  var SITES = {
    paddy:   { n: 'Rice paddy',     pl: 'rice paddies',   g: 'rice',   per: 24 },
    fishery: { n: 'Fishing weir',   pl: 'fishing weirs',  g: 'fish',   per: 15 },
    saltpan: { n: 'Salt pan',       pl: 'salt pans',      g: 'salt',   per: 15 },
    timber:  { n: 'Timber camp',    pl: 'timber camps',   g: 'timber', per: 50 },
    clay:    { n: 'Clay pit',       pl: 'clay pits',      g: 'clay',   per: 12 },
    mine:    { n: 'Tin mine',       pl: 'tin mines',      g: 'ore',    per: 25 },
    goldpit: { n: 'Gold field',     pl: 'gold fields',    g: 'gold',   per: 150 },
    pepper:  { n: 'Pepper garden',  pl: 'pepper gardens', g: 'pepper', per: 80 },
    resin:   { n: 'Resin grove',    pl: 'resin groves',   g: 'resin',  per: 150 },
    cotton:  { n: 'Cotton field',   pl: 'cotton fields',  g: 'cotton', per: 30, from: 'cotton' }
  };

  /* What every house buys. per = ticks between purchases for one house. Food must be on the shelves for a
     town to grow; one of the other goods may be missing. `from`/`until` name a flag set by an event.
     `sub` is what the house will make do with when the good itself is not to be had. */
  var HOUSE = [
    { g: 'rice',    per: 300,  food: 1 },
    { g: 'fish',    per: 400,  food: 1, until: 'dried' },
    { g: 'dfish',   per: 400,  food: 1, from: 'dried', sub: 'fish' },
    { g: 'salt',    per: 1200 },
    { g: 'cloth',   per: 1200 },
    { g: 'pottery', per: 1200 }
  ];

  var SIZES = [
    { n: 'Trading post', r: 3, cost: 200 },
    { n: 'Market',       r: 5, cost: 400 },
    { n: 'Bazaar',       r: 7, cost: 900,  adv: 'bazaar' },
    { n: 'Emporium',     r: 9, cost: 1800, adv: 'empor' }
  ];

  /* works: turn loads into other loads. demand: buy goods for good and keep asking until served.
     depot: lets a better transporter use the market. `fixed` buildings stand on the map from the start. */
  var BLD = {
    potter:    { n: 'Potter',           kind: 'works', inp: { clay: 2 },            out: { pottery: 1 }, time: 24,  cost: 350,
                 d: 'Makes pottery from clay.' },
    carpenter: { n: 'Carpenter',        kind: 'works', inp: { timber: 2 },          out: { furn: 1 },    time: 60,  cost: 400,
                 d: 'Makes furniture from timber.' },
    smelter:   { n: 'Tin smelter',      kind: 'works', inp: { ore: 2, timber: 1 },  out: { tin: 1 },     time: 20,  cost: 700, adv: 'smelt',
                 d: 'Makes tin ingots from tin ore and timber.' },
    curing:    { n: 'Fish-curing shed', kind: 'works', inp: { fish: 4, salt: 1 },   out: { dfish: 4 },   time: 30,  cost: 350, adv: 'curing',
                 d: 'Makes dried fish from fresh fish and salt.' },
    weaver:    { n: 'Weaver',           kind: 'works', inp: { cotton: 2 },          out: { cloth: 1 },   time: 30,  cost: 500, adv: 'loom',
                 d: 'Makes cloth from cotton.' },
    goldsmith: { n: 'Goldsmith',        kind: 'works', inp: { gold: 2 },            out: { orn: 1 },     time: 150, cost: 900, adv: 'gold',
                 d: 'Makes gold ornaments from gold dust.' },
    batikw:    { n: 'Batik workshop',   kind: 'works', inp: { cloth: 2, resin: 1 }, out: { batik: 1 },   time: 120, cost: 800, adv: 'batik',
                 d: 'Makes batik from cloth and resin.' },
    istana:    { n: 'Istana',           kind: 'demand', fixed: 1,
                 want: [{ g: 'furn', per: 150 }, { g: 'pepper', per: 300 }, { g: 'porc', per: 400 }, { g: 'orn', per: 300, from: 'ornaments' }, { g: 'batik', per: 320, from: 'batikcourt' }],
                 d: 'The Sultan\'s palace. Buys luxury goods all year.' },
    quarter:   { n: 'Foreign quarter',  kind: 'demand', fixed: 1,
                 want: [{ g: 'ore', per: 12, until: 'ingots' }, { g: 'tin', per: 20, from: 'ingots' }, { g: 'pepper', per: 30 }, { g: 'gold', per: 120 }],
                 land: [{ g: 'cloth', per: 100, cap: 8 }, { g: 'porc', per: 300, cap: 4 }],
                 d: 'Foreign ships trade here. Buys tin, pepper and gold dust. Each load bought adds 1 cloth to the market. Every 4th load adds 1 porcelain.' },
    balai:     { n: 'Balai',            kind: 'demand', cost: 800,
                 want: [{ g: 'furn', per: 260 }, { g: 'cloth', per: 240 }, { g: 'pepper', per: 320 }],
                 d: 'A chief\'s hall. Buys furniture, cloth and pepper.' },
    mosque:    { n: 'Mosque',           kind: 'demand', cost: 900, adv: 'mosque',
                 want: [{ g: 'resin', per: 250 }, { g: 'pottery', per: 300 }, { g: 'furn', per: 500 }],
                 d: 'Buys resin, pottery and furniture.' },
    shipyard:  { n: 'Shipyard',         kind: 'demand', cost: 1000, adv: 'ship', water: 1,
                 want: [{ g: 'timber', per: 30 }, { g: 'resin', per: 200 }],
                 d: 'Buys timber and resin. Build next to water.' },
    stockade:  { n: 'Stockade',         kind: 'demand', cost: 800, adv: 'garrison',
                 want: [{ g: 'rice', per: 30 }, { g: 'dfish', per: 45 }, { g: 'tin', per: 150 }],
                 d: 'Buys rice, dried fish and tin ingots.' },
    caravan:   { n: 'Caravansary',      kind: 'depot', cost: 300, adv: 'cart',
                 d: 'Lets ox carts stop at this market.' },
    harbour:   { n: 'Harbour',          kind: 'depot', cost: 250, adv: 'boat', water: 1,
                 d: 'Lets boats stop at this market. Build on the sea or the lower river.' }
  };

  /* spd = tiles per tick on a trail (land) or open water. */
  var TRANS = {
    porter: { n: 'Porters',   mode: 'land',  cls: 'foot',  cap: 4,  spd: 0.36, cost: 0,    keep: 0,
              d: 'Capacity 4. Upkeep 0. Walks anywhere on land. Double speed on trails.' },
    eleph:  { n: 'Elephants', mode: 'land',  cls: 'eleph', cap: 8,  spd: 0.36, cost: 500,  keep: 24, adv: 'eleph',
              d: 'Capacity 8. Upkeep 24 a year. Fast through forest and hills.' },
    cart:   { n: 'Ox carts',  mode: 'land',  cls: 'cart',  cap: 14, spd: 0.48, cost: 450,  keep: 14, adv: 'cart', depot: 'caravan',
              d: 'Capacity 14. Upkeep 14 a year. Travels on roads between markets with a caravansary.' },
    sampan: { n: 'Sampan',    mode: 'water', cls: 'boat',  cap: 10, spd: 0.55, cost: 350,  keep: 10, adv: 'boat', depot: 'harbour',
              d: 'Capacity 10. Upkeep 10 a year. Sails the coast and lower rivers between harbours.' },
    junk:   { n: 'Junk',      mode: 'water', cls: 'deep',  cap: 24, spd: 0.70, cost: 1500, keep: 36, adv: 'ship', depot: 'harbour',
              d: 'Capacity 24. Upkeep 36 a year. Sails the sea between sea harbours.' }
  };

  var ADV = {
    boat:     { n: 'Boatbuilding',      y: 1400, cost: 500,  d: 'Unlocks harbours and sampans: capacity 10, sea and lower rivers.' },
    eleph:    { n: 'Elephant handling', y: 1403, cost: 600,  d: 'Unlocks elephants: capacity 8, fast through forest and hills.' },
    cart:     { n: 'Road building',     y: 1406, cost: 900,  d: 'Unlocks roads, caravansaries and ox carts: capacity 14.' },
    smelt:    { n: 'Tin smelting',      y: 1408, cost: 1000, d: 'Unlocks tin smelters. Tin ingots sell for 3 times the price of tin ore. The foreign quarter switches to ingots in 1416.' },
    bazaar:   { n: 'Bazaar charter',    y: 1410, cost: 1200, d: 'Unlocks the bazaar: market range 7.' },
    curing:   { n: 'Fish curing',       y: 1413, cost: 800,  d: 'Unlocks fish-curing sheds. Households switch from fresh fish to dried fish in 1425.' },
    gold:     { n: 'Goldsmithing',      y: 1418, cost: 1600, d: 'Unlocks goldsmiths. The Istana buys gold ornaments from 1420.' },
    ship:     { n: 'Shipbuilding',      y: 1424, cost: 2200, d: 'Unlocks junks (capacity 24, sea) and shipyards, which buy timber and resin.' },
    loom:     { n: 'Weaving',           y: 1430, cost: 1400, d: 'Unlocks weavers, which make cloth from cotton.' },
    mosque:   { n: 'Mosque building',   y: 1433, cost: 1000, d: 'Unlocks mosques, which buy resin, pottery and furniture.' },
    batik:    { n: 'Batik making',      y: 1440, cost: 2000, d: 'Unlocks batik workshops. The Istana buys batik from 1444.' },
    empor:    { n: 'Emporium charter',  y: 1455, cost: 3500, d: 'Unlocks the emporium: market range 9.' },
    garrison: { n: 'Fortification',     y: 1470, cost: 1500, d: 'Unlocks stockades, which buy rice, dried fish and tin ingots.' }
  };

  /* Things that happen whether or not anyone buys an advance. `warn` is announced `lead` years ahead. */
  var EVENTS = [
    { y: 1416, flag: 'ingots', lead: 4, warn: 'Demand change in 4 years: the foreign quarter switches from tin ore to tin ingots.',
      t: 'Demand changed: the foreign quarter now buys tin ingots. Its tin ore demand has ended.' },
    { y: 1420, flag: 'ornaments', t: 'New demand: the Istana buys gold ornaments.' },
    { y: 1425, flag: 'dried', lead: 5, warn: 'Demand change in 5 years: households switch from fresh fish to dried fish.',
      t: 'Demand changed: households now buy dried fish. They eat fresh fish while dried fish is out of stock.' },
    { y: 1428, flag: 'cotton', t: 'New resource: cotton fields at Tampin and Kesang.' },
    { y: 1444, flag: 'batikcourt', t: 'New demand: the Istana buys batik.' }
  ];

  var PLACES = [
    { n: 'Malacca', x: 23, y: 28 }, { n: 'Naning', x: 37, y: 19 }, { n: 'Linggi', x: 14, y: 9 }, { n: 'Sungai Ujong', x: 51, y: 9 },
    { n: 'Jasin', x: 44, y: 30 }, { n: 'Muar', x: 38, y: 50 }, { n: 'Ledang', x: 55, y: 43 }, { n: 'Alor Gajah', x: 28, y: 15 },
    { n: 'Merlimau', x: 29, y: 39 }, { n: 'Tampin', x: 44, y: 13 }, { n: 'Kesang', x: 46, y: 40 }, { n: 'Durian Tunggal', x: 33, y: 26 },
    { n: 'Tanjung Tuan', x: 6, y: 11 }, { n: 'Rembau', x: 34, y: 7 }, { n: 'Selandar', x: 52, y: 22 }, { n: 'Bukit Gemuruh', x: 62, y: 33 }
  ];
  var SPARE = ['Kampung Hulu', 'Kampung Hilir', 'Kampung Baru', 'Paya Rumput', 'Bukit Baru', 'Ayer Molek', 'Sungai Putat', 'Padang Temu', 'Kuala Sungai', 'Batu Berendam', 'Bukit Katil', 'Ayer Keroh'];

  var ABIL = {
    trail:  { n: 'Pathfinder',      d: '+33% speed on trails and open ground.' },
    sell:   { n: 'Negotiator',      d: 'Market fee on sales: 0%.' },
    buy:    { n: 'Haggler',         d: 'Market fee on purchases: 0%.' },
    load:   { n: 'Strong',          d: '+25% capacity.' },
    thrift: { n: 'Thrifty',         d: 'Wage: 0.' },
    sea:    { n: 'Sailor',          d: '+25% speed by boat.' }
  };
  var NAMES = ['Ali', 'Daud', 'Lim Kee', 'Ravi', 'Ismail', 'Tan Beng', 'Yusof', 'Muthu', 'Hamzah', 'Ong Seng', 'Karim', 'Chew Hock', 'Salleh', 'Wira',
    'Idris', 'Koh Lian', 'Jaya', 'Musa', 'Chandran', 'Adi', 'Rahim', 'Goh Tiam', 'Surya', 'Latif', 'Bakar', 'Teo Huat', 'Arif', 'Zain', 'Gopal',
    'Samad', 'Osman', 'Budi', 'Khalid', 'Yap Soon', 'Tahir', 'Low Chin', 'Amin', 'Putra', 'Nair', 'Jalil'];

  var RANKS = [[0, 'Pedlar'], [10000, 'Stallholder'], [30000, 'Trader of the bazaar'], [75000, 'Saudagar'], [150000, 'Orang kaya'], [300000, 'Merchant prince']];

  var GOALS = [
    { id: 'market', t: 'Build a market at the river mouth',              r: 0,   h: 'Open Build, select Market and place it. Cover the houses, the rice paddies and the foreign quarter with its range.' },
    { id: 'trip',   t: 'Complete a trip on a trade route',               r: 100, h: 'Build a second market at Naning, up the river: it has pepper and rice. Connect the two markets with a trail, hire a merchant and select both markets as stops. Orders start on auto.' },
    { id: 'h10',    t: 'Grow a town to 10 houses',                       r: 150, h: 'Towns grow while rice and fish are in stock, plus 2 of salt, cloth and pottery. A potter makes pottery from clay. Salt pans are at Merlimau.' },
    { id: 'adv',    t: 'Research a technology',                          r: 200, h: 'Open Research. Boatbuilding is available from the start.' },
    { id: 'works',  t: 'Build or buy a workshop',                        r: 200, h: 'A potter near a clay pit makes pottery. Every house buys pottery.' },
    { id: 'tin20',  t: 'Sell 20 loads of tin ore or tin ingots at the foreign quarter', r: 400, h: 'Tin mines are in the hills at Sungai Ujong. The foreign quarter at Malacca is the buyer.' },
    { id: 'road',   t: 'Complete a trip by ox cart',                     r: 400, h: 'Requires Road building research, a road, and a caravansary at each stop.' },
    { id: 'h40',    t: 'Grow a town to 40 houses',                       r: 800 },
    { id: 'orn',    t: 'Deliver gold ornaments to the Istana',           r: 800, h: 'Gold fields are at Ledang. A goldsmith makes ornaments from gold dust. The Istana buys them from 1420.' },
    { id: 'c50',    t: 'Reach 50,000 coins',                              r: 0 },
    { id: 'h100',   t: 'Grow a town to 100 houses',                      r: 2000 }
  ];

  /* ---------------- terrain ---------------- */
  function hash2(x, y, s) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 2147483647)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, s) { return 0.55 * vnoise(x / 9, y / 9, s) + 0.3 * vnoise(x / 4.3, y / 4.3, s + 7) + 0.15 * vnoise(x / 2, y / 2, s + 13); }
  CH.hash2 = hash2;

  /* each river runs from its source to the sea; boats can use the last NAVLEN tiles before the mouth */
  var RIVERS = [
    [[70, 4], [62, 8], [55, 12], [48, 15], [42, 19], [35, 22], [29, 25], [24, 29], [19, 30]],          // the Malacca river
    [[44, 0], [36, 3], [27, 5], [20, 8], [13, 10], [7, 10]],                                             // the Linggi
    [[71, 30], [63, 35], [54, 38], [47, 44], [42, 50], [37, 53], [31, 55]]                               // the Muar
  ];
  var NAVLEN = [24, 13, 22];
  /* where sites are wanted; each settles on the nearest tile of the right kind */
  var SITEPLAN = [
    ['paddy', 25, 25], ['fishery', 18, 28], ['clay', 27, 29],
    ['paddy', 36, 18], ['paddy', 38, 17], ['paddy', 39, 20], ['paddy', 35, 20], ['pepper', 40, 22], ['pepper', 41, 18],
    ['fishery', 9, 8], ['fishery', 10, 12], ['fishery', 7, 13], ['paddy', 15, 7], ['paddy', 17, 9], ['clay', 16, 11], ['timber', 20, 12],
    ['mine', 51, 8], ['mine', 53, 10], ['mine', 50, 11], ['mine', 54, 7],
    ['timber', 44, 28], ['timber', 46, 31], ['timber', 42, 31], ['resin', 47, 28], ['resin', 45, 33],
    ['paddy', 39, 48], ['paddy', 41, 50], ['paddy', 38, 46], ['fishery', 33, 52], ['fishery', 31, 51], ['saltpan', 31, 48], ['saltpan', 33, 50], ['clay', 41, 52], ['pepper', 43, 47],
    ['goldpit', 54, 43], ['goldpit', 56, 41], ['timber', 52, 45], ['resin', 57, 44],
    ['paddy', 29, 14], ['paddy', 27, 16], ['pepper', 30, 17], ['clay', 31, 13],
    ['fishery', 24, 38], ['fishery', 25, 41], ['saltpan', 27, 38], ['saltpan', 28, 41], ['saltpan', 26, 36], ['paddy', 30, 40], ['timber', 33, 37],
    ['paddy', 51, 21], ['paddy', 53, 23], ['pepper', 50, 24], ['timber', 54, 20],
    ['paddy', 33, 6], ['paddy', 35, 8], ['timber', 32, 9],
    ['paddy', 32, 27], ['paddy', 31, 24], ['paddy', 34, 28], ['timber', 35, 26],
    ['mine', 61, 32], ['mine', 63, 34], ['resin', 60, 35],
    ['cotton', 43, 12], ['cotton', 45, 14], ['cotton', 46, 11], ['cotton', 45, 39], ['cotton', 47, 41], ['cotton', 44, 42]
  ];

  CH.genWorld = function () {
    if (CH._world) return CH._world;
    var terr = new Uint8Array(W * H), elev = new Float32Array(W * H), shade = new Float32Array(W * H), nav = new Uint8Array(W * H), x, y, i, k;
    function I(x, y) { return y * W + x; }
    function inb(x, y) { return x >= 0 && y >= 0 && x < W && y < H; }
    function coast(y) { return 6 + 0.52 * y + 2.6 * Math.sin(y / 5.5) + 1.4 * Math.sin(y / 2.3 + 1) - 4.5 * Math.exp(-Math.pow((y - 11) / 2.6, 2)); }
    // rivers: every tile they pass, joined edge to edge so nothing slips through a diagonal
    var river = {}, rtiles = [], course = [];
    RIVERS.forEach(function (pl, ri) {
      course[ri] = [];
      function put(rx, ry) { if (!river[I(rx, ry)]) { river[I(rx, ry)] = 1; rtiles.push([rx, ry]); course[ri].push(I(rx, ry)); } }
      for (var s = 0; s < pl.length - 1; s++) {
        var x0 = pl[s][0], y0 = pl[s][1], x1 = pl[s + 1][0], y1 = pl[s + 1][1], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2, px = null, py = null;
        for (var t = 0; t <= n; t++) {
          var wob = Math.sin((s * 7 + t) * 0.55) * 0.9;
          var rx = Math.round(x0 + (x1 - x0) * t / n + wob * (y1 - y0) / (n / 2 || 1) * 0.6), ry = Math.round(y0 + (y1 - y0) * t / n - wob * (x1 - x0) / (n / 2 || 1) * 0.6);
          if (!inb(rx, ry)) continue;
          if (px !== null && rx !== px && ry !== py && inb(rx, py)) put(rx, py);
          put(rx, ry);
          px = rx; py = ry;
        }
      }
    });
    function bump(x, y, bx, by, a, s) { var d2 = (x - bx) * (x - bx) + (y - by) * (y - by); return a * Math.exp(-d2 / (2 * s * s)); }
    var CLEAR = [[23, 27, 6.5], [37, 19, 5], [15, 9, 4.5], [39, 49, 5], [28, 15, 3.5], [29, 39, 3.5], [52, 9, 2.2], [45, 30, 1.6], [55, 42, 1.8], [52, 22, 3], [34, 7, 2.6], [44, 13, 3], [46, 40, 3]];
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      i = I(x, y);
      var d = x + (fbm(x, y, 5) - 0.5) * 3.0 - coast(y);
      var isle = Math.hypot(x - 11, y - 33) < 1.7 + fbm(x, y, 9) || Math.hypot(x - 4, y - 22) < 1.3;
      if (d < 0 && !isle) { terr[i] = T.SEA; elev[i] = 0; continue; }
      if (isle && d < 0) d = 1.5;
      var rd = 99; for (k = 0; k < rtiles.length; k++) { var q = Math.hypot(rtiles[k][0] - x, rtiles[k][1] - y); if (q < rd) rd = q; }
      var e = d / 62 + (fbm(x, y, 3) - 0.5) * 0.5 + bump(x, y, 55, 7, 0.34, 7) + bump(x, y, 61, 47, 0.95, 4.6) + bump(x, y, 70, 17, 0.32, 9) + bump(x, y, 66, 38, 0.25, 6) - 0.2 * Math.exp(-rd * rd / 5);
      elev[i] = e;
      if (river[i]) { terr[i] = T.RIVER; continue; }
      var f = fbm(x, y, 21);
      terr[i] = e > 1.04 ? T.MOUNT : e > 0.7 ? T.HILL : ((f > 0.47 && e > 0.16) || (e > 0.45 && f > 0.36)) ? T.FOREST : T.GRASS;
      for (k = 0; k < CLEAR.length; k++) if (terr[i] === T.FOREST && Math.hypot(x - CLEAR[k][0], y - CLEAR[k][1]) < CLEAR[k][2] + (hash2(x, y, 4) - 0.5) * 1.6) terr[i] = T.GRASS;
    }
    for (i = 0; i < W * H; i++) { shade[i] = hash2(i % W, (i / W) | 0, 31); if (terr[i] === T.SEA) nav[i] = 1; }
    course.forEach(function (c, ri) { var left = NAVLEN[ri]; for (var j = c.length - 1; j >= 0 && left > 0; j--) if (terr[c[j]] === T.RIVER) { nav[c[j]] = 1; left--; } });

    var occ = {};                                 // tiles spoken for while laying the map out
    function land(x, y) { var t = terr[I(x, y)]; return t === T.GRASS || t === T.FOREST || t === T.HILL; }
    function nextTo(x, y, kind) {
      var ds = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (var j = 0; j < 4; j++) { var nx = x + ds[j][0], ny = y + ds[j][1]; if (inb(nx, ny) && terr[I(nx, ny)] === kind) return true; }
      return false;
    }
    function settle(wx, wy, ok) {                 // nearest free tile that satisfies ok()
      for (var r = 0; r < 7; r++) for (var dy = -r; dy <= r; dy++) for (var dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        var x = wx + dx, y = wy + dy;
        if (inb(x, y) && !occ[I(x, y)] && ok(x, y)) return [x, y];
      }
      return null;
    }
    var sites = [];
    SITEPLAN.forEach(function (sp) {
      var t = sp[0], p;
      if (t === 'fishery') p = settle(sp[1], sp[2], function (x, y) { return terr[I(x, y)] === T.SEA && (nextTo(x, y, T.GRASS) || nextTo(x, y, T.FOREST)); });
      else if (t === 'saltpan') p = settle(sp[1], sp[2], function (x, y) { return land(x, y) && nextTo(x, y, T.SEA); });
      else if (t === 'clay') p = settle(sp[1], sp[2], function (x, y) { return land(x, y) && nextTo(x, y, T.RIVER); });
      else if (t === 'mine' || t === 'goldpit') p = settle(sp[1], sp[2], function (x, y) { return terr[I(x, y)] === T.HILL; }) || settle(sp[1], sp[2], land);
      else if (t === 'timber' || t === 'resin') p = settle(sp[1], sp[2], function (x, y) { return terr[I(x, y)] === T.FOREST; }) || settle(sp[1], sp[2], land);
      else p = settle(sp[1], sp[2], function (x, y) { var q = terr[I(x, y)]; return q === T.GRASS || q === T.FOREST; });
      if (!p) return;
      occ[I(p[0], p[1])] = 1;
      if (t === 'paddy' || t === 'saltpan' || t === 'clay' || t === 'pepper' || t === 'cotton') terr[I(p[0], p[1])] = T.GRASS;
      if (t === 'mine' || t === 'goldpit') terr[I(p[0], p[1])] = T.HILL;
      if (t === 'timber' || t === 'resin') terr[I(p[0], p[1])] = T.FOREST;
      sites.push({ t: t, x: p[0], y: p[1] });
    });
    function grassAt(wx, wy) { var p = settle(wx, wy, function (x, y) { return terr[I(x, y)] === T.GRASS; }); occ[I(p[0], p[1])] = 1; return p; }
    var hq = grassAt(22, 26), fixed = [], houses = [];
    var q = settle(20, 28, function (x, y) { return terr[I(x, y)] === T.GRASS && nextTo(x, y, T.SEA); }) || grassAt(21, 28); occ[I(q[0], q[1])] = 1;
    fixed.push({ t: 'quarter', x: q[0], y: q[1] });
    var ist = grassAt(25, 30); fixed.push({ t: 'istana', x: ist[0], y: ist[1] });
    var cp = grassAt(24, 26); fixed.push({ t: 'carpenter', x: cp[0], y: cp[1] });
    var pt = grassAt(16, 9); fixed.push({ t: 'potter', x: pt[0], y: pt[1] });
    [[23, 28], [24, 28], [22, 28], [23, 29], [21, 26], [15, 8], [14, 9], [14, 10], [37, 19], [36, 19], [38, 19], [38, 49], [39, 50], [37, 49], [40, 49]].forEach(function (h) {
      var p = grassAt(h[0], h[1]); houses.push(p);
    });
    var hw = settle(hq[0], hq[1], function (x, y) { return terr[I(x, y)] === T.SEA; });
    CH._world = { W: W, H: H, T: T, terr: terr, elev: elev, shade: shade, nav: nav, sites: sites, fixed: fixed, houses: houses,
      hq: { x: hq[0], y: hq[1], wx: hw[0], wy: hw[1] }, rivers: RIVERS };
    return CH._world;
  };

  CH.DEF = { W: W, H: H, T: T, goods: GOODS, goodIds: Object.keys(GOODS), sites: SITES, house: HOUSE, sizes: SIZES, bld: BLD, bldIds: Object.keys(BLD), trans: TRANS, adv: ADV,
    events: EVENTS, places: PLACES, spare: SPARE, abil: ABIL, names: NAMES, ranks: RANKS, goals: GOALS,
    title: 'Malacca', span: [1400, 1511], startCoins: 2500, tpy: 300,
    path: { trail: { n: 'Trail', cost: 4, code: 1 }, road: { n: 'Road', cost: 12, code: 2, adv: 'cart' } },
    hire: { base: 100, grow: 1.32, max: 6400, cap: 30, wage: 12 } };
})(typeof window !== 'undefined' ? window : globalThis);
