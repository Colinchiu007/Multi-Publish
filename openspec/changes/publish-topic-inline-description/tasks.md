# Tasks: publish-topic-inline-description

> 实现状态：**已实现并合并**（PR #2640，squash `0dc2d98a`，CI 22 项全绿）；立项文档 PR #2631（squash `4f0e5b7d`）。本文件由收尾 docs PR 回填勾选状态。

- [x] 1. 渲染层追加管道（TDD：先测后码）
  - [x] 1.1 `apps/desktop/src/features/publish/topic-inline.test.js`：追加（空描述/非空/多话题/词边界去重/话题名含井号/Markdown 安全）、移除（存在/不存在/空白归一）、extractInlineTopics（纯函数全量用例）——20 例（后经 CCG 评审补 URL 片段防护 3 例 → 23 例）
  - [x] 1.2 `apps/desktop/src/features/publish/topic-inline.js` 实现至绿（appendTopicsToContent / removeTopicFromContent / extractInlineTopics）
  - [x] 1.3 `Publish.vue` 视频分支接线：话题框/标签框 set → 追加管道；TagSuggester apply-tag、历史视频跳转三入口统一（**修正**：入口实为 `query.tags` 非 `query.topics`，见 design §2.2）；分支测试更新（Publish 75/75 → 88/88）
  - [x] 1.4 `Publish.vue` 图文分支 + `useBatchPublish.js` 同口径接线（手写双向绑定 + setBatchTagsText/setBatchTopicsText）；批量测试更新
  - [x] 1.5 locales zh/en 成对：placeholder 调整（Gate 7 pair + CJK 双 PASS）。**偏差**：`topicInlineHint` 未做（列 P1——placeholder 已表达「添加后自动带入描述」语义，一次性 hint 需额外持久化状态，按「最简单方案」原则缓做）
- [x] 2. 引擎格式转换单一实现
  - [x] 2.1 `content-formatter.test.js` 新用例：stripTopicsFromContent（剥离/空白归一/代码片段 `#include` 不误伤）、convertInlineTopics（weibo/tencent_video/baijiahao 双井号、其余保持）——17 例（后补 URL 片段防护 4 例 → 49/49）
  - [x] 2.2 `content-formatter.js` 实现 stripTopicsFromContent / convertInlineTopics 至绿（另含 extractInlineTopicNames / findInlineTopicPositions 共 4 函数）
  - [x] 2.3 独立字段型适配器接线：bilibili / zhihu / toutiao / wechat_mp buildPostData 前剥离，话题进独立字段。**修正**：baijiahao 实为内联转换型（逆向证据 bundle L222 话题 `#名#` 拼正文 + 表单无话题字段），已按代码证据锁定进契约矩阵
  - [x] 2.4 weibo 适配器 convertInlineTopics 接线（双井号转换）
- [x] 3. 缺陷修复（抖音/视频号）
  - [x] 3.1 `douyin-video.js`：content_desc 含内联话题 + text_extra 位置标记（字符偏移、hashtag_id: 0、无话题空数组）。**实现形态**：位置扫描用 content-formatter 的 `findInlineTopicPositions`（单一实现），douyin-video 内联映射为 text_extra 结构
  - [x] 3.2 `shipinhao-video.js`：composeShipinhaoDescription 经 convertInlineTopics 转 `#话题#`；shipinhao 测试更新
  - [x] 3.3 kuaishou：**行为变更**（原计划「不改码验证」有误）——新模型下话题已内联 content，原「tags 拼进 caption」会双份重复，故下线拼接；no-title-contract B-2 等三处断言同步新语义
- [x] 4. 跨包契约锁
  - [x] 4.1 `packages/api-publish-engine/test/topic-inline-contract.test.js`：15 平台三态矩阵清单 + 12 项行为锁 + 抖音 text_extra 偏移 + 剥离完整性 + 代码片段不误伤 + 单一实现结构锁（15/15）；已登记 `run-tests.js` 的 VITEST_FILES 白名单（否则被当 node 直跑必挂）
  - [x] 4.2 双向反证实跑：摘 bilibili stripTopicsFromContent 调用 → B-6+B-12 红（2 failed）；摘 douyin text_extra 标记 → B-1 红（1 failed）；均字节级还原后复跑 15/15 绿
- [x] 5. 文档与记忆
  - [x] 5.1 主 PRD 功能文档列表登记 PRD-PUBLISH-TOPIC-INLINE-DESCRIPTION-2026-10-09.md（立项 PR #2631）+ CHANGELOG 条目（立项 + 实现两条）
  - [x] 5.2 `01-docs/learnings.md` 经验条目（6 条：模型对齐 / 精确匹配防误伤 / URL 片段前置边界 / 单井号解析缺口 / 行为变更契约同步 / VITEST_FILES 白名单）
- [x] 6. 交付
  - [x] 6.1 全量相关测试本地通过：topic-inline 23/23 / Publish 88/88 / 发布面 13 文件 299/299 / 批量 / 草稿 / 流程 / 引擎 33 文件全绿（含契约锁 15/15）/ locales Gate 7 / 本地全量 `pnpm test` exit 0
  - [x] 6.2 视觉回归：publish-form / publish-history 双 PASSED（collection 首轮 flaky 复跑 3/3 绿；cloud-publish 1.77% 为 main 既有漂移）
  - [ ] 6.3 **真机发布验证（未执行）**：抖音（描述含话题 + text_extra 生效）、视频号（描述含 `#话题#`）各发布一条并记录证据——需真实平台账号与真实发布动作，由用户侧执行；契约锁已锁字节级请求体形态，真机验证待补
  - [x] 6.4 提交（pre-commit 分支守卫）→ push → PR → CI 绿 → 合并（PR #2640，22 项 checks 全 success）
- [x] 7. 收尾（本 PR）
  - [x] 7.1 远程同步回填：两条执行记录 PENDING → PASS（#2640 `0dc2d98a` / #2631 `4f0e5b7d`）
  - [x] 7.2 ledger 销账：删除 `gate-record-debt-ledger.json` 中两条登记项（32 → 30 条，`check-gate-record-debt.js` OK 无陈旧项）
