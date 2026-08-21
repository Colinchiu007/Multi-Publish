# 任务需求与根因分析

## 需求

视频创作 -> 历史记录 -> 视频详情（`/create/result`，`apps/desktop/src/views/ResultView.vue`）的场景素材区：

1. 未生成的图片和视频素材卡下方也要有【生成新图】/【生成AI视频】按钮（当前 image2/video2 卡没有按钮）。
2. 【生成AI视频】按钮不能因为 `videoPrompt` 为空就灰显不可点；只要存在可回退的提示词（`videoPrompt || prompt || text`）即可点击，与后端契约一致；三者全空才禁用并给提示。

## 根因（第一性原因）

### 问题 1：未生成素材卡无按钮
- 2026-08-20 四视觉卡修订（PRD 附录 A / PR #1041）明确"【生成新图】【生成AI视频】是场景级动作，只在 image1/video1 卡内渲染一次，image2/video2 不重复显示"。
- 模板 `ResultView.vue` 约 259-283 行：`v-if="slot.kind === 'image1'"` 才渲染生成新图、`v-if="slot.kind === 'video1'"` 才渲染生成 AI 视频。
- 因此 image2/video2 未生成（占位）时没有任何生成入口。这是设计决策与用户期望（每个空素材槽都应有生成动作）冲突。

### 问题 2：生成AI视频灰显
- 前端门控 `hasUsableVideoPrompt(segment)`（`ResultView.vue` 约 1538 行）只校验 `segment.videoPrompt` 非空。
- 后端 `generateSceneAiVideo`（`story2video-project-service.js` 约 1769 行）实际回退 `safeText(segment.videoPrompt || segment.prompt || segment.text)`，服务层测试已覆盖 `videoPrompt` 缺省回退 `prompt/text`。
- 老项目或未持久化 `videoPrompt` 的历史分段 `videoPrompt` 为空但 `prompt`/`text` 存在 -> 前端禁用按钮，后端本可生成 -> 门控与后端契约不一致。

## 逃逸分析（QM-5）

| 层 | 为什么没拦住 |
|----|------|
| 单元测试 | `ResultView.test.js` 约 1068-1071 行把"image2/video2 无按钮"写成断言（反向固化错误行为）；AI 视频按钮测试只覆盖"无 videoPrompt 禁用"，未覆盖后端回退契约 |
| 服务层测试 | `story2video-project-service.test.js` 覆盖了后端回退，但没有 renderer 层测试把前端门控与后端契约绑定，契约漂移未暴露 |
| E2E/视觉 | 无"纯图片轮播场景/未生成素材槽 + 可回退提示词"的用例 |
| 审查 | PRD 明确"按钮只在 image1/video1"，审查按 PRD 放行，需求本身需要变更 |

## 系统性漏洞
- 前端"能否生成 AI 视频"的判定与后端提示词回退契约缺少单一来源与跨层断言。
- 测试曾把"无按钮"固化为特性，未对空槽生成入口做正向断言。

## 修复方案
1. `ResultView.vue`：image1/image2 卡都渲染【生成新图】（`generateSceneImage`），video1/video2 卡都渲染【生成AI视频】（`generateSceneAiVideo`），保持场景级动作语义。
2. `hasUsableVideoPrompt` 放宽为 `videoPrompt || prompt || text` 任一非空即可点；三者全空仍禁用（沿用 `aiVideoNeedsPromptHint`）。
3. 更新 `ResultView.test.js`：空槽卡有生成按钮；有 `prompt/text` 无 `videoPrompt` 时按钮可点。
4. 补充 PRD：附录 A 与 PRD-S2V-PIPELINE-PAGE-UX 的"只在 image1/video1 渲染一次"改为"所有图片/视频视觉卡均可渲染场景级生成按钮；生成AI视频按钮在 videoPrompt/prompt/text 任一非空时可点"。

## 验收标准
- 场景素材 4 卡中，任意图片卡空态下方有【生成新图】，任意视频卡空态下方有【生成AI视频】。
- 无 videoPrompt 但有 prompt/text 时【生成AI视频】可点击并触发 IPC。
- 三者全空时按钮禁用且 title 显示提示。
- 相关单元测试通过；zh/en locale 成对；CJK 硬编码扫描通过；Vue build 通过。
