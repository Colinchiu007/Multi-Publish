# review.md — 双模型审查结果

## 审查方式
- Claude（codeagent-wrapper --lite --backend claude，只读、仅审固定 diff C:/tmp/minimize-tray-review-diff.txt）✅ 完成（~200s，exit 0）
- Antigravity：wrapper 报 `agy command not found in PATH`；本机未安装 agy（C:\Users\邱领\.claude 递归查找无结果）→ **降级**：以 Claude 审查 + 主代理自审替代，记录于 learnings。未阻塞交付。

## Claude 结论
- Critical：无
- Major 3 / Minor 5

## 发现与处置
| 级别 | 发现 | 处置 |
|---|---|---|
| Major | 测试名含决策编号「方案A」 | ✅ 已改为纯行为描述 |
| Major | 头部注释断言 close→tray 契约在 window-close-policy.js（不在 diff 内）；最小化/关闭行为不对称需确认 | ✅ 核实：契约由 window-close-policy.test.js 6 例锁定（运行+托盘→隐藏 / 无任务→退出 / 无托盘→退出 / darwin→不隐藏）；不对称（最小化→常规、关闭→托盘）为方案A 用户确认语义，不改 |
| Major | `mainWindowRef` 疑似死代码（只写不读） | ✅ 已删（声明+赋值；全文件无读取点） |
| Minor | 头部「文件位置」路径过期 | ✅ 已改为 services/ 路径 |
| Minor | `expect(win.hide).not.toHaveBeenCalled()` 恒真、回归价值低 | ✅ 已删除，保留核心断言（不注册 minimize） |
| Minor | 新测试落在「IPC 安全合同」describe 下 | ✅ 已拆独立 describe「SystemTray 窗口行为」 |
| Minor | 双击测试未显式覆盖「hidden 且未最小化」场景 | ✅ 已加注释场景（isMinimized false → 仅 show） |
| Minor | `trayInstances[length-1]` 脆性 | 接受现状（init 后立即取引用，Tray mock 无失败路径） |

## 验证
- vitest：system-tray(30) + window(51) + window-close-policy(6) = **87/87 通过**（含 2 条新回归）
- eslint：0 error / 0 warning（--no-ignore）
- prettier：预先已红（HEAD 版本同样不通过，空行尾随空格为存量问题）→ 不扩大范围，单独记录
