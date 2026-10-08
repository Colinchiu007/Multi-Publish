{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "RISK_TEXT_PATTERN 仍含裸「验证码」「风控」，违背自定“只收强指认短语”原则；可见良性弹窗（如账号绑定“输入验证码”）命中即判风控中止存草稿，正是 4c-b 要防的误判类。",
      "suggestion": "删裸「验证码」「风控」，只留 安全验证/请完成验证/操作频繁/账号存在风险/risk control。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "4h 实测「小红书不支持纯文字笔记」，但 if media_paths: 分支与 test_text_only_draft_skips_upload_wait 把纯文本草稿当合法路径静默放行，可能产出平台拒收草稿，同 4e 的缺陷交付类。",
      "suggestion": "无媒体时显式按平台规则判定（fail 或可配置），并加用例证明 DOM 轨纯文本草稿能真实进草稿箱。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "maintainability",
      "finding": "test_editor_ready_timeout_leaves_a_reason_in_logs 断言日志含「编辑器」，钉死显示 label 字面量；改名即假红，正是 CCG i4 刚移除的格式化耦合类。",
      "suggestion": "改断言稳定键（title_input）或结构化日志字段，不钉显示文案。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "overlay 轨靠 visible_texts 列表真值成立；无文案图形验证层靠 [\"\"] 恒真碰巧命中，日后过滤空串即静默漏判，且武装后的选择器绕过词表对任意可见元素阻断。",
      "suggestion": "overlay 轨改显式 count_visible>0 判定；武装选择器的影响在文档标注。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "CI 门禁硬编码 5 个测试文件，新增发布器测试文件静默不在门禁；无结构校验绑定测试与发布器模块。",
      "suggestion": "加守卫断言：发布器测试文件清单与 CI 步骤所列一致（新增必须显式登记）。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "test_risk_wording_in_second_visible_host_is_caught 实为同一宿主内第 2 个元素，多宿主轮询（host0 无命中 host1 命中）无用例，宿主循环被删尾不红。",
      "suggestion": "补 host[0] 良性、host[1] 命中的用例。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "performance",
      "finding": "每次存草稿 risk_present 最多扫 5 宿主×8 元素，各含 is_visible+inner_text 两次 DOM 往返，慢网下逐次叠加延迟。",
      "suggestion": "无命中时全扫不可避免，可将宿主数/limit 预算显式化或按命中率排序宿主。"
    },
    {
      "id": "i8",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "守卫只断言 NAVIGATE_* 常量被引用，UPLOAD_FALLBACK_POLL_INTERVAL_S 未纳入；上传间隔若在发布器内硬编码，常量腐化不红。",
      "suggestion": "把上传轮询间隔常量并入“发布器引用”断言。"
    }
  ],
  "dimensionScores": {
    "correctness": 6,
    "security": 8,
    "performance": 7,
    "maintainability": 7
  }
}