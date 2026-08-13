# pipeline-progress-push Specification

## Purpose
流水线阶段进行中信息（`stage.progress` / `stage.summary` / 阶段状态 / run 级 progress）SHALL 通过实时事件推送到 renderer（`pipeline:update`），消除 3s 轮询延迟；事件载荷 SHALL 使用轻量快照（不含完整 context），完整 context 仍按需经 `pipeline:getRunContext` 获取；renderer SHALL 事件驱动更新并以既有轮询兜底。既有 `pipeline-progress-feedback` 契约（`stage.progress` 字段语义）不变，本契约为其传输路径增强。
## Requirements
### Requirement: 阶段进度实时事件推送

流水线运行期间，阶段状态变化（start/completed/failed/paused）与阶段进度更新（`stage.progress`/`stage.summary` 落盘）SHALL 通过 `pipeline:update` 事件推送到 renderer，payload 为轻量快照（run 状态、阶段列表含 `progress`/`summary`/状态时间戳、run 级 `progress`），不含完整 context。同一 run 高频进度更新 SHALL 在 500ms 窗口内合并为一次事件（节流），不得按每次 onProgress 调用逐条发送。

#### Scenario: 阶段进度更新即推送到 renderer
- **WHEN** 执行器 onProgress 更新 `stage.progress`（如 publish 完成第 i/N 个平台）
- **THEN** renderer 收到 `pipeline:update` 事件且 payload 中该阶段 `progress.percent` 反映 `i/N`（节流窗口内最后一次值）

#### Scenario: 高频更新合并
- **WHEN** 同一 run 在 500ms 内连续多次 onProgress（如逐段 TTS）
- **THEN** 该窗口内仅发送一次 `pipeline:update`，payload 为窗口内最新进度值

### Requirement: 轻量快照（快照裁剪）

`getRunSnapshot` SHALL 支持 progress-only 模式：返回 run 状态、阶段状态 + `progress`/`summary` + run 级 `progress`，不含完整 `context` 与非进度阶段输出。完整 context SHALL 仍经既有 `pipeline:getRunContext` 按需获取，不因裁剪而缺失。

#### Scenario: 事件载荷不含完整 context
- **WHEN** 事件/轻量快照下发
- **THEN** payload 不含 `context.split`/`context.optimize`/`context.generate_assets` 等完整阶段输出（仅 `stage.progress`/`summary` 与状态）

#### Scenario: 完整 context 仍可获取
- **WHEN** renderer 需要完整阶段输出（如素材选择面板）
- **THEN** 既有 `pipeline:getRunContext` 返回完整 context，行为不变

### Requirement: renderer 订阅与轮询兜底

renderer SHALL 通过 `onPipelineUpdate` 订阅（返回取消函数）事件驱动更新阶段进度展示；既有 3s 轮询 SHALL 保留为兜底（事件丢失/窗口重载后自愈），事件到达后 SHALL 重置轮询计时，避免事件与轮询双写竞态。

#### Scenario: 事件驱动更新
- **WHEN** renderer 收到 `pipeline:update`
- **THEN** `orchestrationStages`/`orchestrationContext`（进度子集）/run 级 `progress` 同步更新，阶段清单即时反映最新进行中信息

#### Scenario: 轮询兜底自愈
- **WHEN** 事件丢失（窗口后台/挂起）或重载后无事件
- **THEN** 既有 3s 轮询继续拉取轻量快照，进度不长期停滞

### Requirement: 安全约束

`pipeline:update` SHALL 为唯一新增事件 channel（白名单）；payload SHALL 仅含进度/状态数据，不得包含完整 context、凭据或敏感字段；事件仅向受信主窗口发送。preload 暴露 `onPipelineUpdate` 后 SHALL 在 sandbox true/false 双模式下可用（`window.electronAPI.onPipelineUpdate`），订阅函数 SHALL 在组件卸载时被调用以移除监听（避免泄漏）。

#### Scenario: 仅向受信窗口发送
- **WHEN** 存在多个窗口/失焦窗口
- **THEN** `pipeline:update` 仅发送到当前受信主窗口，其他窗口不接收

#### Scenario: 取消订阅清理
- **WHEN** 组件卸载调用 `onPipelineUpdate` 返回的取消函数
- **THEN** 对应 `ipcRenderer` 监听移除，不再收到 `pipeline:update`

