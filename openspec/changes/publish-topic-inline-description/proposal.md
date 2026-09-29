# Proposal: publish-topic-inline-description（话题内联描述：标签/话题所见即所得 + 发布时平台隐性格式转换 + 抖音/视频号话题链路修复）

## Why

发布页「标签」「话题」输入框与「描述输入框」割裂：用户填了标签/话题看不到最终平台内容形态；且存在真实缺陷——**抖音、视频号两条链路把 tags 静默丢弃**（`douyin-video.js:78-96` `content_desc` 只取正文且 `text_extra: []` 恒空；`shipinhao-video.js:64-67` description 只合并标题+正文），用户填的话题发到这两个最主流视频平台的内容里根本不存在。

用户已确认（2026-10-09）：
1. **完全按参考产品（4.13.19 逆向取证）逻辑实现**：标签/话题添加后直接体现在视频描述输入框中（描述文本是话题真源，所见即所得）；
2. **平台格式差异在发布时隐性转换**（如微博 `#话题#` 双井号、B站/知乎剥离进独立字段），用户无感知；
3. 逆向取证目录由用户提供（目录名含品牌词按 Gate 12 红线不入库，取证证据见 PRD §2）。

参考产品逆向取证核心结论（bundle `packages/main/dist/index.cjs`）：
- 描述是富文本，话题以 `<topic text="名" raw="<平台话题实体JSON>">` **内联**在描述文本流中，UI 上直接可见可编辑；
- 发布时各平台隐性转换：小红书/视频号 ` #名[话题]# ` + `hash_tag` 结构化、微博 `#名#`、知乎 `<a>` + topic_id、B站独立字段；
- 话题验证 fail-closed：查不到平台话题实体则删除话题节点不发。

## What Changes

### A. 渲染层：话题追加管道（所见即所得）

- 新增 `apps/desktop/src/features/publish/topic-inline.js`（纯函数）：`appendTopicsToContent(content, names)`（词边界去重 + 尾部空格分隔追加）、`removeTopicFromContent(content, name)`（片段移除 + 空白归一）。
- `Publish.vue`（视频/图文两分支）+ `useBatchPublish.js`：话题框/标签框 set → 经追加管道同步描述；三入口统一（话题框、TagSuggester apply-tag、热门话题跳转 `query.topics`）。
- 同步方向单向：话题框 → 描述；描述手动编辑不回写话题框，发布时以描述解析为准（主进程 `mergeUniqueStrings` 三合一去重已有，天然兼容不双份）。
- locales zh/en 成对：placeholder 调整（「添加后自动带入描述，多个用逗号分隔」）+ 首次带入 hint。

### B. 引擎层：发布时隐性格式转换（单一实现）

- `content-formatter.js` 新增 `stripTopicsFromContent(content)`（剥离 `#话题` 片段）与 `convertInlineTopics(platform, content)`（`#话题` → 平台格式），各适配器调用，禁止自抄。
- **内联型**（话题保留描述）：抖音 `#话题`、快手（已有验证）、小红书 `#话题`、视频号 `#话题#`（转换）、微博 `#话题#`（转换）、TikTok/Twitter/Instagram/YouTube `#话题`。
- **独立字段型**（剥离进字段）：B站 tag、知乎 topics、头条 tags、百家号话题、公众号标签——剥离避免描述+字段双份。

### C. 缺陷修复（P0）

- **抖音**：`buildDouyinPostData` 的 `content_desc` 含内联 `#话题` + `text_extra` 位置标记段（`{start, end, hashtag_name, hashtag_id: 0}`，纯文本话题不查实体，实体回填列 P2）。
- **视频号**：`composeShipinhaoDescription` 描述含 `#话题#`（双井号转换）。

### D. 跨包契约测试

- `packages/api-publish-engine/test/topic-inline-contract.test.js`：15 平台格式矩阵三态断言（内联保留/格式转换/剥离独立字段）+ 抖音 text_extra 偏移正确性（含中文多字节口径）+ 剥离完整性 + 双向反证（摘剥离逻辑红、摘 text_extra 标记红）。

## Impact

- 受影响面：`apps/desktop/src/features/publish/`（新增 topic-inline.js）、`apps/desktop/src/views/Publish.vue`、`apps/desktop/src/composables/useBatchPublish.js`、`apps/desktop/src/locales/`、`packages/api-publish-engine/src/content-formatter.js`、`packages/api-publish-engine/src/publish/platforms/douyin-video.js`、`shipinhao-video.js`、`bilibili-video.js`、各剥离型适配器、新增契约测试。
- 行为变化：抖音/视频号发布内容开始包含话题（缺陷修复）；微博描述话题转双井号；B站/知乎/头条/百家号/公众号描述不再含 `#话题` 片段（剥离进字段）；描述文本成为话题真源。
- 破坏性：无（tags/topics 数组字段与主进程三合一合并保留，旧草稿兼容；RPA 链描述已含话题自然生效）。
- 文档：`01-docs/PRD-PUBLISH-TOPIC-INLINE-DESCRIPTION-2026-10-09.md`（已建），主 PRD 登记 + CHANGELOG 追加随实现提交。

## Out of Scope

- 话题高亮卡片（Quill 自定义 blot `<topic>` 内联节点视觉化）——P1。
- 截断占位符机制（参考产品 `{tmp_h_N}` 先提取→截断→还原；本仓 P0 话题随描述一起截断）——P1 评估。
- 平台话题搜索接口接入（发布前验证话题实体、回填 id/link；四平台接口取证已备于 PRD §2.3）——P2。
- 抖音 hashtag_id 真实实体回填（P0 恒 0 纯文本）——P2。
- @好友内联描述（`<friend>` 模型）——P2。
