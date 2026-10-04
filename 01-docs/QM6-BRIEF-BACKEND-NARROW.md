# QM-6 替代通道任务书（后端轴，收窄版）

只读审查，禁止修改任何被审文件。结论**只能**写入这一个文件：
D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage/01-docs/QM6-FINDINGS-TRACKED-LINK-BACKEND-FALLBACK.json
（文件名带 -FALLBACK 是刻意的：主路由 codex 同时在写不带后缀的那份，两条通道不得写同一个文件，
否则谁赢取决于谁先结束。）

JSON 形如：{"axis":"backend","findings":[{"id":"B1","severity":"Critical|Warning|Info","file":"路径:行号","claim":"一句话","evidence":"你读到的代码/输出","suggested_fix":"建议"}],"overall":"一句话"}
最多 8 条 findings，每条 evidence ≤ 200 字。

## 被审改动（工作区 D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage）
1. apps/desktop/electron/services/tracked-content-link.js（新增：planPublishHistoryLinks 纯判据 + linkExistingTrackedContent 编排）
2. apps/desktop/electron/bootstrap/phase4-events.js（task:success 中加 publishHistoryId 透传；本会话首次成功时跑一次存量回填）
3. apps/desktop/electron/services/store/performance-loop-store.js（新增 listUnlinkedTrackedForBackfill / setTrackedPublishHistoryId）
4. 规格：01-docs/PRD-PUBLISH-TRACKED-LINK-2026-10-04.md

## 背景一句话
`tracked_content.publish_history_id` 自诞生起全 NULL（活库实测 73 行 0 已关联），导致发布历史页表现列恒空；
该列语义＝**发布任务 id**（读侧 PublishHistory.vue:602-608 的 join 就是按 taskId 查），不是历史行的 entry.id。

## 只查这五件事
A. 归属隔离：跨用户是否会互链；legacy（历史 JSONL 无 owner 字段 vs SQLite LEGACY_OWNER_SUBJECT）是否会永远接不上或错接。
B. 「唯一命中才写」与 SQL 端 `AND publish_history_id IS NULL` 是否可被绕过；歧义/空 postId/无主/未就绪四条出口是否都有测试。
C. 回填触发在发布成功路径内：是否可能阻塞或影响主流程；异常是否如实出声；每次进程一次的标记是否会被并发任务竞争。
D. 会不会把「恒空」变成「显示错误数据」（例如把 A 作品的数据挂到 B 的历史记录上）。
E. 测试是否可能恒真：夹具是否真用 sqlite 与真迁移，断言是否读**实际落库值**而不是读传入参数。
