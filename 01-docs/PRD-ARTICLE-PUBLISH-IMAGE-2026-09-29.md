# PRD：图文发布图片链路 —— 本地封面生成 + 自动附图 + 图片上传（image-platforms，2026-09-29）

> 日期：2026-09-29 | 分支：`fix-article-publish-image-platforms` | 触发：E2E「热门选题 → 一键发布图文」流程，小红书/快手/抖音图文发布要求至少 1 张图片，此前无图即失败。

## 1. 背景与问题

E2E 全流程已跑通微信公众号（草稿保存）+ 知乎（文章发布，PR #2647），但**图文平台**（小红书/快手/抖音）发布失败，根因是**发布链路缺图片**：

| 平台 | 失败表象 | 第一性根因 |
|------|---------|----------|
| 小红书 | publish 页默认落「上传视频」tab，file input accept 全视频格式 | 无图文 URL 选择 + 无 tab 切换 + 无图片上传 |
| 快手 | tabType=2 页面有 2 个 file input（视频 tab + 图文 tab），首个恒为视频通道 | generic 流程选错 input + 未接入双入口 URL |
| 抖音 | upload?default-tab=3 图片发布表单，但无图片上传 | 硬编码视频 URL + 无图片分支 |
| 三平台共性 | 草稿无图（改写引擎只出文本）| 无自动封面生成，用户须手动附一张图才能发 |

**核心约束**：图文平台强制要求 ≥1 张图片。要让「一键发布图文」在这些平台可用，必须在**发布链路内自动生成封面**（AI 生图优先，无 provider 时本地标题卡兜底），并自动上传。

## 2. 目标与非目标

**目标**：发布到图文平台（小红书/快手/抖音）时，无图自动生成封面 + 选择正确图文 URL/tab + 上传图片，链路端到端打通。

**非目标**：多图上传（快手 31 张——本轮只传首图，文档标注为后续迭代）；B站专栏 API、头条账号级阻塞、视频号登录过期（见 §10 状态表）。

## 3. 方案

### 3.1 本地封面生成器（local-cover-generator.js）

**为何本地生成**：cc-switch 本地代理的 `/images/generations` 端点 404（上游「天翼云」无生图模型），无 AI 生图 provider 配置。用 **SVG（标题文字+渐变背景）→ sharp → PNG** 产出标题卡封面，零生图模型、零新增依赖（sharp 已在 packages/shared-utils 依赖）。

**数据校验**：
| 校验点 | 规则 | 失败行为 |
|--------|------|---------|
| 标题折行 | 每行 ≤12 字（CJK 宽度近似），最多 5 行 | 超 60 字截断加省略号 |
| 比例 | 白名单 [3:4,16:9,1:1,4:3,9:16] | 非法值回退 3:4（竖版 1080x1440） |
| SVG 注入 | 标题用户内容，escapeXml 转义 | 防 SVG 标记注入 |
| 输出 | os.tmpdir()/multi-publish-cover-local/<时间戳>-<随机>.png | 与 AI 封面目录区分 |

**接口**：`generateLocalCover(title, { outputDir, ratio }) → { code:0, data:{ path } }`。

### 3.2 cover:generate-ai 兜底（ipc-handlers/publish.js）

`cover:generate-ai` 在 assetGenerator（AI 生图）**未注入**或**生成失败**时，回退 `generateLocalCover`。返回契约不变（`{ code:0, data:{ coverPath } }`），message 标注「本地封面生成成功（AI 生图不可用，已用标题卡兜底）」。

### 3.3 渲染端自动附图（usePublishFlow.js）

`IMAGE_TEXT_PLATFORMS = ['xiaohongshu','kuaishou','douyin']`。handlePublish 在敏感词预检后、buildArticleData 前：
- 若选中平台含图文平台 **且** 无图（image_files/images 空）**且** 标题非空 → 调 `generateAiCover({ prompt: title, ratio:'3:4' })`
- 成功 → `article.image_files = [coverFile]` + `article.images = [coverFile.path]`（附加进表单，用户可见、透明）
- 失败 → 不阻断（无图平台照常发，图片平台引擎层如实报错）

**交互逻辑**：进度时间线显示「🖼️ 图文平台需要图片，正在自动生成封面...」→「✓ 封面已生成并附加到内容」。

### 3.4 Router 图片透传（publisher-router.js buildPublishArticle）

**Bug 修复**：旧实现只传 `images: processed.images`（RichTextProcessor 从 HTML 内容提取的 URL），渲染层附加的本地封面 `article.images` 被静默丢弃。修复：`article.images`（本地文件路径）优先透传（`resolved.base.images`，映射为 String），否则保持 processed.images 语义。

### 3.5 RPA 图片上传 + 平台 URL/tab（rpa-view-platforms.js）

**generic 流程图片上传**：在视频上传段前，若 `!video_path && images.length>0 && file_input` → `_resolveSelector` 定位 → `_setFileInput(images[0])` → 等表单就绪。

**双入口 URL**（`getPublishUrl`，来自 `packages/api-publish-engine/src/platform-entries.js`，参考产品取证集成）：
| 平台 | 视频 URL | 图文 URL |
|------|---------|---------|
| 小红书 | publish/publish?from=menu&target=video | publish/publish?from=menu |
| 快手 | tabType=1 | tabType=2 |
| 抖音 | content/upload | content/upload?default-tab=3 |

**平台专用流程**：
- `_publish_xiaohongshu`：图文模式加 `preFill: 'switchImageTab'`
- `_publish_kuaishou`（新增）：按 contentType 选 URL；图文模式覆盖 file_input 为 `['input[type=file][accept*=image]', 'input[type=file]']`（实测 tabType=2 页面首个 input 是视频通道）
- `_publish_douyin`：按 isImageMode 选 URL；图片上传后加表单就绪等待（`input[placeholder*=标题],[contenteditable],textarea`，30s）——实测教训：上传后 7ms 即填字段全部落空，页面还在切换、发布按钮 disabled → 超时

**switchImageTab hook**（新增）：小红书 `.header-tabs` 容器加载慢（实测 10s 后渲染），先 `_waitForElement('.header-tabs,.creator-tab', 20s)` 再按文字「图文」点击（比 children[1] 抗改版）。

## 4. 流程（修复后）

```
渲染端：handlePublish → [图文平台无图] → generateAiCover(AI)→[失败]→generateLocalCover(SVG→sharp→PNG)
  → article.images=[coverPath] → buildArticleData → publish:batch IPC
主进程：publish.js cover:generate-ai(assetGenerator 优先, 本地兜底) → publisher-router(buildPublishArticle 透传 images)
RPA：   _publish_xiaohongshu(切图文tab+传图) / _publish_kuaishou(tabType=2+传图)
        / _publish_douyin(default-tab=3+等表单+传图)
```

## 5. 验收标准（实测）

1. ✅ 封面自动生成：时间线「🖼️ 图文平台需要图片，正在自动生成封面...」→「✓ 封面已生成并附加到内容」
2. ✅ 快手图片上传成功：`RpaView CDP file: img_<hash>.png`（09:12:50 实测）
3. ✅ 抖音图文 URL：导航到 `content/upload?default-tab=3`，图片上传后页面切到 `content/post/image?...&media_type=image&type=new`（发布表单）
4. ✅ 小红书图文 tab：switchImageTab 点击「上传图文」后 file input accept 变为 `.jpg,.jpeg,.png,.webp`
5. ✅ 单测：rpa-view-platforms.test.js +8（50/50）/ publisher-router.test.js +2（59/59）/ local-cover-generator.test.js +6（6/6）/ publish.test.js +2（33/33）/ usePublishFlow.test.js（64/64）= 212/212
6. ✅ QM-1 打包：verify-worktree-deps + build:dir 通过

## 6. 已知限制（下一轮）

- **多图上传**：快手支持 31 张，本轮只传首图；多图需逐张等上传完成
- **小红书发布验证**：已完成 tab 切换+传图，表单填充待编辑器渲染后取证（无图时发布前表单为空）
- **抖音发布验证**：图片上传+表单切页成功，发布按钮点击/验证等待待取证（API `aweme/create_v2` 响应模式）
- **B站/头条/视频号**：见 §10

## 7. 决策记录

- **本地标题卡 vs 生图 API**：本机 cc-switch 代理无生图端点（上游 404）；本地标题卡零成本、可离线、可复现，保证「一键发布图文」在无生图 provider 时仍可用。
- **AI 生图优先 + 本地兜底**：用户配好生图 provider 后封面更精美；未配时本地兜底不阻断链路。
- **图片透传优先级**：article.images（本地路径）覆盖 processed.images（内容 URL）——上传消费需要文件路径。

## 8. 测试策略

- 单元（TDD RED→GREEN）：local-cover-generator（sharp 真实渲染校验 PNG 尺寸）、publish.test（本地兜底）、publisher-router.test（images 透传）、rpa-view-platforms（图文 URL/上传/tab），usePublishFlow（自动附图）
- 真机 E2E（CDP）：封面生成 + 快手 CDP file 上传实测

## 9. 后续迭代（下一轮）

1. 小红书正文/标题 editor 选择器取证 + 发布按钮确认
2. 抖音发布按钮 + API 响应验证（aweme/create_v2）
3. 快手图片表单（work-description-edit）取证
4. 多图上传（当前仅首图）
5. B站专栏 API 模式；头条通知用户完善账号；视频号重新扫码

## 10. 其余平台状态表（全目标视角）

| 平台 | 状态 | 根因/阻塞 |
|------|------|----------|
| 微信公众号 | ✅ 草稿保存（PR #2647） | appmsgid=100000013 |
| 知乎 | ✅ 文章发布（PR #2647） | /p/2088269867753459986，1078 字纯文本 |
| **小红书** | ✅ **图文落草稿箱**（本轮） | 草稿箱计数 0→1 实测；发布按钮由用户扫码后自行点 |
| 快手 | ⏳ tabType=2+CDP 传图成功，发布验证待续 | 图片上传后表单未出现（DOM 取证） |
| 抖音 | ⏳ default-tab=3+表单切页成功，发布验证待续 | 发布按钮/API 响应取证 |
| 今日头条 | ❌ 账号级阻塞 | 「请完善账号信息」平台锁定（代码无法修） |
| B站 | ⏳ 待开发 | API 模式按视频处理，文章需专栏 API |
| 视频号 | ❌ 登录过期 | 需重新扫码 |

## 11. 小红书图文「草稿箱模式」（2026-09-29 需求调整）

**需求**：小红书图文不必走到完全发布，只需把内容（标题 + 正文 + 图片）存进平台草稿箱，
用户回头在草稿箱里自行确认后发布。视频模式保持原发布链路。

**为何需要独立模式**（真机取证的三个硬阻塞）：
1. 小红书发布按钮不是标准 `<button>`：页面上唯一的「发布」文本节点在底栏，形如
   `span` 文本「发 布」（中间带空格）——参考产品的 `baseStartPush` 专门为此列了
   `span` "发 布" 变体。`button:has-text("发布")` 必然超时。
2. 图片上传成功后平台**自动进入「图片编辑」（裁剪）界面**，其模态层压住发布按钮
   （实测 body 文本含「图片编辑 裁剪 模版 贴纸 文字 滤镜 比例 … 裁剪设置 … 完成」）。
3. 发布后需扫码/验证等人工环节，自动化到「已发布」不可靠。

**实现**：
| 环节 | 行为 |
|------|------|
| 触发条件 | `_publish_xiaohongshu` 在**图文模式**（无 `video_path`）传 `draftOnly: true`；视频模式不带 |
| 图片上传后 | 调 `_dismissImageEditModal`：检测「裁剪设置/可缩放图片/图片编辑」文本 → 点「完成」收起（回退 取消/关闭/×） |
| 草稿落库 | generic 的 `draftOnly` 分支：**跳过发布按钮查找**；若平台提供显式存草稿钮（`sel.draft_btn`）则点它，否则等自动草稿保存（小红书编辑页显示「编辑于 刚刚」，侧边栏草稿箱计数 +1） |
| 成功判据 | `_waitForCondition` 命中 `/编辑于|已保存|草稿/`（20s 预算）+ 3s 落库等待；返回 `{ success:true, draft:true, draftSaved:true }` |
| 进度文案 | 「saving draft...」→「draft saved」 |

**验收（真机实测）**：
- 发布历史：`platform=xiaohongshu, status=success`，时间线「发布完成：1 个平台全部成功」（15 秒）
- 主进程日志：`DIAG[publish2] … draftOnly=true` → `saving draft...` → `draft-only done saved=true` → `publish done … draft=true`
- **草稿箱计数 0 → 1**（`草稿箱(1)`，用户视角可复核）
- 单测：232/232 绿；LEDGER 行数门禁 ✅（1400 行）

**残余（非阻塞）**：`_dismissImageEditModal` 实测返回 `MODAL_NO_CLOSE`（该弹窗的「完成」
不是 `button/div/span` 的纯文本节点，或位于 shadow/iframe 内）——因草稿模式不点发布，
弹窗不阻塞落库；若将来要做「直接发布」，需重新取证该弹窗的关闭控件。

## 12. 快手 / 抖音图文「真实发布」（2026-09-30）

**需求口径**：除小红书外，其他平台的发布必须是**真实发布**（小红书按用户指定只落草稿箱）。

### 12.1 最终状态（真机 E2E）

| 平台 | 状态 | 成功信号 | 证据 |
|------|------|---------|------|
| 微信公众号 | ✅ 草稿保存 | appmsgid 递增 | appmsgid=100000013 |
| 知乎 | ✅ 文章发布 | URL `/p/\d+` | /p/2088269867753459986 |
| 小红书 | ✅ 草稿箱（用户指定） | 草稿箱计数 +1 | 0→1 复核 |
| **快手** | ✅ **真实发布** | URL `from=publish` | manage/video?status=2&from=publish |
| **抖音** | ✅ **真实发布** | API `aweme/create` 响应 | 日志 `API success` |

### 12.2 快手：五项根因与处置

| # | 根因（真机取证） | 处置 |
|---|-----------------|------|
| 1 | 图文上传区 `input[type=file]` **两条注入路径都失效**：CDP `DOM.setFileInputFiles` 不抛错但文件被框架清空（回读 `files.length===0`）；直接赋 `DataTransfer` 也立即归零 | 新增 `_dropFilesToDragArea`：向拖拽容器（`#rc-tabs-0-panel-2 div[class^="_dragger-content_"]`）派发 `DragEvent('drop')`——参考产品 `kuaishouImageRun` 同款。generic 改为**拖拽区优先、input 回退** |
| 2 | 描述字数越界：实测计数器 **x/500**，配置 `max_content: 1000` 让合并文案（标题+正文 921 字）越界，表单红字「作品描述超过字数限制」阻断提交 | 改 `max_content: 480`（留 20 字边距：截断到 500 时平台仍显示 505/500） |
| 3 | 描述里出现 `<p>` 字面量：正文来自发布页 Quill（携带 `<p>…</p>`），而平台描述是纯文本语义 | 新增 `stripHtmlToPlainText`，块级标签收口为换行 |
| 4 | 点「发布」后弹二次确认框（「取 消 / 确 认」，另有禁用态「确定」），不点确认则永不提交 → `publish verification timeout` | 新增 `_confirmPublishDialog`：只点**可见且未禁用**的确认/确定（文本带空格「确 认」比较前剥空白） |
| 5 | 「已发布却判失败」：跳转 `manage/video?status=2&from=publish`，但图文作品列表端点与视频不同（`/rest/cp/works/v2/video/pc/photo/list` 取不到图文 ID） | 补 URL 级成功信号：命中 `from=publish` + `manage` 路径即判成功 |

### 12.3 抖音：三项根因与处置

| # | 根因（真机取证） | 处置 |
|---|-----------------|------|
| 1 | `_setFileInput` 的结果校验把「input 已从 DOM 消失」误判为失败（抖音上传后页面立刻切到 `content/post/image`，input 随之移除）→ 误触发回退 → 回退也找不到 input 而抛 `No file input found (JS fallback)` | 修正语义：`querySelector` 返回 null 记 **-1 = 页面已切换 = 上传被接受**；只有 input 仍在但 `files.length===0` 才回退 DataTransfer |
| 2 | `default-tab=3` 有时**直接落 `content/post/image` 编辑页**（`enter_from=publish_page&type=new`，RPA 持久分区带历史状态时更常见），上传页 `input[type=file]` 已不在 DOM，旧实现等 15s 超时即放弃 | 三通道兜底：① 上传页 file input → ② 编辑页「继续添加/添加图片」触发的 input → ③ 重新导航回上传页再注入 |
| 3 | `content/post/image` 编辑页**没有独立标题输入框**（只有「作品描述」contenteditable，计数器 0/20 与 0/1000），旧实现找 `input[placeholder*=标题]` 抛 `input not found` | 图文模式标题合并进描述首行（与快手同口径）；视频模式保持原独立标题填充 |

### 12.4 交互与提示（用户可见）

- 进度阶段：`uploading image...` → `image uploaded` → `filling desc...` → `publishing...` →（抖音）`API success`
- 快手描述超限时，平台表单会显示红字「作品描述超过字数限制」——本地已在 480 字处截断，不再触达该错误
- 发布历史记录 `status=success` 并带平台回传 URL（快手为 manage 页、抖音为编辑页 URL）

### 12.5 行数门禁（工程治理）

- 两次拆分确保 `rpa-view-platforms.js` 落在 `limit 500 + growthAllowance 200 = 1415` 内：
  ① `rpa-publish-id-extract.js`（publish-id 纯函数）② `rpa-view-navigation-helpers.js`（导航/等待/确认弹窗 + artifact 查询族）
- 最终主文件 1324 行；含 artifact 族（`_queryBaijiahaoArtifact` / `_parseKuaishouArtifact` / `_findKuaishouArtifact` / `_findPublishedArtifact` + `parseKuaishouArtifactEvidence`）的迁移

## 13. 头条图文链路 + 通用发布确认弹窗（2026-09-30）

### 13.1 头条图文四项根因与处置（全部真机取证）

| # | 根因 | 证据 | 处置 |
|---|------|------|------|
| 1 | **双入口缺失 ⇒ 静默回退根地址** | `imagePublishUrls` 无 toutiao ⇒ `getPublishUrl("toutiao","image")` 返回 null ⇒ 回退 `config.publish_url = https://mp.toutiao.com/`（首页）；日志 `no title_input nor editor candidate` + `content editor not found among 4 candidates` + `publish btn not found` | `platform-entries.js` 补 `toutiao: /profile_v4/graphic/publish`、`bilibili: /platform/upload/text/edit` |
| 2 | **选择器与真实 DOM 失配** | 标题实为 `TEXTAREA[placeholder="请输入文章标题（2～30个字）"]`（w=650 h=36）；正文实为 `DIV.ProseMirror`（w=854 h=500，其 contenteditable 值非字面 `true`）；发布钮为 `预览并发布` | `platform-selectors.js` 三项更新（标题/正文/发布），正文把通用 contenteditable 放宽为属性存在选择器 |
| 3 | **正文 HTML 字面量** | ProseMirror 走 `_fillInput` 的 focus + `execCommand("insertText")` **纯文本**通道（框架编辑器不接受 innerHTML 直写），Quill 把草稿规范化为 `<p>…</p>` ⇒ 标签变内容 | `_publish_toutiao` 注入前 `stripHtmlToPlainText(article.content)`（该函数由 navigation-helpers 导出） |
| 4 | **「展示封面」必填未满足** | 封面标签带 `*`；页面**默认选「单图」但封面区为空**（`fileInputs=0`，封面区仅 `+` 占位）⇒ 点发布被校验挡住 | 新增 `uploadCover` hook：主路径传封面图（`hookContext.coverPath`，点 `.article-cover` 唤起 file input）；拿不到入口时按文本点 `label.byte-radio` 选「无封面」 |

**第四项的组件层教训**：封面三选一是 byte-design 的 `LABEL.byte-radio`（内部 input 为隐藏态，`input.closest("label")` 取到的是**外层** label）。
**直接改 `input.checked` 对 React 受控组件无效**——实测返回 `SELECTED` 但页面仍显示「单图」（属性变了、框架状态没变）。正解是**按文本点 `label.byte-radio`**，实测 `picked=无封面` 生效。

### 13.2 通用发布确认弹窗合同（`_confirmPublishDialog`）

**需求**：多平台在「发布」点击后会插入二次确认层；不点确认则永不提交，表现为 `publish verification timeout`。各平台确认层形态不一（快手的「取 消 / 确 认」、头条的**预览弹窗**）。

**合同（按优先级）**：

| 优先级 | 作用域 | 匹配文案（剥空白后精确等值） | 说明 |
|-------|--------|---------------------------|------|
| ① | **可见的** `[class*=modal\|dialog\|drawer]`、`[role=dialog]` **内部** | 确认 / 确定 / 确认发布 / 发布 / 立即发布 / 发布文章 | 限定作用域是**硬要求**：主页面也存在同名主发布按钮，全局匹配会**重复触发发布** |
| ② | 全局回退 | 确认 / 确定 | 覆盖无 modal 结构的平台（快手既有语义不变） |

**附加合同**：
- **轮询**：弹窗内容异步渲染，最多 5 次 × 2s；首次返回即记录 `confirm dialog probe:` 便于排障。
- **只点可见且未禁用**：`offsetParent` 非空、`!disabled`、`getClientRects().length > 0`。页面常并存**禁用态同名按钮**（如快手公告里的「确定」`d=true`），不过滤会误点。
- **文本比较前统一剥空白**：平台文案可能带空格（「确 认」「发 布」）。
- **诊断**：`MODAL_NO_MATCH` 时输出各 modal 的截断文本 + 可点按钮文案（≤300 字符），使「弹窗在但按钮名不认识」可直接读出真实按钮名。

### 13.3 双入口契约（`getPublishUrl(platform, type)`）

| 平台 | video | image |
|------|-------|-------|
| douyin | `creator-micro/content/upload` | `.../upload?default-tab=3` |
| kuaishou | `article/publish/video?tabType=1` | `...?tabType=2` |
| xiaohongshu | `publish/publish?from=menu&target=video` | `publish/publish?from=menu` |
| bilibili | `platform/upload/video/frame` | **`platform/upload/text/edit`（专栏，本次新增）** |
| toutiao | `profile_v4/xigua/upload-video` | **`profile_v4/graphic/publish`（文章，本次新增）** |
| zhihu | `zvideo/upload-video` | `zhuanlan.zhihu.com/write` |

**数据校验**：`getPublishUrl` 未命中返回 `null`；调用方（`_publish_<platform>`）必须以 `publishUrl || config.publish_url` 兜底，且**不得**让兜底值落到平台根地址——根地址的失败症状是「所有选择器都找不到」，极难定位（本次头条即卡数轮）。

### 13.4 交互与提示（用户可见）

- 头条进度：`navigating...` → `filling title...` → `filling content...` → `publishing...` → `verifying...`
- 头条发布设置页平台侧提示：封面标签带 `*`（必填）、封面区文案「优质的封面有利于推荐，格式支持JPEG、PNG」
- 失败提示（历史记录）：`publish verification timeout` / `publish btn not found`

### 13.5 残余

1. **头条预览弹窗**：点「预览并发布」后弹预览层（日志 `modals:["预览"]`），需在层内再点提交。§13.2 的 modal 作用域 + 诊断已就位，待真机读出该按钮文案后补入匹配表。
2. **B站专栏**：入口已补（§13.3），选择器与发布链路待取证。
3. **公众号**：登录二维码由微信服务端对 Electron 断流（`ERR_CONNECTION_CLOSED`，非应用拦截/代理问题，六项假设实测排除），需改用「使用账号登录」。

## 14. 登录承载环境诊断（2026-09-30）

### 14.1 需求与现象
用户报告：账号管理中打开**微信公众号登录页**，二维码长时间加载不出来，最终显示「二维码加载失败 点击刷新」，
点击刷新无反应；**用邮箱密码登录后仍需扫码验证身份（安全保护页 `bizlogin?action=validate`），该页二维码同样加载不出**。
**关键线索：同一页面在系统浏览器中正常** —— 指向**应用环境差异**，而非服务端策略。

### 14.2 参考产品（参考产品）的关键做法
| 项 | 参考产品做法 | 出处 |
|----|-------------|------|
| 微信**登录页 URL** | `https://mp.weixin.qq.com/cgi-bin/loginpage?url=%2Fcgi-bin%2Fhome`（**专用登录页**） | `PlatformAuthorizeConfig.authorizeUrl` / `entryUrl` |
| **UA** | 显式设置且**逐平台不同**：通用 `Chrome/92.0.4515.131 … Edg/92.0.902.67`；B站 `360/4.6.9 Chrome/138` | `PCAgents` / `UserAgent` |
| **重试判定** | `isRetryableError` 区分可重试错误；`retryCondition` 条件重试 | 重试中间件 |
| B站图文 | 走 **API**（`api.bilibili.com/x/article/creative/article/submit`） | `publishBilibiliArticle` |

**实测**：采用参考产品的**登录 URL** 后，登录页**初始态恢复正常**（`failText:false`、二维码占位图已加载），
但**点「扫码登录」后仍失败** ⇒ URL 只解决初始态。

### 14.3 登录态判定（数据校验口径）
账号分区 cookie 实测 11 个（`remember_acct/mm_lang/xid/ua_id/wxuin/_clck/_clsk/uuid/noticeLoginFlag`），
**不含** `slave_sid` / `slave_user` / `bizuin` / `data_ticket` / `cert` ⇒ **账号实际未登录**。
页面上的「确认成功」是**页面提示**，不等于凭证落地。**判定登录态必须看关键 cookie，不看页面文案。**

### 14.4 九项假设实测排除
| # | 假设 | 排除证据 |
|---|------|---------|
| 1 | 系统代理拦截 | 临时禁用系统代理后仍失败（自带还原） |
| 2 | UA 字符串异常 | 覆盖为参考产品值后无改善 |
| 3 | Client Hints brands 缺失 | 覆盖为 `Google Chrome/131,Chromium/131,Not_A Brand/24` 后仍失败 |
| 4 | `window.chrome` 为空对象 | 注入 `runtime,app,csi,loadTimes` 后仍失败 |
| 5 | 应用注册请求取消 | `MP_LOGIN_NOISE_CANCEL` 默认关（守卫 + 测试锁） |
| 6 | `backgroundThrottling` | 已显式 `false` 且有结构锁 |
| 7 | `outerWidth/Height=0` | 注入修正后仍失败 |
| 8 | iframe 未加载 | `Page.getFrameTree` 子 frame 存在且 `text/html` |
| 9 | 第三方 Cookie 被阻止 | `.qq.com` 统计 cookie 可写入 |

### 14.5 网络层定位（本轮最有价值发现）
失败集中两类：
- **`localhost.weixin.qq.com:14013/14014/api/check-login` 的 CORS 预检 `ERR_CONNECTION_CLOSED`**
  （微信 PC 客户端本地探测服务；端口未监听则连接关闭，**浏览器同样失败，不足以解释差异**）；
- **`ERR_BLOCKED_BY_ORB`**（部分 `Image`/`Other` 资源）。

**成功**的请求：文档 200、`scanloginqrcode?action=getqrcode` 200、`qrconnect` 200、
`/connect/qrcode/xxx` 200（`image/jpeg`）⇒ **非全量拦截**，但页面仍判定失败并隐藏容器。

**稳定结构事实**：iframe 存在，其**直接父元素** `display:none`、祖父 `fast_login_wrp` 为 `block`
⇒ **是页面 JS 主动隐藏**；且**只有点「扫码登录」后**才失败（初始态恒正常）。

### 14.6 残余与下一步
候选差异（尚未取证）：HTTP/2 指纹、TLS 扩展顺序、`localhost` 端口访问策略、
Electron 对 `sec-fetch-dest: report` 类请求的处理。
**最快路径**：在系统浏览器打开同一登录页并 F12 复现「点扫码登录」，逐条对比失败请求；
或用仓内 Playwright Chromium 做同机同网 A/B（唯一变量为浏览器外壳）。
