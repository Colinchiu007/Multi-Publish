## Context

现状链路（latest main）：
- 编辑：历史记录 →【编辑并重新合成】→ `/create/result?project=...` → `ResultView` 分段编辑（text/prompt/videoPrompt/字幕/语音字段），改动只置 `segmentsDirty`；持久化唯一入口为【保存分段】(`story2videoUpdateSegments`) 与重新生成/重新合成前的自动保存。
- 详情：历史详情弹窗 `detailScenes` 只读列表 `truncate(scene.text || scene.prompt || '', 60)`——图片提示词（最多 2000 字符）在详情里被 60 字符硬截，且与旁白二选一展示。
- 缺口：`ResultView` 无 `beforeRouteLeave`，dirty 状态下返回历史/流水线列表静默丢修改；编辑区无「未保存」可见提示（页面标题栏 `project.dirty` 徽标是服务端落库标记，语义不同）。

## Selected Approach

1. **详情列表完整展示**：`CreateViewHistory.vue` `detailScenes` 每项渲染两个字段行（有值才渲染）：「旁白」=`text`、「画面提示词」=`prompt`；移除 `truncate(..., 60)`，CSS `white-space: normal; word-break: break-word`，列表容器保留 `max-height + overflow-y: auto`（长文滚动查看）。历史卡片预览 `truncate(..., 120)` 保持（预览语义）。
2. **未保存可见性**：`ResultView` 分段编辑 `section-heading` 增加 `<span v-if="segmentsDirty" data-testid="segments-unsaved-chip">{{ $t('story2video.sceneMaterial.unsavedChanges') }}</span>`。
3. **离开守卫**：Options API `beforeRouteLeave(to, from, next)`：
   - `!segmentsDirty` → `next()`；
   - dirty → `next(false)` 挂起，记录 `pendingLeave = { to, from, next }`，打开 `unsavedLeaveDialog`（UiModal，三按钮）；
   - 【保存并离开】→ `await saveSegments()`（失败自动留在页内并提示，不导航）→ 成功 `pendingLeave.next()`；
   - 【不保存离开】→ `pendingLeave.next()`（不调 saveSegments）；
   - 【取消】→ 关闭弹窗、清空 pendingLeave。
   - 页面销毁（unmounted）时若仍有 pendingLeave，调用 `next(false)` 兜底，避免守卫悬挂。
4. **文案**：`locales/zh.js` + `en.js` 新增 `story2video.sceneMaterial.unsavedChanges`、`unsavedLeaveTitle`、`unsavedLeaveMessage`、`saveAndLeave`、`discardAndLeave`、`cancel`（cancel 若无既有键则新增）。模板一律 `$t(...)`，不新增中文字面量。

## Alternatives Considered

- **原生 `window.confirm`**：实现最简但样式割裂、无法区分"保存并离开/不保存/取消"三动作；否决。
- **自动保存（input 防抖落库）**：与主进程写队列/重新生成语义耦合，频繁写盘且违背「保存分段」显式确认设计；本次只做「离开前强制确认」，不改变保存模型。
- **仅加 dirty 提示不加守卫**：无法阻止静默丢失；否决。
- **守卫内自动保存后直接离开**：保存失败时行为不可控（需留在页内提示），且用户可能想放弃修改；三选一更符合既有交互（PRD 3.1.29 的保存分段语义）。

## Risks

- 保存并离开时 `saveSegments` 失败：留在页内并展示既有失败通知（OPERATION_FAILED），不丢编辑态。
- 与「重新生成前自动保存」并存：守卫只处理路由离开，不改变既有自动保存路径，无双写。
- 测试挂起：unmounted 兜底 `next(false)` 防止 vitest 中守卫回调悬挂。
