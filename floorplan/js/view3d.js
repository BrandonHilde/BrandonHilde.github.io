'use strict';
// WebGL2 3D view: geometry generation, lighting with shadow mapping, cameras and picking.
// 3D units are feet; plan (x, y) maps to world (x, z), y is up.

const F = 1 / 12;
const FOUNDATION = 8;
const SKY_TOP = [112, 158, 212], SKY_BOTTOM = [218, 230, 241];
const TRIM = [246, 245, 240, 255];

// ---------------------------------------------------------------- mat4 (column-major)
const Mat4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  },
  perspective(fovy, aspect, n, f) {
    const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
    o[0] = t / aspect; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
    return o;
  },
  ortho(l, r, b, t, n, f) {
    const o = new Float32Array(16);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = -2 / (f - n);
    o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = -(f + n) / (f - n); o[15] = 1;
    return o;
  },
  lookAt(e, c, up) {
    let z = v3norm(v3sub(e, c));
    let x = v3norm(v3cross(up, z));
    const y = v3cross(z, x);
    return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -v3dot(x, e), -v3dot(y, e), -v3dot(z, e), 1]);
  },
  invert(m) {
    const inv = new Float32Array(16);
    inv[0] = m[5] * m[10] * m[15] - m[5] * m[11] * m[14] - m[9] * m[6] * m[15] + m[9] * m[7] * m[14] + m[13] * m[6] * m[11] - m[13] * m[7] * m[10];
    inv[4] = -m[4] * m[10] * m[15] + m[4] * m[11] * m[14] + m[8] * m[6] * m[15] - m[8] * m[7] * m[14] - m[12] * m[6] * m[11] + m[12] * m[7] * m[10];
    inv[8] = m[4] * m[9] * m[15] - m[4] * m[11] * m[13] - m[8] * m[5] * m[15] + m[8] * m[7] * m[13] + m[12] * m[5] * m[11] - m[12] * m[7] * m[9];
    inv[12] = -m[4] * m[9] * m[14] + m[4] * m[10] * m[13] + m[8] * m[5] * m[14] - m[8] * m[6] * m[13] - m[12] * m[5] * m[10] + m[12] * m[6] * m[9];
    inv[1] = -m[1] * m[10] * m[15] + m[1] * m[11] * m[14] + m[9] * m[2] * m[15] - m[9] * m[3] * m[14] - m[13] * m[2] * m[11] + m[13] * m[3] * m[10];
    inv[5] = m[0] * m[10] * m[15] - m[0] * m[11] * m[14] - m[8] * m[2] * m[15] + m[8] * m[3] * m[14] + m[12] * m[2] * m[11] - m[12] * m[3] * m[10];
    inv[9] = -m[0] * m[9] * m[15] + m[0] * m[11] * m[13] + m[8] * m[1] * m[15] - m[8] * m[3] * m[13] - m[12] * m[1] * m[11] + m[12] * m[3] * m[9];
    inv[13] = m[0] * m[9] * m[14] - m[0] * m[10] * m[13] - m[8] * m[1] * m[14] + m[8] * m[2] * m[13] + m[12] * m[1] * m[10] - m[12] * m[2] * m[9];
    inv[2] = m[1] * m[6] * m[15] - m[1] * m[7] * m[14] - m[5] * m[2] * m[15] + m[5] * m[3] * m[14] + m[13] * m[2] * m[7] - m[13] * m[3] * m[6];
    inv[6] = -m[0] * m[6] * m[15] + m[0] * m[7] * m[14] + m[4] * m[2] * m[15] - m[4] * m[3] * m[14] - m[12] * m[2] * m[7] + m[12] * m[3] * m[6];
    inv[10] = m[0] * m[5] * m[15] - m[0] * m[7] * m[13] - m[4] * m[1] * m[15] + m[4] * m[3] * m[13] + m[12] * m[1] * m[7] - m[12] * m[3] * m[5];
    inv[14] = -m[0] * m[5] * m[14] + m[0] * m[6] * m[13] + m[4] * m[1] * m[14] - m[4] * m[2] * m[13] - m[12] * m[1] * m[6] + m[12] * m[2] * m[5];
    inv[3] = -m[1] * m[6] * m[11] + m[1] * m[7] * m[10] + m[5] * m[2] * m[11] - m[5] * m[3] * m[10] - m[9] * m[2] * m[7] + m[9] * m[3] * m[6];
    inv[7] = m[0] * m[6] * m[11] - m[0] * m[7] * m[10] - m[4] * m[2] * m[11] + m[4] * m[3] * m[10] + m[8] * m[2] * m[7] - m[8] * m[3] * m[6];
    inv[11] = -m[0] * m[5] * m[11] + m[0] * m[7] * m[9] + m[4] * m[1] * m[11] - m[4] * m[3] * m[9] - m[8] * m[1] * m[7] + m[8] * m[3] * m[5];
    inv[15] = m[0] * m[5] * m[10] - m[0] * m[6] * m[9] - m[4] * m[1] * m[10] + m[4] * m[2] * m[9] + m[8] * m[1] * m[6] - m[8] * m[2] * m[5];
    let det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
    det = det ? 1 / det : 0;
    for (let i = 0; i < 16; i++) inv[i] *= det;
    return inv;
  },
  xform(m, p) {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w];
  },
};
const v3add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const v3sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const v3mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const v3dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const v3cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const v3len = (a) => Math.hypot(a[0], a[1], a[2]);
const v3norm = (a) => { const l = v3len(a); return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l]; };

// ---------------------------------------------------------------- mesh building
const P3 = (p, h) => [p[0] * F, h * F, p[1] * F];
const N3 = (n) => [n[0], 0, n[1]];

class SceneBuild {
  constructor() { this.b = MATERIALS.map(() => ({ pos: [], nrm: [], uv: [], col: [] })); }
  vert(m, p, n, uv, c) {
    const b = this.b[m];
    b.pos.push(p[0], p[1], p[2]); b.nrm.push(n[0], n[1], n[2]); b.uv.push(uv[0], uv[1]);
    b.col.push(c[0] / 255, c[1] / 255, c[2] / 255, (c[3] === undefined ? 255 : c[3]) / 255);
  }
  quad(m, p, n, uv, c) {
    for (const i of [0, 1, 2, 0, 2, 3]) this.vert(m, p[i], n, uv[i], c);
  }
  vquad(m, pa, pb, y0, y1, n, ua, ub, c) {
    if (y1 - y0 < 0.01) return;
    const s = 1 / (MATERIALS[m].scale * 12);
    this.quad(m, [P3(pa, y0), P3(pb, y0), P3(pb, y1), P3(pa, y1)], n, [[ua * s, y0 * s], [ub * s, y0 * s], [ub * s, y1 * s], [ua * s, y1 * s]], c);
  }
  hpoly(m, pts, y, up, c) {
    const s = 1 / (MATERIALS[m].scale * 12), n = up ? [0, 1, 0] : [0, -1, 0];
    for (const t of triangulate(pts)) for (const k of t) { const q = pts[k]; this.vert(m, P3(q, y), n, [q[0] * s, q[1] * s], c); }
  }
  box(m, center, ax, sx, sy, z0, z1, c, bottom = false) {
    const ay = V.perp(ax), hx = V.mul(ax, sx / 2), hy = V.mul(ay, sy / 2);
    const p00 = V.sub(V.sub(center, hx), hy), p10 = V.sub(V.add(center, hx), hy), p11 = V.add(V.add(center, hx), hy), p01 = V.add(V.sub(center, hx), hy);
    this.vquad(m, p00, p10, z0, z1, v3mul(N3(ay), -1), 0, sx, c);
    this.vquad(m, p10, p11, z0, z1, N3(ax), 0, sy, c);
    this.vquad(m, p11, p01, z0, z1, N3(ay), 0, sx, c);
    this.vquad(m, p01, p00, z0, z1, v3mul(N3(ax), -1), 0, sy, c);
    this.hpoly(m, [p00, p10, p11, p01], z1, true, c);
    if (bottom) this.hpoly(m, [p00, p10, p11, p01], z0, false, c);
  }
}

const CAM_PRESETS = ['Perspective', 'Aerial', 'Top / Plan', 'Front Elev.', 'Rear Elev.', 'Left Elev.', 'Right Elev.', 'Isometric', 'Walkthrough'];
const CAM_SHORT = ['Persp', 'Aerial', 'Top', 'Front', 'Rear', 'Left', 'Right', 'Iso', 'Walk'];

const VS = `#version 300 es
in vec3 aPos; in vec3 aNrm; in vec2 aUv; in vec4 aCol;
uniform mat4 uVP;
out vec3 vPos; out vec3 vNrm; out vec2 vUv; out vec4 vCol;
void main() { vPos = aPos; vNrm = aNrm; vUv = aUv; vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const FS = `#version 300 es
precision highp float;
precision highp sampler2DShadow;
in vec3 vPos; in vec3 vNrm; in vec2 vUv; in vec4 vCol;
uniform sampler2D uTex; uniform sampler2DShadow uShadow; uniform mat4 uLightVP;
uniform vec3 uSunDir, uSunCol, uSky, uGround, uFog, uView;
uniform int uUseShadow; uniform float uTexel, uFogStart, uFogRange;
out vec4 outColor;
float shadowF(vec3 n, float ndl) {
  vec4 pl = uLightVP * vec4(vPos + n * 0.06, 1.0);
  vec3 p = pl.xyz / pl.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float bias = max(0.0012 * (1.0 - ndl), 0.00025);
  float s = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++)
    s += texture(uShadow, vec3(p.xy + vec2(float(x), float(y)) * uTexel, p.z - bias));
  return s / 9.0;
}
void main() {
  vec4 base = texture(uTex, vUv) * vCol;
  vec3 n = normalize(vNrm);
  float ndl = max(dot(n, uSunDir), 0.0);
  float sh = 1.0;
  if (uUseShadow == 1 && ndl > 0.0) sh = shadowF(n, ndl);
  vec3 amb = mix(uGround, uSky, n.y * 0.5 + 0.5);
  vec3 col = base.rgb * (amb + uSunCol * ndl * sh);
  vec3 v = normalize(uView - vPos);
  col += vec3(pow(max(dot(n, normalize(v + uSunDir)), 0.0), 40.0) * 0.10 * sh);
  float fog = clamp((length(uView - vPos) - uFogStart) / uFogRange, 0.0, 0.9);
  col = mix(col, uFog, fog);
  outColor = vec4(pow(col, vec3(1.0)), base.a);
}`;
const DVS = `#version 300 es
in vec3 aPos; uniform mat4 uVP; void main() { gl_Position = uVP * vec4(aPos, 1.0); }`;
const DFS = `#version 300 es
precision mediump float; out vec4 o; void main() { o = vec4(1.0); }`;
const LVS = `#version 300 es
in vec3 aPos; in vec4 aCol; uniform mat4 uVP; out vec4 vCol; void main() { vCol = aCol; gl_Position = uVP * vec4(aPos, 1.0); }`;
const LFS = `#version 300 es
precision mediump float; in vec4 vCol; out vec4 o; void main() { o = vCol; }`;

class View3D {
  constructor(canvas, texCanvases) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, preserveDrawingBuffer: false });
    this.gl = gl;
    this.ok = !!gl;
    this.yaw = 60; this.pitch = 30; this.dist = 80; this.orthoSize = 60; this.target = [0, 4, 0];
    this.g = { yaw: 60, pitch: 30, dist: 80, orthoSize: 60, target: [0, 4, 0] };
    this.ortho = false; this.fovy = 50;
    this.walk = false; this.walkPos = [0, 5.3, 0]; this.walkYaw = -90; this.walkPitch = -5;
    this.preset = 0;
    this.sunAz = 120; this.sunEl = 48;
    this.shadows = true; this.cutaway = false; this.showFixtures = true; this.cutHeight = 48;
    this.hover = null; this.sel = null;
    this.sceneMin = [-20, 0, -15]; this.sceneMax = [20, 9, 15];
    this.dirty = true;
    this.initializedCam = false;
    this.meshes = [];
    if (!gl) return;
    this.prog = this.program(VS, FS);
    this.dprog = this.program(DVS, DFS);
    this.lprog = this.program(LVS, LFS);
    this.loc = {};
    for (const n of ['uVP', 'uTex', 'uShadow', 'uLightVP', 'uSunDir', 'uSunCol', 'uSky', 'uGround', 'uFog', 'uView', 'uUseShadow', 'uTexel', 'uFogStart', 'uFogRange'])
      this.loc[n] = gl.getUniformLocation(this.prog, n);
    // textures
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    this.textures = texCanvases.map(c => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return t;
    });
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    // shadow map
    this.shadowSize = 4096;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, this.shadowSize, this.shadowSize);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.shadowFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, this.shadowTex, 0);
    this.shadowOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!this.shadowOk) this.shadows = false;
    this.lightVP = new Float32Array(16);
    this.lineBuf = gl.createBuffer();
    this.lineVao = gl.createVertexArray();
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    const lp = gl.getAttribLocation(this.lprog, 'aPos'), lc = gl.getAttribLocation(this.lprog, 'aCol');
    gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(lc); gl.vertexAttribPointer(lc, 4, gl.FLOAT, false, 28, 12);
    gl.bindVertexArray(null);
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  }

  effHeight(w) { return this.cutaway ? Math.min(w.height, this.cutHeight) : w.height; }

  // ------------------------------------------------------------ scene generation
  buildScene(p, D) {
    const sb = new SceneBuild();
    p.walls.forEach((w, wi) => this.buildWall(sb, p, D, wi));
    const capCol = this.cutaway ? [58, 60, 66, 255] : [205, 205, 205, 255];
    for (const jn of D.junctions) {
      let h = 0;
      for (const e of D.nodes[jn.node].edges) h = Math.max(h, this.effHeight(p.walls[e.wall]));
      sb.hpoly(M.Plain, jn.poly, h, true, capCol);
    }
    for (const r of D.rooms) { const s = roomFloor(p, r); sb.hpoly(matOf(s), r.poly, 0.3, true, s.color); }
    for (const ol of D.outlines) {
      sb.hpoly(M.Concrete, ol, 0, true, [205, 203, 198, 255]);
      const area = polyArea(ol);
      for (let i = 0; i < ol.length; i++) {
        const a = ol[i], b = ol[(i + 1) % ol.length], e = V.norm(V.sub(b, a));
        const out = area > 0 ? V.mul(V.perp(e), -1) : V.perp(e);
        sb.vquad(M.Concrete, a, b, -FOUNDATION, 0, N3(out), 0, V.dist(a, b), [190, 188, 182, 255]);
      }
    }
    if (this.showFixtures) for (const f of p.fixtures) this.buildFixture(sb, f);
    if (D.hasBounds) {
      let h = 96;
      for (const w of p.walls) h = Math.max(h, this.effHeight(w));
      this.sceneMin = [D.bmin[0] * F, -FOUNDATION * F, D.bmin[1] * F];
      this.sceneMax = [D.bmax[0] * F, h * F, D.bmax[1] * F];
    } else { this.sceneMin = [-20, 0, -15]; this.sceneMax = [20, 9, 15]; }
    const c = v3mul(v3add(this.sceneMin, this.sceneMax), 0.5), G = 250, gs = 1 / MATERIALS[M.Grass].scale, gy = -FOUNDATION * F - 0.01;
    sb.quad(M.Grass, [[c[0] - G, gy, c[2] - G], [c[0] + G, gy, c[2] - G], [c[0] + G, gy, c[2] + G], [c[0] - G, gy, c[2] + G]], [0, 1, 0],
      [[(c[0] - G) * gs, (c[2] - G) * gs], [(c[0] + G) * gs, (c[2] - G) * gs], [(c[0] + G) * gs, (c[2] + G) * gs], [(c[0] - G) * gs, (c[2] + G) * gs]], W255);
    return sb;
  }

  buildWall(sb, p, D, wi) {
    const w = p.walls[wi], g = D.geo[wi], H = this.effHeight(w);
    const holes = [];
    for (const sp of wallOpeningsSorted(p, D, wi)) {
      const o = p.openings[sp.idx];
      const y0 = isWindow(o) ? o.sill : 0, y1 = Math.min(y0 + o.height, H);
      if (y0 >= H - 0.5 || y1 - y0 < 1) continue;
      holes.push({ t0: sp.t0, t1: sp.t1, y0, y1, o });
    }
    for (let side = 0; side < 2; side++) {
      const left = side === 0, s = wallSurface(p, D, wi, left), m = matOf(s);
      const n3 = left ? N3(g.n) : v3mul(N3(g.n), -1);
      const [e0, e1] = wallSideExtent(p, D, wi, left);
      const quad = (t0, t1, y0, y1) => {
        if (t1 - t0 < 0.01 || y1 - y0 < 0.01) return;
        sb.vquad(m, wallSidePoint(p, D, wi, left, t0), wallSidePoint(p, D, wi, left, t1), y0, y1, n3, left ? t0 : -t0, left ? t1 : -t1, s.color);
      };
      let cur = e0;
      for (const h of holes) {
        const a = clamp(h.t0, e0, e1), b = clamp(h.t1, e0, e1);
        if (a > cur) quad(cur, a, 0, H);
        if (h.y0 > 0) quad(a, b, 0, h.y0);
        if (h.y1 < H) quad(a, b, h.y1, H);
        cur = Math.max(cur, b);
      }
      if (e1 > cur) quad(cur, e1, 0, H);
    }
    for (const h of holes) {
      const L0 = wallSidePoint(p, D, wi, true, h.t0), L1 = wallSidePoint(p, D, wi, true, h.t1);
      const R0 = wallSidePoint(p, D, wi, false, h.t0), R1 = wallSidePoint(p, D, wi, false, h.t1);
      const d3 = N3(g.dir);
      sb.vquad(M.Plain, L0, R0, h.y0, h.y1, d3, 0, w.thickness, TRIM);
      sb.vquad(M.Plain, R1, L1, h.y0, h.y1, v3mul(d3, -1), 0, w.thickness, TRIM);
      if (h.y0 > 0) sb.hpoly(M.Plain, [L0, L1, R1, R0], h.y0, true, TRIM);
      if (h.y1 < H) sb.hpoly(M.Plain, [L0, L1, R1, R0], h.y1, false, TRIM);
      this.buildOpening(sb, w, g, h, wallIsExterior(D, wi));
    }
    const capCol = this.cutaway ? [58, 60, 66, 255] : [205, 205, 205, 255];
    sb.hpoly(M.Plain, [g.la, g.lb, g.rb, g.ra], H, true, capCol);
    for (let end = 0; end < 2; end++) {
      const atA = end === 0, node = atA ? g.na : g.nb, deg = atA ? g.degA : g.degB;
      const pl = atA ? g.la : g.lb, pr = atA ? g.ra : g.rb;
      const n3 = atA ? v3mul(N3(g.dir), -1) : N3(g.dir);
      let from = 0;
      if (deg > 1) { from = 1e9; for (const e of D.nodes[node].edges) if (e.wall !== wi) from = Math.min(from, this.effHeight(p.walls[e.wall])); }
      if (from < H) { const s = wallSurface(p, D, wi, true); sb.vquad(matOf(s), pl, pr, from, H, n3, 0, w.thickness, s.color); }
    }
  }

  buildOpening(sb, w, g, h, exterior) {
    const o = h.o, dir = g.dir, th = w.thickness;
    const A = (t) => V.add(w.a, V.mul(dir, t));
    const { t0, t1, y0, y1 } = h;
    const width = t1 - t0;
    const frame = (fw, depth, c, sill = true) => {
      sb.box(M.Plain, A(t0 + fw / 2), dir, fw, depth, y0, y1, c);
      sb.box(M.Plain, A(t1 - fw / 2), dir, fw, depth, y0, y1, c);
      sb.box(M.Plain, A((t0 + t1) / 2), dir, width, depth, y1 - fw, y1, c);
      if (sill) sb.box(M.Plain, A((t0 + t1) / 2), dir, width, depth, y0, y0 + fw, c);
    };
    const glass = [165, 195, 215, 105];
    switch (o.kind) {
      case OK.Door: case OK.Double_Door: case OK.Bifold_Door: {
        frame(1, th + 1, TRIM, false);
        const leafCol = exterior ? [120, 74, 44, 255] : [244, 243, 238, 255], leafMat = exterior ? M.Wood_Panel : M.Plain;
        const leaves = o.kind === OK.Door ? 1 : o.kind === OK.Bifold_Door ? 4 : 2;
        const lw = (width - 2) / leaves;
        for (let i = 0; i < leaves; i++) sb.box(leafMat, A(t0 + 1 + lw * (i + 0.5)), dir, lw - 0.25, 1.75, y0, y1 - 1, leafCol);
        const knob = [196, 170, 90, 255];
        if (o.kind === OK.Door) sb.box(M.Plain, A(o.flip_hinge ? t0 + 3.5 : t1 - 3.5), dir, 2, 5, 35, 37, knob);
        else if (o.kind === OK.Double_Door) { const mid = (t0 + t1) / 2; sb.box(M.Plain, A(mid - 2.5), dir, 1.5, 5, 35, 37, knob); sb.box(M.Plain, A(mid + 2.5), dir, 1.5, 5, 35, 37, knob); }
        break;
      }
      case OK.Sliding_Door: {
        const fc = [235, 235, 232, 255], mid = (t0 + t1) / 2;
        frame(2, 4, fc);
        sb.box(M.Plain, A(mid), dir, 2.5, 4, y0, y1, fc);
        sb.vquad(M.Glass, A(t0 + 2), A(mid - 1.25), y0 + 2, y1 - 2, N3(g.n), 0, width / 2, glass);
        sb.vquad(M.Glass, A(mid + 1.25), A(t1 - 2), y0 + 2, y1 - 2, N3(g.n), 0, width / 2, glass);
        break;
      }
      case OK.Pocket_Door: case OK.Cased_Opening: frame(1, th + 1, TRIM, false); break;
      case OK.Garage_Door: {
        frame(1.5, th + 1, TRIM, false);
        const off = V.mul(g.n, 0.75), gc = [248, 248, 246, 255];
        sb.vquad(M.Garage, V.add(A(t0 + 1.5), off), V.add(A(t1 - 1.5), off), y0, y1 - 1.5, N3(g.n), 0, width - 3, gc);
        sb.vquad(M.Garage, V.sub(A(t1 - 1.5), off), V.sub(A(t0 + 1.5), off), y0, y1 - 1.5, v3mul(N3(g.n), -1), 0, width - 3, gc);
        break;
      }
      default: {
        const fw = 2, depth = Math.min(th, 5);
        frame(fw, depth, TRIM);
        if (o.kind === OK.Window) sb.box(M.Plain, A((t0 + t1) / 2), dir, width, depth, (y0 + y1) / 2 - 1, (y0 + y1) / 2 + 1, TRIM);
        else if (o.kind === OK.Casement_Window || o.kind === OK.Sliding_Window) sb.box(M.Plain, A((t0 + t1) / 2), dir, 2, depth, y0, y1, TRIM);
        sb.vquad(M.Glass, A(t0 + fw), A(t1 - fw), y0 + fw, y1 - fw, N3(g.n), 0, width, glass);
        sb.box(M.Plain, A((t0 + t1) / 2), dir, width + 3, th + 2.5, y0 - 1.5, y0, TRIM, true);
      }
    }
  }

  buildFixture(sb, f) {
    const [ax] = fixtureAxes(f);
    const hw = f.size[0] / 2, hd = f.size[1] / 2;
    const box = (m, c, x0, y0, x1, y1, z0, z1) => sb.box(m, fixL2W(f, [(x0 + x1) / 2, (y0 + y1) / 2]), ax, Math.abs(x1 - x0), Math.abs(y1 - y0), z0, z1, c);
    const wood = [150, 108, 70, 255], white = [246, 246, 244, 255], steel = [196, 198, 202, 255], dark = [40, 40, 44, 255], fc = f.color;
    switch (f.kind) {
      case FK.Bed_Queen: case FK.Bed_King: case FK.Bed_Twin: {
        box(M.Wood_Panel, wood, -hw, -hd, hw, hd, 0, 12);
        box(M.Plain, [240, 238, 232, 255], -hw + 1, -hd + 3, hw - 1, hd - 1, 12, 22);
        box(M.Wood_Panel, wood, -hw, -hd, hw, -hd + 3, 0, 42);
        const twin = f.kind === FK.Bed_Twin, pw = twin ? hw * 2 - 8 : hw - 6;
        if (twin) box(M.Plain, white, -pw / 2, -hd + 4, pw / 2, -hd + 16, 22, 27);
        else { box(M.Plain, white, -hw + 4, -hd + 4, -hw + 4 + pw, -hd + 16, 22, 27); box(M.Plain, white, hw - 4 - pw, -hd + 4, hw - 4, -hd + 16, 22, 27); }
        box(M.Carpet, fc, -hw + 0.5, -hd + f.size[1] * 0.32, hw - 0.5, hd - 0.5, 18, 23.5);
        break;
      }
      case FK.Sofa: case FK.Armchair: {
        const arm = Math.min(7, hw * 0.25);
        box(M.Carpet, fc, -hw, -hd, hw, hd, 4, 17);
        box(M.Carpet, fc, -hw, -hd, hw, -hd + 9, 4, f.height);
        box(M.Carpet, fc, -hw, -hd, -hw + arm, hd, 4, 25);
        box(M.Carpet, fc, hw - arm, -hd, hw, hd, 4, 25);
        box(M.Plain, dark, -hw + 2, -hd + 2, hw - 2, hd - 2, 0, 4);
        const seats = f.kind === FK.Sofa ? Math.max(1, Math.floor((f.size[0] - 2 * arm) / 26)) : 1, sw = (f.size[0] - 2 * arm) / seats;
        const cc = [Math.min(fc[0] + 14, 255), Math.min(fc[1] + 14, 255), Math.min(fc[2] + 14, 255), 255];
        for (let i = 0; i < seats; i++) { const x0 = -hw + arm + sw * i + 0.5; box(M.Carpet, cc, x0, -hd + 9, x0 + sw - 1, hd - 1, 17, 21); }
        break;
      }
      case FK.Coffee_Table: case FK.Dining_Table: case FK.Desk: {
        const tz = f.height;
        box(M.Wood_Panel, fc, -hw, -hd, hw, hd, tz - 1.5, tz);
        for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const lx = sx * (hw - 2.5), ly = sy * (hd - 2.5); box(M.Wood_Panel, fc, lx - 1.25, ly - 1.25, lx + 1.25, ly + 1.25, 0, tz - 1.5); }
        if (f.kind === FK.Dining_Table) {
          const chairs = Math.max(1, Math.floor(f.size[0] / 26)), sp = f.size[0] / chairs;
          for (let i = 0; i < chairs; i++) {
            const cx = -hw + sp * (i + 0.5);
            for (const side of [-1, 1]) {
              const cy = side * (hd + 4), back = cy + side * 7;
              box(M.Wood_Panel, wood, cx - 8, cy - 8, cx + 8, cy + 8, 16, 18);
              box(M.Wood_Panel, wood, cx - 8, back - 1, cx + 8, back + 1, 18, 34);
              for (const lx of [-7, 7]) for (const ly of [-7, 7]) box(M.Wood_Panel, wood, cx + lx - 0.75, cy + ly - 0.75, cx + lx + 0.75, cy + ly + 0.75, 0, 16);
            }
          }
        }
        if (f.kind === FK.Desk) { box(M.Plain, dark, -9, hd + 1, 9, hd + 17, 17, 19); box(M.Plain, dark, -9, hd + 15, 9, hd + 17, 19, 36); }
        break;
      }
      case FK.Wardrobe: box(M.Wood_Panel, fc, -hw, -hd, hw, hd, 0, f.height); box(M.Plain, dark, -0.25, hd, 0.25, hd + 0.3, 4, f.height - 4); break;
      case FK.Toilet:
        box(M.Plain, white, -hw, -hd, hw, -hd + 8, 15, 30);
        box(M.Plain, white, -hw * 0.7, -hd + 6, hw * 0.7, hd, 0, 15);
        box(M.Plain, [235, 235, 235, 255], -hw * 0.75, -hd + 8, hw * 0.75, hd + 0.5, 15, 16.5);
        break;
      case FK.Vanity:
        box(M.Plain, fc, -hw, -hd, hw, hd, 0, 32.5);
        box(M.Marble, white, -hw, -hd, hw, hd + 0.75, 32.5, 34);
        box(M.Plain, [215, 220, 225, 255], -Math.min(hw * 0.6, 9), -hd * 0.5, Math.min(hw * 0.6, 9), hd * 0.6, 34, 34.2);
        box(M.Plain, steel, -1, -hd + 1, 1, -hd + 4, 34, 41);
        box(M.Glass, [200, 215, 225, 160], -hw + 2, -hd, hw - 2, -hd + 0.5, 42, 74);
        break;
      case FK.Bathtub: box(M.Plain, white, -hw, -hd, hw, hd, 0, 20); box(M.Plain, [190, 210, 222, 255], -hw + 3, -hd + 3, hw - 3, hd - 3, 20, 20.15); break;
      case FK.Shower:
        box(M.Plain, white, -hw, -hd, hw, hd, 0, 4);
        box(M.Glass, [190, 210, 225, 90], -hw, hd - 0.5, hw, hd, 4, f.height);
        box(M.Glass, [190, 210, 225, 90], hw - 0.5, -hd, hw, hd, 4, f.height);
        box(M.Plain, steel, -1, -hd, 1, -hd + 3, 70, 72);
        break;
      case FK.Counter: case FK.Kitchen_Sink: case FK.Dishwasher: case FK.Island: {
        const cab = f.kind === FK.Dishwasher ? steel : fc;
        box(M.Plain, dark, -hw + 0.5, -hd, hw - 0.5, hd - 3, 0, 4);
        box(M.Plain, cab, -hw, -hd, hw, hd - 1, 4, 34.5);
        box(M.Granite, W255, -hw, -hd, hw, f.kind === FK.Island ? hd + 10 : hd + 0.5, 34.5, 36);
        const doors = Math.max(1, Math.floor(f.size[0] / 18)), dw = f.size[0] / doors;
        for (let i = 1; i < doors; i++) { const x = -hw + dw * i; box(M.Plain, [120, 120, 120, 255], x - 0.15, hd - 1, x + 0.15, hd - 0.9, 6, 33); }
        if (f.kind === FK.Kitchen_Sink) { box(M.Plain, [150, 152, 156, 255], -hw + 4, -hd + 4, hw - 4, hd - 4, 36, 36.1); box(M.Plain, steel, -1, -hd + 1, 1, -hd + 3, 36, 46); }
        if (f.kind === FK.Counter && f.size[1] >= 20) box(M.Plain, cab, -hw, -hd, hw, -hd + 13, 54, 84);
        break;
      }
      case FK.Range:
        box(M.Plain, steel, -hw, -hd, hw, hd, 0, 35); box(M.Plain, dark, -hw, -hd, hw, hd, 35, 36);
        box(M.Plain, steel, -hw, -hd, hw, -hd + 3, 36, 44); box(M.Plain, dark, -hw + 3, hd, hw - 3, hd + 0.3, 8, 28);
        break;
      case FK.Refrigerator:
        box(M.Plain, steel, -hw, -hd, hw, hd, 0, f.height);
        box(M.Plain, [120, 120, 124, 255], -hw, hd, hw, hd + 0.2, 44, 44.5);
        box(M.Plain, [150, 150, 154, 255], -2, hd, -1, hd + 1.5, 20, 40);
        box(M.Plain, [150, 150, 154, 255], -2, hd, -1, hd + 1.5, 48, 66);
        break;
      case FK.Washer: case FK.Dryer:
        box(M.Plain, white, -hw, -hd, hw, hd, 0, f.height);
        box(M.Plain, [70, 80, 90, 255], -hw * 0.55, hd, hw * 0.55, hd + 0.4, 10, 26);
        box(M.Plain, [200, 200, 205, 255], -hw, -hd, hw, -hd + 4, f.height, f.height + 6);
        break;
      case FK.Stairs: {
        const steps = Math.max(2, Math.round(f.height / 7.5)), run = f.size[1] / steps, rise = f.height / steps;
        for (let i = 0; i < steps; i++) { const y1 = hd - run * i; box(M.Wood_Panel, fc, -hw, y1 - run, hw, y1, 0, rise * (i + 1)); }
        break;
      }
      case FK.Fireplace:
        box(M.Stone, W255, -hw, -hd, hw, hd, 0, f.height);
        box(M.Plain, [30, 28, 26, 255], -hw * 0.55, hd - 2, hw * 0.55, hd + 0.1, 4, 30);
        box(M.Wood_Panel, wood, -hw - 2, -hd, hw + 2, hd + 3, f.height - 3, f.height);
        break;
    }
  }

  rebuild(p, D) {
    if (!this.ok) return;
    const gl = this.gl;
    const sb = this.buildScene(p, D);
    for (const m of this.meshes) if (m) { gl.deleteBuffer(m.buf); gl.deleteVertexArray(m.vao); gl.deleteVertexArray(m.dvao); }
    this.meshes = [];
    sb.b.forEach((b, mi) => {
      const n = b.pos.length / 3;
      if (!n) { this.meshes.push(null); return; }
      const data = new Float32Array(n * 12);
      for (let i = 0; i < n; i++) {
        data.set(b.pos.slice(i * 3, i * 3 + 3), i * 12);
        data.set(b.nrm.slice(i * 3, i * 3 + 3), i * 12 + 3);
        data[i * 12 + 6] = b.uv[i * 2]; data[i * 12 + 7] = b.uv[i * 2 + 1];
        data.set(b.col.slice(i * 4, i * 4 + 4), i * 12 + 8);
      }
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const attr = (prog, name, size, off) => { const l = gl.getAttribLocation(prog, name); if (l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 48, off); };
      attr(this.prog, 'aPos', 3, 0); attr(this.prog, 'aNrm', 3, 12); attr(this.prog, 'aUv', 2, 24); attr(this.prog, 'aCol', 4, 32);
      const dvao = gl.createVertexArray();
      gl.bindVertexArray(dvao);
      attr(this.dprog, 'aPos', 3, 0);
      gl.bindVertexArray(null);
      this.meshes.push({ buf, vao, dvao, count: n, mat: mi });
    });
    this.sceneBuild = sb;
    this.dirty = false;
  }

  // ------------------------------------------------------------ cameras
  center() { return v3mul(v3add(this.sceneMin, this.sceneMax), 0.5); }
  radius() { return Math.max(v3len(v3sub(this.sceneMax, this.sceneMin)) * 0.5, 10); }

  presetGoal(pr, aspect) {
    const c = this.center(), r = this.radius(), ext = v3sub(this.sceneMax, this.sceneMin);
    const fit = r / Math.tan(this.fovy * 0.5 * DEG) * 0.82 * Math.max(1, 1.75 / aspect);
    const g = { target: c, dist: fit, orthoSize: r * 1.4, ortho: false, yaw: 62, pitch: 28 };
    switch (pr) {
      case 0: g.dist = fit * 0.92; break;
      case 1: g.yaw = 55; g.pitch = 58; break;
      case 2: g.ortho = true; g.yaw = 90; g.pitch = 89.9; g.orthoSize = Math.max(ext[2] * 1.12, ext[0] / aspect * 1.12); g.dist = r * 4; break;
      case 3: case 4: g.ortho = true; g.yaw = pr === 3 ? 90 : 270; g.pitch = 0; g.orthoSize = Math.max(ext[1] * 1.8, ext[0] / aspect * 1.15); g.dist = r * 4; break;
      case 5: case 6: g.ortho = true; g.yaw = pr === 5 ? 180 : 0; g.pitch = 0; g.orthoSize = Math.max(ext[1] * 1.8, ext[2] / aspect * 1.15); g.dist = r * 4; break;
      case 7: g.ortho = true; g.yaw = 45; g.pitch = 35.264; g.orthoSize = r * 1.35; g.dist = r * 4; break;
    }
    return g;
  }

  applyPreset(pr, D, aspect, instant = false) {
    this.preset = pr;
    if (pr === 8) {
      this.walk = true; this.ortho = false;
      let best = -1, ba = 0;
      D.rooms.forEach((r, i) => { if (r.area > ba) { ba = r.area; best = i; } });
      if (best >= 0) { const lp = D.rooms[best].labelPos; this.walkPos = [lp[0] * F, 5.3, lp[1] * F]; }
      else { const c = this.center(); this.walkPos = [c[0], 5.3, this.sceneMax[2] + 15]; }
      this.walkYaw = -90; this.walkPitch = -5;
      return;
    }
    this.walk = false;
    const g = this.presetGoal(pr, aspect);
    this.g = { yaw: g.yaw, pitch: g.pitch, dist: g.dist, orthoSize: g.orthoSize, target: g.target.slice() };
    if (this.ortho !== g.ortho || instant) { this.yaw = g.yaw; this.pitch = g.pitch; this.dist = g.dist; this.orthoSize = g.orthoSize; this.target = g.target.slice(); }
    this.ortho = g.ortho;
  }

  static orbitCam(target, yaw, pitch, dist, fovy, orthoSize, ortho) {
    const yr = yaw * DEG, pr = pitch * DEG;
    const off = [Math.cos(pr) * Math.cos(yr) * dist, Math.sin(pr) * dist, Math.cos(pr) * Math.sin(yr) * dist];
    return { pos: v3add(target, off), target: target.slice(), fovy: ortho ? orthoSize : fovy, ortho };
  }
  camera() {
    if (this.walk) {
      const yr = this.walkYaw * DEG, pr = this.walkPitch * DEG;
      const d = [Math.cos(pr) * Math.cos(yr), Math.sin(pr), Math.cos(pr) * Math.sin(yr)];
      return { pos: this.walkPos.slice(), target: v3add(this.walkPos, d), fovy: 70, ortho: false };
    }
    return View3D.orbitCam(this.target, this.yaw, this.pitch, this.dist, this.fovy, this.orthoSize, this.ortho);
  }
  goalCamera(g) { return View3D.orbitCam(g.target, g.yaw, g.pitch, g.dist, this.fovy, g.orthoSize, g.ortho); }
  animate(dt) {
    const k = 1 - Math.exp(-dt * 9);
    let dy = this.g.yaw - this.yaw;
    while (dy > 180) dy -= 360;
    while (dy < -180) dy += 360;
    this.yaw += dy * k;
    this.pitch += (this.g.pitch - this.pitch) * k;
    this.dist += (this.g.dist - this.dist) * k;
    this.orthoSize += (this.g.orthoSize - this.orthoSize) * k;
    this.target = v3add(this.target, v3mul(v3sub(this.g.target, this.target), k));
  }
  viewProj(cam, aspect) {
    const near = 0.1, far = 3000;
    const proj = cam.ortho ? Mat4.ortho(-cam.fovy / 2 * aspect, cam.fovy / 2 * aspect, -cam.fovy / 2, cam.fovy / 2, near, far) : Mat4.perspective(cam.fovy * DEG, aspect, near, far);
    const up = Math.abs(v3norm(v3sub(cam.target, cam.pos))[1]) > 0.9999 ? [0, 0, -1] : [0, 1, 0];
    return Mat4.mul(proj, Mat4.lookAt(cam.pos, cam.target, up));
  }
  sunDir() {
    const az = this.sunAz * DEG, el = this.sunEl * DEG;
    return v3norm([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
  }

  // ------------------------------------------------------------ rendering
  updateShadowMap() {
    if (!this.ok || !this.shadows || !this.shadowOk) return;
    const gl = this.gl, L = this.sunDir(), c = this.center(), r = this.radius() * 1.1;
    const up = Math.abs(L[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0];
    const view = Mat4.lookAt(v3add(c, v3mul(L, r * 2)), c, up);
    const proj = Mat4.ortho(-r, r, -r, r, r * 0.5, r * 3.5);
    this.lightVP = Mat4.mul(proj, view);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFbo);
    gl.viewport(0, 0, this.shadowSize, this.shadowSize);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(this.dprog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.dprog, 'uVP'), false, this.lightVP);
    for (const m of this.meshes) if (m && m.mat !== M.Glass && m.mat !== M.Grass) { gl.bindVertexArray(m.dvao); gl.drawArrays(gl.TRIANGLES, 0, m.count); }
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // Renders into the currently bound framebuffer with the given viewport size.
  render(cam, w, h, p, D, overlays) {
    const gl = this.gl;
    gl.viewport(0, 0, w, h);
    gl.disable(gl.DEPTH_TEST);
    // sky gradient via scissored clears
    const bands = 24;
    gl.enable(gl.SCISSOR_TEST);
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1);
      const col = [0, 1, 2].map(k => (SKY_BOTTOM[k] + (SKY_TOP[k] - SKY_BOTTOM[k]) * t) / 255);
      gl.scissor(0, Math.floor(h * i / bands), w, Math.ceil(h / bands) + 1);
      gl.clearColor(col[0], col[1], col[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    gl.disable(gl.SCISSOR_TEST);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const vp = this.viewProj(cam, w / h);
    this.lastVP = vp;
    gl.useProgram(this.prog);
    const L = this.sunDir(), ek = clamp(Math.sin(this.sunEl * DEG) * 1.6, 0.25, 1), r = this.radius();
    const useShadow = this.shadows && this.shadowOk ? 1 : 0;
    gl.uniformMatrix4fv(this.loc.uVP, false, vp);
    gl.uniformMatrix4fv(this.loc.uLightVP, false, this.lightVP);
    gl.uniform3fv(this.loc.uSunDir, L);
    gl.uniform3f(this.loc.uSunCol, 0.80 * ek, 0.76 * ek, 0.68 * ek);
    gl.uniform3f(this.loc.uSky, 0.52, 0.56, 0.63);
    gl.uniform3f(this.loc.uGround, 0.36, 0.34, 0.31);
    gl.uniform3f(this.loc.uFog, SKY_BOTTOM[0] / 255, SKY_BOTTOM[1] / 255, SKY_BOTTOM[2] / 255);
    gl.uniform3fv(this.loc.uView, cam.pos);
    gl.uniform1i(this.loc.uUseShadow, useShadow);
    gl.uniform1f(this.loc.uTexel, 1 / this.shadowSize);
    gl.uniform1f(this.loc.uFogStart, r * 2.5);
    gl.uniform1f(this.loc.uFogRange, r * 8 + 200);
    gl.uniform1i(this.loc.uTex, 0);
    gl.uniform1i(this.loc.uShadow, 1);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.disable(gl.BLEND);
    let glass = null;
    for (const m of this.meshes) {
      if (!m) continue;
      if (m.mat === M.Glass) { glass = m; continue; }
      gl.bindTexture(gl.TEXTURE_2D, this.textures[m.mat]);
      gl.bindVertexArray(m.vao);
      gl.drawArrays(gl.TRIANGLES, 0, m.count);
    }
    if (glass) {
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
      gl.depthMask(false);
      gl.bindTexture(gl.TEXTURE_2D, this.textures[M.Glass]);
      gl.bindVertexArray(glass.vao);
      gl.drawArrays(gl.TRIANGLES, 0, glass.count);
      gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    if (overlays) {
      this.drawPick(p, D, this.hover, [1, 1, 1, 0.8], false, vp);
      this.drawPick(p, D, this.sel, [0.24, 0.55, 1, 1], true, vp);
    }
    gl.disable(gl.BLEND);
  }

  drawPick(p, D, pk, col, fill, vp) {
    if (!pk) return;
    const lines = [], tris = [];
    if (pk.kind === 'wall') {
      if (pk.wall >= p.walls.length) return;
      const w = p.walls[pk.wall], g = D.geo[pk.wall], H = this.effHeight(w);
      const p0 = pk.left ? g.la : g.ra, p1 = pk.left ? g.lb : g.rb, nn = V.mul(pk.left ? g.n : V.mul(g.n, -1), 0.4);
      const q = [P3(V.add(p0, nn), 0.5), P3(V.add(p1, nn), 0.5), P3(V.add(p1, nn), H - 0.5), P3(V.add(p0, nn), H - 0.5)];
      for (let i = 0; i < 4; i++) lines.push(q[i], q[(i + 1) % 4]);
      if (fill) tris.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    } else if (pk.kind === 'floor') {
      if (pk.room >= D.rooms.length) return;
      const poly = D.rooms[pk.room].poly;
      for (let i = 0; i < poly.length; i++) lines.push(P3(poly[i], 1), P3(poly[(i + 1) % poly.length], 1));
      if (fill) for (const t of triangulate(poly)) for (const k of t) tris.push(P3(poly[k], 0.8));
    } else return;
    const gl = this.gl;
    gl.useProgram(this.lprog);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.lprog, 'uVP'), false, vp);
    gl.bindVertexArray(this.lineVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lineBuf);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE);
    const upload = (pts, a) => {
      const d = new Float32Array(pts.length * 7);
      pts.forEach((q, i) => d.set([q[0], q[1], q[2], col[0], col[1], col[2], a], i * 7));
      gl.bufferData(gl.ARRAY_BUFFER, d, gl.DYNAMIC_DRAW);
    };
    if (tris.length) { gl.depthMask(false); upload(tris, 0.2); gl.drawArrays(gl.TRIANGLES, 0, tris.length); gl.depthMask(true); }
    upload(lines, col[3]); gl.drawArrays(gl.LINES, 0, lines.length);
    gl.bindVertexArray(null);
  }

  // Ray through a viewport pixel (x, y in CSS px of a w x h view).
  ray(cam, x, y, w, h) {
    const vp = this.viewProj(cam, w / h), inv = Mat4.invert(vp);
    const nx = x / w * 2 - 1, ny = 1 - y / h * 2;
    const a = Mat4.xform(inv, [nx, ny, -1]), b = Mat4.xform(inv, [nx, ny, 1]);
    return { o: a, d: v3norm(v3sub(b, a)) };
  }

  pick(p, D, ray) {
    const tri = (o, d, a, b, c) => {
      const e1 = v3sub(b, a), e2 = v3sub(c, a), pv = v3cross(d, e2), det = v3dot(e1, pv);
      if (Math.abs(det) < 1e-9) return null;
      const inv = 1 / det, tv = v3sub(o, a), u = v3dot(tv, pv) * inv;
      if (u < 0 || u > 1) return null;
      const qv = v3cross(tv, e1), v = v3dot(d, qv) * inv;
      if (v < 0 || u + v > 1) return null;
      const t = v3dot(e2, qv) * inv;
      return t > 0 ? t : null;
    };
    let best = null, bd = 1e30;
    p.walls.forEach((w, wi) => {
      const g = D.geo[wi], H = this.effHeight(w);
      for (const left of [true, false]) {
        const p0 = left ? g.la : g.ra, p1 = left ? g.lb : g.rb;
        const q = [P3(p0, 0), P3(p1, 0), P3(p1, H), P3(p0, H)];
        const t = tri(ray.o, ray.d, q[0], q[1], q[2]) ?? tri(ray.o, ray.d, q[0], q[2], q[3]);
        if (t !== null && t < bd) {
          const nn = left ? N3(g.n) : v3mul(N3(g.n), -1);
          if (v3dot(nn, ray.d) < 0) { bd = t; best = { kind: 'wall', wall: wi, left }; }
        }
      }
    });
    if (ray.d[1] < -1e-4) {
      const t = (0.3 * F - ray.o[1]) / ray.d[1];
      if (t > 0 && t < bd) {
        const hp = v3add(ray.o, v3mul(ray.d, t));
        const ri = roomAt(D, [hp[0] / F, hp[2] / F]);
        if (ri >= 0) best = { kind: 'floor', room: ri };
      }
    }
    return best;
  }

  // Off-screen render (2x supersampled) -> canvas element of size w x h.
  renderToCanvas(cam, w, h, p, D) {
    const gl = this.gl, SS = 2, W = w * SS, H = h * SS;
    const fbo = gl.createFramebuffer(), tex = gl.createTexture(), rb = gl.createRenderbuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
    this.render(cam, W, H, p, D, false);
    const px = new Uint8ClampedArray(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex); gl.deleteRenderbuffer(rb);
    const big = document.createElement('canvas');
    big.width = W; big.height = H;
    const bctx = big.getContext('2d');
    const img = bctx.createImageData(W, H);
    for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    bctx.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d');
    octx.imageSmoothingQuality = 'high';
    octx.drawImage(big, 0, 0, w, h);
    return out;
  }
}
