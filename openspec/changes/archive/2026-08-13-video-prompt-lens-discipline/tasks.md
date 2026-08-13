# Tasks — video-prompt-lens-discipline

> 进度单一来源：本文件 checkbox。双仓库：prompt-engine（上游字段源）→ Multi-Publish（消费方契约）。
> 分支策略：双仓库均走 `codex/` 分支 + PR（运行时代码）。

## Phase A — prompt-engine 仓库（8020）

- [x] A1. `models.py`：VideoPromptMeta 增加 `positive_constraints: list[str]` / `final_frame: str` 可选字段
      - 测试：`VideoPromptMeta` 构造/序列化新字段；旧字段零回归
- [x] A2. `strategies/base.py`：新增 `build_lens_discipline_section()` 公共模板（角色数锁定/单镜单运镜+slow/三角色上限/正负向分块/最终画面块/负面 plausible-only）；`extract_video_meta` 提取 positive_constraints（数组/字符串双形态）与 final_frame
      - 测试：`extract_video_meta` 新字段提取、双形态兼容、缺失默认、旧 JSON 零回归；`render` 行为不变
- [x] A3. `strategies/generic_video.py`：system prompt 追加镜头纪律段落；JSON 输出说明增加 positive_constraints/final_frame
      - 测试：system prompt 含镜头纪律段落与字段说明
- [x] A4. `strategies/seedance.py` / `veo.py` / `kling.py` / `hailuo.py` / `doubao.py`：统一追加镜头纪律段落（保留既有平台专属段）
      - 测试：5 策略 system prompt 均含段落；seedance 保留 @引用/多模态/Fact-Fidelity 段
- [x] A5. 全量跑 prompt-engine 视频引擎测试套件，确认零回归
      - 测试：pytest 全绿

## Phase B — Multi-Publish 仓库（契约层）

- [x] B1. `video-prompt-engine-contract.js`：`normalizeVideoMeta` 收敛 positive_constraints（数组透传/字符串拆分/上限 10 条）与 final_frame（trim/上限 500）
      - 测试：`video-prompt-engine-contract.test.js` 新字段透传（数组/字符串）、缺失兼容、越界收敛、extractOptimizedVideoPrompt 双后端路径透传
- [x] B2. Multi-Publish 侧跑 `video-prompt-engine-contract.test.js` 全绿

## Phase C — 收尾

- [x] C1. 双仓库 PR（codex/ 分支）：prompt-engine PR #34 + Multi-Publish PR #779，附变更说明
- [x] C2. 双模型审查（antigravity + Claude 并行；均不可用 → 降级主代理）→ review.md 记录（含 Critical 修复）
- [x] C3. OpenSpec apply + archive 三同步（openspec archive / CCG task 归档 / learnings）
