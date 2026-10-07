# 评审提案 v7：博主监控与采集

> 前六轮 54 条意见已全部修订。完整规格见 `01-docs/PRD-CREATOR-MONITOR-COLLECT-2026-10-07.md`。

**背景**：长期关注博主 → 定期监控 → 新作品 → 一键批量采集 → 送 AI 写作。本仓**无任何「博主」维度**（`author` 仅字符串、无关注表、无按账号列作品、「已采集」是内存 Set 刷新即丢），7 平台该能力实测为 0。**Why YouTube**：外部依赖 `content-aggregator` 的 `YouTubeCollector` 已实现完整频道枚举，唯一能不依赖反爬证明链路成立的平台。**抖音/小红书/视频号反爬是长期军备，不承诺长期稳定可用。**

**决策**：YouTube 首批｜采集库+送AI写作（排除搬运发布）｜配额独立｜一键5/手动50/上限100，超限必提示禁静默截断｜单条仅豁免数量上限｜去重键 `(platform,external_id)`｜UI 标能力等级｜凭证单账号预留多账号｜复用 base-adapter 护栏契约

**数据模型（3 张新表）**：
- `creator_accounts`：博主实体，`UNIQUE(platform, external_id)`；canonical ID 一律为 `channels.list` 返回的 `channelId`，4 种 URL 写法先解析再落库，**禁止用原始输入**（否则同一博主拆成 4 行），解析失败拒绝不兜底
- `creator_follows`：关注关系 + 监控配置 + 状态机（`active`/`paused_by_user`/`auto_paused`/`fatal_paused`）+ `consecutive_failures` + `retry_after_at`
- `creator_discoveries`：发现的作品（未采集），`UNIQUE(platform, external_id)` 保证探测幂等；`collect_state: pending|collecting|collected|failed|skipped`、`attempt_count`、`claim_token`、`claimed_by`、`lease_expires_at`、`transcript_source`、`content_quality`

`viral_library` 反向映射四约束：① partial 索引（`WHERE external_id <> ''`）——存量行全为空串，普通 UNIQUE 迁移即抛错致**应用起不来**；② 单事务；③ 迁移前冲突预检、不静默去重；④ 不建外键。两表非主从。**删除必须原子完成三件事**：`DELETE viral_library` + discovery 落回 **`pending`**（若仍是 `collected`，后续探测会因唯一键跳过 → 该作品**永久无法重新采集**）+ `claim_token + 1` 使在途 worker 失效 + 撤未 done 的 outbox。所有删除收敛到 `knowledge-library-service.delete*()` 唯一入口；另设**每日完整性巡检**兜底（`collected` 但无对应行 → 复位 `pending` + 记日志）——代码纪律不是机制，巡检才是兜底。

**并发 claim + lease + fencing token**：`UPDATE ... RETURNING claim_token` 原子抢占（先查后改是竞态）。所有行内变更与副作用按 token CAS。**⚠ 跨表副作用必须同事务**：`claim_token` 只存在于 `creator_discoveries`，写入 `viral_library` 是另一张表——「先查 token 再插另一表」有 TOCTOU 竞态（查完到插入之间 token 可能已被新 worker 提升→重复插入），token 校验 + 跨表插入必须同 `BEGIN IMMEDIATE` 事务原子完成。**但事务只保证数据库内原子**：字幕/媒体等产物写在事务外，「DB 已提交 collected 而产物写失败」的不一致 **token CAS 无法撤销**。故走 **outbox 最终化协议**：先落 staging 产物（可重试可清理）→ 同事务写业务行 + `collection_outbox` → 异步 worker 最终化（幂等键 `(platform,external_id)`、指数退避重试、staging 24h 清扫但 outbox 未 done 不清）。判据：`collected` ⟺ `viral_library` 有行 ⟺ outbox 为 done。

**续租须有进展且进展有定义**：字节回调 / 阶段边界跨越 / 每 5s 阶段内心跳，满足其一即续租（否则长视频字幕下载超 300s 会被误判过期遭抢占）。另设总 deadline 600s + 分阶段超时，与续租解耦——无进展却续租 = 挂起任务永不过期。`attempt_count` 上限 5、冷却 10 分钟。

**配额**：10,000 units/day 是 **Google 项目级、非本应用独占**，读不到真实用量，故按比例切（探测15%/采集60%/余量25%）。探测=1 unit/次；采集 `ceil(count/50)`。**约束覆盖七路径**（新增/改间隔/批量/导入/备份恢复/迁移/启动加载）：单一 service 入口；启动预检**降级运行而非拒绝启动**（数据是用户的，无权替他删）；导入前全量预检、失败整体拒绝；批量改间隔单事务、不做部分应用。启动超限跳过集**确定性**：按 `interval ASC, created_at ASC` 保底，被跳过者不发请求不耗配额，调大间隔后下轮自动恢复，UI 逐个列出。采集侧 90% 硬熔断 + 单次运行 2 次重试预算（重试与回滚重跑均重新计费）。**外部争用收缩**：收到 `quotaExceeded` 而本地计数很低 → 判定同 Key 被其他程序占用，池收缩至 50%（连续 2 次至 25%）并提示申请独立 Key——配额不可用时必须让用户知道是「额度被占」而非「程序坏了」。

**失败分级（按 reason 优先级，不按状态码）**：YouTube 的 `quotaExceeded` 返回 **403**，按状态码会把配额耗尽误判成故障并累计到暂停。优先级：① quota/rateLimit → A 节流（不计入）；② keyInvalid/accessNotConfigured/**ipRefererBlocked** → C 首次即 fatal；③ channelNotFound → B 连续 3 次暂停；④ **videoNotFound → item 级**（单条被删不该永久停用整个博主），而 **invalidPageToken 归 B 任务级**——它是分页缺陷，归 item 会静默丢失后续分页的全部作品，比报错更糟；⑤ 其余/无 → B 兜底 + 脱敏摘要 + `x-goog-request-id`。

**调度**：复用 `automation-scheduler`，改 3 处。未知 `action.type` **挂起该任务 + 隔离原始载荷**，绝不 throw（会在调度循环里中断**所有**任务触发）也绝不 fallback（静默跑错链路）。**fail-closed 的边界是「这条任务」而非「对系统」。** 隔离区脱敏 + 上限 50 条 + 用户显式删除留审计 + 从不自动删。**挂起须主动告知**：未收口任务徽标常驻 + 首次应用内通知 + 卡片开关置灰但保持可见（隐藏会让人以为任务不存在），否则用户会因「已启用」的绿灯以为自动化正常而长期不知已停摆。

**安全**：API Key `safeStorage` 加密，**四态可区分**（not_configured / unavailable / **decrypt_failed**（OS 密码重置或跨设备迁移后不可解密→引导重新输入）/ ok）。**IPC 双向不对称**——写入方向允许一次性 set（用户必须在渲染层输入，无法回避），**读取方向永不回传明文**（渲染层是 XSS 高暴露面）；保存后主进程即弃明文、渲染层立即清空、不进任何持久化。

**请复核**：① 跨表同事务是否真正消除了 TOCTOU？② reason 优先级与 item/fatal/task 三级分界是否还有错分？③ 配额七路径 + 外部争用收缩是否仍有盲区？④ 续租进展粒度是否够密？