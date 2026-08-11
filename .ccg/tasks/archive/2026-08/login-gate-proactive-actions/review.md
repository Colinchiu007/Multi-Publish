# Review — login-gate-proactive-actions

## 审查方式
L 复杂度、中风险（前端 UX + 认证引导，不触碰主进程安全边界）。双模型后端不可用（antigravity 区域限制、claude 超时——此前多轮已记录），按机制硬化规则降级主代理自审。

## 审查结论
🔴 CRITICAL：0　🟠 MAJOR：0　🟢 MINOR：见下

## 逐项核对
1. **核心机制**：`useLoginGate.js`——已登录直接放行；身份服务不可用 fail-closed；未登录弹确认框 → identitySignIn（主进程 Logto OAuth）→ 登录成功自动继续；单例防重入。
2. **接入（首批主动操作）**：发布 handlePublish、批量发布 handleBatchPublish、AI 写作 3 函数、CreateView UI「启动流水线」→ handleStartPipeline。登录门仅作 UX 前置，主进程通道级鉴权（AUTH_REQUIRED）仍是最终安全边界。
3. **时序语义**：`CreateView.startPipeline` 方法本体不内置登录门（保持同步时序，供测试/程序化调用）；登录门在 UI 点击层 handleStartPipeline，避免挂载期异步初始化覆盖测试配置。
4. **测试**：useLoginGate 8 用例；handleStartPipeline 2 用例；4 个接入文件 mock useLoginGate（默认放行）并适配异步时序（重复提交类测试 await Promise.resolve/flushPromises）；src 全量 **1901/1904 通过**。
5. **既有失败（与本次无关）**：src/layouts/AppNavbar.test.js 3 用例失败（IdentityMenu.vue:91 computed null），stash 后（main 原版、同 worktree 同依赖）同样失败——非本次改动引入。
6. **文档**：PRD §2.3.1「主动操作登录引导」详细合同（规则/校验/流程/交互/提示文字/接入点/边界）；CHANGELOG。

## MINOR（非阻塞）
- 场景 B（浏览/查看类）与场景 C（缺权益→升级引导）、D（兼容模式→license 引导）保持现状，未纳入本次；后续可按 PRD §2.3.1 扩展。
- 提示文案为单语言（沿用现有多语言体系可后续接入 i18n key）。
