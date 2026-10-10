{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "C4 要求 auto-start 读自己落盘 plan、重算 planId 并逐项重校验受控根，但 C8 又直连 production-driver 不经 run 快照。落盘 plan 与 ledger 双真源，若分镜指纹一致但目标输出文件被外部改动，重校验只验指纹不验产物，存在可悄悄替换的风险。",
      "suggestion": "受控根重校验加产物往返一致性（输出清单+稀疏哈希），不入库但启动时抽查，避免胶水文件被替换而不自知。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "C2 说 consumed 唯一递增点是调用派发且不可回滚；C7 续跑 in-flight/未知态不自动重试须人工干预。真源单一归属 ledger，但重生成受理仅置 editedAt 未计 consumed；若任务被 kill，in-flight 计数与已完成镜状态可能长期悬挂，无自动收敛路径。",
      "suggestion": "明确 in-flight 悬挂的收敛策略：超时判定过期态态化，人工介入时可选择性回滚计数，避免台账与产物永久锁定。"
    },
    {
      "id": "i3",
      "severity": "Info",
      "dimension": "security",
      "finding": "C5 允许客户端覆盖 taskId，仅做字符与路径段校验；如同名 taskId 服务端已落 ledger，覆盖后 confirmations 新开段保留旧历史。虽不重置灌账，但旧 confirmations 与旧 plan 的关联可能因指针错位。",
      "suggestion": "覆盖时列出并校验旧 confirmations 关联的 planId 标识，明确新段与旧段的切分点，避免历史被解引用错配。"
    }
  ],
  "dimensionScores": {
    "completeness": 3,
    "consistency": 2,
    "clarity": 3,
    "feasibility": 3,
    "security": 3
  }
}