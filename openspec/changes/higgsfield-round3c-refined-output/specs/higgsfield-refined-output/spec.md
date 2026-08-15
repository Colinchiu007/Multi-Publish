# higgsfield-refined-output Specification

## Purpose
refined 层输出形态升级为「导演分镜单」（blocks 骨架 + FAIL CHECK 自审），评测侧增加块覆盖度与 lock-gated 启发式条件扣分（否定感知，默认仅 3 条启用，advisory 不进硬门槛）。

## Requirements

### REQ-1: blocks 结构化输出
- `VideoPromptMeta` 新增可选 `blocks: dict`，键白名单 12 块（SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK/FINAL FRAME），值 ≤4000 字符。
- WHEN blocks 提供 THEN 渲染单串按 12 块顺序组织（行首 `块名:` + 文本，块间空行）；缺失块从旧字段回退；每块值先剥离内嵌尾行形态（防 C6 中段误剥）。
- WHEN blocks 缺失/非法 THEN 走旧拼接路径（零回归）。
- refined 模板包含 FAIL CHECK 收尾自审段（仅模板侧指令，不进渲染输出串；timeline 判据兼容 `[SHOT N]` / `[HARD CUT]` / `CUT N`）。

### REQ-2: 块覆盖度检查（refined，引擎自渲染口径）
- `evaluate()` refined 层：分母 = `meta.blocks` 非空块数，分子 = 渲染串命中块标记数（统一正则，行首标题+冒号）。
- WHEN total ≥1 AND ratio < 0.8 THEN `violations["block_coverage"] = -5`（advisory，不进硬门槛）。
- WHEN tier=batch THEN 不启用，`checks.block_coverage = None`。

### REQ-3: lock-gated 启发式扣分（否定感知 + 默认 3 条启用）
- 7 条条件规则（warm_light_leak/dead_center/exposure_break/silhouette_break/style_contamination/skin_guard/eye_line）定义于 refined_blocks.json，`enabled_rules` 列表控制启用（默认 dead_center/exposure_break/eye_line 三条）。
- WHEN 输出正文声明对应 lock 词 THEN 检测 forbidden 词；**所有 forbidden 命中先过否定感知（no/not/without/无/不 前缀不计命中）**，命中 `violations["<rule>"] = -5`（advisory）。
- `style_contamination` 锁词禁用 `photoreal`（尾行恒含，必误报），使用 hyper-realistic/photorealistic detail/写实。

### REQ-4: 高频失败项注入强化
- refined 模板 Skin/Acting 段追加皮肤写实与视线纪律指令（pore-level skin / eye-line discipline）。

### REQ-5: 语料统计资产（分族 + 统一检测正则）
- `scripts/analyze_hg_corpus.py` 可复跑产出 `knowledge/refined_blocks.json`（版本化）。
- 语料按族统计（🔥 导演族 12 块 / 内联冒号族），块检测正则三处同源（统计/渲染/评测）；lock 词表与否定词出现率以语料校准。

### REQ-6: 缓存盐
- 视频缓存盐升至 `HIGGSFIELD_FMT_V4`（与 round3b 同批发布，一次失效重建）。

### REQ-7: 契约回显
- `normalizeVideoMeta` 支持 `blocks` 可选回显（白名单 + 截断，向后兼容）。