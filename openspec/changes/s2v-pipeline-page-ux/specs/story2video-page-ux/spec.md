## Purpose

视频创作 SHALL use one consistent launch/history/editor workflow. Long-form pages SHALL keep their primary action area visible while content scrolls, and history SHALL expose enough localized task information to identify and recover/edit a video task.

## ADDED Requirements

### Requirement: 页面术语与路由统一

“流水线启动页” SHALL refer to the /create view after a pipeline is selected. “视频任务编辑页” SHALL refer to /create/result?project=<projectId> and SHALL be the destination for eligible history detail/edit actions. /create/history SHALL redirect to /create?view=history.

#### Scenario: 从历史记录进入编辑页

- WHEN a non-cancelled history item contains a valid projectId
- THEN selecting its card or its edit action opens the video task editor and does not open a legacy detail modal

#### Scenario: 纯 run 记录不可伪造编辑页

- WHEN a history item has no projectId
- THEN the item does not navigate to the editor and exposes only actions supported by the run record, such as resume or delete

### Requirement: 固定操作区域

The launch page SHALL keep start/pause/resume/cancel actions in a fixed bottom bar. Once a pipeline is running, its stage progress SHALL remain sticky at the top of the scrollable content. The editor SHALL keep save/recompose actions in a fixed bottom bar and reserve equivalent content padding. When it is opened with a running run ID, the editor header SHALL also expose the same validated pause action.

#### Scenario: 长配置页仍可启动或取消

- WHEN the user scrolls the launch page configuration or history content
- THEN the launch action bar remains visible and its buttons remain operable without returning to the bottom

#### Scenario: 运行中进度保持可见

- WHEN the selected pipeline is running and the user scrolls the page body
- THEN the stage progress stays at the top of the content region and reflects the latest status

#### Scenario: 编辑页底部动作不遮挡内容

- WHEN an editor has one or more segments and the viewport is narrow
- THEN the fixed action bar remains visible, its buttons do not overlap, and the last segment can be scrolled above the bar

#### Scenario: 编辑页暂停运行中的任务

- WHEN the video task editor is opened with a running run ID and the user selects pause
- THEN it calls the validated pause IPC, refreshes the run status to paused, and preserves the editor's segment data

### Requirement: 历史卡片统一信息合同

Every status tab SHALL use the same card structure and width. Each card SHALL show a localized task title, text preview, updated time, created time when available, duration, task/run ID, project ID when available, pipeline name, video duration when available, and status. Paused cards SHALL additionally show paused stage/environment. Failed cards SHALL additionally show failed stage and a localized natural-language failure reason.

#### Scenario: 标题回退识别任务

- WHEN a history item has an empty publish title
- THEN the card title uses the first source-text characters up to the configured preview limit, and then the pipeline name or localized untitled fallback

#### Scenario: 失败信息不泄露技术细节

- WHEN a failed item contains provider JSON, status codes, or stack-like text
- THEN the card labels the field “失败原因/Failure reason” and renders the stable localized explanation, not raw technical payload

#### Scenario: 所有状态可删除

- WHEN a card is rendered under any history status filter, including running, paused, failed, completed or cancelled
- THEN a delete action is available and does not trigger card navigation

### Requirement: Run deletion and pause persistence

The delete-run IPC SHALL accept only a trimmed non-empty string run ID and SHALL reject deletion of a running run. Successful deletion SHALL remove the run, name index, history entry and persisted snapshot. Pause/resume SHALL reject malformed stage data, and persistence failure SHALL leave the original state intact.

#### Scenario: 删除纯 run 记录

- WHEN a non-running run record is deleted with a valid run ID
- THEN the in-memory run, duplicate name index, history entry and persisted snapshot are removed together

#### Scenario: 运行中任务删除被拒绝

- WHEN a delete request targets a run whose status is running
- THEN the IPC returns a structured error and the run remains visible and resumable

#### Scenario: 暂停持久化失败回滚

- WHEN saving a paused snapshot fails after the in-memory pause preparation
- THEN status, current stage and checkpoint return to their pre-pause values and the caller receives an error

### Requirement: 编辑页分段与素材交互

The editor SHALL treat a project with a non-empty segment list as editable even when its final video path is absent. It SHALL provide segment number shortcuts and previous/next navigation. Scene-material “Generate video” SHALL use the segment video prompt; the duplicate button below the prompt and image/video retry buttons SHALL not be rendered.

#### Scenario: 定位长任务分段

- WHEN the user selects a segment number or previous/next control
- THEN the corresponding segment is scrolled into view, highlighted, and boundary controls are disabled at the first/last segment

#### Scenario: 无成片任务继续编辑

- WHEN a project has segments but no final video path
- THEN the editor shows the segment editing area and allows save/recompose instead of showing only an empty state

#### Scenario: 视频提示词生成素材

- WHEN a segment has a non-empty video prompt and the user clicks “生成 AI 视频” in scene materials
- THEN the video-generation action uses that prompt; when the prompt is empty the action is disabled with a localized hint

### Requirement: Voice catalog and speed control

The editor SHALL present voice as a catalog-backed select when provider/model context and a non-empty catalog are available. It SHALL preserve an existing voice ID not present in the catalog as an explicit option. If catalog loading fails or context is incomplete, it SHALL retain a text input fallback and show a localized non-blocking hint. Speed SHALL be a 0.5..2.0 range with 0.1 step.

#### Scenario: 音色目录不可用时不阻断编辑

- WHEN the voice catalog request fails or returns no usable entries
- THEN the user can still edit/save the voice ID through the fallback input and sees a localized availability hint

#### Scenario: 保存未知历史音色

- WHEN a saved segment voice ID is absent from the current catalog
- THEN the select keeps that ID as a selectable retained option and does not silently replace it

### Requirement: Navigation controls

All pages SHALL continue to use the shared top address navigation back/forward controls. The editor’s explicit “返回/Back” action SHALL navigate to the history view.

#### Scenario: 返回历史记录

- WHEN the user clicks the editor’s “返回” action
- THEN the router navigates to /create?view=history

## MODIFIED Requirements

### Requirement: Localized terminology

All new or changed user-visible strings SHALL exist in both apps/desktop/src/locales/zh.js and apps/desktop/src/locales/en.js. Program comments and PRD terminology SHALL call the launch view “流水线启动页” and the result editor “视频任务编辑页”; “视频任务详情页” SHALL not describe a separate modal.

#### Scenario: Locale pairs stay synchronized

- WHEN the feature is built or tested
- THEN locale pair and CJK checks pass without adding renderer hard-coded Chinese strings
