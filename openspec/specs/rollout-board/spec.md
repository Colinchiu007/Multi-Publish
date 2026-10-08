# rollout-board Specification

## Purpose
运营中心前端「生效看板」页（/rollout，adminOnly）的可复用规格：把客户端 ACK 回执数据（GET /api/v1/runtime/rollout）可视化为汇总卡片、分块确认率、未确认明细三区，覆盖 loading/空/错误/正常四态与版本切换。判据：ack_rate 小数→1 位小数百分比、block_rates 降序、degraded 行 🔴 标记、候选集不伪造、total===0 引导空态。
## Requirements
### Requirement: 生效看板页面

运营中心前端 SHALL 提供路径为 `/rollout` 的「生效看板」页面，作为配置生效验证（ACK 回执数据）的可视化入口；页面为只读看板，不提供任何修改操作。

#### Scenario: 汇总卡片展示最新版本生效概况

- **WHEN** 管理员打开 /rollout 且后端返回 `{"version": 42, "total": 100, "acked": 87, "stale": 13, "degraded": 5, "ack_rate": 0.87, "block_rates": {...}, "clients": [...]}`
- **THEN** 页面显示四张汇总卡片：配置版本 42、已确认率 87.0%、已确认 87/100（其中降级中 5）、仍在旧版 13
- **AND** ack_rate 以百分比显示（0~1 小数 ×100，保留 1 位小数）

#### Scenario: 无任何回执数据时显示引导空态

- **WHEN** 后端返回 `total === 0`（尚无任何客户端 ACK）
- **THEN** 页面显示空态引导文案，说明「客户端同步一次运行时策略后这里会出现数据」
- **AND** 不显示 0.0% 之类的假数据卡片，不显示版本切换器

#### Scenario: 请求失败时显示可重试错误态

- **WHEN** 请求失败（网络/403/5xx）
- **THEN** 显示 `apiErrorMessage` 提取的失败原因与「重试」按钮，不渲染数据区

### Requirement: 分块确认率

看板 SHALL 把 `block_rates` 逐块展示为「块名 + 百分比」，按确认率降序排列，帮助定位哪一块配置没有铺开。

#### Scenario: 分块按确认率降序

- **WHEN** 返回 `block_rates: {"appMenu": 0.97, "feature_flags": 0.5, "content_templates": 0.71}`
- **THEN** 表格行序为 appMenu(97.0%) → content_templates(71.0%) → feature_flags(50.0%)
- **AND** 每行显示进度条与百分比（1 位小数）

### Requirement: 未确认客户端明细

看板 SHALL 展示 `clients` 数组（后端默认 limit 50）为明细表，含 client_id、客户端版本、所在配置版本、是否降级、最近 ACK 时间；`degraded=true` 的行 SHALL 有醒目标记。

#### Scenario: 降级客户端有醒目标记

- **WHEN** clients 中某行 `degraded: true`
- **THEN** 该行可见降级标记（🔴 或等价 badge），且显示 `degradation_tier`（如 L2/L3）

#### Scenario: 最近 ACK 时间本地化显示

- **WHEN** 某行 `last_ack_at: "2026-10-08T07:30:00Z"`
- **THEN** 明细表以本地时区可读时间显示（非 ISO 原文）；空值显示「—」

### Requirement: 版本切换

看板 SHALL 提供历史版本切换；候选集只来自已见数据（明细中出现的 config_version 去重 + 当前版本），**不得**伪造版本列表；切换后重新拉取 `?version=N`。

#### Scenario: 切换历史版本重新拉取

- **WHEN** 明细中出现 config_version 41 的客户端，用户在切换器选中 41
- **THEN** 以 `?version=41` 重新请求并刷新三区数据

#### Scenario: 候选集不伪造

- **WHEN** 仅见过 version 42（当前）与 41（明细）
- **THEN** 候选集恰为 [42, 41]，不含其他版本号

### Requirement: 管理员专属入口

生效看板菜单项 SHALL 仅对 admin 角色可见（`adminOnly: true`），路由要求登录；非 admin 直接访问 URL 收到 403 时 SHALL 在错误态展示原因而非跳转登录页。

#### Scenario: 非 admin 不可见入口

- **WHEN** role !== 'admin' 打开应用
- **THEN** 侧边栏不出现「生效看板」菜单项

#### Scenario: 403 展示原因不跳登录

- **WHEN** 非 admin 直敲 /rollout URL 且接口返回 403
- **THEN** 错误态展示 403 对应 detail 文案，不触发跳转 /login

### Requirement: 菜单与引导接线

`/rollout` SHALL 注册进路由表、菜单配置（`config/menuItems.js`，含 DEFAULT_MENU_ORDER）、页面引导（pageGuides.js）；三处接线缺失 SHALL 被测试捕获。

#### Scenario: 三处接线齐备

- **WHEN** 运行前端测试
- **THEN** 断言 DEFAULT_MENU_ORDER 包含 '/rollout'、路由表存在 path '/rollout'、pageGuides 存在 'Rollout' 键

