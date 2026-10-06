{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "外部 API 调用不是数据库行内变更，无法用 claim token CAS 阻止旧 worker 已发出的请求继续耗配额或在租约过期后入库；「所有副作用都按 token CAS」过强。",
      "suggestion": "把 token CAS 定义为状态门；外部调用前和入库前重验 lease，入库用唯一键幂等，并尽量取消或忽略过期任务。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "C 级 fatal 的作用域不清：keyInvalid、accessNotConfigured、ipRefererBlocked 是凭证或应用配置错误，不应只停当前博主，也不应让每个博主重复触发。",
      "suggestion": "将 C 级绑定到凭证或集成级状态，联动暂停关联任务，明确重验和重输 Key 的恢复流程。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "动态配额收缩缺少阈值、观察窗、最小配额、恢复步长和跨重启持久化；「连续触发」定义不明，可能导致振荡或仍然超配。",
      "suggestion": "定义信号计数、时间窗、级别表、最小值、恢复节奏和重启恢复状态，并在 UI 显示。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "invalidPageToken 的任务级重试未定义分页断点；已完成页可能重复入库，或重试后丢失先前抓取结果。",
      "suggestion": "按页入库并保存 next page token checkpoint，重试从 checkpoint 开始，唯一键兜底。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "clarity",
      "finding": "90% 硬熔断的分母不明：是采集 60% 额度、全应用估算额度，还是单次运行预算；与动态收缩和暂停的优先级也未说明。",
      "suggestion": "给出计算公式、重置窗口、与动态收缩的优先级关系及 UI 状态。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "以字幕字节回调作为续租信号可能造成高频数据库写和锁竞争；回调、阶段切换和 deadline 的交错行为缺少节流约束。",
      "suggestion": "按时间或字节阈值节流续租，所有状态写仍走 token CAS。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "批量改 interval 与活动 claim 的并发语义缺失；未说明运行中任务是否完成、取消，或新间隔何时生效。",
      "suggestion": "引入配置版本或 CAS 协调，定义运行中任务的取消或延续规则。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "viral_library 与 discovered_item 无外键，但删除复位要求同事务关联；两表关系键和唯一性约束未在方案中明确。",
      "suggestion": "在 schema 中定义 platform+external_id 关联和唯一约束，并写入统一删除服务契约。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 7,
    "clarity": 7,
    "feasibility": 6,
    "security": 8
  }
}