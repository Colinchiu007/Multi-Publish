{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "completeness",
      "finding": "D7 跨日长定时器 + 重启后 hold 丢弃，方案只说'等下次 _processNext'，但未定义重启时 hold 是否持久化、pending 队列如何恢复；若 hold 仅存内存，崩溃即丢，'明日00:00后自动继续'承诺失效，只测了跨日边界却未测重启恢复。",
      "suggestion": "明确 hold/持久化载体与重启恢复流程，补重启场景单测与用例。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "security",
      "finding": "D6 白名单依赖 e.notSubmitted===true 由各执行器自行标记；若某执行器漏标或异常对象不带该字段，非白名单失败会被当作'已提交'而占窗口——fail-closed 方向 I2 依赖调用方自觉，却无兜底校验，属可被误判的隐形风险。",
      "suggestion": "对缺失 notSubmitted 标记的失败显式告警并默认按未提交处理，或引入强制校验。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "D5 依赖调用方回传 prev，遗漏则静默退化为 no-op（自认弱点）；多模块多调用点回传 prev 易漏，且 no-op+warn 的 warn 无强告警通道，长期无人发现，安全但难察觉削弱可观测性。",
      "suggestion": "prev 缺失改为返回失败并显式记录，或开发态断言强制补齐调用点。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "P2-5 含 publish:wechat 改动，但方案未给出其调用方审计证据；若确认无生产调用方，仍涉及跨模块改动，且与 P1/P2 核心链路无强关联，混入单个 PR 扩大验证面。",
      "suggestion": "拆分或单列该改动，先审计调用方再决定是否纳入。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "D2 抖动只增不减少与 D1 数值下调叠加，自认弱点 4 所述吞吐可能降 3 倍以上；但决策部分未相应给出 UI 或日志的吞吐预估提示，用户将无感知接受等待变长。",
      "suggestion": "在设置页或启动日志提供预估间隔/吞吐提示，避免无预期变慢。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "P1-1 平台档默认关与 I3 '0 只表示显式关闭'语义冲突：默认关会影响同平台多账号共档保护（平台间隔失效），虽声明为'决策'，但与'保留同平台保护'目标存在张力。",
      "suggestion": "论证默认关理由，或改为默认开但调至 1–3 分钟并保留显式关闭路径。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "P2-1 数值下调与 D1 使 60→20/30→10/10→3，方案未说明新值是否影响既有定时器、队列中已排期项的兼容处理，改动后的存量任务间隔可能无法覆盖。",
      "suggestion": "补充存量任务的间隔适配或触发说明，验证无遗留在途任务。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "security",
      "finding": "D8 紧急放行审计仅本地环形 200 条且每日 1 次，无外部溯源/告警；出问题仅本地可见，跨环境排查无日志可依。",
      "suggestion": "增加结构化告警或导出通道，确保紧急放行可被外部追踪。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 6
  }
}