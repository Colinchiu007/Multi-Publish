## MODIFIED Requirements

### Requirement: 在线路径采用引擎字幕

当分句引擎（smart-sentence-splitter :8002）在线且 split 阶段返回有效场景时，故事讲述链路的每个场景 SHALL 优先采用引擎返回的 `scenes[].subtitles[].text` 作为该场景的 subtitleBlocks，并标记 `subtitleSource='smart-sentence-splitter'`；不得用本地算法重新切分引擎已返回的字幕。

#### Scenario: 引擎返回字幕时直接采纳
- **WHEN** `normalizeServiceSplitResult` 收到含 `scenes[].subtitles`（每项 text 非空）的引擎响应
- **THEN** 输出场景的 `subtitleBlocks` 与引擎返回的 subtitles 文本一一对应，`subtitleSource='smart-sentence-splitter'`

#### Scenario: 场景缺字幕时回退本地
- **WHEN** 引擎响应中某场景无有效 `subtitles`
- **THEN** 该场景回退本地分块并标记 `subtitleSource='local-typescript'`，不中断流水线

### Requirement: 来源可追溯

故事讲述链路的每个场景 SHALL 携带 `sceneSource` / `subtitleSource` 标记（smart-sentence-splitter / local-typescript / local-typescript-fallback），供前端与诊断区分算法来源。

#### Scenario: 来源标记
- **WHEN** 分句阶段完成且 generate_assets 组装素材清单
- **THEN** segmentation 元数据含非空 `sceneSource` 与 `subtitleSource`
