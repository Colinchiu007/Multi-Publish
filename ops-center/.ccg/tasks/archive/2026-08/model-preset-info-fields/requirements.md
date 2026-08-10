# 分析记录（双模型降级说明）

## 双模型分析状态
- 按 CCG 规则对 M+/L 复杂度任务执行双模型并行分析：antigravity 后端不可用（`agy command not found in PATH`，wrapper 实际支持 codex/gemini/claude）；gemini 后端同样缺 CLI（exit 127）；claude 后端 10 分钟无输出（超时）。
- 依据「机制硬化规则-子代理降级」：外部模型基础设施不可用时不盲等，降级为主代理直接分析；本记录为降级依据，审查阶段若环境恢复再补外部 review。

## 主代理设计结论（基于 file:line 证据）

### ops-center（仓库 D:\Data\projects\ops-center，分支 codex/model-preset-info-rpm）
1. 新字段（model_presets 表 + service + 前端表单）：
   - `models_url`（获取模型ID URL）：string，允许空，非空时校验 http(s) URL，长度≤500
   - `rate_per_minute`（每分钟连接次数）：int，0..100000，允许空（null 视为未配置）
   - `limit_per_5h`（5小时限额次数）：int，0..10000000，允许空（null 视为未配置）
   - 端口URL → 复用现有 `base_url` 字段（表单 label 改为「接口 Base URL（端口URL）」），避免破坏桌面端契约
   - 默认模型ID → 复用 `default_model`，前端改为下拉（选项= models 列表）
2. 校验（service.upsert_model_preset 扩展）：
   - `default_model` 非空时必须 ∈ models 列表（models 非空时），否则 400
   - 数字字段：必须是整数且 ≥0（允许空/None）；类型错误返回明确 400 信息
   - 多模态 7 能力文档键：llm/image/video/tts/voice_clone/speech_recognition/vision（voice_clone/vision 为新增文档键，不影响现有 capabilities 枚举，capability_doc_links 仍是 capability->links 结构）
3. 新端点 `POST /api/v1/model-presets/{preset_id}/fetch-models`（admin-only）：
   - 从 preset.models_url 拉取模型ID；SSRF 防护：仅 http(s)、禁重定向、超时 10s、响应体≤512KB、DNS 解析后校验非私网/环回（保留 127.0.0.1/localhost 作为本地 ollama 等合法场景）、JSON 解析并取字符串数组（兼容 {data:[...]} / {models:[...]} / 纯数组）
   - 成功 → 更新 preset.models 并返回 {models, default_model, count}
4. 种子 PRESET_CATALOG 补充 models_url/rate_per_minute/limit_per_5h（minimax 等）

### Multi-Publish 桌面端（工作树 C:\tmp\Multi-Publish-model-scheduler，分支 codex/model-scheduler-ops-presets）
1. 统一调度机制 = 既有 ApiUsageGovernor（并发信号量 + RPM 滑动窗口排队 + 429 冷却重试 + 5h token 窗口），新增薄封装模块 `model-call-scheduler.js`：
   - `withModelBudget({type, providerId, model}, task)` → governor.run 包装
   - `resolveProviderBudget(providerId, type)` → 从 provider config（rate_per_minute/limit_per_5h）+ governor-provider-limits 静态表合并预算
   - `mapWithModelBudget(items, {type, providerId, model, fallbackConcurrency}, fn)` → 有界并发，上限 = min(请求并发, provider maxConcurrent)
2. provider config 新增 `rate_per_minute` / `limit_per_5h`：
   - model-provider-seeds.js 预设补充（与 ops-center 种子对齐）
   - ModelProviderManager 初始化/更新时把预算应用到 governor（setProviderLimits + setTokenWindows 5h）
3. story2video-stages.js generate_assets：把 `_mapWithConcurrency(3)` 改为按 provider 预算调度（image/tts 各自 providerId）；无配置时回退原逻辑
4. ModelProviders.vue 表单增加 每分钟连接次数/5小时限额次数 输入（可空）

### 测试
- ops-center：test_model_presets_api.py 扩展（字段校验/默认模型∈列表/数字类型/fetch-models SSRF+契约/多模态7能力文档键）
- 桌面端：model-call-scheduler.test.js + api-usage-governor 预算注入测试 + story2video generate_assets 预算联动测试
