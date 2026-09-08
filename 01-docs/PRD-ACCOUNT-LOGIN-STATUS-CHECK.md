# PRD: 账号登录状态自动检测与主页提醒

> 版本: 1.0 | 日期: 2026-09-08 | 状态: 已实现
> 关联 PR: #1558

## 1. 需求背景

不同内容平台的账号登录具有不同的时效（Cookie/Session 过期时间不同）。用户可能在应用关闭期间，平台 Cookie/会话已经过期，但当下次启动应用时并不知情。如果用户用已失效的账号进行发布，会导致发布失败。

现有系统在账号列表加载时仅做本地凭证存在性检测（`checkLocalCredentials`），不做真实网络验证，无法及时发现 Cookie 过期。

## 2. 功能目标

### 2.1 启动时自动检测失效账号
- 应用启动时，主页自动从账号 Store 中筛选 `status === 'expired'` 的账号
- 这里的 `expired` 状态由主进程 `toPublicAccount` 逻辑推导：本地无加密凭证 → `status` 强制置为 `'expired'`
- 有凭证但 `status` 为 `'active'` 的账号不在此列（需要主动触发 `checkLogin` 做 Playwright 真实校验）

### 2.2 主页登录失效提醒横幅
当有失效账号时，在主页欢迎区与数据概览之间显示横幅：

| 显示项 | 内容 | i18n key |
|--------|------|----------|
| 标题 | 登录失效提醒 | `home.loginExpiredBanner.title` |
| 描述 | X 个账号待处理 | `home.loginExpiredBanner.description` |
| 说明 | 不同平台的登录具有不同的时效。请完成已失效账号的登录验证，以免影响发布。 | `home.loginExpiredBanner.hint` |
| 按钮 | 【批量登录】 | `home.loginExpiredBanner.batchLoginBtn` |

### 2.3 批量登录
点击【批量登录】按钮后：
1. 收集所有失效账号的 ID 列表
2. 调用 `accounts:batch-open-login` IPC 获取各平台的登录 URL
3. 对每个失效账号，通过 `tabStore.createTab` 打开对应平台的登录标签页
4. 标签页标题格式：`登录 - {平台名称}`

## 3. 数据校验

### 3.1 渲染层 → 主进程
- `accountId` 必须经过 `_isSafePathSegment` 校验（仅允许字母/数字/下划线/短横线）
- 拒绝包含 `/`、`?`、`#`、`..` 等路径操纵字符的 accountId
- `platform` 同样必须经过安全校验

### 3.2 主进程 → 渲染层
- 账号列表经 `toPublicAccount` 过滤白名单字段
- `login_check_error` 和 `status_reason` 经 `toPublicErrorValue` 脱敏（截断到 240 字符，脱敏 token/密钥）
- 所有账号字段必须通过 `publicAccountFields` 白名单

### 3.3 批量检测
- 单账号检测失败不中断整体流程
- 每个账号的检测结果独立记录到 `results` 数组
- 返回 `checkedAt` ISO 时间戳

## 4. 流程

### 4.1 启动检测流程
```
App.vue 挂载 Home 组件
  → onMounted
    → accountStore.ensureLoaded()  // 幂等加载账号列表
    → 筛选 account.status === 'expired'
    → 设置 expiredAccountCount / showExpiredBanner
    → 如果 expiredCount > 0，显示横幅
```

### 4.2 批量登录流程
```
用户点击【批量登录】
  → handleBatchLogin()
    → 收集 expiredAccounts 的所有 ID
    → 调用 accountBatchOpenLogin(expiredAccountIds)
    → IPC: accounts:batch-open-login
      → 校验每个 accountId 安全路径段
      → AccountManager.listAccounts()
      → 从 PLATFORM_LOGIN_URLS 获取各平台登录 URL
      → 返回 { items: [{accountId, platform, name, loginUrl}] }
    → 遍历 items，逐项调用 tabStore.createTab({ url, platform, accountId, title })
      → 主进程 WebviewManager 创建新标签页
      → 按账号持久化 session 分区
```

### 4.3 批量检测流程（已有 API，供后续定时任务使用）
```
调用 accountBatchCheckLogin(accountIds?)
  → IPC: accounts:batch-check-login
    → 校验 owner subject
    → AccountManager.listAccounts()
    → 过滤候选账号（有 platform + id）
    → 按 accountIds 过滤（缺省全查）
    → 顺序执行 AccountManager.checkLoginStatus(platform, accountId)
      → Playwright 无头浏览器加载 Cookie 访问登录页
      → 等待登录成功选择器 10 秒
      → 返回 { valid, code }
    → 返回 { results: [{platform, accountId, valid, code, error?}], checkedAt }
```

## 5. 功能逻辑

### 5.1 横幅显示逻辑
- `showExpiredBanner = expiredAccountCount > 0`
- 用户可点击 ✕ 关闭横幅（`showExpiredBanner = false`）
- 横幅关闭后本次会话不再显示（除非刷新页面重新挂载）
- 如果所有失效账号都处理完毕，下次加载时横幅自动消失

### 5.2 批量登录逻辑
- 收集当前 `expiredAccounts` 中的所有 ID
- 调用 IPC 获取 URL 列表
- 逐个打开标签页（顺序执行，避免浏览器资源竞争）
- 标签页使用 `account-{accountId}` session 分区，自动恢复加密凭证 cookie
- 注意：标签页模式无凭证捕获机制，登录成功后需在账号管理页手动确认

### 5.3 组件交互
- `LoginExpiredBanner` 组件 Props: `visible` (Boolean), `expiredCount` (Number)
- Emits: `batch-login`, `dismiss`
- 所有文案通过 `t('home.loginExpiredBanner.*')` 获取

## 6. 交互逻辑

### 6.1 横幅样式
- 背景色：`#fef0f0`（浅红），边框：`1px solid #fbc4c4`
- 标题：14px, font-weight 600, `#c45656`
- 描述：13px, `#e67474`
- 提示：12px, `#999`
- 按钮：背景 `#f56c6c`，白色文字，hover 透明度 0.9
- 关闭按钮：右侧 ✕，无边框背景

### 6.2 状态变化
- 无失效账号：横幅不显示
- 有失效账号：横幅显示在欢迎区与数据概览之间
- 点击关闭：横幅消失
- 点击批量登录：触发批量登录流程，打开多个标签页

## 7. 显示项

| 元素 | 位置 | 内容 | 条件 |
|------|------|------|------|
| 横幅容器 | Home.vue 欢迎区与数据概览之间 | LoginExpiredBanner 组件 | showExpiredBanner = true |
| 图标 | 横幅左侧 | ⚠️ emoji | 始终 |
| 标题 | 图标右侧 | 登录失效提醒 | 始终 |
| 计数 | 标题下方 | {count} 个账号待处理 | 始终 |
| 说明 | 计数下方 | 不同平台的登录具有不同的时效... | 始终 |
| 按钮 | 说明右侧 | 批量登录 | 始终 |
| 关闭 | 按钮右侧 | ✕ | 始终 |

## 8. 技术架构

### 8.1 新增 IPC 通道
| 通道 | 方向 | 功能 |
|------|------|------|
| `accounts:batch-check-login` | renderer → main | 批量检测账号登录状态 |
| `accounts:batch-open-login` | renderer → main | 返回批量登录 URL 列表 |

### 8.2 新增组件
| 组件 | 路径 | 功能 |
|------|------|------|
| `LoginExpiredBanner` | `apps/desktop/src/components/LoginExpiredBanner.vue` | 登录失效提醒横幅 |

### 8.3 修改文件
| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `electron/ipc-handlers/account.js` | 新增 | 2 个 IPC handler |
| `electron/preload/account.js` | 新增 | 2 个 preload 方法 |
| `src/api/publisher.js` | 新增 | 2 个 API 封装 |
| `src/views/Home.vue` | 修改 | 集成横幅 + 批量登录 |
| `src/locales/zh.js` | 新增 | 6 个中文 key |
| `src/locales/en.js` | 新增 | 6 个英文 key |

## 9. 测试

### 9.1 单元测试
- `LoginExpiredBanner.test.js`：visible 控制、文案渲染、batch-login 事件、dismiss 事件
- `Home.test.js`（新增）：横幅显示/隐藏、批量登录触发、横幅关闭

### 9.2 集成验证
- 18/18 测试通过
- locale `--keys` 门禁通过（739 个 key 均存在于 zh/en）
- zh/en 成对检查通过

## 10. 关于"定期检查"和"启动时检测"

### 启动时检测
**已实现。** 应用启动时，Home.vue 的 `onMounted` 中调用 `accountStore.ensureLoaded()` 加载账号列表，然后筛选 `status === 'expired'` 的账号显示横幅。这里的 `expired` 状态由主进程 `toPublicAccount` 推导：`checkLocalCredentials` 检查本地加密凭证是否存在，无凭证则强制设为 `expired`。

### 定期检查（定时轮询）
**当前未实现前端定时轮询。** 原因分析：
- 现有 `account:check-login` 每次调用启动一次 Playwright 无头浏览器，耗时 10-30 秒/账号
- 如果用户有 10+ 个账号，全量检测耗时 3-5 分钟，不适合前台定时轮询
- 已新增 `accounts:batch-check-login` IPC 通道，未来可配合后台定时任务使用
- 建议未来实现方案：Electron 主进程后台定时任务（如每小时），静默调用 `batch-check-login`，结果通过 `account:status-changed` 事件推送到渲染层

## 11. 未来扩展

- 定时后台检测：利用 `accounts:batch-check-login` + Electron 主进程定时器
- 检测结果持久化：将检测结果写入 account store 的 `last_login_check_at` / `login_check_error` 字段
- 通知提醒：检测到失效时发送系统通知
- 检测进度指示：批量检测时显示进度条
