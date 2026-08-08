# Batch 5a 双模型审查汇总（codex + claude）

## 结论：**通过**（无 Critical；W 级意见全部处理/显式排期）

- 审查对象：`.ccg/tasks/story2video-scene-duration-three-layer/review-batch5a.diff`（19 个文件，含 7 个新增模块/测试）
- 验证方式：双模型独立审查 + 实跑受影响 7 套件 275 用例、eslint 0 error、vite build、像素视觉回归 17/17、QM-1 打包

## codex 审查（review-batch5a-codex.log）

- Critical：无；结论「通过（PASS）」
- W1（normalizer 是第三份公式实现，合同测试未锁定）→ **已修**：合同测试补第三腿（zh/en/auto × 语速 4 档 × 秒数 4 档与 normalizer 等价断言，并暴露乘法顺序浮点差 1 → 已统一乘法顺序）
- W2（splitBaseWordsPerSecond 死字段）→ **已处理**：CreateView 标注兼容遗留字段，5b 清理
- Info：buildTtsSample 复用 normalizeSpeechSpeed（已修）、单次 getSetting（已修）、语言小写归一（已修）、自定义 clamp 合同断言（已修）、FIFO 非原子（记录 5b）

## claude 审查（review-batch5a-claude.log）

- Critical：无；结论「有条件通过」
- **W1（en 词/s vs 实现字/s 单位口径，英文估算偏小 ~5×）** → **显式排期进 5b**（PRD/CHANGELOG/task.json 记录：样本已存 chars+language，5b 校准必须处理 chars/words 比值或改 en 为字/s 口径）；默认 auto 行为不变，不阻塞合并（claude 明确允许）
- W2（min>max 反向 clamp 防御缺失）→ **已修**：两副本加 min>max 兜底 + 边界测试
- Info：FIFO 无锁（记录 5b）、resume 不重归一化（记录）、chars vs textLength 口径（记录 5b 校准）、preload bundle 行尾噪声（确认非内容变更）、speechRate 死字段（5b 清理）

## 关键验证证据

- 三腿等价：renderer ↔ 主进程 ↔ normalizer 在 zh/en/auto × 0.5/1/1.5/2 × 2/4/6/10s 全组合一致（含浮点乘法顺序修复）
- 默认零回归：auto→3.3 全链路不变；旧配置缺 language → auto → 3.3
- 样本契约：audioDuration（真实 TTS 时长）与视频 duration（补齐后）分离；FIFO ≤500、字段白名单、不存原文、探测失败跳过、fail-open 双层 try/catch
- executor 参数真实存在：normalizeStory2VideoTextParams 后 run.params 含 story2videoTextConfig
- 质量门禁：vite build 通过、像素 17/17、QM-1 打包（asar 含新模块、require 链 OK、启动 8s 无 stderr 错误）
