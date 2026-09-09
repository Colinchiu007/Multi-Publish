# 审查记录 — quality-eval-calibration

## 结论

无 Critical；代码与测试已由主代理逐文件复审 + 分层测试兜底。双模型审查按机制硬化规则降级记录。

## 双模型审查状态

- **OpenCode reviewer**：wrapper 与 opencode 后端链路可用（`--version` exit 0、smoke OK），
  但本次 `--progress --backend opencode` 审查会话在 150s 超时内只返回角色初始化、未产出终审报告（EXIT=124）。
  归类为「超时无终报」，非后端不可用。
- **Claude reviewer**：`claude.exe` 与 `codeagent-wrapper.exe` 均可启动，但实际请求因上游模型/代理配置拒绝
  （selected model 不存在或无权限；默认 `claude-opus-4-8[1m]` 与映射 `z-ai/glm-5.2:free` 均被拒）。
  归类为「模型层不可用」，非 wrapper 崩溃，也非 PATH 缺失。
- 环境独立漂移：`CLAUDE_CODE_GIT_BASH_PATH` 指向不存在的 `D:\Program Files\Git`，
  实际 Git Bash 在 `C:\Program Files\Git\usr\bin\bash.exe`。已与模型问题分开记录。

## 主代理逐文件复审

1. `evaluator.py`：`applicable` 字段默认 `true`，`__post_init__` 重算 `weighted`；
   无原文克隆差异度、短文本关键词密度、无句子可读性/信息密度均 `applicable=false`；
   `serialize_quality_report` 作为单一序列化投影。综合分按适用权重归一化，适用权重为 0 时 fail-closed 返回 0。
2. `ops-center/backend/services/quality/service.py`：`_load_evaluator_module` 抽离复用；
   `_report_to_dict` 消费共享序列化；`get_average_stats` 固定返回 15 维（样本 0 也返回 count=0）。
3. `aggregation/service.py`：改写质量报告改用 `serialize_quality_report`，去掉手写字段清单。
4. `ContentQualityEval.vue` + `content-quality-eval-utils.js`：N/A 灰色展示契约纯函数化，供组件测试。

## 测试兜底（本会话 fresh 证据）

- `python -m pytest tests/quality/ tests/test_aggregation.py -q`：44 passed
- `ops-center/backend: python -m pytest tests/test_quality_eval_api.py -q`：5 passed
- `ops-center/backend: python -m pytest tests/ -q`：325 passed / 6 failed；
  6 失败全部为 `test_diagnostics_api.py` 的日期漂移预存问题（固定测试日期 2026-08-10 vs 当前 2026-09-09），
  与本次改动文件无调用交集，不伪装为全量通过。
- 前端 `pnpm test`：24 passed；`pnpm build`：exit 0。
- `git diff --check`：通过；`openspec validate quality-eval-calibration`：valid。

## 待后续处理

- `openspec-sync-check.js` 全仓 exit 2，均为历史归档任务预存违规（含 3 个无效 JSON、多个旧 change 未归档），
  与本次任务无关；本次任务归档时须保证自身 task.json 与 change 终态一致。
- 改写结果自动落库（`AggregationService.rewrite` → `quality_eval_records`）为独立跨进程持久化缺口，
  单列独立任务，不并入本次校准 change。
