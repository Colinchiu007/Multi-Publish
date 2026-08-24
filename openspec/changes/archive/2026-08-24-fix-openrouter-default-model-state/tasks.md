## 1. 回归测试

- [x] 1.1 在 `apps/desktop/electron/services/model-provider-multimodal.test.js` 添加“多模态全局默认后选择 OpenRouter”顺序回归，断言文字推理路由、持久化默认标记和其余能力默认。
- [x] 1.2 在 `apps/desktop/src/composables/useModelProviderCrud.test.js` 添加成功设置 OpenRouter 后重新加载列表的回归，断言默认卡片数据立即切换。

## 2. 默认状态归一化

- [x] 2.1 更新 `apps/desktop/electron/services/model-provider-manager.js` 的默认冲突处理，使普通 provider 覆盖多模态全局默认时转换剩余能力为显式默认并清除冲突标记。

## 3. 验证与交付

- [x] 3.1 运行两项定向 Vitest 测试、语法/格式检查和 worktree 依赖解析检查。
- [x] 3.2 运行 Vue 构建、Electron Windows 打包验证及 OpenSpec 严格校验。
- [x] 3.3 完成 QM-5 逃逸分析、双模型或降级审查、远程 PR/CI 状态记录与三同步归档。
