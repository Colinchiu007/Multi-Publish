# 基线 vs 现状差异审计（2026-08-15，规格化前）

## 交付验证补充（2026-08-15）

- OpenSpec：`openspec validate story2video-history-status-tabs --type change` 通过。
- Renderer：定向 Vitest 3 files / 211 tests 通过；完整 runner 曾被环境中断，未作通过声明。
- 构建：`pnpm run build:vue` exit 0。
- i18n：pair check 通过；CJK 因既有 file:line 行号漂移显式重锚后复跑通过（1501 条，无新增）。
- 视觉：隔离 worktree Vite 下 `home-default` 与 `create-history` quick 通过。
- 双模型审查：Antigravity 地区资格失败；Claude wrapper exit 1 无输出；按机制降级为主代理审查，详见 CCG `review.md`。

基线：`origin/main` at `24b5f7bb`。审计范围为【视频创作 → 历史记录】内嵌视图，证据来自当前已合并源码、测试、PRD 与 OpenSpec。初始审计后，主分支合入了 `story2video-history-visibility`，本审计已重新基于最新主分支校准。

| 需求项 | 基线/现状核验 | 归类 |
|---|---|---|
| 合并本地完成项目与流水线运行记录 | 已由 `CreateView.loadHistory` 与 `usePipelineHistory.loadHistory` 实现；按 `projectId/run.id` 去重 | **已交付** |
| stale running 转已暂停并推断环节 | 已实现 30 分钟阈值和 `pausedStage` 回填 | **已交付** |
| 失败环节与断点续作 | 已回填失败环节；显式按钮可恢复可恢复任务 | **已交付** |
| 默认和各状态列表按更新时间倒序 | 当前实现及 `story2video-history-visibility` 规格均要求未完成任务优先，再在组内排序；与本 change 的全局时间序冲突 | **待办（修改既有能力）** |
| 时间字段校验与回退 | 当前只显示 `updatedAt/completedAt/createdAt`，未覆盖 snake_case、`endedAt`、非法值与确定性同值排序 | **待办** |
| 状态标签切换 | 当前为 `select` 下拉 | **待办** |
| 暂停与失败精确筛选 | 当前三处逻辑把 `paused` 与 `failed` 混为同一结果 | **待办** |
| 卡片信息统一且状态详情充分 | 已有标题、状态、时间、模式、项目 ID、阶段；暂停环节为原始英文，失败仅显示环节或错误其一 | **待办** |
| 非取消任务点击进入详情 | 当前部分卡片点击直接恢复执行，部分状态无动作；取消仅因缺项目 ID 偶然不跳转 | **待办** |
| 历史视图完整中英双语 | 组件仍包含大量中文硬编码 | **待办** |
| 独立旧路由 `/create/history` 同步改造 | 用户明确指向视频创作内历史记录；旧路由不是当前内嵌视图 | **待确认/非本 change 范围** |

结论：本 change 只承载排序、筛选交互、卡片/详情、i18n、测试和文档等真实待办；不重复实现已有存储、IPC、stale 检测、轮询和恢复引擎。
