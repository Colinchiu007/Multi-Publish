# 评审提案 v4：博主监控与采集（Creator Monitor & Collect）

> CCG 决策层评审目标。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`（1168 行）。

## 1. 背景

长期关注多平台博主→定期监控→发现新作品→一键批量采集（默认量+硬上限）；手动采集指定博主；单条采集体验明确。

**根因（实证）**：本仓无任何「博主」维度——`author` 只是字符串，无关注表，无「按账号列作品」能力，「已采集」是内存 Set 现算（`Collection.vue:1190`）刷新即丢。7 平台该能力实测为 0。

**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector`（366 行）**已实现完整频道枚举**。唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用。**

## 2. 锁定决策

D1 MVP=YouTube｜D2 采集库+送AI写作（排除搬运发布）｜D3 探测/采集配额独立｜D4 一键5/手动50/上限100，超限必提示禁静默截断｜D5 单条仅豁免数量上限｜D6 去重键 `(platform,external_id)`｜D7 新建独立表｜D8 失败分级｜D9 UI 标注能力等级｜D10 凭证单账号预留多账号｜D11 复用 base-adapter 护栏契约

## 3. 数据模型

3 张新表：`creator_accounts`、`creator_follows`、`creator_discoveries`。

**canonical ID**：博主 `external_id` 一律为 `channels.list` 返回的 `channelId`；4 种 URL 写法必须先解析再落库，**禁止用用户原始输入当 ID**（否则同一博主拆成 4 行）。解析走显式 resolver 矩阵（URL 形态 → API 参数 → 错误 → unit 成本）：`/channel/@handle` 与 `@handle` 用 `channels.list(forHandle=)`（1 unit）；`/user/legacy` 用 `forUsername`（1 unit）；`/c/custom` 直解失败才用 `search.list`（10 units，计入探测池）。矩阵配预检测试；解析失败拒绝写入，不降级兜底。

**`viral_library` 反向映射**（该表无 `creator_id` 列，`external_id` 存量可能为空串）：单事务迁移 + partial 唯一索引 `(platform, external_id) WHERE external_id <> ''`（对齐 D6，防跨平台同 ID 相撞；普通 UNIQUE 会因存量空串重复键抛错致**应用起不来**）+ 迁移前冲突预检按 `(platform, external_id)` 同键执行（冲突非空不静默去重）+ `creator_id` 允许为空（存量行无映射）+ **不建外键**（存量行无 `creator_id`，外键会让迁移失败）。

**采集并发 claim + lease**：`collecting` 态不足以防重复（手动与自动批量可同时命中、两窗口可撞）。用单条 UPDATE 原子抢占 `pending|failed → collecting`，条件含 `claimed_by IS NULL OR lease_expires_at < now`；未抢到直接返回「正在采集中」；lease 300s 过期可被接管，但旧 worker 的完成/失败 UPDATE 必须匹配本次 claim token，token 不符即丢弃其结果；长采集用心跳续租（每 60s 续至 +300s）。`attempt_count` 在 claim 时递增，上限 3 次，超限按 1h/6h/24h 冷却后再入队。**绝不做先查后改。**

**两表事实源**：`viral_library` 是采集事实源，`creator_discoveries` 是发现事实源，**非主从**。删除采集库条目 → 级联把 discovery 复位 `pending`；删除发现记录 → 不动已采集内容。取消关注 → 保留内容仅停监控。

## 4. 配额模型

**配额归属现实**：10,000 units/day 是 **Google Cloud 项目级**配额，非本应用独占；同 Key 用于其他工具会被共享消耗。切分必须是**相对比例**（探测15%/采集60%/余量25%），UI 如实表述为「本应用今日占用」而非「YouTube 剩余」。

单位成本：`playlistItems.list`=1（50条/页）、`channels.list`=1（仅首次）、`videos.list`=1（**50 id/次**）、字幕=0。稳态单次探测=1 unit。采集成本 `ceil(count/50)`：5/50/100 条 = 1/1/2 unit。

**⚠ 约束必须在配置变更时强制执行**（此前 Critical）：公式 `Σ(1440/interval_min) ≤ 探测池` 写了却只按默认 1 小时验证过；而间隔下限 5 分钟，全设 5 分钟即 `1440/5×50=14400 units`，是探测池的 9.6 倍。故所有配额相关变更（新增/改间隔/批量调整/导入/恢复备份/迁移/启动加载/直接写库）必须收敛到单一 service，在同一 DB 事务内重算并落库，超限即事务整体回滚（批量调整**整体拒绝不做部分应用**）；启动/导入/迁移先全量预检，失败全量拒绝并补用例。参考：50 个博主需 ≥60 分钟间隔；51~62 需 ≥1440 分钟；>62 不支持。

## 5. 失败分级（按 reason，不按状态码）

**YouTube 的 `quotaExceeded` 返回 HTTP 403**——按状态码分类会把配额耗尽误判为故障并累计到暂停。

| 级 | 触发 | 计入失败 |
|---|---|---|
| A 节流 | `quotaExceeded`/`dailyLimitExceeded`/`rateLimitExceeded`/`userRateLimitExceeded`/无reason的 **429** | ❌ |
| A 瞬时 | 5xx/超时/传输层错 | ❌ |
| B 真故障 | `channelNotFound`/`playlistNotFound`/reason 缺失兜底 | ✅ 连续3次 |
| B′ 资源/参数错 | `videoNotFound`/`invalidPageToken` | ❌ 单条跳过，不进停用计数 |
| C′ 配置错（带 reason） | `ipRefererBlocked`/`forbidden` | ✅ **首次即** `fatal_paused` |

reason 清单以 YouTube 官方枚举为预检用例集；配置类与非频道资源错误均不进 B 的连续停用。
| C 不可自愈 | `keyInvalid`/`accessNotConfigured`/401/403无reason | ✅ **首次即** `fatal_paused` |

分类**以 reason 为主因、状态码仅兜底**（`keyInvalid` 既可能 400 也可能 403）。兜底 fail-closed 取 B：分类失败本身要暴露，放行会让所有未识别错误无声跳过。

## 6. 调度改造

复用 `automation-scheduler`，改 3 处（`action.type` 硬编码于 `automation-task.js:111,164` + `_executeWithPolicy` 加 switch）。

**switch default：挂起该任务 + 隔离原始载荷，绝不 fallback 也绝不 throw**。`throw` 会中断调度循环导致**所有**自动化停摆；fallback 会静默跑错链路。fail-closed 的边界是**对这条任务**。隔离区保留 JSON + 来源标注：落库前按字段白名单脱敏（token/账号/cookie 只留长度与指纹），设容量上限（默认 500 条 / 10MB），超限告警并停止新增、既有条目只读保留；不自动删除（自动删 = 静默丢用户配置），人工清理须记录操作者与原因。

## 7. 安全

API Key 走 `safeStorage` 加密落 settings，**永不跨 IPC 传渲染层**（只暴露 `hasApiKey`/`fingerprint`）；`safeStorage` 不可用时整个监控功能 fail-closed，不降级明文；对外暴露三态状态 `not_configured` / `decrypt_failed` / `platform_unavailable` 与 fingerprint，区分未配置与密钥不可恢复（DPAPI 损坏/换机/升级），日志只记状态与指纹，禁止输出明文。

## 8. 风险与验收

反爬（本期不实现）｜scheduler 改造回归（回归测试 R1~R5）｜软依赖须 QM-1 打包实测。新增 4,530 行 / 改动 9 文件。验收 A1~A25。

## 9. 请重点复核

1. 配额约束改在配置变更时强制执行，是否仍有绕过路径（导入/批量/迁移）？
2. claim+lease 的 SQL 条件是否真的无竞态？lease 时长取值是否合理？
3. 两表非主从的事实源划分是否自洽？
4. 失败分级以 reason 为主因是否覆盖 YouTube 实际返回？
5. 未知任务类型「隔离不自动删」是否会无限增长？
6. 排除「一键搬运发布」是否削弱价值？