# Higgsfield P0 引擎侧落地 — 双模型评审记录（两轮）

## 第一轮（Claude + codex，antigravity 降级）

### Critical
- **C1 引用协议缺口**：引擎声明 excluded/no_swap_pairs 但正文无 [ABSENT]/<<< 标记 → 契约 _assertReferenceProtocol fail-closed 拒绝。
  → 修复：`build_higgsfield_section`（refined+batch）加标记指令；evaluator 剥离标记防自罚分；契约 `_normalizeNoSwapPairs` 双形态兼容（对象 {from,to} → 规范二元组），使 no_swap_pairs 声明真实生效。T8 + 契约测试。

### Warning（已修复）
- W1 `_clean_aspect` 放行 12 字符 `1920:1080:24` → 限长 ≤10 回退 16:9（T5）
- W2 refined en 上界 `max_length//6` 与 5000 字符脱节 → 下界随预算缩放 `min(500, max(150, max_length//6))`、上界 `max(500, max_length//5)`，消除小预算坍缩
- W4 explicit "batch" 不压过 auto-detect → detect_tier explicit 非空直接返回，auto-detect 仅 None 兜底
- W8 generic "150-300 词" 与 refined "500+" 冲突 → 长度口径 tier 化（提示词 + zh 语言段）

### 次要（已修复）
- I2 文档残留 200-4000 → 5000（test docstring + ARCH/PRD）
- T4 swap/excluded 上限截断、T6 refined 非 JSON 回退、T7 小写 non-ip 幂等、T9 zh refined 500 下界

## 第二轮（Claude + codex 并行复审，聚焦修复项）

### Critical（新引入，两模型一致）
- **C1' 标记剥离过度**：`[ABSENT]\s*[^.\]]*` 吞掉标记后同句真实正文 → 真实违规可被隐藏。
  → 修复：只剥标记 + 紧邻一个词（`\[ABSENT\]\s*\S+`、`<<<\s*\S+`、闭合 `<<<.*?>>>` 整段）；补"标记同句真实出现仍扣分"用例。

### Warning（已修复）
- W2/3 no_swap_pairs 双形态：evaluator 遇 `[from,to]` 二元组 AttributeError → 双形态读 from 侧 + 类型防御；`_clean_swap_pairs` 接受二元组输入且仅收字符串（数字丢弃，对齐契约）
- W4/7 refined 小预算坍缩 [500,500]：下界随预算缩放（见上 W2 处置）
- W5 C6 截断正则漏 `Photoreal` 缺句点变体 → 正则容错 `Photoreal\.?\s+NON-IP\.?`；真 optimizer 路径超长截断 E2E 测试闭合（test_w5_*）
- W6 真路径零覆盖 + W6 回退无测试 → test_w5_real_optimizer_truncation_path / test_w6_meta_validation_fallback
- W6' 契约幂等判据 `/non-ip/i` 子串 → 词边界 `(?<![A-Za-z0-9])non-ip`（xenon-ip 不误判）
- W7 契约 batch 默认 500 与引擎 1800 失配 → 8020 常规层默认 1800（8013 保持 500）；spec R6 同步
- I4 duration 取整漂移 → 契约 appendVideoTrailer `Math.floor` 对齐引擎 `int()`（5.5 → 5s）
- 契约 spec 残留 8020→4000 → 5000（3 处）

### Info（接受，不修）
- auto-detect 裸子串 NON-IP（optimizer 恒显式，不可达）；refined missing_audio 防御性存在（audio 默认 SFX）；batch 音频否定词优先（语义决策）；select_best 半死代码（保留供测试）

## 测试与门禁
- 引擎：`tests/test_higgsfield_p0.py` 40 项 + 全量 575+ passed（仅 test_resources_preview 基线例外：8013 rag_cases=0，与本 change 无关）
- 契约：video-prompt-engine-contract 85 + prompt-engine-kernel 13 = 98 passed
- 提交前门禁：双模型复审通过（Critical 已闭环），无遗留 Critical

## 结论
两轮评审闭环，Critical 全部修复并有回归测试；建议合入后按 openspec 4.4 a-d 归档。
