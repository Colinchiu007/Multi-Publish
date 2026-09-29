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
