# PRD：发布历史 ↔ 表现数据 关联链打通（publish-tracked-link-lineage）

- 立项：`01-docs/PRD-PUBLISH-STATS-SUCCESS-TRUTH-2026-10-01.md` §九 残余限制第 3 条（P2-6 第二刀）
- 日期：2026-10-04
- 分支：`publish-tracked-link-lineage`（worktree `D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage`，基线 `e5fb069b`）
- 变更类型：🐛 数据链路缺陷修复（跨模块合同缺失），非新功能、非 UI 改版

---

## 一、用户可见症状与根因

**症状**：发布历史页（`PublishHistory.vue`）每张卡片的「表现数据」列（阅读 / 点赞 / 评论 / 收藏 / 转发）**恒为空**，
即使该作品确实已被回采到 `performance_snapshot`。用户视角等于「回采白跑了」。

**根因（一句话）**：`tracked_content.publish_history_id` 这一列**从未被写入过**——写入点在
`apps/desktop/electron/bootstrap/phase4-events.js:144` 的 `store.addTrackedContent({...})` 只传了
`platform / postId / url / rewriteHistoryId / recrawlStatus / nextRecrawlAt / ownerSubject`，
**不含 `publishHistoryId`**；而存储层 `performance-loop-store.js:100` 已经在读
`entry.publishHistoryId || null`，于是每行都落成 `NULL`。

**读侧契约**（决定本刀修法方向的唯一事实）：`PublishHistory.vue:602-608`

```js
// publish_history 记录的 taskId 对应 tracked_content 的 publish_history_id 语义（发布任务 id）
if (t.publish_history_id) byTask.set(String(t.publish_history_id), t)
const tracked = byTask.get(String(record.taskId || record.id))
```

⇒ 该列的**语义是「发布任务 id」（`task.id`），不是发布历史行自己的 `entry.id`**。
列名 `publish_history_id` 是个命名陷阱：写侧若"顾名思义"去存 `addRecord()` 返回的 `entry.id`，
读侧永远查不到（它优先用 `record.taskId`），修完仍然恒空。本刀按读侧既有契约写，并在代码与测试里把这句语义钉住。

## 二、实测证据（两次独立测量，全部只读，不改任何数据）

用 `node:sqlite` 以 **readOnly** 打开活库 `shared-user-data/multi-publish.db`，
并用同一份 `shared-user-data/publish-history.jsonl` 建 `(归属, platform, post_id)` 索引：

| 量 | 2026-10-03 | 2026-10-04 | 用途 |
| --- | --- | --- | --- |
| `tracked_content` 总行 | 69 | **73** | 基数（活库在长） |
| `publish_history_id` 已赋值 | **0** | **0** | 两天两次独立测量都是全 NULL ⇒ 结论稳 |
| `post_id` 为空 | 42 | 45 | 这些行**无法**按内容 id 回填（只能等新发布） |
| 可按归属 + `(platform, post_id)` **唯一**命中 | 27 | **28** | 回填可行域 |
| 命中 **≥2** 条（歧义） | 1 | **1** | 必须跳过，不得猜 |
| 历史行总数 | 91 | **98** | — |
| 历史行 `owner_subject` 分布 | — | **98/98 全部有值**（且只有一个取值） | 判据 6 实测零成本，但作为护栏保留 |
| 历史行无可用 postId | 62/91 | 69/98 | 失败/手动记录不产 postId，属正常 |

> ⚠️ 活库是**移动靶**（别的会话在持续发布与回采）。**结论是「`publish_history_id` 全 NULL」，不是「69 或 73 这个数」**；
> 复跑命令见 §八 末尾。把行数当常数写进文档，就是给下一个会话留一张过期的白名单。

## 三、数据校验（每条不成立都要出声，不得静默）

| # | 判据 | 不成立时的行为 | 实现位置 |
| --- | --- | --- | --- |
| 1 | `task.id` 必须是非空字符串 | 不写该键（保持 NULL），并 `log.warn` 点名「无任务 id 不建关联」 | 写侧 |
| 2 | 历史记录的 `taskId`/`result.postId`/`platform` 三者齐备才进索引 | 跳过该条并计数 `historySkipped` | 回填 |
| 3 | `(platform, post_id)` 在历史里**恰好命中 1 条**才回填 | 计入 `ambiguous`，**不写**（宁可留空也不猜） | 回填 |
| 4 | 只补 `publish_history_id IS NULL` 的行 | 已有值一律不动（幂等 + 不覆盖用户/既有数据） | 回填 |
| 5 | `post_id` 为空则不参与匹配 | 计入 `skippedEmptyPostId` | 回填 |
| 6 | 归属必须同桶：**SQL 端**按 owner 过滤候选，判据层再按桶校验一次 | 不同归属 ⇒ 查无落 `unmatched`；tracked 行 owner 为 NULL/空 ⇒ 判"无法判定归属"记 `unowned` 且不写（**方向是故意的**：把 NULL 也算进 legacy 桶会让归属未知的行被任意历史认领） | 存储层 + 回填 |
| 7 | 关联来源限定为**成功发布**（`record.status === 'success'`） | 非成功行不入索引，记 `historySkipped`（当前 `task:failed` 写 `result:null` 本就不会命中，但"当前不会发生"不是判据——QM-6 B1） | 回填 |
| 8 | 歧义按**去重后的 taskId 数**判，不按历史行数 | 同一任务因审核回写留下的重复行**不算**歧义（原口径会把可判的误判成猜不出——QM-6 B5） | 回填 |
| 9 | 关联键与行 id 都必须 `trim()` 后非空 | 空白串（`'   '` 是 truthy）一律拒：写进去既永远 join 不上、又让 `IS NULL` 从此不成立 ⇒ 该行被永久锁死在"无数据"（QM-6 替代通道 FB4） | 存储层 |
| 10 | 历史被上限截断必须如实报出 | `historyTruncated` 由调用方从 `listRecords` 的 `total` 转发；截断时进 info 日志。**注释承诺过而未实现过一次**（QM-6 B7），现由两条用例双向钉住：截断要报、未截断不得谎报 | 回填 |
| 11 | 回填候选为空时**不得发出任何 UPDATE** | 返回 `linked=0` 且 `writesAttempted=0` | 回填 |
| 12 | 存储层不可用（`_ready=false`）时返回 `null`/零计数，不抛错 | 与既有 mixin 口径一致 | 回填 |
| 13 | 读历史抛错**不得** latch 整个会话 | `linkExistingTrackedContent` 返回 `ok:false` ⇒ 下一次发布再试；抛错也不得冒泡进发布主流程（QM-6 B2/W2） | 接线 |

判据 3、4、6 是本刀的"宁缺毋滥"边界：**把 27 行接对，比把 70 行接错更有价值**——
错接的表现为"某条历史显示了别人的阅读量"，那是数据真实性事故，比空白严重。

## 四、流程

```
发布成功 task:success
   ├─ 1) emitter 发进度终态（既有）
   ├─ 2) history.addRecord({platform,title,taskId,status,result,…}, ownerSubject)
   ├─ 3) 审计回查门（既有）
   ├─ 4) store.addTrackedContent({platform, postId, url,
   │                                publishHistoryId: String(task.id),   ← 本刀新增（语义＝任务 id）
   │                                rewriteHistoryId, recrawlStatus, nextRecrawlAt, ownerSubject})
   └─ 5) 本会话首次走到这里 ⇒ linkExistingTrackedContent(...)  ← 存量回填（每进程一次）
          ① 读历史 → 建 (归属, platform, postId) → [taskId] 索引
          ② SELECT 候选：publish_history_id IS NULL（post_id 空/无主在判据层再筛）
          ③ 唯一命中者逐行 UPDATE（SQL 端再要一次 IS NULL 兜底）；歧义不写
          ④ 返回 {scanned, linked, ambiguous, unmatched, alreadyLinked, skippedEmptyPostId,
                   unowned, historySkipped, writesAttempted, writeFailed}
             并在 linked/ambiguous/writeFailed 任一 >0 时留一条 info 汇总
```

**为什么触发点不是"应用启动接线"**：启动时 Logto 身份可能还没解析完，拿不到 `owner_subject`
就无法安全地按归属配对（要么漏配、要么跨归属互链）。放在**首次 `task:success`** 里，
`owner_subject` 由任务本身带过来，是免费的确定证据；而这条路径本来就是发布主流程的旁路
（`try/catch` 只 warn），不会拖累发布。跑完后候选集为空 ⇒ 之后每次发布只多花一条带索引的 SELECT。

不做成"每次读列表都尝试回填"，因为那会把写操作塞进读路径（`listTrackedContent` 是渲染层每页都调的）。

## 五、功能逻辑

- 写侧透传是**根因修复**：此后每次成功发布产生的 `tracked_content` 行天然带关联。
- 回填是**存量修复**：解决"回采早就在跑、历史页却一直空"的既有 27 行。
- 二者共用同一条判据：**关联键的值就是 `task.id`**，由跨模块契约锁（§八 T3）钉住，
  任何人改读侧或写侧只要语义漂移就红。
- 不做的事：
  - ❌ 不改 `publish_history_id` 列名（改列名要动 DDL 与迁移，收益只是命名洁癖，风险是跨会话并发）；
    改为在 DDL 注释 + 写入点 + 读侧三处写同一句语义说明。
  - ❌ 不修 `rewrite_history_id` 恒 NULL（那是**第二跳**：改写 id 由 `rewrite-engine.js:231` 挂在 IPC 返回值上，
    渲染层发布载荷从未回传，属跨层合同缺失，需单独切片，见 §十）。
  - ❌ 不新增 UI 入口或文案（回填是启动自愈，界面无变化）。

## 六、交互逻辑与显示项

本刀**无新增交互**，改变的是既有列从恒空变为有值：

| 显示项 | 位置 | 修复前 | 修复后 |
| --- | --- | --- | --- |
| 阅读 / 点赞 / 评论 / 收藏 / 转发 | `PublishHistory.vue` 卡片表现列 | 恒空（`tracked` 永远查不到） | 有快照则显示数值；无快照仍为空 |
| 回采状态徽标（`recrawlStatus`） | 同上 | 恒不显示 | 关联成功时显示 |
| 空态文案 | 同上 | 已存在，不改 | 不改（不新增 locale 键） |

**不回退既有语义**：`record.taskId || record.id` 的兜底保持原样；手动补录（`openManualEntry`）路径不动。

## 七、提示文字（全部为日志，不进界面）

| 场景 | 级别 | 文案（ASCII 前缀 + 中文说明） |
| --- | --- | --- |
| 回填补齐 | info | `PerformanceLoop linked tracked content to publish history: linked=N scanned=M` |
| 存在歧义键 | info | `PerformanceLoop ambiguous history keys skipped: K` |
| 无候选（正常稳态） | debug，不得刷屏 | 不记 info（否则每次启动都写一行，掩盖真实事件） |
| 写侧缺 `task.id` | warn | `PerformanceLoop publish task has no id, tracked_content left unlinked` |
| 存储未就绪 / 历史读取失败 | warn | 沿用既有 `log.warn('Store', …)` 口径 |

> 日志文案一律 ASCII，不含中文字符串字面量（CI Gate 7 的 CJK 扫描对 `console.warn` 一并拦截，见 AGENTS.md）。

## 八、测试矩阵与反证

| # | 用例 | 判据形态 | 反证（必须实测变红） |
| --- | --- | --- | --- |
| T1 | `task:success` ⇒ `addTrackedContent` 收到 `publishHistoryId === task.id` | 行为锁（注入假 store 抓参数） | 摘掉写侧那一行 ⇒ 红 |
| T2 | `task.id` 缺失 ⇒ 该键为 `null` 且发 warn | 行为锁 + 日志锁 | 改成 `String(task.id)`（undefined→"undefined"）⇒ 红 |
| T3 | **跨模块契约**：用**生产同款** `sqlite-wrapper`（sql.js wasm）+ 真 `migratePerformanceLoopSchema` 建表 + 真 mixin 跑完整链路（`node:sqlite` 只用于 §二 的活库取证，两者不要混写——QM-6 后端轴 B8 纠正过这句），`SELECT publish_history_id` 必须等于 `task.id`，且用读侧同一段投影（`record.taskId \|\| record.id`）能查到该 tracked 行 | 从真入口进、用真实现 | 写侧改存 `entry.id` ⇒ 红（这正是命名陷阱的守门人） |
| T4 | 回填：唯一命中 ⇒ 补上；歧义 ⇒ 跳过并计数 | 行为锁（真库 + 真历史 JSONL 夹具） | 把歧义判据改成"取第一条" ⇒ 红 |
| T5 | 回填幂等：第二次跑 `linked=0` 且 `writesAttempted=0` | 计数锁 | 去掉 `IS NULL` 条件 ⇒ 红（会重复覆盖） |
| T6 | 回填不动已有值、不动 `post_id` 空行、不动无主行 | 快照对比锁 | 去掉归属过滤 ⇒ 红 |
| T7 | 候选为空 ⇒ 一条 UPDATE 都不发 | `writesAttempted===0` | 把候选查询写成无条件 ⇒ 红 |
| T8 | 存储未就绪 ⇒ 返回零计数不抛错 | 边界锁 | 去掉 `_ready` 守卫 ⇒ 抛错变红 |
| T10 | 非 success 历史不得入索引 | 行为锁 | M9 ⇒ 红 |
| T11 | 候选查询必须在 SQL 端按归属过滤 | 行为锁（真库两种 owner 分支各一条） | M10 ⇒ 红 |
| T12 | 空白关联键/空白行 id 必须拒 | 边界锁 + "之后仍能写正确值"的反假通过断言 | 改回 `!publishHistoryId` ⇒ 红 |
| T13 | 抛错不 latch、同接线只跑一次 | 计数锁（`listRecords` 调用次数） | M11（latch 提前）⇒ 红 |

既有逃逸说明（QM-5 第 2 步）：`apps/desktop/electron/bootstrap/phase4-events.test.js` 对
`addTrackedContent` **零断言**（实测 `grep -c 'addTrackedContent' = 0`），所以这个 bug 从落地起
就没有任何一层测试能看见；单元/集成/视觉/审查四层同时沉默。T1–T3 就是补这条缝。

### 8.1 反证实跑结果（2026-10-04，**12/12 变红**且逐条归因到用例名；M9–M12 由 QM-6 评审驱动新增）

驱动：`node D:/Data/projects/.tools/tmp/p02-counterproof.js`（每条变异限定在目标文件区段、
逐条记录变红的**用例名**、结束后断言与被变异前**逐字节相同**）。

| 变异 | 结果 | 变红的用例 |
| --- | --- | --- |
| M1 写侧删掉 `publishHistoryId` 透传 | 红 | T1/T3；接线锁「写侧那一行必须真的把 publishHistoryId 交出去」 |
| M2 写侧改用历史行 `entry.id` | 红 | T1/T3、T2、T4/T5 |
| M3 判据层去掉歧义保护 | 红 | T6；「同一 (platform, postId) 命中两条历史 ⇒ 跳过」；「存在歧义键时要单独留痕」 |
| M4 判据层去掉「已有值不动」 | 红 | 「已有 publish_history_id 的行一律不动」 |
| M5 存储层 SQL 去掉 `IS NULL` 兜底 | 红 | T9「存储层 SQL 的 IS NULL 兜底必须自己守住」 |
| M6 判据层去掉归属分桶 | 红 | 「跨归属不得互链」；「同一作品被两个用户各发一次 ⇒ 各自接自己的任务」 |
| M7 编排层去掉 store 方法缺席守卫 | 红 | 「store 未就绪 ⇒ 返回零计数且不抛错，并留一条 warn」 |
| M8 稳态也出声 | 红 | 「有实际补齐时才出声；稳态不得每次启动都写一行 info」 |

**M5 的第一版是绿的**——这不是"SQL 兜底没用"，而是**当时没有任何用例能从那个出口红**：
判据层已经跳过已有值，所以存储层那条 `AND publish_history_id IS NULL` 在旧夹具里不可表示。
补了 T9（绕过判据层直接对已有关联的行再写一次）之后才有独占红出口。
教训同「多条判据里只要有一条没有独占红出口，它就是装饰」：**加了兜底就必须写一条只有它能挡的用例**。

### 8.2 反证驱动自己踩到的三个坑（都曾伪装成"锁没抓住"）

1. **`execSchemaSql` 是双参回调**：夹具里写成 `(sql) => db.execOrThrow(sql)`，把 `db` 当 SQL 交给 sql.js，
   它**不报错也不建表**（实测 `sqlite_master` 为空）。⇒ 夹具必须自证「真迁移建出了那 4 张表」，
   否则后面每条断言都以"查不到行"的形式把排查方向带偏。
2. **多行锚点必须按文件真实行尾拼**：`phase4-events.js` 是 **CRLF**，驱动里用 `\n` 拼锚点 ⇒ 零命中，
   而零命中只能标 `ANCHOR_MISS`，不得写成"锁失效"。M2 第一版正是这样被误标过一次。
3. **计数与用例名来自两条不同的正则**：汇总行 `Tests N failed` 取到了数，
   而取名字的正则写成 `^ × `（vitest 实际缩进 5 空格）⇒ 名字恒空，出现"failed=2 但说不出哪条红"。
   ⇒ 驱动现在加了 `PROBE_NAMES_UNPARSED`：`failedNum>0 && names.length===0` 直接判**探针故障**。

### 8.3 复跑取证（只读，仓库根执行）

```bash
# ① 关联键是否仍是全 NULL（本刀合并后新发布的行应开始有值）
node -e "const {DatabaseSync}=require('node:sqlite');
const db=new DatabaseSync('shared-user-data/multi-publish.db',{readOnly:true});
console.log(db.prepare('SELECT COUNT(*) total, SUM(CASE WHEN publish_history_id IS NULL THEN 1 ELSE 0 END) nulls FROM tracked_content').get());
db.close();"

# ② 可回填域：按 (归属,平台,作品 id) 统计唯一命中与歧义
node /d/Data/projects/.tools/tmp/p01-backfill-measure.js
```

## 九、验收

1. 单测全绿（判据 25 例 + 契约 14 例，消费者并集 6 文件 177 passed），且 12 条反证每条都**实跑变红并按用例名归因**；
2. 本地门禁：locale 成对/键集/CJK（本刀不新增键，应仍 PASS）、品牌残留、max-lines、gate-record-debt、ESLint；
3. `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致；
4. 真机不强制：关联正确性的判据在 T3 的真库里已闭环（渲染层那段 join 被逐字搬进测试）。

## 十、残余（本刀明确不修，各附证据）

1. **`rewrite_history_id` 仍恒 NULL**：`rewrite-engine.js:231` 只把 id 挂在 `rewrite()` 的**返回值**上，
   经 `ipc-handlers/ai.js:92` 回到渲染层；而 `phase4-events.js:148` 读的是 `task.rewriteHistoryId || task.article?.rewriteHistoryId`
   —— 发布载荷从未携带它。修法要定「改写 id 由谁在何时写进文章对象」，属渲染层↔主进程跨层合同，单独切片。
2. **45/73 行 `post_id` 为空**（2026-10-04 复测；2026-10-03 为 42/69）：这些是 `untrackable`/仅 URL 的行，按内容 id 无从回填；
   真要救只能按 URL 匹配，而 URL 在不同平台形态不一（是否带 query、是否短链），判据不成立前不猜。
3. **`INSERT OR REPLACE` 无业务幂等键**：`addTrackedContent` 不传 `id` 时每次生成新 id，
   同一作品重复发布会产生多行 tracked（本刀未改；改它要先定"重复发布算不算同一 tracked"，属产品决策）。
4. **`performance_snapshot` 100% 落在 kuaishou**、四家平台零采集（§九 第 1 条的原始事实）：
   那是采集面缺口，需先回答"为什么采不到"，不在本刀。
5. ~~**`listUnlinkedTrackedForBackfill` 不带归属过滤**~~ → **已按 QM-6 结论修掉**（判据 6）：（只按 `publish_history_id IS NULL` + `LIMIT 5000`），
   真正的归属隔离发生在判据层的分桶里。实测本机活库只有 **1 个 owner / 73 行**
   （`SELECT owner_subject, COUNT(*) FROM tracked_content GROUP BY 1`）⇒ 当前不可能出现
   "别人的行占满 LIMIT、我的行永远排不到"。多用户共享同一库时该风险成立，
   届时正解是 SQL 端按 owner 过滤（而不是抬高 LIMIT）。本条留作已知边界，不在本刀改：
   改它要先确认 `owner_subject` 在写侧已稳定落值（实测 73/73 有值），
   而历史 JSONL 侧存在无该字段的旧行，两侧口径要一起定。
