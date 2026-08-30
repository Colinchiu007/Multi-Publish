# ARCH — Story2Video 场景上下文：现代信号中和（朝代误判优化）

> 版本：2026-08-30 · 关联：ARCH-STORY2VIDEO-SCENE-CONTEXT-2026-08-11.md（场景上下文架构）、PR #1231（成语守卫修复）

## 1. 背景

`story-context-engine.js` 的 `scene_context` 阶段读全文提取全局故事上下文。上一轮（PR #1231）修复了成语"事后诸葛亮"被误判为三国人物的问题。但存在一个**更普遍的结构性缺陷**：

**现代题材全文只要出现一个朝代关键词（如"秦始皇""诸葛亮"），无论它是主题、举例、引用还是背景提及，整篇都会被判定为属于该朝代**（`era=ancient, strong:true`），并注入朝代视觉风格 + 全量古代负面锚点，污染所有场景。

## 2. 现状分析（基线审计）

| 场景 | 当前行为 | 是否合理 |
|------|---------|---------|
| 纯现代题材 | `era: modern, strong:true`，朝代 null | ✅ |
| 现代为主 + 历史引用（"比如秦始皇..."） | **误判 `era: ancient, strong:true` + 朝代** | ❌ |
| 纯历史题材 | `era: ancient, strong:true` + 朝代 | ✅ |
| 现代为主 + 少量古代词（无朝代名） | `era: mixed, strong:false` | ✅ |

### 根因（两处叠加）

1. **`detectDynasty`（line 389-411）**：只取第一个命中的朝代（`filtered[0]`），**不区分**关键词是"主题"还是"举例/引用/背景"，也不看全文是否有现代信号中和。

2. **`detectEra`（line 595）**：`if (dynasty) return { era: dynasty.era, strong: true }` —— **朝代存在即一票否决**，era 强制 ancient strong，且**根本不计算 modernCount**，现代信号完全被忽略。

## 3. 优化方案（方案 B + A 组合）

### 方案 B：`detectDynasty` 增加现代信号降级

当全文现代信号 ≥2 时，朝代关键词视为"引用/背景"而非"主题"，`detectDynasty` 返回 null（不污染全局朝代/era/视觉风格）。

### 方案 A：`detectEra` 增加现代信号中和

朝代存在时，若全文现代信号 ≥2，era 降级为 `mixed, strong:false`（不注入时代负面锚点）。

### 关键设计

- **现代信号定义**：复用现有 `modernTerms` 词表（手机/电脑/互联网/微信/抖音/地铁/高铁/飞机/汽车/人工智能/外卖/快递/电商/写字楼/电烤箱/微波炉/冰箱），提升为模块级常量 `MODERN_TERMS`。
- **阈值**：≥2 个独立现代信号才触发降级（与 `detectEra` 的 strong 判定一致，避免单信号误伤）。
- **朝代信号占比兜底**：若朝代关键词命中数 ≥ 现代信号数，仍判定为真实历史题材（防"穿越剧""历史题材+现代叙事"被误伤）。

### 边界分析

| 场景 | 现代信号 | 朝代命中 | 判定 |
|------|---------|---------|------|
| 现代 + 历史引用（"比如秦始皇"） | ≥2 | 1 | 降级 → mixed |
| 纯历史（"唐玄宗时期..."） | 0 | ≥1 | 保留 → ancient |
| 穿越剧（"现代人穿越到唐朝"） | ≥2 | ≥2（朝代命中≥现代） | 保留 → ancient |
| 历史题材 + 现代叙事手法 | 少量 | ≥2 | 保留 → ancient |

## 4. 变更文件清单

| 文件 | 变更类型 |
|---|---|
| apps/desktop/electron/services/story-context-engine.js | 修改（MODERN_TERMS 提升 + detectDynasty/detectEra 现代信号中和） |
| apps/desktop/electron/services/story-context-engine.test.js | 修改（新增现代+历史引用回归测试） |
| 01-docs/learnings.md / AGENTS.md / CHANGELOG.md / .quality-gates.md | 修改（预防措施） |

## 5. 测试策略

| 层 | 文件 | 覆盖 |
|---|---|---|
| 单元 | story-context-engine.test.js | 现代+历史引用不误判朝代、纯历史仍识别、穿越剧不误伤、纯现代不受影响 |
| 集成 | story2video-stages.test.js | scene_context 阶段在现代+历史引用场景下 era 正确 |

## 6. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 误伤真实历史题材 | 朝代命中 ≥ 现代信号时保留；阈值 ≥2 防单信号误伤 |
| 现代词表覆盖不足 | 复用现有 modernTerms，后续可扩展 |
| 与成语守卫交互 | 成语守卫先剔除误命中，现代信号中和再降级引用，两层独立 |