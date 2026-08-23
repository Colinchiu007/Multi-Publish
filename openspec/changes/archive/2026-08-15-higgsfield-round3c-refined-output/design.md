# Design — Higgsfield round3c refined 输出形态升级（块骨架 + 覆盖度 + 启发式 gated）

> 本设计按 Claude 双模型评审（2026-08-15）修订：覆盖度改为「引擎自渲染口径」（分母 = meta.blocks 非空块数，与语料脱节问题解耦），gated 规则全部过否定感知、默认仅启用 3 条低误报规则，style_contamination 弃 photoreal 锁词，FAIL CHECK 注明仅模板侧并兼容 CUT N，render 逐块去内嵌尾行防 C6 误剥。

## 1. 语料统计（前置）

`scripts/analyze_hg_corpus.py`（prompt-engine 仓库，只读 `D:\Temp\hg-corpus\*.json`）：
- 解析 `items[].job.params.prompt`，**分族统计**（评审 Critical-1/2 修复）：🔥 导演族（SCENE NOTE/STILLNESS LOCK 等 12 块，20-26KB 长提示）与内联冒号族（`Lighting:/Color:/Camera:` 行首冒号，1-7KB）分开统计，避免一族形态污染另一族分母。
- **统一检测正则**（评审 Info 修复）：块标题形态固定为「行首大写标题 + 冒号」（`^SCENE NOTE:`、`^SPATIAL LAYOUT:` …）；统计脚本、引擎渲染、evaluator 判定三处同源，杜绝形态漂移。
- 统计每块出现频率、tier 分布、Audio 形态、lock 声明词表（否定词出现率，校准否定感知）。
- 产出 `video_prompt_engine/knowledge/refined_blocks.json`：
```json
{
  "version": 2,
  "blocks": ["SCENE NOTE", "SPATIAL LAYOUT", "LIGHTING", "COLOR", "CAMERA",
             "ENVIRONMENT", "CONTINUITY", "CHARACTERS", "SKIN", "ACTING",
             "STILLNESS LOCK", "FINAL FRAME"],
  "block_pattern": "^([A-Z][A-Z ]+):\\s*",
  "coverage": {"min_blocks": 10, "min_ratio": 0.8},
  "enabled_rules": ["dead_center", "exposure_break", "eye_line"],
  "lock_triggers": {
    "warm_light_leak": {"locks": ["cold", "cool palette", "冷色"], "forbidden": ["warm", "amber", "golden", "暖色"]},
    "dead_center": {"locks": ["rule of thirds", "golden ratio", "三分法"], "forbidden": ["center of frame", "dead center"]},
    "exposure_break": {"locks": ["low-key", "low light", "dark", "低光"], "forbidden": ["bright daylight", "overexposed", "high-key"]},
    "silhouette_break": {"locks": ["silhouette", "剪影"], "forbidden": ["well-lit face", "clear facial detail"]},
    "style_contamination": {"locks": ["hyper-realistic", "photorealistic detail", "写实"], "forbidden": ["anime", "cartoon", "3d render", "动漫"]},
    "skin_guard": {"locks": ["pore-level", "skin", "皮肤"], "forbidden": ["plastic skin", "waxy", "塑料"]},
    "eye_line": {"locks": ["eye-line", "eye line", "视线"], "forbidden": ["looking at camera", "breaking the fourth wall"]}
  }
}
```
- 修订要点（评审 Critical-3 / Warning-2 修复）：
  - `style_contamination` 锁词弃 `photoreal`（refined 尾行恒含 "Photoreal."，锁常开必误报），改为 `hyper-realistic` / `photorealistic detail` / `写实`。
  - **否定感知**：所有 forbidden 命中前先查否定前缀（`no X` / `not X` / `without X` / `无 X` / `不 X`），否定形态不计命中（语料 49.6% 是 "No 3D render" 禁令，纯子串误报 ≈100%）。
  - **默认启用 3 条低误报规则**（dead_center/exposure_break/eye_line，语料误报低）；warm_light_leak/style_contamination/silhouette_break/skin_guard 默认 OFF（`enabled_rules` 控制，供实验开启）。

## 2. 引擎功能逻辑

### 2.1 blocks 输出（P0-2）
- `VideoPromptMeta.blocks`：dict，键白名单 = 12 块名，值 ≤4000 字符；清洗 `_clean_blocks`（非法键丢弃、值非字符串丢弃、截断、空 dict → None）。
- refined Output Format JSON 增加 `blocks` 键（12 块说明，SCENE NOTE 注明「prev_final_frame 提供时承接上一镜终态」）。
- **render 骨架化（blocks 优先）**：blocks 提供时按 12 块顺序拼单串（行首 `块名:` + 文本，块间空行）；缺失块从旧字段（final_frame/continuity_token/color_ratio 等）回退补位；未提供 blocks → 旧拼接逻辑（零回归）。
- **逐块去内嵌尾行（评审 Warning-5 修复）**：render 时每个块值先剥离内嵌尾行形态（`Photoreal NON-IP ... only.` / Audio 段），防止超预算截断时 C6 正则从「中段 Photoreal NON-IP」误剥到串尾丢块；C6 剥离只作用于真正末行。
- FAIL CHECK 收尾自审段（refined 模板追加；**仅模板侧指令，绝不进入渲染输出串**——评审 Info 命名歧义澄清）：
```
## FAIL CHECK (MANDATORY self-audit before finalizing)
Before finalizing, verify each statement below; if any is FALSE, fix the prompt:
- The prompt reuses the previous shot end state (if prev_final_frame was provided).
- Every declared excluded/no-swap ban has its reference marker [ABSENT]/<<<...>>> in the text.
- Timeline markers ([SHOT N] / [HARD CUT] / CUT N) exist at every shot boundary (shots >= 2).
- The trailer line is the exact last line (Photoreal. NON-IP. ...), nothing after it.
- No banned text/watermark/logo is described as present.
```
（评审 Warning-1：前 3 条与 evaluator/契约硬判据双保险而非替代；timeline 判定已兼容 CUT N。）

### 2.2 块覆盖度（P0-5，评审 Critical-2 修复）
- `evaluate()` refined 层：分母 = `meta.blocks` 非空块数（引擎自渲染口径，与语料分族统计解耦，杜绝「语料众数 8/12 卡阈值」误报）；分子 = 渲染串中实际命中块标记数（统一正则，行首标题+冒号）。
- `checks.block_coverage = {hit, total, ratio}`；WHEN total ≥ 1 AND ratio < 0.8（缺失 >2 块）THEN `violations["block_coverage"] = -5`（advisory）。
- 覆盖度同时是 C6 截断误剥的哨兵：渲染串被截断丢块 → ratio 下降 → 扣分（测试覆盖该交互）。
- WHEN tier=batch THEN 不启用（`checks.block_coverage = None`）。

### 2.3 启发式 gated（P0-6，评审修订）
- 7 条条件规则：每条 `{locks, forbidden}` 词表；仅当输出正文声明 lock 词时才检测 forbidden 词（**全部过否定感知**），命中即 `violations["<rule>"] = -5` advisory。
- 默认仅 `enabled_rules`（3 条低误报）生效；其余规则存于 refined_blocks.json，`enabled_rules` 列表控制开关（默认 OFF 不进硬门槛）。
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
- 流水线日志：覆盖度/gated 命中打 debug 级（`refined blocks covered {hit}/{total}`、`gated rule {rule} hit`）。
- 契约 normalizeVideoMeta 仅回显 blocks（白名单 + 截断），不参与展示。

## 5. 兼容与回归

- blocks 缺省 → 旧渲染路径；覆盖度/gated 仅 refined 层启用（batch 零影响）。
- 缓存盐 V4：与 round3b 同批发布，一次失效重建（V2→V4）。
- 渲染串形态变化（块式 vs 旧自由文本）：refined 层输出结构变更，evaluator 长度/timeline/音频判定全部兼容（判据基于正文而非形态）。
- 测试矩阵见 spec.md。