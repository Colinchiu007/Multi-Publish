---
exempt_for: backfill-2939-record
reason: 本 PR = 他人记录（.quality-gates.md 内 ops-fakeip-attribution【混合 PR】）的远程同步回填 + scripts/gate-record-debt-ledger.json 同键销账，两文件均为台账载体；但出路④要求至少含一篇 openspec/records/*.md 的 M，而 #2939 诞生于记录载体约定进 .quality-gates.md 的时期、没有自己的 records 文件可修订，出路①等于给一次 meta 回填再造 PENDING 欠账（三阶递归，与 backfill-2928-record 先例同因），故按出路③显式豁免；diff 无任何运行时行为变更。
---

## 豁免说明

- 本文件代表"这个 PR 不产执行记录"的一次显式承认，不是静默绕过。
- 合并后本文件可按 prune-consumed-exempt-records.md 流程清理。
