---
record: fix-public-link-followups
task: 作品链接判据四项收紧（QM-6 评审 upheld 跟进修复：F1 占位行/F2 query/F3 userinfo/F4 wechat_mp 双参）
date: 2026-10-08
---

## 本次执行记录：作品链接判据四项收紧（fix-public-link-followups，2026-10-08）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 运行时代码（`packages/shared-utils/`、`apps/desktop/src/`）→ 隔离 worktree `D:\Data\projects\mp-worktrees\mp-fix-public-link-followups` + 裸分支 `fix-public-link-followups`，基线 `origin/main`=`67f51569`；三项实证（worktree list / abbrev-ref / show-toplevel）通过，共享根保持 `main` |
| TDD | ✅ | 先写 12 条新用例并确认红灯（shared-utils 10 红 + 视图 2 红，全部为新增用例），再实现。实现后 `published-content-url.test.js` **103 passed**、视图三套件 **114 passed** |
| 变异反证 | ✅ | 四项逐项注入并全部精确捕获：F2 恢复 query 并入锚定 → **9 红**；F3 去掉 userinfo 拒绝 → **2 红**；F4 双参退单参 → **恰好 F4 两条红**（初次逃逸根因是 `execFileSync('npx'…)` 无 `shell:true` 直接失败、out 为空被误读成 0 红——已换文件脚本+落盘验证重做）；F1 恢复旧 v-if → **恰好 F1 红**。还原后孪生 `isPublicContentUrl` 与 wechat_mp 规则段双端逐字 `IDENTICAL`、103 例全绿 |
| locale 成对（Gate 7） | ✅ | `--keys` PASS（475 个使用中 key 均在 zh/en，本刀未改 locales）；`--cjk` PASS（无新增硬编码） |
| 品牌残留 | ✅ | `check-no-brand-residue.js` PASS（7331 tracked 文件） |
| 行尾对账 | ✅ | 编辑工具引入的 8 处 LF 已统一回 CRLF（自检脚本确认 pureLF=0）；`git diff --numstat` 与 `--ignore-cr-at-eol` 两口径一致 |
| QM-2 代码必检 | ✅ | 无新增依赖/require 路径；规则表新增 `queryRe` 字段 CJS/ESM parity 逐字锁定；无 IPC reactive 参数 |
| QM-1 打包 | N/A | 未触碰 `electron/` 构建产物路径与 `packages/rpa-engine/`；`verify-worktree-deps.js` OK（11 个 workspace 消费方指向本 worktree） |
| QM-4 视觉 | N/A（构造性） | F1 只让「完全无链接证据」的记录多显示一行占位文案（此前整行消失）；无样式/布局改动，静态渲染不变 |
| QM-6 双模型外部评审 | ✅（上游已闭合） | 本刀即 #3155 评审裁决的跟进修复；裁决书与评审原文已在 `.ccg/review/ccg-deep-23822b73/`（PR #3155 入库） |
| 远程同步 | PASS | 已合并 #3166 = `facb2ad0811d35d6efcbf50ef32e058a5ddb7673`，committer 2026-10-08T21:51:32+08:00。取证：GitHub `mergeCommit` 与远端一致，`git log origin/main --grep="(#3166)" --format="%H %cI"` 双源一致，`git ls-remote --heads origin fix-public-link-followups` 返回 **0 行**（远端分支已随 squash 删除） |

### 遗留（不假装已闭合）

- **QM-4 视觉像素回归未跑**（需 dev server 与基线）；本刀无样式/布局改动，构造性保持渲染不变。
- **wechat_mp 收紧的误伤面**：若历史落库存在「只带 mid 的公众号链接」，收紧后这些 recorded 将判 none（此前判 recorded 打开异常页）。不给错链接优先于多给链接，属设计取舍。
- **F2 的 query 追踪参数**仍留在 recorded URL 原样中（显示用）；若日后要求净化，落库侧 `sanitizePublishResultUrl` 是唯一正确收口点。
