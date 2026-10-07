# PRD：外链协议校验收口（href scheme guard）

- 变更 slug：`fix-href-scheme-guard`
- 日期：2026-09-29
- 类型：🐛 Bug 修复 + 🔐 安全加固（QM-5 五步全跑 + QM-6 双模型外部评审）
- 关联：`01-docs/PRD-TITLE-ASSISTANT-RELEVANCE-2026-09-28.md`（同一条数据链路上一次收口的是**相关性**，本次收口的是**协议**）

> **📌 分层补丁（2026-10-07 追加）：本文只管「协议」，不管「目的地」**
>
> 本文的 `safeHttpUrl` 是**协议**判据（`http://` / `https://` 白名单），它**不能**回答「这个链接会落到哪个页面」。
> 2026-10-07 的实测反例：`https://creator.xiaohongshu.com/…` 完全通过 `safeHttpUrl`，但它是**创作者后台**——
> 发布记录页把它当「作品链接」呈现，用户点开看到的是平台**登录页**。
>
> 因此外链判据实际是**三层**，按 sink 分工、不可互相替代：
>
> | 层 | 判据 | 回答的问题 | 落点 |
> | --- | --- | --- | --- |
> | ① 目的地语义 | `resolvePublishedContentUrl` | 这是不是该平台的**公开内容页** | `packages/shared-utils/src/published-content-url(.browser).js` |
> | ② 协议白名单 | `safeHttpUrl`（本文） | 能不能进 `href` | `packages/shared-utils/src/safe-http-url(.browser).js` |
> | ③ 主进程兜底 | `isAllowedExternalUrl` | 交给系统浏览器前再验一次（更严：`new URL()` 解析 + 协议白名单 + 拒绝 userinfo） | `apps/desktop/electron/window.js` |
>
> ① 在 ② 之前：语义不通过就不产出 URL，协议判据无从谈起。
> 详见 `01-docs/PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07.md`。

---

## 1. 背景与问题

### 1.1 现象

内容情报页 / 热榜面板 / 参考检索面板 / 发布结果回链 / 发布历史详情 / 影片工程元信息，共 **6 个渲染层位置**把外部可控的 URL 字符串直接绑到 `<a :href>`：

| # | 位置 | 绑定表达式（修复前） | 数据来源 | 可控方 |
| - | ---- | ------------------ | -------- | ------ |
| 1 | `src/views/Intelligence.vue` | `:href="item.url"` | `ContentIntelligence.search()` → Reddit / HN / GitHub | **第三方提交人**（HN `url` 字段任意填） |
| 2 | `src/components/TrendingPanel.vue` | `:href="item.url"` | `ContentIntelligence` trending → 同上 | **第三方提交人** |
| 3 | `src/components/ReferenceFinder.vue` | `:href="ref.url"` | `intelligenceFindReferences` → 第三方检索 | **第三方提交人** |
| 4 | `src/views/Publish.vue` | `:href="result.url"`（且**无** `rel="noopener"`） | 发布结果回传 | 平台侧返回值 |
| 5 | `src/views/PublishHistory.vue` | `:href="resultValue(selectedRecord,'url')"` | 历史记录持久化 | 平台侧返回值（落盘后长期驻留） |
| 6 | `src/views/FilmEngineeringView.vue` | `:href="...projectUrl"`（`el-link`） | 项目元信息 | 导入的项目数据 |

### 1.2 为什么这是真漏洞，不是理论洁癖

1. **Vue 3 不净化 href。** Vue 2 时代 `runtime-dom` 有 `isUnsafeURL` 守卫（会拒绝 `javascript:`），**v3 移除了该行为**；`:href` 绑定是原样写 attribute。
2. **本应用的渲染进程不是普通网页。** preload 暴露 `window.electronAPI`（IPC 面：账号、凭证、发布、文件系统路径等）。在渲染进程 origin 里执行任意 JS ≈ 直接调用这些受信任能力。
3. **载荷可控且无需用户被钓鱼。** 以 #1/#2/#3 为例，`content-intelligence-sources.js:92/190` 是 `url: d.url || <本站兜底>`，而 HN Algolia 的 `url` 由提交人任意填写；Reddit link post 的 `url`、GitHub 的 `html_url` 同理属外部字段。攻击者在 HN 发一条 `javascript:` 「链接」的帖子，我们的热榜/检索就会把它排版成一条**看起来完全正常**的标题链接，用户点一下就执行。
4. **`target="_blank"` 缺 `rel="noopener"`** 是同一批代码里的第二个洞（reverse tabnabbing），#4 与 #6 两处存在，本 PR 一并补。

### 1.3 根因（QM-5 第 1 步：第一性引入点）

`apps/desktop/electron/services/content-intelligence-sources.js` 自始（内容情报模块引入时）就把第三方响应的 `url` **原样透出**，渲染层照字段名直绑 href。当时的意图是"把外部内容展示出来并允许点击原文"，从未把 `url` 当作**攻击面**对待——仓里其实已经存在一份正确实现（`hot-topics/channels.js` 的 `sanitizeUrl`，注释写着「仅 http/https，其他协议返回 null」），但它（a）只在热榜解析器里用，（b）是主进程私有函数，渲染端拿不到，于是**同一个判定在仓内被写成两份、且六条展示链一份都没接**。

---

## 2. 范围

### 2.1 做什么

- 协议判定收敛为**一份共享实现**，主进程（CJS）与渲染进程（ESM 孪生）消费同一判据，由 parity 回归锁同源。
- **双档防线**：① 采集侧（主进程）在数据离开第三方响应的第一站就收口；② 渲染侧在绑定 href 之前再判一次。任何一档单独失效都不会把 `javascript:` 送进 DOM。
- 六个 `:href` 站点全部接线；不安全 URL **不产出锚点**，降级为等样式纯文本。
- 补 `rel="noopener"`。
- 加一条**全仓结构棘轮锁**（扫 `src/**/*.vue` 的所有 `:href=`），保证第七个新页面漏接时当场变红。
- 把主进程热榜侧的第二份口径收敛掉。

### 2.2 不做什么（及理由）

- **不做 URL "清洗后放行"**（剥控制字符、HTML 实体解码、自动补 `https:`）。归一化就是在给绕过面添砖；判据只做前缀白名单。
- **不改 `usePlatformIconUrl.js` 的 `isPlatformIconUrl`**。它判的是**图标资源**，口径本就必须允许 `data:` 与相对路径；与"可点击导航链接"是两个不同的问题，强行合并会让图标功能退化。已在代码注释与本 PRD 里显式声明二者不是同一口径。
- **不动 webview/Electron 层的导航拦截**。实测这一层**已经有守卫**（见 §5.1 的三种策略对照），`setWindowOpenHandler` / `will-navigate` 走 `window.js` 的 `isAllowedExternalUrl`，策略比本 PR 的判据**更严**。本 PR 只补"渲染层把数据渲染成可点击锚点"这条此前无人守的链；其余未覆盖 sink 列在 §10。
- **不把 `isAllowedExternalUrl` 合并进来**。它额外拒绝带 userinfo 的 URL（`https://user:pass@host`），合并会**放松**OS 打开面；两者是不同策略、不同 sink，必须各自存在（§5.1）。
- **不新增用户可见提示文案**，理由见 §7。

---

## 3. 数据校验规则（单一口径）

判据实现：`packages/shared-utils/src/safe-http-url.js`（CJS，主进程）与 `safe-http-url.browser.js`（ESM，渲染进程）。

```
HTTP_URL_RE = /^https?:\/\//i
safeHttpUrl(value):
  1. typeof value !== 'string'      → null   （含 null/undefined/数字/对象/数组/布尔）
  2. value.trim() 为空              → null
  3. 不以 http:// 或 https:// 开头   → null
  4. 否则                            → 返回 trim 后的**原串**（绝不重编码、绝不改写）
```

### 3.1 判定表（已逐条落进回归用例）

| 输入 | 输出 | 说明 |
| ---- | ---- | ---- |
| `https://example.com/a?b=1` | 原样 | 正常 |
| `HTTPS://Example.COM` | 原样 | 大小写不敏感 |
| `  https://a.example  ` | `https://a.example` | 去首尾空白，**不**去内部空白 |
| `https://to_co@example.com` | 原样 | userinfo 不特殊处理（仍是 https） |
| `javascript:alert(1)` | `null` | 本 PR 的主目标 |
| `javascript:window.electronAPI.store.set("pwned","1")` | `null` | 真实能力调用形态 |
| `JaVaScRiPt:alert(1)` / `  javascript:alert(1)` / `java\tscript:alert(1)` / `jav&#x61;script:alert(1)` | `null` | 大小写 / 前导空白 / 实体写法全部不命中前缀 |
| `data:text/html;base64,...` / `vbscript:msgbox(1)` / `file:///C:/...` | `null` | 其余危险协议 |
| `javascript:https://evil.example` | `null` | **锚定性反例**：判据若缺 `^`，这条会被放行（QM-6 后端 Warning-1 补，实测去 `^` 后 4 条红） |
| `xhttps://evil.example` | `null` | 同上——协议必须从串首开始，不能被前缀字符糊过去 |
| `//evil.example/x` | `null` | 协议相对：`file://` 宿主下解析成 `file://evil.example`，不是可点击目标 |
| `example.com/x` | `null` | 缺协议：同上 |
| `https:x` / `https:/x` | `null` | 必须 `://` |
| `''` / `'   '` / `null` / `undefined` / `123` / `{}` / `[]` / `true` | `null` | 非字符串与空白 |

### 3.2 边界口径（三条容易误解的地方，写成契约）

1. **"没有链接"不等于"没有内容"。** 判据不通过时**保留文本**（标题/URL 字符串照常显示），只去掉可点击性。宁可让用户复制文本，也不给一个"看着能点、点了没反应"的死锚点。
2. **采集侧的兜底优先级**：HN 分支是 `safeHttpUrl(d.url) || <本站 item 页>` —— 提交人把 url 填成危险协议时，链接**回落到 `https://news.ycombinator.com/item?id=<objectID>`**（该值由我们拼、必然安全），功能不中断；GitHub / Reddit 分支没有等价本站兜底，非法即 `null` → 渲染端降级纯文本。
3. **两档判据必须一致**：主进程采集侧与渲染绑定侧调用的是**同一个函数**，parity 锁保证 CJS/ESM 两份实现不漂移。禁止在任何一侧另写 `/^https?:/`。

---

## 4. 单一真源与跨端接线（本仓最易踩的一环）

```
packages/shared-utils/src/safe-http-url.js          ← CJS，主进程 require
packages/shared-utils/src/safe-http-url.browser.js  ← ESM，渲染进程 import
apps/desktop/vite.config.js  resolve.alias          ← '@multi-publish/shared-utils/src/safe-http-url' → .browser.js
```

- 为什么必须两份：浏览器不能执行 CommonJS 的 `module.exports`；照 `platform-definitions` / `account-name-guard` / `publish-capabilities` 三个先例走同一套（CJS + `.browser.js` + alias + parity 锁）。
- **接缝会撒谎**：`apps/desktop/vitest.config.js` **没有**这组 alias。因此单测里渲染端 import 解析到的是 **CJS 那份**，而生产构建解析到 **ESM 孪生**。后果是"改坏孪生文件、单测全绿"——由两处兜住：① `safe-http-url.test.js` 的 parity 段（按 `source` + `flags` 比正则，并对整张判定表逐条要求两份产出同一结论，实测漂移即红，见 §9 M5）；② `href-scheme-contract.test.js` 直接读 `vite.config.js` 源码断言 alias 在位（实测摘掉即红，见 §9 M3）。
- 覆盖率口径：新增的两个 `.vue` 侧文件在 `src/`，被 `coverage.include` 覆盖；`packages/shared-utils` 由自己的 `vitest run` 跑（CI 经 workspace `pnpm -r` 收集）。

---

## 5. 数据流（修复后的完整链路）

```
第三方 API（Reddit JSON / HN Algolia / GitHub Search / 各平台榜单 JSON）
   │  res.data.hits[].url 等 —— 提交人可控
   ▼
content-intelligence-sources.js   ← 【第 1 档】safeHttpUrl(外部字段) || 本站兜底
   ▼
ContentIntelligence.search()/trending()（相关性门禁 → 排序 → 去重，上一期已收口）
   ▼
IPC → 渲染层 store → 6 个组件
   ▼
模板绑定                          ← 【第 2 档】safeHttpUrl(item.url)
   ├─ 通过 → <a v-if 分支> :href=原串 target=_blank rel=noopener
   └─ 不通过 → <span v-else>，等样式纯文本，无 href 属性
```

主进程热榜侧（`hot-topics/channels.js`）原来的 `sanitizeUrl` 现在只是 `safeHttpUrl` 的别名，判据不再自带。

---

### 5.1 仓内三种 URL 策略对照（**刻意不合并**，防止后来者"顺手收敛"）

| 策略 | 位置 | 守护的 sink | 判据 | 与 `safeHttpUrl` 的关系 |
| ---- | ---- | ----------- | ---- | ---------------------- |
| `safeHttpUrl`（本 PR） | `packages/shared-utils/src/safe-http-url{.js,.browser.js}` | 渲染层把数据绑成**可点击锚点** | `http(s)://` 前缀白名单 | —— |
| `isAllowedExternalUrl` | `apps/desktop/electron/window.js:85` | `shell.openExternal`（OS 默认浏览器）、`setWindowOpenHandler`、`will-navigate` 的转投 | `new URL()` 解析 + 协议 ∈ {http:, https:} **且拒绝 username/password** | **更严**，合并进本 PR 判据会放松 OS 打开面，故保持独立 |
| `isPlatformIconUrl` | `apps/desktop/src/composables/usePlatformIconUrl.js:72` | **图标资源**加载 | http(s) / `data:` / 相对路径 | 不同问题轴（图标必须能吃 `data:` 与本地相对路径），与本判据不可互换 |

结论：**"URL 安不安全"在本仓不是一个判据，而是按 sink 分的三个策略**。三者都必须存在，但同一条链路上的同一策略不得有第二份实现——本 PR 收敛掉的就是 `hot-topics/channels.js` 那份与 `safeHttpUrl` 语义完全重复的 `sanitizeUrl`。

---

### 5.2 全仓「协议判定」实况清点（QM-6 后端 Warning-3 逼出来的取证）

判据要能落地，先得知道仓里到底有多少处在问"这是不是 http(s) URL"。实测扫描 `apps/desktop/src`、`apps/desktop/electron`、`packages`（含 `.vue`，**1846 个文件**），命中 **37 个文件**。分三类处置：

| 类别 | 判定 | 处置 | 成员 |
| ---- | ---- | ---- | ---- |
| **A 同用途拷贝**（决定某 URL 能否成为用户可点/可打开的地址） | 必须收敛到 `safeHttpUrl` | 本 PR 全部收敛 | `content-intelligence-sources.js`、`hot-topics/channels.js`、**`bootstrap/phase4-events.js:79`**（发布结果 URL → `tracked_content.url`，正是 `Publish.vue` 那个 `result.url` 的上游）、**`Collection.vue:1152/1157`**（用户粘贴链接的协议校验，即 §7 提到的 `collectError.protocol` 现场） |
| **B 不同意图的同类写法** | 保留，但在本 PRD 逐个点名，防止后来者"顺手收敛" | 不进锁的判定范围 | `story2video-stages.js:641`（网络**取回**守卫：非 http(s) 直接 reject，判据形态相同但 sink 是 `protocol.get`）、`agnes-multimodal.js:141` / `agnes-video.js:89`（"已是绝对 URL 就原样返回"的**分支判断**）、`knowledge-library-viral-engagement.js:29` / `bilibili-video.js:44` / `kuaishou-video.js:214`（**剥离**协议取 host/endpoint）、`Collection.vue:1020`（`new URL()` 后比 hostname 的通道路由）、`rich-text-processor.js:59`（**图片** URL 白名单，与图标同属另一资产轴）；以及约 20 处 `parsed.protocol === 'http:'` 形态的配置校验（logto issuer、proxy pool、API base URL 必须 https、SSRF 守卫等） |
| **C 判据自身** | —— | 白名单外唯一合法持有者 | `safe-http-url.js` 与 `safe-http-url.browser.js` |

**由此修正本 PR 早前写下的 AC-9**：原文写"主进程任何文件不得再自带 `/^https?:\/\//`"，这条**既不可实现也不准确**——B 类里大部分是合法的不同用途。落地口径改为两条可执行的判据：

- AC-9a：**渲染层全域**（`src/**/*.vue` 与 `src/**/*.js`）不得出现协议正则字面量，一律调共享判据；白名单 `RENDERER_PROTOCOL_REGEX_ALLOWED` 当前为空，只能带理由新增。
- AC-9b：**主进程成链侧**的文件清单 `MAIN_CHAIN_URL_GATE_FILES`（现为 `content-intelligence-sources.js` / `hot-topics/channels.js` / `phase4-events.js`）逐个断言"引用共享实现 + 不含自带协议正则"，新增同用途文件必须登记，清单只能缩小。

> 方法论记录：本节的产生过程本身就是教训。我第一版清点脚本只匹配 `.(js|mjs|cjs)`，**漏扫 `.vue`**，于是得出"只有 2 份是判据、其余 9 处不相关"的结论，并把它写进了 AC-9。是新增的渲染层全域锁在跑测试时当场逮出 `Collection.vue` 才暴露了这个缺口——**判据覆盖面写错比漏写更危险，因为它会让后续结论全都建立在错误的实况上**。修正方式不是补一条白名单，而是重扫含 `.vue` 的 1846 个文件后重写分类表。

---

## 6. 功能逻辑 / 交互逻辑 / 显示项

| 站点 | 显示项（安全 URL） | 显示项（不安全 URL） | 交互差异 |
| ---- | ---------------- | ------------------ | -------- |
| 内容情报结果列表 | 标题为蓝色链接，新标签打开，`rel="noopener"` | 标题文本照常显示（沿用 `.int-link` 类，**版式不变**），不可点击 | 「作为参考」按钮不受影响（它只取 `title`，本就不碰 url） |
| 热榜面板 | 标题链接，hover 变蓝 | 标题文本照常显示，无 hover 变色 | 卡片其余部分（来源、赞、评论）不变 |
| 参考检索面板 | 标题链接 | 标题文本照常显示 | 「插入」按钮不受影响 |
| 发布结果回链 | 「查看文章」链接 + 复制按钮 | 该行改为直接显示 URL 文本 + 复制按钮（**新增补齐 `rel="noopener"`**） | 复制功能对两类值都保留 |
| 发布历史详情 | `data-testid="detail-link"` 锚点，`rel="noopener"` | `data-testid="detail-link-plain"` 纯文本（内容仍是该 URL 字符串，便于人工核对脏数据） | 详情其余字段不变 |
| 影片工程元信息 | `el-link` 来源链接（补齐 `rel="noopener"`） | 纯文本显示 `projectUrl` | — |

设计取舍：**降级是静默的**，不弹窗、不加提示（理由见 §7）。判定不通过属"上游数据异常"，产品层没有一句诚实的解释可给用户（"链接不安全"在用户没做错任何事时是误导），而保留文本足以让用户自行核对。真正的可观测性由日志与回归锁承担。

---

## 7. 提示文字

**本次不新增任何用户可见文案，因此不新增 locale 键。**

理由三条，写死成约束以免后来者顺手加：

1. AGENTS.md 明确**禁止死键**——没有对应反馈面就不建键。本降级的触发条件是上游返回了危险协议 URL，正常数据下永不出现在界面上。
2. 若将来要加提示，必须 `apps/desktop/src/locales/zh.js` 与 `en.js` **成对**提交（CI Gate 7 `check-locale-sync.js` 拦截），且渲染端 `src/` 非 locales 文件不得新增中文字符串字面量（CI 基线扫描拦截）。
3. 已有的错误文案族 `apps/desktop/src/locales/zh.js` → `collectError.protocol`「仅支持 http/https 协议的链接。请更换为网页链接后重试。」是**采集入口**（用户手填 URL）的同口径文案，可作措辞参照；但那是用户主动输入失败的场景，与本 PR 的"上游数据被污染、用户无责"语义不同，**不复用**。

---

## 8. 验收标准

- **AC-1** Given HN 返回某条 `url = "javascript:window.electronAPI…"`，When 内容情报页渲染该结果，Then DOM 中不存在任何 `href` 以 `javascript:` 开头的锚点，且该条标题文本仍然显示。
- **AC-2** Given 同一列表里既有合法 `https` 又有非法 URL，Then 合法那条照常成链、`href` 与来源逐字一致、带 `rel="noopener"`。
- **AC-3** Given 热榜/参考检索/发布结果/历史记录/影片元信息任一站点收到非法 URL，Then 行为与 AC-1 同构（不成链、文本保留）。
- **AC-4** Given HN 帖提交人把 URL 填成非法协议，Then 采集侧回落到 `https://news.ycombinator.com/item?id=<objectID>`（链接仍可用且必然安全）。
- **AC-5** Given GitHub `html_url` 为非法协议，Then 采集侧 `url` 为 `null`，渲染侧不产出锚点。
- **AC-6** Then 全仓 `src/**/*.vue` 中每一处 `:href="…"` 的绑定表达式都必须含 `safeHttpUrl`；例外清单当前为空，新增例外必须带理由。
- **AC-7** Then CJS 与 ESM 两份实现必须对同一判定表产出同一结论，且正则 `source`/`flags` 逐字相同。
- **AC-8** Then `vite.config.js` 必须把 `@multi-publish/shared-utils/src/safe-http-url` 指向 `.browser.js`；该别名被删除时锁必须变红。
- **AC-9a** Then 渲染层全域（`src/**/*.vue`、`src/**/*.js`）不得出现 `/^https?:/` 形态的协议正则字面量；白名单为空。
- **AC-9b** Then 主进程成链侧清单内每个文件都必须引用共享实现且不含自带协议正则；清单只能缩小。
- **AC-10** Then 任何 `target="_blank"` 的锚点都必须带含 `noopener` 的 `rel`（结构判据，覆盖全部站点而非抽查两处）。
- **AC-11** Then `:[href]` 动态参数名与 `v-bind="{ href }"` 对象展开在渲染层一律禁止（这两种写法能把判据整条绕过）。
- **AC-12** Then 每个成链点的 `v-if` 与 `:href` 必须取**同一个**判据表达式（防止"弱化 v-if 只留 :href"使降级语义退化成死锚点）。

---

## 9. 反证矩阵（全部实跑，逐条实测红，事后逐字节还原并比对 sha1）

| # | 变异 | 结果 | 红条数 / 现场 |
| - | ---- | ---- | ------------- |
| M1 | `safeHttpUrl` 摘掉判据、恒放行 | RED-OK | 10 failed / 132 passed（6 个文件同时红，含采集侧与五个组件） |
| M2 | `Intelligence.vue` 退回裸 `:href="item.url"` | RED-OK | 2 failed / 5 passed（结构锁 + 组件行为各一条） |
| M3 | 删除 `vite.config.js` 的 alias 条目 | RED-OK | 1 failed / 6 passed（**只有**结构锁红——单测不走 vite alias，这正是 §4 记录的接缝，锁存在的全部理由） |
| M4 | `channels.js` 恢复自带 `sanitizeUrl` 实现 | RED-OK | 1 failed / 6 passed |
| M5 | ESM 孪生的正则改成 `^(https?\|ftp)` | RED-OK | 1 failed / 55 passed（parity 段命中） |
| M6 | 删掉不安全项的 `v-else` 纯文本分支 | RED-OK | 1 failed / 18 passed（"内容不丢"断言） |
| M7 | 成链分支去掉 `rel="noopener"` | RED-OK | 1 failed / 69 passed |
| M8 | 采集侧拆掉 `safeHttpUrl(d.url)` 包裹但**保留 import**（结构锁盲区） | RED-OK | 4 failed / 11 passed（证明采集侧的行为锁不是装饰） |
| M9 | 从 `window.open` 登记表里摘掉 `Accounts.vue` | RED-OK | 1 failed（新登记的站点必须被看见） |
| M10 | 删掉真实 `window.open` 调用点（登记变陈旧） | RED-OK | 1 failed（陈旧白名单即红，防"改了文件忘了登记"） |
| M11 | href 判据退回**只匹配双引号** | RED-OK | 1 failed（证明四种形态的覆盖是真的在守） |
| M12 | alias 整行注释掉、但两个字符串仍留在注释与另一条假条目里 | RED-OK | 1 failed（**QM-6 前端 Warning-1 的假绿路径被堵住**；旧的双 `toContain` 写法此处会假绿） |
| M13 | 仅 CJS 侧新增导出、孪生未同步 | RED-OK | 1 failed（导出集合 parity；interop 的 `default` 键按**值等价**判据剔除，不是无条件 filter） |
| M14 | 只弱化 `v-if`（`:href` 仍走判据） | RED-OK | 1 failed（AC-12） |
| M15 | 开始标签扫描退回朴素 `<a([^>]*)>` | RED-OK | 1 failed（含箭头函数 `=>` 的站点会被静默截断，而命中数下界仍满足 ⇒ 典型静默失明） |
| M16 | 两份孪生的判据**同时去掉 `^`** | RED-OK | 4 failed（**直接否证 QM-6 后端 Warning-1 的前提**："去掉 ^ 当前表仍全绿"在补入 `javascript:https://…` / `xhttps://…` 两条后不再成立） |
| M17 | 新增页面用 `:[href]` 动态参数名绕判据 | RED-OK | 2 failed（AC-11） |
| M18 | 新增 `target="_blank"` 不带 `rel=noopener` | RED-OK | 2 failed（AC-10） |
| M19 | 渲染层新页面自带一份协议正则 | RED-OK | 1 failed（AC-9a） |
| M20 | `phase4-events.js` 退回自带正则 | RED-OK | 1 failed（AC-9b） |

共 **20 条**变异，全部实测变红且事后逐字节还原（M17–M19 用临时探针 `.vue` 驱动，跑完删除并复验文件不存在）。

驱动自身的两次翻车也记在这里，因为它们是同一类错误：① 第一版按 `× ` 行统计红条，vitest 4 的失败行带 ANSI 前缀 ⇒ 8 条真红被判成"锁失效"（判据改为读汇总行 `N failed` 计数）；② M9 的锚点按 CRLF 构造，而目标文件其实是 LF ⇒ `ANCHOR-MISS`。**探针坏掉时报的结论一定比被测对象更可疑**。

---

## 10. 已知局限与后续

1. ~~`FilmEngineeringView.vue` 无组件级行为用例~~ —— **已闭环**：QM-6 后端 Warning-5 指出后补了 `来源链接：projectUrl 合法时成链且带 rel=noopener，非法时不成链但文本保留`，两个分支都真跑（`el-link` 经 `isCustomElement` 渲染，属性可直接断言）。
2. **`v-html` / `render()` 函数式组件 / `<iframe srcdoc>` 不在锁的扫描域内**。当前仓内没有"第三方 HTML 经 v-html 渲染出锚点"的用法，所以这不是活跃漏洞；但**它是本锁的边界**，已写进锁文件头注释，防止后来者误以为"扫过 `:href=` 就等于 href 面全安全"。若将来要接富文本渲染外部 HTML，必须单独设计判据（DOMPurify 一类的 tag/attr 白名单），不能指望这把结构锁。
3. **单测 realm 与生产 realm 不同源**（§4）。根治要么给 `vitest.config.js` 补同一组 alias，要么把孪生合并成单文件；两者都是独立的基建改动，本 PR 用 parity 锁 + alias 源码锁顶住，不做静默绕过。
3. **其余 URL sink 未纳入本 PR**（已确认各自有守卫或属不同策略，见 §5.1）：`shell.openExternal` / `setWindowOpenHandler` / `will-navigate` 由 `window.js` 的 `isAllowedExternalUrl` 守（更严，含拒绝 userinfo）；`webview`/`WebContentsView` 的 `loadURL` 另有各自的路径与域校验。**真正的残余缺口**是"第三方 URL 被喂进 `loadURL` 承载原生视图"这条链尚无与本协议校验等价的收口，需要单独盘一遍 sink 清单再决定，不在本 PR 顺手扩。
4. **`isAllowedExternalUrl` 与本判据存在包含关系**（前者 = 后者 ∧ 拒绝 userinfo）。将来若要把两者收敛成"按 sink 分档的一套 API"，必须保持 OS 打开面不降级，并同步 `window.js` 的既有测试——本 PR 明确**不做**这个合并（做了就是把更严的策略放松成前缀白名单）。
5. **协议白名单只有 http/https**：将来若产品要支持 `mailto:` / `tel:` 之类，必须**显式扩展判据并补判定表**，而不是放开前缀检查。
6. **`isPlatformIconUrl` 与本判据是两个口径**（图标允许 `data:` 与相对路径），刻意不合并；已在两处注释与本 PRD §2.2 互相指向，防止后来者"顺手收敛"。

---

## 11. QM-6 双模型外部评审记录（2026-09-29，`codeagent-wrapper` 并行）

模型真源 = `~/.claude/.ccg/config.toml` 的 `[routing]`：backend=`codex`、frontend=`claude`（本文档不复制该值，避免再次脱节）。评审对象 = 提交 `b9e7ad06`。

| # | 来源 | 级别 | 结论 | 处置 |
| - | ---- | ---- | ---- | ---- |
| C0 | 两路 | Critical | **均无 Critical** | —— |
| W1f | 前端 | Warning | alias 锁的两条独立 `toContain` 有假绿路径（整行注释掉仍过）；且因 `build.commonjsOptions` 会转 CJS，生产不崩、静默退回 | **采纳**：改为按映射条目断言 + 断言该行非注释；反证 M12 实测红 |
| W2f | 前端 | Warning | parity 不查导出集合 → 仅 CJS 新增导出会生产崩溃而单测全绿 | **采纳**：补导出集合断言；`default` 这个 interop 键按**值等价**判据剔除（实测 `ns.default !== ns`，故不能用自指判据），反证 M13 实测红 |
| W1b | 后端 | Warning | 判据的 `^` 锚定性没被表锁住：去 `^` 后整表仍绿，`javascript:https://evil` 会被放行 | **采纳**：补两条反例；反证 M16 实测 4 条红，**同时否证了"去 ^ 仍全绿"在当前表下的成立** |
| W2b | 后端 | Warning | AC-8 的 alias 锁只是子串检查 | **已在 W1f 同一条修复里闭环**（评审看的是修复前的 `b9e7ad06`） |
| W3b | 后端 | Warning | AC-9 说"主进程任何文件"但没有全仓锁 | **部分采纳并改写判据**：实测该表述不准确且不可实现（37 处同类写法多为不同意图，见 §5.2）；改为可执行的 AC-9a（渲染层全域）+ AC-9b（成链侧文件清单），并顺手收敛清点中逮到的两处**真同用途**拷贝 `phase4-events.js`、`Collection.vue` |
| W4b | 后端 | Warning | 结构锁可被 `:href = "x"`（等号空格）、不加引号值、`:[href]`、`v-bind="{ href }"` 绕过；`includes('safeHttpUrl')` 不证明值被包裹 | **采纳**：判据扩到四种形态 + 新增"禁止动态参数名/对象展开"（AC-11）+ 改为 `safeHttpUrl(<arg>)` **包裹性**断言；反证 M11/M17 实测红 |
| W5b | 后端 | Warning | FilmEngineering 无行为测试，降级分支未被证伪 | **采纳**：补两分支真跑的用例（§10.1 已划掉该条局限） |
| I1 | 前端/后端 | Info | `rel="noopener"` 只有两处被断言 | **采纳**：升级为结构判据 AC-10；反证 M18 实测红 |
| I2 | 前端 | Info | `v-if` 与 `:href` 双调用可分叉，锁只查 `:href` | **采纳**：新增 AC-12 同表达式判据 + 标签扫描器自测（M15 实测红：朴素 `[^>]*` 会在 `@mouseover="e => …"` 的 `>` 处静默截断，而命中数下界仍满足） |
| I3 | 前端 | Info | 扫描域不覆盖 `v-html` / `render()` / 命令式 `a.href=` | **采纳为边界声明**（§10.2 + 锁文件头注释），不假装覆盖 |
| I4 | 前端 | Info | `optimizeDeps.include` 缺 `safe-http-url`（与 `account-name-guard`/`publish-capabilities` 同样缺失） | **不改动**：先例即如此，且只影响 dev 冷启动一次预构建，不影响正确性；扩围属独立基建项 |
| I5 | 后端 | Info | 声称 `codeagent-wrapper.exe` 不存在（它自己嵌套调用外部评审失败）；路径写作 `D:\Claude\.claude\bin` | **不采纳**：那是其对自身工具链的观测，与本 PR 无关；本机实测 `~/.claude/bin/codeagent-wrapper` 可执行（本次评审即由它跑出） |
| I6 | 后端 | Info | 审查期间工作区出现其它未提交改动，已忽略，结论基于 `git show HEAD` | **确认符合预期**：那正是我与打包并行的改动；据此把 W2b/W3b 等条目按"评审时点"理解，而非当作对最终代码的意见 |

两条程序性事实值得留下：① 两个评审进程分别带 `--dangerously-bypass-approvals-and-sandbox` / `--dangerously-skip-permissions`，虽然要求只读，但收尾仍**必须**用 `git status` 证明工作区没被它们动过（本次实测：只有我自己的 5 个文件被改，两个 `*.bundle.js` 报 M 经字节比对证明是 `* text=auto` 的过滤器假象——worktree 与 HEAD blob 逐字节相同，index 存的是 CRLF 展开版）。② 评审是**对某个 commit 的快照**发言的，所以我必须区分"仍未处理"与"已在下一版修好"，不能整表照抄处置。
