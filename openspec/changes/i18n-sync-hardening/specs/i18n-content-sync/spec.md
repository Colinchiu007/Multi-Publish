## ADDED Requirements

### Requirement: 模板硬编码文案扫描
渲染端 `.vue` 文件的 `<template>` 块 SHALL 纳入硬编码中文字符串扫描（与 `.js` 及 `<script>` 块同等对待）；存量债务进入基线，新增硬编码字面量（模板文本或属性值中的中文）SHALL 被 CI Gate 7 拦截。

#### Scenario: 模板文本新增中文
- **WHEN** 某 `.vue` 模板文本（`<div>新增中文文案</div>`）新增中文字符串且未走 locale
- **THEN** 扫描失败并指出文件与行号

#### Scenario: 模板属性值新增中文
- **WHEN** 某 `.vue` 模板属性值（`placeholder="请输入"`）新增中文且未走 locale
- **THEN** 扫描失败并指出文件与行号

#### Scenario: 存量模板债务不误报
- **WHEN** 扫描在已入基线的存量模板中文上运行
- **THEN** 不产生失败（基线吸收存量）

### Requirement: 渲染端文案唯一事实源收口
渲染端模块（含 `utils/user-facing-error.js` 等错误文案目录）SHALL NOT 持有第二份 zh/en 文案副本；所有用户可见文案 SHALL 统一存放于 `locales/{zh,en}.js` 并通过 key 读取。错误码常量、数值映射与 pattern 归一化逻辑保留在模块内。

#### Scenario: errorCode 文案来自 locales
- **WHEN** `formatUserError` 返回某 errorCode 的本地化文案
- **THEN** 文案值来自 `locales` 的 `userErrors.*` 键，模块内不存在重复文案对象

#### Scenario: 扫描不再豁免错误目录
- **WHEN** CJK 扫描运行于 `utils/user-facing-error.js`
- **THEN** 该文件不再位于豁免清单（仅注释与正则字面量不误报）

### Requirement: 术语词典覆盖产品核心名词
术语词典（`01-docs/i18n-glossary.md`）SHALL 登记产品核心名词（流水线名、核心入口、设置页等用户高频可见名词），且每条术语的 zh/en 出现状态一致性由 `glossary.test.js` 强制校验。

#### Scenario: 新登记术语成对存在
- **WHEN** 词典新增某产品名词且 zh/en 文案均已使用
- **THEN** 词典校验通过

#### Scenario: 术语登记但未成对使用
- **WHEN** 词典中某术语仅在 zh 侧使用而 en 侧缺失
- **THEN** 词典校验失败并指出未同步方向
