# Tasks — story2video-scene-context-ops

> 进度单一来源：以本文件 checkbox 为准。TDD 优先，每个任务标注测试目标。

## 审计与前置
- [ ] 基线审计：origin/main 含 scene_context 引擎/流水线（engine 规则表硬编码）；ops-center 模式（routers+services+models+admin 鉴权）确认；L1 打磨点复现（北宋 genre=general、场景角色 ∅、「现代中/欧洲中」）
- [ ] OpenSpec change 创建 + validate 通过

## 实现（codex/story2video-scene-context-ops 分支，隔离 worktree）

### 任务 1：引擎规则数据化
- [ ] 从现有常量导出 `story-context-rules.json`（内置，单一来源）
- [ ] 引擎 `loadContextRules()`：外部覆盖（env/userData）→ 内置 JSON → 代码默认；`validateContextRules()` schema 校验；失败回退内置+告警
- [ ] 规则常量改为从加载结果派生（保持导出兼容）；新增 `getContextRules()`
- [ ] 测试：story-context-engine.test.js 新增 加载优先级/外部覆盖/非法回退/历史规则名全覆盖 用例
- 测试目标：`apps/desktop/electron/services/story-context-engine.test.js`

### 任务 2：引擎打磨修复
- [ ] GENRE_RULES 补历史词（北宋/南宋/汴京/临安/岳飞/元朝/大都等）+ 对应回归用例
- [ ] 场景内角色识别（全局未命中时从场景文本识别，descriptor 回退角色名）+ 用例
- [ ] 措辞优化（location，sceneText；消除「中，」生硬读法）+ 用例
- 测试目标：`apps/desktop/electron/services/story-context-engine.test.js`

### 任务 3：运营后台后端
- [ ] models.py SceneContextRules 表 + service（get/save/validate/export，version+updated_by）
- [ ] routers/scene_context.py（GET/POST validate/PUT/GET export；读登录、写 admin）
- [ ] pytest：正常/鉴权/非法 JSON 400/422/持久化
- 测试目标：`ops-center/backend/tests/test_scene_context.py`

### 任务 4：运营后台前端
- [ ] api/scene-context.js + 路由 + views/SceneContextRules.vue（JSON 编辑/校验/保存/导出/版本）
- [ ] 前端 `npm run build` 通过
- 测试目标：`npm run build`（ops-center/frontend）

### 任务 5：文档与门禁
- [ ] PRD.md 7.1.33 补充规则管理/运营后台；product-manual 补充；CHANGELOG/learnings/.quality-gates 同步
- [ ] 聚焦回归（引擎+ops-center pytest+前端 build）+ 双模型审查
- [ ] 提交→push→PR→CI→合并→三同步归档→记忆更新
- 测试目标：文档一致性
