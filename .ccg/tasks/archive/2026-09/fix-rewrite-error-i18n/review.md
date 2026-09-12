# fix-rewrite-error-i18n 审查记录（2026-09-12）

## 结论
PR #1736 已合并（a25c0c9b），两轮 CI 全绿（19 项检查）。

## 根因
1. 泄漏路径：service.py 硬编码中文 raise → router 400 → python-bridge resolve → Collection.vue else 分支直出（绕过 formatUserError）。
2. 机制空洞：Gate 7 CJK 扫描只覆盖 apps/desktop/src，python-backend 无任何 i18n 门禁。

## 修复
四层稳定错误码链路（UserVisibleError → router detail 对象 → bridge errorCode 提升 → formatUserError）+ locales zh/en 成对文案 + Gate 7 --py-cjk 门禁补洞。

## 验证
- pytest test_aggregation: 35 passed（+2）
- vitest Collection/user-facing-error/message-contract/collect-error: 152 passed（+5）
- locale-sync --keys（882 key）/ --py-cjk（基线 90）PASS
- workflow-contract 19 passed；check-locale-sync.test 4 passed
- CI 两轮全绿（Quality Gate 8/8 jobs success）
