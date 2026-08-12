## Why

场景上下文增强中间层（scene_context）已交付，但规则表（朝代/文化/题材/设定/道具/负面锚点）硬编码在桌面引擎 `story-context-engine.js` 中：运营人员无法查看/调整规则，规则迭代只能随桌面版本发布。同时 L1 体验验收发现打磨点：历史题材词表缺北宋/汴京等关键词（genre 误判 general）、场景内特有角色未关联、上下文块措辞生硬（「现代中/欧洲中」）。需要：① 规则数据化使其可被运营后台管理并随包/配置覆盖；② 修复打磨点。

## What Changes

- **引擎规则数据化**：`story-context-engine.js` 的规则表抽取为 `story-context-rules.json`（内置随包）；引擎加载优先级「内置 JSON → 外部配置覆盖（`STORY2VIDEO_CONTEXT_RULES_PATH` 环境变量或 `<userData>/config/story-context-rules.json`）→ 默认硬编码」；加载时 schema 校验，非法规则 fail fast 回退内置并告警，不静默使用坏规则。
- **引擎打磨修复**：① GENRE_RULES 历史词补全（北宋/南宋/汴京/临安/岳飞/元朝/大都等）；② 场景内角色识别（全局 characters 未命中时从场景文本识别）；③ 上下文块措辞优化（location 拼接改为「location，sceneText」消除「现代中/欧洲中」生硬读法）。
- **运营后台规则管理**：ops-center 新增「场景上下文规则」功能（admin）——GET 当前规则、PUT 保存（schema 校验）、POST 校验、GET 导出 JSON；持久化到 ops-center 数据库表；前端新增规则管理页面（JSON 编辑 + 校验 + 保存 + 导出 + 版本信息）。
- **测试与文档**：引擎 JSON 加载/覆盖/校验/回退 + 打磨回归；ops-center API pytest + 前端 build；PRD/手册/openspec 同步。

## Capabilities

### New Capabilities
- `story2video-scene-context-ops`: 场景上下文规则数据化与运营后台管理契约（规则 JSON schema、加载优先级与校验/回退语义、运营后台查看/编辑/校验/导出 API、前端页面、测试映射）。

### Modified Capabilities
<!-- 无 -->

## Impact

- 运行时代码：`apps/desktop/electron/services/story-context-engine.js`（规则数据化+打磨）、新增 `story-context-rules.json`、`ops-center/backend/routers/scene_context.py`、`services/scene_context_service.py`、`models.py`、`ops-center/frontend`（api/router/view）。
- 测试：`story-context-engine.test.js` 扩展、ops-center `tests/` pytest、前端 build。
- 文档：PRD.md 7.1.33 补充、product-manual、openspec specs、CHANGELOG、learnings、.quality-gates。
- 交付：codex/ 分支 + PR 合并；隔离 worktree `D:\Data\projects\mp-worktrees\mp-scene-context-ops`。
