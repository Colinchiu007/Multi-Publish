# 后端轴审查结论 — bilibili-audit-check.js & publish-monitor.js

**审查时间**：2026-10-07  
**基线**：diff `.ccg/review/buckets-runtime.diff` + 规格 `docs/PRD-BILIBILI-AUDIT-BUCKET-QUERY-2026-10-07.md`  
**范围**：仅后端轴（正确性、边界与异常路径、安全、规格红线）

---

## 🔴 CRITICAL

### 1. bilibili-audit-check.js:175-176 — 非主桶 URL 可被视为「主桶」导致 published 误判
```js
const primaryBucket = statusOf(primaryUrl) || BILIBILI_PRIMARY_BUCKET
```
- **问题**：`primaryUrl` 来自 `o.listUrl || BILIBILI_LIST_URL`。若调用方传入 `listUrl` 带 `status=not_pubed` 或 `status=is_pubing`，`statusOf` 会提取该值作为 `primaryBucket`。随后第 183-187 行在该桶命中且 `state=0` 时直接返回 `published`，且 `bucket: primaryBucket` 记录为非主桶键。
- **违反规格**：PRD §三.2「published 只能由主桶命中产出：非主桶里 state=0 是矛盾形态，不得当成上线（A3b）」，验收 A3b「断言结果既不是 rejected 也不是 published」。
- **修复建议**：强制 `primaryBucket = BILIBILI_PRIMARY_BUCKET`；`listUrl` 仅作请求目标，不改变主桶判定。若需兼容旧调用，应在入口处 `assert statusOf(listUrl) === BILIBILI_PRIMARY_BUCKET` 或直接忽略 URL 中的 status。

### 2. bilibili-audit-check.js:101-108 — `withStatusParam` 可能产生重复 `status` 查询参数
```js
return u.replace(/([?&]status=)[^&#]*/, '$1' + key)
```
- **问题**：若 URL 已含多个 `status` 参数（如 `?status=pubed&status=not_pubed`），正则仅替换首个，残留第二个导致重复键。服务端取值行为未定义，可能造成不可预期的桶查询。
- **违反规格**：验收 A9「不产生重复 status 键」。
- **修复建议**：先 `u.replace(/([?&]status=)[^&#]*/g, '')` 清空所有 status，再追加单一 `status=key`；或用 `URLSearchParams` 重建查询串（需兼容 Node 18+）。

### 3. publish-monitor.js:70-73 — `failed` 状态分支永不可达（死代码）
```js
if (result.status === 'failed') { callback && callback({ status: 'failed', ... }) }
```
- **问题**：`checkBilibiliAuditStatus` 仅返回 `published`/`pending`/`error`；通用回退（第 166-204 行）返回 `error`。无任何路径产出 `failed`。该分支永不执行，超时/错误均走别处。
- **风险**：维护者误以为有 `failed` 语义，导致错误处理遗漏。
- **修复建议**：删除该分支，或统一规范为 `error`，并在文档说明平台差异。

### 4. publish-monitor.js:65 — 对 bilibili 永不产出的 `reviewed`/`rejected` 做终态判断
```js
if (result.status === 'published' || result.status === 'reviewed' || result.status === 'rejected')
```
- **问题**：bilibili 专用路径（第 157-164 行）返回的 `result` 来自 `checkBilibiliAuditStatus`，其仅产出 `published`/`pending`/`error`。`reviewed`/`rejected` 仅可能来自通用回退路径（其他平台）。
- **违反规格**：PRD §三.2 红线「禁止把 not_pubed 命中映射成 rejected/deny/transferFail」。虽 bilibili 不走此分支，但混在同一判断中极易在重构时误用。
- **修复建议**：将 bilibili 专用终态判断单独提取；通用路径保留 `reviewed`/`rejected` 但需在平台能力注册表显式声明支持。

---

## 🟠 WARNING

### 5. bilibili-audit-check.js:57 — `BUCKET_KEY_SHAPE` 白名单可能静默丢弃合法桶键
```js
const BUCKET_KEY_SHAPE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/
```
- **问题**：当前实测键为 `pubed`/`not_pubed`/`is_pubing` 均匹配。但 API 若新增含连字符、中文或其他字符的桶键（如 `in-review`、`待审核`），会被 `filter` 静默排除，导致「应扇出而未扇出」，表现为 `not-in-list` 而非 `bucketsTruncated`。
- **规格要求**：PRD §三.1「扇出判据取自带响应，不取自常量表」；桶名词表由端点回报 `data.class` 键集。白名单应为**安全兜底**而非业务过滤。
- **修复建议**：保留白名单但改为「不匹配时记 warn 并跳过，不静默」；并在 `classCounts` 日志中输出被拒键名，便于事后发现新桶。

### 6. bilibili-audit-check.js:201-205 — 候选桶过滤顺序导致 `MAX_BUCKET_PROBES` 语义偏差
```js
const candidates = Object.keys(counts).filter(...)
const targets = candidates.slice(0, MAX_BUCKET_PROBES)
```
- **问题**：`Object.keys` 顺序为插入序（ES2015+ 保证），即 `data.class` 返回的键序。实测为 `pubed`→`not_pubed`→`is_pubing`。若未来 API 调整顺序或新增桶在前，`slice(0,3)` 可能优先探测低优先级桶。规格未规定探测优先级，但「审核中」通常比「不通过」更需关注。
- **修复建议**：显式定义优先级数组 `const BUCKET_PRIORITY = ['is_pubing', 'not_pubed', ...]` 并按优先级排序后再截断。

### 7. bilibili-audit-check.js:169-172 — `nav` 校验失败时未记录 `bucketsProbed`
```js
if (!nav || nav.code !== 0 || !nav.data || !nav.data.mid) {
  return { status: 'pending', postId, reason: 'nav-not-established' }
}
```
- **问题**：此处直接返回，`probed` 仍为空数组。调用方（publish-monitor）日志中 `lastBucketsProbed` 为空，无法知晓是否已发起过列表请求。
- **修复建议**：在 `nav` 校验前不 push `probed` 可接受，但返回对象应带 `bucketsProbed: []` 显式声明（当前已隐含），并建议在 `reason` 中区分「nav 未建立」与「列表未请求」。

### 8. publish-monitor.js:100-109 — `poll-progress` 日志 `primaryState` 使用 `?? ''` 但 `state` 使用 `?? ''`，字段命名不一致
```js
state: result.state ?? '', primaryState: result.primaryState ?? ''
```
- **问题**：bilibili 返回 `primaryState`（驼峰），通用回退不返回此字段。日志统一用 `primaryState` 键名，但通用路径下该键缺失会记为空串。建议统一字段命名约定或在通用路径补齐 `primaryState: null`。
- **修复建议**：`checkPublishStatus` 返回类型定义中显式包含 `primaryState?: *`，通用路径补 `primaryState: null`。

### 9. bilibili-audit-check.js:112-115 — `normalizeClassCounts` 对 `null`/`undefined` 返回 `null`，但 `Array.isArray(null)` 为 false，逻辑正确；但 `typeof null === 'object'` 为 true，需确认短路顺序
```js
if (!value || typeof value !== 'object' || Array.isArray(value)) return null
```
- **现状**：`!value` 先于 `typeof`，`null`/`undefined` 直接命中 `!value` 返回 `null`，安全。
- **隐患**：若未来改写顺序或拆分条件，易引入 `typeof null === 'object'` 导致 `null` 通过并后续报错。
- **修复建议**：显式写 `value === null || value === undefined || ...` 或保持现有短路并加注释。

### 10. publish-monitor.js:166-204 — 通用平台状态解析过于宽泛，易误匹配
```js
const items = data?.data?.list || data?.items || [data?.data] || []
```
- **问题**：兼容多平台导致解析路径极宽，`itemStatus` 取 `status`/`state`/`publish_status` 任一字段，关键词匹配用 `includes` 易误判（如 `status: 'published_draft'` 会命中 `published`）。
- **修复建议**：平台专用实现应全部剥离通用路径；通用路径仅作兜底并打 warn 日志，不作为验收依据。

---

## 🟢 INFO

### 11. bilibili-audit-check.js:64 — `MAX_BUCKET_PROBES = 3` 与规格「最坏 3 次请求」不符
- **现状**：主桶 1 次 + 最多 3 个非主桶 = 最多 4 次列表请求。
- **规格**：PRD §三.1「最坏 3 次」（主桶 + 2 非主桶 `not_pubed`/`is_pubing`）。
- **影响**：当前仅 2 个非主桶，实际仍 ≤3 次；若 API 新增桶且计数>0，会触发第 4 次。建议改 `MAX_BUCKET_PROBES = 2` 与规格对齐，或在规格中修正上限说明。

### 12. bilibili-audit-check.js:87-90 — `statusOf` 正则未处理 URL 片段（`#`）后的 query
```js
const m = /[?&]status=([^&#]*)/.exec(String(url || ''))
```
- **现状**：`[^&#]*` 在 `#` 处停止，正确忽略 fragment。但若 URL 形如 `?status=pubed#section` 会正确提取 `pubed`。
- **验证**：无实测 fragment 场景，当前实现可接受。

### 13. bilibili-audit-check.js:137-142 — `findEntry` 线性遍历，`arc_audits` 典型 ≤20 条，性能可接受
- **建议**：若未来分页 `ps` 调大（如 100），考虑建立 `Map<bvid, entry>` 索引；当前无需优化。

### 14. publish-monitor.js:23 — `CHECK_URLS.bilibili: BILIBILI_LIST_URL` 同一引用（parity 锁）
- **验收 A12**：已满足。修改 `BILIBILI_LIST_URL` 需同步更新此处，当前为同一模块导出，引用一致。

### 15. publish-monitor.js:111-113 — 定时器 `unref()` 正确防止阻塞进程退出
- **现状**：`timerId.unref()` 在 Node/Electron 均可用。R28 修复已落地。

### 16. bilibili-audit-check.js:230-232 — `catch` 块返回 `error` 且带 `bucketsProbed`
- **正确性**：满足「中途抛错也要说得出探到哪一步」（规格注释）。`probed` 声明在 `try` 外，闭包捕获正确。

### 17. bilibili-audit-check.js:196-207 — 扇出前先算完 `candidates` 再探测，`truncated` 可判定
- **设计优点**：边探边判会把上限变成软提示；先算完使 `bucketsTruncated` 成为硬事实，符合规格「判据先算完再探」。

### 18. bilibili-audit-check.js:218-222 — 非主桶命中时原样透传 `state/primary_state/state_desc`
- **规格对齐**：PRD §三.2「原样带出该桶回报的状态字段：这是『审核中/不通过的 state 取值』唯一的取证通道」。实现正确。

### 19. publish-monitor.js:78-87 — `monitor-timeout` 日志携带完整末轮上下文
- **规格对齐**：验收 A11「携带最后一次 reason/bucket/state/stateDesc/bucketsProbed」。实现正确，且用 `join(',')` 序列化数组便于日志检索。

### 20. 共同 — `axios` 注入模式在两文件一致，支持测试层无真实出站
- **QM-3 合规**：两服务均接受 `opts.axios` 注入，测试可传入 mock 实例。`publish-monitor` 透传给 `checkBilibiliAuditStatus`，链路完整。

---

## 规格红线核对表

| 红线 | 规格要求 | 实现状态 | 备注 |
|-----|---------|---------|------|
| not_pubed ↦ rejected | ⛔ 禁止 | ✅ 守住 | 返回 `pending` + `in-not-pubed-bucket` |
| published 仅主桶产出 | ✅ 必须 | ❌ **破坏** | 见 Critical #1 |
| 未观测 state 一律 pending | ✅ 必须 | ✅ 守住 | `state-unobserved` reason |
| 扇出判据取自 `data.class` | ✅ 必须 | ✅ 守住 | 第 198-205 行 |
| 信封非 code:0 ⇒ pending | ✅ 必须 | ✅ 守住 | 第 124-126、180 行 |
| 无重复 status 键 | ✅ 必须 | ❌ **风险** | 见 Critical #2 |

---

## 建议后续动作

1. **立即修复 Critical #1、#2、#3、#4** — 均为逻辑/安全缺陷，直接影响正确性与规格合规。
2. **Warning #5、#6** — 在下一轮迭代中加固白名单语义与优先级显式化。
3. **Info #11** — 决定是改常量还是改规格文档，保持一致。
4. **补充测试** — 针对 Critical #1 构造「传入非主桶 URL 且命中 state=0」用例，断言返回 `pending` 而非 `published`；针对 Critical #2 构造重复 status 参数 URL，断言 `withStatusParam` 输出仅含单一 status。