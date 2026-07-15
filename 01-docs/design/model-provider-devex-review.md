# Adapter 开发者体验审查报告

> **Phase 1.4 /plan-devex-review** - 质量节拍
> **审查日期**: 2026-07-15
> **审查目标**: Adapter 抽象设计（设计文档 2.3 IModelProvider + 2.4 工厂注册表 + 3.4 P3 实施计划）
> **审查方法**: 7 维度评估（上手门槛 / 接口设计 / 错误反馈 / 测试体验 / 文档示例 / 调试支持 / 版本演进）
> **门禁标准**: 7.0/10
> **审查结论**: 不通过（综合 4.9/10）- 需 P3 实施前改进

---

## 一、审查范围

### 目标设计
- 设计文档 2.3: IModelProvider 接口（9 方法）
- 设计文档 2.4: 工厂注册表
- 设计文档 3.4: P3 Adapter 抽象实施计划
- 设计文档 5.1: 测试策略

### 对照现状
- ai-generator.js: PROVIDERS 硬编码注册表 + _configs 内存 Map
- model-provider-manager.js: testConnection 占位

---

## 二、综合评分

| 维度 | 评分 | 关键短板 |
|------|------|---------|
| 1. 上手门槛 | 5/10 | 无脚手架、无模板、无概念图 |
| 2. 接口设计 | 6/10 | 9 方法过度耦合、无默认实现、config 双职责 |
| 3. 错误反馈 | 4/10 | 错误类型未定义、无错误码字典、解密失败静默 |
| 4. 测试体验 | 5/10 | 无 mock 基础设施、无 contract 测试、E2E 依赖真实 key |
| 5. 文档示例 | 5/10 | 无完整 Adapter 示例、无 README、无迁移指南 |
| 6. 调试支持 | 4/10 | 无结构化日志、无 request ID、无调试钩子 |
| 7. 版本演进 | 5/10 | 无接口版本号、无能力协商、无 schema 迁移框架 |
| **综合** | **4.9/10** | **低于 7.0 门禁** |

---

## 三、7 维度详细发现

### 维度 1: 上手门槛 (Onboarding) - 5/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 1.1 | P0 | 无脚手架命令，新增 Adapter 需手动复制 9 方法签名 | 缺失 |
| 1.2 | P1 | 无 Adapter 模板文件 | 缺失 |
| 1.3 | P1 | 需理解 4 概念无概念图 | 设计文档 |
| 1.4 | P2 | 无交互式引导 | 缺失 |
| 1.5 | P2 | 新增 Adapter 后需手动同步到 seeds.js | seeds.js |

### 维度 2: 接口设计 (Interface Design) - 6/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 2.1 | P0 | 单个 Adapter 必须实现全部 9 方法，违反 ISP | base.js |
| 2.2 | P1 | base.js 方法体为空，子类未实现时静默返回 undefined | base.js |
| 2.3 | P1 | config 参数双职责（credentials + options 混合） | 全部方法 |
| 2.4 | P1 | streamChat 返回 AsyncGenerator 但无 TypeScript 类型 | base.js |
| 2.5 | P2 | 无能力声明（adapter.capabilities()） | 缺失 |
| 2.6 | P2 | estimateCost 应标注为可选 | base.js |

### 维度 3: 错误反馈 (Error Feedback) - 4/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 3.1 | P0 | testConnection 返回 error 为裸字符串，无 ProviderError 类型 | base.js |
| 3.2 | P1 | registry 重复注册错误无已注册文件路径 | registry.js |
| 3.3 | P1 | validateConfig 调用时机未定义 | base.js |
| 3.4 | P1 | HTTP 401/403/429/500/超时未映射为不同错误码 | 缺失 |
| 3.5 | P2 | 无 ERROR_CODES 常量字典 | 缺失 |
| 3.6 | P2 | crypto.js decrypt 失败返回空字符串 | crypto.js:352 |

### 维度 4: 测试体验 (Testing Experience) - 5/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 4.1 | P0 | 无 mock 基础设施 | 缺失 |
| 4.2 | P1 | 9 方法接口无契约测试框架 | 缺失 |
| 4.3 | P1 | 无 fixtures 目录存放供应商 API 响应样本 | 缺失 |
| 4.4 | P1 | E2E 依赖真实 API Key，CI 不可靠 | 5.2 |
| 4.5 | P2 | 覆盖率工具未指定 | 5.1 |
| 4.6 | P2 | 新 Adapter 无测试模板 | 缺失 |

### 维度 5: 文档示例 (Documentation) - 5/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 5.1 | P0 | 无完整 Adapter 实现示例 | 设计文档 |
| 5.2 | P1 | adapters/ 目录无 README.md | 缺失 |
| 5.3 | P1 | 现有 PROVIDERS 迁移到 Adapter 无逐步指南 | 缺失 |
| 5.4 | P1 | 无 API 调用示例 | 缺失 |
| 5.5 | P2 | 无常见错误排查指南 | 缺失 |
| 5.6 | P2 | 无版本兼容矩阵 | 缺失 |

### 维度 6: 调试支持 (Debugging) - 4/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 6.1 | P0 | Adapter 调用无统一日志格式 | 缺失 |
| 6.2 | P1 | 无 request ID 贯穿 router -> adapter -> log | 缺失 |
| 6.3 | P1 | testConnection 只返回 latencyMs 无分解 | base.js |
| 6.4 | P1 | 无 beforeCall/afterCall/onError 调试钩子 | 缺失 |
| 6.5 | P2 | 无 OpenTelemetry trace 集成 | 缺失 |
| 6.6 | P2 | 无 dryRun 模式验证参数 | 缺失 |

### 维度 7: 版本演进 (Versioning) - 5/10

| # | 严重度 | 问题 | 位置 |
|---|--------|------|------|
| 7.1 | P0 | IModelProvider 无版本字段 | base.js |
| 7.2 | P1 | 无 deprecation 流程 | 缺失 |
| 7.3 | P1 | 无能力协商（adapter.supports(method)） | 缺失 |
| 7.4 | P1 | 无 schema 迁移框架 | 缺失 |
| 7.5 | P2 | 无 semver 策略 | 缺失 |
| 7.6 | P2 | 无兼容性回归测试 | 缺失 |

---

## 四、改造建议（按优先级）

### P0 - 必须在 P3 实施前解决（6 项）

1. **接口隔离**: 拆分 9 方法为 IModelProvider（基础 7 方法）+ ILlmAdapter + ITtsAdapter + IImageAdapter + IVideoAdapter
2. **脚手架命令**: npm run new-adapter <name> 自动生成 Adapter + 测试 + 注册代码
3. **错误类型定义**: ProviderError 类（code/category/retryable）+ ERROR_CODES 常量
4. **完整 Adapter 示例**: 附录 C 提供 openai.js 完整实现
5. **mock 基础设施**: test-utils.js 含 createMockConfig/assertAdapterContract/MockTransport
6. **接口版本号**: IModelProvider.version = 1 + registry 兼容性检查

### P1 - P3 实施时同步解决（9 项）

1. base.js 方法体改为抛 NotImplementedError
2. config 参数分离为 credentials + options
3. validateConfig 在 registerAdapter 时自动调用
4. registry 重复注册错误包含已注册文件路径
5. adapters/README.md 目录约定 + 新增流程
6. 现有 PROVIDERS 迁移指南（附录 D）
7. 结构化日志 schema
8. request ID 贯穿 router -> adapter -> log
9. adapter.supports(method) 能力协商

### P2 - 体验提升（6 项）

1. adapters/_template.js 模板文件
2. adapter.capabilities() 返回支持的方法列表
3. estimateCost 标注为可选
4. ERROR_CODES 常量字典
5. beforeCall/afterCall/onError 调试钩子
6. adapter.dryRun(method, params) 验证参数

### P3 - 抛光（3 项）

1. yeoman/inquirer 交互式生成器
2. OpenTelemetry trace 集成
3. semver 策略 + 兼容性回归测试

---

## 五、关键设计改进建议

### 5.1 接口隔离方案

基础接口（7 方法）：id/displayName/models/categories/testConnection/estimateCost/validateConfig
LLM 混入：chatCompletion/streamChat
TTS 混入：synthesize
Image 混入：generateImage
Video 混入：generateVideo
静态版本号：static version = 1
能力协商：supports(method)

### 5.2 ProviderError 类型

ERROR_CODES: AUTH_FAILED/RATE_LIMIT/NETWORK/INVALID_CONFIG/PROVIDER_ERROR/UNKNOWN
ProviderError 属性：code/message/retryable/statusCode

### 5.3 mock 基础设施

createMockConfig(overrides)
assertAdapterContract(AdapterClass)
MockTransport（fetch 拦截 + 响应队列）

---

## 六、与设计文档差距

### 设计文档已覆盖
- 9 方法接口签名（2.3）
- 工厂注册表（2.4）
- 测试覆盖率目标（5.1）

### 本次审查新增（24 项）
- P0: 6 项（接口隔离、脚手架、错误类型、完整示例、mock 基础设施、版本号）
- P1: 9 项（默认实现、config 分离、validateConfig 前置等）
- P2: 6 项（模板、能力声明、调试钩子等）
- P3: 3 项（交互式生成器、trace、semver）

---

## 七、复审条件

P3 实施前需复审，通过条件：
1. P0 全部 6 项修复
2. P1 至少 6/9 项修复
3. 综合评分 >= 7.0/10
4. 接口设计 + 错误反馈 + 测试体验维度各自 >= 6/10

---

**审查人**: Phase 1.4 /plan-devex-review