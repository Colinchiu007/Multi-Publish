# PRD：图文发布平台修复 —— 公众号 token 链路与知乎 Draft.js 可信注入（article-publish-wechat-zhihu）

> 日期：2026-09-29 | 分支：`fix-article-publish-wechat-zhihu` | 触发场景：E2E「热门选题 → 一键发布图文」流程中 7 平台全失败，本 PR 修复其中微信公众号与知乎两个平台（其余平台状态见 §10）。

## 1. 背景与问题（实测取证）

E2E 流程（热门选题选 5 条 → 改写引擎生成 5 篇草稿 → 发布页一键发布）中，两个平台的失败根因均为代码级缺陷（非账号问题——登录态批量检测全部 `CHECK_LOGIN_SUCCESS`）：

| 平台 | 失败表象 | 第一性根因（实测取证） |
|------|---------|----------------------|
| 微信公众号 | `微信公众号登录超时，请重新登录`（误报） | 旧草稿编辑 URL `appmsg?t=media/appmsg_edit&action=edit&type=10&create=1` **不带会话 token**，被公众号后台重定向回首页；登录探测在首页文本命中「请重新登录」类字样即 fail fast。账号实际有效（首页落地 URL 含 `token=1919993708`） |
| 微信公众号（二阶） | 标题填充抛 `Illegal invocation` | `_fillInput` 的 value setter 原型选择错误：`HTMLInputElement.prototype?.set \|\| HTMLTextAreaElement.prototype?.set` 两个 descriptor 都存在、恒取 Input 的；对 TEXTAREA（v2 编辑器 `#title` 实测为 textarea）调用 Input 原型 setter 直接抛 TypeError |
| 知乎 | `zhihu: editor not loaded`（15s 超时） | `_publish_zhihu` 硬编码导航 `www.zhihu.com/creator/write`，该落地页与 `.WriteIndex-titleInput` 等选择器失配；配置里的正确 URL `zhuanlan.zhihu.com/write` 未被使用 |
| 知乎（二阶） | 文章发布成功但**内容为空** | ① 标题填充 `ti.textContent = 标题` 写在 LABEL wrapper 上（`.WriteIndex-titleInput` 实测是 LABEL，真实输入框是内部 `textarea.Input`）；② 正文填充 `_setElementContentSafe` 用 innerHTML 直写 `.DraftEditor-root`（容器非 contenteditable）——Draft.js 内部状态从未收到内容 |
| 知乎（三阶） | 验证步骤抛 `SyntaxError` | panelGone 兜底脚本在**原生 querySelector** 里用 `button:has-text("发布")`（Playwright 专属语法，原生 DOM 不支持）；且成功判定 URL 检查不含知乎文章页模式 `/p/<id>` |

## 2. 目标与非目标

**目标**：公众号与知乎的图文发布链路端到端跑通（真机验证：草稿保存 / 文章发布 + 内容完整）。

**非目标**：其余 5 平台（见 §10 状态表）；公众号群发确认（massSend 链路既有，不在本 PR 范围）；知乎发布设置面板（专栏选择等——当前默认发布即可用）。

## 3. 方案（实测取证驱动）

### 3.1 公众号：token 提取 + appmsg_edit_v2

参考产品取证（`packages/main/dist/index.cjs` 逆向）：公众号所有 `cgi-bin` 页面 URL 都携带 `token=${会话token}`，其 v2 编辑器 URL 形如 `appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${T}&lang=zh_CN`。

修复链路（`_publish_wechat_mp`）：
1. 导航 `https://mp.weixin.qq.com/`（首页）
2. 从落地 URL 提取 `token=(\d+)`；**无 token 即 fail fast**（错误信息明确指向会话失效，不再误报「登录超时」）
3. 导航 v2 编辑器 URL（带 token）
4. 既有填充/保存/群发链路不变（`#title` textarea 与 `.ProseMirror` contenteditable 实测均在 v2 页面）

### 3.2 公众号：_fillInput 原型选择修复

`rpa-view-helpers._fillInput`：value setter 按**元素 tagName** 选原型（`TEXTAREA → HTMLTextAreaElement.prototype`，其余 → `HTMLInputElement.prototype`），替换旧的 `||` 短路链。该修复对所有平台的 textarea 填充生效（通用 helper）。

### 3.3 知乎：URL + 标题 + 正文 + 验证四连修

1. **URL**：`zhuanlan.zhihu.com/write`（实测选择器全命中：`LABEL.WriteIndex-titleInput` 包 `TEXTAREA.Input` + `.public-DraftEditor-content[contenteditable]` + 发布 button）
2. **标题**：定位 wrapper **内部** textarea/input，原生 value setter + input/change 事件（React 受控组件口径）
3. **正文**：**CDP `Input.insertText` 可信注入**（新 helper `_insertTextTrusted`）：
   - 实测取证：Draft.js 不接受 innerHTML 直写（框架状态为空）；execCommand insertText 插入的是游离文本节点（childCount 0、无 `[data-block]` 块结构）；合成 paste/KeyboardEvent 不被信任；**本机 Electron WebContentsView 上 `Input.dispatchKeyEvent` 完全不可达**（document 级监听 0 事件）
   - 唯一有效配方（实测）：**JS `ed.focus()` → CDP `Input.insertText`**（走浏览器输入管线，框架收到真实 beforeinput 并入状态，`[data-block]` 块出现）
   - 段落边界：Enter 键不可模拟 ⇒ 段落以 `\n` 保留在块内（contenteditable pre-wrap 渲染为换行）
   - **HTML→纯文本前置转换**：发布页编辑器是 Quill（`content-type="html"`），article.content 到达 RPA 时已被规范化为 `<p>…</p>`；Draft.js 是纯文本编辑器，注入前在页面内用 DOMParser 转纯文本（`<p>` 段落 → `\n\n` 分隔）
   - 失败回退：可信注入失败时回退 innerHTML（不静默丢内容）
4. **验证**：成功判定 URL 增加 `/\/p\/\d+/`（知乎文章页模式）；panelGone 兜底改 `querySelectorAll` 文本匹配（禁 `:has-text`）

## 4. 数据校验

| 校验点 | 规则 | 失败行为 |
|--------|------|---------|
| 公众号 token 提取 | 首页落地 URL 必须匹配 `/token=(\d+)/` | fail fast，错误「微信公众号会话 token 获取失败，请重新登录」 |
| 知乎 HTML 转换输入 | `article.content` 字符串；含 `<[a-z]` 判 HTML 走 DOMParser，否则原样 | DOMParser 异常时降级正则剥标签 |
| `_insertTextTrusted` 入参 | 非空字符串（空串直接 false） | 调用方回退 innerHTML |
| 知乎标题填充 | wrapper 内 textarea/input 存在 | 返回 false（脚本内），主流程继续（标题缺失不阻断发布） |

## 5. 流程（修复后）

```
公众号：首页(5s) → 提取 token → v2编辑器(5s) → 登录探测 → 填标题(#title textarea)
  → 填正文(.ProseMirror) → [摘要/评论开关] → 勾协议 → 保存草稿 → 提取 mediaId → [群发]
知乎：zhuanlan.zhihu.com/write → 等标题框(15s) → 等正文编辑器(10s) → 填标题(原生setter)
  → HTML→纯文本(DOMParser) → focus编辑器 → CDP insertText → 点发布 → URL含/p/<id>即成功
```

## 6. 交互逻辑与显示项

- 发布进度面板（既有）：阶段文案「navigating to draft...」「filling title...」「filling content...」「publishing...」「verifying...」不变
- 新增日志（主进程）：`CDP insertText: N chars`（注入量）、`[wechat_mp] session token not found in home url=...`（token 失败取证）
- 用户可见错误信息：公众号 token 失败 →「微信公众号会话 token 获取失败，请重新登录」（区分于旧的误报「登录超时」）

## 7. 验收标准（全部真机实测通过）

1. ✅ 公众号草稿保存成功：`appmsgid=100000013`（第 3 次实测，前两次 100000011/12）
2. ✅ 知乎文章发布成功：`zhuanlan.zhihu.com/p/2088269867753459986`（第 3 次）
3. ✅ 知乎文章内容完整：标题「仅退款把商家逼成什么程度了」+ 正文 1078 字符、**无 `<p>` 标签**、含 6 个换行（段落分隔保留）
4. ✅ 发布历史记录 status=success（含 URL）
5. ✅ 单测 55/55 绿（含 8 个新增回归锁用例）

## 8. 测试策略

- **单元（rpa-view-platforms.test.js +8 用例）**：公众号 token 提取/无 token fail fast/导航次数（2 次）；知乎 URL/标题原生 setter/编辑器等待选择器/可信注入主路径/注入失败回退/`/p/` URL 模式/panelGone 无 `:has-text`
- **结构锁（同文件）**：`_fillInput` 必须按 tagName 选原型（反证旧 `||` 短路链不得回归）
- **真机 E2E**：CDP 驱动已启动应用（`--remote-debugging-port`）走完整发布流程，验证历史记录与文章内容（本 PR 的验收证据）

## 9. 已知限制

- 知乎段落为单块内 `\n` 分隔（Enter 键模拟在本机 Electron WebContentsView 上不可达——`Input.dispatchKeyEvent` 事件不达页面，实测 document 级监听 0 事件）；pre-wrap 渲染为换行，视觉等效多段
- 公众号为**草稿保存**（既有语义：`massSend` 默认 false；群发需用户显式开启——平台合规要求）
- 知乎发布设置面板（专栏/话题/封面）未配置，走默认值

## 10. 其余平台状态（本 PR 不含，供规划）

| 平台 | 状态 | 根因/阻塞 |
|------|------|----------|
| 今日头条 | ❌ 账号级阻塞 | 账号「观四方」未完善信息，发布权限被平台锁定（「请完善账号信息，解锁发布文章、视频等权益功能」）——需用户在平台侧完善，代码无法修复 |
| 小红书 | ⏳ 待开发 | 图文需图片：URL 已取证（`publish/publish?from=menu` + 点「上传图文」tab）；需图片生成 + 上传链路 |
| 快手 | ⏳ 待开发 | 图文需图片：URL 已取证（`tabType=2` 直达图文上传区，支持 31 张图） |
| 抖音 | ⏳ 待开发 | 图文需图片：URL 已取证（`upload?default-tab=3`） |
| B站 | ⏳ 待开发 | API 模式按视频处理（无视频文件即失败）；文章需专栏 API |
| 视频号 | ❌ 登录过期 | 账号 expired，需重新扫码登录 |

## 11. 决策记录

- **为何用 CDP insertText 而非 API 直发**：参考产品走 API（需逆向各平台签名：msToken/a_bogus/__NS_sig3 等，维护成本高且随平台改版漂移）；本仓 RPA 架构下可信输入注入是框架编辑器（Draft.js/ProseMirror/Quill）唯一可靠通道，且与既有 `_setFileInput` 的 CDP debugger 先例同构
- **为何 HTML→纯文本在页面内做（DOMParser）**：转换需要浏览器 DOM 解析语义（`<p>` 段落 → 块级分隔）；主进程做正则剥标签会丢段落结构

---

## §16 一键发布图文全链路（热门选题 → 改写 → 多平台发布）

> 本节由 2026-10-01 的 CDP E2E 实跑补齐，覆盖**流程 / 数据校验 / 功能逻辑 / 交互逻辑 / 显示项 / 提示文字**。

### 16.1 全链路流程（每一步均已实测）

| # | 页面/路由 | 用户动作 | 系统行为 | 实测读数 |
|---|----------|---------|---------|---------|
| 1 | `#/hot-topics` | 勾选选题 | 列表项复选框写入已选集合 | `picked:5` |
| 2 | `#/hot-topics` | 点「创作文案」 | **跳转改写页**，带 `topic` 查询参数 | → `#/rewrite?topic=<选题>` |
| 3 | `#/rewrite` | 点「🔄 开始改写」 | 调用改写引擎；先清空旧正文，再流式产出 | 10s 清空 → **20s 得正文 1210 字** |
| 4 | `#/rewrite` | 点「🚀 去发布」 | **改写内容落草稿箱**，弹出下一步选择 | 弹窗文案见 16.4 |
| 5 | 弹窗 | 点「🖼️ 直接发图文」 | 打开图文发布页并**自动填入标题与正文** | → `#/publish?draft=<draftId>`；`editLen:1210` |
| 6 | `#/publish` | 点「🚀 一键发布」 | 依次执行**多道校验**（见 16.2），全部通过才提交 | 见 16.2 |
| 7 | 提交 | — | 逐平台入队，`taskQueue.add()` | 主进程历史出现 success/failed 记录 |

**关键设计点**：第 5 步的"自动填入"依赖 `draft` 参数；改写结果**先落草稿箱**再进发布页，
因此"去发布"**不是**直接跳发布页，而是先让用户选择载体（图文 / 视频）。

### 16.2 提交前的校验链（按执行顺序）

| 序 | 校验 | 实现位置 | 失败表现 | 提示文字 |
|----|------|---------|---------|---------|
| 1 | 账号有效性 | `usePublishFlow` → `accountInvalid` | 阻断 | 「账号无效」 |
| 2 | 发布目标（平台/账号） | `validatePublishTargets` → `targetInvalid` | 阻断 | `targetCheck.message` |
| 3 | 元数据（标题/封面等） | `validatePublishMetadata` → `metadataInvalid` | 阻断 | `metadataCheck.message` |
| 4 | **平台内容长度** | `validatePlatformContent` → `contentInvalid` | **可自动裁剪**（见 16.3） | 形如「**快手正文最多 1000 个字符（标题计入首行），当前 1021 个**」 |
| 5 | **敏感词** | `sensitiveCheck` → 确认弹窗 | **需用户决策** | 「发布内容包含敏感词：<词>，是否仍然发布？」+「修改 / 强制发布」 |

**长度口径**：`getPlatformContentLimit(platform)` 来自发布能力注册表；
- **有标题平台**（`titleMax > 0`，如抖音 55）：正文上限即 `contentMax`；
- **无标题平台**（`titleMax === 0`，如快手/微博）：标题由 `composeNoTitleDescription` **合并为描述首行**，
  故校验的是**合并后**的长度 ⇒ 正文可用预算 = `contentMax - 标题长度`。

### 16.3 正文超限自动裁剪（2026-10-01 新增）

**背景**：改写引擎产物常见 1200+ 字，而抖音/小红书/快手正文上限均为 1000 字。
修复前仅「百家号标题」会自动截断，正文超限一律阻断 ⇒ 长文场景下「热门选题→改写→一键发布」**必然失败**。

**规则（与百家号标题同策略）**：
1. 内容校验失败且 `field === "content"` 且 `limit > 0` ⇒ **自动裁剪**而非阻断；
2. 裁剪调用 `truncateContentForPlatform(platform, content, title)`，
   **同源复用** `getPlatformContentLimit` + `isNoTitlePlatform`，禁止另写标题合并口径；
3. 无标题平台**必须扣除标题长度**（否则出现"裁到 1000 仍报 1021"的漂移，实测踩到）；
4. 按 **Unicode 码点**裁剪，避免切碎 emoji 等代理对；
5. 裁剪后**统一重新校验**（`recheck`），仍不通过则照旧提示并阻断。

**提示文字**（新增 i18n key `publishPage.publishFlow.contentAutoTruncated`，zh/en 成对）：
- zh：「正文超出平台上限，已自动裁剪（{before} → {after} 字）」
- en：「Content exceeded the platform limit and was auto-truncated ({before} → {after} chars)」

### 16.4 交互与显示项

| 界面元素 | 文案/标识 | 说明 |
|---------|----------|------|
| 热门选题页标题 | 「热门选题」 | 副标题：「多渠道热门选题聚合，一键创作文案或批量发布」 |
| 分类页签 | 全部 / 综合 / 社会 / 财经 / 科技 / 娱乐 / 体育 / 情感 / 教育 / 健康 / 国际 | 带条数角标，如「综合231」 |
| 已选计数 | 「已选 N 条」 | 选择态实时更新 |
| 选项开关 | 「结合爆款库」 | 复选框 `coral-check`，父级 `hot-viral-toggle` |
| 主操作 | 「创作文案」 / 「一键发布」 | 选题页右侧操作区 |
| 改写页模式 | 「智能仿写」/「扩写爆款」/「选题创作」 | 三种改写模式 |
| 改写页操作 | 「🔄 开始改写」「📋 复制」「💾 存入草稿」「🎬 视频创作」「🚀 去发布」 | — |
| 去发布弹窗 | 「改写内容已存入草稿箱，请选择下一步操作」 | 选项：「🖼️ 直接发图文…」「生成视频…」 |
| 发布页操作 | 「💾 保存草稿」「📋 草稿箱」「🚀 一键发布」 | 提交按钮为 `.ui-btn-primary` |
| 发布进度面板 | 「发布进度」「进行中 成功 x/y · z 个失败」「重试失败项(n)」「取消全部任务」 | 常驻底部 |

**⚠️ 已知 UI 陷阱（E2E/自动化必读）**：
- 发布页存在**页面标题 `DIV.page-title` 文本也是「一键发布」**，按文本模糊匹配会点到标题；
  正确选择器：`button.ui-btn-primary` 且文本含「一键发布」。
- 应用自身 UI 为 **Vue 3**（发布页全部 button 无 React 属性），**React fiber 探针不适用**；
  头条等**平台页**才是 React（可用 fiber 读 props）。

### 16.5 已知 UX 缺陷与待改进（本轮记录）

1. **校验反馈仅 toast，几秒即消失**：长文提交失败时只弹一条 toast，用户极易错过并误判"按钮没反应"
   （E2E 实测连续 3 轮误判）。**建议**：失败时在**发布按钮旁常驻**错误文案，直到内容被修正。
2. **多平台上限不一致**：当前对"首个超限平台"裁剪，若其余平台上限更小会再次提示。
   **建议**：一次性按**所有选中平台的最小预算**裁剪，避免多轮。
3. **自动裁剪会丢内容**：若产品不接受，备选方案是"常驻错误 + 用户手动裁剪"。

### 16.6 验收标准（可验证）

- [x] 热门选题页可选中最新 N 条（`.topic-check`），并显示「已选 N 条」；
- [x] 「创作文案」跳转 `#/rewrite?topic=<选题>`；
- [x] 「开始改写」可产出正文（实测 20s / 1210 字）；
- [x] 「去发布」→「直接发图文」跳 `#/publish?draft=…` 且标题/正文自动填入；
- [x] 长文提交时**自动裁剪并提示**，不再直接阻断；
- [x] 敏感词走确认弹窗（「修改 / 强制发布」）；
- [x] 提交后主进程队列产生任务，且可观测 success/failed 终态；
- [ ] 5 条选题批量产出 5 篇（循环步骤 2-5）——**待实现/待验证**。

#### §16.3.1 裁剪口径的两处实测修正（2026-10-01，真机回归逐步逼近）

第一版实现后，真机回归**连续暴露两处口径错误**，逐条记录以免重犯：

| 版本 | 裁剪依据 | 裁剪后正文 | 快手校验报错 | 差距 |
|------|---------|-----------|-------------|------|
| v0（修复前） | 不裁剪，直接阻断 | 1210 | 当前 1238 个 | 超 238 |
| v1 | `contentMax`（1000） | 997 | 当前 1021 个 | 超 21 —— **漏扣标题** |
| v2 | `contentMax − title.length` | 977 | 当前 1001 个 | 超 1 —— **漏扣换行符** |
| **v3（当前）** | `contentMax − (标题 + 换行)` | **976** | 恰好 1000 | ✅ |

**修正一：无标题平台必须扣除标题长度。**
`titleMax === 0` 的平台（快手/微博等）会把标题经 `composeNoTitleDescription` **并入描述首行**，
校验的是合并后的长度；只裁正文会差出整个标题的长度。

**修正二：还必须扣除 `composeNoTitleDescription` 的换行分隔符。**
该函数实现为：
```js
const composed = [title, content].map(v => v.trim()).filter(v => v.length > 0).join('\n')
```
即标题与正文之间**恒有 1 个 `\n`**（两者都非空时）⇒ 实际长度 = `标题 + 1 + 正文`。

**修正三：按「所有选中平台的最小预算」一次性裁剪，而非"首个超限平台"。**
否则出现多轮反复：首发超限平台可能是有标题的小红书（裁到 1000），
重校验后轮到无标题的快手（仍超）。
实现为 `minContentBudget(platforms, title)`：遍历选中平台取最小可用预算（去重；上限 0 的平台忽略；
全为 0 时返回 `null` 表示无需裁剪）。

**关键实现约束（同源原则）**：
裁剪**不得手写** `+1` 或自行拼标题 —— 必须通过内部函数 `noTitleOverhead(platform, title)`
**直接调用 `composeNoTitleDescription` 计算真实开销**：
```js
function noTitleOverhead (platform, title) {
  if (!isNoTitlePlatform(platform)) return 0
  const t = String(title ?? '').trim()
  return t ? Array.from(composeNoTitleDescription(t, 'x')).length - 1 : 0   // 减占位符本身
}
```
这样若未来 `composeNoTitleDescription` 改为 `join('\n\n')` 或加入前缀标记，
**校验与裁剪会同时自动适配**；手写常量则会在无人察觉时漂移。
（同源于仓库既有规范"禁止第二份标题合并实现"。）

**回归保护（单测，`publish-contract.test.js`）**：
- `truncateContentForPlatform('kuaishou', 1200 字, 20 字标题)` ⇒ **979**；
- 合并后 `20 + 1 + 979 = 1000` **恰好等于上限**（不越界也不浪费）；
- `minContentBudget(['kuaishou', 'douyin'], 20 字标题)` ⇒ **979**（取最小）；
- 标题为空 ⇒ 开销 0（`filter` 会剔除空段，无分隔符）；
- 按 Unicode 码点裁剪，emoji 不被切碎。

**踩坑记录（工程视角）**：这两处错误都**不是**靠阅读代码发现的，而是靠
**真机回归读数逐步逼近**（997 → 977 → 976）。这说明：
> 与外部系统（平台校验）耦合的口径，**必须用真实读数收敛**，单元测试只能锁定已知口径。
