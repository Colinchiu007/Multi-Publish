# Review：运营中心预设模型 models_url 官方预填（preset-models-url-official）

## 变更范围
- `ops-center/backend/services/model_preset_service.py`：新增 `OFFICIAL_MODELS_URLS` 白名单 + 目录 4 个纯 LLM 预设预置 `models_url`；`ensure_catalog_seeded` 空值回填（base_url 守卫，不覆盖手工值）；docstring/注释同步。
- `ops-center/backend/tests/test_model_presets_api.py`：3 条回填/守卫测试 + 一致性测试强化（官方清单互斥、base_url+path 锚定、URL 安全基线镜像运行时 https 规则）。
- `ops-center/docs/PRD.md`：12A.5/12A.7-6/12A.8 数据来源与变更守则、鉴权说明、白名单排除理由。

## 双模型审查
- Claude（round1+2）：**无 Critical**。指出并已修复：Gemini `name` 非 id 预置必失败（已排除）、回填污染自定义行（加 base_url 守卫 + 专项测试）、推导断言自证风险（改显式 path 表）、PRD「必须为空」契约过期（已同步）。接受项：鉴权说明如实记录（fetch 不带凭据，官方端点直连 401/403 属既有限制）。
- OpenCode（round3，真实 HTTP 探测）：**1 个 Critical**：OpenRouter `/api/v1/models` 实测响应 ~687KB 超 fetch 512KB 上限（已排除）；W1 多模态 minimax-multimodal 全量列表覆盖能力映射（已排除）；W2 测试基线允许 http 与运行时规则不符（已镜像 https 规则）。其余为可选的防御纵深。
- 综合结论：0 Critical / 0 Warning 遗留；次要 Info 记录于下文，本次不扩大范围。

## 白名单最终构成（4 个纯 LLM 预设）
anthropic `/v1/models`、openai `/models`、deepseek `/models`、mimo-llm `/models`
排除：Gemini（name 非 id）、豆包 Ark（`ep-*` 接入点语义）、OpenRouter（超 512KB 上限）、minimax-multimodal（多模态能力映射）。

## 验证
- `python -m pytest ops-center/backend/tests/test_model_presets_api.py -q` → 32 passed（新增 3 条）。
- 行尾：service/PRD 保持 CRLF 基线，仅新增行按 git 归一化；测试保持 LF 基线。

## 遗留 Info（不阻塞本次）
- 白名单端点未做带鉴权真实 smoke（无密钥）；fetch 鉴权适配列为后续项（PRD 已记录）。
- 端点迁移不自动扩散到存量行；`capability_models` 不回写校验（PRD 变更守则/表格已注明）。
