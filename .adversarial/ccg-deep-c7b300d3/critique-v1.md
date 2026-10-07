{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "creator-collector-runtime.js 的 listPosts 计算 uploads 播放列表 ID 用 `'UU' + channelId.slice(2)`，channelId 非 UC 前缀时拼接错误；且对 playlistItems 响应的 videoId 解析依赖 contentDetails（默认 part 未请求），实为 undefined。collectBody 无 pythonBridge 时 content 恒为空串。运行时依赖这些字段却从未有真实请求测试。",
      "suggestion": "补 part=contentDetails；改用 channels.snippet.uploads 真实值；给 runtime 增加真实 HTTP 层测试或 fixture 断言 videoId 解析。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "creator-runtime.collectOne 中 store.methods（markCollected 等）在真正 renderer 是 sql.js；方案 §6.2.1 要求「校验+跨表插入 MUST 同 BEGIN IMMEDIATE 事务」，但 markCollected/enqueueOutbox 是独立 exec，无事务上下文；markCollected 成功与 enqueueOutbox 之间崩溃即产生 collected 但 outbox 未入队的漂移，PRD 明说的终态一致性未落地。",
      "suggestion": "把 markCollected+outbox 包进同一 db.transaction，或由 store 暴露事务化 finalize(discoveryId, token, body) 原子提交。"
    },
    {
      "id": "i3",
      "severity": "Critical",
      "dimension": "security",
      "finding": "creator-runtime.collectOne 在 markCollected 返回 false（token 已被接管）时仍直接 return，但在此之前已把 body 内容写入本地/内存；方案 ORIGINAL 规定「changes()===0 立即放弃后续写操作并把本地缓存结果丢弃」。collectBatch 对该 superse 结果仍计 failed 且不重试，用户点击重采会因 claim 已被新持有者接管而报 busy，无法恢复。",
      "suggestion": "superseded 时丢弃 body 引用并返回可重试语义；确认新持有者完成后的 pending 重路由或等待队列。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "security",
      "finding": "creator-limits 的 hardLimit=100 仅覆盖单次 count，但 collect-one 与 send-to-writer 每次调用都消耗 YouTube API 配额（1 unit/次），quota ledger 表建了却无处引用；采集配额不落账，崩溃/强杀后内存计数脱账的兜底目的落空。门槛函数只在 follow 时做 probe 配额校验，collect 侧配额完全无守卫。",
      "suggestion": "把 collection_quota_ledger 接入 collectOne/collectBatch 记账，并加「达上限即拒」（quota_would_exceed）的同款拦截。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "creator-monitor.REASON_PRIORITY 中 videoNotFound 归 ITEM 但 invalidPageToken 归 PERMANENT；listPosts 单次调用中任一作品 videoNotFound 时该次探测整体失败分类——错误分级在不同粒度（作品级/分页级）间混用，探测阶段采用的是分类结果，无逐作品累进。",
      "suggestion": "分离「分页请求级」与「作品解析级」两个错误通道，探测失败按批次整体处理 videoNotFound。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "collection creator tab 只追加在 Collection.vue 内嵌模板，但未做 creator 特性开关；creatorPendingTotal 引用未在本文件定义（Collection.vue 中无该 ref），运行时 undefined 拼接导致 tab badge 恒不显示或抛错，且 5500 行变更规模与「未接线主进程」自述矛盾：IPC 依赖注入未接，creatorList 在真实主进程里没有 handler 时就永远 degraded。",
      "suggestion": "在 Collection.vue 定义 creatorPendingTotal 或改由 CreatorMonitor 内部拉取；明示主进程未接线的降级矩阵。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "performance",
      "finding": "creator-monitor.projectedProbeUnits 假设每次探测恒 1 unit，但 listPosts 单次调用含 playlistItems 1 次 + 分页翻页（>50 作品）多次、collectBody 每件 1 次，实际消耗按内容数量增长；1440/interval 的纯频率维度低估真实消耗，配额池可能实际打爆。",
      "suggestion": "引入按作品数/分页数的 unit 系数（1 + ceil(n/50)），并同步配额预算公式。"
    },
    {
      "id": "i8",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "openspec 记录同步过账但内容重复：QM-1 打包证据整节在 openspec/records/creator-monitor-impl.md 出现两次，.quality-gates.md 出现合并冲突残留 `>>>>>>>` 标记，gate-record-debt-ledger 新增于未合并 PR，记录链自证不一致。",
      "suggestion": "删除重复节与冲突标记，回填前不登记 ledger 欠账，保证 merge 后单一真源。"
    }
  ],
  "dimensionScores": {
    "correctness": 3,
    "security": 4,
    "performance": 6,
    "maintainability": 5
  }
}