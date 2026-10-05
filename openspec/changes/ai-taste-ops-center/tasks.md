# Tasks: ai-taste-ops-center

## 1. 刀 1 —— 引擎注入化 + ops-center 后端（TDD）

- [ ] 1.1 引擎测试先红：ai-taste-remover.test.js 新 describe「词表注入与强度」——T1 注入 phraseMap 覆盖内置键（综上所述→自定义词）/ T2 disabledWords 含内置词则跳过替换 / T3 缺省构造行为逐字节不变（对照锁）/ T4 severityMap 影响 detectAITasteLevel 评分 / T5 intensity=1 跳过句长合并（等长句保留句号）/ T6 intensity=3 且 casual 启用口语化 / T7 词表遍历键序确定（同输入多次 process 同输出）
- [ ] 1.2 引擎测试先红：rewrite-engine-core.test.js 新 describe「AI 味定制注入」——C1 setAiTasteCustomization 空对象行为不变 / C2 自定义词端到端生效（rewrite() 结果含自定义替换）/ C3 策略 postProcess.aiTasteIntensity=1 消费 / C4 非法 intensity（0/4/'x'）回 2 / C5 未注入时 _postProcess 与现状逐字节一致
- [ ] 1.3 绿：ai-taste-remover.js 构造注入（phraseMap/disabledWords/severityMap/intensity 保持既有 options）+ _replaceAIPhrases/_densityThreshold/_severityOf 读实例字段 + 遍历键序排序；rewrite-engine-core.js setAiTasteCustomization/getAiTasteCustomization + _postProcess 消费（强度优先级：策略 > 缺省 2）——跑 1.1/1.2 全绿 + 既有包全量零回归
- [ ] 1.4 ops-center 测试先红：tests/test_rewrite_ai_taste_api.py——S1 种子 128 条幂等且与引擎内置对齐（抽 3 条核对）/ S2 CRUD 往返 / S3 重复 word 409 / S4 toggle 启停 / S5 校验拒绝表（换行 word/「.」word/S4 severity/空 replacement/超长/控制字符）/ S6 import 原子（部分非法整批拒）/ S7 runtime 字段含 enabled=0 条目 / S8 鉴权（未登录 401、非 admin 403）
- [ ] 1.5 绿：models.py 新表 RewriteAiTasteEntry + services/rewrite_ai_taste_service.py（种子=引擎内置导出/校验/CRUD/toggle/import/runtime getter）+ routers/rewrite_ai_taste.py + main.py 三处注册 + runtime_service.py 加 rewrite_ai_taste_map 字段——S1-S8 全绿 + pytest 全量零回归
- [ ] 1.6 刀 1 门禁与交付：本地 pytest + 引擎 vitest 全绿 → 提交 → push → PR（docs: quality-gates 记录 + ledger）→ CI 绿合并 → 回填销账

## 2. 刀 2 —— 桌面端接线 + 管理页（TDD）

- [ ] 2.1 桌面测试先红：ai-taste-map-manager.test.js——M1 sanitize 判据（与后端同表：控制字符/纯标点/超长/非法 severity 拒收）/ M2 applyRemote changed 判定（同内容 false、变更 true）/ M3 持久化往返（临时 userData）/ M4 getMap 仅含 enabled=1 且为 plain object / M5 getDisabled 数组 / M6 空下发清空覆盖层（回内置）
- [ ] 2.2 桌面测试先红：ops-center-sync.test.js 增例——Y1 payload.rewrite_ai_taste_map 消费调 applyRemote / Y2 缺字段跳过 / Y3 changed 时重注入 rewriteEngineService
- [ ] 2.3 绿：services/ai-taste-map-manager.js（sanitize/applyRemote/getMap/getDisabled/getSeverityMap/getCurrent + userData 原子持久化）+ ops-center-sync.js 消费块 + container.setup.js 注册注入 + phase1-context.js 接线 + phase5-ipc.js 透传 + rewrite-engine.js setAiTasteMapManager/_ensureEngine 注入——M1-M6/Y1-Y3 绿 + 桌面定向测试零回归
- [ ] 2.4 运营中心前端：api/rewriteAiTaste.js + views/RewriteAiTaste.vue（表格/筛选/搜索/新增编辑对话框/行内 toggle/删除/导入导出）+ router + menuItems（adminOnly）+ menu-visibility.test.js 同步
- [ ] 2.5 刀 2 门禁与交付：桌面定向 vitest + ops-center 前端 npm test+build + pytest 复跑 → 提交 → PR → CI 绿合并 → 回填销账

## 3. 文档与收口

- [ ] 3.1 专项 PRD：01-docs/PRD-REWRITE-AI-TASTE-OPS-CENTER-2026-10-03.md（六维度：数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字 + 决策记录 Q1-Q12 + 测试映射）
- [ ] 3.2 PRD-REWRITE-ENGINE.md §十六（去 AI 味运营中心化，指向专项 PRD）；01-docs/PRD.md 索引登记
- [ ] 3.3 AGENTS.md QM-2 新增「词库双端校验同判据」门禁条目（改 ops-center 校验或 manager sanitize 必须双侧同跑）
- [ ] 3.4 CHANGELOG 前插两刀条目；openspec archive 三同步（openspec archive + 任务归档 + 质量节拍复盘）
- [ ] 3.5 记忆三路沉淀（内置/learnings/EverOS）+ 回读验证
