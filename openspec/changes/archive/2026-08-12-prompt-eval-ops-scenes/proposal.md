## Why

运营后台评测工作台（12A.22）目前是「整 case 手工输入」模式：运营人员录入优化后提示词才能评测。实际评测需要先对整篇文案按桌面端分句机制拆成场景层，逐场景展示「场景文字 / 字幕二次分句 / 场景上下文 / 优化后提示词中英对照」，再逐场景真实生图评估——把「文案 → 场景层 → 评测」串成运营侧可复现链路。

## What Changes

- **ops-center 后端分句服务**（Python）：场景级分割 + 字幕二次分句 + proportional 时间线，语义对齐桌面端 `text-segmentation.ts`（story2video-engine）；**一致性测试**用 esbuild 打包桌面端 TS 模块做输入→输出对照断言。
- **场景上下文服务**（Python）：按 `story-context-engine.js` 语义提取白名单键（genre/era/culture/setting/time/characters/props/visual_style/tone/summary/anchors/negative_anchors）。
- **数据模型**：`prompt_eval_cases.source_mode`（manual|scene）、新增 `prompt_eval_scenes`（scene_text/subtitle_blocks/scene_context/prompt_zh/prompt_en/source）、`prompt_eval_runs.scene_id`（可空）。
- **接口**：`POST /cases`（scene 模式：整篇文案 + 分句配置 → 分句建 scenes）、`GET /cases/{id}`（含 scenes）、`POST /cases/{id}/scenes/{sid}/translate`、`POST /cases/{id}/scenes/{sid}/runs`。
- **前端**：新建评测「场景模式」——输入整篇文案 → 「分句并生成场景」→ 场景卡片四区（场景文字/字幕块/上下文/中英提示词）+ 逐场景「生成图片」/评估/对比。

## Capabilities

### New Capabilities
- `prompt-eval-ops-scenes`: 运营后台评测工作台场景层工作流（文案→场景层分句、字幕二次分句、场景上下文、逐场景中英优化提示词与生成评估、与桌面端分句一致性测试）。

### Modified Capabilities
- `prompt-eval-ops-workbench`: 增加 scene 模式（source_mode/scenes/scene_id），既有 manual 模式与生成→评估状态机不变。

## Impact

- 后端：`services/prompt_eval_segmentation.py`、`services/prompt_eval_scene_context.py`、`models.py`（scenes 表 + source_mode + scene_id）、`routers/prompt_eval.py`（scene 接口）、`prompt_eval_service.py`（分句/场景 CRUD/翻译/run 扩展）；pytest 新增（分句一致性/场景接口）。
- 前端：PromptEvalWorkbench.vue 场景模式（分句表单 + 场景卡片四区 + 逐场景生成）。
- 文档：ops-center/docs/PRD.md 12A.22.16-21（已合）、CHANGELOG、quality-gates。
- 外部边界：真实 provider/视觉模型外部验收；分句一致性以桌面端 TS 模块为对照基准。
- 交付：codex/ 分支 + PR；双模型审查；后端 pytest + 前端 build。
