## Why

Multi-Publish 桌面端（Vue 3 + Electron）现有 UI 以蓝紫主题（`--primary: #5048E5`）和嵌套卡片为主，高密度运营页面（发布、账号、任务记录）视觉噪音大、扫描效率低。远程 Stitch 已产出 Apple 风格（precision minimalism）Design System 与 `/publish` 优化稿，但尚未落地到本地 renderer 代码。本次将 Stitch 设计系统转为可持续的本地设计 token 与组件基线，并以 `/publish` 为第一切片验证，再扩展到历史与账号页。

## What Changes

- 新增 Apple 风格设计 token 层（中性色/石墨、间距 4px 节奏、圆角 8-12px、字体 Inter+PingFang SC、状态色 + 图标双重通道），与现有 `cohere-design-system.css` 兼容共存，不删除旧 token。
- 调整 `/publish` 页面信息架构：编辑器为主区域，发布目标/账号为次级面板，低频 AI/模板/标签/平台覆盖功能折叠，主操作固定在可见操作区。
- 调整共享组件（UiButton/UiInput/UiCard/UiBadge 等）的视觉默认值，保持现有 props/emits API 不变（非 BREAKING）。
- 建立页面状态视觉规范：空、加载、校验错误、发布中、成功、失败、重试；状态必须文字+图标，不只靠颜色。
- 扩展视觉回归基线覆盖 `/publish` 关键状态，作为后续页面落地的质量门禁。

## Capabilities

### New Capabilities
- `desktop/design-language`: 定义 Multi-Publish 桌面端设计语言契约 — token（颜色/间距/圆角/字体/阴影）、组件视觉默认值、布局原则、状态视觉规范、暗色模式语义映射。这是后续所有页面 UI 落地的规格源。

### Modified Capabilities
- 无既有 spec 需要修改（`ui-i18n-p2` 只约束文案同步，不涉及视觉语言；本次不改变任何用户可见文案或 i18n 契约）。

## Impact

- 受影响代码：`apps/desktop/src/styles/cohere-design-system.css`（token 追加）、`apps/desktop/src/components/Ui*.vue`（视觉默认值）、`apps/desktop/src/views/Publish.vue` 及其 feature/composable 组合（布局重组）、视觉回归测试（`tests/visual-testing/`）。
- 不改变：发布 API/IPC/Store 数据契约、payload 形状、账号认证、状态语义。
- 依赖：无新增第三方依赖。
- 风险：中 — 修改现有 UI 行为，需组件/路由测试 + 像素/OCR 视觉回归 + 打包验证。
