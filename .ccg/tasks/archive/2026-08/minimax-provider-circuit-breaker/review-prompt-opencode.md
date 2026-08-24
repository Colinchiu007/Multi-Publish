ROLE_FILE: C:/Users/邱领/.claude/.ccg/prompts/opencode/reviewer.md

<TASK>
审查 D:/Data/projects/mp-worktrees/mp-minimax-provider-circuit-breaker 分支 codex/minimax-provider-circuit-breaker 的当前未提交 diff（git diff HEAD），并阅读工作区源码。

目标需求：
1. 同一次流水线运行内，同一个 (providerId, voiceId) 失效音色只重克隆一次，并发共享 Promise/结果。
2. provider 返回余额/Token Plan/usage limit/用量上限等额度错误后，立即按 provider 维度打开运行级熔断，阻止本运行内图片、TTS、LLM、视频和 cloneVoice 的未启动调用。
3. 队列 worker 领取下一项前检查 breaker，剩余项返回失败/skipped，不调用上游；已在途请求自然收尾。
4. 不破坏 resume.completed / finalize_assets.partialTts 断点恢复；breaker 不持久化。
5. 所有 provider/model 通用，不做 MiniMax 特判。

重点检查：
- apps/desktop/electron/services/provider-run-context.js（新增）
- apps/desktop/electron/services/adapters/_base/provider-error.js
- apps/desktop/electron/services/model-provider-manager.js
- apps/desktop/electron/services/ai-generator.js / asset-generator.js / service-bus.js / prompt-bridge.js
- apps/desktop/electron/services/story2video-stages.js / videogen-stages.js

请按 Critical / Warning / Info 分级输出，给出 file:line 和具体修复建议；重点验证是否有遗漏的 provider 调用链、是否把 runtime 控制对象混入 adapter params/Python payload、断点恢复是否被破坏、并发音色克隆是否真的只调用一次。
</TASK>
OUTPUT: Critical/Warning/Info 分级审查报告
