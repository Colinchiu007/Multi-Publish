# Design: publish-progress-panel-refine

## Context

publish-progress-ux 已建立「主进程富化发射层（单一实现）→ App 级 store（唯一承载）→ 全局非模态浮窗」三层契约。本变更只动**呈现层与一条新增事件转发**，不触碰编排语义与既有 IPC 形状。

## Goals / Non-Goals

- Goals：视觉降噪（dot-stepper/去重/网格）、UE 补口（取消入口、失败恢复、自动收敛）、取消链路端到端（`cancelled` 相位）。
- Non-Goals：不改 TaskQueue 并发/重试/超时语义；不做阶段级日志流；不做跨重启断点续跑；不改 stageKey 封闭清单；不给浮窗加遮罩（保持非模态）。

## Decisions

### D1 取消相位走事件单一来源（而非渲染层自标记）

TaskQueue `cancel()` 已同步发 `task:cancelled`（pending 移除与 running 协作中止两路径都发）。选择在 phase4-events 转发为 `publish:progress { phase:'cancelled' }`，而不是让 store 在 IPC 返回后自标记：

- 事件是进度状态的单一来源（既有契约）；自标记会造出第二份真相，两路竞争。
- 转发同时修复既有缺陷：页面级取消（usePublishFlow.cancelPublish）后浮窗不再永远「进行中」。
- `PHASE_ENUM` 主进程/渲染层两处同步加 `cancelled`（漏一处会被 emitter 归一为 `progress`——测试锁覆盖）。

### D2 取消确认用两步内联，不用 ElMessageBox

浮窗按 PRD-OVERLAY-VIEW-SUSPENSION §6 显式不接入浮层互斥；ElMessageBox.confirm 属应用级模态浮层，接入即触发互斥合同（owner 登记+成对释放+测试登记）。取消是低频破坏性操作，两步内联（点击→「确认取消？」4 秒窗口→再点执行）在 SaaS 破坏性按钮中是成熟模式，且零模态合同成本。

### D3 自动收敛只在「完成跃迁」触发，且仅全成功

- 触发条件：`hasRunning` true→false 跃迁时启动 5s 计时（用户事后手动展开不触发——展开即被 5 秒后收回是骚扰）。
- 收敛资格：面板展开、有会话、`failed===0 && cancelled===0`（存在失败/取消时保持展开，不遮蔽重试入口）。
- 取消收敛：面板内任意 pointerdown、新会话开始（hasRunning 回 true）、组件卸载。
- 计时器归组件所有（store 不持计时器——store 保持纯状态）。

### D4 汇总口径改为「成功数直给」

`aggregate.done` 把 failed 计入「已完成 N/M」与「N 个失败」并置，用户要做减法。改为 `summarySucceeded: 成功 {succeeded}/{total}`，failed/cancelled 各自单列；进度条填充仍按 done/total（已完成工作比例，含失败——条形图语义是「处理进度」不是「成功进度」）。aggregate 新增 `cancelled` 计数字段（加法，不破坏既有消费方）。

### D5 dot-stepper 只显示当前步一个词

6 圆点+连线承载「进度位置」语义（CI pipeline 惯例：过去=实心、当前=主色+脉冲、未来=空心），当前步词紧跟圆点后（唯一文字）。waiting/retry/blocked/failed/queued 不进链（状态标签表达）；queued 不预渲染步骤链（未开始的任务不预支 6 步认知负担）。i18n 宽度：连线 flex 自适应，不写死宽度。

### D6 TaskRow 保持纯展示（props 单向 + emit 上抛）

单任务重试/复制错误由 TaskRow `emit('retry')`/`emit('copy-error')` 上抛，Panel 持有 store 调用与剪贴板副作用——TaskRow 不 import store，维持「纯展示组件」注释契约。

## Risks / Trade-offs

- **相位枚举三处同步**（emitter PHASE_ENUM / store PHASE_ENUM / store TERMINAL_PHASES）：漏改的失败模式是 cancelled 被归一为 progress（永远进行中）或非终态（会话不收敛）——回归测试锁三处各自断言。
- **自动收敛吞掉失败提示**：以 `failed===0 && cancelled===0` 资格门规避。
- **剪贴板 API 可用性**：`navigator.clipboard.writeText` 失败（非安全上下文/权限）→ catch 落「复制失败」toast，不静默。
- **视觉基线**：浮窗为 Teleport 动态浮层，不在既有像素基线视图内；QM-4 按口径如实登记（不硬凑基线）。

## Migration Plan

- `phase:'cancelled'` 为加法：旧渲染层收到未知相位按 `progress` 归一（既有 fail-closed 行为），新主进程+新渲染层同版本发布，无跨版本窗口。
- locale key：`summaryDone` → `summarySucceeded`（语义变更，同步改 PRD 表）；`sessionTitleFallback` → `sessionTitleTimeFallback`；新增 cancel/copy/statusCancelled 等 12 键，zh/en 成对。
