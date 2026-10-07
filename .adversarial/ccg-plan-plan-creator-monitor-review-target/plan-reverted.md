# 评审提案 v6：博主监控与采集

> 前五轮 46 条意见已全部修订。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`。

**背景**：长期关注博主 → 定期监控 → 新作品 → 一键批量采集 → 送 AI 写作。本仓**无任何「博主」维度**（`author` 仅字符串、无关注表、无按账号列作品、「已采集」是内存 Set 刷新即丢），7 平台该能力实测为 0。**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector` 已实现完整频道枚举，唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用。**

**决策**：YouTube 首批｜采集库+送AI写作（排除搬运发布）｜配额独立｜一键5/手动50/上限100，超限必提示禁静默截断｜单条仅豁免数量上限｜去重键 `(platform,external_id)`｜新建独立表｜失败分级｜UI 标能力等级｜凭证单账号预留多账号｜复用 base-adapter 护栏契约

**数据模型**：3 张新表。canonical ID：博主 `external_id` 一律为 `channels.list` 返回的 `channelId`，4 种 URL 写法先解析再落库，**禁止用原始输入**；解析失败拒绝不兜底。`viral_library` 反向映射四约束：① partial 索引（`WHERE external_id <> ''`）——存量行全为空串，普通 UNIQUE 迁移即抛错致**应用起不来**；② 单事务；③ 迁移前冲突预检、不静默去重；④ 不建外键。两表非主从：删除采集库条目→同事务复位 discovery 为 `pending`（分两次写会永久丢失该作品）。

**并发 claim + lease + fencing token**：`UPDATE ... RETURNING claim_token` 原子抢占（先查后改是竞态）。**所有行内变更与副作用都按 token CAS**——进度写入、lease 续期、`viral_library` 插入、熔断计数，漏一处旧 worker 即可覆盖或重复插入。心跳**仅有进展时**续租（无进展却续租 = 挂起任务永不过期）；另设总 deadline 600s 与分阶段超时（元数据30s/字幕120s/入库30s），与续租解耦。`attempt_count` 上限 5、冷却 10 分钟。

**配额**：10,000 units/day 是 **Google 项目级、非本应用独占**，读不到真实用量，故按相对比例切（探测15%/采集60%/余量25%）。探测=1 unit/次；采集 `ceil(count/50)`。**约束覆盖七条路径**（新增/改间隔/批量/导入/备份恢复/迁移/启动加载）：① 单一 service 入口；② 启动预检**降级运行而非拒绝启动**（数据是用户的，无权替他删）；③ 导入前全量预检、失败整体拒绝；④ 批量改间隔单事务、不做部分应用。启动超限的跳过集**确定性**：按 `interval ASC, created_at ASC` 保底，被跳过者不发请求不耗配额，调大间隔后下一轮自动恢复，UI 逐个列出。采集侧另有 90% 硬熔断 + 单次运行内 2 次重试预算（重试与回滚重跑均重新计费）。

**失败分级（按 reason，不按状态码）**：YouTube 的 `quotaExceeded` 返回 **403**，按状态码会把配额耗尽误判成故障并累计到暂停。优先级：① quota/rateLimit → A 节流（不计入）；② keyInvalid/accessNotConfigured/**ipRefererBlocked** → C 首次即 fatal；③ channelNotFound → B 连续3次暂停；④ **videoNotFound/invalidPageToken → item 级**（单条被删不该永久停用整个博主；`ipRefererBlocked` 是应用级403，**不能**归 item 否则监控静默失效）；⑤ 其余/无 → B 兜底 + 脱敏摘要 + `x-goog-request-id`。

**调度**：复用 `automation-scheduler`，改 3 处。未知 `action.type` **挂起该任务 + 隔离原始载荷**，绝不 throw（会在调度循环里中断**所有**任务触发）也绝不 fallback（静默跑错链路）。**fail-closed 的边界是「这条任务」而非「对系统」。** 隔离区脱敏 + 上限 50 条 + 用户显式删除留审计 + 从不自动删。

**安全**：API Key `safeStorage` 加密。**IPC 双向不对称**——写入方向允许一次性 set（用户必须在渲染层输入，无法回避），**读取方向永不回传明文**（渲染层是 XSS 高暴露面）；保存后主进程即弃明文、渲染层立即清空输入框、不进任何持久化。

**请复核**：① claim 的 token CAS 是否已覆盖全部副作用路径？② 配额七路径是否仍有绕过？③ reason 优先级与 item/fatal 分界是否正确？④ 「挂起而非 throw」的爆炸半径判断？