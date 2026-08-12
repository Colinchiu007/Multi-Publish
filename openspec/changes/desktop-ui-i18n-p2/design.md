## Context

Home.vue 为落地页（Options 风格 script setup），当前模板/脚本硬编码中文。vue-i18n 已启用（`src/i18n/index.js`，CSP 安全：静态消息转 Message Function，插值用 `(ctx) => ctx.named(...)`）。本项目已有命名空间先例（nav/publish/accounts/settings/create/story2video/pipelines）。

## Approach

1. zh.js / en.js 新增 `home` 命名空间（键见 proposal Impact）。
2. Home.vue：
   - `<script setup>` 引入 `useI18n()`，`const { t } = useI18n()`。
   - 模板硬编码中文 → `{{ t('home.xxx') }}`。
   - `greetingText` computed：返回时段 key（lateNight/morning/noon/afternoon/evening），模板 `t('home.greetings.' + greetingKey)`；或 computed 内直接 `t(...)`（vue-i18n composer t 在 computed 中随 locale 响应式重算）。
   - `statusLabel`：状态→key 映射 + `t('home.status.' + key)`。
   - `displayName` fallback → `t('home.user')`。
   - `formatTime`：`getAppLocale() === 'en' ? 'en-US' : 'zh-CN'`。
   - 平台 fallback 标签：`fallbackPlatformLabel(id)` 返回 `t('home.platforms.' + id)`，缺失时回退 id。
3. Home.test.js：`mount(HomeView, { global: { plugins: [i18n] } })`；原 zh 断言不变；新增 en 断言（`i18n.global.locale.value = 'en'` 后断言英文，finally 恢复 zh）。

## Risks

- 测试 mount 未装 i18n 插件会抛 `useI18n` 错误 → 更新 mount 配置。
- 时段问候在测试环境依赖 `new Date()` 实际时间 → 现有断言已用正则覆盖全部 5 个时段，保持。
- 视觉回归：文案文本不变（zh），仅渲染方式变化 → 无视觉差异。
