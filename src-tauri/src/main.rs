mod app_state;
mod commands;
mod novel;
mod settings;

use std::path::PathBuf;

use anyhow::Result as AnyResult;
use app_state::AppState;
use commands::{app_settings, current_document, load_file, update_progress};
use novel::load_text;
use settings::default_config_path;
use tauri::{App, Emitter, Manager, Result as TauriResult, TitleBarStyle};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

fn main() {
    let context = tauri::generate_context!();
    let config_path = resolve_config_path(&context.config().identifier);
    let app_state = AppState::new(config_path);

    tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            configure_window(app).map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;
            restore_last_session(app)
                .map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;
            register_boss_key(app).map_err(|err| -> Box<dyn std::error::Error> { err.into() })?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_file,
            current_document,
            update_progress,
            app_settings
        ])
        .run(context)
        .expect("运行 Tauri 应用时出错");
}

fn resolve_config_path(identifier: &str) -> PathBuf {
    let base_dir = dirs::config_dir().unwrap_or_else(|| std::env::temp_dir());
    let dir = base_dir.join(identifier);
    default_config_path(dir)
}

fn configure_window(app: &mut App) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.set_always_on_top(true)?;
        window.set_decorations(false)?;
        window.set_resizable(true)?;
        window.set_focus()?;
        #[cfg(target_os = "macos")]
        {
            window.set_title_bar_style(TitleBarStyle::Overlay)?;
        }
        #[cfg(target_os = "windows")]
        {
            window.set_skip_taskbar(true)?;
        }
    }
    Ok(())
}

fn restore_last_session(app: &mut App) -> AnyResult<()> {
    let handle = app.handle();
    let state = handle.state::<AppState>();
    let snapshot = state.snapshot();

    if let Some(path) = snapshot.config.last_file.clone() {
        if path.exists() {
            let text = load_text(&path)?;
            let mut guard = state.write();
            guard.file_path = Some(path);
            guard.text = text;
            guard.current_offset = snapshot.config.last_offset.min(guard.text.len());
        } else {
            let _ = state.update_config(|config| {
                config.last_file = None;
                config.last_offset = 0;
            });
        }
    }

    Ok(())
}

fn register_boss_key(app: &mut App) -> AnyResult<()> {
    let state = app.state::<AppState>();
    let boss_key = state.snapshot().config.boss_key;
    let register_key = boss_key.clone();
    if let Err(err) = app
        .global_shortcut()
        .on_shortcut(register_key.as_str(), move |app, _, _| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.emit("boss-key-toggle", ());
            }
        })
    {
        eprintln!("注册老板键 `{}` 失败: {}", boss_key, err);
    }

    Ok(())
}
