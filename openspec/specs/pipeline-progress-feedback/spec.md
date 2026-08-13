# pipeline-progress-feedback Specification

## Purpose
视频创作流水线（story2video-compose 主流水线及 animated-explainer、talking-head 等其余 13 条注册流水线）的进度清单中，每个阶段运行期 SHALL 提供统一、可预期的「进行中」信息反馈：阶段级进度对象（percent + 进行中文案 + 结构化计数）+ 阶段完成摘要；执行器通过统一上报通道写入，前端按统一契约渲染，消除「有的阶段有计数/百分比、有的阶段只有『运行中』」的颗粒度落差。compose/generate_assets 既有子进度契约（`story2video-compose-progress` / `story2video-creation-mode` / `image-prompt-engine`）行为不变，本契约为其增量统一层。
## Requirements
### Requirement: 阶段级进度数据契约

流水线运行快照中每个阶段 SHALL 携带阶段级进度对象 `stage.progress = { percent, message, detail?, updatedAt }` 与可选完成摘要 `stage.summary`；同一进度 SHALL 同时写入 `run.context.stage_progress`（双写，兼容既有 3s 轮询读取路径）。字段约束：`percent` 为 0-100 整数且单调不降；`message` 为用户可见进行中文案（内部生成、纯文本插值、≤80 字符，空/非法不渲染）；`detail` 为 `{ done, total, kind }` 结构化计数（可选）；`updatedAt` 为 ISO 时间戳。任一字段非法时该次更新 SHALL 被拒绝（fail-closed），不得向 renderer 下发非法值；字段缺失/非法不得阻断流水线执行。

#### Scenario: 运行中阶段显示进行中信息
- **WHEN** 流水线某阶段运行中，执行器上报 `{ percent: 40, message: '正在生成第 3/10 张图片', detail: { done: 3, total: 10, kind: 'image' } }`
- **THEN** 快照该阶段 `progress.percent === 40`、`message` 与 `detail` 一致，且 `context.stage_progress` 同步可见

#### Scenario: 非法进度被拒绝
- **WHEN** 上报 `percent > 100` 或 `percent` 非有限数，或 `message` 为空/非字符串，或 `detail.done > detail.total`
- **THEN** 该次更新不生效（保持上次合法值或 undefined），流水线继续执行

#### Scenario: 完成态摘要
- **WHEN** split 阶段完成且产出 N 个场景
- **THEN** 该阶段 `status === 'completed'` 且 `summary` 表达「拆分为 N 个场景」语义

### Requirement: 执行器统一上报通道

阶段执行器 SHALL 通过统一 `onProgress` 上报通道发射进行中信息（`{ percent, message, detail }`），由流水线引擎注入并写入阶段进度；该通道为 additive 扩展，未接入的执行器保持既有行为（仅阶段状态变化）。接入执行器在内部循环（逐场景、逐资源项、逐平台、逐段 TTS、LLM 调用前后）中 SHALL 按子步骤粒度发射进度，不得只在阶段开始/结束时发射。

#### Scenario: 逐平台发布上报
- **WHEN** publish 阶段向 N 个平台串行发布，完成第 i 个平台
- **THEN** 上报 `percent` 反映 `i/N`，`message` 表达「正在发布到 {平台} (i/N)」语义

#### Scenario: 未接入执行器行为不回归
- **WHEN** 执行器未使用 onProgress 通道
- **THEN** 阶段仍正常执行，快照无 `stage.progress`（前端按既有「运行中 + 开始时间」展示），无行为回归

### Requirement: 各阶段目标反馈粒度

以下阶段 SHALL 提供运行中反馈（新增或修复展示缺口）：

| 阶段 | 运行中反馈 |
|------|-----------|
| optimize | 运行中 SHALL 展示「共 N 个场景，已完成 M 个」语义（数据已存在，修复「仅完成后展示」缺口） |
| publish | 逐平台「正在发布到 {平台} (i/N)」 |
| finalize_assets | 逐段 TTS「正在生成第 i/N 段旁白」 |
| domain_enrich / scene_context / select_video_scenes | LLM 调用前后「正在分析场景…（i/N）」 |
| split | 进行中文案 + 完成后摘要（场景数） |
| 其余流水线 LLM/资源阶段（animated-explainer 等） | 「正在{执行动作}…」子步骤粒度 |

compose / generate_assets 沿用既有子进度契约，不重复定义。

#### Scenario: optimize 运行中展示
- **WHEN** optimize 阶段运行中且 `optimize_progress = { done: 2, total: 5 }`
- **THEN** 进度清单展示「共 5 个场景，已完成 2 个」语义（不等待阶段完成）

### Requirement: 进度清单通用渲染

进度清单 SHALL 按统一契约渲染任意阶段的进行中信息：运行中阶段展示 `message` 与（存在合法 `percent` 时）迷你进度条；完成阶段优先展示 `summary`；失败阶段展示错误原因（既有）。渲染 SHALL 不依赖阶段名特判；新增阶段/其他流水线自动获得同等反馈。整体进度 SHALL 由「完成阶段数占比」与「当前阶段 percent」加权计算，避免长时间停在阶段边界。

#### Scenario: 任意阶段带进度渲染
- **WHEN** 某非 compose 阶段 running 且 `stage.progress = { percent: 25, message: '正在分析场景…' }`
- **THEN** 该阶段行显示 `message` 与宽度 25% 的迷你进度条

#### Scenario: 无进度数据安全降级
- **WHEN** 阶段 running 但无 `stage.progress`（历史 run / 未接入执行器）
- **THEN** 按既有「运行中 + 开始时间」展示，不渲染空进度条

### Requirement: 数据安全与本地化

进度 `message` 及完成 `summary` SHALL 仅由系统内部生成并以纯文本插值渲染，禁止直接渲染外部输入；新增用户可见文案 SHALL 写入 locale（zh/en 成对，CI Gate 7 拦截）。进度数据为展示增强，字段缺失/非法不得阻断流水线，也不得改变阶段执行顺序与 checkpoint 语义。

#### Scenario: 文案本地化成对
- **WHEN** 新增进行中文案（如发布平台进度）
- **THEN** zh/en 两个 locale 文件成对存在且语义一致

