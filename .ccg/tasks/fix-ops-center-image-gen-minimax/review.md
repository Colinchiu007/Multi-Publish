# 审查记录：fix-ops-center-image-gen-minimax

## 2026-08-15 第一轮双模型审查

- **antigravity**：地区不可用（eligibility check failed，与既往一致）→ 降级记录，单模型 Claude 审查。
- **Claude（round 1）**：VERDICT REQUEST_CHANGES。
  - 🔴 Critical #1：base64 模式响应字段应为 `data.image_base64`（官方契约 platform.minimax.io/docs/api-reference/image-generation-t2i 证实：`image_base64` Returned when response_format=base64；`image_urls` Returned when response_format=url）。初版读 `image_urls` → 真实调用必现「空结果」，且测试固化了错误形状全绿（把 404 换成了另一个必现错误）。
  - 🟡 Warning #2：n 越界抛错发生在创建自建 httpx.AsyncClient 之后 → client 泄漏。
  - 🟡 Warning #3：base_resp.status_code 若为字符串 "0" 会被误判为业务失败。
  - 🟡 Warning #6：只校验 n>9 上界，未校验下界（n<=0 透传）。
  - 🟡 Warning #7：返回图片数 < 请求 n 未 fail closed（评估维度权重错位）。
  - 🟡 Warning #9：docstring/design/spec 写 image_urls 与真实契约不符。
  - 🟢 Info：前缀匹配宽松、URL 下载失败会重发生成（既有行为，接受）、测试缺口。
- **官方契约核验（独立抓取 platform.minimax.io/docs/api-reference/image-generation-t2i.md）**：端点 POST /v1/image_generation；请求 model=image-01/prompt/aspect_ratio/response_format(url|base64)/n(1-9)；响应 data.image_base64（base64 时）/ data.image_urls（url 时）+ metadata.success_count/failed_count + base_resp.status_code(integer)。

## 2026-08-15 修复（round 2，待复审）

- 修复 #1：`_extract_minimax_images` 双字段解析 image_base64（base64 解码，兼容 data URL 前缀）+ image_urls（URL 下载）。
- 修复 #2：payload 构建移到创建自建 client 之前。
- 修复 #3：base_resp.status_code 类型归一 int 后比较，非数字视为失败。
- 修复 #6：`not 1 <= image_count <= 9` fail closed。
- 修复 #7：MiniMax 返回图片数 != 请求 n → 数量不足 fail closed。
- 修复 #9：docstring/design.md/spec.md 同步 image_base64/image_urls 契约。
- 测试：既有用例改真实契约形状 + 新增（纯 base64 与 data URL 前缀、字符串 status_code、数量不足、n 越界 0/-1/10/20、flux 含 base_resp 不被误拦截）。

## 2026-08-15 第二轮复审（Claude）

- **VERDICT**: REQUEST_CHANGES（仅文档清扫）。
- 逐项核对：Critical #1 / W2 / W3 / W6 / W7 全部修复到位并有回归用例；契约字段名经 MiniMax OpenAPI 独立核验一致；实现代码本身 APPROVE，0 新增 Critical/Warning。
- 残留：#9 文档清扫漏 proposal.md:10 与 CHANGELOG 条目（仍写 image_urls 收 base64）→ **已按建议改为 image_base64（base64 串）/ image_urls（URL）**；数量错误文案改为「数量不符：期望 N 张，实际 M 张」→ 已改并同步测试/design.md。
- 收尾：16 passed + openspec validate ✓；文档计数同步（8 场景）。
