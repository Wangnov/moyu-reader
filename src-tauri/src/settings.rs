use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppConfig {
    pub last_file: Option<PathBuf>,
    pub last_page: usize,
    pub last_offset: usize,
    pub boss_key: String,
    pub max_chars_per_page: usize,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_file: None,
            last_page: 0,
            last_offset: 0,
            boss_key: default_boss_key(),
            max_chars_per_page: 900,
        }
    }
}

fn default_boss_key() -> String {
    #[cfg(target_os = "macos")]
    {
        "Cmd+Shift+Space".to_string()
    }

    #[cfg(not(target_os = "macos"))]
    {
        "Ctrl+Alt+Space".to_string()
    }
}

pub fn load_config(path: &Path) -> AppConfig {
    if let Ok(bytes) = fs::read(path) {
        if let Ok(config) = serde_json::from_slice::<AppConfig>(&bytes) {
            return config;
        }
    }
    AppConfig::default()
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("创建配置目录失败: {}", parent.display()))?;
    }
    let data = serde_json::to_vec_pretty(config)?;
    fs::write(path, data).with_context(|| format!("写入配置失败: {}", path.display()))
}

pub fn default_config_path(config_dir: PathBuf) -> PathBuf {
    config_dir.join("moyu-reader-config.json")
}
