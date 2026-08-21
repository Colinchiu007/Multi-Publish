# Review: 克隆音色被替换为模型官方音色修复

Task: fix-s2v-cloned-voice-selection
Branch: codex/fix-s2v-cloned-voice-selection
Date: 2026-08-22

## 双模型审查记录

按 CCG 要求调用 opencode 与 Claude 双模型 reviewer，共尝试 3 轮：

| 轮次 | opencode | Claude |
|------|----------|--------|
| 1（文件引用方式） | 返回通用空回复（未读到 diff） | wrapper exit 1，无 agent message |
| 2（diff 内联短版） | 通用空回复 | wrapper exit 1，无 agent message |
| 3（diff 内联完整版） | wrapper "The command line is too long" exit 1 | wrapper exit 1，无 agent message |

结论：外部双模型 wrapper 在本机不可用，符合仓库既有降级通道（详见 .quality-gates.md 中多次记录）。以下为本地严格审查结论。

## 本地审查

范围：`git diff`（minimax-tts.js / minimax-tts.test.js / story2video-stages.js / story2video-stages.test.js / PRD / OpenSpec / quality-gates）。

### Critical（0）

无。

### Warning（0）

无。

### Info

1. `minimax-tts.js cloneVoice`：`base_resp.status_code` 缺失或为 0 时仍保留“本地生成 id 回退”兼容逻辑。若未来 MiniMax 移除回显字段，可能继续产生不可用克隆；当前官方接口成功必须返回 voice_id，且保留回退与既有测试兼容，故列为 Info 而非 Warning。
2. `story2video-stages.tryReCloneVoice`：行为反向变更（#1075 默认音色兜底被移除）。这与 PRD 7.1.16.1 Layer 3「正常报错」一致，且与 `regenerateSceneAudio` 行为对齐；若产品后续希望“默认音色兜底”，需显式增加用户确认/可见提示，不能静默替换。
3. eslint 存量 error（`no-useless-assignment` / `no-empty` 等）位于未改动行，属仓库既有问题，不在本 diff 新增。

## 结论

RECOMMENDATION: PASS（本地审查 + 聚焦测试全绿；全量 Vitest 与构建证据另行记录）。
