# PRD：发布能力注册表（publish-capability-registry）— 通用/差异化内容单一真源 + 无标题平台标题入描述首行

> **立项日期**: 2026-10-08
> **关联 change**: [openspec/changes/publish-capability-registry](../openspec/changes/publish-capability-registry/)
> **状态**: 已实现并合并（PR #2576，squash d1b15074，8/8 CI 门禁全绿）
> **决策确认**: 用户 2026-10-08 grilling 轮确认 5 项关键决策（机制=声明式注册表、无标题清单=6 平台、修复范围=全链路、UI=通用区+差异化区、信息深度=全量收录）
> **本文档为深化版**（2026-10-08 二轮）：按「数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字」六维度逐项展开至可执行粒度。

---

## 一、背景与问题

### 1.1 四处硬编码且互相矛盾的平台元数据

| 数据源 | 位置 | 矛盾实例 |
| --- | --- | --- |
| 渲染层内容限制 | `apps/desktop/src/features/publish/publish-contract.js`（旧 PLATFORM_CONTENT_LIMITS） | douyin contentMax=0（不校验）vs platforms.yaml 1000；tiktok titleMax=2200 vs yaml 150 |
| 主进程平台配置 | `config/platforms.yaml` max_title/max_content | tencent_video/kuaishou 无渲染层条目时回落默认 5000，与 yaml 1000 漂移 |
| 差异化 UI | `PlatformOverridePanel.vue` 8 个平台硬编码 `v-if platform.id === 'xxx'` | 新增平台必须改组件代码；字段无元数据 |
| 引擎侧截断 | `api-publish-engine/src/content-formatter.js` | 第三份限制表（weibo title 120 vs 渲染层 0） |

### 1.2 无标题平台标题丢弃 Bug（用户直接需求）

- 视频号 API 链 `shipinhao-video.js`：`description: String(td.content == null ? td.title : td.content)` —— **填了正文时标题被直接丢弃**。
- Twitter 适配器：`text: taskData.content || taskData.title` —— 同款。
- DOM RPA 链靠「title_input 选择器解析失败」的**隐式回退**把标题合并进编辑器（`_composeEditorCaption`），行为正确但不可声明、不可测，且每个无标题平台白等首次候选 10s 超时。

### 1.3 参考产品 4.13.19 逆向取证（2026-10-08 用户指定参考）

用户指定参考参考产品逆向代码（本机逆向工程目录，目录名含品牌词按 Gate 12 红线不入库，主进程 bundle `packages/main/dist/index.cjs` 8.4MB）核对漏项。从 bundle 提取各平台 `buildPostData` 证据后，能力矩阵显著扩充（详见 §2.3 与 design.md §1.5）：可见性实际 5 平台共有（抖音/快手/微博也有）、位置 3 平台、商品 4 平台、合集 5 平台、平台活动 3 平台，另有大量平台独有选项（B站弹幕开关、百家号三图封面/副标题/自荐、知乎目录/赞赏、微博投票、快手禁止同城/同框/小程序、视频号挂链接、抖音合作投稿/横版封面/章节/同步头条）。

---

## 二、能力矩阵（注册表全量内容）

### 2.1 平台元数据（15 平台全覆盖）

| 平台 | titleMode | titleMax | titleMaxBytes | contentMax | 处理说明 |
| --- | --- | --- | --- | --- | --- |
| 微信公众号 | title | 64 | — | 20000 | 三源一致 |
| 知乎 | title | 50 | — | 100000 | 渲染层值（yaml 5000 更严但从未强制） |
| 微博 | **caption** | 0 | — | 2000 | 无标题：标题合并入正文首行 |
| 抖音 | title | 55 | — | 1000 | **修**：旧渲染层 0（不校验）→ 1000（yaml+引擎一致） |
| 小红书 | title | 20 | — | 1000 | 一致 |
| 视频号 | **caption** | 0 | — | 1000 | **补**：旧表缺条目回落默认 5000 → 1000（yaml） |
| 快手 | **caption** | 0 | — | 1000 | **补**：同上 |
| 今日头条 | title | 30 | — | 100000 | 渲染层值 |
| 哔哩哔哩 | title | 80 | — | 2000 | 渲染层值（yaml 3000 未强制） |
| 百家号 | title | — | 149 | 100000 | 标题按 UTF-8 字节数校验（实测 50 中文=150 字节被拒） |
| YouTube | title | 100 | — | 5000 | 一致 |
| TikTok | **caption** | 0 | — | 2200 | **修**：旧表 title 2200/content 0 → caption 语义 content 2200 |
| X/Twitter | **caption** | 0 | — | 280 | 一致 |
| Instagram | **caption** | 0 | — | 2200 | 一致 |
| Facebook | title | 100 | — | 63206 | **补**：旧表缺条目 → yaml 真实值（Facebook 帖文上限） |

**无标题平台清单（titleMode=caption，共 6 个，用户确认）**：视频号、快手、微博、X/Twitter、Instagram、TikTok。
证据：视频号 API `post_create` 请求体只有 description；快手 live DOM 取证无独立标题框（d4-1-kuaishou.json）；微博/X/Instagram/TikTok DOM 选择器只有正文/caption 输入、渲染层 titleMax=0。

### 2.2 通用主表单字段（单值共享，全部 implemented）

| 字段 | 语义 | 支持平台数 | 说明 |
| --- | --- | --- | --- |
| 标题 title | title | 15/15 | 无标题平台走「合并入描述首行」口径（仍是通用字段） |
| 正文/描述 content | content | 15/15 | |
| 标签 tags | tags | 11/15 | 引擎 TAG_STYLES 分平台转换（#tag / #tag# / plain） |
| 话题 topics | topics | 4/15 | 知乎/微博/快手/B站 |
| 提及(@) mentions | mentions | 4/15 | 微博/X/Instagram/Facebook |
| 封面 cover | cover | 10/15 | 视频号封面由视频抽帧；抖音另有横版封面（platform-capable） |
| 视频文件 video | video | 12/15 | |
| 图片 images | images | 8/15 | 微博单帖上限 18 张（参考产品取证） |
| 定时发布 schedule | schedule | 15/15 | 平台原生定时：抖音 timing、快手 publishTime、B站 dtime；其余走本仓队列 |
| AI 生成内容声明 aiGenerated | ai-declaration | 3/15 | 快手/B站/百家号（DOM ai_declaration 选择器） |

### 2.3 差异化字段（按平台，含 platform-capable 参考产品取证项）

**分类规则（用户确认）**：按语义能力跨平台计数——≥3 平台 → 通用（common）；=2 → 半共有（semiCommon）；=1 → 独有（unique）。分类是计算属性（`classifyPublishFields()`），新增平台/字段自动生效。

| 语义 | 分类 | 平台（status） | UI 暴露 |
| --- | --- | --- | --- |
| collection 合集 | **common (5)** | B站/YouTube/百家号（implemented）+ 快手/视频号（platform-capable） | B站/YouTube/百家号 |
| visibility 可见性 | **common (5)** | YouTube/TikTok（implemented）+ 抖音/快手/微博（platform-capable） | YouTube/TikTok |
| location 位置 | **common (3)** | 百家号（implemented）+ 快手/视频号（platform-capable） | 百家号 |
| goods 商品 | **common (4)** | 抖音/小红书（implemented）+ 快手/视频号（platform-capable） | 无 |
| activity 平台活动 | **common (3)** | 抖音/快手/视频号（全部 platform-capable） | 无 |
| comment-control 评论控制 | **common (3)** | 公众号/知乎（implemented）+ B站（platform-capable） | 公众号/知乎 |
| draft 存草稿 | **common (5)** | 知乎/抖音（implemented UI）+ B站/视频号/公众号（implemented 链路级） | 知乎/抖音 |
| ai-declaration AI 声明 | **common (3)** | 快手/B站/百家号（implemented，主表单字段） | 主表单 |
| download 下载权限 | semiCommon (2) | 抖音/快手（platform-capable） | 无 |
| music 配乐 | semiCommon (2) | 抖音/视频号（platform-capable） | 无 |
| category 分类/分区 | semiCommon (2) | B站/YouTube（implemented） | B站/YouTube |
| originality 原创/版权声明 | semiCommon (2) | B站版权/百家号原创（implemented） | B站/百家号 |
| digest 摘要 | unique (1) | 公众号（implemented） | 公众号 |
| mass-send 群发 | unique (1) | 公众号（implemented） | 公众号 |
| creation-declaration 创作声明 | unique (1) | 知乎（implemented）+ 快手（platform-capable） | 知乎 |
| platform-task 任务/热点 | unique (1) | 抖音（implemented，UI 未暴露） | 无 |
| cooperation 合作投稿 | unique (1) | 抖音（platform-capable） | 无 |
| horizontal-cover 横版封面 | unique (1) | 抖音（platform-capable） | 无 |
| chapter 章节 | unique (1) | 抖音（platform-capable） | 无 |
| sync-cross-post 同步到头条 | unique (1) | 抖音（platform-capable） | 无 |
| danmu-control 弹幕开关 | unique (1) | B站（platform-capable） | 无 |
| selection-reply 精选评论 | unique (1) | B站（platform-capable） | 无 |
| subtitle-caption 字幕开关 | unique (1) | B站（platform-capable） | 无 |
| cover-layout 封面布局（单图/三图） | unique (1) | 百家号（platform-capable） | 无 |
| subtitle 副标题 | unique (1) | 百家号（platform-capable） | 无 |
| fans-attention 粉丝关注引导 | unique (1) | 百家号（platform-capable） | 无 |
| self-recommend 自荐 | unique (1) | 百家号（platform-capable） | 无 |
| reprint-info 转载声明 | unique (1) | 百家号（platform-capable） | 无 |
| table-of-contents 目录 | unique (1) | 知乎（platform-capable） | 无 |
| appreciate 赞赏 | unique (1) | 知乎（platform-capable） | 无 |
| vote 投票 | unique (1) | 微博（platform-capable） | 无 |
| mblog-statement 微博声明 | unique (1) | 微博（platform-capable） | 无 |
| disable-nearby 禁止同城展示 | unique (1) | 快手（platform-capable） | 无 |
| same-frame 允许同框 | unique (1) | 快手（platform-capable） | 无 |
| mini-app 小程序 | unique (1) | 快手（platform-capable） | 无 |
| link-attach 挂链接 | unique (1) | 视频号（platform-capable） | 无 |

**status 语义**：`implemented` = 本仓代码当前真实消费该字段；`platform-capable` = 平台 API 支持但本仓未暴露（证据：参考产品 4.13.19 bundle 取证，注册表 note 字段记录证据出处）。platform-capable 字段必须带 note（注册表结构自检强制）。

---

## 三、数据模型（注册表）

### 3.1 文件与双版本

- **数据单一来源**：`packages/shared-utils/src/publish-capabilities.json`（版本号 version: 2）
- **CJS 版**（主进程/Node/vitest）：`packages/shared-utils/src/publish-capabilities.js`
- **ESM 版**（渲染进程，Vite alias）：`packages/shared-utils/src/publish-capabilities.browser.js`
- 两版本读同一份 JSON，函数层逐字对齐；导出同名同构由 parity 测试锁定（先例：platform-definitions / account-name-guard 孪生模式）
- Vite alias：`@multi-publish/shared-utils/src/publish-capabilities` → `.browser.js`（apps/desktop/vite.config.js）
- 解析路径：渲染进程（浏览器构建）走 alias → ESM；vitest（渲染层测试）经 node_modules 解析 CJS 版；主进程/引擎测试直接 require CJS

### 3.2 JSON Schema（关键字段）

```jsonc
{
  "version": 2,
  "platforms": {
    "<platformId>": {
      "titleMode": "title | caption",       // caption = 无标题平台
      "limits": { "titleMax": 64, "titleMaxBytes": 149, "contentMax": 20000 }
    }
  },
  "commonFormFields": [
    { "key": "title", "semantic": "title", "label": "标题",
      "platforms": ["..."], "noTitleBehavior": "caption-first-line", "note": "..." }
  ],
  "overrideFields": {
    "<platformId>": [
      { "key": "digest", "semantic": "digest",
        "status": "implemented | platform-capable",
        "type": "text | textarea | select | checkbox | tags | collection | object | object-list | image",
        "label": "摘要", "maxLen": 120, "default": "", "uiExposed": true,
        "placeholder": "...", "hint": "...", "options": [{ "value": 0, "label": "无申明" }],
        "note": "platform-capable 必填：证据出处" }
    ]
  }
}
```

### 3.3 API（CJS 与 ESM 同名导出）

| 导出 | 说明 |
| --- | --- |
| `PLATFORM_PUBLISH_META` | 冻结的 15 平台元数据（titleMode + limits） |
| `NO_TITLE_PLATFORMS` | 冻结的无标题平台清单 |
| `getPlatformPublishMeta(id)` | 元数据副本；未知平台返回 null |
| `isNoTitlePlatform(id)` | 无标题判定（titleMode === 'caption'） |
| `getNoTitlePlatforms()` | 无标题清单副本 |
| `getPlatformContentLimit(id)` | 限制副本；未知平台回落 {titleMax:100, contentMax:5000} |
| `getPlatformOverrideFields(id, {uiOnly})` | 差异化字段副本；uiOnly=true 只返回可渲染字段（uiExposed && implemented） |
| `getCommonFormFields()` | 通用主表单字段支持矩阵 |
| `getFieldSupport(semantic)` | `{count, platforms, statuses}`（按唯一平台数计数） |
| `classifyPublishFields()` | `{common, semiCommon, unique}`（计算属性，按 count 降序） |
| `composeNoTitleDescription(title, content, {maxLen})` | 标题首行 + 正文，超长按 maxLen 截断（标题优先存活，按码点截断不切代理对） |
| `validateRegistry()` | 结构自检（见 §4.5） |

---

## 四、数据校验（深化）

### 4.1 校验调用点与执行顺序（发布前）

```
handlePublish（usePublishFlow）
  ① validatePublishTargets        → 每个目标必须有平台+账号（「请为{平台}选择至少一个账号」）
  ② validatePublishMetadata       → tags/topics/mentions/images/cover 形状（可结构化克隆）
  ③ validatePlatformContent       → 平台内容限制（本 PRD §4.2/§4.3 的核心）
       └ 失败且为百家号标题超限 → 自动按字节截断 → 重新校验（唯一自动修复路径，§4.4）
  ④ sensitiveCheck（可选）        → 敏感词预检，命中弹确认
  ⑤ buildArticleData              → 组装 IPC payload（platformOverrides 归一化）
  ⑥ validateScheduleEntries       → 定时时间有效性（过去时间/超 30 天/同账号 5 分钟间隔）
  ⑦ IPC publish:batch → publisher-router → resolvePlatformArticle（主进程二次归一）
```

### 4.2 有标题平台（9 个）校验规则

逐字段校验，超限即阻断（notifyWarning 展示消息）：

| 校验项 | 规则 | 消息模板（zh） |
| --- | --- | --- |
| 标题长度 | `Array.from(title).length > titleMax` | `{平台}标题最多 {N} 个字符，当前 {M} 个` |
| 百家号标题字节 | `utf8ByteLength(title) > 149` | `百家号标题最多 149 字节，当前 {M} 字节` |
| 正文长度 | `Array.from(content).length > contentMax` | `{平台}正文最多 {N} 个字符，当前 {M} 个` |

- 差异化覆盖内容优先：`override.title || article.title`、`override.content || article.content`（为该平台单独设置的覆盖值参与校验）
- 字节口径说明：百家号后端按 `Math.floor(utf8Bytes/3) > 49` 拒绝（utf8Bytes ≥ 150 拒），安全上限 149 字节；实测 50 中文（150 字节）被拒、49 中文+1 英文（148 字节）成功

### 4.3 无标题平台（6 个）合并校验规则

标题不再单独校验（无独立标题字段）；校验「标题 + 换行 + 正文」合并长度：

| 校验项 | 规则 | 消息模板（zh） |
| --- | --- | --- |
| 合并长度 | `Array.from([title, content].filter(Boolean).join('\n')).length > contentMax` | `{平台}正文最多 {N} 个字符（标题计入首行），当前 {M} 个` |

**边界用例矩阵**（publish-contract.test.js 钉死）：

| 场景 | 输入 | 期望 |
| --- | --- | --- |
| 仅标题 | title='只有标题', content='' | 通过（发布链路把标题作为描述全文） |
| 仅正文 | title='', content=正文×300（视频号 1000 限内） | 通过 |
| 两者皆空 | title='', content='' | 通过（必填校验在更上层：视频模式要求视频、图文模式要求正文） |
| 恰好边界 | twitter: title='标题'(2字) + content='x'×277 → 合并 280 | 通过 |
| 超限 | twitter: title='标题' + content='x'×281 → 合并 284 | 拒绝，field=content, limit=280, actual=284 |
| 覆盖内容同口径 | tiktok override: title='覆盖标题' + content='c'×2200 → 合并 2205 | 拒绝（差异化覆盖同样按合并口径） |
| 有标题平台不合并 | xiaohongshu: title 21 字 > 20 | 拒绝，field=title（不合并进正文口径） |

### 4.4 百家号标题自动截断流（唯一自动修复路径）

一键发布/历史视频预填场景：百家号标题按字节超限时，自动 `truncateByUtf8Bytes(title, 149)` 后继续（不阻断自动一站式流程）；其他平台/字段超限仍提示阻断。截断来源选择：差异化面板为百家号设置了覆盖标题 → 截断覆盖标题；否则截断全局标题。截断后**重新全量校验**（可能仍超 xiaohongshu(20字)/toutiao(30字) 等更严平台上限）。进度条追加 warning 提示（locale key `publishPage.publishFlow.baijiahaoTitleTruncated`）。

### 4.5 注册表结构自检（validateRegistry，启动/测试期 fail-fast）

| 规则 | 违规消息示例 |
| --- | --- |
| titleMode ∈ {title, caption} | `{platform}: 非法 titleMode {value}` |
| contentMax 为正数 | `{platform}: contentMax 必须为正数` |
| status ∈ {implemented, platform-capable} | `{platform}.{key}: 非法 status {value}` |
| platform-capable 必带 note 证据 | `{platform}.{key}: platform-capable 字段必须带 note 证据` |
| overrideFields 平台引用闭合 | `overrideFields 含未知平台 {id}` |
| commonFormFields 平台引用闭合 | `commonFormFields.{key}: 未知平台 {id}` |

### 4.6 跨包契约锁（api-publish-engine/test/no-title-contract.test.js）

- **A 清单锁**：注册表无标题清单精确等于 6 平台（`['instagram','kuaishou','tencent_video','tiktok','twitter','weibo']` 排序比较）——从清单移除任一平台即红。
- **B 行为锁**：清单内每个具备引擎路径的平台实际执行标题合并——
  - tencent_video：`buildShipinhaoPostData({title:'T',content:'C'})` → `description === 'T\nC'`（行为级断言 + 旧缺陷形态回归：`description !== 'C'`）
  - kuaishou：`buildKuaishouPostData` → `caption === 'T\nC\n#话题'`（行为级）
  - weibo：`new WeiboAdapter().buildPostData` → `content === 'T\nC'`（行为级）
  - twitter/tiktok：源码结构锁（execute 需网络/OAuth 无法单测直跑——含「无标题平台」声明 + `join("\n")` 合并 + 旧 `content || title` 形态已移除）
- **C 反向锁**：有标题平台（bilibili）`buildBilibiliPostData` → `title === 'T'`、`desc === 'C'`、desc 不含标题。
- 引擎侧 require 注册表属**测试依赖**（逐级上溯定位锚点，找不到即抛错），不构成运行时依赖（引擎零依赖约束不变）。

---

## 五、流程（深化）

### 5.1 视频模式发布流（activeMode === 'video'）

```
用户操作流：
选视频文件（el-upload limit=1，重选替换需经 videoUploadRef clearFiles+handleStart）
  → 填标题（publish-title；选中无标题平台时下方显示 no-title-hint）
  → 填视频描述（publish-desc，即 article.content）
  → 封面（四来源：本地上传 coverFileList / 视频抽帧 handleExtractVideoCover /
          AI 生成 showAiCoverDialog / 裁剪 openCoverCrop；另有 cover_url 直填）
  → 标签/话题/提及（三输入，逗号/顿号分隔自动归一化去重）
  → 定时发布（datetime-local，留空=立即）
  → AI 生成内容声明（默认勾选）
  → 展开差异化面板（showDiffPanel）→ 按已选平台设置覆盖标题/正文与平台特有字段
  → 右栏选择发布平台与账号（PublishTargetSelector）
  → 点击一键发布（publish-submit）
```

```
数据流（发布点击后）：
handlePublish → §4.1 校验序列 → buildArticleData（article + platformOverrides 归一化）
  → IPC publish:batch → publisher-router.buildPublishArticle(task, platform)
      ├─ resolvePlatformArticle：override.title/content + 平台特有字段（category/copyright/privacy/...）
      ├─ RichTextProcessor：正文富文本处理（#话题#/@提及/图片提取进 tags/mentions/images）
      └─ 分流：
          ├─ ApiPublisher（api-only / api-then-dom 平台）
          │    → publishViaApi(platform, taskData, cookie)
          │      ├─ tencent_video → ShipinhaoAdapter → buildShipinhaoPostData
          │      │    description = composeShipinhaoDescription(title, content) ← 标题首行
          │      ├─ kuaishou → buildKuaishouPostData：caption = [title, content, tags].join('\n')
          │      ├─ weibo → buildPostData：content = 标题首行合并
          │      ├─ twitter → execute：text = 标题首行合并
          │      └─ tiktok → execute：post_info.description = 标题首行合并
          └─ RpaVmPublisher（dom-only 平台 / API 失败降级）
               → rpaViewManager.publish(platform, article, authData, timeout)
                 → _publish_generic：
                     无标题平台（isNoTitlePlatform）→ 跳过 title_input 解析（省 10s）
                     → captionSel 编辑器合并（_composeEditorCaption：
                        [title, content].join('\n\n')，按平台 max_content 截断，标题优先存活）
                     → 有标题平台：title_input 逐候选解析 → 标题进标题框、正文进编辑器
```

### 5.2 图文模式发布流（activeMode === 'article'）

与视频模式的差异点：
- 标题区带模板选择（TemplatePicker）与 AI 写作面板（AiWriterPanel）入口
- 多「作者」字段（author，公众号 RPA author_input 消费，全平台透传）
- 正文用富文本编辑器（ArticleEditor，Quill）
- 图片多选（el-upload limit=9）
- 选中含视频平台（hasVideoPlatforms）时显示可选视频上传区
- 其余（封面/标签/话题/提及/定时/AI 声明/差异化/校验/分流）与视频模式同口径

### 5.3 无标题平台各链路处理点汇总

| 链路 | 处理点 | 合并公式 |
| --- | --- | --- |
| 视频号 API | `shipinhao-video.js` composeShipinhaoDescription | `[title, content].join('\n')` |
| 快手 API | `kuaishou-video.js` buildKuaishouPostData | `[title, content, tags].join('\n')` |
| 微博 API | `adapters/weibo.js` buildPostData | content = `[title, content].join('\n')` |
| X API | `adapters/twitter.js` execute | text = `[title, content].join('\n')` |
| TikTok API | `adapters/tiktok.js` execute | description = `[title, content].join('\n')` |
| DOM RPA（全部 6 个） | `rpa-view-platforms.js` _publish_generic | `[title, content].join('\n\n')`，按 max_content 截断 |
| 渲染层校验 | `publish-contract.js` validatePlatformContent | 合并长度对 contentMax |

有标题平台（9 个）在所有链路均**不合并**（契约锁 C 反向钉死 bilibili）。

### 5.4 草稿保存/加载流（platformOverrides 往返）

```
保存：saveDraft → usePublishDrafts
  → payload { article 字段, platforms, platformOverrides: toPlainJson(diffEdits) }
  → IPC 落盘（JSON 序列化，diffEdits 是 reactive 需脱壳）
加载：loadDraft → applyDraft
  → replaceRecord(article, draft.*) + replaceRecord(platformOverrides, draft.platformOverrides)
  → 差异化面板按注册表字段定义恢复渲染（defaultOverride 兜底缺失键）
```

### 5.5 定时发布流

article.publishTime 非空 → validateScheduleEntries（未来时间/≤30 天/同 platform+accountId 间隔 ≥5 分钟）→ 走 scheduled-publish 队列（持久化，重启恢复）而非立即发布。平台原生定时（抖音 timing/快手 publishTime/B站 dtime）由引擎链消费 taskData 透传值。

### 5.6 批量模式流（batchMode）

每篇文章独立编辑（标题/正文/标签/话题/提及/平台多选/账号/定时），提交时逐篇走与单篇相同的校验与 buildPublishTargets 展开（同平台多账号 = 多任务）。批量进度含成功/失败计数与失败重试。批量表单暂未接入支持度徽标与无标题提示（单篇两分支已覆盖，见 §十二 残余限制）。

---

## 六、功能逻辑（深化）

### 6.1 通用字段功能逻辑

| 字段 | 功能逻辑 |
| --- | --- |
| title | 单值共享；无标题平台经 noTitleBehavior='caption-first-line' 合并入描述首行；有标题平台各自限长校验；百家号字节口径 + 自动截断 |
| content | 单值共享；RichTextProcessor 提取 #话题#/@提及/图片进对应结构；无标题平台参与合并口径 |
| tags | 输入按 `[\n,，、]` 拆分 → trim → 去重（normalizePublishStringList）；引擎按平台 TAG_STYLES 转换（#tag/#tag#/plain） |
| topics | 同 tags 归一化；知乎覆盖字段单独拆分（逗号分隔） |
| mentions | 归一化为 `{name, text: '@name'}` 结构（normalizePublishMentions），兼容旧字符串/{name} 对象形态 |
| cover | 三来源合一：cover_file（上传）> cover_path > cover_url；视频号由视频抽帧（无独立上传链） |
| video | el-upload limit=1；重选替换必须经 videoUploadRef（否则静默丢弃）；视频任务 RPA 超时放宽至 30 分钟 |
| images | el-upload limit=9 多选；路径经 getPathForFile 解析；去重按 path |
| schedule | datetime-local；空=立即；校验见 §5.5 |
| aiGenerated | 默认 true（AI 生成内容如实声明）；仅显式 false 取消；快手/B站/百家号 DOM 链消费 ai_declaration 选择器 |

### 6.2 差异化字段六类控件的功能逻辑（PlatformOverridePanel）

| 类型 | 渲染 | 归一化规则（normalizeValue） |
| --- | --- | --- |
| checkbox | 复选框 | `Boolean(value)` |
| select | 下拉（options 来自注册表） | 匹配选项 `String(option.value) === String(input)` → 返回 option.value **保留原始类型**（知乎声明 number、YouTube 分类 string）；无匹配回落 field.default |
| tags | 逗号分隔输入 | 按 `[,，]` 拆分 → trim → 去重 → 数组 |
| collection | 拉取按钮 + 下拉（拉取结果）+ 手输框 | 形状规则在组件 COLLECTION_NORMALIZERS：B站 collectionId 纯数字转 Number；百家号 collectionIdText 保持 'ID' 或 'ID:名称' 文本（≤100 字符） |
| text / textarea | 输入框/多行（maxLen 截断） | `String(value)`，maxLen > 0 时 slice |

- `defaultOverride(platformId)` = `{title:'', content:''}` + 注册表字段 default（数组 default 拷贝）
- `getValue`：modelValue 当前值 > defaultOverride 兜底 > `''`
- `updateField`：clone model → `{...defaultOverride, ...current, [key]: normalized}` → emit 不可变更新
- testid 约定：`override-{kebabCase(key)}-{platformId}`（如 `override-privacy-level-tiktok`）

### 6.3 语义分类计算逻辑

`classifyPublishFields()` 聚合 commonFormFields + overrideFields 的全部语义 → 每语义唯一平台集 → count：≥3 common / =2 semiCommon / =1 unique；条目携带 `{semantic, label, count, platforms, statuses}`；按 count 降序。`getFieldSupport(semantic)` 同口径（唯一平台计数，同一语义在通用矩阵与该平台覆盖字段重复出现时去重）。

---

## 七、交互逻辑（深化）

### 7.1 通用字段区（视频/图文两分支同口径）

| 交互点 | 行为 |
| --- | --- |
| 支持度徽标 | 每个通用字段标签旁 `field-support-badge`（action-blue 10% 底色圆角小标签），文本 `{count}/{total} 平台支持`；分母 = 注册表平台总数（15，与能力矩阵口径一致）；字段不在注册表（如 author）不显示 |
| 无标题提示 | 标题输入框下方 `no-title-hint`，文本 `标题将作为描述首行插入：{platforms}`（平台名以顿号连接）；**显示条件**：selectedPlatforms 含任一无标题平台（isNoTitlePlatform）；仅选有标题平台时隐藏 |
| 标题/正文覆盖 | 差异化面板内每平台独立的标题/正文输入（留空 = 用默认内容） |

### 7.2 差异化面板（PlatformOverridePanel）

| 状态 | 行为 |
| --- | --- |
| 未启用 | 平台行只显示勾选框 + 平台名（无字段区） |
| 启用（勾选） | 展开字段区：标题/正文覆盖 + 注册表字段（仅 uiExposed && implemented）按类型渲染 |
| 禁用（取消勾选） | 删除该平台的 override 数据（下次启用回到默认值） |
| 合集拉取 | 点击「拉取我的合集」→ loading 态（按钮禁用 + 「拉取中…」）→ IPC listPlatformCollections → 成功填充下拉（名称+ID）/ 失败静默空列表；手输框始终可用 |
| select 类型保持 | 选项值类型不因 DOM string 化丢失（number/string 由归一化恢复） |

### 7.3 校验失败交互

| 场景 | 交互 |
| --- | --- |
| 内容超限 | notifyWarning 弹出消息（§4.2/§4.3 模板），发布阻断 |
| 百家号标题超限（自动截断路径） | 不弹窗，进度条追加 warning 行（baijiahaoTitleTruncated 文案），截断后重校验 |
| 定时无效 | notifyWarning + 进度条 danger 行 |
| 敏感词命中 | ElMessageBox 确认弹窗（强制发布/返回修改） |

---

## 八、显示项与提示文字（完整清单）

### 8.1 locales 文案（zh/en 成对，CI Gate 7 锁定）

| key | zh | en |
| --- | --- | --- |
| `publishPage.fieldSupport` | `{count}/{total} 平台支持` | `{count}/{total} platforms` |
| `publishPage.noTitleHint` | `标题将作为描述首行插入：{platforms}` | `Title will be inserted as the first line of the description: {platforms}` |

### 8.2 校验消息（publish-contract.js，中文为既有口径家族）

| 场景 | 消息 |
| --- | --- |
| 有标题平台超限 | `{平台}标题最多 {N} 个字符，当前 {M} 个` / `{平台}正文最多 {N} 个字符，当前 {M} 个` |
| 百家号字节 | `百家号标题最多 149 字节，当前 {M} 字节` |
| 无标题合并超限 | `{平台}正文最多 {N} 个字符（标题计入首行），当前 {M} 个` |
| 目标缺账号 | `请为{平台}选择至少一个账号` |

### 8.3 数据层文案（注册表 JSON，PLATFORM_NAMES 先例；CJK 基线扫描不覆盖 shared-utils）

- 通用字段 label（标题/正文/标签/话题/提及/封面/视频文件/图片/定时发布/AI 生成内容声明）
- 差异化字段 label/placeholder/hint/options（如「摘要 · 最多 120 字，留空自动取正文开头」「分区 · 日常/单机游戏/…」「可见性 · 公开/不公开列出/私享」）
- platform-capable 项的 note 证据说明（不渲染，供矩阵文档）

### 8.4 组件 chrome 文案（PlatformOverridePanel，存量基线）

「平台差异化内容」「为不同平台设置独立标题或正文，留空时使用默认内容。」「已启用」「使用默认标题」「使用默认正文」「拉取我的合集」「拉取中…」「不加入合集」「（先拉取或手输）」

### 8.5 testid 清单（E2E/单测锚点）

| testid | 位置 |
| --- | --- |
| `field-support-title` / `field-support-tags` 等 | 通用字段支持度徽标 |
| `no-title-hint` | 无标题平台标题提示 |
| `publish-title` / `publish-desc` / `publish-editor` | 主表单 |
| `override-toggle-{platformId}` | 差异化平台启用开关 |
| `override-title-{platformId}` / `override-content-{platformId}` | 平台覆盖标题/正文 |
| `override-{kebab(key)}-{platformId}` | 注册表字段（如 `override-privacy-level-tiktok`、`override-location-name-baijiahao`） |
| `override-collection-fetch-{platformId}` / `override-collection-id-{platformId}` / `override-collection-id-input-{platformId}` | 合集拉取三件套 |

---

## 九、注册表维护指南（新增平台/字段 SOP）

### 9.1 新增平台

1. `platforms` 加一条 `{titleMode, limits}`（按取证填 title/caption 与限值）
2. `overrideFields` 加该平台字段数组（无则空数组）
3. `commonFormFields` 各字段的 `platforms` 数组按支持情况追加该平台 id
4. **必跑测试**：shared-utils `publish-capabilities.test.js`（58 例，含 15 平台完整性断言）+ 引擎 `no-title-contract.test.js`（若 titleMode=caption 需同步契约锁清单断言）

### 9.2 新增差异化字段

1. `overrideFields.{platform}` 追加字段定义（key/semantic/status/type/label/default/uiExposed；platform-capable 必带 note 证据）
2. UI 已自动接入（数据驱动渲染）；若 status=implemented 且 uiExposed=true 即出现在面板
3. **必跑测试**：`PlatformOverridePanel.test.js`（字段快照）+ 若语义计数跨越 3 阈值，更新 `publish-capabilities.test.js` 分类断言

### 9.3 红线

- 修改无标题清单（titleMode）必须同步：DOM RPA 行为（rpa-view-platforms 结构锁）、引擎链合并行为、契约锁 A 清单断言——三处任何一处漂移 CI 变红
- 注册表标签文案在共享数据层（不进 locales）；但 apps/desktop/src 新增用户可见文案仍必须 zh/en 成对进 locales（Gate 7）
- 取证 note 不得写竞品品牌名（Gate 12 品牌残留红线，用中性称谓「参考产品」）

---

## 十、测试与验收

| 层 | 文件 | 结果 |
| --- | --- | --- |
| 注册表单测 | shared-utils `__tests__/publish-capabilities.test.js`（58 例：meta 完整性/清单精确/分类计算/compose 边界/双版本 parity/结构自检） | 58/58 ✅ |
| 渲染层合同 | `publish-contract.test.js`（22 例：限制对齐/无标题合并校验/边界矩阵） | 22/22 ✅ |
| 差异化面板 | `PlatformOverridePanel.test.js`（10 例：8 平台字段零丢失快照/默认值/类型保持） | 10/10 ✅ |
| 发布页 | `Publish.test.js`（54 例：徽标/无标题提示/既有全量） | 54/54 ✅ |
| DOM RPA | `rpa-view-platforms.test.js`（43 例：结构锁 + weibo 行为锁 + 快手断言反转） | 43/43 ✅ |
| 引擎 | `shipinhao-adapter.test.js` 新语义 + 全量 run-tests.js | 全量 ✅ |
| 跨包契约 | `no-title-contract.test.js`（8 例：A/B/C 三向锁） | 8/8 ✅ |
| 桌面发布面 | 13 文件 348 例 | 348/348 ✅ |
| CI（PR #2576） | quality-gate / GUI / Electron CI / Build & Release / 债务熔断 / 依赖审计 / Doc Sync / AI Agent Judge | 8/8 success ✅ |

## 十一、Roadmap（platform-capable → implemented 升级路径）

注册表已收录但未实现的能力按语义优先级排队（用户后续按需立项）：
1. **visibility（5 平台）**：语义级通用控件（公开/私密/好友 → 各平台值映射）——通用区候选。
2. **location（3 平台）**、**goods（4 平台）**、**activity（3 平台）**：差异化区字段补 UI。
3. 平台独有高价值项：B站弹幕开关、百家号三图封面、知乎赞赏、微博投票、抖音合作投稿。

## 十二、残余限制（2026-10-08 CCG 评审后更新）

- ~~引擎 `content-formatter.js` 第三份限制表未合并~~ → **已收口（CCG claude W4/codex W5）**：两表同步注册表口径 + 契约锁 `content-formatter-registry-sync.test.js`（引擎零依赖约束下用测试依赖锁漂移，先例 no-title-contract）；无标题平台标题在引擎管线不单独截断（合并后由 contentMax 管辖）。
- `platforms.yaml` max_title/max_content 未收敛（主进程配置面，RPA compose 截断仍读 YAML；CCG 登记，另立 change）。
- Twitter/TikTok 适配器为源码结构锁（execute 需网络/OAuth 无法单测直跑；建议提取纯函数属引擎重构面，另立 change）。
- 批量模式（batchMode）表单未加支持度徽标与无标题提示（单篇两分支已覆盖；批量属简化流）。
- EverOS HTTP 检索通道受服务端 cascade 卡死影响（add+flush 成功、search 空）；md-first 直写已兜底，cascade 恢复后自动索引。
- 校验层 String() 强转 vs 合成函数丢弃非字符串的类型边界差异（CCG codex W4 登记：UI 输入恒为字符串，无真实触发路径）。

## 十三、CCG 双模型评审记录（2026-10-08 补跑）

两路（claude 前端路 / codex 后端路）`codeagent-wrapper --lite` 并行派发，findings 逐条处置回写 `.quality-gates.md`。**关键产出**：

1. **codex W1（实质 Critical）**：`normalizePlatformOverrides` 硬编码白名单丢弃注册表面板字段（UI 可编辑但发布不生效）→ 改注册表驱动归一化（§5.1 数据流补：buildArticleData 的 platformOverrides 归一化按注册表字段与类型执行，与面板 normalizeValue 同口径）。
2. **codex Info3 暴露真实缺口**：`caption_textarea` 不在 `_publish_generic` 编辑器候选链 → instagram/tiktok 标题合并路径从未生效 → 候选链补齐（§5.3 表 DOM RPA 行的适用平台含 instagram/tiktok）。
3. 其余采纳修复：合并公式统一 `\n` + 按码点截断（DOM RPA/面板/校验层三处）、content-formatter 同步+锁、注册表副本深拷贝、全平台穷举 parity。

**评审方法论沉淀**：跨层缺陷（面板 emit ✓ / 路由直传 ✓ / 全链路 ✗）只有双模型外部评审暴露——两侧各自全绿时，中间的组装层（normalizePlatformOverrides）是盲区；「UI 可编辑但发布不生效」类 Bug 的回归锁必须打在全链路（panel → normalize → IPC payload）。
