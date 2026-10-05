QM-6 前端/集成方向审查（commit 734d7551e，基线 refs/remotes/origin/main）。

读 .ccg/qm6-bilibili-backend-task.md 里「变更范围」「背景」两节了解上下文（同一份 diff，换你的审查方向）。

你的方向：**命名 / 模式 / 可维护性 / 集成风险**（不重复后端的正确性审查）：
1. bilibili-audit-check.js 的模块边界与导出面是否与 publish-monitor 既有平台分支（如 zhihu/douyin 的写法）风格一致；
2. CHECK_URLS.bilibili 直接指向列表端点（而非详情端点）这一偏离，注释与命名是否足以让下一个维护者不误用；
3. 测试文件的组织（T1-T14 编号、fixture 构造器、ESM+createRequire 混用）是否可维护；
4. 取证文档 docs/audit-requery-evidence-bilibili-2026-10-05.md 与代码是否有口径漂移。

**把 findings 写入文件** .ccg/qm6-bilibili-frontend-findings.json：
{"model":"<模型名>","direction":"frontend","findings":[{"severity":"Critical|Warning|Info","file":"<相对路径>","desc":"<问题>","fix":"<建议>"}],"verdict":"pass|block"}
最后只打印 FINDINGS_WRITTEN <条数>。只读审查，不改被审文件。
