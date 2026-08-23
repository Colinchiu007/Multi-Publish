# 实施计划

## 阶段 1：基线审计
- 核对 worktree、分支、已合并 PR（d2b1b31dc / a964c545d）与运行日志。
- 记录 Write Guard 环境例外（计划任务未运行，历史 quarantine/violations 不清理）。

## 阶段 2：规格落地
- 补齐 CCG task、OpenSpec change、PRD、learnings 落点。

## 阶段 3：测试先行
- provider-run-context 单测：provider 维度、quota 分类、voice 去重。
- provider-error quota 变体单测。
- callAdapter 四参数兼容与熔断单测。
- queue skipped / voice clone 去重 / resume 恢复回归。

## 阶段 4：实现
- `provider-run-context.js`：ProviderRunContext / ProviderCircuitOpenError / voice coordinator。
- `provider-error.js`：Token Plan、usage limit、嵌套结构分类增强。
- `model-provider-manager.js`：callAdapter 可选 runtime options，quota 自动 open。
- `ai-generator.js` / `asset-generator.js`：runtimeOptions 透传。
- `service-bus.js` / `prompt-bridge.js`：LLM 优化链路熔断与禁止 CLI/quota fallback。
- `story2video-stages.js` / `videogen-stages.js`：队列 shouldStart、音色去重、直接 manager 调用接入。

## 阶段 5：验证
- 定向 Vitest（新增 + 受影响）；node --check；git diff --check；verify-worktree-deps。
- Electron 打包/ASAR/启动冒烟。
- 双模型（opencode + Claude）审查。

## 阶段 6：发布与归档
- commit、push、PR、等 CI 全绿后合并。
- openspec validate/archive、CCG task 归档、learnings 三同步。
