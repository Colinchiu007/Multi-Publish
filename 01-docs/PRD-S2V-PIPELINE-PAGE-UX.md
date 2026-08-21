# Story2Video 流水线启动页、历史记录与视频任务编辑页 UX 统一 PRD

> 状态：已实现，待合并验收
> 日期：2026-08-17
> 关联 OpenSpec：openspec/changes/s2v-pipeline-page-ux/
> 适用范围：桌面端“视频创作”中的流水线启动页、历史记录视图、视频任务编辑页

## 1. 目标与术语

### 1.1 用户目标

用户在配置长流水线、等待多阶段执行、查看多分段视频任务时，不应因为页面滚动而失去主要操作入口，也不应通过技术错误文本猜测任务对象和失败原因。本迭代的目标是让用户始终知道：当前在哪个页面、正在处理哪个视频、任务处于什么状态、下一步可以做什么。

### 1.2 统一术语

| 术语 | 定义 | 路由/入口 |
|------|------|-----------|
| 流水线启动页 | 进入“视频创作”后选择一条流水线，展示配置、启动和运行进度的页面 | /create |
| 视频任务编辑页 | 某个流水线任务的内容查看与编辑页面；不再另设“详情弹窗” | /create/result?project=projectId |
| 历史记录页 | 展示流水线任务及状态筛选的页面 | /create?view=history |
| 运行记录 | 没有 Story2Video projectId、只有 PipelineEngine run 快照的记录 | 历史记录内的纯 run 卡片 |

旧文案“视频任务详情页”“任务详情弹窗”“编辑并重新合成”不再作为用户可见名称。用户可见动作统一为“编辑”；编辑页返回动作统一为“返回”，返回目标为历史记录。

## 2. 页面布局与固定操作

### 2.1 流水线启动页

1. 配置内容位于可滚动内容区。
2. 页面底部固定操作条始终显示当前可用的“启动流水线”“暂停”“继续”“取消”等动作。
3. 操作条左侧与易效侧栏宽度对齐，不能遮挡侧栏；窄屏必须保持可点击和可换行。
4. 流水线运行后，阶段进度区在内容区顶部 sticky；页面滚动时继续显示当前阶段、总进度、子进度和阶段状态。
5. 内容区为操作条预留底部安全空间，最后一项配置不能被操作条遮住。
6. 暂停在流水线启动页的可暂停运行态显示；素材选择检查点、内容政策等待态不重复显示普通暂停动作。

### 2.2 视频任务编辑页

1. 顶部标题为“视频预览”，下一行显示任务标题。
2. 任务标题回退链为：发布标题/项目标题 → 原文案前 60 个字符 → projectId。
3. “返回”跳转 /create?view=history，不回到旧的详情弹窗。
4. 分段卡片顺序为：分段标题与状态 → 图片/视频预览 → 场景素材 → 旁白文字 → 提示词 → 语音设置 → 分段素材动作。
5. “第 N 段”必须在该段图片上方显示；分段操作条不再把标题放在图片下方。
6. “保存分段”“重新合成”“再次合成视频”固定在页面底部操作条；页面内容预留底部安全空间。
7. 窄屏下三个按钮按单列排列，不能发生覆盖；保存/合成状态和未保存提示仍可见。
8. 当编辑页携带运行中的 runId 时，标题区域显示“暂停”动作；暂停沿用同一受校验 IPC，只更新 run 状态，不改变分段编辑数据。

## 3. 历史记录信息合同

### 3.1 统一卡片结构

全部、进行中、已暂停、已中断、执行失败、已完成、已取消标签共用同一卡片 DOM 结构、宽度、内边距和操作区。状态差异只通过数据项和状态色体现，不复制状态专属 CSS。

每张卡片统一显示：

- 任务标题：优先发布标题；为空时显示原文案前 60 字；再为空显示流水线名称或“未命名任务”。
- 文案预览：任务原文案前 120 个 JavaScript 字符，超长追加 …；不读取图片/视频提示词代替任务文案。
- 首场景缩略图：第一场景有合法图片时取第一张；无合法图片时取第一个合法视频的第 0 秒首帧；失败保留空背景并显示“未生成”。
- 更新时间；若有创建时间，同时显示创建时间。
- 耗时：使用任务实际 duration，按当前语言格式化分钟/秒；无有效值显示本地化“暂无”。
- 任务/run ID 和 project ID：短显示，完整值放在 title/可访问性属性中。
- 流水线名称：使用 locale 映射，不显示内部枚举值。
- 视频时长：只读取明确的成片/视频时长字段并按分钟/秒格式化；流水线执行耗时单独显示为“耗时”，不能互相替代。
- 状态标签与状态图标。
- 操作区：按记录类型提供编辑、恢复、删除等动作；动作点击必须阻止卡片导航冒泡。

状态附加字段：

- 进行中：当前阶段/阶段进度。
- 已暂停：暂停环节、暂停环境/检查点（仅用户手动暂停与 scene_asset_selection 检查点）。
- 已中断：中断环节（应用退出/崩溃/强杀后的 running 快照残留，或 >30 分钟无更新的 stale-running）。
- 执行失败：失败环节、失败原因；失败原因统一使用“失败原因”标签，不使用“错误摘要”。
- 已完成：编辑和预览入口。
- 已取消：有有效 projectId 且流水线已经启动时可进入视频任务编辑页；可修改和保存，但不允许从断点继续。

### 3.1.1 数据与交互校验

- 标题回退顺序固定为 `title → params.title/publishTitle → sourceText/text/场景文案 → 流水线名称 → 未命名任务`；空白字符串视为缺失；run-only 记录（无 project 匹配）在合并时用快照 `params` 回填 title/sourceText，避免卡片显示流水线名与「未生成」占位（2026-08-20 修订，见 PRD-video-creation §3.1.34）。
- project/run 合并先用 projectId、项目 runId、legacy id 建索引。项目内容字段（标题、文案、分段、素材）优先，run 字段（状态、阶段、检查点、错误、运行耗时、runId）补充；只有 runId 的记录不能伪造编辑页项目。
- running 卡片保留暂停、后台运行、取消等流水线控制；paused、interrupted、failed、completed、cancelled 项目卡片进入 `/create/result` 编辑页时不触发任何恢复或取消 IPC。
- 图片、视频、提示词、翻译、字幕和语音任一字段缺失、失败、文件不存在或不可读，详情页保留固定槽位，空背景文字为“未生成”；其他场景仍可编辑。
- `updatedAt` 是操作时间：内容保存、素材/提示词/翻译/语音成功更新，以及暂停、继续、取消、失败、完成状态写回均刷新；合并时取双方最新有效时间。

### 3.2 失败原因显示

主进程/历史记录可保存技术错误，但 renderer 不直接回显 provider JSON、HTTP code、堆栈、token 或内部 prompt-engine 前缀。formatPipelineError 按稳定错误码或已知错误模式映射为自然语言：

| 错误类型 | 中文提示 | English |
|----------|----------|---------|
| 配额/余额不足 | 当前模型额度不足，请检查模型账户余额或更换已配置的模型后重试。 | The selected model has insufficient quota. Check the model account or choose another configured model, then try again. |
| 内容政策拦截 | 部分场景内容未通过生成服务的安全检查，请修改对应文案后重新合成。 | Some scenes were rejected by the provider safety check. Edit the affected text and recompose. |
| 网络/超时 | 生成服务响应超时，请检查网络后重试。 | The generation service timed out. Check the network and try again. |
| 未知失败 | 任务执行失败，请检查配置后重试。 | The task failed. Check the configuration and try again. |

必要时可在错误对话框提供“查看建议”，但历史卡片只展示自然语言摘要，避免卡片布局被技术细节撑宽。

### 3.3 删除合同

- 有 projectId 的记录：显示确认对话框，调用项目删除，清理项目及本地产物。
- 无 projectId 的纯 run 记录：调用 pipeline:delete-run。
- runId 必须是 trim 后非空字符串；非法入参返回结构化错误。
- 运行中的 run 不允许删除，避免删除活跃状态造成并发槽位和历史脱节。
- 成功删除必须同时清理：主 run、pipeline 名称索引、history 条目、run-state-store 快照。
- 持久化清理失败时 fail closed：不显示删除成功，不从可恢复状态中提前移除记录，提示用户重试。
- 删除按钮在所有状态标签均显示；点击删除不会触发卡片打开。

## 4. 视频任务编辑页交互

### 4.1 分段定位

当任务有多个 segments 时，在分段列表上方显示数字快捷跳转条以及“上一条”“下一条”。

- 点击数字：平滑滚动到对应分段，当前数字高亮。
- 点击上一条/下一条：以当前分段为基准移动；第一段禁用上一条，最后一段禁用下一条。
- 分段下标只用于 UI 定位，不改变 segments 数组顺序和持久化 ID。
- 单段任务仍可显示分段标题，但可隐藏无意义的导航按钮。

### 4.2 场景素材与 AI 视频

- 场景素材区的“生成 AI 视频”以当前分段 `videoPrompt || prompt || text` 为提示词源（与后端回退契约一致）；三者全为空或未保存时，按钮禁用并提示“请先编辑或重新生成视频优化词，再生成 AI 视频”。
- “生成新图”“生成 AI 视频”是场景级动作：生成新图显示在 `image1`/`image2` 卡内、生成 AI 视频显示在 `video1`/`video2` 卡内，各卡入口都是同一动作的重复暴露，不改变落点语义；`video1`/`video2` 仍是同一视频身份的视觉别名。
- “当前使用”读取服务端真实保存的 `selectedMaterial`，只接受 `image1 | image2 | video`；候选列表顺序变化、派生 URL 暂时失效或新增视觉别名时，禁止按第一个候选项猜测。
- 生成成功后替换对应场景素材并重新解析本地 URL；失败保留旧素材、清理本次产物并显示可操作失败提示。


### 4.2.1 场景素材视频显示优化（2026-08-18）

#### 需求概述
优化视频任务编辑页中场景素材区的视频显示逻辑，确保用户看到的是该场景在流水线过程中独立生成的视频片段，而非最终合成的成片视频。

#### 功能逻辑与数据来源
- **四个视觉卡位**：每个场景固定渲染 `image1`、`image2`、`video1`、`video2` 四张卡，顺序不可因素材缺失而改变。`image1` 来自 `segment.imagePath`，`image2` 来自 `segment.alternateImages[0].path`，`video1` 优先使用 `segment.videoMeta.sceneVideoPath`，缺失时兼容回退到场景分段字段 `segment.videoPath`，`video2` 仅使用可选的 `segment.videoMeta.altSceneVideoPath`。
- **视觉与持久化边界**：四个视觉卡不等于四个持久化身份。主进程和 `story2video:select-scene-material` IPC 继续只接受 `image1 | image2 | video`；`video1/video2` 是 renderer 视觉别名，任一有素材的视频 radio 发出的 kind 都归一为 `video`。`video` 的当前使用徽标只在 canonical `video1` 卡显示一次，避免两个视觉卡同时伪造两个持久化选择。
- **路径与 URL 校验**：服务端对项目/分段 ID 和素材 kind 做白名单校验，并拒绝不存在的目标槽位；renderer 用 `story2videoCreateShareUrl` 将受控本地路径解析为临时预览 URL。路径存在但 URL 解析失败时保留固定空框、禁止缩略图预览，radio 仍遵循路径存在的服务端选择合同。
- **不能显示成片替代场景素材**：有 `videoMeta.sceneVideoPath` 时始终优先显示场景独立视频；只有旧项目没有该字段时才允许使用 `segment.videoPath` 兼容历史场景视频数据。compose 输出的顶层成片路径不是本区域的数据源。

#### 当前使用状态
- **仅显式选择生效**：只有当用户通过 selectSceneMaterial IPC 显式选择了某个素材槽位（segment.selectedMaterial 被设置为 image1、image2 或 video）时，才在该槽位右上角显示"当前使用"标签。
- **默认无选中**：未显式选择时，所有槽位均不显示"当前使用"标签（effectiveSelectedMaterial 返回 null）。
- **数据校验**：selectedMaterial 必须是 MATERIAL_KINDS 数组中的合法值，否则视为未选择。

#### 空素材占位与四格布局
- **无素材也保留卡位**：任一素材路径缺失，仍渲染同样宽高的 media frame；图片和视频内容使用 `object-fit: cover`，空框使用与缩略图一致的背景色和 `aspect-ratio: 3 / 4` 几何，不压缩、不折叠、不把四列布局变成三列。
- **空态文案唯一且本地化**：空框只显示 locale 的 `emptySlot`（中文“未生成”，英文“Not generated”）一行；不得显示 `Video 1`、`Video 2`、`video1`、`video2` 或第二行未解释的英文 fallback。
- **交互**：没有可用路径和 URL 的缩略图按钮 disabled，不打开预览；没有路径的 radio disabled；空卡不触发选择 IPC。
- **生成按钮**：即使视频 1/视频 2 卡为空，“生成 AI 视频”仍可用，前提是 `videoPrompt`/`prompt`/`text` 任一非空（与后端回退契约一致）且该分段不忙。

#### 生成 AI 视频按钮
- **触发条件**：videoPrompt 非空且当前分段无正在进行的生成任务（isSegmentBusy 为 false）。
- **禁用条件**：videoPrompt 缺失、为空或 trim 后为空白时按钮禁用，title 属性显示提示文字"请先编辑或重新生成视频优化词，再生成 AI 视频"。
- **生成中状态**：按钮文字变为"AI 视频生成中..."，按钮禁用。
- **生成成功**：刷新场景素材 URL，视频槽位显示新生成的 AI 视频片段。
- **生成失败**：保留旧素材，显示可操作失败提示。

#### 媒体框与响应式布局
- **固定尺寸规则**：每个 thumbnail button 宽度为卡片内容区 100%，使用稳定 `aspect-ratio: 3 / 4` 和不小于 96px 的高度；图片、视频和空态共用同一背景框，媒体内容使用 `object-fit: cover`。
- **桌面端**：宽屏四列等宽排列；每张卡的单选项、标签、徽标和所属生成按钮均在自身背景框内，不覆盖相邻卡片。
- **窄屏**：`720px` 及以下改为两列，媒体框几何保持不变；长按钮文案允许换行，不能撑破卡片或遮挡 radio/标签。

#### 分段编辑侧栏
- **布局**：分段快捷定位栏（数字跳转 + 上一条/下一条）从分段编辑区域内提取出来，改为右侧固定竖条（position: fixed; right: 20px; top: 80px），不随页面滚动而移动。
- **宽度**：侧栏宽度 200px，最大高度 calc(100vh - 120px)，内容超出时可纵向滚动。
- **响应式**：窄屏（≤900px）下侧栏隐藏（display: none）。
- **操作条**：底部固定操作条保持在主内容区域底部，不受侧栏影响。

#### 交互逻辑与事件流
1. 页面加载项目后按固定顺序生成四个视觉 slot，并逐个解析 `imagePath`、备选图路径、`sceneVideoPath/videoPath` 和 `altSceneVideoPath` 的预览 URL；任一解析失败只影响该 slot。
2. 用户点击有 URL 的 thumbnail button，只执行 `previewSceneMaterial(slot)`，打开预览，不调用选择 IPC、不改变 `selectedMaterial`。article 不再是 ancestor `label`，避免点击预览被浏览器 label activation 误选 radio。
3. 用户点击 radio 或其紧邻的 label，才执行 `selectSceneMaterial`；renderer 将 `video1/video2` 归一为 `video`，服务端再次校验目标槽位并返回完整 project。成功后刷新 URL、dirty 状态和当前使用徽标；失败保持原选中态。
4. 用户点击空 thumbnail、空 radio 或正在 busy 的控件时不产生副作用。
5. 生成 AI 视频前，如果分段有未保存编辑，先执行 `saveSegments`；保存失败不发起生成。生成和选择共享 `segmentBusy[segmentId]`，防止重复请求。
6. 预览 modal 使用既有 `UiModal` 的 `xl` 尺寸；`image1/image2` 渲染 `<img>`，`video1/video2` 按 slot kind 渲染带 controls/autoplay 的 `<video>`，媒体最大高度受 `75vh` 约束。

#### 显示项
| 元素 | 显示条件 | 文案/内容 |
|------|----------|-----------|
| `image1` | `segment.imagePath` 与 URL 可用 | 图片缩略图；radio 在缩略图下、标签前；卡内显示“生成新图” |
| `image2` | `alternateImages[0].path` 与 URL 可用 | 图片缩略图；卡内显示“生成新图”（场景级动作入口） |
| `video1` | `sceneVideoPath` 或兼容 `videoPath` 与 URL 可用 | 视频缩略图；canonical `video` 选中徽标；卡内显示“生成 AI 视频” |
| `video2` | `altSceneVideoPath` 与 URL 可用 | 可选的视频视觉别名；预览按视频处理，不新增持久化 kind 或重复徽标 |
| 空 media frame | path 或 URL 缺失 | 与缩略图同尺寸背景 + 唯一一行“未生成” |
| 选择控件 | path 存在且分段不 busy | 单选项和本地化 `aria-label`；只有 radio 改变当前使用 |
| 预览 modal | thumbnail path + URL 均可用 | `UiModal size="xl"`，图片/视频分别按 kind 渲染 |

#### 数据校验、错误与边界
- `selectedMaterial`：renderer 和服务端都只接受 `image1 | image2 | video`；非法、空白或未知值按未选择处理，不自动猜测。目标槽不存在时服务端返回 `VALIDATION_ERROR`/可操作错误，不能落库。
- `alternateImages`：非数组、空数组或第一项缺少合法 path 时按空的 `image2` 处理；服务端继续限制最多一项并纳入项目文件引用清理。
- `videoMeta.sceneVideoPath`：有值时优先；缺失时仅兼容回退 `segment.videoPath`。`altSceneVideoPath` 缺失时 `video2` 保留空框，不借用 `video1` URL。
- `videoPrompt`：trim 后为空或缺失时禁用 AI 视频按钮并显示 title 提示；有未保存编辑时先保存，保存失败不进入生成阶段。
- 预览 URL：`story2videoCreateShareUrl` 返回非零 code、空 URL、失效路径或异常时，将该 slot URL 清空；固定 frame 和其他 slot 保持可用。
- 服务端生成失败：旧 image/video path、meta、`selectedMaterial` 保持不变，本次 attemptFiles 清理，用户只看到归一化的本地化提示，不回显路径、堆栈或 provider 原始 JSON。
- 测试至少覆盖：四卡固定顺序、radio-only selection、thumbnail-only preview、video kind 归一、`selectedMaterial` 非法值、path/URL 不一致、AI prompt guard、busy 防抖、旧字段缺省、空卡英文泄漏和 `xl` modal。
### 4.3 音色与语速

- 字段标签从“音色 ID”改为“音色”。
- 当项目 voiceProvider/voiceModel 上下文完整且目录返回非空时显示下拉选择。
- 当前已保存的 voiceId 即使不在最新目录，也必须作为保留选项，不能静默丢失。
- 目录加载失败、目录为空或上下文不完整时回退到文本框，并显示非阻断的“暂时无法获取音色列表”提示。
- 语速为 range：最小 0.5、最大 2.0、步长 0.1，右侧显示当前值；与流水线启动页的语速交互一致。
- 删除“重试图片”“重试视频”；保留“替换旁白”和下载图片/音频/视频动作。

### 4.4 无成片任务编辑

只要存在 projectId 且 segments 非空，即使 videoPath 为空、任务为 failed/paused/尚未合成，也进入编辑区域。仅在既无可编辑 project 又无可预览 path 时显示空状态。

## 5. 状态与流程

### 5.1 暂停与中断来源

“已暂停”仅来自以下明确路径（用户手动动作或人工检查点，2026-08-20 修订）：

1. 用户在流水线启动页运行态点击“暂停”，主进程保存暂停 stage/checkpoint。
2. 用户在携带运行中 runId 的视频任务编辑页点击“暂停”，主进程保存暂停 stage/checkpoint，编辑数据保持不变。
3. 用户在场景素材选择检查点停留，任务等待人工确认。

“已中断”来自非用户主动的异常路径：

4. 应用重启/退出/崩溃/强杀后，持久化 running 快照无法确认仍活跃，归一化为 interrupted。
5. stale-running 展示层检测到长时间无更新（>30 分钟）时归一化为 interrupted。

暂停/中断后的历史卡片显示暂停/中断阶段与环境；可恢复记录显示继续动作。暂停保存失败必须恢复原状态、阶段和 checkpoint。

### 5.2 历史进入编辑/恢复

1. 用户进入历史记录，默认展示全部并按有效更新时间倒序。
2. 点击有 projectId 且已启动流水线的 paused、interrupted、failed、completed 或 cancelled 卡片，进入视频任务编辑页；running 卡片回到流水线控制页，纯 run 记录不生成编辑路由。
3. failed/paused/interrupted 且有 runId 的纯运行记录优先显示恢复动作；内容政策失败不原样恢复。cancelled 记录不显示断点继续，但仍可进入有项目的编辑页修改内容。
4. 点击“从断点继续/继续生成”后：后端立即恢复推进该 run；前端跳转流水线启动页并持有该 runId 实时拉取运行态（3s 轮询），直到进入终态（failed/completed/cancelled）或用户离开页面；恢复动作不得停留在历史页等待，避免用户无法看到推进。
5. 无 projectId 的记录不伪造编辑页入口；可恢复或删除。
6. 编辑页保存分段后才清除未保存标记；离开时若有未保存修改，提供保存并离开、不保存离开、取消三个选择。
5. 编辑页保存分段后才清除未保存标记；离开时若有未保存修改，提供保存并离开、不保存离开、取消三个选择。

### 5.3 顶部地址导航

所有页面继续使用顶部地址栏左侧的后退/前进箭头。显式页面返回只改变目标：编辑页“返回”进入历史记录；浏览器式前进/后退仍由共享导航组件管理。

## 6. 数据校验与安全

- 所有数组字段在 renderer 读取前验证为数组；阶段字段必须是对象且不能是数组或 primitive。
- 数字 ID、duration、时间戳只在有限、可解析且范围合理时展示；无效值统一显示暂无。
- 所有 IPC 参数为纯 JSON 值，不传 Vue reactive proxy。
- delete/pause/resume 失败返回结构化错误，renderer 不把异常或技术堆栈作为成功提示。
- locale 新增/修改必须同步 zh.js 与 en.js；renderer 不新增硬编码中文用户文案。
- Story2Video 失败原因必须遵守“稳定键 + 安全参数 + locale 插值”合同：原始错误只用于分类，不能直接回显；{sceneText}、provider JSON、HTTP 状态码、堆栈、请求 ID、token 和 prompt-engine 前缀均不得进入卡片或对话框。
- 失败提示需要尽可能指出具体模型账号：已识别 minimax-multimodal 显示“MiniMax模型账号”，已识别 kling 显示“Kling模型账号”；未知 provider 显示“当前模型账号”，英文对应 current model account。禁止展示 provider account、account 或“对应模型账号”。
- 允许显示的上下文仅包括场景号、素材完成比例、图片/旁白生成类型等自然语言信息；没有上下文时省略括号，不留下 {context} 等未解析变量。
- 固定操作条不改变主进程任务生命周期，不释放运行中的并发槽位；编辑页仅可通过“暂停”调用既有受校验的 run 控制 IPC，保存和合成操作不修改 run 状态。

## 7. 验收标准

### 功能验收

- 长配置页滚动时启动/暂停/取消操作仍可用，运行进度仍固定在内容顶部。
- 历史所有状态卡片结构、宽度和通用字段一致，全部状态有删除。
- 失败原因显示自然语言；卡片能通过标题或文案摘要识别具体视频任务。
- 历史详情/编辑入口统一进入视频任务编辑页，旧详情弹窗不再出现。
- 多分段任务可通过数字、上一条、下一条定位；编辑底部操作条不遮挡内容。
- 无成片任务可编辑；视频提示词生成 AI 视频；音色下拉/回退与语速滑条可用。
- 顶部返回/前进和编辑页返回历史记录均可用。

### 质量验收

- 定向桌面 Vitest 全绿。
- locale pair、CJK、lint、依赖解析通过。
- 修改 Electron 主进程后完成 QM-1 打包、asar require 链和 8 秒启动 stderr 验证。
- OpenSpec、CCG task、PRD、CHANGELOG、learnings 和 memory 完成同步；PR 合并后再归档 change/task。

### 7.2 失败提示详细验收

- 场景 22 限流提示显示“（场景 22）”或“(scene 22)”，且不显示 request ID。
- Image provider minimax-multimodal 的额度/API Key/空结果提示显示 MiniMax模型账号 或 MiniMax model account。
- Image provider kling 的限流提示显示 Kling模型账号；无法解析 provider 时显示 当前模型账号，不显示 provider 原词。
- 0/51 scenes have both image and audio 只转成“场景 0/51，图片和旁白生成”等自然语言，不显示原始异常句。
- 历史旧数据包含 sceneText 时仍可打开；渲染前忽略该内部字段，最终文案不得出现 {sceneText}。
- 点击恢复、重试、编辑和删除的状态门控与本次改造前一致；文案细化不改变 run 状态、并发槽位和持久化字段。
