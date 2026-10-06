{
  "schemaVersion": 1,
  "issues": [
    {
      "id": "i1",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": ".cmd/.bat 判定只堵带扩展名 shim；npm 全局布局是无扩展名脚本+claude.cmd，msys command -v 可命中但 CreateProcess 起不了。候选目录循环先试 $_rb_tool 再试 .exe，真 .exe 被 shim 抢先，ABS/PATH 与自检全放行——即 i2 点名过的『无扩展名 claude』未闭环，假绿灯复现。",
      "suggestion": "命中文件先判 .exe/.com 优先；对无扩展名文件判定其是否真可 spawn（或试跑自检时用 exec 真实解析），并把 PATH/ABS 判定落到同一判据。"
    },
    {
      "id": "i2",
      "severity": "Critical",
      "dimension": "correctness",
      "finding": "自检 else 分支只打印『仍不可解析』而不置 _CD_RC=2：ABS 恢复的文件无执行位时（Windows 外 fs 默认 0644）command -v 按 X_OK 解析不到，脚本却仍『体检通过』exit 0——『矛盾一律判不通过』的承诺只有注释没有行为；⑥c 只测零后端，不覆盖 ABS 命中但自检失败的分支。",
      "suggestion": "else 分支置 _CD_RC=2；ABS 恢复时校验/chmod 文件可执行；⑥ 补『ABS 命中但 command -v 失败→rc≠0』用例。"
    },
    {
      "id": "i3",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "主流程（非 --check-deps）没有任何裸名/可执行再验证：ABS 仅凭 [ -f ] 即判可用，随后 exec node→wrapper 仍按裸名 spawn，失败信息留在引擎深处——non-diagnostic 路径回到旧缺陷形态，修复验证只在诊断入口做。",
      "suggestion": "把裸名自检（含文件类型与可执行判定）并入 report_backends 末尾，主流程与 --check-deps 共用同一判定。"
    },
    {
      "id": "i4",
      "severity": "Warning",
      "dimension": "correctness",
      "finding": "makeFakeHome 桩从未 chmod +x：bash command -v 按 X_OK 搜索文件，Linux CI 下解析不到假后端→⑥b 的 doesNotMatch(/仍不可解析/) 必红；『10/10 绿』只在 Windows msys 验证，测试语义平台漂移却被接进 ubuntu 的 Gate。",
      "suggestion": "造桩统一 chmod 0o755（Windows 幂等）；并在 CI 上以一路 msys bash 实跑验证。"
    },
    {
      "id": "i5",
      "severity": "Info",
      "dimension": "correctness",
      "finding": "posix_dir 依赖外部 cut/tr/sed/cygpath：诊断入口『PATH 全坏也能问』只在工具目录尚存的场景成立，基座工具丢失时候选归一静默输出空→MISS（注释已承认过度声称，但实现未收紧）。",
      "suggestion": "用纯参数展开/大小写展开实现盘符归一，去掉 cut/tr/sed；做不到则在 --help 写明最低工具假设。"
    },
    {
      "id": "i6",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "自扮演裁决（confidenceWeight 0.6）承载 i1 Critical，requiresExternalReview 为空，与 highRiskNote『高危域争议不允许自扮演豁免』并存——Critical 结论以 0.6 权重出库且无复核记录，治理口径自相矛盾。",
      "suggestion": "Critical 项不走自扮演豁免，或显式登记外部复核排期与原因后再合入。"
    },
    {
      "id": "i7",
      "severity": "Info",
      "dimension": "maintainability",
      "finding": "顶层 diff 内嵌两代已替换旧版提案与坏版脚本全文（.adversarial/*/proposal-v1.md），『已修复』叙述与坏代码同库并存，日后检索 grep 易读到已被推翻的版本。",
      "suggestion": "归档只留 adjudication+critique 结论，proposal 存指针/摘要；或给超期提案标注 superseded 头。"
    }
  ],
  "dimensionScores": {
    "correctness": 4,
    "security": 9,
    "performance": 9,
    "maintainability": 6
  }
}