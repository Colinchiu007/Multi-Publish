## 1. 引擎侧
- [x] 1.1 RewriteEngine 新增 setHardConstraints + _getHardConstraintPrompt（最前置注入 + 冲突声明）（#2011 `1aa6aa85`；`rewrite-engine-core.js` setHardConstraints + `_buildPrompt` 内联构造硬约束段置 systemPrompt 最前 + 冲突裁决声明。注记：`_getHardConstraintPrompt` 未作独立方法，逻辑内联于 `_buildPrompt`，实质等价）
- [x] 1.2 移除 _buildPrompt 硬编码纯文案约束（升级为种子数据）（#2011；引擎不再硬编码，`BUILTIN_DEFAULT_HARD_CONSTRAINTS` 仅作离线回退（#2015 `73ccdf29` M1 加固）；种子 `hard-constraint-default-v1` 在 ops-center `rewrite_hard_constraint_service.py`）
- [x] 1.3 引擎测试：注入/未注入/优先级声明（`tests/rewrite-engine-core.test.js` H1-H4 四例 + F1/W8（#2015），文件共 44 test）

## 2. 桌面端
- [x] 2.1 RewriteHardConstraintManager（JSON 持久化 + sanitize + applyRemote）（#2011；`services/rewrite-hard-constraint-manager.js`：tmp+rename 原子写 / 内容≤5000·标题≤200·数组形态取 is_default / applyRemote）
- [x] 2.2 OpsCenterSync 消费 bootstrap.rewrite_hard_constraints（#2011；`services/ops-center-sync.js` 消费 payload；#2015 M2：内容变化失效引擎缓存）
- [x] 2.3 RewriteEngineService 注入引擎 + container/phase1 接线（#2011；`services/rewrite-engine.js` setHardConstraintManager + `_ensureEngine` 注入；`core/container.setup.js` 注册；`bootstrap/phase1-context.js` 接线；#2015 m4：phase5-ipc 死接线注记）
- [x] 2.4 桌面端测试（`services/rewrite-hard-constraint-manager.test.js` 8 test，与 #2011 commit message 一致）

## 3. ops-center 后端
- [x] 3.1 RewriteHardConstraint 模型 + 建表（#2011；`backend/models.py` RewriteHardConstraint，建表经 `database.py` create_all）
- [x] 3.2 rewrite_hard_constraint_service（CRUD + 唯一默认事务 + 种子数据）（#2011；#2015 加固：C1 软删除恢复激活 / m1 create 消费 enabled / m2 批量清默认不污染审计 / m3 get_default_runtime ORDER BY）
- [x] 3.3 routers/rewrite_hard_constraints（列表/创建/更新/删除/设默认/runtime）（#2011；`routers/rewrite_hard_constraints.py` 6 端点）
- [x] 3.4 runtime_service bootstrap 下发默认版本（#2011；`services/runtime_service.py` bootstrap 携带 rewrite_hard_constraints）
- [x] 3.5 main.py 注册 + pytest（#2011；`tests/test_rewrite_hard_constraints_api.py` 8 个 test_（#2011 6 例 + #2015 增 2 例））

## 4. ops-center 前端
- [x] 4.1 api/rewriteHardConstraints.js（#2011；list/create/update/delete/setDefault 5 函数）
- [x] 4.2 views/RewriteHardConstraints.vue（列表+编辑+删除+设默认）（#2011；列表含默认/内置/启用标记 + 编辑对话框 + 非默认才可删 + 设默认确认）
- [x] 4.3 router + menuItems（#2011；`src/router/index.js` /rewrite-hard-constraints + `menuItems.js` Lock 图标 adminOnly）
- [x] 4.4 前端 build 验证（CI 证据：#2011 mergedAt 2026-09-18 required checks 含 ops-center `npm run build`；#2015 复验）

## 5. 文档与交付
- [x] 5.1 PRD 章节（#2011；`01-docs/PRD.md`「2026-09-19 · 改写硬约束系统」完整章节，+82 行）
- [x] 5.2 双模型审查（#2015 `73ccdf29`：C1/M1/M2/m1-m4/W8 共 9 项全部落地修复，代码留痕 test H2「审查 M1」/ phase5-ipc「审查 m4」）
- [x] 5.3 PR + CI（#2011 与 #2015 均已合并进 main）
