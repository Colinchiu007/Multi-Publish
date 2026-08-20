# Review: fix-optimize-empty-reasoning-fallback

## 问题根因
用户最新视频任务在「提示词优化」阶段失败且无错误提示。运行状态快照显示：

`Story2Video optimize failed: Story2Video 场景 1 prompt-engine 优化失败: LLM 返回了空内容或仅包含推理内容，未生成有效优化词`

根因链条：
1. 推理模型（如 DeepSeek）把完整思考过程写进输出，未返回可用的最终优化词；
2. prompt-engine 剥离推理块后内容为空，返回失败；
3. Multi-Publish optimize 阶段在 `!validated.ok` 时仅识别「过短」类拒绝并回退原文，其余直接 `throw` → 整条流水线失败；
4. 失败时 `stage.error` 未落到阶段对象，UI 不展示任何提示（该层已由 PR #1068 修复）。

## 修复
- `story2video-stages.js` 新增 `isPromptEngineEmptyReasoningError()`，识别「空内容/仅包含推理内容/未生成有效优化词」类错误。
- optimize 阶段对这类错误与 Too short 一致：回退原文并标记 `skipped_optimize` / `optimize_note='prompt_engine_empty_reasoning_use_original'`，流水线继续不失败。
- 新增回归测试（回退原文路径 + 判定函数 + 不误判用例）。

## 验证
- `story2video-stages.test.js` 128 passed。
- `stage-executor / pipeline-engine / e2e-pipeline-orchestrator / prompt-engine-contract / story2video-project-service` 303 passed。
- `node --check` 通过；`verify-worktree-deps.js` 通过。
- quality-rhythm-wrapper Bug 修复 checklist 全绿。

## 审查结论
- Critical: 无
- Warning: prompt-engine 侧若同时加「剥离后为空 → 有界重试/回退」会更彻底；当前调用方兜底已保证任务不失败。
- Info: 本修复在隔离 worktree 完成，共享根由 Write Guard 保护零落盘。
