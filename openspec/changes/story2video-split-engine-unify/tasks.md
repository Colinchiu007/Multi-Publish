# Tasks: story2video-split-engine-unify

## 1. 在线路径：引擎字幕采纳

- [x] `story2video-segmentation.js` `normalizeServiceSplitResult`：scene.subtitles 非空时直接映射 subtitleBlocks，subtitleSource='smart-sentence-splitter'；缺省回退本地分块
- [x] 新增用例：引擎返回字幕 → 采纳（subtitleSource=smart-sentence-splitter）；部分场景缺字幕 → 逐场景回退标记
- **测试目标**：`story2video-segmentation.test.js`（16 用例通过）

## 2. 离线路径：本地算法升级 v0.15.2（JS 镜像）

- [x] 新增 `story2video-segmentation-engine.js`：JS 镜像移植 SentenceTokenizer / SceneSegmenter / SubtitleSegmenter（7 步管道 + 顿号枚举保护 + 引号配对 + 尾块平衡），规则读 `@multi-publish/story2video-engine/subtitle-rules`
- [x] `story2video-engine` package.json exports 增加 `"./subtitle-rules"`
- [x] `story2video-segmentation.js` 旧贪心算法删除，splitSubtitleBlocks/splitScenesLocally 委托镜像；compose 兜底自动受益
- **测试目标**：parity 测试（JS vs TS 同一语料 21 用例逐项一致）+ 更新既有断言（segmentation/stage-executor/compose-engine）

## 3. 一致性测试与门禁

- [x] parity 测试文件（10 组语料：普通中文/多标点/短场景/长句无句号/顿号枚举/引号/英文缩写/超长逗号句/emoji/中英混合）
- [x] 受影响套件：story2video-segmentation、stage-executor、pipeline-story2video-contract、story2video-compose-engine、story2video-text-config、story2video-stages、talkinghead/podcast/localization stages、story2video-manual-assets、story2video-engine 包（合计 327 用例通过）
- [ ] QM-1 打包验证：electron-builder + asar 清单含 subtitle-rules.json
- [ ] 双模型审查（antigravity + claude，降级记录）→ review.md
- [ ] PR + 合并；归档三同步（openspec archive + CCG task 归档 + learnings/CHANGELOG）
