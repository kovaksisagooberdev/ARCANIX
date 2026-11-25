'use strict';
// The only bridge between the sandboxed page and the shell: recolour the window's title-bar buttons to match the theme.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('arcanixShell', {
  setTitleBar: (color, symbolColor) => ipcRenderer.send('titlebar', String(color), String(symbolColor)),
});
