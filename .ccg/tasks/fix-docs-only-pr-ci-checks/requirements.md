# 修复纯文档 PR 必需检查阻塞

## 目标

确保目标为 `main` 的 PR 无论变更类型，均产生分支保护所要求的真实检查；纯文档/流程 PR 不再因 workflow `paths-ignore` 导致 required check 缺失而永久 `BLOCKED`。

## 已验证事实

- PR #1146（纯文档/.ccg）在 head `44d439c22` 上手动运行 `quality-gate` 后，8 个 QG check 已成功；仍缺失 `electron-tests`、`单元测试 + Lint`、`文档同步检查`、`build (windows-latest)`、`build (ubuntu-latest)`。
- 这 5 个 job 分别来自带有 `pull_request.paths-ignore` 且没有手动入口的 workflow；GitHub 对未触发的 required check 视为缺失而非 skipped。
- 当前 `ci-path-gating` 规格要求全量 workflow 的文档/流程 PR 不触发，与 main 的 required-context 策略冲突。

## 边界

- 不伪造或同名空状态检查。
- 不绕过/删除分支保护，不假设管理员权限。
- PR 触发改为全覆盖；合并后的 `push main` 可继续保留路径去重，避免文档提交在 main 重跑。
- 不修改产品运行时代码。

## 验收

1. 所有 main PR（含 docs-only）都会触发分支保护所要求的真实 workflow job。
2. 三个全量 workflow 的 `push main` 路径过滤仍保持一致、tag 发布不受影响。
3. workflow 契约测试覆盖新的 PR 触发规则及 doc-gate 规则。
4. 真实 docs-only PR 的 required checks 全部出现并通过，PR 不再因缺失 check 结构性 BLOCKED。
