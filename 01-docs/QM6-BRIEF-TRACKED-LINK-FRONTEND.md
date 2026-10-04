审查任务：Multi-Publish 桌面应用「发布历史 ↔ 表现数据关联链」修复（分支 publish-tracked-link-lineage，工作区 D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage）。

请只读审查，不要修改任何文件。把结论以 JSON 写入文件：
D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage/01-docs/QM6-FINDINGS-TRACKED-LINK-FRONTEND.json

JSON 结构：{"axis":"frontend","findings":[{"id":"F1","severity":"Critical|Warning|Info","file":"相对路径:行号","claim":"一句话结论","evidence":"你实际读到的代码","suggested_fix":"修复建议"}],"overall":"一句话总评"}

被审 diff（相对 origin/main，基线 e5fb069b）：
- apps/desktop/electron/bootstrap/phase4-events.js（+29/-1）
- apps/desktop/electron/services/tracked-content-link.js（新增 167 行）
- apps/desktop/electron/services/store/performance-loop-store.js（+37，两个新方法）
- 两个新测试文件；规格见 01-docs/PRD-PUBLISH-TRACKED-LINK-2026-10-04.md

请重点核查（命名 / 模式一致性 / 可维护性 / 集成风险，而不是重复后端轴的正确性）：
1) 命名与真源：`publishHistoryId` 这个键名承载的是「发布任务 id」——列名与语义错位是否有单点说明、
   是否会被下一个消费者按字面理解而写错；`linkExistingTrackedContent` 与既有 mixin 的命名/返回值风格是否一致；
2) 分层：判据层（纯函数）/编排层/存储层的职责边界是否清楚；service 直接依赖 store mixin 的方法名是否构成脆弱耦合；
3) 与既有模式对齐：本仓「无定论不写库」「单向证据」「迁移一次性且非破坏」「增量补齐只补不改已有行」这几条
   既有纪律，本实现是否有第二处口径或漏项；日志 tag/文案风格是否与既有 PerformanceLoop 系列一致；
4) 集成风险：渲染层是否还有其它地方读同一列或另建一份 join；`updateTrackedContent` 与新增
   `setTrackedPublishHistoryId` 是否会形成两个写者口径；`listRecords` 的 limit 语义（默认 50）是否被
   新代码正确绕过并且有防再犯锁；
5) 可测试性与可观测性：诊断计数（scanned/ambiguous/unmatched/unowned/historySkipped/writesAttempted/writeFailed）
   是否够用、是否会被静默丢弃；测试是否过度 mock。
