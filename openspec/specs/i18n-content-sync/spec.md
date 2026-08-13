# i18n-content-sync Specification

## Purpose

Define automated guards that keep zh/en user-facing copy permanently in sync — key parity, interpolation placeholder parity, duplicate-source parity, paired locale commits, and a hardcoded-copy ban — so a one-off change to one language cannot silently drift the other.

## Requirements

### Requirement: 语言资源键对称
应用的全部 locale 资源 SHALL 保持 zh/en 叶子键完全对称：任何语言文件中的任意叶子键（含嵌套路径）都必须在另一语言文件中存在，缺键即视为一致性违约并导致门禁失败。

#### Scenario: 新增 zh 键未补 en
- **WHEN** 在 `locales/zh.js` 新增叶子键 `home.newFeature` 而 `locales/en.js` 未同步新增
- **THEN** 一致性测试失败并指出缺失键路径，CI 阻断该提交

#### Scenario: 成对新增键
- **WHEN** 在 zh/en 两个 locale 文件同时新增同一路径的叶子键
- **THEN** 一致性测试通过

### Requirement: 插值占位符一致性
同一 key 的 zh/en 文案中 `{param}` 占位符集合 SHALL 完全一致；任一语言缺失或多余占位符均视为一致性违约。

#### Scenario: 英文漏掉插值占位符
- **WHEN** 中文文案为 `已用时 {duration}`，英文文案为 `Elapsed`（缺 `{duration}`）
- **THEN** 占位符一致性测试失败并指出缺失占位符

#### Scenario: 占位符成对维护
- **WHEN** zh/en 文案使用相同的占位符集合
- **THEN** 占位符一致性测试通过

### Requirement: 重复语料源一致性
在重复语料源收敛完成前，同一 key 同时存在于 `locales/*.js` 与 `story2video-notifications.js` 时，两处文案值 SHALL 逐字一致；任何漂移均导致门禁失败。收敛完成后本条要求由「单一事实源」要求替代。

#### Scenario: 两处文案漂移
- **WHEN** `locales/zh.js` 修改了 `story2video.bgm_skipped` 的值而 `story2video-notifications.js` 未同步
- **THEN** 重复源校验测试失败并指出不一致的 key 与两份值

#### Scenario: 两处文案一致
- **WHEN** 两处同 key 文案值完全一致
- **THEN** 重复源校验测试通过

### Requirement: locale 文件成对提交
任何提交 SHALL 不得只修改 zh 或只修改 en 的 locale 文件；CI SHALL 在 diff 仅含 `locales/zh.js`（或仅含 `locales/en.js`）时阻断该提交。

#### Scenario: 只改 zh.js 的提交
- **WHEN** 某提交修改了 `apps/desktop/src/locales/zh.js` 而未修改 `en.js`
- **THEN** CI 的 locale 配对检查失败并提示补齐另一语言文件

#### Scenario: 成对修改 locale 文件
- **WHEN** 某提交同时修改 `zh.js` 与 `en.js`
- **THEN** locale 配对检查通过

### Requirement: 渲染端硬编码用户可见文案禁令
渲染端 `apps/desktop/src/`（locales 目录除外）SHALL NOT 出现面向用户的硬编码中文字符串字面量；检测 SHALL 忽略注释、平台数据源与纯标识符。新增用户可见文案必须通过 locale key 输出。

#### Scenario: 组件内直接写中文
- **WHEN** 某 `.vue` 或 `src/` 下 `.js` 文件（非 locales）新增中文字符串字面量作为展示文案
- **THEN** 硬编码扫描失败并指出文件与行号

#### Scenario: 注释与数据源豁免
- **WHEN** CJK 仅出现在代码注释或平台数据源（如平台显示名）中
- **THEN** 硬编码扫描通过

### Requirement: 术语词典
产品名词（如「全能创作 / Omni Creation」）SHALL 有集中维护的术语词典；当词典中的 zh 名词在任一 locale 文案中发生变更时，门禁 SHALL 校验对应 en 名词映射在 en 文案中已同步（或输出未同步候选词）。

#### Scenario: 词典名词只改了中文
- **WHEN** zh 文案将「全能创作」改为新名词而 en 文案仍为旧映射
- **THEN** 术语校验失败或输出 en 侧未同步候选词清单

#### Scenario: 词典名词成对更新
- **WHEN** zh/en 文案同步更新为词典中的新映射
- **THEN** 术语校验通过

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
