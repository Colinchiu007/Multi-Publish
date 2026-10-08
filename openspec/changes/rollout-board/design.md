# Design: rollout-board

## D1 数据流与响应契约

```
RolloutView.vue ──(onMounted / 手动刷新 / 版本切换)──▶ api/rollout.js fetchRollout({version})
      │                                                      │
      │                                        GET /api/v1/runtime/rollout[?version=N]
      │                                        (Cookie 会话鉴权, require_admin)
      ▼                                                      ▼
  三区渲染 ◀──────────────────────────────────── { version, total, acked, stale, degraded,
                                                  ack_rate, block_rates: {name: 0~1},
                                                  clients: [{client_id, client_version,
                                                    config_version, config_hash, degraded,
                                                    degradation_tier, ack_type, last_ack_at}] }
```

契约以 `ops-center/backend/services/resilience_service.py` `rollout_summary()` 为唯一真源（不新增后端代码）。**关键语义**（直接来自该函数 docstring，看板文案必须忠实）：
- `total` = 活跃客户端总数（= 曾 ACK 过的个数，非装机量）
- `acked` = 已确认当前版本；`stale` = 停在更旧版本；`degraded` = 处于断连降级中（**是 acked 的子集维度**，不与 stale 互斥—— Degraded 客户端可能已 ACK 当前版也可能没有，因此卡片区分开列，不做加减校验）
- `block_rates` 值域 0~1（**小数**，前端 ×100 保留 1 位小数显示百分比；只统计 acked 当前版的客户端）
- `version=null` 时后端自动取最大版本 → 前端默认不传 version

## D2 页面结构（三区 + 四态）

| 区 | 内容 | 依据 |
|---|---|---|
| 卡片区（4 张） | 配置版本 v{N}；已确认率 {ack_rate%}；已确认 {acked}/{total}（其中降级 {degraded}）；仍在旧版 {stale} | `ack_rate` 0~1 小数 ×100 保留 1 位 |
| 分块确认率表 | `block_rates` 每块一行：块名 + 进度条 + 百分比；按比率降序 | 帮助定位「哪块配置没铺开」 |
| 未确认明细表 | `clients` 全字段；degraded=true 行加 🔴 标记；`last_ack_at` 本地时间化显示 | limit 由后端默认 50 |
| 四态 | loading（骨架文案「加载中...」）/ 空（`total===0`→引导空态「还没有客户端回执。客户端同步一次运行时策略后这里会出现数据。」）/ 错误（`apiErrorMessage` 展示 detail + 重试按钮）/ 正常 | 复用 Diagnostics.vue 形态与设计令牌 |

版本切换：`el-select`（候选 = 明细中出现的 config_version 去重 + 当前 version；后端不提供版本列表端点，**不猜**——候选集只来自已见数据，空态下不显示切换器）。

## D3 权限与入口

- 端点 `require_admin`（`routers/runtime.py:157`）→ 菜单项 `adminOnly: true`（menuStore.visibleForRole 过滤），非 admin 不见入口；直敲 URL 时 axios 403 → 错误态显示 detail，不跳登录（http.js 语义：403 是权限问题非凭证失效）。
- 路由 `meta: { requiresAuth: true }` 与其余 38 页一致。

## D4 文件与接线清单

| 文件 | 动作 | 要点 |
|---|---|---|
| `src/api/rollout.js` | 新建 | `fetchRollout({version}={})` → `api.get('/runtime/rollout', { params: { version } })`；version 为 null/undefined 时不下发该参数 |
| `src/views/RolloutView.vue` | 新建 | 三区四态；`<script setup>` 组合式；样式走 tokens.css 既有变量 + Diagnostics 的 stat-card class 模式（页面内 scoped，不进全局） |
| `src/router/index.js` | +1 路由 | `{ path: '/rollout', name: 'Rollout', component: () => import('../views/RolloutView.vue'), meta: { requiresAuth: true } }` |
| `src/config/menuItems.js` | +1 项 | `{ path: '/rollout', label: '生效看板', icon: PieChart, adminOnly: true }`，放在 `/diagnostics` 之后（同类观测页聚集）；`DEFAULT_MENU_ORDER` 由同文件生成需同步 |
| `src/pageGuides.js` | +1 条 | Rollout: ['配置生效看板', '查看每版配置在多少客户端真实生效。', '未确认明细可定位版本过旧或断连的设备。'] |

图标 `PieChart` 来自 element-plus icons（已在依赖内，其他页面同源引用）。

## D5 TDD 切片

先测后码，三层：
1. **api 层**：fetchRollout 传参契约（带/不带 version、URL 正确、走共享 api 实例）
2. **组件层**（jsdom 挂载，mock api/rollout.js）：四态渲染、三区数据映射（ack_rate 小数→百分比、block_rates 排序、degraded 标记）、版本切换重新拉取
3. **接线层**：DEFAULT_MENU_ORDER 含 `/rollout` 且 adminOnly、路由表含 `/rollout`、pageGuides 含 Rollout 键

## D6 备选与取舍

- **备选 A（否）**：后端加 `/runtime/rollout/versions` 列表端点——一次 ACK 心跳聚合查询换来候选集更准，但当前无此数据需求（版本切换是低频操作），且本 change 立项原则是零后端改动。
- **备选 B（否）**：把未确认明细做成无限滚动——后端 limit 上限 200（Query 校验 ge=1 le=200），客户端总数级 ~千，50 条分页够用。
- **选中的形态**：单页轮询 + 手动刷新，与 Diagnostics/UsageDashboard 完全同构，维护成本最低。
