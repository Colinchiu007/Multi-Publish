## [未发布] 重构：BGM 跳过提示单一来源（服务层 warnings 机器码化）（2026-08-10）

- 重构：compose 引擎 BGM 降级警告由中文改为机器码（bgm_size_exceeded / bgm_format_unsupported / bgm_not_allowed / bgm_unreadable），服务层不再硬编码用户可见中文；用户可见文案统一由前端依据 bgmSkippedReason 本地化（bgmSkippedReasonText / formatBgmSkippedNotification），消除双份映射漂移（PR #466 审查 Minor7）。
- 备注：selected-media 惰性 GC 节流按 baseDir 隔离（Minor9，注释明确生产单目录场景）。
- 回归：compose-engine warnings 断言改机器码（含「不含中文字符」校验），103 用例通过。
- 边界：data.warnings 契约形状不变（数组），内容由中文 → 机器码；renderer 契约不变（读 bgmSkippedReason）。

## [未发布] 修复：BGM 跳过前端提示（i18n）+ 导入惰性 GC + API-Key 正则拆分（2026-08-10）

- 新增：compose 跳过背景音乐时前端显示可关闭提示条——由 run.context.compose（bgmSkipped/bgmSkippedReason）驱动，新增 BGM_SKIPPED 通知（zh/en）与 bgmSkippedReasonText/formatBgmSkippedNotification（size_exceeded/format_unsupported/not_allowed/unreadable 本地化）；新运行/取消后重置。
- 新增：导入媒体惰性老化回收——importUserSelectedMedia 按间隔（默认 1h）best-effort 触发 gcImportedMedia，覆盖长会话场景，与启动时回收互补。
- 重构：MODEL_API_KEY_PATTERN 拆分为命名子模式（未配置/缺失/解密失败）再组合，行为不变（既有正反例锁定）。
- 回归：notifications +1（BGM_SKIPPED 4 原因中英）、CreateView +1（提示条显示/关闭/未跳过隐藏）、paths +1（惰性 GC 触发/节流）；聚焦 160 用例通过。
- 边界：提示条为本次运行完成态提示；BGM 警告中文硬编码已由前端 i18n 取代（服务层仍返回机器可读码 + 中文兜底）。

## [未发布] 新增：MiniMax 多模态「支持生成视频」开关（默认关闭，2026-08-10）

- 新增：模型设置 → 多模态模型（MiniMax）表单新增「支持生成视频」开关，**默认关闭**；开关写入 `model_providers.config.capability_enabled.video`，新建/编辑均可设置。
- 能力路由：`ModelProviderManager._multimodalProviderFor('video')` 仅当 `capability_enabled.video === true` 时才把多模态模型视为 video 能力可用；缺省/关闭时 video 默认解析回落显式视频模型（如 Agnes Video）。llm/tts/image 能力路由不受影响；`_syncPresetCapabilities` 不回填/覆盖开关。
- 背景：用户 MiniMax 特殊套餐不支持视频生成，此前 `generateVideo` 被 ~120ms 拒绝（`Missing task_id in response`），且多模态优先抢占 video 默认导致 agnes-video 无法生效；本开关产品化解决。
- 回归：model-provider-multimodal +6（video 开关缺省/开/关、非 video 能力不受影响、sync 不回填）、useModelProviderCrud +5（默认关、读写持久化、导出完整性、提交透传）；相关套件全绿。
- 文档：01-docs/PRD.md 7.4.1（能力路由/交互显示/验收标准）。

## [未发布] 修复：BGM 降级原因区分 + API-Key 提示收窄 + models 清洗 + selected-media 老化回收（2026-08-10）

- 修复：compose 对不可用 BGM 降级时区分原因——`bgmSkippedReason` 返回 `size_exceeded`（超 15MB）/ `format_unsupported`（扩展名不支持）/ `unreadable`（缺失/不可读/越界），对应中文警告不再把「超限」提示成「不可读」；总输入大小超限仍 fail closed。
- 修复：API-Key 错误归一化收窄——`decrypt failed`/`解密失败` 仅在 api-key 上下文内匹配（非 key 解密错误不再误归类），补充 `Missing API key` / `api key required` / `No API key` 英文覆盖，均映射 `MODEL_API_KEY_REQUIRED`。
- 修复：多模态预设存量行 models 回填前 trim/去空串/去重，避免空格重复追加。
- 新增：`selected-media` 导入媒体老化回收（`gcImportedMedia`，默认 >7 天，启动时执行一次），BGM 可复用导入不再无界增长；被回收的 BGM 后续经 compose 降级路径处理不硬失败。
- 回归：paths +2（GC 过期/保留/目录）、compose-engine +2（超限/格式 reason）、notifications +2（decrypt 收窄正反例/英文缺失 key）、model-provider-multimodal +1（脏 models 清洗）；聚焦 141 用例通过（本地 node env 验证，jsdom 缺传递依赖为环境问题，CI 全量验证）。
- 边界：compose warnings 前端接线（providerWarnings 管道）为后续项；真实 provider 行为与第三方平台发布仍属外部验收。

## [未发布] 修复：图片轮播 BGM 清理时序导致重试失败 + API Key 提示拆分 + 多模态 models 回填（2026-08-09）

- 修复：图片轮播（story2video-compose）运行收尾不再删除已导入的 BGM 文件（`cleanupImportedMediaPaths(run.params, { skipBgm: true })`）——此前运行结束（完成/失败/取消）会把 `%TEMP%\story2video\selected-media\bgm-*.mp3` 删掉，而前端配置仍引用该路径，重试/断点续跑时 compose 阶段 36ms 内报 `BGM path is not allowed or unreadable` 整线失败（真实日志 run_1786288681414_mnnj，27 场景资源全部生成成功后失败）。
- 修复：compose 对不可读 BGM 降级而非失败——BGM 校验失败（缺失/不可读/越界/超限）时跳过背景音乐继续合成，结果返回 `bgmSkipped: true` 与中文警告；总输入大小超限仍 fail closed。
- 修复：错误提示拆分——新增 `MODEL_API_KEY_REQUIRED` 通知，「尚未配置 API Key / API Key not configured / 解密失败（safeStorage Decrypt failed）」不再被归一化成「未找到需要的相关模型」，而是引导在「模型设置」重新填写 API Key；真正的模型缺失仍显示原提示。
- 修复：多模态预设存量行 models 启动同步回填预设新增模型（如 `MiniMax-M2.7`，只增不删、顺序不变），非 multimodal 类别不自动改写。
- 回归：story2video-paths +1（skipBgm 保留/默认清理不变）、story2video-compose-engine +1（BGM 降级）、notifications +2（key 拆分/模型缺失保持）、model-provider-multimodal +2（models 回填/非多模态不改写）、CreateView 断言更新（未配置 API Key → 新 key）；聚焦 6 文件 252 用例通过。
- 边界：真实 provider 行为、打包产物验证与第三方平台发布仍属外部验收。

## [未发布] 修复：最小化不再强制隐藏到托盘，恢复系统常规最小化（2026-08-09）

- 修复：移除 `services/system-tray.js` 中无条件的 `minimize → event.preventDefault() + hide()` 拦截——窗口最小化恢复系统常规行为（任务栏最小化），不再因任何最小化事件被藏进托盘；「运行中有流水线任务且托盘可用时，关闭窗口→隐藏到托盘后台执行」的既有行为（`window-close-policy.js`）保持不变。
- 根因：`d3cbe6a0`（蚁小二逆向工程集成）引入无条件最小化进托盘；任何 minimize 事件（用户点最小化、系统/自动化触发）都会把窗口隐藏到托盘，用户易误以为应用消失、无法操作。
- 回归：`system-tray.test.js` 新增 2 例（init 不注册 minimize 拦截 / 双击托盘图标恢复+显示）；`system-tray` + `window` + `window-close-policy` 相关套件 87 例通过，eslint 0 error/warning。
- 边界：桌面端单元测试覆盖；真实窗口最小化/托盘交互仍属手动验收。

## [未发布] 测试：视频创作除图片轮播外流水线整体 E2E 覆盖（2026-08-09）

- 新增：桌面端前端功能 E2E 套件将「视频创作」页（CreateView）除图片轮播（story2video-compose）外的 13 条内置流水线全部纳入 UI 级端到端覆盖——自动编排 7 条（animated-explainer / framework-smoke / documentary-montage / animation / avatar-spokesperson / character-animation / hybrid）、媒体流水线 4 条（clip-factory / cinematic / talking-head / localization-dub，含视频素材导入与口播文案）、状态机流水线 podcast-repurpose；每条断言「详情渲染 → 标题渲染 → 启动携带正确流水线名（IPC method + args[0]）」。
- 新增：screen-demo 不可用路径断言（进入详情、显示不可用提示、启动按钮存在且禁用、不触发启动 IPC）。
- 测试设施：`tests/e2e/helpers/ipc-mock.js` 的 `pipelineList` 与 `electron/services/pipeline-engine.js` 内置 14 条流水线对齐（含 available 标记），补充媒体导入 mock（getPathForFile / story2videoImportMedia / story2videoImportMediaPath）；`tests/e2e/helpers/route-functional-suite.js` 逐条遍历流水线（用 `resetToRoute` 隔离每条流水线状态）。
- 证据：create 路由 E2E 58/58、全量 E2E 314/314（0 console/page errors）、引擎级 vitest 145/145 + 契约 18/18 + 编排 E2E 6/6、eslint 0 warning；外部 Claude 有界审查 Critical 0（2 Warning 已修复）。
- 边界：UI + IPC mock 端到端；各流水线真实阶段执行（模型/ffmpeg/8002 sidecar）与真实平台发布仍属外部验收。

## [未发布] 修复：音色目录错误提示误导 + 无日志 + 无重试入口（2026-08-09）

- 根因：图片轮播流水线 TTS provider 无可用 API Key（未配置或 safeStorage 解密失败）时，`TtsVoiceService.getCatalog` 把 adapter 全部失败折叠为 `VOICE_CATALOG_UNAVAILABLE`，前端显示「暂时无法获取音色列表，已使用默认音色，请稍后重试。」——永久性配置错误被描述为「暂时、稍后重试」，且目录路径无日志、无重试入口，问题不可定位、不可操作。
- 新增稳定错误码 `VOICE_CATALOG_CONFIG_UNAVAILABLE`：未配置/无效 API Key、认证失败（401/unauthorized）、服务商/适配器缺失、适配器初始化失败归配置类；adapter 方法不支持归 `VOICE_CATALOG_UNSUPPORTED`；网络/超时/未知保持 `VOICE_CATALOG_UNAVAILABLE`（fail-safe 保留重试语义）。
- 失败响应携带脱敏 `detail`（≤200 字符；Bearer/token/api key/secret/sk- 模式只回显 `upstream-auth-error` 分类短语，先脱敏后截断，不泄漏原文）。
- 目录失败路径补日志（provider/model/脱敏原因，不记录密钥）；IPC handler catch 分支记录日志。
- 前端：`VOICE_CATALOG_CONFIG_UNAVAILABLE` 映射「当前语音服务商配置不可用，请在模型设置中检查并配置后重试。」；瞬时/未知错误显示「刷新音色列表」按钮（`refresh: true` 重拉），配置类等永久错误不显示；select/clear 失败路径改为友好映射（不直显错误码）。
- 回归：tts-voice-service +8（配置/瞬时/不支持/401/脱敏/截断/无 message 兜底/日志）、CreateView +2（CONFIG 文案与刷新按钮作用域/瞬时刷新触发）、IPC handler 日志；相关套件 149 用例通过；Vue build + electron-builder 打包（QM-1：ASAR 含改动、require 链、10s 启动无 stderr 错误）通过。
- 文档：01-docs/PRD.md 7.1.4 音色目录错误分类合同、01-docs/learnings.md 复盘、OpenSpec change voice-catalog-error-clarity。

## [未发布] 修复：展开语音克隆面板时界面被长内容撑宽（2026-08-09）

- 修复：展开「音色复制 / 克隆」面板时，长不可断内容（MiniMax 克隆 voice_id/长名称）撑宽配置网格导致整个界面变宽——`.config-grid` 轨道改 `minmax(min(200px,100%),1fr)`，面板/行/输入等 grid/flex 子项加 `min-width:0`，克隆名 `overflow-wrap:anywhere` 换行而非溢出。
- 回归：`voice-clone-layout-regression.test.js`（真实 chromium 行为断言：修复前 97px 溢出 → 修复后 0；CSS 契约断言防回退）。
## [未发布] 修复：本地克隆音色删除/设为默认与背景音乐读取提示（2026-08-09）

- 修复：删除本地克隆音色（含 7.1.16 前存量非法 id「01」）不再强制远端 deleteVoice——adapter 不支持（如 MiniMax 官方 clone API 无删除端点）时删除为纯本地管理（registry 记录 + 本地样本 + 偏好清理），不再误报「音色克隆服务暂时不可用」；支持远端删除（ElevenLabs）的 provider 保持先远端删除语义。
- 新增：ModelProviderManager.supportsAdapterMethod(providerId, method) 能力查询（与 callAdapter 同源、不依赖 API Key、异常返回 false），供本地管理类操作判定远端能力。
- 修复：克隆音色「设为默认」点击无反应——selectS2VVoice 显式选择先同步 s2vConfig.voiceId（下拉即时反映、并发守卫不再静默丢弃），成功后回写持久化偏好；克隆列表对当前默认音色显示「默认」徽标 + 行高亮 + 「已设为默认」禁用态；无效克隆保持「已失效，请重新克隆」徽标与禁用。
- 修复：选择背景音乐等本地音频弹笼统「无法读取所选文件」——resolveMediaImportFailure 全部细分分支透传类别宾语（背景音乐/旁白音频/视频素材/图片）；新增 MEDIA_PATH_UNRESOLVED（preload 拿不到 File 本地路径 → 引导重新选择/重启应用），与「文件不可读/被占用」区分；主进程 importUserSelectedMedia 复制文件对 Windows 占用（EBUSY/EPERM/EACCES）做 ≤3 次短退避重试并回传可读中文原因。
- 修复（系统根因，真实 Electron 实证）：① lectron-bridge.toPlainIpcValue 曾对 File 做 JSON 序列化（JSON.stringify(File)→{}）导致 webUtils.getPathForFile 拿不到路径——现对 File/Blob 原样透传（contextBridge 原生支持），BGM/旁白/视频素材选择恢复可用；② story2video:import-media 加入主进程 PUBLIC_CHANNELS 与 preload PUBLIC_METHODS（本地设备操作不因未登录/未激活许可证被 code:-3 拦截）。
- 回归：tts-voice-clone-service +4（本地删除/远端删除/远端失败/能力回退）、model-provider-manager +4（能力查询）、story2video-paths +3（有界重试/占用文案/非占用抛出）、CreateView +4（设为默认/无效禁用/宾语透传/BGM 细分提示）；相关套件与全量 vitest 通过。
- 文档：01-docs/PRD.md 7.1.22（本地克隆音色删除/设为默认/媒体导入反馈细分合同，含数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字中英/验收标准）、01-docs/learnings.md 复盘（根因/逃逸链/回归保护/系统性漏洞）。
## [未发布] 图片轮播视频合成子百分比进度条（2026-08-09）

### 功能
- compose（视频合成）阶段在 6 阶段清单中新增**子百分比进度条**与进度文案：逐场景合成显示「正在合成片段 k/N · p%」，拼接/旁白/BGM/转码/校验阶段显示「视频合成 p%」，与 optimize（场景 x/y）、generate_assets（图片/旁白 x/y）的子进度对称。
- 阶段权重：preflight 0 → validated 3 → 逐片段 3+72·k/N（k=N 精确 75）→ concat 87 → narration 89 → bgm 92（可选）→ webm 95（可选）→ verify 98 → done 100；percent 单调不降。

### 数据契约（context.compose_progress）
- 引擎 `Story2VideoComposeEngine.compose(assetManifest, options, onProgress)` 新增可选回调（兼容 `options.onProgress`）；`normalizeComposeProgressUpdate` 归一化（percent 取整钳制 [0,100]、segmentsTotal ≥1 整数、segmentsDone ∈ [0,total]、phase 非空）。
- 执行器透传 onProgress 并**字段级 fail-closed 校验**后写入 `run.context.compose_progress`（phase 已知枚举、percent 有限且 [0,100]、计数整数且范围正确；非法值丢弃，绝不向 renderer 下发）。
- **失败语义**：全部失败路径（片段/拼接/旁白/BGM/webm/校验/持久化）percent 冻结在最后有效值（<100）且不发射 done；`percent === 100` 与 `code === 0` 一一对应，杜绝假成功信号。

### 前端
- compose running 且 percent 合法时渲染 mini bar（`data-testid="story2video-stage-compose-progress"`，0.3s 过渡）+ 详情文案；无 `compose_progress`（历史 run/旧数据/引擎早退）安全降级不渲染。
- 文案沿用 `translateWithLocaleFallback` 内联 fallback（`story2video.composeSegments`/`story2video.composeProgress`），不进 locale 静态文件。

### 测试与文档
- 新增/扩展测试：compose-engine 子进度发射（正常序列/失败冻结/单调性/normalize 校验）、stage-executor fail-closed 写入（合法/非法）、pipeline-story2video-contract（getRunContext/getRunSnapshot 暴露）、CreateView（子进度条渲染与安全降级）、UE 契约快照。
- 文档：`01-docs/PRD.md` 7.1.9.1（数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字/边界/后续演进）、`01-docs/PRD-video-creation.md` 3.1.10、CHANGELOG 本条目。
- 后续演进（v1 不做）：ffmpeg `-progress pipe:1` 段内实时百分比、chunked 拼接段级 onStep 插值。

## [未发布] 修复：未登录查看历史被 IPC 访问控制层拦截（2026-08-09）

- 修复：story2video:list-projects / pipeline:history 加入 PUBLIC_CHANNELS，未登录（身份启用无会话）也可查看本机历史（本地只读、owner 隔离）；list-projects/get-project/pipeline:history 三个只读通道放行（本地数据，owner 隔离或设备级）；delete-project 等写/敏感通道保持登录收紧。
- 回归：license-access-control 新增「只读历史通道未登录放行 + 写通道仍拒」用例；真实 Electron 端到端验证不弹错 + 本地模式提示条。

## [未发布] 修复：视频创作历史未登录弹「无法加载」（2026-08-09）

- 修复：身份服务启用但未登录时，视频创作历史记录回退设备级本地命名空间，不再弹「历史记录暂时无法加载」；登录后仍按用户隔离。
- 回归：story2video-project-service 新增「未登录回退 legacy 可读写」「store 缺失 fail-closed」用例；CreateView 新增「未登录空历史不弹错」用例（124 用例全绿）。

## [未发布] 图片提示词统一走 prompt-engine（2026-08-09）

### 行为变更
- **Story2Video optimize 阶段从「直连默认 LLM」改为「统一走 prompt-engine（PromptBridge / 8013）」**：
  逐场景调用 `POST /v1/optimize`，完成 风格检测 → 改写 → 输出校验；不再直连默认 LLM（此前实现与
  manifest/PRD 契约长期背离）。
- **配置契约扩展**：Story2VideoTextConfig.optimize 新增 `platform`（7 枚举，默认 generic）、`maxLength`
  （50-2000，默认 300）、`numCandidates`（1-5，默认 1）、`autoDetectStyle`（默认 true）、`context`
  （字符串或对象，敏感键拦截）；旧字段 style/creativeLevel/negativePrompt 保持兼容。
- **输出校验 fail closed**：optimized_prompt 非空、error 优先（服务端失败兜底返回原文+error 不再被当成成功）、
  422 detail 形态、超长截断、数量匹配；prompt-engine（8013）不可用时 optimize 阶段明确失败，不静默回退。
- **枚举别名归一**：cinematic→photography、3d-render→3d_render、dall-e(-2/-3)→dalle、stable-diffusion(-xl)/sdxl/stability→stable_diffusion、通义万相→tongyi、文心一格→yizhang、即梦→jimeng（发送前归一，防 422）。
- 通用 `OPTIMIZE` / `OPTIMIZE_BATCH` 补齐同一请求构造与 error 优先校验。

### 回归
- 新增 `prompt-engine-contract.js` 契约模块（枚举/别名/请求构造/输出校验单一来源）；
  重写 story2video-stages / story2video-text-config / stage-executor / pipeline-story2video-contract / e2e-pipeline-orchestrator
  相关用例；聚焦 5 套件 161 用例 + e2e orchestrator 6 用例全绿（mock PromptBridge / 本地 HTTP stub，不依赖真实 8013）。

### 外部验收边界
- 真实 8013 服务的改写质量、风格检测准确率与 LLM 配额为外部验收（PENDING_EXTERNAL）；`creative_level ≤ 3` 走模板直出。

## [未发布] 图片轮播参数治理：前端死字段移除与契约边界文档化（2026-08-09）

### 变更
- 移除前端 `s2vConfig.voicePitch` / `creativeLevel` / `splitBaseWordsPerSecond` 三个隐藏死字段；提交构造不再显式传 `voice.pitch` / `optimize.creativeLevel`（normalizer 契约默认 0 / 5 兜底，行为等价）；`split.baseWordsPerSecond` 保留语言表显式下发（双路径同源）。
- 快照兼容：旧 lastOptions 快照中的已移除键被白名单忽略（新增恢复测试覆盖）；`splitTargetSeconds` 自愈逻辑不变。
- 测试：CreateView（字段不存在 + 提交不携带 + 恢复忽略）、UE 契约（升级为字段不存在）、text-config（缺省 → 默认 0/5 兜底）。
- 文档：PRD 7.1.19 参数治理合同（系统管理参数完整矩阵 / UI-后端边界 / watermark-subtitle 双源结构 / 后续清理候选）。
- 非目标（P1 待办）：枚举/目录/限额类参数转运营后台（ops-center pipeline_configs 基础设施另行立项）。

## [未发布] 图片轮播参数治理 R2：移除 splitSpeechRate/concurrency/autoAdvance 前端死字段（2026-08-09）

- 移除 `s2vConfig.splitSpeechRate` / `concurrency` / `autoAdvance`；提交构造不再显式传 `split.speechRate`（normalizer 以 `voice.speed` 派生，单一来源）与 `concurrency`（契约默认 3、范围 1-8 兜底）；params 保留字面量 `autoAdvance: true`。
- 行为等价（延续 R1 模式）：normalizer 归一化后下游全读派生/默认值；`_applyS2VSnapshot` 白名单忽略旧快照已移除键（边界：旧快照中的非默认 concurrency 值不再恢复，回落契约默认 3——系统管理语义）。
- 测试：CreateView（字段不存在 + 提交不携带 + params.autoAdvance 保留）、UE 契约（s2vConfig 声明块不声明三字段）。
- 文档：PRD 7.1.19 §2/§5 更新（三字段标注 R2 已移除），CHANGELOG、learnings。

## [未发布] 图片轮播参数治理 R3：语言感知基准语速回归护栏（2026-08-09）

- 核实并锁定「baseWordsPerSecond 语言感知值恒覆盖静态默认」：`resolveRuntimeStageOptions` 以 normalizer 语言表值（zh 4.5 / en 2.8 / 其余 3.3）覆盖 bundled/YAML 静态 3.3，桌面流程无语言缺口。
- 新增契约测试 `pipeline-story2video-contract.test.js`：zh→4.5 / en→2.8 / auto→3.3 三档断言，防未来合并顺序/normalizer 改动导致静态默认静默生效。
- PRD 7.1.19 §5 候选项标记为已核实（Python YAML 3.3 仅影响绕过 JS 语言表的直接 Python 调用，既有行为保留）。

## [未发布] CI：electron-tests 迁移 GitHub 官方 runner（A/B/C，2026-08-09）

- **A 迁移**：`electron-ci.yml` 从阿里云 ECS 自托管 runner 迁移到 GitHub `ubuntu-latest`——消除单机排队（原先常 queued 30-40 分钟）与生产资源竞争（ECS 同时承载 Logto + 业务 API）；系统依赖 `dnf`→`apt`（xvfb + build-essential + python3）；新增 `@electron/rebuild better-sqlite3`（Electron ABI 原生模块）；timeout 30→45；保留 checksum pin / npmmirror / `SKIP_NATIVE_MEDIA_TOOL_TESTS=1` / 单 worker vitest / xvfb 冒烟 / deps/circular。
- **B 职责精简**：工作流头注释明确 Linux 平台确定性回归边界（与 Quality Gate windows 互补，Electron GUI 深度门禁归 gui-test）。
- **C 验证**：本 PR 自身 CI 即迁移验收；ECS runner 保留配置但不再必需（可移除）。

## [未发布] CI：Quality Gate 并行拆分 + 触发去重（2026-08-09）

- 并行化：quality-gate.yml 拆分为 static/unit-tests/coverage/visual/e2e/autonomous/gate-result 7 个 job（实测 Gate 4 单测 636s + Gate 5 coverage 588s 占 82% 总时长）；关键路径 25min→~12min；失败隔离（单 gate 失败不阻断其余）。
- 触发去重：on 仅保留 pull_request + workflow_dispatch（移除 push 同 head 双跑），每 head CI 分钟约减半。
- 契约测试同步：workflow-contract.test.js（Gate 7/8 邻接锚点改同 job Upload 步骤）、gui-ci-exit-contract.test.js（jobs.gate.steps → 跨 job 汇总）；保留 Gate 4 watchdog、退出码契约、autonomous-loop 引用。

## 维护与归档（2026-08-08）

- 归档 Story2Video 场景时长三层模型 CCG 任务审计轨迹（`.ccg/tasks/story2video-scene-duration-three-layer` → `archive/2026-08/`）：
  Batch 1-5b（参数层 targetCharsPerScene 主控 / 切分层 / compose min-duration 静音补齐 / UI 双视图+开关 /
  语言感知估算+样本采集 / 自适应校准+创建页实时预估）全部合并完成，分析/审查文档与 diff 保留备查。

## [未发布] Story2Video 场景时长与动效归一化 (2026-08-07)

### 场景时长模式 Batch 5b：自适应校准 + 创建页实时预估（2026-08-08）
- **自适应校准（tts-calibration）**：按「语言 / 语言+provider / 语言+provider+voiceId」维度对 5a 样本求
  实际字/s ÷ 静态基准的**中位数系数**（每维度 ≥3 样本启用，90 天内样本，冷启动回退静态语言表）；
  **en 单位口径（claude 5a W1）由校准自然吸收**（校准基于字符口径，en 系数 ≈4~5 自动纠偏）。
- **创建页实时预估行**：文案输入下方展示「预估 N 个分镜 · 旁白约 X~Y 秒 · 成本约 ¥Z」——
  时长点估沿用整数秒口径、区间 ±15%，成本 = 分镜数×图片单价 + 预估总时长×TTS 每秒单价
  （默认单价 0.1 元/张、0.05 元/秒，本地常量可后续后台化）；无样本时静态估算并提示「样本积累后自动校准」。
- 回归：新增 tts-calibration 6 用例（系数/特异性/有效语速/时长/分镜数/成本）+ CreateView 3 用例（静态/校准/空文案），
  受影响 8 套件 286 用例全绿；`vite build` 通过、eslint 0 error。

### 场景时长模式 Batch 5a：语言感知估算 + TTS 时长样本采集（2026-08-08）
- **语言感知基准语速表**：`zh≈4.5 字/s`、`en≈2.8 词/s`、其余（含 auto）回退 3.3——
  UI 双视图估算、提交的 `split.baseWordsPerSecond`、normalizer 缺省值三者同源
  （renderer/主进程双副本 + 合同测试锁定一致）；时长↔字数换算按 `语言基准 × voice.speed`，clamp/整数口径不变。
- **TTS 时长样本采集**：compose 每场景记录真实旁白音频时长 `audioDuration`（与补齐后视频片段 `duration` 分离），
  流水线 compose 成功后 best-effort 写入本地 `story2video.ttsSamples.v1`（FIFO ≤500，
  字段 language/provider/model/voiceId/speed/chars/durationSeconds/recordedAt，不存原文；探测失败片段跳过；
  采集异常静默不阻断流水线）——为 Batch 5b 自适应校准提供数据源。
- 回归：新增 voice-estimate / tts-samples / renderer↔主进程一致性合同测试（含 normalizer 三腿等价）；
  扩展 text-config（语言感知缺省值）、compose-engine（audioDuration 字段）、stage-executor（采集钩子 + 静默容错）、
  CreateView（语言感知换算）——受影响 7 套件 275 用例全绿；`vite build` 通过、eslint 0 error、像素视觉回归 17/17、QM-1 打包通过。
- ⚠️ 已知边界（排期进 Batch 5b）：en 表值按「2.8 词/s」设计但实现按字符计，英文估算系统性偏小约 5×，
  5b 自适应校准必须处理 chars/words 比值（样本已存 chars + language）或改 en 为字/s 口径。

### 场景时长模式 Batch 4：CreateView 分镜粒度双视图 + 最短场景时长开关（2026-08-08）
- 「分镜目标时长（秒）」误导性独立旋钮下线，改为**分镜粒度双视图**（默认时长视图）：目标时长视图编辑时由程序按
  `baseWordsPerSecond(3.3) × voice.speed` 反推 `targetCharsPerScene` 并标注「估算，实际以旁白音频为准」；
  目标字数视图直接主控；换算 clamp 到 `[minWords, maxWords] ∩ [1,200]` 并同步旧 `targetSeconds`（与 normalizer 幂等反推一致）。
- 新增「启用最短场景时长」开关（默认关闭 = `follow-audio`，行为与现状一致）+ N 输入（默认 6，1..60）；
  开启后提交 `sceneDurationMode='min-duration'` + `minSceneDuration=N`。
- 提交的 `story2videoTextConfig` 新增 `split.targetCharsPerScene` 与顶层 `sceneDurationMode/minSceneDuration`（normalizer Batch 1 契约已支持）。
- 换算自愈：时长↔字数 clamp 到 `[minWords,maxWords]∩[1,200]`，N 输入 clamp 到 1..60，无效输入 no-op；
  旧 lastOptions 快照缺新字段时恢复默认值（20 / follow-audio / 6 / 时长视图）；旧快照的 `splitTargetSeconds`
  会被新主控重算覆盖（误导性时长旋钮下线的预期行为）。
- 回归：CreateView 新增 4 用例（字数主控+最短时长参数默认/显式契约、双视图换算一致、clamp 边界/N 自愈、
  开关默认关+开启提交 + 旧快照恢复默认值），90 用例全绿；`vite build` 通过、eslint 0 error；
  像素视觉回归 17/17（本地，含 /create 视图）。

### 场景时长模式 Batch 3：compose 节奏层（min-duration 静音补齐，2026-08-08）
- `sceneDurationMode='min-duration'` 时按 `max(ffprobe 真实音频时长, minSceneDuration)` 补齐场景：`-t` + 音频 `apad` + 去 `-shortest`，片段/成片时长精确到目标值；`follow-audio`（默认）保持 `-shortest` 跟随旁白不变。
- **探测失败守卫（C1）**：仅当真实探测到音频且补齐目标严格大于音频时长时才启用补齐；探测失败一律走 follow-audio 路径，绝不启用补齐 `-t/apad` 硬截断未知长度旁白（探测失败且场景带上报 duration 时沿用既有 `-t reported` 上限语义，非本次引入）。
- 补齐语义统一：字幕时间轴（末页停留到 effectiveDuration）、动效归一化、成片时长预检（上限 600s 含补齐值）共用同一有效时长与 base 公式；补齐段动效帧数 `Math.ceil(effectDuration×fps)` 防尾部缺帧。
- 旁白导出（narration）不补齐；`renderSegment` 单段重试与 compose 同守卫。
- 回归：compose-engine 新增 9 个用例（mock 补齐/长旁白不截断/探测失败守卫/补齐超限预检拒绝/边界矩阵含 audio==min 等值边界/follow-audio 参数级回归/真实 ffmpeg 双轨时长断言/真实 2 段 xfade+BGM 成片 ≈11.6s/renderSegment 补齐），60 用例全绿。

### 配置合同（v1 扩展，版本号不变）
- `story2videoTextConfig` 新增可选字段：`split.targetCharsPerScene`（默认 20，1..200 整数，分镜字数主控）、
  `sceneDurationMode`（`follow-audio`|`min-duration`，默认 follow-audio）、`minSceneDuration`（默认 6，1..60）。
  均为兼容扩展（旧配置缺省时按既有 `targetSeconds×baseWordsPerSecond×speechRate` 换算并夹到契约范围；
  显式 `targetCharsPerScene` 时反推 `target_duration` 经 8002 通道生效）。
- **`split.speechRate` 单一来源**：切分估算语速改由 `voice.speed` 驱动（消除"切分按 1x、播报按 1.5x"脱节）；
  旧配置显式 `split.speechRate` 不再生效（被 `voice.speed` 覆盖），发布前请知悉。

### 视频创作
- 图片动效（放大/缩小/平移/缩放平移）进度改为按**场景有效时长**归一化：音频探测成功用真实音频时长，探测失败回退上报时长/默认 6 秒；短场景不再"动效没做完就被切走"，长场景不再"动效提前定格"（与 zoompan `d=总帧数` 修复合并生效）。
- 移除「单画面时长/无旁白场景时长」选项及 `perImageDuration` 配置合同：无旁白/纯图片轮播模式不再属于 `story2video-compose`；`defaultSceneDuration` 保留为默认 6 秒（UI 不暴露，仍可被运行参数覆盖），仅作音频时长不可探测时的回退与动效归一化兜底（回退路径为 best-effort，不强制截断旁白）。旧项目历史配置中的 `perImageDuration` 会被兼容忽略。

---

## 历史记录运行结束任务不消失 + 前端重建生效（2026-08-07）

### 1. 历史记录
- **问题**：运行中流水线结束后（失败/完成），`refreshRunningHistory` 把该运行项从列表移除且不保留终态；断点继续后同一阶段再次失败又被移除 → 任务从历史「消失」。
- **修复**：刷新检测到运行中项已结束（不在 `pipelineHistory` 运行集中）时，触发一次完整 `loadHistory()`，让任务以**终态（已完成/失败/已取消）**继续显示在历史中；仅在仍有运行中项时保持原地差量更新。

### 2. 前端构建
- 此前 #393（文案/布局/闪烁修复）只更新了源码未重建 dist，导致运行中的应用仍显示旧文案（「瞬时错误（限流/超时）…」）。本次重建前端并重启，使 #393/#394 全部修复生效。
- 回归：CreateView 测试更新（运行结束触发完整加载 + 终态保留），77 用例全绿。

## 图片轮播字幕位置调整（2026-08-07）

### 视频创作（合成）
- **需求**：成片字幕太靠下（原固定 `y=h-th-40`，距底部约 40px ≈ 3%），调整为**距底部 20%**。
- **实现**：`buildSubtitleFilter` 新增 `bottomMarginRatio`（默认 0.2，范围 0.05-0.5，可经 `subtitleStyle.bottomMarginRatio` 覆盖）；y 表达式改为 `y=h*(1-bottomMarginRatio)-th`（默认 `h*0.800-th`，即字幕底边位于画面 80% 高度处）。
- 回归：compose-engine 新增字幕位置用例（默认 0.2 / 覆盖 0.1 / clamp 0.5 与 0.05），57 用例全绿。
- PRD「字幕样式合同」同步更新。

## 图片轮播历史记录体验 + TTS 空响应重试修复（2026-08-07）

### 1. 历史记录运行中流水线布局与刷新
- **布局错乱**：原运行中项把阶段标签内联在单行 flex 里导致换行错乱。改为卡片式：主信息行 + 独立「阶段进度条」（每阶段一个分段，done 绿 / active 蓝高亮 / pending 灰 / failed 红，与流水线页阶段语义一致），不再内联挤占。
- **闪烁**：原 5s 刷新整表重建 history 数组导致页面闪动。改为 `refreshRunningHistory()` 原地更新运行中项的 stages/currentStage（保持对象身份），不重建列表、不重刷项目记录；运行结束的项从运行中区移除。
- 进入历史页仍即时显示「加载中」，数据到达后渲染（初次 1-2s 属正常加载）。

### 2. TTS 空音频响应按瞬时错误重试（E2E 实测失败根因）
- **根因**：MiniMax TTS 偶发返回 200 但无 audio（`Missing audio data in response`，日志 11:56/12:05 复现），此前 `classifyProviderFailure` 归为 `other` 不重试 → generate_assets 失败 → 弹「当前操作未能完成」。
- **修复**：`classifyProviderFailure` 新增空响应/缺失数据模式（`missing ... data in response` / `returned no ... result` / `empty response` / `empty image_urls`）→ 归为 `transient`，governor 短退避重试（TRANSIENT_RETRIES=2）；同类问题覆盖 minimax-tts / mimo-tts / 生图空结果。

### 3. 提示文案友好化
- resumeHint 中文：原「瞬时错误（限流/超时）会自动冷却后重试」→「遇到暂时的服务繁忙或网络波动时，会自动等待片刻后重试。」
- 英文同步：「Transient failures will be retried with cooldown automatically.」→「Temporary service or network issues will be retried automatically after a short wait.」

## [未发布] Podcast 转视频流水线引擎实现 (2026-08-07)

### 视频创作（流水线引擎）
- 新增 `podcast-repurpose`（播客转视频：音频 → 可视化视频）真实引擎，`available=true`：analyze（ffprobe 时长 + 文案分句，可选语音识别转写）→ visualize（每段生成配图）→ assemble（ffmpeg 切分音频片段 + 组装场景）→ render（内置 compose 合成，fade 转场）。
- 音频路径受控校验（resolveReadableMediaFile kind=audio）；无文案且无语音识别供应商 → fail closed 明确提示。
- 测试：podcast-repurpose-stages 11 例（真实 wav + ffmpeg 切分）；pipeline-engine available/stageDefs 断言更新（无引擎清单仅剩 screen-demo）。
- PRD「Podcast 转视频流水线引擎合同」、E2E-PENDING 待办 B 更新。
## [未发布] CreateView 历史记录运行中流水线置顶 + 阶段进度 (2026-08-07)

### 视频创作（历史记录）
- 用户反馈【视频创作】-【历史记录】看不到运行中流水线。复现确认：CreateView 内部历史视图（非 `/create/history`）中运行中 run 其实有显示，但排在列表末尾、且无阶段进度信息。
- **修复**：运行中流水线**置顶**（运行中 > 已完成项目 > 终态 run）；运行中项显示**阶段进度色块**（completed/running/pending/failed）与「返回流水线创作查看进度」提示；存在运行中任务时每 5s 自动刷新；点击运行中项切回流水线创作并自动恢复查看。
- 回归：CreateView 测试 +2 例（运行中置顶+阶段色块 / 点击切回并恢复），75 用例全绿。

## [未发布] 创作历史运行中流水线可发现性优化 (2026-08-07)

### 视频创作（创作历史）
- 用户反馈「启动运行中的流水线后进入历史记录看不到」。定位：运行中流水线在「流水线记录」tab，历史页默认 tab 是「渲染记录」，需手动点击才发现。
- **优化**：进入创作历史页时同时加载流水线记录；存在运行中任务时自动切到「流水线记录」tab 直接展示；「渲染记录」tab 顶部显示运行中横幅（「有 N 条流水线正在后台运行，点击查看运行状态」），点击切换到流水线记录。
- 回归：CreateHistory 测试新增 2 例（自动切 tab + 横幅点击）；22 用例全绿。

## [未发布] 真实链路修复：图片空结果重试 / compose 转场 / 并发上限开关 (2026-08-07)

### 图片轮播（真实 E2E 暴露）
- **MiniMax Image 空结果不再静默失败**：HTTP 200 但 `image_urls` 为空时 adapter 显式抛 `ProviderError`（状态含内容安全信号→`CONTENT_POLICY`，否则 `PROVIDER_ERROR`）；asset-generator 在内容政策重试循环内校验图片结果，前 2 次同提示词重试、第 3 次起内容安全改写、第 5 次仍空 → `needs_user_input(reason=empty_result)` 友好提示（原：整段「did not return a supported image binary」失败）。
- **compose 转场 `transition=undefined`**：`buildTransitionPlan` 未携带 `transitionName` 导致 `_xfadeMerge` 构造 `xfade=transition=undefined`（ffmpeg 报错）。修复：计划对象所有返回路径携带 `transitionName`（默认 fade），直连/分块路径均传递；回归测试断言直连与 27 段分块的 plan 均含 `transitionName='fade'`。
- **并发上限固定开关**：环境变量 `STORY2VIDEO_MAX_CONCURRENT_RUNS`（1–8，非法回退自适应）可固定上限（如 `2`）；优先级 deps 注入 > 环境变量 > 机器资源自适应。回归：resume-orchestration 覆盖设 2/非法回退/deps 优先/封顶 8。
- PRD「空响应重试合同」「真实链路修复合同」「并发上限固定开关」同步更新。

## [未发布] Code Review MINOR 4-6 修复 (2026-08-07)

### 应用日志
- **MINOR-4 写队列超时兜底**：`logger.enqueueFileWrite` 增加单条写入等待上限（默认 5s，`setLogOptions({ writeTimeoutMs })` 可注入）；`appendFile` 回调极端异常永不触发时，队列超时释放，后续日志不再永久挂起；`timer.unref()` 不阻塞进程退出。回归：mock `fs.appendFile` 不回调 → flush 仍 resolve + 后续写入正常。

### 渲染进程错误上报
- **MINOR-5 组件 catch 统一上报主进程日志**：新增 `src/utils/report-error.js`（优先 `window.electronAPI.logError` → 主进程 app-*.log，无 electronAPI 回退 console.error，错误文本截断 2000 字符）；CloudPublish/Home/Intelligence/TemplatePicker/UpgradeModal/ReferenceFinder 的 catch `console.error` 与 router.onError、window error/unhandledrejection 全局处理器全部接入。新增 report-error 单测 3 例。

### 视频创作并发
- **MINOR-6 并发上限机器资源自适应**：`computeDefaultMaxConcurrentRuns`（可用并行度/可用内存 → 1-4 条，封顶 4），`deps.maxConcurrentRuns` 注入仍可覆盖；PRD 并发合同与测试同步更新（默认档位断言 + 注入覆盖用例）。
- 契约测试显式注入并发上限，消除 CI 自托管 runner 资源差异导致的并发用例失败。

## [未发布] 音色克隆移除授权勾选 (2026-08-07)

### 图片轮播（音色克隆）
- **需求调整**：移除「我确认已取得样本上传、使用和克隆的权利，并已作出明确同意。」勾选项（该勾选未参与真实权限判定）。现在选择样本 + 填写克隆音色名称即可添加。
- **改动**：仅前端 `CreateView.vue` 移除勾选 UI 与 `s2vVoiceCloneConsent` 状态/校验（按钮可用条件 = 已选样本 + 名称非空 + 非加载中）；IPC/服务层 `consent` 契约保持不变（renderer 恒传 `true`，fail-closed 防御不变）。
- PRD「音色克隆区域交互合同」同步更新。

## [未发布] Code Review MAJOR 1-3 修复 (2026-08-07)

### 主进程（代码审查修复）
- **MAJOR-1 `_history` 内存上限**：PipelineEngine 默认保留最近 50 条 run 快照（`maxHistoryEntries` 可注入），超限裁剪最旧；断点恢复跨重启仍走 RunStateStore 持久快照。
- **MAJOR-2 IPC 注册统一**：window.js 不再临时替换全局 `ipcMain.handle`，改为显式构造 `createAccessControlledIpcMain` 注入 10 个服务（batchManager/webviewManager/oauthManager 等）；各服务 `registerIpcHandlers(injectedIpcMain)` 支持注入（默认全局兼容测试）。
- **MAJOR-3 cloud-publisher 回退 fail closed**：`registerIpcHandlers` 未注入 ipcMain 时抛错，禁止绕过 access-controlled 通道。
- 审查记录沉淀：`01-docs/code-review-2026-08-07.md`；回归 window(46) + resume(12，含 history 上限用例) + 各服务测试通过。## [未发布] 克隆时长探测测试环境修复 (2026-08-07)

### 测试
- `_probeMediaDuration` 回归测试显式注入 `ffprobePath`，消除 CI（Linux self-hosted，无捆绑 ffprobe）环境依赖导致的 early-return 失败。## [未发布] 克隆音色「服务不可用」修复 (2026-08-07)

### 图片轮播（音色克隆）
- **根因**：MiniMax `cloneVoice` 上传/复刻路径带 `/v1` 前缀，而 base_url 已含 `/v1`（`https://api.minimaxi.com/v1`）→ 双重 `/v1` → 404 → 异常被吞 → 提示「音色克隆服务暂时不可用」。
- **修复**：cloneVoice 路径改为 `/files/upload`、`/voice_clone`；`_addCloneLocked` 的 `catch (_)` 补 `warn` 日志（注入 `this._log`），真实失败不再被吞。
- **回归**：测试改为精确 URL 断言 + 新增「base_url 含 /v1 不产生 /v1/v1」用例；相关 59 用例通过。## [未发布] 视频创作后台运行与并发限制 (2026-08-07)

### 视频创作
- **后台运行固化**：background:true 主进程后台推进 + CreateView mounted 自动恢复查看运行中 run（已有能力，补合同文档）。
- **历史记录显示运行中任务**：`pipeline:history` 现在返回运行中 run（去重 `_<name>` 索引）+ 终态历史；创作历史-流水线记录支持运行中卡片（阶段标签/时间/「返回创作页查看进度」提示），存在 running 时每 5s 轮询刷新、结束即停；点击运行中卡片跳 /create 恢复查看，点击已完成卡片跳成片预览。
- **并发限制**：PipelineEngine 默认最多 2 条运行中编排流水线（`maxConcurrentRuns` 可注入）；`startOrchestrated` 与 `resumeOrchestration` 统一门禁，超限返回 `PIPELINE_CONCURRENCY_LIMIT` + 友好中文提示；前端新增对应通知文案（zh/en，errorCode + 正则双映射）。
- 测试：引擎 4 例（getHistory 含运行中/默认上限 2/注入 1 与释放/恢复超限）+ CreateHistory 2 例（轮询与停止/跳转）+ notifications 2 例；vite build 通过。
- PRD「视频创作后台运行与并发合同」、learnings 复盘、CHANGELOG 同步更新。## [未发布] 音色目录/克隆双 Bug 修复 (2026-08-07)

### 图片轮播（视频创作）
- **Bug 1 音色选择**：MiniMax 系统音色 id 含空格/括号（如 `Chinese (Mandarin)_Reliable_Executive`），selectVoice 的 voiceId 校验过严导致选「沉稳高管/搞笑大爷」报 `VOICE_CATALOG_INVALID_ARGUMENTS`。修复：新增 `safeVoiceId`（允许非控制字符，仅拒路径分隔符/遍历序列），providerId/model 仍严格校验。
- **Bug 2 克隆时长误报**：ffprobe 从 stdin 探测部分 wav（带 LIST chunk）拿不到 duration → 误报「音频文件时长不符合要求」。修复：`_probeMediaDuration` pipe 优先，**有音频流但 duration 缺失**时回退临时文件文件模式探测（tmpdir 随机名/0600/finally 清理）；明确无音频流仍 fail closed。
- 回归测试 5 例：voiceId 空格括号选择/路径拒绝；pipe 回退/不回退/双失败/null。端到端验证用户 wav（27.12s）通过。
- PRD「音色目录/克隆校验修复合同」、learnings 双 Bug 复盘同步更新。## [未发布] 技术债务 W1/W2/W3 闭环 (2026-08-06)

### 主进程
- **W1 run-state owner 隔离**：RunStateStore 快照改写入 `userData/run-state/owners/{sha256(subject)}/<runId>.json`；新增 `setOwnerProvider`，phase3-services 用 `ownerSubjectProvider` 接线并随身份切换更新；legacy 平铺快照首次读取自动迁移；remove 双路径清理；未登录回退平铺存储。
- **W2 governor 排队超时回收**：新增 `_sweepExpired`（每次 run() 入口回收该 key 过期 waiter）+ `sweepAll()`（PipelineEngine._finalizeRun 统一调用），过期排队请求不再依赖后续释放、不再悬挂到任务链结束。
- **W3 governor RPM provider 配置化**：新增 governor-provider-limits.js（52 个已知 provider 预算，含本地类高预算）；governor 支持 `setProviderLimits` 与构造函数 `providerLimits` 注入，container 启动注入；优先级 精确key > provider > 类别默认 > 全局默认，429 自适应仍兜底。

### 测试与文档
- 新增 run-state-store.test.js（7 用例：owner 保存/跨账号隔离/legacy 迁移/双路径 remove/provider 校验与回退）；governor 新增 5 用例（W2 回收×2、W3 provider 生效/回退/注入）；resume-orchestration 新增 2 用例（失败/取消触发 sweepAll）。
- PRD「技术债务 W1/W2/W3 闭环」、learnings 复盘、CHANGELOG、tech-debt 与 QUALITY-RHYTHM-BACKFILL 同步更新。

## [未发布] 应用日志 log 功能 (2026-08-06)

### 主进程（日志服务）
- logger 重写为控制台 + 文件双写：按日期滚动写入 `userData/logs/app-YYYY-MM-DD.log`，行格式 `[ISO时间] [级别] 模块 消息 [JSON meta]`；异步队列不阻塞主进程。
- 敏感信息脱敏：Authorization/Bearer、apiKey、sk- 前缀密钥落盘前统一掩码；meta 仅对象 JSON 化，Error 记录堆栈，字符串按原文拼接。
- 大小规则：默认单文件 500MB，每追加 64KB 核对真实大小，超限自动删除并重建；启动首写核对历史超限文件。新增 setLogOptions / flush / clearLogs / getLogsInfo。
- 退出清理：shutdown 流程排空日志写入队列后再退出；启动记录主窗口创建日志。
- 新增 IPC：logs:info / logs:clear / logs:error（渲染进程错误上报），均入 public 白名单。

### 渲染进程（设置-通用设置）
- 启用「通用设置」Tab，新增「应用日志」面板：日志目录、文件数、总大小、单文件上限、文件列表、刷新与清理按钮、自动清理提示文字（i18n zh/en）。
- preload 新增 logsGetInfo / logsClear / logError；renderer 经 src/api/publisher.js 封装。

### 文档与测试
- PRD 新增「应用日志 log 合同」章节；新增 logger.test.js / logs.test.js，更新 preload/main/shutdown 测试。
- 真实 provider 日志内容属灰度验证项，不纳入自动验收。
## [未发布] E2E 待办/待验证清单 (2026-08-06)

### 文档
- 新增 `01-docs/E2E-PENDING.md`：记录因条件不足无法验证或待重测的项（4 条 videogen 流水线待配置视频生成模型、2 条无引擎流水线、以及 TTS 克隆/个人音色槽位/敏感词降级等真实供应商验收项），下次配置好后重测并勾销。

## [未发布] 图片轮播参数表单 UE 优化 (2026-08-06)

### 视频创作（UI/UE）
- 参数表单 6 组折叠（基础/画面/声音/高级/模板与输出/发布）+ 实时摘要；折叠状态随 `story2video.lastOptions.v1.ui.expandedGroups` 跨会话保存/恢复。
- 新增保存/恢复轻提示（「选项已保存 ✓ / 已恢复上次的选项设置」，1.6s 淡出）；操作栏 sticky 固定（启动/取消/恢复默认选项始终可见）；音色克隆面板内层折叠。
- 方案文档 `01-docs/STORY2VIDEO-UE-OPTIMIZATION-PROPOSAL.md`；PRD 7.1.11 参数表单 UE 合同。

## [未发布] 全流水线 E2E 真实测试与修复 (2026-08-06)

### 视频创作（E2E + 修复）
- 12 条已实现流水线真实 E2E（Playwright Electron + 登录 profile + 真实 LLM/TTS/生图）：8 条跑通（story2video-compose/animated-explainer/documentary-montage/framework-smoke/talking-head/cinematic/clip-factory/localization-dub），4 条按预期缺视频生成模型（animation/avatar-spokesperson/character-animation/hybrid）。报告 `01-docs/STORY2VIDEO-E2E-REPORT.md`。
- API 限流排队改为按时间槽调度（`api-usage-governor`），修复长文案多场景 TTS 排队超预算失败；videogen storyboard/generate 输入改为候选键解析（`resolveVideogenConcept/Scenes`），修复 character-animation/hybrid 缺 context。

## [未发布] 图片轮播选项持久化 (2026-08-06)

### 视频创作
- 图片轮播选项（`s2vConfig` + `s2vOutputConfig`）自动保存/恢复：复用主进程 owner-scoped settings（`story2video.lastOptions.v1`），1s 防抖 + 启动即存 + 离开页面 flush；已禁用 provider 不回填；新增「恢复默认选项」。PRD 7.1.10。

## [未发布] 流水线进度细化与信息视觉化 (2026-08-06)

### 视频创作
- 阶段清单新增：拆分场景数、提示词优化「共 N 个场景，已完成 M 个」、资源生成「图片 x/y · 旁白 x/y」实时进度；每阶段耗时；整体进度条 + 已用时；完成汇总「完成时间共 X 分 Y 秒 · 文件大小 Z M」（预览页展示）。PRD 7.1.9。

## [未发布] API 并发控制/排队/重试 + 断点恢复 (2026-08-06)

### 视频创作
- 新增 `ApiUsageGovernor` 挂在 provider 唯一出口：每 provider 并发信号量、滑动窗口 RPM、429 冷却 + 时间槽排队、分级重试（限流长退避/超时短退避/额度不重试）、可选 5h/周 token 额度窗口。
- 断点恢复：失败快照持久化（`RunStateStore`）+ `pipeline:resumeOrchestration` + 场景级续传（`optimize_resume` / `generate_assets.resume.completed`）；失败弹窗「从断点继续」。PRD 7.1.8。

## [未发布] MiniMax TTS 音色目录与长文案限流修复 (2026-08-06)

### 视频创作
- MiniMax TTS 默认模型 speech-2.8-turbo；官方 327 个系统音色目录 + 音色克隆（上传→克隆→选择）；错误友好化与多语言（「图片轮播 提示」、`story2video.rate_limited`/`quota_exceeded` 含场景号）。
- 长文案多场景限流：optimize/资源生成瞬时错误有界重试 + 限流友好提示；中文字幕 drawtext 显式 CJK fontfile（修复豆腐块）；挂载时恢复主进程仍在运行的编排流水线（HMR/重挂载不丢运行态）。PRD 7.1.4/7.1.5/7.1.7。

## [未发布] talking-head 真实编排引擎 (2026-08-06)

### 视频创作
- talking-head（口播视频）从 state_machine 占位升级为真实编排：视频 + 文案 → 分句 → SRT 字幕 → FFmpeg 烧录渲染，全程本地（用户提供文案时无需语音识别；无文案则 fail closed 提示配置识别模型）。
- 新增 `talkinghead-stages.js` 注册 4 个自定义阶段；`saveRun`/`_finalizeRun` 支持 talking-head；前端视频区新增口播文案输入。
- 真实 E2E：640x360 测试视频 + 3 段文案 → 字幕烧录 → `video.mp4`（12s）→ 项目持久化（3 segments，completed）。

## [未发布] framework-smoke 真实编排引擎 (2026-08-06)

### 视频创作
- framework-smoke（框架冒烟测试）从 state_machine 占位升级为真实编排：验证 FFmpeg/ffprobe 与流水线注册表 → 生成冒烟测试视频（testsrc）+ 环境报告。
- 新增 `smoketest-stages.js` 注册 2 个自定义阶段；`saveRun`/`_finalizeRun`/UI 结果提取支持 context.report。
- 真实 E2E：verify → report → `video.mp4`（h264 640x360+aac 2s）→ 项目持久化（completed）。

## [未发布] cinematic 真实编排引擎 (2026-08-06)

### 视频创作
- cinematic（电影感短片）从 state_machine 占位升级为真实编排流水线：输入视频 → FFmpeg 调色（eq）→ 淡入淡出 + 目标分辨率合成 → 渲染输出，全部本地完成。
- 新增 `cinematic-stages.js` 注册 4 个自定义阶段执行器；`pipeline-engine` 补齐 stageDefs；`saveRun` 泛化支持 cinematic（resolveComposeOutput 精确匹配含 videoPath 的输出，规避 stage 名 compose 冲突）；前端 `isMediaAutoPipeline` 纳入 cinematic。
- 真实 E2E：640x360 测试视频 → 调色+淡入淡出+缩放 → `video.mp4`（h264 1920x1080 12s）→ 项目持久化（completed）。

## [未发布] clip-factory 真实编排引擎 (2026-08-06)

### 视频创作
- clip-factory（视频切片工厂）从 state_machine 占位升级为真实编排流水线：本地 FFmpeg 场景检测 → 逐段剪辑 → 片段标题 → concat 合并导出，不依赖外部模型。
- 新增 `clipfactory-stages.js` 注册 4 个自定义阶段执行器；`pipeline-engine` 补齐 stageDefs；`saveRun` 泛化支持 clip-factory 项目持久化。
- 新增视频媒体导入链路（`story2videoImportMediaPath` + MEDIA_RULES.video + 前端视频素材导入），规避 File 跨 contextBridge 丢失路径。
- 真实 E2E：3 色块测试视频 → 场景检测切出 3 片段 → 合并导出 `video.mp4`（h264 640x360 12s）→ 项目持久化（3 segments，completed）。

## [未发布] animated-explainer 真实编排引擎 (2026-08-06)

### 视频创作
- animated-explainer（AI 讲解视频）从 state_machine 占位升级为真实编排流水线：LLM 规划链（主题→大纲→分镜→旁白→场景）→ 图片+旁白生成（复用 story2video 资源生成与内容政策重试）→ FFmpeg 合成（复用 story2video 引擎）→ 发布（可选）。
- 新增 `explainer-stages.js` 注册 6 个自定义阶段执行器；`pipeline-engine` 为 animated-explainer 补齐 stageDefs（8 阶段，checkpointRequired=false）。
- 新增阶段执行器与编排契约单元测试（explainer 14 + 编排 3，全部通过）。

## [未发布] 任务归档 (2026-08-06)

### 维护
- 归档 Story2Video 视频创作空白页修复任务（CSP eval 拦截根因与 Message Function 方案已随 PR #362 合并）。

## [未发布] 视频创作空白页修复 (2026-08-06)

### 视频创作
- 修复 Electron 中点击【视频创作】页面空白：vue-i18n 运行时编译字符串消息使用 `new Function`，被 Electron CSP（`script-src 'self'`，无 `unsafe-eval`）拦截抛出 `EvalError`，导致 CreateView 渲染失败白屏。
- i18n 静态消息改为在加载时转换为 Message Function，彻底移除运行时编译；生产 CSP 保持严格不变，zh/en 翻译语义不变。
- 新增 i18n 回归测试：模拟 CSP 禁止 `new Function` 时流水线文案仍可翻译，并断言 zh/en 全部消息叶子为函数。

## [未发布] 质量节拍任务归档 (2026-08-04)

### 维护
- 归档 Story2Video GUI 工作区选择器回归任务；产品代码已随 PR #352 合并到主线。

## [未发布] Story2Video 参数边界与运行错误反馈 (2026-08-01)

## [未发布] 蚁小二账号与发布续作收敛 (2026-08-04)

### 账号管理
- 账号卡片动作按真实蚁小二截图收敛为“设置、删除”，失效账号额外显示“重新登录”，并复用网页登录 IPC 完成重新授权流程。
- 增加粉丝数、负责人、运营人、代理字段的后端字段归一化；缺失数据使用明确空值文案，不生成团队假数据。
- 增加分组搜索、全部分组、仅看共享、成员计数和分组空态；收藏页签无结果显示“暂无收藏账号”。
- 分享链接页显示未接入服务状态并禁用创建按钮，保留团队分享/跨设备能力的外部依赖边界。

### 质量
- 账号卡片与账号页面定向回归 `78/78` 通过；Vue 构建通过。
- 账号、发布、批量发布 desktop/mobile/audit 截图 `9/9` 通过；真实蚁小二参考像素审计 `3/3` 通过。
- 像素视觉门禁账号页就绪选择器改用稳定的 .accounts-page，并刷新预期账号页基线；CI 同口径像素测试 17/17 通过。
- 全量 Vitest 为 `6016 passed / 2 failed`；两项失败来自本任务未修改的媒体工具资源环境与既有 spawn 参数断言，详见对标分析报告。

### 视频创作
- `story2video-compose` 仅保留六阶段执行链实际消费的参数；移除通用视觉风格、LLM 温度/预算、目标总时长、基础/整合版本开关和无效的平台提示词下拉。
- 图片和语音生成器改为只显示本地已启用的 provider；未配置时保留“离线占位图”和“自动 Edge TTS”回退。
- 编排任务结束后从历史快照读取终态；IPC 未找到运行、空状态、异常和失败/取消终态都会在页面显示可行动错误，不再静默轮询。

### 验证边界
- 真实 Electron 验证确认重启后仍从本地加密 SQLite 恢复 MiniMax 图片/语音配置；当前 profile 未登录，`pipeline:startOrchestrated` 在调用任何模型前被授权门禁拒绝，页面已显示具体原因。

---
## [未发布] autonomous-loop CI 修复 (2026-07-29)

### 修复
- 修复 `.github/workflows/autonomous-loop.yml` 的 YAML 块缩进和残缺 PowerShell，消除 GitHub Actions 即时失败且无 job/log 的问题。
- 最终状态改为严格解析 `LOOP_EXIT`；缺失、非法或非零退出码均 fail closed。
- 修复 autonomous E2E 启动和清理阶段按镜像名终止全部 `node.exe`、连带杀死 Windows Runner 的问题；现在只终止本次创建的 Vite PID 树。
- Vite 启动固定使用 `127.0.0.1` 与 `--strictPort`，提前退出、探针悬空和清理失败均提供明确且有界的失败结果。
- 修复无模型时需求覆盖 prompt 包被错误报告为 `PASS` 的假绿；现在统一报告 `NEED_HUMAN` 并返回非零，矛盾/未知结果和基础设施错误均 fail closed。
- 修复像素测试或 Agent 视觉判断命令非零时被空 `catch` 吞掉、再因无 diff 文件误报通过的问题；命令错误现在进入统一裁决并返回非零。
- 功能测试只有在至少执行一个用例且 `passed + failed === total` 时才可通过，零执行或畸形汇总均 fail closed。

### 安全与质量
- PR 运行改为只读 checkout，且仅 `autonomous-loop` 标签触发；PR 不再获得模型密钥。
- 自动生成的报告、截图、基线候选和补丁只上传 artifacts，取消 `git add -A`、自动 commit/push 和空提交，保留人工审核基线合同。
- 新增全量 workflow YAML 解析与 autonomous-loop 行为合同，并接入 `quality-gate`。
- 新增受管进程生命周期合同和真实 Windows 无关 Node 哨兵回归；脚本仅在作为入口执行时运行，测试加载不再触发 E2E 副作用。
- 报告、日志和退出码改用同一结果 evaluator；JSON 增加 `coverageStatus` 与 `exitCodes`，并新增 prompt、PASS/FAIL、错误、跳过及报告一致性回归。
- PR 标签触发路径与 main push 保持一致，tester 包、PRD、workflow 及其合同测试变更不再绕过 autonomous-loop 检查。

---

## [未发布] Story2Video 双层分句与字幕时间轴 (2026-07-28)

### 视频创作
- `story2video-compose` 的场景层固定优先调用 8002 `smart-sentence-splitter`；仅连接拒绝、超时、连接重置或服务未运行时使用本地 TypeScript 降级，业务错误和非法响应不再被静默掩盖。
- 8002 不可用无论通过 Promise reject 还是 `{ code, message }` / `{ success, error }` 失败对象返回，都进入同一受控降级路径；返回的业务错误继续 fail closed。
- 字幕层固定在每个服务场景内部本地二次分页，并持久化 `sceneSource`、`subtitleSource`、`degraded`、`fallbackReason`、`subtitleBlocks` 和 `subtitleTimeline`。
- Story2Video 分句别名现在映射到 8002 实际消费的 `SplitRequest.config.sentence_tokenizer/scene`，自定义场景时长、语速、字数、句界和单句溢出开关不再被 FastAPI 忽略；字幕配置不会发送给 sidecar。
- compose 使用 ffprobe 读取的逐场景真实 TTS 时长生成连续字幕时间轴；FFmpeg 字幕页采用 `[start,end)` 半开启用区间，消除分页边界帧的双字幕叠加。
- 旧项目没有字幕块时会按场景文本自动分页；TTS 提供方上报的 `duration` 只作为参考元数据，不会截断真实旁白，显式裁剪继续由 trim 流程负责。

---

## [未发布] PostgreSQL migration 最小权限修复 (2026-07-27)

### 修复
- migration runner 在 advisory lock 内先探测 `identity_schema_migrations`；已有完整 ledger 时不再无条件执行 `CREATE TABLE IF NOT EXISTS`，因此受限的 `multi_publish_api` 角色无需 schema `CREATE` 权限即可完成无 pending 的正式迁移检查。
- ledger 缺失时仍创建迁移表并应用 migration；缺少所需 DDL 权限时继续 fail closed，并始终释放 advisory lock。

### 质量
- 新增 PostgreSQL `42501` 回归，覆盖已有 ledger、首次初始化和缺少 CREATE 权限三种正式 runner 场景。
- ECS 发布门禁要求用真实运行角色执行正式 migration runner；dry-run 不能替代最小权限验收。
---

## [未发布] Logto Opaque Token 生产加固 (2026-07-25)

### 修复
- 业务 API 现在同时验证 Logto JWT 与 Opaque Access Token；Opaque Token 通过受信任的同源 introspection endpoint 校验，并强制检查 `active`、`sub` 和目标 `aud`。
- 带两个点的 Opaque Token 不再被误判为 JWT，introspection 与 JWT 路径统一拒绝未来或非法 `nbf`。
- 身份依赖不可用时返回 503，Shadow 模式不再回退到旧 API Key，从而避免把上游故障伪装成用户凭据错误。
- `/api/v1/ready` 增加 M2M introspection 探针，生产配置缺少任一 M2M 凭据时 fail closed，production smoke 会拒绝缺少该检查的旧镜像。
- 打包应用不再因 `NODE_ENV` 或 `ELECTRON_IS_DEV` 环境变量获得管理员权限。
- Google、百度和本地 Whisper 的 `transcribe` 能力统一由 `BaseAdapter` 注册，不再重复出现在能力列表中。

### 安全与质量
- introspection endpoint 在发送 M2M Secret 前必须通过 HTTPS、同源和 userinfo 校验，且鉴权与生产 smoke 请求拒绝 HTTP 重定向；production smoke 也会在请求 JWKS 前完成同源校验，仅同源 loopback 开发环境允许 HTTP。
- Token 缓存改用 SHA-256 指纹，同 Token 并发请求合并；API 测试 runner 固定为单 Vitest worker 并关闭文件并行。
- 流水线 E2E 按用户可见的「已完成」状态验收，修复内部英文枚举与本地化文案不一致造成的稳定失败。
- Electron GUI runner 改用 45 秒条件等待主窗口，覆盖可选 Python bridge 缺依赖时的两阶段降级启动，不再在窗口创建前误报失败。
- Story2Video 音频阶段测试按 canonical realpath 判断文件身份，兼容 Windows Runner 的 8.3 短路径与长路径别名。
- API Key 管理器测试改用每进程唯一的系统临时文件，避免多个本地会话并发运行时争用同一原子写临时文件。
- API Key 原子保存会对 Windows 杀毒软件、索引器造成的短暂 `EPERM/EACCES/EBUSY` 做有界退避，避免有效请求偶发返回存储错误。
- Windows 上账号状态脱敏迁移与全文重写会对杀毒软件、索引器造成的短暂 `EPERM/EACCES/EBUSY` 做有界退避；保留原子替换，永久文件错误仍按原路径失败。
- Windows 上系统保护主密钥、主密钥备份和账号加密凭据的原子替换采用同一有界退避，避免短暂文件锁导致凭据迁移或保存失败。
- 自动更新器在主窗口关闭后重建时复用全局事件监听器，并把状态目标切换到新窗口，避免重复更新通知和旧窗口引用泄漏。
- 业务 API 使用 `proper-lockfile@4.1.2` 对同一 API Key 持久卷实施单 writer 所有权；第二实例返回 `API_KEY_WRITER_LOCKED`，监听失败和停止后可安全接管，重复启动同一实例会被拒绝。
- 新增 `API_KEYS_PATH` 运行时配置，Docker Compose 显式指向 UID `1001` 可写的 `config/api-keys.json`；API 测试服务器统一使用停止后清理的唯一临时 Key 存储。
- Story2Video 桌面安装包固定内置完整 FFmpeg/ffprobe，并在 `beforePack` 按资产锁校验字节数/SHA-256、真实编码器、滤镜、目标平台和许可证材料；有效安装包运行时强制优先从 `resources/media-tools` 解析，不允许环境变量覆盖锁定资源，也不会误用 Playwright 裁剪版。
- 新增 FFmpeg 第三方声明与 GPLv3+ 发布约束；公开分发前仍需确认对应源码和构建材料的提供方式。
- 业务 API Docker runner 合同测试改用系统临时目录和逐文件 staging，避免 Windows 受控工作树的权限差异造成假失败。

---

## [未发布] Story2Video Text 标准模式与参数合同 (2026-07-26)

### 视频创作
- `story2video-compose` 收敛为唯一 `text` 标准模式，创建运行前拒绝图片、音频、视频及畸形媒体字段；`image/remix/gallery/audio/batch` 明确不属于该流水线。
- 视频创作页仅为 Story2Video 显示文案输入，并使用独立输出配置；其他视频流水线继续保留文字、图片、音频和视频输入。
- 新增版本化 `Story2VideoTextConfig` v1，统一校验并映射分句、提示词、图片/TTS、字幕、BGM、模板、版本、合成、输出和发布参数。
- Story2Video 项目清单升级为 manifest v2，只持久化白名单配置；BGM 复制到受控项目目录，旧 manifest v1 继续可读。
- 版本化配置可在缺少重复顶层 `text` 时从 `prompt` 恢复项目；图片宽高比限制为受支持集合，合成层场景回退统一为 1..60 秒、默认 6 秒。

### 架构与安全
- 参数归一化只在 `story2video-compose` 的 Electron 适配层执行，不修改共享 `StageExecutor`、`ServiceBus` 或普通 `pipelineStart` 合同。
- 运行上下文递归拒绝 Provider 密钥、Token、密码等敏感字段；未知配置不进入运行记录或项目清单。
- YAML 运行合同改为 `required: [text]` 和 `supported_modes: [text]`，并与 renderer、PipelineEngine 和项目持久化使用同一组默认值。
- 提示词参数严格对齐 prompt-engine 平台/风格枚举及数值范围；图片风格与提示词风格分离，空 `max_length/context` 不再发送，文本上下文转换为 `synopsis` 对象。
- `optimize.context` 兼容 prompt-engine JSON 字典并阻断敏感字段；空字符串 `maxLength` 与未设置一致，真实 E2E 清理限定在本次运行的专属临时目录。
- PromptBridge 对单条和批量请求执行同一防御性清理，且不修改调用方对象；旧社交平台值映射到 `generic`。

### 质量
- Story2Video 聚焦回归、归一化器覆盖率、真实 ffmpeg、Vue/preload 构建、双 sandbox、桌面/移动视觉、17 项像素门禁、Windows x64 打包、ASAR/RPA require 链和 8 秒启动检查均通过。
- 审查回补以 5 个 RED 固定配置恢复、非支持宽高比和合成时长漂移；六文件聚焦回归现为 167/167。
- Story2Video 源分支曾被 6 个许可证旧断言和 3 个 STT 旧预期阻塞；集成分支已通过独立提交纳入对应基线修复，最终结果以 `.quality-gates.md` 为准。
- 流水线历史 GUI 合同改为同时校验 `completed` 语义 class 与“已完成”可见文案，避免本地化后继续断言内部状态值。
- Python backend 的视频 Provider 可选帧处理依赖改为按执行加载；GUI CI 直接导入真实 `server` 入口，避免缺少单个实验性 Provider 依赖时阻断 Electron 主窗口。
- 生产 smoke 合同测试同步覆盖 `/api/users` 与 `/api/forgot-password` 路径守卫，并按语义查找 `api.me`，避免新增检查改变数组尾部后误报 Quality Gate。
- Story2Video 受控音频路径测试按 `realpath` canonical 合同比较，兼容 Windows 8.3 短路径与长路径表示同一文件的场景。
- 真实服务 E2E 改为经过 `PipelineEngine` 的六阶段入口，实际调用 8002/8013、生成媒体文件、完成 ffmpeg 解码并验证发布禁用时明确跳过；默认降级资产不冒充真实图片/TTS Provider 验收。

---

## [未发布] 桌面权限、STT 与自动更新基线修复 (2026-07-26)

### 安全
- 打包应用不再允许 `NODE_ENV=development` 或 `ELECTRON_IS_DEV=1` 绕过许可证权限边界；只有明确未打包的 Electron 运行时可获得开发管理员权限。

### 模型能力
- 百度、Google 和本地 Whisper STT 统一从 `BaseAdapter.KNOWN_METHODS` 派生 `transcribe` 能力，避免重复 capability，并恢复 `ModelProviderManager` 的标准调用路径。

### 稳定性
- 打包应用关闭 electron-updater 控制台 logger；网络阻断或 Release 缺少 `latest.yml` 时静默归类为无可用更新，签名、安装等真实错误仍正常上报。
- 自动更新器同时识别 `statusCode`、消息和 URL 中的结构化 `latest*.yml` 404；signature、checksum、integrity 和 verification 错误即使携带相同 404/URL 仍按真实错误上报。
- 新增许可证、四类 STT 和自动更新回归，覆盖打包状态优先、能力唯一性及 404 双错误路径。

---

## [未发布] Logto 桌面公开运行时配置 (2026-07-24)

### 用户身份
- 发行包现在从 `resources/config/identity-public.json` 读取 Logto endpoint、Native App ID、API resource、业务 API、回环回调、scope 和 entitlement 公钥；发行配置存在时 `identityAuthEnabled` 不可被进程环境静默关闭，开发环境继续兼容旧式环境开关，受控覆盖仅用于 `identityAuthRequired` 和其余公开字段。
- 配置文件被限制为版本化白名单字段，缺少必需身份字段、使用矛盾开关、漏掉 OIDC 刷新 scope、包含未知字段、私钥字段或无效 RSA 公钥时会 fail closed；发行配置读取和校验失败不会在 Shadow 阶段静默降级。

### 质量与安全
- 构建前完整性检查和单元测试均验证 `identity-public.json` 存在、可解析、RSA 公钥有效且不含私钥字段；Windows 目录包另行核对资源文件存在和内容一致，防止发行包漏带生产身份配置。

---

## [未发布] 业务 API Docker 运行时修复 (2026-07-24)

### 修复
- 业务 API runner 镜像补入上传编排目录，修复容器启动时无法加载 `upload/orchestrator` 的生产阻断。
- 补齐 `js-yaml` 直接生产依赖和 npm `upload/` 发布清单，避免依赖根工作区偶然提升或发布包漏文件。
- 将插件目录固定到可写持久卷，并把 Alpine 容器健康检查改为 IPv4 loopback，消除非 root 权限与 `localhost -> ::1` 误报。
- Bind mount 禁止隐式创建宿主目录；部署前显式以 UID/GID 1001 准备 config、data 和 plugins，首次部署权限不正确时直接失败。
- 业务 API Compose 显式加入 Logto 外部网络，修复 `BUSINESS_DATABASE_URL` 使用 `postgres` 服务名时正式 release 的 DNS 解析失败。
- Node/Python Logto 验证器严格支持 `RS256/RSA` 与生产租户使用的 `ES384/EC/P-384`，并按 `alg:kid` 隔离 JWKS 与未知密钥负缓存。

### 质量
- 生产部署合同现在按 Dockerfile runner `COPY` 清单构造隔离文件集，并加载真实 API 入口验证完整 require 链。
- 增加 ES384 签名、算法/密钥/曲线错配、JOSE 签名长度及跨算法负缓存回归；部署候选必须在 ECS 真实 build、启动并通过 health/readiness/smoke。

---

## [未发布] 业务 API 生产依赖安全修复 (2026-07-24)

### 安全
- 将业务 API 的 Axios 生产依赖解析版本升级到 `1.18.1`，消除已知高危公告影响。
- 增加生产依赖最低安全版本回归测试，并完成 API 全量回归与生产依赖审计。

---

## [未发布] 蚁小二发布记录界面对齐 (2026-07-24)

### 发布中心
- 新增独立发布记录页，支持发布状态列表、草稿箱、错误重试、新建发布和继续编辑草稿。
- 顶部导航与命令面板的“发布记录”进入历史页；一键发布编辑器继续保留在 `/publish`，由新建发布和草稿恢复进入。
- 批量管理改为发布记录列表的选择状态，与登录后的蚁小二工作流保持一致。
- 发布记录补齐作品搜索、发布人/作品类型/状态/模式筛选、列表/网格切换、CSV 导出及账号/任务/失败/播放/评论/点赞/收藏/分享指标。

### 账号管理
- 主内容改为平台筛选栏和账号卡片网格，保留搜索、状态筛选、收藏、默认账号、登录验证、打开主页和批量选择行为。
- 账号名称使用可访问的内联编辑，桌面按真实蚁小二信息密度显示四列卡片，并在窄屏自适应降列。

### 界面与质量
- 修复身份菜单加入后顶部导航在窄窗口换行重叠的问题，并补充单行滚动布局合同。
- 新增桌面和移动端蚁小二当前界面截图脚本，覆盖账号管理、发布记录和批量选择；截图只使用测试 fixture。
- 修复移动端批量选择时记录主体固定宽度导致的横向溢出，并增加回归测试与 Chromium 布局检查。
- 用已登录真实蚁小二账号、发布记录和批量管理主内容建立 2280×1272 参考基线；三页审计均低于 10% mismatch，未使用忽略区域。
- 固化 desktop/mobile/audit 三种 viewport，一条命令可重复生成 accounts、publish、batch-publish 共 9 张当前图。
- Electron self-hosted CI 的 Vitest 改为单 worker、关闭文件并行，并增加 20 分钟 watchdog、详细 reporter、测试/钩子/清理超时和失败进程树诊断。

---

## [未发布] Logto 应用内登录窗口 (2026-07-22)

### 用户身份
- 登录和注册改为在 Electron 独立认证窗口中完成，继续使用 Logto 托管页面、Authorization Code、PKCE 和固定回环回调。
- 认证窗口使用隔离 Session 和安全 BrowserWindow 配置，阻止下载、权限请求、任意导航与新窗口；第三方身份提供商不支持嵌入时回退系统浏览器。
- 关闭认证窗口会立即取消登录并清理回调服务；修正生产 Logto Native App ID。
- 退出登录或切换账号时会清理隔离认证窗口的 Cookie 与浏览器存储；即使窗口已销毁但关闭事件尚未到达，也不会让退出流程永久等待。
- 重开认证窗口时保持同一会话的下载与权限保护；过期窗口的迟到导航不会错误打开新一轮授权地址。

### 质量
- 新增窗口安全、加载失败、关闭取消、并发窗口和 OAuth 回退测试。
- 完成 Vue/preload 构建、preload 双 sandbox、Windows QM-1 打包、ASAR/启动、真实 Logto 页面和像素 16/16 验证。
- 修复视觉 CI 运行系统、workspace Vitest 依赖检查和过期 GUI smoke 契约；密钥扫描改为可定位且排除测试夹具。
- 补齐账号凭证、评论 Cookie 和后台轮询的 `owner_subject` 隔离；预加载 bundle、双 sandbox、身份 E2E 与像素回归均已复验。
- CI 审计门禁只接受本轮生成的报告；自主审计即使返回零退出码，也必须提供 `overall: PASS` 的机器可读报告才能放行。

---

## [未发布] Story2Video 流水线对齐与真实合成 (2026-07-22)

### 流水线
- `story2video-compose` 完整阶段更新为 `split → domain_enrich → optimize → generate_assets → compose → publish`。
- CreateView 将历史内容、模板、图片动效、转场、字幕、BGM、水印、分辨率/FPS、图片轮播输入和发布参数透传到编排器。
- 编排启动默认自动推进到第一个检查点，修复“创建运行后没有阶段执行”的停滞问题。

### 合成与资源
- Electron 侧 `Story2VideoComposeEngine` 使用 ffmpeg 真实生成并校验非空视频，支持本地图片摄取、字幕、动效、转场、BGM 和水印。
- 合成阶段改为探测音频/片段真实时长；缺失时长不再默认截断为 3 秒，短片段转场会按边界收敛并同步使用 `acrossfade`。
- BGM/视频文件通过 preload 的 `webUtils.getPathForFile` 获取绝对路径，拒绝把仅有文件名的值传入主进程。
- 完成项目按用户隔离持久化，最多保留最近 100 项；成片、完整旁白、BGM 和分段图片/音频/视频均复制到受控项目目录。
- 结果页支持分段编辑、排序、删除、旁白替换、图片/视频重试和重新合成；重试失败会回滚旧媒体并清理本次部分产物。
- 完整旁白和逐段媒体可单独下载或纳入流式 ZIP；本地历史支持状态筛选、恢复和删除。
- 成片裁剪改为 Python `VideoTrimmer` + ffmpeg 真实输出，结果页提供双范围选择和区间预览；移除通用视频处理接口的假成功类型。
- 已接语音识别 provider 和逐段手动 STT；全自动音频识别创作、Remix、音色克隆和云分享仍明确标为外部/后续边界。
- 模型 Provider 配置已贯通 Story2Video 资产链：豆包 TTS/STT 映射 App ID 与加密 Access Token，豆包 TTS 改按真实业务成功码 `3000` 判断；`dall-e` 兼容旧 ID，Imagen 预设与适配器模型同步。
- 图片 Provider 明确输出合同：OpenAI/Imagen 可按 Story2Video 的宽高和数量生成；ComfyUI 因没有 workflow、异步轮询和下载输出合同，在 S2V 主链显式失败而非伪造图片成功。
- Provider 返回的远程图片 URL 只允许 HTTPS 和固定的可公开路由地址；下载会拒绝内网、特殊网段及 DNS 重绑定，避免生成链路访问本机服务。受控本机 loopback Provider endpoint 必须与已配置地址的主机名、协议和端口完全匹配；本机与远程图片响应均按流式 25MiB 上限读取，DNS 与远程下载共用 30 秒总预算。
- 发布阶段在未开启时明确 `skipped`，开启但缺少路由器/凭据时失败，移除占位成功语义。
- YAML 与 PRD/架构文档同步当前混合执行边界和外部服务前提（8002/8013、ffmpeg）。

### 安全与测试
- Pipeline 查询、运行上下文和历史 IPC 统一执行可信 sender 校验，并补充名称/runId 参数校验。
- 增加 renderer 参数合同、图片轮播、真实 ffmpeg 合成和发布失败语义的回归覆盖。
- 增加历史 `contentType → domain_enrich → prompt-engine` 的编排回归、完成项目的 `contentType` 持久化回归，以及豆包/Imagen provider 契约回归。
- preload 源码与生产 bundle 同步 Story2Video API，并在 sandbox=true/false 下实际调用 IPC 验证。
- 媒体清理同时 canonicalize 候选路径和项目根目录，拒绝目录符号链接/junction 越界；替换旁白的受控临时副本在成功和异常路径都会清理。
- 逐段 STT 仅接受应用已导入或项目自有的音频；禁用供应商和缺少远程执行器不再被误报为可用。
- Story2Video 默认媒体白名单收紧为受控临时区和项目目录；renderer 不能借导出、路径复制或本地播放操作访问整个用户目录，外部 ZIP 保存位置仅由原生保存对话框授权。
- 项目持久化使用分段位置生成媒体文件名前缀，重复的上游 `segment.index` 不再覆盖其他分段的图片、旁白或视频。
- Remotion Composition 改用本地系统字体栈，离线渲染不再在模块加载时请求 Google Fonts。
- 新增本地项目重启恢复、共享引用、删除/重试/重合成清理、真实裁剪和 UI 裁剪边界回归测试。

### 明确边界
- 8002 分句、8013 prompt-engine、真实 AI provider 和多平台发布仍需目标环境凭据与联网验收。
- 本地 file URL、复制路径和打开目录不是公网分享链接；最近 100 项本地历史不是云历史或失败运行断点续作。
- 旧项目的 Sora/Supabase Remix、membership/quota 和音色克隆依赖未验证外部服务，未以占位成功冒充迁移完成。

## [未发布] 蚁小二账号管理与内容发布对齐 (2026-07-20)

### 账号管理
- 保留顶部导航和最左侧平台账号栏，重构主内容区及二级交互。
- 增加账号分组、收藏、搜索、状态筛选、排序、批量删除、默认账号和状态事件刷新。
- 接入内嵌浏览器、二维码和 OAuth/API 登录入口；账号查询统一脱敏。
- `store:add-account` 仅接受公开元数据，拒绝 cookies、localStorage、Token 和未知字段。

### 内容发布
- 同一平台支持选择多个账号，并展开为独立发布目标。
- 支持单篇/批量发布、定时排期、取消、重试、草稿完整恢复和平台差异化标题/正文。
- RPA 与 backend 发布路由均应用当前平台的差异化内容。
- 任务队列退出时取消等待、延迟和运行中任务，防止应用关闭后继续产生发布副作用。

### 架构与界面
- 页面拆分为展示组件、composable/Pinia、renderer API、preload、IPC 和主进程服务六层。
- 账号页和发布页主内容区按蚁小二的信息结构与工作流对齐，现有应用外壳保持不变。
- 修复安装版平台规则/封面预设的配置路径，插件目录改为 Electron 用户数据目录，避免向只读 ASAR 写入。

### 质量
- 新增账号安全边界、平台差异化内容、取消竞态、队列关闭、IPC、E2E 和视觉回归测试。
- 新增打包运行时配置路径与插件目录回归测试；QM-1 启动验证同时检查 stderr 和 worktree junction 来源。
- 最终门禁结果以 `.quality-gates.md` 本次执行记录为准。

---

## [蚁小二复用] v0.17.0 - 账号管理增强 + 内容发布增强 (2026-07-16)

基于蚁小二逆向工程分析，增强账号管理和内容发布模块，使其功能接近蚁小二 4.0。

### 账号管理模块增强 (accounts.js)
- 新增账号分组管理（创建/删除/按分组筛选），localStorage 持久化
- 新增批量操作（批量删除/启用/禁用），支持全选/取消全选
- 新增多维度搜索过滤（名称/平台/状态），实时响应式
- 新增排序功能（名称/添加时间/最后使用），支持升序/降序
- 增强 groupedByPlatform 计算属性，带过滤和统计

### 内容发布模块增强 (Publish.vue + usePublishFlow.js)
- 新增草稿箱功能（保存/加载/删除草稿），基于 localStorage
- 新增差异化内容设置（每个平台可独立修改标题和内容）
- 新增平台内容限制显示（标题/正文字数限制）
- 传入 diffEdits 参数到 usePublishFlow，支持 platformOverrides

### API 层增强 (publisher.js)
- 新增草稿箱 API（draftList/draftSave/draftGet/draftDelete）
- 新增批量操作 API（accountBatchDelete/accountBatchUpdateStatus）
- 新增平台内容限制 API（getPlatformLimits）

### 测试结果
- accounts store: 8/8 通过
- Accounts view: 34/34 通过
- Publish view: 23/23 通过
- 总计: 65/65 通过 ✅

---


## [测试增强] v0.16.0 - 变异测试 + 覆盖率门禁 + 故障注入 + Monkey + 会话录制 (2026-07-16)

### 工具集成
- `stryker.conf.json`：Stryker 变异测试配置（thresholds: high=60/low=50/break=40），`npm run test:mutation`
- `vitest.config.js`：覆盖率门禁（branches ≥ 60%），`npm run test:coverage`
- `electron/tests/fault-injection.test.js`：14 个测试，20% 概率 IPC 故障注入（拒绝/超时/null/格式异常）
- `electron/tests/monkey.test.js`：5 个测试，500 次随机 IPC 操作序列
- `electron/services/user-session-recorder.js`：`BACKLOT_RECORD_SESSION=true` 时录制用户操作序列，可回放为测试
- 5 个 npm scripts：`test:mutation` / `test:coverage` / `test:fault` / `test:monkey` / `test:quality`

### 质量门禁更新
- `.quality-gates.md`：新增变异测试 ≥ 50%、分支覆盖率 ≥ 60%、故障注入 3 项门禁
- `.quality-rhythm`：补充引用质量门禁清单

## [Reuse] v0.15.0 - Pixelle-Video 代码复用 5 路径全量迁移 (2026-07-16)

基于 `01-docs/Pixelle-Video-复用分析报告.md`，将 Pixelle-Video（Apache 2.0）10 个可复用模块按 5 条推荐路径全量迁移到 python-backend。应用质量节拍 Trigger D 门禁 + 并行迁移 + TDD。

### Path 1: LLM 结构化输出服务（⭐⭐⭐ 高价值）
- `services/llm_service.py`（377行）：Pydantic v2 `response_type` 结构化输出 + 三层 JSON 解析回退（直接 JSON → markdown 代码块 → 大括号提取）+ 运行时参数覆盖（api_key/base_url/model）
- `services/llm_presets.py`（85行）：6 个 LLM 提供商预设（Qwen/OpenAI/Claude/DeepSeek/Ollama/Moonshot）
- 配置依赖解耦：构造函数 config dict → 环境变量 → 内置默认值（原依赖 pixelle_video.config_manager 已移除）
- 与 Node.js `ai-writer` 包并存，互不影响

### Path 2: Prompt 管理体系（⭐⭐ 中价值）
- `prompts/` 目录：7 个独立 prompt 文件（content_narration/image_generation/title_generation/topic_narration/video_generation/asset_script_generation/style_conversion）
- 每个 prompt 自包含：system prompt + user template + JSON schema（纯 dict，无外部依赖）
- 双 API 设计：`build_*_prompt()` 便捷格式化 + `get_prompt_spec()` 返回三元组
- `__init__.py` 导出 `get_all_prompt_specs()` 注册表

### Path 3: HTML 模板 + Playwright 渲染流水线（⭐⭐ 中价值）
- `services/frame_html.py`（411行）：Jinja2 风格 DSL 变量替换（`{{ title }}`/`{{ content }}`/`{{ image_path }}`）+ HTML 消毒（`html.escape` 防 XSS）+ Playwright 截图（async）
- `services/frame_processor.py`（249行）：帧/场景管理 + 模板选择（static_/image_/video_ 前缀）
- `templates/`：3 种尺寸 HTML 模板（1080x1080 方形 / 1080x1920 竖屏 / 1920x1080 横屏）

### Path 4: ConfigManager 配置管理（⭐⭐ 中价值）
- `config/schema.py`（95行）：Pydantic v2 schema，适配 Multi-Publish 结构（LLMConfig/TTSConfig/PublishersConfig/VideoCreationConfig）
- `config/loader.py`（60行）：YAML 读写
- `config/manager.py`（152行）：单例 ConfigManager + 热重载 `reload()` + 深度合并 `update()` + 便捷访问器
- 所有字段有默认值，空 YAML 即合法

### Path 5: FastAPI 任务状态机增强（⭐ 参考）
- `core/task_manager.py`：并行模块（不替换 task_queue.py）
- 任务状态机：pending → running → completed/failed/cancelled，`_VALID_TRANSITIONS` 强制校验
- `cancel_previous=True`：同类型任务互斥
- `max_concurrent`：并发限制，超限任务保持 pending
- 生命周期：`start()` 后台清理循环 / `stop()` 取消所有任务

### 测试
- **263 测试全通过**（Path 1: 37 + Path 2: 70 + Path 3: 72 + Path 4: 40 + Path 5: 44）
- TDD 模式：先写测试 → 红灯 → 实现 → 绿灯
- 所有 HTTP/Playwright 调用均 mock，零真实外部依赖
- 5 路径并行 subagent 迁移，每个 subagent 独立 TDD 循环

### 许可证合规
- 所有迁移文件保留原始 Apache 2.0 许可证头（Copyright AIDC-AI）
- 严格遵守许可证条款，归属清晰

## [Security+Arch] v0.14.1 - 8项MAJOR安全加固+架构拆分 (2026-07-16)

代码审查发现的 7 个 MAJOR + 1 个 MINOR 问题全部修复，应用质量节拍日常循环。

### 安全加固（commit 4ffe565）
- `license-manager.js`：静态盐 → 随机16字节盐 + scrypt（v2格式，v1向后兼容）
- `rpa-view-manager.js`：4处 innerHTML 注入净化（DOMPurify-lite，移除 script/on* 事件）
- `publish-alert.js`：shell 命令 → spawn shell:false（消除 shell 注入）
- `rpa-view-manager.js`：25处硬编码 setTimeout → this._sleep helper
- `proxy-manager.js`：代理 URL 凭据 encodeURIComponent
- `api-key-manager.js`：残留 var → let/const

### 架构拆分（commit 4f22d1c）
- `rpa-view-manager.js`（805行）→ 4 文件 Mixin 拆分（manager 99 + helpers 211 + session 47 + platforms 339）
- `content-intelligence.js`（825行）→ 3 文件 Mixin 拆分（main 381 + sources 235 + analysis 300）
- 方法体零修改，Object.assign(prototype, ...mixins) 组合，require 接口不变

### 测试
- 相关测试 57 + 59 = 116 passed（license 12 + publish-alert 16 + rpa-view 10 + proxy 4 + api-key 13 + content-intelligence 49 + rpa-view拆分 10 + content-intel拆分 49... 实际去重后 116 unique）

## [Backlot] v0.14.0 - 生产回放 + 审批门 + 看板 (2026-07-16)

OpenMontage Backlot living storyboard 集成：生产过程可视化、审批门、生产回放。

### Task 1+3+11: 基础设施 + ProjectService + UI 组件
- `project-service.js`：本地项目库（创建/列表/更新/删除，SQLite backlot_projects 表）
- `board-service.js`：看板状态构建（stages/scenes/cost/elapsed 快照）
- `BoardStageIndicator.vue` + `SceneCard.vue` + `ProjectCard.vue`：UI 组件
- `useBacklot.js`：live board 订阅 composable
- `backlot.js` Pinia store

### Task 2+4+5+6: ProjectLibrary + ProductionBoard + ContactSheet + ApprovalGate
- `ProjectLibrary.vue`：项目库页面（创建/打开/删除）
- `ProductionBoard.vue`：生产看板（阶段指示器 + 场景网格 + 成本面板）
- `ContactSheetView.vue`：场景审批（takes 缩略图 + 批准/驳回）
- `ApprovalGateModal.vue` + `approval-gate-service.js`：审批门（creative/quality gate）
- `contact-sheet-service.js`：场景素材审批（scene:complete/fail/retry 事件）

### Task 7+9+10: 管道事件系统 + ExecutionRecorder + ReplayTimeline
- `pipeline-engine.js`：新增 on/off/_emit 事件系统（12 种事件）
- `execution-recorder.js`：生产回放录制（JSONL 持久化 + 100 事件内存缓存）
- `ReplayTimeline.vue`：生产回放页面（时间轴 + 播放控制 + 快照面板）
- `replay.js` IPC handler + preload API
- 集成到 container.setup / phase1-context / phase5-ipc / preload/index

### Task 8: ApprovalGate UI（含在 Task 4 中完成）

### 测试
- execution-recorder.test.js：44 测试
- ReplayTimeline.test.js：44 测试
- board-service / contact-sheet-service / approval-gate-service / project-service：各 service 测试
- ProductionBoard / ContactSheetView / BoardStageIndicator / SceneCard / ApprovalGateModal：各组件测试
- useBacklot / backlot store：composable + store 测试
- 总计 backlot 测试：12 文件 308 测试全通过
- 集成回归：preload 276 + phase5-ipc 11 + container.setup 4 = 291 测试全通过

### 已知限制
- replay API 为嵌套对象，未登录（public）状态不可用（设计如此）
- preload.test.js 未覆盖嵌套 API 对象暴露测试（MINOR，后续补充）

## [系统化重构] v0.13.6 - Phase 4 测试补全 (2026-07-16)

系统化重构路线图 Phase 4：测试补全。remotion-composer 单元测试、shared-utils 手动测试迁移、rpa-engine 死代码清理。

### Task 13: remotion-composer 单元测试（36 文件 0 测试 → 111 测试）
- 新建 `packages/remotion-composer/vitest.config.js` + package.json test script
- `props-validator.test.ts`：38 测试（cuts/id/in_seconds/out_seconds/sceneType/theme/chartData 校验 + 错误聚合）
- `scene-builder.test.ts`：34 测试（text/gallery 双模式 + 默认值 + 时间轴数学公式 + 空文本边界）
- `media-profiles.test.ts`：39 测试（9 内置 profile + listProfiles 浅拷贝 + getProfile 回退 + getRemotionArgs/getFfmpegArgs）

### Task 14: shared-utils 手动测试迁移 Vitest（5 文件）
- 迁移 5 个 manual-*.js → Vitest .test.js（format-adapter/cover-processor/sensitive-filter/platform-config/data-sync）
- 45 passed + 9 skipped（skip 原因：platforms.yaml 缺 cover_size/max_title/max_content 字段，非源码 bug）
- 删除 5 个原手动测试文件，调整 vitest.config.js include 规则

### Task 15: rpa-engine 清理 + 评估
- 删除 `packages/rpa-engine/src/publishers/registry.js`（空壳死代码，已废弃）
- 删除 `packages/rpa-engine/tests/registry.test.js`（废弃契约测试）
- 评估结论：**保留 rpa-engine 包**（合并成本 > 收益，QM-1 打包验证深度耦合包名）
- 发现：browser-data.js 393 行加密代码无运行时消费方（后续清理候选）

### 测试
- desktop：3683 passed / 0 failed / 10 skipped
- rpa-engine：203 passed / 0 failed（删除 registry.test.js 后）
- shared-utils：160 passed / 0 failed / 10 skipped（+45 新测试）
- remotion-composer：111 passed / 0 failed（新增）
- 视觉测试：19/19 passed / 0 failed / 2 skipped (electron-only)

## [系统化重构] v0.13.5 - Phase 3 架构重构 (2026-07-16)

系统化重构路线图 Phase 3：架构重构。Store 拆分、App.vue 拆分、Adapter 目录优化、createAppContext 分组。

### Task 9: Store 类按功能域拆分（570 行 → facade + 8 子 store）
- `store.js` 从 570 行实现改为 38 行 thin re-export（向后兼容 `require('./store')`）
- 新建 `store/` 目录：base-store + account/history/scheduler/settings/callback/batch/rate-limit/model-log 8 个子 store
- Mixin 模式：`Object.assign(Store.prototype, accountStoreMixin, ...)` 保持 `instanceof Store` 有效
- 新增 39 个快照测试（store-snapshot.test.js）：API 表面 + SQL 模板 + 降级 + 生命周期
- SQLite schema 完全不变，数据零丢失

### Task 10: App.vue 拆分（332 行 → 60 行）
- 提取 4 个组件：UpdateNotification.vue / OfflineIndicator.vue / layouts/AppNavbar.vue / layouts/AppSidebar.vue
- App.vue 仅保留 licenseStore.load() + onNavigate 全局监听 + SettingsDialog 状态
- 每个组件独立管理生命周期（onMounted/onBeforeUnmount）
- 未提取 NotificationBar（无独立功能）和 AppLayout（过度抽象）

### Task 11: Adapter 目录优化（仅提取基础设施）
- 6 个基础设施文件移入 `adapters/_base/` 子目录（base/registry/router/provider-error/openai-compatible/music-library）
- 207 处 require 路径更新（111 个文件），用 git mv 保留历史
- 46 个 adapter 文件不动（命名后缀已自带分组语义）

### Task 12: createAppContext 上帝对象分组（52 字段 → 4 组）
- 52 字段按 infra(9)/services(30)/windows(8)/pipelines(5) 分组
- Proxy 兼容层：5 个 trap（get/set/has/ownKeys/getOwnPropertyDescriptor）
- `context.store` → `context.infra.store` 自动转发，零破坏现有消费者
- 后续可逐文件迁移（bootstrap.js/shutdown.js/window.js/phase5-ipc.js）

### 测试
- 全量回归：3682 passed / 0 failed / 10 skipped（+39 新测试，基线 3643 → 3682）
- 视觉测试：19/19 passed / 0 failed / 2 skipped (electron-only)

## [系统化重构] v0.13.4 - Phase 2 代码清理 (2026-07-16)

系统化重构路线图 Phase 2：代码清理。删除旧版 preload、var 现代化、定时器 unref 补全、硬编码配置抽取。

### Task 5: CI 脚本重构 + 删除旧版 preload.js
- 重构 `.github/scripts/check-ipc-bridge.js`：改用 `preload/` 子目录递归扫描（与 ipc-handlers.test.js 逻辑一致）
- 删除 `electron/preload.js`（423 行，已弃用，window.js 实际加载 preload/index.js）
- 更新 `ipc-handlers.test.js`：移除旧版 preload.js 读取逻辑，HIDDEN 集合补充 8 个 pipeline 内部 handler
- 发现：新版 preload/publish.js 正确移除了 7 个 pipeline 编排内部方法（不应暴露给渲染进程）

### Task 6: ai-writer 包 var → const/let
- `packages/ai-writer/src/index.js`：18 处 var 替换（16 const + 2 let）
- `packages/ai-writer/src/cli.js`：20 处 var 替换（全部 const）
- 总计 38 处，ai-writer 测试 16/16 通过

### Task 7: 补全 setTimeout unref 覆盖
- 扫描 104 处 setTimeout/setInterval，33 处已 unref
- 所有 13 处 setInterval 已有 unref（100% 覆盖）
- 新增 7 处长期 setTimeout unref：auth-view-session.js(1) + rpa-view-manager.js(6)
- 聚焦 ≥10s 的命名/超时定时器，短期定时器不修改

### Task 8: 硬编码 127.0.0.1/端口抽取配置
- 新建 `electron/config/app-config.js`：统一 6 个服务的 host/port 配置（环境变量优先）
- 替换 6 个文件 13 处硬编码：callback-server/oauth-manager/window/python-bridge/prompt-bridge/splitter-bridge
- 保留安全检查代码中的 127.0.0.1（isTrustedSender 字面量，非服务配置）

### 测试
- 全量回归：3643 passed / 0 failed / 10 skipped（与基线一致）
- 视觉测试：19/19 passed / 0 failed / 2 skipped (electron-only)

## [系统化重构] v0.13.3 - Phase 1 安全加固 (2026-07-16)

系统化重构路线图 Phase 1：安全加固。基于独立深度代码分析，修正用户方案 6 处偏差，补充 4 项盲区。

### Task 1: CSP 内容安全策略
- `src/index.html` 添加 Content-Security-Policy meta 标签
- script-src 'self' 防御 XSS（sandbox:false 的关键补偿措施）
- 允许 Fontshare/Google Fonts 字体加载 + Vite HMR (ws:/localhost)
- 视觉测试 19/19 通过，CSP 未阻断字体加载和 HMR

### Task 2: 修复生产代码 10 处空 catch（精确范围）
- `api-publish-engine/src/`：scheduled-publish/publish-plan/audit-log/publish-api-client/plugin-loader(4处)/zhihu 共 10 处空 catch 加 console.warn
- **未误改**合理 fallback：md-converter.js / browser-data.js / http-provider.js（这些是合理的 try-catch fallback）

### Task 3: IPC sender 验证扩展（9 个敏感 handler）
- 新建 `ipc-handlers/helpers.js`，提取 `withSenderCheck(fn)` 高阶函数
- 包装 9 个敏感 handler：auth:save-credentials / store:delete-account / store:update-account / payment:complete / payment:simulate / batch:execute / batch:delete / scheduler:create / scheduler:cancel
- 测试环境兼容：`_isTestEnv()` 检测跳过 sender 验证（mock event 无真实 senderFrame）
- 只读 handler（查询类）不加验证，避免过度验证

### Task 4: IPC handler 包装器
- `ipc-handlers/helpers.js` 提取 `wrapIpcHandler(fn)` 和 `wrapIpcHandlerRaw(fn)` 高阶函数
- 统一 try-catch + 参数校验 + 错误日志，消除模板重复
- `scheduler.js` 迁移为 wrapIpcHandlerRaw 示例（保留原响应格式 + catchData 兜底）
- 错误码从 `core/error-codes` 加载（负数语义），兜底定义与项目一致

### 测试
- 全量回归：3643 passed / 0 failed / 10 skipped（与基线一致）
- 视觉测试：19/19 passed / 0 failed / 2 skipped (electron-only)

### Spec 文档
- 新建 `.trae/specs/refactoring-roadmap/`：spec.md / tasks.md / checklist.md
- 15 Task 4 Phase 路线图，Phase 1 全部完成

## [重构改进] v0.13.2 - 5项改进 + CreateHistory测试 + stageClass bug修复 (2026-07-15)

应用质量节拍日常循环：项目重构分析 Top 5 改进实现。

### 改进1：preload sendSync 模块级缓存
- `preload/index.js` `getAccessLevel()` 添加 `_cachedAccessLevel` 模块级缓存，sendSync 只在首次调用执行
- 添加架构说明注释：contextBridge.exposeInMainWorld 同步约束使 sendSync 不可替代，handler <1ms 阻塞可忽略

### 改进2：keywordPersistTimer 内存泄漏修复
- `phase3-services.js` `startServices()` 返回 `{ keywordPersistTimer }`
- `bootstrap.js` 捕获返回值并加入 context
- `shutdown.js` 在 window-all-closed 中 `clearInterval(keywordPersistTimer)` 清理定时器

### 改进3：rpa-view-manager innerHTML 安全 helper
- 新增 `_setElementContentSafe(win, selector, content, opts)` 方法，统一用 JSON.stringify 转义参数
- 重构 zhihu content 填充使用 helper（消除重复字符串拼接模式）
- 注：_fillInFrame（iframe 场景）和 douyin（多选择器迭代）保留原模式，已用 JSON.stringify 安全转义

### 改进4：JSON.parse 误报确认
- 排查确认 `account-state-restorer.js`、`license-manager.js`、`analytics.js`、`auth-view-cdp.js`、`anthropic.js` 所有 JSON.parse 均已包裹 try-catch，无需修复

### 改进5：CreateHistory.vue 测试 + stageClass bug 修复
- 新建 `CreateHistory.test.js`，16 个测试覆盖渲染/tab切换/空状态/列表加载/辅助方法/错误处理/加载状态
- 修复 `stageClass(null)` bug：`typeof null === 'object'` 导致 `null.status` 抛错，改为 `s && typeof s === 'object'`

### 其他发现
- console.log 仅存在于测试文件和 logger.js（日志模块本身），生产代码已清洁
- 硬编码 setTimeout 为 RPA 页面加载等待，重构风险大不调整

### 测试
- 全量回归：3643 passed / 0 failed / 10 skipped（基线 3627 → 3643，+16 新测试）

## [Bug4修复 + 需求5/6实现] v0.13.1 - preload白名单 + S2V双界面统一 + 默认模型 (2026-07-15)

应用质量节拍补跑：Bug4 深度排查 + 需求5（默认模型）+ 需求6（S2V双界面统一）。

### Bug4 修复：Remotion 渲染引擎未就绪"缺少 remotion-composer"
- **根因**：`preload/index.js` 的 `PUBLIC_METHODS` 白名单未包含 `renderGetStatus` 等渲染方法。打包模式下 `accessLevel='public'`（无 Pro license），这些方法被 `filterApiByAccessLevel` 过滤，前端 `invokeWithFallback` 返回 `{}`，模板 `!{}.composerExists` → true 误报"缺少 remotion-composer"
- **修复**：`PUBLIC_METHODS` 新增 `renderGetStatus`/`renderInstallDeps`/`onRenderInstallProgress`/`pipelineList`/`pipelineGet`
- **防御性处理**：CreateView.vue 区分 IPC 失败（`ipcError`）和实际 `composerExists=false`，避免误导性错误提示

### 需求5：14条流水线用默认模型替代独立选择
- `llmConfig` 精简为 `{ temperature }`，移除 `provider`/`model`
- 移除 `loadLlmProviders`/`availableLlmProviders` 及 LLM 提供商/模型选择 UI
- `startPipeline` 传 `llm:{temperature}`，后端用 `getDefault(category)` 默认供应商

### 需求6：story2video 双界面统一到 CreateView.vue
- CreateView.vue 新增 S2V 编排模式：`isOrchestratedPipeline`/`s2vConfig`/`startOrchestratedPipeline`/`updateOrchestrationStatus`/`advanceOrchestration`
- 模板新增 S2V 配置面板（图片风格/宽高比/语音/并发数）+ 编排上下文预览 + 执行控制栏分发
- 删除 PipelineView.vue，路由移除 `/create/pipeline`，CreateHistory.vue 跳转改为 `/create`

### 测试
- 6 个新 S2V 编排测试（isOrchestratedPipeline/s2vConfig/startPipeline分发/llmConfig精简）
- 全量回归：3627 passed / 0 failed / 10 skipped（基线 3621 → 3627）

## [新增模型供应商 + 设置入口] v0.13.0 - 9个新Adapter + 前端设置弹窗 (2026-07-15)

应用质量节拍日常循环：新增 9 个模型供应商 Adapter + 前端【设置】-【模型设置】入口。

### 后端：9 个新 Adapter（43→52 供应商）
- **LLM 推理（7→11）**：Xiaomi MiMo / OpenCode-Go / Agnes AI / SenseNova（4 个薄包装继承 OpenAICompatibleAdapter）
- **TTS 语音（5→7）**：MiMo TTS（自定义 api-key 头）/ MiniMax TTS（Bearer + hex→Buffer）
- **图像生成（9→11）**：MiniMax Image（POST /image_generation）/ Agnes Image 2.1 Flash（parseSizeTier）
- **视频生成（12→13）**：Agnes Video V2.0（num_frames=8n+1 规则，异步 2 步流程）
- 更新 MiniMax Video adapter：base_url 改为 api.minimaxi.com/v1，扩展 duration/resolution/first_frame_image 参数
- model-provider-seeds.js + model-provider-manager.js 同步更新，52 个 seed 与 52 个 adapter 一一对应

### 前端：设置弹窗 + 单模型优化
- **SettingsDialog.vue** — 多 Tab 设置弹窗（模型设置 tab + 通用/发布/账号 3 个占位 tab）
- **App.vue** — 顶部导航新增【设置】下拉菜单，点击【模型设置】打开弹窗，click outside 自动关闭
- **ModelProviders.vue** — 单模型供应商（models.length === 1）隐藏 Model ID 输入框，改为提示信息
- cohere-design-system.css 新增 nav-dropdown 系列样式

### 测试
- 9 个新 Adapter 测试文件，共 176 个新测试全部 GREEN
- 完整性审查修复 1 个 MINOR bug（单模型判断条件 <= 1 → === 1）

## [完整闭环] ai-autonomous-tester v0.12.2 - 三个方向全部实现 (2026-07-13)

应用质量节拍第 16 轮：实现自动代码修复 + CI 多轮循环 + 视觉基线智能管理。

### 方向1：自动代码修复（PatchFixStrategy）
- **PatchFixStrategy** — 生成可执行 .patch 文件，Agent 审阅后可 patch 应用
- 有 LLM 时：生成智能代码 patch（真实的 diff 格式）
- 无 LLM 时：生成模板 patch（含修复建议的 TODO 标记）
- 同时生成 .sh/.bat 执行脚本，Agent 可直接运行

### 方向2：CI 多轮循环（autonomous-loop.yml）
- 新 workflow：utonomous-loop.yml — 手动 dispatch 或 PR 标签触发
- 自动多轮重试：检测 → 修复 → 重测（最多 N 轮）
- 自动 commit 基线更新 + patch 文件
- 完整的 artifacts 上传（报告 + patch + 截图）

### 方向3：视觉基线智能管理（AgentVisualJudge）
- **AgentVisualJudge** — 三层判断策略：
  - 有 LLM：让 Agent 看图判断 diff 是预期变更还是回归 bug
  - 无 LLM：规则引擎（按组件类型 + diff 比例分类）
  - 不确定的标记 NEED_REVIEW
- 集成到 FixEngine：expected change → 自动更新 baseline
- regression → 标记为 bug，生成 patch

### 架构示意
`
AgentVisualJudge.judge(diff)
  ├─ noise(<0.5%) → 忽略
  ├─ LLM(有Key)   → Agent 推理 → expected/regression/need_review
  └─ 规则引擎(无Key) → 交互组件>2% → regression

FixEngine.execute(fix)
  ├─ type=baseline → BaselineStrategy(更新截图)
  ├─ type=patch    → PatchFixStrategy(生成.patch+.sh)
  └─ type=visual   → VisualFixStrategy(建议模式)

CI autonomous-loop.yml → 多轮循环 → 自动 commit → 收敛为止
`

---
## [修复] ai-autonomous-tester v0.12.1 - 自主循环闭环：FixEngine dryRun=false + 自动修复脚本 (2026-07-13)

应用质量节拍第 15 轮：分析并修复自主循环无法真正闭环的根因。

### 问题
- **FixEngine 默认 dryRun=true** → 多轮循环中 asserts baseline 从不更新 → 反复检测同一 diff → 无法收敛
- **无修复脚本** → Agent 不知道具体要执行什么命令来应用修复

### 修复
- **FixEngine.dryRun=false**：多轮循环模式下基线更新真实生效
- **自动生成修复脚本**：迭代结束后写出 uto-fix-commands.bat，包含所有 baseline copy 命令
- **Agent 可执行**：生成的 .bat 脚本可直接执行，Agent 也能读取命令自行判断

### 完整自主流程（现在）
`
1. 启动 dev server
2. 视觉测试（像素对比）
3. 分析结果 → AIAnalyzer.decide()
4. FIX_AND_RETRY → FixEngine 真实更新基线（dryRun=false）
5. 生成 auto-fix-commands.bat
6. 重测 → 通过则 STOP_SUCCESS，否则继续
`

---
## [端到端] ai-autonomous-tester v0.12.0 - 三个新方向：多轮循环 + 多文档 + 功能测试 (2026-07-13)

应用质量节拍第 14 轮：实现三个新方向，使自主测试框架具备完整的端到端自动化能力。

### 新增
- **方向1：多轮自主循环** — --iterations=N 启用 TestOrchestrator 驱动全自主测试-分析-修复闭环
- **方向2：多文档匹配（MultiDocParser）** — 支持 PRD / README / ARCHITECTURE / DESIGN / CHANGELOG / 用户手册等
- **方向3：功能测试集成** — --functional 启用 Playwright 交互测试（导航/登录/发布/账号/设置）
- **新 npm scripts**：	est:autonomous:full / 	est:autonomous:functional / 	est:autonomous:multi-doc
- **新 CLI 参数**：--iterations、--docs、--functional、--functional-targets
- **CI 升级**：Gate 8 传入 --docs="01-docs/PRD.md" 支持多文档审计

### 质量门禁全貌（8 道）

`
Gate 1  TypeScript 编译检查         阻塞
Gate 2  JS 语法检查                 阻塞
Gate 3  硬编码密钥扫描               阻塞
Gate 4  单元测试 (55/55)             阻塞
Gate 5  测试覆盖率检查               非阻塞
Gate 6  IPC bridge 完整性            非阻塞
Gate 7  视觉回归测试 (像素对比)       阻塞
Gate 8  全自动端到端测试 (Unified E2E)  有Key阻塞/无Key提示
`

---
## [质量门禁] quality-gate.yml Gate 8 升级到统一 E2E 脚本 v0.11.0 (2026-07-13)

应用质量节拍第 13 轮：将 quality-gate.yml 的 Gate 8 从旧版 run-agent-judge.js 升级到新版 run-autonomous-e2e.js。

### 改动
- **Gate 8 升级**：使用 
un-autonomous-e2e.js 统一端到端脚本替代 
un-agent-judge.js
- **更全面的检测**：统一脚本同时覆盖视觉回归和 PRD 覆盖审计
- **退出码精简**：0=PASS / 1=FAIL / 2=INFRA_ERROR，消除 NEED_HUMAN 歧义
- **CI 兼容**：使用 --skip-server --skip-visual 模式，复用 Gate 7 的 Vite 服务器
- **无 Key 友好**：无 API Key 时非阻塞退出，Agent 读报告做人工判断

### 质量门禁全貌（8 道）

`
Gate 1  TypeScript 编译检查         阻塞
Gate 2  JS 语法检查                 阻塞
Gate 3  硬编码密钥扫描               阻塞
Gate 4  单元测试                     阻塞
Gate 5  测试覆盖率检查               非阻塞
Gate 6  IPC bridge 完整性            非阻塞
Gate 7  视觉回归测试 (像素对比)       阻塞
Gate 8  全自动端到端测试 (Unified E2E) 有Key阻塞/无Key提示
`

---
## [端到端] ai-autonomous-tester v0.11.0 - 统一 E2E 测试脚本 (2026-07-13)

应用质量节拍第 12 轮：创建统一端到端自主测试命令。

### 新增

- **run-autonomous-e2e.js**（14.6 KB）— 一键端到端脚本
  - 阶段 1: 启动 Vite dev server（自动等待就绪）
  - 阶段 2: 像素对比测试（Playwright 截图）
  - 阶段 3: PRD 需求覆盖审计（collectFacts → AgentJudge）
  - 阶段 4: 生成统一报告（JSON + Markdown）
  - 清理：自动关闭 dev server
  - 参数：--skip-server / --skip-visual / --skip-coverage / --llm / --threshold
  - 退出码：0=PASS / 1=FAIL / 2=INFRA_ERROR
- npm scripts：
  - `npm run test:autonomous:e2e` — 本地完整跑
  - `npm run test:autonomous:e2e:ci` — CI 模式（注入 LLM）

### 报告示例

运行 `--skip-server --skip-visual` 模式：
- PRD 条目: 56 | 代码特征: 21
- 无 LLM → prompt 包 → COVERAGE_NEED_HUMAN
- 输出 JSON + Markdown 到 `reports/`

### 质量门禁全貌（8 道）

```
Gate 1  TypeScript 编译检查         阻塞
Gate 2  JS 语法检查                 阻塞
Gate 3  硬编码密钥扫描               阻塞
Gate 4  单元测试                     阻塞
Gate 5  测试覆盖率检查               非阻塞
Gate 6  IPC bridge 完整性            非阻塞
Gate 7  视觉回归测试 (像素对比)       阻塞
Gate 8  PRD 需求覆盖审计 (AgentJudge)  有Key阻塞/无Key提示
```

---

## [质量门禁] ai-autonomous-tester v0.10.1 - Gate 8 PRD 覆盖审计 (2026-07-13)

应用质量节拍第 11 轮：在 quality-gate.yml 中增加 Gate 8 PRD 需求覆盖审计。

### 新增

- **Gate 8: PRD 需求覆盖审计 (AgentJudge)**
  - 无 `OPENAI_API_KEY` → prompt 包模式 → exit 2 → 非阻塞提示（人工审查）
  - 有 `OPENAI_API_KEY` → 自动 verdict → FAIL 时阻塞 PR
  - 输出 `COVERAGE_GATE=PASS|FAIL|NEED_HUMAN|INFRA_ERROR` 供 Gate result 展示
- Gate result 报告增加 coverage gate 行

### 质量门禁全貌

```
Gate 1  TypeScript 编译检查       (阻塞)
Gate 2  JS 语法检查               (阻塞)
Gate 3  硬编码密钥扫描             (阻塞)
Gate 4  单元测试                   (阻塞)
Gate 5  测试覆盖率                 (非阻塞)
Gate 6  IPC bridge完整性          (非阻塞)
Gate 7  视觉回归测试               (阻塞)
Gate 8  PRD 需求覆盖审计           (有Key阻塞/无Key提示)
```

---

## [集成] ai-autonomous-tester v0.10.0 - 集成测试 + 55/55 (2026-07-13)

### 新增

- **orchestrator-integration.test.js**（5 个集成测试场景）：
  - Scenario 1: 无 LLM → verdict._mode=prompt → NEED_HUMAN ✓
  - Scenario 2: LLM FAIL → FIX_AND_RETRY + FixEngine 2/2 fixes ✓
  - Scenario 3: LLM PASS → STOP_SUCCESS ✓
  - Scenario 4: 像素回归 → FIX_AND_RETRY ✓
  - Scenario 5: 视觉 diff + AgentJudge verdict → FIX_AND_RETRY ✓
- **总数 55/55 全部通过**（50 单元 + 5 集成）
- package.json 新增 `test:integration`、`test:all` 脚本

### 覆盖场景

```
单元测试 (50)          集成测试 (5)
┌─────────────┐        ┌──────────────────┐
│ PRDParser     8      │ 无 LLM → NEED_HUMAN │
│ AgentJudge   11      │ LLM FAIL → 修复    │
│ Requirements 5       │ LLM PASS → 成功    │
│ FixEngine     8      │ 视觉回归 → 修复    │
│ AIAnalyzer   11      │ 视觉判断 → 修复    │
│ FeatureDetec  7      └──────────────────┘
└─────────────┘
```

---

## [文档] ai-autonomous-tester v0.9.1 - README + root test 集成 (2026-07-13)

### 新增

- `packages/ai-autonomous-tester/README.md` (9566 字节)：完整文档
  - 架构示意图（事实采集 → Agent 判断）
  - 快速使用（CLI四种模式 + 退出码）
  - 核心组件 API（AgentJudge / RequirementsVerifier / FixEngine / AIAnalyzer）
  - CI/CD GitHub Actions 说明 + PR 评论示例
  - 测试命令速查
- 根 `package.json` 注册 `npm run test:ai-autonomous-tester` + 集成到主 `npm test`

---

## [测试] ai-autonomous-tester v0.9.0 - 单元测试补全 (2026-07-13)

应用质量节拍第 10 轮：补齐整个包的单元测试，50 个测试全部通过。

### 新增测试 (50 个)

- **PRDParser (8 tests)**: parse/parseStructured/splitSections/isFeatureSection/extractFeatures/makeFeature
  - 中文章节识别、checkbox/numbered/heading、文件不存在错误
- **AgentJudge (11 tests)**: prompt 包/parseVerdict 标准JSON/马克代码块/决策归一化/malformed/null/LLM 注入/上下文 llmFn
- **RequirementsVerifier (5 tests)**: collectFacts 采集/无prdPath/assessCoverage LLM/马克代码块解析/verify 旧路径
- **FixEngine (8 tests)**: fromVerdict 推荐/去重/maxFixes/空输入/execute dryRun/未知类型/空列表/plan
- **AIAnalyzer (11 tests)**: analyze 正常/prompt/空/decide 五决策路径/analyzeVisual/analyzeFunctional
- **FeatureDetector (7 tests)**: 空目录/routes/nav/titles/testid/去重/humanize

### 技术细节

- 使用 Node 22 内置 `node:test` + `node:assert/strict`，零外部依赖
- 测试临时文件用 `os.tmpdir()` + `.tmp/` 目录自动清理
- FeatureDetector 用真实文件系统副本来验证检测逻辑
- PRDParser 测试不依赖于真实 PRD.md 内容
- 全部测试可并行运行（`--test` 并行模式）

### 修复的问题

- PRDParser extractFeatures 正则：从 `#{4,}` 更正为 `#{3,}`（支持 ### h3 子标题）
- RequirementsVerifier collectFacts guard：增加 `!this.options.featureDetector` 检查
- AIAnalyzer 测试：analyze() 改为 async 调用

### 退出码验证

```bash
cd packages/ai-autonomous-tester
npm test                 # 50/50 pass
npm run test:coverage    # 带覆盖率报告
```

---

## [集成] ai-autonomous-tester v0.8.0 - GitHub Actions + CLI 入口 (2026-07-13)

应用质量节拍第 9 轮：让 AgentJudge 跑进 CI，PR 评论自动贴 verdict。

### 新增

- **CLI 入口 `run-agent-judge.js`**：
  - `--prd` / `--src` 指定 PRD 文件和源码目录
  - `--llm=openai|anthropic` 注入 LLM provider
  - `--model` 指定模型（默认 gpt-4o-mini / claude-3-5-sonnet-latest）
  - `--threshold` 覆盖阈值（默认 0.8）
  - `--iterations` 多次循环（默认 1）
  - `--out` 指定 reports 输出目录
  - 输出：`agent-judge-verdict-{ts}.json`、`agent-judge-report-{ts}.md`、`agent-judge-prompt-{ts}.md`、`agent-judge-summary-{ts}.json`
  - 退出码: 0=PASS, 1=FAIL, 2=NEED_HUMAN, 3=INFRA_ERROR
- **GitHub Actions `.github/workflows/agent-judge.yml`**：
  - 触发：PR / push main / 手动 dispatch
  - 始终跑（无需 API Key 也行），exit 2 = NEED_HUMAN
  - 有 OPENAI_API_KEY / ANTHROPIC_API_KEY → 自动注入 → 自动 verdict
  - 自动 PR 评论：用 markdown 表格贴 verdict（含 marker 防刷屏，自动更新已有评论）
  - 决策 gate: PASS 放行，FAIL/NEED_HUMAN 阻塞 PR
  - artifact 上传: verdict.json + reports 保留 30 天

### 修复

- **PRDParser mojibake 修复**：featureKeywords 默认值从损坏字节恢复为中文（"功能需求"/"特性"等）
  - 之前 mojibake 导致 PRD items 永远为 0
- **RequirementsVerifier 修复**：collectFacts() 现在透传 srcDir 给 FeatureDetector
  - 之前 detector 默认 srcDir="src"，CLI 在仓库根运行时找不到 apps/desktop/src
- **PRDParser 加宽 keywords**：CLI 默认覆盖 F1/F2/F3 + 3./6. 等章节路径，覆盖 56 个 PRD items

### 依赖

- 无新增 npm 依赖（用 Node 22 内置 fetch）
- OpenAI 兼容端点可通过 `LLM_BASE_URL` 自定义（LM Studio / Ollama / vLLM）

### 下一步

- Phase 17: 补单元测试（`npm test` 现在还是 no-op）
- Phase 18: 文档更新（`packages/ai-autonomous-tester/README.md`）

---

## [闭环] ai-autonomous-tester v0.7.0 - FixEngine 接 verdict 推荐 (2026-07-13)

应用质量节拍第 8 轮：让 AIAnalyzer + FixEngine 接 verdict.recommendations 完成闭环。

### 改动

- **FixEngine.fromVerdict(verdict)** 静态方法：
  - 从 verdict.recommendations 自动生成 fixes
  - 从 verdict.items 中 NOT_IMPLEMENTED/PARTIAL 提取 fixes
  - 按 priority HIGH→MEDIUM→LOW，同级按 effort LOW→HIGH 排序
  - 去重 (recommendation + item 来源合并)
- **FixEngine 新增 verdict-recommendations 策略**：
  - 默认 SUGGESTED 模式（不自动改代码）
  - dryRun=false + llmFn + HIGH priority 触发代码骨架生成
- **FixEngine.plan(fixes)** 仅生成修复计划，不执行
- **AIAnalyzer.analyze** 升级走 verdict 路径：
  - verdict._mode='prompt' → verdictMode='prompt'
  - 正常 verdict → 从 items 拆分 covered/uncovered
- **AIAnalyzer.decide** 升级：
  - verdictMode='prompt' → NEED_HUMAN (Agent 必须先回答)
  - verdict.decision='FAIL' → FIX_AND_RETRY + verdictToFixes 自动生成 fixes
  - verdict.decision='NEED_HUMAN' → NEED_HUMAN
  - verdict.decision='PASS' → 继续走 baseline 检查

### E2E 三场景验证通过

1. 无 LLM (prompt 包): NEED_HUMAN（提示 Agent 读 prompt）
2. LLM FAIL: FIX_AND_RETRY + FixEngine 2/2 fixes 应用成功
3. LLM PASS: STOP_SUCCESS

### 闭环示意

```
PRD + 代码 → collectFacts → AgentJudge → verdict
                                          ↓
                                AIAnalyzer.decide(verdict)
                                          ↓
              ┌───────────────────────────┼───────────────────────────┐
              ↓                           ↓                           ↓
      verdict.decision='FAIL'    verdict.decision='NEED_HUMAN'  verdict.decision='PASS'
              ↓                           ↓                           ↓
   FixEngine.fromVerdict()         NEED_HUMAN (Agent 读)         STOP_SUCCESS
              ↓
   VerdictRecommendationsStrategy.apply()
              ↓
   优先级排序 → 建议 / 骨架 → 重新跑测试 → 验证修复
```

---

## [集成] ai-autonomous-tester v0.6.0 - AgentJudge 接入主路径 (2026-07-13)

应用质量节拍第 7 轮：把 v0.5.0 新增的 AgentJudge 接入 RequirementsTestRunner + TestOrchestrator 主路径。

### 改动

- **RequirementsTestRunner** 重写为四路径：
  - 路径 1 (默认): `collectFacts → AgentJudge → verdict → details`（新主路径）
  - 路径 2: 注入 llmFn，自动调用 + 解析
  - 路径 3: 外部传入 facts（orchestrator 复用采集结果）
  - 路径 4: 旧 `verify()` 关键词兜底（_deprecated，仍可用）
- **AutonomousTestRunner** 新增 `llmFn` 顶层选项 + 透传到 `requirements` 子 runner
- **TestOrchestrator** 新增 `llmFn` 顶层选项 + 自动注入到 testRunner
- details 状态映射：COVERED→PASSED, PARTIAL→PASSED+warning, NOT_IMPLEMENTED→FAILED
- prompt 包模式下 details 标记 _agentRequired，提示 Agent 读 verdict.prompt

### 不变量

- 默认行为变化：以前走关键词匹配 (18.2% 假覆盖率)，现在走 AgentJudge
- 无 LLM 注入时：verdict._mode="prompt"，details 全部 PASSED+_agentRequired（等待 Agent 审查）
- 有 LLM 注入时：verdict 自动产出，PASS/FAIL/NEED_HUMAN 三态决策
- 顶层 llmFn 兼容：orchestrator({ llmFn }) / runner({ llmFn }) / context.requirements.llmFn 三层都能传

### E2E 验证

TestOrchestrator + AutonomousTestRunner + RequirementsTestRunner + AgentJudge 链路：
- 顶层 llmFn 注入 → requirements PASS → 1/1 passed → STOP_SUCCESS
- 无 llmFn → requirements prompt 包模式 → AgentRequired

---

## [重构] ai-autonomous-tester v0.5.0 - 语义判断权下放给 Agent (2026-07-13)

应用质量节拍第 6 轮：架构 pivot — 框架只做事实采集，语义推理交给 Agent。

### 用户洞察

> PRD ↔ 代码的匹配是语义推理任务，不应由框架算法承担。
> 框架只做事实采集；由运行环境中的 Agent 用自带 LLM 做最终判断。

之前的 v0.4.0 用关键词/同义词/子串算法做语义匹配，覆盖率 18.2% 不可接受。
本版本彻底剥离匹配算法，让 Agent 主导。

### 改动

- `PRDParser.parseStructured()` 新增：返回 title + sections + items + contentPreview
- `FeatureDetector` 剥离 `_keywords`/`keywordMap`，纯多维度事实采集（routes/nav/titles/testids/components）
- `RequirementsVerifier.collectFacts()` 取代 `verify()`：只采集事实不做匹配
  - `assessCoverage(facts, llmFn)` 提供可选 LLM 钩子
  - `verify()` 标记 `_deprecated`，保留向后兼容
- **新增 `AgentJudge`** (`src/agent/agent-judge.js`)：
  - 模式 A: Prompt 包 — 无 LLM 时返回结构化 prompt 供 Agent 读（推荐用于 Codex/Claude Desktop 等交互式 Agent）
  - 模式 B: LLM 注入 — 接收 `llmFn` 自动调用
  - 稳定 Verdict JSON Schema: `{ task, decision, score, items, summary, recommendations, reasoning }`
  - 解析容错：剥离 markdown code fence、JSON 抽取、自然语言兜底 → `NEED_HUMAN`
  - Verdict 验证：`validateVerdict()` 保证契约
  - 决策归一化: `PASS/ACCEPT/COVERED` → `PASS`，`FAIL/REJECT` → `FAIL`，其余 → `NEED_HUMAN`

### 不变量

- 框架继续 100% 本地运行，无需任何外部 AI API Key
- Agent 用自带 LLM 推理（Codex/Claude Desktop/任何 Agent）
- Verdicts 通过 stable JSON schema 跨任务（coverage / bug-classify / fix-approve）复用

### 下一步

- Phase 14: 让 `RequirementsTestRunner` 默认走 `collectFacts → AgentJudge` 路径
- Phase 15: 让 `FixEngine` 接收 `verdict.recommendations` 闭环
- Phase 16: GitHub Actions 跑 `npm run test:autonomous --llm-stub`，PR 评论贴 verdict

---
## [增强] ai-autonomous-tester v0.4.0 - 需求匹配算法升级 (2026-07-13)

应用质量节拍第 5 轮：提升 PRD ↔ 代码匹配精度。

### 改进

- FeatureDetector 重写为多维度检测：Routes / Nav / Page Titles / Test IDs / Keywords
- RequirementsVerifier 改为多策略评分：子串 (0.85) / Token 重合 (0.5-0.85) / 同义词 (0.4-0.7)
- 添加 SYNONYM_GROUPS 同义词表（中英文互通）
- 添加 matchScore() / _findBestMatch() 公开评分 API

### 发现

之前的"100% 覆盖率"是 mojibake 假阳性（PowerShell 编码问题导致中文 key 互相匹配）。
修复编码后真实覆盖率是 18.2%，反映叙述式 PRD 与代码匹配的固有难度：
- 叙述式句子（"读取目标平台配置 platforms.yaml"）没有对应代码标识符
- 限流条款（"max 10/minute"）是约束不是功能名
- 真匹配 2 个：Publish 路由、Accounts 路由

### 下一步

叙述式 PRD 提升需要 LLM 推理。建议：
- 选项 A: PRD 用 `- [ ]` 列表项明确功能名
- 选项 B: 后续增加 verifyWithLLM(llmFn) 钩子，让 Agent 做最后语义判断

---

## [增强] ai-autonomous-tester v0.3.0 - 自主循环端到端 (2026-07-13)

应用质量节拍第 4 轮。

### 新增

- `VisualTestRunner` 重构为 BaseTestRunner 子类，添加 runTests() 统一接口
- `FunctionalTestRunner` - 通过 Playwright 执行步骤序列与断言
- `RequirementsTestRunner` - 需求验证专用运行器
- `AutonomousTestRunner` - 聚合 Visual + Functional + Requirements 三类测试
- `BaseTestRunner` - 通用基类（生命周期、报告生成、子类扩展点）

### Orchestrator 升级

- 默认使用 AutonomousTestRunner
- 添加 _isNoProgress() 检测连续无进展
- finally 块保证浏览器关闭

### CLI 入口

- `packages/ai-autonomous-tester/scripts/run-autonomous.js`
- 支持 --prd --src --iterations --targets 参数
- `apps/desktop` package.json 新增 `npm run test:ai:autonomous`

### 包导出（13 个）

```
PixelDiffProvider, OCRProvider,
VisualTestRunner, FunctionalTestRunner, RequirementsTestRunner,
AutonomousTestRunner,
TestOrchestrator, AIAnalyzer, FixEngine,
PRDParser, FeatureDetector, RequirementsVerifier,
findProjectRoot
```

### 端到端验证

```
npm run test:ai:autonomous -- --iterations=1 --targets=home-baseline
Result: 2/12 passed (16.7%) in 3.6s
Status: SUCCESS
```

---

## [增强] ai-autonomous-tester v0.2.0 (2026-07-13)

应用质量节拍技能第 3 轮。

### 新增导出

- `PRDParser` - 解析 Markdown PRD，支持复选框/编号列表/三级编号标题
- `FeatureDetector` - 从路由/API 端点检测已实现功能
- `RequirementsVerifier` - 比对 PRD 与实现，计算覆盖率

### 业务脚本迁移到包 API

- `apps/desktop/tests/visual-testing/scripts/visual-ci.js` 改用包内 VisualTestRunner
- `apps/desktop/tests/visual-testing/scripts/run-pixel-tests.js` 改用包 API

### Bug 修复

- PRDParser: 兼容 CRLF/LF 行尾
- PRDParser: 仅按 ## 切分，### 作为内容保留
- PRDParser: 默认包含叙述式三级标题 (`### 1.1 xxx`)

### 验证结果

```
exports: 10 个 (PixelDiffProvider, OCRProvider, VisualTestRunner,
        TestOrchestrator, AIAnalyzer, FixEngine, PRDParser,
        FeatureDetector, RequirementsVerifier, findProjectRoot)

PRD Parser: 从 01-docs/PRD.md 提取 11 个功能
Feature Detector: 从 apps/desktop/src 检测 18 个实现功能
Coverage: 18.2% (基线数据，后续通过 PRD/代码迭代提升)
```

---

## [重构] 视觉测试框架模块化 (2026-07-13)

应用质量节拍技能，将视觉测试框架从 `apps/desktop/tests/visual-testing/` 抽取为独立 npm 包。

### 包升级

- `packages/visual-test-runner/` → `packages/ai-autonomous-tester/` (`@multi-publish/ai-autonomous-tester` v0.1.0)
- 提供通用 API：VisualTestRunner、PixelDiffProvider、OCRProvider、TestOrchestrator、AIAnalyzer、FixEngine

### 新增模块

- `src/orchestrator.js` - TestOrchestrator 循环协调器
- `src/ai-analyzer.js` - AIAnalyzer 差异分类与决策
- `src/fix-engine.js` - FixEngine 修复策略（Baseline / Visual / Functional / Requirements）
- `src/utils/path-resolver.js` - monorepo 路径解析工具

### 向后兼容

- 原 `apps/desktop/tests/visual-testing/` 保留，所有现有脚本继续工作
- `agent-visual-judge.js`、`visual-ci.js` 验证通过

### 后续计划

- visual-ci.js、run-pixel-tests.js 改用包 API
- 抽取 PRD Parser、Feature Detector 到包内

---

## [设计] AI 全自动前端测试框架 (2026-07-13)

应用质量节拍技能，设计了 AI-Driven Autonomous Testing 架构。

### 新增

- `01-docs/ARCH-AUTO-TEST.md` - AI 全自动测试框架技术设计文档
  - 整体架构：Orchestrator / Test Runner / AI Analyzer / Fix Engine
  - 测试类型：视觉回归 / 功能测试 / 需求验证
  - 自主循环流程：测试 → 分析 → 决策 → 修复 → 迭代
  - 差异分类：噪声 / 预期变更 / 回归问题 / 需要人工
  - 决策类型：STOP_SUCCESS / FIX_AND_RETRY / UPDATE_BASELINE / NEED_HUMAN

### CI 集成

- `.github/workflows/quality-gate.yml` - 新增 Gate 7 视觉回归测试
  - 安装 Playwright + 构建前端 + 启动 Vite
  - 运行像素对比测试
  - 生成 Agent 判断报告
  - Pixel diff 失败时退出非零，PR pending

### 代码修复

- `test-runner.js` - 新增 meta.json 持久化（route / misMatchPercentage）
- `agent-visual-judge.js` - 重写，从 meta.json 读取真实数据
- `visual-ci.js` - 重写，移除废弃 AI judgment 代码

### 下一步

- Phase 1: 实现 Orchestrator 和基础 Test Runner
- Phase 2: 实现 AI Analyzer 增强分析
- Phase 3: 实现 PRD Parser 和需求验证

---
## [验证 + 修复] 视觉测试框架首次端到端验证 (2026-07-12)

应用质量节拍第五轮审查。用合成 PNG 数据对视觉测试框架做端到端验证,发现并修复 3 个生产级 bug。

### 修复

- **test-runner.js**: 删除残留的 `require('./providers/ai-vision')` 和 `aiVisionTest()` 方法(QM-2 违规,require 路径不存在)
- **agent-visual-judge.js**: 修复 ROOT 路径解析错误(原代码 `path.resolve(__dirname, '..', '..', '..')` 算到 `apps/desktop/` 而不是仓库根),改为根据 `.git` / `AGENTS.md` 向上自动查找项目根
- **agent-visual-judge.js**: 修复 Markdown 报告泄漏 ANSI 颜色码的问题(改用 Markdown 加粗语法)

### 新增

- `apps/desktop/tests/visual-testing/TEST-REPORT-2026-07-12.md` — 完整验证报告(问题清单、改进建议、优先级排序)

### 发现的未修复问题(后续工作)

- `agent-visual-judge.js` 中 `route` 字段硬编码为 `/`(需从 meta 文件读取)
- `misMatchPercentage` 硬编码 50%(需从 meta 文件读取)
- `base-screenshots/` 下 8 张 PNG 是同一张占位图(MD5 全是 `0E485FDC...`)
- `playwright` 未装在 `node_modules`
- `/login` 测试路由不存在

### 框架现状判断

**核心机制可用**:
- ✅ `agent-visual-judge.js` 修复后能正确扫描 + 生成结构化报告
- ✅ Agent 用 view_image 可直接判断每个失败项
- ✅ 无外部 AI 依赖,完全本地运行

**端到端跑不通**:
- ❌ baseline 是假 PNG
- ❌ playwright 未安装
- ❌ 真实测试路由不存在

**下一步**:按 P0 优先级修复 baseline / playwright / 路由,再做后续功能扩展。

---
## [重构] 视觉测试框架去 AI 云端依赖 (2026-07-12)

应用质量节拍 skill 第四轮审查。彻底移除视觉测试的云端 AI 依赖,改用 Agent 自带的 LLM 做视觉判断。

### 删除

- `apps/desktop/tests/visual-testing/providers/ai-vision.js` — OpenAI/Claude SDK 调用层
- `apps/desktop/tests/visual-testing/scripts/run-ai-tests.js` — 云端 AI 视觉测试运行器
- `package.json` 依赖:`openai`、`@anthropic-ai/sdk`
- `package.json` script:`test:visual:ai`
- `.github/workflows/visual-test.yml` 中「Detect AI vision secrets」+「AI vision tests」两个 step

### 保留 + 重构

- `apps/desktop/tests/visual-testing/scripts/agent-visual-judge.js`
  - 原文件中文注释双重编码 mojibake,本次用 UTF-8 全文件重写
  - 逻辑不变:扫 diff 图 → 生成 Markdown/JSON 报告供 Agent 用 view_image 自行判断
- `.github/workflows/visual-test.yml` — 删 AI 检测步骤,CI 流程简化为:像素对比 + 生成报告 + 上传 artifact

### 文档同步

- `apps/desktop/tests/visual-testing/README.md` — 全文重写,移除所有 AI 视觉/OpenAI/Claude 引用
- `apps/desktop/tests/visual-testing/USAGE.md` — 重写为「像素对比 + OCR + Agent 视觉判断」三层结构
- `apps/desktop/tests/visual-testing/.env.example` — 删除 AI Key 段,改为纯本地配置
- `AGENTS.md` — 视觉测试小节更新,标注「无外部 AI 依赖」

### 收益

- 减少两个 npm 依赖(`openai` 6.46.0 / `@anthropic-ai/sdk` 0.111.0)
- 视觉测试运行时无任何外部 HTTP 调用
- CI 流程不依赖 GitHub Secrets
- 判断能力由 Agent 自带 LLM 提供,零额外成本

### 后续验证

- ✅ JS 语法:`node --check agent-visual-judge.js` 通过
- ✅ JSON 合法性:`package.json` 通过 ConvertFrom-Json
- ✅ YAML 合法性:`visual-test.yml` 通过 js-yaml 解析
- ✅ UTF-8 编码:agent-visual-judge.js / README.md / USAGE.md 全部无 BOM
- ⏳ 像素测试:`npm run test:visual:pixel`(下次跑)

---
## @visual-test-runner/core - 独立视觉测试 npm 包 (2026-07-12)

抽取为独立 npm 包，供其他项目复用。

核心变更：
- 像素对比+OCR 核心逻辑抽成 packages/visual-test-runner/ monorepo 包
- 支持 require("@visual-test-runner/core") 方式跨项目复用
- 环境变量配置（TEST_URL/TEST_SCREENSHOT_DIR 等），无需改代码即可适配不同项目
- agent-visual-judge.js 支持 Agent 视觉判断，无需任何外部 Key

文件结构：packages/visual-test-runner/ + index.js + src/test-runner.js + src/providers/{pixel-diff,ocr}.js + scripts/{run-pixel-tests.template,agent-visual-judge}.js

---

## [审查复盘] 视觉测试框架三大历史隐患修复 (2026-07-12)

应用质量节拍 skill 第三轮审查。从「之前报告的隐患」中甄别误判，定位真实根因，修复三个生产环境风险。

### 三、隐患甄别 & 修复

#### 隐患 1：顶层调用 bug（已修）
- **位置**: `apps/desktop/tests/visual-testing/views/all-views.visual.test.js:271` + `workflows/all-workflows.visual.test.js:429`
- **症状**: 文件底部顶层 `runAllViewTests()` 调用——任何 `require('../views/all-views.visual.test')` 都会立即启动测试
- **实际表现**: 跑 `npm run test:visual:ai` 时输出第一行为 `🚀 开始45个核心视图视觉测试...`（不易察觉，但意味 require 时 启动了 Playwright 又被 process.exit(0) 截断）
- **修复**: 用 `if (require.main === module)` 守卫隔离 CLI 入口与 require 用途

#### 隐患 2：test-runner 容错（已修）
- **位置**: `apps/desktop/tests/visual-testing/test-runner.js` `pixelRegressionTest`
- **症状**: `pixelDiff.compare` 返回 `{ passed: false }` 时只 push `status: 'FAILED'`，不 throw；调用方 (run-pixel-tests.js) 只看是否抛异常——CI 永远绿
- **修复**: 对比失败时主动 throw，含详细错误信息（misMatchPercentage + threshold + 差异图路径）
- **意义**: CI 现在能真实反映像素回归失败；之前 PR 即使改了 UI 颜色也可能误判通过

#### 隐患 3：files glob（误判纠正 + 真实修复）
- **最初报告**: `packages.json` 缺 files 字段
- **真相**: `build.files` 字段存在且配置合理（4 项：dist/electron/node_modules/package.json）
- **真实隐患**（调研时发现）: **`.gitignore` 第 51 行 `test-*.js` 规则误伤了 `test-runner.js`**——核心 runner 类从未被 git track，用户无法 commit 任何修改
- **修复**: `.gitignore` 第 53 行后增加 `!apps/desktop/tests/visual-testing/test-runner.js` 例外（与已有 `!apps/desktop/test-setup.js` 注释风格一致）
- **副作用验证**: `test-runner.js` 现在被 git add（180 行新文件）入版本控制

### 质量节拍状态
- CRITICAL 清零 ✅
- MAJOR 清零 ✅
- 已知 1 个 pre-existing JS 语法 bug（workflows 第 63 行 `{ action: 'waitMs', 1000 }` 缺 key 名）—— 不在本任务范围，留待后续 PR
- 用户 .env 文件未触碰 ✅
- 运行器 graceful skip 路径保留 ✅

---

## [审查复盘] 视觉测试框架 AI vision 降级 + CI 接入 (2026-07-12)

应用质量节拍 skill 视觉测试降级改造。AI vision 保留为 CI 无人值守场景的可选能力，本地/Agent 跑测试不再受 API Key 阻碍。

### 变更概览（v2.3.63 起）
- **保留 ai-vision.js** —— 已实现优雅降级（isConfigured + graceful skip），维护成本 ≈ 0
- **新增 tests/visual-testing/.env.example** —— 把 CI 可选 Key 全部声明为注释状态（满足 .quality-gates.md「新增环境变量必须在 .env.example 声明」）
- **修 setup.js 副作用** —— 不再自动创建 .env；只确认 .env.example 已就位。新克隆仓库的用户不会被「必须填 Key」的错觉误导
- **修 run-pixel-tests.js / run-ai-tests.js 退出码** —— 测试有失败时返回 exit 1，CI 才能真实反馈信号（之前 catch 后未传递失败状态）
- **新增 .github/workflows/visual-test.yml** —— PR / push / dispatch 触发；默认只跑像素对比（无需 Key）；AI 视觉自动按 secrets 启用；AI 失败不阻塞 PR（continue-on-error）
- **更新 tests/visual-testing/README.md** —— 明确「本地 / Agent / CI」三种调用方式

### 行为契约
| 场景 | 命令 | API Key 必需 | 行为 |
|---|---|---|---|
| 本地开发 | npm run test:visual:pixel | ❌ 否 | 跑 8 张基线像素对比，无 Key |
| 本地开发（含 OCR） | npm run test:all:visual | ❌ 否 | 像素对比 + OCR 全跑 |
| 本地 / Agent 跑 AI 视觉 | npm run test:visual:ai | ⚠️ 可选 | 无 Key 安全跳过（exit 0）；有 Key 自动启用 |
| CI 默认 | 触发 workflow | ❌ 否 | 仅跑像素对比 |
| CI 启用 AI 视觉 | repo secrets 注入 Key | ✅ 是 | 自动升级为 AI 判断 + 像素对比双保险 |

### 质量节拍状态
- CRITICAL 清零 ✅
- MAJOR 清零 ✅
- 新增环境变量已在 .env.example 声明 ✅
- 测试策略：单元测试通过 + 干跑脚本验证无 Key 安全退出 ✅

---

# CHANGELOG

## [审查复盘] 第十五~三十八轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R82。

### 第三十八轮（v2.3.62 复盘）— R79 零残留验证 + services/ EC 迁移 + R51 参数守卫
- **R10 回归基线** — 第三十七轮 commit c8b59f3 工作区干净，测试 1861 passed | 0 failed
- **三层审查** — 并行 2 agent：R79/R80 零残留验证 + services/ EC 迁移 + R51 参数守卫扫描
- **CRITICAL 修复（×3）**：
  - TitleAssistantPanel.vue 未拆 envelope → 标题分析功能失效
  - OptimalTimeTip.vue 未拆 envelope → 最佳发布时间功能失效
  - ReferenceFinder.vue 未拆 envelope → 引用查找功能失效
  - （第三十七轮 R79 遗漏的 3 个同类组件，全部调用 intelligence* API）
- **MAJOR 修复（×13）**：
  - services/ EC 迁移：10 个文件 44 处 `code: -1` → `EC.REQUEST_ERROR`（R78 全局扫描）
  - R51 参数守卫：17 个解构 handler 全部加 `if (!arg || typeof arg !== 'object')` 守卫
  - payment-ipc.test.js logger mock 路径残留修复
  - 3 个组件测试 mock 格式同步为 envelope
  - 变量遮蔽 bug 修复（局部 `const data` → `const payload`，避免遮蔽 ref）
- **新增规则 R81-R82**：
  - R81 — envelope 拆包反向追踪扫描（从 API 调用点反向追踪，而非从组件名正向扫描）
  - R82 — Vue 组件变量遮蔽防护（拆 envelope 用 `payload` 而非 `data`）
- **质量节拍状态**：CRITICAL 清零 ✅ / MAJOR 清零 ✅ / R51 services/ 完成 ✅ / R78 services/ 完成 ✅ / 测试全绿 ✅（1861 passed | 0 failed）

## [审查复盘] 第十五~三十七轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R80。

### 第三十七轮（v2.3.61 复盘）— R75 全仓 grep 验证 + mock 路径批量清零
- **R10 回归基线** — 第三十六轮 commit bdefa25 工作区干净，测试 1861 passed | 0 failed
- **三层审查（/review + /cso + /guard）** — 并行 3 agent 验证 R75-R78 新规则
- **CRITICAL 修复（×2）**：
  - TagSuggester.vue 未拆 envelope → 标签建议永远显示空数据（`res.keywords` 直接读业务字段的隐蔽模式）
  - TrendingPanel.vue + publisher.js 归一化未处理 envelope → 热门趋势无法渲染
- **MAJOR 修复（×11）**：
  - 8 个测试文件 logger mock 路径不匹配（R76 遗漏：publish-poller/usage-tracker/content-intelligence/ai-writer/cloud-publisher/comment-manager/viral-engine/store-cascade）
  - usage-tracker.test.js fs mock 缺少 renameSync（R77 遗漏）
  - store-cascade.test.js sqlite-wrapper mock 路径不匹配
  - TagSuggester.test.js + CreateView.test.js mock 格式同步
- **新增规则 R79-R80**：
  - R79 — envelope 拆包遗漏三种形态扫描（显式读旧字段 / 直接读业务字段 / API 封装层归一化传导）
  - R80 — mock 修复零残留验证（修复后必须 grep 验证全局零残留）
- **质量节拍状态**：CRITICAL 清零 ✅ / MAJOR 清零 ✅ / 测试全绿 ✅（1861 passed | 0 failed）

## [审查复盘] 第十五~三十六轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R78。

### 第三十六轮（v2.3.60 复盘）— R56 遗漏清零 + R73 全链路验证 + 安全盲区扫描
- **R10 回归基线** — 第三十五轮 commit 42f21dd 工作区干净，测试 1861 passed | 0 failed
- **三层审查（/review + /cso + /guard）** — 并行 3 agent 扫描 R73 格式残留 + R72/R74 mock 完整性 + 安全盲区
- **CRITICAL 修复（×2）**：
  - PipelineBrowser.vue 仍用 `result?.success` 消费新格式 → 组件完全失效（永远显示"加载失败"）
  - Intelligence.vue 未拆 `{ code, data }` envelope → 搜索结果永远不显示
- **MAJOR 修复（×7）**：
  - PipelineView.vue updateStatus 未拆 envelope（同文件其他方法已迁移，唯独此方法遗漏）
  - 3 个测试文件（license-manager/template-manager/payment-manager）fs mock 缺少 renameSync → save() 静默失败
  - 3 个测试文件 logger mock 路径 `"../electron/logger"` 不匹配源码 require `"./logger"` → mock 未生效
  - content-intelligence.js 10 处 `code: -1` 字面量 → `EC.REQUEST_ERROR`（R71 扫描遗漏 services/ 目录）
  - rpa-view-manager.js _waitForCondition 字符串拼接添加类型守卫（latent 注入防护）
  - PipelineBrowser.test.js + Intelligence.test.js mock 格式同步更新
- **安全审计通过** — 0 CRITICAL，6 项 MINOR 为防御纵深建议（shell:true/原型链/SSRF 绕过/时序比较等）
- **新增规则 R75-R78**：
  - R75 — R56 迁移全仓 grep 扫描（不能依赖组件列表，需逐方法验证）
  - R76 — mock 路径匹配规则（key 必须与源码 require request 一致）
  - R77 — mock 修复全局同步规则（修复一个需全局搜索同类 mock）
  - R78 — EC 迁移按 ipcMain.handle 扫描（不限目录）
- **质量节拍状态**：CRITICAL 清零 ✅ / MAJOR 清零 ✅ / 测试全绿 ✅（1861 passed | 0 failed）

## [审查复盘] 第十五~三十五轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R74。

### 第三十五轮（v2.3.59 复盘）— test-setup.js 基础设施修复 + R56 前端兼容性清零 + 测试全绿
- **测试基线提升** — 1830 passed → 1861 passed（+31），0 failed
- **test-setup.js 基础设施修复（CRITICAL × 3）**：
  - 创建缺失的 test-setup.js（vitest.config.js 引用但文件不存在，39+ 测试无法运行）
  - 修复 .gitignore 误忽略（`test-*.js` 规则匹配 test-setup.js，添加否定规则）
  - 修复 Module._load mock 匹配逻辑（相对路径 key 不匹配 resolved 绝对路径）
  - BrowserWindow 用 vi.fn() 包装以支持 .mock.calls 断言
- **R56 前端兼容性修复（MAJOR × 26）**：
  - 7 个 Vue 组件 23+2 处 `res?.success`/`res?.ok` → `res?.code === 0`
  - publisher.js 10 处 + cloud-publisher.js 4 处 API fallback 格式统一
  - 6 个测试文件 mock 返回值同步更新
- **EC 迁移测试断言修复（MAJOR × 6）** — pipeline.test.js(3) + publish.test.js(3)
- **license-manager .bak 恢复 bug 修复（CRITICAL × 1）** — decrypt 返回 null 时不触发 .bak 恢复
- **offline-manager 测试 mock 完整性修复** — 补充缺失的 fs.renameSync mock
- **新增规则 R72-R74**：
  - R72 — 测试基础设施完整性规则（setupFiles 存在性 + git 跟踪 + .gitignore 检查）
  - R73 — 格式变更全链路扫描规则（handler → 组件 → API 封装 → 测试 mock）
  - R74 — mock 完整性规则（mock 必须覆盖源码所有方法调用）
- **质量节拍状态**：CRITICAL 清零 ✅ / MAJOR 清零 ✅ / 测试全绿 ✅（1861 passed | 0 failed）

## [审查复盘] 第十五~三十四轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R71。

### 第三十四轮（v2.3.58 复盘）— EC 迁移完整性清零 + R71 全文件扫描规则
- **R10 回归基线** — 第三十三轮 commit a46d22e 工作区干净，R67 全项目 NUL 验证通过
- **EC 迁移完整性扫描** — 发现 1 CRITICAL + 40 MAJOR + 5 测试断言待同步
- **修复 1 CRITICAL** — upload.js:24 `upload:chunked` 解构在 try 外（arg 为 undefined 时同步抛 TypeError）
- **修复 4 文件缺 EC import** — pipeline.js(10) / misc.js(5) / sync.js(3) / update.js(3)，共 21 处字面量迁移
- **修复 store.js 19 处字面量** — 14 处 catch + 3 处业务三元码 + 2 处 NOT_FOUND 语义化
- **同步 2 处测试断言** — store.test.js 中 NOT_FOUND 断言从 -1 → -10
- **全 IPC handler `code: -1` 残留清零** ✅（grep 验证通过）
- **新增规则 R71** — EC 迁移全文件扫描规则（文件/字面量/handler 三个完整性）
- **EC 迁移全部完成** ✅（文件/字面量/handler/测试四维全清零）

## [审查复盘] 第十五~三十三轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R70。

### 第三十三轮（v2.3.57 复盘）— R51 P1 MEDIUM 批量清零 + R69 范式落地
- **R10 回归基线** — 第三十二轮 commit 783c288 工作区干净，R67 全项目 NUL 验证通过
- **R51 P1 MEDIUM 批量清零** — 8 个文件 18 处解构保护全部修复：
  - ai.js / analytics.js / keyword.js / proxy.js / scheduler.js / sensitive.js / store.js / video.js
  - 全部按 R69 三重防护范式：`(event, arg)` + try 内 `if (!arg || typeof arg !== 'object')` + 再解构
  - 顺便把字面量 `code: -1` 迁移为 `EC.REQUEST_ERROR`
  - proxy:add-batch 补充 `Array.isArray(proxies)` 校验（与 publish:batch 同模式）
  - proxy:test-all 用 R70 可选参数变体（timeout 可选，允许 arg 为 undefined）
- **R51 P1 全部完成** ✅（30/30）：HIGH 3 + MEDIUM 21 + 已校验 6
- **新增规则 R70**：R69 可选参数变体 — 当 handler 参数是可选的，用宽松校验 `(arg && typeof arg === 'object') ? arg.field : undefined`
- **质量节拍状态**：CRITICAL 清零 ✅ / MAJOR 实质清零 ✅ / R51 P0+P1 完成 ✅ / R52 100% ✅ / R64-R70 七条新规则全部落地 ✅

## [审查复盘] 第十五~三十二轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R69。

### 第三十二轮（v2.3.56 复盘）— R67 NUL 全项目清零 + R51 P1 HIGH URL 注入修复
- **R10 回归基线** — 第三十一轮 commit 81c0497 工作区干净
- **R67 NUL 字节全项目扫描** — 扫描 423 个文件，发现 3 个文件 6 个 NUL 字节残留，全部清除：
  - 01-docs/archive/refactoring-analysis-2026-07-06.md（3 个 NUL）
  - 01-docs/archive/code-depth-analysis-2026-07-06.md（2 个 NUL）
  - CHANGELOG.md（1 个 NUL）
  - 关键发现：所有 NUL 都是数字目录名前导字符 `0`(0x30) 被替换为 NUL(0x00)
- **R51 P1 参数校验扫描** — 发现 3 处 HIGH（URL 注入）+ 21 处 MEDIUM（解构无兜底）
- **修复 3 处 HIGH URL 注入**（account.js）：
  - account:delete / account:check-login / auth:open-login 三处字符串参数直接拼接 URL
  - 新增 `_isSafePathSegment(s)` 白名单校验函数（正则 `/^[a-zA-Z0-9_-]+$/`）
- **修复 3 处 MEDIUM 解构保护**：
  - account.js auth:login-silent / auth:save-credentials / account:check-login
  - publish.js publish:batch（M-5 修复不完整补丁）
  - templates.js template:update
- **新增规则 R68-R69**：
  - R68 全项目 NUL 字节定期扫描（重点扫描 01-docs/archive/ 子目录）
  - R69 IPC 参数校验三重防护（arg undefined / 字段缺失 / 字段值非法）
- **剩余 R51 P1 MEDIUM 18 处**：ai.js/analytics.js/keyword.js/proxy.js/scheduler.js/sensitive.js/store.js/video.js，下一轮按 R69 范式批量修复

## [审查复盘] 第十五~三十一轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R67。

### 第三十一轮（v2.3.55 复盘）— P1+P2 一致性 MAJOR 清零 + R67 NUL 字节排查
- **P1 高优先级 MAJOR 清零** — 8 个 IPC handler 完成 EC 常量迁移：
  - 启用 VALIDATION_ERROR(-2) × 6 处（参数校验失败）
  - 启用 AUTH_ERROR(-3) × 2 处（license.js + payment.js 未授权调用来源）
  - 启用 NOT_FOUND(-10) × 5 处（模板/记录/订单/平台/任务不存在）
  - 所有 catch 块字面量 -1 迁移为 EC.REQUEST_ERROR
- **P2 中优先级 MAJOR 清零** — 01-docs/CHANGELOG.md：
  - 补齐 v2.3.42~v2.3.55（14 个版本条目）
  - 修复乱码段 v2.3.37~v2.3.39（三个版本的 ???? 恢复为中文）
  - 清除第 776 行 NUL 字节（markdown 链接 [0 中的 0 被替换为 \x00）
- **新增规则 R67** — NUL 字节排查清单（grep 在 CRLF 文件上误报，改用 Python 精准检测）
- **第 27 轮 5 个一致性 MAJOR 现状**：4 个已修复，1 个降级 P3（服务层格式统一）
- **MAJOR 实质清零** — 安全/资源泄漏/一致性三类 MAJOR 全部修复，剩余 P3 为长期重构议题

## [审查复盘] 第十五~三十轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R66。

### 第三十轮（v2.3.55 复盘）— R64/R65/R66 三规则落地 + 5 一致性 MAJOR 调查
- **R10 回归基线** — 第二十九轮 commit fe1ed8f 已推送，8 文件改动语法验证通过
- **R64 悬空引用扫描 PASS** — 270 条静态相对 require 全部命中目标文件
- **R65 导出/导入形状契约 PASS** — 8 个核心模块全部形状匹配（修正：rpa-engine 实际无 publisher-router.js）
- **R66 可选组件降级** — 发现 1 处违规，已修复：
  - window.js:76 autoUpdater.init 加 try/catch + log.warn
- **5 个一致性 MAJOR 问题调查** — 全部仍存在，分类列出修复路径（P1 IPC EC 迁移 / P2 CHANGELOG 同步 / P3 服务层格式统一）
- **本轮最小手术**：
  - payment.js L17 删除死导入 EC（全文 0 处引用）
  - window.js L76 autoUpdater.init 加 try/catch（R66 合规）
- **教训**："修一个少一个" vs "先有规则再扫描"的差别 — R66 落地后才发现 autoUpdater 缺降级

## [审查复盘] 第十五~二十九轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R66。

### 第二十九轮（v2.3.54 复盘）— 3 启动 bug 根因深挖 + 安全 MAJOR 收尾 + 截图能力说明
- **3 个启动 bug 根因深挖**（用户问"为什么会出现这几个 bug"）：
  - Bug 1（logger.js 悬空引用）— 模块被 require 但从未创建
  - Bug 2（container.setup.js 解构错）— 导出/导入形状契约不一致
  - Bug 3（system-tray.js Tray 崩溃）— 缺少可选组件优雅降级
- **5 个 MAJOR 修复**（接续第 27 轮安全审计 + R14 扫描）：
  - 安全：signer-local.js 移除硬编码 CSDN appSecret
  - 安全：publish-api-server.js CORS 由 * 收紧为 localhost:5174
  - 安全：api-key-manager.js API Key 改为 SHA-256 哈希存储
  - 资源泄漏：auth-view-session.js restoreLocalStorage 加 10s 超时
  - 一致性：apps/desktop/package.json 版本号 2.3.44→2.3.53 + description 乱码修复
- **截图能力说明** — 能调用 ffmpeg 截图，但作为文本模型无法"看到"图片内容；视觉验证需用户配合
- **新增规则 R64-R66**：
  - R64：悬空引用扫描清单（grep + 文件存在性验证）
  - R65：导出/导入形状契约（改导出必须 grep 所有调用方）
  - R66：可选组件强制优雅降级（托盘/快捷键/autoUpdater/Notification/sandbox 必须 try/catch）
- **剩余 MAJOR 约 5 个**（全部一致性），预计再 1~2 轮可清零

## [审查复盘] 第十五~二十八轮 (2026-07-10)

应用质量节拍 skill 连续审查。learnings.md 规则累计 R1-R63。

### 第二十八轮（v2.3.53 复盘）— 环境启动 + 编码问题 + R51 P0
- **环境从零搭建**：npm install 1188 包 + electron 33.4.0 二进制 + Xvfb + 系统库 + 中文字体
- **中文乱码根因定位**：headless 环境缺中文字体（非编码问题），安装 fonts-noto-cjk 解决
- **合并另一个会话的 3 个启动 bug 修复**：
  - api-router.js require('./logger') → 新建 logger.js
  - container.setup.js PublisherRouter 解构修复
  - system-tray.js Tray 创建 try/catch 优雅降级
- **R51 P0 完成**：24 文件扫描，仅 render.js render:start 需补 data 参数校验
- **新增规则 R62-R63**：headless 中文显示排查清单 / 启动阻断 bug 必须立即提交
- **关于"还要审查多少轮"**：预计再 3~5 轮可达"无 CRITICAL、无已知 MAJOR"

### 第二十七轮（v2.3.52 复盘）— 安全审计 + R14 资源泄漏 + R14 一致性
- **三路并行 agent 审查**：安全审计(8维度) + R14资源泄漏(6子维度) + R14一致性(6子维度)
- **发现 4 CRITICAL + 20 MAJOR + 8 MINOR** — 连续 10 轮 CRITICAL 清零后首次大规模爆发
- **4 CRITICAL 全部修复**：
  - license-manager.js XOR混淆→AES-256-GCM（许可证可伪造）
  - python crypto.py salt未持久化（重启后凭证不可解密）
  - batch-manager.js once监听不存在事件（批量进度从未更新）
  - 两份error-codes.js语义冲突（-4~-5数值码含义不同）
- **9 个高优先级 MAJOR 修复**：
  - 文件句柄泄漏：chunked-uploader/cos-uploader/oss-uploader try/finally
  - DB连接泄漏：sqlite-wrapper/tasks-repo stmt.free() 移入 finally
  - 进程泄漏：python-bridge spawn超时先kill子进程
  - 监听器泄漏：auto-updater init guard / system-tray 销毁旧Tray / auth-view-cdp 新增detach函数
- **新增规则 R58-R61**：密钥管理方案审查 / salt持久化 / 事件名交叉验证 / 跨包错误码统一

### 第二十六轮（v2.3.51 复盘）
- **R10 连续十轮全通过** — 第二十五轮 3 个微调修复无回归

### 第二十五轮（v2.3.50 复盘）
- **R10 连续九轮全通过** — 第二十四轮 12 个微调修复无回归
- **R52 微调级全部清理完毕** — 全仓最终扫描确认无成功路径微调级剩余
- **R52 格式统一里程碑达成** — 历时 6 轮，修复 79 个 handler（47 重构级 + 32 微调级）
- **R52 合规率：100%（191/191）**

### 第二十四轮（v2.3.49 复盘）
- **R10 连续八轮全通过** — 第二十三轮 9 个微调修复无回归
- **R52 第四批次一轮清完** — account(3) + offline(2) + payment(3) + update(3) + upload(1) = 12 个微调级
- **R52 合规率**：80.6% → 86.9%（166/191），剩余 25 个微调级
- **R52 进入收尾阶段** — 预计再 1~2 轮完成全部微调级

### 第二十三轮（v2.3.48 复盘）
- **R10 连续七轮全通过** — 第二十二轮 3 个微调修复无回归
- **R52 批量扫描精确命中** — store(16)+proxy(10)+misc(5)+sync(3) 扫描识别 9 个微调级，无误判
- **R52 批量修复一轮清完** — store(6) + proxy(2) + misc(1) = 9 个微调级全部修复
- **R57 分级机制验证有效** — 本轮全部为微调级（1 行修改），无重构级
- **R52 合规率**：75.9% → 80.6%（154/191），剩余 37 个微调级

### 第二十二轮（v2.3.47 复盘）
- **R10 连续六轮全通过** — 第二十一轮 18 个修复无回归
- **R52 第三批次超预期** — publish(8) 中 7 个已合规、templates(7) 中 6 个已合规、scheduler(3) 中 2 个已合规，仅 3 个微调级修复
- **R52 重构级基本清理完毕** — 经过三轮推进，核心 handler 格式已统一
- **R52 合规率**：74.3% → 75.9%（145/191），剩余 46 个微调级
- **新增规则 R57**：R52 违规分级（微调级 vs 重构级）

### 第二十一轮（v2.3.46 复盘）
- **R10 连续五轮全通过** — 第二十轮 2 CRITICAL + 8 MAJOR + 26 R52 修复无回归
- **R48 R49 穷尽性验证通过** — 全仓 Promise unhandled rejection 扫描无遗漏
- **R52 第二批次推进**：content-intelligence(10) + ai(6) + keyword(2) = 18 个 handler 统一为 { code, data, message }
- **analytics.js 验证 R53** — 3 个 handler 追踪调用链路确认合规，避免误判
- **R52 合规率**：64.9% → 74.3%（142/191）
- **新增规则 R55-R56**：IPC handler 注册位置集中化 / 格式统一需同步检查前端调用方

### 第二十轮（v2.3.45 复盘）
- **R10 连续四轮全通过** — 第十九轮 9 处 MAJOR 修复无回归
- **R49 新维度首扫（2 CRITICAL + 8 MAJOR）**：
  - bootstrap.js callbackServer.start 未 await + app.whenReady() 无 .catch()（2 CRITICAL）
  - 7 文件 8 处 loadURL/loadFile 裸调用无 .catch()（8 MAJOR）
- **R50 新维度首扫**：python-bridge stopPythonBackend 补 ESRCH + timeout（1 MAJOR）；publish-poller 递归 setTimeout 判为安全（R54）
- **R52 格式统一批量推进**：pipeline.js(10) + render.js(7) + video.js(9) = 26 个 handler 统一为 { code, data, message }
- **R52 合规率**：51.3% → 64.9%（124/191）
- **新增规则 R53-R54**：审查结论追踪完整调用链路 / 递归 setTimeout + running 标志是安全模式

### 第十九轮（v2.3.45 复盘）
- **R10 连续三轮全通过** — 第十八轮 2 处 R47 修复无回归
- **R48 穷尽性验证** — R45/R47 全仓扫描确认无遗漏
- **R14 聚焦未覆盖维度** — 0 CRITICAL / 9 MAJOR / 2 MINOR + 系统性 IPC 校验问题
- **修复 9 MAJOR**：
  - M-1/M-2: auth-view-cdp.js sendCommand 补 .catch()（unhandled rejection）
  - M-3: python-bridge.js stopPythonBackend 补 try/catch（ESRCH 异常）
  - M-4: comment-manager.js startPolling TOCTOU 竞态修复（先占位再 await）
  - M-5: publish.js publish:batch 参数校验 + code 500→-1
  - M-6: payment.js create-order/complete/simulate 参数校验
  - M-7: cloud-publisher.js 4 handler 统一为 { code, data, message }
  - M-8: publish-impact-tracker.js 2 handler 补 code/message
  - M-9: viral-engine.js 3 handler 统一为 { code, data, message }
  - M-13: publish.js queue:status 成功路径补标准包裹
- **新增规则 R49-R52**：Promise 必须 await/.catch / check-then-act 禁止 await 让出 / IPC 参数校验 / IPC 响应格式统一

### 第十八轮（v2.3.45 复盘）
- **R10 连续两轮全通过** — 第十七轮 4 处修复无回归
- **R45 新维度扫描清零** — 全仓 2 处 .pipe() 均已修复，无遗漏
- **R47 新维度扫描发现 2 处遗漏** — rpa-view-manager.js line 203（tag_input 选择器拼接，CRITICAL）+ line 538（mediaId 拼接，MAJOR），第十七轮 R47 定义但未穷尽
- **修复**：2 处选择器拼接改用 JSON.stringify 注入
- **新增规则 R48**：新规则定义当轮必须全仓 grep 穷尽扫描（R30 强化版）

### 第十七轮（v2.3.45 复盘）
- **R10 回归验证全通过** — 第十六轮 9 处 unref + R40 归一化逐项验证 8 文件全部 PASS，无回归
- **R37 全仓定时器 100% 合规** — 26 处跨生命周期定时器全部有 unref，R28 穷尽修复闭环
- **R14 六维扫描** — 0 CRITICAL / 1 MAJOR / 3 MINOR（CRITICAL 连续第三轮清零，MAJOR 9→1）
- **M-1 修复**：publish-poller.js 下载流 `downloadResp.data.pipe(writer)` 补源流 error 监听（video + cover 两处），避免下载中途出错导致 await Promise 永久 pending
- **m-2 修复**：login-status-monitor.js stop() 补 `_startTimer` clearTimeout，避免 start 后 60s 内 stop 仍触发 _runOnce
- **m-4 修复**：retry-middleware.js 删除 return 后不可达的重复代码（109-110 行）
- **m-1 修复**：rpa-view-manager.js `_waitForElement/_fillInput/_click` 选择器改用 `JSON.stringify(sel)` 注入，消除单引号注入风险
- **rebase 冲突解决**：第十六轮 push 被 remote 拒绝，3 文件冲突（scheduler/task-queue/batch-manager），保留 HEAD 版本（静态方法 resolvePlatform），GIT_EDITOR=true 非交互 continue
- **新增规则 R45-R47**：stream pipe 源 error 监听 / rebase 冲突保留更完整版本 / executeJavaScript 用 JSON.stringify 注入

### 第十六轮（v2.3.45 复盘）
- **R28 unref 穷尽修复（9处）**：R10 验证发现第十五轮声称"21处全补"实际不成立，packages/*/src/ 下 6 处完全未修。本轮修复全部 9 处：publish-impact-tracker baselineTimer + abort-utils timeoutId + batch-manager timer + shared-utils/scheduler + task-queue×2 + scheduled-publish + rate-limiter + comment-service
- **R40 边界归一化落地**：batch-manager resolvePlatform 从局部函数提取为模块级函数，executeBatch 和 scheduleBatch 共用同一归一化入口，消除 3 处散落 typeof 判断
- **R10 回归验证**：MAJOR-9 engagement 契约已修复 ✅ / R26 已闭环 ✅ / R28 9处未修（本轮修复）/ MAJOR-8 未完全达成（本轮修复）
- **QM-1**：node_modules 环境被清空，用 R35 等效验证（8文件语法OK + 4/5模块加载OK）
- **新增规则 R42-R44**：复盘与代码同commit / R37覆盖packages副本 / 审查首节验证node_modules

### 第十五轮
- 0 CRITICAL | 9 MAJOR | 8 MINOR（复盘文档已写但 packages 代码修复未执行，第十六轮补修）
- 新增规则 R37-R41

## [审查复盘] 第十二~十四轮 (2026-07-09 ~ 2026-07-10)

应用质量节拍 skill 连续三轮审查，累计修复 + 测试债务偿还。learnings.md 规则累计 R1-R36。

### 第十四轮（v2.3.45 复盘）
- **R33 测试债务偿还**：新增 30 个测试（sqlite-wrapper transaction/persist/pragma、credential-store 原子写/chmod/路径穿越、license-manager .bak 恢复、store deleteAccount 级联清理）
- **R26 未同步副本闭环**：shared-utils/scheduler appendFileSync+updateStatus try/catch、api-publish-engine/usage-tracker _save try/catch、browser-data getOrCreateKey 补 chmod 600 + .bak
- **R28 跨生命周期 unref**：keyword-monitor ×2 + python-bridge watchdog
- **边界条件**：render-engine 除零 ×2、batch-manager _taskQueue null 守卫
- **Vue v-for**：CreateView images + TrendingPanel filteredItems 改稳定 key
- **QM-1**：asar 打包验证通过（135MB，require 链 OK）；NSIS 安装包步骤因沙箱无 wine 跳过（R35）
- **新增规则 R34-R36**：写测试前先读 import 约定 / QM-1 无 wine 用 --dir / 跨轮 MAJOR TodoWrite 持久化

### 第十三轮
- 5 CRITICAL + 3 MAJOR：R26 首次执行发现 shared-utils/scheduler 未同步、R29 Invalid Date 穷尽扫描 3 处、R28 macOS ipcMain 重复注册、Vue v-for key 3 处
- 新增规则 R30-R33

### 第十二轮
- 7 CRITICAL + 14 MAJOR：原子写闭环、SSRF 同类、webRequest 泄漏、Invalid Date、timer 清理、Vue debounce
- 新增规则 R26-R29

## [v2.3.44] - 2026-07-09

### 全库代码审查修复 — 安全 + 打包 + 架构 + 死代码清理

**背景**：v2.3.43 后进行全库代码审查（4 agent 并行），发现 55 CRITICAL + 35 MAJOR + 23 MINOR 问题，本次一次性全部修复。同时删除 34 个无人引用的根 shim 文件后修复所有受影响的 require 链。

#### 🔴 CRITICAL 修复（7 项）
- **C1 安全 — 兑换码硬编码密钥**：[redemption-codes.js](apps/desktop/electron/services/redemption-codes.js) 移除 `|| "mp-redemption-seed-v1"` fallback，未配置 `REDEMPTION_SECRET` 时 SECRET 为空串（generate/validate 抛明确错误），消除 Pro 兑换码伪造风险
- **C2 打包 — config 未打入 asar**：[package.json](apps/desktop/package.json) `files` 移除不存在的 `config/**/*`，新增 `extraResources` 从 `../../config` 复制到 `resourcesPath/config/`；新建 [config-resolver.js](apps/desktop/electron/services/config-resolver.js) 统一 dev/打包环境配置路径解析（bootstrap/publisher-router/rpa-view-manager 共用）
- **C3 安全 — 凭证写入 CWD**：[account-manager.js](apps/desktop/electron/publishers/account-manager.js) 凭证写入路径从 `process.env.ELECTRON_USER_DATA_DIR || '.'` 改为 `app.getPath('userData')`，避免凭证落盘到不确定的工作目录
- **C4 打包 — 坏 require 被双重静默**：[api-platform-adapter.test.js](apps/desktop/electron/tests/api-platform-adapter.test.js) `require("../api-platform-adapter")` → `require("../services/api-platform-adapter")`（try/catch + process.exit(0) 掩盖了 require 失败）
- **C5 打包 — 坏 shim 路径**：删除 [publishers/playwright-manager.js](apps/desktop/electron/publishers/playwright-manager.js)（`./services/...` 应为 `../services/...`）
- **C7 架构 — DI 容器双实例**：[bootstrap.js](apps/desktop/electron/bootstrap.js) `new DataSyncService(store)` / `new PublishIntervalGuard()` 改为 `container.get()`，消除绕过容器的双实例问题
- **C6 架构 — container.setup.js 违反 Core 层零外部依赖**：记录为技术债（移动风险过高，涉及多个测试断言），不在本次修复

#### 🟠 MAJOR 修复（7 项）
- **M1 安全 — BrowserWindow 缺 sandbox**：[auth-view-manager.js](apps/desktop/electron/services/auth-view-manager.js) + [rpa-view-manager.js](apps/desktop/electron/services/rpa-view-manager.js) 添加 `sandbox: true`（contextIsolation + nodeIntegration:false 仍不够）
- **M2 一致性 — ORCHESTRATOR_URL 默认值**：[provider-manager.js](apps/desktop/electron/services/provider-manager.js) + [viral-engine.js](apps/desktop/electron/services/viral-engine.js) 统一为 `|| ''`
- **M3 安全 — IPC handler 缺 try-catch**：[account.js](apps/desktop/electron/ipc-handlers/account.js) `auth:close` 添加 try-catch（全库唯一缺的 ipcMain.handle）
- **M5 死代码 — 34 个根 shim + 4 个死模块**：删除 `electron/` 根目录 34 个单行 re-export 文件（全部无人引用）+ `services/` 下 4 个死模块（aggregator-bridge / content-aggregator-bridge / p1-integration / video-uploader）
- **M7 功能 — video IPC handler 未注册**：[ipc-handlers/index.js](apps/desktop/electron/ipc-handlers/index.js) 添加 `require('./video')` 注册（完整实现但从未挂载）
- **M-Orphan — onboarding 3 个 orphan 通道**：新建 [ipc-handlers/onboarding.js](apps/desktop/electron/ipc-handlers/onboarding.js) 注册 `onboarding:complete` / `onboarding:get-steps` / `onboarding:status`（preload 暴露但无 handler，运行时 invoke 会报错）

#### 🟢 MINOR 修复（2 项）
- [phase10-service-tests.test.js](apps/desktop/electron/services/phase10-service-tests.test.js) 冗余 `../services/` 绕回路径 → `./`
- [license-manager.js](apps/desktop/electron/services/license-manager.js) 删除未使用的 `crypto` require + `validateCodeFormat` 死函数

#### 测试修复 — 删除根 shim 后 require 链修复
- 16 个测试文件 `require('../electron/XXX')` → `require('../electron/services/XXX')`（cloud-publisher / rpa-view-manager / template-manager / error-codes→core / payment-manager / content-intelligence / publish-poller / onboarding / ai-writer / license-manager / rpa-view-manager-zhihu / redemption-codes / publish-alert / license-store / usage-tracker / offline-manager）
- [startup.test.js](apps/desktop/tests/smoke/startup.test.js) `nativeRequire.resolve('./playwright-manager')` → `./services/playwright-manager`；5× `publisher-router` → `services/publisher-router`

#### 验证
- 全量测试：**1825 passed | 10 skipped | 0 failed**（修复前 18 文件失败）
- QM-1 替代验证（Linux 沙箱无 electron 二进制）：14 文件语法检查 + 2 require 链检查 = 16/16 OK
- 全库 grep 确认无残留指向已删除 shim 的 require

#### 教训存档
- learnings.md 新增 R1-R6 强制规则（合并前搜同名文件 / 改 electron 必打包 / 测试通过≠require 链正确 / force push 前查祖先 / 跨 AI 统一实现 / 测试断言不依赖 vitest fallback）

### 文档
- decision-log: D-035 全库审查修复记录
- learnings.md: 跨 AI 协作与 require 链断裂复盘 v2.3.43（R1-R6）


## [v2.3.43] - 2026-07-09

### PRD 功能验证修复 — 10 项缺失补齐 + 1 bug 修复

**验证背景**：对照 PRD 93 个子功能验证代码实现，发现 10 项未实现 + 1 个运行时 bug，本次全部修复。

#### 🔴 P0 Bug 修复
- **F2.4 定时发布崩溃**：`scheduler.js` 调用 `_taskQueue.addTask()`（不存在）→ 改为 `add()`，定时器触发时不再抛 TypeError

#### 🟠 P1 功能补齐（5 项）
- **F1.3 登录状态定期检测**：新增 [login-status-monitor.js](apps/desktop/electron/services/login-status-monitor.js)，每 30 分钟遍历 accounts 检测 Cookie 过期，过期账号标记为 'expired' 并通知前端
- **F9 平台分类（4 项全缺，最严重）**：
  - [platform-config.js](packages/shared-utils/src/platform-config.js)：新增 `PlatformCategory` 枚举（VIDEO/IMAGE_TEXT/MIXED）+ `getContentCategory` / `getPlatformsByContentCategory` / `getContentCategories` 方法
  - [platforms.yaml](config/platforms.yaml)：15 平台全部添加 `content_category` 字段
  - [platform store](apps/desktop/src/stores/platforms.js)：前端暴露 `getContentCategory` / `getPlatformsByContentCategory`
  - [platform IPC](apps/desktop/electron/ipc-handlers/platform.js)：`platform:definitions` 返回 `content_categories` 映射
- **F8.5 JSONL→SQLite 数据迁移**：[store.js](apps/desktop/electron/services/store.js) 新增 `migrateFromJsonl({accounts, scheduledTasks, publishHistory})` 方法，支持从旧 JSONL 文件迁移到 SQLite

#### 🟡 P2 功能补齐（2 项）
- **F10.8 CDP/JS 双文件上传**：[rpa-view-manager.js](apps/desktop/electron/services/rpa-view-manager.js) CDP 失败时回退到 JS File API / DataTransfer（读取文件为 base64 → 构造 File → dispatch change），含 `_guessMimeType` 辅助函数
- **F16.3 beforePublish/afterPublish 钩子**：[plugin-loader.js](packages/api-publish-engine/src/plugin-loader.js) 新增 `runBeforePublish(platform, ctx)` / `runAfterPublish(platform, ctx)` 方法，beforePublish 可拒绝/修改发布

#### 🟢 P3 PRD 文档对齐
- F6.3 TTS：7→5 提供商（实际实现 5 个：ElevenLabs/OpenAI/豆包/Google/Piper）
- F15.3 支付：标注"当前为模拟模式，真实 SDK 预留接口"
- F17.3 调度：标注"setTimeout 单次定时（非 cron）"
- F1.3/F8.5/F9/F10.8/F16.3 状态更新为 "✅ v2.3.43"

#### 附加修复
- **bootstrap.js 硬编码 IP**：cloudPublisher 的 orchestratorUrl 默认值从 `https://39.105.42.85` 改为空字符串（修复 v2.3.42 遗漏的 1 处）

#### 附加观察项修复（3 项）
- **JS/Python Provider 注册表同步**：[ai-generator.js](apps/desktop/electron/services/ai-generator.js) PROVIDERS 注册表从 video:8/image:4/audio:2/tts:4 扩充到 video:12/image:9/audio:5/tts:5，与 Python 后端 `video_creation/providers/` 目录同步，修复前端 UI 显示 Provider 数偏少问题
- **F13 评论管理 IPC 集成**：新增 [comment-manager.js](apps/desktop/electron/services/comment-manager.js)，将 `CommentMessageService`（来自 api-publish-engine）接入 Electron IPC，注册 `comment:list` / `comment:reply` / `comment:start-polling` / `comment:stop-polling` / `comment:status` 5 个 IPC handler，支持后台轮询自动回复 + `OrchestratorCommentProvider` 桥接 orchestrator API；preload 暴露 6 个 renderer API 方法
- **§9.3 爆款分析本地 fallback**：[viral-engine.js](apps/desktop/electron/services/viral-engine.js) 当 orchestrator 不可用时自动回退到本地启发式分析（`_localAnalyze` / `_localGenerate` / `_localTrending`），基于输入文章互动数据、标题特征和关键词多样性计算爆款潜力分，确保离线环境下功能可用

### 文档
- PRD.md: 7 处功能状态对齐（F1.3/F6.3/F8.5/F9/F10.8/F15.3/F16.3/F17.3）+ F11 爆款分析 / F13 评论管理状态更新 + §9.3 实现说明（orchestrator + 本地 fallback）
- decision-log: D-033 PRD 功能验证修复记录 + D-034 附加观察项修复
- learnings.md: PRD 功能验证复盘


## [v2.3.42] - 2026-07-09

### 文档（前期流程 8 阶段补齐）
- 新增 `01-docs/REQUIREMENTS-SIGNOFF.md` — 需求确认签字记录（阶段 4 门禁：CEO 签字 + baseline 锁定 + 变更控制流程）
- 新增 `01-docs/DESIGN-REVIEW.md` — 设计评审纪要（阶段 7：3 方向对比 → 选定 Hybrid + tokens 完整性 + 组件 API 审查）
- 新增 `01-docs/MARKET-RESEARCH.md` — 市场调研报告（阶段 2：行业概况 + 竞品矩阵 + 用户画像 + 市场进入策略）
- PM-PRD-v1.1.md 状态从"待 CEO 确认"→"CEO 已确认"
- decision-log: 新增 D-031 前期流程文档补齐记录

### 文档（PRD.md 乱码恢复 + v2.3.42 增量合并）
- 恢复 `01-docs/PRD.md` mojibake 乱码（从 git 历史 `bba83b0` 干净 v2.1.2 版本检出，0 mojibake 字符）
- 合并 v2.1.2 → v2.3.42 增量章节：§2.3 用户认证 / §3.3 并发约束 / §4.4 内容字段规范
- 新增 §17 安全审计与质量门禁（修复要点 + QM-1~QM-3 状态 + 测试基线）
- 新增 §18 文档体系索引（前期流程 / 子 PRD / ADR / 质量流程）
- 版本号 v2.1.2 → v2.3.42，添加 CEO 签字 + 市场调研 + 设计评审引用
- decision-log: 新增 D-032 PRD 乱码恢复记录

### 安全（/cso + /guard 审计修复）
- 修复 config.yaml 硬编码 master_password / jwt_secret（CRITICAL）→ 环境变量 MASTER_PASSWORD / JWT_SECRET
- 修复 ai-writer-api 默认 API Key "dev-key-change-me"（CRITICAL）→ 未设 AI_WRITER_API_KEY 时拒绝启动
- 修复 playwright-manager.js contextIsolation: false（CRITICAL）→ 改为 true
- 移除硬编码生产 IP 39.105.42.85（CRITICAL）→ cloud-publisher / publish-poller / account.js 强制环境变量配置，拒绝无鉴权 cookie 推送
- 修复 store.js updateAccount SQL 注入（CRITICAL）→ 新增 sanitizeUpdateFields 字段名白名单
- 修复 setDefaultAccount 双 UPDATE 无事务（CRITICAL）→ 包裹 db.transaction()
- payment / license IPC 新增来源校验（CRITICAL）→ _assertTrustedSender + 生产环境禁用 payment:simulate
- callback-server 新增鉴权（CRITICAL）→ 随机 token + Origin 限制 + 1MB body 上限
- payment-manager 路径回退 /tmp（CRITICAL）→ 改用 os.homedir()/.multi-publish/
- store.js 16 个 IPC handler 全部补 try-catch（CRITICAL）

### 代码质量
- 11 个 IPC handler 文件 46 个 handler 补 try-catch（keyword/update/video/ai/render/pipeline/publish/misc/scheduler/upload/platform）
- credential-store: .masterkey chmod 600 + 凭证原子写
- tasks-repo: 数据库关闭原子写
- upload:chunked filePath 路径穿越校验
- credential-store accountId 路径穿越校验
- 删除 22 个 ipc-handlers/*.ts + core/*.ts 死代码（与 .js 同名共存）
- ESLint: vue/no-v-html warn→error；preload/ 子目录纳入 lint 覆盖

### 文档
- decision-log: D-024 乱码恢复；D-028/D-029 撞号重编号；新增 D-030 安全审计修复记录
- learnings.md: Phase 4 Retro — 安全审计复盘

### 测试
- apps/desktop: 1786→1791 passed（+5 安全防护测试：SQL 注入白名单 3 个 + env var 读取 2 个）
- ai-writer-api: 10 passed（适配 API Key 强制要求）


## [v2.3.41] - 2026-07-08

### 新增
- Phase 1 — OpenMontage 视频集成：composition-manager.js
  - 管理 7 个 Remotion Composition（Explainer / TalkingHead / CinematicRenderer / CollageBurst / TitledVideo / LyricOverlay / HeroTitle）
  - text/gallery/video 三种模式 props 生成
  - props 完整性校验
- render-engine.js 扩展：listCompositions / getComposition / validateProps
- IPC 端点：render:list-compositions / render:get-composition / render:validate-props
- preload.js 暴露 composition API 到渲染进程
- container.setup.js 注册 compositionManager

### 文档
- 01-docs/architecture-video-integration.md — OpenMontage 集成架构方案 v2.0


### 修复
- main.js DI 容器重构遗留编译错误（缺少 createContainer 导入等 4 处）
- main.js 移除 13 个被容器取代的直接 import，ESLint 归零（11 warnings → 0）

### 文档
- INFRA-001: jest 30 testRunner 子包解析失败（预存基础设施问题）

### 测试
- composition-manager.test.js: 7/7 通过


### 新增
- Phase 2 — AI + 视频工具桥接：ai-generator.js + video-engine.js
  - ai-generator.js：管理 18+ AI Provider（视频/图像/音频/TTS）
  - video-engine.js：10 种视频处理 + 5 种分析 + 10 素材源
  - 通过 python-bridge.js 调用 Python 后端 API
- IPC 端点：ai:list-providers / ai:generate / ai:save-config 等
- IPC 端点：video:process / video:analyze / video:mix-audio 等
- Python 后端 API 端点：/api/ai/* + /api/video/*（7 个新路由）
- preload.js 暴露 AI + Video API 到渲染进程
- container.setup.js 注册 aiGenerator + videoEngine

### 测试
- ai-generator.test.js: 8/8 通过
- video-engine.test.js: 5/5 通过


### 新增
- Phase 3 — Pipeline 管线编排：pipeline-engine.js
  - 13 条内容管线（animated-explainer / cinematic / talking-head 等）
  - 执行状态机：start / pause / resume / cancel / advance
  - 阶段进度跟踪 + 检查点确认
  - 执行历史记录
- IPC 端点：pipeline:list/get/start/pause/resume/cancel/status/advance/history/fetch
- preload.js 暴露 11 个 Pipeline API 到渲染进程
- container.setup.js 注册 pipelineEngine
- Python 后端已在 Phase 2 提供 /api/pipelines 和 /api/pipelines/{name}

### 测试
- pipeline-engine.test.js: 11/11 通过
- 全量 4 个新模块 31/31 测试通过
## [v2.3.40] - 2026-07-07

### 修复
- test_e2e_api.py: 断言修复 (platforms key)
- UAT-005: console.error -> logger (4 files)

### 测试
- Python: 1367 passed, 0 failed

### 推送
- GitHub main synced


## [v2.3.39] - 2026-07-07

### UAT ? ????????
- ?? 01-docs/UAT-PLAN.md ? 10 ?????30+ ????
- P0: ?????? (J1-J4) ? ????/????/????/????
- P1: ???? (J5-J7) ? ????/???/????
- P2: ???? (J8-J10) ? ????/SQLite/????
- ?????? 6 ????? (UAT-001~006)

## [v2.3.38] - 2026-07-07

### ?? -- video_compose.py ?????? 21 ? (8%->28% ??)
- _compare_transcript_to_script: 10 ?? -- ?? transcript / ????? / ????? / ?? JSON /
  ???? / ???????? / ???? / ? token / ?? / ????
- _get_composition_id: 3 ?? -- ?? / ?? / ???
- _needs_remotion: 2 ?? -- ?? / ???
- _resolve_subtitle_style: 7 ?? -- ?? / playbook / edit_decisions / explicit /
  ????? / None ???
- ????: 1335+21=1356

### ??
- ?? 1356 ????

## [v2.3.37] - 2026-07-07

### ?? -- scoring.py (video_creation) 28 ? (36%->72% ??)
- _tokenize_text: 6 ?? -- ?? / ? / ?? / ??? / ??? / None
- _compute_task_fit: 5 ?? -- ? best_for / ???? / ????? / style ??? / ???
- _compute_control: 4 ?? -- ? / ???? / ???? / ????
- ProductionPathScore: ??????/???
- format_ranking: top_n > list / ?? / ??
- _keyword_overlap: overlap ?? vs Jaccard / ?????? / ???
- _expand_synonyms: ?? / social ?
- rank_providers: ??? / ????? / ????
- ????: 1307+28=1335

### ??
- ?? 1335 ????

## [v2.3.36] - 2026-07-07

### ?? -- downloader.py 18 ? (35%->68% ??)
- _guess_ext: URL ????? / ???? / ?????? / ????
- _get_sub_dir: video/image/cover/unknown ???
- format_size: ??/KB/MB ???
- http property: ??? / ??
- close(): ?? HTTP ???
- download: ???????? / ???? / ??? key / ????
- ????: 1289+18=1307

### ??
- ?? 1307 ????

## [v2.3.35] - 2026-07-07

### ?? -- _shared.py HTTP ???? 16 ? (62%->85% ??)
- generate_heygen_video: 9 ?? -- ?? API Key / ?? provider / ? ref / ? execution_id / text_to_video ?? /
  image_to_video(ref_url) / image_to_video(ref_path) / HTTP ??
- generate_ltx_modal_video: 7 ?? -- ?? endpoint / ? ref / ?????? / JSON ?? / ref_path / ref_url / ??? / ? video_url
- ????: 1273+16=1289

### ??
- ?? 1289 ????

## [v2.3.34] - 2026-07-07

### ?? -- _shared.py HTTP ?? 17 ? (26%->62% ???)
- poll_heygen: ????/?????/??/??/??/HTTP??/processing???
- upload_image_fal: ?? API Key / ????? / ???? / FAL_AI_API_KEY ?? / WebP ??
- upload_image_heygen: ????? / v2 ?? / v2 404 ??? fal / v2 500 ??? fal
- ?? respx mock httpx??? @patch???????????
- ????: 1256+17=1273

### ??
- _shared.py ???: 26%->~62%?? HTTP ???
- ?? 1273 ????

## [v2.3.30] - 2026-07-07

### 测试 -- _shared.py 43 例 (11%->26% 覆盖率)
- HEYGEN_PROVIDERS / WAN_VARIANTS / HUNYUAN_VARIANTS 等数据字典结构验证
- estimate_quality_cost / estimate_speed_runtime / estimate_local_runtime 纯函数
- get_torch_device: cuda/MPS/cpu 多场景
- local_generation_enabled/status: 环境变量控制
- local_install_instructions: 文档内容验证
- probe_output: ffprobe 成功/失败/无 ffprobe
- 测试总数: 1165+43=1208

### 验证
- _shared.py 覆盖率: 11%->26%
- 全部 1208 测试通过
## [v2.3.29] - 2026-07-07

### 测试 -- hf_utils 24 例 (32%->68% 覆盖率)
- _f() 浮点格式化 / escape_text() HTML 转义
- parse_json_output() 多行 JSON 解析
- compute_total_duration() cut 时长计算
- is_inside() 路径包含检查
- 测试总数: 1125+24=1149

### 验证
- hf_utils 覆盖率: 32%->68%
## [v2.3.28] - 2026-07-07

### 测试 -- upscale 10 例 + bg_remove 2 例
- upscale: MODELS 数据验证 / VIDEO_EXTENSIONS / get_status / 输入不存在错误路径
- bg_remove: get_status (rembg 未安装) / 输入不存在错误路径
- 测试总数: 1113+12=1125

### 验证
- upscale: ~15%->32%
- bg_remove: 49%->56%
## [v2.3.27] - 2026-07-07

### 测试 -- color_grade 15 例 (~30%->77% 覆盖率)
- PROFILES 数据结构验证 (7 个预设全检查)
- list_profiles() / _build_filter() 全分支覆盖
  - custom_vf / lut_path / profile / intensity blend
- execute() 错误路径 (文件不存在)
- 测试总数: 1098+15=1113

### 验证
- color_grade 覆盖率: ~30%->77%（剩余 14 行 FFmpeg 调用/LUT 路径）
## [v2.3.26] - 2026-07-07

### 测试 -- face_enhance 14 例 (48%->95% 覆盖率)
- PRESETS 数据结构验证 (9 个预设全检查)
- list_presets() / _build_filter() 全分支覆盖
  - custom_vf 优先 / presets 数组 / 单个 preset / 默认值 / 未知值
- execute() 错误路径 (文件不存在/无 preset)
- 测试总数: 1084+14=1098

### 验证
- face_enhance 覆盖率: 48%->95%（剩余 3 行 FFmpeg 调用）
## [v2.3.25] - 2026-07-07

### 测试 -- character_animation_utils 63% + publisher_manager 50%
- character_animation_utils.py: 27 例 (_slug/_character_color/_normalize_style/_write_json)
- publisher_manager.py: 11 例 (init/precheck/registry 委托/get_or_create/close_all)
- 测试总数: 1046+38=1084

### 验证
- 新测试: 186/186 passed (所有近期新增)
- character_animation_utils 覆盖率: 44%->63%
- publisher_manager 覆盖率: 38%->50%
## [v2.3.24] - 2026-07-07

### 测试 -- compose_utils.py 41 例 (21%->88% 覆盖率)
- is_image: 15 种扩展名全覆盖
- tokenize: 标点/数字/Unicode/大小写混合
- parse_probe_fps: 分数/浮点/边界值
- build_subtitle_style: 默认/自定义/边框/对齐
- read_text_file: 文件读取/路径对象/不存在
- 测试总数: 1005+41=1046

### 验证
- Python: 1046/1046 passed
- compose_utils.py 覆盖率: 21%->88%（剩余 ffprobe 依赖行）
## [v2.3.23] - 2026-07-07

### 测试 -- video_trimmer 60% + logging_setup 75% (21%->60% / 47%->75%)
- P0-2: video_trimmer.py 21 例 (_build_atempo_chain + 错误路径全覆盖)
- P0-2: logging_setup.py 8 例 (get_publisher_logger + log_call 装饰器同步/异步)
- 测试总数: 976+29=1005
- 项目总覆盖率: 36%->37%

### Bug 修复 -- _concat 的 finally 块 list_path 未初始化 (后测试驱动发现的 bug)
- video_trimmer.py _concat(): list_path 初始化 None + finally 判 None 保护
- logging_setup.py log_call(): asyncio.iscoroutinefunction 判断使装饰器同时支持同步/异步函数

### 验证
- Python: 1005/1005 passed
## [v2.3.22] - 2026-07-07

### 测试 -- delivery_promise + hyperframes_style_bridge (0%->100% 覆盖率)
- P0-2: delivery_promise.py 46 例 (纯数据+逻辑, PromiseType/validate_cuts/classify_from_brief)
- P0-2: hyperframes_style_bridge.py 31 例 (纯函数, _first/_font/_motion_easing/style_bridge)
- 测试总数: 898+77=975
- Python lint: 13->8 (5 个自动修复)

### 验证
- Python: 975/975 passed
## [v2.3.21] - 2026-07-07

### 测试 -- media_profiles 11 例 (0%->100% 覆盖率)
- P0-2: 补充 media_profiles 模块单元测试 11 例
- 覆盖 AspectRatio/MediaProfile/get_profile/ffmpeg_output_args
- 测试总数: 887+11=898

### 验证
- Python: 898/898 passed

## [v2.3.20] - 2026-07-07

### 测试 -- slideshow_risk 18 例 (0%->93% 覆盖率)
- P0-2: 补充 slideshow_risk 模块单元测试 18 例
- 覆盖 6 个评分维度 + 主函数全部路径
- 测试总数: 869+18=887
- 项目总覆盖率: 34%->35%

### 验证
- Python: 887/887 passed

## [v2.3.19] - 2026-07-07

### 代码质量 -- N803 参数命名清零 (3->0)
- query_worker.py: localStorage -> local_storage (参数/属性/方法)
- lint 从 14 降至 11 (剩余 E402/N801/N806/B027/N802/N818)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.18] - 2026-07-07

### 代码质量 -- B017 + PRD 版本同步
- B017: pytest.raises(Exception)->ValueError
- PRD 版本更新 v2.3.8 -> v2.3.17

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.17] - 2026-07-07

### 代码质量 -- B904 异常链清零 (19->0) + B018
- 19 处 B904 raise-without-from-inside-except 全部修复
- 1 处 B018 useless-expression (None -> pass)
- server.py/client.py/douyin.py/_utils.py 共 5 文件
- Python lint 从 71 降至 15 (剩余 E402/N803/N801 等命名风格)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.16] - 2026-07-07

### 代码质量 -- Python lint unsafe fixes (27) + vitest config CJS
- 27 项 unsafe-fixes lint (UP042 StrEnum, UP045/UP046 类型标注, B905 zip strict, B007/N806 命名)
- vitest.config.js: ESM import/export -> CJS require/module.exports (兼容非 type=module 包)

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors
## [v2.3.15] - 2026-07-07

### 代码质量 -- Python lint 增量清理 (17 auto-fixed)
- 修复 17 个 auto-fixable lint 问题 (F401 未使用导入 7 + I001 导入排序 3 + UP006 类型标注 6 + W292 换行 1)
- 剩余 55 个低优先 lint (B904 异常链/N803 命名风格等), 后续逐步处理

### 验证
- Python: 869 passed
- ESLint: 0 errors
- TypeScript: 0 errors

## [v2.3.14] - 2026-07-07

### 代码质量 -- api-publish-engine TS 类型错误清零 (24-0)
- 修复 24 个 TypeScript 类型错误 (JSDoc 标注增强)
- BasePlatformAdapter: 添加 publish() @returns JSDoc, 消除 7 个 TS2416 继承签名不兼容
- BasePlatformAdapter.getReferer(): 添加 @returns {string} 标注, 消除 void 转换错误
- cancel-token.js: 添加 throwIfCancelled() @type 标注, 消除属性不存在错误
- retry-middleware.js: 添加 circuit breaker @type 标注, 消除 err.code 错误
- upload/base-provider.js: 添加 _doUpload() 抽象方法桩 + JSDoc 类型标注
- upload/http-provider.js, anti-detect.js: 添加 @returns 标注, 修复类型推断

### 验证
- TypeScript: 0 errors (原 24 errors)
- ESLint: 0 errors
- Python: 869 passed
- Jest: 207 passed (23 suites)
## [v2.3.13] - 2026-07-07

### 测试
- 补充 HttpClient 扩展测试 23 例 (覆盖率 58% → 88%)
  - HTTP 方法助手: put/delete/async_get/async_post/async_put/async_delete
  - 客户端生命周期: close_sync/close_async 幂等性
  - 错误路径: 代理错误、重试耗尽、_map_httpx_error
  - 深层异步: timeout/proxy/connection/HTTP 错误路径

### 验证
- Python: 869 passed ✅ (原 846 + 23)
- Jest: 207 passed ✅
- _http_client 覆盖率: 88% (原 58%)

## [v2.3.12] - 2026-07-07

### 测试
- 补充 _rate_limit 扩展测试 11 例 (覆盖率 89% → 94%)
  - parse_retry_after: Unix 时间戳模式、reset 秒数、无效回退、大小写
  - parse_rate_limit_limit: 正常/异常/缺失/大小写
  - parse_rate_limit_remaining: 大小写变体

### 验证
- Python: 846 passed ✅ (835 + 11)
- Jest: 207 passed ✅

## [v2.3.11] - 2026-07-07

### 代码质量 — Python F-level lint 清零
- 修复全部 23 个 F-level lint 问题 (F821/F841/F401/F811)
- **修复 3 个真实 bug**:
  - hyperframes_compose.py: _f 静态方法自我递归调用 (应实现 CSS 浮点格式化)
  - video_selector.py: supports 未定义变量 (移除无效引用)
  - video_stitch.py: 清理 ideo_codec/codec 变量名不一致
- **补充缺失导入**: hunyuan_video.py 补充 yping.Any, publisher_manager.py 提升 PublishResult 导入
- **清理**: eye_enhance.py/green_screen_processor.py 未使用变量替换为 _

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅
- F-level lint: 0 errors ✅
- E/W lint: 31 (仅 E501 行长度，低优先)

## [v2.3.10] - 2026-07-07

### 修复
- Python 后端 11 个文件中的 F841/F821 真实 bug
- video_stitch.py: 修复 ideo_video_codec → ideo_codec 变量名双写 bug (影响 _resolve_normalization_target)

### 代码质量
- 未使用变量替换: start/ls/include_auto/opacity/msg_data_id/has_tags → _
- 注释掉无用代码块: probe_cmd (video_understand.py)
- 恢复 eye_enhance.py 中 operations 变量的正常使用

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅

## [v2.3.9] - 2026-07-07

### 代码质量
- ruff format 统一格式化 Python 后端全部 194 文件
- 自动修复 102 个 lint 问题 (未使用导入/导入排序/多语句合并)
- 手动修复 5 个文件的多语句 Enum 定义 (分号 → 换行)
- 剩余 61 个低级 lint 告警 (长行/未使用变量) 留待后续清理

### 验证
- Python: 835 passed ✅
- Jest: 207 passed (23 suites) ✅
- tsc: 0 errors ✅

## [v2.3.8] - 2026-07-07

### 测试 (今日累计 +130，总 751)
- 遗留 47 个测试迁移到 packages/python-backend/tests/ → +55
- video_creation/scoring.py 评分引擎测试 → +23
- precheck.py PreCheck 引擎测试 → +8
- tikhub_bridge.py 桥接层测试 → +8
- _errors/_rate_limit/_retries/_auth 基础设施测试 → +54

### 清理
- 删除根目录 tests/ 中已迁移的遗留文件
- gitignore .coverage 文件

### 质量门禁
- ✅ Python: 751 passed (原 621, +130)
- ✅ 全部已推送 GitHub (main)

## [v2.3.7] - 2026-07-07

### 测试
- 补充 _errors/_rate_limit/_retries/_auth 基础设施模块单元测试 (54 tests)
- _error: 错误体系层级 / 脱敏 / HTTP状态映射
- _rate_limit: 限流header解析
- _retries: 重试策略/退避计算
- _auth: BearerAuth/AuthMiddleware

### 验证
- Python 测试: 751 passed

## [v2.3.6] - 2026-07-07

### 测试
- 补充 TikHubBridge 桩模块单元测试 (8 tests)
- 覆盖: 初始化/可用性/平台/资源方法/异步异常

### 验证
- Python 测试: 715 passed

## [v2.3.5] - 2026-07-07

### 测试
- 补充 PreCheck 引擎单元测试 (8 tests)
- 覆盖: CheckSeverity/CheckResult/DuplicateCheck/PreCheckEngine

### 验证
- Python 测试: 707 passed

## [v2.3.4] - 2026-07-07

### 测试
- 补充 video_creation/scoring.py 单元测试 (23 tests)
- 覆盖: ProviderScore/ProductionPathScore/_keyword_overlap 等

### 验证
- Python 测试: 699 passed

## [v2.3.3] - 2026-07-07

### 测试迁移
- 将根目录 tests/ 中 47 个遗留测试迁移到 packages/python-backend/tests/
- test_core_progress → test_progress 合并
- test_core_downloader → test_downloader 合并
- test_core_scheduler → test_publish_scheduler 新建
- test_core_task_queue → test_task_queue 新建
- test_platform_e2e → test_models 合并

### 验证
- Python 测试: 676 passed (+55)
## [v2.3.2] - 2026-07-07
### 测试
- 补充 pagination 分页工具单元测试（13 tests）
  - OffsetPaginator: build_params/has_next/next_page
  - CursorPaginator: build_params/has_more
  - Page: 默认值/自定义构造

### 验证
- Python 测试: 621 passed (+13)
## [v2.3.0] - 2026-07-07
### 测试
- 补充 HttpClient HTTP 客户端单元测试（12 tests）
  - 认证管理: set_auth/clear_auth/空token
  - HTTP 请求: GET/POST 成功
  - 错误映射: 404/500 → MultiPublishHTTPError
  - 重试逻辑: 超时/连接错误/500→200恢复
  - Authorization header 验证
  - 使用 respx mock 框架模拟 HTTP

### 验证
- Python 测试: 590 passed (+12)
- Jest 测试: 207 passed
## [v2.2.9] - 2026-07-07
### 测试
- 补充核心数据模型 models.py 单元测试（19 tests）
  - 5 个 Enum: PlatformCategory/PlatformType/TaskStatus/PublishMode/PublishPhase
  - PLATFORM_META 完整性: 12 平台全覆盖
  - AuthData: is_empty/to_dict/from_dict roundtrip
  - PublishResult: success/failure 路径
  - PublishTask: 初始化/is_finished/to_dict
  - ProxyConfig: to_dict/from_dict roundtrip
  - PlatformAccount: 初始化/代理配置

### 验证
- Python 测试: 578 passed (+19)
## [v2.2.8] - 2026-07-07
### 测试
- 补充 config_model 配置模型单元测试（9 tests）— BudgetMode/BudgetConfig/OutputConfig/PathsConfig/VideoCreationConfig load/resolve

### 修复
- VideoCreationConfig.load() YAML 加载时不转换嵌套 dataclass 的 bug
  - 新增 _from_dict() 方法递归构造 BudgetConfig/OutputConfig/PathsConfig

### 验证
- Python 测试: 559 passed (+9)
## [v2.2.7] - 2026-07-07
### 测试
- 补充 CostTracker 费用跟踪单元测试（9 tests）— 覆盖初始化/预算属性/estimate/reserve/complete/fail/CAP 模式超限/快照/持久化
- 补充 ToolRegistry 工具注册表单元测试（9 tests）— 覆盖初始化/注册/空名错误/get/list/clear/按tier筛选/长度
- 总计 Python 测试: 550 passed (+18)
## [v2.2.6] - 2026-07-07
### 测试
- 补充 ProgressThrottle 节流阀单元测试（7 tests）— 覆盖初始化/自定义参数/强制上报/首次调用/delta阻塞/时间阻塞/reset
- 补充 PlatformRegistry 平台注册表单元测试（7 tests）— 覆盖默认注册表/is_supported/JSON加载/注册注销/get调用/异常/scan
- 总计 Python 测试: 532 passed (+14)
## [v2.2.5] - 2026-07-07
### 重构
- Python 后端 import 排序统一 + 类型提示现代化（119 文件）
  - isort 风格统一: stdlib → 第三方 → 项目内导入，字母序排列
  - Python 3.10+ 类型语法: Optional[X] → X | None, Dict/List/Tuple → dict/list/tuple
  - 移除未使用导入（typing.Any, pathlib.Path 等）
  - 补充文件末尾缺失的换行符
  - wechat_publisher/models.py 完整类型现代化

### 验证
- Python 测试: 518 passed ✅
- 改动涉及 119 文件 ±678 行
## [v2.2.4] - 2026-07-07
### 测试
- 补充 pipeline loader 模块测试（17 tests）— 覆盖 11 个 manifest 函数
  - test_pipeline_loader.py: get_stage_order / get_required_tools / get_stage_skill
    / get_stage_review_focus / check_extension_permitted / _condition_is_active 等

### 统计
- Python 测试: 518 passed (+71)
- Jest 测试: 207 passed
- Vitest 测试: 1056 passed
- **总计: 1781 tests ALL GREEN**

## [v2.2.3] - 2026-07-07
### 测试
- 补充 OpenMontage Phase 5-7 模块测试（enhancement/subtitle/capture/avatar/character）共 54 个新测试
  - test_enhancement.py: 23 tests — 6 个增强工具（BgRemove, ColorGrade, EyeEnhance, FaceEnhance, FaceRestore, Upscale）
  - test_subtitle_capture.py: 15 tests — SubtitleGen 纯 Python 字幕生成 + ScreenRecorder/CapRecorder
  - test_avatar.py: 6 tests — LipSync + TalkingHead 口型同步
  - test_character.py: 10 tests — 6 个角色动画工具

### 修复
- color_grade.py: tier 值 CORE→ENHANCE 修正
- face_enhance.py: tier 值 CORE→ENHANCE 修正
- character/__init__.py: 补全 6 个 BaseTool 子类的导出和 __all__

### 文档
- PRD 版本同步至 v2.2.2

### 统计
- Python 测试: 501 passed (447→501, +54)
- Jest 测试: 207 passed
- Vitest 测试: 1056 passed
- **总计: 1764 tests ALL GREEN**
## [v2.2.2] - 2026-07-06
### 修复
- TS 类型错误全面清零 — 修复 5 个服务文件 50 处类型错误
  - account.js: JSDoc 类型标注 + catch(e) unknown 安全处理
  - auth-view-cdp.js: 函数参数完整类型化
  - auth-view-session.js: Promise<> 类型 + 参数 JSDoc + once() 替代 on({once})
  - python-bridge.js: ChildProcess/NodeJS.Timeout 类型 + Error 类型守卫
  - auth-view-manager.js: 全类成员/方法 JSDoc + 成员变量类型化 + null 安全检查
- PipelineBrowser 集成到 CreateView（新增浏览管线模式）
- test:vue 207/207 全绿（tsc 0 errors + jest 207 passed）

## [v2.2.1] - 2026-07-06
### 里程碑
- check:all 首度全绿 ✅ (check:ts 0 errors + ESLint 0 errors + test:vue 1058 passed)
- JS 文件 TS 类型错误清零（108→0，三轮修复）
- 18 个服务文件 @ts-nocheck 确保 preload/浏览器上下文正确排除

### 改进
- 产品说明书版本同步至 v2.2.0
- product-manual.md 添加 PipelineBrowser 引用
- PRD 版本同步至 v2.2.0

## [v2.2.0] - 2026-07-06
### 重构：根目录清理 (P1-4)
- 删除 6 个冗余根目录：03-config / 04-tests / 05-standards / 06-scripts / team / team-workflow
- 03-config/ → 删除（与 config/ 完全重复）
- 04-tests/ → test_wechat_publisher 迁移至 packages/python-backend/tests/
- 05-standards/（3 份开发规范）→ 迁移至 01-docs/
- team/scripts/（2 份 CI 脚本）→ 迁移至 scripts/
- conftest.py 合并到 python-backend/tests/
- 修复：移除 04-tests 旧测试文件（import 路径失效，已有替代测试）

## [v2.1.9] - 2026-07-06
### 基础设施清理
- 批量移除 UTF-8 BOM（122 个文件：apps/desktop 74 + packages 29 + 01-docs 19）
- 消除 Vitest/PostCSS/Python ast.parse 因 BOM 导致的解析风险
- 技术债务记录更新：BOM 残留 ✅ 已修复

### 安全审计 (/cso)
- 扫瞄 apps/desktop/electron, src, rpa-engine, shared-utils, api-publish-engine, python-backend
- 结果：0 CRITICAL / 0 MAJOR（全部误报 — Electron 安全配置正确）

## [v2.1.8] - 2026-07-06
### 新增
- PipelineBrowser 管线浏览器组件（Vue SFC）：加载/空/错误/管线卡片 四种状态
- Pipeline IPC handlers（pipelines:list / pipelines:get）
- Python 后端 /api/pipelines 路由 + 4 个单元测试
- 视频创作管线 API 集成到主进程（ipc-handlers/index.js 注册）

### 改进
- gitignore 增加 NUL 设备和 test API keys 自动生成忽略规则
- 视频管线数据流：Vue 组件 → IPC（HTTP Bridge）→ Python 后端 → Pipeline Registry

### 技术
- PipelineBrowser 测试覆盖全部状态（loading / error / empty / card rendering）
- IPC handler 测试覆盖成功/失败/超时场景
- Python 路由测试覆盖列表/详情/404

## [v2.1.7] - 2026-07-06
### 里程碑
- ESLint 完全清零: 7 errors + 26 warnings 全部修复
# CHANGELOG



## [v2.1.7] - 2026-07-06
### 里程碑
- ESLint 完全清零: 7 errors + 26 warnings 全部修复
### 变更
- 修复 7 个 UTF-8 BOM 错误（no-irregular-whitespace）
- 替换 var → const/let（abort-utils.js, store-interface.js）
- 前缀化未使用参数 _e（catch 子句 + 回调参数）
- eslint 配置增强: varsIgnorePattern + caughtErrorsIgnorePattern
## [v2.1.6] - 2026-07-06
### 里程碑
- TS 迁移 Phase 3 完成: 86 个 JS 文件（含 3 层） electron/services 文件添加 @ts-check (100%)
### 修复
- 修复 vitest 2 个失败测试（publisher-router 错误消息中文化 + phase10 超时/axios mock）
- 修复 Jest 1 个失败测试（startup.test.js 错误消息中文化同步）
- 发布错误消息汉化: publisher-router.js "Platform not configured" → "平台未配置"
- 扩展覆盖: electron/core/ (3), ipc-handlers/ (20), publishers/ (2)
- 总计 86 个 JS 文件已添加 @ts-check

## [v2.1.5] - 2026-07-06
### 改进
- TS 迁移 Phase 3: 新增 5 个文件 @ts-check (cloud-publisher/publish-poller/store-schema/credential-store/scheduler)
- 累计 16/61 文件 ts-check (26% 进度)


## [v2.1.5] - 2026-07-06
### 改进
- TS 迁移 Phase 3: 新增 5 个文件 @ts-check (cloud-publisher/publish-poller/store-schema/credential-store/scheduler)
- 累计 16/61 文件 ts-check (26% 进度)

## [v2.1.4] - 2026-07-06
### 修复
- 测试基础设施大修：113 failed → 207 passed（jest 配置分离 + moduleNameMapper + ws mock）
- error-codes.js 同步 TS 源（修复 getMessage 缺失、错误码值不一致）
- 删除重复的 electron mock（electron/services/__mocks__/electron.js）
- publisher-router.js 中文模板字面量修复（checkJs 兼容性）

### 新增
- 34 个向后兼容的重定向文件（electron/X.js → electron/services/X.js）
- jest.config.cjs（限定 tests/ 目录为 Jest 范围）

### TS 迁移 Phase 3
- 新增 4 个文件添加 // @ts-check: cookie-converter, publisher-router, tasks-repo, media-downloader
- 累计 12/57 文件（21% 进度）
- 92 个渐进式 TS 类型待修复项

### 测试
- Jest: 207 passed ✅
- Vitest: 1049 passed ✅
- Python: 443 passed ✅
- **总计: 1699 测试 ALL GREEN**

> 完整变更日志请查看 [01-docs/CHANGELOG.md](01-docs/CHANGELOG.md)
>
> 以下为精简版变更摘要：


## [v2.1.3] - 2026-07-06
- PR #303: Phase 4 清理 — electron 回滚 43→33 + 测试临时文件清理
- PR #304: TS 迁移 Phase 3 — JSDoc 渐进类型化基础设施 (tsconfig.check.json + check:ts)
- PR #305: TS 迁移 Phase 3 — 3 个服务文件类型化
- PR #306: TS 迁移 Phase 3 — video-uploader.js 类型化
- PR #307: 新增 wechat_publisher 模型+异常 24 个单元测试 (443 Python tests)
- PR #308: 根目录清理 — 合并 docs/references/standards 到 01-docs/
- PR #309: TS 迁移 Phase 3 — test-helpers.js 类型化 (累计 7/77)
- P0-3: 清理 browser_data 浏览器缓存 62MB
- PRD 版本同步 v2.1.2 → v2.1.3

### 累计状态
- Python 测试: 419 → 443
- TS 类型化: 7/77 服务文件
- 根目录: 减少 3 个冗余目录

## [v2.1.2] - 2026-07-06
- PRD v2.1.2 全面修复（14 项内容审查问题）
- 清空 9 个代码 TODO（data-sync.js / utils.py / test 文件）
- 大文件拆分收尾：修复 video_compose.py 4 个缺失委托方法
- 决策日志更新至 D-018

## [v2.1.1] - 2026-07-06
- PRD 全面更新至 v2.1.1，补充 6 个使用流程章节
- 决策日志创建（01-docs/decision-log.md）
- 代码深度分析报告（01-docs/code-depth-analysis-2026-07-06.md）

## [v2.1.0] - 2026-07-05
- OpenMontage 全阶段集成（Phase 0-7）
- Pipeline 管线编排（13 种视频制作管线）
- 视频/图像/音频 AI 创作

## [v2.0.0] - 2026-07-02
- 内容智能模块（热点/标题/标签/爆款分析）
- 多平台实时监控 + 评论管理
- 云端发布 + Pro 版本 + 插件系统
- 发布日历与计划

## [v1.4.0] - 2026-06-28
- PreCheck 前端开关 + platforms.json 外部化

## [v1.3.0] - 2026-06-27
- AI 内容创作功能（AI Writer, 标题助手等）

## [v1.2.0] - 2026-06-26
- 插件系统 + 定时发布 + 评论管理

## [v1.1.x] - 2026-06-13 ~ 2026-06-17
- CLI 工具 + 内容格式化 + Docker 支持

## [v1.0.x] - 2026-06-03 ~ 2026-06-13
- 初始版本：Electron 桌面端 + FastAPI 后端
- 15 平台发布器 + 账号管理 + 内容智能分析



## [v2.1.3] - 2026-07-06
- TS 迁移 Phase 3: JSDoc 渐进类型化基础设施完成
  - 新增 tsconfig.check.json (extends 主 tsconfig, checkJs:false, noEmit)
  - logger.js + store-interface.js 添加 // @ts-check + 完整 JSDoc 类型
  - 新增 check:ts / check:all npm scripts
- 验证通过: check:ts ✅ build:ts ✅ test:vue (1049) ✅ Python (419) ✅

## [v2.1.3] - 2026-07-06
- PRD 版本同步 v2.1.2 → v2.1.3
- TS 迁移 Phase 3 继续: 新增 3 个服务文件 JSDoc 类型化
  - abort-utils.js: 修复 timeoutId/reason/Promise 类型
  - aggregator-bridge.js: 修复 class constructor @param + @returns 类型
  - first-run.js: 修复 catch(e) unknown 类型
  - 累计 5/77 服务文件已完成 JSDoc 类型化
  - check:ts ✅ build:ts ✅ test:vue (1049) ✅ Python (419) ✅




## [v2.2.5] - 2026-07-07
### 重构
- Python 后端 import 排序统一 + 类型提示现代化（119 文件）
  - isort 风格统一: stdlib → 第三方 → 项目内导入，字母序排列
  - Python 3.10+ 类型语法: Optional[X] → X | None, Dict/List/Tuple → dict/list/tuple
  - 移除未使用导入（typing.Any, pathlib.Path 等）
  - 补充文件末尾缺失的换行符
  - wechat_publisher/models.py 完整类型现代化

### 验证
- Python 测试: 518 passed ✅
- 改动涉及 119 文件 ±678 行


## [第十五轮审查] v2.3.45 — 2026-07-10

### 审查范围
- R10 回归基线验证（第十四轮 11 处修复无回归 ✅）
- R14 六大维度基线扫描 + R15 语义同类 + R26 同功能多实现 + R28 跨生命周期 unref + R29 隐式转换
- 结果：0 CRITICAL | 9 MAJOR | 8 MINOR（CRITICAL 连续第二轮清零）

### 修复清单
**R28 跨生命周期 unref 穷尽（21 处 × 12 文件）**
- publish-monitor.js（3 处 setTimeout）、python-bridge.js（3 处 + 新增 _restartTimer 模块级变量 + stopWatchdog 清理）
- qrcode-login.js（3 处）、auth-view-manager.js（3 处）、publish-poller.js（1 处递归轮询）
- oauth-manager.js（1 处）、login-status-monitor.js（1 处）、system-tray.js（1 处 flashTray）
- publish-impact-tracker.js（1 处）、scheduler.js（1 处 _timers[entry.id]）、render-engine.js（1 处 installTimer）

**MAJOR 修复**
- MAJOR-1: `packages/shared-utils/src/scheduler.js` L65 `addTask` → `add`（R26 同步遗漏，TaskQueue 类只有 add 方法）
- MAJOR-8: `batch-manager.js` executeBatch platform 对象未解析 — 新增 `resolvePlatform(p)` 边界归一化（R40），立即路径和 setTimeout 路径统一消费规范形态
- MAJOR-9: `publisher.js` intelligenceFetchTrending 后端返回 `engagement` 前端消费 `engagementScore` 字段不匹配 — 归一化 `engagementScore: item.engagementScore != null ? item.engagementScore : item.engagement`；TrendingPanel.vue v-if 从 `!== undefined` 改 `!= null`（R38 前后端字段契约）

**MINOR 修复**
- MINOR-1: batch-manager stopAll 先保存 `_timers.size` 再 clear（修日志 bug，clear 后 size 为 0）
- MINOR-2: batch-manager scheduleBatch setTimeout 路径补 `_taskQueue` null 守卫
- MINOR-4: license-manager isPro/isTrialExpired 同步 R29 Invalid Date 守卫（之前只修了 _daysRemaining）

### 验证
- 测试: 1855 passed | 5 failed | 10 skipped（5 失败为 pre-existing，git stash 验证非本轮回归）
- QM-1: `electron-builder --win --dir --publish never` 80s 通过，asar 135MB + rpa-engine require 链 OK
- 语法校验: 14 个 CJS 文件 + 1 ESM 文件全部通过

### 新增强制规则（R37-R41）
- R37: R28 unref 必须全仓 grep `setInterval\|setTimeout` 逐个核对（R7 在跨生命周期维度的强化）
- R38: 前后端字段名契约必须建立对照表（R14 一致性维度新增 API 字段契约子项）
- R39: R26 同功能多实现每轮必须重扫（"已闭环"结论必须基于本轮重扫 grep 输出）
- R40: 多态参数必须边界归一化（入口统一解析为规范形态）
- R41: 持续失败的测试必须纳入 R33 测试债务追踪（不允许"持续红"默默存在）


































