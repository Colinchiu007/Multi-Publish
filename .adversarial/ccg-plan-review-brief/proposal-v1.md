# 影视工程自动模式 · 评审简报 v3（焦点：成本与安全契约）

预计改动 1800 行，涉及 14 个文件。自动模式：输入 5 项（剧本 ≤10000 字、人物参考图 ≤8 可选、场景参考图 ≤8 可选、横竖屏 16x9/9x16、大概时长 10–600s），程序自动完成规划→参考绑定→确认→分批出片→合成→片段编辑。必须复用影视工程既有资产（kit 模板块结构/剧本套用引擎/角色槽位/参考令牌/参考图注入/成本闸/分批驱动与台账/磁盘双核续跑/film_render 合成/原文直送）。

## 成本与安全契约（本轮焦点）

- C1 **清单式确认（非金额报价）**：影视工程无视频单价表，既有 `costCheck`（video-gen.js:280-307）同为清单式。确认卡显示镜数、单镜秒数、画幅、Provider、**预计调用次数 = 镜数 + 已发生的重生成次数**、磁盘/墙钟预估。
- C2 **确认门槛绑定到所有产生 provider 调用的通道**：`auto-start` 与 `auto-regenerate-shot` 在 `editedAt > confirmedAt` 时**先返回需重新确认**（前端出「重新确认成本」卡），未确认前零调用。累计重生成不得绕过门槛。
- C3 **append-only 确认历史**：`confirmations[]` 追加记录（时间 + 载荷哈希 + 分镜指纹 + 计划版本）；以最新一条为基准；**历史只追加不覆盖**，供审计回溯每次调用对应哪次确认。
- C4 **计划归属**：`planId = plan-<sha256(taskId|scriptHash|aspect|seconds|targetDuration) 前16hex>`，计划文件记录 `taskId`；`auto-start` 只收 `{planId,taskId,confirmed,overwrite?}`，服务端读自己落盘计划重建 shots 并逐项重校验受控根；不匹配 → `AUTO_PLAN_MISMATCH`；过期/孤儿 → `AUTO_PLAN_EXPIRED`。
- C5 **taskId**：服务端默认签发 `auto-<yyyyMMddHHmmss>`，允许客户端覆盖但须通过 1–64 位 `[A-Za-z0-9._-]` 与路径安全校验；已存在且无显式 `overwrite` → `AUTO_TASK_EXISTS`。同脚本可并存多个 taskId；**预算按 task 隔离**（每个 task 各自确认），不存在全局预算上限——此口径在确认卡与手册明示。
- C6 **校验时机**：全部输入域校验在 `auto-plan` 完成（越界即拒且不落盘），`auto-start` 只复查归属与受控根，不重复解释业务域。
- C7 **调用计数对账**：project.json 记 `providerCalls` 并与台账逐镜状态对账；确认载荷哈希与当前清单不一致 → 拒绝启动并要求重新确认。
- C8 **驱动器接缝**：自动模式**不经过 pipeline 引擎、不使用 run 快照**；直接调 `production-driver.runProduction`（`production-driver.js:155-268`）并注入 `runBatch/probe/emit`；数据载体 = `project.json`（内容真源）+ `ledger.json`（执行真源）；`probe` = `shot_NNN.mp4` 存在性（沿用 `ipc-handlers/film-engineering.js:52-59`）；`retry-shot` 与其 run 快照路径**完全不改**。

## 两点明确非设计（回应前轮批评中的前提）

1. **不存在「每 24 镜一段」的分段概念**：一次确认覆盖 1–120 镜（`MAX_AUTO_SHOTS=120`，等于输入域上界 `round(600/5)`），无分段分页、无段边界暂停。
2. **不做合并镜时长缩放**：单镜秒数全局唯一（`s ∈ {5,8,10}`，默认 5）；分场只做句级拆分（K<N），合并只在时长规划（K>N）且**合并=文本顺序拼接，仍是 1 镜 1 次调用**；不存在按比例缩放秒数或 `k×s` 渲染。

## 请评审确认

1. C2+C3 是否已闭合「累计重生成绕过成本门槛」与「确认历史无审计」两个缺口？
2. C5 的「预算按 task 隔离、无全局上限」口径是否可接受，或需全局并发/预算闸？
3. C8 直连 production-driver（不经 pipeline 引擎）的接缝是否留有状态不一致风险？
