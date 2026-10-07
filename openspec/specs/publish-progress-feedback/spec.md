# publish-progress-feedback Specification

## Purpose
定义 publish-progress-feedback 的行为契约，判据只认下列 Requirement 与其 Scenario：「发布进度事件富化契约」、「发布进度全局承载（store + 面板）」、「进度面板可最小化后台运行」等，共 7 条。本规格由归档 change `publish-progress-ux` 产生。

## Requirements
### Requirement: 发布进度事件富化契约

主进程向渲染层广播的 `publish:progress` 事件 SHALL 在保留既有字段（`platform` / `taskId` / `stage` 及按事件类型出现的 `result` / `error` / `remainingWait`）的基础上，新增结构化字段：`phase`（取值限定 `start` / `progress` / `success` / `failed` / `retry` / `blocked` / `cancelled`）、`stageKey`（取值限定 `prepare` / `upload` / `fill` / `submit` / `verify` / `waiting` / `done` / `failed` / `detail`）、`percent`（0-100 数值或 `null`）、`batchId`（字符串或 `null`）、`timestamp`（毫秒纪元数值）。字段富化 SHALL 在主进程发射层单一实现（`publish-progress-events.js`），渲染层不得维护第二份阶段映射。

任务生命周期 SHALL 覆盖开始与终态双边界：任务开始执行时 SHALL 发出 `phase:'start'` 事件（对齐账号批量检测 start/done 双边界先例）；终态以 `phase:'success'` / `'failed'` / `'cancelled'` 为单一来源，executor 不得重复发送成功终态事件。任务被取消（无论取消发起自浮窗、页面级入口或其它窗口）时，主进程 SHALL 转发 `task:cancelled` 为 `phase:'cancelled'` 终态事件，渲染层不得依赖取消发起方自行改写任务状态。

#### Scenario: 任务开始边界
- **WHEN** TaskQueue executor 开始执行某任务
- **THEN** 渲染层收到 `{ phase:'start', stageKey:'prepare', percent:0, taskId, platform }` 事件

#### Scenario: RPA 阶段事件携带百分比
- **WHEN** rpaViewManager 报告 `uploading file...`（25%）
- **THEN** 渲染层收到 `{ phase:'progress', stageKey:'upload', percent:25, stage:'uploading file...' }` 事件

#### Scenario: API 直连轨不再静默
- **WHEN** bilibili/baijiahao 走 ApiPublisher 直连发布
- **THEN** 引擎 `onProgress(percent, message)` 回调被透传为 `phase:'progress'` 事件（此前该轨完全不发进度）

#### Scenario: 未知阶段串透传
- **WHEN** 引擎发出映射表未登记的阶段字符串
- **THEN** 事件 `stageKey` 为 `detail`，原始字符串保留在 `stage` 字段，不得丢弃或报错

#### Scenario: 并发任务进度归属
- **WHEN** 两个不同平台的任务并发执行且各自报告进度
- **THEN** 每条进度事件的 `taskId` 归属正确平台对应的任务（经 platform→taskId 路由，不得互相串归属）

#### Scenario: 主窗口不可用时静默
- **WHEN** 主窗口已销毁或不可用
- **THEN** 发射层跳过发送且不抛错

#### Scenario: 取消任务终态转发
- **WHEN** 任一入口取消某任务（TaskQueue 发出 `task:cancelled`）
- **THEN** 渲染层收到 `{ phase:'cancelled', taskId, platform }` 终态事件，任务在全局进度面板呈现「已取消」中性态（非失败红态），会话终态判定把 cancelled 计入终态

### Requirement: 发布进度全局承载（store + 面板）

渲染层 SHALL 以全局 pinia store（`publishProgress`）为发布进度状态的唯一承载：`publish:progress` / `batch:progress` 订阅 SHALL 在应用级注册一次，不随任何页面组件卸载而注销；页面 composables 在发布 IPC 返回后 SHALL 将返回的 taskIds（或 batchId）登记为会话，不再持有页面级进度订阅。

store SHALL 支持多并发会话（任务列表按 taskId 组织、按 batchId 归属批量会话），并对渲染层重载场景提供恢复：初始化时经 `queue:status` 快照领养不属于任何已登记会话的运行中/排队任务。store SHALL 提供「取消全部在途任务」动作（逐任务经既有 `queue:cancel` IPC，防重入，返回成功/失败计数），任务状态更新以转发的 `phase:'cancelled'` 事件为单一来源。

#### Scenario: 切走页面进度不丢失
- **WHEN** 用户在发布进行中导航到其他路由
- **THEN** 全局面板持续显示各任务实时进度（订阅存活于 App 级）

#### Scenario: 渲染层重载恢复
- **WHEN** 渲染层在发布进行中重载（事件已错过）
- **THEN** store 经 `queue:status` 领养运行中/排队任务并显示其状态

#### Scenario: 未知 taskId 事件
- **WHEN** 收到不属于任何已登记会话的进度事件
- **THEN** store 自动创建恢复会话收纳该任务，不得丢弃事件

#### Scenario: 会话终态
- **WHEN** 会话内全部任务到达 success/failed/cancelled 终态
- **THEN** 会话标记为 done，页面结果卡与面板同步显示汇总（成功 N / 失败 M / 已取消 C）

#### Scenario: 浮窗取消全部在途任务
- **WHEN** 用户在浮窗 footer 点击「取消全部任务」并完成两步确认
- **THEN** store 对全部非终态任务逐个调用 `queue:cancel`，任务经 `phase:'cancelled'` 事件转为已取消态，面板如实呈现取消结果

### Requirement: 进度面板可最小化后台运行

发布进度面板 SHALL 为非模态浮动组件（App.vue 全局挂载，不阻塞任何交互，不接入浮层互斥合同），提供两种形态：展开浮动卡（会话×任务×步骤状态明细）与最小化常驻胶囊（含微型进度与当前汇总）。点击发布后面板 SHALL 自动展开；用户 SHALL 可随时最小化/恢复。

最小化行为 SHALL 明确告知后台语义：**首次**最小化时弹一次 toast 提示「发布将在后台继续进行，请勿关闭应用」（localStorage 记忆，仅一次）；最小化胶囊上 SHALL 常驻显示「请勿关闭应用」类提示文字。

面板展开态 SHALL 以警示条样式常驻呈现「后台进行中，请勿关闭应用」提示（运行中），并与「取消全部任务」入口同置 footer；取消 SHALL 采用两步内联确认（首次点击进入 4 秒确认窗口，再次点击执行；超时或面板交互退出确认态），不得引入模态遮罩。

全部任务成功（无失败、无取消）且面板展开时，面板 SHALL 在完成跃迁后 5 秒无操作自动最小化为胶囊（自动收敛）；面板内任意指针交互或新会话开始 SHALL 取消收敛；存在失败或取消任务时 SHALL 保持展开（不遮蔽恢复入口）。

#### Scenario: 首次最小化教育
- **WHEN** 用户首次点击最小化
- **THEN** 弹出一次性 toast（后台继续 + 勿关闭应用），并持久化「已提示」标志

#### Scenario: 再次最小化不重复教育
- **WHEN** 用户第二次及以后最小化
- **THEN** 不再弹 toast，胶囊常驻提示文字仍在

#### Scenario: 胶囊全局可见
- **WHEN** 面板最小化且用户切换路由
- **THEN** 胶囊在任何路由持续显示发布汇总（N/M）与勿关提示，点击恢复展开

#### Scenario: 非模态不接入互斥合同
- **WHEN** 面板展开或最小化
- **THEN** 内嵌 WebContentsView 不被挂起（面板不调用 `suspendEmbeddedViewsForOverlay`）

#### Scenario: 全部成功自动收敛
- **WHEN** 会话内全部任务成功且面板展开，5 秒内无任何指针交互
- **THEN** 面板自动最小化为胶囊（完成态），不弹首次隐藏 toast

#### Scenario: 存在失败不自动收敛
- **WHEN** 会话终态含失败或已取消任务
- **THEN** 面板保持展开，失败/取消信息与恢复入口可见

#### Scenario: 交互取消收敛
- **WHEN** 自动收敛计时中用户点击面板任意位置
- **THEN** 收敛计时取消，面板保持展开直至用户手动操作

### Requirement: 失败可见与重试

单平台任务失败 SHALL 不中断整批（沿用既有队列语义），失败任务 SHALL：在面板明细中以失败态标记并显示错误消息；落发布历史（`status:'failed'`，含 error 字段——此前失败不落历史，任何页面不可查）；会话终态后提供「重试失败项」入口，经既有 `queue:retry` IPC 逐任务重发并以新 taskId 替换原任务条目继续跟踪。

失败任务行 SHALL 提供单任务级内联操作：「重试此任务」（经同一 `queue:retry` 通道重发该任务）与「复制错误信息」（完整错误文本入剪贴板，成功/失败均有 toast 反馈，不静默）。

#### Scenario: 失败落历史
- **WHEN** 某任务最终失败（重试耗尽）
- **THEN** `publish-history.jsonl` 新增 `{ status:'failed', error }` 记录，发布历史页 failed 过滤器可见

#### Scenario: 面板重试失败项
- **WHEN** 会话终态存在失败任务且用户点击「重试失败项」
- **THEN** 每个失败任务经 `queue:retry` 重发，面板以新 taskId 继续跟踪，会话回到 running

#### Scenario: 单任务内联重试
- **WHEN** 用户点击某失败任务行的「重试此任务」
- **THEN** 仅该任务经 `queue:retry` 重发并以新 taskId 替换条目，其余任务状态不受影响

#### Scenario: 复制错误信息
- **WHEN** 用户点击失败任务行的「复制错误信息」且剪贴板可用
- **THEN** 完整错误文本（非截断文本）写入剪贴板并提示已复制；剪贴板不可用时提示复制失败

#### Scenario: 失败不中断整批
- **WHEN** 批次中某平台任务失败
- **THEN** 其余平台任务继续执行（既有语义不变，仅呈现增强）

### Requirement: 发布运行中关窗转托盘后台继续

Windows/Linux 下，发布任务运行中（含排队）用户关闭主窗口时，SHALL 复用流水线托盘先例：拦截 close、隐藏窗口到托盘、发布继续后台执行，并经托盘气泡提示「发布仍在后台进行，请勿退出程序」。托盘不可用或无运行任务时保持既有关闭语义。macOS 维持系统约定不拦截。

#### Scenario: 发布运行中关窗
- **WHEN** Windows 下有发布任务运行/排队且托盘可用，用户点窗口 ✕
- **THEN** 窗口隐藏到托盘（进程存活、发布继续），托盘气泡提示后台进行

#### Scenario: 无任务时关窗
- **WHEN** 无流水线且无发布任务运行
- **THEN** 关窗走既有退出链（行为不变）

#### Scenario: 非 Windows 气泡降级
- **WHEN** 非 Windows 平台触发托盘隐藏
- **THEN** 气泡调用静默跳过，隐藏行为不受影响

### Requirement: 进度文案本地化与状态双通道

面板展示的阶段/状态文案 SHALL 全部来自 locales（zh/en 成对，CI 门禁拦截），状态 SHALL 以「文字+图标」双通道呈现（不只靠颜色）；阶段标签基于 stageKey 稳定枚举渲染，未知阶段（`detail`）原样透传原始文本。渲染端不得新增硬编码中文字面量。

#### Scenario: 中文用户看到中文阶段
- **WHEN** 引擎发出 `uploading file...` 阶段事件
- **THEN** 面板显示「上传中」标签（stageKey=upload 的 locale 文案），不直出英文原文

#### Scenario: 状态不只靠颜色
- **WHEN** 任务处于任一状态
- **THEN** 状态以图标 + 文字标签呈现（满足可访问性与色弱场景）

### Requirement: 进度面板信息密度与层级

发布进度面板的任务行 SHALL 采用固定网格对齐（平台名 | 状态 | 步骤/明细/错误 | 百分比 | 操作），运行中任务的步骤指示 SHALL 采用点状步骤条（dot-stepper：过去步实心、当前步主色高亮、未来步空心，仅当前步显示一个文字标签），不得整链渲染全部步骤文字。排队中任务 SHALL 仅呈现排队状态，不预渲染步骤链。成功任务行 SHALL 不再显示百分比（终态图标已表达）。

面板汇总行 SHALL 以「成功 {succeeded}/{total}」为口径直给成功数（不得把失败/取消计入「已完成」），失败数与取消数各自单列。单会话时面板 SHALL 扁平呈现（不嵌套会话卡片框、不重复会话徽标）；多会话时 SHALL 分组呈现（会话标题+状态点徽标）。无标题会话的 fallback 标题 SHALL 携带创建时间（如「发布 · HH:MM」）以区分多会话。

动效（当前步脉冲、成功图标入场）SHALL 遵守 `prefers-reduced-motion`。

#### Scenario: 运行中任务行步骤指示
- **WHEN** 某任务处于 progress 相位且 stageKey 在步骤链内
- **THEN** 任务行渲染 6 个步骤圆点（当前步主色+脉冲、过去步实心、未来步空心）且仅显示当前步一个文字标签

#### Scenario: 排队任务不预支步骤链
- **WHEN** 某任务处于 queued 相位
- **THEN** 任务行仅显示排队状态标签，不渲染步骤圆点链

#### Scenario: 成功行去冗余
- **WHEN** 某任务成功
- **THEN** 任务行不显示百分比数字（终态图标+状态文字已表达）

#### Scenario: 汇总口径
- **WHEN** 4 任务中 2 成功、1 失败、1 取消
- **THEN** 汇总行显示「成功 2/4 · 1 个失败 · 1 个已取消」，进度条填充按已完成（含失败/取消）比例

#### Scenario: 单会话扁平
- **WHEN** 面板仅有一个会话
- **THEN** 任务行直接平铺（无会话卡片边框/底色嵌套、无会话级状态徽标）

#### Scenario: 降级动效
- **WHEN** 系统开启 reduce motion
- **THEN** 步骤脉冲与图标入场动画关闭，状态语义不依赖动画

