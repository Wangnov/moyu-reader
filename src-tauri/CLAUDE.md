# 目录记忆：src-tauri

- 用途：Rust/Tauri 后端核心代码与配置所在，负责窗口生命周期、命令、插件及权限声明。
- 关键文件：
  - `Cargo.toml` 管理依赖（Tauri、全局快捷键、对话框等）。
  - `tauri.conf.json` 定义窗口、能力集、前端资源路径。
  - `src/` 下各模块实现全文缓存、进度维护、命令接口。
  - `capabilities/`、`icons/` 存放权限与多平台图标。
- 维护点：变更权限或插件时需同步 `capabilities/default.json`；构建前确保 `cargo check` 通过。
