# video-creation-ui-full-optimize — 实施计划

## 分析结论

### 代码-设计分离现状
| 文件 | 行数 | 模板 | 脚本 | 样式 | 评估 |
|------|------|------|------|------|------|
| CreateView.vue | 3272 | 822行 | 2448行 | 0行 | ⚠️ 样式已分离，但脚本2448行未拆分 |
| CreateViewHistory.vue | 237 | 147行 | 85行 | 0行 | ✅ 已分离 |
| CreateHistory.vue | 354 | 99行 | 176行 | 76行scoped | ⚠️ 样式未提取 |
| usePipelineHistory.js | 267 | - | 267行 | - | ✅ 已提取 |
| create-view.css | 293 | - | - | 293行 | ✅ 外置 |
| create-view-history.css | 138 | - | - | 138行 | ✅ 外置 |

### 核心问题
1. **CreateView.vue 脚本膨胀**：2448行 Options API，混合了 pipeline/S2V/TTS/模板/历史/快速渲染/Remotion 等6+个职责域
2. **CreateHistory.vue 样式未提取**：76行 scoped style 应提取到独立 CSS
3. **UI/UX 可优化项**：历史记录卡片、空状态、加载状态、错误提示等

## 实施步骤

### Phase 1: CreateHistory.vue 样式提取（低风险）
- 提取 scoped style 到 `create-history.css`
- 在 CreateHistory.vue 中 import

### Phase 2: CreateView.vue 脚本拆分（核心）
将 2448行 Options API 拆分为 composables：
- `usePipelineConfig.js` — 流水线配置/选择/加载
- `useS2VConfig.js` — story2video 配置管理（s2vConfig + 模板 + 恢复/保存）
- `useS2VProviders.js` — 图片/语音/视频 provider + TTS voice catalog
- `useOrchestration.js` — 编排运行/轮询/状态/进度
- `useQuickRender.js` — 快速渲染模式

### Phase 3: UI/UE 优化
- 历史记录卡片视觉优化
- 空状态/加载状态统一
- 错误提示一致性

### Phase 4: 文档 + 记忆 + 推送
- 更新 PRD 7.1.28
- 更新记忆
- 推送 + 合并

## 验收标准
- [ ] CreateView.vue 脚本 < 1000 行
- [ ] 所有样式外置到 CSS 文件
- [ ] 功能无回归
- [ ] PRD 更新
- [ ] 质量节拍通过
