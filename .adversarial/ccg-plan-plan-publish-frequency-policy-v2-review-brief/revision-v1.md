{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。占窗与计数移入 TaskQueue 自有环节，markSubmitted 降为阶段标记；启动期校验接线，失败路径与成功路径同权告警。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "接受。D8 钉死：紧急放行仍占窗、计数、过间隔判定，仅跳过配额用尽分支，不穿透间隔语义。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受。submitted_at 持久化到任务记录，重启按持久值判定；崩溃恢复的在途任务标记人工确认，不自动重发。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受。count 由队列在写前递增，传输失败仍占配额，仅未提交回滚回补；D10 措辞已同步改写。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受。补 D11（未登记平台写前校验+阻断出声）与 D12（校准脚本只读比对出报告），判定与口径已定义。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受。上限与间隔从 JSONL 逐条重算，重启不清零；删除或篡改审计文件记绕过告警并写入文档。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受。热生效仅作用于未占窗新判定，已占窗口冻结占窗时值至释放，运行中改 0 不放行已占窗任务。"
    },
    {
      "issueId": "i8",
      "decision": "accepted",
      "response": "接受。计数读写全部经 TaskQueue 单线程串行并写入文档，另以条件更新兜底防漂移。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "发布传输层在首次平台写操作前调用一次 `markSubmitted()`，队列记 `task.submittedAt`；",
      "after": "占窗与计数由 TaskQueue 自有环节完成、不依赖传输层；`markSubmitted()` 仅作阶段标记（传输层在首次平台写操作前调用一次），队列记 `task.submittedAt`；"
    },
    {
      "issueId": "i1",
      "before": "I4 **成功发布必须 `submittedAt !== null`**，否则 log.error + 计数——把「传输层漏接线」从静默风险变成主动告警。",
      "after": "I4 **成功或已提交失败的终态必须 `submittedAt !== null`**，启动期校验传输层已挂接 markSubmitted、缺失即 log.error + 计数——成功与失败路径均主动检测漏接线。"
    },
    {
      "issueId": "i2",
      "before": "两次放行间隔 ≥10 分钟。",
      "after": "两次放行间隔 ≥10 分钟。紧急放行仍须 occupy 窗口 + 计入 daily_count + 通过间隔判定，仅跳过「配额用尽」分支，不穿透间隔语义。"
    },
    {
      "issueId": "i3",
      "before": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；不动 publish_timeline。",
      "after": "D4 存储：新表 publish_daily_count(owner,key,day_key,count,rollback_count)；任务记录持久化 submitted_at（与计数同次写入），重启按持久值判定 submittedAt；发布中途崩溃恢复的在途任务标记为需人工确认、不自动重发。不动 publish_timeline。"
    },
    {
      "issueId": "i4",
      "before": "D10 配额回补：`daily_count` 计「已实际提交到平台的次数」⇒ 未提交回滚**幂等回补**（下限 0）；",
      "after": "D10 计数递增与回补：`daily_count` 由 TaskQueue 在发起提交（写前）时递增，传输失败仍占配额 ⇒ 仅 `submittedAt===null` 的回滚**幂等回补**（下限 0）；"
    },
    {
      "issueId": "i5",
      "before": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。",
      "after": "与「不做成功才记账」不冲突：计的是**提交**而非**成功**。\n- D11 未登记平台出声：提交前校验平台已登记于策略表，未登记 → 阻断任务 + log.warn + 提示「该平台未登记频率策略」，不静默放行。\n- D12 校准脚本：只读策略表输出各档预期值，比对 daily_count 与时间线差异生成报告；仅出报告，不自动改写计数。"
    },
    {
      "issueId": "i6",
      "before": "+ **追加式 JSONL 审计**（UI 无编辑入口）+ 每日上限 1 次",
      "after": "+ **追加式 JSONL 审计**（UI 无编辑入口，删除/篡改该文件记绕过告警）+ 每日上限 1 次与间隔均由 JSONL 逐条重算（重启不清零）"
    },
    {
      "issueId": "i7",
      "before": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。",
      "after": "I7 新数值在每轮 `check()` 时读取、即时生效，无存量迁移；入队时旧值、执行时新值按新值判定。热生效仅作用于未占用窗口的新判定；已占窗口冻结占窗时值至释放，运行中改 0 不即时放行已占窗任务。"
    },
    {
      "issueId": "i8",
      "before": "计数读回 parseInt，非有限 → 0 + warn。",
      "after": "计数读回 parseInt，非有限 → 0 + warn。计数读写全部经 TaskQueue 单线程串行（同通道 FIFO），不并发；回补以条件更新（day_key 匹配、下限 0）兜底防漂移。"
    }
  ]
}