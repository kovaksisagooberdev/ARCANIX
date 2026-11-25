'use strict';
/* Arcanix fast export — offline (not real-time) render to MP4 (H.264 + AAC).
   Loaded after app.js and shares its top-level scope (state, media, val, drawFrame, playhead, ...).

   Pipeline per output frame: get the exact source frame for every active video clip →
   composite with the normal drawFrame() → VideoEncoder. Audio is mixed in an OfflineAudioContext
   and encoded with AudioEncoder. The result is written by the small MP4 muxer below.

   Source frames come from one of two readers:
     Mp4Source  — own MP4/MOV demuxer + WebCodecs VideoDecoder, sequential decode (fast).
                  Used for unfragmented, unrotated H.264 (avc1/avc3) files.
     SeekSource — a hidden <video> element seeked to each frame (slower, works for anything
                  the browser can play). Used for everything else. */

const fastYield = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });   // not throttled in hidden tabs
const fastExportSupported = () => 'VideoEncoder' in window && 'AudioEncoder' in window && 'VideoFrame' in window;

// ───────────────────────── MP4 demuxer (video track sample table) ─────────────────────────
function mp4Kids(buf, s, e) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength), out = [];
  let p = s;
  while (p + 8 <= e) {
    let sz = dv.getUint32(p), hdr = 8;
    const type = String.fromCharCode(buf[p + 4], buf[p + 5], buf[p + 6], buf[p + 7]);
    if (sz === 1) { if (p + 16 > e) break; sz = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12); hdr = 16; }
    else if (sz === 0) sz = e - p;
    if (sz < hdr || p + sz > e) break;
    out.push({ type, s: p + hdr, e: p + sz }); p += sz;
  }
  return out;
}
async function mp4Open(blob) {
  const TOP = ['ftyp', 'styp', 'moov', 'mdat', 'free', 'skip', 'wide', 'uuid', 'meta', 'moof', 'sidx', 'mfra', 'pnot'];
  let pos = 0, moov = null;
  while (pos + 8 <= blob.size) {
    const hb = new Uint8Array(await blob.slice(pos, pos + 16).arrayBuffer()), h = new DataView(hb.buffer);
    let sz = h.getUint32(0), hdr = 8;
    const type = String.fromCharCode(hb[4], hb[5], hb[6], hb[7]);
    if (!TOP.includes(type)) throw new Error('not an MP4/MOV container');
    if (sz === 1) { if (hb.length < 16) break; sz = h.getUint32(8) * 4294967296 + h.getUint32(12); hdr = 16; }
    else if (sz === 0) sz = blob.size - pos;
    if (sz < hdr) break;
    if (type === 'moov') { if (sz > 512e6) throw new Error('moov too large'); moov = new Uint8Array(await blob.slice(pos + hdr, pos + sz).arrayBuffer()); break; }
    pos += sz;
  }
  if (!moov) throw new Error('no moov box');
  const dv = new DataView(moov.buffer), top = mp4Kids(moov, 0, moov.length), find = (l, t) => l.find(b => b.type === t);
  const mvhd = find(top, 'mvhd'); if (!mvhd) throw new Error('no mvhd');
  const movieScale = moov[mvhd.s] === 1 ? dv.getUint32(mvhd.s + 20) : dv.getUint32(mvhd.s + 12);
  for (const trak of top.filter(b => b.type === 'trak')) {
    const tk = mp4Kids(moov, trak.s, trak.e), mdia = find(tk, 'mdia'); if (!mdia) continue;
    const mk = mp4Kids(moov, mdia.s, mdia.e), hdlr = find(mk, 'hdlr');
    if (!hdlr || String.fromCharCode(...moov.subarray(hdlr.s + 8, hdlr.s + 12)) !== 'vide') continue;
    const mdhd = find(mk, 'mdhd'), tkhd = find(tk, 'tkhd'), minf = find(mk, 'minf');
    if (!mdhd || !tkhd || !minf) throw new Error('incomplete video track');
    const scale = moov[mdhd.s] === 1 ? dv.getUint32(mdhd.s + 20) : dv.getUint32(mdhd.s + 12);
    const mo = tkhd.s + (moov[tkhd.s] === 1 ? 52 : 40);
    if (!(dv.getInt32(mo) === 0x10000 && dv.getInt32(mo + 4) === 0 && dv.getInt32(mo + 12) === 0 && dv.getInt32(mo + 16) === 0x10000))
      throw new Error('track has a rotation/scale matrix');
    // edit list: presentation time = (dts + ctts − mediaTime) / scale + emptyEdit
    let mediaTime = 0, emptyDur = 0;
    const edts = find(tk, 'edts'), elst = edts && find(mp4Kids(moov, edts.s, edts.e), 'elst');
    if (elst) {
      const v = moov[elst.s], n = dv.getUint32(elst.s + 4); let p = elst.s + 8;
      for (let i = 0; i < n; i++) {
        let seg, mt;
        if (v === 1) { seg = dv.getUint32(p) * 4294967296 + dv.getUint32(p + 4); mt = dv.getInt32(p + 8) * 4294967296 + dv.getUint32(p + 12); p += 20; }
        else { seg = dv.getUint32(p); mt = dv.getInt32(p + 4); p += 12; }
        if (mt === -1 || (v === 1 && mt < 0)) emptyDur += seg / movieScale; else { mediaTime = mt; break; }
      }
    }
    const stblB = find(mp4Kids(moov, minf.s, minf.e), 'stbl'); if (!stblB) throw new Error('no stbl');
    const st = mp4Kids(moov, stblB.s, stblB.e);
    const stsd = find(st, 'stsd'), stts = find(st, 'stts'), ctts = find(st, 'ctts'), stss = find(st, 'stss'), stsz = find(st, 'stsz'), stsc = find(st, 'stsc'), stco = find(st, 'stco'), co64 = find(st, 'co64');
    if (!stsd || !stts || !stsz || !stsc || !(stco || co64)) throw new Error('incomplete sample table');
    if (dv.getUint32(stsd.s + 4) !== 1) throw new Error('multiple sample descriptions');
    const es = stsd.s + 8, esz = dv.getUint32(es), fmt = String.fromCharCode(...moov.subarray(es + 4, es + 8));
    if (fmt !== 'avc1' && fmt !== 'avc3') throw new Error(`codec ${fmt} has no fast path`);
    const width = dv.getUint16(es + 32), height = dv.getUint16(es + 34);
    const avcC = find(mp4Kids(moov, es + 86, es + esz), 'avcC'); if (!avcC) throw new Error('no avcC');
    const description = moov.slice(avcC.s, avcC.e), hx = (b) => b.toString(16).padStart(2, '0');
    const codec = `${fmt}.${hx(description[1])}${hx(description[2])}${hx(description[3])}`;
    const fixed = dv.getUint32(stsz.s + 4), N = dv.getUint32(stsz.s + 8);
    if (!N) throw new Error('no samples in moov (fragmented MP4)');
    const sizes = new Uint32Array(N), offsets = new Float64Array(N), pts = new Float64Array(N), sync = new Uint8Array(N);
    for (let i = 0; i < N; i++) sizes[i] = fixed || dv.getUint32(stsz.s + 12 + i * 4);
    // chunk → sample offsets
    const nChunks = dv.getUint32((stco || co64).s + 4), nStsc = dv.getUint32(stsc.s + 4);
    const chunkOff = (i) => stco ? dv.getUint32(stco.s + 8 + i * 4) : dv.getUint32(co64.s + 8 + i * 8) * 4294967296 + dv.getUint32(co64.s + 12 + i * 8);
    let si = 0, sample = 0;
    for (let ch = 1; ch <= nChunks && sample < N; ch++) {
      while (si + 1 < nStsc && dv.getUint32(stsc.s + 8 + (si + 1) * 12) <= ch) si++;
      const spc = dv.getUint32(stsc.s + 12 + si * 12); let off = chunkOff(ch - 1);
      for (let k = 0; k < spc && sample < N; k++) { offsets[sample] = off; off += sizes[sample]; sample++; }
    }
    if (sample < N) throw new Error('sample table is inconsistent');
    // decode times, then composition offsets
    let t = 0, i = 0;
    for (let e = 0, n = dv.getUint32(stts.s + 4); e < n && i < N; e++) {
      const cnt = dv.getUint32(stts.s + 8 + e * 8), delta = dv.getUint32(stts.s + 12 + e * 8);
      for (let k = 0; k < cnt && i < N; k++) { pts[i++] = t; t += delta; }
    }
    if (ctts) { i = 0; for (let e = 0, n = dv.getUint32(ctts.s + 4); e < n && i < N; e++) { const cnt = dv.getUint32(ctts.s + 8 + e * 8), off = dv.getInt32(ctts.s + 12 + e * 8); for (let k = 0; k < cnt && i < N; k++) pts[i++] += off; } }
    for (i = 0; i < N; i++) pts[i] = (pts[i] - mediaTime) / scale + emptyDur;
    if (stss) { for (let e = 0, n = dv.getUint32(stss.s + 4); e < n; e++) { const s1 = dv.getUint32(stss.s + 8 + e * 4); if (s1 >= 1 && s1 <= N) sync[s1 - 1] = 1; } } else sync.fill(1);
    if (!sync[0]) throw new Error('first sample is not a key frame');
    const cfg = { codec, codedWidth: width, codedHeight: height, description };
    const sup = await VideoDecoder.isConfigSupported(cfg); if (!sup.supported) throw new Error(`decoder does not support ${codec}`);
    return { blob, cfg, N, sizes, offsets, pts, sync };
  }
  throw new Error('no video track');
}

// sequential frame reader over an opened MP4 track
class Mp4Source {
  constructor(info) { this.i = info; this.kind = 'decode'; this.queue = []; this.cur = null; this.next = 0; this.eof = false; this.err = null; this.started = false; this.win = null; this.winOff = 0; this.wake = null;
    this.gen = 0; this.fed = 0; this.out = 0; this.flushing = false;
    this.dec = new VideoDecoder({ output: (f) => { this.out++; let k = this.queue.length; while (k > 0 && this.queue[k - 1].timestamp > f.timestamp) k--; this.queue.splice(k, 0, f); this._wake(); }, error: (e) => { this.err = e; this._wake(); } });
    this.dec.addEventListener('dequeue', () => this._wake());
  }
  _wake() { if (this.wake) { const w = this.wake; this.wake = null; w(); } }
  async _bytes(k) {
    const off = this.i.offsets[k], sz = this.i.sizes[k];
    if (!this.win || off < this.winOff || off + sz > this.winOff + this.win.byteLength) {
      this.winOff = off; this.win = new Uint8Array(await this.i.blob.slice(off, off + Math.max(sz, 4 << 20)).arrayBuffer());
    }
    return this.win.subarray(off - this.winOff, off - this.winOff + sz);
  }
  _seek(t) {
    for (const f of this.queue) f.close(); this.queue = []; if (this.cur) { this.cur.close(); this.cur = null; }
    if (this.started) this.dec.reset();
    this.dec.configure(this.i.cfg); this.started = true; this.eof = false; this.flushing = false; this.fed = 0; this.out = 0; this.gen++;
    let k = 0; for (let j = 0; j < this.i.N; j++) if (this.i.sync[j] && this.i.pts[j] <= t + 1e-6) k = j;   // last key frame at or before t
    this.next = k;
  }
  async frameAt(t) {
    const ts = t * 1e6;
    if (!this.started || (this.cur && (ts < this.cur.timestamp - 1000 || ts > this.cur.timestamp + 8e6))) this._seek(t);
    for (;;) {
      if (this.err) throw new Error('video decoder error: ' + (this.err.message || this.err));
      while (this.queue.length && (this.queue[0].timestamp <= ts + 500 || !this.cur)) { if (this.cur) this.cur.close(); this.cur = this.queue.shift(); }
      if (this.queue.length || this.eof) break;          // a later frame is waiting, so cur covers t
      // Flow control: decoders stall once too many output frames are left unclosed, so never feed far
      // ahead of what has come out, and never block on flush() while frames are waiting to be consumed.
      const waiter = new Promise(r => this.wake = r), gen = this.gen;
      if (this.next < this.i.N) {
        for (let n = 0; n < 4 && this.next < this.i.N && this.fed - this.out < 20; n++) {
          const k = this.next, data = await this._bytes(k);
          if (gen !== this.gen) break;
          this.dec.decode(new EncodedVideoChunk({ type: this.i.sync[k] ? 'key' : 'delta', timestamp: Math.round(this.i.pts[k] * 1e6), data }));
          this.next++; this.fed++;
        }
      } else if (!this.flushing) {
        this.flushing = true;
        this.dec.flush().then(() => { if (gen === this.gen) { this.eof = true; this._wake(); } }, (e) => { if (gen === this.gen) { this.err = e; this._wake(); } });
      }
      await waiter;
    }
    return this.cur ? { img: this.cur, w: this.cur.displayWidth, h: this.cur.displayHeight } : null;
  }
  close() { for (const f of this.queue) f.close(); this.queue = []; if (this.cur) this.cur.close(); this.cur = null; try { this.dec.close(); } catch {} }
}
// fallback: a private <video> element seeked to each requested time
class SeekSource {
  constructor(m) { this.kind = 'seek'; this.el = document.createElement('video'); this.el.muted = true; this.el.preload = 'auto'; this.el.src = m.url; this.dur = m.dur; this.last = -1; }
  async frameAt(t) {
    const el = this.el;
    if (el.readyState < 1) await once(el, 'loadedmetadata', 8000);
    const tt = clamp(t, 0, Math.max(0, this.dur - 0.001));
    if (Math.abs(this.last - tt) > 1e-5) { this.last = tt; el.currentTime = tt; await once(el, 'seeked', 8000); }
    if (el.readyState < 2) await once(el, 'loadeddata', 8000);
    return el.readyState >= 2 && el.videoWidth ? { img: el, w: el.videoWidth, h: el.videoHeight } : null;
  }
  close() { this.el.removeAttribute('src'); this.el.load(); }
}

// ───────────────────────── MP4 muxer (one H.264 track + optional AAC track) ─────────────────────────
const mxCat = (parts) => { let n = 0; for (const p of parts) n += p.length; const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };
const mxU16 = (n) => [(n >> 8) & 255, n & 255];
const mxU32 = (n) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const mxStr = (s) => [...s].map(c => c.charCodeAt(0));
const mxZ = (n) => new Array(n).fill(0);
const mxU32s = (nums) => { const b = new Uint8Array(nums.length * 4), dv = new DataView(b.buffer); for (let i = 0; i < nums.length; i++) dv.setUint32(i * 4, nums[i]); return b; };
function mxBox(type, ...payload) {
  const body = mxCat(payload.map(p => p instanceof Uint8Array ? p : new Uint8Array(p)));
  const o = new Uint8Array(8 + body.length); new DataView(o.buffer).setUint32(0, o.length); o.set(mxStr(type), 4); o.set(body, 8); return o;
}
const mxFull = (type, ver, flags, ...p) => mxBox(type, [ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255], ...p);
const MX_MATRIX = [...mxU32(0x10000), ...mxZ(12), ...mxU32(0x10000), ...mxZ(12), ...mxU32(0x40000000)];
/* video: {w, h, fps, description(avcC), samples:[{data, key}]}   (constant frame duration, no B-frames)
   audio: {sampleRate, channels, bitrate, asc, samples:[{data}]} or null   (1024 PCM frames per sample)
   video null = audio only: an M4A file (ftyp 'M4A ', a single sound track) */
function muxMp4(video, audio) {
  const m4a = !video; if (m4a) video = { fps: 1, samples: [] };
  const MOVIE = 1000, vScale = video.fps * 1000, vDelta = 1000;
  const vDur = video.samples.length / video.fps, aDur = audio ? audio.samples.length * 1024 / audio.sampleRate : 0;
  // interleave in half-second chunks: video chunk, then the audio chunk for the same window
  const order = [], vChunks = [], aChunks = [];
  const aPer = audio ? audio.sampleRate / 1024 : 0; let vi = 0, ai = 0;
  for (let w = 0; vi < video.samples.length || (audio && ai < audio.samples.length); w++) {
    const tEnd = (w + 1) * 0.5;
    let v1 = vi; while (v1 < video.samples.length && v1 / video.fps < tEnd) v1++;
    if (v1 > vi) { const c = { first: vi, count: v1 - vi, rel: 0 }; vChunks.push(c); order.push([c, video.samples]); vi = v1; }
    if (audio) { let a1 = ai; while (a1 < audio.samples.length && a1 / aPer < tEnd) a1++; if (a1 > ai) { const c = { first: ai, count: a1 - ai, rel: 0 }; aChunks.push(c); order.push([c, audio.samples]); ai = a1; } }
  }
  const dataParts = []; let rel = 0;
  for (const [c, samples] of order) { c.rel = rel; for (let i = c.first; i < c.first + c.count; i++) { dataParts.push(samples[i].data); rel += samples[i].data.length; } }
  const stbl = (stsdEntry, samples, chunks, sttsDelta, base, withStss) => {
    const stsc = []; let prev = -1; chunks.forEach((c, i) => { if (c.count !== prev) { stsc.push(i + 1, c.count, 1); prev = c.count; } });
    const parts = [mxFull('stsd', 0, 0, mxU32(1), stsdEntry), mxFull('stts', 0, 0, mxU32(1), mxU32(samples.length), mxU32(sttsDelta))];
    if (withStss) { const keys = []; samples.forEach((s, i) => { if (s.key) keys.push(i + 1); }); parts.push(mxFull('stss', 0, 0, mxU32(keys.length), mxU32s(keys))); }
    parts.push(mxFull('stsc', 0, 0, mxU32(stsc.length / 3), mxU32s(stsc)), mxFull('stsz', 0, 0, mxU32(0), mxU32(samples.length), mxU32s(samples.map(s => s.data.length))),
      mxFull('stco', 0, 0, mxU32(chunks.length), mxU32s(chunks.map(c => base + c.rel))));
    return mxBox('stbl', ...parts);
  };
  const trak = (id, isVideo, dur, scale, sb) => mxBox('trak',
    mxFull('tkhd', 0, 3, mxZ(8), mxU32(id), mxZ(4), mxU32(Math.round(dur * MOVIE)), mxZ(8), mxU16(0), mxU16(0), mxU16(isVideo ? 0 : 0x0100), mxZ(2), MX_MATRIX,
      mxU32(isVideo ? video.w * 65536 : 0), mxU32(isVideo ? video.h * 65536 : 0)),
    mxBox('mdia',
      mxFull('mdhd', 0, 0, mxZ(8), mxU32(scale), mxU32(Math.round(dur * scale)), mxU16(0x55C4), mxU16(0)),
      mxFull('hdlr', 0, 0, mxZ(4), mxStr(isVideo ? 'vide' : 'soun'), mxZ(12), mxStr(isVideo ? 'Arcanix Video' : 'Arcanix Audio'), [0]),
      mxBox('minf', isVideo ? mxFull('vmhd', 0, 1, mxZ(8)) : mxFull('smhd', 0, 0, mxZ(4)),
        mxBox('dinf', mxFull('dref', 0, 0, mxU32(1), mxFull('url ', 0, 1))), sb)));
  const build = (base) => {
    const traks = [];
    if (!m4a) {
      const avc1 = mxBox('avc1', mxZ(6), mxU16(1), mxZ(16), mxU16(video.w), mxU16(video.h), mxU32(0x00480000), mxU32(0x00480000), mxZ(4), mxU16(1), mxZ(32), mxU16(0x18), [0xFF, 0xFF], mxBox('avcC', video.description));
      traks.push(trak(1, true, vDur, vScale, stbl(avc1, video.samples, vChunks, vDelta, base, true)));
    }
    if (audio) {
      const dcd = [0x40, 0x15, 0, 0, 0, ...mxU32(audio.bitrate), ...mxU32(audio.bitrate), 0x05, audio.asc.length, ...audio.asc];
      const esd = [0, 0, 0, 0x04, dcd.length, ...dcd, 0x06, 1, 2];
      const mp4a = mxBox('mp4a', mxZ(6), mxU16(1), mxZ(8), mxU16(audio.channels), mxU16(16), mxZ(4), mxU32((audio.sampleRate * 65536) >>> 0), mxFull('esds', 0, 0, [0x03, esd.length, ...esd]));
      traks.push(trak(traks.length + 1, false, aDur, audio.sampleRate, stbl(mp4a, audio.samples, aChunks, 1024, base, false)));
    }
    return mxBox('moov', mxFull('mvhd', 0, 0, mxZ(8), mxU32(MOVIE), mxU32(Math.round(Math.max(vDur, aDur) * MOVIE)), mxU32(0x10000), mxU16(0x0100), mxZ(10), MX_MATRIX, mxZ(24), mxU32(traks.length + 1)), ...traks);
  };
  const ftyp = m4a ? mxBox('ftyp', mxStr('M4A '), mxU32(0), mxStr('M4A isommp42'))
    : mxBox('ftyp', mxStr('isom'), mxU32(0x200), mxStr('isomiso2avc1mp41'));
  const base = ftyp.length + build(0).length + 8;            // moov size does not depend on the offset values
  if (base + rel > 0xFFFFFFF0) throw new Error('export is larger than 4 GB; use a lower quality');
  const mdatHead = new Uint8Array(8); new DataView(mdatHead.buffer).setUint32(0, 8 + rel); mdatHead.set(mxStr('mdat'), 4);
  return new Blob([ftyp, build(base), mdatHead, ...dataParts], { type: m4a ? 'audio/mp4' : 'video/mp4' });
}

// ───────────────────────── offline audio mix ─────────────────────────
/* Resolves with {buf (null when nothing is audible), dropped: names of media whose audio could not be read or decoded}.
   A video file with no audio track is not a drop. check() throws to abort; onStep(k, n) reports per-clip progress.
   The mix covers the sequence range [from, end): the buffer is (end - from) long and sequence time `from` is its sample 0. */
async function mixAudioOffline(end, check = () => {}, onStep, from = 0) {
  const SR = 48000, oc = new OfflineAudioContext(2, Math.max(1, Math.round((end - from) * SR)), SR), cache = new Map(), dropped = new Set(); let any = false;
  const list = state.clips.filter(c => hasSource(c) && c.start < end && c.start + c.dur > from + 1e-6);
  for (let k = 0; k < list.length; k++) {
    const c = list[k]; check(); onStep && onStep(k, list.length);
    const tr = trackById(c.track), m = media.get(c.mediaId); if (!tr || tr.muted || !m) continue;
    let buf = cache.get(m.id);
    if (buf === undefined) {
      let ab = null; buf = null;
      try { ab = await m.blob.arrayBuffer(); } catch { dropped.add(m.name); }      // read / allocation failure
      check();
      if (ab) try { buf = await oc.decodeAudioData(ab); } catch (e) {
        // EncodingError on a video = no audio track (silent, fine); anything else, or an audio file that will not decode, is a drop
        if (m.kind === 'audio' || !(e && e.name === 'EncodingError')) dropped.add(m.name);
      }
      check(); cache.set(m.id, buf);
    }
    if (!buf) continue;
    let sbuf = buf, rate = c.speed, offs = c.in;
    if (c.speed !== 1 && c.props.keepPitch !== false) {         // keep pitch: time-stretch the used range, then play it at rate 1
      const i0 = Math.max(0, Math.floor(c.in * SR)), i1 = Math.min(buf.length, i0 + Math.ceil(c.dur * c.speed * SR)), outLen = Math.max(1, Math.round(c.dur * SR));
      if (i1 - i0 < 2) continue;
      const chs = Array.from({ length: buf.numberOfChannels }, (_, ch) => buf.getChannelData(ch).subarray(i0, i1));
      const st = wsolaStretch(chs, outLen, SR, c.speed); sbuf = oc.createBuffer(chs.length, outLen, SR);
      st.forEach((d, ch) => sbuf.copyToChannel(d, ch));
      rate = 1; offs = 0;
      await fastYield(); check();
    }
    // a clip that began before `from` starts at 0 in the mix, `skip` seconds into itself
    const skip = Math.max(0, from - c.start), t0 = c.start + skip, d = c.dur - skip;
    const src = oc.createBufferSource(); src.buffer = sbuf; src.playbackRate.value = rate;
    const g = oc.createGain(), n = Math.max(2, Math.ceil(d * 100)), curve = new Float32Array(n), tg = trackGain(tr);
    for (let i = 0; i < n; i++) { const t = t0 + d * i / (n - 1); curve[i] = tg * val(c, 'volume', t) / 100 * fadeFactor(c, t) * duckFactor(c, t); }
    g.gain.setValueCurveAtTime(curve, t0 - from, d);
    let at = src; for (const fx of cleanNodes(oc, c.props)) { at.connect(fx); at = fx; }   // same high-pass / compressor chain as the preview
    at.connect(g); g.connect(oc.destination); src.start(t0 - from, offs + skip * rate, d * rate); any = true;
  }
  check();
  return { buf: any ? await oc.startRendering() : null, dropped: [...dropped] };
}
/* WSOLA time-stretch: chs (one Float32Array per channel) played `alpha` times faster, into outLen samples, pitch unchanged.
   Hann frames of ~40 ms overlap-add at half a frame; each frame's read position moves up to ±10 ms to where it best
   continues the previous frame (cross-correlation on the channel mix), which avoids phasing and clicks. */
function wsolaStretch(chs, outLen, sr, alpha) {
  const inLen = chs[0].length, N = Math.max(64, Math.round(sr * 0.04) & ~1), H = N / 2, tol = Math.round(sr * 0.01);
  const win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let mono = chs[0];
  if (chs.length > 1) { mono = new Float32Array(inLen); for (const d of chs) for (let i = 0; i < inLen; i++) mono[i] += d[i]; }
  const at = (p) => (p >= 0 && p < inLen ? mono[p] : 0);
  const out = chs.map(() => new Float32Array(outLen + N)), wsum = new Float32Array(outLen + N);
  let prev = -1;
  for (let o = 0, k = 0; o < outLen; o += H, k++) {
    let pos = Math.round(k * H * alpha);
    if (prev >= 0) {
      const nat = prev + H; let best = -Infinity, bd = 0;
      for (let d = -tol; d <= tol; d += 2) {
        const p = pos + d; if (p < 0 || p >= inLen) continue;
        let s = 0; for (let i = 0; i < N; i += 8) s += at(nat + i) * at(p + i);
        if (s > best) { best = s; bd = d; }
      }
      pos = Math.max(0, pos + bd);
    }
    for (let ch = 0; ch < chs.length; ch++) {
      const src = chs[ch], dst = out[ch], n = Math.min(N, inLen - pos);
      for (let i = 0; i < n; i++) dst[o + i] += src[pos + i] * win[i];
    }
    for (let i = 0; i < N; i++) wsum[o + i] += win[i];
    prev = pos;
  }
  for (const d of out) for (let i = 0; i < outLen; i++) if (wsum[i] > 1e-3) d[i] /= wsum[i];
  return out.map(d => d.subarray(0, outLen));
}
async function encodeAac(buf, bitrate, check = () => {}, onStep) {
  const SR = buf.sampleRate, cfg = { codec: 'mp4a.40.2', sampleRate: SR, numberOfChannels: 2, bitrate };
  if (!(await AudioEncoder.isConfigSupported(cfg)).supported) throw new Error('this browser cannot encode AAC audio');
  const samples = []; let asc = null, err = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => {
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !asc) asc = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); samples.push({ data: b });
    }, error: (e) => { err = e; },
  });
  enc.configure(cfg);
  const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L, CH = 48000;
  for (let off = 0; off < buf.length; off += CH) {
    try { check(); } catch (e) { try { enc.close(); } catch {} throw e; }
    if (onStep && off % (CH * 10) === 0) onStep(off / buf.length);
    const n = Math.min(CH, buf.length - off), data = new Float32Array(n * 2);
    data.set(L.subarray(off, off + n), 0); data.set(R.subarray(off, off + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(off / SR * 1e6), data });
    enc.encode(ad); ad.close();
    if (enc.encodeQueueSize > 8) await fastYield();
  }
  await enc.flush(); enc.close();
  if (err) throw new Error('audio encoder error: ' + (err.message || err));
  if (!asc) asc = new Uint8Array([0x11, 0x90]);               // AAC-LC, 48 kHz, stereo
  return { sampleRate: SR, channels: 2, bitrate, asc, samples };
}

// ───────────────────────── offline render ─────────────────────────
async function pickAvcConfig(w, h, fps, bitrate) {
  const px = w * h, want = px > 1920 * 1088 ? (fps > 30 ? '34' : '33') : (fps > 30 ? '2a' : '28');
  for (const codec of [`avc1.6400${want}`, `avc1.4d00${want}`, `avc1.4200${want}`, 'avc1.640034', 'avc1.640033', 'avc1.64002a', 'avc1.42e034']) {
    const cfg = { codec, width: w, height: h, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
    try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
  }
  return null;
}
// frame sources for an offline render: sourceFor(c) opens (and caches per clip) an Mp4Source or SeekSource
function frameSources(stats) {
  const sources = new Map(), opened = new Map();
  const sourceFor = async (c) => {
    let s = sources.get(c.id); if (s) return s;
    const m = media.get(c.mediaId); if (!m) return null;
    let info = opened.get(m.id);
    if (info === undefined) { try { info = await mp4Open(m.blob); } catch (e) { info = null; (stats.fallbackReasons = stats.fallbackReasons || {})[m.name] = e.message; } opened.set(m.id, info); }
    s = info ? new Mp4Source(info) : new SeekSource(m); stats[s.kind] = (stats[s.kind] || 0) + 1; sources.set(c.id, s); return s;
  };
  return { sources, sourceFor, closeAll: () => { for (const s of sources.values()) s.close(); sources.clear(); } };
}
/* composite the sequence at T into cv from exact source frames (offline must be set). Times must not go backwards:
   sources of clips that have ended are closed. */
async function compositeAt(T, fs) {
  const vts = state.tracks.filter(t => t.kind === 'video' && !t.hidden).map(t => t.id), tails = tailsAt(T); offline.frames.clear();
  for (const c of state.clips) {
    const tl = tails.has(c.id);                                 // the predecessor of a dissolve / push keeps its source open past its end
    const active = c.type === 'video' && vts.includes(c.track) && ((T >= c.start && T < c.start + c.dur) || tl);
    if (!active) { const s = fs.sources.get(c.id); if (s && T >= c.start + c.dur) { s.close(); fs.sources.delete(c.id); } continue; }
    const s = await fs.sourceFor(c); if (!s) continue;
    const f = await s.frameAt(tl ? tailSrcT(c, T) : c.in + (T - c.start) * c.speed); if (f) offline.frames.set(c.id, f);
  }
  playhead = T; drawFrame();                                    // synchronous composite from offline.frames
}
/* PNG stills of the sequence at each time in `times` (clean frames: no guides or selection). Resolves with [{t, blob}]. */
async function renderStills(times, check = () => {}) {
  if (exporting || offline) throw new Error('An export is already running.');
  if (!fastExportSupported()) throw new Error('This browser has no WebCodecs decoder for exact frames.');
  stop();
  const savedPlayhead = playhead, fs = frameSources({}), out = [];
  exporting = { end: projectEnd(), offline: true, progress() {}, finish() {}, cancel() {} }; offline = { frames: new Map() };
  try {
    for (const t of [...times].sort((a, b) => a - b)) {
      check(); await compositeAt(t, fs);
      out.push({ t, blob: await new Promise((ok, no) => cv.toBlob(b => b ? ok(b) : no(new Error('could not encode PNG')), 'image/png')) });
    }
    return out;
  } finally { fs.closeAll(); offline = null; exporting = null; playhead = savedPlayhead; updatePlayheadUI(); requestRender(); }
}
/* Resolves with {blob, ext:'mp4', stats}. onProgress receives 0..1 and a status string (audio is the first AUDIO_SHARE of the bar).
   signal (optional AbortSignal) cancels like exporting.cancel(); both reject with 'cancelled'. stats.audioDropped lists media whose audio is missing.
   opts (all optional): from / to = sequence range (default the whole sequence); w / h / fps = output size and rate (default the project's).
   The compositor still renders at the project size; frames are scaled to w × h before encoding. */
const AUDIO_SHARE = 0.1;
async function exportFast(bitrate, onProgress, signal, opts = {}) {
  const pe = projectEnd(), S = state.settings, from = clamp(opts.from || 0, 0, pe), end = clamp(opts.to == null ? pe : opts.to, from, pe);
  const w = opts.w || S.w, h = opts.h || S.h, fps = opts.fps || S.fps, len = end - from;
  if (!pe) throw new Error('The timeline is empty.');
  if (len < 0.5 / fps) throw new Error('The export range is empty.');
  if (exporting || offline) throw new Error('An export is already running.');
  if (!fastExportSupported()) throw new Error('This browser has no WebCodecs encoder; use Real-time mode.');
  if (w % 2 || h % 2) throw new Error('H.264 needs even frame dimensions.');
  const est = exportSizeEstimate(bitrate, len);
  if (est > MP4_LIMIT) throw new Error(`This export would be about ${fmtBytes(est)}, over the 4 GB MP4 limit. Choose a lower quality.`);
  const vcfg = await pickAvcConfig(w, h, fps, bitrate);
  if (!vcfg) throw new Error(`This browser cannot encode H.264 at ${w}×${h}; use Real-time mode.`);
  if (signal && signal.aborted) throw new Error('cancelled');
  stop();
  const savedPlayhead = playhead, t0 = performance.now(), stats = { decode: 0, seek: 0, audioDropped: [] }, fs = frameSources(stats);
  let cancelled = false, encErr = null, avcC = null; const vSamples = [];
  const scaled = w !== S.w || h !== S.h, oc = scaled ? new OffscreenCanvas(w, h) : null, og = oc && oc.getContext('2d');
  if (og) og.imageSmoothingQuality = 'high';
  const check = () => { if (cancelled || (signal && signal.aborted)) throw new Error('cancelled'); };
  const enc = new VideoEncoder({
    output: (chunk, meta) => {
      const d = meta && meta.decoderConfig && meta.decoderConfig.description;
      if (d && !avcC) avcC = new Uint8Array(d.buffer ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
      const b = new Uint8Array(chunk.byteLength); chunk.copyTo(b); vSamples.push({ data: b, key: chunk.type === 'key', ts: chunk.timestamp });
    }, error: (e) => { encErr = e; },
  });
  enc.configure(vcfg);
  exporting = { end, offline: true, progress() {}, finish() {}, cancel: () => { cancelled = true; } };
  offline = { frames: new Map() };
  try {
    const say = (p, msg) => onProgress && onProgress(p, msg);
    say(0, 'Mixing audio…');
    const mix = await mixAudioOffline(end, check, (k, n) => say(AUDIO_SHARE * 0.5 * k / n, `Mixing audio… clip ${k + 1} / ${n}`), from);
    stats.audioDropped = mix.dropped;
    const audio = mix.buf ? await encodeAac(mix.buf, 192000, check, (p) => say(AUDIO_SHARE * (0.5 + 0.5 * p), `Encoding audio… ${Math.round(p * 100)}%`)) : null;
    check();
    const N = Math.max(1, Math.round(len * fps)), gop = Math.max(1, Math.round(fps * 2));
    let lastUi = performance.now(); const tv = performance.now();
    for (let i = 0; i < N; i++) {
      check();
      if (encErr) throw new Error('video encoder error: ' + (encErr.message || encErr));
      await compositeAt(from + i / fps, fs);
      if (og) og.drawImage(cv, 0, 0, w, h);                    // output size differs from the project: scale the composite
      const vf = new VideoFrame(oc || cv, { timestamp: Math.round(i / fps * 1e6), duration: Math.round(1e6 / fps) });
      enc.encode(vf, { keyFrame: i % gop === 0 }); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => enc.addEventListener('dequeue', r, { once: true }));
      if (performance.now() - lastUi > 150) { lastUi = performance.now(); say(AUDIO_SHARE + (1 - AUDIO_SHARE) * (i + 1) / N, renderStatus(i + 1, N, fps, (lastUi - tv) / 1000)); await fastYield(); }
    }
    await enc.flush();
    if (encErr) throw new Error('video encoder error: ' + (encErr.message || encErr));
    if (!avcC || vSamples.length !== N) throw new Error(`encoder returned ${vSamples.length} of ${N} frames`);
    for (let i = 1; i < vSamples.length; i++) if (vSamples[i].ts <= vSamples[i - 1].ts) throw new Error('encoder produced reordered frames; use Real-time mode');
    onProgress && onProgress(1, 'Writing file…');
    const blob = muxMp4({ w, h, fps, description: avcC, samples: vSamples }, audio);
    stats.frames = N; stats.seconds = (performance.now() - t0) / 1000; stats.speed = len / stats.seconds; stats.codec = vcfg.codec; stats.audio = !!audio;
    Object.assign(stats, { from, to: end, w, h, fps });
    return { blob, ext: 'mp4', stats };
  } finally {
    fs.closeAll();
    try { enc.close(); } catch {}
    offline = null; exporting = null; playhead = savedPlayhead; updatePlayheadUI(); requestRender();
  }
}
// 16-bit PCM WAV (44-byte RIFF header + interleaved samples) from an AudioBuffer
function encodeWav(buf) {
  const ch = buf.numberOfChannels, n = buf.length, SR = buf.sampleRate, bytes = n * ch * 2, ab = new ArrayBuffer(44 + bytes), dv = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + bytes, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, ch, true);
  dv.setUint32(24, SR, true); dv.setUint32(28, SR * ch * 2, true); dv.setUint16(32, ch * 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, bytes, true);
  const pcm = new Int16Array(ab, 44), data = Array.from({ length: ch }, (_, k) => buf.getChannelData(k));
  for (let i = 0, o = 0; i < n; i++) for (let k = 0; k < ch; k++) { const s = Math.max(-1, Math.min(1, data[k][i])); pcm[o++] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
  return new Blob([ab], { type: 'audio/wav' });
}
/* Audio only: the offline mix of [from, to) as 'wav' (16-bit PCM) or 'm4a' (AAC). Resolves with {blob, ext, stats} like exportFast. */
async function exportAudio(fmt, onProgress, signal, opts = {}) {
  const pe = projectEnd(), from = clamp(opts.from || 0, 0, pe), end = clamp(opts.to == null ? pe : opts.to, from, pe);
  if (!pe) throw new Error('The timeline is empty.');
  if (end - from < 0.01) throw new Error('The export range is empty.');
  if (exporting || offline) throw new Error('An export is already running.');
  if (fmt === 'm4a' && !('AudioEncoder' in window)) throw new Error('This browser has no AAC encoder; choose WAV.');
  if (signal && signal.aborted) throw new Error('cancelled');
  stop();
  let cancelled = false; const t0 = performance.now(), say = (p, msg) => onProgress && onProgress(p, msg);
  const check = () => { if (cancelled || (signal && signal.aborted)) throw new Error('cancelled'); };
  exporting = { end, offline: true, progress() {}, finish() {}, cancel: () => { cancelled = true; } };
  try {
    say(0, 'Mixing audio…');
    const mix = await mixAudioOffline(end, check, (k, n) => say(0.5 * k / n, `Mixing audio… clip ${k + 1} / ${n}`), from);
    // nothing audible: still write the right length of silence
    const buf = mix.buf || new AudioBuffer({ numberOfChannels: 2, length: Math.max(1, Math.round((end - from) * 48000)), sampleRate: 48000 });
    check();
    let blob;
    if (fmt === 'wav') { say(0.9, 'Writing WAV…'); blob = encodeWav(buf); }
    else { const a = await encodeAac(buf, 192000, check, (p) => say(0.5 + 0.45 * p, `Encoding audio… ${Math.round(p * 100)}%`)); say(0.97, 'Writing file…'); blob = muxMp4(null, a); }
    const seconds = (performance.now() - t0) / 1000;
    return { blob, ext: fmt, stats: { seconds, speed: (end - from) / seconds, audio: !!mix.buf, audioDropped: mix.dropped, from, to: end } };
  } finally { exporting = null; }
}
window.cutroom.exportFast = exportFast; window.cutroom.exportAudio = exportAudio; window.cutroom.encodeWav = encodeWav; window.cutroom.renderStills = renderStills; window.cutroom.muxMp4 = muxMp4;
Object.assign(window.cutroom, { exportToBlob, exportRanges, markerRange, exportDims, exportBitrate, audioSizeEstimate, exportMarkerFrames, EXPORT_SIZES, EXPORT_FPS }); window.cutroom.mp4Open = mp4Open; window.cutroom.Mp4Source = Mp4Source; window.cutroom.fastExportSupported = fastExportSupported; window.cutroom.mixAudioOffline = mixAudioOffline; window.cutroom.wsolaStretch = wsolaStretch;
