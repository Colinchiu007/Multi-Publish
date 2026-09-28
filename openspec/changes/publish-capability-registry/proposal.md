# Proposal: publish-capability-registry（发布能力注册表：通用/差异化内容单一真源 + 无标题平台标题入描述首行）

## Why

15 个平台的「发布提交内容项」元数据目前分散在 4 处硬编码且互相矛盾：

| 数据源 | 位置 | 矛盾实例 |
| --- | --- | --- |
| 渲染层内容限制 | `apps/desktop/src/features/publish/publish-contract.js` PLATFORM_CONTENT_LIMITS | douyin contentMax=0（不校验）vs yaml 1000；tiktok titleMax=2200 vs yaml 150 |
| 主进程平台配置 | `config/platforms.yaml` max_title/max_content | tencent_video/kuaishou 无条目时渲染层回落默认 5000，与 yaml 1000 漂移 |
| 差异化 UI | `PlatformOverridePanel.vue` 8 个平台硬编码 `v-if platform.id === 'xxx'` | 新增平台必须改组件代码；平台字段无元数据 |
| 引擎侧截断 | `api-publish-engine/src/content-formatter.js` | 第三份限制表（weibo title 120 vs 渲染层 0） |

同时存在真实 Bug：**无标题平台（视频号等 6 个）在 API 发布链上标题被丢弃**——
`shipinhao-video.js:67` `description: String(td.content == null ? td.title : td.content)`（有正文时标题直接丢失）、
`adapters/twitter.js:40` `text: taskData.content || taskData.title`（同款）。
DOM RPA 链靠「title_input 选择器解析失败」的隐式回退把标题合并进编辑器（`_composeEditorCaption`），行为正确但不可声明、不可测、且每个无标题平台白等 10s 选择器超时。

用户已确认（2026-10-08 grilling 轮）：
1. **通用内容阈值 = 3 个及以上平台共有**（语义对齐，非字段名对齐；2 平台共有 = 半共有，留差异化区打标记）；
2. **机制 = 声明式注册表**（非数据库——平台能力是随版本发布的代码级事实）；
3. **无标题平台清单 = 6 个**：视频号、快手、微博、X/Twitter、Instagram、TikTok；
4. **修复范围 = API 链 + DOM RPA 显式化 + 跨包契约测试**；
5. **注册表全量收录**已知发布能力（含 UI 未暴露项，标记 uiExposed: false）。

## What Changes

### A. 新增注册表（单一真源）
- `packages/shared-utils/src/publish-capabilities.js`（CJS，主进程/Node）+ `publish-capabilities.browser.js`（ESM，渲染进程），对齐 `platform-definitions.js` 的双版本先例。
- 声明内容：每平台 `titleMode`（`title` | `caption`）、内容限制（titleMax/titleMaxBytes/contentMax）、平台特有字段定义（key/label/type/options/default/校验规则/semantic 分组/uiExposed）、通用主表单字段支持矩阵。
- 计算分类：按 `semantic` 键跨平台聚合计数，`≥3` → 通用（common），`=2` → 半共有（semi-common），`=1` → 独有（unique）。
- 导出 `composeNoTitleDescription(title, content, { maxLen })`：标题插入描述首行 + 按平台 contentMax 截断（标题优先存活）。

### B. 渲染层接入
- `publish-contract.js`：PLATFORM_CONTENT_LIMITS 改为从注册表派生（对外 API 不变）；`validatePlatformContent` 对无标题平台校验「标题+正文合并后」长度。
- `PlatformOverridePanel.vue`：8 个硬编码 v-if 平台块 → 注册表数据驱动渲染（含 select/checkbox/collection 类型）。
- `Publish.vue`（视频/图文两个分支）：通用字段标注支持平台数（N/15）；选中无标题平台时标题输入框旁提示「标题将作为描述首行（视频号/快手/微博/X/Instagram/TikTok）」。
- `locales/zh.js` + `en.js` 成对新增文案（CI Gate 7）。

### C. 主进程与引擎修复
- `rpa-view-platforms.js` `_publish_generic`：注册表 `isNoTitlePlatform` 命中时显式跳过 title_input 解析（省 10s 超时），直接走编辑器合并路径。
- `shipinhao-video.js` `buildShipinhaoPostData`：`description` = 标题首行 + 正文（修复标题丢弃）。
- `adapters/twitter.js`、`adapters/weibo.js`、`adapters/tiktok.js`：同口径合并。
- `kuaishou-video.js`：已正确合并（验证 + 契约锁定，不改行为）。

### D. 跨包契约测试
- 新增 `packages/api-publish-engine/test/no-title-contract.test.js`：读注册表无标题清单，断言引擎侧各链/适配器的标题合并行为与清单一致（快手既有、视频号/Twitter/微博/TikTok 修复后）。

## Impact

- 受影响面：`packages/shared-utils`（新增）、`apps/desktop/src/features/publish/`（contract + 组件）、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/locales/`、`apps/desktop/electron/services/rpa-view-platforms.js`、`packages/api-publish-engine`（3 适配器 + 1 链 + 契约测试）。
- 行为变化：无标题平台 API 链标题不再丢弃（Bug 修复）；无标题平台 DOM RPA 少等一次 10s title_input 超时；渲染层对无标题平台的超长校验口径变为「合并后长度」。
- 破坏性：无（注册表派生值与现渲染层强制值保持一致，仅补齐缺失条目；详见 design §5 限制对齐表）。
- 文档：新增 `01-docs/PRD-PUBLISH-CAPABILITY-REGISTRY-2026-10-08.md`（全量能力矩阵 + 数据校验 + 交互 + 提示文字），主 PRD 补登记，CHANGELOG 追加。

## Out of Scope

- `content-formatter.js` 引擎侧第三份限制表与注册表的合并（引擎零依赖约束，另立 change；本 change 仅以契约测试锁无标题清单一致性）。
- `platforms.yaml` 的 max_title/max_content 收敛（主进程配置面，涉及 RPA compose 截断链路，另行评估）。
- 抖音 goods / 小红书 goods / 抖音 taskId 的 UI 暴露（注册表先收录并标记 uiExposed: false）。
- 视觉回归基线截图更新（本次 UI 改动为信息标注与数据驱动重构，不改布局结构；`npm run test:visual:pixel` 跑通即收）。
