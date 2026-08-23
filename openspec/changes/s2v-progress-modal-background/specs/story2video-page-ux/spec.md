## MODIFIED Requirements

### Requirement: 固定操作区域

The launch page SHALL keep start/pause/resume/cancel/background actions in a fixed bottom bar. When a pipeline is running, its complete stage progress SHALL be shown in the unified progress modal rather than embedded in the page body. The modal SHALL leave the fixed action bar operable and SHALL reserve equivalent content padding. The editor SHALL keep save/recompose actions in a fixed bottom bar and reserve equivalent content padding. When it is opened with a running run ID, the editor header SHALL also expose the same validated pause action.

#### Scenario: 长配置页仍可启动或取消

- **WHEN** the user scrolls the launch page configuration or history content
- **THEN** the launch action bar remains visible and its buttons remain operable without returning to the bottom

#### Scenario: 运行中进度统一在弹窗

- **WHEN** the selected pipeline is running and the user starts or resumes foreground tracking
- **THEN** the unified progress modal opens with all available stages, while the launch page body does not render a duplicate inline progress region

#### Scenario: 弹窗打开时操作条不被遮挡

- **WHEN** the progress modal is visible
- **THEN** the fixed action bar remains above the modal overlay for pointer interaction, and pause/resume/cancel/background actions remain clickable

#### Scenario: 编辑页底部动作不遮挡内容

- **WHEN** an editor has one or more segments and the viewport is narrow
- **THEN** the fixed action bar remains visible, its buttons do not overlap, and the last segment can be scrolled above the bar

#### Scenario: 编辑页暂停运行中的任务

- **WHEN** the video task editor is opened with a running run ID and the user selects pause
- **THEN** it calls the validated pause IPC, refreshes the run status to paused, and preserves the editor's segment data
#### Scenario: 运行中进度保持可见

- **WHEN** the selected pipeline is running and the user scrolls the page body
- **THEN** the progress remains available in the open unified modal and reflects the latest status without restoring an inline progress region

#### Scenario: 人工检查点保留在弹窗内

- **WHEN** the run is waiting for scene asset selection, content policy revision, or another user checkpoint
- **THEN** the modal keeps the checkpoint message and its confirm/edit/cancel controls visible; background and close are disabled until the user action is completed
