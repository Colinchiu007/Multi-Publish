{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "security",
      "finding": "回滚与配额判定完全依赖传输层正确调用 markSubmitted；漏接线时失败路径 submittedAt 恒 null→误释放窗口+计数不增，配额/间隔静默失效，I4 仅覆盖成功路径，失败路径零检测，误判会产生重复发帖。",
      "suggestion": "计数递增与占窗移入队列自有环节（occupy 递增、回滚回补），markSubmitted 仅作阶段标记；失败路径同样校验接线。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "D8 未定义紧急放行与日配额/占窗/计数的关系：是否绕过配额、占窗口、计入 daily_count？全绕时仅 1 次/日上限约束，且后续发布不等待该窗口，间隔语义被穿透。",
      "suggestion": "钉死语义：紧急放行仍 occupy+计数+间隔判定，仅跳过配额用尽分支；或显式列出绕过范围并设独立上限。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "task.submittedAt 仅存内存队列，重启即失。发布中途崩溃恢复后 submittedAt=null→误回滚/重发，重复发帖风险；D7 仅定义配额阻塞任务的恢复语义。",
      "suggestion": "submittedAt 持久化到任务记录，重启按持久值判定；恢复中的在途任务标记为需人工确认而非自动重发。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "count 递增点未钉死：D6 首次写前调 markSubmitted，D10 却称 count=「已实际提交」；若写后递增，超时/回包丢失的已发帖不入配额（上界失真），若写前则失败写占配额。需二选一并写清。",
      "suggestion": "钉死：count 随 markSubmitted（写前）递增，失败写占配额，仅未提交回滚回补；同步改 D10 措辞。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "P2-3 未登记平台出声、P2-4 校准脚本列入范围，但 D1–D10 无对应条目：判定标准、触发点、输出口径均未定义，交付时必缺失。",
      "suggestion": "补两条决策：未登记平台出声（写前校验平台白名单+阻断+提示）；校准脚本（读配置表→校准 daily_count/时间线→输出报告）。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "紧急放行「每日 1 次、间隔≥10min」的计数来源未定义：内存计数重启清零，读 JSONL 删文件即重置，上限存在可绕过路径。",
      "suggestion": "上限从持久化 JSONL 逐条重算（或独立持久计数），并文档声明删除/篡改审计文件记为绕过告警。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "I7 热生效：运营中把平台档改 0（显式关闭）会即时放行未到期占窗任务，等同通过配置绕过 I1 已提交失败窗口；若属误配则突发发布。",
      "suggestion": "明确 0=关闭仅对未占用窗口的新判定生效；已占窗口冻结占窗时值至释放（或文档承认此绕过属故意行为）。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "publish_daily_count 的 count 递增与回补在并发路径无原子性说明（同账号多任务并发占窗/回滚时计数可漂移）。本机队列串行可接受，但需写明。",
      "suggestion": "文档化：计数变更全部经 TaskQueue 单线程串行，或以 SQL 原子自增/条件更新兜底。"
    }
  ],
  "dimensionScores": {
    "completeness": 5,
    "consistency": 7,
    "clarity": 7,
    "feasibility": 8,
    "security": 6
  }
}