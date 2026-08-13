## Purpose

定义视频提示词优化引擎的导演工作流契约：双向约束（缺席角色排除/防替换/三色比率）、多切时间块、收尾参数行、结构完整性校验与精修层长度预算语义，使 Multi-Publish 消费方能够安全地接收并验证 Higgsfield 式精修级提示词的结构化元数据。

## ADDED Requirements

### Requirement: 双向约束字段契约

视频优化响应 SHALL 支持结构化字段 `excluded_characters[]`、`no_swap_pairs[]` 与 `color_ratio`，并 SHALL 在 `normalizeVideoMeta` 中收敛。`excluded_characters` 输入 SHALL 兼容字符串（按 `[\n;,]+` 分割）与字符串数组两种形态，输出 SHALL 为去空白、按 trim 后精确匹配去重（大小写敏感，保留首次出现序）的字符串数组，上限 10，超限截断。`no_swap_pairs` 输入 SHALL 兼容 JSON 数组形态，每对 SHALL 为恰含两个非空字符串的二元组；任一元素非法（非字符串/空白/数量非 2）时 SHALL 丢弃整对，上限 5，超限截断。`color_ratio` SHALL 匹配格式 `^\d{1,3}(:\d{1,3}){2}$`（三段 1-999 正整数）；不匹配或缺失时 SHALL 丢弃且不得填充默认值。非法输入 SHALL 被丢弃而非抛出。

#### Scenario: 新字段收敛通过
- **WHEN** 响应包含 `video.excluded_characters = ["JAX", " jax ", ""]`、`video.no_swap_pairs = [["ROKO","JAX"]]`、`video.color_ratio = "60:30:10"`
- **THEN** 归一化结果为 `["JAX","jax"]`（大小写敏感去重，空串剔除）、`[["ROKO","JAX"]]` 与原始比率字符串，且长度不超过上限

#### Scenario: 字符串输入兼容
- **WHEN** `video.excluded_characters = "JAX, Rein; JAX"`（字符串形态）
- **THEN** 输出 `["JAX","Rein"]`，与数组输入行为一致

#### Scenario: 非法字段被丢弃
- **WHEN** `excluded_characters` 为对象、`no_swap_pairs` 含 `["ROKO", 123]` 或 `["ROKO"]`、`color_ratio` 为 "abc" 或 "60:30:10:5" 或 "0:30:10"
- **THEN** 对应字段不进入输出 meta，其余合法字段不受影响，不抛出异常

#### Scenario: 零回归（无新字段）
- **WHEN** 响应不含任何新字段
- **THEN** 输出 meta 与改动前完全一致，不新增任何键

### Requirement: 多切时间块契约

视频优化响应 SHALL 支持结构化字段 `shots[]`：每切包含 `shot` 与 `camera`（SHALL 沿用单切字段的字符串约束：非空、trim、≤50 字符）、`duration`（SHALL 为必填正数秒，上限 15，超限按 15 clamp 而非丢弃）、`beats[]`（时间块数组，每项含 `time`（形如 "0.0–1.0s" 或 "BEAT 1 (0-1s)" 的非空字符串，上限 40 字符）与 `action`（非空字符串，上限 500 字符））。`shots` 数组长度上限 3，超限截断。任一子字段非法时 SHALL 丢弃整切；全部切非法时 `shots` 不进入输出。`beats` 处理顺序 SHALL 为：先丢弃非法 beat（time/action 任一为空即非法），再取前 6 条。

#### Scenario: 多切时间块通过
- **WHEN** 响应包含 2 切 `shots`，每切含合法 shot/camera/duration 与 beats
- **THEN** 输出 meta 保留全部 2 切与 beats，且与输入一致

#### Scenario: 超限截断与非法丢弃
- **WHEN** `shots` 含 5 切、某切 beats 达 8 项且其中第 2 项 action 为空、某切 duration 为 20
- **THEN** 仅保留前 3 切；该切先丢弃空 action 的 beat 再取前 6 条（有效 beat 数 7→6）；duration 20 被 clamp 为 15，切保留

#### Scenario: 单切局部非法整体丢弃
- **WHEN** 某切 `shot` 为空、或 `duration` 缺失、或 `beats` 为对象
- **THEN** 该切整体不进入输出，其余合法切不受影响；全部非法时 `shots` 键不出现

### Requirement: 收尾参数行模板

系统 SHALL 提供纯函数 `appendVideoTrailer(prompt, options)`：在提示词末尾追加一行参数行（`Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.` 语义），`aspect`/`duration`/`audio`/`nonIp` 均可配置；`duration` 默认 15、`audio` 默认 "SFX"、`nonIp` 默认 true、`aspect` 默认 "16:9"。当提示词已含 "NON-IP" 时 SHALL 不重复追加（幂等）。函数 SHALL 不修改原始 prompt，返回新字符串；追加后仍超调用方长度预算时 SHALL 按模板段从尾部截断，但 SHALL 保留 "NON-IP" 段。

#### Scenario: 默认参数行追加
- **WHEN** 调用 `appendVideoTrailer("A hero walks.", {})`
- **THEN** 返回以 "Photoreal. NON-IP. 16:9. 15s. SFX only." 结尾的提示词，原始字符串未被修改

#### Scenario: 幂等性
- **WHEN** 提示词已含 "NON-IP" 再调用 `appendVideoTrailer`
- **THEN** 返回与输入相同的字符串，不重复追加

#### Scenario: 超长截断保 NON-IP
- **WHEN** 预算 100 字符且提示词本身已占 95 字符
- **THEN** 返回以 "NON-IP" 结尾的截断参数行，无残缺模板段（如孤立的 "{duration}s." 不得出现）

### Requirement: 结构完整性 fail-closed 校验

`extractOptimizedVideoPrompt` SHALL 在 `video.excluded_characters` 或 `video.no_swap_pairs` 非空时，基于**截断前**的 `optimized_prompt` 文本校验其包含引用协议标记（`<<<` 或 `[ABSENT]`，大小写敏感）；缺失时返回 `{ ok: false, error }`，错误信息指明缺失的字段与原因。该校验 SHALL 仅在声明的字段存在时触发，不得改变无新字段请求的行为。

#### Scenario: 声明缺席排除但正文未落实
- **WHEN** `video.excluded_characters = ["JAX"]` 且截断前 `optimized_prompt` 不含 `<<<` 或 `[ABSENT]`
- **THEN** 返回 `{ ok: false, error }`，错误信息包含 "excluded_characters"

#### Scenario: 仅声明防替换对同样校验
- **WHEN** `video.no_swap_pairs = [["ROKO","JAX"]]` 且截断前 prompt 不含任何标记
- **THEN** 返回 `{ ok: false, error }`，错误信息包含 "no_swap_pairs"

#### Scenario: 声明与正文一致
- **WHEN** `video.excluded_characters = ["JAX"]` 且截断前 prompt 含 `[ABSENT] JAX` 标记
- **THEN** 返回 `{ ok: true }`，prompt 与 meta 正常透传

#### Scenario: 超长截断不误杀
- **WHEN** `video.excluded_characters = ["JAX"]`、标记 `[ABSENT] JAX` 位于 prompt 尾部、且调用方 maxLength 截断会削掉该标记
- **THEN** 校验基于截断前完整文本仍通过，返回 `{ ok: true }`（截断仅作用于最终 prompt 输出）

#### Scenario: 未声明新字段零回归
- **WHEN** 响应无 `excluded_characters`/`no_swap_pairs` 且 prompt 不含引用标记
- **THEN** 校验不触发，返回 `{ ok: true }`，行为与改动前一致

### Requirement: 平台参数画像默认值

系统 SHALL 提供平台参数画像映射，每个画像 SHALL 含四个键：`duration`（秒）、`aspect`（字符串）、`resolution`（字符串）、`audio`（布尔，表示生成音频开启）。seedance 默认 `{ duration: 15, aspect: "21:9", resolution: "1080p", audio: true }`；未登记平台 SHALL 使用 generic 画像 `{ duration: 15, aspect: "16:9", resolution: "1080p", audio: false }`。画像常量 SHALL 集中定义于契约层常量区；画像键与 `appendVideoTrailer` options 的类型映射（audio 布尔 → "SFX"/"No audio" 字符串）SHALL 由调用方在接线时转换，契约不隐式转换。

#### Scenario: seedance 画像
- **WHEN** 查询 seedance 平台画像
- **THEN** 返回 duration 15、aspect "21:9"、resolution "1080p"、audio true

#### Scenario: 未登记平台回退
- **WHEN** 查询未登记平台
- **THEN** 返回 generic 画像（duration 15、aspect "16:9"、resolution "1080p"、audio false），不抛出异常

### Requirement: 精修层 max_length 层级语义（按后端能力门控）

请求构造 SHALL 按 creative_level 分层处理 `max_length`，并 SHALL 按目标后端能力范围收敛（防止 422）：8013 兼容后端（`buildVideoOptimizeRequest`）能力范围为 [50, 2000]（对齐 `prompt_engine/models.py` ge=50/le=2000）；8020 独立引擎（`buildStandaloneVideoOptimizeRequest`）能力范围为 [200, 4000]（对齐 `video_prompt_engine/models.py` ge=200/le=4000）。`creative_level ≥ 7` 且调用方未显式传 `max_length` 时 SHALL 使用精修层默认 5000，并 SHALL 收敛到后端能力上限（8013 → 2000；8020 → 4000）；`creative_level < 7` 且未显式传时 SHALL 保持现有默认 500。显式传入的值 SHALL 始终优先，且 SHALL 在目标后端能力范围内收敛；`null`/空串 SHALL 视为未显式传（与 PromptBridge 归一一致）。精修层目标上限（默认 5000 / 上限 20000）在引擎侧模型边界抬高后自动生效（跨仓库联调项，见 tasks 4.4）。

#### Scenario: 精修层默认上浮（8013）
- **WHEN** `creative_level = 8` 且调用方未传 `max_length`，构造 8013 请求
- **THEN** 请求携带 `max_length = 2000`（精修层默认 5000 收敛到 8013 能力上限）

#### Scenario: 精修层默认上浮（8020）
- **WHEN** `creative_level = 8` 且调用方未传 `max_length`，构造 8020 请求
- **THEN** 请求携带 `max_length = 4000`（收敛到 8020 能力上限）

#### Scenario: 常规层零回归
- **WHEN** `creative_level = 5` 且调用方未传 `max_length`
- **THEN** 8013 与 8020 请求均携带 `max_length = 500`（与改动前一致）

#### Scenario: 显式值优先（8013 能力范围内）
- **WHEN** `creative_level = 9` 且调用方显式传 `max_length = 1500`
- **THEN** 请求携带 `max_length = 1500`，不被层级默认覆盖

#### Scenario: 显式值超上限收敛（8013）
- **WHEN** 调用方显式传 `max_length = 3000`，构造 8013 请求
- **THEN** 请求携带 `max_length = 2000`（收敛到 8013 能力上限）

#### Scenario: 8020 能力范围（含 min 边界修复）
- **WHEN** 调用方显式传 `max_length = 99999` 或 `max_length = 10`，构造 8020 请求
- **THEN** 分别携带 `max_length = 4000` 与 `max_length = 200`（收敛到 8020 [200, 4000]；修复既有 min 50 低于引擎 ge=200 的 422 隐患）
