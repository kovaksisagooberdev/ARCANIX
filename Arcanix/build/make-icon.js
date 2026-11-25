'use strict';
// Draws the Arcanix icon: an angular sci-fi "A" (flat-cut apex, no crossbar, floating bar, slash through the right leg)
// in a violet→blue gradient on a dark rounded square. Writes build/icon.ico, build/arcanix-logo.png and build/arcanix-logo.svg.
// No dependencies: the 256×256 PNG is encoded by hand and wrapped in an ICO container (PNG-in-ICO).
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const S = 256, px = Buffer.alloc(S * S * 4);
const mix = (a, b, t) => Math.round(a + (b - a) * t);

// The letter, in a 256×256 box. The same shapes are written to the SVG below.
const BODY = [[116, 44], [140, 44], [210, 212], [176, 212], [128, 100], [80, 212], [46, 212]];
const BAR = [[112, 152], [144, 152], [150, 166], [106, 166]];
const SLIT = [[140, 128], [214, 108], [214, 115], [140, 135]];
const inPoly = (x, y, P) => {                                     // even-odd ray cast
  let inside = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const inLetter = (x, y) => (inPoly(x, y, BODY) && !inPoly(x, y, SLIT)) || inPoly(x, y, BAR);
const inRound = (x, y, r) => {                                   // rounded square covering the whole canvas
  const cx = Math.min(Math.max(x, r), S - r), cy = Math.min(Math.max(y, r), S - r);
  return Math.hypot(x - cx, y - cy) <= r;
};
const N = 4;                                                     // 4×4 supersampling for smooth edges
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  let a = 0, l = 0;
  for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
    const fx = x + (sx + 0.5) / N, fy = y + (sy + 0.5) / N;
    if (inRound(fx, fy, 56)) a++; if (inLetter(fx, fy)) l++;
  }
  const t = (x + y) / (2 * S), k = l / (N * N), i = (y * S + x) * 4;
  const glow = Math.max(0, 1 - Math.hypot(x - 128, y - 120) / 150) * 0.35;   // soft violet glow behind the letter
  const bg = [mix(0x1a, 0x0c, t) + glow * 60, mix(0x12, 0x0a, t) + glow * 30, mix(0x30, 0x18, t) + glow * 110];
  const fg = [mix(0xc3, 0x4f, t), mix(0x9b, 0x7d, t), 0xff];
  px[i] = Math.min(255, mix(bg[0], fg[0], k)); px[i + 1] = Math.min(255, mix(bg[1], fg[1], k)); px[i + 2] = Math.min(255, mix(bg[2], fg[2], k));
  px[i + 3] = Math.round(a / (N * N) * 255);
}
const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xFFFFFFFF; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = 6;   // 8-bit RGBA
const raw = Buffer.alloc(S * (S * 4 + 1)); for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
const head = Buffer.alloc(22); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);                             // ICONDIR: type 1, one image
head[6] = 0; head[7] = 0; head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(png.length, 14); head.writeUInt32LE(22, 18);   // 0 = 256 px
fs.writeFileSync(path.join(__dirname, 'icon.ico'), Buffer.concat([head, png]));
fs.writeFileSync(path.join(__dirname, 'arcanix-logo.png'), png);
const pts = (P) => P.map(p => p.join(',')).join(' ');
fs.writeFileSync(path.join(__dirname, 'arcanix-logo.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="36 36 184 184" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c39bff"/><stop offset="1" stop-color="#4f7dff"/></linearGradient>
    <mask id="m"><rect width="256" height="256" fill="#fff"/><polygon points="${pts(SLIT)}" fill="#000"/></mask>
  </defs>
  <g fill="url(#g)"><polygon mask="url(#m)" points="${pts(BODY)}"/><polygon points="${pts(BAR)}"/></g>
</svg>
`);
console.log('wrote build/icon.ico, arcanix-logo.png, arcanix-logo.svg', png.length + 22, 'bytes');
