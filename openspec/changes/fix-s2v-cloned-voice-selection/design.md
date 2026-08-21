# 设计：克隆音色被替换为官方音色

## 现状

`MinimaxTtsAdapter.cloneVoice`（apps/desktop/electron/services/adapters/minimax-tts.js:518）：
- 上传 `/v1/files/upload` 拿到 `file_id`；
- 调用 `/v1/voice_clone`，body 含 `model: speech-2.8-hd`；
- `cloneResp` 成功只认 HTTP 状态；随后 `finalId = cloneJson?.voice_id || cloneJson?.data?.voice_id || voiceId`，**不检查 `cloneJson.base_resp`**。

因此 MiniMax 返回 `HTTP 200 + base_resp.status_code=2038`（如无复刻权限）时，适配器把本地生成、格式合规但平台上不存在的 voice_id 当作成功，上层 `tts-voice-clone-service.addClone` 把它写入本地 registry，前端显示为可选的「音色001」。

生成阶段 `story2video-stages.js` `tryReCloneVoice`（#1075 引入）：
- 检测到 voice id 类错误后尝试用本地样本重克隆；
- 重克隆失败或 clone service 缺失时，调用 `retryFn('default')` 用 provider 默认官方音色重新合成，并仅写 `meta.voice_fallback=true`。

## 修复

1. `cloneVoice` 在解析 `cloneJson` 后立即校验 `base_resp`：
   - `status_code` 为数值且非 0 → `throw classifyBaseRespError(status_msg, this.id, status_code)`；
   - 状态码 0 或无 `base_resp` 时保持原回显/本地 id 回退逻辑，兼容旧服务端。
2. `tryReCloneVoice` 删除 `fallbackToDefaultVoice`：
   - clone service 缺失、样本缺失、适配器不支持、重克隆失败、重试合成失败 → 一律返回 null；
   - 调用方（generate_assets / finalize_assets）原有逻辑把 `e.message` 作为 TTS 失败原因返回，用户看到明确的「克隆音色不可用」类错误，而不是另一把声音。

## 测试

- `minimax-tts.test.js`：2038 业务错误必须抛 `ProviderError`、携带 `context.statusCode=2038`、message 保留供应商原因；成功/旧兼容路径不变。
- `story2video-stages.test.js`：三个回归用例覆盖 clone service 缺失、重克隆失败、重克隆后重试失败；均断言返回 null 且未调用 `retryFn('default')`。

## 风险

- 反向行为变化：#1075 的「默认音色兜底」被移除，克隆音色不可用时流水线会失败并提示用户，而不是产出错误音色的成片；与 PRD 7.1.16.1 合同一致。
- 不改变列表/偏好/样本持久化与跨账号重克隆成功路径。
