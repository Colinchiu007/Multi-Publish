# Tasks: kuaishou-w3-live-fix

## 1. D1 — API-first 凭证 auth 分区兜底（TDD 先红后绿）

- [x] 1.1 红测 `apps/desktop/electron/services/rpa-view-manager-api-cookie-fallback.test.js`：四个 Scenario 全覆盖（store 空+分区有→publishViaApi 收到分区拼串；双空→空串 fail-closed 现状；跨平台域过滤不串味；store 非空不读分区）
- [x] 1.2 红测：`findAuthPartitionDir` 抽取后 `_restoreAuthPartitionCookies` 行为不变（rpa-view-session.test.js 既有用例全绿即为回归）
- [x] 1.3 实现：`rpa-view-session.js` 抽出 `findAuthPartitionDir(platform, accountId)` 纯函数（fs 定位，兼容 auth-auth-/auth-/account- 前缀）；`rpa-view-manager.js` API-first 分支空串时经 `session.fromPartition` 只读分区 cookie，`isPlatformCookieDomain` 过滤后拼串；warn 日志含分区名与计数
- [x] 1.4 回归面：rpa-view-manager / publisher-router / kuaishou-chain / kuaishou-adapter / douyin 相关 suites 全绿

## 2. D2 — 快手发布按钮选择器（活体取证门）

- [x] 2.1 活体只读侦察（CDP auth 视图，零发布副作用）：已登记 `01-docs/rpa-api-publish/evidence/api-w3-kuaishou/selector-probe-20260926.md`。**结论：快手登录态已失效（/profile 渲染登出营销页），发布页不可达；D2 定性从"选择器漂移"修正为"登录态失效阻断"，选择器刷新需重登后复测才能定夺**
- [x] 2.1b （解锁项，需用户扫码）快手重登后复跑 probe-d2-diag.js 枚举发布页真实按钮 DOM，再判定 2.2/2.3 是否需要改动（2026-09-28 活体完成：用户过滑块登录 + 真实发布流全程被值守捕获器记录，38 张快照；上传后编辑页真提交钮实证为裸 `<span>立即发布</span>`，判定 (A) 选择器漏配——`d2-live-verdict-20260928.md` + `d2-live-evidence-20260928-snapshot005.json`）
- [x] 2.2 红测：`platform-selectors` kuaishou publish_btn 新文案命中 + 旧文案尾部兜底 + 负例（登录页/未就绪不误命中），对齐 platform-definitions.test.js 负例形态（`platform-selectors.test.js` 首位断言 + 兜底断言；`rpa-selector-utils.test.js` 活体 fixture 4 例：精确命中/旧候选歧义演示/登录页负例/空表单负例）
- [x] 2.3 实现：按取证刷新 `packages/rpa-engine/src/platform-selectors.js` kuaishou `publish_btn` 候选序列（一轮 #2554 首位 `span:has-text("立即发布")` 被二轮取证推翻——那是发布时间单选项；二轮定案首位 `div:has-text("发布")`（底栏裸 div 真钮，全页唯一直接文本命中）并移除单选项诱饵，见 `d2-live-verdict-20260928-round2.md`）
- [x] 2.4 rpa-engine run-tests 全绿（3 files 221 tests 全绿 + 解析器回归锁 13/13）

## 3. 门禁与交付

- [x] 3.1 全量：桌面 vitest 受影响 suites（5 suites 83 tests 绿，含 publisher-router 回归）+ api-publish-engine run-tests（31 files 258 tests 绿）+ Gate 7 locales（--pair-base origin/main PASS，无新增文案）+ Gate 17 IPC 守卫（PASS，注册点 428/显式守卫 66.8%/不可判定 0）+ ESLint（0 error，5 warning 均为 HEAD 既有代码）
- [x] 3.2 QM-1 打包三件套：首轮仅 `electron-builder --dir` 漏 renderer（asar 无 `\dist\index.html`，exe 启动报 ERR_FILE_NOT_FOUND）→ 改用 `pnpm run build:dir`（vite build + builder）重打；复测三件套全过（asar 含 dist/index.html + auth-partition.js；asar extract 后 require 链 rpa-engine OK、相对依赖 fs 核实存在；exe 10s 存活 stderr 零输出）。fonts/.playwright-browsers 缺失警告为 worktree 无可选资源，预期内
- [x] 3.3 commit + push + PR + CI 盯守全绿（两轮：#2554 一轮候选 + #2569 二轮定案 `div:has-text("发布")`，均 CI 全绿自动合并；二轮修正一轮对发布时间单选项的误判）
- [x] 3.4 证据收编：`live-verdict-20260926.md`、`live-run-20260926-applog.txt`、`live-run-20260926-progress.json` 已从共享根收编入 `01-docs/rpa-api-publish/evidence/api-w3-kuaishou/` 随本 PR 提交；D2 侦察证据 `selector-probe-20260926.md`/`-authview.png`（.md/.png 被 gitignore，按 spike-verdict.md 先例 `git add -f`）+ `-shell.json` 一并登记
- [x] 3.5 （用户在场）6.3 活体重跑：D1 后 API 链可达 + D2 后 DOM 兜底可点；通过后回写 W3 tasks 6.1/6.3 收口（2026-09-28 18:43 活体通过：用户授权 CDP 代操作，真实发布流上传 01.mp4 → 填表 → 点击底栏 `<div>发布</div>`（二轮定案候选 exactLeaf 唯一命中）→ **发布成功**，作品 ID `3xvsedz34m82ppi`、URL `https://m.gifshow.com/fw/photo/3xvsedz34m82ppi`（HTTP 200 实证在线）；DOM 兜底可点 ✓。D1 API 链：本轮 API 轨因 `taskData.video.path required` 回退 DOM 轨——API 轨数据形状缺陷另行登记，engine-w3 6.3（API 轨活体裁决）保持开放）
