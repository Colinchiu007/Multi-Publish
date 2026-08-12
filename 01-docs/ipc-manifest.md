# IPC ????

> ?????: 2026-07-04
> ??: apps/desktop/electron/ipc-handlers/

## account

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `accounts:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:open-login` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:login-silent` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:close` | IPC invoke | (event, ...args) | { code, data, message } |
| `auth:save-credentials` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:delete` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:check-login` | IPC invoke | (event, ...args) | { code, data, message } |
| `account:list` | IPC invoke | (event, ...args) | { code, data, message } |

## ai

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `ai:generate-titles` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:generate-summary` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:enhance-content` | IPC invoke | (event, ...args) | { code, data, message } |
| `ai:is-configured` | IPC invoke | (event, ...args) | { code, data, message } |

## analytics

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `analytics:overview` | IPC invoke | (event, ...args) | { code, data, message } |
| `analytics:platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `analytics:platforms` | IPC invoke | (event, ...args) | { code, data, message } |

## keyword

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `keyword:start` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:stop` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:history` | IPC invoke | (event, ...args) | { code, data, message } |
| `keyword:stop-all` | IPC invoke | (event, ...args) | { code, data, message } |

## license

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `license:info` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:activate` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:deactivate` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:activate-trial` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:has-feature` | IPC invoke | (event, ...args) | { code, data, message } |
| `license:features` | IPC invoke | (event, ...args) | { code, data, message } |

## misc

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `app:get-version` | IPC invoke | (event, ...args) | { code, data, message } |
| `app:get-platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `hotkeys:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `first-run:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `show-notification` | IPC invoke | (event, ...args) | { code, data, message } |

## offline

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `offline:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:is-offline` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:cached-tasks` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:add-to-cache` | IPC invoke | (event, ...args) | { code, data, message } |
| `offline:clear-cache` | IPC invoke | (event, ...args) | { code, data, message } |

## payment

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `payment:create-order` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:list-orders` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:get-order` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:complete` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:simulate` | IPC invoke | (event, ...args) | { code, data, message } |
| `payment:cancel` | IPC invoke | (event, ...args) | { code, data, message } |

## platform

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `platform:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `platform:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `platform:definitions` | IPC invoke | (event, ...args) | { code, data, message } |

## proxy

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `proxy:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:add-batch` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:remove` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:test` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:test-all` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:get-next` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:reset` | IPC invoke | (event, ...args) | { code, data, message } |
| `proxy:remove-dead` | IPC invoke | (event, ...args) | { code, data, message } |

## publish

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `publish:wechat` | IPC invoke | (event, ...args) | { code, data, message } |
| `publish:batch` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:history` | IPC invoke | (event, ...args) | { code, data, message } |
| `queue:cancel` | IPC invoke | (event, ...args) | { code, data, message } |
| `history:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `history:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `dashboard:stats` | IPC invoke | (event, ...args) | { code, data, message } |

## render

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `render:start` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:cancel` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:status` | IPC invoke | (event, ...args) | { code, data, message } |
| `render:install-deps` | IPC invoke | (event, ...args) | { code, data, message } |

## scheduler

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `scheduler:create` | IPC invoke | (event, ...args) | { code, data, message } |
| `scheduler:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `scheduler:cancel` | IPC invoke | (event, ...args) | { code, data, message } |

## sensitive

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `sensitive:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `sensitive:replace` | IPC invoke | (event, ...args) | { code, data, message } |

## store

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `store:add-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-accounts` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:delete-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:set-default-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-default-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:update-account` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:add-publish-record` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-publish-history` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-publish-stats` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:add-scheduled-task` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-scheduled-tasks` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:delete-task` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:get-setting` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:set-setting` | IPC invoke | (event, ...args) | { code, data, message } |
| `store:list-callback-logs` | IPC invoke | (event, ...args) | { code, data, message } |

## sync

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `sync:all` | IPC invoke | (event, ...args) | { code, data, message } |
| `sync:platform` | IPC invoke | (event, ...args) | { code, data, message } |
| `sync:cached` | IPC invoke | (event, ...args) | { code, data, message } |

## templates

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `template:list` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:get` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:add` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:update` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:delete` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:list-by-category` | IPC invoke | (event, ...args) | { code, data, message } |
| `template:get-presets` | IPC invoke | (event, ...args) | { code, data, message } |

## update

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `update:check` | IPC invoke | (event, ...args) | { code, data, message } |
| `update:download` | IPC invoke | (event, ...args) | { code, data, message } |
| `update:install` | IPC invoke | (event, ...args) | { code, data, message } |

## upload

| Channel | ?? | ???? | ???? |
|---------|------|----------|----------|
| `upload:chunked` | IPC invoke | (event, ...args) | { code, data, message } |
| `upload:cancel` | IPC invoke | (event, ...args) | { code, data, message } |

## 错误返回契约（2026-08-11 新增，user-facing-messages）

所有 IPC 调用统一返回 `{ code, data, message }`。自 2026-08-11（PR #529）起，错误返回可携带两个新增字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `errorCode` | string | 稳定机器可读错误码；渲染端 `formatUserError` 优先按此映射本地化「原因 + 建议」文案 |
| `messageParams` | object | 诊断上下文（如 `{ channel }`、`{ detail }`），**仅供日志/诊断，禁止渲染端直接展示** |

### 访问控制层错误码（license-access-control.js）

| errorCode | 触发场景 | message 规则 |
|-----------|---------|--------------|
| `AUTH_REQUIRED` | 未登录/未激活许可证调用需登录通道 | 自然语言（原因 + 建议），不含通道名 |
| `ENTITLEMENT_REQUIRED` | 已登录但缺业务权益（如 `cloud_publish`） | 自然语言（原因 + 建议），不含通道名 |
| `UNTRUSTED_SENDER` | IPC sender 校验失败（非受信来源） | `未授权的调用来源`（保持既有断言兼容） |

内部通道名仅出现在 `messageParams.channel`，不进入 `message`。

### 模型服务商错误码（model-provider-manager.js）

| errorCode | 触发场景 |
|-----------|---------|
| `PROVIDER_EXISTS` | 创建时 ID 已存在（渲染端据此降级为更新已有预设） |
| `CREATE_FAILED` / `UPDATE_FAILED` / `DELETE_FAILED` / `SET_DEFAULT_FAILED` | 服务商 CRUD 失败（原始 detail 在 `messageParams.detail`） |
| `ENCRYPT_FAILED` / `CRYPTO_UNAVAILABLE` | API Key 加密失败 / 系统安全存储不可用 |
| `ADAPTER_NOT_FOUND` / `PROVIDER_NOT_FOUND` | 适配器未注册 / 服务商不存在 |
| `API_KEY_NOT_CONFIGURED` / `API_KEY_REQUIRED` | 未配置 API Key / 远程服务商必填 |
| `ADAPTER_INIT_FAILED` / `OPERATION_NOT_SUPPORTED` | 适配器初始化失败 / 方法不支持 |
| `STORE_NOT_INITIALIZED` / `INVALID_CATEGORY` / `NO_UPDATABLE_FIELDS` / `VALIDATION_ERROR` | 数据服务未就绪 / 分类无效 / 无可更新字段 / 校验失败 |

### message 规则（铁律）

1. `message` 必须是自然语言（具体原因 + 解决方法建议），**不得包含**内部通道名（`store:xxx`）、英文括号注释、内部错误码、栈信息或 IP:端口。
2. 内部标识符一律放入 `messageParams`（`channel` / `detail`）。
3. 渲染端用户可见区域禁止直接渲染 `message` 原文，必须经 `src/utils/user-facing-error.js` 的 `formatUserError()`（解析顺序：errorCode → 数值 code → 遗留 pattern → 技术文本 sanitize / 自然语言透传）。
4. 新增错误码时：在 `user-facing-error.js` 的 `USER_ERROR_CODES` + `MESSAGES`（zh/en）登记，并在 PRD §3.2「用户提示文字与多语言规范」提示文字表补充。
