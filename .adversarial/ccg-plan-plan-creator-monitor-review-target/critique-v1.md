{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "feasibility",
      "finding": "BEGIN IMMEDIATE 只能保证数据库原子性；字幕/媒体/第三方产物写入仍在事务外。崩溃或提交后产物失败会产生已采集状态与实际内容不一致，token CAS 也不能撤销已提交插入。",
      "suggestion": "定义 outbox/最终化协议：产物幂等键、可重试、失败补偿清理；先落产物或用 staging，再同事务入库。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "completeness",
      "finding": "删除收敛只靠 review，且未定义删除 viral_library 后 creator_discoveries 的状态迁移。若 discovery 仍为 collected，后续探测会因唯一键跳过，作品无法重新采集。",
      "suggestion": "删除入口原子执行：viral 删除、discovery 置 pending/skipped、token 失效；另加定时完整性巡检。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "“按 token CAS”缺少精确协议：token 如何单调递增、过期抢占是否生成新 token、所有 UPDATE 是否必须带 WHERE claim_token = ?。否则实现易留下过期写覆盖。",
      "suggestion": "把 token 定义为 generation 序号，列出全量 CAS 语句模板和过期规则。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "配额模型只按探测 1、采集 count/50 计费，未覆盖 captions/download、频道解析、分页、重试、失败半批和方法差异；本地分区无法校准共享项目真实消耗。",
      "suggestion": "建立 API 方法成本表，按请求/子操作计费并暴露明细；周期性对账成功响应和熔断水位。"
    },
    {
      "id": "i5",
      "severity": "Warning",
      "dimension": "feasibility",
      "finding": "续租条件中“字节回调”未要求有效增量。下载卡住时事件循环仍可能触发心跳，导致无进展任务持续续租；阶段心跳也可能来自停滞流程。",
      "suggestion": "心跳必须伴随最小字节/阶段/时间间隔阈值，并保留连续停滞检测。"
    },
    {
      "id": "i6",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "未知 action.type 隔离后缺少恢复路径。应用升级或补齐处理器后，任务如何重放、payload schema 如何兼容、隔离区与 active 任务如何关联未定义。",
      "suggestion": "记录 schemaVersion、目标链路和隔离原因；处理器注册后提供显式重放与结果通知。"
    },
    {
      "id": "i7",
      "severity": "Warning",
      "dimension": "security",
      "finding": "safeStorage 四态覆盖了解密失败，但未说明密钥轮换、备份导入、多账号与 Key 的绑定关系；渲染层一次性明文仍可被 XSS 在输入期间捕获。",
      "suggestion": "明确定义凭证绑定/轮换流程；渲染层禁用危险 HTML、限制 IPC 权限并审计 set 调用。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "completeness",
      "finding": "content_quality 与 transcript_source 只有字段名，未给出判定规则、数据保留、失败来源降级和下游 AI 写作可接受性标准。",
      "suggestion": "补枚举、阈值、来源优先级、保留策略和字段级验收用例。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 7,
    "clarity": 7,
    "feasibility": 6,
    "security": 7
  }
}