# 审查报告：视频流水线弹窗统一【后台运行】按钮 + 全局居中提示

日期：2026-09-13 | 审查范围：e5efb251..130eb48a（13 文件，+390/-4）

> 双模型审查降级说明：codeagent-wrapper opencode/claude 后端本次会话输出被吞
>（opencode 只回确认语、claude 会话跑到其他 worktree），按 AGENTS.md 机制硬化规则
>「后端不可用立即降级为主代理直接执行」，由主代理完成系统性审查。

## Critical：无

## Warning

1. **[W1] HotTopics 右上角 × 不触发全局居中提示**（设计决策，非缺陷）
   - 位置：HotTopics.vue handleGenVideoClose
   - 说明：× 走 handleGenVideoClose（含 notifyInfo 顶部 toast），按钮走 detachGenVideoToBackground（handleGenVideoClose + 居中提示）。两条路径提示不同是有意的：× 是隐式路径已有顶部 toast，按钮是显式主入口配居中提示；两者都触发会重复。
   - 决策：保持现状。PRD §6.6 已记录该差异。

2. **[W2] CreateView 右上角 × 也会触发居中提示**（与 HotTopics × 行为不对称）
   - 位置：CreateView.vue handlePipelineProgressClose → detachPipelineToBackground → showPipelineBackgroundToast
   - 说明：CreateView 的 × 显式调 detachPipelineToBackground（与按钮同方法），因此 × 也出居中提示；HotTopics 的 × 不出。跨视图 × 行为有轻微不对称。
   - 评估：CreateView 的 × 本来就等价于后台运行按钮（UI 有 progressCloseLabel「关闭进度并转入后台运行」提示），行为一致合理；HotTopics × 有自己的顶部 toast。可接受，不阻塞。

## Info

1. **[I1] 正确性**：按钮显示条件 genVideoCanBackground = running && runId 正确（改写/启动/终态/已脱离均不显示）；点击后 phase='background'、busy 保持、pipelineCancelRun 不被调用——脱离语义与 CreateView 一致；入口重校验防终态竞态（spec 前端规则 2）。
2. **[I2] 竞态**：重复点击安全——第一次点击后 modalOpen=false 按钮卸载；即使双击竞态，第二次入口重校验 genVideoCanBackground（phase 已是 background）直接 return。store 的 show 重复触发重置计时器，不叠加。
3. **[I3] 定时器管理**：模块级 hideTimer 在 show 重置、hide 清除；4s 自动消失。组件卸载不影响（store 是全局单例，定时器到点自然清理）；无内存泄漏（单 timer + 单 boolean ref）。
4. **[I4] i18n**：common.pipelineBackgroundToast + hotTopics.genVideoBackgroundRun zh/en 成对（--pair-base PASS）；组件 key 未命中回退空串不泄漏（--cjk PASS 无新增硬编码；--keys PASS 889 key 存在）。
5. **[I5] 安全**：文案经 {{ }} 插值（Vue 转义），无 v-html，无 XSS；无敏感信息；pointer-events:none 不阻挡交互。
6. **[I6] 一致性**：与 CreateView detach 语义一致（脱离不取消、run 后台继续、busy 守卫、历史记录可查）；z-index 2100 > UiModal 2000，弹窗关闭瞬间提示仍可见。
7. **[I7] 测试**：+7 回归（HotTopics 按钮渲染/点击脱离/隐藏态 3 例；store 状态机 3 例；组件渲染 2 例），305 全绿；rebase origin/main 后复跑通过。

## 结论

**PASS**。无 Critical；W1/W2 为有意的设计决策且已记录 PRD；建议后续如需完全对称可将 HotTopics × 也加居中提示（一行改动），当前不阻塞合并。
