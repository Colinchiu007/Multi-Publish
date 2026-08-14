## Why

流水线显示名「全能创作 / Omni Creation」需更名为「故事讲述 / Story Telling」：产品定位从「全能创作」收敛为明确的叙事形态，用户对流水线能力的认知需要与新命名一致。本次为纯显示名更名（第二次更名，前身为 2026-08-12「图片轮播 / Image Carousel」→「全能创作 / Omni Creation」），机器 ID `story2video-compose` 为稳定标识，不得改名。

## What Changes

- 流水线展示名：zh「全能创作」→「故事讲述」；en「Omni Creation」→「Story Telling」（`pipelines.names.story2video-compose` / `pipelines.descriptions.story2video-compose`，描述文案同步）。
- 衍生用户可见文案同步：配置标题（configurationTitle）、权限提示（access_denied）、模式摘要（selectVideoScenesOff）、素材模式选项（materialAllImages / materialVideoImage）随流水线名更新（zh/en 成对）。
- 测试断言与 fixture 同步：i18n.test.js、glossary.test.js、PipelineBrowser.test.js、story2video-notifications.test.js、E2E route-functional-suite 正则与注释、ipc-mock 注释等更新为新名。
- 文档同步：PRD.md（§7.1 标题、§7.1.3 机器 ID 契约段的当前名描述、提示文字表三份副本、2026-08-12 更名笔记补链）、i18n-glossary.md、i18n-sync-mechanism.md、product-manual.md、live OpenSpec specs（story2video-omnipotent-creation / creation-mode / split-contract / provider-warning-ux / i18n-content-sync）。
- 记录新增：CHANGELOG.md 顶部新条目、.quality-gates.md 顶部本任务执行记录。
- 历史记录不动：旧 CHANGELOG 条目、learnings、归档（openspec/changes/archive、.ccg/tasks/archive）、PRD-video-creation 修订记录与用户原话引用。
- **不 BREAKING**：机器 ID `story2video-compose`、spec 目录名 `story2video-omnipotent-creation`、IPC/持久化契约均不变。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `story2video-omnipotent-creation`: 展示名契约从「全能创作 / Omni Creation」更新为「故事讲述 / Story Telling」，旧名残留检查与素材模式合法语义同步（机器 ID 不变）。
- `story2video-creation-mode`: 配置区引用从「全能创作」更新为「故事讲述」。
- `story2video-split-contract`: 分句链路契约中的流水线名引用更新为「故事讲述」。
- `story2video-provider-warning-ux`: 重新进入流水线场景的文案引用更新为「故事讲述」。
- `i18n-content-sync`: 术语词典示例名词更新为「故事讲述 / Story Telling」。

## Impact

- 代码：`apps/desktop/src/locales/{zh,en}.js`、`apps/desktop/src/views/CreateView.vue`（fallback 文案）；测试 6 个文件断言/fixture/注释。
- 文档：`01-docs/PRD.md`、`01-docs/i18n-glossary.md`、`01-docs/i18n-sync-mechanism.md`、`01-docs/product-manual.md`、`CHANGELOG.md`、`.quality-gates.md`、`openspec/specs/` 5 个 spec。
- 门禁：i18n 术语表 zh/en 出现状态校验（glossary.test.js）、locale 成对同步（CI Gate 7 check-locale-sync）、E2E 路由用例断言需同步更新。
