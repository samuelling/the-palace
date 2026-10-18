/* The Palace, 16-bit: seeded chapter generators.
   Pure data plus small chapter scripts. Runs in the browser (window.PALACE16_WORLD) and in node.
   A chapter is a set of areas (single-screen rooms or larger scrolling grounds) joined by exits.
   Units: one tile is 16 px and stands for one metre in every model. */
(function (root) {
  'use strict';
  const K = (x, y) => x + ',' + y, N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  function rng32(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // eye-pulse contrast of a sentinel that is only pretending to be armour; scaled per player so decisions sit near threshold
  const contrastOf = (r, opts) => Math.max(.004, Math.min(.12, pick(r, [.012, .02, .03, .045]) * ((opts && opts.contrastScale) || 1)));

  /* ---------- building blocks ---------- */
  function makeArea(id, name, w, h, o) {
    const fill = (o && o.fillCh) || '#', grid = []; for (let y = 0; y < h; y++) grid.push(new Array(w).fill(fill));
    return Object.assign({ id, name, w, h, grid, exits: [], props: [], items: [], figures: [], enemies: [], lights: [], crows: [], floor: 'stone', wall: 'stone', amb: .35, dark: false, fgrid: null }, o || {});
  }
  function room(id, name, o) { const a = makeArea(id, name, 16, 12, o); for (let y = 2; y <= 10; y++) for (let x = 1; x <= 14; x++) a.grid[y][x] = '.'; return a; }
  const EXIT = { N: [[7, 0], [8, 0], [7, 1], [8, 1]], S: [[7, 11], [8, 11]], W: [[0, 5], [0, 6]], E: [[15, 5], [15, 6]] };
  function exit(a, side, id, o) { const tiles = (o && o.tiles) || EXIT[side]; tiles.forEach(([x, y]) => a.grid[y][x] = 'D'); const e = Object.assign({ id, area: a.id, side, state: 'open', to: null }, o || {}); e.tiles = tiles; a.exits.push(e); return e; }
  function link(e1, e2) { e1.to = e2.id; e2.to = e1.id; }
  function prop(a, type, x, y, o) { const p = Object.assign({ type, x, y, fw: 1, fh: 1, block: true }, o || {}); a.props.push(p); return p; }
  function wallp(a, type, x, o) { return prop(a, type, x, 1, Object.assign({ wall: true, block: false }, o || {})); }
  function light(a, x, y, rad, color, flicker) { a.lights.push({ x, y, r: rad, color, flicker }); }
  function blockedSet(a) { const s = new Set(); a.props.forEach(p => { if (p.block && !p.wall && !p.decal) for (let i = 0; i < p.fw; i++) for (let j = 0; j < p.fh; j++) s.add(K(p.x + i, p.y + j)); }); a.figures.forEach(f => s.add(K(f.x, f.y))); return s; }
  function reach(a, from, extraBlock) {
    const blk = blockedSet(a); if (extraBlock) blk.add(extraBlock);
    const ok = (x, y) => x >= 0 && y >= 0 && x < a.w && y < a.h && (a.grid[y][x] === '.' || a.grid[y][x] === 'D') && !blk.has(K(x, y));
    const seen = new Set([K(from[0], from[1])]), q = [from];
    while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = K(nx, ny); if (!seen.has(k) && ok(nx, ny)) { seen.add(k); q.push([nx, ny]); } } }
    return seen;
  }
  // free floor tiles in a room that can be reached from the middle, away from items
  function spots(a, r, opt) {
    const rc = reach(a, opt && opt.from || [7, 6]), blk = blockedSet(a), out = [];
    const x0 = opt && opt.x0 || 1, x1 = opt && opt.x1 || a.w - 2, y0 = opt && opt.y0 || 2, y1 = opt && opt.y1 || a.h - 2;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!rc.has(K(x, y)) || blk.has(K(x, y)) || a.grid[y][x] !== '.') continue;
      if (a.items.some(i => i.x === x && i.y === y)) continue;
      const cross = a.w === 16 && ((x >= 6 && x <= 9) || (y >= 4 && y <= 7));
      if (opt && opt.noCross && cross) continue;
      if (opt && opt.wallside && !(x === 1 || x === a.w - 2 || y === 2)) continue;
      out.push([x, y]);
    }
    return shuffle(r, out);
  }
  // place a standing figure where it cannot cut a room in two
  function placeFigure(a, r, f, opt) {
    const targets = a.exits.map(e => e.tiles[e.tiles.length - 1]).concat(a.items.map(i => [i.x, i.y]));
    for (const [x, y] of spots(a, r, Object.assign({ noCross: true }, opt))) {
      const rc = reach(a, opt && opt.from || [7, 6], K(x, y));
      if (targets.every(([tx, ty]) => rc.has(K(tx, ty)) || a.grid[ty][tx] === 'D' && N4.some(([dx, dy]) => rc.has(K(tx + dx, ty + dy))))) { a.figures.push(Object.assign({ x, y }, f)); return true; }
    }
    return false;
  }

  /* ---------- room furnishing ---------- */
  const LINES = {
    clara: ['"Clara Locke, 1871."', 'Someone has wiped the dust from her face, and only from her face.'],
    clock: ['The long-case clock reads twelve past three.', 'The pendulum swings, but the hands have not moved since you came in.'],
  };
  const DECOR = {
    foyer(a) { prop(a, 'rug', 6, 5, { fw: 4, fh: 3, decal: true, block: false, id: 'rug' }); wallp(a, 'portraitClara', 5, { id: 'clara', interact: true, label: 'Look at the portrait', lines: LINES.clara }); wallp(a, 'window', 10);
      prop(a, 'clock', 13, 2, { id: 'clock', interact: true, label: 'Look at the clock', lines: LINES.clock }); prop(a, 'plant', 1, 2); prop(a, 'plant', 14, 10); prop(a, 'lectern', 3, 9, { id: 'plan', interact: true, label: 'Read the plan' });
      prop(a, 'candelabra', 12, 9); light(a, 12.5, 9.3, 60, '#ffb060', 'candle'); light(a, 8, 6, 90, '#ffc080', 'candle'); },
    library(a) { prop(a, 'bookshelf', 1, 2, { fw: 2 }); prop(a, 'bookshelf', 3, 2, { fw: 2 }); prop(a, 'bookshelf', 10, 2, { fw: 2 }); prop(a, 'bookshelf', 12, 2, { fw: 2 });
      prop(a, 'table', 2, 9, { fw: 2 }); prop(a, 'armchair', 13, 9); light(a, 3, 9, 50, '#ffa850', 'candle'); },
    gallery(a) { [2, 4, 10, 12].forEach(x => wallp(a, 'portrait', x)); prop(a, 'bench', 2, 9, { fw: 2 }); prop(a, 'bench', 11, 9, { fw: 2 }); prop(a, 'urn', 1, 2); prop(a, 'urn', 14, 2); light(a, 8, 3, 70, '#d0c8a0'); },
    music(a) { prop(a, 'piano', 2, 8, { fw: 2, fh: 2 }); prop(a, 'harp', 12, 2); prop(a, 'chair', 11, 9); prop(a, 'chair', 13, 9); wallp(a, 'window', 4); wallp(a, 'window', 11); light(a, 8, 6, 70, '#ffc0a0', 'candle'); },
    morning(a) { prop(a, 'tableCloth', 2, 9, { fw: 2 }); prop(a, 'chair', 1, 8, { block: true }); prop(a, 'plant', 14, 2); prop(a, 'armchair', 12, 9); wallp(a, 'window', 3); wallp(a, 'window', 11); light(a, 3, 9, 60, '#ffd0a0', 'candle'); },
    dining(a) { prop(a, 'longTable', 11, 9, { fw: 3 }); prop(a, 'chair', 10, 9); prop(a, 'candelabra', 2, 2); wallp(a, 'portrait', 11); wallp(a, 'window', 4); light(a, 12.5, 9, 60, '#ffb060', 'candle'); light(a, 2.5, 2.3, 50, '#ffb060', 'candle'); },
    parlour(a) { prop(a, 'sofa', 2, 9, { fw: 2 }); prop(a, 'armchair', 1, 8); prop(a, 'fireplace', 11, 2, { fw: 2, anim: true }); prop(a, 'rug', 6, 5, { fw: 4, fh: 3, decal: true, block: false }); light(a, 12, 2.8, 80, '#ff7a3a', 'fire'); },
    boot(a) { prop(a, 'bench', 1, 9, { fw: 2 }); wallp(a, 'pegs', 10, { fw: 2 }); prop(a, 'crate', 13, 9); prop(a, 'barrel', 14, 2); light(a, 8, 6, 50, '#c0c8d0'); },
    pantry(a) { prop(a, 'shelfJars', 1, 2, { fw: 2 }); prop(a, 'shelfJars', 11, 2, { fw: 2 }); prop(a, 'sacks', 2, 9); prop(a, 'barrel', 13, 9); prop(a, 'barrel', 14, 8); light(a, 8, 6, 46, '#c0a080'); },
    hall(a) { prop(a, 'runner', 6, 2, { fw: 2, fh: 6, decal: true, block: false, dx: 8 }); prop(a, 'urn', 2, 2); prop(a, 'urn', 13, 2); prop(a, 'candelabra', 1, 9); prop(a, 'candelabra', 14, 9); wallp(a, 'window', 4); wallp(a, 'window', 11);
      light(a, 1.5, 9.3, 50, '#ffb060', 'candle'); light(a, 14.5, 9.3, 50, '#ffb060', 'candle'); },
    study(a) { prop(a, 'fireplace', 3, 2, { fw: 2, anim: true }); prop(a, 'bookshelf', 11, 2, { fw: 2 }); prop(a, 'desk', 11, 9, { fw: 2 }); prop(a, 'armchair', 3, 9); wallp(a, 'portraitClara', 8); light(a, 4, 2.8, 80, '#ff7a3a', 'fire'); light(a, 12, 9, 46, '#ffd070', 'candle'); },
    passage(a) { prop(a, 'crate', 1, 2); prop(a, 'crate', 2, 2); prop(a, 'barrel', 14, 10); prop(a, 'sacks', 13, 2); },
  };

  /* =====================================================================
     Chapter 1: the East Wing. Twelve rooms on a 4 x 3 grid joined by doors.
     After the locket, the Architect bricks up two doorways and opens two new ones,
     and takes one memento back into a far room.
     ===================================================================== */
  const POOL = [{ name: 'Library', floor: 'wood', wall: 'panel', deco: 'library' }, { name: 'Portrait Gallery', floor: 'carpetRed', wall: 'wallpaperGreen', deco: 'gallery' },
    { name: 'Music Room', floor: 'parquet', wall: 'velvet', deco: 'music' }, { name: 'Morning Room', floor: 'wood', wall: 'wallpaperWarm', deco: 'morning' },
    { name: 'Dining Room', floor: 'parquet', wall: 'panel', deco: 'dining' }, { name: 'Parlour', floor: 'carpetBlue', wall: 'wallpaperGreen', deco: 'parlour' },
    { name: 'Boot Room', floor: 'stone', wall: 'brick', deco: 'boot' }, { name: 'Pantry', floor: 'tile', wall: 'brick', deco: 'pantry' }, { name: 'North Hall', floor: 'wood', wall: 'wallpaperWarm', deco: 'hall' }];
  function eastWing(seed, opts) {
    const r = rng32(seed * 7 + 1), GW = 4, GH = 3, FOY = [1, 2], CK = c => K(c[0], c[1]);
    const cells = []; for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) cells.push([x, y]);
    const ek = (a, b) => { const [p, q] = [a, b].sort((u, v) => (u[1] - v[1]) || (u[0] - v[0])); return CK(p) + '|' + CK(q); };
    const nb = c => N4.map(([dx, dy]) => [c[0] + dx, c[1] + dy]).filter(([x, y]) => x >= 0 && y >= 0 && x < GW && y < GH);
    const all = []; cells.forEach(c => nb(c).forEach(n => { const k = ek(c, n); if (!all.includes(k)) all.push(k); }));
    const parse = k => k.split('|').map(s => s.split(',').map(Number));
    function bfs(set, from, cut) {
      const d = new Map([[CK(from), 0]]), prev = new Map(), q = [from];
      while (q.length) { const c = q.shift(); for (const n of nb(c)) { const k = ek(c, n); if (!set.has(k) || k === cut || d.has(CK(n))) continue; d.set(CK(n), d.get(CK(c)) + 1); prev.set(CK(n), c); q.push(n); } }
      return { d, prev };
    }
    const pathEdges = (set, a, b) => { const { prev } = bfs(set, a); const out = []; let c = b; while (CK(c) !== CK(a)) { const p = prev.get(CK(c)); if (!p) return null; out.push(ek(p, c)); c = p; } return out.reverse(); };
    let P = null;
    for (let tries = 0; tries < 3000 && !P; tries++) {
      const open = new Set(), seen = new Set([CK(FOY)]), st = [FOY];
      while (st.length) { const c = st[st.length - 1], o = shuffle(r, nb(c)).filter(n => !seen.has(CK(n))); if (!o.length) { st.pop(); continue; } seen.add(CK(o[0])); open.add(ek(c, o[0])); st.push(o[0]); }
      shuffle(r, all.filter(k => !open.has(k))).slice(0, 2).forEach(k => open.add(k));
      const bridges = [...open].filter(k => bfs(open, FOY, k).d.size < 12);
      outer:
      for (const eA of shuffle(r, bridges)) {
        const z0 = bfs(open, FOY, eA).d, far = cells.filter(c => !z0.has(CK(c)));
        if (far.length < 5 || far.length > 7 || z0.size < 4) continue;
        for (const eB of shuffle(r, bridges)) {
          if (eB === eA) continue; const [p, q] = parse(eB); if (z0.has(CK(p)) || z0.has(CK(q))) continue;
          const z01 = bfs(open, FOY, eB).d, z2 = far.filter(c => !z01.has(CK(c))), z1 = far.filter(c => z01.has(CK(c)));
          if (z2.length < 2 || z2.length > 3 || z1.length < 3) continue;
          const entryB = z01.has(CK(p)) ? q : p;
          const pass = shuffle(r, z2).map(c => ({ c, n: shuffle(r, nb(c)).find(n => z0.has(CK(n)) && !open.has(ek(c, n))) })).find(o => o.n);
          if (!pass) continue;
          const z2d = bfs(new Set([...open]), entryB).d;
          const study = z2.filter(c => CK(c) !== CK(pass.c)).sort((a, b) => (z2d.get(CK(b)) || 0) - (z2d.get(CK(a)) || 0))[0];
          const eE = ek(pass.c, pass.n), G1 = new Set([...open, eE]);
          const route = pathEdges(G1, pass.c, FOY); if (!route) continue;
          const d1 = bfs(G1, FOY).d;
          for (let k = 0; k < 60; k++) {
            const sealable = shuffle(r, route.filter(e => e !== eA && e !== eB));
            if (!sealable.length) break;
            const seal = sealable.slice(0, 2);
            if (seal.length < 2) { const extra = shuffle(r, [...G1].filter(e => e !== eA && e !== eB && !seal.includes(e) && parse(e).every(c => z0.has(CK(c))))); if (extra[0]) seal.push(extra[0]); }
            const opens = shuffle(r, all.filter(e => !G1.has(e))).slice(0, 2);
            if (opens.length < 2) break;
            const G2 = new Set([...G1].filter(e => !seal.includes(e)).concat(opens));
            const d2 = bfs(G2, FOY).d; if (d2.size < 12) continue;
            const dp1 = bfs(G1, pass.c).d.get(CK(FOY)), dp2 = bfs(G2, pass.c).d.get(CK(FOY));
            if (dp2 < dp1) continue;
            // the errand room: a place whose old route crosses a bricked-up doorway
            const cand = z0.size && cells.filter(c => CK(c) !== CK(FOY) && CK(c) !== CK(pass.c) && CK(c) !== CK(study) && !z2.some(z => CK(z) === CK(c)))
              .filter(c => { const pe = pathEdges(G1, FOY, c); return pe && (pe.some(e => seal.includes(e)) || d2.get(CK(c)) !== d1.get(CK(c))); })
              .filter(c => (d2.get(CK(c)) || 0) >= 2);
            if (!cand.length) continue;
            const errC = shuffle(r, cand).sort((a, b) => d2.get(CK(b)) - d2.get(CK(a)))[0];
            P = { open, eA, eB, eE, z0: cells.filter(c => z0.has(CK(c))), z1, z2, pass: pass.c, study, seal, opens, errC };
            break outer;
          }
        }
      }
    }
    if (!P) throw new Error('east wing generation failed');

    // name the rooms
    const names = {}; names[CK(FOY)] = { name: 'Foyer', floor: 'marble', wall: 'wallpaperWarm', deco: 'foyer' };
    names[CK(P.study)] = { name: 'Study', floor: 'wood', wall: 'wallpaperRed', deco: 'study' };
    names[CK(P.pass)] = { name: "Servants' Passage", floor: 'stone', wall: 'stone', deco: 'passage', dark: true };
    const pool = shuffle(r, POOL); cells.forEach(c => { if (!names[CK(c)]) names[CK(c)] = pool.pop(); });
    const rid = c => 'r' + c[0] + c[1];
    const areas = {};
    cells.forEach(c => { const n = names[CK(c)]; const a = room(rid(c), n.name, { floor: n.floor, wall: n.wall, dark: !!n.dark, amb: n.dark ? .97 : .38, gx: c[0], gy: c[1] }); DECOR[n.deco](a, r); areas[a.id] = a; });
    // exits for every adjacent pair; walls where there is no door
    const LOCK = {
      [P.eA]: { state: 'locked', needs: 'medallion', locked: ['A heavy oak door. Set into the lock is a hollow shaped like a lion\'s head.'], open: ['The lion medallion fits the hollow. Something heavy turns inside the door.'] },
      [P.eB]: { state: 'locked', needs: 'brass', locked: ['Locked. A small brass keyhole, worn bright from use.'], open: ['The brass key turns.'] },
    };
    all.forEach(k => {
      const [a, b] = parse(k), horiz = a[1] === b[1];
      const A = areas[rid(a)], B = areas[rid(b)];
      const base = P.open.has(k) ? (LOCK[k] || { state: 'open' }) : k === P.eE ? { state: 'bolt' } : { state: 'sealed' };
      const ea = exit(A, horiz ? 'E' : 'S', A.id + (horiz ? ':E' : ':S'), Object.assign({ edge: k, plan: base.state === 'sealed' ? 'wall' : 'door' }, base));
      const eb = exit(B, horiz ? 'W' : 'N', B.id + (horiz ? ':W' : ':N'), Object.assign({ edge: k, plan: base.state === 'sealed' ? 'wall' : 'door' }, base));
      if (k === P.eE) { const fromPass = CK(a) === CK(P.pass); (fromPass ? ea : eb).state = 'bolt'; (fromPass ? eb : ea).state = 'bolted';
        (fromPass ? eb : ea).locked = ['It won\'t move. Bolted from the other side.']; (fromPass ? ea : eb).open = ['You slide the bolt back. The door swings into the house.']; }
      link(ea, eb);
    });
    // items
    const inZone = z => shuffle(r, z.filter(c => CK(c) !== CK(FOY)));
    const putItem = (c, it, opt) => { const a = areas[rid(c)], s = spots(a, r, Object.assign({ noCross: true }, opt))[0] || spots(a, r)[0]; a.items.push(Object.assign({ x: s[0], y: s[1] }, it)); return a.id; };
    const z0 = inZone(P.z0), z1 = shuffle(r, P.z1);
    const medRoom = putItem(z0[0], { id: 'medallion', kind: 'medallion', name: 'Lion Medallion', lines: ['A heavy gold medallion: a lion, mouth open.', 'It matches a hollow you may have seen on a door.'] });
    putItem(z0[1] || z0[0], { id: 'glove', kind: 'glove', name: "Clara's glove", memento: true, lines: ["Clara's glove. Kid leather, the left hand.", 'The fingers still hold a shape, as if it was taken off a moment ago.'] });
    putItem(z0[z0.length - 1], { id: 'herb1', kind: 'herb', name: 'Green herb', heal: 2, lines: ['A bitter green herb. You chew it, and the pain eases.'] });
    putItem(z1[0], { id: 'music', kind: 'musicbox', name: 'Music box', memento: true, lines: ['A music box. It plays four bars of a waltz and stops on the same note every time.', 'Inside the lid: "For C., so the tune stays put."'] });
    const brassRoom = putItem(z1[1], { id: 'brass', kind: 'key', name: 'Brass key', lines: ['A brass key on a cardboard tag.', 'In Locke\'s hand: STUDY. Underneath, crossed out: "Don\'t let me in."'] });
    putItem(z1[2] || z1[0], { id: 'herb2', kind: 'herb', name: 'Green herb', heal: 2, lines: ['A bitter green herb. You chew it, and the pain eases.'] });
    const st = areas[rid(P.study)];
    st.items.push({ id: 'locket', kind: 'locket', x: 12, y: 8, name: 'Locket', memento: true, lines: ['A locket with a curl of dark hair under glass.', 'The portrait inside has been scratched out, carefully, by someone who regretted it.'] });
    st.items.push({ id: 'journal', kind: 'journal', x: 11, y: 8, name: "Locke's journal", read: true, lines: ['"Oct. 3. The east wing moved again in the night. I found the music box in the library, though I am certain I left it by the window."', '"I have begun building below the house. A palace, down in the cellar, where every room stays where I put it."', '"Where she stays where I put her. No one will rearrange it. Not even me."'] });
    // enemies
    const ghoulAt = (c, id, o) => { const a = areas[rid(c)], s = spots(a, r, { noCross: false })[0]; a.enemies.push(Object.assign({ id, type: 'ghoul', x: s[0], y: s[1], state: 'wander', hp: 3, speed: 1 }, o || {})); };
    if (z0.length > 1) ghoulAt(z0[z0.length - 1], 'g0');
    ghoulAt(z1[0], 'g1'); if (z1[2]) ghoulAt(z1[2], 'g2');
    areas[rid(P.pass)].enemies.push({ id: 'corr', type: 'ghoul', x: 3, y: 9, state: 'dormant', hp: 3, speed: 1.25 });
    // standing figures in six rooms
    const figRooms = shuffle(r, cells.filter(c => CK(c) !== CK(FOY) && CK(c) !== CK(P.pass))).slice(0, 6);
    figRooms.forEach((c, i) => placeFigure(areas[rid(c)], r, { id: 'fig' + i, type: r() < .5 ? 'statue' : 'sleeper', look: 'sentinel', contrast: contrastOf(r, opts) }, { wallside: false }));
    // the trapdoor under the foyer rug, revealed later
    areas[rid(FOY)].props.push({ type: 'trapdoor', id: 'trapdoor', x: 7, y: 6, fw: 2, fh: 1, block: false, hidden: true, interact: true, label: 'Examine the trapdoor' });
    // where the errand memento will turn up
    const errA = areas[rid(P.errC)], errSpot = spots(errA, r, { noCross: true })[0] || spots(errA, r)[0];
    const errandItem = pick(r, ['glove', 'music', 'locket']);
    const plan = { type: 'rooms', GW, GH, rooms: cells.map(c => ({ x: c[0], y: c[1], id: rid(c), name: areas[rid(c)].name })), title: 'Locke Hall, East Wing', note: 'Every doorway is drawn in Locke\'s hand.' };
    const change = { seal: P.seal, opens: P.opens };
    return {
      id: 'east', index: 0, title: 'The East Wing', sub: 'Locke Hall', seed, areas, start: { area: rid(FOY), x: 7.5, y: 8, face: 'up' }, safe: [rid(FOY)], plan,
      intro: ['The foyer of Locke Hall. The chandelier is lit, and the candles are fresh.', 'Someone has been here tonight.', 'The plan on the lectern by the door is the only map of the house.'],
      layout: { open: [...P.open], eA: P.eA, eB: P.eB, eE: P.eE, seal: P.seal, opens: P.opens, z0: P.z0, z1: P.z1, z2: P.z2, errand: rid(P.errC), errandItem },
      script(api) {
        const S = {}, need = ['glove', 'music', 'locket'];
        const exitsOf = k => Object.values(areas).flatMap(a => a.exits).filter(e => e.edge === k);
        return {
          onStart() { api.goal({ area: medRoom }); },
          onEnter(a) {
            if (a.id === rid(P.pass) && !S.dark && need.every(k => api.has(k))) {
              S.dark = true; api.event('dark'); api.lantern16(false);
              // the Architect works while you can't see
              change.seal.forEach(k => exitsOf(k).forEach(e => api.setExit(e.id, 'sealed')));
              change.opens.forEach(k => exitsOf(k).forEach(e => api.setExit(e.id, 'open')));
              api.event('architect', { seal: change.seal, opens: change.opens });
              api.say(['Your lantern gutters...', '...and goes out. Somewhere ahead in the dark, something shifts its weight.'], '', () => setTimeout(() => api.wake('corr'), 2500));
            }
            if (a.id === rid(FOY) && S.dark && !S.back) {
              S.back = true; api.lantern16(true); api.event('architect-return');
              const had = api.has(errandItem); if (had) api.drop(errandItem);
              api.sfx('thud', .8); setTimeout(() => api.sfx('thud', .85), 550); setTimeout(() => api.sfx('thud', .9), 1100);
              api.showProp('trapdoor');
              api.placeItem(errA.id, { id: errandItem + '-lost', kind: errandItem === 'music' ? 'musicbox' : errandItem, x: errSpot[0], y: errSpot[1], name: api.itemName(errandItem), memento: true, replaces: errandItem, lines: ['There it is, set down neatly, as if someone wanted you to find it.'] });
              api.spawn(errA.id, { id: 'gal', type: 'ghoul', x: errSpot[0] < 8 ? 12 : 3, y: 8, state: 'wander', hp: 4, speed: 1.1 });
              api.say(['Your lantern flickers back to life.', 'Overhead, heavy footsteps cross the floor. They are not Locke\'s.', 'The rug in the middle of the foyer has been pulled aside. Beneath it is a trapdoor with three hollows.',
                had ? `Your pocket is lighter. ${api.itemName(errandItem)} is gone.` : 'Something else in the house is different, too.'], '', () => api.leg('errand', { area: errA.id, tiles: [[errSpot[0], errSpot[1]]] }));
            }
          },
          onTake(it) {
            if (it.id === 'medallion') api.goal({ exit: exitsOf(P.eA)[0].id });
            if (it.id === 'brass') api.goal({ exit: exitsOf(P.eB)[0].id });
            if (it.id === 'locket') api.goal({ area: rid(P.pass) });
            if (it.replaces) api.leg('return', { area: rid(FOY), tiles: [[7, 6], [8, 6]] });
          },
          onDoor(e) { if (e.edge === P.eA) api.goal({ area: brassRoom }); if (e.edge === P.eB) api.goal({ area: st.id }); },
          onProp(p) {
            if (p.id !== 'trapdoor') return false;
            const miss = need.filter(k => !api.has(k));
            if (miss.length) { api.say(['Three hollows are carved into the trapdoor: a glove, a music box, a locket.', miss.length === 3 ? 'They are all empty.' : `${miss.length === 1 ? 'One hollow is' : 'Two hollows are'} still empty.`]); return true; }
            api.event('chapter-end');
            api.say(['The glove, the music box, the locket. Each one settles into its hollow.', 'The trapdoor swings down onto a narrow stair. Cold air rises from below, smelling of wet stone and roses.'], '', () => api.endChapter());
            return true;
          },
        };
      },
    };
  }

  /* =====================================================================
     Chapter 2: the Conservatory. A hedge maze under glass, regrown each session,
     an open lawn in the middle for the lantern, a boiler, and an office.
     ===================================================================== */
  function conservatory(seed, opts) {
    const r = rng32(seed * 13 + 2), CI = 15, CJ = 10, W = CI * 3 + 1, H = CJ * 3 + 1;
    const cx = i => 1 + 3 * i, cy = j => 1 + 3 * j, CK = (i, j) => i + ',' + j;
    const g = makeArea('maze', 'Greenhouse', W, H, { fillCh: 'H', floor: 'gravel', wall: 'hedgeWall', scroll: true, amb: .5, tint: '#0a1630', hedge: true });
    const LAWN = [5, 2, 10, 7];
    const inLawn = (i, j) => i >= LAWN[0] && i <= LAWN[2] && j >= LAWN[1] && j <= LAWN[3];
    const between = (i, j, a, b) => a === i + 1 ? [[cx(i) + 2, cy(j)], [cx(i) + 2, cy(j) + 1]] : [[cx(i), cy(j) + 2], [cx(i) + 1, cy(j) + 2]];
    const wallT = (i, j, a, b) => (a < i || b < j) ? between(a, b, i, j) : between(i, j, a, b);
    const setW = (i, j, a, b, ch) => wallT(i, j, a, b).forEach(([x, y]) => g.grid[y][x] = ch);
    for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) g.grid[cy(j) + dy][cx(i) + dx] = '.';
    // perfect maze by randomized depth-first search, then braided so there are loops and real choices
    const seen = new Set(['0,0']), stack = [[0, 0]];
    while (stack.length) { const [i, j] = stack[stack.length - 1]; const nbs = shuffle(r, N4).map(([di, dj]) => [i + di, j + dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < CI && b < CJ && !seen.has(CK(a, b)));
      if (!nbs.length) { stack.pop(); continue; } const [a, b] = nbs[0]; seen.add(CK(a, b)); setW(i, j, a, b, '.'); stack.push([a, b]); }
    for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) for (const [di, dj] of [[1, 0], [0, 1]]) { const a = i + di, b = j + dj; if (a >= CI || b >= CJ) continue; if (wallT(i, j, a, b).every(([x, y]) => g.grid[y][x] === 'H') && r() < .14) setW(i, j, a, b, '.'); }
    for (let y = cy(LAWN[1]); y <= cy(LAWN[3]) + 1; y++) for (let x = cx(LAWN[0]); x <= cx(LAWN[2]) + 1; x++) g.grid[y][x] = '.';
    g.fgrid = g.grid.map((row, y) => row.map((_, x) => (x >= cx(LAWN[0]) && x <= cx(LAWN[2]) + 1 && y >= cy(LAWN[1]) && y <= cy(LAWN[3]) + 1) ? 'grass' : 'gravel'));
    const lx0 = cx(LAWN[0]), lx1 = cx(LAWN[2]) + 1, ly0 = cy(LAWN[1]), ly1 = cy(LAWN[3]) + 1, FX = (lx0 + lx1 + 1) / 2, FY = (ly0 + ly1 + 1) / 2;
    prop(g, 'fountain', Math.floor(FX) - 1, Math.floor(FY) - 1, { fw: 2, fh: 2, anim: true, id: 'fountain' });
    // statue niches in the corners
    const niches = { Owl: [0, 0], Stag: [CI - 1, 0], Hare: [0, CJ - 1], Swan: [CI - 1, CJ - 1] };
    Object.entries(niches).forEach(([n, [i, j]]) => { prop(g, 'statue' + n, cx(i), cy(j), { id: 'statue' + n, interact: true, label: 'Look at the statue', lines: [`A stone ${n.toLowerCase()} on a plinth, furred with moss.`] }); light(g, cx(i) + 1, cy(j) + 1, 40, '#ffb060', 'candle'); });
    const roseAt = shuffle(r, Object.keys(niches)).slice(0, 3);
    roseAt.forEach((n, k) => { const [i, j] = niches[n]; g.items.push({ id: 'rose' + k, kind: 'rose', x: cx(i) + 1, y: cy(j) + 1, name: 'Rose cutting (' + n + ')', lines: [`A cutting from the rose that climbs the ${n.toLowerCase()}. The thorns are wet.`] }); });
    // exits: the office below the south-west of the maze, the boiler room off the east side
    const officeCell = [2, CJ - 1], boilerCell = [CI - 1, 4];
    const mSouth = exit(g, 'S', 'maze:S', { tiles: [[cx(officeCell[0]), H - 1], [cx(officeCell[0]) + 1, H - 1]] });
    const mEast = exit(g, 'E', 'maze:E', { tiles: [[W - 1, cy(boilerCell[1])], [W - 1, cy(boilerCell[1]) + 1]] });
    const office = room('office', 'Gardener\'s Office', { floor: 'wood', wall: 'panel', amb: .35 });
    const oN = exit(office, 'N', 'office:N'); link(mSouth, oN);
    prop(office, 'desk', 11, 3, { fw: 2 }); prop(office, 'lectern', 3, 3, { id: 'plan', interact: true, label: 'Read the plan' }); prop(office, 'shelfJars', 11, 8, { fw: 2 }); prop(office, 'plant', 1, 9); prop(office, 'sacks', 2, 10);
    office.props.push({ type: 'hatch', id: 'hatch', x: 4, y: 8, fw: 1, fh: 1, block: false, hidden: true, interact: true, label: 'Examine the hatch' });
    light(office, 12, 3, 60, '#ffd070', 'candle');
    office.items.push({ id: 'herbC', kind: 'herb', x: 13, y: 10, name: 'Green herb', heal: 2, lines: ['A bitter green herb. You chew it, and the pain eases.'] });
    const boiler = room('boiler', 'Boiler Room', { floor: 'tile', wall: 'brick', amb: .45 });
    const bW = exit(boiler, 'W', 'boiler:W'); link(mEast, bW);
    prop(boiler, 'boiler', 7, 3, { fw: 2, fh: 2, id: 'boiler', interact: true, label: 'Turn the valve' }); prop(boiler, 'barrel', 13, 9); prop(boiler, 'crate', 1, 9); light(boiler, 8, 4, 70, '#ff7a3a', 'fire');

    // regrowth: closures just past turns on the likely way home from the lawn, plus a shortcut elsewhere
    const cellOpen = (grid, i, j, a, b) => wallT(i, j, a, b).every(([x, y]) => grid[y][x] === '.');
    const cellNb = (grid, i, j) => N4.map(([di, dj]) => [i + di, j + dj]).filter(([a, b]) => a >= 0 && b >= 0 && a < CI && b < CJ && cellOpen(grid, i, j, a, b));
    const cbfs = (grid, from) => { const d = new Map([[CK(...from), 0]]), prev = new Map(), q = [from]; while (q.length) { const c = q.shift(); for (const n of cellNb(grid, ...c)) if (!d.has(CK(...n))) { d.set(CK(...n), d.get(CK(...c)) + 1); prev.set(CK(...n), c); q.push(n); } } return { d, prev }; };
    const lawnGate = [Math.round((LAWN[0] + LAWN[2]) / 2), LAWN[3]];
    const planGrid = g.grid.map(row => row.slice());
    const routeCells = (() => { const { prev } = cbfs(planGrid, lawnGate), out = [officeCell]; let c = officeCell; while (CK(...c) !== CK(...lawnGate)) { c = prev.get(CK(...c)); if (!c) return []; out.push(c); } return out.reverse(); })();
    const work = planGrid.map(row => row.slice());
    const runBefore = i => { if (i < 2) return 99; const d = (a, b) => (b[0] - a[0]) + ',' + (b[1] - a[1]); const dir = d(routeCells[i - 1], routeCells[i]); let n = 0; for (let j = i - 1; j > 0 && d(routeCells[j - 1], routeCells[j]) === dir; j--) n++; return n; };
    const edgesOnRoute = routeCells.slice(1).map((c, k) => ({ a: routeCells[k], b: c, i: k + 1 })).filter(o => !inLawn(...o.a) || !inLawn(...o.b));
    const ranked = shuffle(r, edgesOnRoute).sort((p, q) => runBefore(p.i) - runBefore(q.i));
    const close = [];
    const allConnected = grid => { const d = cbfs(grid, officeCell).d; return d.size === CI * CJ; };
    for (const o of ranked) {
      if (close.length >= 2) break;
      if (inLawn(...o.a) && inLawn(...o.b)) continue;
      const t = work.map(row => row.slice()); setWOn(t, o.a, o.b, 'H');
      if (allConnected(t)) { setWOn(work, o.a, o.b, 'H'); close.push(o); }
    }
    function setWOn(grid, a, b, ch) { wallT(a[0], a[1], b[0], b[1]).forEach(([x, y]) => grid[y][x] = ch); }
    const base = cbfs(work, lawnGate).d.get(CK(...officeCell));
    let shortcut = null, best = 0; const extraCands = [];
    for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) for (const [di, dj] of [[1, 0], [0, 1]]) {
      const a = i + di, b = j + dj; if (a >= CI || b >= CJ || inLawn(i, j) || inLawn(a, b)) continue;
      if (cellOpen(work, i, j, a, b) || close.some(o => (CK(...o.a) === CK(i, j) && CK(...o.b) === CK(a, b)) || (CK(...o.b) === CK(i, j) && CK(...o.a) === CK(a, b)))) continue;
      const t = work.map(row => row.slice()); setWOn(t, [i, j], [a, b], '.');
      const dd = cbfs(t, lawnGate).d.get(CK(...officeCell)), gain = base - dd;
      if (gain > best) { best = gain; shortcut = [[i, j], [a, b]]; }
      extraCands.push([[i, j], [a, b]]);
    }
    const extraOpen = shuffle(r, extraCands.filter(e => !shortcut || CK(...e[0]) !== CK(...shortcut[0]) || CK(...e[1]) !== CK(...shortcut[1])))[0];
    const regrow = { close: close.map(o => wallT(o.a[0], o.a[1], o.b[0], o.b[1])), open: [shortcut, extraOpen].filter(Boolean).map(([a, b]) => wallT(a[0], a[1], b[0], b[1])), shortcutGain: best };

    // gardeners and scarecrows
    const farCells = []; for (let j = 0; j < CJ; j++) for (let i = 0; i < CI; i++) if (!inLawn(i, j) && Math.abs(i - officeCell[0]) + Math.abs(j - officeCell[1]) > 4 && !Object.values(niches).some(n => n[0] === i && n[1] === j)) farCells.push([i, j]);
    const fc = shuffle(r, farCells);
    for (let k = 0; k < 2; k++) { const [i, j] = fc[k], route = shuffle(r, fc.slice(2 + k * 3, 5 + k * 3)).map(([a, b]) => [cx(a), cy(b)]); g.enemies.push({ id: 'gard' + k, type: 'gardener', x: cx(i), y: cy(j), state: 'patrol', patrol: [[cx(i), cy(j)]].concat(route), hp: 3, speed: .8 }); }
    const used = new Set(fc.slice(0, 2).map(c => CK(...c)));
    let nf = 0; for (const [i, j] of shuffle(r, farCells.concat(fc.slice(0, 0)))) {
      if (nf >= 7 || used.has(CK(i, j)) || CK(i, j) === CK(...lawnGate) || CK(i, j) === CK(...boilerCell)) continue;
      const x = cx(i) + (r() < .5 ? 0 : 1), y = cy(j) + (r() < .5 ? 0 : 1);
      g.figures.push({ id: 'crow' + nf, type: r() < .5 ? 'statue' : 'sleeper', look: 'scarecrow', x, y, contrast: contrastOf(r, opts) }); used.add(CK(i, j)); nf++;
    }
    [[lx0, ly0], [lx1, ly0], [lx0, ly1], [lx1, ly1]].forEach(([x, y]) => light(g, x + .5, y + .5, 46, '#ffc070', 'candle'));
    const areas = { maze: g, office, boiler };
    const plan = { type: 'tiles', area: 'maze', grid: planGrid, title: 'The Conservatory, as planted', note: 'The hedges were planted to this plan. They grow fast.', labels: [['Lawn', FX, FY + 2], ['Office', cx(officeCell[0]) + 1, H - 1.2], ['Boiler', W - 2.5, cy(boilerCell[1]) + 1], ...Object.entries(niches).map(([n, [i, j]]) => [n, cx(i) + 1, cy(j) + 2.8])] };
    return {
      id: 'conservatory', index: 1, title: 'The Conservatory', sub: 'Locke Hall', seed, areas, start: { area: 'office', x: 7.5, y: 3.2, face: 'down' }, safe: ['office'], plan,
      maze: { CI, CJ, pitch: 3, ox: 1, oy: 1, lawn: LAWN, area: 'maze', planGrid }, regrow,
      intro: ['The trapdoor stair comes up through the floor of a gardener\'s office.', 'Beyond the glass, the conservatory has grown into a maze of black hedges.', 'Locke\'s note is pinned to the plan: "Three cuttings for the cellar. Then the boiler. Mind the scarecrows."'],
      script(api) {
        const S = { roses: 0, trials: 0 };
        const OFFICE = { area: 'office', tiles: [[7, 2], [8, 2], [7, 3], [8, 3]] };
        // lantern paths stay well inside the lawn and away from the fountain
        const inside = (x, y) => x > lx0 + 2.5 && x < lx1 + 1 - 2.5 && y > ly0 + 2.5 && y < ly1 + 1 - 2.5 && Math.hypot(x - FX, y - FY) > 3;
        function lanternPath() {
          for (let k = 0; k < 800; k++) {
            let x = lx0 + 2 + api.rng() * (lx1 - lx0 - 3), y = ly0 + 2 + api.rng() * (ly1 - ly0 - 3);
            if (!inside(x, y)) continue;
            const legs = api.rng() < .5 ? 2 : 3; let h = Math.floor(api.rng() * 8) * Math.PI / 4; const pts = [[x, y]], lens = [], turns = []; let good = true;
            for (let i = 0; i < legs && good; i++) {
              if (i > 0) { const t = [45, 90, 135][Math.floor(api.rng() * 3)] * (api.rng() < .5 ? -1 : 1); h += t * Math.PI / 180; turns.push(t); }
              const L = 2.5 + api.rng() * 4.5; lens.push(+L.toFixed(2));
              for (let q = 1; q <= 12; q++) if (!inside(x + Math.sin(h) * L * q / 12, y - Math.cos(h) * L * q / 12)) { good = false; break; }
              x += Math.sin(h) * L; y -= Math.cos(h) * L; pts.push([x, y]);
            }
            if (good) return { pts, lens, turns, legs, length: +lens.reduce((a, b) => a + b, 0).toFixed(2) };
          }
          return null;
        }
        function nextTrial() {
          S.trials++;
          if (S.trials > 5) return finishBlackout();
          const cands = []; for (let k = 0; k < 10; k++) { const c = lanternPath(); if (c) { const a = c.pts[0], b = c.pts[c.pts.length - 1]; c.homeDist = Math.hypot(b[0] - a[0], b[1] - a[1]); cands.push(c); } }
          if (!cands.length) return finishBlackout();
          const ch = api.ado.chooseLantern(cands, S.trials === 1), d = ch.pick;
          api.event('ado-lantern', { anchor: ch.anchor, eig: ch.eig, length: d.length, homeDist: +d.homeDist.toFixed(2) });
          api.lantern(d, res => {
            api.ado.lanternUpdate(d, res);
            api.say([res.err < 1.5 ? 'The match flares. You are almost exactly where the lantern first waited.' : res.err < 3.5 ? 'The match flares. Close, but not quite.' : 'The match flares on bare lawn. The lantern waited somewhere else entirely.',
              S.trials < 5 ? 'Out in the steam, the little light kindles again, waiting.' : 'The lantern does not come back.'], '', nextTrial);
          });
        }
        function finishBlackout() {
          api.holdAll(false); api.blackout(false);
          api.say(['The steam thins. Your lantern sputters back to life.', 'The hedges look different. Fresh growth, thick and dark, where there was none an hour ago.', 'Get back to the office.'], '', () => api.leg('transition', OFFICE));
        }
        const keyStatue = pick(api.rng, roseAt);
        return {
          onStart() { api.goal({ area: 'maze', tiles: roseAt.map(n => [cx(niches[n][0]) + 1, cy(niches[n][1]) + 1]) }); },
          onTake(it) {
            if (it.kind === 'rose') { S.roses++; if (S.roses === 3) { api.goal({ area: 'boiler' }); api.say(['Three cuttings. Locke\'s note said the boiler next.']); } }
            if (it.id === 'hatchkey') api.leg('return', OFFICE);
          },
          onLegEnd(name) {
            if (name !== 'transition') return;
            const [i, j] = niches[keyStatue];
            api.placeItem('maze', { id: 'hatchkey', kind: 'hatchkey', x: cx(i) + 1, y: cy(j) + 1, name: 'Hatch key', lines: ['A heavy iron key, warm from the steam.'] });
            api.showProp('hatch');
            api.say(['The cellar hatch in the corner is chained shut.', `A tag on the chain, in Locke's hand: "Key left with the ${keyStatue}. Where the cuttings were."`], '', () => api.leg('reward', { area: 'maze', tiles: [[cx(i) + 1, cy(j) + 1]] }));
          },
          onProp(p) {
            if (p.id === 'boiler') {
              if (S.roses < 3) { api.say(['A brass valve wheel, stiff with rust.', 'Locke\'s note: the cuttings first.']); return true; }
              if (S.valve) return true;
              S.valve = true; api.event('valve'); api.sfx('thud', 1);
              api.say(['You heave the wheel round. The pipes shudder, then scream.', 'Steam floods out across the glasshouse. Somewhere a pane shatters.', 'The lawn. Whatever this is, it is happening on the lawn.'], '', () => api.goal({ area: 'maze', tiles: [[Math.floor(FX), Math.floor(FY) + 2]] }));
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
          onTile(area, x, y) {
            if (area.id === 'maze' && S.valve && !S.blackout && Math.hypot(x + .5 - FX, y + .5 - FY) < 3.2) {
              S.blackout = true; api.event('blackout');
              api.blackout(true); api.holdAll(true); api.goal(null);
              regrow.close.forEach(ts => ts.forEach(([a, b]) => api.setTile('maze', a, b, 'H')));
              regrow.open.forEach(ts => ts.forEach(([a, b]) => api.setTile('maze', a, b, '.')));
              api.event('regrow', regrow);
              api.say(['The steam rolls over the lawn and your lantern gutters out. You can\'t see your own hand.', 'A small light bobs up out of the steam. A lantern, carried by no one you can see. It waits for you.',
                'Follow it. When it goes out, walk back to where it first waited, and strike a match.'], '', nextTrial);
            }
          },
        };
      },
    };
  }

  /* =====================================================================
     Chapter 3: the Palace. A rotunda with six veils. Which veil opens onto which
     memory room is reshuffled by the Architect whenever a memory moves.
     ===================================================================== */
  function palace(seed, opts) {
    const r = rng32(seed * 31 + 3);
    const RW = 30, RH = 20;
    const rot = makeArea('rotunda', 'Rotunda', RW, RH, { floor: 'marble', wall: 'marbleWall', amb: .4, checker: true });
    for (let y = 2; y < RH - 1; y++) for (let x = 1; x < RW - 1; x++) rot.grid[y][x] = '.';
    // veils numbered clockwise: north wall left to right, then south wall right to left
    const VX = [6, 14, 22];
    const rotVeils = [0, 1, 2].map(i => exit(rot, 'N', 'rot' + i, { veil: true, tiles: [[VX[i], 0], [VX[i] + 1, 0], [VX[i], 1], [VX[i] + 1, 1]] }))
      .concat([2, 1, 0].map((i, k) => exit(rot, 'S', 'rot' + (3 + k), { veil: true, tiles: [[VX[i], RH - 1], [VX[i] + 1, RH - 1]] })));
    const rW = exit(rot, 'W', 'rot:W', { tiles: [[0, 9], [0, 10]] });
    const rE = exit(rot, 'E', 'rot:E', { tiles: [[RW - 1, 9], [RW - 1, 10]], state: 'locked', needs: 'flag:locke', locked: ['The stair door is barred from this side by a beam no single person could lift.'], open: ['Together you lift the beam. Cold air pours down the stair.'] });
    prop(rot, 'clara', 14, 9, { id: 'clara', interact: true, label: 'Look at the statue', lines: ['A marble Clara, life size. Her face is unfinished.'] }); prop(rot, 'urn', 15, 9);
    [[3, 3], [26, 3], [3, 17], [26, 17]].forEach(([x, y]) => { prop(rot, 'candelabra', x, y); light(rot, x + .5, y + .3, 54, '#ffc27a', 'candle'); });
    light(rot, 15, 10, 120, '#ffc890', 'candle');
    const study = room('study', "Locke's Study", { floor: 'carpetRed', wall: 'wallpaperGreen', amb: .3 });
    const sE = exit(study, 'E', 'study:E'); link(sE, rW);
    prop(study, 'desk', 10, 3, { fw: 2 }); prop(study, 'bookshelf', 1, 2, { fw: 2 }); prop(study, 'armchair', 12, 9); prop(study, 'plant', 1, 10); wallp(study, 'portraitClara', 5); light(study, 11, 3, 60, '#ffd070', 'candle');
    prop(study, 'lectern', 4, 4, { id: 'plan', interact: true, label: 'Read the plan' });
    prop(study, 'locke', 5, 5, { id: 'locke', interact: true, label: 'Speak to the man', npc: true });
    study.items.push({ id: 'herbP', kind: 'herb', x: 13, y: 10, name: 'Green herb', heal: 2, lines: ['A bitter green herb. You chew it, and the pain eases.'] });
    const landing = room('landing', 'Stair Landing', { floor: 'stone', wall: 'stone', amb: .5 });
    const lW = exit(landing, 'W', 'landing:W'); link(lW, rE);
    prop(landing, 'stairs', 6, 2, { fw: 2, fh: 2, decal: true, block: false });
    const roomDefs = [
      { name: 'Ballroom', floor: 'parquet', wall: 'ballroom', home: 'dance', deco: a => { prop(a, 'piano', 2, 3, { fw: 2, fh: 2 }); prop(a, 'candelabra', 13, 2); light(a, 13.5, 2.3, 60, '#ffd9a0', 'candle'); } },
      { name: 'Chapel', floor: 'stone', wall: 'chapel', home: 'ring', deco: a => { prop(a, 'pew', 2, 7, { fw: 2 }); prop(a, 'pew', 11, 7, { fw: 2 }); prop(a, 'pew', 2, 9, { fw: 2 }); prop(a, 'pew', 11, 9, { fw: 2 }); light(a, 8, 2, 70, '#b0c4ff'); } },
      { name: 'Garden Room', floor: 'grass', wall: 'mural', home: 'lily', deco: a => { prop(a, 'fountain', 2, 2, { fw: 2, fh: 2, anim: true }); prop(a, 'plant', 13, 2); prop(a, 'plant', 13, 9); light(a, 8, 5, 80, '#c8f0b0'); } },
      { name: 'Music Room', floor: 'parquet', wall: 'velvet', home: 'score', deco: a => { prop(a, 'harp', 2, 2); prop(a, 'chair', 3, 3); prop(a, 'chair', 12, 3); light(a, 8, 5, 70, '#ffc0a0', 'candle'); } },
      { name: 'Nursery', floor: 'carpetBlue', wall: 'wallpaperNursery', home: 'rattle', deco: a => { prop(a, 'crib', 11, 2, { fw: 2 }); prop(a, 'armchair', 2, 3); light(a, 8, 5, 70, '#ffe0f0'); } },
      { name: 'Letter Room', floor: 'wood', wall: 'letters', home: 'letter', deco: a => { prop(a, 'desk', 2, 2, { fw: 2 }); prop(a, 'bookshelf', 12, 2, { fw: 2 }); light(a, 3, 2.5, 60, '#ffd090', 'candle'); } }];
    const memories = [
      { id: 'dance', name: 'A dance card', home: 'Ballroom', lines: ['A dance card. Every line is filled with the same name: Clara.'] },
      { id: 'ring', name: 'A wedding ring', home: 'Chapel', lines: ['A thin gold ring, worn smooth on the inside.'] },
      { id: 'lily', name: 'A pressed lily', home: 'Garden Room', lines: ['A lily pressed flat between two sheets of glass. It still smells faintly sweet.'] },
      { id: 'score', name: 'Sheet music', home: 'Music Room', lines: ['A waltz in Locke\'s hand. The last four bars are scratched out and rewritten again and again.'] },
      { id: 'rattle', name: 'A silver rattle', home: 'Nursery', lines: ['A silver rattle, never dented. It was never used.'] },
      { id: 'letter', name: 'A letter', home: 'Letter Room', lines: ['A letter in Clara\'s hand. The ink has run where it was cried on.'] }];
    const rooms = roomDefs.map((d, i) => {
      const a = room('mem' + i, d.name, { floor: d.floor, wall: d.wall, amb: .38 });
      exit(a, 'S', 'room' + i, { veil: true });
      prop(a, 'plinth', 7, 4, { id: 'plinth-' + d.home, interact: true, label: 'Examine the plinth', home: d.home });
      d.deco(a); return a;
    });
    const perm0 = shuffle(r, [0, 1, 2, 3, 4, 5]);
    let der; do { der = shuffle(r, [0, 1, 2, 3, 4, 5]); } while (der.some((v, i) => v === i));
    memories.forEach((m, i) => { const a = rooms[der[i]], s = spots(a, r, { from: [7, 9], y0: 3 })[0]; a.items.push({ id: m.id, kind: m.id, x: s[0], y: s[1], name: m.name, memory: true, home: m.home, lines: m.lines.concat([`It belongs somewhere else. Somewhere in the ${m.home.toLowerCase()}.`]) }); });
    rooms.forEach((a, i) => placeFigure(a, r, { id: 'form' + i, type: r() < .5 ? 'statue' : 'sleeper', look: 'sentinel', contrast: contrastOf(r, opts) }, { from: [7, 9] }));
    rot.enemies.push({ id: 'guardian', type: 'guardian', x: 14, y: 4, state: 'patrol', patrol: [[3, 4], [26, 4], [26, 15], [3, 15]], speed: .55, hp: 999 });
    const areas = { rotunda: rot, study, landing }; rooms.forEach(a => areas[a.id] = a);
    const plan = { type: 'palace', title: 'The Palace, as built', note: 'The labels are in Locke\'s hand. They were true once.', labels: rotVeils.map((e, i) => roomDefs[perm0[i]].name) };
    return {
      id: 'palace', index: 2, title: 'The Palace', sub: 'Beneath Locke Hall', seed, areas, start: { area: 'study', x: 7.5, y: 8.5, face: 'up' }, safe: ['study'], plan, roomDefs, perm0, memories,
      intro: ['A study at the bottom of the stair, warm and lamplit. A man stands with his back to you, staring at a plan.', 'He does not turn around.', 'The plan shows rooms arranged around a rotunda. Each doorway is labeled in a careful hand.'],
      script(api) {
        const S = { perm: perm0.slice(), prev: null, placed: 0, carrying: null, trip: 0, shuffles: 0, test: null, inRoom: null, enteredBy: null };
        const inv = p => { const o = []; p.forEach((room, v) => o[room] = v); return o; };
        const anchors = shuffle(api.rng, ['swap', 'rotate', 'none']);
        function pickKind() {
          const a = S.shuffles < anchors.length ? anchors[S.shuffles] : null; S.shuffles++;
          const ch = api.ado.choosePalace(['swap', 'rotate', 'none'], a);
          api.event('ado-palace', { anchor: ch.anchor, eig: ch.eig, kind: ch.kind });
          return ch.kind;
        }
        function reshuffle(cur, target, kind) {
          S.prev = S.perm.slice(); const iv = inv(S.perm);
          if (kind === 'swap') { const a = iv[cur], b = iv[target]; [S.perm[a], S.perm[b]] = [S.perm[b], S.perm[a]]; }
          else { const k = 1 + Math.floor(api.rng() * 5); S.perm = S.perm.map((_, i) => S.prev[(i + k) % 6]); }
          api.event('reshuffle', { kind, cur: roomDefs[cur].name, target: roomDefs[target].name, perm: S.perm.slice(), prev: S.prev });
          api.sfx('thud', .7);
        }
        function setTest(phase, cond, kind, target, prevPerm) { S.test = { phase, cond, kind, room: target, prev: prevPerm, armed: false, glimpse: null, enteredBy: S.enteredBy }; }
        return {
          onStart() { api.goal(null); },
          onVeil(e) {
            if (e.id.startsWith('rot')) {
              const i = +e.id.slice(3), ri = S.perm[i], room = roomDefs[ri];
              const target = S.carrying ? roomDefs.findIndex(d => d.home === S.carrying) : null;
              api.event('veil', { veil: i, room: room.name, carrying: S.carrying, correct: target === null ? null : inv(S.perm)[target], stale: target === null || !S.prev ? null : inv(S.prev)[target], plan: target === null ? null : inv(perm0)[target], trip: S.trip });
              const T_ = S.test;
              if (T_ && T_.armed) {
                const correct = inv(S.perm)[T_.room], stale = inv(T_.prev)[T_.room];
                const cls = i === correct ? 'correct' : i === stale ? 'stale' : i === T_.glimpse ? 'glimpse' : 'other';
                api.event('integrate', { phase: T_.phase, cond: T_.cond, kind: T_.kind, veil: i, correct, stale, glimpse: T_.glimpse, cls, target: roomDefs[T_.room].name });
                api.ado.palaceUpdate(T_.kind, cls);
                S.test = null;
              }
              S.enteredBy = i; S.inRoom = ri;
              return 'room' + ri;
            }
            const ri = +e.id.slice(4), vi = inv(S.perm)[ri];
            if (S.test && !S.test.armed) { S.test.armed = true; S.test.glimpse = vi; api.event('glimpse', { veil: vi, room: roomDefs[ri].name, cameIn: S.test.enteredBy }); }
            return 'rot' + vi;
          },
          canTake(it) { if (it.memory && S.carrying) { api.say(['Your hands are full. One memory at a time; they are heavier than they look.']); return false; } return true; },
          onTake(it) {
            if (!it.memory) return;
            S.carrying = it.id; S.trip++;
            const cur = S.inRoom, hi = roomDefs.findIndex(d => d.home === it.id), prevPerm = S.perm.slice();
            const kind = pickKind(); if (kind !== 'none') reshuffle(cur, hi, kind); else S.prev = S.perm.slice();
            setTest('carry', kind === 'none' ? 'RR' : 'TR', kind, hi, prevPerm);
            api.say([kind === 'none' ? 'As your fingers close on it, the palace holds its breath. Nothing moves.' : 'As your fingers close on it, the floor shivers. Somewhere, a doorway has changed its mind.']);
            api.goal({ area: 'mem' + hi });
          },
          onProp(p) {
            if (p.type === 'plinth') {
              if (S.carrying === p.home) {
                api.drop(S.carrying); api.placeOn(p, S.carrying); S.carrying = null; S.placed++; api.event('placed', { home: p.home, n: S.placed });
                if (S.placed === 3) S.blackPending = true;
                api.goal(null);
                if (S.placed < 6) {
                  const kindP = pickKind(), cond = kindP === 'none' ? 'RR' : 'TR', prevPerm = S.perm.slice();
                  const waiting = memories.filter(m => !api.isTaken(m.id) && !api.isPlaced(m.id));
                  const m = waiting[Math.floor(api.rng() * waiting.length)];
                  const pos = api.itemPos(m.id), cur = pos ? +pos.area.slice(3) : -1;
                  const choices = roomDefs.map((d, i) => i).filter(i => i !== cur && i !== S.inRoom && roomDefs[i].home !== m.id);
                  const to = choices[Math.floor(api.rng() * choices.length)];
                  const sp = api.freeSpot('mem' + to);
                  api.moveItem(m.id, 'mem' + to, sp[0], sp[1]);
                  if (kindP !== 'none') reshuffle(S.inRoom, to, kindP);
                  setTest('seek', cond, kindP, to, prevPerm);
                  api.event('revalue', { cond, item: m.id, room: roomDefs[to].name });
                  api.say(['The memory settles onto the plinth as if it had never left.', `Somewhere far off, ${m.name.toLowerCase()} falls to the floor of the ${roomDefs[to].name.toLowerCase()}. You hear it as clearly as if it were beside you.`].concat(cond === 'TR' ? ['Then stone grinds against stone. The palace has moved again.'] : ['The palace stays quiet.']));
                } else { S.test = null; api.say(['The last memory settles into place. For a moment the whole palace is perfectly still.', 'Back in the study, a chair scrapes.']); api.goal({ area: 'study' }); }
              } else if (S.carrying) api.say(['An empty plinth. A brass plate reads: ' + p.home.toUpperCase() + '.', 'What you are carrying does not belong here.']);
              else api.say(['An empty plinth. A brass plate reads: ' + p.home.toUpperCase() + '.']);
              return true;
            }
            if (p.id === 'locke') {
              if (S.placed < 6) { api.say(['Elias Locke stares at the plan, lips moving. He does not see you.', '"She was in the garden room," he whispers. "No. The chapel. They keep moving."'], 'Locke'); return true; }
              if (!S.follow) {
                S.follow = true; api.flag('locke', true); api.event('locke-follows'); api.follower('locke');
                api.say(['Locke turns. His eyes find you, slowly.', '"Every room is where it belongs," he says. "I can leave them now. Will you take me up?"', 'Out in the rotunda, the Guardian roars.'], 'Locke', () => { api.wake('guardian', 1.4); api.goal({ area: 'landing' }); });
              }
              return true;
            }
            return false;
          },
          onEnter(a) {
            if (S.blackPending && a.id === 'rotunda' && !S.follow) {
              S.blackPending = false; api.event('rotunda-blackout'); api.blackout(true); api.hold('guardian', true);
              api.say(['Overhead, chain grinds against stone. The chandelier comes down in a roar of glass and every candle in the rotunda goes out.',
                'Your lantern dies with them. Walk to the doorway back to Locke\'s study, and strike a match when you think you are standing in it.'], '',
                () => api.homing({ area: 'rotunda', x: 1.5, y: 10 }, res => {
                  api.blackout(false); api.hold('guardian', false);
                  api.say([res.err < 2.5 ? 'The match flares on the study doorway, right beside you.' : 'The match flares. The doorway is somewhere else entirely. Your lantern coughs back to life.']);
                }));
            }
            if (S.follow && a.id === 'landing' && !S.done) { S.done = true; api.event('chapter-end'); api.say(['You climb with Locke\'s hand on your shoulder. Below, the palace settles, room by room, into its places.', '"Thank you," he says. "I think I can remember her now without holding on so tightly."'], 'Locke', () => api.endChapter()); }
          },
        };
      },
    };
  }

  /* =====================================================================
     Prologue: the grounds. A short walk up the drive every session. It scores
     nothing; it lets the controls settle and measures them: a long straight
     avenue (walking speed) and crows on posts (timing a strike).
     ===================================================================== */
  function grounds(seed, opts) {
    const r = rng32(seed * 17 + 9), W = 24, H = 44;
    const a = makeArea('grounds', 'The Drive', W, H, { fillCh: '.', floor: 'grass', wall: 'facade', scroll: true, amb: .5, tint: '#0c1430', hedge: true });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (x < 2 || x > W - 3 || y > H - 2) a.grid[y][x] = 'H'; if (y < 5) a.grid[y][x] = '#'; }
    a.fgrid = a.grid.map((row, y) => row.map((_, x) => (x >= 10 && x <= 13) ? 'gravel' : 'grass'));
    prop(a, 'housedoor', 11, 4, { fw: 2, fh: 1, id: 'door', interact: true, label: 'Knock', wallDoor: true });
    [4, 7, 16, 19].forEach(x => wallp(a, 'window', x)); a.props.filter(p => p.type === 'window').forEach(p => p.y = 4);
    const posts = [[8, 9], [15, 12], [8, 16], [15, 20], [8, 24], [15, 28], [8, 31], [15, 35], [8, 38], [15, 8]];
    const crowAt = shuffle(r, posts).slice(0, 6);
    posts.forEach(([x, y]) => prop(a, 'post', x, y));
    crowAt.forEach(([x, y], i) => a.crows.push({ id: 'crow' + i, x, y }));
    [[9, 10], [14, 18], [9, 26], [14, 34], [9, 41], [14, 6]].forEach(([x, y]) => { prop(a, 'lamppost', x, y); light(a, x + .5, y - .6, 64, '#ffc070', 'candle'); });
    const treeSpots = []; for (let y = 6; y < H - 3; y += 3) for (const x of [3, 5, 18, 20]) if (r() < .6) treeSpots.push([x + (r() < .5 ? 0 : 1), y + (r() < .5 ? 0 : 1)]);
    treeSpots.forEach(([x, y]) => { if (!posts.some(p => Math.abs(p[0] - x) + Math.abs(p[1] - y) < 2)) prop(a, 'tree', x, y); });
    prop(a, 'gate', 10, H - 1, { fw: 4, decal: true, block: false, dy: -8 });
    return {
      id: 'grounds', index: -1, title: 'The Grounds', sub: 'Locke Hall', seed, areas: { grounds: a }, start: { area: 'grounds', x: 12, y: H - 3, face: 'up' }, safe: [], plan: null,
      intro: ['Your car died at the bottom of the drive. Lanterns are lit all the way up to the house.', 'Crows sit on the fence posts along the way, watching you.', 'A note is tied to the gate in Locke\'s hand: "Scatter the crows before you knock. The house will not open while they watch."'],
      script(api) {
        const S = { crows: 0 };
        return {
          onStart() { api.goal(null); },
          onCrow() { S.crows++; if (S.crows === 6) api.toast('The last crow lifts away over the roof.'); },
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
  const api = { rng32, K, N4, GENERATORS, generate: (i, seed, opts) => GENERATORS[i](seed, opts || {}), prologue: (seed, opts) => grounds(seed, opts || {}) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PALACE16_WORLD = api;
})(typeof window !== 'undefined' ? window : globalThis);
