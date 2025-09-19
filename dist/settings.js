const tauriApi = window.__TAURI__ ?? {};
const invoke = tauriApi.tauri?.invoke ?? tauriApi.core?.invoke;
const appWindow = tauriApi.window?.appWindow ?? tauriApi.window;

const bossKeyValue = document.getElementById("boss-key-value");
const closeButton = document.getElementById("close-settings");

async function hydrate() {
  if (!invoke) {
    bossKeyValue.textContent = "未启用 Tauri invoke";
    return;
  }
  try {
    const settings = await invoke("app_settings");
    bossKeyValue.textContent = settings?.boss_key ?? "未配置";
  } catch (error) {
    console.debug("读取设置失败", error);
    bossKeyValue.textContent = "读取失败";
  }
}

if (closeButton) {
  closeButton.addEventListener("click", () => {
    if (appWindow?.hide) {
      appWindow.hide();
    } else if (appWindow?.close) {
      appWindow.close();
    }
  });
}

hydrate();
