## 1. 后端

- [x] 1.1 KeywordWatchlist 模型 + keyword_watchlist_service（CRUD/校验/软删/运行时）+ routers/keyword_watchlist.py + bootstrap + main.py
- [x] 1.2 测试：CRUD/校验/权限/软删不复活/重建/bootstrap 下发（ops-center pytest 全量 114）

## 2. 桌面端

- [x] 2.1 KeywordMonitor.applyRemoteWatchlist + OpsCenterSync.setKeywordMonitor/applyRuntime + phase1 接线
- [x] 2.2 测试：远程新增/更新/缺席停止/用户保留/上限；sync 应用/跳过
- [x] 2.3 修复 main 冲突残留（01-docs/PRD.md、CHANGELOG.md、ops-center-sync.js 头注释）

## 3. 前端/文档

- [x] 3.1 KeywordWatchlist.vue + api + 路由/侧边栏；build
- [ ] 3.2 PRD + CHANGELOG + 审查 + 推送/PR/合并/归档 + 记忆
