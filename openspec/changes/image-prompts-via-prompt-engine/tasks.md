# Tasks — image-prompts-via-prompt-engine

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD），每个任务标注测试目标。

## 审计与前置

- [x] 基线差异审计：核对 origin/main 已合并交付（PR #405/#417/#418 不涉及本能力；本地 main 落后 origin 4 提交，分支从最新 origin/main 创建）；现状确认：story2video_optimize 直接调默认 LLM，manifest 已声明 prompt-engine 契约但未启用。证据：story2video-stages.js:323-417、story2video-text-config.js:31-35/96-104、story2video-compose.yaml:199-221
- [x] prompt-engine 契约核实：/v1/optimize 请求/响应字段与边界（models.py:126-190、rest.py:39-75）；本地 python 可 import、.env 已配 key（外部验收边界）
- [x] OpenSpec change 创建：proposal → design → specs → tasks（本文件）

## 实现（codex/image-prompts-via-prompt-engine 分支）

### 任务 1：配置契约扩展（story2video-text-config）
- [x] `optimize` 配置新增 platform/maxLength/numCandidates/autoDetectStyle/context，默认值 platform=generic、maxLength=300、numCandidates=1、autoDetectStyle=true、context=空；范围校验对齐 prompt-engine（platform 7 枚举、maxLength 50-2000、numCandidates 1-5、context 字符串→{synopsis}）
- [x] 风格/平台别名映射表（cinematic→photography、3d-render→3d_render、dall-e→dalle、stable-diffusion→stable_diffusion），非法值回退默认
- [x] stageOptions.optimize 输出 prompt-engine 请求字段（platform/style/creative_level/max_length/negative_prompt/num_candidates/auto_detect_style/context）
- [x] 测试：story2video-text-config.test.js 新增枚举/范围/别名/兼容/越界用例（含 prompt-engine 边界）
- 测试目标：`apps/desktop/electron/services/story2video-text-config.test.js`

### 任务 2：story2video_optimize 阶段改走 prompt-engine（story2video-stages）
- [x] OPTIMIZE 执行器改为 PromptBridge.optimize（POST /v1/optimize），请求携带平台/风格/创意/长度/负向/候选数/自动检测/上下文；保留并发/重试/断点续传/进度
- [x] 输出校验 fail closed：optimized_prompt 非空、超长截断+警告、error 非空失败、detected_categories 保留
- [x] 移除「直接调默认 LLM」路径（buildOptimizationRequest 删除或弃用）；PromptBridge 不可用时明确错误
- [x] 测试：story2video-stages.test.js 重写 OPTIMIZE 用例（mock PromptBridge 请求体断言 + 空/超长/error 失败 + 续传 + 并发保序）
- 测试目标：`apps/desktop/electron/services/story2video-stages.test.js`

### 任务 3：通用 OPTIMIZE/OPTIMIZE_BATCH 参数对齐
- [x] 通用 StageExecutor OPTIMIZE/OPTIMIZE_BATCH 复用同一别名归一与请求字段映射（从 text-config 导出映射表）
- [x] 测试：stage-executor.test.js 补充平台/风格别名归一 + 参数透传断言
- 测试目标：`apps/desktop/electron/tests/stage-executor.test.js`

### 任务 4：契约与 E2E 测试对齐
- [x] pipeline-story2video-contract.test.js：optimize 默认选项断言更新（含 prompt-engine 字段），「默认 LLM」断言改为 prompt-engine 契约
- [x] e2e-pipeline-orchestrator.test.js：注释/夹具改为 mock PromptBridge（不回退真实 8013）
- 测试目标：`apps/desktop/electron/tests/pipeline-story2video-contract.test.js`、`apps/desktop/electron/tests/e2e-pipeline-orchestrator.test.js`

### 任务 5：文档与门禁记录
- [x] 01-docs/PRD.md、01-docs/PRD-video-creation.md：图片提示词统一走 prompt-engine 的流程/参数/校验/交互/提示文字（详细）
- [x] 01-docs/learnings.md：追加本变更复盘（设计↔实现背离修复、fail-closed 决策）
- [x] CHANGELOG.md 追加
- [x] .quality-gates.md 追加本次执行记录
- [x] story2video-compose.yaml 描述与 runtime_defaults 保持一致性核对（已声明，无需改则记录）
- 测试目标：文档一致性（无需运行测试）

## 验证与交付

- [x] 聚焦回归：story2video-stages / story2video-text-config / stage-executor / pipeline-story2video-contract / e2e-pipeline-orchestrator 相关测试通过（self-hosted Vitest 串行）
- [x] 双模型审查（antigravity + Claude；antigravity 因 agy 不在 PATH 降级记录，Claude 独立复审 git diff）
- [x] 本地打包验证（QM-1：改动 apps/desktop/electron 下代码必须 electron-builder 通过）—— 视本次改动是否需要（仅 services 层 + 测试，若判定无需打包则记录理由）
- [x] 提交（codex/image-prompts-via-prompt-engine）→ push → PR → CI → 合并回 main
- [x] 重启 Electron 应用：可见主窗口 + MainWindowHandle 非零 + 标题（multi-publish-desktop-start 流程）
- [x] OpenSpec archive + CCG task 归档 + 质量节拍复盘（三同步，一次 commit）
- [x] 记忆更新（用户显式要求：ad_hoc note）
