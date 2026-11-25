'use strict';
/* Arcanix compositing extras (After Effects-style): 3D layers and extruded 3D text (WebGL), custom keyframe
   curves and the graph editor, blend modes, shape masks, extra effects and adjustment layers.
   Loaded BEFORE app.js: everything here is a declaration, and app.js globals (state, val, clamp, …) are only
   used when these functions run. Preview and Fast export both draw through the same code. */

// ───────────────────────── blend modes ─────────────────────────
const BLEND_MODES = [['normal', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'], ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'],
  ['color-dodge', 'Colour dodge'], ['color-burn', 'Colour burn'], ['hard-light', 'Hard light'], ['soft-light', 'Soft light'], ['difference', 'Difference'],
  ['exclusion', 'Exclusion'], ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Colour'], ['luminosity', 'Luminosity'], ['lighter', 'Add']];
const blendOp = (p) => (p && p.blend && p.blend !== 'normal' && BLEND_MODES.some(b => b[0] === p.blend) ? p.blend : 'source-over');
const MASK_SHAPES = [['none', 'None'], ['rect', 'Rectangle'], ['ellipse', 'Ellipse']];

// ───────────────────────── custom easing: cubic-bezier [x1, y1, x2, y2] like CSS / After Effects ─────────────────────────
const EASE_CURVES = { linear: [0, 0, 1, 1], in: [0.55, 0, 1, 0.45], out: [0, 0.55, 0.45, 1], inout: [0.65, 0, 0.35, 1], easy: [0.33, 0, 0.67, 1] };
const bezCache = new Map();
function bezierFn(e) {
  const key = e.join(','); let f = bezCache.get(key); if (f) return f;
  const [x1, y1, x2, y2] = e;
  const bx = (s) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const by = (s) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
  const dx = (s) => 3 * x1 * (1 - s) ** 2 + 6 * (x2 - x1) * s * (1 - s) + 3 * (1 - x2) * s * s;
  f = (u) => {
    if (u <= 0) return 0; if (u >= 1) return 1;
    let s = u;
    for (let i = 0; i < 6; i++) { const d = dx(s), v = bx(s) - u; if (Math.abs(v) < 1e-6) return by(s); if (Math.abs(d) < 1e-6) break; s = Math.min(1, Math.max(0, s - v / d)); }
    let lo = 0, hi = 1; s = u;                                    // Newton stalled: bisection
    for (let i = 0; i < 40; i++) { const v = bx(s); if (Math.abs(v - u) < 1e-7) break; if (v < u) lo = s; else hi = s; s = (lo + hi) / 2; }
    return by(s);
  };
  if (bezCache.size > 200) bezCache.clear();
  bezCache.set(key, f); return f;
}
const isCurve = (e) => Array.isArray(e) && e.length === 4 && e.every(Number.isFinite);
const easeFn = (e) => (isCurve(e) ? bezierFn(e) : EASE[e] || EASE.linear);

// ───────────────────────── WebGL: 3D layers and extruded text ─────────────────────────
// The clip is first drawn flat on its own frame-sized layer (2D position, Z rotation, scale, effects, masks).
// That layer is then a textured plane rotated in X/Y about the clip's centre and projected with perspective.
// Extrusion = extra copies of the plane behind it, tinted with the side colour, drawn far-to-near.
const GL3 = { gl: null, cv: null, failed: false, u: null, tex: null };
function gl3() {
  if (GL3.gl || GL3.failed) return GL3.gl;
  try {
    const cvs = document.createElement('canvas'), gl = cvs.getContext('webgl', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: true });
    if (!gl) throw new Error('no WebGL');
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, `attribute vec2 a; uniform vec2 S, A, O; uniform mat3 R; uniform float F, Z; varying vec2 uv;
      void main() { uv = a; vec3 p = R * vec3(a * S - A + O, Z); float w = (F + p.z) / F; vec2 c = A * w + p.xy;
        gl_Position = vec4(c.x / S.x * 2.0 - w, w - c.y / S.y * 2.0, 0.0, w); }`));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `precision mediump float; uniform sampler2D T; uniform vec4 C; uniform float K; varying vec2 uv;
      void main() { vec4 c = texture2D(T, uv); if (C.a > 0.5) c = vec4(C.rgb * c.a, c.a); gl_FragColor = c * K; }`));
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = {}; for (const n of ['S', 'A', 'O', 'R', 'F', 'Z', 'T', 'C', 'K']) u[n] = gl.getUniformLocation(pr, n);
    Object.assign(GL3, { gl, cv: cvs, u, tex });
  } catch (e) { console.warn('Arcanix: 3D layers unavailable (WebGL)', e); GL3.failed = true; GL3.err = String(e && e.message || e); }
  return GL3.gl;
}
const focalOf = (W, persp) => W * (0.5 + 4.5 * (1 - clamp(+persp || 0, 0, 100) / 100));
// src: the flat layer (frame-sized canvas). o: {ax, ay (frame px), rx, ry (deg), z (px, + = away), persp (0–100), slices: [{ox, oy, oz, tint, k}]}
// Returns the projected frame (a canvas), or null without WebGL.
function render3d(src, W, H, o) {
  const gl = gl3(); if (!gl) return render3dCanvas(src, W, H, o);
  const C = GL3.cv; if (C.width !== W || C.height !== H) { C.width = W; C.height = H; }
  gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindTexture(gl.TEXTURE_2D, GL3.tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  const rx = (+o.rx || 0) * Math.PI / 180, ry = (+o.ry || 0) * Math.PI / 180, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  const R = [cy, 0, -sy, sy * sx, cx, cy * sx, sy * cx, -sx, cy * cx];   // column-major Ry·Rx
  const u = GL3.u;
  gl.uniform2f(u.S, W, H); gl.uniform2f(u.A, o.ax, o.ay); gl.uniformMatrix3fv(u.R, false, R); gl.uniform1f(u.F, focalOf(W, o.persp)); gl.uniform1i(u.T, 0);
  const z0 = +o.z || 0, list = (o.slices && o.slices.length ? o.slices : [{ ox: 0, oy: 0, oz: 0 }])
    .map(s => ({ ...s, d: -sy * s.ox + cy * sx * s.oy + cy * cx * (s.oz + z0) }))   // depth after rotation: draw the farthest first
    .sort((a, b) => b.d - a.d);
  for (const s of list) {
    gl.uniform2f(u.O, s.ox, s.oy); gl.uniform1f(u.Z, s.oz + z0);
    if (s.tint) gl.uniform4f(u.C, s.tint[0], s.tint[1], s.tint[2], 1); else gl.uniform4f(u.C, 0, 0, 0, 0);
    gl.uniform1f(u.K, s.k ?? 1); gl.drawArrays(gl.TRIANGLES, 0, 6);
  }
  return C;
}
// Same projection without WebGL (no GPU): the plane is cut into a grid and each cell is drawn as two
// affine-mapped triangles. o.box = [x0, y0, x1, y1] limits the work to where the layer has content.
function render3dCanvas(src, W, H, o) {
  const out = scratchCv('r3d', W, H);
  const [bx0, by0, bx1, by1] = (o.box || [0, 0, W, H]).map(Math.round), bw = Math.max(1, bx1 - bx0), bh = Math.max(1, by1 - by0);
  const crop = scratchCv('r3dCrop', bw, bh); crop.drawImage(src, bx0, by0, bw, bh, 0, 0, bw, bh);
  const rx = (+o.rx || 0) * Math.PI / 180, ry = (+o.ry || 0) * Math.PI / 180, cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry);
  const F = focalOf(W, o.persp), z0 = +o.z || 0;
  const proj = (X, Y, Z) => { const px = cy * X + sy * sx * Y + sy * cx * Z, py = cx * Y - sx * Z, pz = -sy * X + cy * sx * Y + cy * cx * Z, w = (F + pz) / F; return w > 0.05 ? [o.ax + px / w, o.ay + py / w] : null; };
  const tri = (img, s0, s1, s2, d0, d1, d2) => {               // affine map of source triangle s → destination triangle d
    const [u0, v0] = s0, [u1, v1] = s1, [u2, v2] = s2, [x0, y0] = d0, [x1, y1] = d1, [x2, y2] = d2;
    const den = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0); if (Math.abs(den) < 1e-9) return;
    const a = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den, c = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den;
    const b = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den, d = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
    const e = x0 - a * u0 - c * v0, f = y0 - b * u0 - d * v0;
    const mx = (x0 + x1 + x2) / 3, my = (y0 + y1 + y2) / 3, grow = (p) => { const dx = p[0] - mx, dy = p[1] - my, l = Math.hypot(dx, dy) || 1; return [p[0] + dx / l * 0.6, p[1] + dy / l * 0.6]; };
    const [g0, g1, g2] = [d0, d1, d2].map(grow);                  // 0.6 px overlap hides seams between cells
    out.save(); out.beginPath(); out.moveTo(g0[0], g0[1]); out.lineTo(g1[0], g1[1]); out.lineTo(g2[0], g2[1]); out.closePath(); out.clip();
    out.setTransform(a, b, c, d, e, f); out.drawImage(img, 0, 0); out.restore();
  };
  const plane = (img, ox, oy, oz, n) => {
    const P = []; for (let j = 0; j <= n; j++) { const row = []; for (let i = 0; i <= n; i++) { const u = bw * i / n, v = bh * j / n; row.push([u, v, proj(bx0 + u - o.ax + ox, by0 + v - o.ay + oy, oz + z0)]); } P.push(row); }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const A = P[j][i], B = P[j][i + 1], C = P[j + 1][i + 1], D = P[j + 1][i]; if (!A[2] || !B[2] || !C[2] || !D[2]) continue;
      tri(img, A, B, C, A[2], B[2], C[2]); tri(img, A, C, D, A[2], C[2], D[2]);
    }
  };
  const list = (o.slices && o.slices.length ? o.slices : [{ ox: 0, oy: 0, oz: 0 }])
    .map(s => ({ ...s, d: -sy * s.ox + cy * sx * s.oy + cy * cx * (s.oz + z0) })).sort((a, b) => b.d - a.d);
  const sides = list.filter(s => s.tint), step = Math.max(1, Math.ceil(sides.length / 28));   // no GPU: at most ~28 side layers
  for (const s of list) {
    if (s.tint && sides.indexOf(s) % step) continue;
    let img = crop.canvas;
    if (s.tint) { const t = scratchCv('r3dTint', bw, bh); t.drawImage(crop.canvas, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = `rgb(${s.tint.map(v => Math.round(v * 255)).join(',')})`; t.fillRect(0, 0, bw, bh); img = t.canvas; }
    out.globalAlpha = s.k ?? 1; plane(img, s.ox, s.oy, s.oz, s.tint ? 3 : 12); out.globalAlpha = 1;
  }
  return out.canvas;
}
const hexRgb = (h) => { const v = parseInt(/^#[0-9a-f]{6}$/i.test(h || '') ? h.slice(1) : '808080', 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
// extrusion slices for a 3D text clip at clip scale s
function extrudeSlices(p, s) {
  const depth = clamp(+p.exDepth || 0, 0, 1000) * s, an = (+p.exAngle || 0) * Math.PI / 180, sl = clamp(+p.exSlant ?? 50, 0, 100) / 100;
  const ox = Math.cos(an) * depth * sl, oy = Math.sin(an) * depth * sl, oz = depth;
  const n = Math.round(clamp(Math.hypot(ox, oy, oz * 0.35), 2, 120)), col = hexRgb(p.exColor), shade = clamp(+p.exShade || 0, 0, 100) / 100;
  const out = [{ ox: 0, oy: 0, oz: 0 }];                          // the front face, untinted
  for (let i = n; i >= 1; i--) { const f = i / n, k = 1 - shade * f * 0.85; out.push({ ox: ox * f, oy: oy * f, oz: oz * f, tint: col.map(v => v * k) }); }
  return out;
}
// does c need the 3D pass at time t?
function needs3d(c, t) {
  const p = c.props;
  return !!(val(c, 'rotX', t) || val(c, 'rotY', t) || val(c, 'z', t) || (c.type === 'text' && p.ex3d && +p.exDepth > 0));
}

// ───────────────────────── extra effects ─────────────────────────
// [label, amount key, default amount] — merged into EFFECTS in app.js
const EFFECTS_MORE = [['Drop shadow', 'fxShadow', 60], ['Stroke', 'fxStrokeW', 8], ['RGB split', 'fxRgb', 40], ['Wave warp', 'fxWave', 40], ['Light leak', 'fxLeak', 60], ['Gradient overlay', 'fxGradOv', 50]];
const FX_MORE_EXTRA = ['shadowColor', 'shadowDist', 'shadowAngle', 'shadowBlur', 'fxStrokeColor', 'waveFreq', 'waveSpeed', 'gradOvA', 'gradOvB', 'gradOvAngle'];
const POST_FX = ['fxShadow', 'fxStrokeW'];                        // work on the finished (projected) layer and reach outside it
const fxMoreOn = (p) => !!(p.fxShadow > 0 || p.fxStrokeW > 0 || p.fxRgb > 0 || p.fxWave > 0 || p.fxLeak > 0 || p.fxGradOv > 0);
const scratch = {};
function scratchCv(name, W, H) {
  let c = scratch[name]; if (!c) c = scratch[name] = document.createElement('canvas');
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, W, H);
  return g;
}
// wave warp, RGB split, light leak, gradient overlay: inside applyFx, before the tint / vignette / grain overlays
function applyFxMore(g, W, H, p, t) {
  const k = W / 1920;
  if (p.fxWave > 0) {
    const A = p.fxWave / 100 * 60 * k, f = clamp(+p.waveFreq || 3, 0.5, 20), ph = t * 2 * Math.PI * (p.waveSpeed ?? 1);
    const tmp = scratchCv('wave', W, H); tmp.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H);
    const hs = Math.max(2, Math.round(H / 270));
    for (let y = 0; y < H; y += hs) g.drawImage(tmp.canvas, 0, y, W, hs, A * Math.sin(2 * Math.PI * f * y / H + ph), y, W, hs);
    g.restore();
  }
  if (p.fxRgb > 0) {
    const d = p.fxRgb / 100 * 24 * k, src = scratchCv('rgbSrc', W, H); src.drawImage(g.canvas, 0, 0);
    const ch = (name, col) => { const c = scratchCv(name, W, H); c.drawImage(src.canvas, 0, 0); c.globalCompositeOperation = 'multiply'; c.fillStyle = col; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'destination-in'; c.drawImage(src.canvas, 0, 0); return c.canvas; };
    const r = ch('rgbR', '#ff0000'), gg = ch('rgbG', '#00ff00'), b = ch('rgbB', '#0000ff');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, W, H); g.globalCompositeOperation = 'lighter';
    g.drawImage(r, -d, 0); g.drawImage(gg, 0, 0); g.drawImage(b, d, 0); g.restore();
  }
  if (p.fxLeak > 0) {                                             // warm light drifting across the picture, screened on
    const L = scratchCv('leak', W, H), s = t * 0.35, R = Math.hypot(W, H);
    for (const [cx, cy, col, r] of [[W * (0.15 + 0.3 * Math.sin(s)), H * (0.2 + 0.2 * Math.cos(s * 1.3)), '255,120,40', 0.7], [W * (0.85 - 0.25 * Math.cos(s * 0.8)), H * (0.75 + 0.15 * Math.sin(s * 1.1)), '255,60,120', 0.6]]) {
      const gr = L.createRadialGradient(cx, cy, 0, cx, cy, R * r * 0.6); gr.addColorStop(0, `rgba(${col},0.9)`); gr.addColorStop(1, `rgba(${col},0)`);
      L.fillStyle = gr; L.fillRect(0, 0, W, H);
    }
    L.globalCompositeOperation = 'destination-in'; L.drawImage(g.canvas, 0, 0);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'screen'; g.globalAlpha = p.fxLeak / 100; g.drawImage(L.canvas, 0, 0); g.restore();
  }
  if (p.fxGradOv > 0) {
    const an = (+p.gradOvAngle || 0) * Math.PI / 180, dx = Math.cos(an), dy = Math.sin(an), h = Math.abs(W / 2 * dx) + Math.abs(H / 2 * dy) || 1;
    const gr = g.createLinearGradient(W / 2 - dx * h, H / 2 - dy * h, W / 2 + dx * h, H / 2 + dy * h); gr.addColorStop(0, p.gradOvA || '#ff3d81'); gr.addColorStop(1, p.gradOvB || '#3d8bff');
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = p.fxGradOv / 100 * 0.85; g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
  }
}
// stroke + drop shadow around whatever the layer contains (after masks and 3D, in frame pixels)
function postFx(g, W, H, p) {
  const k = W / 1920;
  const silhouette = (name, col) => { const s = scratchCv(name, W, H); s.drawImage(g.canvas, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = col; s.fillRect(0, 0, W, H); return s.canvas; };
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  if (p.fxStrokeW > 0) {
    const w = clamp(+p.fxStrokeW, 0, 100) * k, sil = silhouette('stroke', p.fxStrokeColor || '#ffffff'), n = w > 6 ? 24 : 16;
    g.globalCompositeOperation = 'destination-over';
    for (const r of [w * 0.5, w]) for (let i = 0; i < n; i++) { const a = i / n * 2 * Math.PI; g.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r); }
  }
  if (p.fxShadow > 0) {
    const an = (+(p.shadowAngle ?? 135)) * Math.PI / 180, d = (+(p.shadowDist ?? 20)) * k, sil = silhouette('shadow', p.shadowColor || '#000000');
    g.globalCompositeOperation = 'destination-over'; g.globalAlpha = clamp(p.fxShadow / 100, 0, 1);
    g.filter = `blur(${Math.max(0, +(p.shadowBlur ?? 20) * k).toFixed(1)}px)`;
    g.drawImage(sil, Math.cos(an) * d, Math.sin(an) * d);
  }
  g.restore();
}

// ───────────────────────── shape masks ─────────────────────────
// rectangle / ellipse in the clip's own box (moves, scales and rotates with it); position and size are keyframeable
function shapeMask(g, W, H, poses, r, c, t, xf) {
  const p = c.props; if (!p.maskShape || p.maskShape === 'none') return;
  const bw = r[2] - r[0], bh = r[3] - r[1], mx = (r[0] + r[2]) / 2 + val(c, 'maskX', t) / 100 * bw / 2, my = (r[1] + r[3]) / 2 + val(c, 'maskY', t) / 100 * bh / 2;
  const w = Math.max(0, val(c, 'maskW', t)) / 100 * bw, h = Math.max(0, val(c, 'maskH', t)) / 100 * bh, fe = clamp(+p.maskFeather || 0, 0, 500);
  const m = scratchCv('mask', W, H); m.filter = fe > 0 ? `blur(${(fe / 2).toFixed(2)}px)` : 'none'; m.fillStyle = '#fff';
  for (const q of poses) {
    m.save(); xf(m, q); m.beginPath();
    if (p.maskShape === 'ellipse') m.ellipse(mx, my, w / 2, h / 2, 0, 0, Math.PI * 2);
    else m.roundRect(mx - w / 2, my - h / 2, w, h, Math.min(w, h) / 2 * clamp(+p.maskRound || 0, 0, 100) / 100);
    m.restore(); m.fill();
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.globalAlpha = 1;
  g.globalCompositeOperation = p.maskInvert ? 'destination-out' : 'destination-in'; g.drawImage(m.canvas, 0, 0); g.restore();
}

// ───────────────────────── adjustment layers ─────────────────────────
// an 'adjust' clip applies its colour, effects, mask and blend mode to everything already drawn below it
function drawAdjust(c, D) {
  const W = cv.width, H = cv.height, p = c.props, t = playhead, P = clipPose(c, t, W, H), a = clamp(P.a, 0, 1);
  if (a <= 0) return;
  const g = fxCtx(W, H);
  g.save(); g.filter = filterStr(p); g.drawImage(D.canvas, 0, 0); g.restore();
  applyFx(g, W, H, p, t);
  shapeMask(g, W, H, [P], [-W / 2, -H / 2, W / 2, H / 2], c, t, (k, q) => { k.translate(q.x, q.y); k.rotate(q.rot); k.scale(q.s, q.s); });
  D.save(); D.setTransform(1, 0, 0, 1, 0, 0); D.filter = 'none'; D.globalAlpha = a; D.globalCompositeOperation = blendOp(p); D.drawImage(g.canvas, 0, 0); D.restore();
}

// ───────────────────────── graph editor ─────────────────────────
const GRAPH_PROPS = { x: 'Position X', y: 'Position Y', scale: 'Scale %', rot: 'Rotation °', opacity: 'Opacity %', volume: 'Volume %',
  rotX: '3D rotate X', rotY: '3D rotate Y', z: '3D depth', maskX: 'Mask X', maskY: 'Mask Y', maskW: 'Mask width', maskH: 'Mask height' };
const GRAPH_PRESETS = [['linear', 'Linear'], ['easy', 'Easy ease'], ['in', 'Ease in'], ['out', 'Ease out'], ['inout', 'Ease in-out'], ['overshoot', 'Overshoot'], ['hold', 'Hold']];
function graphEditor(c, key) {
  if (!c || !hasKf(c)) { toast('Animate a property first: add keyframes with the ◆ buttons in the Inspector.', 3000); return; }
  const keys = Object.keys(c.kf).filter(k => kfOf(c, k));
  key = keys.includes(key) ? key : keys[0];
  let seg = 0;                                                    // selected segment: keys seg → seg+1
  openModal((box) => {
    box.classList.add('graphBox');
    box.innerHTML = `<h2>Graph editor</h2>
      <div class="frow"><label>Property</label><select id="geProp">${keys.map(k => `<option value="${k}">${GRAPH_PROPS[k] || k}</option>`).join('')}</select></div>
      <canvas id="geCv" width="760" height="340" tabindex="0" aria-label="Value graph: drag keyframes and curve handles"></canvas>
      <div class="geBar"><span id="geSeg" class="dim"></span><span class="spacer"></span><span id="gePresets"></span></div>
      <p class="info">Drag a <b>diamond</b> to change a keyframe's time and value. Click between two keyframes to pick that segment, then drag its two <b>round handles</b> to shape the speed curve, or choose a preset. Each drag is one undo step.</p>
      <div class="mbtns"><button id="geClose" class="primary">Done</button></div>`;
    const sel = $('#geProp', box), cvs = $('#geCv', box), g = cvs.getContext('2d'), segLbl = $('#geSeg', box), pre = $('#gePresets', box);
    sel.value = key; sel.onchange = () => { key = sel.value; seg = 0; draw(); };
    $('#geClose', box).onclick = closeModal;
    const dpr = window.devicePixelRatio || 1, CW = 760, CH = 340; cvs.width = CW * dpr; cvs.height = CH * dpr; cvs.style.width = '100%'; cvs.style.maxWidth = CW + 'px';
    const M = { l: 54, r: 16, t: 14, b: 26 };
    let view = null;                                              // {t0, t1, v0, v1}
    const K = () => kfOf(c, key) || [];
    const curveOf = (a) => isCurve(a.e) ? a.e : a.e === 'hold' ? null : EASE_CURVES[a.e || 'linear'] || EASE_CURVES.linear;
    const range = () => {
      const k = K(); let lo = Infinity, hi = -Infinity;
      for (let i = 0; i <= 200; i++) { const v = val(c, key, c.start + c.dur * i / 200); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (const q of k) { lo = Math.min(lo, q.v); hi = Math.max(hi, q.v); }
      const a = k[seg], b = k[seg + 1], e = a && b && curveOf(a);   // keep the selected segment's handles on screen
      if (e && Math.abs(b.v - a.v) > 1e-6) for (const y of [e[1], e[3]]) { const v = a.v + y * (b.v - a.v); lo = Math.min(lo, v); hi = Math.max(hi, v); }
      if (hi - lo < 1e-6) { lo -= 10; hi += 10; } const pad = (hi - lo) * 0.15;
      return { t0: 0, t1: Math.max(c.dur, 1e-3), v0: lo - pad, v1: hi + pad };
    };
    const X = (t) => M.l + (t - view.t0) / (view.t1 - view.t0) * (CW - M.l - M.r), Y = (v) => CH - M.b - (v - view.v0) / (view.v1 - view.v0) * (CH - M.t - M.b);
    const T = (x) => view.t0 + (x - M.l) / (CW - M.l - M.r) * (view.t1 - view.t0), V = (y) => view.v0 + (CH - M.b - y) / (CH - M.t - M.b) * (view.v1 - view.v0);
    const dvOf = (a, b) => Math.abs(b.v - a.v) > 1e-6 ? b.v - a.v : (view.v1 - view.v0) * 0.25;   // flat segment: handles still get room
    const handles = (i) => {
      const k = K(), a = k[i], b = k[i + 1]; if (!a || !b) return null; const e = curveOf(a); if (!e) return null;
      const dt = b.t - a.t, dv = dvOf(a, b), base = Math.abs(b.v - a.v) > 1e-6 ? a.v : a.v - dv * 0;
      return [[a.t + e[0] * dt, base + e[1] * dv], [a.t + e[2] * dt, base + e[3] * dv]];
    };
    function draw() {
      view = range(); const k = K(), css = getComputedStyle(document.documentElement), acc = css.getPropertyValue('--accent').trim() || '#a77bff';
      g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
      g.fillStyle = css.getPropertyValue('--deep').trim() || '#0b0912'; g.fillRect(0, 0, CW, CH);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.fillStyle = 'rgba(255,255,255,.45)'; g.font = '11px "Segoe UI", sans-serif';
      for (let i = 0; i <= 4; i++) { const v = view.v0 + (view.v1 - view.v0) * i / 4, y = Y(v); g.beginPath(); g.moveTo(M.l, y); g.lineTo(CW - M.r, y); g.stroke(); g.textAlign = 'right'; g.fillText(+v.toFixed(1), M.l - 6, y + 4); }
      for (let i = 0; i <= 6; i++) { const t = view.t0 + (view.t1 - view.t0) * i / 6, x = X(t); g.beginPath(); g.moveTo(x, M.t); g.lineTo(x, CH - M.b); g.stroke(); g.textAlign = 'center'; g.fillText(t.toFixed(2) + 's', x, CH - 8); }
      const ph = playhead - c.start; if (ph >= 0 && ph <= c.dur) { g.strokeStyle = 'rgba(244,173,69,.8)'; g.beginPath(); g.moveTo(X(ph), M.t); g.lineTo(X(ph), CH - M.b); g.stroke(); }
      if (k[seg] && k[seg + 1]) { g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(X(k[seg].t), M.t, X(k[seg + 1].t) - X(k[seg].t), CH - M.t - M.b); }
      g.strokeStyle = acc; g.lineWidth = 2; g.beginPath();
      for (let i = 0; i <= 400; i++) { const t = c.dur * i / 400, v = val(c, key, c.start + t); if (i) g.lineTo(X(t), Y(v)); else g.moveTo(X(t), Y(v)); }
      g.stroke();
      const hs = handles(seg);
      if (hs) {
        const a = k[seg], b = k[seg + 1]; g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1;
        for (const [[ht, hv], [qt, qv]] of [[hs[0], [a.t, a.v]], [hs[1], [b.t, b.v]]]) { g.beginPath(); g.moveTo(X(qt), Y(qv)); g.lineTo(X(ht), Y(hv)); g.stroke(); }
        g.fillStyle = '#fff'; for (const [ht, hv] of hs) { g.beginPath(); g.arc(X(ht), Y(hv), 5, 0, Math.PI * 2); g.fill(); }
      }
      for (const q of k) { const x = X(q.t), y = Y(q.v); g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillStyle = acc; g.fillRect(-5, -5, 10, 10); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(-5, -5, 10, 10); g.restore(); }
      const a = k[seg], b = k[seg + 1];
      segLbl.textContent = a && b ? `Segment ${seg + 1} of ${k.length - 1}: ${a.t.toFixed(2)}s → ${b.t.toFixed(2)}s · ${isCurve(a.e) ? 'custom curve [' + a.e.map(v => +v.toFixed(2)).join(', ') + ']' : (GRAPH_PRESETS.find(p => p[0] === (a.e || 'linear')) || [0, 'Linear'])[1]}` : 'Add a second keyframe to shape the curve between them.';
      pre.innerHTML = '';
      if (a && b) for (const [id, lbl] of GRAPH_PRESETS) {
        const bt = document.createElement('button'); bt.textContent = lbl; bt.className = 'chip';
        bt.onclick = () => { if (!unlockedC(c)) return; if (id === 'linear') delete a.e; else a.e = id === 'overshoot' ? [0.3, 0, 0.3, 1.35] : id === 'easy' ? EASE_CURVES.easy.slice() : id; commit(); draw(); };
        pre.append(bt);
      }
    }
    const pos = (ev) => { const r = cvs.getBoundingClientRect(); return [(ev.clientX - r.left) * CW / r.width, (ev.clientY - r.top) * CH / r.height]; };
    cvs.onpointerdown = (ev) => {
      if (!unlockedC(c)) { toast('Track is locked.', 2000); return; }
      const [x, y] = pos(ev), k = K(); let drag = null;
      const hs = handles(seg);
      if (hs) hs.forEach(([ht, hv], i) => { if (!drag && Math.hypot(X(ht) - x, Y(hv) - y) < 9) drag = { h: i }; });
      if (!drag) k.forEach((q, i) => { if (!drag && Math.hypot(X(q.t) - x, Y(q.v) - y) < 9) drag = { key: i }; });
      if (!drag) { const t = T(x); const i = k.findIndex((q, j) => k[j + 1] && t >= q.t && t <= k[j + 1].t); if (i >= 0) { seg = i; draw(); } return; }
      ev.preventDefault(); cvs.setPointerCapture(ev.pointerId); let moved = false;
      cvs.onpointermove = (e) => {
        const [mx, my] = pos(e), kk = K(); moved = true;
        if (drag.key !== undefined) {
          const q = kk[drag.key], lo = drag.key > 0 ? kk[drag.key - 1].t + kfEps() * 2 : 0, hi = drag.key < kk.length - 1 ? kk[drag.key + 1].t - kfEps() * 2 : c.dur;
          q.t = +clamp(T(mx), lo, Math.max(lo, hi)).toFixed(4); q.v = +V(my).toFixed(2);
        } else {
          const a = kk[seg], b = kk[seg + 1], e = (curveOf(a) || EASE_CURVES.linear).slice(), dt = b.t - a.t, dv = dvOf(a, b);
          const ux = clamp((T(mx) - a.t) / dt, 0, 1), uy = clamp((V(my) - a.v) / dv, -1, 2);
          if (drag.h === 0) { e[0] = +ux.toFixed(3); e[1] = +uy.toFixed(3); } else { e[2] = +ux.toFixed(3); e[3] = +uy.toFixed(3); }
          a.e = e;
        }
        requestRender(); draw();
      };
      cvs.onpointerup = () => { cvs.onpointermove = cvs.onpointerup = null; if (moved) { commit(); renderInspector(true); } draw(); };
    };
    draw();
  });
}
