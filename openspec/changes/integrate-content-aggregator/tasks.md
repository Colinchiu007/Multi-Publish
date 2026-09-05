# Tasks: 热文采集模块集成

## Phase 1: 快速集成（0-30 天）

### 1.1 content-aggregator 包化适配
- [x] 1.1.1 修复 pth 文件指向正确路径 ✅（C1 已解决）
- [x] 1.1.2 验证核心导入（ContentPipeline, get_collector, RewriteProcessor, Collectors）✅
- [x] 1.1.3 补充 pyproject.toml 依赖（content-aggregator>=0.1.0）✅
- [x] 1.1.4 导入测试自动化（test_aggregation.py: 5 项导入测试）✅

### 1.2 Multi-Publish 依赖与封装
- [x] 1.2.1 python-backend/pyproject.toml 添加 content-aggregator 依赖 ✅
- [x] 1.2.2 新建 `multi_publish/aggregation/` 模块 ✅
- [x] 1.2.3 实现 `AggregationService` 封装类 ✅
- [x] 1.2.4 实现 `CollectRequest` / `RewriteRequest` Pydantic 模型 ✅
- [x] 1.2.5 测试：AggregationService 单元测试（15 项全部通过）✅

### 1.3 API 端点
- [x] 1.3.1 新增 `POST /api/v1/aggregation/collect` — 单篇 URL 采集 ✅
- [x] 1.3.2 新增 `POST /api/v1/aggregation/collect/batch` — 批量源采集 ✅
- [x] 1.3.3 新增 `POST /api/v1/aggregation/rewrite` — 改写 ✅
- [x] 1.3.4 新增 `GET /api/v1/aggregation/sources` — 可用源列表 ✅
- [ ] 1.3.5 新增 `GET /api/v1/aggregation/tasks/{task_id}` — 任务状态（Phase 2）
- [ ] 1.3.6 鉴权：所有端点使用 LogtoJwtVerifier（Phase 1 后续）
- [x] 1.3.7 测试：服务器路由注册验证 ✅

### 1.4 前端页面
- [ ] 1.4.1 审查现有 `Collection` 页面功能，决定扩展 vs 替换
- [ ] 1.4.2 新增/扩展 AggregationView 页面
- [ ] 1.4.3 实现 URL 输入组件
- [ ] 1.4.4 实现改写风格选择器
- [ ] 1.4.5 实现采集结果列表 + 操作按钮
- [ ] 1.4.6 注册路由和导航
- [ ] 1.4.7 i18n：zh.js / en.js 成对新增文案
- [ ] 1.4.8 测试：组件渲染测试 + E2E 采集流程

### 1.5 基础设施
- [ ] 1.5.1 凭证桥接：AggregationService 接受 credential_provider 回调
- [x] 1.5.2 Playwright headless 共存验证 ✅（C2 已解决）
- [ ] 1.5.3 集成健康检查：依赖版本扫描、导入时间、内存占用

## Phase 2: 能力下沉（31-90 天）
...

## Phase 3: 原项目退场（91-180 天）
...
