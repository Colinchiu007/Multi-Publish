## ADDED Requirements

### Requirement: 发布队列通道调度

TaskQueue（`packages/shared-utils/src/task-queue.js`）SHALL 按「通道」调度任务：通道键为 `platform + ':' + (accountId ?? '')`。同一通道内的任务 SHALL 严格串行（FIFO，前序任务进入终态后才开始下一个）；不同通道 SHALL 在 `maxConcurrent` 总量约束内并行。

同通道任务串行 SHALL 覆盖频控等待路径：任务因发布最小间隔被推迟（`publish:blocked`）并回退 pending 时，其通道占用 SHALL 同步释放，不得让同通道后续任务在等待期被堵死。

`maxConcurrent` SHALL 可经环境变量 `MP_QUEUE_MAX_CONCURRENT` 覆盖（合法域 [1,10]，默认 3）；非法值 SHALL 回落默认并出声告警（console.warn），不得静默。

#### Scenario: 同账号串行

- **WHEN** 两个任务同平台且同 accountId 依次入队
- **THEN** 第二个任务在第一个任务进入终态（success/failed/cancelled）之后才开始执行，期间两者不得同时处于 running

#### Scenario: 跨账号并行

- **WHEN** 两个任务同平台但 accountId 不同，且 maxConcurrent 允许
- **THEN** 两个任务可同时处于 running

#### Scenario: 频控等待不堵通道

- **WHEN** 同通道第一个任务因发布最小间隔被推迟（回退 pending 等待重排）
- **THEN** 该通道对第二个任务立即可用（第二个任务可启动）

#### Scenario: 无账号任务同平台串行

- **WHEN** 两个任务同平台且 accountId 均为 null/缺失
- **THEN** 两任务同通道串行（平台登录面共享，不并行）

#### Scenario: 总并发上限仍生效

- **WHEN** 多通道任务并发入队
- **THEN** 同时 running 的任务总数不超过 maxConcurrent

#### Scenario: 环境变量覆盖

- **WHEN** 设置 `MP_QUEUE_MAX_CONCURRENT=6` 并创建 TaskQueue（未显式传 maxConcurrent）
- **THEN** 队列并发上限为 6；设置为非法值（如 `abc` 或 `99`）时回落 3 且产生 console.warn

### Requirement: RPA 窗口池化复用

RpaViewManager（`apps/desktop/electron/services/rpa-view-manager.js`）SHALL 按 `platform:accountId` 键池化隐藏发布窗口：发布成功（`result.success === true`）的会话窗口 SHALL 导航至 `about:blank` 后归还池（不销毁）；失败会话窗口 SHALL 立即销毁（状态污染兜底）；后续同键发布 SHALL 优先复用池内窗口并跳过 cookie 三段恢复（登录态在持久 partition 中跨任务有效）。

池容量 SHALL 有上限（默认 6，`MP_RPA_POOL_SIZE` 可覆盖，合法域 [1,10]），超限 SHALL 销毁最久未用的池内窗口；池内空闲超过 TTL（默认 10 分钟，`MP_RPA_POOL_TTL_MS` 可覆盖）的后台清理定时器 SHALL 销毁过期窗口。

#### Scenario: 成功归池

- **WHEN** 某发布任务成功完成
- **THEN** 其窗口不销毁，进入池并在释放前导航 about:blank；`windows` 活动映射中该键移除

#### Scenario: 复用热窗口

- **WHEN** 同键（平台+账号）的第二个发布任务启动且池中有该键窗口
- **THEN** 复用池内窗口（不新建 BrowserWindow、不重复执行 cookie 恢复三段），窗口从池移出

#### Scenario: 失败销毁

- **WHEN** 某发布任务失败（result.success 为 false 或执行抛错）
- **THEN** 其窗口立即销毁，不入池

#### Scenario: 池上限与 TTL

- **WHEN** 池内窗口数超过上限，或某窗口空闲超过 TTL
- **THEN** 超限最旧窗口/过期窗口被销毁；清理定时器不阻止进程退出（unref）

### Requirement: 抖音图文 API 直连链

api-publish-engine 的抖音适配器（`src/adapters/douyin.js`）SHALL 支持图文发布：`taskData.images`（非空数组，各项含 `path`）时走新增图文链（`src/publish/platforms/douyin-image.js`），`taskData.video.path` 时走既有视频链，两者皆缺时 fail-closed（data_error）。图文链 SHALL 复用视频链的 imagex 图片上传单元、ticket-guard 签名与 create v2 提交通道，逐图上传后以图文类型提交，并在失败/风控判定上与视频链同口径（安全验证与 110 分流返回 `risk_blocked`）。

RPA 视图管理器（`rpa-view-manager.js`）的 API-first 判据 SHALL 使抖音图文任务自动走 API 链；API 失败 SHALL 沿既有回退路径降级到 RPA 图文链。

图文链请求体中未经真机取证切片确认的字段 SHALL 在代码注释标注 `UNVERIFIED` 并在专题 PRD 逐字段登记取证状态；单测 SHALL 只锁「与视频链同构 + dry-run 短路 + fail-closed 边界」，不得把未取证字段值钉成契约。

#### Scenario: 图文走 API 链

- **WHEN** 发布任务 platform=douyin 且 article.images 为非空路径数组（无 video_path）
- **THEN** 走 DouyinImageChain：逐图 imagex 上传 → 图文 create v2 提交；成功返回 `{success:true, mode:'api', platform:'douyin'}`

#### Scenario: 无媒体 fail-closed

- **WHEN** 图文与视频数据均缺失
- **THEN** 返回 `{success:false, error 含 'images or video.path', code: data_error}`，不发起任何上传请求

#### Scenario: 风控分流同口径

- **WHEN** create 提交返回安全验证或 status_code 110
- **THEN** 返回 `{success:false, risk_blocked:true}`（与视频链一致，不自动换号）

#### Scenario: dry-run 短路

- **WHEN** opts.dryRun 为 true
- **THEN** 不发起任何网络请求直接返回 `{success:true, dryRun:true, platform:'douyin'}`

#### Scenario: API 失败回退 RPA

- **WHEN** 图文 API 链抛错（网络/风控外失败）
- **THEN** rpa-view-manager 记录警告并回退 RPA 图文链（既有行为），最终结果以实际轨道为准
