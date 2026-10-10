{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "矛盾检测误伤 P0-1 核心：`_maybeRollback` 的 `!attempted` 分支把 `definitelyNotSent`（词表确认的登录失效）也计入缺失接线；平台一旦有过成功发布即被判定接线矛盾并永久停用回滚（要到重启/手动解除），登录失效族首次出现回滚即自毁。",
      "suggestion": "缺失接线计数仅限 `!attempted && !definitelyNotSent`；definitelyNotSent 属合法未提交，不得触发停用。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "security",
      "finding": "登录态词表在 publisher-router 的 `!result.success` 分支对任何命中文本打标；若平台在已收到内容后返回『登录超时/登录失效』响应，已提交窗口被误回滚，会早于窗口重复发布（危险侧），违背『可确证未送出』须先于平台写的要求。",
      "suggestion": "词表打标仅用于确证请求未发出的失败路径；带平台响应或超时的失败一律按已提交处理。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "设置页无覆盖时表单回填首个平台(wechat_mp)档位；用户不改任何字段直接保存，会把全部平台账号档统一成 20min、日配额压成 3/3/3，short 档(3min/20条)等差异化被静默抹平，还提示『已保存并立即生效』。",
      "suggestion": "无覆盖时回填各 tier 档位而不是首个平台；或保存前明确提示将整体覆盖三档。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "崩溃恢复后任务投影未含 submitAttempted/submittedAt/_hold：重启后在途任务按『未尝试』态重跑，失败判可回滚，可能重发平台已部分接收的内容；PRD 声称的 submitted_at 持久化在代码里未落实。",
      "suggestion": "任务序列化补 submittedAt/submitAttempted；恢复时在途任务标记人工确认，不自动重发。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "security",
      "finding": "紧急放行 `clearWindow` 同时清除 `platform:*`（连带撤销该平台其他账号的跨账号保护），且清窗后任务立即重跑不再过间隔判定——与 PRD『不穿透间隔语义』矛盾；每日1次上限约束不住跨账号连点。",
      "suggestion": "冷却维度改为平台粒度（同平台两次放行间隔≥N），文档与审计记录 platform:* 连带释放。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "新增 released 事件与 reason/daily 字段，但 diff 只更新了一处投影 store；方案自称的 5 处投影面（白名单）未见同步改动，released/blocked(daily) 状态可能在中间投影层被白名单过滤而不上屏。",
      "suggestion": "穷尽同步 publish-progress-events 等全部投影白名单，并补端到端事件链路用例。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "performance",
      "finding": "每次 `check()` 都经 policy 闭包重读 settings 覆盖并做全量解析，`_intervals` 在同一调用内多处重复执行同一次 env/覆盖解析，任务量大时有冗余 store 读与解析。",
      "suggestion": "每次判定可现取覆盖，但合并 `_intervals` 重复调用；设置写入时按平台缓存解析结果。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "设置页 emergencyQuotaText 读 `raw.emergencyStatus`，但 getPolicy 响应不含该字段，getPublishEmergencyStatus 从未被调用，每日上限行恒显示 '—'。",
      "suggestion": "挂载时调用 getPublishEmergencyStatus 并填充区块，或在 getPolicy 响应中返回放行状态。"
    }
  ],
  "dimensionScores": {
    "correctness": 5,
    "security": 6,
    "performance": 7,
    "maintainability": 6
  }
}