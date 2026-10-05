'use strict';
// Sample house: 48' x 30' ranch with an attached 20' x 20' garage.

function addOpeningAt(p, kind, pt, width, toward, height, sill) {
  let best = -1, bd = 1e30;
  p.walls.forEach((w, i) => { const d = distPointSeg(pt, w.a, w.b).d; if (d < bd) { bd = d; best = i; } });
  if (best < 0 || bd > 4) return;
  const w = p.walls[best], def = OPENING_DEFS[kind];
  const o = makeOpening(p, kind, w.id, V.dot(V.sub(pt, w.a), wallDir(w)), width, height || def.height, sill ?? def.sill);
  if (toward) o.flip_side = V.dot(V.sub(toward, w.a), V.perp(wallDir(w))) < 0;
  p.openings.push(o);
}

function buildSample() {
  const p = newProject();
  Object.assign(p.info, {
    name: 'Maple Street Residence', address: '1247 Maple Street, Springfield', client: 'Jordan & Taylor Reed', designer: 'FloorPlan Studio',
    notes: 'All dimensions are to face of framing unless noted otherwise. Verify all dimensions on site before construction. Wall heights 9\'-0" typical.',
  });
  const E = DEFAULT_EXT_THICK, I = DEFAULT_INT_THICK, H = DEFAULT_WALL_HEIGHT;
  const walls = [[[0, 0], [576, 0], E], [[576, 0], [576, 120], E], [[576, 120], [816, 120], E], [[816, 120], [816, 360], E], [[816, 360], [0, 360], E], [[0, 360], [0, 0], E],
    [[576, 120], [576, 360], E], [[216, 0], [216, 360], I], [[0, 180], [216, 180], I], [[432, 0], [432, 360], I], [[432, 216], [576, 216], I]];
  for (const [a, b, t] of walls) addWall(p, a, b, t, H);
  healWalls(p);
  addOpeningAt(p, OK.Door, [324, 360], 36, [324, 300]);
  addOpeningAt(p, OK.Sliding_Door, [324, 0], 72);
  addOpeningAt(p, OK.Door, [216, 140], 32, [150, 140]);
  addOpeningAt(p, OK.Door, [216, 222], 32, [150, 222]);
  addOpeningAt(p, OK.Cased_Opening, [432, 100], 60);
  addOpeningAt(p, OK.Door, [432, 300], 30, [500, 300]);
  addOpeningAt(p, OK.Door, [576, 180], 32, [620, 180]);
  addOpeningAt(p, OK.Door, [816, 200], 32, [760, 200]);
  addOpeningAt(p, OK.Garage_Door, [696, 360], 192);
  addOpeningAt(p, OK.Window, [108, 0], 48);
  addOpeningAt(p, OK.Window, [0, 90], 36);
  addOpeningAt(p, OK.Window, [0, 270], 36);
  addOpeningAt(p, OK.Window, [108, 360], 48);
  addOpeningAt(p, OK.Picture_Window, [396, 360], 48, null, 60, 24);
  addOpeningAt(p, OK.Window, [504, 0], 48, null, 42, 42);
  addOpeningAt(p, OK.Sliding_Window, [520, 360], 30, null, 30, 50);
  addOpeningAt(p, OK.Window, [816, 300], 36);
  const tag = (pos, name, m, col = W255) => p.rooms.push({ pos, name, floor: { mat: m, color: col.slice(), custom: true } });
  tag([108, 90], 'Primary Bedroom', M.Carpet, [214, 206, 192, 255]);
  tag([108, 270], 'Bedroom 2', M.Carpet, [200, 206, 214, 255]);
  tag([324, 180], 'Great Room', M.Hardwood);
  tag([504, 108], 'Kitchen', M.Floor_Tile);
  tag([504, 288], 'Bath', M.Floor_Tile, [232, 236, 240, 255]);
  tag([696, 240], 'Garage', M.Concrete);
  const fx = (k, pos, rot, w) => { const f = makeFixture(k, pos, rot); if (w) f.size[0] = w; p.fixtures.push(f); };
  fx(FK.Bed_Queen, [43, 90], -90); fx(FK.Wardrobe, [168, 15.25], 0); fx(FK.Bed_Twin, [40.5, 300], -90); fx(FK.Desk, [165, 344], 180);
  fx(FK.Fireplace, [228.25, 300], -90); fx(FK.Sofa, [392, 300], 90); fx(FK.Coffee_Table, [320, 300], 90); fx(FK.Armchair, [300, 228], 160);
  fx(FK.Dining_Table, [324, 105], 0); fx(FK.Refrigerator, [452.25, 18], 0); fx(FK.Kitchen_Sink, [504, 15.5], 0, 48); fx(FK.Counter, [550.5, 15.5], 0, 45);
  fx(FK.Range, [560, 72], 90); fx(FK.Island, [500, 140], 0, 60); fx(FK.Bathtub, [543, 342], 180); fx(FK.Toilet, [559, 268], 90);
  fx(FK.Vanity, [480, 228.75], 0); fx(FK.Washer, [593, 246], -90); fx(FK.Dryer, [593, 276], -90);
  p.labels.push({ pos: [324, -126], text: 'REAR PATIO', size: 9 }, { pos: [696, 450], text: 'DRIVEWAY', size: 9 }, { pos: [324, 450], text: 'FRONT ENTRY', size: 9 });
  const D = computeDerived(p);
  p.walls.forEach((w, i) => {
    if (Math.abs(w.a[1] - 360) < 0.5 && Math.abs(w.b[1] - 360) < 0.5) {
      const brick = { mat: M.Brick, color: W255.slice(), custom: true };
      if (D.geo[i].extL) w.left = brick;
      if (D.geo[i].extR) w.right = { ...brick, color: W255.slice() };
    }
  });
  p.ext_surface = { mat: M.Lap_Siding, color: [214, 222, 228, 255], custom: false };
  return p;
}

function loadSample() {
  app.p = buildSample();
  app.fileName = '';
  app.modified = false;
  app.dirty = true;
  app.welcome = false;
  app.sel = [];
  resetHistory();
  app.v3.initializedCam = false;
  zoomFit();
  app.panelDirty = true;
  toast('Loaded sample house — press Tab to view it in 3D');
}
