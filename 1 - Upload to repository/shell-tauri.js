'use strict';
/* Arcanix desktop integration for the Rust (Tauri) shell. Does nothing in a plain browser.
   - The top bar is the window's title bar: drag to move, double-click to maximize, and window buttons on the right.
   - Saving (exports, project files, frames) goes through a native Save dialog and is written by Rust in chunks,
     so even multi-GB exports never need a second copy in memory. Loaded after app.js and shares its scope. */
if (window.__TAURI__) {
  const T = window.__TAURI__, win = T.window.getCurrentWindow(), invoke = T.core.invoke;
  document.body.classList.add('tauri');

  // ---- title bar: drag regions + window buttons ----
  const bar = document.getElementById('topbar');
  const dragEls = [bar, ...bar.querySelectorAll('.tzone, .group, .brand')];
  dragEls.forEach(el => el.setAttribute('data-tauri-drag-region', ''));
  const ICON = {
    min: '<svg viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" stroke-width="1"/></svg>',
    max: '<svg viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>',
    restore: '<svg viewBox="0 0 10 10"><rect x=".5" y="2.5" width="7" height="7" fill="none" stroke="currentColor"/><path d="M2.5 2.5v-2h7v7h-2" fill="none" stroke="currentColor"/></svg>',
    close: '<svg viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1.1"/></svg>',
  };
  const ctl = document.createElement('div'); ctl.id = 'winctl';
  const mk = (id, title, fn) => { const b = document.createElement('button'); b.className = 'wc'; b.id = id; b.title = title; b.innerHTML = ICON[id.slice(2)] || ''; b.onclick = fn; ctl.append(b); return b; };
  mk('wcmin', 'Minimize', () => win.minimize());
  const maxBtn = mk('wcmax', 'Maximize', () => win.toggleMaximize());
  mk('wcclose', 'Close', () => win.close());
  bar.append(ctl);
  const syncMax = async () => { try { const m = await win.isMaximized(); maxBtn.innerHTML = m ? ICON.restore : ICON.max; maxBtn.title = m ? 'Restore' : 'Maximize'; } catch {} };
  win.onResized?.(syncMax); syncMax();

  // ---- saving: native dialog + chunked writes in Rust ----
  const CHUNK = 16 * 1024 * 1024;
  async function saveBlob(blob, name) {
    let path;
    try { path = await invoke('pick_save', { name }); } catch (e) { toast('Could not open the Save dialog: ' + e, 5000); return false; }
    if (!path) { toast('Not saved.', 2000); return false; }
    try {
      for (let off = 0, first = true; off < blob.size || first; off += CHUNK, first = false) {
        const bytes = new Uint8Array(await blob.slice(off, off + CHUNK).arrayBuffer());
        await invoke('write_file', bytes, { headers: { 'x-path': encodeURIComponent(path), 'x-append': first ? '0' : '1' } });
      }
      return true;
    } catch (e) { toast('Saving failed: ' + e, 6000); return false; }
  }
  downloadBlob = function (blob, name) { saveBlob(blob, name); };
  window.cutroom.saveBlob = saveBlob;
}
