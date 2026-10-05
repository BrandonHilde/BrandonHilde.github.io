'use strict';
// 2D plan editing: input state, snapping, hit testing, tools, dragging and screen overlays.

const inp = {
  mouse: [0, 0], inCanvas: false, down: [false, false, false], pressed: [false, false, false], released: [false, false, false],
  wheel: 0, delta: [0, 0], keys: new Set(), kp: new Set(), kr: new Set(), chars: [],
  get shift() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); },
  get ctrl() { return this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('MetaLeft') || this.keys.has('MetaRight'); },
  get alt() { return this.keys.has('AltLeft') || this.keys.has('AltRight'); },
  endFrame() {
    this.pressed = [false, false, false]; this.released = [false, false, false];
    this.wheel = 0; this.delta = [0, 0]; this.kp.clear(); this.kr.clear(); this.chars = [];
  },
};
const kp = (code) => inp.kp.has(code);
const kpr = (code) => inp.kp.has(code) || inp.kr.has(code);

function screenCv(ctx) {
  return new Cv({ ctx, offset: app.offset, scale: app.zoom, lw: 1, ts: clamp(app.zoom * 0.9, 1.15, 4.5), minText: 9, minLine: 1 });
}

// ---------------------------------------------------------------- snapping
function snapPoint(world, from, walls, opts = {}) {
  const res = { pt: world.slice(), kind: 'none', gx: null, gy: null };
  if (opts.free) return res;
  const tol = 10 / app.zoom;
  const ex = (q) => opts.exclude && V.dist(q, opts.exclude) < 0.5;
  let best = tol;
  for (const w of walls) for (const e of [w.a, w.b]) {
    if (ex(e)) continue;
    const d = V.dist(world, e);
    if (d < best) { best = d; res.pt = e.slice(); res.kind = 'end'; }
  }
  if (res.kind !== 'none') return res;
  if (opts.corners && app.D) {
    for (const g of app.D.geo) for (const e of [g.la, g.lb, g.ra, g.rb]) {
      const d = V.dist(world, e);
      if (d < best) { best = d; res.pt = e.slice(); res.kind = 'end'; }
    }
    if (res.kind !== 'none') return res;
  }
  for (const w of walls) {
    if (ex(w.a) || ex(w.b)) continue;
    const m = V.lerp(w.a, w.b, 0.5), d = V.dist(world, m);
    if (d < tol * 0.8 && d < best) { best = d; res.pt = m; res.kind = 'mid'; }
  }
  if (res.kind !== 'none') return res;
  let pt = world.slice(), kind = 'none', freeX = true, freeY = true;
  if (from && app.angleSnap) {
    const v = V.sub(world, from);
    let l = V.len(v);
    if (l > 1e-3) {
      const ang = Math.atan2(v[1], v[0]), step = Math.PI / 4, sa = Math.round(ang / step) * step;
      if (Math.abs(ang - sa) < 8 * DEG) {
        let dir = [Math.cos(sa), Math.sin(sa)];
        dir = dir.map(c => Math.abs(c) < 1e-4 ? 0 : c);
        if (app.snapOn) l = Math.round(l / app.grid) * app.grid;
        pt = V.add(from, V.mul(dir, l));
        kind = 'angle';
        freeX = dir[1] === 0; freeY = dir[0] === 0;
      }
    }
  }
  if (kind === 'none') {
    for (const w of walls) {
      if (ex(w.a) || ex(w.b)) continue;
      const r = distPointSeg(world, w.a, w.b);
      if (r.d < tol * 0.8 && r.d < best) {
        best = r.d;
        const l = wallLen(w);
        let s = r.t * l;
        if (app.snapOn) s = clamp(Math.round(s / app.grid) * app.grid, 0, l);
        res.pt = V.add(w.a, V.mul(wallDir(w), s)); res.kind = 'onwall';
      }
    }
    if (res.kind !== 'none') return res;
    if (app.snapOn) { pt = [snapF(world[0], app.grid), snapF(world[1], app.grid)]; kind = 'grid'; }
  }
  const gt = 7 / app.zoom;
  let bx = gt, by = gt;
  for (const w of walls) for (const e of [w.a, w.b]) {
    if (ex(e)) continue;
    if (freeX && Math.abs(world[0] - e[0]) < bx && Math.abs(world[1] - e[1]) > gt) { bx = Math.abs(world[0] - e[0]); pt[0] = e[0]; res.gx = e; }
    if (freeY && Math.abs(world[1] - e[1]) < by && Math.abs(world[0] - e[0]) > gt) { by = Math.abs(world[1] - e[1]); pt[1] = e[1]; res.gy = e; }
  }
  res.pt = pt; res.kind = kind;
  return res;
}

// ---------------------------------------------------------------- hit testing
function labelExtent(l) {
  const c = screenCv(null), px = c.textPx(l.size);
  return [measureText(l.text, px) / 2 / app.zoom, px / 2 / app.zoom];
}
function dimHit(dm, w, tol) {
  const n = V.perp(V.norm(V.sub(dm.b, dm.a)));
  return distPointSeg(w, V.add(dm.a, V.mul(n, dm.offset)), V.add(dm.b, V.mul(n, dm.offset))).d < tol * 1.6;
}
function hitTest(w) {
  const p = app.p, D = app.D, tol = 6 / app.zoom;
  for (let i = 0; i < p.openings.length; i++) {
    const o = p.openings[i], wi = wallIndex(p, o.wall);
    if (wi < 0) continue;
    const wall = p.walls[wi], g = D.geo[wi], rel = V.sub(w, wall.a);
    const t = V.dot(rel, g.dir), off = V.dot(rel, g.n);
    if (Math.abs(t - o.t) <= o.width / 2 && Math.abs(off) <= wall.thickness / 2 + tol) return { kind: 'opening', idx: i };
    if (o.kind === OK.Door || o.kind === OK.Double_Door) {
      const so = off * (o.flip_side ? -1 : 1);
      if (so > 0 && so < o.width * 0.8 && Math.abs(t - o.t) <= o.width / 2 * 0.8) return { kind: 'opening', idx: i };
    }
  }
  for (let i = 0; i < p.labels.length; i++) {
    const l = p.labels[i], e = labelExtent(l);
    if (Math.abs(w[0] - l.pos[0]) <= e[0] + tol && Math.abs(w[1] - l.pos[1]) <= e[1] + tol) return { kind: 'label', idx: i };
  }
  for (let i = 0; i < p.dims.length; i++) if (dimHit(p.dims[i], w, tol)) return { kind: 'dim', idx: i };
  for (let i = 0; i < p.walls.length; i++) {
    const g = D.geo[i], wall = p.walls[i];
    if (pointInPoly(w, [g.la, g.lb, g.rb, g.ra]) || distPointSeg(w, wall.a, wall.b).d < wall.thickness / 2 + tol * 0.5) return { kind: 'wall', idx: i };
  }
  for (let i = p.fixtures.length - 1; i >= 0; i--) if (fixContains(p.fixtures[i], w, tol * 0.5)) return { kind: 'fixture', idx: i };
  const ri = roomAt(D, w);
  if (ri >= 0) return { kind: 'room', idx: ri };
  return null;
}

function boxSelect(w0, w1, crossing) {
  const mn = [Math.min(w0[0], w1[0]), Math.min(w0[1], w1[1])], mx = [Math.max(w0[0], w1[0]), Math.max(w0[1], w1[1])];
  const inside = (q) => q[0] >= mn[0] && q[0] <= mx[0] && q[1] >= mn[1] && q[1] <= mx[1];
  const segHits = (a, b) => {
    if (inside(a) || inside(b)) return true;
    const c = [mn, [mx[0], mn[1]], mx, [mn[0], mx[1]]];
    for (let i = 0; i < 4; i++) if (segIntersect(a, b, c[i], c[(i + 1) % 4])) return true;
    return false;
  };
  const add = (s) => { if (!isSelected(s)) app.sel.push(s); };
  const p = app.p;
  p.walls.forEach((w, i) => { if (crossing ? segHits(w.a, w.b) : inside(w.a) && inside(w.b)) add({ kind: 'wall', idx: i }); });
  p.fixtures.forEach((f, i) => {
    const cs = fixCorners(f);
    if (crossing ? (inside(f.pos) || cs.some(inside)) : cs.every(inside)) add({ kind: 'fixture', idx: i });
  });
  p.labels.forEach((l, i) => { if (inside(l.pos)) add({ kind: 'label', idx: i }); });
  p.dims.forEach((d, i) => { if (crossing ? inside(d.a) || inside(d.b) : inside(d.a) && inside(d.b)) add({ kind: 'dim', idx: i }); });
  if (!app.sel.length) p.openings.forEach((o, i) => {
    const wi = wallIndex(p, o.wall);
    if (wi >= 0 && inside(V.add(p.walls[wi].a, V.mul(wallDir(p.walls[wi]), o.t)))) add({ kind: 'opening', idx: i });
  });
  app.panelDirty = true;
}

// ---------------------------------------------------------------- previews
function nearestWall(world, extra) {
  let best = -1, bd = 1e30;
  app.p.walls.forEach((w, i) => { const d = distPointSeg(world, w.a, w.b).d; if (d < w.thickness / 2 + extra && d < bd) { bd = d; best = i; } });
  return best;
}
function openingPreview(world, width, ignore = -1, free = false) {
  const pv = { ok: false, valid: false, wi: -1, t: 0, flipSide: false };
  const wi = nearestWall(world, 16 / app.zoom + 6);
  if (wi < 0) return pv;
  const p = app.p, w = p.walls[wi], g = app.D.geo[wi];
  pv.ok = true; pv.wi = wi;
  let t = V.dot(V.sub(world, w.a), g.dir);
  const [c0, c1] = wallClearRange(p, app.D, wi);
  if (app.snapOn && !free) {
    t = c0 + Math.round((t - width / 2 - c0) / app.grid) * app.grid + width / 2;
    const mid = (c0 + c1) / 2;
    if (Math.abs(t - mid) < 8) t = mid;
  }
  const lo = c0 + width / 2 + 0.5, hi = c1 - width / 2 - 0.5;
  pv.valid = hi >= lo;
  if (pv.valid) t = clamp(t, lo, hi);
  pv.t = t;
  p.openings.forEach((o, i) => { if (i !== ignore && o.wall === w.id && Math.abs(o.t - t) < (o.width + width) / 2) pv.valid = false; });
  pv.flipSide = V.dot(V.sub(world, w.a), g.n) < 0;
  return pv;
}
function fixturePreview(world, kind, rot, free) {
  const pos = app.snapOn && !free ? [Math.round(world[0]), Math.round(world[1])] : world;
  const f = makeFixture(kind, pos, rot);
  if (free) return f;
  let best = -1, bd = 1e30;
  app.p.walls.forEach((w, i) => { const d = distPointSeg(world, w.a, w.b).d; if (d < f.size[1] / 2 + w.thickness / 2 + 14 && d < bd) { bd = d; best = i; } });
  if (best >= 0) {
    const w = app.p.walls[best], n = V.perp(wallDir(w));
    const v = V.mul(n, V.dot(V.sub(world, w.a), n) >= 0 ? 1 : -1);
    f.rot = Math.atan2(-v[0], v[1]) / DEG;
    f.pos = V.add(distPointSeg(world, w.a, w.b).c, V.mul(v, w.thickness / 2 + f.size[1] / 2 + 0.25));
  }
  return f;
}

// ---------------------------------------------------------------- tools
function setTool(t) {
  app.tool = t;
  app.drawing = false;
  app.dimStage = 0;
  app.typed = '';
  if (t === 'door' && OPENING_DEFS[app.openKind].win) setOpenKind(OK.Door);
  if (t === 'window' && !OPENING_DEFS[app.openKind].win) setOpenKind(OK.Window);
  if (t !== 'select') app.sel = [];
  app.panelDirty = true;
}
function finishChain() { app.drawing = false; app.chainCount = 0; app.typed = ''; }
function placeWallPoint(pt) {
  if (!app.drawing) { app.drawing = true; app.chainStart = pt.slice(); app.lastPt = pt.slice(); app.chainCount = 0; return; }
  if (V.dist(pt, app.lastPt) < 1) { finishChain(); return; }
  addWall(app.p, app.lastPt, pt, app.wallExt ? app.extThick : app.intThick, app.wallHeight);
  healWalls(app.p);
  commit();
  app.chainCount++;
  if (V.dist(pt, app.chainStart) < 1 && app.chainCount >= 2) finishChain();
  else app.lastPt = pt.slice();
}
function createRoomRect(p0, p1) {
  const x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), y1 = Math.max(p0[1], p1[1]);
  if (x1 - x0 < 12 || y1 - y0 < 12) return;
  const p = app.p, t = app.wallExt ? app.extThick : app.intThick, h = app.wallHeight;
  addWall(p, [x0, y0], [x1, y0], t, h); addWall(p, [x1, y0], [x1, y1], t, h);
  addWall(p, [x1, y1], [x0, y1], t, h); addWall(p, [x0, y1], [x0, y0], t, h);
  healWalls(p);
  commit();
  toast(`Room ${formatLength(x1 - x0, p.units)} x ${formatLength(y1 - y0, p.units)}`);
}
function typedInput() {
  for (const ch of inp.chars) {
    if (/[0-9'".\/ \-xXmcin*]/.test(ch) && app.typed.length < 40) app.typed += (ch === 'X' || ch === '*') ? 'x' : ch;
  }
  if (kpr('Backspace') && app.typed.length) app.typed = app.typed.slice(0, -1);
  return kp('Enter') || kp('NumpadEnter');
}

function beginMove() {
  const p = app.p;
  app.orig = { walls: JSON.parse(JSON.stringify(p.walls)), fix: JSON.parse(JSON.stringify(p.fixtures)), labels: JSON.parse(JSON.stringify(p.labels)), dims: JSON.parse(JSON.stringify(p.dims)) };
  app.dragNodes = [];
  for (const s of app.sel) if (s.kind === 'wall' && s.idx < p.walls.length) app.dragNodes.push(p.walls[s.idx].a.slice(), p.walls[s.idx].b.slice());
}
function applyMove(delta) {
  const p = app.p, o = app.orig;
  const inNodes = (q) => app.dragNodes.some(n => V.dist(n, q) < 0.5);
  o.walls.forEach((ow, i) => {
    if (i >= p.walls.length) return;
    p.walls[i].a = inNodes(ow.a) ? V.add(ow.a, delta) : ow.a.slice();
    p.walls[i].b = inNodes(ow.b) ? V.add(ow.b, delta) : ow.b.slice();
  });
  for (const s of app.sel) {
    if (s.kind === 'fixture' && o.fix[s.idx]) p.fixtures[s.idx].pos = V.add(o.fix[s.idx].pos, delta);
    if (s.kind === 'label' && o.labels[s.idx]) p.labels[s.idx].pos = V.add(o.labels[s.idx].pos, delta);
    if (s.kind === 'dim' && o.dims[s.idx]) { p.dims[s.idx].a = V.add(o.dims[s.idx].a, delta); p.dims[s.idx].b = V.add(o.dims[s.idx].b, delta); }
  }
  app.dirty = true;
}
function dragAnchor() {
  const h = app.dragHit, o = app.orig;
  if (!h) return app.dragStartW;
  if (h.kind === 'wall' && o.walls[h.idx]) { const w = o.walls[h.idx]; return V.dist(w.a, app.dragStartW) < V.dist(w.b, app.dragStartW) ? w.a : w.b; }
  if (h.kind === 'fixture' && o.fix[h.idx]) return o.fix[h.idx].pos;
  if (h.kind === 'label' && o.labels[h.idx]) return o.labels[h.idx].pos;
  if (h.kind === 'dim' && o.dims[h.idx]) return o.dims[h.idx].a;
  return app.dragStartW;
}
function endDragCommit() {
  const n = app.p.walls.length;
  healWalls(app.p);
  if (app.p.walls.length !== n) app.sel = app.sel.filter(s => s.kind !== 'wall');
  commit();
}

function planInput() {
  const p = app.p, mouse = inp.mouse, world = toWorld(mouse);
  app.mouseWorld = world;
  const inC = inp.inCanvas && !modalOpen();
  const shift = inp.shift, ctrl = inp.ctrl, alt = inp.alt;
  const space = inp.keys.has('Space');
  const lpress = inC && inp.pressed[0] && !space;
  const lrelease = inp.released[0];

  if (inC && inp.wheel) zoomAt(mouse, Math.pow(1.15, -Math.sign(inp.wheel) * Math.min(Math.abs(inp.wheel) / 100, 3)));
  if (inC && (inp.pressed[1] || (space && inp.pressed[0]))) app.drag = 'pan';
  if (inC && inp.pressed[2]) { app.rpress = mouse.slice(); app.rpanning = false; }
  if (inp.down[2] && app.drag === 'none') {
    if (V.dist(mouse, app.rpress) > 4) app.rpanning = true;
    if (app.rpanning) app.offset = V.add(app.offset, inp.delta);
  }
  let rightClick = false;
  if (inp.released[2]) { if (!app.rpanning && inC) rightClick = true; app.rpanning = false; }
  if (app.drag === 'pan') {
    app.offset = V.add(app.offset, inp.delta);
    if (inp.released[1] || inp.released[0]) app.drag = 'none';
    return;
  }

  // keyboard
  if (!modalOpen()) {
    const busy = (app.tool === 'wall' || app.tool === 'room') && app.drawing && app.typed.length > 0;
    if (!busy && !ctrl) {
      const keyTools = { KeyV: 'select', KeyW: 'wall', KeyR: 'room', KeyD: 'door', KeyN: 'window', KeyM: 'dimension', KeyT: 'text', KeyF: 'fixture' };
      for (const k in keyTools) if (kp(k)) setTool(keyTools[k]);
      if (kp('KeyG')) { app.snapOn = !app.snapOn; toast(app.snapOn ? 'Snapping on' : 'Snapping off'); app.panelDirty = true; }
      if (kp('KeyX') && (app.tool === 'wall' || app.tool === 'room')) { app.wallExt = !app.wallExt; toast(app.wallExt ? 'Exterior walls' : 'Interior walls'); app.panelDirty = true; }
      if (kp('Home') || kp('KeyZ')) zoomFit();
    }
    if (kp('Escape')) {
      if (app.drawing) finishChain();
      else if (app.dimStage > 0) app.dimStage = 0;
      else if (app.drag !== 'none') app.drag = 'none';
      else if (app.sel.length) { app.sel = []; app.panelDirty = true; }
      else setTool('select');
    }
    if (app.tool === 'select') {
      if ((kp('Delete') || kp('Backspace')) && app.sel.length) deleteSelection();
      if (ctrl && kp('KeyA')) selectAll();
      if (ctrl && kp('KeyD')) duplicateSelection();
      if (kp('KeyQ') || kp('KeyE')) {
        const dir = kp('KeyE') ? 1 : -1;
        let changed = false;
        for (const s of app.sel) {
          if (s.kind === 'fixture') { p.fixtures[s.idx].rot = wrapDeg(p.fixtures[s.idx].rot + dir * (shift ? 15 : 90)); changed = true; }
          if (s.kind === 'opening') { const o = p.openings[s.idx]; if (dir < 0) o.flip_side = !o.flip_side; else o.flip_hinge = !o.flip_hinge; changed = true; }
        }
        if (changed) commit();
      }
      const step = shift ? 1 : app.grid;
      const nudge = [(kpr('ArrowRight') ? step : 0) - (kpr('ArrowLeft') ? step : 0), (kpr('ArrowDown') ? step : 0) - (kpr('ArrowUp') ? step : 0)];
      if ((nudge[0] || nudge[1]) && app.sel.length) { beginMove(); applyMove(nudge); endDragCommit(); }
    }
    if (app.tool === 'fixture') {
      if (kp('KeyQ')) app.fixRot = wrapDeg(app.fixRot - (shift ? 15 : 90));
      if (kp('KeyE')) app.fixRot = wrapDeg(app.fixRot + (shift ? 15 : 90));
    }
    if ((app.tool === 'door' || app.tool === 'window') && kp('KeyE')) app.prevFlipHinge = !app.prevFlipHinge;
  }

  switch (app.tool) {
    case 'wall':
      app.snap = snapPoint(world, app.drawing ? app.lastPt : null, p.walls, { free: shift });
      if (app.drawing && typedInput()) {
        if (app.typed.length) {
          const l = parseLength(app.typed, p.units);
          if (l !== null && l > 0.5) {
            let dir = V.sub(app.snap.pt, app.lastPt);
            if (V.len(dir) < 1e-3) dir = [1, 0];
            placeWallPoint(V.add(app.lastPt, V.mul(V.norm(dir), l)));
          } else toast('Could not read that length', false);
          app.typed = '';
        } else finishChain();
      }
      if (lpress) {
        const now = performance.now() / 1000;
        if (app.drawing && now - app.lastClickTime < 0.3) finishChain(); else placeWallPoint(app.snap.pt);
        app.lastClickTime = now;
      }
      if (rightClick) finishChain();
      break;
    case 'room':
      app.snap = snapPoint(world, null, p.walls, { free: shift });
      if (app.drawing && typedInput()) {
        const s = app.typed, i = s.indexOf('x');
        if (i > 0) {
          const wv = parseLength(s.slice(0, i), p.units), hv = parseLength(s.slice(i + 1), p.units);
          if (wv !== null && hv !== null) {
            const sx = world[0] >= app.chainStart[0] ? 1 : -1, sy = world[1] >= app.chainStart[1] ? 1 : -1;
            createRoomRect(app.chainStart, V.add(app.chainStart, [wv * sx, hv * sy]));
            app.drawing = false;
          } else toast('Type a size like 12x14 or 12\'6"x10\'', false);
        } else if (s.length) toast('Type a size like 12x14', false);
        app.typed = '';
      }
      if (lpress) {
        if (!app.drawing) { app.drawing = true; app.chainStart = app.snap.pt.slice(); app.dragStartS = mouse.slice(); }
        else { createRoomRect(app.chainStart, app.snap.pt); app.drawing = false; }
      }
      if (lrelease && app.drawing && V.dist(mouse, app.dragStartS) > 12) { createRoomRect(app.chainStart, app.snap.pt); app.drawing = false; }
      if (rightClick) app.drawing = false;
      break;
    case 'door': case 'window': {
      const pv = openingPreview(world, app.openW, -1, shift);
      if (lpress && pv.ok && pv.valid) {
        const o = makeOpening(p, app.openKind, p.walls[pv.wi].id, pv.t, app.openW, app.openH, app.openSill);
        o.flip_side = pv.flipSide; o.flip_hinge = app.prevFlipHinge;
        p.openings.push(o);
        commit();
      } else if (lpress && pv.ok) toast('Opening does not fit here', false);
      if (rightClick) setTool('select');
      break;
    }
    case 'fixture':
      if (lpress) { p.fixtures.push(fixturePreview(world, app.fixKind, app.fixRot, alt || shift)); commit(); }
      if (rightClick) setTool('select');
      break;
    case 'text':
      if (lpress) {
        const pos = app.snapOn && !shift ? [snapF(world[0], app.grid), snapF(world[1], app.grid)] : world;
        p.labels.push({ pos, text: 'Label', size: 10 });
        commit();
        app.tool = 'select';
        selectOnly({ kind: 'label', idx: p.labels.length - 1 });
        app.focusLabel = true;
      }
      break;
    case 'dimension':
      app.snap = snapPoint(world, app.dimStage === 1 ? app.dimA : null, p.walls, { free: shift, corners: true });
      if (lpress) {
        if (app.dimStage === 0) { app.dimA = app.snap.pt.slice(); app.dimStage = 1; }
        else if (app.dimStage === 1) { if (V.dist(app.snap.pt, app.dimA) > 1) { app.dimB = app.snap.pt.slice(); app.dimStage = 2; } }
        else {
          let off = V.dot(V.sub(world, app.dimA), V.perp(V.norm(V.sub(app.dimB, app.dimA))));
          if (app.snapOn && !shift) off = snapF(off, 3);
          p.dims.push({ a: app.dimA, b: app.dimB, offset: off });
          commit();
          app.dimStage = 0;
        }
      }
      if (rightClick) app.dimStage = 0;
      break;
    case 'select':
      selectInput(world, mouse, inC, lpress, lrelease, shift, ctrl);
      break;
  }
}

function selectInput(world, mouse, inC, lpress, lrelease, shift, ctrl) {
  const p = app.p;
  if (app.drag === 'none' && inC) app.hover = hitTest(world);
  else if (!inC) app.hover = null;
  if (lpress) {
    app.dragStartW = world; app.dragStartS = mouse.slice();
    const htol = 8 / app.zoom;
    for (const s of app.sel) {
      if (s.kind !== 'wall' || s.idx >= p.walls.length) continue;
      const w = p.walls[s.idx];
      for (const [e, o] of [[w.a, w.b], [w.b, w.a]]) {
        if (V.dist(world, e) < htol) { app.drag = 'handle'; app.handleNode = e.slice(); app.handleOther = o.slice(); beginMove(); return; }
      }
    }
    const hit = hitTest(world);
    if (hit) {
      if (hit.kind === 'room') app.roomPick = world;
      if (shift || ctrl) toggleSelect(hit);
      else if (!isSelected(hit)) selectOnly(hit);
      app.panelDirty = true;
      app.dragHit = hit;
      app.drag = hit.kind === 'room' ? 'none' : 'pending';
    } else {
      if (!shift && !ctrl) { app.sel = []; app.panelDirty = true; }
      app.drag = 'box';
    }
  }
  if (inp.down[0]) {
    if (app.drag === 'pending' && V.dist(mouse, app.dragStartS) > 4) {
      const onlyOpen = app.sel.every(s => s.kind === 'opening');
      if (app.dragHit.kind === 'opening' && onlyOpen) app.drag = 'slide';
      else {
        app.sel = app.sel.filter(s => s.kind !== 'room' && s.kind !== 'opening');
        if (!app.sel.length) app.drag = 'none'; else { app.drag = 'move'; beginMove(); }
      }
    } else if (app.drag === 'move') {
      const raw = V.sub(world, app.dragStartW);
      let delta = raw;
      if (app.snapOn && !inp.shift) {
        const an = dragAnchor(), t = V.add(an, raw);
        delta = V.sub([snapF(t[0], app.grid), snapF(t[1], app.grid)], an);
      }
      applyMove(delta);
    } else if (app.drag === 'handle') {
      app.orig.walls.forEach((ow, i) => { if (i < p.walls.length) p.walls[i] = JSON.parse(JSON.stringify(ow)); });
      app.snap = snapPoint(world, app.handleOther, app.orig.walls, { exclude: app.handleNode, free: inp.shift });
      moveNode(p, app.handleNode, app.snap.pt);
      app.dirty = true;
    } else if (app.drag === 'slide') {
      const oi = app.dragHit.idx, o = p.openings[oi];
      if (o) {
        const pv = openingPreview(world, o.width, oi, inp.shift);
        if (pv.ok && pv.valid) { o.wall = p.walls[pv.wi].id; o.t = pv.t; app.dirty = true; }
      }
    }
  }
  if (lrelease) {
    if (app.drag === 'move' || app.drag === 'handle' || app.drag === 'slide') endDragCommit();
    else if (app.drag === 'box' && V.dist(mouse, app.dragStartS) > 4) boxSelect(app.dragStartW, world, world[0] < app.dragStartW[0]);
    app.drag = 'none';
  }
}

// ---------------------------------------------------------------- drawing
const ACC = '#3e8aff', ACC_FILL = 'rgba(62,138,255,0.2)';

function drawGrid(ctx) {
  ctx.fillStyle = '#f9fafc';
  ctx.fillRect(0, 0, app.cw, app.ch);
  if (!app.showGrid) return;
  const w0 = toWorld([0, 0]), w1 = toWorld([app.cw, app.ch]);
  let minor = 1200;
  for (const s of [1, 3, 6, 12, 24, 48, 120, 240, 480, 1200]) if (s >= app.grid * 0.99 && s * app.zoom >= 9) { minor = s; break; }
  let major = 1200;
  for (const s of [12, 60, 120, 240, 600, 1200]) if (s > minor && s * app.zoom >= 48) { major = s; break; }
  const lines = (step, col) => {
    ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath();
    for (let x = Math.floor(w0[0] / step) * step; x <= w1[0]; x += step) { const sx = Math.round(app.offset[0] + x * app.zoom) + 0.5; ctx.moveTo(sx, 0); ctx.lineTo(sx, app.ch); }
    for (let y = Math.floor(w0[1] / step) * step; y <= w1[1]; y += step) { const sy = Math.round(app.offset[1] + y * app.zoom) + 0.5; ctx.moveTo(0, sy); ctx.lineTo(app.cw, sy); }
    ctx.stroke();
  };
  lines(minor, '#eceff4');
  lines(major, '#dadfe8');
  const o = toScreen([0, 0]);
  ctx.strokeStyle = '#c8d0de'; ctx.beginPath();
  ctx.moveTo(o[0] + 0.5, 0); ctx.lineTo(o[0] + 0.5, app.ch); ctx.moveTo(0, o[1] + 0.5); ctx.lineTo(app.cw, o[1] + 0.5); ctx.stroke();
}

function drawSelOutline(c, ctx, s, col, fill, handles) {
  const p = app.p, D = app.D;
  if (!s) return;
  if (s.kind === 'wall') {
    if (s.idx >= p.walls.length) return;
    const g = D.geo[s.idx], q = [g.la, g.lb, g.rb, g.ra];
    c.polyFill(q, fill); c.polyline(q, true, 1.5, col);
    if (handles) for (const e of [p.walls[s.idx].a, p.walls[s.idx].b]) {
      const sp = toScreen(e);
      ctx.fillStyle = '#fff'; ctx.fillRect(sp[0] - 5, sp[1] - 5, 10, 10);
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(sp[0] - 5, sp[1] - 5, 10, 10);
    }
  } else if (s.kind === 'opening') {
    const o = p.openings[s.idx]; if (!o) return;
    const wi = wallIndex(p, o.wall); if (wi < 0) return;
    const w = p.walls[wi], g = D.geo[wi], h = w.thickness / 2 + 2;
    const A = (t, k) => V.add(V.add(w.a, V.mul(g.dir, t)), V.mul(g.n, k));
    const q = [A(o.t - o.width / 2, h), A(o.t + o.width / 2, h), A(o.t + o.width / 2, -h), A(o.t - o.width / 2, -h)];
    c.polyFill(q, fill); c.polyline(q, true, 1.5, col);
  } else if (s.kind === 'room') {
    const ri = isSelected(s) ? roomAt(D, app.roomPick) : s.idx;
    if (ri < 0 || ri >= D.rooms.length) return;
    c.polyFill(D.rooms[ri].poly, 'rgba(62,138,255,0.1)'); c.polyline(D.rooms[ri].poly, true, 1.5, col);
  } else if (s.kind === 'fixture') {
    const f = p.fixtures[s.idx]; if (!f) return;
    const q = fixCorners(f); c.polyFill(q, fill); c.polyline(q, true, 1.5, col);
  } else if (s.kind === 'label') {
    const l = p.labels[s.idx]; if (!l) return;
    const e = labelExtent(l), m = 3 / app.zoom;
    const q = [[l.pos[0] - e[0] - m, l.pos[1] - e[1] - m], [l.pos[0] + e[0] + m, l.pos[1] - e[1] - m], [l.pos[0] + e[0] + m, l.pos[1] + e[1] + m], [l.pos[0] - e[0] - m, l.pos[1] + e[1] + m]];
    c.polyFill(q, fill); c.polyline(q, true, 1.2, col);
  } else if (s.kind === 'dim') {
    const d = p.dims[s.idx]; if (!d) return;
    drawDimension(c, d.a, d.b, d.offset, p.units, col);
  }
}

function dashedScreen(ctx, a, b, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
}
function snapMarker(ctx, sn) {
  const sp = toScreen(sn.pt), col = '#e67814';
  ctx.strokeStyle = col; ctx.lineWidth = 2;
  if (sn.kind === 'end') ctx.strokeRect(sp[0] - 6, sp[1] - 6, 12, 12);
  else if (sn.kind === 'mid') { ctx.beginPath(); ctx.moveTo(sp[0], sp[1] - 7); ctx.lineTo(sp[0] - 7, sp[1] + 5); ctx.lineTo(sp[0] + 7, sp[1] + 5); ctx.closePath(); ctx.stroke(); }
  else if (sn.kind === 'onwall') { ctx.beginPath(); ctx.moveTo(sp[0] - 6, sp[1] - 6); ctx.lineTo(sp[0] + 6, sp[1] + 6); ctx.moveTo(sp[0] - 6, sp[1] + 6); ctx.lineTo(sp[0] + 6, sp[1] - 6); ctx.stroke(); }
  else { ctx.strokeStyle = '#3c465a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(sp[0] - 7, sp[1]); ctx.lineTo(sp[0] + 7, sp[1]); ctx.moveTo(sp[0], sp[1] - 7); ctx.lineTo(sp[0], sp[1] + 7); ctx.stroke(); }
  if (sn.gx) dashedScreen(ctx, toScreen(sn.gx), sp, 'rgba(214,60,160,0.8)');
  if (sn.gy) dashedScreen(ctx, toScreen(sn.gy), sp, 'rgba(214,60,160,0.8)');
}
function bubble(ctx, pos, text, bg = 'rgba(30,34,42,0.92)') {
  ctx.font = `13px ${FONT}`;
  const tw = ctx.measureText(text).width + 12;
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(pos[0], pos[1], tw, 20, 8); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(text, pos[0] + 6, pos[1] + 10.5);
}

function drawPlanScreen(ctx) {
  const p = app.p, D = app.D;
  drawGrid(ctx);
  const c = screenCv(ctx);
  drawPlan(c, p, D, { dims: app.dims, labels: app.showLabels, fixtures: app.showFixtures, units: p.units });
  if (app.tool === 'select' && app.hover && app.drag === 'none' && !isSelected(app.hover)) drawSelOutline(c, ctx, app.hover, 'rgba(62,138,255,0.6)', 'rgba(62,138,255,0.08)', false);
  for (const s of app.sel) drawSelOutline(c, ctx, s, ACC, ACC_FILL, s.kind === 'wall' && app.sel.length < 6);
  const mouse = inp.mouse, world = app.mouseWorld, inC = inp.inCanvas, shift = inp.shift, alt = inp.alt;
  switch (app.tool) {
    case 'wall':
      if (app.drawing) {
        const t = app.wallExt ? app.extThick : app.intThick, b = app.snap.pt;
        if (V.dist(app.lastPt, b) > 0.5) {
          const n = V.mul(V.perp(V.norm(V.sub(b, app.lastPt))), t / 2);
          const q = [V.add(app.lastPt, n), V.add(b, n), V.sub(b, n), V.sub(app.lastPt, n)];
          c.polyFill(q, 'rgba(62,138,255,0.35)'); c.polyline(q, true, 1.2, ACC);
          drawDimension(c, app.lastPt, b, t / 2 + 14, p.units, ACC, 8);
          let ang = Math.atan2(-(b[1] - app.lastPt[1]), b[0] - app.lastPt[0]) / DEG;
          if (ang < 0) ang += 360;
          bubble(ctx, V.add(mouse, [18, 18]), `${formatLength(V.dist(app.lastPt, b), p.units)}  ·  ${ang.toFixed(0)}°`);
        }
        if (app.chainCount >= 2 && V.dist(app.snap.pt, app.chainStart) < 0.5) bubble(ctx, V.add(mouse, [18, -26]), 'Close shape', 'rgba(40,140,80,0.92)');
      }
      if (inC) snapMarker(ctx, app.snap);
      break;
    case 'room':
      if (app.drawing) {
        const p0 = app.chainStart, p1 = app.snap.pt;
        const q = [p0, [p1[0], p0[1]], p1, [p0[0], p1[1]]];
        c.polyFill(q, 'rgba(62,138,255,0.15)'); c.polyline(q, true, 2, ACC);
        const mn = [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1])], mx = [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1])];
        drawDimension(c, [mn[0], mn[1]], [mx[0], mn[1]], -16, p.units, ACC, 8);
        drawDimension(c, [mn[0], mx[1]], [mn[0], mn[1]], -16, p.units, ACC, 8);
        bubble(ctx, V.add(mouse, [18, 18]), `${formatLength(mx[0] - mn[0], p.units)} x ${formatLength(mx[1] - mn[1], p.units)}  ·  ${formatArea((mx[0] - mn[0]) * (mx[1] - mn[1]), p.units)}`);
      }
      if (inC) snapMarker(ctx, app.snap);
      break;
    case 'door': case 'window':
      if (inC) {
        const pv = openingPreview(world, app.openW, -1, shift);
        if (pv.ok) {
          const w = p.walls[pv.wi], g = D.geo[pv.wi], col = pv.valid ? ACC : '#d64848', h = w.thickness / 2;
          const t0 = pv.t - app.openW / 2, t1 = pv.t + app.openW / 2;
          const A = (t, k = 0) => V.add(V.add(w.a, V.mul(g.dir, t)), V.mul(g.n, k));
          const gap = [A(t0, h), A(t1, h), A(t1, -h), A(t0, -h)];
          c.polyFill(gap, '#fff');
          drawOpeningPlan(c, p, D, { id: 0, wall: w.id, kind: app.openKind, t: pv.t, width: app.openW, height: app.openH, sill: app.openSill, flip_side: pv.flipSide, flip_hinge: app.prevFlipHinge }, col);
          c.polyline(gap, true, 1.2, col);
          const [c0, c1] = wallClearRange(p, D, pv.wi), off = (pv.flipSide ? -1 : 1) * (h + 14);
          if (t0 - c0 > 1) drawDimension(c, A(c0), A(t0), off, p.units, col, 7);
          if (c1 - t1 > 1) drawDimension(c, A(t1), A(c1), off, p.units, col, 7);
        } else bubble(ctx, V.add(mouse, [18, 18]), 'Hover a wall to place');
      }
      break;
    case 'fixture':
      if (inC) {
        drawFixturePlan(c, fixturePreview(world, app.fixKind, app.fixRot, alt || shift), ACC, 'rgba(230,240,255,0.86)');
        bubble(ctx, V.add(mouse, [18, 18]), `${FIXTURE_DEFS[app.fixKind].name}  ·  Q/E rotate`);
      }
      break;
    case 'dimension':
      if (inC) snapMarker(ctx, app.snap);
      if (app.dimStage === 1) drawDimension(c, app.dimA, app.snap.pt, 0, p.units, ACC);
      else if (app.dimStage === 2) {
        let off = V.dot(V.sub(world, app.dimA), V.perp(V.norm(V.sub(app.dimB, app.dimA))));
        if (app.snapOn && !shift) off = snapF(off, 3);
        drawDimension(c, app.dimA, app.dimB, off, p.units, ACC);
      }
      break;
    case 'text':
      if (inC) bubble(ctx, V.add(mouse, [18, 18]), 'Click to place a text label');
      break;
  }
  if (app.drag === 'box') {
    const s0 = app.dragStartS, s1 = mouse, x = Math.min(s0[0], s1[0]), y = Math.min(s0[1], s1[1]), w = Math.abs(s1[0] - s0[0]), h = Math.abs(s1[1] - s0[1]);
    const crossing = s1[0] < s0[0];
    ctx.fillStyle = crossing ? 'rgba(60,180,100,0.12)' : 'rgba(62,138,255,0.12)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = crossing ? '#289650' : ACC; ctx.lineWidth = 1;
    if (crossing) ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w, h); ctx.setLineDash([]);
  }
  if (app.drag === 'handle') {
    snapMarker(ctx, app.snap);
    for (const w of p.walls) if (V.dist(w.a, app.snap.pt) < 0.5 || V.dist(w.b, app.snap.pt) < 0.5) bubble(ctx, V.add(toScreen(V.lerp(w.a, w.b, 0.5)), [8, 8]), formatLength(wallLen(w), p.units));
  }
  if (app.typed.length) bubble(ctx, V.add(mouse, [18, 42]), `Length: ${app.typed}_  (Enter)`, 'rgba(200,110,20,0.94)');
  drawScaleBar(ctx);
}

function drawScaleBar(ctx) {
  const units = app.p.units;
  const nice = units === 1 ? [39.37 / 4, 39.37 / 2, 39.37, 78.74, 196.85, 393.7, 787.4] : [12, 24, 60, 120, 240, 600, 1200];
  let seg = nice[nice.length - 1];
  for (const n of nice) if (n * app.zoom >= 40) { seg = n; break; }
  const x = 16, y = app.ch - 26, sw = seg * app.zoom;
  for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#282c34'; ctx.fillRect(x + i * sw, y, sw, 6); }
  ctx.strokeStyle = '#282c34'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, sw * 4, 6);
  ctx.fillStyle = '#3c4048'; ctx.font = `12px ${FONT}`; ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center'; ctx.fillText('0', x, y - 5); ctx.fillText(formatLength(seg * 4, units), x + sw * 4, y - 5);
}
