# Proposal: compact-tag-suggester-tabs

## Why

图文发布页的「智能标签建议」面板（`TagSuggester.vue`）把全部平台的标签纵向铺开渲染：每个平台一个分组块（平台名 + 复制按钮 + 内容标签行 + 流量标签行），实测 5 平台时整卡高达 ~800px，把同一表单中的定时发布、最佳发布时间、可见性、AI 声明等更高优先级字段挤出首屏，用户必须滚动长距离才能回到发布主流程。这违反了发布页「任务闭环优先于辅助信息」的信息架构原则（openspec/specs/publish-page-right-rail 已确立该原则，但未约束面板自身的纵向密度）。

## What Changes

- 平台标签区改为 **Tab 页切换**结构：新增「汇总」Tab + 每个建议平台一个 Tab（知乎 / 微博 / 小红书 / B站 / 头条…，Tab 项随实际返回平台动态生成）。
  - **汇总 Tab**（默认选中）：每个平台渲染为一行紧凑摘要——平台名 + 最多 6 个标签 + 该平台「复制」按钮；标签总数超过 6 时行尾显示「+N」省略徽标（不可点击，仅提示完整内容在对应平台 Tab）。
  - **平台 Tab**：完整渲染该平台的内容标签 / 流量标签分组与热度角标，行为与现状一致。
- 「提取关键词」「相关话题」两段保留为面板顶部常显区（它们跨平台、无分组语义，不适合进 Tab）。
- 「各平台标签」小标题随 Tab 结构移除（Tab 行本身已承载该语义），替换为 Tab 行；来源/校准状态行保留在面板底部。
- 点击填入（apply-tag）、复制标签、错误态一行收敛、loading 骨架、平台联动请求、显隐记忆等既有契约**全部保持不变**。
- 新增 Tab 状态管理：默认选中「汇总」；平台列表变化时若当前选中 Tab 被移除则回落「汇总」；Tab 切换不触发重新请求（纯前端视图状态）。
- i18n：zh/en 成对新增 Tab 相关键（汇总 Tab 标题、省略徽标 title 提示等）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- **publish-page-right-rail**（openspec/specs/publish-page-right-rail/spec.md）：新增「平台标签 Tab 化呈现与纵向密度约束」Requirement——平台标签区 SHALL 以 Tab 呈现，默认汇总视图；面板展开高度 MUST NOT 超过设定上限（≈340px 内容区）；既有「标签建议与所选平台联动」「标签点击填入」「空态收敛」「面板显隐记忆」Requirement 语义不变、继续成立。

## Impact

- **代码**：`apps/desktop/src/components/TagSuggester.vue`（模板 + 脚本 + 样式，单组件为主）；`apps/desktop/src/locales/zh.js` / `en.js`（成对新增键）。
- **测试**：`apps/desktop/src/components/TagSuggester.test.js`（新增 Tab 契约用例 + 既有用例适配）；`apps/desktop/src/views/Publish.test.js`（智能标签相关既有断言应保持绿，如受文案影响则同步）。
- **视觉回归**：`apps/desktop/tests/visual-testing/base-screenshots/publish-form(-dark).png`——面板默认展开且渲染在 publish-form 视野内，Tab 化后基线必须重建（走既有基线刷新流程）。
- **IPC/后端**：无变更（`intelligenceSuggestTags` 请求/响应契约不动）。
- **无 BREAKING**。
