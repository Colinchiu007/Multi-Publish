# 双模型审查报告 — fix-s2v-resume-error-message

## 变更概述
Story2Video 断点恢复失败时，后端 resumeOrchestration 返回 errorCode（RUN_SNAPSHOT_NOT_FOUND / RUN_NOT_FAILED / RUN_NOT_ORCHESTRATOR / STAGE_NOT_FOUND / PIPELINE_USER_INPUT_REQUIRED），前端 resolveMessageKey 之前不认识这些错误码，回退到 operation_failed 兜底吞掉真实原因。本次修复让 resolveMessageKey 映射这些错误码到具体文案（zh/en 成对），并新增回归测试。

## 审查方式
- Claude 后端：已完成（codeagent-wrapper --backend claude，reviewer 角色）
- opencode 后端：降级（opencode 模型 deepseek-v4-flash 每周用量配额耗尽，AI_APICallError: Weekly usage limit reached，无法完成审查）
- 主代理人工复核：后端错误码契约、前端调用链、locale 成对、测试覆盖逐项核验

## Claude 审查结论
无 Critical 问题。错误码映射正确，locale 成对。提出两个 Warning（测试覆盖建议）：
1. PIPELINE_USER_INPUT_REQUIRED 映射缺少测试覆盖 → 已补齐
2. 剩余 3 个恢复错误码（RUN_NOT_FAILED / RUN_NOT_ORCHESTRATOR / STAGE_NOT_FOUND）英文 locale 测试覆盖不足 → 已补齐

## 主代理复核结论
- 后端 resumeOrchestration（pipeline-engine.js:1455-1492）确实返回上述 5 个 errorCode，映射完整无遗漏
- 前端 resumeHistoryItem else 分支（CreateView.vue:5595）把 res.data.errorCode 传给 showStory2VideoErrorDialog → resolveStory2VideoNotification → resolveMessageKey，修复链路生效
- zh.js/en.js locale 成对（check-locale-sync --cjk / --pair-base origin/main 均 PASS）
- 测试：story2video-notifications.test.js 54 个全部通过；CreateView.test.js 断点恢复相关 5 个测试通过

## 结论
PASS（无 Critical，Warning 已全部处理）