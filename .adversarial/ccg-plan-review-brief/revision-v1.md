{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。C2 改为 authorized/consumed 计数闸，重生成受理即递增 editedAt 与 consumed，逐次拦截。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "接受。明示规划/参考绑定为本地计算零调用，并加硬约束：未来引入 provider 调用须先纳入清单。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受。哈希字段枚举并纳入参考图/人物图指纹，append 前服务端重算比对，不一致拒绝落库。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受。providerCalls 改在注入点自增；台账按版本记含 in-flight 的每次调用，续跑以台账驱动、未知态人工干预。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受。auto task 打标，retry-shot/手动通道对 auto task 拒绝，并列出可达通道白名单。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受。加 task 级单飞锁与 per-task authorized 硬顶；全局上限列为后续项并在手册明示。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受。改用包装层注入，不改 runProduction 签名与手动调用点，并回归手动模式路径。"
    },
    {
      "issueId": "i8",
      "decision": "accepted",
      "response": "接受。拒绝 '.'/'..' 及以点开头的段；默认签名加随机后缀，同秒撞名走 AUTO_TASK_EXISTS。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "在 `editedAt > confirmedAt` 时**先返回需重新确认**（前端出「重新确认成本」卡），未确认前零调用。",
      "after": "以授权计数闸为准：确认载荷含 `authorizedCalls`（初值=镜数+已发生重生成），任一 provider 调用前须 `consumed < authorizedCalls` 且 `editedAt ≤ confirmedAt`，否则**先返回需重新确认**（前端出「重新确认成本」卡），未确认前零调用；重生成受理即同时递增 `editedAt` 与 `consumed`。"
    },
    {
      "issueId": "i2",
      "before": "**预计调用次数 = 镜数 + 已发生的重生成次数**",
      "after": "**预计调用次数 = 镜数 + 已发生的重生成次数**（即授权调用数初值）；规划与参考绑定阶段（auto-plan/剧本套用/参考图注入）全部为**本地计算，零 provider 调用**（剧本套用为文本模板套用，参考图/人物图仅做本地内容 hash 与令牌绑定、不做模型分析），未来若引入任何 provider 调用须先纳入本清单"
    },
    {
      "issueId": "i3",
      "before": "追加记录（时间 + 载荷哈希 + 分镜指纹 + 计划版本）",
      "after": "追加记录（时间 + 载荷哈希 + 分镜指纹 + 计划版本 + 人物图/参考图指纹集 + authorizedCalls），且 **append 前服务端按当前清单重算载荷哈希，不一致拒绝落库**；载荷哈希枚举字段：镜数、单镜秒数、画幅、Provider、剧本哈希、各参考图/人物图内容 hash"
    },
    {
      "issueId": "i4",
      "before": "project.json 记 `providerCalls` 并与台账逐镜状态对账",
      "after": "project.json 记 `providerCalls`，其唯一递增点在注入的 runBatch（请求发出即 +1，不等结果）；台账按版本逐次记录每次调用（含 in-flight 态），续跑以台账驱动，in-flight/未知态不自动重试、须人工干预；再与台账逐镜状态对账"
    },
    {
      "issueId": "i4",
      "before": "`probe` = `shot_NNN.mp4` 存在性（沿用 `ipc-handlers/film-engineering.js:52-59`）",
      "after": "`probe` = 台账该镜已落 `done` 且 `shot_NNN.mp4` 存在（文件存在仅作辅助校验，不作为续跑唯一依据；沿用 `ipc-handlers/film-engineering.js:52-59` 的路径形态）"
    },
    {
      "issueId": "i5",
      "before": "`retry-shot` 与其 run 快照路径**完全不改**。",
      "after": "`retry-shot` 与其 run 快照路径**完全不改**；auto task 打标 `mode:'auto'`，retry-shot 与一切 run 快照类手动通道对 auto task 一律拒绝（`AUTO_TASK_LOCKED`），可达通道白名单 = `auto-plan`/`auto-confirm`/`auto-start`/`auto-regenerate-shot`/只读查询。"
    },
    {
      "issueId": "i6",
      "before": "不存在全局预算上限——此口径在确认卡与手册明示。",
      "after": "无全局上限；但每 task 施加**单飞锁**（同 task 同时仅允许一个 runProduction）与 **per-task 硬顶**（`consumed > authorizedCalls` 即拒），全局总量/并发上限列为后续项——此口径在确认卡与手册明示。"
    },
    {
      "issueId": "i7",
      "before": "直接调 `production-driver.runProduction`（`production-driver.js:155-268`）并注入 `runBatch/probe/emit`；",
      "after": "直接调 `production-driver.runProduction`（`production-driver.js:155-268`），经**包装层**注入 `runBatch/probe/emit`（不改 runProduction 既有签名与手动模式调用点），并回归手动模式路径；"
    },
    {
      "issueId": "i8",
      "before": "服务端默认签发 `auto-<yyyyMMddHHmmss>`",
      "after": "服务端默认签发 `auto-<yyyyMMddHHmmss><4位随机>`（同秒多 plan 不撞名）"
    },
    {
      "issueId": "i8",
      "before": "允许客户端覆盖但须通过 1–64 位 `[A-Za-z0-9._-]` 与路径安全校验",
      "after": "允许客户端覆盖但须通过 1–64 位 `[A-Za-z0-9._-]` 与路径安全校验（显式拒绝 `.`、`..` 段及任何以 `.` 开头的段）"
    }
  ]
}