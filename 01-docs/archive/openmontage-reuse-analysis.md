# OpenMontage 代码复用分析报告

**日期**: 2026-07-06
**分支**: main
**Python 测试**: 98 tests / ALL GREEN

## 总体结论

OpenMontage 与 Multi-Publish 分属两个不同业务领域：

| 维度 | OpenMontage | Multi-Publish |
|------|------------|---------------|
| 业务 | AI 视频创作平台 | 多平台内容发布工具 |
| 核心资产 | Python 工具链 + Pipeline 编排 + AI 提供商集成 | Electron 桌面应用 + RPA 引擎 + Vue UI |
| 已有复用 | Remotion 合成器 + 场景组件 + 主题 (≈8%) | 发布器 + 微信公众号/抖音/小红书/B站 |

## 已复用的模块

### Remotion 合成器 (Phase 0, 已完成)
- Root.tsx 13 个 Composition 全部注册
- 15+ 场景组件 (TextCard, StatCard, BarChart, AnimeScene 等)
- 4 套主题系统全部一致
- render-engine.js / ipc-handlers/render.js / preload.js / CreateView.vue

### MediaTrace 模式复用 (Phase 1-3, 已完成)
- media-downloader.js — 流式下载管线 (17 tests)
- tasks-repo.js — 6 状态任务调度 (24 tests)
- store-interface.js — Store 接口 + Factory (5 tests)
- abort-utils.js — AbortSignal 工具 (12 tests)
- cookie-converter.js / stealth-preload.js — 浏览器自动化增强

### TikHub 基础设施模式 (已完成)
- _errors.py — 15 层异常体系
- _retries.py — 指数退避 + jitter
- _rate_limit.py — 速率限制解析
- _http_client.py — 统一 HTTP 客户端
- _auth.py — BearerAuth + AuthMiddleware
- _pagination.py — 分页器工具
- precheck.py — 发布前查重引擎
- tikhub_bridge.py — TikHub SDK 桥接

### scoring.py (本次, 刚完成)
- ContentQualityScore — 内容质量评分 (标题清晰度/内容深度/可读性/SEO/互动性)
- PlatformFitScore — 平台适应度评分
- 20 tests ALL GREEN

## 评估不可复用的模块 (决策记录)

| 模块 | 原因 |
|------|------|
| tools/cost_tracker.py | AI 视频制作预算管理，Multi-Publish 无此需求 |
| lib/delivery_promise.py | 8 种视频交付承诺分类，与发布无关 |
| tools/enhancement/* | 图像/视频增强 (去背景/调色/人脸修复)，不相关 |
| tools/capture/* | 屏幕录制，不相关 |
| tools/analysis/* | 视频分析 (场景检测/人脸跟踪/转录)，不相关 |
| lib/checkpoint.py | Pipeline 检查点，发布流程过于简单无需此复杂度 |
| lib/config_model.py | Pydantic 配置，已有自身配置系统 |
| tools/base_tool.py | 插件基类，已有 publisher base |
| tools/tool_registry.py | 工具注册表，已有 platform_registry |

## 总结

**OpenMontage 的可复用部分 (≈8%) 已全部完成适配。** 其余 92% 的代码（AI 视频生成、动画、语义搜索，管线编排等）对 Multi-Publish 的场景不适用。

两个项目业务领域差异过大，强行复用只会引入不必要的复杂度。推荐将精力集中在 Multi-Publish 自身领域：
1. 完善 RPA 发布器 (B站/小红书 publish() 实装)
2. 前端 PreCheck 开关集成
3. E2E 测试覆盖
