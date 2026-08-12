# Design — story2video-scene-context-ops

## 1. 现状

- `apps/desktop/electron/services/story-context-engine.js`：规则表（DYNASTY/CULTURE/GENRE/SETTING/PROP/CHARACTER/TIME/VISUAL_STYLE/TONE/NEGATIVE_ANCHOR/COOKING_*）为代码常量，不可外部管理。
- ops-center：FastAPI（routers+services+models，admin 鉴权 `require_admin`）+ Vue3 前端（api/router/views），SQLAlchemy async + aiosqlite。
- L1 打磨点：GENRE_RULES 历史词缺口（北宋/汴京/岳飞→general）、场景内角色未关联、措辞「现代中/欧洲中」。

## 2. 目标架构

```
桌面端 story-context-engine.js
   ├─ 内置规则：story-context-rules.json（随包，单一数据来源）
   ├─ 外部覆盖（优先级高）：
   │    STORY2VIDEO_CONTEXT_RULES_PATH 环境变量
   │    或 <userData>/config/story-context-rules.json（运营后台导出后放置）
   └─ 加载流程：resolveContextRules() → schema 校验（失败→回退内置+告警，不静默用坏规则）

运营后台 ops-center
   ├─ GET  /api/v1/scene-context/rules           → 当前规则（含来源/版本）
   ├─ POST /api/v1/scene-context/rules/validate  → schema + 结构校验（返回错误明细）
   ├─ PUT  /api/v1/scene-context/rules           → 保存（admin，DB 表 scene_context_rules）
   └─ GET  /api/v1/scene-context/rules/export    → 导出 JSON（供合入仓库随包发布）
```

## 3. 规则 JSON schema（v1）

```jsonc
{
  "version": 1,
  "dynasty":  [ { "keywords": ["唐朝","唐代"], "name": "唐朝", "period": "唐朝（618-907）", "visualStyle": "...", "era": "ancient" } ],
  "culture":  [ { "keywords": ["中国","长安"], "culture": "中国", "regions": ["长安"] } ],
  "genre":    [ { "keywords": ["历史","唐朝","北宋"], "genre": "历史" } ],
  "setting":  [ { "keywords": ["做饭","厨房"], "setting": "民居厨房" } ],
  "props":    { "ancient": [ { "keywords": ["土灶","柴火"], "name": "土灶柴火" } ], "modern": [ ... ] },
  "characters": ["老妇人","将军"],
  "time":     { "timeOfDay": ["清晨"], "season": ["春"] },
  "visualStyle": [ { "keywords": ["水墨"], "style": "水墨国画风格" } ],
  "tone":     [ { "keywords": ["悲壮"], "tone": "悲壮" } ],
  "negativeAnchors": { "ancient": ["电烤箱"], "modern": ["油灯"] },
  "cooking":  { "positiveProps": { "ancient": ["土灶"], "modern": [] }, "negativeAnchors": { "ancient": ["电烤箱"], "modern": ["土灶"] } }
}
```

校验规则：必需键齐全；数组项含必需字段且 keywords 非空数组；字符串字段非空；era 枚举 ancient/modern；props/negativeAnchors/cooking 结构合法。校验失败返回逐项错误（path + message）。

## 4. 引擎改动

- 新增 `story-context-rules.json`（从现有常量导出）；引擎 `loadContextRules()` 同步加载（内置 require + 外部覆盖 JSON 读取 + `validateContextRules()` 校验 + 失败回退内置并 `log.warn`）。
- 规则表常量改为从加载结果派生（保持既有导出名兼容测试/调用方）；新增导出 `getContextRules()/validateContextRules()`。
- 打磨：
  - GENRE_RULES 补：历史 += 北宋/南宋/汴京/临安/岳飞/元朝/大都/明清 等；可加 科幻 += 太空站/火星（可选）。
  - `buildSceneContextBlock` 角色：全局 characters 未命中时用 `CHARACTER_RULES` 在场景文本直接识别（返回临时 character { name, descriptor: name }）。
  - 措辞：`location ? location + '，' + sceneText : sceneText`（替换「中，」），并让 eraLabel 为 modern 时取「现代都市」风格描述。
- 兼容：`isCookingScene` 改为基于 SETTING_RULES 中「民居厨房」命中 + cooking 关键词（保留原语义）。

## 5. 运营后台改动

- `models.py`：`SceneContextRules(Base)` — id/key(唯一 'default')/content(JSON 文本)/version/updated_by/updated_at。
- `services/scene_context_service.py`：get_rules / save_rules（schema 校验 + 更新版本）/ validate_rules / export_rules。
- `routers/scene_context.py`：GET/POST validate/PUT/GET export，读用 get_current_user，写用 require_admin。
- `frontend`：`api/scene-context.js` + `router` 新路由 + `views/SceneContextRules.vue`（JSON 编辑 + 校验按钮 + 保存 + 导出 + 版本/来源展示）；导航「运营 → 场景上下文规则」。

## 6. 测试策略

| 层 | 覆盖 |
|---|---|
| 引擎单测 | 规则 JSON 加载（内置/环境变量/配置文件）、schema 校验失败回退内置、打磨回归（北宋 genre、场景角色、措辞）、既有 25+ 用例不回归 |
| ops-center pytest | GET/PUT/validate/export 正常 + admin 鉴权 + 非法 JSON 400/422 + DB 持久化 |
| 前端 | `npm run build` 通过（新增 view 编译）；不新增复杂交互测试 |

## 7. 变更文件清单

- apps/desktop/electron/services/story-context-rules.json（新增）
- apps/desktop/electron/services/story-context-engine.js（规则加载 + 打磨）
- apps/desktop/electron/services/story-context-engine.test.js
- apps/desktop/package.json files 数组（含 rules.json，若 glob 未覆盖）
- ops-center/backend/{models.py,routers/scene_context.py,services/scene_context_service.py}
- ops-center/backend/tests/test_scene_context.py
- ops-center/frontend/src/{api/router/views} 场景上下文规则页面
- 文档：PRD.md 7.1.33 补充、product-manual、openspec specs、CHANGELOG、learnings、.quality-gates

## 8. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 规则 JSON 与代码常量漂移 | schema 校验 + 单测断言「加载结果覆盖全部历史规则名」 |
| 外部配置放坏规则 | 校验失败回退内置 + 告警，绝不 fail 整条流水线 |
| 运营后台与桌面同步时差 | 导出即合入仓库随包发布；文档明确「配置生效需随桌面发布」 |
| 并发会话争用 main | 隔离 worktree + 频繁提交 |
