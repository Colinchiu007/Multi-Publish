# 账号管理与内容发布对标增补（2026-08-04）

## 证据来源

- 目标应用安装目录：D:\Program Files\yixiaoer\；本轮确认版本为 4.13.19。
- 用户更正后的逆向工程目录：D:\Data\projects\_逆向工程_蚁小二4.0\。该目录包含 packages/renderer/dist、packages/preload/dist、packages/main/dist/index.cjs、RPA分析报告.md 与 可复用代码分析.md。
- 本仓库既有资料：01-docs/yixiaoer-reverse/analysis、prd、test-cases。
- 本工作树：C:\tmp\Multi-Publish-yixiaoer-account-publish-parity\；分支 codex/yixiaoer-account-publish-parity-20260803。

逆向目录和安装包用于确认技术结构、页面资源、Cookie/BrowserView、发布队列和通用上传/取消/重试模式；不把反编译代码中的未调用函数当成已观察 UI 行为。

## 页面与流程矩阵

| 模块 | 当前入口 | 已对齐的可观测行为 | 当前代码合同 | 外部边界 |
|---|---|---|---|---|
| 账号管理 | /accounts | 搜索、状态筛选、平台筛选、卡片/列表、收藏、默认账号、代理、批量启用/禁用/删除、登录状态条 | useAccountStore 负责账号/选择/本地分组，AccountManagementCard 负责卡片操作，AccountLoginDialog 与 Electron auth 事件负责授权 | 真实第三方登录、验证码和平台 Cookie 仍依赖目标环境 |
| 分组管理 | /accounts?tab=groups 或账号页按钮 | 创建、删除、成员勾选、重命名、平台过滤 | AccountGroupManager 发出 create/delete/rename/set-platform/toggle-account 事件；Store 以显式 accountIds 持久化 | 当前为设备级 localStorage，不等同于团队云共享 |
| 收藏分组 | /accounts?tab=favorites | 复用账号列表的收藏筛选 | filter=favorite，账号列表仍走同一状态/平台/选择合同 | 未观察到蚁小二服务端收藏同步 API |
| 分享链接 | /accounts?tab=share | 导航入口和诚实能力边界提示 | 当前不伪造团队数据，明确提示尚未接入团队分享服务 | 团队成员、权限、分享链接生命周期需真实后端契约后实现 |
| 新建发布 | /publish | 独立主入口、单篇/批量、平台/账号绑定、媒体、封面、标签、话题、@、定时、草稿、进度、重试 | publish-contract.js 统一归一化/校验；usePublishFlow 与 useBatchPublish 共享目标和媒体字段 | 平台上传、签名、配额和真实发布结果需真实账号与网络 |
| 发布记录 | /publish/history | 搜索、平台/时间/状态筛选、网格/列表、详情、失败重试、CSV | historyList/historyGet/retryTask 走现有 IPC/API 适配 | 删除、平台侧审核和统计字段取决于后端 |
| 草稿箱 | /publish?tab=drafts | 从模块导航直接打开并加载草稿列表，也可从发布页打开 | usePublishDrafts 对媒体/封面/标签/话题/@ 做纯 JSON 脱壳后 IPC 传输 | 跨设备同步和素材库联动未证明 |

## 已完成的结构收敛

1. App.vue 仅对账号/发布工作区挂载 YixiaoerModuleNav；其他模块保留原有导航，避免无关页面回归。
2. 发布模块导航新增“新建发布”，不再把“发布记录”冒充发布主入口。
3. 账号模块 query 页签能驱动分组弹窗、收藏筛选和分享能力边界；分组关闭时会回到 /accounts。
4. 批量发布不再以平台字符串作为无账号回退；目标必须绑定结构化账号并通过同一校验。
5. 视频平台判断从静态小集合扩展为平台内容分类和稳定 fallback；历史页与发布页共享视频语义。

## 设计与代码分离审计

已确认仍有以下非阻断遗漏，不能声称“整个项目已完全分离”：

- apps/desktop/src/styles/cohere-design-system.css 已提供全局 token，但账号、发布、历史仍有 scoped CSS 与大量 inline style；本轮只保证新工作区不再挂载旧壳层，不做大范围视觉重构。
- 平台名称/图标仍存在 store、shared-utils、publish-contract 三个读取入口；应在后续以 platform store adapter 作为唯一 view-model。
- 发布草稿在 Publish.vue 与 PublishHistory.vue 仍各有一层展示；字段合同已统一，但组件抽取尚未完成。
- 负责人/发布人筛选目前保留为 disabled 占位，因为未发现可验证的 owner/team API；不得用前端假数据冒充蚁小二团队能力。

## 验证矩阵

- 定向 Vitest：账号分组、账号 Store、账号页面、模块导航、发布页、发布历史、发布合同、批量发布、草稿共 9 files / 249 tests；后续批量可见 ID 与非法元数据回归已补充。
- 必测 UI 合同：query 页签 active 状态、分组重命名/平台过滤、分享边界提示、草稿 query 自动打开、结构化媒体 metadata。
- 构建门禁：本轮未修改 Electron runtime main/preload 源码，但更新了 Electron 视觉合同测试；仍按 QM-1 执行了 Windows builder、ASAR require 和真实窗口启动检查。打包时缺少 `.playwright-browsers` 目录，启动 stderr 仅出现既有 Logto `invalid_grant` 外部认证错误，不能当作线上登录通过。
- 视觉门禁：账号、发布、发布记录和草稿 query 必须在目标 worktree Vite 端口下执行像素回归；截图不得包含账号 Cookie、二维码或个人信息。

## 本地代码审查边界

- 外部 Antigravity 因 `agy command not found` 未运行，Claude wrapper 以退出码 1 结束；本轮没有伪造“双模型已通过”，审查结论来自本地静态检查、定向 lint 和测试。
- 全局 lint 仍有既有 Electron 文件的 15 个错误和 84 个警告；本轮变更文件定向 lint 为 0 错误、2 个既有警告（`Accounts.vue` 未使用的 `addAccountForPlatform` 与 CSS 文件无匹配配置）。
- 设计与代码分离、团队分享、手机号/密码登录、真实第三方发布和线上审核仍列为后续/外部边界。

## 不可客观证明的 100% 一致

以下事项必须保持 PENDING_EXTERNAL 或 PENDING_USER_LOGIN，不应在 PR 描述中写成完成：

- 第三方平台网页登录、手机号/验证码/密码登录、二维码过期和真实 Cookie 持久化。
- 平台上传签名、分片 CDN、审核、配额、失败重试的线上返回。
- 蚁小二团队/分享链接服务端的成员权限和跨设备同步。
- 真实安装包窗口截图与当前 worktree 的像素 100% 等价；反编译 bundle 可确认资源和调用形状，但不等同于完整原始源码。
