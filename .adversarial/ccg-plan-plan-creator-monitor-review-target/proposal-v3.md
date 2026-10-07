# 评审提案 v6：博主监控与采集

> 前五轮 46 条意见已全部修订。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`。

**背景**：长期关注博主 → 定期监控 → 新作品 → 一键批量采集 → 送 AI 写作。本仓**无任何「博主」维度**（`author` 仅字符串、无关注表、无按账号列作品、「已采集」是内存 Set 刷新即丢），7 平台该能力实测为 0。**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector` 已实现完整频道枚举，唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用。**

**决策**：YouTube 首批｜采集库+送AI写作（排除搬运发布）｜配额独立｜一键5/手动50/上限100，超限必提示禁静默截断｜单条仅豁免数量上限｜去重键 `(platform,external_id)`｜新建独立表｜失败分级｜UI 标能力等级｜凭证单账号预留多账号｜复用 base-adapter 护栏契约

**数据模型**：3 张新表——`creator_watch`（博主关注表：`platform` + `external_id` 唯一键、`interval_seconds`、`status` active/paused、`created_at`，博主维度唯一真源，监控轮次、配额跳过集与 UI 关注列表均读它）、`discovered_item`（发现执行表：`claim_token`、`lease`、`attempt_count`、`discovery_status`）、`viral_library`（采集库）。canonical ID：博主 `external_id` 一律为 `channels.list` 返回的 `channelId`，4 种 URL 写法先解析再落库，**禁止用原始输入**；解析失败拒绝不兜底。`viral_library` 反向映射四约束：① partial 索引（`WHERE external_id <> ''`）——存量行全为空串，普通 UNIQUE 迁移即抛错致**应用起不来**；② 单事务；③ 迁移前冲突预检、不静默去重；④ 不建外键——两表以 `(platform, external_id)` 关联，`viral_library` 与 `discovered_item` 各自唯一键同构为 `(platform, external_id)`；复位由统一删除 service 在同一事务按该键完成。`viral_library` 的一切删除（UI 删除、导入覆盖、清理孤儿）必须走**统一删除 service**，复位在同一 service 的同一事务内完成，禁止调用点各自 DELETE。两表非主从：删除采集库条目→同事务复位 discovery 为 `pending`（分两次写会永久丢失该作品）。

**并发 claim + lease + fencing token**：`UPDATE ... RETURNING claim_token` 原子抢占（先查后改是竞态）。**token CAS 只作状态门，不作用于已发出的外部请求**——进度写入、lease 续期、熔断计数等行内变更按 CAS；每次外部调用前重验 lease，过期即放弃后续动作；入库在同一事务内重验 token 且以 `(platform,external_id)` 唯一键幂等，重复插入自动忽略。`viral_library` 插入不得先查 token 再插另一表（TOCTOU 仍在）：token 校验与插入必须放进同一 `BEGIN IMMEDIATE` 事务内原子完成，任一步失败整体回滚。心跳**仅有进展时**续租（无进展却续租 = 挂起任务永不过期），进展粒度定义为**阶段边界（元数据/字幕/入库切换）或字幕下载的字节级回调**；回调按「距上次续租 ≥2s 或累计 ≥64KB」节流后才写续租，避免高频库写与锁竞争，长字幕阶段不会被误判过期；另设总 deadline 600s 与分阶段超时（元数据30s/字幕120s/入库30s），与续租解耦。`attempt_count` 上限 5、冷却 10 分钟。

**配额**：10,000 units/day 是 **Google 项目级、非本应用独占**，读不到真实用量，故按相对比例切（探测15%/采集60%/余量25%），该比例只约束本应用内部；另以本应用实收的 429/quotaExceeded 做**动态收缩**：滑动窗 10 分钟内 ≥3 次配额信号降一级（60%→45%→30%→15%→暂停），最小档 15%；窗口内 0 信号且持续 30 分钟回升一级；级别状态持久化、重启恢复；UI 显示当前档位。探测=1 unit/次；采集 `ceil(count/50)`。**约束覆盖七条路径**（新增/改间隔/批量/导入/备份恢复/迁移/启动加载）：① 单一 service 入口；② 启动预检**降级运行而非拒绝启动**（数据是用户的，无权替他删）；③ 导入前全量预检、失败整体拒绝；④ 批量改间隔单事务、不做部分应用，并递增配置版本号：运行中 claim 校验版本，版本变化即取消本轮（按页 checkpoint 保留已抓结果），新间隔下一轮生效。启动超限的跳过集**确定性**：按 `interval ASC, created_at ASC` 保底，被跳过者不发请求不耗配额，调大间隔后下一轮自动恢复，UI 逐个列出。采集侧另有 90% 硬熔断：分母为**当日采集份额 60%**，分子为估算已耗 units（探测+采集+重试），跨日窗口重置，触发即停本轮；优先级 熔断 > 动态收缩 > 比例切分，UI 显示熔断态。单次运行内 2 次重试预算（重试与回滚重跑均重新计费）。

**失败分级（按 reason，不按状态码）**：YouTube 的 `quotaExceeded` 返回 **403**，按状态码会把配额耗尽误判成故障并累计到暂停。优先级：① quota/rateLimit → A 节流（不计入）；② keyInvalid/accessNotConfigured/**ipRefererBlocked** → C 集成级 fatal：置凭证状态失效、联动暂停全部关联任务（不逐博主重复触发），UI 引导重输 Key 后统一重验恢复；③ channelNotFound → B 连续3次暂停；④ **videoNotFound → item 级**（单条被删不该永久停用整个博主；`ipRefererBlocked` 是应用级403，**不能**归 item 否则监控静默失效）；**invalidPageToken → B 级任务级**（分页实现缺陷或 token 过期，非单条问题，归 item 会静默跳过后续分页）：按页入库并持久化 next page token checkpoint，重试从 checkpoint 续跑，已完成页靠唯一键幂等不重复，日志告警；⑤ 其余/无 → B 兜底 + 脱敏摘要 + `x-goog-request-id`。

**调度**：复用 `automation-scheduler`，改 3 处。未知 `action.type` **挂起该任务 + 隔离原始载荷**，并立即向 UI 推送徽标/通知（任务名 + 载荷摘要）且在任务列表标记 `suspended`，防止长期无人察觉；绝不 throw（会在调度循环里中断**所有**任务触发）也绝不 fallback（静默跑错链路）。**fail-closed 的边界是「这条任务」而非「对系统」。** 隔离区脱敏 + 上限 50 条 + 用户显式删除留审计 + 从不自动删。

**安全**：API Key `safeStorage` 加密；解密失败（OS 密钥重置、跨设备迁移）不视为数据丢失——标记为待重新输入并由 UI 引导重输新 Key（复用 `keyInvalid` 提示路径），不清除其余配置、不静默失败。**IPC 双向不对称**——写入方向允许一次性 set（用户必须在渲染层输入，无法回避），**读取方向永不回传明文**（渲染层是 XSS 高暴露面）；保存后主进程即弃明文、渲染层立即清空输入框、不进任何持久化。

**请复核**：① claim 的 token CAS 是否已覆盖全部副作用路径？② 配额七路径是否仍有绕过？③ reason 优先级与 item/fatal 分界是否正确？④ 「挂起而非 throw」的爆炸半径判断？