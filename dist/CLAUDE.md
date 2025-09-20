# 目录记忆：dist

- 用途：存放 Tauri 前端静态资源（`index.html`、`styles.css`、`main.js`），开发态直接由 `frontendDist` 引用。
- 特性：包含透明窗口 UI、老板键伪装层；分页/搜索逻辑基于前端 DOM 实测，自行维护阅读偏移并与 Rust 命令同步进度。
- 窗口边框修复：`main.js` 包含 `fixTransparentBorder()` 函数，通过动态切换装饰触发 Windows 窗口重绘，消除透明窗口边框问题。
- 更新指南：改动静态文件后需重新运行 `npm run dev` 以热重载；如引入新资产请评估是否需要加入构建或压缩流程。
