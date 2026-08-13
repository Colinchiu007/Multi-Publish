## Why

多语言（zh/en）用户可见文案目前依赖人工同步：`locales/zh.js` 与 `en.js` 无自动化一致性门禁，且 `story2video-notifications.js` 持有与 locales 重复的第二份 zh/en 语料。AI 会话或人工单独修改一个名词（如只改 zh.js）不会自动同步其他语言，历史上已多次出现「漏键后补」修复（26f36e78 / 46072426 / 86a409df / 94fdd3c8），en 用户会看到缺键回退、旧名词或未翻译文案。

## What Changes

- 建立「用户可见文案单一事实源」原则：文案只存在于 `locales/zh.js` + `en.js`（vue-i18n），服务层/主进程只发稳定机器码，文案由渲染端本地化。
- 新增自动化一致性门禁（L0）：
  - zh/en locale 叶子键集完全对称，缺键即测试失败；
  - 同一 key 的 zh/en 文案 `{param}` 插值集合一致；
  - locales 与 `story2video-notifications.js` 同 key 文案值一致（语料源收敛前兜底）；
  - 渲染端 `apps/desktop/src/` 非 locales 文件出现 CJK 字符串字面量即失败（注释除外）。
- 新增提交配对规则（L1）：locale 文件变更必须 zh/en 成对出现在同一提交，CI 拦截「只改 zh.js」的提交。
- 收敛重复语料源（L2）：`story2video-notifications.js` 文案并入 vue-i18n locales，模块只保留 key 常量与错误归一化逻辑。
- 建立术语词典（L3）：产品名词（如「全能创作 / Omni Creation」）集中维护，改名触发全量校验。

## Capabilities

### New Capabilities
- `i18n-content-sync`: 多语言文案同步机制——zh/en 键对称、插值占位符一致、重复语料源一致、locale 成对提交、渲染端硬编码文案禁令、术语词典。

### Modified Capabilities
- `user-facing-messages`: 新增「渲染端用户可见文案单一事实源」约束，要求 zh/en 成对且不重复持有文案（见 ADDED requirement delta）。

## Impact

- 测试：`apps/desktop/src/i18n/i18n.test.js` 新增键对称/占位符/重复源断言；`story2video-notifications.test.js` 随收敛调整。
- 源码：`apps/desktop/src/story2video/story2video-notifications.js`（L2 收敛，文案移除，调用点改用 `i18n.global.t`）。
- CI：`.github/workflows/` 新增 locale diff 配对与 CJK 扫描 job。
- 文档：PRD §3.2 已新增小节；`01-docs/i18n-sync-mechanism.md` 为独立设计文档；AGENTS.md / `.quality-gates.md` 增加成对修改条款。
