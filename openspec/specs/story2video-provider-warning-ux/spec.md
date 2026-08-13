# story2video-provider-warning-ux Specification

## Purpose
模型服务异常提示（`providerWarnings`）按流水线运行归属下发，且前端横幅可关闭，避免跨运行残留与无法消除的提示。
## Requirements
### Requirement: 异常提示按运行归属下发
Story2Video 流水线运行上下文（`pipeline:getRunContext`）携带的 `providerWarnings` SHALL 仅包含该运行创建时间（含）之后记录的异常快照；运行创建时间缺失时 MAY 回退为全量快照。

#### Scenario: 新运行不携带旧运行异常
- **WHEN** 用户不退出应用，重新进入「全能创作」并启动新流水线
- **THEN** 新运行上下文的 `providerWarnings` 不包含旧运行记录的异常

#### Scenario: 当前运行内新增异常实时出现
- **WHEN** 当前运行内某 provider 出现慢响应/超时/网络错误
- **THEN** 轮询返回的 `providerWarnings` 包含该异常且横幅重新显示

#### Scenario: 运行创建时间缺失回退全量
- **WHEN** 运行快照不提供 `createdAt`
- **THEN** 保持下发全部异常快照（不隐藏警告）

### Requirement: 提示横幅可关闭
模型服务异常横幅 SHALL 提供关闭按钮；关闭后本次运行内不再显示；启动新流水线或取消流水线时 SHALL 重置关闭状态与警告列表。

#### Scenario: 点击关闭按钮隐藏横幅
- **WHEN** 用户点击横幅上的关闭按钮
- **THEN** 横幅立即隐藏且本次运行内不再显示

#### Scenario: 新运行重新评估
- **WHEN** 用户启动新流水线
- **THEN** 关闭状态与警告列表重置，新运行内的新异常可再次显示

#### Scenario: 取消运行重置
- **WHEN** 用户取消当前流水线
- **THEN** 关闭状态与警告列表一并重置

