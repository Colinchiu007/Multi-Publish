## Context

- ModelPreset 表：id/name/category/base_url/models(JSON)/default_model/is_multimodal/capabilities/capability_models/doc_links(≤10)/capability_doc_links/is_visible。
- upsert_model_preset 已校验 category、doc_links≤10 且 http(s)、capability_models 完整性。
- 认证：登录用户读，admin 写；无外部 HTTP 依赖（需新增 httpx）。
- 前端 ModelPresets.vue：Base URL 输入、模型列表逗号分隔、默认模型文本输入、多模态能力动态文档链接。

## Goals / Non-Goals

**Goals:**
- 新增运营信息字段且允许空值；按类型严格校验（URL/正整数）。
- 默认模型 ID 下拉选择；「获取模型」从 models_url 拉取并回写。
- 多模态模型按 7 类固定能力显示文档 URL 输入框。
- 保持现有 API 契约兼容（新增字段可选，老客户端不受影响）。

**Non-Goals:**
- 不做桌面端运行时同步（桌面端继续手工种子对齐）。
- 不做多链接数组 UI 重构（能力文档保持单 URL 输入，内部仍存数组）。

## Decisions

1. **字段映射**：端口URL = 既有 `base_url`（表单 label 改为「接口 Base URL（端口URL）」），避免破坏桌面端契约；新增 `models_url`/`rate_per_minute`/`limit_per_5h`。
2. **类型与空值**：`rate_per_minute`/`limit_per_5h` 为整数，0..上限，允许 None/空串（视为未配置，_to_dict 输出 null）；前端空输入保存为 null。
3. **校验**：
   - `models_url`/`base_url`：空允许；非空必须 http(s) URL，长度≤500。
   - 数字：`int()` 严格转换，非法类型/负数/超上限 → 400 中文错误。
   - `default_model`：非空且 models 非空时必须 ∈ models，否则 400。
   - 多模态 7 能力键：llm/image/video/tts/voice_clone/speech_recognition/vision；capability_doc_links 仍为 capability→links 数组（单 URL 也存数组）。
4. **fetch-models 端点**（admin-only）：
   - 读 preset.models_url；缺失/非 http(s) → 400。
   - SSRF：仅 https（除 loopback 白名单 http）；`redirect` 禁跟随；超时 10s；响应体 ≤512KB；DNS 解析后拒绝私网/保留地址（127.0.0.1/localhost 允许，供本地 ollama 等）；JSON 解析支持 `{data:[...]}` / `{models:[...]}` / 纯数组，元素非空字符串过滤，最多 500 个。
   - 成功回写 models + default_model 若原 default 不在新列表则清空；返回 {models, default_model, count}。
5. **前端**：新增表单字段 + 默认模型下拉（el-select，选项= models）+「获取模型」按钮（loading 态、失败提示）；多模态文档区替换为 7 个固定 label 输入框；表格增加「限流」列（rpm/5h 展示）。

## Risks / Trade-offs

- fetch-models 需要外部网络；SSRF 规则可能误伤自建内网服务（本设计明确只允许 loopback 白名单，文档注明）。
- default_model ∈ models 严格校验可能拒绝旧数据（default 不在 models）；仅在更新时校验，种子数据保持合法。
- 多模态文档从动态多链接改为固定单 URL：capability_doc_links 结构不变（数组），存量多条链接保留但 UI 只编辑首条——前端保存时合并首条，避免数据丢失。
