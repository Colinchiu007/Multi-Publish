# Design — Higgsfield round3c refined 输出形态升级（块骨架 + 覆盖度 + 启发式 gated）

## 1. 语料统计（前置）

`scripts/analyze_hg_corpus.py`（prompt-engine 仓库，只读 `D:\Temp\hg-corpus\*.json`）：
- 解析 `items[].job.params.prompt`，按块标题正则切分（`^Style:|^Lighting:|^Camera:` 等 12 块）。
- 统计：每块出现频率（%/条）、tier 分布（batch/refined 由 prompt 长度与结构推断）、Audio 形态（`{audio} only.` vs 完整 Audio 段）、lock 声明词表（"STORM"/"LOW-KEY"/"rule of thirds" 等）。
- 产出 `video_prompt_engine/knowledge/refined_blocks.json`：
```json
{
  "version": 1,
  "blocks": ["SCENE NOTE", "SPATIAL LAYOUT", "LIGHTING", "COLOR", "CAMERA",
             "ENVIRONMENT", "CONTINUITY", "CHARACTERS", "SKIN", "ACTING",
             "STILLNESS LOCK", "FINAL FRAME"],
  "coverage_threshold": 8,
  "lock_triggers": {
    "warm_light_leak": {"locks": ["cold", "cool palette", "冷色"], "forbidden": ["warm", "amber", "golden", "暖色"]},
    "dead_center": {"locks": ["rule of thirds", "golden ratio", "三分法"], "forbidden": ["center of frame", "dead center"]},
    "exposure_break": {"locks": ["low-key", "low light", "dark", "低光"], "forbidden": ["bright daylight", "overexposed", "high-key"]},
    "silhouette_break": {"locks": ["silhouette", "剪影"], "forbidden": ["well-lit face", "clear facial detail"]},
    "style_contamination": {"locks": ["photoreal", "写实"], "forbidden": ["anime", "cartoon", "3d render", "动漫"]},
    "skin_guard": {"locks": ["pore-level", "skin", "皮肤"], "forbidden": ["plastic skin", "waxy", "塑料"]},
    "eye_line": {"locks": ["eye-line", "eye line", "视线"], "forbidden": ["looking at camera", "breaking the fourth wall"]}
  }
}
```

## 2. 引擎功能逻辑

### 2.1 blocks 输出（P0-2）
- `VideoPromptMeta.blocks`：dict，键白名单 = 12 块名，值 ≤4000 字符；清洗 `_clean_blocks`（非法键丢弃、截断、空 dict → None）。
- refined Output Format JSON 增加：
```
"blocks": {
  "SCENE NOTE": "scene pickup & current state (required when prev_final_frame provided)",
  "SPATIAL LAYOUT": "...", "LIGHTING": "...", "COLOR": "...", "CAMERA": "...",
  "ENVIRONMENT": "...", "CONTINUITY": "...", "CHARACTERS": "...", "SKIN": "...",
  "ACTING": "...", "STILLNESS LOCK": "...", "FINAL FRAME": "..."
}
```
- `render()`：blocks 提供时按 12 块顺序拼单串（块标题大写 + 冒号 + 文本，块间空行）；缺失块从旧字段（final_frame/continuity_token/color_ratio 等）回退补位；未提供 blocks → 旧拼接逻辑（零回归）。
- FAIL CHECK 收尾块（refined 模板追加）：
```
## FAIL CHECK (MANDATORY self-audit before finalizing)
Before finalizing, verify each statement below; if any is FALSE, fix the prompt:
- The prompt reuses the previous shot end state (if prev_final_frame was provided).
- Every declared excluded/no-swap ban has its reference marker [ABSENT]/<<<...>>> in the text.
- Timeline markers [SHOT N]/[HARD CUT] exist at every shot boundary (shots >= 2).
- The trailer line is the exact last line (Photoreal. NON-IP. ...), nothing after it.
- No banned text/watermark/logo is described as present.
```

### 2.2 块覆盖度（P0-5）
- `evaluate()` refined 层：统计输出正文命中块数（标题大小写不敏感，正文含 `块名:` 或块内容特征）；`checks.block_coverage = {hit, total, ratio}`；ratio < N/12 → `violations["block_coverage"] = -5`（advisory）。
- 阈值 N 来自 refined_blocks.json（先 8，语料统计后校准）。

### 2.3 启发式 gated（P0-6）
- 7 条条件规则：每条 `{locks, forbidden}` 词表；仅当输出正文声明 lock 词时才检测 forbidden 词（命中即 `violations["<rule>"] = -5` advisory）。
- 默认 OFF：不进硬门槛（与既有 violations 同权相加但总分为 advisory 性质——不进 FAIL CHECK 硬性拒绝列表，仅影响择优排序）。
- 皮肤/视线高频失败项：额外走注入强化（refined 模板 Skin/Acting 段追加 `pore-level skin, natural texture — NEVER plastic/waxy` 与 `eye-line discipline — never look at camera` 指令）。

## 3. 数据校验

| 输入 | 规则 |
|---|---|
| blocks 非 dict | 丢弃 → None（零回归） |
| blocks 键不在 12 白名单 | 丢弃该键 |
| 块值非字符串 | 丢弃该键 |
| 块值 >4000 字符 | 截断 4000 |
| 全部块为空 | None |

## 4. 交互逻辑 / 显示项 / 提示文字

- 无 UI 变更；引擎侧无用户可见新文案。
- 流水线日志：覆盖度/gated 命中打 debug 级（`refined blocks covered 9/12`、`gated rule warm_light_leak hit`）。
- 契约 normalizeVideoMeta 仅回显 blocks（白名单 + 截断），不参与展示。

## 5. 兼容与回归

- blocks 缺省 → 旧渲染路径；覆盖度/gated 仅 refined 层启用（batch 零影响）；缓存盐 V4 一次性重建。
- 测试矩阵见 spec.md。
