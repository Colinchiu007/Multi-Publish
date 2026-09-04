# 账号管理页 - 质量修复需求文档

## 概述
针对账号管理页（`/accounts`）的10项质量问题，逐一修复并增强。

## 需求详情

### 1. 重复账号去重
- **现状**：同一平台同一账号可添加多次，列表中显示多个重复条目
- **目标**：同一自媒体平台账号只显示1个；重复添加时提示"此账号已添加过"
- **实现位置**：
  - 前端：Accounts.vue addAccount 方法，添加前检查是否已存在
  - 后端：account-manager.js saveCapturedAccount 或 IPC handler auth:open-login
  - 数据库：accounts 表按 platform + platformAccountId 唯一约束
- **验证规则**：通过 platform + account_name 或 platformAccountId 判断重复
- **提示文字**："此账号已添加过，请勿重复添加"

### 2. 账号卡片显示昵称
- **现状**：卡片顶部显示平台名称（如"快手"）
- **目标**：显示该自媒体账号的用户昵称（account_name / name）
- **实现位置**：AccountManagementCard.vue 的 platform-chip 区域
- **显示项**：`account.account_name || account.name || platformLabel`

### 3. 粉丝数获取
- **现状**：粉丝数显示"暂无数据"或静态值
- **目标**：获取并显示真实粉丝数
- **实现位置**：
  - 后端 Python API：需从平台账户抓取粉丝数并存储
  - 前端：AccountManagementCard.vue 的 followersLabel
- **数据来源**：账号爬取时从平台抓取；定期更新

### 4. 创作者中心链接修正
- **现状**：B站跳转的是首页而非创作者中心
- **目标**：所有平台跳转到正确的创作者中心
- **修复**：
  - Bilibili: `https://member.bilibili.com/` 或 `https://creator.bilibili.com/`
  - 其他平台逐一核实
- **文件**：`packages/shared-utils/src/platform-definitions.js` 的 PLATFORM_DASHBOARD_URLS

### 5. B站 → Bilibili 更名
- **现状**：平台显示名为"B站"
- **目标**：改为"Bilibili"
- **文件**：
  - `packages/shared-utils/src/platform-display-definitions.json` PLATFORM_NAMES.bilibili
  - TabBar.vue 中 bilibili 图标映射名
  - 其他涉及"B站"文字的地方

### 6. 右上角"访客"信息处理
- **现状**：右上角显示"访客"（IdentityMenu.vue）
- **目标**：判断是身份系统未接入还是正常显示
  - 如果已登录：显示用户真实姓名/邮箱
  - 如果未登录：显示"访客"（正常）
  - 如果身份服务不可用：显示"离线模式"或隐藏
- **文件**：
  - `src/components/IdentityMenu.vue`
  - `src/stores/identity.js`

### 7. 验证按钮交互
- **现状**：点击验证后仅显示通知
- **目标**：
  - 已登录状态：提示"登录状态正常"，3秒后消失
  - 未登录状态：弹出对话框，文字"登录已失效，是否重新登录"，按钮"取消"、"去登录"
  - 点击"去登录"：调用 reloginAccount 流程
- **实现位置**：
  - Accounts.vue checkLogin 方法
  - AccountManagementCard.vue 验证按钮

### 8. 去登录按钮状态
- **现状**：始终显示"去登录"
- **目标**：
  - 已登录状态：按钮灰显，文字改为"已登录"
  - 未登录状态：显示"去登录"，点击打开新标签页跳转登录页
- **实现位置**：AccountManagementCard.vue 底部按钮

### 9. 标签页名称显示
- **现状**：标签显示平台名或域名
- **目标**：显示应用页面名称（首页、视频创作、账号管理等）
- **实现位置**：
  - TabBar.vue getTabLabel
  - tab store 创建标签时传入正确标题

### 10. 标签系统完善
- **现状**：
  a. 第1个标签（首页）不可关闭但刷新按钮可见、地址栏可用
  b. 前进/后退按钮未生效
  c. 加号新建标签与首页标签内容同步
- **目标**：
  a. 首页标签固化：隐藏刷新按钮，地址栏灰显不可编辑，前进/后退可用
  b. 前进/后退按钮在应用内标签间切换路由历史
  c. 加号新建标签打开独立的应用页面（默认首页），与首页标签内容独立
- **实现位置**：
  - NavBar.vue：根据 isHome 条件隐藏刷新按钮、灰显地址栏
  - TabBar.vue：加号创建新标签调用 createTab 时打开应用首页
  - tab store：支持多个应用级标签，每个标签有独立路由状态
  - router：支持基于标签的路由隔离