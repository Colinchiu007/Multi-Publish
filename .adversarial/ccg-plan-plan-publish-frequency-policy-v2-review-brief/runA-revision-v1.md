{
  "schemaVersion": 1,
  "responses": [
    {
      "issueId": "i1",
      "decision": "accepted",
      "response": "接受。hold 改为持久化存储，重启时由 _processNext 按 hold_until 重算 remaining，并补重启恢复单测。"
    },
    {
      "issueId": "i2",
      "decision": "partially_accepted",
      "evidenceLevel": "L1",
      "evidence": "I2 明文：白名单外一律占窗口；默认按未提交即放行已提交失败",
      "response": "接受缺标记告警与装配锁强制校验；拒绝默认按未提交，那会放行已提交失败、违反 I2，改为占窗口+warn。"
    },
    {
      "issueId": "i3",
      "decision": "accepted",
      "response": "接受：prev 缺失改为返回 {released:false,reason} 并 log.error，调用点以结构锁枚举断言必须回传。"
    },
    {
      "issueId": "i4",
      "decision": "accepted",
      "response": "接受：publish:wechat 移出本 PR，先审计调用方，确认无生产调用方后另立变更，不混入核心链路。"
    },
    {
      "issueId": "i5",
      "decision": "accepted",
      "response": "接受：设置页与启动日志给出档位预估间隔与吞吐（含抖动期望），避免用户无预期变慢。"
    },
    {
      "issueId": "i6",
      "decision": "accepted",
      "response": "接受：平台档默认改为 2 分钟（开），显式 0 才关闭，保留同平台共档保护并消除与 I3 的语义冲突。"
    },
    {
      "issueId": "i7",
      "decision": "accepted",
      "response": "接受：新值仅作用于下次计算的等待，存量排期项在 _processNext 重算取新档，补在途任务验证用例。"
    },
    {
      "issueId": "i8",
      "decision": "accepted",
      "response": "接受：审计行补结构化字段并接入诊断报告导出通道，可跨环境溯源；环形200条与每日1次保留。"
    }
  ],
  "edits": [
    {
      "issueId": "i1",
      "before": "- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。",
      "after": "- D7 日配额用尽：bucket='daily'、remainingMs=0，重排到次日 00:00:05；超 2^31-1 则不设定时器，等下次 _processNext。hold 不存内存：以存储行字段 hold_until（owner,key,day_key 同行）持久化；重启后 _processNext 用 remaining=hold_until-now 重算，pending 队列按各 key 现存 hold 重建排期，补「崩溃丢定时器→重启恢复」单测。"
    },
    {
      "issueId": "i2",
      "before": "；白名单外一律占窗口。",
      "after": "；白名单外一律占窗口。字段缺失（e.notSubmitted===undefined）按白名单外处理并 log.warn（含 executorId/errorCode）；各执行器标记由装配锁断言，缺标记即红。"
    },
    {
      "issueId": "i3",
      "before": "调用方须回传 prev，未回传则 no-op+warn。",
      "after": "调用方须回传 prev，未回传则返回 {released:false,reason:'prev_missing'} 并 log.error，不再静默 no-op；调用点清单由结构锁枚举断言已回传。"
    },
    {
      "issueId": "i4",
      "before": "P2-5 两处小坑。",
      "after": "P2-5 两处小坑中的 publish:wechat 移出本 PR（先审计调用方、确认无生产调用方后另立变更），本次仅改另一处。"
    },
    {
      "issueId": "i5",
      "before": "- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。",
      "after": "- 间隔未到：阻塞+剩余分钟（本账号间隔/同平台其他账号间隔）。\n- 设置页展示当前档位预估间隔与吞吐（含抖动期望×1.2）及生效时间，启动日志同步打印同一预估。"
    },
    {
      "issueId": "i6",
      "before": "- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 0（关）；日配额 长文3 / 短视频5 / 短内容20 条。",
      "after": "- D1 数值：账号档 60→20 / 30→10 / 10→3 分钟；平台档默认 2 分钟（开，保同平台多账号共档保护），仅显式 0 表示关闭（与 I3 对齐）；日配额 长文3 / 短视频5 / 短内容20 条。"
    },
    {
      "issueId": "i6",
      "before": "P1-1 平台档默认关；",
      "after": "P1-1 平台档默认2分钟（开，显式0关）；"
    },
    {
      "issueId": "i7",
      "before": "## 数据校验",
      "after": "## 兼容与存量\n- D1/P2-1 新数值只作用于下一次计算的等待；已在定时器中排期的项不改写，_processNext 每轮按新档重算 remaining，验证无遗留在途旧间隔（含重启后）。\n\n## 数据校验"
    },
    {
      "issueId": "i8",
      "before": "- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次。",
      "after": "- D8 紧急放行：二次确认 + 审计（环形200条）+ 每日上限1次；审计行含结构化字段（ts/accountId/operator/reason/result）并写入诊断报告导出通道，可跨环境溯源。"
    }
  ]
}