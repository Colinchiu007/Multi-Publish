# Tasks: s2v-policy-edit-regen

## 1. history-utils.js：场景号单一来源 + query 序列化

- [x] 新增 `collectContentPolicySceneNumbers(error)` → 升序去重数字数组；`contentPolicyScenes` 改复用（行为不变）
- [x] 新增 `policySceneQuery(error)` → `'49,73,74'` 逗号展开串；无命中 `''`
- **测试目标**：`history-utils.test.js` 新增两条用例；既有 `contentPolicyScenes` 断言不回归

## 2. CreateViewHistory.vue：卡片 + 详情 footer 按钮

- [x] `policyEditTarget(item)` 方法（failed + projectId + 门控命中）
- [x] 卡片操作区 `history-policy-edit-button`（`s2v-btn-secondary s2v-btn-sm`，`@click.stop=$emit('open-result', item)`）
- [x] 详情 footer `history-detail-policy-edit-button`（`openResultFromDetail()`）
- **测试目标**：`CreateViewHistory.test.js` 可见性矩阵 + open-result 事件

## 3. CreateView.vue：focusScenes + 门控单一来源

- [x] `openHistoryResult` 政策失败追加 `focusScenes` query
- [x] `openHistoryResult` 携带条件与 `policyEditTarget` 门控沿用 #876 统一 `RESUME_BLOCKING_ERROR_PATTERN`（不重复改动 `historyItemResumable`）
- **测试目标**：`CreateView.test.js` 政策失败跳转带 focusScenes；completed/可恢复不带

## 4. ResultView.vue：focusScenes 徽标

- [x] `policyFlagSceneNumbers` computed + `isPolicyFlagScene(index)`
- [x] `segment-item` 徽标（`segment-policy-flag` testid + `segment-policy-flagged` 类）+ scoped CSS
- **测试目标**：`ResultView.test.js` 命中渲染 / 缺省与越界不渲染

## 5. i18n + 文档

- [x] `create.history.policyEditAndRegenerate`、`story2video.sceneMaterial.scenePolicyFlag`（zh/en 成对，Gate 7）
- [x] `CHANGELOG.md` 变更条目
- **测试目标**：`check-locale-sync.js` 通过

## 6. 门禁与交付

- [x] 受影响 vitest 用例通过（history-utils / CreateViewHistory / CreateView / ResultView）
- [x] eslint + CJK 基线 + locale-sync 门禁通过
- [x] `.quality-gates.md` 提交前自检勾选（附远程同步证明）
- [x] 推送 `codex/s2v-policy-edit-regen`，PR 合并 origin/main（13 项必需 checks 全绿），openspec archive + CCG task 归档
