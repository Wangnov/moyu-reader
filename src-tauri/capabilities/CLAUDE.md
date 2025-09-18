# 目录记忆：src-tauri/capabilities

- 用途：存放 Tauri v2 capability 声明，当前 `default.json` 授权窗口拖拽、对话框、事件、全局快捷键等。
- 原则：新增窗口或插件时，应在此新增或扩展 capability，并在 `tauri.conf.json` 中引用。
- 注意：精简权限，避免多余授权；更新后需重启 `tauri dev` 以加载最新配置。
