分析完成。已写入 `.ccg/analysis/out-claude.md`，以下为完整报告。

## 分析：图片轮播参数治理 R2——移除 splitSpeechRate/concurrency/autoAdvance 前端死字段

### 验证基线
- 工作树未提交改动：`CreateView.vue`（8+/5-）、`CreateView.test.js`、`story2video-ue-contract.test.js`、`PRD.md`、`learnings.md`、`CHANGELOG.md` + `openspec/changes/story2video-options-consolidation-r2/`
- 受影响三套件 `vitest run` 实测 **157/157 通过**（CreateView 101 / UE 契约 4 / text-config 52（157 合计））

---

### 方案评价

**Critical（0）** — 无阻断缺陷。三字段无任何残留前端读取点，提交/params 自洽，行为等价。

**Warning（2）**
1. **`tasks.md` 复选框未勾选** — 实现与测试已完成，但 `openspec/changes/story2video-options-consolidation-r2/tasks.md` 第 5/10/15/20-22 行仍为 `- [ ]`。归档前需勾选。
2. **`cli.js` / `publish-api` 是行尾噪音** — 两文件标记 `M` 但 `git diff --numstat --ignore-space-at-eol` 为空，仅 LF→CRLF。应从 R2 提交排除（`git checkout --` 还原），否则污染 PR。

**Info（3）**
1. **concurrency 越界兜底确认保留** — `story2video-text-config.js:406` `numberValue(…, 3, 'concurrency', 1, 8, true)` 未动；前端移除后任何外部调用方越界仍被拒绝。design.md:33 结论属实。
2. **normalizer 契约测试成为回归护栏** — `text-config.test.js:379-392`（`speechRate 单一来源`，显式 1.2 被 voice.speed=1.5 覆盖）保留，恰好持续验证 R2 依赖的派生死提交行为。
3. **`.ccg/analysis/out-claude.md`** — 分析产物已写入。

---

### 遗漏消费点 / 测试清单（全仓核验）

| 字段 | 前端读取点 | 残留提交 | 测试/契约消费点 | 处理 |
|------|-----------|---------|----------------|------|
| `splitSpeechRate` | 无（仅 :1003 注释） | :1656 已删 `speechRate` | CreateView.test.js:643 负断言✓；UE 契约 :33 负断言✓；text-config.js:355 硬覆盖 + :379-392 契约测试（保留） | 等价 |
| `concurrency` | 无（仅 :997 注释） | :1696 已删 `concurrency` | CreateView.test.js:644 负断言✓；UE 契约 :36 `v-model` 负断言（既有）+ :34 `concurrency:` 负断言✓；text-config.js:76/406/444/487/560 契约（保留）；stages.js:346/523 后端兜底（保留） | 等价 |
| `autoAdvance` | 无（s2vConfig 字段从不被读；仅 :1015 注释） | **params 字面量 :1716 保留**（:1457/:1491 其它流水线亦保留） | CreateView.test.js:645 负断言 + `params.autoAdvance===true`✓；text-config.js:534 透传（保留）；pipeline 测试 autoAdvance 均为引擎级参数（不受影响） | 等价 |

**恢复快照**：`_applyS2VSnapshot`（:1539-1555）按 `Object.keys(target)` 白名单应用，旧快照多余键自动忽略（R1 已验证机制）；`buildS2VLastOptions`（:1510）持久化 `s2vConfig` 整体，新快照天然不含三字段；全仓无含 `splitSpeechRate` 的 JSON fixture。**无需改代码。**

**无遗漏**：`apps/desktop/src` 全量 grep 三字段仅命中负断言与注释；electron 测试目录 `concurrency` 零命中；`splitSpeechRate` 全仓仅注释/负断言/归档文档。

---

### 行为等价性确认

1. **split.speechRate**：移除前提交 `1` → normalizer :355 覆盖为 `voice.speed`；移除后不提交 → 派生 `voice.speed`（前端仍提交 `voice.speed=config.voiceSpeed`）。归一化输出逐字节相同。
2. **concurrency**：移除前恒提交 `3`；移除后 `firstDefined(undefined)` → 契约默认 `3`，**范围 1-8 校验仍在**。
3. **autoAdvance**：s2vConfig 字段本无读取、已被 params 字面量替代；params `autoAdvance: true` 未动 → 引擎自动推进行为不变。
4. **快照兼容**：旧快照已移除键白名单忽略，与 R1 行为一致。
5. **测试证据**：字段不存在 + 提交不携带 + params 保留 + UE 声明块精确匹配 + normalizer 契约测试，157/157 全绿。

---

### 文档完备性

- **PRD 7.1.19 §2**（:1031-1039）：三字段标注「R2 已移除前端字段/与提交」，来源不变（voice.speed 派生 / 契约默认 3 / params 字面量）✓
- **PRD §5**（:1057-1060）：`split.speechRate`、`concurrency`/`autoAdvance` 转为 ✅ 已处理项；剩余候选（Python YAML `baseWordsPerSecond`、`_safeOptions.voicePitch`、B 类运营化）如实保留 ✓
- **CHANGELOG**（R2 未发布条目）✓；**learnings**（R2 复盘 + 死字段清理模式四步固化）✓

---

### Action Items

1. [x] 三字段无残留读取点、提交/params 自洽（autoAdvance 字面量保留）
2. [x] 全仓测试/契约/快照消费点清点（恢复快照、UE 契约、text-config、pipeline 测试）
3. [x] concurrency 1-8 越界校验保留（normalizer :406）
4. [x] PRD §2/§5、CHANGELOG、learnings 更新完备
5. [x] 受影响三套件验证（157/157 通过）
6. [ ] **勾选 tasks.md 全部复选框**后提交/归档
7. [ ] **还原 cli.js / publish-api 行尾噪音**（排除出 PR）

**结论**：R2 方案无 Critical 问题，代码与测试改动自洽，行为等价性全部成立，文档三处（PRD §2/§5、CHANGELOG、learnings）同步完备。合并前仅剩两个流程性动作：勾选 tasks.md、清理两个行尾噪音文件。

---
SESSION_ID: 14ae35e8-ba1d-47e6-8932-6aa658f83602
留）
2. [x] 全仓测试/契约/快照消费点清点（含恢复快照、UE 契约、text-config、pipeline 测试）
3. [x] 确认 concurrency 1-8 越界校验保留（normalizer :406）
4. [x] 确认 PRD §2/§5、CHANGELOG、learnings 更新完备
5. [x] 运行受影响三套件验证（157/157 通过）
6. [ ] 勾选 tasks.md 全部复选框后提交/归档
7. [ ] 还原 cli.js / publish-api 行尾噪音（排除出 PR）
