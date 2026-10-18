/* The Palace, 16-bit: engine, telemetry and chapter flow.
   The same tests as the 3D version, re-expressed for a top-down, flip-screen house:
   route choices between rooms scored against Locke's plan and the real house, walking into
   bricked-up doorways, glimpse-then-integrate veils in the palace, triangle completion in the
   dark with the camera locked to the hero, and standing sentinels whose eye pulse is staircased. */
(function () {
  'use strict';
  const $ = s => document.querySelector(s);
  const ART = window.PALACE16_ART, W = window.PALACE16_WORLD, ADO = window.PALACE_ADO, SND = window.PALACE_AUDIO;
  const A = ART.build();
  const T = 16, VW = 256, VH = 224, HUD = 32, PH = VH - HUD;
  const K = (x, y) => x + ',' + y, N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' }, DIRV = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const now = () => performance.now();
  const R = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const median = a => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
  const pct = (a, b) => b ? Math.round(100 * a / b) + '%' : '—';
  const store = { get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
  const TOUCH = matchMedia('(pointer:coarse)').matches;

  const screen = $('#screen'), G = screen.getContext('2d'); G.imageSmoothingEnabled = false;
  const lightC = ART.cv(VW, PH), LG = lightC.getContext('2d');
  const prevC = ART.cv(VW, PH), nextC = ART.cv(VW, PH);

  /* ---------- state ---------- */
  const S = { spec: null, areas: {}, area: null, exitById: {}, items: [], running: false, paused: false, hooks: {}, log: null, session: null,
    inv: {}, invNames: {}, flags: {}, visited: {}, held: {}, holdAll: false, blackout: false, lanternOff: false, homing: null, wisp: null, leg: null, goal: null,
    trans: null, fx: [], t0: 0, texSeed: 0, changedOnce: false, closures: {}, follower: null, chapter: 0, placed: {}, lastCell: null, mapOpen: null };
  const H = { x: 0, y: 0, face: 'down', walk: 0, moving: false, atk: 0, atkCd: 0, inv: 0, hp: 6, kx: 0, ky: 0, kt: 0, stun: 0, run: false };

  /* ---------- tiles, collision, sight ---------- */
  const tileAt = (a, x, y) => (x < 0 || y < 0 || x >= a.w || y >= a.h) ? '#' : a.grid[y][x];
  const exitAt = (a, x, y) => a._exitAt[K(x, y)] || null;
  function rebuildBlk(a) {
    const s = new Set();
    a.props.forEach(p => { if (p.block && !p.wall && !p.decal && !p.hidden && !p.gone) for (let i = 0; i < p.fw; i++) for (let j = 0; j < p.fh; j++) s.add(K(p.x + i, p.y + j)); });
    a.figures.forEach(f => { if (!f.gone) s.add(K(f.x, f.y)); });
    a._blk = s;
  }
  function solidTile(a, x, y) {
    const c = tileAt(a, x, y);
    if (c === '#' || c === 'H') return true;
    if (c === 'D') { const e = exitAt(a, x, y); return !e || e.state !== 'open'; }
    return a._blk.has(K(x, y));
  }
  function boxFree(a, x, y) {
    const x0 = Math.floor((x - 5) / T), x1 = Math.floor((x + 4) / T), y0 = Math.floor((y - 5) / T), y1 = Math.floor((y + 2) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidTile(a, tx, ty)) return false;
    return true;
  }
  function opaque(a, x, y) { const c = tileAt(a, x, y); if (c === '#' || c === 'H') return true; if (c === 'D') { const e = exitAt(a, x, y); return !e || e.state !== 'open'; } return false; }
  function los(a, x0, y0, x1, y1) { const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 6); for (let i = 1; i < n; i++) { const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n; if (opaque(a, Math.floor(x / T), Math.floor(y / T))) return false; } return true; }
  const heroTile = () => [Math.floor(H.x / T), Math.floor((H.y - 1) / T)];
  const isScroll = a => a.w * T > VW || a.h * T > PH;

  /* ---------- exits ---------- */
  function arrival(e) {
    const xs = e.tiles.map(t => t[0]), ys = e.tiles.map(t => t[1]), cx = (Math.min(...xs) + Math.max(...xs) + 1) / 2 * T, cy = (Math.min(...ys) + Math.max(...ys) + 1) / 2 * T;
    if (e.side === 'N') return { x: cx, y: (Math.max(...ys) + 1) * T + 10, face: 'down' };
    if (e.side === 'S') return { x: cx, y: Math.min(...ys) * T - 3, face: 'up' };
    if (e.side === 'W') return { x: (Math.max(...xs) + 1) * T + 7, y: cy + 4, face: 'right' };
    return { x: Math.min(...xs) * T - 7, y: cy + 4, face: 'left' };
  }
  const arrivalTile = e => { const p = arrival(e); return [Math.floor(p.x / T), Math.floor((p.y - 1) / T)]; };
  function setExitState(e, state) { e.state = state; const p = S.exitById[e.to]; if (p && !(e.edge && p.edge !== e.edge)) p.state = state; }
  function bumpExit(e) {
    const t = now(); if (t - (e._bump || 0) < 1400) return; e._bump = t;
    if (e.state === 'sealed') {
      if (e.plan === 'door') { S.log.staleBumps++; logEvent('stale-bump', { exit: e.id }); }
      return;
    }
    if (e.state === 'locked') {
      const need = e.needs || '', ok = need.startsWith('flag:') ? S.flags[need.slice(5)] : S.inv[need];
      if (ok) { openDoor(e); return; }
      say(e.locked || ['Locked.']); return;
    }
    if (e.state === 'bolt') { openDoor(e); return; }
    if (e.state === 'bolted') say(e.locked || ['It won\'t move.']);
  }
  function openDoor(e) {
    setExitState(e, 'open'); const p = S.exitById[e.to]; if (p) p.state = 'open';
    sfx('unlock'); logEvent('door', { exit: e.id, edge: e.edge || null });
    if (e.open) say(e.open);
    if (S.hooks.onDoor) S.hooks.onDoor(e);
  }
  function goExit(e) {
    let toId = e.to;
    if (e.veil) toId = S.hooks.onVeil ? S.hooks.onVeil(e) : null;
    const te = S.exitById[toId]; if (!te) return;
    logExitChoice(e);
    const from = S.area, to = S.areas[te.area];
    snapshot(prevC);
    const slide = !e.veil && !te.veil && !isScroll(from) && !isScroll(to) && OPP[e.side] === te.side;
    S.trans = { kind: slide ? 'slide' : 'fade', t: 0, dur: slide ? .55 : .6, dir: e.side, te, switched: false, veil: !!e.veil };
    if (slide) { switchArea(te); renderWorld(nextC.getContext('2d')); S.trans.switched = true; }
    sfx(e.veil ? 'veil' : 'whoosh', e.veil ? 1 : .5);
  }
  function switchArea(te) {
    const a = S.areas[te.area], p = arrival(te);
    if (S.follower && S.follower.area === S.area.id) { S.follower.area = a.id; S.follower.x = p.x - DIRV[p.face][0] * 14; S.follower.y = p.y - DIRV[p.face][1] * 14; S.follower.trail = []; }
    S.area = a; H.x = p.x; H.y = p.y; H.face = p.face; H.kt = 0; S.lastCell = null;
    rebuildBlk(a); enterArea(a);
  }
  function updateTrans(dt) {
    const tr = S.trans; tr.t += dt;
    if (tr.kind === 'fade' && !tr.switched && tr.t >= tr.dur / 2) { tr.switched = true; switchArea(tr.te); }
    if (tr.t >= tr.dur) S.trans = null;
  }
  function snapshot(c) { const g = c.getContext('2d'); g.clearRect(0, 0, VW, PH); g.drawImage(screen, 0, HUD, VW, PH, 0, 0, VW, PH); }
  function enterArea(a) {
    if (!S.visited[a.id]) { S.visited[a.id] = true; }
    logEvent('enter', { area: a.id });
    showBanner(a.name);
    checkLeg();
    if (S.hooks.onEnter) S.hooks.onEnter(a);
  }

  /* ---------- input ---------- */
  const keys = {};
  let joy = { x: 0, y: 0, on: false };
  addEventListener('keydown', e => {
    if (e.repeat && !/Arrow|Key[WASD]|Shift/.test(e.code)) return;
    keys[e.code] = true;
    if (/Arrow|Space/.test(e.code)) e.preventDefault();
    onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));
  function dirInput() {
    let x = 0, y = 0;
    if (keys.ArrowLeft || keys.KeyA) x--; if (keys.ArrowRight || keys.KeyD) x++; if (keys.ArrowUp || keys.KeyW) y--; if (keys.ArrowDown || keys.KeyS) y++;
    if (joy.on) { x += joy.x; y += joy.y; }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    return [x, y, Math.min(1, m)];
  }
  function onKey(code) {
    if (code === 'KeyL' && S.running) { labToggle(); return; }
    if (code === 'KeyN') { audio(); SND.setMusic(!SND.musicOn); toast(SND.musicOn ? 'Music on' : 'Music off'); musicLabel(); return; }
    if (S.mapOpen) { if (/Escape|KeyM|KeyE|Space|Enter|KeyX|KeyK/.test(code)) closeMap(); return; }
    if (dlgOpen()) { if (/Space|Enter|KeyE|KeyJ|KeyK|KeyZ|KeyX/.test(code)) advanceDialog(); return; }
    if (!S.running || S.paused || S.trans) return;
    if (/Space|KeyJ|KeyZ/.test(code)) attack();
    else if (/KeyE|KeyK|KeyX|Enter/.test(code)) use();
    else if (code === 'KeyM') { const p = nearPlan(); if (p) openMap(); else toast('The plan is on the lectern.'); }
  }
  /* ---------- the hero ---------- */
  let lastScrape = 0, stepAcc = 0, straightDir = null, straightSince = 0;
  function tryMove(a, dx, dy, nudgeOk) {
    let blocked = false;
    if (dx) { if (boxFree(a, H.x + dx, H.y)) H.x += dx; else { blocked = true; if (nudgeOk && !dy) nudge(a, 'x', dx); } }
    if (dy) { if (boxFree(a, H.x, H.y + dy)) H.y += dy; else { blocked = true; if (nudgeOk && !dx) nudge(a, 'y', dy); } }
    return blocked;
  }
  // slide round door frames and corners, the way the old games did
  function nudge(a, axis, d) {
    for (let k = 1; k <= 7; k++) for (const s of [-1, 1]) {
      if (axis === 'y' && boxFree(a, H.x + s * k, H.y + d)) { if (boxFree(a, H.x + s, H.y)) H.x += s; return; }
      if (axis === 'x' && boxFree(a, H.x + d, H.y + s * k)) { if (boxFree(a, H.x, H.y + s)) H.y += s; return; }
    }
  }
  function updateHero(dt, t) {
    const a = S.area, m = S.log.motor;
    if (H.inv > 0) H.inv -= dt; if (H.atkCd > 0) H.atkCd -= dt; if (H.stun > 0) H.stun -= dt;
    if (H.kt > 0) { H.kt -= dt; tryMove(a, H.kx * dt, H.ky * dt, false); return; }
    if (H.atk > 0) { H.atk -= dt; H.moving = false; return; }
    if (H.stun > 0) return;
    const [ix, iy, mag] = dirInput();
    H.run = !!(keys.ShiftLeft || keys.ShiftRight);
    H.moving = mag > .12;
    if (!H.moving) { H.walk = 0; straightDir = null; return; }
    const ax = Math.abs(ix), ay = Math.abs(iy);
    if (ax > ay + .05) H.face = ix > 0 ? 'right' : 'left'; else if (ay > ax + .05) H.face = iy > 0 ? 'down' : 'up';
    else { const want = [ix > 0 ? 'right' : 'left', iy > 0 ? 'down' : 'up']; if (!want.includes(H.face)) H.face = want[1]; }
    const sp = (H.run ? 118 : 76) * Math.max(.35, mag), ox = H.x, oy = H.y;
    const blocked = tryMove(a, ix * sp * dt, iy * sp * dt, true);
    const moved = Math.hypot(H.x - ox, H.y - oy) / T;
    m.dist += moved; if (H.run) m.runDist += moved;
    if (blocked && t - lastScrape > 500 && moved < sp * dt / T * .5) { lastScrape = t; m.scrapes++; }
    if (blocked) bumpAhead(a);
    // straight runs with nothing to decide: walking speed for motor calibration
    const dirKey = Math.round(Math.atan2(iy, ix) / (Math.PI / 4));
    if (dirKey !== straightDir) { straightDir = dirKey; straightSince = t; }
    else if (!H.run && mag > .8 && !blocked && t - straightSince > 350) { m.straightT += dt; m.straightD += moved; }
    H.walk += dt * (H.run ? 13 : 9);
    stepAcc += moved; if (stepAcc > (H.run ? .75 : .55)) { stepAcc = 0; SND.sfx('step', { surface: floorAt(a, ...heroTile()), vol: .8 }); }
  }
  function bumpAhead(a) {
    const [dx, dy] = DIRV[H.face], tx = Math.floor((H.x + dx * 9) / T), ty = Math.floor((H.y - 2 + dy * 9) / T);
    const e = exitAt(a, tx, ty); if (e && e.state !== 'open') { bumpExit(e); return; }
    if (S.spec.maze && a.id === S.spec.maze.area && tileAt(a, tx, ty) === 'H' && S.spec.maze.planGrid[ty][tx] === '.') {
      const t = now(); if (t - (S.lastHedgeBump || 0) > 1400) { S.lastHedgeBump = t; S.log.staleBumps++; logEvent('stale-bump', { tile: [tx, ty] }); }
    }
  }
  function hurtHero(dmg, nx, ny) {
    if (H.inv > 0 || !S.running) return;
    H.hp -= dmg; S.log.dmg += dmg; H.inv = 1.1; H.kx = nx * 150; H.ky = ny * 150; H.kt = .16; H.atk = 0;
    sfx('hurt'); S.fx.push({ type: 'flash', t: 0, dur: .18 }); hud();
    if (H.hp <= 0) die();
  }
  function die() {
    S.paused = true; S.log.deaths++; logEvent('death'); SND.stinger('death');
    showScreen('end', `<h1 class="dead">You Died</h1><p>The house keeps you a while, then lets you go.</p><button class="btn" id="retry">Wake again</button>`, () => $('#retry').onclick = () => {
      $('#end').hidden = true; H.hp = 6; H.inv = 1.5;
      const st = S.spec.start; S.area = S.areas[st.area]; H.x = st.x * T; H.y = st.y * T; H.face = st.face; rebuildBlk(S.area);
      Object.values(S.areas).forEach(a => a.enemies.forEach(e => { if (e.state === 'chase' && !e.hunt) { e.state = e.patrol ? 'patrol' : 'wander'; e.px = e.home[0]; e.py = e.home[1]; } }));
      S.paused = false; hud(); enterArea(S.area);
    });
  }

  /* ---------- the sword ---------- */
  function attack() {
    if (H.atk > 0 || H.atkCd > 0 || H.stun > 0 || H.kt > 0) return;
    H.atk = .24; H.atkCd = .34; sfx('slash', .8); S.log.swings++;
    const [dx, dy] = DIRV[H.face], hx = H.x + dx * 14, hy = H.y - 6 + dy * 14;
    const inBox = (x, y, pad) => x > hx - 10 - pad && x < hx + 10 + pad && y > hy - 10 - pad && y < hy + 10 + pad;
    S.fx.push({ type: 'slash', t: 0, dur: .24, face: H.face });
    let hit = null;
    for (const e of S.area.enemies) { if (e.dead || e.state === 'dormant') continue; if (inBox(e.px, e.py - 7, e.type === 'guardian' ? 10 : 4)) { hitEnemy(e, dx, dy); hit = hit || e.type; } }
    for (const f of S.area.figures) { if (f.gone) continue; if (inBox(f.x * T + 8, f.y * T + 2, 3)) { strikeFigure(f); hit = hit || 'figure'; break; } }
    for (const c of S.area.crows) { if (!c.alive) continue; if (inBox(c.x * T + 8, c.y * T + 1, 6)) { hitCrow(c); hit = hit || 'crow'; } }
    // aim: how far the nearest target sat from the line of the swing
    let aimErr = null, bd = 1e9;
    S.area.crows.concat(S.area.enemies.filter(e => !e.dead && e.state !== 'dormant')).forEach(o => {
      const ox = o.px != null ? o.px : o.x * T + 8, oy = o.py != null ? o.py - 7 : o.y * T + 1, rx = ox - H.x, ry = oy - (H.y - 6);
      const along = rx * dx + ry * dy, perp = Math.abs(rx * dy - ry * dx), d = Math.hypot(rx, ry);
      if (along > 0 && d < 40 && d < bd) { bd = d; aimErr = +(perp / T).toFixed(2); }
    });
    S.log.shots.push({ t: +((now() - S.t0) / 1000).toFixed(2), hit: !!hit, target: hit, aimErr });
  }

  /* ---------- enemies ---------- */
  function initEnemy(e, a) {
    Object.assign(e, { area: a.id, px: e.x * T + 8, py: e.y * T + 13, hp: e.hp || 3, state: e.state || 'wander', t: R(0, 5), cd: 0, stun: 0, dead: false, dir: [0, 1], wt: 0, pi: 0, speed: e.speed || 1, moan: R(3, 8), step: 0, kt: 0 });
    e.home = [e.px, e.py];
  }
  function enemyFree(a, x, y, big) {
    const hw = big ? 9 : 5, x0 = Math.floor((x - hw) / T), x1 = Math.floor((x + hw - 1) / T), y0 = Math.floor((y - (big ? 8 : 5)) / T), y1 = Math.floor((y + 1) / T);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) { const c = tileAt(a, tx, ty); if (c !== '.' || a._blk.has(K(tx, ty))) return false; }
    return true;
  }
  function bfsStep(a, e, big) {
    const sx = Math.floor(e.px / T), sy = Math.floor((e.py - 1) / T), [tx, ty] = heroTile();
    const prev = new Map([[K(sx, sy), null]]), q = [[sx, sy]];
    while (q.length) { const [x, y] = q.shift(); if (x === tx && y === ty) break; for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = K(nx, ny); if (prev.has(k) || tileAt(a, nx, ny) !== '.' || a._blk.has(k)) continue; prev.set(k, [x, y]); q.push([nx, ny]); } if (prev.size > 1400) break; }
    let cur = K(tx, ty); if (!prev.has(cur)) return null; let step = [tx, ty];
    while (prev.get(cur) && K(...prev.get(cur)) !== K(sx, sy)) { step = prev.get(cur); cur = K(...step); }
    return [step[0] * T + 8, step[1] * T + 12];
  }
  function updateEnemies(dt) {
    const a = S.area, safe = S.spec.safe.includes(a.id);
    for (const e of a.enemies) {
      if (e.dead) { e.fall = Math.min(1, (e.fall || 0) + dt * 2); continue; }
      if (e.state === 'dormant' || S.holdAll || S.held[e.id]) continue;
      e.t += dt; e.cd -= dt;
      const big = e.type === 'guardian';
      if (e.kt > 0) { e.kt -= dt; const nx = e.px + e.kx * dt, ny = e.py + e.ky * dt; if (enemyFree(a, nx, e.py, big)) e.px = nx; if (enemyFree(a, e.px, ny, big)) e.py = ny; continue; }
      if (e.stun > 0) { e.stun -= dt; continue; }
      const dx = H.x - e.px, dy = H.y - e.py, d = Math.hypot(dx, dy) / T;
      const sees = !safe && d < (big ? 6 : 5.5) && los(a, e.px, e.py - 6, H.x, H.y - 6);
      if (sees && e.state !== 'chase') { e.state = 'chase'; sfxAt(big ? 'roar' : 'moan', e.px, e.py); SND.stinger('alert'); }
      if (e.state === 'chase' && !e.hunt) { if (sees) e.lost = 0; else if ((e.lost = (e.lost || 0) + dt) > 5) { e.state = e.patrol ? 'patrol' : 'wander'; e.lost = 0; } }
      let tx = null, ty = null, sp = 34 * e.speed;
      if (e.state === 'chase') {
        if (sees || d < 1.4) { tx = H.x; ty = H.y; }
        else { if ((e.bt = (e.bt || 0) - dt) <= 0) { e.bt = .4; e.next = bfsStep(a, e, big); } if (e.next) [tx, ty] = e.next; }
      } else if (e.state === 'patrol' && e.patrol) {
        const w = e.patrol[e.pi % e.patrol.length], wx = w[0] * T + 8, wy = w[1] * T + 12; sp *= .6;
        if (Math.hypot(wx - e.px, wy - e.py) < 5) e.pi++;
        else { if ((e.bt = (e.bt || 0) - dt) <= 0) { e.bt = .5; const save = [H.x, H.y]; H.x = wx; H.y = wy; e.next = bfsStep(a, e, big); H.x = save[0]; H.y = save[1]; } if (e.next) [tx, ty] = e.next; else { tx = wx; ty = wy; } }
      } else if (e.state === 'wander') {
        sp *= .45; if ((e.wt -= dt) <= 0) { e.wt = R(1, 2.6); const k = Math.floor(R(0, 6)); e.dir = k < 4 ? N4[k] : [0, 0]; }
        tx = e.px + e.dir[0] * 20; ty = e.py + e.dir[1] * 20;
      }
      if (tx !== null) {
        const vx = tx - e.px, vy = ty - e.py, m = Math.hypot(vx, vy) || 1, stx = vx / m * sp * dt, sty = vy / m * sp * dt;
        let moved = false;
        if (d > (big ? 1.1 : .8) || e.state !== 'chase') { if (enemyFree(a, e.px + stx, e.py, big)) { e.px += stx; moved = true; } else if (e.state === 'wander') e.wt = 0; if (enemyFree(a, e.px, e.py + sty, big)) { e.py += sty; moved = true; } }
        if (Math.abs(vx) > Math.abs(vy)) e.face = vx > 0 ? 'right' : 'left'; else e.face = vy > 0 ? 'down' : 'up';
        e.moving = moved;
        if (moved && (e.step -= dt) <= 0) { e.step = big ? .7 : .55; if (d < 12) sfxAt('drag', e.px, e.py, big ? 1 : .6); }
      } else e.moving = false;
      if ((e.moan -= dt) <= 0) { e.moan = R(4, 9); if (d < 14) sfxAt(big ? 'roar' : 'moan', e.px, e.py, big ? .6 : .8); }
      if (e.state === 'chase' && d < (big ? 1.35 : .98) && e.cd <= 0 && !safe) { e.cd = big ? 1.8 : 1.2; hurtHero(big ? 2 : 1, dx / (d * T || 1), dy / (d * T || 1)); }
    }
  }
  function hitEnemy(e, dx, dy) {
    if (e.type === 'guardian') { e.stun = 1.2; sfx('clang'); S.fx.push({ type: 'spark', x: e.px, y: e.py - 14, t: 0, dur: .3 }); logEvent('guardian-stun'); return; }
    e.hp--; e.stun = .3; e.kx = dx * 140; e.ky = dy * 140; e.kt = .12; sfx('hit'); S.fx.push({ type: 'spark', x: e.px, y: e.py - 8, t: 0, dur: .2 });
    if (e.state !== 'chase') e.state = 'chase';
    if (e.hp <= 0) { e.dead = true; sfx('crumble', .6); logEvent('kill', { id: e.id }); S.log.hits++; S.fx.push({ type: 'puff', x: e.px, y: e.py - 6, t: 0, dur: .5 }); }
  }
  function spawnEnemy(areaId, o) { const a = S.areas[areaId]; const e = Object.assign({}, o); initEnemy(e, a); a.enemies.push(e); return e; }

  /* ---------- standing sentinels: armour, or something pretending to be ---------- */
  function figureVisible(a, f) {
    const fx = f.x * T + 8, fy = f.y * T + 4, d = Math.hypot(H.x - fx, H.y - fy) / T;
    if ((a.dark || S.blackout) && d > lanternRadius() / T + .5) return false;
    return d < 9 && los(a, H.x, H.y - 6, fx, fy);
  }
  function updateFigures(dt, t) {
    const a = S.area;
    for (const f of a.figures) {
      if (f.gone || f.decided) { if (f.wob > 0) f.wob -= dt; continue; }
      if (!f.seen && figureVisible(a, f)) { f.seen = t; logEvent('figure-seen', { id: f.id }); }
      const d = Math.hypot(H.x - (f.x * T + 8), H.y - (f.y * T + 10)) / T;
      if (d < 1.7) f.near = true;
      if (f.near && d > 2.6) decideFigure(f, 'pass', t);
    }
  }
  function decideFigure(f, how, t) {
    f.decided = how;
    const correct = (how === 'strike') === (f.type === 'sleeper');
    const rec = { id: f.id, type: f.type, look: f.look, contrast: f.contrast, how, correct, rt: f.seen ? +((t - f.seen) / 1000).toFixed(2) : null, t: +((t - S.t0) / 1000).toFixed(2), area: f.area };
    S.log.figures.push(rec); logEvent('figure', rec);
    const a = S.areas[f.area];
    if (f.type === 'sleeper') {
      f.gone = true; rebuildBlk(a);
      if (how === 'strike') { sfx('crumble'); S.fx.push({ type: 'puff', x: f.x * T + 8, y: f.y * T, t: 0, dur: .6 }); }
      else { const e = spawnEnemy(f.area, { id: f.id + '-awake', type: f.look === 'scarecrow' ? 'gardener' : 'knight', x: f.x, y: f.y, state: 'chase', hp: 3, speed: 1.15 }); e.hunt = false; sfxAt('moan', e.px, e.py, 1.1); SND.stinger('alert'); }
    } else if (how === 'strike') {
      f.wob = .5; sfx('clang'); H.stun = .35;
      const [dx, dy] = DIRV[H.face]; H.kx = -dx * 90; H.ky = -dy * 90; H.kt = .1;
    }
  }
  function strikeFigure(f) { if (f.decided) { if (f.type === 'statue') { f.wob = .4; sfx('clang', .6); } return; } decideFigure(f, 'strike', now()); }

  /* ---------- crows ---------- */
  function hitCrow(c) { c.alive = false; c.fly = .01; c.vx = R(-1, 1); sfx('caw'); sfx('flap'); S.log.hits++; logEvent('crow', { id: c.id }); if (S.hooks.onCrow) S.hooks.onCrow(c); }
  function updateCrows(dt) { S.area.crows.forEach(c => { if (!c.alive && c.fly > 0 && c.fly < 3) c.fly += dt; }); }

  /* ---------- the follower ---------- */
  function updateFollower(dt) {
    const f = S.follower; if (!f || f.area !== S.area.id) return;
    f.trail.push([H.x, H.y]); if (f.trail.length > 18) { const [x, y] = f.trail.shift(); const dx = x - f.x, dy = y - f.y; if (Math.hypot(dx, dy) > .3) { f.face = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'); f.moving = true; } else f.moving = false; f.x = x; f.y = y; }
  }

  /* ---------- items and things to use ---------- */
  function interactables() {
    const out = [];
    S.area.items.forEach(it => { if (!it.taken) out.push({ kind: 'item', it, x: it.x * T + 8, y: it.y * T + 12, label: 'Take ' + it.name.replace(/^An? /, '').toLowerCase() }); });
    S.area.props.forEach(p => { if (p.interact && !p.hidden && !p.gone) out.push({ kind: 'prop', p, x: (p.x + p.fw / 2) * T, y: (p.y + p.fh) * T - 3, label: p.label }); });
    return out;
  }
  function focus() {
    if (S.homing && S.homing.ready) return { kind: 'match', label: S.homing.label };
    let best = null, bs = 1e9; const [fx, fy] = DIRV[H.face];
    for (const o of interactables()) {
      const dx = o.x - H.x, dy = o.y - (H.y - 4), d = Math.hypot(dx, dy); if (d > 22) continue;
      const s = d - (dx * fx + dy * fy) / (d || 1) * 8; if (s < bs) { bs = s; best = o; }
    }
    return best;
  }
  function nearPlan() { const o = focus(); return o && o.kind === 'prop' && o.p.id === 'plan' ? o.p : null; }
  function use() {
    const o = focus(); if (!o) return;
    if (o.kind === 'match') { finishHoming(false); return; }
    if (o.kind === 'item') { takeItem(o.it); return; }
    const p = o.p;
    if (S.hooks.onProp && S.hooks.onProp(p)) return;
    if (p.id === 'plan') { openMap(); return; }
    if (p.lines) say(p.lines);
  }
  function takeItem(it) {
    if (S.hooks.canTake && S.hooks.canTake(it) === false) return;
    it.taken = true; sfx('pickup'); logEvent('take', { id: it.id, area: it.area });
    if (it.heal) H.hp = Math.min(6, H.hp + it.heal);
    else { const key = it.replaces || it.id; S.inv[key] = true; S.invNames[key] = it.name; }
    hud();
    say((it.read ? [] : [it.name + '.']).concat(it.lines || []));
    if (S.hooks.onTake) S.hooks.onTake(it);
  }

  /* ---------- dialog, banner, toast ---------- */
  const dlg = { q: [], open: false, cur: null, shown: 0, blip: 0 };
  function say(lines, who, cb) {
    lines = [].concat(lines || []); if (!lines.length) { if (cb) cb(); return; }
    lines.forEach((l, i) => dlg.q.push({ text: l, who: who || '', cb: i === lines.length - 1 ? cb : null }));
    if (!dlg.open) nextLine();
  }
  function nextLine() {
    const it = dlg.q.shift();
    if (!it) { dlg.open = false; dlg.cur = null; $('#dialog').hidden = true; return; }
    dlg.open = true; dlg.cur = it; dlg.shown = 0; $('#dialog').hidden = false; $('#dWho').textContent = it.who; $('#dWho').hidden = !it.who; $('#dText').textContent = '';
  }
  function updateDialog(dt) {
    if (!dlg.open) return; const it = dlg.cur; if (dlg.shown >= it.text.length) return;
    const before = Math.floor(dlg.shown); dlg.shown = Math.min(it.text.length, dlg.shown + dt * 72);
    if (Math.floor(dlg.shown) !== before) { $('#dText').textContent = it.text.slice(0, Math.floor(dlg.shown)); if ((dlg.blip += Math.floor(dlg.shown) - before) >= 3) { dlg.blip = 0; sfx('blip', .5); } }
  }
  function advanceDialog() { if (!dlg.open) return; const it = dlg.cur; if (dlg.shown < it.text.length) { dlg.shown = it.text.length; $('#dText').textContent = it.text; return; } const cb = it.cb; nextLine(); if (cb) cb(); }
  const dlgOpen = () => dlg.open;
  let bannerT = null, toastT = null;
  function showBanner(name) { $('#hudName').textContent = name; const b = $('#banner'); b.textContent = name; b.classList.add('on'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('on'), 1700); }
  function toast(msg) { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 2400); }
  /* ---------- distances through the house: true layout, or Locke's plan ---------- */
  function passT(a, x, y, plan) {
    if (x < 0 || y < 0 || x >= a.w || y >= a.h) return false;
    let c = a.grid[y][x];
    if (plan && S.spec.maze && a.id === S.spec.maze.area) c = S.spec.maze.planGrid[y][x];
    if (c === '.') return !a._blk.has(K(x, y));
    if (c === 'D') { const e = exitAt(a, x, y); if (!e) return false; return plan ? (e.plan ? e.plan === 'door' : e.state !== 'sealed') : e.state === 'open'; }
    return false;
  }
  function isTarget(tg, ai, x, y) {
    if (!tg) return false;
    if (tg.exit) { const e = S.exitById[tg.exit]; return e.area === ai && e.tiles.some(([ex, ey]) => Math.abs(ex - x) + Math.abs(ey - y) <= 1); }
    if (tg.area && tg.area !== ai) return false;
    if (tg.tiles) return tg.tiles.some(([tx, ty]) => Math.abs(tx - x) + Math.abs(ty - y) <= 1);
    return true;
  }
  function worldDist(ai0, x0, y0, tg, plan) {
    const key = (a, x, y) => a + '|' + x + ',' + y, d = new Map([[key(ai0, x0, y0), 0]]), q = [[ai0, x0, y0]];
    while (q.length) {
      const [ai, x, y] = q.shift(), dd = d.get(key(ai, x, y));
      if (isTarget(tg, ai, x, y)) return dd;
      const a = S.areas[ai];
      for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = key(ai, nx, ny); if (!d.has(k) && passT(a, nx, ny, plan)) { d.set(k, dd + 1); q.push([ai, nx, ny]); } }
      const e = exitAt(a, x, y);
      if (e && !e.veil && e.to && passT(a, x, y, plan)) { const te = S.exitById[e.to], [tx, ty] = arrivalTile(te), k = key(te.area, tx, ty); if (!d.has(k)) { d.set(k, dd + 1); q.push([te.area, tx, ty]); } }
      if (d.size > 30000) break;
    }
    return null;
  }
  // a choice of doorway out of a room with three or more ways on
  function logExitChoice(e) {
    const a = S.area; if (!S.goal || e.veil || isScroll(a)) return;
    const open = a.exits.filter(x => x.state === 'open' && !x.veil); if (open.length < 3) return;
    const via = (x, plan) => { const te = S.exitById[x.to]; if (!te) return null; const [tx, ty] = arrivalTile(te); return worldDist(te.area, tx, ty, S.goal, plan); };
    const tr = open.map(x => [x.id, via(x, false)]).filter(o => o[1] != null); if (!tr.length) return;
    const po = a.exits.filter(x => !x.veil && (x.plan ? x.plan === 'door' : x.state === 'open')).map(x => [x.id, via(x, true)]).filter(o => o[1] != null);
    const mt = Math.min(...tr.map(o => o[1])), best = tr.filter(o => o[1] <= mt + 1).map(o => o[0]);
    const mp = po.length ? Math.min(...po.map(o => o[1])) : null, bestP = po.filter(o => o[1] <= mp + 1).map(o => o[0]);
    const rec = { t: +((now() - S.t0) / 1000).toFixed(2), area: a.id, chose: e.id, options: open.length, optimal: best.includes(e.id), planOptimal: bestP.includes(e.id), conflict: best.slice().sort().join() !== bestP.slice().sort().join(), changed: S.changedOnce, leg: S.leg ? S.leg.name : null };
    S.log.junctions.push(rec); logEvent('junction', rec);
  }
  // the same, between cells of the hedge maze
  function mazeCell(x, y) { const M = S.spec.maze, lx = x / T - M.ox, ly = (y - 1) / T - M.oy, i = Math.floor(lx / 3), j = Math.floor(ly / 3); if (i < 0 || j < 0 || i >= M.CI || j >= M.CJ || lx - i * 3 >= 2 || ly - j * 3 >= 2) return null; return [i, j]; }
  function cellNbs(grid, i, j) {
    const M = S.spec.maze, cx = a => M.ox + 3 * a, cy = b => M.oy + 3 * b, out = [];
    for (const [di, dj] of N4) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= M.CI || b >= M.CJ) continue;
      const ts = di ? [[cx(Math.min(i, a)) + 2, cy(j)], [cx(Math.min(i, a)) + 2, cy(j) + 1]] : [[cx(i), cy(Math.min(j, b)) + 2], [cx(i) + 1, cy(Math.min(j, b)) + 2]];
      if (ts.every(([x, y]) => grid[y][x] === '.')) out.push([a, b]); }
    return out;
  }
  function cellDist(grid, goals) { const d = new Map(), q = []; goals.forEach(c => { d.set(K(...c), 0); q.push(c); }); while (q.length) { const c = q.shift(); for (const n of cellNbs(grid, ...c)) if (!d.has(K(...n))) { d.set(K(...n), d.get(K(...c)) + 1); q.push(n); } } return d; }
  function goalCells() {
    const M = S.spec.maze, g = S.goal; if (!g) return null;
    if (g.area === M.area && g.tiles) return g.tiles.map(([x, y]) => mazeCell(x * T + 8, y * T + 9) || mazeCell(x * T + 8, (y - 1) * T + 9)).filter(Boolean);
    const a = S.areas[M.area], ex = a.exits.filter(e => S.exitById[e.to] && (S.exitById[e.to].area === g.area || (g.exit && S.exitById[g.exit].area === S.exitById[e.to].area)));
    return ex.map(e => { const p = arrival(e); return mazeCell(p.x, p.y); }).filter(Boolean);
  }
  function updateMazeJunction() {
    const M = S.spec.maze; if (!M || S.area.id !== M.area || !S.goal) return;
    const c = mazeCell(H.x, H.y); if (!c) return;
    const prev = S.lastCell; S.lastCell = c; if (!prev || K(...prev) === K(...c)) return;
    if (Math.abs(prev[0] - c[0]) + Math.abs(prev[1] - c[1]) !== 1) return;
    const L = M.lawn, inLawn = ([i, j]) => i >= L[0] && i <= L[2] && j >= L[1] && j <= L[3]; if (inLawn(prev)) return;
    const nbT = cellNbs(S.area.grid, ...prev); if (nbT.length < 3) return;
    const gc = goalCells(); if (!gc || !gc.length) return;
    const dT = cellDist(S.area.grid, gc), dP = cellDist(M.planGrid, gc), k = K(...prev);
    if (!dT.has(k)) return;
    const bestT = nbT.filter(n => dT.get(K(...n)) === dT.get(k) - 1).map(n => K(...n));
    const bestP = cellNbs(M.planGrid, ...prev).filter(n => dP.get(K(...n)) === dP.get(k) - 1).map(n => K(...n));
    const rec = { t: +((now() - S.t0) / 1000).toFixed(2), cell: prev, to: c, options: nbT.length, optimal: bestT.includes(K(...c)), planOptimal: bestP.includes(K(...c)), conflict: bestT.sort().join() !== bestP.sort().join(), changed: S.changedOnce, leg: S.leg ? S.leg.name : null };
    S.log.junctions.push(rec); logEvent('junction', rec);
  }
  // going back to a hedge that has already been found closed
  function updateClosures(t) {
    if (!S.closures.length || !S.spec.maze || S.area.id !== S.spec.maze.area) return;
    const [hx, hy] = heroTile();
    S.closures.forEach(c => {
      const near = c.tiles.some(([x, y]) => Math.abs(x - hx) <= 1 && Math.abs(y - hy) <= 1 || (Math.abs(x - hx) + Math.abs(y - hy) <= 2 && los(S.area, H.x, H.y - 4, x * T + 8, y * T + 8)));
      if (!near) return;
      if (!c.found) { c.found = t; c.last = t; S.log.closureFinds++; logEvent('closure-found', { tile: c.tiles[0], leg: S.leg ? S.leg.name : null }); }
      else { if (t - c.last > 8000) { S.log.closureRevisits++; logEvent('closure-revisit', { tile: c.tiles[0], since: +((t - c.found) / 1000).toFixed(1) }); } c.last = t; }
    });
  }

  /* ---------- legs: a trip to one goal, scored against the shortest true route at its start ---------- */
  function startLeg(name, target) {
    const [tx, ty] = heroTile(); S.goal = target;
    S.leg = { name, target, t0: now(), d0: S.log.motor.dist, scrapes0: S.log.motor.scrapes, shortest: worldDist(S.area.id, tx, ty, target, false), j0: S.log.junctions.length };
    logEvent('leg-start', { leg: name, shortest: S.leg.shortest });
  }
  function checkLeg() {
    const L = S.leg; if (!L) return; const [tx, ty] = heroTile(); if (!isTarget(L.target, S.area.id, tx, ty)) return;
    S.leg = null;
    const walked = S.log.motor.dist - L.d0, J = S.log.junctions.slice(L.j0);
    const rec = { leg: L.name, shortest: L.shortest, walked: +walked.toFixed(1), efficiency: L.shortest ? +(walked / L.shortest).toFixed(3) : null, dur: +((now() - L.t0) / 1000).toFixed(1), junctions: J.length, optimal: J.filter(j => j.optimal).length, scrapes: S.log.motor.scrapes - L.scrapes0 };
    S.log.legs.push(rec); logEvent('leg-end', rec);
    if (S.hooks.onLegEnd) S.hooks.onLegEnd(L.name);
  }

  /* ---------- the lantern: triangle completion in the dark ---------- */
  function lanternTrial(design, cb) { const [x, y] = design.pts[0]; S.wisp = { design, x, y, i: 0, phase: 'wait', cb, t: 0 }; }
  function updateWisp(dt) {
    const L = S.wisp; if (!L) return; L.t += dt;
    const hx = H.x / T, hy = H.y / T, pd = Math.hypot(hx - L.x, hy - L.y), pts = L.design.pts;
    if (L.phase === 'wait' && pd < 1.1) { L.phase = 'walk'; L.i = 1; logEvent('lantern-start', { length: L.design.length, turns: L.design.turns, lens: L.design.lens }); }
    else if (L.phase === 'walk') {
      if (pd < 2.4) { const [tx, ty] = pts[L.i], dx = tx - L.x, dy = ty - L.y, d = Math.hypot(dx, dy), st = 2.5 * dt; if (d <= st) { L.x = tx; L.y = ty; L.i++; if (L.i >= pts.length) { L.phase = 'gone'; L.gone = 0; } } else { L.x += dx / d * st; L.y += dy / d * st; } }
    } else if (L.phase === 'gone') {
      L.gone += dt;
      if (L.gone > .7) { S.wisp = null; S.texSeed = Math.floor(R(1, 9999));   // the grass underfoot is reseeded, so no patch can be recognised on the way back
        sfx('veil', .4); homing({ x: pts[0][0], y: pts[0][1] }, res => L.cb(res), { kind: 'lantern', length: L.design.length, legs: L.design.legs, turns: L.design.turns, homeDist: +L.design.homeDist.toFixed(2) }); }
    }
  }
  function homing(target, cb, meta, label) {
    const h = S.homing = { tx: target.x, ty: target.y, label: label || 'Strike a match', cb, t0: now(), sx: H.x / T, sy: H.y / T, d0: S.log.motor.dist, meta: meta || { kind: 'free' }, ready: false };
    setTimeout(() => { if (S.homing === h) h.ready = true; }, 700);
    h.timer = setTimeout(() => { if (S.homing === h) finishHoming(true); }, 90000);
  }
  function finishHoming(timeout) {
    const h = S.homing; if (!h) return; S.homing = null; S.texSeed = 0; clearTimeout(h.timer); sfx('match');
    const px = H.x / T, py = H.y / T, err = Math.hypot(px - h.tx, py - h.ty);
    const res = { err: +err.toFixed(2), dx: +(px - h.tx).toFixed(2), dz: +(py - h.ty).toFixed(2), startDist: +Math.hypot(h.sx - h.tx, h.sy - h.ty).toFixed(2), walked: +(S.log.motor.dist - h.d0).toFixed(2), dur: +((now() - h.t0) / 1000).toFixed(2), timeout: !!timeout };
    const cx = h.tx - h.sx, cz = h.ty - h.sy, rx = px - h.sx, rz = py - h.sy, cl = Math.hypot(cx, cz), rl = Math.hypot(rx, rz);
    res.distRatio = cl > .1 ? +(rl / cl).toFixed(3) : null;
    res.angErr = cl > .1 && rl > .1 ? +(Math.atan2(cx * rz - cz * rx, cx * rx + cz * rz) * 180 / Math.PI).toFixed(1) : null;
    Object.assign(res, h.meta);
    S.fx.push({ type: 'match', t: 0, dur: 1.6, tx: h.tx, ty: h.ty });
    S.log.homing.push(res); logEvent('homing', res); h.cb(res);
  }

  /* ---------- the adaptive layer ---------- */
  function adoState() {
    if (!S.adoState) {
      S.adoState = ADO.newState(store.get('palace16.ado', null));
      const st = S.adoState, Hb = g => ADO.entropy(ADO.weights(g)) / Math.LN2;
      S.adoPrior = { lantern: ADO.marginals(st.lantern), palace: ADO.marginals(st.palace) };
      S.adoHist = { lantern: [Hb(st.lantern)], palace: [Hb(st.palace)] }; S.adoLast = {}; S.adoN = { lantern: 0, palace: 0 };
    }
    return S.adoState;
  }
  function adoSave() { store.set('palace16.ado', ADO.save(adoState())); S.log.ado = { lantern: ADO.summary(adoState().lantern), palace: ADO.summary(adoState().palace) }; }
  function adoTrack(model) { const st = adoState(); S.adoHist[model].push(ADO.entropy(ADO.weights(st[model])) / Math.LN2); S.adoN[model]++; labRender(true); }

  /* ---------- the API the chapter scripts call ---------- */
  const findProp = id => { for (const a of Object.values(S.areas)) { const p = a.props.find(q => q.id === id); if (p) return p; } return null; };
  const findEnemy = id => { for (const a of Object.values(S.areas)) { const e = a.enemies.find(q => q.id === id); if (e) return e; } return null; };
  const api = {
    rng: Math.random, event: (n, d) => logEvent(n, d), say, toast, sfx: (t, v) => sfx(t, v),
    goal(t) { S.goal = t; }, leg: startLeg,
    has: k => !!S.inv[k], itemName: k => S.invNames[k] || k,
    drop(k) { delete S.inv[k]; hud(); },
    placeItem(ai, it) { const o = Object.assign({ area: ai, taken: false, phase: R(0, 6) }, it); S.areas[ai].items.push(o); S.items.push(o); },
    moveItem(id, ai, x, y) { const it = S.items.find(i => i.id === id); if (!it) return; const old = S.areas[it.area]; old.items.splice(old.items.indexOf(it), 1); S.areas[ai].items.push(it); Object.assign(it, { area: ai, x, y }); logEvent('item-moved', { id, area: ai }); },
    isTaken: id => { const it = S.items.find(i => i.id === id); return it ? it.taken : false; },
    isPlaced: id => !!S.placed[id],
    itemPos: id => { const it = S.items.find(i => i.id === id); return it ? { area: it.area, x: it.x, y: it.y } : null; },
    freeSpot(ai) {
      const a = S.areas[ai], c = [];
      for (let y = 3; y < a.h - 2; y++) for (let x = 2; x < a.w - 2; x++) if (a.grid[y][x] === '.' && !a._blk.has(K(x, y)) && !a.items.some(i => i.x === x && i.y === y && !i.taken) && N4.every(([dx, dy]) => !a._blk.has(K(x + dx, y + dy)))) c.push([x, y]);
      return c[Math.floor(Math.random() * c.length)] || [7, 8];
    },
    placeOn(p, id) { S.placed[id] = true; p.memory = id; },
    setExit(id, state) { const e = S.exitById[id]; if (e) { e.state = state; S.changedOnce = true; } },
    setTile(ai, x, y, ch) { S.areas[ai].grid[y][x] = ch; S.changedOnce = true; },
    showProp(id) { const p = findProp(id); if (p) { p.hidden = false; rebuildBlk(S.areas[p.area]); } },
    wake(id, mul) { const e = findEnemy(id); if (!e) return; e.state = 'chase'; e.hunt = true; if (mul) e.speed *= mul; if (e.area === S.area.id) { sfxAt(e.type === 'guardian' ? 'roar' : 'moan', e.px, e.py); SND.stinger('alert'); } },
    hold(id, v) { S.held[id] = v; }, holdAll(v) { S.holdAll = v; },
    spawn(ai, o) { spawnEnemy(ai, o); },
    lantern16(on) { S.lanternOff = !on; }, blackout(on) { S.blackout = on; },
    lantern: lanternTrial, homing: (target, cb, meta) => homing(target, cb, meta),
    flag(k, v) { S.flags[k] = v; },
    follower(id) { const p = findProp(id); if (!p) return; p.gone = true; rebuildBlk(S.areas[p.area]); S.follower = { area: p.area, x: (p.x + .5) * T, y: (p.y + 1) * T - 3, face: 'down', trail: [], moving: false }; },
    endChapter: () => endChapter(),
    ado: {
      chooseLantern: (cands, anchor) => { const ch = ADO.chooseLantern(adoState(), cands, Math.random, anchor); S.adoLast.lanternNext = { L: ch.pick.length, c: ch.pick.homeDist, eig: ch.eig, anchor: ch.anchor }; labRender(true); return ch; },
      lanternUpdate: (d, res) => { const o = ADO.lanternObs(res); ADO.lanternUpdate(adoState().lantern, { L: d.length, c: o.c }, o.er, o.et); S.adoLast.lanternObs = { L: d.length, err: res.err }; S.adoLast.lanternNext = null; adoSave(); adoTrack('lantern'); },
      choosePalace: (kinds, anchor) => { const ch = ADO.choosePalace(adoState(), kinds, anchor); S.adoLast.palaceNext = ch; labRender(true); return ch; },
      palaceUpdate: (kind, cls) => { ADO.palaceUpdate(adoState().palace, kind, cls); S.adoLast.palaceObs = { kind, cls }; S.adoLast.palaceNext = null; adoSave(); adoTrack('palace'); },
    },
  };

  /* ---------- telemetry and sound helpers ---------- */
  function logEvent(name, data) {
    if (!S.log) return;
    S.log.events.push(Object.assign({ name, t: +((now() - S.t0) / 1000).toFixed(2), area: S.area ? S.area.id : null }, data || {}));
    if (name === 'regrow' && data) S.closures = data.close.map(tiles => ({ tiles, found: null, last: 0 }));
  }
  function audio() { SND.init(); }
  function sfx(type, vol) { SND.sfx(type, { vol: vol == null ? 1 : vol }); }
  function sfxAt(type, px, py, vol) { SND.sfx(type, { vol: vol == null ? 1 : vol, x: px / T, z: py / T, occ: !los(S.area, H.x, H.y - 6, px, py - 6) }); }
  const floorAt = (a, x, y) => a.fgrid ? (a.fgrid[y] && a.fgrid[y][x]) || a.floor : a.floor;

  /* ---------- chapters ---------- */
  const CH_NAMES = ['Chapter One', 'Chapter Two', 'Chapter Three'];
  const TITLE = { grounds: 'The Grounds', east: 'The East Wing', conservatory: 'The Conservatory', palace: 'The Palace' };
  function calib() { return store.get('palace16.calib', { contrastScale: 1, history: [] }); }
  function newLog(spec) {
    return { id: spec.id, variant: 'sixteen', seed: spec.seed, startedAt: Date.now(), duration: null, events: [], junctions: [], figures: [], homing: [], legs: [], shots: [], mapViews: [], path: [],
      motor: { dist: 0, runDist: 0, scrapes: 0, straightT: 0, straightD: 0 }, swings: 0, hits: 0, dmg: 0, deaths: 0, staleBumps: 0, closureFinds: 0, closureRevisits: 0, done: false };
  }
  function ensureSession() { if (!S.session) S.session = { version: 1, variant: 'sixteen', startedAt: Date.now(), seedBase: Math.floor(Math.random() * 1e6), chapters: [] }; }
  function loadSpec(spec) {
    S.spec = spec; S.areas = spec.areas; S.exitById = {}; S.items = [];
    Object.values(spec.areas).forEach(a => {
      a._exitAt = {}; a.exits.forEach(e => { S.exitById[e.id] = e; e.tiles.forEach(([x, y]) => a._exitAt[K(x, y)] = e); });
      a.items.forEach(it => { Object.assign(it, { area: a.id, taken: false, phase: R(0, 6) }); S.items.push(it); });
      a.figures.forEach(f => Object.assign(f, { area: a.id, seen: null, decided: null, phase: R(0, 6.28), near: false, wob: 0, gone: false }));
      a.enemies.forEach(e => initEnemy(e, a));
      a.crows.forEach(c => Object.assign(c, { area: a.id, alive: true, fly: 0, hop: R(0, 4) }));
      a.props.forEach(p => { p.area = a.id; });
      rebuildBlk(a);
    });
    Object.assign(S, { inv: {}, invNames: {}, flags: {}, visited: {}, held: {}, holdAll: false, blackout: false, lanternOff: false, homing: null, wisp: null, leg: null, goal: null, trans: null, fx: [], changedOnce: false, closures: [], follower: null, placed: {}, lastCell: null });
    const st = spec.start; S.area = S.areas[st.area]; H.x = st.x * T; H.y = st.y * T; H.face = st.face; H.hp = 6; H.inv = 0; H.atk = 0; H.kt = 0; H.stun = 0;
    S.log = newLog(spec); ensureSession(); S.session.chapters.push(S.log);
    S.hooks = spec.script(api) || {};
  }
  function startChapter(i) {
    ensureSession();
    if (!S.session.prologueDone) { S.pendingChapter = i; return startPrologue(); }
    S.chapter = i;
    const sc = calib().contrastScale, spec = W.generate(i, S.session.seedBase * 10 + i, { contrastScale: sc });
    loadSpec(spec); S.log.contrastScale = sc; SND.scene('card');
    showScreen('end', `<div class="sub">${CH_NAMES[i]}</div><h1>${spec.title}</h1><p class="muted">${spec.sub}</p><button class="btn" id="begin">Begin</button>`, () => $('#begin').onclick = () => beginPlay(spec));
  }
  function startPrologue() {
    const spec = W.prologue(S.session.seedBase); loadSpec(spec); SND.scene('card');
    showScreen('end', `<div class="sub">Prologue</div><h1>${spec.title}</h1><p class="muted">A short walk up to the house</p><button class="btn" id="begin">Begin</button>`, () => $('#begin').onclick = () => beginPlay(spec));
  }
  function beginPlay(spec) {
    $('#end').hidden = true; $('#title').hidden = true; audio(); SND.scene(spec.id);
    S.running = true; S.paused = false; S.t0 = now(); adoState(); if (TOUCH) { $('#touch').hidden = false; $('#labBtn').hidden = false; }
    hud(); showBanner(S.area.name);
    if (S.hooks.onStart) S.hooks.onStart();
    say(spec.intro);
    labRender(true);
  }
  function saveSession() { const all = store.get('palace16.sessions', []).filter(s => s.startedAt !== S.session.startedAt); all.push(S.session); store.set('palace16.sessions', all.slice(-5)); }
  function endChapter() {
    S.running = false; S.paused = true;
    S.log.duration = +((now() - S.t0) / 1000).toFixed(1); S.log.done = true;
    if (S.spec.id === 'grounds') { S.session.prologueDone = true; saveSession(); return startChapter(S.pendingChapter || 0); }
    // keep sentinel decisions near threshold for this player: about 75% correct is where drift is best estimated
    const F = S.log.figures;
    if (F.length >= 3) { const acc = F.filter(f => f.correct).length / F.length, c = calib();
      c.contrastScale = clamp(c.contrastScale * (acc > .85 ? .8 : acc < .65 ? 1.25 : 1), .4, 2.5);
      c.history.push({ t: Date.now(), chapter: S.spec.id, acc: +acc.toFixed(2), n: F.length, scale: +c.contrastScale.toFixed(3) }); c.history = c.history.slice(-60); store.set('palace16.calib', c); }
    saveSession();
    const prog = store.get('palace16.progress', { unlocked: 1 }); prog.unlocked = Math.max(prog.unlocked, Math.min(3, S.chapter + 2)); store.set('palace16.progress', prog);
    showChapterCard();
  }
  function showChapterCard() {
    SND.scene('card'); S.running = false;
    const last = S.chapter === 2, mins = ((S.log.duration || 0) / 60).toFixed(1);
    showScreen('end', last
      ? `<h1>The Palace</h1><div class="sub">The end of the beta</div><p>Elias Locke walks out into the grey morning and does not look back at the house.</p><p>Below it, the palace keeps every room exactly where it belongs.</p><button class="btn" id="notesB">Session notes</button><br><button class="btn small" id="again">Play again</button>`
      : `<div class="sub">${CH_NAMES[S.chapter]} complete · ${mins} min</div><h1>${S.spec.title}</h1><button class="btn" id="next">Continue to ${W.generate(S.chapter + 1, 1).title}</button><br><button class="btn small" id="notesB">Session notes</button>`,
      () => { $('#notesB').onclick = notes; if ($('#next')) $('#next').onclick = () => startChapter(S.chapter + 1); if ($('#again')) $('#again').onclick = () => location.reload(); });
  }
  function showScreen(id, html, after) { const el = $('#' + id); $('#endCard').innerHTML = html; el.hidden = false; if (after) after(); const b = el.querySelector('.btn'); if (b) b.focus(); }
  /* ---------- drawing ---------- */
  function camera(a) {
    if (S.homing || S.wisp) return { cx: Math.round(H.x - VW / 2), cy: Math.round(H.y - 8 - PH / 2) };   // locked to the hero: the screen frame is never a landmark
    const aw = a.w * T, ah = a.h * T;
    return { cx: Math.round(aw <= VW ? (aw - VW) / 2 : clamp(H.x - VW / 2, 0, aw - VW)), cy: Math.round(ah <= PH ? (ah - PH) / 2 : clamp(H.y - 8 - PH / 2, 0, ah - PH)) };
  }
  const lanternRadius = () => S.blackout ? 18 : S.lanternOff ? 14 : S.area && S.area.dark ? 46 : 70;
  function floorish(a, x, y) { const c = tileAt(a, x, y); if (c === '.') return true; if (c === 'D') { const e = exitAt(a, x, y); return e && e.side !== 'N'; } return false; }
  const hash = (x, y) => ((x * 73856093) ^ (y * 19349663)) >>> 0;
  function drawTile(g, a, x, y, sx, sy) {
    const c = a.grid[y][x];
    if (c === '.' || (c === 'D' && exitAt(a, x, y).side !== 'N' && exitAt(a, x, y).state === 'open')) {
      const kind = floorAt(a, x, y); g.drawImage(A.floor(kind, kind === 'marble' && a.checker ? (x + y) & 1 : kind === 'marble' ? 0 : hash(x + S.texSeed, y) % 3), sx, sy); return;
    }
    if (c === 'H') { g.drawImage(floorish(a, x, y + 1) ? A.hedgeFace(hash(x, y) % 4) : A.hedge(hash(x, y) % 4), sx, sy); return; }
    // walls: a face where open floor lies below, otherwise the top of the wall
    const e = c === 'D' ? exitAt(a, x, y) : null;
    const face = e ? (e.side === 'N' && y === Math.max(...e.tiles.map(t => t[1]))) : tileAt(a, x, y + 1) === '.';
    if (face) { g.drawImage(A.face(a.wall, hash(x, y) % 2), sx, sy); return; }
    g.drawImage(A.cap({ n: floorish(a, x, y - 1), s: floorish(a, x, y + 1), e: floorish(a, x + 1, y), w: floorish(a, x - 1, y) }, a.hedge ? '#1e2230' : null), sx, sy);
  }
  function drawExit(g, e, cam, t) {
    if (e.state === 'sealed') return;
    const xs = e.tiles.map(q => q[0]), ys = e.tiles.map(q => q[1]), x = Math.min(...xs) * T - cam.cx, y0 = Math.min(...ys) * T - cam.cy, y = Math.max(...ys) * T - cam.cy;
    const wood = '#5a3418', woodL = '#7a4a24', woodD = '#3a1e0c', stone = '#8a8090', gold = '#e0b040', vf = Math.floor(t / 110) % 6;
    if (e.veil) {
      if (e.side === 'N') { g.fillStyle = '#08060c'; g.fillRect(x + 2, y, 28, 16); g.drawImage(A.props.veil[vf], x, y0); }
      else g.drawImage(A.props.veil[vf], 0, 0, 32, 16, x, y, 32, 16);
      return;
    }
    if (e.side === 'N') {
      g.fillStyle = '#08060c'; g.fillRect(x + 3, y + 1, 26, 15); g.fillStyle = stone; g.fillRect(x + 1, y, 30, 2); g.fillRect(x + 1, y, 2, 16); g.fillRect(x + 29, y, 2, 16);
      if (e.state !== 'open') { g.fillStyle = wood; g.fillRect(x + 3, y + 2, 26, 14); g.fillStyle = woodD; for (let i = 6; i < 28; i += 5) g.fillRect(x + i, y + 2, 1, 14); g.fillRect(x + 15, y + 2, 2, 14); g.fillStyle = woodL; g.fillRect(x + 3, y + 2, 26, 1); }
    } else if (e.side === 'S') {
      if (e.state === 'open') { for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(4,3,8,${.12 + i * .13})`; g.fillRect(x, y + 10 + i, 32, 1); } g.fillStyle = '#231d26'; g.fillRect(x, y, 2, 16); g.fillRect(x + 30, y, 2, 16); }
      else { g.fillStyle = wood; g.fillRect(x, y + 2, 32, 12); g.fillStyle = woodD; for (let i = 4; i < 14; i += 4) g.fillRect(x, y + 2 + i, 32, 1); g.fillStyle = woodL; g.fillRect(x, y + 2, 32, 1); }
    } else {
      const xx = x, yy = Math.min(...ys) * T - cam.cy, left = e.side === 'W';
      if (e.state === 'open') { for (let i = 0; i < 6; i++) { g.fillStyle = `rgba(4,3,8,${.12 + i * .13})`; g.fillRect(left ? xx + 5 - i : xx + 10 + i, yy, 1, 32); } g.fillStyle = '#231d26'; g.fillRect(xx, yy, 16, 2); g.fillRect(xx, yy + 30, 16, 2); }
      else { g.fillStyle = wood; g.fillRect(xx + 3, yy, 10, 32); g.fillStyle = woodD; for (let i = 4; i < 32; i += 5) g.fillRect(xx + 3, yy + i, 10, 1); g.fillStyle = woodL; g.fillRect(xx + 3, yy, 1, 32); }
    }
    if (e.state === 'locked' || e.state === 'bolted' || e.state === 'bolt') {
      const cx = x + (e.side === 'N' || e.side === 'S' ? 15 : 7), cy = (e.side === 'N' ? y + 8 : e.side === 'S' ? y + 7 : Math.min(...ys) * T - cam.cy + 15);
      g.fillStyle = e.state === 'locked' ? gold : '#7a7e88';
      if (e.needs === 'medallion') { g.beginPath(); g.arc(cx + 1, cy, 3, 0, 7); g.fill(); g.fillStyle = woodD; g.fillRect(cx, cy - 1, 2, 2); }
      else if (e.state === 'locked') { g.fillRect(cx - 1, cy - 2, 4, 5); g.fillStyle = '#1a1008'; g.fillRect(cx, cy - 1, 2, 3); }
      else { if (e.side === 'N' || e.side === 'S') g.fillRect(x + 4, cy, 24, 2); else g.fillRect(x + 6, Math.min(...ys) * T - cam.cy + 4, 2, 24); }
    }
  }
  const PROP_SPRITE = p => {
    const t = now();
    if (p.type === 'locke') return A.locke.down;
    if (p.type === 'fireplace') return A.props.fireplace[Math.floor(t / 180) % 2];
    if (p.type === 'fountain') return A.props.fountain[Math.floor(t / 200) % 4];
    if (p.type === 'hatch') return A.props.hatch;
    return A.props[p.type] || null;
  };
  function propPos(p, spr, cam) { return { x: Math.round((p.x + p.fw / 2) * T - spr.width / 2 + (p.dx || 0) - cam.cx), y: Math.round((p.y + p.fh) * T - spr.height + (p.dy || 0) - cam.cy) }; }
  function drawShadow(g, x, y, w) { g.fillStyle = 'rgba(0,0,0,.32)'; g.fillRect(x - w / 2 + 1, y - 1, w - 2, 2); g.fillRect(x - w / 2 + 2, y - 2, w - 4, 4); }
  function renderWorld(g) {
    const a = S.area, cam = camera(a), t = now();
    g.fillStyle = '#05040a'; g.fillRect(0, 0, VW, PH);
    const tx0 = Math.max(0, Math.floor(cam.cx / T)), tx1 = Math.min(a.w - 1, Math.floor((cam.cx + VW) / T)), ty0 = Math.max(0, Math.floor(cam.cy / T)), ty1 = Math.min(a.h - 1, Math.floor((cam.cy + PH) / T));
    for (let y = ty0; y <= ty1; y++) for (let x = tx0; x <= tx1; x++) drawTile(g, a, x, y, x * T - cam.cx, y * T - cam.cy);
    a.exits.forEach(e => drawExit(g, e, cam, t));
    // floor decals, then things on the walls
    a.props.forEach(p => { if (!p.decal || p.hidden) return; const spr = A.props[p.type]; if (!spr) return; const q = propPos(p, spr, cam); g.drawImage(spr, p.type === 'rug' || p.type === 'runner' || p.type === 'stairs' ? Math.round(p.x * T + (p.dx || 0) - cam.cx) : q.x, p.type === 'rug' || p.type === 'runner' || p.type === 'stairs' ? Math.round(p.y * T - cam.cy) : q.y); });
    a.props.forEach(p => { if (p.hidden || p.decal || !(p.type === 'trapdoor' || p.type === 'hatch')) return; const spr = p.type === 'trapdoor' ? A.props.trapdoor : A.props.hatch; g.drawImage(spr, p.x * T - cam.cx, p.y * T - cam.cy); });
    a.props.forEach(p => { if (!p.wall && !p.wallDoor) return; const spr = A.props[p.type]; if (!spr) return; g.drawImage(spr, Math.round(p.x * T - cam.cx), Math.round((p.wallDoor ? (p.y + 1) * T - spr.height : p.y * T) - cam.cy)); });
    // everything that stands, back to front
    const list = [];
    a.props.forEach(p => { if (p.decal || p.wall || p.wallDoor || p.hidden || p.gone || p.type === 'trapdoor' || p.type === 'hatch') return; const spr = PROP_SPRITE(p); if (!spr) return; list.push({ y: (p.y + p.fh) * T, draw: () => { const q = propPos(p, spr, cam); g.drawImage(spr, q.x, q.y); if (p.type === 'plinth' && p.memory) g.drawImage(A.items[p.memory], q.x + 2, q.y - 2); } }); });
    a.items.forEach(it => { if (it.taken) return; const bob = Math.round(Math.sin(t / 300 + it.phase) * 1.5); list.push({ y: it.y * T + 12, draw: () => { drawShadow(g, it.x * T + 8 - cam.cx, it.y * T + 14 - cam.cy, 10); g.drawImage(A.items[it.kind] || A.items.key, it.x * T + 2 - cam.cx, it.y * T + 1 + bob - cam.cy); } }); });
    a.figures.forEach(f => { if (f.gone) return; const spr = f.look === 'scarecrow' ? A.scarecrow : A.sentinel, wob = f.wob > 0 ? Math.round(Math.sin(t / 25) * f.wob * 3) : 0;
      list.push({ y: (f.y + 1) * T, draw: () => g.drawImage(spr, f.x * T - cam.cx + wob, (f.y + 1) * T - spr.height - cam.cy) }); });
    a.crows.forEach(c => {
      if (!c.alive && c.fly > 1.6) return;
      list.push({ y: (c.y + 1) * T + 1, draw: () => {
        if (c.alive) { const hop = Math.sin(t / 900 + c.hop) > .92 ? -1 : 0; g.drawImage(A.crow[0], c.x * T - cam.cx, c.y * T - 9 + hop - cam.cy); }
        else { const k = c.fly; g.globalAlpha = Math.max(0, 1 - k / 1.6); g.drawImage(A.crow[Math.floor(t / 90) % 2], Math.round(c.x * T + c.vx * k * 40 - cam.cx), Math.round(c.y * T - 9 - k * 60 - cam.cy)); g.globalAlpha = 1; }
      } });
    });
    a.enemies.forEach(e => {
      if (e.state === 'dormant' && !(a.dark || S.blackout)) { /* drawn: standing still in the dark corner */ }
      if (e.dead && e.fall >= 1) return;
      list.push({ y: e.py, draw: () => {
        const blink = e.stun > 0 && Math.floor(t / 60) % 2, frame = Math.floor((e.t || 0) * 4) % 2;
        if (e.dead) g.globalAlpha = 1 - e.fall; else if (blink) g.globalAlpha = .55;
        if (e.type === 'guardian') { drawShadow(g, e.px - cam.cx, e.py - cam.cy, 26); g.drawImage(A.guardian, Math.round(e.px - 16 - cam.cx), Math.round(e.py - 31 + (e.moving ? frame : 0) - cam.cy)); }
        else if (e.type === 'knight') { drawShadow(g, e.px - cam.cx, e.py - cam.cy, 12); g.drawImage(A.sentinel, Math.round(e.px - 8 - cam.cx), Math.round(e.py - 23 - (e.moving ? frame : 0) - cam.cy)); }
        else { drawShadow(g, e.px - cam.cx, e.py - cam.cy, 10); g.drawImage((e.type === 'gardener' ? A.gardener : A.ghoul)[e.moving ? frame : 0], Math.round(e.px - 8 - cam.cx), Math.round(e.py - 15 - cam.cy)); }
        g.globalAlpha = 1;
      } });
    });
    if (S.follower && S.follower.area === a.id) { const f = S.follower; list.push({ y: f.y, draw: () => { drawShadow(g, f.x - cam.cx, f.y - cam.cy, 10); g.drawImage(A.locke[f.face] || A.locke.down, Math.round(f.x - 8 - cam.cx), Math.round(f.y - 15 - (f.moving ? Math.floor(t / 120) % 2 : 0) - cam.cy)); } }); }
    list.push({ y: H.y, draw: () => drawHero(g, cam, t) });
    if (S.wisp) { const w = S.wisp; list.push({ y: w.y * T, draw: () => { if (w.phase === 'gone') return; const x = w.x * T - cam.cx, y = w.y * T - 12 - cam.cy + Math.sin(t / 200) * 1.5; g.fillStyle = 'rgba(255,200,90,.35)'; g.fillRect(Math.round(x) - 3, Math.round(y) - 3, 7, 7); g.fillStyle = '#ffe08a'; g.fillRect(Math.round(x) - 2, Math.round(y) - 2, 5, 5); g.fillStyle = '#fffbe0'; g.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2); } }); }
    list.sort((p, q) => p.y - q.y).forEach(o => o.draw());
    drawFx(g, cam, t);
    renderLight(g, a, cam, t);
    // sentinel eyes glow through the dark; the live ones pulse at the staircased contrast
    a.figures.forEach(f => {
      if (f.gone) return;
      const k = f.type === 'sleeper' ? 1 + 7 * f.contrast * Math.sin(2 * Math.PI * t / 1700 + f.phase) : 1;
      g.fillStyle = `rgb(${Math.round(clamp(118 * k, 0, 255))},${Math.round(clamp(26 * k, 0, 255))},${Math.round(clamp(22 * k, 0, 255))})`;
      const wob = f.wob > 0 ? Math.round(Math.sin(t / 25) * f.wob * 3) : 0, sy = (f.y + 1) * T - 24 - cam.cy, ex = f.x * T - cam.cx + wob;
      if (f.look === 'scarecrow') { g.fillRect(ex + 6, sy + 2, 1, 2); g.fillRect(ex + 9, sy + 2, 1, 2); } else g.fillRect(ex + 6, sy + 4, 4, 1);   // the whole visor slit glows
    });
    a.enemies.forEach(e => { if (e.dead || e.type === 'guardian' || e.state === 'dormant') return; if (e.type === 'knight') { g.fillStyle = '#ff3a2a'; const y = Math.round(e.py - 23 - cam.cy + 4); g.fillRect(Math.round(e.px - 8 - cam.cx) + 6, y, 1, 1); g.fillRect(Math.round(e.px - 8 - cam.cx) + 9, y, 1, 1); } });
    if (a.id === 'grounds') drawRain(g, t);
    if (S.trans && S.trans.kind === 'fade') { const tr = S.trans, p = tr.t < tr.dur / 2 ? tr.t / (tr.dur / 2) : 1 - (tr.t - tr.dur / 2) / (tr.dur / 2); g.fillStyle = tr.veil ? `rgba(40,30,70,${p.toFixed(3)})` : `rgba(0,0,0,${p.toFixed(3)})`; g.fillRect(0, 0, VW, PH); }
  }
  function drawHero(g, cam, t) {
    if (!S.running && !S.trans) return;
    if (H.inv > 0 && Math.floor(t / 70) % 2) return;
    const x = Math.round(H.x - 8 - cam.cx), y = Math.round(H.y - 14 - cam.cy), fr = H.moving ? 1 + (Math.floor(H.walk) % 2) : 0;
    drawShadow(g, H.x - cam.cx, H.y + 1 - cam.cy, 10);
    const spr = A.hero[H.face][fr];
    const bob = H.moving && fr === 1 ? -1 : 0;
    if (H.atk > 0) drawSword(g, x, y, H.face, 1 - H.atk / .24);
    g.drawImage(spr, x, y + bob);
    // the lantern in the off hand
    if (!S.blackout && !S.lanternOff) { const lx = H.face === 'left' ? x + 2 : H.face === 'right' ? x + 12 : H.face === 'up' ? x + 2 : x + 13, ly = y + 10 + bob; g.fillStyle = '#3a2a1a'; g.fillRect(lx, ly, 3, 4); g.fillStyle = Math.random() < .1 ? '#fff0b0' : '#ffd060'; g.fillRect(lx + 1, ly + 1, 1, 2); }
  }
  function drawSword(g, x, y, face, p) {
    const blade = '#dfe4ee', edge = '#8a90a0', hilt = '#c8a040';
    g.fillStyle = blade;
    if (face === 'right') { g.fillRect(x + 12, y + 9, 12, 2); g.fillStyle = edge; g.fillRect(x + 12, y + 10, 12, 1); g.fillStyle = hilt; g.fillRect(x + 11, y + 7, 2, 6); }
    else if (face === 'left') { g.fillRect(x - 8, y + 9, 12, 2); g.fillStyle = edge; g.fillRect(x - 8, y + 10, 12, 1); g.fillStyle = hilt; g.fillRect(x + 3, y + 7, 2, 6); }
    else if (face === 'up') { g.fillRect(x + 3, y - 9, 2, 12); g.fillStyle = edge; g.fillRect(x + 4, y - 9, 1, 12); g.fillStyle = hilt; g.fillRect(x + 1, y + 2, 6, 2); }
    else { g.fillRect(x + 11, y + 13, 2, 12); g.fillStyle = edge; g.fillRect(x + 12, y + 13, 1, 12); g.fillStyle = hilt; g.fillRect(x + 9, y + 12, 6, 2); }
  }
  function drawFx(g, cam, t) {
    S.fx.forEach(f => {
      const p = f.t / f.dur;
      if (f.type === 'slash') {
        const cx = H.x - cam.cx, cy = H.y - 7 - cam.cy, base = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[f.face];
        g.fillStyle = `rgba(240,244,255,${(.7 * (1 - p)).toFixed(2)})`;
        for (let k = 0; k < 9; k++) { const a = base - 1.1 + 2.2 * Math.min(1, p * 1.6) * k / 8, r = 15 + (k % 2); g.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 2, 2); }
      } else if (f.type === 'spark') { g.fillStyle = '#fff2b0'; const x = Math.round(f.x - cam.cx), y = Math.round(f.y - cam.cy), r = Math.round(2 + p * 5); g.fillRect(x - r, y, r * 2 + 1, 1); g.fillRect(x, y - r, 1, r * 2 + 1); }
      else if (f.type === 'puff') { g.fillStyle = `rgba(150,140,160,${(1 - p).toFixed(2)})`; for (let k = 0; k < 8; k++) { const a = k * .785, r = 3 + p * 12; g.fillRect(Math.round(f.x - cam.cx + Math.cos(a) * r), Math.round(f.y - cam.cy + Math.sin(a) * r * .6), 3, 3); } }
    });
  }
  function drawRain(g, t) { g.fillStyle = 'rgba(160,180,220,.35)'; for (let i = 0; i < 48; i++) { const x = (i * 97 + t * .18) % (VW + 40) - 20, y = (i * 53 + t * .45) % (PH + 20) - 10; g.fillRect(Math.round(x), Math.round(y), 1, 3); g.fillRect(Math.round(x) - 1, Math.round(y) + 3, 1, 2); } }
  function renderLight(g, a, cam, t) {
    const amb = S.blackout ? 1 : a.dark ? (S.lanternOff ? .985 : .955) : a.amb;
    LG.globalCompositeOperation = 'source-over'; LG.clearRect(0, 0, VW, PH);
    // in a blackout nothing outside the light may show at all: a faint silhouette would be a landmark
    LG.globalAlpha = amb; LG.fillStyle = S.blackout ? '#000' : a.tint || '#06040c'; LG.fillRect(0, 0, VW, PH); LG.globalAlpha = 1;
    LG.globalCompositeOperation = 'destination-out';
    // stepped rings in the dark, the way old hardware faked light; a soft falloff in lit rooms
    const stepped = amb > .8;
    const punch = (x, y, r, k) => {
      if (stepped) { [[1, .34], [.76, .36], [.52, .42], [.3, .5]].forEach(([f, al]) => { LG.globalAlpha = al * k; LG.beginPath(); LG.arc(Math.round(x), Math.round(y), Math.max(1, r * f), 0, 7); LG.fill(); }); LG.globalAlpha = 1; return; }
      const gr = LG.createRadialGradient(x, y, 0, x, y, Math.max(1, r)); gr.addColorStop(0, `rgba(0,0,0,${.92 * k})`); gr.addColorStop(.55, `rgba(0,0,0,${.6 * k})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
      LG.fillStyle = gr; LG.fillRect(x - r, y - r, r * 2, r * 2); LG.fillStyle = '#000';
    };
    LG.fillStyle = '#000';
    const glows = [];
    if (!S.blackout) a.lights.forEach(l => { const fl = l.flicker === 'fire' ? .9 + Math.random() * .16 : l.flicker === 'candle' ? 1 + Math.sin(t / 130 + l.x) * .03 + Math.sin(t / 57) * .02 : 1; const x = l.x * T - cam.cx, y = l.y * T - cam.cy; punch(x, y, l.r * fl, 1); glows.push([x, y, l.r * fl, l.color]); });
    const hr = lanternRadius() * (1 + Math.sin(t / 90) * .02);
    punch(H.x - cam.cx, H.y - 8 - cam.cy, hr, 1);
    if (S.wisp && S.wisp.phase !== 'gone') { const x = S.wisp.x * T - cam.cx, y = S.wisp.y * T - 12 - cam.cy; punch(x, y, 30, 1); glows.push([x, y, 26, '#ffc060']); }
    S.fx.forEach(f => { if (f.type === 'match') { const k = f.t < .2 ? f.t / .2 : 1 - (f.t - .2) / (f.dur - .2); punch(H.x - cam.cx, H.y - 8 - cam.cy, 60 * k, 1); glows.push([H.x - cam.cx, H.y - 8 - cam.cy, 50 * k, '#ffb040']); } });
    if (S.follower && S.follower.area === a.id) punch(S.follower.x - cam.cx, S.follower.y - 8 - cam.cy, 22, .6);
    g.drawImage(lightC, 0, 0);
    // a little warm colour where the light falls
    g.globalCompositeOperation = 'lighter';
    glows.forEach(([x, y, r, col]) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, hexA(col, .14)); gr.addColorStop(1, hexA(col, 0)); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); });
    g.globalCompositeOperation = 'source-over';
    S.fx.forEach(f => { if (f.type === 'flash') { g.fillStyle = `rgba(200,30,30,${(.35 * (1 - f.t / f.dur)).toFixed(2)})`; g.fillRect(0, 0, VW, PH); } });
  }
  const hexA = (h, a) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const HEART = ['.rr.rr.', 'rRrrrrr', 'rrrrrrr', '.rrrrr.', '..rrr..', '...r...'];
  function drawHeart(g, x, y, fill) {
    HEART.forEach((row, j) => { for (let i = 0; i < row.length; i++) { if (row[i] === '.') continue; const on = fill === 2 || (fill === 1 && i < 4); g.fillStyle = on ? (row[i] === 'R' ? '#ff9a8a' : '#d8302c') : '#3a1a20'; g.fillRect(x + i, y + j, 1, 1); } });
  }
  const INV_ORDER = ['medallion', 'brass', 'glove', 'music', 'locket', 'rose0', 'rose1', 'rose2', 'hatchkey', 'dance', 'ring', 'lily', 'score', 'rattle', 'letter'];
  const INV_ICON = { brass: 'key', music: 'musicbox', rose0: 'rose', rose1: 'rose', rose2: 'rose' };
  function drawHud(g) {
    if (!S.log) { g.fillStyle = '#0b0812'; g.fillRect(0, 0, VW, HUD); return; }
    g.fillStyle = '#0b0812'; g.fillRect(0, 0, VW, HUD); g.fillStyle = '#2a2018'; g.fillRect(0, HUD - 3, VW, 1); g.fillStyle = '#c89a3a'; g.fillRect(0, HUD - 2, VW, 1); g.fillStyle = '#5a4424'; g.fillRect(0, HUD - 1, VW, 1);
    for (let i = 0; i < 3; i++) drawHeart(g, 8 + i * 10, 12, H.hp >= 2 * (i + 1) ? 2 : H.hp === 2 * i + 1 ? 1 : 0);
    let x = 48; INV_ORDER.forEach(k => { if (!S.inv[k]) return; g.fillStyle = '#16111e'; g.fillRect(x - 1, 8, 14, 14); g.drawImage(A.items[INV_ICON[k] || k], x, 9); x += 15; });
  }
  function render() {
    G.imageSmoothingEnabled = false;
    drawHud(G);
    G.save(); G.beginPath(); G.rect(0, HUD, VW, PH); G.clip();
    if (S.trans && S.trans.kind === 'slide') {
      const p = Math.min(1, S.trans.t / S.trans.dur), e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2, d = { N: [0, 1], S: [0, -1], W: [1, 0], E: [-1, 0] }[S.trans.dir];
      G.drawImage(prevC, Math.round(d[0] * e * VW), HUD + Math.round(d[1] * e * PH)); G.drawImage(nextC, Math.round((d[0] * e - d[0]) * VW), HUD + Math.round((d[1] * e - d[1]) * PH));
    } else { G.translate(0, HUD); renderWorld(G); }
    G.restore();
  }
  function hud() { /* the HUD is redrawn every frame; kept for parity with the 3D engine's call sites */ }
  function updatePrompt() {
    const el = $('#prompt'), o = S.running && !S.paused && !dlg.open && !S.trans && !S.mapOpen ? focus() : null;
    if (o) { el.textContent = (TOUCH ? 'Use · ' : 'E · ') + o.label; el.classList.add('on'); } else el.classList.remove('on');
  }

  /* ---------- Locke's plan ---------- */
  function openMap() {
    const plan = S.spec.plan; if (!plan) return;
    S.mapOpen = { t0: now() }; $('#mapView').hidden = false; $('#mapTitle').textContent = plan.title; $('#mapNote').textContent = plan.note || '';
    drawPlan(plan); sfx('blip', .6);
  }
  function closeMap() { if (!S.mapOpen) return; S.log.mapViews.push({ t: +((S.mapOpen.t0 - S.t0) / 1000).toFixed(1), dur: +((now() - S.mapOpen.t0) / 1000).toFixed(1), changed: S.changedOnce }); logEvent('plan', S.log.mapViews[S.log.mapViews.length - 1]); S.mapOpen = null; $('#mapView').hidden = true; }
  function drawPlan(plan) {
    const cv = $('#mapCv'), g = cv.getContext('2d'), Wd = cv.width, Hd = cv.height, ink = '#3a2a1c', faint = 'rgba(58,42,28,.35)';
    g.fillStyle = '#e6d8b8'; g.fillRect(0, 0, Wd, Hd);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(120,90,50,${Math.random() * .06})`; g.fillRect(Math.random() * Wd, Math.random() * Hd, 2, 2); }
    g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'square'; g.textAlign = 'center'; g.font = '15px "Pixelify Sans", ui-monospace, monospace';
    if (plan.type === 'rooms') {
      const cw = (Wd - 60) / plan.GW, ch = (Hd - 60) / plan.GH, ox = 30, oy = 30;
      plan.rooms.forEach(rm => {
        const x = ox + rm.x * cw, y = oy + rm.y * ch, a = S.areas[rm.id];
        g.lineWidth = 3; g.strokeRect(x + 8, y + 8, cw - 16, ch - 16);
        g.fillText(rm.name, x + cw / 2, y + ch / 2 + 4);
        a.exits.forEach(e => { if (e.plan !== 'door') return; g.fillStyle = '#e6d8b8';
          if (e.side === 'N') g.fillRect(x + cw / 2 - 12, y + 5, 24, 7); if (e.side === 'S') g.fillRect(x + cw / 2 - 12, y + ch - 12, 24, 7);
          if (e.side === 'W') g.fillRect(x + 5, y + ch / 2 - 12, 7, 24); if (e.side === 'E') g.fillRect(x + cw - 12, y + ch / 2 - 12, 7, 24); g.fillStyle = ink; });
        if (S.area.id === rm.id) { g.beginPath(); g.arc(x + cw / 2, y + ch / 2 + 22, 5, 0, 7); g.fill(); g.font = '11px "Pixelify Sans", ui-monospace, monospace'; g.fillText('you are here', x + cw / 2, y + ch / 2 + 40); g.font = '15px "Pixelify Sans", ui-monospace, monospace'; }
      });
    } else if (plan.type === 'tiles') {
      const a = S.areas[plan.area], gw = plan.grid[0].length, gh = plan.grid.length, s = Math.min((Wd - 40) / gw, (Hd - 50) / gh), ox = (Wd - gw * s) / 2, oy = 34;
      for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const c = plan.grid[y][x]; if (c === 'H') { g.fillStyle = 'rgba(48,70,40,.85)'; g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s)); } }
      a.exits.forEach(e => { g.fillStyle = '#e6d8b8'; e.tiles.forEach(([x, y]) => g.fillRect(ox + x * s, oy + y * s, Math.ceil(s), Math.ceil(s))); });
      g.fillStyle = ink; g.font = 'bold 13px "Pixelify Sans", ui-monospace, monospace';
      plan.labels.forEach(([n, x, y]) => { g.fillStyle = 'rgba(230,216,184,.85)'; const w = g.measureText(n).width + 8; g.fillRect(ox + x * s - w / 2, oy + y * s - 11, w, 15); g.fillStyle = ink; g.fillText(n, ox + x * s, oy + y * s); });
    } else if (plan.type === 'palace') {
      const x0 = 110, y0 = 120, w = Wd - 220, h = Hd - 220;
      g.lineWidth = 3; g.strokeRect(x0, y0, w, h); g.fillText('Rotunda', x0 + w / 2, y0 + h / 2 + 5);
      const vx = [x0 + w * .2, x0 + w * .5, x0 + w * .8];
      plan.labels.forEach((n, i) => { const top = i < 3, x = top ? vx[i] : vx[5 - i], y = top ? y0 : y0 + h; g.fillStyle = '#e6d8b8'; g.fillRect(x - 16, y - 4, 32, 8); g.fillStyle = ink; g.fillText(n, x, top ? y - 14 : y + 26); g.strokeStyle = faint; g.beginPath(); g.moveTo(x, y + (top ? 6 : -6)); g.lineTo(x, y + (top ? 20 : -20)); g.stroke(); g.strokeStyle = ink; });
      g.fillStyle = '#e6d8b8'; g.fillRect(x0 - 4, y0 + h / 2 - 14, 8, 28); g.fillRect(x0 + w - 4, y0 + h / 2 - 14, 8, 28); g.fillStyle = ink;
      g.textAlign = 'right'; g.fillText("Locke's Study", x0 - 12, y0 + h / 2 + 5); g.textAlign = 'left'; g.fillText('Stair', x0 + w + 12, y0 + h / 2 + 5); g.textAlign = 'center';
    }
  }
  $('#mapClose').onclick = closeMap;

  /* ---------- the model-estimates overlay ---------- */
  const LAB_ROWS = {
    lantern: [['acc', 'Accum. noise', v => v.toFixed(2)], ['rep', 'Report noise', v => v.toFixed(2)], ['gain', 'Gain', v => v.toFixed(2)], ['leak', 'Leak /m', v => v.toFixed(3)], ['bias', 'Turn bias °', v => v.toFixed(0)]],
    palace: [['rho', 'Rule inference', v => v.toFixed(2)], ['alpha', 'Local update', v => v.toFixed(2)], ['m', 'Link memory', v => v.toFixed(2)]],
  };
  let labOn = null, labLast = 0;
  function labIsOn() { if (labOn === null) labOn = location.hash === '#lab' || store.get('palace16.lab', false); return labOn; }
  function labToggle(v) { labOn = v == null ? !labIsOn() : v; store.set('palace16.lab', labOn); $('#lab').hidden = !labOn || !S.running; labRender(true); }
  function labRender(force) {
    if (!labIsOn() || !S.running) { $('#lab').hidden = true; return; }
    const t = now(); if (!force && t - labLast < 1000) return; labLast = t;
    $('#lab').hidden = false;
    const st = adoState(), cv = $('#labCv'), d = window.devicePixelRatio || 1, Wd = 296, rowH = 36, secH = 22, sparkH = 34;
    const Hd = secH * 2 + rowH * (LAB_ROWS.lantern.length + LAB_ROWS.palace.length) + (sparkH + 14) * 2 + 6;
    if (cv.width !== Wd * d || cv.height !== Hd * d) { cv.width = Wd * d; cv.height = Hd * d; cv.style.height = Hd + 'px'; }
    const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, Wd, Hd);
    const gold = '#e0b04a', dim = '#6d5530', muted = '#9a8fa8', paper = '#e8dcc0', font = '12px "Pixelify Sans", ui-monospace, monospace';
    let y = 0;
    const section = (title, model) => {
      g.fillStyle = gold; g.font = '13px "Pixelify Sans", ui-monospace, monospace'; g.fillText(title, 0, y + 14);
      g.fillStyle = muted; g.font = font; g.textAlign = 'right'; g.fillText(`${S.adoN[model]} trial${S.adoN[model] === 1 ? '' : 's'} today`, Wd, y + 14); g.textAlign = 'left';
      y += secH;
      const M = ADO.marginals(st[model]), P = S.adoPrior[model], sm = ADO.summary(st[model]);
      LAB_ROWS[model].forEach(([key, label, fmt]) => {
        const m = M[key], pr = P[key], n = m.vals.length, cw = Wd / n, bh = rowH - 17, maxp = Math.max(...m.p, ...pr.p, 1e-6), s = sm[key], base = y + rowH - 3;
        g.fillStyle = muted; g.font = font; g.fillText(label, 0, y + 10);
        g.fillStyle = paper; g.textAlign = 'right'; g.fillText(`${fmt(s.mean)}  80%: ${fmt(s.lo)} to ${fmt(s.hi)}`, Wd, y + 10); g.textAlign = 'left';
        for (let k = 0; k < n; k++) {
          const inInt = m.vals[k] >= s.lo && m.vals[k] <= s.hi, h = Math.max(1, (m.p[k] / maxp) * bh), hp = (pr.p[k] / maxp) * bh;
          g.fillStyle = inInt ? gold : dim; g.fillRect(k * cw + 1.5, base - h, cw - 3, h);
          g.strokeStyle = 'rgba(232,220,192,.45)'; g.lineWidth = 1; g.strokeRect(k * cw + 2, base - hp, cw - 4, hp);
        }
        y += rowH;
      });
    };
    const spark = (model, label) => {
      const h = S.adoHist[model], h0 = h[0], gained = h0 - h[h.length - 1];
      g.fillStyle = muted; g.font = font; g.fillText(label, 0, y + 10);
      g.fillStyle = paper; g.textAlign = 'right'; g.fillText(`${gained.toFixed(1)} bits learned`, Wd, y + 10); g.textAlign = 'left';
      const top = y + 14, ht = sparkH - 4, lo = Math.min(...h) - .2, hi = h0 + .2;
      g.strokeStyle = '#3a3044'; g.beginPath(); g.moveTo(0, top + ht); g.lineTo(Wd, top + ht); g.stroke();
      if (h.length > 1) {
        g.strokeStyle = gold; g.lineWidth = 1.5; g.beginPath();
        h.forEach((v, i) => { const X = (i / Math.max(1, h.length - 1)) * Wd, Y = top + (1 - (v - lo) / (hi - lo)) * ht; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.stroke();
        const v = h[h.length - 1]; g.fillStyle = gold; g.beginPath(); g.arc(Wd, top + (1 - (v - lo) / (hi - lo)) * ht, 2.5, 0, 7); g.fill();
      } else { g.fillStyle = muted; g.fillText('no trials yet', 0, top + ht - 4); }
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
    const c = S.log, m = c.motor, F = c.figures, aims = c.shots.map(s => s.aimErr).filter(v => v != null), J = c.junctions;
    const rows = [
      ['Chapter', TITLE[S.spec.id] || S.spec.id],
      ['Walking speed (straight)', m.straightT > 2 ? (m.straightD / m.straightT).toFixed(2) + ' m/s' : '—'],
      ['Wall bumps', m.dist > 10 ? (10 * m.scrapes / m.dist).toFixed(1) + ' /10 m' : '—'],
      ['Swing offset (median)', aims.length ? median(aims).toFixed(2) + ' m' : '—'],
      ['Sentinels correct', F.length ? `${F.filter(f => f.correct).length}/${F.length}` : '—'],
      ['Eye-pulse contrast scale', calib().contrastScale.toFixed(2)],
      ['Route choices optimal', J.length ? `${J.filter(j => j.optimal).length}/${J.length}` : '—'],
      ['Bricked-doorway bumps', String(c.staleBumps || 0)],
      ['Closure revisits', `${c.closureRevisits || 0}/${c.closureFinds || 0}`],
    ];
    $('#labLive').innerHTML = rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('');
    $('#labMeta').textContent = `session ${new Date(S.session.startedAt).toLocaleDateString()}`;
  }
  $('#labBtn').addEventListener('click', () => labToggle());

  /* ---------- session notes ---------- */
  function summarize(c) {
    const J = c.junctions, Jpost = J.filter(j => j.changed), Jconf = J.filter(j => j.conflict && j.changed);
    const F = c.figures, V = c.events.filter(e => e.name === 'veil' && e.carrying), Hm = c.homing, m = c.motor, aims = c.shots.map(s => s.aimErr).filter(v => v != null);
    const rows = [
      ['Time and distance', `${((c.duration || 0) / 60).toFixed(1)} min · ${Math.round(m.dist)} m`, 'Gross efficiency. Mostly reflects comfort with the controls, so it is a covariate, not a score.'],
      ['Walking speed on straight runs', m.straightT > 2 ? (m.straightD / m.straightT).toFixed(2) + ' m/s' : '—', 'Motor calibration: how fast you move when there is nothing to decide.'],
      ['Wall bumps', m.dist > 10 ? (10 * m.scrapes / m.dist).toFixed(1) + ' per 10 m' : '—', 'Control precision, kept separate from route choices.'],
      ['Sword', aims.length ? `${median(aims).toFixed(2)} m median offset · ${c.hits} hits from ${c.swings} swings` : `${c.hits} hits from ${c.swings} swings`, 'Timing and lining up a strike. A covariate.'],
      ['Plan readings', `${c.mapViews.length} · ${Math.round(c.mapViews.reduce((s, v) => s + v.dur, 0))} s`, `${c.mapViews.filter(v => v.changed).length} after the house changed, when the plan no longer matched.`],
    ];
    if (c.ado && (c.id === 'conservatory' || c.id === 'palace')) {
      const f = (o, d) => `${o.mean.toFixed(d)} (${o.lo}–${o.hi})`;
      if (c.id === 'conservatory') { const l = c.ado.lantern; rows.push(['Model: path integration', `noise ${f(l.acc, 2)}`, `Accumulating noise per √m, with an 80% interval. Reporting noise ${f(l.rep, 2)}, gain ${f(l.gain, 2)}, leak ${f(l.leak, 3)}, turning bias ${f(l.bias, 0)}°. With the view fixed north-up, turning bias should sit near zero.`]); }
      if (c.id === 'palace') { const q = c.ado.palace; rows.push(['Model: integrating a glimpse', `inference ${f(q.rho, 2)}`, `Probability of working out the whole rearrangement from one glimpse. Local updating ${f(q.alpha, 2)}, memory for unchanged links ${f(q.m, 2)}.`]); }
    }
    if (c.id === 'grounds') rows.unshift(['Warm-up', 'not scored', 'Calibrates movement and the sword for this session, so the chapters measure decisions rather than controls.']);
    if (J.length) rows.push(['Route choices at junctions', `${pct(J.filter(j => j.optimal).length, J.length)} optimal of ${J.length}`, Jpost.length ? `After the change: ${pct(Jpost.filter(j => j.optimal).length, Jpost.length)} optimal. Where the plan and the house disagreed, you followed the old plan ${pct(Jconf.filter(j => j.planOptimal).length, Jconf.length)} of the time (${Jconf.length} choices).` : 'Choices are scored against the true layout and against the plan.']);
    if (c.staleBumps) rows.push(['Walked into a way that used to be open', String(c.staleBumps), 'A bricked-up doorway or a regrown hedge where the plan still shows a way through.']);
    if (c.closureFinds) rows.push(['Went back to a closure you had found', `${c.closureRevisits || 0} of ${c.closureFinds}`, 'Returning, later, to a passage you had already found shut. Perseveration on the old map.']);
    const IG = c.events.filter(e => e.name === 'integrate'), ig = k => IG.filter(e => e.kind === k);
    if (IG.length) rows.push(['First choice after a glimpse', `swap ${pct(ig('swap').filter(e => e.cls === 'correct').length, ig('swap').length)} · rotation ${pct(ig('rotate').filter(e => e.cls === 'correct').length, ig('rotate').length)} · none ${pct(ig('none').filter(e => e.cls === 'correct').length, ig('none').length)}`,
      `After stepping out of a room you see one new link. Choices back to where the room used to be: ${pct(IG.filter(e => e.cls === 'stale').length, IG.filter(e => e.kind !== 'none').length)}.`]);
    if (F.length) { const rts = F.filter(f => f.rt != null).map(f => f.rt); rows.push(['Sentinels', `${pct(F.filter(f => f.correct).length, F.length)} correct of ${F.length}`, `Strike or walk past. Median time from first seeing one to deciding: ${rts.length ? median(rts).toFixed(1) + ' s' : '—'}.`]); }
    const HL = Hm.filter(h => h.kind === 'lantern'), HF = Hm.filter(h => h.kind !== 'lantern');
    if (HL.length) rows.push(['Following the lantern', `${median(HL.map(h => h.err)).toFixed(1)} m median error`, `${HL.length} return${HL.length === 1 ? '' : 's'} in the dark after outbound paths of ${HL.map(h => h.length.toFixed(0)).join(', ')} m.`]);
    if (HF.length) rows.push(['Finding your way in the dark', `${HF[0].err.toFixed(1)} m off`, `You walked ${HF[0].walked.toFixed(0)} m to get there.`]);
    const LG2 = c.legs || [], lt = LG2.find(l => l.leg === 'transition'), lr = LG2.find(l => l.leg === 'reward');
    if (lt && lr && lt.efficiency && lr.efficiency) rows.push(['Map change vs goal change', `${lt.efficiency.toFixed(2)} vs ${lr.efficiency.toFixed(2)}`, 'Distance walked relative to the shortest route, after the hedges regrew (the map changed) and on the way to the key (only the goal changed).']);
    const le = LG2.find(l => l.leg === 'errand'), lrt = LG2.find(l => l.leg === 'return');
    if (le && le.efficiency) rows.push(['After the Architect moved the doors', `${le.efficiency.toFixed(2)}${lrt && lrt.efficiency ? ' then ' + lrt.efficiency.toFixed(2) : ''}`, 'Distance walked relative to the shortest true route, to the memento and back to the trapdoor.']);
    if (V.length) { const st = V.filter(v => v.stale != null); rows.push(['Veil choices while carrying a memory', `${pct(V.filter(v => v.veil === v.correct).length, V.length)} correct of ${V.length}`, `Chose where the room used to be ${pct(st.filter(v => v.veil === v.stale && v.stale !== v.correct).length, st.length)} of the time after a reshuffle.`]); }
    return rows;
  }
  function notes() {
    saveSession();
    const ch = S.session.chapters.filter(c => c.duration != null || c === S.log);
    const html = ch.map(c => `<h2>${TITLE[c.id] || c.id}</h2>` + summarize(c).map(([k, v, m]) => `<div class="row"><span class="k">${k}</span><span class="v">${v}</span><span class="m">${m}</span></div>`).join('')).join('');
    showScreen('end', `<div id="notes"><h1>Session notes</h1><p class="muted">Recorded silently while you played. Single sessions are noisy; change across sessions is the point.</p>${html}
      <div class="notes-actions"><button class="btn" id="copyData">Copy session data</button> <button class="btn small" id="back">Back</button></div>
      <textarea id="dataBox" hidden readonly></textarea></div>`, () => {
      $('#copyData').onclick = () => { const txt = JSON.stringify(S.session), box = $('#dataBox'); const fallback = () => { box.hidden = false; box.value = txt; box.select(); $('#copyData').textContent = 'Select and copy below'; };
        try { navigator.clipboard.writeText(txt).then(() => $('#copyData').textContent = 'Copied', fallback); } catch (e) { fallback(); } };
      $('#back').onclick = showChapterCard;
    });
  }

  /* ---------- what the score is allowed to know ---------- */
  // Only threats the player can already perceive. Sentinels are not enemies until they move, so they never touch the music.
  function audioFrame(dt) {
    if (!S.spec || !S.area) return;
    let threat = 0;
    S.area.enemies.forEach(e => { if (e.dead || e.state === 'dormant') return; const d = Math.hypot(H.x - e.px, H.y - e.py) / T;
      if (e.state === 'chase') threat = Math.max(threat, 1 - .6 * Math.min(1, d / 12)); else if (d < 7 && los(S.area, H.x, H.y - 6, e.px, e.py - 6)) threat = Math.max(threat, .45 * (1 - d / 7)); });
    SND.update({ dt, x: H.x / T, z: H.y / T, yaw: 0, threat, dark: S.blackout || S.area.dark, safe: S.running && S.spec.safe.includes(S.area.id), hp: H.hp / 2, blind: !!(S.homing || S.wisp), running: S.running && !S.paused });
  }

  /* ---------- loop ---------- */
  let last = now();
  function loop() {
    requestAnimationFrame(loop);
    const t = now(), dt = Math.min(.05, (t - last) / 1000); last = t;
    updateDialog(dt);
    if (S.spec) {
      if (S.trans) updateTrans(dt);
      else if (S.running && !S.paused && !dlg.open && !S.mapOpen) {
        const before = heroTile().join();
        updateHero(dt, t); updateEnemies(dt); updateFigures(dt, t); updateCrows(dt); updateFollower(dt); updateWisp(dt);
        const ht = heroTile(), e = exitAt(S.area, ht[0], ht[1]);
        if (e && e.state === 'open') goExit(e);
        else if (ht.join() !== before) { checkLeg(); if (S.hooks.onTile) S.hooks.onTile(S.area, ht[0], ht[1]); }
        updateMazeJunction(); updateClosures(t);
        if (t - (S.lastPath || 0) > 200) { S.lastPath = t; S.log.path.push([+((t - S.t0) / 1000).toFixed(1), S.area.id, +(H.x / T).toFixed(2), +(H.y / T).toFixed(2)]); }
      }
      S.fx = S.fx.filter(f => (f.t += dt) < f.dur);
      render();
      audioFrame(dt);
      updatePrompt();
      if (labOn) labRender(false);
    }
  }

  /* ---------- touch ---------- */
  function touchSetup() {
    const base = $('#joy'), knob = $('#knob'); let id = null, ox = 0, oy = 0;
    base.addEventListener('pointerdown', e => { id = e.pointerId; const r = base.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; base.setPointerCapture(id); move(e); });
    const move = e => { if (e.pointerId !== id) return; let dx = e.clientX - ox, dy = e.clientY - oy; const m = Math.hypot(dx, dy), max = 40; if (m > max) { dx *= max / m; dy *= max / m; } knob.style.transform = `translate(${dx}px,${dy}px)`; joy = { x: dx / max, y: dy / max, on: true }; };
    base.addEventListener('pointermove', move);
    const end = e => { if (e.pointerId !== id) return; id = null; joy = { x: 0, y: 0, on: false }; knob.style.transform = ''; };
    base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end);
    $('#tA').addEventListener('pointerdown', e => { e.preventDefault(); onKey('Space'); });
    $('#tB').addEventListener('pointerdown', e => { e.preventDefault(); onKey('KeyE'); });
    $('#dialog').addEventListener('pointerdown', () => advanceDialog());
  }

  /* ---------- boot ---------- */
  function resize() {
    const stage = $('#stage'), w = innerWidth - 32, h = innerHeight - (TOUCH ? 160 : 0);
    let s = Math.min(w / VW, Math.max(140, h) / VH); if (s >= 2) s = Math.floor(s);
    stage.style.width = Math.floor(VW * s) + 'px'; stage.style.height = Math.floor(VH * s) + 'px';
    document.documentElement.style.setProperty('--px', s.toFixed(3));
  }
  function musicLabel() { const b = $('#musicBtn'); if (b) b.textContent = SND.musicOn ? 'Music: on' : 'Music: off'; }
  function boot() {
    addEventListener('resize', resize); resize();
    // the title backdrop: the drive at night, in the rain
    const bd = W.prologue(Math.floor(Math.random() * 1e6));
    S.spec = bd; S.areas = bd.areas; S.area = bd.areas.grounds; S.exitById = {};
    Object.values(bd.areas).forEach(a => { a._exitAt = {}; a.crows.forEach(c => Object.assign(c, { alive: true, fly: 0, hop: R(0, 4) })); a.enemies.forEach(e => initEnemy(e, a)); a.figures.forEach(f => Object.assign(f, { phase: 0, wob: 0 })); rebuildBlk(a); });
    H.x = 12 * T; H.y = 9 * T;
    const prog = store.get('palace16.progress', { unlocked: 1 });
    $('#chapters').innerHTML = [0, 1, 2].map(i => `<button class="btn small" data-ch="${i}" ${i < prog.unlocked ? '' : 'disabled'}>${CH_NAMES[i]}: ${W.generate(i, 1).title}</button>`).join(' ');
    $('#chapters').querySelectorAll('[data-ch]').forEach(b => b.onclick = () => { audio(); startChapter(+b.dataset.ch); });
    $('#start').onclick = () => { audio(); startChapter(0); };
    $('#musicBtn').onclick = () => { audio(); SND.setMusic(!SND.musicOn); musicLabel(); }; musicLabel();
    if (TOUCH) document.body.classList.add('touch');
    if (TOUCH) $('#keyhelp').textContent = 'Left thumb moves · Strike and Use buttons on the right · tap the text to read on';
    touchSetup();
    window.__p16 = { warp(ai, x, y) { S.area = S.areas[ai]; H.x = x * T + 8; H.y = y * T + 12; rebuildBlk(S.area); enterArea(S.area); }, bumpExit, render, S, H, api, use, attack, startChapter, advanceDialog, dlgOpen, finishHoming, interactables, focus, notes, summarize, worldDist, labToggle, openMap, closeMap, goExit, heroTile };
    requestAnimationFrame(loop);
  }
  boot();
})();
