# Proposal: 流水线阶段进行中信息反馈颗粒度统一

## Why

视频创作流水线（story2video-compose 为主）的进度清单中，各阶段「进行中」反馈详细程度严重不均：

- **compose** 有完整子百分比进度（phase + percent + 片段计数 + 子进度条）
- **generate_assets** 有计数（图片 x/y · 旁白 c/d）
- **optimize** 数据存在但 UI 仅完成后展示
- **其余 6+ 阶段** 运行中仅显示「运行中 + 开始时间」，无任何细节

用户体验落差大，尤其 select_video_scenes（16-30s+ AI 视频生成）和 publish（逐平台发布）长时间无反馈。

## 基线差异审计

### 已交付（本次不重复规格化）

| 能力 | 状态 | 出处 |
|------|------|------|
| compose 子进度条 | ✅ 已实施 | PRD 7.1.9.1 / 3.1.10 |
| generate_assets 计数 | ✅ 已实施 | story2video-stages.js:1801-1818 |
| StageProgress UI 通用化（completed→100%） | ✅ 已实施 | 2026-08-14 fix |

### 待办（本次承载）

| 能力 | 状态 | 说明 |
|------|------|------|
| stage.progress 统一契约 | ❌ 待实施 | stage 对象无 progress 字段 |
| StageExecutor onProgress 通道 | ❌ 待实施 | 仅 compose 例外 |
| 各阶段进度上报 | ❌ 待实施 | optimize/publish/split 等无中间反馈 |
| 总进度加权计算 | ❌ 待实施 | 当前仅阶段数占比 |

## 范围

- **Phase 1**：stage.progress 契约 + UI 通用化（S/M）
- **Phase 2**：onProgress 通道 + 各阶段接入（M）
- **Phase 3**：实时推送/快照裁剪（可选增强）
