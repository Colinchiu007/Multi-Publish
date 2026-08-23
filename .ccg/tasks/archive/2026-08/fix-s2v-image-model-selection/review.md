# 审查报告：fix-s2v-image-model-selection

## 审查方式（降级记录）

- **antigravity**：不可用——wrapper 探测 `Error: Eligibility check failed: ... not currently available in your location`（区域资格限制，exit 1），按机制硬化规则降级。
- **Claude reviewer**：可用；对 `git diff`（service + test）完成只读审查（Session `761ba347-ef53-474c-b0bf-5b32b824c9ff`），结论见下。
- **主代理自审**：逐项复核差分、往返比对 `model-provider-manager.js`（`getProvider`/`getDefault`/`getMultimodalPreference`/`_safeRow`：`enabled/is_configured/category/models/capability_models` 形状）、`asset-generator.js`（空 provider → 占位图；`IMAGE_PROVIDER_ALIASES`）、`story2video-stages.js`（`_defaultVideoGenerator` capability_models 同源）、渲染端 `ResultView.vue:1154`（错误走通知归一化）。

## Claude reviewer 结论（原始分级 + 闭环状态）

- **Critical 🔴**：0。
- **Major 🟡**
  - M1 `generateSceneImage` 解析失败抛在 try 外（:1280-1281），分段不落 failed、与 `retrySegment` 语义不一致 → **已修复**：解析移入 try（catch 统一持久化 failed + error）。
  - M2 缺「固化 provider 已删除/禁用/未配置」「manager 未就绪」两条已声明分支的测试 → **已修复**：+4 用例（删除→默认 / 禁用→默认 / manager 缺失→透传 / 别名透传）。
  - M3 旧别名 provider id（`openai-image`）被当成「已删除」丢弃，asset-generator 仍可 canonical 路由 → **已修复**：`IMAGE_PROVIDER_ALIASES` 从 asset-generator 导出（单一来源），service 对已知别名原样透传。
- **Minor 🟢**
  - m1 多模态缺 `capability_models.image` 时 `models[0]` 可能是非图片模型（如 minimax 种子首项 speech-2.8-turbo）→ **已修复**：capability 缺失时留空交 adapter 默认，+1 用例锁定。
  - m2 `getMultimodalPreference() === true` 与 manager truthiness 口径 → **已修复**：统一 `!== false`。
  - m3 重解析无日志 → **已修复**：改走默认时 `warn` 记录「provider 由 X 重解析为 Y」。
  - m4 复用路径不校验 savedModel 是否仍在 provider.models → **已修复**：`models.includes` 守卫，失效回退 `_imageModelFor`。
- **Info**：空透传占位图语义保持 ✓；fail closed 与 design.md 一致 ✓；调用点覆盖完整（grep 确认仅两处）✓。

## 主代理自审补充

- 契约核验：`_resolveImageGenerator` 的 `enabled === true && is_configured === true` 与 `_safeRow`（:1054 `is_configured = enabled && 有可用 Key`）一致；`getDefault('image')` 在 `prefer_multimodal` 开/关时分别返回多模态/image 类别 provider，与流水线 `resolveCapabilityProvider('image')`（stages:2035）同源。
- 老项目空 provider → `{providerId:'',model:''}` → `getConfiguredProvider` 判空 → ffmpeg 占位图，语义不变。
- CJK 基线只扫 `apps/desktop/src`（渲染端），主进程错误文案不受 locale-sync 拦截（与既有 `图片生成服务不可用` 同先例）；错误到渲染层走通知归一化，未映射回退 operation_failed，主进程日志保留原文。

## 复审证据

- `story2video-project-service.test.js` **77 passed**（原 72 + 新增 5：删除→默认 / 禁用→默认 / manager 缺失→透传 / 别名透传 / capability 缺失不留非图片模型）。
- 定向 72（首轮）+ 77（补强后）；相邻 `asset-generator` / `asset-generator-provider` / `model-provider-multimodal` / `ResultView` 复跑中；`story2video-stages` + `CreateView` 309 passed（补强前基线）；`node --check` / `git diff --check` PASS。

## 结论

无 Critical；2 个 Major + 4 个 Minor 全部闭环并有回归测试锁定。**approve**。
