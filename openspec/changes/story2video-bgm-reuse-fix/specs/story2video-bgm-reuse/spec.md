## Purpose

修复图片轮播（story2video-compose）流水线中已导入 BGM 在运行收尾被删除导致重试/断点续跑时 compose 阶段失败的时序问题；拆分「API Key 未配置/解密失败」与「未找到模型」的提示；保证多模态预设 models 与预设目录一致。

## ADDED Requirements

### Requirement: 运行收尾不得删除仍可复用的已导入 BGM

story2video-compose 运行结束（完成/失败/取消）的媒体清理 SHALL 跳过已导入的 BGM 文件（`selected-media` 内 `bgmPath` 目标），因为前端配置与后续重试/断点续跑仍引用该路径；一次性导入（替换旁白音频、归一化拒绝回滚）的清理语义 MUST 保持不变。

#### Scenario: 收尾后 BGM 文件保留

- **WHEN** story2video-compose 运行结束且其 params.bgmPath 指向 `selected-media` 内已导入文件
- **THEN** 该 BGM 文件不被删除，下一次运行/断点续跑可再次通过 compose 校验

#### Scenario: 一次性导入仍被清理

- **WHEN** `replace-segment-audio` 等一次性导入场景调用 `cleanupImportedMediaPaths`（未传 skipBgm）
- **THEN** `audio`/`video`/`bgmPath` 位于导入目录内的文件按原语义删除

### Requirement: compose 对不可用 BGM 降级而非失败

compose 阶段收到 BGM 路径但无法解析（扩展名不支持/不在允许根目录/文件不存在或不可读/超过单文件上限）时 SHALL 降级为无 BGM 继续合成，返回成功并携带 `bgmSkipped: true` 与可读警告；总输入大小超限等防滥用边界 MUST 仍按失败处理。

#### Scenario: BGM 文件缺失降级

- **WHEN** `requestedBgmPath` 非空但 `resolveReadableMediaFile` 返回 null
- **THEN** compose 返回 `code === 0`、`data.bgmApplied === false`、`data.bgmSkipped === true`，且 data 含中文警告文本

#### Scenario: 总大小超限仍失败

- **WHEN** 含 BGM 的输入媒体总大小超过 `maxInputTotalBytes`
- **THEN** compose 返回失败（`Input media exceeds the total size limit`），不降级

### Requirement: 通知 key 拆分 API Key 与模型缺失

错误归一化 SHALL 将「API Key 未配置/未设置/解密失败」映射到独立的 `MODEL_API_KEY_REQUIRED` 通知，仅将真正的模型缺失（默认 LLM/默认模型/未找到模型/模型不可用）映射到 `MODEL_CONFIGURATION_REQUIRED`，不得把 key 问题展示为「未找到需要的相关模型」。

#### Scenario: key 未配置提示独立

- **WHEN** 原始错误包含 `尚未配置 API Key` / `API Key not configured` / `decrypt failed`
- **THEN** 解析结果为 `MODEL_API_KEY_REQUIRED`，文案明确指向「重新填写 API Key」，而非「添加模型」

#### Scenario: 模型缺失保持原提示

- **WHEN** 原始错误包含「未找到需要的相关模型」/「默认 LLM 不可用」
- **THEN** 解析结果为 `MODEL_CONFIGURATION_REQUIRED`（既有文案不变）

### Requirement: 多模态预设 models 与预设目录一致

多模态（multimodal）类预设的存量行 SHALL 在启动同步时把预设目录中缺失的模型追加进行 `models`（只增不删、保持顺序）；其他类别（models 用户可编辑）MUST 不自动改写。

#### Scenario: 存量行回填新预设模型

- **WHEN** `minimax-multimodal` 行 models 缺少预设中的 `MiniMax-M2.7`
- **THEN** 同步后行 models 包含 `MiniMax-M2.7`，原有模型顺序保持不变
