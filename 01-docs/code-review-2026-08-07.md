# 整体代码审查记录（2026-08-07）

> 触发：用户要求「审查现在整体的项目代码」。按质量节拍 Code Review 流程（AGENTS.md 阶段 6 + QM-2）执行。
> 范围：本次会话全部改动（`08fa84f..main`，16 提交/46 文件）+ 关键安全面（IPC/路径/凭据/shell/前端）+ 仓库现有检查脚本。

## 一、审查方法
1. 仓库现有门禁：`check-hardcoded-secrets.js`、`check-ipc-bridge.js`、Electron JS syntax、全量 Vitest、vite build。
2. 静态扫描：eval/new Function、v-html/innerHTML、console.log、硬编码等待、execFile/spawn、路径拼接、IPC sender 校验。
3. 关键代码深读：logger、governor、pipeline-engine、compose-engine、tts-voice、run-state-store、window.js IPC 注册。

## 二、门禁结果（全部通过）
- 无硬编码密钥；255 IPC handlers 全部桥接；Electron JS syntax 0 错误；全量 6325 用例通过；vite build 通过。

## 三、发现

### 🔴 CRITICAL
- 无。

### 🟠 MAJOR（本轮已修复）
1. **`pipeline-engine._history` 无限增长**（`pipeline-engine.js`）：每次 `_finalizeRun` 推入完整快照（含 context/params），无上限清理。→ 修复：`maxHistoryEntries`（默认 50，可注入），超限裁剪最旧；断点恢复跨重启依赖 RunStateStore 持久快照，不受影响。
2. **IPC 注册双机制不一致**：中心 handler 走 `phase5-ipc` 的 `controlledIpcMain`；window.js 对 10 个服务（batchManager 等）用「临时替换全局 `ipcMain.handle`」注册。两套都安全但机制重复、易回归。→ 修复：window.js 显式构造 `createAccessControlledIpcMain` 注入各服务 `registerIpcHandlers(controlledIpcMain)`；10 个服务支持 `injectedIpcMain` 参数（默认全局兼容测试）；删除全局 handle 替换 hack。
3. **`cloud-publisher.registerIpcHandlers` 的 `|| require("electron").ipcMain` 回退**：漏传参即绕过权限层。→ 修复：无注入时抛错（fail closed），强制走 access-controlled 通道。

### 🟢 MINOR（建议后续）
4. `logger.enqueueFileWrite`：appendFile 回调极端异常下 writeQueue 可能挂起，建议加超时兜底。
5. `CloudPublish.vue` 等组件 catch 里 `console.error(e)` 未走 `logs:error` 上报主进程日志。
6. 并发上限 2 为保守默认，未做机器资源自适应（PRD 已注明）。

### ℹ️ 已确认安全
- IPC sender 校验：全部通道经 `createAccessControlledIpcMain`（sender + 权限 + entitlement）双重保护，两套注册路径一致。
- 路径：credential owner `sha256`、`run-state` safeId、`safeVoiceId`（拒路径分隔符/`..`）、story2video-paths 白名单。
- 凭据：safeStorage 加密 + 日志脱敏（Bearer/apiKey/sk-）。
- Shell：`spawn` `shell:false` + 参数数组 + PRAGMA 白名单 + publish-alert 单引号转义。
- 无 `eval`/`new Function`/`v-html`/`innerHTML`；生产 console 仅错误/警告路径。
- compose 分块中间文件由 `_cleanupSession` 清理 + 24h 残留兜底。

## 四、修复分支与回归
- 分支：`fix/code-review-major-1-3`（PR #381）。
- 回归：window.test.js（46）+ resume-orchestration（12，含 history 上限新用例）+ 各服务测试通过；全量 Vitest 待 CI。
