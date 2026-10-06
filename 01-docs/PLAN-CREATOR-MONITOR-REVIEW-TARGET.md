# 评审提案 v3：博主监控与采集（Creator Monitor & Collect）

> CCG 决策层评审目标。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`（约 1000 行）。

## 1. 背景与根因

长期关注多平台博主，定期监控、发现新作品、一键批量采集（默认量+硬上限）；手动采集指定博主；单条采集体验明确。

**根因（代码实证）**：本仓无任何「博主」维度概念——`author` 只是字符串，无关注表，无"按账号列作品"能力，无周期内容监控，「已采集」是内存 Set 现算（`Collection.vue:1190`）刷新即丢。`collection-engine` 5 个 adapter 全是死代码一行未接线。**7 平台该能力实测为 0。**

**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector`（`content_aggregator_shared`，366 行）**已实现完整频道枚举**，返回 `metadata.video_id/channel_id/thumbnails/transcript_source`。唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用**——架构只保证其失效不拖垮整体。

## 2. 锁定决策

D1 MVP=YouTube｜D2 采集库+一键送AI写作（排除搬运发布）｜D3 探测/采集配额独立｜D4 数量双轨：一键5/手动50/上限100，超限必提示禁静默截断｜D5 单条仅豁免数量上限不豁免配额｜D6 去重键 `(platform, external_id)`｜D7 新建独立表｜D8 失败分级降级｜D9 UI 标注能力等级｜D10 凭证单账号预留多账号｜D11 复用 `base-adapter.js` 护栏契约重写 `_doFetch`

## 3. 数据模型

新建 3 表：`creator_accounts`(`UNIQUE(platform,external_id)`)、`creator_follows`(监控配置+状态机)、`creator_discoveries`(`UNIQUE`保证探测幂等；`collect_state: pending|collecting|collected|failed|skipped`；`attempt_count`/`last_error`；`content_quality: full|partial|stub`)。

**canonical ID 规则**：博主 `external_id` 一律为 API 返回的 `channelId`；`@handle`/`/c/`/`/user/`/`UC…` 四种输入必须先经 `channels.list` 解析再落库，**禁止用用户原始输入当 ID**（否则同一博主 4 个 URL 写法产生 4 行）。作品一律用 `videoId`。解析失败**拒绝写入**，不降级兜底。

**`viral_library` 反向映射**：该表无 `external_id`/`creator_id`，新增幂等迁移。三个关键约束：
1. 索引**必须 partial**（`WHERE external_id <> ''`）——存量行该字段全为空串，普通 UNIQUE 会在迁移瞬间因重复键抛错，**应用起不来**
2. 迁移**必须单事务**——半迁移会造成「discoveries 已建索引但 viral_library 未加列」的分叉，而 `CREATE TABLE IF NOT EXISTS` 不会补列，形成死锁
3. 迁移前跑冲突预检；冲突非空**不静默去重**（删行即数据损失），记录并提示人工处理
4. **不建外键**（存量行无 `creator_id`，外键会让迁移失败）

## 4. 配额模型（从物理池反推，不拍数字）

YouTube 物理上限 **10,000 units/day**。`playlistItems.list`=1（50条/页）、`channels.list`=1（仅首次）、`videos.list`=1（**50个id/次**）、字幕=0。

- 稳态单次探测 = **1 unit**
- 采集成本 `ceil(count/50)` → 一键5条=**1 unit**、手动50条=**1 unit**、上限100条=**2 unit**
- 切分：探测池 1500 / 采集池 6000 / 余量 2500
- 联立约束 `Σ(1440/interval_min) ≤ 1500` 且 博主数 ≤ **50**（50@1h=1200 units 贴边可行；第 63 个拒绝）
- 配额不足时**动态降级**：按间隔升序保底、其余跳过并在 UI 提示，**绝不静默饿死部分博主**
- 物理池 ≥80% 红色告警

## 5. 失败分级（按 API reason，不按状态码）

**YouTube 的 `quotaExceeded`/`rateLimitExceeded` 返回 HTTP 403**——按状态码分类会把配额耗尽误判为真故障并累计到暂停，与「配额不惩罚」直接矛盾。

| 级 | 触发 | 计入失败 | 策略 |
|---|---|---|---|
| A 节流 | `quotaExceeded`/`rateLimitExceeded`/无 reason 的 **429** | ❌ | 跳过本轮，无警告 |
| A 瞬时 | 5xx/超时/`ECONNRESET`/传输层错 | ❌ | 指数退避 1→4→16min |
| B 真故障 | `channelNotFound`/`playlistNotFound`/reason 缺失兜底 | ✅ | 连续 3 次 → `auto_paused` |
| C 不可自愈 | `keyInvalid`/`accessNotConfigured`/401/403无reason | ✅ | **首次即** `fatal_paused`，UI 直达设置页 |

兜底保留 200 字脱敏响应摘要供诊断。5xx/网络移出「计入」是因为 1 小时间隔下连续 3 次 5xx 需跨 3 小时才暂停，期间白白损失监控。

## 6. 调度改造

复用 `automation-scheduler`（复用触发器匹配/间隔钳制5~1440min/持久化/任务数上限），需改 3 处（`action.type` 硬编码于 `automation-task.js:111,164` + `_executeWithPolicy` 加 switch + `container.setup.js` 装配）。

**switch default：挂起该任务并留痕，绝不 fallback 也绝不 throw**。`throw` 会中断调度循环导致**所有**自动化停摆；fallback 会静默跑错链路。fail-closed 的正确边界是**对这条任务**，不是对系统。挂起后显示 `unknown_paused` + 可编辑恢复。

回归测试 R1~R5 必覆盖：既有 pipeline 任务正常、未知类型挂起不执行、creatorMonitor 不进 pipeline、持久化格式不变、间隔钳制两类一致。

## 7. 安全

API Key 走 `safeStorage` 加密落 settings，**永不跨 IPC 传给渲染层**（IPC 只暴露 `hasApiKey`/`fingerprint` 末4位）；禁明文/禁日志/禁崩溃报告；`safeStorage` 不可用时**整个监控功能禁用**（fail-closed，不降级明文）。

## 8. 风险与验收

风险：反爬（本期不实现）；scheduler 改造回归（靠 R1~R5 对冲）；`content-aggregator`/`youtube-transcript-api` 为软依赖须 QM-1 打包实测。

规模：新增 4,530 行 / 改动 9 文件 / 共 19 文件。验收 A1~A25。

## 9. 请重点复核

1. 配额反推是否自洽？1500 探测池 + 50 上限是否合理？
2. 失败分级是否覆盖 YouTube 实际错误形态（含 429/401/空 body）？
3. partial unique index + 单事务迁移 + 不建外键，是否是存量数据的正确处理？
4. 「挂起该任务而非 throw」的爆炸半径判断是否正确？
5. `collecting` 易失态的崩溃复位方案是否充分？
6. 排除「一键搬运发布」是否削弱本特性价值？