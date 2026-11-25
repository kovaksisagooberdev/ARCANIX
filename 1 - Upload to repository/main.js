'use strict';
// Arcanix desktop shell: one window that loads the editor straight from the app's own files.
// No server, no network access; the page runs sandboxed without Node access.
const { app, BrowserWindow, Menu, shell, session, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// FRAMEWRIGHT_SELFTEST=<result file>: run selftest.js in the page, write its JSON result, quit. Used to verify builds.
const SELFTEST = process.env.FRAMEWRIGHT_SELFTEST || '';
if (SELFTEST) app.setPath('userData', path.join(app.getPath('temp'), 'framewright-selftest-' + process.pid));
// The app was first released as "Cutroom". Keep using that data folder so projects saved before the rename still open.
else app.setPath('userData', path.join(app.getPath('appData'), 'Cutroom'));

if (!SELFTEST && !app.requestSingleInstanceLock()) app.quit();

let win = null;
const TITLE_H = 56;                                               // matches #topbar height in style.css
const HEX = /^#[0-9a-f]{6}$/i;
ipcMain.on('titlebar', (e, color, symbolColor) => {
  if (!win || e.sender !== win.webContents || !HEX.test(color) || !HEX.test(symbolColor)) return;
  try { win.setTitleBarOverlay({ color, symbolColor, height: TITLE_H }); win.setBackgroundColor(color); } catch {}
});
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1000, minHeight: 640,
    backgroundColor: '#0e0c16', title: 'Arcanix', show: !SELFTEST, autoHideMenuBar: true,
    // no system title bar: the editor's top bar is the title bar, with the native window buttons drawn over its right end
    titleBarStyle: 'hidden', titleBarOverlay: { color: '#16131f', symbolColor: '#ebe6f7', height: TITLE_H },
    // packaged builds carry the icon inside Arcanix.exe; this file only exists when running from source
    icon: fs.existsSync(path.join(__dirname, 'build', 'icon.ico')) ? path.join(__dirname, 'build', 'icon.ico') : undefined,
    webPreferences: {
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,          // keep playback and real-time export running when the window is covered
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));

  // the editor is a single local page: never navigate away, open any http(s) link in the default browser
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === 'F12') { win.webContents.toggleDevTools(); e.preventDefault(); }
  });
  win.on('closed', () => { win = null; });

  if (SELFTEST) win.webContents.once('did-finish-load', async () => {
    let out;
    try { out = await win.webContents.executeJavaScript(fs.readFileSync(path.join(__dirname, 'selftest.js'), 'utf8'), true); }
    catch (e) { out = { error: String(e && e.message || e) }; }
    out = { ...out, electron: process.versions.electron, chrome: process.versions.chrome, packaged: app.isPackaged };
    try { fs.writeFileSync(SELFTEST, JSON.stringify(out, null, 2)); } catch {}
    app.quit();
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // the only system access the page gets is the microphone (for voiceover); camera, screen, location etc. are refused
  const micOnly = (permission, details) => permission === 'media' && !!details && Array.isArray(details.mediaTypes)
    && details.mediaTypes.length > 0 && details.mediaTypes.every(t => t === 'audio');
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => cb(micOnly(permission, details)));
  createWindow();
});
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
