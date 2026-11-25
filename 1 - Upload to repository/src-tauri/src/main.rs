//! Arcanix desktop shell (Rust / Tauri). One window running the editor in the system WebView2.
//! No server and no network access: the page is served from inside this executable, and the only
//! things it can ask the shell to do are move / minimize / maximize / close its window and save
//! files to locations the user picked in a Save dialog.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashSet;
use std::fs::OpenOptions;
use std::io::Write;
use std::sync::Mutex;

use tauri::ipc::{InvokeBody, Request};
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

/// Paths the user chose in a Save dialog this session; the page may only write to these.
#[derive(Default)]
struct Allowed(Mutex<HashSet<String>>);

/// Set by FRAMEWRIGHT_SELFTEST=<result file>: run selftest.js in the page, write its JSON result, quit.
struct SelfTest(Option<String>);

/// Show a native Save dialog. Returns the chosen path, or None if cancelled.
#[tauri::command]
async fn pick_save(app: AppHandle, allowed: State<'_, Allowed>, name: String) -> Result<Option<String>, String> {
    let ext = name.rsplit_once('.').map(|(_, e)| e.to_string()).unwrap_or_default();
    let mut dlg = app.dialog().file().set_file_name(&name);
    if !ext.is_empty() && ext.len() <= 12 {
        dlg = dlg.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    let picked = dlg.blocking_save_file().and_then(|p| p.into_path().ok());
    Ok(picked.map(|p| {
        let s = p.to_string_lossy().into_owned();
        allowed.0.lock().unwrap().insert(s.clone());
        s
    }))
}

/// Write one chunk of a file the user picked. The bytes arrive as the raw request body (no JSON / base64),
/// so large exports stream to disk chunk by chunk instead of being held in memory.
/// Headers: x-path = encodeURIComponent(path), x-append = "1" to append, anything else to create / truncate.
#[tauri::command]
fn write_file(allowed: State<'_, Allowed>, request: Request<'_>) -> Result<(), String> {
    let h = request.headers();
    let path = h.get("x-path").and_then(|v| v.to_str().ok()).map(percent_decode).ok_or("missing path")?;
    if !allowed.0.lock().unwrap().contains(&path) {
        return Err("that location was not chosen in a Save dialog".into());
    }
    let append = h.get("x-append").and_then(|v| v.to_str().ok()) == Some("1");
    let InvokeBody::Raw(bytes) = request.body() else { return Err("expected raw bytes".into()) };
    let mut f = OpenOptions::new().create(true).write(true).append(append).truncate(!append).open(&path).map_err(|e| e.to_string())?;
    f.write_all(bytes).map_err(|e| e.to_string())
}

/// The self-test's result: write it where FRAMEWRIGHT_SELFTEST points, then quit.
#[tauri::command]
fn selftest_done(app: AppHandle, st: State<'_, SelfTest>, json: String) {
    if let Some(p) = &st.0 {
        let _ = std::fs::write(p, json);
    }
    app.exit(0);
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("zz"), 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn main() {
    let selftest = std::env::var("FRAMEWRIGHT_SELFTEST").ok().filter(|s| !s.is_empty());
    let testing = selftest.is_some();
    if testing {
        // a fresh, throwaway browser profile so earlier runs' autosave can't affect the result (as the Electron build did)
        let dir = std::env::temp_dir().join("arcanix-selftest-webview");
        let _ = std::fs::remove_dir_all(&dir);
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &dir);
    }
    let mut builder = tauri::Builder::default();
    if !testing {
        // one Arcanix at a time: starting it again brings the open window to the front
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Allowed::default())
        .manage(SelfTest(selftest))
        .invoke_handler(tauri::generate_handler![pick_save, write_file, selftest_done])
        .on_page_load(move |webview, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            if testing {
                let src = serde_json::to_string(include_str!("../../selftest.js")).unwrap();
                let script = format!(
                    "(async () => {{ let out; try {{ out = await (0, eval)({src}); }} catch (e) {{ out = {{ error: String(e && e.message || e) }}; }}\n\
                     out = Object.assign({{}}, out, {{ shell: 'tauri', packaged: true }});\n\
                     await window.__TAURI__.core.invoke('selftest_done', {{ json: JSON.stringify(out, null, 2) }}); }})();"
                );
                let _ = webview.eval(&script);
            } else if let Some(w) = webview.app_handle().get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Arcanix");
}
