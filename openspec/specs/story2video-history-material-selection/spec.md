# story2video-history-material-selection Specification

## Purpose
历史记录任务详情页（ResultView，`/create/result?project=id`）每个场景支持补充、预览、选择和生成素材，成片后无需重跑完整流水线即可更换素材并再次合成。服务端保留三个持久化素材身份，渲染端以四个稳定视觉卡呈现素材与空态。
## Requirements
### Requirement: 场景素材槽位数据模型
每个 segment SHALL 保留三个持久化素材身份：图 1 = `imagePath`、图 2 = `alternateImages[0].path`、视频 = `videoPath`；`alternateImages` 为 `Array<{path, meta}>` 且服务端 SHALL 强制 `length <= 1`；ResultView SHALL 按 `image1`、`image2`、`video1`、`video2` 的顺序显示四个稳定视觉卡，其中 `video1`/`video2` 是主视频与可用备用视频显示位，不得扩展持久化 `selectedMaterial` 或 IPC 的 `image1 | image2 | video` 枚举。`selectedMaterial` 为可选字段，缺失 SHALL 按遗留语义处理（有 `videoPath` 用视频，否则用 `imagePath`）。槽位身份 SHALL 保持稳定，选中操作只写 `selectedMaterial`，不得交换文件到 `imagePath`。

#### Scenario: 四个视觉卡位保持固定顺序
- **WHEN** 一个 segment 被渲染，无论图片或视频路径是否存在
- **THEN** 编辑器恰好显示 `image1`、`image2`、`video1`、`video2` 四张卡；缺少路径时显示同尺寸的空卡，而不是折叠或改变顺序

#### Scenario: 视频视觉别名不改变数据枚举
- **WHEN** 用户选择任一有内容的视觉视频卡
- **THEN** renderer 向既有选择 IPC 发送持久化 kind `video`，绝不发送 `video1` 或 `video2`；当前使用徽标只代表 canonical 视频选择，不创建第二个持久化视频身份

#### Scenario: 新字段缺省即旧行为
- **WHEN** 打开一个旧项目（无 `alternateImages`/`selectedMaterial` 字段）的详情页
- **THEN** 场景显示图 1 与视频槽（有视频时），图 2 槽为「未生成」占位，选中态显示图 1（无视频）或视频（有视频），无需任何数据迁移

#### Scenario: 槽位文件纳入引用与清理
- **WHEN** segment 存在 `alternateImages[].path` 或服务端生成/复制备选图
- **THEN** `referencedProjectFiles` 与 `_persistComposeArtifacts` 包含该路径；删除 segment 或替换备选图后 `_cleanupUnreferencedProjectFiles` 自动回收不再引用的文件，仍被引用的文件不得被清理

#### Scenario: manual 模式候选富化
- **WHEN** manual 模式流水线完成且 `run.context.generate_assets.candidates` 存在
- **THEN** `saveRun` 将选中图片之外的未选图片复制进项目目录作为 `alternateImages[0]`；未选中的视频候选（仅当流水线未选视频时）复制为 `videoPath`；`selectedMaterial` 按流水线实际选择写入；auto 模式无候选时不富化

### Requirement: 素材选择（select-scene-material）
用户选择素材 SHALL 通过 `story2video:select-scene-material`（参数 `{projectId, segmentId, kind}`，`kind ∈ image1|image2|video`）更新选中态。只有有内容卡片的 radio 及其关联名称是选择入口；radio 必须位于缩略图下方、素材名称之前。缩略图 SHALL 只负责预览，不得触发选择。`kind` 非法或目标槽位不存在（如无备选图时选 image2、无视频时选 video）SHALL 返回 `VALIDATION_ERROR` 且不改变任何状态；canonical 视频路径缺失时 video radio 也必须禁用。选择成功后 SHALL 返回完整 project 并置 `dirty=true`（复用「有未合成修改」徽标语义）。

#### Scenario: 单选项是唯一选择入口
- **WHEN** 用户改变有内容的 image1、image2 或视觉视频卡的 radio
- **THEN** renderer 调用选择 IPC，并将视觉 video1/video2 归一为 `video`；成功后图片显示选中态，canonical 视频选择只在 video1 显示当前使用徽标，video2 作为视觉别名保留

#### Scenario: 点击缩略图只预览
- **WHEN** 用户激活有内容的图片或视频缩略图
- **THEN** 只打开预览 modal，不调用选择 IPC，也不修改 `selectedMaterial`

#### Scenario: 空卡位不可选择
- **WHEN** 用户聚焦或尝试激活没有媒体路径的卡位
- **THEN** 卡位保留固定空框，radio 被禁用，显示单行本地化空态，预览和选择 IPC 均不调用

#### Scenario: 合法选择
- **WHEN** 用户改变存在素材的 image1、image2 或视觉视频 radio
- **THEN** 该槽位成为唯一选中态，project 持久化 `selectedMaterial` 并返回，界面高亮与「当前使用」徽标随之更新，其他素材路径不变

#### Scenario: 非法选择
- **WHEN** 用户尝试选择空槽位、缺少 canonical videoPath 的视频或提交非法 kind
- **THEN** 返回 `VALIDATION_ERROR`，界面显示可读提示且选中态与数据不变

### Requirement: 生成新图（generate-scene-image）
`story2video:generate-scene-image` SHALL 复用 `assetGenerator.generateImage(segment.prompt || segment.text, {index, style, image_provider, image_model, aspect_ratio, runId})`（与 retrySegment 相同参数）生成图片；槽位规则：(1) 无备选图 → 新图写入图 2 槽且不改变选中态；(2) 已有备选图 → 替换「未选中」的那张（`selectedMaterial === 'image2'` 时替换图 1 的 `imagePath`，否则替换图 2 的 `alternateImages[0]`）；(3) 不自动重渲染视频、不自动切换选中态。生成失败 SHALL 清理本次产物、回写 failed 状态并返回错误，前端 toast 提示。

#### Scenario: 单图补槽
- **WHEN** 场景只有图 1（无 `alternateImages`）且用户点击【生成新图】
- **THEN** 新图写入图 2 槽（`alternateImages[0]`），原选中态（图 1）保持不变，图 2 槽变为可选

#### Scenario: 双图替换未选中
- **WHEN** 已有 2 张图且当前选中图 2（`selectedMaterial === 'image2'`）时点击【生成新图】
- **THEN** 替换图 1 的 `imagePath`，图 2 与选中态保持不变
- **WHEN** 已有 2 张图且当前选中图 1 或视频（或未设置）时点击【生成新图】
- **THEN** 替换图 2 的 `alternateImages[0]`，选中态保持不变

#### Scenario: 生成失败回滚
- **WHEN** 图片生成抛错或产物校验失败
- **THEN** 本次尝试生成的临时文件被清理，segment 状态回写 failed，`videoPath`/`imagePath`/`alternateImages` 保持生成前的值，返回错误码与可展示信息

### Requirement: 生成视频（generate-scene-video）
`story2video:generate-scene-video` SHALL 以「当前选中图片（映射同合成语义）＋该场景 `audioPath`」调用 `composeEngine.renderSegment`（本地 ffmpeg 渲染，不消耗 AI 视频额度）生成视频并替换 `videoPath` 槽；`audioPath` 缺失 SHALL 返回错误（提示「该场景没有旁白音频，无法生成视频」）且不改动现有视频；生成失败 SHALL 清理本次产物并保留旧视频，不自动选中视频。

#### Scenario: 已有视频替换
- **WHEN** 场景已有 `videoPath` 且用户点击【生成视频】
- **THEN** 用当前选中图片重新渲染的新 mp4 替换视频槽，`selectedMaterial` 保持原值（不自动切到 video），返回更新后的 project

#### Scenario: 无音频拒绝
- **WHEN** 场景无 `audioPath` 时点击【生成视频】
- **THEN** 返回错误，提示文案含「没有旁白音频」，现有视频（如有）与数据不变

#### Scenario: 渲染失败保留旧视频
- **WHEN** ffmpeg 渲染失败或产物缺失
- **THEN** 本次渲染临时产物被清理，旧 `videoPath` 保留可用，segment 回写 failed 状态并返回错误

### Requirement: 合成映射（_scenesForCompose）
服务端 SHALL 提供 `_scenesForCompose()` 将每个 segment 按选中态映射为 compose 输入：`selectedMaterial === 'video'` 且存在 `videoPath` → 仅传 `videoPath`；否则传选中图片（image1 → `imagePath`，image2 → `alternateImages[0].path`）并置空 `videoPath`；`selectedMaterial` 缺失 → 遗留语义（有 `videoPath` 用视频，否则 `imagePath`）。`composeEngine.compose` 与 `renderSegment` SHALL 保持零改动，【再次合成视频】【生成视频】均经此映射。

#### Scenario: 三态映射
- **WHEN** 选中 video 且有视频 → **THEN** 合成输入仅含 `videoPath`
- **WHEN** 选中 image2 → **THEN** 合成输入含 `alternateImages[0].path` 且 `videoPath` 为空
- **WHEN** 选中 image1 → **THEN** 合成输入含 `imagePath` 且 `videoPath` 为空
- **WHEN** 字段缺失 → **THEN** 与现状一致（视频优先，否则图 1）

### Requirement: 再次合成视频（recompose-project）
【再次合成视频】SHALL 复用既有 `story2video:recompose-project`（`composeEngine.compose({scenes: _scenesForCompose(project.segments)}, options)`），使用当前选定素材与既有 TTS 语音音频、字幕文本、背景音乐音频生成新成片；成功后 `dirty` 置 false；失败沿用既有 recompose 错误路径与提示。

#### Scenario: 再次合成成功
- **WHEN** 用户更换素材后点击【再次合成视频】
- **THEN** 以当前选中素材组合重新合成成片，结果视频替换输出，`dirty=false`，toast 提示成功

### Requirement: IPC 契约与权限
三个新通道 `story2video:generate-scene-image`、`story2video:generate-scene-video`、`story2video:select-scene-material` SHALL 注册为 `story2video_write` 权限域并经过 withSenderCheck 与 `projectId`/`segmentId`/`kind` 白名单（SAFE_ID）校验；preload（`publish.js`）、渲染端 API（`src/api/publisher.js`）、`license-access-control.js` 通道清单与 `preload.test.js` 通道断言 SHALL 同步更新。

#### Scenario: 通道存在且权限正确
- **WHEN** 应用启动并注册 IPC 通道
- **THEN** 三个新通道在 preload 暴露、publisher.js 可调用、license-access-control 判定为 `story2video_write`，preload.test.js 通道清单包含三者

#### Scenario: 参数校验
- **WHEN** 渲染端传入非法 projectId/segmentId 或非法 kind
- **THEN** 返回 `VALIDATION_ERROR`，不触发任何生成/写入副作用

### Requirement: 详情页布局与交互（ResultView）
详情页 SHALL 保持原有内容不变，每个 segment 新增「场景素材」区并稳定显示四个视觉卡（图 1、图 2、视频 1、视频 2）。缩略图只打开预览；radio 只能通过 change 事件选择当前使用素材；选中槽显示高亮边框与「当前使用」徽标。图 1 卡内只显示一次【生成新图】，视频 1 卡内只显示一次【生成 AI 视频】，其他卡不得重复显示场景级生成按钮；busy 态显示本地化「生成中...」并沿用 `segmentBusy` 防抖；【再次合成视频】入口继续使用既有服务流程。预览 modal SHALL 使用 xl 尺寸，video1/video2 均按视频元素预览。

#### Scenario: 四槽位渲染与选中态
- **WHEN** 详情页加载项目且 segment 有任意素材组合
- **THEN** 该 segment 恰好渲染 image1、image2、video1、video2 四张卡；空卡显示固定尺寸「未生成」占位；选中槽有高亮与「当前使用」徽标，video2 不重复显示 canonical 视频徽标

#### Scenario: 三槽位渲染与选中态
- **WHEN** 详情页加载项目且 segment 有素材
- **THEN** 既有三种持久化身份 image1、image2、video 的 selectedMaterial 语义保持不变，并通过四张视觉卡呈现；点击空卡不触发选择，点击有内容卡的 radio 更新选中态

#### Scenario: 缩略图预览与选择隔离
- **WHEN** 用户点击有内容图片或视频缩略图
- **THEN** 只打开对应预览，不调用选择 IPC；只有 radio change 事件触发选择 IPC

#### Scenario: 生成按钮与 busy 态
- **WHEN** 用户点击【生成新图】或【生成 AI 视频】
- **THEN** 对应卡内按钮进入「生成中...」busy 态并禁用（`segmentBusy`），完成或失败后恢复；并发双击不产生重复调用

#### Scenario: 生成按钮归属明确且不重复
- **WHEN** 一个 segment 被显示
- **THEN** image1 内恰好有一个【生成新图】按钮，video1 内恰好有一个【生成 AI 视频】按钮，image2 和 video2 不显示重复的场景级生成按钮

#### Scenario: 预览弹窗尺寸与媒体类型
- **WHEN** 用户打开缩略图预览
- **THEN** modal 使用 xl 尺寸，图片使用图片元素，video1 和 video2 使用可控视频元素并受响应式预览边界约束

#### Scenario: 再次合成并列入口
- **WHEN** 分段编辑区头部渲染
- **THEN** 【再次合成视频】与【重新合成】并列可见，点击调用 recompose-project，成功/失败均有 toast

#### Scenario: 响应式布局
- **WHEN** 视口宽度 ≤ 720px
- **THEN** 四张卡以两列换行，媒体框保持稳定尺寸且卡内按钮不溢出；宽屏使用四列

### Requirement: 文案与可访问性
所有新增用户可见文案 SHALL 写入 `locales/zh.js` 与 `locales/en.js` 成对（CI Gate 7 校验通过）；通知类文案经 `story2video-notifications.js` 键常量引用，不得在组件内新增中文字面量；槽位卡 SHALL 具备可聚焦 button/radio 语义、`aria-label` 与选中态 `aria-pressed`。空卡只显示本地化 emptySlot 一行，不暴露 raw visual kind 名称或额外英文 fallback；视频 radio 只有 canonical segment.videoPath 存在时可选择，videoMeta 只允许预览。

#### Scenario: 空槽没有额外英文残留
- **WHEN** AI 视频或场景素材尚未生成
- **THEN** 媒体框保持与缩略图相同尺寸和背景，只显示一行本地化「未生成」文案，不显示 video1/video2、Video 1/Video 2 或第二行英文 fallback

#### Scenario: 视频选择边界
- **WHEN** 视频只有 legacy videoMeta 路径而没有 canonical segment.videoPath
- **THEN** 该路径可以按既有规则预览，但 video radio 禁用且不会产生持久化选择

#### Scenario: locale 成对与通知键
- **WHEN** 新增用户可见文案（按钮/占位/toast/徽标）
- **THEN** zh/en 同键存在，`STORY2VIDEO_NOTIFICATION_KEYS` 包含新通知键，组件测试通过 data-testid 断言交互

### Requirement: 测试与回归矩阵
实现 SHALL 覆盖以下测试：服务单测（槽位规则、生成视频替换与失败保留、select 校验、`_scenesForCompose` 三态、saveRun manual 富化、清理纳入备选图、旧项目兼容）；IPC 测试（3 新通道参数校验与错误映射）；`license-access-control.test.js` 通道权限；`preload.test.js` 通道清单；`ResultView.test.js` 组件交互；CI `check-locale-sync` 覆盖新键；以及四卡布局、radio-only、preview-only、xl modal、按钮唯一归属、busy/prompt guard、空框单行文案、URL/path 失效和视频预览类型回归。

#### Scenario: 场景-测试可追踪
- **WHEN** 实现完成后运行相关测试套件
- **THEN** 本 spec 的每个场景均映射到至少一个测试用例或明确的视觉/build 检查，`openspec validate` 通过后执行 archive

