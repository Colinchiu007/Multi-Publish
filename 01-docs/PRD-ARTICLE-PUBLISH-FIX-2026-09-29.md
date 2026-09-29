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
