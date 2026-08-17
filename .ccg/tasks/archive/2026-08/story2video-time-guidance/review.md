# Review：story2video-time-guidance（2026-08-17）

## 双模型审查执行情况

- antigravity：**不可用（降级记录）** —— `Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（wrapper exit 1）
- Claude：完成，报告 1 Critical / 2 Warning / 3 Info。

## Claude 审查发现与处置

- **[Critical 已修复]** 合成时间说明块在共享组件 `StageProgress` 内无条件渲染，story2video 专属口径泄漏到全部 auto/media-auto 暂存式流水线（animated-explainer / talking-head / cinematic / clip-factory / localization-dub 等，见 `IMPLEMENTED_PIPELINES`）。
  - 修复：`StageProgress` 新增 `showTimeGuidance` prop（默认 false），`CreateView` 仅对 `isOrchestratedPipeline(selectedPipeline?.name)`（即 story2video-compose）传入 `:show-time-guidance`。
  - 回归保护：`StageProgress.test.js` 新增「默认不渲染」反向断言；`story2video-ue-contract.test.js` 新增父组件接线断言（`v-if="showTimeGuidance"` + `:show-time-guidance="isOrchestratedPipeline(...)"`）。
- **[Warning 已修复]** `.time-guidance-intro` 有 class 无样式规则 → 补充 `.time-guidance-intro { margin-top: 2px; }`。
- **[Warning 保留（产品口径）]** 说明块未按运行状态门控（failed/completed 也显示「以上合成时长均属正常范围」）。判定：该块是参考性说明（非状态提示），用户需求为「进度区域加上文字说明」常显，保留；如需按状态收敛由产品再提。
- **[Info 已处理]** ① 参考区间口径无来源注释 → zh/en locale 均加注释说明为产品约定参考区间；② 英文测试末尾冗余 `setAppLocale("zh")` → 删除（beforeEach 兜底）；③ key 命名空间 `stageProgress.*` → 已按 Critical 门控收敛使用面，命名空间保持不变避免扩散。

## 自检结论

无未决 Critical / Warning；本地测试（StageProgress 18 + contract 3 + CreateView 202）与 locale/CJK 门禁全部通过。
