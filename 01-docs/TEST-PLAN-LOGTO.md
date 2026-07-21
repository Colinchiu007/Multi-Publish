# Logto 用户系统测试计划

> **日期**：2026-07-20
> **范围**：Electron 登录、API JWT/JWKS、业务用户、entitlement、云端发布隔离、运维配置

## 1. 风险优先级

| 级别 | 风险 | 必须覆盖 |
|------|------|----------|
| P0 | Token 泄露、错误验签、跨用户访问、本地提权 | 单元 + 集成 + 安全 + Electron |
| P0 | Refresh Token 旋转竞态导致会话损坏 | 并发测试 + 故障注入 |
| P1 | 回调端口冲突/超时、网络断开、Logto/JWKS 失败 | 单元 + E2E + 故障注入 |
| P1 | 账号切换残留旧用户数据 | Electron E2E + 手动验证 |
| P2 | UI 状态、错误提示和可访问性 | 组件 + 视觉 + 键盘 |

## 2. 场景矩阵

### 2.1 Electron 身份

| 场景 | 层级 | 预期 |
|------|------|------|
| 首次登录成功 | 集成/E2E | PKCE 回调成功，状态为 authenticated，Token 不进 Renderer |
| 用户取消或回调超时 | 单元/E2E | 服务关闭、临时数据清理、可重试错误 |
| 非 callback 路径/错误 state/重复 callback | 单元 | 400 或忽略，不交换 Token |
| 16526 端口被占用 | 集成 | 明确错误，不改用未注册端口 |
| safeStorage 不可用/密文损坏 | 单元 | 拒绝明文保存，清理损坏会话 |
| 应用重启恢复 | Electron | 使用加密会话恢复，不打开浏览器 |
| 并发获取过期 Token | 单元 | 只执行一次 Refresh，所有调用共享结果 |
| Refresh invalid_grant | 单元 | 清空会话和 entitlement，进入 signed_out |
| 退出时 Logto 不可达 | 单元/E2E | 本地退出仍完成，远端错误被脱敏记录 |
| 账号 A→退出→账号 B | Electron | 无 A 的 Token、任务、平台账号和权益缓存 |

### 2.2 JWT/JWKS 与 API

| 场景 | Node | Python | 预期 |
|------|------|--------|------|
| 有效 RS256 Token | 必测 | 必测 | 建立含 sub/scopes 的上下文 |
| Header 缺失/格式错误 | 必测 | 必测 | 401 + `AUTH_TOKEN_MISSING` |
| 签名错误/未知 kid | 必测 | 必测 | 刷新 JWKS 一次后 401 |
| `alg=none`/HS256 降级 | 必测 | 必测 | 拒绝 |
| issuer/audience 错误 | 必测 | 必测 | 401 |
| exp/nbf/时钟边界 | 必测 | 必测 | 仅允许配置的 60s 偏差 |
| scope 缺失 | 必测 | 必测 | 403 + `AUTH_SCOPE_MISSING` |
| JWKS 超时/损坏 | 必测 | 必测 | fail closed，不复用未知 key |
| key rotation | 必测 | 必测 | 未知 kid 主动刷新后可通过 |

### 2.3 业务用户、权益与发布隔离

| 场景 | 预期 |
|------|------|
| 第一次有效请求 | 按 provider/sub 幂等 upsert |
| 两个并发首次请求 | 唯一约束下仅一个业务用户 |
| 相同邮箱、不同 sub | 不自动合并 |
| 请求体伪造 user_id | 被拒绝或忽略，owner 仍为 Token sub |
| A 查询 B 的 taskId | 404，不泄露存在性 |
| entitlement 正常 | sub/device/signature/time 均通过 |
| entitlement 过期/错 sub/错 device/未知 kid/篡改 | 权限拒绝并清缓存 |
| 额度并发扣减 | 事务原子，只允许额度内请求成功 |
| webhook 伪造/重放 | HMAC 失败拒绝；重复 event id 幂等 |
| API Key 创建定时任务后被撤销并重启 | 执行前按 `ownerSubject` 重新读取撤销状态，返回 `SCHEDULE_OWNER_REVOKED`，不得调用发布链路 |
| API Key 存储损坏或不可读 | 请求返回 `503 API_KEY_STORE_UNAVAILABLE`；静态 Key 和自动迁移均不得放行或覆盖原文件 |

## 3. 前端状态与视觉

页面/组件必须覆盖：`loading`、`signed_out`、`signing_in`、`authenticated`、`refreshing`、`offline_authenticated`、`error`、`signing_out`。验证窄窗口、长昵称、无头像、中文/英文错误、键盘焦点、加载期间按钮不位移、账号菜单不遮挡主要操作。

UI 变更后运行：

```powershell
Set-Location apps/desktop
node tests/visual-testing/views/all-views.visual.test.js --single home-default
npm run test:visual:pixel
```

像素失败后查看 diff；只有人工确认预期变化后才能更新 baseline。

## 4. 安全测试

- 搜索生产代码中的 Token/authorization code/query 日志、硬编码 URL/secret、`console.log`。
- 检查所有 identity IPC 的 sender、参数 schema、序列化和错误脱敏。
- 在 `sandbox:true/false`、`contextIsolation:true`、`nodeIntegration:false` 下验证 preload。
- 验证回环服务只绑定 `127.0.0.1`，拒绝非 GET、非 callback 路径、超大 URL 和重复请求。
- 使用两个真实签名测试 key 验证 rotation；测试 key 仅放 fixtures，不复用生产 key。
- 确认 Electron 包中没有 `.env`、M2M secret、测试私钥或明文会话文件。
- 撤销 API Key 后重启 API 服务，验证其历史 pending 定时任务执行失败；无 Logto 模式也不得绕过撤销状态。
- 破坏 API Key JSON 后验证请求 fail closed、自动迁移拒绝启动且原文件内容保持不变。

## 5. 门禁命令

```powershell
# 受影响单元和集成测试
npm test

# 桌面端覆盖、故障注入与构建
Set-Location apps/desktop
npm run test:coverage
npm run test:fault
npm run build
npm run test:visual:pixel

# Electron 完整打包（QM-1）
node ../../node_modules/electron-builder/cli.js --win --x64
```

变异测试至少覆盖新增身份纯函数、callback validator、JWT claims 和 entitlement verifier；分数不得低于 30%。最后人工验证一次真实 Logto 测试租户登录、重启恢复、Token 刷新、云端调用、退出和账号切换。

## 6. 完成定义

所有 P0/P1 场景有自动化或明确的手动证据；受影响测试无失败；分支覆盖率不低于 40%；故障注入通过；视觉 diff 已审核；Electron 完整打包和启动验证通过；安全审查无 CRITICAL；测试报告记录实际命令、退出码和已知限制。

## 7. 本地执行记录（2026-07-20；2026-07-21 最终复验）

| 门禁 | 命令/范围 | 结果 |
|------|-----------|------|
| Node API 全量 | 干净提交快照中执行 `packages/api-publish-engine: npm test` | exit 0；61 个测试分组全部通过，Vitest 8 files / 24 tests 通过 |
| Desktop 全量 + 覆盖率 | `apps/desktop: npm run test:coverage -- --maxWorkers=4` | exit 0；285 files / 5007 tests；statements 68.37%、branches 60.59%、functions 69.86%、lines 70.51% |
| Python 全量 | `packages/python-backend: <bundled-python> -m pytest -q --basetemp C:\tmp\multi-publish-pytest-logto-20260721-final -p no:cacheprovider` | exit 0；2503 passed、1 skipped、10 warnings |
| 故障注入 | `npm run test:fault` | exit 0；14/14 |
| Monkey | `npm run test:monkey` | exit 0；5/5 |
| Vue/preload 构建 | 根目录 `npm run build:vue --workspace @multi-publish/desktop` | exit 0；1806 modules transformed |
| Preload 双 sandbox | `apps/desktop: npm run test:preload:sandbox` | exit 0；`sandbox:true` 与 `sandbox:false` 的真实 Electron IPC 均通过 |
| 身份 UI E2E | `TEST_URL=http://127.0.0.1:5175/ npm run test:e2e:identity` | exit 0；1440x900 与 1024x600 均通过，无 console/page/request error |
| 单视图视觉 | `all-views.visual.test.js --single home-default` | exit 0 |
| 像素视觉 | `TEST_URL=http://127.0.0.1:5175 npm run test:visual:pixel` | exit 0；16/16，0 failed |
| Electron QM-1 | `node ../../node_modules/electron-builder/cli.js --win --x64` | exit 0；Electron 43.1.1，NSIS 2.3.53 |
| ASAR/启动 | ASAR list + 敏感文件扫描 + extract/require + packaged exe | 身份模块和 logger 已入包；无 `.env`/私钥；require 成功；应用稳定运行 8 秒并关闭 |
| 变异分片 | `identity-errors.js` + 专属测试 | exit 0；mutation score 90.00%，9 killed、0 survived、1 no coverage |
| 代码与安全复审 | 冻结 Logto diff 与最终 11 文件暂存 diff 的两轮独立审查 | 未报告 CRITICAL/MAJOR；最终审查的 MINOR 压缩路由覆盖已补回 |

### 7.1 已知限制与未执行外部场景

- `identity-menu.e2e.js` 通过浏览器注入假的 `window.electronAPI`，证明 UI 状态、键盘和布局合同，不证明 Electron 主进程、PKCE、回环、safeStorage 或真实 Logto 会话链路。
- 未提供真实 Logto 租户、Management API/M2M 凭据或真实业务 PostgreSQL，因此真实登录/刷新/退出/切换、生产迁移和 PostgreSQL 并发额度压力测试仍需在集成环境执行。
- 最终完整身份变异测试共 1505 mutants；一次初始 worker 启动失败，一次在 15 分钟负载上限内未生成最终报告。随后执行的专属纯函数分片达到 90%。`entitlement.js` 分片也受 Windows Stryker 原位 I/O 负载影响超时，不能把超时记为通过。
- Stryker 使用 `inPlace: true`；每次异常后均扫描 `stryMutAct_`、`stryCov_`、`__stryker__`，最终源码无污染。临时目录不进入提交。
- Windows 符号链接相关 Python 场景保持跳过；最终 Python 复验有 6 个 httpx 弃用警告、4 个 Windows asyncio transport 警告和 1 个 pytest cache ACL 警告。Desktop 有 `punycode` 弃用、jsdom `alert()` 未实现及 Git ignore 权限警告。
- Vue 构建存在既有的大 chunk 和动态/静态混合导入警告，不阻断本次身份功能。
- `apps/desktop` 子目录直接执行 `npm run build:vue` 时，npm 10 未注入根工作区 hoist 的 `vite`；从根目录使用 workspace 命令执行同一脚本后通过，不是源码编译失败。
- preload 真实 Electron 验证在受限进程沙箱中会触发系统 GPU 子进程访问失败；在非受限本机环境重跑后 `sandbox:true/false` 均通过。此处的“非受限”仅指测试宿主权限，不改变 BrowserWindow 的 sandbox 配置。
- 覆盖率全量使用单 worker 时在 900 秒上限超时且无断言失败；改用 `--maxWorkers=4` 后 572.7 秒完成并通过。Windows/D 盘高负载环境不能把单 worker 超时当成源码失败。
- 历史 Node API 测试曾使用同步 `try { fn() }` 包装 `async` 回调，导致测试先打印通过、Promise 随后在进程中未处理失败；最终门禁已改为 `node:test` 的真实等待，并在独立干净工作树复验，避免其他未提交改动掩盖提交缺口。

### 7.2 E2E 前置条件

默认 `5174` 可能被其他 worktree 的 Vite 服务占用。运行身份 E2E/视觉门禁前必须启动当前工作树的 Vite，并用 `TEST_URL` 指向独立端口；同时检查 `/main.js` 不包含其他 `.worktrees/` 路径，避免测试命中旧代码。

本地工程验收已完成；生产验收在 7.1 列出的外部场景完成前保持 `PENDING`。
