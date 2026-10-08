# ops-center-resilience (delta: ops-center-resilience)

## ADDED Requirements

### Requirement: 运行时配置版本号与内容指纹

运营中心 `GET /api/v1/runtime/bootstrap` SHALL 在响应中返回 `config_version`（单调递增整数）
与 `config_hash`（16 位十六进制内容指纹）两个字段，使运营方能判定「这是第几版配置」且
「内容是否真的变了」。两个字段 MUST 在 Ed25519 签名覆盖范围内（写入 payload 早于签名步骤）。
`config_hash` SHALL 仅由 13 个下发数据块的 canonical JSON 计算，MUST NOT 纳入
`synced_at` / `config_version` / `config_hash` / `signature` 中任何一个。缺失的数据块键
MUST 以 `null` 参与计算而非跳过。`config_version` SHALL 仅在 `config_hash` 变化时递增，
内容未变时保持不变，并 MUST 持久化以跨重启存活。

#### Scenario: 内容变化时版本递增
- **WHEN** 运营修改了应用菜单配置，随后客户端拉取 bootstrap
- **THEN** 响应的 `config_hash` 与上一版不同，`config_version` 等于上一版 +1

#### Scenario: 内容未变化时版本不动
- **WHEN** 运营在配置页点击保存但实际数据未改变，随后客户端拉取 bootstrap
- **THEN** 响应的 `config_hash` 与 `config_version` 均与上一版相同

#### Scenario: hash 不受时间戳影响
- **WHEN** 两次拉取之间无任何配置变更，仅 `synced_at` 不同
- **THEN** 两次响应的 `config_hash` 完全相同

#### Scenario: 缺失键参与计算
- **WHEN** 某数据块在 payload 中不存在
- **THEN** 该键以 `null` 参与 canonical JSON 计算，与「键存在但值为 null」产生相同 hash

### Requirement: 客户端生效回执

桌面客户端在应用运行时策略成功后 SHALL 通过 `POST /api/v1/runtime/ack` 上报生效确认，
载荷包含 `client_id` / `config_version` / `config_hash` / `applied_blocks` / `skipped_blocks` /
`degraded` / `degradation_tier` / `ack_type`。服务端 MUST 对上述字段做类型与白名单校验，
任一不合法 MUST 返回 400 而非静默丢弃。服务端 SHALL 按 `client_id` 保留最新一条回执快照，
并 MUST 记录首次出现时间以支撑活跃客户端分母。

#### Scenario: hash 变化时上报
- **WHEN** 客户端收到的 `config_hash` 与本地记录的上次 ACK 不同
- **THEN** 客户端以 `ack_type="applied"` 上报一次

#### Scenario: hash 未变化时不重复上报
- **WHEN** 客户端连续三次拉取 bootstrap 且 `config_hash` 均未变化，且距上次 ACK 未超过 24 小时
- **THEN** 客户端不产生任何 ACK 请求

#### Scenario: 每日心跳
- **WHEN** `config_hash` 未变化但距上次 ACK 已超过 24 小时
- **THEN** 客户端以 `ack_type="heartbeat"` 上报一次

#### Scenario: 非法回执被拒绝
- **WHEN** 客户端以 `config_hash="NOT_A_HASH"` 上报
- **THEN** 服务端返回 HTTP 400 且不写入任何回执记录

#### Scenario: 降级态回执
- **WHEN** 客户端在断连恢复后首次同步成功
- **THEN** 客户端以 `ack_type="recovered"`、`degraded=true`、`degradation_tier` 标明断连期间所处的降级层级上报

### Requirement: 配置生效聚合查询

运营中心 SHALL 提供 `GET /api/v1/runtime/rollout` 返回指定配置版本的生效聚合：
活跃客户端总数、已确认该版本的客户端数、仍在旧版的客户端数、处于降级中的客户端数，
以及各数据块的确认率。该端点 MUST 要求管理员鉴权。

#### Scenario: 聚合口径正确
- **WHEN** 系统中共有 100 台客户端曾上报回执，其中 82 台 `config_version` 等于当前版本、10 台小于当前版本、8 台 `degraded=true`
- **THEN** 响应中 `total=100`、`acked=82`、`stale=10`、`degraded=8`，且四者关系自洽

#### Scenario: 未确认明细可下钻
- **WHEN** 请求携带 `version` 参数指定非当前版本
- **THEN** 响应包含该版本对应的聚合与未确认客户端明细列表，明细条数不超过请求的 limit

### Requirement: 三层降级数据源

桌面端运行时策略数据 SHALL 按 L1 内存 → L2 本地 SQLite 快照 → L3 打包内置种子的顺序解析，
任一层可用即停止向下查找。L2 SHALL 持久化**完整原始 bootstrap payload**（而非归一化后的
运行时状态摘要），使启动时可将同一 payload 重新喂给全部注入管理器以重放内存态。
L3 SHALL 为随应用打包发布的种子文件，仅在 L1 与 L2 均不可用时读取。

#### Scenario: 重启后重放 6 类内存态数据
- **WHEN** 客户端成功同步过一次含 `platform_defs` / `content_templates` / `keyword_watchlist` / `rewrite_strategies` / `rewrite_hard_constraints` / `rewrite_ai_taste_map` 的 payload，随后应用重启且全程断网
- **THEN** 这 6 类数据在重启后仍由上次成功同步的值提供，而非退回代码内置默认值

#### Scenario: L2 缺失时降级到 L3
- **WHEN** 本地无 L2 快照且当前断网，但安装包内含 L3 种子文件
- **THEN** 客户端使用 L3 种子数据提供配置，并记录一条降级事件标明层级为 `L3`

#### Scenario: L3 也不存在
- **WHEN** 本地无 L2 快照、当前断网、且安装包内无 L3 种子文件
- **THEN** 客户端退回代码内置默认值，不崩溃、不阻断启动

### Requirement: 连接失败与契约破坏的语义区分

客户端 SHALL 区分两类失败：**连接失败**（超时 / DNS / 网络断开 / 5xx）与**契约破坏**
（验签失败 / 结构非法 / 账号停用）。连接失败 MUST 保持既有值不变、不写入 L2 快照、
不推进 `syncedAt`、记录 warn 级日志并继续重试。契约破坏 MUST 拒绝应用任何新策略、
保留既有值、记录 warn 级日志。显式空配置 MUST 被视为可信的真实状态并正常落盘。
任何失败路径 MUST NOT 使 `syncedAt` 前进。

#### Scenario: 断网时保持旧值
- **WHEN** 客户端已持有一次成功同步的配置，随后网络断开并再次同步
- **THEN** 配置值保持不变，`syncedAt` 未推进，本地无 L2 快照更新

#### Scenario: 验签失败时拒绝应用
- **WHEN** 服务端返回的 payload 签名不匹配
- **THEN** 客户端抛出错误、拒绝应用任何策略、既有配置保持不变、`syncedAt` 未推进

#### Scenario: 主动清空某项
- **WHEN** 服务端返回的 payload 中某数据块为空数组且验签通过
- **THEN** 客户端将该项应用为空并落盘，`syncedAt` 前进

### Requirement: 断连降级遥测上报

桌面客户端 SHALL 在检测到连接失败时将降级事件写入本地持久化队列，并在连接恢复后
一次性补报至 `POST /api/v1/telemetry/degradation`。本地队列 SHALL 设上限并在超出时
丢弃最旧记录。服务端 SHALL 校验载荷字段并以流水表形式落库，保留完整历史以支撑影响面统计。
降级遥测 MUST NOT 被设计为运营中心自身宕机时的告警来源。

#### Scenario: 断连期间只写本地队列
- **WHEN** 客户端连续同步失败达到阈值且网络持续不通
- **THEN** 降级事件被写入本地队列，不产生任何对外网络请求

#### Scenario: 恢复后集中补报
- **WHEN** 客户端在断连 1 小时后恢复连接并成功同步
- **THEN** 客户端一次性上报本轮断连的降级事件，含断连起止时间、连续失败次数与断连期间服务的降级层级

#### Scenario: 上报失败保留队列
- **WHEN** 客户端补报降级事件时请求失败
- **THEN** 该事件仍留在本地队列中，供下一轮重试

#### Scenario: 非法降级载荷被拒绝
- **WHEN** 客户端以 `failure_kind="WHATEVER"` 上报
- **THEN** 服务端返回 HTTP 400 且不写入降级记录

#### Scenario: 运营中心宕机不由自身告警
- **WHEN** 运营中心服务完全不可用
- **THEN** 告警 MUST 由独立于运营中心的外部探针产生，运营中心自身不作为自身可用性的告警来源

### Requirement: 打包内置种子数据

应用打包 SHALL 携带一份运营中心运行时配置的种子文件作为最终保底数据源。
该文件 MUST 通过 CI schema 校验，MUST 剔除内容安全词库（仅保留开关状态），
文件大小 MUST NOT 超过运行时同步的 1MB 上限。种子文件超过 90 天未更新时 CI SHALL 发出警告。

#### Scenario: 词库进包被拦截
- **WHEN** 种子文件的 `content_policy` 含有非空 `word_list`
- **THEN** CI 校验失败并明确报出该文件与该字段

#### Scenario: 种子文件哈希不一致
- **WHEN** 种子文件 `_meta.config_hash` 与按 spec 算法实算的哈希不同
- **THEN** CI 校验失败

#### Scenario: 种子文件过期告警
- **WHEN** 种子文件 `_meta.exported_at` 距今超过 90 天
- **THEN** CI 输出警告但不阻塞构建

### Requirement: 会员权益宽限期

桌面客户端 SHALL 引入权益宽限期机制以避免网络抖动误伤付费用户。当且仅当权益同步
**未取得有效响应**时（网络层异常）进入宽限逻辑；服务端明确拒绝响应、响应结构非法、
或账号被标记为非活跃时 MUST 保持既有的 fail-closed 清权行为。存在有效本地签名快照时
MUST 继续按快照授权；快照已过期但在 72 小时宽限期内时 MUST 继续授权读功能；
无本地快照或宽限期已耗尽时 MUST 降级为 free。

#### Scenario: 网络异常时按快照继续授权
- **WHEN** 付费用户持有未过期的本地签名权益快照，权益同步时发生网络异常
- **THEN** 权益保持原计划等级，状态标记为宽限态，**读类功能**（查看历史、查看已生成内容）完全不受影响；标记为宽限态期间 `onlineOnly` 能力视为不可用，即**新增付费消耗类操作**被拒绝

#### Scenario: 服务端明确拒绝时不宽限
- **WHEN** 权益同步返回 HTTP 401 或 403
- **THEN** 本地快照被清空，权益降级为 free

#### Scenario: 首次安装即断网保持 fail-closed
- **WHEN** 用户首次安装应用后从未成功同步过权益，且首次同步即发生网络异常
- **THEN** 权益降级为 free

#### Scenario: 快照过期超出宽限期
- **WHEN** 本地快照已过期超过 72 小时且同步仍然失败
- **THEN** 权益降级为 free

#### Scenario: 账号被停用时立即清权
- **WHEN** 权益同步成功返回但响应中账号状态为非活跃
- **THEN** 本地快照被清空并抛出账号不可用错误

#### Scenario: 宽限期状态可观测
- **WHEN** 客户端处于权益宽限期
- **THEN** 权益状态中可读出其处于宽限期而非正常在线态