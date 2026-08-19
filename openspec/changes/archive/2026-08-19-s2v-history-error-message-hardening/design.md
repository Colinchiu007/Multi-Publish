## Context

原始错误在主进程和历史记录中仍可保留，用于诊断；renderer 只能消费稳定消息键和经过白名单校验的参数。当前错误路径有两个入口：formatPipelineError 处理流水线自由文本，story2video-notifications 处理历史卡片、结果页和对话框通知。两条路径必须输出同一类安全参数。

## Goals / Non-Goals

**Goals:**

- 只允许 context、provider、detail 等经过归一化的用户可见参数进入 locale 插值。
- 将 provider ID 解析为可读模型账号名称；识别失败时安全回退。
- 保留场景号、素材生成比例和生成类型等有助于行动的上下文，但去掉技术语法。
- 通过 zh/en 单测固定模板参数和脱敏边界。

**Non-Goals:**

- 不删除历史记录中的原始错误存储；不改变日志诊断能力。
- 不重新设计 provider 配置页或增加新的模型服务。
- 不把所有错误都强行猜测成具体 provider；未知值必须回退。

## Decisions

### 1. 使用集中 provider 映射

选择新增 provider-name-map.js，而不是在每个通知分支复制 provider 名称。映射按稳定 provider ID 工作，并拒绝 account、provider、数字和其他泛化 token。备选方案是直接显示原始 provider 字符串，但会把内部 ID 暴露给用户，且不同路径会产生不一致文案。

### 2. 使用自然语言 context

sceneText 是内部模板名，不能作为 locale 参数。formatter 只输出场景号和素材比例，renderer 在归一化边界拼接成“（场景 22）”“（场景 0/51，图片生成）”等自然语言。这样 locale 不需要理解内部引用，也不会把未解析的 {...} 直接显示出来。

### 3. 具体 provider 优先，安全回退其次

若 raw error 或显式参数识别出 minimax-multimodal，显示 MiniMax模型账号；若识别不到，显示 当前模型账号。不显示“对应模型账号”、provider account 或空白 provider。

### 4. 原始错误只用于分类

技术字符串只参与正则分类和有限字段提取。未知错误统一使用 operation_failed；历史场景优化词失败的 detail 仍需进一步收敛时，必须沿同一技术细节白名单，不能直接回显完整原文。

## Risks / Trade-offs

- [Provider 新 ID 未及时加入映射] → 使用当前模型账号回退，并在 provider 配置新增时补映射测试。
- [不同语言的场景单复数不自然] → formatter 按 scene 与 scenes ratio 分开生成 context，并覆盖 zh/en 测试。
- [历史旧快照仍保存 sceneText] → renderer 忽略旧参数，仅接受归一化后的 context/provider；旧快照继续可读。
- [外部审查服务不可用] → 记录降级原因，使用本地 diff、测试、构建和门禁完成审查，不宣称外部审查通过。

## Migration Plan

1. 先部署 renderer 兼容逻辑；旧历史记录无需迁移。
2. 新失败记录沿稳定 message key 存储/显示，原始错误仍保留在诊断字段。
3. 回滚时可恢复旧 locale 和 formatter，不涉及数据迁移；但旧模板可能重新暴露技术参数，因此回滚只作为紧急手段。
