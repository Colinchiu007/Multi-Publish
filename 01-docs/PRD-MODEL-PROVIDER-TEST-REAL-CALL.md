# PRD-模型设置测试按钮-真实API调用验证

> **创建日期**: 2026-08-19
> **功能ID**: MODEL-PROVIDER-TEST-REAL-CALL
> **优先级**: P0（修复功能缺陷）
> **状态**: 已实现

---

## 一、问题描述

### 1.1 原始问题
模型设置页面的"测试连接"按钮，目前只测试 API 端口 URL 的连通性，而不是用配置的 Key 去真实调用 API 再根据返回值确定是否正常。

### 1.2 问题分析

**原实现流程**：
1. Electron 前端调用 modelProviderTest(id)
2. 通过 IPC 转发到 provider-manager.js
3. provider-manager.js 调用 POST /api/admin/providers//test
4. **问题**：ops-center 后端没有这个路由（路由前缀是 /api/v1/model-presets/）
5. 测试按钮实际上不会成功调用后端

**根本原因**：
- 路由不匹配：Electron 调用 /api/admin/providers/{name}/test，但 ops-center 后端使用 /api/v1/model-presets/ 前缀
- 没有真正的 API 调用逻辑：后端没有实现真实调用 API 的测试功能

---

## 二、解决方案

### 2.1 核心改动

#### 2.1.1 后端新增测试端点

**文件**: ops-center/backend/routers/model_presets.py

新增路由：
POST /api/v1/model-presets/{preset_id}/test

**请求参数**：
- api_key: 可选，覆盖已保存的 Key
- base_url: 可选，覆盖预设的 base_url
- model: 可选，指定测试模型 ID

**响应格式**：
- 成功: {"ok": true, "detail": "连接成功（chat/completions 可达）"}
- 失败: {"detail": "HTTP 401: Unauthorized"}

#### 2.1.2 服务层实现

**文件**: ops-center/backend/services/model_preset_service.py

新增函数：test_provider_connection(db, preset_id, body, secret)

**数据来源优先级**：
1. body 中传入的值（前端表单未保存的值）
2. 数据库 model_presets 表的 base_url
3. 数据库 official_keys 表的 api_key（按 provider 匹配，Fernet 解密）
4. 数据库 model_presets 表的 default_model 或 models[0]

**探测策略**（OpenAI 兼容最小请求）：
1. 策略 1: POST {base}/chat/completions（max_tokens=1）
   - 覆盖 llm/vision/chat 类模型
   - 请求体：{"model": "xxx", "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1}
   - 成功条件：HTTP 状态码 < 400
2. 策略 2: 如果策略 1 返回 404/405，或 400 且错误体命中模型关键字
   - 回退到 GET {base}/models
   - 覆盖 image 类 provider
   - 成功条件：HTTP 状态码 < 400
3. 失败: 报错并提示"该端点可能不支持轻量探测，请改用真实生成/评估验证"

**模型错误关键字检测**：
- unknown model
- model not found
- model does not exist
- invalid model
- not found
- no such model

#### 2.1.3 前端路由修复

**文件**: apps/desktop/electron/services/provider-manager.js

修改 testProvider 方法：
- 修改前: return this._callApi('post', /api/admin/providers//test)
- 修改后: return this._callApi('post', /api/v1/model-presets//test)

**权限要求**：admin-only（需要管理员权限）

---

## 三、数据流

### 3.1 完整调用链

用户点击"测试"按钮
    -> useModelProviderCrud.js -> testProvider(id)
    -> modelProviderTest(id) -> IPC: provider:test
    -> provider-manager.js -> testProvider(name)
    -> POST /api/v1/model-presets/{name}/test
    -> model_presets.py -> test_model_preset()
    -> model_preset_service.py -> test_provider_connection()
    -> 查询 model_presets 表 -> 获取 base_url
    -> 查询 official_keys 表 -> 获取 api_key（Fernet 解密）
    -> httpx POST {base}/chat/completions
    -> 返回结果（ok: true/false, detail）

### 3.2 数据库查询

**查询 1**: model_presets 表
SELECT * FROM model_presets WHERE id = ?
获取：base_url, default_model, models

**查询 2**: official_keys 表
SELECT * FROM official_keys WHERE provider = ? AND is_active = 1
获取：api_key（Fernet 加密，需解密）

---

## 四、错误处理

### 4.1 预设不存在
{"detail": "Model preset not found: xxx"} - HTTP 400

### 4.2 未配置 base_url
{"detail": "未配置 base_url（端口URL），请先填写"} - HTTP 400

### 4.3 未配置 API Key
{"detail": "未配置 API Key，请先填写（表单或模型密钥表）"} - HTTP 400

### 4.4 未配置模型 ID
{"detail": "未配置模型 ID（default_model 或 models），请先填写"} - HTTP 400

### 4.5 连接失败（网络错误）
{"detail": "连接失败：ConnectError: [Errno 111] Connection refused"} - HTTP 502

### 4.6 API 返回错误
{"detail": "HTTP 401: {\"error\":{\"message\":\"Invalid API key\"}}"} - HTTP 400

### 4.7 探测失败
{"detail": "连通性探测失败：chat/completions=404，/models=404；该端点可能不支持轻量探测，请改用真实生成/评估验证"} - HTTP 400

---

## 五、安全考虑

### 5.1 API Key 安全
- API Key 从 official_keys 表读取时使用 Fernet 解密
- 解密失败时静默跳过（不暴露错误）
- API Key 不在响应中返回

### 5.2 SSRF 防护
- httpx.AsyncClient 使用 follow_redirects=False
- 超时设置为 15 秒

### 5.3 权限控制
- 端点需要 admin 权限（require_admin 依赖）

---

## 六、测试场景

### 6.1 正常场景
- 配置正确的 OpenAI 兼容 API -> 返回 "连接成功（chat/completions 可达）"
- 配置正确的图片生成 API -> 返回 "连接成功（/models 可达）"

### 6.2 异常场景
- 未配置 API Key -> 返回 "未配置 API Key"
- 未配置 base_url -> 返回 "未配置 base_url"
- 未配置模型 ID -> 返回 "未配置模型 ID"
- API Key 错误 -> 返回 "HTTP 401: Unauthorized"
- base_url 不可达 -> 返回 "连接失败：ConnectError"
- 预设不存在 -> 返回 "Model preset not found"

### 6.3 边界场景
- body 中传入临时值覆盖数据库值
- official_keys 表中无匹配记录
- Fernet 解密失败（密钥损坏）

---

## 七、变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| ops-center/backend/routers/model_presets.py | 修改 | 新增 /{preset_id}/test 路由 |
| ops-center/backend/services/model_preset_service.py | 修改 | 新增 test_provider_connection 函数 |
| apps/desktop/electron/services/provider-manager.js | 修改 | 修复 testProvider 方法的 API 路径 |

---

## 八、后续优化建议

1. **支持更多 API 协议**：除了 OpenAI 兼容格式，可扩展支持 Anthropic、Google 等格式
2. **测试结果缓存**：短时间内重复测试可复用结果
3. **测试历史记录**：记录每次测试的时间和结果
4. **批量测试**：支持一键测试所有已配置的 Provider

---

> **版本**: v1.0
> **作者**: Codex Agent
> **审核**: 待审核
