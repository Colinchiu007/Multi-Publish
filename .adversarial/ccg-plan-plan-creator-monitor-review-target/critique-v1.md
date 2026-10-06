{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "outbox终态判据与写入时机冲突：同事务写viral_library后、outbox done前，collected与viral_library均已存在，不等于done；删除和巡检会误判。",
      "suggestion": "将viral_library写入与collected统一放到outbox done事务；中间态用collecting/ready，不参与终态判据。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "仅用频道枚举不能证明采集链路：字幕、媒体、元数据有可用性、版权与反爬限制，方案缺来源矩阵和端到端验证标准。",
      "suggestion": "补字幕/媒体来源、可用性与失败矩阵，先用固定频道跑端到端P0。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "删除事务提升token，但outbox撤销与finalizer CAS未必同事务；stale outbox可能在删除后完成并复插viral_library。",
      "suggestion": "outbox携带token；done事务校验当前token，删除事务内写入cancellation/tombstone。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "outbox指数退避没有最大尝试、死信和告警；永久失败会无限重试，staging因outbox未done也不清。",
      "suggestion": "设最大尝试与dead_letter状态，人工恢复；staging按终态清理。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "外部争用收缩到50%/25%后未定义冷却、恢复验证和TTL；瞬时quotaExceeded或外部程序退出会导致长期低水位。",
      "suggestion": "quotaExceeded立即冷却；收缩带TTL，低流量探测成功后恢复水位。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "本地预算没有定义跨日重置、时钟漂移与崩溃后的已发请求对账；巡检批量复位pending也产生未列出的配额压力。",
      "suggestion": "持久quota ledger按日期记账并启动对账；巡检复位也走配额准入。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "续租进展把字节回调等同进展，慢速重复回调或重复读取可能续租但无有效推进；阶段边界粒度也可能太粗。",
      "suggestion": "要求最小字节增量或时间阈值，心跳上报字节与阶段位置。"
    },
    {
      "id": "i8",
      "severity": "Warning",
      "dimension": "security",
      "finding": "送AI写作的外发边界未定义；字幕和媒体可能含创作者内容、个人信息或受版权内容，直接出站缺合规与用户确认。",
      "suggestion": "列外发字段、模型、留存与脱敏策略，首次外发需明确确认。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 5,
    "clarity": 7,
    "feasibility": 5,
    "security": 6
  }
}