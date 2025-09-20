const tauriApi = window.__TAURI__ ?? {};
const invoke = tauriApi.tauri?.invoke ?? tauriApi.core?.invoke;
const dialogApi = tauriApi.dialog;
const openDialog = dialogApi?.open;
// 尝试获取窗口相关 API
const windowApi = tauriApi.window;
const getCurrentWindow = windowApi?.getCurrentWindow || windowApi?.getCurrent;
const appWindow = getCurrentWindow ? getCurrentWindow() : windowApi?.appWindow;
const listen = tauriApi.event?.listen;

const readerEl = document.getElementById("reader");
const measureEl = document.getElementById("reader-measure");
const fileInfoEl = document.getElementById("file-info");
const pageInfoEl = document.getElementById("page-info");
const bossKeyBtn = document.getElementById("boss-key");
const bossKeyHintEl = document.getElementById("boss-key-hint");
const searchInput = document.getElementById("search-input");
const searchBtn = document.getElementById("search-btn");
const pageSlider = document.getElementById("page-slider");
const bossOverlay = document.getElementById("boss-overlay");
const bossLogEl = document.getElementById("boss-log");
const bossExitBtn = document.getElementById("boss-exit");

let bossMode = false;
let hiddenTimeout = null;
let fullText = "";
let fullLength = 0;
let currentOffset = 0;
let nextOffset = 0;
let history = [];
let historyIndex = -1;
let lastFileLabel = fileInfoEl ? fileInfoEl.textContent : "";
let searchCursor = 0;
let progressTimer = null;
let minimalMode = false;

if (!invoke) {
  console.error("Tauri invoke API 未注入，界面将无法与后端通信。");
}

if (bossOverlay) {
  bossOverlay.hidden = true;
}

if (pageSlider) {
  pageSlider.min = "0";
  pageSlider.max = "100";
  pageSlider.value = "0";
}

// 修复 Windows 透明窗口边框问题
async function fixTransparentBorder() {
  if (!appWindow) return;

  try {
    // 延迟执行以确保窗口完全初始化
    setTimeout(async () => {
      // 动态切换装饰来触发窗口重绘
      await appWindow.setDecorations(false);
      // 短暂延迟后再次设置
      setTimeout(async () => {
        await appWindow.setDecorations(true);
        // 最终保持无装饰状态
        setTimeout(async () => {
          await appWindow.setDecorations(false);
        }, 50);
      }, 50);
    }, 100);
  } catch (err) {
    console.warn("无法修复窗口边框:", err);
  }
}

// 页面加载完成后执行窗口边框修复
document.addEventListener('DOMContentLoaded', fixTransparentBorder);

function selectFileDialog() {
  if (!openDialog) {
    console.error("未启用对话框插件或权限，无法打开文件。", dialogApi);
    return null;
  }
  return openDialog({ multiple: false, filters: [{ name: "Text", extensions: ["txt"] }] });
}

function measureFits(start, end) {
  if (!measureEl || start >= end) return true;
  const rect = readerEl.getBoundingClientRect();
  measureEl.style.width = `${rect.width}px`;
  measureEl.style.height = `${rect.height}px`;
  measureEl.textContent = fullText.slice(start, end);
  // scrollHeight 会被 padding 影响，略放宽判断
  return measureEl.scrollHeight <= measureEl.clientHeight + 1;
}

function getFileName(path) {
  if (!path) return "";
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function findBreakPoint(slice) {
  const breakChars = ["\n", "。", "！", "？", "；", "，", ".", "!", "?", ";", " "];
  for (let i = slice.length - 1; i >= Math.max(0, slice.length - 200); i -= 1) {
    if (breakChars.includes(slice[i])) {
      return i + 1;
    }
  }
  return 0;
}

function renderPage(offset, options = {}) {
  const { pushHistory = true } = options;
  if (!readerEl) return;
  if (!fullText) {
    readerEl.textContent = "";
    pageInfoEl.textContent = "未加载";
    if (pageSlider) pageSlider.disabled = true;
    return;
  }

  const rect = readerEl.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    readerEl.textContent = fullText.slice(offset, Math.min(offset + 1000, fullLength));
    currentOffset = offset;
    nextOffset = Math.min(fullLength, offset + 1000);
    updateProgressView();
    return;
  }

  const maxStart = Math.max(fullLength - 1, 0);
  offset = Math.max(0, Math.min(offset, maxStart));
  let maxLen = fullLength - offset;
  if (maxLen <= 0) {
    readerEl.textContent = "";
    currentOffset = fullLength;
    nextOffset = fullLength;
    updateProgressView();
    return;
  }

  let low = Math.min(128, maxLen);
  let high = low;
  while (high < maxLen && measureFits(offset, offset + high)) {
    low = high;
    high = Math.min(maxLen, high * 2);
    if (low === high) break;
  }
  if (!measureFits(offset, offset + high)) {
    let left = low;
    let right = high;
    while (left + 1 < right) {
      const mid = Math.floor((left + right) / 2);
      if (measureFits(offset, offset + mid)) {
        left = mid;
      } else {
        right = mid;
      }
    }
    high = measureFits(offset, offset + right) ? right : left;
  }
  let finalLen = Math.max(1, Math.min(maxLen, high));
  const slice = fullText.slice(offset, offset + finalLen);
  const breakPoint = findBreakPoint(slice);
  if (breakPoint > 0 && breakPoint < finalLen) {
    finalLen = breakPoint;
  }
  if (finalLen <= 0) {
    finalLen = Math.min(64, maxLen);
  }

  const pageText = fullText.slice(offset, offset + finalLen);
  readerEl.textContent = pageText;
  currentOffset = offset;
  nextOffset = Math.min(fullLength, offset + finalLen);
  ensureReaderFits();

  if (pushHistory) {
    history = history.slice(0, historyIndex + 1);
    if (history.length === 0 || history[history.length - 1] !== currentOffset) {
      history.push(currentOffset);
    }
    historyIndex = history.length - 1;
  }

  updateProgressView();
  scheduleProgressSave();
}

function ensureReaderFits() {
  if (!readerEl || !fullText) return;
  while (readerEl.scrollHeight > readerEl.clientHeight + 1 && nextOffset > currentOffset + 1) {
    nextOffset -= 1;
    readerEl.textContent = fullText.slice(currentOffset, nextOffset);
  }
  if (nextOffset <= currentOffset) {
    nextOffset = Math.min(fullLength, currentOffset + 1);
  }
}

function scheduleProgressSave() {
  if (!invoke || !fullText) return;
  if (progressTimer) {
    clearTimeout(progressTimer);
  }
  progressTimer = setTimeout(() => {
    invoke("update_progress", { offset: currentOffset }).catch((err) => {
      console.debug("保存阅读进度失败", err);
    });
    progressTimer = null;
  }, 400);
}

function notifyTrayState() {
  if (!invoke) return;
  invoke("sync_tray_state", { minimal_mode: minimalMode }).catch((err) => {
    console.debug("同步托盘状态失败", err);
  });
}

function setMinimalMode(value, options = {}) {
  const notify = options.notify ?? true;
  const changed = minimalMode !== value;
  minimalMode = value;
  document.body.classList.toggle("minimal-mode", minimalMode);
  if (changed && notify) {
    notifyTrayState();
  }
}

function updateProgressView() {
  if (!pageInfoEl) return;
  if (!fullText) {
    pageInfoEl.textContent = "未加载";
    if (pageSlider) {
      pageSlider.disabled = true;
      pageSlider.value = "0";
    }
    return;
  }
  const percent = fullLength === 0 ? 0 : (currentOffset / fullLength) * 100;
  pageInfoEl.textContent = `进度 ${percent.toFixed(1)}%`;
  if (pageSlider) {
    pageSlider.disabled = false;
    pageSlider.value = Math.min(100, Math.max(0, Math.round(percent))).toString();
  }
}

async function loadDocument(path) {
  if (Array.isArray(path)) {
    path = path[0];
  }
  if (!invoke) return;
  try {
    const payload = await invoke("load_file", { path });
    applyDocumentPayload(payload);
  } catch (error) {
    console.error("加载失败", error);
  }
}

function applyDocumentPayload(payload) {
  if (!payload) return;
  fullText = payload.content ?? "";
  fullLength = fullText.length;
  currentOffset = Math.min(payload.offset ?? 0, fullLength);
  nextOffset = currentOffset;
  history = [];
  historyIndex = -1;
  const label = getFileName(payload.file_path);
  fileInfoEl.textContent = label;
  lastFileLabel = fileInfoEl.textContent;
  setMinimalMode(minimalMode);
  renderPage(currentOffset, { pushHistory: true });
}

async function restoreDocument() {
  if (!invoke) return;
  try {
    const payload = await invoke("current_document");
    if (payload && payload.content) {
      applyDocumentPayload(payload);
    }
  } catch (error) {
    console.debug("没有可恢复的文档", error);
  }
}

function goToNextPage() {
  if (!fullText || nextOffset <= currentOffset) return;
  renderPage(nextOffset, { pushHistory: true });
}

function goToPreviousPage() {
  if (!fullText || historyIndex <= 0) return;
  historyIndex -= 1;
  const target = history[historyIndex];
  renderPage(target, { pushHistory: false });
}

function jumpToOffset(offset) {
  offset = Math.max(0, Math.min(offset, fullLength));
  renderPage(offset, { pushHistory: true });
}

async function handleSearch(backwards = false) {
  if (!fullText) return;
  const query = searchInput.value.trim();
  if (!query) return;
  const textLower = fullText.toLowerCase();
  const queryLower = query.toLowerCase();
  let index;
  if (backwards) {
    const start = currentOffset > 0 ? currentOffset - 1 : 0;
    index = textLower.lastIndexOf(queryLower, start);
  } else {
    index = textLower.indexOf(queryLower, nextOffset);
    if (index === -1) {
      index = textLower.indexOf(queryLower, 0);
    }
  }
  if (index !== -1) {
    searchCursor = index;
    jumpToOffset(index);
  } else {
    console.debug("未找到匹配项");
  }
}

function setBossMode(value, options = {}) {
  const notify = options.notify ?? true;
  const changed = bossMode !== value;
  bossMode = value;
  document.body.classList.toggle("hidden-mode", bossMode);
  if (bossOverlay) {
    bossOverlay.hidden = !bossMode;
  }

  if (bossMode) {
    if (fileInfoEl) {
      lastFileLabel = fileInfoEl.textContent || "";
      fileInfoEl.textContent = "cargo build --release";
    }
    if (readerEl) readerEl.style.visibility = "hidden";
    if (bossLogEl) {
      bossLogEl.textContent = buildFakeLog();
    }
  } else {
    if (readerEl) readerEl.style.visibility = "";
    if (fileInfoEl) {
      fileInfoEl.textContent = lastFileLabel || "";
    }
    if (bossLogEl) {
      bossLogEl.textContent = "";
    }
    setMinimalMode(minimalMode);
    renderPage(currentOffset, { pushHistory: false });
  }
  if (changed && notify) {
    notifyTrayState();
  }
}

function toggleBossMode(notify = true) {
  setBossMode(!bossMode, { notify });
}

function buildFakeLog() {
  const now = new Date();
  const timestamp = now.toLocaleTimeString("zh-CN", { hour12: false });
  const duration = (Math.random() * 0.6 + 0.1).toFixed(2);
  const steps = [
    `[${timestamp}] cargo build --release --quiet`,
    `   Compiling workplace v0.1.0 (/Users/${navigator.userAgent.includes("Mac") ? "you" : "user"}/work.rs)`,
    `warning: unused variable 'focus_buffer'`,
    `   Finished release [optimized] target(s) in ${duration}s`,
    `[${timestamp}] cargo test --workspace --doc`,
    `   Running 12 tests`,
    `   Doc-tests productivity`,
    `   test result: ok. 12 passed; 0 failed; 0 ignored`
  ];
  return steps.join("\n");
}

function autoDim() {
  clearTimeout(hiddenTimeout);
  document.body.classList.remove("auto-hidden");
  hiddenTimeout = setTimeout(() => {
    if (!bossMode) {
      document.body.classList.add("auto-hidden");
    }
  }, 4000);
}

function setupEventListeners() {
  document.getElementById("open-file").addEventListener("click", async () => {
    const selected = await selectFileDialog();
    if (!selected) return;
    await loadDocument(selected);
  });
  document.getElementById("prev-page").addEventListener("click", goToPreviousPage);
  document.getElementById("next-page").addEventListener("click", goToNextPage);
  bossKeyBtn.addEventListener("click", () => toggleBossMode(true));
  if (bossExitBtn) {
    bossExitBtn.addEventListener("click", () => setBossMode(false));
  }

  searchBtn.addEventListener("click", () => handleSearch(false));
  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      handleSearch(event.shiftKey);
    }
  });

  pageSlider.addEventListener("change", (event) => {
    if (!fullText) return;
    const percent = Number(event.target.value) / 100;
    const targetOffset = Math.floor(percent * fullLength);
    jumpToOffset(targetOffset);
  });

  readerEl.addEventListener("click", goToNextPage);
  readerEl.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    goToPreviousPage();
  });

  window.addEventListener("mousemove", autoDim);
  window.addEventListener("keydown", (event) => {
    switch (event.key) {
      case "ArrowRight":
      case "PageDown":
      case " ":
        goToNextPage();
        break;
      case "ArrowLeft":
      case "PageUp":
        goToPreviousPage();
        break;
      case "Escape":
        if (bossMode) {
          setBossMode(false);
        } else {
          toggleBossMode();
        }
        break;
      case "h":
        if (event.altKey || event.metaKey) {
          event.preventDefault();
          setMinimalMode(!minimalMode);
        }
        break;
      case "f":
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          searchInput.focus();
        }
        break;
      default:
        break;
    }
  });

  window.addEventListener("beforeunload", () => {
    unlistenFns.forEach((dispose) => dispose());
  });

  autoDim();
}

const unlistenFns = [];

async function setupWindowHooks() {
  if (!appWindow) {
    console.error("无法获取当前窗口实例，窗口事件监听未启用。");
    return;
  }
  unlistenFns.push(
    await appWindow.listen("tauri://resize", () => {
      autoDim();
      if (!bossMode) {
        renderPage(currentOffset, { pushHistory: false });
      }
    }),
  );
  unlistenFns.push(await appWindow.listen("tauri://move", autoDim));
  unlistenFns.push(await appWindow.listen("tauri://focus", autoDim));
  unlistenFns.push(
    await appWindow.listen("boss-key-toggle", () => toggleBossMode(false)),
  );

  // 监听全局快捷键事件
  unlistenFns.push(
    await appWindow.listen("shortcut-boss-key", () => toggleBossMode(false)),
  );
  unlistenFns.push(
    await appWindow.listen("shortcut-prev-page", () => {
      if (!bossMode && currentOffset > 0) {
        prevPage();
      }
    }),
  );
  unlistenFns.push(
    await appWindow.listen("shortcut-next-page", () => {
      if (!bossMode && nextOffset < fullLength) {
        nextPage();
      }
    }),
  );
  unlistenFns.push(
    await appWindow.listen("shortcut-search", () => {
      if (!bossMode && searchInput) {
        searchInput.focus();
      }
    }),
  );

  unlistenFns.push(
    await appWindow.listen("ui-visibility", (event) => {
      let payload = event?.payload;
      if (typeof payload === "string") {
        try {
          payload = JSON.parse(payload);
        } catch (error) {
          console.debug("解析 ui-visibility 事件失败", error);
          payload = null;
        }
      }
      if (payload && typeof payload.minimal === "boolean") {
        setMinimalMode(payload.minimal, { notify: false });
      }
    }),
  );
  // 监听设置变更事件
  const handleSettingsChanged = (event) => {
    const settings = event?.payload;
    if (settings) {
      applySettings(settings);
    }
  };

  if (tauriApi.event?.listen) {
    try {
      const unlistenSettings = await tauriApi.event.listen("settings-changed", handleSettingsChanged);
      if (typeof unlistenSettings === "function") {
        unlistenFns.push(unlistenSettings);
      }
    } catch (error) {
      console.error("监听 settings-changed 事件失败:", error);
    }
  } else if (appWindow?.listen) {
    unlistenFns.push(
      await appWindow.listen("settings-changed", handleSettingsChanged),
    );
  }
}

// 将十六进制颜色转换为RGB
function hexToRgb(hex) {
  // 移除#号
  hex = hex.replace('#', '');

  // 处理3位的简写形式
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// 应用设置到主窗口
async function applySettings(settings) {
  try {
    // 应用外观设置
    if (settings.appearance) {
      // 窗口透明度
      const windowOpacity = (settings.appearance.window_opacity || 90) / 100;
      const textOpacity = (settings.appearance.text_opacity || 100) / 100;

      // 更新CSS变量
      document.documentElement.style.setProperty('--window-opacity', windowOpacity);
      document.documentElement.style.setProperty('--text-opacity', textOpacity);

      // 背景颜色处理
      const bgColor = settings.appearance.background_color || '#1b1f24';
      const rgb = hexToRgb(bgColor);

      // 更新窗口背景色和透明度
      const root = document.documentElement;
      if (rgb) {
        const normalizedOpacity = Math.max(0, Math.min(windowOpacity, 1));
        const baseColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${normalizedOpacity})`;
        const hiddenOpacity = Math.max(0, Math.min(normalizedOpacity * 0.25, 1));

        if (document.body) {
          document.body.style.backgroundColor = normalizedOpacity <= 0.01 ? 'transparent' : baseColor;
        }
        if (root) {
          root.style.setProperty('--bg-color', baseColor);
          root.style.setProperty('--bg-color-hidden', `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${hiddenOpacity})`);
        }
      } else {
        if (document.body) {
          document.body.style.backgroundColor = 'transparent';
        }
        if (root) {
          root.style.setProperty('--bg-color', 'transparent');
          root.style.setProperty('--bg-color-hidden', 'transparent');
        }
      }

      // 文字颜色
      const textColor = settings.appearance.text_color || '#d7dce2';
      if (root) {
        root.style.setProperty('--text-color', textColor);
      }
      if (document.body) {
        document.body.style.color = textColor;
      }
      if (readerEl) {
        readerEl.style.color = textColor;
        readerEl.style.opacity = textOpacity;
      }
// 字体大小和行高
      if (readerEl) {
        readerEl.style.fontSize = `${settings.appearance.font_size || 16}px`;
        readerEl.style.lineHeight = `${(settings.appearance.line_height || 18) / 10}`;
      }

      // 窗口行为设置
      if (appWindow) {
        if (appWindow.setAlwaysOnTop) {
          await appWindow.setAlwaysOnTop(settings.appearance.always_on_top !== false);
        }
        if (appWindow.setSkipTaskbar) {
          await appWindow.setSkipTaskbar(settings.appearance.show_in_taskbar === false);
        }
      }
    }

    // 应用阅读设置
    if (settings.reading) {
      const interval = settings.reading.auto_save_interval;
      if (typeof interval === "string") {
        setupAutoSave(interval);
      }
    }

    // 更新老板键显示
    if (settings.boss_key && bossKeyHintEl) {
      bossKeyHintEl.textContent = `快捷键: ${settings.boss_key}`;
    }

    // 如果正在阅读，重新渲染页面以应用新的分页设置
    if (fullText && settings.max_chars_per_page) {
      renderPage(currentOffset, { pushHistory: false });
    }

    console.log('设置已应用到主窗口');
  } catch (error) {
    console.error('应用设置失败:', error);
  }
}

// 设置自动保存定时器
let autoSaveTimer = null;
function setupAutoSave(interval) {
  // 清除之前的定时器
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }

  // 设置新的定时器
  if (interval === 'instant') {
    // 即时保存模式已在 updateProgress 中处理
    return;
  }

  const intervalMs = interval === '5' ? 5000 :
                     interval === '30' ? 30000 :
                     interval === '60' ? 60000 : 0;

  if (intervalMs > 0) {
    autoSaveTimer = setInterval(() => {
      if (currentOffset > 0 && fullText) {
        commitProgress();
      }
    }, intervalMs);
  }
}

async function hydrateSettings() {
  if (!invoke) return;
  try {
    // 获取完整的设置
    const settings = await invoke("get_all_settings");
    if (settings) {
      // 应用所有设置
      await applySettings(settings);
    }
  } catch (error) {
    // 如果新命令失败，尝试旧的方式
    try {
      const oldSettings = await invoke("app_settings");
      if (oldSettings?.boss_key && bossKeyHintEl) {
        bossKeyHintEl.textContent = `快捷键: ${oldSettings.boss_key}`;
      }
    } catch (fallbackError) {
      console.debug("读取配置失败", fallbackError);
    }
  }
}

async function init() {
  setupEventListeners();
  await setupWindowHooks();
  await hydrateSettings();
  readerEl.focus();
  await restoreDocument();
  notifyTrayState();
}

init();
