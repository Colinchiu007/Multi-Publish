# Batch 5b 双模型审查汇总（codex + claude）

## 结论：**通过**（无 Critical；W 级意见全部处理）

- 审查对象：`.ccg/tasks/story2video-scene-duration-three-layer/review-batch5b.diff`（9 个文件）
- 验证方式：双模型独立审查 + 实跑受影响 7 套件 284 用例、eslint 0 error、vite build、像素视觉回归 17/17

## codex 审查（review-batch5b-codex.log）

- Critical：无；结论「通过」
- W1（global 跨语言混池反噬）→ **已修**：移除 global 桶（校准仅按 语言/语言+provider/语言+provider+voiceId 维度，查询语言无样本回退静态 1）
- W2（预估字数含空白 vs 切分器归一化计数不一致）→ **已修**：预估总字数改用空白折叠计数（countSceneChars，与样本/切分器同口径）
- W3（测试 mock 实现泄漏）→ **已修**：UI interactions describe 加 beforeEach mockReset storeGetSetting + 默认 null
- W4（边界缺口）→ **已修**：补 ratio 越界/90 天过期/未来样本过滤测试、精确区间 [1,3]、clamp 上下界、recordedAt 缺失、直接数组形态、样本<3 静态、非 S2V 无行

## claude 审查（review-batch5b-claude.log）

- Critical：无；结论「通过（建议处理 W2/W3 后合入）」
- W1（global 跨语言污染）→ 与 codex W1 同一问题，**已修**（移除 global）
- W2（en 空格偏置：样本去空白 vs 预估输入含空白）→ **部分处理**：预估总字数改空白折叠口径；每分镜 target 输入的 en 空格偏置记录为已知限制（PRD 已知限制段 + 显示层 ±20% 内）
- W3（calibrated 语义过宽）→ **已修**：仅当当前配置实际命中 >1 的校准维度才标注“按本地 TTS 样本校准”
- Minor：死状态已删；auto 语言样本混桶限制 → PRD 已知限制段；其余记录

## 关键验证证据

- 校准：维度特异性链（voiceId>provider>language>1）、中位数抗噪、90 天窗口 + 未来样本过滤、ratio 0..20 过滤、en 词/s 口径由校准比吸收（en 系数 ≈5）
- 预估：整数秒 + clamp 1..60、区间 ±15%、分镜数 ceil、成本默认单价可覆盖
- 回归：无样本 → 与 5a 静态完全一致；仅 story2video-compose 显示预估行；校准不改变切分/成片
- 质量门禁：vite build 通过、像素 17/17、eslint 0 error
