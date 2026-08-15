## MODIFIED Requirements

### Requirement: 分层分支策略
分支策略 SHALL 分层执行：运行时代码变更（apps/、packages/ 及关联配置/CI）MUST 在 `D:/Data/projects/mp-worktrees/mp-<task-name>` 下的独立 linked worktree 与 `codex/<task-name>` 分支进行，经 PR 审查与 CI 后合并回 main；共享主工作区 MUST 保持在 main，禁止运行时代码任务在共享主工作区切换 feature 分支或修改代码。纯流程/规格/文档变更（openspec/、.ccg/、docs/、scripts/ 工具脚本、CHANGELOG、.quality-gates.md）MAY 在 main 直接小步提交，但 MUST 保持可回滚且不得与并发会话的脏文件冲突。判定以「是否影响运行行为」为准，禁止以文档提交夹带运行时代码。

#### Scenario: 运行时代码必须分支
- **WHEN** 变更涉及产品代码、测试、构建或部署配置
- **THEN** 必须在 D 盘独立 linked worktree 的 codex/ 分支上开发并经 PR 合并回 main，不得在共享主工作区开发或提交

#### Scenario: 纯流程文档允许 main
- **WHEN** 变更仅涉及 openspec/、.ccg/、docs/、工具脚本等纯流程/文档
- **THEN** 允许在共享主工作区 main 直接小步提交，但须 stage 命名路径、不与并发脏文件冲突且可回滚

#### Scenario: 文档夹带代码
- **WHEN** 一次提交同时包含流程文档与运行时代码
- **THEN** 该提交按运行时代码处理，必须拆分并走独立 worktree + 分支 + PR

#### Scenario: 共享主工作区误切 feature 分支
- **WHEN** 任一会话使共享主工作区成功切换到非 main 分支
- **THEN** Git 守卫必须立即检测并恢复 main；恢复失败时必须进入 fail-closed 事故状态并给出精确恢复步骤
