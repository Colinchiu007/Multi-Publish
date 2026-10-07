# 快手 D2 / W3 活体复测 Runbook（2026-09-27）

> 用途：把当前**因「需用户到场」而阻塞**的三个项——`kuaishou-w3-live-fix` 2.1b/2.2/2.3、`api-publish-engine-w3` 3.3、6.3——固化成回到电脑前可照着跑的清单。
> 前置阅读：同目录 `d2-selector-forensics-20260927.md`（取证纪要，说明为何不臆测改码）。
> ⚠️ 硬约束：登录滑块**不可远程代解**（须本人鼠标+眼）；活体发布**会向真实账号发作品**（有副作用，知情同意后再跑）。

---

## 端口纪律（先读）

本项目 Vite/CDP 端口**按 worktree 路径 hash 派生**（`apps/desktop/scripts/dev-ports.js`：基线 vite 5174 / CDP 9222，`PORT_SPAN` 内取模），**不同 worktree 端口不同**。
- 启动后从 launcher 日志或 `netstat` 确认**本次实际** vite 端口与 CDP 端口，再据此设 `MP_VITE` / `MP_CDP`。
- 探针脚本 `probe-d2-dom.js` 的默认值（9279 / 5231）对应持久运行 worktree `mp-app-live2`；若从别的 worktree 跑，务必覆盖。

---

## 步骤 A — 启动最新代码 + 已登录 profile

用 `start-app` 技能（首选一键）：

```powershell
powershell -ExecutionPolicy Bypass -File D:/Data/projects/mulpub/scripts/sync-app.ps1
```

确认窗口出现 + CDP 就绪：

```powershell
curl http://127.0.0.1:<vitePort>/            # 200
curl http://127.0.0.1:<cdpPort>/json/version # 200
```

## 步骤 B — 快手登录（本人过滑块，二选一）

在应用「账号」里对快手账号点「重新登录」，走 **手机短信验证码**（手机号 15304851951）或扫码。
- passport 页会弹 **jigsaw 拼图滑块** → **本人手动拖到缺口对齐**（无 API 可代解，勿尝试自动化）。
- 若首次 `authOpenLogin` 秒回「重新登录成功」但实为假阳性（匿名 cookie did/clientkey 误判，见取证纪要），**忽略该提示**，以步骤 C 的 `/profile` 真实判定为准。

## 步骤 C — 校验登录态真实有效（发布页可达的前提）

```powershell
# 打开 auth 视图后采 /profile 的 title/关键文本，判定是否真登录
cd D:\Data\projects\mulpub\.agent_context\w3livefix-staging
$env:MP_CDP="127.0.0.1:<cdpPort>"; $env:MP_VITE="<vitePort>"
node probe-d2-loginstate.js
```

判据：返回含真实账号名（如「命运石」）且非登出营销页 → 登录有效，进入 D；否则回 B 重登。

## 步骤 D — 采集发布编辑页「真提交钮」DOM（零发布副作用）

```powershell
cd D:\Data\projects\mulpub\.agent_context\w3livefix-staging
$env:MP_CDP="127.0.0.1:<cdpPort>"; $env:MP_VITE="<vitePort>"
node probe-d2-dom.js   # 输出 dump 到同目录 probe-d2-dom.json
```

- 该探针走 **CDP DOM 域**（`DOM.getDocument/querySelectorAll/getOuterHTML`）绕开快手对 `Runtime.evaluate` 的反调试冻结，读已解析 DOM。
- 它只打开视图 + 导航到 `cp.kuaishou.com/article/publish/video?tabType=1` 后采集，结束一律 `authClose`，**不点发布、不上传**。
- **关键**：要采到「**真实上传完一个视频后**」的编辑页状态（此时提交钮才渲染出来），而非空表单页——空表单页只有顶导航「发布作品」span，非提交钮（取证纪要已证）。所以 D 需在应用内先手动上传一个视频文件到编辑页，再跑探针，或在探针里先触发上传。

## 步骤 E — 决策树（仅在有正向证据时才改码）

比对 `probe-d2-dom.json` 采到的提交钮（tag/text/class）与 `packages/rpa-engine/src/platform-selectors.js` kuaishou `publish_btn` 7 候选：

```
button:has-text("发布") | button:has-text("发表") | span:has-text("发 布")
| span:has-text("发布") | span:has-text("立即投稿") | [class*="submit"] | [class*="publish"] button
```

| 观察 | 根因判定 | 动作 |
|------|---------|------|
| 真提交钮文本/class **不在**任一候选命中域内 | (A) 选择器漏配 | 改 2.3：刷新 `publish_btn` 候选；补 2.2 红测（新文案命中 + 旧文案尾部兜底 + 负例：登录页/未就绪不误命中，对齐 `platform-definitions.test.js` 负例形态）；跑 2.4 rpa-engine run-tests |
| 候选能命中，但命中元素非真提交钮（如误中顶导航 span） | (A′) 误匹配 | 收紧选择器（优先 `[class*="submit"]` 精确类），补负例测 |
| 选择器命中正确、但点击时表单未就绪 | (B) 上传未完成即点 | 现 main `rpa-view-platforms.js` L310-345 已有「先上传→`_waitForVideoUploadComplete`→等 formReady→再发布」守卫；确认该守卫在快手链生效即可，**通常无需改选择器** |

> 无任何正向证据（探针没采到确凿的真提交钮 DOM）→ **不改码**，2.2/2.3 继续 PENDING。

## 步骤 F — 活体发布验收（W3 3.3 + 6.3，知情同意后）

- 真实标题、**私密/草稿优先**发 1 条；`api-then-dom` 双轨都要观测（D1 后 API 链可达性 + D2 后 DOM 兜底可点性）。
- **同账号两次 API 发布间隔 ≥18min**（Q4 频率墙）。
- 前台回查作品是否出现；证据四件套（app 日志 / 网络捕获 / 截图 / 结果码）入 `01-docs/rpa-api-publish/evidence/api-w3-kuaishou/`（`.md/.png` 被 gitignore，`git add -f`）。
- ⛔ **风控即停，绝不换号 / 不自动验证 / 不重试刷签名**；`result==109 → login_expired` 停任务不降级。

## 步骤 G — 收口（验收通过后）

- 回写勾选：`kuaishou-w3-live-fix` tasks 2.1b/2.2/2.3/2.4/3.5；`api-publish-engine-w3` tasks 3.3/6.3。
- M3 结论回写 PRD F12（`01-docs/PRD-API-PUBLISH-ENGINE.md` §4 P2 表，**不是** `01-docs/PRD.md`）。
- 经验入内置记忆 + EverOS + learnings；`openspec archive` 两 change。

---

## 相关脚本索引（`.agent_context/w3livefix-staging/`，gitignored）

| 脚本 | 作用 |
|------|------|
| `probe-d2-loginstate.js` | 采 /profile 判真实登录态 |
| `probe-d2-dom.js` | CDP DOM 域采发布页真提交钮 DOM（绕反调试冻结，零发布副作用） |
| `probe-d2-diag.js` / `probe-d2-selector.js` | 发布页按钮/选择器诊断 |
| `cdp-host-eval.js` / `ks-eval.js` | CDP 步进驱动（辅助） |
