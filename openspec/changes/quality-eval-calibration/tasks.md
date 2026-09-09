## 1. 基线与规格

- [x] 1.1 完成已交付/待办差异审计，确认 v1.0 已实现而 v1.1 校准与适用性仍待完成。
- [x] 1.2 建立人工参考样本、模板对抗样本、单字情感边界样本，并记录基线分数。测试：packages/python-backend/tests/quality/test_evaluator_calibration.py。
- [x] 1.3 创建 OpenSpec proposal/design/specs 和 CCG L 级任务工件。

## 2. 评估器 TDD 与实现

- [x] 2.1 先加入模板顺序结构与书面第一人称叙事的失败回归测试。测试：test_evaluator_calibration.py。
- [x] 2.2 实现 applicable 和适用权重归一化；无原文的克隆差异度为 N/A。测试：test_evaluator_calibration.py。
- [x] 2.3 实现模板结构与真实编号分点分离、第一人称叙事/观点的人类表达校准。测试：test_evaluator_calibration.py。
- [x] 2.4 确保警告/建议不包含不适用维度，并为改写引擎质量报告保留证据和适用性。测试：test_evaluator_calibration.py、packages/python-backend/tests/test_aggregation.py。

## 3. 运营中心契约与展示

- [x] 3.1 在单篇评估响应和最近记录中序列化适用性；旧记录按原文回退。测试：ops-center/backend/tests/test_quality_eval_api.py。
- [x] 3.2 最近 100 篇维度平均排除 N/A，并报告有效样本数。测试：ops-center/backend/tests/test_quality_eval_api.py。
- [x] 3.3 前端以灰色 N/A 呈现不适用维度。测试：前端构建和针对性组件源码契约测试。

## 4. 验证与交付

- [ ] 4.1 跑 Python 质量回归、aggregation 受影响测试、ops-center API 全量测试、前端构建/测试和 git diff --check。
- [ ] 4.2 更新专项机制文档、改写引擎 PRD、架构说明、CHANGELOG、质量门禁和复盘；明确离线基准与真实 LLM 100 篇验收边界。
- [ ] 4.3 执行 OpenCode 与 Claude 双模型审查，记录实际结果或分层不可用原因；完成主代理复审。
- [ ] 4.4 OpenSpec 校验、提交、推送、PR、CI、合并后执行 OpenSpec/CCG/质量节拍三同步归档。
