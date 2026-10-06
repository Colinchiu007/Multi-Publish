{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "ipRefererBlocked 被列为 item 单资源级错误，但它通常是 API Key/IP/referrer 限制导致的应用级 403，不是单视频故障。",
      "suggestion": "移到 C 级 fatal；item 级仅保留 videoNotFound 等确实针对单资源的 reason。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "claim_token 仅约束成功/失败提交不完整。进度写入、采集副作用、lease 续期若未按 token CAS，旧 worker 仍可产生覆盖或重复插入。",
      "suggestion": "claim 用原子 UPDATE+RETURNING；所有行内变更与副作用都按 claim_token 条件提交。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "配额模型只给探测公式；采集 60% 缺少每日计数和熔断，且公式未计重试、退避和手动 channels 解析成本。",
      "suggestion": "增加分池日计数器、采集硬熔断、重试预算，超限时阻止操作并明确提示。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "启动存量超限时只写「降级运行」，未定义跳过哪些博主、是否继续消耗配额，与「绝不静默饿死」有解释空间。",
      "suggestion": "定义确定性排序、跳过集、恢复条件，并在 UI 列出每个被跳过博主及原因。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "security",
      "finding": "「永不跨 IPC 传渲染层」与用户在渲染层输入 API Key 的配置流程冲突；首次保存必须经 IPC 到主进程。",
      "suggestion": "改为：仅允许一次性 set-key 请求，不提供明文回读，保存后立即清除渲染层明文。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "lease 300 秒加心跳 60 秒仍未限制总任务时长；长视频下载或字幕请求挂起时，心跳可能无限续租。",
      "suggestion": "增加每阶段超时、总任务 deadline 和有进展才续租的心跳条件。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "无外键是正确选择，但删除 viral_library 后复位 discovery 若不在同一事务，失败会留下 pending 状态并导致重复采集。",
      "suggestion": "把删除与批量复位放进一个事务，并用唯一映射和 UPSERT 防并发重复。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "失败分级未定义响应包含多个 reason 时的优先级，也未说明空 body 时脱敏摘要的来源字段。",
      "suggestion": "定义 reason 优先级：quota/rate、auth/config、notFound、unknown；空 body 记录状态码与请求 ID。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 7
  }
}