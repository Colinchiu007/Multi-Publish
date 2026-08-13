# Design: 全能创作链路统一使用分句引擎算法

## Context

全能创作 = story2video-compose 流水线。分句链路现状（见 proposal.md）：split 阶段经 `StageExecutor.SPLIT` → `serviceBus.splitText` → `SplitterBridge` → smart-sentence-splitter `:8002/v1/split`；返回的 `scenes[].subtitles` 在 `normalizeServiceSplitResult`（apps/desktop/electron/services/story2video-segmentation.js:304）中被丢弃，改为本地 `splitSubtitleBlocks` 旧贪心算法（硬编码 8/15 字）重新切分；引擎离线时 `createLocalSplitResult`（:322）整条降级为同一旧算法。`text-segmentation.ts`（packages/story2video-engine，v0.15.2 对齐）与 `subtitle-rules.json`（单源 v1.1）已存在但桌面主进程未接入。

## Goals / Non-Goals

**Goals**
- 全能创作链路在线时，字幕分块直接采用引擎返回的 `scenes[].subtitles`。
- 引擎离线时，本地降级算法与 `text-segmentation.ts` v0.15.2 语义一致（JS 镜像 + parity 测试锁定）。
- 合成兜底分块（story2video-compose-engine.js:441）自动使用升级后的算法。
- 不改变 split 阶段对外契约（scenes/sentences/segmentation_metadata、degraded/fallbackReason 字段）。

**Non-Goals**
- 不改动 ops-center `prompt_eval_segmentation.py`（已对齐 v0.15.2）。
- 不改动 smart-sentence-splitter 项目本身。
- 不统一其他流水线（talkinghead/podcast/localization 共用 StageExecutor split 阶段，因共用入口自然受益，但本 change 只验收全能创作链路）。

## Decisions

### D1：在线路径——采用引擎返回的字幕，不本地重切
`normalizeServiceSplitResult` 对每个 scene：若 `scene.subtitles` 为非空数组且每项 `text` 非空，则 `subtitleBlocks = subtitles.map(s => s.text)`，`subtitleSource='smart-sentence-splitter'`；否则回退 `splitSubtitleBlocks(text, options)` 并标记 `subtitleSource='local-typescript'`。
- 理由：引擎（当前 v0.10.0 源码、editable 安装）已按 v0.15.2 规范生成字幕（实测 `SCENE.subtitles=[{text,display_order,start_time,duration,parent_segment_id}]`）；本地重切是冗余且引入旧算法。
- 备选：继续本地重切但升级算法——在线路径仍与引擎不一致（两套算法结果可能不同），否决。

### D2：离线降级——JS 镜像移植 text-segmentation.ts v0.15.2
`story2video-segmentation.js` 以 JS 镜像方式移植 `SentenceTokenizer`（缩写保护/句界/超长句）、`SceneSegmenter`（targetCharsPerScene 主控 → 时长×bps×语速）、`SubtitleSegmenter`（7 步管道：split_sentences → split_quote_boundaries → length_split → merge_short → clean → enforce_max → assign_timestamps，含顿号枚举保护/引号配对/尾块平衡），规则从 `subtitle-rules.json` 读取（单源），替换旧贪心实现。`createLocalSplitResult` 与 compose 兜底自动受益。
- 理由：Electron 主进程为纯 JS（无法 require TS）；仓库已有同款范式（`subtitle-align-aggregator.js` JS 镜像 + parity 测试锁死 TS 权威版）。
- 备选 A：esbuild 打包 text-segmentation.ts 成 CJS 提交进仓库并运行时 require——避免手抄漂移，但引入生成产物与再生成校验脚本，偏离仓库既有 JS 镜像范式；否决。
- 备选 B：运行时子进程调用引擎——离线场景无法启动引擎，自相矛盾；否决。

### D3：规则单源——subtitle-rules.json 通过包导出子路径读取
`@multi-publish/story2video-engine` 的 `exports` 增加 `"./subtitle-rules": "./src/subtitle-rules.json"`；`story2video-segmentation.js` 通过 `require('@multi-publish/story2video-engine/subtitle-rules')` 读取。
- 理由：避免复制规则表造成多源漂移；story2video-engine 已是 apps/desktop 依赖，打包时随 workspace 包进入。
- 风险与回退：electron-builder `files` 需覆盖该 workspace 包与 JSON；QM-1 打包验证 + asar 清单确认；若打包受阻则回退为相对路径 require 并在 `files` 显式包含该文件。

### D4：parity 测试锁定双实现一致
新增 parity 测试：同一组语料（含普通中文/多标点/短场景/长句无句号/顿号枚举/引号），断言 JS 镜像的句子/场景/字幕输出与 `text-segmentation.ts`（vitest 直接 import TS）逐项一致。
- 理由：防止 D2 手抄漂移；复用 ops-center `segmentation-ref.mjs` 已固化的 20 例语义。

### D5：参数透传（保守）
`_buildStorySplitterOptions` 暂不透传 subtitle 参数：引擎默认 8/15 与流水线 stageDefs 默认一致，且 subtitle 参数非用户可配项；避免对引擎配置键的臆测。若后续引擎能力声明（/capabilities）确认 config 键语义，再扩展。

## Risks / Trade-offs

- [JS 镜像与 TS 权威版漂移] → D4 parity 测试同一语料锁定；subtitle-rules.json 单源。
- [引擎 subtitles 结构变化] → normalize 只依赖 `text` 字段，缺省回退本地分块并标记来源；非法响应仍 fail closed（既有语义）。
- [打包可达性：规则 JSON 未进产物] → QM-1 electron-builder 打包 + asar 清单验证 `subtitle-rules.json`；失败回退相对路径 require + files 显式包含。
- [既有测试断言依赖旧算法行为] → 更新 `story2video-segmentation.test.js` 受影响用例为 v0.15.2 期望，并运行受影响套件。

## Migration Plan

- 无数据/存储迁移；行为随桌面版本发布生效。
- 回退：revert PR（算法与来源标记均为纯代码变更）。
- 验证路径：parity 测试 + 受影响 vitest 套件 + ops-center 分句一致性测试（回归）+ QM-1 打包验证。

## Open Questions

- 无阻塞项；D5 参数透传待引擎能力声明确认后可独立扩展。
