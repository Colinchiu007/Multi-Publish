# 双模型审查记录（2026-08-16）

## 结论
- **Critical: 0** — 根因处理正确：持久化分段只含 imagePath/videoPath/alternateImages[].path，imageUrl/alternateImageUrls/videoUrl 为渲染端派生短令牌，两处替换必须重建 URL；Claude 实测「非空返回」「旁白替换」两条用例在修复前失败（真回归保护）。
- **Major: 2（已修复）**
  1. 测试只覆盖 imageUrl，未覆盖 alternateImageUrls/videoUrl（素材槽/视频槽同属缺陷契约）→ 用例 1 返回分段补齐 alternateImages + videoPath，断言 alternateImageUrls[0]/videoUrl 重建。
  2. 「空返回保留」用例在修复前也通过，且未断言令牌复用/回收契约 → 追加 `createShareUrl` 以旧 URL 作为 previousUrl 被调用断言。
- **Minor（采纳/记录）**：`toHaveBeenCalledWith(path, undefined)` 脆弱断言已通过 Major 2 的 previousUrl 断言消除；无条件刷新令牌消耗与嵌套双重刷新记录于 design.md「已知取舍」；单段解析失败静默置空与 `applyProjectSegments` 收敛重构列为后续 follow-up。
- **antigravity 后端降级**：wrapper exit 1「Eligibility check failed: not available in your location」（与历史 2026-08-16 各任务一致）；本任务仅 Claude 完成审查，降级已记录。

## 审查后验证
- ResultView.test.js 73 passed（含 3 条回归，其中两条修复前必失败）；src/views 812 passed。
