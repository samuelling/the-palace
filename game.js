/* The Palace: engine. Builds any chapter from levels.js, runs play, and records silent telemetry. */
(function () {
'use strict';
const $ = s => document.querySelector(s);
const L = window.PALACE_LEVELS;
const R = (a, b) => a + Math.random() * (b - a);
const now = () => performance.now();
const TOUCH = matchMedia('(pointer:coarse)').matches;
const T = 2, WH = 3.4;
const KEY = (x, y) => x + ',' + y;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ---------- textures ---------- */
function ctex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t;
}
function noise(g, w, h, a, n = 1800) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(0,0,0,${R(0, a)})`; g.fillRect(R(0, w), R(0, h), R(1, 3), R(1, 3)); } }
function wainscot(g, w, h, wood = '#2b1a10', panel = '#3a2416') { g.fillStyle = wood; g.fillRect(0, h * .68, w, h * .32); g.fillStyle = panel; for (let x = 6; x < w; x += 64) g.fillRect(x, h * .72, 52, h * .24); g.fillStyle = '#1a0f08'; g.fillRect(0, h * .68, w, 6); }
const TX = {};
const texMakers = {
  wallpaperWarm: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#3c2a24'; g.fillRect(0, 0, w, h); damask(g, w, h, 'rgba(200,150,80,.18)'); wainscot(g, w, h); noise(g, w, h, .18); }),
  wallpaperGreen: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#1f3029'; g.fillRect(0, 0, w, h); damask(g, w, h, 'rgba(170,190,150,.14)'); wainscot(g, w, h); noise(g, w, h, .18); }),
  wallpaperRed: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#3a1a19'; g.fillRect(0, 0, w, h); damask(g, w, h, 'rgba(210,170,110,.15)'); wainscot(g, w, h); noise(g, w, h, .18); }),
  wallpaperNursery: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#5a4448'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,230,190,.25)'; for (let i = 0; i < 40; i++) star(g, R(0, w), R(0, h * .66), R(3, 6)); wainscot(g, w, h, '#4a3a34', '#5a4840'); noise(g, w, h, .15); }),
  books: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#24170e'; g.fillRect(0, 0, w, h); for (let y = 8; y < h * .9; y += 46) { g.fillStyle = '#160d07'; g.fillRect(0, y + 38, w, 8); for (let x = 4; x < w;) { const bw = R(7, 15); g.fillStyle = `hsl(${R(0, 40)},${R(20, 45)}%,${R(14, 28)}%)`; g.fillRect(x, y + R(2, 8), bw, 38 - R(0, 6)); x += bw + 1; } } noise(g, w, h, .2); }),
  letters: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#2a1d12'; g.fillRect(0, 0, w, h); for (let y = 10; y < h * .92; y += 40) { g.fillStyle = '#140c06'; g.fillRect(0, y + 32, w, 8); for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(40,${R(15, 35)}%,${R(55, 75)}%)`; g.save(); g.translate(R(0, w), y + R(8, 26)); g.rotate(R(-.3, .3)); g.fillRect(-9, -6, 18, 12); g.restore(); } } noise(g, w, h, .2); }),
  stone: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#34322e'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1d1b18'; g.lineWidth = 3; for (let y = 0; y < h; y += 42) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); for (let x = (y / 42 % 2) * 40; x < w; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 42); g.stroke(); } } noise(g, w, h, .3, 3000); }),
  brick: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#2a1712'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 22) for (let x = (y / 22 % 2) * 24; x < w; x += 48) { g.fillStyle = `hsl(10,${R(35, 50)}%,${R(18, 28)}%)`; g.fillRect(x + 2, y + 2, 44, 18); } noise(g, w, h, .3, 2500); }),
  hedge: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#0f1a0f'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2600; i++) { g.fillStyle = `hsl(${R(95, 130)},${R(25, 45)}%,${R(8, 24)}%)`; g.beginPath(); g.ellipse(R(0, w), R(0, h), R(3, 8), R(2, 5), R(0, 3), 0, 7); g.fill(); } }),
  panel: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#3a2618'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1e120a'; g.lineWidth = 6; for (let x = 10; x < w; x += 82) { g.strokeRect(x, 20, 70, h * .55); g.strokeRect(x, h * .66, 70, h * .28); } noise(g, w, h, .2); }),
  marbleWall: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#b9b1a3'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(90,80,70,.25)'; for (let k = 0; k < 10; k++) { g.beginPath(); g.moveTo(R(0, w), 0); g.bezierCurveTo(R(0, w), R(0, h), R(0, w), R(0, h), R(0, w), h); g.stroke(); } g.fillStyle = '#9c7a3a'; g.fillRect(0, h * .1, w, 6); g.fillRect(0, h * .82, w, 6); noise(g, w, h, .1); }),
  ballroom: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#d6c7a8'; g.fillRect(0, 0, w, h); g.strokeStyle = '#a8833f'; g.lineWidth = 4; for (let x = 12; x < w; x += 82) g.strokeRect(x, 30, 64, h * .6); g.fillStyle = '#7a5b2a'; g.fillRect(0, h * .78, w, h * .22); noise(g, w, h, .12); }),
  chapel: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#4a4744'; g.fillRect(0, 0, w, h); const cols = ['#2a4aa0', '#a02a3a', '#c9a040', '#2a8a5a']; g.fillStyle = '#1b1a18'; g.fillRect(w * .3, 40, w * .4, h * .5); for (let i = 0; i < 60; i++) { g.fillStyle = cols[i % 4]; g.fillRect(w * .3 + R(4, w * .4 - 14), R(44, 40 + h * .5 - 14), 10, 10); } g.strokeStyle = '#1b1a18'; g.lineWidth = 3; g.strokeRect(w * .3, 40, w * .4, h * .5); noise(g, w, h, .25, 2500); }),
  mural: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#28402c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { g.fillStyle = `hsl(${R(80, 140)},${R(20, 40)}%,${R(20, 40)}%)`; g.beginPath(); g.ellipse(R(0, w), R(h * .3, h), R(6, 16), R(3, 8), R(0, 3), 0, 7); g.fill(); } for (let i = 0; i < 30; i++) { g.fillStyle = `hsl(${R(0, 50)},60%,70%)`; g.beginPath(); g.arc(R(0, w), R(h * .3, h * .9), 4, 0, 7); g.fill(); } noise(g, w, h, .15); }),
  velvet: () => ctex(256, 384, (g, w, h) => { g.fillStyle = '#4a1218'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 20) { g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(x, 0, 8, h); } g.fillStyle = '#c9a35a'; g.fillRect(0, h * .7, w, 5); noise(g, w, h, .15); }),
  // floors
  marble: () => ctex(256, 256, (g, w, h) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { g.fillStyle = (i + j) % 2 ? '#d4cbbb' : '#1c1a18'; g.fillRect(i * 128, j * 128, 128, 128); } g.strokeStyle = 'rgba(120,110,100,.35)'; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(R(0, w), R(0, h)); g.bezierCurveTo(R(0, w), R(0, h), R(0, w), R(0, h), R(0, w), R(0, h)); g.stroke(); } }),
  wood: () => ctex(256, 256, (g, w, h) => { for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(25,${R(30, 40)}%,${R(14, 20)}%)`; g.fillRect(x, 0, 32, h); g.fillStyle = '#0d0805'; g.fillRect(x, 0, 2, h); g.fillRect(x, R(0, h), 32, 2); } noise(g, w, h, .2); }),
  parquet: () => ctex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(30,${R(35, 45)}%,${R(24, 32)}%)`; g.fillRect(x, y, 32, 32); g.strokeStyle = 'rgba(0,0,0,.35)'; for (let k = 4; k < 32; k += 8) { g.beginPath(); if ((x + y) / 32 % 2) { g.moveTo(x + k, y); g.lineTo(x + k, y + 32); } else { g.moveTo(x, y + k); g.lineTo(x + 32, y + k); } g.stroke(); } } }),
  carpetRed: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#4a1414'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(200,150,70,.25)'; g.lineWidth = 4; g.strokeRect(14, 14, w - 28, h - 28); g.fillStyle = 'rgba(200,150,70,.15)'; for (let y = 40; y < h - 30; y += 36) for (let x = 40; x < w - 30; x += 36) { g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); } noise(g, w, h, .25); }),
  carpetBlue: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#1a2240'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(200,180,120,.14)'; for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) star(g, x, y, 5); noise(g, w, h, .25); }),
  grass: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#1c2a16'; g.fillRect(0, 0, w, h); for (let i = 0; i < 3500; i++) { g.strokeStyle = `hsl(${R(80, 120)},${R(25, 45)}%,${R(10, 26)}%)`; const x = R(0, w), y = R(0, h); g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-2, 2), y - R(3, 8)); g.stroke(); } }),
  gravel: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#3a3630'; g.fillRect(0, 0, w, h); for (let i = 0; i < 2500; i++) { g.fillStyle = `hsl(35,${R(5, 15)}%,${R(18, 40)}%)`; g.beginPath(); g.arc(R(0, w), R(0, h), R(1, 3), 0, 7); g.fill(); } }),
  tile: () => ctex(256, 256, (g, w, h) => { for (let y = 0; y < h; y += 32) for (let x = 0; x < w; x += 32) { g.fillStyle = `hsl(20,10%,${R(16, 24)}%)`; g.fillRect(x + 1, y + 1, 30, 30); } }),
  // ceilings
  plaster: () => ctex(128, 128, (g, w, h) => { g.fillStyle = '#1d1916'; g.fillRect(0, 0, w, h); noise(g, w, h, .3, 600); }),
  glass: () => ctex(128, 128, (g, w, h) => { g.fillStyle = '#0b1420'; g.fillRect(0, 0, w, h); g.strokeStyle = '#2c3a30'; g.lineWidth = 4; g.strokeRect(0, 0, w, h); g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.stroke(); }),
  sky: () => ctex(256, 256, (g, w, h) => { g.fillStyle = '#05070c'; g.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(220,225,255,${R(.2, .8)})`; g.fillRect(R(0, w), R(0, h), 1.5, 1.5); } }),
  vault: () => ctex(128, 128, (g, w, h) => { g.fillStyle = '#2a2420'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a6a33'; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, 40, 0, 7); g.stroke(); noise(g, w, h, .2, 500); }),
  door: () => ctex(128, 256, (g, w, h) => { g.fillStyle = '#3d2414'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1c0f07'; g.lineWidth = 5; g.strokeRect(14, 16, w - 28, h * .4); g.strokeRect(14, h * .52, w - 28, h * .42); g.fillStyle = '#c9a35a'; g.beginPath(); g.arc(w - 24, h * .5, 6, 0, 7); g.fill(); noise(g, w, h, .2, 500); }),
};
function damask(g, w, h, motif) { for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, 0, 10, h * .68); } g.fillStyle = motif; for (let y = 20; y < h * .66; y += 48) for (let x = (y / 48 % 2) * 16 + 8; x < w; x += 32) { g.beginPath(); g.moveTo(x, y - 9); g.lineTo(x + 6, y); g.lineTo(x, y + 9); g.lineTo(x - 6, y); g.fill(); } }
function star(g, x, y, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill(); }
const tex = k => TX[k] || (TX[k] = texMakers[k]());
const THEMES = {
  foyer: { wall: 'wallpaperWarm', floor: 'marble', ceil: 'plaster' }, gallery: { wall: 'wallpaperGreen', floor: 'carpetRed', ceil: 'plaster' },
  library: { wall: 'books', floor: 'wood', ceil: 'plaster' }, study: { wall: 'wallpaperRed', floor: 'wood', ceil: 'plaster' },
  hall: { wall: 'wallpaperWarm', floor: 'wood', ceil: 'plaster' }, stone: { wall: 'stone', floor: 'stone', ceil: 'plaster' },
  office: { wall: 'panel', floor: 'wood', ceil: 'plaster' }, lawn: { wall: 'hedge', floor: 'grass', ceil: 'sky', open: true },
  boiler: { wall: 'brick', floor: 'tile', ceil: 'plaster' }, greenhouse: { wall: 'hedge', floor: 'gravel', ceil: 'glass' },
  rotunda: { wall: 'marbleWall', floor: 'marble', ceil: 'vault' }, lockestudy: { wall: 'wallpaperGreen', floor: 'carpetRed', ceil: 'plaster' },
  ballroom: { wall: 'ballroom', floor: 'parquet', ceil: 'vault' }, chapel: { wall: 'chapel', floor: 'stone', ceil: 'vault' },
  garden: { wall: 'mural', floor: 'grass', ceil: 'sky' }, music: { wall: 'velvet', floor: 'parquet', ceil: 'plaster' },
  nursery: { wall: 'wallpaperNursery', floor: 'carpetBlue', ceil: 'plaster' }, letters: { wall: 'letters', floor: 'wood', ceil: 'plaster' },
  drive: { wall: 'hedge', floor: 'gravel', ceil: 'sky', open: true },
};
const MAT = {};
const mat = (k, opts) => MAT[k] || (MAT[k] = new THREE.MeshPhongMaterial(Object.assign({ map: tex(k), shininess: 6, specular: 0x111111 }, opts || {})));
const flat = (color, emissive) => new THREE.MeshLambertMaterial({ color, emissive: emissive || 0 });

/* ---------- sound: synthesized score and effects live in audio.js ---------- */
const SND = window.PALACE_AUDIO;
function audio() { SND.init(); }
function sfx(type, vol = 1) { SND.sfx(type, { vol }); }
function sfxAt(type, x, z, vol = 1) { SND.sfx(type, { vol, x, z, occ: !los(PL.x, PL.z, x, z) }); }

/* ---------- renderer ---------- */
const renderer = new THREE.WebGLRenderer({ antialias: !TOUCH, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
$('#game').prepend(renderer.domElement);
const cvEl = renderer.domElement;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x030202); scene.fog = new THREE.FogExp2(0x050403, .075);
const camera = new THREE.PerspectiveCamera(70, 1, .05, 70); camera.rotation.order = 'YXZ'; scene.add(camera);
function resize() { const w = $('#game').clientWidth, h = $('#game').clientHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize);
const ambient = new THREE.AmbientLight(0x3a2c22, .42); scene.add(ambient);
const flash = new THREE.SpotLight(0xfff1d6, 2.4, 22, .48, .55, 1.6); flash.position.set(.18, -.15, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, -.2, -3);
const muzzle = new THREE.PointLight(0xffc070, 0, 8, 2); camera.add(muzzle); muzzle.position.set(.2, -.2, -.6);
/* ---------- game state ---------- */
const S = { spec: null, hooks: {}, world: null, running: false, paused: true, hp: 3, ammo: 12, inv: {}, flags: {}, plugs: {}, doors: {}, veils: [], props: {}, propList: [],
  items: [], figures: [], enemies: [], targets: [], blocked: new Set(), goal: null, homing: null, follower: null, lights: [], log: null, session: null, chapter: 0, room: null };
const tileOf = (px, pz) => [Math.floor(px / T), Math.floor(pz / T)];
const ctr = (x, y) => new THREE.Vector3(x * T + T / 2, 0, y * T + T / 2);
const FACE = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };   // yaw that looks toward that compass direction
const WALLRY = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };  // rotation that makes a wall-mounted front face into the tile
const WALLDIR = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
function wallPose(x, y, wall, inset) { const c = ctr(x, y), d = WALLDIR[wall]; return { x: c.x + d[0] * (T / 2 - inset), z: c.z + d[1] * (T / 2 - inset), ry: WALLRY[wall] }; }
function roomOf(x, y) {
  const sp = S.spec; let r = sp.roomAt(x, y); if (r) return r;
  for (const [dx, dy] of N4) { r = sp.roomAt(x + dx, y + dy); if (r) return r; } return null;
}
function themeAt(x, y) { const r = roomOf(x, y); return THEMES[(r && S.spec.themes[r]) || 'stone'] || THEMES.stone; }
function cell(x, y) { const g = S.spec.G; return g[y] && g[y][x]; }
function passable(x, y) {
  const ch = cell(x, y); if (!ch || ch === '#') return false; if (S.blocked.has(KEY(x, y))) return false;
  if (ch === 'P') return S.plugs[KEY(x, y)];
  if (ch === 'D') { const d = S.doorAt[KEY(x, y)]; return d && d.open; }
  return true;
}
function planPassable(x, y) { const ch = S.spec.planG[y] && S.spec.planG[y][x]; if (!ch || ch === '#') return false; if (ch === 'P') return !!S.spec.plugs[KEY(x, y)]; return true; }
function add(o) { S.world.add(o); return o; }
function box(w, h, d, m, x, y, z) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x || 0, y || 0, z || 0); return o; }
function cyl(rt, rb, h, m, x, y, z, seg) { const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), m); o.position.set(x || 0, y || 0, z || 0); return o; }
function sph(r, m, x, y, z) { const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m); o.position.set(x || 0, y || 0, z || 0); return o; }

function clearWorld() {
  if (S.world) { scene.remove(S.world); S.world.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
  S.world = new THREE.Group(); scene.add(S.world);
  S.props = {}; S.propList = []; S.items = []; S.figures = []; S.enemies = []; S.targets = []; S.blocked = new Set(); S.doors = {}; S.doorAt = {}; S.veils = []; S.lights = []; S.plugs = {}; S.follower = null; S.homing = null; S.goal = null; S.lantern = null; S.leg = null; S.closures = {};
}

function buildLevel(spec) {
  clearWorld(); S.spec = spec;
  const G = spec.G, wallGeo = new THREE.PlaneGeometry(T, WH), floorGeo = new THREE.PlaneGeometry(T, T), o = new THREE.Object3D(), buckets = {};
  const put = (key, m) => (buckets[key] = buckets[key] || []).push(m);
  const solid = (x, y) => { const c = G[y] && G[y][x]; return !c || c === '#'; };
  for (let y = 0; y < spec.H; y++) for (let x = 0; x < spec.W; x++) {
    const ch = G[y][x]; if (ch === '#') continue;
    const th = themeAt(x, y), c = ctr(x, y);
    o.position.set(c.x, 0, c.z); o.rotation.set(-Math.PI / 2, 0, 0); o.updateMatrix(); put('f:' + th.floor, o.matrix.clone());
    o.position.set(c.x, WH, c.z); o.rotation.set(Math.PI / 2, 0, 0); o.updateMatrix(); put('c:' + th.ceil, o.matrix.clone());
    if (ch === 'P') continue;
    for (const [dx, dy, ry] of [[0, -1, 0], [0, 1, Math.PI], [-1, 0, Math.PI / 2], [1, 0, -Math.PI / 2]]) {
      if (!solid(x + dx, y + dy)) continue;
      o.position.set(c.x + dx * T / 2, WH / 2, c.z + dy * T / 2); o.rotation.set(0, ry, 0); o.updateMatrix(); put('w:' + th.wall, o.matrix.clone());
    }
  }
  Object.entries(buckets).forEach(([k, list]) => {
    const [kind, tk] = k.split(':'), im = new THREE.InstancedMesh(kind === 'w' ? wallGeo : floorGeo, mat(tk), list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; add(im);
  });
  // plugs: doorways the Architect opens and closes
  Object.entries(spec.plugs).forEach(([k, open]) => {
    const [x, y] = k.split(',').map(Number), c = ctr(x, y);
    const face = (dx, dy) => { const th = solid(x + dx, y + dy) ? null : themeAt(x + dx, y + dy); return th ? mat(th.wall) : mat('plaster'); };
    const m = box(T, WH, T, [face(1, 0), face(-1, 0), mat('plaster'), mat('plaster'), face(0, 1), face(0, -1)], c.x, WH / 2, c.z);
    m.visible = !open; add(m); S.plugs[k] = open; S.plugMesh = S.plugMesh || {}; S.plugMesh[k] = m;
  });
  // doors
  spec.doors.forEach(d => {
    const c = ctr(d.x, d.y), piv = new THREE.Group(), dm = box(d.axis === 'z' ? T * .92 : .12, WH * .82, d.axis === 'z' ? .12 : T * .92, mat('door'));
    if (d.axis === 'z') { piv.position.set(c.x - T * .46, 0, c.z); dm.position.set(T * .46, WH * .41, 0); } else { piv.position.set(c.x, 0, c.z - T * .46); dm.position.set(0, WH * .41, T * .46); }
    piv.add(dm); add(piv);
    add(box(d.axis === 'z' ? T : .3, WH * .18, d.axis === 'z' ? .3 : T, mat('plaster'), c.x, WH * .91, c.z));
    const st = Object.assign({}, d, { piv, open: false, ang: 0 }); S.doors[d.id] = st; S.doorAt[KEY(d.x, d.y)] = st;
  });
  // veils
  (spec.veils || []).forEach(v => {
    const c = ctr(v.x, v.y), m = new THREE.Mesh(new THREE.PlaneGeometry(T * .9, WH * .85), new THREE.MeshBasicMaterial({ color: 0x2a1640, transparent: true, opacity: .85, side: THREE.DoubleSide, depthWrite: false }));
    m.position.set(c.x, WH * .425, c.z); if (v.axis === 'x') m.rotation.y = Math.PI / 2; add(m);
    S.veils.push(Object.assign({}, v, { mesh: m }));
  });
  buildProps(spec);
  spec.lights.forEach(l => { const p = new THREE.PointLight(l.color, l.i, l.d, 1.6); p.position.set(l.x * T, l.h, l.y * T); add(p); S.lights.push({ light: p, base: l.i, flicker: l.flicker }); });
  spec.items.forEach(it => addItem(it));
  spec.figures.forEach(f => addFigure(f));
  (spec.targets || []).forEach(t => addTarget(t));
  spec.enemies.forEach(e => spawnEnemy(e));
  scene.fog.density = spec.fog; S.fogBase = spec.fog; ambient.color.setHex(spec.ambient[0]); ambient.intensity = spec.ambient[1];
}

/* ---------- props ---------- */
const M = { brass: flat(0x8a6a33, 0x2a1a08), wood: flat(0x3a2212), dark: flat(0x1d1a17), marble: flat(0xcfc6b6), cloth: flat(0xd8d2c4), black: flat(0x111111), straw: flat(0x9a7a3a), stone: flat(0x8a8780) };
function planTexture() { return ctex(520, 380, (g, w, h) => drawPlan(g, w, h)); }
function drawPlan(g, w, h) {
  const sp = S.spec, s = Math.floor(Math.min(w / sp.W, h / (sp.H + 1.2))), ox = (w - s * sp.W) / 2, oy = 4;
  g.fillStyle = '#d8ccb4'; g.fillRect(0, 0, w, h);
  const open = (x, y) => planPassable(x, y);
  for (let y = 0; y < sp.H; y++) for (let x = 0; x < sp.W; x++) if (open(x, y)) { g.fillStyle = sp.planG[y][x] === 'V' ? '#b9a6d0' : '#efe6d2'; g.fillRect(ox + x * s, oy + y * s, s, s); }
  g.strokeStyle = '#2a221b'; g.lineWidth = Math.max(1, s / 7);
  for (let y = 0; y < sp.H; y++) for (let x = 0; x < sp.W; x++) {
    if (!open(x, y)) continue; const X = ox + x * s, Y = oy + y * s; g.beginPath();
    if (!open(x, y - 1)) { g.moveTo(X, Y); g.lineTo(X + s, Y); } if (!open(x, y + 1)) { g.moveTo(X, Y + s); g.lineTo(X + s, Y + s); }
    if (!open(x - 1, y)) { g.moveTo(X, Y); g.lineTo(X, Y + s); } if (!open(x + 1, y)) { g.moveTo(X + s, Y); g.lineTo(X + s, Y + s); } g.stroke();
  }
  g.fillStyle = '#2a221b'; g.font = `${Math.max(9, s * .7)}px "IM Fell English SC",serif`; g.textAlign = 'center';
  sp.planLabels.forEach(([n, x, y]) => g.fillText(n, ox + x * s, oy + y * s));
  g.font = `italic ${Math.max(10, s * .62)}px "IM Fell English",serif`; g.fillText(sp.planTitle, w / 2, oy + s * (sp.H + .9));
}
function framed(texture, w, h) {
  const grp = new THREE.Group();
  grp.add(box(w + .16, h + .16, .06, M.brass));
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: texture })); pic.position.z = .035; grp.add(pic); return grp;
}
const paint = fn => ctex(256, 320, fn);
const claraTex = () => paint((g, w, h) => { g.fillStyle = '#2a1d14'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(w / 2, h * .36, 58, 70, 0, 0, 7); g.fill(); g.fillStyle = '#cdb59a'; g.beginPath(); g.ellipse(w / 2, h * .4, 40, 52, 0, 0, 7); g.fill(); g.fillStyle = '#2e1f19'; g.beginPath(); g.moveTo(w * .15, h); g.quadraticCurveTo(w / 2, h * .55, w * .85, h); g.fill(); g.fillStyle = '#3a2a20'; g.fillRect(w / 2 - 14, h * .38, 8, 4); g.fillRect(w / 2 + 6, h * .38, 8, 4); });
const strangerTex = () => paint((g, w, h) => { g.fillStyle = `hsl(${R(10, 40)},25%,14%)`; g.fillRect(0, 0, w, h); g.fillStyle = `hsl(30,20%,${R(45, 60)}%)`; g.beginPath(); g.ellipse(w / 2, h * .42, 38, 50, 0, 0, 7); g.fill(); g.fillStyle = '#120c08'; g.fillRect(w / 2 - 50, h * .38, 100, 10); g.fillStyle = '#1a120c'; g.beginPath(); g.moveTo(0, h); g.quadraticCurveTo(w / 2, h * .55, w, h); g.fill(); });
function propMesh(p) {
  const g = new THREE.Group();
  switch (p.type) {
    case 'plan': { const f = framed(planTexture(), 1.3, .95); f.position.y = 1.7; g.add(f); break; }
    case 'portrait': { const f = framed(p.stranger ? strangerTex() : claraTex(), p.stranger ? .8 : .9, p.stranger ? 1 : 1.15); f.position.y = 1.8; g.add(f); break; }
    case 'clock': { g.add(box(.5, 2.3, .5, M.wood, 0, 1.15, .1)); const f = new THREE.Mesh(new THREE.CircleGeometry(.17, 24), flat(0xd8ccb4)); f.position.set(0, 1.85, .36); g.add(f); break; }
    case 'rug': { const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 2.4, T * 3), new THREE.MeshLambertMaterial({ map: tex('carpetRed') })); m.rotation.x = -Math.PI / 2; m.position.y = .01; g.add(m); break; }
    case 'chandelier': g.add(cyl(.35, .35, .06, M.brass, 0, WH - .45, 0)); for (let i = 0; i < 6; i++) g.add(cyl(.02, .02, .14, flat(0xfff0c0, 0xffd080), Math.cos(i) * .3, WH - .36, Math.sin(i) * .3)); break;
    case 'desk': g.add(box(1.4, .08, .8, M.wood, 0, .85, 0)); g.add(box(1.3, .8, .7, flat(0x2a170c), 0, .42, 0)); break;
    case 'table': g.add(box(.6, .06, .6, M.wood, 0, .8, 0)); g.add(cyl(.06, .1, .8, M.wood, 0, .4, 0)); break;
    case 'pedestal': g.add(box(.45, 1, .45, flat(0x4a443d), 0, .5, 0)); break;
    case 'plinth': g.add(cyl(.32, .38, 1, M.marble, 0, .5, 0)); g.add(box(.5, .05, .2, M.brass, 0, .7, .37)); break;
    case 'planter': g.add(box(.45, .35, .45, flat(0x3a2a1c), 0, .18, 0)); break;
    case 'fireplace': g.add(box(1.6, 1.2, .3, flat(0x1d1a17), 0, .6, .15)); g.add(box(1, .5, .1, flat(0xff7a30, 0xc04010), 0, .35, .3)); break;
    case 'candelabra': g.add(cyl(.04, .06, 1.4, M.brass, 0, .7, 0)); g.add(cyl(.03, .03, .15, flat(0xfff0c0, 0xffc060), 0, 1.47, 0)); break;
    case 'statue': {
      g.add(box(.8, .5, .8, M.stone, 0, .25, 0)); const s = M.stone, v = p.variant;
      if (v === 'owl') { g.add(sph(.35, s, 0, .95, 0)); for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 6), s); c.position.set(sx * .15, 1.32, 0); g.add(c); } }
      else if (v === 'stag') { g.add(box(.3, .35, .7, s, 0, .9, 0)); g.add(box(.15, .35, .15, s, 0, 1.2, -.35)); for (const sx of [-1, 1]) { const a = box(.04, .45, .04, s, sx * .12, 1.55, -.35); a.rotation.z = sx * .5; g.add(a); } }
      else if (v === 'hare') { const b = sph(.3, s, 0, .85, 0); b.scale.set(1, .9, 1.3); g.add(b); for (const sx of [-1, 1]) g.add(box(.07, .45, .04, s, sx * .08, 1.3, -.2)); }
      else if (v === 'swan') { const b = sph(.3, s, 0, .75, 0); b.scale.set(1, .7, 1.5); g.add(b); const n = new THREE.Mesh(new THREE.TorusGeometry(.25, .05, 6, 12, Math.PI), s); n.position.set(0, 1.0, -.25); n.rotation.y = Math.PI / 2; g.add(n); }
      else { const c = new THREE.Mesh(new THREE.ConeGeometry(.45, 1.9, 12), M.marble); c.position.set(0, 1.45, 0); g.add(c); g.add(sph(.17, M.marble, 0, 2.5, 0)); }
      break;
    }
    case 'fountain': g.add(cyl(.9, .95, .4, M.stone, 0, .2, 0, 20)); g.add(cyl(.12, .16, 1.2, M.stone, 0, .8, 0)); g.add(cyl(.4, .2, .12, M.stone, 0, 1.4, 0)); g.add(cyl(.82, .82, .02, flat(0x203040, 0x0a1420), 0, .38, 0, 20)); break;
    case 'boiler': g.add(cyl(.6, .6, 2, flat(0x3a2a20), 0, 1, 0)); g.add(cyl(.12, .12, 1.2, M.brass, .5, 2.2, 0)); { const w = new THREE.Mesh(new THREE.TorusGeometry(.18, .03, 6, 16), flat(0xa02a1a, 0x300a05)); w.position.set(-.62, 1.1, 0); w.rotation.y = Math.PI / 2; g.add(w); } break;
    case 'hatch': case 'trapdoor': { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), mat('door')); m.rotation.x = -Math.PI / 2; m.position.y = .02; g.add(m); break; }
    case 'stairs': for (let i = 0; i < 6; i++) g.add(box(T * 1.4, .25, .4, M.stone, 0, .12 + i * .25, .8 - i * .4)); break;
    case 'piano': g.add(box(1.5, .9, .7, M.black, 0, .45, 0)); g.add(box(1.5, .05, .25, flat(0xe8e2d0), 0, .92, .3)); break;
    case 'pews': for (let i = 0; i < 2; i++) { g.add(box(1.7, .45, .4, M.wood, 0, .23, i * .9)); g.add(box(1.7, .5, .08, M.wood, 0, .7, i * .9 + .2)); } break;
    case 'harp': g.add(box(.08, 1.6, .08, M.brass, 0, .8, 0)); g.add(box(.08, .08, .8, M.brass, 0, 1.55, .38)); { const a = box(.06, 1.7, .06, M.brass, 0, .8, .4); a.rotation.x = .45; g.add(a); } break;
    case 'crib': g.add(box(1.2, .08, .7, M.wood, 0, .5, 0)); for (let i = -5; i <= 5; i++) { g.add(box(.03, .5, .03, M.wood, i * .11, .75, .34)); g.add(box(.03, .5, .03, M.wood, i * .11, .75, -.34)); } break;
    case 'books': for (let i = 0; i < 4; i++) g.add(box(.5 - i * .05, .12, .35, flat(0x6a5a40 + i * 0x050403), R(-.05, .05), .06 + i * .12, 0)); break;
    case 'post': g.add(cyl(.07, .09, 1.45, M.wood, 0, .72, 0)); g.add(box(.22, .06, .22, M.wood, 0, 1.47, 0)); break;
    case 'housedoor': g.add(box(1.7, 2.7, .12, mat('door'), 0, 1.35, .06)); g.add(box(2.1, .2, .3, M.stone, 0, 2.8, .1)); g.add(sph(.08, M.brass, 0, 1.5, .16)); break;
    case 'figure-locke': g.add(box(.5, .5, .5, M.wood, 0, .25, 0)); g.add(cyl(.2, .26, .8, flat(0x1d1d24), 0, .9, 0)); g.add(sph(.15, flat(0xbfa58a), 0, 1.45, 0)); break;
  }
  return g;
}
function buildProps(spec) {
  [...spec.props, ...(spec.extraProps || [])].forEach(p => {
    const m = propMesh(p);
    if (p.wall) { const w = wallPose(p.x, p.y, p.wall, p.type === 'clock' ? .35 : p.type === 'fireplace' ? .15 : .04); m.position.set(w.x, 0, w.z); m.rotation.y = w.ry; }
    else { const c = ctr(p.x, p.y); m.position.set(c.x, 0, c.z); }
    if (p.hidden) m.visible = false;
    add(m);
    const st = Object.assign({}, p, { mesh: m, hidden: !!p.hidden });
    if (p.block && !p.hidden) S.blocked.add(KEY(p.x, p.y));
    S.propList.push(st); if (p.id) S.props[p.id] = st;
  });
}
/* ---------- items ---------- */
const ITEMH = { pedestal: 1.06, table: .88, desk: .92, planter: .45, floor: .08, statue: .5 };
function itemMesh(kind) {
  const g = new THREE.Group(), e = (c, i) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: i || .25 });
  switch (kind) {
    case 'medallion': g.add(sph(.11, e(0xc9a35a))); break;
    case 'glove': g.add(box(.16, .05, .22, e(0xe2d6bd))); break;
    case 'key': g.add(box(.18, .03, .05, e(0xd4a64a))); break;
    case 'musicbox': g.add(box(.2, .12, .15, e(0x7a4a2a))); break;
    case 'locket': g.add(sph(.06, e(0xe0a84a))); break;
    case 'ammo': g.add(box(.22, .12, .14, e(0x5a5a3a))); break;
    case 'herb': g.add(sph(.15, e(0x5e8a48))); break;
    case 'note': g.add(box(.22, .02, .3, e(0xd8ccb4))); break;
    case 'rose': g.add(box(.02, .3, .02, e(0x2a5a2a))); g.add(sph(.06, e(0xb02030, .5), 0, .17, 0)); break;
    case 'memory': g.add(sph(.12, e(0xf2e8ff, .9))); break;
  }
  return g;
}
function addItem(it) {
  const m = itemMesh(it.kind), c = ctr(it.x, it.y);
  let x = c.x, z = c.z;
  if (it.on === 'statue') { for (const [dx, dy] of N4) if (passable(it.x + dx, it.y + dy)) { x += dx * .65; z += dy * .65; break; } }
  m.position.set(x, ITEMH[it.on] || .08, z); add(m);
  const st = Object.assign({}, it, { mesh: m, taken: false, wx: x, wz: z }); S.items.push(st); return st;
}

/* ---------- figures: dress forms and scarecrows, some of which are ghouls holding still ---------- */
function figureMesh(look) {
  const g = new THREE.Group(), upper = new THREE.Group(); g.add(upper);
  if (look === 'scarecrow') {
    g.add(cyl(.04, .04, 1.2, M.wood, 0, .6, 0));
    const coat = new THREE.Mesh(new THREE.ConeGeometry(.34, 1.1, 8), flat(0x3a2a1a)); coat.position.set(0, 1.1, 0); upper.add(coat);
    upper.add(box(1.3, .08, .08, M.wood, 0, 1.4, 0)); upper.add(sph(.17, M.straw, 0, 1.75, 0));
    const hat = new THREE.Mesh(new THREE.ConeGeometry(.24, .3, 10), flat(0x1a1410)); hat.position.set(0, 1.97, 0); upper.add(hat);
  } else {
    g.add(cyl(.18, .22, .08, M.wood, 0, .04, 0)); g.add(cyl(.03, .03, .5, M.wood, 0, .3, 0));
    const sheet = new THREE.Mesh(new THREE.ConeGeometry(.36, 1.45, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0xd8d2c4, side: THREE.DoubleSide })); sheet.position.y = 1.0; upper.add(sheet);
    upper.add(sph(.17, M.cloth, 0, 1.78, 0));
  }
  return { g, upper };
}
function addFigure(f) {
  const { g, upper } = figureMesh(f.look), c = ctr(f.x, f.y);
  g.position.set(c.x, 0, c.z); g.rotation.y = f.yaw; add(g);
  S.figures.push(Object.assign({}, f, { mesh: g, upper, wx: c.x, wz: c.z, seen: null, decided: null, phase: R(0, 6.28), toppled: 0 }));
}
function inBeam(x, z, maxD) {
  const dx = x - PL.x, dz = z - PL.z, d = Math.hypot(dx, dz); if (d > maxD || d < .3) return false;
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), cos = (dx * fx + dz * fz) / d;
  return cos > Math.cos(.45) && los(PL.x, PL.z, x, z);
}
function decideFigure(f, how, t) {
  if (f.decided) return; f.decided = how;
  const rec = { chapter: S.spec.id, id: f.id, truth: f.type, look: f.look, sway: f.sway, seen: f.seen != null ? (f.seen - S.t0) / 1000 : null,
    decision: how, rt: f.seen != null ? (t - f.seen) / 1000 : null, correct: (how === 'shoot') === (f.type === 'sleeper') };
  S.log.figures.push(rec);
  if (f.type === 'sleeper') { f.mesh.visible = false; const [x, y] = tileOf(f.wx, f.wz); spawnEnemy({ id: f.id + '-awake', type: 'ghoul', x, y, state: 'chase', hp: how === 'shoot' ? 3 : 4, at: [f.wx, f.wz], look: f.look === 'scarecrow' ? 'gardener' : null }); sfxAt('moan', f.wx, f.wz, 1.2); SND.stinger('alert'); }
}
function updateFigures(dt, t) {
  S.figures.forEach(f => {
    if (f.toppled > 0 && f.toppled < 1) { f.toppled = Math.min(1, f.toppled + dt * 2.5); f.mesh.rotation.x = -f.toppled * 1.45; }
    if (f.decided) return;
    if (f.seen == null && inBeam(f.wx, f.wz + 0, 9)) f.seen = t;
    if (f.type === 'sleeper') { const s = (t - 0) / 1000; f.upper.position.x = f.sway * Math.sin(2 * Math.PI * .45 * s + f.phase); f.upper.position.y = f.sway * .4 * Math.sin(2 * Math.PI * .23 * s); }
    const d = Math.hypot(PL.x - f.wx, PL.z - f.wz);
    if (d < 1.9) { decideFigure(f, 'pass', t); if (f.type === 'mannequin' && d < 1.2) { f.toppled = .01; sfx('thud', .3); } }
  });
}

/* ---------- enemies ---------- */
const skin = flat(0x9aa394), rag = flat(0x2a2622), eyeM = new THREE.MeshBasicMaterial({ color: 0xff3322 });
function enemyMesh(type, look) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const big = type === 'guardian', sc = big ? 1.4 : 1, sk = big ? flat(0x5a2a24) : skin;
  const torso = cyl(.2 * sc, .28 * sc, 1.15 * sc, big ? flat(0x1a0d0a) : rag, 0, .95 * sc, 0); torso.rotation.x = .18; body.add(torso);
  body.add(sph(.16 * sc, sk, 0, 1.58 * sc, -.1));
  [-.065, .065].forEach(ex => body.add(sph(.025 * sc, eyeM, ex * sc, 1.6 * sc, -.24 * sc)));
  const arms = [-.25, .25].map(ax => { const a = box(.08 * sc, .08 * sc, .7 * sc, sk, ax * sc, 1.25 * sc, -.38 * sc); body.add(a); return a; });
  [-.1, .1].forEach(lx => body.add(box(.11 * sc, .5 * sc, .11 * sc, rag, lx * sc, .25 * sc, 0)));
  if (look === 'gardener') { const h = new THREE.Mesh(new THREE.ConeGeometry(.24, .28, 10), flat(0x1a1410)); h.position.set(0, 1.8, -.1); body.add(h); }
  return { g, body, arms };
}
function spawnEnemy(e) {
  const { g, body, arms } = enemyMesh(e.type, e.look), c = ctr(e.x, e.y), x = e.at ? e.at[0] : c.x, z = e.at ? e.at[1] : c.z;
  g.position.set(x, 0, z); add(g);
  const o = Object.assign({ hp: e.type === 'guardian' ? Infinity : 4, speed: e.type === 'guardian' ? .9 : 1.05 }, e, { g, body, arms, x, z, cd: 0, lost: 0, next: null, bfsT: 0, moanT: R(2, 6), stagger: 0, fall: 0, t: R(0, 6), pi: 0 });
  if (o.type === 'guardian') o.allowed = new Set([S.spec.roomAt(e.x, e.y), 'Stair Landing']);
  S.enemies.push(o); return o;
}
function isSafe(x, y) { const r = S.spec.roomAt(x, y); return r && S.spec.safe.includes(r); }
function ghPass(o, x, y) {
  if (!passable(x, y) || isSafe(x, y) || cell(x, y) === 'V') return false;
  if (o.allowed) { const r = S.spec.roomAt(x, y); if (r && !o.allowed.has(r)) return false; }
  return true;
}
function opaque(x, y) { const ch = cell(x, y); if (!ch || ch === '#') return true; if (ch === 'P') return !S.plugs[KEY(x, y)]; if (ch === 'D') { const d = S.doorAt[KEY(x, y)]; return !(d && d.open); } return false; }
function los(ax, az, bx, bz) { const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / .25); for (let i = 1; i < n; i++) { const t = i / n, [tx, tz] = tileOf(ax + (bx - ax) * t, az + (bz - az) * t); if (opaque(tx, tz)) return false; } return true; }
function bfsNext(o, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return null; const prev = new Map([[KEY(sx, sy), null]]), q = [[sx, sy]];
  while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = KEY(nx, ny); if (prev.has(k) || !(ghPass(o, nx, ny) || (nx === tx && ny === ty && passable(nx, ny)))) continue; prev.set(k, [x, y]); q.push([nx, ny]); } if (prev.size > 900) break; }
  let cur = KEY(tx, ty); if (!prev.has(cur)) return null; let step = [tx, ty];
  while (prev.get(cur) && KEY(...prev.get(cur)) !== KEY(sx, sy)) { step = prev.get(cur); cur = KEY(...step); } return step;
}
function wake(id, mul) { const o = S.enemies.find(e => e.id === id); if (!o) return; o.state = 'chase'; o.hunt = true; if (mul) o.speed *= mul; sfxAt(o.type === 'guardian' ? 'roar' : 'moan', o.x, o.z); SND.stinger('alert'); }
function updateEnemies(dt) {
  S.enemies.forEach(o => {
    if (o.state === 'dead') { if (o.fall < 1) { o.fall = Math.min(1, o.fall + dt * 1.8); o.body.rotation.x = -o.fall * Math.PI / 2; o.body.position.y = o.fall * .15; } return; }
    if (o.state === 'dormant') return;
    o.t += dt; o.cd -= dt; o.stagger = Math.max(0, o.stagger - dt);
    const dx = PL.x - o.x, dz = PL.z - o.z, d = Math.hypot(dx, dz), [ptx, pty] = tileOf(PL.x, PL.z);
    const playerSafe = isSafe(ptx, pty), sightR = o.type === 'guardian' ? 8 : 11;
    const see = !playerSafe && d < sightR && los(o.x, o.z, PL.x, PL.z) && (!o.allowed || o.allowed.has(S.spec.roomAt(ptx, pty)));
    if (see && o.state !== 'chase') { o.state = 'chase'; sfxAt(o.type === 'guardian' ? 'roar' : 'moan', o.x, o.z); SND.stinger('alert'); }
    if (o.state === 'chase' && !o.hunt) { if (see) o.lost = 0; else if ((o.lost += dt) > 7) o.state = o.patrol ? 'patrol' : 'idle'; }
    let tx = null, tz = null, sp = o.speed;
    if (o.state === 'chase' && !playerSafe) {
      if (see && d < 3.5) { tx = PL.x; tz = PL.z; }
      else { if ((o.bfsT -= dt) <= 0) { o.bfsT = .4; const [gx, gy] = tileOf(o.x, o.z); o.next = bfsNext(o, gx, gy, ptx, pty); } if (o.next) { const c = ctr(o.next[0], o.next[1]); tx = c.x; tz = c.z; } }
    } else if (o.state === 'patrol' && o.patrol) {
      const w = o.patrol[o.pi % o.patrol.length], c = ctr(w[0], w[1]); sp *= .55;
      if (Math.hypot(c.x - o.x, c.z - o.z) < .4) o.pi++;
      else { if ((o.bfsT -= dt) <= 0) { o.bfsT = .5; const [gx, gy] = tileOf(o.x, o.z); o.next = bfsNext(o, gx, gy, w[0], w[1]); } if (o.next) { const c2 = ctr(o.next[0], o.next[1]); tx = c2.x; tz = c2.z; } else { tx = c.x; tz = c.z; } }
    }
    if (tx !== null && o.stagger <= 0) {
      const vx = tx - o.x, vz = tz - o.z, m = Math.hypot(vx, vz) || 1, stx = vx / m * sp * dt, stz = vz / m * sp * dt;
      const ok = (x, z) => { const [a, b] = tileOf(x, z); return ghPass(o, a, b); };
      if (d > .7) { if (ok(o.x + stx, o.z)) o.x += stx; if (ok(o.x, o.z + stz)) o.z += stz; }
      o.g.rotation.y = Math.atan2(-vx, -vz);
      if ((o.stepT = (o.stepT || 0) - dt) <= 0) { o.stepT = (o.type === 'guardian' ? .75 : .6) * o.speed / sp; if (d < 14) sfxAt('drag', o.x, o.z, o.type === 'guardian' ? 1 : .7); }
    }
    o.g.position.set(o.x, 0, o.z);
    o.body.rotation.z = Math.sin(o.t * 3) * .06; o.body.position.y = Math.abs(Math.sin(o.t * 3)) * .04;
    o.arms.forEach((a, i) => a.rotation.x = Math.sin(o.t * 3 + i * 1.4) * .2);
    if ((o.moanT -= dt) <= 0) { o.moanT = R(4, 9); if (d < 16) sfxAt(o.type === 'guardian' ? 'roar' : 'moan', o.x, o.z, o.type === 'guardian' ? .6 : .9); }
    const reach = o.type === 'guardian' ? 1.3 : .95;
    if (o.state === 'chase' && d < reach && o.cd <= 0 && !S.paused && !playerSafe) { o.cd = o.type === 'guardian' ? 2.2 : 1.7; hurtPlayer(dx / d, dz / d, o.type === 'guardian' ? 2 : 1); }
  });
}

/* ---------- follower (Locke, in the finale) ---------- */
function startFollower(id) {
  const p = S.props[id]; if (p) { p.mesh.visible = false; S.blocked.delete(KEY(p.x, p.y)); }
  const g = new THREE.Group(); g.add(cyl(.2, .24, 1.2, flat(0x1d1d24), 0, .9, 0)); g.add(sph(.15, flat(0xbfa58a), 0, 1.65, 0)); g.add(cyl(.05, .05, .6, flat(0x1d1d24), 0, .25, 0));
  const c = p ? ctr(p.x, p.y) : new THREE.Vector3(PL.x, 0, PL.z); g.position.set(c.x, 0, c.z); add(g);
  S.follower = { g, x: c.x, z: c.z, trail: [] };
}
function updateFollower(dt) {
  const f = S.follower; if (!f) return;
  const last = f.trail[f.trail.length - 1]; if (!last || Math.hypot(last[0] - PL.x, last[1] - PL.z) > .3) f.trail.push([PL.x, PL.z]);
  while (f.trail.length > 2 && Math.hypot(f.trail[0][0] - PL.x, f.trail[0][1] - PL.z) > 1.6 && Math.hypot(f.trail[0][0] - f.x, f.trail[0][1] - f.z) < .2) f.trail.shift();
  const tgt = f.trail.find(p => Math.hypot(p[0] - PL.x, p[1] - PL.z) > 1.4) || null;
  if (tgt && Math.hypot(PL.x - f.x, PL.z - f.z) > 1.5) { const vx = tgt[0] - f.x, vz = tgt[1] - f.z, m = Math.hypot(vx, vz); if (m > .05) { const st = Math.min(m, 2.8 * dt); f.x += vx / m * st; f.z += vz / m * st; f.g.rotation.y = Math.atan2(-vx, -vz); } if (m < .2) f.trail.shift(); }
  if (Math.hypot(PL.x - f.x, PL.z - f.z) > 9) { f.x = PL.x; f.z = PL.z; f.trail = []; }
  f.g.position.set(f.x, 0, f.z);
}
/* ---------- crows (prologue targets) ---------- */
function addTarget(t) {
  const g = new THREE.Group(), c = ctr(t.x, t.y), blk = flat(0x0d0d10);
  const body = sph(.13, blk, 0, 0, 0); body.scale.set(1, .85, 1.5); g.add(body); g.add(sph(.08, blk, 0, .1, -.16));
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.025, .09, 6), flat(0x3a3020)); beak.rotation.x = -Math.PI / 2; beak.position.set(0, .09, -.27); g.add(beak);
  g.position.set(c.x, t.h, c.z); g.rotation.y = R(0, 6.28); add(g);
  S.targets.push(Object.assign({}, t, { mesh: g, wx: c.x, wz: c.z, alive: true, vy: 0, t: R(0, 6) }));
}
function updateTargets(dt) {
  S.targets.forEach(t => {
    t.t += dt;
    if (t.alive) { t.mesh.position.y = t.h + Math.abs(Math.sin(t.t * 1.7)) * .02; if (Math.random() < dt * .3) t.mesh.rotation.y += R(-.6, .6); return; }
    if (!t.mesh.visible) return; t.vy += dt * 3; t.mesh.position.y += t.vy * dt * 2; t.mesh.position.x += t.dx * dt * 4; t.mesh.position.z += t.dz * dt * 4;
    if (t.mesh.position.y > WH + 4) t.mesh.visible = false;
  });
}
function holdEnemy(id, on) { const o = S.enemies.find(e => e.id === id); if (!o) return; if (on) { o.held = o.state; o.state = 'dormant'; } else if (o.held) { o.state = o.held; o.held = null; } }

/* ---------- player ---------- */
const PL = { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, stepAcc: 0, lastTile: '' };
const RAD = .28;
function standable(x, y) { return passable(x, y) || cell(x, y) === 'V'; }
function canStand(x, z) { for (const [dx, dz] of [[-RAD, -RAD], [RAD, -RAD], [-RAD, RAD], [RAD, RAD]]) { const [tx, tz] = tileOf(x + dx, z + dz); if (!standable(tx, tz)) return false; } return true; }
const keys = {}; let joy = { x: 0, y: 0 }, locked = false;
addEventListener('keydown', e => {
  if (!S.running) return;
  if (dlgOpen() && (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); advanceDialog(); return; }
  if (!$('#mapView').hidden && (e.code === 'KeyM' || e.code === 'Escape' || e.code === 'KeyE')) { closeMap(); return; }
  keys[e.code] = true; if (S.paused) return;
  if (e.code === 'KeyE') use(); if (e.code === 'KeyM') tryMap(); if (e.code === 'Space' || e.code === 'KeyF') { e.preventDefault(); fire(); }
});
addEventListener('keyup', e => keys[e.code] = false);
cvEl.addEventListener('click', () => {
  if (!S.running || TOUCH) return; if (dlgOpen()) { advanceDialog(); return; }
  if (!locked) { try { const p = cvEl.requestPointerLock && cvEl.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } return; }
  if (!S.paused) fire();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cvEl; });
addEventListener('mousemove', e => { if (TOUCH || S.paused) return; if (locked || e.buttons === 1) { PL.yaw -= e.movementX * .0024; PL.pitch = Math.max(-1.2, Math.min(1.2, PL.pitch - e.movementY * .0024)); } });
if (TOUCH) {
  $('#touch').hidden = false; $('#keyhelp').textContent = 'Left stick move · drag to look · Fire · Use · Map at the plan';
  const jz = $('#joy'), kn = $('#knob'); let jid = null;
  const jm = e => { const r = jz.getBoundingClientRect(); let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } joy = { x: dx, y: dy }; kn.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; };
  jz.addEventListener('pointerdown', e => { jid = e.pointerId; jz.setPointerCapture(jid); jm(e); });
  jz.addEventListener('pointermove', e => { if (e.pointerId === jid) jm(e); });
  const jend = () => { jid = null; joy = { x: 0, y: 0 }; kn.style.transform = ''; }; jz.addEventListener('pointerup', jend); jz.addEventListener('pointercancel', jend);
  let lid = null, lx = 0, ly = 0;
  cvEl.addEventListener('pointerdown', e => { if (dlgOpen()) { advanceDialog(); return; } lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
  cvEl.addEventListener('pointermove', e => { if (e.pointerId !== lid || S.paused) return; PL.yaw -= (e.clientX - lx) * .006; PL.pitch = Math.max(-1.1, Math.min(1.1, PL.pitch - (e.clientY - ly) * .006)); lx = e.clientX; ly = e.clientY; });
  ['pointerup', 'pointercancel'].forEach(ev => cvEl.addEventListener(ev, e => { if (e.pointerId === lid) lid = null; }));
  $('#tFire').addEventListener('pointerdown', e => { e.preventDefault(); if (dlgOpen()) return advanceDialog(); if (!S.paused) fire(); });
  $('#tUse').addEventListener('pointerdown', e => { e.preventDefault(); if (dlgOpen()) return advanceDialog(); if (!S.paused) use(); });
  $('#tMap').addEventListener('pointerdown', e => { e.preventDefault(); if (!$('#mapView').hidden) return closeMap(); if (!S.paused) tryMap(); });
}
$('#dialog').addEventListener('click', () => advanceDialog());
let lastScrape = 0;
function updatePlayer(dt, t) {
  let f = 0, s = 0;
  if (keys.KeyW || keys.ArrowUp) f += 1; if (keys.KeyS || keys.ArrowDown) f -= 1; if (keys.KeyD) s += 1; if (keys.KeyA) s -= 1;
  if (keys.ArrowLeft) PL.yaw += 2.2 * dt; if (keys.ArrowRight) PL.yaw -= 2.2 * dt;
  if (TOUCH) { f -= joy.y; s += joy.x; }
  const mag = Math.min(1, Math.hypot(f, s)), running = keys.ShiftLeft || keys.ShiftRight || (TOUCH && mag > .92), run = running ? 1.55 : 1;
  const sp = 2.5 * run * (S.hp <= 1 ? .75 : 1);
  if (mag > .05) {
    const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw), rx = Math.cos(PL.yaw), rz = -Math.sin(PL.yaw);
    const vx = (fx * f + rx * s) / Math.max(1, mag) * sp * mag, vz = (fz * f + rz * s) / Math.max(1, mag) * sp * mag, ox = PL.x, oz = PL.z;
    let blocked = false;
    if (canStand(PL.x + vx * dt, PL.z)) PL.x += vx * dt; else { blocked = true; bump(PL.x + Math.sign(vx) * .5, PL.z); }
    if (canStand(PL.x, PL.z + vz * dt)) PL.z += vz * dt; else { blocked = true; bump(PL.x, PL.z + Math.sign(vz) * .5); }
    const moved = Math.hypot(PL.x - ox, PL.z - oz), m = S.log.motor;
    m.dist += moved; if (running) m.runDist += moved;
    if (blocked && t - lastScrape > 500) { lastScrape = t; m.scrapes++; }
    const [tx, ty] = tileOf(PL.x, PL.z);
    if (!running && mag > .8 && straightTile(tx, ty)) { m.straightT += dt; m.straightD += moved; }
    PL.bob += moved * 3.2; PL.stepAcc += moved; if (PL.stepAcc > .9 * run) { PL.stepAcc = 0; SND.sfx('step', { surface: themeAt(tx, ty).floor }); }
  }
  camera.position.set(PL.x, 1.6 + Math.sin(PL.bob) * .035, PL.z); camera.rotation.set(PL.pitch, PL.yaw, 0);
  const [tx, ty] = tileOf(PL.x, PL.z), k = KEY(tx, ty);
  if (k !== PL.lastTile) { const prev = PL.lastTile; PL.lastTile = k; onTile(tx, ty, prev); }
  if (t - (S.lastSample || 0) > 200) { S.lastSample = t; S.log.path.push([+((t - S.t0) / 1000).toFixed(2), +PL.x.toFixed(2), +PL.z.toFixed(2), +PL.yaw.toFixed(2)]); }
}
function straightTile(x, y) { const n = N4.map(([dx, dy]) => passable(x + dx, y + dy)); return (n[0] && n[1] && !n[2] && !n[3]) || (n[2] && n[3] && !n[0] && !n[1]); }
function bump(x, z) {
  const [tx, ty] = tileOf(x, z), k = KEY(tx, ty);
  if (cell(tx, ty) === 'P' && !S.plugs[k] && planPassable(tx, ty) && now() - (S.lastBump || 0) > 1200) { S.lastBump = now(); logEvent('stale-bump', { tile: [tx, ty] }); S.log.staleBumps++; }
}

/* ---------- tiles: rooms, junction choices, veils ---------- */
function goalDist(passFn) {
  if (!S.goalSet) return null; const d = new Map(), q = [];
  S.goalTiles.forEach(([x, y]) => { d.set(KEY(x, y), 0); q.push([x, y]); });
  while (q.length) { const [x, y] = q.shift(), dd = d.get(KEY(x, y)); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = KEY(nx, ny); if (!d.has(k) && passFn(nx, ny)) { d.set(k, dd + 1); q.push([nx, ny]); } } }
  return d;
}
function onTile(tx, ty, prev) {
  const room = S.spec.roomAt(tx, ty);
  if (room && room !== S.room) { S.room = room; showRoom(room); if (!S.visited[room]) { S.visited[room] = true; logEvent('enter', { room }); } }
  if (prev && S.goalSet) {
    const [px, py] = prev.split(',').map(Number), deg = N4.filter(([dx, dy]) => passable(px + dx, py + dy)).length;
    const diag = [[1, 1], [1, -1], [-1, 1], [-1, -1]].filter(([dx, dy]) => passable(px + dx, py + dy)).length;
    if (deg >= 3 && diag <= 1) {
      const dt_ = goalDist((x, y) => passable(x, y)), dp = goalDist((x, y) => planPassable(x, y) && !S.blocked.has(KEY(x, y)));
      const opts = N4.map(([dx, dy]) => [px + dx, py + dy]).filter(([x, y]) => passable(x, y));
      const best = d => { const v = opts.map(([x, y]) => d.has(KEY(x, y)) ? d.get(KEY(x, y)) : 1e9), m = Math.min(...v); return opts.filter((o, i) => v[i] === m).map(([x, y]) => KEY(x, y)); };
      const bt = best(dt_), bp = best(dp), ch = KEY(tx, ty);
      S.log.junctions.push({ t: +((now() - S.t0) / 1000).toFixed(2), at: [px, py], to: [tx, ty], options: opts.length, optimal: bt.includes(ch), planOptimal: bp.includes(ch),
        conflict: bt.join() !== bp.join(), changed: !!S.changedOnce, distToGoal: dt_.get(prev) ?? null, leg: S.leg ? S.leg.name : null });
    }
  }
  if (cell(tx, ty) === 'V' && now() > (S.veilLock || 0)) { const v = S.veils.find(v => v.x === tx && v.y === ty); if (v) return throughVeil(v); }
  checkClosures(tx, ty);
  checkLeg(tx, ty);
  if (S.hooks.onTile) S.hooks.onTile(tx, ty, room);
}
/* closures the plan still shows as open: when they are first found, and when a player comes back to one already found */
function checkClosures(tx, ty) {
  S.closures = S.closures || {};
  for (const [dx, dy] of N4) {
    const x = tx + dx, y = ty + dy, k = KEY(x, y);
    if (cell(x, y) !== 'P' || S.plugs[k] || !planPassable(x, y)) continue;
    const c = S.closures[k], t = now();
    if (!c) { S.closures[k] = { found: t, last: t, visits: 1 }; logEvent('closure-found', { tile: [x, y], leg: S.leg ? S.leg.name : null }); S.log.closureFinds = (S.log.closureFinds || 0) + 1; }
    else { if (t - c.last > 8000) { c.visits++; logEvent('closure-revisit', { tile: [x, y], leg: S.leg ? S.leg.name : null, since: +((t - c.found) / 1000).toFixed(1) }); S.log.closureRevisits = (S.log.closureRevisits || 0) + 1; } c.last = t; }
  }
}
function throughVeil(v) {
  const dest = S.hooks.onVeil && S.hooks.onVeil(v); if (!dest) return;
  S.veilLock = now() + 800; S.paused = true; sfx('veil'); const fd = $('#fade'); fd.style.opacity = 1;
  setTimeout(() => {
    const c = ctr(dest.x, dest.y); PL.x = c.x; PL.z = c.z; PL.yaw = FACE[dest.face]; PL.pitch = 0; PL.lastTile = KEY(dest.x, dest.y);
    S.room = null; onTileRoomOnly(dest.x, dest.y); fd.style.opacity = 0; S.paused = dlgOpen();
  }, 380);
}
function onTileRoomOnly(x, y) { const room = S.spec.roomAt(x, y); if (room && room !== S.room) { S.room = room; showRoom(room); if (!S.visited[room]) { S.visited[room] = true; logEvent('enter', { room }); } } }

/* ---------- combat ---------- */
function hurtPlayer(nx, nz, dmg) {
  S.hp -= dmg || 1; S.log.dmg += dmg || 1; sfx('hurt'); $('#hurt').style.opacity = 1; setTimeout(() => $('#hurt').style.opacity = S.hp <= 1 ? .45 : 0, 450);
  for (let k = .8; k > 0; k -= .1) if (canStand(PL.x + nx * k, PL.z + nz * k)) { PL.x += nx * k; PL.z += nz * k; break; }
  hud(); if (S.hp <= 0) die();
}
function die() {
  S.paused = true; S.log.deaths++; logEvent('death'); SND.stinger('death'); if (document.exitPointerLock) document.exitPointerLock();
  showScreen('end', `<h1 style="color:var(--blood)">You Died</h1><p>The house keeps you a while, then lets you go.</p><button class="btn" id="retry">Wake in the ${S.spec.safe[0].toLowerCase()}</button>`,
    () => $('#retry').onclick = () => { $('#end').hidden = true; S.hp = 3; placeAtSpawn(); S.enemies.forEach(o => { if (o.state === 'chase' && !o.hunt) o.state = o.patrol ? 'patrol' : 'idle'; }); hud(); S.paused = false; $('#hurt').style.opacity = 0; });
}
function aimTarget(o, dir) {
  let best = null;
  const cand = S.enemies.filter(e => e.state !== 'dead' && e.state !== 'dormant').map(e => [e.x, e.z]).concat(S.figures.filter(f => !f.decided).map(f => [f.wx, f.wz])).concat(S.targets.filter(t => t.alive).map(t => [t.wx, t.wz, t.h]));
  cand.forEach(([x, z, h]) => { const v = new THREE.Vector3(x - o.x, (h || 1.2) - o.y, z - o.z), d = v.length(); if (d > 15 || !los(o.x, o.z, x, z)) return; const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(dir) / d))) * 180 / Math.PI; if (!best || ang < best) best = ang; });
  return best;
}
function fire() {
  if (S.ammo <= 0) { sfx('empty'); toast('Out of ammunition.'); return; }
  S.ammo--; S.log.shotsN++; sfx('shot'); muzzle.intensity = 4; setTimeout(() => muzzle.intensity = 0, 70); hud();
  const o = camera.position.clone(), dir = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  let wall = 30; for (let s = .2; s < 30; s += .15) { const p = o.clone().addScaledVector(dir, s), [tx, tz] = tileOf(p.x, p.z); if (opaque(tx, tz) || p.y < 0 || p.y > WH) { wall = s; break; } }
  let best = null;
  const test = (cx, cy, cz, r, hit) => { const c = new THREE.Vector3(cx, cy, cz), oc = c.clone().sub(o), tc = oc.dot(dir); if (tc < 0 || tc > wall) return; if (oc.lengthSq() - tc * tc < r * r && (!best || tc < best.t)) best = Object.assign({ t: tc }, hit); };
  S.enemies.forEach(g => { if (g.state === 'dead' || g.state === 'dormant') return; const sc = g.type === 'guardian' ? 1.4 : 1; test(g.x, 1.58 * sc, g.z, .2 * sc, { g, dmg: 2 }); test(g.x, 1.0 * sc, g.z, .36 * sc, { g, dmg: 1 }); });
  S.figures.forEach(f => { if (f.decided && f.type === 'sleeper') return; if (f.toppled >= 1) return; test(f.wx, 1.2, f.wz, .42, { f }); });
  S.targets.forEach(tg => { if (tg.alive) test(tg.wx, tg.h, tg.wz, .24, { tg }); });
  const err = aimTarget(o, dir);
  S.log.shots.push({ t: +((now() - S.t0) / 1000).toFixed(2), hit: !!best, aimErr: err == null ? null : +err.toFixed(1), target: best ? (best.tg ? 'crow' : best.f ? 'figure:' + best.f.type : best.g.type) : null });
  if (!best) return;
  if (best.tg) { const tg = best.tg; tg.alive = false; tg.vy = 1; const a = R(0, 6.28); tg.dx = Math.cos(a); tg.dz = Math.sin(a); sfxAt('caw', tg.wx, tg.wz); S.log.hits++; logEvent('crow', { id: tg.id }); if (S.hooks.onTarget) S.hooks.onTarget(tg); return; }
  if (best.f) { const f = best.f; if (!f.decided) decideFigure(f, 'shoot', now()); if (f.type === 'mannequin') { f.mesh.rotation.z = .15; setTimeout(() => f.mesh.rotation.z = 0, 160); toast(f.look === 'scarecrow' ? 'Only a scarecrow.' : 'Only a dress form under a sheet.'); } return; }
  const g = best.g; S.log.hits++;
  if (g.type === 'guardian') { g.stagger = 2.5; g.state = 'chase'; return; }
  g.hp -= best.dmg; g.stagger = .45; g.state = 'chase'; g.x += dir.x * .25; g.z += dir.z * .25;
  if (g.hp <= 0) { g.state = 'dead'; sfx('thud', .6); logEvent('kill', { id: g.id }); }
}

/* ---------- dialog, HUD, toast ---------- */
let DQ = [], dDone = null;
function dlgOpen() { return !$('#dialog').hidden; }
function say(lines, who = '', done) { DQ = lines.slice(); dDone = done || null; $('#dWho').textContent = who; $('#dWho').hidden = !who; S.paused = true; showLine(); }
function showLine() { $('#dialog').hidden = false; $('#dText').textContent = DQ.shift(); }
function advanceDialog() { if (DQ.length) { showLine(); return; } $('#dialog').hidden = true; S.paused = !$('#mapView').hidden || !$('#end').hidden; const d = dDone; dDone = null; if (d) d(); }
let toastT = 0; function toast(m) { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('on'), 1800); }
function hud() {
  const c = $('#cond'), i = Math.max(0, Math.min(3, S.hp)); c.textContent = ['Danger', 'Danger', 'Caution', 'Fine'][i]; c.className = ['danger', 'danger', 'caution', 'fine'][i];
  $('#ammo').textContent = 'Handgun ' + S.ammo;
  $('#inv').innerHTML = Object.keys(S.inv).filter(k => S.inv[k]).map(k => S.invNames[k] || k).join('<br>');
}
let roomT = 0; function showRoom(n) { const r = $('#room'); r.textContent = n; r.classList.add('on'); clearTimeout(roomT); roomT = setTimeout(() => r.classList.remove('on'), 2600); }
function logEvent(name, data) { S.log.events.push(Object.assign({ name, t: +((now() - S.t0) / 1000).toFixed(2), tile: tileOf(PL.x, PL.z) }, data || {})); }
/* ---------- interaction ---------- */
function interactables() {
  const out = [];
  if (S.homing) return [{ x: PL.x, z: PL.z, label: S.homing.label, kind: 'homing', always: true }];
  S.items.forEach(it => { if (!it.taken) out.push({ x: it.wx, z: it.wz, label: (it.read ? 'Read ' : 'Take ') + it.name.replace(/^(A|An) /, 'the '), kind: 'item', ref: it }); });
  S.propList.forEach(p => {
    if (p.hidden) return;
    const usable = p.interact || p.lines || p.type === 'plan' || p.type === 'plinth'; if (!usable) return;
    let x, z; if (p.wall) { const w = wallPose(p.x, p.y, p.wall, .3); x = w.x; z = w.z; } else { const c = ctr(p.x, p.y); x = c.x; z = c.z; }
    out.push({ x, z, label: p.label || (p.type === 'plan' ? 'Read the plan' : 'Examine'), kind: 'prop', ref: p });
  });
  Object.values(S.doors).forEach(d => { if (!d.open) { const c = ctr(d.x, d.y); out.push({ x: c.x, z: c.z, label: 'Open the door', kind: 'door', ref: d }); } });
  return out;
}
let focus = null;
function findFocus() {
  const fx = -Math.sin(PL.yaw), fz = -Math.cos(PL.yaw); let best = null, bs = 1e9;
  interactables().forEach(o => {
    if (o.always) { best = o; bs = -1; return; }
    const dx = o.x - PL.x, dz = o.z - PL.z, d = Math.hypot(dx, dz); if (d > 2.1) return;
    const dot = (dx * fx + dz * fz) / (d || 1); if (dot < .55 && d > .6) return; const sc = d - dot; if (sc < bs) { bs = sc; best = o; }
  });
  focus = best; const p = $('#prompt');
  if (best && !S.paused && S.running) { p.textContent = (TOUCH ? 'Use · ' : 'E · ') + best.label; p.classList.add('on'); } else p.classList.remove('on');
}
function use() {
  if (!focus) return; const o = focus, h = S.hooks;
  if (o.kind === 'homing') return finishHoming();
  if (o.kind === 'item') {
    const it = o.ref; if (h.canTake && h.canTake(it) === false) return;
    if (it.read) { logEvent('read', { id: it.id }); return say(it.lines, it.name); }
    it.taken = true; it.mesh.visible = false; sfx('pickup');
    if (it.ammo) S.ammo += it.ammo; else if (it.heal) { S.hp = 3; $('#hurt').style.opacity = 0; }
    else { const id = it.replaces || it.id; S.inv[id] = true; S.invNames[id] = it.name; }
    logEvent('take', { id: it.id }); hud();
    say(it.lines, '', () => { if (h.onTake) h.onTake(it); });
    return;
  }
  if (o.kind === 'prop') {
    const p = o.ref; if (h.onProp && h.onProp(p)) return;
    if (p.type === 'plan') return openMap();
    if (p.lines) return say(p.lines, p.name || '');
    return;
  }
  if (o.kind === 'door') {
    const d = o.ref; let ok = false;
    if (d.needs.startsWith('side:')) ok = PL.x > ctr(d.x, d.y).x; else if (d.needs.startsWith('flag:')) ok = !!S.flags[d.needs.slice(5)]; else ok = !!S.inv[d.needs];
    if (!ok) return say(d.locked);
    if (!d.needs.includes(':')) { S.inv[d.needs] = false; hud(); }
    d.open = true; sfx('creak'); logEvent('door', { id: d.id });
    say(S.spec.doors.find(x => x.id === d.id).open, '', () => { if (h.onDoor) h.onDoor(d); });
  }
}

/* ---------- the plan (the only map, and it does not update) ---------- */
let mapT0 = 0;
function openMap() {
  S.paused = true; mapT0 = now(); const c = $('#mapCv'); drawPlan(c.getContext('2d'), c.width, c.height);
  $('#mapNote').textContent = (S.hooks.planNote && S.hooks.planNote()) || 'It hangs here. You can only read it here.';
  $('#mapView').hidden = false; if (document.exitPointerLock) document.exitPointerLock();
}
function closeMap() { $('#mapView').hidden = true; const d = (now() - mapT0) / 1000; S.log.mapViews.push({ t: +((mapT0 - S.t0) / 1000).toFixed(2), dur: +d.toFixed(2), changed: !!S.changedOnce }); S.paused = false; }
$('#mapClose').onclick = closeMap;
function tryMap() { const p = S.propList.find(p => p.type === 'plan'); if (!p) return; const w = wallPose(p.x, p.y, p.wall, .3); if (Math.hypot(PL.x - w.x, PL.z - w.z) < 2.6) openMap(); else toast('The only map hangs in the ' + S.spec.safe[0].toLowerCase() + '.'); }

/* ---------- homing: walk back in the dark, then mark where you think you are ---------- */
function homing(target, label, cb, meta) {
  const c = Array.isArray(target) ? ctr(target[0], target[1]) : target;
  S.homing = { tx: c.x, tz: c.z, label, cb, t0: now(), sx: PL.x, sz: PL.z, d0: S.log.motor.dist, meta: meta || { kind: 'free' } };
  S.homing.timer = setTimeout(() => { if (S.homing) finishHoming(true); }, 90000);
}
function finishHoming(timeout) {
  const h = S.homing; if (!h) return; S.homing = null; clearTimeout(h.timer); sfx('match');
  const err = Math.hypot(PL.x - h.tx, PL.z - h.tz), res = { err: +err.toFixed(2), dx: +(PL.x - h.tx).toFixed(2), dz: +(PL.z - h.tz).toFixed(2),
    startDist: +Math.hypot(h.sx - h.tx, h.sz - h.tz).toFixed(2), walked: +(S.log.motor.dist - h.d0).toFixed(2), dur: +((now() - h.t0) / 1000).toFixed(2), timeout: !!timeout };
  // in the frame of the correct homing vector: distance ratio and signed turning error
  const cx_ = h.tx - h.sx, cz_ = h.tz - h.sz, rx_ = PL.x - h.sx, rz_ = PL.z - h.sz, cl = Math.hypot(cx_, cz_), rl = Math.hypot(rx_, rz_);
  res.distRatio = cl > .1 ? +(rl / cl).toFixed(3) : null;
  res.angErr = cl > .1 && rl > .1 ? +(Math.atan2(cx_ * rz_ - cz_ * rx_, cx_ * rx_ + cz_ * rz_) * 180 / Math.PI).toFixed(1) : null;
  Object.assign(res, h.meta);
  S.log.homing.push(res); logEvent('homing', res); h.cb(res);
}

/* ---------- legs: a trip to one goal, scored against the shortest true route at its start ---------- */
function shortestFrom(tile, tiles) {
  const goal = new Set(tiles.map(([x, y]) => KEY(x, y))), d = new Map([[KEY(...tile), 0]]), q = [tile];
  while (q.length) { const [x, y] = q.shift(), dd = d.get(KEY(x, y)); if (goal.has(KEY(x, y))) return dd; for (const [dx, dy] of N4) { const k = KEY(x + dx, y + dy); if (!d.has(k) && passable(x + dx, y + dy)) { d.set(k, dd + 1); q.push([x + dx, y + dy]); } } }
  return null;
}
function startLeg(name, tiles) {
  const t = tileOf(PL.x, PL.z);
  S.leg = { name, tiles: new Set(tiles.map(([x, y]) => KEY(x, y))), t0: now(), d0: S.log.motor.dist, scrapes0: S.log.motor.scrapes, start: t, shortest: shortestFrom(t, tiles), j0: S.log.junctions.length };
  api.goal(tiles); logEvent('leg-start', { leg: name, shortest: S.leg.shortest });
}
function checkLeg(tx, ty) {
  const L = S.leg; if (!L || !L.tiles.has(KEY(tx, ty))) return;
  S.leg = null;
  const walked = S.log.motor.dist - L.d0, J = S.log.junctions.slice(L.j0);
  const rec = { leg: L.name, shortest: L.shortest, walked: +walked.toFixed(1), efficiency: L.shortest ? +(walked / (L.shortest * T)).toFixed(3) : null,
    dur: +((now() - L.t0) / 1000).toFixed(1), junctions: J.length, optimal: J.filter(j => j.optimal).length, scrapes: S.log.motor.scrapes - L.scrapes0 };
  S.log.legs.push(rec); logEvent('leg-end', rec);
  if (S.hooks.onLegEnd) S.hooks.onLegEnd(L.name);
}

/* ---------- the lantern: triangle completion in the dark ---------- */
function lanternTrial(design, cb) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe3a0, fog: false })));
  g.add(new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: .22, fog: false, depthWrite: false })));
  const [x, z] = design.pts[0]; g.position.set(x, 1.25, z); add(g);
  S.lantern = { g, design, x, z, i: 0, phase: 'wait', cb, t: 0 };
}
function updateLantern(dt) {
  const L = S.lantern; if (!L) return; L.t += dt;
  const pd = Math.hypot(PL.x - L.x, PL.z - L.z), pts = L.design.pts;
  if (L.phase === 'wait' && pd < 1.3) { L.phase = 'walk'; L.i = 1; logEvent('lantern-start', { design: L.design }); }
  else if (L.phase === 'walk') {
    if (pd < 2.6) { const [tx, tz] = pts[L.i], vx = tx - L.x, vz = tz - L.z, m = Math.hypot(vx, vz), st = Math.min(m, 1.3 * dt); if (m > 1e-3) { L.x += vx / m * st; L.z += vz / m * st; } if (m < .05) { L.i++; if (L.i >= pts.length) L.phase = 'end'; } }
  } else if (L.phase === 'end' && pd < 1.3) {
    S.world.remove(L.g); S.lantern = null; sfx('veil', .6);
    const d = L.design;
    homing({ x: pts[0][0], z: pts[0][1] }, 'Strike a match', res => L.cb(res), { kind: 'lantern', length: d.length, legs: d.legs, lens: d.lens, turns: d.turns });
    return;
  }
  L.g.position.set(L.x, 1.25 + Math.sin(L.t * 2.2) * .06, L.z);
}

/* ---------- researcher overlay: live posteriors, certainty, next design ---------- */
const LAB_ROWS = {
  lantern: [['acc', 'Accum. noise', v => v.toFixed(2)], ['rep', 'Report noise', v => v.toFixed(2)], ['gain', 'Gain', v => v.toFixed(2)], ['leak', 'Leak /m', v => v.toFixed(3)], ['bias', 'Turn bias °', v => v.toFixed(0)]],
  palace: [['rho', 'Rule inference', v => v.toFixed(2)], ['alpha', 'Local update', v => v.toFixed(2)], ['m', 'Link memory', v => v.toFixed(2)]],
};
let labOn = null, labLast = 0;   // resolved on first use: store is declared further down
function labIsOn() { if (labOn === null) labOn = location.hash === '#lab' || store.get('palace.lab', false); return labOn; }
function labToggle(v) { labOn = v == null ? !labIsOn() : v; store.set('palace.lab', labOn); $('#lab').hidden = !labOn || !S.running; labRender(true); }
function labRender(force) {
  if (!labIsOn() || !S.running) { $('#lab').hidden = true; return; }
  const t = now(); if (!force && t - labLast < 1000) return; labLast = t;
  $('#lab').hidden = false;
  const st = adoState(), cv = $('#labCv'), d = window.devicePixelRatio || 1, W = 296, rowH = 36, secH = 22, sparkH = 34;
  const H = secH * 2 + rowH * (LAB_ROWS.lantern.length + LAB_ROWS.palace.length) + (sparkH + 14) * 2 + 6;
  if (cv.width !== W * d || cv.height !== H * d) { cv.width = W * d; cv.height = H * d; cv.style.height = H + 'px'; }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
  const brass = '#e0a84a', dim = '#6d5530', muted = '#968b7d', paper = '#e6dcc4', font = '11px "Special Elite", monospace';
  let y = 0;
  const section = (title, model) => {
    g.fillStyle = brass; g.font = '12px "IM Fell English SC", serif'; g.fillText(title, 0, y + 14);
    g.fillStyle = muted; g.font = font; g.textAlign = 'right'; g.fillText(`${S.adoN[model]} trial${S.adoN[model] === 1 ? '' : 's'} today`, W, y + 14); g.textAlign = 'left';
    y += secH;
    const M = ADO.marginals(st[model]), P = S.adoPrior[model], sm = ADO.summary(st[model]);
    LAB_ROWS[model].forEach(([key, label, fmt]) => {
      // label and estimate on one line; the marginal histogram underneath: filled = now, outline = start of session
      const m = M[key], pr = P[key], n = m.vals.length, cw = W / n, bh = rowH - 17, maxp = Math.max(...m.p, ...pr.p, 1e-6), s = sm[key], base = y + rowH - 3;
      g.fillStyle = muted; g.font = font; g.fillText(label, 0, y + 10);
      g.fillStyle = paper; g.textAlign = 'right'; g.fillText(`${fmt(s.mean)}  80%: ${fmt(s.lo)} to ${fmt(s.hi)}`, W, y + 10); g.textAlign = 'left';
      for (let k = 0; k < n; k++) {
        const inInt = m.vals[k] >= s.lo && m.vals[k] <= s.hi, h = Math.max(1, (m.p[k] / maxp) * bh), hp = (pr.p[k] / maxp) * bh;
        g.fillStyle = inInt ? brass : dim; g.fillRect(k * cw + 1.5, base - h, cw - 3, h);
        g.strokeStyle = 'rgba(230,220,196,.45)'; g.lineWidth = 1; g.strokeRect(k * cw + 2, base - hp, cw - 4, hp);
      }

      y += rowH;
    });
  };
  const spark = (model, label) => {
    const h = S.adoHist[model], h0 = h[0], gained = h0 - h[h.length - 1];
    g.fillStyle = muted; g.font = font; g.fillText(label, 0, y + 10);
    g.fillStyle = paper; g.textAlign = 'right'; g.fillText(`${gained.toFixed(1)} bits learned`, W, y + 10); g.textAlign = 'left';
    const top = y + 14, x0 = 0, w = W, ht = sparkH - 4, lo = Math.min(...h) - .2, hi = h0 + .2;
    g.strokeStyle = '#3a322b'; g.beginPath(); g.moveTo(x0, top + ht); g.lineTo(x0 + w, top + ht); g.stroke();
    if (h.length > 1) {
      g.strokeStyle = brass; g.lineWidth = 1.5; g.beginPath();
      h.forEach((v, i) => { const X = x0 + (i / Math.max(1, h.length - 1)) * w, Y = top + (1 - (v - lo) / (hi - lo)) * ht; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
      const v = h[h.length - 1]; g.fillStyle = brass; g.beginPath(); g.arc(x0 + w, top + (1 - (v - lo) / (hi - lo)) * ht, 2.5, 0, 7); g.fill();
    } else { g.fillStyle = muted; g.fillText('no trials yet', x0, top + ht - 4); }
    y += sparkH + 14;
  };
  section('Path integration · lantern', 'lantern');
  section('Integrating a glimpse · palace', 'palace');
  y += 6; spark('lantern', 'Lantern: uncertainty'); spark('palace', 'Palace: uncertainty');
  const L = S.adoLast, nx = [];
  if (L.lanternNext) nx.push(`Next lantern path: ${L.lanternNext.L.toFixed(1)} m out, ${L.lanternNext.c.toFixed(1)} m home${L.lanternNext.anchor ? ' (fixed anchor)' : ` · expected gain ${(L.lanternNext.eig / Math.LN2).toFixed(2)} bits`}`);
  if (L.palaceNext) nx.push(`Next reshuffle: ${({ swap: 'swap', rotate: 'rotation', none: 'no change' })[L.palaceNext.kind]}${L.palaceNext.anchor ? ' (fixed anchor)' : ` · expected gain ${(L.palaceNext.eig / Math.LN2).toFixed(2)} bits`}`);
  if (L.lanternObs) nx.push(`Last return: ${L.lanternObs.err.toFixed(1)} m off after ${L.lanternObs.L.toFixed(1)} m`);
  if (L.palaceObs) nx.push(`Last glimpse test: ${L.palaceObs.kind}, ${L.palaceObs.cls}`);
  $('#labNext').innerHTML = nx.join('<br>');
  // behavioral measures that don't run through a model
  const c = S.log, m = c.motor, F = c.figures, aims = c.shots.map(s => s.aimErr).filter(v => v != null), J = c.junctions;
  const rows = [
    ['Chapter', TITLE[S.spec.id] || S.spec.id],
    ['Walking speed (straight)', m.straightT > 3 ? (m.straightD / m.straightT).toFixed(2) + ' m/s' : '—'],
    ['Wall scrapes', m.dist > 10 ? (10 * m.scrapes / m.dist).toFixed(1) + ' /10 m' : '—'],
    ['Aim error (median)', aims.length ? median(aims).toFixed(1) + '°' : '—'],
    ['Figures correct', F.length ? `${F.filter(f => f.correct).length}/${F.length}` : '—'],
    ['Figure sway scale', calib().swayScale.toFixed(2)],
    ['Junction choices optimal', J.length ? `${J.filter(j => j.optimal).length}/${J.length}` : '—'],
    ['Moved-doorway bumps', String(c.staleBumps || 0)],
    ['Closure revisits', `${c.closureRevisits || 0}/${c.closureFinds || 0}`],
  ];
  $('#labLive').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
  $('#labMeta').textContent = `session ${new Date(S.session.startedAt).toLocaleDateString()}`;
}
addEventListener('keydown', e => { if (e.code === 'KeyL' && S.running && !dlgOpen()) labToggle(); if (e.code === 'KeyN') { audio(); SND.setMusic(!SND.musicOn); toast(SND.musicOn ? 'Music on' : 'Music off'); musicLabel(); } });
function musicLabel() { const b = $('#musicBtn'); if (b) b.textContent = SND.musicOn ? 'Music: on' : 'Music: off'; }
$('#musicBtn').addEventListener('click', () => { audio(); SND.setMusic(!SND.musicOn); musicLabel(); }); musicLabel();
$('#labBtn').addEventListener('click', () => labToggle());

/* ---------- the API chapters script against ---------- */
/* ---------- adaptive design: one posterior per player, carried across sessions with drift ---------- */
const ADO = window.PALACE_ADO;
function adoState() {
  if (!S.adoState) {
    S.adoState = ADO.newState(store.get('palace.ado', null));
    // what this session started from, so the overlay can show how far today's play has moved each estimate
    const st = S.adoState, H = g => ADO.entropy(ADO.weights(g)) / Math.LN2;
    S.adoPrior = { lantern: ADO.marginals(st.lantern), palace: ADO.marginals(st.palace), Hl: H(st.lantern), Hp: H(st.palace) };
    S.adoHist = { lantern: [S.adoPrior.Hl], palace: [S.adoPrior.Hp] }; S.adoLast = {}; S.adoN = { lantern: 0, palace: 0 };
  }
  return S.adoState;
}
function adoTrack(model) {
  const st = adoState(); S.adoHist[model].push(ADO.entropy(ADO.weights(st[model])) / Math.LN2); S.adoN[model]++; labRender(true);
}
function adoSave() { store.set('palace.ado', ADO.save(adoState())); S.log.ado = { lantern: ADO.summary(adoState().lantern), palace: ADO.summary(adoState().palace) }; }

const api = {
  say, toast, sfx, rng: Math.random, wake,
  event: (n, d) => { if (n === 'reshuffle') S.changedOnce = true; logEvent(n, d); },
  flashlight: on => { S.dark = !on; },
  fog: d => { scene.fog.density = d; },
  setPlug: (k, open) => { S.plugs[k] = open; S.plugMesh[k].visible = !open; S.changedOnce = true; },
  moveProp: (id, x, y, wall) => { const p = S.props[id]; if (!p) return; if (p.block) S.blocked.delete(KEY(p.x, p.y)); p.x = x; p.y = y; if (wall) p.wall = wall;
    if (p.wall) { const w = wallPose(x, y, p.wall, p.type === 'clock' ? .35 : .04); p.mesh.position.set(w.x, 0, w.z); p.mesh.rotation.y = w.ry; } else { const c = ctr(x, y); p.mesh.position.set(c.x, 0, c.z); }
    if (p.block) S.blocked.add(KEY(x, y)); },
  showProp: id => { const p = S.props[id]; if (!p) return; p.hidden = false; p.mesh.visible = true; if (p.block) S.blocked.add(KEY(p.x, p.y)); },
  has: id => !!S.inv[id], drop: id => { S.inv[id] = false; hud(); },
  itemName: id => { const it = S.spec.items.find(i => i.id === id); return it ? it.name : id; },
  placeItem: it => addItem(it), spawn: e => spawnEnemy(e),
  goal: tiles => { S.goalTiles = tiles || null; S.goalSet = !!tiles; },
  tilesAround: (x, y) => [[x, y], ...N4.map(([dx, dy]) => [x + dx, y + dy])].filter(([a, b]) => cell(a, b) && cell(a, b) !== '#' && !S.blocked.has(KEY(a, b))),
  homing, flag: (k, v) => { S.flags[k] = v; }, follower: startFollower,
  showMemoryOn: p => { const c = ctr(p.x, p.y), m = itemMesh('memory'); m.position.set(c.x, 1.12, c.z); add(m); },
  endChapter: () => endChapter(),
  hold: holdEnemy,
  ado: {
    chooseLantern: (cands, anchor) => { const ch = ADO.chooseLantern(adoState(), cands, Math.random, anchor); S.adoLast.lanternNext = { L: ch.pick.length, c: ch.pick.homeDist, eig: ch.eig, anchor: ch.anchor }; labRender(true); return ch; },
    lanternUpdate: (d, res) => { const o = ADO.lanternObs(res); ADO.lanternUpdate(adoState().lantern, { L: d.length, c: o.c }, o.er, o.et); S.adoLast.lanternObs = { L: d.length, err: res.err }; S.adoLast.lanternNext = null; adoSave(); adoTrack('lantern'); },
    choosePalace: (kinds, anchor) => { const ch = ADO.choosePalace(adoState(), kinds, anchor); S.adoLast.palaceNext = ch; labRender(true); return ch; },
    palaceUpdate: (kind, cls) => { ADO.palaceUpdate(adoState().palace, kind, cls); S.adoLast.palaceObs = { kind, cls }; S.adoLast.palaceNext = null; adoSave(); adoTrack('palace'); },
  },
  holdAll: on => S.enemies.forEach(e => holdEnemy(e.id, on)),
  isTaken: id => { const it = S.items.find(i => i.id === id); return !it || it.taken; },
  itemPos: id => { const it = S.items.find(i => i.id === id); return it ? [it.x, it.y] : null; },
  free: (x, y) => passable(x, y) && !S.items.some(i => !i.taken && i.x === x && i.y === y) && !S.figures.some(f => !f.decided && tileOf(f.wx, f.wz).join() === x + ',' + y),
  moveItem: (id, x, y) => { const it = S.items.find(i => i.id === id); if (!it) return; const c = ctr(x, y); it.x = x; it.y = y; it.wx = c.x; it.wz = c.z; it.mesh.position.set(c.x, it.mesh.position.y, c.z); },
  lantern: (design, cb) => lanternTrial(design, cb),
  leg: (name, tiles) => startLeg(name, tiles),
};
/* ---------- chapters ---------- */
const CH_NAMES = ['Chapter One', 'Chapter Two', 'Chapter Three'];
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
function newLog(spec) {
  return { id: spec.id, seed: spec.seed, startedAt: Date.now(), duration: null, events: [], junctions: [], figures: [], homing: [], legs: [], shots: [], mapViews: [], path: [],
    motor: { dist: 0, runDist: 0, scrapes: 0, straightT: 0, straightD: 0 }, shotsN: 0, hits: 0, dmg: 0, deaths: 0, staleBumps: 0, done: false };
}
function placeAtSpawn() { const sp = S.spec.spawn, c = ctr(sp[0], sp[1]); PL.x = c.x; PL.z = c.z; PL.yaw = FACE[sp[2]]; PL.pitch = 0; PL.lastTile = ''; camera.position.set(PL.x, 1.6, PL.z); camera.rotation.set(0, PL.yaw, 0); }
function showScreen(id, html, mount) { if (id === 'end') { $('#endCard').innerHTML = html; $('#end').hidden = false; } if (mount) mount(); }
function ensureSession() { if (!S.session) S.session = { version: 2, startedAt: Date.now(), seedBase: Math.floor(Math.random() * 1e6), chapters: [] }; }
const TITLE = { grounds: 'The Grounds', east: 'The East Wing', conservatory: 'The Conservatory', palace: 'The Palace' };
function calib() { return store.get('palace.calib', { swayScale: 1, history: [] }); }
function startChapter(i) {
  ensureSession();
  // a short warm-up on the grounds opens every session, so controls settle before anything counts
  if (!S.session.prologueDone) { S.pendingChapter = i; return startPrologue(); }
  S.chapter = i;
  const sc = calib().swayScale, spec = L.generate(i, S.session.seedBase * 10 + i, { swayScale: sc });
  loadSpec(spec, i === 0 ? 12 : Math.max(S.ammo, 10)); S.log.swayScale = sc;
  SND.scene('card');
  showScreen('end', `<div class="sub">${CH_NAMES[i]}</div><h1>${spec.title}</h1><p style="color:var(--muted)">${spec.sub}</p><button class="btn" id="begin">Begin</button>`, () => $('#begin').onclick = () => beginPlay(spec));
}
function loadSpec(spec, ammo) {
  buildLevel(spec); S.hooks = spec.script(api) || {};
  S.inv = {}; S.invNames = {}; S.flags = {}; S.visited = {}; S.room = null; S.dark = false; S.changedOnce = false; S.hp = 3; S.ammo = ammo;
  S.log = newLog(spec); S.session.chapters.push(S.log); S.t0 = now();
  placeAtSpawn(); hud(); $('#title').hidden = true; $('#end').hidden = true;
}
function beginPlay(spec) {
  $('#end').hidden = true; audio(); S.running = true; S.paused = false; S.t0 = now(); resize();
  SND.scene(spec.id); adoState(); if (TOUCH) $('#labBtn').hidden = false; labIsOn(); labRender(true);
  if (!TOUCH) { try { const p = cvEl.requestPointerLock && cvEl.requestPointerLock(); if (p && p.catch) p.catch(() => { }); } catch (e) { } }
  if (S.hooks.onStart) S.hooks.onStart();
  say(spec.intro);
}
function startPrologue() {
  S.chapter = -1; const spec = L.prologue(S.session.seedBase);
  loadSpec(spec, 12);
  showScreen('end', `<div class="sub">Prologue</div><h1>${spec.title}</h1><p style="color:var(--muted)">A short walk up to the house</p><button class="btn" id="begin">Begin</button>`, () => $('#begin').onclick = () => beginPlay(spec));
}
function saveSession() {
  const all = store.get('palace.sessions', []).filter(s => s.startedAt !== S.session.startedAt); all.push(S.session);
  store.set('palace.sessions', all.slice(-5));
}
function endChapter() {
  S.paused = true; if (document.exitPointerLock) document.exitPointerLock();
  S.log.duration = +((now() - S.t0) / 1000).toFixed(1); S.log.done = true;
  if (S.spec.id === 'grounds') { S.session.prologueDone = true; saveSession(); return startChapter(S.pendingChapter || 0); }
  // keep the standing-figure decisions near threshold for this player: about 75% correct is where drift is best estimated
  const F = S.log.figures;
  if (F.length >= 3) { const acc = F.filter(f => f.correct).length / F.length, c = calib();
    c.swayScale = Math.max(.4, Math.min(2.5, c.swayScale * (acc > .85 ? .8 : acc < .65 ? 1.25 : 1)));
    c.history.push({ t: Date.now(), chapter: S.spec.id, acc: +acc.toFixed(2), n: F.length, scale: +c.swayScale.toFixed(3) }); c.history = c.history.slice(-60); store.set('palace.calib', c); }
  saveSession();
  const prog = store.get('palace.progress', { unlocked: 1 }); prog.unlocked = Math.max(prog.unlocked, Math.min(3, S.chapter + 2)); store.set('palace.progress', prog);
  showChapterCard();
}
function showChapterCard() {
  SND.scene('card');
  const last = S.chapter === 2, mins = (S.log.duration / 60).toFixed(1);
  showScreen('end', last
    ? `<h1>The Palace</h1><div class="sub">The end of the beta</div><p>Elias Locke walks out into the grey morning and does not look back at the house.</p><p>Below it, the palace keeps every room exactly where it belongs.</p><button class="btn" id="notesB">Session notes</button><br><button class="btn small" id="again">Play again</button>`
    : `<div class="sub">${CH_NAMES[S.chapter]} complete · ${mins} min</div><h1>${S.spec.title}</h1><button class="btn" id="next">Continue to ${L.generate(S.chapter + 1, 1).title}</button><br><button class="btn small" id="notesB">Session notes</button>`,
    () => { $('#notesB').onclick = notes; if ($('#next')) $('#next').onclick = () => startChapter(S.chapter + 1); if ($('#again')) $('#again').onclick = () => location.reload(); });
}

/* ---------- session notes ---------- */
function median(a) { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
function pct(a, b) { return b ? Math.round(100 * a / b) + '%' : '—'; }
function summarize(c) {
  const J = c.junctions, Jpost = J.filter(j => j.changed), Jconf = J.filter(j => j.conflict && j.changed);
  const F = c.figures, V = c.events.filter(e => e.name === 'veil' && e.carrying), H = c.homing;
  const m = c.motor, aims = c.shots.map(s => s.aimErr).filter(v => v != null);
  const rows = [
    ['Time and distance', `${((c.duration || 0) / 60).toFixed(1)} min · ${Math.round(m.dist)} m`, 'Gross efficiency. Mostly reflects comfort with the controls, so it is used as a covariate, not a score.'],
    ['Walking speed on straight runs', m.straightT > 3 ? (m.straightD / m.straightT).toFixed(2) + ' m/s' : '—', 'Motor calibration: how fast you move when there is nothing to decide.'],
    ['Wall scrapes', m.dist > 10 ? (10 * m.scrapes / m.dist).toFixed(1) + ' per 10 m' : '—', 'Control precision, kept separate from route choices.'],
    ['Aim', aims.length ? `${median(aims).toFixed(1)}° median error · ${c.hits}/${c.shotsN} hits` : '—', 'Aiming skill, also a covariate.'],
    ['Plan readings', `${c.mapViews.length} · ${Math.round(c.mapViews.reduce((s, v) => s + v.dur, 0))} s`, `${c.mapViews.filter(v => v.changed).length} after the house changed, when the plan no longer matched.`],
  ];
  if (c.ado && (c.id === 'conservatory' || c.id === 'palace')) {
    const f = (o, d) => `${o.mean.toFixed(d)} (${o.lo}–${o.hi})`;
    if (c.id === 'conservatory') { const l = c.ado.lantern; rows.push(['Model: path integration', `noise ${f(l.acc, 2)}`, `Accumulating noise per √m, with an 80% interval. Reporting noise ${f(l.rep, 2)}, gain ${f(l.gain, 2)}, leak ${f(l.leak, 3)}, turning bias ${f(l.bias, 0)}°. Estimated from every lantern return so far, across sessions.`]); }
    if (c.id === 'palace') { const q = c.ado.palace; rows.push(['Model: integrating a glimpse', `inference ${f(q.rho, 2)}`, `Probability of working out the whole rearrangement from one glimpse. Local updating ${f(q.alpha, 2)}, memory for unchanged links ${f(q.m, 2)}. Reshuffle types after the first three were chosen to be as informative as possible about these.`]); }
  }
  if (c.id === 'grounds') rows.unshift(['Warm-up', 'not scored', 'Calibrates movement and aim for this session, so the chapters measure decisions rather than controls.']);
  if (J.length) rows.push(['Route choices at junctions', `${pct(J.filter(j => j.optimal).length, J.length)} optimal of ${J.length}`, Jpost.length ? `After the change: ${pct(Jpost.filter(j => j.optimal).length, Jpost.length)} optimal. Where the plan and the house disagreed, you followed the old plan ${pct(Jconf.filter(j => j.planOptimal).length, Jconf.length)} of the time (${Jconf.length} choices).` : 'Choices are scored against the true layout and against the plan.']);
  if (c.staleBumps) rows.push(['Walked into moved doorways', String(c.staleBumps), 'Reaching for a doorway that used to be there.']);
  if (c.closureFinds) rows.push(['Went back to a closure you had found', `${c.closureRevisits || 0} of ${c.closureFinds}`, 'Returning, later, to a passage you had already discovered was shut. Perseveration on the old map, separate from finding the change in the first place.']);
  const IG = c.events.filter(e => e.name === 'integrate'), ig = k => IG.filter(e => e.kind === k);
  if (IG.length) rows.push(['First choice after a glimpse', `swap ${pct(ig('swap').filter(e => e.cls === 'correct').length, ig('swap').length)} · rotation ${pct(ig('rotate').filter(e => e.cls === 'correct').length, ig('rotate').length)} · none ${pct(ig('none').filter(e => e.cls === 'correct').length, ig('none').length)}`,
    `After stepping out of a room you see one new link. A swap means the target is behind the veil you came in by; a rotation means every veil moved by the same step. Choices back to where the room used to be: ${pct(IG.filter(e => e.cls === 'stale').length, IG.filter(e => e.kind !== 'none').length)}.`]);
  if (F.length) { const rts = F.filter(f => f.rt != null).map(f => f.rt); rows.push(['Figures in the dark', `${pct(F.filter(f => f.correct).length, F.length)} correct of ${F.length}`, `Shoot or walk past. Median time from first seeing a figure to deciding: ${rts.length ? median(rts).toFixed(1) + ' s' : '—'}.`]); }
  const HL = H.filter(h => h.kind === 'lantern'), HF = H.filter(h => h.kind !== 'lantern');
  if (HL.length) rows.push(['Following the lantern', `${median(HL.map(h => h.err)).toFixed(1)} m median error`, `${HL.length} return${HL.length === 1 ? '' : 's'} in the dark after outbound paths of ${HL.map(h => h.length.toFixed(0)).join(', ')} m. Across sessions, how error grows with path length separates accumulating noise from a fixed offset.`]);
  if (HF.length) rows.push(['Finding your way in the dark', `${HF[0].err.toFixed(1)} m off`, `You walked ${HF[0].walked.toFixed(0)} m to get there. A path-integration endpoint.`]);
  const LG = c.legs || [], lt = LG.find(l => l.leg === 'transition'), lr = LG.find(l => l.leg === 'reward');
  if (lt && lr && lt.efficiency && lr.efficiency) rows.push(['Map change vs goal change', `${lt.efficiency.toFixed(2)} vs ${lr.efficiency.toFixed(2)}`, 'Distance walked relative to the shortest route, after the hedges regrew (the map changed) and on the way to the key (only the goal changed). The gap between the two is the measure; controls affect both equally.']);

  if (V.length) { const st = V.filter(v => v.stale != null); rows.push(['Veil choices while carrying a memory', `${pct(V.filter(v => v.veil === v.correct).length, V.length)} correct of ${V.length}`, `Chose where the room used to be ${pct(st.filter(v => v.veil === v.stale && v.stale !== v.correct).length, st.length)} of the time after a reshuffle. Chose the plan's veil ${pct(V.filter(v => v.veil === v.plan && v.plan !== v.correct).length, V.length)}.`]); }
  return rows;
}
function notes() {
  saveSession();
  const ch = S.session.chapters.filter(c => c.duration != null || c === S.log);
  const html = ch.map((c, i) => `<h2 style="font-family:var(--display);font-weight:400;color:var(--brass);margin:18px 0 4px">${TITLE[c.id] || c.id}</h2>` +
    summarize(c).map(([k, v, m]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span><span class="m">${m}</span></div>`).join('')).join('');
  showScreen('end', `<div id="notes"><h1 style="font-size:2rem;text-align:center">Session notes</h1>
    <p style="font-size:.85rem;color:var(--muted);text-align:center">Recorded silently while you played. Single sessions are noisy; change across sessions is the point.</p>${html}
    <div style="text-align:center;margin-top:14px"><button class="btn" id="copyData">Copy session data</button> <button class="btn small" id="back">Back</button></div>
    <textarea id="dataBox" hidden readonly style="width:100%;height:120px;margin-top:10px;background:#120f0d;color:var(--paper);font-family:var(--type);font-size:.7rem"></textarea></div>`, () => {
    $('#copyData').onclick = () => { const txt = JSON.stringify(S.session); const box = $('#dataBox');
      const fallback = () => { box.hidden = false; box.value = txt; box.select(); $('#copyData').textContent = 'Select and copy below'; };
      try { navigator.clipboard.writeText(txt).then(() => $('#copyData').textContent = 'Copied', fallback); } catch (e) { fallback(); } };
    $('#back').onclick = showChapterCard;
  });
}
/* ---------- what the score is allowed to know ---------- */
// Only threats the player could already perceive: a ghoul or the Guardian that is hunting, or one in plain sight.
// Standing figures are not enemies until they move, so they never touch the music.
function audioFrame(dt) {
  if (!S.spec) return;
  let threat = 0; const [tx, ty] = tileOf(PL.x, PL.z);
  S.enemies.forEach(o => {
    if (o.state === 'dead' || o.state === 'dormant') return; const d = Math.hypot(PL.x - o.x, PL.z - o.z);
    if (o.state === 'chase') threat = Math.max(threat, 1 - .6 * Math.min(1, d / 16));
    else if (d < 10 && los(PL.x, PL.z, o.x, o.z)) threat = Math.max(threat, .45 * (1 - d / 10));
  });
  SND.update({ dt, x: PL.x, z: PL.z, yaw: PL.yaw, threat, dark: S.dark, safe: S.running && isSafe(tx, ty), hp: S.hp, blind: !!(S.homing || S.lantern), running: S.running && !S.paused });
}

/* ---------- loop ---------- */
let last = now();
function loop() {
  requestAnimationFrame(loop); const t = now(), dt = Math.min(.05, (t - last) / 1000); last = t;
  if (S.spec) {
    if (S.running && !S.paused) { updatePlayer(dt, t); updateEnemies(dt); updateFigures(dt, t); updateFollower(dt); updateTargets(dt); updateLantern(dt); }
    else { if (!S.running) PL.yaw += dt * .05; camera.position.set(PL.x, 1.6, PL.z); camera.rotation.set(PL.pitch, PL.yaw, 0); }
    Object.values(S.doors).forEach(d => { const tg = d.open ? -1.75 : 0; d.ang += (tg - d.ang) * Math.min(1, dt * 3); d.piv.rotation.y = d.ang; });
    S.veils.forEach((v, i) => v.mesh.material.opacity = .7 + .15 * Math.sin(t / 400 + i));
    S.lights.forEach(l => { if (l.flicker === 'candle') l.light.intensity = l.base * (1 + Math.sin(t / 130) * .05 + Math.sin(t / 57) * .03); else if (l.flicker === 'fire') l.light.intensity = l.base * (.9 + Math.random() * .3); });
    flash.intensity = S.dark ? (Math.random() < .035 ? .9 : .06) : 2.4;
    if (labOn) labRender(false);
    audioFrame(dt);
    findFocus();
  }
  renderer.render(scene, camera);
}

/* ---------- boot ---------- */
S.invNames = {}; S.visited = {};
function boot() {
  resize();
  const backdrop = L.generate(0, Math.floor(Math.random() * 1e6)); buildLevel(backdrop); placeAtSpawn();
  const prog = store.get('palace.progress', { unlocked: 1 });
  const titles = [0, 1, 2].map(i => L.generate(i, 1).title);
  $('#chapters').innerHTML = titles.map((t, i) => `<button class="btn small" data-ch="${i}" ${i < prog.unlocked ? '' : 'disabled'}>${CH_NAMES[i]}: ${t}</button>`).join(' ');
  $('#chapters').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { audio(); startChapter(+b.dataset.ch); });
  $('#start').onclick = () => { audio(); startChapter(0); };
  loop();
}
boot();
window.__palace = { S, PL, api, use: () => use(), useLabel: sub => { const o = interactables().filter(o => o.label.toLowerCase().includes(sub)).sort((a, b) => Math.hypot(a.x - PL.x, a.z - PL.z) - Math.hypot(b.x - PL.x, b.z - PL.z))[0]; if (!o) return null; focus = o; use(); return o.label; }, fire, startChapter, notes, summarize, interactables, passable, finishHoming, advanceDialog, dlgOpen };
})();
