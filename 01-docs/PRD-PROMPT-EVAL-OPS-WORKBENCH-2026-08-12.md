# PRD — 提示词评测工作台（PromptEval Workbench，运营后台 12A.22）

> 版本：v1（2026-08-12）｜状态：待确认｜配套：`ops-center/docs/PRD.md §12A.22`｜前置：桌面端 PromptEval（PR #559，eaf067c8）

---

## 1. 背景与目标

桌面端 PromptEval v1 已实现「图片评估」能力，但评估数据只在用户本机，运营侧不可见、不可审计、不可驱动模板迭代。本功能在**运营后台**建设评测工作台：由**运营人员真实生成**图片（v1）/视频（v2），对「提示词优化引擎」的改写效果做同屏比对与聚合分析。

**一句话目标**：运营后台内，把「原文文本 → 优化后提示词（中英对照）→ 真实生成物 → 评估结果」串成一条可审计、可对比、可聚合的评测链路。

## 2. 决策点定案（2026-08-12 用户确认）

| 决策点 | 定案 |
|--------|------|
| A 生成 provider 选型 | A1：ops-center 后端服务端直连模型 API；v1 图片 minimax-image / flux（默认 minimax-image），v2 视频 minimax / hunyuan |
| A 密钥管理 | 后台「模型密钥」加密存储 + admin 管理，复用 OPS_CATALOG_API_KEY 模式；密钥绝不返回前端/日志；按用途分组（LLM/视觉/生图）唯一「设为默认」，选择链路优先默认键 |
| B 中英对照 | 后台 LLM 自动翻译优化后提示词 → 英文对照，UI 标注「机器翻译」；来源入库可审计；可配置 |
| 视频范围 | v1 图片先行；v2 视频（与桌面端口径一致：mediaType=video 明确拒绝，v2 实现时序/运动/音画维度） |

## 3. 范围

### 3.1 本期（v1 图片）
- 评测 case CRUD（原文/上下文/优化后提示词中文 + 服务端中英对照）
- 后台真实生图（≥1 provider）+ 生成物落盘/COS
- 后台视觉评估（复用桌面端维度/契约）+ 结果落库
- 前端三 Tab：新建评测 / 评测列表与详情（四栏同屏 + 多 run 对比）/ 聚合分析
- 模型密钥管理（admin）：加密存储 + 同用途分组（LLM/视觉/生图）唯一「设为默认」；默认键优先被 LLM/视觉评估链路消费
- 视频 v2 预留（video_path 字段 + 维度占位）

### 3.2 不在本期
- 视频真实生成与视频维度评估
- 桌面端→后台自动上报（本功能为运营主动评测，非被动采集）
- prompt-engine 契约扩展中英双语输出（B 采用后台翻译，不改 8013）

## 4. 数据校验（fail closed）

- source_text ≤20000 非空；prompt_zh ≤5000 非空；context ≤20000 且**递归**敏感键过滤；image_count 1-20；aspect_ratio 枚举；provider/model 必须已配置密钥；
- prompt_en 仅服务端生成（source 服务端标注，防客户端伪造）；
- 生成结果：图片扩展名/魔数校验，空/非法 → run failed；
- 评估结果：overall 0-100、维度 id 白名单不重复、score 0-100、evidence 非空、problems/points 必须为数组且白名单；任一违反 → eval_status=failed（不静默降级）；
- 错误码统一 `{ code, message, details? }`，前缀 `OPS_PROMPT_EVAL_*`，与桌面端 EVAL_* 语义对齐。

## 5. 流程与状态机

创建 case → （可选）翻译中英对照 → 创建 run（queued）→ 生成图片（processing，有界重试/429 退避）→ succeeded → 评估（evaluating）→ eval_status=succeeded/failed。失败不静默降级，error 记录阶段+原因；生成物保留供排查。前端 2-5s 轮询 run 状态；同 case 多 run 允许并发（额度并发 ≤3）。

## 6. 功能逻辑 / 接口

见 `ops-center/docs/PRD.md §12A.22.5`（POST /cases、/translate、/runs，GET /runs/{id}、/cases、/summary，DELETE，admin /providers）。

## 7. 交互逻辑与显示项

见 `ops-center/docs/PRD.md §12A.22.11`（三 Tab、四栏同屏、多 run 对比表、状态徽章、机器翻译徽标、关键提示文字清单）。

## 8. 验收标准

见 `ops-center/docs/PRD.md §12A.22.13`（校验矩阵、中英对照、真实生图、真实评估、前端三 Tab、聚合、pytest+build+契约一致性、视频 v2 预留）。

## 9. 测试策略

后端 pytest（接口/校验矩阵/翻译/生成/评估 mock + fail closed/鉴权/级联删除）、前端组件测试、桌面端契约一致性断言。真实 provider 与真实视觉模型为外部验收边界。

## 10. 相关文档

- `ops-center/docs/PRD.md §12A.22`（主 PRD 章节，详细版）
- 架构文档：`01-docs/ARCH-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md`（实施前产出）
- OpenSpec：`openspec/changes/prompt-eval-ops-workbench/`（实施前建 change）

---

## 11. 场景层评测工作流（2026-08-12 调整）

> 详细见 `ops-center/docs/PRD.md §12A.22.16-21`。

### 11.1 目标
运营人员**输入整篇文案原文**，后台按**桌面端分句机制**（text-segmentation.ts / smart-sentence-splitter 8002 契约）拆成场景层；每场景自动展示：**场景文字 / 字幕二次分句 / 场景上下文 / 优化后提示词（中英对照）**，可逐场景「生成图片」（复用既有生成→评估流程，生成部分不变）。

### 11.2 流程
输入整篇文案 → 后台分句（场景级 + 字幕二次分句 + 场景上下文）→ 场景层列表 → 逐场景生成/展示中英优化提示词 → 逐场景「生成图片」→ 生成物 + 评估结果 → 多 run 对比 / 聚合分析。

### 11.3 数据与接口
- 新增 `prompt_eval_scenes`（scene_text / subtitle_blocks / scene_context / prompt_zh / prompt_en / source）；`prompt_eval_cases.source_mode`（manual|scene）；`prompt_eval_runs.scene_id`（可空）。
- `POST /cases`（scene 模式，分句配置 target_chars_per_scene 默认 20 / subtitle 8-15 / proportional）、`GET /cases/{id}`（含 scenes）、`POST /cases/{id}/scenes/{sid}/translate`、`POST /cases/{id}/scenes/{sid}/runs`。

### 11.4 复用桌面端分句机制
- ops-center 后端 Python 分句实现，语义对齐桌面端 `text-segmentation.ts`；**一致性测试**用 node 加载桌面端模块对同一输入断言 scenes/subtitle_blocks 一致。
- 场景上下文按 `story-context-engine.js` 语义（白名单键）。
- 优化提示词：后台 LLM 按「整篇原文+场景文字+场景上下文」生成中文 + 翻译英文（机器翻译标注，幂等，支持编辑覆盖）。

### 11.5 验收（增补）
分句一致性测试通过；每场景四区展示 + 生成图片/评估可用；分句失败明确报错不降级；场景数上限 50；既有 12A.22 验收不回归。
