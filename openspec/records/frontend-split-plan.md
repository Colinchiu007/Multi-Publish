---
record: frontend-split-plan
task: locales 结构拆分里程碑 1 — zh/en 51 命名空间从单文件拆分为装配文件 + 51 域子模块（FRONTEND-FILE-SPLIT-PLAN-2026-10 v3）
date: 2026-10-09
sync_status: PENDING
sync_reason: 本 PR（#3224）尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：locales 结构拆分里程碑1 — 51 命名空间按域隔离（frontend-split-plan，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码：隔离 worktree `D:\Data\projects\mp-worktrees\mp-frontend-split-plan` + 裸分支 `frontend-split-plan`；共享根保持 main |
| 第一性原因（QM-5 ①） | N/A | 非 Bug 修复，属架构拆分（locales 模块化降冲突面） |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `src/locales/structure-lock.test.js`（4 断言：已迁移域子集精确相等 / zh-en 子模块对称 / 顶层命名空间防重复展开 / _rest 容错），防搬运丢键/改键/重复展开 |
| 防止再次发生（QM-5 ⑤） | PASS | 迁移脚本 `scripts/migrate-locale-namespace.cjs` 内置 fail-closed（嵌套展开检测 + 巨型对象域告警），三实测坑（嵌套展开丢 import / story2video 双定义误抽 / 大批量半成品混入）已固化 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致（112 文件），无删除文件 |
| 接线棘轮 | PASS | 新增 `structure-lock.test.js` 位于 `src/locales/`，被 vitest 全量扫描自然覆盖（locales 目录 28 测含此 4 条） |
| QM-1 打包 / QM-4 视觉 | N/A | 未触 electron 主进程与视觉面（locales 纯文案模块，渲染消费面无感知） |
| QM-6 CCG 双模型外部评审 | PASS | 方案 v3 经内部双模型（12 findings 全接受）+ 外部 codex（9 findings 全接受）两轮对抗评审；E1 claude 通道因后端实为 DeepSeek-V4-Flash 级模型低效空转 20+ 分钟，经用户确认中止（CCG fallback 纪律：不得以自审冒充通过，此处外部 codex 通道独立返回完整结果，非自审） |
| 远程同步 | PENDING | PR #3224；合并后取 `git log origin/main --grep='(#3224)$' --format=%H|%cI` 回填 merge SHA，`git ls-remote --heads origin frontend-split-plan` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 验证

- vitest：locales + 4 改造测试 + i18n 消费方抽样 **66 测全绿**；结构锁 4/4
- Gate 7：`--pair-base main` PASS + `--keys` PASS（1478 key 均在 zh/en）
- 品牌残留：`check-no-brand-residue.js` PASS（7554 tracked 文件）
- 键零变更：结构锁 ①② + Gate 7 key 校验双重保证；PRD 附录 L1-L5 验收全过

### 遗留（不假装已闭合）

- 里程碑 2（CreateView 第 1-2 步：BGM/SceneAsset 弹窗 + useTtsVoices/useBgmLibrary）按方案止损策略，待本 PR 合并后用真实冲突数据复评是否执行。
- 方案 v3 第 6-7 步（PipelineLaunchPanel + 壳层 provide/inject 化）为降级复评项，不预先承诺。
