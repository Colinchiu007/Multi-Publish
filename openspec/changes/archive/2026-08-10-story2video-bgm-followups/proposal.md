# Proposal: BGM 审查后续修复（超限区分 / API-key 提示 / models 清洗 / 老化 GC）

## Why

PR #460 修复后，Claude 审查（review-claude.md）记录了 4 项后续（W2-W4 + Info），其中两项被点名「建议合入前处理」之一的 W2（BGM 回收）与本轮处理：

1. **W4**：BGM 单文件超过 15MB 上限时 `resolveReadableMediaFile` 返回 null → 软降级提示「文件不存在或不可读」，与「总输入大小超限 → 硬失败」结论相反，用户无法理解；需要区分「超限」与「不可读/缺失/越界」，并给出机器可读原因码。
2. **Info**：`MODEL_API_KEY_PATTERN` 中 `decrypt failed|解密失败` 无 API-key 上下文限定，可能把非 key 的解密错误误归类；且常见英文 `Missing API key` / `api key required` / `No API key` 未覆盖，落到 UNKNOWN_ERROR。
3. **Info**：多模态 models 回填只对预设项 trim，存量行含空串/前后空格时可能重复追加；预设下架模型后存量残留需注释人工迁移。
4. **W2**：`selected-media` 导入 BGM 只增不删（skipBgm 后），无 GC 会无界增长；需老化回收（>7 天），配合已合并的 compose 降级不会造成硬失败。

前端 warnings 接线（W3，需 pipeline status 管道改造）本轮不做，记录为后续项。

## What Changes

- `story2video-compose-engine.js`：BGM 校验失败区分 `size_exceeded`（可读但超 15MB）与 `unreadable`（缺失/不可读/越界/符号链接），`data.bgmSkippedReason` 机器可读；保留中文 warning 文本。
- `story2video-notifications.js`：`MODEL_API_KEY_PATTERN` 收窄 `decrypt failed|解密失败` 到 api-key 上下文；补充 `missing api key|api key required|no api key|api key.*(?:missing|required|not found)` 英文覆盖。
- `model-provider-manager.js`：多模态 models 回填对存量项 trim/去空串/去重；注释预设下架迁移。
- `story2video-paths.js`：新增 `gcImportedMedia`（selected-media 老化回收，默认 >7 天、仅普通非符号链接文件），应用启动时调用一次；`cleanupImportedMediaPaths` 复用其删除逻辑。
- 回归测试：compose 超限/不可读区分、通知正则（decrypt 限定/英文缺失 key）、models 清洗、GC 过期删除/新鲜保留。

## Capabilities

- **Added Capabilities**: `story2video-bgm-followups`
- **Modified Capabilities**: `story2video-bgm-reuse`（BGM 降级细化）、`story2video-media-import-feedback`（API-key 提示正则）

## Impact

- 生产代码：`story2video-compose-engine.js`、`story2video-notifications.js`、`model-provider-manager.js`、`story2video-paths.js` + 启动接线（container.setup.js 或 ipc-handlers）
- 测试：上述对应 `.test.js`
- 无 DB schema 变更。
