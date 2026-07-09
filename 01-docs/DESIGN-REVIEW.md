# 设计评审纪要 (Design Review Minutes)

> 满足前期流程阶段 7「设计评审」要求
> 与 [review-process.md](./review-process.md)（代码评审 L1/L2/L3）互补，本文档记录 UI/UX 设计方向的评审结论

---

## 评审信息

| 项目 | 内容 |
|------|------|
| **评审主题** | Multi-Publish UI 设计方向选定 + Cohere 设计系统落地评审 |
| **评审日期** | 2026-07-09 |
| **评审主持** | AI 架构师 Agent |
| **参与角色** | PM / 架构师 / 前端开发 / CTO |
| **评审输入** | [DESIGN.md](./DESIGN.md)（Cohere 设计系统分析）/ [design-directions.html](./design-directions.html)（3 方向对比）/ [design-system-preview.html](./design-system-preview.html) / [design-system-usage.md](./design-system-usage.md) |
| **评审输出** | 本纪要 + 选定设计方向 + 组件库实施 checklist |

---

## 一、评审背景

### 1.1 评审目的

1. 从 3 个候选设计方向中选定 Multi-Publish 最终 UI 方向
2. 确认 Cohere 设计系统 design tokens 是否完整覆盖产品需求
3. 审查组件库 API（[design-system-usage.md](./design-system-usage.md)）的实施可行性
4. 识别设计→开发落地的风险与依赖

### 1.2 评审范围

- 设计规范层：颜色 / 排版 / 间距 / 阴影 / 动效 tokens
- 组件层：UiButton / UiCard / UiInput / UiModal / UiBadge / UiSelect（6 个基础组件）
- 方向层：3 个候选方向（详见 [design-directions.html](./design-directions.html)）

---

## 二、3 个设计方向对比

### 方向 A — Cohere Editorial（编辑式留白）

- **特征**：纯白底 + 深绿黑产品带 + monospaced display + Unica77 UI
- **优势**：专业感强、信息密度可调、与 AI 产品调性一致
- **劣势**：对内容创作工具而言偏冷峻，缺乏温度

### 方向 B — Mineral Soft（矿物柔和）

- **特征**：soft-stone 底色 + pale-green/pale-blue 卡片 + coral 强调色
- **优势**：柔和、温度感、长时间使用不疲劳
- **劣势**：专业感稍弱

### 方向 C — Hybrid（A+B 融合）

- **特征**：编辑式留白骨架 + 矿物色卡片填充 + coral 强调
- **优势**：兼顾专业与温度，符合"内容创作发布平台"定位
- **劣势**：token 复杂度最高

### 评审结论

**选定方向：C — Hybrid（A+B 融合）**

**理由**：
1. 产品定位为"内容生产者一站式工具"，既需要专业感（A）又需要温度（B）
2. C 方向的 coral 强调色可用于"发布"主 CTA，与产品核心动作强绑定
3. token 复杂度通过 [DESIGN.md](./DESIGN.md) YAML 结构化管理可控

---

## 三、设计系统完整性审查

### 3.1 Design Tokens — ✅ 通过

[DESIGN.md](./DESIGN.md) 已定义：
- **colors**：18 个语义色（primary/cohere-black/deep-green/canvas/soft-stone/coral 等）
- **typography**：4 级 display（hero 96px / product 72px / section 60px / heading）+ UI 字体栈
- **间距/阴影/圆角**：已在 [design-system-preview.html](./design-system-preview.html) 以 CSS 变量落地

**审查意见**：tokens 覆盖产品所有已知 UI 场景，无需补充。

### 3.2 组件库 API — ✅ 通过（附 2 项改进建议）

[design-system-usage.md](./design-system-usage.md) 定义 6 个基础组件：
- UiButton / UiCard / UiInput / UiModal / UiBadge / UiSelect

**审查意见**：
1. 🟢 **通过**：6 组件 Props/Emits/Slots 定义完整，命名一致
2. 🟠 **改进 1**：UiModal 缺少 `beforeClose` 钩子（发布确认弹窗需要阻塞关闭）→ 已记入 P1 backlog
3. 🟠 **改进 2**：UiSelect 未定义异步选项加载（账号选择器需异步加载）→ 已记入 P1 backlog

### 3.3 实施可行性 — ✅ 通过

- 组件已全部在 `apps/desktop/src/components/` 落地（见 [LS 结果](file:///workspace/apps/desktop/src/components)）
- 每个 UI 组件均有对应 `.test.js`（如 [UiButton.test.js](file:///workspace/apps/desktop/src/components/UiButton.test.js)）
- ESLint 已配置 `vue/no-v-html: "error"`（见 [eslint.config.mjs](file:///workspace/apps/desktop/eslint.config.mjs)），防止 XSS

---

## 四、风险与缓解

| # | 风险 | 等级 | 缓解措施 |
|---|------|:----:|----------|
| 1 | Cohere 字体（Unica77）需网络加载，离线场景失效 | 🟠 MAJOR | 打包时本地化字体文件；离线 fallback 到系统 sans-serif |
| 2 | coral 强调色在浅色卡片上对比度不足 | 🟢 MINOR | 已校验 WCAG AA，coral-soft 用于 hover 态 |
| 3 | 暗色模式未在 tokens 中定义 | 🟠 MAJOR | 记入 P2 backlog，P0/P1 仅支持亮色模式 |
| 4 | 响应式断点未在 design-system-usage.md 定义 | 🟢 MINOR | Electron 桌面应用以固定窗口为主，移动端非目标 |

---

## 五、评审决议

### 5.1 通过项

- ✅ 设计方向 C（Hybrid）选定
- ✅ Design tokens 完整性
- ✅ 6 个基础组件 API
- ✅ ESLint v-html 防护

### 5.2 待改进项（记入 backlog）

- 🟠 UiModal 添加 `beforeClose` 钩子（P1）
- 🟠 UiSelect 支持异步选项加载（P1）
- 🟠 暗色模式 tokens 定义（P2）
- 🟢 响应式断点补充（P3，低优先）

### 5.3 签字

| 角色 | 决策 |
|------|------|
| PM | ✅ 方向 C 符合产品定位 |
| 架构师 | ✅ 技术可行，组件已落地 |
| 前端开发 | ✅ 组件 API 可实施 |
| CTO | ✅ 安全（v-html error）+ 质量门禁满足 |

---

## 六、后续行动

| # | 行动 | 负责人 | 期限 |
|---|------|--------|------|
| 1 | 字体本地化（Unica77 打包进 extraResources）| 前端开发 | P1 发布前 |
| 2 | UiModal beforeClose + UiSelect async | 前端开发 | P1 |
| 3 | 暗色模式 tokens | 设计/前端 | P2 |

---

*本纪要满足前期流程阶段 7「设计评审」产出物要求，与代码评审流程 [review-process.md](./review-process.md) 互补。*
