# 合并 Check 白名单（QG Autonomous 报告型化）

## 触发覆盖合同（2026-08-24）

任何目标为 `main` 的 PR——包括仅改 `01-docs/**`、Markdown、`.ccg/**`、`openspec/**` 或 `.github/**` 的流程 PR——都必须产生 required context 对应的**真实** check run。GitHub 会把被 `paths-ignore` 跳过的 required workflow 视为缺失，不会将其当作通过或已跳过。

- `quality-gate.yml`、`electron-ci.yml`、`build.yml` 的 `pull_request` 不得配置 `paths-ignore`；`doc-gate.yml` 同样不得按路径跳过 main PR。
- 三个全量 workflow 的 `push main` 继续使用统一 `paths-ignore`，避免 docs-only 提交合并后重复跑完整 CI；build 的 `v*` tag 发布不受影响。
- 禁止用同名 no-op job、手动 dispatch 或外部 status API 伪造 required check；缺失的 job 必须由对应 workflow 在 PR 事件中真实执行。

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
