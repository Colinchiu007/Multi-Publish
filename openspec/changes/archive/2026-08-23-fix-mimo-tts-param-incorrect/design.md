## Context

MiMo TTS 使用 OpenAI Chat Completions 兼容请求，`audio.voice` 是服务商参数。Story2Video 的“使用服务商默认音色”设置最终会传递为空音色，适配器再使用自身默认常量填充请求。运行日志和 MiMo 官方中文接口文档共同确认，当前 `default` 值不是普通 v2.5 TTS 的合法内置音色。

## Goals / Non-Goals

**Goals:**

- 让空音色配置生成符合 MiMo 官方合同的 `audio.voice=mimo_default` 请求。
- 用请求体级回归测试锁定未传音色、空字符串音色和显式音色三类行为。
- 保持变更只影响 MiMo 适配器，避免改变其他 provider 的默认音色。

**Non-Goals:**

- 不调整 `speed`、`pitch`、`volume` 等当前未映射到 MiMo API 的参数。
- 不把通用输出格式从 `mp3` 改为 `wav`；适配器已有 `wav` 默认值，当前错误证据只指向非法音色。
- 不修改 voice-design 或 voice-clone 模型的专用参数合同。

## Decisions

1. **在 MiMo 适配器默认常量处修复。** 选择修改 `DEFAULT_VOICE`，因为这是所有上层空音色入口的共同收敛点；不在 Story2Video 或通用资产生成器中硬编码 MiMo 音色，避免污染跨 provider 逻辑。
2. **采用 `mimo_default`。** 该值来自用户提供的 MiMo 官方 v2.5 中文文档和同一官方 API 文档的普通 TTS 示例。保留显式 `voice` 原样透传，避免覆盖用户已选的自定义/专用音色。
3. **只扩展适配器单测。** 通过 fetch mock 解析最终 JSON 请求体，覆盖“省略”和“空字符串”两个实际失败入口；不新增真实 API 调用，避免测试依赖密钥和网络。

## Risks / Trade-offs

- [Risk] MiMo 服务商未来调整内置音色名称。→ 以官方文档链接和请求体回归测试记录当前合同，后续适配器变更需同步更新。
- [Risk] `outputFormat` 仍由上层通用流程决定。→ 本次不扩大范围；继续保留现有适配器 `wav` 默认及相关测试。

## Migration Plan

部署新版本后，未选择具体音色的 MiMo 普通 TTS 请求会自动使用 `mimo_default`；已有显式音色配置不迁移、不改写。回滚只需恢复适配器默认常量和对应回归断言。
