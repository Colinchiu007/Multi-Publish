# Review: s2v-result-success-error-boundary

## 变更类型
M 复杂度 / 中风险 Bug 修复：涉及 Electron 主进程流水线终态、renderer 结果页错误边界、i18n 和测试。

## QM-5 根因与逃逸链
- 第一性原因：`pipeline-engine.js` 的 `_advanceRun` 先发送 `pipeline:complete`，再由 `_finalizeRun` 同步保存 Story2Video 项目，形成约 1.15 秒的结果页读取竞态；`ResultView.vue` 的大范围 `try/catch` 又将附加预览资源失败升级为任务级失败。
- 逃逸链：单测未锁定完成事件与 `saveRun` 的顺序；结果页测试未覆盖“项目/成片成功但旁白或场景 URL 失败”的组合；E2E/视觉回归未模拟该 IPC/磁盘时序。
- 系统性漏洞：测试场景缺失 + 错误边界审查盲区。

## 主代理审查
- `pipeline:complete` 只在 `_finalizeRun` 返回后且 `run.status === completed` 时发送。
- 项目保存异常会把 run 与最后阶段标为 `failed`，保存失败快照，并返回 `STORY2VIDEO_PROJECT_SAVE_FAILED`；不会返回 completed。
- `_executeStage` 和 `advanceToNextCheckpoint` 均传播推进失败，不会吞掉持久化错误。
- ResultView 项目读取、成片 URL、旁白 URL、场景素材 URL 独立容错；播放器 `error` 使用预览级文案。
- zh/en 文案成对修改；CJK 基线重锚前后均为 1530 条，复跑无新增硬编码。

## 外部审查降级
- antigravity：按流程并行调用，因当前账号所在地区不可用（Eligibility check failed）退出，无审查结果。
- Claude：按流程并行调用，wrapper 以 status 1 退出且无输出；未将无输出视为通过。
- 降级后由主代理按终态传播、错误边界、i18n、Electron 产物和测试清单完成复核。

## 验证证据
- 定向 Vitest：`pipeline-engine.test.js` + `ResultView.test.js`，86/86 通过。
- 依赖解析：`node scripts/verify-worktree-deps.js` 通过。
- locale：`--cjk` 通过；zh/en pair check 通过。
- OpenSpec：`openspec validate s2v-result-success-error-boundary --strict --no-interactive` 通过。
- renderer 构建：`apps/desktop` `pnpm run build:vue` 通过。
- Electron 打包：`pnpm exec electron-builder --win --dir --publish never` 通过；ASAR 含 pipeline、preload 和 ResultView 产物；pipeline-engine ASAR require 通过；打包应用启动 8 秒存活。

## 结论
无 Critical。主代理审查无新增 Warning；可进入提交与 PR/CI 阶段。
