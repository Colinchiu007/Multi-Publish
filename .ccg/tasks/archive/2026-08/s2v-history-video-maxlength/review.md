# CCG Review — s2v-history-video-maxlength（历史重生成视频优化词长度放宽）

日期：2026-08-16。范围：codex/s2v-history-video-maxlength vs origin/main（基线 8761d87e），共 5 文件 +60/-4；openspec change s2v-history-video-maxlength。

## 审查方式与降级记录

- 双模型强制（CCG 铁律 M+）→ 本次实际结果：**antigravity 不可用（合规拒绝：Your current account is not eligible for Antigravity... not currently available in your location，agy 直连探测证据）；claude 后端依赖本地代理 127.0.0.1:15721（~/.claude/settings.json ANTHROPIC_BASE_URL），探测时端口未监听、CLI 60s 无输出硬挂、wrapper 快速 exit 1**。两后端均无法在本会话完成审查。
- 按任务既有降级通道（.quality-gates 降级记录 + AGENTS 子代理降级规则）**降级为主代理（lead agent）直接审查**，并保留上述一手证据；不虚构外部模型结论。后续任一半后端恢复可用时应补跑并将报告追加到本文件。

## 审查结论

**PASS（无 Critical；2 条 Warning 均已在本次一并处理/记录为后续项）**

### Critical 🔴
无。

### Warning 🟡

1. **[openspec] Capability 措辞过宽** — proposal.md/specs 的 New Capability 描述「Story2Video 域各入口显式携带视频域上限」与实际实现范围不一致：本次只改了历史重生成入口（egenerateScenePrompt kind=video，显式 20000）；流水线 stage（story2video-stages.js:1312）仍依赖 ideoConfig.optimize（text-config 默认 optimize.maxLength=2000，story2video-text-config.js:363）。→ 处理：已把 capability 文案收紧为「历史重生成视频优化词入口显式携带视频域上限」，并在 Impact 注明流水线 stage 经文本配置默认 2000 不变。
2. **[service] 视频重生成路径复用图片域提取器** — story2video-project-service.js:1117 xtractOptimizedPrompt(optimized) 处理 video 结果，未走 xtractOptimizedVideoPrompt：导演工作流结构完整性校验（<<</[ABSENT] 标记）与 video meta 归一化在重生成路径被跳过。属既有行为、非本次引入，且该路径只落 ideoPrompt 不消费 video meta → 不阻塞合入；建议后续（如重生成接入导演分镜块骨架时）对齐为 xtractOptimizedVideoPrompt。

### Info ℹ️

- 双后端 clamp 语义已逐一复核：esolveTieredMaxLength(explicit=20000,…)（prompt-engine-kernel.js:192）→ legacy builder range {50,2000}（ideo-prompt-engine-contract.js:251-256）=2000；standalone builder range {200,20000}（同文件 408-413）=20000；无 422 路径，与注释/PRD 一致。
- 新增测试 5000 字符断言单独看修复前也会通过（mock 绕过抽取、safeText 上限 20000）；真正的修复前失败断言是 xpect(optimizeVideoPrompt).toHaveBeenCalledWith(..., { max_length: 20000 })；5000>2000 的选择恰好能拦截未来「照抄图片分支 .slice(0,2000) 本地截断」的回归。
- 共享 kernel 默认 500 / ideoMaxLengthRanges / ideoMaxLengthBatchDefault(1800) / ideoMaxLengthRefinedDefault(5000) 零改动，跨域行为不变（已 grep 确认无其他 PROMPT_ENGINE_LIMITS.maxLength.default 消费点被触碰）。
- 成本/截断语义：standalone 20000 = 引擎侧 le=20000 真实上限（PM 已确认）；legacy ≤2000 为契约收敛（不放松），均已在 design.md Risks 如实记录。
- 定向 Vitest 184/184（含新增 2 用例）；git diff --check PASS；openspec validate s2v-history-video-maxlength PASS。
