[codeagent-wrapper]
  Backend: claude
  Command: claude -p --dangerously-skip-permissions --setting-sources  --output-format stream-json --verbose -
  PID: 20668
  Log: C:\Users\邱领\AppData\Local\Temp\codeagent-wrapper-20668.log
  Web UI: http://localhost:49575
  Session-ID: ac63a7d9-c51c-4979-8982-eb53671bbc53
# Technical Analyst 分析报告：图片提示词统一走外部 prompt-engine

## 1. Summary

现状是 `story2video_optimize` 阶段经 `aiGenerator.generateWithDefault('llm', …)` 直连默认 LLM（story2video-stages.js:371-377），与 manifest「tools_available: [prompt_engine]」契约脱节。改造成本集中在三处：**请求构造的枚举归一**（`cinematic` 等别名若不归一会被 prompt-engine 以 422 拒绝）、**error 字段优先校验**（`/v1/optimize` 失败兜底返回 `{optimized_prompt=原 prompt, error}`，若忽略 error 会静默降级）、**配置契约扩展**（text-config 的 optimize 块缺 platform/max_length/num_candidates/auto_detect_style/context 五个字段）。整体方案风险可控，已规划的 OpenSpec change（openspec/changes/image-prompts-via-prompt-engine/design.md D1-D8）方向正确，但需补齐若干校验与别名细节。

---

## 2. Architecture Analysis

**数据流现状**：split → domain_enrich(可选) → **optimize(直连默认 LLM)** → generate_assets → compose → publish。

**双桥结构**：PromptBridge 已就绪（prompt-bridge.js:54-66，POST /v1/optimize 与 /v1/optimize/batch），ServiceBus 已委托（service-bus.js:49-62），通用 `OPTIMIZE`/`OPTIMIZE_BATCH` 已走 PromptBridge（stage-executor.js:281-330）。**唯独 Story2Video 自研阶段绕开了 PromptBridge**，这是历史遗留：设计注释明确「避免错误复用其他流水线的 PromptBridge 配置」（story2video-stages.js:11），测试也锁定了该行为（story2video-stages.test.js:82-126「只调用当前默认 LLM 且不回退 PromptBridge」、e2e-pipeline-orchestrator.test.js:3）。

**契约缺口**：manifest 的 `runtime_defaults.optimize` 已声明 7 个参数（story2video-compose.yaml:46-54），stage options 声明 5 个（:204-210），但实现层 stageOptions.optimize 只有 3 个字段（story2video-text-config.js:486-490）。`prompt-engine` 侧的 StyleType 14 项与 text-config 的 `STORY2VIDEO_PROMPT_STYLES` 完全一致（models.py:18-33 ↔ text-config.js:96-100），PlatformType 7 项（models.py:7-15）在 text-config 尚无对应集合。

**关键验证路径**：`/v1/optimize` 异常时不抛 HTTP 错误，而是返回带 `error` 字段 + 原 prompt 的 OptimizeResult（rest.py:69-75、optimizer.py:217-228）；但枚举非法会触发 FastAPI 422（Pydantic），BasePythonBridge 会将其解析成 `{detail: [...]}` 结构（base-python-bridge.js:237）——**两种失败形态不同，校验必须都覆盖**。

---

## 3. Quality Assessment

- **优点**：并发/重试/断点续传/进度语义成熟（story2video-stages.js:348-413），限流重试分类清晰（:50-96）；配置层白名单过滤 + 敏感键拦截完备（text-config.js:202-213, 438-458）；fail closed 文化已建立（split 降级、prompt-engine 明确失败，yaml:124）。
- **缺口**：
  - 通用 `OPTIMIZE` 单条校验薄弱：只查 `optimized_prompt !== undefined`，不查 `error` 非空、不查空串（stage-executor.js:288-292）——同一缺陷在批量路径的逐条 `error` 上同样存在（:320 只查非空 prompt）。
  - `buildOptimizationRequest` 的 style 默认值 `'cinematic'`（story2video-stages.js:263）**不是** StyleType 合法值，重构后若不经别名归一直接发送 → 422。
  - prompt-bridge 的 `normalizeOptimizeRequest` 只清理 max_length/context（prompt-bridge.js:22-29），不清理空的 style/platform——空串枚举同样 422。
  - 测试将大量重写：当前 optimize 测试全部锚定 `generateWithDefault`/`providerId`（story2video-stages.test.js:118-126, 583；e2e:126-137），重构后这些断言失效。

---

## 4. Risk Matrix

| # | 风险 | 严重度 | 说明 | 缓解 |
|---|---|---|---|---|
| R1 | **error 字段被忽略 → 静默降级** | Critical | `/v1/optimize` 失败兜底返回原 prompt+error（rest.py:70-75）；若只校验 optimized_prompt 非空会把「未优化原文」当成功 | 校验顺序：先 error 后内容（见 Q4） |
| R2 | **未归一枚举 → 422 拒绝** | Critical | style='cinematic' 等别名直接发送（story2video-stages.js:263）或空串枚举 → 422，响应形态为非标准 `{detail}` | 发送前别名归一 + 422 感知的错误面（见 Q2） |
| R3 | **服务不可用 → 优化阶段整体不可用** | Warning | 桌面端未装/未启动 prompt-engine 时 optimize 必失败；split 可降级，prompt-engine 按契约不能（yaml:124） | 明确错误消息 + 文档前置依赖 + 可选 opt-in 透传开关（见 Q1） |
| R4 | **entry 结构变更破坏下游/测试** | Warning | `providerId/model` 移除 → e2e 断言失效（e2e:126-137）；generate_assets 仅读 prompt 字段可容忍（story2video-stages.js:544） | 保留 providerId/model 兼容字段或同步更新全部消费方与测试（见 Q4） |
| R5 | **并发 × LLM 限流** | Info | 61 场景×并发 3 经 prompt-engine 内部再调 LLM，限流语义变化（prompt-engine 有双级缓存缓解） | 保留并发 3 + 瞬态重试，观察 429 指标 |
| R6 | **配额错误重试空转** | Info | quota 错误秒级不会恢复，现有重试会消耗 maxAttempts | 业务错误（error 非空）不重试直接失败（design D2） |

---

## 5. 分问题结论与建议

### Q1 服务不可用/超时/配额：fail closed 还是降级？

**结论：Critical — 默认严格 fail closed，瞬态重试、业务错误不重试，预留 opt-in 透传开关。**

- 依据：manifest 明确「prompt-engine 未运行时必须返回明确错误」（story2video-compose.yaml:124），且用户目标「统一走 prompt-engine」排除了静默旁路。split 可以本地降级是 manifest 明示的例外（:124 note），prompt-engine 没有这个例外。
- **三种失败形态分别处理**（不可混为一谈）：
  1. **瞬时错误**（ECONNREFUSED / timeout / 网络）：复用 `withTransientRetry`（story2video-stages.js:82-96），超时/网络 800ms×attempt，限流 2500ms×attempt，耗尽后阶段失败。
  2. **业务错误**（响应 `error` 非空，含配额）：**不重试**，立即失败——配额在秒级不会恢复，重试只是空转消耗（design D2 已定）。
  3. **服务未启动/进程崩溃**：BasePythonBridge `_post` 直接 reject「not running」（base-python-bridge.js:229），超时 60s reject（:240, prompt-bridge.js:45）→ 归入瞬态重试，最终失败。
- **降级判断**：不建议默认降级，因为 `optimize` 阶段是 `checkpoint_required` + `human_approval_default: true`（yaml:211-212），失败会以可操作的 checkpoint 呈现给用户，比「带标记的静默透传」更诚实。若要支持离线演示，加一个显式开关 `stage.options.optimizePassThrough`（默认 false），**开启时才**允许把原 prompt 作为优化结果并打 `degraded: true` 标记——与 generate_assets 已有的 `degraded` 透传语义一致（story2video-stages.js:743-744）。开关默认关闭满足契约，打开满足离线边界。
- **错误消息要求可操作**：区分「PromptBridge is not running，请检查 PROMPT_DIR / 8013」与「服务返回：<error>」与「请求超时」。

### Q2 平台枚举映射：遗漏与别名

**结论：Critical — 必须建立「发送前归一」的单一映射表；除已列的别名外，补 dall-e-2/dall-e-3、sdxl，且严禁把 image provider 与 PlatformType 混为一个维度。**

- 已覆盖：`cinematic→photography`、`3d-render→3d_render`（text-config.js:101-104）；design D3 拟增 `dall-e→dalle`、`stable-diffusion→stable_diffusion`、`stability→stable_diffusion`。
- **建议补齐的别名**：
  - `dall-e-2` / `dall-e-3` → `dalle`（历史值常见）；
  - `sdxl` / `stable-diffusion-xl` → `stable_diffusion`；
  - 中文名：`通义万相→tongyi`、`文心一格→yizhang`、`即梦→jimeng`（若 config 未来存中文展示值）。
- **关键维度区分（design D3 已正确，需强调）**：`image.style`/`imageProvider`（图片**生成**风格/服务商，generate_assets 消费，CreateView.vue:255-261）与 `promptStyle`（提示词**写法**风格，optimize 消费，CreateView.vue:266-272）与 `PlatformType`（提示词**目标平台**，7 项）是**三个不同维度**，不互相映射。
  - **`minimax` 不是 PlatformType**（models.py:7-15 无此项），若尝试把 `imageProvider: 'minimax'` 映射到 platform 会失败——保持 platform 默认 `generic`。
  - **可选增强（Info）**：当用户显式选择 `imageProvider: 'tongyi'/'jimeng'` 时，可将 platform 派生为该值作为默认；但这是「派生默认」而非「硬映射」，且 `minimax` 无对应 platform 时回落 `generic`。建议本期不做，留 generate_assets 层。
- **实现位置建议**：归一函数从 text-config 导出（`normalizePlatform` + 扩展现有 `promptStyleValue`），`buildOptimizationRequest` 与通用 StageExecutor 复用同一函数，避免两套漂移（design D6）。
- **Warning**：重构后 `buildOptimizationRequest` 的 style 默认值必须从 `'cinematic'` 改为归一后的合法值（`'photography'` 或 `'realistic'`），否则未显式传 style 的运行必然 422。

### Q3 并发/重试/断点续传 vs 批量调用

**结论：Warning — 维持逐场景单条 `/v1/optimize`，不切换 `/v1/optimize/batch`（design D1，同意）。**

- **硬约束**：批量接口上限 10 条（models.py:144-146）；30 场景需 3 批。批量路径任一场景失败（`error` 非空）即整批不可用，与逐场景 `optimize_resume`（按 index 续传，story2video-stages.js:351, 395-402）语义冲突——断点续传会退化到「整批重来」。
- **并发交互**：批量接口内部 `asyncio.gather(to_thread(...))`（rest.py:84-87），10 条并发对 LLM key 的限流压力大于并发 3 的逐条路径；且 BasePythonBridge 对 batch 无重试，失败粒度粗。
- **进度语义**：逐条可上报 `optimize_progress.done/total` 连续递增（story2video-stages.js:396-402）；批量只能按 10 条一跳。
- **建议**：本期保持逐条；把 `optimizeBatch` 保留为后续吞吐优化的后备（design D1 回退位）。若未来切批量，分批粒度 ≤10、每批独立续传键，且需在 JS 侧对每批做瞬态重试。

### Q4 输出校验细则

**结论：Critical — 校验顺序必须是「error 优先 → 结构校验 → 内容校验」，缺一不可。**

| 检查项 | 规则 | 依据 |
|---|---|---|
| `error` 非空 | **最先检查**；非空即失败，消息含场景序号+服务 error | rest.py:69-75 兜底返回原 prompt+error，忽略即静默降级（R1） |
| 结构有效性 | `result` 必须是对象且有字符串 `optimized_prompt` **或** `error`；两者皆无（如 422 `{detail}`）→ 失败并展示 detail | base-python-bridge.js:237 |
| 空串 | `trim()` 后为空 → 失败（保留现状 story2video-stages.js:383-386） | — |
| 超长 | prompt-engine 已保证 ≤ max_length（optimizer.py:191）；防御性：超长截断 + warning，不失败 | 避免「一次好结果因长度差几字被整体否掉」 |
| 批量数量 | 通用 `OPTIMIZE_BATCH` 已检查数量匹配（stage-executor.js:314-319），逐条路径天然按 index 对齐 | — |
| `candidates` | 取 `candidates[0]` 作主结果，不把 A/B 变体塞入流水线；候选列表可随 entry 元数据保留供 UI | design D4 |
| `detected_categories` | 随请求保留到 entry（日志/UI 后续展示） | design D4 |
| entry 身份字段 | 用 `model_used`/`key_source` 替换原 `providerId`/`model`；若下游有读取 `providerId` 的地方需同步，否则保留兼容字段 | e2e:126-137 断言依赖 |

- **通用 OPTIMIZE/OPTIMIZE_BATCH 对齐（Critical）**：单条 OPTIMIZE 需补 `error` 非空与空串校验（stage-executor.js:288-292 现只查 `undefined`）；OPTIMIZE_BATCH 逐条需补 `item.error` 检查（:320 只查非空 prompt）——否则「批量里一条业务失败」会被当成成功。

### Q5 配置契约

**结论：Warning — 按 manifest 已声明字段补齐，命名对齐，旧字段兼容。**

- **新增 optimize 字段**（对齐 yaml:46-54 与 models.py:126-141）：
  - `platform`：7 项枚举，默认 `'generic'`，非法抛错；
  - `maxLength`：50-2000 整数，默认 **300**（确定性，避免依赖服务端默认值漂移）；manifest 里是 `null` 表示「走服务端默认」，二者等价——建议 text-config 显式 300；
  - `numCandidates`：1-5 整数，默认 1；
  - `autoDetectStyle`：bool，默认 true；
  - `context`：字符串或对象，字符串→`{synopsis}`（prompt-bridge.js:27-29 已做），**必须过 `assertNoSensitiveContext`**（text-config.js:202-213，SENSITIVE_CONTEXT_KEYS:108-112）——因为 context 会发给外部服务。
- **stageOptions.optimize 映射**（text-config.js:486-490）：`creative_level`/`negative_prompt` 已有；补 `platform`/`max_length`/`num_candidates`/`auto_detect_style`/`context`，保持 camelCase→snake_case 一致。
- **manifest 同步**：stage options（yaml:204-210）缺 `max_length`，与 runtime_defaults 不一致——补上，避免两处漂移。
- **向后兼容**：旧配置无新字段 → 默认值填充，无破坏；现有「忽略旧 PromptBridge 专属参数」测试（text-config 相关用例）需更新为「接受新字段」。
- **`image.style` 保持 `idValue` 不做枚举**：图片生成风格与提示词风格解耦（Q2），`cinematic` 作为 image.style 默认值（text-config.js:348）合法保留。

### Q6 测试策略

**结论：Info — 分层：单元 mock、集成契约、E2E 用本地 HTTP stub（8013）走真实传输，外部边界显式 PENDING_EXTERNAL。**

| 层 | 测什么 | 工具 |
|---|---|---|
| 单元 | text-config：新字段范围、platform 枚举、别名归一（cinematic/dall-e-2/sdxl）、context 敏感键拒绝、旧配置兼容、stageOptions 映射 | 现有 test 文件扩展 |
| 单元 | story2video-stages：**改 mock PromptBridge 替代 aiGenerator**——请求体断言（含全部 7 参）、error 优先失败、空串失败、超长截断、服务 not running 失败、配额不重试、瞬时重试、并发保序、resume 复用、进度 | 重写 optimize 相关用例（story2video-stages.test.js:82-126, 564-583, 701-762, 789-812） |
| 单元 | stage-executor：OPTIMIZE 补 error 校验、OPTIMIZE_BATCH 逐条 error、别名归一复用 | stage-executor 已有批量用例 |
| 集成 | pipeline-story2video-contract：`stageOptions.optimize` 契约 shape | 现有契约测试 |
| E2E | **本地 HTTP stub**：`http.createServer` 监听 8013，脚本化返回 OptimizeResult 序列，驱动真实 orchestrator；改 e2e:111-138 断言从 `providerId==='e2e-llm'` 改为 stub 返回的 `model_used` | e2e-pipeline-orchestrator.test.js |
| 外部边界 | 真实 8013 + LLM key（.env 已配） | 记录为 PENDING_EXTERNAL，不冒充通过（design D7） |

- **推荐 HTTP stub 而非注入 mock Bridge**：BasePythonBridge 走真实 `http.request`，stub 能同时覆盖「传输层 + 422 detail 形态 + error 兜底形态」，比 mock 类覆盖面大。单元层仍用 mock（快、可控）。

### Q7 风险与回退

**结论：Warning — 最大风险是 R1（error 静默降级）与 R2（枚举 422）；creative_level≤3 模板直出路径在无 LLM key 时可用。**

- **creative_level≤3 模板直出**：确认可用（optimizer.py:129-132「低创意模板直出，免 LLM」）。即 prompt-engine 已安装但 LLM key 缺失时，level≤3 的请求走 `PromptBuilder.render_from_template`（:71-73）成功返回；**level>3 会调 LLM**，key 缺失/失败 → 异常 → 返回带 error 的结果（:217-228）→ 按 Q4 校验失败。**结论：模板路径可用，且 task 指出 .env 已配好 key，此项实际不是障碍**。
- **回退路径**：
  1. 整体 revert（单分支 PR，design D8）；
  2. 渐进收窄：保留 `stageOptions.optimize` 开关位（如 `autoDetectStyle=false`）；
  3. 若需离线透传，走 Q1 的 opt-in 开关，不进默认路径。
- **其余风险**：E2E/单元测试大量断言失效属预期，需随 change 同步重写；建议**先改校验层（Q4）→ 枚举归一（Q2）→ 阶段切桥（Q1/Q3）→ 配置（Q5）→ 测试（Q6）**，每个提交保持测试绿。

---

## 6. 优先行动项（优先级排序）

1. **[Critical] 先写输出校验**：在 story2video-stages 与 stage-executor 同时落实「error 优先 → 结构 → 内容」校验（Q4），这是防静默降级的地基，可先行独立提交。
2. **[Critical] 枚举归一表**：在 text-config 导出 `normalizePlatform`/扩展 `promptStyleValue`，覆盖 Q2 全部别名；`buildOptimizationRequest` 默认 style 从 `cinematic` 改为合法值。
3. **[Critical] 阶段切桥**：`story2video_optimize` 改调 `PromptBridge.optimize`（serviceBus 或直接注入），保留并发/重试/续传/进度语义，请求携带全部 7 参。
4. **[Warning] 配置契约**：text-config optimize 补 5 字段 + 范围校验 + context 敏感键拦截；manifest stage options 补 `max_length`。
5. **[Warning] 测试重写**：单元 mock PromptBridge、E2E 换 8013 HTTP stub，更新 e2e 顶部注释（e2e-pipeline-orchestrator.test.js:3）与 providerId 断言。
6. **[Info] 文档与门禁**：PRD/learnings/CHANGELOG/quality-gates 记录外部验收边界（真实 8013 + key 标记 PENDING_EXTERNAL）、OpenSpec spec 落地、codex/ 分支 PR 合并，重启 Electron 验证。

**一句话结论**：方案可行且已具备良好基础设施，但成败系于两个校验细节——**error 优先**（防 `/v1/optimize` 兜底响应的静默降级）与**发送前枚举归一**（防 `cinematic` 等别名触发 422）；这两点先落地，其余是机械迁移。

---
SESSION_ID: ac63a7d9-c51c-4979-8982-eb53671bbc53
EXIT:0
