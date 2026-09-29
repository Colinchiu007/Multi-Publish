# Design: publish-topic-inline-description

## 1. 参考产品取证证据源（2026-10-09 用户提供逆向目录）

> 目录名含品牌词按 Gate 12 红线不入库；主进程 bundle `packages/main/dist/index.cjs`（8.4MB，ncc 打包，minified）。定位法：grep `话题`（8 处命中）→ 各平台 buildPostData 上下文。

### 1.1 数据模型证据

- L196/L204/L212/L312：`<topic>` 节点处理——`lt.textContent = \` #${ke.name}[话题]# \``，同时 `U.push({id: ke.id, name: ke.name, link: ke.link, type: "topic"})`。话题节点带 `raw` 属性（urlencoded JSON 平台话题实体）；raw 缺失时用 `text` 属性调平台话题搜索接口（`getXiaohongshuTopicList` 等）查实体，**查不到则 `removeChild` 删除节点**（fail-closed）。
- L320（视频号 API）：`O += \` #${Qe.name}[话题]#\``、`O += \` @${Qe.name}\``、`desc: O`、`hash_tag: U`、`ats: L`——描述 = 正文 + 话题 + @好友 拼接，结构化字段并行。
- L256/L262/L263（微博）：`He.textContent = \`#${ze.topic}# \``——微博双井号内联。
- L228（知乎）：话题转 `<a>` 元素 + `{topic_id, topic_name}`。
- L222（百家号）：`he.textContent = \`#${de}# \`` + `getTopicListAsync$1`（searchtopic）查 id。
- L312：小红书话题上限 10（`if(nt>=10){removeChild;continue}`）。
- L110266（抖音 DOM RPA）：发布页 `input-topic` placeholder「精准话题标签带来更多播放，最多2个，按Enter键创建」，逐个输入+回车。
- UI 层：编辑器为云端页面（`www.<品牌域名>/web`，L119612），本地渲染端 `main-DK0VFnck.js` 无话题逻辑——话题编辑交互在云端富文本编辑器，话题内联描述流。

### 1.2 模型抽象（本仓映射）

参考产品的三层数据模型：

| 层 | 参考产品 | 本仓映射 |
| --- | --- | --- |
| 编辑层 | `<topic>` 富文本节点内联描述 | `#话题名` 纯文本内联（RichTextProcessor 已解析 `#名#` 模式；P1 升级 Quill blot） |
| 验证层 | 发布前查平台话题接口回填实体 | 不做（P0 纯文本话题；P2 接入） |
| 转换层 | 各平台 buildPostData 按平台格式转换/剥离 | content-formatter 统一实现 + 适配器调用 |

## 2. 渲染层设计：追加管道（topic-inline.js）

### 2.1 纯函数契约

```js
// apps/desktop/src/features/publish/topic-inline.js
appendTopicsToContent(content, names)   // → 新 content
removeTopicFromContent(content, name)   // → 新 content
extractInlineTopics(content)            // → [{name}]（描述解析，测试/回显用）
```

- **追加**：`names` 逐个做词边界去重（描述中已有 `#名` 且 `#名` 后非名字延续字符才算重复）；新话题以空格相连追加到描述末尾；描述非空且末尾非空白时先补一个空格。产出形态：`正文内容 #话题1 #话题2`。
- **移除**：移除 `#名` 片段 + 其后随的一个分隔空白；不存在则原样返回。
- **词边界**：话题名完整匹配（`#AI` 不误匹配 `#人工智能`）；话题名内部 `#` 剥离（防嵌套）。
- **Markdown 安全**：`#话题名` 无空格跟随不构成 ATX 标题（标题要求 `# `），追加安全；单测锁定。

### 2.2 接线点（三入口统一走管道）

| 入口 | 文件 | 改动 |
| --- | --- | --- |
| 话题框/标签框 set | `Publish.vue`（视频 L444/L451、图文 L284/L291 两分支）+ `useBatchPublish.js`（L329/L397） | computed set 内追加管道同步 content |
| TagSuggester apply-tag | `Publish.vue` applySuggestedTag（L994） | tags 数组更新后同步追加 |
| 热门话题跳转 | `Publish.vue`（L1164 query.topics） | 赋值后追加 |

- 同步方向**单向**（框 → 描述）；描述手动编辑不回写框。发布时主进程 `publisher-router.js:204-208` 三合一 `mergeUniqueStrings` 已对 base.tags + 描述解析话题 + override.topics 去重——**主进程合并逻辑零改动**，天然防双份。
- 草稿兼容：草稿 content 已含话题 → 恢复后话题框保持草稿原值，发布去重；不回写管道不触发。

### 2.3 locales（zh/en 成对，Gate 7）

- `publishPage.topicsPlaceholder` / `tagsPlaceholder` →「添加后自动带入描述，多个用逗号分隔」。
- 新增 `publishPage.topicInlineHint`「话题已带入描述，可直接编辑」（首次追加后显示一次，可关闭）。

## 3. 引擎层设计：格式转换单一实现

### 3.1 content-formatter.js 新增

```js
stripTopicsFromContent(content)            // 剥离全部 #话题 片段（独立字段型平台用）
convertInlineTopics(platform, content)     // #话题 → 平台格式（内联型平台用）
```

- 剥离：正则移除 `#[^\s#]+` 片段 + 前后分隔空白归一；产出 { content, topics: [名] }。
- 转换：`#话题` → `#话题#`（weibo/tencent_video）或保持 `#话题`（其余内联型）。
- **单一实现**：适配器只调用，禁止自抄（结构锁：契约测试断言适配器源码不含本地剥离正则）。

### 3.2 平台矩阵（15 平台三态）

| 态 | 平台 | 适配器改动 |
| --- | --- | --- |
| 内联保留（`#话题`） | douyin / kuaishou / xiaohongshu / tiktok / twitter / instagram / youtube | douyin 修复（见 §3.3）；kuaishou 已有验证；其余 compose 含描述即自然生效 |
| 内联转换（`#话题#`） | weibo / tencent_video | tencent_video 修复（见 §3.4）；weibo 走 convertInlineTopics |
| 剥离进独立字段 | bilibili / zhihu / toutiao / baijiahao / wechat_mp | 各适配器 buildPostData 前调 stripTopicsFromContent，剥离话题进 tag/topics 字段 |

### 3.3 抖音 text_extra（修复丢弃）

`douyin-video.js` buildDouyinPostData：

```js
content_desc: clean(taskData.content || taskData.desc || ''),
text_extra: buildTextExtra(content_desc)  // 扫描 #话题名 片段 → [{start, end, type: 0, user_id: "", hashtag_id: 0, hashtag_name}]
```

- 偏移口径：与抖音 web 端一致按**字符偏移**（JS string index，中文按 1 计）——bundle 取证抖音走 DOM RPA 无 API 偏移证据，本仓按 web 端 `text_extra` 通行口径实现并以契约测试锁定。
- `hashtag_id: 0`（纯文本话题，P2 实体回填）。
- 无话题时 `text_extra: []`（现状兼容）。

### 3.4 视频号（修复丢弃 + 双井号）

`shipinhao-video.js` composeShipinhaoDescription：`[title, content].filter(Boolean).join('\n')` 后经 `convertInlineTopics('tencent_video', …)` 把 `#话题` 转 `#话题#`（微信系双井号，对齐参考产品视频号链 `#名[话题]#` 的双井号形态，本仓去掉 `[话题]` 标记后缀——该后缀是参考产品编辑器内部标记，非平台要求）。

## 4. 测试设计

### 4.1 渲染层（topic-inline.test.js + Publish 分支测试）

- 追加：空描述/非空/多话题/词边界去重/话题名含井号/Markdown 安全
- 移除：存在/不存在/空白归一
- 三入口接线：话题框 set、applySuggestedTag、query.topics
- 批量模式同口径；草稿恢复不触发回写

### 4.2 引擎契约（topic-inline-contract.test.js）

- 15 平台三态矩阵断言（内联保留/转换/剥离）
- 抖音 text_extra：偏移正确（中文多字节）、无话题空数组
- 剥离完整性：剥离后描述无残留 `#` 片段
- 反证双向：摘 stripTopicsFromContent 调用 → 红；摘 buildTextExtra → 红

### 4.3 回归

kuaishou-video / bilibili-video / shipinhao-video / douyin-video / no-title-contract / usePublishFlow / useBatchPublish / usePublishDrafts / locales Gate 7。

## 5. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 描述手动删话题但话题框仍有值 → 发布双份 | 主进程 mergeUniqueStrings 去重已有（描述解析与数组合并），契约测试锁定 |
| 旧草稿 content 无话题、topics 数组有值 | 发布时三合一合并后进各平台（内联型经 tags 拼接路径、独立型进字段）——与现状一致，不回归 |
| 剥离正则误伤正文合法 `#`（如代码片段 `#include`） | 剥离仅匹配 `#` 后跟 CJK/字母数字且**前后有分隔**的话题形态；代码块场景单测锁定（`#include` 不剥离——后随小写字母且无空格分隔的场景按白名单话题字符集判定） |
| 抖音 text_extra 偏移口径与平台实际不符 | 契约测试锁定字符偏移口径 + 真机发布验证任务（tasks 6.3）；发现不符以真机证据修正 |
