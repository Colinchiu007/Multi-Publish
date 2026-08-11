# user-facing-messages Specification

## Purpose
TBD - created by archiving change prompt-user-friendly-i18n. Update Purpose after archive.
## Requirements
### Requirement: 访问控制拒绝返回结构化错误码
`license-access-control` 的访问控制拒绝结果 SHALL 返回稳定机器可读的 `errorCode`（`AUTH_REQUIRED` / `ENTITLEMENT_REQUIRED` / `UNTRUSTED_SENDER`），`message` 必须是去掉内部通道名的自然语言文案（含「原因 + 建议」），内部通道名只能出现在 `messageParams.channel`（诊断用，禁止渲染端直接展示）。

#### Scenario: 未登录调用受保护通道
- **WHEN** 未登录/未激活许可证时调用需登录的 IPC 通道（如 `store:list-publish-history`）
- **THEN** 返回 `{ code: -3, errorCode: "AUTH_REQUIRED", message: 不含通道名的自然语言（含原因+建议）, messageParams: { channel: "store:list-publish-history" } }`，渲染端不得展示通道名

#### Scenario: 无权益调用付费功能
- **WHEN** 已登录但账号缺少 `cloud_publish` 等业务权益时调用付费通道
- **THEN** 返回 `{ code: -3, errorCode: "ENTITLEMENT_REQUIRED", message: 含「开通/升级权益」建议的自然语言 }`

#### Scenario: 不可信来源
- **WHEN** IPC sender 校验失败（非受信渲染来源）
- **THEN** 返回 `{ code: -3, errorCode: "UNTRUSTED_SENDER", message: "未授权的调用来源" }`（保持既有断言兼容）

### Requirement: 渲染端统一错误文案映射
渲染端 SHALL 提供并默认使用 `formatUserError(input, { locale, fallback })`：按 `errorCode`（优先）→ 数值 `code` → 遗留原始 message pattern 的顺序解析，输出当前语言下的「具体原因 + 解决方法建议」；无法识别时返回调用方提供的通用 fallback，不得把原始技术文本（通道名/英文错误码/栈信息）直接展示给用户。

#### Scenario: 技术性 message 不再直出
- **WHEN** 渲染端任一路径收到含通道名/英文括号注释/内部错误码的 IPC 错误
- **THEN** 展示的是 `formatUserError` 输出的本地化文案，原始 message 不直接出现在用户可见区域

#### Scenario: 多语言
- **WHEN** 应用语言为 en 时触发任意已映射错误
- **THEN** 展示英文「reason + suggestion」文案；zh 时展示中文文案

#### Scenario: 未映射错误
- **WHEN** 收到无法识别的错误且未提供 fallback
- **THEN** 展示通用「操作失败，请稍后重试」类文案，不展示原始错误文本

### Requirement: 系统语言自动检测与设置切换
应用语言 SHALL 按以下优先级解析：用户显式设置（localStorage `locale`）→ 系统语言（`navigator.language`，`zh*`→zh、`en*`→en、其余→en）→ 默认 zh。设置弹窗「通用设置」页 SHALL 提供语言切换控件（中文/English），切换即持久化并即时生效。

#### Scenario: 首次启动无设置
- **WHEN** 用户未设置过语言且系统语言为 en-US / zh-CN / fr-FR
- **THEN** 分别解析为 en / zh / en

#### Scenario: 设置覆盖系统
- **WHEN** 用户通过设置切换为中文（或英文）后再次启动
- **THEN** 以 localStorage `locale` 为准，不受系统语言影响

### Requirement: 场景-测试映射
以上场景 SHALL 由以下测试覆盖：`src/utils/user-facing-error.test.js`（errorCode/数值 code/pattern/未知 fallback/zh/en）、`src/i18n/i18n.test.js`（系统语言检测与设置覆盖）、`license-access-control.test.js`（errorCode 与 message 不含通道名）、`model-provider-manager` 测试（英文括号注释移除）、受影响视图测试（技术性 message 不再直出）。

#### Scenario: 回归断言
- **WHEN** 实现完成后运行桌面端相关测试
- **THEN** 上述测试文件全部通过，且断言 errorCode 存在、message 不含内部通道名/英文括号注释

