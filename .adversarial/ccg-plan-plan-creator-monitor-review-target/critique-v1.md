{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "配额约束只在配置变更入口执行；导入/恢复备份/迁移/启动加载/直接写库仍可能产生超限组合，批量拒绝也未绑定数据库事务。",
      "suggestion": "所有变更走单一 service + DB 事务不变量；启动/导入/迁移先验证，失败全量拒绝并加用例。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "claim+lease 未定义接管语义：300s 后旧 worker 仍可能完成并覆盖 collecting，长采集缺少续租，attempt_count 也没有上限和冷却策略。",
      "suggestion": "用 claim token 加心跳续租；完成/失败 UPDATE 必须匹配 token；attempt_count 加上限、冷却与测试。"
    },
    {
      "id": "i3",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "D6 去重键为 (platform, external_id)，但 viral_library 只描述 external_id <> '' 的唯一索引；跨平台同 ID 可撞，存量行与 creator 映射语义未闭合。",
      "suggestion": "改 (platform, external_id) partial 唯一索引；creator_id 可空；迁移预检按同键执行。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "失败分级清单不完整：videoNotFound、forbidden、ipRefererBlocked、invalidPageToken 等未列，B 兜底会把可修复或非频道故障计入连续停用。",
      "suggestion": "补全官方 reason 测试集；非频道资源错误与配置错误分开，不进停用计数。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "4 种 URL 到 channelId 的解析流程、API 参数与失败原因未定义；handle/legacy URL 可能需额外请求，成本和歧义未计入配额。",
      "suggestion": "写显式 resolver 矩阵：URL形态、API参数、错误、unit 成本，配预检测试。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "security",
      "finding": "隔离区从不自动删除可无限增长，且原始载荷可能包含 token/账号等敏感字段，未定义容量、脱敏与人工清理审计。",
      "suggestion": "落库前脱敏，设容量与数量告警；人工清理记录操作者和原因。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "security",
      "finding": "safeStorage fail-closed 缺少可观测细节；Windows DPAPI 损坏、换机或升级时用户难以区分未配置与密钥不可恢复。",
      "suggestion": "区分未配置、解密失败、平台不可用；只暴露 fingerprint/状态，禁止日志输出明文。"
    }
  ],
  "dimensionScores": {
    "completeness": 6,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 7
  }
}