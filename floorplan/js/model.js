'use strict';
// Data model. Enum indices match the desktop (Odin) version so .fplan files are interchangeable.

const FILE_VERSION = 1;
const DEFAULT_EXT_THICK = 6, DEFAULT_INT_THICK = 4.5, DEFAULT_WALL_HEIGHT = 108;

const M = {
  Paint: 0, Brick: 1, Stone: 2, Lap_Siding: 3, Board_Batten: 4, Stucco: 5, Cmu: 6, Wood_Panel: 7, Subway_Tile: 8,
  Shingle: 9, Hardwood: 10, Floor_Tile: 11, Carpet: 12, Concrete: 13, Marble: 14, Vinyl_Plank: 15, Grass: 16,
  Plain: 17, Glass: 18, Garage: 19, Granite: 20,
};
const W255 = [255, 255, 255, 255];
const MATERIALS = [
  { name: 'Paint', scale: 4, color: [238, 234, 226, 255], usage: 'wall' },
  { name: 'Brick', scale: 4, color: W255, usage: 'wall' },
  { name: 'Stone', scale: 6, color: W255, usage: 'wall' },
  { name: 'Lap Siding', scale: 4, color: [214, 222, 228, 255], usage: 'wall' },
  { name: 'Board & Batten', scale: 4, color: [240, 240, 236, 255], usage: 'wall' },
  { name: 'Stucco', scale: 4, color: [232, 220, 196, 255], usage: 'wall' },
  { name: 'Concrete Block', scale: 4, color: W255, usage: 'wall' },
  { name: 'Wood Paneling', scale: 4, color: W255, usage: 'both' },
  { name: 'Subway Tile', scale: 2, color: W255, usage: 'wall' },
  { name: 'Cedar Shake', scale: 4, color: W255, usage: 'wall' },
  { name: 'Hardwood', scale: 4, color: W255, usage: 'floor' },
  { name: 'Ceramic Tile', scale: 4, color: W255, usage: 'both' },
  { name: 'Carpet', scale: 2, color: W255, usage: 'floor' },
  { name: 'Concrete', scale: 8, color: W255, usage: 'both' },
  { name: 'Marble', scale: 6, color: W255, usage: 'both' },
  { name: 'Vinyl Plank', scale: 4, color: W255, usage: 'floor' },
  { name: 'Grass', scale: 14, color: W255, usage: 'internal' },
  { name: 'Plain', scale: 4, color: W255, usage: 'internal' },
  { name: 'Glass', scale: 4, color: W255, usage: 'internal' },
  { name: 'Garage Panel', scale: 7, color: W255, usage: 'internal' },
  { name: 'Granite', scale: 4, color: W255, usage: 'internal' },
];

const OK = { Door: 0, Double_Door: 1, Sliding_Door: 2, Pocket_Door: 3, Bifold_Door: 4, Garage_Door: 5, Cased_Opening: 6, Window: 7, Casement_Window: 8, Picture_Window: 9, Sliding_Window: 10 };
const OPENING_DEFS = [
  { name: 'Single Door', short: 'Door', win: false, width: 32, height: 80, sill: 0 },
  { name: 'Double Door', short: 'Double', win: false, width: 60, height: 80, sill: 0 },
  { name: 'Sliding Glass Door', short: 'Slider', win: false, width: 72, height: 80, sill: 0 },
  { name: 'Pocket Door', short: 'Pocket', win: false, width: 30, height: 80, sill: 0 },
  { name: 'Bifold Door', short: 'Bifold', win: false, width: 48, height: 80, sill: 0 },
  { name: 'Garage Door', short: 'Garage', win: false, width: 192, height: 84, sill: 0 },
  { name: 'Cased Opening', short: 'Opening', win: false, width: 36, height: 84, sill: 0 },
  { name: 'Double Hung Window', short: 'Dbl Hung', win: true, width: 36, height: 48, sill: 36 },
  { name: 'Casement Window', short: 'Casement', win: true, width: 30, height: 48, sill: 36 },
  { name: 'Picture Window', short: 'Picture', win: true, width: 72, height: 60, sill: 24 },
  { name: 'Sliding Window', short: 'Slide Win', win: true, width: 48, height: 36, sill: 44 },
];

const FK = { Bed_Queen: 0, Bed_King: 1, Bed_Twin: 2, Sofa: 3, Armchair: 4, Coffee_Table: 5, Dining_Table: 6, Desk: 7, Wardrobe: 8, Toilet: 9, Vanity: 10, Bathtub: 11, Shower: 12, Counter: 13, Island: 14, Kitchen_Sink: 15, Range: 16, Refrigerator: 17, Dishwasher: 18, Washer: 19, Dryer: 20, Stairs: 21, Fireplace: 22 };
const FIXTURE_CATS = ['Bedroom & Office', 'Living & Dining', 'Bathroom', 'Kitchen', 'Utility & Stairs'];
const FIXTURE_DEFS = [
  { name: 'Queen Bed', size: [60, 80], height: 24, color: [120, 140, 170, 255], cat: 0 },
  { name: 'King Bed', size: [76, 80], height: 24, color: [150, 120, 110, 255], cat: 0 },
  { name: 'Twin Bed', size: [39, 75], height: 24, color: [110, 150, 130, 255], cat: 0 },
  { name: 'Sofa', size: [84, 36], height: 32, color: [120, 125, 135, 255], cat: 1 },
  { name: 'Armchair', size: [34, 34], height: 32, color: [150, 120, 95, 255], cat: 1 },
  { name: 'Coffee Table', size: [48, 24], height: 18, color: [120, 85, 55, 255], cat: 1 },
  { name: 'Dining Table', size: [72, 40], height: 30, color: [125, 90, 60, 255], cat: 1 },
  { name: 'Desk', size: [54, 26], height: 30, color: [140, 100, 70, 255], cat: 0 },
  { name: 'Wardrobe', size: [48, 24], height: 78, color: [150, 110, 75, 255], cat: 0 },
  { name: 'Toilet', size: [20, 28], height: 30, color: [250, 250, 250, 255], cat: 2 },
  { name: 'Vanity', size: [36, 21], height: 34, color: [245, 245, 240, 255], cat: 2 },
  { name: 'Bathtub', size: [60, 30], height: 20, color: [250, 250, 250, 255], cat: 2 },
  { name: 'Shower', size: [36, 36], height: 78, color: [250, 250, 250, 255], cat: 2 },
  { name: 'Base Cabinets', size: [96, 25], height: 36, color: [240, 238, 232, 255], cat: 3 },
  { name: 'Kitchen Island', size: [72, 36], height: 36, color: [70, 90, 110, 255], cat: 3 },
  { name: 'Sink Cabinet', size: [36, 25], height: 36, color: [240, 238, 232, 255], cat: 3 },
  { name: 'Range', size: [30, 26], height: 36, color: [190, 192, 196, 255], cat: 3 },
  { name: 'Refrigerator', size: [36, 30], height: 70, color: [200, 202, 206, 255], cat: 3 },
  { name: 'Dishwasher', size: [24, 25], height: 36, color: [200, 202, 206, 255], cat: 3 },
  { name: 'Washer', size: [27, 28], height: 38, color: [248, 248, 248, 255], cat: 4 },
  { name: 'Dryer', size: [27, 28], height: 38, color: [248, 248, 248, 255], cat: 4 },
  { name: 'Stairs', size: [36, 120], height: 108, color: [170, 130, 90, 255], cat: 4 },
  { name: 'Fireplace', size: [60, 20], height: 54, color: [160, 150, 140, 255], cat: 1 },
];

const PALETTE = [
  [255, 255, 255], [244, 240, 230], [236, 226, 206], [218, 210, 194], [200, 200, 200],
  [150, 152, 156], [96, 100, 106], [52, 54, 58], [214, 222, 228], [168, 190, 210],
  [108, 138, 170], [58, 78, 108], [204, 216, 192], [142, 162, 122], [86, 108, 78],
  [228, 198, 176], [184, 124, 92], [140, 72, 56], [232, 212, 160], [200, 160, 92],
].map(c => [...c, 255]);

const css = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a !== undefined ? a : (c[3] !== undefined ? c[3] / 255 : 1)})`;
const colEq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

function surf(m, color) { return { mat: m, color: (color || MATERIALS[m].color).slice(), custom: false }; }
function matOf(s) { return (s && s.mat >= 0 && s.mat < MATERIALS.length) ? s.mat : 0; }

function newProject() {
  return {
    version: FILE_VERSION,
    info: { name: 'Untitled House', address: '', client: '', designer: '', notes: '' },
    units: 0, walls: [], openings: [], rooms: [], dims: [], labels: [], fixtures: [],
    ext_surface: surf(M.Lap_Siding), int_surface: surf(M.Paint), floor_surface: surf(M.Hardwood),
    next_id: 1,
  };
}

function projectFixup(p) {
  const d = newProject();
  for (const k of Object.keys(d)) if (p[k] === undefined || p[k] === null) p[k] = d[k];
  p.info = Object.assign(d.info, p.info || {});
  for (const k of ['walls', 'openings', 'rooms', 'dims', 'labels', 'fixtures']) if (!Array.isArray(p[k])) p[k] = [];
  let maxid = 0;
  for (const w of p.walls) maxid = Math.max(maxid, w.id);
  for (const o of p.openings) maxid = Math.max(maxid, o.id);
  if (p.next_id <= maxid) p.next_id = maxid + 1;
  if (!p.ext_surface.color || !p.ext_surface.color[3]) p.ext_surface = surf(M.Lap_Siding);
  if (!p.int_surface.color || !p.int_surface.color[3]) p.int_surface = surf(M.Paint);
  if (!p.floor_surface.color || !p.floor_surface.color[3]) p.floor_surface = surf(M.Hardwood);
  for (const w of p.walls) {
    if (!(w.thickness > 0)) w.thickness = DEFAULT_INT_THICK;
    if (!(w.height > 0)) w.height = DEFAULT_WALL_HEIGHT;
    if (!w.left) w.left = surf(M.Paint);
    if (!w.right) w.right = surf(M.Paint);
  }
  for (const f of p.fixtures) {
    const fd = FIXTURE_DEFS[f.kind] || FIXTURE_DEFS[0];
    if (!f.size || !(f.size[0] > 0)) f.size = fd.size.slice();
    if (!(f.height > 0)) f.height = fd.height;
    if (!f.color || !f.color[3]) f.color = fd.color.slice();
    f.rot = f.rot || 0;
  }
  for (const l of p.labels) if (!(l.size > 0)) l.size = 10;
  for (const r of p.rooms) if (!r.floor) r.floor = surf(M.Hardwood);
  return p;
}

const newId = (p) => p.next_id++;
const wallIndex = (p, id) => p.walls.findIndex(w => w.id === id);
const wallLen = (w) => V.dist(w.a, w.b);
const wallDir = (w) => V.norm(V.sub(w.b, w.a));
const isWindow = (o) => OPENING_DEFS[o.kind].win;

function addWall(p, a, b, thickness, height) {
  const w = { id: newId(p), a: a.slice(), b: b.slice(), thickness, height, left: { ...p.int_surface, color: p.int_surface.color.slice(), custom: false }, right: { ...p.int_surface, color: p.int_surface.color.slice(), custom: false } };
  p.walls.push(w);
  return p.walls.length - 1;
}

function deleteWall(p, idx) {
  const id = p.walls[idx].id;
  p.openings = p.openings.filter(o => o.wall !== id);
  p.walls.splice(idx, 1);
}

function splitWall(p, idx, pt) {
  const w = p.walls[idx];
  const s = V.dist(w.a, pt);
  const nw = JSON.parse(JSON.stringify(w));
  nw.id = newId(p);
  nw.a = pt.slice();
  w.b = pt.slice();
  p.walls.push(nw);
  for (const o of p.openings) if (o.wall === w.id && o.t > s) { o.wall = nw.id; o.t -= s; }
}

// Keeps the wall network a clean planar graph.
function healWalls(p) {
  const EPS = 0.5;
  const pts = [];
  const snap = (v) => { for (const q of pts) if (V.dist(q, v) < EPS) return q.slice(); pts.push(v.slice()); return v; };
  for (const w of p.walls) { w.a = snap(w.a); w.b = snap(w.b); }
  for (let i = p.walls.length - 1; i >= 0; i--) if (wallLen(p.walls[i]) < 1) deleteWall(p, i);
  let guard = 0;
  restart: while (guard++ < 2000) {
    const n = p.walls.length;
    for (let i = 0; i < n; i++) {
      const wi = p.walls[i], li = wallLen(wi);
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const wj = p.walls[j];
        for (const e of [wj.a, wj.b]) {
          const r = distPointSeg(e, wi.a, wi.b);
          if (r.d < EPS && r.t * li > EPS && (1 - r.t) * li > EPS) { splitWall(p, i, e); continue restart; }
        }
        const lj = wallLen(wj);
        const x = segIntersect(wi.a, wi.b, wj.a, wj.b);
        if (x && x.t * li > EPS && (1 - x.t) * li > EPS && x.u * lj > EPS && (1 - x.u) * lj > EPS) {
          splitWall(p, i, x.p); splitWall(p, j, x.p); continue restart;
        }
      }
    }
    break;
  }
  for (let i = p.walls.length - 1; i >= 0; i--) {
    const wi = p.walls[i];
    for (let j = 0; j < i; j++) {
      const wj = p.walls[j];
      const same = (V.eq(wi.a, wj.a) && V.eq(wi.b, wj.b)) || (V.eq(wi.a, wj.b) && V.eq(wi.b, wj.a));
      if (same) {
        const flip = V.eq(wi.a, wj.b);
        for (const o of p.openings) if (o.wall === wi.id) { o.wall = wj.id; if (flip) o.t = wallLen(wj) - o.t; }
        p.walls.splice(i, 1);
        break;
      }
    }
  }
  p.openings = p.openings.filter(o => wallIndex(p, o.wall) >= 0);
}

function fixtureAxes(f) { const r = f.rot * DEG; return [[Math.cos(r), Math.sin(r)], [-Math.sin(r), Math.cos(r)]]; }
function fixL2W(f, l) { const [ax, ay] = fixtureAxes(f); return [f.pos[0] + ax[0] * l[0] + ay[0] * l[1], f.pos[1] + ax[1] * l[0] + ay[1] * l[1]]; }
function fixW2L(f, w) { const [ax, ay] = fixtureAxes(f); const d = V.sub(w, f.pos); return [V.dot(d, ax), V.dot(d, ay)]; }
function fixContains(f, w, pad = 0) { const l = fixW2L(f, w); return Math.abs(l[0]) <= f.size[0] / 2 + pad && Math.abs(l[1]) <= f.size[1] / 2 + pad; }
function fixCorners(f) { const hx = f.size[0] / 2, hy = f.size[1] / 2; return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(l => fixL2W(f, l)); }
function makeFixture(kind, pos, rot) { const d = FIXTURE_DEFS[kind]; return { kind, pos: pos.slice(), size: d.size.slice(), rot, height: d.height, color: d.color.slice() }; }
function makeOpening(p, kind, wallId, t, width, height, sill) { return { id: newId(p), wall: wallId, kind, t, width, height, sill, flip_side: false, flip_hinge: false }; }
