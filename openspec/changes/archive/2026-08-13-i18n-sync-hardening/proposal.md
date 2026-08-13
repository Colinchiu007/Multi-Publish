## Why

i18n-content-sync 的核心门禁已落地（键对称/占位符/配对/JS+CJK 扫描/词典），但上一轮明确挂账三项硬化缺口：`.vue <template>` 硬编码文案不在扫描范围；`utils/user-facing-error.js` 仍是第二份 zh/en 文案目录（扫描显式豁免）；术语词典仅 2 条。用户要求全部实现。

## What Changes

- **模板硬编码扫描**：`.vue <template>` 块纳入 CJK 硬编码扫描（基线增量式——存量债务入基线，新增硬编码被 Gate 7 拦截）。
- **错误目录收口**：`utils/user-facing-error.js` 的 30 个 errorCode 文案并入 `locales`（`userErrors` 命名空间），模块只保留 code 常量、数值映射与 pattern 归一化逻辑；移除扫描豁免。
- **术语词典扩充**：登记产品核心名词（经程序校验 zh/en 均出现后加入），强化「改名词必须成对」的拦截面。

## Capabilities

### New Capabilities
- 无

### Modified Capabilities
- `i18n-content-sync`: ADDED 三条 requirement —— 模板硬编码文案扫描、渲染端文案唯一事实源收口、术语词典覆盖产品核心名词。

## Impact

- `apps/desktop/src/utils/user-facing-error.js` + `user-facing-error.test.js`（文案来源改为 locales，断言不变）
- `apps/desktop/src/locales/{zh,en}.js`（新增 `userErrors` 30×2 键）
- `.github/scripts/check-locale-sync.js` + 基线（template 扫描 + 移除豁免）
- `01-docs/i18n-glossary.md` + `glossary.test.js`（术语扩充）
- 文档：PRD §3.2 / `01-docs/i18n-sync-mechanism.md` / CHANGELOG
