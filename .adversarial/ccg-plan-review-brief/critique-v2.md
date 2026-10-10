{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "security",
      "finding": "C2 门槛「consumed < authorizedCalls」为检查后递增，未规定原子性；runBatch 若并行派发，N 个调用同时读到旧 consumed 全数通过，实际发出超授权，累计重生成仍可绕过成本门槛。",
      "suggestion": "派发前在同一临界区内先预留（consumed 原子 +1）再发请求，或规定 runBatch 串行派发；预留不可回滚须在确认卡明示。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "consistency",
      "finding": "「重生成受理即递增 consumed」与 C7「runBatch 请求发出即 +1」关系未定义：同计数器则一次重生成双计；异计数器则拒绝重确认后 consumed 无回滚，产生预算漂移，authorizedCalls 无法对账。",
      "suggestion": "规定 consumed 唯一递增点=调用派发（即 providerCalls），受理仅置 editedAt；重确认被拒时未派发调用不计入。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "security",
      "finding": "载荷哈希枚举字段缺分镜指纹：计划文件被篡改（同脚本换分镜划分）后哈希仍通过，确认记录指纹与实际执行分镜不符，C3 审计无法映射调用对应确认。",
      "suggestion": "将分镜指纹（每镜身份+顺序）纳入载荷哈希字段，auto-start 复核指纹一致才启动。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "security",
      "finding": "planId 仅绑定 scriptHash/aspect/seconds/targetDuration，不含参考图/人物图指纹与 provider；不同参考配置可共用同一 planId，「最新一条确认为基准」可能授权与确认不符的计划。",
      "suggestion": "把参考图/人物图指纹集与 provider 纳入 planId 参与位或 auto-start 复核，配置不同即 planId 不同。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "C5 overwrite 与 C3「历史只追加不覆盖」冲突：overwrite 已有 task 若重置 confirmations[]/ledger 则审计链断裂；且未明确 overwrite 作用对象是 plan 还是 task。",
      "suggestion": "规定 overwrite 仅覆盖 plan 文件，旧 confirmations[] 与 ledger 归档保留并新开确认段；语义写入契约。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "C8 依赖包装层注入 probe 控制续跑，但 runProduction 内部若自行读 run 快照/自身状态决定跳过，注入 probe 可能被旁路或双重判定；接缝契约未验证。",
      "suggestion": "读源码确认 runProduction 跳过逻辑唯一入口是注入 probe 并回归手动模式；无法隔离则改为同步写 run 快照复用既有续跑。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "providerCalls 记于 project.json（内容真源）而台账是执行真源，成本计数归属与真源划分冲突；崩溃窗口两文件写入顺序未定义，续跑时计数与台账可能不一致。",
      "suggestion": "把 providerCalls 迁至 ledger.json 单一真源，定义崩溃写序（先台账 in-flight 后计数）与对账修复流程。"
    },
    {
      "id": "i8",
      "severity": "Warning",
      "dimension": "security",
      "finding": "无全局预算/并发上限：多 task 可并行各近 120 次调用，总消耗无顶，仅靠确认卡与手册明示；AUTO_PLAN_EXPIRED 的「过期/孤儿」判定标准（时限？taskId 失联？）未定义。",
      "suggestion": "至少加可配置的全局并发上限（如同时 N 个 task）并定义 EXPIRED 过期条件，列为正式项而非后置。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 6,
    "security": 6
  }
}