'use strict';
// 2D vectors are [x, y] arrays.
const DEG = Math.PI / 180;
const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
  mul: (a, s) => [a[0] * s, a[1] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1],
  cross: (a, b) => a[0] * b[1] - a[1] * b[0],
  len: (a) => Math.hypot(a[0], a[1]),
  dist: (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]),
  norm: (a) => { const l = Math.hypot(a[0], a[1]); return l < 1e-9 ? [1, 0] : [a[0] / l, a[1] / l]; },
  perp: (d) => [-d[1], d[0]],
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
  rot: (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; },
  eq: (a, b, e = 0.5) => Math.hypot(b[0] - a[0], b[1] - a[1]) < e,
};

function distPointSeg(p, a, b) {
  const ab = V.sub(b, a);
  const l2 = V.dot(ab, ab);
  if (l2 < 1e-12) return { d: V.dist(p, a), t: 0, c: a.slice() };
  const t = Math.max(0, Math.min(1, V.dot(V.sub(p, a), ab) / l2));
  const c = V.add(a, V.mul(ab, t));
  return { d: V.dist(p, c), t, c };
}

function segIntersect(a, b, c, d) {
  const r = V.sub(b, a), s = V.sub(d, c);
  const den = V.cross(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const t = V.cross(V.sub(c, a), s) / den;
  const u = V.cross(V.sub(c, a), r) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { p: V.add(a, V.mul(r, t)), t, u };
}

function lineIntersect(p, d, q, e) {
  const den = V.cross(d, e);
  if (Math.abs(den) < 1e-6) return null;
  const t = V.cross(V.sub(q, p), e) / den;
  return V.add(p, V.mul(d, t));
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}
function polyPerimeter(pts) { let l = 0; for (let i = 0; i < pts.length; i++) l += V.dist(pts[i], pts[(i + 1) % pts.length]); return l; }
function polyCentroid(pts) {
  const a = polyArea(pts);
  if (Math.abs(a) < 1e-6) {
    let c = [0, 0]; for (const p of pts) c = V.add(c, p);
    return V.mul(c, 1 / Math.max(pts.length, 1));
  }
  let cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f; cy += (p[1] + q[1]) * f;
  }
  return [cx / (6 * a), cy / (6 * a)];
}
function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function distToEdges(p, pts) {
  let best = 1e30;
  for (let i = 0; i < pts.length; i++) best = Math.min(best, distPointSeg(p, pts[i], pts[(i + 1) % pts.length]).d);
  return best;
}
function polyBounds(pts) {
  const mn = [1e30, 1e30], mx = [-1e30, -1e30];
  for (const p of pts) { mn[0] = Math.min(mn[0], p[0]); mn[1] = Math.min(mn[1], p[1]); mx[0] = Math.max(mx[0], p[0]); mx[1] = Math.max(mx[1], p[1]); }
  return [mn, mx];
}
function labelPoint(pts) {
  const c = polyCentroid(pts);
  const [mn, mx] = polyBounds(pts);
  const size = Math.min(mx[0] - mn[0], mx[1] - mn[1]);
  if (pointInPoly(c, pts) && distToEdges(c, pts) > size * 0.25) return c;
  let best = c, bd = pointInPoly(c, pts) ? distToEdges(c, pts) : -1;
  const N = 16;
  for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
    const p = [mn[0] + (mx[0] - mn[0]) * (ix + 0.5) / N, mn[1] + (mx[1] - mn[1]) * (iy + 0.5) / N];
    if (!pointInPoly(p, pts)) continue;
    const d = distToEdges(p, pts) - V.dist(p, c) * 0.05;
    if (d > bd) { bd = d; best = p; }
  }
  return best;
}
function pointInTri(p, a, b, c) {
  const d1 = V.cross(V.sub(b, a), V.sub(p, a)), d2 = V.cross(V.sub(c, b), V.sub(p, b)), d3 = V.cross(V.sub(a, c), V.sub(p, c));
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
// Ear clipping. Returns [[i,j,k], ...]
function triangulate(pts) {
  const out = [];
  const n = pts.length;
  if (n < 3) return out;
  const idx = [];
  for (let i = 0; i < n; i++) if (V.dist(pts[i], pts[(i + n - 1) % n]) > 1e-4) idx.push(i);
  if (idx.length < 3) return out;
  const ccw = polyArea(pts) > 0;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    const m = idx.length;
    let found = false;
    for (let i = 0; i < m; i++) {
      const ia = idx[(i + m - 1) % m], ib = idx[i], ic = idx[(i + 1) % m];
      const a = pts[ia], b = pts[ib], c = pts[ic];
      let cr = V.cross(V.sub(b, a), V.sub(c, b));
      if (!ccw) cr = -cr;
      if (cr <= 1e-7) {
        if (Math.abs(cr) <= 1e-7) { idx.splice(i, 1); found = true; break; }
        continue;
      }
      let inside = false;
      for (const j of idx) {
        if (j === ia || j === ib || j === ic) continue;
        if (pointInTri(pts[j], a, b, c)) { inside = true; break; }
      }
      if (inside) continue;
      out.push([ia, ib, ic]);
      idx.splice(i, 1);
      found = true;
      break;
    }
    if (!found) {
      for (let i = 1; i < idx.length - 1; i++) out.push([idx[0], idx[i], idx[i + 1]]);
      return out;
    }
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}
const snapF = (v, step) => step > 0 ? Math.round(v / step) * step : v;
const wrapDeg = (a) => { let r = a % 360; if (r < 0) r += 360; return r; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
