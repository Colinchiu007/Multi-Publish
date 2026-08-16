# Review: s2v-policy-edit-regen（PR #882）

- 日期：2026-08-16
- 方式：Claude reviewer（antigravity 地区资格不可用，降级记录）；wrapper session c12c5cff，自跑 4 套受影响测试 283/283 + CJK 基线 + locale pair + 生产者侧场景号语义核对（story2video-stages.js summarizeAssetFailures/buildManualSceneCandidates）
- 结论：0 Critical / 1 Warning / 4 Minor / 7 Info → 可以批准

## 已处理

- **W1（场景定位契约在 manual 模式静默失效）**：manual 模式政策失败错误无 `Image #N` 前缀 → 不携带 focusScenes、结果页无徽标（安全降级）。处理：CreateView.test「proj-manual」用例固化 + CHANGELOG 与 openspec design.md 已知边界说明；主进程补前缀列为 follow-up。
- **M1（focusScenes 非十进制解析）**：ResultView `policyFlagSceneNumbers` 改为十进制正整数严格校验（`String(value) === trimmed`），`0x10`/`1e2`/前导零忽略；ResultView.test 新增越界/非十进制用例。
- **M2（政策编辑按钮未随 resuming 禁用）**：两处新按钮补 `:disabled="story2videoResuming"`。
- **M4（completed 理论携带 focusScenes）**：`openHistoryResult` 收紧为 `item.status === 'failed'` 才携带；CreateView.test 新增 completed 残留门控文本用例。
- **I7（docs 措辞夸大）**：proposal/design/tasks 改为「沿用 #876 单一来源，本 PR 不重复改 historyItemResumable」。

## 未处理（记为 Info/后续）

- **M3（保存/重合成后 focusScenes 徽标不随 query 清除）**：徽标为信息性提示，用户导航即清；不在本 PR 扩大范围，后续可在 saveSegments 成功时 replace query 清除。

## 审查确认的关键事实（Info）

- I1：`RESUME_BLOCKING_ERROR_PATTERN` 无 g 标志无 lastIndex 污染；`POLICY_SCENE_PATTERN` 每次 lastIndex=0 重置。
- I2：生产者 `(item.index + 1)` 与消费者 `index + 1` 完全对齐，`Image #N` ↔ `segments[N-1]`。
- I3：按钮可见性矩阵不冲突（政策失败=政策编辑+删除；可恢复失败=resume+删除；completed=编辑并重新合成+删除）。
- I4/I5/I6：locale 成对、CJK 基线纯行号漂移（逐条对账无真实新增）、无 v-html/eval/路径拼接/敏感信息。
