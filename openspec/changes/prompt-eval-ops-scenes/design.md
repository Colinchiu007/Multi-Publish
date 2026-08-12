# Design — prompt-eval-ops-scenes

> 配套 PRD：ops-center/docs/PRD.md §12A.22.16-21

## 方案选型

| 决策点 | 方案 |
|--------|------|
| 分句实现 | ops-center 后端 Python 分句服务（场景级 + 字幕级 + proportional 时间线），语义对齐 text-segmentation.ts；生产不依赖 node |
| 一致性验证 | pytest 内用 esbuild 将桌面端 text-segmentation.ts 打包为单文件 mjs，node 执行同一输入，断言 Python 输出（scenes/subtitles/timeline）与 TS 对照一致 |
| 场景上下文 | Python 规则实现（白名单键），对齐 story-context-engine.js 语义；提取异常标记 degraded 不降级 |
| 数据模型 | scenes 独立表 + source_mode + runs.scene_id（向后兼容 manual 模式） |
| 中英优化提示词 | 复用 12A.22 翻译服务：LLM 按「整篇原文+场景文字+场景上下文」生成 prompt_zh 并翻译 prompt_en（machine_translation） |

## 关键设计

1. **分句核心算法（Python 复刻）**：句子边界消歧（中英文标点 + 空白归一）→ 场景级分组（按 target_chars_per_scene 预算合并句子）→ 字幕分块（min/max 字符 + 标点优先级，proportional 时间线）；主路径行为与 TS 对照测试一致（覆盖普通中文文案/多标点/短场景/8-15 字字幕）。
2. **一致性测试**：`tests/test_prompt_eval_segmentation_consistency.py` 用 esbuild 打包 `text-segmentation.ts` → node 执行 `splitTextToScenes/splitTextToSubtitles/buildSubtitleTimelineV2` → 与 Python 输出逐项断言。
3. **scene 模式状态机**：POST /cases(scene) 同步分句建 scenes（幂等：同 case 重新分句先删旧 scenes）→ 每场景 translate/runs 复用生成→评估状态机。
4. **fail closed**：原文/分句配置校验、分句失败 500 可操作错误、场景数上限 50、scene 模式 provider 密钥必须已配置。
