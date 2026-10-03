# PRD — 文案库列表点击直达文案详情页（复用一键发布页）

- **Change ID**：copy-library-detail-entry
- **日期**：2026-10-09
- **状态**：已确认（用户 D1 决策：复用发布页；D2 决策：要求回写文案库）
- **关联**：`01-docs/PRD.md`（产品总 PRD）、`apps/desktop/src/composables/useCopyLibrarySources.js`（聚合层）、`apps/desktop/src/views/Publish.vue`（一键发布页）

---

## 1. 背景与问题

文案库一级页面（`/copy-library`，`CopyLibraryView.vue`）聚合了 4 个来源的文案：

| 来源 | origin | 数据真源 | 预览限制 |
|------|--------|---------|---------|
| 采集 | `collect` | settings key `collected_items` | 全文（≤200 字标题） |
| 改写 | `rewrite` | settings key `copy_library_rewrites` | 全文 |
| 草稿 | `draft` | 草稿箱（`draftList` IPC） | 全文 |
| 视频创作 | `video` | story2video 项目 `sourceText` | **预览截断 500 字**（SOURCE_PREVIEW_LIMIT） |

当前列表卡片是纯展示（`<article>`，无任何交互），用户无法：
1. 查看单条文案全文（视频来源在列表里只有 500 字截断预览）；
2. 从文案一键进入发布或视频创作流程。

## 2. 产品决策（用户确认）

- **D1**：一键发布页（`/publish`）**就是**文案详情页。列表点击 → 进入 `/publish` 预填该文案 → 用户在发布页查看/编辑/发布。不新建独立详情路由。
  - 依据：发布页已具备完整详情展示 + 编辑能力（标题/正文/封面/标签/话题全量字段）、已有 `?draft=<id>` 深链加载、【一键发布】按钮天然存在。
- **D2**：在发布页（作为详情页）编辑采集/改写来源内容时，**要求回写文案库**。
  - 回写通道复用改写文案存储（`copy_library_rewrites`，`useCopyLibrary.upsertRewrite`）：
    - `rewrite` 来源：按既有 `fromKey` 覆盖更新（`rewrite:<改写记录id>`），天然单条；
    - `collect` 来源：以 `collect:<采集id>` 作为 fromKey 写入一条改写记录（用户在详情页编辑的内容 = 对采集原文的一次「人工改写」，符合该存储既有语义）；
    - `video` 来源：视频文案真源是 story2video 项目（`sourceText`），**不回写**项目文件（写入通道在主进程专属 service，渲染进程无权直写），也不落入改写库（视频项目文案 ≠ 改写产物）。用户在详情页编辑仅影响本次发布内容；
    - `draft` 来源：真源是草稿箱，编辑后保存草稿即回写（`draftSave` 内容指纹幂等），无需额外通道。

## 3. 用户故事

1. **作为**运营人员，**我想**点击文案库列表中的任意文案卡片，**以便**查看该文案全文。
2. **作为**运营人员，**我想**在详情页直接点【一键发布】，**以便**把这条文案发布到已选平台。
3. **作为**运营人员，**我想**在详情页点【创作视频】，**以便**以这条文案为源文本进入视频创作流水线。
4. **作为**运营人员，**我编辑**了采集/改写来源的文案并保存，**期望**文案库里这条文案同步更新（而不是改完就丢）。

## 4. 功能需求（P0）

### 4.1 列表卡片可点击（文案库页）

- 整卡可点击（`role="button"`、`tabindex="0"`、`cursor:pointer`、hover 高亮），Enter 键等同点击（可访问性）。
- 点击行为：写入一次性交接载荷（见 4.2）→ `router.push('/publish?from=copy-library')`。
- 加载中（loading）、空态不响应点击。
- 来源徽标、标题、内容摘要、元信息布局不变；新增右侧「查看详情」图标（Element Plus `View` 图标）提示可点。

### 4.2 一次性交接载荷（copy-detail-handoff）

新文件 `apps/desktop/src/utils/copy-detail-handoff.js`，模式与 `rewrite-handoff.js` 完全一致（sessionStorage、读后即焚）：

```js
// 键名：copy_detail_handoff_v1
// 载荷字段（与文案库 UNIFIED_ITEM 对齐）：
{
  content: string,        // 必填，文案正文（视频来源为截断前的全文，见 4.3）
  title: string,          // 标题（可为空串）
  origin: string,         // 'collect' | 'rewrite' | 'draft' | 'video'
  sourceId: string,       // 去掉 origin 前缀后的原始 id（如采集记录 id / 改写记录 id / 草稿 id / story2video projectId）
  platform: string,       // 目标平台（采集/改写自带，草稿/视频为空）
  sourceUrl: string,      // 原文链接（采集/改写自带，可为空）
}
```

- `setCopyDetailHandoff(payload)`：写入前校验 `content` 非空（trim 后为空返回 false，不写入）。
- `takeCopyDetailHandoff()`：读后即焚；解析失败/非对象返回 null。
- `clearCopyDetailHandoff()`：测试清场用。
- **为什么 sessionStorage 不走 URL query**：正文可达数万字符（采集/改写），URL 长度与转义风险高；与 `rewrite-handoff` 同判据。

### 4.3 视频来源取全文

- 视频来源条目在列表态只有 500 字截断预览。点击视频来源卡片时：
  1. 调 `story2videoGetProject(projectId)` 拉取项目详情；
  2. 取 `sourceText` 全文写入交接载荷；
  3. 拉取失败（IPC 不可用/项目不存在）→ **降级用列表里的截断预览**写入载荷，照常跳转，`notifyWarning` 提示「全文获取失败，已带入截断预览」。
- `story2videoGetProject` 已存在于 `@/api/publisher`（返回 `{ code, data }`，`data.sourceText` 为全文）。

### 4.4 发布页消费交接载荷（文案详情态）

`Publish.vue` 挂载时（`onMounted`）与 keep-alive 激活时（`onActivated`，模式与 `applyHistoryVideoQuery` 相同）消费载荷：

- 无载荷 → 行为与现状完全一致（零回归）。
- 有载荷：
  1. 填充 `article.title` / `article.content`（保留发布页现有 reactive 字段结构）；
  2. 记录 `copyDetailMeta`（origin / sourceId / platform / sourceUrl / loadedAt），供回写与提示使用；
  3. `origin === 'video'` → `activeMode.value = 'video'`（视频文案默认视频发布模式），否则保持 `article` 模式；
  4. 清空 `copy_detail_handoff_v1`（读后即焚，刷新不重复预填）；
  5. toast 提示「已带入文案库文案：<标题或未命名>」，让用户知道内容来源。
- `route.query.from === 'copy-library'` 时页面顶部显示一条**轻量提示条**（非阻塞，可关闭）：「文案详情模式：内容已从文案库带入，编辑后保存将回写文案库（视频来源除外）」，关闭后本次会话不再显示。
- **回写触发点**（用户点【保存草稿】或【一键发布】成功后）：
  - 仅当 `copyDetailMeta` 存在且 `origin ∈ {collect, rewrite}` 时执行；
  - `collect` → `upsertRewrite({ fromKey: 'collect:<sourceId>', fromTitle: <载荷 title>, title: article.title, content: article.content, platform, sourceUrl })`；
  - `rewrite` → `upsertRewrite({ fromKey: 'rewrite:<sourceId>', ... })`（按 fromKey 覆盖，同一来源只保留最新）；
  - 失败静默（console.warn + 不阻塞发布主流程，与 `RewriteView.syncResultToLibrary` 同判据——文案库回写是旁路，不是发布事务的一部分）；
  - 成功不弹 toast（避免与「发布成功」竞争注意力；文案库是聚合视图，下次进入自然反映）。
- **draft 来源**：载荷只用于预填；用户保存草稿走既有 `draftSave` 指纹幂等，天然回写，无额外逻辑。
- **video 来源**：载荷只用于预填；不回写（见 D2 决策理由）。

### 4.5 【创作视频】按钮（发布页新增）

- 位置：发布页右侧任务闭环区（`publish-action-card`），【保存草稿】按钮下方、【一键发布】按钮上方。
- 样式：`variant="secondary"`、`size="sm"`、`class="side-button-block"`，与【保存草稿】一致。
- 行为（对齐 `RewriteView.goToVideoCreate` 成熟模式）：
  1. 防重入锁（连点不重复存草稿）；
  2. 若 `article.content`（标题+正文）为空 → notifyWarning「内容为空，无法创作视频」不跳转；
  3. 否则确保内容已存草稿：**发布页不再引入第二个草稿保存通道**——直接复用本页已解构的 `saveDraft`（usePublishDrafts），它内部走 `draftSave`（内容指纹幂等，同内容重复保存只保留一条）；
  4. 草稿 id 获取：`saveDraft` 现在不返回 id。扩展 `usePublishDrafts.saveDraft` 返回 `{ ok: boolean, draftId: string|null }`（内部从 `draftSave` 响应 `data.draftId` 取；旧调用方不接收返回值，零破坏）；
  5. 成功 → `router.push({ path: '/create', query: { draft: draftId } })`（CreateView 已支持 `?draft=` 消费）；
  6. 保存失败 → 已由 saveDraft 内部 toast，不跳转。
- i18n：`publishPage.createVideo`（zh：`🎬 创作视频`；en：`🎬 Create Video`）。emoji 属内容类图标，符合 icon-usage 守卫例外 3（内容/文案类 emoji 允许）。

### 4.6 文案库列表 hover 态

- `.copy-library-card` hover：`border-color` 变主色、轻微上浮（`translateY(-1px)`）、`cursor: pointer`；
- 键盘焦点态（`:focus-visible`）与 hover 同等高亮（可访问性门禁）。

## 5. 数据校验

| 校验点 | 规则 | 失败行为 |
|-------|------|---------|
| 交接载荷 content | trim 后非空 | 不写入（setCopyDetailHandoff 返回 false），不跳转 |
| 交接载荷 origin | ∈ {collect, rewrite, draft, video} | 不写入（防脏数据进入发布页回写分支） |
| 交接载荷 JSON 解析 | try/catch | 返回 null，发布页按无载荷处理 |
| 视频全文拉取 | `res.code === 0 && data.sourceText` 非空字符串 | 降级截断预览 + warning toast |
| 回写触发资格 | `copyDetailMeta.origin ∈ {collect, rewrite}` 且 content 非空 | 跳过回写 |
| upsertRewrite content | trim 后非空（既有契约） | 返回 null，静默跳过 |
| 创作视频前置 | 标题或正文 trim 后非空 | warning toast，不存草稿不跳转 |

## 6. 交互流程

```
文案库列表卡片点击
    │
    ├─ 视频 origin → story2videoGetProject(projectId)
    │       ├─ 成功 → 载荷.content = sourceText 全文
    │       └─ 失败 → 载荷.content = 列表截断预览 + warning
    │
    ├─ setCopyDetailHandoff(载荷)
    │       └─ 失败（存储不可用/超额/content 空）→ 不跳转，warning
    │
    └─ router.push('/publish?from=copy-library')
            │
            ├─ onMounted / onActivated → takeCopyDetailHandoff()
            │       ├─ null → 现状行为
            │       └─ payload → 预填 article + copyDetailMeta + toast + 视频来源切 video 模式
            │
            ├─ 用户点【保存草稿】/【一键发布】成功
            │       └─ origin ∈ {collect,rewrite} → upsertRewrite 回写（静默）
            │
            └─ 用户点【创作视频】
                    └─ saveDraft() → router.push('/create?draft=<id>')
```

## 7. 显示项与文案

| 位置 | i18n key | zh | en |
|------|----------|----|----|
| 列表卡片 hover 图标 aria | `copyLibrary.viewDetailAria` | 查看文案详情 | View copy details |
| 带入成功 toast | `copyLibrary.detailLoadedToast` | 已带入文案库文案：{title} | Loaded copy from library: {title} |
| 提示条正文 | `copyLibrary.detailModeBanner` | 文案详情模式：内容已从文案库带入，编辑后保存将回写文案库（视频来源除外） | Detail mode: content loaded from Copy Library. Saving writes back to the library (except video source) |
| 提示条关闭 aria | `copyLibrary.detailModeBannerClose` | 关闭提示 | Dismiss notice |
| 视频全文降级 warning | `copyLibrary.videoFullTextFailed` | 视频文案全文获取失败，已带入截断预览 | Failed to load full video text, truncated preview loaded |
| 交接写入失败 warning | `copyLibrary.handoffFailed` | 打开文案详情失败，请重试 | Failed to open copy details, please retry |
| 创作视频按钮 | `publishPage.createVideo` | 🎬 创作视频 | 🎬 Create Video |
| 创作视频空内容 warning | `publishPage.createVideoEmpty` | 内容为空，无法创作视频 | Content is empty, cannot create video |

## 8. 非功能需求

- **回归零破坏**：发布页无载荷路径行为与现状一致；`usePublishDrafts.saveDraft` 返回值扩展向后兼容。
- **性能**：交接载荷经 sessionStorage（同步、进程内），无网络/IPC 阻塞；视频全文仅在点击时按需拉取一次。
- **可访问性**：卡片可键盘操作（Enter 触发）；图标按钮带 aria-label；提示条可关闭且焦点可达。
- **i18n**：zh/en 成对（CI Gate 7 强制）；`publishPage.createVideo` 中 🎬 属内容类 emoji（icon-usage 守卫例外）。

## 9. 验收标准

1. ✅ 文案库列表 4 来源卡片点击均可进入发布页，正文/标题正确预填；
2. ✅ 视频来源点击后发布页正文为全文（mock IPC 返回全文场景）；
3. ✅ 视频全文拉取失败 → 降级截断预览 + warning toast + 照常跳转；
4. ✅ 发布页显示详情模式提示条，可关闭；
5. ✅ collect/rewrite 来源在发布页编辑后点【保存草稿】→ `copy_library_rewrites` 对应 fromKey 记录被覆盖更新（upsertRewrite 收到正确载荷）；
6. ✅ video/draft 来源保存草稿 → 不触发 upsertRewrite；
7. ✅ 【创作视频】按钮：空内容 warning；有内容 → draftSave 被调 → 跳转 `/create?draft=<id>`；
8. ✅ 快速连点创作视频按钮 → draftSave 只被调用一次（防重入锁）；
9. ✅ 刷新发布页 → 不重复预填（载荷读后即焚）；
10. ✅ 既有测试全绿（Publish.test.js / CopyLibraryView 相关 / useCopyLibrary / useCopyLibrarySources / icon-usage / href-scheme-contract）。

## 10. 明确不做（Out of Scope）

- 不新建 `/copy-library/:id` 路由与详情视图组件（D1 决策）；
- 不实现 video 来源回写 story2video 项目（渲染进程无写通道，属主进程 IPC 扩展，另行立项）；
- 不做文案库页内编辑（详情页=发布页）；
- 不改文案库聚合层数据结构（UNIFIED_ITEM 形状不变）；
- 不改 RewriteView / Collection 页既有「改写」按钮行为。

## 11. 回归保护测试清单

| 测试文件 | 用例组 |
|---------|--------|
| `src/utils/copy-detail-handoff.test.js`（新增） | set/take/clear 三函数行为 + content 空拒绝 + origin 白名单 + 解析失败 null |
| `src/views/CopyLibraryView.test.js`（新增） | 卡片可点击 + 各来源跳转 + 视频全文拉取/降级 + 交接失败不跳转 + 键盘 Enter |
| `src/composables/usePublishDrafts` 既有测试文件追加 | saveDraft 返回 `{ok, draftId}` 契约 |
| `src/views/Publish.test.js` 追加 | 载荷消费预填 / 视频模式切换 / 回写触发与跳过 / 提示条显隐 / 创作视频按钮防重入 |
