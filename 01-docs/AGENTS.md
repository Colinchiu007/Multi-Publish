# 本文件已废弃

> **重要**：本文件已废弃，请参阅仓库根目录的 [AGENTS.md](../AGENTS.md) 获取最新开发流程规范。

## 原因

本文件与根目录 `AGENTS.md` 严重不同步：

- Electron 版本过期（33.4.0 vs 实际 43.1.1）
- 打包命令过期（`npm run dist:win` vs 实际 `npm run build:win`）
- 测试数量过期（56 个 vs 实际 4748+ 个）
- 模块路径错误（如 `electron/video-uploader.js` 不存在）
- 缺失 QM-4 视觉回归测试框架
- 缺失 QM-5 Bug 修复协议
- 缺失质量节拍强制执行规则
- 缺失 IPC 三层防御架构说明
- 缺失新增模块（hotkeys、url-collector、system-tray 等）

## 长期方案

考虑用符号链接替换本文件，指向根 `AGENTS.md`：

```bash
# Windows (需管理员权限)
mklink "01-docs\AGENTS.md" "..\AGENTS.md"

# Unix
ln -s ../AGENTS.md 01-docs/AGENTS.md
```

或保留本废弃通知，让 AI 工具读取时自动重定向到根目录。
