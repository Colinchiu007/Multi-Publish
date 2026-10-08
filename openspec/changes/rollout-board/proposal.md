## Why

韧性链路（PR #3126）上线后，运营负责人回答「我改的配置有多少客户端真实生效了」只剩两条路：手工 curl `GET /api/v1/runtime/rollout`（require_admin），或看桌面端日志。运营中心前端 39 个页面里**没有一个生效看板**——数据端点已在（`resilience_service.rollout_summary` 返回 version/total/acked/stale/degraded/ack_rate/block_rates/clients），缺的只是把 curl 变成界面。本 change 补上 V-4（原列入 ARCH-OPS-CENTER-RESILIENCE-2026-10-06.md §0.1 外部清单，部署后真实使用反馈确认要做）。

## What Changes

- **新增 `/rollout` 生效看板页**（`ops-center/frontend/src/views/RolloutView.vue`）：
  - 汇总卡片：最新配置版本号、已确认率（acked/total，百分比）、已确认数 / 仍在旧版（stale）/ 降级中（degraded）
  - 分块确认率表：block_rates 逐块列出（哪块配置在多少比例的客户端生效）
  - 未确认客户端明细表（limit=50）：client_id / 客户端版本 / 所在配置版本 / 是否降级 / 最近 ACK 时间
  - 版本切换：下拉选历史版本（后端 `?version=N`），默认最新
  - 刷新按钮 + loading/空态/错误态（复用 Diagnostics.vue 既有形态）
- **接线四处**：路由 `/rollout`、菜单项（`config/menuItems.js`，adminOnly=true——端点 require_admin，非 admin 点进去只会 403）、页面引导（pageGuides.js）、HTTP 封装（新增 `api/rollout.js`：`fetchRollout({version})`）
- **不做**：ACK 心跳拓扑图、按渠道分组、WebSocket 实时推送（数据 24h 心跳粒度，轮询刷新足够）；不新增后端代码——`rollout_summary` 已满足全部字段需求

## Capabilities

### New Capabilities
- `ops-center/rollout-board`: 规定生效看板的页面结构（汇总卡片/分块确认率/未确认明细三区）、数据来源（GET /api/v1/runtime/rollout 的响应契约）、四种界面状态（loading/空/错误/正常）、权限要求（仅 admin 可见入口）、空数据判据（total===0 显示引导空态而非 0%）。

### Modified Capabilities
无——`ops-center-resilience` 规格只约束服务端 ACK/rollout 端点行为，本 change 纯消费端展示，不改任何后端契约。

## Impact

- **代码**：`ops-center/frontend/src/views/RolloutView.vue`（新）、`ops-center/frontend/src/api/rollout.js`（新）、`router/index.js`（+1 路由）、`config/menuItems.js`（+1 菜单项）、`pageGuides.js`（+1 引导）
- **测试**：`ops-center/frontend/tests/rollout-view.test.js`（新，组件挂载 + 三区渲染断言 + 四态覆盖）；`page-guides.test.js`/`menu-store.test.js` 不需改（配置驱动）
- **风险**：低——纯只读页，不改后端、不动其他页面；最大风险是 menuItems 顺序数组漏接导致菜单不显示（测试覆盖 DEFAULT_MENU_ORDER 包含 /rollout）
