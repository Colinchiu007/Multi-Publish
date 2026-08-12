## Why

PROMPT-TEXT-SPEC §7 多语言覆盖审计结论：渲染端约 118 源文件、数千处硬编码中文 UI 文案未纳入 vue-i18n，英文界面下仍显示中文。P1（技术性错误统一 formatUserError）已完成（PR #529 / #560）。本 change 启动 P2 第一批：首页 Home.vue 全量文案抽入 vue-i18n（zh/en），作为存量 i18n 分批推进的示范批次。

## What Changes

- `src/locales/zh.js` / `en.js` 新增 `home` 命名空间：副标题、快捷操作/入口、统计标签、时段问候（5）、状态标签（6）、平台 fallback 标签（11）、空态/无标题等约 30 个键。
- `src/views/Home.vue`：模板硬编码中文全部替换为 `t('home.*')`；脚本 greetingText/statusLabel/displayName/formatTime 接入 i18n（时段问候按 key 映射、状态按 key 映射、时间格式化按当前 locale 使用 zh-CN/en-US、平台 fallback 标签走 `home.platforms.<id>`）。
- `src/views/Home.test.js`：mount 增加 vue-i18n 插件；断言保持 zh locale 中文文本不变，另加 1 条 en locale 断言（验证英文输出）。
- 文档：PROMPT-TEXT-SPEC §8 进度登记 P2 首批完成；CHANGELOG。

## Capabilities

### New Capabilities
- `ui-i18n-p2`: 首页（Home）UI 文案全量多语言化（zh/en），语言切换即时生效。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：`apps/desktop/src/views/Home.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`
- 测试：`apps/desktop/src/views/Home.test.js`
- 文档：`01-docs/PROMPT-TEXT-SPEC.md`、`CHANGELOG.md`
