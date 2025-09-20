use std::sync::{Arc, RwLock};

use serde::Serialize;
use tauri::{
    menu::{MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Result as TauriResult, WebviewUrl, WebviewWindowBuilder, Wry,
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

    pub fn update_dev_mode(&self, dev_mode: bool, app_handle: &AppHandle<Wry>) -> TauriResult<()> {
        // 重新创建托盘菜单以应用新的开发者模式设置
        if let Some(resources) = self.inner.write().expect("lock tray resources").take() {
            // 先销毁旧的托盘
            let previous_minimal = resources.minimal_mode;
            drop(resources);

            // 重新初始化托盘菜单
            let toggle_ui_item = MenuItem::with_id(app_handle, "toggle-ui", "隐藏界面按钮", true, None::<&str>)?;
            let open_settings_item = MenuItem::with_id(app_handle, "open-settings", "打开设置…", true, None::<&str>)?;
            let dev_tools_item = MenuItem::with_id(app_handle, "dev-tools", "开发者工具", true, None::<&str>)?;
            let quit_item = PredefinedMenuItem::quit(app_handle, Some("退出"))?;

            let mut menu_builder = MenuBuilder::new(app_handle)
                .item(&toggle_ui_item)
                .item(&open_settings_item);

            if dev_mode {
                menu_builder = menu_builder.item(&dev_tools_item);
            }

            let menu = menu_builder.separator().item(&quit_item).build()?;

            // 重新创建托盘
            let mut tray_builder = TrayIconBuilder::new()
                .tooltip("摸鱼阅读器")
                .menu(&menu);

            if let Some(icon) = app_handle.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
                #[cfg(target_os = "macos")]
                {
                    tray_builder = tray_builder.icon_as_template(true);
                }
            }

            // 设置事件处理
            let toggle_ui_id = toggle_ui_item.id().clone();
            let settings_id = open_settings_item.id().clone();
            let dev_tools_id = dev_tools_item.id().clone();
            let quit_id = quit_item.id().clone();
            let tray_state_clone = self.clone();
            let dev_mode_clone = dev_mode;

            tray_builder = tray_builder.on_menu_event(move |app, event| {
                if event.id() == &toggle_ui_id {
                    if let Err(err) = tray_state_clone.toggle_minimal_via_menu() {
                        eprintln!("切换界面显示失败: {err}");
                    }
                } else if event.id() == &settings_id {
                    if let Err(err) = open_settings(app) {
                        eprintln!("打开设置窗口失败: {err}");
                    }
                } else if event.id() == &quit_id {
                    app.exit(0);
                } else if dev_mode_clone && event.id() == &dev_tools_id {
                    if let Some(window) = app.get_webview_window("main") {
                        #[cfg(debug_assertions)]
                        {
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

            let tray = tray_builder.build(app_handle)?;

            // 存储新的资源，同时延续最小化状态
            let new_resources = TrayResources {
                tray,
                toggle_ui_item,
                minimal_mode: previous_minimal,
            };
            update_toggle_label(&new_resources)?;
            self.store(new_resources);
        }

        Ok(())
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
    use crate::app_state::AppState;

    let tray_state = app.state::<TrayState>().inner().clone();
    let app_handle = app.handle().clone();

    // 获取开发者模式设置
    let dev_mode = {
        let app_state = app.state::<AppState>();
        let snapshot = app_state.snapshot();
        snapshot.config.system.dev_mode
    };

    let toggle_ui_item =
        MenuItem::with_id(&app_handle, "toggle-ui", "隐藏界面按钮", true, None::<&str>)?;
    let open_settings_item = MenuItem::with_id(
        &app_handle,
        "open-settings",
        "打开设置…",
        true,
        None::<&str>,
    )?;

    // 总是创建开发者工具菜单项，但根据设置决定是否显示
    let dev_tools_item =
        MenuItem::with_id(&app_handle, "dev-tools", "开发者工具", true, None::<&str>)?;

    let quit_item = PredefinedMenuItem::quit(&app_handle, Some("退出"))?;

    let mut menu_builder = MenuBuilder::new(&app_handle)
        .item(&toggle_ui_item)
        .item(&open_settings_item);

    // 根据开发者模式设置决定是否添加开发者工具
    if dev_mode {
        menu_builder = menu_builder.item(&dev_tools_item);
    }

    let menu = menu_builder.separator().item(&quit_item).build()?;

    let toggle_ui_id = toggle_ui_item.id().clone();
    let settings_id = open_settings_item.id().clone();
    let dev_tools_id = dev_tools_item.id().clone();
    let quit_id = quit_item.id().clone();
    let tray_state_for_menu = tray_state.clone();
    let dev_mode_clone = dev_mode;

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
            } else if dev_mode_clone && event.id() == &dev_tools_id {
                if let Some(window) = app.get_webview_window("main") {
                    #[cfg(debug_assertions)]
                    {
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
            "显示界面按钮"
        } else {
            "隐藏界面按钮"
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
