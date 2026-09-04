# OpsCenter AGENTS.md - 7 stage + TDD. Backend pytest -v, Frontend npm run build. FUSE: no Write/Edit to D:/Data/projects.

---

## 质量节拍强制执行

本仓库已启用质量节拍（quality-rhythm）门禁系统。每次新任务自动执行：
1. 判断变更类型（14种全覆盖）
2. 评估变更规模
3. 路由到对应 Phase
4. 用户确认后开始

**视觉测试强制：** UI 文件变更时自动提示视觉回归测试。

## 前端依赖安装

- `frontend/` 使用 npm（独立 package-lock.json，不属于根 pnpm workspace）。
- 安装必须带 `.npmrc` 里的 `legacy-peer-deps=true`（npm 10.9.x 解析 vitest 4 peer 依赖会触发 arborist `edgesOut` 崩溃）。
- 门禁：`cd frontend && npm test`（vitest）+ `npm run build`；后端 `cd backend && pytest -v`。
