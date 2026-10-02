---
record: publish-tab-state-keepalive
task: 修复固化标签切回后发布页草稿状态（视频文件等信息）丢失
date: 2026-10-02
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后按 origin/main 取证回填 PASS 并删除上方三个 sync_* 字段。
sync_backfill_owner: 下一个会话（或本会话合并后的收尾 docs 提交）
---

## 本次执行记录：固化标签切回后发布页草稿状态丢失（publish-tab-state-keepalive，2026-10-02）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码在隔离 worktree `D:/Data/projects/mp-worktrees/mp-publish-tab-state-keepalive` 的裸分支 `publish-tab-state-keepalive`（`scripts/session-init.sh` 创建，`verify-worktree-deps.js` OK）；共享根保持 `main` clean、与 origin/main 对齐（0/0）。 |
| 第一性原因（QM-5 ①） | PASS | `apps/desktop/src/App.vue:64` `<router-view v-if="!isLoginTab" />`。账号/登录标签激活时 `isLoginTab=true`（`tab?.accountId!=null && !tab.isHome`），v-if 卸载整棵路由子树 → `Publish.vue` 局部 `reactive article`（含 `video_path`）与 `videoFileMeta` 销毁；切回首页重挂载为全新实例 → 已选视频等未保存草稿丢失。该 v-if 原为「隐藏 router-view 避免与内嵌登录视图重叠」（`auth-view-manager.test.js:586` 注释），把「隐藏」误做成「卸载」。 |
| 逃逸分析（QM-5 ②） | PASS | 单元：`Publish.test.js` 直接挂组件、不经 App.vue 的 isLoginTab 条件，无法表示「切标签即卸载」。契约：`tab-independent-home`/`shell-mode-6a` 只测源码模板不变量，无一条覆盖「账号标签切换中工作区实例存活」。E2E/视觉：无「选视频→切账号标签→切回→断言仍在」用例，像素门禁不驱动标签切换。分类：测试覆盖漏洞。 |
| 修复 + 回归保护（QM-5 ④） | PASS | 修复：`v-if="!isLoginTab"` → `v-show="!isLoginTab"`（隐藏不卸载，保住实例；覆盖层已遮内容矩形，`display:none` 与「移除」视觉/布局等价，重叠不回退）。回归锁：`apps/desktop/src/publish-tab-state-keepalive.test.js` 真挂载 App.vue + 真实 tab store，home→账号标签→home 来回，断言 setup 计数恒 1、草稿值保留、隐藏期仅 display:none；另含「普通浏览器标签不误伤」用例。 |
| 反证 | PASS | 把 App.vue 改回 `v-if` 后 `publish-tab-state-keepalive.test.js` 第 2 条在「组件必须仍挂载」断言变红（实测 `1 failed`），改回 `v-show` 复绿；证明锁真实生效、非装饰性。 |
| 数据校验 / 显示项 / 提示文字 | PASS | 不新增/改文案与校验。发布页视频区既有显示项与提示（文件名回显、绿色「已选择视频文件」卡片、大小、格式徽标、更换/移除、支持说明）在切回后完整重现；视频选择校验（500MB 选前拦截、路径不可解析清空、首次/替换/重选提示）不变。详见 PRD §4/§5。 |
| 行尾与 diff 对账 | PASS | `CHANGELOG.md` / `01-docs/learnings.md` 走脚本头部插入（逐行保留原字节、块内 LF→CRLF）：`git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（CHANGELOG 13/0、learnings 8/0，删除数均 0）。App.vue 与新增测试/文档为常规 LF。 |
| 接线棘轮 | PASS | 新增测试位于 `apps/desktop/src/`，由 apps/desktop 的 vitest workspace 自动收集（`src/**/*.test.js`，`Publish.test.js` 先例），不属 `check-unwired-tests.js` 需显式点名的 scripts/.github 域；已按文件名跑通且反证变红，CI 全量执行现场以 run 日志出现该文件名为准。 |
| QM-1 打包 | N/A | 未触碰 `apps/desktop/electron/` 与 `packages/rpa-engine/`；改动面为渲染层 App.vue 模板 + 新增测试 + 文档。 |
| QM-4 视觉 | N/A | 未改任何视图渲染外观（v-if→v-show 视觉等价），无像素基线影响。 |
| QM-6 CCG 双模型外部评审 | 未执行（降级留痕） | 本轮外部模型通道（子代理配额受限 402 的同族风险）未逐一尝试；以「行为级回归锁 + 反证 + 四层逃逸分析留痕」替代，如实标注降级，不以自审冒充通过。 |
| 远程同步 | PENDING | 合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA 与时间，`git ls-remote --heads origin publish-tab-state-keepalive` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段。 |

### 遗留（不假装已闭合）
- 首页 SPA 在**路由切换**（非标签切换）时仍会重挂载 `Publish.vue`（无 keep-alive），届时草稿同样丢失——属独立问题，本 PR 只修「账号/登录标签切换」这一路径，未纳入 keep-alive 改造。
- QM-6 双模型外部评审未执行，后续如需可补跑。
