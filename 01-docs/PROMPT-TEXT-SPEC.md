# 用户提示文字与多语言规范（PROMPT-TEXT-SPEC）

> 唯一事实源（代码侧）：`apps/desktop/src/utils/user-facing-error.js`（`USER_ERROR_CODES` + zh/en `MESSAGES` + `formatUserError`）。
> 关联文档：PRD §3.2「用户提示文字与多语言规范」、`01-docs/ipc-manifest.md`「错误返回契约」、`01-docs/INTEGRATION.md`「用户提示文字集成」、`01-docs/coding-standards.md`「IPC 错误返回与用户提示文字」、`01-docs/DESIGN.md`「交互文案分册」、`openspec/specs/user-facing-messages/spec.md`。

## 1. 目标与适用范围

- **目标**：所有出现在用户面前的错误、警告、建议、状态提示与引导文字，一律输出为清晰、自然、可理解的语言；出现问题或操作失败时必须给出「具体原因 + 解决方法建议」；支持多语言（中文/英文），语言解析 = 显式设置 > 系统语言 > 默认。
- **适用范围**：Electron 桌面端（`apps/desktop`）主进程 IPC 错误、渲染端 Vue 视图/composable/组件/store 的全部用户可见提示；Story2Video 通知；设置弹窗通用设置的 UI 文案。
- **不适用**：日志（`console.*` / `reportError`）、内部调试输出、后端服务（api-publish-engine / ops-center）独立错误面（遵循各自契约）。

## 2. 语言解析规则

| 优先级 | 来源 | 规则 |
|--------|------|------|
| 1 | 用户显式设置（localStorage `locale`） | `zh` / `en`，即时生效并持久化（设置弹窗「通用设置」语言切换控件） |
| 2 | 系统语言（`navigator.language`） | `zh*` → 中文；`en*` → 英文；其余 → 英文（与 vue-i18n `fallbackLocale` 一致） |
| 3 | 默认 | 中文 |

实现：`apps/desktop/src/i18n/index.js` 导出 `detectSystemLocale()` / `resolveAppLocale()` / `getAppLocale()` / `setAppLocale()`。测试环境通过 `apps/desktop/test-setup.js` 固定 `navigator.language = 'zh-CN'` 保证断言确定性。

## 3. 主进程错误返回契约

统一返回结构：`{ code, data?, message, errorCode?, messageParams? }`

| 字段 | 类型 | 说明 |
|------|------|------|
| `code` | number | 既有数值错误码（`-1` 请求、`-2` 校验、`-3` 认证、`-10` 未找到、`-11` 超时、`-12` 网络、`-13` IO、`429` 限流、`402` 额度） |
| `errorCode` | string | 稳定机器可读错误码（渲染端 `formatUserError` 优先按此映射） |
| `message` | string | **自然语言（具体原因 + 解决方法建议）**；禁止内部通道名、英文括号注释、内部错误码、栈信息、IP:端口 |
| `messageParams` | object | 诊断上下文（`{ channel }` / `{ detail }`），仅供日志/诊断，**禁止渲染端直接展示** |

### 访问控制层（license-access-control.js）

| errorCode | 触发场景 | message 示例（zh） |
|-----------|---------|-------------------|
| `AUTH_REQUIRED` | 未登录/未激活调用需登录通道 | 当前许可证无权访问该功能，请先登录并确认账号已开通所需权益后重试。 |
| `ENTITLEMENT_REQUIRED` | 已登录但缺业务权益（如 `cloud_publish`） | 当前账号没有所需权益，无法使用该功能。请升级或开通对应权益后重试。 |
| `UNTRUSTED_SENDER` | IPC sender 校验失败 | 未授权的调用来源 |

兼容性：`AUTH_REQUIRED` / `ENTITLEMENT_REQUIRED` 的 message 保留「当前许可证无权访问」「当前账号没有所需权益」前缀，使 Story2Video 通知的 `ACCESS_DENIED_PATTERN` 继续命中。

### 模型服务商层（model-provider-manager.js）

| errorCode | 触发场景 |
|-----------|---------|
| `PROVIDER_EXISTS` | 创建时 ID 已存在（渲染端降级为更新已有预设） |
| `CREATE_FAILED` / `UPDATE_FAILED` / `DELETE_FAILED` / `SET_DEFAULT_FAILED` | CRUD 失败（原始 detail 在 `messageParams.detail`） |
| `ENCRYPT_FAILED` / `CRYPTO_UNAVAILABLE` | API Key 加密失败 / 系统安全存储不可用 |
| `ADAPTER_NOT_FOUND` / `PROVIDER_NOT_FOUND` | 适配器未注册 / 服务商不存在 |
| `API_KEY_NOT_CONFIGURED` / `API_KEY_REQUIRED` | 未配置 API Key / 远程服务商必填 |
| `ADAPTER_INIT_FAILED` / `OPERATION_NOT_SUPPORTED` | 适配器初始化失败 / 方法不支持 |
| `STORE_NOT_INITIALIZED` / `INVALID_CATEGORY` / `NO_UPDATABLE_FIELDS` / `VALIDATION_ERROR` | 数据服务未就绪 / 分类无效 / 无可更新字段 / 校验失败 |

## 4. 渲染端统一出口 formatUserError

`src/utils/user-facing-error.js` 的 `formatUserError(input, { locale?, fallback? })` 解析顺序（严格）：

1. **errorCode**：`input.errorCode` 命中 `USER_ERROR_CODES` → 输出 zh/en「原因 + 建议」文案；
2. **数值 code**：`-3` 认证 / `-2` 校验 / `-10` 未找到 / `-11` 超时 / `-12` 网络 / `-13` IO / `429` 限流 / `402` 额度 → 映射；
3. **遗留 pattern**：未登录/网络/超时/存储/限流/额度/API Key 未配置等正则 → 映射；
4. **未知错误**：
   - 含技术标识（通道名 `store:xxx`、大写下划线码 `VOICE_CATALOG_UNAVAILABLE`、栈信息 `line N`、IP:端口）→ 使用 fallback 或通用「操作失败，请稍后重试」，不泄露内部文本；
   - 其余自然语言原因文本 → **原样透传**（保留具体原因，不丢信息）。

返回 `{ errorCode, message, matched }`。任何用户可见区域不得直接渲染 `result.message` / `e.message` 原文。

## 5. 提示文字表（核心 errorCode，zh / en）

| errorCode | zh（原因 + 建议） | en |
|-----------|-------------------|-----|
| AUTH_REQUIRED | 当前未登录或登录状态已失效，无法使用该功能。请先登录后重试；若仍提示无权限，请确认当前账号已开通所需权益。 | You are not signed in or your session has expired...Please sign in and try again... |
| ENTITLEMENT_REQUIRED | 当前账号没有所需权益，无法使用该功能。请升级或开通对应权益后重试。 | The current account does not have the required plan... |
| UNTRUSTED_SENDER | 检测到非预期的调用来源，本次操作已取消。请重启应用后重试。 | An unexpected call source was detected... |
| NETWORK_ERROR | 网络连接失败。请检查网络后重试。 | Network connection failed. Please check your network... |
| TIMEOUT | 操作超时。请稍后重试；若持续出现请重启应用。 | The operation timed out. Please try again later... |
| STORAGE_UNAVAILABLE | 本地存储暂时不可用。请重启应用后重试；若持续出现，请检查本地磁盘空间与读写权限。 | Local storage is temporarily unavailable... |
| VALIDATION_ERROR | 提交的数据不符合要求。请检查输入后重试。 | The submitted data does not meet the requirements... |
| NOT_FOUND | 未找到相关记录或资源，可能已被删除。请刷新后重试。 | The related record or resource was not found... |
| IO_ERROR | 读写本地文件失败。请检查磁盘空间与文件权限后重试。 | Failed to read or write local files... |
| RATE_LIMITED | 操作过于频繁，已被服务商限流。请稍等片刻后再试。 | You are being rate limited... |
| QUOTA_EXCEEDED | 当前额度已用完。请等待额度恢复或升级套餐后重试。 | Your current quota has been used up... |
| PROVIDER_EXISTS | 该服务商 ID 已存在。请更换 ID，或直接编辑已有服务商后重试。 | This provider ID already exists... |
| ADAPTER_NOT_FOUND | 未找到该服务商对应的适配器。请检查服务商配置后重试。 | No adapter was found... |
| PROVIDER_NOT_FOUND | 未找到该服务商，可能已被删除。请刷新列表后重试。 | The provider was not found... |
| API_KEY_NOT_CONFIGURED | 该服务商尚未配置 API Key。请在「模型设置」中填写对应服务商的 API Key 后重试。 | This provider does not have an API key configured... |
| API_KEY_REQUIRED | 远程服务商必须配置 API Key。请在「模型设置」中填写后重试。 | Remote providers require an API key... |
| ADAPTER_INIT_FAILED | 服务商初始化失败。请检查配置与服务商服务状态后重试。 | Provider initialization failed... |
| OPERATION_NOT_SUPPORTED | 该服务商不支持此操作。请在「模型设置」中调整模型配置后重试。 | This provider does not support this operation... |
| CREATE/UPDATE/DELETE/SET_DEFAULT_FAILED | 创建/更新/删除/设置默认服务商失败。请检查输入或稍后重试。 | Creation/Update/Deletion/Failed to set default... |
| ENCRYPT_FAILED / CRYPTO_UNAVAILABLE | API Key 加密失败 / 系统安全存储不可用，无法保存 API Key。请重启应用或检查系统设置后重试。 | Failed to encrypt the API key / secure storage unavailable... |
| OPERATION_FAILED（通用） | 操作失败，请稍后重试。 | The operation failed. Please try again later. |

完整中英文文案以 `user-facing-error.js` 的 `MESSAGES` 目录为准（本表为摘要）。

## 6. 显示项与交互逻辑

| 显示项 | 交互逻辑 | 文案要求 |
|--------|---------|---------|
| 页面级错误行（创作历史/发布历史/流水线/回放/项目库等） | 展示 `formatUserError` 输出 + 附「重试」按钮 | 原因 + 建议 + 重试入口 |
| 轻提示（ElMessage error/warning/info） | 模型设置、账号管理、采集、监控面板、审批门、升级弹窗等 | 原因 + 建议，不直出原文 |
| 发布结果区（成功/失败摘要） | 成功显示主进程 message；失败显示格式化文案 | 失败必须含原因 + 建议 |
| 自动更新错误 | 更新/下载失败显示格式化文案 | 网络类映射网络文案 |
| Story2Video 通知 | 沿用 `story2video-notifications.js` pattern→key 映射 | 原因 + 建议 |
| 面板错误（AI 写稿/标题/标签/基准/趋势等） | 展示格式化文案 | 原因 + 建议 |

## 7. 多语言覆盖现状与差距（2026-08-12 审计）

### 已多语言化
- vue-i18n 基础语料（`src/locales/zh.js` / `en.js`）：导航、设置、发布、图片轮播配置、流水线名称/阶段/状态等。
- Story2Video 通知（`story2video-notifications.js`）：zh/en 双份 pattern→key 文案。
- `user-facing-error.js`：核心 errorCode 的 zh/en「原因 + 建议」文案。
- 主进程访问控制/模型服务商错误：`errorCode` + 自然语言 message（渲染端按 locale 映射）。

### 差距（存量债务）
- **技术性错误直出**（PR #529 + 2026-08-12 修复已覆盖 16+8 个文件）：历史遗漏的 `result.message`/`e.message` 直出路径已统一接入 `formatUserError`（Accounts/Monitor/Collection/ContactSheetView/ViralAnalysis/CloudPublish/useProviderCrud/templates/backlot/CreateView voice catalog/面板组件等）。
- **硬编码中文 UI 文案**：渲染端约 118 个源文件、数千处硬编码中文（按钮、标签、状态、提示、引导文案），未纳入 vue-i18n。**英文界面下仍显示中文**。这是存量债务，需分批推进（见 §8）。
- **主进程中文 message**：主进程 message 为中文 hardcode，英文界面依赖渲染端 `formatUserError` 映射；未映射的通道仍显示中文。

## 8. 存量 i18n 分批推进计划（建议）

| 批次 | 范围 | 说明 |
|------|------|------|
| P1 | 错误/警告/技术性提示统一接入 `formatUserError` | ✅ 已完成（PR #529 + 2026-08-12） |
| P2 | 高频页面导航/操作类文案抽入 vue-i18n（Home/Publish/Accounts/History/Settings） | 进行中：✅ Home.vue（PR #565）；✅ Publish.vue（PR #570）；✅ Accounts.vue（PR #577）；待办 History/Settings |
| P3 | 视频创作（CreateView ~1000 处）分批抽取 | 需配合视觉回归 |
| P4 | 采集/监控/项目库/其余面板 | 低优先级 |

每条文案抽取标准：`src/locales/zh.js` + `en.js` 成对登记；动态插值用 `(ctx) => ctx.named(...)`（CSP 安全，禁止运行时编译）；组件内用 `useI18n().t` 或 `$t`。

## 9. 测试与验收

- `src/utils/user-facing-error.test.js`：errorCode 优先 / 数值 code / pattern / 技术文本 sanitize / 自然语言透传 / zh+en。
- `src/i18n/i18n.test.js`：系统语言检测（zh*/en*/其余）、显式设置优先、setAppLocale 持久化。
- `electron/ipc-handlers/license-access-control.test.js`：errorCode + message 不含通道名。
- 受影响视图/composable 测试：技术文本不直出、自然语言透传。
- 修改任何用户可见提示后必须：`formatUserError` 覆盖 + zh/en 文案 + 对应测试更新 + PRD §3.2 / 本规范登记。

## 10. 维护流程（新增/修改提示文字 Checklist）

1. 判断错误源：主进程返回 `errorCode`（新增码进 `USER_ERROR_CODES` + `MESSAGES` zh/en）；渲染端本地错误直接走 `formatUserError`。
2. 确认 `message` 为自然语言（原因 + 建议），无内部标识符。
3. 更新 `01-docs/ipc-manifest.md` 错误返回契约、PRD §3.2 提示文字表、本规范 §5。
4. 补充/更新测试；语言切换验证 zh/en。
5. 提交前过 `.quality-gates.md` 自检（用户提示文字统一格式化项）。
