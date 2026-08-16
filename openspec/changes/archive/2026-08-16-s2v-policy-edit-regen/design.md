# s2v-policy-edit-regen — Design

## 现状基线

- `CreateViewHistory.vue`：卡片操作区（history-item-footer）现有 resume（可恢复失败/暂停）、running-继续、completed「编辑并重新合成」（`history-edit-recompose-button`）、删除；政策失败任务（`historyItemResumable` 返回 false）只剩删除按钮。详情弹窗 footer 同样只有 resume + completed 编辑按钮 + 关闭。
- 场景号提取：`history-utils.js` `contentPolicyScenes(error, locale)` 已从 error 解析 `Image #N` 段内命中门控关键字的场景号（升序去重、区间压缩、`#49、#73-77` 显示串）。`Image #N` 由主进程 `story2video-stages.js` `summarizeAssetFailures` 生成，N = 分段下标 + 1（`sceneNumber = sceneIndex + 1`）。
- 结果页 `ResultView.vue`：`mounted()` 读 `$route.query.project` → `loadProject` → `segments`；分段编辑 → `saveSegments`（`story2video:update-segments`）→ `recomposeProject`（`story2videoRecomposeProject` = 重新生成/续跑）。
- `CreateView.vue` `openHistoryResult(item)`：`$router.push({ path: '/create/result', query: { project: item.projectId } })`，不限制 status；历史事件 `@open-result="openHistoryResult"` 已接通。

## 方案

### 1. history-utils.js：场景号单一来源 + query 序列化

- 新增导出 `collectContentPolicySceneNumbers(error)` → 升序去重数字数组（复用现有 POLICY_SCENE_PATTERN 提取逻辑，`contentPolicyScenes` 内部改用它，行为不变）。
- 新增导出 `policySceneQuery(error)` → 逗号分隔展开串（`[49,73,74] → '49,73,74'`）；无命中返回 `''`。
- 既有 `contentPolicyScenes` 改为 `collectContentPolicySceneNumbers` + `compressSceneRanges` 组合，测试不回归。

### 2. CreateViewHistory.vue：按钮（卡片 + 详情 footer）

- 新增方法 `policyEditTarget(item)`：`item.status === 'failed' && item.projectId && RESUME_BLOCKING_ERROR_PATTERN.test(error)`（布尔）。
- 卡片操作区新增按钮（挂在 resume 分支之后、删除之前）：
  `v-if="policyEditTarget(item)"` → `data-testid="history-policy-edit-button"`，`@click.stop="$emit('open-result', item)"`，文案 `tr('policyEditAndRegenerate')`，样式沿用 `s2v-btn-secondary s2v-btn-sm`。
- 详情 footer 新增同条件按钮 `data-testid="history-detail-policy-edit-button"` → `openResultFromDetail()`。
- 复用既有 `open-result` 事件契约（CreateView `openHistoryResult`），无需新事件。

### 3. CreateView.vue：跳转携带 focusScenes + 门控单一来源

- `openHistoryResult(item)`：`query = { project }`；当 `item.status === 'failed'`、`policySceneQuery(item.error)` 非空且 `historyItemResumable(item) === false`（政策失败）时追加 `focusScenes`（审查 M4 收口）。
- 沿用 #876 的 `RESUME_BLOCKING_ERROR_PATTERN` 单一来源（本 PR 未改 `historyItemResumable` 本身）；`policyEditTarget` 与 `openHistoryResult` 均以该门控为准。
- 已知边界（审查 W1）：manual 模式（分镜素材自选）政策失败错误无 `Image #N` 前缀 → 无法提取场景号，按钮照常出现但不携带 focusScenes、结果页无徽标（安全降级，CreateView.test「proj-manual」用例已固化）。

### 4. ResultView.vue：focusScenes 徽标

- computed `policyFlagSceneNumbers`：解析 `this.$route?.query?.focusScenes`（按 `,` 拆分、仅收正整数 Set）。
- 方法 `isPolicyFlagScene(index)`：`policyFlagSceneNumbers.has(index + 1)`。
- 模板 `segment-item`：`:class="{ 'segment-policy-flagged': isPolicyFlagScene(index) }"`；在 segment-header 追加徽标 `<span v-if="isPolicyFlagScene(index)" class="segment-policy-flag" data-testid="segment-policy-flag">{{ $t('story2video.sceneMaterial.scenePolicyFlag') }}</span>`。
- scoped CSS：`.segment-policy-flag`（徽标样式）+ `.segment-policy-flagged`（描边/背景高亮，不影响布局）。
- 号码越界/缺省一律不渲染（`has` 天然 fail-safe）。

### 5. i18n（zh/en 成对）

- `create.history.policyEditAndRegenerate`：「修改场景文案并重新生成」/ "Edit scenes & regenerate"
- `story2video.sceneMaterial.scenePolicyFlag`：「内容政策需修改」/ "Fix content policy"

### 6. 测试（TDD）

- `history-utils.test.js`：`collectContentPolicySceneNumbers`（升序去重/区间展开数组）、`policySceneQuery`（逗号串/空）；`contentPolicyScenes` 既有断言不回归。
- `CreateViewHistory.test.js`：政策失败 + projectId → 卡片与详情按钮存在、点击 emit `open-result`；政策失败无 projectId → 无按钮；可恢复失败 → 无按钮且 resume 存在；completed 显示既有编辑按钮。
- `CreateView.test.js`：`openHistoryResult` 政策失败 → `router.currentRoute.query.focusScenes` 为 `'49,73,74'`；completed/可恢复 → 无 focusScenes。
- `ResultView.test.js`：query `focusScenes=49,73,74` 且 segments ≥ 74 → `segments[48]/[72]/[73]` 有 `segment-policy-flag`；无 focusScenes / 越界 → 无徽标。

## 不做的事

- 不改主进程恢复语义与 IPC（`update-segments`/`recompose` 既有通道复用）。
- 不做自动滚动定位 / 自动改写文案 / 一键自动重新合成（保持用户确认修改后再点「重新合成」）。
- 不改 `open-history-detail` / 删除 / 实时失败对话框逻辑。
