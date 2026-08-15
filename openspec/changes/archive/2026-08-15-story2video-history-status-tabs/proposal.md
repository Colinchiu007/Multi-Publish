## Why

视频创作历史目前按状态分组而非按最近更新排序，暂停筛选还混入失败任务，导致用户难以确认最新任务及其真实状态。卡片点击同时承担“查看”和“恢复执行”，并且暂停环节仍显示内部英文标识，交互与信息表达不一致。

## What Changes

- 将合并后的全部历史任务以及每个状态筛选结果统一按有效更新时间倒序排列，并定义八种时间字段、非法值、缺失值和同值任务的确定性排序合同。
- 将状态下拉改为可点击、可键盘切换、带 ARIA 状态的标签组；暂停与失败使用精确且独立的筛选语义。
- 统一所有状态卡片的标题、流水线、状态、更新时间、创建时间、耗时、模式、任务/项目标识和阶段摘要；暂停任务增加本地化暂停环节，失败任务同时显示本地化失败环节与错误摘要。
- 将非取消卡片点击改为打开只读任务详情，不触发恢复或其他写操作；已取消卡片不具备按钮/链接语义。恢复、继续生成、打开成片和删除仍需点击明确操作按钮。
- 将历史视图新增及现有可见文案迁移到 zh/en 成对 locale，时间和时长按当前语言格式化。
- 补齐纯函数、组件、父视图、i18n、视觉与文档回归；保留既有存储、IPC、轮询、stale 检测和恢复引擎行为。

## Capabilities

### New Capabilities
- `story2video-history-browsing`: 定义视频创作历史的合并排序、精确状态筛选、统一卡片、只读详情、状态专项信息、国际化与可访问性交互合同。

### Modified Capabilities

- `story2video-history-visibility`: 将“未完成任务优先、状态组内排序”改为全部任务统一按有效更新时间倒序；失败任务可见性、终态与阶段一致性保持不变。

现有 `story2video-history-local-mode`、`story2video-history-public-read`、`story2video-history-material-selection` 的存储、访问控制与项目详情合同保持不变。

## Impact

- 前端：`CreateView.vue`、`CreateViewHistory.vue`、`usePipelineHistory.js`、历史纯函数与样式。
- i18n：`locales/zh.js`、`locales/en.js`，复用 `pipeline-labels.js` 的阶段翻译注册表。
- 测试：新增历史纯函数/组件测试，更新 `CreateView.test.js` 中旧的状态分组与点击恢复断言，并执行 locale、构建和视觉门禁。
- 文档：视频创作 PRD、总 PRD/用户手册、CHANGELOG、决策记录与 learnings。
- 不修改 Electron IPC、数据库/文件格式、PipelineEngine 写入合同或第三方依赖。
