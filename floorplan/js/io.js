'use strict';
// Save/open, plan sheet export (PNG + SVG), OBJ export, screenshots, mode switching.

const AUTOSAVE_KEY = 'floorplan-studio-autosave';

function safeName(s) {
  const out = String(s || '').trim().replace(/[ .]/g, '_').replace(/[^A-Za-z0-9_\-]/g, '');
  return out || 'untitled';
}
function stamp() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
function dateString() { const d = new Date(), z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`; }

function downloadURL(url, name) {
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  downloadURL(url, name);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const downloadText = (text, name, type = 'text/plain') => downloadBlob(new Blob([text], { type }), name);

// ---------------------------------------------------------------- projects
function saveCmd() {
  app.p.version = FILE_VERSION;
  const name = (app.fileName || safeName(app.p.info.name)).replace(/\.fplan$/i, '') + '.fplan';
  downloadText(JSON.stringify(app.p, null, 2), name, 'application/json');
  app.fileName = name;
  app.modified = false;
  autosave();
  toast(`Saved ${name}`);
}
function openCmd() { confirmDiscard(() => document.getElementById('fileInput').click()); }
function loadProjectText(text, name) {
  try {
    const p = projectFixup(JSON.parse(text));
    app.p = p;
    app.fileName = name || '';
    app.modified = false;
    app.dirty = true;
    app.sel = [];
    app.welcome = false;
    resetHistory();
    app.v3.initializedCam = false;
    zoomFit();
    app.panelDirty = true;
    toast(`Opened ${name || 'project'}`);
  } catch (e) {
    toast('Could not read that project file', false);
  }
}
function openFile(file) {
  const r = new FileReader();
  r.onload = () => loadProjectText(r.result, file.name);
  r.readAsText(file);
}
function autosave() {
  try { if (app.p.walls.length) localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(app.p)); } catch (e) { /* storage unavailable */ }
}

// ---------------------------------------------------------------- plan sheet
const SHEET_W = 17, SHEET_H = 11;
const ARCH_SCALES = [[0.5, '1/2" = 1\'-0"'], [0.375, '3/8" = 1\'-0"'], [0.25, '1/4" = 1\'-0"'], [0.1875, '3/16" = 1\'-0"'], [0.125, '1/8" = 1\'-0"'],
  [0.09375, '3/32" = 1\'-0"'], [0.0625, '1/16" = 1\'-0"'], [0.03125, '1/32" = 1\'-0"']];

function wrapLines(c, text, px, maxW, bold) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const trial = cur ? cur + ' ' + w : w;
    if (c.pcTextWidth(trial, px, bold) > maxW && cur) { out.push(cur); cur = w; } else cur = trial;
  }
  if (cur) out.push(cur);
  return out;
}

function drawSheet(c, p, D, dpi) {
  const W = SHEET_W * dpi, H = SHEET_H * dpi, pt = dpi / 72;
  c.lw = pt; c.ts = pt; c.minText = 0; c.minLine = c.svg ? 0.2 : 1;
  const ink = '#121216', dim = '#646870';
  c.pcRectFill(0, 0, W, H, '#ffffff');
  const m = 0.35 * dpi, bx = m, by = m, bw = W - 2 * m, bh = H - 2 * m;
  c.pcRectLine(bx, by, bw, bh, 2.2 * pt, ink);
  c.pcRectLine(bx + 4 * pt, by + 4 * pt, bw - 8 * pt, bh - 8 * pt, 0.5 * pt, ink);
  const tbw = 3.25 * dpi, tb = { x: bx + bw - tbw, y: by, w: tbw, h: bh };
  c.pcLine([tb.x, tb.y], [tb.x, tb.y + tb.h], 1.4 * pt, ink);
  // drawing area & scale
  const area = { x: bx + 0.4 * dpi, y: by + 0.35 * dpi, w: tb.x - bx - 0.8 * dpi, h: bh - 1.4 * dpi };
  const pad = 96, mn = [D.bmin[0] - pad, D.bmin[1] - pad], mx = [D.bmax[0] + pad, D.bmax[1] + pad];
  let sc = ARCH_SCALES[ARCH_SCALES.length - 1];
  for (const s of ARCH_SCALES) if ((mx[0] - mn[0]) / 12 * s[0] * dpi <= area.w && (mx[1] - mn[1]) / 12 * s[0] * dpi <= area.h) { sc = s; break; }
  c.scale = sc[0] / 12 * dpi;
  c.offset = [area.x + area.w / 2 - (mn[0] + mx[0]) / 2 * c.scale, area.y + area.h / 2 - (mn[1] + mx[1]) / 2 * c.scale];
  drawPlan(c, p, D, { dims: 1, labels: true, fixtures: true, print: true, units: p.units });

  const circle = (cx, cy, r, w) => { const pts = []; for (let i = 0; i < 40; i++) { const a = i / 40 * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } c.pcPolyline(pts, true, w, ink); };
  // drawing title
  const ty = by + bh - 0.55 * dpi, cx = area.x + 0.3 * dpi, r = 0.24 * dpi;
  circle(cx, ty, r, 1.2 * pt);
  c.pcLine([cx - r, ty], [cx + r, ty], 0.8 * pt, ink);
  c.pcText([cx, ty - r * 0.45], '1', 10 * pt, ink, 'center', 0, true);
  c.pcText([cx, ty + r * 0.48], 'A-101', 6 * pt, ink);
  const tx = cx + r + 0.15 * dpi;
  c.pcText([tx, ty - 8 * pt], 'FLOOR PLAN', 15 * pt, ink, 'left', 0, true);
  c.pcLine([tx, ty + 2 * pt], [tx + Math.max(c.pcTextWidth('FLOOR PLAN', 15 * pt, true), 2.2 * dpi), ty + 2 * pt], 1.6 * pt, ink);
  c.pcText([tx, ty + 11 * pt], `SCALE: ${sc[1]}`, 8.5 * pt, ink, 'left');
  // north arrow
  const nx = area.x + area.w - 0.45 * dpi, ny = ty - 0.05 * dpi, nr = 0.28 * dpi;
  circle(nx, ny, nr, 0.9 * pt);
  c.pcPolyFill([[nx, ny - nr * 0.85], [nx - nr * 0.35, ny + nr * 0.55], [nx, ny + nr * 0.25]], ink);
  c.pcPolyline([[nx, ny - nr * 0.85], [nx, ny + nr * 0.25], [nx + nr * 0.35, ny + nr * 0.55]], true, 0.8 * pt, ink);
  c.pcText([nx, ny - nr - 7 * pt], 'N', 9 * pt, ink, 'center', 0, true);
  // graphic scale
  const segFt = sc[0] < 0.1 ? 16 : sc[0] < 0.2 ? 8 : 4, seg = segFt * sc[0] * dpi, sbx = nx - 0.6 * dpi - seg * 4;
  for (let i = 0; i < 4; i++) { if (i % 2 === 0) c.pcRectFill(sbx + seg * i, ty - 3 * pt, seg, 6 * pt, ink); c.pcRectLine(sbx + seg * i, ty - 3 * pt, seg, 6 * pt, 0.6 * pt, ink); }
  for (let i = 0; i <= 4; i++) c.pcText([sbx + seg * i, ty + 11 * pt], `${segFt * i}'`, 6.5 * pt, ink);

  // title block
  const x = tb.x + 0.18 * dpi, w = tb.w - 0.36 * dpi;
  let y = tb.y + 0.2 * dpi;
  const divider = (yy) => c.pcLine([tb.x, yy], [tb.x + tb.w, yy], 0.8 * pt, ink);
  const small = (xx, yy, s) => c.pcText([xx, yy], s, 6 * pt, '#6e727a', 'left', 0, true);
  const row = (l, v, bold = false) => { c.pcText([x, y], l, 8 * pt, ink, 'left', 0, bold); c.pcText([x + w, y], v, 8 * pt, ink, 'right', 0, bold); y += 12 * pt; };
  c.pcText([x, y + 6 * pt], p.info.designer || 'FloorPlan Studio', 13 * pt, ink, 'left', 0, true);
  c.pcText([x, y + 22 * pt], 'Residential Design & Drafting', 7.5 * pt, dim, 'left');
  y += 0.62 * dpi; divider(y); y += 0.14 * dpi;
  small(x, y, 'PROJECT'); y += 14 * pt;
  for (const ln of wrapLines(c, p.info.name, 14 * pt, w, true)) { c.pcText([x, y], ln, 14 * pt, ink, 'left', 0, true); y += 17 * pt; }
  if (p.info.address) for (const ln of wrapLines(c, p.info.address, 8.5 * pt, w)) { c.pcText([x, y], ln, 8.5 * pt, ink, 'left'); y += 12 * pt; }
  if (p.info.client) { y += 4 * pt; small(x, y, 'CLIENT'); y += 12 * pt; c.pcText([x, y], p.info.client, 8.5 * pt, ink, 'left'); y += 12 * pt; }
  y += 0.08 * dpi; divider(y);
  const cellh = 0.42 * dpi, half = tb.w / 2;
  const cells = [['DRAWN BY', p.info.designer || '—'], ['DATE', dateString()], ['SCALE', sc[1]], ['UNITS', p.units === 0 ? 'Feet & inches' : 'Metric']];
  cells.forEach((cl, i) => {
    const cx2 = tb.x + (i % 2) * half + 0.18 * dpi, cy = y + Math.floor(i / 2) * cellh;
    small(cx2, cy + 10 * pt, cl[0]);
    c.pcText([cx2, cy + 22 * pt], cl[1], 8.5 * pt, ink, 'left');
  });
  c.pcLine([tb.x + half, y], [tb.x + half, y + cellh * 2], 0.6 * pt, ink);
  c.pcLine([tb.x, y + cellh], [tb.x + tb.w, y + cellh], 0.6 * pt, ink);
  y += cellh * 2; divider(y); y += 0.14 * dpi;
  small(x, y, 'AREA SUMMARY'); y += 14 * pt;
  row('Living area (net)', formatArea(totalRoomArea(D), p.units), true);
  row('Footprint (gross)', formatArea(footprintArea(D), p.units));
  row('Rooms', String(D.rooms.length));
  y += 6 * pt; divider(y); y += 0.14 * dpi;
  const bottom = tb.y + tb.h - 1.15 * dpi;
  small(x, y, 'ROOM SCHEDULE'); y += 14 * pt;
  const rooms = D.rooms.map(rm => [roomName(p, rm), rm.area]).sort((a, b) => b[1] - a[1]);
  let shown = 0;
  for (const rr of rooms) {
    if (y > bottom - 1.4 * dpi) { c.pcText([x, y], `… and ${rooms.length - shown} more`, 7.5 * pt, dim, 'left'); y += 11 * pt; break; }
    row(rr[0], formatArea(rr[1], p.units)); shown++;
  }
  y += 6 * pt; divider(y); y += 0.14 * dpi;
  small(x, y, 'DOOR & WINDOW SCHEDULE'); y += 14 * pt;
  const ops = [];
  for (const o of p.openings) {
    const e = ops.find(r2 => r2.kind === o.kind && Math.abs(r2.w - o.width) < 0.5 && Math.abs(r2.h - o.height) < 0.5);
    if (e) e.count++; else ops.push({ kind: o.kind, w: o.width, h: o.height, count: 1 });
  }
  ops.sort((a, b) => a.kind - b.kind);
  for (const o of ops) { if (y > bottom - 0.35 * dpi) break; row(`${o.count} x ${OPENING_DEFS[o.kind].name}`, `${formatLength(o.w, p.units)} x ${formatLength(o.h, p.units)}`); }
  if (!ops.length) { c.pcText([x, y], 'None', 8 * pt, dim, 'left'); y += 12 * pt; }
  if (p.info.notes && y < bottom - 0.4 * dpi) {
    y += 6 * pt; divider(y); y += 0.14 * dpi;
    small(x, y, 'NOTES'); y += 13 * pt;
    for (const ln of wrapLines(c, p.info.notes, 7.5 * pt, w)) { if (y > bottom) break; c.pcText([x, y], ln, 7.5 * pt, ink, 'left'); y += 10.5 * pt; }
  }
  const sy = tb.y + tb.h - 1.05 * dpi;
  divider(sy);
  small(x, sy + 0.16 * dpi, 'SHEET TITLE');
  c.pcText([x, sy + 0.38 * dpi], 'FLOOR PLAN', 11 * pt, ink, 'left', 0, true);
  c.pcText([x, sy + 0.6 * dpi], 'Generated with FloorPlan Studio', 6.5 * pt, dim, 'left');
  c.pcLine([tb.x + tb.w * 0.62, sy], [tb.x + tb.w * 0.62, tb.y + tb.h], 0.8 * pt, ink);
  small(tb.x + tb.w * 0.62 + 0.12 * dpi, sy + 0.16 * dpi, 'SHEET');
  c.pcText([tb.x + tb.w * 0.81, sy + 0.56 * dpi], 'A-101', 22 * pt, ink, 'center', 0, true);
}

function sheetCanvas(dpi = 200) {
  ensureDerived();
  const cv = document.createElement('canvas');
  cv.width = SHEET_W * dpi; cv.height = SHEET_H * dpi;
  drawSheet(new Cv({ ctx: cv.getContext('2d') }), app.p, app.D, dpi);
  return cv;
}
function sheetSVG() {
  ensureDerived();
  const c = new Cv({ svg: true });
  drawSheet(c, app.p, app.D, 72);
  return c.svgString(SHEET_W, SHEET_H, SHEET_W * 72, SHEET_H * 72);
}
function exportSheetsCmd() {
  if (!app.p.walls.length) { toast('Draw some walls first', false); return; }
  const name = safeName(app.p.info.name);
  sheetCanvas(200).toBlob(b => downloadBlob(b, `${name}_A101.png`), 'image/png');
  setTimeout(() => downloadText(sheetSVG(), `${name}_A101.svg`, 'image/svg+xml'), 300);
  toast(`Exported ${name}_A101.png + .svg`);
}

function exportObjCmd() {
  ensureDerived();
  const name = safeName(app.p.info.name);
  const sb = app.v3.buildScene(app.p, app.D);
  const obj = [`# ${app.p.info.name} - exported by FloorPlan Studio`, '# Units: feet, Y up', `mtllib ${name}.mtl`], mtl = [];
  let base = 1;
  sb.b.forEach((b, m) => {
    const n = b.pos.length / 3;
    if (!n) return;
    const mn = safeName(MATERIALS[m].name), c = MATERIALS[m].color;
    mtl.push(`newmtl ${mn}`, `Kd ${(c[0] / 255).toFixed(3)} ${(c[1] / 255).toFixed(3)} ${(c[2] / 255).toFixed(3)}`, m === M.Glass ? 'd 0.35' : '', '');
    obj.push(`o ${mn}`, `usemtl ${mn}`);
    for (let i = 0; i < n; i++) obj.push(`v ${b.pos[i * 3].toFixed(4)} ${b.pos[i * 3 + 1].toFixed(4)} ${b.pos[i * 3 + 2].toFixed(4)} ${b.col[i * 4].toFixed(3)} ${b.col[i * 4 + 1].toFixed(3)} ${b.col[i * 4 + 2].toFixed(3)}`);
    for (let i = 0; i < n; i++) obj.push(`vt ${b.uv[i * 2].toFixed(4)} ${b.uv[i * 2 + 1].toFixed(4)}`);
    for (let i = 0; i < n; i++) obj.push(`vn ${b.nrm[i * 3].toFixed(3)} ${b.nrm[i * 3 + 1].toFixed(3)} ${b.nrm[i * 3 + 2].toFixed(3)}`);
    for (let t = 0; t < n / 3; t++) { const i = base + t * 3; obj.push(`f ${i}/${i}/${i} ${i + 1}/${i + 1}/${i + 1} ${i + 2}/${i + 2}/${i + 2}`); }
    base += n;
  });
  downloadText(obj.join('\n'), `${name}.obj`);
  setTimeout(() => downloadText(mtl.join('\n'), `${name}.mtl`), 300);
  toast(`Exported ${name}.obj + .mtl`);
}

// ---------------------------------------------------------------- screenshots
function planImage(w, h, fit, title) {
  ensureDerived();
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  let offset, zoom;
  if (fit) {
    const D = app.D, pad = 110, mn = [D.bmin[0] - pad, D.bmin[1] - pad - 40], mx = [D.bmax[0] + pad, D.bmax[1] + pad];
    zoom = Math.min(w / (mx[0] - mn[0]), h / (mx[1] - mn[1]));
    offset = [w / 2 - (mn[0] + mx[0]) / 2 * zoom, h / 2 - (mn[1] + mx[1]) / 2 * zoom];
  } else { const s = w / app.cw; zoom = app.zoom * s; offset = V.mul(app.offset, s); }
  const k = w / 1600;
  const c = new Cv({ ctx, offset, scale: zoom, lw: Math.max(k, 1), ts: clamp(zoom * 0.9, 1.15 * k, 6 * k), minText: 9 * k, minLine: 1 });
  drawPlan(c, app.p, app.D, { dims: app.dims, labels: app.showLabels, fixtures: app.showFixtures, units: app.p.units });
  if (title) {
    c.pcText([28 * k, 30 * k], app.p.info.name, 26 * k, COL.text, 'left', 0, true);
    c.pcText([28 * k, 60 * k], `Floor Plan  ·  ${formatArea(totalRoomArea(app.D), app.p.units)} living  ·  ${dateString()}`, 15 * k, '#5a606c', 'left');
  }
  return cv;
}

function prepare3d() {
  ensureDerived();
  if (app.v3.dirty) app.v3.rebuild(app.p, app.D);
  app.v3.updateShadowMap();
}

function screenshotCmd() {
  const name = safeName(app.p.info.name);
  let cv, file;
  if (app.mode === '3d') {
    prepare3d();
    const w = 1920, hgt = Math.round(w * app.ch / app.cw);
    cv = app.v3.renderToCanvas(app.v3.camera(), w, hgt, app.p, app.D);
    file = `${name}_${safeName(CAM_PRESETS[app.v3.preset])}_${stamp()}.png`;
  } else {
    cv = planImage(app.cw * 2, app.ch * 2, false, false);
    file = `${name}_plan_${stamp()}.png`;
  }
  cv.toBlob(b => downloadBlob(b, file), 'image/png');
  toast(`Saved ${file}`);
}

function captureAllViews() {
  prepare3d();
  const v = app.v3, items = [], W = 1920, H = 1080, name = safeName(app.p.info.name);
  items.push({ label: 'Floor plan', name: `${name}_00_floor_plan.png`, url: planImage(2400, 1600, true, true).toDataURL('image/png') });
  for (let pr = 0; pr < 8; pr++) {
    const cam = v.goalCamera(v.presetGoal(pr, W / H));
    items.push({ label: CAM_PRESETS[pr], name: `${name}_${String(pr + 1).padStart(2, '0')}_${safeName(CAM_PRESETS[pr])}.png`, url: v.renderToCanvas(cam, W, H, app.p, app.D).toDataURL('image/png') });
  }
  items.push({ label: 'Interior', name: `${name}_09_interior.png`, url: v.renderToCanvas(walkGoalCamera(), W, H, app.p, app.D).toDataURL('image/png') });
  if (!v.cutaway) {
    v.cutaway = true; v.rebuild(app.p, app.D); v.updateShadowMap();
    items.push({ label: 'Cutaway aerial', name: `${name}_10_cutaway_aerial.png`, url: v.renderToCanvas(v.goalCamera(v.presetGoal(1, W / H)), W, H, app.p, app.D).toDataURL('image/png') });
    v.cutaway = false; v.rebuild(app.p, app.D); v.updateShadowMap();
  }
  return items;
}
function captureAllCmd() {
  if (!app.p.walls.length) { toast('Draw some walls first', false); return; }
  toast('Rendering all views…');
  setTimeout(() => showGallery(captureAllViews()), 30);
}
function walkGoalCamera() {
  const v = app.v3, D = app.D;
  let best = -1, ba = 0;
  D.rooms.forEach((r, i) => { if (r.area > ba) { ba = r.area; best = i; } });
  const c = v.center();
  if (best < 0) return { pos: [c[0], 5.3, v.sceneMax[2] + 15], target: c, fovy: 70, ortho: false };
  const r = D.rooms[best];
  return {
    pos: [(r.bmin[0] + (r.bmax[0] - r.bmin[0]) * 0.15) * F, 5.3, (r.bmax[1] - (r.bmax[1] - r.bmin[1]) * 0.12) * F],
    target: [r.labelPos[0] * F + (r.bmax[0] - r.bmin[0]) * F * 0.3, 4.2, r.bmin[1] * F], fovy: 70, ortho: false,
  };
}

// ---------------------------------------------------------------- mode switching
function switchMode(m) {
  if (app.mode === m) return;
  if (m === '3d' && !app.v3.ok) { toast('WebGL2 is not available in this browser', false); return; }
  app.mode = m;
  finishChain();
  app.dimStage = 0;
  app.drag = 'none';
  document.getElementById('plan').classList.toggle('hidden', m !== 'plan');
  document.getElementById('gl').classList.toggle('hidden', m !== '3d');
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
  if (m === '3d') {
    ensureDerived();
    if (app.v3.dirty) app.v3.rebuild(app.p, app.D);
    const key = [app.v3.sceneMin[0], app.v3.sceneMin[2], app.v3.sceneMax[0], app.v3.sceneMax[2]];
    const changed = !app.lastBounds || key.some((k, i) => Math.abs(k - app.lastBounds[i]) > 4);
    if (!app.v3.initializedCam || changed) {
      app.v3.applyPreset(app.v3.preset === 8 ? 0 : app.v3.preset, app.D, app.cw / app.ch, true);
      app.v3.initializedCam = true;
    }
    app.lastBounds = key;
    app.v3.sel = null;
  }
  renderLeftbar();
  app.panelDirty = true;
}
function setPreset(i) {
  ensureDerived();
  if (app.v3.dirty) app.v3.rebuild(app.p, app.D);
  app.v3.applyPreset(i, app.D, app.cw / app.ch);
  renderLeftbar();
  app.panelDirty = true;
}
