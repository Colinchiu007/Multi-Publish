# 后端轴结论（commit 5930bc6fb）

## Q1
**结论：不会。** 两键格式天然不相交：
- `taskId` = `task_<n>_<ms>`（`phase4-events.js:107/201` 传入队列 id，`addRecord` 写入）
- `id` = `Date.now().toString(36) + 4rand`（`publish-history.js:86` 生成）

`task_` 前缀在 `id` 格式里永不出现，`id` 的 base36 时间戳也不可能以 `task_` 开头。匹配逻辑 `String(record.taskId || '') === targetId || String(record.id || '') === targetId` 加上 `updatedRecord === null` 单次命中守卫，单个 `targetId` 最多命中一条记录（要么走 taskId，要么走 id，绝不可能两键同时命中同一 targetId）。**文件:行号**：`publish-history.js:189、221`。

## Q2
**结论：不会。** 多租户边界由 `matchesOwner`（`publish-history.js:45-52`）单独把守，本次改动**完全未修改**该函数与调用顺序。匹配条件仍是 `matchesOwner(record, owner) && (taskId匹配 || id匹配)`（`publish-history.js:217-221`），先做归属校验再做键匹配。`ownerSubject` 为 `undefined` 时只匹配 legacy/无身份记录（第 46-50 行），传入具体用户时精确比对 `record.owner_subject === ownerSubject`（第 51 行）。单次命中语义（`updatedRecord === null`）也未变。**文件:行号**：`publish-history.js:45-52、217-221`。

## Q3
**N5 是唯一“声称抓住但实际仅靠 K6 单测抓住”的反证。** 具体关系：
- `if (!targetId) return`（`publish-history.js:200-201`）只保护**入参为空串**的情况，不保护 `record.taskId === undefined` 被 `String()` 成 `"undefined"` 后与入参 `"undefined"` 相等。
- 空值保护 `String(record.taskId || '')` 才是防「退化键 `"undefined"` 命中无 taskId 记录」的真正防线。
- 两者**不重复、不冗余**：前者守入参，后者守记录侧字段。N5 变异（去掉 `|| ''`）导致 `String(undefined) === "undefined"`，若无 K6（传 `"undefined"` 键且库里恰有一条无 taskId 记录），全绿。**文件:行号**：`publish-history.js:200-201、221`；K6 在 `publish-history.test.js:516-522`。

其余 N1-N4 均有对应锁（N1→X1/K1/K3/K4，N2→K2，N3→K4，N4→K4/K6）且实测变红，抓得住。

## Q4
**结论：没有别的生产调用方。** `git grep updateRecordAudit` 仅在两处生产代码出现：
1. `apps/desktop/electron/bootstrap/phase4-events.js:91` —— 传 `task.id`（队列任务 id，**即规范键**，本次未改动）
2. `packages/shared-utils/src/publish-history.js` —— **同名孪生实现但根本不导出 `updateRecordAudit`**（CHANGELOG.md:34 已确认 `module.exports` 里没有该函数），因此无第二处缺陷可修、也无被破坏风险。

其余均为测试文件（`phase4-events.test.js`、`publish-history.test.js`）。**文件:行号**：`phase4-events.js:91`、`shared-utils/src/publish-history.js`（无导出）。

## 🔴 CRITICAL
无

## 🟠 WARNING
无

## 🟢 INFO
- 修法精准：只改匹配键（taskId 优先、id 兜底），`matchesOwner`、单次命中、原子写入、白名单键、异常不冒泡等既有安全语义**全保留**。
- 契约锁完备：X1 跨模块锁注入真实现、独立回读 JSONL，配合 K1-K6 单元锁与 N1-N5 反证，覆盖了「合谋夹具」结构性漏测的全部面。
- 空值保护 `String(x || '')` 与入参早退 `if (!targetId)` 分工明确、互不冗余，K6 单测专门锁住退化键 `"undefined"` 这一唯一可观测面。