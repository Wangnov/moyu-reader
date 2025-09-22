use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::app_state::{AppState, StateSnapshot};
use crate::novel::load_text;
use crate::tray::TrayState;

#[derive(Serialize)]
pub struct DocumentPayload {
    pub file_path: Option<String>,
    pub content: String,
    pub offset: usize,
}

#[derive(Serialize)]
pub struct SettingsPayload {
    pub boss_key: String,
}

fn snapshot_to_payload(snapshot: &StateSnapshot) -> DocumentPayload {
    DocumentPayload {
        file_path: snapshot
            .file_path
            .as_ref()
            .map(|path| path.display().to_string()),
        content: snapshot.text.clone(),
        offset: snapshot.current_offset,
    }
}

fn load_document_internal(state: &AppState, path_buf: PathBuf) -> Result<DocumentPayload, String> {
    let text = load_text(&path_buf).map_err(|err| err.to_string())?;

    let payload = {
        let mut guard = state.write();
        guard.file_path = Some(path_buf.clone());
        guard.text = text;
        let same_file = guard
            .config
            .last_file
            .as_ref()
            .map(|p| p == &path_buf)
            .unwrap_or(false);
        guard.current_offset = if same_file {
            guard.config.last_offset.min(guard.text.len())
        } else {
            0
        };
        guard.config.last_file = Some(path_buf);
        guard.config.last_offset = guard.current_offset;
        guard.config.last_page = 0;

        DocumentPayload {
            file_path: guard
                .file_path
                .as_ref()
                .map(|path| path.display().to_string()),
            content: guard.text.clone(),
            offset: guard.current_offset,
        }
    };

    state
        .save_config()
        .map_err(|err| format!("保存配置失败: {}", err))?;

    Ok(payload)
}

fn update_progress_internal(state: &AppState, offset: usize) -> Result<(), String> {
    {
        let mut guard = state.write();
        guard.current_offset = offset.min(guard.text.len());
        guard.config.last_offset = guard.current_offset;
    }
    state
        .save_config()
        .map_err(|err| format!("保存配置失败: {}", err))
}

#[tauri::command]
pub fn load_file(path: String, state: State<'_, AppState>) -> Result<DocumentPayload, String> {
    let path_buf = PathBuf::from(path);
    load_document_internal(state.inner(), path_buf)
}

#[tauri::command]
pub fn current_document(state: State<'_, AppState>) -> Result<DocumentPayload, String> {
    let snapshot = state.snapshot();
    if snapshot.text.is_empty() {
        Err("尚未加载任何文件".to_string())
    } else {
        Ok(snapshot_to_payload(&snapshot))
    }
}

#[tauri::command]
pub fn update_progress(offset: usize, state: State<'_, AppState>) -> Result<(), String> {
    update_progress_internal(state.inner(), offset)
}

#[tauri::command]
pub fn app_settings(state: State<'_, AppState>) -> SettingsPayload {
    let snapshot = state.snapshot();
    SettingsPayload {
        boss_key: snapshot.config.boss_key.clone(),
    }
}

#[tauri::command]
pub fn get_all_settings(state: State<'_, AppState>) -> Result<crate::settings::AppConfig, String> {
    let snapshot = state.snapshot();
    Ok(snapshot.config.clone())
}

#[tauri::command]
pub fn update_settings(
    settings: crate::settings::AppConfig,
    state: State<'_, AppState>,
    tray_state: State<'_, TrayState>,
    app: AppHandle,
) -> Result<(), String> {
    let dev_mode_changed = {
        let mut guard = state.write();
        let current = &mut guard.config;
        let changed = current.system.dev_mode != settings.system.dev_mode;

        current.boss_key = settings.boss_key.clone();
        current.max_chars_per_page = settings.max_chars_per_page;
        current.appearance = settings.appearance.clone();
        current.reading = settings.reading.clone();
        current.privacy = settings.privacy.clone();
        current.keybindings = settings.keybindings.clone();
        current.system = settings.system.clone();

        changed
    };

    state
        .save_config()
        .map_err(|err| format!("保存配置失败: {}", err))?;

    if dev_mode_changed {
        tray_state
            .update_dev_mode(settings.system.dev_mode, &app)
            .map_err(|err| format!("更新托盘菜单失败: {}", err))?;
    }

    Ok(())
}

#[tauri::command]
pub fn reset_settings(state: State<'_, AppState>) -> Result<(), String> {
    {
        let mut guard = state.write();
        let default_config = crate::settings::AppConfig::default();
        // 保留当前打开的文件和阅读位置
        guard.config = crate::settings::AppConfig {
            last_file: guard.config.last_file.clone(),
            last_page: guard.config.last_page,
            last_offset: guard.config.last_offset,
            ..default_config
        };
    }
    state
        .save_config()
        .map_err(|err| format!("重置设置失败: {}", err))
}

#[tauri::command]
pub fn sync_tray_state(
    minimal_mode: Option<bool>,
    tray_state: State<'_, TrayState>,
) -> Result<(), String> {
    tray_state
        .sync_from_frontend(minimal_mode)
        .map_err(|err| err.to_string())
}

#[tauri::command]
pub fn register_global_shortcut(
    shortcut: String,
    action: String,
    app: AppHandle,
) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    // 先尝试注销已有的快捷键
    let _ = app.global_shortcut().unregister(shortcut.as_str());

    // 注册新的快捷键
    let action_clone = action.clone();
    app.global_shortcut()
        .on_shortcut(shortcut.as_str(), move |app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit(&format!("shortcut-{}", action_clone), ());
            }
        })
        .map_err(|err| format!("注册快捷键 {} 失败: {}", shortcut, err))?;

    Ok(())
}

#[tauri::command]
pub fn unregister_global_shortcut(shortcut: String, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    app.global_shortcut()
        .unregister(shortcut.as_str())
        .map_err(|err| format!("注销快捷键 {} 失败: {}", shortcut, err))?;

    Ok(())
}

#[tauri::command]
pub fn update_all_shortcuts(state: State<'_, AppState>, app: AppHandle) -> Result<(), String> {
    use tauri_plugin_global_shortcut::GlobalShortcutExt;

    let snapshot = state.snapshot();
    let shortcuts = vec![
        (snapshot.config.boss_key.clone(), "boss-key"),
        (snapshot.config.keybindings.prev_page.clone(), "prev-page"),
        (snapshot.config.keybindings.next_page.clone(), "next-page"),
        (snapshot.config.keybindings.search.clone(), "search"),
    ];

    // 注销所有现有快捷键
    let _ = app.global_shortcut().unregister_all();

    // 重新注册所有快捷键
    for (shortcut, action) in shortcuts {
        if shortcut.is_empty() || shortcut == "None" {
            continue;
        }

        let action_str = action.to_string();
        let shortcut_str = shortcut.as_str();
        if let Err(err) = app
            .global_shortcut()
            .on_shortcut(shortcut_str, move |app, _, _| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit(&format!("shortcut-{}", action_str), ());
                }
            })
        {
            eprintln!("注册快捷键 {} 失败: {}", shortcut, err);
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::app_state::AppState;
    use std::fs;
    use std::io::Write;
    use std::path::Path;

    fn prepare_temp_paths() -> (PathBuf, PathBuf) {
        let base = std::env::temp_dir().join(format!("moyu-reader-test-{}", std::process::id()));
        let _ = fs::create_dir_all(&base);
        let novel_path = base.join("novel.txt");
        let config_path = base.join("config.json");
        (novel_path, config_path)
    }

    fn write_sample_text(path: &Path) {
        let mut file = fs::File::create(path).expect("unable to create sample novel");
        let content = (1..=200)
            .map(|n| format!("{:03}", n))
            .collect::<Vec<_>>()
            .join("\n");
        writeln!(file, "{}", content).expect("unable to write sample text");
    }

    #[test]
    fn progress_survives_reload() {
        let (novel_path, config_path) = prepare_temp_paths();
        write_sample_text(&novel_path);
        let state = AppState::new(config_path);

        load_document_internal(&state, novel_path.clone()).expect("load file failed");
        update_progress_internal(&state, 150).expect("progress");

        let snapshot = state.snapshot();
        assert_eq!(snapshot.current_offset, 150);
        drop(snapshot);

        // Reload same file should resume from saved offset
        load_document_internal(&state, novel_path).expect("reload failed");
        let snapshot = state.snapshot();
        assert!(snapshot.text.starts_with("001\n002"));
        assert_eq!(snapshot.current_offset, 150.min(snapshot.text.len()));
    }
}
