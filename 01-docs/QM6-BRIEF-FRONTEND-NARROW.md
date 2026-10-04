# QM-6 替代通道任务书（前端轴，收窄版）

只读审查，禁止修改任何被审文件。结论**只能**写入这一个文件：
D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage/01-docs/QM6-FINDINGS-TRACKED-LINK-FRONTEND.json

JSON 形如：{"axis":"frontend","findings":[{"id":"F1","severity":"Critical|Warning|Info","file":"路径:行号","claim":"一句话","evidence":"你读到的代码","suggested_fix":"建议"}],"overall":"一句话"}
最多 8 条 findings，每条 evidence ≤ 200 字。

## 被审改动（工作区 D:/Data/projects/mp-worktrees/mp-publish-tracked-link-lineage）
1. apps/desktop/electron/services/tracked-content-link.js（新增，判据 + 编排）
2. apps/desktop/electron/services/store/performance-loop-store.js（新增两方法：listUnlinkedTrackedForBackfill、setTrackedPublishHistoryId）
3. apps/desktop/electron/bootstrap/phase4-events.js（task:success 里加 publishHistoryId 透传 + 一次性回填触发）

## 只查这四件事（命名/模式/分层/集成，不要重复正确性审查）
A. `publish_history_id` 列名与其实际语义（发布任务 id）错位——是否有单点说明，会不会被下一个消费者按字面写错。
B. 分层：判据层（纯函数）/编排层/存储层职责是否清楚；编排层直接依赖 store mixin 的方法名是否脆弱。
C. 与既有写者口径：`updateTrackedContent`（已支持 recrawlStatus/lastRecrawlAt/nextRecrawlAt/rewriteHistoryId）与新增 `setTrackedPublishHistoryId` 是否会变成两个写者各写一半；`publishHistoryId` 为何不进前者。
D. `publish-history.js` 的 `listRecords(opts, ownerSubject)` 默认 `limit=50`；新代码传了大 limit——是否有防再犯锁防止将来有人改回默认值导致"存量被当成不存在"。
