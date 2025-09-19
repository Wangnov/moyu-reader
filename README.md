<h1 align="center">摸鱼小说阅读器 · Moyu Reader</h1>

<p align="center">
  <img alt="license" src="https://img.shields.io/github/license/Wangnov/moyu-reader?color=4c6ef5" />
  <img alt="tauri" src="https://img.shields.io/badge/Tauri-v2-blue.svg" />
  <img alt="rust" src="https://img.shields.io/badge/Rust-2021-orange.svg" />
  <img alt="status" src="https://img.shields.io/badge/status-active-success.svg" />
</p>

<p align="center">
  <a href="https://github.com/Wangnov/moyu-reader">GitHub</a>
  ·
  <a href="#%E5%BF%AB%E9%80%9F%E5%BC%80%E5%A7%8B">快速开始</a>
  ·
  <a href="#%E4%B8%BB%E8%A6%81%E7%89%B9%E6%80%A7">功能列表</a>
  ·
  <a href="#%E7%BB%93%E6%9E%84%E6%A6%82%E8%A7%88">结构概览</a>
</p>

---

一个用于“摸鱼”的小说阅读浮窗：透明、无边框、可伪装成终端日志，支持老板键与隐藏 UI，让小说悄悄叠在 IDE/终端之上。

## ✨ 主要特性
- **跨平台桌面应用**：基于 Tauri v2 + Rust + 原生 HTML/CSS/JS。
- **透明置顶**：窗口默认无装饰，支持拖动、八方向缩放，可与工作窗口融为一体。
- **真实分页**：前端根据容器尺寸实时测量文本，窗口大小改变时自动重新排版。
- **阅读进度记忆**：按字符偏移保存阅读位置，重新打开继续阅读。
- **伪装模式**：老板键一键切换到终端日志界面，可随时恢复小说视图。
- **快捷搜索与翻页**：键盘、鼠标、滑块均可翻页；搜索支持正/反向跳转。

## 🚀 快速开始
```bash
npm install
npm run dev
```
> 首次运行会编译 Rust 端，请耐心等待。`npm run dev` 会直接加载 `dist/` 静态资源并热重载。

### 构建发布
```bash
npm run build
```
生成的安装包位于 `src-tauri/target/release/`。

## 🗂 结构概览
| 目录 | 说明 |
| --- | --- |
| `src-tauri/` | Rust/Tauri 后端：窗口 lifecycle、全文缓存、进度保存、权限声明 |
| `dist/` | 前端静态资源：透明 UI、DOM 实测分页、老板键伪装、隐藏 UI |
| `docs/` | 架构文档与记忆说明（配合 `AGENTS.md`） |
| `AGENTS.md` / `CLAUDE.md` | 各级目录的协作记忆文档，记录约束与经验 |

## 🧭 推荐工作流
1. **开发前先查文档**：使用 Context7 获取第三方库/Tauri API 的官方更新。
2. **运行调试**：`npm run dev` + 开发者工具；必要时使用 `Cmd+Opt+I` / `Ctrl+Shift+I`。
3. **隐藏 UI**：老板键或标题栏的 “隐藏UI” 按钮；最小化后可通过右下角的 “显示界面按钮” 恢复。
4. **自定义图标**：修改 `icon.svg`/`icon.png` 后运行 `npx @tauri-apps/cli icon icon.svg -o src-tauri/icons`。

## 🧪 状态说明
- 前端 DOM 分页通过单元测试验证字符偏移还原；后端测试覆盖进度持久化。
- 所有命令均通过 capability 精准授权；默认 Boss 键 `Cmd+Shift+Space`（macOS）或 `Ctrl+Alt+Space`（Windows）。

## 📄 许可证
本项目基于 [Apache License 2.0](LICENSE) 许可分发。

---
> 🐟 “摸鱼”也要讲究隐蔽与效率 —— 祝你阅读愉快。
