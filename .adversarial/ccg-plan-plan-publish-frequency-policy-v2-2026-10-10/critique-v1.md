{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "紧急放行无法解除等待：等待中任务尚未 recordPublish、不存在 hold；release 无 prev 时 no-op 并 warn。'取消setTimeout+重新入队'后 check 仍被拦，按钮对既有窗口主场景静默失效。",
      "suggestion": "新增独立 API guard.clearWait(platform,accountId,{reason:'emergency'})，显式置空窗口并审计；勿复用 release。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "check() 对 daily 桶返回 remainingMs=0，队列却需'次日00:00:05'重排；队列自算本地午夜会复制 TZ/自然日逻辑，违背 §3.3 单一真源纪律。",
      "suggestion": "check() 增 nextResetMs 字段（守卫内以 today/本地时区计算），队列直接使用。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "notSubmitted 置位未落到具体发布器抛错点，A1 依赖逐点标注才能命中；'ipc-handlers 前置校验失败'在入队前即拒，永不走 release 路径，列入白名单是误导。",
      "suggestion": "枚举各发布器 throw 点清单逐一标注；删除'前置校验失败'白名单行或改为入队后校验。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "record 23:59:59 与 release 00:00:01 时 decrDay 用新 day_key，旧日计数残留、新日被误扣；测试只覆盖 check 跨日（§3.3/§11.1），未覆盖 release 跨日。",
      "suggestion": "recordPublish 返回 day_key，release 回传并按原 day_key 扣减；补 release 跨日用例。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "security",
      "finding": "紧急放行复用 release() 会 decrDay 退还日配额——若日配额阻塞任务也可被'解除等待'，即静默绕过日限；EMERGENCY_MAX 作用域（每账号/全局）未定义，审计仅本地、运营无法远程发现。",
      "suggestion": "紧急放行不触日计数（仅清间隔）；EMERGENCY_MAX 写死为全局每日；审计支持导出或同步。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "check+incrDay 非原子：同账号并发任务（并发上限 3）可同时读到 used<max 均通过并各自记账，日配额超发（最多超并发数）；计划未定义原子性。",
      "suggestion": "提供原子 incrAndCheck（SQLite 事务）或按账号串行化执行；补并发用例。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "bucket('daily')与 reason('daily_quota')双枚举并存，§5.2 与 §6.2 事件负载字段混用（remainingMs vs reason），投影白名单两套字段易漂移。",
      "suggestion": "事件与 check 返回值共用同一枚举与字段定义，投影白名单单一来源派生。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "security",
      "finding": "平台档默认关自认削弱同平台多账号保护；'机构号矩阵建议开启'未给默认值建议，运营缺决策依据，风险转移给未来事故。",
      "suggestion": "设置页给出平台档开启建议值（1–3 分钟）与吞吐文案；PRD 写明默认关取舍与开启判定标准。"
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