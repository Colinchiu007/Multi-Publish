# Tasks: story2video-bgm-reuse-fix

## 1. 后端：BGM 清理与降级

- [x] `story2video-paths.js`：`cleanupImportedMediaPaths` 支持 `skipBgm`
- [x] `pipeline-engine.js`：story2video-compose 收尾以 `{ skipBgm: true }` 清理
- [x] `story2video-compose-engine.js`：BGM 校验失败降级 + `bgmSkipped`/警告
- **测试目标**：`story2video-paths.test.js`（skipBgm 保留/一次性清理不变）、`story2video-compose-engine.test.js`（BGM 缺失降级、总大小超限仍失败）

## 2. 前端：错误提示拆分

- [x] `story2video-notifications.js`：新增 `MODEL_API_KEY_REQUIRED`（zh/en）+ 收窄 `MODEL_CONFIGURATION_PATTERN`
- **测试目标**：`story2video-notifications.test.js`、`notifications.test.js`（key 未配置 → 新 key；模型缺失 → 原 key）

## 3. 多模态 models 一致性

- [x] `model-provider-manager.js`：`_syncPresetCapabilities` 对 multimodal 行回填缺失预设 models
- **测试目标**：`model-provider-multimodal.test.js`（存量行回填 MiniMax-M2.7；非 multimodal 不改写）

## 4. 门禁与交付

- [x] 受影响 vitest 套件全绿（6 文件 252 用例） + `npm run build`（frontend）
- [x] 双模型审查（Claude 通过；antigravity 降级记录）（antigravity + claude；不可用降级记录）
- [x] PR #460 已合并回 main（merge 49924e48，CI 全绿含 QG Browser E2E 重跑）；openspec archive / CCG task 归档 / learnings 三同步
