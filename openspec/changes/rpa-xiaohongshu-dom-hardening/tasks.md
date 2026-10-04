## 1. PR-1 · 登录态无关加固（现在可做，TDD）

- [ ] 1.1 建 FakePage / FakeLocator / FakeResponseMonitor 测试骨架（`tests/test_xiaohongshu_dom_hardening.py`），先写失败用例
- [ ] 1.2 抽出可注入 seam：`_launch_context()` + `_run_publish_flow(page, monitor_factory, ...)`，`publish()` 编排不变
- [ ] 1.3 草稿 fail-closed：draft 无草稿入口→`success=False, outcome="draft_entry_missing"`，绝不 fallthrough 点发布（红→绿）
- [ ] 1.4 选择器多候选回退链 + `_resolve_first`（红→绿：首选缺失命中候选）
- [ ] 1.5 contenteditable `_fill_rich`（dispatch input/change）替换标题/正文 `.fill()`（红→绿）
- [ ] 1.6 标签逐个 type + 选下拉，替换覆盖式 fill（红→绿：多标签全保留）
- [ ] 1.7 错误归一 login_expired / risk_blocked / transient（对齐 outcomeOfResult，risk/login 不降级不换号）（红→绿）
- [ ] 1.8 确认才成功骨架：ResponseMonitor.watch_patterns(<草稿端点占位>) + 草稿箱回查兜底；无确认→failure，删除盲 sleep success + 假 url（红→绿）
- [ ] 1.9 全量回归 `cd packages/python-backend && pytest`（含既有 test_new_publishers/test_douyin 不破）
- [ ] 1.10 代码审查（对照 AGENTS.md 阶段 6：require 路径/错误处理/无外部端点）+ commit + PR + CI + autoMerge

## 2. PR-2 · Tier2 活体取证回填（需用户登录小红书）

- [ ] 2.1 取证 runbook 脚本（gitignored staging）：headed login 扫码 → 发布页存草稿 → ResponseMonitor dump 草稿保存端点模式 + 成功响应结构
- [ ] 2.2 抓真实草稿保存按钮/确认弹层/成功 toast/草稿箱列表条目稳定选择器（多候选），落 evidence 文档
- [ ] 2.3 回填 xiaohongshu.py 的端点模式常量与 selector 链（替换 1.8 占位）
- [ ] 2.4 真实草稿箱活体验收：存草稿 → 确认草稿箱出现本次条目 → 记录证据（截图/响应）
- [ ] 2.5 补 PR、更新 design 取证结论、openspec validate、回写 PRD/techdoc 相关小节

## 3. 收口

- [ ] 3.1 `openspec validate rpa-xiaohongshu-dom-hardening --strict`
- [ ] 3.2 change 归档（两 PR 合并后）
