use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager, State};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// A node in the local markdown file tree.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Vec<FileNode>,
}

/// Pending file path captured from a "open with mdlook" / file-association launch
/// before the frontend is ready to receive it.
#[derive(Default)]
struct PendingFile(Mutex<Option<String>>);

fn is_markdown(path: &Path) -> bool {
    matches!(
        path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()),
        Some(ref e) if e == "md" || e == "markdown" || e == "mdown" || e == "markdn"
    )
}

/// Recursively build a tree of directories and markdown files under `dir`.
/// Hidden entries (starting with '.') and common noise dirs are skipped.
fn build_tree(dir: &Path, depth: usize) -> Vec<FileNode> {
    if depth > 12 {
        return Vec::new();
    }
    let mut dirs: Vec<FileNode> = Vec::new();
    let mut files: Vec<FileNode> = Vec::new();

    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }
        if path.is_dir() {
            let children = build_tree(&path, depth + 1);
            // Only keep directories that contain markdown somewhere.
            if !children.is_empty() {
                dirs.push(FileNode {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_dir: true,
                    children,
                });
            }
        } else if is_markdown(&path) {
            files.push(FileNode {
                name,
                path: path.to_string_lossy().to_string(),
                is_dir: false,
                children: Vec::new(),
            });
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    dirs.extend(files);
    dirs
}

/// Read a markdown folder into a file tree (directories + .md files only).
#[tauri::command]
fn read_md_tree(path: String) -> Result<Vec<FileNode>, String> {
    let p = PathBuf::from(&path);
    if !p.is_dir() {
        return Err(format!("不是有效的文件夹：{path}"));
    }
    Ok(build_tree(&p, 0))
}

/// Read a UTF-8 text file.
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取失败：{e}"))
}

/// Write a UTF-8 text file (used to save edits back to the original file).
#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入失败：{e}"))
}

/// Write a binary file, creating parent directories as needed.
#[tauri::command]
fn write_binary_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败：{e}"))?;
    }
    fs::write(&p, bytes).map_err(|e| format!("写入失败：{e}"))
}

/// Return the file modified timestamp in milliseconds since Unix epoch.
#[tauri::command]
fn file_modified_millis(path: String) -> Result<u128, String> {
    let modified = fs::metadata(&path)
        .map_err(|e| format!("读取文件信息失败：{e}"))?
        .modified()
        .map_err(|e| format!("读取修改时间失败：{e}"))?;
    modified
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .map_err(|e| format!("修改时间异常：{e}"))
}

/// Take (and clear) the pending file path captured at launch, if any.
#[tauri::command]
fn take_pending_file(state: State<'_, PendingFile>) -> Option<String> {
    state.0.lock().ok().and_then(|mut g| g.take())
}

/// Write rich HTML (with a plain-text fallback) to the system clipboard.
/// Needed because WKWebView blocks `navigator.clipboard.write` for rich content,
/// which breaks the "一键复制到公众号" flow in the desktop app.
#[tauri::command]
fn copy_html(app: tauri::AppHandle, html: String, text: Option<String>) -> Result<(), String> {
    app.clipboard()
        .write_html(html, text)
        .map_err(|e| e.to_string())
}

/// Write plain text to the system clipboard.
#[tauri::command]
fn copy_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// Resolve plain CLI-argument paths (Windows/Linux launch) to the first markdown file.
fn first_markdown_arg(args: &[String]) -> Option<String> {
    for raw in args {
        let pb = PathBuf::from(raw);
        if pb.is_file() && is_markdown(&pb) {
            return Some(pb.to_string_lossy().to_string());
        }
    }
    None
}

/// Resolve file-open URLs (macOS "open with" / double-click) to the first markdown file.
/// Uses `to_file_path()` so percent-encoded non-ASCII paths (e.g. 中文目录) decode correctly.
fn first_markdown_url(urls: &[tauri::Url]) -> Option<String> {
    for url in urls {
        if let Ok(pb) = url.to_file_path() {
            if pb.is_file() && is_markdown(&pb) {
                return Some(pb.to_string_lossy().to_string());
            }
        }
    }
    None
}

fn build_menu(app: &tauri::AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let app_menu = SubmenuBuilder::new(app, "mdlook")
        .about(None)
        .separator()
        .hide()
        .hide_others()
        .separator()
        .quit()
        .build()?;

    let file_menu = SubmenuBuilder::new(app, "文件")
        .item(
            &MenuItemBuilder::with_id("new-draft", "新建草稿")
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("open-file", "打开文件…")
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open-folder", "打开文件夹…")
                .accelerator("CmdOrCtrl+Shift+O")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", "保存")
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save-as", "另存为…")
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
        )
        .build()?;

    let export_menu = SubmenuBuilder::new(app, "导出")
        .item(&MenuItemBuilder::with_id("export-md", "Markdown 文件").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("export-html", "HTML").build(app)?)
        .item(&MenuItemBuilder::with_id("export-pure-html", "无样式 HTML").build(app)?)
        .separator()
        .item(&MenuItemBuilder::with_id("export-pdf", "PDF").build(app)?)
        .item(&MenuItemBuilder::with_id("export-png", "PNG 图片").build(app)?)
        .build()?;

    let edit_menu = SubmenuBuilder::new(app, "编辑")
        .undo()
        .redo()
        .separator()
        .cut()
        .copy()
        .paste()
        .select_all()
        .separator()
        .item(
            &MenuItemBuilder::with_id("copy-to-wechat", "复制到公众号")
                .accelerator("CmdOrCtrl+Shift+C")
                .build(app)?,
        )
        .build()?;

    let view_menu = SubmenuBuilder::new(app, "视图")
        .item(
            &MenuItemBuilder::with_id("cycle-view", "切换视图")
                .accelerator("CmdOrCtrl+Shift+P")
                .build(app)?,
        )
        .item(&MenuItemBuilder::with_id("toggle-style-panel", "样式面板").build(app)?)
        .item(&MenuItemBuilder::with_id("open-history", "版本历史").build(app)?)
        .separator()
        .fullscreen()
        .build()?;

    MenuBuilder::new(app)
        .item(&app_menu)
        .item(&file_menu)
        .item(&export_menu)
        .item(&edit_menu)
        .item(&view_menu)
        .build()
}

fn emit_menu_command(app: &tauri::AppHandle, command: &str) {
    let is_supported = matches!(
        command,
        "new-draft"
            | "open-file"
            | "open-folder"
            | "save"
            | "save-as"
            | "copy-to-wechat"
            | "cycle-view"
            | "toggle-style-panel"
            | "open-history"
            | "export-md"
            | "export-html"
            | "export-pure-html"
            | "export-pdf"
            | "export-png"
    );

    if is_supported {
        let _ = app.emit("mdlook://menu-command", command);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .menu(build_menu)
        .on_menu_event(|app, event| {
            emit_menu_command(app, event.id().as_ref());
        })
        .manage(PendingFile::default())
        .invoke_handler(tauri::generate_handler![
            read_md_tree,
            read_text_file,
            write_text_file,
            write_binary_file,
            file_modified_millis,
            take_pending_file,
            copy_html,
            copy_text
        ])
        .setup(|app| {
            // On Windows/Linux the opened file arrives as a CLI argument.
            let args: Vec<String> = std::env::args().skip(1).collect();
            if let Some(p) = first_markdown_arg(&args) {
                if let Some(state) = app.try_state::<PendingFile>() {
                    *state.0.lock().unwrap() = Some(p);
                }
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building mdlook")
        .run(|app_handle, event| {
            // macOS delivers "open with" / double-click via the Opened event.
            if let tauri::RunEvent::Opened { urls } = event {
                if let Some(p) = first_markdown_url(&urls) {
                    if let Some(state) = app_handle.try_state::<PendingFile>() {
                        *state.0.lock().unwrap() = Some(p.clone());
                    }
                    // Bring the window to the front and notify the frontend.
                    if let Some(win) = app_handle.get_webview_window("main") {
                        let _ = win.set_focus();
                    }
                    let _ = app_handle.emit("mdlook://open-file", p);
                }
            }
        });
}
