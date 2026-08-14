# Tasks — prompt-eval-ops-workbench

> 进度单一来源：以本文件 checkbox 为准。实现前先写/改测试（TDD）。

## 审计与前置

- [x] PRD 12A.22（用户确认决策点 A/B/视频范围）
- [x] OpenSpec change 创建：proposal → design → specs → tasks（本文件）并 `openspec validate` 通过

## 实现（codex/prompt-eval-workbench 分支）

### 任务 1：契约常量与模型
- [x] `services/prompt_eval_contract.py`：IMAGE_DIMENSIONS 权重/等级/11 类问题/7 类优化点/severity + 校验函数（与桌面端 prompt-eval/dimensions.js 对齐）
- [x] models.py：prompt_eval_cases / prompt_eval_runs / prompt_eval_provider_keys（密钥加密列）
- 测试目标：`tests/test_prompt_eval_contract.py`（常量与桌面端一致性断言）

### 任务 2：生成服务
- [x] `services/prompt_eval_generation_service.py`：provider 直连（minimax-image/flux）、超时/有界重试/429 退避、结果魔数校验、落盘/COS URL
- 测试目标：`tests/test_prompt_eval_generation.py`（mock HTTP + 校验矩阵）

### 任务 3：翻译服务
- [x] `services/prompt_eval_translation_service.py`：LLM 翻译 + source=machine_translation + 幂等缓存
- 测试目标：`tests/test_prompt_eval_translation.py`（mock LLM + 幂等 + 失败可重试）

### 任务 4：评估服务
- [x] `services/prompt_eval_evaluation_service.py`：视觉 LLM 调用 + 构造评估提示词 + 白名单校验 fail closed
- 测试目标：`tests/test_prompt_eval_evaluation.py`（mock 视觉 LLM + 非法输出矩阵）

### 任务 5：接口与状态机
- [x] `routers/prompt_eval.py`：cases/translate/runs/run 详情/summary/delete/providers(admin)；异步任务执行生成→评估
- [x] 错误码 OPS_PROMPT_EVAL_* 统一
- 测试目标：`tests/test_prompt_eval_api.py`（鉴权/校验/状态机/级联删除）

### 任务 6：前端评测工作台
- [x] 「评测工作台」三 Tab（新建/列表详情四栏同屏+对比/聚合分析）+「模型密钥」页（admin）+ 路由菜单 + 组件测试
- 测试目标：前端组件测试 + `npm run build`

### 任务 7：文档与门禁
- [x] ARCH-PROMPT-EVAL-OPS-WORKBENCH-2026-08-12.md、CHANGELOG、quality-gates 执行记录
- [ ] pytest（本次文件 16 例全绿；全量套件 DB 路径交叉干扰为既有问题）+ 前端 build；双模型审查；提交/推送/PR/合并

