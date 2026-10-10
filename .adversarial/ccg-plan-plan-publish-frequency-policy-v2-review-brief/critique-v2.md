{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "D6 将 markSubmitted 定于『首次平台写前』：传输层失败（含首次写失败）全部落入已提交侧，e.notSubmitted 仅佐证，回滚永不触发——P0-1『未提交可立即重试』对最常见的请求未送达不可达；坏凭据反复重试仍持续占窗耗配额。",
      "suggestion": "markSubmitted 改为首次写被平台接收后调用；或传输层明确返回『确定未送出』时允许回滚。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "『数学上不可能溢出』仅对次日配额定时器成立；抖动路径 wait×1.4 在任一间隔源 ≥ 2³¹−1/1.4 ≈ 17.7 天时仍溢出，Node setTimeout 钳位 1ms 即忙循环。校验未声明间隔源上界。",
      "suggestion": "为 MIN_INTERVAL/PLATFORM_MIN_INTERVAL 声明上界（如 <7 天），或保留含抖动系数的溢出守卫。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "clarity",
      "finding": "D1 给出两套三档数字（20/10/3 与 3/5/20）但未绑定 tier 名；平台档与账号档合并规则（取最大/分别判定/各自 key）缺失。有效等待是核心语义，缺此无法实现验证。",
      "suggestion": "给出 tier→(interval, dailyQuota) 完整映射表及跨档合并公式（如取 max），并注明两档各自归属 key。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "占窗口的 store 存储介质/持久化未声明；若为内存实现，重启即清空窗口，已提交任务不再受间隔约束（I1 失效），叠加 D4 仅覆盖在途崩溃，存在早重复发布路径。",
      "suggestion": "明确窗口 store 持久化方案，或重启后按持久 submittedAt 重建窗口再判定。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "交互文案『未提交到平台，可立即重试』与 D9『回滚后强制最小退避 max(RELEASE_GRACE_MS,10s)』矛盾：用户被告知立即重试，引擎却至少等 10s。",
      "suggestion": "文案改为『约 10 秒后可重试』，或注明最小退避不通知用户。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "D8 每日紧急放行上限 1 次令『两次放行间隔≥10分钟』恒真冗余；上限按账号还是全局未说明。若指与其他发布间隔则需明确对象。",
      "suggestion": "删除 10 分钟规则或改为『与上次任何发布间隔≥10分钟』，并注明上限统计粒度。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "daily_count 与窗口 key 含 accountId，正常路径未声明校验，仅紧急放行有 isSafePathSegment；外部可控 accountId 可致 key 碰撞或越界。",
      "suggestion": "将 isSafePathSegment 前置到所有 key 构造处，或说明 accountId 来源已受控。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "feasibility",
      "finding": "D3 注入 today() 保证可测，但 D7 次日定时器按真实系统时钟计算，两者不同源时（测试注入、时钟漂移）运营日判定与定时器截止漂移。",
      "suggestion": "定时器截止与 today() 共用同一时钟注入点。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 7,
    "clarity": 6,
    "feasibility": 6,
    "security": 8
  }
}