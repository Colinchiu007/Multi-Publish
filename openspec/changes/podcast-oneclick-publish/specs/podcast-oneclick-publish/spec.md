## ADDED Requirements

### Requirement: 播客频道为多实例且 id 不可变

系统 SHALL 支持同一登录态下存在多个播客频道，每个频道以不可变短 id（`^ch_[a-z0-9]{4,16}$`）标识，且该 id 的唯一载体为 `index.json` 的 `channels[].id`（目录名与之相等，落盘校验与对象 key 派生共用同一判据）。频道改名 SHALL NOT 改变其 id、目录名或托管对象路径。

#### Scenario: 新建频道分配合规 id
- **WHEN** 用户在频道目录中创建名为"午间电台"的频道
- **THEN** 返回的 `channelId` 匹配 `^ch_[a-z0-9]{4,16}$`，且 `<userData>/podcast/channels/<channelId>/` 目录存在

#### Scenario: 改名不影响对外 feed 地址
- **WHEN** 用户把频道显示名从"午间电台"改为"夜间电台"
- **THEN** `channelId` 与托管对象 key 逐字不变，已提交给聚合端的 feed URL 仍然有效

#### Scenario: 目录名不得充当频道 id
- **WHEN** 任何调用方以 `default` 作为 channelId 请求频道目录
- **THEN** 系统抛 `PODCAST_CHANNEL_ID_INVALID`，不创建任何目录

### Requirement: 存量单频道数据的迁移必须可回退且不改写身份

系统 SHALL 在首个需要频道数据的调用处一次性完成迁移（注册处理器阶段 SHALL NOT 触碰 userData 目录），按内容哈希三态判定完整性，并把冲突与硬失败落为**持久化状态**：读路径 SHALL 能读到该状态以渲染处置入口，写路径与一键发布 SHALL fail-closed。迁移 SHALL NOT 删除 legacy 文件，SHALL NOT 改写既有单集的 `guid`。

#### Scenario: 从非空 legacy 迁移
- **WHEN** 存在 legacy `channel.json` 与 `episodes.json` 且尚无 `index.json`
- **THEN** 系统为 legacy 频道分配合规 `ch_*` id 并复制两份文件，字段值逐字保留（含 `guid` 缺席时不得补写），legacy 原件仍在原位

#### Scenario: 半复制目标按续传处理
- **WHEN** 目标频道目录存在但缺 `episodes.json`，且 legacy 来源完整
- **THEN** 系统补齐缺失文件而**不**判为冲突，迁移状态为空

#### Scenario: 真冲突不得静默选一份
- **WHEN** 目标与 legacy 各为不同合法内容
- **THEN** `index.json` 落 `migrationStatus: "conflict"`，`podcast:channel:list` 仍成功返回该状态，而 `podcast:channel:create` 抛 `PODCAST_MIGRATION_CONFLICT`

#### Scenario: 迁移中途 IO 失败
- **WHEN** 复制过程中发生 IO 错误
- **THEN** 落 `migrationStatus: "error"` 与 `PODCAST_MIGRATION_IO_FAILED`，只读通道保留，写路径拒绝

### Requirement: 发布同步状态必须持久化且不被改名抹除

系统 SHALL 把每频道的 feed 同步结果（`result` / `attemptedAt` / `errorCodes` / `hostingSnapshot`）保存在 `channel.json` 的 `feedSync` 段，与 `validateChannel` 白名单所属的 `meta` 段分离。`podcast:channel:save` SHALL NOT 修改 `feedSync`；应用重启后 SHALL 仍能从持久化状态恢复"公网 feed 未同步"提示。

#### Scenario: 改名保留发布状态
- **WHEN** feed 上传失败使 `feedSync.result = "partial"`，随后用户保存一次频道名
- **THEN** `feedSync` 逐字仍在，播客页仍显示"公网 feed 尚未更新"

#### Scenario: 服务实例重建后状态仍在
- **WHEN** 主进程服务实例被重建（等价于应用重启）
- **THEN** 同一频道的 `partial` 状态与错误码仍可读回，无需依赖当次会话内存

### Requirement: 单集写入必须按内容校验且区分严格模式

系统 SHALL 在写入单集前对**将要落盘的完整对象（合并结果）**执行引擎 `validateEpisode` 判据，SHALL NOT 只校验传入的部分字段。一键发布路径 SHALL 以严格模式调用（不合规即整次拒绝、不落盘）；播客页手工路径 SHALL 保留"先登记、后补直链"的中间态，落盘后即时校验但仅出声不阻断。字段判据的唯一实现 SHALL 位于共享引擎，各调用点不得复制第二份。

#### Scenario: 旧脏字段不得借合并存活
- **WHEN** 已存在的单集含非法 `mime`，随后以仅含合法 `title` 的对象保存同一期
- **THEN** 严格模式保存被拒绝，合并结果不得落盘

#### Scenario: 手工中间态可保存但必须出声
- **WHEN** 播客页保存一条只有本地文件、尚无 https 直链的单集
- **THEN** 落盘成功，日志与 `episode:list` 的每期 `compliance` 均如实标记不合规原因

### Requirement: 并发写必须按记录键串行且发布不得叠发

系统 SHALL 为 `episodes.json` 的全部写者（一键发布、手工增删）提供按 `channelId` 键的串行锁，为 `index.json` 提供全局单键串行锁；两把锁 SHALL 均为 try-acquire、等待有上限、超时者不得执行其临界区、前序抛错必须放行后来者，且同一键 SHALL NOT 重入。同频道已有发布在跑时，系统 SHALL 立即返回 `PODCAST_CHANNEL_BUSY` 而不是排队等待。

#### Scenario: 跨频道并行不被全局化
- **WHEN** 两个不同频道同时发起发布
- **THEN** 两者互不阻塞，各自的 episodes 写入串行

#### Scenario: 同频道叠发立即被拒
- **WHEN** 某频道发布尚未结束（含分块合成与对象上传）时用户再次点击发布
- **THEN** 第二次调用立即得到 `PODCAST_CHANNEL_BUSY`，装配器一次都没有被调用

#### Scenario: 等待超时者不得补写
- **WHEN** 某写者等待锁超过预算
- **THEN** 它不执行自己的临界区，且后序等待者仍能正常获得锁（序位不被放弃者压乱）

### Requirement: 一键发布不得进入平台发布链

系统 SHALL 以独立通道承载播客一键发布：`config/platforms.yaml`、`publish-capabilities.json`、`platform-definitions.js`、rpa-engine 选择器、`publishMode` 取值集合 SHALL 逐字不变；一键发布 SHALL NOT 占用 taskQueue 通道、平台日配额，SHALL NOT 复用 `publish:progress` 事件或写入平台发布历史。进度事件 SHALL 使用独立事件名并成对提供注册/注销。

#### Scenario: 分发端目录仍是唯一的全局频道无关通道
- **WHEN** 渲染层请求 `podcast:endpoints:list`
- **THEN** 该调用不需要 channelId（它是全局目录），而 6 条频道作用域通道缺 channelId 一律被拒

#### Scenario: 平台契约面零污染
- **WHEN** CI 运行 `podcast-endpoints.test.js` 的「与平台契约面隔离」判据
- **THEN** 播客分发端 id 不出现在任何平台表中，`publishMode` 仍为三态闭集
