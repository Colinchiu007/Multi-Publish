# story2video-video-maxlength Specification

## Purpose
历史记录「重新生成视频优化词」的 `max_length` 显式顶格契约：历史重生成入口显式携带视频域上限（20000），双后端（8020 standalone [200,20000] / 8013 legacy [50,2000]）由契约 builder 各自收敛，禁止落回后端默认截断；共享 kernel 默认与契约范围不放松；流水线 stage 经文本配置显式携带（默认 2000）不属本次改动。
## Requirements
### Requirement: 历史重生成视频优化词显式顶格

Story2Video 历史记录重新生成视频优化词（`regenerateScenePrompt` kind=video）SHALL 显式携带 `max_length`（视频域上限 `VIDEO_ENGINE_LIMITS.videoMaxLengthMax`=40000，2026-08-16 由 20000 上浮），不得依赖后端默认。

#### Scenario: 8020 standalone 启用时长提示词完整保留

- **WHEN** 用户在历史记录重新生成某场景视频优化词，且 8020 独立视频引擎启用
- **THEN** `optimizeVideoPrompt` 请求显式携带 `max_length=40000`，standalone builder 收敛到 [200,40000]，返回超过 1800 字符（可达 30000 字符）的提示词完整落库（safeText 上限 40000），不被本地 2000 截断

#### Scenario: legacy 8013 回退不 422 且不落 500

- **WHEN** 8020 不可用回退 8013 legacy（domain=video）
- **THEN** legacy builder 把显式 `max_length` 收敛到 [50,2000]（请求 2000，不 422），不再走后端默认 500 截断；落库 ≤2000

### Requirement: 共享契约不放松

历史重生成入口之外的调用方语义 SHALL 保持不变：共享 kernel `PROMPT_ENGINE_LIMITS.maxLength` 默认 500、视频 `videoMaxLengthRanges`（legacy [50,2000] / standalone [200,40000]）与 tiered 默认（batch 1800 / refined 5000）的既有语义不得因本次改动而变化（仅 standalone 上界 20000→40000）。

#### Scenario: 通用调用方默认不变

- **WHEN** 与历史重生成无关的调用方未显式传 `max_length`
- **THEN** 契约默认（kernel 500 / 视频 batch 1800 / refined 5000）与既有 clamp 断言保持原值，不因本次 change 静默放大

### Requirement: 落库上限视频专属

videoPrompt 落库 SHALL 使用视频专属 safeText 上限 40000（图片 prompt 保持 20000），保证 standalone 长输出（>20000 字符）不被落库截断。

#### Scenario: 30000 字符视频提示词完整落库

- **WHEN** 8020 standalone 返回 30000 字符优化提示词
- **THEN** videoPrompt 落库保留全部 30000 字符（safeText 40000）；同场景图片 prompt 仍受 20000 上限约束

