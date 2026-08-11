# Review — story2video-scene-context（2026-08-11 双模型审查）

> 审查范围：`git diff origin/main...HEAD`（scene_context 中间层，665 插入/30 删除）。审查模型：Claude（codeagent-wrapper --backend claude）+ Codex（--backend codex，antigravity 后端本机 wrapper 不支持→按机制硬化降级为第二模型 codex，记录在案）。

## Claude 审查结论（SESSION 239be077）

| 级别 | 发现 | 处置 |
|---|---|---|
| Critical C1 | `normalizeSceneContextOptions` 只读 camelCase 布尔键，snake_case `include_negative_anchors` 端到端失效（false 被忽略） | ✅ 已修复：选项键 snake→camel 统一归一 + story 级负面锚点受 includeNegativeAnchors 门控 + 回归测试 |
| Warning W1 | CONTEXT_KEY_WHITELIST 仅在构造期成立，发送边界未强制 | ✅ 已修复：optimize 发送前对 context 白名单过滤 |
| Warning W2 | 单关键词时代误判（寺庙/宫殿/童话/战争→ancient）污染整篇 negative_prompt | ✅ 已修复：detectEra 返回 strong 标志（≥2 独立信号或朝代命中），全局负面锚点仅在 strong 时注入 + 回归测试 |
| Warning W3 | detectCulture 用 regions[0] 编造默认城市（伦敦） | ✅ 已修复：region 仅在关键词命中时赋值 + 回归测试 |
| Warning W4 | full_text 无上限且逐场景重复携带 | ✅ 已修复：MAX_FULL_TEXT_CHARS=2000 截断 + 回归测试 |
| Info I1 | enrichSceneWithContext 重复计算 block | ✅ 已修复：block 作为参数传入 buildPromptEngineSceneContext |
| Info I2/I4 | 测试缺口、单字「煮」误命中 | 记录；I4 部分已由回归测试覆盖 |

## Codex 审查结论（SESSION 019fef59）

| 级别 | 发现 | 处置 |
|---|---|---|
| Major M1 | includeNegativeAnchors=false 静默忽略（同 C1） | ✅ 同上修复 |
| Major M2 | region 编造 + 泛中国文案无条件西方负面锚点 | ✅ 已修复（W2/W3 修复覆盖：strong 门控 + region 空值） |
| Major M3 | CHANGELOG 同一条目重复 4 次（含历史遗留 # CHANGELOG 游离块） | ✅ 已修复：从 origin/main 恢复后清理历史重复 + 单份插入 |
| Warning W1 | 白名单发送边界不强制（同 Claude W1） | ✅ 已修复 |
| Warning W2 | detectVisualStyle 朝代风格整体覆盖文本显式风格 | ✅ 已修复：朝代风格 + 文本风格合并 |
| Warning W3 | full_text 无上限（同 Claude W4） | ✅ 已修复 |
| Info I1 | enabled=false 仍先输入校验 | ✅ 已修复：enabled 短路前置 |
| Info I2 | 重复计算 block（同 Claude I1） | ✅ 已修复 |
| Info I3 | spec.md「配置边界收敛」措辞与实现不符 | ✅ 已修复：spec 注明 text-config 拒绝 / 引擎收敛 |
| Info I4 | task.json 状态未推进 | ✅ 归档时更新 |
| Info I5 | 基线陈旧（5cdcd76d→7dd7f1ef） | ✅ quality-gates 记录更新 |

## 修复后验证

- 回归测试：story-context-engine +4（C1/W2/W3/W4）、既有 245 用例全绿。
- lint：改动文件 0 error。
- E2E：orchestrator 6/6 + full-pipeline 1/1（真实 8002 + 真实 ffmpeg 合成可解码视频）。
- 待办：push → PR → CI → 合并 → 三同步归档。
