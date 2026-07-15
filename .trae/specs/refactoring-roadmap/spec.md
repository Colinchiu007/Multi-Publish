# 系统化重构路线图 Spec

## Why

项目综合健康度 6.5/10（健康但遗留问题多）。上一轮 Top 5 改进仅触及表层，深层问题需系统化分阶段重构。

本 Spec 基于**独立深度代码分析**（非搬运现有文档），通过 Grep/Read 实测验证了用户方案的每项发现，修正了 6 处偏差，并补充了用户方案未覆盖的盲区（如 CI 脚本对旧 preload 的依赖、adapter 命名后缀已分组等）。

## 独立深度分析结论

### 用户方案验证总览

用户方案**总体方向正确**，15 项发现中 12 项验证准确，3 项需修正。综合评分 6.5/10 合理。

### 与用户方案的 6 处偏差（基于实测）

| # | 用户方案表述 | 实测验证 | 修正建议 |
|---|------------|---------|---------|
| 1 | "createAppContext 40+ 字段" | **实测 52 个字段**（phase1-context.js 第 120-135 行 extractContext 返回值） | 比传闻更严重，应提升为 🔴 CRITICAL |
| 2 | "setTimeout ~30 处阻止进程退出" | **实测 104 处 setTimeout/setInterval，33 处已 unref**（覆盖率 32%） | 非"项目最优秀维度"也非"严重问题"——长期定时器基本有 unref，但仍有少量未覆盖；保留为 🟢 MINOR |
| 3 | "空 catch 8 文件 15 处" | **实测 84 行匹配**（含测试/脚本），生产代码约 10 处需修复 | 精确范围：scheduled-publish/publish-plan/audit-log/publish-api-client/plugin-loader(4 处)/zhihu topics，其余为合理 fallback（md-converter 的 marked 加载、browser-data 的 fs.unlinkSync 清理） |
| 4 | "IPC ~40 处 try-catch 重复" | **实测 225 处 ipcMain.handle/on 调用，跨 42 文件** | 范围远超传闻，但并非所有都需 wrapper（部分是简单查询） |
| 5 | "删除旧版 preload.js 即可" | **CI 脚本 .github/scripts/check-ipc-bridge.js 第 9/48 行依赖旧版 preload.js** 提取 ipcRenderer.invoke 调用 | 删除前必须先重构 CI 脚本，否则破坏 IPC 完整性检查 |
| 6 | "Adapter 87 文件按能力分子目录" | **实测 46 adapter + 6 基础设施文件，命名后缀已自带能力分组**（-image/-llm/-tts/-stt/-video） | 不需子目录分组，仅提取 6 个基础设施文件到 `_base/` 即可 |

### 用户方案未覆盖的盲区

| # | 盲区 | 严重程度 | 说明 |
|---|------|---------|------|
| A | rpa-engine/src/publishers/registry.js 是空壳死代码 | 🟢 MINOR | `registry = {}` 空对象，无任何注册逻辑 |
| B | remotion-composer 22 个 TS/TSX 文件零测试 | 🔴 CRITICAL | 项目最严重测试缺口，36 文件含 0 测试 |
| C | sandbox:false 是有意决策（commit 9aa1680） | — | 不应列为问题，安全性由 contextIsolation:true + nodeIntegration:false 保障 |
| D | 三重安全缺口叠加风险 | 🔴 CRITICAL | sandbox:false + 无 CSP + IPC 无 sender 验证 = 攻击链：XSS → 任意 IPC → 主进程 |

## What Changes

### Phase 1：安全加固（🟢 低风险，1-2 天）
- 添加 CSP 策略到 `src/index.html`（补偿 sandbox:false 的 XSS 防御缺口）
- 修复生产代码 10 处空 catch（精确范围，非 15 处）
- IPC sender 验证扩展到敏感 handler（9 个含凭证保存/账号删除/支付）
- 提取 `wrapIpcHandler` / `withSenderCheck` 高阶函数（消除 try-catch 模板重复）

### Phase 2：代码清理（🟢 低风险，2-3 天）
- **前置**：重构 CI 脚本 check-ipc-bridge.js 改用新版 preload/index.js
- 删除旧版 `electron/preload.js`（423 行）
- `packages/ai-writer` var → const/let（2 文件，100% var）
- 补全主进程 setTimeout/setInterval 的 unref 覆盖（104 处中 71 处未 unref，聚焦长期定时器）
- 硬编码 127.0.0.1/端口抽取到 `electron/config/app-config.js`

### Phase 3：架构重构（🟡 中-高风险，3-5 天）
- Store 类按功能域拆分（567 行 → 8 个子 Store，🔴 高风险 — 涉及 SQLite）
- App.vue 拆分为 layouts + components（332 行 → <100 行）
- Adapter 目录**仅提取 6 个基础设施文件到 `_base/`**（不分子目录，保留命名后缀分组）
- createAppContext 52 字段上帝对象分组（infra/services/windows/pipelines）

### Phase 4：测试补全（🟢 低风险，2-3 天）
- remotion-composer 添加单元测试（props-validator/scene-builder/media-profiles）
- shared-utils 6 个手动测试迁移到 Vitest
- 清理 rpa-engine 空壳死代码（registry.js）+ 评估是否合并入 desktop

## Impact

- **Affected code**: 全库 ~900 源文件 / ~165,000 行代码，重点影响 `apps/desktop/electron/`（~140 文件）和 `apps/desktop/src/`（~80 文件）
- **Affected packages**: ai-writer、shared-utils、rpa-engine、remotion-composer、api-publish-engine
- **Breaking changes**: 
  - Phase 2 删除旧版 preload.js（需同步重构 CI 脚本）
  - Phase 3 Store 拆分会改变 store 模块导出结构（需迁移期兼容层）
- **测试基线**: 3643 passed / 0 failed / 10 skipped（重构不得降低此基线）
- **视觉测试基线**: 19/19 passed（涉及 UI 改动需重跑）

## ADDED Requirements

### Requirement: CSP 内容安全策略
系统 SHALL 在 `src/index.html` 添加 Content-Security-Policy meta 标签，限制 script-src 为 'self'，防御 XSS。这是 sandbox:false 的关键补偿措施。

#### Scenario: CSP 生效
- **WHEN** 渲染进程加载页面
- **THEN** 浏览器执行 CSP 策略，阻止内联脚本和外部源脚本加载

#### Scenario: 字体加载不阻断
- **WHEN** 页面加载 Fontshare / Google Fonts
- **THEN** CSP 的 font-src 和 style-src 允许这些域名

### Requirement: 空 catch 错误记录
所有生产代码中的 catch 块 SHALL 至少记录 warn 级别日志，不得完全静默吞错误。

**精确范围**（10 处，非 15 处）：
- `packages/api-publish-engine/src/scheduled-publish.js:38`
- `packages/api-publish-engine/src/publish-plan.js:27`
- `packages/api-publish-engine/src/audit-log.js:31`
- `packages/api-publish-engine/src/publish-api-client.js:63`（JSON.parse fallback）
- `packages/api-publish-engine/src/plugin-loader.js`（4 处：51/246/272/331）
- `packages/api-publish-engine/src/adapters/zhihu.js:21`（topics 提交失败）

**排除**（合理 fallback，不需修复）：
- `md-converter.js` 的 marked 加载 fallback
- `browser-data.js` 的 fs.unlinkSync 清理
- `http-provider.js` 的 FormData 加载 fallback

#### Scenario: 异常发生时
- **WHEN** try 块内代码抛异常
- **THEN** catch 块通过 log.warn/log.error 记录错误信息，不静默吞没

### Requirement: IPC sender 验证
所有敏感 IPC handler（写入/删除/激活/支付类操作，约 9 个） SHALL 通过 `isTrustedSender` 验证调用来源。

**敏感 handler 清单**：
- 凭证保存（auth:save-credentials）
- 账号删除（store:delete-account）
- 支付激活（payment:activate）
- 批量发布（batch:*）
- 定时任务（scheduler:*）

#### Scenario: 未授权来源调用
- **WHEN** 非本应用窗口的渲染进程调用敏感 IPC
- **THEN** handler 返回 `{ code: EC.AUTH_ERROR, message: '未授权的调用来源' }`

### Requirement: IPC handler 包装器
系统 SHALL 提供 `wrapIpcHandler` 高阶函数，统一 try-catch + 参数校验 + 错误日志，消除 try-catch 模板重复。

#### Scenario: handler 抛异常
- **WHEN** IPC handler 内部抛异常
- **THEN** wrapper 捕获并返回 `{ code: EC.REQUEST_ERROR, message: e.message }`，记录 error 日志

### Requirement: CI 脚本同步重构
删除旧版 preload.js 前，系统 SHALL 先重构 `.github/scripts/check-ipc-bridge.js` 改用新版 `preload/index.js` 提取 ipcRenderer.invoke 调用。

#### Scenario: CI 脚本不破坏
- **WHEN** 删除 electron/preload.js 后运行 CI
- **THEN** check-ipc-bridge.js 正常工作，从 preload/index.js 提取 invoke 调用

### Requirement: Store 功能域拆分
系统 SHALL 将 567 行的 Store 类按功能域拆分为 8 个子 Store，通过 `store/index.js` 统一导出。

#### Scenario: 向后兼容
- **WHEN** 现有代码 `require('./store')` 调用 `store.listAccounts()`
- **THEN** 通过 index.js 代理到 account-store.js，API 签名不变

### Requirement: createAppContext 分组
系统 SHALL 将 createAppContext 返回的 52 个字段按 infra/services/windows/pipelines 分组。

#### Scenario: 过渡期兼容
- **WHEN** 现有代码访问 `context.store`
- **THEN** 通过 Proxy 代理到 `context.infra.store`

### Requirement: remotion-composer 测试补全
系统 SHALL 为 remotion-composer 的核心模块添加单元测试，覆盖 props-validator/scene-builder/media-profiles。

#### Scenario: 核心模块测试覆盖
- **WHEN** 运行 remotion-composer 测试
- **THEN** props-validator / scene-builder / media-profiles 三个核心模块有测试覆盖

## MODIFIED Requirements

### Requirement: 定时器资源清理
所有主进程 setTimeout/setInterval SHALL 调用 `.unref()` 或在 shutdown 时 clearInterval，防止阻止进程退出。

**修改**：从"建议"提升为"强制"。当前 104 处定时器中 33 处已 unref，需补全长期定时器的 unref 覆盖。

## REMOVED Requirements

### Requirement: sandbox:true 启用
**Reason**: preload 使用 require 加载本地模块，sandbox:true 不支持相对路径 require。安全性已由 contextIsolation:true + nodeIntegration:false 保障（commit 9aa1680 确认）。
**Migration**: 无需迁移，保持 sandbox:false，通过 CSP 补偿 XSS 防御。

### Requirement: Adapter 按能力分子目录
**Reason**: 实测 46 个 adapter 文件名已自带能力后缀（-image/-llm/-tts/-stt/-video），命名即分组，无需子目录。
**Migration**: 仅提取 6 个基础设施文件（base.js/registry.js/router.js/provider-error.js/openai-compatible.js/music-library.js）到 `_base/` 子目录。
