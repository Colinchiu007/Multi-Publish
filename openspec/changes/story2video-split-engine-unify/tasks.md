# Tasks: story2video-split-engine-unify

## 1. 在线路径：引擎字幕采纳

- [ ] `story2video-segmentation.js` `normalizeServiceSplitResult`：scene.subtitles 非空时直接映射 subtitleBlocks，subtitleSource='smart-sentence-splitter'；缺省回退本地分块
- **测试目标**：`story2video-segmentation.test.js` 新增/更新用例（引擎返回字幕 → 采纳；缺字幕 → 回退标记）

## 2. 离线路径：本地算法升级 v0.15.2（JS 镜像）

- [ ] `story2video-segmentation.js`：JS 镜像移植 SentenceTokenizer / SceneSegmenter / SubtitleSegmenter（7 步管道 + 顿号枚举保护 + 引号配对 + 尾块平衡），规则读 `@multi-publish/story2video-engine/subtitle-rules`
- [ ] `story2video-engine` package.json exports 增加 `"./subtitle-rules"`
- [ ] `story2video-compose-engine.js:441` 兜底分块自动受益（验证用例）
- **测试目标**：parity 测试（JS vs TS 同一语料逐项一致）+ 更新既有 splitSubtitleBlocks/splitScenesLocally 断言

## 3. 一致性测试与门禁

- [ ] parity 测试文件（复用 ops-center 20 例语义 + 引号/枚举语料）
- [ ] 受影响套件：story2video-segmentation.test.js、stage-executor.test.js、pipeline-story2video-contract.test.js、story2video-compose-engine.test.js
- [ ] QM-1 打包验证：electron-builder + asar 清单含 subtitle-rules.json
- [ ] 双模型审查（antigravity + claude，降级记录）→ review.md
- [ ] PR + 合并；归档三同步（openspec archive + CCG task 归档 + learnings/CHANGELOG）
