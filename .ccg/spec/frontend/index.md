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
- **带参文案必须写成 Message Function，不能写成含 `{name}` 的普通字符串**：`i18n/index.js` 的 `toMessageFunctions` 会把静态字符串包成 `() => source`，以避免 Electron CSP 所禁止的运行时消息编译；因此 `'失败：{message}'` 不会插值、会原样显示。使用 `(ctx) => '失败：' + ctx.named('message')`（zh/en 两侧一致），并至少覆盖一条非默认语言与“标题/文本不含 `{name}` 字面量”的渲染断言。

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

## 10. 实时标签事件必须胜过飞行中的刷新快照（2026-08-24，fix-multitab-title-isolation）

**模式**：renderer 同时消费实时事件和异步列表/详情刷新时，请求发起时必须记录请求序号、活动目标和事件版本；返回时先拒绝非最新请求或目标不匹配结果，再以请求期间到达的实时事件覆盖同一实体的旧字段。

**反例**：`tabStore` 没有消费 `tab-title-updated`，且 `getAllTabs()` / `getActiveTab()` 在标签切换后仍可无条件写回。多个发布平台并发加载时，旧快照会把当前导航栏标题串成其他标签（例如快手）。

**强制点**：事件处理必须按 `tabId` 更新实体；只有活动实体可以更新全局导航栏。列表刷新覆盖前至少覆盖“两个请求乱序”和“标题事件发生在列表请求飞行期间”两个回归场景。

## 11. 统一进度弹窗范围边界（2026-08-23，s2v-progress-unify-scope-doc）

- 统一进度弹窗只覆盖“有可观察流水线阶段状态”的编排流水线/历史恢复前台跟踪，以及获得稳定 run identity 的普通流水线；快速渲染 loading、发布 timeline、独立分析状态不套用，禁止为此类轻量任务伪造“后台运行/历史可查看”语义。
- `CreateHistory.vue` 已废弃：`/create/history` 重定向到 `/create?view=history`，无生产引用，不得重新接入其内嵌进度卡片；历史入口统一为 `CreateViewHistory.vue` 摘要与恢复。
## N. 模型供应商「默认模型」双默认契约（2026-08-27，model-user-default-selector）

**模式**：供应商默认模型 ID 有 2 项数据——运营预设 `default_model`（目录同步下发、全用户共享）+ 用户自选 `user_default_model`（桌面端本地、不上传）。UI 侧模型列表一律只读（集合唯一维护入口在运营中心），默认模型只提供 el-select 下拉选择（可清空 = 跟随运营默认），不允许输入框编辑。

**反例（历史上发生）**：运营后台设置了 default_model 但调用解析仍走 `capability_models[type]` / `models[0]`，设置不生效；用户在输入框自由填模型 ID → 调用 404/400。

**强制点**：① 调用侧必须经唯一解析入口 `resolveProviderDefaultModel(provider, type)`（user_default_model → default_model → capability_models[type] → fail-closed），任何接线点不得自行写 `models[0]`；② `user_default_model` 提交时校验 ∈ models，非法值清除；③ applyCatalog 目录同步不得覆盖本地用户 config 键；④ 新「默认模型」类 UI 收敛为下拉 + 只读列表。

## 12. 历史列表排序/派生字段应放在 utility 纯函数层（2026-09-04，video-history-sort-duplicate）

**模式**：任何对已加载列表数据的重新排序、过滤、派生字段（如重复标题检测），都应放在纯函数 utility 层（如 `history-utils.js`），组件只负责 UI 绑定和事件发射。排序主键缺失时统一放最后（无论正序/倒序），次级用稳定字段（有效时间倒序 → 创建时间倒序 → 身份字典序 → 索引）。

**反例**：把排序逻辑写在组件 computed/methods 中，导致测试困难、复用性差。

**强制点**：
- 排序主键提取函数（如 `historyVideoDuration`）必须文档化字段候选顺序，排除重名字段（如 `activeMs`/`duration` 是流水线耗时，不是视频时长）。
- 排序稳定的场景（从不同 tab 切换回来顺序不变）由纯函数保证，不依赖组件临时状态。
- 重复检测等派生计算基于完整列表（不受当前 tab 筛选影响），避免切 tab 时标签闪烁。

## 10. 用户可见提示信息强制规则（i18n-user-facing-messages，2026-09-05）

### 规则 1：语言描述的友好度

**所有应用中出现的错误、警告和提示内容，必须使用自然语言描述，不能出现技术性的、非用户友好的话。** 具体要求：

- ❌ 禁止：显示 i18n key 原始名称（如 `accountsPage.loginExpiredHint`）
- ❌ 禁止：显示技术错误堆栈或原始错误对象
- ❌ 禁止：显示后端返回的未处理错误码或英文技术消息
- ✅ 必须：使用完整、自然的中文（或当前语言）句子描述问题和建议操作
- ✅ 必须：对用户有具体指示性（不是"操作失败"，而是"登录已失效，请重新登录后重试"）

### 规则 2：符合多语言（i18n）

**所有用户可见文案必须通过 i18n 系统展示，且 zh/en 成对维护。**

- 后端（Electron 主进程）：不得返回用户可见的中文/英文消息字符串。应返回结构化错误码（如 `CHECK_LOGIN_COOKIE_EXPIRED`），由前端根据错误码映射到 i18n 文案。
- 前端（Vue 渲染进程）：所有用户可见字符串必须通过 `t('key.path')` 获取，禁止在 `.vue` 模板或 script 中硬编码中文字符串字面量。
- 新增 key 必须在 `zh.js` 和 `en.js` 中成对添加（CI Gate 7 拦截）。
- 带参文案必须写成 Message Function：`(ctx) => '失败：' + ctx.named('message')`，不能用 `{name}` 占位符。

### 规则 3：后端错误码约定

后端返回给前端的用户可见信息应遵循以下结构：

```javascript
// ✅ 正确：返回结构化错误码
{ valid: false, code: 'CHECK_LOGIN_COOKIE_EXPIRED' }

// ❌ 错误：返回硬编码用户消息
{ valid: false, message: 'Cookie 已过期，请重新登录' }
```

前端维护错误码到 i18n key 的映射表，确保错误消息可翻译。

### 检查机制

- **CI Gate 7**：`node .github/scripts/check-locale-sync.js --cjk` 扫描渲染端硬编码中文字符串
- **CI Gate 7**：`node .github/scripts/check-locale-sync.js --pair-base origin/main` 检查 zh/en 成对变更
- **CI Gate 7**：`node .github/scripts/check-locale-sync.js --keys` 扫描渲染端使用的 i18n key 必须存在于 zh/en（防 vue-i18n 缺失 key 原样返回泄漏）
- **Code Review**：审查者必须检查新增字符串是否都通过 i18n 系统展示

### 运行时防泄漏守卫（2026-09-05 增强）

即使 CI 漏检，运行时也不允许 i18n 原始 key 直出到用户界面。统一通知通道（`useNotify` / `notifyCore`）在展示前拦截：

- `notifyCore.resolveNotifyText`：解析结果若仍是 i18n key 形态（点分路径 + 驼峰/下划线），视为未命中，返回空串。
- `useNotify.notify` / `notifyConfirm`：`options.message` 直接传文案若为 i18n key 形态，拦截不展示；`notifyConfirm` 的 `title` / `confirmButtonText` / `cancelButtonText` 同样拦截。
- 判定函数：`message-contract.js` 的 `looksLikeI18nKey(text)`（保守，仅识别点分路径 key 形态，不误伤自然语言）。

**强制点**：任何新增用户可见文案必须走 `t('key.path')` 且 key 在 zh/en 成对存在；禁止把 i18n key 字符串直接传给 `ElMessage` / `ElMessageBox` / `options.message`。
