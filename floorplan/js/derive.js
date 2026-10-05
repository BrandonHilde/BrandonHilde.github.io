'use strict';
// Geometry derived from the project: mitered wall outlines, junctions, rooms (planar-graph faces),
// exterior/interior side classification and bounds.

function computeDerived(p) {
  const D = { geo: [], nodes: [], rooms: [], outlines: [], junctions: [], bmin: [0, 0], bmax: [0, 0], hasBounds: false };
  const findNode = (pos) => {
    for (let i = 0; i < D.nodes.length; i++) if (V.dist(D.nodes[i].pos, pos) < 0.5) return i;
    D.nodes.push({ pos: pos.slice(), edges: [], comp: -1 });
    return D.nodes.length - 1;
  };
  p.walls.forEach((w, i) => {
    const dir = wallDir(w), n = V.perp(dir), h = w.thickness / 2;
    const g = {
      length: wallLen(w), dir, n, na: findNode(w.a), nb: findNode(w.b),
      la: V.add(w.a, V.mul(n, h)), ra: V.sub(w.a, V.mul(n, h)), lb: V.add(w.b, V.mul(n, h)), rb: V.sub(w.b, V.mul(n, h)),
      degA: 0, degB: 0, extL: false, extR: false,
    };
    D.geo.push(g);
    if (g.na === g.nb) return;
    D.nodes[g.na].edges.push({ wall: i, fromA: true, dir, angle: Math.atan2(dir[1], dir[0]), half: h });
    const nd = V.mul(dir, -1);
    D.nodes[g.nb].edges.push({ wall: i, fromA: false, dir: nd, angle: Math.atan2(nd[1], nd[0]), half: h });
  });

  // miter joins
  D.nodes.forEach((node, ni) => {
    const es = node.edges;
    es.sort((a, b) => a.angle - b.angle);
    const deg = es.length;
    if (deg === 0) return;
    if (deg === 1) {
      const n = V.perp(es[0].dir);
      es[0].cplus = V.add(node.pos, V.mul(n, es[0].half));
      es[0].cminus = V.sub(node.pos, V.mul(n, es[0].half));
    } else {
      for (let i = 0; i < deg; i++) {
        const ei = es[i], ej = es[(i + 1) % deg];
        const p1 = V.add(node.pos, V.mul(V.perp(ei.dir), ei.half));
        const p2 = V.sub(node.pos, V.mul(V.perp(ej.dir), ej.half));
        const x = lineIntersect(p1, ei.dir, p2, ej.dir);
        const limit = 4 * Math.max(ei.half, ej.half) + 1;
        if (x && V.dist(x, node.pos) < limit) { ei.cplus = x; ej.cminus = x; }
        else { ei.cplus = p1; ej.cminus = p2; }
      }
    }
    for (const e of es) {
      const g = D.geo[e.wall];
      if (e.fromA) { g.la = e.cplus; g.ra = e.cminus; g.degA = deg; }
      else { g.rb = e.cplus; g.lb = e.cminus; g.degB = deg; }
    }
    if (deg >= 3) {
      const poly = [];
      for (const e of es) {
        if (!poly.length || V.dist(poly[poly.length - 1], e.cminus) > 0.01) poly.push(e.cminus);
        if (V.dist(poly[poly.length - 1], e.cplus) > 0.01) poly.push(e.cplus);
      }
      if (poly.length >= 3) D.junctions.push({ poly, node: ni });
    }
  });

  // connected components
  let comp = 0;
  for (let s = 0; s < D.nodes.length; s++) {
    if (D.nodes[s].comp >= 0) continue;
    const stack = [s];
    D.nodes[s].comp = comp;
    while (stack.length) {
      const ni = stack.pop();
      for (const e of D.nodes[ni].edges) {
        const g = D.geo[e.wall];
        const o = e.fromA ? g.nb : g.na;
        if (D.nodes[o].comp < 0) { D.nodes[o].comp = comp; stack.push(o); }
      }
    }
    comp++;
  }

  // half-edge face traversal (face lies on the -n side of each half-edge)
  const nh = p.walls.length * 2;
  const heNode = new Array(nh).fill(-1), heSlot = new Array(nh).fill(0), heFace = new Array(nh).fill(-1);
  D.nodes.forEach((node, ni) => node.edges.forEach((e, k) => { const h = e.wall * 2 + (e.fromA ? 0 : 1); heNode[h] = ni; heSlot[h] = k; }));
  const faces = [];
  for (let h0 = 0; h0 < nh; h0++) {
    if (heNode[h0] < 0 || heFace[h0] >= 0) continue;
    const f = { hes: [], corners: [], centers: [], room: -1 };
    const fi = faces.length;
    let h = h0, guard = 0;
    while (guard++ < 100000) {
      heFace[h] = fi;
      f.hes.push(h);
      const u = heNode[h];
      const e = D.nodes[u].edges[heSlot[h]];
      f.centers.push(D.nodes[u].pos);
      f.corners.push(e.cminus);
      const twin = h ^ 1;
      const v = heNode[twin];
      if (v < 0) break;
      const deg = D.nodes[v].edges.length;
      if (deg === 1) f.corners.push(D.nodes[v].edges[0].cplus);
      const ne = D.nodes[v].edges[(heSlot[twin] + 1) % deg];
      h = ne.wall * 2 + (ne.fromA ? 0 : 1);
      if (h === h0) break;
    }
    f.area = polyArea(f.centers);
    f.outer = f.area > -144;
    faces.push(f);
  }
  const dedupe = (pts) => {
    const out = [];
    for (const c of pts) if (!out.length || V.dist(out[out.length - 1], c) > 0.01) out.push(c);
    if (out.length > 2 && V.dist(out[0], out[out.length - 1]) < 0.01) out.pop();
    return out;
  };
  for (const f of faces) {
    if (f.outer) continue;
    const poly = dedupe(f.corners);
    const [bmin, bmax] = polyBounds(poly);
    const r = { poly, centerPoly: f.centers, area: Math.abs(polyArea(poly)), perimeter: polyPerimeter(poly), labelPos: labelPoint(poly), bmin, bmax, tag: -1 };
    r.tag = p.rooms.findIndex(t => pointInPoly(t.pos, poly));
    f.room = D.rooms.length;
    D.rooms.push(r);
  }
  for (const f of faces) {
    if (!f.outer || !f.hes.length) continue;
    const first = heNode[f.hes[0]];
    const c = D.nodes[first].comp, pt = D.nodes[first].pos;
    for (const g of faces) {
      if (g.room < 0) continue;
      if (D.nodes[heNode[g.hes[0]]].comp === c) continue;
      if (pointInPoly(pt, D.rooms[g.room].centerPoly)) { f.outer = false; break; }
    }
    if (f.outer && f.area > 144) D.outlines.push(dedupe(f.corners));
  }
  D.geo.forEach((g, wi) => {
    const fr = heFace[wi * 2], fl = heFace[wi * 2 + 1];
    g.extR = fr < 0 || faces[fr].outer;
    g.extL = fl < 0 || faces[fl].outer;
  });
  const grow = (q) => {
    if (!D.hasBounds) { D.bmin = q.slice(); D.bmax = q.slice(); D.hasBounds = true; }
    D.bmin = [Math.min(D.bmin[0], q[0]), Math.min(D.bmin[1], q[1])];
    D.bmax = [Math.max(D.bmax[0], q[0]), Math.max(D.bmax[1], q[1])];
  };
  for (const g of D.geo) [g.la, g.lb, g.ra, g.rb].forEach(grow);
  for (const f of p.fixtures) fixCorners(f).forEach(grow);
  return D;
}

function wallSideExtent(p, D, wi, left) {
  const w = p.walls[wi], g = D.geo[wi];
  const p0 = left ? g.la : g.ra, p1 = left ? g.lb : g.rb;
  return [V.dot(V.sub(p0, w.a), g.dir), V.dot(V.sub(p1, w.a), g.dir)];
}
function wallSidePoint(p, D, wi, left, t) {
  const w = p.walls[wi], g = D.geo[wi];
  const p0 = left ? g.la : g.ra, p1 = left ? g.lb : g.rb;
  const d0 = V.dot(V.sub(p0, w.a), g.dir), d1 = V.dot(V.sub(p1, w.a), g.dir);
  if (Math.abs(d1 - d0) < 1e-5) return p0;
  return V.lerp(p0, p1, (t - d0) / (d1 - d0));
}
function wallClearRange(p, D, wi) {
  const [l0, l1] = wallSideExtent(p, D, wi, true), [r0, r1] = wallSideExtent(p, D, wi, false);
  return [Math.max(l0, r0, 0), Math.min(l1, r1, D.geo[wi].length)];
}
function wallSurface(p, D, wi, left) {
  const w = p.walls[wi];
  const s = left ? w.left : w.right;
  if (s.custom) return s;
  return (left ? D.geo[wi].extL : D.geo[wi].extR) ? p.ext_surface : p.int_surface;
}
const wallIsExterior = (D, wi) => D.geo[wi].extL || D.geo[wi].extR;
const roomName = (p, r) => (r.tag >= 0 && p.rooms[r.tag].name) ? p.rooms[r.tag].name : 'Room';
const roomFloor = (p, r) => (r.tag >= 0 && p.rooms[r.tag].floor.custom) ? p.rooms[r.tag].floor : p.floor_surface;
function roomAt(D, pt) {
  let best = -1, ba = 1e30;
  D.rooms.forEach((r, i) => { if (pointInPoly(pt, r.poly) && r.area < ba) { best = i; ba = r.area; } });
  return best;
}
const totalRoomArea = (D) => D.rooms.reduce((s, r) => s + r.area, 0);
const footprintArea = (D) => D.outlines.reduce((s, o) => s + Math.abs(polyArea(o)), 0);

function wallOpeningsSorted(p, D, wi) {
  const id = p.walls[wi].id;
  const [c0, c1] = wallClearRange(p, D, wi);
  const res = [];
  p.openings.forEach((o, i) => {
    if (o.wall !== id) return;
    const t0 = Math.max(o.t - o.width / 2, c0), t1 = Math.min(o.t + o.width / 2, c1);
    if (t1 - t0 >= 1) res.push({ idx: i, t0, t1 });
  });
  res.sort((a, b) => a.t0 - b.t0);
  for (let i = 1; i < res.length; i++) if (res[i].t0 < res[i - 1].t1) res[i].t0 = res[i - 1].t1;
  return res;
}
