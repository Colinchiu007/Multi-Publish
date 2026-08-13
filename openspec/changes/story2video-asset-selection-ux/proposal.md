## Why

Story2Video 全能创作「分镜素材自选」模式（creation.mode=manual）在流水线到达 `scene_asset_selection` 检查点时存在 UX 反馈缺口：引擎以 `paused` 状态表达「等待用户选择素材」，但前端进度区（StageProgress）没有 `paused` 状态映射，直接渲染原始英文 `paused` 字符串且样式回落到灰色待定；素材选择面板渲染在页面底部 action-bar（首屏之外），检查点激活时既无提示横幅、无自动滚动/高亮，运行控制区还把「继续/暂停」按钮隐藏，用户易误判为「出错/卡死」并在只有「取消」按钮可见的情况下误取消整条流水线。本轮在既有 manual 模式基线之上补齐等待态语义与注意力引导（M 复杂度 / 中风险，需规格化后进入实现）。

## What Changes

- 阶段状态语义展示：StageProgress 增加 `paused` →「等待确认/等待选择素材」映射（图标 ⏸、waiting 样式、i18n 文案 zh/en 成对），不再渲染原始 `paused` 字符串
- 检查点激活引导：StageProgress 下方渲染高对比横幅「分镜素材已生成，请选择（共 N 个场景）」+「去选择素材」按钮，点击滚动到面板并聚焦
- 首次激活自动定位：检查点首次出现时自动 `scrollIntoView` 面板到可视区并短暂高亮（一次性，不重复打扰）
- 运行控制区等待文案：检查点激活时显示「等待您选择分镜素材…」，不隐藏操作入口；「取消」增加二次确认
- 面板位置提升：SceneAssetSelection 渲染位置从底部 action-bar 上移到进度区下方，等待选择时用户视线不离开进度区
- 文档与 PRD 详细补充：数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字全部写入 PRD/learnings/CHANGELOG

## Capabilities

### New Capabilities
- `story2video-asset-selection-ux`: 分镜素材自选检查点 UX 反馈——paused 等待态语义展示、引导横幅与去选择按钮、自动滚动定位与高亮、运行控制区等待文案、取消二次确认、面板位置提升、zh/en 文案成对

### Modified Capabilities
<!-- 无既有 spec 需要修改（openspec/specs/ 当前仅 openspec-integration） -->

## Impact

- 涉及：apps/desktop/src/views/CreateView.vue、apps/desktop/src/views/video-creation/StageProgress.vue（+ stage-progress.css）、apps/desktop/src/views/video-creation/SceneAssetSelection.vue、apps/desktop/src/locales/zh.js/en.js、相关测试与文档
- 约束：引擎侧 `paused` 状态与 paused 持久化/断点恢复契约保持不变（渲染层归一，不引入新状态值）；新增用户可见文案必须 zh/en 成对（CI Gate 7）；测试断言用 testid + 用户可见文本（E2E 渲染语义要求）
- 差异审计（基线 vs 现状）：分镜素材自选完整链路（manual 模式配置、scene_asset_selection 检查点、candidates 产出、pipelineConfirmSceneAssets 校验、paused 断点恢复、选择面板渲染）已在 main 交付（2026-08-12/13，PRD 7.1.3a 与 CreateView.vue:798/2900 等证据）；本 change 仅承载「等待态展示 + 注意力引导」待办，不重复规格化已交付功能