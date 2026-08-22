# 质量节拍审查报告

## 变更

- `word_split.good_lead` 三端同步增加 `成`。
- `wordSafeSplit` / `_word_safe_split` 先选择后块引导字切点，再回退到普通尾部收束切点。
- 用户样例向量和 Electron 精确断言锁定 6 块语义输出。

## 审查结论

- Critical: 0
- Warning: 0
- Info: 新规则是启发式，可能改变少量无标点长句的候选切点；已由 TS/JS parity、共享向量和 sidecar 定向测试覆盖。
- 外部审查：Claude wrapper 退出码 1；opencode wrapper 未返回可用报告，按仓库降级流程执行本地逐项审查。

## 本地检查

- TS story2video-engine：154 passed。
- Electron 字幕向量、合同、parity：131 passed。
- sidecar Python 字幕向量与专项测试：152 passed。
- 用户新文案：Electron 与 Python 均输出 38 块，拼接字符数均为 348。
