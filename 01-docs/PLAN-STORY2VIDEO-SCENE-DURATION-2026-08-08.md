# PLAN — Story2Video 场景时长三层模型落地（P0+P1，2026-08-08）

> 状态：规划期草案（Phase 1），待产品确认 D1-D3 后按 TDD 分批次实施。
> 依据：`01-docs/PRD-video-creation.md §3.1.9 场景时长与图片动效设计合同（三层模型）`。

## 0. 目标

消除「分镜目标时长（秒）」这一误导性间接旋钮，落地三层模型：

| 层 | 旋钮 | 语义 |
|----|------|------|
| ① 分镜粒度（split） | **每分镜目标字数**（主控，默认 20 字）；「目标时长」降级为 voice-aware 倒推的估算视图 | 控制旁白内容密度与分镜数量 |
| ② 实际时长（compose） | 无旋钮：ffprobe 真实 TTS 音频为权威，不截断（现状保留） | 成片真实时长 |
| ③ 节奏下限（compose） | **最短场景时长** `max(音频实际时长, N)` 静音补齐（可选开关，默认关闭） | 唯一真正控制"展示时长"的旋钮 |

## 1. 决策点（需产品确认，默认值已标）

- **D1 分镜粒度主控形态**：A) 字数主控（直接暴露字数） / B) 时长倒推（暴露时长，程序按音色/语言/语速换算字数） / **C) 双视图+默认时长（推荐）**——底层统一为"每分镜目标字数"，UI 提供「目标时长」与「目标字数」两种表达。
- **D2 最短场景时长默认值 N**：默认 6（与 defaultSceneDuration 一致，1..60 可配）。
- **D3 最短场景时长开关默认态**：**关闭**（保持现有成片行为不变，避免默认成片节奏变化）。

## 2. 范围与涉及文件

| 文件 | 改动 |
|------|------|
| `apps/desktop/src/views/CreateView.vue` | ① 时长/字数双视图切换；③ 最短场景时长开关+N 输入（高级区） |
| `apps/desktop/electron/services/story2video-text-config.js` | ① 新增 `split.targetCharsPerScene`（默认 20）；保留 `targetSeconds` 兼容；voice-aware 换算（`baseWordsPerSecond = targetCharsPerScene / targetSeconds` 或按语言/音色表）；③ 新增 `compose.sceneDurationMode` / `compose.minSceneDuration` |
| `apps/desktop/electron/services/story2video-segmentation.js` | 本地切分主控改为字数（`targetChars` 直接来自配置，不再由秒数反推） |
| `packages/story2video-engine/src/text-segmentation.ts` | 与 JS 侧同步（TS 本地切分） |
| `packages/python-backend/.../story2video-compose.yaml` | `runtime_defaults` 补 `split.targetCharsPerScene`、`compose.sceneDurationMode/minSceneDuration` |
| `apps/desktop/electron/services/story2video-compose-engine.js` | ③ min-duration 模式：`effectiveDuration = max(audioDuration, minSceneDuration)`；`_createSegment` 补齐静音（`-t` + `apad`/anullsrc，去掉该场景 `-shortest`）；字幕/动效统一用 effectiveDuration；累计时长校验含补齐；`_concatNarrationAudio` 保持原始音频 |
| `apps/desktop/electron/services/stage-executor.js` | compose 白名单加 `sceneDurationMode`/`minSceneDuration` |
| `apps/desktop/electron/services/story2video-project-service.js` | `_safeOptions` 白名单同步 |
| 测试 | 见 §4 |

**外部边界**：8002 分句器按 `target_duration × base_words_per_second × speech_rate` 计算目标字数（与本地公式一致，PRD 7.1.1 已确认参数不被静默忽略）；voice-aware 只需把 `base_words_per_second` 换成音色/语言感知值，**8002 无需改动**。

## 3. 设计

### ① 分镜粒度（split）

- 新增配置 `split.targetCharsPerScene`（默认 20，范围 1..200，整数）；`minWords/maxWords` 仍作边界。
- **兼容**：旧配置/历史项目只有 `targetSeconds` → 归一化时按 `targetCharsPerScene = round(targetSeconds × baseWordsPerSecond × speechRate)` 换算后夹在 [minWords, maxWords]。
- **voice-aware 倒推（P1）**：`charsPerSecond = 语言基准（zh≈4.5字/s、en≈2.8词/s） × speechRate × 音色系数[provider/voice]（默认 1.0，可扩展查表）`；
  - 时长视图：`targetCharsPerScene = round(目标时长 × charsPerSecond)`；
  - 传给 8002：`base_words_per_second = targetCharsPerScene / targetSeconds`（乘积恒等于目标字数），或直接传 `min_words/max_words` 收紧区间。
- **speechRate 单一来源（P1）**：`split.speechRate` 由 `voice.speed` 驱动（归一化时 `speechRate = voice.speed`），消除"切分按 1x、播报按 1.5x"脱节；`splitSpeechRate` 独立字段下线。

### ② 实际时长（compose）

- 无改动。`-shortest` 跟随 ffprobe 真实音频；`scene.duration` 上报值仅作不可探测回退。

### ③ 最短场景时长（compose）

- 新参数：`sceneDurationMode: 'follow-audio' | 'min-duration'`（默认 follow-audio）；`minSceneDuration: 1..60`（默认 6）。
- min-duration 模式计算：`effectiveDuration = max(audioDuration, minSceneDuration)`（音频不可探测时回退 `defaultSceneDuration`）。
- `_createSegment`：当 `effectiveDuration > audioDuration` 时——`-t effectiveDuration` + 音频链 `apad`（或 anullsrc 混入静音）+ **该场景去掉 `-shortest`**；否则保持现状。
- 字幕时间轴、动效归一化统一用 `effectiveDuration`（动效在补齐静音段也完整走完）。
- 累计成片时长校验（≤600s）包含补齐；单段上限仍按原始音频时长校验（不因补齐误拒）。
- `_concatNarrationAudio`（完整旁白导出）保持原始音频、不补齐。

## 4. 测试清单（TDD，RED→GREEN）

1. **text-config**：
   - 默认 `targetCharsPerScene=20`；`targetSeconds` 旧配置自动换算且结果 ∈ [minWords,maxWords]；
   - `voice.speed` 驱动 `speechRate`（单一来源）；`targetCharsPerScene` 越界（0/201）拒绝；
   - `sceneDurationMode` 枚举校验、`minSceneDuration` 1..60 越界拒绝；
   - 旧 `splitSpeechRate` 独立字段下线后兼容忽略。
2. **segmentation / text-segmentation（JS+TS 双侧）**：
   - 直接按 `targetCharsPerScene` 切分：20 字 → 分镜数正确；边界（≤minWords、≥maxWords、整句溢出）。
3. **compose-engine**：
   - `follow-audio` 模式与现状逐项一致（回归全绿）；
   - `min-duration` 模式：3s 旁白 → 片段实际时长 = 6s（ffprobe 校验）；10s 旁白不被截断；
   - 补齐场景字幕末页精确结束于 effectiveDuration；动效 effectDuration 用补齐后值；
   - 转场仍安全（buildTransitionPlan 用新时长）；补齐后总时长 > 600s 被拒；
   - `_concatNarrationAudio` 输出不含补齐静音（时长=原始旁白和）。
4. **CreateView**：
   - 双视图切换：时长↔字数换算显示一致；③ 开关默认关闭、开启后 N 输入生效；
   - 提交的 `story2videoTextConfig` 含 `targetCharsPerScene` 与 `sceneDurationMode/minSceneDuration`。
5. **真实 ffmpeg（补 claude review W3）**：
   - min-duration 补齐段真实渲染：`ffprobe` 断言时长 = max(音频, N)；滤镜可解析（apad 无报错）。

## 5. 验收标准

- [ ] UI 不再出现误导性「分镜目标时长」独立旋钮（改为双视图或字数主控）；
- [ ] `targetCharsPerScene` 成为 splitter 实际控制变量，旧 `targetSeconds` 配置自动兼容；
- [ ] `voice.speed` 与切分 `speechRate` 一致（单一来源）；
- [ ] min-duration 模式：短旁白补齐、长旁白不截断、字幕/动效/转场一致、总时长含补齐；
- [ ] 默认（follow-audio + 开关关）成片行为与现状完全一致；
- [ ] 全量测试通过 + QM-1 打包 + Vue build；质量节拍门禁通过。

## 6. 实施顺序（TDD、分批、每批独立 PR）

- **Batch 1（P0-参数层）**：text-config + yaml + project-service/stage-executor 白名单 + 测试（含旧配置兼容）。
- **Batch 2（P0-切分层）**：segmentation（JS/TS）字数主控 + speechRate 单一来源 + 测试。
- **Batch 3（P0-节奏层）**：compose min-duration 补齐 + 字幕/动效/转场统一 + 真实 ffmpeg 测试。
- **Batch 4（P0-UI）**：CreateView 双视图 + 最短场景时长开关/N 输入 + 测试 + Vue build + 视觉回归。
- **Batch 5（P1）**：voice-aware 估算表 + 自适应校准（真实 TTS 样本回填）+ 运营后台实时预估（分镜数/时长区间/成本）——独立排期评估。

## 7. 风险

- **8002 契约**：假设 `target_duration × base_words_per_second × speech_rate` 语义稳定（PRD 7.1.1 已确认参数映射；若 8002 对 `base_words_per_second` 有 0.5..10 校验需适配）。
- **补齐的 ffmpeg 行为**：`apad`/`-t` 组合需真实片段验证（Batch 3 必测）；转场 acrossfade 对补齐段音频流完整性。
- **默认行为漂移**：任何改动不得改变 follow-audio 默认成片；用 Batch 1/2/3 回归锁定。
- **并发工作树**：提交按路径精确 stage，不触碰无关脏文件。
