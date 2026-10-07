# B 站审核回查真机取证（2026-10-07，一次真实投稿 + 全程回查）

> 承接 `docs/audit-requery-evidence-bilibili-2026-10-05.md`。10-05 那轮是**只读**，其 §四.1 记「审核中/不通过的 `state` 取值本机无现场」，并判定「需要一次真实投稿才能观测」。
> 本轮把那次投稿花掉了，**§四.1 的「审核中」那一格已填上**，并额外跑出一条真实断链。
> 落位在 `docs/`（doc-gate 代码 PR 白名单只认 `docs/**`、`openspec/**`、`.ccg/**`、根 `*.md`）。

- 取证时刻：2026-10-07T08:31:49Z ～ 08:32:33Z（投稿 → 回查收敛，共 44 秒）
- 账号：`bilibili / ca681b37`（`mid=3747542357510297`，`status=active`）
- 运行态：本仓应用，worktree `mp-bilibili-audit-buckets`（含分桶查询实现），共享 profile `shared-user-data`
- 触发方式：经 CDP 在渲染层调 `window.electronAPI.publishBatch(platforms, article)` → `publish:batch` → 队列 → API 轨发布
- **授权口径**：用户 2026-10-07 明确「要发，接受公开」；投稿后进一步指示「已发的内容就不用删了」⇒ **稿件保留，未删除**（见 §六）

---

## 一、投稿载荷与结果

载荷（最小、可识别为测试稿）：

```
title      = 自动化取证测试稿 请忽略 稍后删除
content    = 这是发布链路自动化取证用的临时稿件，用于验证发布后审核状态回查，取证后即删。
video_path = .ccg/tasks/archive/2026-09/video-clone-real-url-e2e/multi-scene-src.mp4
             （640x360 / h264+aac / 6.0s / 76,657 B —— 账号内已有 9s 稿件，短视频可投）
category   = 21    copyright = 1（自制）    aiGenerated = false
```

`aiGenerated` 显式传 `false`：素材来自仓库既有 E2E 产物，是否 AI 生成**未经核实**，不主动声明以避免不实标注。实测该选择不阻断投稿。

队列结果（`getQueueHistory()` 现场）：

```json
{"id":"task_1_1791361909906","platform":"bilibili","status":"success",
 "startedAt":"2026-10-07T08:31:49.912Z","completedAt":"2026-10-07T08:31:52.294Z",
 "result":{"success":true,"url":"https://www.bilibili.com/video/BV1HyHC6mExS",
           "postId":"BV1HyHC6mExS","platform":"bilibili","mode":"api"}}
```

## 二、① 提交后落点 URL —— 已确证

```
https://www.bilibili.com/video/BV1HyHC6mExS
```

- 承载形态是**路径段** `/video/<BV…>`，不是 query `vid=`，也不是只靠响应体。
- `postId` 与 URL 同步产出且一致 ⇒ #2968 补的 path 段采集**在真机上确实被用上**（不是只在单测里成立）。
- `mode: "api"`：本次走的是 API 轨（`publishMode: api-then-dom`），**未产生浏览器导航**。
  ⇒ 「DOM/RPA 轨提交后落在哪里」这一格**本轮仍未观测**，不得由 API 轨外推。
- 耗时 2.4 秒 ⇒ 不是「上传+转码后同步返回」的形态；稿件真实性由 §三 的独立回查证实，**不采信 result 自己的说法**。

## 三、② 审核中的 `state` 取值 —— 已确证（10-05 §四.1 该格填上）

投稿后应用日志里 `PublishMonitor poll-progress` 的四轮现场（原文，未截断字段）：

| 轮 | 时刻 | `reason` | `bucket` | `state` | `primary_state` | `state_desc` | `class` 计数 | `bucketsProbed` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 08:32:02.701 | `in-review-bucket` | `is_pubing` | **-30** | **-30** | **审核中** | `{pubed:7,not_pubed:0,is_pubing:1}` | `pubed,is_pubing` |
| 2 | 08:32:13.082 | `in-review-bucket` | `is_pubing` | **-1** | **-1** | **审核中** | `{pubed:7,not_pubed:0,is_pubing:1}` | `pubed,is_pubing` |
| 3 | 08:32:23.358 | `not-in-list` | — | — | — | — | `{pubed:8,not_pubed:0,is_pubing:0}` | `pubed` |
| 4 | 08:32:33.631 | → `monitor-result status:"published"` | | | | | | |

**结论（本轮实测确立）**：

1. **B 站「审核中」的 `state` 不是单一值**：同一次投稿的 20 秒窗口内先后观测到 `-30` 与 `-1`，两者 `state_desc` 均为 `"审核中"`，且 **`primary_state` 与 `state` 同值**。
   ⇒ 任何按「`state === 某个固定值` 判审核中」的写法都会漏；判据要么取集合，要么取 `state_desc`。
2. **`is_pubing` 桶确实是真过滤**：投稿瞬间 `class.is_pubing` 从 0→1，且稿件**只**出现在该桶、不在 `pubed` 桶；审核结束后 `class.is_pubing` 回到 0、`pubed` 变 8。与 10-05/10-07 的只读复测三方一致。
3. **`not_pubed` 桶本轮仍无现场**（始终为 0）⇒ 「审核不通过」的 `state` 取值**依旧未观测**，不得由「审核中」的两个值外推。
4. 第 3 轮是一个**真实的中间态**：`class.pubed` 已经是 8（计数上稿件已归入已发布桶），但 `pubed` 列表第一页**还查不到它** ⇒ `not-in-list`。
   这正好实测印证了 10-05 写进实现的那条硬约束「**不得拿 `page.count`/`class` 计数当命中证据**」——计数与列表内容之间存在约 10 秒的不一致窗口。若当初按 `count` 判命中，第 3 轮就会误报 `published`（且拿不到 `raw`）。

⇒ 分桶查询改动**被真机证明是必要的**：不改桶，第 1、2 轮只会是 `not-in-list`，这两个 `state` 值永远取不到。

## 四、③ 徽标与回查联动 —— 负面结果，跑出一条真实断链

回查**确实跑了**（此前我按 `AUDIT_REQUERY_VERIFIED_PLATFORMS` 不含 bilibili 推断「不会跑」，**该推断被本轮实测否证**：该名单管的是另一处门禁，`phase4-events` 的 `requery.decide` 对本平台放行了）。第 4 轮拿到 `published` 终态，但紧接着：

```
[08:32:33.631] PublishMonitor monitor-result   {"platform":"bilibili","postId":"BV1HyHC6mExS","status":"published"}
[08:32:33.634] PublishMonitor audit-update-skipped {"taskId":"task_1_1791361909906"}
```

回读发布历史（`historyGet('muxumprdxpwj')`）：

```json
{"id":"muxumprdxpwj","platform":"bilibili","taskId":"task_1_1791361909906","status":"success",
 "result":{"success":true,"url":"https://www.bilibili.com/video/BV1HyHC6mExS","postId":"BV1HyHC6mExS",...},
 "timestamp":"2026-10-07T08:31:52.297Z"}
```

记录里**没有** `auditStatus` / `monitorStatus` / `auditedAt` —— 回查结论从未落到记录上。

**根因（读码定位，非推测）**：调用点与被调方的键不同源。

```js
// electron/bootstrap/phase4-events.js:91
const { updated } = history.updateRecordAudit(task.id, patch, ownerSubject)
//                                    ↑ 传的是队列任务 id  task_1_1791361909906

// electron/services/publish-history.js:187,207-208
function updateRecordAudit (id, patch, ownerSubject) { ...
  String(record.id || '') === targetId && matchesOwner(record, owner)
//                   ↑ 按历史记录主键匹配，该记录是 muxumprdxpwj
```

历史记录的队列任务 id 存在 **`taskId`** 字段里，而函数匹配的是 **`record.id`** ⇒ 永远不相等 ⇒ 恒 `updated:false` ⇒ 恒走 `audit-update-skipped`。

**影响面**：不止 B 站 —— 所有走回查的平台，其审核结论都写不回发布历史。表现为「历史列表的审核徽标永远不出现」，且日志里只有一条 `audit-update-skipped`，无异常栈，属**静默失效**。

**为什么四层测试都没拦住**：`phase4-events` 的用例断言的是「调用了 `updateRecordAudit`」，而不是「调用后被调方真的改到了那条记录」。这是本仓已记过的「装饰性链路」同族第四次 —— 断言停在「我调过」，键对不对没人管。

⇒ 修复属独立变更（键对齐 + 一条注入**真** `publish-history` 的跨模块契约锁 + 反证），不在分桶查询 PR 内顺手做。

## 五、对 10-05 取证文档的更正

| 10-05 的表述 | 本轮实况 |
| --- | --- |
| §四.1「审核中/不通过的 `state` 取值本机无现场」 | **「审核中」已观测：`state` ∈ {-30, -1}，`state_desc="审核中"`，`primary_state` 同值。「不通过」仍无现场** |
| §四.1「`AUDIT_STATUSES` 的 `inAudit` 在 B 站没有实测映射依据」 | 现在有了（两个值 + `state_desc` 佐证），但**尚未据此改实现**（见 §七） |
| §五.5「需要一次真实投稿才能观测审核中/被拒态」 | 投稿已花，**审核中已观测、被拒未观测**（该账号投稿后 20 秒内即过审，未进入 `not_pubed`） |
| 本轮另纠正：10-05 的 `code:-302` 曾被转述为「端点会风控」 | 系**站外 node 客户端**产物；同账号在应用分区内同源 fetch 稳定 `code:0` |

## 六、稿件处置实况

- 用户指示：「已发的内容就不用删了」⇒ **`BV1HyHC6mExS`（aid `117398686406005`）保留在账号上，未删除**。
- 删除动作**未执行**。过程中我曾按猜测调用 `POST https://api.bilibili.com/x/web/archive/delete`，返回 **HTTP 404**（路径不存在），未产生任何写入；该猜测脚本已作废，未再探测其他端点。
- 一处需要知情的不一致：稿件**标题写着「稍后删除」但实际不会删**。改标题需另一次写操作，未擅自执行。

## 七、据本轮取证**尚未**落地的改动（明确留白）

1. **未**把 `-30`/`-1` 写进 `BILIBILI_OBSERVED_ONLINE_STATES` 之类的审核中映射 —— 本轮只观测了**一次**投稿，两个值是否覆盖全部「审核中」形态未知；且 `AUDIT_REQUERY_VERIFIED_PLATFORMS` 仍要求 published/inAudit/deny/无定论四类齐备，deny 仍缺。
2. **未**改 `phase4-events.js:91` 的键错配 —— 独立变更，需 PRD + 注入真实现的契约锁 + 反证。
3. **未**据「20 秒即过审」推断该账号免审或审核时长上界 —— 单次样本，不足以外推。
