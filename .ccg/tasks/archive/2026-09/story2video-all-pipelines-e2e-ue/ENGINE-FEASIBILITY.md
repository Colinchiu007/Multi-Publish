# 13 条非 s2v 流水线「实现真实引擎」可行性矩阵（2026-08-06）

## 共性缺口
- 桌面 `PipelineEngine` 对 13 条只做 state_machine 状态跟踪；`StageExecutor` 无对应 stageDefs。
- `ServiceBus.callPythonSkill` 指向 `/api/skills/*`，但 Python 后端无此端点（server.py 只有单步 `/api/video/process|analyze|mix-audio|search-stock|generate-subtitle`）。
- 需要的通用工作：每条流水线定义 stageDefs + StageExecutor 执行器 + 参数合同 + 错误/取消/产物持久化 + ServiceBus→Python 工具/本地工具的接线。

## 逐条判定（工具来源：packages/python-backend/src/multi_publish/video_creation/）

| 流水线 | 阶段→可用工具 | 已配置模型可覆盖 | 阻断点 |
|---|---|---|---|
| animated-explainer | research/proposal/script/scenes→LLM(agnes✓)；assets→图片(minimax✓)+素材库(pexels/pixabay 未配置key)；editing/compose→ffmpeg✓ | ✅ LLM+图片+ffmpeg | 素材库可降级为纯生成 |
| talking-head | transcribe→本地whisper✓；captions/render→ffmpeg✓ | ✅ 本地工具 | 无 |
| cinematic | ingest/grade→ffmpeg+color_grade.py✓；compose/render→ffmpeg✓ | ✅ 本地工具 | 无 |
| animation | animate→视频生成(kling/minimax-video/runway 未配置) | ❌ | 缺视频生成模型 |
| avatar-spokesperson | avatar→heygen(未配置)；script→LLM✓；render→ffmpeg✓ | ❌ | 缺数字人视频模型 |
| character-animation | animate→character_animation.py+视频生成(未配置) | ❌ | 缺视频生成模型 |
| clip-factory | analyze/extract→scene_detect/ffmpeg✓；caption/export→ffmpeg✓ | ✅ 本地工具 | 无 |
| documentary-montage | research→LLM✓；ingest/edit→ffmpeg✓；narrate→TTS(minimax✓)；render✓ | ✅ | 无 |
| hybrid | plan→LLM✓；generate→视频生成(未配置)；merge→green_screen_composite✓ | ❌ 部分 | 缺视频生成模型 |
| localization-dub | transcribe→本地whisper✓；translate→LLM✓；tts→minimax✓；sync→ffmpeg✓ | ✅ | 无 |
| podcast-repurpose | analyze→transcribe✓；visualize→图片(minimax✓)/素材库；assemble/render→ffmpeg✓ | ✅ | 素材库可选 |
| screen-demo | record→screen_recorder.py✓；annotate/render→ffmpeg✓ | ✅ 本地工具 | 无 |
| framework-smoke | verify→composition_validator.py✓；report✓ | ✅ 本地工具 | 无 |

## 结论
- **可用已配置模型+本地工具实现**（约 8 条）：animated-explainer、talking-head、cinematic、clip-factory、documentary-montage、localization-dub、podcast-repurpose、screen-demo、framework-smoke（9 条，其中 clip-factory/screen-demo/framework-smoke 基本纯本地）。
- **缺模型被用户预期豁免**（4 条）：animation、avatar-spokesperson、character-animation、hybrid（需要视频生成/数字人 provider，当前未配置）。
- 每条流水线实现 = 完整产品级工作量（stageDefs+执行器+合同+UI+测试+视觉基线），建议按优先级分批立项；本目标范围内可先行把「未实现/缺模型」在 UI 明确化（见 UE-OPTIMIZATION-PROPOSAL.md）。
