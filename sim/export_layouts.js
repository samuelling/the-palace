// Dump seeded chapter layouts to JSON so the Python players walk the same maps real players do.
const L = require('../levels.js');
const out = { east: [], conservatory: [], palace: [] };
for (let seed = 1; seed <= 80; seed++) {
  for (let i = 0; i < 3; i++) {
    const s = L.generate(i, seed * 101 + i);
    const roomGrid = s.G.map((row, y) => row.map((_, x) => s.roomAt(x, y)));
    const keep = ['id', 'seed', 'W', 'H', 'G', 'planG', 'plugs', 'doors', 'items', 'props', 'figures', 'spawn', 'safe', 'regrow', 'errand', 'roses', 'perm0', 'roomDefs', 'rotVeils', 'lawn'];
    const o = {}; keep.forEach(k => { if (s[k] !== undefined) o[k] = s[k]; });
    o.doors = (s.doors || []).map(d => ({ id: d.id, x: d.x, y: d.y, needs: d.needs }));
    o.items = s.items.map(it => ({ id: it.id, kind: it.kind, x: it.x, y: it.y, on: it.on, home: it.home }));
    o.props = s.props.map(p => ({ type: p.type, x: p.x, y: p.y, block: !!p.block, variant: p.variant }));
    o.roomGrid = roomGrid;
    out[s.id].push(o);
  }
}
require('fs').writeFileSync('layouts.json', JSON.stringify(out));
console.log('layouts', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
