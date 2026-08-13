## 1. R2 错误目录收口（user-facing-error → locales）

- [x] 1.1 locales zh/en 新增 `userErrors` 命名空间（30 个 errorCode 文案 × 2，值逐字迁移）
- [x] 1.2 `user-facing-error.js` 移除 `MESSAGES`，改经 `localeMessageSource` 读取 `userErrors.*`
- [x] 1.3 移除 `check-locale-sync.js` 对 `user-facing-error.js` 的豁免
- [x] 1.4 运行 `user-facing-error.test.js` + 相关视图测试确认零行为变化（17 例全绿）

## 2. R1 模板硬编码扫描（.vue <template>）

- [x] 2.1 `check-locale-sync.js` 增加 `<template>` 块扫描（注释剥离 + 文本/属性值 CJK 检测）
- [x] 2.2 重生成基线（吸收存量模板债务 783→1650）并验证扫描 PASS
- [x] 2.3 构造「模板新增中文」样例验证可被拦截（本机冒烟 FAIL→移除后 PASS）

## 3. R3 术语词典扩充

- [x] 3.1 程序校验候选术语（zh/en 两侧均出现）→ 扩充 `01-docs/i18n-glossary.md` 至 10 条
- [x] 3.2 `glossary.test.js` 全绿（en 侧大小写不敏感）

## 4. 文档与交付

- [x] 4.1 更新 PRD §3.2 / `01-docs/i18n-sync-mechanism.md` 挂账状态 / CHANGELOG / AGENTS.md 边界说明
- [x] 4.2 全量定向测试 + eslint + openspec validate + 门禁自验（i18n 9 + glossary 2 + user-facing-error 17 + story2video 系列 47 + CreateView 155 + ResultView 29 全绿；eslint 0 error；CJK 1650 基线 PASS）
- [ ] 4.3 PR → CI → 合并 → 三同步归档
