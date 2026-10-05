'use strict';
// Application state, undo/redo, selection and core commands.

const app = {
  p: newProject(), D: null, fileName: '', modified: false, dirty: true,
  mode: 'plan', tool: 'select',
  offset: [300, 200], zoom: 1.6, grid: 6, snapOn: true, angleSnap: true, showGrid: true, dims: 1, showLabels: true, showFixtures: true,
  cw: 800, ch: 600, mouseWorld: [0, 0],
  sel: [], roomPick: [0, 0], hover: null,
  drawing: false, chainStart: [0, 0], lastPt: [0, 0], chainCount: 0, typed: '',
  wallExt: true, extThick: DEFAULT_EXT_THICK, intThick: DEFAULT_INT_THICK, wallHeight: DEFAULT_WALL_HEIGHT,
  openKind: 0, openW: 32, openH: 80, openSill: 0, fixKind: 0, fixRot: 0,
  dimStage: 0, dimA: [0, 0], dimB: [0, 0], snap: { pt: [0, 0], kind: 'none' }, lastClickTime: 0, prevFlipHinge: false,
  drag: 'none', dragStartW: [0, 0], dragStartS: [0, 0], dragHit: null, orig: null, dragNodes: [], handleNode: null, handleOther: null,
  rpress: [0, 0], rpanning: false,
  undo: [], redo: [], current: '',
  v3: null, panelDirty: true, welcome: true, focusLabel: false,
};

function setOpenKind(k) {
  app.openKind = k;
  const d = OPENING_DEFS[k];
  app.openW = d.width; app.openH = d.height; app.openSill = d.sill;
}

// ---------------------------------------------------------------- undo / redo
const snapshot = () => JSON.stringify(app.p);
function restoreSnapshot(s) {
  app.p = projectFixup(JSON.parse(s));
  app.sel = [];
  app.dirty = true;
  app.panelDirty = true;
}
function commit() {
  app.undo.push(app.current);
  if (app.undo.length > 200) app.undo.shift();
  app.current = snapshot();
  app.redo = [];
  app.modified = true;
  app.dirty = true;
  app.panelDirty = true;
  if (app.p.walls.length) app.welcome = false;
}
function doUndo() {
  if (!app.undo.length) return;
  app.redo.push(app.current);
  app.current = app.undo.pop();
  restoreSnapshot(app.current);
  app.modified = true;
  toast('Undo');
}
function doRedo() {
  if (!app.redo.length) return;
  app.undo.push(app.current);
  app.current = app.redo.pop();
  restoreSnapshot(app.current);
  app.modified = true;
  toast('Redo');
}
function resetHistory() { app.undo = []; app.redo = []; app.current = snapshot(); }

function ensureDerived() {
  if (app.dirty || !app.D) {
    app.D = computeDerived(app.p);
    if (app.v3) app.v3.dirty = true;
    app.dirty = false;
  }
}

function toast(msg, ok = true) {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (ok ? '' : ' err');
  t.textContent = msg;
  box.appendChild(t);
  while (box.children.length > 5) box.removeChild(box.firstChild);
  setTimeout(() => { t.style.opacity = '0'; }, 3200);
  setTimeout(() => t.remove(), 3700);
}

// ---------------------------------------------------------------- coordinates
const toScreen = (w) => [app.offset[0] + w[0] * app.zoom, app.offset[1] + w[1] * app.zoom];
const toWorld = (s) => [(s[0] - app.offset[0]) / app.zoom, (s[1] - app.offset[1]) / app.zoom];
function zoomAt(s, f) {
  const w = toWorld(s);
  app.zoom = clamp(app.zoom * f, 0.08, 40);
  app.offset = [s[0] - w[0] * app.zoom, s[1] - w[1] * app.zoom];
}
function zoomFit() {
  ensureDerived();
  const D = app.D;
  let mn = D.hasBounds ? D.bmin.slice() : [-240, -180], mx = D.hasBounds ? D.bmax.slice() : [240, 180];
  const pad = 84;
  mn = [mn[0] - pad, mn[1] - pad]; mx = [mx[0] + pad, mx[1] + pad];
  const z = Math.min(app.cw / Math.max(mx[0] - mn[0], 1), app.ch / Math.max(mx[1] - mn[1], 1));
  app.zoom = clamp(z, 0.08, 40);
  app.offset = [app.cw / 2 - (mn[0] + mx[0]) / 2 * app.zoom, app.ch / 2 - (mn[1] + mx[1]) / 2 * app.zoom];
}

// ---------------------------------------------------------------- selection
const selEq = (a, b) => a && b && a.kind === b.kind && a.idx === b.idx;
const isSelected = (s) => app.sel.some(x => selEq(x, s));
function selectOnly(s) { app.sel = [s]; app.panelDirty = true; }
function toggleSelect(s) {
  const i = app.sel.findIndex(x => selEq(x, s));
  if (i >= 0) app.sel.splice(i, 1); else app.sel.push(s);
  app.panelDirty = true;
}
const selCount = (k) => app.sel.filter(s => s.kind === k).length;
function selectedRoom() { return app.sel.some(s => s.kind === 'room') ? roomAt(app.D, app.roomPick) : -1; }

function deleteSelection() {
  if (!app.sel.length) return;
  const p = app.p;
  const idx = (k) => app.sel.filter(s => s.kind === k).map(s => s.idx).sort((a, b) => b - a);
  for (const i of idx('opening')) p.openings.splice(i, 1);
  for (const i of idx('wall')) if (i < p.walls.length) deleteWall(p, i);
  for (const i of idx('fixture')) p.fixtures.splice(i, 1);
  for (const i of idx('label')) p.labels.splice(i, 1);
  for (const i of idx('dim')) p.dims.splice(i, 1);
  ensureDerived();
  const tags = app.sel.filter(s => s.kind === 'room' && s.idx < app.D.rooms.length).map(s => app.D.rooms[s.idx].tag).filter(t => t >= 0).sort((a, b) => b - a);
  for (const t of tags) p.rooms.splice(t, 1);
  app.sel = [];
  healWalls(p);
  commit();
}

function duplicateSelection() {
  const p = app.p, off = [24, 24], ns = [];
  for (const s of app.sel) {
    if (s.kind === 'wall') {
      const w = JSON.parse(JSON.stringify(p.walls[s.idx])), oldId = w.id;
      w.id = newId(p); w.a = V.add(w.a, off); w.b = V.add(w.b, off);
      p.walls.push(w);
      for (const o of p.openings.filter(o => o.wall === oldId)) p.openings.push({ ...o, id: newId(p), wall: w.id });
    } else if (s.kind === 'fixture') {
      const f = JSON.parse(JSON.stringify(p.fixtures[s.idx])); f.pos = V.add(f.pos, off); p.fixtures.push(f); ns.push({ kind: 'fixture', idx: p.fixtures.length - 1 });
    } else if (s.kind === 'label') {
      const l = JSON.parse(JSON.stringify(p.labels[s.idx])); l.pos = V.add(l.pos, off); p.labels.push(l); ns.push({ kind: 'label', idx: p.labels.length - 1 });
    } else if (s.kind === 'dim') {
      const d = JSON.parse(JSON.stringify(p.dims[s.idx])); d.a = V.add(d.a, off); d.b = V.add(d.b, off); p.dims.push(d); ns.push({ kind: 'dim', idx: p.dims.length - 1 });
    }
  }
  healWalls(p);
  commit();
  app.sel = ns;
  toast('Duplicated selection');
}

function selectAll() {
  const p = app.p;
  app.sel = [
    ...p.walls.map((_, i) => ({ kind: 'wall', idx: i })), ...p.fixtures.map((_, i) => ({ kind: 'fixture', idx: i })),
    ...p.labels.map((_, i) => ({ kind: 'label', idx: i })), ...p.dims.map((_, i) => ({ kind: 'dim', idx: i })),
  ];
  app.panelDirty = true;
}

function moveNode(p, from, to) {
  for (const w of p.walls) {
    if (V.dist(w.a, from) < 0.5) w.a = to.slice();
    if (V.dist(w.b, from) < 0.5) w.b = to.slice();
  }
}

function roomTagFor(ri) {
  const r = app.D.rooms[ri];
  if (r.tag >= 0) return r.tag;
  app.p.rooms.push({ pos: r.labelPos.slice(), name: 'Room', floor: { ...app.p.floor_surface, color: app.p.floor_surface.color.slice(), custom: false } });
  r.tag = app.p.rooms.length - 1;
  return r.tag;
}

function newProjectCmd() {
  app.p = newProject();
  app.fileName = '';
  app.modified = false;
  app.dirty = true;
  app.sel = [];
  app.drawing = false;
  resetHistory();
  app.zoom = 1.6;
  app.offset = [app.cw * 0.3, app.ch * 0.25];
  app.welcome = true;
  app.panelDirty = true;
}
