# creator-monitor Specification

## Purpose

定义「博主监控与采集」能力：对博主账号做长期关注、定期监控、发现新作品并一键采集，采集物可送入 AI 写作。

本能力在本仓是**从零引入领域概念**——此前不存在博主实体、关注关系、按账号列举作品的能力，也不存在周期内容监控。首批平台为 YouTube。

## Requirements

### Requirement: 博主实体与 canonical ID

系统 SHALL 为被关注的博主建立独立实体，其平台侧标识 MUST 为平台 API 返回的 canonical ID（YouTube 为 `channels.list` 返回的 `channelId`，形如 `UC…`），SHALL NOT 直接使用用户输入的原始字符串。

系统 SHALL 支持四种 YouTube 频道输入形态并各自给出明确失败文案：频道 ID（`UC…`，0 units）、`@handle`、`/c/<name>`、`/user/<name>`（后两者走 `forUsername`）。系统 SHALL 对作品链接（`watch?v=`、`playlist?list=`）与非 YouTube 域名给出「这不是频道链接」而非泛化的格式错误。

系统 SHALL 在 `(platform, external_id)` 上建立唯一索引。同一博主的多种 URL 写法 MUST 归并为同一实体，不得产生多行。

#### Scenario: 四种输入形态解析

- **WHEN** 用户依次粘贴 `UC…`、`youtube.com/@name`、`youtube.com/c/name`、`youtube.com/user/name`
- **THEN** 四者均解析到同一 `channelId`，且 `creator_accounts` 中仅有一行

#### Scenario: canonical ID 解析失败不得降级

- **WHEN** `channels.list` 对某个 `/c/name` 旧式链接返回 404
- **THEN** 系统拒绝写入并提示频道不存在，MUST NOT 退化为把用户原始输入当作 `external_id` 落库

#### Scenario: 作品链接被明确拒绝

- **WHEN** 用户粘贴 `youtube.com/watch?v=xxx`
- **THEN** 系统提示「这是作品链接，请粘贴博主主页链接」，MUST NOT 尝试按频道解析

### Requirement: 定期监控与增量发现

系统 SHALL 按每个关注项的可配间隔（默认 60 分钟，范围 5~1440 分钟）定期检查博主是否有新作品。

系统 SHALL 以 `(platform, external_id)` 唯一索引保证探测幂等：同一作品被重复探测 MUST NOT 产生重复记录。

探测阶段 SHALL 使用 `fetch_transcript=False`（只取列表元数据），正文与字幕仅在采集阶段获取。

#### Scenario: 重复探测幂等

- **WHEN** 同一博主被连续探测 10 次且期间无新作品
- **THEN** `creator_discoveries` 行数不变，`consecutive_failures` 保持 0

#### Scenario: 探测不消耗采集配额

- **WHEN** 系统执行一次探测
- **THEN** 仅消耗探测配额，MUST NOT 消耗采集配额，且 MUST NOT 拉取字幕正文

### Requirement: 采集数量双轨与硬上限

系统 SHALL 区分两条采集路径并各自提供默认值：「一键采集新作品」默认 **5** 条，「手动批量采集」默认 **50** 条，全局硬上限 **100** 条。

`count` 超过生效上限时系统 MUST 拒绝执行并给出上限提示，MUST NOT 执行任何采集副作用，MUST NOT 静默截断。

`count` 未超限但可采集条数多于 `count` 时，系统 MUST 执行 `count` 条并提示剩余条数留待下次，剩余项保持 `pending`。

单博主可设置低于全局的个人上限，MUST NOT 超过全局上限。

#### Scenario: 超限拒绝且零副作用

- **WHEN** 用户输入 `count=150`（上限 100）并提交
- **THEN** 系统拒绝并提示「本次最多采集 100 条」，`creator_discoveries` 与 `viral_library` 均无任何写入

#### Scenario: 有剩余时必须提示

- **WHEN** 发现 12 条 `pending` 且用户以默认 `count=5` 一键采集
- **THEN** 采集最新 5 条并提示「共发现 12 条，已采集最新 5 条，剩余 7 条留待下次」，剩余 7 条仍为 `pending`

### Requirement: 单条采集的体验与豁免边界

发现列表中每条作品 SHALL 提供独立的零填参「采集」按钮。已采集的作品 SHALL 显示「已采集 · 时间」且按钮置灰，该状态 MUST 持久化，刷新页面后 MUST NOT 丢失。

单条采集 SHALL 仅豁免「数量上限」，MUST NOT 豁免采集配额；采集池耗尽时同样拒绝并提示。

重复采集同一条 SHALL 被拒绝并提示已采集时间。

#### Scenario: 已采集状态持久

- **WHEN** 用户单条采集某作品后关闭并重开应用
- **THEN** 该作品仍显示「已采集 · 采集时间」且按钮保持置灰

#### Scenario: 单条不豁免配额

- **WHEN** 采集配额已耗尽且用户点击单条「采集」
- **THEN** 系统拒绝并提示配额已用尽，MUST NOT 因为「只有一条」而放行

### Requirement: 探测与采集双轨配额

系统 SHALL 将探测与采集计入**相互独立**的两份逻辑配额，且两者 MUST 共用 YouTube 项目级物理池的不同切分比例（探测 15% / 采集 60% / 安全余量 25%）。

系统 SHALL 在**新增关注、修改间隔、批量调整、导入、备份恢复、迁移、启动加载**七条路径上强制校验 `Σ(1440/check_interval_min) ≤ 探测池`。

导入与迁移的校验失败 MUST 整体拒绝，MUST NOT 部分导入。批量调整 MUST 在单个数据库事务内应用，任一条不满足则整体回滚。启动时若存量数据已超限，系统 SHALL 降级运行并告警，MUST NOT 删除用户数据，MUST NOT 拒绝启动。

#### Scenario: 最小间隔导致超限被拒

- **WHEN** 已有 50 个关注项且用户把其中一个间隔改为 5 分钟
- **THEN** 校验发现总需求超过探测池，拒绝该次修改并提示需调大部分博主间隔

#### Scenario: 批量调整不做部分应用

- **WHEN** 用户一次性把 10 个博主的间隔调密，仅其中 6 个满足配额
- **THEN** 整批回滚，MUST NOT 只应用前 6 个

#### Scenario: 启动时存量超限降级而非拒绝启动

- **WHEN** 用户从旧备份导入的关注项总需求已超探测池
- **THEN** 应用正常启动，监控按间隔升序保底运行，UI 明确显示有多少博主本轮未被检查

### Requirement: 失败分级与降级

系统 SHALL 按平台 API 响应的 `error.errors[].reason` 分类失败，MUST NOT 仅按 HTTP 状态码分类——YouTube 的 `quotaExceeded` 返回 403。

节流类（`quotaExceeded` / `dailyLimitExceeded` / `rateLimitExceeded` / `userRateLimitExceeded` / 无 reason 的 429）与瞬时类（5xx / 超时 / 连接重置）MUST NOT 计入连续失败。博主级真故障（`channelNotFound` / `playlistNotFound`）连续 3 次 MUST 转入 `auto_paused`。凭证类（`keyInvalid` / `accessNotConfigured` / 401）MUST 首次即转入 `fatal_paused` 并在 UI 指向设置页。

单资源级错误（`videoNotFound` / `invalidPageToken` / `ipRefererBlocked`）MUST NOT 影响博主的连续失败计数。

分类无法完成时系统 SHALL fail-closed 计入失败并保留脱敏响应摘要，MUST NOT 静默放行。

#### Scenario: 配额耗尽不会被误判为故障

- **WHEN** API 返回 `quotaExceeded`（HTTP 403）
- **THEN** `consecutive_failures` 不增加，状态保持 `active`，UI 不报警

#### Scenario: 视频被删不会停用整个博主

- **WHEN** 某条作品采集时返回 `videoNotFound`
- **THEN** 仅该条进入 `failed`，博主的 `consecutive_failures` 不增加，博主不被暂停

#### Scenario: 凭证失效首次即暂停

- **WHEN** API 返回 `keyInvalid`
- **THEN** 该博主首次失败即进入 `fatal_paused`（不等 3 次），UI 显示凭证原因并提供直达设置页入口

### Requirement: 采集并发安全

采集 SHALL 通过 `claim + lease + fencing token` 三件套保证同一作品不被并发重复采集。

claim MUST 为单条原子 UPDATE，且仅当状态为 `pending` 或 `failed`、且租约为空或已过期时才能抢占。持有者 MUST 周期性续租。成功与失败的提交 MUST 携带 `claim_token` 条件；token 不匹配时 MUST 放弃提交，MUST NOT 覆盖新持有者的结果。

连续失败达上限后 MUST 停止自动重试并转冷却，等待用户显式重试。

#### Scenario: 并发点击只采集一次

- **WHEN** 用户在两个窗口同时对同一条作品点击「采集」
- **THEN** 仅一个窗口 claim 成功并执行采集，另一窗口收到「该作品正在采集中」

#### Scenario: 租约过期的旧持有者不得覆盖

- **WHEN** 旧 worker 租约过期后新 worker 接管并完成采集，随后旧 worker 才返回结果
- **THEN** 旧 worker 的提交因 `claim_token` 不匹配被拒绝，新 worker 的结果不被覆盖

### Requirement: 凭证安全

API Key SHALL 经 Electron `safeStorage` 加密后存储，MUST NOT 明文落盘，MUST NOT 写入任何日志、崩溃报告或隔离区载荷。

API Key MUST NOT 跨 IPC 传入渲染层；IPC 只暴露「是否已配置」与末四位指纹。

`safeStorage` 不可用时系统 SHALL fail-closed 禁用该功能，MUST NOT 降级为明文保存。

系统 SHALL 区分「未配置」「系统密钥库不可用」「已保存但无法解密」三种状态并给出各自文案，避免用户在换机或 DPAPI 损坏后反复重填仍失败。

#### Scenario: 渲染层拿不到密钥原文

- **WHEN** 前端读取凭证状态
- **THEN** 只得到 `status` 与末四位指纹，MUST NOT 得到密钥原文

#### Scenario: 密钥库不可用时功能禁用

- **WHEN** `safeStorage.isEncryptionAvailable()` 为 false
- **THEN** 博主监控功能整体禁用并明示原因，MUST NOT 明文保存密钥

### Requirement: 平台能力分层与诚实标注

系统 SHALL 为每个平台标记能力等级：`official`（官方接口）、`best_effort`（尽力而为，可能不稳定）、`unsupported`（暂不支持），并在 UI 显式展示。

首批仅 YouTube 为 `official`；视频号为 `unsupported`；其余为 `best_effort`。

系统 MUST 在文案中如实声明：关闭应用期间不检查新作品，重新打开后仅检查增量而不补跑关闭期间的内容。

系统 MUST NOT 承诺抖音 / 小红书 / 视频号长期稳定可用——其反爬为持续对抗，架构只保证失效时不拖垮整体。

#### Scenario: 能力等级正确展示

- **WHEN** 用户在平台选择器查看可用平台
- **THEN** YouTube 标注「官方接口」且可选，视频号标注「暂不支持」且禁用

#### Scenario: 生命周期如实告知

- **WHEN** 用户首次开启博主监控
- **THEN** 明确告知关闭应用期间不会检查新作品，重新打开后仅检查增量