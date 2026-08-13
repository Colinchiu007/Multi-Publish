## 设计总览

Phase 1 全部改动落在"提示词内容层"，不动引擎编排架构（optimizer/cache/rag 零改动）。双仓库拆分：prompt-engine（8020 策略与字段定义）为上游事实源，Multi-Publish（契约收敛）为消费方。

## 一、prompt-engine 仓库（8020）

### 1.1 models.py — VideoPromptMeta 扩展

`video_prompt_engine/models.py` 的 `VideoPromptMeta` 增加两个可选字段：
- `positive_constraints: list[str]`（默认 `[]`）——"必须如此"硬约束
- `final_frame: str`（默认 `""`）——镜头终态描述

序列化保持 `exclude_none` 语义，空值不输出，兼容旧调用方。

### 1.2 strategies/base.py — 字段提取与渲染

`extract_video_meta`（现 L56-73）扩展：解析 JSON 中的 `positive_constraints`（兼容字符串或数组两种形态，字符串按换行拆数组）与 `final_frame`（字符串）。
`render`（现 L38-48）保持"prompt 优先"逻辑不变——新字段不参与 render，只随结构化 video 对象透传；optimized_prompt 单串中的 STRICT 块与最终画面块由 LLM 依 system prompt 生成，引擎不做字符串拼接（避免破坏保真）。

### 1.3 六平台策略 — 镜头纪律 system prompt 升级

公共模板（写入 `strategies/base.py` 新增 `build_lens_discipline_section()` 类方法，六策略调用）：

```text
## Lens Discipline (MANDATORY)
- Character count: open with "EXACT N CHARACTERS — ..." when the number of characters is known (N = count from context.character_list when provided; default 1 when a single subject).
- One primary camera move per shot; add "slow" unless the action demands speed; never stack multiple camera moves in one clip.
- At most 3 recognizable characters across cuts; describe extras as generic background figures.
- Positive constraints (STRICT block: what MUST happen) and negative constraints (what must NOT happen) MUST be written in separate blocks.
- Every clip ends with an explicit FINAL FRAME: subject position, pose, lighting state, whether the camera rests, and a no-text statement.
## Negative Prompt Discipline (MANDATORY)
- List only plausible failure classes: identity/costume drift, duplicate characters, anatomy errors, reference background bleed, location/lighting shifts, unwanted text/logos/subtitles/watermarks, unwanted style.
- Never pile up absolute negations the model ignores ("don't be bad"); if a failure is not plausible for this shot, omit it.
```

- `generic_video.py`：模板整体升级（新字段进 JSON 输出说明：`positive_constraints` 数组、`final_frame` 字符串）
- `seedance.py`：追加（保留 @引用/多模态约束/Fact-Fidelity 既有段落）
- `veo.py` / `kling.py` / `hailuo.py` / `doubao.py`：统一追加公共段落（各策略文件小，追加即可）
- `build_language_section` 说明新字段保持英文枚举/值不变（positive_constraints 内容可中文，final_frame 跟随 prompt 语言）

### 1.4 测试（prompt-engine 仓库）

- `tests/` 下视频引擎测试：断言 6 策略 system prompt 含镜头纪律段落；`extract_video_meta` 对新 JSON（含 positive_constraints 数组/字符串、final_frame）正确提取；缺失字段默认值；旧 JSON（7 字段）零回归；render 行为不变。

## 二、Multi-Publish 仓库（契约层）

### 2.1 video-prompt-engine-contract.js

`normalizeVideoMeta`（L375）扩展收敛：
- `positive_constraints`：数组透传（元素 trim 非空过滤，上限 10 条），字符串形态按换行拆分
- `final_frame`：字符串 trim，上限 500 字符
- 新字段缺失 → 不设默认值（undefined 语义，保持"可选字段缺失以默认值填充"在消费端处理），fail-closed 校验仍以 optimized_prompt 非空为准

### 2.2 测试

`video-prompt-engine-contract.test.js` 增加：
- 新字段透传（数组/字符串两形态）
- 缺失兼容（旧响应无新字段 → 不拒绝）
- 越界收敛（数组超限/超长字符串裁剪）
- 双后端共用 extractOptimizedVideoPrompt 路径断言新字段透传

## 三、兼容性与风险

- **零回归**：所有新字段可选；旧 LLM 响应（无新字段）走默认值路径；六策略 build_system_prompt 仅追加段落，不改既有输出格式描述
- **保真**：引擎不拼接 STRICT/终态文本，只约束 LLM 生成——避免二次加工破坏内容保真（Fact-Fidelity）
- **跨仓库顺序**：prompt-engine 先行（字段源），Multi-Publish 契约后行（消费方）；两 PR 可独立合入，契约对旧字段保持兼容故无合并顺序强依赖
- **风险点**：LLM 对 positive_constraints 数组格式可能输出字符串——提取层做双形态兼容（见 1.2）
