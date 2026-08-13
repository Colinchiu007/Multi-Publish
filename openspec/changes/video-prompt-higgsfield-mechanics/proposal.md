## Why

Higgsfield《Hell Grind》开源项目实证（公开 API 抓取 598 条真实提示词 + 50 张资产卡，见 `01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-DEEP-2026-08-14.md`）显示：专业视频提示词采用**导演工作流结构**——正反双向约束（主角锁定 + 缺席角色排除 + 防替换）、逐切几何、秒级时间轴、可判定失败判据（FAIL CHECK）、收尾参数行（NON-IP/画幅/时长/音频）。当前契约层只支持正向约束（`positive_constraints`）与单切结构化字段（shot/camera/duration_hint 等，共 8 个收敛键），缺少上述机制；且 prompt-engine evaluator 的长度判据（100-400 词）与导演级精修模板（语料中位 5,719 字符 ≈ 1,200+ 词）冲突，会系统性压低精修模板得分，导致多候选择优永远偏向短提示词。

## What Changes

- **契约层 video 结构化字段扩展**（`apps/desktop/electron/services/video-prompt-engine-contract.js`）：`normalizeVideoMeta` 新增收敛字段——`excluded_characters[]`（缺席角色排除，上限 10）、`no_swap_pairs[]`（防替换对，上限 5）、`color_ratio`（三色比率，格式 `^\d{1,3}(:\d{1,3}){2}$`；**契约层缺失时不得填充默认值**，60:30:10 默认由引擎侧输出）、`shots[]`（多切时间块：每切 shot/camera/duration + beats[]，上限 3 切、每切 6 beats）；`VIDEO_ENGINE_LIMITS` 同步扩展上限常量；`duration_hint` 保持既有语义（仅在有值时透传，缺失不填充；评审 I2 与 design D4 对齐）。
- **收尾参数行后处理**：新增 `appendVideoTrailer` 纯函数——按平台注入参数行模板（`Photoreal. NON-IP. {aspect}. {duration}s. {audio} only.` 语义；no-text 段不重复，由既有 `BUILT_IN_VIDEO_NO_TEXT_NEGATIVE` 负面提示词承载），平台参数画像（seedance 默认 15s/1080p/21:9/audio on，语料实证 78%/91%/72%/90%）；调用方可选启用，默认不改变现有输出（零回归）。
- **结构完整性 fail-closed 校验**：`extractOptimizedVideoPrompt` 在 `video.excluded_characters`/`video.no_swap_pairs` 非空时校验 **截断前**的 `optimized_prompt` 含对应引用协议标记（`<<<` 或 `[ABSENT]`，大小写敏感），缺失返回明确错误——防止"声明了排除但正文未落实"。
- **精修层 max_length 层级语义（按后端能力门控，评审 C1/C2 修正）**：契约层请求构造在 `creative_level ≥ 7` 且调用方未显式传 `max_length` 时按精修层预算上浮（默认 5000），并按目标后端能力上限收敛——8013（`buildVideoOptimizeRequest`）[50,2000] 实际默认 2000、8020（`buildStandaloneVideoOptimizeRequest`）[200,4000] 实际默认 4000；`creative_level < 7` 保持现有 500 默认（零回归）；显式传值始终优先并在能力范围收敛。该语义与本 change 新字段共同确保导演级提示词在默认路径可达；目标上限 5000/20000 在引擎侧模型边界抬高后自动生效。
- **外部引擎配合（跨仓库）**：prompt-engine（8020 独立仓库，`D:\Data\projects\prompt-engine`）需同步改动——`evaluator.py` 增加规则违规扣分与层级感知长度判据（批量层 100-400 词 / 精修层 500-5,000 词）、`strategies/generic_video.py` 输出新字段与收尾参数行（color_ratio 默认 60:30:10 由引擎侧输出）。本 change 只规格化 Multi-Publish 侧契约与联调验收；引擎侧在 prompt-engine 仓库另建 change，本 tasks 记录交叉仓库清单。
- **测试与文档**：`video-prompt-engine-contract.test.js` 新增用例（新字段收敛边界、参数行模板、完整性校验、零回归：无新字段时行为不变）；`story2video-stages.js` 若需要透传新字段则同步；更新 CHANGELOG、learnings 与 v2.0 分析报告落地状态。

## Capabilities

### New Capabilities
- `video-prompt-engine`: 视频提示词导演工作流契约——双向约束（缺席排除/防替换/三色比率）、多切时间块（shots[]/beats[]）、收尾参数行、结构完整性 fail-closed 校验、精修层 max_length 层级语义的请求/响应契约与边界。

### Modified Capabilities
<!-- 无；openspec-integration 为流程契约，不受本变更影响 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/video-prompt-engine-contract.js`（新字段收敛 + appendVideoTrailer + 完整性校验 + max_length 层级语义）、`video-prompt-engine-contract.test.js`（新增用例）；`story2video-stages.js`（透传，如必要）。
- 外部依赖：prompt-engine（8020）——evaluator.py / strategies/generic_video.py / models.py 配合改动（独立仓库，交叉验收）；`VIDEO_PROMPT_PORT` 联调。
- 文档：CHANGELOG.md、01-docs/learnings.md、01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-DEEP-2026-08-14.md（落地状态附录）。
- 交付：运行时代码走 codex/ 分支 + PR 合并；测试覆盖打包/未打包契约校验（QM-2 既有要求）。
