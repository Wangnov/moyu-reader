# 摸鱼小说阅读器 (moyu-reader)

一个用于“摸鱼”阅读纯文本小说的桌面浮窗：透明、无边框、可伪装成终端日志，支持老板键与隐藏界面。

## 主要特性
- **跨平台**：基于 Tauri + Rust + Vanilla JS，macOS/Windows 可运行。
- **透明置顶**：窗口默认无边框，支持拖动与八方向缩放，可叠加在 IDE/终端上。
- **真实分页**：前端根据窗口尺寸动态测量文本，内容随窗口大小自动重排。
- **进度记忆**：记录阅读偏移，重启后从上次位置继续；搜索、翻页、进度滑块均可用。
- **伪装模式**：老板键或“隐藏UI”切换为终端样式假界面，可快速恢复。

## 快速开始
```bash
npm install
npm run dev
```
首次运行会编译 Rust 端，耐心等待。开发模式下修改 `dist/` 或 `src-tauri/` 会自动热重载。

## 打包发布
```bash
npm run build
```
生成的安装包位于 `src-tauri/target/release/`。

## 目录结构
- `src-tauri/`：后端 Rust 代码、Tauri 配置与图标。
- `dist/`：前端静态资源（HTML/CSS/JS）。
- `docs/`：架构与记忆文档。
- `AGENTS.md` / `CLAUDE.md`：各目录的记忆说明（协作规范、经验、约束）。

## 注意
- 开发涉及第三方库或 API 前，请先使用 Context7 获取最新官方文档。
- 老板键默认 `Cmd+Shift+Space`（macOS）或 `Ctrl+Alt+Space`（Windows），可在配置中修改。

## 许可证
MIT License © 2025 Wangnov
