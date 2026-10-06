{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。配额变更收敛到单一 service + DB 事务不变量，启动/导入/迁移全量预检，失败整体回滚并补用例。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "接受。补 claim token + 心跳续租，完成/失败 UPDATE 匹配 token；attempt_count 上限 3、超限冷却再入队。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受。唯一索引改为 (platform, external_id) partial，creator_id 可空，迁移预检按同键执行。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受。补 videoNotFound/invalidPageToken 为 B′、ipRefererBlocked/forbidden 归 C，均不进 B 连续停用计数。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受。新增显式 resolver 矩阵：URL 形态、API 参数、错误、unit 成本，全部计入探测池并配预检测试。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受。隔离区落库前脱敏、设容量与告警，不自动删；人工清理记录操作者与原因。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受。对外区分未配置/解密失败/平台不可用三态，只暴露状态与 fingerprint，日志禁明文。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "故每次新增/改间隔/批量调整前实时重算，超限拒绝（批量调整**整体拒绝不做部分应用**）。",
      "after": "故所有配额相关变更（新增/改间隔/批量调整/导入/恢复备份/迁移/启动加载/直接写库）必须收敛到单一 service，在同一 DB 事务内重算并落库，超限即事务整体回滚（批量调整**整体拒绝不做部分应用**）；启动/导入/迁移先全量预检，失败全量拒绝并补用例。"
    },
    {
      "issueId": "i2",
      "before": "lease 300s 过期可被接管；`attempt_count` 在 claim 时递增。**绝不做先查后改。**",
      "after": "lease 300s 过期可被接管，但旧 worker 的完成/失败 UPDATE 必须匹配本次 claim token，token 不符即丢弃其结果；长采集用心跳续租（每 60s 续至 +300s）。`attempt_count` 在 claim 时递增，上限 3 次，超限按 1h/6h/24h 冷却后再入队。**绝不做先查后改。**"
    },
    {
      "issueId": "i3",
      "before": "（该表无 `external_id`/`creator_id`）",
      "after": "（该表无 `creator_id` 列，`external_id` 存量可能为空串）"
    },
    {
      "issueId": "i3",
      "before": "partial 唯一索引（`WHERE external_id <> ''`，普通 UNIQUE 会因存量空串重复键抛错致**应用起不来**）+ 迁移前冲突预检（冲突非空不静默去重）",
      "after": "partial 唯一索引 `(platform, external_id) WHERE external_id <> ''`（对齐 D6，防跨平台同 ID 相撞；普通 UNIQUE 会因存量空串重复键抛错致**应用起不来**）+ 迁移前冲突预检按 `(platform, external_id)` 同键执行（冲突非空不静默去重）+ `creator_id` 允许为空（存量行无映射）"
    },
    {
      "issueId": "i4",
      "before": "| B 真故障 | `channelNotFound`/`playlistNotFound`/reason 缺失兜底 | ✅ 连续3次 |",
      "after": "| B 真故障 | `channelNotFound`/`playlistNotFound`/reason 缺失兜底 | ✅ 连续3次 |\n| B′ 资源/参数错 | `videoNotFound`/`invalidPageToken` | ❌ 单条跳过，不进停用计数 |\n| C′ 配置错（带 reason） | `ipRefererBlocked`/`forbidden` | ✅ **首次即** `fatal_paused` |\n\nreason 清单以 YouTube 官方枚举为预检用例集；配置类与非频道资源错误均不进 B 的连续停用。"
    },
    {
      "issueId": "i5",
      "before": "4 种 URL 写法必须先解析再落库，**禁止用用户原始输入当 ID**（否则同一博主拆成 4 行）。解析失败拒绝写入，不降级兜底。",
      "after": "4 种 URL 写法必须先解析再落库，**禁止用用户原始输入当 ID**（否则同一博主拆成 4 行）。解析走显式 resolver 矩阵（URL 形态 → API 参数 → 错误 → unit 成本）：`/channel/@handle` 与 `@handle` 用 `channels.list(forHandle=)`（1 unit）；`/user/legacy` 用 `forUsername`（1 unit）；`/c/custom` 直解失败才用 `search.list`（10 units，计入探测池）。矩阵配预检测试；解析失败拒绝写入，不降级兜底。"
    },
    {
      "issueId": "i6",
      "before": "隔离区保留原始 JSON + 来源标注，从不自动删除（自动删 = 静默丢用户配置）。",
      "after": "隔离区保留 JSON + 来源标注：落库前按字段白名单脱敏（token/账号/cookie 只留长度与指纹），设容量上限（默认 500 条 / 10MB），超限告警并停止新增、既有条目只读保留；不自动删除（自动删 = 静默丢用户配置），人工清理须记录操作者与原因。"
    },
    {
      "issueId": "i7",
      "before": "`safeStorage` 不可用时整个监控功能 fail-closed，不降级明文。",
      "after": "`safeStorage` 不可用时整个监控功能 fail-closed，不降级明文；对外暴露三态状态 `not_configured` / `decrypt_failed` / `platform_unavailable` 与 fingerprint，区分未配置与密钥不可恢复（DPAPI 损坏/换机/升级），日志只记状态与指纹，禁止输出明文。"
    }
  ]
}