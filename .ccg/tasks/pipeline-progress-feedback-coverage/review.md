# Review — pipeline-progress-feedback-coverage

## Scope

- 统一阶段进度 payload：messageKey/messageParams、summaryKey/summaryParams、detail.kind 校验与 raw fallback。
- 覆盖 Story2Video、explainer、talking-head、cinematic、clip-factory、documentary、localization-dub、podcast-repurpose、videogen、smoketest。
- 检查失败、断点续传、并行资源生成、阶段完成补发、renderer 本地化和 Electron 打包文件集。

## Findings

- Critical: 无。
- Major: 无在当前实现与回归测试中确认的阻断问题。
- Warning: 无。所有改造执行器均至少有一条独立的开始/进行中或逐项计数、完成摘要回归；循环阶段同时断言 `detail.done/total`。
- Warning: electron-builder 报告 apps/desktop/.playwright-browsers 不存在；这是当前 worktree 的既有可选资源缺失 warning，未阻断打包，但真实 Playwright 运行前仍需按项目说明安装浏览器。
- Info: PipelineEngine 只接受 percent 单调不降，detail 计数由执行器维护；本次 Story2Video 资源总量改为“每个场景一个工作单元 + 每段 TTS”，避免视频成功/失败回退图片时分母漂移。

## Independent review evidence

- 内部独立探针 A：发现并核验 videogen 前置阶段静默、部分生成摘要语义和 Story2Video 资源分母风险；已修复前置阶段开始/完成反馈、部分摘要和资源计数。
- 内部独立探针 B：发现 videogen generate 的 0–35/35–100 单调进度、merge/render 以及其余流水线事件断言覆盖缺口；已补 videogen 关键回归，并补 cinematic、clip-factory、documentary、localization-dub、podcast-repurpose、smoketest 的独立事件回归。
- 外部 antigravity：wrapper 返回 eligibility failure，提示当前地区不可用。
- 外部 Claude：wrapper 启动后无输出，超过等待窗口后终止；未将其结果作为通过依据。

## Validation

- pnpm --dir apps/desktop exec vitest run ...：核心生命周期矩阵 12 files / 308 tests passed；videogen 定向回归 1 file / 36 tests passed，共 13 files / 344 tests。
- node .github/scripts/check-locale-sync.js --cjk：1499 baseline，no new hardcoded CJK。
- node .github/scripts/check-locale-sync.js --pair-base HEAD：pair check passed。
- node scripts/verify-worktree-deps.js：OK。
- pnpm --dir apps/desktop run build:vue：passed；仅既有 Rollup warnings。
- openspec validate pipeline-progress-feedback-coverage --strict：valid。
- pnpm --dir apps/desktop exec electron-builder --win --x64 --publish never：passed。
- ASAR and executable existence checks: passed。
- Final focused regression after fallback-count correction: Story2Video + videogen 143 tests passed。
- Final lifecycle matrix: 13 files / 344 tests passed。
- Cinematic render now creates its run output directory before copying the completed artifact; the new lifecycle regression exposed this pre-existing first-run failure mode.
- Packaged startup smoke: the environment rejected the hidden-process launch command before execution; electron-builder succeeded and the ASAR inspection confirmed `stage-progress.js`, `stage-executor.js`, and `videogen-stages.js` are packaged.
- git diff --check：no whitespace errors; Git reports expected LF/CRLF conversion warnings。

## Follow-up

- Push codex/pipeline-progress-feedback-v2, create PR, wait for CI, verify remote merge status, then archive the OpenSpec change and CCG task。
