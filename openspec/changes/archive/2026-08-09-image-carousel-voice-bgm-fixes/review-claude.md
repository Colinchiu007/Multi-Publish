# Review（Claude, 2026-08-09）

- **双模型说明**：antigravity 后端本机缺失（`agy` CLI 未安装），按机制硬化规则降级为 Claude + 主代理独立分析/审查。
- **Claude 复审结论（session 7312bf86）**：
  - Critical ×1（已修复）：`_supportsRemoteDelete` 把能力探测异常折叠为「不支持」→ 支持 deleteVoice 的 provider（如 ElevenLabs）在探测失败时被静默降级为纯本地删除、远端音色遗留。修复：`supportsAdapterMethod` 改为三态（true=支持 / false=明确不支持 / null=无法判定），`_supportsRemoteDelete` 对 null/异常/API 缺失回退旧行为（尝试远端删除）。
  - Warning ×1（已修复）：`selectS2VVoice` 乐观写 `s2vConfig.voiceId` 无失败回滚 → 保存失败时回滚为 previousVoiceId，并补红灯用例。
  - Warning ×1（核实为误报）：`normalizeParams` 已对 FORMAT/SIZE 保留 kindLabel（notifications.js:192-202，既有测试 99-120 行覆盖）；补 `MEDIA_PATH_UNRESOLVED` zh/en 端到端用例。
  - Warning ×1（说明）：`Atomics.wait` 同步退避最坏 450ms——仅在文件被占用罕见路径出现，已加注释说明是有意取舍。
  - Warning ×1（核实通过）：adapter `supports` 继承自 BaseAdapter（KNOWN_METHODS 自动检测），manager 测试用真实 adapter（minimax-tts cloneVoice=true / deleteVoice=false）验证。
  - Warning ×1（核实通过）：测试隔离——beforeEach 每用例重建 manager，无泄漏。
  - Info：copyImportedMedia 原始错误 code 丢失（可接受）、EEXIST 半成品边界（token 含 pid+random，概率低）、MEDIA_PATH_UNRESOLVED 生产来源为 preload `无法读取媒体文件路径`（publish.js:137/139，非死代码）、本地删除路径清理失败用例已补。
- **回归**：tts-voice-clone-service 33 / model-provider-manager 41 / story2video-paths 15 / CreateView 114 / notifications 24（含新增）。
- **全量**：`npx vitest run` 385 files / 6649+ tests PASS（修复后复跑）。

## 第二轮真实 Electron 实证（2026-08-09 19:00-19:10）

- **Bug③ 双层系统根因（探针实证）**：
  1. `electron-bridge.toPlainIpcValue` 对 File 做 `JSON.parse(JSON.stringify(file))` → `{}` → preload `webUtils.getPathForFile` 返回空 → 误报「无法读取所选文件」（视频路径因 CreateView 直连 `window.electronAPI.getPathForFile` 绕过 bridge 而幸免）。修复：`toPlainIpcValue` 对 File/Blob 原样透传。
  2. `story2video:import-media` 不在 `PUBLIC_CHANNELS` → 未登录/未激活返回 code:-3。修复：加入主进程 PUBLIC_CHANNELS + preload PUBLIC_METHODS（本地设备操作不因许可证被拦截，与 PR #428 历史通道同类）。
- **修复后真实 Electron 验证**：`setInputFiles` 真实 mp3 → `handleS2VBgmFile` 全链路成功（`bgmPath=C:\...\story2video\selected-media\bgm-*.mp3`、无错误弹窗）；直连 `story2videoImportMedia` code 0。
- **新增回归**：electron-bridge（File 透传）、license-access-control（import-media 未登录放行 + 写通道仍拒）、preload（公开方法/通道对齐）、CreateView/paths/notifications 既有新增。
- **范围说明**：`tts-voice-clone:*` 通道在未许可环境同样门禁，但用户环境删除已到达服务层（报 VOICE_CLONE_PROVIDER_UNAVAILABLE 而非 license 错误）→ 用户已认证；克隆 add 调用付费 provider API，通道门禁视为有意设计，本变更不扩大。
