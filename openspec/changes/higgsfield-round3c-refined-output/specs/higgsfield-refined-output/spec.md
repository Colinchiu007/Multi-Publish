# higgsfield-refined-output Specification

## Purpose
refined 层输出形态升级为「导演分镜单」（blocks 骨架 + FAIL CHECK 自审），评测侧增加块覆盖度与 lock-gated 启发式条件扣分（默认 OFF advisory）。

## Requirements

### REQ-1: blocks 结构化输出
- `VideoPromptMeta` 新增可选 `blocks: dict`，键白名单 12 块（SCENE NOTE/SPATIAL LAYOUT/LIGHTING/COLOR/CAMERA/ENVIRONMENT/CONTINUITY/CHARACTERS/SKIN/ACTING/STILLNESS LOCK/FINAL FRAME），值 ≤4000 字符。
- WHEN blocks 提供 THEN 渲染单串按 12 块顺序组织；缺失块从旧字段回退。
- WHEN blocks 缺失/非法 THEN 走旧拼接路径（零回归）。
- refined 模板包含 FAIL CHECK 收尾自审段（5 条 if-then 校验）。

### REQ-2: 块覆盖度检查（refined）
- `evaluate()` refined 层统计输出命中块数。
- WHEN 命中块数 < 阈值 N（refined_blocks.json，先 8）THEN `violations["block_coverage"] = -5`（advisory，不进硬门槛）。
- WHEN tier=batch THEN 不启用。

### REQ-3: lock-gated 启发式扣分（默认 OFF）
- 7 条条件规则（warm_light_leak/dead_center/exposure_break/silhouette_break/style_contamination/skin_guard/eye_line）定义于 refined_blocks.json。
- WHEN 输出正文声明对应 lock 词 THEN 检测 forbidden 词，命中 `violations["<rule>"] = -5`（advisory）。
- WHEN 未声明 lock THEN 规则不启用（默认 OFF）。

### REQ-4: 高频失败项注入强化
- refined 模板 Skin/Acting 段追加皮肤写实与视线纪律指令（pore-level skin / eye-line discipline）。

### REQ-5: 语料统计资产
- `scripts/analyze_hg_corpus.py` 可复跑产出 `knowledge/refined_blocks.json`（版本化）。
- 阈值 N 与 lock 词表以语料统计为准（误报率 <5% 目标）。

### REQ-6: 缓存盐
- 视频缓存盐 `HIGGSFIELD_FMT_V3 → V4`（输出格式变化使旧缓存失效）。

### REQ-7: 契约回显
- `normalizeVideoMeta` 支持 `blocks` 可选回显（白名单 + 截断，向后兼容）。
