const tauriApi = window.__TAURI__ ?? {};
const invoke = tauriApi.tauri?.invoke ?? tauriApi.core?.invoke;
const windowApi = tauriApi.window;
const getCurrentWindow = windowApi?.getCurrentWindow || windowApi?.getCurrent;
const appWindow = getCurrentWindow ? getCurrentWindow() : windowApi?.appWindow;

let currentSettings = {};
let pendingSave = null;

function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  const panels = document.querySelectorAll('.settings-panel');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetPanel = item.dataset.panel;

      navItems.forEach(nav => nav.classList.remove('active'));
      panels.forEach(panel => panel.classList.remove('active'));

      item.classList.add('active');
      const panel = document.getElementById(`${targetPanel}-panel`);
      if (panel) {
        panel.classList.add('active');
      }
    });
  });
}

function initRangeInputs() {
  document.querySelectorAll('input[type="range"]').forEach(input => {
    const display = input.nextElementSibling;
    if (display && display.classList.contains('value-display')) {
      const updateDisplay = () => {
        const value = input.value;
        const suffix = input.id.includes('opacity') ? '%' :
                       input.id.includes('font-size') ? 'px' :
                       input.id.includes('line-height') ? (value / 10).toFixed(1) :
                       input.id.includes('delay') ? '秒' : '';
        display.textContent = input.id.includes('line-height') ? suffix : value + suffix;
      };

      input.addEventListener('input', updateDisplay);
      updateDisplay();
    }
  });
}

async function loadSettings() {
  if (!invoke) {
    console.error("Tauri invoke API 未注入");
    return;
  }

  try {
    currentSettings = await invoke("get_all_settings");
    applySettingsToUI(currentSettings);
  } catch (error) {
    console.error("加载设置失败", error);
    currentSettings = getDefaultSettings();
    applySettingsToUI(currentSettings);
  }
}

function getDefaultSettings() {
  return {
    boss_key: "Ctrl+Alt+Space",
    max_chars_per_page: 900,
    appearance: {
      window_opacity: 90,
      text_opacity: 100,
      always_on_top: true,
      show_in_taskbar: false,
      font_size: 16,
      line_height: 18
    },
    reading: {
      smart_break: true,
      auto_save_interval: "instant"
    },
    privacy: {
      boss_action: "disguise",
      auto_fade: false,
      fade_delay: 5
    },
    keybindings: {
      prev_page: "PageUp",
      next_page: "PageDown",
      search: "Ctrl+F"
    },
    system: {
      auto_start: false,
      restore_reading: true,
      dev_mode: false
    }
  };
}

function applySettingsToUI(settings) {
  // 外观设置
  const appearance = settings.appearance || {};
  setInputValue('window-opacity', appearance.window_opacity || 90);
  setInputValue('text-opacity', appearance.text_opacity || 100);
  setInputValue('always-on-top', appearance.always_on_top !== false);
  setInputValue('show-in-taskbar', appearance.show_in_taskbar || false);
  setInputValue('font-size', appearance.font_size || 16);
  setInputValue('line-height', appearance.line_height || 18);
  setInputValue('background-color', appearance.background_color || '#1b1f24');
  setInputValue('text-color', appearance.text_color || '#d7dce2');

  // 阅读设置
  const reading = settings.reading || {};
  setInputValue('max-chars', settings.max_chars_per_page || 900);
  setInputValue('smart-break', reading.smart_break !== false);
  setInputValue('auto-save-interval', reading.auto_save_interval || 'instant');

  // 隐私设置
  const privacy = settings.privacy || {};
  setInputValue('boss-key', settings.boss_key || 'Ctrl+Alt+Space');
  setInputValue('boss-action', privacy.boss_action || 'disguise');
  setInputValue('auto-fade', privacy.auto_fade || false);
  setInputValue('fade-delay', privacy.fade_delay || 5);

  // 快捷键设置
  const keybindings = settings.keybindings || {};
  document.querySelectorAll('.keybinding').forEach(input => {
    const binding = input.dataset.binding;
    if (!binding) return;

    if (binding === 'prev_page') {
      input.value = keybindings.prev_page || 'PageUp';
    } else if (binding === 'next_page') {
      input.value = keybindings.next_page || 'PageDown';
    } else if (binding === 'search') {
      input.value = keybindings.search || 'Ctrl+F';
    }
  });

  // 系统设置
  const system = settings.system || {};
  setInputValue('auto-start', system.auto_start || false);
  setInputValue('restore-reading', system.restore_reading !== false);
  setInputValue('dev-mode', system.dev_mode || false);
}

function setInputValue(id, value) {
  const input = document.getElementById(id);
  if (!input) return;

  if (input.type === 'checkbox') {
    input.checked = value;
  } else {
    input.value = value;
  }

  // 触发range input的显示更新
  if (input.type === 'range') {
    input.dispatchEvent(new Event('input'));
  }
}

function collectSettingsFromUI() {
  const getKeybindingValue = (binding, fallback) => {
    const input = document.querySelector('.keybinding[data-binding="' + binding + '"]');
    return input?.value?.trim() || fallback;
  };

  return {
    boss_key: document.getElementById('boss-key')?.value || 'Ctrl+Alt+Space',
    max_chars_per_page: parseInt(document.getElementById('max-chars')?.value || '900'),
    appearance: {
      window_opacity: parseInt(document.getElementById('window-opacity')?.value || '90'),
      text_opacity: parseInt(document.getElementById('text-opacity')?.value || '100'),
      always_on_top: document.getElementById('always-on-top')?.checked || false,
      show_in_taskbar: document.getElementById('show-in-taskbar')?.checked || false,
      font_size: parseInt(document.getElementById('font-size')?.value || '16'),
      line_height: parseInt(document.getElementById('line-height')?.value || '18'),
      background_color: document.getElementById('background-color')?.value || '#1b1f24',
      text_color: document.getElementById('text-color')?.value || '#d7dce2'
    },
    reading: {
      smart_break: document.getElementById('smart-break')?.checked || false,
      auto_save_interval: document.getElementById('auto-save-interval')?.value || 'instant'
    },
    privacy: {
      boss_action: document.getElementById('boss-action')?.value || 'disguise',
      auto_fade: document.getElementById('auto-fade')?.checked || false,
      fade_delay: parseInt(document.getElementById('fade-delay')?.value || '5')
    },
    keybindings: {
      prev_page: getKeybindingValue('prev_page', 'PageUp'),
      next_page: getKeybindingValue('next_page', 'PageDown'),
      search: getKeybindingValue('search', 'Ctrl+F')
    },
    system: {
      auto_start: document.getElementById('auto-start')?.checked || false,
      restore_reading: document.getElementById('restore-reading')?.checked || false,
      dev_mode: document.getElementById('dev-mode')?.checked || false
    }
  };
}

async function saveSettings() {
  if (!invoke) return;

  const settings = collectSettingsFromUI();
  const needUpdateShortcuts = hasShortcutChanged(currentSettings, settings);

  try {
    await invoke('update_settings', { settings });

    // 如果快捷键有变化，更新全局快捷键
    if (needUpdateShortcuts) {
      try {
        await invoke('update_all_shortcuts');
        console.log('全局快捷键已更新');
      } catch (error) {
        console.error('更新全局快捷键失败:', error);
      }
    }

    // 发送设置变更事件到主窗口
    const eventApi = tauriApi.event;
    if (eventApi?.emit) {
      await eventApi.emit('settings-changed', settings);
      console.log('设置变更事件已发送');
    } else if (windowApi?.getWindow) {
      try {
        const mainWindow = await windowApi.getWindow('main');
        await mainWindow?.emit('settings-changed', settings);
      } catch (error) {
        console.warn('向主窗口发送设置变更事件失败:', error);
      }
    } else if (appWindow?.emit) {
      await appWindow.emit('settings-changed', settings);
    }

    // 检查需要立即应用的设置
    applyImmediateSettings(settings);

    currentSettings = settings;
    console.log('设置已保存');
  } catch (error) {
    console.error('保存设置失败:', error);
  }
}

function hasShortcutChanged(oldSettings, newSettings) {
  if (!oldSettings || !newSettings) return true;

  // 检查老板键
  if (oldSettings.boss_key !== newSettings.boss_key) return true;

  // 检查其他快捷键
  const oldKeys = oldSettings.keybindings || {};
  const newKeys = newSettings.keybindings || {};

  return oldKeys.prev_page !== newKeys.prev_page ||
         oldKeys.next_page !== newKeys.next_page ||
         oldKeys.search !== newKeys.search;
}

async function applyImmediateSettings(settings) {
  if (!appWindow) return;
  const appearance = settings?.appearance;
  if (!appearance) return;

  try {
    if (appWindow.setAlwaysOnTop && typeof appearance.always_on_top === "boolean") {
      await appWindow.setAlwaysOnTop(appearance.always_on_top);
    }

    if (appWindow.setSkipTaskbar && typeof appearance.show_in_taskbar === "boolean") {
      await appWindow.setSkipTaskbar(!appearance.show_in_taskbar);
    }
  } catch (error) {
    console.error('应用设置失败:', error);
  }
}

function debounceSave() {
  if (pendingSave) {
    clearTimeout(pendingSave);
  }
  pendingSave = setTimeout(() => {
    saveSettings();
    pendingSave = null;
  }, 300);
}

function initSettingListeners() {
  // 监听所有设置变化
  document.querySelectorAll('input, select').forEach(element => {
    if (element.classList.contains('keybinding')) return; // 快捷键需要特殊处理

    const event = element.type === 'checkbox' ? 'change' : 'input';
    element.addEventListener(event, debounceSave);
  });

  // 颜色重置按钮
  const resetBgColorBtn = document.getElementById('reset-bg-color');
  if (resetBgColorBtn) {
    resetBgColorBtn.addEventListener('click', () => {
      document.getElementById('background-color').value = '#1b1f24';
      debounceSave();
    });
  }

  const resetTextColorBtn = document.getElementById('reset-text-color');
  if (resetTextColorBtn) {
    resetTextColorBtn.addEventListener('click', () => {
      document.getElementById('text-color').value = '#d7dce2';
      debounceSave();
    });
  }

  // 重置设置按钮
  const resetBtn = document.getElementById('reset-settings');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (confirm('确定要重置所有设置吗？此操作不可撤销。')) {
        if (invoke) {
          try {
            await invoke('reset_settings');
            await loadSettings();
            alert('设置已重置');
          } catch (error) {
            console.error('重置设置失败:', error);
          }
        }
      }
    });
  }

  // 检查更新按钮
  const checkUpdateBtn = document.getElementById('check-update');
  if (checkUpdateBtn) {
    checkUpdateBtn.addEventListener('click', () => {
      alert('当前已是最新版本');
    });
  }

  // GitHub链接
  const githubBtn = document.getElementById('open-github');
  if (githubBtn) {
    githubBtn.addEventListener('click', () => {
      if (window.open) {
        window.open('https://github.com/Wangnov/moyu-reader', '_blank');
      }
    });
  }
}

// 快捷键录制功能
function initKeybindingRecorder() {
  document.querySelectorAll('.record-key-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      const input = this.previousElementSibling;
      if (!input) return;

      const stopRecording = () => {
        if (this._recordKeyHandler) {
          document.removeEventListener('keydown', this._recordKeyHandler, true);
          this._recordKeyHandler = null;
        }
        this.classList.remove('recording');
        this.textContent = '录制';
      };

      if (this.classList.contains('recording')) {
        stopRecording();
        return;
      }

      this.classList.add('recording');
      this.textContent = '按键...';

      const recordKey = (e) => {
        e.preventDefault();
        e.stopPropagation();

        const keys = [];
        if (e.ctrlKey) keys.push('Ctrl');
        if (e.altKey) keys.push('Alt');
        if (e.shiftKey) keys.push('Shift');
        if (e.metaKey) keys.push('Cmd');

        if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
          keys.push(e.key.length === 1 ? e.key.toUpperCase() : e.key);
        }

        if (keys.length > 0) {
          input.value = keys.join('+');
          stopRecording();
          debounceSave();
        }
      };

      this._recordKeyHandler = recordKey;
      document.addEventListener('keydown', recordKey, true);
    });
  });
}

// 窗口关闭处理
function initWindowControls() {
  // ESC键关闭窗口
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && appWindow) {
      appWindow.hide();
    }
  });
}

// 初始化
async function init() {
  initNavigation();
  initRangeInputs();
  initSettingListeners();
  initKeybindingRecorder();
  initWindowControls();
  await loadSettings();
}

document.addEventListener('DOMContentLoaded', init);
