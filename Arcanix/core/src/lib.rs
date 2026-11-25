//! Arcanix core: the per-pixel and per-sample loops that are too slow in JavaScript.
//! Built for `wasm32-unknown-unknown` with no dependencies; the page passes buffers through linear memory.
//! Every kernel reproduces the JavaScript version bit for bit (same maths in f64, same Uint8ClampedArray rounding),
//! so preview and export look identical whichever path runs.
use std::mem;

/// Reserve `n` bytes for the page to write into. Returns the address in linear memory.
#[no_mangle]
pub extern "C" fn ax_alloc(n: usize) -> *mut u8 {
    let mut v: Vec<u8> = Vec::with_capacity(n.max(1)); let p = v.as_mut_ptr(); mem::forget(v); p
}
/// Release a block from `ax_alloc` (same `n`).
#[no_mangle]
pub unsafe extern "C" fn ax_free(p: *mut u8, n: usize) { drop(Vec::from_raw_parts(p, 0, n.max(1))); }



/// JS Uint8ClampedArray store: clamp to 0..255, round half to even (f64.nearest), NaN -> 0.
#[inline(always)]
fn u8c(v: f64) -> u8 { if !(v > 0.0) { 0 } else { v.min(255.0).round_ties_even() as u8 } }
#[inline(always)] fn libm_floor(v: f64) -> f64 { v.floor() }
#[inline(always)] fn fabs(v: f64) -> f64 { v.abs() }

/// Colour grade + chroma key over RGBA pixels, in place. Mirrors `pixelPass` in app.js.
/// `lut` = 768-byte per-channel table or 0 for no grade. `hue` = 360 saturation factors by hue (per-colour
/// saturation) or 0 for none. `key` != 0 enables the key with ux, uy, k, thr, w, sp.
#[no_mangle]
pub unsafe extern "C" fn ax_pixel_pass(px: *mut u8, len: usize, lut: *const u8, vib: f64, hue: *const f64,
                                       key: u32, ux: f64, uy: f64, k: f64, thr: f64, w: f64, sp: f64) {
    let d = core::slice::from_raw_parts_mut(px, len & !3);
    let l: &[u8; 768] = if lut.is_null() { &[0; 768] } else { &*(lut as *const [u8; 768]) };
    let ht: &[f64; 360] = if hue.is_null() { &[1.0; 360] } else { &*(hue as *const [f64; 360]) };
    let sat = !hue.is_null();
    let graded = !lut.is_null();
    let keyed = key != 0;
    for q in d.chunks_exact_mut(4) {
        let a0 = q[3];
        if a0 == 0 { continue; }
        let (mut r, mut g, mut b);
        if graded {
            r = l[q[0] as usize] as f64; g = l[256 + q[1] as usize] as f64; b = l[512 + q[2] as usize] as f64;
            if vib != 0.0 {
                let mx = r.max(g).max(b); let mn = r.min(g).min(b);
                let kk = 1.0 + vib * (1.0 - (mx - mn) / 255.0); let y = (r + g + b) / 3.0;
                r = y + (r - y) * kk; g = y + (g - y) * kk; b = y + (b - y) * kk;
            }
        } else { r = q[0] as f64; g = q[1] as f64; b = q[2] as f64; }
        if sat {                                                // per-colour saturation, same maths as app.js
            let mx = r.max(g).max(b); let mn = r.min(g).min(b); let dd = mx - mn;
            if dd > 0.0 {
                let h = if mx == r { (g - b) / dd + if g < b { 6.0 } else { 0.0 } } else if mx == g { (b - r) / dd + 2.0 } else { (r - g) / dd + 4.0 };
                let kk = ht[((h * 60.0).floor() as usize).min(359)];
                if kk != 1.0 { let y = 0.299 * r + 0.587 * g + 0.114 * b; r = y + (r - y) * kk; g = y + (g - y) * kk; b = y + (b - y) * kk; }
            }
        }
        if keyed {
            let y = 0.299 * r + 0.587 * g + 0.114 * b; let cb = 0.564 * (b - y); let cr = 0.713 * (r - y);
            let along = cb * ux + cr * uy;
            let m = (along - fabs(cr * ux - cb * uy)) / k;
            let a = if m >= thr { 0.0 } else if m <= thr - w { 1.0 } else { (thr - m) / w };
            if a < 1.0 { q[3] = u8c(a0 as f64 * a); }
            if sp != 0.0 && along > 0.0 {
                let s = sp * along; let cb2 = cb - s * ux; let cr2 = cr - s * uy;
                r = y + 1.403 * cr2; b = y + 1.773 * cb2; g = y - 0.344 * cb2 - 0.714 * cr2;
            }
        }
        q[0] = u8c(r); q[1] = u8c(g); q[2] = u8c(b);
    }
}

/// Waveform peaks for one channel, merged into `out` (n bytes): bucket i covers samples
/// [floor(i*step), floor((i+1)*step)), and out[i] = max(out[i], min(255, ceil(max|s| * 255))). Mirrors `computePeaks`.
#[no_mangle]
pub unsafe extern "C" fn ax_peaks(src: *const f32, len: usize, step: f64, out: *mut u8, n: usize) {
    let s = core::slice::from_raw_parts(src, len); let o = core::slice::from_raw_parts_mut(out, n);
    for i in 0..n {
        let a = libm_floor(i as f64 * step) as usize; let b = (libm_floor((i + 1) as f64 * step) as usize).min(len);
        let mut mx = 0f32; let mut j = a;
        while j < b { let v = s[j]; let v = if v < 0.0 { -v } else { v }; if v > mx { mx = v; } j += 1; }
        let c = mx as f64 * 255.0; let t = libm_floor(c); let q = if c > t { t + 1.0 } else { t };
        let q = if q > 255.0 { 255u8 } else { q as u8 };
        if q > o[i] { o[i] = q; }
    }
}
