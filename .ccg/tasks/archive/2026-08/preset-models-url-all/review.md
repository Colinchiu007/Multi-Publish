# 审查报告：preset-models-url-all（2026-08-27）

## 范围
ops-center/backend/services/model_preset_service.py（OFFICIAL_MODELS_URLS 4→24、_extract_model_ids 增强）
+ tests/test_model_presets_api.py（锚定表扩展 + 两个新测试）。diff 323 行。

## 双模型审查结果（并行 wrapper：opencode + Claude）

### opencode（实测复现）
- **Critical C1（已修复）**：ElevenLabs `/v1/models` 真实响应每项同时含 `model_id`（API 标识）与 `name`（显示名），旧优先级 `id→name→model_id` 命中 `name` 导致拉取的模型 ID 不可用（实测 `['Eleven Multilingual v2', ...]`）；且 default_model 不在新列表被清空。修复：优先级改为 `id → model_id → modelId → name`，回归测试改用真实形状（含 name 显示名）。
- **Warning W1（已修复）**：`models/` 前缀剥离作用于全部字段，可能误伤以 `models/` 开头的真实 `id`。修复：仅 `matched_key == "name"` 时剥离，并补「id 带 models/ 前缀不剥离」回归。
- **Warning W2（维持现状+文档）**：fetch 不带鉴权头，23/24 端点直连 401/403。PRD 12A.3 已明示「预填仅为地址预置」；扩展鉴权属后续特性。
- **Warning W3（已修复）**：ElevenLabs 测试省略真实必带 `name` 字段掩盖 C1；已改真实形状并补 camelCase `modelId`、id 为空回落 name 用例。
- Info：I2 锚定测试充分 ✅；I3 Gemini 分页未处理（当前规模影响有限）；I4 响应体上限需发布前真实 size 冒烟（已实测各端点 401/403/200 均远小于 512KB，OpenRouter 687KB 除外）。

### Claude
- **无 Critical**。W1（共享端点跨类别污染 + fetch 即落库）已按设计取舍处理：用户需求即「全量预填」，PRD/注释声明「获取模型以供应商全量列表覆盖 models」语义；W2（鉴权）与 opencode 一致，PRD 已明示。
- Info：I1 `models/` 剥后残余空格（剥后用 strip，已修复）；I2 字段优先级核对通过；I3 sensenova 等端点建议真实 key smoke（标注为既有 base_url 事实推导）；I4 环回测试比运行时窄（测试未复用 `_is_loopback_host`，当前白名单仅 ollama http，不阻塞）。

## 修复后核验
- `python -m pytest ops-center/backend/tests/test_model_presets_api.py -q` → **37 passed**。
- `py_compile` 通过；service.py 全 CRLF（987 CRLF/0 lone LF/0 CRCRLF）。
- URL/base_url+path 锚定 24 项一致性经两模型程序化核对通过；SSRF 面无新增（ollama http loopback 与既有本地服务策略一致）。
