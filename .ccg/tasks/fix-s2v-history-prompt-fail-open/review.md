# Review — fix-s2v-history-prompt-fail-open

## 审查方式

- 双模型审查（M+ 复杂度要求）：antigravity + Claude 并行调用 `codeagent-wrapper.exe --lite`（固定 diff 文件 `C:\tmp\fix-s2v-history-prompt-fail-open.diff`，只读）。
- **antigravity 不可用**：wrapper 返回 `Your current account is not eligible for Antigravity ... not currently available in your location`（所在地区不可用，非 CLI/配置问题）。按机制硬化规则降级：记录本条目，由 Claude 审查 + 主代理上下文审查承担。
- Claude 审查：`--backend claude --lite` 仅读 diff 文件，完成并输出报告（Session 94292eec，约 3 分钟，`C:\tmp\s2v-review-claude.md`）。

## Claude 审查结论（Critical/Warning/Info 摘要）

- Critical：无。
- Warning：
  - W1 顶层 `source.error` 检查位于 results 分支之后 → 跨层形态（外层 error + 内层回显）仍 fail-open；`results: []` 吞错。→ **已修复**：顶层 error/detail 检查提升到对象处理最前，先于 results 分支。
  - W2 `message` 一刀切判错可能误伤合法成功响应 → **已处置**：按 kernel `extractOptimizedBase` 权威对齐为 `error`/`detail` 判错（kernel 不判 `message`），消除过度 fail-closed 回归面。
  - W3 context 构造无条件执行且 `project.segments` 无守卫 → **已修复**：context 构造移入 `kind === 'image'` 分支，并加 `(project.segments || [])` 守卫，video 路径不受影响。
  - W4 字符串形态对错误无感知 → **保留**：既有 string 直返行为，引擎契约未观测到字符串错误形态；记录为后续确认项。
- Info：白名单双清单维护（将来可单源化）、别名键未归一、`project.options` spread 依赖下游忽略、行为变更（image 请求新增 context）需在 PR 描述标注。

## 复核（主代理）

- 逐条对应修复已实现 + 新增 2 条 W1 形态回归测试（顶层 error + 内层回显、顶层 error + 空 results），测试全绿（73/73 + stages 107/107）。
- 错误优先语义与 spec delta「error（或 detail）+ 回显原文、含跨层」一致。
- 未修复项（W4、Info）为契约确认/加固性质，不影响本 change 合入，已记录。

## 复测

- 修复后 `story2video-project-service.test.js` 73/73 通过；`story2video-stages.test.js` 107/107 通过。
- 双模型复核未再次执行（antigravity 不可用；Claude 单轮结论已闭合）。按 CCG 惯例记录为单模型审查降级。
