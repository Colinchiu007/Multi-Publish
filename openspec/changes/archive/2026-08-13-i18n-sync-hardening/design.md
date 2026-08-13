## Context

现状（见 proposal.md - Why）：Gate 7 只扫 `.js` 与 `.vue <script>`；`user-facing-error.js` 持有 30×2 条 zh/en 文案且被扫描豁免；词典仅 2 条。均为上一轮 `i18n-content-sync` 明确记录的挂账项。

## Goals / Non-Goals

**Goals:**
- 让 Gate 7 覆盖 `.vue <template>`（文本 + 属性值），新增硬编码必被拦截。
- 消除 `user-facing-error.js` 第二语料源，locales 成为唯一事实源；移除扫描豁免。
- 扩充词典覆盖产品核心名词。

**Non-Goals:**
- 不做存量模板文案的批量 i18n 转换（P2/P3 批次另立任务；本 change 只保证新增被拦截）。
- 不触碰并发会话 active change（desktop-ui-i18n-p2 / prompt-eval-ops-workbench）与 CreateView P3 大工程。

## Decisions

**D1：template 扫描采用「块提取 + 注释剥离 + 行级 CJK 检测」。**
- 提取 `<template>...</template>`，剥离 `<!-- -->`，对每行检测：引号属性值中的中文 + `>` `<` 之间文本中的中文。
- 不解析完整 HTML AST（无新依赖）；误报由基线吸收，新命中即拦截。
- 备选：@vue/compiler 解析。不选：引入依赖与构建集成成本，收益与行级启发式相当。

**D2：userErrors 命名空间 + localeMessageSource 模式（复用 story2video 收敛范式）。**
- locales 新增 `userErrors.<ERROR_CODE>`（30×2）；`user-facing-error.js` 通过点路径从原始 locale 树读取模板串。
- 保留：`USER_ERROR_CODES`、`NUMERIC_CODE_MAP`、`PATTERN_RULES`、`TECHNICAL_TEXT_PATTERNS`。
- 移除 `MESSAGES` 与扫描豁免；行为零变化（文案值原样迁移）。

**D3：词典扩充以程序校验为门槛。**
- 候选术语先跑「zh/en 两侧 locale 值均出现」校验，通过的才登记，避免 glossary.test.js 误报。

## Risks / Trade-offs

- [template 扫描误报（平台数据源/正则注释）] → 基线吸收 + 显式数据源豁免清单；扫描先覆盖文本与属性值，后续按实测收窄。
- [user-facing-error 迁移破坏既有断言] → 文案值逐字迁移；测试断言不变，迁移前后双跑 `user-facing-error.test.js`。
- [词典扩充误伤（同名词多义）] → 仅登记程序校验通过的术语。

## Migration Plan

1. R2 先行（错误目录收口）→ 移除豁免 → 跑测试。
2. R1（template 扫描）→ 重生成基线（吸收存量）→ 验证新增可拦截。
3. R3（词典扩充）→ glossary.test.js 通过。
4. 文档/CHANGELOG → PR → CI → 三同步归档。

## Open Questions

- template 属性值扫描对「平台数据源」类属性（如 `:data` 绑定中文）的豁免边界，待基线实测后按需收窄——不改变 spec 与任务分解。
