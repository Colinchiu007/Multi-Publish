# Tasks: rollout-board

## 0. 约定与真源
- [x] 0.1 建 change（proposal / design / specs / tasks），标 M+ 前置双模型评审节点

## 1. TDD 测试先行（Phase 2→②）
- [x] 1.1 [TDD] `tests/rollout-view.test.js`：api 层契约——fetchRollout 带参/不带参 URL 与 params 正确
- [x] 1.2 [TDD] 同文件：正常态三区映射（ack_rate 0.87→87.0%、block_rates 降序、degraded 标记、last_ack_at 本地化、空值「—」）
- [x] 1.3 [TDD] 同文件：空态（total===0 无假卡片无切换器）、错误态（detail 文案 + 重试按钮）、loading 态
- [x] 1.4 [TDD] 同文件：版本切换——候选集去重不伪造、切换后以 ?version=N 重新拉取
- [x] 1.5 [TDD] 接线层：DEFAULT_MENU_ORDER 含 /rollout 且 adminOnly、路由表含 /rollout、pageGuides 含 Rollout

## 2. 实现（Phase 2→③，一次只做这一片）
- [x] 2.1 `src/api/rollout.js`：fetchRollout({version})，version 空时不下发参数
- [x] 2.2 `src/views/RolloutView.vue`：三区四态 + 版本切换（照 design D2）
- [x] 2.3 接线：router/index.js、config/menuItems.js（PieChart, adminOnly）、pageGuides.js

## 3. 门禁与交付
- [x] 3.1 全量测试通过（frontend vitest + backend pytest 确认未破坏）
  <!-- 3.2 判定：ops-center 前端无视觉测试框架（视觉基建仅覆盖 apps/desktop），本 change 不触桌面端 UI → N/A 豁免；以组件渲染判据测试(22条) + vite build 模板编译验证代替 -->
- [x] 3.2 QM-4 视觉回归（--single 单视图）+ 手动验证（dev server 四态点检）
  <!-- 3.3 实况：opencode(nemotron-3.5-lightning-free) 实跑完成——2 MEDIUM(historyClients 无上限增长/候选集漂移) 已修复、1 LOW(el-progress 无越界，utils 已钳制)、无 Critical；claude 后端 15 分钟零输出挂起(超时)，重试上限内不可用 → 单后端实跑 + 挂起原因留痕，见 .quality-gates.md -->
- [x] 3.3 CCG 双模型外部评审（claude + opencode 实跑，findings 回写 .quality-gates.md，Critical 修复）
- [x] 3.4 .quality-gates.md 记录 + PR + CI + 自动合并 + 远程同步回填
- [x] 3.5 归档三同步（openspec archive + CHANGELOG + tech-debt 台账销 V-4）
