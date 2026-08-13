# story2video-split-contract Specification

## Purpose
全能创作（story2video-compose）分句链路必须统一使用分句引擎（smart-sentence-splitter）的算法：在线时直接采用引擎返回的场景字幕，离线降级时本地算法与引擎 TS 镜像（text-segmentation.ts v0.15.2）语义一致，禁止再使用旧本地贪心切分算法。
## Requirements
### Requirement: 在线路径采用引擎字幕

当分句引擎（smart-sentence-splitter :8002）在线且 split 阶段返回有效场景时，全能创作链路的每个场景 SHALL 优先采用引擎返回的 `scenes[].subtitles[].text` 作为该场景的 subtitleBlocks，并标记 `subtitleSource='smart-sentence-splitter'`；不得用本地算法重新切分引擎已返回的字幕。

#### Scenario: 引擎返回字幕时直接采纳
- **WHEN** `normalizeServiceSplitResult` 收到含 `scenes[].subtitles`（每项 text 非空）的引擎响应
- **THEN** 输出场景的 `subtitleBlocks` 与引擎返回的 subtitles 文本一一对应，`subtitleSource='smart-sentence-splitter'`

#### Scenario: 场景缺字幕时回退本地
- **WHEN** 引擎响应中某场景无有效 `subtitles`
- **THEN** 该场景回退本地分块并标记 `subtitleSource='local-typescript'`，不中断流水线

### Requirement: 离线降级使用 v0.15.2 本地算法

当分句引擎不可用且流水线允许本地降级时，本地分句（句子 → 场景 → 字幕）SHALL 使用与 `text-segmentation.ts` v0.15.2 语义一致的算法（句子边界消歧、targetCharsPerScene 场景分组、字幕 7 步管道：分句/引号边界/长度切分/短块合并/标点清理/强制上限/时间戳），规则从 `subtitle-rules.json` 单源读取；不得使用旧贪心切分。

#### Scenario: 引擎离线本地降级
- **WHEN** SplitterBridge 不可用且 `fallback_to_local=true`
- **THEN** `createLocalSplitResult` 输出由 v0.15.2 本地算法生成，且 `degraded=true`、`fallbackReason` 记录原因

#### Scenario: 合成兜底分块
- **WHEN** compose 引擎需要对缺失 subtitleBlocks 的场景生成字幕块
- **THEN** 使用同一 v0.15.2 本地算法，而非旧贪心实现

### Requirement: 双实现一致性

JS 本地镜像（story2video-segmentation.js）与 TS 权威版（text-segmentation.ts）SHALL 对同一语料输出一致的句子/场景/字幕分块；一致性由 parity 测试锁定。

#### Scenario: parity 测试
- **WHEN** 运行 story2video-segmentation parity 测试
- **THEN** 对普通中文/多标点/短场景/长句无句号/顿号枚举/引号语料，JS 与 TS 输出逐项一致

### Requirement: 来源可追溯

全能创作链路的每个场景 SHALL 携带 `sceneSource` / `subtitleSource` 标记（smart-sentence-splitter / local-typescript / local-typescript-fallback），供前端与诊断区分算法来源。

#### Scenario: 来源标记
- **WHEN** 分句阶段完成且 generate_assets 组装素材清单
- **THEN** segmentation 元数据含非空 `sceneSource` 与 `subtitleSource`

