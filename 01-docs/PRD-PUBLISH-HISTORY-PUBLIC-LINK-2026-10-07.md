# PRD/BUGFIX：发布记录「作品链接」必须落到平台公开内容页，不得落到登录墙

- **变更编号**：`fix-publish-history-public-link`
- **分支 / worktree**：`fix-publish-history-public-link` / `D:\Data\projects\mp-worktrees\mp-fix-publish-history-public-link`
- **日期**：2026-10-07
- **类型**：Bug 修复（含根因级合同收口），无新增用户功能
- **用户报障原文**：「发布记录中的已成功的记录，点击链接，打开的不是具体内容页面，而是登录页面。查一下原因并修复。」
- **关联文档**：
  - `01-docs/PRD-PUBLISH-HISTORY-CARD-OPEN-LINK-2026-10-03.md`（卡片点击打开链接的原始需求，**本文档修正其隐含前提**）
  - `01-docs/PRD-HREF-SCHEME-GUARD-2026-09-29.md`（`safeHttpUrl` 协议判据合同，本文档在其之上叠加「目的地语义判据」）
  - `01-docs/PRD-PUBLISH-PAGE-OPTIMIZATION-2026-10-08.md`（审核状态/作品 ID 落库，本文档复用 `platformWorkId`）
  - `docs/frontend-interaction-spec.md`、`openspec/specs/desktop-ui-consistency/spec.md`（交互与 UI 一致性口径）

---

## 1. 背景与根因

### 1.1 用户可观测症状

发布记录页（`/history`）中状态为「成功」的记录：

- 点击记录卡片的「作品链接」锚点（详情弹窗内），或直接点击整张卡片
- 期望：打开该作品在平台上的**公开内容页**（可直接看到已发布内容）
- 实际：打开平台的**登录页**

### 1.2 根因（三层，逐层可独立验证）

**第一层：落库的 `url` 本身就是「创作者后台页」，不是内容页。**

`apps/desktop/electron/services/rpa-view-platforms.js` 在判定发布成功时，把 RPA webview 的**当前页面地址**当作作品链接落库：

- 通用链 `_verifyPublishSuccess()` 的 `finish()`（第 790 行）：
  ```js
  const resolvedUrl = sanitizePublishResultUrl((artifact && artifact.url) || result.url || currentUrl)
  ```
  `currentUrl` 即发布成功瞬间 RPA 停留在的页面地址。
- 平台专用链同样是 `win.webContents.getURL()`：
  - `_publish_douyin()`（第 1005、1008 行）
  - `_publish_wechat_mp()`（第 1180 行）
  - `_publish_youtube()`（第 1259 行）
  - `_publish_zhihu()`（第 1400、1410、1417 行，`draft:true` 分支与成功分支）

而 `config/platforms.yaml` 里绝大多数平台的 `publish_url` **本身就是创作者后台**：

| platform | `publish_url` | 性质 |
| --- | --- | --- |
| `xiaohongshu` | `https://creator.xiaohongshu.com/` | 创作者后台（需登录） |
| `tencent_video` | `https://channels.weixin.qq.com/` | 视频号后台（需登录） |
| `toutiao` | `https://mp.toutiao.com/` | 头条号后台（需登录） |
| `bilibili` | `https://member.bilibili.com/platform/upload/video/frame` | 创作中心（需登录） |
| `baijiahao` | `https://baijiahao.baidu.com/builder/rc/edit?type=videoV2` | 百家号编辑页（需登录） |
| `kuaishou` | `https://cp.kuaishou.com/article/publish/video?tabType=1` | 快手创作页（需登录） |
| `wechat_mp` | `''`（由 `data_url` 驱动） | 公众号后台（需登录） |
| `zhihu` | `https://zhuanlan.zhihu.com/write` | 知乎编辑页（需登录） |

发布成功后的站内跳转也大多落在**内容管理页**而非内容页（快手实测即为 `/manage/…?from=publish`，见 `rpa-view-platforms.js:776-783` 注释）。

**第二层：`sanitizePublishResultUrl` 只做脱敏，不做目的地判定。**

`apps/desktop/electron/services/publisher-router.js:80-91` 的 `sanitizePublishResultUrl()` 剥离 `token/auth/cookie/session/code/sid` 等敏感 query 与 hash。它**不判断**这个 URL 是不是内容页，于是一个登录墙 URL 被原样保留、脱敏后落库。

**第三层（真正的合同缺陷）：渲染端把「协议合法」当成了「目的地正确」。**

`apps/desktop/src/views/PublishHistory.vue`：

- 详情弹窗（第 354 行）：`<a v-if="safeHttpUrl(resultValue(selectedRecord,'url'))" :href="...">作品链接</a>`
- 卡片点击（第 797-799 行）：`cardLinkUrl(record) = safeHttpUrl(resultValue(record,'url'))`

唯一的判据是 `safeHttpUrl`（**协议**白名单）。`https://creator.xiaohongshu.com/` 完全通过该判据，于是被当作「作品链接」渲染并交给用户点击。

而打开通道是 `tabStore.createTab`（应用内标签）或降级 `window.open`（系统浏览器）——**两者都不携带平台会话 Cookie**，平台自然把请求重定向到登录页。

> **一句话根因**：发布链路把「RPA 会话所在的后台页地址」当成了作品链接落库，渲染层又只校验协议不校验目的地，于是「登录墙 URL」被端到端地当成「作品链接」呈现并打开。

### 1.3 为什么知乎等平台看起来「有时正常」

知乎发布成功后会跳到 `zhuanlan.zhihu.com/p/<aid>`，**恰好就是**公开内容页，所以同一段代码在知乎上表现正常、在其他平台表现为登录墙。这种「同码不同表现」是本 bug 长期未被发现的直接原因。

### 1.4 逃逸链（为什么没被测出来）

| 层级 | 现有覆盖 | 为什么没拦住 |
| --- | --- | --- |
| 单元测试（视图） | `PublishHistory.test.js:794-900` 共 14 例，T1-T7/T9-T14 | 负例（T5-T7）**全部是协议类**（`javascript:`、缺协议、协议相对、非字符串）；正例用的是 `https://www.zhihu.com/question/123456`——一个**内容页之外**的地址也照样通过。**没有任何一条用例断言「合法 http 的后台页 URL 不得被打开」**，即缺口的正是本 bug 本身 |
| 单元测试（解析器） | `apps/desktop/electron/services/platform-metrics/` | 该目录**只有 `index.js`，没有任何测试文件**（`glob` 实证）。里面已经写好了正确的 `resolveContentUrl(postId, resultUrl)`，但既无测试、也未被渲染端复用 |
| 集成测试 | `stores/tab` → `page-manager` → IPC | 只验证「`createTab` 被调用、参数原样透传」，不验证参数指向何处 |
| E2E / 视觉回归 | `tests/e2e/publish-flow.test.js`、视觉基线 | 跳转目标是**外部站点**，自动化环境无法断言落地页；视觉回归只截应用内界面，不含外部页面 |
| 代码评审 | PRD-…-CARD-OPEN-LINK-2026-10-03 §9 | 该 PRD §2.2 明确把「不改详情弹窗」列为非目标，§6 只规定「`safeHttpUrl` 非 null 即产出可点行为」——**评审范围本身就排除了目的地正确性** |
| 规范层 | `PRD-HREF-SCHEME-GUARD` | 全仓对 href 只有**协议**判据，**没有任何「目的地语义」判据**这一层概念 |

### 1.5 系统性漏洞定位

1. **测试场景缺失**：`safeHttpUrl` 的负例矩阵里没有「协议合法但目的地错误」这一类。
2. **单一真源被绕过（核心）**：`platform-metrics/index.js` 早已实现「先认公开内容页、否则用 postId 构造」的判据，渲染端却另起炉灶直接用 `result.url`。同一知识存在两份实现且**正确的那份没被复用**——这是典型的真源分裂，不加测试就必然漂移。
3. **审查盲区**：历次 PRD 把「协议合法」当作安全与正确性的**充分条件**，评审清单里没有「这个链接会落到哪个页面」这一问。
4. **流程缺失**：新增外链类需求没有强制要求回答「链接是**公开可达**还是**登录可达**」。

---

## 2. 目标与非目标

### 2.1 目标

1. **G1 目的地正确**：发布记录的「作品链接」只允许指向平台**公开内容页**；不得再把创作者后台页 / 登录页呈现为作品链接。
2. **G2 单一真源**：把「某平台的公开内容页长什么样、能否用作品 ID 构造」收敛为一个纯函数模块（`shared-utils`，CJS + ESM 孪生），渲染端与指标回采端**共用同一份规则**。
3. **G3 诚实降级**：无法确定公开内容页时，**不给链接**（而不是给一个登录墙链接），并在界面上如实说明原因。
4. **G4 存量可修**：不迁移历史数据即可让**既有记录**的链接恢复正确（解析发生在渲染期，`result.postId` / `platformWorkId` 早已落库）。
5. **G5 反向覆盖**：`platform-metrics` 的 `resolveContentUrl` 委托到新模块，消除第二份 URL 模板来源，并补上该目录**缺失的测试**。

### 2.2 非目标（明确不做）

1. **不改**发布链路的落库字段形态。`result.url` 保留其「RPA 会话页面地址」原义（对日志与诊断有价值），不覆写、不新增 `contentUrl` 字段——**呈现层负责把原始值翻译成公开链接**。
2. **不做**历史数据迁移 / 回填脚本。
3. **不新增**依赖、不改主进程 `window.js` 的 `isAllowedExternalUrl` 判据、不动 `stores/tab`。
4. **不承诺**对所有平台都能给出公开链接。微信公众号、视频号、微博、TikTok、Twitter、Instagram、Facebook 存在「单一作品 ID 不足以定位公开页」或「Web 端无公开永久链接」的结构性限制（详见 §6.3），本需求对它们**如实不给链接**。
5. **不做**链接可达性在线探测（不请求目标站点做 200/302 校验）——会引入网络依赖与延迟，判据必须是**纯函数、可离线测试**。
6. **不改**草稿箱卡片、批量管理、筛选、导出等既有交互。

---

## 3. 用户故事与验收标准

### US-1：有公开内容页的记录 → 链接指向内容页

- **Given** 记录 `platform=zhihu`、`result.postId='123456789'`、`result.url='https://creator.xiaohongshu.com/…'`（后台页）
- **When** 用户点击卡片 / 详情弹窗的作品链接
- **Then** 打开 `https://zhihu.com/p/123456789`（由作品 ID 推导的公开内容页），而不是后台页

**验收**：
- AC-1 `resolvePublishedContentUrl` 对「recorded 非内容页 + postId 合法」返回 `{ url: 派生值, source: 'derived' }`。
- AC-2 视图的卡片点击与详情锚点**共用**同一个解析结果（不得出现「显示 A、打开 B」）。

### US-2：recorded 本身就是公开内容页 → 原样使用

- **Given** `platform=bilibili`、`result.url='https://www.bilibili.com/video/BV1xx411c7mD'`
- **When** 用户点击链接
- **Then** 打开该 URL（`source: 'recorded'`），不做任何改写

**验收**：AC-3 `source === 'recorded'` 时 `url === recordedUrl`（逐字相等，含尾斜杠与 query）。

### US-3：既无公开内容页、也无合法作品 ID → 不给链接（如实降级）

- **Given** `platform=wechat_mp`、仅有 `result.url='https://mp.weixin.qq.com/cgi-bin/…'`
- **When** 用户查看记录卡片 / 详情弹窗
- **Then** 卡片不可点击，悬浮提示「暂无平台公开链接」；详情弹窗显示纯文本 + 「以下为发布时页面地址（需登录平台查看）」

**验收**：
- AC-4 卡片不可点（`isCardClickable` 为 false，`createTab` 与 `window.open` 均不被调用）。
- AC-5 详情弹窗**不渲染 `<a>`**，只渲染不可点击的纯文本与原因说明。
- AC-6 **不得**出现「点进去发现要登录」的情况——这是本次 Bug 的核心症状，必须被断言反证。

### US-4：作品 ID 是合成值/占位值 → 不得据此构造链接

- **Given** `result.postId='published-lz3k9x'`（快手 `from=publish` 兜底派生值，见 `rpa-view-platforms.js:781`）或 `'task_abc123'`
- **When** 解析公开链接
- **Then** 返回 `{ url: '', source: 'none' }`，不构造出必然 404 的 URL

**验收**：AC-7 合成前缀（`published-` / `task_` / `tmp`）、布尔/空值字面量、超长（>128）一律判为无 ID。

### US-5：解析器双端同口径

- **Given** 同一组输入
- **When** 分别用 CJS（主进程 / 指标回采）与 ESM 孪生（渲染端）解析
- **Then** 结果逐字段相等

**验收**：AC-8 parity 用例覆盖 §6.3 全部 15 个平台 × {recorded 内容页 / recorded 后台页 / 有 postId / 无 postId}。

### US-6：指标回采端不回归

- **Given** `platform-metrics` 四个已注册平台
- **When** 调用 `resolveContentUrl(postId, resultUrl)`
- **Then** 行为与本次变更**逐字一致**（本次对它们是 no-op）

**验收**：AC-9 四个平台的既有模板串（含 `https://zhihu.com/p/`、`https://m.gifshow.com/fw/photo/`）被用例逐字锁死。

---

## 4. 数据校验规则（单一真源：`packages/shared-utils/src/published-content-url.js`）

### 4.1 输入归一

| 输入 | 归一规则 | 非法时行为 |
| --- | --- | --- |
| `platform` | `String(platform \|\| '').trim().toLowerCase()` | 不在规则表内 → 直接 `{ url:'', source:'none' }` |
| `postId` | 仅接受 `string` / `number`；`String(v).trim()` | 其他类型 → 视为无 ID |
| `recordedUrl` | 先过 `safeHttpUrl`（协议白名单，**复用**不复制） | 返回 `null` → 视为无 recorded |

### 4.2 作品 ID 合法性闸门（`normalizeWorkId`）

按顺序判定，任一不满足即视为**无 ID**：

1. 归一后非空；
2. 长度 ≤ 128（防超长值污染历史与渲染，与 `publish-audit-status` 的 `AUDIT_STRING_MAX.platformWorkId=128` 同量级）；
3. **不得**以合成/占位前缀开头：`published-`（快手 `from=publish` 兜底）、`task_`（内部任务号）、`tmp`；
4. 不得是布尔/空值字面量：`true` / `false` / `null` / `undefined` / `NaN`（大小写不敏感）；
5. 不得是平台导航词：`home` / `index` / `publish` / `manage` / `new` / `draft` / `detail` / `list` / `edit`（与 `rpa-publish-id-extract.js` 的 `PUBLISH_ID_NAV_WORDS` 同族思路）；
6. **必须匹配该平台专属形态正则**（见 §6.3）——形态不符即拒绝，不做「宽松拼接」。

### 4.3 公开内容页判据（`isPublicContentUrl`）

**纯正向白名单**：URL 必须同时满足

1. `safeHttpUrl(URL) !== null`（协议）；
2. hostname 命中该平台的内容域名（`contentHosts`）；
3. path/query 命中该平台的内容页形态（`contentPathRe`）。

**不采用「后台域名黑名单」**。理由：黑名单需要穷举且必然漏（如新的 `/console`、`/workbench`），白名单是封闭集合；且知乎的内容页与编辑页**同域不同 path**（`zhuanlan.zhihu.com/p/…` vs `zhuanlan.zhihu.com/write`），只有 path 白名单能正确区分。

### 4.4 解析顺序与优先级

```
recordedUrl 命中内容页白名单？  →  { url: recordedUrl, source: 'recorded' }   // 最强证据：平台直接给的公开地址
postId 通过 §4.2 闸门？        →  { url: buildFromTemplate(platform, postId), source: 'derived' }
否则                            →  { url: '', source: 'none' }                // 诚实不给链接
```

**不存在第四种情况**：任何情况下都不会返回一个「已通过 `safeHttpUrl` 但不是内容页」的 URL。

### 4.5 输出不变式（由测试锁死）

- `source === 'none'` ⟹ `url === ''`
- `source !== 'none'` ⟹ `safeHttpUrl(url) !== null`
- `resolve` 是**纯函数**：相同入参多次调用结果相等，不读时间/随机/网络/文件系统。

---

## 5. 功能逻辑（实现落点）

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `packages/shared-utils/src/published-content-url.js` | **新增**（CJS） | 规则表 + `normalizeWorkId` + `isPublicContentUrl` + `resolvePublishedContentUrl` + `buildPublicContentUrl` + `PUBLIC_CONTENT_URL_RULES`（导出供测试与文档对齐） |
| `packages/shared-utils/src/published-content-url.browser.js` | **新增**（ESM 孪生） | 与 CJS **逐字同源**的判据；由 parity 用例比对 `source` + `flags` 拦截漂移（沿用 `safe-http-url` / `publish-audit-status` 的既有孪生范式） |
| `packages/shared-utils/src/__tests__/published-content-url.test.js` | **新增** | 解析矩阵 + 边界 + parity（详见 §8） |
| `apps/desktop/src/views/PublishHistory.vue` | 修改 | ① 新增 `publicContentLink(record)` 统一解析入口；② `cardLinkUrl` / 详情锚点 / 可点性判断**全部**改走它（消除「显示 A、打开 B」）；③ 详情弹窗「作品链接」行按 `source` 三态渲染 + 原因说明；④ 新增 `linkSourceHint` |
| `apps/desktop/vite.config.js` | 修改 | `resolve.alias` 登记 `@multi-publish/shared-utils/src/published-content-url` → `published-content-url.browser.js`。渲染层一律从**不带 `.browser` 后缀**的模块名导入（与 `safe-http-url` / `publish-audit-status` 同约定）；直接写 `.browser` 后缀会被 `scripts/check-renderer-cjs-boundary` 判为「未登记的 CJS 跨边界导入」而红（首轮 CI `QG Static` 即栽在此处）。未登记 alias 时渲染层会拉到主进程 CJS 版，浏览器无法执行 `module.exports` |
| `apps/desktop/src/composables/usePublishHistoryContentLink.js` | **新增** | 上述判据与打开通道的**唯一**实现，从视图抽出。**原因**：该视图已达 1457 行，逐文件行数门禁（`.github/scripts/check-max-lines.js`，limit=500 / growthAllowance=200）按账本登记值比对本 PR 触碰文件的增长，逻辑留在视图里会超容差（实测 LEDGER_GREW：较登记值 1205 膨胀 253 行 > 容差 200）。拆出后视图降至 1363 行（增长 158 < 200），门禁无需 `--update` 抬高基线 |
| `apps/desktop/src/href-scheme-contract.test.js` | 修改 | ① `OPEN_SITES_GUARDED_IN_MAIN` 登记从 `src/views/PublishHistory.vue` 改指 `src/composables/usePublishHistoryContentLink.js`（`window.open` 已随之迁移；「登记表里的站点必须真的还存在」断言正是为拦这种陈旧登记）；② `window.open` 扫描域从仅 `.vue` 扩到 `.vue` + `src` 下非测试 `.js`——否则 `window.open` 一旦被抽进 composable 就**静默退出扫描域**（既不用登记也不被看见），即本文件头警告的「静默失明」 |
| `apps/desktop/electron/services/platform-metrics/index.js` | 修改 | 四个 parser 的 `resolveContentUrl` 委托 `resolvePublishedContentUrl`（**逐字 no-op**，见 §6.4） |
| `apps/desktop/electron/services/platform-metrics/index.test.js` | **新增** | 补上该目录**完全缺失**的测试；锁死四个平台既有模板串 + 「后台页不得被当作内容页」 |
| `apps/desktop/src/views/PublishHistory.test.js` | 修改 | 新增 describe + 修正 T1 正例（见 §8.3） |
| `apps/desktop/src/locales/zh.js` / `en.js` | 修改 | 成对新增 3 键 + 修订 1 键文案（见 §7） |
| `01-docs/PRD-PUBLISH-HISTORY-PUBLIC-LINK-2026-10-07.md` | **新增** | 本文档 |
| `01-docs/PRD-PUBLISH-HISTORY-CARD-OPEN-LINK-2026-10-03.md` | 修改 | §2.2/§6 加勘误指针：原文「`safeHttpUrl` 非 null 即为作品链接」的前提已被本文档修正 |
| `01-docs/PRD-HREF-SCHEME-GUARD-2026-09-29.md` | 修改 | 增加「协议判据 ≠ 目的地判据」的分层说明与指向本文档的指针 |
| `CHANGELOG.md` | 修改 | Unreleased 追加 |
| `.quality-gates.md` | 修改 | 本次执行记录 |

**不修改**：`rpa-view-platforms.js`、`publisher-router.js`、`window.js`、`stores/tab.js`、草稿卡片、批量管理、筛选/导出。

---

## 6. 平台规则表（§6.3 是判据真源，§6.4 说明与 `platform-metrics` 的等价性）

### 6.1 「派生」与「不派生」的判据

能否派生，只取决于一个事实：**该平台的公开内容页地址能否由「平台作品 ID」单值唯一确定**。

- 能（ID 是内容页路径的充分成分）→ 派生；
- 不能（还需要 uid / user handle / `__biz` / `idx` / `sn` 等第二、第三成分）→ **不派生**。

### 6.2 为什么「不派生」优于「猜一个」

派生失败时**不给链接**（`source: 'none'`），而不是回退到 `recordedUrl`（登录墙）或拼接一个猜测地址（几乎必 404）。这与本仓既有的一贯原则一致：审核状态无定论不落库、队列状态无定论记 `unclassified` 而非并进成功/失败——**没有证据就不给结论**。

### 6.3 规则表（15 平台全覆盖）

| platform | 内容域名（`contentHosts`） | 内容页形态（`contentPathRe`） | 作品 ID 形态 | 派生模板 | 不可派生的原因 |
| --- | --- | --- | --- | --- | --- |
| `zhihu` | `zhuanlan.zhihu.com`、`www.zhihu.com`、`zhihu.com` | `/(?:p)/\d+` | `^\d{4,}$`（文章 aid） | `https://zhihu.com/p/{id}` | — |
| `baijiahao` | `baijiahao.baidu.com` | `/s\?…id=\d+` | `^\d{4,}$` | `https://baijiahao.baidu.com/s?id={id}` | — |
| `bilibili` | `www.bilibili.com`、`m.bilibili.com`、`bilibili.com` | `/video/(BV[0-9A-Za-z]{5,20}\|av\d{4,})`、`/read/cv\d+` | `^(BV[0-9A-Za-z]{5,20}\|av\d{4,})$` | `https://www.bilibili.com/video/{id}` | — |
| `kuaishou` | `www.kuaishou.com`、`v.kuaishou.com`、`m.gifshow.com` | `/short-video/\d+`、`/fw/photo/\d+` | `^\d{6,}$`（photoId） | `https://m.gifshow.com/fw/photo/{id}` | — |
| `xiaohongshu` | `www.xiaohongshu.com`、`xiaohongshu.com` | `/(?:explore\|discovery/item)/[0-9a-f]{16,32}` | `^[0-9a-f]{16,32}$`（笔记 ID，hex） | `https://www.xiaohongshu.com/explore/{id}` | — |
| `douyin` | `www.douyin.com`、`douyin.com` | `/(?:video\|note)/\d+` | `^\d{6,}$`（aweme_id） | `https://www.douyin.com/video/{id}` | — |
| `toutiao` | `www.toutiao.com`、`toutiao.com` | `/article/\d+`、`/w/\d+` | `^\d{4,}$` | `https://www.toutiao.com/article/{id}/` | — |
| `youtube` | `www.youtube.com`、`youtube.com`、`youtu.be` | `/watch\?…v=[\w-]{11}`、`youtu.be/[\w-]{11}` | `^[A-Za-z0-9_-]{11}$` | `https://www.youtube.com/watch?v={id}` | — |
| `wechat_mp` | `mp.weixin.qq.com` | `^/s\?…(__biz\|mid)=` | — | **不派生** | 永久链接需 `__biz`+`mid`+`idx`+`sn` 四元组，发布结果只拿得到 `mid` |
| `tencent_video`（视频号） | `channels.weixin.qq.com` | — | — | **不派生** | 内容仅在微信客户端内可达，Web 端无公开永久链接 |
| `weibo` | `weibo.com`、`m.weibo.cn` | `/(\d{6,})/([A-Za-z0-9]{6,})` | — | **不派生** | 需 `uid/mid` 两个成分，只有 `mid` 无法定位 |
| `tiktok` | `www.tiktok.com` | `/@[\w.]+/video/\d+` | — | **不派生** | 需 `@user` + `aweme_id` |
| `twitter` | `twitter.com`、`x.com` | `/\w+/status/\d+` | — | **不派生** | 需 handle + status id |
| `instagram` | `www.instagram.com` | `/(p\|reel\|tv)/[\w-]+` | — | **不派生** | 需 username + shortcode |
| `facebook` | `www.facebook.com` | `/(posts\|videos\|photos)/\d+` | — | **不派生** | 需 page/username 上下文 |

> 表中 `contentPathRe` 为可读表达，实际以正则字面量落在代码中，并由 §8.1 用例逐条锁定。

### 6.4 与 `platform-metrics` 的等价性（本次为 no-op）

`platform-metrics/index.js` 现有四个 parser 的 `resolveContentUrl` 被改为委托共享解析器。**四个平台的既有输出必须逐字不变**：

| platform | 变更前 | 变更后 |
| --- | --- | --- |
| `zhihu` | `resultUrl` 命中 `/p/` 则用之，否则 `https://zhihu.com/p/{postId}` | 同左（`source` 忽略） |
| `baijiahao` | 命中 `/s?id=` 则用之，否则 `https://baijiahao.baidu.com/s?id={postId}` | 同左 |
| `kuaishou` | **恒**用 `https://m.gifshow.com/fw/photo/{postId}`（忽略 resultUrl） | 委托后 resultUrl 命中内容页时会优先返回 resultUrl —— **行为变化**，见下 |
| `bilibili` | 命中 `/video/` 或 `/read/cv` 则用之，否则 `https://www.bilibili.com/video/{postId}` | 同左 |

`kuaishou` 是唯一存在行为变化的平台：变更后若 `resultUrl` 本身是 `kuaishou.com/short-video/…`（公开内容页），会优先采用它而不是按 postId 拼 `gifshow` 地址。**这是修正而非回归**（原实现把 `resultUrl` 整个忽略掉，是一处已存在的缺陷），且两个地址都指向同一作品的公开页。AC-9 对该平台锁死「postId 派生的输出串不变」，并单列一条用例锁「resultUrl 为公开内容页时优先用它」。

---

## 7. 显示项与提示文字（zh / en 成对，CI Gate 7 拦截）

### 7.1 卡片（列表 + 网格视图共用）

| 状态 | 判定 | 光标 | `title` 提示 | i18n key |
| --- | --- | --- | --- | --- |
| 可点 | `source ∈ {recorded, derived}` | `pointer` | 点击打开平台作品链接（**文案不变**） | `historyPage.cardOpenHint` |
| 不可点 | `source === 'none'` | 默认 | 暂无平台公开链接（**文案修订**，见下） | `historyPage.cardNoLinkHint` |

**文案修订说明**：`cardNoLinkHint` 由「暂无平台链接 / No platform link yet」改为「暂无平台公开链接 / No public post link」。理由：修订前这句话不准确——记录里**有** `result.url`，只是它不是公开页；新文案如实区分「没有链接」与「没有**公开**链接」，避免用户误以为是数据缺失。

### 7.2 详情弹窗「作品链接」行（`historyPage.detailLink`）

| `source` | 渲染形态 | 附加说明 | i18n key |
| --- | --- | --- | --- |
| `recorded` | `<a href target="_blank" rel="noopener">`，显示 URL 文本 | 无（平台直接给出的地址，不制造疑虑） | — |
| `derived` | `<a href target="_blank" rel="noopener">`，显示 URL 文本 | 「由平台作品 ID 推导生成」 | `historyPage.detailLinkDerivedHint` |
| `none` + 有 `recordedUrl` | **纯文本**（不可点），显示 URL 文本 | 「以下为发布时页面地址（需登录平台查看）」 | `historyPage.detailLinkLoginWallHint` |
| `none` + 无 `recordedUrl` | 「未记录作品链接」 | 无 | `historyPage.detailLinkAbsent` |

### 7.3 提示文字全文

| key | zh | en |
| --- | --- | --- |
| `historyPage.cardNoLinkHint`（修订） | 暂无平台公开链接 | No public post link |
| `historyPage.detailLinkDerivedHint`（新增） | 由平台作品 ID 推导生成 | Derived from the platform work ID |
| `historyPage.detailLinkLoginWallHint`（新增） | 以下为发布时页面地址（需登录平台查看） | This is the page URL captured at publish time (sign-in required) |
| `historyPage.detailLinkAbsent`（新增） | 未记录作品链接 | No post link recorded |

> 全部为**说明性文案**，不构成可点性承诺（沿用 `PRD-…-CARD-OPEN-LINK` §AC-5 的既有口径）。

---

## 8. 测试计划（TDD 先行：先写测试并确认其能转红，再写实现）

### 8.1 `published-content-url.test.js`

| # | 场景 | 断言 |
| --- | --- | --- |
| R1 | recorded 为该平台公开内容页 | `source='recorded'` 且 `url` 逐字等于 recorded |
| R2 | recorded 为后台页 + 合法 postId | `source='derived'`，url 等于模板串 |
| R3 | recorded 为后台页 + 无 postId | `source='none'`、`url=''` |
| R4 | recorded 为 `javascript:` / 缺协议 / 协议相对 | 等价于「无 recorded」 |
| R5 | postId 为 `published-lz3k9x` / `task_abc` / `true` / `undefined` / 129 字符 | 视为无 ID（落到 `none` 或用 recorded） |
| R6 | postId 形态不符（`zhihu` 给 `BV1xx`、`bilibili` 给纯数字） | 拒绝派生 |
| R7 | platform 不在表内（`threads`） | `none` |
| R8 | 全部 15 平台：无 recorded + 无 postId | 一律 `none`（诚实降级全覆盖） |
| R9 | 全部 15 平台：合法 postId | 仅 §6.3 中「可派生」的 7 个平台返回非空，其余 `none` |
| R10 | `bilibili` BV / av 两种形态 | 均派生成功，模板串正确 |
| R11 | 输出不变式 | `none ⟺ url===''`；非 `none ⟹ safeHttpUrl(url)!==null` |
| R12 | 纯函数性 | 同入参连调 3 次结果相等（`toBe` 引用级） |
| R13 | 知乎同域不同 path | `https://zhuanlan.zhihu.com/write` 判为**非**内容页；`.../p/123` 判为内容页 |
| R14 | CJS/ESM parity | §6.3 全部平台 × 4 种输入组合，两端结果对象逐字段相等 |

### 8.2 `platform-metrics/index.test.js`（新增，补齐空缺覆盖）

| # | 场景 | 断言 |
| --- | --- | --- |
| M1 | `zhihu.resolveContentUrl('123456', '')` | `https://zhihu.com/p/123456`（逐字，no-op 锁） |
| M2 | `baijiahao.resolveContentUrl('99', '')` | `https://baijiahao.baidu.com/s?id=99` |
| M3 | `kuaishou.resolveContentUrl('123456789', '')` | `https://m.gifshow.com/fw/photo/123456789` |
| M4 | `bilibili.resolveContentUrl('BV1xx411c7mD', '')` | `https://www.bilibili.com/video/BV1xx411c7mD` |
| M5 | 四平台 resultUrl 传入**后台页** | 不返回该后台页（否则回采会去爬登录墙） |
| M6 | `kuaishou` + resultUrl 为公开内容页 | 优先返回 resultUrl（§6.4 记录的行为修正） |

### 8.3 `PublishHistory.test.js`

| # | 场景 | 断言 |
| --- | --- | --- |
| V1 | 卡片有 `result.url=zhihu.com/p/123`（公开页） | `createTab` 被调，参数 url 逐字等于该公开页 |
| V2 | 卡片 `result.url=creator.xiaohongshu.com/…` + `result.postId=6530a1b2c3d4e5f600112233` | `createTab` 被调，url 为 `https://www.xiaohongshu.com/explore/6530a1b2c3d4e5f600112233`，**且不等于**原 recorded |
| V3 | 卡片只有后台页、无 postId | `createTab` 与 `window.open` 均未被调；`title` 为「暂无平台公开链接」 |
| V4 | 卡片 postId 为 `published-xxx` | 同 V3（不构造必然 404 的链接） |
| V5 | 详情弹窗：derived | 渲染 `<a data-testid="detail-link">`，href 为派生值，附「由平台作品 ID 推导生成」 |
| V6 | 详情弹窗：none + 有 recorded | 渲染 `detail-link-plain` 纯文本 + 「需登录平台查看」，**无 `<a>`** |
| V7 | 详情弹窗：none + 无 recorded | 显示「未记录作品链接」 |
| V8 | 详情弹窗：recorded 为公开页 | `<a>` href 逐字等于 recorded，无派生说明 |
| V9 | **既有 T1-T14 全部不回归** | 原 describe 保持全绿（唯一修正见下） |
| V10 | href-scheme 合同不回归 | `href-scheme-contract.test.js` 仍全绿 |

**T1 正例修正（诚实声明）**：既有 T1 用的 `CARD_URL = 'https://www.zhihu.com/question/123456'` 是**问题页**，不是内容页。它之所以能通过，正是因为旧判据不区分目的地。本次把它改为真正的内容页 `https://zhihu.com/p/123456` 并同时新增 V2 作为「后台页 + postId → 派生」的对照，**使测试矩阵第一次真正覆盖本 bug**。

---

## 9. 交互流程

```
用户查看发布记录列表
  │
  ├─ 渲染每张卡片 → publicContentLink(record) 得到 { url, source }
  │     ├─ source ∈ {recorded, derived} → isCardClickable=true，cursor: pointer
  │     │     title = 「点击打开平台作品链接」
  │     └─ source = none            → isCardClickable=false，cursor 默认
  │           title = 「暂无平台公开链接」
  │
  ├─ 点击卡片（排除 a/button/label/input/select/textarea/[role=tab]，排除 selectionMode）
  │     ├─ source = none → 无任何行为（不跳转、不报错、不误导）
  │     └─ source ≠ none →
  │           ├─ cardLinkUrl(record) === publicContentLink(record).url（同一真源，保证「显示 A 打开 A」）
  │           ├─ 进行中守卫（openingCardIds）命中 → 静默忽略
  │           └─ tabStore.createTab({ url, platform, title: '作品 · {记录标题}' })
  │                 ├─ 返回 tabId  → actionMessage = 「已在新标签页打开作品链接」
  │                 ├─ 返回 null   → 降级 window.open(url,'_blank') → 主进程 isAllowedExternalUrl 兜底 → 系统浏览器
  │                 └─ 抛错        → actionMessage = 「打开作品链接失败，请重试」
  │
  └─ 点击「详情」→ 弹窗「作品链接」行按 source 三态渲染（见 §7.2）
        ├─ recorded/derived → <a target="_blank" rel="noopener">
        └─ none            → 纯文本 + 原因说明，绝不渲染 <a>
```

**交互细节**：

1. **同一真源保证一致性**：`cardLinkUrl`（决定能否打开、打开什么）、详情锚点的 `href`、详情链接文本，三者全部取自 `publicContentLink(record)` 的同一个返回值。禁止出现「文本显示 A、href 打开 B」。
2. **`safeHttpUrl` 仍是最后一道闸门**：解析器输出的 URL 在进入 `:href` / `createTab` 前仍要过 `safeHttpUrl`。分层理由见 `electron/window.js:85-90` 的既有注释——渲染端 `safeHttpUrl` 与主进程 `isAllowedExternalUrl` 是**按 sink 分工**的两道判据，不合并、不互相替代。本次新增的是**在两者之前**的「目的地语义」层。
3. **不做在线探测**：解析器是纯函数，不发起网络请求。理由见 §2.2 非目标 5。
4. **降级路径保持不变**：`createTab → null → window.open` 的两级降级与既有 US-4 完全一致，本次不动。
5. **批量管理模式**：`selectionMode` 下整卡点击仍不打开（误触风险面），本次不变。

---

## 10. 安全与合规

1. **协议判据不放松**：`safeHttpUrl` 仍是渲染端唯一 href 判据；本次只在其**之前**增加目的地白名单，不修改、不放宽任何协议规则。
2. **无 `javascript:` 逃逸面**：派生 URL 由**代码内的模板字面量**拼接 `postId`；`postId` 必须先过 §4.2 闸门（类型/长度/前缀/字面量/导航词/**平台专属形态正则**六重判定），因此不可能注入 `javascript:` 或 `//host`。形态正则（如 `^\d{4,}$`、`^[0-9a-f]{16,32}$`）从字符集上排除了协议分隔符。
3. **无新增依赖、无新增 IPC 参数**：`createTab` 参数仍是纯 JSON 字符串。
4. **信息泄漏面**：本次**减少**而非增加暴露——原本展示的后台页 URL（常含 query 片段）现在在多数情况下不再作为可点链接呈现。
5. **诊断能力不损失**：`result.url` 原值仍完整落库（§2.2 非目标 1），排查 RPA 行为时取证不受影响。

---

## 11. 风险与权衡

| 风险 | 处置 |
| --- | --- |
| 某些平台「本来有点击 albeit 要登录」，改后变成「不可点」，用户觉得功能倒退 | 这是**如实修正**：给一个必然落到登录墙的链接不是能力。界面用 §7.2 的原因说明解释清楚，不是静默移除 |
| 形态正则过严导致本可派生的 ID 被拒（用户看到「暂无公开链接」） | 宁可少给不给错：给错链接＝回到本 bug。形态正则已按各平台真实 ID 形态取值（B 站 BV 10 位、小红书 hex 24 位、抖音/头条纯数字），并在 R6 锁边界 |
| 形态正则过松导致构造出 404 链接 | 由 §4.2 第 6 条 + R5/R6 双测兜底；合成前缀（`published-`/`task_`）单列 |
| `platform-metrics` 委托后行为变化 | 仅 `kuaishou` 一处（§6.4），且是修正；AC-9 + M6 双锁 |
| 与既有 `PRD-…-CARD-OPEN-LINK` 的 T1 用例冲突 | 已在 §8.3 V10/T1 修正处显式声明修改内容与理由，不静默改测试 |
| 未来新增平台忘记加规则 | `R7`/`R8` 锁住「不在表内 → `none`」这一**安全默认**：漏加的后果是「不给链接」而非「给错链接」 |
| **视图文件已达 1457 行，行数门禁容差仅 200** | 已把判据与打开通道抽成 composable（§5 表），视图降至 1363 行（较登记值增长 158 < 200）；**未用 `--update` 抬高账本基线来绕过门禁**。拆分的附带收益：抽出 `window.open` 后契约测试立刻报出陈旧登记，于是顺带补上了 `window.open` 扫描域的 `.js` 盲区（§5 表末行） |
| **`max-lines` 账本已陈旧**（`PublishHistory.vue` 登记 1205，而 main 实际已是 1379） | 本 PR 未改该账本（那等于把一个 1363 行文件的基线抬得更高）。陈旧的成因是：该门禁按 **diff 作用域**检查，从不被本 PR 触碰的文件其基线漂移不会被发现。已如实记入执行记录「遗留」，交由配套改门禁口径的另案处理 |

---

## 12. 质量门禁映射（QM）

| 门禁 | 本次适用性 |
| --- | --- |
| QM-1 打包 | **不适用**：不触碰 `apps/desktop/electron/` 与 `packages/rpa-engine/` 的构建产物路径。已执行 `verify-worktree-deps.js`（11 个 workspace 消费方全部指向本 worktree） |
| QM-2 代码必检 | 适用：新增两个 `shared-utils` 模块（无 require 路径新增，复用既有 `@multi-publish/shared-utils/src/*` 约定）、视图改动无 IPC reactive 参数 |
| QM-4 视觉回归 | **适用但不阻塞**：本变更改详情弹窗「作品链接」行的渲染形态（三态）。发布前跑 `test:visual:pixel`；若基线因该行文案/结构变化而失配，**只更新该视图基线**，不得整体刷新基线 |
| QM-6 双模型评审 | 适用：PR 流程中执行并回写 `.quality-gates.md` |
| TDD | 适用：§8 全部用例先写并确认可转红，再写实现 |
| locale 成对 | 适用：zh/en 新增 3 键 + 修订 1 键（CI Gate 7 拦截） |
| 变异反证 | 适用：把 `resolvePublishedContentUrl` 的内容页白名单临时放宽为「任意 `safeHttpUrl` 通过即算内容页」，跑 `published-content-url.test.js` 必须**恰好 R2/R3/R13 与 V3/V4/V6 转红**、其余仍绿；还原后确认实现文件 `git diff` 为空 |
| 文档同步 | 适用：本 PRD + 三份关联 PRD 勘误 + CHANGELOG |
