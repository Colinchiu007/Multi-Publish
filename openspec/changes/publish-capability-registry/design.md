# Design: publish-capability-registry

## 1. 目标与非目标

**目标**：把 15 个平台的发布提交内容项收敛为一份声明式注册表（单一真源），据此（a）标记通用/半共有/独有内容，（b）数据驱动差异化 UI，（c）统一无标题平台「标题→描述首行」行为，（d）修复 API 链标题丢弃 Bug。

**非目标**：引擎侧限制表合并、platforms.yaml 收敛、未暴露能力的 UI 化（见 proposal Out of Scope）。

## 1.5 证据源：参考产品 4.13.19 逆向取证（2026-10-08 用户指定参考）

用户指定参考参考产品逆向代码（本机逆向工程目录，目录名含品牌词按 Gate 12 红线不入库，主进程 bundle `packages/main/dist/index.cjs` 8.4MB）核对漏项。从 bundle 提取各平台 buildPostData 证据后，注册表矩阵显著扩充：

| 语义能力 | 参考产品证据（新增平台） | 对注册表的影响 |
| --- | --- | --- |
| visibility 可见性 | 抖音 `visibility_type`、快手 `photoStatus`、微博 `visible` | 2 → **5 平台**（+YouTube/TikTok），升级为 common |
| location 位置 | 快手 `poiId/latitude/longitude`、视频号 `getShipinhaoLocation` | 1 → **3 平台**，升级为 common |
| goods 商品 | 快手 `goods.associateTaskId`、视频号 `getShipinhaoGoods` | 2 → **4 平台**，升级为 common |
| collection 合集 | 快手 `collectionId`、视频号 `getShipinhaoCollection` | 3 → **5 平台** |
| activity 平台活动 | 抖音 `<activity>` 标签（上限5）、快手活动领取、视频号 `getShipinhaoActivity` | 0 → **3 平台**，新增 common |
| comment-control 评论控制 | B站 `up_close_reply` | 2 → **3 平台**，升级为 common |
| download 下载权限 | 抖音 `download`、快手 `downloadType` | 新增 semiCommon |
| music 配乐 | 抖音 `music_id`、视频号 `getShipinhaoMusicList` | 新增 semiCommon |
| 平台独有 | 抖音合作投稿/横竖双封面/章节/同步头条、B站弹幕开关/精选评论/字幕、百家号三图封面/副标题/粉丝关注引导/自荐/转载声明、知乎目录/赞赏、微博投票/声明、快手禁止同城/同框/小程序、视频号挂链接 | 全量收录为 unique（uiExposed: false） |

注册表以 `status: implemented | platform-capable` 区分「本仓已实现」与「平台支持但未暴露（参考产品取证）」；platform-capable 字段必须带 note 证据说明（结构自检强制）。分类计数覆盖两种状态（用户规则是平台共性，不是实现状态）。

## 2. 机制选型（用户已确认）

**声明式注册表，不用数据库。** 理由：
1. 平台能力（有无标题框、字数上限、特有字段）是**随代码版本发布的静态事实**，不是用户数据——没有运行时变更需求，数据库只引入迁移/同步负担；
2. 注册表可被 CI 契约测试直接 require 并锁死（数据库内容无法进 git 审查）；
3. 符合项目架构原则「能不用数据库就不用」；
4. 先例：`platform-definitions.js` 已用「CJS + browser ESM 双版本」模式管理同类平台元数据，注册表复用该模式与导出完整性测试。

## 3. 通用内容判定规则（用户已确认）

- **阈值：3 个及以上平台共有 → 通用**（不需要全部平台支持）。
- **按语义能力对齐，不按字段名对齐**：YouTube `privacy` 与 TikTok `privacyLevel` 同属 `visibility` 语义；B站 `collectionId`、YouTube `playlistId`、百家号 `collection` 同属 `collection` 语义。
- **2 平台共有 = 半共有（semi-common）**：留在差异化区渲染，注册表记录 `sharedBy` 计数，供未来升级观察。
- **通用 ≠ 全部支持**：UI 通用字段标注「N/15 平台支持」；无标题平台对 `title` 字段走 caption 合并规则（标题仍是通用字段——主表单核心）。
- 分类是**计算属性**（`classifyPublishFields()`），不是手写标签——新增平台/字段时阈值自动生效。

## 4. 无标题平台清单（用户已确认，代码证据）

| 平台 | titleMode | 证据 |
| --- | --- | --- |
| tencent_video 视频号 | caption | API 链 `post_create` 请求体只有 `description`（`shipinhao-video.js` buildShipinhaoPostData） |
| kuaishou 快手 | caption | live DOM 取证：编辑页无独立标题框，标题/描述共用 `div#work-description-edit`（platforms.yaml 注释 + d4-1-kuaishou.json） |
| weibo 微博 | caption | DOM 选择器只有 `content_textarea`；渲染层 titleMax=0 |
| twitter X | caption | DOM 选择器只有 tweet textarea；渲染层 titleMax=0 |
| instagram | caption | DOM 选择器只有 caption textarea；渲染层 titleMax=0 |
| tiktok | caption | DOM 上传页只有 caption（2200 含话题）；渲染层 contentMax=0（旧表把 caption 当 title） |

其余 9 个平台（wechat_mp/zhihu/douyin/xiaohongshu/toutiao/bilibili/baijiahao/youtube/facebook）`titleMode: 'title'`，标题独立填写、不合并。

**合并规则**：`composeNoTitleDescription(title, content, { maxLen })` → `[title, content].filter(Boolean).join('\n')`，再按平台 contentMax 截断（标题优先存活——与 DOM RPA `_composeEditorCaption` 语义一致，分隔符从 `\n\n` 收敛为 `\n` 仅影响新调用点，DOM 既有路径不改）。

## 5. 内容限制对齐表（注册表基准值）

以渲染层现强制值为基线（避免行为变化），仅补齐缺失/明显漂移条目：

| 平台 | titleMax | titleMaxBytes | contentMax | 处理说明 |
| --- | --- | --- | --- | --- |
| wechat_mp | 64 | — | 20000 | 三源一致 |
| zhihu | 50 | — | 100000 | 渲染层值（yaml 5000 更严但从未强制） |
| weibo | 0（无标题） | — | 2000 | 一致 |
| douyin | 55 | — | 1000 | **修**：渲染层 0（不校验）→ 1000（yaml+引擎一致） |
| xiaohongshu | 20 | — | 1000 | 一致 |
| tencent_video | 0（无标题） | — | 1000 | **补**：渲染层缺条目回落默认 5000 → 1000（yaml） |
| kuaishou | 0（无标题） | — | 1000 | **补**：同上 |
| toutiao | 30 | — | 100000 | 渲染层值 |
| bilibili | 80 | — | 2000 | 渲染层值（yaml 3000 未强制） |
| baijiahao | — | 149 | 100000 | 字节数校验保留 |
| youtube | 100 | — | 5000 | 一致 |
| tiktok | 0（无标题） | — | 2200 | **修**：旧表 title 2200/content 0 → caption 语义 contentMax 2200 |
| twitter | 0（无标题） | — | 280 | 一致 |
| instagram | 0（无标题） | — | 2200 | 一致 |
| facebook | 100 | — | 63206 | **补**：渲染层缺条目 → yaml 真实值（Facebook 帖文上限） |

## 6. 注册表数据模型

```js
// packages/shared-utils/src/publish-capabilities.js（CJS）
const PLATFORM_PUBLISH_META = {
  wechat_mp: {
    titleMode: 'title',                 // 'title' | 'caption'
    limits: { titleMax: 64, contentMax: 20000 },
  },
  tencent_video: { titleMode: 'caption', limits: { titleMax: 0, contentMax: 1000 } },
  // …15 平台
}

const PLATFORM_OVERRIDE_FIELDS = {
  wechat_mp: [
    { key: 'digest', semantic: 'digest', label: '摘要', type: 'textarea', maxLen: 120,
      placeholder: '公众号图文摘要（选填）', default: '' },
    { key: 'massSend', semantic: 'mass-send', label: '保存草稿后群发', type: 'checkbox', default: false },
    { key: 'openComment', semantic: 'comment-control', label: '开启留言（评论）', type: 'checkbox', default: true },
  ],
  zhihu: [
    { key: 'commentPermission', semantic: 'comment-control', type: 'select', options: [...], default: 'anyone' },
    { key: 'declare', semantic: 'creation-declaration', type: 'select', options: [0..5], default: 0 },
    { key: 'topics', semantic: 'topics', type: 'tags', default: [] },
    { key: 'draft', semantic: 'draft', type: 'checkbox', default: false },
  ],
  // …每平台字段定义（含 normalize 规则声明）
}

const COMMON_FORM_FIELDS = [
  { key: 'title', semantic: 'title', label: '标题', platforms: [...15], note: 'noTitle 平台合并入描述首行' },
  { key: 'content', … }, { key: 'tags' }, { key: 'topics' }, { key: 'mentions' },
  { key: 'cover' }, { key: 'video' }, { key: 'images' }, { key: 'schedule' },
  { key: 'aiGenerated' },
]
```

**API（CJS 与 ESM 同名导出）**：
- `getPlatformPublishMeta(platformId)` → `{ titleMode, limits }`（副本）
- `isNoTitlePlatform(platformId)` → boolean
- `getNoTitlePlatforms()` → 冻结数组
- `getPlatformOverrideFields(platformId)` → 字段定义数组（副本）
- `classifyPublishFields()` → `{ common: [...], semiCommon: [...], unique: [...] }`（按 semantic 聚合计数）
- `getFieldSupport(semanticKey)` → `{ count, platforms }`
- `composeNoTitleDescription(title, content, { maxLen })` → string
- `getCommonFormFields()` → 主表单字段支持矩阵

## 7. 消费点接线

| 消费点 | 改动 |
| --- | --- |
| `publish-contract.js` | `getPlatformContentLimit` 改读注册表；`validatePlatformContent` 无标题平台校验合并长度 |
| `PlatformOverridePanel.vue` | 模板循环注册表字段渲染（text/textarea/select/checkbox/tags/collection）；`defaultOverride`/`normalizeValue` 改查字段定义 |
| `Publish.vue` | 通用字段支持度徽标 + 无标题平台标题提示（视频/图文两分支） |
| `rpa-view-platforms.js` | `_publish_generic` 标题段：`isNoTitlePlatform(platform)` → 跳过 title_input 解析直接走 caption 合并 |
| `shipinhao-video.js` | `buildShipinhaoPostData`：`description = composeNoTitleDescription(td.title, td.content)` |
| `adapters/twitter.js` | `text = compose(title, content)` |
| `adapters/weibo.js` | `buildPostData`：`content = compose(title, content)` |
| `adapters/tiktok.js` | `post_info.description = compose(title, content)` |
| 引擎契约测试 | `no-title-contract.test.js` 锁清单 ↔ 行为 |

## 8. 风险与对策

| 风险 | 对策 |
| --- | --- |
| 注册表值与现强制值不一致引发发布被新拦 | design §5 对齐表逐条给出处理说明；`publish-contract.test.js` 既有用例全量回归 |
| PlatformOverridePanel 重构丢字段（zhihu declare 等 8 平台 × 20 字段） | 先写「字段清单快照测试」再重构（TDD）；既有 `PlatformOverridePanel.test.js` 全量跑 |
| DOM RPA 显式跳过改变有标题平台行为 | 只对注册表 6 平台跳过；其余平台 title_input 解析路径零改动；`rpa-view-platforms.test.js` 既有结构锁回归 |
| 双版本（CJS/ESM）导出漂移 | 复用 `platform-definitions-browser.test.js` 模式：导出完整性同步测试 |
| 引擎零依赖约束被破坏 | 引擎侧不 require shared-utils；契约测试在引擎 test 目录内 require 注册表源文件（测试依赖不算运行时依赖，先例：`cloud-accounts-desktop-contract.test.js` 读桌面端源码） |

## 9. 测试策略

1. **注册表单测**（shared-utils vitest）：meta 完整性（15 平台全覆盖）、无标题清单精确等于 6 平台、分类计算（collection=3 → common；visibility=2 → semiCommon）、compose 函数（空标题/空正文/超长截断/标题优先存活）、限制表快照。
2. **双版本导出完整性**（对齐 platform-definitions-browser.test.js）。
3. **渲染层**：publish-contract 既有测试全绿 + 新增无标题合并校验用例；PlatformOverridePanel 字段快照 + 数据驱动渲染用例；Publish.vue 提示文案用例。
4. **主进程**：rpa-view-platforms 结构锁（无标题平台不出现 title_input 解析调用）。
5. **引擎**：shipinhao/twitter/weibo/tiktok 合并行为用例 + no-title 契约测试（含反证：从清单移除一个平台必须变红）。
