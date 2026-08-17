# Proposal: autonomous-loop-visual-vision-judge

## Why
autonomous-loop 视觉判定的 `AgentVisualJudge` 之前只把图片路径当文本发给远程 LLM（远程 API 无法 view_image），模型根本看不到像素，diff 判定退化为文本猜测；本轮把像素 diff/基线/当前截图以 base64 内联真传给支持视觉的模型，自动判 expected/regression/noise，不确定才交人工。审查发现接线死穴（llmFn 未注入 TestOrchestrator）、workflow 布尔陷阱（显式 false 被 `|| ''` 吞掉）、失败兜底 fail-open（LLM 异常绕开人工直接 UPDATE_BASELINE）三类缺陷，需一并修复。

## What Changes
- llmFn 支持结构化输入 `{ text, images: [{ mimeType, base64, dataUrl }] }`：OpenAI 走 `image_url` 内容数组，Anthropic 走 `image source` base64（`packages/ai-autonomous-tester/scripts/run-autonomous-e2e.js`）。
- `AgentVisualJudge` 新增 `vision` 选项（有 llmFn 时默认开）：diff/基线/当前截图 base64 内联发 LLM；视觉失败自动降级纯文本；纯文本也失败 → `need_review`（fail-closed，不再向调用方抛异常）。
- 单图体积护栏 `MAX_IMAGE_BYTES = 3MB`：超限图片跳过内联（Anthropic 5MB / 中转站 body 限制）。
- `runOrchestratorLoop` 把 `llmFn` 注入 `TestOrchestrator`，保证 `analyzer.visualJudge` 非空（C2 接线修复）。
- `AIAnalyzer`：`needReview` 独立分组；`need_review`/LLM 异常/启发式不确定全部路由 `NEED_HUMAN`，禁止静默进 `UPDATE_BASELINE`（W1 fail-closed）；仅 `status=FAILED`（或未标注）触发视觉 judge，PASSED 高 diff 不烧 vision 成本（W2）。
- workflow `llm_vision` 输入（默认 true）+ `LLM_VISION` env：去掉 `|| ''` 布尔陷阱，显式 false 保持 false，PR 事件恒 false（C1）。

## Capabilities
- **New**: `autonomous-loop/visual-vision-judge` —— 像素 diff 自动视觉判定契约（输图格式、降级链、体积/成本护栏、workflow 布尔语义）。
- **Modified**: 无（既有 specs 无对应能力规格，本轮新增）。

## Impact
- 代码：`packages/ai-autonomous-tester`（agent/agent-visual-judge.js、ai-analyzer.js、orchestrator.js、runners/visual-runner.js、scripts/run-autonomous-e2e.js）。
- 配置：`.github/workflows/autonomous-loop.yml` + `.github/scripts/autonomous-loop-workflow.test.js`。
- 测试：包测试 189/189、workflow 合同 10/10（含本 change 新增回归）。

## 基线 vs 现状差异审计（既有基线 retrospective）
- 已交付（本轮实现完成，未合并）：上述 What Changes 全部条目；证据 = 本分支未提交 diff + 测试全绿。
- 待办：无（实现与审查修复全部完成）。
- 待确认：无。
