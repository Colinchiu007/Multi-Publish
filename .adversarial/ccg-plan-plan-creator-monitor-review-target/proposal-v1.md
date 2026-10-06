# 评审提案 v5：博主监控与采集（Creator Monitor & Collect）

> CCG 决策层评审目标。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`。
> 前四轮共 38 条意见已全部修订（含 4 轮的全部 Critical）。

## 1. 背景

长期关注多平台博主 → 定期监控 → 发现新作品 → 一键批量采集 → 送入 AI 写作。

**根因（代码实证）**：本仓无任何「博主」维度——`author` 只是字符串，无关注表，无「按账号列作品」能力，「已采集」是内存 Set 现算（`Collection.vue:1190`）刷新即丢。7 平台该能力实测为 0。

**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector`（366 行）**已实现完整频道枚举**，返回 `metadata.video_id/channel_id/thumbnails/transcript_source`——唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用。**

## 2. 锁定决策

D1 MVP=YouTube｜D2 采集库+送AI写作（排除搬运发布）｜D3 探测/采集配额独立｜D4 一键5/手动50/上限100，超限必提示禁静默截断｜D5 单条仅豁免数量上限｜D6 去重键 `(platform,external_id)`｜D7 新建独立表｜D8 失败分级｜D9 UI 标注能力等级｜D10 凭证单账号预留多账号｜D11 复用 base-adapter 护栏契约

## 3. 数据模型

3 张新表。**canonical ID**：博主 `external_id` 一律为 `channels.list` 返回的 `channelId`，4 种 URL 写法必须先解析再落库，**禁止用用户原始输入当 ID**（否则同一博主拆成 4 行）；解析失败拒绝写入不降级兜底。作品一律用 `videoId`。

**`viral_library` 反向映射**（该表无 `external_id`/`creator_id`）四条硬约束：① 索引必须 partial（`WHERE external_id <> ''`）——存量行全为空串，普通 UNIQUE 迁移瞬间抛错致**应用起不来**；② 单事务（BEGIN/COMMIT/ROLLBACK）——半迁移会形成「一边建了索引一边没加列」的死锁；③ 迁移前冲突预检，冲突非空**不静默去重**（删行即数据损失）；④ **不建外键**（存量行无 `creator_id`）。两表**非主从**：`viral_library` 是采集事实源、`creator_discoveries` 是发现事实源；删采集库条目→级联复位 discovery 为 `pending`；删发现记录→不动已采集内容。

**采集并发 claim + lease + fencing token**：`collecting` 态不足以防重复（手动与自动批量可同时命中、两窗口可撞）。单条原子 UPDATE 抢占 `pending|failed → collecting`，条件含 `claimed_by IS NULL OR lease_expires_at < now`。**只有 lease 不够**：过期后新 worker 接管，旧 worker 仍可能完成并覆盖（lost update）——故 `claim_token` 单调递增，**成功/失败提交必须匹配 token**，不匹配则放弃提交。心跳每 60s 续租（长视频字幕可能超 300s）。`attempt_count` 上限 5 次 + 10 分钟冷却。

## 4. 配额模型

**归属现实**：10,000 units/day 是 **Google Cloud 项目级**配额、非本应用独占，同 Key 用于其他工具会被共享消耗；本应用**读不到** Google 侧真实用量。切分按**相对比例**（探测15%/采集60%/余量25%），UI 如实表述为「本应用今日占用」而非「YouTube 剩余」。

单位成本：`playlistItems.list`=1（50条/页）、`channels.list`=1（仅首次解析）、`videos.list`=1（**50 id/次**）、字幕=0。稳态单次探测=1 unit；采集成本 `ceil(count/50)` → 5/50/100 条 = 1/1/2 unit。

**约束必须在配置变更时强制执行**，且必须覆盖绕行路径：① 所有 `creator_follows` 写入经**单一 service** 入口并调校验（禁止其他模块直连 store 写该表）；② **启动预检**——存量超限则降级运行 + 告警，**不删用户数据、不拒绝启动**（数据是用户的，无权替他删；拒绝启动等于应用不可用，用户无法自救）；③ **导入/恢复备份前**全量预检，失败**整体拒绝**（部分导入会留下无法判断来源的混合数据）；④ **批量改间隔**全量校验通过后在**单事务**内应用，任一不满足则 ROLLBACK，**不做部分应用**（部分应用会让 UI 显示的间隔与真实调度不一致）。

公式 `Σ(1440/interval_min) ≤ 探测池`：50@1h=1200 units 可行；间隔下限 5 分钟时 `1440/5×50=14400` 超限，故按间隔升序保底、其余跳过并在 UI 提示，**绝不静默饿死部分博主**。

## 5. 失败分级（按 reason，不按状态码）

**YouTube 的 `quotaExceeded` 返回 HTTP 403**——按状态码分类会把配额耗尽误判为真故障并累计到暂停，与「配额不惩罚」直接矛盾。

| 级 | 触发 | 计入失败 |
|---|---|---|
| A 节流 | `quotaExceeded`/`dailyLimitExceeded`/`rateLimitExceeded`/`userRateLimitExceeded`/无 reason 的 **429** | ❌ |
| A 瞬时 | 5xx/超时/传输层错 | ❌ 指数退避 |
| B 真故障 | `channelNotFound`/`playlistNotFound` | ✅ 连续3次暂停 |
| C 不可自愈 | `keyInvalid`/`accessNotConfigured`/401/403无reason | ✅ **首次即** `fatal_paused` |
| **item 单资源级** | `videoNotFound`/`invalidPageToken`/`ipRefererBlocked` | ❌ **仅该条，不动博主计数** |

分类**以 reason 为主因、状态码仅兜底**（`keyInvalid` 既可能 400 也可能 403）。兜底 fail-closed 取 B + 保留 200 字脱敏摘要。`videoNotFound` 单列的原因：它会让**一条已删视频永久停用整个博主**。

## 6. 调度改造

复用 `automation-scheduler`，改 3 处（`action.type` 硬编码于 `automation-task.js:111,164` + `_executeWithPolicy` 加 switch）。

**switch default：挂起该任务 + 隔离原始载荷，绝不 fallback 也绝不 throw**。`throw` 在调度循环里会中断**所有**任务触发（用户自动化全部静默停摆）；fallback 会静默跑错链路。**fail-closed 的正确边界是「对这条任务」而非「对系统」。** 隔离区：落库前脱敏（token/secret/cookie/长串）、上限 50 条、丢弃记日志、用户显式删除留审计、**从不自动删**（自动删=静默丢用户配置）。

## 7. 安全

API Key 走 `safeStorage` 加密，**永不跨 IPC 传渲染层**（只暴露 `status` + 末4位指纹）。四态可区分：`not_configured` / `unavailable`(safeStorage 不可用→整个功能 fail-closed，不降级明文) / `decrypt_failed`(DPAPI 损坏或换机) / `ok`——否则用户在换机后反复重填仍失败却不知原因。

## 8. 风险与验收

反爬（本期不实现）｜scheduler 回归（R1~R5）｜软依赖须 QM-1 打包实测。新增 4,530 行。验收 A1~A25。

## 9. 请复核

1. 配额四道防线是否仍有绕过路径？
2. fencing token 是否真正消除了 lost update？lease 300s / 心跳 60s 取值是否合理？
3. 失败分级是否覆盖 YouTube 实际错误形态（含 429/401/空 body）？
4. partial 索引 + 单事务 + 不建外键是否正确？
5. 「挂起任务而非 throw」的判断是否正确？