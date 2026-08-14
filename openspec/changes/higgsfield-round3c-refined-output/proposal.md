## Why

v3.0 报告 P0-2/P0-5/P0-6：语料精修层实证骨架为「导演分镜单」（SCENE NOTE → SPATIAL LAYOUT → LIGHTING → COLOR → CAMERA → ENVIRONMENT → CONTINUITY → CHARACTERS → SKIN → ACTING → STILLNESS LOCK → FINAL FRAME，Scene_74/Orphanage/15-16 中位 21-27KB），而当前 refined 输出是「字段拼接」形态；评测侧缺块覆盖度；7 条预防注入型判据（曝光/剪影/死中心/暖色泄漏/风格污染/皮肤/视线）是条件规则，未自动化。

- **P0-2**：refined 的 Output Format JSON 增加 `blocks`（块名 → 文本），渲染单串按语料骨架顺序组织；FAIL CHECK 收尾块（if-then 自审段）加入 refined 模板。
- **P0-5**：evaluator 增加「块覆盖度」检查（refined 输出应覆盖 ≥N 块，阈值用语料统计定）。
- **P0-6**：启发式 gated 条件扣分——仅当声明 lock 时启用（冷色锁 → 暖色泄漏检测；构图 rule-of-thirds → 死中心检测；低光锁 → 高曝光检测），默认 OFF、advisory（-5 起，不进硬门槛）；高频失败项（皮肤 44%/视线 60%）走注入强化而非后验扣分。

## What Changes

### 语料资产（prompt-engine 仓库 scripts/）
- 新增 `scripts/analyze_hg_corpus.py`：统计 `D:\Temp\hg-corpus\*.json` 块频率 / tier 分布 / Audio 形态；产出 `video_prompt_engine/knowledge/refined_blocks.json`（12 块清单 + 覆盖阈值 N + lock 词表）。
- 阈值：语料先验，误报率 <5% 目标（先定 N=8，统计后校准）。

### 引擎（prompt-engine）
- `models.py`：`VideoPromptMeta` 新增 `blocks: Optional[dict]`（块名 → 文本，键白名单 12 块，各块 ≤4000 字符）。
- `strategies/base.py`：
  - refined 模板 Output Format 增加 `blocks` 字段说明 + 骨架顺序指令（12 块按语料顺序渲染单串）；
  - FAIL CHECK 收尾块（if-then 自审段）加入 refined 模板；
  - 皮肤/视线注入强化指令（高频失败项预防注入）。
  - `extract_video_meta` 清洗 blocks（键白名单 + 截断）；`render` 优先按 blocks 骨架顺序拼单串（缺失块从旧字段回退拼接）。
- `evaluator.py`：
  - `block_coverage` 检查（refined：命中块数 / 12 ≥ N，violations["block_coverage"] = -5 advisory）；
  - 启发式 gated 条件规则（warm_light_leak / dead_center / exposure_break / silhouette / style_contamination / skin_guard / eye_line，仅声明 lock 时启用，-5 advisory，默认 OFF）。
- 缓存盐 `HIGGSFIELD_FMT_V3 → V4`（输出格式变化）。
- 测试：blocks 清洗/渲染/回退、覆盖度正反例、gated 规则启用与默认关闭、盐 V4。

### 契约（Multi-Publish）
- `normalizeVideoMeta` 支持 `blocks` 可选回显（键白名单 + 截断，向后兼容）；其余不改。

## Capabilities

### New Capabilities
- `prompt-engine`：refined 导演分镜单输出（blocks 骨架 + FAIL CHECK 自审）+ 块覆盖度评分 + lock-gated 启发式扣分（默认 OFF advisory）。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：prompt-engine `models.py` / `strategies/base.py` / `strategies/generic_video.py` / `evaluator.py` / `optimizer.py`（盐）+ `scripts/analyze_hg_corpus.py` + `knowledge/refined_blocks.json` + 测试；Multi-Publish `video-prompt-engine-contract.js`（normalizeVideoMeta）+ 测试。
- 缓存：视频缓存盐 V4，旧缓存失效重建。
- 兼容性：`blocks` 缺省时渲染回退旧字段拼接（零回归）；覆盖度/gated 均 advisory，不进硬门槛。
- 文档：CHANGELOG、learnings、v3.0 报告落地状态、PRD 补充。
