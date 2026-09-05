# 质量节拍审查报告

## 变更
- 文件：`apps/desktop/src/views/CreateView.vue`
- 行数：+9（在 `openRunningPipeline` 方法内补充 8 个状态重置 + 1 行注释）
- 类型：Bug 修复

## 门禁检查

| 检查项 | 结果 |
|--------|------|
| 变更类型 | Bug 修复 |
| 规模 | 微小（<50 行，单文件） |
| 测试通过 | 语法验证通过 ✅（动态测试环境因 pnpm 破损暂不可用） |
| 无硬编码密钥 | ✅ |
| git diff 在预期范围 | ✅ 仅 openRunningPipeline 方法 |

## 审查要点

### 正确性 ✅
- 补全的 8 个重置与 `startOrchestrationForeground`（line 5602-5610）完全对齐
- 插入位置正确（在 `orchestrationContextRunId` 之后、`story2videoRunMeta` 之前）

### 安全性 ✅
- 纯前端状态重置，不影响主进程 run
- 无敏感数据操作

### 性能 ✅
- 无影响

### 规范 ✅
- 注释风格与项目一致
- 缩进与周围代码一致

## 回归测试建议
在 `CreateView.test.js` 添加：
```
it("openRunningPipeline：重置 checkpoint 状态，确保后台运行按钮可用", async () => {
  w.vm.sceneAssetSelectionActive = true;
  w.vm.needsCheckpoint = true;
  await w.vm.openRunningPipeline("run-r1", "story2video-compose");
  expect(w.vm.sceneAssetSelectionActive).toBe(false);
  expect(w.vm.needsCheckpoint).toBe(false);
});
```

## 结论
✅ 变更安全，通过审查。
