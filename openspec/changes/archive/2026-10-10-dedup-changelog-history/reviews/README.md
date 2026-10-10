# QM-6 评审产物

- qm6-findings-backend.json — opencode/nemotron-3-ultra-free（逻辑/安全/规格轴）的**模型自写产物，逐字未改**：1 CRITICAL + 3 MAJOR + 4 MINOR。
- qm6-findings-frontend.json — opencode/ling-3.1-flash-free（命名/模式/集成轴）的模型自写产物，逐字未改：2 MAJOR + 6 MINOR。

两份都是第一次并行派发的产物；因 opencode 跑完才落盘，我在 14:50 查产物时误判为"零产物"，
并在未读后端文件的情况下错误描述了它的结论（说成"3 条 MAJOR、无 CRITICAL"）。
该错误已在 openspec/records/changelog-history-dedup.md 的「我更该认的一条错」一节与本 PR 描述中改正，
逐条处置见同文件的 B1–B8 表。

注：第一次派发时该通道未按要求写文件一事不再成立（它写了，只是晚 13 分钟）；
第二次"收窄任务书重跑"实际因上游 503 失败，其日志不在本目录，不作为产物引用。
