# story2video-subtitle-timestamps Specification

## Purpose
字幕时间戳三级来源（TTS 词边界事件 → ASR 强制对齐 → 比例估算）的采集与编排契约：TTS 服务商支持词级时间戳时直接采集（Tier1，零成本），仅无时间戳或质量不足时回退 whisper ASR（Tier2），估算仅作兜底；任何失败 fail-open，不中断流水线。
## Requirements
### Requirement: TTS 词级时间戳采集（Tier1）
edge-tts 合成脚本 SHALL 使用 `boundary="WordBoundary"` 流式采集词边界事件（offset/duration 为 100ns 单位，÷1e7 转秒），把词级时间戳写入 `<audio>.timings.json` sidecar，并在 TTS 资产结果中携带 `timings`；MiniMax 适配器 SHALL 在请求 `with_timestamps`/`subtitleType='word'` 时透传 `subtitle_enable + subtitle_type`（仅 8 个白名单模型：speech-2.8/2.6/02/01-hd/turbo），响应透传 `subtitle_file` 与 `extra_info.audio_length`（ms→s）。edge-tts 旧版本（无 WordBoundary，退出码≠0）SHALL 自动重试一次旧 `.save()` 脚本（无词级时间戳，回退 ASR）。

#### Scenario: edge-tts 词级时间戳
- **WHEN** 使用 edge-tts 合成旁白且版本支持 WordBoundary
- **THEN** 音频旁生成 `<audio>.timings.json`，资产携带 `timings`（含 text/start/end 秒）与真实词尾时长

#### Scenario: MiniMax 字幕模型白名单
- **WHEN** 请求模型不在 8 个白名单内
- **THEN** 不传 `subtitle_enable/subtitle_type`，保持历史行为

#### Scenario: 异步字幕参数被拒降级
- **WHEN** MiniMax 异步创建接口以非 2xx 或 200+base_resp(2013/invalid params) 拒绝字幕参数
- **THEN** 去掉字幕参数重试一次；仍失败时原样抛出，TTS 不因字幕请求整体失败

### Requirement: 两级对齐编排（Tier1 优先、Tier2 回退）
`alignScenes` SHALL 先对带 `timings` 的场景直接聚合到分句块（method='tts-timestamps'）；仅当无 timings 或聚合 `coverage < 0.5`/method='estimate' 时，才对该场景走 ASR 转写对齐（Tier2）。Tier1 聚合异常 SHALL 不击穿流水线（fail-open），场景落入 Tier2 兜底。

#### Scenario: 全部场景带词级时间戳
- **WHEN** 37 个场景均携带 TTS timings 且 coverage≥0.5
- **THEN** 不调用 aligner bridge，全部 method='tts-timestamps'，无 ASR 停顿

#### Scenario: 覆盖不足回退
- **WHEN** 场景 timings 与字幕块文本不匹配（coverage<0.5）
- **THEN** 弃用劣质时间戳，该场景走 ASR 对齐

#### Scenario: 混合场景
- **WHEN** 部分场景带 timings、部分不带
- **THEN** 带 timings 的跳过 ASR，无 timings 的正常走 ASR

### Requirement: 时间戳抓取安全边界
`_fetchSubtitleTimings` SHALL 有界超时（10s）、按 `content-length` 提前拦截超限文件（8MB）、解析失败返回 null；时间戳缺失/抓取失败/解析失败一律 fail-open——音频正常返回，对齐回退 ASR 或估算，不产生劣质字幕、不阻断流水线。

#### Scenario: 抓取失败降级
- **WHEN** subtitle_file 抓取网络失败或超时
- **THEN** 音频资产正常返回（无 timings 字段），对齐层回退 ASR

#### Scenario: 超大文件拦截
- **WHEN** subtitle_file 的 content-length 超过 8MB
- **THEN** 不读取正文直接放弃，无 timings，回退 ASR

