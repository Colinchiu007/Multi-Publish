# 开发规范入口

> **重要**：完整且唯一的开发流程规范位于仓库根目录的 [AGENTS.md](../AGENTS.md)。
> 从 `01-docs/` 单独开始工作的工具必须继续读取该文件，不能把本页当作完整规范。

## 原因

本文件曾复制根目录规范，随后出现严重不同步，包括：

- Electron 版本过期（33.4.0 vs 实际 43.1.1）
- 打包命令过期（`npm run dist:win` vs 实际 `npm run build:win`）
- 测试数量和质量门禁统计过期
- 模块路径错误（如 `electron/video-uploader.js` 不存在）
- 缺失 QM-4 视觉回归测试框架
- 缺失 QM-5 Bug 修复协议
- 缺失质量节拍强制执行规则
- 缺失 IPC 三层防御架构说明
- 缺失新增模块（hotkeys、url-collector、system-tray 等）

## 维护规则

本文件只保留入口说明，不复制版本号、命令、测试数量或质量门禁内容。所有规范变更只修改根目录 `AGENTS.md`。
