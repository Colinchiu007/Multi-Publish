# Tasks: image-carousel-voice-bgm-fixes

## 1. Bug① 本地克隆音色删除

- [ ] `ModelProviderManager.supportsAdapterMethod(providerId, method)` 能力查询（不依赖 Key、不污染缓存）
- [ ] `_deleteCloneLocked`：adapter 不支持 `deleteVoice` → 跳过远端删除、纯本地删除；支持 → 保持远端删除语义；无 API → 回退旧行为
- [ ] 红灯→绿灯：`tts-voice-clone-service.test.js` 新增（不支持→本地删除成功且不调 deleteVoice / 支持→远端删除成功 / 支持但远端失败→PROVIDER_UNAVAILABLE / 无 API 回退）；`model-provider-manager.test.js` 新增能力查询用例

## 2. Bug② 设为默认

- [ ] `selectS2VVoice` 显式选择先同步 `s2vConfig.voiceId`，成功回写 `s2vPersistedVoiceId`
- [ ] 克隆行「默认」徽标 + 高亮 class；无效克隆按钮禁用保持
- [ ] `CreateView.test.js` 新增：设为默认同步下拉+IPC 被调+徽标出现；无效克隆按钮禁用

## 3. Bug③ 背景音乐读取提示

- [ ] `story2video-notifications.js` 新增 `MEDIA_PATH_UNRESOLVED`（zh/en）
- [ ] `resolveMediaImportFailure` 带 `kindLabel` + path 分支优先匹配；`story2videoKindLabel(kind)` 复用
- [ ] `importUserSelectedMedia` 复制有界重试（EBUSY/EPERM/EACCES ≤3 次）+ 占用中文原因
- [ ] `CreateView.test.js`/`story2video-paths.test.js` 新增用例

## 4. 门禁与交付

- [ ] 受影响套件 + 全量 vitest（apps/desktop）
- [ ] vite build 通过
- [ ] claude 审查（antigravity 降级记录）
- [ ] PRD/learnings/CHANGELOG/.quality-gates 文档详细补充
- [ ] 记忆更新 ad_hoc note
- [ ] push → PR → CI → 合并回 main
- [ ] 重启应用 + 真实 Electron 验证（BGM File 路径 / 克隆删除 / 设为默认）
- [ ] 归档三同步（OpenSpec archive + CCG 归档 + 推送）
