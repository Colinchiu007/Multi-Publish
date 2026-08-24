## ADDED Requirements

### Requirement: 多标签标题按标签标识隔离

桌面 renderer SHALL 使用事件携带的 `tabId` 更新对应标签的标题和 URL；当且仅当该 `tabId` 等于当前活动标签时，renderer 才可以更新导航栏标题或 URL。

#### Scenario: 非活动标签标题变化

- **WHEN** 非活动标签发出页面标题更新事件
- **THEN** renderer 更新该非活动标签的标题
- **AND** 当前活动标签和导航栏标题保持不变

#### Scenario: 活动标签标题变化

- **WHEN** 当前活动标签发出页面标题更新事件
- **THEN** renderer 同时更新该标签和导航栏标题

### Requirement: 过期刷新不得覆盖实时标签状态

桌面 renderer SHALL 在写入异步列表或活动导航响应前验证请求仍是最新请求且仍针对当前活动标签；如果相应标签在请求发起后收到实时标题或导航事件，renderer SHALL 保留实时事件中的标题和 URL。

#### Scenario: 切换后旧导航响应返回

- **WHEN** renderer 请求标签 A 的导航状态后切换到标签 B
- **AND** 标签 A 的响应在切换后返回
- **THEN** renderer 不得用标签 A 的状态覆盖标签 B 的导航栏

#### Scenario: 列表刷新期间标题事件到达

- **WHEN** renderer 已发起标签列表刷新
- **AND** 同一标签在响应返回前发出新的标题事件
- **THEN** renderer 保留事件中的新标题而不是响应中的旧标题

### Requirement: 标签激活与导航请求一致

桌面 renderer SHALL 在处理标签创建或切换通知时，先同步本地活动标签标识，再发起活动导航刷新。

#### Scenario: 标签切换通知

- **WHEN** renderer 收到包含目标 `tabId` 的切换通知
- **THEN** renderer 为该 `tabId` 请求并呈现导航状态
