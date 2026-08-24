## Why

使用 MiMo TTS 普通模型且音色选择为服务商默认时，Story2Video 流水线在 `generate_assets` 阶段失败。运行 `run_1787475502069_9888` 的日志显示 MiMo 返回 `Param Incorrect`；当前适配器把空音色发送成 `default`，但 MiMo v2.5 普通 TTS 文档规定的内置默认音色为 `mimo_default`。

## What Changes

- 将 MiMo TTS 适配器的默认音色改为官方内置音色 `mimo_default`。
- 对未传音色和空字符串音色增加请求体回归测试，确保最终发送 `audio.voice=mimo_default`。
- 保留显式音色原样透传，以及现有模型、消息角色、输出格式和响应解析行为。

## Capabilities

### New Capabilities

- `mimo-tts-provider-contract`: 定义 MiMo 普通 TTS 在省略音色时使用官方内置默认音色的请求契约。

### Modified Capabilities

（无。现有规格未定义 MiMo TTS 默认音色这一行为。）

## Impact

- 运行时代码：`apps/desktop/electron/services/adapters/mimo-tts.js`。
- 回归测试：`apps/desktop/electron/services/adapters/mimo-tts.test.js`。
- 不涉及 IPC、持久化、前端文案、其他供应商或 `mp3`/`wav` 输出格式行为。
