## Why

视频发布页（单篇模式）右栏自上而下堆叠了三个智能辅助面板（智能标签建议、最佳发布时间、标题助手），把真正的任务闭环区（发布目标 + 快速发布按钮）挤到折叠线以下。1920×1140 实测截图取证：左栏表单在约 63% 视口高度处结束后留下约 37% 的大面积空白，右栏却溢出视口需要滚动，「快速发布」按钮首屏不可见；「最佳发布时间」以整卡占位展示「数据不足」死胡同文案；标签建议硬编码 5 个平台，与用户实际勾选的发布目标（如快手）不联动，为未选平台消耗最显眼的屏幕空间。核心矛盾：辅助信息优先级高于主行动，左右两栏高度严重失衡。

## What Changes

- **右栏只留任务闭环**：发布目标卡（含保存草稿/草稿箱/快速发布/取消任务）成为右栏第一块并保持 sticky；发布进度、发布结果、草稿箱面板紧随其后。辅助面板全部移出右栏。
- **智能面板下移左栏、贴邻所服务的字段**：标签建议移到「标签/话题」输入区旁；最佳发布时间移到「定时发布」字段旁；标题助手入口移到标题输入区旁。左栏 37% 空白被利用，右栏不再溢出。
- **平台联动（标签建议）**：TagSuggester 的 `platforms` 参数由硬编码 `['zhihu','weibo','xiaohongshu','bilibili','toutiao']` 改为跟随 `selectedPlatforms`；未选平台时回退全量目录，避免空面板。
- **标签点击填入**：建议标签可点击，一键追加进「标签」输入框（去重、保持现有逗号分隔格式）。
- **空态收敛**：「数据不足」「分析失败」等无行动价值的空态从整卡展示降级为一行可展开的提示行，不再占用卡片级空间。
- **显隐记忆**：智能面板的展开/收起状态写入 localStorage，刷新后保持用户上次选择。
- **布局跳动（CLS）治理**：面板骨架与加载结果等高占位，显隐阈值统一，输入过程中右栏不再因面板弹出/消失而跳动。

不改动：批量模式布局、发布流程逻辑（usePublishFlow/useBatchPublish）、平台选择器组件（PublishTargetSelector）内部行为。

## Capabilities

### New Capabilities

- `publish-page-right-rail`: 发布页右栏信息架构与智能辅助面板行为契约——右栏任务闭环优先顺序、智能面板贴邻字段放置、标签建议平台联动、标签点击填入、空态折叠、显隐记忆。

### Modified Capabilities

- `mp-ue-closure`: 「发布页主操作可见」Requirement 强化——主操作区从「滚动时 sticky 可见」升级为「初始视口内无需滚动即可见（右栏第一块）」，sticky 保留为滚动时的兜底行为；窄屏场景不变。

## Impact

- `apps/desktop/src/views/Publish.vue`：flex-side 重排（闭环区置顶）、三个面板迁移至 flex-main 对应字段旁、localStorage 显隐记忆、TagSuggester 平台参数联动。
- `apps/desktop/src/components/TagSuggester.vue`：新增 `platforms` prop 与标签点击 `apply` 事件；空态/错误态收敛为一行提示。
- `apps/desktop/src/components/OptimalTimeTip.vue`：「数据不足」空态降级为可展开提示行。
- `apps/desktop/src/components/TitleAssistantPanel.vue`：**本 change 不修改该组件**（并发分支 fix-title-assistant-relevance 正在改它，位置迁移在 Publish.vue 层完成以避免冲突）。
- `apps/desktop/src/locales/zh.js` + `en.js`：新增文案成对提交（`publishPage.*` 命名空间，避开并发分支的 `intelligence.*` 键）。
- 测试同步：`Publish.test.js`、`TagSuggester.test.js`、`OptimalTimeTip.test.js`、`views-deep2.test.js`、`views-coverage.test.js`、`icon-usage.test.js`；发布页视觉回归基线更新。
- 风险与协调：与并发分支 `fix-title-assistant-relevance`（TitleAssistantPanel.vue + locales）存在文件级并行，本 change 通过「不碰该组件 + locale 键命名空间隔离」将合并冲突降为可自动合并。
