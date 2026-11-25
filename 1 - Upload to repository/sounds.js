'use strict';
/* Arcanix sound library: sound effects and music beds synthesized on demand with the Web Audio API
   (no sample files, nothing downloaded). A sound becomes an ordinary WAV media item when first used, so it
   is saved with the project and exports like any imported audio. Loaded after app.js and shares its scope. */

const SR = 44100;
let noiseBuf = null;
function noiseSrc(oc) {                                         // looping white noise from a fixed seed (identical every time)
  if (!noiseBuf || noiseBuf.sampleRate !== oc.sampleRate) {
    noiseBuf = new AudioBuffer({ length: oc.sampleRate, numberOfChannels: 1, sampleRate: oc.sampleRate });
    const d = noiseBuf.getChannelData(0); let s = 7;
    for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  }
  const src = oc.createBufferSource(); src.buffer = noiseBuf; src.loop = true; return src;
}
const osc = (oc, type, f) => { const o = oc.createOscillator(); o.type = type; o.frequency.value = f; return o; };
const filt = (oc, type, f, q = 1) => { const b = oc.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
function envGain(oc, t0, attack, peak, decay) {                 // exponential attack/decay envelope
  const g = oc.createGain(); g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  return g;
}
const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[0]; };
function hit(oc, out, t0, { type = 'sine', f = 440, f2 = 0, sweep = 0.1, attack = 0.005, peak = 0.5, decay = 0.3, filter = null }) {
  const o = osc(oc, type, f), g = envGain(oc, t0, attack, peak, decay);
  if (f2) { o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f2, t0 + sweep); }
  if (filter) chain(o, filter, g, out); else chain(o, g, out);
  o.start(t0); o.stop(t0 + attack + decay + 0.05);
}
function noiseHit(oc, out, t0, { type = 'highpass', f = 2000, q = 1, attack = 0.002, peak = 0.5, decay = 0.1 }) {
  const n = noiseSrc(oc), g = envGain(oc, t0, attack, peak, decay);
  chain(n, filt(oc, type, f, q), g, out); n.start(t0); n.stop(t0 + attack + decay + 0.05);
}

const SOUNDS = [
  { id: 'whoosh', name: 'Whoosh', emoji: '💨', dur: 0.9, build(oc, out) {
    const n = noiseSrc(oc), bp = filt(oc, 'bandpass', 300, 1.2), g = envGain(oc, 0, 0.4, 0.9, 0.5);
    bp.frequency.setValueAtTime(300, 0); bp.frequency.exponentialRampToValueAtTime(3500, 0.45); bp.frequency.exponentialRampToValueAtTime(400, 0.9);
    chain(n, bp, g, out); n.start(0);
  } },
  { id: 'pop', name: 'Pop', emoji: '🫧', dur: 0.25, build(oc, out) { hit(oc, out, 0, { f: 900, f2: 180, sweep: 0.12, peak: 0.9, decay: 0.2 }); } },
  { id: 'click', name: 'Click', emoji: '🖱️', dur: 0.08, build(oc, out) { noiseHit(oc, out, 0, { f: 2500, peak: 0.8, decay: 0.05 }); } },
  { id: 'ding', name: 'Ding', emoji: '🔔', dur: 1.6, build(oc, out) {
    hit(oc, out, 0, { f: 1318.5, peak: 0.5, decay: 1.5 }); hit(oc, out, 0, { f: 2637, peak: 0.15, decay: 0.9 });
  } },
  { id: 'chime', name: 'Success', emoji: '✨', dur: 1.3, build(oc, out) {
    [1046.5, 1318.5, 1568].forEach((f, i) => hit(oc, out, i * 0.1, { type: 'triangle', f, peak: 0.35, decay: 0.95 }));
  } },
  { id: 'boom', name: 'Boom', emoji: '💥', dur: 1.7, build(oc, out) {
    hit(oc, out, 0, { f: 90, f2: 35, sweep: 1.2, attack: 0.01, peak: 1, decay: 1.6 });
    noiseHit(oc, out, 0, { type: 'lowpass', f: 300, attack: 0.005, peak: 0.6, decay: 0.6 });
  } },
  { id: 'riser', name: 'Riser', emoji: '📈', dur: 3, build(oc, out) {
    const o = osc(oc, 'sawtooth', 180), lp = filt(oc, 'lowpass', 400, 2), g = oc.createGain();
    o.frequency.setValueAtTime(180, 0); o.frequency.exponentialRampToValueAtTime(1400, 2.95);
    lp.frequency.setValueAtTime(400, 0); lp.frequency.exponentialRampToValueAtTime(6000, 2.95);
    g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.3, 2.9); g.gain.exponentialRampToValueAtTime(0.0001, 3);
    chain(o, lp, g, out); o.start(0); o.stop(3);
  } },
  { id: 'shutter', name: 'Camera', emoji: '📷', dur: 0.35, build(oc, out) {
    noiseHit(oc, out, 0, { type: 'bandpass', f: 3000, q: 0.8, peak: 0.8, decay: 0.05 });
    noiseHit(oc, out, 0.12, { type: 'bandpass', f: 2200, q: 0.8, peak: 0.6, decay: 0.08 });
  } },
  { id: 'buzz', name: 'Wrong', emoji: '❌', dur: 0.5, build(oc, out) { hit(oc, out, 0, { type: 'square', f: 140, attack: 0.01, peak: 0.3, decay: 0.45, filter: filt(oc, 'lowpass', 1200) }); } },
  { id: 'pad', name: 'Calm', emoji: '🎹', dur: 32, music: true, build(oc, out) {
    const chords = [[220, 261.63, 329.63], [174.61, 220, 261.63], [261.63, 329.63, 392], [196, 246.94, 293.66]];
    const lp = filt(oc, 'lowpass', 1400, 0.7), master = oc.createGain(); chain(lp, master, out);
    master.gain.setValueAtTime(0.0001, 0); master.gain.exponentialRampToValueAtTime(1, 1.5); master.gain.setValueAtTime(1, 30.5); master.gain.exponentialRampToValueAtTime(0.0001, 32);
    for (let k = 0; k < 8; k++) {
      const t0 = k * 4;
      for (const f of chords[k % 4]) for (const det of [-6, 6]) {
        const o = osc(oc, 'triangle', f); o.detune.value = det; const g = oc.createGain();
        g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.07, t0 + 1.2); g.gain.setValueAtTime(0.07, t0 + 3.6); g.gain.linearRampToValueAtTime(0, t0 + 4.8);
        chain(o, g, lp); o.start(t0); o.stop(t0 + 5);
      }
    }
  } },
  { id: 'beat', name: 'Upbeat', emoji: '🥁', dur: 32, music: true, build(oc, out) {
    const master = oc.createGain(); master.connect(out);
    master.gain.setValueAtTime(0.0001, 0); master.gain.exponentialRampToValueAtTime(1, 0.3); master.gain.setValueAtTime(1, 31); master.gain.exponentialRampToValueAtTime(0.0001, 32);
    const roots = [110, 87.31, 130.81, 98];                      // A F C G, one bar (2 s) each at 120 bpm
    for (let b = 0; b < 64; b++) {
      const t = b * 0.5;
      hit(oc, master, t, { f: 150, f2: 45, sweep: 0.12, attack: 0.002, peak: 0.8, decay: 0.25 });                       // kick
      noiseHit(oc, master, t + 0.25, { f: 7000, peak: 0.18, decay: 0.05 });                                               // hi-hat
      if (b % 2 === 1) noiseHit(oc, master, t, { type: 'bandpass', f: 1800, q: 0.7, peak: 0.35, decay: 0.16 });       // snare
      hit(oc, master, t, { type: 'triangle', f: roots[Math.floor(b / 4) % 4], attack: 0.01, peak: 0.3, decay: 0.42 }); // bass
    }
  } },
];

const soundCache = new Map();                                   // id -> Promise<AudioBuffer>
function renderSound(def) {
  if (!soundCache.has(def.id)) soundCache.set(def.id, (async () => {
    const oc = new OfflineAudioContext(2, Math.ceil(def.dur * SR), SR), out = oc.createGain(); out.connect(oc.destination);
    def.build(oc, out); return oc.startRendering();
  })());
  return soundCache.get(def.id);
}
function wavOf(buf) {                                           // 16-bit PCM WAV
  const ch = buf.numberOfChannels, n = buf.length, ab = new ArrayBuffer(44 + n * ch * 2), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * ch * 2, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, k) => buf.getChannelData(k)); let p = 44;
  for (let i = 0; i < n; i++) for (let k = 0; k < ch; k++) { dv.setInt16(p, Math.round(clamp(data[k][i], -1, 1) * 32767), true); p += 2; }
  return new Blob([ab], { type: 'audio/wav' });
}
let previewNode = null;
async function previewSound(def) {
  ensureAudio(); if (!actx) return;
  if (previewNode) { try { previewNode.stop(); } catch {} previewNode = null; }
  const buf = await renderSound(def), src = actx.createBufferSource(); src.buffer = buf; src.connect(master); src.start();
  previewNode = src; if (def.music) setTimeout(() => { if (previewNode === src) { try { src.stop(); } catch {} } }, 8000);   // music previews play 8 s
}
async function addSound(def) {
  const file = `${def.name}${def.music ? ' (music)' : ''}.wav`;
  let m = [...media.values()].find(x => x.name === file && x.kind === 'audio');
  if (!m) { const buf = await renderSound(def); [m] = await importFiles([new File([wavOf(buf)], file, { type: 'audio/wav' })]); if (!m) return null; }
  const t0 = frameRound(playhead), probe = { id: 'probe', dur: m.dur };
  const tr = state.tracks.find(t => t.kind === 'audio' && !t.locked && place(probe, t.id, t0) === t0) || addTrack('audio', true);
  return addMediaClip(m, tr.id, t0, def.music ? { duck: true, volume: 70, fadeOut: 1 } : null);   // one undo step
}
window.cutroom.SOUNDS = SOUNDS; window.cutroom.addSound = addSound; window.cutroom.renderSound = renderSound; window.cutroom.duckFactor = duckFactor;
