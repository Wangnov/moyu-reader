# 目录记忆：src-tauri/icons

- 用途：保存由 `tauri icon` 生成的多平台图标资源（PNG/ICO/ICNS 及 Android/iOS 切片）。
- 工作流：更新 `icon.svg` 或 `icon.png` 源图后，运行 `npx @tauri-apps/cli icon icon.svg -o src-tauri/icons` 覆盖此目录。
- 注意：这些文件将打包进应用，提交前确认视觉效果与品牌一致。
