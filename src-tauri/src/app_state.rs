use std::path::PathBuf;
use std::sync::RwLock;

use anyhow::Result;

use crate::settings;
use crate::settings::AppConfig;

#[derive(Clone, Default)]
pub struct StateSnapshot {
    pub file_path: Option<PathBuf>,
    pub text: String,
    pub current_offset: usize,
    pub config: AppConfig,
}

pub struct AppState {
    inner: RwLock<StateSnapshot>,
    config_path: PathBuf,
}

impl AppState {
    pub fn new(config_path: PathBuf) -> Self {
        let config = settings::load_config(&config_path);
        let snapshot = StateSnapshot {
            text: String::new(),
            config,
            ..StateSnapshot::default()
        };
        Self {
            inner: RwLock::new(snapshot),
            config_path,
        }
    }

    pub fn read(&self) -> std::sync::RwLockReadGuard<'_, StateSnapshot> {
        self.inner
            .read()
            .expect("failed to acquire reader state read lock")
    }

    pub fn write(&self) -> std::sync::RwLockWriteGuard<'_, StateSnapshot> {
        self.inner
            .write()
            .expect("failed to acquire reader state write lock")
    }

    pub fn save_config(&self) -> Result<()> {
        let guard = self.read();
        settings::save_config(&self.config_path, &guard.config)
    }

    pub fn update_config<F>(&self, mutator: F) -> Result<()>
    where
        F: FnOnce(&mut AppConfig),
    {
        {
            let mut guard = self.write();
            mutator(&mut guard.config);
        }
        self.save_config()
    }

    pub fn snapshot(&self) -> StateSnapshot {
        self.read().clone()
    }
}

impl Clone for AppState {
    fn clone(&self) -> Self {
        let snapshot = self.snapshot();
        Self {
            inner: RwLock::new(snapshot),
            config_path: self.config_path.clone(),
        }
    }
}
