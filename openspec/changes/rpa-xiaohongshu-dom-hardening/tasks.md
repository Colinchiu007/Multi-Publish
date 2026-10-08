## 1. PR-1 · 登录态无关加固（现在可做，TDD）

- [x] 1.1 建 FakePage / FakeLocator / FakeResponseMonitor 测试骨架（`tests/test_xiaohongshu_dom_hardening.py`），先写失败用例
- [x] 1.2 抽出可注入 seam：`_launch_context()` + `_run_publish_flow(page, monitor_factory, ...)`，`publish()` 编排不变
- [x] 1.3 草稿 fail-closed：draft 无草稿入口→`success=False, outcome="draft_entry_missing"`，绝不 fallthrough 点发布（红→绿）
- [x] 1.4 选择器多候选回退链 + `_resolve_first`（红→绿：首选缺失命中候选）
- [x] 1.5 contenteditable `_fill_rich`（dispatch input/change）替换标题/正文 `.fill()`（红→绿）
- [x] 1.6 标签逐个 type + 选下拉，替换覆盖式 fill（红→绿：多标签全保留）
- [x] 1.7 错误归一 login_expired / risk_blocked / transient（对齐 outcomeOfResult，risk/login 不降级不换号）（红→绿）
- [x] 1.8 确认才成功骨架：ResponseMonitor.watch_patterns(<草稿端点占位>) + 草稿箱回查兜底；无确认→failure，删除盲 sleep success + 假 url（红→绿）
- [x] 1.9 全量回归 `cd packages/python-backend && pytest`（含既有 test_new_publishers/test_douyin 不破）— **此项原判定不成立**：`test_p4_wait_until.py` 的静态守卫在 PR-1 合并后即为红，而 python-backend pytest 不在任何 CI workflow（`gui-test.yml` 只跑 `test_video_provider_imports.py`），故未阻断；1.12 修复后重跑全量 = 2762 passed / 3 failed，3 项（`test_frame_html`、`test_llm_service`、`test_pipeline_loader`）与 `test_aggregation_video` 均属本分支未触碰的既有/环境依赖失败（`git diff origin/main --name-only` 验证），发布轨 0 失败
- [x] 1.10 代码审查（对照 AGENTS.md 阶段 6：require 路径/错误处理/无外部端点）+ commit + PR + CI + autoMerge（已完成：PR #2885 squash 合并 e413cbc7，CI 全绿含 Gate 12/债务熔断/lint）
- [x] 1.11 补 1.7 的静默失效：`RISK_OVERLAY_SELECTOR` 空占位使 risk 归一从不触发 ⇒ `_risk_present` 加"浮层容器 + 容器内风控文案"双条件文本轨（口径取本仓 `publish-risk.js` RISK_RE，源证据），默认常量非空由测试钉死；新增 4 项用例（红→绿）。**判定口径由 1.13 修正为三条件**（容器 + 可见 + 强指认文案）
- [x] 1.12 修 PR-1 引入的回归（静态守卫抓出）：上传控件的一次性 `_resolve_visible` 在 SPA 晚挂载下**静默跳过媒体**并照样存草稿 ⇒ 产出无媒体草稿。`_await_upload_input()` 恢复条件轮询并把"有媒体却等不到控件"改为 `CODE_UPLOAD_FAILED` fail-closed；两处轮询收敛到共用 `_await_control()`（`xiaohongshu.py` 保持 499 行，不触 ≥500 行债务熔断基线）；新增 4 项用例（延迟挂载必须等到并上传、等不到必须 fail-closed 且不点草稿、无媒体不白等、常量必须被发布器引用）；守卫 `test_p4_wait_until` 由"字面量/次数"改为调用图 + 生效常量值断言（旧断言在 PR-1 把常量移入 selectors 模块后产生两处假红）；两种破坏（删轮询 / 拆掉共用 helper）均验证变红，恢复后发布轨 51 项全绿
- [x] 1.13 CCG 深评（`320e8f2b`）五项全部裁决并落地（判定记录 `.adversarial/ccg-deep-320e8f2b/adjudication.json`，含 prosecution/defense/verdict/rationale）：
  - **i1 Critical（upheld）**：文本轨只查 `count()>0` 不查可见性 ⇒ SPA 常驻的隐藏 modal 模板（默认文案就是「请完成验证」）会让**每次**草稿保存误判 `XHS_RISK_BLOCKED` 并中止；裸「滑块」还命中封面裁剪弹窗。改为"容器 + 可见 + 强指认文案"三条件，词表删裸「滑块」「拖动滑块」（真实滑块验证必共现「安全验证/验证码」，收紧不损召回）。用例 `test_hidden_risk_template_is_not_risk`/`test_bare_slider_crop_wording_is_not_risk`/`test_real_slider_verify_still_caught`（先红后绿）
  - **i2（upheld）**：每 host 只读 `.first` ⇒ 风控层不在 DOM 首位即漏判。改为按序扫描可见元素并设 `RISK_HOST_SCAN_LIMIT=8`（防整页模板放大 `inner_text` 成本）。用例 `test_risk_wording_in_second_visible_host_is_caught`/`test_visible_hosts_beyond_scan_limit_are_not_read`
  - **i3（upheld）**：1.12 把上传等待上限从原 30s 顺手改成 `NAVIGATE_READY_TIMEOUT_S=10s`，且把名为"上传兜底"的 30s 常量喂给了编辑器就绪——同时违反本轨自述"上限沿用原时长"。两常量对调回原位，fail-closed 与快路径收益保留。用例 `test_upload_ceiling_keeps_the_original_tolerance` + `test_upload_path_uses_the_upload_fallback_ceiling`（双哨兵值证映射，不抠源码字面量）
  - **i4（半成立，分别裁）**：`'label="编辑器"'`/`"未就绪"` 源码字面量断言确为格式化耦合（本 PR 已因此假红两次），已从守卫移除并改由 loguru sink 行为用例承担（`test_editor_ready_timeout_leaves_a_reason_in_logs`；本仓非 stdlib logging，`caplog` 抓不到）；`==30.0/==10.0` 值棘轮指控不成立（断生效值、重构不假红），保留
  - **i5（upheld）**：§4e③ 承认的系统洞（python-backend 回归不进 CI）此前只写在待办里，`gui-test.yml` 仅跑 `test_video_provider_imports.py`。新增 `Verify publisher RPA/DOM regressions` 步骤纳入 5 个发布器测试文件，并显式 `pip install pytest-asyncio`（workflow 从未声明该依赖，不装则 CI **静默跳过全部 async 用例**＝绿色但恒真）。全量套件不纳入：2 项既有失败已在 `origin/main` 基线 worktree 复现（ASR 下载、story2video manifest），另 2 项单跑为绿全量为红属用例串扰
  - 1.9 的失败清单据此修正：全量重跑 2818 passed / 4 failed，其中 `test_aggregation_video`、`test_pipeline_loader` 在 main 基线 worktree 同样失败，`test_frame_html`、`test_llm_service` 单独运行为绿（同进程串扰），发布轨 0 失败；5 文件 CI 集本地 90 passed；`check-debt-budget.js` 通过（`filesOver500` 99 < 基线 101，`xiaohongshu.py` 507 行）
  - **破坏-恢复验证（5 种破坏各自变红，非只写不验）**：① `_visible_texts` 去掉 `is_visible()` → 隐藏模板用例红；② 词表放回裸「滑块」/「拖动滑块」 → 裁剪文案用例红；③ 每 host 只取首个可见元素 → 第 2 位命中用例红；④ 上传等待 `timeout_s` 改回 `NAVIGATE_READY_*` → 轮询次数用例红（仅看错误文案的旧写法会假绿，故补此道）；⑤ 超时留痕改成不点名等待对象 / 整条删除 → loguru sink 行为用例红

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
