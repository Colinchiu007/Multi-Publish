---
record: fix-xhs-probe-chain-detail
task: 探针链路诊断透传（chain detail 白名单回传）+ permit 响应形状兼容（uploadTempPermits/result 数组）+ note 提交签名头补齐（x-t/x-s-common/traceid）
date: 2026-10-09
---

## 本次执行记录：小红书探针链路诊断增强（fix-xhs-probe-chain-detail，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码（`packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js` + `apps/desktop/electron/ipc-handlers/xiaohongshu-draft-probe.js`）⇒ 隔离 worktree `mp-app-live2`，裸分支 `fix-xhs-probe-chain-detail`（基线 `origin/main`=`f59382543`，即 #3172 合并后）；共享根未落盘 |
| 第一性原因 | PASS | 真机探针只回传 `XHS_PERMIT_NO_FILE_ID` 错误码、无响应细节 ⇒ 无法区分「会话态不足/响应形状变化/签名要求」三类根因 ⇒ 给链异常加第三参 `detail`（业务码+键名数组+布尔旗标，不带响应值），probe 侧 `pickChainDetail` 白名单过滤后回传 |
| 真机取证（detail 透传） | PASS | 真机复测拿到 `dataKeys=[result, uploadTempPermits]`、`successFlag=true` ⇒ permit 响应形状与实现假设不符（file 字段在数组元素里），排除「会话态不足」|
| permit 形状修复 | PASS | 字段提取兼容 `uploadTempPermits`/`result` 两种数组形态 + `file_id`/`fileId` 两种键名 ⇒ 真机复测 permit 步通过、ros-upload 步通过（链路首次到达第三步）|
| note 签名头补齐 | PASS | 装配签名器返回裸 XYW_ 字符串时，submitNote 原样展开导致请求缺 `x-t`/`x-s-common`/traceid ⇒ 字符串形态下用 `buildXiaohongshuSignHeaders` 补齐全套头 ⇒ 真机复测仍 406（见遗留）|
| 测试 | PASS | `packages/api-publish-engine` 全量 `run-tests.js` exit=0（vitest 37 文件 312 用例 + direct 组 0 失败）；测试 sign mock 返回对象形态与新对象分支兼容 |
| QM-6 CCG 深度审查 | PASS | 提交时 pre-commit 判定（a2d4f8375 判定落盘 `.ccg/reviews/`）；本 PR 三提交均在判定器覆盖范围（≤200 行），无敏感命中 |
| 远程同步 | PASS | 已合并 #3198 = `5d8359dd6b10851d9db8f8d8466e643e8144f8fc`（squash，committer 2026-10-09T09:26:44+08:00）。取证：`git log origin/main --grep='(#3198)$' --format=%H\|%cI` 唯一命中；`git ls-remote --heads origin fix-xhs-probe-chain-detail` 返回 0 行（远端分支已删）|

### 故意没做的事（不假装已覆盖）

- **note 406 未定位根治**：x-s-common 补齐后仍 406。`signer-local.js` 头部注释已知局限：本地只实现 XYW_ 前缀签名、未实现 XYS_ 形态，note 端点可能要求与浏览器一致的实时签名。根治需浏览器拦截真机请求对比 x-s/x-s-common 生成链路（另立项，不在本 PR 范围）。
- **detail 不含响应值**：诊断载荷只带键名/业务码/布尔，刻意不带响应体值——避免敏感内容经回传面出主进程（与 #3172 五轮审查确立的边界一致）。

### 遗留（不假装已闭合）

- note 提交步 406：待「浏览器拦截真机 x-s 算法对比」专项。
- `uploadTempPermits` 数组元素内的字段名（token/cos_key/upload_addr）真机值未逐项核对——permit 已通过说明关键字段提取正确，但 uploadAddr 是否来自响应仍未真机验证（本次走的是硬编码回落域或响应域，无日志区分）。
