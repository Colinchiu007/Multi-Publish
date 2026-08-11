# Review — fix-ci-existing-failures

## 审查方式
L 复杂度、中风险（测试/UI 修复 + E2E fixture）。双模型后端不可用（此前多轮已记录）→ 主代理自审 + 本地全量验证。

## 审查结论
🔴 CRITICAL：0　🟠 MAJOR：0　🟢 MINOR：0

## 根因与修复（4 处，全部为 main 既有问题）

1. **CreateView.vue components 漏注册子组件**（`components: { UiButton, UiModal, UiSelect }` 缺 PipelineSelector/StageProgress/CreateViewHistory）→ Vue 'Failed to resolve component'，流水线卡片 0 → gui-test /create 15/26 失败。
   修复：components 补注册 3 个组件。

2. **E2E fixture 缺登录态**（ipc-mock.js 无 identityGetState）→ identityStore=error → 登录门（#537 useLoginGate）拦截启动 → E2E 启动 IPC 不被调用。
   修复：ipc-mock 预置 authenticated 登录态（identityGetState/identitySignIn/identitySignOut/onIdentityStateChanged）。

3. **stage-executor.test.js max_length 期望 300 与契约默认 500 不一致**（00a581d1 引入时未同步）→ electron-tests OPTIMIZE/OPTIMIZE_BATCH 5 失败。
   修复：3 处期望改 500（与 prompt-engine-contract maxLength.default 一致）。

4. **pipeline-story2video-contract.test.js 同类不一致**（3 处 max_length 300→500）。

## 验证
- E2E：create 58/58（修复前 11/26）、pipeline 11/11（修复前 9/11）
- src 全量：1904/1904（含 AppNavbar 修复）
- electron/services+electron/tests 全量单 worker：3604/3604（修复前 stage-executor 5 失败）
- 无 console/page errors

## MINOR（非阻塞）
- pipeline-engine.js 的 max_length:300 是流水线预设显式值（另一路径），未改动（正确）。
- main 仍有 gui-test /create 之外的路由既有失败（E2E 环境差异）属独立问题；本次聚焦 CI 红的主要来源。
