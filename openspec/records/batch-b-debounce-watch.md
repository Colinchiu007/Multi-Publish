---
record: batch-b-debounce-watch
task: M-11 发布记录筛选扫描节流（防抖 + 页数封顶 + 如实提示） + M-12 CreateView 双深 watch 改快照
date: 2026-10-07
---

## 任务执行记录：批次 B（batch-b-debounce-watch，2026-10-07）

编号约定：本报告 M-11 / M-12 均为**审查报告正文编号**
（`docs/frontend-deep-review-2026-10-05.md`）。

| 节拍 | 状态 | Fresh 证据 |
|------|------|-----------|
| 会话隔离前置 | PASS | 独立 worktree `D:\Data\projects\mp-worktrees\mp-batch-b`（D 盘，非 C 盘），分支 `batch-b-debounce-watch`，基线 `b8ed51da`；共享主工作区未写入；`pnpm install --frozen-lockfile` 完成（46.3s） |
| 找第一因（QM-5 甲） | PASS | M-11 根因是全仓 `views/` 下 `debounce\|throttle` **零命中**（唯一手写防抖是 `Accounts.vue` 的 300ms）——即"缺工具而非缺调用"，故先补 `useDebouncedRef`；M-12 根因是两条 `deep: true` watch 对 5600 行组件的依赖链做全量深度遍历，而业务只关心"值变了没变" |
| 数据方差（QM-5 乙） | PASS | M-11 新增 7 源合成快照 + 页数上限 20；M-12 用 `JSON.stringify` 快照浅比较替代深度遍历。两者均**不改变命中结果**，只改变"何时扫 / 扫多少 / 怎么比" |
| 修复 + 回归保护（QM-5 丙） | PASS | 新增 3 个测试文件共 18 用例全绿；既有 `PublishHistory.test.js` 70/70、`CreateView.test.js` 288/288 全绿 |
| 反证（QM-5 丙必做） | PASS | 三条反证全部转红：① CreateView watch 键改为不存在名字 ⇒ 3 条红（静态 1 + 运行时 2）；② 防抖延迟 300→0 ⇒ 1 条红（12 次调用 vs 预期 1 次）；③ 页数上限 20→99999 ⇒ 用例超时（扫描真的无限翻页）。恢复后全部回绿 |
| 陈旧写入自查（Q3） | PASS | 新增用例「清空筛选后不再继续补页」：扫描途中清空搜索框 ⇒ 下一轮 break、不再翻表、截断提示复位。循环开头检查（而非仅入口）是关键 |
| 防止再次发生（QM-5 丁） | PASS | 静态守卫把"watch 键必须指向真实 data/props/computed"变成机械判据；运行时实测把"自动保存真的被调用"钉死——既有 288 条对此零覆盖正是功能被静默删除却无人发现的原因 |
| 行尾 diff 对账 | PASS | 待提交前用 `git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径核对 |
| 门禁自测 | 待跑 | `check-max-lines.js` / `check-unwired-tests.js` / `check-locale-sync.js` / `check-gate-record-debt.js` / `classify-docs-only.js` |
| QM-1 打包 / QM-4 视觉 | N/A | 未改 `apps/desktop/electron/` 与 `packages/rpa-engine/`；视觉变化仅新增一个提示 span，由组件测试覆盖 |
| QM-6 CCG 跨家族外部评审 | 已执行 | deep-review.sh（critic=claude）产出 8 条（1 Critical + 5 Warning + 2 Info），i1/Critical 已修复并有反证闭环的回归锁；i5 已处置（常量同源）；其余记录在 PRD §6 |
| 远程同步 | PASS | merge SHA 73edb4e6（PR #3133，2026-10-08）；git ls-remote 证远端分支 batch-b-debounce-watch 已删（0 行输出） |

## 关键判断与取舍

1. **先补工具再接调用点**：报告给的根因是"缺工具"，所以新增
   `apps/desktop/src/composables/useDebouncedRef.js`，而不是在 PublishHistory 里
   再手写第七个 `setTimeout`。
2. **防抖 300ms 不引入第二个数字**：与仓库既有唯一手写防抖（`Accounts.vue`）一致。
3. **页数上限取 20（≈1000 条）而非不限**：不给上限则历史表每增长一倍、单次搜索代价
   翻倍——这是**随时间恶化的缺陷**。1000 条是人工取值，已在 PRD §6 标明为临时上限，
   M-15 落地（服务端过滤）后可移除。
4. **触顶必须如实**：原句"已从 N 条中筛选"暗示扫完全表，用户会把"没搜到"误判为
   "记录不存在"。触顶改用"已在已加载 N 条中筛选"+ 可操作提示。
5. **M-12 用序列化而非逐字段 leaf getter**：S2V 配置字段集会随配置档扩展，逐字段
   会漏，漏掉的字段此后永久失去响应且静默。
6. **M-13 不在本批次**：`invoke` 默认超时属批次 A，本批次不动。

## 反证过程中暴露的三个真实问题（已修复并写入注释）

1. **假定时器驱动不了 20 轮串行 await**：首版用 `vi.useFakeTimers()` + 60 轮
   `advanceTimersByTimeAsync`，把用例拖到 60s 超时。改真实定时器后 11.7s 通过。
2. **mock 每页 id 必须各不相同**：首版每页返回相同 id ⇒ 组件按 id 去重 ⇒
   `addedCount === 0` ⇒ 判定已到底提前退出，测不到页数上限。这是**去重保护在正常工作**，
   夹具错了而不是代码错了。
3. **静态守卫两处假阳性**：
   - 定位块用 `^  watch` 固定缩进正则 ⇒ 各文件缩进不一致，解析出 0 块，守卫空转；
   - 取键名只认 `data: {` ⇒ 本仓 6 个 Options API 视图**全部**是 `data() { return {} }`，
     data 键一个都没拿到，合法 watch 被误报成孤儿。
   两处均已修正，并新增「分析器有效性」断言（data 键为空直接红）防空转。

## 本次最值得记住的一条

修 M-12 时我把快照方法体误写进 `watch: {}` 块，等于**静默删除**了「S2V 选项自动保存」，
而 CreateView.test.js 的 288 条用例全绿——因为既有测试只覆盖 restore、从未覆盖 autosave。
测试全绿在这里不代表没问题，而是代表没人看着。因此本批次同时加了静态守卫（键名存在）
与运行时实测（handler 真的被调用），缺一不可。
