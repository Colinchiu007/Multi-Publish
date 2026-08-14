## Why

视频提示词优化引擎（8020）已具备平台策略、结构化输出与缓存骨架，但提示词"内容层"缺少电影级镜头纪律：无角色数锁定、无正向约束块、无最终画面块、无运镜纪律、负面提示词未按"真实失败模式"收敛。Higgsfield《Hell Grind》开源调研（`01-docs/HELL-GRIND-OPENSOURCE-ANALYSIS-2026-08-13.md`，A 级复用清单）证明这些规则可直接提升成片一致性，且仅需 system prompt 模板与结构化字段扩展，不动引擎架构。

## What Changes

- **镜头纪律规则注入**：六平台策略（generic_video/seedance/veo/kling/hailuo/doubao）system prompt 增加：EXACT N 角色数锁定、每镜一主运镜 + 默认 slow、跨镜可识别角色 ≤3、其余角色泛化。
- **正向约束块（STRICT）**：结构化输出新增 `positive_constraints` 字段（必须如此语义，与 negative_prompt 的禁止语义分列）；system prompt 要求正向/负向分块表达。
- **最终画面块（Last Frame）**：结构化输出新增 `final_frame` 字段（终态位置/姿势/灯光/机位是否静止/禁文字）。
- **负面提示词 plausible-only**：system prompt 约束负面只列真实会发生的失败类别（身份漂移/重复角色/解剖/背景渗入/光变/文字/风格），禁止堆砌无效否定词。
- **契约层同步**：`video-prompt-engine-contract.js` 的 `normalizeVideoMeta` 收敛新字段 + fail-closed 校验，双后端（8020/8013）共用。
- 兼容性：旧字段（shot/camera/motion_intensity/scene_transition/continuity_token/duration_hint）零回归；新字段缺失时按可选处理，不拒绝整条结果。

## Capabilities

### New Capabilities
- 无（不引入新能力域）

### Modified Capabilities
- `video-prompt-engine`: 在现有"结构化视频输出"要求之上，增加镜头纪律与内容层规则（角色数锁定、正向约束、最终画面、运镜纪律、负面 plausible-only），并扩展结构化 video 对象字段。

## Impact

- **prompt-engine 仓库（8020）**：`video_prompt_engine/strategies/base.py`（extract_video_meta/render 扩展）、`strategies/generic_video.py`（模板升级）、`strategies/seedance.py`、`strategies/veo.py`、`strategies/kling.py`、`strategies/hailuo.py`、`strategies/doubao.py`（规则注入）、`models.py`（VideoPromptMeta 新字段）、对应单元测试。
- **Multi-Publish 仓库**：`apps/desktop/electron/services/video-prompt-engine-contract.js`（normalizeVideoMeta 收敛 + fail-closed）、`video-prompt-engine-contract.test.js`（新字段回归）。
- **依赖/系统**：无新依赖；8020 与 8013 兼容路径共用输出校验，行为契约保持一致。
- **分支策略**：双仓库均按运行时代码走 `codex/` 分支 + PR。
