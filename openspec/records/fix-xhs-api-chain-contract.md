---
record: fix-xhs-api-chain-contract
task: 修复小红书 API 发布链 permit 请求形态（GET + query + referer + uploadAddr）+ 修复 tests/ 目录从未被执行的接线漏洞
date: 2026-10-07
---

## 本次执行记录：小红书 API 链 permit 契约修复（fix-xhs-api-chain-contract，2026-10-07）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码变更 ⇒ 隔离 worktree `D:/Data/projects/mp-worktrees/mp-xhs-api`（junction 到共享主仓 node_modules 仅为补依赖，gitignored），分支 `fix-xhs-api-chain`（从 `origin/main` `c4e8ae71` 切出）；共享主目录未落盘、未 push main |
| 第一性原因（QM-5 ①） | PASS | 真机探针记录 `failedEndpoint` 落在 permit 端点、`httpStatus = 404`；**同 host 的登录巡检返回 `valid=true`** ⇒ 排除网络不可达与凭据失效，把嫌疑收敛到「permit 请求形态本身不对」。对照参考实现产物逐项比对，发现形态全错（六项差异见下方对照表）⇒ 404 是形态错配的结果，不是偶发 |
| 六项形态差异（参考实现 vs 旧实现 → 新实现） | PASS | ①方法 POST → **GET**；②参数 body → **query**；③query 参数缺失 → 补 `biz_name=spectrum` `scene=image` `file_count=1` `version=1` `source=web`；④permit 请求缺 `referer` → 补 `https://creator.xiaohongshu.com/publish/publish`；⑤上传 URL 硬编码 ros-upload 域 → 改用 **permit 响应的 `uploadAddr` + `fileIds[0]`**（拿不到才回落硬编码域）；⑥permit 返回值缺 `fileIds` / `uploadAddr` → 补齐。另：上传头与 note 头补 `referer` + `Origin` |
| 逃逸分析（QM-5 ②） | PASS | **本次最关键一条**：`packages/api-publish-engine/scripts/run-tests.js` 的 `discoverTestFiles` 只扫 `test/`（单数），而 `tests/`（复数）下 3 个文件**从未被任何 CI 跑过**；但这 3 个文件都列在 `VITEST_FILES` 白名单里，于是 `check-unwired-tests.js` 判它们「已接线」放行 ⇒ **测试发现机制与执行机制脱节**。后果：错误断言 `['POST','PUT','POST']` 与错误注释「与参考实现一致（POST）」长期绿灯，错误形态被测试「背书」，真机 404 也因此拿不到任何红灯反馈 |
| 系统性漏洞定位 | PASS | 分类为**流程缺失 + 测试场景缺失**：①`check-unwired-tests` 以「是否列在白名单」判接线，而非以「是否真被执行」判接线，两个机制用不同真源 ⇒ 天然放行假绿；②`tests/` 与 `test/` 双目录并存本身即高危（仅一字之差、无编译期保护）；③契约测试断言的是**自己写下的实现**而非外部真源，形态错时只会自洽通过 |
| 修复 + 回归保护（QM-5 ④） | PASS | ①`run-tests.js` 的 `discoverTestFiles` 同时扫 `test/` 与 `tests/`（`existsSync` 守卫 + `Set` 去重 + 保留 `testDirectory` 显式传参的向后兼容）；②`xiaohongshu-draft.js` 按上表六项对齐参考实现，并新增导出 `PERMIT_QUERY`；③`xiaohongshu-draft-chain.test.js` 方法断言改 `['GET','PUT','POST']`、新增 5 条 query 断言 + `headers.referer` 断言 + `X-Cos-Security-Token` 断言，并更正头部注释（原注释「POST（与参考实现一致）」本身是错的） |
| 变异反证有效性（两组） | PASS | **组一（接线修复）**：修复后 `discoverTestFiles` 返回 **159**（`test/` 156 + `tests/` 3）；以 `discoverTestFiles(<test 目录>)` 做**同进程差分**（比「改回旧代码再跑」更强，无需改动实现文件即可复现旧行为）⇒ 只扫 `test/` 时返回 **156**，且被漏掉的恰为 `signer-local-xyw.test.js` / `xiaohongshu-draft-chain.test.js` / `xiaohongshu-adapter-load.test.js` 三个文件。**组二（permit 方法）**：把 `xiaohongshu-draft.js:111` 的 `method: 'GET'` 改回 `'POST'` ⇒ `tests/xiaohongshu-draft-chain.test.js:71` 转红，报 `expected [ 'POST', 'PUT', 'POST' ] to deeply equal [ 'GET', 'PUT', 'POST' ]`；还原后 18/18 全绿，实现文件 sha256 `E10A6D7D6A8A9D53D5CC9AD990A1FBF0654545EAD28BA66C3224080B6475138D`、diff 回到 31 插入 / 11 删除基线 ⇒ 断言确有咬合力，不是注释 |
| 防止再次发生（QM-5 ⑤）/ 接线棘轮 | PASS | `tests/` 已纳入 `discoverTestFiles` 扫描范围 ⇒ 三个文件实测落入**实际执行**的 vitest 分组（`classifyTestFiles` 判定 `inVitestGroup=true`，37 文件组内）；后续在 `tests/` 新增 `*.test.js` 会自动被发现并执行，不再需要「记得改两处」 |
| 测试 | PASS | ①`tests/` 三文件：**18 用例全绿**（`xiaohongshu-draft-chain` 6 + `signer-local-xyw` 7 + `xiaohongshu-adapter-load` 5）。其中 `xiaohongshu-adapter-load` 此前 4 例红于 `Cannot find module 'axios'`，经查属**环境类**（worktree 无 node_modules、axios 只在共享主仓），建 junction 后全绿，**非产品缺陷**。②整包 `node scripts/run-tests.js` ⇒ **exit=0**，159 文件全部执行：vitest 组 37 文件 / 312 用例全过，direct 组 122 文件（TAP 46 文件 545 用例 + mocha 风格 76 文件）全过，**0 失败**。③`node scripts/check-unwired-tests.js` ⇒ **exit=0**，「检查域内测试文件 65 个 OK: 全部测试均已接线或按欠账登记」 |
| 行尾与 diff 对账 | PASS | `git diff --cached --numstat` 与 `git diff --cached --ignore-cr-at-eol --numstat` 两口径逐行一致（合计 +108 / −21）⇒ 无 CRLF/LF 混写。删除行归因：−21 行全部来自三处改动的旧实现被就地替换（`run-tests.js` −5 / `xiaohongshu-draft.js` −11 / 测试 −5），**无整文件重写、无整文件删除**（新增记录为 +38 / −0）。新增记录文件按仓库既有约定写为 CRLF（参照 `xhs-draft-publish.md`：41 CRLF / 0 孤立 LF；本文件 38 CRLF / 0 孤立 LF、无 BOM） |
| QM-1 打包 / QM-4 视觉 | N/A | 改动面为 `packages/api-publish-engine/`（发布链 + 其测试 + 测试运行器），**未触 `apps/desktop/electron/` 与 `packages/rpa-engine/`** ⇒ QM-1 打包门禁不触发；未触任何渲染面 ⇒ QM-4 视觉 N/A |
| QM-6 CCG 双模型外部评审 | 未执行 | 本机 `codeagent-wrapper` 不存在（`Get-Command codeagent-wrapper` 无命中）⇒ 如实记为未执行，**不以自审冒充通过**；双模型评审由父任务/后续会话补 |
<<<<<<< Updated upstream
| 远程同步 | PASS | merge SHA `664c9b0646d1662a59ff3805afa21c103c3c50fa`（2026-10-08T19:35:15+08:00）。取证：`git log origin/main --grep='(#3076)

### 故意没做的事（不假装已覆盖）

- **未抄参考实现的「签名返回新 a1 并回写 cookie」机制**：该机制依赖其**远程签名服务**（三端口轮询），而我们走进程内纯算法（`signer-local.js` 的 XYW_ 实现），架构不同；混进来会引入新的不确定性（隐藏窗口崩溃面 + 远程不可用面），故明确不纳入。
- **ros-upload 与 note 两步至今未真机验证**：本 PR 只把 permit 一步对齐参考实现并补了契约断言；整条三步链路的真机成功**尚未取证**，不得据本 PR 宣称「小红书可发」。

### 遗留（不假装已闭合）

- **ros-upload 上传步与 note 提交步未真机验证**：permit 404 的修复是「形态对齐」层面的证据，尚无真机绿灯；下一步应在真机跑通三步链路并回填 note_id / draft_id 取证。
- **上传 URL 的硬编码回落分支未覆盖真机**：`uploadAddr` 缺失时回落 `ROS_UPLOAD_ORIGIN` 的降级路径，契约测试只验了「uploadAddr 优先」这一侧。
- **接线判定仍是双真源**：`check-unwired-tests.js` 以「列在 `VITEST_FILES`」判接线，本次通过「`tests/` 纳入扫描」消除了本例假绿，但**判据本身**未改（白名单 + 实际执行的一致性仍靠约定而非机械校验）。根治需让门禁比对「实际执行集合」而非白名单，本次未做。
- `getCsdnSign` / `getKuaishouSign` 仍是简化实现（同类「形态通过、语义未验证」隐患），本次只治理小红书，其余留待专项。
 --format=%H|%cI` → `664c9b06…3c50fa|2026-10-08T19:35:15+08:00`；`git ls-remote --heads origin fix-xhs-api-chain` 返回 0 行（远端分支已删） |
=======
| 远程同步 | PASS | 已合并 #3076 = `664c9b0646d1662a59ff3805afa21c103c3c50fa`（squash，committer 2026-10-08T19:35:15+08:00）。取证：`git log origin/main --grep='(#3076)$' --format=%H|%cI` 唯一命中；`git ls-remote --heads origin fix-xhs-api-chain` 返回 **0 行**（远端分支已删）。补记：本文件为 #3164 批量回填的漏项，由本次回填 PR 就地闭合 |
>>>>>>> Stashed changes

### 故意没做的事（不假装已覆盖）

- **未抄参考实现的「签名返回新 a1 并回写 cookie」机制**：该机制依赖其**远程签名服务**（三端口轮询），而我们走进程内纯算法（`signer-local.js` 的 XYW_ 实现），架构不同；混进来会引入新的不确定性（隐藏窗口崩溃面 + 远程不可用面），故明确不纳入。
- **ros-upload 与 note 两步至今未真机验证**：本 PR 只把 permit 一步对齐参考实现并补了契约断言；整条三步链路的真机成功**尚未取证**，不得据本 PR 宣称「小红书可发」。

### 遗留（不假装已闭合）

- **ros-upload 上传步与 note 提交步未真机验证**：permit 404 的修复是「形态对齐」层面的证据，尚无真机绿灯；下一步应在真机跑通三步链路并回填 note_id / draft_id 取证。
- **上传 URL 的硬编码回落分支未覆盖真机**：`uploadAddr` 缺失时回落 `ROS_UPLOAD_ORIGIN` 的降级路径，契约测试只验了「uploadAddr 优先」这一侧。
- **接线判定仍是双真源**：`check-unwired-tests.js` 以「列在 `VITEST_FILES`」判接线，本次通过「`tests/` 纳入扫描」消除了本例假绿，但**判据本身**未改（白名单 + 实际执行的一致性仍靠约定而非机械校验）。根治需让门禁比对「实际执行集合」而非白名单，本次未做。
- `getCsdnSign` / `getKuaishouSign` 仍是简化实现（同类「形态通过、语义未验证」隐患），本次只治理小红书，其余留待专项。
