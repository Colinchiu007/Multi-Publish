# 需求：多模态优先开关保存失败静默问题

## 现象
设置 → 模型设置 → 取消勾选「优先使用多模态模型进行所有的AI操作」，再次进入页面仍显示勾选。

## 根因（QM-5 第一性原因）
- 引入 commit: `5c17c2b14`（2026-08-08 多模态优先开关前端 UI）。
- `saveMultimodalPreference` 乐观更新 `preferMultimodal.value` 后调用 `storeSetSetting`，但**不检查返回 code**。
- 主进程 `store:set-setting` 在未登录（identityService 存在但无有效 sub）时返回 `{code: AUTH_ERROR}`；`invoke` 在无 electronAPI 时返回 `undefined`。
- 失败被静默吞掉 → UI 立即翻转造成「保存成功」假象；再次进入页面 `loadMultimodalPreference` 对非 0 code 回退默认 true → 恢复勾选。

## 修复
- `saveMultimodalPreference`：保存后检查 `res?.code === 0`；失败（非 0 / undefined / 异常）→ 回滚 UI 为原值 + 报错提示 `preferMultimodalSaveFailed`。
- 回归测试：失败路径（非 0 code、抛异常）断言回滚 + 报错；成功路径保持。

## 验收
- 取消勾选失败时 UI 回弹并提示错误，不再假装成功。
- `useModelProviderCrud.test.js` 全绿。
