# Proposal: 全能创作链路统一使用分句引擎算法

## Why

全能创作（story2video-compose）合成视频中，用户配置的分句没有生效：场景内字幕分块始终由桌面本地旧算法（`story2video-segmentation.js`，硬编码 8/15 字、简单标点贪心切分）重新生成，分句引擎 smart-sentence-splitter（:8002）返回的 `scenes[].subtitles` 被丢弃；引擎离线时整条链路降级为同一旧本地算法。用户已确认：项目中凡是涉及分句的，都必须使用分句引擎的算法。

## What Changes

- `normalizeServiceSplitResult`：**在线优先使用引擎返回的 `scenes[].subtitles`** 作为 subtitleBlocks（`subtitleSource='smart-sentence-splitter'`）；场景无字幕数据时回退本地分块并标记来源。
- `story2video-segmentation.js` 本地算法升级为 v0.15.2 规范（与 `text-segmentation.ts` / `subtitle-rules.json` 一致）：句子边界消歧 → 场景分组（targetCharsPerScene 主控）→ 字幕 7 步管道（引号边界/长度切分/短块合并/清理/enforce_max/时间戳），替换旧贪心实现；`createLocalSplitResult`（引擎离线降级）与 `story2video-compose-engine.js:441` 兜底分块同步生效。
- 一致性测试：新增 JS 本地实现 vs `text-segmentation.ts`（esbuild bundle，复用 ops-center `segmentation-ref.mjs` 模式）的差分断言，锁定双实现一致；在线路径测试断言引擎字幕被采纳。
- 更新 `story2video-segmentation.test.js` 既有断言（若受算法升级影响）；CHANGELOG / learnings 条目。

## Capabilities

- **New Capabilities**: `story2video-split-contract`（分句引擎算法统一契约：在线优先引擎字幕、离线 v0.15.2 本地降级、双实现一致性）
- **Modified Capabilities**: 无（不改变既有 spec 的 Requirement 语义）

## Impact

- 代码：`apps/desktop/electron/services/story2video-segmentation.js`、`stage-executor.js`、`story2video-compose-engine.js`、`story2video-segmentation.test.js`、新增一致性测试
- 依赖：无新增运行时依赖；测试依赖 esbuild（仓库既有）
- 行为：全能创作合成视频的字幕分块将反映最新引擎算法；离线降级行为不变但算法升级
- 风险：低-中（行为变更影响合成字幕分块；双实现一致性由差分测试锁定）
