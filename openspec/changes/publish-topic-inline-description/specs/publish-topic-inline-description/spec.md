# publish-topic-inline-description (delta: publish-topic-inline-description)

## ADDED Requirements

### Requirement: 话题内联描述单一真源

发布页的标签/话题输入 SHALL 作为「快速添加入口」：用户添加标签或话题时，渲染层 MUST 立即以 `#话题名` 文本形态追加到描述输入框尾部（词边界去重、空格分隔），用户所见描述即最终文案形态。描述文本 SHALL 是话题的唯一真源——发布链路从描述文本解析话题；用户在描述框手动编辑话题 MUST NOT 被输入框值反向覆盖。追加/移除管道 MUST 为纯函数单一实现（`topic-inline.js`），视频/图文/批量三分支 MUST 共用，MUST NOT 各自复制逻辑。

#### Scenario: 添加话题立即可见
- **WHEN** 用户在话题框输入「美食探店」并确认
- **THEN** 描述输入框尾部出现 `#美食探店`；描述已有同话题（词边界完整匹配）时不重复追加

#### Scenario: 描述手动编辑优先
- **WHEN** 用户在描述框手动删除或修改某个 `#话题` 片段后发布
- **THEN** 发布内容以描述文本解析为准，话题输入框的旧值不产生双份话题

#### Scenario: 三入口统一管道
- **WHEN** 经话题框、智能标签建议（apply-tag）、热门话题页跳转任一入口添加话题
- **THEN** 均经同一追加管道进入描述，行为一致

### Requirement: 发布时平台隐性格式转换

话题的平台格式差异 MUST 在引擎层发布时隐性转换，用户无感知。转换 MUST 在 `content-formatter.js` 单一实现（`convertInlineTopics` / `stripTopicsFromContent`），各平台适配器只调用，MUST NOT 自抄转换逻辑。平台分三态：**内联保留**（douyin/kuaishou/xiaohongshu/tiktok/twitter/instagram/youtube，描述保留 `#话题`）、**内联转换**（weibo/tencent_video，`#话题` → `#话题#`）、**剥离独立字段**（bilibili/zhihu/toutiao/baijiahao/wechat_mp，话题从描述剥离进平台独立字段）。

#### Scenario: 微博双井号转换
- **WHEN** 描述含 `#美食探店` 的内容发布到微博
- **THEN** 微博正文含 `#美食探店#`（双井号），用户在发布页看到的是单井号形态

#### Scenario: B站剥离进独立字段
- **WHEN** 描述含 `#美食探店` 的内容发布到B站
- **THEN** B站 desc 不含 `#美食探店` 片段，tag 独立字段含「美食探店」；描述与字段无双份重复

#### Scenario: 剥离不误伤代码片段
- **WHEN** 描述含代码片段 `#include` 等非话题形态的 `#` 文本并发布到剥离型平台
- **THEN** 代码片段不被剥离逻辑移除（话题字符集与分隔判定排除该形态）

### Requirement: 抖音话题链路（缺陷修复）

抖音发布链 MUST 把描述中的内联话题体现在 `create_v2` 投稿体：`content_desc` 含 `#话题名` 文本，`text_extra` 数组 MUST 为每个话题生成位置标记段（`{start, end, type: 0, user_id: "", hashtag_id: 0, hashtag_name}`，偏移按字符口径）。无话题时 `text_extra` 为空数组。`hashtag_id` P0 恒为 0（纯文本话题，平台话题实体回填属后续演进）。

#### Scenario: 抖音描述含话题且位置标记正确
- **WHEN** 描述为「今天探店 `#美食探店` 太好吃了」发布到抖音
- **THEN** content_desc 保留原文；text_extra 含一段 hashtag_name 为「美食探店」的标记，start/end 与该片段在 content_desc 中的字符偏移一致

#### Scenario: 无话题时兼容现状
- **WHEN** 描述不含任何 `#话题` 片段发布到抖音
- **THEN** text_extra 为空数组，与既有行为一致

### Requirement: 视频号话题链路（缺陷修复）

视频号发布链的 description MUST 包含描述中的内联话题，且话题形态转换为 `#话题名#`（微信系双井号）。标题合并入描述首行的既有行为（publish-capability-registry 无标题契约）MUST NOT 改变。

#### Scenario: 视频号描述含双井号话题
- **WHEN** 描述含 `#美食探店` 的视频发布到视频号
- **THEN** post_create 请求体 description 含 `#美食探店#`；标题仍为描述首行

### Requirement: 跨包话题内联契约锁

`packages/api-publish-engine` 的契约测试 MUST 断言 15 平台三态矩阵（内联保留/内联转换/剥离独立字段）与各适配器实际行为一致，并锁定抖音 text_extra 偏移口径与剥离完整性（剥离后描述无残留话题片段）。摘除任一适配器的转换/剥离/标记调用时，契约测试 MUST 变红（双向反证）。

#### Scenario: 矩阵与行为一致
- **WHEN** 运行话题内联契约测试
- **THEN** 内联型平台描述保留话题（微博/视频号为双井号）、剥离型平台描述干净且独立字段含话题、抖音 text_extra 偏移正确

#### Scenario: 反证——摘除转换即红
- **WHEN** 移除任一适配器对 stripTopicsFromContent / convertInlineTopics / buildTextExtra 的调用
- **THEN** 契约测试失败
