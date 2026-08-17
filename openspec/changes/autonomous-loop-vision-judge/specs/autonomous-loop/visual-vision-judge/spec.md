# autonomous-loop/visual-vision-judge

> 变更 delta：新增 autonomous-loop 视觉判定契约。

## ADDED Requirements

### Requirement: 视觉判定默认开启并按结构化输图
autonomous-loop SHALL 在配置了 LLM Key 时默认开启视觉判定（`llm_vision` 默认 true），把像素 diff 失败相关的 diff/基线/当前截图以内联图片发给 LLM；llmFn SHALL 支持结构化输入 `{ text, images: [{ mimeType, base64, dataUrl }] }`，同时保持纯文本字符串入参兼容（requirements/functional/fix 等既有调用不变）。

#### Scenario: 视觉开启时三图内联
- **WHEN** `llmFn` 已配置且 `vision` 开启，一次视觉判定的 diff/基线/当前截图文件均存在且 ≤3MB
- **THEN** llmFn 收到结构化对象，`images` 数组含 3 项，每项带 `mimeType`、`base64` 与 `dataUrl`（OpenAI 兼容端点 body 使用 `image_url` 数组，Anthropic 使用 `image source` base64）

#### Scenario: 纯文本调用保持旧协议
- **WHEN** 调用方传字符串 prompt（非视觉路径）
- **THEN** llmFn 收 string 且请求 body 的 `content` 保持字符串，不引入图片数组

### Requirement: 体积与成本护栏
视觉内联 SHALL 对单图实施 3MB 上限：超限、不存在或读取失败的图片不得进入请求体；AIAnalyzer SHALL 仅对 `status === 'FAILED'`（或未标注 status 的测试/Mock）调用视觉 judge，PASSED 用例即使 diff 比例高于噪声阈值也不触发昂贵视觉调用。

#### Scenario: 超限图片跳过
- **WHEN** 图片文件 >3MB
- **THEN** 该图不内联；若全部图片均超限/缺失则回落到纯文本判定（若开启视觉）
- **AND** 请求体不超过中转站/Anthropic body 限制

#### Scenario: PASSED 不烧视觉
- **WHEN** visual detail 的 status 为 PASSED 但 misMatchPercentage 高于噪声阈值
- **THEN** 不调用视觉 judge，走启发式兜底分类

### Requirement: 不确定判定必须交人工（fail-closed）
视觉判定 SHALL 将 `need_review` verdict、LLM 调用失败（视觉与降级文本均失败）、LLM 输出不可解析或启发式「不确定」的结果路由到 `NEED_HUMAN`，禁止静默进入 `UPDATE_BASELINE`；决策优先级 SHALL 为「人工 > 修复 > 更新基线」。

#### Scenario: LLM 全链路失败
- **WHEN** 视觉调用抛错且降级纯文本调用也抛错
- **THEN** 判定结果标记 `need_review`（visionFallback 标记），上层 decide 返回 `NEED_HUMAN`，不向调用方抛异常

#### Scenario: need_review verdict
- **WHEN** LLM 返回 `verdict: "need_review"` 或未知 verdict
- **THEN** 该结果进入 `needReview` 分组，decide 优先返回 `NEED_HUMAN`（先于 regressions 的 FIX_AND_RETRY）

### Requirement: workflow 开关布尔语义
autonomous-loop workflow SHALL 提供 `llm_vision` 输入（默认 true）并在显式关闭（false）时保持 false 传给脚本；PR 事件 SHALL 恒为 false（无 secrets 环境）；表达式不得使用会吞掉 false 的 `|| ''` 兜底。

#### Scenario: 显式关闭生效
- **WHEN** workflow_dispatch 的 `llm_vision=false`
- **THEN** `LLM_VISION` env 为 false 字面量，脚本收到 `--vision=false`，视觉判定关闭

#### Scenario: PR 事件关闭
- **WHEN** 事件为 pull_request（labeled）
- **THEN** `LLM_VISION` 求值为 false，不注入 secrets，只读检查
