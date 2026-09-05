# QM-5 Bug 修复分析：批量删除无响应/响应极慢

## 1. 第一性原因（git blame）

引入 commit：`a79654747` (2026-08-27, PR #1163, feat: 历史记录批量删除)
原始意图：多选 + 二次确认 + 分流删除。
实现时的三个决策导致本 bug：
- 确认后立即 `closeBatchDeletionDialog()`（无进度反馈）
- `for...of` + `await` 串行删除（N 个项目 = N 倍 IPC + fs.rmSync 耗时）
- `pruneSelection` 用 `this.history`（全量）而非 `this.filteredHistory`（筛选排序后）校验选中 identity

## 2. 逃逸分析

- 单测层：CreateView.test.js 用 mock 即时 resolve，无法暴露延迟/串行问题；pruneSelection 测试全部用稳定 id，未覆盖 index fallback 路径
- 集成层：无批量删除多条目端到端测试
- E2E/视觉层：无批量删除交互测试
- 审查层：未识别串行循环 + 关闭对话框后才删除的 UX 反模式

## 3. 系统性漏洞定位

- 测试场景缺失：缺少"删除耗时期间用户反馈"和"identity fallback"场景
- 测试质量不足：mock 不模拟延迟，掩盖性能问题
- 审查盲区：审查清单缺少"批量操作是否并行"、"长耗时操作是否有进度反馈"

## 4. 修复方案

- pruneSelection 改为使用 filteredHistory（一致性修复）
- confirmBatchDeletion：对话框删除期间保持打开 + 并行 Promise.allSettled + 完成后关闭
- 对话框显示删除中状态（deleting 文案）
- 新增回归测试

## 5. 预防措施

- 更新审查清单：批量删除类操作必须并行 + 有进度反馈
