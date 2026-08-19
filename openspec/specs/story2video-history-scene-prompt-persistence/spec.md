# story2video-history-scene-prompt-persistence Specification

## Purpose
历史记录场景内容编辑的提示词显示完整性与保存可见性契约：详情只读列表完整展示旁白与图片提示词；结果页编辑未保存状态可见；离开页面时未保存修改必须经显式确认（保存/放弃/取消），不静默丢失。
## Requirements
### Requirement: 详情弹窗完整展示场景文案与图片提示词
历史详情弹窗的只读场景列表 SHALL 完整展示每个场景的旁白（text）与画面提示词（prompt），不得以 60 字符硬截断；字段存在才渲染对应行，长文本在列表内滚动查看。

#### Scenario: 长图片提示词完整可见
- **WHEN** 用户打开含 1500 字符图片提示词的历史详情弹窗
- **THEN** 场景列表完整展示该提示词（无 `…` 截断标记），旁白与画面提示词分行显示，列表可滚动

#### Scenario: 仅旁白或仅提示词
- **WHEN** 场景只有 text 或只有 prompt 之一
- **THEN** 仅渲染存在的字段行，不出现空行或占位文案

#### Scenario: 历史卡片预览保持截断
- **WHEN** 历史卡片列表展示提示词预览
- **THEN** 仍按 120 字符 + `…` 截断（预览语义不变），不受详情完整展示影响

### Requirement: 编辑未保存状态可见
结果页分段编辑区 SHALL 在存在未保存修改（segmentsDirty）时显示「有未保存修改」提示，帮助用户识别需要点击【保存分段】。

#### Scenario: 修改后提示出现
- **WHEN** 用户修改任一场景的旁白或画面提示词后
- **THEN** 分段编辑区标题行显示「有未保存修改」提示，且【保存分段】成功落库后提示消失

#### Scenario: 无修改不提示
- **WHEN** 页面加载且用户未做任何修改
- **THEN** 不显示未保存提示

### Requirement: 离开页面保存确认
结果页存在未保存修改时离开路由，SHALL 弹确认框提供三选一：保存并离开 / 不保存离开 / 取消；保存失败 SHALL 留在当前页并提示，不得静默导航或静默丢修改。

#### Scenario: 保存并离开
- **WHEN** 用户 dirty 状态点击返回并选择「保存并离开」
- **THEN** 先调用保存分段；保存成功后才导航离开，保存失败留在当前页并展示失败提示

#### Scenario: 不保存离开
- **WHEN** 用户 dirty 状态离开并选择「不保存离开」
- **THEN** 直接导航离开，不调用保存，修改被放弃

#### Scenario: 取消
- **WHEN** 用户 dirty 状态离开并选择「取消」
- **THEN** 留在当前页，编辑内容保持，不导航

#### Scenario: 无未保存修改直接放行
- **WHEN** 用户无未保存修改时离开
- **THEN** 不弹确认，直接导航

### Requirement: 文案成对与无中文字面量
新增用户可见文案 SHALL 以 locale 键（zh/en 成对）提供；渲染源文件（ResultView.vue / CreateViewHistory.vue）不得新增中文字符串字面量。

#### Scenario: locale 成对
- **WHEN** 新增「有未保存修改」与离开确认文案
- **THEN** `locales/zh.js` 与 `locales/en.js` 对应键均存在且 `check-locale-sync` 通过

### Requirement: 重新生成优化词失败必须 fail-closed

历史记录场景「重新生成图片/视频优化词」SHALL 对 Prompt Engine 的 HTTP、业务和跨层响应统一判定：只有响应未声明错误、包含非空优化词并满足对应执行元数据时才算成功；当响应包含错误字段、HTTP 非成功、缺少必要执行元数据，或以原文回显作为错误兜底时，系统 SHALL 判定失败：不得把回显原文写入分段，图片分段 SHALL 保持原有 prompt，视频分段 SHALL 保持原有 videoPrompt 并将 `status` 置为 `failed`，真实失败原因随响应透出。

#### Scenario: 引擎 402 回显原文
- **WHEN** 用户点击「重新生成图片优化词」且 prompt-engine 返回 `{ optimized_prompt: <原文>, error: "402 insufficient_balance" }`
- **THEN** 分段 prompt 保持不变、`status=failed`，失败原因包含引擎错误信息，不得显示「优化词已重新生成」

#### Scenario: 引擎 error 但无文本
- **WHEN** 引擎返回 `{ error: "service unavailable" }` 且无有效文本
- **THEN** 同样 fail-closed：分段不变、回写 failed

#### Scenario: 视频域错误回显
- **WHEN** 重新生成视频优化词且引擎返回 error + 回显
- **THEN** `videoPrompt` 不被改写，分段回写 failed

#### Scenario: 缺失执行元数据
- **WHEN** 响应含非空优化词但缺少或错误的策略、调用方、缓存旁路等必要执行元数据
- **THEN** 系统按失败处理，保持原提示词并持久化 failed，不得仅凭文本内容判定成功

#### Scenario: 图片 HTTP 200 业务错误回显
- **WHEN** 图片优化接口返回 HTTP 200，同时包含非空 optimized_prompt 与 error/detail
- **THEN** 系统仍按失败处理，不触发 CLI 兜底，不覆盖旧 prompt，并持久化 failed

### Requirement: 重新生成请求上下文与流水线同源

历史记录重新生成图片优化词的请求 SHALL 携带与流水线「无 scene_context 回退路径」同源的 `context`（`full_text` 全场景文案、自动 `scene_type`、继承持久化文本配置的 `context.synopsis`），并仅透传 prompt-engine 契约键（platform/style/creative_level/negative_prompt/num_candidates/auto_detect_style/quality_baseline），`max_length` 保持显式 2000。

#### Scenario: 请求携带全场景上下文
- **WHEN** 用户点击重新生成图片优化词且项目含多个场景文案
- **THEN** 发送给 prompt-engine 的请求包含 `context.full_text`（拼接全部场景文案）且 `max_length` 为契约上限 2000

#### Scenario: 存量项目无文本配置
- **WHEN** 项目缺少 `story2videoTextConfig`
- **THEN** 请求仍携带基于 segments 构造的 context，不因缺配置而失败

### Requirement: 保存分段/编辑落库后媒体 URL 必须重新解析

结果页/历史记录中，凡以 IPC 返回数据整体替换 `this.segments` 的落库操作（保存分段、旁白替换等）完成后，渲染端 SHALL 重新解析本地媒体 URL（`imageUrl`/`alternateImageUrls`/`videoUrl` 为渲染端派生字段、不落库），不得使分段图片/素材槽/视频槽因 URL 字段缺失而消失。

#### Scenario: 保存分段后图片继续显示
- **WHEN** 用户在历史记录结果页点击【保存分段】且主进程返回含 `imagePath` 的非空分段
- **THEN** 保存成功后逐段经 `story2videoCreateShareUrl` 重新解析 `imageUrl` 且非空，分段图片不消失

#### Scenario: 保存返回空分段
- **WHEN** 保存分段返回 `segments: []`
- **THEN** 保留当前分段且媒体 URL 仍有效，图片继续显示

#### Scenario: 旁白替换后素材不消失
- **WHEN** 用户替换分段旁白且主进程返回新分段
- **THEN** 替换成功后媒体 URL 重新解析，图片/素材槽不消失

## Test Mapping
- 场景「长图片提示词完整可见」→ `CreateViewHistory.test.js`（detailScenes 渲染完整 prompt、无 `…`、text/prompt 分行）
- 场景「仅旁白或仅提示词」→ `CreateViewHistory.test.js`（单字段场景不渲染空行）
- 场景「历史卡片预览保持截断」→ `CreateViewHistory.test.js` 既有 preview 断言保持
- 场景「修改后提示出现 / 无修改不提示」→ `ResultView.test.js`（dirty chip 渲染与保存后消失）
- 场景「保存并离开 / 不保存离开 / 取消 / 直接放行」→ `ResultView.test.js`（beforeRouteLeave 四分支）
- 场景「locale 成对」→ `scripts/check-locale-sync.js` CI Gate 7
