## Why

运营后台目前只管配置/密钥/模型目录，**公告、版本发布策略、内容安全（敏感词）仍散落在代码或本地**：
- 桌面端敏感词库 `sensitive-filter.js` 写死内置词，无法远程调整；
- 自动更新无强制版本/灰度策略（`auto-updater.js` 只有 check/download/quitAndInstall）；
- 没有面向全部桌面端的公告/维护通知通道。

用户要求按批次把 P0/P1 运营后台功能落地。本 change 为**第一批**：公告/维护通知 + 版本发布策略 + 内容安全策略（敏感词库）集中到运营后台，桌面端启动时经既有 `OpsCenterSync` 运行时下发。

## What Changes

- ops-center 新增 3 张运营表 + 管理 CRUD + 只读运行时端点：
  - `Announcement`：公告（severity=info/warning/maintenance，有效窗口，启用开关，排序）
  - `UpdatePolicy`：版本发布策略（min_version 最低版本提示 / force_version 强制版本 / gray_ratio 灰度比例 / 启用）
  - `ContentPolicy`：内容安全策略（word_list 敏感词数组 / replacement 替换串 / 启用）
  - `GET /api/v1/runtime/bootstrap`（X-Catalog-Key 同目录端点鉴权）一次性返回三项活动数据。
- 桌面端扩展 `OpsCenterSync`：
  - `syncNow` 在目录同步后追加拉取 `runtime/bootstrap`（best-effort，失败仅 warn 不阻断目录）；
  - `applyRuntime`：公告存 settings+内存并暴露 IPC；update_policy 存内存供 auto-updater 消费；content_policy 重建 SensitiveFilter（内置词 + 远程词，`sensitive:check/replace` 自动使用）。
- auto-updater：新增 `applyPolicy`（force_version 强制下载、gray_ratio 灰度跳过、min_version 提示），`check()` 消费策略。
- 前端：App 顶部公告横幅（可关闭，maintenance 等级强提示）；模型设置「运营后台同步」卡片不变。
- ops-center 前端：新增 公告/版本策略/内容安全 三个管理页（复用现有表格+弹窗模式）。

## Capabilities

### New Capabilities
- `ops-center/runtime-policy`: 运行时运营策略（公告/版本/内容安全）只读下发端点 + 管理 CRUD。
- `desktop/runtime-policy-apply`: 桌面端运行时策略应用（公告展示、更新策略、敏感词重建）。

### Modified Capabilities
- `desktop/ops-center-sync`: 同步范围从「模型目录」扩展到「模型目录 + 运行时策略」。
- `desktop/auto-updater`: 增加版本发布策略（强制/灰度/最低版本）。

## Impact

- ops-center/backend：models.py、routers/runtime.py（新）、services/runtime_service.py（新）、main.py、tests
- ops-center/frontend：Announcements.vue / UpdatePolicy.vue / ContentPolicy.vue（新）、router、侧边栏
- apps/desktop/electron：services/ops-center-sync.js、services/auto-updater.js、ipc-handlers（sensitive + ops-center-sync）、preload/access-control
- apps/desktop/src：App.vue 公告横幅、api/composables
- 文档：ops-center PRD、01-docs/PRD.md、CHANGELOG、.env.example
