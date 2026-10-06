# 评审提案：博主监控与采集（Creator Monitor & Collect）

> 本文件是 CCG 决策层评审目标（受 opencode 后端 7800 字符输入上限约束的精简版）。
> 完整实现规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`（718 行）。

## 1. 背景与根因

用户要长期关注抖音/小红书/知乎/视频号/公众号/X/YouTube 的博主，定期监控、发现新作品、一键批量采集（有默认量与硬上限）；也要能手动采集指定博主（可设数量）；单条采集体验需明确解决。

**根因（代码实证）**：本仓不存在任何「博主」维度概念。`author` 只是一个字符串；无关注表；无"按账号列作品"能力；无周期内容监控；「已采集」是运行时用内存 Set 现算（`Collection.vue:1190`），刷新即丢；采集落库是 settings 里的单个 JSON key。

**平台现实**：`collection-engine` 的 5 个 adapter 全是死代码，一行未接线；4 个 `_doFetch` 是空壳或缺失，视频号 Python 侧显式拒绝，X/YouTube 完全缺失。**7 个平台的"按博主列作品"能力实测为 0。**

**Why YouTube 优先**：外部依赖 `content-aggregator` 的 `YouTubeCollector`（`content_aggregator_shared`，366 行）**已实现完整频道枚举**（channels API 解析 `@handle`/`/c/`/`/user/`/`UC…`，playlistItems 拉上传列表），返回 `metadata.video_id` / `channel_id` / `thumbnails` / `transcript_source`。唯一能在不依赖反爬的前提下证明链路成立的平台。其余 6 平台中，抖音/小红书/视频号反爬是长期军备，**本方案不承诺长期稳定可用**——架构只保证它们失效时不拖垮整体。

## 2. 已锁定的决策（经用户两轮确认）

| # | 决策 |
|---|---|
| D1 | MVP 平台 = YouTube（知乎/B站留作后续适配器增量） |
| D2 | 采集物去向 = 采集库 + 一键送 AI 写作（复用既有 pipeline DAG）；**排除一键搬运发布** |
| D3 | 监控默认 1 小时可配；探测与采集**双轨配额独立** |
| D4 | 数量双轨：一键采集默认 5 / 手动批量默认 50 / 全局硬上限 100；**超限必提示，禁止静默截断** |
| D5 | 单条采集 = 发现列表每行一个零填参按钮；单条**不受数量上限约束**，重复采集拒绝 |
| D6 | 去重键 `(platform, external_id)` **落到 DB 唯一约束**（不用 URL——URL 可变，ID 稳定） |
| D7 | 新建独立 SQLite 表（不复用无唯一约束的 `viral_library`，不塞 settings JSON） |
| D8 | 连续失败 3 次 → `auto_paused` + UI 明示原因 + 「立即重试」；**配额类错误不计入连续失败**（配额耗尽是正常节流不是故障） |
| D9 | UI 显式标注能力等级 `official` / `best_effort` / `unsupported` |
| D10 | 凭证单账号起手，`credential_alias` 字段预留多账号 |
| D11 | 借形不借魂：保留 `base-adapter.js` 的护栏契约（缓存→预算→限流→熔断），重写 `_doFetch`；正文提取改用 `services/readable-text.js`（现有 `body.replace(/<[^>]+>/g,'')` 会丢换行） |

## 3. 数据模型（3 张新表）

- `creator_accounts`：博主实体，`UNIQUE(platform, external_id)`
- `creator_follows`：关注关系 + 监控配置 + 运行状态。状态机 `active → auto_paused`（连续失败 3 次）/ `paused_by_user`
- `creator_discoveries`：发现的视频（未采集）。`UNIQUE(platform, external_id)` 保证探测幂等；`collect_state: pending → collected|skipped`

DDL 按 `store-schema.js` 既有模式（`SCHEMA_SQL` 全 `IF NOT EXISTS`，该文件无 schema version，靠幂等重放）。采集成功的内容写入既有 `viral_library`（`source='creator'`），发现记录仅存元数据。

## 4. 必须改动的既有代码（非纯新增）

| 文件 | 原因 |
|---|---|
| `automation-task.js:111,164` | `action.type` 被硬编码为 `fullAutoPipeline` |
| `automation-scheduler.js:277-297` | `_executeWithPolicy` 无 switch，恒调 `pipeline.startRun()` |
| `container.setup.js:206-210` | 执行器装配点 |
| `url-collector.js:381-392` | `_platformFromHostname` 加 youtube 一行 |
| `Collection.vue:2283` | `TAB_KEYS` 加一项 + 一个 `v-else-if`（不动路由） |

**生命周期诚实声明**：最小化继续调度；关窗到托盘不保证；**完全退出即停且不补跑**（`automation-task.js:12-15` 明确不做补触发）。产品须告知用户。

## 5. 主要风险

1. **反爬**（抖音/小红书/视频号）——本期不实现；接入时熔断 + 自动暂停 + UI 标注「尽力而为」
2. **YouTube 配额**——双轨配额（探测 200/天，采集沿用平台策略）；限流不惩罚连续失败
3. **`automation-scheduler` 改造引入回归**——影响既有 4 类自动化任务，需补单测
4. **打包依赖**——`content-aggregator` 为可选依赖，`youtube-transcript-api` 是软依赖（缺失回落描述）；须在 QM-1 打包门禁实测 require 链

## 6. 规模与验收

预计新增 4,530 行 / 改动 9 文件 / 共 19 文件。验收 14 项，覆盖：4 种频道输入解析、探测幂等、默认量与上限、超限零副作用、单条持久标记、单条不受限、配额独立、3 次失败降级、限流不计数、能力徽章、送 AI 写作不触发 publish、重启不补跑。

## 7. 请评审者重点挑刺

1. 去重键选 `(platform, external_id)` 是否够？多平台下 `external_id` 语义是否可靠？
2. 探测/采集双轨配额是否合理？200/200 是否需要改成动态？
3. 「单条不受上限约束」是否会破坏预算约束？
4. 复用 `automation-scheduler` 改造 3 处 vs 新建独立调度器，哪个风险更低？
5. `auto_paused` 3 次阈值是否合理？误伤风险如何？
6. 排除「一键搬运发布」是否会削弱本特性的实际价值？