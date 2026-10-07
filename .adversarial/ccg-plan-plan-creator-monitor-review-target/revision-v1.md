{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。token 校验与 viral_library 插入移入同一 BEGIN IMMEDIATE 事务原子完成，消除先查后插 TOCTOU。"
    },
    {
      "issueId": "i2",
      "decision": "accepted",
      "response": "接受。invalidPageToken 移出 item 级，改判 B 任务级，触发重试与告警，不静默跳过后续分页。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受。补齐第三张表 creator_watch 的字段与职责，并写明三表边界。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受。进展粒度定义为阶段边界或字幕字节级回调，任一发生即续租，长阶段不被误判过期。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受。比例切分降为内部保守分配，另加实收 429/quotaExceeded 反馈驱动的动态收缩。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受。复位收敛到 viral_library 统一删除 service，一切删除入口必经，禁止调用点各自 DELETE。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受。解密失败标记待重输并 UI 引导，复用 keyInvalid 提示，不清配置不静默失败。"
    },
    {
      "issueId": "i8",
      "decision": "accepted",
      "response": "接受。挂起即推 UI 徽标/通知并在任务列表标 suspended，含任务名与载荷摘要。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "**所有行内变更与副作用都按 token CAS**——进度写入、lease 续期、`viral_library` 插入、熔断计数，漏一处旧 worker 即可覆盖或重复插入。",
      "after": "**所有行内变更与副作用都按 token CAS**——进度写入、lease 续期、熔断计数，漏一处旧 worker 即可覆盖或重复插入。`viral_library` 插入不得先查 token 再插另一表（TOCTOU 仍在）：token 校验与插入必须放进同一 `BEGIN IMMEDIATE` 事务内原子完成，任一步失败整体回滚。"
    },
    {
      "issueId": "i2",
      "before": "④ **videoNotFound/invalidPageToken → item 级**（单条被删不该永久停用整个博主；`ipRefererBlocked` 是应用级403，**不能**归 item 否则监控静默失效）；",
      "after": "④ **videoNotFound → item 级**（单条被删不该永久停用整个博主；`ipRefererBlocked` 是应用级403，**不能**归 item 否则监控静默失效）；**invalidPageToken → B 级任务级**（分页实现缺陷或 token 过期，非单条问题，归 item 会静默跳过后续分页，须触发重试与日志告警）；"
    },
    {
      "issueId": "i3",
      "before": "**数据模型**：3 张新表。",
      "after": "**数据模型**：3 张新表——`creator_watch`（博主关注表：`platform` + `external_id` 唯一键、`interval_seconds`、`status` active/paused、`created_at`，博主维度唯一真源，监控轮次、配额跳过集与 UI 关注列表均读它）、`discovered_item`（发现执行表：`claim_token`、`lease`、`attempt_count`、`discovery_status`）、`viral_library`（采集库）。"
    },
    {
      "issueId": "i4",
      "before": "心跳**仅有进展时**续租（无进展却续租 = 挂起任务永不过期）；",
      "after": "心跳**仅有进展时**续租（无进展却续租 = 挂起任务永不过期），进展粒度定义为**阶段边界（元数据/字幕/入库切换）或字幕下载的字节级回调**，任一发生即续租，长字幕阶段不会被误判过期；"
    },
    {
      "issueId": "i5",
      "before": "读不到真实用量，故按相对比例切（探测15%/采集60%/余量25%）。",
      "after": "读不到真实用量，故按相对比例切（探测15%/采集60%/余量25%），该比例只约束本应用内部；另以本应用实收的 429/quotaExceeded 做**动态收缩**——外部消费挤占致连续触发配额信号时逐级下调采集配额直至暂停，信号消失后回升。"
    },
    {
      "issueId": "i6",
      "before": "④ 不建外键。两表非主从：",
      "after": "④ 不建外键。`viral_library` 的一切删除（UI 删除、导入覆盖、清理孤儿）必须走**统一删除 service**，复位在同一 service 的同一事务内完成，禁止调用点各自 DELETE。两表非主从："
    },
    {
      "issueId": "i7",
      "before": "API Key `safeStorage` 加密。",
      "after": "API Key `safeStorage` 加密；解密失败（OS 密钥重置、跨设备迁移）不视为数据丢失——标记为待重新输入并由 UI 引导重输新 Key（复用 `keyInvalid` 提示路径），不清除其余配置、不静默失败。"
    },
    {
      "issueId": "i8",
      "before": "未知 `action.type` **挂起该任务 + 隔离原始载荷**，绝不 throw",
      "after": "未知 `action.type` **挂起该任务 + 隔离原始载荷**，并立即向 UI 推送徽标/通知（任务名 + 载荷摘要）且在任务列表标记 `suspended`，防止长期无人察觉；绝不 throw"
    }
  ]
}