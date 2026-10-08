---
record: test-helper-dedupe
task: 抽取共享 resolveGitBash/toPosixPath 探测链到 scripts/lib/ccg-test-helpers.js
date: 2026-10-08
---

## 本次执行记录：测试探测链去重（test-helper-dedupe，2026-10-08）

> 分支：`test-helper-dedupe`；worktree：`D:\Data\projects\mp-worktrees\mp-test-helper-dedupe`
> 范围：🔧 测试基建 —— 新增 `scripts/lib/ccg-test-helpers.js`，改造 4 个消费方测试，`.gitignore` 目录级白名单
> 判定：`classify-docs-only` ⇒ **docs-only=false** ⇒ 混合 PR，完整质量节拍

### 动因（问题定位）

PR #3148 QM-6 评审 i6 两次点名、#3161 继承登记：Git Bash 探测链（MP_GIT_BASH 覆盖 → git --exec-path 派生 → 硬编码候选 → dirname.exe 身份校验 → 裸 bash 兜底）在 4 个测试文件里逐字复制。复制的代价是**改名即漂移**——任何一处修 bug，其余三份静默保持旧行为。

### 修复 + 回归保护（QM-5 ④）

- 新增 `scripts/lib/ccg-test-helpers.js`（JSDoc + 出处注释），导出 `resolveGitBash` / `toPosixPath`；
- 4 个消费方（branch-naming-contract / ccg-bash-entry / deep-review-deps / plan-review-deps）删除本地副本改为一行 require；
- `start-mp-task.test.js` **不在范围**：它的是结构锁（断言入口脚本文本含探测链），不执行探测；
- `.gitignore` 用 **`!scripts/lib/` 目录级放行**（QM-6 i1b：单文件白名单会让未来新增 lib 文件再次漏放行）。

### 门禁证据

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 全套件回归 | PASS | 6 套件 **74 pass / 0 fail**（branch-naming 6 / ccg-bash-entry 8 / deep-review-deps 13 / plan-review-deps 6 / start-mp-task 11 / check-unwired-tests 30） |
| 接线棘轮 | PASS | `check-unwired-tests.js` rc=0（helper 非 .test.js 不需接线，随消费方 require 链被 node --test 验证） |
| 编码完整性 | PASS | rc=0；helper U+FFFD=0 |
| 品牌残留 | PASS | rc=0 |
| 行尾对账 | PASS | 两口径 numstat 一致；改动文件保持 HEAD 基线 LF |
| 体积 | — | 净 -12 行（+84/-96） |
| QM-1 打包 / QM-4 视觉 | ➖ N/A | 未触 electron；无 UI |
| QM-6 双模型外部评审 | **PASS** | critic=claude（69.6s），4 findings 0C/2W/2I 全处置（见下），scores correctness 9 / security 10 / performance 9 / maintainability 8 |
| 远程同步 | PASS | PR #3171 squash 合并为 origin/main e787274503c55095744125fd9fceed2a3cd06abb（2026-10-08T22:54:09+08:00，squash merge，CI 全绿）；git ls-remote --heads origin test-helper-dedupe 返回 0 行证远端分支已删。回填与销账在同一次提交内完成：删 frontmatter sync_* 三字段 |

### QM-6 CCG 评审处置（critic=claude，非自审）

| # | severity | 处置 |
|---|----------|------|
| i1 | Warning | **成立已修**：helper 补末尾换行；.gitignore 改 **`!scripts/lib/` 目录级放行**（单文件白名单会让未来 lib 下新文件再次漏放行） |
| i2 | Warning | **成立已修**：全仓递归搜索（scripts/ + .github/scripts/ 含子目录）确认硬编码候选链**无第 5 处复制**，结论写进 helper 头注释 |
| i3 | Info | 不采纳：toPosixPath 语义已在 JSDoc 声明；给 lib 加单测会让 helper 变被测对象、反需接线 CI |
| i4 | Info | 不采纳：每测试文件 spawn git 一次共 <0.5s；模块级缓存会掩盖 MP_GIT_BASH 运行时覆盖语义 |

### 遗留（不假装已闭合）

- 引擎 `timeoutMs` 写死 + `model-call.js` 假绿灯（技能目录，非本仓）：继承未触碰。
- 0 字节 `claude.exe` 空壳（`C:\Users\邱领\bin\`，不在 PATH）：待人工确认删除。
- 相对 PATH 条目场景的 MSYS re-exec 环境转换深坑：见 #3161 记录，行为级测试需绕开 MSYS 层。