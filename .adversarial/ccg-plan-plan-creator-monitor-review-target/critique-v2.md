{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "配额收敛缺少并发与短期成本口径：并发导入或配置变更可能都通过预检；/c/custom、错误重试和一次性导入成本未预留，可在合法路径突破当日池。",
      "suggestion": "配置写入串行化或加显式锁；预检纳入当日已用、resolver一次性成本、重试与并发预留，不足整体拒绝。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "attempt_count语义冲突：claim时递增且上限3，但又说超限后按1h/6h/24h冷却再入队；未说明节流、真故障、资源错分别是否计入。",
      "suggestion": "定义仅可重试失败递增；attempt上限为最多执行次数，超限不再入队；B′资源错与一次性错误不计。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "手动采集指定博主未定义是否创建creator_accounts、follows、discoveries，也未说明配额归属、去重和失败暂停对象；非关注博主可能绕过统一治理。",
      "suggestion": "手动采集也走同一条creator服务与claim/配额/失败分级；若允许临时采集，需定义生命周期和落库映射。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "删除采集库条目把discovery复位pending，与两表非主从存在张力：发现事实源被采集库删除单边改写；取消关注后还可能遗留pending任务。",
      "suggestion": "改为标记discovery为collected_removed或archived，保留审计与删除原因；unfollow时冻结pending任务。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "失败分级未定义多reason和errors[]提取规则。YouTube错误可能嵌套details或多reason，也可能与其他错误并存；当前描述无法确定唯一主因。",
      "suggestion": "规定reason提取顺序、多reason聚合规则、unknown fail-closed行为，并用官方错误fixtures做预检。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "今日占用与约束公式未定义配额重置时区、持久化计数口径、失败请求是否计费，以及外部工具耗尽后的运行时降级策略。",
      "suggestion": "使用YouTube配额重置边界；按响应与官方计费规则持久化估算；配额耗尽时明确暂停探测与采集。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "clarity",
      "finding": "隔离区容量500条/10MB后，新未知载荷的处理策略缺失；只停止新增会让任务被拒收，覆盖保存则违反既有条目只读保留。",
      "suggestion": "超限后保存摘要与溢出计数，不存完整载荷；任务保留隔离标记并要求人工清理后恢复。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 8
  }
}