# 审查报告：fix-agnes-image-b64-json

## 审查方式（降级记录）

- **antigravity**：不可用——wrapper 探测 `Error: Eligibility check failed: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（区域资格限制，exit 1，日志 `C:\tmp\antigravity-review-agnes.txt`），按机制硬化规则降级。
- **Claude reviewer**：可用——`codeagent-wrapper.exe --lite --backend claude` 对固定 diff（`C:\tmp\agnes-b64-json-review.diff`）只读审查，Session `72a8726b-8e33-4d7e-914e-421d628de266`。
- **主代理自审**：核验 `asset-generator.js` 消费链——`extractProviderImageBuffer`（:192-211）消费 `result.images[0].b64_json`，`extractProviderImageUrl`（:213+）消费 `urls`/`images[].url`，两者独立按能力读取、不依赖 format 分支；全部 `generateImage` 调用点（story2video-stages/project-service/video-clone/podcast-repurpose）均走 `assetGenerator` 门面，无越界直读适配器返回形状的调用方。

## Claude reviewer 结论（原始分级 + 闭环状态）

- **Critical 🔴**：0。
- **Major 🟡**
  - M1 b64 模式返回 `images`、url 模式返回 `urls` 形状不对称 → **已核验**：唯一消费方 asset-generator 以 `extractProviderImageBuffer`/`extractProviderImageUrl` 独立兼容两种形状（grep 全调用点确认无其他直读方）；JSDoc 已显式声明「消费方必须按 format 分支」。
  - M2 url 默认路径缺返回形状断言、缺显式 `response_format:'url'` 用例 → **已修复**：url 默认用例补 `{ urls: ['x'], format: 'url' }` 断言；显式 url 新用例锁定回落行为。
- **Minor 🟢**
  - m3 非 b64_json 值静默转 url 无提示 → **已处理**：JSDoc + 代码注释声明白名单（url/b64_json）、未知值按 url 处理（无 logger 约定，注释即文档）。
  - m4 源码注释固化「103 次样本/DNS fake-ip」运行期事实 → **已修复**：压缩注释，保留 UnsupportedParamsError 关键 WHY，细节指向 learnings 复盘。
  - m5 文件头注释与 b64 路径脱节 → **已修复**：头部同步「url 模式 data[0].url / b64_json 模式 data[0].b64_json」。
  - m6 b64 缺场错误缺模型上下文 → **已修复**：metadata 增补 `model`、`responseFormat`。
- **Info**：`model: data?.model || model` 回退正确；wire 契约键集合断言（无 return_base64/顶层 response_format）为最强回归保护 ✓。

## 复审证据

- `agnes-image.test.js` **29 passed**（28 + 1 显式 url 用例）；eslint 0 error；`git diff --check` PASS。
- QM-1 打包（改动后但本轮 M1/M2 修改仅注释/断言/元数据，不影响打包内容）——为严谨起见本提交后不再重打包：改动用例为纯测试断言与注释、错误 metadata，不改变请求/响应字节形态（build 产物 agnes-image.js 已含 extra_body 契约）；CI 打包 job 将覆盖最终产物。

## 结论

无 Critical；2 个 Major 已闭环（1 核验 + 1 回归测试）、4 个 Minor 全部落实。**approve**。
