# 前端编码规范（apps/desktop renderer）

> CCG Spec 回馈：本文件由前端开发任务沉淀而来，写入前请先阅读；新增经验按「模式 + 反例 + 强制点」追加。

## 1. 异步轮询/请求必须带「目标快照守卫」（2026-08-13，s2v-pipeline-background-run）

**模式**：任何「异步请求 + 可变当前目标」的前端代码（3s 轮询、竞态恢复、防抖后写回），发起时必须捕获目标标识快照，await 返回后校验当前标识 === 快照才写回状态或触发副作用。

**反例（真实 Bug 根因）**：`updateOrchestrationStatus` 轮询 `pipelineGetRunContext(runId)`，无守卫时——用户点击【后台运行】/取消/切换流水线清空 `orchestrationRunId` 后，在飞的响应仍无条件写回 context/stages，甚至触发 `applyOrchestrationOutcome` 跳转结果页 → 僵尸重挂 / 污染新 run。

**强制点**：
```js
async updateOrchestrationStatus() {
  if (!this.orchestrationRunId) return
  const runId = this.orchestrationRunId        // 目标快照
  try {
    const res = await pipelineGetRunContext(runId)
    if (this.orchestrationRunId !== runId) return   // 快照守卫
    // ... 写回
  } catch (e) {
    if (this.orchestrationRunId !== runId) return   // catch 同样守卫
    // ... 错误处理
  }
}
```

## 2. 「可逆脱离」类操作：模板 v-if 之外必须方法内重校验状态（2026-08-13）

**模式**：把当前任务转入后台/脱离详情页等「可逆操作」，仅靠模板条件渲染按钮不足——状态可能以其他形态呈现（检查点等待态以 running 呈现）。方法入口必须重校验业务守卫。

**反例**：点击【后台运行】仅依赖 `v-if="orchestrationRunId && status==='running'"`，若 `scene_asset_selection` 检查点等待态以 running 呈现，会把需人工输入的 run 转后台卡死。

**强制点**：方法入口同步重校验 `if (!this.orchestrationRunId || this.sceneAssetSelectionActive || this.needsCheckpoint) return`，且重置逻辑抽取为公共方法（与取消路径共用），保证「脱离」与「取消」的状态重置语义一致。

## 3. 用户可见文案铁律（i18n-content-sync）

- 新增用户可见文案一律写入 `apps/desktop/src/locales/zh.js` 与 `en.js` **成对**（CI Gate 7 拦截）；渲染端（.vue script/template）禁止新增中文字符串字面量（CJK 基线扫描按 `file:line` 匹配，新增行会触发误报 → 用 `node .github/scripts/check-locale-sync.js --cjk --update-baseline` 权威重排，但必须先确认「无真新增」）。
- 产品名词翻译集中维护于 `01-docs/i18n-glossary.md`，新增术语先登记再使用。
- **带参文案不得写成含 `{name}` 的普通字符串**：`i18n/index.js` 的 `toMessageFunctions` 会把静态字符串包成 `() => source`，`{name}` 不会在运行时插值，会原样显示成字面量。带参文案必须直接写 `(ctx) => ... + ctx.named('name') + ...`（zh/en 两侧一致），并加一条“标题/文本不含 `{name}` 字面量”的渲染断言。

## 5. 结果页层级错误隔离（2026-08-15，s2v-result-success-error-boundary）

**模式**：Story2Video 结果页对项目读取、成片 URL、旁白 URL 和场景素材 URL 分别处理；附加资源失败不能否定已完成的成片。

**强制点**：完成事件必须在项目持久化成功后发送；持久化失败发送失败终态；成片缺失使用预览缺失提示，播放器加载失败使用预览级提示。

## 4. Story2Video 合成错误映射

Story2Video compose 的用户可见错误必须优先使用稳定消息键，而不是把后端技术错误文本直接交给 renderer：

- 总时长超限使用 story2video.compose_duration_exceeded；单段旁白超限使用 story2video.compose_segment_duration_exceeded；concat、xfade、旁白、BGM、WebM 或输出校验超时使用 story2video.compose_timeout。
- 主进程负责把 execFile 的 timeout 终止归一成带阶段语义的 ETIMEDOUT；前端只做兼容识别，不依赖某一种 stderr 或 signal 文案。
- zh.js 与 en.js 必须成对更新；参数只接受安全的数值上限，未知技术字段、路径、命令、stderr、token 和堆栈不得进入用户文案。
- 每个稳定消息键至少覆盖：中英文渲染、优先级、未知错误回退、技术细节脱敏，以及真实执行器可能返回的 timeout 形态。

## 7. 共享进度/通用组件的新增文案必须按流水线类型门控（2026-08-17，story2video-time-guidance）

**模式**：给共享组件加默认关闭的展示开关 prop（如 `showTimeGuidance`），父组件只在目标流水线（`isOrchestratedPipeline(name)`）下传入 true；同时补「默认不渲染」反向断言 + 父组件接线断言，防止回退。

**反例（真实审查发现）**：把 story2video 专属的「合成时间参考 1/3/6 分钟」说明块无条件放进共享 `StageProgress`——所有 auto/media-auto 流水线（animated-explainer、talking-head、cinematic、clip-factory、localization-dub 等）都走同一个暂存式阶段组件，专属口径直接泄漏成误导文案。

**强制点**：流水线专属文案所在组件的挂载条件是共享的（`(pipelineRunStatus.stages || orchestrationStages).length`）时，必须由父组件按流水线类型门控；新增用例至少包含「非目标流水线不渲染」。

## 6. 生成类 IPC 失败必须校验 code 并走消息归一化（2026-08-16，s2v-retry-image-error-masking）
## 8. 场景级生成动作可多卡重复暴露；能力门控必须与后端契约一致（2026-08-21，fix-s2v-history-scene-gen-buttons）

**模式**：场景级生成动作（如【生成新图】【生成 AI 视频】）可以在多个视觉卡上重复暴露同一入口（image1/image2、video1/video2），但写入目标必须由既有的选中态/身份规则决定，禁止为视觉别名新增持久化身份或按卡改写后端契约。

**反例（真实 Bug 根因）**：渲染层 `hasUsableVideoPrompt` 只校验 `videoPrompt`，而后端 `generateSceneAiVideo` 实际回退 `videoPrompt || prompt || text`——历史记录未持久化 videoPrompt 时按钮灰显无法生成；且老测试把「image2/video2 无生成按钮」写成断言（反向固化错误行为）。只放宽模板 `:disabled` 不够：方法入口（`generateSceneAiVideo` 内的 guard）必须同步放宽，否则按钮可点但静默 return。

**强制点**：
- renderer 的“能否生成”门控必须与后端提示词回退契约逐字一致（本例：`videoPrompt || prompt || text` 任一 trim 非空）。
- 多卡重复暴露的按钮必须是同一场景级调用，新增断言覆盖：占位空槽也有按钮、busy 传播到全部入口、无 videoPrompt 但有 prompt/text 时按钮可点且真实触发 IPC。
- 禁止写测试断言“某槽不应有生成按钮”或用 `toHaveLength(2)` 固化错误行为；用 `data-testid` 定位而非位置索引。

**模式**：消费返回 `{code, message, data}` 契约的生成结果（生成图片/视频/音频）时，服务层必须在消费产物（复制/替换）前校验 `code === 0` 且产物路径存在；失败结果与抛异常是两条不同的失败路径，都要保留原始 message（缺失回退领域兜底文案）、保留旧媒体、清理本次产物并持久化失败状态。渲染层 catch 一律把错误文本交给既有通知归一化（quota/rate-limit/API Key/权限模式），不固定显示单一键。

**反例（真实 Bug 根因）**：`retrySegment()`/`generateSceneImage()` 未校验 `generateImage` 返回码，`code !== 0` 时 `generatedPath` 为 undefined，落入 `_copyRequired` 抛「产物不存在」——provider 真实原因（余额不足/限流/API Key）被替换；渲染层 catch 固定 `operation_failed` 丢弃 `error.message` 并绕过归一化。`regenerateSceneAudio` 已有正确 code 守卫，同文件两处新通道遗漏。

**强制点**：
```js
if (!generated || generated.code !== 0 || !generatedPath) {
  throw new Error(generated?.message || '图片生成失败')
}
// 渲染层 catch：showStory2VideoNotification({ error: error?.message || '' })
```
- 主进程失败路径必须有 warn 级日志（含错误 message）。
- 回归必须 mock 生成器返回「失败结果对象」（非抛异常）断言原因保留 + 状态持久化 + 日志；不得用断言固定文案反向固化错误行为。

## 9. 进度观察窗与人工检查点身份必须分开判定（2026-08-23，s2v-progress-modal-background）

**模式**：运行中进度用 modeless 观察窗承载，但不把「可观察进度」等同于「可后台化」。关闭/后台脱离必须在方法入口用受控状态机重校验（runId、组件存活、人工检查点、终态枚举），并且只能走唯一公共 detach 方法；否则遮罩、ESC、关闭按钮或旧响应会各自漂移成不同语义。进度观察窗统一禁遮罩/Escape、只右上角关闭，并保持底部操作条在其 z-index 之上可直接点击。

**反例（本轮边界）**：直接把 `waiting_approval` / `needs_user_input` 状态枚举或带候选素材的旧暂停快照当成普通 running，会让需要人工输入的任务被后台化后静默卡死；反过来把这些状态全部标记为「旧版检查点」又会误报数据损坏。两者必须分开：状态枚举缺少元数据用普通人工操作提示，只有旧的 paused+候选素材/requiresCheckpoint/finalize_assets 证据才使用「旧版快照无操作协议」提示。

**强制点**：
- `hasManualPipelineCheckpoint()` 只判定「是否阻断后台化」；`hasLegacyPipelineCheckpointEvidence()` 单独判定「是否使用旧版快照提示」，不能复用前者做文案分类。
- 新增文案一律 zh/en 成对；CJK 基线按 file:line 匹配，行号位移只允许显式 `--update-baseline`，并人工核对新增引用的中文字符串都只来自 locale/translateWithLocaleFallback。
- 普通流水线没有稳定 run identity 时不得按名称伪造单任务后台/恢复/取消；run-scoped 控制必须等主进程补 runId/API 合同。
