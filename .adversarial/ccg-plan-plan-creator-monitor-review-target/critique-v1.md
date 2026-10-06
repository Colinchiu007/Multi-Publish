{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "viral_library INSERT 无法直接用 discovery 行的 claim_token 做 UPDATE WHERE CAS，若先查 token 再插另一表，仍存在 TOCTOU 竞态导致重复插入。",
      "suggestion": "将 token 校验与 viral_library 插入放进同一 BEGIN IMMEDIATE 事务，事务内原子完成。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "invalidPageToken 归为 item 级不正确：它通常是分页实现缺陷或 token 过期，非单条视频问题，标记 item 级会静默跳过后续分页内容。",
      "suggestion": "invalidPageToken 改为 B 级任务级失败，触发重试与日志告警，不静默跳过。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "clarity",
      "finding": "数据模型声称 3 张新表但仅详细描述 2 张，第三张表名、字段和用途缺失，影响评审完整性。",
      "suggestion": "补充第三张表的结构与职责定义。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "「仅有进展时续租」未定义何为进展，字幕下载等长时间阶段可能超 lease 期限而被误判过期。",
      "suggestion": "定义进展粒度：字节级回调或阶段边界均视为进展并续租。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "按 15/60/25 比例切配额假设外部消费均匀，若其他应用占满项目配额，本应用比例分配无实际约束力。",
      "suggestion": "增加外部 429/quotaExceeded 反馈驱动的动态收缩阈值。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "删除采集库条目复位 discovery 仅覆盖一条路径，用户通过其他入口删 viral_library 或清理孤儿时未定义同步行为。",
      "suggestion": "将复位逻辑收敛为 viral_library 表级删除触发器或统一删除 service。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "security",
      "finding": "safeStorage 加密无恢复路径，OS 密码重置或跨设备迁移后 API Key 不可解密。",
      "suggestion": "提供重新输入引导提示并标记 keyInvalid 状态。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "未知 action.type 挂起后缺乏主动通知机制，用户可能长期不察觉任务停滞。",
      "suggestion": "挂起时触发 UI 徽标或通知。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 8
  }
}