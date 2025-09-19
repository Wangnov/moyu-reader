use std::sync::{Arc, RwLock};

use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Result as TauriResult, WebviewUrl,
    WebviewWindowBuilder, Wry,
};

#[derive(Clone, Default)]
pub struct TrayState {
    inner: Arc<RwLock<Option<TrayResources>>>,
}

struct TrayResources {
    tray: TrayIcon<Wry>,
    toggle_ui_item: MenuItem<Wry>,
    minimal_mode: bool,
}

#[derive(Clone, Serialize)]
struct UiVisibilityPayload {
    minimal: bool,
}

impl TrayState {
    fn store(&self, resources: TrayResources) {
        let mut guard = self.inner.write().expect("lock tray resources");
        *guard = Some(resources);
    }

    pub fn toggle_minimal_via_menu(&self) -> TauriResult<()> {
        self.with_tray(|resources| {
            resources.minimal_mode = !resources.minimal_mode;
            update_toggle_label(resources)?;
            emit_ui_visibility(&resources.tray.app_handle(), resources.minimal_mode)?;
            Ok(())
        })
    }

    pub fn sync_from_frontend(&self, minimal_mode: Option<bool>) -> TauriResult<()> {
        if minimal_mode.is_none() {
            return Ok(());
        }
        self.with_tray(|resources| {
            if let Some(minimal) = minimal_mode {
                resources.minimal_mode = minimal;
                update_toggle_label(resources)?;
            }
            Ok(())
        })
    }

    fn with_tray<F>(&self, mut f: F) -> TauriResult<()>
    where
        F: FnMut(&mut TrayResources) -> TauriResult<()>,
    {
        if let Some(ref mut resources) = *self.inner.write().expect("lock tray resources") {
            f(resources)
        } else {
            Ok(())
        }
    }
}

pub fn initialize_tray(app: &mut App) -> TauriResult<()> {
    let tray_state = app.state::<TrayState>().inner().clone();
    let app_handle = app.handle().clone();

    let toggle_ui_item =
        MenuItem::with_id(&app_handle, "toggle-ui", "隐藏界面", true, None::<&str>)?;
    let open_settings_item = MenuItem::with_id(
        &app_handle,
        "open-settings",
        "打开设置…",
        true,
        None::<&str>,
    )?;

    #[cfg(debug_assertions)]
    let dev_tools_item = MenuItem::with_id(
        &app_handle,
        "dev-tools",
        "开发者工具",
        true,
        None::<&str>,
    )?;

    let quit_item = PredefinedMenuItem::quit(&app_handle, Some("退出"))?;

    let mut menu_builder = MenuBuilder::new(&app_handle)
        .item(&toggle_ui_item)
        .item(&open_settings_item);

    #[cfg(debug_assertions)]
    {
        menu_builder = menu_builder.item(&dev_tools_item);
    }

    let menu = menu_builder
        .separator()
        .item(&quit_item)
        .build()?;

    let toggle_ui_id = toggle_ui_item.id().clone();
    let settings_id = open_settings_item.id().clone();

    #[cfg(debug_assertions)]
    let dev_tools_id = dev_tools_item.id().clone();

    let quit_id = quit_item.id().clone();
    let tray_state_for_menu = tray_state.clone();

    let mut tray_builder = TrayIconBuilder::new()
        .tooltip("摸鱼阅读器")
        .menu(&menu)
        .on_menu_event(move |app, event| {
            if event.id() == &toggle_ui_id {
                if let Err(err) = tray_state_for_menu.toggle_minimal_via_menu() {
                    eprintln!("切换界面显示失败: {err}");
                }
            } else if event.id() == &settings_id {
                if let Err(err) = open_settings(app) {
                    eprintln!("打开设置窗口失败: {err}");
                }
            } else if event.id() == &quit_id {
                app.exit(0);
            }

            #[cfg(debug_assertions)]
            {
                if event.id() == &dev_tools_id {
                    if let Some(window) = app.get_webview_window("main") {
                        window.open_devtools();
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    match window.is_visible() {
                        Ok(true) => {
                            let _ = window.hide();
                        }
                        Ok(false) | Err(_) => {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                }
            }
        });

    if let Some(icon) = app_handle.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
        #[cfg(target_os = "macos")]
        {
            tray_builder = tray_builder.icon_as_template(true);
        }
    }

    let tray = tray_builder.build(&app_handle)?;

    tray_state.store(TrayResources {
        tray,
        toggle_ui_item,
        minimal_mode: false,
    });

    Ok(())
}

fn update_toggle_label(resources: &TrayResources) -> TauriResult<()> {
    resources
        .toggle_ui_item
        .set_text(if resources.minimal_mode {
            "显示界面"
        } else {
            "隐藏界面"
        })
}

fn emit_ui_visibility(app: &AppHandle<Wry>, minimal: bool) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.emit("ui-visibility", UiVisibilityPayload { minimal })?;
    }
    Ok(())
}

fn open_settings(app: &AppHandle<Wry>) -> TauriResult<()> {
    if let Some(window) = app.get_webview_window("settings") {
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }

    let url = WebviewUrl::App("settings.html".into());
    WebviewWindowBuilder::new(app, "settings", url)
        .title("摸鱼设置")
        .inner_size(360.0, 420.0)
        .resizable(false)
        .skip_taskbar(true)
        .visible(true)
        .build()?;

    Ok(())
}
