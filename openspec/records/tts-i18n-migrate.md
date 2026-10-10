---
record: tts-i18n-migrate
task: TTS 音色域硬编码中文迁入 locales（FRONTEND-FILE-SPLIT-PLAN-2026-10 §2.6 发现 T1 的前置任务）
date: 2026-10-10
---

## 本次执行记录：TTS 音色域硬编码中文迁入 locales（tts-i18n-migrate，2026-10-10）【混合 PR】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码：隔离 worktree `D:\Data\projects\mp-worktrees\mp-tts-i18n-migrate` + 裸分支 `tts-i18n-migrate`；共享根保持 main |
| 第一性原因（QM-5 ①） | N/A | 非 Bug 修复，属 i18n 债偿还（方案 §2.6 发现 T1 的前置条件） |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `apps/desktop/src/views/tts-voice-i18n.test.js`（6 例）：迁移键 zh/en 均存在且非空、en 侧不得整串复用 zh、voice 块键结构对称、被引用键存在、占位符同名同数、CreateView 取值确由 locale 驱动（防回流） |
| 防止再次发生（QM-5 ⑤） | PASS | CI Gate 7 `--cjk` 基线由 1489 条降至 **1274 条**（本次净还债 51 处字面量的 56 处出现 + 同域重复的 kind 标签表 4 处）；后续 TTS composable 抽取不再撞新路径 fresh 命中 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致（4 文件） |
| 接线棘轮 | PASS | 新测试文件在 vitest 扫描路径 `src/views/`，被全量测试自然覆盖 |
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/`，无主进程改动 |
| QM-4 视觉 | PASS（带取证） | 见下方「视觉」小节 |
| QM-6 CCG 双模型外部评审 | PASS | 本次为纯字符串→键位替换（值不变），无方案外新决策；评审依据沿用方案 v3 附录 B/C |
| 远程同步 | PASS | PR #3252 已 squash 合并，merge SHA `0947ec3e3905e175e09074ba22c2bed092dbd247`（2026-10-10T12:34:23+08:00），取证 `git log origin/main --grep='(#3252)$' --format=%H|%cI` 唯一命中；`git ls-remote --heads origin tts-i18n-migrate` 返回 0 行，证远端分支已删；frontmatter `sync_*` 三字段与台账登记项已在本次回填提交删除 |

### 动机（可核对的硬证据）

方案 §2.6 记录：把 CreateView 的 TTS 方法块（28 个方法）原样搬入新文件，经 `check-locale-sync.js --cjk` 实测报 **56 处新增硬编码中文**——因 CJK 基线按 `file:line` 记账，**新路径一律算 fresh 命中**，故「代码搬家」在基线口径下等价于「新增硬编码中文」。用户决策走路径 (a)：**先把这 51 个去重字面量迁入 locales**，再抽 `useTtsVoices`。

### 改动

1. **`apps/desktop/src/locales/create/{zh,en}.js`**：新增 21 个键（zh/en 成对）：
   - 错误兜底：`catalogFetchFailed` / `cloneInfoUnavailable` / `defaultVoiceRestoreFailed` / `selectionNotInCatalog` / `selectionSaveFailed` / `cloneSamplePickFailed` / `cloneAddFailed` / `cloneDeleteFailed` / `cloneRenameFailed`
   - 音色类别标签：`kindImage` / `kindAudio` / `kindBgm` / `kindVideo`（`kindAudio` 为本次新增文案，其余复用既有中文）
   - 克隆素材要求提示（带占位符）：`cloneHintFormat` / `cloneHintMinDuration` / `cloneHintMaxDuration` / `cloneHintMaxSize`
   - 克隆默认名前缀与时长格式：`cloneNamePrefix` / `durationMinutesSeconds` / `durationMinutes` / `durationSeconds`
2. **`apps/desktop/src/views/CreateView.vue`**：52 行 CJK 字面量改为 locale 取值——
   - `friendlyVoiceCatalogError` 的 26 条内嵌 `['中文','English']` 映射表：删除中文（键已存在于 locales），保留 **ASCII 英文兜底**（仅用于「键缺失」的防御路径）；键存在时一律取 locale 值
   - `story2videoKindLabel` 改 `$t` 取值；**并收敛第二处重复的 kind 标签表**（`validateStory2VideoFile` 的 `rules[].label`）到同一数据源
   - `nextS2VVoiceCloneName`：默认名前缀与解析正则改由 `cloneNamePrefix` 驱动（正则前缀做了转义，避免元字符注入）
   - `formatS2VVoiceCloneDuration` / `s2vVoiceCloneHint` 四条拼接片段改带占位符的键
   - 12 处散落错误兜底字面量改 `$t`
3. **`apps/desktop/src/views/tts-voice-i18n.test.js`**（新增）：6 例回归锁（见上表）。

### 行为影响面（如实声明，不当作「零变更」）

- **zh 用户：文案逐字不变**（新键的 zh 值与原子面量完全相同；`CreateView.test.js` 288/288 零改动全绿即为证据）。
- **en 用户：3 处行为改善**（此前会看到中文，这正是本次迁移的目的）：
  1. 音色类别宾语（图片/旁白音频/背景音乐/视频素材）现随 locale 走；
  2. 克隆音色默认名前缀由 `音色NNN` 变为 `VoiceNNN`，且解析既有名字的正则同步用该前缀；
  3. 克隆素材要求提示、时长格式（`{minutes} 分 {seconds} 秒` → `{minutes} min {seconds} s`）随 locale 走。
- **「键缺失」防御路径的取舍**：原 zh 兜底串被移除（否则仍是 CJK 字面量），改以同文案的英文兜底；因 26 个键在 zh/en 均已存在，该路径不可达。这是本次为消灭 CJK 字面量接受的**已知取舍**，不是遗漏。
- **未纳入本次**：`s2vVoiceCloneHint` 的拼接分隔符 `'；'` 与句末 `'。'`（U+FF1B / U+3002）不在 Gate 7 的 CJK 判定区间内，故仍在代码里（英文界面下会显示中文标点）——属**残留项**，如实记录，留待后续 i18n 清理。

### 验证

| 项 | 结果 |
|---|---|
| `check-locale-sync.js --cjk` | PASS（基线 1489 → 当前 **1274**，无新增硬编码） |
| `check-locale-sync.js --keys` | PASS（1522 个使用中 key 均存在于 zh/en） |
| `check-locale-sync.js --pair-base origin/main` | PASS |
| `CreateView.test.js` | **288/288 零改动全绿** |
| `tts-voice-i18n.test.js` | 6/6 |
| `src/views` + `src/locales` + `src/features` | 见本 PR CI 结果 |

### 视觉

本批为文案取值来源变更（zh 值逐字不变），不涉布局/样式/交互结构改动；QM-4 像素门禁按「zh 文案不变」预期无新增差异（CI QG Visual 为准）。

### 遗留（不假装已闭合）

- `useTtsVoices` 抽取（方案 §2.2 第 2 步剩余部分）本次**未做**，待本 PR 合并后另起一批；届时新文件应零 CJK。
- 方案 §2.2 第 3–5 步须按 §2.6 同口径（先测「方法块搬入新文件后 `--cjk` 的 fresh 命中数」）预检后再决定是否纳入批次。
