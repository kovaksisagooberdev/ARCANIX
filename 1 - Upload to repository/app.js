'use strict';
/* Arcanix — video editor (formerly "Cutroom"; a few internal names such as the storage database keep the old word
   so existing saved projects keep loading).
   Units: timeline times are seconds; positions (x, y) are sequence pixels
   relative to frame centre; scale/opacity/volume are percent. */

// ───────────────────────── helpers ─────────────────────────
const $ = (s, r = document) => r.querySelector(s);
const div = (cls) => { const d = document.createElement('div'); if (cls) d.className = cls; return d; };
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const once = (el, ev, timeout = 5000) => new Promise(res => {
  const done = () => { el.removeEventListener(ev, done); clearTimeout(tm); res(); };
  const tm = setTimeout(done, timeout);
  el.addEventListener(ev, done);
});
function toast(msg, ms = 4000) {
  const t = div('toast'); t.textContent = msg; $('#toasts').append(t);
  setTimeout(() => t.remove(), ms);
}

// 16×16 stroke icons (own drawings)
const ICONS = {
  play: '<path d="M5 3.5v9l8-4.5z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M4.5 3.5h2.5v9H4.5zM9 3.5h2.5v9H9z" fill="currentColor" stroke="none"/>',
  start: '<path d="M4 3.5v9"/><path d="M12.5 3.5v9L6 8z" fill="currentColor" stroke="none"/>',
  end: '<path d="M12 3.5v9"/><path d="M3.5 3.5v9L10 8z" fill="currentColor" stroke="none"/>',
  prev: '<path d="M10.5 4L6 8l4.5 4"/>', next: '<path d="M5.5 4L10 8l-4.5 4"/>',
  select: '<path d="M3.5 2.5l8.5 4.6-3.6 1.1-1.4 3.6z" fill="currentColor" stroke="none"/>',
  razor: '<circle cx="4.5" cy="4.5" r="1.8"/><circle cx="4.5" cy="11.5" r="1.8"/><path d="M6 5.5l7.5 6M6 10.5l7.5-6"/>',
  split: '<path d="M8 2v12" stroke-dasharray="2 2"/><path d="M2 5.5h3.5v5H2zM10.5 5.5H14v5h-3.5z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>',
  ripple: '<path d="M2 4.5h5M2 11.5h5M9 8h5M11.5 5.5L9 8l2.5 2.5"/>',
  dup: '<rect x="5.5" y="5.5" width="8" height="8" rx="1.2"/><path d="M10.5 5.5V3.7a1.2 1.2 0 0 0-1.2-1.2H3.7a1.2 1.2 0 0 0-1.2 1.2v5.6a1.2 1.2 0 0 0 1.2 1.2h1.8"/>',
  magnet: '<path d="M3.5 3v5a4.5 4.5 0 0 0 9 0V3h-3v5a1.5 1.5 0 0 1-3 0V3z"/>',
  plus: '<path d="M8 3v10M3 8h10"/>', x: '<path d="M4 4l8 8M12 4l-8 8"/>',
  undo: '<path d="M5.5 3L2.5 6l3 3"/><path d="M2.5 6h7a4 4 0 0 1 0 8H7"/>',
  redo: '<path d="M10.5 3l3 3-3 3"/><path d="M13.5 6h-7a4 4 0 0 0 0 8H9"/>',
  import: '<path d="M8 2.5v8M4.5 7.5L8 11l3.5-3.5M2.5 13.5h11"/>',
  export: '<path d="M8 10.5v-8M4.5 5.5L8 2l3.5 3.5M2.5 13.5h11"/>',
  text: '<path d="M3.5 4V3h9v1M8 3v10M6 13h4"/>',
  solid: '<rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" stroke="none"/>',
  file: '<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3"/>',
  keys: '<rect x="1.5" y="4" width="13" height="8" rx="1.5"/><path d="M4 6.5h.01M6.5 6.5h.01M9 6.5h.01M11.5 6.5h.01M4.5 9.5h7"/>',
  camera: '<rect x="2" y="4.5" width="12" height="8.5" rx="1.5"/><circle cx="8" cy="8.7" r="2.3"/><path d="M6 4.5l1-1.5h2l1 1.5"/>',
  fit: '<path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"/>',
  guides: '<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M8 3v10M2 8h12"/>',
  eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  link: '<path d="M7 9.5a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5L8.8 4.2"/><path d="M9 6.5a2.5 2.5 0 0 0-3.5 0L3 9a2.5 2.5 0 0 0 3.5 3.5l.7-.7"/>',
  mute: '<path d="M2.5 6.2h2.3L8 3.5v9L4.8 9.8H2.5z"/><path d="M10.5 6a3 3 0 0 1 0 4M12.3 4.2a5.5 5.5 0 0 1 0 7.6"/>',
  film: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 3v10M11 3v10M2 6.5h3M2 9.5h3M11 6.5h3M11 9.5h3"/>',
  smile: '<circle cx="8" cy="8" r="6"/><path d="M5.5 9.5a3 3 0 0 0 5 0M6 6.5h.01M10 6.5h.01"/>',
  spark: '<path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4z"/>',
  drop: '<circle cx="6" cy="6.5" r="3.5"/><circle cx="10" cy="6.5" r="3.5"/><circle cx="8" cy="10" r="3.5"/>',
  swap: '<path d="M2 5.5h10M9.5 3L12 5.5 9.5 8M14 10.5H4M6.5 8L4 10.5 6.5 13"/>',
  motion: '<circle cx="11" cy="8" r="3"/><path d="M2 5h4M1.5 8h4M2 11h4"/>',
  panelL: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M6 3v10"/>',
  note: '<path d="M6 12V3.5l7-1.5v8.5"/><circle cx="4.3" cy="12" r="1.8"/><circle cx="11.3" cy="10.5" r="1.8"/>',
  mic: '<rect x="6" y="2" width="4" height="8" rx="2"/><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14"/>',
  freeze: '<path d="M8 2v12M2.8 5l10.4 6M2.8 11l10.4-6M6.5 2.8L8 4l1.5-1.2M6.5 13.2L8 12l1.5 1.2"/>',
  gaps: '<path d="M2.5 3v10M13.5 3v10M5 8h6M7 6L5 8l2 2M9 6l2 2-2 2"/>',
  panelR: '<rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M10 3v10"/>',
  gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4"/>',
};
const icon = (n) => `<svg class="ic" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[n] || ''}</svg>`;

// ───────────────────────── state ─────────────────────────
const HEAD = 132;          // track header width, must match --head in CSS
const MIN_DUR = 0.05;
const PEAK_RATE = 50;      // waveform peaks per second
const BASE_PROPS = {
  x: 0, y: 0, scale: 100, rot: 0, opacity: 100, flipH: false, flipV: false,
  cropL: 0, cropR: 0, cropT: 0, cropB: 0,
  fitMode: 'fit',                                               // what scale 100 % means for video/images: 'fit' inside, 'fill' the frame, 'stretch' to it
  radius: 0, feather: 0,                                        // rounded corners (% of the short side, 0–50) and soft edge (px) of the clip's box
  transDir: 'right',                                            // the way wipe / slide / push / whip travel: right, left, down, up
  brightness: 100, contrast: 100, saturate: 100, hue: 0, blur: 0, gray: 0, sepia: 0,
  temp: 0, tint: 0, vibrance: 0, lift: 0, gamma: 0, gain: 0, split: 0,   // colour grade, −100…100 (split 0…100); all 0 = no pixel pass
  satRed: 0, satOrange: 0, satYellow: 0, satGreen: 0, satAqua: 0, satBlue: 0, satPurple: 0, satMagenta: 0,   // per-colour saturation −100…100 (HSL_COLORS)
  volume: 100, fadeIn: 0, fadeOut: 0,
  fadeCurve: 'linear',                                          // sound fade shape: 'linear' | 'equal-power' | 'smooth' (see FADE_CURVES)
  hpf: 0, clean: false,                                         // high-pass Hz (0 = off) and gentle speech compressor: preview and export
  keepPitch: true,                                              // speed-changed sound keeps its pitch (preview: preservesPitch; export: time-stretch)
  isVoice: false, duck: false,                                  // voice clips make "duck" clips (music) drop in level while they play
  audioDetached: false,                                         // video clip whose sound now lives on its own audio clip (kept at volume 0)
  fxVignette: 0, fxTint: 0, fxTintColor: '#ff8a3d', fxGrain: 0, fxGlow: 0, fxPixel: 0, fxShake: 0,   // effect amounts, 0–100
  fxKey: 0, fxKeyColor: '#00b140', fxKeySoft: 20, fxKeySpill: 50,  // chroma key: amount, colour to remove, edge softness, spill removal
  anim: 'none',                                                 // motion preset id, see ANIMS
  mbOn: false, mbShutter: 180, mbSamples: 8,                    // motion blur: shutter angle in degrees (0–360), samples per frame (4/8/16/32)
  rotX: 0, rotY: 0, z: 0, persp: 50,                            // 3D layer: tilt (X) and turn (Y) in degrees, depth px (+ = away), perspective strength 0–100
  blend: 'normal',                                              // blend mode, see BLEND_MODES (layers.js)
  maskShape: 'none', maskX: 0, maskY: 0, maskW: 60, maskH: 60, maskRound: 0, maskFeather: 0, maskInvert: false,   // shape mask in the clip's box (%)
  fxShadow: 0, shadowColor: '#000000', shadowDist: 20, shadowAngle: 135, shadowBlur: 20,   // drop shadow: amount 0–100, offset px at angle °, blur px
  fxStrokeW: 0, fxStrokeColor: '#ffffff',                        // outline around the whole layer, px
  fxRgb: 0, fxWave: 0, waveFreq: 3, waveSpeed: 1, fxLeak: 0,     // RGB split, wave warp (waves per height, cycles/s), light leak
  fxGradOv: 0, gradOvA: '#ff3d81', gradOvB: '#3d8bff', gradOvAngle: 45,   // gradient overlay
};
const TEXT_PROPS = {
  text: 'Your title', font: 'Segoe UI', size: 110, color: '#ffffff', bold: true, italic: false,
  align: 'center', stroke: '#000000', strokeW: 0, bgOn: false, bg: '#000000', shadow: true,
  letterSpacing: 0, lineHeight: 1.2, boxWidth: 0,              // spacing px, line height × size, wrap width in sequence px (0 = no wrap)
  gradOn: false, color2: '#ff4f8b', gradAngle: 90,              // gradient fill from color to color2; 0° = left → right, 90° = top → bottom
  bgRadius: 0, bgPad: 30,                                       // background box: corner radius px, padding % of the size
  weight: 0, caps: false,                                       // font weight 100–900 (0 = from Bold), ALL CAPS
  ex3d: false, exDepth: 40, exAngle: 45, exSlant: 50, exColor: '#3b2a7a', exShade: 50,   // 3D extrusion: depth px, direction °, slant %, side colour, back shading %
};
const FONTS = ['Segoe UI', 'Segoe UI Black', 'Bahnschrift', 'Arial', 'Arial Black', 'Impact', 'Franklin Gothic Medium', 'Gill Sans MT', 'Calibri', 'Candara', 'Corbel',
  'Georgia', 'Times New Roman', 'Cambria', 'Palatino Linotype', 'Book Antiqua', 'Rockwell', 'Courier New', 'Consolas', 'Lucida Console', 'Verdana', 'Tahoma',
  'Trebuchet MS', 'Century Gothic', 'Ink Free', 'Segoe Print', 'Segoe Script', 'Gabriola', 'Comic Sans MS',
  'DejaVu Sans', 'Liberation Sans', 'Noto Sans', 'Ubuntu', 'Cantarell', 'Liberation Serif', 'DejaVu Sans Mono'];   // common on Linux

function defaultTracks() {
  return [
    { id: 'v3', name: 'V3', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'v2', name: 'V2', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'v1', name: 'V1', kind: 'video', muted: false, hidden: false, locked: false },
    { id: 'a1', name: 'A1', kind: 'audio', muted: false, hidden: false, locked: false },
    { id: 'a2', name: 'A2', kind: 'audio', muted: false, hidden: false, locked: false },
  ];
}
const state = { settings: { w: 1920, h: 1080, fps: 30, name: 'Untitled project' }, tracks: defaultTracks(), clips: [], markers: [], inPt: null, outPt: null };   // markers: sorted times in seconds; inPt/outPt: sequence in/out (I / O), null = unset
// Selection: `sel` is the primary clip (shown in the Inspector); `selSet` holds every selected clip id.
let selSet = new Set();
const selClips = () => state.clips.filter(c => selSet.has(c.id));
function syncSel() {                                             // keep selSet consistent after `sel` or the clip list changed
  for (const id of [...selSet]) if (!state.clips.some(c => c.id === id)) selSet.delete(id);
  if (sel == null || !state.clips.some(c => c.id === sel)) { sel = null; selSet.clear(); }
  else if (!selSet.has(sel)) selSet = new Set([sel]);
}
const media = new Map();   // id -> {id,name,kind,dur,w,h,thumb,blob,url,img,peaks}
const els = new Map();     // clip id -> {el, gain, target}
const bounds = new Map();  // clip id -> rendered pose {cx, cy, rot, s, r: visible box in clip space, W, H} (see drawClip)

let sel = null, playhead = 0, playing = false, tool = 'select', snapOn = true, pps = 80;
let playT0 = 0, playW0 = 0, needRender = true, exporting = null, cleanFrame = false;
let actx = null, master = null, clipboard = null, dragMedia = null;
let guidesOn = false, analyser = null, meterBuf = null, meterLvl = 0, meterShown = -1;
const collapsed = new Set();   // inspector section titles the user folded
let inspTab = 'basic', secTab = 'basic';
// Simple mode (the default) hides keyframes, crop, colour sliders, track tools and the razor
let simpleMode = true;
try { if (JSON.parse(localStorage.getItem('cutroom.layout') || '{}').simple === false) simpleMode = false; } catch {}
document.body.classList.toggle('simple', simpleMode);   // inspector tab on show; tab that sections being built belong to
let offline = null;       // set by fastexport.js while an offline render runs: {frames: Map clipId -> {img, w, h}}

const cv = $('#cv'), ctx = cv.getContext('2d');
const tl = $('#tl'), tlInner = $('#tlInner'), rows = $('#rows'), ruler = $('#ruler'), insp = $('#insp');

const clipById = (id) => state.clips.find(c => c.id === id) || null;
const trackById = (id) => state.tracks.find(t => t.id === id) || null;
const hasSource = (c) => c.type === 'video' || c.type === 'audio';
const kindFor = (c) => c.type === 'audio' ? 'audio' : 'video';
const projectEnd = () => state.clips.reduce((m, c) => Math.max(m, c.start + c.dur), 0);
const frameRound = (t) => Math.round(t * state.settings.fps) / state.settings.fps;
function tc(t) {
  const fps = state.settings.fps, f = Math.round(Math.max(0, t) * fps);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(f / fps / 3600))}:${p(Math.floor(f / fps / 60) % 60)}:${p(Math.floor(f / fps) % 60)}:${p(f % fps)}`;
}

// ───────────────────────── persistence (IndexedDB) ─────────────────────────
const DB = {
  db: null,
  open() {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('cutroom', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('media', { keyPath: 'id' }); r.result.createObjectStore('kv'); };
        r.onsuccess = () => { DB.db = r.result; res(true); };
        r.onerror = () => res(false);
      } catch { res(false); }
    });
  },
  run(store, mode, fn) {
    return new Promise((res, rej) => {
      if (!DB.db) return res(undefined);
      const t = DB.db.transaction(store, mode); const rq = fn(t.objectStore(store));
      t.oncomplete = () => res(rq && rq.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
};
const mediaRec = (m) => ({ id: m.id, name: m.name, kind: m.kind, dur: m.dur, w: m.w, h: m.h, thumb: m.thumb, blob: m.blob, peaks: m.peaks || null, added: m.added || 0, mtime: m.mtime ?? null });
const putMedia = (m) => DB.run('media', 'readwrite', s => s.put(mediaRec(m)));
// media files that are in memory but not in IndexedDB: the warning stays in #saveState until a new project / project file replaces them
let mediaUnsaved = 0;
function mediaSaveFailed(n) {
  if (!n) return; mediaUnsaved += n; showSaveState();
  toast(`${n} media file${n > 1 ? 's' : ''} could not be autosaved (storage full) — keep the project file.`, 9000);
}
function showSaveState(txt) {
  const el = $('#saveState'); el.classList.toggle('warn', mediaUnsaved > 0);
  el.title = mediaUnsaved ? 'Some media is not stored in this browser. Save a project file (Ctrl+S) so it is not lost when the app closes.' : '';
  el.textContent = mediaUnsaved ? `⚠ ${mediaUnsaved} media not autosaved` : txt !== undefined ? txt : el.textContent;
}
let saveTimer = 0;
function scheduleSave() {
  showSaveState(DB.db ? 'Saving…' : 'Autosave unavailable');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await DB.run('kv', 'readwrite', s => s.put(lastSnap, 'project')); if (DB.db) showSaveState('Saved'); }
    catch (e) { showSaveState('Save failed: ' + (e && e.name)); }
  }, 400);
}

// ───────────────────────── undo / redo ─────────────────────────
const hist = { undo: [], redo: [] };
const snapshot = () => JSON.stringify(state);
let lastSnap = snapshot();
function recordHistory() {                                         // push an undo step if state changed since lastSnap; no re-render
  const s = snapshot();
  if (s === lastSnap) return false;
  hist.undo.push(lastSnap); if (hist.undo.length > 200) hist.undo.shift();
  hist.redo.length = 0; lastSnap = s; scheduleSave(); revived.clear(); purgeTombs(); return true;
}
function commit() { recordHistory(); refreshAll(); }
// Media removed from the bin waits here while an undo/redo step can still bring its clips back.
const tombs = new Map();   // media id -> media
function purgeTombs(all) {
  if (all) revived.clear();
  for (const [id, m] of tombs) {
    const key = `"mediaId":${JSON.stringify(id)}`;
    if (!all && [lastSnap, ...hist.undo, ...hist.redo].some(s => s.includes(key))) continue;
    URL.revokeObjectURL(m.url); tombs.delete(id);
  }
}
const revived = new Set();   // media brought back by undo; a redo before the next edit removes it again
function reviveMedia() {                                           // sync the media map with the clips of a restored snapshot
  let n = 0;
  for (const id of revived) if (!state.clips.some(c => c.mediaId === id)) {
    const m = media.get(id); revived.delete(id); if (!m) continue;
    media.delete(id); tombs.set(id, m); n++; DB.run('media', 'readwrite', s => s.delete(id)).catch(() => {});
  }
  for (const c of state.clips) {
    const m = c.mediaId != null && !media.has(c.mediaId) && tombs.get(c.mediaId); if (!m) continue;
    tombs.delete(m.id); media.set(m.id, m); revived.add(m.id); n++;
    putMedia(m).catch(() => mediaSaveFailed(1));
  }
  if (n) renderBin();
}
function restore(s) {
  const o = JSON.parse(s);
  state.settings = o.settings; state.tracks = o.tracks; state.clips = o.clips; state.markers = o.markers || []; setIO(o);
  if (!clipById(sel)) sel = null;
  reviveMedia(); pruneEls(); refreshAll(true);
}
function undo() { recordHistory(); if (!hist.undo.length) return; hist.redo.push(lastSnap); lastSnap = hist.undo.pop(); restore(lastSnap); scheduleSave(); }
function redo() { recordHistory(); if (!hist.redo.length) return; hist.undo.push(lastSnap); lastSnap = hist.redo.pop(); restore(lastSnap); scheduleSave(); }

// ───────────────────────── media import ─────────────────────────
function kindOfFile(f) {
  const t = f.type || '', n = (f.name || '').toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|webm|mov|mkv|m4v|ogv)$/.test(n)) return 'video';
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(n)) return 'audio';
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/.test(n)) return 'image';
  return null;
}
// load event rather than img.decode(): decode() can stay pending while the page is not being painted
const loadImage = (url) => new Promise((res, rej) => { const img = new Image(); img.onload = () => res(img); img.onerror = () => rej(new Error('load failed')); img.src = url; });
function thumbOf(src, sw, sh) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 90;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 160, 90);
  const k = Math.max(160 / sw, 90 / sh);
  try { g.drawImage(src, (160 - sw * k) / 2, (90 - sh * k) / 2, sw * k, sh * k); return c.toDataURL('image/jpeg', 0.7); } catch { return ''; }
}
async function probe(blob, name, kind) {
  const m = { id: uid(), name, kind, blob, url: URL.createObjectURL(blob), dur: 0, w: 0, h: 0, thumb: '', img: null, peaks: null };
  let el = null;
  try { return await probeInto(m, kind, (e) => (el = e)); }
  catch (e) { URL.revokeObjectURL(m.url); if (el) { el.removeAttribute('src'); el.load(); } throw e; }   // do not keep a failed file's blob alive
}
async function probeInto(m, kind, keep) {
  if (kind === 'image') {
    let img; try { img = await loadImage(m.url); } catch { throw new Error('image could not be decoded'); }
    m.img = img; m.w = img.naturalWidth; m.h = img.naturalHeight; m.dur = 5; m.thumb = thumbOf(img, m.w, m.h);
    return m;
  }
  const el = document.createElement(kind); keep(el); el.preload = 'auto'; el.muted = true; el.src = m.url;
  await new Promise((res, rej) => {
    const tm = setTimeout(() => rej(new Error('timed out reading the file')), 15000);   // a stalled load must not hang the import queue
    el.onloadedmetadata = () => { clearTimeout(tm); res(); };
    el.onerror = () => { clearTimeout(tm); rej(new Error('this browser cannot decode the file (unsupported codec or container)')); };
  });
  if (!isFinite(el.duration)) {            // e.g. MediaRecorder WebM without a duration header
    el.currentTime = 1e7; await once(el, 'seeked', 4000);
  }
  m.dur = isFinite(el.duration) ? el.duration : el.currentTime;
  if (!(m.dur > 0)) throw new Error('could not determine duration');
  if (kind === 'video') {
    m.w = el.videoWidth; m.h = el.videoHeight;
    if (!m.w || !m.h) { m.kind = 'audio'; }  // audio-only container
    else {
      el.currentTime = Math.min(m.dur * 0.1, 1); await once(el, 'seeked', 4000);
      if (el.readyState < 2) await once(el, 'loadeddata', 3000);
      m.thumb = thumbOf(el, m.w, m.h);
    }
  }
  el.removeAttribute('src'); el.load();
  return m;
}
/* Waveform peaks: Uint8Array (0–255 = 0–full scale), PEAK_RATE per second, the true peak over every sample of every channel.
   Stored in the IndexedDB media record and the project file, so they are decoded once per file. Files decode one at a time
   (queuePeaks) at a low rate; the limit is on duration, which is what sets the decoded size (~2 h stereo ≈ 460 MB at 8 kHz). */
const PEAK_SR = 8000, PEAK_MAX_DUR = 2 * 3600;
let peakQ = Promise.resolve();
function queuePeaks(m) { peakQ = peakQ.then(() => computePeaks(m)); return peakQ; }
async function computePeaks(m) {
  if (m.peaks || m.kind === 'image' || !(m.dur > 0) || m.dur > PEAK_MAX_DUR || m.blob.size > 2e9) return;   // 2 GB: ArrayBuffer ceiling
  try {
    const ab = await m.blob.arrayBuffer();
    const buf = await new OfflineAudioContext(1, 1, PEAK_SR).decodeAudioData(ab);
    const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    const step = buf.sampleRate / PEAK_RATE, len = buf.length, n = Math.ceil(len / step), pk = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let mx = 0; const a = Math.floor(i * step), b = Math.min(len, Math.floor((i + 1) * step));
      for (const d of chs) for (let j = a; j < b; j++) { const v = d[j] < 0 ? -d[j] : d[j]; if (v > mx) mx = v; }
      pk[i] = Math.min(255, Math.ceil(mx * 255));
    }
    m.peaks = pk; renderTimeline();
  } catch (e) {                                                  // no decodable audio stream: no waveform
    if (!(e && e.name === 'EncodingError')) return;              // read / memory trouble: try again next time
    m.peaks = new Uint8Array(0);                                 // remembered, so it is not decoded again
  }
  if (media.get(m.id) === m) putMedia(m).catch(() => {});        // keep them with the media record
}
// peaks <-> base64 for the project file header
const peaksB64 = (p) => { let s = ''; for (let i = 0; i < p.length; i += 0x8000) s += String.fromCharCode(...p.subarray(i, i + 0x8000)); return btoa(s); };
function peaksFrom(v) {
  if (v instanceof Uint8Array) return v;
  if (typeof v !== 'string') return null;
  try { return Uint8Array.from(atob(v), ch => ch.charCodeAt(0)); } catch { return null; }
}
async function importFiles(files) {
  const added = [], fresh = [];
  for (const f of files) {
    const kind = kindOfFile(f);
    if (!kind) { toast(`Skipped "${f.name}": not a video, audio, or image file.`); continue; }
    const dup = findDup(f);                                        // same file imported before: reuse it
    if (dup) { added.push(dup); toast(`"${dup.name}" is already in the media bin — using that one.`, 3500); continue; }
    try {
      const m = await probe(f, f.name || 'media', kind);
      m.added = Date.now(); m.mtime = typeof f.lastModified === 'number' ? f.lastModified : null;
      media.set(m.id, m); added.push(m); fresh.push(m); queuePeaks(m);
    } catch (e) { toast(`Could not import "${f.name}": ${e.message}`, 7000); }
  }
  renderBin();
  let failed = 0;
  for (const m of fresh) try { await putMedia(m); } catch { failed++; }
  mediaSaveFailed(failed);
  return added;
}
function removeMedia(id) {
  const used = state.clips.some(c => c.mediaId === id);
  if (used && !confirm('This media is used on the timeline. Remove it and its clips?')) return;
  state.clips = state.clips.filter(c => c.mediaId !== id);
  const m = media.get(id); if (m) tombs.set(id, m);                // kept for undo; purgeTombs releases it
  media.delete(id); DB.run('media', 'readwrite', s => s.delete(id)).catch(() => {});
  if (!clipById(sel)) sel = null;
  pruneEls(); renderBin(); commit(); purgeTombs();
}
// ───────────────────────── media bin: search, sort, rename, usage, relink ─────────────────────────
// a file counts as already imported when name, size and modified time all match (records from before mtime use the stored File's)
function findDup(f) {
  if (typeof f.lastModified !== 'number') return null;
  for (const m of media.values()) if (m.name === f.name && m.blob && m.blob.size === f.size && (m.mtime ?? m.blob.lastModified) === f.lastModified) return m;
  return null;
}
const usesOf = (id) => state.clips.filter(c => c.mediaId === id);
// media that clips reference but that is not loaded (lost from storage, or a project saved that way): placeholders in the bin
function missingMedia() {
  const out = new Map();
  for (const c of state.clips) {
    if (c.mediaId == null || media.has(c.mediaId)) continue;
    const o = out.get(c.mediaId) || { id: c.mediaId, name: c.name || 'media', kind: 'audio', missing: true, need: 0, n: 0 };
    if (c.type === 'image') o.kind = 'image'; else if (c.type === 'video' && o.kind !== 'image') o.kind = 'video';
    if (hasSource(c)) o.need = Math.max(o.need, c.in + c.dur * c.speed);
    o.n++; out.set(c.mediaId, o);
  }
  return out;
}
function warnMissing() {
  const n = missingMedia().size;
  if (n) toast(`${n} media file${n > 1 ? 's are' : ' is'} missing. Use Relink… in the Media bin to point ${n > 1 ? 'them' : 'it'} at the file again.`, 8000);
}
function dropEls(id) {                                             // release the elements of clips using media `id` (rebuilt on demand)
  for (const [cid, e] of els) if (clipById(cid)?.mediaId === id) {
    e.el.pause(); if (e.gain) try { e.gain.disconnect(); } catch {}
    for (const n of e.fx || []) try { n.disconnect(); } catch {}
    e.el.removeAttribute('src'); e.el.load(); els.delete(cid);
  }
}
// relink: probe `file` and store it under the missing id, so the clips find it again. Returns the media or null.
async function relinkMedia(id, file) {
  const ph = missingMedia().get(id), kind = kindOfFile(file);
  if (!kind) { toast(`"${file.name}" is not a video, audio, or image file.`); return null; }
  if (ph && (ph.kind === 'image') !== (kind === 'image')) { toast(`"${file.name}" is ${kind === 'image' ? 'a picture' : 'not a picture'}; the missing media ${ph.kind === 'image' ? 'is' : 'is not'}.`, 5000); return null; }
  let m; try { m = await probe(file, file.name || (ph && ph.name) || 'media', kind); } catch (e) { toast(`Could not relink "${file.name}": ${e.message}`, 7000); return null; }
  const old = media.get(id); dropEls(id); if (old) URL.revokeObjectURL(old.url);   // elements still on the old file are rebuilt
  m.id = id; m.added = (old && old.added) || Date.now(); m.mtime = typeof file.lastModified === 'number' ? file.lastModified : null;
  media.set(id, m); queuePeaks(m);
  const need = Math.max(0, ...usesOf(id).filter(hasSource).map(c => c.in + c.dur * c.speed));
  if (m.kind !== 'image' && need > m.dur + 0.05) toast(`Relinked, but "${m.name}" is ${m.dur.toFixed(2)} s long and the clips use up to ${need.toFixed(2)} s — the end will be blank.`, 8000);
  else toast(`Relinked "${m.name}".`, 2500);
  renderBin(); refreshAll(true);
  try { await putMedia(m); } catch { mediaSaveFailed(1); }
  return m;
}
function relinkPick(id) {
  const ph = missingMedia().get(id) || media.get(id), inp = document.createElement('input'); inp.type = 'file';
  inp.accept = ph && ph.kind === 'image' ? 'image/*' : 'video/*,audio/*';
  inp.onchange = () => { if (inp.files[0]) relinkMedia(id, inp.files[0]); };
  inp.click();
}
// rename: clips still showing the old name follow; one undo step
function renameMedia(id, name) {
  const m = media.get(id); name = String(name || '').trim().slice(0, 200);
  if (!m || !name || name === m.name) return false;
  const old = m.name; m.name = name;
  for (const c of usesOf(id)) if (c.name === old) c.name = name;
  putMedia(m).catch(() => {});
  commit(); renderBin(); return true;
}
function selectUses(id) {
  const ids = usesOf(id).filter(unlockedC).map(c => c.id);
  if (!ids.length) { toast('No clips on unlocked tracks use this media.', 2500); return 0; }
  selectMany(ids, ids[0]); return ids.length;
}
// remove every bin item no clip uses; kept in tombs like removeMedia, so an undo that brings back an old clip still finds it
function removeUnused(ask = true) {
  const list = [...media.values()].filter(m => !usesOf(m.id).length);
  if (!list.length) { toast('Every media file is used on the timeline.', 2500); return 0; }
  if (ask && !confirm(`Remove ${list.length} unused media file${list.length > 1 ? 's' : ''} from the project?`)) return 0;
  for (const m of list) { tombs.set(m.id, m); media.delete(m.id); DB.run('media', 'readwrite', s => s.delete(m.id)).catch(() => {}); }
  purgeTombs(); renderBin(); toast(`Removed ${list.length} unused media file${list.length > 1 ? 's' : ''}.`, 2500);
  return list.length;
}
let binQ = '', binSort = 'added';
try { binSort = localStorage.getItem('cutroom.binSort') || 'added'; } catch {}
const BIN_SORTS = [['added', 'Date added'], ['name', 'Name'], ['kind', 'Type'], ['dur', 'Duration']];
function binList() {                                               // filtered, sorted items: media plus missing placeholders
  const q = binQ.trim().toLowerCase(), byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  const cmp = { name: byName, kind: (a, b) => a.kind.localeCompare(b.kind) || byName(a, b), dur: (a, b) => (b.dur || 0) - (a.dur || 0) || byName(a, b), added: (a, b) => (a.added || 0) - (b.added || 0) }[binSort] || (() => 0);
  return [...missingMedia().values(), ...[...media.values()].sort(cmp)].filter(m => !q || m.name.toLowerCase().includes(q));
}
function binMenu(ev, m) {
  ev.preventDefault();
  const n = usesOf(m.id).length;
  ctxMenu(ev.clientX, ev.clientY, m.missing ? [{ label: 'Relink…', fn: () => relinkPick(m.id) }, { label: `Select clips using this (${n})`, fn: () => selectUses(m.id) }] : [
    { label: 'Add at playhead', fn: () => addMediaClip(m, null, playhead) },
    { label: 'Rename…', fn: () => startRename(m) },
    { label: `Select clips using this (${n})`, disabled: !n, fn: () => selectUses(m.id) },
    { label: 'Replace file (relink)…', fn: () => relinkPick(m.id) },
    '-', { label: 'Remove from project', fn: () => removeMedia(m.id) },
  ]);
}
function startRename(m) {
  const nm = $(`#bin .binItem[data-id="${CSS.escape(m.id)}"] .nm`); if (!nm) return;
  const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'rename'; inp.value = m.name; inp.setAttribute('aria-label', 'Media name');
  let done = false; const end = (ok) => { if (done) return; done = true; if (!ok || !renameMedia(m.id, inp.value)) renderBin(); };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
  inp.onblur = () => end(true); inp.ondblclick = (e) => e.stopPropagation();
  nm.replaceWith(inp); inp.focus(); inp.select();
}
// usage badges and placeholders follow the timeline: re-render only when a count or a missing id changed
let binSig = '';
const binSigNow = () => { const k = {}; for (const c of state.clips) if (c.mediaId != null) k[c.mediaId] = (k[c.mediaId] || 0) + (media.has(c.mediaId) ? 1 : 1e6); return JSON.stringify(k); };
function binSync() { if (binSigNow() !== binSig && !$('#bin input.rename')) renderBin(); }
function renderBin() {
  const bin = $('#bin'); bin.innerHTML = ''; updateStatus(); binSig = binSigNow();
  const miss = missingMedia();
  if (!media.size && !miss.size) { const e = div('empty'); e.textContent = 'No media yet. Click Import or drop video, audio, or image files anywhere.'; bin.append(e); return; }
  const list = binList();
  if (!list.length) { const e = div('empty'); e.textContent = `No media matches "${binQ.trim()}".`; bin.append(e); return; }
  for (const m of list) {
    const n = m.missing ? m.n : usesOf(m.id).length;
    const it = div('binItem' + (m.missing ? ' missing' : '')); it.dataset.id = m.id; it.draggable = !m.missing;
    it.title = m.missing ? 'This media file is missing — click Relink… to choose it again' : 'Drag to a track, or double-click to add at the playhead. Double-click the name to rename; right-click for more.';
    const th = div('th'); if (m.thumb) th.style.backgroundImage = `url(${m.thumb})`; else th.textContent = m.missing ? '?' : '♪';
    const info = div(); const nm = div('nm'); nm.textContent = m.name;
    const meta = div('meta'); meta.textContent = m.missing ? `Missing ${m.kind}` : m.kind === 'image' ? `${m.w}×${m.h}` : `${m.dur.toFixed(2)}s` + (m.w ? ` · ${m.w}×${m.h}` : '');
    const use = document.createElement('button'); use.className = 'use' + (n ? '' : ' unused'); use.textContent = n ? `used ×${n}` : 'unused';
    use.title = n ? 'Select the clips using this' : 'No clip uses this media'; use.disabled = !n; use.onclick = (e) => { e.stopPropagation(); selectUses(m.id); };
    info.append(nm, meta, use); info.style.minWidth = '0';
    const acts = div('acts');
    if (m.missing) {
      const rl = document.createElement('button'); rl.className = 'relink'; rl.textContent = 'Relink…'; rl.title = 'Choose the file again; the clips keep their edits';
      rl.onclick = (e) => { e.stopPropagation(); relinkPick(m.id); }; it.append(th, info, rl);
    } else {
      const add = document.createElement('button'); add.textContent = '+'; add.title = 'Add at playhead';
      add.onclick = () => addMediaClip(m, null, playhead);
      const del = document.createElement('button'); del.textContent = '×'; del.title = 'Remove from project';
      del.onclick = () => removeMedia(m.id);
      acts.append(add, del); it.append(th, info, acts);
      nm.title = 'Double-click to rename'; nm.ondblclick = (e) => { e.stopPropagation(); startRename(m); };
      it.ondblclick = (e) => { if (!e.target.closest('button,input')) addMediaClip(m, null, playhead); };
      it.ondragstart = (e) => { dragMedia = m.id; e.dataTransfer.setData('text/plain', m.name); e.dataTransfer.effectAllowed = 'copy'; };
      it.ondragend = () => { dragMedia = null; clearDropHL(); };
    }
    it.oncontextmenu = (e) => binMenu(e, m);
    bin.append(it);
  }
}
$('#binQ').oninput = (e) => { binQ = e.target.value; renderBin(); };
$('#binSort').innerHTML = BIN_SORTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
$('#binSort').value = BIN_SORTS.some(s => s[0] === binSort) ? binSort : 'added';
$('#binSort').onchange = (e) => { binSort = e.target.value; try { localStorage.setItem('cutroom.binSort', binSort); } catch {} e.target.blur(); renderBin(); };
$('#binUnused').onclick = () => removeUnused();

// ───────────────────────── clip operations ─────────────────────────
// nearest free start on a track; forward = only at or after `start` (duplicates never land before the original)
function place(c, trackId, start, forward) {
  start = Math.max(0, start);
  const others = state.clips.filter(o => o.track === trackId && o.id !== c.id);
  const free = (s) => s >= -1e-6 && !others.some(o => s < o.start + o.dur - 1e-6 && s + c.dur > o.start + 1e-6);
  if (free(start)) return start;
  let best = null;
  for (const o of others) for (const cand of [o.start + o.dur, o.start - c.dur]) {
    if (forward && cand < start - 1e-6) continue;
    if (free(cand) && (best === null || Math.abs(cand - start) < Math.abs(best - start))) best = Math.max(0, cand);
  }
  return best;
}
function defaultTrack(kind) {
  const ts = state.tracks.filter(t => t.kind === kind && !t.locked);
  if (!ts.length) return null;
  return kind === 'video' ? ts[ts.length - 1] : ts[0];   // V1 is the lowest video row, A1 the first audio row
}
// extraProps: overrides applied before the single commit (voiceover, music), so adding stays one undo step.
// head: seconds trimmed off the start of the source (voiceover latency compensation).
function addMediaClip(m, trackId, t, extraProps, head = 0) {
  const kind = m.kind === 'audio' ? 'audio' : 'video';
  let tr = trackById(trackId);
  if (!tr || tr.kind !== kind || tr.locked) tr = defaultTrack(kind);
  if (!tr) { toast(`No unlocked ${kind} track available.`); return null; }
  head = clamp(head || 0, 0, Math.max(0, m.dur - MIN_DUR));
  const c = { id: uid(), type: m.kind, mediaId: m.id, name: m.name, track: tr.id, start: 0, dur: m.dur - head, in: head, speed: 1, props: { ...BASE_PROPS, ...extraProps } };
  const S = state.settings;                                     // landscape footage in a vertical project: blurred-background fill by default
  if (kind === 'video' && !(extraProps && 'fitMode' in extraProps) && S.h > S.w && m.w > m.h) c.props.fitMode = 'blur';
  c.start = place(c, tr.id, frameRound(t)) ?? 0;
  state.clips.push(c); sel = c.id; commit(); renderInspector(true);
  return c;
}
const addText = () => addGenerated('text');
// type: 'text' | 'solid' | 'sticker'. extra overrides default props; its x/y are given for a 1920×1080 frame.
function addGenerated(type, extra = {}) {
  const vts = state.tracks.filter(t => t.kind === 'video' && !t.locked);
  if (!vts.length) { toast('No unlocked video track available.'); return; }
  const base = type === 'text' ? { ...BASE_PROPS, ...TEXT_PROPS } : type === 'sticker' ? { ...BASE_PROPS, glyph: '⭐', scale: 50 } : type === 'adjust' ? { ...BASE_PROPS } : { ...BASE_PROPS, color: '#1e6fd9' };
  const props = { ...base, ...extra };
  if ('x' in extra) props.x = Math.round(extra.x * state.settings.w / 1920);
  if ('y' in extra) props.y = Math.round(extra.y * state.settings.h / 1080);
  if (extra.boxWidth) props.boxWidth = Math.round(extra.boxWidth * state.settings.w / 1920);
  const name = { text: 'Text', sticker: 'Sticker', adjust: 'Adjustment layer' }[type] || 'Solid';
  const c = { id: uid(), type, mediaId: null, name, track: '', start: 0, dur: 5, in: 0, speed: 1, props };
  const t0 = frameRound(playhead);
  // prefer the lowest video track that is free at the playhead, so text lands above footage
  // ...and if every track is busy there, make a new one on top rather than pushing the clip later in time.
  // An adjustment layer goes on the highest free track instead, so it affects as much as possible below it.
  let tr = (type === 'adjust' ? vts : [...vts].reverse()).find(t => place(c, t.id, t0) === t0) || addTrack('video', true);
  c.track = tr.id; c.start = place(c, tr.id, t0) ?? 0;
  state.clips.push(c); sel = c.id; commit(); renderInspector(true);
}
// ── linked audio: a video and its detached sound share c.link and move, trim, split and delete as one ──
const linkedOf = (c) => c && c.link ? state.clips.filter(o => o.link === c.link && o.id !== c.id) : [];
const unlockedC = (c) => !trackById(c.track)?.locked;
function withLinked(list) {                                     // list plus the linked partners of its clips (no repeats)
  const out = [...list], ids = new Set(list.map(c => c.id));
  for (const c of list) for (const o of linkedOf(c)) if (!ids.has(o.id)) { ids.add(o.id); out.push(o); }
  return out;
}
// click on a clip: select it with its unlocked linked partners; alone (Alt+click) = just that clip
function selectClip(c, alone) {
  const ids = [c.id, ...(alone ? [] : linkedOf(c).filter(unlockedC).map(o => o.id))];
  if (ids.length > 1) selectMany(ids, c.id); else select(c.id);
}
function unlinkClips(c) {
  const l = c.link; if (!l) return;
  for (const o of state.clips) if (o.link === l) delete o.link;
  commit(); toast('Unlinked. The video and audio now edit separately.', 2500);
}
// link one video and one audio clip (any earlier links of either are dropped)
function linkClips(list) {
  const v = list.find(c => c.type === 'video'), a = list.find(c => c.type === 'audio');
  if (list.length !== 2 || !v || !a) { toast('Select one video clip and one audio clip to link.', 2500); return false; }
  if (!list.every(unlockedC)) { toast('Track is locked.', 2000); return false; }
  for (const c of list) if (c.link) for (const o of state.clips) if (o !== c && o.link === c.link) delete o.link;
  v.link = a.link = uid(); commit(); renderInspector(true);
  return true;
}
// trim helpers: each part remembers its own neighbours and source so linked clips trim together without overlaps
function trimParts(c, alone) {
  return [c, ...(alone ? [] : linkedOf(c).filter(unlockedC))].map(k => {
    const sibs = state.clips.filter(s => s.track === k.track && s.id !== k.id), end = k.start + k.dur;
    return { k, start: k.start, dur: k.dur, in: k.in, kf: k.kf ? JSON.stringify(k.kf) : null, m: media.get(k.mediaId),
      prevEnd: sibs.reduce((v, s) => s.start + s.dur <= k.start + 1e-6 ? Math.max(v, s.start + s.dur) : v, 0),
      nextStart: sibs.reduce((v, s) => s.start >= end - 1e-6 ? Math.min(v, s.start) : v, Infinity) };
  });
}
// move the left ('l') or right ('r') edge of every part by d seconds, limited so each stays valid; returns the d applied
function applyTrim(parts, edge, d) {
  let lo = -Infinity, hi = Infinity;
  for (const p of parts) {
    const src = hasSource(p.k);
    if (edge === 'l') { lo = Math.max(lo, p.prevEnd - p.start, src ? -p.in / p.k.speed : -Infinity); hi = Math.min(hi, p.dur - MIN_DUR); }
    else { lo = Math.max(lo, MIN_DUR - p.dur); hi = Math.min(hi, p.nextStart - p.start - p.dur, src && p.m ? (p.m.dur - p.in) / p.k.speed - p.dur : Infinity); }
  }
  d = clamp(d, lo, hi);
  for (const p of parts) {
    const k = p.k;
    if (edge === 'r') { k.dur = p.dur + d; continue; }
    k.start = p.start + d; k.dur = p.dur - d; if (hasSource(k)) k.in = Math.max(0, p.in + d * k.speed);
    if (p.kf) { k.kf = JSON.parse(p.kf); for (const a of Object.values(k.kf)) for (const q of a) q.t -= d; }   // keyframes stay with the content
  }
  return d;
}
// one-step trim of c's edge to time t (with its linked clips unless alone)
function trimEdge(c, edge, t, alone) {
  if (!unlockedC(c)) { toast('Track is locked.', 2000); return; }
  applyTrim(trimParts(c, alone), edge, t - (edge === 'l' ? c.start : c.start + c.dur)); commit();
}
// split c at t; unless alone, its linked clips split too and the right halves form a new linked pair
function splitClip(c, t, alone) {
  const b = splitOne(c, t); if (!b) return false;
  if (c.link) {
    let n = 0; b.link = uid();
    if (!alone) for (const k of linkedOf(c)) if (k.link === c.link && unlockedC(k)) { const kb = splitOne(k, t); if (kb) { kb.link = b.link; n++; } }
    if (!n) delete b.link;                                      // nothing to pair the right half with
  }
  return true;
}
function splitOne(c, t) {
  if (t <= c.start + MIN_DUR || t >= c.start + c.dur - MIN_DUR) return null;
  const b = JSON.parse(JSON.stringify(c)); b.id = uid();
  const d = t - c.start;
  b.start = t; b.dur = c.dur - d; if (hasSource(c)) b.in = c.in + d * c.speed;
  if (c.kf) for (const key of Object.keys(c.kf)) {            // keep the motion continuous across the cut
    const k = c.kf[key]; if (!k.length) continue;
    const v = val(c, key, t), at = k.find(p => Math.abs(p.t - d) <= 1e-6) || k.filter(p => p.t < d).pop(), b0 = { t: 0, v };
    if (at && at.e) b0.e = at.e;                                  // the right half keeps the easing of the segment it starts in
    c.kf[key] = [...k.filter(p => p.t < d - 1e-6), { t: d, v }];
    b.kf[key] = [b0, ...k.filter(p => p.t > d + 1e-6).map(p => ({ ...p, t: p.t - d }))];
  }
  b.props.fadeIn = 0; c.props.fadeOut = 0; c.dur = d;
  state.clips.push(b); return b;
}
function splitAtPlayhead() {
  const t = frameRound(playhead); let n = 0;
  // the selected (unlocked) clips under the playhead, else every unlocked clip there
  const picked = selClips().filter(c => !trackById(c.track)?.locked && t > c.start && t < c.start + c.dur);
  const targets = picked.length ? picked : state.clips.filter(c => !trackById(c.track)?.locked);
  for (const c of [...targets]) if (splitClip(c, t)) n++;
  if (n) commit(); else toast('Nothing under the playhead to split.', 2000);
}
function deleteSel(ripple) {                                     // deletes every selected clip (and its linked clips) on an unlocked track
  const gone = withLinked(selClips()).filter(unlockedC);
  if (!gone.length) { if (selSet.size) toast('Track is locked.', 2000); return; }
  state.clips = state.clips.filter(o => !gone.includes(o));
  if (ripple) for (const c of gone.sort((a, b) => b.start - a.start))   // latest first, so earlier gaps stay valid
    for (const o of state.clips) if (o.track === c.track && o.start >= c.start + c.dur - 1e-6) o.start = Math.max(0, o.start - c.dur);
  sel = null; pruneEls(); commit(); renderInspector(true);
}
function cutSel() {                                              // copy the selection to the clipboard, then delete it
  if (!selSet.size) return;
  const list = withLinked(selClips()).filter(unlockedC);         // deleteSel takes linked clips too, so the clipboard does
  if (!list.length) { toast('Track is locked.', 2000); return; }
  clipboard = JSON.parse(JSON.stringify(list));
  deleteSel(false);
}
// src: one clip or an array of clips; a group keeps its relative timing, starting at `at`. forward: never place earlier than asked
function pasteClip(src, at, forward) {
  const list = Array.isArray(src) ? src : src ? [src] : []; if (!list.length) return;
  const base = Math.min(...list.map(c => c.start)), ids = [], lmap = new Map();
  for (const s0 of list) {
    if ((hasSource(s0) || s0.type === 'image') && !media.has(s0.mediaId)) { toast('Source media is no longer in the project.'); continue; }
    const c = JSON.parse(JSON.stringify(s0)); c.id = uid();
    // copies are linked to each other (new link id), never to the originals; a copy without its partner is unlinked
    if (c.link) { if (list.some(o => o !== s0 && o.link === s0.link)) { if (!lmap.has(c.link)) lmap.set(c.link, uid()); c.link = lmap.get(c.link); } else delete c.link; }
    let tr = trackById(c.track); if (!tr || tr.locked) tr = defaultTrack(kindFor(c));
    if (!tr) continue;
    c.track = tr.id;
    const s = place(c, tr.id, frameRound(at + (s0.start - base)), forward); if (s == null) continue;
    c.start = s; state.clips.push(c); ids.push(c.id);
  }
  if (!ids.length) return;
  sel = ids[ids.length - 1]; selSet = new Set(ids); commit(); renderInspector(true);
}
// copies of every selected clip on an unlocked track, right after the end of the selection
function duplicateSel() {
  const list = selClips().filter(c => !trackById(c.track)?.locked);
  if (!list.length) { if (selSet.size) toast('Track is locked.', 2000); return; }
  pasteClip(list, Math.max(...list.map(c => c.start + c.dur)), true);
}
// the clips a context-menu action applies to: the whole (unlocked) selection when c is part of it, else c alone
const actClips = (c) => selSet.size > 1 && selSet.has(c.id) ? selClips().filter(k => !trackById(k.track)?.locked) : [c];
// ── copy / paste attributes: property groups of one clip onto every selected clip (Ctrl+Alt+C / Ctrl+Alt+V) ──
let attrClip = null;                                             // {name, type, props, kf}
function attrGroups() {                                          // [id, label, keys(target), fits(clip)]; a function: FX_KEYS is declared further down
  const vis = (k) => k.type !== 'audio';
  return [
    ['transform', 'Transform', () => ['x', 'y', 'scale', 'rot', 'opacity', 'flipH', 'flipV', 'cropL', 'cropR', 'cropT', 'cropB', 'fitMode', 'radius', 'feather'], vis],
    ['colour', 'Colour', () => Object.keys(FILTER_BASE), vis],
    ['fx', 'Effects', () => [...FX_KEYS, ...FX_EXTRA], vis],
    ['motion', 'Motion', () => ['anim', 'mbOn', 'mbShutter', 'mbSamples', 'transIn', 'transOut', 'transDir', 'fadeIn', 'fadeOut'], vis],
    ['3d', '3D layer', () => ['rotX', 'rotY', 'z', 'persp'], vis],
    ['mask', 'Mask & blend', () => ['blend', 'maskShape', 'maskX', 'maskY', 'maskW', 'maskH', 'maskRound', 'maskFeather', 'maskInvert'], vis],
    ['text', 'Text style', () => Object.keys(TEXT_PROPS).filter(k => k !== 'text'), (k) => k.type === 'text'],
    ['audio', 'Audio', (t) => ['volume', 'isVoice', 'duck', 'keepPitch', 'fadeCurve', 'hpf', 'clean', ...(t.type === 'audio' && attrClip.type === 'audio' ? ['fadeIn', 'fadeOut'] : [])], hasSource],
  ];
}
function copyAttrs(c = clipById(sel)) {
  if (!c) { toast('Select a clip first.', 2000); return false; }
  attrClip = { name: c.name, type: c.type, props: structuredClone(c.props), kf: structuredClone(c.kf || {}) };
  toast(`Copied the attributes of "${c.name}". Select clips and press Ctrl+Alt+V to paste.`, 3000); return true;
}
// ids: group ids to paste; list: target clips (default: the unlocked selection). One undo step; returns the number of clips changed.
function pasteAttrs(ids, list = selClips().filter(unlockedC)) {
  const a = attrClip; if (!a || !list.length) return 0;
  let n = 0;
  for (const t of list) {
    let hit = false;
    for (const [id, , keys, fits] of attrGroups()) {
      if (!ids.includes(id) || !fits(a) || !fits(t)) continue;
      for (const k of keys(t)) {
        if (!(k in a.props)) continue;
        if (k === 'volume' && audioDetached(t)) continue;           // a detached video stays silent
        if (k === 'anim' && TEXT_ANIMS.includes(a.props.anim) && t.type !== 'text') continue;
        t.props[k] = k === 'fadeIn' || k === 'fadeOut' ? Math.min(a.props[k], t.dur) : a.props[k]; hit = true;
        if (ANIM.includes(k)) { if (a.kf[k] && a.kf[k].length) (t.kf ||= {})[k] = structuredClone(a.kf[k]); else if (t.kf) delete t.kf[k]; }
      }
    }
    if (t.kf && !Object.keys(t.kf).length) delete t.kf;
    if (hit) n++;
  }
  if (n) { commit(); renderInspector(true); }
  return n;
}
function pasteAttrsDialog() {
  if (!attrClip) { toast('Copy attributes from a clip first (right-click it, or Ctrl+Alt+C).', 3000); return; }
  const ts = selClips().filter(unlockedC);
  if (!ts.length) { toast(selSet.size ? 'The selected clips are on locked tracks.' : 'Select the clips to paste onto.', 2500); return; }
  const groups = attrGroups().filter(g => g[3](attrClip) && ts.some(g[3]));
  if (!groups.length) { toast(`Nothing from "${attrClip.name}" fits the selected clips.`, 2500); return; }
  openModal((box) => {
    const h = document.createElement('h2'); h.textContent = 'Paste attributes';
    const p = document.createElement('p'); p.className = 'info'; p.textContent = `From "${attrClip.name}" onto ${ts.length} clip${ts.length === 1 ? '' : 's'}. Animated values bring their keyframes.`;
    box.append(h, p);
    const boxes = groups.map(([id, label]) => {
      const r = div('frow'), l = document.createElement('label'), i = document.createElement('input'); i.type = 'checkbox'; i.checked = true; i.value = id; i.id = 'pa_' + id;
      l.htmlFor = i.id; l.textContent = label; r.append(l, i); box.append(r); return i;
    });
    const b = div('mbtns'), no = document.createElement('button'), ok = document.createElement('button');
    no.textContent = 'Cancel'; no.onclick = closeModal; ok.textContent = 'Paste'; ok.className = 'primary';
    ok.onclick = () => { const ids = boxes.filter(i => i.checked).map(i => i.value); closeModal(); const n = pasteAttrs(ids, ts); if (n) toast(`Pasted onto ${n} clip${n === 1 ? '' : 's'}.`, 2000); };
    b.append(no, ok); box.append(b); ok.focus();
  });
}
function toggleMarker(t) {
  t = frameRound(t); const i = state.markers.findIndex(m => Math.abs(m - t) <= kfEps());
  if (i >= 0) state.markers.splice(i, 1); else { state.markers.push(t); state.markers.sort((a, b) => a - b); }
  commit();
}
// ── keyboard editing: trim to playhead, nudge, edit points, select from here, in/out ──
// the clips Q/W act on: the selected unlocked clips under t, else the topmost unlocked clip there
function clipsAt(t) {
  const under = (c) => t > c.start + 1e-6 && t < c.start + c.dur - 1e-6;
  const picked = selClips().filter(c => unlockedC(c) && under(c));
  if (picked.length) return picked;
  for (const tr of state.tracks) if (!tr.locked) { const c = state.clips.find(k => k.track === tr.id && under(k)); if (c) return [c]; }
  return [];
}
const trimTargets = (c) => actClips(c).filter(k => playhead > k.start && playhead < k.start + k.dur);   // context menu: c or its selection
// trim the start ('l') or end ('r') of the clips under the playhead to it (same maths as the edge drags, linked clips too).
// ripple: the trimmed clip keeps its start and later clips on its track close up by the amount removed.
function trimToPlayhead(edge, ripple, list) {
  const t = frameRound(playhead), done = new Set(); let n = 0;
  list = list || clipsAt(t);
  if (!list.length) { toast('No clip under the playhead to trim.', 2000); return 0; }
  for (const c of list) {
    if (done.has(c.id)) continue;
    const parts = trimParts(c); parts.forEach(p => done.add(p.k.id));
    const d = applyTrim(parts, edge, t - (edge === 'l' ? c.start : c.start + c.dur)), cut = edge === 'l' ? d : -d;
    if (cut < 1e-9) continue; n++;
    if (ripple) for (const p of parts) {
      if (edge === 'l') p.k.start = p.start;                       // keyframes already moved with the content
      for (const o of state.clips) if (o.track === p.k.track && o !== p.k && o.start >= p.start + p.dur - 1e-6) o.start = Math.max(0, o.start - cut);
    }
  }
  if (n) commit(); else toast('Nothing to trim there.', 2000);
  return n;
}
// move clips by delta seconds from their starts in `orig` (default: current starts). Returns false, changing nothing,
// when one would start before 0 or overlap a clip outside the list (used by the group drag and the Alt+arrow nudge).
function moveClips(list, delta, orig) {
  const ids = new Set(list.map(k => k.id)), at = (k) => (orig ? orig.get(k.id) : k.start) + delta;
  const others = state.clips.filter(k => !ids.has(k.id));
  if (list.some(k => at(k) < -1e-6 || others.some(o => o.track === k.track && at(k) < o.start + o.dur - 1e-6 && at(k) + k.dur > o.start + 1e-6))) return false;
  for (const k of list) k.start = Math.max(0, at(k));
  return true;
}
function nudgeSel(frames) {                                      // Alt+←/→: the selection (with linked clips) by whole frames
  const list = withLinked(selClips()).filter(unlockedC);
  if (!list.length) { if (selSet.size) toast('Track is locked.', 2000); return false; }
  if (!moveClips(list, frames / state.settings.fps)) { toast('Blocked by another clip', 1500); return false; }
  commit(); return true;
}
// ↑/↓: previous / next clip start or end (markers: previous / next marker)
function jumpEdit(dir, markersOnly) {
  stop();
  const pts = markersOnly ? state.markers : [0, ...state.clips.flatMap(c => [c.start, c.start + c.dur])], eps = 0.5 / state.settings.fps;
  const p = dir > 0 ? Math.min(...pts.filter(x => x > playhead + eps)) : Math.max(...pts.filter(x => x < playhead - eps));
  if (!isFinite(p)) { toast(markersOnly ? 'No more markers that way.' : 'No more edit points that way.', 1500); return false; }
  setPlayhead(p); updatePlayheadUI(true); return true;
}
function selectFrom(t, trackId) {                                // every unlocked clip starting at or after t (on one track if given)
  const ids = state.clips.filter(c => unlockedC(c) && c.start >= t - 1e-6 && (!trackId || c.track === trackId)).map(c => c.id);
  if (!ids.length) { toast('No clips after this point.', 2000); return; }
  selectMany(ids, ids[0]);
}
// sequence in / out points (I / O, Alt+X clears); read them through ioRange()
function setIO(o) {
  const ok = (v) => typeof v === 'number' && isFinite(v) && v >= 0 ? v : null;
  state.inPt = ok(o && o.inPt); state.outPt = ok(o && o.outPt);
}
function markIO(which, t) {
  t = frameRound(t);
  if (which === 'in') { state.inPt = t; if (state.outPt != null && state.outPt <= t) state.outPt = null; }
  else if (which === 'out') { if (t <= 0) { toast('Move the playhead past the start to set an out point.', 2000); return; } state.outPt = t; if (state.inPt != null && state.inPt >= t) state.inPt = null; }
  else { if (state.inPt == null && state.outPt == null) return; state.inPt = state.outPt = null; }
  commit();
}
// {from, to} of the in/out range (a missing point = sequence start / end), or null when none is set
function ioRange() {
  if (state.inPt == null && state.outPt == null) return null;
  const from = state.inPt ?? 0, to = state.outPt ?? projectEnd();
  return to > from ? { from, to } : null;
}
// Advanced: swap a track with its neighbour of the same kind (video row order = layer order)
function moveTrack(id, dir) {
  const tr = trackById(id); if (!tr) return false;
  const same = state.tracks.filter(t => t.kind === tr.kind), nb = same[same.indexOf(tr) + dir];
  if (!nb) return false;
  if (tr.locked || nb.locked) { toast('Track is locked.', 2000); return false; }
  const a = state.tracks.indexOf(tr), b = state.tracks.indexOf(nb);
  state.tracks[a] = nb; state.tracks[b] = tr; commit(); return true;
}
// has this video clip's sound already been moved to an audio clip? (older projects: an audio clip of the same footage lined up with it)
const audioDetached = (c) => c.type === 'video' && (!!c.props.audioDetached || state.clips.some(a => a.type === 'audio' && a.mediaId === c.mediaId &&
  Math.abs(a.start - c.start) < 1e-3 && Math.abs(a.in - c.in) < 1e-3 && (c.props.volume ?? 100) === 0));
function detachAudio(c) {
  if (c.type !== 'video' || audioDetached(c)) { toast('The audio of this clip is already detached.', 2000); return; }
  if (trackById(c.track)?.locked) { toast('Track is locked.', 2000); return; }
  const p = c.props;                                            // the sound keeps its level, fades, ducking and volume animation
  const a = { id: uid(), type: 'audio', mediaId: c.mediaId, name: c.name + ' (audio)', track: '', start: c.start, dur: c.dur, in: c.in, speed: c.speed,
    props: { ...BASE_PROPS, volume: p.volume ?? 100, fadeIn: p.fadeIn || 0, fadeOut: p.fadeOut || 0, duck: !!p.duck, isVoice: !!p.isVoice, keepPitch: p.keepPitch !== false,
      fadeCurve: p.fadeCurve || 'linear', hpf: p.hpf || 0, clean: !!p.clean } };
  if (c.kf && c.kf.volume) { a.kf = { volume: c.kf.volume }; delete c.kf.volume; if (!hasKf(c)) delete c.kf; }
  let tr = state.tracks.find(t => t.kind === 'audio' && !t.locked && place(a, t.id, a.start) === a.start);
  if (!tr) tr = addTrack('audio', true);
  a.track = tr.id; p.volume = 0; p.audioDetached = true; c.link = a.link = uid();   // linked: they move, trim, split and delete together
  state.clips.push(a); commit(); renderInspector(true);
  return a;
}
function addTrack(kind, silent) {
  const pre = kind === 'video' ? 'V' : 'A'; let n = 1;
  while (state.tracks.some(t => t.name === pre + n)) n++;     // first unused number, so names never repeat after a delete
  const tr = { id: uid(), name: pre + n, kind, muted: false, hidden: false, locked: false };
  if (kind === 'video') state.tracks.unshift(tr); else state.tracks.push(tr);
  if (!silent) commit();
  return tr;
}
function select(id) { if (sel === id && selSet.size <= 1) return; sel = id; selSet = new Set(id ? [id] : []); renderTimeline(); renderInspector(true); renderLib(); requestRender(); }
function selectMany(ids, primary) {
  selSet = new Set(ids); sel = primary && selSet.has(primary) ? primary : (ids.length ? ids[ids.length - 1] : null);
  renderTimeline(); renderInspector(true); renderLib(); requestRender();
}
// fill in properties added by newer versions so older saved projects keep working
function normalizeClips() { for (const c of state.clips) c.props = { ...BASE_PROPS, ...(c.type === 'text' ? TEXT_PROPS : {}), ...c.props }; }

// ───────────────────────── media elements + audio graph ─────────────────────────
function ensureAudio() {
  if (actx) { if (actx.state === 'suspended') actx.resume().catch(() => {}); return; }
  try {
    actx = new AudioContext(); master = actx.createGain(); master.connect(actx.destination);
    analyser = actx.createAnalyser(); analyser.fftSize = 1024; meterBuf = new Float32Array(1024); master.connect(analyser);
    for (const e of els.values()) wire(e);
  } catch { actx = null; }
}
function wire(e) {
  if (e.gain || !actx) return;
  try { e.src = actx.createMediaElementSource(e.el); e.gain = actx.createGain(); e.src.connect(e.gain); e.gain.connect(master); e.chain = ''; } catch { /* falls back to element volume */ }
}
// Clean voice: source → [high-pass] → [speech compressor] → gain. mixAudioOffline builds the same nodes with cleanNodes.
const CLEAN_COMP = { threshold: -24, knee: 12, ratio: 3, attack: 0.005, release: 0.2 };
function cleanNodes(ac, p) {                                     // [] when both are off
  const ns = [];
  if (p.hpf > 0) { const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = clamp(p.hpf, 20, 1000); f.Q.value = Math.SQRT1_2; ns.push(f); }
  if (p.clean) { const k = ac.createDynamicsCompressor(); for (const [n, v] of Object.entries(CLEAN_COMP)) k[n].value = v; ns.push(k); }
  return ns;
}
function setChain(e, p) {                                        // rewires only when hpf / clean change
  if (!e.src) return;
  const key = (p.hpf > 0 ? clamp(p.hpf, 20, 1000) : 0) + '|' + !!p.clean; if (e.chain === key) return;
  try { e.src.disconnect(); } catch {}
  for (const n of e.fx || []) try { n.disconnect(); } catch {}
  e.fx = cleanNodes(actx, p); let at = e.src;
  for (const n of e.fx) { at.connect(n); at = n; }
  at.connect(e.gain); e.chain = key;
}
function getEl(c) {
  let e = els.get(c.id); if (e) return e;
  const m = media.get(c.mediaId); if (!m) return null;
  const el = document.createElement(m.kind === 'audio' ? 'audio' : 'video');
  el.preload = 'auto'; el.playsInline = true; el.src = m.url;
  el.addEventListener('seeked', requestRender); el.addEventListener('loadeddata', requestRender);
  e = { el, gain: null, target: undefined }; els.set(c.id, e); wire(e);
  return e;
}
function pruneEls() {
  for (const [id, e] of els) if (!clipById(id)) {
    e.el.pause(); if (e.gain) try { e.gain.disconnect(); } catch {}
    for (const n of e.fx || []) try { n.disconnect(); } catch {}
    e.el.removeAttribute('src'); e.el.load(); els.delete(id); bounds.delete(id);
  }
}
// Auto-ducking: a clip with props.duck drops to DUCK_LEVEL while any voice clip plays, ramping over DUCK_RAMP seconds.
const DUCK_LEVEL = 0.25, DUCK_RAMP = 0.3;                      // 0.25 ≈ −12 dB
function duckFactor(c, t) {
  if (!c.props.duck) return 1;
  let amt = 0;
  for (const v of state.clips) {
    if (v === c || !v.props.isVoice || !hasSource(v) || trackById(v.track)?.muted) continue;
    const a = v.start - DUCK_RAMP, b = v.start + v.dur + DUCK_RAMP;
    if (t > a && t < b) amt = Math.max(amt, Math.min(1, (t - a) / DUCK_RAMP, (b - t) / DUCK_RAMP));
  }
  return 1 - (1 - DUCK_LEVEL) * amt;
}
function setSpeed(c, v) {                                       // keeps the same source footage, limited by the next clip on the track
  const srcLen = c.dur * c.speed;
  const room = state.clips.reduce((x, k) => k.track === c.track && k.id !== c.id && k.start >= c.start + c.dur - 1e-6 ? Math.min(x, k.start) : x, Infinity) - c.start;
  c.speed = v; c.dur = Math.max(MIN_DUR, Math.min(srcLen / v, room));
  return c.dur >= srcLen / v - 0.01;                            // false = shortened to fit
}
function fadeFactor(c, t) {
  const local = t - c.start, p = c.props; let f = 1;
  if (p.fadeIn > 0) f = Math.min(f, local / p.fadeIn);
  if (p.fadeOut > 0) f = Math.min(f, (c.dur - local) / p.fadeOut);
  f = clamp(f, 0, 1);                                            // sound only: preview (syncMedia) and export (mixAudioOffline) both use this
  return p.fadeCurve === 'equal-power' ? Math.sin(f * Math.PI / 2) : p.fadeCurve === 'smooth' ? f * f * (3 - 2 * f) : f;
}
// fade shapes: linear gain, equal power (no loudness dip in a crossfade), smooth S-curve
const FADE_CURVES = [['linear', 'Linear'], ['equal-power', 'Equal power'], ['smooth', 'Smooth (S-curve)']];
// track mixer: audio tracks carry gain % (missing = 100, so older projects are unchanged)
const trackGain = (tr) => (tr && tr.kind === 'audio' && typeof tr.gain === 'number' ? clamp(tr.gain, 0, 400) / 100 : 1);
function fmtDb(pct) {
  if (!(pct > 0)) return '−∞ dB';
  const d = 20 * Math.log10(pct / 100);
  return Math.abs(d) < 0.05 ? '0.0 dB' : (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1) + ' dB';
}
/* Normalize: volume so the loudest moment of the source range a clip plays peaks at −1 dBFS (capped at +12 dB, 400 %).
   The peak comes from the waveform peaks (true peak over all channels, 8 kHz decode, 1/255 steps). */
const NORM_PEAK = 10 ** (-1 / 20), NORM_MAX = 400;
function clipPeak(c) {                                           // 0–1; null = peaks not measured yet, 0 = silent / no audio
  const m = media.get(c.mediaId); if (!m || !m.peaks) return null;
  const pk = m.peaks, a = Math.max(0, Math.floor(c.in * PEAK_RATE)), b = Math.min(pk.length, Math.ceil((c.in + c.dur * c.speed) * PEAK_RATE));
  let mx = 0; for (let i = a; i < b; i++) if (pk[i] > mx) mx = pk[i];
  return mx / 255;
}
async function normalizeVol(list) {
  const ids = list.filter(k => hasSource(k) && unlockedC(k) && !(k.type === 'video' && audioDetached(k))).map(k => k.id);
  if (!ids.length) { toast('Nothing to normalize here (locked, or the sound is on its own clip).', 2500); return 0; }
  const need = ids.map(clipById).filter(k => clipPeak(k) === null);
  if (need.length) { toast('Measuring the audio…', 1500); for (const k of need) { const m = media.get(k.mediaId); if (m) await queuePeaks(m); } }
  let n = 0, capped = 0, silent = 0;
  for (const c of ids.map(clipById)) {                           // re-fetched: an undo during the wait replaces clip objects
    if (!c || !unlockedC(c)) continue;
    const pk = clipPeak(c); if (!pk) { silent++; continue; }
    let v = 100 * NORM_PEAK / pk; if (v > NORM_MAX) { v = NORM_MAX; capped++; }
    v = +v.toFixed(1);
    const k = kfOf(c, 'volume');
    if (k) { const mx = Math.max(...k.map(q => q.v)); if (mx > 0) for (const q of k) q.v = +(q.v * v / mx).toFixed(2); }   // keeps the volume shape, loudest key = v
    else c.props.volume = v;
    n++;
  }
  if (n) { commit(); renderInspector(true); }
  toast(n ? `Normalized ${n > 1 ? n + ' clips' : 'the clip'} to peak at −1 dBFS.` + (capped ? ' Very quiet: limited to +12 dB.' : '') : 'No sound to normalize.', 2500);
  if (n && silent) toast(`${silent} clip${silent > 1 ? 's have' : ' has'} no sound and ${silent > 1 ? 'were' : 'was'} left alone.`, 2500);
  return n;
}
// ── keyframes: c.kf[prop] = [{t, v, e?}] sorted by t; t is seconds from the clip start ──
// e is the easing of the segment that starts at that key (missing = linear, so older projects are unchanged)
const ANIM = ['x', 'y', 'scale', 'rot', 'opacity', 'volume', 'rotX', 'rotY', 'z', 'maskX', 'maskY', 'maskW', 'maskH'];
const EASE = { linear: u => u, in: u => u * u * u, out: u => 1 - (1 - u) ** 3, inout: u => (u < 0.5 ? 4 * u * u * u : 1 - (2 - 2 * u) ** 3 / 2), hold: () => 0 };
const EASE_NAMES = [['linear', 'Linear'], ['in', 'Ease in'], ['out', 'Ease out'], ['inout', 'Ease in-out'], ['hold', 'Hold']];
const kfOf = (c, key) => (c.kf && c.kf[key] && c.kf[key].length ? c.kf[key] : null);
const kfEps = () => 0.5 / state.settings.fps;
function val(c, key, t) {
  const k = kfOf(c, key); if (!k) return c.props[key];
  const l = t - c.start, last = k[k.length - 1];
  if (l <= k[0].t) return k[0].v;
  if (l >= last.t) return last.v;
  for (let i = 1; i < k.length; i++) if (l < k[i].t) {         // at a key's own time its value wins (a hold jumps there)
    const a = k[i - 1], b = k[i], u = (l - a.t) / ((b.t - a.t) || 1);
    return a.v + (b.v - a.v) * easeFn(a.e)(u);                 // a named ease, or a custom curve from the graph editor
  }
  return last.v;
}
function kfIndexAt(c, key, l) { const k = kfOf(c, key); return k ? k.findIndex(p => Math.abs(p.t - l) <= kfEps()) : -1; }
// an update keeps the key's easing; a new key inherits the easing of the segment it lands in
function upsertKf(c, key, l, v) {
  c.kf = c.kf || {}; const k = c.kf[key] = c.kf[key] || [];
  const i = k.findIndex(p => Math.abs(p.t - l) <= kfEps());
  if (i >= 0) { k[i].v = v; return; }
  const prev = k.filter(p => p.t < l).pop(), n = { t: l, v };
  if (prev && prev.e && prev.e !== 'linear') n.e = prev.e;
  k.push(n); k.sort((a, b) => a.t - b.t);
}
// keys of c (every animated prop, or just key) within one frame of local time l
const kfKeysAt = (c, l, key) => (key ? [key] : Object.keys(c.kf || {})).flatMap(p => (kfOf(c, p) || []).filter(q => Math.abs(q.t - l) <= kfEps()));
// set the easing of those keys: one undo step
function setKfEase(c, l, e, key) {
  const ks = kfKeysAt(c, l, key); if (!ks.length) return false;
  if (!unlockedC(c)) { toast('Track is locked.', 2000); return false; }
  for (const q of ks) { if (e === 'linear') delete q.e; else q.e = e; }
  commit(); renderInspector(true); return true;
}
function easeMenu(x, y, c, l, key) {
  const ks = kfKeysAt(c, l, key); if (!ks.length) return;
  const cur = ks.every(q => (q.e || 'linear') === (ks[0].e || 'linear')) ? ks[0].e || 'linear' : null, locked = !unlockedC(c);
  ctxMenu(x, y, [...EASE_NAMES.map(([e, lbl]) => ({ label: (cur === e ? '✓ ' : '') + lbl, disabled: locked, fn: () => setKfEase(c, l, e, key) })),
    { label: (ks.some(q => isCurve(q.e)) ? '✓ ' : '') + 'Custom curve… (graph editor)', disabled: locked, fn: () => graphEditor(c, key) }]);
}
// sorted distinct key times of c (one prop, or all) inside the clip
const kfTimes = (c, key) => [...new Set((key ? [key] : Object.keys(c.kf || {})).flatMap(p => (kfOf(c, p) || []).map(q => q.t)))].filter(t => t >= -1e-6 && t <= c.dur + 1e-6).sort((a, b) => a - b);
// move the playhead to the previous (dir -1) or next (+1) keyframe of c; returns false when there is none
function jumpKf(c, dir, key) {
  if (!c) return false;
  const l = playhead - c.start, eps = kfEps(), ts = kfTimes(c, key);
  const t = dir < 0 ? ts.filter(q => q < l - eps).pop() : ts.find(q => q > l + eps);
  if (t === undefined) { toast(dir < 0 ? 'No earlier keyframe.' : 'No later keyframe.', 1500); return false; }
  stop(); setPlayhead(c.start + t); updatePlayheadUI(true); return true;
}
// writes a property; if it is animated, writes a keyframe at the playhead instead of the base value
function setProp(c, key, v) { if (kfOf(c, key)) upsertKf(c, key, clamp(playhead - c.start, 0, c.dur), v); else c.props[key] = v; }
function toggleKf(c, key) {
  const l = playhead - c.start;
  if (l < -1e-6 || l > c.dur + 1e-6) { toast('Move the playhead onto the clip to set a keyframe.', 2500); return; }
  const i = kfIndexAt(c, key, l);
  if (i >= 0) { const v = c.kf[key][i].v; c.kf[key].splice(i, 1); if (!c.kf[key].length) { delete c.kf[key]; c.props[key] = v; } }
  else upsertKf(c, key, clamp(l, 0, c.dur), +val(c, key, playhead).toFixed(2));
  commit(); renderInspector(true);
}
const hasKf = (c) => !!c.kf && Object.keys(c.kf).some(k => c.kf[k].length);
// drop all keyframes, keeping each animated prop at its value under the playhead (props may hold a stale base value)
function clearKeyframes(c) { for (const key of Object.keys(c.kf || {})) if (c.kf[key].length) c.props[key] = +val(c, key, playhead).toFixed(2); delete c.kf; }
// Fit / Fill: sets the aspect mode (what 100 % means) and resets scale/x/y through setProp, so animated ones get a key at the playhead
function fitFill(c, mode) {
  if (FIT_MODES.some(f => f[0] === mode)) c.props.fitMode = mode;
  setProp(c, 'scale', typeof mode === 'number' ? mode : 100); setProp(c, 'x', 0); setProp(c, 'y', 0); commit(); renderInspector(true);
}
const FIT_MODES = [['fit', 'Fit inside'], ['blur', 'Fit + blurred background'], ['fill', 'Fill frame'], ['stretch', 'Stretch']];
function seekTo(e, t, live) {
  const stale = live ? Math.abs(e.el.currentTime - t) > 0.04
    : (e.target === undefined || Math.abs(e.target - t) > 0.001 || (!e.el.seeking && Math.abs(e.el.currentTime - t) > 0.05));
  if (stale) { e.target = t; try { e.el.currentTime = t; } catch {} }
}
function syncMedia() {
  const t = playhead, tails = tailsAt(t);
  for (const c of state.clips) {
    if (!hasSource(c)) continue;
    const tl = c.type === 'video' && tails.has(c.id);              // a dissolve / push still shows this clip after its end (silent)
    const active = (t >= c.start && t < c.start + c.dur) || tl;
    if (!active) {
      const soon = playing && c.start > t && c.start - t < 1.5;
      const e = soon ? getEl(c) : els.get(c.id);
      if (e) { if (!e.el.paused) e.el.pause(); if (soon) seekTo(e, c.in); }   // pre-roll upcoming clips
      continue;
    }
    const e = getEl(c); if (!e) continue;
    const raw = c.in + (t - c.start) * c.speed, want = tl ? tailSrcT(c, t) : raw, held = want < raw - 1e-6;   // held: past the end of the media
    const el = e.el, tr = trackById(c.track), kp = c.props.keepPitch !== false;
    if (el.preservesPitch !== kp) el.preservesPitch = kp;
    const g = tl ? 0 : (tr && tr.muted ? 0 : 1) * trackGain(tr) * (val(c, 'volume', t) / 100) * fadeFactor(c, t) * duckFactor(c, t);
    setChain(e, c.props);
    if (e.gain) rampGain(e, g, actx.currentTime); else el.volume = clamp(g, 0, 1);
    if (playing && !held) {
      if (el.paused) { e.nudge = 0; seekTo(e, want, true); el.play().catch(() => {}); }
      else if (!el.seeking) {
        const n = driftNudge(el.currentTime - want, c.speed, e.nudge || 0);
        if (n === null) { e.nudge = 0; e.target = want; el.currentTime = want; } else e.nudge = n;
      }
    } else { e.nudge = 0; if (!el.paused) el.pause(); seekTo(e, want); }
    const rate = c.speed * (1 + (e.nudge || 0));
    if (Math.abs(el.playbackRate - rate) > 1e-6) el.playbackRate = rate;
  }
}
/* Drift correction while playing (drift = element time − timeline time, in source seconds). Returns the playbackRate
   nudge (fraction of speed, ±5% max) that pulls a 40–300 ms drift back in, 0 once within 20 ms, the old nudge in
   between, or null when the drift is too big and needs a hard seek. Quantised to 0.5% so the rate is not reset every frame. */
function driftNudge(drift, speed, cur) {
  const a = Math.abs(drift);
  if (a > 0.3 * Math.max(1, speed)) return null;
  if (a < 0.02) return 0;
  if (a <= 0.04) return cur;
  return Math.round(clamp(-drift * 0.5 / Math.max(1, speed), -0.05, 0.05) * 200) / 200;
}
// gain changes glide (~10 ms time constant) instead of jumping every frame, which is heard as zipper noise
function rampGain(e, g, now) {
  if (e.lastG === g) return;
  const p = e.gain.gain;
  if (e.lastG === undefined) p.setValueAtTime(g, now); else p.setTargetAtTime(g, now, 0.01);   // starts from wherever the last glide is
  e.lastG = g;
}

// ───────────────────────── compositor ─────────────────────────
function filterStr(p) {
  let f = '';
  if (p.brightness !== 100) f += `brightness(${p.brightness}%) `;
  if (p.contrast !== 100) f += `contrast(${p.contrast}%) `;
  if (p.saturate !== 100) f += `saturate(${p.saturate}%) `;
  if (p.hue) f += `hue-rotate(${p.hue}deg) `;
  if (p.gray) f += `grayscale(${p.gray}%) `;
  if (p.sepia) f += `sepia(${p.sepia}%) `;
  if (p.blur) f += `blur(${p.blur}px) `;
  return f || 'none';
}
// ── per-clip effects: the clip is drawn alone on a layer, then these run on that layer ──
let fxCv = null, fxTmpCv = null, noiseTile = null, fxF16 = false;
function fxCtx(W, H) {
  if (!fxCv) {                                                  // float16 layer: motion-blur samples add up without 8-bit rounding
    fxCv = document.createElement('canvas');
    try { fxF16 = fxCv.getContext('2d', { colorType: 'float16' })?.getContextAttributes?.().colorType === 'float16'; } catch { fxF16 = false; }
  }
  if (fxCv.width !== W || fxCv.height !== H) { fxCv.width = W; fxCv.height = H; }
  const g = fxCv.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.clearRect(0, 0, W, H);
  return g;
}
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  noiseTile = document.createElement('canvas'); noiseTile.width = noiseTile.height = 256;
  const g = noiseTile.getContext('2d'), im = g.createImageData(256, 256); let seed = 12345;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;   // fixed seed: grain is reproducible
  for (let i = 0; i < im.data.length; i += 4) { const v = rnd() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = rnd() * 255; }
  g.putImageData(im, 0, 0); return noiseTile;
}
// ── colour grade + chroma key: one pixel pass over the clip's own layer (preview and Fast export both draw through here) ──
const GRADE_KEYS = ['temp', 'tint', 'vibrance', 'lift', 'gamma', 'gain', 'split'];
const lutOn = (p) => GRADE_KEYS.some(k => +p[k]);
// per-colour saturation (HSL): [prop, label, hue centre °, swatch]; −100 = grey, 0 = unchanged, +100 = double
const HSL_COLORS = [['satRed', 'Reds', 0, '#e5484d'], ['satOrange', 'Oranges', 30, '#f08c2e'], ['satYellow', 'Yellows', 60, '#e8d23a'], ['satGreen', 'Greens', 120, '#46b450'],
  ['satAqua', 'Aquas', 180, '#3cc8c8'], ['satBlue', 'Blues', 225, '#3d7bf0'], ['satPurple', 'Purples', 270, '#9b59e6'], ['satMagenta', 'Magentas', 315, '#e04fb4']];
const HSL_KEYS = HSL_COLORS.map(c => c[0]);
const satOn = (p) => HSL_KEYS.some(k => +p[k]);
const gradeOn = (p) => lutOn(p) || satOn(p);                     // all 0 (or missing) = neutral: no layer, no pass
// hue (0–359 °) -> saturation factor; neighbouring colours blend smoothly, so there are no hard edges between ranges
function satTable(p) {
  return pxCached('h' + HSL_KEYS.map(k => +p[k] || 0).join(','), () => {
    const T = new Float64Array(360), cs = HSL_COLORS.map(([k, , h]) => [h, clamp(+p[k] || 0, -100, 100) / 100]);
    for (let h = 0; h < 360; h++) {
      let i = cs.length - 1; while (i > 0 && cs[i][0] > h) i--;
      const [h0, s0] = cs[i], [h1, s1] = cs[(i + 1) % cs.length], span = ((h1 - h0 + 360) % 360) || 360, u = smooth(((h - h0 + 360) % 360) / span);
      T[h] = 1 + s0 + (s1 - s0) * u;
    }
    return T;
  });
}
const keyOn = (p) => p.fxKey > 0;
const pxCache = new Map();                                       // value hash -> LUT / key constants; clips with equal settings share one
function pxCached(h, make) { let v = pxCache.get(h); if (!v) { if (pxCache.size > 64) pxCache.clear(); pxCache.set(h, v = make()); } return v; }
// per-channel LUT: white balance (temp R↔B, tint G↔magenta), lift / gamma / gain, split tone (teal shadows, orange highlights)
function gradeLut(p) {
  return pxCached('g' + GRADE_KEYS.map(k => +p[k] || 0).join(','), () => {
    const n = (k) => clamp(+p[k] || 0, -100, 100) / 100, t = n('temp'), ti = n('tint'), lift = n('lift') * 0.25, gam = Math.pow(2, -n('gamma')), gain = 1 + n('gain') * 0.5, sp = clamp(n('split'), 0, 1) * 0.12;
    const wb = [1 + 0.22 * t + 0.06 * ti, 1 - 0.14 * ti, 1 - 0.22 * t + 0.06 * ti], teal = [-1, 0.25, 0.7], orange = [0.8, 0.2, -0.8], L = new Uint8ClampedArray(768);
    for (let ch = 0; ch < 3; ch++) for (let i = 0; i < 256; i++) {
      let v = Math.min(1, i / 255 * wb[ch]); v += lift * (1 - v); v = Math.pow(Math.max(0, v), gam) * gain;
      if (sp) { const u = clamp(v, 0, 1); v += sp * ((1 - u) * (1 - u) * teal[ch] + u * u * orange[ch]); }
      L[ch * 256 + i] = Math.round(v * 255);
    }
    return L;
  });
}
// key constants: the key colour's direction in the CbCr plane; m = (along − across) / |key| is 1 on the key colour, 0 on greys
function keyParams(p) {
  const col = /^#[0-9a-f]{6}$/i.test(p.fxKeyColor || '') ? p.fxKeyColor : '#00b140';
  return pxCached(`k${col}|${p.fxKey}|${p.fxKeySoft}|${p.fxKeySpill}`, () => {
    const v = parseInt(col.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 0.564 * (b - y), cr = 0.713 * (r - y), K = Math.max(1, Math.hypot(cb, cr)), w = 0.02 + clamp(p.fxKeySoft ?? 20, 0, 100) / 100 * 0.4;
    return { ux: cb / K, uy: cr / K, K, thr: 1 - clamp(p.fxKey, 0, 100) / 100 * 0.9, w, sp: clamp(p.fxKeySpill ?? 50, 0, 100) / 100 };
  });
}
function pixelPass(g, W, H, p) {
  const L = lutOn(p) && gradeLut(p), T = satOn(p) && satTable(p), kp = keyOn(p) && keyParams(p); if (!L && !T && !kp) return;
  const im = g.getImageData(0, 0, W, H), d = im.data, vib = clamp(+p.vibrance || 0, -100, 100) / 100;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;                                    // outside the clip
    let r = d[i], gg = d[i + 1], b = d[i + 2];
    if (L) {
      r = L[r]; gg = L[256 + gg]; b = L[512 + b];
      if (vib) { const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), k = 1 + vib * (1 - (mx - mn) / 255), y = (r + gg + b) / 3; r = y + (r - y) * k; gg = y + (gg - y) * k; b = y + (b - y) * k; }   // boosts dull colours most
    }
    if (T) {                                                    // per-colour saturation: scale the colour away from / towards its grey (same brightness)
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b), dd = mx - mn;
      if (dd > 0) {
        const h = mx === r ? (gg - b) / dd + (gg < b ? 6 : 0) : mx === gg ? (b - r) / dd + 2 : (r - gg) / dd + 4;
        const k = T[Math.min(359, Math.floor(h * 60))];
        if (k !== 1) { const y = 0.299 * r + 0.587 * gg + 0.114 * b; r = y + (r - y) * k; gg = y + (gg - y) * k; b = y + (b - y) * k; }
      }
    }
    if (kp) {
      const y = 0.299 * r + 0.587 * gg + 0.114 * b, cb = 0.564 * (b - y), cr = 0.713 * (r - y), along = cb * kp.ux + cr * kp.uy;
      const m = (along - Math.abs(cr * kp.ux - cb * kp.uy)) / kp.K, a = m >= kp.thr ? 0 : m <= kp.thr - kp.w ? 1 : (kp.thr - m) / kp.w;
      if (a < 1) d[i + 3] *= a;
      if (kp.sp && along > 0) {                                  // spill: remove part of the key colour's component from what is left
        const s = kp.sp * along, cb2 = cb - s * kp.ux, cr2 = cr - s * kp.uy;
        r = y + 1.403 * cr2; b = y + 1.773 * cb2; gg = y - 0.344 * cb2 - 0.714 * cr2;
      }
    }
    d[i] = r; d[i + 1] = gg; d[i + 2] = b;
  }
  g.putImageData(im, 0, 0);
}
function applyFx(g, W, H, p, t) {
  g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.globalAlpha = 1; g.shadowColor = 'transparent'; g.globalCompositeOperation = 'source-over';
  pixelPass(g, W, H, p);                                        // grade, then key: the key sees the colours the eyedropper sampled
  applyFxMore(g, W, H, p, t);                                   // wave warp, RGB split, light leak, gradient overlay (layers.js)
  if (p.fxPixel > 0) {
    const n = 2 + p.fxPixel / 100 * W * 0.03, w2 = Math.max(1, Math.round(W / n)), h2 = Math.max(1, Math.round(H / n));
    if (!fxTmpCv) fxTmpCv = document.createElement('canvas'); fxTmpCv.width = w2; fxTmpCv.height = h2;
    fxTmpCv.getContext('2d').drawImage(g.canvas, 0, 0, w2, h2);
    g.clearRect(0, 0, W, H); g.imageSmoothingEnabled = false; g.drawImage(fxTmpCv, 0, 0, w2, h2, 0, 0, W, H); g.imageSmoothingEnabled = true;
  }
  if (p.fxGlow > 0) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = p.fxGlow / 100 * 0.8; g.filter = `blur(${(W * 0.012).toFixed(1)}px)`; g.drawImage(g.canvas, 0, 0); g.restore(); }
  g.globalCompositeOperation = 'source-atop';                   // from here on, only touch pixels the clip covers
  if (p.fxTint > 0) { g.globalAlpha = p.fxTint / 100 * 0.6; g.fillStyle = p.fxTintColor || '#ff8a3d'; g.fillRect(0, 0, W, H); }
  if (p.fxVignette > 0) {
    const d = Math.hypot(W, H) / 2, gr = g.createRadialGradient(W / 2, H / 2, d * 0.45, W / 2, H / 2, d);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${(p.fxVignette / 100 * 0.9).toFixed(3)})`);
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  if (p.fxGrain > 0) {
    const fi = Math.floor(t * state.settings.fps), ox = (fi * 73) % 256, oy = (fi * 151) % 256, sc = Math.max(1, W / 1280);
    g.save(); g.globalAlpha = p.fxGrain / 100 * 0.45; g.scale(sc, sc); g.translate(-ox, -oy);
    g.fillStyle = g.createPattern(getNoiseTile(), 'repeat'); g.fillRect(0, 0, W / sc + 256, H / sc + 256); g.restore();
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
}
// ── text layout: lines after word wrap (boxWidth, sequence px; 0 = only hard breaks) with each word's offset ──
// Cached per (text, font, size, spacing, width). A wrap drops exactly one space, so character counts match the text.
const TEXT_ANIMS = ['typewriter', 'wordpop', 'linerise'];       // per-unit presets: text clips only
const textWeight = (p) => (+p.weight >= 100 ? Math.round(clamp(+p.weight, 100, 900) / 100) * 100 : p.bold ? 700 : 400);
const textFont = (p) => `${p.italic ? 'italic ' : ''}${textWeight(p)} ${p.size}px "${String(p.font).replace(/["\\]/g, '')}", sans-serif`;
const layoutCache = new Map();
function textLayout(p, g) {
  const font = textFont(p), ls = +p.letterSpacing || 0, bw = Math.max(0, +p.boxWidth || 0), text = p.caps ? String(p.text).toUpperCase() : String(p.text);
  const key = JSON.stringify([text, font, ls, bw]);
  let L = layoutCache.get(key); if (L) return L;
  g.font = font; g.letterSpacing = ls + 'px';
  const m = (s) => g.measureText(s).width, rows = [];
  for (const para of text.split('\n')) {
    if (!bw) { rows.push(para); continue; }
    let cur = null;
    for (const w of para.split(' ')) { const t = cur === null ? w : cur + ' ' + w; if (cur !== null && cur !== '' && m(t) > bw) { rows.push(cur); cur = w; } else cur = t; }
    rows.push(cur ?? '');
  }
  let ci = 0, wi = 0, mw = 0;
  const lines = rows.map(s => {
    const words = [...s.matchAll(/\S+/g)].map(r => ({ s: r[0], x: m(s.slice(0, r.index)), w: m(r[0]), i: wi++ }));
    const l = { s, w: m(s), ci, words }; ci += s.length + 1; mw = Math.max(mw, l.w); return l;
  });
  L = { font, ls, lines, mw, nWords: wi };
  if (layoutCache.size > 300) layoutCache.clear();
  layoutCache.set(key, L); return L;
}
// unit i of n: local progress 0–1 at time t (s) into a clip of length dur; units start staggered, each takes D s
function unitU(i, n, t, dur, D, stag) { const st = Math.min(stag, Math.max(0, dur * 0.7 - D) / Math.max(1, n - 1)); return clamp((t - i * st) / D, 0, 1); }
// P (clipPose): reveal = characters shown (typewriter); tAnim = {mode 'wordpop' | 'linerise', t, dur}.
// The layout always uses the full text so nothing shifts while it animates.
function drawText(c, ctx, P = {}) {
  const p = c.props, L = textLayout(p, ctx), lh = p.size * (+p.lineHeight || 1.2), mw = L.mw;
  ctx.font = L.font; ctx.letterSpacing = L.ls + 'px'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const th = lh * L.lines.length, pad = p.size * (p.bgPad ?? 30) / 100, padY = pad * 0.6;
  if (p.bgOn) {
    const bw = mw + pad * 2, bh = th + padY * 2, r = clamp(+p.bgRadius || 0, 0, Math.min(bw, bh) / 2);
    ctx.fillStyle = p.bg; ctx.beginPath(); ctx.roundRect(-mw / 2 - pad, -th / 2 - padY, bw, bh, r); ctx.fill();
  }
  let fill = p.color;
  if (p.gradOn) {                                               // gradient across the text box; 0° = left → right, 90° = top → bottom
    const an = (+p.gradAngle || 0) * Math.PI / 180, dx = Math.cos(an), dy = Math.sin(an), h = Math.abs(mw / 2 * dx) + Math.abs(th / 2 * dy) || 1;
    fill = ctx.createLinearGradient(-dx * h, -dy * h, dx * h, dy * h); fill.addColorStop(0, p.color); fill.addColorStop(1, p.color2 || p.color);
  }
  if (p.shadow) { ctx.shadowColor = 'rgba(0,0,0,.65)'; ctx.shadowBlur = p.size * 0.08; ctx.shadowOffsetY = p.size * 0.04; }
  const ink = (s, x, y) => {
    if (p.strokeW > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = p.strokeW; ctx.strokeStyle = p.stroke; ctx.strokeText(s, x, y); }
    ctx.fillStyle = fill; ctx.fillText(s, x, y);
  };
  const ga = ctx.globalAlpha, ta = P.tAnim, reveal = P.reveal ?? Infinity;
  L.lines.forEach((l, i) => {
    const y = -th / 2 + lh * (i + 0.5), x = p.align === 'left' ? -mw / 2 : p.align === 'right' ? mw / 2 - l.w : -l.w / 2;
    if (ta && ta.mode === 'wordpop') for (const w of l.words) {  // each word scales in with an overshoot, one after another
      const u = unitU(w.i, L.nWords, ta.t, ta.dur, 0.35, 0.12); if (u <= 0) continue;
      const v = u - 1, s = Math.max(0.001, 1 + 2.70158 * v * v * v + 1.70158 * v * v), cx = x + w.x + w.w / 2;
      ctx.save(); ctx.globalAlpha = ga * Math.min(1, u * 3); ctx.translate(cx, y); ctx.scale(s, s); ctx.translate(-cx, -y); ink(w.s, x + w.x, y); ctx.restore();
    }
    else if (ta && ta.mode === 'linerise') {                    // each line slides up and fades in
      const u = unitU(i, L.lines.length, ta.t, ta.dur, 0.5, 0.18); if (u <= 0) return;
      const e = 1 - (1 - u) ** 3; ctx.globalAlpha = ga * u; ink(l.s, x, y + (1 - e) * lh * 0.6); ctx.globalAlpha = ga;
    }
    else ink(reveal === Infinity ? l.s : l.s.slice(0, Math.max(0, reveal - l.ci)), x, y);
  });
  ctx.shadowColor = 'transparent'; ctx.letterSpacing = '0px';
  const sw = (p.strokeW > 0 ? p.strokeW / 2 : 0);
  return { hw: mw / 2 + (p.bgOn ? pad : sw), hh: th / 2 + (p.bgOn ? padY : sw) };
}
// ── transitions between adjacent clips (dissolve, push): the clip that ends exactly where c starts on its track ──
const PAIR_TRANS = ['dissolve', 'push'];
const DIRV = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] };   // transDir → the way the edge / picture travels
const smooth = (u) => u * u * (3 - 2 * u);
function predOf(c) { const e = kfEps(); return state.clips.find(k => k !== c && k.track === c.track && k.type !== 'audio' && Math.abs(k.start + k.dur - c.start) <= e) || null; }
// {pr, q, style} while c's dissolve / push runs at t, else null
function pairAt(c, t) {
  const p = c.props, l = t - c.start;
  if (!PAIR_TRANS.includes(p.transIn) || !(p.fadeIn > 0) || l < 0 || l >= Math.min(p.fadeIn, c.dur)) return null;
  const pr = predOf(c); return pr ? { c, pr, q: clamp(l / p.fadeIn, 0, 1), style: p.transIn } : null;
}
// every predecessor shown as a tail at t: Map pr.id -> pairAt result
function tailsAt(t) {
  const m = new Map();
  for (const c of state.clips) if (c.type !== 'audio' && t >= c.start && t < c.start + c.dur) { const pa = pairAt(c, t); if (pa) m.set(pa.pr.id, pa); }
  return m;
}
// source time of a tail: the footage after the out-point when the media has it, else the last frame held
function tailSrcT(pr, t) {
  const m = media.get(pr.mediaId), raw = pr.in + (t - pr.start) * pr.speed;
  return m && m.dur ? Math.min(raw, Math.max(0, m.dur - 1 / state.settings.fps)) : raw;
}
// Where and how a clip sits in the frame at time t (keyframes + transitions + shake + motion presets).
// Returned x/y are sequence pixels from the top-left, rot is radians, s is the final scale factor.
// wipe = [x0, y0, x1, y1] as fractions of the clip's on-screen box; iris / clock = progress 0–1 around its centre.
// tail = {dx, dy, a}: c drawn past its end under a dissolve / push (its own out-transition is skipped).
function clipPose(c, t, W, H, tail) {
  const p = c.props, local = t - c.start;
  let a = val(c, 'opacity', t) / 100, dx = 0, dy = 0, zs = 1, wipe = null, iris = null, clock = null, whip = false, tBlur = 0, spin = 0, tBright = 1;
  const ease = smooth, [vx, vy] = DIRV[p.transDir] || DIRV.right;
  const wf = [0, 0, 1, 1];                                      // wipe in and out intersect when their ranges overlap
  // transition in (dir -1) and out (dir +1); u runs 0 → 1 as the clip becomes fully present
  for (const [dur, style, u, dir] of [[p.fadeIn, p.transIn || 'fade', local / p.fadeIn, -1], [p.fadeOut, p.transOut || 'fade', (c.dur - local) / p.fadeOut, 1]]) {
    if (!(dur > 0) || u >= 1 || (tail && dir > 0)) continue;
    const q = clamp(u, 0, 1);
    const slide = (e) => { dx += dir * vx * (1 - e) * W; dy += dir * vy * (1 - e) * H; };
    if (style === 'fade' || style === 'dissolve' || (style === 'push' && (dir > 0 || !predOf(c)))) a *= q;   // dissolve: c's half of the mix
    else if (style === 'wipe') {                                // the edge travels along transDir across the clip's box
      const ax = vx ? 0 : 1;
      if ((dir < 0) === (vx + vy > 0)) wf[ax + 2] = Math.min(wf[ax + 2], q); else wf[ax] = Math.max(wf[ax], 1 - q);
      wipe = wf;
    }
    else if (style === 'slide' || style === 'push') slide(ease(q));
    else if (style === 'whip') { slide(ease(clamp((q - 0.15) / 0.7, 0, 1))); whip = true; }   // fast move in the middle, blurred
    else if (style === 'zoom') { zs *= 0.6 + 0.4 * ease(q); a *= q; }
    else if (style === 'blur') { tBlur += (1 - q) * W * 0.02; a *= Math.min(1, q * 1.5); }
    else if (style === 'iris') iris = iris === null ? q : Math.min(iris, q);
    else if (style === 'clock') clock = clock === null ? q : Math.min(clock, q);
    else if (style === 'spin') { spin += dir * (1 - ease(q)) * 120; zs *= 0.3 + 0.7 * ease(q); a *= q; }
    else if (style === 'bounce') { const v = q - 1; slide(1 + 2.70158 * v * v * v + 1.70158 * v * v); }   // overshoots, then settles
    else if (style === 'drop') {                                // falls in from above and bounces
      let v = q, b; const n1 = 7.5625, d1 = 2.75;
      if (v < 1 / d1) b = n1 * v * v; else if (v < 2 / d1) { v -= 1.5 / d1; b = n1 * v * v + 0.75; } else if (v < 2.5 / d1) { v -= 2.25 / d1; b = n1 * v * v + 0.9375; } else { v -= 2.625 / d1; b = n1 * v * v + 0.984375; }
      dy -= (1 - b) * H; a *= Math.min(1, q * 4);
    }
    else if (style === 'roll') { slide(ease(q)); spin += dir * (1 - ease(q)) * 360; }
    else if (style === 'split') {                               // barn doors: opens from the centre line outwards
      const ax = vx ? 0 : 1, h = (1 - q) / 2;
      wf[ax] = Math.max(wf[ax], h); wf[ax + 2] = Math.min(wf[ax + 2], 1 - h); wipe = wf;
    }
    else if (style === 'zoomout') { zs *= 1 + 0.8 * (1 - ease(q)); a *= q; }
    else if (style === 'flash') { tBright = Math.max(tBright, 1 + 4 * (1 - q)); a *= Math.min(1, q * 3); }
    else if (style === 'glitch') {                              // deterministic in t so preview and export match
      const fr = Math.floor(t * 30), hs = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };
      const k = 1 - q;
      dx += (hs(fr) - 0.5) * W * 0.12 * k; dy += (hs(fr + 7.1) - 0.5) * H * 0.04 * k;
      a *= hs(fr + 3.3) < 0.3 * k ? 0 : Math.min(1, q * 2 + 0.2);
    }
    else if (style === 'spinblur') { spin += dir * (1 - ease(q)) * 180; tBlur += (1 - q) * W * 0.015; zs *= 0.7 + 0.3 * ease(q); a *= q; }
  }
  if (tail) { dx += tail.dx; dy += tail.dy; a *= tail.a; }
  if (p.fxShake > 0) {                                          // deterministic in t, so preview and export match
    const k = p.fxShake / 100 * W * 0.02;
    dx += k * (Math.sin(t * 37.7) + Math.sin(t * 23.1 + 1.3)) / 2; dy += k * (Math.sin(t * 31.3 + 2) + Math.sin(t * 19.7 + 0.5)) / 2;
  }
  // motion presets: functions of the time since the clip started (L, seconds), so they need no keyframes
  const an = p.anim || 'none', L = Math.max(0, local); let reveal = Infinity, tAnim = null;
  if (an === 'pop') { const u = clamp(L / 0.5, 0, 1) - 1; zs *= Math.max(0.001, 1 + 2.70158 * u * u * u + 1.70158 * u * u); }        // overshoot, settles at 0.5 s
  else if (an === 'drop') {                                     // falls in from above and bounces, settles at 0.7 s
    let u = clamp(L / 0.7, 0, 1), bnc; const n1 = 7.5625, d1 = 2.75;
    if (u < 1 / d1) bnc = n1 * u * u; else if (u < 2 / d1) { u -= 1.5 / d1; bnc = n1 * u * u + 0.75; } else if (u < 2.5 / d1) { u -= 2.25 / d1; bnc = n1 * u * u + 0.9375; } else { u -= 2.625 / d1; bnc = n1 * u * u + 0.984375; }
    dy -= (1 - bnc) * H * 0.7;
  }
  else if (an === 'float') dy += Math.sin(L * 2 * Math.PI / 3) * H * 0.015;
  else if (an === 'pulse') zs *= 1 + 0.05 * Math.sin(L * 2 * Math.PI);
  else if (an === 'wiggle') spin += 4 * Math.sin(L * 2 * Math.PI / 0.6);
  else if (an === 'spin') spin += 360 * L / 4;
  else if (an === 'kenburns') zs *= 1 + 0.15 * clamp(L / c.dur, 0, 1);
  else if (an === 'kenburnsOut') zs *= 1.15 - 0.15 * clamp(L / c.dur, 0, 1);
  else if (an === 'typewriter' && c.type === 'text') { const n = String(p.text).length; reveal = Math.floor(clamp(L / Math.min(c.dur * 0.6, Math.max(0.6, n * 0.05)), 0, 1) * n); }
  else if ((an === 'wordpop' || an === 'linerise') && c.type === 'text') tAnim = { mode: an, t: L, dur: c.dur };   // drawText staggers the units
  const s = Math.max(0.001, val(c, 'scale', t) / 100 * zs);
  return { a, wipe, iris, clock, whip, tBlur, tBright, reveal, tAnim, s, x:W / 2 + val(c, 'x', t) + dx, y: H / 2 + val(c, 'y', t) + dy, rot: (val(c, 'rot', t) + spin) * Math.PI / 180 };
}
// o.dst: context to composite into (default the monitor); o.op: its composite operation; o.tail: see clipPose (no hit box)
function drawClip(c, o = {}) {
  if (c.type === 'adjust') return drawAdjust(c, o.dst || ctx);   // adjustment layer: works on what is already drawn below it
  const W = cv.width, H = cv.height, p = c.props, t = playhead, D = o.dst || ctx, op = o.op || blendOp(p);
  const P = clipPose(c, t, W, H, o.tail), a = P.a;
  let src = null, sw = 0, sh = 0;
  const sourced = c.type === 'video' || c.type === 'image';
  if (c.type === 'video' && offline) { const f = offline.frames.get(c.id); if (!f) return; src = f.img; sw = f.w; sh = f.h; }
  else if (c.type === 'video') { const e = getEl(c); if (!e || e.el.readyState < 2) return; src = e.el; sw = src.videoWidth; sh = src.videoHeight; }
  else if (c.type === 'image') { const m = media.get(c.mediaId); if (!m || !m.img) return; src = m.img; sw = m.w; sh = m.h; }
  if (sourced && (!sw || !sh)) return;
  // Motion blur: average the clip over the shutter interval — N poses spread across this frame's exposure,
  // added together at 1/N each. Shutter 180° = exposed for half the frame time, 360° = the whole frame time.
  let poses = [P];
  if ((p.mbOn && p.mbShutter > 0) || P.whip) {                  // a whip transition always streaks (360° shutter)
    const N = P.whip && !p.mbOn ? 8 : [4, 8, 16, 32].includes(p.mbSamples) ? p.mbSamples : 8, span = (P.whip ? Math.max(360, p.mbOn ? p.mbShutter : 0) : p.mbShutter) / 360 / state.settings.fps;
    const first = clipPose(c, t - span / 2, W, H, o.tail), last = clipPose(c, t + span / 2, W, H, o.tail);
    if (Math.abs(first.x - last.x) > 0.25 || Math.abs(first.y - last.y) > 0.25 || Math.abs(first.rot - last.rot) > 0.0005 || Math.abs(first.s - last.s) > 0.0005) {   // only when it actually moves
      poses = [first]; for (let i = 1; i < N - 1; i++) poses.push(clipPose(c, t - span / 2 + span * i / (N - 1), W, H, o.tail)); poses.push(last);
    }
  }
  const blurOn = poses.length > 1, masked = p.radius > 0 || p.feather > 0, shaped = !!P.wipe || P.iris !== null || P.clock !== null;
  const shapeMasked = !!p.maskShape && p.maskShape !== 'none', is3d = needs3d(c, t), post = p.fxShadow > 0 || p.fxStrokeW > 0;
  const fxOn = blurOn || masked || shaped || shapeMasked || is3d || fxMoreOn(p) || !!(p.fxVignette || p.fxTint || p.fxGrain || p.fxGlow || p.fxPixel) || keyOn(p) || gradeOn(p);
  const g = fxOn ? fxCtx(W, H) : D;                             // effects, masks, shaped transitions and motion blur need the clip on its own layer
  const xf = (k, q) => { k.translate(q.x, q.y); k.rotate(q.rot); k.scale(q.s * (p.flipH ? -1 : 1), q.s * (p.flipV ? -1 : 1)); };
  let fs = filterStr(p); if (P.tBlur > 0) fs = (fs === 'none' ? '' : fs) + `blur(${P.tBlur.toFixed(1)}px)`;
  if (P.tBright > 1) fs = (fs === 'none' ? '' : fs + ' ') + `brightness(${P.tBright.toFixed(2)})`;
  if (sourced && p.fitMode === 'blur' && a > 0) {               // blurred, zoomed copy filling the frame behind the clip (vertical-video look)
    const f = Math.max(W / sw, H / sh) * 1.15, bw = sw * f, bh = sh * f;
    D.save(); D.globalAlpha = clamp(a, 0, 1); D.filter = `blur(${Math.round(Math.max(W, H) / 40)}px) brightness(0.75)`;
    D.drawImage(src, (W - bw) / 2, (H - bh) / 2, bw, bh); D.restore();
  }
  let b;
  for (const [i, q] of poses.entries()) {
  g.save();
  if (!fxOn) { g.globalAlpha = clamp(a, 0, 1); g.globalCompositeOperation = op; }
  else if (blurOn && fxF16) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / poses.length; }
  else if (blurOn) g.globalAlpha = 1 / (i + 1);                 // 8-bit fallback: running average, rounding error stays bounded
  xf(g, q);
  g.filter = fs;
  if (c.type === 'text') b = drawText(c, g, q);
  else if (c.type === 'sticker') {
    g.font = '300px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
    if (a > 0) g.fillText(p.glyph || '⭐', 0, 20);
    b = { hw: 200, hh: 200 };
  }
  else if (c.type === 'solid') { if (a > 0) { g.fillStyle = p.color || '#1e6fd9'; g.fillRect(-W / 2, -H / 2, W, H); } b = { hw: W / 2, hh: H / 2 }; }
  else {
    const [fx, fy] = fitFactors(p.fitMode, W, H, sw, sh);      // 100 % scale = the aspect mode; keyframed scale stays relative to it
    const cx = sw * p.cropL / 100, cy = sh * p.cropT / 100;
    const cw = sw * (1 - (p.cropL + p.cropR) / 100), ch = sh * (1 - (p.cropT + p.cropB) / 100);
    if (cw > 0 && ch > 0 && a > 0) g.drawImage(src, cx, cy, cw, ch, (cx - sw / 2) * fx, (cy - sh / 2) * fy, cw * fx, ch * fy);
    const x0 = (cx - sw / 2) * fx, y0 = (cy - sh / 2) * fy;     // only the cropped part counts for the box
    b = { hw: sw * fx / 2, hh: sh * fy / 2, r: [x0, y0, x0 + Math.max(0, cw) * fx, y0 + Math.max(0, ch) * fy] };
  }
  g.restore();
  }
  const br = b.r || [-b.hw, -b.hh, b.hw, b.hh];                 // the drawn box in clip space (before flips)
  if (fxOn) {
    applyFx(g, W, H, p, t);
    if (masked) maskLayer(g, W, H, poses, br, p, xf);
    if (shapeMasked) shapeMask(g, W, H, poses, br, c, t, xf);
    if (is3d) {                                                  // tilt / turn / depth (and text extrusion) in real perspective
      const fb = frameBox(P, br, W, H), m = Math.max(fb[2] - fb[0], fb[3] - fb[1]) * 0.12 + 20;   // content area (+ room for glow) for the no-GPU path
      const out = render3d(g.canvas, W, H, { ax: P.x, ay: P.y, rx: val(c, 'rotX', t), ry: val(c, 'rotY', t), z: val(c, 'z', t), persp: p.persp,
        box: [Math.max(0, fb[0] - m), Math.max(0, fb[1] - m), Math.min(W, fb[2] + m), Math.min(H, fb[3] + m)],
        slices: c.type === 'text' && p.ex3d && +p.exDepth > 0 ? extrudeSlices(p, P.s) : null });
      if (out) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'copy'; g.drawImage(out, 0, 0); g.restore(); }
    }
    if (post) postFx(g, W, H, p);
    D.save(); if (shaped) clipTrans(D, P, frameBox(P, br, W, H)); D.globalAlpha = clamp(a, 0, 1); D.globalCompositeOperation = op; D.drawImage(g.canvas, 0, 0); D.restore();
  }
  if (o.tail) return;                                           // a tail is never clickable
  // the rendered pose: centre (from frame centre), rotation (rad), scale and the visible box in unflipped clip space
  let r = br;
  if (p.flipH) r = [-r[2], r[1], -r[0], r[3]];
  if (p.flipV) r = [r[0], -r[3], r[2], -r[1]];
  const pose = { cx: P.x - W / 2, cy: P.y - H / 2, rot: P.rot, s: P.s, r, W, H };
  bounds.set(c.id, pose);
  if (c.id === sel && !playing && !exporting && !cleanFrame) selPose = pose;   // the overlay is drawn last, above every track
}
// per-axis factors from source pixels to clip space at 100 %: fit inside, fill (cover) or stretch to the frame
function fitFactors(mode, W, H, sw, sh) {
  if (mode === 'stretch') return [W / sw, H / sh];
  const f = (mode === 'fill' ? Math.max : Math.min)(W / sw, H / sh); return [f, f];
}
// the clip's on-screen bounding box [x0, y0, x1, y1] (frame pixels from the top-left), limited to the frame
function frameBox(P, r, W, H) {
  const co = Math.cos(P.rot), si = Math.sin(P.rot); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [lx, ly] of [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]) {
    const x = P.x + (lx * co - ly * si) * P.s, y = P.y + (lx * si + ly * co) * P.s;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [Math.max(0, x0), Math.max(0, y0), Math.min(W, x1), Math.min(H, y1)];
}
// wipe / iris / clock relative to the clip: across its box, centred on its centre
function clipTrans(k, P, [x0, y0, x1, y1]) {
  const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(w, h) / 2;
  if (P.wipe) { const [a, b, c, d] = P.wipe; k.beginPath(); k.rect(x0 + w * a, y0 + h * b, Math.max(0, w * (c - a)), Math.max(0, h * (d - b))); k.clip(); }
  if (P.iris !== null) { k.beginPath(); k.arc(cx, cy, P.iris * R, 0, Math.PI * 2); k.clip(); }
  if (P.clock !== null) { k.beginPath(); k.moveTo(cx, cy); k.arc(cx, cy, R + 2, -Math.PI / 2, -Math.PI / 2 + P.clock * Math.PI * 2); k.closePath(); k.clip(); }
}
// rounded corners + feathered edge: keep the layer only inside a (blurred) rounded box at each pose
let maskCv = null;
function maskLayer(g, W, H, poses, r, p, xf) {
  if (!maskCv) maskCv = document.createElement('canvas');
  if (maskCv.width !== W || maskCv.height !== H) { maskCv.width = W; maskCv.height = H; }
  const m = maskCv.getContext('2d'), fe = clamp(+p.feather || 0, 0, 500);
  m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over'; m.globalAlpha = 1; m.clearRect(0, 0, W, H);
  m.filter = fe > 0 ? `blur(${(fe / 2).toFixed(2)}px)` : 'none'; m.fillStyle = '#fff';
  for (const q of poses) {
    const I = fe / Math.max(q.s, 0.001), w = r[2] - r[0] - 2 * I, h = r[3] - r[1] - 2 * I;   // inset by the feather so the soft edge ends at the box
    if (w <= 0 || h <= 0) continue;
    const rr = Math.max(0, clamp(+p.radius || 0, 0, 50) / 100 * Math.min(r[2] - r[0], r[3] - r[1]) - I);
    m.save(); xf(m, q); m.beginPath(); m.roundRect(r[0] + I, r[1] + I, w, h, Math.min(rr, w / 2, h / 2)); m.restore();
    m.fill();                                                   // filled with the identity transform: the blur is in frame pixels
  }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; g.drawImage(maskCv, 0, 0); g.restore();
}
// draw c, with its predecessor's tail under a dissolve / push
let pairCv = null;
function drawPaired(c) {
  const pa = pairAt(c, playhead); if (!pa) return drawClip(c);
  const W = cv.width, H = cv.height;
  if (pa.style === 'push') { const [vx, vy] = DIRV[c.props.transDir] || DIRV.right, e = smooth(pa.q); drawClip(pa.pr, { tail: { dx: vx * e * W, dy: vy * e * H, a: 1 } }); return drawClip(c); }
  // dissolve: (1 − q)·tail + q·clip on a layer of their own ('lighter' adds the two), then over the tracks below
  if (!pairCv) pairCv = document.createElement('canvas');
  if (pairCv.width !== W || pairCv.height !== H) { pairCv.width = W; pairCv.height = H; }
  const L = pairCv.getContext('2d'); L.setTransform(1, 0, 0, 1, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = 'source-over'; L.filter = 'none'; L.clearRect(0, 0, W, H);
  drawClip(pa.pr, { dst: L, tail: { dx: 0, dy: 0, a: 1 - pa.q } }); drawClip(c, { dst: L, op: 'lighter' });
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(pairCv, 0, 0); ctx.restore();
}
// pose helpers shared by drawing and hit-testing: frame point <-> clip-space point
const toLocal = (b, px, py) => { const dx = px - b.cx, dy = py - b.cy, co = Math.cos(b.rot), si = Math.sin(b.rot); return [(dx * co + dy * si) / b.s, (dy * co - dx * si) / b.s]; };
const toFrame = (b, lx, ly) => { const co = Math.cos(b.rot), si = Math.sin(b.rot); return [b.cx + (lx * co - ly * si) * b.s, b.cy + (lx * si + ly * co) * b.s]; };
const inPose = (b, px, py) => { const [lx, ly] = toLocal(b, px, py); return lx >= b.r[0] && lx <= b.r[2] && ly >= b.r[1] && ly <= b.r[3]; };
const monU = (b) => (b.W / 1280) / Math.max(b.s, 0.01);          // one monitor pixel in clip space
// rotate handle: above the top edge, or just inside it when that would be off the frame
function rotHandle(b) {
  const mx = (b.r[0] + b.r[2]) / 2, up = b.r[1] - 40 * monU(b), [fx, fy] = toFrame(b, mx, up);
  return Math.abs(fx) <= b.W / 2 && Math.abs(fy) <= b.H / 2 ? [mx, up] : [mx, b.r[1] + 40 * monU(b)];
}
let selPose = null;
function drawOverlay(b) {
  const u = monU(b), hs = 10 * u, [x0, y0, x1, y1] = b.r, [hx, hy] = rotHandle(b);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1; ctx.shadowColor = 'transparent'; ctx.globalCompositeOperation = 'source-over';
  ctx.translate(b.W / 2 + b.cx, b.H / 2 + b.cy); ctx.rotate(b.rot); ctx.scale(b.s, b.s);
  ctx.lineWidth = 2 * u; ctx.strokeStyle = ACCENT; ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  ctx.beginPath(); ctx.moveTo(hx, y0); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.fillStyle = '#fff';
  for (const [sx, sy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]) { ctx.fillRect(sx - hs / 2, sy - hs / 2, hs, hs); ctx.strokeRect(sx - hs / 2, sy - hs / 2, hs, hs); }
  ctx.beginPath(); ctx.arc(hx, hy, 6 * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
function drawFrame() {
  const { w, h } = state.settings;
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  const vt = state.tracks.filter(t => t.kind === 'video');
  bounds.clear(); selPose = null;                               // only what is on screen now can be clicked
  const tails = tailsAt(playhead);                              // predecessors are drawn with the clip that dissolves / pushes them out
  for (let i = vt.length - 1; i >= 0; i--) {                    // bottom row first, top row last
    if (vt[i].hidden) continue;
    for (const c of state.clips) if (c.track === vt[i].id && playhead >= c.start && playhead < c.start + c.dur && !tails.has(c.id)) drawPaired(c);
  }
  if (selPose && !exporting && !cleanFrame) drawOverlay(selPose);
  if (guidesOn && !exporting && !cleanFrame) {                  // action-safe 5 %, title-safe 10 %, centre mark
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.filter = 'none'; ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = Math.max(1, w / 960);
    for (const m of [0.05, 0.1]) ctx.strokeRect(w * m, h * m, w * (1 - 2 * m), h * (1 - 2 * m));
    const k = Math.min(w, h) * 0.03; ctx.beginPath(); ctx.moveTo(w / 2 - k, h / 2); ctx.lineTo(w / 2 + k, h / 2); ctx.moveTo(w / 2, h / 2 - k); ctx.lineTo(w / 2, h / 2 + k); ctx.stroke();
  }
}
function drawMeter() {
  let pk = 0;
  if (analyser && playing) { analyser.getFloatTimeDomainData(meterBuf); for (let i = 0; i < meterBuf.length; i += 2) { const v = Math.abs(meterBuf[i]); if (v > pk) pk = v; } }
  meterLvl = Math.max(pk, meterLvl * 0.9); if (meterLvl < 0.002) meterLvl = 0;
  if (meterLvl === meterShown) return; meterShown = meterLvl;
  const g = $('#meter').getContext('2d'); g.clearRect(0, 0, 84, 10);
  const f = meterLvl > 0 ? clamp((20 * Math.log10(meterLvl) + 48) / 48, 0, 1) : 0;   // −48 dB … 0 dB
  const grad = g.createLinearGradient(0, 0, 84, 0); grad.addColorStop(0, ACCENT); grad.addColorStop(0.7, '#d8d24a'); grad.addColorStop(1, '#e5604f');
  g.fillStyle = grad; g.fillRect(0, 0, 84 * f, 10);
}
function requestRender() { needRender = true; }
function tick() {
  if (playing) {
    playhead = playT0 + (performance.now() - playW0) / 1000;
    const end = exporting ? exporting.end : projectEnd();
    if (playhead >= end) { playhead = end; const ex = exporting; stop(true); if (ex) ex.finish(); }
    if (exporting) exporting.progress(playhead);
    needRender = true; updatePlayheadUI(true);
  }
  if (needRender && !offline) { needRender = false; syncMedia(); drawFrame(); }   // the offline renderer owns the canvas while it runs
  drawMeter();
  requestAnimationFrame(tick);
}

// ───────────────────────── transport ─────────────────────────
function play() {
  const end = projectEnd(); if (!end) { toast('Add a clip to the timeline first.', 2000); return; }
  if (playhead >= end - 0.02) playhead = 0;
  ensureAudio(); playing = true; playT0 = playhead; playW0 = performance.now();
  $('#btnPlay').innerHTML = icon('pause'); requestRender();
}
function stop(keepExact) {
  if (!playing) return;
  playing = false; for (const e of els.values()) if (!e.el.paused) e.el.pause();
  if (!keepExact) playhead = frameRound(playhead);
  $('#btnPlay').innerHTML = icon('play'); updatePlayheadUI(); requestRender(); syncInspectorToPlayhead();
}
// animated values and keyframe buttons depend on the playhead
function syncInspectorToPlayhead() { const c = clipById(sel); if (c && hasKf(c) && !playing) renderInspector(); }
function setPlayhead(t) {
  playhead = Math.max(0, t);
  if (playing) { playT0 = playhead; playW0 = performance.now(); for (const e of els.values()) e.el.pause(); }
  updatePlayheadUI(); requestRender(); syncInspectorToPlayhead();
}
function stepFrames(n) { stop(); setPlayhead(frameRound(playhead) + n / state.settings.fps); }
function updatePlayheadUI(follow) {
  $('#playhead').style.left = (HEAD + playhead * pps) + 'px';
  $('#tc').textContent = tc(playhead);
  if (follow) {
    const x = playhead * pps, vw = tl.clientWidth - HEAD;
    if (x > tl.scrollLeft + vw - 20 || x < tl.scrollLeft) tl.scrollLeft = Math.max(0, x - 40);
  }
  drawRuler();
}

// ───────────────────────── timeline UI ─────────────────────────
function snapTime(t, excludeId) {
  if (snapOn) {
    const thr = 8 / pps; let best = null;
    const pts = [0, playhead, ...state.markers]; for (const o of state.clips) if (o.id !== excludeId) pts.push(o.start, o.start + o.dur);
    for (const p of pts) if (Math.abs(p - t) < thr && (best === null || Math.abs(p - t) < Math.abs(best - t))) best = p;
    if (best !== null) return best;
  }
  return frameRound(t);
}
function snapMove(start, c, moving) {     // snap either edge of a moving clip; `moving` = ids travelling with it
  if (snapOn) {
    const thr = 8 / pps; let best = null, bd = thr;
    const pts = [0, playhead, ...state.markers]; for (const o of state.clips) if (o.id !== c.id && !(moving && moving.has(o.id))) pts.push(o.start, o.start + o.dur);
    for (const p of pts) {
      if (Math.abs(p - start) < bd) { bd = Math.abs(p - start); best = p; }
      if (Math.abs(p - (start + c.dur)) < bd) { bd = Math.abs(p - (start + c.dur)); best = p - c.dur; }
    }
    if (best !== null) return Math.max(0, best);
  }
  return Math.max(0, frameRound(start));
}
function drawWave(cvs, c, m, wpx) {
  const w = Math.max(1, Math.min(3000, Math.ceil(wpx))), h = 40;
  cvs.width = w; cvs.height = h; const g = cvs.getContext('2d'); g.fillStyle = 'rgba(8,30,16,.85)';
  for (let x = 0; x < w; x++) {
    const t0 = c.in + (x / w) * c.dur * c.speed, t1 = c.in + ((x + 1) / w) * c.dur * c.speed;
    let mx = 0; const a = Math.floor(t0 * PEAK_RATE), b = Math.max(a + 1, Math.ceil(t1 * PEAK_RATE));
    for (let i = a; i < b && i < m.peaks.length; i++) if (m.peaks[i] > mx) mx = m.peaks[i];
    const bh = Math.max(1, mx / 255 * h); g.fillRect(x, (h - bh) / 2, 1, bh);
  }
}
function clipEl(c) {
  const d = div('clip ' + c.type + (selSet.has(c.id) ? ' sel' : '')); d.dataset.id = c.id;
  const wpx = c.dur * pps; d.style.left = (c.start * pps) + 'px'; d.style.width = wpx + 'px';
  const m = c.mediaId ? media.get(c.mediaId) : null;
  if (c.mediaId && !m) d.classList.add('missing');
  if (m && m.thumb && c.type !== 'audio') { const th = div('thumb'); th.style.backgroundImage = `url(${m.thumb})`; d.append(th); }
  if (m && m.peaks && c.type === 'audio') { const w = document.createElement('canvas'); drawWave(w, c, m, wpx); d.append(w); }
  if (c.props.fadeIn > 0) { const f = div('fi'); f.style.width = (c.props.fadeIn * pps) + 'px'; d.append(f); }
  if (c.props.fadeOut > 0) { const f = div('fo'); f.style.width = (c.props.fadeOut * pps) + 'px'; d.append(f); }
  if (c.kf) {                                                   // one diamond per key time; eased / hold keys get their own look
    const at = new Map(); for (const k of Object.values(c.kf)) for (const p of k) { if (p.t < 0 || p.t > c.dur) continue; const key = p.t.toFixed(3); if (!at.has(key)) at.set(key, { t: p.t, es: new Set() }); at.get(key).es.add(p.e || 'linear'); }
    for (const { t, es } of at.values()) { const mk = div('kfm' + (es.has('hold') ? ' hold' : [...es].some(e => e !== 'linear') ? ' eased' : '')); mk.style.left = (t * pps) + 'px'; mk.dataset.t = t; d.append(mk); }
  }
  const lbl = div('lbl');
  if (linkedOf(c).length) {                                     // linked to its video / detached audio
    const lk = document.createElement('span'); lk.className = 'lnk'; lk.innerHTML = icon('link'); lk.title = 'Linked — moves, trims, splits and deletes with its partner. Alt+click selects just this clip.';
    d.classList.add('linked'); lbl.append(lk);
  }
  lbl.append((c.mediaId && !m ? '[missing] ' : '') + (c.type === 'text' ? '𝗧 ' + String(c.props.text).split('\n')[0] : c.type === 'sticker' ? (c.props.glyph || '') + ' Sticker' : c.name) + (c.speed !== 1 ? ` (${c.speed}×)` : ''));
  d.append(lbl, div('hl'), div('hr'));
  return d;
}
function renderTimeline() {
  const contentW = Math.max((projectEnd() + 30) * pps, tl.clientWidth - HEAD);
  tlInner.style.width = (HEAD + contentW) + 'px';
  rows.innerHTML = '';
  for (const tr of state.tracks) {
    const row = div('row ' + tr.kind), head = div('thead'); head.dataset.id = tr.id;
    if (!simpleMode) head.title = 'Right-click to move this track up or down';
    const nm = document.createElement('span'); nm.className = 'tname'; nm.textContent = tr.name; head.append(nm);
    const mk = (ic, title, on, fn) => { const b = document.createElement('button'); b.dataset.k = ic; b.innerHTML = icon(ic); b.title = title; if (on) b.classList.add('act'); b.onclick = () => { fn(); commit(); }; head.append(b); };
    mk('mute', tr.muted ? 'Track audio is muted — click to unmute' : 'Mute track audio', tr.muted, () => tr.muted = !tr.muted);
    if (tr.kind === 'video') mk('eye', tr.hidden ? 'Track video is hidden — click to show' : 'Hide track video', tr.hidden, () => tr.hidden = !tr.hidden);
    mk('lock', tr.locked ? 'Track is locked — click to unlock' : 'Lock track', tr.locked, () => tr.locked = !tr.locked);
    if (!state.clips.some(c => c.track === tr.id) && state.tracks.filter(t => t.kind === tr.kind).length > 1)
      mk('x', 'Delete empty track', false, () => state.tracks = state.tracks.filter(t => t !== tr));
    if (tr.kind === 'audio') head.append(trackGainEl(tr));       // mixer level (Advanced; CSS hides it in Simple mode)
    const lane = div('lane' + (tr.locked ? ' locked' : '')); lane.dataset.id = tr.id; lane.style.width = contentW + 'px';
    for (const mt of state.markers) { const ml = div('mkline'); ml.style.left = (mt * pps) + 'px'; lane.append(ml); }
    for (const c of state.clips) if (c.track === tr.id) lane.append(clipEl(c));
    row.append(head, lane); rows.append(row);
  }
  $('#tcDur').textContent = tc(projectEnd());
  updatePlayheadUI();
}
// audio track level slider: 0–200 %, live while dragging, one undo step on release, double-click = 100 %
function trackGainEl(tr) {
  const r = document.createElement('input'); r.type = 'range'; r.className = 'tgain'; r.min = 0; r.max = 200; r.step = 1;
  const pct = () => (typeof tr.gain === 'number' ? tr.gain : 100);
  const tip = () => { r.title = `${tr.name} level ${pct()} % (${fmtDb(pct())}) — double-click for 100 %`; r.setAttribute('aria-label', `${tr.name} level`); };
  r.value = pct(); r.disabled = !!tr.locked; tip();
  r.oninput = () => { tr.gain = +r.value; tip(); requestRender(); };
  r.onchange = () => commit();
  r.ondblclick = () => { if (tr.locked) return; tr.gain = 100; r.value = 100; tip(); commit(); };
  return r;
}
function setTrackGain(id, pct) {                                 // scripting / tests: one undo step
  const tr = trackById(id); if (!tr || tr.kind !== 'audio' || tr.locked) return false;
  tr.gain = clamp(+pct || 0, 0, 200); commit(); return true;
}
function drawRuler() {
  const dpr = window.devicePixelRatio || 1, w = Math.max(50, tl.clientWidth - HEAD), h = 26;
  if (ruler.width !== Math.round(w * dpr)) { ruler.width = Math.round(w * dpr); ruler.height = h * dpr; ruler.style.width = w + 'px'; }
  const g = ruler.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const sl = tl.scrollLeft, steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800];
  const step = steps.find(s => s * pps >= 70) || 3600;
  g.fillStyle = '#8b93a1'; g.strokeStyle = '#4a515e'; g.font = '10px Consolas, monospace'; g.textBaseline = 'top';
  for (let t = Math.floor(sl / pps / step) * step; t * pps < sl + w; t += step) {
    const x = Math.round(t * pps - sl) + 0.5;
    g.beginPath(); g.moveTo(x, 14); g.lineTo(x, h); g.stroke();
    const mm = Math.floor(t / 60), ss = t - mm * 60;
    g.fillText(`${mm}:${step < 1 ? ss.toFixed(2).padStart(5, '0') : String(Math.round(ss)).padStart(2, '0')}`, x + 3, 3);
    for (let k = 1; k < 5; k++) { const sx = Math.round((t + step * k / 5) * pps - sl) + 0.5; g.beginPath(); g.moveTo(sx, 21); g.lineTo(sx, h); g.stroke(); }
  }
  if (state.inPt != null || state.outPt != null) {                // in/out range: shaded band with brackets at the set points
    const a = (state.inPt ?? 0) * pps - sl, b = (state.outPt ?? Math.max(state.inPt, projectEnd())) * pps - sl;
    g.fillStyle = 'rgba(232,201,90,.18)'; g.fillRect(a, 0, Math.max(0, b - a), h);
    g.strokeStyle = '#e8c95a'; g.lineWidth = 2; g.beginPath();
    if (state.inPt != null) { g.moveTo(a + 5, 1); g.lineTo(a + 1, 1); g.lineTo(a + 1, h - 1); g.lineTo(a + 5, h - 1); }
    if (state.outPt != null) { g.moveTo(b - 5, 1); g.lineTo(b - 1, 1); g.lineTo(b - 1, h - 1); g.lineTo(b - 5, h - 1); }
    g.stroke(); g.lineWidth = 1;
  }
  g.fillStyle = '#5aa9ff';
  for (const m of state.markers) { const x = m * pps - sl; if (x < -6 || x > w + 6) continue; g.beginPath(); g.moveTo(x - 5, 0); g.lineTo(x + 5, 0); g.lineTo(x + 5, 7); g.lineTo(x, 12); g.lineTo(x - 5, 7); g.closePath(); g.fill(); }
  const px = playhead * pps - sl;
  if (px >= -8 && px <= w + 8) { g.fillStyle = '#f0a53a'; g.beginPath(); g.moveTo(px - 6, 12); g.lineTo(px + 6, 12); g.lineTo(px, 25); g.closePath(); g.fill(); }
}
function laneAtY(y) {
  for (const l of rows.querySelectorAll('.lane')) { const r = l.getBoundingClientRect(); if (y >= r.top && y < r.bottom) return l; }
  return null;
}
const laneTime = (ev, lane) => Math.max(0, (ev.clientX - lane.getBoundingClientRect().left) / pps);
function dragLoop(move, up) {
  const mv = (e) => move(e), fin = (e) => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', fin); window.removeEventListener('pointercancel', fin); up && up(e); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', fin); window.addEventListener('pointercancel', fin);
}
function scrubFrom(ev, originLeft) {
  const at = (e) => { stop(); setPlayhead(snapOn && e.shiftKey ? snapTime((e.clientX - originLeft()) / pps, null) : frameRound(Math.max(0, (e.clientX - originLeft()) / pps))); };
  at(ev); dragLoop(at);
}
ruler.addEventListener('pointerdown', (ev) => { if (ev.button === 0 && !voStop()) scrubFrom(ev, () => ruler.getBoundingClientRect().left - tl.scrollLeft); });
rows.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || ev.target.closest('.thead')) return;
  const lane = ev.target.closest('.lane'); if (!lane) return;
  const ce = ev.target.closest('.clip'), tr = trackById(lane.dataset.id);
  if (!ce) {                                                    // empty track space: click = move playhead, drag = box-select
    if (voStop()) return;
    const x0 = ev.clientX, y0 = ev.clientY, add = ev.shiftKey || ev.ctrlKey || ev.metaKey, before = add ? [...selSet] : []; let box = null, hits = [];
    const clickT = frameRound(laneTime(ev, lane));              // measured now: the lane element is rebuilt when the selection changes
    dragLoop((e) => {
      if (!box && Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 5) return;
      if (!box) { box = div('marquee'); document.body.append(box); }
      const l = Math.min(x0, e.clientX), t = Math.min(y0, e.clientY), r = Math.max(x0, e.clientX), b = Math.max(y0, e.clientY);
      box.style.cssText = `left:${l}px;top:${t}px;width:${r - l}px;height:${b - t}px`;
      hits = [];
      for (const el of rows.querySelectorAll('.clip')) {
        const q = el.getBoundingClientRect(), hit = q.left < r && q.right > l && q.top < b && q.bottom > t && !trackById(clipById(el.dataset.id)?.track)?.locked;
        if (hit) hits.push(el.dataset.id); el.classList.toggle('sel', hit || before.includes(el.dataset.id));
      }
    }, () => {
      if (box) { box.remove(); selectMany([...new Set([...before, ...hits])]); }
      else { if (!add) select(null); stop(); setPlayhead(clickT); }
    });
    return;
  }
  const c = clipById(ce.dataset.id); if (!c) return;
  if (tr.locked) { toast('Track is locked.', 1500); return; }
  if (tool === 'razor') { if (splitClip(c, snapTime(laneTime(ev, lane), c.id), ev.altKey)) commit(); return; }   // Alt: cut only this clip, not its linked partner
  if (ev.shiftKey || ev.ctrlKey || ev.metaKey) {                // add to / remove from the selection
    const ids = new Set(selSet); if (ids.has(c.id) && ids.size > 1) ids.delete(c.id); else ids.add(c.id);
    selectMany([...ids], ids.has(c.id) ? c.id : null); return;
  }
  const mode = ev.target.classList.contains('hl') ? 'l' : ev.target.classList.contains('hr') ? 'r' : 'move', alone = ev.altKey;   // Alt: just this clip, not its linked partner
  const gbase = alone ? [c] : selSet.size > 1 && selSet.has(c.id) ? selClips() : [c];
  const gList = (alone ? gbase : withLinked(gbase)).filter(unlockedC);
  if (mode === 'move' && alone && !simpleMode && hasSource(c)) { slipDrag(c, ev); return; }   // Advanced: Alt-drag the body = slip
  if (mode === 'move' && gList.length > 1) {                    // drag a selected group / linked pair together (tracks stay fixed)
    const group = gList, ids = new Set(group.map(k => k.id));
    if (!selSet.has(c.id)) selectClip(c, alone);                 // grabbing an unselected linked clip selects the pair
    const orig = new Map(group.map(k => [k.id, k.start])), minStart = Math.min(...orig.values()), gx0 = ev.clientX; let gmoved = false;
    dragLoop((e) => {
      if (Math.abs(e.clientX - gx0) > 3) gmoved = true; if (!gmoved) return;
      const delta = Math.max(-minStart, snapMove(orig.get(c.id) + (e.clientX - gx0) / pps, c, ids) - orig.get(c.id));
      if (!moveClips(group, delta, orig)) return;                 // blocked: stay at the last free spot
      renderTimeline(); requestRender();
    }, () => { if (gmoved) { commit(); renderInspector(true); } else selectClip(c, alone); });
    return;
  }
  selectClip(c, alone);
  const o = { start: c.start, dur: c.dur }, x0 = ev.clientX;
  const parts = mode === 'move' ? null : trimParts(c, alone);   // linked clips trim with c, each limited by its own neighbours
  let moved = false;
  dragLoop((e) => {
    if (Math.abs(e.clientX - x0) > 3) moved = true;
    if (!moved) return;
    const dx = (e.clientX - x0) / pps, end = o.start + o.dur;
    if (mode === 'move') {
      let tgt = c.track; const l = laneAtY(e.clientY), t2 = l && trackById(l.dataset.id);
      if (t2 && !t2.locked && t2.kind === kindFor(c)) tgt = t2.id;
      const s = place(c, tgt, snapMove(o.start + dx, c));
      if (s != null) { c.start = s; c.track = tgt; }
    } else if (mode === 'l') applyTrim(parts, 'l', snapTime(o.start + dx, c.id) - o.start);
    else applyTrim(parts, 'r', snapTime(end + dx, c.id) - end);
    renderTimeline(); requestRender();
  }, () => { if (moved) { commit(); renderInspector(true); } });
});
// slip: shift the source under a clip (and its linked clips, so they stay in sync); start, duration and keyframes stay put
function slipParts(c) { return [c, ...linkedOf(c).filter(k => unlockedC(k) && hasSource(k))].map(k => ({ k, in: k.in, m: media.get(k.mediaId) })); }
function applySlip(parts, s) {                                   // s: timeline seconds; positive shows later source
  let lo = -Infinity, hi = Infinity;
  for (const p of parts) { lo = Math.max(lo, -p.in / p.k.speed); if (p.m) hi = Math.min(hi, (p.m.dur - p.in) / p.k.speed - p.k.dur); }
  s = clamp(s, lo, Math.max(lo, hi));
  for (const p of parts) p.k.in = Math.max(0, p.in + s * p.k.speed);
  return s;
}
function slipDrag(c, ev) {
  selectClip(c, true);
  const parts = slipParts(c), x0 = ev.clientX; let moved = false;
  dragLoop((e) => {
    if (Math.abs(e.clientX - x0) > 3) moved = true; if (!moved) return;
    applySlip(parts, -frameRound((e.clientX - x0) / pps));      // drag right = earlier footage, as in other editors
    $('#stHint').textContent = `Slip — source in ${tc(c.in)} · out ${tc(c.in + c.dur * c.speed)}`;
    renderTimeline(); requestRender();
  }, () => { updateStatus(); if (moved) { commit(); renderInspector(true); } });
}
const clearDropHL =() => rows.querySelectorAll('.lane.dropok').forEach(l => l.classList.remove('dropok'));
rows.addEventListener('dragover', (ev) => {
  if (!dragMedia) return; const l = ev.target.closest('.lane'); if (!l) return;
  ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy';
  if (!l.classList.contains('dropok')) { clearDropHL(); l.classList.add('dropok'); }
});
rows.addEventListener('drop', (ev) => {
  if (!dragMedia) return; const l = ev.target.closest('.lane'), m = media.get(dragMedia); dragMedia = null;
  if (!l || !m) return; ev.preventDefault(); ev.stopPropagation();
  addMediaClip(m, l.dataset.id, laneTime(ev, l));
});
tl.addEventListener('scroll', drawRuler);
tl.addEventListener('wheel', (ev) => {
  if (!ev.ctrlKey) return; ev.preventDefault();
  setZoom(pps * (ev.deltaY < 0 ? 1.2 : 1 / 1.2), ev.clientX - tl.getBoundingClientRect().left - HEAD);
}, { passive: false });
const PPS_MIN = 2, PPS_MAX = 600;
function setZoom(v, anchorPx) {
  const old = pps; pps = clamp(v, PPS_MIN, PPS_MAX);
  if (anchorPx === undefined) anchorPx = playhead * old - tl.scrollLeft;
  const tAnchor = (tl.scrollLeft + anchorPx) / old;
  $('#zoom').value = Math.round(100 * Math.log(pps / PPS_MIN) / Math.log(PPS_MAX / PPS_MIN));
  renderTimeline(); tl.scrollLeft = Math.max(0, tAnchor * pps - anchorPx); drawRuler(); updateStatus();
}
$('#zoom').oninput = (e) => setZoom(PPS_MIN * Math.pow(PPS_MAX / PPS_MIN, e.target.value / 100));
$('#btnFit').onclick = fitTimeline;
function fitTimeline() { const end = projectEnd() || 30; setZoom((tl.clientWidth - HEAD - 40) / end, 0); tl.scrollLeft = 0; }

// ───────────────────────── monitor: drag to reposition ─────────────────────────
// is the point (sequence px from frame centre) on a corner handle or the rotate handle of the selected clip?
// Uses the pose drawClip rendered, so it matches what is drawn (rotation, crop, transitions, shake, presets).
function handleHit(px, py, k) {
  const c = clipById(sel), b = c && bounds.get(c.id);
  if (!c || !b || c.type === 'audio' || playhead < c.start || playhead >= c.start + c.dur || trackById(c.track)?.locked) return null;
  const [lx, ly] = toLocal(b, px, py), tol = 12 * k / Math.max(b.s, 0.001), [x0, y0, x1, y1] = b.r, [hx, hy] = rotHandle(b);
  const base = { c, cx: b.cx, cy: b.cy, d0: Math.hypot(px - b.cx, py - b.cy) || 1 };
  if (Math.hypot(lx - hx, ly - hy) < tol) return { ...base, rotate: true };
  for (const [sx, sy] of [[x0, y0], [x1, y0], [x1, y1], [x0, y1]])
    if (Math.abs(lx - sx) < tol && Math.abs(ly - sy) < tol) return { ...base, diag: (sx === x0) === (sy === y0) };
  return null;
}
// topmost unlocked visual clip under the point, by its rendered pose
function hitClipAt(px, py) {
  for (const tr of state.tracks.filter(t => t.kind === 'video' && !t.hidden && !t.locked)) {   // top row first
    const hit = state.clips.find(c => { const b = bounds.get(c.id); return c.track === tr.id && c.type !== 'audio' && playhead >= c.start && playhead < c.start + c.dur && b && inPose(b, px, py); });
    if (hit) return hit;
  }
  return null;
}
const normDeg = (d) => ((d + 180) % 360 + 360) % 360 - 180;
// key-colour eyedropper: the next monitor click samples the frame (without this clip's key) under the pointer
let keyPick = null;                                              // id of the clip whose key colour is being picked
function startKeyPick(c) {
  if (!c || !unlockedC(c)) return;
  stop(); keyPick = c.id; cv.classList.add('picking');
  $('#stHint').textContent = 'Key colour — click the monitor on the colour to remove (Esc cancels).';
}
function cancelKeyPick() { if (!keyPick) return false; keyPick = null; cv.classList.remove('picking'); updateStatus(); return true; }
// px, py: sequence px from the frame centre; averages 3×3 pixels; one undo step
function pickKeyAt(px, py, id = keyPick) {
  cancelKeyPick();
  const c = clipById(id); if (!c || !unlockedC(c)) return null;
  const amt = c.props.fxKey, W = cv.width, H = cv.height;
  c.props.fxKey = 0; cleanFrame = true; drawFrame(); cleanFrame = false; c.props.fxKey = amt;   // sample what the key would see
  const x = clamp(Math.round(px + W / 2), 1, W - 2), y = clamp(Math.round(py + H / 2), 1, H - 2), d = ctx.getImageData(x - 1, y - 1, 3, 3).data, s = [0, 0, 0];
  for (let i = 0; i < 36; i += 4) for (let j = 0; j < 3; j++) s[j] += d[i + j];
  c.props.fxKeyColor = '#' + s.map(v => Math.round(v / 9).toString(16).padStart(2, '0')).join('');
  commit(); renderInspector(true); requestRender(); toast(`Key colour set to ${c.props.fxKeyColor}.`, 1500);
  return c.props.fxKeyColor;
}
cv.addEventListener('pointermove', (ev) => {
  if (playing || ev.buttons) return;
  const r = cv.getBoundingClientRect(), k = cv.width / r.width, h = handleHit((ev.clientX - r.left) * k - cv.width / 2, (ev.clientY - r.top) * k - cv.height / 2, k);
  cv.style.cursor = h ? (h.rotate ? 'grab' : h.diag ? 'nwse-resize' : 'nesw-resize') : (clipById(sel) ? 'move' : 'default');
});
cv.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0 || playing) return;
  const r = cv.getBoundingClientRect(), k = cv.width / r.width;
  const px = (ev.clientX - r.left) * k - cv.width / 2, py = (ev.clientY - r.top) * k - cv.height / 2;
  if (keyPick) { pickKeyAt(px, py); return; }
  const hh = handleHit(px, py, k);
  if (hh && hh.rotate) {                                        // rotate handle: turn about the rendered centre; Shift snaps to 15°
    const r0 = val(hh.c, 'rot', playhead), a0 = Math.atan2(py - hh.cy, px - hh.cx); let moved = false;
    dragLoop((e) => {
      const a = Math.atan2((e.clientY - r.top) * k - cv.height / 2 - hh.cy, (e.clientX - r.left) * k - cv.width / 2 - hh.cx);
      let d = normDeg(r0 + (a - a0) * 180 / Math.PI); d = e.shiftKey ? normDeg(Math.round(d / 15) * 15) : Math.round(d);
      moved = true; setProp(hh.c, 'rot', d); $('#stHint').textContent = `Rotation ${d}°${e.shiftKey ? ' (snapped to 15°)' : ' — hold Shift to snap to 15°'}`; requestRender();
    }, () => { updateStatus(); if (moved) { commit(); renderInspector(true); } });
    return;
  }
  if (hh) {                                                     // corner handle: scale about the clip centre
    const s0 = val(hh.c, 'scale', playhead); let moved = false;
    dragLoop((e) => {
      const d = Math.hypot((e.clientX - r.left) * k - cv.width / 2 - hh.cx, (e.clientY - r.top) * k - cv.height / 2 - hh.cy);
      moved = true; setProp(hh.c, 'scale', clamp(Math.round(s0 * d / hh.d0), 1, 2000)); requestRender();
    }, () => { if (moved) { commit(); renderInspector(true); } });
    return;
  }
  const hit = hitClipAt(px, py);
  if (!hit) { select(null); return; }
  select(hit.id);
  const x0 = ev.clientX, y0 = ev.clientY, ox = val(hit, 'x', playhead), oy = val(hit, 'y', playhead); let moved = false;
  dragLoop((e) => {
    if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) > 3) moved = true; if (!moved) return;
    setProp(hit, 'x', Math.round(ox + (e.clientX - x0) * k)); setProp(hit, 'y', Math.round(oy + (e.clientY - y0) * k)); requestRender();
  }, () => { if (moved) { commit(); renderInspector(true); } });
});

// ───────────────────────── inspector ─────────────────────────
function live() { requestRender(); renderTimeline(); }
function section(title) {
  const s = div('sec' + (collapsed.has(title) ? ' collapsed' : '')), h = document.createElement('h4'), b = document.createElement('button');
  b.type = 'button'; b.textContent = title; b.setAttribute('aria-expanded', !collapsed.has(title)); h.title = 'Click to fold or unfold'; h.append(b);
  h.onclick = () => { if (collapsed.has(title)) collapsed.delete(title); else collapsed.add(title); b.setAttribute('aria-expanded', !s.classList.toggle('collapsed')); };
  s.dataset.tab = secTab; s.append(h); insp.append(s); return s;
}
// number fields also take '+=20', '-=15', '*2', '/2': relative to the current value (each clip's own when several are edited)
const NUM_PLAIN = /^\s*-?(\d+\.?\d*|\.\d+)\s*$/, NUM_EXPR = /^\s*(\+=|-=|\*=?|\/=?)\s*(-?(?:\d+\.?\d*|\.\d+))\s*$/;
function numExpr(raw, cur) {
  if (NUM_PLAIN.test(raw)) return parseFloat(raw);
  const m = NUM_EXPR.exec(raw); if (!m) return NaN;
  const x = parseFloat(m[2]), op = m[1][0];
  return op === '+' ? cur + x : op === '-' ? cur - x : op === '*' ? cur * x : x ? cur / x : NaN;
}
// o: {min, max, hardMax?, step?, def?, mixed? (targets differ: empty field + 'mixed'), many? {get() -> [v], set([v])} one value per edited clip}
function numRow(parent, label, get, set, o) {
  const row = div('prow'), l = document.createElement('label'); l.textContent = label;
  const lo = o.min, hi = o.hardMax ?? o.max, step = o.step || 1, fix = (v) => +clamp(v, lo, hi).toFixed(3);
  const many = o.many || { get: () => [get()], set: (vs) => set(vs[0]) };
  const nt = o.note ? document.createElement('span') : null;     // o.note(v): a second line under the label (e.g. the volume in dB)
  const note = (v) => { if (nt) nt.textContent = v === '' ? '' : o.note(+v); };
  if (nt) { nt.className = 'unit'; l.append(nt); note(o.mixed ? '' : get()); }
  const r = document.createElement('input'); r.type = 'range'; r.min = o.min; r.max = o.max; r.step = step; r.value = get();
  const n = document.createElement('input'); n.type = 'text'; n.inputMode = 'decimal'; n.className = 'num'; n.spellcheck = false; n.value = get();
  n.title = 'Type a value, or +=20, -=15, *2, /2. ↑ / ↓ step (Shift ×10).';
  const unmix = () => { n.placeholder = ''; l.classList.remove('mixed'); };
  if (o.mixed) { n.value = ''; n.placeholder = 'mixed'; l.classList.add('mixed'); }
  const show = () => { const v = get(); r.value = v; n.value = v; note(v); unmix(); };
  const by = (f, base = many.get()) => { many.set(base.map(v => fix(f(v)))); show(); live(); };
  const apply = (raw, src) => {
    let v = parseFloat(raw); if (isNaN(v)) return;
    v = clamp(v, lo, hi); set(v);
    if (src !== r) r.value = v; if (src !== n) n.value = v; note(v); unmix(); live();
  };
  r.setAttribute('aria-label', label); n.setAttribute('aria-label', label + ' value');
  r.oninput = () => apply(r.value, r); n.oninput = () => { if (NUM_PLAIN.test(n.value)) apply(n.value, n); };
  r.onchange = () => commit();
  n.onchange = () => {                                           // show the clamped model value, not the rejected text
    if (n.value.trim() === '' && o.mixed && n.placeholder) return;
    if (!NUM_PLAIN.test(n.value) && NUM_EXPR.test(n.value)) by(v => { const x = numExpr(n.value, v); return isNaN(x) ? v : x; });
    show(); commit();
  };
  n.onkeydown = (e) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault(); const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1); by(v => v + d); commit();
  };
  r.ondblclick = () => { if (o.def !== undefined) { apply(o.def, null); commit(); } };
  // scrubbable label: drag left / right (Shift ×10, Alt ×0.1); the whole drag is one undo step
  l.classList.add('scrub'); l.title = 'Drag left / right to change (Shift ×10, Alt ×0.1)' + (o.def !== undefined ? `. Double-click the slider to reset to ${o.def}.` : '');
  l.onpointerdown = (ev) => {
    if (ev.button !== 0) return; ev.preventDefault();
    const base = many.get(); let x = ev.clientX, acc = 0, moved = false;
    document.body.classList.add('scrubbing');
    dragLoop((e) => {
      acc += (e.clientX - x) * step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1); x = e.clientX;
      if (!moved && Math.abs(acc) < step / 2) return; moved = true; by(v => v + acc, base);
    }, () => { document.body.classList.remove('scrubbing'); if (moved) commit(); });
  };
  row.append(l, r, n); parent.append(row);
  return row;
}
let rowSeq = 0;
function wideRow(parent, label, control) {
  const row = div('prow wide'), l = document.createElement('label'); l.textContent = label;
  if (!control.id) control.id = 'insp' + (++rowSeq); l.htmlFor = control.id;   // gives the control an accessible name
  row.append(l, control); parent.append(row); return control;
}
// the clips an Inspector row edits: every selected unlocked clip when several are selected (inspT), else just c
let inspT = [];
const rowTargets = (c) => inspT.length > 1 && inspT.includes(c) ? inspT : [c];
function propNum(parent, c, key, label, o) {
  const anim = ANIM.includes(key), T = rowTargets(c);
  const getK = (k) => anim ? +val(k, key, playhead).toFixed(2) : k.props[key], setK = (k, v) => anim ? setProp(k, key, v) : (k.props[key] = v);
  const vals = T.map(getK);
  const row = numRow(parent, label, () => getK(c), v => T.forEach(k => setK(k, v)),
    { def: (c.type === 'text' ? { ...BASE_PROPS, ...TEXT_PROPS } : BASE_PROPS)[key], mixed: vals.some(v => v !== vals[0]),
      many: { get: () => T.map(getK), set: (vs) => T.forEach((k, i) => setK(k, vs[i])) }, ...o });
  if (!anim || T.length > 1) return;                            // keyframe controls: one clip at a time
  row.classList.add('kf');
  const b = document.createElement('button'), l = playhead - c.start, ki = kfIndexAt(c, key, l), kq = ki >= 0 ? c.kf[key][ki] : null;
  b.textContent = '◆';
  b.className = 'kfb' + (kfOf(c, key) ? ' has' : '') + (kq ? ' on' : '') + (kq && kq.e && kq.e !== 'linear' ? ' eased' : '');
  b.title = kfOf(c, key) ? 'Animated. Click to add or remove a keyframe at the playhead; changing the value also writes a keyframe.' + (kq ? ` Right-click to set easing (now: ${(EASE_NAMES.find(n => n[0] === (kq.e || 'linear')) || [])[1]}).` : '') : 'Start animating: add a keyframe at the playhead';
  b.setAttribute('aria-label', 'Keyframe ' + label); b.setAttribute('aria-pressed', !!kq);
  b.onclick = () => toggleKf(c, key);
  b.oncontextmenu = (ev) => { ev.preventDefault(); if (kq) easeMenu(ev.clientX, ev.clientY, c, l, key); else toast('Move the playhead onto a keyframe to set its easing.', 2000); };
  const g = document.createElement('span'); g.className = 'kfg';
  if (kfOf(c, key)) {                                            // keyframe navigator: previous / next key of this property
    const nav = (txt, dir) => { const n = document.createElement('button'); n.className = 'kfn'; n.textContent = txt; n.title = (dir < 0 ? 'Previous' : 'Next') + ' keyframe of ' + label + (dir < 0 ? ' ([ for any property)' : ' (] for any property)');
      n.setAttribute('aria-label', n.title); n.onclick = () => jumpKf(c, dir, key); return n; };
    g.append(nav('◀', -1), b, nav('▶', 1));
  } else g.append(b);
  row.append(g);
}
const mixLabel = (ctl) => ctl.closest('.prow').querySelector('label').classList.add('mixed');
function selectRow(parent, label, options, get, set, mixed) {
  const s = document.createElement('select');
  for (const [v, t] of options) { const op = document.createElement('option'); op.value = v; op.textContent = t; s.append(op); }
  if (mixed) { const op = document.createElement('option'); op.value = ''; op.textContent = 'mixed'; op.disabled = true; s.prepend(op); }
  s.value = mixed ? '' : get(); s.onchange = () => { set(s.value); commit(); }; wideRow(parent, label, s);
  if (mixed) mixLabel(s); return s;
}
// checkbox / colour rows edit every clip in rowTargets(c); differing values show as indeterminate / 'mixed'
function checkRow(parent, c, key, label) {
  const T = rowTargets(c), i = document.createElement('input'); i.type = 'checkbox'; i.checked = !!c.props[key];
  i.indeterminate = T.some(k => !!k.props[key] !== i.checked);
  i.onchange = () => { for (const k of T) k.props[key] = i.checked; commit(); renderInspector(true); }; wideRow(parent, label, i); i.style.justifySelf = 'start';
  if (i.indeterminate) mixLabel(i);
}
function colorRow(parent, c, key, label) {
  const T = rowTargets(c), i = document.createElement('input'); i.type = 'color'; i.value = c.props[key];
  i.oninput = () => { for (const k of T) k.props[key] = i.value; live(); }; i.onchange = () => commit(); wideRow(parent, label, i); i.style.justifySelf = 'start';
  if (T.some(k => k.props[key] !== c.props[key])) { mixLabel(i); i.title = 'mixed: the selected clips differ'; }
}
function btnRow(parent, defs) { const r = div('btnrow'); for (const [t, fn, dis, tip] of defs) { const b = document.createElement('button'); b.textContent = t; b.onclick = fn; b.disabled = !!dis; if (tip) b.title = tip; r.append(b); } parent.append(r); }
// nothing selected: the Inspector shows the project instead (frame, rate, length, quick actions)
const RES_OPTS = [['1920x1080', '1920×1080 · landscape 16:9'], ['1280x720', '1280×720 · landscape 16:9'], ['3840x2160', '3840×2160 · 4K'], ['1080x1920', '1080×1920 · vertical 9:16'], ['1080x1080', '1080×1080 · square 1:1']];
const FPS_OPTS = [24, 25, 30, 60];
function clipUnderPlayhead() {                                   // topmost unlocked clip under the playhead
  for (const tr of state.tracks) if (!tr.locked) { const c = state.clips.find(k => k.track === tr.id && playhead >= k.start - 1e-6 && playhead < k.start + k.dur - 1e-6); if (c) return c; }
  return null;
}
function renderProjectPanel() {
  const { w, h, fps } = state.settings, res = `${w}x${h}`; secTab = 'basic';
  const s = section('Project');
  const nm = document.createElement('input'); nm.type = 'text'; nm.maxLength = 80; nm.value = projTitle();
  nm.onchange = () => { state.settings.name = nm.value.trim().slice(0, 80) || 'Untitled project'; commit(); }; wideRow(s, 'Name', nm);
  selectRow(s, 'Frame size', RES_OPTS.some(o => o[0] === res) ? RES_OPTS : [[res, `${w}×${h}`], ...RES_OPTS], () => res,
    v => { const [a, b] = v.split('x').map(Number); state.settings.w = a; state.settings.h = b; });
  selectRow(s, 'Frame rate', (FPS_OPTS.includes(fps) ? FPS_OPTS : [fps, ...FPS_OPTS]).map(f => [String(f), f + ' fps']), () => String(fps), v => { state.settings.fps = +v; });
  const info = div('info'), n = state.clips.length;
  info.textContent = `Length ${tc(projectEnd())} · ${n} clip${n === 1 ? '' : 's'} · ${media.size} media file${media.size === 1 ? '' : 's'}`; s.append(info);
  btnRow(s, [['Add text', addText], ['Add solid', () => addGenerated('solid')], ['Add adjustment layer', () => addGenerated('adjust'), false, 'Colour and effects on this layer apply to everything below it'], ['Import…', () => $('#fileInput').click()],     // (the playhead moves without re-rendering this, so no disabled state)
    ['Select clip under playhead', () => { const c = clipUnderPlayhead(); if (c) selectClip(c); else toast('No clip under the playhead.', 2000); }, false, 'Select the topmost clip at the playhead']]);
  const e = div('info'); e.textContent = 'Select a clip on the timeline to edit its properties. More options under Project settings.'; s.append(e);
}
function renderInspector(force) {
  const ae = document.activeElement;                              // do not rebuild a field the user is typing in or dragging
  if (!force && ae && insp.contains(ae) && /^(input|textarea|select)$/i.test(ae.tagName)) return;
  recordHistory();                                               // a focused field being torn down never fires 'change': keep its edit
  insp.innerHTML = ''; inspT = [];
  const c = clipById(sel);
  if (!c) { renderProjectPanel(); return; }
  const { w: W, h: H } = state.settings, m = media.get(c.mediaId);

  secTab = 'basic';
  let s = section('Clip');
  const info = div('info');
  info.textContent = `${c.type.toUpperCase()} · start ${tc(c.start)} · length ${tc(c.dur)}` + (hasSource(c) ? ` · source in ${c.in.toFixed(2)}s` : '');
  s.append(info);
  const ctr = trackById(c.track);
  if (ctr && ctr.locked) {                                      // read-only: nothing below may edit a clip on a locked track
    const n = div('info lockNote'); n.textContent = `Track is locked (${ctr.name}). Unlock it to edit this clip.`; s.append(n);
    btnRow(s, [['Unlock track', () => { ctr.locked = false; commit(); renderInspector(true); }]]);
    return;
  }
  // several selected: every control edits all selected unlocked clips; only sections they all share are shown
  const T = selSet.size > 1 ? [c, ...selClips().filter(k => k.id !== c.id && unlockedC(k))] : [c], multi = T.length > 1;
  inspT = T;
  const all = (f) => T.every(f), each = (f) => T.forEach(f), mix = (f) => T.some(k => f(k) !== f(c));
  const visual = all(k => k.type !== 'audio');
  if (selSet.size > 1) {
    const n = div('info'); n.style.color = 'var(--accent2)';
    n.textContent = multi ? `Editing ${T.length} clips: changes apply to all of them. Fields marked "mixed" differ between them.` + (selSet.size > T.length ? ` ${selSet.size - T.length} on locked tracks are left alone.` : '')
      : `${selSet.size} clips selected. The others are on locked tracks.`;
    s.append(n);
  }
  if (hasSource(c) && !multi) {
    const srcLen = c.dur * c.speed;
    const room = state.clips.reduce((v, k) => k.track === c.track && k.id !== c.id && k.start >= c.start + c.dur - 1e-6 ? Math.min(v, k.start) : v, Infinity) - c.start;
    numRow(s, 'Speed ×', () => c.speed, v => { c.speed = v; c.dur = Math.max(MIN_DUR, Math.min(srcLen / v, room)); }, { min: 0.25, max: 4, step: 0.05, def: 1 });
  }
  const resetOne = (k) => {
    const keep = k.type === 'text' ? { text: k.props.text } : k.type === 'solid' ? { color: k.props.color } : k.type === 'sticker' ? { glyph: k.props.glyph, scale: 50 } : audioDetached(k) ? { volume: 0, audioDetached: true } : {};   // a detached video stays silent
    k.props = { ...BASE_PROPS, ...(k.type === 'text' ? TEXT_PROPS : {}), ...keep }; delete k.kf;
  };
  const detached = audioDetached(c);
  const acts = [[multi ? `Reset all (${T.length} clips)` : 'Reset all', () => { each(resetOne); commit(); renderInspector(true); }]];
  if (T.some(hasKf)) acts.push(['Clear keyframes', () => { each(clearKeyframes); commit(); renderInspector(true); }]);
  if (c.type === 'video' && !multi) acts.push(['Detach audio', () => detachAudio(c), detached, detached ? 'The audio is already on its own clip' : 'Move the sound to its own clip on an audio track']);
  btnRow(s, acts);
  if (all(k => k.type === 'solid')) { s = section('Solid'); colorRow(s, c, 'color', 'Colour'); }

  if (all(k => k.type === 'text')) {
    s = section('Text');
    const ta = document.createElement('textarea'); ta.value = c.props.text;
    if (mix(k => k.props.text)) { ta.value = ''; ta.placeholder = 'mixed: typing here replaces the text of every selected clip'; }
    ta.oninput = () => { each(k => k.props.text = ta.value); live(); }; ta.onchange = () => commit(); wideRow(s, 'Content', ta);
    const fontOpts = FONTS.includes(c.props.font) ? FONTS : [c.props.font, ...FONTS];
    const fsel = selectRow(s, 'Font', fontOpts.map(f => [f, f]), () => c.props.font, v => each(k => k.props.font = v), mix(k => k.props.font));
    fsel.querySelectorAll('option').forEach(o => { if (o.value) o.style.fontFamily = `"${o.value}"`; });
    const cf = document.createElement('input'); cf.type = 'text'; cf.placeholder = 'Any installed font, e.g. Bahnschrift'; cf.spellcheck = false; cf.maxLength = 60;
    cf.title = 'Type the name of any font installed on this computer, then press Enter';
    cf.onchange = () => { const v = cf.value.trim().replace(/["\\]/g, ''); if (!v) return; each(k => k.props.font = v); commit(); renderInspector(true); };
    wideRow(s, 'Custom font', cf);
    propNum(s, c, 'size', 'Size', { min: 10, max: 400, hardMax: 1000 });
    numRow(s, 'Weight', () => textWeight(c.props), v => each(k => k.props.weight = Math.round(v / 100) * 100), { min: 100, max: 900, step: 100, def: 700, mixed: mix(k => textWeight(k.props)) });
    colorRow(s, c, 'color', 'Colour');
    selectRow(s, 'Align', ['left', 'center', 'right'].map(a => [a, a]), () => c.props.align, v => each(k => k.props.align = v), mix(k => k.props.align));
    checkRow(s, c, 'italic', 'Italic'); checkRow(s, c, 'caps', 'ALL CAPS'); checkRow(s, c, 'shadow', 'Shadow');
    propNum(s, c, 'strokeW', 'Outline', { min: 0, max: 40 }); colorRow(s, c, 'stroke', 'Outline col.');
    propNum(s, c, 'boxWidth', 'Wrap width px', { min: 0, max: W, hardMax: 8000, step: 10 });
    propNum(s, c, 'lineHeight', 'Line height', { min: 0.6, max: 3, step: 0.05 });
    if (!simpleMode) {                                           // Advanced: spacing and gradient details
      propNum(s, c, 'letterSpacing', 'Letter spacing', { min: -20, max: 100, step: 0.5 });
      checkRow(s, c, 'gradOn', 'Gradient');
      if (T.some(k => k.props.gradOn)) { colorRow(s, c, 'color2', 'Colour 2'); propNum(s, c, 'gradAngle', 'Gradient °', { min: 0, max: 360 }); }
    }
    checkRow(s, c, 'bgOn', 'Background'); colorRow(s, c, 'bg', 'Bg colour');
    if (T.some(k => k.props.bgOn)) {
      propNum(s, c, 'bgRadius', 'Bg corners px', { min: 0, max: 200 });
      if (!simpleMode) propNum(s, c, 'bgPad', 'Bg padding %', { min: 0, max: 150 });
    }
    btnRow(s, [['Save as preset…', () => presetDialog('text', c), false, 'Keep this text style for any project (Text tab → My presets)']]);
    s = section('3D text');                                     // extruded lettering; turn it in 3D on the Motion tab (3D layer)
    checkRow(s, c, 'ex3d', 'Extrude');
    if (T.some(k => k.props.ex3d)) {
      propNum(s, c, 'exDepth', 'Depth px', { min: 0, max: 300, hardMax: 1000 });
      propNum(s, c, 'exAngle', 'Direction °', { min: 0, max: 360 });
      propNum(s, c, 'exSlant', 'Slant %', { min: 0, max: 100 });
      colorRow(s, c, 'exColor', 'Side colour');
      propNum(s, c, 'exShade', 'Side shading %', { min: 0, max: 100 });
    }
    const look3d = (o) => () => { each(k => Object.assign(k.props, { ex3d: true, ...o })); commit(); renderInspector(true); };
    btnRow(s, [['Retro', look3d({ color: '#ffd23f', exColor: '#e4572e', exDepth: 50, exAngle: 45, exSlant: 80, exShade: 45, strokeW: 0, rotX: 0, rotY: 0 })],
      ['Gold block', look3d({ color: '#ffe08a', gradOn: true, color2: '#c8902b', exColor: '#7a4f12', exDepth: 60, exAngle: 90, exSlant: 30, exShade: 60, rotX: 18, rotY: -22 })],
      ['Neon slab', look3d({ color: '#ffffff', exColor: '#ff2fd0', exDepth: 70, exAngle: 30, exSlant: 60, exShade: 20, rotX: 0, rotY: 28, fxGlow: 40 })],
      ['Ice', look3d({ color: '#e8f7ff', exColor: '#3a8bd8', exDepth: 40, exAngle: 120, exSlant: 50, exShade: 55, rotX: -15, rotY: 15 })]]);
    const n3 = div('info'); n3.textContent = 'Extrude gives the letters real depth. Tilt and turn them in 3D on the Motion tab → 3D layer (keyframeable). Outline, gradient and shadow above apply to the front face.'; s.append(n3);
  }
  const adj = all(k => k.type === 'adjust');
  if (adj) {                                                    // an adjustment layer has no picture of its own
    s = section('Adjustment layer');
    const n = div('info'); n.textContent = 'Everything on the tracks below this clip gets its colour, effects, blend mode and mask while it plays. Use Opacity to mix it in, and a mask to limit it to part of the frame.'; s.append(n);
    propNum(s, c, 'opacity', 'Opacity %', { min: 0, max: 100 });
  }
  if (visual) {
    s = section(adj ? 'Mask position' : 'Transform');
    propNum(s, c, 'x', 'Position X', { min: -W, max: W }); propNum(s, c, 'y', 'Position Y', { min: -H, max: H });
    propNum(s, c, 'scale', 'Scale %', { min: 1, max: 400, hardMax: 2000 }); propNum(s, c, 'rot', 'Rotation °', { min: -180, max: 180 });
    if (!adj) { propNum(s, c, 'opacity', 'Opacity %', { min: 0, max: 100 }); checkRow(s, c, 'flipH', 'Flip horiz.'); checkRow(s, c, 'flipV', 'Flip vert.'); }
    const srcd = all(k => k.type === 'video' || k.type === 'image');
    if (srcd) selectRow(s, 'Aspect', FIT_MODES, () => c.props.fitMode || 'fit', v => each(k => k.props.fitMode = v), mix(k => k.props.fitMode || 'fit'));
    if (srcd && !multi)
      btnRow(s, [['Fit', () => fitFill(c, 'fit'), false, 'Show the whole picture inside the frame (100 % = fit)'],
        ['Fill', () => fitFill(c, 'fill'), false, 'Cover the whole frame, cropping the overflow (100 % = fill)']]);
    if (!adj) { propNum(s, c, 'radius', 'Corners %', { min: 0, max: 50 }); if (!simpleMode) propNum(s, c, 'feather', 'Edge feather px', { min: 0, max: 200 }); }
    secTab = 'look';
    s = section('Blend & mask');                                // After Effects-style blend modes and shape masks
    selectRow(s, 'Blend mode', BLEND_MODES, () => c.props.blend || 'normal', v => each(k => k.props.blend = v), mix(k => k.props.blend || 'normal'));
    selectRow(s, 'Mask', MASK_SHAPES, () => c.props.maskShape || 'none', v => { each(k => k.props.maskShape = v); renderInspector(true); }, mix(k => k.props.maskShape || 'none'));
    if (T.some(k => k.props.maskShape && k.props.maskShape !== 'none')) {
      propNum(s, c, 'maskX', 'Mask X %', { min: -100, max: 100 }); propNum(s, c, 'maskY', 'Mask Y %', { min: -100, max: 100 });
      propNum(s, c, 'maskW', 'Mask width %', { min: 1, max: 200, hardMax: 400 }); propNum(s, c, 'maskH', 'Mask height %', { min: 1, max: 200, hardMax: 400 });
      if (T.some(k => k.props.maskShape === 'rect')) propNum(s, c, 'maskRound', 'Mask corners %', { min: 0, max: 100 });
      propNum(s, c, 'maskFeather', 'Mask feather px', { min: 0, max: 300 });
      checkRow(s, c, 'maskInvert', 'Invert mask');
    }
    if (!simpleMode && all(k => k.type === 'video' || k.type === 'image')) {
      s = section('Crop');
      propNum(s, c, 'cropL', 'Left %', { min: 0, max: 95 }); propNum(s, c, 'cropR', 'Right %', { min: 0, max: 95 });
      propNum(s, c, 'cropT', 'Top %', { min: 0, max: 95 }); propNum(s, c, 'cropB', 'Bottom %', { min: 0, max: 95 });
    }
    const fxUsed = EFFECTS.filter(e => T.some(k => k.props[e[1]] > 0));
    if (fxUsed.length) {                                        // only the effects that are switched on; add more from the Effects tab
      s = section('Effects');
      for (const [name, key] of fxUsed) {
        propNum(s, c, key, key === 'fxKey' ? 'Key amount' : key === 'fxStrokeW' ? 'Stroke px' : name, { min: 0, max: 100 }); if (key === 'fxTint') colorRow(s, c, 'fxTintColor', 'Tint colour');
        if (key === 'fxShadow') { colorRow(s, c, 'shadowColor', 'Shadow colour'); propNum(s, c, 'shadowDist', 'Distance px', { min: 0, max: 200 }); propNum(s, c, 'shadowAngle', 'Angle °', { min: 0, max: 360 }); propNum(s, c, 'shadowBlur', 'Softness px', { min: 0, max: 100 }); }
        if (key === 'fxStrokeW') colorRow(s, c, 'fxStrokeColor', 'Stroke colour');
        if (key === 'fxWave') { propNum(s, c, 'waveFreq', 'Waves', { min: 0.5, max: 20, step: 0.5 }); propNum(s, c, 'waveSpeed', 'Wave speed', { min: -5, max: 5, step: 0.1 }); }
        if (key === 'fxGradOv') { colorRow(s, c, 'gradOvA', 'From colour'); colorRow(s, c, 'gradOvB', 'To colour'); propNum(s, c, 'gradOvAngle', 'Angle °', { min: 0, max: 360 }); }
        if (key === 'fxKey') {                                   // green screen: colour (eyedropper), edge softness, spill removal
          colorRow(s, c, 'fxKeyColor', 'Key colour');
          btnRow(s, [['Pick key colour', () => startKeyPick(c), multi, multi ? 'Select one clip to pick its key colour' : 'Then click the monitor on the background colour to remove (Esc cancels)']]);
          propNum(s, c, 'fxKeySoft', 'Edge softness', { min: 0, max: 100 }); propNum(s, c, 'fxKeySpill', 'Spill removal', { min: 0, max: 100 });
        }
      }
      btnRow(s, [['Remove all effects', () => { each(k => { for (const f of FX_KEYS) k.props[f] = 0; }); commit(); renderInspector(true); }],
        ['Save as preset…', () => presetDialog('fx', c), false, 'Keep these effect settings for any project (Effects tab → My presets)']]);
    }
    s = section('Adjust colour');                                // Simple: white balance + vibrance; Advanced: everything
    if (!simpleMode) {
    propNum(s, c, 'brightness', 'Brightness', { min: 0, max: 200 }); propNum(s, c, 'contrast', 'Contrast', { min: 0, max: 200 });
    propNum(s, c, 'saturate', 'Saturation', { min: 0, max: 200 }); propNum(s, c, 'hue', 'Hue °', { min: -180, max: 180 });
    propNum(s, c, 'gray', 'Grayscale', { min: 0, max: 100 }); propNum(s, c, 'sepia', 'Sepia', { min: 0, max: 100 });
    propNum(s, c, 'blur', 'Blur px', { min: 0, max: 40, step: 0.5 });
    }
    propNum(s, c, 'temp', 'Temperature', { min: -100, max: 100 }); propNum(s, c, 'tint', 'Tint', { min: -100, max: 100 });
    propNum(s, c, 'vibrance', 'Vibrance', { min: -100, max: 100 });
    if (!simpleMode) {
    propNum(s, c, 'lift', 'Lift (shadows)', { min: -100, max: 100 }); propNum(s, c, 'gamma', 'Gamma (mids)', { min: -100, max: 100 });
    propNum(s, c, 'gain', 'Gain (highlights)', { min: -100, max: 100 }); propNum(s, c, 'split', 'Teal / orange', { min: 0, max: 100 });
    btnRow(s, [['Save as preset…', () => presetDialog('colour', c), false, 'Keep this colour look for any project (Filters tab → My presets)']]);
    }

    s = section('Colour saturation');                           // per-colour (HSL) saturation, like Lightroom / Premiere's HSL panel
    for (const [key, label, , sw] of HSL_COLORS) {
      propNum(s, c, key, label, { min: -100, max: 100 });
      const lb = s.lastElementChild && s.lastElementChild.querySelector('label');
      if (lb) { const dot = document.createElement('i'); dot.className = 'swatch'; dot.style.background = sw; lb.prepend(dot); }
    }
    const satQuick = (o) => () => { each(k => { for (const h of HSL_KEYS) k.props[h] = o[h] ?? 0; }); commit(); renderInspector(true); };
    btnRow(s, [['Reset', satQuick({}), !T.some(satOn), 'Set every colour back to 0'],
      ['Pop skies', satQuick({ satBlue: 45, satAqua: 35 })], ['Mute greens', satQuick({ satGreen: -60, satYellow: -25 })],
      ['Only reds', satQuick({ satOrange: -100, satYellow: -100, satGreen: -100, satAqua: -100, satBlue: -100, satPurple: -100, satMagenta: -60, satRed: 30 })]]);
    const hn = div('info'); hn.textContent = 'Turn one colour range up or down without touching the others: −100 makes that colour grey, +100 doubles its saturation. Skin tones live in Oranges.'; s.append(hn);
    secTab = 'motion';
    if (!adj) {
      s = section('3D layer');                                  // tilt / turn / depth with perspective (After Effects-style 3D layer)
      propNum(s, c, 'rotX', 'Tilt X °', { min: -180, max: 180 }); propNum(s, c, 'rotY', 'Turn Y °', { min: -180, max: 180 });
      propNum(s, c, 'z', 'Depth Z px', { min: -1500, max: 3000, hardMax: 20000 });
      propNum(s, c, 'persp', 'Perspective', { min: 0, max: 100 });
      const n = div('info'); n.textContent = 'Tilt and turn the clip in real 3D around its centre. Depth pushes it away (+) or toward you (−). All three can be keyframed with ◆.'; s.append(n);
    }
    if (!multi) {
      s = section('Keyframes');
      btnRow(s, [['Graph editor…', () => graphEditor(c), !hasKf(c), hasKf(c) ? 'Fine-tune keyframe timing, values and speed curves' : 'Add keyframes with the ◆ buttons first']]);
    }
    s = section('Motion blur');
    checkRow(s, c, 'mbOn', 'Enabled');
    if (T.some(k => k.props.mbOn)) {
      const shutter = (v) => () => { each(k => k.props.mbShutter = v); commit(); renderInspector(true); };
      propNum(s, c, 'mbShutter', 'Shutter °', { min: 0, max: 360, hardMax: 720 });
      selectRow(s, 'Quality', [[4, 'Draft · 4 samples'], [8, 'Good · 8 samples'], [16, 'High · 16 samples'], [32, 'Best · 32 samples']], () => c.props.mbSamples || 8, v => each(k => k.props.mbSamples = +v), mix(k => k.props.mbSamples || 8));
      btnRow(s, [['Subtle 90°', shutter(90)], ['Film 180°', shutter(180)], ['Heavy 360°', shutter(360)]]);
    }
    const mbNote = div('info'); mbNote.textContent = 'Blurs this clip while it moves, scales or spins (keyframes, animations, transitions, shake). A bigger shutter angle gives longer streaks; more samples give smoother streaks and slower rendering. Movement inside the footage itself is not changed.'; s.append(mbNote);
    s = section('Animation');
    selectRow(s, 'Preset', ANIMS.filter(a => !TEXT_ANIMS.includes(a[0]) || all(k => k.type === 'text')), () => c.props.anim || 'none', v => each(k => k.props.anim = v), mix(k => k.props.anim || 'none'));
    const fadeMax = Math.max(0.1, Math.min(10, ...T.map(k => k.dur)));
    s = section('Transitions');
    selectRow(s, 'In style', TRANSITIONS, () => c.props.transIn || 'fade', v => each(k => k.props.transIn = v), mix(k => k.props.transIn || 'fade'));
    propNum(s, c, 'fadeIn', 'In length s', { min: 0, max: fadeMax, step: 0.05 });
    selectRow(s, 'Out style', TRANSITIONS.filter(x => !PAIR_TRANS.includes(x[0])), () => c.props.transOut || 'fade', v => each(k => k.props.transOut = v), mix(k => k.props.transOut || 'fade'));
    propNum(s, c, 'fadeOut', 'Out length s', { min: 0, max: fadeMax, step: 0.05 });
    if (T.some(k => DIR_TRANS.includes(k.props.transIn) || DIR_TRANS.includes(k.props.transOut)))
      selectRow(s, 'Direction', TRANS_DIRS, () => c.props.transDir || 'right', v => each(k => k.props.transDir = v), mix(k => k.props.transDir || 'right'));
    const lone = T.filter(k => PAIR_TRANS.includes(k.props.transIn) && !predOf(k)).length;
    if (lone) { const n = div('info'); n.textContent = `Cross-dissolve and Push blend with the clip that ends exactly where this one starts on the same track. ${lone > 1 ? `${lone} clips have` : 'This clip has'} none, so ${lone > 1 ? 'they fade' : 'it fades'} in instead.`; s.append(n); }
  }
  if (all(hasSource)) {
    secTab = 'audio';
    s = section('Audio');
    const detachedV = T.some(k => k.type === 'video' && audioDetached(k));
    propNum(s, c, 'volume', 'Volume %', { min: 0, max: simpleMode ? 200 : NORM_MAX, note: fmtDb });   // Advanced: up to +12 dB
    btnRow(s, [['Normalize', () => normalizeVol(T), detachedV && T.length === 1, 'Set the volume so the loudest moment peaks at −1 dBFS (up to +12 dB)']]);
    checkRow(s, c, 'isVoice', 'Voice');
    checkRow(s, c, 'duck', 'Duck music');
    checkRow(s, c, 'clean', 'Clean voice');
    if (!simpleMode) propNum(s, c, 'hpf', 'High-pass Hz', { min: 0, max: 300, step: 5 });
    const kpRow = !simpleMode || T.some(k => k.speed !== 1);    // only matters once the speed changes
    if (kpRow) checkRow(s, c, 'keepPitch', 'Keep pitch');
    const dn = div('info'); dn.textContent = 'Voice: this clip is speech. Duck music: this clip gets quieter whenever a Voice clip plays (music from the Sounds tab does this automatically). Clean voice: evens out speech levels.'
      + (simpleMode ? '' : ' High-pass: cuts rumble below this pitch (80 Hz suits speech, 0 = off).')
      + (kpRow ? ' Keep pitch: sped-up or slowed sound keeps its normal pitch; turn it off for a chipmunk / slowed-tape effect.' : ''); s.append(dn);
    if (all(k => k.type === 'audio')) {
      const fadeMax = Math.max(0.1, Math.min(10, ...T.map(k => k.dur)));
      propNum(s, c, 'fadeIn', 'Fade in s', { min: 0, max: fadeMax, step: 0.05 });
      propNum(s, c, 'fadeOut', 'Fade out s', { min: 0, max: fadeMax, step: 0.05 });
    } else if (visual) { const n = div('info'); n.textContent = 'The sound fades over the transition lengths set on the Motion tab.'; s.append(n); }
    if (!simpleMode) selectRow(s, 'Fade curve', FADE_CURVES, () => c.props.fadeCurve || 'linear', v => each(k => k.props.fadeCurve = v), mix(k => k.props.fadeCurve || 'linear'));
  }
  // tab bar: only tabs that have something for this clip
  const tabs = [['basic', 'Basic'], ['look', 'Look'], ['motion', 'Motion'], ['audio', 'Audio']].filter(([id]) => insp.querySelector(`.sec[data-tab="${id}"]`));
  if (!tabs.some(t => t[0] === inspTab)) inspTab = 'basic';
  const bar = div('itabs'), showTab = () => {
    insp.querySelectorAll('.sec').forEach(x => { x.hidden = x.dataset.tab !== inspTab; });
    bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === inspTab));
  };
  for (const [id, label] of tabs) { const b = document.createElement('button'); b.dataset.tab = id; b.textContent = label; b.onclick = () => { inspTab = id; showTab(); insp.scrollTop = 0; }; bar.append(b); }
  insp.prepend(bar); showTab();
}

// ───────────────────────── export ─────────────────────────
const MIMES = [
  ['MP4 (H.264 + AAC)', 'video/mp4;codecs=avc1.640028,mp4a.40.2', 'mp4'],
  ['MP4 (browser default)', 'video/mp4', 'mp4'],
  ['WebM (VP9 + Opus)', 'video/webm;codecs=vp9,opus', 'webm'],
  ['WebM (VP8 + Opus)', 'video/webm;codecs=vp8,opus', 'webm'],
];
const supportedMimes = () => MIMES.filter(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m[1]));
// file size from the bitrates (video + 192 kb/s audio); the Fast MP4 writer refuses anything over MP4_LIMIT up front
const MP4_LIMIT = 3.8e9;
const exportSizeEstimate = (bitrate, end) => (bitrate + 192000) * end / 8;
const fmtBytes = (b) => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : Math.max(1, Math.round(b / 1e6)) + ' MB';
const fmtMs = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function renderStatus(i, N, fps, secs) {                           // 'Frame i/N · 2.3× real time · about m:ss left'
  const rate = secs > 0 ? i / secs : 0, x = rate / fps;
  return `Frame ${i}/${N}` + (rate > 0 ? ` · ${x.toFixed(1)}× real time · about ${fmtMs(Math.ceil((N - i) / rate))} left` : '');
}
// the markers on either side of t (sequence start / end when there is none): {from, to} or null without markers
function markerRange(t = playhead) {
  if (!state.markers.length) return null; const eps = 0.5 / state.settings.fps;
  const prev = state.markers.filter(m => m <= t + eps), next = state.markers.filter(m => m > t + eps);
  const from = prev.length ? Math.max(...prev) : 0, to = next.length ? Math.min(...next) : projectEnd();
  return to > from ? { from, to } : null;
}
// the export range choices that apply right now: [{id, label, from, to}], 'all' first
function exportRanges() {
  const pe = projectEnd(), out = [{ id: 'all', label: 'Whole sequence', from: 0, to: pe }], io = ioRange(), sc = selClips(), mk = markerRange();
  if (io) out.push({ id: 'io', label: 'In / out points', ...io });
  if (sc.length) out.push({ id: 'sel', label: sc.length > 1 ? `Selected clips (${sc.length})` : 'Selected clip', from: Math.min(...sc.map(c => c.start)), to: Math.max(...sc.map(c => c.start + c.dur)) });
  if (mk) out.push({ id: 'mk', label: 'Between markers around the playhead', ...mk });
  return out.map(r => ({ ...r, to: Math.min(r.to, pe) })).filter(r => r.to - r.from > 1e-6);
}
// output size: `short` = target short side (0 = the project size), aspect kept, even dimensions for H.264
const EXPORT_SIZES = [[0, 'Same as project'], [2160, '2160p (4K)'], [1440, '1440p (2K)'], [1080, '1080p'], [720, '720p'], [540, '540p'], [480, '480p'], [360, '360p']], EXPORT_FPS = [0, 15, 24, 25, 30, 50, 60];
function exportDims(short) {
  const { w, h } = state.settings; if (!short) return { w, h };
  const k = short / Math.min(w, h), ev = (x) => Math.max(2, Math.round(x / 2) * 2); return { w: ev(w * k), h: ev(h * k) };
}
// Quality presets are given for 1080p at 30 fps and scale with pixels per second
const exportBitrate = (base, w, h, fps) => Math.max(5e5, Math.round(base * w * h * fps / (1920 * 1080 * 30) / 1e5) * 1e5);
const audioSizeEstimate = (fmt, len) => fmt === 'wav' ? 44 + Math.round(len * 48000) * 4 : 192000 * len / 8;
// one PNG per marker (clean frames), each saved as its own file
async function exportMarkerFrames() {
  if (!state.markers.length) { toast('Add markers first (M), then save their frames.'); return 0; }
  if (!projectEnd()) { toast('Add a clip to the timeline first.'); return 0; }
  try {
    const shots = await renderStills(state.markers);
    for (const s of shots) downloadBlob(s.blob, `${fileBase()}-marker-${tc(s.t).replace(/:/g, '-')}.png`);
    toast(`Saved ${shots.length} frame${shots.length > 1 ? 's' : ''} at markers.`); return shots.length;
  } catch (e) { toast('Could not save the frames: ' + e.message, 6000); return 0; }
}
/* Real-time render: the sequence is played once and the program canvas + audio mix are recorded.
   Resolves with {blob, ext}; rejects with 'cancelled' when cancelled (exporting.cancel() or the optional AbortSignal). onProgress receives 0..1.
   range (optional {from, to}) records only that part of the sequence. */
function exportToBlob(mime, ext, bitrate, onProgress, signal, range) {
  return new Promise(async (resolve, reject) => {
    const pe = projectEnd(), from = clamp(range ? range.from : 0, 0, pe), end = clamp(range ? range.to : pe, from, pe);
    if (!pe) return reject(new Error('The timeline is empty.'));
    if (end - from < 0.5 / state.settings.fps) return reject(new Error('The export range is empty.'));
    if (exporting) return reject(new Error('An export is already running.'));
    stop(); ensureAudio(); if (actx && actx.state === 'suspended') { try { await actx.resume(); } catch {} }
    let dest = null, rec, chunks = [], cancelled = false;
    const stream = cv.captureStream(state.settings.fps);
    if (actx) { dest = actx.createMediaStreamDestination(); master.connect(dest); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t)); }
    const cleanup = () => {
      exporting = null; document.removeEventListener('visibilitychange', onHide);
      if (dest) try { master.disconnect(dest); } catch {}
      stream.getTracks().forEach(t => t.stop()); stop(); requestRender();
    };
    const onHide = () => { if (document.hidden && exporting) { exporting.cancel(); reject(new Error('Export stopped: the tab was hidden. Keep this tab visible while rendering.')); } };
    try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 192000 }); }
    catch (e) { stream.getTracks().forEach(t => t.stop()); return reject(new Error('Recorder could not start: ' + e.message)); }
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onerror = (e) => { cancelled = true; cleanup(); reject(new Error('Recorder error: ' + (e.error && e.error.name))); };
    rec.onstop = () => { cleanup(); if (cancelled) reject(new Error('cancelled')); else resolve({ blob: new Blob(chunks, { type: mime.split(';')[0] }), ext }); };
    exporting = {
      end, progress: (t) => onProgress && onProgress((t - from) / (end - from), `Recording… ${tc(t - from)} / ${tc(end - from)}`),
      finish: () => setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 150),   // let the last frame flush
      cancel: () => { cancelled = true; if (rec.state !== 'inactive') rec.stop(); else { cleanup(); reject(new Error('cancelled')); } },
    };
    const me = exporting;
    if (signal) { if (signal.aborted) return me.cancel(); signal.addEventListener('abort', () => { if (exporting === me) me.cancel(); }, { once: true }); }
    document.addEventListener('visibilitychange', onHide);
    playhead = from; updatePlayheadUI(); requestRender();
    // pre-roll: wait until every clip active at `from` has a decoded frame
    for (let i = 0; i < 40; i++) {
      await wait(100);
      const pending = state.clips.some(c => hasSource(c) && c.start <= from && c.start + c.dur > from && (() => { const e = els.get(c.id); return !e || e.el.readyState < 2 || e.el.seeking; })());
      if (!pending) break;
    }
    if (cancelled) return;
    rec.start(500); play();
  });
}
function saveProjectFile() {
  const b = projectToBlob();
  downloadBlob(b, `${fileBase()}.framewright`);
  toast(`Saved project file (${(b.size / 1e6).toFixed(1)} MB).`);
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
function openModal(build) { const box = $('#modalBox'); box.innerHTML = ''; box.className = ''; build(box); $('#modal').hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function exportDialog() {
  const end = projectEnd(); if (!end) { toast('Add a clip to the timeline first.'); return; }
  const mimes = supportedMimes(), fast = typeof fastExportSupported === 'function' && fastExportSupported();
  if (!mimes.length && !fast) toast('This browser has no video encoder available; only audio export works.');   // WAV needs no encoder
  openModal((box) => {
    const ranges = exportRanges(), S = state.settings, opt = (v, t) => `<option value="${v}">${t}</option>`;
    box.innerHTML = `<h2>Export</h2>
      <div class="frow"><label>Mode</label><select id="exMode">${fast ? opt('fast', 'Fast · offline render, MP4 (H.264 + AAC)') : ''}${mimes.length ? opt('rt', 'Real-time · records playback') : ''}${opt('wav', 'Audio only · WAV (16-bit PCM)')}${'AudioEncoder' in window ? opt('m4a', 'Audio only · M4A (AAC)') : ''}</select></div>
      <div class="frow" id="exFmtRow"><label>Format</label><select id="exFmt"></select></div>
      <div class="frow"><label>Range</label><select id="exRange">${ranges.map(r => opt(r.id, `${r.label} · ${tc(r.from)} – ${tc(r.to)}`)).join('')}</select></div>
      <div class="frow" id="exResRow"><label>Size</label><select id="exRes">${EXPORT_SIZES.map(([v, t]) => opt(v, v ? `${t} · ${exportDims(v).w}×${exportDims(v).h}` : `${t} · ${S.w}×${S.h}`)).join('')}</select></div>
      <div class="frow" id="exFpsRow"><label>Frame rate</label><select id="exFps">${EXPORT_FPS.map(v => opt(v, v ? `${v} fps` : `Same as project · ${S.fps} fps`)).join('')}</select></div>
      <div class="frow" id="exQRow"><label>Quality</label><select id="exQ"><option value="4000000">Draft</option><option value="10000000" selected>High</option><option value="25000000">Max</option></select></div>
      <div class="frow"><label>Output</label><span><span id="exOut"></span> · <span id="exSize"></span></span></div>
      <p class="info" id="exNote"></p>
      <div class="bar" id="exBar" hidden><div></div></div><div id="exMsg" class="info"></div>
      <div class="mbtns" style="justify-content:space-between"><span style="display:flex;gap:8px"><button id="exFrame" title="Save the frame at the playhead as a PNG image">Save current frame (PNG)</button><button id="exMarks" title="Save one PNG image at each timeline marker"${state.markers.length ? '' : ' disabled'}>Save frames at markers (PNG each)</button></span><span style="display:flex;gap:8px"><button id="exCancel">Cancel</button><button id="exGo" class="primary">Render</button></span></div>`;
    $('#exFrame', box).onclick = () => { closeModal(); exportFrame(); };
    $('#exMarks', box).onclick = () => { closeModal(); exportMarkerFrames(); };
    const fmt = $('#exFmt', box); mimes.forEach((m, i) => { const o = document.createElement('option'); o.value = i; o.textContent = m[0]; fmt.append(o); });
    const rSel = $('#exRange', box), resSel = $('#exRes', box), fpsSel = $('#exFps', box);
    if (ranges.some(r => r.id === 'io')) rSel.value = 'io';      // in / out points set: export them by default
    const pick = () => {                                          // the current choices: range, size, rate, bitrate
      const r = ranges.find(x => x.id === rSel.value) || ranges[0], isFast = mode.value === 'fast';
      const d = isFast ? exportDims(+resSel.value) : { w: S.w, h: S.h }, fps = isFast && +fpsSel.value || S.fps;   // size / rate overrides: Fast only
      return { from: r.from, to: r.to, len: r.to - r.from, ...d, fps, bitrate: exportBitrate(+qSel.value, d.w, d.h, fps), audio: mode.value === 'wav' || mode.value === 'm4a' };
    };
    // while a render runs, Cancel only asks it to stop: the dialog closes once the export call has actually returned
    let ac = null; const cancelBtn = $('#exCancel', box);
    cancelBtn.onclick = () => {
      if (!ac) { closeModal(); return; }
      ac.abort(); if (exporting) exporting.cancel();
      cancelBtn.disabled = true; $('#exMsg', box).textContent = 'Cancelling…';
    };
    const mode = $('#exMode', box), qSel = $('#exQ', box), ctls = [mode, qSel, rSel, resSel, fpsSel, fmt];
    const syncMode = () => {
      const isFast = mode.value === 'fast', o = pick();
      $('#exFmtRow', box).hidden = mode.value !== 'rt'; $('#exResRow', box).hidden = $('#exFpsRow', box).hidden = o.audio; $('#exQRow', box).hidden = o.audio;
      for (const s of [resSel, fpsSel]) { if (!ac) s.disabled = !isFast; s.title = isFast ? '' : 'Switch Mode to Fast to change the size or frame rate'; }
      if (!isFast) { resSel.value = '0'; fpsSel.value = '0'; }
      [...qSel.options].forEach(op => { op.textContent = `${{ 4000000: 'Draft', 10000000: 'High', 25000000: 'Max' }[op.value]} · ${(exportBitrate(+op.value, o.w, o.h, o.fps) / 1e6).toFixed(1).replace(/\.0$/, '')} Mbps`; });
      $('#exNote', box).textContent = isFast
        ? 'Renders frame by frame without playing the sequence. H.264 MP4/MOV sources decode fastest; other formats are read by seeking and can be slower. Speed-changed audio keeps its pitch, as in the preview, unless "Keep pitch" is off for that clip.'
        : o.audio ? 'Exports the sound mix only (volume, fades, ducking and keyframes as in the preview), 48 kHz stereo.'
        : `Records the sequence while it plays (about ${Math.ceil(o.len)} s). Keep this tab visible until it finishes.`;
      $('#exOut', box).textContent = o.audio ? `${mode.value === 'wav' ? 'WAV 16-bit' : 'M4A AAC 192 kb/s'} · 48 kHz stereo · ${tc(o.len)}` : `${o.w}×${o.h} · ${o.fps} fps · ${tc(o.len)}`;
      const est = o.audio ? audioSizeEstimate(mode.value, o.len) : exportSizeEstimate(o.bitrate, o.len), over = isFast && est > MP4_LIMIT, sz = $('#exSize', box);
      sz.textContent = `about ${fmtBytes(est)}` + (over ? ' — over the 4 GB MP4 limit; choose a lower quality' : '');
      sz.classList.toggle('overLimit', over); if (!ac) $('#exGo', box).disabled = over;
    };
    ctls.forEach(s => s.onchange = syncMode); syncMode();
    $('#exGo', box).onclick = async () => {
      const bar = $('#exBar', box), o = pick(); bar.hidden = false; $('#exGo', box).disabled = true; ctls.forEach(s => s.disabled = true);
      ac = new AbortController(); cancelBtn.disabled = false;
      const prog = (p, msg) => { if (ac.signal.aborted) return; bar.firstChild.style.width = (p * 100).toFixed(1) + '%'; $('#exMsg', box).textContent = msg || `Rendering… ${(p * 100).toFixed(0)}%`; };
      try {
        let r;
        if (mode.value === 'fast') r = await exportFast(o.bitrate, prog, ac.signal, o);
        else if (o.audio) r = await exportAudio(mode.value, prog, ac.signal, o);
        else { const m = mimes[+fmt.value]; r = await exportToBlob(m[1], m[2], o.bitrate, prog, ac.signal, o); }
        if (ac.signal.aborted) throw new Error('cancelled');
        downloadBlob(r.blob, `${fileBase()}${o.from > 0 || o.to < projectEnd() - 1e-6 ? `-${tc(o.from).replace(/:/g, '-')}` : ''}.${r.ext}`); closeModal();
        const miss = r.stats && r.stats.audioDropped && r.stats.audioDropped.length ? ` Audio missing for: ${r.stats.audioDropped.join(', ')}.` : '';
        toast(`Exported ${(r.blob.size / 1e6).toFixed(1)} MB ${r.ext.toUpperCase()}` + (r.stats ? ` in ${r.stats.seconds.toFixed(1)} s (${r.stats.speed.toFixed(1)}× real time).` : '.') + miss, miss ? 12000 : 7000);
      } catch (e) {
        if (ac.signal.aborted || e.message === 'cancelled') { closeModal(); toast('Export cancelled.', 2500); }
        else if (!$('#modal').hidden) { $('#exMsg', box).textContent = e.message + (mode.value === 'fast' && mimes.length ? ' You can switch Mode to Real-time.' : ''); }
      } finally { ac = null; cancelBtn.disabled = false; ctls.forEach(s => s.disabled = false); syncMode(); }   // syncMode re-disables size / rate outside Fast
    };
  });
}
function exportFrame() {
  cleanFrame = true; drawFrame(); cleanFrame = false;
  cv.toBlob((b) => { if (b) downloadBlob(b, `${fileBase()}-frame-${tc(playhead).replace(/:/g, '-')}.png`); requestRender(); }, 'image/png');
}
function shortcutsDialog() {
  const keys = [['Space', 'Play / pause'], ['← / →', 'Step one frame (Shift: 10 frames)'], ['Home / End', 'Go to start / end'], ['J / K / L', 'Back 1 s / pause / play'],
    ['↑ / ↓', 'Previous / next edit point (clip start or end)'], ['Shift+↑ / ↓', 'Previous / next marker'],
    ['Q / W', 'Trim start / end of the clip under the playhead to it (selected clips first)'], ['Shift+Q / W', 'Ripple trim: later clips on the track close the gap'],
    ['Alt+← / →', 'Nudge selected clips one frame (Shift: 10 frames)'],
    ['I / O', 'Set sequence in / out point at the playhead'], ['Alt+X', 'Clear in / out points'],
    ['Ctrl+Shift+A', 'Select every clip from the playhead on (right-click a track: from here)'],
    ['Alt+drag clip (Advanced)', 'Slip: change which part of the source plays, clip stays put'],
    ['Right-click track name (Advanced)', 'Move track up / down (video: in front / behind)'],
    ['Space, J/K/L or timeline click (recording)', 'Stop the voiceover recording'],
    ['Double-click a media name', 'Rename it in the bin (right-click a media item: select its clips, relink, remove)'],
    ['V / C', 'Selection tool / razor tool'], ['S or Ctrl+K', 'Split at playhead (selected clips, else every clip there)'], ['Del', 'Delete clip'], ['Shift+Del', 'Ripple delete'],
    ['Ctrl+C / X / V / D', 'Copy / cut / paste at playhead / duplicate the selection'],
    ['Ctrl+Alt+C / Ctrl+Alt+V', 'Copy a clip\'s attributes / paste chosen groups (transform, colour, effects…) onto the selected clips'],
    ['Drag a property name (Inspector)', 'Scrub its value (Shift ×10, Alt ×0.1); number fields also take +=20, -=15, *2, /2'], ['Ctrl+S', 'Save a project file'], ['Ctrl+Z / Ctrl+Y', 'Undo / redo'], ['Shift / Ctrl + click', 'Add or remove a clip from the selection'], ['Alt + click / drag', 'Select, move or trim one clip of a linked video / audio pair on its own (right-click: Unlink; Advanced: Alt-dragging a video/audio clip body slips it)'], ['Drag on empty track', 'Box-select clips'], ['Ctrl+A', 'Select all clips'], ['M', 'Add / remove a marker at the playhead'], ['F', 'Freeze frame at the playhead (2 s)'], ['N', 'Toggle snapping'], ['G', 'Toggle safe-area guides'], ['Right-click', 'Clip / track menu on the timeline'], ['+ / −', 'Zoom timeline (also Ctrl+wheel)'], ['\\', 'Fit sequence to window'],
    ['Double-click slider', 'Reset that property'], ['Drag round handle (monitor)', 'Rotate the selected clip (Shift: 15° steps)'], ['◆ in Inspector', 'Add / remove a keyframe at the playhead (◀ / ▶ beside it: previous / next key of that property)'],
    ['[ / ]', 'Previous / next keyframe of the selected clip (any property)'],
    ['Right-click ◆ or a timeline keyframe', 'Easing: linear, ease in / out / in-out, hold']];
  openModal((box) => {
    const h = document.createElement('h2'); h.textContent = 'Keyboard shortcuts'; const t = document.createElement('table');
    for (const [k, d] of keys) { const r = t.insertRow(); r.insertCell().textContent = k; r.insertCell().textContent = d; }
    const b = div('mbtns'), c = document.createElement('button'); c.textContent = 'Close'; c.onclick = closeModal; b.append(c); box.append(h, t, b);
  });
}

// ───────────────────────── wiring ─────────────────────────
function refreshAll(forceInspector) {
  syncSel();
  renderTimeline(); renderInspector(forceInspector); requestRender(); binSync();
  $('#btnUndo').disabled = !hist.undo.length; $('#btnRedo').disabled = !hist.redo.length;
  updateStatus(); renderLib();
  if (document.activeElement !== $('#projName')) $('#projName').value = projTitle();
  document.title = projTitle() + ' — Arcanix';
}
function setTool(t) { tool = t; $('#toolSelect').classList.toggle('on', t === 'select'); $('#toolRazor').classList.toggle('on', t === 'razor'); document.body.classList.toggle('razor', t === 'razor'); updateStatus(); }
function toggleSnap() { snapOn = !snapOn; $('#btnSnap').classList.toggle('on', snapOn); }
async function newProject() {
  if ((state.clips.length || media.size) && !confirm('Start a new project? The current timeline and imported media will be cleared.')) return;
  stop(); state.settings = { w: 1920, h: 1080, fps: 30, name: 'Untitled project' }; state.tracks = defaultTracks(); state.clips = []; state.markers = []; setIO({});
  for (const m of media.values()) URL.revokeObjectURL(m.url); media.clear(); sel = null; playhead = 0;
  hist.undo.length = hist.redo.length = 0; lastSnap = snapshot(); pruneEls(); purgeTombs(true); mediaUnsaved = 0;
  try { await DB.run('media', 'readwrite', s => s.clear()); } catch {}
  scheduleSave(); renderBin(); refreshAll(true);
}
$('#btnSettings').onclick = settingsDialog;
$('#btnImport').onclick = () => $('#fileInput').click();
$('#fileInput').onchange = (e) => { importFiles([...e.target.files]); e.target.value = ''; };
// panel sizes: CSS variables on <body>, remembered per browser
const LAYOUT_KEY = 'cutroom.layout';
function setLayoutVar(name, px) {
  document.body.style.setProperty(name, px + 'px');
  try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); o[name] = px; localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch {}
}
try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); for (const k of ['--binW', '--inspW', '--tlH']) if (typeof o[k] === 'number') document.body.style.setProperty(k, o[k] + 'px'); } catch {}
// keep the applied timeline height inside the window (the stored preference is left alone, so it returns on a taller window)
let tlPref = null;
try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); if (typeof o['--tlH'] === 'number') tlPref = o['--tlH']; } catch {}
function clampTl(pref = tlPref) {
  const want = pref ?? parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--tlH'));   // :root default
  if (want) document.body.style.setProperty('--tlH', Math.round(clamp(want, 150, Math.max(150, window.innerHeight - 220))) + 'px');
}
clampTl(); window.addEventListener('resize', clampTl);
// resize handles: drag (whole panel edge, generous grab zone), double-click to reset, or focus + arrow keys (Shift = bigger steps)
const sideMax = () => Math.max(300, Math.round(window.innerWidth * 0.45));
const tlMax = () => Math.max(150, window.innerHeight - 220);
function resetLayoutVar(name) {
  document.body.style.removeProperty(name);
  try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); delete o[name]; localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch {}
  if (name === '--tlH') { tlPref = null; clampTl(); }
  requestRender();
}
const curVar = (name) => parseFloat(getComputedStyle(document.body).getPropertyValue(name)) || 300;
function splitter(id, cssVar, fromEvent, set, keyDir) {
  const el = $(id);
  el.tabIndex = 0; el.setAttribute('role', 'separator'); el.title = 'Drag to resize · double-click to reset · arrow keys when focused';
  el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); el.classList.add('drag'); document.body.classList.add('resizing'); dragLoop((e) => set(fromEvent(e)), () => { el.classList.remove('drag'); document.body.classList.remove('resizing'); requestRender(); }); });
  el.addEventListener('dblclick', () => resetLayoutVar(cssVar));
  el.addEventListener('keydown', (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }[e.key]; if (!d) return;
    e.preventDefault(); e.stopPropagation(); set(curVar(cssVar) + d * keyDir * (e.shiftKey ? 50 : 10));
  });
}
splitter('#tlSplit', '--tlH', (e) => window.innerHeight - e.clientY - 24, (v) => setLayoutVar('--tlH', tlPref = Math.round(clamp(v, 150, tlMax()))), -1);
splitter('#splitL', '--binW', (e) => e.clientX, (v) => setLayoutVar('--binW', Math.round(clamp(v, 200, sideMax()))), 1);
splitter('#splitR', '--inspW', (e) => window.innerWidth - e.clientX, (v) => setLayoutVar('--inspW', Math.round(clamp(v, 230, sideMax()))), -1);
document.querySelectorAll('[data-icon]').forEach(b => b.insertAdjacentHTML('afterbegin', icon(b.dataset.icon)));
// collapsible side panels ('lib' = library, 'insp' = Inspector); remembered with the panel sizes
const panelOpen = (which) => !document.body.classList.contains(which + '-collapsed');
function setPanel(which, open) {
  document.body.classList.toggle(which + '-collapsed', !open);
  $(which === 'lib' ? '#btnTogLib' : '#btnTogInsp').classList.toggle('on', open);
  try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); o[which + 'Open'] = open; localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch {}
  requestRender();
}
try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); if (o.libOpen === false) setPanel('lib', false); if (o.inspOpen === false) setPanel('insp', false); } catch {}
$('#btnTogLib').onclick = () => setPanel('lib', !panelOpen('lib'));
$('#btnTogInsp').onclick = () => setPanel('insp', !panelOpen('insp'));
// project name: shown in the top bar, used for the window title and exported file names
const projTitle = () => state.settings.name || 'Untitled project';
const fileBase = () => projTitle().replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'framewright';
$('#projName').onchange = (e) => { state.settings.name = e.target.value.trim().slice(0, 80) || 'Untitled project'; commit(); };
$('#projName').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };

// ── Simple / Advanced mode ──
function setMode(simple) {
  simpleMode = simple; document.body.classList.toggle('simple', simple);
  $('#btnSimple').classList.toggle('on', simple); $('#btnAdv').classList.toggle('on', !simple);
  if (simple) { setTool('select'); if (!snapOn) toggleSnap(); if (guidesOn) toggleGuides(); }
  try { const o = JSON.parse(localStorage.getItem(LAYOUT_KEY) || '{}'); o.simple = simple; localStorage.setItem(LAYOUT_KEY, JSON.stringify(o)); } catch {}
  renderTimeline(); renderInspector(true); updateStatus();
}
$('#btnSimple').onclick = () => setMode(true); $('#btnAdv').onclick = () => setMode(false);
$('#btnSimple').classList.toggle('on', simpleMode); $('#btnAdv').classList.toggle('on', !simpleMode);

// ── start screen: frame shape ──
document.querySelectorAll('.fmtRow button').forEach(b => b.onclick = () => {
  const [w, h] = b.dataset.res.split('x').map(Number); state.settings.w = w; state.settings.h = h; commit();
});

// ── freeze frame: hold the picture at the playhead for `len` seconds, pushing later clips on that track along ──
async function freezeFrame(len = 2) {
  const t0 = frameRound(playhead), on = (k) => k.type === 'video' && t0 >= k.start && t0 < k.start + k.dur - 1e-6;
  let c = clipById(sel);
  if (!c || !on(c)) {                                           // else the topmost visible video clip under the playhead
    c = null;
    for (const tr of state.tracks.filter(t => t.kind === 'video' && !t.hidden)) { c = state.clips.find(k => k.track === tr.id && on(k)); if (c) break; }
  }
  if (!c) { toast('Put the playhead over a video clip first.', 2500); return; }
  if (trackById(c.track)?.locked) { toast('That track is locked.', 2000); return; }
  stop();
  const e = getEl(c); if (!e) { toast('The source video is missing.'); return; }
  const el = e.el;
  if (el.readyState < 1) await once(el, 'loadedmetadata', 8000);
  el.currentTime = c.in + (t0 - c.start) * c.speed; await once(el, 'seeked', 8000);
  if (el.readyState < 2) await once(el, 'loadeddata', 5000);
  if (!el.videoWidth) { toast('Could not read the video frame.'); return; }
  const g = document.createElement('canvas'); g.width = el.videoWidth; g.height = el.videoHeight; g.getContext('2d').drawImage(el, 0, 0);
  const blob = await new Promise(r => g.toBlob(r, 'image/png')); if (!blob) { toast('Could not capture the frame.'); return; }
  const [m] = await importFiles([new File([blob], `${c.name.replace(/\.[^.]+$/, '')} — freeze ${tc(t0).replace(/:/g, '.')}.png`, { type: 'image/png' })]);
  if (!m) return;
  insertFreeze(c, t0, m, len);
  toast('Added a 2 s freeze frame. Drag its right edge to change the length.', 3500);
}
// timeline half of freezeFrame: still `m` (the frame at t0) goes into video clip c, rippling c's track and the tracks of its detached audio
function insertFreeze(c, t0, m, len = 2) {
  // the still keeps how the clip looks at t0 (position, scale, colour, effects), without its motion or sound
  const props = { ...c.props, volume: 100, fadeIn: 0, fadeOut: 0, anim: 'none', mbOn: false, audioDetached: false };
  for (const k of ANIM) props[k] = +val(c, k, t0).toFixed(2);
  // where it goes: at the cut, or right before / after c when t0 is too close to an edge to split (splitClip refuses there)
  const at = t0 <= c.start + MIN_DUR ? c.start : t0 >= c.start + c.dur - MIN_DUR ? c.start + c.dur : t0;
  // audio clips of the same footage that play in sync with c (detached audio) — ripple their tracks too, unless locked
  const org = c.start - c.in / c.speed;
  // linked clips: exactly the linked audio; older projects without links: same media playing in sync
  const synced = (c.link ? linkedOf(c) : state.clips).filter(o => o.type === 'audio' && o.start + o.dur > at + 1e-6 &&
    (c.link || (o.mediaId === c.mediaId && o.speed === c.speed && Math.abs(o.start - o.in / o.speed - org) < 1e-3)));
  const aTracks = new Set(synced.filter(o => !trackById(o.track)?.locked).map(o => o.track));
  if (at === t0) splitClip(c, t0);                              // also splits c's linked audio, pairing the halves
  for (const o of synced) if (aTracks.has(o.track) && o.start < at - 1e-6) splitClip(o, at, true);   // the sound pauses for the still, like the picture
  for (const o of state.clips) if ((o.track === c.track || aTracks.has(o.track)) && o.start >= at - 1e-6) o.start += len;   // moving later never creates overlaps
  const f = { id: uid(), type: 'image', mediaId: m.id, name: 'Freeze frame', track: c.track, start: at, dur: len, in: 0, speed: 1, props };
  state.clips.push(f); sel = f.id; selSet = new Set([f.id]); commit(); renderInspector(true);
  if (synced.some(o => !aTracks.has(o.track))) toast('An audio track with this clip\'s sound is locked, so it was not moved and is now out of sync.', 4500);
  return f;
}
$('#btnFreeze').onclick = () => freezeFrame();

// ── close gaps: remove stretches of time where no track has anything, moving everything after them left ──
function closeGaps() {
  if (state.tracks.some(t => t.locked && state.clips.some(c => c.track === t.id))) { toast('Unlock all tracks first, so everything moves together.', 3000); return; }
  const iv = state.clips.map(c => [c.start, c.start + c.dur]).sort((a, b) => a[0] - b[0]), gaps = [];
  let end = 0;
  for (const [s, e] of iv) { if (s > end + 1e-3) gaps.push([end, s]); end = Math.max(end, e); }
  if (!gaps.length) { toast('There are no gaps to close.', 2000); return; }
  // frame-round the shift, not each new start, so clips that touch keep touching; never shift past a gap's real length (no overlaps)
  let acc = 0, prev = 0;
  const shifts = gaps.map(([gs, ge]) => { acc += ge - gs; return (prev = Math.min(frameRound(acc), prev + ge - gs)); });
  const shiftAt = (t) => gaps.reduce((v, [, ge], i) => ge <= t + 1e-6 ? shifts[i] : v, 0);
  for (const c of state.clips) c.start = Math.max(0, c.start - shiftAt(c.start));
  state.markers = state.markers.map(m => Math.max(0, m - shiftAt(m)));
  const total = gaps.reduce((v, [gs, ge]) => v + ge - gs, 0);
  commit(); toast(`Closed ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${total.toFixed(1)} s).`, 2500);
}
$('#btnGaps').onclick = closeGaps;

// ── voiceover: record the microphone while the timeline plays, then drop the take on an audio track ──
let vo = null;
async function toggleVoiceover() {
  if (vo) { const v = vo; vo = null; stop(); if (v.rec.state !== 'inactive') v.rec.stop(); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { toast('Recording is not available here.'); return; }
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); }
  catch (e) { toast(`No microphone available, or access was refused (${e.name || 'error'}).`, 6000); return; }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => MediaRecorder.isTypeSupported(m)) || '';
  let rec;
  try { rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : {}); }
  catch (e) { stream.getTracks().forEach(t => t.stop()); toast('Could not start recording: ' + e.message); return; }
  const chunks = [], t0 = frameRound(playhead), btn = $('#btnVoice');
  const v = { rec, recW: performance.now(), playW: null, outLat: 0, inLat: 0 };
  rec.onstart = () => { v.recW = performance.now(); };
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    btn.classList.remove('rec'); btn.querySelector('span').textContent = 'Voiceover';
    const blob = new Blob(chunks, { type: (rec.mimeType || mime || 'audio/webm').split(';')[0] });
    if (blob.size < 2000) { toast('The recording was empty.', 2500); return; }
    const n = state.clips.filter(c => /^Voiceover/.test(c.name)).length + 1;
    const [m] = await importFiles([new File([blob], `Voiceover ${n}.webm`, { type: blob.type })]);
    if (!m) return;
    const { start, head } = voPlace(t0, voLatency(v.recW, v.playW, v.outLat, v.inLat));
    const probe = { id: 'probe', dur: m.dur - head };
    const tr = state.tracks.find(t => t.kind === 'audio' && !t.locked && place(probe, t.id, start) === start) || addTrack('audio', true);
    addMediaClip(m, tr.id, start, { isVoice: true, hpf: 80 }, head);   // high-pass at 80 Hz takes out mic rumble and handling noise
    setPlayhead(t0);
    toast(`Added "${m.name}" (${m.dur.toFixed(1)} s).`, 3000);
  };
  vo = v;
  rec.start(250);
  btn.classList.add('rec'); btn.querySelector('span').textContent = 'Stop';
  if (projectEnd() > playhead + 0.05) { play(); if (playing) v.playW = playW0; }   // talk over the picture
  v.outLat = actx ? (actx.outputLatency || actx.baseLatency || 0) : 0;
  try { v.inLat = stream.getAudioTracks()[0].getSettings().latency || 0; } catch {}
  toast('Recording… press Stop, Space or K when you are done.', 2500);
}
/* How late the take is against the picture, in seconds: the recorder starting after (or before) playback, plus the time
   the picture's sound takes to reach the speaker (outLat) and the voice to reach the recorder (inLat). Without playback
   there is no picture to follow, so only the input latency counts. */
function voLatency(recW, playW, outLat, inLat) {
  const off = playW == null ? (inLat || 0) : (playW - recW) / 1000 + (outLat || 0) + (inLat || 0);
  return clamp(off, -1, 1);
}
// a late take loses its head (source in); an early one starts later on the timeline
const voPlace = (t0, off) => off >= 0 ? { start: t0, head: off } : { start: frameRound(t0 - off), head: 0 };
// while recording, the transport keys / timeline clicks end the take instead of moving the playhead under it
function voStop() { if (!vo) return false; toggleVoiceover(); return true; }
$('#btnVoice').onclick = toggleVoiceover;
$('#btnEmptyImport').onclick = () => $('#fileInput').click();
$('#btnGuides').onclick = toggleGuides;
function toggleGuides() { guidesOn = !guidesOn; $('#btnGuides').classList.toggle('on', guidesOn); requestRender(); }
function updateStatus() {
  const hints = {
    select: 'Select — drag clips to move, drag their edges to trim, right-click for more. On the monitor: drag to reposition, drag a corner handle to scale, drag the round handle to rotate (Shift snaps).',
    razor: 'Razor — click a clip to cut it at that point. Press V to go back to Select.',
  };
  const n = state.clips.length;
  $('#stHint').textContent = hints[tool];
  $('#stInfo').textContent = `${state.settings.w}×${state.settings.h} · ${state.settings.fps} fps · ${n} clip${n === 1 ? '' : 's'}`;
  $('#emptyState').hidden = !!(media.size || n);
  $('#binCount').textContent = libTab === 'media' && media.size ? String(media.size) : '';
  document.querySelectorAll('.fmtRow button').forEach(b => b.classList.toggle('on', b.dataset.res === `${state.settings.w}x${state.settings.h}`));
  if (simpleMode) $('#stHint').textContent = 'Drag clips to move them, drag their edges to trim. Right-click a clip for more. Space plays.';
}

// ───────────────────────── library: one-click text, stickers, effects, filters, transitions ─────────────────────────
const TABS = [['media', 'Media', 'film'], ['text', 'Text', 'text'], ['sounds', 'Sounds', 'note'], ['stickers', 'Stickers', 'smile'], ['effects', 'Effects', 'spark'], ['filters', 'Filters', 'drop'], ['trans', 'Transitions', 'swap'], ['anim', 'Animate', 'motion']];
const ANIMS = [['none', 'None'], ['pop', 'Pop in'], ['drop', 'Drop in'], ['float', 'Float'], ['pulse', 'Pulse'], ['wiggle', 'Wiggle'], ['spin', 'Spin'], ['kenburns', 'Slow zoom in'], ['kenburnsOut', 'Slow zoom out'], ['typewriter', 'Typewriter'], ['wordpop', 'Word pop'], ['linerise', 'Line rise']];
const FILTER_BASE = { brightness: 100, contrast: 100, saturate: 100, hue: 0, gray: 0, sepia: 0, blur: 0, temp: 0, tint: 0, vibrance: 0, lift: 0, gamma: 0, gain: 0, split: 0,
  satRed: 0, satOrange: 0, satYellow: 0, satGreen: 0, satAqua: 0, satBlue: 0, satPurple: 0, satMagenta: 0 };
const FILTERS = [['Original', {}], ['B&W', { gray: 100, contrast: 115 }], ['Noir', { gray: 100, contrast: 150, brightness: 90 }], ['Vivid', { saturate: 160, contrast: 112 }],
  ['Warm', { temp: 45, vibrance: 15 }], ['Cool', { temp: -40, tint: 5, contrast: 105 }], ['Teal & orange', { split: 70, vibrance: 30, contrast: 112 }],
  ['Faded film', { lift: 22, gain: -8, contrast: 90, saturate: 80, temp: 10 }], ['Faded', { contrast: 82, brightness: 110, saturate: 78 }],
  ['Vintage', { sepia: 55, contrast: 92, saturate: 85 }], ['Sepia', { sepia: 100 }], ['Dramatic', { contrast: 140, saturate: 85, brightness: 92 }],
  ['Dream', { blur: 2, brightness: 112, saturate: 120 }], ['Night', { brightness: 70, contrast: 120, hue: 40, saturate: 70 }],
  ['Red pop', { satOrange: -100, satYellow: -100, satGreen: -100, satAqua: -100, satBlue: -100, satPurple: -100, satMagenta: -60, satRed: 35, contrast: 108 }],
  ['Blue skies', { satBlue: 50, satAqua: 40, satGreen: -15, contrast: 105 }], ['Autumn', { satOrange: 45, satRed: 25, satYellow: 30, satGreen: -55, temp: 18 }],
  ['Cyberpunk', { satMagenta: 60, satPurple: 50, satAqua: 45, satGreen: -70, satYellow: -40, contrast: 115, tint: 15 }], ['Muted earth', { satGreen: -45, satBlue: -40, satAqua: -40, satOrange: 10, contrast: 96 }]];
const EFFECTS = [['Vignette', 'fxVignette', 60], ['Tint', 'fxTint', 50], ['Grain', 'fxGrain', 55], ['Glow', 'fxGlow', 55], ['Pixelate', 'fxPixel', 40], ['Shake', 'fxShake', 40], ['Green screen key', 'fxKey', 60], ...EFFECTS_MORE];
const FX_KEYS = EFFECTS.map(e => e[1]);
const FX_EXTRA = ['fxTintColor', 'fxKeyColor', 'fxKeySoft', 'fxKeySpill', ...FX_MORE_EXTRA];   // settings that travel with the effects (presets, paste attributes)
const TRANSITIONS = [['fade', 'Fade'], ['dissolve', 'Cross-dissolve'], ['push', 'Push'], ['wipe', 'Wipe'], ['clock', 'Clock wipe'], ['slide', 'Slide'], ['whip', 'Whip pan'], ['zoom', 'Zoom'], ['blur', 'Blur'], ['iris', 'Iris'], ['spin', 'Spin'], ['bounce', 'Bounce'], ['drop', 'Drop'], ['roll', 'Roll'], ['split', 'Split (barn door)'], ['zoomout', 'Zoom out'], ['flash', 'Flash'], ['glitch', 'Glitch'], ['spinblur', 'Spin blur']];
const DIR_TRANS = ['wipe', 'slide', 'push', 'whip'];             // styles that use transDir
const TRANS_DIRS = [['right', 'Left → right'], ['left', 'Right → left'], ['down', 'Top → bottom'], ['up', 'Bottom → top']];
// apply a transition style to the start / end / both of each clip; one undo step. Dissolve / push only go on a start
// that touches the previous clip on its track; without one the start gets a fade and a toast says why.
function applyTrans(style, where, ts = targetClips()) {
  ts = ts.filter(unlockedC); if (!ts.length) return 0;
  const pair = PAIR_TRANS.includes(style); let lone = 0;
  for (const t of ts) {
    const d = Math.min(0.6, t.dur / 2);
    if (where !== 'out') { const alone = pair && !predOf(t); if (alone) lone++; t.props.transIn = alone ? 'fade' : style; if (!(t.props.fadeIn > 0)) t.props.fadeIn = d; }
    if (where !== 'in' && !pair) { t.props.transOut = style; if (!(t.props.fadeOut > 0)) t.props.fadeOut = d; }
  }
  commit(); renderInspector(true);
  if (lone) toast(`${lone > 1 ? `${lone} clips have` : 'This clip has'} no clip ending exactly where ${lone > 1 ? 'they start' : 'it starts'} on the same track, so a fade was used. Put two clips edge to edge to ${style === 'push' ? 'push' : 'cross-dissolve'} between them.`, 4500);
  return ts.length;
}
const TEXT_PRESETS = [
  ['Title', { text: 'Your title', size: 130 }, 'font:700 15px "Segoe UI";color:#fff'],
  ['Subtitle', { text: 'Subtitle text', size: 64, bold: false, y: 140 }, 'font:400 11px "Segoe UI";color:#fff'],
  ['Lower third', { text: 'Name Here', size: 54, bgOn: true, bg: '#2fc4b2', color: '#04201c', shadow: false, x: -560, y: 380 }, 'font:700 10px "Segoe UI";color:#04201c;background:#2fc4b2;padding:2px 6px;justify-self:start;align-self:end;margin:0 0 6px 6px'],
  ['Caption', { text: 'Caption goes here', size: 48, bold: false, bgOn: true, bg: '#000000', shadow: false, y: 420 }, 'font:400 9px "Segoe UI";color:#fff;background:#000;padding:2px 6px;align-self:end;margin-bottom:5px;outline:1px solid #333'],
  ['Outline', { text: 'OUTLINE', size: 150, font: 'Impact', bold: false, strokeW: 10, stroke: '#000000', shadow: false }, 'font:400 17px Impact;color:#fff;-webkit-text-stroke:1.5px #000;paint-order:stroke fill;background:#3a4252;width:100%;height:100%;display:grid;place-items:center'],
  ['Neon', { text: 'NEON', size: 150, font: 'Impact', bold: false, color: '#7cf9ff', shadow: false, fxGlow: 85 }, 'font:400 17px Impact;color:#7cf9ff;text-shadow:0 0 8px #7cf9ff'],
  // [name, props, preview css, preview text?]: these show off wrap, spacing, gradient, rounded boxes and the per-word / line animations
  ['Gradient title', { text: 'GRADIENT', size: 150, font: 'Impact', bold: false, color: '#ffd84d', color2: '#ff4f8b', gradOn: true, gradAngle: 90, letterSpacing: 4, shadow: false, anim: 'wordpop' }, 'font:400 16px Impact;letter-spacing:1px;background:linear-gradient(180deg,#ffd84d,#ff4f8b);-webkit-background-clip:text;background-clip:text;color:transparent', 'GRADIENT'],
  ['Caption box', { text: 'Long captions wrap inside a rounded box so every line stays easy to read', size: 46, bold: false, bgOn: true, bg: '#101318', bgRadius: 22, bgPad: 45, boxWidth: 1100, lineHeight: 1.3, shadow: false, y: 360, anim: 'linerise' }, 'font:400 7px "Segoe UI";color:#fff;background:#101318;border-radius:4px;padding:2px 5px;max-width:78%;text-align:center;align-self:end;margin-bottom:5px', 'Long captions wrap inside a rounded box'],
  ['Name tag', { text: 'NAME HERE', size: 50, letterSpacing: 6, bgOn: true, bg: '#2fc4b2', color: '#04201c', bgRadius: 40, bgPad: 55, shadow: false, x: -560, y: 380 }, 'font:700 9px "Segoe UI";letter-spacing:1.5px;color:#04201c;background:#2fc4b2;border-radius:9px;padding:2px 7px;justify-self:start;align-self:end;margin:0 0 6px 6px', 'NAME HERE'],
  ['Spaced subtitle', { text: 'CHAPTER ONE', size: 56, bold: false, letterSpacing: 22, y: 140, anim: 'typewriter' }, 'font:400 9px "Segoe UI";letter-spacing:3px;color:#fff', 'CHAPTER ONE'],
];
const STICKERS = ['⭐', '❤️', '🔥', '✨', '🎉', '👍', '👏', '😂', '😍', '😎', '🤯', '😱', '🥳', '😭', '🤔', '💯', '⚡', '💥', '💬', '💡', '🎬', '🎵', '📍', '⏰', '✅', '❌', '⚠️', '➡️', '⬅️', '⬆️', '⬇️', '👉', '👀', '🏆', '🎯', '🚀', '🌈', '☀️', '🌙', '❄️', '🍕', '☕', '🎮', '⚽', '🐶', '🐱', '💸', '👑'];
// ── saved presets: app-wide looks kept in IndexedDB kv 'presets' (not in the project, so they survive New project) ──
let userPresets = [];                                            // [{id, name, kind: 'colour' | 'fx' | 'text', props}]
const PRESET_KEYS = { colour: Object.keys(FILTER_BASE), fx: [...FX_KEYS, ...FX_EXTRA], text: Object.keys(TEXT_PROPS).filter(k => k !== 'text') };
const PRESET_WHAT = { colour: ['colour look', 'Filters'], fx: ['effect settings', 'Effects'], text: ['text style', 'Text'] };
function loadPresets(raw) {
  let a = []; try { a = JSON.parse(raw || '[]'); } catch {}
  userPresets = (Array.isArray(a) ? a : []).filter(p => p && PRESET_KEYS[p.kind] && p.props && typeof p.props === 'object')
    .map(p => ({ id: String(p.id || uid()), name: String(p.name || 'My preset').slice(0, 40), kind: p.kind, props: Object.fromEntries(PRESET_KEYS[p.kind].filter(k => k in p.props).map(k => [k, p.props[k]])) }));
}
const storePresets = () => DB.run('kv', 'readwrite', s => s.put(JSON.stringify(userPresets), 'presets')).catch(() => toast('Could not store the preset list.', 3000));
function savePreset(kind, name, c) {
  const p = { id: uid(), name: String(name || '').trim().slice(0, 40) || 'My preset', kind, props: Object.fromEntries(PRESET_KEYS[kind].map(k => [k, c.props[k]])) };
  userPresets.push(p); renderLib(); return storePresets().then(() => p);
}
function deletePreset(id) { userPresets = userPresets.filter(p => p.id !== id); renderLib(); return storePresets(); }
function applyPreset(p) {                                        // like the built-in cards: every selected visual clip (text style: selected text clips, else a new text)
  let ts;
  if (p.kind === 'text') {
    ts = selClips().filter(k => k.type === 'text' && unlockedC(k));
    if (!ts.length) { addGenerated('text', p.props); return; }
  } else { ts = targetClips(); if (!ts.length) return; }
  for (const t of ts) Object.assign(t.props, p.props);
  commit(); if (p.kind !== 'text') inspTab = 'look'; renderInspector(true);
}
function presetDialog(kind, c) {
  const [what, tab] = PRESET_WHAT[kind];
  openModal((box) => {
    const h = document.createElement('h2'); h.textContent = 'Save as preset';
    const p = document.createElement('p'); p.className = 'info'; p.textContent = `Saves this clip's ${what}. Apply it to any clip from the ${tab} tab under My presets, in this and future projects.`;
    const r = div('frow'), l = document.createElement('label'), i = document.createElement('input'); i.type = 'text'; i.id = 'presetName'; i.maxLength = 40;
    i.value = `My ${what.split(' ')[0]} ${userPresets.filter(q => q.kind === kind).length + 1}`; l.htmlFor = i.id; l.textContent = 'Name'; r.append(l, i);
    const b = div('mbtns'), no = document.createElement('button'), ok = document.createElement('button');
    no.textContent = 'Cancel'; no.onclick = closeModal; ok.textContent = 'Save'; ok.className = 'primary';
    ok.onclick = () => { closeModal(); savePreset(kind, i.value, c).then(q => toast(`Saved "${q.name}" (${tab} tab → My presets).`, 2500)); };
    i.onkeydown = (e) => { if (e.key === 'Enter') ok.click(); };
    b.append(no, ok); box.append(h, p, r, b); i.focus(); i.select();
  });
}
let libTab = 'media', sampleCv = null;
function sampleImage() {                                         // small stand-in picture for filter / effect / transition previews
  if (sampleCv) return sampleCv;
  sampleCv = document.createElement('canvas'); sampleCv.width = 160; sampleCv.height = 90; const g = sampleCv.getContext('2d');
  const sky = g.createLinearGradient(0, 0, 0, 90); sky.addColorStop(0, '#2a6fc9'); sky.addColorStop(0.7, '#f3a65a'); sky.addColorStop(1, '#f6d58a'); g.fillStyle = sky; g.fillRect(0, 0, 160, 90);
  g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(112, 44, 13, 0, 7); g.fill();
  g.fillStyle = '#2f5d3a'; g.beginPath(); g.moveTo(0, 90); g.lineTo(0, 62); g.lineTo(38, 40); g.lineTo(74, 66); g.lineTo(104, 52); g.lineTo(160, 74); g.lineTo(160, 90); g.fill();
  g.fillStyle = '#1e3f2a'; g.beginPath(); g.moveTo(0, 90); g.lineTo(0, 78); g.lineTo(60, 70); g.lineTo(160, 84); g.lineTo(160, 90); g.fill();
  return sampleCv;
}
let keyCv = null;
function keySample() {                                           // Green screen key card: left as shot, right keyed over a checkerboard
  if (keyCv) return keyCv;
  keyCv = document.createElement('canvas'); keyCv.width = 160; keyCv.height = 90; const g = keyCv.getContext('2d');
  const shot = document.createElement('canvas'); shot.width = 160; shot.height = 90; const s = shot.getContext('2d');
  s.fillStyle = '#00b140'; s.fillRect(0, 0, 160, 90); s.save(); s.beginPath(); s.ellipse(80, 50, 34, 40, 0, 0, 7); s.clip(); s.drawImage(sampleImage(), 0, 0); s.restore();
  for (let y = 0; y < 90; y += 10) for (let x = 80; x < 160; x += 10) { g.fillStyle = (x + y) % 20 ? '#3a3f48' : '#6b717c'; g.fillRect(x, y, 10, 10); }
  g.drawImage(shot, 0, 0, 80, 90, 0, 0, 80, 90);
  pixelPass(s, 160, 90, { fxKey: 60, fxKeyColor: '#00b140', fxKeySoft: 20, fxKeySpill: 50 });
  g.drawImage(shot, 80, 0, 80, 90, 80, 0, 80, 90); return keyCv;
}
// the clip a library click applies to: the selection, else the top visual clip under the playhead
function targetClip() {
  let c = clipById(sel);
  if (c && c.type !== 'audio') { if (trackById(c.track)?.locked) { toast('That track is locked.', 2000); return null; } return c; }
  for (const tr of state.tracks.filter(t => t.kind === 'video' && !t.locked && !t.hidden)) {
    c = state.clips.find(k => k.track === tr.id && playhead >= k.start && playhead < k.start + k.dur);
    if (c) { select(c.id); return c; }
  }
  toast('Select a clip on the timeline first.', 2500); return null;
}
// every clip a library click applies to: all selected visual clips, else the single fallback above
function targetClips() {
  const many = selClips().filter(c => c.type !== 'audio' && !trackById(c.track)?.locked);
  if (many.length > 1) return many;
  const one = targetClip(); return one ? [one] : [];
}
function libCard(parent, label, on, draw, onclick) {
  const card = div('card' + (on ? ' on' : ''));
  if (draw) { const cvs = document.createElement('canvas'); cvs.width = 160; cvs.height = 90; draw(cvs.getContext('2d')); card.append(cvs); }
  const l = document.createElement('span'); l.textContent = label; card.append(l);
  if (onclick) card.onclick = onclick;
  parent.append(card); return card;
}
function setLibTab(t) {                                           // clicking the open tab again folds the library away
  if (t === libTab && panelOpen('lib')) { setPanel('lib', false); return; }
  setPanel('lib', true); libTab = t; renderLib(); updateStatus();
}
function renderLib() {
  const rail = $('#rail');
  if (!rail.childElementCount) for (const [id, label, ic] of TABS) {
    const b = document.createElement('button'); b.dataset.tab = id; b.innerHTML = icon(ic) + `<span>${label}</span>`; b.title = label; b.onclick = () => setLibTab(id); rail.append(b);
  }
  rail.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.tab === libTab));
  $('#libTitle').textContent = TABS.find(t => t[0] === libTab)[1];
  const lib = $('#lib'); $('#bin').hidden = $('#binBar').hidden = libTab !== 'media'; lib.hidden = libTab === 'media';
  if (libTab === 'media') return;
  const keep = lib.scrollTop; lib.innerHTML = '';
  const note = (txt) => { const p = document.createElement('p'); p.className = 'libNote'; p.textContent = txt; lib.append(p); };
  const head = (txt) => { const h = div('libHead'); h.textContent = txt; lib.append(h); };
  const c = clipById(sel), cv2 = c && c.type !== 'audio' ? c : null, S = sampleImage();
  const mine = (kind, draw) => {                                  // 'My presets': saved from the Inspector; × deletes
    const list = userPresets.filter(p => p.kind === kind); if (!list.length) return;
    head('My presets'); const g = div('libGrid'); lib.append(g);
    for (const p of list) {
      const card = libCard(g, p.name, false, draw && ((x) => draw(x, p.props)), () => applyPreset(p));
      card.classList.add('mine'); card.title = kind === 'text' ? `${p.name}: style the selected text clips, or add a new text` : `${p.name}: apply to the selected clips`;
      if (kind === 'text') {
        const pv = div('pv'), sp = document.createElement('span'), q = p.props; sp.textContent = 'Aa';
        sp.style.cssText = `font:${q.italic ? 'italic ' : ''}${q.bold ? 700 : 400} 20px "${q.font}";color:${q.color};${q.bgOn ? `background:${q.bg};padding:0 6px;border-radius:${Math.min(10, (q.bgRadius || 0) / 4)}px;` : ''}${q.strokeW ? `-webkit-text-stroke:1px ${q.stroke};` : ''}${q.gradOn && !q.bgOn ? `background:linear-gradient(${(q.gradAngle ?? 90) + 90}deg,${q.color},${q.color2});-webkit-background-clip:text;color:transparent;` : ''}`;
        pv.append(sp); card.prepend(pv);
      }
      const x = document.createElement('button'); x.className = 'pdel'; x.textContent = '×'; x.title = `Delete preset "${p.name}"`; x.setAttribute('aria-label', x.title);
      x.onclick = (e) => { e.stopPropagation(); deletePreset(p.id); }; card.append(x);
    }
  };
  if (libTab === 'text') {
    note('Click a style to add it at the playhead. Edit the words in the Inspector.');
    const grid = div('libGrid'); lib.append(grid);
    for (const [name, props, css, label] of TEXT_PRESETS) {
      const card = libCard(grid, name, false, null, () => addGenerated('text', props));
      const pv = div('pv'), sp = document.createElement('span'); sp.textContent = label || name === 'Lower third' ? 'Name' : name === 'Caption' ? 'Caption' : name === 'Neon' ? 'NEON' : name === 'Outline' ? 'OUTLINE' : name; sp.style.cssText = css; pv.append(sp); card.prepend(pv);
    }
    mine('text');
    head('Backgrounds');
    const g2 = div('libGrid'); lib.append(g2);
    for (const [name, color] of [['Black', '#000000'], ['White', '#ffffff'], ['Blue', '#1e6fd9'], ['Teal', '#2fc4b2'], ['Red', '#d9432f'], ['Green screen', '#00b140']])
      libCard(g2, name, false, (g) => { g.fillStyle = color; g.fillRect(0, 0, 160, 90); }, () => addGenerated('solid', { color }));
  } else if (libTab === 'stickers') {
    note('Click a sticker to add it at the playhead, then drag it on the monitor.');
    const grid = div('stickerGrid'); lib.append(grid);
    for (const s of STICKERS) { const b = document.createElement('button'); b.textContent = s; b.onclick = () => addGenerated('sticker', { glyph: s }); grid.append(b); }
  } else if (libTab === 'filters') {
    note(cv2 ? 'Click a filter to apply it to the selected clip.' : 'Select a clip, then click a filter.');
    const grid = div('libGrid'); lib.append(grid);
    for (const [name, preset] of FILTERS) {
      const want = { ...FILTER_BASE, ...preset }, on = !!cv2 && Object.keys(FILTER_BASE).every(k => cv2.props[k] === want[k]);
      libCard(grid, name, on, (g) => { g.filter = filterStr(want); g.drawImage(S, 0, 0); pixelPass(g, 160, 90, want); }, () => { const ts = targetClips(); if (!ts.length) return; for (const t of ts) Object.assign(t.props, want); commit(); renderInspector(true); });
    }
    mine('colour', (g, p) => { const q = { ...FILTER_BASE, ...p }; g.filter = filterStr(q); g.drawImage(S, 0, 0); pixelPass(g, 160, 90, q); });
  } else if (libTab === 'effects') {
    note(cv2 ? 'Click to switch an effect on or off. Set the strength in the Inspector.' : 'Select a clip, then click an effect.');
    const ab = document.createElement('button'); ab.className = 'primary'; ab.textContent = '+ Adjustment layer'; ab.style.margin = '0 0 10px';
    ab.title = 'Add a layer at the playhead whose colour and effects apply to everything below it'; ab.onclick = () => addGenerated('adjust'); lib.append(ab);
    const grid = div('libGrid'); lib.append(grid);
    libCard(grid, 'None', !!cv2 && FX_KEYS.every(k => !cv2.props[k]), (g) => g.drawImage(S, 0, 0), () => { const ts = targetClips(); if (!ts.length) return; for (const t of ts) for (const k of FX_KEYS) t.props[k] = 0; commit(); renderInspector(true); });
    for (const [name, key, def] of EFFECTS) {
      libCard(grid, name, !!cv2 && cv2.props[key] > 0, (g) => {
        if (key === 'fxShake') { g.fillStyle = '#000'; g.fillRect(0, 0, 160, 90); g.globalAlpha = 0.5; g.drawImage(S, -7, 3); g.globalAlpha = 1; g.drawImage(S, 5, -4); return; }
        if (key === 'fxKey') { g.drawImage(keySample(), 0, 0); return; }
        if (POST_FX.includes(key)) {                             // shadow / stroke show around a smaller picture
          g.fillStyle = '#2a2738'; g.fillRect(0, 0, 160, 90);
          const L = scratchCv('libfx', 160, 90); L.drawImage(S, 32, 18, 96, 54); postFx(L, 160, 90, { [key]: key === 'fxStrokeW' ? 30 : 90, shadowDist: 90, shadowBlur: 60, fxStrokeColor: '#ffffff' });
          g.drawImage(L.canvas, 0, 0); return;
        }
        g.drawImage(S, 0, 0); applyFx(g, 160, 90, { [key]: key === 'fxPixel' ? 70 : 90 }, 0);
      }, () => { const ts = targetClips(); if (!ts.length) return; const v = ts[0].props[key] > 0 ? 0 : def; for (const t of ts) t.props[key] = v; commit(); inspTab = 'look'; renderInspector(true); });
    }
    libCard(grid, 'Motion blur', !!cv2 && !!cv2.props.mbOn, (g) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, 160, 90); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / 9;
      for (let i = -4; i <= 4; i++) g.drawImage(S, i * 5, 0);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    }, () => { const ts = targetClips(); if (!ts.length) return; const v = !ts[0].props.mbOn; for (const t of ts) t.props.mbOn = v; commit(); inspTab = 'motion'; renderInspector(true); });
    mine('fx', (g, p) => { g.drawImage(S, 0, 0); applyFx(g, 160, 90, p, 0); });
  } else if (libTab === 'trans') {
    note(cv2 ? 'Choose where the transition goes on the selected clip: its start (In), its end (Out), or Both. Cross-dissolve and Push blend from the clip just before it on the same track.' : 'Select a clip, then choose In, Out or Both.');
    const grid = div('libGrid'); lib.append(grid);
    const apply = (style, where) => applyTrans(style, where);
    for (const [style, name] of TRANSITIONS) {
      const on = !!cv2 && ((cv2.props.fadeIn > 0 && (cv2.props.transIn || 'fade') === style) || (cv2.props.fadeOut > 0 && (cv2.props.transOut || 'fade') === style));
      const card = libCard(grid, name, on, (g) => {
        g.fillStyle = '#15181d'; g.fillRect(0, 0, 160, 90); g.save();
        if (style === 'fade') g.globalAlpha = 0.5;
        else if (style === 'wipe') { g.beginPath(); g.rect(0, 0, 80, 90); g.clip(); }
        else if (style === 'slide') g.translate(-70, 0);
        else if (style === 'zoom') { g.globalAlpha = 0.6; g.translate(80, 45); g.scale(0.7, 0.7); g.translate(-80, -45); }
        else if (style === 'blur') { g.filter = 'blur(5px)'; g.globalAlpha = 0.8; }
        else if (style === 'iris') { g.beginPath(); g.arc(80, 45, 36, 0, 7); g.clip(); }
        else if (style === 'spin') { g.globalAlpha = 0.6; g.translate(80, 45); g.rotate(-0.7); g.scale(0.6, 0.6); g.translate(-80, -45); }
        else if (style === 'clock') { g.beginPath(); g.moveTo(80, 45); g.arc(80, 45, 100, -Math.PI / 2, Math.PI * 0.75); g.closePath(); g.clip(); }
        else if (style === 'dissolve' || style === 'push') {      // the outgoing clip is a flat slate
          g.fillStyle = '#5a6b80'; if (style === 'push') { g.fillRect(80, 0, 80, 90); g.translate(-80, 0); } else { g.fillRect(0, 0, 160, 90); g.globalAlpha = 0.5; }
        }
        if (style === 'whip') { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 / 7; for (let i = -3; i <= 3; i++) g.drawImage(S, i * 9 - 30, 0); }
        else g.drawImage(S, 0, 0);
        g.restore();
      });
      const chips = div('chips'), pairS = PAIR_TRANS.includes(style);
      for (const [w, lbl] of pairS ? [['in', 'In']] : [['in', 'In'], ['out', 'Out'], ['both', 'Both']]) { const b = document.createElement('button'); b.textContent = lbl; b.title = pairS ? `Apply ${name} from the previous clip on the track into this one` : `Apply ${name} to the clip's ${w === 'both' ? 'start and end' : w === 'in' ? 'start' : 'end'}`; b.onclick = (e) => { e.stopPropagation(); apply(style, w); }; chips.append(b); }
      card.append(chips); card.style.cursor = 'default';
    }
    if (cv2 && (cv2.props.fadeIn > 0 || cv2.props.fadeOut > 0)) { const b = document.createElement('button'); b.textContent = 'Remove transitions from this clip'; b.style.marginTop = '10px'; b.onclick = () => { cv2.props.fadeIn = 0; cv2.props.fadeOut = 0; commit(); renderInspector(true); }; lib.append(b); }
  }
  else if (libTab === 'sounds') {
    note('Click a sound to add it at the playhead. Music automatically gets quieter under voiceovers.');
    for (const [title, list] of [['Sound effects', SOUNDS.filter(x => !x.music)], ['Music (32 s loops)', SOUNDS.filter(x => x.music)]]) {
      head(title); const grid = div('libGrid'); lib.append(grid);
      for (const sd of list) {
        const card = libCard(grid, sd.name, false, null, () => addSound(sd)); card.title = `${sd.name} · ${sd.dur} s — click to add at the playhead`;
        const pv = div('pv'), em = document.createElement('span'); em.textContent = sd.emoji; em.style.cssText = 'font-size:28px;font-family:"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif'; pv.append(em); card.prepend(pv);
        const chips = div('chips'), b = document.createElement('button'); b.textContent = '▶ Preview'; b.onclick = (e) => { e.stopPropagation(); previewSound(sd); }; chips.append(b); card.append(chips);
      }
    }
  }
  else if (libTab === 'anim') {
    note(cv2 ? 'Click a motion to apply it to the selected clip. Click it again, or None, to remove it.' : 'Select a clip, then click a motion.');
    const grid = div('libGrid'); lib.append(grid);
    for (const [id, name] of ANIMS) {
      libCard(grid, name, !!cv2 && (cv2.props.anim || 'none') === id, (g) => {
        g.fillStyle = '#15181d'; g.fillRect(0, 0, 160, 90); g.save(); g.translate(80, 45);
        if (id === 'pop') g.scale(0.62, 0.62); else if (id === 'drop') g.translate(0, -30); else if (id === 'float') g.translate(0, -7);
        else if (id === 'pulse') g.scale(1.12, 1.12); else if (id === 'wiggle') g.rotate(0.14); else if (id === 'spin') { g.rotate(0.7); g.scale(0.75, 0.75); }
        else if (id === 'kenburns') g.scale(1.3, 1.3); else if (id === 'kenburnsOut') g.scale(0.8, 0.8);
        if (id === 'typewriter') { g.fillStyle = '#fff'; g.font = '700 22px "Segoe UI", sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Typ', -48, 0); g.fillStyle = '#2fc4b2'; g.fillRect(-48 + g.measureText('Typ').width + 3, -13, 3, 26); }
        else if (id === 'wordpop') {                                // three words, the last still popping in
          g.font = '700 20px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
          g.fillText('Pop', -44, 0); g.fillText('each', 2, 0); g.save(); g.translate(50, 0); g.scale(0.6, 0.6); g.globalAlpha = 0.7; g.fillStyle = '#2fc4b2'; g.fillText('word', 0, 0); g.restore();
        }
        else if (id === 'linerise') {                               // the second line still rising and fading in
          g.font = '700 18px "Segoe UI", sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
          g.fillText('Line one', 0, -13); g.globalAlpha = 0.45; g.fillText('Line two', 0, 20); g.globalAlpha = 1;
          g.strokeStyle = '#2fc4b2'; g.lineWidth = 2; g.beginPath(); g.moveTo(58, 26); g.lineTo(58, 12); g.moveTo(54, 16); g.lineTo(58, 12); g.lineTo(62, 16); g.stroke();
        }
        else g.drawImage(S, -68, -38, 136, 76);
        g.restore();
      }, () => {
        const ts = targetClips(); if (!ts.length) return;
        const usable = TEXT_ANIMS.includes(id) ? ts.filter(t => t.type === 'text') : ts;
        if (!usable.length) { toast(`${name} works on text clips.`, 2500); return; }
        const v = (usable[0].props.anim || 'none') === id ? 'none' : id; for (const t of usable) t.props.anim = v; commit(); renderInspector(true);
      });
    }
  }
  lib.scrollTop = keep;
}

// ───────────────────────── project file (.framewright): one file holding the timeline and every media file ─────────────────────────
// The 8-byte signature predates the rename from "Cutroom"; it is kept so older .cutroom files still open.
const PROJ_MAGIC = 'CUTROOM1';
function projectToBlob() {
  const list = [...media.values()];
  const header = new TextEncoder().encode(JSON.stringify({ app: 'framewright', v: 1, state,
    media: list.map(m => ({ id: m.id, name: m.name, kind: m.kind, dur: m.dur, w: m.w, h: m.h, thumb: m.thumb, type: m.blob.type, size: m.blob.size, added: m.added || 0, ...(m.mtime != null ? { mtime: m.mtime } : {}), ...(m.peaks ? { peaks: peaksB64(m.peaks) } : {}) })) }));
  const len = new Uint8Array(4); new DataView(len.buffer).setUint32(0, header.length, true);
  return new Blob([PROJ_MAGIC, len, header, ...list.map(m => m.blob)], { type: 'application/octet-stream' });
}
async function loadProjectBlob(file) {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (head.length < 12 || String.fromCharCode(...head.subarray(0, 8)) !== PROJ_MAGIC) throw new Error('This is not a Arcanix project file.');
  const hlen = new DataView(head.buffer).getUint32(8, true);
  if (hlen < 2 || hlen > 64e6 || 12 + hlen > file.size) throw new Error('The project file is damaged (bad header size).');
  let h; try { h = JSON.parse(await file.slice(12, 12 + hlen).text()); } catch { throw new Error('The project file is damaged (unreadable header).'); }
  const st = h && h.state;
  if (!st || !st.settings || !Array.isArray(st.tracks) || !Array.isArray(st.clips) || !Array.isArray(h.media)) throw new Error('The project file is missing its timeline.');
  const num = (v, lo, hi, d) => (typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : d);
  let off = 12 + hlen; const recs = [];
  for (const r of h.media) {
    const size = num(r.size, 0, Number.MAX_SAFE_INTEGER, -1);
    if (size < 0 || off + size > file.size || !['video', 'audio', 'image'].includes(r.kind)) throw new Error('The project file is damaged (media table).');
    recs.push({ id: String(r.id), name: String(r.name || 'media'), kind: r.kind, dur: num(r.dur, 0, 1e7, 0), w: num(r.w, 0, 1e5, 0), h: num(r.h, 0, 1e5, 0),
      thumb: typeof r.thumb === 'string' && r.thumb.startsWith('data:image/') ? r.thumb : '', blob: file.slice(off, off + size, String(r.type || '')),
      peaks: peaksFrom(r.peaks),                                     // older files have none: decoded after opening
      added: num(r.added, 0, 1e15, 0), mtime: num(r.mtime, -1e15, 1e15, null) });
    off += size;
  }
  // phase 1: read every media file into memory without touching the current project; any failure leaves it intact
  const staged = [];
  try {
    for (const r of recs) {
      let blob; try { blob = new Blob([await r.blob.arrayBuffer()], { type: r.blob.type }); }   // detach from the opened file
      catch (e) { throw new Error(`could not read "${r.name}" from the file (${(e && e.name) || 'read error'}).`); }
      staged.push({ ...r, blob, url: URL.createObjectURL(blob), img: null });
    }
  } catch (e) { for (const m of staged) URL.revokeObjectURL(m.url); throw e; }
  // phase 2: swap media, state and the element cache, then rewrite the media store
  stop(); state.clips = []; pruneEls();                             // release every element (clip ids can repeat across files)
  for (const m of media.values()) URL.revokeObjectURL(m.url); media.clear(); purgeTombs(true);
  for (const m of staged) {
    if (m.kind === 'image') loadImage(m.url).then(img => { m.img = img; requestRender(); }, () => {});
    media.set(m.id, m); queuePeaks(m);
  }
  state.settings = { w: num(st.settings.w, 16, 7680, 1920), h: num(st.settings.h, 16, 7680, 1080), fps: num(st.settings.fps, 1, 120, 30),
    name: typeof st.settings.name === 'string' && st.settings.name.trim() ? st.settings.name.trim().slice(0, 80) : 'Untitled project' };
  state.tracks = st.tracks; state.clips = st.clips; state.markers = Array.isArray(st.markers) ? st.markers.filter(t => typeof t === 'number') : []; setIO(st);
  normalizeClips(); sel = null; selSet.clear(); playhead = 0; hist.undo.length = hist.redo.length = 0; lastSnap = snapshot();
  mediaUnsaved = 0; scheduleSave(); renderBin(); refreshAll(true); warnMissing();
  let failed = 0;
  try { await DB.run('media', 'readwrite', s => { s.clear(); for (const m of staged) s.put(mediaRec(m)); }); }
  catch {                                                           // one transaction failed as a whole (quota): store what fits
    try { await DB.run('media', 'readwrite', s => s.clear()); } catch {}
    for (const m of staged) try { await putMedia(m); } catch { failed++; }
  }
  mediaSaveFailed(failed);
}
// Arcanix themes: [id, name, swatches]. The choice is per computer (localStorage), not per project.
const THEMES = [
  ['arcane', 'Arcane', ['#16131f', '#a77bff', '#f2c14e']],
  ['runeglow', 'Runeglow', ['#181b21', '#2fc4b2', '#f4ad45']],
  ['ember', 'Ember Sigil', ['#1b1714', '#ff7a3d', '#ffc94d']],
  ['astral', 'Astral', ['#111827', '#5ab8ff', '#f4c95d']],
  ['void', 'Void', ['#0b0b0f', '#ff4fd8', '#3ef0ff']],
  ['verdant', 'Verdant Hex', ['#111914', '#4fe08a', '#e6d36a']],
];
let ACCENT = '#a77bff';
function applyTheme(id) {
  if (!THEMES.some(t => t[0] === id)) id = 'arcane';
  document.documentElement.dataset.theme = id;
  const cs = getComputedStyle(document.documentElement);
  ACCENT = cs.getPropertyValue('--accent').trim() || ACCENT;
  try { window.arcanixShell?.setTitleBar(cs.getPropertyValue('--panel').trim(), cs.getPropertyValue('--text').trim()); } catch {}   // desktop app: window buttons match
  try { localStorage.setItem('arcanix-theme', id); } catch {}
  try { if (!playing) drawFrame(); } catch {}                   // repaint the monitor overlay in the new accent (fails harmlessly during boot)
}
try { applyTheme(localStorage.getItem('arcanix-theme') || 'arcane'); } catch { applyTheme('arcane'); }
function settingsDialog() {
  openModal((box) => {
    box.innerHTML = `<h2>Project settings</h2>
      <div class="frow"><label>Theme</label><div class="themeRow" id="setTheme">${THEMES.map(([id, nm, sw]) => `<button data-th="${id}" class="${document.documentElement.dataset.theme === id ? 'on' : ''}"><span class="sw">${sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>${nm}</button>`).join('')}</div></div>
      <div class="frow"><label>Frame size</label><select id="setRes">
        <option value="1920x1080">1920×1080 · landscape 16:9</option><option value="1280x720">1280×720 · landscape 16:9</option><option value="3840x2160">3840×2160 · 4K</option>
        <option value="1080x1920">1080×1920 · vertical 9:16</option><option value="1080x1080">1080×1080 · square 1:1</option></select></div>
      <div class="frow"><label>Frame rate</label><select id="setFps"><option>24</option><option>25</option><option>30</option><option>60</option></select></div>
      <div class="frow"><label>Project file</label><span style="display:flex;gap:8px"><button id="setSave" title="Save one .framewright file containing the timeline and all imported media">Save to file</button><button id="setOpen" title="Open a .framewright project file (replaces the current project)">Open file…</button></span></div>
      <p class="info">Your work autosaves in this browser. A project file is a portable backup you can keep or move to another computer.</p>
      <div class="mbtns" style="justify-content:space-between"><span style="display:flex;gap:8px"><button id="setKeys">Keyboard shortcuts</button><button id="setNew">New project</button></span><button id="setClose" class="primary">Done</button></div>`;
    $('#setSave', box).onclick = saveProjectFile;
    box.querySelectorAll('#setTheme button').forEach(b => b.onclick = () => {
      applyTheme(b.dataset.th); box.querySelectorAll('#setTheme button').forEach(x => x.classList.toggle('on', x === b));
    });
    $('#setOpen', box).onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.framewright,.cutroom';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        if ((state.clips.length || media.size) && !confirm('Open this project file? It replaces the current timeline and media.')) return;
        try { await loadProjectBlob(f); closeModal(); toast(`Opened "${f.name}".`); } catch (e) { toast('Could not open the file: ' + e.message, 7000); }
      };
      inp.click();
    };
    const res = $('#setRes', box), fps = $('#setFps', box);
    res.value = `${state.settings.w}x${state.settings.h}`; fps.value = String(state.settings.fps);
    res.onchange = () => { const [w, h] = res.value.split('x').map(Number); state.settings.w = w; state.settings.h = h; commit(); };
    fps.onchange = () => { state.settings.fps = +fps.value; commit(); };
    $('#setKeys', box).onclick = shortcutsDialog; $('#setNew', box).onclick = () => { closeModal(); newProject(); }; $('#setClose', box).onclick = closeModal;
  });
}

// ───────────────────────── context menu ─────────────────────────
function closeCtx() { document.querySelectorAll('.ctx').forEach(m => m.remove()); }
function ctxMenu(x, y, items) {
  closeCtx();
  const m = div('ctx');
  for (const it of items) {
    if (it === '-') { m.append(div('ctxsep')); continue; }
    const b = div('ctxitem' + (it.disabled ? ' dis' : '')), l = document.createElement('span'), k = document.createElement('kbd');
    l.textContent = it.label; k.textContent = it.key || ''; b.append(l, k);
    b.onclick = () => { closeCtx(); it.fn(); };
    m.append(b);
  }
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 6)) + 'px';
  m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 6)) + 'px';
}
window.addEventListener('pointerdown', (e) => { if (!e.target.closest('.ctx')) closeCtx(); }, true);
window.addEventListener('blur', closeCtx);
rows.addEventListener('contextmenu', (ev) => {
  const hd = ev.target.closest('.thead');
  if (hd && !simpleMode) {                                       // Advanced: track header menu
    ev.preventDefault();
    const tr = trackById(hd.dataset.id); if (!tr) return;
    const same = state.tracks.filter(t => t.kind === tr.kind), i = same.indexOf(tr);
    ctxMenu(ev.clientX, ev.clientY, [
      { label: tr.kind === 'video' ? 'Move track up (in front)' : 'Move track up', disabled: i <= 0 || tr.locked || same[i - 1].locked, fn: () => moveTrack(tr.id, -1) },
      { label: tr.kind === 'video' ? 'Move track down (behind)' : 'Move track down', disabled: i >= same.length - 1 || tr.locked || same[i + 1].locked, fn: () => moveTrack(tr.id, 1) },
      '-',
      { label: tr.locked ? 'Unlock track' : 'Lock track', fn: () => { tr.locked = !tr.locked; commit(); } },
      { label: 'Select track from playhead', disabled: tr.locked, fn: () => selectFrom(frameRound(playhead), tr.id) },
    ]);
    return;
  }
  const lane = ev.target.closest('.lane'); if (!lane) return;
  ev.preventDefault();
  const ce = ev.target.closest('.clip'), c = ce && clipById(ce.dataset.id), t = frameRound(laneTime(ev, lane)), tr = trackById(lane.dataset.id);
  if (c) {
    const locked = !!tr.locked;
    if (!selSet.has(c.id) && !locked) selectClip(c, ev.altKey);   // right-clicking inside a group keeps the group; locked clips are never selected
    const mk = [...ce.querySelectorAll('.kfm')].find(m => { const r = m.getBoundingClientRect(); return Math.abs(ev.clientX - (r.left + r.width / 2)) <= 6 && Math.abs(ev.clientY - (r.top + r.height / 2)) <= 7; });
    if (mk) { easeMenu(ev.clientX, ev.clientY, c, +mk.dataset.t); return; }   // keyframe diamond: easing menu (all props keyed there)
    const under = playhead > c.start && playhead < c.start + c.dur, many = !locked && selSet.size > 1;
    const items = [
      { label: many ? 'Split selected at playhead' : 'Split at playhead', key: 'S', disabled: !under || locked, fn: splitAtPlayhead },
      { label: 'Split here', disabled: locked, fn: () => { if (splitClip(c, t)) commit(); } },
      { label: many ? 'Trim selected starts to playhead' : 'Trim start to playhead', key: 'Q', disabled: !under || locked, fn: () => trimToPlayhead('l', false, trimTargets(c)) },
      { label: many ? 'Trim selected ends to playhead' : 'Trim end to playhead', key: 'W', disabled: !under || locked, fn: () => trimToPlayhead('r', false, trimTargets(c)) },
      '-',
      { label: many ? `Copy ${selSet.size} clips` : 'Copy', key: 'Ctrl+C', fn: () => { clipboard = JSON.parse(JSON.stringify(many ? selClips() : [c])); } },
      { label: many ? `Cut ${selSet.size} clips` : 'Cut', key: 'Ctrl+X', disabled: locked, fn: cutSel },
      { label: many ? `Duplicate ${selSet.size} clips` : 'Duplicate', key: 'Ctrl+D', disabled: locked, fn: duplicateSel },
      { label: 'Graph editor…', disabled: !hasKf(c), fn: () => graphEditor(c) },
      { label: 'Copy attributes', key: 'Ctrl+Alt+C', fn: () => copyAttrs(c) },
      { label: many ? 'Paste attributes… (all selected)' : 'Paste attributes…', key: 'Ctrl+Alt+V', disabled: locked || !attrClip, fn: pasteAttrsDialog },
      '-',
      { label: many ? 'Fade in / out 0.5 s (all selected)' : 'Fade in / out 0.5 s', disabled: locked, fn: () => { for (const k of actClips(c)) { const f = Math.min(0.5, k.dur / 2); k.props.fadeIn = f; k.props.fadeOut = f; } commit(); renderInspector(true); } },
    ];
    if (c.mediaId != null && !media.has(c.mediaId)) items.unshift({ label: 'Relink missing media…', fn: () => relinkPick(c.mediaId) }, '-');
    if (c.type === 'video') items.push({ label: 'Freeze frame here (2 s)', key: 'F', disabled: !under || locked, fn: () => freezeFrame() });
    if (c.type === 'video') items.push({ label: audioDetached(c) ? 'Audio detached' : 'Detach audio', disabled: locked || audioDetached(c), fn: () => detachAudio(c) });
    const pair = selClips();                                     // Link: exactly one video + one audio selected
    if (linkedOf(c).length) items.push({ label: 'Unlink', disabled: locked, fn: () => unlinkClips(c) });
    else if (pair.length === 2 && pair.some(k => k.type === 'video') && pair.some(k => k.type === 'audio') && selSet.has(c.id))
      items.push({ label: 'Link video and audio', disabled: locked || !pair.every(unlockedC), fn: () => linkClips(pair) });
    if (hasSource(c)) items.push({ label: many ? 'Normalize volume (all selected)' : 'Normalize volume', disabled: locked || (!many && audioDetached(c)), fn: () => normalizeVol(actClips(c)) });
    if (hasSource(c)) for (const [v, lbl] of [[0.5,'Slow motion (0.5×)'], [1, 'Normal speed (1×)'], [2, 'Fast (2×)']])
      items.push({ label: lbl, disabled: locked || c.speed === v, fn: () => { const full = setSpeed(c, v); commit(); renderInspector(true); if (!full) toast('Slowed down, but shortened to fit before the next clip.', 3500); } });
    if (hasKf(c)) items.push({ label: 'Clear keyframes', disabled: locked, fn: () => { clearKeyframes(c); commit(); renderInspector(true); } });
    items.push('-', { label: many ? `Delete ${selSet.size} clips` : 'Delete', key: 'Del', disabled: locked, fn: () => deleteSel(false) }, { label: 'Ripple delete', key: 'Shift+Del', disabled: locked, fn: () => deleteSel(true) });
    ctxMenu(ev.clientX, ev.clientY, items);
  } else {
    ctxMenu(ev.clientX, ev.clientY, [
      { label: 'Paste here', key: 'Ctrl+V', disabled: !clipboard, fn: () => pasteClip(clipboard, t) },
      { label: 'Move playhead here', fn: () => { stop(); setPlayhead(t); } },
      { label: 'Add / remove marker here', key: 'M', fn: () => toggleMarker(t) },
      { label: 'Clear all markers', disabled: !state.markers.length, fn: () => { state.markers = []; commit(); } },
      { label: 'Save frames at markers (PNG each)', disabled: !state.markers.length, fn: exportMarkerFrames },
      { label: 'Select all clips', key: 'Ctrl+A', disabled: !state.clips.length, fn: () => selectMany(state.clips.filter(k => !trackById(k.track)?.locked).map(k => k.id), sel) },
      { label: 'Select everything after here', key: Math.abs(t - frameRound(playhead)) < 1e-6 ? 'Ctrl+Shift+A' : '', disabled: !state.clips.length, fn: () => selectFrom(t) },
      { label: 'Select track from here', disabled: tr.locked || !state.clips.some(k => k.track === tr.id), fn: () => selectFrom(t, tr.id) },
      '-',
      { label: 'Set in point here', key: 'I', fn: () => markIO('in', t) },
      { label: 'Set out point here', key: 'O', fn: () => markIO('out', t) },
      { label: 'Clear in / out', key: 'Alt+X', disabled: state.inPt == null && state.outPt == null, fn: () => markIO(null) },
      '-',
      { label: 'Add text at playhead', fn: addText },
      { label: 'Add solid at playhead', fn: () => addGenerated('solid') },
      '-',
      { label: 'Add video track', fn: () => addTrack('video') },
      { label: 'Add audio track', fn: () => addTrack('audio') },
    ]);
  }
});
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#btnExport').onclick = exportDialog;
$('#btnPlay').onclick = () => voStop() || (playing ? stop() : play());
$('#btnStart').onclick = () => { stop(); setPlayhead(0); tl.scrollLeft = 0; };
$('#btnEnd').onclick = () => { stop(); setPlayhead(projectEnd()); updatePlayheadUI(true); };
$('#btnPrev').onclick = () => stepFrames(-1); $('#btnNext').onclick = () => stepFrames(1);
$('#toolSelect').onclick = () => setTool('select'); $('#toolRazor').onclick = () => setTool('razor');
$('#btnSplit').onclick = splitAtPlayhead; $('#btnDelete').onclick = () => deleteSel(false);
$('#btnSnap').onclick = toggleSnap;
$('#btnAddV').onclick = () => addTrack('video'); $('#btnAddA').onclick = () => addTrack('audio');
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal' && !exporting) closeModal(); });

// does this key belong to the focused control? Text entry keeps every key; a slider keeps only its arrows;
// checkboxes, colour swatches and buttons let shortcuts through (they keep focus after a click)
const NAV_KEYS = /^(arrow(left|right|up|down)|home|end|pageup|pagedown)$/i;
function isTypingKey(e) {
  const t = e.target || {}, tag = (t.tagName || '').toLowerCase(), type = (t.type || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select' || t.isContentEditable) return true;
  if (tag !== 'input') return false;
  if (type === 'range') return NAV_KEYS.test(e.key) || e.key === 'Escape';
  return !/^(checkbox|radio|color|button|submit|reset|file)$/.test(type);
}
// a dropdown keeps focus after picking, and would swallow Space / arrows: hand focus back once it has changed
insp.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') e.target.blur(); });
window.addEventListener('keydown', (e) => {
  if (isTypingKey(e)) { if (e.key === 'Escape') e.target.blur(); return; }
  if (!$('#modal').hidden) { if (e.key === 'Escape' && !exporting) closeModal(); return; }
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey; let used = true;
  if (ctrl && k === 'z') e.shiftKey ? redo() : undo();
  else if (ctrl && k === 'y') redo();
  else if (ctrl && k === 'k') splitAtPlayhead();
  else if (ctrl && e.altKey && k === 'c') copyAttrs();
  else if (ctrl && e.altKey && k === 'v') pasteAttrsDialog();
  else if (ctrl && k === 'c') { if (selSet.size) clipboard = JSON.parse(JSON.stringify(selClips())); }
  else if (ctrl && k === 'x') cutSel();
  else if (ctrl && k === 's') saveProjectFile();
  else if (ctrl && k === 'a' && e.shiftKey) { stop(); selectFrom(frameRound(playhead)); }
  else if (ctrl && k === 'a') selectMany(state.clips.filter(c => !trackById(c.track)?.locked).map(c => c.id), sel);
  else if (ctrl && k === 'v') pasteClip(clipboard, playhead);
  else if (ctrl && k === 'd') duplicateSel();
  else if (ctrl) used = false;
  else if (vo && (k === ' ' || k === 'j' || k === 'k' || k === 'l')) voStop();
  else if (k === ' ') playing ? stop() : play();
  else if (e.altKey && (k === 'arrowleft' || k === 'arrowright')) nudgeSel((k === 'arrowleft' ? -1 : 1) * (e.shiftKey ? 10 : 1));
  else if (e.altKey && k === 'x') markIO(null);
  else if (k === 'arrowleft') stepFrames(e.shiftKey ? -10 : -1);
  else if (k === 'arrowright') stepFrames(e.shiftKey ? 10 : 1);
  else if (k === 'arrowup' || k === 'arrowdown') jumpEdit(k === 'arrowup' ? -1 : 1, e.shiftKey);
  else if (k === 'q' || k === 'w') { stop(); trimToPlayhead(k === 'q' ? 'l' : 'r', e.shiftKey); }
  else if (k === 'i') markIO('in', playhead);
  else if (k === 'o') markIO('out', playhead);
  else if ((k === '[' || k === ']') && !vo) { const c = clipById(sel); if (c && hasKf(c)) jumpKf(c, k === '[' ? -1 : 1); else toast('Select a clip with keyframes.', 1500); }
  else if (k === 'home') { stop(); setPlayhead(0); tl.scrollLeft = 0; }
  else if (k === 'end') { stop(); setPlayhead(projectEnd()); updatePlayheadUI(true); }
  else if (k === 'j') { stop(); setPlayhead(playhead - 1); }
  else if (k === 'k') stop();
  else if (k === 'l') play();
  else if (k === 'v') setTool('select');
  else if (k === 'c' && !simpleMode) setTool('razor');
  else if (k === 's') splitAtPlayhead();
  else if (k === 'n') toggleSnap();
  else if (k === 'g') toggleGuides();
  else if (k === 'm') toggleMarker(playhead);
  else if (k === 'f') freezeFrame();
  else if (k === 'delete' || k === 'backspace') deleteSel(e.shiftKey);
  else if (k === '=' || k === '+') setZoom(pps * 1.25);
  else if (k === '-') setZoom(pps / 1.25);
  else if (k === '\\') fitTimeline();
  else if (k === 'escape' && keyPick) cancelKeyPick();
  else if (k === 'escape') select(null);
  else used = false;
  if (used) e.preventDefault();
  // a shortcut fired from a slider/checkbox: drop its focus so the Inspector (skipped while it was focused) catches up
  if (used && e.target.tagName === 'INPUT' && insp.contains(e.target)) { e.target.blur(); renderInspector(); }
});

// external file drag & drop
let dragDepth = 0;
const isFileDrag = (e) => !dragMedia && e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => { if (isFileDrag(e)) { dragDepth++; $('#dropHint').hidden = false; } });
window.addEventListener('dragleave', (e) => { if (isFileDrag(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
window.addEventListener('dragover', (e) => { if (isFileDrag(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => { if (!isFileDrag(e)) return; e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true; importFiles([...e.dataTransfer.files]); });
new ResizeObserver(() => renderTimeline()).observe(tl);

// ───────────────────────── boot ─────────────────────────
(async function boot() {
  await DB.open();
  try {
    const recs = (await DB.run('media', 'readonly', s => s.getAll())) || [];
    for (const r of recs) {
      const m = { ...r, url: URL.createObjectURL(r.blob), img: null, peaks: peaksFrom(r.peaks) };   // records from before saved peaks decode once
      // images load in the background: never hold up restoring the project (decode can stall while the tab is hidden)
      if (m.kind === 'image') loadImage(m.url).then(img => { m.img = img; requestRender(); }, () => {});
      media.set(m.id, m); queuePeaks(m);
    }
    try { loadPresets(await DB.run('kv', 'readonly', s => s.get('presets'))); } catch {}   // app-wide, not part of the project
    const saved = await DB.run('kv', 'readonly', s => s.get('project'));
    if (saved) { const o = JSON.parse(saved); if (o && o.settings && Array.isArray(o.tracks) && Array.isArray(o.clips)) { Object.assign(state, o); if (!Array.isArray(state.markers)) state.markers = []; setIO(o); normalizeClips(); lastSnap = snapshot(); } }
  } catch (e) { toast('Could not restore the previous session: ' + (e && e.message)); }
  $('#saveState').textContent = DB.db ? '' : 'Autosave unavailable';
  renderBin(); refreshAll(true); requestAnimationFrame(tick); warnMissing();
})();

// debugging / automation handle
window.cutroom = { state, media, importFiles, projectToBlob, loadProjectBlob, selectMany, toggleMarker, get selIds() { return [...selSet]; }, addMediaClip, addText, addGenerated, val, toggleKf, setProp, upsertKf, setKfEase, easeMenu, kfKeysAt, kfTimes, jumpKf, EASE, setLibTab, splitClip, exportToBlob, supportedMimes, play, stop, setPlayhead, commit, undo, redo, select, els, insertFreeze, detachAudio, audioDetached, linkedOf, withLinked, selectClip, linkClips, unlinkClips, trimParts, applyTrim, trimEdge, deleteSel, clipsAt, trimToPlayhead, moveClips, nudgeSel, jumpEdit, selectFrom, markIO, ioRange, moveTrack, slipParts, applySlip, setMode, get simpleMode() { return simpleMode; }, closeGaps, splitAtPlayhead, duplicateSel, addTrack, place, pasteClip, clearKeyframes, fitFill, clampTl, isTypingKey, recordHistory, renderInspector, clipPose, drawFrame, handleHit, hitClipAt, removeMedia, tombs, mediaSaveFailed, driftNudge, rampGain, voLatency, voPlace, voStop, computePeaks, queuePeaks, peaksB64, peaksFrom, syncMedia, get vo() { return vo; }, set vo(v) { vo = v; }, exportSizeEstimate, renderStatus, exportDialog, get mediaUnsaved() { return mediaUnsaved; }, get fxF16() { return fxF16; }, copyAttrs, pasteAttrs, pasteAttrsDialog, attrGroups, get attrClip() { return attrClip; }, numExpr, clipUnderPlayhead, savePreset, deletePreset, applyPreset, loadPresets, presetDialog, shortcutsDialog, get userPresets() { return userPresets; }, gradeOn, keyOn, gradeLut, keyParams, pixelPass, startKeyPick, cancelKeyPick, pickKeyAt, get keyPick() { return keyPick; }, normalizeClips, FILTERS, fitFactors, frameBox, predOf, pairAt, tailsAt, tailSrcT, applyTrans, TRANSITIONS, textLayout, layoutCache, drawText, TEXT_PRESETS, TEXT_ANIMS, ANIMS, addGenerated, fadeFactor, FADE_CURVES, trackGain, setTrackGain, fmtDb, clipPeak, normalizeVol, cleanNodes, setChain, els, get hist() { return hist; }, relinkMedia, relinkPick, missingMedia, renameMedia, selectUses, removeUnused, findDup, renderBin, binList, get binQ() { return binQ; }, set binQ(v) { binQ = v; }, get binSort() { return binSort; }, set binSort(v) { binSort = v; }, get playhead() { return playhead; }, get playing() { return playing; } };
