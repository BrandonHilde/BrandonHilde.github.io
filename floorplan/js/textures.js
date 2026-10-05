'use strict';
// Procedural, tileable material textures (generated once at startup).
const TEX_SIZE = 256;

const TexGen = (() => {
  function hash2(x, y, seed) {
    let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519 | 0)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h & 0xffffff) / 0xffffff;
  }
  const hash1 = (x, s) => hash2(x, x * 7 + 13, s);
  const wrapi = (v, p) => ((v % p) + p) % p;
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (x) => x - Math.floor(x);
  function vnoise(x, y, px, py, seed) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const x0 = wrapi(xi, px), x1 = wrapi(xi + 1, px), y0 = wrapi(yi, py), y1 = wrapi(yi + 1, py);
    return lerp(lerp(hash2(x0, y0, seed), hash2(x1, y0, seed), ux), lerp(hash2(x0, y1, seed), hash2(x1, y1, seed), ux), uy);
  }
  function fbmA(u, v, fu, fv, oct, seed) {
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < oct; o++) {
      const m = 1 << o;
      sum += amp * vnoise(u * fu * m, v * fv * m, fu * m, fv * m, seed + o * 31);
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  }
  const fbm = (u, v, f, oct, seed) => fbmA(u, v, f, f, oct, seed);
  const sh = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // stone cell sites
  const stoneSites = [];
  for (let i = 0; i < 22; i++) stoneSites.push([hash1(i, 11), hash1(i, 23)]);

  function pixel(m, u, v) {
    const N = TEX_SIZE;
    switch (m) {
      case M.Paint: case M.Plain: case M.Glass: {
        const n = fbm(u, v, 32, 3, 1);
        return sh([250, 250, 250], m === M.Paint ? 0.97 + n * 0.05 : 0.99 + n * 0.01);
      }
      case M.Brick: {
        const row = Math.floor(v * 18), bx = u * 6 + (row % 2) * 0.5;
        const fx = fract(bx), fy = fract(v * 18), id = wrapi(Math.floor(bx), 6);
        const n = fbm(u, v, 64, 3, 7);
        if (fx < 0.035 || fy < 0.12) return sh([188, 182, 172], 0.9 + n * 0.2);
        const hv = hash2(id, row, 3);
        const edge = Math.min(fx - 0.035, 1 - fx, (fy - 0.12) * 3, (1 - fy) * 3);
        return sh([150 + hv * 40, 62 + hv * 18, 44 + hv * 10], 0.82 + n * 0.3 + clamp(edge * 4, 0, 0.08));
      }
      case M.Stone: {
        let b1 = 10, b2 = 10, bid = 0;
        for (let i = 0; i < stoneSites.length; i++) {
          let dx = Math.abs(u - stoneSites[i][0]); dx = Math.min(dx, 1 - dx);
          let dy = Math.abs(v - stoneSites[i][1]); dy = Math.min(dy, 1 - dy) * 1.4;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < b1) { b2 = b1; b1 = d; bid = i; } else if (d < b2) b2 = d;
        }
        const n = fbm(u, v, 32, 4, 5);
        if (b2 - b1 < 0.012) return sh([120, 116, 108], 0.85 + n * 0.2);
        const h = hash1(bid, 41);
        return sh([150 + h * 60, 140 + h * 50, 120 + h * 40], 0.75 + n * 0.45 + clamp((b2 - b1) * 2, 0, 0.1));
      }
      case M.Lap_Siding: {
        const fy = fract(v * 8), n = fbmA(u, v, 4, 64, 3, 9);
        let k = 0.86 + fy * 0.12 + n * 0.05;
        if (fy > 0.93) k = 0.62;
        return sh([250, 250, 250], k);
      }
      case M.Board_Batten: {
        const fx = fract(u * 4), n = fbmA(u, v, 64, 4, 3, 13);
        let k = 0.92 + n * 0.05;
        if (fx < 0.07) k = 1.0 + n * 0.02; else if (fx < 0.09) k = 0.7;
        return sh([248, 248, 248], k);
      }
      case M.Stucco: return sh([250, 250, 250], 0.82 + fbm(u, v, 16, 6, 17) * 0.16 + fbm(u, v, 128, 2, 19) * 0.06);
      case M.Cmu: {
        const row = Math.floor(v * 6), bx = u * 3 + (row % 2) * 0.5;
        const fx = fract(bx), fy = fract(v * 6), n = fbm(u, v, 64, 4, 21);
        if (fx < 0.02 || fy < 0.045) return sh([150, 148, 142], 0.85 + n * 0.2);
        return sh([178, 176, 170], 0.82 + hash2(wrapi(Math.floor(bx), 3), row, 5) * 0.1 + n * 0.2);
      }
      case M.Wood_Panel: {
        const px = Math.floor(u * 8), fx = fract(u * 8), h = hash1(px, 29);
        const g = fbmA(fract(u + h), v, 64, 4, 4, 31), ring = fract(g * 6 + h * 3);
        return sh([150 + h * 30, 100 + h * 20, 62 + h * 10], fx < 0.02 ? 0.5 : 0.82 + ring * 0.16);
      }
      case M.Subway_Tile: {
        const row = Math.floor(v * 8), bx = u * 4 + (row % 2) * 0.5;
        const fx = fract(bx), fy = fract(v * 8);
        if (fx < 0.02 || fy < 0.045) return [200, 200, 198];
        return sh([252, 252, 252], 0.94 + clamp(Math.min(fx, 1 - fx, fy * 0.5, (1 - fy) * 0.5) * 2, 0, 0.06));
      }
      case M.Shingle: {
        const row = Math.floor(v * 10), fy = fract(v * 10);
        const cnt = 6 + Math.floor(hash1(row, 37) * 4);
        const bx = (u + hash1(row, 43)) * cnt, id = wrapi(Math.floor(bx), cnt), fx = fract(bx);
        const h = hash2(id, row, 47), n = fbmA(u, v, 32, 8, 3, 53);
        let k = 0.75 + fy * 0.25 + n * 0.1;
        if (fx < 0.04) k *= 0.6;
        if (fy < 0.06) k *= 0.55;
        return sh([150 + h * 40, 120 + h * 30, 90 + h * 25], k);
      }
      case M.Hardwood: case M.Vinyl_Plank: {
        const planks = m === M.Hardwood ? 10 : 7;
        const row = Math.floor(v * planks), fy = fract(v * planks);
        const seg = (u + hash1(row, 59)) * 2, fx = fract(seg);
        const h = hash2(wrapi(Math.floor(seg), 2), row, 61);
        const g = fbmA(fract(u + h), v, 4, 64, 4, 67), ring = fract(g * 5 + h * 2);
        const base = m === M.Hardwood ? [176 + h * 30, 122 + h * 22, 74 + h * 14] : [196 + h * 20, 180 + h * 18, 156 + h * 14];
        return sh(base, (fy < 0.03 || fx < 0.006) ? 0.55 : 0.8 + ring * 0.18);
      }
      case M.Floor_Tile: {
        const fx = fract(u * 4), fy = fract(v * 4);
        if (fx < 0.015 || fy < 0.015) return [170, 165, 158];
        return sh([222, 214, 198], 0.9 + hash2(Math.floor(u * 4), Math.floor(v * 4), 73) * 0.06 + fbm(u, v, 32, 4, 71) * 0.08);
      }
      case M.Carpet: return sh([200, 192, 180], 0.82 + fbm(u, v, 64, 3, 79) * 0.12 + hash2(u * N, v * N, 83) * 0.08);
      case M.Concrete: {
        let k = 0.78 + fbm(u, v, 8, 6, 89) * 0.22;
        if (hash2(u * N, v * N, 97) > 0.985) k -= 0.12;
        return sh([196, 194, 188], k);
      }
      case M.Granite: {
        let k = 0.35 + fbm(u, v, 32, 4, 151) * 0.25;
        if (hash2(u * N, v * N, 157) > 0.9) k += 0.35;
        return sh([120, 112, 105], k);
      }
      case M.Marble: {
        const n = fbm(u, v, 4, 6, 101);
        const vein = Math.abs(Math.sin((u * 2 + v + n * 3) * Math.PI * 2));
        let k = 0.93 + n * 0.05;
        if (vein < 0.08) k -= (0.08 - vein) * 3;
        return sh([246, 244, 240], k);
      }
      case M.Grass: {
        const n = fbm(u, v, 8, 6, 107), n2 = hash2(u * N, v * N, 109), k = 0.93 + fbm(u, v, 2, 3, 113) * 0.1;
        return [(62 + n * 34 + n2 * 14) * k, (98 + n * 38 + n2 * 18) * k, (44 + n * 16) * k];
      }
      case M.Garage: {
        const fy = fract(v * 4), fx = fract(u * 4);
        let k = 0.95;
        if (fy < 0.03) k = 0.6;
        else if (fy > 0.2 && fy < 0.8 && fx > 0.1 && fx < 0.9) {
          k = 0.98;
          if (fy < 0.23 || fx < 0.13) k = 0.84;
          if (fy > 0.77 || fx > 0.87) k = 1.0;
        }
        return sh([250, 250, 250], k);
      }
    }
    return [255, 0, 255];
  }

  // Returns an array of canvases (one per material).
  function generateAll() {
    const out = [];
    for (let m = 0; m < MATERIALS.length; m++) {
      const c = document.createElement('canvas');
      c.width = c.height = TEX_SIZE;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(TEX_SIZE, TEX_SIZE);
      const d = img.data;
      for (let y = 0; y < TEX_SIZE; y++) for (let x = 0; x < TEX_SIZE; x++) {
        // row y is texture v; flip so the canvas preview matches the 3D orientation
        const col = pixel(m, (x + 0.5) / TEX_SIZE, (TEX_SIZE - 1 - y + 0.5) / TEX_SIZE);
        const i = (y * TEX_SIZE + x) * 4;
        d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255); d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      out.push(c);
    }
    return out;
  }
  return { generateAll };
})();
