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
    pub appearance: AppearanceConfig,
    pub reading: ReadingConfig,
    pub privacy: PrivacyConfig,
    pub keybindings: KeybindingsConfig,
    pub system: SystemConfig,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppearanceConfig {
    pub window_opacity: u8,
    pub text_opacity: u8,
    pub always_on_top: bool,
    pub show_in_taskbar: bool,
    pub font_size: u32,
    pub line_height: u32,
    pub background_color: String,
    pub text_color: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ReadingConfig {
    pub smart_break: bool,
    pub auto_save_interval: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct PrivacyConfig {
    pub boss_action: String,
    pub auto_fade: bool,
    pub fade_delay: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct KeybindingsConfig {
    pub prev_page: String,
    pub next_page: String,
    pub search: String,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct SystemConfig {
    pub auto_start: bool,
    pub restore_reading: bool,
    pub dev_mode: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            last_file: None,
            last_page: 0,
            last_offset: 0,
            boss_key: default_boss_key(),
            max_chars_per_page: 900,
            appearance: AppearanceConfig::default(),
            reading: ReadingConfig::default(),
            privacy: PrivacyConfig::default(),
            keybindings: KeybindingsConfig::default(),
            system: SystemConfig::default(),
        }
    }
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            window_opacity: 90,
            text_opacity: 100,
            always_on_top: true,
            show_in_taskbar: false,
            font_size: 16,
            line_height: 18,
            background_color: "#1b1f24".to_string(),
            text_color: "#d7dce2".to_string(),
        }
    }
}

impl Default for ReadingConfig {
    fn default() -> Self {
        Self {
            smart_break: true,
            auto_save_interval: "instant".to_string(),
        }
    }
}

impl Default for PrivacyConfig {
    fn default() -> Self {
        Self {
            boss_action: "disguise".to_string(),
            auto_fade: false,
            fade_delay: 5,
        }
    }
}

impl Default for KeybindingsConfig {
    fn default() -> Self {
        Self {
            prev_page: "PageUp".to_string(),
            next_page: "PageDown".to_string(),
            search: "Ctrl+F".to_string(),
        }
    }
}

impl Default for SystemConfig {
    fn default() -> Self {
        Self {
            auto_start: false,
            restore_reading: true,
            dev_mode: false,
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
