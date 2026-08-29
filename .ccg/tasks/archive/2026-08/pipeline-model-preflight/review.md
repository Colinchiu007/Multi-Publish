# pipeline-model-preflight 审查记录（2026-08-28）

## 双模型审查状态：降级（外部模型链路失败，未获得可用报告）

按机制硬化规则（AGENTS.md「子代理降级」），不宣称双模型审查已完成，如实记录：

1. 规划期两轮尝试（前序会话）：opencode 后端 ~30 分钟无终报被终止；Claude 后端事件 8600+ 疑似死循环被终止。
2. 交付前一轮尝试（本轮，--lite）：包装器在 PowerShell Start-Job 中把含中文用户名（邱领）的 ROLE_FILE 路径经代码页转码为乱码，两后端均因读取 ROLE_FILE 失败退出（opencode 无 agent_message、claude -1）——属包装器环境层失败，不构成模型结论。
3. 最后一轮尝试（UTF-8 管道、无 ROLE_FILE）：opencode 后端 ~2 分钟内正常返回，但回复「未提供待审查事实」——载荷未完整投递到模型（工具链路问题），未产生审查报告。

结论：外部双模型审查在三次尝试中均未产出报告；按仓库既有惯例（quality-gates 多次「PASS（降级）」记录）降级为主代理逐文件复审 + 全量测试兜底。

## 主代理逐文件复审（0 Critical / 0 Warning）

### pipeline-model-preflight.js（新增）
- 静态映射与阶段执行器实际解析点逐条核对（探子审计 + 主代理抽查）：explainer/videogen/documentary/localization/podcast/talkinghead/cinematic/clipfactory/smoketest/film-engineering/screen-demo 全部与 `*-stages.js` 一致；localization-dub 修正为「显式非空 voiceProvider 时 +tts」（localization-stages.js:229-256 voiceProvider 空 → Edge TTS/静音兜底）；film-engineering 保留 llmEnabled 前瞻契约（film-engineering-stages.js:80 读字段、:88/:95 当前硬编码 false，已注释说明）。
- 校验语义与 callAdapter 凭据判定一致：显式 provider 走 `getProviderWithKey` + 导出的 `hasUsableApiKey`/`canUseWithoutApiKey`（与 model-provider-manager.js:1210 module.exports 对齐）；默认解析复用 `getDefault`（含 capability_enabled.video 多模态门，manager.js:1112-1127）。
- fail-open 边界：manager 缺失或 `_ready === false` 跳过 + warn；未知流水线放行 + warn；均不误报用户模型缺失。
- 错误契约：`errorParams.missing`（能力 id 数组）+ `errorParams.providers`（能力→显式 provider）；error 摘要用中文能力标签（CAPABILITY_LABELS），renderer 展示走 locales。

### pipeline-engine.js / phase1-context.js / story2video-batch-queue.js
- 闸口位置：normalize（story2video 参数）之后、`this.start()` 之前、并发预算之前——符合设计 D1；不创建 run、不触发阶段。
- resumeOrchestration 未触碰（无前置拦截，符合规格场景）。
- 批量：`_drain` 失败分支透传 errorCode/errorParams，`_serializeItems` 输出两者；并发预算拒绝仍走退避重试（不受影响）。
- phase1-context 注入与既有服务回填模式一致（aiGenerator/story2videoProjectService 同款写法）。

### renderer（notifications / locales / CreateView）
- `resolveMessageKey` 对 `errorCode === 'PIPELINE_MODEL_REQUIREMENTS_MISSING'` 优先直连（在 ACCESS_DENIED 之前，不被正则覆盖）；已知 key 集合无重复。
- `normalizeParams` 用 `LOCALE_TREES[locale].story2video.modelCapabilityLabels`，zh/en 键一致；provider 标识用中文括号/英文括号。
- CreateView：`canGoToModelSettings` 仅 messageKey===MODELS_REQUIRED 时显示按钮；`goToModelSettings` 先关弹窗再 `$router.push({name:'ModelProviders'})`（真实路由存在，router/index.js:35）；批量轮询按 itemId 去重弹一次，避免轮询骚扰。
- locales zh/en 成对 +9 行（CI Gate 7）；src 新增行经 diff 核验零硬编码中文；CJK 门禁仅行号漂移（新增行导致 line-id 位移），未新增字面量。

### 测试兜底
- pipeline-model-preflight.test.js 28/28；pipeline-engine.test.js 68/68（闸口 7 用例）；story2video-batch-queue.test.js 16/16；bootstrap phase1/phase3 37/37；notifications 46/46；CreateView 新增 3 用例通过。
- 受影响广集（electron/tests + src/story2video + CreateView 全量）：1002/1003 通过；唯一失败 voice-clone-layout-regression（真实 chromium 启动超时 10s），与本改动无文件交集，归类环境项。

## Info（记录备查）
- `video.mode` 非 off 但 select_video_scenes 实际未选定场景（如空 video_plan）时运行期不会调用视频生成器——前置校验按 mode 判定略保守（多校验一次配置），不误伤（有配置即通过）。
- CJK 基线 `locale-cjk-baseline.json` 含行号 id，本次新增行造成漂移；CI 若报新增需按仓库惯例更新基线并人工确认无新增硬编码（已 diff 核验）。
