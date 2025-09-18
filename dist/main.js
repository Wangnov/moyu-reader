const tauriApi = window.__TAURI__ ?? {};
const invoke = tauriApi.tauri?.invoke ?? tauriApi.core?.invoke;
const dialogApi = tauriApi.dialog;
const openDialog = dialogApi?.open;
const appWindow = tauriApi.window?.appWindow ?? tauriApi.window;
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
const hideUIButton = document.getElementById("hide-ui");
const restoreUIButton = document.getElementById("restore-ui");

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

if (restoreUIButton) {
  restoreUIButton.hidden = true;
}

if (pageSlider) {
  pageSlider.min = "0";
  pageSlider.max = "100";
  pageSlider.value = "0";
}

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

function setMinimalMode(value) {
  minimalMode = value;
  document.body.classList.toggle("minimal-mode", minimalMode);
  if (restoreUIButton) {
    restoreUIButton.hidden = !minimalMode;
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

function setBossMode(value) {
  bossMode = value;
  document.body.classList.toggle("hidden-mode", bossMode);
  if (bossOverlay) {
    bossOverlay.hidden = !bossMode;
  }

  if (bossMode) {
    if (restoreUIButton) restoreUIButton.hidden = true;
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
}

function toggleBossMode() {
  setBossMode(!bossMode);
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
  bossKeyBtn.addEventListener("click", toggleBossMode);
  if (hideUIButton) {
    hideUIButton.addEventListener("click", () => {
      if (bossMode) {
        setBossMode(false);
      }
      setMinimalMode(true);
    });
  }
  if (restoreUIButton) {
    restoreUIButton.addEventListener("click", () => setMinimalMode(false));
  }
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
    await appWindow.onResized(() => {
      autoDim();
      if (!bossMode) {
        renderPage(currentOffset, { pushHistory: false });
      }
    }),
  );
  unlistenFns.push(await appWindow.onMoved(autoDim));
  unlistenFns.push(await appWindow.listen("tauri://focus", autoDim));
  if (listen) {
    unlistenFns.push(await listen("boss-key-toggle", toggleBossMode));
  }
}

async function hydrateSettings() {
  if (!invoke) return;
  try {
    const settings = await invoke("app_settings");
    bossKeyHintEl.textContent = settings?.boss_key ? `快捷键: ${settings.boss_key}` : "";
  } catch (error) {
    console.debug("读取配置失败", error);
  }
}

async function init() {
  setupEventListeners();
  await setupWindowHooks();
  await hydrateSettings();
  readerEl.focus();
  await restoreDocument();
}

init();
