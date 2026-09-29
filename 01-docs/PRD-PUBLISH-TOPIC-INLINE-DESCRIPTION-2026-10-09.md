# PRD：话题内联描述模型（publish-topic-inline-description）— 标签/话题所见即所得 + 发布时平台隐性格式转换

> **立项日期**: 2026-10-09
> **关联 change**: [openspec/changes/publish-topic-inline-description](../openspec/changes/publish-topic-inline-description/)
> **状态**: 已立项（待实现）
> **决策确认**: 用户 2026-10-09 确认——①完全按参考产品逻辑实现（标签/话题添加后体现在视频描述输入框中）；②平台格式差异（如微博 `#话题#`）在发布时隐性转换；③参考产品逆向工程目录由用户提供（目录名含品牌词按 Gate 12 红线不入库）。

---

## 一、背景与问题

### 1.1 用户需求（直接需求）

发布页的「标签」「话题」两个输入框与「描述输入框」彼此割裂：用户填了标签/话题后，看不到最终发到平台的内容长什么样；对抖音/快手/视频号这类「话题就是描述文案一部分」的平台，用户更是无从感知话题是否生效。

用户指定对齐参考产品 4.13.19 的交互模型：**标签/话题添加后直接体现在视频描述输入框中**（所见即所得），平台格式差异（如微博双井号）在发布时隐性转换。

### 1.2 现状真实缺陷（代码证据）

| 平台 | 标签/话题的最终去向 | 证据 |
| --- | --- | --- |
| 快手 | ✅ 转成 `#话题` 拼进 caption（标题+正文+标签合并） | `packages/api-publish-engine/src/publish/platforms/kuaishou-video.js:67-70` |
| B站 | ✅ 走独立 `tag` 字段（B站 API 原生支持），描述不拼 | `bilibili-video.js:68-71` |
| **抖音** | ❌ **静默丢弃**：`content_desc` 只取正文，`text_extra: []` 恒空 | `douyin-video.js:78-96` |
| **视频号** | ❌ **静默丢弃**：description 只合并标题+正文 | `shipinhao-video.js:64-67` |

用户在 UI 填写的标签/话题，发到抖音、视频号的内容里**根本不存在**——这两个恰是最主流的视频平台。这不是体验问题，是功能缺陷。

### 1.3 现状数据流（割裂的三段式）

```
UI 层（Publish.vue）：
  标签框 article.tags / 话题框 article.topics / 描述框 article.content —— 三个独立字段，互不可见
主进程（publisher-router.js:201-219）：
  RichTextProcessor 解析 content 里的 #话题# → 与 base.tags、override.topics 三路 mergeUniqueStrings 成 tags 数组
引擎层：
  各适配器自行决定消费或丢弃 tags（见 1.2 矩阵）
```

问题：用户输入（标签/话题框）与最终产物（平台描述）之间没有可见性；引擎消费不一致导致部分平台静默丢失。

---

## 二、参考产品 4.13.19 逆向取证（2026-10-09，用户提供逆向目录）

> 取证源：参考产品主进程 bundle `packages/main/dist/index.cjs`（8.4MB，ncc 打包）。目录名含品牌词按 Gate 12 红线不入库，可复现定位法寻回（同 PRD-PUBLISH-CAPABILITY-REGISTRY §1.3 口径）。

### 2.1 数据模型：话题是描述富文本的内联实体

- 描述（desc）是 **HTML 富文本**，话题以 `<topic text="话题名" raw="<urlencoded JSON>">` 内联节点存在于描述文本流中；@好友以 `<friend raw="...">` 内联。
- `<topic>` 的 `raw` 属性存**平台话题实体** `{id, name, link}`（发布前从平台话题搜索接口查回并回填）。
- **UI 上话题直接体现在描述编辑器里**（参考产品编辑器为云端页面 `www.<品牌域名>/web`，本地 Electron 壳经 Socket.IO 通信；话题在描述流中以高亮片段呈现），不存在与描述割裂的独立话题持久输入框。

### 2.2 发布时按平台隐性转换（各平台 buildPostData 证据）

| 平台 | `<topic>` 转换结果 | 结构化字段 | bundle 证据（行号为 index.cjs） |
| --- | --- | --- | --- |
| 小红书 | ` #话题名[话题]# ` 拼进 desc | `hash_tag: [{id, name, link, type:"topic"}]` | L204/L212/L312 |
| 视频号 | desc = 描述 + ` #话题名[话题]#` + ` @好友` | `hash_tag` / `ats` | L320 |
| 微博 | `#话题名# ` 拼进正文 | —（内联即实体） | L256/L262/L263 |
| 百家号 | `#话题名# ` 拼进 desc | searchtopic 接口查 id | L222 |
| 知乎 | 转 `<a>` 链接 + `{topic_id, topic_name}` | topics API | L228 |
| 抖音（DOM RPA） | 发布页独立话题输入框逐个回车（placeholder「精准话题标签带来更多播放，最多2个，按Enter键创建」） | — | L110266 |

### 2.3 话题验证与限额（fail-closed）

- `<topic>` 无 `raw` 或 `raw` 非 JSON → 用 `text` 属性调**平台话题搜索接口**查实体；查不到 → **删除该话题节点**（`removeChild` + continue，不发无效话题）。
- 小红书话题上限 10 个（`if(nt>=10) removeChild`），超限静默移除。
- 话题搜索接口（每平台一个真实接口）：
  - 微博 `weibo.com/ajax/mblog/topic`
  - 小红书 `edith.xiaohongshu.com/web_api/sns/v1/search/topic`
  - 百家号 `baijiahao.baidu.com/pcui/pcpublisher/searchtopic`
  - 知乎 `zhuanlan.zhihu.com/api/autocomplete/topics`
  - 微视 `getWeishiTopicsResponse`

### 2.4 取证结论 → 本仓映射决策

| 参考产品机制 | 本仓映射 | 决策 |
| --- | --- | --- |
| 话题内联描述富文本（`<topic>` 节点） | 话题以 `#话题名` 文本内联描述 | P0 采用文本内联（本仓 RichTextProcessor 已解析该模式）；`<topic>` 富文本节点+高亮卡片列 P1 |
| 话题添加后描述框立即可见 | 标签/话题框添加 → 立即追加到描述尾部 | P0 核心交互 |
| 发布时按平台隐性转换格式 | 引擎 TAG_STYLES + 各适配器 compose | P0 核心机制（微博 `#话题#`、视频号 `#话题#` 转换） |
| 独立字段平台剥离话题（B站 tag/知乎 topics） | 从描述剥离 `#话题` 进独立字段 | P0（避免描述+字段双份重复） |
| 发布前查平台话题搜索接口验证实体 | — | **P2 out of scope**（本仓 P0 话题为纯文本，不查平台实体；见 §8 roadmap） |
| 话题上限 10（小红书） | 沿用各平台注册表限制 | P0 校验沿用现有 contentMax 口径 |

---

## 三、方案设计

### 3.1 核心原则

1. **描述文本是话题的唯一真源**（对齐参考产品模型）：发布时从描述解析话题，标签/话题输入框降级为「快速添加入口」。
2. **所见即所得**：添加话题后立即出现在描述框，用户可直接编辑（改字、删除、调位置）。
3. **发布时隐性转换**：平台格式差异（单/双井号、独立字段剥离）全部在引擎层完成，用户无感知。
4. **单向同步 + 描述优先**：话题框 → 描述是同步追加/移除；描述里手动改动不反向回写话题框，发布时以描述解析为准。

### 3.2 数据流（改造后）

```
UI 层（Publish.vue / useBatchPublish）：
  话题框/标签框添加话题 X
    → 去重检查（描述已有 #X 词边界匹配则跳过）
    → 描述尾部追加 "#X"（空格分隔，追加在末尾话题区）
  话题框删除话题 X
    → 描述中移除对应 "#X" 片段
  用户在描述框手动编辑话题 → 不回写话题框；发布时以描述为准
  TagSuggester apply-tag / 热门话题跳转 → 同样经追加管道进描述

发布链：
  article.content（含内联 #话题）+ article.tags/topics（输入辅助，兼容旧草稿）
    → buildArticleData 原样传（现有 mergeUniqueStrings 去重逻辑天然兼容）
  主进程 publisher-router：
    RichTextProcessor 解析描述 → topics 结构化（已有）
    tags = base.tags + 描述解析话题 + override.topics（已有三合一去重）
  引擎各平台（见 §3.3 格式矩阵）：
    内联型：话题保留在描述（格式按平台转换）
    独立字段型：话题从描述剥离 → 平台独立字段
```

### 3.3 平台格式转换矩阵（发布时隐性转换，P0 全量）

| 平台 | 描述里 `#话题` 的处理 | 转换后形态 | 实现位置 |
| --- | --- | --- | --- |
| 抖音 | **保留内联** | `content_desc` 含 `#话题` + `text_extra` 标记 hashtag 位置段 | `douyin-video.js` buildDouyinPostData（**修复丢弃**） |
| 快手 | 保留内联 | caption = 标题+正文（含 `#话题`） | 已有 ✅（验证+契约锁定） |
| 视频号 | 保留内联，`#话题` → `#话题#` | description = 标题+正文（含 `#话题#`） | `shipinhao-video.js`（**修复丢弃**+格式转换） |
| 微博 | 保留内联，`#话题` → `#话题#` | 正文含 `#话题#` | TAG_STYLES 转换 |
| 小红书 | 保留内联 | 描述含 `#话题` | TAG_STYLES `#tag` |
| TikTok / Twitter / Instagram | 保留内联 | caption 含 `#话题`（海外 hashtag 内联惯例） | 适配器 compose |
| YouTube | 保留内联 + tags 字段并存 | 描述含 `#话题`；tags 字段为无 # 前缀关键词 | 适配器（描述内联为新增） |
| **B站** | **剥离** → tag 字段 | desc 不含 `#话题`；`tag: 话题名,话题名` | `bilibili-video.js`（剥离新增） |
| **知乎** | **剥离** → topics API | 描述不含 `#话题`；topics 独立提交 | zhihu 适配器（剥离新增） |
| **头条** | **剥离** → tags 字段 | 描述不含 `#话题` | toutiao 适配器（剥离新增） |
| 百家号 | 剥离 → 话题独立提交 | 描述不含 `#话题` | baijiahao 适配器（剥离新增） |
| 公众号 | 剥离 → 标签字段 | 描述不含 `#话题` | wechat_mp 适配器（剥离新增） |

**剥离规则**：从描述文本中移除所有 `#话题名` 片段（含前后分隔空白归一化），移除后描述首尾空白清理；剥离出的话题名进平台独立字段（去 # 前缀）。剥离与格式转换在引擎 `content-formatter.js` 统一实现（新增 `stripTopicsFromContent(platform, content)` 与 `convertInlineTopics(platform, content)`），各适配器调用，禁止每适配器自抄一份。

### 3.4 抖音 text_extra 位置标记（P0 简化实现）

抖音 `create_v2` 的 `text_extra` 数组标记描述中 hashtag 的位置段：

```js
{ start: <字节偏移>, end: <结束偏移>, type: 0, user_id: "", hashtag_id: 0, hashtag_name: "话题名" }
```

P0 口径：`hashtag_id: 0`（纯文本话题，不查平台话题实体——对齐 §2.4 决策，平台实体查询列 P2）；`start/end` 按 `content_desc` 中 `#话题名` 的实际偏移计算。无话题时 `text_extra: []`（与现状一致）。

### 3.5 UI 交互逻辑（Publish.vue 视频分支 + 图文分支 + 批量模式）

**添加管道**（三入口统一）：
1. 话题框/标签框输入（逗号分隔或回车确认）
2. TagSuggester「应用标签」按钮
3. 热门话题页跳转（`query.topics`）

统一走 `appendTopicsToContent(names)`：
- 逐个检查去重：描述中已有 `#话题名`（词边界匹配，`#话题名` 后非话题名字符）则跳过
- 追加位置：描述末尾；若描述非空且末尾无换行，先补一个空格分隔；多个话题以空格相连：`正文内容 #话题1 #话题2 #话题3`
- 描述为空时：话题成为描述唯一初始内容

**移除管道**：话题框删除话题 X → `removeTopicFromContent(X)`：从描述移除 `#X` 片段及其后随的一个分隔空白；描述里不存在则无操作（用户可能已手动删）。

**不回写**：用户在描述框手动增删改话题 → 话题框显示值不变（发布时以描述解析为准，主进程 mergeUniqueStrings 已保证去重，不会双份）。

**输入框语义标注**（locales 成对新增）：
- 话题框 placeholder 调整为「添加后自动带入描述，多个用逗号分隔」
- 标签框 placeholder 同口径
- 描述框上方提示（仅首次添加话题时出现一次的 hint）：「话题已带入描述，可直接编辑」

**Markdown 模式安全性**：`#话题名` 无空格跟随，不构成 Markdown ATX 标题语法（标题要求 `# ` 空格），追加安全。

### 3.6 兼容性边界（既有功能不破坏）

| 既有功能 | 兼容策略 |
| --- | --- |
| 草稿（usePublishDrafts） | 草稿 content 已含话题 → 恢复时话题框保持草稿原值；发布时描述解析去重，不双份 |
| 批量模式（useBatchPublish） | 每篇文章的 tagsText/topicsText 同样走追加管道进各自 content |
| 热门话题跳转（query.topics） | 跳转后经追加管道进描述（现有 `article.topics` 赋值保留） |
| 平台差异化 override（zhihu topics） | override.topics 独立生效（主进程三合一已有）；知乎发布时 override 话题剥离进 topics API |
| DOM RPA 链 | RPA 填描述时描述已含 `#话题`（渲染层已内联），RPA tag_input 填充逻辑保留（平台页独立标签框仍工作） |

---

## 四、显示项与提示文字（locales zh/en 成对）

| 位置 | 文案（zh） | 说明 |
| --- | --- | --- |
| 话题框 placeholder | `添加后自动带入描述，多个用逗号分隔` | 替换现有「多个话题用逗号分隔」 |
| 标签框 placeholder | `添加后自动带入描述，多个用逗号分隔` | 同口径 |
| 描述框 hint（首次添加话题后显示一次） | `话题已带入描述，可直接编辑` | 可关闭 |
| 话题框 label 徽标 | 沿用 fieldSupportText（N/15 平台） | 不变 |

---

## 五、数据校验

1. **去重校验**：追加管道词边界匹配，`#AI` 不误匹配 `#人工智能`（话题名完整匹配后才算重复）。
2. **话题名合法性**：沿用 `normalizePublishStringList`（去空白、去重、剔空）；话题名含 `#` 时剥离（避免嵌套井号）。
3. **长度校验**：追加后描述长度超平台 contentMax 时，发布链现有截断逻辑生效（话题在尾部，截断优先牺牲话题——与参考产品占位符机制的行为差异在 PRD 明示：参考产品先提取话题再截断再还原，本仓 P0 话题随描述一起截断，P1 评估占位符机制）。
4. **剥离完整性**：独立字段型平台剥离后描述中不存在残留 `#` 片段（契约测试断言）。

---

## 六、测试验收

### 6.1 单元测试（渲染层）

- 追加管道：空描述/非空描述/多话题连续追加/去重（词边界）/话题名含井号
- 移除管道：存在/不存在/移除后空白归一
- 三入口统一：话题框、TagSuggester、热门话题跳转
- 批量模式同口径
- Markdown 模式追加不产生标题语法

### 6.2 引擎契约测试（跨包）

- 格式矩阵全量断言：15 平台 ×（内联保留/格式转换/剥离独立字段）三态
- 抖音：content_desc 含 `#话题` + text_extra 偏移正确（含中文多字节偏移口径）+ 无话题时 text_extra 空
- 视频号：description 含 `#话题#`（双井号转换）
- B站/知乎/头条/百家号/公众号：描述剥离干净 + 独立字段含话题
- 反证：摘掉剥离逻辑 → 契约红；摘掉抖音 text_extra 标记 → 契约红

### 6.3 回归

- 现有发布链路测试全绿（kuaishou-video / bilibili-video / shipinhao-video / douyin-video / no-title-contract 等）
- `usePublishFlow.test.js` / `useBatchPublish.test.js` / `usePublishDrafts.test.js` 全绿
- locales Gate 7 成对检查通过

---

## 七、非功能需求

- 追加/移除管道为纯函数（`apps/desktop/src/features/publish/topic-inline.js`），可单测、可被视频/图文/批量三分支复用，禁止三分支各抄一份。
- 引擎剥离/转换统一在 `content-formatter.js`（单一实现），适配器只调用。
- 品牌红线：本文档及 change 文档不出现参考产品品牌名（Gate 12）。

---

## 八、Roadmap（本 change 之外）

- **P1**：话题高亮卡片（Quill 自定义 blot，`<topic>` 内联节点视觉化 + 描述框内话题删除交互）；截断占位符机制（先提取话题→截断→还原，对齐参考产品 `{tmp_h_N}` 方案）。
- **P2**：平台话题搜索接口接入（发布前验证话题实体、回填 id/link；微博/小红书/知乎/百家号四接口取证已备）；抖音 hashtag_id 真实实体回填。
- **P2**：@好友内联描述（`<friend>` 模型，对齐参考产品）。

---

## 九、验收标准（P0 完成的定义）

1. 发布页添加话题/标签 → 描述框立即可见 `#话题`（视频/图文/批量三分支一致）。
2. 发布到抖音的内容描述含话题 + text_extra 位置标记正确。
3. 发布到视频号的内容描述含 `#话题#`。
4. 发布到微博的内容含 `#话题#`；发布到 B站/知乎/头条/百家号/公众号的描述不含话题但独立字段含。
5. 用户手动编辑描述中的话题 → 发布以描述为准，不双份不丢失。
6. 全部既有测试回归通过 + 新增契约测试全绿。
