# 目录记忆：src-tauri

- 用途：Rust/Tauri 后端核心代码与配置所在，负责窗口生命周期、命令、插件及权限声明。
- 关键文件：
  - `Cargo.toml` 管理依赖（Tauri、全局快捷键、对话框等）。
  - `tauri.conf.json` 定义窗口、能力集、前端资源路径。
  - `src/` 下各模块实现全文缓存、进度维护、命令接口。
  - `capabilities/`、`icons/` 存放权限与多平台图标。
- 维护点：变更权限或插件时需同步 `capabilities/default.json`；构建前确保 `cargo check` 通过。

## Tauri v2 API 使用教训

### 事件系统
- **错误方法**：`app.emit_to()` 配合 `EventTarget::WebviewWindow` 发送窗口事件
- **正确方法**：直接获取窗口实例并使用 `window.emit()` 方法
- **原因**：Tauri v2 的事件系统架构变更，窗口事件应直接通过窗口实例发送

### 前端 API 引用
- **错误方法**：
  - 使用 `appWindow.onResized()` 和 `appWindow.onMoved()` 监听窗口事件
  - 假设 appWindow 对象直接具有 listen 方法
- **正确方法**：
  - 使用 `appWindow.listen("tauri://resize")` 和 `appWindow.listen("tauri://move")`
  - 正确引用 window API：先尝试 `getCurrentWindow()`，再回退到 `appWindow`
- **原因**：Tauri v2 统一使用 listen() 方法处理所有事件，窗口事件使用特定的事件名称格式

### 调试注意事项
- `open_devtools()` 方法在 debug 构建中返回 `()`，不是 `Result` 类型
- 前端错误会阻止后续代码执行，包括事件监听器注册
- 使用条件编译 `#[cfg(debug_assertions)]` 来包含调试专用代码