## ADDED Requirements

### Requirement: 快手二维码登录入口可验证

快手在账号添加弹窗中 SHALL 显示可用的二维码登录模式；按钮可用不等于登录成功，登录成功必须由账号事件和凭证恢复共同确认。

#### Scenario: 快手 QR 模式可选择

- **WHEN** 用户在账号添加弹窗选择 kuaishou 且平台 QR capability 未从 IPC 返回
- **THEN** QR 模式按钮仍可选择，提交按钮不因空 capability 被禁用

#### Scenario: 非 QR 平台仍被禁用

- **WHEN** 用户选择不支持二维码的平台且 capability 不可用
- **THEN** QR 模式按钮和提交动作保持禁用

### Requirement: 平台 cookie 域隔离

平台 cookie 过滤 SHALL 只接受明确平台域名或其子域，不能接受公共注册域本身作为平台 cookie 域。

#### Scenario: 百家号拒绝公共百度域

- **WHEN** 百家号 cookie domain 是 .baidu.com
- **THEN** isPlatformCookieDomain('baijiahao', domain) 返回 false

#### Scenario: 百家号接受创作者域及明确认证域

- **WHEN** cookie domain 是 .baijiahao.baidu.com、其子域或 .passport.baidu.com
- **THEN** 返回 true

### Requirement: 发布页主操作可见

单篇发布页 SHALL 在桌面长表单滚动时保持发布/保存草稿主操作区可见，并在窄屏下不遮挡表单内容。

#### Scenario: 桌面滚动

- **WHEN** 发布页次级面板内容超过视口高度
- **THEN** 主操作区 sticky 定位，按钮仍可操作

#### Scenario: 移动窄屏

- **WHEN** 视口宽度小于等于 720px
- **THEN** 主操作区回到正常流或使用安全底部间距，页面无横向溢出

### Requirement: 连接状态不得伪造成功

账号页面 SHALL 使用真实 bridge/账号状态确认连接状态；状态未知时 SHALL 显示中性文案。

#### Scenario: 未确认连接

- **WHEN** bridge 状态尚未返回或账号状态不可确认
- **THEN** 页面不显示“客户端已连接”作为确定成功状态

### Requirement: 发布取消不因单个失败中断

发布取消 SHALL 使用 allSettled 语义处理并发取消；成功取消的 ID 从活动列表移除，失败或被拒绝的 ID 保留供再次重试，取消请求本身不得抛出未处理 rejection。

#### Scenario: 单个取消请求被拒绝

- **WHEN** activeTaskIds 包含任务且 cancelTask rejected
- **THEN** cancelPublish 正常 resolve，活动任务保留，返回 pending 大于 0

#### Scenario: 部分取消成功

- **WHEN** 多个任务中部分成功、部分业务失败
- **THEN** 成功 ID 移除、失败 ID 保留，结果展示部分取消失败

### Requirement: 视频封面通过同源媒体通道提取

封面提取器 SHALL 通过 loopback HTTP 同源媒体通道加载本地视频；不得依赖跨 file/data scheme 访问。每次提取后 SHALL 销毁隐藏窗口并关闭临时服务。

#### Scenario: 本地视频可提取封面

- **WHEN** 输入存在的本地 mp4 文件
- **THEN** extractVideoCover 返回 JPEG 临时文件路径

#### Scenario: 临时服务生命周期

- **WHEN** 提取完成或失败
- **THEN** 隐藏 BrowserWindow 被销毁且 loopback HTTP 服务被关闭
