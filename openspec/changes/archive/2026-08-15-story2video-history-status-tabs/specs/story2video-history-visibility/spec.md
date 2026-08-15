## MODIFIED Requirements

### Requirement: 未完成任务优先展示
历史列表 SHALL 保留 running、paused、failed、completed 与 cancelled 等全部可见任务，并在“全部”及任一状态筛选结果中统一按有效更新时间倒序展示，不再按状态分组或提升未完成任务优先级。

有效更新时间 SHALL 按 `updatedAt`、`updated_at`、`completedAt`、`completed_at`、`endedAt`、`ended_at`、`createdAt`、`created_at` 的顺序取第一个合法值。合法值包括可解析的 ISO 日期字符串与有限 epoch 数值；`null`、`undefined`、空白字符串、非有限数值和无法解析的日期均视为缺失。所有字段均缺失时，有效时间为 `0` 并排在有合法时间的任务之后。

有效更新时间相同的任务 SHALL 继续按合法创建时间倒序比较；创建时间仍相同时 SHALL 按 `id`、`projectId`、`runId` 的第一个非空稳定身份进行确定性字典序比较，从而使重复加载和轮询刷新不产生随机换位。

#### Scenario: 不同状态任务按更新时间混排
- **WHEN** 历史数据同时包含较新的 completed 项目、较旧的 running 任务与更旧的 failed 任务
- **THEN** 系统按有效更新时间从新到旧展示 completed、running、failed，不以状态优先级重排

#### Scenario: 失败任务与已完成项目同时存在
- **WHEN** 历史数据包含 failed run、paused run 和 completed projects
- **THEN** 所有任务按有效更新时间倒序混排；failed/paused 不因状态自动置顶，且同一筛选结果内保持相同排序规则

#### Scenario: 状态筛选沿用相同排序
- **WHEN** 用户切换到任一状态标签且该状态包含多个任务
- **THEN** 筛选结果继续按相同的有效更新时间规则倒序展示

#### Scenario: 字段回退与非法值
- **WHEN** 一项任务的 `updatedAt` 为空或非法但 `ended_at` 合法，另一项任务的所有候选时间均缺失
- **THEN** 第一项使用 `ended_at` 排序，第二项以时间 `0` 排在有合法时间的任务之后

#### Scenario: epoch 与同值稳定排序
- **WHEN** 历史数据包含 epoch 时间且多项任务的有效更新时间相同
- **THEN** epoch 时间被正确比较，同值任务依次用创建时间和稳定身份打破平局，并在重复刷新后保持顺序不变

#### Scenario: 轮询更新重新排序
- **WHEN** 运行中任务经轮询获得更晚的更新时间
- **THEN** 当前筛选结果在数据更新后重新计算排序并将该任务移动到正确位置
