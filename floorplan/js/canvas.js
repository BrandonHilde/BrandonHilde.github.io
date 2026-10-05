'use strict';
// Tiny vector drawing API with a CanvasRenderingContext2D backend and an SVG backend.
// "pc*" methods take canvas/paper coordinates; the others take world inches.

const FONT = 'Arial, Helvetica, sans-serif';
const _measureCtx = document.createElement('canvas').getContext('2d');

function measureText(s, px, bold) {
  _measureCtx.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`;
  return _measureCtx.measureText(s).width;
}

function svgEsc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
const f2 = (v) => (Math.round(v * 100) / 100).toString();

class Cv {
  constructor(opts) {
    this.ctx = opts.ctx || null;
    this.svg = opts.svg ? [] : null;
    this.offset = opts.offset || [0, 0];
    this.scale = opts.scale || 1;
    this.lw = opts.lw || 1;
    this.ts = opts.ts || 1;
    this.minText = opts.minText || 0;
    this.minLine = opts.minLine !== undefined ? opts.minLine : 1;
  }
  to(p) { return [this.offset[0] + p[0] * this.scale, this.offset[1] + p[1] * this.scale]; }
  lwPx(pt) { return Math.max(pt * this.lw, this.minLine); }
  textPx(pt) { return Math.max(pt * this.ts, this.minText); }

  // ---- paper space ----
  pcLine(a, b, w, col) {
    if (this.svg) { this.svg.push(`<line x1="${f2(a[0])}" y1="${f2(a[1])}" x2="${f2(b[0])}" y2="${f2(b[1])}" stroke="${col}" stroke-width="${f2(w)}" stroke-linecap="round"/>`); return; }
    const c = this.ctx;
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
    c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
  }
  pcPolyFill(pts, col) {
    if (pts.length < 3) return;
    if (this.svg) { this.svg.push(`<polygon points="${pts.map(p => f2(p[0]) + ',' + f2(p[1])).join(' ')}" fill="${col}"/>`); return; }
    const c = this.ctx;
    c.fillStyle = col;
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath(); c.fill();
  }
  pcPolyline(pts, closed, w, col, dash) {
    if (pts.length < 2) return;
    if (this.svg) {
      this.svg.push(`<${closed ? 'polygon' : 'polyline'} points="${pts.map(p => f2(p[0]) + ',' + f2(p[1])).join(' ')}" fill="none" stroke="${col}" stroke-width="${f2(w)}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`);
      return;
    }
    const c = this.ctx;
    c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.lineCap = 'round';
    if (dash) c.setLineDash(dash);
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    if (closed) c.closePath();
    c.stroke();
    if (dash) c.setLineDash([]);
  }
  pcRectFill(x, y, w, h, col) { this.pcPolyFill([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], col); }
  pcRectLine(x, y, w, h, lw, col) { this.pcPolyline([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], true, lw, col); }
  pcCircleFill(c0, r, col) {
    if (this.svg) { this.svg.push(`<circle cx="${f2(c0[0])}" cy="${f2(c0[1])}" r="${f2(r)}" fill="${col}"/>`); return; }
    const c = this.ctx; c.fillStyle = col; c.beginPath(); c.arc(c0[0], c0[1], r, 0, Math.PI * 2); c.fill();
  }
  pcTextWidth(s, px, bold) { return measureText(s, px, bold); }
  // anchor is vertically centered
  pcText(pos, s, px, col, align = 'center', angle = 0, bold = false) {
    if (!s) return;
    if (this.svg) {
      const anchor = align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle';
      const rot = angle ? ` transform="rotate(${f2(angle)} ${f2(pos[0])} ${f2(pos[1])})"` : '';
      this.svg.push(`<text x="${f2(pos[0])}" y="${f2(pos[1])}" font-family="${FONT}" font-size="${f2(px)}"${bold ? ' font-weight="bold"' : ''} text-anchor="${anchor}" dominant-baseline="central" fill="${col}"${rot}>${svgEsc(s)}</text>`);
      return;
    }
    const c = this.ctx;
    c.save();
    c.translate(pos[0], pos[1]);
    if (angle) c.rotate(angle * DEG);
    c.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = col;
    c.fillText(s, 0, 0);
    c.restore();
  }

  // ---- world space ----
  line(a, b, wpt, col) { this.pcLine(this.to(a), this.to(b), this.lwPx(wpt), col); }
  dashed(a, b, wpt, col, dashPt = 4) {
    const d = Math.max(dashPt * this.lw, 3);
    this.pcPolyline([this.to(a), this.to(b)], false, this.lwPx(wpt), col, [d, d]);
  }
  polyFill(pts, col) { this.pcPolyFill(pts.map(p => this.to(p)), col); }
  polyline(pts, closed, wpt, col) { this.pcPolyline(pts.map(p => this.to(p)), closed, this.lwPx(wpt), col); }
  arc(c, r, a0, a1, wpt, col) {
    const n = Math.max(8, Math.floor(Math.abs(a1 - a0) / (Math.PI / 2) * 16));
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]); }
    this.polyline(pts, false, wpt, col);
  }
  circleFill(c, r, col) { this.pcCircleFill(this.to(c), r * this.scale, col); }
  text(pos, s, pt, col, align = 'center', angle = 0, bold = false) { this.pcText(this.to(pos), s, this.textPx(pt), col, align, angle, bold); }
  svgString(wIn, hIn, vw, vh) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${wIn}in" height="${hIn}in" viewBox="0 0 ${vw} ${vh}">\n${this.svg.join('\n')}\n</svg>\n`;
  }
}

function ellipsePts(center, rx, ry, ax, ay) {
  const pts = [];
  for (let i = 0; i < 28; i++) {
    const a = i / 28 * Math.PI * 2;
    pts.push([center[0] + ax[0] * Math.cos(a) * rx + ay[0] * Math.sin(a) * ry, center[1] + ax[1] * Math.cos(a) * rx + ay[1] * Math.sin(a) * ry]);
  }
  return pts;
}

function readableAngle(d) {
  let a = Math.atan2(d[1], d[0]) / DEG;
  if (a > 90.5) a -= 180;
  if (a < -89.5) a += 180;
  return a;
}
