## ADDED Requirements

### Requirement: 检查点等待态语义展示
流水线到达 `scene_asset_selection` 检查点暂停时，进度区对应阶段 SHALL 显示「等待用户操作」语义（图标 ⏸、waiting 样式、本地化标签），不得渲染原始 `paused` 字符串；手动暂停（无该 checkpoint）SHALL 保持「已暂停」语义与既有继续/暂停按钮。

#### Scenario: 分镜素材自选检查点激活
- **WHEN** run 处于 `scene_asset_selection` 检查点且阶段 status 为 `paused`
- **THEN** 该阶段显示等待选择素材的图标/样式/标签（zh/en 成对），且阶段样式为醒目 waiting 态而非灰色 pending

#### Scenario: 手动暂停语义不回归
- **WHEN** 用户手动暂停且 checkpoint 类型不是 `scene_asset_selection`
- **THEN** 阶段显示「已暂停」，运行控制区保留「▶ 继续」按钮

### Requirement: 检查点激活注意力引导
`scene_asset_selection` 检查点激活时，界面 SHALL 在进度区下方显示引导横幅（含场景总数与「去选择素材」按钮），点击按钮 SHALL 滚动到素材选择面板；首次激活 SHALL 自动滚动面板到可视区并短暂高亮，且不重复打扰用户。

#### Scenario: 横幅与按钮
- **WHEN** `sceneAssetSelectionActive` 为 true 且存在候选素材
- **THEN** StageProgress 下方出现横幅：文案含「请为每个分镜选择最终素材」与场景总数，含「去选择素材」按钮；点击后面板进入可视区并出现 attention 高亮

#### Scenario: 首次自动定位
- **WHEN** 检查点第一次激活
- **THEN** 自动执行一次滚动定位到面板（block:center）并附加短时高亮；后续轮询刷新不再重复滚动

### Requirement: 运行控制区等待状态与取消兜底
检查点激活期间，运行控制区 SHALL 显示等待文案且不隐藏操作入口；取消操作 SHALL 经二次确认后才执行。

#### Scenario: 等待文案与入口常显
- **WHEN** 检查点激活且 `orchestrationRunId` 存在
- **THEN** 运行控制区显示「等待您选择分镜素材…」文案，确认选择按钮常显可用，暂停/继续按钮保持既有可用性规则

#### Scenario: 取消二次确认
- **WHEN** 检查点激活期间点击「✕ 取消」
- **THEN** 弹出二次确认（文案说明将终止本次创作且候选素材不保留）；确认后执行取消，取消则关闭对话框不终止

### Requirement: 面板位置与可访问性
检查点激活时素材选择面板 SHALL 渲染在进度区下方（而非页面底部 action-bar）；新增用户可见文案 SHALL zh/en 成对存在于 locales，测试断言使用 testid 与用户可见文本。

#### Scenario: 面板就近展示
- **WHEN** `sceneAssetSelectionActive` 为 true
- **THEN** SceneAssetSelection 渲染在 StageProgress 之后、输入区之前，与进度区同屏可及

#### Scenario: locale 成对与可测性
- **WHEN** 检查点相关新增文案在 zh.js 增加
- **THEN** en.js 同步存在对应键（CI Gate 7），组件测试通过 data-testid 断言状态与交互