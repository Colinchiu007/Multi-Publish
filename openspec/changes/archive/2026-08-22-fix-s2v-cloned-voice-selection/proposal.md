# 修复：故事讲述流水线克隆音色被替换成模型官方音色

## Why

用户报告：视频创作-故事讲述流水线选择了通过本地音频自定义克隆的音色「音色001」，生成视频后实际旁白是模型官方音色。

根因链：
1. `MinimaxTtsAdapter.cloneVoice` 只读取 HTTP 状态码，未检查 MiniMax 常见的 `HTTP 200 + base_resp.status_code != 0` 业务错误（如 2038 voice clone user forbidden）。
2. 克隆失败时适配器仍返回本地生成的合规 voice_id（假成功），应用把它持久化为可选的克隆音色「音色001」。
3. 生成阶段使用该幻影 voice_id 调用 TTS，平台返回 `voice id wrong`；`tryReCloneVoice` 重克隆再次失败后，将本次运行静默回退到 provider 默认官方音色并仅标记 `voice_fallback`，用户无感知地拿到另一把声音。

## What Changes

- `minimax-tts.js` `cloneVoice`：检查 `base_resp.status_code`，非 0 即抛 `ProviderError`（复用 `classifyBaseRespError`），绝不把幻影 voice_id 当作成功。
- `story2video-stages.js` `tryReCloneVoice`：移除「回退 provider 默认音色」逻辑；重克隆失败/不可用时返回 null，由调用方透传原始克隆音色错误，与 PRD 7.1.16.1 Layer 3「正常报错」一致。
- 回归测试：
  - `minimax-tts.test.js`：200 + `base_resp.status_code=2038` 时 cloneVoice 抛错且不返回 id。
  - `story2video-stages.test.js`：克隆服务不可用/重克隆失败/重试失败时 `tryReCloneVoice` 返回 null，且不再调用 `retryFn('default')`。

## Capabilities

### New Capabilities

（无新增能力）

### Modified Capabilities

- `minimax-tts`: 音色复刻业务失败 fail closed，不再持久化幻影克隆音色。
- `story2video-generate-assets`: 用户显式选择的克隆音色不可用时，不再静默替换为 provider 默认官方音色。

## Impact

- `apps/desktop/electron/services/adapters/minimax-tts.js`
- `apps/desktop/electron/services/story2video-stages.js`
- 对应测试文件；不涉及数据库、IPC 协议、密钥或前端布局。
