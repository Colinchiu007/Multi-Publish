{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "completeness",
      "finding": "C2 门槛只比较 editedAt>confirmedAt，未定义重生成是否递增 editedAt：不递增则同一确认后可无限重生成、每次 1 次调用绕过成本确认；C7 对账仅在 auto-start 触发，拦不住逐次重生成。",
      "suggestion": "改按 authorized/consumed 计数闸：确认载荷含授权调用数，任一调用前超限即拒并重确认；明示重生成递增 editedAt。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "C1 预计调用次数只含镜数+重生成；若 auto-plan/参考绑定阶段存在 provider 调用（剧本套用/图分析），该成本不在确认清单内，构成未确认计费通道。",
      "suggestion": "方案列出全部 provider 调用点，或证明规划阶段零调用；非零则纳入确认清单。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "确认载荷哈希字段未枚举且不含参考图/人物图指纹；确认后更换参考图不触发重确认，渲染内容与已确认清单不符；C3 append 前未声明服务端校验哈希==当前清单。",
      "suggestion": "枚举哈希字段并纳入参考图 hash；append 前服务端重算比对，不匹配拒绝落库。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "probe=文件存在无法还原重生成调用次数；崩溃于计费已发生而台账未落/文件未写时，续跑重试会重复计费，C7 对账与调用计数递增点不同源。",
      "suggestion": "台账按版本记录每次调用（含 in-flight 态），续跑以台账驱动、未知态人工干预，providerCalls 由注入点自增。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "C8 称 retry-shot 沿用 run 快照路径完全不改，但自动模式无 run 快照；auto task 若可达 retry-shot/手动编辑，将在缺失快照上运行或写坏 ledger，与 project.json 真源冲突。",
      "suggestion": "auto task 打标，retry-shot/手动通道对 auto task 拒绝或改走 ledger 真源，列出可达通道白名单。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "security",
      "finding": "预算按 task 隔离且无全局上限，重确认可无限刷新授权；同机多 task 并发 runProduction 无 task 级锁、无 per-task 硬顶，总跑量/并发无界，纯事后对账拦不住。",
      "suggestion": "加 task 级单飞锁与 per-task authorized 硬顶（consumed>authorized 即拒）；全局上限可列为后续项。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "向 runProduction(production-driver.js:155-268) 注入 runBatch/probe/emit 属共享函数契约改动，'retry-shot 完全不改'需先证实现有签名已支持注入，否则改动会波及手动模式。",
      "suggestion": "贴出 runProduction 现签名证明可注入，否则用包装层注入并回归手动模式路径。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "security",
      "finding": "taskId 字符集 [A-Za-z0-9._-] 允许 '.'/'..' 段，路径安全校验未列明拒绝纯 . 与 ..；默认 auto-<yyyyMMddHHmmss> 秒级同值撞名未定义覆盖策略。",
      "suggestion": "校验拒绝 '.'/'..' 段与首字符为点；补同秒撞名（同秒多 plan）处理。"
    }
  ],
  "dimensionScores": {
    "completeness": 4,
    "consistency": 4,
    "clarity": 5,
    "feasibility": 5,
    "security": 5
  }
}