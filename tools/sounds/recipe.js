// Where every sound in the game comes from, and how it is cut.
// Each source is a recording under an open licence. `url` is a direct download (a copy on GitHub), `page` is where
// the recording and its licence are published. make.js fetches the sources, cuts them and writes assets/sounds/.
//
// A cut is { from, at, len } in seconds, with optional `in` and `out` fades, `hp` (steep) and `lp` filters in Hz, `rate`
// (playback speed: 1.1225 is two semitones up), and inside a mix `delay` and `gain`.
// A sound's `level` is how loud the game plays it, 0 to 1. A loop names its crossfade in seconds.

const IMM = 'https://media.githubusercontent.com/media/indubitablygregarious/immerse-yourself/022709bd616d992eb0194410dc4540e43dc6e8be/freesound_sounds/';
const OC = 'https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/514c926efecdb3c7812bf00eedf8e5c8d61dd681/corpora/oculus-audio-pack/ogg/';
const VC = 'https://raw.githubusercontent.com/sgossner/VCSL/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/';
const ESC = 'https://raw.githubusercontent.com/karolpiczak/ESC-50/33c8ce9eb2cf0b1c2f8bcf322eb349b6be34dbb6/audio/';
const KR = 'https://raw.githubusercontent.com/Boyquotes/kenney-rpg-audio-for-godot/22eb79bb843bbcadcaa6ed119353a33265ffad11/addons/kenney%20rpg%20audio/';
const KI = 'https://raw.githubusercontent.com/Boyquotes/kenney-impact-sounds-for-godot/999dd1684873f8b020a3aa5b26e713da21688924/addons/kenney%20impact%20sounds/';

const fs = (who, id, title, url) => ({ url, page: 'https://freesound.org/people/' + who + '/sounds/' + id + '/', title, by: who, lic: 'CC0 1.0' });
const oculus = name => ({ url: OC + name + '.ogg', page: 'https://developers.meta.com/vr/downloads/package/oculus-audio-pack-1/', title: name, by: 'Oculus VR, LLC', lic: 'CC BY 4.0', pack: 'Oculus Audio Pack 01' });
const vcsl = (path, title) => ({ url: VC + path.split('/').map(encodeURIComponent).join('/'), page: 'https://github.com/sgossner/VCSL', title, by: 'Versilian Studios', lic: 'CC0 1.0', pack: 'Versilian Community Sample Library' });
const kenney = (base, file, pack, page) => ({ url: base + file, page, title: file.replace(/\.ogg$/, ''), by: 'Kenney', lic: 'CC0 1.0', pack });

exports.sources = {
  // field recordings published on Freesound
  crowd: fs('timothyd4y', 472606, 'Large Crowd at an Outdoor Reception', IMM + 'cc0/timothyd4y_472606_Large_Crowd_at_an_Outdoor_Reception.mp3'),
  waves: fs('felix.blume', 510236, 'Wave on the beach in Thailand, at 20 meters from the water, during the night', IMM + 'cc0/felix.blume_510236_Wave_on_the_beach_in_Thailand%2C_at_20_meters_form_the_water%2C_during_the_night.mp3'),
  fire: fs('NickTayloe', 813328, 'Crackling Flames (loop)', IMM + 'cc0/NickTayloe_813328_Crackling_Flames_(loop).mp3'),
  gulls: fs('felix.blume', 155747, 'Seagulls screeching on the beach, on the peruvian shore', IMM + 'cc0/felix.blume_155747_Seagulls_screeching_on_the_beach%2C_on_the_peruvian_shore..mp3'),
  oxcart: fs('craigsmith', 437078, 'G52-05-Ox Cart', IMM + 'cc0/craigsmith_437078_G52-05-Ox_Cart.wav.mp3'),
  nails: fs('craigsmith', 487086, 'R28-41-Hammer Metal Stakes or Nails', IMM + 'cc0/craigsmith_487086_R28-41-Hammer_Metal_Stakes_or_Nails.wav.mp3'),
  shillings: fs('husky70', 161315, 'Counting Me Shillings', IMM + 'cc0/husky70_161315_Counting_Me_Shillings.mp3.mp3'),
  shovel: Object.assign(fs('andersmmg', 516318, 'Shoveling', IMM + 'cc-by/andersmmg_516318_Shoveling.mp3'), { lic: 'CC BY 4.0' }),
  register: fs('Zott820', 209578, 'Cash Register Purchase', 'https://raw.githubusercontent.com/shshwdr/egg-cooker/HEAD/sound/209578__zott820__cash-register-purchase.wav'),
  // Freesound recordings, as five-second clips in the ESC-50 collection (its LICENSE file names each one's author and licence)
  cow: fs('felix.blume', 163727, 'Cow mooing in south of France (Limousin)', ESC + '3-163727-A-3.wav'),
  bulls: fs('felix.blume', 202111, 'Two bulls singing in the desert of Arizona', ESC + '1-202111-A-3.wav'),
  cattle: fs('felix.blume', 202795, 'Bulls and cows in a field in Missouri, USA', ESC + '5-202795-A-3.wav'),
  rooster1: fs('videog', 149189, 'rooster cock-a-doodle-doo', ESC + '3-149189-A-1.wav'),
  rooster2: fs('JarredGibb', 233160, 'Rooster - Crow 2 - 96kHz', ESC + '5-233160-A-1.wav'),
  hens: fs('jsbarrett', 200330, 'chicken_chatter', ESC + '4-200330-A-6.wav'),
  cheer: fs('AlaskaRobotics', 221567, 'cheering and clapping crowd 2', ESC + '5-221567-A-22.wav'),
  woodsaw: fs('Pingel', 9887, 'WoodSaw2', ESC + '1-9887-A-49.wav'),
  // Oculus Audio Pack 01
  forest: oculus('AMBForst_Forest_LOOP_01'), birds1: oculus('AMBForst_ForestBirds_OS_01'), birds2: oculus('AMBForst_ForestBirds_OS_02'), birds3: oculus('AMBForst_ForestBirds_OS_03'),
  chicken: oculus('BIRDFowl_Chicken_OS_01'), oar1: oculus('BOATRow_RowboatOarRowing_OS_01'), oar3: oculus('BOATRow_RowboatOarRowing_OS_03'), oar5: oculus('BOATRow_RowboatOarRowing_OS_05'),
  anvil: oculus('METLImpt_HammerAnvil_OS_01'), anvils: oculus('METLImpt_HammerAnvilAmbient_OS_01'), saw: oculus('TOOLHand_WoodCutSaw_OS_01'), axe: oculus('WEAPAxe_WoodCutAxe_OS_01'),
  victory: oculus('MUSCStngr_VictoryMallet_OS_01'), levelup: oculus('MUSCStngr_LevelUpMallet_OS_01'), tone: oculus('UIAlert_MusicTone_OS_01'), wooderror: oculus('UIAlert_WoodError_OS_01'),
  // instruments from the Versilian Community Sample Library
  gong: vcsl('Idiophones/Struck Idiophones/Gong 1/gong_f.wav', 'Gong 1, forte'), gonglight: vcsl('Idiophones/Struck Idiophones/Gong 2/hit_light1.mp3', 'Gong 2, light hit'),
  chimes: vcsl('Idiophones/Struck Idiophones/Mark Trees/Legacy/windchimes_asc1.wav', 'Mark tree, ascending'), framedrum: vcsl('Membranophones/Struck Membranophones/Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav', 'Frame drum, hit'),
  woodblock: vcsl('Idiophones/Struck Idiophones/Woodblock/wood_click_mp.wav', 'Woodblock'),
  balafonF4: vcsl('Idiophones/Struck Idiophones/Balafon/Hard Mallet/EthnicXylo_hardM_F4_vl2_rr1_Mid.wav', 'Balafon, F4'), balafonC5: vcsl('Idiophones/Struck Idiophones/Balafon/Hard Mallet/EthnicXylo_hardM_C5_vl2_rr1_Mid.wav', 'Balafon, C5'),
  // Kenney's sound packs
  leather: kenney(KR, 'drop_leather.ogg', 'RPG Audio', 'https://kenney.nl/assets/rpg-audio'), leather2: kenney(KR, 'handle_small_leather.ogg', 'RPG Audio', 'https://kenney.nl/assets/rpg-audio'),
  doorclose: kenney(KR, 'door_close_1.ogg', 'RPG Audio', 'https://kenney.nl/assets/rpg-audio'),
  plank0: kenney(KI, 'impact_plank_medium_000.ogg', 'Impact Sounds', 'https://kenney.nl/assets/impact-sounds'), plank1: kenney(KI, 'impact_plank_medium_001.ogg', 'Impact Sounds', 'https://kenney.nl/assets/impact-sounds'),
  mining0: kenney(KI, 'impact_mining_000.ogg', 'Impact Sounds', 'https://kenney.nl/assets/impact-sounds'), mining1: kenney(KI, 'impact_mining_001.ogg', 'Impact Sounds', 'https://kenney.nl/assets/impact-sounds'),
  mining2: kenney(KI, 'impact_mining_002.ogg', 'Impact Sounds', 'https://kenney.nl/assets/impact-sounds')
};

exports.sounds = [
  // ---- ambience: loops that follow the map view ----
  { id: 'crowd', what: 'market crowd', loop: 1.5, level: 0.85, takes: [{ from: 'crowd', at: 0.5, len: 17 }] },
  { id: 'waves', what: 'waves on a beach', loop: 1.5, level: 0.8, takes: [{ from: 'waves', at: 49.2, len: 17.2 }] },
  { id: 'forest', what: 'forest', loop: 1.5, level: 0.6, takes: [{ from: 'forest', at: 28.5, len: 14 }] },
  { id: 'fire', what: 'kiln and forge fire', loop: 1, level: 0.8, takes: [{ from: 'fire', at: 20, len: 9 }] },
  // ---- what is in view: animals, transport, workshops ----
  { id: 'moo', what: 'ox', level: 0.5, takes: [{ from: 'cow', at: 0, len: 2.05, out: 0.1 }, { from: 'bulls', at: 0.62, len: 1.48, in: 0.03, out: 0.12 }, { from: 'cattle', at: 1.2, len: 1.55, in: 0.03, out: 0.25 }] },
  { id: 'cart', what: 'ox cart rolling', level: 0.45, takes: [{ from: 'oxcart', at: 9.5, len: 3.2, in: 0.5, out: 0.7 }, { from: 'oxcart', at: 24, len: 3.2, in: 0.5, out: 0.7 }] },
  { id: 'gull', what: 'gull', level: 0.45, takes: [{ from: 'gulls', at: 6.3, len: 0.75, hp: 1600, lp: 6500, in: 0.12, out: 0.25 }, { from: 'gulls', at: 35.2, len: 0.75, hp: 1600, lp: 6500, in: 0.12, out: 0.25 }, { from: 'gulls', at: 62.1, len: 0.85, hp: 1600, lp: 6500, in: 0.12, out: 0.25 }] },      // single cries lifted out of the surf
  { id: 'bird', what: 'forest birds', level: 0.4, takes: [{ from: 'birds1', at: 0.05, len: 3.4, out: 0.3 }, { from: 'birds3', at: 0, len: 2.8, out: 0.3 }, { from: 'birds2', at: 0.3, len: 4, out: 0.4 }] },
  { id: 'cluck', what: 'hens', level: 0.4, takes: [{ from: 'hens', at: 0, len: 2.6, in: 0.05, out: 0.4 }, { from: 'chicken', at: 0, len: 2.65, out: 0.3 }] },
  { id: 'rooster', what: 'rooster', level: 0.4, takes: [{ from: 'rooster1', at: 1.7, len: 1.72, out: 0.1 }, { from: 'rooster2', at: 0.24, len: 1.72, out: 0.1 }] },
  { id: 'splash', what: 'oars', level: 0.4, takes: [{ from: 'oar1', at: 0, len: 1.8, out: 0.3 }, { from: 'oar3', at: 0, len: 2.5, out: 0.3 }, { from: 'oar5', at: 0, len: 2.6, out: 0.3 }] },
  { id: 'hammer', what: 'smith at the anvil', level: 0.4, takes: [{ from: 'anvils', at: 2.45, len: 1.6, out: 0.3 }, { from: 'anvils', at: 4.48, len: 1.6, out: 0.3 }, { from: 'anvil', at: 0, len: 1.2, out: 0.4 }] },
  { id: 'pick', what: 'pick on rock', level: 0.35, takes: [{ from: 'mining0', at: 0, len: 0.9, out: 0.2 }, { from: 'mining1', at: 0, len: 0.85, out: 0.2 }, { from: 'mining2', at: 0, len: 0.8, out: 0.2 }] },
  { id: 'chop', what: 'axe on wood', level: 0.4, takes: [{ from: 'axe', at: 0, len: 1.85, out: 0.25 }, { from: 'axe', at: 4.1, len: 1.85, out: 0.25 }] },
  { id: 'saw', what: 'hand saw', level: 0.35, takes: [{ from: 'saw', at: 0, len: 2.45, out: 0.2 }, { from: 'woodsaw', at: 0.05, len: 2.7, out: 0.2 }] },
  // ---- trades ----
  { id: 'coin', what: 'a coin', level: 0.5, takes: [{ from: 'shillings', at: 0.9, len: 0.34, out: 0.08 }, { from: 'shillings', at: 1.24, len: 0.36, out: 0.08 }, { from: 'shillings', at: 2.35, len: 0.4, out: 0.08 }] },
  { id: 'coins', what: 'coins counted', level: 0.55, takes: [{ from: 'shillings', at: 0.49, len: 1.1, out: 0.1 }, { from: 'shillings', at: 2.75, len: 1.22, out: 0.1 }, { from: 'shillings', at: 4.2, len: 1.32, out: 0.1 }] },
  { id: 'register', what: 'cash register', level: 0.6, takes: [{ from: 'register', at: 0.03, len: 2.3, out: 0.5 }] },
  { id: 'buy', what: 'a purse set down', level: 0.45, takes: [{ from: 'leather', at: 0, len: 0.42 }, { from: 'leather2', at: 0, len: 0.34 }] },
  // ---- the player's actions ----
  { id: 'build', what: 'hammering', level: 0.5, takes: [{ from: 'nails', at: 12.35, len: 1.62, out: 0.25 }, { from: 'nails', at: 17.2, len: 1.55, out: 0.25 }] },
  { id: 'path', what: 'shovel', level: 0.45, takes: [{ from: 'shovel', at: 3.93, len: 0.9, out: 0.2 }, { from: 'shovel', at: 0.15, len: 0.75, out: 0.2 }] },
  { id: 'hire', what: 'two balafon notes', level: 0.45, takes: [{ mix: [{ from: 'balafonF4', at: 0, len: 0.9, rate: 1.1225 }, { from: 'balafonC5', at: 0, len: 0.95, delay: 0.13 }], out: 0.3 }] },
  { id: 'tick', what: 'woodblock', level: 0.3, takes: [{ from: 'woodblock', at: 0, len: 0.3, out: 0.1 }] },
  { id: 'deny', what: 'wooden knock', level: 0.45, takes: [{ from: 'wooderror', at: 0, len: 0.4 }] },
  // ---- news ----
  { id: 'start', what: 'soft gong', level: 0.5, takes: [{ from: 'gonglight', at: 0.22, len: 3.4, out: 1.2 }] },
  { id: 'pop', what: 'a plank set', level: 0.4, takes: [{ from: 'plank0', at: 0, len: 0.5, out: 0.15 }, { from: 'plank1', at: 0, len: 0.5, out: 0.15 }] },
  { id: 'left', what: 'a door closing', level: 0.35, takes: [{ from: 'doorclose', at: 0, len: 0.68 }] },
  { id: 'lesson', what: 'a warm tone', level: 0.45, takes: [{ from: 'tone', at: 0, len: 1.9, out: 0.5 }] },
  { id: 'chime', what: 'mark tree', level: 0.45, takes: [{ from: 'chimes', at: 0.1, len: 2.8, out: 0.6 }] },
  { id: 'warn', what: 'two drum beats', level: 0.5, takes: [{ mix: [{ from: 'framedrum', at: 0, len: 1.4 }, { from: 'framedrum', at: 0, len: 1.4, delay: 0.3, gain: 0.85 }], out: 0.4 }] },
  { id: 'goal', what: 'mallet fanfare', level: 0.6, takes: [{ from: 'victory', at: 0, len: 3.2, out: 0.5 }] },
  { id: 'milestone', what: 'a cheering crowd', level: 0.6, takes: [{ mix: [{ from: 'cheer', at: 0, len: 4, out: 1.2 }, { from: 'levelup', at: 0, len: 2.9, delay: 0.05, gain: 0.6 }], out: 0.3 }] },
  { id: 'over', what: 'great gong', level: 0.7, takes: [{ from: 'gong', at: 0, len: 7, out: 3 }] }
];
