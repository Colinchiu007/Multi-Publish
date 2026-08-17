## Why

视频创作的流水线启动、历史记录和任务编辑体验目前把操作入口放在可滚动内容中，用户在长配置或多分段任务中需要反复滚动才能继续操作；历史记录不同状态的卡片结构也不一致，失败原因包含实现细节，用户难以判断任务对象和下一步动作。页面名称、详情入口和编辑入口同时存在，进一步增加了导航歧义。

## What Changes

- 将进入视频创作后选择流水线打开的页面统一称为“流水线启动页”，底部启动/暂停/继续/取消操作固定在视口底部，运行后的阶段进度固定在内容顶部。
- 将“视频任务详情页”统一定义为视频任务编辑页；历史记录中的详情/编辑入口直接进入编辑页，移除旧详情弹窗语义，返回按钮回到历史记录。
- 统一历史记录各状态标签的卡片结构和宽度，所有状态展示任务标题、文案摘要、创建/更新时间、耗时、任务 ID、项目 ID、流水线、时长和状态；暂停/失败增加阶段字段，失败展示本地化自然语言失败原因。
- 为所有历史状态补齐删除入口；项目记录删除项目，纯 run 记录通过受校验的 pipeline:delete-run 清理内存、历史和持久化快照。
- 在编辑页增加分段数字跳转与上一条/下一条；将分段保存和合成操作固定到底部；场景素材中的“生成视频”使用视频提示词生成 AI 视频；音色使用目录下拉并保留目录不可用时的输入回退，语速使用范围滑条。
- 同步中英文 locale、术语表、PRD、实现注释、OpenSpec 和质量复盘文档。

## Capabilities

### New Capabilities

- story2video-page-ux：固定操作区、统一页面术语、历史卡片合同、编辑页分段导航及素材/音色交互。
- pipeline-run-delete：对无项目流水线 run 记录执行受保护删除，并保持状态持久化一致性。

### Modified Capabilities

- story2video-history：历史详情入口、卡片字段、失败原因和删除动作统一。
- story2video-result-editor：结果页作为任务编辑页，支持无成片任务编辑和固定底部操作条。

## Impact

- Renderer：CreateView.vue、CreateViewHistory.vue、ResultView.vue、路由、样式、locale、视觉/E2E 合同。
- Main process：pipeline pause/delete IPC、run-state 持久化回滚与删除一致性。
- 文档：01-docs/PRD.md、01-docs/PRD-video-creation.md、CHANGELOG.md、learnings.md、i18n-glossary.md。
- 交付风险：固定操作条需要覆盖窄屏和 sidebar 宽度；IPC 变更需要打包验证；删除/暂停失败必须 fail closed 并保留原快照。
