# Review: subtitle-split-quality-run-1787360004146

任务：修复 `run_1787360004146_izko` 字幕坏切（“江|南”），并补强在线字幕质量门。
范围：Multi-Publish `codex/subtitle-split-quality-run-1787360004146` + smart-sentence-splitter `codex/subtitle-word-aware-split`。

## QM-5 根因溯源

1. 第一性原因：
   - `f207e7efb9` 引入在线字幕覆盖率护栏，只比较去标点后的长度，覆盖率 >= 0.6 即采用，不检查连续顺序和短语边界。
   - `e9a14cb29c` 引入词边界感知；`d3ad0a67c2` 的 `no_cut_bigrams` 只按切点两侧两字符构成的双字词判定，且规则表没有“蒙古/江南/包税人/大汗”。
2. 逃逸分析：
   - 单元层：既有向量没有用户样例，没有“在线字幕合法但拆短语”的合同测试。
   - 集成层：`normalizeServiceSplitResult` 只测覆盖率不足与合法结果，未测错序、重复、保护短语边界。
   - E2E/审查层：上一轮修复聚焦“无标点硬切和短块合并”，未把用户线上坏切反哺到共享向量与在线门。
3. 系统性漏洞：
   - 测试场景缺失：在线结果缺少“内容连续 + 词边界安全”的验收场景。
   - 审查盲区：在线字幕采用路径被认为“引擎已分词正确”，未对第三方结果做客户端 fail-closed 校验。
4. 修复与回归保护：
   - 规则表新增任意长度保护短语；TS/Electron JS/Python 三端实现 `protectedPhraseSpanAtBoundary`、`protectedPhrasePrefixAtEnd`、安全切点与完整短语优先逻辑。
   - 在线字幕先按顺序连续覆盖原文（去空白/标点），再检查相邻块边界是否落在保护短语内；失败场景整体回退本地，并记录 `fallbackReason`。
   - 新增向量 `user_mongol_tax_collectors`、`protected_phrase_overrides_max` 与 Electron 定点/在线门测试。
5. 预防措施：
   - 共享向量副本同步校验，三端测试使用同一份规则与向量。
   - 后续新增保护短语必须同步 `packages/story2video-engine/src/subtitle-rules.json` 与 sidecar `subtitle_rules.json`，并跑三套向量测试。
   - 在线字幕质量门成为 Story2Video 归一化层的固定合同，新实现不得绕过 `validateEngineSubtitles`。

## 实现摘要

- `apps/desktop/electron/services/story2video-segmentation.js`：`validateEngineSubtitles` 顺序覆盖 + 短语边界校验；空块/纯标点块按旧合同忽略；场景级回退来源与 `fallbackReason`。
- `apps/desktop/electron/services/story2video-segmentation-engine.js` / `packages/story2video-engine/src/text-segmentation.ts` / sidecar `subtitle_segmenter.py`：任意长度短语保护、流式前缀延迟切分、`enforceMax` 完整短语优先。
- 规则与向量三端同步；`story2video-segmentation-vectors.test.js` 修正为使用引擎真实接受的 `subtitleMinChars/subtitleMaxChars` 键。

## 测试证据

- Electron：`story2video-segmentation.test.js` + vectors + parity = 131 passed。
- TypeScript：`subtitle-vectors.test.ts` + `story2video-engine.test.ts` = 133 passed。
- Python sidecar：`test_scene_subtitle.py` + `test_subtitle_vectors.py` = 151 passed（仅既有 jieba/pkg_resources 警告）。
- 边界探针：min=1..10、max=min..min+20、前后填充 0/1/3/8/15，共 4200 组，所有已知保护短语不跨块、无空块、无死循环。
- `node --check`、`git diff --check` 通过；`verify-worktree-deps.js` 待 QM-1 前执行。

## 双模型外部审查

- opencode reviewer（read-only）：PASS，0 Critical。
  - Warning 1（空块导致整场景回退）：已修复，按旧合同忽略规范化后为空的服务端块，补回归测试。
  - Warning 2（空块原因不细分）：随 Warning 1 的过滤策略自然消除，空块不再进入校验路径。
  - Info：`normalizeSubtitleContent` 白名单非完整 Unicode 标点类别、顶层 `degraded` 不汇总场景级回退、Python 在线门不在本 diff 范围内；均记录为后续非阻塞项。
- Claude reviewer：wrapper 两轮 + CLI 直连均失败（API Error: ConnectionRefused），按机制硬化降级处理，记录于本文件。
- 误报排除：`ops-center/backend/services/prompt_eval_segmentation.py` 是评测辅助链路，不是 8002 生产字幕链路；未扩大修改。

## 结论

无未解决 Critical/Major。剩余 Warning 均为后续增强项，不阻塞本次提交；QM-1 打包验证完成后再推送。
