审查任务：Multi-Publish 桌面应用「发布历史 ↔ 表现数据关联链」修复（分支 publish-tracked-link-lineage，工作区 D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage）。

请只读审查，不要修改任何文件。把结论以 JSON 写入文件：
D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage/01-docs/QM6-FINDINGS-TRACKED-LINK-BACKEND.json

JSON 结构：{"axis":"backend","findings":[{"id":"B1","severity":"Critical|Warning|Info","file":"相对路径:行号","claim":"一句话结论","evidence":"你实际读到的代码/命令输出","suggested_fix":"修复建议"}],"overall":"一句话总评"}

被审 diff（相对 origin/main，基线 e5fb069b）：
- apps/desktop/electron/bootstrap/phase4-events.js（+29/-1）
- apps/desktop/electron/services/tracked-content-link.js（新增）
- apps/desktop/electron/services/store/performance-loop-store.js（+37）
- apps/desktop/electron/services/tracked-content-link.test.js（新增 20 例）
- apps/desktop/electron/bootstrap/phase4-events-tracked-content.test.js（新增 8 例）
- 规格：01-docs/PRD-PUBLISH-TRACKED-LINK-2026-10-04.md

背景（一句话）：tracked_content.publish_history_id 自诞生起全 NULL（实测活库 73 行 0 已关联），
导致发布历史页表现列恒空；本 PR 在写入点透传 task.id，并新增一次性、幂等、按 (归属,平台,作品id)
唯一命中才回填的存量修复。关键约束：该列语义＝发布任务 id（读侧 PublishHistory.vue:602-608 的 join），
不是发布历史行自己的 entry.id。

请重点核查（正确性 / 边界 / 安全 / 是否真的满足规格）：
1) 归属隔离：跨用户、legacy（历史 JSONL 无 owner 字段 vs SQLite LEGACY_OWNER_SUBJECT）是否会互链或永远接不上；
2) 回填在「本会话首次 task:success」触发，是否可能阻塞或影响发布主流程；异常与部分失败是否如实出声；
3) 「唯一命中才写」与 SQL 端 IS NULL 兜底是否真的不可被绕过；歧义计数是否正确；
4) 空 postId / 无主行 / store 未就绪 / listRecords 抛错 四条出口是否都有对应测试；
5) 测试是否可能恒真（假绿）：夹具是否真的用真 sqlite 与真迁移，断言是否读实际落库值而不是读参数快照；
6) 是否存在把「表现列恒空」改成「显示错误数据」的风险（例如把 A 的快照显示在 B 的历史记录上）。
