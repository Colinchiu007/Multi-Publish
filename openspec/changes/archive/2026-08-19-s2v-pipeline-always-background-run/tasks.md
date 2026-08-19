## 1. 规格与任务

- [x] 1.1 完成基线审计：既有主进程已支持 background 异步推进和并发占槽，待改为 renderer 默认语义
- [x] 1.2 创建 CCG task.json 并关联本 OpenSpec change
- [x] 1.3 完成 proposal、design、specs

## 2. Renderer 实现

- [x] 2.1 抽取自动后台 helper：runId 校验、停轮询、重置 renderer 运行态、toast、历史刷新
- [x] 2.2 修改 Story2Video/编排启动成功路径，运行即自动后台
- [x] 2.3 修改历史卡片继续/从断点继续：running 结果后台，人工选择 paused 结果保留交互
- [x] 2.4 删除手动【后台运行】按钮依赖及自动挂载 running run 的逻辑
- [x] 2.5 更新 running 历史卡片的后台运行提示与 zh/en 文案

## 3. 回归测试

- [x] 3.1 更新 CreateView 启动、历史续跑、挂载恢复和旧按钮测试
- [x] 3.2 补充无效 runId、取消未调用、历史刷新和人工检查点测试
- [x] 3.3 运行受影响 Vitest、locale sync、lint/build；记录结果

## 4. 文档与交付

- [x] 4.1 更新 PRD、视频创作 PRD、CHANGELOG、learnings、i18n glossary
- [x] 4.2 完成双模型审查尝试并记录降级结果，写入 .ccg/tasks/s2v-pipeline-always-background/review.md
- [x] 4.3 质量门禁、提交、推送、PR、实际合并与远程 SHA 核对（PR #1019，merge 1226333fef4b3435fe79e175058fc1e29080e764，origin/main 已核验）
