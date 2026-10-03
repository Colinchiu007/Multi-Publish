---
record: publish-draft-keepalive
task: 发布页草稿在路由切换时丢失——工作区 router-view 加 keep-alive
date: 2026-10-03
---

## 本次执行记录：发布页草稿在路由切换时丢失（publish-draft-keepalive，2026-10-03）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码在隔离 worktree `D:/Data/projects/mp-worktrees/mp-publish-draft-keepalive` 的裸分支 `publish-draft-keepalive`（`scripts/session-init.sh` 创建，deps OK）；共享根保持 main clean。 |
| 第一性原因（QM-5 ①） | PASS | App.vue 主工作区 `<router-view>` 无 `<keep-alive>`，vue-router 路由切换即卸载 `Publish.vue`，其局部 reactive article（含 video_path）等草稿销毁。承接 #2764（v-if→v-show 只修账号标签那条），本条是「首页内路由切换」独立通路。 |
| 逃逸分析（QM-5 ②） | PASS | Publish.test.js 直接挂组件不经 router-view；publish-tab-state-keepalive.test.js 只覆盖 isLoginTab v-show 通路；App 既有测试是源码契约。分类：测试覆盖漏洞（缺「路由切换中页面实例存活」的行为级锁）。 |
| 修复 + 回归保护（QM-5 ④） | PASS | App.vue 改 `<router-view v-slot><keep-alive :include="['Publish']"><component :is v-show="!isLoginTab"/></keep-alive></router-view>`；Publish.vue 加 `defineOptions({name:'Publish'})` + `applyHistoryVideoQuery` 从只在 onMounted 改为 onMounted+onActivated（缓存后重进入预填不失效）。新增 `publish-draft-keepalive.test.js`（2）+ Publish.test.js keep-alive 预填用例（1）。 |
| 反证 | PASS | ① 去 keep-alive（退回普通 router-view）→ publish-draft-keepalive.test.js 两条 setup 计数变 2 → 红（实测）；② 移除 onActivated 的 applyHistoryVideoQuery → Publish.test.js 预填用例停在旧值 a.mp4 → 红（实测）。均恢复后复绿。 |
| 数据校验 / 显示项 / 提示文字 | PASS | 不新增/改文案与校验；发布前必填、视频选择校验不变。keep-alive 只保证跨路由不丢已填内容。 |
| 行尾与 diff 对账 | PASS | CHANGELOG/learnings 脚本头部插入（逐行保留原字节、块内 LF→CRLF）：`git diff --cached --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致（CHANGELOG 15/0、learnings 9/0）。 |
| 接线棘轮 | PASS | 新增测试在 apps/desktop/src，由 vitest workspace 自动收集（publish-tab-state-keepalive 先例），非 scripts/.github 显式点名域；已按文件名跑通 + 两条反证变红，CI 现场以 run 日志出现该文件名为准。 |
| QM-1 打包 | N/A | 未触碰 `apps/desktop/electron/` 与 `packages/rpa-engine/`；改动面为渲染层 App.vue/Publish.vue + 测试 + 文档。 |
| QM-4 视觉 | N/A | 未改任何视图渲染外观（keep-alive 不改首帧渲染，v-show 语义不变）。 |
| QM-6 CCG 双模型外部评审 | 未执行（降级留痕） | 外部模型通道本轮未逐一尝试（子代理配额受限同族风险）；以「App 级 + 组件级双反证 + 邻接全量 130 passed」替代，如实标注降级。 |
| 远程同步 | PASS | PR #2806 已 squash 合并：merge commit `ecee7649fbb72422d5d661e5baf8e21ba2bb416d`（2026-10-03T02:42:55Z，`git log origin/main --grep='(#2806)$'` 取证）；`git ls-remote --heads origin publish-draft-keepalive` 返回 0 行证远端分支已删。CI 全绿（QG Unit Tests / Desktop Shards / Coverage / Visual / Static / Browser E2E 等），新测试 `publish-draft-keepalive.test.js` 已在 origin/main。登记 sync_* 字段已随本回填删除。 |

### 遗留（不假装已闭合）
- 只缓存 Publish 一页；其它页若也要「跨路由保草稿」需按需扩 include，并逐页评估 query 预填/数据刷新是否要 onActivated 适配。
- QM-6 双模型外部评审未执行。
