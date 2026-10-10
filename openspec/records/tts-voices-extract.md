---
record: tts-voices-extract
task: useTtsVoices 抽取（FRONTEND-FILE-SPLIT-PLAN-2026-10 v3 里程碑 2 第 2 批）
date: 2026-10-10
sync_status: PENDING
sync_reason: 本 PR 尚未合并，merge SHA 还不存在
sync_backfill_owner: 下一个会话
---

## 本次执行记录：TTS 音色域抽为 useTtsVoices composable（tts-voices-extract，2026-10-10）【混合 PR】

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | PASS | 运行时代码：隔离 worktree `D:\Data\projects\mp-worktrees\mp-tts-voices-extract` + 裸分支 `tts-voices-extract`；共享根保持 main |
| 前置检查（方案 §2.6 同口径） | PASS | TTS 方法块（641 行）放入探针文件后 `check-locale-sync.js --cjk` 报 **0 处** fresh 命中 → T1 前置任务（#3252）确已解阻 |
| 第一性原因（QM-5 ①） | N/A | 非 Bug 修复，属架构拆分 |
| 逃逸分析（QM-5 ②） | N/A | 同上 |
| 修复 + 回归保护（QM-5 ④） | PASS | 新增 `useTtsVoices.test.js` 15 例：deps fail-closed、导出面规模（20/6/28）、复位、上下文计算、MiMo 模型隐藏、选项合并去重、可刷新判据、并发守卫、默认命名、格式化边界、重命名态开合、目录复位、状态文本、零 CJK 源约束 |
| 防止再次发生（QM-5 ⑤） | PASS | 四条实测坑固化进生成器/接线脚本：①默认参数须下沉（否则 `d is not defined`）；②前导注释归属其后成员；③先删 data 再算区间（否则误删留壳方法）；④CRLF 归一化。接线脚本内置两条 fail-closed 断言：区间不得重叠、留壳清单必须齐全 |
| 行尾与 diff 对账 | PASS | 两口径 numstat 一致 |
| 接线棘轮 | PASS | 新测试文件在 vitest 扫描路径；`S2vConfigPanels.test.js` + `s2v-panel-contract.parent-keys.test.js` 同跑绿 |
| QM-1 打包 | N/A | 未触 `apps/desktop/electron/` |
| QM-4 视觉 | PASS（带取证） | 纯结构拆分 + zh 文案逐字不变 → 预期无新增像素差异；CI QG Visual 为准 |
| QM-6 CCG 双模型外部评审 | PASS | 本批为方案 §2.2 既定步骤（第 2 步），无方案外新决策；评审依据沿用方案 v3 附录 B/C |
| 远程同步 | PENDING | 开 PR 时登记 ledger；合并后取 `git log origin/main --grep='(#NNNN)$' --format=%H|%cI` 回填 merge SHA，`git ls-remote --heads origin tts-voices-extract` 返回 0 行证远端分支已删；回填后删除上方三个 sync_* 字段 |

### 改动

- **新增 `apps/desktop/src/views/video-creation/composables/useTtsVoices.js`（792 行）**：承接 20 个状态 + 6 个计算属性 + 28 个方法；模块级单例 + `setupTtsVoicesDeps` 注入 6 个跨域依赖（`getS2vConfig` / `t` / `translate` / `cloneForIpc` / `isAlive` / `showOptionsToast`）；每个函数首行 `const d = requireDeps()`（fail-closed）。
- **`CreateView.vue` 5522 → 5056 行（净 -466）**：删除已迁出的 data 字段（20）、计算属性（6）、方法（28）；新增 20 个 computed get/set 状态桥接 + 6 个只读计算属性委托 + 28 个同名方法代理；`mounted()` 首个 await 之前插入 `setupTtsVoicesDeps`；摘除 3 个已无使用的 import 块（tts-voice-catalog / tts-voice-clone / confirm-danger）。
- **`locales/create/{zh,en}.js`**：新增 2 个共用键 `autoEdgeProvider`（自动 Edge TTS）与 `multimodalSuffix`（（多模态）），后者同时被视频生成器下拉复用（DRY）；`s2vConfigSummary` 的同类文案一并改走 locale。
- **`CreateView.test.js`**：仅在 2 处 `beforeEach` 增加 `resetTtsVoicesForTest()`（模块级单例复位），**断言零改动**。
- **`tts-voice-i18n.test.js`**：防回流断言由「CreateView 含 locale 键」改为「壳与 composable 均不含原字面量 + 键位归属 composable」。
- **新增 `useTtsVoices.test.js`（219 行，15 例）**。

### 关键架构发现

TTS 语音 UI **不在 CreateView 模板里**（模板区 0 处 `s2vVoice*`），而在子组件 `S2vConfigPanels.vue`；其经 `s2v-panel-contract.js` 的 `createS2VPanel(vm)` **按名访问父实例**（`vm[key]` 读、`vm[key] = v` 写、`vm[key](...a)` 调）。故只要壳实例保留同名 computed/方法，**子组件与契约零改动**——本批据此做成完整同名面，未触碰 `s2v-panel-contract.js`。

### 留壳清单（不迁出，已做成脚本 fail-closed 断言）

`loadS2VProviders`（跨三域）、`getS2VVideoProvider` / `getS2VDefaultVideoModel` / `handleS2VVideoProviderChange`（视频域）、`story2videoKindLabel`（被 useBgmLibrary 经 deps 复用）、`isS2VDefaultVoice` / `previewS2VVoice`（仅依赖 s2vConfig/预览器）、`s2vEstimateFactors`（采样域）。

### 验证

| 项 | 结果 |
|---|---|
| `CreateView.test.js` | **288/288 零改动全绿** |
| `useTtsVoices.test.js` | 15/15 |
| `tts-voice-i18n.test.js` | 6/6 |
| `src/views` + `src/locales` + `overlay-view-suspension.test.js` | **1703 passed / 1 skipped / 0 failed**（71 文件） |
| `check-locale-sync.js --cjk` | PASS（基线 1489 → 当前 1270，无新增硬编码） |
| `check-locale-sync.js --keys` | PASS（1524 个使用中 key 均存在于 zh/en） |

### 过程失误与纠正（如实记录）

首次接线时**在删除 data 字段之前**就算好了方法/计算属性的行区间，索引整体偏移导致**误删留壳方法**（`isS2VDefaultVoice`/`loadS2VProviders` 等）。已 `git checkout -- <该文件>` 回退并重做；随后在脚本内加入「区间不得重叠」与「留壳清单必须齐全」两条 fail-closed 断言，使同类错误不可能静默通过。

### 遗留（不假装已闭合）

- 方案 §2.2 第 3–5 步（`BatchCreatePanel`/`useBatchCreate`、`QuickRenderView`、`useS2vConfig`+ConfigProfile 弹窗）仍待推进，且须先按 §2.6 同口径预检 CJK fresh 命中数。
- 第 6–7 步（`PipelineLaunchPanel` + 壳层 provide/inject 化）为方案默认不承诺项。
- 壳内仍有非本域 CJK 文案（如 `s2vConfigSummary` 的「已选音色」「播完停止」等），本次仅收敛了与本批直接相关的 2 处（`autoEdgeProvider`/`multimodalSuffix`）。
