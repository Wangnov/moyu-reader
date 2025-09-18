use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::app_state::{AppState, StateSnapshot};
use crate::novel::load_text;

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

    {
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
    }

    state
        .save_config()
        .map_err(|err| format!("保存配置失败: {}", err))?;

    Ok(snapshot_to_payload(&state.snapshot()))
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
