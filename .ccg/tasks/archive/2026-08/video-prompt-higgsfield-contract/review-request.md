# 评审任务：video-prompt-higgsfield-mechanics 契约层实现方案（实现前评审）

## 背景
Multi-Publish 项目落地 Higgsfield《Hell Grind》开源提示词机制（95 分钟 AI 长片、4 万提示词公开）。
OpenSpec change `openspec/changes/video-prompt-higgsfield-mechanics/`（spec 6 需求 20 场景 + tasks 17 项）已完成文档批次并评审合并。
当前进入契约层实现：唯一将修改的文件为 `apps/desktop/electron/services/video-prompt-engine-contract.js`；测试已按 spec 写好（`video-prompt-engine-contract.test.js` 追加 4 个 describe，TDD 红）。本次评审在实现前交叉验证方案正确性与风险。

## 变更范围（单一文件）
- 修改：`apps/desktop/electron/services/video-prompt-engine-contract.js`
- 明确不修改：`buildStandaloneVideoOptimizeRequest`（8020 独立引擎，留给后续 prompt-engine change）、PromptBridge、其他文件

## 现有关键事实（已核实）
- `PROMPT_ENGINE_LIMITS.maxLength = { min: 50, max: 2000, default: 500 }`；creativeLevel {min:1, max:10, default:5}
- 现有 `normalizeVideoMeta` 收敛 6 键：shot/camera/scene_transition/continuity_token/motion_intensity/duration_hint
- `_extractVideoBase` 内部做 maxLength 截断（返回 prompt 已截断）
- 现有测试：`buildVideoOptimizeRequest('a cat')` → max_length=500；`maxLength: 10` → 50（min clamp）

## 方案要点（6 组改动）

### 1. VIDEO_ENGINE_LIMITS 新增 9 常量
excludedCharactersMax=10, noSwapPairsMax=5, shotsMax=3, beatsPerShotMax=6, beatTimeMax=40, beatActionMax=500, shotDurationMax=15, videoMaxLengthMax=20000, videoMaxLengthRefinedDefault=5000

### 2. normalizeVideoMeta 新增 4 字段收敛
- **excluded_characters**：string 按 `[\n;,]+` split 或数组双兼容；逐项 trim；大小写敏感精确去重（保留首次序）；空串/非字符串丢弃；≤10 截断；全非法不输出键
- **no_swap_pairs**：仅收 Array 且 pair.length===2 且两元素均为非空 string（trim 后非空）；任一非法整对丢弃；≤5 截断；不去重
- **color_ratio**：trim 后匹配 `^[1-9]\d{0,2}(:[1-9]\d{0,2}){2}$`（⚠️ 见风险点 A）
- **shots[]**：≤3 截断；shot/camera 必填非空 trim ≤50（沿用 shotMax/cameraMax）；duration 必填正数、超 15 clamp；beats 必为数组（空数组合法）；beat 先丢非法（time/action 任一为空/非字符串）再取前 6，time≤40 / action≤500 用 slice 截断（⚠️ 见风险点 B）；单切任一子字段非法整切丢弃；全非法不输出 shots 键

### 3. PLATFORM_VIDEO_PROFILES + getVideoProfile(platform)
seedance `{duration:15, aspect:'21:9', resolution:'1080p', audio:true}`；未登记平台（经 normalizeVideoPlatform 归一后查表，未命中）→ generic `{duration:15, aspect:'16:9', resolution:'1080p', audio:false}`

### 4. appendVideoTrailer(prompt, options) 纯函数
模板：` Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.`（默认 aspect '16:9' / duration 15 / audio 'SFX' / nonIp true）
- options.maxLength 超限时从尾部逐段 pop（` SFX only.` → ` 15s.` → ` 16:9.` → ` Photoreal.`），保留至少 ` NON-IP.` 段（可能仍超预算，见风险点 D）
- 已含 "NON-IP"（大小写敏感）幂等跳过
- 不修改原始 prompt，返回新字符串

### 5. extractOptimizedVideoPrompt 结构完整性 fail-closed
- video.excluded_characters 或 no_swap_pairs 非空（归一后）时，基于**截断前** `result.optimized_prompt`（trim 后原文）校验含 `<<<` 或 `[ABSENT]`（大小写敏感）
- 缺失返回 `{ok:false, error}` 且错误信息含字段名（excluded_characters / no_swap_pairs）
- 标记集抽为常量 `VIDEO_REFERENCE_MARKERS = ['<<<', '[ABSENT]']` 导出
- 无新字段零回归（校验不触发）

### 6. buildVideoOptimizeRequest max_length 层级语义
新增 `_resolveVideoMaxLength(explicit, creativeLevel)`：
- explicit 非空：clamp [50, videoMaxLengthMax=20000]（⚠️ 显式值上限从 2000 提到 20000，见风险点 C）
- explicit 缺失或 NaN：creativeLevel≥7 → 5000；<7 → 500（零回归）
- 8020 standalone builder 不改（见风险点 F）

### 7. 新增导出
PLATFORM_VIDEO_PROFILES, getVideoProfile, appendVideoTrailer, VIDEO_REFERENCE_MARKERS（VIDEO_ENGINE_LIMITS 已在既有导出中）

## 重点评审的风险点
- **A. color_ratio 正则选型**：spec 正文写 `^\d{1,3}(:\d{1,3}){2}$`，但注释明确"三段 1-999 正整数"且场景明确 `'0:30:10'` 应丢弃（正文正则会误收 0）。方案采用 `^[1-9]\d{0,2}(:[1-9]\d{0,2}){2}$`（拒绝 0 段）。是否合理？
- **B. beat 超长 slice vs 丢弃**：spec 仅定义"time/action 任一为空"为非法；长度上限 40/500 未定义处理。方案：slice 截断（与 shot/camera ≤50 slice 模式一致），而非整切丢弃。是否一致？
- **C. max_length 显式值上限 2000→20000**：buildVideoOptimizeRequest 显式值 clamp 上限从 PROMPT_ENGINE_LIMITS.maxLength.max(2000) 变为 videoMaxLengthMax(20000)。是否影响其他消费方（PromptBridge 透传、8013 服务端 422 风险）？是否有更稳妥做法？
- **D. appendVideoTrailer 超预算语义**：预算不足时保留 NON-IP 优先于预算（输出仍可能超 maxLength，测试只断言 endsWith('NON-IP') 与无残缺段）。语义是否可接受？
- **E. 截断前校验位置**：_extractVideoBase 内部已截断，extractOptimizedVideoPrompt 用 `result.optimized_prompt` 原文（trim 后）做标记校验。是否有更优位置？
- **F. 只改 buildVideoOptimizeRequest 不改 8020 standalone builder**：tasks.md 3.4 只点名前者；8020 是精修层主引擎，是否应同步？还是留给 prompt-engine change（4.4 联调）？
- **G. 零回归**：normalizeVideoMeta 输出形状（6 键零回归断言）、buildVideoOptimizeRequest 默认值、extractOptimizedVideoPrompt 无新字段行为。

## 输出要求
Critical / Warning / Info 分级评审报告；每个风险点给明确结论（接受 / 需调整及理由）；如发现 spec 与实现的隐性矛盾请指出。
