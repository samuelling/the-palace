/* The Palace, 16-bit: pixel art drawn in code.
   Characters are hand-written sprite maps; floors, walls and furniture are procedural.
   Everything gets the same automatic one-pixel outline so the styles sit together. */
(function (root) {
  'use strict';
  const T = 16;
  const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => { const [r, g, b] = rgb(h); return k >= 0 ? hex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : hex(r * (1 + k), g * (1 + k), b * (1 + k)); };
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // outline every opaque region with a dark pixel where it meets transparency
  function outline(c, col) {
    const g = c.getContext('2d'), w = c.width, h = c.height, im = g.getImageData(0, 0, w, h), d = im.data, src = new Uint8ClampedArray(d), [r, gg, b] = rgb(col || '#120c16');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (src[i + 3] > 0) continue;
      let n = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h && src[(Y * w + X) * 4 + 3] > 200) { n = true; break; } }
      if (n) { d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255; }
    }
    g.putImageData(im, 0, 0); return c;
  }
  function fromMap(rows, pal, ol) {
    const h = rows.length, w = rows[0].length, c = cv(w, h), g = c.getContext('2d');
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const ch = row[x]; if (ch !== '.' && pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } } });
    return ol === false ? c : outline(c, ol);
  }
  function flip(c) { const o = cv(c.width, c.height), g = o.getContext('2d'); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(c, 0, 0); return o; }
  // a small painter for procedural props
  function painter(w, h) {
    const c = cv(w, h), g = c.getContext('2d');
    const P = {
      c, g,
      r(x, y, ww, hh, col) { g.fillStyle = col; g.fillRect(x, y, ww, hh); return P; },
      p(x, y, col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); return P; },
      ell(cx, cy, rx, ry, col) { g.fillStyle = col; for (let y = -ry; y <= ry; y++) { const xx = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + .01)))); g.fillRect(Math.round(cx - xx), Math.round(cy + y), xx * 2 + 1, 1); } return P; },
      done(col) { return col === false ? c : outline(c, col); },
    };
    return P;
  }

  /* ---------- characters ---------- */
  const HERO_PAL = { j: '#3c1d16', h: '#6a3420', H: '#9a5230', s: '#f2c9a0', S: '#cf9874', e: '#24161e', c: '#2c4466', C: '#44669a', d: '#1c2c44', w: '#e6dcc8', b: '#3a2a22', B: '#21170f', r: '#9a2e2e', R: '#cc4c3c' };
  const HERO = {
    down: ['................', '.....jjhhjj.....', '....jhHHHhhj....', '...jhHHhhhhhj...', '...jhhhhhhhhj...', '...jssssssssj...', '...jsessssesj...', '...jssssssssj...',
      '....SssssssS....', '....rrRRRRrr....', '...dCCwrrwCCd...', '..sdcccrrcccds..', '...dccccccccd...', '....dccccccd....'],
    up: ['................', '.....jjhhjj.....', '....jhhHHhhj....', '...jhhHHHhhhj...', '...jhhhHhhhhj...', '...jhhhhhhhhj...', '...jhhhhhhhhj...', '...shhhhhhhhs...',
      '....jhhhhhhj....', '....rrrrrrrr....', '...dCCCCCCCCd...', '..sdccccccccds..', '...dcccddcccd...', '....dccddccd....'],
    side: ['................', '.....jjhhhj.....', '....jhhhHHhj....', '...jhhhhhHHhj...', '...jhhhhhhhhj...', '...jhhhhsssss...', '...jhhhsssesss..', '...jhhhssssss...',
      '....jhhSsssS....', '.....rrrRRr.....', '....dCCCCrr.....', '....dccccCs.....', '....dcccccd.....', '....dcccccd.....'],
  };
  const LEGS = {
    down: [['....bbb..bbb....', '....BBB..BBB....'], ['....bbb..bbb....', '....BBB.........'], ['....bbb..bbb....', '.........BBB....']],
    up: [['....bbb..bbb....', '....BBB..BBB....'], ['....bbb..bbb....', '....BBB.........'], ['....bbb..bbb....', '.........BBB....']],
    side: [['.....bbbb.......', '.....BBBBB......'], ['....bb...bb.....', '...BBB...BBB....'], ['.....bbbb.......', '......BBB.......']],
  };
  function heroFrames() {
    const out = {};
    for (const dir of ['down', 'up', 'side']) {
      out[dir] = LEGS[dir].map((legs, i) => {
        const body = HERO[dir].slice(); const bob = i ? 0 : 0;
        return fromMap(body.concat(legs).slice(0, 16), HERO_PAL);
      });
    }
    out.left = out.side.map(flip); out.right = out.side;
    return out;
  }
  const GHOUL_PAL = { n: '#4a5644', g: '#71826a', G: '#97a888', r: '#ff4a3a', m: '#2a1414', t: '#3a2a2a', T: '#5a4038', y: '#b8963a', Y: '#dcb658' };
  const GHOUL = [
    ['................', '......nggn......', '.....ngGGgn.....', '.....grggrg.....', '.....gggmgg.....', '......nggn......', '...g.tTTTTt.g...', '...gntTTTTtng...',
      '....ntTttTtn....', '.....tTttTt.....', '.....tttttt.....', '.....tTttTt.....', '....t.tttt.t....', '......g..g......', '.....gg..gg.....', '................'],
    ['................', '......nggn......', '.....ngGGgn.....', '.....grggrg.....', '.....gggmgg.....', '......nggn......', '..g..tTTTTt..g..', '..gn.tTTTTt.ng..',
      '....ntTttTtn....', '.....tTttTt.....', '.....tttttt.....', '.....tTttTt.....', '....t.tttt.t....', '.....g....g.....', '....gg....gg....', '................']];
  const HAT = ['....yyyyyyyy....', '...yYYYYYYYYy...', '.....ngGGgn.....'];
  const SENT_PAL = { p: '#8a2a2e', P: '#c04040', a: '#7a7e8e', A: '#aab0c0', q: '#4e5262', Q: '#33363f', v: '#0c0a10', o: '#56525e', O: '#76727e' };
  const SENTINEL = ['......pPPp......', '.......pPp......', '.....qaAAaq.....', '....qaAAAAaq....', '....qavvvvaq....', '....qaaaaaaq....', '.....qaaaaq.....', '...qAAaqqaAAq...',
    '..qaAAaAAaAAaq..', '..qaaqaAAaqaaq..', '..qa.qaaaaq.aq..', '..qa.qaAAaq.aq..', '..qQ.qaaaaq.Qq..', '..QQ.QqqqqQ.QQ..', '.....qaaaaq.....', '.....qa..aq.....',
    '.....qa..aq.....', '.....qA..Aq.....', '....qqa..aqq....', '....QQQ..QQQ....', '...oOOOOOOOOo...', '...oOOOOOOOOo...', '...oooooooooo...', '................'];
  const SCARE_PAL = { y: '#c8a048', Y: '#e6c662', s: '#a08a64', S: '#c4ac82', h: '#3a2c22', H: '#5e4834', w: '#6a4a2a', c: '#5a3a3a', C: '#7e504a', m: '#3a2a1a' };
  const SCARECROW = ['....hHHHHHh.....', '...hhhhhhhhhh...', '.....sSSSSs.....', '.....sSSSSs.....', '.....ssmmss.....', '......ySSy......', 'wwwwwwcCCcwwwwww', 'y....cCCCCc....y',
    '.....cCcCCc.....', '.....cccccc.....', '.....cCccCc.....', '......yyyy......', '.......ww.......', '.......ww.......', '.......ww.......', '.......ww.......',
    '.......ww.......', '.......ww.......', '.......ww.......', '.......ww.......', '......wwww......', '.....yyyyyy.....', '....yYyyYyy.....', '................'];
  const LOCKE_PAL = { g: '#a8a49c', G: '#d8d4cc', s: '#e8c0a0', S: '#c49478', e: '#20141a', w: '#e8e4dc', v: '#5a2e2a', V: '#7e463c', p: '#2e2a34', b: '#1a1414', o: '#d8c890' };
  const LOCKE = {
    down: ['................', '.....gGGGGg.....', '....gGGggGGg....', '...ggssssssgg...', '...gsoessoesg...', '...gssssssssg...', '....SssssssS....', '.....sGGGGs.....',
      '....wwwwwwww....', '...vVwwwwwwVv...', '..svVVvwwvVVvs..', '...vVVvvvvVVv...', '...vvvvvvvvvv...', '....pppppppp....', '....ppp..ppp....', '....bbb..bbb....'],
    up: ['................', '.....gGGGGg.....', '....gGGGGGGg....', '...ggGGggGGgg...', '...gggggggggg...', '...sggggggggs...', '....gggggggg....', '.....SssssS.....',
      '....vvvvvvvv....', '...vVVVVVVVVv...', '..svVVvvvvVVvs..', '...vVVvvvvVVv...', '...vvvvvvvvvv...', '....pppppppp....', '....ppp..ppp....', '....bbb..bbb....'],
    side: ['................', '.....gGGGg......', '....gGGGGGg.....', '...ggggssss.....', '...gggssoess....', '...gggssssss....', '....ggSssss.....', '.....SsGGG......',
      '.....wwwww......', '....vVVwwv......', '....vVVVvs......', '....vVvvvv......', '....vvvvvv......', '....pppppp......', '.....pp.pp......', '.....bb.bbb.....'],
  };
  const CROW_PAL = { b: '#1c1c2a', B: '#34364e', y: '#d0a040', e: '#f0e8a8' };
  const CROW = [['................', '................', '......bbb.......', '.....bebby......', '.....bbbbyy.....', '....bBBbb.......', '...bBBBBbb......', '..bBBBBBbbb.....',
    '.bbbBBBbbb......', '....bbbbb.......', '.....y..y.......', '....yy.yy.......'],
  ['................', '.b..........b...', '.bb..bbb...bb...', '..bbbebbybbb....', '...bbbbbbyy.....', '....bBBbb.......', '...bBBBBb.......', '....bBBBb.......',
    '.....bbb........', '................', '................', '................']];
  function guardian() {
    const P = painter(32, 32), dk = '#2a1a34', md = '#46304e', lt = '#6a4c72', sk = '#8a6a8a';
    P.ell(16, 21, 11, 9, dk).ell(16, 20, 10, 8, md).ell(14, 17, 6, 4, lt);
    P.ell(5, 21, 4, 7, dk).ell(27, 21, 4, 7, dk).ell(5, 20, 3, 6, md).ell(27, 20, 3, 6, md);   // arms
    P.ell(16, 9, 6, 6, dk).ell(16, 8, 5, 5, md).ell(15, 7, 3, 2, lt);                            // head
    P.r(4, 27, 4, 3, dk).r(24, 27, 4, 3, dk).r(10, 29, 5, 3, dk).r(17, 29, 5, 3, dk);           // claws and feet
    P.r(12, 8, 3, 2, '#000000').r(18, 8, 3, 2, '#000000').r(13, 8, 1, 1, '#ffe070').r(19, 8, 1, 1, '#ffe070');
    P.r(13, 12, 7, 1, '#140a18').r(14, 13, 1, 1, sk).r(16, 13, 1, 1, sk).r(18, 13, 1, 1, sk);   // teeth
    return P.done('#08040c');
  }

  /* ---------- items (12x12 icons) ---------- */
  const ITEMS = {
    key: [{ y: '#e0b040', Y: '#ffe48a', d: '#9a7020' }, ['............', '....yyy.....', '...yY.Yy....', '...y...y....', '...yY.Yd....', '....yyd.....', '.....y......', '.....y......', '.....yyy....', '.....y......', '.....yyd....', '............']],
    hatchkey: [{ y: '#7a7e88', Y: '#b0b4be', d: '#4a4e58' }, ['............', '...yyyy.....', '..yY..Yy....', '..y....y....', '..yY..Yd....', '...yyyd.....', '.....y......', '.....y......', '.....yyy....', '.....yd.....', '.....yyyd...', '............']],
    medallion: [{ y: '#d8a838', Y: '#ffe07a', d: '#8a6418', b: '#6a3a1a' }, ['............', '....yyyy....', '...yYYYyy...', '..yYbyybyy..', '..yYyyyyyd..', '..yybbbbyd..', '..yyybbyyd..', '...yyyyyd...', '....dddd....', '............', '............', '............']],
    glove: [{ g: '#c89480', G: '#e4b49c', d: '#8a5a4a' }, ['............', '...g.g.g....', '...g.g.g.g..', '...g.g.g.g..', '...gGgGgGg..', '...gGGGGGg..', '..ggGGGGgd..', '..gggGGGgd..', '...ggggggd..', '....gggdd...', '....dddd....', '............']],
    musicbox: [{ w: '#7a4a2a', W: '#a06a3a', y: '#e0b040', d: '#4a2a18' }, ['............', '............', '..yyyyyyyy..', '..yWWWWWWy..', '..wwwwwwww..', '..wWWWWWWw..', '..wWWyyWWw..', '..wWWWWWWwy.', '..wwwwwwwwyy', '..dddddddd..', '............', '............']],
    locket: [{ y: '#d8a838', Y: '#ffe07a', d: '#8a6418', r: '#7a2a3a' }, ['....y..y....', '.....yy.....', '.....yy.....', '....yyyy....', '...yYYYyy...', '...yYrryd...', '...yYrryd...', '...yyrryd...', '....yyyd....', '.....dd.....', '............', '............']],
    rose: [{ r: '#c02838', R: '#ee5060', g: '#3a7a3a', G: '#5aa04a' }, ['............', '....rrr.....', '...rRRrr....', '...rRrRr....', '....rrr.....', '.....g......', '...GGg......', '....Gg.gG...', '.....gGG....', '.....g......', '.....g......', '............']],
    herb: [{ g: '#3a8a3a', G: '#6ac05a', d: '#235a23' }, ['............', '.....g......', '....gGg.....', '..g.gGg.g...', '.gGg.g.gGg..', '.gGGgggGGg..', '..gGGgGGg...', '...ggggg....', '.....d......', '.....d......', '............', '............']],
    journal: [{ b: '#5a2e22', B: '#7e4232', p: '#e8dcc0', y: '#c8a040' }, ['............', '..bbbbbbb...', '..bBBBBBbp..', '..bByyyBbp..', '..bBBBBBbp..', '..bByyyBbp..', '..bBBBBBbp..', '..bBBBBBbp..', '..bbbbbbbp..', '...ppppppp..', '............', '............']],
    plan: [{ p: '#e0d2a8', P: '#f4ead0', d: '#a08a5a', i: '#5a4a3a' }, ['............', '.dppppppppd.', '.dPiPPPiPPd.', '.dPiiiPiiPd.', '.dPPPiPPPPd.', '.dPiiiiiPPd.', '.dPiPPPiPPd.', '.dPPPPPPPPd.', '.dppppppppd.', '............', '............', '............']],
    dance: [{ p: '#f0e6d0', d: '#b8a888', r: '#c04a6a', i: '#5a4a5a' }, ['............', '...pppppp...', '...piiipd...', '...pppppd...', '...piiipd...', '...pppppd...', '...piiipd...', '...pppppd...', '..rr.ddd....', '...r........', '............', '............']],
    ring: [{ y: '#e0b040', Y: '#fff0a0', d: '#9a7020' }, ['............', '............', '....yYYy....', '...yy..yy...', '...y....d...', '...y....d...', '...yy..dd...', '....yddd....', '............', '............', '............', '............']],
    lily: [{ w: '#f4f0e8', W: '#ffffff', y: '#e8c040', g: '#4a8a3a' }, ['............', '.....w......', '..w.wWw.w...', '...wWyWw....', '..wWWyWWw...', '...wwwww....', '.....g......', '....gg......', '.....g......', '.....g......', '............', '............']],
    score: [{ p: '#ece2c8', i: '#2a2228', d: '#a89870' }, ['............', '..pppppppd..', '..iiiiiiid..', '..ppippipd..', '..iiiiiiid..', '..pippippd..', '..iiiiiiid..', '..ppppppid..', '..iiiiiiid..', '..pppppppd..', '............', '............']],
    rattle: [{ s: '#b8bcc8', S: '#e8ecf4', d: '#6a6e7a', r: '#c890a0' }, ['............', '.....sss....', '....sSSsd...', '....sSssd...', '.....sdd....', '.....r......', '.....s......', '.....s......', '.....s......', '....sss.....', '............', '............']],
    letter: [{ p: '#ece2c8', d: '#a89870', r: '#9a2a2a' }, ['............', '............', '.pppppppppd.', '.ppdpppdppd.', '.pppdpdpppd.', '.ppppdppppd.', '.pppprrpppd.', '.pppprrpppd.', '.ddddddddd..', '............', '............', '............']],
  };

  /* ---------- floors ---------- */
  function noiseTile(seed, fn) { const c = cv(T, T), g = c.getContext('2d'), r = rng(seed); for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) { g.fillStyle = fn(x, y, r); g.fillRect(x, y, 1, 1); } return c; }
  const FLOORS = {
    wood: (s) => { const r = rng(s); const rows = [0, 4, 8, 12].map(() => ['#6e4628', '#7a502e', '#654024'][Math.floor(r() * 3)]); const cut = [0, 4, 8, 12].map(() => Math.floor(r() * 16));
      return noiseTile(s, (x, y, q) => { const row = y >> 2; if (y % 4 === 3) return '#3a2212'; if (x === cut[row]) return '#4a2c18'; const n = q(); return n < .08 ? '#5a3820' : n > .94 ? '#8a5c34' : rows[row]; }); },
    parquet: (s) => noiseTile(s, (x, y, q) => { const a = ((x >> 2) + (y >> 2)) & 1, v = a ? (x % 4 === 0 ? '#5e3a1c' : '#9a6634') : (y % 4 === 0 ? '#5e3a1c' : '#7e522a'); return q() < .05 ? shade(v, -.15) : v; }),
    marble: (s, dk) => { const r = rng(s), dark = !!dk; return noiseTile(s, (x, y, q) => { const base = dark ? '#3c3948' : '#bfb8aa', v = (x + y * 2 + Math.floor(r() * 2)) % 11 === 0 ? (dark ? '#514d62' : '#a19a8c') : base; if (x === 0 || y === 0) return dark ? '#312e3c' : '#aaa395'; return q() < .06 ? shade(v, dark ? .1 : -.05) : v; }); },
    stone: (s) => noiseTile(s, (x, y, q) => { const bx = (y < 8 ? x : x + 8) % 16; if (y % 8 === 7 || bx % 8 === 7) return '#2e2a34'; const v = ['#5e5a66', '#686470', '#56525e'][((x >> 3) + (y >> 3) * 3 + (s % 3)) % 3]; return q() < .1 ? shade(v, -.12) : q() > .95 ? shade(v, .12) : v; }),
    carpetRed: (s) => noiseTile(s, (x, y, q) => { const d = Math.abs((x % 8) - 3.5) + Math.abs((y % 8) - 3.5); if (d < 1.2) return '#c89a3a'; if (d > 2.6 && d < 3.4) return '#9c2a30'; return q() < .05 ? '#6a1a20' : '#7a1e24'; }),
    carpetBlue: (s) => noiseTile(s, (x, y, q) => { if ((x % 8 === 3 || x % 8 === 4) && (y % 8 === 3 || y % 8 === 4)) return '#d8c08a'; return q() < .06 ? '#34416c' : '#3e4e80'; }),
    grass: (s) => noiseTile(s, (x, y, q) => { const n = q(); return n < .12 ? '#2a4e22' : n < .2 ? '#5a9a3e' : n < .23 ? '#78b44c' : '#3a6a2c'; }),
    lawnDark: (s) => noiseTile(s, (x, y, q) => { const n = q(); return n < .14 ? '#22401c' : n < .21 ? '#4a8236' : '#30582a'; }),
    gravel: (s) => noiseTile(s, (x, y, q) => { const n = q(); return n < .18 ? '#6a604e' : n < .3 ? '#a89c82' : n < .34 ? '#4e463a' : '#8a7e68'; }),
    tile: (s) => noiseTile(s, (x, y, q) => { if (x % 8 === 0 || y % 8 === 0) return '#3a4044'; if (x % 8 === 1 || y % 8 === 1) return '#7a8288'; return q() < .05 ? '#4e565c' : '#5c6468'; }),
    void: () => noiseTile(1, () => '#06050a'),
  };
  /* ---------- wall faces (the vertical face you see above a floor) ---------- */
  function faceTile(kind, seed) {
    const P = painter(T, T), r = rng(seed);
    const fill = (a, b, fn) => { for (let y = 0; y < 13; y++) for (let x = 0; x < T; x++) P.p(x, y, fn ? fn(x, y) : ((x + y) % 2 ? a : b)); };
    switch (kind) {
      case 'wallpaperWarm': fill(0, 0, (x, y) => x % 6 < 2 ? '#a06c46' : '#8a5a3a'); break;
      case 'wallpaperGreen': fill(0, 0, (x, y) => ((x + 4) % 8 === Math.abs(4 - y % 8) || (x + 4) % 8 === 8 - Math.abs(4 - y % 8)) ? '#5e8456' : '#3e5a3a'); break;
      case 'wallpaperRed': fill(0, 0, (x, y) => (x % 8 === 3 && y % 4 < 2) ? '#a8404a' : '#6a2228'); break;
      case 'wallpaperNursery': fill(0, 0, (x, y) => ((x * 7 + y * 3 + seed) % 23 === 0) ? '#fff0c0' : '#b07e92'); break;
      case 'panel': fill(0, 0, (x, y) => (x % 8 === 0 || y === 6) ? '#3a2414' : (x % 8 === 1 ? '#7a5030' : '#5a3a22')); break;
      case 'brick': fill(0, 0, (x, y) => (y % 4 === 3 || ((x + (y >> 2) % 2 * 4) % 8 === 7)) ? '#3e241c' : (r() < .1 ? '#8a4a34' : '#743a2a')); break;
      case 'stone': fill(0, 0, (x, y) => (y % 6 === 5 || ((x + (Math.floor(y / 6) % 2) * 5) % 10 === 9)) ? '#2e2a34' : (r() < .12 ? '#5a5664' : '#4c4856')); break;
      case 'marbleWall': fill(0, 0, (x, y) => (x % 8 === 0) ? '#8e887e' : (r() < .06 ? '#a09a90' : '#bcb6aa')); break;
      case 'ballroom': fill(0, 0, (x, y) => (x % 8 === 0 || x % 8 === 7) ? '#c8a050' : (y % 6 === 2 && x % 8 === 3 ? '#e8d090' : '#d6c08c')); break;
      case 'chapel': fill(0, 0, (x, y) => (x % 16 > 5 && x % 16 < 10 && y > 1 && y < 11) ? ['#3a5aa8', '#a83a4a', '#c8a040', '#3a8a5a'][((x + y) >> 1) % 4] : (y % 6 === 5 ? '#4a4858' : '#6a6878')); break;
      case 'mural': fill(0, 0, (x, y) => y < 6 ? '#5a7ab0' : (r() < .3 ? '#3a7a3a' : '#4a8a44')); break;
      case 'velvet': fill(0, 0, (x, y) => x % 4 === 0 ? '#4a1430' : '#6a1e44'); break;
      case 'letters': fill(0, 0, (x, y) => (y % 3 === 1 && x % 7 > 0) ? (r() < .5 ? '#6a5a4a' : '#d8ccb0') : '#d8ccb0'); break;
      case 'hedgeWall': return hedgeTile(seed, true);
      case 'facade': fill(0, 0, (x, y) => (y % 5 === 4 || ((x + (Math.floor(y / 5) % 2) * 4) % 8 === 7)) ? '#2a2630' : (r() < .1 ? '#4a4652' : '#3c3844')); break;
      default: fill('#555', '#555');
    }
    P.r(0, 0, T, 1, 'rgba(0,0,0,.35)');
    P.r(0, 13, T, 1, '#2a1a10').r(0, 14, T, 2, '#4a2c18').r(0, 14, T, 1, '#5e3a20');   // skirting board
    return P.c;
  }
  function capTile(edges, col) {
    // the top of a wall seen from above; edges = which sides meet open floor (n,s,e,w)
    const base = col || '#231d26', rim = shade(base, .25), lo = shade(base, -.35), P = painter(T, T);
    P.r(0, 0, T, T, base);
    for (let i = 0; i < 18; i++) P.p((i * 7 + 3) % 16, (i * 5 + 1) % 16, shade(base, .08));
    if (edges.s) P.r(0, 13, T, 3, lo).r(0, 13, T, 1, rim);
    if (edges.n) P.r(0, 0, T, 2, rim);
    if (edges.w) P.r(0, 0, 2, T, rim);
    if (edges.e) P.r(14, 0, 2, T, lo).r(14, 0, 1, T, rim);
    return P.c;
  }
  function hedgeTile(seed, face) {
    const r = rng(seed), P = painter(T, T);
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const n = r(); let c = n < .25 ? '#1c4420' : n < .55 ? '#2a6028' : n < .8 ? '#347030' : '#4a8a3c';
      if (face && y > 11) c = shade(c, -.35);
      P.p(x, y, c);
    }
    for (let i = 0; i < 6; i++) { const x = Math.floor(r() * 14), y = Math.floor(r() * (face ? 10 : 14)); P.p(x, y, '#6aa44c').p(x + 1, y, '#5a9644'); }
    return P.c;
  }
  function waterTile(phase) { const P = painter(T, T); P.r(0, 0, T, T, '#1e3e6a'); for (let i = 0; i < 6; i++) { const x = (i * 5 + phase * 3) % 16, y = (i * 7 + phase) % 16; P.r(x, y, 3, 1, '#4e7eb0'); } return P.c; }

  /* ---------- props ---------- */
  const PROPS = {
    bookshelf() { const P = painter(32, 24); P.r(0, 0, 32, 24, '#3a2414').r(1, 1, 30, 22, '#4e3018'); const cols = ['#7a2a2a', '#2a4a6a', '#5a6a2a', '#8a6a2a', '#4a2a5a', '#6a3a1a', '#a08050'];
      for (let row = 0; row < 3; row++) { let x = 2; while (x < 30) { const w = 1 + (x * 7 + row) % 3, h = 5 + (x + row) % 2; P.r(x, 2 + row * 7 + (6 - h), w, h, cols[(x * 3 + row * 5) % cols.length]); x += w; } P.r(1, 8 + row * 7, 30, 1, '#2a180c'); }
      return P.done(); },
    table() { const P = painter(32, 24); P.r(2, 4, 28, 12, '#7a4a28').r(2, 4, 28, 2, '#9a6234').r(4, 16, 3, 7, '#4a2a16').r(25, 16, 3, 7, '#4a2a16').r(2, 15, 28, 2, '#5a361c'); return P.done(); },
    tableCloth() { const P = painter(32, 24); P.r(1, 3, 30, 15, '#d8d0bc').r(1, 3, 30, 2, '#f0e8d6').r(1, 16, 30, 3, '#b8ae98').r(13, 6, 6, 4, '#c8a040').r(15, 4, 2, 2, '#ffe080'); return P.done(); },
    longTable() { const P = painter(48, 24); P.r(1, 3, 46, 14, '#6a3e20').r(1, 3, 46, 2, '#8a5630').r(1, 16, 46, 3, '#4a2a14'); [8, 24, 40].forEach(x => P.r(x - 1, 6, 3, 5, '#c8a040').r(x, 4, 1, 2, '#ffe080')); return P.done(); },
    chair() { const P = painter(16, 16); P.r(3, 1, 10, 6, '#5a3018').r(4, 2, 8, 4, '#7a2a2a').r(3, 7, 10, 5, '#6a3a1c').r(4, 8, 8, 3, '#8a3a3a').r(3, 12, 2, 4, '#3a1e0e').r(11, 12, 2, 4, '#3a1e0e'); return P.done(); },
    armchair() { const P = painter(16, 16); P.r(1, 2, 14, 13, '#5a2a3a').r(3, 3, 10, 6, '#7a3a4e').r(3, 9, 10, 5, '#8a4a5e').r(1, 6, 3, 9, '#4a2030').r(12, 6, 3, 9, '#4a2030'); return P.done(); },
    sofa() { const P = painter(32, 16); P.r(1, 1, 30, 14, '#3a4a6a').r(3, 2, 26, 6, '#4e628a').r(3, 8, 12, 5, '#5a70a0').r(17, 8, 12, 5, '#5a70a0').r(1, 4, 3, 11, '#2e3c58').r(28, 4, 3, 11, '#2e3c58'); return P.done(); },
    desk() { const P = painter(32, 24); P.r(1, 4, 30, 12, '#5a3418').r(1, 4, 30, 2, '#7a4a24').r(1, 15, 30, 8, '#4a2a12').r(3, 17, 10, 4, '#5e3a1c').r(19, 17, 10, 4, '#5e3a1c').r(7, 18, 2, 1, '#c8a040').r(23, 18, 2, 1, '#c8a040');
      P.r(5, 6, 8, 6, '#e8dcc0').r(6, 7, 5, 1, '#8a7a6a').r(6, 9, 6, 1, '#8a7a6a').r(22, 3, 4, 6, '#c8a040').r(21, 1, 6, 3, '#e8d070'); return P.done(); },
    lectern() { const P = painter(16, 24); P.r(6, 10, 4, 12, '#4a2a14').r(4, 21, 8, 2, '#3a1e0e').r(1, 3, 14, 8, '#5e3a1c').r(2, 4, 12, 6, '#e8dcb4').r(3, 5, 4, 1, '#6a5a3a').r(9, 5, 3, 1, '#6a5a3a').r(3, 7, 9, 1, '#6a5a3a').r(7, 4, 1, 6, '#b8a880'); return P.done(); },
    clock() { const P = painter(16, 32); P.r(3, 2, 10, 28, '#4a2814').r(4, 3, 8, 26, '#6a3a1c').ell(8, 8, 4, 4, '#e8dcc0').r(8, 5, 1, 4, '#2a1a10').r(8, 8, 3, 1, '#2a1a10').r(6, 15, 4, 10, '#3a1e0c').r(7, 20, 2, 3, '#c8a040').r(2, 0, 12, 3, '#5a3418'); return P.done(); },
    fireplace(f) { const P = painter(32, 32); P.r(0, 6, 32, 26, '#5a5464').r(1, 7, 30, 24, '#7a7484').r(0, 4, 32, 4, '#4a4454').r(7, 14, 18, 17, '#160c08');
      const fl = f ? ['#ff9a3a', '#ffd060', '#c84a1a'] : ['#ffb040', '#ffe080', '#d85a1a']; P.ell(16, 26, 6, 4, fl[2]).ell(16 + (f ? 1 : -1), 25, 4, 4, fl[0]).ell(16, 26, 2, 2, fl[1]).r(9, 29, 14, 2, '#3a2010'); return P.done(); },
    piano() { const P = painter(32, 32); P.ell(16, 14, 14, 11, '#16121a').ell(14, 12, 10, 7, '#2a2430').r(3, 22, 26, 6, '#16121a');
      for (let i = 0; i < 12; i++) P.r(4 + i * 2, 23, 1, 4, '#e8e4dc'); P.r(5, 28, 2, 4, '#0c0a10').r(25, 28, 2, 4, '#0c0a10'); return P.done(); },
    harp() { const P = painter(16, 24); P.r(3, 2, 2, 20, '#c8a040').r(3, 2, 10, 2, '#c8a040').r(11, 2, 2, 6, '#c8a040'); for (let i = 0; i < 4; i++) P.r(5 + i * 2, 4 + i, 1, 17 - i * 2, '#e8e0c8'); P.r(2, 21, 8, 2, '#8a6a2a'); return P.done(); },
    pew() { const P = painter(32, 16); P.r(0, 2, 32, 5, '#4a2a14').r(0, 2, 32, 1, '#6a4020').r(0, 8, 32, 5, '#5a3418').r(1, 13, 2, 3, '#2a1608').r(29, 13, 2, 3, '#2a1608'); return P.done(); },
    altar() { const P = painter(32, 24); P.r(2, 6, 28, 16, '#d8d4cc').r(2, 6, 28, 3, '#f0ece4').r(14, 0, 4, 9, '#c8a040').r(11, 2, 10, 2, '#c8a040'); return P.done(); },
    crib() { const P = painter(32, 24); P.r(2, 4, 28, 16, '#e8dcd0').r(4, 6, 24, 12, '#f4d8e0'); for (let i = 0; i < 8; i++) P.r(3 + i * 4, 4, 1, 16, '#c8b4a8'); P.r(2, 4, 28, 2, '#b8a498').r(2, 18, 28, 2, '#b8a498'); return P.done(); },
    plant() { const P = painter(16, 24); P.r(4, 16, 8, 7, '#8a4a2a').r(4, 16, 8, 2, '#a85e34'); P.ell(8, 9, 6, 6, '#2a5a26').ell(6, 7, 3, 3, '#3e7a32').ell(10, 11, 3, 3, '#3e7a32').p(5, 5, '#6aa44c').p(11, 9, '#6aa44c'); return P.done(); },
    candelabra() { const P = painter(16, 24); P.r(7, 8, 2, 14, '#b88a30').r(4, 21, 8, 2, '#8a6420').r(2, 7, 12, 2, '#b88a30').r(2, 4, 2, 4, '#f0e8d0').r(7, 3, 2, 5, '#f0e8d0').r(12, 4, 2, 4, '#f0e8d0').r(2, 2, 2, 2, '#ffc040').r(7, 1, 2, 2, '#ffc040').r(12, 2, 2, 2, '#ffc040'); return P.done(); },
    portrait(kind) { const P = painter(16, 16); P.r(1, 1, 14, 13, '#b88a30').r(2, 2, 12, 11, '#8a6420').r(3, 3, 10, 9, kind === 'clara' ? '#3a3040' : '#2e2a24');
      if (kind === 'clara') P.ell(8, 7, 2, 3, '#e8c8b0').r(5, 9, 6, 3, '#6a2a3a').r(6, 4, 4, 2, '#3a2016'); else P.ell(8, 7, 2, 2, '#9a8a70').r(5, 9, 6, 3, '#3a3a2a'); return P.done(); },
    window() { const P = painter(16, 16); P.r(2, 1, 12, 12, '#3a2a1c').r(3, 2, 10, 10, '#1a2a4a').r(3, 2, 4, 4, '#2e4470').r(7, 2, 1, 10, '#3a2a1c').r(3, 6, 10, 1, '#3a2a1c').p(10, 3, '#e8e8d0'); return P.done(); },
    rug() { const P = painter(64, 48); P.r(0, 0, 64, 48, '#6a1a22').r(2, 2, 60, 44, '#8a2a2e').r(4, 4, 56, 40, '#5a1a20'); for (let x = 6; x < 58; x += 6) for (let y = 6; y < 42; y += 6) P.r(x, y, 2, 2, '#c89a3a'); P.r(4, 4, 56, 1, '#c89a3a').r(4, 43, 56, 1, '#c89a3a'); return P.c; },
    runner() { const P = painter(32, 96); P.r(4, 0, 24, 96, '#4a1e3a').r(6, 0, 20, 96, '#6a2a4e'); for (let y = 4; y < 96; y += 8) P.r(14, y, 4, 4, '#c8a040'); return P.c; },
    barrel() { const P = painter(16, 16); P.ell(8, 9, 6, 6, '#6a4022').r(2, 5, 12, 1, '#3a3a3a').r(2, 12, 12, 1, '#3a3a3a').ell(8, 4, 5, 2, '#8a5a32'); return P.done(); },
    crate() { const P = painter(16, 16); P.r(1, 2, 14, 13, '#7a5a32').r(1, 2, 14, 2, '#9a7442').r(2, 4, 1, 10, '#5a4022').r(13, 4, 1, 10, '#5a4022').r(2, 8, 12, 1, '#5a4022'); return P.done(); },
    sacks() { const P = painter(16, 16); P.ell(5, 10, 4, 5, '#b8a074').ell(11, 11, 4, 4, '#a08a60').r(4, 4, 2, 2, '#8a7450'); return P.done(); },
    shelfJars() { const P = painter(32, 24); P.r(0, 0, 32, 24, '#4a3020').r(1, 1, 30, 22, '#5e3e28'); [[3, '#8a3a3a'], [9, '#4a7a3a'], [15, '#c8a040'], [21, '#6a4a8a'], [26, '#8a6a3a']].forEach(([x, c]) => { P.r(x, 3, 4, 6, c).r(x, 3, 4, 1, '#e8e0d0'); P.r(x + 1, 13, 4, 6, c).r(x + 1, 13, 4, 1, '#e8e0d0'); }); P.r(1, 10, 30, 1, '#2a1a0e').r(1, 20, 30, 1, '#2a1a0e'); return P.done(); },
    bench() { const P = painter(32, 16); P.r(1, 4, 30, 6, '#5a3a20').r(1, 4, 30, 2, '#7a5030').r(3, 10, 2, 5, '#3a2210').r(27, 10, 2, 5, '#3a2210'); return P.done(); },
    pegs() { const P = painter(32, 16); P.r(0, 3, 32, 3, '#4a2a14'); [4, 12, 20, 28].forEach((x, i) => { P.r(x, 5, 1, 2, '#c8a040'); if (i % 2 === 0) P.r(x - 3, 7, 7, 8, i ? '#3a3a4a' : '#4a3a2a'); }); return P.done(); },
    urn() { const P = painter(16, 24); P.ell(8, 12, 5, 7, '#6a6a78').ell(7, 10, 2, 4, '#8a8a98').r(5, 3, 6, 3, '#5a5a68').r(4, 19, 8, 4, '#4a4a56'); return P.done(); },
    statueAnimal(kind) {
      const P = painter(16, 32), st = '#9a968e', lt = '#c4c0b6', dk = '#6a665e';
      P.r(2, 22, 12, 9, dk).r(2, 22, 12, 2, st);
      if (kind === 'Owl') P.ell(8, 14, 5, 7, st).ell(8, 9, 4, 3, lt).p(6, 9, '#2a2a2a').p(10, 9, '#2a2a2a').p(5, 6, st).p(11, 6, st);
      else if (kind === 'Stag') P.ell(8, 15, 5, 5, st).ell(8, 9, 2, 3, lt).r(4, 2, 1, 5, st).r(11, 2, 1, 5, st).r(3, 3, 3, 1, st).r(10, 3, 3, 1, st).r(5, 18, 2, 4, st).r(9, 18, 2, 4, st);
      else if (kind === 'Hare') P.ell(8, 16, 5, 5, st).ell(8, 10, 3, 3, lt).r(6, 2, 2, 7, lt).r(9, 3, 2, 6, st);
      else P.ell(9, 17, 6, 4, lt).r(5, 7, 2, 9, st).ell(6, 7, 2, 2, lt).p(4, 7, '#c8a040');
      return P.done();
    },
    clara() { const P = painter(16, 32); P.r(3, 26, 10, 5, '#7a766e').ell(8, 19, 4, 8, '#c4c0b6').ell(8, 7, 3, 3, '#d6d2c8').r(5, 9, 6, 3, '#b0aca2').r(4, 4, 8, 2, '#a8a49a'); return P.done(); },
    fountain(f) { const P = painter(32, 32); P.ell(16, 18, 15, 11, '#6a6670').ell(16, 17, 13, 9, '#1e3e6a').ell(16, 14, 4, 3, '#8a8690').r(14, 6, 4, 9, '#8a8690');
      for (let i = 0; i < 5; i++) P.p((i * 7 + f * 3) % 22 + 5, 14 + (i * 3 + f) % 8, '#6a9ad0'); P.r(15, 2 + f, 2, 4, '#9ac0f0'); return P.done(); },
    boiler() { const P = painter(32, 32); P.ell(16, 16, 13, 14, '#5a3a2a').ell(14, 13, 9, 10, '#7a4e36').r(4, 26, 24, 5, '#3a2418').ell(16, 16, 5, 5, '#c8a040').ell(16, 16, 3, 3, '#3a2418').r(15, 11, 2, 10, '#c8a040').r(11, 15, 10, 2, '#c8a040').r(26, 2, 4, 14, '#6a6a6a'); return P.done(); },
    hatch(open) { const P = painter(16, 16); P.r(1, 1, 14, 14, '#3a2a1a').r(2, 2, 12, 12, open ? '#0a0608' : '#6a4a2a'); if (!open) P.r(2, 7, 12, 2, '#8a8a8a').r(7, 2, 2, 12, '#8a8a8a').r(6, 6, 4, 4, '#5a5a5a'); return P.done(); },
    trapdoor() { const P = painter(32, 16); P.r(0, 0, 32, 16, '#3a2414').r(1, 1, 30, 14, '#5e3a1c'); [6, 16, 26].forEach(x => P.ell(x, 8, 3, 3, '#2a180a')); P.r(15, 0, 2, 16, '#3a2414'); return P.done(); },
    plinth() { const P = painter(16, 24); P.r(2, 10, 12, 13, '#b8b2a6').r(2, 10, 12, 2, '#d8d2c6').r(1, 8, 14, 3, '#cec8bc').r(3, 13, 10, 1, '#c8a040'); return P.done(); },
    veil(f) { const P = painter(32, 32); for (let x = 0; x < 32; x++) { const w = Math.sin((x + f * 2) / 3) * 2; for (let y = 0; y < 32; y++) { const a = (y < 2 ? .9 : .55 + .25 * Math.sin((x * 3 + y + f * 5) / 5)); P.p(x, y, `rgba(${170 + w * 10},${150 + w * 12},${220},${a.toFixed(2)})`); } } P.r(0, 0, 32, 2, '#c8a040'); return P.c; },
    stairs() { const P = painter(32, 32); for (let i = 0; i < 8; i++) P.r(0, i * 4, 32, 4, shade('#6a6670', -i * .09)).r(0, i * 4, 32, 1, shade('#8a8690', -i * .09)); return P.c; },
    post() { const P = painter(16, 24); P.r(6, 6, 4, 17, '#5a3a20').r(6, 6, 2, 17, '#7a5030').r(5, 4, 6, 3, '#4a2e18'); return P.done(); },
    lamppost() { const P = painter(16, 32); P.r(7, 8, 2, 23, '#2a2a30').r(5, 30, 6, 2, '#2a2a30').r(4, 2, 8, 7, '#2a2a30').r(5, 3, 6, 5, '#ffd070').r(5, 1, 6, 1, '#2a2a30'); return P.done(); },
    tree() { const P = painter(32, 40); P.r(13, 24, 6, 15, '#3a2618').r(14, 24, 2, 15, '#5a3a22'); P.ell(16, 14, 14, 12, '#16301a').ell(14, 12, 11, 9, '#22442a').ell(11, 9, 6, 5, '#2e5a34').p(8, 7, '#4a7a44').p(18, 10, '#4a7a44'); return P.done(); },
    gate() { const P = painter(64, 32); for (let x = 0; x < 64; x += 4) P.r(x, 4, 2, 28, '#1e1e26').r(x, 2, 2, 2, '#3a3a46'); P.r(0, 10, 64, 2, '#1e1e26').r(0, 24, 64, 2, '#1e1e26'); return P.done(); },
    housedoor() { const P = painter(32, 32); P.r(2, 2, 28, 30, '#2a2228').r(4, 4, 24, 28, '#5a2a1c').r(15, 4, 2, 28, '#3a1a10').r(12, 17, 2, 2, '#c8a040').r(18, 17, 2, 2, '#c8a040').r(13, 10, 6, 2, '#c8a040'); return P.done(); },
    knight() { return null; },
  };

  function build() {
    const S = {};
    S.hero = heroFrames();
    S.ghoul = GHOUL.map(m => fromMap(m, GHOUL_PAL));
    S.gardener = GHOUL.map(m => fromMap(HAT.concat(m.slice(3)), GHOUL_PAL));
    S.sentinel = fromMap(SENTINEL, SENT_PAL);
    S.scarecrow = fromMap(SCARECROW, SCARE_PAL);
    S.locke = { down: fromMap(LOCKE.down, LOCKE_PAL), up: fromMap(LOCKE.up, LOCKE_PAL), right: fromMap(LOCKE.side, LOCKE_PAL) }; S.locke.left = flip(S.locke.right);
    S.crow = CROW.map(m => fromMap(m, CROW_PAL));
    S.guardian = guardian();
    S.items = {}; Object.keys(ITEMS).forEach(k => S.items[k] = fromMap(ITEMS[k][1], ITEMS[k][0]));
    S.props = {}; Object.keys(PROPS).forEach(k => { if (['fireplace', 'fountain', 'veil', 'portrait', 'statueAnimal', 'hatch'].includes(k)) return; const c = PROPS[k](); if (c) S.props[k] = c; });
    S.props.fireplace = [PROPS.fireplace(0), PROPS.fireplace(1)]; S.props.fountain = [0, 1, 2, 3].map(f => PROPS.fountain(f)); S.props.veil = [0, 1, 2, 3, 4, 5].map(f => PROPS.veil(f));
    S.props.portraitClara = PROPS.portrait('clara'); S.props.portrait = PROPS.portrait('stranger'); S.props.hatch = PROPS.hatch(false); S.props.hatchOpen = PROPS.hatch(true);
    ['Owl', 'Stag', 'Hare', 'Swan'].forEach(k => S.props['statue' + k] = PROPS.statueAnimal(k));
    S.water = [0, 1, 2, 3].map(waterTile);
    // tile caches
    const cache = {};
    S.floor = (kind, v) => { const k = 'f' + kind + v; return cache[k] || (cache[k] = (FLOORS[kind] || FLOORS.stone)(v * 977 + kind.length * 31, kind === 'marble' ? v & 1 : 0)); };
    S.face = (kind, v) => { const k = 'w' + kind + v; return cache[k] || (cache[k] = faceTile(kind, v * 131 + 7)); };
    S.cap = (e, col) => { const k = 'c' + (e.n ? 1 : 0) + (e.s ? 1 : 0) + (e.e ? 1 : 0) + (e.w ? 1 : 0) + (col || ''); return cache[k] || (cache[k] = capTile(e, col)); };
    S.hedge = v => { const k = 'h' + v; return cache[k] || (cache[k] = hedgeTile(v * 53 + 11, false)); };
    S.hedgeFace = v => { const k = 'hf' + v; return cache[k] || (cache[k] = hedgeTile(v * 53 + 11, true)); };
    return S;
  }
  root.PALACE16_ART = { build, T, shade, rng, outline, painter, cv };
})(typeof window !== 'undefined' ? window : globalThis);
