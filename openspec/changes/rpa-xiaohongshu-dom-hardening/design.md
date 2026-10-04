## 背景与约束

- 小红书 API 直发链已判 not-go（签名外包 + 传输层墙，见 api-publish-engine-w3 §6.3），本 change 只做 **DOM/RPA 轨加固**。
- 合规红线：运行时严禁请求 `*.refpub.cn` / `*.yixiaoer.cn` 外包签名服务（既有架构决策 + CI grep 门禁）。本 change 不新增任何外部端点。
- 验收目标（用户拍板）：**存入真实草稿箱**，不真实公开发布。
- 目标文件：`packages/python-backend/src/multi_publish/publishers/xiaohongshu.py`（现 366 行）。基类 `base.py` 已有 `ResponseMonitor`（P0，`page.on("response")` 抗 UI 改版）与 `wait_until`（P4 条件轮询）。

## 现状硬伤（逐条对应代码）

| # | 位置 | 问题 | 档位 |
|---|---|---|---|
| 1 | L270-279 | draft 找不到"草稿"按钮 fallthrough 点"发布"→ 误公开发布 | Tier1（安全，选择器无关） |
| 2 | L281-289 | `sleep(5)` 后无条件 success=True + 硬编码假 url | Tier1 骨架 + Tier2 真实信号 |
| 3 | L233/265 | contenteditable 标题/正文用 `.fill()` 可能不触发框架 onChange | Tier1（dispatch 事件填写） |
| 4 | L256 | 标签循环 `fill` 覆盖 → 只留最后一个 | Tier1（逐个 type+下拉） |
| 5 | L18-32 | 宽泛单选择器（`:has-text("发布")`/`[class*=...]`）无回退 | Tier1 链框架 + Tier2 校准值 |
| 6 | 全文 | 错误未归一到 outcome（login/risk/upload） | Tier1 |
| 7 | L136-156 | 发布逻辑内联 `async_playwright().start()`，不可注入假页面单测 | Tier1（seam 抽出） |

## 设计

### A. 可测试性 seam（前置，Tier1）
把 `_do_publish_rpa` 拆为：
- `_launch_context()`：真实 playwright 启动（仅生产路径调用）。
- `async def _run_publish_flow(self, page, monitor_factory, ...)`：**接收注入的 page + ResponseMonitor 工厂**，编排"导航→上传→填写→触发草稿保存→确认"。单测传 FakePage/FakeMonitor，无需真实浏览器。

### B. 草稿 fail-closed（Tier1）
`draft=True` 时只在解析到草稿保存控件才点击；未解析到 → 返回 `PublishResult(success=False, outcome="draft_entry_missing")`，且断言未触碰发布按钮选择器。删除"draft 分支 else fallthrough 到 publish"的逻辑。

### C. 确认才成功（Tier1 骨架 + Tier2 信号）
- 触发草稿保存前 `monitor.watch_patterns(<草稿保存端点子串>)`。
- `wait_for_response` 命中且响应体判定成功 → `success=True`，`url` 取响应/草稿箱真实地址。
- 未命中 → 回查草稿箱（导航草稿列表、匹配本次标题）；命中→成功，未命中→`success=False, outcome="draft_unconfirmed"`。
- **绝不**无条件 success、绝不伪造 url。
- `<草稿保存端点子串>` 与草稿箱回查选择器为 Tier2 取证产物，先以配置化常量占位（值待取证回填），骨架逻辑不依赖具体值。

### D. 选择器回退链 + 富文本 + 标签（Tier1）
- `selectors` 每个关键项由 string 升级为候选 list，`_resolve_first(page, candidates)` 逐个探可见。
- contenteditable：`_fill_rich(page, sel, text)` → click + `page.evaluate` 设 innerText/value 并 dispatch `input`/`change`。
- 标签：逐个 `type` + 等待并点击下拉首个候选，失败降级跳过（不影响草稿保存）。

### E. 错误归一（Tier1）
按 `outcomeOfResult` 语义（对齐 publish-mode 决策核）：`/login` 命中或 auth 恢复失败 → `login_expired`；页面出现验证/风控弹层 → `risk_blocked`；上传/填写异常 → `transient_error`/`unsupported`。risk/login 直接停止上报，绝不降级/换号。

### F. Tier2 活体取证 runbook（登录就绪后）
镜像 `api-w3-kuaishou/d2-selector-forensics` 方法：
1. headed 浏览器跑发布器 `login()`（headless=False），用户扫小红书码 → 持久 context + auth 落盘。
2. 同一 context 导航 `creator.xiaohongshu.com/publish/publish`，人工/脚本走"图文→填→存草稿"，`ResponseMonitor` dump 命中的 XHR url 模式 + 成功响应结构。
3. 抓草稿保存按钮/确认弹层/成功 toast/草稿箱列表条目的稳定选择器（多候选）。
4. 回填到 `xiaohongshu.py` 的端点模式常量与 selector 链，做真实草稿箱活体验收。

## 测试策略（TDD，先红后绿）
`tests/test_xiaohongshu_dom_hardening.py`（或并入 test_new_publishers.py）用 FakePage/FakeMonitor 覆盖：
- 草稿 fail-closed：无草稿入口→failure 且未点发布。
- 确认才成功：monitor 命中→success+真 url；未命中且回查失败→failure。
- 选择器回退：首选缺失→候选命中。
- contenteditable：断言调用 dispatch 路径。
- 标签：断言逐个 type 非覆盖 fill。
- 错误归一：/login→login_expired；风控→risk_blocked。
纯函数/分支零真实浏览器。门禁：`cd packages/python-backend && pytest tests/test_xiaohongshu_dom_hardening.py`（ops 后端门禁同规范）。

## 分期
- **PR-1（现在可做，不需登录）**：A 可测试性 seam + B 草稿 fail-closed + D 选择器/富文本/标签 + E 错误归一 + C 确认骨架（占位常量）+ 全部单测。
- **PR-2（需登录取证）**：F 取证回填 Tier2 真实端点模式与选择器 + 活体草稿箱验收。
