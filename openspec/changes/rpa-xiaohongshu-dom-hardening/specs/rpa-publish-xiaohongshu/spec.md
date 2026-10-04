## ADDED Requirements

### Requirement: 小红书 DOM 轨以"存入草稿箱"为验收目标

小红书 RPA 发布器 SHALL 以"内容成功保存进创作者中心草稿箱"为可验收的成功终态，MUST NOT 执行真实公开发布作为默认验收路径。成功判定 SHALL 基于正面确认信号（草稿保存 API 响应经 `ResponseMonitor` 捕获，或草稿箱列表回查命中本次条目），MUST NOT 依赖固定 `sleep` 后无条件报成功，MUST NOT 伪造 `url`。

#### Scenario: 草稿保存确认后才报成功
- **WHEN** 发布器填写标题/正文/图片并触发草稿保存
- **AND** `ResponseMonitor` 捕获到草稿保存端点返回成功响应
- **THEN** 返回 `success=True`，且 `url` 为真实草稿箱/条目地址而非硬编码占位

#### Scenario: 无正面确认绝不报成功
- **WHEN** 触发草稿保存后在超时窗口内既无成功响应也无草稿箱回查命中
- **THEN** 返回 `success=False` 且带可诊断 error，MUST NOT 报 `success=True`

### Requirement: 草稿意图 fail-closed，禁止误公开发布

当调用方传入 `draft=True`（草稿意图）时，发布器 SHALL 仅在找到草稿保存入口时执行保存；若找不到草稿入口，SHALL fail-closed 返回错误，MUST NOT fallthrough 点击"发布/发布笔记"造成公开发布。

#### Scenario: 找不到草稿入口时拒绝公开发布
- **WHEN** `draft=True` 且草稿保存按钮选择器在重试后仍不命中
- **THEN** 返回 `success=False`，error 指明"草稿入口缺失"，且未点击任何公开发布按钮

### Requirement: 选择器多候选回退与富文本可靠填写

发布器 SHALL 对关键控件（标题、正文、发布/草稿按钮、上传完成标志）使用多候选选择器回退链而非单一脆弱选择器；对 contenteditable 标题/正文 SHALL 通过事件派发（input/change）填写以触发前端框架状态更新；多标签 SHALL 逐个输入并选择下拉建议，MUST NOT 用覆盖式 fill 导致仅保留最后一个。

#### Scenario: 主选择器不命中时回退
- **WHEN** 首选标题选择器在页面结构中不存在
- **THEN** 发布器按回退链尝试候选选择器，命中即继续

#### Scenario: contenteditable 正文生效
- **WHEN** 正文控件为 contenteditable div 而非原生 textarea
- **THEN** 填写后触发 input 事件，前端状态含该正文，草稿保存后正文非空

### Requirement: DOM 轨错误归一到 outcome 且不越合规红线

发布器 SHALL 将登录过期、风控弹层、上传失败分别归一为对应 outcome 类别；命中 risk / login 类别时 SHALL 停止上报，MUST NOT 自动降级或更换账号；运行时 MUST NOT 请求任何外部签名/求签服务（`*.refpub.cn`、`*.yixiaoer.cn`）。

#### Scenario: 登录过期归一为 login 类
- **WHEN** 导航后 URL 落在 /login 或认证恢复失败
- **THEN** 返回 login_expired 类 outcome，不重试发布、不换号

#### Scenario: 风控弹层归一为 risk 类
- **WHEN** 页面出现风控/验证弹层
- **THEN** 返回 risk_blocked 类 outcome 并停止，不绕过

### Requirement: 发布流程逻辑可注入假页面做单测

发布器 SHALL 将发布步骤逻辑与真实 playwright 启动解耦（可注入 `page` 与 `ResponseMonitor` 工厂），使核心分支（草稿 fail-closed、确认才成功、选择器回退、错误归一）可在无真实浏览器的假对象下单元测试。

#### Scenario: 假页面驱动草稿 fail-closed 单测
- **WHEN** 单测注入一个"无草稿入口"的假 page 调用发布流程
- **THEN** 断言未点击公开发布按钮且返回 failure 类结果
