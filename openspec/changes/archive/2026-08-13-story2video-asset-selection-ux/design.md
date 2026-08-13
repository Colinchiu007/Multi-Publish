## Context

基线（.ccg/tasks/story2video-asset-selection-ux/task.json）为 M 复杂度 / 中风险前端 UX 任务。差异审计确认 manual 模式链路已交付，本 design 只固化「等待态展示 + 注意力引导」的实现层设计。

## Goals / Non-Goals

**Goals:**
- 检查点激活时进度区明确显示「等待用户选择素材」，杜绝原始 `paused` 字符串
- 提供横幅 + 按钮 + 自动滚动/高亮三重注意力引导，用户不需要主动发现面板
- 等待期间运行控制区有状态文案、主操作入口常显、取消需二次确认
- 面板位置上移到进度区下方，缩短视线跳跃
- 新增文案 zh/en 成对，测试覆盖状态渲染与交互

**Non-Goals:**
- 不改变引擎侧 paused 状态值、paused 快照/断点恢复契约（渲染层归一）
- 不引入事件推送替代 3s 轮询（保持现有轮询，避免扩大范围）
- 不重做面板内部选择交互与校验契约（SceneAssetSelection 校验/默认选中逻辑保持）
- 不改动 confirmSceneAssets IPC 契约

## Decisions

**D1: 阶段状态渲染层归一（不动引擎）**
- StageProgress 增加 `paused` 状态：class `waiting`、图标 `⏸`、标签「等待确认」
- 新增 `checkpoint` prop；当 `checkpoint.type === 'scene_asset_selection'` 时标签升级为「等待选择素材」
- 手动暂停（无 scene_asset_selection checkpoint）保持「已暂停」语义，原「继续/暂停」按钮不受影响
- 标签文案走 i18n（zh/en 成对），非 locales 文件不新增中文字符串字面量

**D2: 引导横幅（StageProgress 下方）**
- `sceneAssetSelectionActive === true` 时渲染 banner：文案「分镜素材已生成，请为每个分镜选择最终素材（共 N 个场景）」
- 主按钮「去选择素材」→ `scrollIntoView` 到面板并触发高亮；banner 带 data-testid 与 role="status"

**D3: 首次激活自动定位 + 高亮**
- watch `sceneAssetSelectionActive` 首次变 true 时（`selectionGuided` 一次性标记），nextTick 后自动滚动面板到可视区（block:center）
- 面板容器短暂附加 attention 高亮 class（约 2s 后清除），不重复打扰

**D4: 运行控制区状态与取消兜底**
- 检查点激活时运行控制区显示「⏳ 等待您选择分镜素材…」（i18n），确认按钮常显
- 「✕ 取消」触发二次确认对话框：确认后调用既有 cancelPipeline；取消关闭对话框

**D5: 面板位置提升**
- SceneAssetSelection 从 `.running-controls`（底部 action-bar）移到 StageProgress 之后、输入区之前（`pipeline-detail` 内）
- 保留 action-bar 的取消按钮与等待文案；面板自带场景数/提示/确认按钮

**D6: 文案与可访问性**
- 所有新增用户可见文案走 locales zh/en 成对（CI Gate 7 locale-sync 校验）
- banner 使用 role="status"；面板滚动后 focus 到面板容器（非侵入）

## Risks / Trade-offs

- [移动面板位置破坏既有测试/布局] → CreateView.test.js 与 SceneAssetSelection.test.js 同步更新；面板 testid 不变，仅 DOM 位置变化
- [paused 状态被其他流程复用] → 以 checkpoint.type 区分「等待选择」与「手动暂停」，手动暂停视觉与按钮语义不回归
- [自动滚动干扰用户] → 仅首次激活滚动 + 短时高亮，之后不再打扰；用户手动滚动后不强制拉回
- [i18n 遗漏] → 新增文案全部经 zh/en 键引用，测试断言断言成对存在