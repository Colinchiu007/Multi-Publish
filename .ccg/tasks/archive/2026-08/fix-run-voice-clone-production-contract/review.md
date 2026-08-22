# Review

## QM-5 根因溯源

`git blame` 显示缺陷落在 `6f2ec3f98`（2026-08-18，统一 `tryReCloneVoice` helper）。该 helper 使用 `manager.getAdapter(providerId)` 获取适配器并直接调用 `cloneVoice`，但生产 `ModelProviderManager` 的公开调用边界是 `callAdapter(providerId, method, params)`；`getAdapter()` 只存在于底层 adapter registry/旧测试 double，不是生产 manager API。此前 `f7d2138a6` 已修复 legacy Python TTS 重试时误用 `assetGenerator`，`d2b1b31dc` 已修复 MiniMax 业务错误 fail-closed，但两者都没有修复这条生产 manager 契约错位。

真实运行 `run_1787360004146_izko` 时，初始 TTS 返回 `you don't have access to this voice_id`，重克隆阶段因为生产 manager 没有 `getAdapter()` 而直接落入 `TTS adapter does not support cloneVoice`，最终没有使用用户选择的“音色001”。

## 逃逸链

- **单元测试**：旧的 `tryReCloneVoice` fixture 自己提供 `getAdapter()`，只验证 clone/retry 的结果，不验证生产 `ModelProviderManager` 的接口形状。
- **集成测试**：legacy `generate_assets`/`finalize_assets` 已覆盖 TTS 后端复用，但 clone manager 仍是旧 double，未经过真实 `callAdapter` 包装结果 `{ code, data }`。
- **E2E**：既有流水线 E2E 没有在已登录 profile 上制造“跨账号 clone voice 不可用 → 真实 manager 重克隆 → 复用新 voice_id”的场景，因此没有触达主进程 provider manager 边界。
- **视觉测试**：只能验证 renderer 状态与页面结果，无法覆盖 Electron 主进程中的 adapter 选择和 API key 注入。
- **审查**：此前审查关注 fail-closed 和 legacy/assetGenerator 分叉，遗漏了测试 double 与生产 manager API 的契约差异。

系统性漏洞分类：**测试场景缺失 + 测试 double 与生产接口契约不一致 + 主进程真实 E2E 覆盖不足**。

## 修复

- `tryReCloneVoice()` 优先调用生产边界 `manager.callAdapter(voiceProvider, 'cloneVoice', cloneParams)`，由 manager 负责 provider 凭据注入、能力检查和 adapter 调用。
- 统一处理 `{ code, data, error, message }` 包装结果，从 `cloneResult.data.id` 读取新 voice ID；非零 code、缺少 id、clone/retry 失败均 fail-closed。
- 保留 `getAdapter()` 兼容分支，避免旧调用方/测试 double 立即破坏，但生产路径不再依赖它。
- 重克隆成功后仍复用原始 TTS 后端和参数，只替换 `voice_id`，不静默切换 provider 官方默认音色。

## 回归保护

- `story2video-stages.test.js` fixture 改为生产 `callAdapter()` 契约，并断言 provider、方法、clone 参数和包装结果。
- legacy `generate_assets` 与 `finalize_assets` 回归继续断言两次 `generate_tts`，第二次使用新 voice ID，且不出现 `default`。
- 定向 Vitest：`story2video-stages.test.js`、`pipeline-story2video-contract.test.js`、`model-provider-call-adapter.test.js`、`minimax-tts.test.js` 共 **258 passed**。
- `node scripts/verify-worktree-deps.js`、变更文件 ESLint、`node --check`、`git diff --check` 均通过。

## 真实环境 E2E

使用已登录调试 profile `D:/tmp/Multi-Publish-debug-profile` 重启 Electron，并运行 template 策略：

- run：`run_1787383680119_kba0`（项目原始问题：`run_1787360004146_izko`，voice ID：`MiniMaxCloneVoice_00jngz`）
- 初始 TTS 失败：`you don't have access to this voice_id`。
- 真实日志出现：`re-clone success: MiniMaxCloneVoice_00jngz -> MiniMaxMiniMaxCloneVoice_00jngz_0v9n9j`，随后继续 `AssetGenerator TTS 0 via provider minimax-multimodal`。
- 未出现该 run 的 `TTS adapter does not support cloneVoice` 或 `falling back to default TTS voice`。
- 状态：`completed`；split、scene_context、optimize、select_video_scenes、generate_assets、compose 完成，publish 按未启用配置 `skipped`。
- 资产证据：`audioMeta.provider=minimax-multimodal`、`source=model-provider`、`degraded=false`。
- 成片：`D:/Temp/mp-real-e2e-voice-001-rerun/voice-clone-rerun.mp4`；ffprobe 确认 H.264 1920x1080/30fps + AAC，时长 5.364 秒，1,335,739 bytes。
- 完整报告：`D:/Temp/mp-real-e2e-voice-001-rerun/report.json`；应用日志：`D:/tmp/Multi-Publish-debug-profile/logs/app-2026-08-22.log`。

## 打包门禁

- `electron-builder --win --dir --publish never` 已通过。
- ASAR 清单包含 `electron/services/story2video-stages.js`、对应测试、`model-provider-manager.js` 和 `adapters/minimax-tts.js`。
- 抽取 `app.asar` 后真实加载 `story2video-stages.js`：`require OK`。
- 使用干净临时 profile `D:/Temp/mp-packaged-smoke-profile-voice-clone-20260822` 启动打包版；8 秒检查点进程仍存活，runner 随后结束进程，`stderr` 为空。

## 审查与远程状态

- 外部 OpenCode/Claude wrapper 本轮不可用（无有效报告，已停止），不能标记为外部审查通过。主代理按文件/行号完成本地审查，未发现 Critical/Warning。
- PR #1099：`https://github.com/Colinchiu007/Multi-Publish/pull/1099`，当前 `OPEN`，主要 CI（QG Static/Unit/Coverage/Desktop Shards/Browser E2E/Visual/Autonomous、Windows/Ubuntu build、Electron/GUI/visual-test、Lint）为成功；已知 `文档同步检查` 失败，`mergeCommit=null`。
