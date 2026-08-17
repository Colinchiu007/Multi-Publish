# Design: autonomous-loop visual vision judge

## 背景与约束
- 远程 LLM API 无法调用 Agent 的 view_image，必须把图片字节内联进请求：base64 data URL（OpenAI）或 image source（Anthropic）。
- 用户第三方中转站走 OpenAI 兼容 `/chat/completions`，`gpt-4o-mini` 类协议；Anthropic 协议单独支持。
- 降级优先：视觉失败 → 纯文本判定 → 仍失败/不可解析 → `need_review`（人工），任何环节不得吞错成 `UPDATE_BASELINE`。

## 方案对比
| 方案 | 说明 | 结论 |
|------|------|------|
| A. 图片路径文本提示（现状） | 远程模型看不到像素，等于盲猜 | 弃 |
| B. base64 内联（选型） | 图片随请求传给视觉模型，兼容 OpenAI/Anthropic 双协议 | 采用 |
| C. 先压缩再内联 | 增加图像处理依赖与延迟，3MB 护栏已覆盖常见截图 | 护栏+跳过，不压缩 |

## 实现设计
1. **输图像形（contract）**：`llmFn({ text, images: [{ mimeType, base64, dataUrl }] })`；纯文本调用保持不变（字符串入参）。
   - `normalizeLlmInput` 归一化；`buildOpenAIContent` → `{type:"image_url", image_url:{url:dataUrl}}`；`buildAnthropicContent` → `{type:"image", source:{type:"base64", media_type, data}}`。
2. **AgentVisualJudge**：
   - `vision` 默认 `!!llmFn`；`encodeImage` 校验存在性 + `statSync` ≤3MB，超限/读失败返回 null（跳过该图）。
   - 按实际附着的图动态生成 prompt 的 `Attached images:` 行（info：不再固定写 3 张）。
   - 降级链：`images.length===0` → 纯文本（try/catch → need_review）；视觉调用 throw → 纯文本重试（try/catch → need_review）；LLM 输出不可解析 → need_review。
3. **接线（orchestrator）**：`new TestOrchestrator({ llmFn, vision })` → `visualJudge = new AgentVisualJudge({ llmFn, vision })` → `analyzer.visualJudge` 非空（修复前 C2：`runOrchestratorLoop` 未传 llmFn，visualJudge 恒 null）。
4. **决策路由（AIAnalyzer）**：
   - `analyzeVisual`：`needReview[]` 独立分组；`need_review`/未知 verdict → needReview；judge 抛错 → 启发式兜底仍不确定 → needReview。
   - 成本护栏：`status==='FAILED' || status===''` 才调用 judge（修复前 PASSED 高 diff 也烧 3 图）。
   - `decide`：`needReview>0 → NEED_HUMAN`（置于 regressions 检查之前，保证人工优先于自动修复/基线更新）。
5. **workflow 布尔语义（C1）**：`LLM_VISION: ${{ github.event_name != 'pull_request' && (inputs.llm_vision ?? true) }}`。修复前 `|| ''` 把显式 `false` 变空串，脚本把空串当「未设置 → 默认开」，显式关闭失效；PR 事件无 secrets，恒 false。

## 影响面
- `run-autonomous-e2e.js`：llmFn 工厂 + content builders + `runOrchestratorLoop` 注入。
- `agent-visual-judge.js` / `ai-analyzer.js` / `orchestrator.js` / `visual-runner.js`（details 附带 baselinePath/screenshotPath）。
- `.github/workflows/autonomous-loop.yml`（llm_vision 输入 + env + 透传 `--vision`）。
- 测试：4+5+1+1 新增回归（视觉输图/降级/体积护栏/need_review 路由/布尔语义/接线）。
