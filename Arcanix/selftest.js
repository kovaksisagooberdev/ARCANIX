// Runs inside the editor page (see CUTROOM_SELFTEST in main.js). Builds a small project and exports it,
// so a build can be checked without clicking through the app. The last expression is the result.
(async () => {
  const out = { url: location.protocol, secure: window.isSecureContext };
  const lim = (p, ms, tag) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: ' + tag)), ms))]);
  try {
    await new Promise(r => setTimeout(r, 800));                 // let boot finish
    out.booted = typeof cutroom === 'object' && !!document.querySelector('#rail button');
    out.webcodecs = cutroom.fastExportSupported();
    out.h264 = (await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: 1920, height: 1080, bitrate: 6e6, framerate: 30, avc: { format: 'avc' } })).supported;
    out.aac = (await AudioEncoder.isConfigSupported({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 })).supported;
    out.recorder = cutroom.supportedMimes().map(m => m[2]);
    out.idb = await new Promise(res => { const r = indexedDB.open('cutroom-selftest'); r.onsuccess = () => { r.result.close(); res(true); }; r.onerror = () => res(false); });

    // media: a 3 s tone (WAV) and an orange picture (PNG)
    const sr = 22050, n = sr * 3, buf = new ArrayBuffer(44 + n * 2), dv = new DataView(buf), ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) dv.setInt16(44 + i * 2, Math.sin(i / sr * 2 * Math.PI * 330) * 12000, true);
    const c0 = document.createElement('canvas'); c0.width = 640; c0.height = 360; const g = c0.getContext('2d'); g.fillStyle = '#c86432'; g.fillRect(0, 0, 640, 360);
    const png = await new Promise(r => c0.toBlob(b => r(new File([b], 'orange.png', { type: 'image/png' }))));
    const added = await lim(cutroom.importFiles([png, new File([buf], 'tone.wav', { type: 'audio/wav' })]), 15000, 'import');
    out.imported = added.map(m => m.kind);
    const img = cutroom.addMediaClip(added[0], null, 0); img.dur = 3; img.props.fxVignette = 80;
    cutroom.addMediaClip(added[1], null, 0);
    cutroom.setPlayhead(0); cutroom.addGenerated('text', { text: 'Self test', size: 120 });
    cutroom.state.clips[cutroom.state.clips.length - 1].dur = 3; cutroom.commit();

    const r = await lim(cutroom.exportFast(6e6, () => {}), 60000, 'fast export');
    out.fast = { bytes: r.blob.size, frames: r.stats.frames, speed: +r.stats.speed.toFixed(1), codec: r.stats.codec, audio: r.stats.audio };
    // read the export back with the app's own MP4 reader and check a pixel
    const info = await cutroom.mp4Open(r.blob), s = new cutroom.Mp4Source(info), cc = document.createElement('canvas'); cc.width = 1920; cc.height = 1080;
    const g2 = cc.getContext('2d', { willReadFrequently: true }), f = await lim(s.frameAt(1.5), 15000, 'decode');
    g2.drawImage(f.img, 0, 0); out.fast.edgePixel = [...g2.getImageData(200, 540, 1, 1).data].slice(0, 3); out.fast.cornerPixel = [...g2.getImageData(20, 20, 1, 1).data].slice(0, 3); s.close();
    // and with the platform player
    const v = document.createElement('video'); v.muted = true; v.src = URL.createObjectURL(r.blob);
    out.fast.playerDuration = await lim(new Promise((ok, no) => { v.onloadedmetadata = () => ok(+v.duration.toFixed(2)); v.onerror = () => no(new Error('player cannot open the export')); }), 15000, 'player');
    // project file round trip
    const before = JSON.stringify(cutroom.state), pf = cutroom.projectToBlob();
    await lim(cutroom.loadProjectBlob(new File([pf], 't.cutroom')), 15000, 'project file');
    out.projectFile = { bytes: pf.size, roundTrip: JSON.stringify(cutroom.state) === before };
    // motion blur: a small box sweeping 1200 px in 1 s must come out wider (streaked) than the same box without blur
    cutroom.state.clips.length = 0; cutroom.setPlayhead(0); cutroom.addGenerated('solid', { color: '#00ff00', scale: 10 });
    const box = cutroom.state.clips[0]; box.dur = 1; box.kf = { x: [{ t: 0, v: -600 }, { t: 1, v: 600 }] }; cutroom.commit();
    const widthAt = async (blob, t) => {
      const i2 = await cutroom.mp4Open(blob), s2 = new cutroom.Mp4Source(i2), f2 = await lim(s2.frameAt(t), 15000, 'decode blur'); g2.clearRect(0, 0, 1920, 1080); g2.drawImage(f2.img, 0, 0); s2.close();
      const row = g2.getImageData(0, 540, 1920, 1).data; let a = -1, b = -1; for (let x = 0; x < 1920; x++) if (row[x * 4 + 1] > 24) { if (a < 0) a = x; b = x; } return a < 0 ? 0 : b - a + 1;
    };
    const sharp = await lim(cutroom.exportFast(6e6, () => {}), 60000, 'export sharp');
    box.props.mbOn = true; box.props.mbShutter = 180; box.props.mbSamples = 16; cutroom.commit();
    const blurred = await lim(cutroom.exportFast(6e6, () => {}), 60000, 'export blurred');
    out.motionBlur = { sharpWidth: await widthAt(sharp.blob, 0.5), blurredWidth: await widthAt(blurred.blob, 0.5), expectedExtra: 20 };   // 1200 px/s × (180/360)/30 s = 20 px
    out.title = document.title;

    // editing correctness: freeze frame, detach audio, locked tracks, close gaps, duplicate, split, track names, undo steps, probe
    {                                                           // own block: v / f / a are already taken above
    const C = cutroom, S = C.state, E = out.editing = { checks: {} }, ck = E.checks;
    const tid = (name) => S.tracks.find(t => t.name === name).id, onTrack = (id) => S.clips.filter(k => k.track === id).sort((a, b) => a.start - b.start);
    const noOverlap = () => S.tracks.every(t => onTrack(t.id).every((k, i, a) => i === 0 || k.start >= a[i - 1].start + a[i - 1].dur - 1e-6));
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const [vidM] = await lim(C.importFiles([new File([r.blob], 'clip.mp4', { type: 'video/mp4' })]), 20000, 'import mp4');
    E.videoKind = vidM && vidM.kind;
    const imgM = added[0], wavM = added[1];
    const vclip = (start = 0, dur = 3, tr = 'V1') => { const v = C.addMediaClip(vidM, tid(tr), start); v.start = start; v.dur = dur; C.commit(); return v; };
    // freeze one frame from the start / end: the still goes before / after the clip, never on top of it
    reset(); let v = vclip(), f = C.insertFreeze(v, 1 / 30, imgM, 2);
    ck.freezeStart = f.start === 0 && Math.abs(v.start - 2) < 1e-6 && noOverlap();
    reset(); v = vclip(); f = C.insertFreeze(v, 3 - 1 / 30, imgM, 2);
    ck.freezeEnd = Math.abs(f.start - 3) < 1e-6 && v.start === 0 && Math.abs(v.dur - 3) < 1e-6 && noOverlap();
    // freeze in the middle: detached audio is split and rippled with its track, other clips there move along without overlapping
    reset(); v = vclip(); let a = C.detachAudio(v); const y = C.addMediaClip(wavM, a.track, 3); C.commit();
    f = C.insertFreeze(v, 1.5, imgM, 2);
    const vs = onTrack(v.track).filter(k => k.type === 'video'), as = onTrack(a.track).filter(k => k.mediaId === vidM.id);
    ck.freezeAudioRipple = as.length === 2 && Math.abs(as[1].start - 3.5) < 1e-6 && Math.abs(vs[1].start - 3.5) < 1e-6 && Math.abs(as[1].in - vs[1].in) < 1e-6 && Math.abs(y.start - 5) < 1e-6 && noOverlap();
    reset(); v = vclip(); a = C.detachAudio(v); S.tracks.find(t => t.id === a.track).locked = true; C.commit();
    C.insertFreeze(v, 1.5, imgM, 2);
    ck.freezeLockedAudio = a.start === 0 && Math.abs(a.dur - 3) < 1e-6 && onTrack(a.track).length === 1;
    // detach audio carries level, fades, ducking and volume keyframes; a second detach does nothing; Reset all keeps the video silent
    reset(); v = vclip(); Object.assign(v.props, { volume: 60, fadeIn: 0.5, duck: true, isVoice: true }); v.kf = { volume: [{ t: 0, v: 20 }, { t: 1, v: 80 }] }; C.commit();
    a = C.detachAudio(v);
    ck.detachCarries = a.props.volume === 60 && a.props.fadeIn === 0.5 && a.props.duck && a.props.isVoice && a.kf && a.kf.volume.length === 2 && !(v.kf && v.kf.volume) && v.props.volume === 0 && v.props.audioDetached === true;
    C.detachAudio(v); ck.detachOnce = S.clips.filter(k => k.type === 'audio').length === 1;
    C.select(v.id); const btn = (txt) => [...document.querySelectorAll('#insp button')].find(b => b.textContent === txt);
    ck.detachDisabled = !!btn('Detach audio') && btn('Detach audio').disabled;
    btn('Reset all').click(); ck.resetKeepsSilent = v.props.volume === 0 && v.props.audioDetached === true;
    reset(); v = vclip(); v.props.volume = 0; C.commit(); a = C.detachAudio(v); ck.detachZero = a.props.volume === 0;
    // locked tracks: S, Ctrl+D, right-click and the Inspector leave a locked clip alone
    reset(); v = vclip(); C.select(v.id); S.tracks.find(t => t.id === v.track).locked = true; C.commit(); C.setPlayhead(1);
    ck.lockedInspector = !!document.querySelector('#insp .lockNote') && !document.querySelector('#insp input');
    C.splitAtPlayhead(); C.duplicateSel(); ck.lockedNoEdit = S.clips.length === 1 && Math.abs(v.dur - 3) < 1e-6;
    C.select(null); const ce = document.querySelector(`.clip[data-id="${v.id}"]`), rc = ce.getBoundingClientRect();
    ce.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rc.left + 5, clientY: rc.top + 5 }));
    ck.lockedCtxNoSelect = C.selIds.length === 0; document.querySelectorAll('.ctx').forEach(m => m.remove());
    // close gaps keeps touching clips touching (non-frame-aligned lengths)
    reset(); const ga = C.addMediaClip(imgM, tid('V1'), 0), gb = C.addMediaClip(imgM, tid('V1'), 20);
    ga.start = 2; ga.dur = 3.3456; gb.start = 5.3456; gb.dur = 1; S.markers.push(5.3456); C.commit(); C.closeGaps();
    ck.closeGaps = ga.start === 0 && Math.abs(gb.start - (ga.start + ga.dur)) < 1e-9 && Math.abs(S.markers[0] - 3.3456) < 1e-9 && noOverlap();
    // duplicate goes forward, never before the original; with a group selected, the whole group is copied
    reset(); const dc = C.addMediaClip(imgM, tid('V1'), 10), dn = C.addMediaClip(imgM, tid('V1'), 12); dc.start = 10; dc.dur = 2; dn.start = 12; dn.dur = 8; C.commit();
    C.select(dc.id); C.duplicateSel(); let nw = S.clips.filter(k => k !== dc && k !== dn);
    ck.dupForward = nw.length === 1 && nw[0].start >= 20 - 1e-6;
    C.selectMany([dc.id, dn.id]); C.duplicateSel(); ck.dupGroup = S.clips.length === 5 && C.selIds.length === 2 && C.selIds.every(id => S.clips.find(k => k.id === id).start >= 20 - 1e-6) && noOverlap();
    // split at playhead with several clips selected splits exactly those
    reset(); const s1 = C.addMediaClip(imgM, tid('V1'), 0), s2 = C.addMediaClip(imgM, tid('V2'), 0), s3 = C.addMediaClip(imgM, tid('V3'), 0);
    for (const k of [s1, s2, s3]) { k.start = 0; k.dur = 3; } C.commit(); C.selectMany([s1.id, s2.id]); C.setPlayhead(1); C.splitAtPlayhead();
    ck.splitSelection = S.clips.length === 5 && Math.abs(s3.dur - 3) < 1e-6 && Math.abs(s1.dur - 1) < 1e-6;
    // new tracks take the first unused name
    reset(); const keepTracks = S.tracks.slice(); S.tracks.splice(S.tracks.findIndex(t => t.name === 'V2'), 1);
    const nt = C.addTrack('video', true); ck.trackName = nt.name === 'V2' && new Set(S.tracks.map(t => t.name)).size === S.tracks.length;
    S.tracks.length = 0; S.tracks.push(...keepTracks); C.commit();
    // adding a voice / music clip with its settings is one undo step
    reset(); const vo = C.addMediaClip(wavM, tid('A1'), 0, { isVoice: true, duck: true, volume: 70 });
    ck.extraProps = vo.props.isVoice && vo.props.volume === 70; C.undo(); ck.singleUndo = S.clips.length === 0;
    // a file that cannot be decoded is rejected and its object URL released
    let revoked = 0; const rv = URL.revokeObjectURL; URL.revokeObjectURL = (u) => { revoked++; rv.call(URL, u); };
    try { const bad = await lim(C.importFiles([new File([new Uint8Array(4000).fill(7)], 'broken.mp4', { type: 'video/mp4' })]), 20000, 'bad import'); ck.probeFails = bad.length === 0 && revoked >= 1; }
    finally { URL.revokeObjectURL = rv; }
    reset();
    E.ok = Object.values(ck).every(Boolean);
    }

    // inspector correctness: shortcuts after a slider, pending typed edits, clamped number fields, Fit on keyframes, clear keyframes, a11y, timeline height
    {
    const C = cutroom, S = C.state, I = out.inspector = { checks: {} }, ck = I.checks, q = (sel) => document.querySelector('#insp ' + sel);
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const key = (el, k, o = {}) => el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }));
    // a focused slider passes Ctrl+Z on to the editor but keeps its own arrow keys
    reset(); C.setPlayhead(0); C.addGenerated('solid', { color: '#3366ff' }); const sc = S.clips[0]; C.select(sc.id);
    const op0 = sc.props.opacity; sc.props.opacity = 40; C.commit(); C.renderInspector(true);
    const rg = q('input[type=range][aria-label="Opacity %"]'); rg.focus();
    const nUndo = C.hist.undo.length; key(rg, 'z', { ctrlKey: true });
    ck.undoFromSlider = C.hist.undo.length === nUndo - 1 && S.clips[0].props.opacity === op0 && document.activeElement !== rg;
    ck.sliderKeepsArrows = C.isTypingKey({ target: { tagName: 'INPUT', type: 'range' }, key: 'ArrowLeft' }) && !C.isTypingKey({ target: { tagName: 'INPUT', type: 'range' }, key: ' ' })
      && !C.isTypingKey({ target: { tagName: 'INPUT', type: 'checkbox' }, key: 'Delete' }) && C.isTypingKey({ target: { tagName: 'INPUT', type: 'number' }, key: 'Delete' });
    // a typed edit survives clicking another clip before blurring: it becomes its own undo step
    reset(); C.setPlayhead(0); C.addGenerated('text', { text: 'One' }); const tx = S.clips[S.clips.length - 1];
    C.addGenerated('solid', { color: '#ff0000' }); const other = S.clips[S.clips.length - 1]; C.select(tx.id);
    const ta = q('textarea'); ta.focus(); ta.value = 'Two'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    C.select(other.id); const afterSel = C.hist.undo.length;
    C.undo(); const undone = S.clips.find(k => k.id === tx.id).props.text; C.redo();
    ck.pendingEditKept = undone === 'One' && S.clips.find(k => k.id === tx.id).props.text === 'Two' && afterSel > 0;
    // an out-of-range number shows the clamped value once committed
    reset(); C.setPlayhead(0); C.addGenerated('solid', { color: '#00ff00' }); const nc = S.clips[0]; C.select(nc.id);
    const nf = q('input[aria-label="Opacity % value"]');   // a text field since b09 (accepts +=20 etc.) nf.focus(); nf.value = '150';
    nf.dispatchEvent(new Event('input', { bubbles: true })); nf.dispatchEvent(new Event('change', { bubbles: true }));
    ck.numberClamped = nf.value === '100' && nc.props.opacity === 100; nf.blur();
    // the select loses focus after a change so Space / arrows reach the editor again
    const sl = q('select'); if (sl) { sl.focus(); sl.dispatchEvent(new Event('change', { bubbles: true })); ck.selectBlurs = document.activeElement !== sl; }
    // Fit / Fill write keys on keyframed clips; clearing keyframes keeps the value under the playhead
    reset(); const fc = C.addMediaClip(added[0], null, 0); fc.start = 0; fc.dur = 2;
    fc.kf = { scale: [{ t: 0, v: 100 }, { t: 1, v: 150 }], x: [{ t: 0, v: 0 }, { t: 1, v: 400 }] }; C.commit(); C.setPlayhead(0.5); C.select(fc.id);
    C.fitFill(fc, 'fill'); ck.fitKeyframed = C.val(fc, 'scale', 0.5) === 100 && C.val(fc, 'x', 0.5) === 0 && fc.props.y === 0 && fc.props.fitMode === 'fill';
    reset(); const kc = C.addMediaClip(added[0], null, 0); kc.start = 0; kc.dur = 2; kc.props.x = 0;
    kc.kf = { x: [{ t: 0, v: 0 }, { t: 1, v: 1000 }] }; C.commit(); C.setPlayhead(0.5);
    C.clearKeyframes(kc); C.commit(); ck.clearBakes = !kc.kf && Math.abs(kc.props.x - 500) < 1e-6 && C.val(kc, 'x', 1.5) === kc.props.x;
    // accessibility: section toggles are buttons with aria-expanded; sliders and keyframe buttons are named
    C.select(kc.id); C.renderInspector(true);
    const hb = q('.sec h4 > button'), sec = hb.closest('.sec'), exp0 = hb.getAttribute('aria-expanded'); hb.click();
    const exp1 = hb.getAttribute('aria-expanded'), folded = sec.classList.contains('collapsed'); hb.click();
    const kb = q('.kfb');
    ck.a11y = exp0 === 'true' && exp1 === 'false' && folded && hb.getAttribute('aria-expanded') === 'true'
      && [...document.querySelectorAll('#insp input[type=range], #insp input.num')].every(i => i.getAttribute('aria-label'))
      && !!kb && /^Keyframe /.test(kb.getAttribute('aria-label')) && kb.hasAttribute('aria-pressed')
      && [...document.querySelectorAll('#insp .prow.wide label')].every(l => l.htmlFor && document.getElementById(l.htmlFor));
    // a saved timeline height too tall for the window is clamped when applied; the stored preference is untouched
    const stored = localStorage.getItem('cutroom.layout'); C.clampTl(100000);
    const applied = parseFloat(document.body.style.getPropertyValue('--tlH'));
    ck.tlClamped = applied <= Math.max(150, innerHeight - 220) && localStorage.getItem('cutroom.layout') === stored; C.clampTl();
    reset();
    I.ok = Object.values(ck).every(Boolean);
    }
    // monitor + compositor: hit-testing by the rendered pose, overlay on top, rotate handle, wipe in/out, motion-blur tones
    {
    const C = cutroom, S = C.state, M = out.monitor = { checks: {} }, ck = M.checks, cvs = document.querySelector('#cv');
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const vids = S.tracks.filter(t => t.kind === 'video'), top = vids[0], low = vids[1];
    const imgClip = (tr, props) => { const k = C.addMediaClip(added[0], tr.id, 0); k.start = 0; k.dur = 2; Object.assign(k.props, props); C.commit(); return k; };
    const px = (x, y) => [...cvs.getContext('2d').getImageData(x, y, 1, 1).data];
    // the 640×360 picture fills 1920×1080 at 100 %, so at 50 % its box is ±480 × ±270
    C.setPlayhead(0.5); reset(); let k = imgClip(low, { scale: 50, rot: 90 }); C.drawFrame();
    ck.hitRotated = C.hitClipAt(0, -400) === k && C.hitClipAt(-400, 0) === null;
    k.props.rot = 0; k.props.cropL = 80; C.drawFrame();
    ck.hitCropped = C.hitClipAt(0, 0) === null && C.hitClipAt(400, 0) === k;
    k.props.cropL = 0; k.props.fadeIn = 1; k.props.transIn = 'slide'; C.drawFrame();   // paused mid-slide: drawn 960 px to the left
    ck.hitSlide = C.hitClipAt(-700, 0) === k && C.hitClipAt(0, 0) === null;
    // handles follow the drawn pose: with the spin preset 1 s in, the clip is turned 90°
    k.props.fadeIn = 0; k.props.anim = 'spin'; C.commit(); C.setPlayhead(1); C.select(k.id); C.drawFrame();
    const hc = C.handleHit(-270, 480, 1); ck.handleSpin = !!hc && !hc.rotate && C.handleHit(480, 270, 1) === null;
    // the selection outline of a lower-track clip is drawn above a full-frame clip on a higher track
    reset(); C.setPlayhead(0.5); k = imgClip(low, { scale: 50 }); C.addGenerated('solid', { color: '#ff0000' });
    const sol = S.clips.find(c => c.type === 'solid'); sol.track = top.id; sol.start = 0; sol.dur = 2; C.commit(); C.select(k.id); C.drawFrame();
    // the outline is drawn in the theme's accent colour; it must show over the red solid
    const op = px(480, 540), ac = parseInt(String(ACCENT).replace('#', ''), 16), acc = [ac >> 16, (ac >> 8) & 255, ac & 255];
    ck.overlayOnTop = Math.abs(op[0] - acc[0]) + Math.abs(op[1] - acc[1]) + Math.abs(op[2] - acc[2]) < 90;
    // rotate handle: drag a quarter turn, then Shift-snap to 15°; one undo step per drag; status shows the angle
    reset(); C.setPlayhead(0.5); k = imgClip(low, { scale: 50 }); C.select(k.id); C.drawFrame();
    const rc = cvs.getBoundingClientRect(), kk = cvs.width / rc.width, cl = (x, y) => ({ clientX: rc.left + (x + 960) / kk, clientY: rc.top + (y + 540) / kk });
    const rh = C.handleHit(0, -330, kk); ck.rotHandleHit = !!rh && rh.rotate;
    let status = '';
    const drag = (to, shift) => {
      cvs.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, ...cl(0, -330) }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, buttons: 1, shiftKey: shift, ...cl(...to) }));
      status = document.querySelector('#stHint').textContent;
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, shiftKey: shift, ...cl(...to) }));
    };
    const u0 = C.hist.undo.length; drag([195, 0], false);
    ck.rotateDrag = k.props.rot === 90 && C.hist.undo.length === u0 + 1 && /90°/.test(status);
    C.undo(); k = S.clips.find(c => c.id === k.id); ck.rotateUndo = k.props.rot === 0; C.drawFrame();   // undo restores fresh clip objects
    const a = 140 * Math.PI / 180; drag([Math.sin(a) * 200, -Math.cos(a) * 200], true);   // 140° from the top, snaps to 135°
    ck.rotateSnap = k.props.rot === 135;
    k.props.rot = 0; k.kf = { rot: [{ t: 0, v: 0 }, { t: 2, v: 0 }] }; C.commit(); C.drawFrame(); drag([195, 0], false);
    ck.rotateKeyframed = Math.abs(C.val(k, 'rot', 0.5) - 90) < 1e-6 && k.props.rot === 0 && k.kf.rot.length === 3;
    S.tracks.find(t => t.id === k.track).locked = true; C.commit(); C.drawFrame(); ck.lockedNoHandles = C.handleHit(0, -330, kk) === null;
    // wipe in and wipe out overlapping on a 1 s clip: the visible strip is their intersection
    reset(); k = imgClip(low, {}); k.dur = 1; Object.assign(k.props, { fadeIn: 0.8, fadeOut: 0.8, transIn: 'wipe', transOut: 'wipe' });
    const w = C.clipPose(k, 0.5, 1920, 1080).wipe;             // fractions [x0, y0, x1, y1] of the clip's box: 720 … 1200 px of 1920
    ck.wipeIntersect = !!w && Math.abs(w[0] - 0.375) < 1e-6 && Math.abs(w[2] - 0.625) < 1e-6 && w[1] === 0 && w[3] === 1;
    // motion blur keeps dark tones: a slowly moving full-frame (20,20,20) solid stays (20,20,20) at 32 samples
    reset(); C.setPlayhead(0); C.addGenerated('solid', { color: '#141414' }); const ms = S.clips[0]; ms.start = 0; ms.dur = 1;
    ms.kf = { x: [{ t: 0, v: -100 }, { t: 1, v: 100 }] }; Object.assign(ms.props, { mbOn: true, mbShutter: 360, mbSamples: 32 }); C.commit(); C.setPlayhead(0.5); C.drawFrame();
    M.f16 = C.fxF16; M.blurTone = px(960, 540)[0]; ck.blurTone = Math.abs(M.blurTone - 20) <= 2;
    reset(); C.setPlayhead(0);
    M.ok = Object.values(ck).every(Boolean);
    }
    // project / export safety: failed opens leave the project intact, undo brings removed media back, dropped audio is reported,
    // the 4 GB limit is checked up front, cancelling stops the audio phase and the dialog waits for the export to return
    {
    const C = cutroom, S = C.state, P = out.projectSafety = { checks: {} }, ck = P.checks;
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const dbIds = () => new Promise(res => { const o = indexedDB.open('cutroom'); o.onsuccess = () => { const q = o.result.transaction('media').objectStore('media').getAllKeys(); q.onsuccess = () => { o.result.close(); res(q.result.map(String)); }; q.onerror = () => { o.result.close(); res([]); }; }; o.onerror = () => res([]); });
    const urlOk = (u) => fetch(u).then(r => r.ok, () => false);
    const tid = (name) => S.tracks.find(t => t.name === name).id;
    const c1 = document.createElement('canvas'); c1.width = 64; c1.height = 36; c1.getContext('2d').fillRect(0, 0, 64, 36);
    const png2 = await new Promise(r => c1.toBlob(b => r(new File([b], 'tomb.png', { type: 'image/png' }))));
    // removing media from the bin and undoing brings the media and its clips back (memory + IndexedDB); purged once no step needs it
    reset(); const [tm] = await lim(C.importFiles([png2]), 15000, 'import tomb'); const tc0 = C.addMediaClip(tm, tid('V1'), 0);
    const conf = window.confirm; window.confirm = () => true;
    try { C.removeMedia(tm.id); } finally { window.confirm = conf; }
    ck.removeTombstones = !C.media.has(tm.id) && C.tombs.has(tm.id) && !S.clips.some(k => k.mediaId === tm.id);
    C.undo(); await sleep(300);
    ck.undoRevives = C.media.get(tm.id) === tm && !C.tombs.has(tm.id) && S.clips.some(k => k.id === tc0.id) && (await dbIds()).includes(tm.id) && await urlOk(tm.url);
    C.redo(); ck.redoRemoves = !C.media.has(tm.id) && C.tombs.has(tm.id);
    C.hist.undo.length = 0; C.hist.redo.length = 0; S.markers.push(1); C.commit();       // no step references it any more
    ck.tombPurged = !C.tombs.has(tm.id) && !(await urlOk(tm.url));
    // a truncated or unreadable project file throws and leaves state, media, element URLs and the media store unchanged
    reset(); const ic = C.addMediaClip(added[0], tid('V1'), 0); ic.props.x = 123; C.commit();
    const pf = C.projectToBlob(), st0 = JSON.stringify(S), ids0 = [...C.media.keys()].join(), urls0 = [...C.media.values()].map(m => m.url), db0 = (await dbIds()).sort().join();
    const intact = async () => JSON.stringify(S) === st0 && [...C.media.keys()].join() === ids0 && [...C.media.values()].every((m, i) => m.url === urls0[i])
      && (await Promise.all(urls0.map(urlOk))).every(Boolean) && (await dbIds()).sort().join() === db0;
    let err1 = ''; try { await C.loadProjectBlob(new File([pf.slice(0, pf.size - 50)], 'cut.framewright')); } catch (e) { err1 = e.message; }
    ck.truncatedOpen = /damaged/.test(err1) && await intact();
    const hlen = new DataView(await pf.slice(8, 12).arrayBuffer()).getUint32(0, true);
    const flaky = { size: pf.size, slice: (a, b, t) => a < 12 + hlen ? pf.slice(a, b, t) : { type: t || '', arrayBuffer: () => Promise.reject(new DOMException('removed', 'NotReadableError')) } };
    let err2 = ''; try { await C.loadProjectBlob(flaky); } catch (e) { err2 = e.message; }
    ck.unreadableOpen = /could not read/.test(err2) && await intact(); P.openErrors = [err1, err2];
    // offline mix: an unreadable or undecodable file is reported, a video without an audio track is not
    reset(); const wavM = added[1], fake = (id, name, kind, blob) => C.media.set(id, { id, name, kind, blob, url: wavM.url, dur: 3, w: 0, h: 0, thumb: '', img: null, peaks: null });
    fake('pfRead', 'bad-read.wav', 'audio', { arrayBuffer: () => Promise.reject(new DOMException('removed', 'NotReadableError')) });
    fake('pfDecode', 'bad-decode.wav', 'audio', new Blob([new Uint8Array(3000).fill(9)]));
    fake('pfSilent', 'silent.mp4', 'video', added[0].blob);                                      // decodes as EncodingError: no audio track
    const ac0 = C.addMediaClip(wavM, tid('A1'), 0), acs = ['pfRead', 'pfDecode', 'pfSilent'].map((id, i) => { const k = JSON.parse(JSON.stringify(ac0)); k.id = 'pf' + i; k.mediaId = id; k.start = 3 + i * 3; S.clips.push(k); return k; });
    const mix = await lim(C.mixAudioOffline(12), 20000, 'mix');
    ck.audioDropped = !!mix.buf && mix.dropped.slice().sort().join() === 'bad-decode.wav,bad-read.wav'; P.dropped = mix.dropped;
    let err3 = ''; try { await C.mixAudioOffline(12, () => { throw new Error('cancelled'); }); } catch (e) { err3 = e.message; }
    ck.mixCancels = err3 === 'cancelled';
    S.clips = S.clips.filter(k => !acs.includes(k)); ['pfRead', 'pfDecode', 'pfSilent'].forEach(id => C.media.delete(id)); reset();
    // 4 GB: estimated before rendering, refused at once
    ck.estimate = Math.abs(C.exportSizeEstimate(25e6, 1500) - 25192000 * 1500 / 8) < 1;
    C.setPlayhead(0); C.addGenerated('solid', { color: '#202020' }); S.clips[0].dur = 1500; C.commit();
    const tBig = performance.now(); let err4 = ''; try { await C.exportFast(25e6, () => {}); } catch (e) { err4 = e.message; }
    ck.refuseBig = /4 GB/.test(err4) && performance.now() - tBig < 2000;
    // cancel during the audio phase: rejects 'cancelled' before any frame is rendered, and the next export can start
    reset(); C.addMediaClip(wavM, tid('A1'), 0); C.setPlayhead(0); C.addGenerated('solid', { color: '#334455' }); S.clips[S.clips.length - 1].dur = 1; C.commit();
    const ctl = new AbortController(), seen = []; let err5 = '';
    try { await lim(C.exportFast(4e6, (p, m) => { seen.push([p, m]); if (/Mixing audio/.test(m)) ctl.abort(); }, ctl.signal), 30000, 'cancel export'); } catch (e) { err5 = e.message; }
    ck.cancelAudioPhase = err5 === 'cancelled' && seen.length > 0 && seen.every(([p, m]) => p <= 0.1 && !/^Frame/.test(m));
    const seen2 = []; const r2 = await lim(C.exportFast(4e6, (p, m) => seen2.push([p, m])), 60000, 'export after cancel');
    ck.exportAfterCancel = r2.stats.frames === 90 && r2.stats.audio && seen2.some(([p, m]) => /audio/.test(m) && p <= 0.1) && Array.isArray(r2.stats.audioDropped) && !r2.stats.audioDropped.length;
    ck.renderStatus = C.renderStatus(30, 90, 30, 0.5) === 'Frame 30/90 · 2.0× real time · about 0:01 left';
    // export dialog: Output row shows the size; Cancel during a render shows 'Cancelling…' and the dialog closes once the export returned
    C.exportDialog(); const exSize = document.querySelector('#exSize').textContent; P.sizeText = exSize;
    const md = document.querySelector('#exMode'); if (md.querySelector('option[value=fast]')) md.value = 'fast'; md.dispatchEvent(new Event('change'));
    document.querySelector('#exGo').click(); document.querySelector('#exCancel').click();
    const stillOpen = !document.querySelector('#modal').hidden, msg = document.querySelector('#exMsg').textContent;
    for (let i = 0; i < 100 && !document.querySelector('#modal').hidden; i++) await sleep(100);
    ck.dialogCancel = /^about \d/.test(exSize) && stillOpen && msg === 'Cancelling…' && document.querySelector('#modal').hidden;
    let err6 = 'ok'; try { await lim(C.exportFast(4e6, () => {}), 60000, 'export after dialog cancel'); } catch (e) { err6 = e.message; }
    ck.dialogReleases = err6 === 'ok';
    // media that could not be autosaved: persistent #saveState warning that survives the next save; a successful open clears it
    C.mediaSaveFailed(2); S.markers.push(2); C.commit(); await sleep(700);
    const ss = document.querySelector('#saveState'); ck.quotaWarn = ss.classList.contains('warn') && /2 media/.test(ss.textContent) && C.mediaUnsaved === 2;
    reset(); const pf2 = C.projectToBlob(); await lim(C.loadProjectBlob(new File([pf2], 'ok.framewright')), 15000, 'reopen');
    ck.quotaCleared = C.mediaUnsaved === 0 && !ss.classList.contains('warn');
    reset();
    P.ok = Object.values(ck).every(Boolean);
    }
    // playback + audio: keep-pitch export, drift nudging, gain ramps, voiceover latency + stop keys, queued / stored waveform peaks
    {
    const C = cutroom, S = C.state, A = out.playbackAudio = { checks: {} }, ck = A.checks;
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => { t.locked = false; t.muted = false; }); C.select(null); C.commit(); };
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const tid = (name) => S.tracks.find(t => t.name === name).id, wavM = added[1];
    const wavFile = (name, rate, secs, chans, fn) => {             // 16-bit PCM; fn(channel, t) -> -1..1
      const len = rate * secs, bb = new ArrayBuffer(44 + len * chans * 2), d = new DataView(bb), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); d.setUint32(4, 36 + len * chans * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, chans, true);
      d.setUint32(24, rate, true); d.setUint32(28, rate * chans * 2, true); d.setUint16(32, chans * 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, len * chans * 2, true);
      for (let i = 0; i < len; i++) for (let ch = 0; ch < chans; ch++) d.setInt16(44 + (i * chans + ch) * 2, Math.round(fn(ch, i / rate) * 32000), true);
      return new File([bb], name, { type: 'audio/wav' });
    };
    // keep pitch: the 330 Hz tone at 2× still measures ~330 Hz in the Fast-export mix and lasts 1.5 s; without it, ~660 Hz
    const freqOf = (d, sr, a, b) => { let n = 0; for (let i = Math.floor(a * sr) + 1; i < b * sr; i++) if (d[i - 1] < 0 && d[i] >= 0) n++; return n / (b - a); };
    const rms = (d, sr, a, b) => { let s = 0, n = 0; for (let i = Math.floor(a * sr); i < b * sr; i++, n++) s += d[i] * d[i]; return Math.sqrt(s / Math.max(1, n)); };
    reset(); const pc = C.addMediaClip(wavM, tid('A1'), 0); pc.speed = 2; pc.dur = 1.5; C.commit();
    ck.keepPitchDefault = pc.props.keepPitch === true;
    let mx = (await lim(C.mixAudioOffline(2), 20000, 'mix keep pitch')).buf, d0 = mx.getChannelData(0), SR = mx.sampleRate;
    A.keptHz = Math.round(freqOf(d0, SR, 0.1, 1.4)); A.tailRms = +rms(d0, SR, 1.55, 1.95).toFixed(4);
    ck.keepPitchExport = Math.abs(A.keptHz - 330) < 330 * 0.08 && rms(d0, SR, 1.3, 1.45) > 0.05 && A.tailRms < 0.005;
    pc.props.keepPitch = false; C.commit();
    mx = (await lim(C.mixAudioOffline(2), 20000, 'mix shifted')).buf; A.shiftedHz = Math.round(freqOf(mx.getChannelData(0), SR, 0.1, 1.4));
    ck.pitchOffShifts = Math.abs(A.shiftedHz - 660) < 660 * 0.08;
    // preview follows the prop, and the Inspector shows the checkbox for a speed-changed clip (also in Simple mode)
    C.setPlayhead(0.5); C.syncMedia(); ck.previewPitch = C.els.get(pc.id) && C.els.get(pc.id).el.preservesPitch === false;
    C.select(pc.id); C.renderInspector(true);
    const kpl = [...document.querySelectorAll('#insp label')].find(l => l.textContent === 'Keep pitch'), kpi = kpl && document.getElementById(kpl.htmlFor);
    ck.keepPitchControl = !!kpi && kpi.type === 'checkbox' && kpi.checked === false;
    // drift: 40–300 ms is pulled in with at most ±5 % rate, under 20 ms resets, beyond 300 ms seeks
    ck.driftNudge = C.driftNudge(0.1, 1, 0) === -0.05 && C.driftNudge(-0.06, 1, 0) === 0.03 && C.driftNudge(0.5, 1, 0) === null
      && C.driftNudge(0.01, 1, -0.03) === 0 && C.driftNudge(0.03, 1, -0.03) === -0.03 && C.driftNudge(0.5, 2, 0) === -0.05;
    // gain changes glide with setTargetAtTime; an unchanged gain schedules nothing
    const calls = [], fakeE = { gain: { gain: { setValueAtTime: (v, t) => calls.push(['set', v, t]), setTargetAtTime: (v, t, k) => calls.push(['target', v, t, k]), set value(v) { calls.push(['value', v]); } } } };
    C.rampGain(fakeE, 0.5, 1); C.rampGain(fakeE, 0.5, 1.02); C.rampGain(fakeE, 0.2, 1.04);
    ck.gainRamp = calls.length === 2 && calls[0][0] === 'set' && calls[1][0] === 'target' && calls[1][1] === 0.2 && calls[1][3] > 0;
    // voiceover latency: recorder start vs play start + output + input latency trims the head (one undo step); early takes start later
    const lat = C.voLatency(1000, 1050, 0.1, 0.02), pl = C.voPlace(2, lat), pe = C.voPlace(2, -0.1);
    ck.voLatency = Math.abs(lat - 0.17) < 1e-9 && pl.start === 2 && Math.abs(pl.head - 0.17) < 1e-9 && Math.abs(pe.start - 2.1) < 1e-9 && pe.head === 0 && C.voLatency(0, null, 0.2, 0.01) === 0.01;
    reset(); const u0 = C.hist.undo.length, vc = C.addMediaClip(wavM, tid('A1'), 2, { isVoice: true }, 0.17);
    ck.voTrim = Math.abs(vc.in - 0.17) < 1e-9 && Math.abs(vc.dur - (wavM.dur - 0.17)) < 1e-9 && vc.start === 2 && C.hist.undo.length === u0 + 1;
    // while recording, Space / K / a timeline click stop the take instead of moving the transport
    const fakeRec = () => { const r = { state: 'recording', stopped: 0, stop() { r.stopped++; r.state = 'inactive'; } }; return r; };
    let rec = fakeRec(); C.vo = { rec }; C.setPlayhead(1); C.play();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    ck.voSpaceStops = rec.stopped === 1 && !C.vo && !C.playing;
    rec = fakeRec(); C.vo = { rec }; const ph = C.playhead;
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', bubbles: true, cancelable: true }));
    const okJ = rec.stopped === 1 && C.playhead === ph;
    rec = fakeRec(); C.vo = { rec };
    document.querySelector('#ruler').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 600, clientY: 10 }));
    ck.voStopKeys = okJ && rec.stopped === 1 && C.playhead === ph && !C.vo && C.voStop() === false;
    // waveform peaks: true peak over all channels (left silent, right at half scale), stored as Uint8 in IndexedDB
    reset(); const dec = OfflineAudioContext.prototype.decodeAudioData; let inFlight = 0, maxFlight = 0, decodes = 0;
    OfflineAudioContext.prototype.decodeAudioData = function (...args) { decodes++; inFlight++; maxFlight = Math.max(maxFlight, inFlight); return dec.apply(this, args).finally(() => inFlight--); };
    try {
      const [st] = await lim(C.importFiles([wavFile('stereo.wav', 8000, 1, 2, (ch, t) => ch ? 0.5 * Math.sin(2 * Math.PI * 200 * t) : 0)]), 15000, 'import stereo');
      await lim(C.queuePeaks(st), 15000, 'peaks');
      const pk = st.peaks; A.peakMax = pk ? Math.max(...pk) : -1;
      ck.peaksTrue = pk instanceof Uint8Array && Math.abs(pk.length - 50) <= 1 && A.peakMax >= 120 && A.peakMax <= 135;
      let rec2 = null;
      for (let i = 0; i < 20 && !(rec2 && rec2.peaks); i++) {
        await sleep(100);
        rec2 = await new Promise(res => { const o = indexedDB.open('cutroom'); o.onsuccess = () => { const q = o.result.transaction('media').objectStore('media').get(st.id); q.onsuccess = () => { o.result.close(); res(q.result); }; q.onerror = () => { o.result.close(); res(null); }; }; o.onerror = () => res(null); });
      }
      ck.peaksInDb = !!rec2 && rec2.peaks instanceof Uint8Array && rec2.peaks.length === pk.length;
      // one decode at a time
      maxFlight = 0; const copies = [0, 1, 2].map(i => ({ id: 'pq' + i, kind: 'audio', dur: 3, blob: wavM.blob, peaks: null }));
      copies.forEach(m => C.queuePeaks(m)); await lim(C.queuePeaks(copies[2]), 20000, 'peak queue');
      ck.peaksQueued = maxFlight === 1 && copies.every(m => m.peaks && m.peaks.length > 100);
      // duration limit, not file size: a 3 h file is skipped without decoding
      const n0 = decodes, long = { id: 'pqLong', kind: 'audio', dur: 3 * 3600, blob: wavM.blob, peaks: null }; await C.computePeaks(long);
      ck.peaksDurLimit = long.peaks === null && decodes === n0;
      // the project file carries the peaks (no decode after opening), and an old clip without keepPitch gets the default
      const kc = C.addMediaClip(st, tid('A1'), 0); delete kc.props.keepPitch; C.commit();
      const pf = C.projectToBlob(), hl = new DataView(await pf.slice(8, 12).arrayBuffer()).getUint32(0, true), hdr = JSON.parse(await pf.slice(12, 12 + hl).text());
      const n1 = decodes; await lim(C.loadProjectBlob(new File([pf], 'peaks.framewright')), 15000, 'open peaks'); await lim(C.queuePeaks({ kind: 'image' }), 20000, 'drain');
      const st2 = C.media.get(st.id);
      ck.peaksInFile = typeof hdr.media.find(m => m.id === st.id).peaks === 'string' && decodes === n1 && st2.peaks instanceof Uint8Array && st2.peaks.join() === pk.join();
      ck.keepPitchNormalized = S.clips.find(k => k.mediaId === st.id).props.keepPitch === true;
    } finally { OfflineAudioContext.prototype.decodeAudioData = dec; }
    reset();
    A.ok = Object.values(ck).every(Boolean);
    }

    // linked audio: detach links the pair; they select, move, trim, split, delete, paste and freeze together; Alt picks one; Unlink / Link
    {
    const C = cutroom, S = C.state, L = out.linked = { checks: {} }, ck = L.checks;
    const tid = (name) => S.tracks.find(t => t.name === name).id, onTrack = (id) => S.clips.filter(k => k.track === id).sort((a, b) => a.start - b.start);
    const noOverlap = () => S.tracks.every(t => onTrack(t.id).every((k, i, a) => i === 0 || k.start >= a[i - 1].start + a[i - 1].dur - 1e-6));
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const [vidM] = await lim(C.importFiles([new File([r.blob], 'linked.mp4', { type: 'video/mp4' })]), 20000, 'import mp4 (linked)');
    const audM = [...C.media.values()].find(m => m.kind === 'audio'), imgM = [...C.media.values()].find(m => m.kind === 'image');
    const pair = () => { const v = C.addMediaClip(vidM, tid('V1'), 0); v.start = 0; v.dur = 3; v.in = 0; C.commit(); return [v, C.detachAudio(v)]; };
    const el = (c) => document.querySelector(`.clip[data-id="${c.id}"]`);
    const ptr = (c, type, dx, alt) => { const rc = el(c).getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
      (type === 'pointerdown' ? el(c) : window).dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, clientX: x + (dx || 0), clientY: y, altKey: !!alt })); };
    const drag = (c, dx, alt) => { const rc = el(c).getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
      el(c).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y, altKey: !!alt }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x + dx, clientY: y, altKey: !!alt }));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x + dx, clientY: y, altKey: !!alt })); };
    C.setPlayhead(60);                                          // keep the playhead out of snapping range
    // detach sets a shared link; the timeline shows the link glyph
    reset(); let [v, a] = pair();
    ck.linkSet = !!v.link && v.link === a.link && C.linkedOf(v).length === 1 && C.linkedOf(v)[0] === a && !!el(v).querySelector('.lnk') && !!el(a).querySelector('.lnk');
    // click selects both, Alt+click just one
    C.select(null); ptr(a, 'pointerdown'); ptr(a, 'pointerup');
    ck.clickSelectsPair = C.selIds.length === 2 && C.selIds.includes(v.id) && C.selIds.includes(a.id);
    C.select(null); ptr(a, 'pointerdown', 0, true); ptr(a, 'pointerup', 0, true);
    ck.altSelectsOne = C.selIds.length === 1 && C.selIds[0] === a.id;
    // dragging one moves both (one undo step); Alt+drag moves just the one
    C.select(null); const pps = el(v).getBoundingClientRect().width / v.dur, u0 = C.hist.undo.length;
    drag(v, Math.round(pps * 1));
    ck.moveTogether = v.start > 0.5 && Math.abs(v.start - a.start) < 1e-6 && C.hist.undo.length === u0 + 1 && noOverlap();
    C.undo(); v = S.clips.find(k => k.type === 'video'); a = S.clips.find(k => k.type === 'audio');
    ck.moveUndo = v.start === 0 && a.start === 0;
    C.select(null); drag(a, Math.round(pps * 1), true);
    ck.altMoveOne = a.start > 0.5 && v.start === 0;
    // trims move both edges, limited by each clip's own neighbours and source length
    reset(); [v, a] = pair();
    C.trimEdge(v, 'r', 2); const tr1 = Math.abs(v.dur - 2) < 1e-6 && Math.abs(a.dur - 2) < 1e-6;
    const blk = C.addMediaClip(audM, a.track, 2.5); blk.start = 2.5; C.commit();
    C.trimEdge(v, 'r', 3); const tr2 = Math.abs(v.dur - 2.5) < 1e-6 && Math.abs(a.dur - 2.5) < 1e-6;
    C.trimEdge(a, 'l', 1); const tr3 = Math.abs(v.start - 1) < 1e-6 && Math.abs(a.start - 1) < 1e-6 && Math.abs(v.in - 1) < 1e-6 && Math.abs(a.in - 1) < 1e-6;
    C.trimEdge(v, 'l', -5); const tr4 = v.start === 0 && a.start === 0 && v.in === 0 && a.in === 0;   // source start limits it
    ck.trimTogether = tr1 && tr2 && tr3 && tr4 && noOverlap();
    // split: both halves, the right halves get their own link
    reset(); [v, a] = pair(); C.select(v.id); C.setPlayhead(1); C.splitAtPlayhead(); C.setPlayhead(60);
    const rv = S.clips.find(k => k.type === 'video' && k !== v), ra = S.clips.find(k => k.type === 'audio' && k !== a);
    ck.splitTogether = S.clips.length === 4 && Math.abs(a.dur - 1) < 1e-6 && !!rv && !!ra && rv.link === ra.link && rv.link !== v.link && v.link === a.link && Math.abs(ra.start - 1) < 1e-6;
    // delete (ripple) with only the video selected takes the audio too
    reset(); [v, a] = pair(); const nv = C.addMediaClip(imgM, tid('V1'), 4), na = C.addMediaClip(audM, a.track, 4); nv.start = 4; na.start = 4; C.commit();
    C.select(v.id); C.deleteSel(true);
    ck.deleteTogether = !S.clips.includes(v) && !S.clips.includes(a) && S.clips.length === 2 && Math.abs(nv.start - 1) < 1e-6 && Math.abs(na.start - 1) < 1e-6;
    // freeze frame pushes the linked audio (even when moved out of the old sync) and leaves unlinked footage of the same media alone
    reset(); [v, a] = pair(); a.start = 0.5; const z = { ...JSON.parse(JSON.stringify(a)), id: 'lnkZ', start: 0, in: 0 }; delete z.link;
    z.track = C.addTrack('audio', true).id; S.clips.push(z); C.commit();
    C.insertFreeze(v, 1.5, imgM, 2);
    const aa = onTrack(a.track);
    ck.freezeLinked = aa.length === 2 && Math.abs(aa[1].start - 3.5) < 1e-6 && z.start === 0 && Math.abs(z.dur - a.dur - aa[1].dur) < 1e-6 &&
      C.linkedOf(S.clips.find(k => k.type === 'video' && Math.abs(k.start - 3.5) < 1e-6))[0] === aa[1] && noOverlap();
    S.clips.splice(S.clips.indexOf(z), 1); S.tracks.splice(S.tracks.findIndex(t => t.id === z.track), 1); C.commit();
    // context menu offers Unlink; Unlink and Link are single undo steps; Link wants one video + one audio
    reset(); [v, a] = pair();
    el(v).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: el(v).getBoundingClientRect().left + 5, clientY: el(v).getBoundingClientRect().top + 5 }));
    const items = [...document.querySelectorAll('.ctx .ctxitem')].map(i => i.textContent); document.querySelectorAll('.ctx').forEach(m => m.remove());
    let u1 = C.hist.undo.length; C.unlinkClips(v);
    const unl = !v.link && !a.link && C.hist.undo.length === u1 + 1 && !el(v).querySelector('.lnk');
    C.selectMany([v.id, a.id]);
    el(v).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: el(v).getBoundingClientRect().left + 5, clientY: el(v).getBoundingClientRect().top + 5 }));
    const items2 = [...document.querySelectorAll('.ctx .ctxitem')].map(i => i.textContent); document.querySelectorAll('.ctx').forEach(m => m.remove());
    u1 = C.hist.undo.length; const lk = C.linkClips([v, a]), u2 = C.hist.undo.length;
    const v2 = C.addMediaClip(imgM, tid('V2'), 0);
    ck.unlinkLink = items.some(t => t.startsWith('Unlink')) && unl && items2.some(t => t.startsWith('Link')) && lk && v.link && v.link === a.link && u2 === u1 + 1 && C.linkClips([v, v2]) === false;
    // paste: copies of a pair get a new link of their own; a lone copy is unlinked
    C.pasteClip([v, a], 10); const pv = S.clips.find(k => k.type === 'video' && k.start >= 10 - 1e-6), pa = S.clips.find(k => k.type === 'audio' && k.start >= 10 - 1e-6);
    C.pasteClip([v], 20); const lone = S.clips.find(k => k.type === 'video' && k.start >= 20 - 1e-6);
    ck.pasteRelinks = !!pv && !!pa && pv.link && pv.link === pa.link && pv.link !== v.link && !!lone && !lone.link && C.linkedOf(v)[0] === a;
    // older clips without a link behave as before: click selects one, split / delete leave the other alone
    reset(); [v, a] = pair(); delete v.link; delete a.link; C.commit();
    C.select(null); ptr(v, 'pointerdown'); ptr(v, 'pointerup'); const one = C.selIds.length === 1;
    C.splitClip(v, 1); C.commit(); const ns = S.clips.length === 3 && Math.abs(a.dur - 3) < 1e-6;
    C.select(v.id); C.deleteSel(false);
    ck.unlinkedUnchanged = one && ns && S.clips.includes(a) && S.clips.length === 2;
    reset();
    L.ok = Object.values(ck).every(Boolean);
    }

    // keyboard editing: Q/W trims (ripple), Alt+arrow nudge, edit-point jumps, select from here, in/out, track reorder, slip
    {
    const C = cutroom, S = C.state, K = out.keyboard = { checks: {} }, ck = K.checks;
    const tid = (name) => S.tracks.find(t => t.name === name).id, near = (a, b) => Math.abs(a - b) < 1e-6;
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const vidM = [...C.media.values()].find(m => m.kind === 'video'), imgM = [...C.media.values()].find(m => m.kind === 'image');
    const mk = (m, track, start, dur) => { const c = C.addMediaClip(m, tid(track), start); c.start = start; c.dur = dur; c.in = 0; C.commit(); return c; };
    const key = (k, o) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...(o || {}) }));
    const el = (c) => document.querySelector(`.clip[data-id="${c.id}"]`);
    const menuOf = (target, x, y) => { target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      const items = [...document.querySelectorAll('.ctx .ctxitem')].map(i => ({ t: i.textContent, dis: i.classList.contains('dis') })); document.querySelectorAll('.ctx').forEach(m => m.remove()); return items; };
    // Q trims the start to the playhead: in-point moves, one undo step
    reset(); let v = mk(vidM, 'V1', 0, 3); C.select(v.id); C.setPlayhead(1); let u0 = C.hist.undo.length;
    key('q');
    ck.trimStart = near(v.start, 1) && near(v.dur, 2) && near(v.in, 1) && C.hist.undo.length === u0 + 1;
    // Shift+W ripple-trims the end: the next clip moves up by the removed amount
    reset(); let a = mk(imgM, 'V1', 0, 5), b = mk(imgM, 'V1', 6, 2); C.select(a.id); C.setPlayhead(3);
    key('W', { shiftKey: true });
    ck.rippleEnd = near(a.dur, 3) && near(b.start, 4);
    // Shift+Q ripple-trims the start: clip keeps its start, keyframes follow the content, later clips close up
    reset(); a = mk(imgM, 'V1', 0, 5); b = mk(imgM, 'V1', 5, 2); a.kf = { opacity: [{ t: 3, v: 50 }] }; C.commit(); C.select(a.id); C.setPlayhead(2);
    C.trimToPlayhead('l', true);
    ck.rippleStart = near(a.start, 0) && near(a.dur, 3) && near(a.kf.opacity[0].t, 1) && near(b.start, 3);
    // nothing selected: the topmost unlocked clip under the playhead; locked tracks are skipped
    reset(); const top = mk(imgM, 'V2', 0, 4), low = mk(imgM, 'V1', 0, 4); C.select(null); C.setPlayhead(2);
    C.trimToPlayhead('r'); const t1 = near(top.dur, 2) && near(low.dur, 4);
    S.tracks.find(t => t.id === top.track).locked = true; C.commit(); C.setPlayhead(1); C.trimToPlayhead('r');
    ck.topmostUnlocked = t1 && near(top.dur, 2) && near(low.dur, 1);
    // context menu lists the trims
    reset(); a = mk(imgM, 'V1', 0, 5); C.setPlayhead(2); C.select(a.id);
    const cm = menuOf(el(a), el(a).getBoundingClientRect().left + 5, el(a).getBoundingClientRect().top + 5);
    ck.menuTrim = cm.some(i => i.t.startsWith('Trim start to playhead') && !i.dis) && cm.some(i => i.t.startsWith('Trim end to playhead'));
    // Alt+→ nudges by a frame (Shift: 10); a blocked nudge changes nothing; the group drag uses the same moveClips
    reset(); a = mk(imgM, 'V1', 0, 2); b = mk(imgM, 'V1', 3, 2); C.select(a.id); u0 = C.hist.undo.length;
    key('ArrowRight', { altKey: true }); const n1 = near(a.start, 1 / 30) && C.hist.undo.length === u0 + 1;
    key('ArrowRight', { altKey: true, shiftKey: true }); const n2 = near(a.start, 11 / 30);
    const blocked = C.nudgeSel(30) === false && near(a.start, 11 / 30);
    key('ArrowLeft', { altKey: true, shiftKey: true }); key('ArrowLeft', { altKey: true }); const n3 = near(a.start, 0) && C.nudgeSel(-1) === false;
    ck.nudge = n1 && n2 && blocked && n3 && C.moveClips([a], -1) === false && C.moveClips([a, b], 1) === true && near(b.start, 4);
    // ↑/↓ jump between clip edges; Shift between markers
    reset(); mk(imgM, 'V1', 0, 2); mk(imgM, 'V1', 3, 2); S.markers.push(1, 4); C.commit(); C.setPlayhead(0);
    key('ArrowDown'); const j1 = near(C.playhead, 2); key('ArrowDown'); const j2 = near(C.playhead, 3); key('ArrowUp'); const j3 = near(C.playhead, 2);
    key('ArrowDown', { shiftKey: true }); const j4 = near(C.playhead, 4); key('ArrowUp', { shiftKey: true }); const j5 = near(C.playhead, 1);
    C.setPlayhead(5); ck.jumpEdit = j1 && j2 && j3 && j4 && j5 && C.jumpEdit(1) === false && near(C.playhead, 5);
    // Ctrl+Shift+A selects everything from the playhead; track variant and lane menu
    reset(); a = mk(imgM, 'V1', 0, 2); b = mk(imgM, 'V1', 3, 2); const c2 = mk(imgM, 'V2', 4, 1); C.setPlayhead(2.5);
    key('A', { ctrlKey: true, shiftKey: true }); const s1 = C.selIds.length === 2 && C.selIds.includes(b.id) && C.selIds.includes(c2.id);
    C.selectFrom(0, a.track); const s2 = C.selIds.length === 2 && C.selIds.includes(a.id) && C.selIds.includes(b.id);
    const lane = document.querySelector(`.lane[data-id="${a.track}"]`), lr = lane.getBoundingClientRect();
    const lm = menuOf(lane, lr.right - 5, lr.top + 5);
    ck.selectFrom = s1 && s2 && lm.some(i => i.t.startsWith('Select everything after here')) && lm.some(i => i.t.startsWith('Select track from here'));
    // I / O set the sequence range (undoable, kept by undo/redo), Alt+X clears; drawn on the ruler
    reset(); mk(imgM, 'V1', 0, 6); C.setPlayhead(1); key('i'); C.setPlayhead(4); key('o');
    const io1 = S.inPt === 1 && S.outPt === 4 && C.ioRange().from === 1 && C.ioRange().to === 4;
    C.undo(); const io2 = S.inPt === 1 && S.outPt === null && C.ioRange().to === 6; C.redo();
    C.markIO('in', 5); const io3 = S.inPt === 5 && S.outPt === null;   // an in after the out drops the out
    key('x', { altKey: true }); const io4 = S.inPt === null && S.outPt === null && C.ioRange() === null;
    ck.inOut = io1 && io2 && io3 && io4;
    // Advanced: move a track within its kind (one undo step); locked tracks stay put; header menu offers it
    reset(); C.setMode(false); const order = () => S.tracks.map(t => t.name).join(',');
    const o0 = order(); u0 = C.hist.undo.length;
    const mt = C.moveTrack(tid('V1'), -1), o1 = order();
    const mtEdge = C.moveTrack(S.tracks.find(t => t.kind === 'audio').id, -1) === false;
    S.tracks.find(t => t.name === 'V3').locked = true; C.commit(); const mtLock = C.moveTrack(tid('V3'), 1) === false;
    const hdr = document.querySelector(`.thead[data-id="${tid('V2')}"]`), hr = hdr.getBoundingClientRect();
    const hm = menuOf(hdr, hr.left + 5, hr.top + 5);
    ck.trackOrder = mt && o1.indexOf('V1') < o1.indexOf('V2') && o1.split(',').slice(-2).join() === o0.split(',').slice(-2).join() && C.hist.undo.length >= u0 + 1 &&
      mtEdge && mtLock && hm.some(i => i.t.startsWith('Move track up')) && hm.some(i => i.t.startsWith('Move track down'));
    S.tracks.forEach(t => t.locked = false); C.moveTrack(tid('V1'), 1); ck.trackOrder = ck.trackOrder && order() === o0;
    // Advanced: Alt-drag a clip body slips the in-point only (clamped to the source); Simple mode keeps Alt-drag = move
    reset(); v = mk(vidM, 'V1', 1, 1); v.in = 0.5; C.commit();
    const sp = C.slipParts(v); C.applySlip(sp, 0.3); const sl1 = near(v.in, 0.8) && near(v.start, 1) && near(v.dur, 1);
    C.applySlip(sp, 100); const sl2 = near(v.in, vidM.dur - 1); C.applySlip(sp, -100); const sl3 = near(v.in, 0);
    v.in = 0.5; C.commit(); C.select(null);
    const pps = el(v).getBoundingClientRect().width / v.dur, rc = el(v).getBoundingClientRect(), x = rc.left + rc.width / 2, y = rc.top + rc.height / 2;
    el(v).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: x, clientY: y, altKey: true }));
    window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x - pps * 0.2, clientY: y, altKey: true }));
    const hint = document.querySelector('#stHint').textContent;
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: x - pps * 0.2, clientY: y, altKey: true }));
    v = S.clips[0];
    ck.slip = sl1 && sl2 && sl3 && Math.abs(v.in - 0.7) < 0.04 && near(v.start, 1) && near(v.dur, 1) && hint.startsWith('Slip');
    C.setMode(true);
    // locked: Q/W and nudge leave the clip alone
    reset(); a = mk(imgM, 'V1', 0, 4); C.select(a.id); S.tracks.find(t => t.id === a.track).locked = true; C.commit(); C.setPlayhead(2);
    ck.lockedRespected = C.trimToPlayhead('l') === 0 && C.nudgeSel(1) === false && near(a.start, 0) && near(a.dur, 4);
    reset(); C.setPlayhead(60);
    K.ok = Object.values(ck).every(Boolean);
    }

    // keyframe easing: eased / hold segments, easing menus, navigator buttons and [ / ] jumps
    {
    const C = cutroom, S = C.state, E = out.easing = { checks: {} }, ck = E.checks;
    const tid = (name) => S.tracks.find(t => t.name === name).id, near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
    const reset = () => { S.clips.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const imgM = [...C.media.values()].find(m => m.kind === 'image');
    const mk = (start, dur) => { const c = C.addMediaClip(imgM, tid('V1'), start); c.start = start; c.dur = dur; c.in = 0; C.commit(); return c; };
    const key = (k, o) => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...(o || {}) }));
    const menuItems = () => { const it = [...document.querySelectorAll('.ctx .ctxitem')]; return it; };
    const closeMenus = () => document.querySelectorAll('.ctx').forEach(m => m.remove());
    // val(): ease-in midpoint is below linear; older keys without e stay linear; hold keeps the first value until the next key
    reset(); let c = mk(0, 2);
    c.kf = { x: [{ t: 0, v: 0 }, { t: 2, v: 100 }] }; const lin = C.val(c, 'x', 1);
    c.kf.x[0].e = 'in'; const ein = C.val(c, 'x', 1); c.kf.x[0].e = 'out'; const eout = C.val(c, 'x', 1); c.kf.x[0].e = 'inout'; const eio = C.val(c, 'x', 1);
    ck.easeIn = near(lin, 50) && ein < lin && eout > lin && near(eio, 50) && near(C.val(c, 'x', 0), 0) && near(C.val(c, 'x', 2), 100);
    c.kf = { x: [{ t: 0, v: 10, e: 'hold' }, { t: 1, v: 100 }, { t: 2, v: 200 }] };
    ck.hold = C.val(c, 'x', 0.5) === 10 && C.val(c, 'x', 0.99) === 10 && C.val(c, 'x', 1) === 100 && near(C.val(c, 'x', 1.5), 150);
    // upsertKf keeps e on update, inherits the previous key's e on insert (linear stays absent)
    C.upsertKf(c, 'x', 0, 20); const keep = c.kf.x[0].e === 'hold' && c.kf.x[0].v === 20;
    C.upsertKf(c, 'x', 0.5, 30); const ins = c.kf.x[1].t === 0.5 && c.kf.x[1].e === 'hold';
    C.upsertKf(c, 'x', 1.5, 40); ck.upsert = keep && ins && c.kf.x.find(q => q.t === 1.5) && !('e' in c.kf.x.find(q => q.t === 1.5));
    // split keeps easing on both halves (and the cut key in the held segment holds)
    reset(); c = mk(0, 2); c.kf = { x: [{ t: 0, v: 0, e: 'hold' }, { t: 2, v: 100, e: 'out' }] }; C.commit();
    C.splitClip(c, 1); C.commit(); const rb = S.clips.find(k => k.id !== c.id);
    ck.split = rb && rb.kf.x[0].e === 'hold' && rb.kf.x[0].v === 0 && rb.kf.x[1].e === 'out' && C.val(rb, 'x', 1.5) === 0;
    // setKfEase: one undo step; linear removes e; locked tracks refuse
    reset(); c = mk(0, 2); c.kf = { x: [{ t: 0, v: 0 }, { t: 2, v: 100 }], opacity: [{ t: 0, v: 100 }, { t: 1, v: 50 }] }; C.commit();
    let u0 = C.hist.undo.length; const se = C.setKfEase(c, 0, 'inout');
    c = S.clips[0]; const se1 = se && c.kf.x[0].e === 'inout' && c.kf.opacity[0].e === 'inout' && C.hist.undo.length === u0 + 1;
    C.setKfEase(c, 0, 'linear', 'x'); c = S.clips[0]; const se2 = !('e' in c.kf.x[0]) && c.kf.opacity[0].e === 'inout';
    C.undo(); c = S.clips[0]; const se3 = c.kf.x[0].e === 'inout';
    S.tracks.find(t => t.id === c.track).locked = true; C.commit(); const se4 = C.setKfEase(c, 0, 'hold') === false && c.kf.x[0].e === 'inout';
    S.tracks.forEach(t => t.locked = false); C.commit();
    ck.setEase = se1 && se2 && se3 && se4;
    // timeline: eased key drawn differently; right-click on the diamond opens the easing menu
    c = S.clips[0]; C.select(c.id); C.setPlayhead(0.5);
    const ce = document.querySelector(`.clip[data-id="${c.id}"]`), dm = [...ce.querySelectorAll('.kfm')];
    const d0 = dm.find(m => +m.dataset.t === 0), d1 = dm.find(m => +m.dataset.t === 1);
    const looks = !!d0 && d0.classList.contains('eased') && !!d1 && !d1.classList.contains('eased') && !d1.classList.contains('hold');
    const r1 = d1.getBoundingClientRect();
    ce.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r1.left + r1.width / 2, clientY: r1.top + r1.height / 2 }));
    let it = menuItems(); const tmenu = it.length === 6 && it.map(i => i.textContent).join('|').includes('Ease in-out');
    u0 = C.hist.undo.length; const hi = it.find(i => i.textContent.includes('Hold')); if (hi) hi.click(); closeMenus();
    c = S.clips[0]; const tset = c.kf.opacity[1].e === 'hold' && C.hist.undo.length === u0 + 1;
    const d1b = document.querySelector(`.clip[data-id="${c.id}"] .kfm[data-t="1"]`);
    ck.timelineMenu = looks && tmenu && tset && !!d1b && d1b.classList.contains('hold');
    // Inspector (Advanced): ◀ ▶ beside ◆ on animated props; right-click ◆ on a key gives the menu; ◀ / ▶ jump within that prop
    C.setMode(false); C.setPlayhead(0); C.select(c.id); C.renderInspector(true);
    const kb = document.querySelector('#insp button[aria-label="Keyframe Position X"]') || document.querySelector('button[aria-label="Keyframe Position X"]');
    const nav = kb ? [...kb.parentElement.querySelectorAll('.kfn')] : [];
    const inspLook = !!kb && kb.classList.contains('on') && kb.classList.contains('eased') && nav.length === 2;
    kb.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }));
    it = menuItems(); const imenu = it.length === 6 && it.some(i => i.textContent.startsWith('✓ Ease in-out'));
    const oi = it.find(i => i.textContent.includes('Ease out')); if (oi) oi.click(); closeMenus();
    c = S.clips[0]; const iset = c.kf.x[0].e === 'out' && c.kf.opacity[0].e === 'inout';
    const nb = document.querySelector('button[aria-label="Keyframe Position X"]').parentElement.querySelector('.kfn:last-child'); nb.click();
    const inav = near(C.playhead, 2);
    ck.inspector = inspLook && imenu && iset && inav;
    C.setMode(true);
    // [ / ] jump between keys of the selected clip (any property)
    c = S.clips[0]; C.select(c.id); C.setPlayhead(0);
    key(']'); const k1 = near(C.playhead, 1); key(']'); const k2 = near(C.playhead, 2); key('['); const k3 = near(C.playhead, 1); key('['); const k4 = near(C.playhead, 0);
    ck.bracketJump = k1 && k2 && k3 && k4 && C.jumpKf(c, -1) === false && near(C.playhead, 0);
    reset(); C.setPlayhead(60);
    E.ok = Object.values(ck).every(Boolean);
    }
    // inspector power features: multi-clip editing, expressions, scrubbable labels, copy / paste attributes, project panel, saved presets
    {
    const C = cutroom, S = C.state, P = out.inspPower = { checks: {} }, ck = P.checks, q = (s) => document.querySelector('#insp ' + s);
    const reset = () => { S.clips.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const byId = (id) => S.clips.find(k => k.id === id);
    const fire = (el, type) => el.dispatchEvent(new Event(type, { bubbles: true }));
    const typeNum = (label, txt) => { const n = q(`input[aria-label="${label} value"]`); n.value = txt; fire(n, 'input'); fire(n, 'change'); };
    const solid = (props) => { C.setPlayhead(0); C.addGenerated('solid', props || {}); return S.clips[S.clips.length - 1]; };
    // numExpr: relative entry, never eval
    ck.expr = C.numExpr('+=20', 10) === 30 && C.numExpr('-=15', 10) === -5 && C.numExpr('*2', 7) === 14 && C.numExpr('/2', 7) === 3.5 && C.numExpr('42', 1) === 42
      && C.numExpr('-3.5', 0) === -3.5 && isNaN(C.numExpr('alert(1)', 0)) && isNaN(C.numExpr('/0', 5));
    // several selected: shared value edits all (one undo step); differing values show 'mixed'; relative entry is per clip
    reset(); let a = solid({ opacity: 10 }), b = solid({ opacity: 40 }); const ia = a.id, ib = b.id;
    C.selectMany([ia, ib], ia); C.renderInspector(true);
    let nf = q('input[aria-label="Opacity % value"]');
    const mixedShown = !!nf && nf.value === '' && nf.placeholder === 'mixed' && nf.closest('.prow').querySelector('label').classList.contains('mixed')
      && /Editing 2 clips/.test(document.querySelector('#insp').textContent);
    let u0 = C.hist.undo.length; typeNum('Opacity %', '+=20');
    const rel = byId(ia).props.opacity === 30 && byId(ib).props.opacity === 60 && C.hist.undo.length === u0 + 1;
    typeNum('Opacity %', '*2'); const mul = byId(ia).props.opacity === 60 && byId(ib).props.opacity === 100;   // clamped at max
    u0 = C.hist.undo.length; typeNum('Opacity %', '25');
    const same = byId(ia).props.opacity === 25 && byId(ib).props.opacity === 25 && C.hist.undo.length === u0 + 1 && q('input[aria-label="Opacity % value"]').placeholder === '';
    C.undo(); const und = byId(ia).props.opacity === 60 && byId(ib).props.opacity === 100;
    ck.multiEdit = mixedShown && rel && mul && same && und;
    // keyframe-aware per clip; checkboxes show indeterminate; locked clips are left alone
    reset(); a = solid(); b = solid(); const c3 = solid(); C.setPlayhead(0.5);
    b.kf = { x: [{ t: 0, v: 0 }, { t: 2, v: 200 }] }; a.props.flipH = true; C.commit();
    S.tracks.find(t => t.id === c3.track).locked = true; C.commit();
    C.selectMany([a.id, b.id, c3.id], a.id); C.renderInspector(true);
    const flip = [...document.querySelectorAll('#insp label')].find(l => l.textContent === 'Flip horiz.'), fi = flip && document.getElementById(flip.htmlFor);
    const indet = !!fi && fi.indeterminate && flip.classList.contains('mixed');
    typeNum('Position X', '300');
    a = byId(a.id); b = byId(b.id);
    const kfAware = a.props.x === 300 && !a.kf && b.kf.x.some(k => Math.abs(k.t - 0.5) < 1e-6 && k.v === 300) && byId(c3.id).props.x === 0;
    const lockNote = /1 on locked tracks/.test(document.querySelector('#insp').textContent);
    S.tracks.forEach(t => t.locked = false); C.commit();
    ck.multiKfLocked = indet && kfAware && lockNote;
    // only shared sections: solid + audio selection shows no Transform / Audio sections
    reset(); a = solid(); const tone = [...C.media.values()].find(m => m.kind === 'audio');
    const au = C.addMediaClip(tone, S.tracks.find(t => t.kind === 'audio').id, 0);
    C.selectMany([a.id, au.id], a.id); C.renderInspector(true);
    const titles = [...document.querySelectorAll('#insp .sec h4')].map(h => h.textContent);
    ck.sharedSections = titles.includes('Clip') && !titles.includes('Transform') && !titles.includes('Audio') && !titles.includes('Solid');
    // scrubbable label: drag right +10 px = +10; Shift ×10; one undo step per drag
    reset(); a = solid({ opacity: 50 }); C.select(a.id); C.renderInspector(true);
    const scrub = (label, dx, o = {}) => {
      const l = [...document.querySelectorAll('#insp .prow label')].find(x => x.textContent === label);
      l.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 100, button: 0 }));
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100 + dx, ...o })); window.dispatchEvent(new PointerEvent('pointerup', { clientX: 100 + dx }));
      return l;
    };
    const lbl0 = [...document.querySelectorAll('#insp .prow label')].find(x => x.textContent === 'Opacity %'), cur = lbl0 && getComputedStyle(lbl0).cursor;
    u0 = C.hist.undo.length; const sl = scrub('Opacity %', -10);
    const s1 = byId(a.id).props.opacity === 40 && C.hist.undo.length === u0 + 1 && sl.classList.contains('scrub') && cur === 'ew-resize';
    C.renderInspector(true); scrub('Rotation °', 3, { shiftKey: true }); const s2 = byId(a.id).props.rot === 30;
    C.renderInspector(true); scrub('Rotation °', 5, { altKey: true }); const s3 = Math.abs(byId(a.id).props.rot - 30.5) < 1e-9;
    C.undo(); C.undo(); const s4 = byId(a.id).props.rot === 0 && byId(a.id).props.opacity === 40;
    ck.scrub = s1 && s2 && s3 && s4;
    // copy / paste attributes: chosen groups only, keyframes travel, one undo step, locked targets skipped
    reset(); a = solid(); a.props.scale = 150; a.props.brightness = 50; a.props.fxVignette = 70; a.props.anim = 'pop'; a.kf = { x: [{ t: 0, v: 0 }, { t: 1, v: 100 }] }; C.commit();
    b = solid(); const d = solid(); S.tracks.find(t => t.id === d.track).locked = true; C.commit();
    C.select(a.id); const kd = new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }); document.body.dispatchEvent(kd);
    const copied = !!C.attrClip && C.attrClip.props.scale === 150;
    C.selectMany([b.id, d.id], b.id); u0 = C.hist.undo.length;
    const pn = C.pasteAttrs(['transform', 'fx']); b = byId(b.id);
    const pasted = pn === 1 && b.props.scale === 150 && b.props.fxVignette === 70 && b.props.brightness === 100 && b.props.anim === 'none'
      && b.kf && b.kf.x.length === 2 && byId(d.id).props.scale === 100 && C.hist.undo.length === u0 + 1;
    // the dialog: one checkbox per group that fits; Paste applies the ticked ones
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
    const boxes = [...document.querySelectorAll('#modalBox input[type=checkbox]')];
    const dlg = !document.querySelector('#modal').hidden && boxes.length === 6 && !boxes.some(x => x.value === 'text' || x.value === 'audio');
    boxes.forEach(x => x.checked = x.value === 'colour');
    [...document.querySelectorAll('#modalBox button')].find(x => x.textContent === 'Paste').click();
    b = byId(b.id); const viaDlg = document.querySelector('#modal').hidden && b.props.brightness === 50 && b.props.anim === 'none';
    S.tracks.forEach(t => t.locked = false); C.commit();
    // text style only reaches text clips; Copy / Paste attributes are in the clip menu
    reset(); C.setPlayhead(0); C.addGenerated('text', { font: 'Impact', color: '#ff0000', text: 'A' }); const t1 = S.clips[S.clips.length - 1];
    C.addGenerated('text', { text: 'B' }); const t2 = S.clips[S.clips.length - 1]; const so = solid();
    C.copyAttrs(t1); C.pasteAttrs(['text'], [byId(t2.id), byId(so.id)]);
    const txt = byId(t2.id).props.font === 'Impact' && byId(t2.id).props.color === '#ff0000' && byId(t2.id).props.text === 'B' && byId(so.id).props.color !== '#ff0000';
    C.select(t2.id); const ce = document.querySelector(`.clip[data-id="${t2.id}"]`), rc = ce.getBoundingClientRect();
    ce.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: rc.left + 5, clientY: rc.top + rc.height / 2 }));
    const menu = [...document.querySelectorAll('.ctx .ctxitem')].map(i => i.textContent).join('|'); document.querySelectorAll('.ctx').forEach(m => m.remove());
    ck.attrs = copied && pasted && dlg && viaDlg && txt && menu.includes('Copy attributes') && menu.includes('Paste attributes');
    // nothing selected: the Project section with frame size, rate, length and quick buttons
    reset(); a = solid(); C.select(null); C.setPlayhead(1); C.renderInspector(true);
    const ptxt = document.querySelector('#insp').textContent, pbtn = (t) => [...document.querySelectorAll('#insp button')].find(x => x.textContent === t);
    const panel = q('.sec h4') && q('.sec h4').textContent === 'Project' && /Length 00:00:05:00/.test(ptxt) && !!pbtn('Add text') && !!pbtn('Add solid') && !!pbtn('Import…');
    pbtn('Select clip under playhead').click(); const picked = C.selIds.length === 1 && C.selIds[0] === a.id;
    C.select(null); C.renderInspector(true);
    const fpsSel = [...document.querySelectorAll('#insp label')].find(l => l.textContent === 'Frame rate'), fs = fpsSel && document.getElementById(fpsSel.htmlFor);
    fs.value = '25'; fire(fs, 'change'); const fpsOk = S.settings.fps === 25; C.undo(); const fpsUndo = S.settings.fps === 30;
    ck.projectPanel = !!panel && picked && fpsOk && fpsUndo;
    // saved presets: IndexedDB kv 'presets', 'My presets' cards with ×, apply to every selected visual clip
    reset(); a = solid(); b = solid(); a.props.brightness = 130; a.props.sepia = 40; C.commit();
    const readKv = () => new Promise(res => { const r = indexedDB.open('cutroom'); r.onsuccess = () => { const g2 = r.result.transaction('kv').objectStore('kv').get('presets'); g2.onsuccess = () => { r.result.close(); res(g2.result); }; g2.onerror = () => res(null); }; r.onerror = () => res(null); });
    const pr = await C.savePreset('colour', 'Warm test', byId(a.id)); const raw = await readKv();
    const stored = !!raw && JSON.parse(raw).some(x => x.id === pr.id && x.props.brightness === 130 && x.props.sepia === 40 && !('x' in x.props));
    C.loadPresets('not json'); const garbage = C.userPresets.length === 0; C.loadPresets(raw); const reload = C.userPresets.some(x => x.id === pr.id);
    C.setLibTab('filters'); if (document.body.classList.contains('lib-collapsed')) C.setLibTab('filters');   // a second click on the open tab folds it
    let card = [...document.querySelectorAll('#lib .card.mine')].find(x => x.textContent.includes('Warm test'));
    const shown = !!card && !!card.querySelector('.pdel') && [...document.querySelectorAll('#lib .libHead')].some(h => h.textContent === 'My presets');
    C.selectMany([a.id, b.id], b.id); card = [...document.querySelectorAll('#lib .card.mine')].find(x => x.textContent.includes('Warm test')); u0 = C.hist.undo.length; card.click();
    const applied = byId(b.id).props.brightness === 130 && byId(b.id).props.sepia === 40 && C.hist.undo.length === u0 + 1;
    // Inspector 'Save as preset…' (Advanced, Adjust colour) opens a name dialog and stores it
    C.setMode(false); C.select(a.id); C.renderInspector(true); C.setMode(false);
    const sb = [...document.querySelectorAll('#insp .sec')].find(x => x.querySelector('h4').textContent === 'Adjust colour')?.querySelector('.btnrow button');
    if (sb) sb.click(); const ni = document.querySelector('#presetName'); if (ni) { ni.value = 'From dialog'; [...document.querySelectorAll('#modalBox button')].find(x => x.textContent === 'Save').click(); }
    await new Promise(r => setTimeout(r, 100));
    const viaInsp = !!sb && sb.textContent === 'Save as preset…' && C.userPresets.some(x => x.name === 'From dialog' && x.kind === 'colour');
    C.setMode(true);
    // × deletes (and the stored list follows)
    for (const x of [...document.querySelectorAll('#lib .card.mine .pdel')]) x.click();
    await new Promise(r => setTimeout(r, 100)); const raw2 = await readKv();
    const deleted = C.userPresets.length === 0 && JSON.parse(raw2 || '[]').length === 0 && !document.querySelector('#lib .card.mine');
    // text presets show in the Text tab; with no text selected they add a styled text clip
    C.select(null); C.setPlayhead(0); C.addGenerated('text', { font: 'Georgia', color: '#00ff00' }); const tp = await C.savePreset('text', 'Green', S.clips[S.clips.length - 1]);
    C.select(null); const nBefore = S.clips.length; C.applyPreset(tp); const nt = S.clips[S.clips.length - 1];
    const textP = S.clips.length === nBefore + 1 && nt.type === 'text' && nt.props.font === 'Georgia' && nt.props.color === '#00ff00';
    await C.deletePreset(tp.id); C.setLibTab('media');
    ck.presets = stored && garbage && reload && shown && applied && viaInsp && deleted && textP;
    // shortcuts dialog lists the new keys
    C.shortcutsDialog(); const sk = document.querySelector('#modalBox').textContent; document.querySelector('#modal').hidden = true;
    ck.shortcuts = sk.includes('Ctrl+Alt+C') && sk.includes('Drag a property name');
    reset(); C.setPlayhead(60);
    P.ok = Object.values(ck).every(Boolean);
    }
    // keying + colour: chroma key in Fast export, temperature, neutral = no pass, LUT cache, eyedropper, library cards, Inspector rows
    {
    const C = cutroom, S = C.state, K = out.keyColour = { checks: {} }, ck = K.checks, cvs = document.querySelector('#cv');
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const vids = S.tracks.filter(t => t.kind === 'video'), W = S.settings.w, H = S.settings.h;
    const solid = (tr, color, props = {}) => { C.setPlayhead(0); C.addGenerated('solid', { color, ...props }); const k = S.clips[S.clips.length - 1]; k.track = tr.id; k.start = 0; k.dur = 0.5; C.commit(); return k; };
    const px = () => [...cvs.getContext('2d').getImageData(W / 2, H / 2, 1, 1).data];
    // a pure-green solid keyed over an orange solid: the exported pixel is orange
    reset(); C.markIO(null); solid(vids[1], '#ff8000'); const gk = solid(vids[0], '#00ff00', { fxKey: 60 });
    const ex = await lim(C.exportFast(6e6, () => {}), 60000, 'export key');
    const i3 = await C.mp4Open(ex.blob), s3 = new C.Mp4Source(i3), f3 = await lim(s3.frameAt(0.25), 15000, 'decode key'), kc = document.createElement('canvas'); kc.width = W; kc.height = H;
    const kg = kc.getContext('2d', { willReadFrequently: true }); kg.drawImage(f3.img, 0, 0); s3.close();
    K.keyed = [...kg.getImageData(W / 2, H / 2, 1, 1).data].slice(0, 3);
    ck.keyExport = K.keyed[0] > 200 && K.keyed[1] > 90 && K.keyed[1] < 170 && K.keyed[2] < 60;
    C.setPlayhead(0.25); C.drawFrame(); const pv = px(); ck.keyPreview = pv[0] > 240 && Math.abs(pv[1] - 128) < 6 && pv[2] < 10;   // the monitor agrees
    // key off: the green shows again; a skin-ish orange is never keyed
    gk.props.fxKey = 0; C.drawFrame(); const off = px(); ck.keyOff = off[1] > 240 && off[0] < 10;
    // eyedropper: picks the colour under the pointer from the frame without the key, one undo step, then leaves pick mode
    gk.props.fxKey = 60; gk.props.fxKeyColor = '#123456'; C.commit(); C.select(gk.id); C.renderInspector(true);
    const pickBtn = [...document.querySelectorAll('#insp button')].find(b => b.textContent === 'Pick key colour');
    if (pickBtn) pickBtn.click();
    const picking = C.keyPick === gk.id && cvs.classList.contains('picking');
    const rc = cvs.getBoundingClientRect(), u0 = C.hist.undo.length;
    cvs.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: rc.left + rc.width / 2, clientY: rc.top + rc.height / 2 }));
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    const gk2 = S.clips.find(k => k.id === gk.id);
    ck.eyedropper = !!pickBtn && picking && gk2.props.fxKeyColor === '#00ff00' && C.hist.undo.length === u0 + 1 && C.keyPick === null && !cvs.classList.contains('picking') && gk2.props.fxKey === 60;
    C.startKeyPick(gk2); document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    ck.pickEsc = C.keyPick === null && C.selIds.includes(gk.id);
    // temperature +50 on grey: R > B (preview); neutral grade = no pixel pass, and equal settings share one cached LUT
    reset(); const gy = solid(vids[0], '#808080'); C.setPlayhead(0.25); C.drawFrame(); const g0 = px();
    gy.props.temp = 50; C.commit(); C.drawFrame(); const g1 = px(); K.grey = [g0.slice(0, 3), g1.slice(0, 3)];
    ck.temperature = g0[0] === g0[2] && g1[0] > g1[2] + 20;
    ck.neutral = !C.gradeOn({ ...gy.props, temp: 0 }) && !C.keyOn({ ...gy.props, fxKey: 0 }) && C.gradeOn(gy.props) && C.gradeLut({ temp: 50 }) === C.gradeLut({ ...gy.props });
    const lg = C.gradeLut({ lift: 40 }), gm = C.gradeLut({ gamma: 60 }), gn = C.gradeLut({ gain: -50 }), vb = new OffscreenCanvas(2, 1).getContext('2d');
    vb.fillStyle = '#c08080'; vb.fillRect(0, 0, 1, 1); C.pixelPass(vb, 2, 1, { vibrance: 80 }); const vv = [...vb.getImageData(0, 0, 1, 1).data];
    K.lgg = [lg[0], gm[128], gn[255], vv[0] - vv[1]];
    ck.lgg = lg[0] > 20 && gm[128] > 150 && gn[255] > 180 && gn[255] < 200 && vv[0] - vv[1] > 0x40;   // lift raises black, gamma lifts mids, gain lowers white, vibrance saturates
    // older clips without the new props pick up neutral defaults
    for (const k of ['temp', 'tint', 'vibrance', 'lift', 'gamma', 'gain', 'split', 'fxKey', 'fxKeyColor', 'fxKeySoft', 'fxKeySpill']) delete gy.props[k];
    C.normalizeClips(); ck.oldProject = gy.props.temp === 0 && gy.props.fxKey === 0 && gy.props.fxKeyColor === '#00b140' && !C.gradeOn(gy.props);
    // library: 'Green screen key' in Effects, the new looks in Filters; one undo step per click
    C.select(gy.id); C.setLibTab('effects'); if (document.body.classList.contains('lib-collapsed')) C.setLibTab('effects');
    const kcard = [...document.querySelectorAll('#lib .card')].find(x => x.textContent === 'Green screen key');
    let u1 = C.hist.undo.length; if (kcard) kcard.click();
    ck.libKey = !!kcard && S.clips.find(k => k.id === gy.id).props.fxKey === 60 && C.hist.undo.length === u1 + 1
      && [...document.querySelectorAll('#insp label')].some(l => l.textContent === 'Key colour');
    C.setLibTab('filters'); if (document.body.classList.contains('lib-collapsed')) C.setLibTab('filters');
    const names = [...document.querySelectorAll('#lib .card')].map(x => x.textContent);
    const warm = [...document.querySelectorAll('#lib .card')].find(x => x.textContent === 'Warm'); u1 = C.hist.undo.length; if (warm) warm.click();
    ck.libFilters = ['Teal & orange', 'Warm', 'Cool', 'Faded film'].every(n => names.includes(n)) && S.clips.find(k => k.id === gy.id).props.temp > 0 && C.hist.undo.length === u1 + 1;
    C.setLibTab('media');
    // Inspector: Simple shows temperature / tint / vibrance; Advanced adds lift / gamma / gain
    C.setMode(true); C.select(null); C.select(gy.id); C.renderInspector(true);
    const has = (l) => !!document.querySelector(`#insp input[aria-label="${l} value"]`);
    const simpleRows = has('Temperature') && has('Tint') && has('Vibrance') && !has('Lift (shadows)');
    C.setMode(false); C.renderInspector(true); const advRows = has('Lift (shadows)') && has('Gamma (mids)') && has('Gain (highlights)') && has('Brightness');
    C.setMode(true);
    ck.inspector = simpleRows && advRows;
    reset(); C.setPlayhead(60);
    K.ok = Object.values(ck).every(Boolean);
    }
    // compositing: aspect modes, rounded / feathered box, clip-relative wipe / iris / clock, whip, dissolve + push between adjacent clips
    {
    const C = cutroom, S = C.state, X = out.compositing = { checks: {} }, ck = X.checks, cvs = document.querySelector('#cv');
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const vids = S.tracks.filter(t => t.kind === 'video'), W = S.settings.w, H = S.settings.h;
    const px = (x, y) => [...cvs.getContext('2d').getImageData(x, y, 1, 1).data];
    const solid = (tr, color, start, dur, props = {}) => { C.setPlayhead(0); C.addGenerated('solid', { color, ...props }); const k = S.clips[S.clips.length - 1]; k.track = tr.id; k.start = start; k.dur = dur; C.commit(); C.select(null); return k; };   // no selection outline in the pixels
    const at = (t) => { C.setPlayhead(t); C.drawFrame(); };
    C.markIO(null);
    // aspect mode: a square picture fits (±540), fills (±960) or stretches; keyframed / typed scale stays relative to the mode
    const sq = document.createElement('canvas'); sq.width = sq.height = 200; const sqg = sq.getContext('2d'); sqg.fillStyle = '#ff0000'; sqg.fillRect(0, 0, 200, 200);
    const sqF = await new Promise(r => sq.toBlob(b => r(new File([b], 'square.png', { type: 'image/png' }))));
    const [sqM] = await lim(C.importFiles([sqF]), 15000, 'import square');
    reset(); let ik = C.addMediaClip(sqM, vids[0].id, 0); ik.start = 0; ik.dur = 1; C.commit(); at(0.5);
    const fitPx = px(W / 2 + 700, H / 2)[0];
    C.select(ik.id); C.renderInspector(true); const u0 = C.hist.undo.length;
    const fillBtn = [...document.querySelectorAll('#insp button')].find(b => b.textContent === 'Fill'); if (fillBtn) fillBtn.click();
    ik = S.clips.find(k => k.id === ik.id); at(0.5); const fillPx = px(W / 2 + 700, H / 2)[0];
    ck.fitFill = fitPx < 10 && fillPx > 240 && ik.props.fitMode === 'fill' && C.hist.undo.length === u0 + 1;
    ik.props.scale = 50; C.commit(); at(0.5); ck.fillRelative = px(W / 2 + 400, H / 2)[0] > 240 && px(W / 2 + 520, H / 2)[0] < 10;   // 50 % of fill = ±480
    const sf = C.fitFactors('stretch', W, H, 200, 200); ck.stretch = sf[0] === W / 200 && sf[1] === H / 200;
    ik.props.scale = 100; ik.props.fitMode = 'stretch'; C.commit(); at(0.5); ck.stretchDraw = px(W - 3, H - 3)[0] > 240 && C.hitClipAt(W / 2 - 3, H / 2 - 3) === ik;
    C.setMode(false); C.renderInspector(true);
    ck.inspectorRows = !!document.querySelector('#insp input[aria-label="Corners % value"]') && !!document.querySelector('#insp input[aria-label="Edge feather px value"]')
      && [...document.querySelectorAll('#insp label')].some(l => l.textContent === 'Aspect');
    C.setMode(true);
    // older clips without the new props: fit, square corners, no feather, wipe left → right
    for (const k of ['fitMode', 'radius', 'feather', 'transDir']) delete ik.props[k];
    C.normalizeClips(); ck.oldProject = ik.props.fitMode === 'fit' && ik.props.radius === 0 && ik.props.feather === 0 && ik.props.transDir === 'right';
    // rounded corners and feathered edge on a full-frame solid
    reset(); const rs = solid(vids[0], '#ff0000', 0, 1, { radius: 50 }); at(0.5);
    X.rounded = [px(4, 4)[0], px(W / 2, 3)[0], px(W / 2, H / 2)[0]]; ck.rounded = X.rounded[0] < 10 && X.rounded[1] > 240 && X.rounded[2] > 240;
    rs.props.radius = 0; rs.props.feather = 40; C.commit(); at(0.5); X.feather = [px(1, H / 2)[0], px(40, H / 2)[0], px(160, H / 2)[0]];
    ck.feather = X.feather[0] < 40 && X.feather[1] > 60 && X.feather[1] < 200 && X.feather[2] > 245;
    // iris on a small clip in a corner: centred on the clip, not the frame
    reset(); solid(vids[0], '#ff0000', 0, 2, { scale: 30, x: 600, fadeIn: 1, transIn: 'iris' }); at(0.3);
    ck.irisOnClip = px(W / 2 + 600, H / 2)[0] > 240 && px(W / 2 + 600 + 200, H / 2 + 120)[0] < 10;
    // wipe direction, clock wipe, whip
    reset(); const wk = solid(vids[0], '#ff0000', 0, 2, { fadeIn: 1, transIn: 'wipe', transDir: 'left' }); at(0.5);
    ck.wipeLeft = px(W / 4, H / 2)[0] < 10 && px(W * 3 / 4, H / 2)[0] > 240;
    wk.props.transIn = 'clock'; C.commit(); at(0.25);
    ck.clock = px(W * 3 / 4, H / 4)[0] > 240 && px(W / 4, H / 4)[0] < 10 && px(W * 3 / 4, H * 3 / 4)[0] < 10;
    wk.props.transIn = 'whip'; wk.props.transDir = 'right'; C.commit(); const wp = C.clipPose(wk, 0.5, W, H); at(0.5);
    ck.whip = wp.whip && Math.abs(wp.x - W / 2 + W / 2) < 1;
    // push and dissolve between a red and a blue solid on one track (preview)
    reset(); solid(vids[0], '#ff0000', 0, 1); const bl = solid(vids[0], '#0000ff', 1, 1, { fadeIn: 1, transIn: 'push' }); at(1.5);
    const pl = px(W / 4, H / 2), pr = px(W * 3 / 4, H / 2); ck.push = pl[2] > 240 && pl[0] < 10 && pr[0] > 240 && pr[2] < 10;
    bl.props.transIn = 'dissolve'; C.commit(); at(1.5); X.dissolvePreview = px(W / 2, H / 2).slice(0, 3);
    ck.dissolvePreview = X.dissolvePreview.every((v, i) => i === 1 ? v < 20 : v > 100 && v < 160);
    // no predecessor: falls back to a fade, one undo step, with a toast
    reset(); const lone = solid(vids[0], '#0000ff', 3, 1); C.select(lone.id); const u1 = C.hist.undo.length;
    const nT = C.applyTrans('dissolve', 'in'); let lone2 = S.clips.find(k => k.id === lone.id);
    const fb = [nT, lone2.props.transIn, lone2.props.fadeIn, [...document.querySelectorAll('.toast')].some(t => /fade was used/.test(t.textContent))];
    C.undo(); lone2 = S.clips.find(k => k.id === lone.id); fb.push(!(lone2.props.fadeIn > 0)); X.fallback = fb;
    ck.fallback = nT === 1 && fb[1] === 'fade' && fb[2] > 0 && fb[3] && fb[4];
    C.setLibTab('trans'); if (document.body.classList.contains('lib-collapsed')) C.setLibTab('trans');
    const tn = [...document.querySelectorAll('#lib .card')].map(x => x.textContent); C.setLibTab('media');
    ck.library = ['Cross-dissolve', 'Push', 'Clock wipe', 'Whip pan'].every(n => tn.some(t => t.startsWith(n)));
    // Fast export: a red video (0.5 s of a 1 s file, so it has handle) dissolving into blue; the midpoint is purple
    reset(); solid(vids[0], '#ff0000', 0, 1);
    const red = await lim(C.exportFast(4e6, () => {}), 60000, 'export red');
    const [redM] = await lim(C.importFiles([new File([red.blob], 'red.mp4', { type: 'video/mp4' })]), 20000, 'import red');
    reset(); const rv = C.addMediaClip(redM, vids[0].id, 0); rv.start = 0; rv.in = 0; rv.dur = 0.5; C.commit();
    solid(vids[0], '#0000ff', 0.5, 1, { fadeIn: 0.4, transIn: 'dissolve' });
    ck.tailTimes = Math.abs(C.tailSrcT(rv, 0.7) - 0.7) < 1e-6 && C.tailsAt(0.7).has(rv.id) && !C.tailsAt(1).has(rv.id);
    const held = { ...rv, in: 0.5 }; ck.tailHeld = Math.abs(C.tailSrcT(held, 0.7) - (redM.dur - 1 / S.settings.fps)) < 1e-6;
    const dx = await lim(C.exportFast(4e6, () => {}), 60000, 'export dissolve');
    const i4 = await C.mp4Open(dx.blob), s4 = new C.Mp4Source(i4), dc = document.createElement('canvas'); dc.width = W; dc.height = H; const dg = dc.getContext('2d', { willReadFrequently: true });
    const f4 = await lim(s4.frameAt(0.7), 15000, 'decode dissolve'); dg.drawImage(f4.img, 0, 0); X.dissolveExport = [...dg.getImageData(W / 2, H / 2, 1, 1).data].slice(0, 3);
    const f5 = await lim(s4.frameAt(1.2), 15000, 'decode after'); dg.drawImage(f5.img, 0, 0); X.afterExport = [...dg.getImageData(W / 2, H / 2, 1, 1).data].slice(0, 3); s4.close();
    const [dr, dgn, db] = X.dissolveExport; ck.dissolveExport = dr > 80 && db > 80 && dgn < 40 && Math.abs(dr - db) < 70 && X.afterExport[2] > 200 && X.afterExport[0] < 40;
    reset(); C.setPlayhead(60);
    X.ok = Object.values(ck).every(Boolean);
    }
    // text: wrap width, line height, spacing, gradient, rounded box, per-word / per-line animations, layout cache, presets
    {
    const C = cutroom, S = C.state, X = out.text = { checks: {} }, ck = X.checks, cvs = document.querySelector('#cv');
    const reset = () => { S.clips.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const W = S.settings.w, H = S.settings.h, mg = document.createElement('canvas').getContext('2d');
    const at = (t) => { C.setPlayhead(t); C.drawFrame(); };
    const isRed = (d, i) => d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90;
    const redRow = (y, g = cvs.getContext('2d')) => { const d = g.getImageData(0, Math.round(y), W, 1).data; let n = 0, a = -1, b = -1; for (let x = 0; x < W; x++) if (isRed(d, x * 4)) { n++; if (a < 0) a = x; b = x; } return { n, a, b }; };
    const text = (props) => { C.setPlayhead(0); C.addGenerated('text', { color: '#ff0000', shadow: false, size: 120, ...props }); const k = S.clips[S.clips.length - 1]; k.start = 0; C.commit(); C.select(null); return k; };
    const lineY = (k, L, i) => { const lh = k.props.size * k.props.lineHeight, th = lh * L.lines.length; return H / 2 - th / 2 + lh * (i + 0.5); };
    // word wrap: narrower than the text → several lines, red on two separate rows; without a width it is one line
    reset(); const wt = text({ text: 'WRAP WRAP WRAP', boxWidth: 400 }); at(1);
    const L1 = C.textLayout(wt.props, mg), r0 = redRow(lineY(wt, L1, 0)), r1 = redRow(lineY(wt, L1, 1));
    X.wrap = { lines: L1.lines.length, row0: r0.n, row1: r1.n, mw: Math.round(L1.mw) };
    ck.wrapRows = L1.lines.length >= 2 && r0.n > 20 && r1.n > 20 && L1.mw <= 400;
    ck.cache = C.textLayout(wt.props, mg) === L1 && C.textLayout({ ...wt.props, boxWidth: 0 }, mg) !== L1;
    wt.props.boxWidth = 0; C.commit(); at(1); ck.noWrap = C.textLayout(wt.props, mg).lines.length === 1 && redRow(lineY(wt, L1, 0)).n === 0 && redRow(H / 2).n > 20;
    // line height spreads the rows; letter spacing widens the line
    const wide = C.textLayout({ ...wt.props, letterSpacing: 30 }, mg).mw, narrow = C.textLayout(wt.props, mg).mw; ck.spacing = wide > narrow + 30 * 10;
    wt.props.boxWidth = 400; wt.props.lineHeight = 2; C.commit(); at(1); ck.lineHeight = redRow(lineY(wt, L1, 0)).n > 20 && redRow(lineY(wt, L1, 1)).n > 20 && lineY(wt, L1, 1) - lineY(wt, L1, 0) === 240;
    // gradient left → right: red at the left end of the line, blue at the right
    reset(); const gt = text({ text: 'MMMMMM', size: 200, gradOn: true, color: '#ff0000', color2: '#0000ff', gradAngle: 0 }); at(1);
    const gd = cvs.getContext('2d').getImageData(0, H / 2, W, 1).data; let ga = -1, gb = -1; for (let x = 0; x < W; x++) if (gd[x * 4] + gd[x * 4 + 2] > 150) { if (ga < 0) ga = x; gb = x; }
    X.gradient = [[...gd.slice(ga * 4, ga * 4 + 3)], [...gd.slice(gb * 4, gb * 4 + 3)]];
    ck.gradient = ga >= 0 && X.gradient[0][0] > X.gradient[0][2] + 80 && X.gradient[1][2] > X.gradient[1][0] + 80;
    // rounded background box: the box corner is empty, the middle of its left edge is filled
    reset(); const bt = text({ text: 'BOX', bgOn: true, bg: '#00ff00', bgRadius: 200, bgPad: 40 }); at(1);
    const LB = C.textLayout(bt.props, mg), pad = 120 * 0.4, bx0 = W / 2 - LB.mw / 2 - pad, by0 = H / 2 - 120 * 1.2 / 2 - pad * 0.6;
    const gpx = (x, y) => [...cvs.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data];
    X.box = [gpx(bx0 + 3, by0 + 3), gpx(bx0 + 3, H / 2)];
    ck.roundBox = X.box[0][1] < 60 && X.box[1][1] > 200;
    // word pop: early on only the first words are drawn; at the end the whole line is
    reset(); const wp = text({ text: 'AA BB CC DD', anim: 'wordpop' }); at(0.2); const e0 = redRow(H / 2); at(4); const e1 = redRow(H / 2);
    at(0); const e00 = redRow(H / 2); X.wordpop = [e00.n, e0.b, e1.b];
    ck.wordpop = e00.n === 0 && e0.n > 10 && e1.b > e0.b + 100 && C.clipPose(wp, 0.2, W, H).tAnim.mode === 'wordpop';
    // line rise: the second line is not there yet at 0.1 s, and is in place later
    reset(); const lr = text({ text: 'TOP\nBOTTOM', anim: 'linerise' }); const LL = C.textLayout(lr.props, mg);
    at(0.1); const l0 = redRow(lineY(lr, LL, 1)).n; at(3); const l1 = redRow(lineY(lr, LL, 1)).n; X.linerise = [l0, l1];
    ck.linerise = l0 === 0 && l1 > 20;
    // typewriter across wrapped lines: at the start nothing, half-way only the first line
    reset(); const tw = text({ text: 'WRAP WRAP WRAP', boxWidth: 400, anim: 'typewriter' }); const LT = C.textLayout(tw.props, mg);
    const rv = C.clipPose(tw, 0.35, W, H).reveal; at(0.35); X.typewriter = [rv, redRow(lineY(tw, LT, 0)).n, redRow(lineY(tw, LT, LT.lines.length - 1)).n];
    ck.typewriter = rv > 0 && rv < 14 && X.typewriter[1] > 0 && X.typewriter[2] === 0;
    // older text clips get the defaults
    const ok2 = text({ text: 'Old' }); for (const k of ['letterSpacing', 'lineHeight', 'boxWidth', 'gradOn', 'color2', 'gradAngle', 'bgRadius', 'bgPad']) delete ok2.props[k];
    C.normalizeClips(); ck.oldProject = ok2.props.lineHeight === 1.2 && ok2.props.boxWidth === 0 && ok2.props.letterSpacing === 0 && ok2.props.gradOn === false && ok2.props.bgPad === 30;
    // Inspector: wrap and line height in Simple mode, spacing and gradient only in Advanced
    C.select(ok2.id); C.renderInspector(true); const q = (s) => !!document.querySelector(`#insp input[aria-label="${s}"]`);
    const simpleRows = [q('Wrap width px value'), q('Line height value'), !q('Letter spacing value')];
    C.setMode(false); C.renderInspector(true); const advRows = [q('Letter spacing value'), [...document.querySelectorAll('#insp label')].some(l => l.textContent === 'Gradient')];
    C.setMode(true); X.inspector = [...simpleRows, ...advRows]; ck.inspector = X.inspector.every(Boolean);
    // library: new presets and the animation cards
    C.setLibTab('text'); if (document.body.classList.contains('lib-collapsed')) C.setLibTab('text');
    const tc = [...document.querySelectorAll('#lib .card')].map(x => x.textContent);
    C.setLibTab('anim'); const ac = [...document.querySelectorAll('#lib .card')].map(x => x.textContent); C.setLibTab('media');
    ck.library = ['Gradient title', 'Caption box', 'Name tag', 'Spaced subtitle'].every(n => tc.some(t => t.includes(n))) && ['Word pop', 'Line rise', 'Typewriter'].every(n => ac.some(t => t.includes(n)));
    // Fast export: a wrapped line-rise caption is fully on two rows near the end of a 1 s clip, and absent on frame 0
    reset(); const fx = text({ text: 'WRAP WRAP', boxWidth: 400, anim: 'linerise' }); fx.dur = 1; C.commit(); const LF = C.textLayout(fx.props, mg);
    const ex = await lim(C.exportFast(4e6, () => {}), 60000, 'export text');
    const i5 = await C.mp4Open(ex.blob), s5 = new C.Mp4Source(i5), dc = document.createElement('canvas'); dc.width = W; dc.height = H; const dg = dc.getContext('2d', { willReadFrequently: true });
    const f0 = await lim(s5.frameAt(0), 15000, 'decode text 0'); dg.drawImage(f0.img, 0, 0); const x0 = [redRow(lineY(fx, LF, 0), dg).n, redRow(lineY(fx, LF, 1), dg).n];
    const f9 = await lim(s5.frameAt(0.9), 15000, 'decode text 0.9'); dg.drawImage(f9.img, 0, 0); const x9 = [redRow(lineY(fx, LF, 0), dg).n, redRow(lineY(fx, LF, 1), dg).n]; s5.close();
    X.export = { lines: LF.lines.length, f0: x0, f9: x9 }; ck.exportAnim = LF.lines.length === 2 && x0[0] === 0 && x0[1] === 0 && x9[0] > 20 && x9[1] > 20;
    reset(); C.setPlayhead(60);
    X.ok = Object.values(ck).every(Boolean);
    }
    // export features: ranged export, size / rate override, audio only (WAV / M4A), stills at markers, dialog
    {
    const C = cutroom, S = C.state, X = out.exportFeatures = { checks: {} }, ck = X.checks;
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => { t.locked = false; t.muted = false; t.hidden = false; }); C.markIO(null); C.select(null); C.commit(); };
    const tid = (name) => S.tracks.find(t => t.name === name).id, tone = [...C.media.values()].find(m => m.name === 'tone.wav');
    const solid = (t, d, color) => { C.setPlayhead(t); C.addGenerated('solid', { color }); const k = S.clips[S.clips.length - 1]; k.start = t; k.dur = d; C.commit(); return k; };
    const centre = async (src, w, h) => { const cc = document.createElement('canvas'); cc.width = w; cc.height = h; const g = cc.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h); return [...g.getImageData(w / 2, h / 2, 1, 1).data].slice(0, 3); };
    reset(); solid(0, 1.5, '#ff0000'); const blue = solid(1.5, 2.5, '#0000ff'); C.addMediaClip(tone, tid('A1'), 0); C.select(null);
    // ranges: whole, in/out, selection, between markers around the playhead
    C.markIO('in', 1); C.markIO('out', 2.5); C.select(blue.id); S.markers.push(1, 3); C.setPlayhead(2);
    const rg = Object.fromEntries(C.exportRanges().map(r => [r.id, [r.from, r.to]])); X.ranges = rg;
    ck.ranges = rg.all + '' === '0,4' && rg.io + '' === '1,2.5' && rg.sel + '' === '1.5,4' && rg.mk + '' === '1,3';
    // dialog: Range defaults to in/out, audio modes hide size and quality, marker stills button enabled
    C.exportDialog(); const q = (s) => document.querySelector(s), md = q('#exMode');
    const dl = [q('#exRange').value === 'io', !!q('#exMarks') && !q('#exMarks').disabled, /1280×720/.test(q('#exRes').textContent)];
    if (md.querySelector('option[value=fast]')) { md.value = 'fast'; md.dispatchEvent(new Event('change')); q('#exRes').value = '720'; q('#exRes').dispatchEvent(new Event('change')); dl.push(!q('#exResRow').hidden && /1280×720/.test(q('#exOut').textContent) && /Mbps/.test(q('#exQ').selectedOptions[0].textContent)); }
    md.value = 'wav'; md.dispatchEvent(new Event('change')); dl.push(q('#exQRow').hidden && q('#exResRow').hidden && /WAV/.test(q('#exOut').textContent) && /^about \d/.test(q('#exSize').textContent));
    q('#exCancel').click(); dl.push(q('#modal').hidden); X.dialog = dl; ck.dialog = dl.every(Boolean);
    S.markers.length = 0; C.markIO(null); C.select(null); C.commit();
    // ranged Fast export: 1.5 s at 30 fps = 45 frames; frame 0 is sequence 1.0 (red), frame at 1.0 s is sequence 2.0 (blue)
    const r1 = await lim(C.exportFast(4e6, () => {}, null, { from: 1, to: 2.5 }), 60000, 'ranged export');
    const i1 = await C.mp4Open(r1.blob), s1 = new C.Mp4Source(i1);
    const p0 = await centre((await lim(s1.frameAt(0.1), 15000, 'decode r0')).img, 1920, 1080), p1 = await centre((await lim(s1.frameAt(1.0), 15000, 'decode r1')).img, 1920, 1080); s1.close();
    const v1 = document.createElement('video'); v1.muted = true; v1.src = URL.createObjectURL(r1.blob);
    const d1 = await lim(new Promise((ok, no) => { v1.onloadedmetadata = () => ok(v1.duration); v1.onerror = () => no(new Error('player cannot open ranged export')); }), 15000, 'ranged player');
    X.ranged = { frames: r1.stats.frames, dur: +d1.toFixed(2), p0, p1, audio: r1.stats.audio };
    ck.rangedExport = r1.stats.frames === 45 && Math.abs(d1 - 1.5) < 0.1 && p0[0] > 200 && p0[2] < 60 && p1[2] > 200 && p1[0] < 60 && r1.stats.audio;
    // size / rate override: 720p at 25 fps for 1 s = 25 frames of 1280×720
    ck.dims = JSON.stringify(C.exportDims(720)) === '{"w":1280,"h":720}' && JSON.stringify(C.exportDims(0)) === '{"w":1920,"h":1080}' && C.exportBitrate(10e6, 1920, 1080, 30) === 10e6 && C.exportBitrate(10e6, 1280, 720, 30) < 5e6;
    const r2 = await lim(C.exportFast(2e6, () => {}, null, { from: 0, to: 1, w: 1280, h: 720, fps: 25 }), 60000, 'scaled export');
    const i2 = await C.mp4Open(r2.blob), s2 = new C.Mp4Source(i2), f2 = await lim(s2.frameAt(0.5), 15000, 'decode scaled');
    X.scaled = { frames: r2.stats.frames, w: f2.w, h: f2.h, px: await centre(f2.img, 1280, 720) }; s2.close();
    ck.scaledExport = r2.stats.frames === 25 && f2.w === 1280 && f2.h === 720 && X.scaled.px[0] > 200;
    // WAV: RIFF header, 48 kHz stereo 16-bit, exactly (to - from) long, and the tone is in it
    const rw = await lim(C.exportAudio('wav', () => {}, null, { from: 0.5, to: 2.5 }), 30000, 'wav export');
    const wb = new DataView(await rw.blob.arrayBuffer()), str = (o) => String.fromCharCode(...[0, 1, 2, 3].map(i => wb.getUint8(o + i)));
    let peak = 0; for (let i = 44; i < Math.min(wb.byteLength, 44 + 48000 * 4); i += 2) peak = Math.max(peak, Math.abs(wb.getInt16(i, true)));
    X.wav = { bytes: rw.blob.size, sr: wb.getUint32(24, true), ch: wb.getUint16(22, true), bits: wb.getUint16(34, true), peak };
    ck.wav = str(0) === 'RIFF' && str(8) === 'WAVE' && str(36) === 'data' && wb.getUint32(4, true) === rw.blob.size - 8 && wb.getUint32(40, true) === 2 * 48000 * 4
      && rw.blob.size === 44 + 2 * 48000 * 4 && X.wav.sr === 48000 && X.wav.ch === 2 && X.wav.bits === 16 && peak > 3000 && rw.ext === 'wav';
    // M4A: ftyp 'M4A ', no video track, opens in <audio> with the range's duration
    const rm = await lim(C.exportAudio('m4a', () => {}, null, { from: 0, to: 2 }), 30000, 'm4a export');
    const head = new Uint8Array(await rm.blob.slice(0, 12).arrayBuffer()), brand = String.fromCharCode(...head.slice(8, 12));
    const au = document.createElement('audio'); au.src = URL.createObjectURL(rm.blob);
    const da = await lim(new Promise((ok, no) => { au.onloadedmetadata = () => ok(au.duration); au.onerror = () => no(new Error('audio element cannot open the M4A')); }), 15000, 'm4a player');
    let noVideo = false; try { await C.mp4Open(rm.blob); } catch { noVideo = true; }
    X.m4a = { bytes: rm.blob.size, brand, dur: +da.toFixed(3), type: rm.blob.type }; ck.m4a = brand === 'M4A ' && Math.abs(da - 2) < 0.1 && noVideo && rm.ext === 'm4a';
    // stills at markers: one PNG per time, the right frame each
    const st = await lim(C.renderStills([2, 0.5]), 30000, 'stills');
    const px = []; for (const s of st) px.push(await centre(await createImageBitmap(s.blob), 1920, 1080));
    X.stills = { n: st.length, t: st.map(s => s.t), px }; ck.stills = st.length === 2 && st[0].t === 0.5 && px[0][0] > 200 && px[1][2] > 200 && st.every(s => s.blob.type === 'image/png') && !C.playing;
    // an empty range is refused; nothing is left running
    let e1 = ''; try { await C.exportFast(4e6, () => {}, null, { from: 2, to: 2 }); } catch (e) { e1 = e.message; }
    let e2 = 'ok'; try { await lim(C.exportAudio('wav', () => {}, null, { from: 3.5 }), 30000, 'wav tail'); } catch (e) { e2 = e.message; }
    ck.emptyRange = /range is empty/.test(e1) && e2 === 'ok';
    reset(); C.setPlayhead(0);
    X.ok = Object.values(ck).every(Boolean);
    }
    // audio tools: normalize, dB readout, fade curves, clean voice chain, track mixer
    {
    const C = cutroom, S = C.state, X = out.audioTools = { checks: {} }, ck = X.checks, q = (s) => document.querySelector(s);
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => { t.locked = false; t.muted = false; delete t.gain; }); C.markIO(null); C.select(null); C.commit(); };
    const a1 = S.tracks.find(t => t.name === 'A1').id;
    const wav = (amp, name) => {                                   // 2 s, 330 Hz, mono 22.05 kHz at amp (0–1)
      const sr = 22050, n = sr * 2, b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
      d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.round(Math.sin(i / sr * 2 * Math.PI * 330) * amp * 32767), true);
      return new File([b], name, { type: 'audio/wav' });
    };
    const wavPeak = async (blob) => { const v = new DataView(await blob.arrayBuffer()); let p = 0; for (let i = 44; i < v.byteLength; i += 2) p = Math.max(p, Math.abs(v.getInt16(i, true))); return p / 32767; };
    const db = (x) => 20 * Math.log10(x);
    const [quiet, tiny] = await lim(C.importFiles([wav(0.3, 'quiet.wav'), wav(0.03, 'tiny.wav')]), 15000, 'import tones');
    await lim(C.queuePeaks(quiet), 15000, 'peaks');
    reset();
    // normalize: a −10.5 dBFS tone is raised so the exported peak is −1 dBFS (±1 dB), in one undo step
    const k = C.addMediaClip(quiet, a1, 0); C.select(null);
    const vol = () => C.state.clips.find(x => x.id === k.id).props.volume;   // undo replaces clip objects: look up by id
    const n = await C.normalizeVol([k]), kk = C.state.clips.find(x => x.id === k.id);
    X.peakIn = +C.clipPeak(kk).toFixed(3); X.volume = kk.props.volume;
    C.undo(); const oneStep = vol() === 100; C.redo(); const back = vol() === X.volume;
    const pe = await wavPeak((await lim(C.exportAudio('wav', () => {}, null, { from: 0, to: 2 }), 30000, 'norm wav')).blob);
    X.exportedDb = +db(pe).toFixed(2);
    ck.normalize = n === 1 && Math.abs(X.exportedDb + 1) <= 1 && oneStep && back;
    // cap: a −30 dBFS tone stops at +12 dB (400 %)
    const t2 = C.addMediaClip(tiny, S.tracks.find(t => t.name === 'A2').id, 0); await C.normalizeVol([t2]);
    ck.cap = C.state.clips.find(x => x.id === t2.id).props.volume === 400;
    C.state.clips.splice(C.state.clips.findIndex(x => x.id === t2.id), 1); C.commit();
    // dB readout next to the percent; Advanced allows 400 %, Simple 200 %
    C.select(k.id); C.renderInspector(true);
    const volR = () => q('#insp input[aria-label="Volume %"]'), unit = volR() && volR().closest('.prow').querySelector('label .unit');
    X.dbText = unit && unit.textContent;
    const simpleMax = volR() && volR().max;
    C.setMode(false); C.renderInspector(true);
    const advMax = volR() && volR().max, curveSel = [...document.querySelectorAll('#insp label')].some(l => l.textContent === 'Fade curve');
    const nb = [...document.querySelectorAll('#insp button')].find(b => b.textContent === 'Normalize');
    const slider = q('.row.audio .thead .tgain'), sliderShown = !!slider && getComputedStyle(slider).display !== 'none';
    C.setMode(true); C.renderInspector(true);
    const sliderHidden = getComputedStyle(q('.row.audio .thead .tgain')).display === 'none';
    ck.dbReadout = /^\+9\.\d dB$/.test(X.dbText || '') && C.fmtDb(100) === '0.0 dB' && C.fmtDb(50) === '−6.0 dB' && C.fmtDb(0) === '−∞ dB' && simpleMax === '200' && advMax === '400' && !!nb;
    // fade curves: half way through a 1 s fade in
    const fk = C.state.clips.find(x => x.id === k.id); fk.props.fadeIn = 1;
    const ff = (cv) => { fk.props.fadeCurve = cv; return +C.fadeFactor(fk, 0.5).toFixed(3); };
    X.curves = [ff('linear'), ff('equal-power'), ff('smooth')]; fk.props.fadeIn = 0; fk.props.fadeCurve = 'linear';
    ck.fadeCurve = X.curves + '' === '0.5,0.707,0.5' && +C.fadeFactor({ start: 0, dur: 2, props: { fadeIn: 1, fadeCurve: 'smooth' } }, 0.25).toFixed(3) === 0.156 && curveSel;
    // clean voice: the export chain matches cleanNodes; a 1 kHz high-pass cuts the 330 Hz tone well down
    const nodes = C.cleanNodes(new OfflineAudioContext(1, 1, 48000), { hpf: 80, clean: true });
    const mixPk = async () => { const b = (await lim(C.mixAudioOffline(2), 20000, 'mix')).buf.getChannelData(0); let p = 0; for (let i = 4800; i < b.length - 4800; i++) p = Math.max(p, Math.abs(b[i])); return p; };
    const base = await mixPk(); fk.props.hpf = 1000; const hp = await mixPk(); fk.props.hpf = 0; fk.props.clean = true; const cl = await mixPk(); fk.props.clean = false;
    X.clean = { base: +base.toFixed(3), hp: +hp.toFixed(3), comp: +cl.toFixed(3) };
    ck.clean = nodes.length === 2 && nodes[0].type === 'highpass' && nodes[1] instanceof DynamicsCompressorNode && C.cleanNodes(new OfflineAudioContext(1, 1, 48000), { hpf: 0, clean: false }).length === 0
      && hp < base * 0.3 && Math.abs(cl - base) > 0.02 && C.normalizeClips && 'hpf' in fk.props;
    // track mixer: A1 at 50 % halves the mix (−6 dB), one undo step, refused on a locked track; older tracks without gain = 100 %
    C.commit(); const okSet = C.setTrackGain(a1, 50), half = await mixPk(), tg = () => C.state.tracks.find(t => t.id === a1).gain;
    C.undo(); const gUndo = tg() === undefined; C.redo(); const gRedo = tg() === 50;
    C.state.tracks.find(t => t.id === a1).locked = true; const refused = !C.setTrackGain(a1, 80); C.state.tracks.find(t => t.id === a1).locked = false;
    X.mixer = { half: +half.toFixed(3), base: X.clean.base };
    ck.mixer = okSet && refused && gUndo && gRedo && Math.abs(half / base - 0.5) < 0.02 && C.trackGain({ kind: 'audio' }) === 1 && C.trackGain({ kind: 'audio', gain: 150 }) === 1.5 && sliderShown && sliderHidden;
    // older clips without the new props: fadeFactor / cleanNodes treat them as linear / off
    ck.compat = C.fadeFactor({ start: 0, dur: 2, props: { fadeIn: 1 } }, 0.5) === 0.5 && C.cleanNodes(new OfflineAudioContext(1, 1, 48000), {}).length === 0;
    reset(); C.setPlayhead(0);
    X.ok = Object.values(ck).every(Boolean);
    }
    // media management: duplicate import, rename, usage badge, search / sort, relink missing media, remove unused
    {
    const C = cutroom, S = C.state, X = out.mediaMgmt = { checks: {} }, ck = X.checks, q = (s) => document.querySelector(s);
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const a1 = S.tracks.find(t => t.name === 'A1').id;
    const wavBytes = (secs, hz) => {                               // mono 22.05 kHz tone
      const sr = 22050, n = Math.round(sr * secs), b = new ArrayBuffer(44 + n * 2), d = new DataView(b), w = (o, s) => { for (let i = 0; i < s.length; i++) d.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); d.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
      d.setUint32(24, sr, true); d.setUint32(28, sr * 2, true); d.setUint16(32, 2, true); d.setUint16(34, 16, true); w(36, 'data'); d.setUint32(40, n * 2, true);
      for (let i = 0; i < n; i++) d.setInt16(44 + i * 2, Math.round(Math.sin(i / sr * 2 * Math.PI * hz) * 8000), true);
      return b;
    };
    const bytes = wavBytes(2, 440), mk = (name, b = bytes, lm = 1700000000000) => new File([b], name, { type: 'audio/wav', lastModified: lm });
    reset();
    // duplicate: same name + size + modified time reuses the first item
    const [d1] = await lim(C.importFiles([mk('dup.wav')]), 15000, 'import dup 1'); const n0 = C.media.size;
    const [d2] = await lim(C.importFiles([mk('dup.wav')]), 15000, 'import dup 2'); const n1 = C.media.size;
    const [d3] = await lim(C.importFiles([mk('dup.wav', bytes, 1700000009999)]), 15000, 'import dup 3');   // different time: a new item
    ck.duplicate = !!d1 && d2 === d1 && n1 === n0 && C.media.size === n0 + 1 && !!d3 && d3 !== d1 && typeof d1.added === 'number' && d1.mtime === 1700000000000;
    if (!ck.duplicate) X.dupDebug = ({ d1: !!d1, same: d2 === d1, n0, n1, size: C.media.size, d3: !!d3, d3new: d3 !== d1, added: d1 && typeof d1.added, mtime: d1 && d1.mtime, fileLM: mk('x.wav').lastModified });
    // rename: the clip still named after the media follows, one undo step
    const k = C.addMediaClip(d1, a1, 0), kid = k.id, clip = () => S.clips.find(c => c.id === kid);
    const renamed = C.renameMedia(d1.id, 'renamed.wav');
    const nameNow = clip().name; C.undo(); const nameUndo = clip().name; C.redo();
    ck.rename = renamed && C.media.get(d1.id).name === 'renamed.wav' && nameNow === 'renamed.wav' && nameUndo === 'dup.wav' && clip().name === 'renamed.wav';
    // bin: used badge, select clips, search, sort
    C.renderBin();
    const item = (id) => q(`#bin .binItem[data-id="${CSS.escape(id)}"]`);
    X.badge = item(d1.id) && item(d1.id).querySelector('.use').textContent; X.badge3 = item(d3.id) && item(d3.id).querySelector('.use').textContent;
    C.select(null); const nSel = C.selectUses(d1.id);
    C.binQ = 'renamed'; C.renderBin(); const shown = [...document.querySelectorAll('#bin .binItem')].map(e => e.dataset.id);
    C.binQ = 'zz-none'; C.renderBin(); const none = !q('#bin .binItem') && /No media matches/.test(q('#bin').textContent);
    C.binQ = ''; const sortKeep = C.binSort; C.binSort = 'name'; const names = C.binList().map(m => m.name); C.binSort = sortKeep; C.renderBin();
    ck.bin = X.badge === 'used ×1' && X.badge3 === 'unused' && nSel === 1 && C.selIds.join() === kid && shown.length === 1 && shown[0] === d1.id && none
      && names.join('|') === [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).join('|') && !!q('#binSort') && !!q('#binQ') && !!q('#binUnused');
    // missing media: a placeholder with Relink…, a context-menu entry, and relinkMedia restores the clip under the same id
    const lost = C.media.get(d1.id); C.media.delete(d1.id); C.commit(); C.renderBin();
    const ph = item(d1.id), phOk = !!ph && ph.classList.contains('missing') && !!ph.querySelector('button.relink') && C.missingMedia().get(d1.id)?.kind === 'audio';
    const ce = q(`.clip[data-id="${kid}"]`); let menuOk = false;
    if (ce) { const r = ce.getBoundingClientRect(); ce.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 5, clientY: r.top + 5 }));
      menuOk = [...document.querySelectorAll('.ctx .ctxitem')].some(e => e.textContent.startsWith('Relink missing media')); document.querySelectorAll('.ctx').forEach(m => m.remove()); }
    const toastsBefore = document.querySelectorAll('#toasts > *').length;
    const short = await lim(C.relinkMedia(d1.id, mk('short.wav', wavBytes(1, 440))), 15000, 'relink short');
    const warned = [...document.querySelectorAll('#toasts > *')].slice(toastsBefore).some(e => /blank/.test(e.textContent));
    const good = await lim(C.relinkMedia(d1.id, mk('found.wav', wavBytes(2, 440), 1700000005000)), 15000, 'relink');
    C.renderBin(); const lbl = q(`.clip[data-id="${kid}"]`);
    URL.revokeObjectURL(lost.url);
    ck.relink = phOk && menuOk && !!short && warned && !!good && good.id === d1.id && C.media.get(d1.id) === good && Math.abs(good.dur - 2) < 0.05
      && !C.missingMedia().size && !item(d1.id).classList.contains('missing') && !!lbl && !/\[missing\]/.test(lbl.textContent) && clip().mediaId === d1.id;
    // remove unused: d3 goes, the used item stays; undo-safe through the tombstones
    const removed = C.removeUnused(false);
    ck.removeUnused = removed >= 1 && !C.media.has(d3.id) && C.media.has(d1.id) && C.removeUnused(false) === 0;
    // older records without added / mtime still sort and never count as duplicates
    ck.compat = C.findDup(new File([bytes], 'x.wav')) === null && C.binList().every(m => typeof m.name === 'string');
    reset(); C.renderBin();
    X.ok = Object.values(ck).every(Boolean);
    }
    // ── After Effects-style layers: 3D, blend, masks, adjustment layers, extra effects, 3D text, curves, graph editor, resizers ──
    {
    const C = cutroom, S = C.state, X = out.aeLayers = { checks: {} }, ck = X.checks;
    const cvs = document.getElementById('cv'), g2 = cvs.getContext('2d'), W = cvs.width, H = cvs.height;
    const reset = () => { S.clips.length = 0; S.markers.length = 0; S.tracks.forEach(t => t.locked = false); C.select(null); C.commit(); };
    const pxAt = (x, y) => [...g2.getImageData(Math.round(x), Math.round(y), 1, 1).data];
    const last = () => S.clips[S.clips.length - 1];
    X.webgl = !!gl3(); X.glErr = GL3.err || null;
    try { const t = document.createElement('canvas'); X.glRaw = !!t.getContext('webgl'); X.gl2Raw = !!document.createElement('canvas').getContext('webgl2'); } catch (e) { X.glRaw = String(e); }
    reset(); C.setPlayhead(0.5);
    C.addGenerated('solid', { color: '#ff0000' }); C.addGenerated('solid', { color: '#0000ff', scale: 50 }); const top = last();
    C.select(null); C.drawFrame(); const flatEdge = pxAt(W * 0.27, H / 2);
    top.props.rotY = 60; C.commit(); C.drawFrame();                // turned 60°: the blue plane gets narrower
    const turned = pxAt(W * 0.27, H / 2), centre = pxAt(W / 2, H / 2);
    ck.turn3d = flatEdge[2] > 200 && turned[0] > 200 && turned[2] < 60 && centre[2] > 200;
    top.props.rotY = 0; top.props.z = 2000; C.commit(); C.drawFrame();   // pushed away: smaller
    const far = pxAt(W * 0.3, H / 2); ck.depth = far[0] > 200 && far[2] < 60 && pxAt(W / 2, H / 2)[2] > 200; top.props.z = 0;
    top.props.blend = 'multiply'; C.commit(); C.drawFrame(); const mul = pxAt(W / 2, H / 2);
    top.props.blend = 'screen'; C.commit(); C.drawFrame(); const scr = pxAt(W / 2, H / 2);
    ck.blend = mul[0] < 30 && mul[1] < 30 && mul[2] < 30 && scr[0] > 200 && scr[2] > 200; top.props.blend = 'normal';
    top.props.maskShape = 'ellipse'; top.props.maskW = 50; top.props.maskH = 50; C.commit(); C.drawFrame();
    const mc = pxAt(W / 2, H / 2), mo = pxAt(W * 0.27, H * 0.27);
    top.props.maskInvert = true; C.commit(); C.drawFrame(); const ic = pxAt(W / 2, H / 2), io = pxAt(W * 0.27, H * 0.27);
    ck.mask = mc[2] > 200 && mo[0] > 200 && mo[2] < 60 && ic[0] > 200 && ic[2] < 60 && io[2] > 200;
    top.props.maskShape = 'none'; top.props.maskInvert = false;
    C.addGenerated('adjust'); const adj = last(); adj.props.gray = 100; C.commit(); C.drawFrame();   // grayscale over everything below
    const gp = pxAt(W * 0.1, H * 0.1);
    ck.adjust = adj.type === 'adjust' && Math.abs(gp[0] - gp[1]) < 12 && Math.abs(gp[1] - gp[2]) < 12 && gp[0] > 20;
    // drop shadow, stroke, and the rest render without errors
    reset(); C.addGenerated('solid', { color: '#ffffff', scale: 40 }); const s1 = last(); C.select(null); C.drawFrame(); const before = pxAt(W * 0.72, H / 2);
    Object.assign(s1.props, { fxShadow: 100, shadowDist: 120, shadowAngle: 0, shadowBlur: 0, shadowColor: '#00ff00' }); C.commit(); C.drawFrame();
    const sh = pxAt(W * 0.72, H / 2); ck.shadow = before[1] < 30 && sh[1] > 150 && sh[0] < 80; s1.props.fxShadow = 0;
    Object.assign(s1.props, { fxStrokeW: 20, fxStrokeColor: '#ff0000' }); C.commit(); C.drawFrame();
    const st = pxAt(W * 0.70 + 6 * W / 1920, H / 2); ck.stroke = st[0] > 200 && st[1] < 80; s1.props.fxStrokeW = 0;
    let fxErr = null; try { for (const [k, v] of [['fxRgb', 80], ['fxWave', 80], ['fxLeak', 80], ['fxGradOv', 80]]) { s1.props[k] = v; C.commit(); C.drawFrame(); s1.props[k] = 0; } } catch (e) { fxErr = String(e); }
    X.fxErr = fxErr; ck.moreFx = !fxErr;
    Object.assign(s1.props, { fxGradOv: 100, gradOvA: '#0000ff', gradOvB: '#0000ff' }); C.commit(); C.drawFrame(); const go = pxAt(W / 2, H / 2);
    ck.gradOv = go[2] > 200 && go[0] < 120; s1.props.fxGradOv = 0;
    // 3D text: the side colour shows only when extruded
    reset(); C.addGenerated('text', { text: 'III', size: 300, color: '#ffffff', shadow: false, ex3d: true, exDepth: 80, exAngle: 0, exSlant: 100, exColor: '#00ff00', exShade: 0 });
    const tx = last(); C.select(null); C.drawFrame();
    const countGreen = () => { const d = g2.getImageData(0, 0, W, H).data; let n = 0; for (let i = 0; i < d.length; i += 16) if (d[i + 1] > 150 && d[i] < 90 && d[i + 2] < 90) n++; return n; };
    const gOn = countGreen(); tx.props.ex3d = false; C.commit(); C.drawFrame(); const gOff = countGreen();
    X.green = [gOn, gOff]; ck.extrude = gOn > 200 && gOff === 0;
    Object.assign(tx.props, { weight: 300, caps: true, text: 'abc' });
    ck.textOpts = textFont(tx.props).startsWith('300 ') && textLayout(tx.props, g2).lines[0].s === 'ABC';
    // custom keyframe curve: an overshoot passes the end value, and survives undo / redo snapshots
    reset(); C.addGenerated('solid', { color: '#123456' }); const kc = last(), kid = kc.id;
    kc.kf = { x: [{ t: 0, v: 0, e: [0.3, 0, 0.3, 1.6] }, { t: 2, v: 100 }] }; C.commit();
    let mx = -Infinity; for (let i = 0; i <= 40; i++) mx = Math.max(mx, C.val(kc, 'x', kc.start + i * 0.05));
    ck.curve = mx > 100.5 && Math.abs(C.val(kc, 'x', kc.start + 2) - 100) < 1e-6 && Math.abs(easeFn([0, 0, 1, 1])(0.37) - 0.37) < 1e-4;
    C.addGenerated('text'); C.undo(); const kc2 = S.clips.find(k => k.id === kid);
    ck.curveUndo = !!kc2 && Array.isArray(kc2.kf.x[0].e) && kc2.kf.x[0].e[3] === 1.6;
    // graph editor: opens on the animated property, presets set the easing, Done closes
    C.select(kid); graphEditor(kc2);
    const geOk = !document.querySelector('#modal').hidden && !!document.querySelector('#geCv') && document.querySelectorAll('#geProp option').length === 1 && document.querySelectorAll('#gePresets button').length === 7;
    [...document.querySelectorAll('#gePresets button')].find(b => b.textContent === 'Hold').click();
    const held = S.clips.find(k => k.id === kid).kf.x[0].e === 'hold';
    document.querySelector('#geClose').click(); ck.graph = geOk && held && document.querySelector('#modal').hidden;
    // resizers: double-click resets a stored size; they are keyboard-focusable
    setLayoutVar('--binW', 480); const wasSet = document.body.style.getPropertyValue('--binW') === '480px';
    document.getElementById('splitL').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    ck.resetSplit = wasSet && document.body.style.getPropertyValue('--binW') === '' && !('--binW' in JSON.parse(localStorage.getItem('cutroom.layout') || '{}')) && document.getElementById('splitL').tabIndex === 0;
    // Inspector: the new sections are there for a text clip
    reset(); C.addGenerated('text'); C.select(last().id); C.renderInspector(true);
    const titles = [...document.querySelectorAll('#insp .sec h4 button')].map(b => b.textContent);
    ck.inspSections = ['3D text', '3D layer', 'Blend & mask', 'Keyframes'].every(t => titles.includes(t));
    reset(); C.renderInspector(true);
    X.ok = Object.values(ck).every(Boolean);
    }
    // ── per-colour saturation (HSL): one colour range changes, the others stay; JS and Rust agree; filters and Inspector ──
    {
    const C = cutroom, S = C.state, X = out.hsl = { checks: {} }, ck = X.checks;
    const mk = () => { const cv2 = document.createElement('canvas'); cv2.width = 64; cv2.height = 8; const g = cv2.getContext('2d', { willReadFrequently: true });
      ['#ff2020', '#2040ff', '#20c040', '#ff9020'].forEach((col, i) => { g.fillStyle = col; g.fillRect(i * 16, 0, 16, 8); }); return g; };
    const at = (g, i) => [...g.getImageData(i * 16 + 8, 4, 1, 1).data];
    const grey = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]) < 4;
    const g1 = mk(); pixelPass(g1, 64, 8, { satBlue: -100 });
    const chroma = (p) => Math.max(p[0], p[1], p[2]) - Math.min(p[0], p[1], p[2]);
    X.blue = [chroma(at(mk(), 1)), chroma(at(g1, 1))];             // ranges blend, so an off-centre blue keeps a trace of colour
    ck.blueToGrey = chroma(at(g1, 1)) < chroma(at(mk(), 1)) * 0.15 && at(g1, 0)[0] === 255 && at(g1, 0)[1] === 32 && !grey(at(g1, 2));
    const g2 = mk(); pixelPass(g2, 64, 8, { satRed: 100 }); const r2 = at(g2, 0), r0 = at(mk(), 0);
    ck.redBoost = (r2[0] - r2[1]) > (r0[0] - r0[1]) && at(g2, 1)[2] === at(mk(), 1)[2];
    ck.neutralSkips = !satOn({}) && !satOn({ satRed: 0 }) && satOn({ satGreen: -5 }) && gradeOn({ satAqua: 10 });
    // Rust core and JavaScript give the same bytes (with grade + key + HSL together)
    if (C.rustCore && C.jsPixelPass) {
      const big = () => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d', { willReadFrequently: true }); const im = g.createImageData(256, 64); let s = 11; for (let i = 0; i < im.data.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; im.data[i] = s >>> 24; } g.putImageData(im, 0, 0); return g; };
      const P = { temp: 20, vibrance: 30, satRed: 40, satGreen: -70, satBlue: 55, satMagenta: -30, fxKey: 40, fxKeyColor: '#00b140' };
      const a = big(), b = big(); C.jsPixelPass(a, 256, 64, P); pixelPass(b, 256, 64, P);
      const da = a.getImageData(0, 0, 256, 64).data, db = b.getImageData(0, 0, 256, 64).data; let diff = 0; for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) diff++;
      X.rustDiff = diff; ck.rustMatches = diff === 0;
    } else { X.rustDiff = 'no rust core'; ck.rustMatches = true; }
    ck.filters = ['Red pop', 'Blue skies', 'Autumn', 'Cyberpunk', 'Muted earth'].every(n => FILTERS.some(f => f[0] === n)) && HSL_KEYS.every(k => k in FILTER_BASE);
    S.clips.length = 0; C.select(null); C.commit(); C.setPlayhead(0); C.addGenerated('solid', { color: '#336699' }); const sc = S.clips[S.clips.length - 1];
    C.select(sc.id); C.renderInspector(true);
    const sec = [...document.querySelectorAll('#insp .sec')].find(s => s.querySelector('h4 button')?.textContent === 'Colour saturation');
    ck.inspector = !!sec && HSL_COLORS.every(([, l]) => !!sec.querySelector(`input[aria-label="${l} value"]`)) && sec.querySelectorAll('.swatch').length === 8;
    S.clips.length = 0; C.select(null); C.commit(); C.renderInspector(true);
    X.ok = Object.values(ck).every(Boolean);
    }
    out.ok =out.booted && out.aeLayers.ok && out.hsl.ok &&out.fast.frames === 90 && out.fast.audio && out.projectFile.roundTrip && out.motionBlur.blurredWidth > out.motionBlur.sharpWidth + 10 && out.editing.ok && out.inspector.ok && out.monitor.ok && out.projectSafety.ok && out.playbackAudio.ok && out.linked.ok && out.keyboard.ok && out.easing.ok && out.inspPower.ok && out.keyColour.ok && out.compositing.ok && out.text.ok && out.exportFeatures.ok && out.audioTools.ok && out.mediaMgmt.ok;
  } catch (e) { out.error = String(e && e.message || e); out.ok = false; }
  return out;
})()
