# Tasks — prompt-eval-ops-scenes

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [x] 用户需求确认：场景层评测工作流（整篇文案→分句→逐场景展示与生成），运营后台 PRD 独立于桌面 PRD
- [x] 决策点：图片先行、视频 v2（与桌面端口径一致）；provider 密钥复用 12A.22 密钥目录；中英对照服务端 LLM 自动翻译并标注机器翻译
- [x] PRD 12A.22.16-21（ops-center/docs/PRD.md，随 PR #593 已合入）
- [x] OpenSpec change 创建：proposal → design → specs（本目录）→ tasks（本文件）并 `openspec validate` 通过

## 实现（codex/prompt-eval-scenes 分支）

### 任务 1：分句服务（Python，与桌面端一致）
- [x] `services/prompt_eval_segmentation.py`：句子边界消歧→场景级分组→字幕二次分句→proportional/equal 时间线（对齐 text-segmentation.ts）
- [x] 一致性 fixture：`tests/fixtures/segmentation-ref.mjs`（esbuild 打包桌面端 TS）+ node 对照执行
- 测试目标：`tests/test_prompt_eval_segmentation.py`（10 例全绿，与 TS 对照一致）

### 任务 2：场景上下文服务
- [x] `services/prompt_eval_scene_context.py`：白名单键提取（genre/era/culture/setting/time/characters/props/visual_style/tone/summary/anchors/negative_anchors）+ 敏感键 fail closed + degraded 标记
- 测试目标：`tests/test_prompt_eval_scene_context.py`（5 例全绿）

### 任务 3：数据模型
- [x] models.py：`prompt_eval_scenes` 表 + `cases.source_mode` + `runs.scene_id`（可空，manual 兼容）
- 测试目标：接口/服务测试覆盖建表与会话刷新

### 任务 4：场景服务与翻译
- [x] `prompt_eval_service.py`：create_case_scene/list_scenes/get_scene/translate_scene/create_scene_run/scene_snapshot/start_scene_run_pipeline（run 快照化，场景后续变更不影响已提交 run）
- [x] `prompt_eval_translation_service.py`：optimize_scene_prompt（整篇原文+场景文字+场景上下文→中文优化提示词）+ 复用 12A.22 翻译与 7 天幂等缓存
- 测试目标：`tests/test_prompt_eval_api.py` 场景用例 + services 用例

### 任务 5：场景接口
- [x] `routers/prompt_eval.py`：POST /cases（scene）、GET /cases/{id}（含 scenes）、POST /cases/{id}/scenes/{sid}/translate|runs；鉴权与 manual 一致
- 测试目标：`tests/test_prompt_eval_api.py`（12 例，含场景鉴权/边界/状态机）

### 任务 6：前端场景工作流
- [x] `api/promptEval.js`：createPromptEvalSceneCase/translatePromptEvalScene/createPromptEvalSceneRun
- [x] `PromptEvalWorkbench.vue`：manual/scene 切换、分句表单（高级配置默认 20/8/15/proportional）、场景卡片四区、逐场景中英对照与生成评估、状态徽章 + 8s 轮询（终态自动停止）、评测列表 source_mode 列与详情场景摘要
- 测试目标：`npm run build` 通过

### 任务 7：契约与门禁
- [x] 契约测试 Windows GBK 加固：`test_prompt_eval_contract.py` subprocess 显式 encoding=utf-8（node 输出含中文，GBK 控制台不再崩溃）
- [x] 全量 pytest 192 例全绿 + 前端 build 通过
- [x] CHANGELOG、quality-gates 执行记录、PRD 补充（如缺口）
- [x] 双模型审查：antigravity 不可用（降级记录）；Claude 1C/5W/8I 全部修复并有回归测试（review.md）
- [ ] 提交/推送/PR/CI/合并/远程核对/三同步归档
