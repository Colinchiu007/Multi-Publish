# Tasks: 热文采集模块集成

## Phase 1: 快速集成（0-30 天）

### 1.1 content-aggregator 包化适配 ✅
- [x] 1.1.1 修复 pth 文件指向正确路径（_archive_v1/src → src）
- [x] 1.1.2 验证核心导入（ContentPipeline, get_collector, RewriteProcessor, Collectors）
- [x] 1.1.3 python-backend pyproject.toml 添加 content-aggregator 依赖
- [x] 1.1.4 导入测试自动化（test_aggregation.py: 5 项导入测试）

### 1.2 Multi-Publish 依赖与封装 ✅
- [x] 1.2.1 python-backend/pyproject.toml 添加依赖
- [x] 1.2.2 新建 `multi_publish/aggregation/` 模块（__init__/models/service/router）
- [x] 1.2.3 实现 `AggregationService` 封装类
- [x] 1.2.4 实现 CollectRequest/RewriteRequest/BatchCollectRequest 等 Pydantic 模型
- [x] 1.2.5 AggregationService 单元测试（20 项全部通过）

### 1.3 API 端点 ✅
- [x] 1.3.1 `POST /aggregation/collect` — 单篇采集
- [x] 1.3.2 `POST /aggregation/collect/batch` — 批量采集
- [x] 1.3.3 `POST /aggregation/rewrite` — 改写
- [x] 1.3.4 `GET /aggregation/sources` — 可用源列表（12 源：4 无头 + 8 Phase2）
- [x] 1.3.5 `GET /aggregation/tasks/{task_id}` — 任务状态
- [x] 1.3.6 鉴权基础设施：shared auth deps 模块（identity_dependency 工厂）
- [x] 1.3.7 API 冒烟测试通过

### 1.4 前端页面 ⏳
- [x] 1.4.1 审查现有 Collection 页面：已有 URL 采集 + 剪贴板导入 + 草稿箱
- [ ] 1.4.2 Collection.vue 接入 Python aggregation API（后续任务）
- [ ] 1.4.3 改写风格选择器对接
- [ ] 1.4.4 采集结果列表增强
- [ ] 1.4.5 i18n 文案成对新增
- [ ] 1.4.6 前端测试

### 1.5 基础设施 ✅
- [x] 1.5.1 凭证桥接：AggregationService._build_pipeline_config 从环境变量读取 PO_OPENAI_*
- [x] 1.5.2 Playwright headless 共存验证
- [x] 1.5.3 隔离 worktree 建立 + 质量门禁通过

## Phase 2: 能力下沉（31-90 天）

> 迁移顺序按依赖拓扑序：模型 → 工具 → 过滤器 → 改写器 → 采集器基类 → 具体采集器。

- [ ] 2.1 数据模型层（Content/Article → shared/models/）
- [ ] 2.2 无状态工具层（LanguageDetector/Translator → shared/processors/）
- [ ] 2.3 过滤器层（SensitiveFilter/DedupFilter → shared/filters/）
- [ ] 2.4 改写器层（RewriteProcessor → shared/rewriters/）
- [ ] 2.5 采集器基类（BaseCollector/SourceResult → shared/collectors/base.py）
- [ ] 2.6 具体采集器（RSS→Sitemap→API→YouTube→...，get_collector 工厂最后）
- [ ] 2.7 评估 v2 monitor 复用
- [ ] 2.8 依赖切换（两个项目都只依赖 shared）

## Phase 3: 原项目退场（91-180 天）
- [ ] 3.1 content-aggregator 仓库归档或降级为薄壳
- [ ] 3.2 文档更新
