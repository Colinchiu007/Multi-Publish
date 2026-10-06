{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "resolve_backend 的 PATH prepend/export 全发生在 `$(...)` 命令替换的子 shell 内，一退出即丢。ABS 分支只是打印了『已补入 PATH』，主流程第5步 wrapper 仍按原 PATH 裸名 spawn，claude 依旧找不到→静默降级在原缺陷目标场景下原样复现。测试①只断言文案与 rc，从未验证恢复后裸名真能解析，属假绿灯。",
      "suggestion": "命中目录写入全局变量，由 report_backends 在当前 shell 完成 PATH prepend+export；测试补『恢复后 command -v 命中』断言。"
    },
    {
      "id": "i2",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "健康判据与 spawn 判据错配：msys 的 `command -v` 会把 PATH 里的 npm shim（无扩展名 claude / claude.cmd）判为『已可解析』，而 wrapper 走 CreateProcess 起不了 shim→PATH 分支误报『裸名已可解析（无需干预）』，静默降级仍无告警；CMD 检查只在候选目录分支生效，PATH 命中路径从未查文件类型。",
      "suggestion": "PATH 分支对解析结果做 .cmd/.bat/shim 判定，命中则走 CMD 文案并置 rc=2。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "MISS 分支修法文案写死 `npm i -g @anthropic-ai/claude-code`，对 opencode 同样输出——opencode 缺失时让用户装 claude-code，装完 opencode 仍缺。文档真实取证第二段正是此形态，修法本身误导。",
      "suggestion": "按 $_rb_b 给包名：claude→@anthropic-ai/claude-code，opencode→opencode-ai。"
    },
    {
      "id": "i4",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "⑦『行为级』锁实际失效：毒化 dirname 桩无执行位，`command -v dirname` 会跳过它落回真 dirname，毒化从未生效；测试实际只靠 ROOT 行字符串正则兜底，未来在别处（如 resolve_backend）引入 dirname 拦不住，声称的行为级回归保护是空的。",
      "suggestion": "毒桩 chmod +x 并断言 command -v 命中毒桩；行为断言与字符串锁分开标注。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "多处重复/陈旧注释残留：step4 出现两行内容重复的『保持非致命』注释；测试④上方残留整段旧版④注释（讲 `for d in $(candidate_dirs)`），与新④注释并存——多轮修补痕迹未清理，后续维护易读错版本。",
      "suggestion": "删除重复与陈旧注释块，每处只保留最终语义的一句话。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "候选目录路径形态不统一：仅 npm prefix 经 posix_dir 归一，`$APPDATA/npm` 与 `CCG_BACKEND_BIN_DIRS` 以 Windows 反斜杠/盘符形态直接进 PATH 与 ABS 文案；非 msys 的 sh（如 WSL）下含空格反斜杠路径解析不了，且 POSIX 冒号目录与 Windows 盘符冒号在 CCG_BACKEND_BIN_DIRS 里无法区分。",
      "suggestion": "统一把所有候选经 posix_dir 归一；CCG_BACKEND_BIN_DIRS 文档化仅收分号分隔的 POSIX 路径。"
    }
  ],
  "dimensionScores": {
    "correctness": 3,
    "security": 9,
    "performance": 9,
    "maintainability": 6
  }
}