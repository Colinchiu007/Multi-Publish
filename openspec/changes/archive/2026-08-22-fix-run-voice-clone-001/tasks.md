# 实施清单

- [x] 基线差异审计：确认 d2b1b31dc 已交付 fail-closed，但未修 legacy 重试后端。
- [x] 创建 CCG task、worktree 和 codex/fix-run-voice-clone-001 分支。
- [x] 为 generate_assets legacy 重克隆补回归测试。
- [x] 为 finalize_assets legacy 重克隆补回归测试。
- [x] 让两条 TTS 阶段复用初始后端选择。
- [x] 通过真实 PipelineEngine + StageExecutor 调度链补 E2E 回归。
- [x] 运行 targeted Vitest、相关测试和 Electron 打包门禁。
- [x] 双模型审查最终 diff，记录 review.md。
- [x] 记录远程状态并归档 OpenSpec/CCG 工件。
