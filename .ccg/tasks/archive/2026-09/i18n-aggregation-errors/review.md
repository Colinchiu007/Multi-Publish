# i18n-aggregation-errors 审查记录（2026-09-12 第三轮）

## 结论
PR #1748 已合并（5c3520e1），CI 19 项检查全绿。

## 根因
改写/采集链路 7 类校验错误（内容空/URL 格式/枚举/字数区间/引擎失败/500 兜底/404）以中文 ValueError 抛出，经 formatUserError passthrough 分支直出 UI——英文用户看到中文。前两轮修泄漏路径与门禁失效，本轮收敛存量。

## 修复
10 错误码 UserVisibleError + params 插值全链路（models/service → router detail 对象 → bridge params 透传 → formatUserError {param} 插值 → locales zh/en 10 条文案）。500 兜底不再拼异常原文。--py-cjk 豁免语义明确化。

## 回归保护
pytest +2（Pydantic v2 ctx.error 链路）；vitest +6（渲染/插值/缺失占位符/500 不直出）。

## 验证
pytest 43 passed；vitest 114 passed；locale-sync 三查全 PASS。
