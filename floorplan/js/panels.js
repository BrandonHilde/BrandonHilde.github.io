'use strict';
// DOM user interface: left tool strip, context properties panel, status bar and modal dialogs.

function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const k in props) {
    const v = props[k];
    if (k === 'class') e.className = v;
    else if (k === 'style') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return e;
}

const ICONS = {
  select: '<path d="M6 3v15l4-4 3 7 2.5-1-3-7h6z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  wall: '<rect x="3" y="11" width="18" height="4" fill="currentColor"/><rect x="17" y="5" width="4" height="8" fill="currentColor"/>',
  room: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3"/>',
  door: '<path d="M4 20h16M5 20V5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M5 5a15 15 0 0 1 15 15" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  window: '<rect x="3" y="9" width="18" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3 12h18" stroke="currentColor" stroke-width="1.3"/>',
  fixture: '<rect x="4" y="11" width="16" height="6" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="6" width="16" height="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 17v3M18 17v3" stroke="currentColor" stroke-width="2"/>',
  dimension: '<path d="M3 12h18M3 7v10M21 7v10M1 15l4-6M19 15l4-6" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  text: '<path d="M5 5h14M12 5v15" stroke="currentColor" stroke-width="3"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>',
  plan: '<rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4v9M4 13h9" stroke="currentColor" stroke-width="2"/>',
  camera: '<rect x="3" y="7" width="18" height="12" rx="2" fill="currentColor"/><circle cx="12" cy="13" r="3.5" fill="#24282f"/><rect x="8" y="4" width="8" height="3" fill="currentColor"/>',
};
const svgIcon = (name) => `<svg viewBox="0 0 24 24" width="26" height="26">${ICONS[name]}</svg>`;

// ---------------------------------------------------------------- left bar
function renderLeftbar() {
  const bar = document.getElementById('leftbar');
  bar.innerHTML = '';
  if (app.mode === 'plan') {
    const tools = [['select', 'select', 'Select & edit (V)', 'V'], ['wall', 'wall', 'Draw walls (W)', 'W'], ['room', 'room', 'Draw a rectangular room (R)', 'R'],
      ['door', 'door', 'Place doors (D)', 'D'], ['window', 'window', 'Place windows (N)', 'N'], ['fixture', 'fixture', 'Furniture & fixtures (F)', 'F'],
      ['dimension', 'dimension', 'Dimension (M)', 'M'], ['text', 'text', 'Text label (T)', 'T']];
    for (const [t, icon, tip, key] of tools) {
      bar.append(h('button', { class: 'tool' + (app.tool === t ? ' on' : ''), title: tip, html: svgIcon(icon) + `<span class="k">${key}</span>`, onclick: () => { setTool(t); renderLeftbar(); } }));
    }
    bar.append(h('div', { class: 'lsep' }));
    bar.append(h('button', { class: 'tool', title: 'Switch to 3D view (Tab)', html: svgIcon('cube'), onclick: () => switchMode('3d') }));
  } else {
    bar.append(h('button', { class: 'tool', title: 'Back to 2D plan (Tab)', html: svgIcon('plan'), onclick: () => switchMode('plan') }));
    bar.append(h('div', { class: 'lsep' }));
    CAM_SHORT.forEach((s, i) => bar.append(h('button', { class: 'view' + (app.v3.preset === i ? ' on' : ''), title: `${CAM_PRESETS[i]} (${i + 1})`, onclick: () => setPreset(i) }, s)));
    bar.append(h('div', { class: 'lsep' }));
    bar.append(h('button', { class: 'tool', title: 'Screenshot (F9)', html: svgIcon('camera'), onclick: () => screenshotCmd() }));
  }
}

// ---------------------------------------------------------------- widgets
const section = (t) => h('h3', null, t);
const hint = (t) => h('div', { class: 'hint' }, t);
const info = (l, v) => h('div', { class: 'info' }, h('span', null, l), h('span', null, v));

function textInput(key, value, placeholder, onCommit) {
  const inp = h('input', { type: 'text', value: value ?? '', placeholder: placeholder || '', 'data-key': key });
  inp.addEventListener('change', () => onCommit(inp.value));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') { inp.value = value ?? ''; inp.blur(); } e.stopPropagation(); });
  return inp;
}
const fieldRow = (label, input) => h('div', { class: 'frow' }, h('label', null, label), input);
function lengthField(key, label, value, set, opts = {}) {
  return fieldRow(label, textInput(key, formatLength(value, app.p.units), '', (s) => {
    const v = parseLength(s, app.p.units, !!opts.bare);
    if (v === null) { toast('Could not read that length', false); app.panelDirty = true; return; }
    set(clamp(v, opts.min ?? 0, opts.max ?? 1e6));
    app.panelDirty = true;
  }));
}
function toggle(label, value, set, tip) {
  return h('div', { class: 'toggle' + (value ? ' on' : ''), title: tip || '', onclick: () => { set(!value); app.panelDirty = true; } }, h('span', null, label), h('span', { class: 'sw' }));
}
function segp(options, idx, onSel) {
  return h('div', { class: 'segp' }, options.map((o, i) => h('button', { class: i === idx ? 'on' : '', onclick: () => { onSel(i); app.panelDirty = true; } }, o)));
}
function slider(label, min, max, step, val, fmt, onInput) {
  const out = h('span', null, fmt(val));
  const r = h('input', { type: 'range', min, max, step, value: val });
  r.addEventListener('input', () => { const v = parseFloat(r.value); out.textContent = fmt(v); onInput(v); });
  return h('div', { class: 'slider' }, h('div', { class: 'top' }, h('span', null, label), out), r);
}
const btn = (label, onclick, cls = '', title = '') => h('button', { class: cls, title, onclick }, label);

let _thumbs = null;
function thumbURL(m) {
  if (!_thumbs) _thumbs = texCanvases.map(c => c.toDataURL());
  return _thumbs[m];
}
// Material grid + palette. onChange(newSurface)
function surfaceEditor(s, floor, onChange) {
  const box = h('div');
  const grid = h('div', { class: 'mats' });
  MATERIALS.forEach((md, m) => {
    if (md.usage === 'internal') return;
    if (floor && md.usage === 'wall') return;
    if (!floor && md.usage === 'floor') return;
    const on = matOf(s) === m;
    const tint = on ? s.color : md.color;
    grid.append(h('div', { class: 'mat' + (on ? ' on' : ''), title: md.name, onclick: () => onChange({ mat: m, color: md.color.slice(), custom: true }) },
      h('div', { class: 'th', style: { backgroundImage: `url(${thumbURL(m)})`, backgroundColor: css(tint) } }), md.name.length > 11 ? md.name.slice(0, 10) + '.' : md.name));
  });
  box.append(grid, h('div', { class: 'lbl' }, 'Color / tint'));
  box.append(h('div', { class: 'pal' }, PALETTE.map(c => h('div', { class: colEq(c, s.color) ? 'on' : '', style: { background: css(c) }, onclick: () => onChange({ mat: matOf(s), color: c.slice(), custom: true }) }))));
  return box;
}
function palette(color, onPick) {
  return h('div', { class: 'pal' }, PALETTE.map(c => h('div', { class: colEq(c, color) ? 'on' : '', style: { background: css(c) }, onclick: () => onPick(c.slice()) })));
}

// ---------------------------------------------------------------- right panel
function renderPanel() {
  const panel = document.getElementById('panel');
  const focusKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
  const scroll = panel.scrollTop;
  panel.innerHTML = '';
  ensureDerived();
  const kids = app.mode === 'plan' ? panelPlan() : panel3d();
  panel.append(...kids.flat().filter(Boolean));
  panel.scrollTop = scroll;
  if (app.focusLabel) {
    app.focusLabel = false;
    const e = panel.querySelector('[data-key="label_text"]');
    if (e) { e.focus(); e.select(); }
  } else if (focusKey) {
    const e = panel.querySelector(`[data-key="${focusKey}"]`);
    if (e) e.focus();
  }
  app.panelDirty = false;
}

function panelPlan() {
  const p = app.p;
  if (!app.sel.length) {
    if (app.tool === 'wall' || app.tool === 'room') return panelWallTool();
    if (app.tool === 'door' || app.tool === 'window') return panelOpeningTool();
    if (app.tool === 'fixture') return panelFixtureTool();
    const out = [];
    if (app.tool === 'dimension') out.push(section('Dimension Tool'), hint('Click the first point, click the second point, then move the mouse to set the offset and click to place. Snaps to wall ends and corners.'));
    if (app.tool === 'text') out.push(section('Text Tool'), hint('Click anywhere on the plan to place a text label. Edit its text and size here afterwards.'));
    return out.concat(panelProject());
  }
  if (app.sel.every(s => s.kind === 'wall')) return panelWalls();
  if (app.sel.length === 1) {
    const s = app.sel[0];
    if (s.kind === 'opening') return panelOpening(s.idx);
    if (s.kind === 'room') return panelRoom();
    if (s.kind === 'fixture') return panelFixture(s.idx);
    if (s.kind === 'label') return panelLabel(s.idx);
    if (s.kind === 'dim') return panelDim(s.idx);
  }
  return [section(`${app.sel.length} Items Selected`), hint('Drag to move them together. Arrow keys nudge (Shift = 1 inch).'),
    h('div', { class: 'btnrow' }, btn('Duplicate', duplicateSelection, '', 'Ctrl+D'), btn('Delete', deleteSelection, 'danger', 'Del'))];
  void p;
}

function panelProject() {
  const p = app.p, D = app.D, out = [section('Project')];
  const fields = [['name', 'Name', 'Project name'], ['address', 'Address', 'Site address'], ['client', 'Client', 'Client / owner'], ['designer', 'Designer', 'Drawn by'], ['notes', 'Notes', 'General notes']];
  for (const [k, l, ph] of fields) out.push(fieldRow(l, textInput('proj_' + k, p.info[k], ph, (v) => { if (v !== p.info[k]) { p.info[k] = v; commit(); } })));
  out.push(h('div', { style: { height: '8px' } }), section('Summary'));
  out.push(info('Living area (net)', formatArea(totalRoomArea(D), p.units)), info('Footprint (gross)', formatArea(footprintArea(D), p.units)), info('Rooms', D.rooms.length));
  const tl = p.walls.reduce((s, w) => s + wallLen(w), 0);
  out.push(info('Walls', `${p.walls.length}  (${formatLength(tl, p.units)})`));
  const nw = p.openings.filter(isWindow).length;
  out.push(info('Doors / Windows', `${p.openings.length - nw} / ${nw}`), info('Fixtures', p.fixtures.length));
  out.push(h('div', { style: { height: '8px' } }), section('Display & Snapping'));
  out.push(toggle('Show grid', app.showGrid, v => app.showGrid = v), toggle('Snap to grid (G)', app.snapOn, v => app.snapOn = v),
    toggle('Angle snap (45°)', app.angleSnap, v => app.angleSnap = v, 'Hold Shift while drawing for free placement'),
    toggle('Room labels', app.showLabels, v => app.showLabels = v), toggle('Furniture', app.showFixtures, v => app.showFixtures = v));
  const grids = [1, 3, 6, 12];
  out.push(h('div', { class: 'lbl' }, 'Grid size'), segp(['1"', '3"', '6"', "1'"], Math.max(0, grids.indexOf(app.grid)), i => app.grid = grids[i]));
  out.push(h('div', { class: 'lbl' }, 'Dimensions'), segp(['Off', 'Exterior', 'All'], app.dims, i => app.dims = i));
  out.push(h('div', { class: 'lbl' }, 'Units'), segp(['Feet & inches', 'Metric'], p.units, i => { p.units = i; commit(); }));
  out.push(hint('Tip: press W and click to draw walls. Type a length (e.g. 12\'6") while drawing for exact walls. Press Tab to see your design in 3D.'));
  return out;
}

function panelWallTool() {
  const p = app.p;
  return [section(app.tool === 'wall' ? 'Wall Tool' : 'Room Tool'),
    h('div', { class: 'lbl' }, 'Wall type (X)'), segp(['Exterior', 'Interior'], app.wallExt ? 0 : 1, i => app.wallExt = i === 0),
    lengthField('ext_thick', 'Exterior thickness', app.extThick, v => app.extThick = v, { bare: true, min: 2, max: 24 }),
    lengthField('int_thick', 'Interior thickness', app.intThick, v => app.intThick = v, { bare: true, min: 2, max: 24 }),
    lengthField('wall_h', 'Wall height', app.wallHeight, v => app.wallHeight = v, { min: 24, max: 480 }),
    hint(app.tool === 'wall'
      ? 'Click to start, click again for each corner. Type a length like 12\'6" or 14 and press Enter for an exact wall in the mouse direction. Double-click, right-click or Esc to finish. Hold Shift to disable snapping.'
      : 'Drag a rectangle, or click two corners. After the first click you can type an exact size like 12x14 and press Enter. Rooms are detected automatically from any enclosed walls.')];
  void p;
}

function panelOpeningTool() {
  const win = app.tool === 'window', out = [section(win ? 'Window Type' : 'Door Type')];
  out.push(h('div', { class: 'grid2' }, OPENING_DEFS.map((d, k) => d.win !== win ? null : btn(d.name, () => { setOpenKind(k); app.panelDirty = true; }, app.openKind === k ? 'on' : ''))));
  out.push(lengthField('ow', 'Width', app.openW, v => app.openW = v, { bare: true, min: 12, max: 480 }));
  out.push(lengthField('oh', 'Height', app.openH, v => app.openH = v, { bare: true, min: 12, max: 240 }));
  if (win) out.push(lengthField('os', 'Sill height', app.openSill, v => app.openSill = v, { bare: true, min: 0, max: 200 }));
  out.push(hint('Hover over a wall and click to place. Live distances to the wall ends are shown. The side of the wall you hover sets the swing direction; press E to flip the hinge.'));
  return out;
}

function panelFixtureTool() {
  const out = [section('Furniture & Fixtures')];
  FIXTURE_CATS.forEach((cat, ci) => {
    out.push(h('div', { class: 'lbl' }, cat));
    out.push(h('div', { class: 'grid2' }, FIXTURE_DEFS.map((d, k) => d.cat !== ci ? null : btn(d.name, () => { app.fixKind = k; app.panelDirty = true; }, app.fixKind === k ? 'on' : ''))));
  });
  out.push(hint('Click to place. Items snap with their back against nearby walls; hold Alt for free placement. Q/E rotate 90° (Shift = 15°).'));
  return out;
}

function panelWalls() {
  const p = app.p, D = app.D, i0 = app.sel[0].idx, n = app.sel.length;
  if (i0 >= p.walls.length) return [];
  const w = p.walls[i0], out = [section(n === 1 ? 'Wall' : `${n} Walls`)];
  if (n === 1) {
    out.push(info('Type', wallIsExterior(D, i0) ? 'Exterior wall' : 'Interior wall'));
    let ang = Math.atan2(-(w.b[1] - w.a[1]), w.b[0] - w.a[0]) / DEG;
    if (ang < -0.05) ang += 360;
    out.push(info('Angle', `${Math.abs(ang) < 0.05 ? '0.0' : ang.toFixed(1)}°`));
    const [c0, c1] = wallClearRange(p, D, i0);
    out.push(info('Clear length', formatLength(c1 - c0, p.units)));
    out.push(lengthField('wlen', 'Length', wallLen(w), (len) => {
      const nb = V.add(w.a, V.mul(wallDir(w), len)), a = w.a.slice();
      moveNode(p, w.b.slice(), nb);
      healWalls(p);
      commit();
      app.sel = [];
      p.walls.forEach((ww, i) => { if (V.dist(ww.a, a) < 0.5 && V.dist(ww.b, nb) < 0.5) app.sel.push({ kind: 'wall', idx: i }); });
    }, { min: 1, max: 100000 }));
  }
  out.push(lengthField('wthick', 'Thickness', w.thickness, v => { for (const s of app.sel) p.walls[s.idx].thickness = v; commit(); }, { bare: true, min: 1, max: 36 }));
  out.push(lengthField('wheight', 'Height', w.height, v => { for (const s of app.sel) p.walls[s.idx].height = v; commit(); }, { min: 12, max: 600 }));
  out.push(h('div', { class: 'btnrow' },
    n === 1 ? btn('Split in Half', () => { splitWall(p, i0, V.lerp(w.a, w.b, 0.5)); commit(); app.sel = []; }, '', 'Split this wall at its midpoint') : null,
    btn('Delete', deleteSelection, 'danger', 'Del')));
  for (const left of [true, false]) {
    const ext = left ? D.geo[i0].extL : D.geo[i0].extR;
    out.push(section(`Side ${left ? 'A' : 'B'}  ·  ${ext ? 'exterior' : 'interior'}`));
    out.push(surfaceEditor(wallSurface(p, D, i0, left), false, (s) => { for (const x of app.sel) p.walls[x.idx][left ? 'left' : 'right'] = s; commit(); }));
    if ((left ? w.left : w.right).custom) out.push(btn('Reset to project default', () => { for (const x of app.sel) p.walls[x.idx][left ? 'left' : 'right'].custom = false; commit(); }, 'ghost wide'));
  }
  return out;
}

function panelOpening(oi) {
  const p = app.p, o = p.openings[oi];
  if (!o) return [];
  const win = isWindow(o), out = [section(OPENING_DEFS[o.kind].name)];
  out.push(h('div', { class: 'grid2' }, OPENING_DEFS.map((d, k) => d.win !== win ? null : btn(d.short, () => { o.kind = k; commit(); }, o.kind === k ? 'on' : '', d.name))));
  out.push(lengthField('sel_ow', 'Width', o.width, v => { o.width = v; commit(); }, { bare: true, min: 12, max: 480 }));
  out.push(lengthField('sel_oh', 'Height', o.height, v => { o.height = v; commit(); }, { bare: true, min: 12, max: 240 }));
  if (win) out.push(lengthField('sel_os', 'Sill height', o.sill, v => { o.sill = v; commit(); }, { bare: true, min: 0, max: 200 }));
  const wi = wallIndex(p, o.wall);
  if (wi >= 0) out.push(lengthField('sel_ot', 'From wall start', o.t - o.width / 2, v => { o.t = v + o.width / 2; commit(); }, { bare: true, min: 0, max: wallLen(p.walls[wi]) }));
  if (!win) out.push(h('div', { class: 'btnrow' }, btn('Flip Swing', () => { o.flip_side = !o.flip_side; commit(); }, '', 'Q'), btn('Flip Hinge', () => { o.flip_hinge = !o.flip_hinge; commit(); }, '', 'E')));
  out.push(btn('Delete', deleteSelection, 'danger wide', 'Del'));
  return out;
}

function panelRoom() {
  const p = app.p, D = app.D, ri = selectedRoom();
  if (ri < 0) return [section('Room'), hint('The room no longer exists.')];
  const r = D.rooms[ri], out = [section('Room')];
  out.push(fieldRow('Name', textInput('room_name', roomName(p, r), 'Room name', (v) => { const t = roomTagFor(ri); p.rooms[t].name = v; commit(); })));
  const names = ['Living Room', 'Kitchen', 'Dining', 'Bedroom', 'Primary Bedroom', 'Bathroom', 'Hall', 'Closet', 'Laundry', 'Garage', 'Office', 'Entry'];
  out.push(h('div', { class: 'grid3' }, names.map(nm => btn(nm, () => { const t = roomTagFor(ri); p.rooms[t].name = nm; commit(); }))));
  out.push(info('Net area', formatArea(r.area, p.units)), info('Perimeter', formatLength(r.perimeter, p.units)),
    info('Extents', `${formatLength(r.bmax[0] - r.bmin[0], p.units)} x ${formatLength(r.bmax[1] - r.bmin[1], p.units)}`));
  out.push(section('Floor Finish'), surfaceEditor(roomFloor(p, r), true, (s) => { const t = roomTagFor(ri); p.rooms[t].floor = s; commit(); }));
  return out;
}

function panelFixture(fi) {
  const p = app.p, f = p.fixtures[fi];
  if (!f) return [];
  return [section(FIXTURE_DEFS[f.kind].name),
    lengthField('fw', 'Width', f.size[0], v => { f.size[0] = v; commit(); }, { bare: true, min: 4, max: 600 }),
    lengthField('fd', 'Depth', f.size[1], v => { f.size[1] = v; commit(); }, { bare: true, min: 4, max: 600 }),
    lengthField('fh', 'Height', f.height, v => { f.height = v; commit(); }, { bare: true, min: 1, max: 240 }),
    fieldRow('Rotation', textInput('frot', f.rot.toFixed(1) + '°', '', (s) => { const v = parseFloat(s); if (isFinite(v)) { f.rot = wrapDeg(v); commit(); } else app.panelDirty = true; })),
    h('div', { class: 'btnrow' }, btn('Rotate -90°', () => { f.rot = wrapDeg(f.rot - 90); commit(); }, '', 'Q'), btn('Rotate +90°', () => { f.rot = wrapDeg(f.rot + 90); commit(); }, '', 'E')),
    h('div', { class: 'lbl' }, 'Color'), palette(f.color, c => { f.color = c; commit(); }),
    h('div', { class: 'btnrow' }, btn('Duplicate', duplicateSelection, '', 'Ctrl+D'), btn('Delete', deleteSelection, 'danger', 'Del'))];
}

function panelLabel(li) {
  const l = app.p.labels[li];
  if (!l) return [];
  const inp = textInput('label_text', l.text, 'Text', (v) => { if (v) { l.text = v; commit(); } });
  inp.style.width = '100%';
  return [section('Text Label'), inp, h('div', { style: { height: '10px' } }),
    slider('Size', 5, 36, 1, l.size, v => `${v} pt`, v => { l.size = v; app.pendingCommit = true; }),
    btn('Delete', deleteSelection, 'danger wide', 'Del')];
}

function panelDim(di) {
  const d = app.p.dims[di];
  if (!d) return [];
  return [section('Dimension'), info('Length', formatLength(V.dist(d.a, d.b), app.p.units)),
    lengthField('dim_off', 'Offset', d.offset, v => { d.offset = v; commit(); }, { bare: true, min: -2000, max: 2000 }),
    btn('Delete', deleteSelection, 'danger wide', 'Del')];
}

function panel3d() {
  const p = app.p, D = app.D, v = app.v3, out = [section('Camera')];
  out.push(h('div', { class: 'grid3' }, CAM_PRESETS.map((n, i) => btn(n, () => setPreset(i), v.preset === i ? 'on' : '', `Key ${i + 1}`))));
  const s = v.sel;
  if (s && s.kind === 'wall' && s.wall < p.walls.length) {
    const wi = s.wall, left = s.left, ext = left ? D.geo[wi].extL : D.geo[wi].extR;
    const side = left ? 'left' : 'right';
    out.push(section(ext ? 'Exterior Wall Surface' : 'Interior Wall Surface'), info('Wall length', formatLength(wallLen(p.walls[wi]), p.units)));
    const cur = wallSurface(p, D, wi, left);
    out.push(surfaceEditor(cur, false, (ns) => { p.walls[wi][side] = ns; commit(); }));
    out.push(h('div', { class: 'btnrow' },
      btn('Both Sides', () => { const c = { ...cur, color: cur.color.slice(), custom: true }; p.walls[wi].left = c; p.walls[wi].right = JSON.parse(JSON.stringify(c)); commit(); }, '', 'Apply this finish to both faces of the wall'),
      btn('Reset', () => { p.walls[wi][side].custom = false; commit(); }, '', 'Use the project default finish')));
    out.push(btn(ext ? 'Apply to ALL Exterior Walls' : 'Apply to ALL Interior Walls', () => {
      const def = { mat: cur.mat, color: cur.color.slice(), custom: false };
      if (ext) p.ext_surface = def; else p.int_surface = def;
      p.walls.forEach((w, k) => { if (D.geo[k].extL === ext) w.left.custom = false; if (D.geo[k].extR === ext) w.right.custom = false; });
      commit();
      toast(ext ? 'Applied to all exterior walls' : 'Applied to all interior walls');
    }, 'primary wide'));
  } else if (s && s.kind === 'floor' && s.room < D.rooms.length) {
    const ri = s.room, r = D.rooms[ri], cur = roomFloor(p, r);
    out.push(section(`Floor  ·  ${roomName(p, r)}`), info('Area', formatArea(r.area, p.units)));
    out.push(surfaceEditor(cur, true, (ns) => { const t = roomTagFor(ri); p.rooms[t].floor = ns; commit(); }));
    out.push(btn('Apply to ALL Rooms', () => { p.floor_surface = { mat: cur.mat, color: cur.color.slice(), custom: false }; for (const t of p.rooms) t.floor.custom = false; commit(); }, 'primary wide'));
  } else {
    out.push(section('Restyle'), hint('Click any wall face or floor in the 3D view to change its finish. Or set the defaults for every exterior and interior wall below.'));
    out.push(section('Default Exterior Finish'), surfaceEditor(p.ext_surface, false, (ns) => { ns.custom = false; p.ext_surface = ns; commit(); }));
    out.push(section('Default Interior Finish'), surfaceEditor(p.int_surface, false, (ns) => { ns.custom = false; p.int_surface = ns; commit(); }));
  }
  out.push(section('Display'));
  out.push(toggle('Shadows', v.shadows, x => { v.shadows = x && v.shadowOk; }));
  out.push(toggle('Cutaway walls (C)', v.cutaway, x => { v.cutaway = x; v.dirty = true; }, 'Cut walls at 4 ft to look inside'));
  out.push(toggle('Furniture', v.showFixtures, x => { v.showFixtures = x; v.dirty = true; }));
  out.push(slider('Sun direction', 0, 360, 1, v.sunAz, x => `${x}°`, x => v.sunAz = x));
  out.push(slider('Sun height', 8, 85, 1, v.sunEl, x => `${x}°`, x => v.sunEl = x));
  out.push(slider('Field of view', 25, 90, 1, v.fovy, x => `${x}°`, x => v.fovy = x));
  out.push(section('Capture'), h('div', { class: 'btnrow' }, btn('Screenshot', screenshotCmd, '', 'F9'), btn('All Angles', captureAllCmd, 'primary', 'Ctrl+F9: plan + all 3D views')));
  out.push(hint('Images download as PNG files.'));
  return out;
}

// ---------------------------------------------------------------- status bar
function toolHint() {
  if (app.mode === '3d') {
    if (app.v3.walk) return 'Walkthrough: WASD / arrows to move · drag to look · Shift to run · Esc or 1-8 to exit';
    return 'Left-drag orbit · Right/middle-drag pan · Wheel zoom · Click a wall or floor to restyle · 1-9 camera views · C cutaway · F9 screenshot · Tab back to plan';
  }
  switch (app.tool) {
    case 'select': return 'Click to select · Drag to move · Drag on empty space to box-select (right-to-left = crossing) · Del delete · Ctrl+D duplicate · Q/E rotate or flip';
    case 'wall': return app.drawing ? 'Click next corner · type a length + Enter · Shift = free · X exterior/interior · double-click, right-click or Esc to finish' : 'Click to start a wall · snaps to wall ends, midpoints, walls and grid · X toggles exterior/interior';
    case 'room': return 'Drag or click two corners · type a size like 12x14 + Enter after the first click';
    case 'door': case 'window': return 'Hover a wall and click to place · mouse side sets swing direction · E flips hinge · Shift disables snapping';
    case 'dimension': return ['Click the first point (snaps to wall ends and corners)', 'Click the second point', 'Move to set the offset, click to place'][app.dimStage];
    case 'text': return 'Click to place a text label';
    case 'fixture': return 'Click to place · Q/E rotate · snaps against nearby walls (Alt = free)';
  }
  return '';
}
let _lastStatus = '';
function updateStatus() {
  const p = app.p;
  const right = app.mode === 'plan'
    ? `X ${formatLength(app.mouseWorld[0], p.units)}   Y ${formatLength(app.mouseWorld[1], p.units)}   |   Grid ${formatLength(app.grid, p.units)} ${app.snapOn ? '(snap)' : '(free)'}   |   Zoom ${Math.round(app.zoom / 1.6 * 100)}%`
    : `${CAM_PRESETS[app.v3.preset]}   |   Sun ${Math.round(app.v3.sunAz)}° / ${Math.round(app.v3.sunEl)}°`;
  const s = toolHint() + '|' + right;
  if (s === _lastStatus) return;
  _lastStatus = s;
  document.getElementById('hint').textContent = toolHint();
  document.getElementById('coords').textContent = right;
}

// ---------------------------------------------------------------- modals
const modalOpen = () => !document.getElementById('modal').classList.contains('hidden');
function openModal(content) {
  const box = document.getElementById('modalBox');
  box.innerHTML = '';
  box.append(...content);
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() { document.getElementById('modal').classList.add('hidden'); }

function showHelp() {
  const left = [['Tab', 'Switch 2D plan / 3D view'], ['V', 'Select tool'], ['W', 'Wall tool'], ['R', 'Room tool'], ['D / N', 'Door / window tool'],
    ['F', 'Furniture & fixtures'], ['M / T', 'Dimension / text'], ['X', 'Toggle exterior / interior walls'], ['Type + Enter', 'Exact wall length (12\'6", 14, 3.5m)'],
    ['Shift', 'Disable snapping while drawing'], ['G', 'Toggle grid snap'], ['Z / Home', 'Zoom to fit'], ['Mid / right drag', 'Pan · wheel zooms'],
    ['Q / E', 'Rotate fixture · flip door swing / hinge'], ['Arrows', 'Nudge selection (Shift = 1")']];
  const right = [['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Ctrl+S', 'Save (download .fplan)'], ['Ctrl+O / Ctrl+N', 'Open / new project'], ['Ctrl+D', 'Duplicate selection'],
    ['Ctrl+A', 'Select all'], ['Del', 'Delete selection'], ['Ctrl+E', 'Export plan sheet (PNG + SVG)'], ['F9', 'Screenshot of current view'],
    ['Ctrl+F9', 'Capture plan + all 3D angles'], ['3D: 1 - 9', 'Camera presets (9 = walkthrough)'], ['3D: drag', 'Left orbit · right pan · wheel zoom'],
    ['3D: click', 'Pick a wall or floor to restyle'], ['3D: C', 'Cutaway walls'], ['Walk: WASD', 'Move · drag to look'], ['F1', 'This help']];
  const grid = h('div', { class: 'keys' });
  for (let i = 0; i < left.length; i++) grid.append(h('b', null, left[i][0]), h('span', null, left[i][1]), h('b', null, right[i][0]), h('span', null, right[i][1]));
  openModal([h('h2', null, 'Keyboard Shortcuts'), grid, h('div', { class: 'modal-actions' }, btn('Close', closeModal, 'primary'))]);
}

function confirmDiscard(then) {
  if (!app.modified || !app.p.walls.length) { then(); return; }
  openModal([h('h2', null, 'Discard unsaved changes?'), h('div', { class: 'hint' }, 'Your current plan has changes that are not saved.'),
    h('div', { class: 'modal-actions' }, btn('Cancel', closeModal), btn('Save First', () => { closeModal(); saveCmd(); then(); }), btn('Discard', () => { closeModal(); then(); }, 'danger'))]);
}

function showGallery(items) {
  const gal = h('div', { class: 'gallery' }, items.map(it => h('figure', null,
    h('img', { src: it.url, title: 'Click to download', onclick: () => downloadURL(it.url, it.name) }), h('figcaption', null, it.label))));
  openModal([h('h2', null, `${items.length} Views Captured`), hint('Click an image to download it, or download them all.'), gal,
    h('div', { class: 'modal-actions' }, btn('Download All', async () => { for (const it of items) { downloadURL(it.url, it.name); await new Promise(r => setTimeout(r, 250)); } }, 'primary'), btn('Close', closeModal))]);
}
