'use strict';
// Architectural plan rendering shared by the screen, PNG sheet and SVG sheet.

const COL = {
  wallExt: '#26282e', wallInt: '#585c64', line: '#141418', symbol: '#282a32', dim: '#284678',
  fixture: '#464a54', text: '#191c22', white: '#ffffff',
};

function floorTint(s) {
  switch (matOf(s)) {
    case M.Hardwood: case M.Vinyl_Plank: case M.Wood_Panel: return '#f7f0e4';
    case M.Floor_Tile: case M.Subway_Tile: case M.Marble: return '#ecf1f4';
    case M.Carpet: return '#f3efe9';
    case M.Concrete: case M.Cmu: return '#ececea';
    case M.Grass: return '#e6f2e2';
  }
  return '#f6f6f6';
}

function drawWallPlan(c, p, D, wi, fill, outline) {
  const g = D.geo[wi];
  const spans = wallOpeningsSorted(p, D, wi);
  const INF = 1e9;
  const cuts = [];
  let s = -INF;
  for (const sp of spans) { if (sp.t1 - sp.t0 < 0.5) continue; cuts.push([s, sp.t0]); s = sp.t1; }
  cuts.push([s, INF]);
  const lw = 0.7;
  for (const [a, b] of cuts) {
    const ls = a === -INF ? g.la : wallSidePoint(p, D, wi, true, a);
    const rs = a === -INF ? g.ra : wallSidePoint(p, D, wi, false, a);
    const le = b === INF ? g.lb : wallSidePoint(p, D, wi, true, b);
    const re = b === INF ? g.rb : wallSidePoint(p, D, wi, false, b);
    c.polyFill([ls, le, re, rs], fill);
    c.line(ls, le, lw, outline);
    c.line(rs, re, lw, outline);
    if (a !== -INF || g.degA <= 1) c.line(ls, rs, lw, outline);
    if (b !== INF || g.degB <= 1) c.line(le, re, lw, outline);
  }
}

function drawOpeningPlan(c, p, D, o, col) {
  const wi = wallIndex(p, o.wall);
  if (wi < 0 || wi >= D.geo.length) return;
  const w = p.walls[wi], g = D.geo[wi];
  const [c0, c1] = wallClearRange(p, D, wi);
  const t0 = Math.max(o.t - o.width / 2, c0), t1 = Math.min(o.t + o.width / 2, c1);
  if (t1 <= t0) return;
  const A = (t) => V.add(w.a, V.mul(g.dir, t));
  const N = (pt, k) => V.add(pt, V.mul(g.n, k));
  const h = w.thickness / 2, s = o.flip_side ? -1 : 1, width = t1 - t0;
  const thin = 0.45, med = 0.8;
  switch (o.kind) {
    case OK.Door: case OK.Double_Door: {
      const leaves = o.kind === OK.Door ? 1 : 2, lw = width / leaves;
      for (let li = 0; li < leaves; li++) {
        let ht, ot;
        if (leaves === 1) { ht = o.flip_hinge ? t1 : t0; ot = o.flip_hinge ? t0 : t1; }
        else { ht = li === 0 ? t0 : t1; ot = li === 0 ? t0 + lw : t1 - lw; }
        const H = N(A(ht), s * h), C = N(A(ot), s * h), E = N(H, s * lw);
        const tw = V.norm(V.sub(C, H));
        const leaf = [H, E, V.add(E, V.mul(tw, 1.5)), V.add(H, V.mul(tw, 1.5))];
        c.polyFill(leaf, COL.white); c.polyline(leaf, true, med, col);
        const a0 = Math.atan2(E[1] - H[1], E[0] - H[0]);
        let a1 = Math.atan2(C[1] - H[1], C[0] - H[0]);
        while (a1 - a0 > Math.PI) a1 -= 2 * Math.PI;
        while (a0 - a1 > Math.PI) a1 += 2 * Math.PI;
        c.arc(H, lw, a0, a1, thin, col);
      }
      break;
    }
    case OK.Sliding_Door: {
      const mid = (t0 + t1) / 2;
      const p1 = [N(A(t0), 1.5), N(A(mid + 2), 1.5), N(A(mid + 2), 0.25), N(A(t0), 0.25)];
      const p2 = [N(A(mid - 2), -0.25), N(A(t1), -0.25), N(A(t1), -1.5), N(A(mid - 2), -1.5)];
      c.polyFill(p1, COL.white); c.polyFill(p2, COL.white);
      c.polyline(p1, true, thin, col); c.polyline(p2, true, thin, col);
      c.line(N(A(t0), h), N(A(t1), h), thin, col); c.line(N(A(t0), -h), N(A(t1), -h), thin, col);
      break;
    }
    case OK.Pocket_Door: {
      const a = N(A(t0 - width * 0.85), 0.75), b = N(A(t0 + width * 0.15), 0.75), cc = N(A(t0 + width * 0.15), -0.75), d = N(A(t0 - width * 0.85), -0.75);
      c.dashed(a, b, thin, col, 2); c.dashed(d, cc, thin, col, 2); c.line(b, cc, thin, col);
      c.line(N(A(t1), h), N(A(t1), -h), thin, col);
      break;
    }
    case OK.Bifold_Door: {
      const half = width / 2, depth = half * 0.45;
      for (let side = 0; side < 2; side++) {
        const base = side === 0 ? t0 : t1, dir = side === 0 ? 1 : -1;
        const q0 = N(A(base), s * h), q1 = N(A(base + dir * half * 0.5), s * (h + depth)), q2 = N(A(base + dir * half), s * h);
        c.line(q0, q1, med, col); c.line(q1, q2, med, col);
      }
      break;
    }
    case OK.Garage_Door:
      c.dashed(N(A(t0), h), N(A(t1), h), thin, col, 5); c.dashed(N(A(t0), -h), N(A(t1), -h), thin, col, 5);
      c.line(A(t0), A(t1), med, col);
      break;
    case OK.Cased_Opening:
      c.dashed(N(A(t0), h), N(A(t1), h), thin, col, 3); c.dashed(N(A(t0), -h), N(A(t1), -h), thin, col, 3);
      break;
    default: {
      const box = [N(A(t0), h), N(A(t1), h), N(A(t1), -h), N(A(t0), -h)];
      c.polyFill(box, COL.white); c.polyline(box, true, thin, col);
      const mid = (t0 + t1) / 2;
      if (o.kind === OK.Picture_Window) c.line(A(t0), A(t1), med, col);
      else if (o.kind === OK.Sliding_Window) {
        c.line(N(A(t0), 0.75), N(A(mid + 2), 0.75), med, col); c.line(N(A(mid - 2), -0.75), N(A(t1), -0.75), med, col);
      } else {
        c.line(N(A(t0), 0.6), N(A(t1), 0.6), thin, col); c.line(N(A(t0), -0.6), N(A(t1), -0.6), thin, col);
        if (o.kind === OK.Casement_Window) c.line(N(A(mid), h), N(A(mid), -h), thin, col);
      }
    }
  }
}

// ---- fixture symbols (local x = width, y = depth, back at -y) ----
function drawFixturePlan(c, f, col, fill = COL.white) {
  const P = (x, y) => fixL2W(f, [x, y]);
  const rect = (x0, y0, x1, y1, filled = true, w = 0.5) => { const pts = [P(x0, y0), P(x1, y0), P(x1, y1), P(x0, y1)]; if (filled) c.polyFill(pts, fill); c.polyline(pts, true, w, col); };
  const line = (a, b, w = 0.4) => c.line(P(a[0], a[1]), P(b[0], b[1]), w, col);
  const ell = (cx, cy, rx, ry, filled = true, w = 0.45) => { const [ax, ay] = fixtureAxes(f); const pts = ellipsePts(P(cx, cy), rx, ry, ax, ay); if (filled) c.polyFill(pts, fill); c.polyline(pts, true, w, col); };
  const text = (x, y, s, size) => c.text(P(x, y), s, size, col, 'center', readableAngle(V.sub(fixL2W(f, [1, 0]), f.pos)));
  const hw = f.size[0] / 2, hd = f.size[1] / 2;
  switch (f.kind) {
    case FK.Bed_Queen: case FK.Bed_King: case FK.Bed_Twin: {
      rect(-hw, -hd, hw, hd, true, 0.6);
      const twin = f.kind === FK.Bed_Twin, pw = twin ? hw * 2 - 8 : hw - 6;
      if (twin) rect(-pw / 2, -hd + 3, pw / 2, -hd + 15, true, 0.4);
      else { rect(-hw + 4, -hd + 3, -hw + 4 + pw, -hd + 15, true, 0.4); rect(hw - 4 - pw, -hd + 3, hw - 4, -hd + 15, true, 0.4); }
      const fold = -hd + f.size[1] * 0.32;
      line([-hw, fold], [hw, fold], 0.45); line([-hw, fold], [-hw + 14, fold + 12], 0.35); line([-hw + 14, fold + 12], [hw, fold + 12], 0.3);
      break;
    }
    case FK.Sofa: case FK.Armchair: {
      rect(-hw, -hd, hw, hd, true, 0.6);
      const arm = Math.min(7, hw * 0.25);
      rect(-hw, -hd, hw, -hd + 8, true, 0.45); rect(-hw, -hd, -hw + arm, hd, true, 0.45); rect(hw - arm, -hd, hw, hd, true, 0.45);
      const seats = f.kind === FK.Sofa ? Math.max(1, Math.floor((f.size[0] - 2 * arm) / 26)) : 1;
      const sw = (f.size[0] - 2 * arm) / seats;
      for (let i = 1; i < seats; i++) { const x = -hw + arm + sw * i; line([x, -hd + 8], [x, hd], 0.35); }
      break;
    }
    case FK.Coffee_Table: rect(-hw, -hd, hw, hd, true, 0.55); rect(-hw + 2, -hd + 2, hw - 2, hd - 2, false, 0.3); break;
    case FK.Dining_Table: {
      const chairs = Math.max(1, Math.floor(f.size[0] / 26)), sp = f.size[0] / chairs;
      for (let i = 0; i < chairs; i++) { const cx = -hw + sp * (i + 0.5); rect(cx - 8, -hd - 14, cx + 8, -hd + 2, true, 0.4); rect(cx - 8, hd - 2, cx + 8, hd + 14, true, 0.4); }
      if (f.size[1] > 30) { rect(-hw - 14, -8, -hw + 2, 8, true, 0.4); rect(hw - 2, -8, hw + 14, 8, true, 0.4); }
      rect(-hw, -hd, hw, hd, true, 0.6);
      break;
    }
    case FK.Desk: rect(-hw, -hd, hw, hd, true, 0.55); ell(0, hd + 6, 9, 9, true, 0.4); break;
    case FK.Wardrobe: rect(-hw, -hd, hw, hd, true, 0.55); line([-hw, -hd], [hw, hd], 0.3); line([-hw, hd], [hw, -hd], 0.3); break;
    case FK.Toilet:
      rect(-hw, -hd, hw, -hd + 8, true, 0.5);
      ell(0, -hd + 8 + (f.size[1] - 8) * 0.5, hw * 0.75, (f.size[1] - 8) * 0.5, true, 0.5);
      ell(0, -hd + 8 + (f.size[1] - 8) * 0.55, hw * 0.45, (f.size[1] - 8) * 0.32, false, 0.35);
      break;
    case FK.Vanity: rect(-hw, -hd, hw, hd, true, 0.55); ell(0, 1, Math.min(hw * 0.6, 9), hd * 0.6, true, 0.45); break;
    case FK.Bathtub: rect(-hw, -hd, hw, hd, true, 0.6); rect(-hw + 3, -hd + 3, hw - 3, hd - 3, false, 0.4); ell(-hw + 8, 0, 1.5, 1.5, false, 0.35); break;
    case FK.Shower: rect(-hw, -hd, hw, hd, true, 0.6); line([-hw, -hd], [hw, hd], 0.3); line([-hw, hd], [hw, -hd], 0.3); ell(0, 0, 2, 2, true, 0.35); break;
    case FK.Counter: case FK.Island: rect(-hw, -hd, hw, hd, true, 0.55); if (f.kind === FK.Counter) line([-hw, -hd + 12], [hw, -hd + 12], 0.25); break;
    case FK.Kitchen_Sink: {
      rect(-hw, -hd, hw, hd, true, 0.55);
      const bw = (f.size[0] - 8) / 2;
      rect(-hw + 3, -hd + 4, -hw + 3 + bw, hd - 3, false, 0.4); rect(hw - 3 - bw, -hd + 4, hw - 3, hd - 3, false, 0.4);
      break;
    }
    case FK.Range: {
      rect(-hw, -hd, hw, hd, true, 0.55);
      const r = Math.min(hw, hd) * 0.32;
      for (const bx of [-hw * 0.5, hw * 0.5]) for (const by of [-hd * 0.45, hd * 0.4]) ell(bx, by, r, r, false, 0.35);
      break;
    }
    case FK.Refrigerator: rect(-hw, -hd, hw, hd, true, 0.55); text(0, 0, 'REF', 5); break;
    case FK.Dishwasher: rect(-hw, -hd, hw, hd, true, 0.45); text(0, 0, 'DW', 5); break;
    case FK.Washer: case FK.Dryer: rect(-hw, -hd, hw, hd, true, 0.55); ell(0, 2, hw * 0.6, hw * 0.6, false, 0.4); text(0, 2, f.kind === FK.Washer ? 'W' : 'D', 5); break;
    case FK.Stairs: {
      rect(-hw, -hd, hw, hd, true, 0.55);
      const steps = Math.max(2, Math.round(f.height / 7.5)), run = f.size[1] / steps;
      for (let i = 1; i < steps; i++) { const y = hd - run * i; line([-hw, y], [hw, y], 0.35); }
      line([0, hd - 4], [0, -hd + 8], 0.45); line([0, -hd + 8], [-4, -hd + 14], 0.45); line([0, -hd + 8], [4, -hd + 14], 0.45);
      text(0, hd - 10, 'UP', 6);
      break;
    }
    case FK.Fireplace: rect(-hw, -hd, hw, hd, true, 0.6); rect(-hw * 0.55, -hd + 2, hw * 0.55, hd - 4, false, 0.4); line([-hw * 0.55, hd - 4], [hw * 0.55, -hd + 2], 0.25); break;
  }
}

function drawDimension(c, a, b, offset, units, col, textPt = 7) {
  if (V.dist(a, b) < 0.5) return;
  const d = V.norm(V.sub(b, a)), n = V.perp(d), sgn = offset >= 0 ? 1 : -1;
  const pa = V.add(a, V.mul(n, offset)), pb = V.add(b, V.mul(n, offset));
  const wpp = 1 / c.scale;
  const gap = 2 * c.lw * wpp, over = 4 * c.lw * wpp;
  if (Math.abs(offset) > gap) {
    c.line(V.add(a, V.mul(n, sgn * gap)), V.add(pa, V.mul(n, sgn * over)), 0.3, col);
    c.line(V.add(b, V.mul(n, sgn * gap)), V.add(pb, V.mul(n, sgn * over)), 0.3, col);
  }
  c.line(V.sub(pa, V.mul(d, over)), V.add(pb, V.mul(d, over)), 0.35, col);
  const tick = V.mul(V.norm(V.add(d, n)), 3.5 * c.lw * wpp);
  c.line(V.sub(pa, tick), V.add(pa, tick), 0.9, col);
  c.line(V.sub(pb, tick), V.add(pb, tick), 0.9, col);
  const txt = formatLength(V.dist(a, b), units);
  const tpx = c.textPx(textPt);
  const mid = V.lerp(pa, pb, 0.5);
  const tw = c.pcTextWidth(txt, tpx) * wpp;
  const ang = readableAngle(d);
  const up = V.mul(V.perp(V.rot([1, 0], ang * DEG)), -1);
  let pos = V.add(mid, V.mul(up, tpx * 0.62 * wpp));
  if (tw > V.dist(pa, pb) - 2 * over) pos = V.add(pos, V.mul(n, sgn * tpx * 0.9 * wpp));
  c.text(pos, txt, textPt, col, 'center', ang);
}

function drawAutoDims(c, p, D, mode, units) {
  if (mode === 0) return;
  p.walls.forEach((w, wi) => {
    const g = D.geo[wi];
    if (g.extL !== g.extR) {
      const left = g.extL;
      drawDimension(c, left ? g.la : g.ra, left ? g.lb : g.rb, left ? 24 : -24, units, COL.dim);
    } else if (mode === 2) {
      drawDimension(c, g.la, g.lb, w.thickness / 2 + 8, units, '#5a6e96', 6);
    }
  });
  if (D.outlines.length) {
    let mn = [1e30, 1e30], mx = [-1e30, -1e30];
    for (const ol of D.outlines) { const [a, b] = polyBounds(ol); mn = [Math.min(mn[0], a[0]), Math.min(mn[1], a[1])]; mx = [Math.max(mx[0], b[0]), Math.max(mx[1], b[1])]; }
    drawDimension(c, [mn[0], mn[1]], [mx[0], mn[1]], -60, units, COL.dim, 8);
    drawDimension(c, [mn[0], mx[1]], [mn[0], mn[1]], -60, units, COL.dim, 8);
  }
}

// opts: {dims: 0|1|2, labels, fixtures, print, units}
function drawPlan(c, p, D, opts) {
  for (const r of D.rooms) c.polyFill(r.poly, opts.print ? '#fcfcfc' : floorTint(roomFloor(p, r)));
  if (opts.fixtures) for (const f of p.fixtures) drawFixturePlan(c, f, COL.fixture);
  for (const jn of D.junctions) {
    const ext = D.nodes[jn.node].edges.some(e => wallIsExterior(D, e.wall));
    c.polyFill(jn.poly, ext ? COL.wallExt : COL.wallInt);
  }
  p.walls.forEach((w, wi) => drawWallPlan(c, p, D, wi, wallIsExterior(D, wi) ? COL.wallExt : COL.wallInt, COL.line));
  for (const o of p.openings) drawOpeningPlan(c, p, D, o, COL.symbol);
  if (opts.labels) {
    for (const r of D.rooms) {
      const tpx = c.textPx(9) / c.scale;
      const lp = r.labelPos;
      c.text([lp[0], lp[1] - tpx * 0.55], roomName(p, r).toUpperCase(), 9, COL.text, 'center', 0, true);
      let info = formatAreaShort(r.area, opts.units);
      const bw = r.bmax[0] - r.bmin[0], bh = r.bmax[1] - r.bmin[1];
      if (Math.abs(bw * bh - r.area) < r.area * 0.03) info = `${formatLength(bw, opts.units)} x ${formatLength(bh, opts.units)}  ·  ${info}`;
      c.text([lp[0], lp[1] + tpx * 0.6], info, 6.5, '#464a54');
    }
  }
  drawAutoDims(c, p, D, opts.dims, opts.units);
  for (const dm of p.dims) drawDimension(c, dm.a, dm.b, dm.offset, opts.units, COL.dim);
  for (const l of p.labels) c.text(l.pos, l.text, l.size, COL.text);
}
