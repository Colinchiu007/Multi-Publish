# Review — commit-branch-guard（pre-commit 分支守卫）

## 审查方式
- 外部模型：Claude Code（codeagent-wrapper，深度实测：读全部源码/旧钩子/wrapper、跑测试套件 9/9、实测 fail-closed exit 1、真实 rebase 重放、conflicted cherry-pick、共享工作区影响面）。
- Antigravity 后端因地域不可用被拒（account not eligible in location），降级为主代理自审 + Claude 单模型。
- 主代理自审：钩子逻辑/编码/安装/文档逐项核对。

## Claude 发现与处置
| 级别 | 发现 | 处置 |
|------|------|------|
| Critical #1 | 单槽位声明可被并发会话覆盖 → 守卫 fail-open（事故可复现） | ✅ session-guard 拒绝覆盖另一活跃会话（session.json pid 存活）的声明，需 -Force 才可覆盖 |
| Warning #2 | 安装脚本从子目录运行 `--git-common-dir` 相对路径错位，装错位置并产生垃圾目录 | ✅ 改用 `--path-format=absolute --git-common-dir` + HEAD 合法性校验 |
| Warning #3 | 共享钩子一次生效，11 个 worktree + 主工作区立即硬性拦截（滚动协调风险） | ✅ 记录于 .quality-gates.md「滚动影响」行 + AGENTS.md 说明 |
| Warning #4 | fail-closed 边界测试缺口；scenario6 用假 rebase 目录 | ✅ 新增场景 7-11（空声明/detached 无 rebase/wrapper 缺失/非代码扩展名/真实 rebase），17/17 通过 |
| Info #8 | 钩子源 mode 100644 | ✅ git update-index --chmod=+x（100755） |
| Info #9 | 分支存在性校验用后缀通配误判 | ✅ 改用 for-each-ref 精确匹配 |
| Info #10 | --no-verify 可绕过；声明时效 | ✅ AGENTS.md 注明威慑性质、禁止使用 |
| Info #5/#6/#7/#11 | rebase 残留目录低风险、wrapper check no-op（既有）、pending 清理语义（既有）、正则扩展名口径（既有） | ⏸ 记录为既有行为/低风险，不扩scope |

## 最终状态
- 测试：scripts/hooks/pre-commit.test.sh 11 场景 17 断言全过
- 安装：install-git-hooks.ps1 从根目录/子目录均正确装到共享 .git/hooks（SHA-256 与源码一致）
- 自验证：钩子在本 worktree 提交 80c70416 时实际执行并通过（分支守卫 + 质量节拍）