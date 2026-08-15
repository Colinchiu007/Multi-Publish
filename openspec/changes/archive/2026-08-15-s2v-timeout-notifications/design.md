## Context

见 `proposal.md`。当前 compose 已能得到 `segmentDurations`、旁白 probe 结果和转场计划总时长；片段编码与 xfade 已有动态超时先例，但全片其余阶段仍使用固定值。错误沿 StageExecutor/PipelineEngine 传播到 renderer 时通常只保留原始字符串，因此通知层仍需兼容中英文遗留文本并保持脱敏。

## Goals / Non-Goals

**Goals:**

- 用同一有界公式描述所有全片 ffmpeg 等待预算。
- 对每个阶段选择与实际工作量最接近的媒体时长。
- 保持既有短片等待下限，同时覆盖最长 50 分钟合法输出。
- 把时长超限与可重试合成超时分成稳定、双语、安全的用户提示。

**Non-Goals:**

- 不提高 50 分钟产品时长上限。
- 不改变 ffmpeg codec、质量参数、分块策略或自动重试次数。
- 不新增 IPC errorCode；renderer 兼容现有字符串传播链。
- 不以真实 50 分钟媒体作为常规 CI fixture。

## Decisions

### 1. 统一使用“倍率 + 余量 + 上下界”

预算公式：`min(maxMs, max(minMs, ceil(durationSeconds * factor * 1000) + overheadMs))`。无效时长直接返回 `minMs`。阶段配置：

| 阶段 | 最小值 | 倍率 | 固定余量 | 最大值 |
|---|---:|---:|---:|---:|
| concat stream copy | 60s | 0.25 | 30s | 30min |
| narration AAC | 120s | 2 | 30s | 2h |
| BGM mix | 120s | 2 | 30s | 2h |
| WebM VP9/Opus | 180s | 6 | 120s | 6h |
| output full decode | 60s | 2 | 30s | 2h |
| xfade encode | 120s | 3 | 120s | 6h |

选择该方案而非“统一超时 6 小时”：短片失败仍能及时收敛，长片按成本扩展。选择阶段倍率而非单一倍率：stream copy、音频重编码与 VP9 的成本差异显著。

### 2. 复用现有时长数据，不增加额外 probe

- concat：使用当前调用可见的片段时长之和；分块时使用当前块。
- narration：使用 `probe || scene.duration || 0` 之和，不计 `min-duration` 静音补齐。
- final output：片段总时长减转场重叠，供 BGM/WebM/校验共用。
- xfade：继续使用计划的 `totalDuration`，只增加硬上限。

选择复用而非每阶段再 ffprobe：避免给 50 分钟路径叠加额外 I/O 和失败点。

### 3. renderer 使用三个语义 key

- `story2video.compose_duration_exceeded`：成片/旁白总时长。
- `story2video.compose_segment_duration_exceeded`：单段旁白。
- `story2video.compose_timeout`：旁白/BGM/WebM/校验/ffmpeg 合成超时。

总时长从原始文本提取分钟数并仅允许数值参数，提取失败默认 50；其他技术字段不进入插值。选择三个 key 而非每阶段一个 key：用户动作只有“缩短总内容 / 拆分单段 / 重试并检查设备”三类，阶段细分不会改变解决方式。

### 4. 单元测试模拟 50 分钟，不生成 50 分钟媒体

helper 边界测试与 compose 方法参数测试证明预算合同；已有短媒体真实 ffmpeg 测试继续验证命令可执行。真实 50 分钟 VP9 会显著拖慢 CI，收益低于公式与参数可追踪测试。

## Risks / Trade-offs

- [倍率仍是保守估算，低性能机器可能触达上限] → 上限足够覆盖 50 分钟目标，并保留明确可重试通知；后续可由遥测校准倍率。
- [允许更长子进程会更久占用 CPU] → 每阶段都有硬上限，用户仍可取消流水线。
- [字符串映射可能误判普通 timeout] → 仅在 ffmpeg/合成阶段词与 timeout 同时出现时归类，未知错误继续通用回退。
- [预计时长与最终实测有偏差] → 预算采用保守倍率和固定余量；成功返回仍使用最终 probe 结果。

## Migration Plan

1. 先提交 helper 与通知映射失败测试，再实现。
2. 运行定向单测、renderer build、locale/CJK 门禁和 Electron 完整打包。
3. PR 合并后无需数据迁移；回滚只需还原代码与 locale，本地项目数据不受影响。
