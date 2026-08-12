# ARCH — 提示词评测工作台（PromptEval Workbench，运营后台 12A.22）

> 版本：v1（2026-08-12）｜配套 PRD：`ops-center/docs/PRD.md §12A.22`、`01-docs/PRD-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md`｜OpenSpec：`openspec/changes/prompt-eval-ops-workbench/`

---

## 1. 概述

运营后台新增「提示词评测工作台」：运营人员录入原文 + 优化后提示词（中文）→ 后台 LLM 生成英文对照（机器翻译标注）→ 真实生成图片 → 视觉评估 → 同屏比对 + 多 run 对比 + 聚合分析。评估契约与桌面端 PromptEval（PR #559）保持一致，两端以共享常量/一致性测试对齐。

## 2. 模块结构（ops-center/backend）

```
services/
├── prompt_eval_contract.py            # 维度/等级/问题/优化点/severity 常量 + 校验（与桌面端 dimensions.js 对齐）
├── prompt_eval_generation_service.py  # provider 直连（minimax-image/flux）HTTP 客户端 + 重试/429 + 魔数校验 + 落盘
├── prompt_eval_translation_service.py # LLM 中英对照 + source=machine_translation + 幂等缓存
├── prompt_eval_evaluation_service.py  # 视觉评估 + 评估提示词构造 + 白名单校验 fail closed
└── prompt_eval_runner.py              # 异步状态机（queued→processing→succeeded→evaluating→succeeded/failed）
routers/prompt_eval.py                 # /api/v1/prompt-eval/*（读=登录，写=登录/创建者，密钥=admin）
models.py                              # prompt_eval_cases / prompt_eval_runs / prompt_eval_provider_keys
tests/test_prompt_eval_*.py            # 契约/生成/翻译/评估/接口
```

前端（ops-center/frontend）：「评测工作台」页（三 Tab）+「模型密钥」页（admin）+ 路由/菜单 + 组件测试。

## 3. 数据流

```
运营（前端）
  ├─ POST /cases → 校验（fail closed）→ 落库
  ├─ POST /cases/{id}/translate → LLM 翻译 prompt_zh→prompt_en（source=machine_translation，7 天幂等）
  └─ POST /cases/{id}/runs → 创建 run（queued）→ 后台异步：
       ① 生成：provider API → 图片魔数校验 → 落盘/COS → succeeded
       ② 评估：视觉 LLM（输入快照=原文/上下文/prompt_zh/prompt_en/图片）→ 白名单校验 → 结果落库
       （任一步失败：status=failed 或 eval_status=failed，error=阶段+原因，不静默降级）
  前端轮询 GET /runs/{id}（图片 2-5s）
GET /summary → 聚合（记录数/平均分/等级分布/维度均值/问题分布/优化点 Top/按 provider 对比）
```

## 4. 关键设计

1. **契约单一来源**：`prompt_eval_contract.py` 与桌面端 `prompt-eval/dimensions.js` 各持一份；一致性测试断言两端常量相等（维度 id/权重/等级/问题/优化点/severity），新增维度必须两端同步。
2. **异步状态机**：run 记录 status 与 eval_status 分离；生成失败不写评估；评估非法输出 eval_status=failed 且生成物保留。
3. **密钥安全**：`prompt_eval_provider_keys` 加密存储（复用 OPS_CATALOG_API_KEY 管理模式）；明文不出现在响应/日志/评估提示词；admin 维护。
4. **输入校验 fail closed**：对齐桌面端矩阵；context 递归敏感键过滤（复用桌面端 assertNoSensitiveContext 语义）。
5. **生成物存储**：本地媒体目录/COS URL；删除 case 级联回收；不存 base64。
6. **HTTP 客户端**：超时 + 有界瞬时重试 + 429 退避；图片扩展名/魔数校验。
7. **评估提示词**：复用桌面端 prompt-builder 语义（输入快照 + JSON 契约：overall/dimensions/problems/promptOptimizationPoints，problems/points 必须数组）。

## 5. 安全设计

| 威胁 | 缓解 |
|------|------|
| 密钥泄露 | 加密存储 + admin 管理 + 不出响应/日志/提示词 |
| 敏感上下文外发 | 递归敏感键过滤（400 拒绝） |
| 任意文件/伪造 | prompt_en 服务端生成；生成物魔数校验；provider/model 白名单（已配置密钥） |
| LLM 输出不可信 | 白名单契约 fail closed，绝不执行 |
| 越权 | 读=登录；写=登录/创建者；密钥=admin；删除=创建者/管理员 |

## 6. 测试策略

| 层 | 文件 | 覆盖 |
|----|------|------|
| 契约 | test_prompt_eval_contract.py | 与桌面端常量一致性、校验函数 |
| 生成 | test_prompt_eval_generation.py | mock HTTP provider、重试/429、魔数校验、失败降级 |
| 翻译 | test_prompt_eval_translation.py | mock LLM、幂等、失败重试 |
| 评估 | test_prompt_eval_evaluation.py | mock 视觉 LLM、非法输出矩阵（非 JSON/越界/白名单外/数组契约） |
| 接口 | test_prompt_eval_api.py | 鉴权（登录/admin/未登录）、校验矩阵、状态机、轮询、级联删除、错误码 |
| 前端 | 组件测试 | 表单校验、状态徽章、双语标注、非空数据路径、对比表 |
| 门禁 | pytest 全量 + `npm run build` + 桌面端契约一致性测试 | |

真实 provider（minimax-image/flux）与真实视觉模型为外部验收边界（需真实密钥）。

## 7. 目录/文件影响清单

新增（后端）：services/prompt_eval_{contract,generation,translation,evaluation,runner}.py、routers/prompt_eval.py、tests/test_prompt_eval_*.py
修改（后端）：models.py（3 表）、main.py（router 注册）、settings（可选密钥 env）
新增（前端）：评测工作台页、模型密钥页、路由/菜单、组件测试
文档：ops-center/docs/PRD.md 12A.22、PRD-PROMPT-EVAL-OPS-WORKBENCH、ARCH-PROMPT-EVAL-OPS-WORKBENCH、openspec change、CHANGELOG、quality-gates

> ⚠️ 不触碰其他在途任务文件；文档共享文件（CHANGELOG/PRD.md/quality-gates）提交前 fetch main 检查并发冲突。
