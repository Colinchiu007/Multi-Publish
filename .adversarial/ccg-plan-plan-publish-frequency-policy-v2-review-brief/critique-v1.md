{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "consistency",
      "finding": "平台档与 platform:* 键在默认配置下失效：所有账号档(20/10/3min)均≥默认平台档2min，max(账号档,平台档)恒等于账号档，平台档及共享键从不生效，'同平台多账号至少隔2分钟'承诺不落地。",
      "suggestion": "明确平台档真实取值策略，或将平台档默认值调到可超过账号档的值，或在D1补充平台档触发条件与共享键实际参与remaining的读取逻辑。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "security",
      "finding": "D6可回滚判据①submitAttempted===false完全依赖传输层主动调用markSubmitAttempted。若某平台漏接线，submitAttempted恒false，'已提交但失败'会被误判为可回滚，违反I1；I4仅校验成功路径submittedAt，失败路径漏接线无告警。",
      "suggestion": "增加失败路径主动告警：当返回失败且submitAttempted恒false时计数并log.error；或用结构锁/枚举断言传输层调用点，参照D5 prev缺失的处理。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "completeness",
      "finding": "D7的_quotaBlocked集合与指向次日00:00:05的unref定时器均为内存态，方案未说明重启后日配额阻塞与次日复位定时器的恢复路径，跨日/重启后可能永久卡在daily阻塞或定时器丢失。",
      "suggestion": "补充重启恢复逻辑：check()时从publish_daily_count读count比对上限重挂定时器（同源now()），并给出对应测试用例。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "clarity",
      "finding": "D11要求所有key经buildKey并percent-encode两段，但D1平台级键为字面量platform:*（含星号），构建方式与编码规则未说明，易与'禁止字符串拼接'冲突。",
      "suggestion": "显式规定platform:*的生成路径（如buildKey(platform,null)返回字面星号段），并说明星号是否参与percent-encode。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "consistency",
      "finding": "未登记平台(任意)平台档标2min，与i1同类：其账号档默认20min，平台档2min同样被覆盖，表格中所标平台档实际无意义。",
      "suggestion": "未登记平台平台档改标为'可配置(当前失效)'或与账号档一致，避免误导读者。"
    }
  ],
  "dimensionScores": {
    "completeness": 7,
    "consistency": 6,
    "clarity": 7,
    "feasibility": 7,
    "security": 6
  }
}