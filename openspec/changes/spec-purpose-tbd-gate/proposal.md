# Proposal: 主规格 Purpose 去 TBD 的**检测机制**（spec-purpose-tbd-gate）

## Why

`openspec archive` 会在 `openspec/specs/<cap>/spec.md` 写入一句占位：

```
TBD - created by archiving change <name>. Update Purpose after archive.
```

然后**没有任何东西回来追这笔账**。2026-10-07 清点：151 份主规格里 **43 份**如此，
而 `git grep -l Purpose -- scripts .github` 命中 **0 个文件** —— 即门禁面上从来不存在这条判据。

上一轮（PR #3084）只做了"一次性填平"，并在其执行记录里把这一条写成**遗留**：
「缺的是检测机制，不是这一次的填写」。本 change 就是那笔遗留的兑现。

不加会怎样：存量会重新积累，且**没有任何失败信号** —— 下一个会话读到 TBD 只会当成"这规格本来就没写"，
于是"先文档再代码"的前置门对这份规格静默失效。这与本仓已定性过的「装饰性门禁」是同一类，
只是这次红的是文档质量而不是代码。

## What Changes

- 新增 `scripts/check-spec-purpose.js`：全量扫描 `openspec/specs/**/spec.md`，
  Purpose **缺失 / 空 / 仍是占位词（TBD、TODO、待补充…）** ⇒ rc=1 并逐条点名。
- 新增 `scripts/check-spec-purpose.test.js`（14 条）：四类违规各一条、两条空集出口各一条、
  规模下界、增量目录不得入域、**真实仓库上不得把写好 Purpose 的规格判成 EMPTY**，
  以及两条**接线结构锁**（必须住在 `changes` job、必须在 `classify` 之后、测试必须同 step 点名、
  `.gitignore` 必须放行本体脚本）。
- 接线：`.github/workflows/quality-gate.yml` 新增 **Gate 12d**（`changes` job，紧跟 Gate 12c）。
- `.gitignore` 补 `!scripts/check-spec-purpose.js`（第 106 行 `scripts/*.js` 会整体忽略新建脚本）。

## 三个非显然的决定（写清楚，别让下一个人重新推）

1. **全量扫描，不按改动集。** Purpose 缺失由"归档"这个动作引入，与后续谁改了哪个文件无关；
   按改动集判 = 只在恰好又改到它时才拦。**前提是该先归零存量** —— 本仓 #3084 已经归零
   （当场复跑：151 份，违规 **0**），所以这条可以按绝对判据上，不必做棘轮。
   （对照：Gate 12c 文档绝对路径只能按改动集，因为全量会命中 100+ 处历史引用，那类"修好"等于篡改历史。）
2. **两条空集出口各自抛错 + 规模下界。** `0 个文件` 与 `0 个违规` 在计数上同形；
   反证 M3 实测过：只给"目录不存在"留锁时，把 `check()` 里"扫描域为空 ⇒ 抛"改成
   `return ok:true` 的变异**照样全绿**（`NOT_RED`）。补第二条出口的测试后同一变异立刻变红。
3. **落点必须是 `changes` job 且排在 `classify` 之后。** 输入 `openspec/**` 命中 docs-only 白名单，
   接进被 `docs-only != 'true'` 门控的 static-gates 等于给自己关掉校验（AGENTS.md「进白名单前提锁」，
   同族先例 #2718 账本 JSON / #2745 执行记录 / #3000 文档绝对路径）；
   而摆在 `classify` 之前时本 step 一红会让 `docs-only` 输出整条消失、下游重型 job 全部跑满。
   这两个前提都由测试里的结构锁钉住，不靠注释。

## Impact

- Affected specs: `openspec-integration`（新增一条 Requirement：主规格 Purpose 完整性必须有门禁）
- Affected code: `scripts/check-spec-purpose.js`、`scripts/check-spec-purpose.test.js`、
  `.github/workflows/quality-gate.yml`、`.gitignore`
- 风险：**第一天就红别人的分支** —— 缓解是存量已实测归零，且占位词判定只看正文开头（避免把
  "Purpose 里提到了 TBD 这件事"判成缺陷）；若某天真出现无法归零的历史包袱，正解是补文档，
  **不是**放宽判据（本仓「装饰性门禁」反面的既有口径）。
- 本轮实测顺带修掉的一个自身缺陷：判据第一版用带 `m` 的多行正则取正文，`$` 在多行模式下匹配
  **空行行尾**，把 15 份**已写好 Purpose** 的规格判成 EMPTY（真实例子 `openspec/specs/creator-monitor/spec.md`）。
  改为逐行扫描后归零；并留一条"真实文件形状"的回归锁防复发。
