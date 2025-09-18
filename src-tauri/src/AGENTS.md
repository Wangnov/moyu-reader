# 目录记忆：src-tauri/src

- 用途：Rust 源码目录，模块化实现 Tauri 应用核心逻辑。
- 模块职能：
  - `main.rs` 负责窗口设置、插件注册、能力加载。
  - `app_state.rs` 提供全局状态与配置读写。
  - `commands.rs` 定义前端可调用的命令接口。
  - `novel.rs` 实现文本读取与分页算法。
  - `settings.rs` 管理持久化配置。
- 贡献规范：新增命令或状态字段需同步更新 `commands.rs` 和配置结构，确保线程安全。
