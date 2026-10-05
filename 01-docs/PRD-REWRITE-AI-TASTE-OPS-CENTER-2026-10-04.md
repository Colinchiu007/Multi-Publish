# PRD — 去 AI 味词库运营中心化（ai-taste-ops-center，2026-10-04）

> **变更类型**: 📦 新功能（跨 ops-center 后端/前端 + 桌面端 + 引擎包） | **PRD 版本**: v1.0 | **流程**: 质量节拍完整节拍（OpenSpec change `ai-taste-ops-center` + TDD 两刀 + QM-5/QM-6）
> **关联文档**: [PRD-REWRITE-ENGINE.md](./PRD-REWRITE-ENGINE.md) §十五（去 AI 味实现与设置——本 PRD 是其「设置面」的落地）、[openspec/changes/ai-taste-ops-center](../openspec/changes/ai-taste-ops-center/proposal.md)（proposal/design/delta-spec/tasks 四件套）

## 一、目标与非目标

### 1.1 目标

把去 AI 味（`AITasteRemover`）的**词表数据**与**强度参数**从代码常量升级为运营中心可维护的运行时配置，打通「运营中心管理 → runtime/bootstrap 签名下发 → 桌面端 manager → 引擎注入」全链路（照 rewrite-hard-constraints 同构四件套先例）。

### 1.2 非目标（Explicit Non-Goals）

1. **开场正则（FORBIDDEN_OPENING_PATTERNS 13 条）与口语化映射（COLLOQUIAL_MAP 6 条）不进运营中心**——正则自由编辑是注入面，口语化与 tone 强耦合价值低（Q1 定案）；
2. 词库**版本化/回滚 UI**（Q3：单份可编辑表 + 审计字段；版本化登记 P2）;
3. `_scoreFromPatterns` 评分权重可配（不暴露）;
4. **渲染进程（改写页）零改动**——终端用户面不变：无开关、无强度滑杆（终端用户仍只能通过选策略间接影响）;
5. 词库条目的多语言治理（由管理员自管）。

## 二、设计决策记录（grilling 会话 Q1-Q12，全部按推荐定案）

| # | 决策 | 要点 |
|---|---|---|
| Q1 | 词表建模 | 扁平单表（word → replacement + severity S1/S2/S3） |
| Q2 | 与内置表关系 | **叠加 + 键覆盖**：内置 117 条是安全底线，运营中心同键覆盖 |
| Q3 | 版本化 | 单份可编辑表 + 审计字段（updatedBy/updatedAt）；版本化 P2 |
| Q4 | 强度参数 | 进策略 `postProcess.aiTasteIntensity`（1-3 整数，缺省回 2，零新表） |
| Q5 | 生效语义 | 即时生效（引擎 setter 注入 + remover 每次改写新建） |
| Q6 | 交付切法 | 两刀：刀 1 引擎+后端（PR #2877）、刀 2 桌面接线+管理页（本 PR） |
| Q7 | 禁用语义 | 条目 `enabled` 字段：false = 引擎跳过该词替换（含禁用内置词） |
| Q8 | 条目校验 | word≤30 / replacement≤50 / severity 枚举 / 拒控制字符（strip 前检测）/ 拒纯标点与单字符正则元字符 |
| Q9 | 下发通道 | 并入 runtime/bootstrap（`rewrite_ai_taste_map` 字段，白嫖整包 Ed25519 签名） |
| Q10 | 管理页形态 | 全量表格 + 前端筛选 + JSON 导入导出（不分页——词表量级稳定在几百条内） |
| Q11 | 权限 | adminOnly（照硬约束先例） |
| Q12 | 引擎注入形态 | 构造参数注入（`AITasteRemover({phraseMap, disabledWords, severityMap})`，缺省回常量） |

## 三、数据校验（维度 1）

### 3.1 条目判据（双端同判据——ops-center validate_payload 与桌面 sanitizeRemoteEntry 逐条对齐，parity 自查 6/6 OK）

| 字段 | 规则 | 违例处理 |
|---|---|---|
| word | 非空、trim、≤30 码点、**strip 前检测控制字符**（\x00-\x1f\x7f，防尾部换行逃过）、拒绝纯标点/符号（Unicode 区段枚举）与单字符正则元字符（`.` `^` `$` 等） | ops-center 400 / 桌面端跳过该条 |
| replacement | 非空、trim、≤50 码点、无控制字符 | 同上 |
| severity | ∈ {S1, S2, S3}；**明确下发但非法 → 拒绝**，缺省 → S2 | ops-center 400 / 桌面端跳过 |
| enabled | 0/1（JSON true/false） | 缺省 true |
| description | ≤200 字 | 超长拒绝 |

### 3.2 判据依据

- **控制字符**：strip 前检测（S6 实测教训：strip 会剥掉尾部换行导致逃过）；
- **正则元字符**：引擎 `escapeRegex` 已保证不崩溃，拒绝的是**语义风险**（word=`.` 使每字符成替换点）；
- **severity 非法**：桌面端「缺省回 S2 / 明确非法拒绝」的不对称与 ops-center 400 语义一致。

### 3.3 批量导入

- 单批 ≤500 条，**整批原子**：任一条目非法整批 400（报「第 N 条非法：原因」），成功则全量落库（word 幂等键：同键覆盖替换方向，软删行恢复）。

## 四、流程（维度 2）

```
运营中心管理页（/rewrite-ai-taste，adminOnly）
  → POST/PUT/DELETE/toggle/import /api/v1/rewrite-ai-taste（require_admin）
  → runtime/bootstrap（get_runtime_bootstrap）聚合
      "rewrite_ai_taste_map": [{word, replacement, severity, enabled}, ...]  ← 全量未删条目（含 enabled=0）
  → 整包 Ed25519 签名（既有机制，词表自动获得防篡改保护）
  → 桌面端 OpsCenterSync.applyRuntime：
      Array.isArray(payload.rewrite_ai_taste_map) && manager 存在
        → manager.applyRemote(...) → changed?
            true  → rewriteEngineService.setAiTasteMapManager(manager)（_engine=null 强制重建）
            false → 仅记日志
  → RewriteEngineService._ensureEngine 重建引擎：
      engine.setAiTasteCustomization({ phraseMap: getMap(), disabledWords: getDisabled(), severityMap: getSeverityMap() })
  → 改写时 _postProcess：new AITasteRemover({ ..., phraseMap, disabledWords, severityMap })
      → Pass 1 替换：内置 117 条 + 覆盖层（同键覆盖）− 禁用词
  → 下次 re-sync 重复上述（即时生效，免重启）
```

**离线/未配置回退**：桌面端从未收到词库（首次安装/未配置运营中心）→ `setAiTasteCustomization` 不被调用 → `AITasteRemover` 缺省回内置 `AI_PHRASE_MAP`，行为与升级前逐字节一致（T3/C1/缺省锁三层测试钉死）。

**强度链路**（与词库通道独立）：管理员在策略 postProcess JSON 加 `"aiTasteIntensity": 1|2|3` → 随既有 `rewrite_strategies` 通道下发 → 引擎 `_postProcess` 读取（非法回 2）→ 1=仅词级替换（跳 Pass 3 句长修复与口语化）/ 2=现状 / 3=追加 casual 口语化。

## 五、功能逻辑（维度 3）

| 组件 | 文件 | 职责 |
|---|---|---|
| AITasteRemover 注入 | packages/rewrite-engine/src/ai-taste-remover.js | 构造时合并覆盖层与内置表（键序确定性排序重建）；`_replaceAIPhrases`/`detect`/`_severityOf` 读实例字段；disabledWords 跳过 |
| 引擎 setter | packages/rewrite-engine/src/rewrite-engine-core.js | `setAiTasteCustomization`（非对象忽略/字段白名单清洗）+ `_postProcess` 消费（强度解析 + remover 构造透传） |
| ops-center service | ops-center/backend/services/rewrite_ai_taste_service.py | 种子 117 条（引擎内置导出，severity 按 s1Words 分级）幂等播种 / validate_payload / list/create/update/delete/toggle/import/list_runtime |
| ops-center router | ops-center/backend/routers/rewrite_ai_taste.py | 7 端点（GET 列表/GET runtime 免鉴权/POST/PUT/DELETE/toggle/import）鉴权矩阵照硬约束先例 |
| bootstrap 下发 | ops-center/backend/services/runtime_service.py | `rewrite_ai_taste_map` 字段（:353） |
| 桌面 manager | apps/desktop/electron/services/rewrite-ai-taste-map-manager.js | sanitize（同判据）/applyRemote（全量替换+changed）/getMap（仅 enabled=1，plain object）/getDisabled/getSeverityMap/持久化（tmp+rename 原子写） |
| 桌面 sync | apps/desktop/electron/services/ops-center-sync.js | 消费块（:524-539 形态）+ setRewriteAiTasteMapManager |
| 桌面引擎服务 | apps/desktop/electron/services/rewrite-engine.js | setAiTasteMapManager（_engine=null）+ _ensureEngine 注入（try/catch，失败回内置） |
| 管理页 | ops-center/frontend/src/views/RewriteAiTaste.vue | 见 §七 |

## 六、交互逻辑（维度 4）

### 管理页（运营中心，admin）

| 操作 | 交互 | 反馈 |
|---|---|---|
| 查询 | 搜索框（word/替换词模糊，前端过滤）+ severity 下拉（全部/S1/S2/S3）+ 状态下拉（全部/启用/停用） | 表格实时过滤，底部显示「共 N 条，当前显示 M 条」 |
| 新增 | 「新增词目」→ 对话框（word 可编辑/replacement/severity 下拉/说明）→ 保存 | 成功 toast + 列表刷新；409 提示「词目已存在」；400 展示后端 detail |
| 编辑 | 行内「编辑」→ 对话框（**word 只读**——主键不可改；界面注明「改词请删除后新增」） | 同上 |
| 启停 | 行内 el-switch → POST toggle | 开关按后端返回值回显；toast 注明语义（「已停用（桌面端跳过该词替换）」） |
| 删除 | 行内「删除」→ ElMessageBox 确认（说明删除后的回退语义：内置词回内置替换/新增词不再替换） | 成功 toast + 刷新 |
| 导出 | 「导出 JSON」→ 前端 Blob 下载 `ai-taste-map-export-<date>.json`（仅四字段） | 浏览器下载 |
| 导入 | 「导入 JSON」→ 文件选择（.json）→ 前端解析（支持数组或 {entries:[]}）→ ElMessageBox 确认条数与原子语义 → POST /import | 成功「已导入 N 条」+ 刷新；400 展示首个错误 |

### 桌面端（无用户交互，运行时自动）

sync 成功即生效，无 UI；词库落盘 `userData/rewrite-ai-taste-map.json`（应用重启后 load 恢复，不依赖运营中心在线）。

## 七、显示项（维度 5）

**管理页**（唯一新增 UI 面）：

| 项 | 说明 |
|---|---|
| 页头说明 | 「叠加 + 键覆盖」语义、内置表底线、停用语义、即时生效说明 |
| 表格列 | 原词 / 替换词 / 级别 tag（S1 红 S2 橙 S3 灰）/ 启用 switch / 更新人 / 更新时间 / 操作 |
| 空态 | el-empty「无匹配词目」（筛选无结果时） |
| 计数条 | 「共 N 条，当前显示 M 条」+ 编辑主键说明 |

**改写页（桌面端）**：零变化——不显示词库状态/同步状态/任何词库相关提示（运维配置对终端用户透明是既定产品决策）。

## 八、提示文字（维度 6）

| 场景 | 文案 | 位置 |
|---|---|---|
| 创建成功 | 「词目已创建」 | 管理页 toast |
| 更新成功 | 「词目已更新」 | 管理页 toast |
| 启用/停用 | 「已启用（恢复该词替换）」/「已停用（桌面端跳过该词替换）」 | 管理页 toast |
| 删除确认 | 「确定删除词目「X」？删除后该词回到引擎内置替换（若为内置词）或不再替换（若为新增词）。」 | ElMessageBox |
| 导入确认 | 「将导入 N 条词目（按 word 幂等覆盖既有条目）。导入是整批原子的：任一条目非法整批拒绝。继续？」 | ElMessageBox |
| 导入解析失败 | 「JSON 解析失败：请导出格式为「条目数组」或「{ entries: [...] }」的文件」 | toast |
| 校验失败 | 后端 detail 原文（「word 不能超过 30 字」「word 不能是纯标点或单字符正则元字符：'.'」等） | toast |
| 加载失败 | 「加载词库失败」（detail 缺省时） | toast |

无 locale 变更（管理页在运营中心前端，非桌面端 locales 域）。

## 九、测试映射（TDD 先红后绿实录）

| 层 | 文件 | 用例 | 结果 |
|---|---|---|---|
| 引擎单元 | ai-taste-remover.test.js「词表注入与强度」 | T1 覆盖内置键 / T2 disabledWords 跳过 / T3 缺省逐字节不变（对照锁）/ T4 severityMap 评分 / T5 intensity=1 跳 Pass 3 / T6 intensity=3 口语化 / T7 键序确定 / T8 大小写不敏感 | 先红 4，后绿 8/8 |
| 引擎编排 | rewrite-engine-core.test.js「AI 味定制注入」 | C1 空对象行为不变 / C2 自定义词端到端 / C3 强度=1 消费 / C4 非法回 2 / C5 未注入不变 | 先红 4，后绿 5/5 |
| ops-center API | test_rewrite_ai_taste_api.py | S1 种子对齐 117 条 / S2 CRUD / S3 重复 409 / S4 toggle / S5 校验拒绝表 9 例 / S6 import 原子 / S7 runtime 含 enabled=0 / S8 鉴权矩阵 | 先红（无模块），后绿 8/8 |
| 桌面 manager | rewrite-ai-taste-map-manager.test.js | M1 判据拒绝表 / M2 changed 判定 / M3 持久化往返 / M4 getMap / M5 getDisabled / M6 空下发清空 / M7 非法跳过 | 先红（无模块），后绿 9/9 |
| 桌面 sync | ops-center-sync.test.js「词库消费」 | Y1 调 applyRemote / Y2 缺字段跳过 / Y3 changed 重注入 / Y4 抛错隔离 | 后绿 4/4（补硬约束先例缺的同类覆盖） |
| 前端 | menu-visibility.test.js | adminOnly 清单 5→6 | 绿 |

**全量回归**：引擎 194/194、ops-center pytest 478/478、桌面定向 81/81、前端 vitest 57/57、vite build exit 0、eslint 0 error。

## 十、交付与风险

| 项 | 说明 |
|---|---|
| 交付 | 刀 1 PR #2877（merge `d049bfb3`）+ 刀 2 PR #2884 |
| OpenSpec | change `ai-taste-ops-center`（proposal/design/delta-spec/tasks），归档见 tasks §3.4 |
| 风险 1：词表错误影响产出风格 | adminOnly + 确认弹窗 + 导入原子 + 引擎内置底线（覆盖层只改方向，清空即回内置） |
| 风险 2：bootstrap payload 增大 | 117 条 × ~150B ≈ 20KB（实测可控）；词表增长由 MAX_IMPORT_BATCH 与 word≤30 天然限界 |
| 风险 3：双端判据漂移 | AGENTS.md QM-2 新增「词库双端校验同判据」门禁条目（改任一侧必须双侧同跑） |
| QM-6 | 外部评审子代理超时（约 6 分钟无产出），按 fix-rewrite-paragraph-preserve 先例**标记评审降级**，主代理对照式自查替代：双端判据 parity 6/6、注入异常隔离 3/3、接线触点 9/9——如实记录，不虚报外部评审通过 |
