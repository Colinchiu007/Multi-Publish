---
record: spec-purpose-tbd-gate
task: 主规格 Purpose 去 TBD 的检测机制（Gate 12d）——判据 + 接线 + 反证 + 位置结构锁
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填把本行改成 PASS 并整段删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（或本会话的收尾轮）
---

## 本次执行记录：Gate 12d 主规格 Purpose 检测机制（spec-purpose-tbd-gate，2026-10-07）

> 分支：`spec-purpose-tbd-gate`；worktree：`D:/Data/projects/mp-worktrees/mp-spec-purpose-tbd-gate`（由 `scripts/start-mp-task.ps1` 创建，按产物复核：`worktree list` 含该路径、`rev-parse --abbrev-ref HEAD`=`spec-purpose-tbd-gate`、head 落在当时 `origin/main`、`verify-worktree-deps.js` OK 11 项）
> 范围：🔧 `scripts/` 判据 + 🔌 `.github/workflows/quality-gate.yml` 接线 + 🗄️ `CHANGELOG.md` + 📝 OpenSpec change ⇒ **混合 PR，不走 docs-only 快速通道**
> OpenSpec：`openspec/changes/spec-purpose-tbd-gate/`（`openspec validate --strict` 通过），capability `openspec-integration` 新增 1 条 Requirement

### 动因：这是上一轮自己写下的遗留，不是新需求

PR #3084 把 151 份主规格里 43 份的 `TBD - created by archiving change …` 填平，并在其执行记录里留了一行
「缺的是检测机制，不是这一次的填写」。本轮兑现它。清点证据（当场跑）：
`git grep -l Purpose -- scripts .github` ⇒ **0 命中** —— 门禁面上这条判据从来不存在，所以"填平"之后必然重新积累。

### 门禁判据（最终实现的四条）

1. **全量**扫描 `openspec/specs/**/spec.md`（不按改动集）；违规 ⇒ rc=1 并逐条点名文件 + 原因码
   `TBD` / `MISSING_SECTION` / `EMPTY` / `UNREADABLE`。
2. 占位词按**语义特征**且只看正文开头（`^TBD\b`、`^TODO\b`、`^待补充`…）—— 不写"文件里出现 TBD 即红"，
   那会把"Purpose 里正在说 TBD 这件事"判成缺陷。
3. **两条空集出口各自抛错** + 规模下界（`DEFAULT_MIN_SPECS=50`，实测当前 151 份）。
4. 域排除：`openspec/changes/**/specs/…`（提案增量，TBD 属正常生命周期）与 `archive/`。

### 反证（7 条全部 PASS，收尾断言逐字节还原）

驱动：从 pristine 还原 → 基线必须 `14/14 → 15/15` 全绿 → 注入变异（断言锚点命中恰好 1 次且字节真的变了）→
指定用例必须变红 → 逐字节还原并与备份 `===`。每条记录 `restored_byte_identical=true`；全部跑完 `git status --porcelain`
只剩本次四个真实改动文件（无变异残留）。

| 变异 | 拆掉的是什么 | 结果 |
|------|-------------|------|
| M1 `evaluatePurpose` 恒判合规 | 整条判据（no-op） | 红 4 条（含 TBD 档）⇒ PASS |
| M2 正文提取退回带 `m` 的多行正则 | 逐行扫描器 | 红 2 条（含"真实仓库不得判 EMPTY"）⇒ PASS |
| M3 "扫描域为空"改 `return ok:true` | 第二条空集出口 | **首跑 NOT_RED** ⇒ 见下 |
| M4 `DEFAULT_MIN_SPECS` 改 0 | 规模下界 | 红 1 条 ⇒ PASS |
| M5 把整块 step 复制到 `classify` 之前 | 接线位置前提 | 红 1 条 ⇒ PASS |
| M6 删 `.gitignore` 的 `!scripts/check-spec-purpose.js` | 脚本入库前提 | 红 1 条 ⇒ PASS |
| M7 从 step 里摘掉 `node --test` 点名 | "测试被 CI 跑过" | **首跑 ANCHOR_NOT_FOUND** ⇒ 见下 |

两条驱动自身的坑（都是探针问题，不是代码安全）：

- **M3 首跑 `NOT_RED`**：当时只有"目录不存在"这一条空集出口有测试，于是把 `check()` 里
  `扫描域为空 ⇒ 抛` 改成 `return ok:true` 的变异照样全绿。补一条"目录存在但零 spec.md"的锁后，
  同一变异立刻变红。**口径：一条判据有多个退化出口时，每个出口都要有自己的锁**，否则它就是装饰。
- **M7 首跑 `ANCHOR_NOT_FOUND`**：needle 手拼成 `'…test.js\n'`，而 workflow 文件是 CRLF ⇒ 命中 0 次。
  改为**从文件运行时取行**（`split('\n')` 后按 trim 比对）后成立。与 M3 那条同一教训：锚点必须抄自实现/文件，不能凭记忆。

### 本轮抓住的一个自身缺陷（若上线即成噪声）

第一版判据用带 `m` 的多行正则取正文，`$` 在多行模式下匹配**空行行尾**，而 `## Purpose` 与正文之间按惯例就有空行
⇒ **15 份已写好 Purpose 的规格被判 EMPTY**（`openspec/specs/creator-monitor/spec.md`、`i18n-content-sync`、
`session-worktree-isolation`、8 份 `story2video-*` 等）。发现路径是"先在真实仓库跑一次判据"而不是跑测试 ——
测试夹具全是"标题行后紧跟内容"的形状，对这一档**结构性免疫**。
修法是实现换成逐行扫描（代码围栏内的 `#` 不当标题），并补一条**真实文件形状**的回归锁。
后果评估：若按第一版上线，Gate 12d 第一天就红 15 条噪声，被教给下一个人的动作是"绕开门禁"，比没有门禁更糟。

### 门禁表

| 门禁 | 状态 | 证据（当场实跑） |
|------|------|------------------|
| 变更类型与隔离 | PASS | `start-mp-task.ps1 -TaskName spec-purpose-tbd-gate` 按产物复核（见开头引文）；共享根保持 main，仅 2 个别的会话的 untracked 文件未动 |
| TDD 红→绿 | PASS | RED：`Cannot find module './check-spec-purpose.js'` / `MODULE_NOT_FOUND` / `tests 1 pass 0 fail 1`；GREEN：`15 tests / 15 pass / 0 fail` |
| 判据在真实仓库 | PASS | `node scripts/check-spec-purpose.js` → `扫描 151 份主规格，违规 0` + `OK` |
| 测试接线 | PASS | 新测试与判据同 step 点名在 `changes` job 的 Gate 12d；`check-unwired-tests.js` 检查域 65→**66** 且报「全部已接线」 |
| CI 结构 | PASS | 三条结构锁（changes job 内 / classify 之后 / 不得同时进 static-gates）；`check-step-failfast.js` 6 个多测试步骤仍全 fail-fast |
| OpenSpec | PASS | `openspec validate spec-purpose-tbd-gate --strict` → `Change 'spec-purpose-tbd-gate' is valid` |
| 行尾对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 同口径（详见提交）|
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`；改动是 CI 门禁 + 文档 |
| QM-4 视觉 | N/A | 未触任何 `.vue` / 样式 / 布局 |
| QM-6 双模型评审 | PENDING | 混合 PR 且新增门禁 ⇒ 定档 `dual`；发现逐条处置后回填 |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`、`git ls-remote --heads origin spec-purpose-tbd-gate` 返回 0 行；改 PASS 的同一次提交内删除本段三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- 判据只管 **Purpose 段的有无/占位**，不管内容质量：一句"定义 X 的行为契约"式 Purpose 也判过。
  质量审计需要另一条判据（例如要求 Purpose 至少引用一条 Requirement 标题），本轮不做。
- `openspec archive` 自身仍会先写 TBD 再靠门禁拦 —— 更彻底的做法是在归档命令里强制补写，
  但那属上游 openspec CLI 行为，本仓不 fork 它；当前顺序（先归档、CI 立刻红）已能把账留在台面上。
- 归档本 change 后，它会给自己新增的主规格写 TBD —— 这正是本门禁的活体测试场景，
  归档时必须确认产出的 `openspec/specs/openspec-integration/spec.md` Purpose 已填（tasks 5.4 已记）。
