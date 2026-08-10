# Tasks: story2video-bgm-followups

## 1. compose BGM 原因区分

- [x] `story2video-compose-engine.js`：`bgmSkippedReason`（size_exceeded/format_unsupported/not_allowed/unreadable）+ 对应中文警告
- **测试目标**：compose-engine.test.js（超限/缺失/格式）

## 2. 通知正则

- [x] `story2video-notifications.js`：decrypt 收窄到 api-key 上下文 + Missing API key 等英文覆盖
- **测试目标**：notifications.test.js

## 3. models 回填清洗

- [x] `model-provider-manager.js`：存量项 trim/去空/去重（清洗即持久化）+ 下架迁移注释
- **测试目标**：model-provider-multimodal.test.js

## 4. selected-media 老化 GC

- [x] `story2video-paths.js`：`gcImportedMedia`（默认 7 天）+ ipc-handlers/index.js 生产接线（runImportedMediaGc 门控）
- **测试目标**：story2video-paths.test.js

## 5. 门禁与交付

- [x] 受影响 vitest 套件全绿（本地 141+ 用例，node env；jsdom 缺传递依赖为环境问题，CI 全量验证）
- [x] 双模型审查（Claude Critical 0，W1-W3 + not_allowed 已修复；antigravity 降级记录）
- [x] PR #464 已合并回 main（merge f5fb1c82，CI 全绿）；本归档为三同步
