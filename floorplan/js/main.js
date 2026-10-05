'use strict';
// Startup, DOM events, main loop, 3D navigation and overlays.

let texCanvases = [];
const planCanvas = document.getElementById('plan');
const glCanvas = document.getElementById('gl');
const ovCanvas = document.getElementById('overlay');
const planCtx = planCanvas.getContext('2d');
const ovCtx = ovCanvas.getContext('2d');
const viewport = document.getElementById('viewport');
let dpr = 1;

function resize() {
  const r = viewport.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  app.cw = Math.max(1, Math.round(r.width));
  app.ch = Math.max(1, Math.round(r.height));
  for (const c of [planCanvas, glCanvas, ovCanvas]) {
    c.width = Math.round(app.cw * dpr);
    c.height = Math.round(app.ch * dpr);
  }
}

// ---------------------------------------------------------------- events
function hookEvents() {
  window.addEventListener('resize', resize);
  const onDown = (e) => {
    if (modalOpen()) return;
    inp.down[e.button] = true;
    inp.pressed[e.button] = true;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    e.preventDefault();
  };
  for (const c of [planCanvas, glCanvas]) {
    c.addEventListener('mousedown', onDown);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => { inp.wheel += e.deltaY * (e.deltaMode === 1 ? 33 : 1); e.preventDefault(); }, { passive: false });
    c.addEventListener('mouseenter', () => inp.inCanvas = true);
    c.addEventListener('mouseleave', () => inp.inCanvas = false);
    c.addEventListener('dblclick', (e) => e.preventDefault());
  }
  window.addEventListener('mousemove', (e) => {
    const r = viewport.getBoundingClientRect();
    inp.mouse = [e.clientX - r.left, e.clientY - r.top];
    inp.delta = V.add(inp.delta, [e.movementX, e.movementY]);
  });
  window.addEventListener('mouseup', (e) => { if (inp.down[e.button]) { inp.down[e.button] = false; inp.released[e.button] = true; } });
  window.addEventListener('blur', () => { inp.keys.clear(); inp.down = [false, false, false]; });
  window.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (modalOpen()) { if (e.key === 'Escape' || e.key === 'F1') { closeModal(); e.preventDefault(); } return; }
    inp.keys.add(e.code);
    if (e.repeat) inp.kr.add(e.code); else inp.kp.add(e.code);
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) inp.chars.push(e.key);
    const ctrl = e.ctrlKey || e.metaKey;
    if (e.code === 'Tab' || e.code === 'F1' || e.code === 'F9' || e.code === 'Space' || e.code === 'Backspace' || e.code.startsWith('Arrow') || (ctrl && /^Key[SOENZYAD]$/.test(e.code))) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => inp.keys.delete(e.code));
  document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => runCmd(b.dataset.cmd)));
  document.querySelectorAll('#modeSeg button').forEach(b => b.addEventListener('click', () => switchMode(b.dataset.mode)));
  document.getElementById('fileInput').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) openFile(f); e.target.value = ''; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (!f) return;
    if (/\.(fplan|json)$/i.test(f.name)) confirmDiscard(() => openFile(f));
    else toast('Only .fplan project files can be opened', false);
  });
  window.addEventListener('beforeunload', (e) => { autosave(); if (app.modified && app.p.walls.length) { e.preventDefault(); e.returnValue = ''; } });
}

function runCmd(cmd) {
  switch (cmd) {
    case 'new': confirmDiscard(() => { newProjectCmd(); toast('New project'); }); break;
    case 'open': openCmd(); break;
    case 'save': saveCmd(); break;
    case 'undo': doUndo(); break;
    case 'redo': doRedo(); break;
    case 'sheet': exportSheetsCmd(); break;
    case 'obj': exportObjCmd(); break;
    case 'shot': screenshotCmd(); break;
    case 'all': captureAllCmd(); break;
    case 'sample': confirmDiscard(loadSample); break;
    case 'help': showHelp(); break;
    case 'startwalls': setTool('wall'); renderLeftbar(); app.welcome = false; break;
    case 'restore':
      try { loadProjectText(localStorage.getItem(AUTOSAVE_KEY), 'last session'); } catch (e) { toast('Nothing to restore', false); }
      break;
  }
}

function globalShortcuts() {
  if (modalOpen()) return;
  const ctrl = inp.ctrl, shift = inp.shift;
  if (kp('Tab')) switchMode(app.mode === 'plan' ? '3d' : 'plan');
  if (ctrl) {
    if (kp('KeyZ')) shift ? doRedo() : doUndo();
    if (kp('KeyY')) doRedo();
    if (kp('KeyS')) saveCmd();
    if (kp('KeyO')) openCmd();
    if (kp('KeyN')) runCmd('new');
    if (kp('KeyE')) exportSheetsCmd();
    if (kp('F9')) captureAllCmd();
  } else if (kp('F9')) screenshotCmd();
  if (kp('F1')) showHelp();
  if (app.mode === '3d' && !ctrl) {
    for (let i = 0; i < 9; i++) if (kp('Digit' + (i + 1))) setPreset(i);
    if (kp('KeyC')) { app.v3.cutaway = !app.v3.cutaway; app.v3.dirty = true; app.panelDirty = true; }
  }
}

// ---------------------------------------------------------------- 3D input
function view3dInput(dt) {
  const v = app.v3, mouse = inp.mouse, inVp = inp.inCanvas && !modalOpen(), md = inp.delta, shift = inp.shift;
  const cam = v.camera();
  const ray = v.ray(cam, mouse[0], mouse[1], app.cw, app.ch);
  if (inVp && inp.pressed[0]) { v.pressPos = mouse.slice(); v.pressButton = 1; v.dragging = false; }
  if (inVp && (inp.pressed[1] || inp.pressed[2])) { v.pressPos = mouse.slice(); v.pressButton = 2; v.dragging = false; }
  const key = (c) => inp.keys.has(c);
  if (v.walk) {
    if ((inp.down[0] || inp.down[2]) && v.pressButton) { v.walkYaw += md[0] * 0.2; v.walkPitch = clamp(v.walkPitch - md[1] * 0.2, -85, 85); }
    const yr = v.walkYaw * DEG, fwd = [Math.cos(yr), 0, Math.sin(yr)], right = [-fwd[2], 0, fwd[0]];
    let mv = [0, 0, 0];
    if (key('KeyW') || key('ArrowUp')) mv = v3add(mv, fwd);
    if (key('KeyS') || key('ArrowDown')) mv = v3sub(mv, fwd);
    if (key('KeyD') || key('ArrowRight')) mv = v3add(mv, right);
    if (key('KeyA') || key('ArrowLeft')) mv = v3sub(mv, right);
    if (key('KeyQ')) v.walkYaw -= 90 * dt;
    if (key('KeyE')) v.walkYaw += 90 * dt;
    if (v3len(mv) > 0) v.walkPos = v3add(v.walkPos, v3mul(v3norm(mv), (shift ? 16 : 7) * dt));
    if (inVp && inp.wheel) v.walkPos = v3add(v.walkPos, v3mul(fwd, -Math.sign(inp.wheel) * 2));
    if (kp('Escape')) { v.applyPreset(0, app.D, app.cw / app.ch, true); renderLeftbar(); app.panelDirty = true; }
  } else {
    if (v.pressButton === 1 && inp.down[0]) {
      if (V.dist(mouse, v.pressPos) > 4) v.dragging = true;
      if (v.dragging) { v.yaw += md[0] * 0.35; v.pitch = clamp(v.pitch + md[1] * 0.3, -10, 89.9); v.g.yaw = v.yaw; v.g.pitch = v.pitch; }
    }
    if (v.pressButton === 2 && (inp.down[1] || inp.down[2])) {
      const fwd = v3norm(v3sub(cam.target, cam.pos)), right = v3norm(v3cross(fwd, [0, 1, 0])), up = v3cross(right, fwd);
      const viewH = v.ortho ? v.orthoSize : v.dist * 2 * Math.tan(v.fovy * 0.5 * DEG), s = viewH / app.ch;
      v.target = v3add(v3sub(v.target, v3mul(right, md[0] * s)), v3mul(up, md[1] * s));
      v.g.target = v.target.slice();
    }
    if (inVp && inp.wheel) {
      const f = Math.pow(0.87, -Math.sign(inp.wheel) * Math.min(Math.abs(inp.wheel) / 100, 3));
      v.g.dist = clamp(v.g.dist * f, 2, 2000);
      v.g.orthoSize = clamp(v.g.orthoSize * f, 2, 2000);
    }
    const yr = v.yaw * DEG, fwd = [-Math.cos(yr), 0, -Math.sin(yr)], right = [-fwd[2], 0, fwd[0]];
    let mv = [0, 0, 0];
    if (key('KeyW') || key('ArrowUp')) mv = v3add(mv, fwd);
    if (key('KeyS') || key('ArrowDown')) mv = v3sub(mv, fwd);
    if (key('KeyD') || key('ArrowRight')) mv = v3add(mv, right);
    if (key('KeyA') || key('ArrowLeft')) mv = v3sub(mv, right);
    if (v3len(mv) > 0) v.g.target = v3add(v.g.target, v3mul(v3norm(mv), v.dist * 0.7 * dt));
    if (key('KeyQ')) v.g.yaw -= 70 * dt;
    if (key('KeyE')) v.g.yaw += 70 * dt;
    if (kp('Escape')) { v.sel = null; app.panelDirty = true; }
  }
  if (inp.released[0] && v.pressButton === 1) {
    if (!v.dragging && inVp) { v.sel = v.pick(app.p, app.D, ray); document.getElementById('panel').scrollTop = 0; app.panelDirty = true; }
    v.pressButton = 0; v.dragging = false;
  }
  if ((inp.released[1] || inp.released[2]) && v.pressButton === 2) v.pressButton = 0;
  v.hover = inVp && !v.pressButton && !v.walk ? v.pick(app.p, app.D, ray) : null;
}

function draw3dOverlay() {
  const c = ovCtx, v = app.v3;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, app.cw, app.ch);
  if (app.mode !== '3d') return;
  let title = CAM_PRESETS[v.preset] + (v.cutaway ? '  ·  Cutaway' : '');
  c.font = `bold 15px ${FONT}`;
  const tw = c.measureText(title).width;
  c.fillStyle = 'rgba(20,24,30,0.68)'; c.beginPath(); c.roundRect(12, 12, tw + 24, 30, 10); c.fill();
  c.fillStyle = '#f0f2f6'; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(title, 24, 28);
  const cx = app.cw - 46, cy = 46;
  c.fillStyle = 'rgba(20,24,30,0.6)'; c.beginPath(); c.arc(cx, cy, 28, 0, Math.PI * 2); c.fill();
  let nd;
  if (v.walk) { const wy = v.walkYaw * DEG; nd = [-Math.cos(wy), Math.sin(wy)]; } else { const yr = v.yaw * DEG; nd = [Math.cos(yr), -Math.sin(yr)]; }
  nd = V.norm(nd);
  const tip = [cx + nd[0] * 20, cy + nd[1] * 20], side = V.mul(V.perp(nd), 6);
  c.fillStyle = '#e65046'; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(cx + side[0], cy + side[1]); c.lineTo(cx - side[0], cy - side[1]); c.closePath(); c.fill();
  c.fillStyle = '#f0f2f6'; c.font = `bold 14px ${FONT}`; c.textAlign = 'center'; c.fillText('N', cx + nd[0] * 33, cy + nd[1] * 33);
  if (!app.p.walls.length) {
    const msg = 'Nothing to show yet — press Tab and draw some walls.';
    c.font = `15px ${FONT}`;
    const mw = c.measureText(msg).width;
    c.fillStyle = 'rgba(20,24,30,0.8)'; c.beginPath(); c.roundRect(app.cw / 2 - mw / 2 - 16, app.ch / 2 - 20, mw + 32, 40, 12); c.fill();
    c.fillStyle = '#f0f2f6'; c.fillText(msg, app.cw / 2, app.ch / 2);
  }
}

// ---------------------------------------------------------------- loop
let lastT = performance.now(), autosaveT = 0;
let lastSig = '';
function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;
  globalShortcuts();
  ensureDerived();
  if (!modalOpen()) { if (app.mode === 'plan') planInput(); else view3dInput(dt); }
  if (app.pendingCommit && !inp.down[0]) { app.pendingCommit = false; commit(); }
  ensureDerived();
  if (app.mode === 'plan') {
    planCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawPlanScreen(planCtx);
    planCanvas.classList.toggle('select', app.tool === 'select');
  } else {
    const v = app.v3;
    if (v.dirty) v.rebuild(app.p, app.D);
    v.animate(dt);
    v.updateShadowMap();
    v.render(v.camera(), glCanvas.width, glCanvas.height, app.p, app.D, true);
  }
  draw3dOverlay();
  document.getElementById('welcome').classList.toggle('hidden', !(app.welcome && !app.p.walls.length && app.mode === 'plan'));
  const sig = JSON.stringify([app.tool, app.mode, app.sel, app.v3.sel, app.v3.preset]);
  if (sig !== lastSig) { lastSig = sig; app.panelDirty = true; renderLeftbar(); }
  if (app.panelDirty) renderPanel();
  updateStatus();
  document.title = `FloorPlan Studio — ${app.p.info.name}${app.modified ? ' *' : ''}`;
  autosaveT += dt;
  if (autosaveT > 30) { autosaveT = 0; if (app.modified) autosave(); }
  inp.endFrame();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- self test (?test=logic, ?demo=...)
function logicTest() {
  const res = [];
  const check = (ok, name) => res.push(`[${ok ? 'PASS' : 'FAIL'}] ${name}`);
  const near = (a, b) => a !== null && Math.abs(a - b) < 0.01;
  check(near(parseLength('12\'6"'), 150), 'parse 12\'6"');
  check(near(parseLength('12\' 6 1/2"'), 150.5), 'parse 12\' 6 1/2"');
  check(near(parseLength('14'), 168), 'parse bare feet');
  check(near(parseLength('32', 0, true), 32), 'parse bare inches');
  check(Math.abs(parseLength('3.5m') - 137.795) < 0.01, 'parse meters');
  check(near(parseLength('12-6'), 150), 'parse 12-6');
  check(formatLength(150.5) === '12\'-6 1/2"', 'format 12\'-6 1/2"');
  newProjectCmd();
  setTool('wall');
  for (const pt of [[0, 0], [240, 0], [240, 144], [0, 144], [0, 0]]) placeWallPoint(pt);
  check(!app.drawing && app.p.walls.length === 4, 'wall chain closes (4 walls)');
  ensureDerived();
  check(app.D.rooms.length === 1, 'room detected');
  check(app.D.rooms.length === 1 && Math.abs(app.D.rooms[0].area - 234 * 138) < 1, 'net room area');
  check(app.D.geo[0].extL !== app.D.geo[0].extR, 'exterior side classified');
  app.wallExt = false;
  placeWallPoint([120, 0]); placeWallPoint([120, 144]); finishChain();
  ensureDerived();
  check(app.p.walls.length === 7, 'T-junction splits walls (7 walls)');
  check(app.D.rooms.length === 2, 'two rooms after partition');
  const pv = openingPreview([120, 72], 32);
  check(pv.ok && pv.valid, 'door fits on partition');
  if (pv.ok) { app.p.openings.push(makeOpening(app.p, OK.Door, app.p.walls[pv.wi].id, pv.t, 32, 80, 0)); commit(); }
  const n = app.p.openings.length;
  doUndo(); check(app.p.openings.length === n - 1, 'undo removes door');
  doRedo(); check(app.p.openings.length === n, 'redo restores door');
  createRoomRect([240, 0], [360, 144]);
  ensureDerived();
  check(app.D.rooms.length === 3, 'adjacent room shares wall (3 rooms)');
  app.p.info.name = 'Round "Trip"';
  const p2 = projectFixup(JSON.parse(JSON.stringify(app.p)));
  check(p2.walls.length === app.p.walls.length && p2.info.name === 'Round "Trip"', 'save/load round trip');
  selectOnly({ kind: 'wall', idx: 0 });
  const nw = app.p.walls.length;
  deleteSelection();
  check(app.p.walls.length === nw - 1, 'delete wall');
  const sheet = sheetSVG();
  check(sheet.startsWith('<?xml') && sheet.includes('A-101'), 'SVG sheet export');
  const fails = res.filter(r => r.startsWith('[FAIL')).length;
  res.push(`LOGIC TEST: ${fails} failure(s)`);
  return res;
}

function runDemo(demo) {
  if (demo === 'logic') {
    const out = logicTest();
    const pre = h('pre', { id: 'testresult', style: { position: 'fixed', inset: '60px', background: '#111', color: '#9f9', padding: '16px', zIndex: 50, fontSize: '14px' } }, out.join('\n'));
    document.body.append(pre);
    return;
  }
  loadSample();
  const steps = {
    select: () => { selectOnly({ kind: 'wall', idx: 0 }); },
    door: () => { setTool('door'); inp.inCanvas = true; inp.mouse = V.add(toScreen([324, 0]), [40, 20]); },
    '3d': () => switchMode('3d'),
    '3dsel': () => { switchMode('3d'); app.v3.sel = { kind: 'wall', wall: 2, left: app.D.geo[2].extL }; setPreset(3); },
    cutaway: () => { switchMode('3d'); app.v3.cutaway = true; app.v3.dirty = true; setPreset(1); },
    walk: () => { switchMode('3d'); setPreset(8); },
    sheet: () => { const img = h('img', { src: sheetCanvas(110).toDataURL(), style: { position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#888', zIndex: 60 } }); document.body.append(img); },
    gallery: () => { app.mode = 'plan'; showGallery(captureAllViews()); },
  };
  if (steps[demo]) setTimeout(steps[demo], 50);
}

// ---------------------------------------------------------------- start
function start() {
  texCanvases = TexGen.generateAll();
  try { app.v3 = new View3D(glCanvas, texCanvases); } catch (e) { console.error(e); app.v3 = { ok: false, sel: null, preset: 0, dirty: false }; }
  setOpenKind(OK.Door);
  resize();
  hookEvents();
  app.offset = [app.cw / 2, app.ch / 2];
  app.D = computeDerived(app.p);
  resetHistory();
  try {
    if (localStorage.getItem(AUTOSAVE_KEY)) {
      const card = document.getElementById('welcome');
      card.append(h('button', { class: 'ghost wide', onclick: () => runCmd('restore') }, 'Restore Last Session'));
    }
  } catch (e) { /* storage unavailable */ }
  document.getElementById('gl').classList.add('hidden');
  renderLeftbar();
  const params = new URLSearchParams(location.search);
  if (params.has('sample')) loadSample();
  if (params.get('demo')) runDemo(params.get('demo'));
  requestAnimationFrame(frame);
}
start();
