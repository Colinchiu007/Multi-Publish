# s2v-translation-optimize 审查记录（2026-08-15）

## 审查方式
- 计划双模型并行（antigravity + Claude）；实际执行中 antigravity 地区不可用（CLI 调用失败），按 CCG 降级规则改为 Claude 单模型审查兜底。
- 审查对象：`apps/desktop/electron/services/story2video-stages.js`（translatePromptsForLocale 重构 + ensureTranslationConcurrencyBudget）、`apps/desktop/electron/services/api-usage-governor.js`（getLimits）、新增测试与文档。

## 审查结论（Claude reviewer）
### Critical（2 项，均已修复）
- C1（key 构造一致性）：预算注册 key 原由「猜测的 model」构造，与运行时 key 不一致会静默失效。
  修复：key 解析来源与 `ai-generator.generateWithDefault` 完全一致——`getDefault('llm')` + `capability_models.llm`（string 优先）；数组/缺失时回退 `provider.models` 首个非空 string（models[0]），与 generateWithDefault 回退路径相同；注册成功/跳过均有日志。
- C2（setLimits 整组覆盖漂移）：只传 maxConcurrent 会整组覆盖，丢失 rpm/冷却/429 语义（浅合并下 rpm 变 undefined → 时间槽 NaN、429 重试条件永不成立）。
  修复：`api-usage-governor` 新增只读 `getLimits(key, type, providerId)`；`ensureTranslationConcurrencyBudget` 以 `existing` 优先、`??` 零值安全合并（`existing?.cooldownMs ?? staticLimits.cooldownMs ?? defaults.cooldownMs`），仅提升 maxConcurrent=4。

### Warning（3 项，已核对/接受）
- W1 `timeoutMs` 是否穿透 adapter：已核对 `model-provider-manager.callAdapter` 支持 `params.timeoutMs` → `withCallTimeout`，25s 有界超时真实生效。
- W2 重试叠加：governor 内建 `_executeWithRetry`（transient 重试 2 次、429 按 `retry429`）+ 业务侧批级重试 1 次会叠加。接受：governor 背压属既有语义，业务重试仅覆盖抛错路径，且受 25s 有界超时约束。
- W3 空对象返回不重试：`translatePromptBatch` 对「可解析但缺 key」保持原 fail-open 语义，不额外重试。接受：与历史行为一致，属只读展示路径。

### 测试缺口（记录）
- 「真实 governor 回归」用例 rpm=1000 无速率压力、未直接断言 30s 排队上限：滑窗并发峰值 ≤4 由单测锁定；rpm 时间槽行为由 governor 既有测试覆盖；慢速 rpm 集成测试成本高（rpm=20 → 每批 3s），按 Token 预算决定不新增。
- `capability_models.llm` 数组场景：已补单测（回退 models[0]，key 与 generateWithDefault 一致）。

## 验证
- story2video-stages.test.js：100/100（含新增 8 例）。
- api-usage-governor / model-provider-governor / ai-generator-integration：72/72。
- QM-1：electron-builder --win --dir --publish never exit 0；启动 12s 存活、主进程 stderr 干净；asar 含 story2video-stages.js / api-usage-governor.js。
