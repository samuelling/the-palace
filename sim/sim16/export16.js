// Export the 16-bit chapter layouts for the Monte Carlo players.
// Usage: node export16.js <n seeds> [lawn=base|large] > layouts16.json
const W = require('../../sixteen/world.js');
const K = (x, y) => x + ',' + y, N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const n = +(process.argv[2] || 100), lawn = process.argv[3] || 'base';
function blocked(a) { const s = new Set(); a.props.forEach(p => { if (p.block && !p.wall && !p.decal) for (let i = 0; i < p.fw; i++) for (let j = 0; j < p.fh; j++) s.add(K(p.x + i, p.y + j)); }); a.figures.forEach(f => s.add(K(f.x, f.y))); return s; }
function bfs(a, from) { const blk = blocked(a), d = new Map([[K(...from), 0]]), q = [from]; while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of N4) { const nx = x + dx, ny = y + dy, k = K(nx, ny); if (d.has(k) || nx < 0 || ny < 0 || nx >= a.w || ny >= a.h || a.grid[ny][nx] !== '.' || blk.has(k)) continue; d.set(k, d.get(K(x, y)) + 1); q.push([nx, ny]); } } return d; }
const ARR = { N: [7, 2], S: [7, 10], W: [1, 5], E: [14, 5] };
function east(seed) {
  const sp = W.generate(0, seed), L = sp.layout, rooms = {};
  for (const a of Object.values(sp.areas)) {
    const ports = {}; a.exits.forEach(e => ports[e.side] = ARR[e.side]); ports.C = [7, 6];
    a.items.forEach(it => ports['i:' + it.id] = [it.x, it.y]);
    const dist = {}; for (const [p, xy] of Object.entries(ports)) { const d = bfs(a, xy); dist[p] = {}; for (const [q, xy2] of Object.entries(ports)) { let best = d.get(K(...xy2)); if (best == null) for (const [dx, dy] of N4) { const v = d.get(K(xy2[0] + dx, xy2[1] + dy)); if (v != null && (best == null || v + 1 < best)) best = v + 1; } dist[p][q] = best == null ? 12 : best; } }
    rooms[a.id] = { name: a.name, gx: a.gx, gy: a.gy, exits: a.exits.map(e => ({ side: e.side, edge: e.edge, state: e.state, plan: e.plan, needs: e.needs || null })), dist, figures: a.figures.map(f => ({ type: f.type, c: f.contrast })), items: a.items.map(i => i.id), enemies: a.enemies.length };
  }
  return { seed, rooms, foyer: 'r12', open: L.open, eA: L.eA, eB: L.eB, eE: L.eE, seal: L.seal, opens: L.opens, z0: L.z0, z1: L.z1, z2: L.z2, errand: L.errand, errandItem: L.errandItem };
}
function cons(seed) {
  const sp = W.generate(1, seed, { lawn }), M = sp.maze, g = sp.areas.maze;
  const cx = i => M.ox + 3 * i, cy = j => M.oy + 3 * j;
  const open = (grid, i, j, a, b) => { const ts = a !== i ? [[cx(Math.min(i, a)) + 2, cy(j)], [cx(Math.min(i, a)) + 2, cy(j) + 1]] : [[cx(i), cy(Math.min(j, b)) + 2], [cx(i) + 1, cy(Math.min(j, b)) + 2]]; return ts.every(([x, y]) => grid[y][x] === '.'); };
  const after = M.planGrid.map(r => r.slice()); sp.regrow.close.forEach(ts => ts.forEach(([x, y]) => after[y][x] = 'H')); sp.regrow.open.forEach(ts => ts.forEach(([x, y]) => after[y][x] = '.'));
  const plan = [], post = [];
  for (let j = 0; j < M.CJ; j++) for (let i = 0; i < M.CI; i++) for (const [di, dj] of [[1, 0], [0, 1]]) { const a = i + di, b = j + dj; if (a >= M.CI || b >= M.CJ) continue; if (open(M.planGrid, i, j, a, b)) plan.push([i, j, a, b]); if (open(after, i, j, a, b)) post.push([i, j, a, b]); }
  const cellOf = (x, y) => [Math.floor((x - M.ox) / 3), Math.floor((y - M.oy) / 3)];
  const roses = g.items.filter(i => i.kind === 'rose').map(i => cellOf(i.x, i.y));
  const L = M.lawn, lx0 = cx(L[0]), lx1 = cx(L[2]) + 1, ly0 = cy(L[1]), ly1 = cy(L[3]) + 1;
  return { seed, CI: M.CI, CJ: M.CJ, lawn: L, plan, post, close: sp.regrow.close.length, roses, office: [2, M.CJ - 1], boiler: [M.CI - 1, 4], figures: g.figures.map(f => ({ cell: cellOf(f.x, f.y), type: f.type, c: f.contrast })),
    lawnBox: [lx0, ly0, lx1 + 1, ly1 + 1], fountain: [(lx0 + lx1 + 1) / 2, (ly0 + ly1 + 1) / 2] };
}
const out = { east: [], conservatory: [] };
for (let s = 1; s <= n; s++) { out.east.push(east(s)); out.conservatory.push(cons(s)); }
process.stdout.write(JSON.stringify(out));
