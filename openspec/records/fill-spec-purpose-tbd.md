---
record: fill-spec-purpose-tbd
task: 把 43 份主规格的 Purpose 从归档残留的 TBD 填成由规格自身派生的行为契约
date: 2026-10-07
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由回填把本行改成 PASS 并整段删除本段三个 sync_* 字段
sync_backfill_owner: 下一个会话（或本会话的收尾轮）
---

## 本次执行记录：主规格 Purpose 去 TBD（fill-spec-purpose-tbd，2026-10-07）

> 分支：`fill-spec-purpose-tbd`；范围：仅 `openspec/specs/**/spec.md` 43 份 ⇒ **docs-only 快速通道**
> 判定（提交后实跑）：`node scripts/classify-docs-only.js --base=origin/main --head=5d57c48020cfb6399e7699e312285ef8db4e1ffd` ⇒ **`docs-only=true`（files=44）**；重型 job 由 CI 的 `changes` 短路，`QG Changes`/`文档同步检查` 仍照跑

### 为什么这件事值得单独一次提交，而不是"顺手补一下"

- main 上 151 份主规格里 **43 份**的 Purpose 仍是归档器留下的 `TBD - created by archiving change <name>. Update Purpose after archive.`。规格正文（Requirements/Scenario）是完整的，缺的是"这份规格管什么"的一句话入口——而那一行恰好是人或下一个会话读规格时最先看的。
- 归档三同步（`openspec archive` + CCG task 归档 + 质量节拍复盘）里**没有任何东西在检测 Purpose 是否还是 TBD**，所以这个缺口能长期存在而不被发现。本条只把存量填平；**检测机制仍缺**（见「遗留」）。

### 做法（刻意不写推测语义）

每句 Purpose 只从该文件自身取三样东西，因此可被同一文件**逐字复核**：

| 取什么 | 怎么取 | 为什么这样取 |
|--------|--------|--------------|
| 能力名 | 该文件 H1 去掉 ` Specification` | 两份嵌套规格 `desktop/rewrite-hard-constraints`、`ops-center/rewrite-hard-constraints` 若按目录末段取名会与自身标题不一致（实测第一版就错在这里，改正后重跑） |
| 判据范围 | 前 3 条 `### Requirement:` 标题原文 + 总条数（实测 min=1 max=15） | 规格的判据本来就只认 Requirement/Scenario；不复述内容，避免第二份口径 |
| 出处 | TBD 那行自带的 change 名 | 正则取 `[\w-]+` 并剥掉句点——初版把句末句号抄进了 `` `code` `` 里 |

生成脚本 `fill-spec-purpose.js` 可复跑（同一份内容两次跑结果一致），不是一次性手改；改前先把 43 条路径落到 `/d/tmp/purpose-files*.txt` 并按 `openspec/specs/**/spec.md` 校验范围，回退只针对精确列出的文件（遵守 R2，不用宽目录恢复）。

### 保留门禁逐条

| 门禁 | 状态 | 证据 |
|------|------|------|
| 变更类型与隔离 | PASS | 纯文档，就地编辑 + 经 PR 落地；分支 `fill-spec-purpose-tbd` 从 `origin/main` 起，未动共享根 |
| 规格有效性 | PASS | `npx openspec validate --all --strict` 改前/改后同为 `164 passed, 10 failed (174 items)`，**失败集合逐项相同**（`✗` 行 diff：`failing_identical=true`）；`✗ spec/` 两侧均为 **0**，10 项失败全是别的会话的 `change/*` ⇒ 路径不相交，不是比总数 |
| 残留计数 | PASS | `grep -rla '^TBD - created by archiving' openspec/specs` = **0** 命中（命令当场跑，不凭"应该有 0"） |
| 行尾/编码对账 | PASS | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 同为 `add=86 / del=43`（43 文件 × 每文件 −1 行 TBD + 2 行）⇒ 无行尾改写 |
| 品牌残留 | PASS | `node scripts/check-no-brand-residue.js` → `PASS（扫描 7176 个 tracked 文件，无品牌残留；已豁免第三方签名服务域名）`。本条记录正文提到参考产品时一律用中性称谓，未点名品牌 |
| 销账机制 | PASS | `node scripts/check-gate-record-debt.js` rc=0 → `OK: …清单无陈旧项、记录标题无重复、记录文件登记字段无残留`（本记录靠自身 frontmatter 的 `sync_*` 登记，`scripts/gate-record-debt-ledger.json` 内无需新增项）；`node scripts/check-pr-exec-record.js --base=origin/main --mode=enforce` → `本 PR 变更文件 44 个（A=1 M=43 D=0）｜ 新增记录 1 篇 … OK`；`bash scripts/check-docs-sync.sh --base=main --head=HEAD` → `✅ 仅文档/流程变更，无需额外同步` |
| CHANGELOG 收口 | N/A | 与运行时无关的规格文档卫生；沿既有惯例（`#3070`/`#3071` 这类 docs-only 记录型 PR 不另开台账条目），避免为一句文档改动再制造一次 CHANGELOG re-sync 撞车 |
| 远程同步 | PENDING | 本 PR 尚未合并，merge SHA 还不存在。合并后取证回填：`git log origin/main --grep='(#NNNN)$' --format=%H\|%cI`、`git ls-remote --heads origin fill-spec-purpose-tbd` 返回 0 行；改 PASS 的同一次提交内删除本段三个 `sync_*` 字段 |

### 遗留（不假装已闭合）

- **缺检测机制**：Purpose 为 TBD 不会被任何门禁拦下，下一次归档还会再漏。补法要么在 `openspec` 归档钩子里强制填 Purpose，要么加一条 `check-spec-purpose-tbd.js` 接进**不会被 docs-only 短路的 job**（`quality-gate.yml` 的 `changes`，且放在非 PR 早退之前）——按本仓既有铁律「进白名单的数据文件，它的校验必须先待在不会被短路的 job」，新判据自身也得有反证（把它改成 no-op 必须立刻变红）。这属新增门禁脚本 = 混合 PR，需要独立一轮 QM-6 与反证，**没有**塞进本条 docs-only PR 里顺手做。
- 本条只填 Purpose 一句，**没有**逐条复核 43 份规格的 Requirement 质量；规格正文若与实现漂移，需要各自的专项审计。
