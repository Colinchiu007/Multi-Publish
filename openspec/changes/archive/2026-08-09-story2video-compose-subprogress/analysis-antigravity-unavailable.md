# antigravity 后端不可用记录

- 2026-08-09 双模型分析/审查阶段，antigravity 后端无法启动：`codeagent-wrapper --backend antigravity` 报 `agy command not found in PATH`。
- 核实：`where.exe agy` 无结果；`C:\Users\邱领\.claude\bin\` 仅有 claude.exe / codeagent-wrapper.exe / python 与批处理，未安装 Antigravity CLI。
- 按机制硬化规则「子代理降级」：antigravity 缺失非临时故障，降级为 Claude 模型 + 主代理独立分析（双视角）；审查阶段同样以 Claude reviewer 为主，主代理对 diff 逐行核验。
- 恢复条件：安装 Antigravity CLI（agy）并加入 PATH 后，后续任务恢复双模型。
