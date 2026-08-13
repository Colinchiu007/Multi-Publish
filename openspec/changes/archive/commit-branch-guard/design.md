# 设计：pre-commit 分支守卫

## 契约

- 会话开始时运行 `scripts/session-guard.ps1 -Branch <期望分支>`，写入 `.agent_context/expected-branch`（+ `session.json` 元数据）。
- pre-commit 钩子（权威源：`scripts/hooks/pre-commit`；安装：`scripts/install-git-hooks.ps1` → 共享 `.git/hooks/`）对**所有**提交强制校验：
  - 有声明且当前分支 == 声明 → 通过；
  - 有声明但当前分支 ≠ 声明 → 拦截（输出修复指引）；
  - 无声明 → 拦截（输出声明命令）；
  - HEAD detached 且存在 `rebase-merge`/`rebase-apply` → 跳过断言（rebase 重放，避免误拦）。
- 保留既有质量节拍检查：代码文件变更时执行 `scripts/quality-rhythm-wrapper.js check`；`.quality-rhythm-pending` 存在则拦截。

## 文件

| 文件 | 作用 |
|------|------|
| `scripts/hooks/pre-commit` | 钩子源码（版本控制，权威） |
| `scripts/install-git-hooks.ps1` | 同步安装到共享 `.git/hooks/`（一次安装全 worktree 生效） |
| `scripts/session-guard.ps1` | 会话启动时声明期望分支 |
| `scripts/hooks/pre-commit.test.sh` | 集成测试（6 场景） |
| `AGENTS.md` | 会话启动步骤补充 session-guard |
| `.quality-gates.md` | 门禁执行记录 |

## 安全与兼容

- 分支不匹配必须 fail closed（宁可拒绝，不可错落），错误信息给出两条修复路径；
- rebase（`pull --rebase` / `rebase`）期间 HEAD detached → 跳过断言，避免误拦正常流程；
- 钩子安装在共享 `.git/hooks/`，所有 worktree 立即生效；更新钩子源码后需重跑安装脚本。