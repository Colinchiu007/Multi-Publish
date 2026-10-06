{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。token CAS 收敛为状态门：外部调用前与入库前重验 lease，入库按唯一键幂等，过期任务放弃。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "接受。C 级改绑凭证/集成级：置失效并联动暂停关联任务，统一走重输 Key 后重验恢复，不逐博主触发。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受。补窗口、级别表、最小档、回升节奏、持久化与 UI 展示，消除「连续触发」歧义。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受。按页入库并存 page token checkpoint，重试从断点续跑，已完成页由唯一键幂等兜底。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受。分母定为当日采集份额 60%，跨日重置；优先级熔断>动态收缩>比例切分，UI 显示。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受。字节回调按 ≥2s 或 ≥64KB 节流后才写续租，所有状态写仍走 token CAS。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受。引入配置版本，运行中 claim 校验版本，变更即取消本轮并保留 checkpoint，下轮生效。"
    },
    {
      "issueId": "i8",
      "decision": "accepted",
      "response": "接受。schema 明确 (platform,external_id) 关联与两侧唯一键，复位契约写入统一删除 service。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "**所有行内变更与副作用都按 token CAS**——进度写入、lease 续期、熔断计数，漏一处旧 worker 即可覆盖或重复插入。",
      "after": "**token CAS 只作状态门，不作用于已发出的外部请求**——进度写入、lease 续期、熔断计数等行内变更按 CAS；每次外部调用前重验 lease，过期即放弃后续动作；入库在同一事务内重验 token 且以 `(platform,external_id)` 唯一键幂等，重复插入自动忽略。"
    },
    {
      "issueId": "i2",
      "before": "② keyInvalid/accessNotConfigured/**ipRefererBlocked** → C 首次即 fatal；",
      "after": "② keyInvalid/accessNotConfigured/**ipRefererBlocked** → C 集成级 fatal：置凭证状态失效、联动暂停全部关联任务（不逐博主重复触发），UI 引导重输 Key 后统一重验恢复；"
    },
    {
      "issueId": "i3",
      "before": "另以本应用实收的 429/quotaExceeded 做**动态收缩**——外部消费挤占致连续触发配额信号时逐级下调采集配额直至暂停，信号消失后回升。",
      "after": "另以本应用实收的 429/quotaExceeded 做**动态收缩**：滑动窗 10 分钟内 ≥3 次配额信号降一级（60%→45%→30%→15%→暂停），最小档 15%；窗口内 0 信号且持续 30 分钟回升一级；级别状态持久化、重启恢复；UI 显示当前档位。"
    },
    {
      "issueId": "i4",
      "before": "**invalidPageToken → B 级任务级**（分页实现缺陷或 token 过期，非单条问题，归 item 会静默跳过后续分页，须触发重试与日志告警）；",
      "after": "**invalidPageToken → B 级任务级**（分页实现缺陷或 token 过期，非单条问题，归 item 会静默跳过后续分页）：按页入库并持久化 next page token checkpoint，重试从 checkpoint 续跑，已完成页靠唯一键幂等不重复，日志告警；"
    },
    {
      "issueId": "i5",
      "before": "采集侧另有 90% 硬熔断 + 单次运行内 2 次重试预算（重试与回滚重跑均重新计费）。",
      "after": "采集侧另有 90% 硬熔断：分母为**当日采集份额 60%**，分子为估算已耗 units（探测+采集+重试），跨日窗口重置，触发即停本轮；优先级 熔断 > 动态收缩 > 比例切分，UI 显示熔断态。单次运行内 2 次重试预算（重试与回滚重跑均重新计费）。"
    },
    {
      "issueId": "i6",
      "before": "进展粒度定义为**阶段边界（元数据/字幕/入库切换）或字幕下载的字节级回调**，任一发生即续租，长字幕阶段不会被误判过期；",
      "after": "进展粒度定义为**阶段边界（元数据/字幕/入库切换）或字幕下载的字节级回调**；回调按「距上次续租 ≥2s 或累计 ≥64KB」节流后才写续租，避免高频库写与锁竞争，长字幕阶段不会被误判过期；"
    },
    {
      "issueId": "i7",
      "before": "④ 批量改间隔单事务、不做部分应用。",
      "after": "④ 批量改间隔单事务、不做部分应用，并递增配置版本号：运行中 claim 校验版本，版本变化即取消本轮（按页 checkpoint 保留已抓结果），新间隔下一轮生效。"
    },
    {
      "issueId": "i8",
      "before": "④ 不建外键。",
      "after": "④ 不建外键——两表以 `(platform, external_id)` 关联，`viral_library` 与 `discovered_item` 各自唯一键同构为 `(platform, external_id)`；复位由统一删除 service 在同一事务按该键完成。"
    }
  ]
}