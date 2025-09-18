# 摸鱼小说阅读器架构草案

## 目标
- 提供透明、无边框、始终置顶的小说阅读窗口，用于“融入”IDE/终端界面。
- 允许快速加载本地 txt 小说，支持翻页、搜索定位、老板键伪装等摸鱼场景所需能力。
- 后端使用 Rust + Tauri（v2），前端采用原生 HTML/CSS/JS，保持依赖最小化以降低暴露风险。

## 目录概览
```
├── docs/
│   └── architecture.md        # 架构草案与需求描述
├── dist/                      # 前端静态资源（Tauri 使用内置静态服务器加载）
│   ├── index.html             # 主页面与结构
│   ├── styles.css             # 透明、伪装主题、交互样式
│   └── main.js                # 前端交互脚本
├── icon.svg                   # 用于生成多平台图标的源文件
├── package.json               # Node 脚本与 Tauri CLI 依赖
├── src-tauri/
│   ├── Cargo.toml             # Rust 依赖与构建配置
│   ├── build.rs               # Tauri 构建脚本
│   ├── tauri.conf.json        # Tauri v2 配置（窗口、前端资源路径）
│   └── src/
│       ├── main.rs            # Tauri 入口，窗口配置、快捷键注册、命令绑定
│       ├── app_state.rs       # 应用状态（全文缓存、当前偏移、配置）
│       ├── commands.rs        # 向前端暴露的命令：加载全文、恢复进度、保存偏移、配置查询
│       ├── novel.rs           # 文本读取与编码探测
│       └── settings.rs        # 配置文件读写（boss key、阅读偏移等）
└── src-tauri/icons/           # 由 `tauri icon` 命令生成的多尺寸图标
```

## 模块划分
### Rust 后端（`src-tauri/src`）
- `main.rs`
  - 初始化透明置顶窗口（禁用装饰，维持可缩放能力）。
  - 管理全局状态 `AppState`，在 setup 阶段恢复上次阅读进度。
  - 注册全局老板键（默认 Ctrl+Alt+Space / Cmd+Shift+Space）并向前端广播事件。
  - 暴露 `load_file`、`current_document`、`update_progress`、`app_settings` 等命令。
- `app_state.rs`
  - 使用 `RwLock` 保护 `StateSnapshot`，包含全文缓存、当前偏移、配置。
  - 提供 `snapshot`、`write`、`save_config` 等便捷方法，统一配置持久化。
- `novel.rs`
  - 负责读取 txt 文件并进行编码检测，向上层返回统一的 `String`。
- `commands.rs`
  - 实现全文加载、进度更新、配置查询逻辑，并保证配置文件即时同步。
- `settings.rs`
  - 负责配置的序列化/反序列化，确定默认 boss key、阅读偏移等。
  - 提供默认路径（`$CONFIG_DIR/<identifier>/moyu-reader-config.json`）。

### 前端静态页（`dist/`）
- `index.html`
  - 无边框自定义 UI，包含阅读区域、分页状态、搜索框、老板键提示。
  - 使用不可见 resize handle 覆盖八个方向，配合 Tauri `startResize` 完成自定义缩放。
- `styles.css`
  - 透明背景 + 毛玻璃效果，终端/IDE 式配色，隐藏模式降透明度。
  - 设计搜索栏、进度滑块、按钮 hover 等细节，保证鼠标区域 `-webkit-app-region: no-drag` 合理划分。
- `main.js`
  - 通过 `window.__TAURI__` API 调用 Rust 命令。
  - 缓存全文并基于真实 DOM 渲染测量决定每页容量，维护阅读偏移、历史栈与进度保存。
  - 侦听全局事件：老板键、窗口焦点、尺寸变化，维护自动隐身效果。
  - 负责拾取 resize handle 并调用 `appWindow.startResize(direction)`。

## 数据流
1. 用户点击“打开小说”或拖入 txt -> 前端调用 `invoke("load_file")`，获得全文和上次阅读偏移。
2. 后端只负责读取文本和记录当前偏移，全文缓存在前端。
3. 前端根据容器尺寸动态测量展示多少字符，并渲染当页内容。
4. 翻页（鼠标/键盘/滑块/搜索）均在前端执行，随后调用 `update_progress` 更新后端偏移。
5. 老板键由 Rust 全局快捷键触发，向前端发送 `boss-key-toggle` 事件，前端进入伪装模式。
6. 应用启动时，`main.rs` 尝试恢复最后阅读的文件与偏移，前端初始化即获取到当前片段。
7. 窗口尺寸变化时，前端重新测量可渲染字符数并刷新当前视图，偏移不变，实现无缝衔接。

## 当前 MVP 能力
- 透明置顶窗口，支持鼠标拖动与自定义缩放，自动淡出降低存在感。
- 加载本地 txt（UTF-8/GBK 自动检测），前端按窗口尺寸动态分页并记忆阅读偏移。
- 鼠标点击、滚轮、键盘 PgUp/PgDn、滑块拖动均可翻页，进度自动回写。
- 搜索框支持正向搜索，Shift+Enter 反向搜索，快速定位内容。
- 老板键与按钮双重触发伪装模式，展示伪终端输出，ESC/再次触发恢复。
- 配置文件存储最大字符数、老板键、最近文件 & 页码。

## 后续可扩展方向
- Boss 模式自定义主题（VS Code 面板、CI 日志、监控面板等）。
- 点击穿透与“按住某键才可交互”机制，进一步降低被发现概率。
- 多书签、章节索引、按章节/自然段分页选项。
- 托盘/菜单栏入口，快速切换小说或调整透明度。
- 自动同步云端小说、支持不同编码与目录结构。
- 加入简单统计与提醒（看太久提示休息等）。

## 文档参考（Context7 摘要）
- **Tauri 能力体系**：`app.security.capabilities` 在配置中显式列出 `default` 后，仅加载对应 capability；窗口拖拽 (`core:window:allow-start-dragging`)、无边框缩放 (`core:window:allow-start-resize-dragging`)、`set_title_bar_style`、`set_always_on_top` 等命令必须在 capability 中授权。
- **插件权限默认值**：`tauri-plugin-global-shortcut` 默认不开放任何命令，需要显式允许运行（`global-shortcut:allow-register` 等）；`tauri-plugin-dialog` 默认启用 `allow-open/save/ask/confirm/message`，仍建议在 capability 中记录。
- **窗口 API 要点**：Tauri v2 推荐使用 `appWindow.startResize(direction)`、`appWindow.onResized` 等事件；若前端未注入窗口 API，需要降级提示，避免直接报错。`windows[].devtools = true` 可在开发时启用 DevTools。
- **资料来源**：上述要点来自 Context7 对 `/tauri-apps/tauri` 权限参考、`@tauri-apps/cli` 配置 schema 以及 `tauri-plugin-global-shortcut` 默认权限文档的最新抓取。
