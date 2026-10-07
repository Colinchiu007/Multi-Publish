---
record: fix-autonomous-tester-encoding-defect
task: 修复 ai-autonomous-tester 三个文件的 U+FFFD——其中 _estimateEffort 的中文关键词损坏导致中文需求恒判 MEDIUM
date: 2026-10-07
# 下面三个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：修复 ai-autonomous-tester 编码缺陷（fix-autonomous-tester-encoding-defect，2026-10-07）

> 分支：`fix-autonomous-tester-effort-regex`；worktree：**沙箱内无法执行**（无 Windows + Git Bash）
> 范围：🐛 Bug 修复 —— 3 个源文件去 U+FFFD（430→0）+ 抽出 `utils/infer-effort` 消除三份重复实现 + 编码基线收紧（15→12）
> 判定：`classify-docs-only` → **docs-only=false**（改 `.js` 运行时代码）⇒ 走完整质量节拍

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| `check-debt-budget` | PASS | 最大改动文件 399 行 < 500；`maxFileLines`(5657, CreateView.vue) 与 `filesOver500`(101) 未触及，基线无需改 |
| `check-no-brand-residue` | PASS | 记录中一度引用含品牌词的 commit message，已改为按 SHA 引用 |
| `check-gate-record-debt` | PASS | 本篇含 `\| 远程同步 \|` 行 |
| `check-text-encoding-integrity` | PASS | 棘轮反向验证：塞 1 处 U+FFFD → 判红（退出码 1），还原 → 绿（退出码 0） |
| `tests/infer-effort.test.js` | PASS | 10/10；变异 3 组全部变红 |
| `tests/*.test.js` 全量 | PASS（零回归） | 162 例 152 pass → 172 例 162 pass；fail 恒 9 且集合前后一致（缺网络/LLM 依赖的既有环境失败） |

| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H\|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin fix-autonomous-tester-effort-regex` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |
|---|---|

## 背景

`scripts/check-text-encoding-integrity.js`（Gate 12b，PR #3032 / `b7c1a83`）扫描出
`packages/ai-autonomous-tester` 下三个文件含 U+FFFD，合计 430 处。当时只做了登记，未判断
是否影响运行时代码——因为其中**至少一个是运行时代码**（`verifier/requirements-verifier.js`，
做需求工作量档位判定）。本次专项排查确认：**是的，影响真实判定，且完全静默。**

## 排查结论

### 损坏分布

| 文件 | U+FFFD | 受损行 | 性质 |
|---|---|---|---|
| `verifier/requirements-verifier.js` | 326 | 25 | 22 行 JSDoc 注释 + **3 行代码** |
| `detectors/feature-detector.js` | 63 | 4 | 全部为文件头 JSDoc |
| `utils/path-resolver.js` | 41 | 3 | 全部为文件头 JSDoc |

三个文件均为**合法 UTF-8**（非二次编码损坏），Node 可正常加载 ⇒ 缺陷不表现为崩溃。

### 真正的行为缺陷（QM-5 溯源）

三处受损代码是 `requirements-verifier.js` 的 `_estimateEffort()`：

- L160 `/(import|export|<U+FFFD>|batch|<U+FFFD>|automate)/` → `HIGH`
- L161 `/(<U+FFFD>|<U+FFFD>|<U+FFFD>|<U+FFFD>|show|display)/` → `LOW`
- L184 证据行的输出分隔符

溯源到唯一插入点：

| commit | 日期 | 版本 | U+FFFD |
|---|---|---|---|
| `476b4d1` | 2026-07-12 | v0.2.0 | 0 |
| `2bd672e` | 2026-07-12 | v0.4.0 | 0 |
| `9b29306` | 2026-07-12 | v0.5.0 | **0** |
| `d52dcc0` | 2026-07-12 | v0.8.0「GitHub Actions + CLI 入口」 | **326 ← 引入点** |
| `44e2c6e` | 2026-07-21 | 当日第二笔提交（按 SHA 查原文） | `feature-detector.js` 63 / `path-resolver.js` 41 引入点 |

均为**单次引入**（非 `01-docs/learnings.md` 那种二次翻倍），且**受损行全是注释**
（`feature-detector.js` / `path-resolver.js` 去掉 U+FFFD 后与上一版逐行完全一致），
可从历史版本**无损恢复**——这与 `learnings.md` 的 220 行无锚点情形不同。

### 缺陷为什么静默

`_estimateEffort` 的**英文分支完好**，任何英文用例都测不出问题。实测（中/英对照）：

| 输入 | 修复前 | 正确值 |
|---|---|---|
| `批量导入用户数据` | MEDIUM | HIGH |
| `自动化工作流` | MEDIUM | HIGH |
| `用户列表展示` | MEDIUM | LOW |
| `设置提示按钮` | MEDIUM | LOW |
| `API 集成` | MEDIUM | HIGH |
| `batch import` / `show panel` / `export data` | 正确 | 正确 |

两套实现逐例对比：**9 例 5 例不一致，且全部是中文**，英文 100% 一致。

### 真实影响面

`ai-analyzer.js:252` 用它做决策分流：

```js
const complex = analysis.requirements.uncovered.filter(u => u.effort === 'HIGH')
if (complex.length > 0) return { action: 'NEED_HUMAN', reason: 'Complex requirements uncovered', ... }
```

⇒ **中文 PRD 的高复杂度需求永远识别不出来**，永远走 `FIX_AND_RETRY`，
不会被升级到人工处理。同样的 `effort` 值还被 `fix-engine.js` 消费。

### 放大问题的结构缺陷

同一套关键词逻辑当时有**三份独立实现**：

| 位置 | 中文状态 |
|---|---|
| `verifier/requirements-verifier.js` `_estimateEffort` | ❌ 损坏 |
| `ai-analyzer.js` `inferEffortFromText` | ✅ 完好，词表更全 |
| `fix-engine.js` `inferEffort` | ✅ 完好，词表略有差异 |

「抽取引入重复实现」是 `AGENTS.md` 债务清理里反复出现的形态——这次它在**正则层面**
重演了一次：各写各的，漂移无告警，其中一份静默坏掉。

## 修复

1. **抽出唯一实现** `src/utils/infer-effort.js`，三处调用方一律 `require` 它。
   词表取三份的并集（`fix-engine` 那份最全：HIGH 另含 `crypt`，LOW 另含
   `rename|css|color`）。新增中文关键词改这里，注释里写明「不再新增第二份」。
2. **恢复受损注释与代码**：
   - `feature-detector.js` / `path-resolver.js`：从 `9b29306` / `8d45d77` 逐行取回
     （已验证去掉 U+FFFD 后与旧版完全一致）
   - `requirements-verifier.js`：15 行从 `9b29306` 取回；余下 8 行是 v0.8.0 新增功能的注释
     （旧版无对应），依据紧邻代码签名与 `@deprecated` 标记重写；L184 分隔符还原为 `→`
3. **更新编码基线**：`scripts/text-encoding-baseline.json` 移除这三个条目
   （15 → 12），棘轮重新咬紧——今后这三个文件出现**任何一处**损坏立即判红。

结果：三个文件 U+FFFD 归零（430 → 0）。

## 验证

**门禁**

```
check-debt-budget          ✅
check-no-brand-residue     ✅
check-gate-record-debt     ✅
check-text-encoding-integrity ✅（基线 15→12）
```

债务基线无需改动：改动文件最大 399 行，远低于 500；
`maxFileLines`(5657, `CreateView.vue`) 与 `filesOver500`(101) 均未触及。

**棘轮咬合验证**（不可自证的锁等于没锁）

往已修复的 `feature-detector.js` 塞 1 处 U+FFFD → 门禁判红并列出该文件；
还原 → 绿。退出码语义核对：损坏 `1`、正常 `0`。

**测试**：`tests/infer-effort.test.js`（10 例）

除常规断言外，两条防退化锁：
- 三个源文件均不得含 U+FFFD（用 `String.fromCodePoint(0xfffd)` 构造，检测器不含被检测模式）
- 三个源文件均不得出现 `/(import|export|/` 形态的就地正则，防止第二份实现复活

**变异测试**（拆掉修复必须红）

| 变异 | 结果 |
|---|---|
| 中文 HIGH 词换成 U+FFFD（还原缺陷） | ❌ 2 红 |
| 中文 LOW 词换成 U+FFFD | ❌ 1 红 |
| verifier 退回就地第二份实现 | ❌ 2 红 |
| 还原 | ✅ 10 绿 |

**全量测试零回归**：`tests/*.test.js` 162 例 152 pass → **172 例 162 pass**，
fail 恒为 9 且失败集合前后完全一致（`AgentJudge` / `functional-runner` / `ocr` /
`Orchestrator` / `visual-runner`，均为沙箱缺网络与 LLM 依赖的既有环境失败）。

## 遗留（本次未做，已在测试中标注）

1. **词表缺中文「导入/导出」**：`import|export` 只有英文侧，`批量|batch`、
   `自动化|automate` 才有中英配对。故 `导出为CSV` 判 MEDIUM。
   这是**修复前即存在**的词表缺陷，与本次编码修复无关。补词属行为变更，
   需单独评估影响面，故按现状锁定并留 `TODO(词表)`。
2. 其余 12 个基线文件（含 `01-docs/learnings.md` 546 行里 220 行无 ASCII 锚点的部分）
   仍只登记未修。
