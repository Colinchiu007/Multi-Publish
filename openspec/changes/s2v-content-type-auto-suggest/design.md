# Design: 内容类型自动预选（s2v-content-type-auto-suggest）

## Context

- CreateView 内容类型下拉（general/history）纯手动，默认 general；但 story-context-engine.js 已有 16 朝代规则表 + strong 信号机制（detectEra：朝代命中即 strong；无朝代时 ≥2 独立信号且无对立信号才 strong）。
- 用户选择「历史内容」后 scene_context 生成 imagePromptSeed 时代锚点种子；明确提及朝代/帝号文本检测精度高，应零操作。
- 分析方式：双模型（antigravity 地域不可用 → 降级主代理分析 + Claude 分析），决策点全部收敛。

## Goals / Non-Goals

Goals：
- 文本就绪后 strong 历史信号 → 内容类型预选 history；未检测到保持 general。用户可见可改。
- 检测与流水线引擎同源（复用 story-context-engine.js，不复制规则表）。

Non-Goals：
- 不做不可见自动判定；不改配置契约/执行器/规则表；不加排除规则表（三国杀类误报由可见可改兜底 + 测试钉住）。
- 不做 UI 提示文案（预选自解释；避免 i18n 成对负担）。

## Decisions

### D1: 判定函数 suggestContentType(text) 放 story-context-engine.js
- 纯函数：normalizeText → 空则 `{contentType:'general', strong:false, reason:'invalid_input'}`；detectDynasty 命中 → history(strong, reason:'dynasty')；否则 detectGenre + detectEra(null, genre) → `strong && era==='ancient'` → history(reason:'ancient_strong')；其余 general(reason:'no_signal')。
- genre 参与（与引擎 detectEra 加权一致，parity）；genre 单独不强（历史题材 0 古代词 → ancientCount=1 < 2 不强，测试钉住）。

### D2: IPC `story2video:suggest-content-type`，public 级，fail-open
- 请求 `{text}`；响应 `{code:0, data:{contentType, strong, reason, evidence:{dynasty?, genre?, era?}}}`；空/非法入参返回 general+invalid_input（code 0），渲染端对 code!==0 no-op。
- 防抖不进 IPC（渲染进程节奏控制）；withSenderCheck + wrapIpcHandler。
- ⚠️ 权限双登记：主进程 `license-access-control.js PUBLIC_CHANNELS` + preload `access-control.js PUBLIC_METHODS`，漏登则未登录场景静默失效。

### D3: 渲染进程预选联动（CreateView.vue）
- data `s2vContentTypeTouched:false`；下拉 `@change` 置 touched=true（**必须 @change 而非 watch**——watch 会吞系统预选）。
- `watch pipelineText` → 500ms 防抖 → 调 IPC；**seq 令牌**仅最新响应可回写（防快速输入乱序）；touched=true 短路不检测。
- 范围守卫：仅 `isOrchestratedPipeline(selectedPipeline.name) && inputMode==='text'`。
- 恢复上次选项：恢复快照 contentType 后置 touched=true 并短路（恢复值视为用户偏好），避免系统检测覆盖用户上次选择。

### D4: 误报接受与钉住
- 「三国杀游戏攻略」含三国 → detectDynasty 命中 → history，**必误报**；方案 1 的本质是可见可改，MVP 不加排除规则；测试显式钉住当前行为（未来加排除 = 有意变更）。

## Risks / Trade-offs

- [误报：游戏攻略类含朝代名] → D4：可见可改兜底；测试钉住行为。
- [漏登权限白名单 → 未登录用户预选失效] → D2 双登记 + access-control 测试断言 public。
- [watch 误置 touched 吞预选] → D3 @change + 测试钉住。
- [恢复选项被检测覆盖] → D3 恢复置 touched。
- [IPC 乱序覆盖] → D3 seq 令牌 + 测试。

## Migration Plan

1. TDD：先写 story-context-engine.test.js（11 条）+ CreateView.test.js（fake timers 5 用例）→ 实现。
2. 门禁：vitest 定向 + CreateView.test + locale sync check + openspec validate。
3. 手动验证：桌面应用输入历史文本 → 下拉自动预选；手动改后不再覆盖。
4. PR 合入 main 后按归档三同步（openspec archive + .ccg 归档 + learnings）。
