# story2video-resume-gating Specification

## Purpose

在既有恢复门控与不可恢复原因提示（PR #876）之上，为内容政策类失败任务补齐「修改文案后重新生成」的操作入口与场景定位契约：用户可从历史卡片/详情一键进入结果页、定位被拦截场景、修改文案后重新合成，等价实现断点续跑。

## ADDED Requirements

### Requirement: 政策失败任务的「修改场景文案并重新生成」操作入口

系统 SHALL 对 `status === 'failed'`、存在 `projectId`、且错误文本命中 `RESUME_BLOCKING_ERROR_PATTERN`（不可恢复门控，与恢复判定同源）的历史任务，在历史卡片操作区与详情弹窗 footer 展示按钮「修改场景文案并重新生成」（zh）/ "Edit scenes & regenerate"（en）；点击 SHALL 复用既有 `open-result` 链路跳转 `/create/result?project=<projectId>` 结果页。无 `projectId` 的政策失败、可恢复失败、running/paused/completed/cancelled 任务 SHALL 不显示该按钮；`completed` 任务保留既有「编辑并重新合成」按钮。按钮展示条件 SHALL 与不可恢复提示（`policyResumeHintFor`）同源，避免门控判断漂移。

#### Scenario: 政策失败且有项目可编辑
- **WHEN** 历史任务 `status='failed'`、`projectId='p-1'`、error 命中内容政策门控
- **THEN** 卡片操作区与详情弹窗 footer 显示「修改场景文案并重新生成」按钮，点击后组件发出 `open-result` 事件并携带该任务

#### Scenario: 政策失败但无项目
- **WHEN** 历史任务 `status='failed'`、无 `projectId`（如非 story2video 流水线 run）、error 命中内容政策门控
- **THEN** 显示不可恢复提示但不显示「修改场景文案并重新生成」按钮（无可编辑项目）
- **AND** 不提供「从断点继续」按钮（门控保持）

#### Scenario: 可恢复失败不受影响
- **WHEN** 历史任务 `status='failed'` 且 error 不命中门控（可恢复）
- **THEN** 不显示「修改场景文案并重新生成」按钮，「从断点继续」按钮正常显示

### Requirement: focusScenes 场景定位契约

系统 SHALL 在政策失败任务（上述操作入口触发的跳转）中，于结果页路由 query 附加 `focusScenes`：值为升序、去重、区间展开为逐号的 1-based 场景号，以半角逗号分隔（如 `focusScenes=49,73,74`）；场景号 SHALL 与 `contentPolicyScenes` 同源提取（`Image #N` 段内命中门控关键字，N 即 `segments` 下标 + 1）。结果页 SHALL 依据 `focusScenes` 将 `segments[sceneNumber-1]` 的目标分段标记为「内容政策需修改」（`data-testid="segment-policy-flag"` 徽标 + 高亮样式）；无 `focusScenes`、号码非正整数或超过分段数时 SHALL 不渲染任何徽标（安全降级），且不得影响其他结果页功能。非政策失败任务的既有跳转 SHALL 不携带 `focusScenes`。

#### Scenario: 携带场景号跳转并在结果页定位
- **WHEN** 用户点击政策失败任务（error 含 "Image #49 ... Image #73 ... Image #74" 门控失败）的「修改场景文案并重新生成」
- **THEN** 跳转 query 为 `/create/result?project=<id>&focusScenes=49,73,74`，结果页 `segments[48]`、`segments[72]`、`segments[73]` 显示「内容政策需修改」徽标

#### Scenario: 无 focusScenes 时无徽标
- **WHEN** 结果页以 `?project=<id>`（无 `focusScenes`）打开，或 `focusScenes` 号码超出分段数
- **THEN** 不渲染任何「内容政策需修改」徽标，页面其余功能正常

#### Scenario: 可恢复/非政策任务不携带 focusScenes
- **WHEN** 用户点击可恢复失败任务的「从断点继续」，或 `completed` 任务的「编辑并重新合成」
- **THEN** 跳转不携带 `focusScenes` query
