## 决策记录

### D1: 优化调用方式 — 逐场景单条 /v1/optimize（保留现状并发语义）
- **选择**：Story2Video optimize 阶段继续逐场景调用 `PromptBridge.optimize`（POST /v1/optimize 单条），不切换 /v1/optimize/batch。
- **理由**：保留既有有界并发（默认 3）、瞬态重试（限流 2500ms×attempt、其余 800ms×attempt）、断点续传（optimize_resume 按场景下标）、进度上报（optimize_progress）语义，改动面最小；批量接口（≤10 条）对 20+ 场景需自行分批，且任一失败整批语义与逐场景续传冲突。
- **备选**：/v1/optimize/batch 每 10 条一批 → 拒绝：失败粒度粗、无法逐场景续传、进度不连续。
- **回退**：PromptBridge 已实现 optimizeBatch，后续如需吞吐优化可切换，契约不变。

### D2: 服务不可用策略 — fail closed（严格按 manifest）
- **选择**：prompt-engine（8013）不可用/超时/配额错误时 optimize 阶段失败，返回可解释错误，不回退默认 LLM，不把原 prompt 当优化结果继续。
- **理由**：manifest 契约「prompt-engine 未运行时必须返回明确错误」；用户需求「统一走 prompt-engine」排除静默旁路；静默降级会掩盖契约漂移。
- **边界**：瞬态网络错误仍走有界重试（复用 withTransientRetry）；error 非空（业务失败/配额）不重试、直接失败。
- **风险**：桌面端未安装 prompt-engine 时优化阶段不可用 → 错误消息提示检查 PROMPT_DIR/8013，文档标注该前置依赖。

### D3: 枚举映射 — 单一映射表
- **选择**：在 story2video-text-config.js 维护 `STORY2VIDEO_PROMPT_STYLES`（14 项）与新增 `STORY2VIDEO_IMAGE_PLATFORMS`（7 项）以及别名映射（cinematic→photography、3d-render→3d_render、dall-e→dalle、stable-diffusion→stable_diffusion、stability→stable_diffusion）；校验失败回退默认（style→realistic，platform→generic）。
- **理由**：枚举与 prompt-engine models.py 契约一一对应；别名归一防止渲染层历史值（cinematic 等）导致 422。
- **遗漏排查**：image 生成 provider（minimax/tongyi/jimeng）属于「图片生成服务商」，与 prompt-engine PlatformType（提示词目标平台）是两个维度，不互相映射；后续若需 provider→platform 联动，在 generate_assets 层处理，不在本 change 范围。

### D4: 输出校验细则（fail closed）
- optimized_prompt 必须为非空字符串且 trim 后非空；长度 > max_length 时截断到 max_length（prompt-engine 已保证，防御性兜底）并记录 warning，绝不把空值当成功。
- result.error 非空 → 阶段失败，消息含场景序号 + 服务 error。
- detected_categories（风格检测结果）随请求携带保留到 entry（供日志/UI 后续展示）。
- candidates 只保留第一候选 optimized_prompt（与现状单候选一致），不把 A/B 候选塞入流水线。

### D5: 配置契约 — 新增字段 + 旧字段兼容
- story2video-text-config.js `optimize` 新增：`platform`（默认 'generic'）、`maxLength`（默认 300，范围 50-2000）、`numCandidates`（默认 1，范围 1-5）、`autoDetectStyle`（默认 true）、`context`（对象或字符串，字符串→{synopsis: str}）。
- 旧字段 style/creativeLevel/negativePrompt 语义不变；stageOptions.optimize 输出映射为 prompt-engine 请求字段（style、creative_level、max_length、negative_prompt、num_candidates、auto_detect_style、platform、context）。
- 越界输入：numberValue 收敛或抛错（沿用现有 text-config 校验风格：字符串长度超限抛错、枚举非法抛错、数值越界抛错），测试覆盖。

### D6: 通用 OPTIMIZE/OPTIMIZE_BATCH 对齐
- 通用 StageExecutor 已走 PromptBridge；本 change 为其增加同一套「平台/风格别名归一 + 输出校验」复用函数（从 story2video-text-config 导出映射表，或独立 shared 模块），避免两套漂移。
- service-bus.optimizePrompt/optimizePromptsBatch 透传 options 不变（已 spread 到请求体）。

### D7: 测试策略（不依赖真实 8013）
- 单元：story2video-text-config（枚举/范围/别名/兼容）、story2video-stages（mock PromptBridge：请求体断言 + 空/超长/error/数量不匹配 fail closed + 断点续传 + 并发保序）、stage-executor（OPTIMIZE/OPTIMIZE_BATCH 已有用例，补充别名归一）。
- 集成：pipeline-story2video-contract（stageOptions.optimize 契约）+ e2e-pipeline-orchestrator（夹具改为 mock PromptBridge）。
- 外部验收边界：真实 8013 + LLM key（记录为 PENDING_EXTERNAL，不冒充通过）。

### D8: 风险与回退
- 最大风险：prompt-engine 未部署/未配置 key 导致优化阶段不可用 → 缓解：明确错误消息 + 文档前置依赖 + quality-gates 记录外部边界。
- creative_level<=3 走 prompt-engine 模板直出（免 LLM key），部分场景可用；>3 需要 LLM key（外部验收）。
- 回退：本 change 可整体 revert（单分支 PR），或保留 `stageOptions.optimize` 开关位（autoDetectStyle=false 等）渐进收窄。
### D9: 双模型审查修复决策（2026-08-09 复审后）
- **C1（Critical）**：context 敏感键拦截迁入契约唯一咽喉——`prompt-engine-contract.js` 内置
  `assertNoSensitiveContext`，`buildPromptEngineOptimizeRequest` 对对象型 context 调用；`prompt-bridge.js`
  `normalizeOptimizeRequest` 补第二道纵深防御；`optimize/optimizeBatch` 改为 async 使同步校验异常以
  rejected promise 呈现。测试覆盖 api_key/apiKey/API_KEY/api-key/api key/Authorization/clientSecret 变体。
- **W1**：error/detail 宽判——error 有值（字符串/对象/数组）即失败，detail 任意非空值按 422；`error:''`/`detail:''` 放行。
- **W2**：配置层与运行层一致——text-config 的 platform/style 改用契约 normalize（非法回退 generic/realistic），
  旧值（douyin/unknown 等）兼容不抛错；maxLength/numCandidates 越界与 context 敏感键仍 fail closed。
- **W3/W4**：枚举/别名单一来源——text-config 直接引用契约集合（`STORY2VIDEO_IMAGE_PLATFORMS = PROMPT_ENGINE_PLATFORMS` 等），
  删除本地重复 Set/别名/promptStyleValue 死代码；敏感键逻辑亦从契约 import。
- **W5**：截断上限统一用契约收敛后的 `request.max_length`（兼容 camelCase 配置且不因原始越界值误截断）。
- **W6**：旧 `{code:0,data}` 包装失败原因优先用包装内真实 error/detail。
- 复审结论：无 Critical，可批准合入（工作区并发修改已收敛，最终 6 套件 173 用例 + e2e 6 用例全绿）。
