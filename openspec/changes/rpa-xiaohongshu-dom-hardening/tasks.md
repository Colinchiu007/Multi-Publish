## 1. PR-1 · 登录态无关加固（现在可做，TDD）

- [x] 1.1 建 FakePage / FakeLocator / FakeResponseMonitor 测试骨架（`tests/test_xiaohongshu_dom_hardening.py`），先写失败用例
- [x] 1.2 抽出可注入 seam：`_launch_context()` + `_run_publish_flow(page, monitor_factory, ...)`，`publish()` 编排不变
- [x] 1.3 草稿 fail-closed：draft 无草稿入口→`success=False, outcome="draft_entry_missing"`，绝不 fallthrough 点发布（红→绿）
- [x] 1.4 选择器多候选回退链 + `_resolve_first`（红→绿：首选缺失命中候选）
- [x] 1.5 contenteditable `_fill_rich`（dispatch input/change）替换标题/正文 `.fill()`（红→绿）
- [x] 1.6 标签逐个 type + 选下拉，替换覆盖式 fill（红→绿：多标签全保留）
- [x] 1.7 错误归一 login_expired / risk_blocked / transient（对齐 outcomeOfResult，risk/login 不降级不换号）（红→绿）
- [x] 1.8 确认才成功骨架：ResponseMonitor.watch_patterns(<草稿端点占位>) + 草稿箱回查兜底；无确认→failure，删除盲 sleep success + 假 url（红→绿）
- [x] 1.9 全量回归 `cd packages/python-backend && pytest`（含既有 test_new_publishers/test_douyin 不破）
- [x] 1.10 代码审查（对照 AGENTS.md 阶段 6：require 路径/错误处理/无外部端点）+ commit + PR + CI + autoMerge（已完成：PR #2885 squash 合并 e413cbc7，CI 全绿含 Gate 12/债务熔断/lint）

## 2. PR-2 · Tier2 活体取证回填（需用户登录小红书）

- [x] 2.1 取证 runbook 脚本（gitignored staging）：headed login 扫码 → 发布页存草稿 → ResponseMonitor dump 草稿保存端点模式 + 成功响应结构（已就绪：`.agent_context/tier2/xhs_tier2_probe.py` + `RUNBOOK.md` + `_smoke.py` 零浏览器自检通过；含 permit≠成功的假阳性守卫；需用户扫码方可执行 2.2）
- [ ] 2.2 抓真实草稿保存按钮/确认弹层/成功 toast/草稿箱列表条目稳定选择器（多候选），落 evidence 文档
- [x] 2.3a 回填端点模式常量 DRAFT_SAVE_RESPONSE_PATTERNS=["/web_api/sns/v2/note"]（证据源：本仓 api-publish-engine/src/publish/platforms/xiaohongshu-draft.js 三步草稿链终步 + 其测试断言真实端点；XHR 主确认通道由此武装，仍属源证据非活体，需 2.4 活体复核）
- [ ] 2.3b 回填 selector 链与 RISK_OVERLAY_SELECTOR / DRAFT_BOX_ITEM_SELECTOR（需 2.1/2.2 活体取证）
- [ ] 2.4 真实草稿箱活体验收（**双路覆盖**）：(a) 探针跑 python 轨存草稿 → 草稿箱出现本次条目；(b) 桌面真实队列发一条图文（`rpa-view-platforms.js` 的 `draftOnly:true` 用户路径）→ 草稿箱出现本次条目。均记录证据（截图/响应）。2026-10-09 调用链取证见 design.md「调用链取证」：`ROUTE_TABLE.xiaohongshu=rpa_vm`，桌面当前不经 python 发布器
- [ ] 2.5 补 PR、更新 design 取证结论、openspec validate、回写 PRD/techdoc 相关小节

## 3. 收口

- [x] 3.1 `openspec validate rpa-xiaohongshu-dom-hardening --strict`（2026-10-09 通过；Gate 12 本地 PASS。2.3b/2.4 完成后需复跑一次再归档）
- [ ] 3.2 change 归档（两 PR 合并后）
