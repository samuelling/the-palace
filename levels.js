/* The Palace: chapter generators.
   Pure data + small scripts. Runs in the browser (window.PALACE_LEVELS) and in node (module.exports),
   so the simulated players can load exactly the layouts real players see. */
(function (root) {
  'use strict';

  /* ---------- seeded randomness ---------- */
  function rng32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const RI = (r, a, b) => a + Math.floor(r() * (b - a + 1));
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* ---------- grid helpers ---------- */
  function grid(W, H) { return Array.from({ length: H }, () => Array(W).fill('#')); }
  function carve(G, x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) G[y][x] = c || '.'; }
  const K = (x, y) => x + ',' + y;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  function inRect(x, y, r) { return x >= r[0] && x <= r[2] && y >= r[1] && y <= r[3]; }
  function bfs(G, from, blocked, extraPass) {
    const H = G.length, W = G[0].length, d = new Map(), q = [];
    const ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (G[y][x] !== '#' || (extraPass && extraPass(x, y))) && !(blocked && blocked.has(K(x, y)));
    from.forEach(([x, y]) => { d.set(K(x, y), 0); q.push([x, y]); });
    while (q.length) {
      const [x, y] = q.shift(), dd = d.get(K(x, y));
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = K(nx, ny); if (!d.has(k) && ok(nx, ny)) { d.set(k, dd + 1); q.push([nx, ny]); } }
    }
    return d;
  }
  function pathTo(G, from, to, blocked) {
    const d = bfs(G, [to], blocked); if (!d.has(K(from[0], from[1]))) return null;
    const path = [from]; let [x, y] = from;
    while (!(x === to[0] && y === to[1])) {
      let best = null;
      for (const [dx, dy] of N4) { const k = K(x + dx, y + dy); if (d.has(k) && d.get(k) < d.get(K(x, y))) { best = [x + dx, y + dy]; break; } }
      if (!best) return null; [x, y] = best; path.push(best);
    }
    return path;
  }
  function makeRoomAt(rooms, extra) {
    return function (x, y) {
      for (const r of rooms) if (inRect(x, y, r.rect)) return r.name;
      if (extra) { const n = extra(x, y); if (n) return n; }
      return null;
    };
  }
  const YAW = { n: 0, s: Math.PI, e: -Math.PI / 2, w: Math.PI / 2 };
  // sway of a ghoul holding still; scaled per player so decisions sit near threshold
  const swayOf = (r, opts) => Math.max(.005, Math.min(.07, pick(r, [.012, .02, .03, .045]) * ((opts && opts.swayScale) || 1)));

  /* =====================================================================
     Chapter 1: the East Wing
     ===================================================================== */
  function eastWing(seed, opts) {
    const r = rng32(seed * 7 + 1), W = 26, H = 18, G = grid(W, H);
    carve(G, 1, 1, 7, 5); carve(G, 16, 1, 22, 5); carve(G, 2, 7, 21, 7); carve(G, 8, 9, 14, 15); carve(G, 1, 9, 6, 15);
    carve(G, 23, 3, 24, 3); carve(G, 24, 3, 24, 10); carve(G, 18, 10, 24, 10); carve(G, 18, 10, 18, 13); carve(G, 16, 13, 18, 13);
    const inCorr = (x, y) => (y === 3 && x >= 23 && x <= 24) || (x === 24 && y >= 3 && y <= 10) || (y === 10 && x >= 18 && x <= 24) || (x === 18 && y >= 10 && y <= 13) || (y === 13 && x >= 16 && x <= 18);
    const rooms = [
      { name: 'Library', rect: [1, 1, 7, 5], theme: 'library' }, { name: 'Study', rect: [16, 1, 22, 5], theme: 'study' },
      { name: 'North Hall', rect: [2, 7, 21, 7], theme: 'hall' }, { name: 'Foyer', rect: [8, 9, 14, 15], theme: 'foyer' },
      { name: 'Portrait Gallery', rect: [1, 9, 6, 15], theme: 'gallery' }];
    const roomAt = makeRoomAt(rooms, (x, y) => inCorr(x, y) ? "Servants' Corridor" : null);
    const themes = { "Servants' Corridor": 'stone' }; rooms.forEach(rm => themes[rm.name] = rm.theme);
    const plugs = { '7,12': true, '7,10': false, '11,8': true, '12,8': false };
    Object.keys(plugs).forEach(k => { const [x, y] = k.split(',').map(Number); G[y][x] = 'P'; });
    const doors = [
      { id: 'A', x: 4, y: 6, axis: 'z', needs: 'medallion', locked: ["A heavy oak door. Set into the lock is a hollow shaped like a lion's head."], open: ['The lion medallion fits the hollow. Something heavy turns inside the door.'] },
      { id: 'B', x: 19, y: 6, axis: 'z', needs: 'brass', locked: ['Locked. A small brass keyhole, worn bright from use.'], open: ['The brass key turns. The study door swings in on warm air.'] },
      { id: 'E', x: 15, y: 13, axis: 'x', needs: 'side:east', locked: ["It won't move. Bolted from the other side."], open: ['You slide the bolt back. Candlelight spills through from the foyer.'] }];
    doors.forEach(d => G[d.y][d.x] = 'D');

    const medSpot = pick(r, [[2, 11], [4, 10]]);
    const gloveSpot = pick(r, [[5, 13], [2, 14], [4, 14]].filter(s => !(s[0] === medSpot[0] && s[1] === medSpot[1])));
    const musicSpot = pick(r, [[2, 4], [1, 2], [4, 4]]);
    const locketSpot = pick(r, [[21, 2], [21, 5], [17, 4]]);
    const items = [
      { id: 'medallion', kind: 'medallion', x: medSpot[0], y: medSpot[1], on: 'pedestal', name: 'Lion Medallion', lines: ['A heavy gold medallion: a lion, mouth open.', 'It matches a hollow you may have seen on a door.'] },
      { id: 'glove', kind: 'glove', x: gloveSpot[0], y: gloveSpot[1], on: 'pedestal', name: "Clara's glove", memento: true, lines: ["Clara's glove. Kid leather, the left hand.", 'The fingers still hold a shape, as if it was taken off a moment ago.'] },
      { id: 'herb1', kind: 'herb', x: 6, y: 15, on: 'planter', name: 'Green herb', heal: true, lines: ['A bitter green herb. You chew it, and the pain eases.'] },
      { id: 'brass', kind: 'key', x: 6, y: 2, on: 'desk', name: 'Brass Key (Study)', lines: ['A brass key on a cardboard tag.', 'In Locke\'s hand: STUDY. Underneath, crossed out: "Don\'t let me in."'] },
      { id: 'music', kind: 'musicbox', x: musicSpot[0], y: musicSpot[1], on: 'table', name: 'Music box', memento: true, lines: ['A music box. It plays four bars of a waltz and stops on the same note every time.', 'Inside the lid: "For C., so the tune stays put."'] },
      { id: 'ammo1', kind: 'ammo', x: 1, y: 1, on: 'floor', name: 'Handgun bullets', ammo: 8, lines: ['Handgun bullets. Eight rounds.'] },
      { id: 'locket', kind: 'locket', x: locketSpot[0], y: locketSpot[1], on: 'table', name: 'Locket', memento: true, lines: ['A locket with a curl of dark hair under glass.', 'The portrait inside has been scratched out, carefully, by someone who regretted it.'] },
      { id: 'ammo2', kind: 'ammo', x: 16, y: 5, on: 'floor', name: 'Handgun bullets', ammo: 8, lines: ['Handgun bullets. Eight rounds.'] },
      { id: 'journal', kind: 'note', x: 17, y: 2, on: 'desk', name: "Locke's journal", read: true, lines: ['"Oct. 3. The east wing moved again in the night. I found the music box in the library, though I am certain I left it by the window."', '"I have begun building below the house. A palace, down in the cellar, where every room stays where I put it."', '"Where she stays where I put her. No one will rearrange it. Not even me."'] }];
    const props = [
      { type: 'plan', x: 9, y: 9, wall: 'n' }, { type: 'portrait', id: 'clara', x: 13, y: 9, wall: 'n', name: 'Clara Locke, 1871', lines: ['"Clara Locke, 1871."', 'Someone has wiped the dust from her face, and only from her face.'] },
      { type: 'clock', id: 'clock', x: 14, y: 11, wall: 'e', block: true, lines: ['The long-case clock reads twelve past three.', 'The pendulum swings, but the hands have not moved since you came in.'] },
      { type: 'rug', id: 'rug', x: 11, y: 12 }, { type: 'chandelier', x: 11, y: 12 },
      { type: 'desk', x: 6, y: 2, block: true }, { type: 'desk', x: 17, y: 2, block: true }, { type: 'fireplace', x: 22, y: 4, wall: 'e' },
      { type: 'candelabra', x: 9, y: 7 }, { type: 'candelabra', x: 15, y: 7 },
      { type: 'portrait', x: 1, y: 10, wall: 'w', stranger: true }, { type: 'portrait', x: 1, y: 13, wall: 'w', stranger: true },
      { type: 'portrait', x: 3, y: 15, wall: 's', stranger: true }, { type: 'portrait', x: 6, y: 14, wall: 'e', stranger: true }];
    items.forEach(it => { if (it.on === 'pedestal' || it.on === 'table') props.push({ type: it.on, x: it.x, y: it.y, block: true }); if (it.on === 'planter') props.push({ type: 'planter', x: it.x, y: it.y }); });
    const lights = [{ x: 11, y: 12, h: 2.9, color: 0xffb060, i: 1.5, d: 16, flicker: 'candle' }, { x: 3.5, y: 12, h: 2.8, color: 0xc9d6b0, i: .7, d: 10 },
      { x: 6.5, y: 2.5, h: 1.6, color: 0xffa850, i: .9, d: 9 }, { x: 22.5, y: 4.5, h: .7, color: 0xff6a2a, i: 1.2, d: 11, flicker: 'fire' }];

    // standing figures: dress forms or ghouls holding still
    const blockedNow = new Set(props.filter(p => p.block).map(p => K(p.x, p.y)));
    const figSpots = shuffle(r, [[3, 12], [5, 9], [3, 2], [20, 3], [1, 4], [5, 1], [18, 4], [2, 9]])
      .filter(s => !items.some(it => it.x === s[0] && it.y === s[1]) && !blockedNow.has(K(s[0], s[1]))).slice(0, 6);
    const figures = figSpots.map((s, i) => ({ id: 'fig' + i, type: r() < .5 ? 'mannequin' : 'sleeper', look: 'dressform', x: s[0], y: s[1], sway: swayOf(r, opts), yaw: r() * 6.28 }));
    const enemies = [{ id: 'hall', type: 'ghoul', x: 17, y: 7, state: 'patrol', patrol: [[8, 7], [20, 7]] },
      { id: 'corr', type: 'ghoul', x: 24, y: 8, state: 'dormant', speed: 1.3 }];

    // the Architect takes one memento back and hides it behind a moved doorway
    const errandWing = pick(r, ['gallery', 'library']);
    const errandSpot = errandWing === 'gallery' ? pick(r, [[1, 9], [1, 15], [6, 9]]) : pick(r, [[1, 5], [7, 1], [7, 5]]);
    const errandItem = pick(r, ['glove', 'music', 'locket']);

    const planG = G.map(row => row.slice());
    return {
      id: 'east', index: 0, title: 'The East Wing', sub: 'Locke Hall', seed, W, H, G, planG, rooms, roomAt, themes, plugs, doors, items, props, lights, figures, enemies,
      spawn: [11, 14, 'n'], safe: ['Foyer'], fog: .075, ambient: [0x3a2c22, .42],
      planLabels: [['Library', 4, 3.2], ['Study', 19, 3.2], ['Foyer', 11, 12.4], ['Gallery', 3.5, 12.4], ['North Hall', 12, 6.6], ["Servants'", 21, 9.6]],
      planTitle: 'Locke Hall, East Wing',
      errand: { wing: errandWing, spot: errandSpot, item: errandItem },
      intro: ['The foyer of Locke Hall. The chandelier is lit, and the candles are fresh.', 'Someone has been here tonight.', 'The framed plan by the door is the only map in the house.'],
      script: function (api) {
        const S = {};
        return {
          onTile(x, y, room) {
            if (x === 23 && y === 3 && !S.dark) {
              S.dark = true; api.event('dark');
              api.flashlight(false);
              // the Architect works while you can't see
              api.setPlug('7,12', false); api.setPlug('7,10', true); api.setPlug('11,8', false); api.setPlug('12,8', true);
              api.moveProp('clara', 14, 11, 'e'); api.moveProp('clock', 13, 9, 'n'); api.moveProp('rug', 12, 12);
              api.say(['Your flashlight sputters.', '...and dies. Somewhere ahead in the dark, something shifts its weight.'], '', () => setTimeout(() => api.wake('corr'), 2500));
            }
            if (room === 'Foyer' && S.dark && !S.back) {
              S.back = true; api.flashlight(true); api.event('architect-return');
              const it = errandItem, had = api.has(it);
              api.sfx('thud', .8); setTimeout(() => api.sfx('thud', .85), 550); setTimeout(() => api.sfx('thud', .9), 1100);
              api.showProp('trapdoor');
              if (had) api.drop(it);
              api.placeItem({ id: it + '-lost', kind: it === 'glove' ? 'glove' : it === 'music' ? 'musicbox' : 'locket', x: errandSpot[0], y: errandSpot[1], on: 'floor', name: api.itemName(it), memento: true, replaces: it,
                lines: ['There it is, set down neatly, as if someone wanted you to find it.'] });
              api.spawn({ id: 'gal', type: 'ghoul', x: errandWing === 'gallery' ? 2 : 4, y: errandWing === 'gallery' ? 10 : 3, state: 'idle', hp: 5, speed: 1.15 });
              api.say(['Your flashlight flickers back to life.', 'Overhead, heavy footsteps cross the floor. They are not Locke\'s.',
                'The rug in the middle of the foyer has been pulled aside. Beneath it is a trapdoor with three hollows.',
                had ? `Your pocket is lighter. ${api.itemName(it)} is gone.` : 'Something else in the foyer is different, too.']);
              api.goal(api.tilesAround(errandSpot[0], errandSpot[1]));
            }
          },
          onTake(it) {
            if (it.id === 'medallion') api.goal([[4, 7]]);
            if (it.id === 'brass') api.goal([[19, 7]]);
            if (it.id === 'locket') api.goal([[23, 3]]);
            if (it.replaces) api.goal([[11, 13], [11, 11], [10, 12], [12, 12]]);
          },
          onDoor(d) { if (d.id === 'A') api.goal(api.tilesAround(6, 2)); if (d.id === 'B') api.goal(api.tilesAround(locketSpot[0], locketSpot[1])); },
          onStart() { api.goal(api.tilesAround(medSpot[0], medSpot[1])); },
          onProp(p) {
            if (p.id !== 'trapdoor') return false;
            const need = ['glove', 'music', 'locket'], miss = need.filter(k => !api.has(k));
            if (miss.length) { api.say(['Three hollows are carved into the trapdoor: a glove, a music box, a locket.', miss.length === 3 ? 'They are all empty.' : `${miss.length === 1 ? 'One hollow is' : 'Two hollows are'} still empty.`]); return true; }
            api.event('chapter-end');
            api.say(['The glove, the music box, the locket. Each one settles into its hollow.', 'The trapdoor swings down onto a narrow stair. Cold air rises from below, smelling of wet stone and roses.'], '', () => api.endChapter());
            return true;
          },
        };
      },
      extraProps: [{ type: 'trapdoor', id: 'trapdoor', x: 11, y: 12, hidden: true, interact: true, label: 'Examine the trapdoor' }],
    };
  }
  /* =====================================================================
     Chapter 2: the Conservatory (a hedge maze under glass, regrown each session)
     ===================================================================== */
  function conservatory(seed, opts) {
    const r = rng32(seed * 13 + 2), W = 32, H = 24, G = grid(W, H);
    const CI = 13, CJ = 8, cx = i => 2 + 2 * i, cy = j => 2 + 2 * j;
    const LAWN = [10, 6, 18, 12];
    // perfect maze by randomized depth-first search
    const seen = new Set(), stack = [[0, 0]]; seen.add('0,0'); G[cy(0)][cx(0)] = '.';
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const nb = shuffle(r, N4).map(([di, dj]) => [i + di, j + dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < CI && b < CJ && !seen.has(a + ',' + b));
      if (!nb.length) { stack.pop(); continue; }
      const [a, b] = nb[0]; seen.add(a + ',' + b);
      G[cy(b)][cx(a)] = '.'; G[(cy(j) + cy(b)) / 2][(cx(i) + cx(a)) / 2] = '.'; stack.push([a, b]);
    }
    // braid it: open extra walls so there are loops and real route choices
    for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) for (const [di, dj] of [[1, 0], [0, 1]]) {
      const a = i + di, b = j + dj; if (a >= CI || b >= CJ) continue;
      const wx = (cx(i) + cx(a)) / 2, wy = (cy(j) + cy(b)) / 2;
      if (G[wy][wx] === '#' && r() < .14) G[wy][wx] = '.';
    }
    carve(G, LAWN[0], LAWN[1], LAWN[2], LAWN[3]);
    carve(G, 2, 19, 6, 22); carve(G, 2, 17, 2, 18);              // office (south-west corner) + its corridor
    carve(G, 28, 6, 30, 10); G[8][27] = '.'; G[8][26] = '.';      // boiler room
    const niches = { Owl: [1, 2], Stag: [27, 2], Hare: [1, 16], Swan: [27, 16] };
    Object.values(niches).forEach(([x, y]) => G[y][x] = '.');
    const inMaze = (x, y) => x >= 2 && x <= 26 && y >= 2 && y <= 16;
    const rooms = [{ name: 'Office', rect: [2, 19, 6, 22], theme: 'office' }, { name: 'Lawn', rect: LAWN, theme: 'lawn' },
      { name: 'Boiler Room', rect: [28, 6, 30, 10], theme: 'boiler' }];
    const roomAt = makeRoomAt(rooms, (x, y) => (inMaze(x, y) || (x === 2 && (y === 17 || y === 18)) || (y === 8 && x === 27) || Object.values(niches).some(n => n[0] === x && n[1] === y)) ? 'Greenhouse' : null);
    const themes = { Office: 'office', Lawn: 'lawn', 'Boiler Room': 'boiler', Greenhouse: 'greenhouse' };

    // pick the lawn gate the return trip will most likely use, then plan the regrowth around it
    const officeDoor = [2, 17], fountain = [14, 9];
    const blockedProps = new Set([K(14, 9)]);
    const isWallBetween = (x, y) => inMaze(x, y) && !inRect(x, y, LAWN) && ((x % 2 === 1) !== (y % 2 === 1));
    const openWall = (x, y) => isWallBetween(x, y) && G[y][x] === '.';
    const route = pathTo(G, [14, 12], officeDoor, blockedProps) || [];
    const close = [];
    // prefer closures just past a turn, so they can't be seen from down a long straight and are found only after committing
    const runBefore = i => { if (i < 2) return 99; const d = (a, b) => [b[0] - a[0], b[1] - a[1]].join(); const dir = d(route[i - 1], route[i]); let n = 0; for (let j = i - 1; j > 0 && d(route[j - 1], route[j]) === dir; j--) n++; return n; };
    const ranked = shuffle(r, route.map((t, i) => [t, i]).filter(([[x, y]]) => openWall(x, y))).sort((p, q) => runBefore(p[1]) - runBefore(q[1])).map(([t]) => t);
    for (const [x, y] of ranked) {
      if (close.length >= 2) break;
      const blk = new Set([...blockedProps, ...close.map(c => K(c[0], c[1])), K(x, y)]);
      const d = bfs(G, [officeDoor], blk);
      let ok = true; for (let j = 0; j < CJ && ok; j++) for (let i = 0; i < CI; i++) if (!d.has(K(cx(i), cy(j)))) { ok = false; break; }
      if (ok && d.has(K(14, 12))) close.push([x, y]);
    }
    if (!close.length) {
      // fallback: close the open passage nearest the return route that keeps the maze connected
      const onRoute = new Set(route.map(([x, y]) => K(x, y)));
      const cands = [];
      for (let y = 2; y <= 16; y++) for (let x = 2; x <= 26; x++) if (openWall(x, y)) cands.push([x, y, Math.min(...route.map(([a, b]) => Math.abs(a - x) + Math.abs(b - y)))]);
      cands.sort((p, q) => p[2] - q[2]);
      for (const [x, y] of cands) {
        const blk = new Set([...blockedProps, K(x, y)]), d = bfs(G, [officeDoor], blk);
        let ok = d.has(K(14, 12)); for (let j = 0; j < CJ && ok; j++) for (let i = 0; i < CI; i++) if (!d.has(K(cx(i), cy(j)))) { ok = false; break; }
        if (ok) { close.push([x, y]); break; }
      }
    }
    const blkAfter = new Set([...blockedProps, ...close.map(c => K(c[0], c[1]))]);
    const base = bfs(G, [officeDoor], blkAfter).get(K(14, 12));
    let shortcut = null, best = 0;
    for (let y = 2; y <= 16; y++) for (let x = 2; x <= 26; x++) {
      if (!isWallBetween(x, y) || G[y][x] !== '#') continue;
      G[y][x] = '.'; const dd = bfs(G, [officeDoor], blkAfter).get(K(14, 12)); G[y][x] = '#';
      if (dd !== undefined && base - dd > best) { best = base - dd; shortcut = [x, y]; }
    }
    const walls = []; for (let y = 2; y <= 16; y++) for (let x = 2; x <= 26; x++) if (isWallBetween(x, y) && G[y][x] === '#' && !(shortcut && x === shortcut[0] && y === shortcut[1])) walls.push([x, y]);
    const extraOpen = pick(r, walls);
    const plugs = {};
    close.forEach(([x, y]) => { plugs[K(x, y)] = true; G[y][x] = 'P'; });
    [shortcut, extraOpen].filter(Boolean).forEach(([x, y]) => { plugs[K(x, y)] = false; G[y][x] = 'P'; });

    // roses at three of the four statues
    const statueNames = shuffle(r, Object.keys(niches));
    const roseAt = statueNames.slice(0, 3);
    const items = roseAt.map((n, i) => ({ id: 'rose' + i, kind: 'rose', x: niches[n][0], y: niches[n][1], on: 'statue', name: `Rose cutting (${n})`,
      lines: [`At the foot of the ${n.toLowerCase()} statue, a rose cutting wrapped in damp paper.`, 'A tag in Locke\'s hand: "From C.\'s garden. Keep alive."'] }));
    const props = Object.entries(niches).map(([n, [x, y]]) => ({ type: 'statue', variant: n.toLowerCase(), x, y, block: true, name: `The ${n}` }));
    props.push({ type: 'fountain', x: 14, y: 9, block: true }, { type: 'plan', x: 4, y: 19, wall: 'n' }, { type: 'boiler', id: 'boiler', x: 30, y: 8, block: true, interact: true, label: 'Turn the valve' },
      { type: 'desk', x: 6, y: 21, block: true }, { type: 'hatch', id: 'hatch', x: 4, y: 22, hidden: true, interact: true, label: 'Open the cellar hatch' });

    // dead ends hold supplies, scarecrows and still gardeners
    const deadEnds = [];
    for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) {
      const x = cx(i), y = cy(j); if (inRect(x, y, LAWN) || G[y][x] !== '.') continue;
      const deg = N4.filter(([dx, dy]) => G[y + dy] && G[y + dy][x + dx] !== '#').length;
      if (deg === 1 && Math.abs(x - 2) + Math.abs(y - 17) > 4) deadEnds.push([x, y]);
    }
    const de = shuffle(r, deadEnds);
    const supplies = de.slice(0, 3);
    supplies.forEach(([x, y], i) => items.push(i === 0 ? { id: 'herb2', kind: 'herb', x, y, on: 'planter', name: 'Green herb', heal: true, lines: ['A bitter green herb. You chew it, and the pain eases.'] }
      : { id: 'ammoC' + i, kind: 'ammo', x, y, on: 'floor', name: 'Handgun bullets', ammo: 8, lines: ['Handgun bullets. Eight rounds.'] }));
    supplies.forEach(([x, y], i) => { if (i === 0) props.push({ type: 'planter', x, y }); });
    const openCells = []; for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) { const x = cx(i), y = cy(j); if (!inRect(x, y, LAWN) && G[y][x] === '.' && Math.abs(x - 2) + Math.abs(y - 17) > 5) openCells.push([x, y]); }
    const used = new Set([...supplies, ...route].map(([x, y]) => K(x, y)));
    const figSpots = shuffle(r, de.slice(3).concat(shuffle(r, openCells).slice(0, 6))).filter(([x, y]) => !used.has(K(x, y))).slice(0, 7);
    const figures = figSpots.map(([x, y], i) => ({ id: 'scare' + i, type: r() < .5 ? 'mannequin' : 'sleeper', look: 'scarecrow', x, y, sway: swayOf(r, opts), yaw: r() * 6.28 }));
    const pa = pick(r, openCells), pb = pick(r, openCells), pc = pick(r, openCells), pd = pick(r, openCells);
    const enemies = [{ id: 'g1', type: 'ghoul', look: 'gardener', x: pa[0], y: pa[1], state: 'patrol', patrol: [pa, pb] },
      { id: 'g2', type: 'ghoul', look: 'gardener', x: pc[0], y: pc[1], state: 'patrol', patrol: [pc, pd] }];
    const lights = [{ x: 4.5, y: 21, h: 2.6, color: 0xffb87a, i: 1.3, d: 12, flicker: 'candle' }, { x: 14, y: 9, h: 3.0, color: 0x9fb7d6, i: .8, d: 14 },
      { x: 29.5, y: 8, h: 1.2, color: 0xff7a3a, i: 1.1, d: 10, flicker: 'fire' }];

    const planG = G.map(row => row.slice());
    return {
      id: 'conservatory', index: 1, title: 'The Conservatory', sub: 'Locke Hall', seed, W, H, G, planG, rooms, roomAt, themes, plugs, doors: [], items, props, lights, figures, enemies,
      spawn: [4, 21, 'n'], safe: ['Office'], fog: .06, ambient: [0x26303a, .38],
      planLabels: [['Office', 4.5, 21.2], ['Lawn', 14, 7.2], ['Boiler', 29, 7.6], ['Owl', 1, 1.4], ['Stag', 27, 1.4], ['Hare', 1, 17.8], ['Swan', 27, 17.8]],
      planTitle: "The Conservatory, as planted",
      regrow: { close, open: [shortcut, extraOpen].filter(Boolean), shortcutGain: best },
      roses: roseAt, lawn: LAWN,
      intro: ['The trapdoor stair comes up through the floor of a gardener\'s office.', 'Beyond the glass, the conservatory has grown into a maze of black hedges.',
        'Locke\'s note is pinned to the plan: "Three cuttings for the cellar. Then the boiler. Mind the scarecrows."'],
      script: function (api) {
        const S = { roses: 0, trials: 0 };
        const OFFICE = [[2, 17], [2, 18], [2, 19], [3, 19], [4, 19]];
        // lawn bounds in world units, keeping clear of the hedges and the fountain
        const LX0 = LAWN[0] * 2, LZ0 = LAWN[1] * 2, LX1 = (LAWN[2] + 1) * 2, LZ1 = (LAWN[3] + 1) * 2, FX = 29, FZ = 19;
        const inside = (x, z) => x > LX0 + .8 && x < LX1 - .8 && z > LZ0 + .8 && z < LZ1 - .8 && Math.hypot(x - FX, z - FZ) > 1.7;
        function lanternPath() {
          // outbound path for triangle completion: 2 or 3 legs, varied lengths and turn angles
          for (let k = 0; k < 600; k++) {
            let x = LX0 + 1 + api.rng() * (LX1 - LX0 - 2), z = LZ0 + 1 + api.rng() * (LZ1 - LZ0 - 2);
            if (!inside(x, z)) continue;
            const legs = api.rng() < .5 ? 2 : 3; let h = api.rng() * Math.PI * 2; const pts = [[x, z]], lens = [], turns = []; let good = true;
            for (let i = 0; i < legs && good; i++) {
              if (i > 0) { const t = [60, 90, 120, 150][Math.floor(api.rng() * 4)] * (api.rng() < .5 ? -1 : 1); h += t * Math.PI / 180; turns.push(t); }
              const L = 2.5 + api.rng() * 6.5; lens.push(+L.toFixed(2));
              for (let q = 1; q <= 12; q++) if (!inside(x + Math.sin(h) * L * q / 12, z - Math.cos(h) * L * q / 12)) { good = false; break; }
              x += Math.sin(h) * L; z -= Math.cos(h) * L; pts.push([x, z]);
            }
            if (good) return { pts, lens, turns, legs, length: +lens.reduce((a, b) => a + b, 0).toFixed(2) };
          }
          return null;
        }
        function nextTrial() {
          S.trials++;
          const d = lanternPath();
          if (!d || S.trials > 5) return finishBlackout();
          api.lantern(d, res => {
            api.say([res.err < 1.5 ? 'The match flares. You are almost exactly where the lantern first waited.' : res.err < 3.5 ? 'The match flares. Close, but not quite.' : 'The match flares on bare lawn. The lantern waited somewhere else entirely.',
              S.trials < 5 ? 'Out in the steam, the little light kindles again, waiting.' : 'The lantern does not come back.'], '', nextTrial);
          });
        }
        function finishBlackout() {
          api.holdAll(false); api.flashlight(true); api.fog(.06);
          api.say(['The steam thins. Your flashlight sputters back to life.', 'The hedges look different. Fresh growth, thick and dark, where there was none an hour ago.', 'Get back to the office.'], '',
            () => api.leg('transition', OFFICE));
        }
        const keyStatue = roseAt[Math.floor(api.rng() * roseAt.length)];
        return {
          onStart() { api.goal(roseAt.flatMap(n => api.tilesAround(niches[n][0], niches[n][1]))); },
          onTake(it) {
            if (it.kind === 'rose') {
              S.roses++;
              const left = roseAt.filter((n, i) => !api.has('rose' + i));
              if (left.length) api.goal(left.flatMap(n => api.tilesAround(niches[n][0], niches[n][1])));
              else { api.goal([[29, 8]]); api.say(['Three cuttings. Locke\'s note said the boiler next.']); }
            }
            if (it.id === 'hatchkey') api.leg('return', OFFICE);
          },
          onLegEnd(name) {
            if (name === 'transition') {
              // reward revaluation: the goal moves to a place already visited, while the maze stays exactly as it is now
              const [nx, ny] = niches[keyStatue];
              api.placeItem({ id: 'hatchkey', kind: 'key', x: nx, y: ny, on: 'statue', name: 'Hatch key', lines: ['A heavy iron key, warm from the steam.'] });
              api.showProp('hatch');
              api.say(['The cellar hatch in the corner is chained shut.', `A tag on the chain, in Locke's hand: "Key left with the ${keyStatue}. Where the cuttings were."`], '',
                () => api.leg('reward', api.tilesAround(nx, ny)));
            }
          },
          onProp(p) {
            if (p.id === 'boiler') {
              if (S.roses < 3) { api.say(['A brass valve wheel, stiff with rust.', 'Locke\'s note: the cuttings first.']); return true; }
              if (S.valve) return true;
              S.valve = true; api.event('valve'); api.sfx('thud', 1);
              api.say(['You heave the wheel round. The pipes shudder, then scream.', 'Steam floods out across the glasshouse. Somewhere a pane shatters.'], '', () => api.goal([[14, 9]]));
              return true;
            }
            if (p.id === 'hatch') {
              if (!api.has('hatchkey')) { api.say(['Chained shut. The tag says the key is with the ' + keyStatue + '.']); return true; }
              api.event('chapter-end');
              api.say(['The key turns. You lay the three cuttings on the hatch and it opens on its own.', 'Below, candlelight, and the sound of a waltz played on a music box, over and over.'], '', () => api.endChapter());
              return true;
            }
            return false;
          },
          onTile(x, y, room) {
            if (S.valve && !S.blackout && Math.abs(x - 14) + Math.abs(y - 9) <= 2) {
              S.blackout = true; api.event('blackout');
              api.flashlight(false); api.fog(.55); api.holdAll(true); api.goal(null);
              close.forEach(([a, b]) => api.setPlug(K(a, b), false));
              [shortcut, extraOpen].filter(Boolean).forEach(([a, b]) => api.setPlug(K(a, b), true));
              api.say(['The steam rolls over the lawn and your flashlight gutters out. You can\'t see your own hand.',
                'A small light bobs up out of the steam. A lantern, carried by no one you can see. It waits for you.',
                'Follow it. When it goes out, walk back to where it first waited, and strike a match.'], '', nextTrial);
            }
          },
        };
      },
    };
  }
  /* =====================================================================
     Chapter 3: the Palace (Locke's memory palace in the cellar)
     A rotunda of six veils. Which veil opens onto which memory room is
     reshuffled by the Architect every time a memory is put back.
     ===================================================================== */
  function palace(seed, opts) {
    const r = rng32(seed * 31 + 3), W = 34, H = 29, G = grid(W, H);
    const ROT = [14, 12, 20, 18];
    carve(G, ROT[0], ROT[1], ROT[2], ROT[3]);
    const roomDefs = [
      { name: 'Ballroom', rect: [2, 2, 8, 7], theme: 'ballroom', veil: [5, 8], inside: [5, 7], face: 'n', home: 'dance', prop: 'piano' },
      { name: 'Chapel', rect: [26, 2, 31, 7], theme: 'chapel', veil: [28, 8], inside: [28, 7], face: 'n', home: 'ring', prop: 'pews' },
      { name: 'Garden Room', rect: [2, 11, 7, 17], theme: 'garden', veil: [8, 14], inside: [7, 14], face: 'w', home: 'lily', prop: 'fountain' },
      { name: 'Music Room', rect: [27, 11, 31, 17], theme: 'music', veil: [26, 14], inside: [27, 14], face: 'e', home: 'score', prop: 'harp' },
      { name: 'Nursery', rect: [2, 21, 7, 26], theme: 'nursery', veil: [4, 20], inside: [4, 21], face: 's', home: 'rattle', prop: 'crib' },
      { name: 'Letter Room', rect: [26, 21, 31, 26], theme: 'letters', veil: [28, 20], inside: [28, 21], face: 's', home: 'letter', prop: 'books' }];
    roomDefs.forEach(d => { carve(G, ...d.rect); G[d.veil[1]][d.veil[0]] = 'V'; });
    // rotunda veils, numbered clockwise from the north-west
    const rotVeils = [{ v: [15, 11], inside: [15, 12], face: 's' }, { v: [19, 11], inside: [19, 12], face: 's' }, { v: [21, 14], inside: [20, 14], face: 'w' },
      { v: [21, 16], inside: [20, 16], face: 'w' }, { v: [13, 16], inside: [14, 16], face: 'e' }, { v: [13, 14], inside: [14, 14], face: 'e' }];
    rotVeils.forEach(o => G[o.v[1]][o.v[0]] = 'V');
    carve(G, 17, 19, 17, 21); carve(G, 14, 22, 20, 26);          // corridor + Locke's study
    carve(G, 16, 8, 18, 10); G[11][17] = 'D';                    // stair landing behind the north door
    const rooms = [{ name: 'Rotunda', rect: ROT, theme: 'rotunda' }, { name: "Locke's Study", rect: [14, 22, 20, 26], theme: 'lockestudy' },
      { name: 'Stair Landing', rect: [16, 8, 18, 10], theme: 'stone' }, ...roomDefs.map(d => ({ name: d.name, rect: d.rect, theme: d.theme }))];
    const roomAt = makeRoomAt(rooms, (x, y) => (x === 17 && y >= 19 && y <= 21) ? 'Rotunda' : null);
    const themes = {}; rooms.forEach(rm => themes[rm.name] = rm.theme);
    const doors = [{ id: 'S', x: 17, y: 11, axis: 'z', needs: 'flag:locke', locked: ['The stair door is barred from this side by a beam no single person could lift.'], open: ['Together you lift the beam. Cold air pours down the stair.'] }];

    // which room each veil opens onto, and the memories, each lying in the wrong room
    const perm0 = shuffle(r, [0, 1, 2, 3, 4, 5]);
    const memories = [
      { id: 'dance', name: 'A dance card', home: 'Ballroom', lines: ['A dance card. Every line is filled with the same name: Clara.'] },
      { id: 'ring', name: 'A wedding ring', home: 'Chapel', lines: ['A thin gold ring, worn smooth on the inside.'] },
      { id: 'lily', name: 'A pressed lily', home: 'Garden Room', lines: ['A lily pressed flat between two sheets of glass. It still smells faintly sweet.'] },
      { id: 'score', name: 'Sheet music', home: 'Music Room', lines: ['A waltz in Locke\'s hand. The last four bars are scratched out and rewritten again and again.'] },
      { id: 'rattle', name: 'A silver rattle', home: 'Nursery', lines: ['A silver rattle, never dented. It was never used.'] },
      { id: 'letter', name: 'A letter', home: 'Letter Room', lines: ['A letter in Clara\'s hand. The ink has run where it was cried on.'] }];
    let der; do { der = shuffle(r, [0, 1, 2, 3, 4, 5]); } while (der.some((v, i) => v === i));
    const items = memories.map((m, i) => {
      const room = roomDefs[der[i]], [x0, y0, x1, y1] = room.rect;
      const px = x0 + 1, py = y0 + (room.face === 'n' ? 0 : 1);
      let x, y; do { x = RI(r, x0 + 1, x1 - 1); y = RI(r, y0 + 1, y1 - 1); } while ((x === room.inside[0] && y === room.inside[1]) || (x === px && y === py) || (Math.abs(x - (x0 + x1) / 2) < 1 && Math.abs(y - (y0 + y1) / 2) < 1));
      return { id: m.id, kind: 'memory', x, y, on: 'floor', name: m.name, memory: true, home: m.home, lines: m.lines.concat([`It belongs somewhere else. Somewhere in the ${m.home.toLowerCase()}.`]) };
    });
    items.push({ id: 'ammoP1', kind: 'ammo', x: 15, y: 25, on: 'floor', name: 'Handgun bullets', ammo: 10, lines: ['Handgun bullets. Ten rounds.'] },
      { id: 'herbP', kind: 'herb', x: 19, y: 25, on: 'planter', name: 'Green herb', heal: true, lines: ['A bitter green herb. You chew it, and the pain eases.'] });
    const props = [{ type: 'plan', x: 15, y: 22, wall: 'n' }, { type: 'statue', variant: 'clara', x: 17, y: 15, block: true, name: 'Clara', lines: ['A marble Clara, life size. Her face is unfinished.'] },
      { type: 'chandelier', x: 17, y: 15 }, { type: 'desk', x: 19, y: 24, block: true }, { type: 'planter', x: 19, y: 25 }, { type: 'stairs', x: 17, y: 8 },
      { type: 'figure-locke', id: 'locke', x: 16, y: 24, block: true, interact: true, label: 'Speak to the man at the desk' }];
    roomDefs.forEach((d, i) => {
      const [x0, y0, x1, y1] = d.rect, mx = Math.round((x0 + x1) / 2), my = Math.round((y0 + y1) / 2);
      props.push({ type: 'plinth', id: 'plinth-' + d.home, x: mx, y: my, block: true, interact: true, label: 'Examine the plinth', home: d.home });
      props.push({ type: d.prop, x: d.rect[0] + 1, y: d.rect[1] + (d.face === 'n' ? 0 : 1), block: d.prop !== 'books' });
    });
    const figures = [];
    shuffle(r, roomDefs).forEach((d, i) => {
      const [x0, y0, x1, y1] = d.rect; let x, y;
      do { x = RI(r, x0, x1); y = RI(r, y0, y1); } while (items.some(it => it.x === x && it.y === y) || (x === d.inside[0] && y === d.inside[1]) || props.some(p => p.x === x && p.y === y));
      figures.push({ id: 'form' + i, type: r() < .5 ? 'mannequin' : 'sleeper', look: 'dressform', x, y, sway: swayOf(r, opts), yaw: r() * 6.28 });
    });
    const enemies = [{ id: 'guardian', type: 'guardian', x: 17, y: 12, state: 'patrol', patrol: [[14, 12], [20, 12], [20, 18], [14, 18]], speed: .9 }];
    const lights = [{ x: 17, y: 15, h: 3.0, color: 0xffc27a, i: 1.2, d: 14, flicker: 'candle' }, { x: 17, y: 24, h: 2.4, color: 0xffa860, i: 1.1, d: 10, flicker: 'candle' }];
    roomDefs.forEach(d => { const [x0, y0, x1, y1] = d.rect; lights.push({ x: (x0 + x1) / 2 + .5, y: (y0 + y1) / 2 + .5, h: 2.7, color: { ballroom: 0xffd9a0, chapel: 0xb0c4ff, garden: 0xc8f0b0, music: 0xffc0a0, nursery: 0xffe0f0, letters: 0xffd090 }[d.theme], i: .9, d: 11 }); });

    // plan labels show the ORIGINAL mapping, written beside each veil
    const planLabels = [['Rotunda', 17, 13.2], ["Locke's Study", 17, 24], ...rotVeils.map((o, i) => [roomDefs[perm0[i]].name, o.v[0] + (o.face === 'e' ? -2.6 : o.face === 'w' ? 2.6 : 0), o.v[1] + (o.face === 's' ? -.8 : .3)]),
      ...roomDefs.map(d => [d.name, (d.rect[0] + d.rect[2]) / 2 + .5, (d.rect[1] + d.rect[3]) / 2 + .8])];
    const planG = G.map(row => row.slice());
    return {
      id: 'palace', index: 2, title: 'The Palace', sub: 'Beneath Locke Hall', seed, W, H, G, planG, rooms, roomAt, themes, plugs: {}, doors, items, props, lights, figures, enemies,
      spawn: [17, 25, 'n'], safe: ["Locke's Study"], fog: .07, ambient: [0x3a2a30, .4], planLabels, planTitle: 'The Palace, as built', roomDefs, rotVeils, perm0, memories,
      intro: ['A study at the bottom of the stair, warm and lamplit. A man sits at the desk with his back to you.', 'He does not turn around.',
        'On the wall, a plan of rooms arranged around a rotunda. Each doorway is labeled in a careful hand.'],
      script: function (api) {
        const S = { perm: perm0.slice(), prev: null, placed: 0, carrying: null, trip: 0, shuffles: 0, condOffset: api.rng() < .5 ? 0 : 1, test: null, inRoom: null, enteredBy: null };
        const inv = p => { const o = []; p.forEach((room, v) => o[room] = v); return o; };
        // Reshuffles are built so one local glimpse is enough to work out the answer:
        // a swap exchanges the room you are in with the target room (the target is now behind the veil you came in by);
        // a rotation shifts every veil by the same step (seeing where you come out tells you the step).
        function reshuffle(cur, target) {
          S.prev = S.perm.slice(); const iv = inv(S.perm);
          const kind = S.shuffles++ % 2 ? 'rotate' : 'swap';
          if (kind === 'swap') { const a = iv[cur], b = iv[target]; [S.perm[a], S.perm[b]] = [S.perm[b], S.perm[a]]; }
          else { const k = 1 + Math.floor(api.rng() * 5); S.perm = S.perm.map((_, i) => S.prev[(i + k) % 6]); }
          api.event('reshuffle', { kind, cur: roomDefs[cur].name, target: roomDefs[target].name, perm: S.perm.slice(), prev: S.prev });
          api.sfx('thud', .7);
          return kind;
        }
        function setTest(phase, cond, kind, target, prevPerm) { S.test = { phase, cond, kind, room: target, prev: prevPerm, armed: false, glimpse: null, enteredBy: S.enteredBy }; }
        return {
          onStart() { api.goal(null); },
          onVeil(v) {
            const id = v.id;
            if (id.startsWith('rot')) {
              const i = +id.slice(3), room = roomDefs[S.perm[i]];
              const target = S.carrying ? roomDefs.findIndex(d => d.home === S.carrying) : null;
              api.event('veil', { veil: i, room: room.name, carrying: S.carrying, correct: target === null ? null : inv(S.perm)[target], stale: target === null || !S.prev ? null : inv(S.prev)[target], plan: target === null ? null : inv(perm0)[target], trip: S.trip });
              const T_ = S.test;
              if (T_ && T_.armed) {
                // the first choice after the glimpse: did the player integrate it?
                const correct = inv(S.perm)[T_.room], stale = inv(T_.prev)[T_.room];
                const cls = i === correct ? 'correct' : i === stale ? 'stale' : i === T_.glimpse ? 'glimpse' : 'other';
                api.event('integrate', { phase: T_.phase, cond: T_.cond, kind: T_.kind, veil: i, correct, stale, glimpse: T_.glimpse, cls, target: roomDefs[T_.room].name });
                S.test = null;
              }
              S.enteredBy = i; S.inRoom = S.perm[i];
              return { x: room.inside[0], y: room.inside[1], face: room.face, room: room.name };
            }
            const ri = roomDefs.findIndex(d => 'room' + d.name === id), vi = inv(S.perm)[ri], o = rotVeils[vi];
            if (S.test && !S.test.armed) { S.test.armed = true; S.test.glimpse = vi; api.event('glimpse', { veil: vi, room: roomDefs[ri].name, cameIn: S.test.enteredBy }); }
            return { x: o.inside[0], y: o.inside[1], face: o.face, room: 'Rotunda' };
          },
          onTake(it) {
            if (!it.memory) return;
            S.carrying = it.id; S.trip++;
            const cur = S.inRoom, hi = roomDefs.findIndex(d => d.home === it.id), prevPerm = S.perm.slice();
            const kind = reshuffle(cur, hi); setTest('carry', 'TR', kind, hi, prevPerm);
            api.say(['As your fingers close on it, the floor shivers. Somewhere, a doorway has changed its mind.']);
            const home = roomDefs[hi];
            api.goal(api.tilesAround(...[Math.round((home.rect[0] + home.rect[2]) / 2), Math.round((home.rect[1] + home.rect[3]) / 2)]));
          },
          canTake(it) { if (it.memory && S.carrying) { api.say(['Your hands are full. One memory at a time; they are heavier than they look.']); return false; } return true; },
          onProp(p) {
            if (p.type === 'plinth') {
              if (S.carrying === p.home) {
                api.drop(S.carrying); api.showMemoryOn(p); S.carrying = null; S.placed++; api.event('placed', { home: p.home, n: S.placed });
                if (S.placed === 3) S.blackPending = true;
                api.goal(null);
                if (S.placed < 6) {
                  const cond = (S.placed + S.condOffset) % 2 ? 'TR' : 'RR', prevPerm = S.perm.slice();
                  // move one waiting memory to another room and let the player hear where it went
                  const waiting = items.filter(m => m.memory && !api.isTaken(m.id));
                  const m = waiting[Math.floor(api.rng() * waiting.length)];
                  const cur = roomDefs.findIndex(d => { const [x0, y0, x1, y1] = d.rect; const it = api.itemPos(m.id); return it && it[0] >= x0 && it[0] <= x1 && it[1] >= y0 && it[1] <= y1; });
                  const choices = roomDefs.map((d, i) => i).filter(i => i !== cur && i !== S.inRoom && roomDefs[i].home !== m.id);
                  const to = choices[Math.floor(api.rng() * choices.length)], d = roomDefs[to];
                  let x, y, guard = 0; do { x = d.rect[0] + 1 + Math.floor(api.rng() * (d.rect[2] - d.rect[0] - 1)); y = d.rect[1] + 1 + Math.floor(api.rng() * (d.rect[3] - d.rect[1] - 1)); } while (!api.free(x, y) && ++guard < 50);
                  api.moveItem(m.id, x, y);
                  const kind = cond === 'TR' ? reshuffle(S.inRoom, to) : 'none';
                  setTest('seek', cond, kind, to, prevPerm);
                  api.event('revalue', { cond, item: m.id, room: d.name });
                  api.say(['The memory settles onto the plinth as if it had never left.', `Somewhere far off, ${m.name.toLowerCase()} falls to the floor of the ${d.name.toLowerCase()}. You hear it as clearly as if it were beside you.`].concat(cond === 'TR' ? ['Then stone grinds against stone. The palace has moved again.'] : ['The palace stays quiet.']));
                }
                else { S.test = null; api.say(['The last memory settles into place. For a moment the whole palace is perfectly still.', 'Somewhere above, in the study, a chair scrapes back.']); api.goal([[16, 23], [15, 24], [17, 24]]); }
              } else if (S.carrying) api.say(['An empty plinth. A brass plate reads: ' + p.home.toUpperCase() + '.', 'What you are carrying does not belong here.']);
              else api.say(['An empty plinth. A brass plate reads: ' + p.home.toUpperCase() + '.']);
              return true;
            }
            if (p.id === 'locke') {
              if (S.placed < 6) { api.say(['Elias Locke stares at the plan on the wall, lips moving. He does not see you.', '"She was in the garden room," he whispers. "No. The chapel. They keep moving."'], 'Locke'); return true; }
              if (!S.follow) {
                S.follow = true; api.flag('locke', true); api.event('locke-follows'); api.follower('locke');
                api.say(['Locke turns. His eyes find you, slowly.', '"Every room is where it belongs," he says. "I can leave them now. Will you take me up?"', 'Behind the rotunda, the Guardian roars.'], 'Locke', () => { api.wake('guardian', 1.25); api.goal([[17, 10], [17, 9]]); });
              }
              return true;
            }
            return false;
          },
          onTile(x, y, room) {
            if (S.blackPending && room === 'Rotunda' && !S.follow) {
              S.blackPending = false; api.event('rotunda-blackout'); api.flashlight(false); api.hold('guardian', true);
              api.say(['Overhead, chain grinds against stone. The chandelier comes down in a roar of glass and every candle in the rotunda goes out.',
                'Your flashlight dies with them. Find the mouth of the corridor to Locke\'s study, and strike a match when you think you\'re standing in it.'], '',
                () => api.homing([17, 18], 'Strike a match', res => {
                  api.flashlight(true); api.hold('guardian', false);
                  api.say([res.err < 2.5 ? 'The match flares on the corridor arch, right beside you.' : 'The match flares. The corridor is somewhere else entirely. Your flashlight coughs back to life.']);
                }));
            }
            if (S.follow && room === 'Stair Landing' && !S.done) { S.done = true; api.event('chapter-end'); api.say(['You climb with Locke\'s hand on your shoulder. Below, the palace settles, room by room, into its places.', '"Thank you," he says. "I think I can remember her now without holding on so tightly."'], 'Locke', () => api.endChapter()); }
          },
          veilLabel() { return 'Step through the veil'; },
          planNote() { return 'The labels are in Locke\'s hand. They were true once.'; },
        };
      },
      veils: [...rotVeils.map((o, i) => ({ id: 'rot' + i, x: o.v[0], y: o.v[1], axis: o.face === 's' ? 'z' : 'x' })),
        ...roomDefs.map(d => ({ id: 'room' + d.name, x: d.veil[0], y: d.veil[1], axis: (d.face === 'n' || d.face === 's') ? 'z' : 'x' }))],
    };
  }

  /* =====================================================================
     Prologue: the grounds. A short walk up the drive every session.
     It scores nothing; it lets controls settle and measures them cleanly:
     a long straight avenue (walking speed), a crypt loop (turning, scrapes),
     and crows on fence posts at varied distances (aim).
     ===================================================================== */
  function grounds(seed, opts) {
    const r = rng32(seed * 17 + 9), W = 22, H = 30, G = grid(W, H);
    carve(G, 9, 3, 11, 27);                                    // the avenue
    carve(G, 13, 11, 18, 19); carve(G, 15, 14, 16, 16, '#');   // crypt garden loop around the crypt
    G[13][12] = '.'; G[17][12] = '.';
    carve(G, 3, 6, 7, 10); G[8][8] = '.';                      // orchard
    const rooms = [{ name: 'Front Steps', rect: [9, 3, 11, 4], theme: 'stone' }, { name: 'The Drive', rect: [9, 5, 11, 27], theme: 'drive' },
      { name: 'Crypt Garden', rect: [12, 11, 18, 19], theme: 'lawn' }, { name: 'Orchard', rect: [3, 6, 8, 10], theme: 'lawn' }];
    const roomAt = makeRoomAt(rooms);
    const themes = {}; rooms.forEach(rm => themes[rm.name] = rm.theme);
    // posts in niches along the drive and in the garden; six get crows
    const niches = [[8, 7], [12, 9], [8, 13], [8, 18], [12, 22], [8, 24], [18, 11], [13, 19], [3, 6], [7, 10]];
    niches.forEach(([x, y]) => { if (G[y][x] === '#') G[y][x] = '.'; });
    const crowAt = shuffle(r, niches).slice(0, 6);
    const props = niches.map(([x, y]) => ({ type: 'post', x, y, block: true }));
    props.push({ type: 'housedoor', id: 'door', x: 10, y: 3, wall: 'n', interact: true, label: 'Knock' },
      { type: 'statue', variant: 'clara', x: 15, y: 13, block: true, name: 'An angel', lines: ['A stone angel on the crypt roof, wings folded. Someone has hung a fresh lily on its hand.'] });
    const targets = crowAt.map(([x, y], i) => ({ id: 'crow' + i, x, y, h: 1.55 }));
    const lights = [{ x: 10.5, y: 25, h: 2.6, color: 0xffc070, i: .9, d: 12, flicker: 'candle' }, { x: 10.5, y: 15, h: 2.6, color: 0xffc070, i: .9, d: 12, flicker: 'candle' },
      { x: 10.5, y: 5, h: 2.6, color: 0xffc070, i: 1.1, d: 12, flicker: 'candle' }];
    const planG = G.map(row => row.slice());
    return {
      id: 'grounds', index: -1, title: 'The Grounds', sub: 'Locke Hall', seed, W, H, G, planG, rooms, roomAt, themes, plugs: {}, doors: [], items: [], props, lights, figures: [], enemies: [], targets,
      spawn: [10, 26, 'n'], safe: ['Front Steps'], fog: .045, ambient: [0x3a4458, .5], planLabels: [], planTitle: 'The Grounds',
      intro: ['Your car died at the bottom of the drive. Lanterns are lit all the way up to the house.', 'Crows sit on the fence posts along the way, watching you.',
        'A note is tied to the gate in Locke\'s hand: "Scatter the crows before you knock. The house will not open while they watch."'],
      script: function (api) {
        const S = { crows: 0 };
        return {
          onStart() { api.goal([[10, 4]]); },
          onTarget() { S.crows++; if (S.crows === 6) api.toast('The last crow lifts away over the roof.'); },
          onProp(p) {
            if (p.id !== 'door') return false;
            if (S.crows < 6) { api.say([`${6 - S.crows === 1 ? 'One crow still watches' : (6 - S.crows) + ' crows still watch'} from the posts.`, 'The knocker will not lift.']); return true; }
            api.event('chapter-end'); api.say(['The knocker lifts easily now. The door swings open before you touch it.'], '', () => api.endChapter()); return true;
          },
        };
      },
    };
  }

  const GENERATORS = [eastWing, conservatory, palace];
  const api = { rng32, GENERATORS, generate: (i, seed, opts) => GENERATORS[i](seed, opts || {}), prologue: (seed, opts) => grounds(seed, opts || {}), K, bfs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PALACE_LEVELS = api;
})(typeof window !== 'undefined' ? window : globalThis);
