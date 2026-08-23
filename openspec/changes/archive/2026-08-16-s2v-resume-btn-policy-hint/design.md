# s2v-resume-btn-policy-hint — Design

## 现状（基线差异审计）

| 判定点 | 位置 | 正则 |
|---|---|---|
| 实时失败对话框 | CreateView.vue:1875 `canResumeStory2Video` | `/内容政策\|content\s*policy\|needs_user_input\|可能需要修改文案/i` |
| 历史恢复守卫 | CreateViewHistory.vue:357 / usePipelineHistory.js:209 | `/needs_user_input\|content[_-\s]?policy\|可能需要修改文案/i` |
| 历史恢复动作守卫 | CreateView.vue:3817 | 同上（连字符版） |
| 主进程 resumeOrchestration | pipeline-engine.js:1330 | `/needs_user_input\|content[_\s-]?policy\|CONTENT_POLICY/i` |

差异：仅 CreateView.vue:1875 用 `content\s*policy`（空格），不命中 "content-policy"（连字符）。
真实数据佐证：run_1786807690498_ee06 的 error 含 "content-policy review"，历史列表正确隐藏按钮，
但实时失败对话框会误显示按钮 → 点击后主进程拒绝 → 按钮消失（体验断裂）。

## 方案

### 1. 正则统一
统一门控关键字收敛到 history-utils.js 导出的 `RESUME_BLOCKING_ERROR_PATTERN`
（`/内容政策|needs_user_input|content[_-\s]?policy|可能需要修改文案/i`，含主进程 PIPELINE_USER_INPUT_REQUIRED 拒绝文案「该失败需要人工处理（内容政策）」），CreateView 两处判定、
CreateViewHistory 判定与 usePipelineHistory 判定全部引用该常量；主进程 pipeline-engine.js 已是对齐形态。
`[_-\s]?` 允许 0 个或 1 个分隔符，对 "content policy" / "content_policy" / "content-policy" / "contentpolicy" 全部一致命中。

实时弹窗门控补强：`showStory2VideoErrorDialog` 在弹窗状态中保留原始错误文本
（`story2videoErrorDialog.rawError = notification.error || notification.message`），
`canResumeStory2Video` 对「本地化消息 + rawError」合并做统一正则判定——
当前本地化消息（OPERATION_FAILED 等）不携带原始错误文本，若不补 rawError，连字符/空格变体无法真正拦截实时弹窗。

### 2. 历史卡片/详情提示
新增辅助函数（放 history-utils.js 导出；CreateView / CreateViewHistory 均已引用该模块，组件直接复用）：
- `contentPolicyScenes(error, locale)`：解析 error 中「内容政策失败」的场景号。
  规则：逐条匹配 `/Image\s+#(\d+)[^;]*?(?:needs_user_input|content[_-\s]?policy|可能需要修改文案)/gi`
  提取场景号；升序去重；连续区间压缩为 `a-b`；输出 `#49、#73-77`（zh 顿号）/ `#49, #73-77`（en 逗号）；
  无命中返回 `''`。
- 渲染条件：`item.status === 'failed'` 且 `RESUME_BLOCKING_ERROR_PATTERN` 命中（即 `!historyItemResumable(item)`）
  → 显示带场景号提示（`policyResumeBlockedHint`，参数 {scenes}）；
  命中门控但解析不到场景号 → 显示通用兜底提示（`policyResumeBlockedGeneric`）。
- 文案（zh/en 成对，`create.history` 区块，Gate 7 校验）：
  - `policyResumeBlockedLabel`: 「恢复提示」/ 「Resume notice」
  - `policyResumeBlockedHint`: 「该任务包含内容政策拦截的素材（{scenes} 场景），请修改对应场景文案后重新生成。」/ EN 对应
  - `policyResumeBlockedGeneric`: 「该任务包含内容政策拦截的素材，请修改文案后重新生成。」/ EN 对应
- 位置：卡片 failed 专项信息区（errorSummary 之后）+ 详情弹窗 errorSummary 之后（dl 内 dt/dd 结构）。

### 3. 测试
- CreateView.test.js：`canResumeStory2Video` 对 "content-policy"（连字符）返回 false、非政策错误返回 true（新增断言）。
- history-utils.test.js（既有文件）：`RESUME_BLOCKING_ERROR_PATTERN` 变体矩阵；
  `contentPolicyScenes` 混合错误（瞬时 aborted + 政策）→ 只提取政策场景号；连续区间压缩；去重；en 分隔符；无命中 → ''。
- CreateViewHistory.test.js：政策失败卡片/详情显示 hint 且含场景号；可恢复失败不显示 hint；无场景号显示兜底。
- locale 成对由 CI Gate 7（check-locale-sync.js）校验。

## 不做的事
- 不改主进程恢复语义（PIPELINE_USER_INPUT_REQUIRED 保持）。
- 不新增"编辑后恢复"流程（后续独立 change）。
- 不解析 checkpoint 结构化字段（当前失败快照无结构化政策场景信息，error 文本是唯一来源）。
