# 合并 Check 白名单（QG Autonomous 报告型化）

> 2026-08-20 起，`QG Autonomous`（全量 PRD 需求覆盖审计）已从「合并硬闸门」降级为
> **报告型门禁**：`NEED_HUMAN`（对任意未覆盖全部历史 PRD 项的 PR 都可能出现）不再
> 阻塞合并，审计报告（artifact `quality-gate-autonomous-reports`）继续上传供人工抽查。

## 为什么不能把 QG Autonomous 当作强制 check

- 它把 `01-docs/PRD.md` 的 107 个历史需求项全部要求逐项匹配实现，`passed=0/failed=107`
  对修复类/文档类 PR 必然出现（即使只改了 1 行代码）。
- 需求覆盖是全量、跨期累加的，与单个 bug 修复 PR 是否合格无关。
- 因此合并判断应只依赖**本次改动实际关联的检查**，而不是全量历史覆盖。

## 建议的合并 required 白名单

在分支保护/组织 ruleset 的 required status checks 中勾选以下真实红绿灯（按仓库实际 workflow 名核对）：

- `Gate Result`
- `单元测试 + Lint`
- `文档同步检查`
- `QG Unit Tests`
- `QG Static`
- `QG Visual`
- `QG Browser E2E`
- `QG Coverage`
- `QG Desktop Shards (1/2)`
- `QG Desktop Shards (2/2)`
- `build (ubuntu-latest)`
- `build (windows-latest)`
- `electron-tests`
- `gui-test`
- `visual-test`

**不要将以下报告型 job 放入强制通过列表**（失败/NEED_HUMAN 不阻塞合并）：
- `QG Autonomous`
- `QG Autonomous` artifacts 内的 `agent-judge-*`

## 配置位置

1. GitHub → Settings → Branches → 编辑 `main` 保护规则 → 勾选
   **Require status checks to pass before merging**，并按上表勾选。
2. 若团队使用 Organization Rulesets，在目标规则的 required_status_checks 中列出
   同一白名单，并保持 `QG Autonomous` 不在其中。
3. 配置后仍可通过 PR 页面查看 `QG Autonomous` 报告，作为覆盖度的人工抽查依据。

## 验证方式

- 新建一个只改 1 行/只有文档的 PR：检查列表里 `QG Autonomous` 可为
  `PROMPT_REVIEW_REQUIRED`（成功）而不影响 `Merge` 按钮。
- 若仍出现 BLOCKED，优先检查 required 白名单是否误含 `QG Autonomous` 或存在
  其它失败 check（如 ROS 覆盖率、冲突）。
