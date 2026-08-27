## Context

- 现状：`buildWatermarkFilter`（`story2video-compose-engine.js`）在**单片段命令内**叠加 drawtext 水印（image 路径与 video 路径各一处调用）；各片段独立渲染后经 `_xfadeMerge`/分块拼接（`MAX_XFADE_INPUTS` 限制，多级递归合并）合成成片。drawtext 的 `t` 是片段内时间 → 每个镜头开头水印从 t=0 位置起步，多镜头切点出现「中心吸附」跳变（2026-08-27 修复后跳回中心，PR #1194）。
- 2026-08-27 已新增「moving 数学契约」测试模式（从 filter 提取表达式做真实求值：t=0 居中、幅度扫描、峰值锁周期、周期回原点），本次变更需复用该模式并扩展「成片级 t」断言。
- 进度契约：分块合成总块数 `countChunkedMergeChunks`（87→89 拼接子进度分母）与 `_concatSegmentsChunked` 循环强同步，新增后置阶段必须同步更新分母，否则进度越界/停滞。
- 兼容约束：快照/枚举/normalizer 不变；QM-1 打包门禁覆盖 electron 主进程变更；双模型审查（opencode + Claude）为 M+ 任务强制项。

## Goals / Non-Goals

**Goals:**
- moving 水印以成片全局时间轴计时，跨镜头连续漂移、切点零跳变。
- 单镜头轨迹与现状完全一致（t=0 居中、周期 x100s/y140s、0.9 幅度、确定性）；静态位置逐片段语义不变。
- 复用 `buildWatermarkFilter`（字体/转义/透明度/字号逻辑单一来源），后置路径不重复实现。

**Non-Goals:**
- 不改 UI/枚举/快照/normalizer；不引入随机漂移或用户可配置周期。
- 不做静态位置的后置统一（无时间语义、收益为零，仅 moving 后置）。
- 不修 Remotion 路径（`Story2VideoSlideshow.tsx` 无 moving 分支，休眠缺口另立跟进）。
- 不改变 xfade 转场逻辑与时长预算。

## Decisions

1. **方案 A（选定）：仅 moving 后置叠加** —— moving 片段不再内嵌水印，片段渲染后、最终产物上叠加一次 drawtext（t=全局）。实现点：
   - `_createSegment` image/video 两条路径：`position === 'moving'` 时跳过 buildWatermarkFilter 注入；
   - 最终输出阶段：分块拼接时**只有最后一级**输出命令追加 watermarks 参数，或在 `_xfadeMerge` 收尾产物上跑一次独立 ffmpeg 后处理命令（优选独立命令：避免改动各级 filter 索引/映射，风险面小；代价是额外一次编码，时长 ≈ 成片时长 × 编码速度）。
   - 传递：`movingWatermark` 配置对象沿 compose 参数链传到最终阶段（与字幕后置类似；须确认字幕是否已有「合并后追加」先例可复用管线位）。
   - 备选：全部位置后置统一叠加 —— 静态位置无收益且增加中期回归面，否决。
- **规划期待办确认（2026-08-27）**：① 无下游消费片段内水印（历史恢复/缩略图/中途产物展示均不依赖），片段可安全去字；② 进度分母**无需修改** `countChunkedMergeChunks`（该分母只服务 87→89 分块拼接子进度，后处理为单条命令、无递归分块）；③ 后处理编码耗时按本机实测量级（见 Risks）可接受。
   - 备选：xfade 链上输出级追加 drawtext filter —— 需重排多级 filter_complex 的输入/标签映射，触碰 87→89 进度与既有大量断言，否决（记录为回退考量）。
2. **计时基准契约**：后置 drawtext 的 `t` 即成片时间轴；`buildWatermarkFilter` moving 表达式原样复用（表达式内 t 语义自动从片段级变为成片级，无需改公式）。
3. **进度契约维护**：独立后处理命令按「固定 1 块」或编码时长估算项并入 `countChunkedMergeChunks` 分母（实现时以现状分母同步规则为准，必须跑全量 compose 进度测试）。
4. **进度与超时（已分析定案）**：后处理水印作为**新阶段 `phase:'watermark'`、percent 90** 插入 narration（89）与 bgm（92）之间——percent 序列 87→89→90→92→95→98→100 单调，90/91 空闲位不冲突既有阶段；单条命令无需分块推进，`countChunkedMergeChunks` 分母不变。该命令是「解码成片 + drawtext + 全量重编码」，工作量与 xfade 合并同级，**复用 xfade 超时 profile**（`{minMs:120000, factor:3, overheadMs:120000, maxMs:6h}`，即 max(2 分钟, 输出时长 × 3 + 2 分钟)；代码内注释已论证该假设「最低 1.5x 实时编码 + 大幅余量」在 337s 成片实测成立）——新增 `watermark` 条目到 `FFMPEG_STAGE_TIMEOUT_PROFILES`，不新增预算机制。
5. **测试策略**：
   - 单元：filter 提取断言改为「moving 片段 filter 不含 moving drawtext、输出命令含 moving drawtext」；数学契约求值保留（t=0 居中、峰值、周期）。
   - 集成/契约：`pipeline-story2video-contract.test.js`、`story2video-compose-engine-cleanup.test.js` 等受影响断言按新阶段更新。
   - E2E 冒烟：真实 ffmpeg 生成 2 片段成片（镜头切换点 30s），抽取 29.5/30.5s 帧断言水印坐标连续（无跳变）；单镜头 t=0 帧断言居中回归。

## Risks / Trade-offs

- 额外一次后处理编码：后处理是 decode+drawtext+encode 的 1080p 直编（无 zoompan 2x 上采样），速度显著快于片段编码（本机片段编码 10-20fps 的瓶颈是 2x 中间分辨率）；保守按 xfade 的「最低 1.5x 实时」假设估算：10s 成片 +约 10s、40s 成片 +约 40s、300s 成片 +约 5min（长成片属极端，默认时长上限远低于此）。超时预算复用 xfade profile 后完全覆盖，不会触发 ETIMEDOUT；用户感知为进度条在 90 阶段多停留一段（新增「正在烧录水印」文案，消除假卡死感）。若实测慢速机（1x 以下实时）成本不可接受，回退到输出级 filter 方案（Decision 1 备选）。
- 片段无字水印预览/中间产物语义变化：片段文件不再含 moving 水印，检查是否有下游依赖片段内水印（历史恢复/缩略图/中途产物展示）；如有，需在片段保留静态水印或调整消费方。
- 回归面：既有断言「片段 filter 含水印」数量多，按位置分列修改需仔细；双模型审查 + QM-1 打包 + 真实 ffmpeg 冒烟为强制门禁。
- 多镜头连续漂移会改变用户可见行为（更平滑），与 PRD 3.1.38「每镜头回到中心」描述冲突，需同步更新 PRD/product-manual（文档随本 change 修正）。
