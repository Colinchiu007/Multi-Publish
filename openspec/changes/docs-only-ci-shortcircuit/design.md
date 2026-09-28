## Context

PR #2151 死锁确立了红线：`pull_request` 触发级 `paths-ignore` 会让 required check 永不产生（ruleset `can_bypass=never`，`--admin` 也绕不过），纯文档 PR 永久 BLOCKED；`workflow-contract.test.js` 两条硬锁全量扫描禁止任何 workflow 在 PR 上配 paths-ignore。同时 push 侧三个全量 workflow 已用统一 `paths-ignore`（CI_IGNORED_PATHS，契约测试内嵌数组为真源），gate-result 已有 `$allowed = @('success','skipped')` 的 skipped 放行口径，build.yml 已有 merge-base diff + 步骤级条件跳过打包的先例（`package-relevant`）。本设计在这些既有事实上叠加 PR 侧的 job 级短路。

## Goals / Non-Goals

**Goals:**

- 纯文档 PR 的 CI 在数分钟内全绿（changes job 真实执行 + 重型 job skipped + gate-result 放行），required check context 全部出现。
- docs-only 判定单一真源：CI 与本地质量节拍共用同一脚本，白名单与 push paths-ignore 同一份清单。
- 防再犯：契约测试锁住短路接线（摘 changes job / 摘任一重型 job 条件即红）。

**Non-Goals:**

- 不改 push 侧 paths-ignore 行为；不动 debt-guard / dep-audit（required check 且本身 <1 分钟）；不动 doc-gate 的触发语义（仅换 runner 类型）。
- 不为质量节拍 docs-only 通道新建独立 spec 能力（流程文档属 AGENTS.md 层，判定行为已由 ci-path-gating delta 覆盖）。
- 不做 nx affected / 测试分片等更深的 CI 优化（已有独立机制）。

## Decisions

**D1：job 级条件跳过，而非触发级过滤。**
GitHub 语义：触发级过滤 → workflow 不运行 → required check 永久 pending（#2151 死锁）；job 级 `if:` 跳过 → job 显示 skipped → required check 视为满足。gate-result 现有 skipped 放行口径即为该语义的既有依赖。备选（被否决）：pull_request 加 paths-ignore + 占位 workflow——需要为每个 required context 名逐个建占位 job，required 清单只存在 GitHub ruleset 不可读，维护成本高且脆弱。

**D2：changes job 用自写 merge-base diff 脚本，不引入 dorny/paths-filter。**
build.yml 的 `Detect packaging-relevant changes` 已验证 merge-base 写法（PR base 落后 main 时用 merge-base 防漏检）。复用同模式 + 复用 classify-docs-only.js 的判定函数，零新依赖（本仓原则：能不用第三方就不用）。changes job 跑 ubuntu-latest（判定只依赖 git + node，无需 Windows）。

**D3：白名单真源从契约测试内嵌数组迁到 `scripts/classify-docs-only.js` 导出。**
契约测试 import 脚本常量做断言（真源唯一）；CI changes job 调 CLI；本地质量节拍调同一 CLI。备选（被否决）：保持契约测试为真源、脚本 import 测试文件——测试文件不是可依赖模块，且 CI 调用方会反向依赖测试，方向颠倒。

**D4：判定 fail-closed。**
空清单 / diff 失败 / 脚本异常一律判 false（全量执行）。理由：漏跑测试的代价 >> 多跑一次全量的代价；与「无定论不得改写登录态」同族的单向证据纪律。

**D5：electron-ci 与 build 的 job 级短路用同一 changes job 模式。**
electron-ci 的 `electron-tests` job 与 build 的 `build` job 各自加 needs + if。注意 build 的 job 名是 required check context（`build`），skipped 语义同 D1；build job 内部既有 `package-relevant` 检测保留不动（它管的是打包步骤，与 docs-only 短路正交）。

**D6：doc-gate 的 doc-sync job 换 ubuntu-latest。**
该 job 只跑 bash 脚本 + gh CLI（check-docs-sync.test.sh / check-docs-sync.sh / draft-changelog.sh），无 Windows 依赖；换 runner 提速并释放 Windows 并发额度。`ci-tests` no-op job（保留 required context 名）不动。

## Risks / Trade-offs

- [GitHub 对 skipped required check 的放行语义未经本仓实证] → 合并前用一个真实纯文档 PR 验证 mergeStateStatus 不 BLOCK；回退 = 摘掉 job 级 `if:`（一行/处），行为立即回到现状。
- [混合 PR 被误判 docs-only 漏跑全量] → 判定要求全部文件命中白名单；空清单 fail-closed；单测覆盖正/负/边界；变异反证两条（判定恒 false 不改变现状行为；白名单混入代码路径后混合 PR 仍全量）；契约锁锁住接线。
- [白名单与 push paths-ignore 漂移] → 契约测试从脚本 import 真源做 deepEqual，漂移即红。
- [changes job 自身故障导致全链 skipped 假绿] → gate-result 的 `$allowed` 只放行 success/skipped；changes job 失败时其 result 为 failure，下游 needs 链上 job 变 skipped 但 gate-result 判 changes 的 result——设计上把 changes 纳入 gate-result 的 needs 与判定表，failure 即拦。
- [质量节拍 docs-only 通道被滥用为绕过门禁] → 通道仅豁免与运行时无关的门禁（QM-1/2/4/TDD/QM-6），保留行尾对账、品牌残留、文档同步、远程同步；判定证据（文件清单）必须写入 `.quality-gates.md` 记录。

## Migration Plan

1. 先合入脚本 + 测试 + 契约锁（无 CI 行为变化，纯新增）。
2. 同 PR 内接入 workflow 短路（一次 PR 落地，避免中间态两份真源）。
3. 合并后第一个纯文档 PR 即为 skipped 语义的实证（观察 gate-result 与 ruleset）。
4. 回退：摘 job 级 `if:`（或 revert 整个 PR），无数据迁移、无状态残留。
