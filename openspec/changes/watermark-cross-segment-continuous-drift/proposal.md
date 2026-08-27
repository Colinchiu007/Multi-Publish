## Why

故事讲述流水线（Story2Video）多镜头成片（≥2 场景）中，「移动（平滑漂移）」水印按**片段**计时（`buildWatermarkFilter` 在单片段命令内应用，drawtext 的 t 每片段从 0 重新计时），导致每个镜头开头水印跳回画面中心附近，镜头切换点出现一次「中心吸附」跳变。2026-08-27 起点居中修复（PR #1194）使跳变从「底部 95%」变为「中心」，跳变本身仍在。产品期望：移动水印在整条成片时间轴上连续漂移，跨镜头不重置。

## What Changes

- **水印叠加阶段后置（管线重排）**：片段渲染阶段（image 路径与 video 路径）不再叠加移动水印；`_xfadeMerge` 拼接完成后的最终输出阶段统一叠加一次水印 drawtext，`t` 使用成片全局时间轴（0 → 总时长），跨镜头连续漂移、不跳变。
- **非移动位置保持逐片段叠加**：四角/居中位置静态水印无时间语义，保留现有逐片段实现（per-segment 开销不变），仅 moving 走后置路径；若后置成本收益证明对全部位置有利，可在 design 阶段作统一方案评估。
- **行为契约更新**：移动水印在成片任意时刻位置只取决于成片全局时间 t；多镜头不再出现起点重置。单镜头成片位置轨迹与修复后现状一致（t=0 居中起步）。
- 数据处理与交互不变：水印枚举、normalizer fail-closed、快照结构、UI 选项/提示文案均不受影响。

## Capabilities

### New Capabilities
- `story2video-watermark`: 水印渲染契约（位置坐标、移动语义、叠加阶段与计时基准）——本次变更移动水印的计时基准从片段级提升为成片级。

### Modified Capabilities
<!-- 无既有 openspec/specs/ 能力被修改（story2video-watermark 尚未 apply 进 openspec/specs/，本次作为 new capability 声明） -->

## Impact

- 代码：`apps/desktop/electron/services/story2video-compose-engine.js`——`_createSegment` 两条路径（image/video）的 filter_complex 水印移除逻辑、`_xfadeMerge`/分块拼接（`MAX_XFADE_INPUTS` 多级合并）后新增最终叠加命令或输出级 filter 扩展、进度阶段（87→89 分块分母）与临时文件/超时预算。
- 测试：compose-engine 测试中「片段 filter 含水印」类断言需按位置分列更新；新增「多镜头成片跨镜头连续」回归（数学契约以成片全局 t 求值 + 真实 ffmpeg 多片段冒烟帧对比）。
- 文档：PRD 3.1.38 多镜头说明从「每镜头回到中心」改为「跨镜头连续漂移」；product-manual 同步。
- 风险：未知/低——仅改渲染管线阶段，无 API/数据库/认证变更；但涉及进度、超时、内存（最终叠加一次额外 ffmpeg 命令），需 QM-1 打包与双模型审查。
