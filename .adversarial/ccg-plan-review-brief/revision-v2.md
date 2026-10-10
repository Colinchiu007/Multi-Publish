{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "已采纳：派发前同一临界区原子预留 consumed+1 再发请求，预留不可回滚并写入确认卡，不依赖串行派发。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "已采纳：consumed 唯一递增点=调用派发（即 providerCalls），受理仅置 editedAt；重确认被拒时未派发调用不计入。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "已采纳：分镜指纹纳入载荷哈希字段，auto-start 复核指纹与最新确认一致才启动，不符拒为 AUTO_PLAN_MISMATCH。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "已采纳：参考图/人物图指纹集与 provider 纳入 planId 哈希，配置不同即 planId 不同，基准确认不跨配置生效。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "已采纳：overwrite 仅作用于 plan 文件，旧 confirmations[] 与 ledger 归档保留并新开确认段，审计链不断。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "已采纳：契约加实现前置核实（probe 为跳过判定唯一入口、不读 run 快照）；无法隔离则回退同步写 run 快照复用既有续跑。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "已采纳：providerCalls 迁至 ledger.json 单一真源，写序为先台账 in-flight 与计数、后发请求，不一致拒续跑。"
    },
    {
      "issueId": "i8",
      "decision": "partially_accepted",
      "evidenceLevel": "L2",
      "evidence": "C1 已证无视频单价表，金额上限不可折算；每 task 确认卡即预算授权闸。",
      "response": "并发上限与 EXPIRED 判定采纳为正式项；全局金额预算不采纳——无单价表无法折算，授权仍由每 task 确认承担。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "任一 provider 调用前须 `consumed < authorizedCalls` 且 `editedAt ≤ confirmedAt`",
      "after": "任一 provider 调用须在同一临界区内**先原子预留 `consumed+1` 再发请求**（预留成功即占额、不可回滚，确认卡明示），预条件为 `consumed < authorizedCalls` 且 `editedAt ≤ confirmedAt`"
    },
    {
      "issueId": "i2",
      "before": "重生成受理即同时递增 `editedAt` 与 `consumed`。",
      "after": "重生成受理仅置 `editedAt`；`consumed` 唯一递增点=调用派发（同 C7 `providerCalls`，一次调用只计一次），重确认被拒时未派发的调用不计入。"
    },
    {
      "issueId": "i3",
      "before": "载荷哈希枚举字段：镜数、单镜秒数、画幅、Provider、剧本哈希、各参考图/人物图内容 hash；",
      "after": "载荷哈希枚举字段：镜数、单镜秒数、画幅、Provider、剧本哈希、**分镜指纹（每镜身份+顺序）**、各参考图/人物图内容 hash；"
    },
    {
      "issueId": "i3",
      "before": "不匹配 → `AUTO_PLAN_MISMATCH`；",
      "after": "不匹配或分镜指纹与最新确认记录不一致 → `AUTO_PLAN_MISMATCH`；"
    },
    {
      "issueId": "i4",
      "before": "`planId = plan-<sha256(taskId|scriptHash|aspect|seconds|targetDuration) 前16hex>`",
      "after": "`planId = plan-<sha256(taskId|scriptHash|refFingerprints|provider|aspect|seconds|targetDuration) 前16hex>`（参考图/人物图指纹集与 provider 参与哈希，配置不同即 planId 不同）"
    },
    {
      "issueId": "i5",
      "before": "已存在且无显式 `overwrite` → `AUTO_TASK_EXISTS`。",
      "after": "已存在且无显式 `overwrite` → `AUTO_TASK_EXISTS`；`overwrite` 作用对象仅为 plan 文件，旧 `confirmations[]` 与 `ledger.json` 归档保留并新开确认段，不重置不覆盖。"
    },
    {
      "issueId": "i6",
      "before": "（不改 runProduction 既有签名与手动模式调用点），并回归手动模式路径",
      "after": "（不改 runProduction 既有签名与手动模式调用点；实现前须读源码核实跳过判定唯一入口为注入 `probe`、`runProduction` 不自行读 run 快照，无法隔离则改为同步写 run 快照复用既有续跑），并回归手动模式路径"
    },
    {
      "issueId": "i7",
      "before": "project.json 记 `providerCalls`，其唯一递增点在注入的 runBatch（请求发出即 +1，不等结果）；",
      "after": "`ledger.json` 记 `providerCalls`（执行真源单一归属，不写 project.json），唯一递增点在注入的 runBatch：派发时先落台账 in-flight 与计数、再发请求（崩溃窗口由此定序），不等结果；续跑对账计数与台账不一致即拒并转人工；"
    },
    {
      "issueId": "i8",
      "before": "过期/孤儿 → `AUTO_PLAN_EXPIRED`。",
      "after": "过期/孤儿（计划落盘超 72h，或其 taskId 关联 task 已删除/归档）→ `AUTO_PLAN_EXPIRED`。"
    },
    {
      "issueId": "i8",
      "before": "全局总量/并发上限列为后续项——此口径在确认卡与手册明示。",
      "after": "全局**并发**上限为正式可配置项（`MP_AUTO_MAX_CONCURRENT_TASKS`，默认 2，超限排队）；全局金额预算不设（每 task 各自确认授权）——此口径在确认卡与手册明示。"
    }
  ]
}