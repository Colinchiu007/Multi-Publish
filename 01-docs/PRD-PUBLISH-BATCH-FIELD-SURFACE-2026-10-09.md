# PRD：P2-7 批量模式字段面（publish-page-optimization 第六切片，2026-10-09）

> **立项日期**: 2026-10-09
> **所属 roadmap**: [PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md](./PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md) 差距表第 7 项
> **切片序号**: publish-page-optimization 第六切片（前五切片：P1-4 / P0-2 / P1-5 / P0-1 第一 / P0-1 第二）
> **基线**: `origin/main` = `ae4cb321`
> **状态**: 本文档为「先文档再代码」门禁产出物，实施与本文档同 PR

---

## 一、问题定义

roadmap 对 P2-7 的一句话描述是：**参考产品的批量任务结构支持全字段，本仓批量模式缺封面 / 支持度徽标 / 无标题提示 / 差异化面板**。

实施前勘察（`git worktree` 基线 `ae4cb321`）确认：差距不止 UI 层，而是**三层同时断**，且三层之间是因果链——只补 UI 会得到一组「看着能填、填了不生效」的装饰性输入框：

| 层 | 断点（实测证据） | 后果 |
| --- | --- | --- |
| **① 主进程派发层** | `apps/desktop/electron/services/batch-manager.js:327-340`（`executeBatch`）入队时**手工白名单只取 5 个键**（title / content / author / cover_url / video_path），而**同一文件的排期路径** `:415`、`:440`（`scheduleBatch`）是 `{ ...article }` 整包透传 | 「立即执行」的批量任务**永久丢失** cover_path / cover_file / images / image_files / tags / topics / mentions / aiGenerated / precheck / contentFormat / platformOverrides / visibilitySemantic——**即使渲染层把这些值发下来也会被砍掉** |
| **② 渲染层 payload** | `apps/desktop/src/composables/useBatchPublish.js:169-189`（`buildBatchArticlePayload`）与单篇 `usePublishFlow.js:269-306`（`buildArticleData`）逐键对照，缺 `contentFormat` / `platformOverrides` / `visibilitySemantic` 三键；封面直接透传 `a.cover_path`，未经单篇用的 `normalizePublishFile` 归一 | 差异化的封面/裁剪产物无法归一；单篇与批量对同一份内容的判定口径不同（Markdown 判定缺失 → 平台侧按错误格式渲染） |
| **③ UI 字段面** | `apps/desktop/src/views/Publish.vue:71-195`（批量模板）里条目实际只有 8 个绑定（title/content/tagsText/topicsText/mentionsText/platforms/accounts/publishTime）；`addArticle()`（`useBatchPublish.js:236-259`）声明的 author/cover_*/video_path/images/image_files **没有任何写点** | 「字段恒空」形态（AGENTS.md 诊断法：只有读点、没有写点 ⇒ 可证必然为空）：`:177-179` 三个封面读点读的是初值 `''/null` |

**结论**：P2-7 的交付边界必须是**三层一起收口**，否则任何单层交付都是装饰性的。这同时决定了本切片必须新增两条跨层回归锁（②↔③ 的 payload 键集锁、①↔② 的字段面 parity 锁）。

第二个实施期发现：**单篇的字段面判据是内联在 `Publish.vue` 里的**（`:1185-1221` 的 `commonFormFields` / `fieldSupportText` / `noTitleHint` / `visibilitySemanticSupport` / `visibilityUnsupportedHint` / `selectedOverridePlatforms`），批量要复用只有两条路——抄第二份（违反 AGENTS.md「单一真源」与质量节拍 P4/DRY），或**下沉为共用实现**。本切片选后者：把判据参数化为「按平台清单」，单篇与批量同口径消费。这条重构同时给 `Publish.vue` 腾出行数预算（该文件挂账 1515 行、现 1711 行，距 `LEDGER_GREW` 上限 1715 行只剩 4 行，见 §六.5）。

第三个发现由 ①↔② 的 parity 锁**当场命中**（写锁之前并不知道）：排期路径 `scheduleBatch`（`:415`、`:440`）整包透传 article，却**不把本次派发目标写进 `article.accountId`**；而 `publisher-router.js:356` 的 `resolveAccountForPublish` 读的正是 `article.accountId`（缺失即回退「平台默认账号」的凭证）。于是**同一平台挂多个账号时，批量排期任务会用错账号的凭证**——立即执行路径反而没这个毛病（它写了 `accountId`）。两条路径的字段面差异不只是「少几个键」，还包含「同一个键只在一侧存在」。本切片把三条派发点（executeBatch / scheduleBatch 的过期立即入队 / scheduleBatch 的定时器入队）统一收敛到 `buildEnqueuedArticle(article, accountId)` 一处实现。

## 二、范围与非范围

**做**：
- 批量条目补齐四个字段面：封面、通用字段支持度徽标、无标题平台首行提示、平台差异化内容面板；连带补齐同源的可见性语义控件与 Markdown 内容格式判定（这两项与「任务结构支持全字段」是同一判据，单独立项会立刻二次返工）
- 主进程 `executeBatch` 字段面与 `scheduleBatch` 收口为同一口径
- 批量提交前补注册表内容限制校验（`validatePlatformContent`，此前批量**完全不调**）
- 单篇字段面判据下沉为共用实现（含差异化面板归一化、上传文件描述符归一）

**不做**（明确标记为 Ocean）：
- 批量模式的 AI 封面生成 / 视频抽帧封面 / 封面裁剪三个「生成型」入口。这三者在单篇是 `Publish.vue` 内联浮层与 `article.*` 硬绑的异步链（`:1009-1028`、`:1052-1074`），迁成可传入目标的函数属**另一类重构**（涉及 AI 任务生命周期与浮层挂起合同），且批量条目是「多篇同构内容」，为其逐篇起 AI 生成任务的产品语义尚未定义。批量交付的是「手选封面 + 预览 + 清除 + URL」，裁剪/抽帧/AI 留待单独立项
- 批量条目的图片九宫格上传（`images` / `image_files` 仍无 UI 写点）——属「批量图文素材编辑面」，与 P2-7 的四个命名面不同源，见 §七 残余限制
- 批量模式的草稿/模板与新增字段的往返（模板只覆盖 title/content，草稿只存单篇）

## 三、数据校验

| # | 校验点 | 规则 | 位置 |
| --- | --- | --- | --- |
| 1 | 批量 payload 键集 | 必须**逐键包含**单篇 `buildArticleData` 的键集（title/content/contentFormat/author/cover_url/cover_path/cover_file/video_path/images/image_files/tags/topics/mentions/aiGenerated/precheck/platformOverrides/visibilitySemantic/publishTime/platforms），差集为空 | `useBatchPublish.test.js`「P2-7 与单篇键集 parity」 |
| 2 | 主进程字段面 parity | `executeBatch` 与 `scheduleBatch` 入队任务携带的 article 键集**必须相同**（一方丢键即红），且两侧 `article.accountId` 必须同值 | `batch-manager.test.js`「P2-7 派发层字段面 parity」 |
| 2b | 派发目标账号 | 三条派发点（立即执行 / 排期过期立即入队 / 排期定时器入队）一律经 `buildEnqueuedArticle(article, accountId)` 写入 `article.accountId`；`publisher-router.resolveAccountForPublish` 只读 `article.accountId`，缺失即回退平台默认账号凭证 | `batch-manager.js` + `batch-manager.test.js` |
| 3 | 封面归一 | `cover_file` / `cover_path` / `cover_url` 三者经 `normalizePublishFile` 归一，`cover_path` 取 `descriptor.path`，与单篇同一实现；解析不出路径 → 不产出该键（保持字段缺席，交由「不修改」语义） | `buildBatchArticlePayload` |
| 4 | 差异化面板归一 | `platformOverrides` 经**唯一**实现 `normalizePlatformOverrides`（按注册表字段与类型归一，无有效差异内容的平台条目不进 payload）；批量**禁止**第二份归一逻辑 | `publish-overrides.js`（本切片自 `usePublishFlow.js` 迁出） |
| 5 | 可见性档位 | 只有非空语义档位才挂 `visibilitySemantic` 键（与单篇 `if (article.visibilitySemantic)` 同口径）；非法档位由主进程 resolver 侧 `mapVisibilitySemantic` fail-closed 返回 null，UI 不校验取值 | `buildBatchArticlePayload` |
| 6 | 内容格式 | `contentFormat` 由 `isMarkdownContent(a.content)` 判定为 `markdown` / `html`，与单篇同一函数 | `publish-overrides.js` |
| 7 | 平台内容限制（**新增**） | 每条目在既有 `validatePublishMetadata` / `validatePublishTargets` / `validateScheduleEntries` 之后补 `validatePlatformContent({ platforms: a.platforms, article: { title, content }, platformOverrides: a.platformOverrides })`；`valid:false` → `notifyWarning` 中止整批（与批量既有校验「任一条目不合法即不提交」的语义一致） | `handleBatchPublish` 校验循环 |
| 8 | 条目平台清单来源 | 差异化面板/无标题提示/可见性提示一律按**该条目自己的** `a.platforms` 计算，禁止复用单篇的全局 `selectedPlatforms`（否则「A 条选了微博、B 条没选」时 B 条被 A 条污染） | `usePublishFieldSurface` 各方法入参 |
| 9 | 空平台清单 | 条目未选平台时：无标题提示为空、支持度徽标照旧（分母取注册表平台总数，与所选无关）、差异化面板与可见性控件整块不渲染 | `usePublishFieldSurface` |
| 10 | 复制条目 | `duplicateArticle` 必须**深拷贝** `platformOverrides` 与 `visibilitySemantic`（浅拷贝会让两条目共享同一 override 对象，改一条动两条）；`publishTime` 保持「复制不带排期」的既有语义 | `duplicateArticle` |
| 11 | IPC 序列化 | 新增键随 `toPlainJson` 出栈（批量提交前整包过 `JSON.parse(JSON.stringify())`），禁止把 reactive proxy 直接传 IPC | `handleBatchPublish` 既有链路 |

## 四、流程

```
批量模式（batchMode = true）
  ├─ 条目渲染：v-for a in articles
  │    ├─ 既有 8 字段（title/content/tagsText/topicsText/mentionsText/platforms/accounts/publishTime）—— 不变
  │    └─ 【新增】<BatchArticleFields
  │          :article="a"  :platform-ids="a.platforms"
  │          :model-value="a.platformOverrides"  :visibility="a.visibilitySemantic" />
  │          ├─ 无标题平台首行提示（按该条目平台清单）
  │          ├─ 通用字段支持度徽标（注册表单一真源）
  │          ├─ 封面行：选择（el-upload → resolveUploadFilePath → normalizePublishFile）/ 缩略图预览 / 清除
  │          ├─ 可见性语义控件（复用 PublishVisibilitySelect，哑组件）
  │          └─ 平台差异化内容面板（复用 PlatformOverridePanel，折叠）
  │        子字段变更经 emit 冒泡 → useBatchPublish 的 setter 落到条目对象
  │
  ├─ 提交（handleBatchPublish）：
  │    ① 登录门 → ② 逐条目校验：title 非空 → content 非空 → 平台非空
  │       → validatePublishTargets → validatePublishMetadata
  │       → 【新增】validatePlatformContent（注册表内容限制，含无标题平台「标题计入首行」合并口径）
  │       → 账号可用性 → ③ validateScheduleEntries → ④ 确认框
  │    ⑤ 离线分支：逐条 offlineAddToCache({ targets, data: buildBatchArticlePayload(a) })
  │    ⑥ 在线分支：batchCreate({ name, articles: articles.map(buildBatchArticlePayload) })
  │       →（有条目带 publishTime）batchSchedule(batchId)
  │       →（无）batchExecute(batchId)
  │
主进程（batch-manager）
  ├─ createBatch：整包持久化 articles（不变）
  ├─ scheduleBatch：timer 到点 → _enqueueForOwner({ platform, article, ... })  ← 整包（既有）
  └─ executeBatch：【本切片修复】_enqueueForOwner({ platform, article: { ...metadata.article, accountId }, ... })
        · 修复前：手工白名单 5 键 ⇒ ②③ 层交付的字段全部在此丢失
        · 修复后：与 scheduleBatch 同口径，accountId 仍按本条 target 覆盖
        → 任务队列 → publisher-router.resolvePlatformArticle（按注册表消费 platformOverrides / visibilitySemantic / cover_path）
```

## 五、功能逻辑

1. **判据单一真源（下沉三处）**
   - `usePublishFieldSurface.js`（新）：注册表判据 + 文案装配。`fieldSupportText(key)`（分母 = 注册表平台总数，与所选无关）、`noTitleHintFor(ids)`、`visibilitySupportedIdsFor(ids)`、`visibilityUnsupportedHintFor(ids, semantic)`、`overridePlatformSpecsFor(ids)`。单篇 `Publish.vue` 的原内联实现删除后改为消费本模块，批量组件同样消费本模块——**同一份判据，两模式不可能漂移**。
   - `publish-overrides.js`（新，自 `usePublishFlow.js` 迁出）：`normalizePlatformOverrides` / `normalizeOverrideValue` / `platformOverrideFieldsFor` / `isMarkdownContent`。迁出理由：批量与单篇必须共用同一份归一化，而 `publish-contract.js` 现 463 行、未挂账且上限 500 行，放不进来（§六.5）。
   - `publish-upload-file.js`（新，自 `Publish.vue` 迁出）：`resolveUploadFilePath` / `normalizeUploadFile`。批量封面的「上传文件 → 路径描述符」与单篇同一实现。

2. **哑组件边界**：`BatchArticleFields.vue` 不持有 store、不持有平台清单来源，条目平台清单由页面注入（与 `PublishTargetSelector` / `PublishVisibilitySelect` 既有注入模式一致）。组件自带封面预览状态（`useCoverPreview(() => props.article.cover_path)`），因为预览按 PRD-PUBLISH-COVER-PREVIEW 的结论**必须挂在字段上**而非按钮回调上——批量条目同样适用。

3. **条目作用域**：批量每个条目独立持有一份 `platformOverrides` 与 `visibilitySemantic`。这是批量与单篇的语义差异所在——单篇「一次设置覆盖所选全部平台」，批量「每篇内容各自不同」。**不得**引入「把某条目的差异化设置一键同步到全部条目」这类批量级联（产品语义未定义，级联会抹掉用户逐条手工设置，属 AGENTS.md「覆盖已有行会抹掉运营者配置」同族陷阱）。

4. **派发层修复的取舍**：`executeBatch` 改成整包透传，而不是「把白名单加长到覆盖新字段」。理由：白名单是逐键手工维护的第二份真相，每加一个字段就要改一次主进程（本切片实测正是这么漏的——单篇早已有的 tags/topics/mentions/cover_path/images 在批量立即执行路径上**一直**被砍）。整包透传后，新增字段只需渲染层构造，主进程不再参与字段面裁剪；字段是否生效由 `resolvePlatformArticle`（注册表真源）单点决定。
   - 落点是**一处** `buildEnqueuedArticle(article, accountId)`（`batch-manager.js` 模块级），三条派发路径共用：`executeBatch`、`scheduleBatch` 的「已过期立即入队」与「定时器到点入队」。写第二份「整包 + accountId」的拼装必然与其中一条漂移。
   - 安全边界：`metadata.article` 来自 `createBatch` 持久化的渲染层 payload（已经 `toPlainJson`），不含 Vue reactive 包装，也不含 `accounts`/`_key`/`tagsText` 这类仅 UI 侧的键（那些键从未进 payload）。`accountId` 由本次派发目标覆盖条目自带值，防止批次里残留的旧账号冒充本次目标。

5. **校验缺失的补齐口径**：批量此前不调 `validatePlatformContent`，导致超长内容在批量下直接进队列、由平台侧报错（用户在进度流里看到一条模糊失败）。补校验后**整批中止**而非「跳过该条」——与批量既有 5 道校验的中止语义保持一致（一次批量提交是一个用户动作，部分提交会让「已提交 N 条」的计数与预期不符）。

## 六、交互逻辑

| # | 交互点 | 行为 |
| --- | --- | --- |
| 1 | 进入批量模式 | 每条目在既有字段下方出现「扩展字段面」区块；未选平台时只显示封面行（不显示空提示、不显示差异化面板） |
| 2 | 条目切换平台 | 该条目的无标题提示 / 可见性提示 / 差异化面板平台卡片随**本条目**所选平台增删；其他条目不受影响 |
| 3 | 无标题平台提示 | 条目所选平台命中任一 titleMode=caption 平台时，标题输入区下方显示「{平台名} 无独立标题字段，标题将作为正文首行发布」；未命中不显示 |
| 4 | 支持度徽标 | 标签/话题/提及/定时/封面等通用字段标签后显示「N/15 支持」（注册表真源）；徽标为**说明性**，不阻断填写 |
| 5 | 封面选择 | 「选择封面」→ 本机文件选择 → 缩略图即时预览（`CoverThumbnail`）；解析不出路径 → warning toast（复用 `story2video.media_path_unresolved`），该条封面字段保持原值不被清空成假成功 |
| 6 | 封面预览放大 | 点击缩略图打开 `CoverPreviewDialog`（与单篇同一组件）；无预览数据不响应 |
| 7 | 封面清除 | 「清除封面」清空该条目 `cover_file`/`cover_path`/`cover_url`；只作用于本条目 |
| 8 | 封面 URL | 条目级 `cover_url` 文本框（与单篇同一口径：`normalizePublishFile` 归一，优先级 file > path > url） |
| 9 | 可见性档位 | 条目内四档（跟随默认/公开/好友/仅自己）；所选平台无一支持 visibility 时整块不渲染；选了某档但有平台不支持时如实显示「{平台} 不支持该档位，将保持默认」 |
| 10 | 差异化面板 | 条目内「平台差异化内容」折叠按钮（展开/收起文案复用单篇 `publishPage.expand`/`collapse`）；展开后逐平台卡片可覆盖标题/正文/注册表特有字段；清空全部覆盖内容的平台条目不进 payload |
| 11 | 复制条目 | 复制携带封面、可见性档位、差异化面板设置（深拷贝）；排期时间不携带（既有语义） |
| 12 | 提交（内容超限） | 弹 warning「{标题前 20 字}：{平台}{字段}最多 N 个字符，当前 M 个」并中止整批 |
| 13 | 提交（其余既有门） | 登录门 / 空标题 / 空正文 / 无平台 / 目标非法 / 元数据非法 / 账号不可用 / 排期非法 / 确认框 —— 全部不变 |

### 六.5 门禁预算（实施前实测，非事后解释）

- `Publish.vue` 挂账 1515 行、现 1711 行，`LEDGER_GREW` 容差 200 ⇒ 硬上限 1715 行，**只剩 4 行**。因此本切片对 `Publish.vue` 的净效果必须为**减行**：删除内联判据（`:1185-1221`，约 37 行）与内联上传归一（`:892-930`，约 39 行）改为 import + 一行式 computed，模板挂载新组件约 +9 行，预计净减 ~60 行。
- 新文件必须 < 500 行（否则 `NEW_OVER_LIMIT` 直接阻断，无挂账机会）：`BatchArticleFields.vue` 预计 ~230 行，其余三个模块 < 130 行。
- `useBatchPublish.js` 挂账 622 / 现 712 ⇒ 上限 822；`batch-manager.js` 挂账 505 / 现 605 ⇒ 上限 705。本切片分别预计 +70 / −10 行，均在预算内。

## 七、显示项与提示文字（zh/en 成对，CI Gate 7 锁定）

复用既有 key（**不新增**，避免死键）：`publishPage.fieldSupport`、`publishPage.noTitleHint`、`publishPage.cover`、`publishPage.selectCover`、`publishPage.coverTip`、`publishPage.coverUrlPlaceholder`、`publishPage.visibility*` 全套、`publishPage.diffContent`、`publishPage.expand`、`publishPage.collapse`、`publishPage.clear`、`story2video.media_path_unresolved`。

新增 key（zh/en 成对）：

| key | zh |
| --- | --- |
| `publishPage.batchFieldSurface.sectionTitle` | 扩展字段面 |
| `publishPage.batchFieldSurface.coverHint` | 每篇文章可单独设置封面；未设置的条目按平台默认处理 |
| `publishPage.batchFieldSurface.diffHint` | 只为本篇所选平台单独调整标题/正文与差异化字段，不影响其他文章 |
| `publishPage.batchFieldSurface.noPlatformHint` | 本篇尚未选择平台，差异化设置将在选择平台后可见 |
| `publishPage.batchNotify.contentInvalid` | 「{title}」内容超出平台限制：{message} |

## 八、测试（TDD，先红后绿）

| 文件 | 层次 | 新增/变更 |
| --- | --- | --- |
| `usePublishFieldSurface.test.js`（新） | 单元（真注册表，不 mock） | 支持度徽标分母 = 注册表平台总数；无标题命中/未命中/空清单；可见性支持清单与「不支持档位」提示；差异化面板规格按 id 展开且带 titleMax/contentMax；**同一清单两次调用结果相同**（无全局态泄漏） |
| `publish-overrides.test.js`（新） | 单元（纯函数） | 迁出后行为与原实现一致：无有效差异内容的平台条目被剔除、注册表特有字段按类型归一、`isMarkdownContent` 判定表 |
| `publish-upload-file.test.js`（新） | 单元 | 直取 `path` / `filePath` / `file_path` 优先级、IPC `getPathForFile` 回退、解析失败返回 null（不抛错） |
| `BatchArticleFields.test.js`（新） | 组件 mount | 无标题提示只在命中条目渲染；徽标文案来自共用实现；封面选择 emit 描述符、清除 emit 空、预览挂 `cover_path`；平台清单为空时差异化面板与可见性控件不渲染；差异化面板 `update:modelValue` 冒泡 |
| `useBatchPublish.test.js` | composable + IPC 契约 | **更新** `:615-652` 精确键集断言（新增 contentFormat/platformOverrides/visibilitySemantic）；新增：与单篇 `buildArticleData` 键集 parity；条目结构含 `platformOverrides:{}` 与 `visibilitySemantic:''`；`duplicateArticle` 深拷贝两条目互不影响；`validatePlatformContent` 不过 → 整批中止且不 `batchCreate`；setter 只写目标条目 |
| `batch-manager.test.js` | 主进程契约 | 新增：`executeBatch` 入队携带全字段（逐键断言 cover_path/tags/topics/mentions/images/image_files/aiGenerated/contentFormat/platformOverrides/visibilitySemantic）；与 `scheduleBatch` 字段面 parity；`accountId` 由 target 覆盖条目自带值 |
| `Publish.test.js` | 页面接线 | 新增：批量条目挂载 `BatchArticleFields`（testid 按条目索引）；单篇字段面（徽标/无标题提示/可见性/差异化）在判据下沉后**回归不变**（既有 `data-testid` 断言必须继续通过——下沉是重构，不是行为变更） |
| `usePublishFlow.test.js` / `publisher-router.test.js` | 回归 | 全量不变通过（确认迁出未改单篇与主进程语义） |

**反证要求**（质量节拍「防再犯锁必须做一次把锁改成 no-op 立刻变红」）——**四条均已实跑**，脚本逐条变异后跑受影响测试、再逐字节还原并校验 SHA（结果 `restoredByteEqual=true`）：

| # | 变异 | 实跑结果 | 变红的用例 |
| --- | --- | --- | --- |
| M1 | `executeBatch` 的整包透传退回 5 键白名单 | **红 2 / 22 绿** | `batch-manager.test.js`「入队携带全部字段」「executeBatch ↔ scheduleBatch parity」 |
| M2 | `platformOverrides` 归一改成恒 `{}`（no-op） | **红 1 / 70 绿** | `useBatchPublish.test.js`「payload 携带新字段：Markdown 判定 / 差异化归一 / 可见性档位 / 封面归一」 |
| M3 | 批量内容校验拦截条件改成恒不触发 | **红 2 / 69 绿** | `useBatchPublish.test.js`「内容超出注册表限制时整批中止」「差异化面板里的超长覆盖内容同样被拦」 |
| M4 | `noTitleHintFor` 忽略入参平台清单（退回固定单篇语义） | **红 3 / 22 绿**（跨两个测试文件） | `usePublishFieldSurface.test.js`「未命中与空清单都不提示」；`BatchArticleFields.test.js`「按本条目平台计算」「两条目互不污染」 |

补充一条 M2 的判据说明：M2 只把值改成空对象（键仍在），因此红的是**行为锁**而非 §三.1 的键集锁——两条锁互补：键集锁防「将来新增字段只加在单篇侧」，行为锁防「键在但值不生效」（后者正是 CCG codex W1 那类「面板可编辑、发布不生效」的形态）。

另记一条本次实施期自伤的坑（已当场修复，写下来因为它正是简报第 13 条）：向 `Publish.test.js` 插入新用例时，`old_string` 含锚点行 `it("showTemplatePicker toggle works", ...)` 而 `new_string` 漏抄该行 → 锚点被静默删除、函数体悬空。判据不是「看起来改成功了」，而是**跑一次**——该文件随即语法报错。此后插入一律带上锚点行本身。

## 九、残余限制

- 批量条目仍无图片九宫格 UI 写点（`images` / `image_files` 结构在、payload 发、主进程透传，但只能由「从项目带入」等非手工路径填充）——属「批量图文素材编辑面」，需单独立项
- 批量条目无 AI 封面 / 抽帧 / 裁剪入口（见 §二 非范围）；封面仅手选与 URL
- 批量无草稿保存/加载（沿用 roadmap §五 结论：批量表单无存草稿动作，天然无 P1-4 的定时×草稿误解路径）
- 平台草稿箱（P1-3）与数据看板（P2-6）、账号分组（P2-8）不属本切片
- 差异化面板的「合集列表」异步拉取（`listPlatformCollections`）在批量下逐条目逐平台各拉一次，条目数多时请求量线性增长；本期不加去重缓存（缓存跨条目共享属另一类失效语义），实测条目 ≤10 时可接受，超出再立项
- 批量派发层改为整包透传后，字段是否**真正生效**由 `resolvePlatformArticle` 与注册表决定；本切片不新增任何平台字段的支持度声明
