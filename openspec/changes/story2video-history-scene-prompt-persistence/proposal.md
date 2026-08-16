## Why

「视频创作-历史记录」场景内容编辑（3.1.29 / PR #854）与图片提示词上限放开（PR #887）落地后，用户原始两个问题仍有残余：

1. **显示截断观感**：历史详情弹窗的只读场景列表把 `text || prompt` 统一硬截到 60 字符（`CreateViewHistory.vue detailScenes` + `truncate(..., 60)`）。2000 字符的图片提示词在详情里看起来"内容被截断"；且该列表只展示 `text || prompt` 二选一，图片提示词（prompt）与旁白（text）混在一起，用户无法确认完整内容。
2. **保存机制缺口**：结果页分段编辑（`ResultView`）修改 `text/prompt/videoPrompt` 等字段只置 `segmentsDirty`，唯一持久化入口是【保存分段】按钮与「重新生成/重新合成前自动保存」；**没有任何路由离开守卫**——用户改完直接返回历史/流水线列表时，未保存修改静默丢失，与"没有自动保存、也没有保存按钮"的观感一致（旧构建还没有 3.1.29 的保存分段按钮，本次在最新 main 上收口保存可见性与防丢）。

目标：历史详情/编辑视图完整展示图片提示词；编辑未保存状态可见，离开页面时强制确认（保存/不保存/取消），杜绝静默丢修改。

## What Changes

- **详情弹窗只读场景列表完整展示**：`CreateViewHistory.vue` 的 `detailScenes` 列表移除 60 字符硬截断；每项分两行展示「旁白」(`text`) 与「画面提示词」(`prompt`)（各字段独立成行、换行折行、列表整体滚动），字段存在才渲染；历史卡片行内预览（120 字符 + …）保持截断设计不变。
- **未保存修改可见性**：`ResultView.vue` 分段编辑区标题行新增「有未保存修改」提示（`segmentsDirty` 为真时显示，locale 键成对）；页面标题栏既有 `project.dirty`（服务端）徽标语义不变。
- **离开守卫（保存确认）**：`ResultView` 新增 `beforeRouteLeave`：`segmentsDirty` 时拦截并弹「未保存修改」确认框，三选一——【保存并离开】（先 `saveSegments()`，失败则留在当前页并提示）/【不保存离开】（放弃修改）/【取消】；未 dirty 时直接放行。保存/重新生成类操作前的既有自动保存语义不变。
- **文案**：新增用户可见文案走 locale 键（`story2video.sceneMaterial.unsavedChanges` / 离开确认三按钮），zh/en 成对，渲染源文件不新增中文字符串字面量。

## Capabilities

### New Capabilities

- `story2video-history-scene-prompt-persistence`: 历史记录场景提示词显示完整性与编辑保存可见性契约——详情只读列表完整展示 prompt/text；结果页未保存状态可见；离开页面强制保存确认，未保存修改不静默丢失。

### Modified Capabilities

- 无（复用既有 `story2video:update-segments` IPC 与 `updateSegments` 白名单/串行队列，不新增主进程能力）。

## Impact

- **代码**：`apps/desktop/src/views/ResultView.vue`、`apps/desktop/src/views/CreateViewHistory.vue`、`apps/desktop/src/locales/zh.js`、`apps/desktop/src/locales/en.js`。
- **测试**：`ResultView.test.js`（dirty 提示渲染、离开拦截三动作、保存失败不离开）、`CreateViewHistory.test.js`（详情列表完整展示、text/prompt 分行）、`check-locale-sync` CI Gate 7、CJK 硬编码基线（无新增字面量）。
- **文档**：`01-docs/CHANGELOG.md`、`01-docs/PRD-video-creation.md`（3.1.29 补充说明）、本 change 的 specs/design/tasks。
- **不涉及**：主进程服务/IPC/存储契约（updateSegments 已持久化 prompt，20000 限长不变）、流水线执行器、图片/视频生成、数据库。
