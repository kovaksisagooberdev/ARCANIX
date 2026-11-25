'use strict';
// Copies the editor's web files into dist-web/, which Tauri embeds in Arcanix.exe. Run automatically by `tauri build`.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), out = path.join(root, 'dist-web');
const FILES = ['index.html', 'style.css', 'layers.js', 'app.js', 'fastexport.js', 'sounds.js', 'rustcore.js', 'shell-tauri.js'];
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(out, f));
console.log('staged', FILES.length, 'files in dist-web/');
