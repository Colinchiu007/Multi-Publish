# Tasks: publish-topic-inline-description

- [ ] 1. 渲染层追加管道（TDD：先测后码）
  - [ ] 1.1 `apps/desktop/src/features/publish/topic-inline.test.js`：追加（空描述/非空/多话题/词边界去重/话题名含井号/Markdown 安全）、移除（存在/不存在/空白归一）、extractInlineTopics（纯函数全量用例）
  - [ ] 1.2 `apps/desktop/src/features/publish/topic-inline.js` 实现至绿（appendTopicsToContent / removeTopicFromContent / extractInlineTopics）
  - [ ] 1.3 `Publish.vue` 视频分支接线：话题框/标签框 set → 追加管道；TagSuggester apply-tag、query.topics 三入口统一；分支测试更新
  - [ ] 1.4 `Publish.vue` 图文分支 + `useBatchPublish.js` 同口径接线；批量测试更新
  - [ ] 1.5 locales zh/en 成对：placeholder 调整 + topicInlineHint（Gate 7 四项检查）

- [ ] 2. 引擎格式转换单一实现
  - [ ] 2.1 `content-formatter.test.js` 新用例：stripTopicsFromContent（剥离/空白归一/代码片段 `#include` 不误伤）、convertInlineTopics（weibo/tencent_video 双井号、其余保持）
  - [ ] 2.2 `content-formatter.js` 实现 stripTopicsFromContent / convertInlineTopics 至绿
  - [ ] 2.3 剥离型适配器接线：bilibili / zhihu / toutiao / baijiahao / wechat_mp buildPostData 前剥离，剥离话题进独立字段；各适配器测试更新
  - [ ] 2.4 weibo 适配器 convertInlineTopics 接线（双井号转换）

- [ ] 3. 缺陷修复（抖音/视频号）
  - [ ] 3.1 `douyin-video.js`：content_desc 含内联话题 + `buildTextExtra` 位置标记（字符偏移、hashtag_id: 0、无话题空数组）；douyin 链测试更新（含中文偏移用例）
  - [ ] 3.2 `shipinhao-video.js`：composeShipinhaoDescription 经 convertInlineTopics 转 `#话题#`；shipinhao 测试更新
  - [ ] 3.3 kuaishou 既有行为验证（不改码，契约锁定）

- [ ] 4. 跨包契约锁
  - [ ] 4.1 `packages/api-publish-engine/test/topic-inline-contract.test.js`：15 平台三态矩阵 + 抖音 text_extra 偏移 + 剥离完整性 + 结构锁（适配器源码无本地剥离正则）
  - [ ] 4.2 双向反证实跑：摘 stripTopicsFromContent 调用 → 红；摘 buildTextExtra → 红（记录反证证据）

- [ ] 5. 文档与记忆
  - [ ] 5.1 主 PRD 功能文档列表登记 PRD-PUBLISH-TOPIC-INLINE-DESCRIPTION-2026-10-09.md + CHANGELOG 追加
  - [ ] 5.2 `01-docs/learnings.md` 经验条目（参考产品话题内联模型取证结论 + 剥离/转换单一实现纪律）

- [ ] 6. 交付
  - [ ] 6.1 全量相关测试本地通过：topic-inline / Publish 分支 / useBatchPublish / usePublishDrafts / usePublishFlow / 引擎全量（含契约锁）/ locales Gate 7
  - [ ] 6.2 真机发布验证：抖音（描述含话题 + text_extra 生效）、视频号（描述含 `#话题#`）各一条（记录证据）
  - [ ] 6.3 提交（pre-commit 分支守卫）→ push → PR → CI 绿 → 合并
