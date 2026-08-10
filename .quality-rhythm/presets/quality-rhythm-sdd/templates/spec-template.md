# Feature Specification: [FEATURE NAME]

**Feature Branch**: `[###-feature-name]`
**Created**: [DATE]
**Status**: Draft
**Quality Gate**: [ ] Passed Phase 0 门禁检查

---

## Overview

[一句话描述：为 [谁] 构建 [什么]，解决 [什么问题]，预期产生 [什么影响]。]

---

## Quality Rhythm Gate (Phase 0 → Phase 1 准入检查)

> 在进入 Phase 1（规划期）之前，以下检查项必须全部通过。
> 任何一项为 [ ] 状态，不得进入 Phase 1。

| 检查项 | 状态 | 负责人 | 备注 |
|--------|------|--------|------|
| 用户场景已梳理（P1/P2/P3 优先级已定） | [ ] | | |
| 每个 P1 故事的 UI 字段规格已定义 | [ ] | | |
| 交互控件规格已定义（触发条件、状态变化） | [ ] | | |
| 弹窗/浮层/Toast 规格已定义 | [ ] | | |
| 视觉规范已确认（组件库、颜色、字体、间距） | [ ] | | |
| 错误/空/加载状态已定义（每个页面） | [ ] | | |
| 字段校验规则已定义（前端 + 后端） | [ ] | | |
| 验收标准已映射为测试场景（TDD） | [ ] | | |
| 🔶 Assumption 标记已评估风险等级 | [ ] | | |
| 🔵 Open Question 数量已收敛至 < 3 | [ ] | | |

---

## User Scenarios & Testing (mandatory)

<!--
 IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
 Each user story/journey must be INDEPENDENTLY TESTABLE — meaning if you implement just ONE of them,
 you should still have a viable MVP that delivers value.
 Assign priorities (P1, P2, P3, etc.) to each story.
-->

### User Story 1 — [Brief Title] (Priority: P1)

[用自然语言描述这个用户旅程]

**Why this priority**: [解释价值和优先级理由]

**Independent Test**: [描述如何独立测试]

**Acceptance Scenarios**:

1. **Given** [初始状态], **When** [操作], **Then** [预期结果]
2. **Given** [初始状态], **When** [操作], **Then** [预期结果]

---

### User Story 2 — [Brief Title] (Priority: P2)

[用自然语言描述这个用户旅程]

**Why this priority**: [解释价值和优先级理由]

**Independent Test**: [描述如何独立测试]

**Acceptance Scenarios**:

1. **Given** [初始状态], **When** [操作], **Then** [预期结果]

---

[按需添加更多 User Story]

### Edge Cases

- 当 [边界条件] 时会发生什么？
- 系统如何处理 [错误场景]？

---

## Requirements (mandatory)

### Functional Requirements

- **FR-001**: 系统必须 [具体能力]
- **FR-002**: 系统必须 [具体能力]
- **FR-003**: 用户必须能够 [关键交互]
- **FR-004**: 系统必须 [数据要求]
- **FR-005**: 系统必须 [行为要求]

*标记不清楚的需求：*

- **FR-006**: 系统必须 [NEEDS CLARIFICATION: 具体是什么？]
- **FR-007**: 系统必须 [NEEDS CLARIFICATION: 未明确的细节]

### Key Entities (if feature involves data)

- **[Entity 1]**: [描述、关键属性]
- **[Entity 2]**: [描述、与其他实体的关系]

---

## UI Field Specifications (mandatory for frontend features)

<!--
 必填项：定义每个页面/表单的每一个字段。
 这是 PM 和前端工程师之间的契约。
 缺少字段 = 缺少测试 = 缺少实现。
-->

> **质量门禁**：每个涉及 UI 的 User Story，都必须有对应的字段规格表。
> 纯展示页面注明 "N/A — 纯展示页"。

### Page/View: [页面名称 1]

| # | Field Name | Type | Label (i18n) | Placeholder | Default | Validation | Error Message | Required | Show Condition |
|---|-----------|------|-------------|-------------|---------|------------|---------------|----------|----------------|
| 1 | [fieldName] | [type] | [label] | [placeholder] | [default] | [rule] | [msg] | Yes/No | [expression] |

**字段类型参考：**
- `text` — 单行文本
- `email` — 邮箱（自动校验格式）
- `number` — 数字（需指定 min/max/step）
- `date` / `datetime` — 日期 / 日期时间选择器
- `select` — 下拉单选
- `multiselect` — 下拉多选
- `radio` — 单选按钮组
- `checkbox` — 复选框
- `textarea` — 多行文本（需指定 rows）
- `file` — 文件上传（需指定 accept、maxSize、maxCount）
- `slider` — 滑块（需指定 min/max/step）
- `toggle` — 开关
- `color` — 颜色选择器
- `rate` — 评分
- `transfer` — 穿梭框

**校验规则参考：**
- `regex: ^\d{11}$` — 正则
- `length: 1-100` — 字符长度
- `range: 0-999` — 数值范围
- `email` / `url` / `phone` — 内置格式
- `custom: functionName` — 自定义校验
- `async: checkDuplicate` — 异步校验（如查重）

### Page/View: [页面名称 2]

| # | Field Name | Type | Label | Placeholder | Default | Validation | Error Message | Required | Show Condition |
|---|-----------|------|-------|-------------|---------|------------|---------------|----------|----------------|
| 1 | | | | | | | | | |

### Form Submission Rules

| Form | Submit Button | Success Action | Failure Action | Loading State |
|------|-------------|----------------|----------------|---------------|
| [表单名] | [按钮文案] | [跳转/Toast/刷新] | [Toast/行内错误] | [spinner/skeleton/disabled] |

---

## Interaction Control Specifications (mandatory)

<!--
 必填项：为每个交互元素定义触发条件、行为和状态变化。
 "用户点击按钮" 不是规格。这才是规格。
-->

### Controls List

| # | Control Name | Type | Location | Trigger | Action | State Change | Disabled Condition |
|---|-------------|------|----------|---------|--------|-------------|-------------------|
| 1 | [name] | [type] | [page/component] | [event] | [action] | [before → after] | [condition] |

**控件类型参考：**
- `Button` — 按钮（primary / secondary / ghost / danger / link）
- `Link` — 文字链接
- `Icon` — 图标按钮（需指定 tooltip）
- `Dropdown` — 下拉菜单
- `Tab` — 选项卡切换
- `Switch` — 开关
- `Accordion` — 折叠面板
- `Carousel` — 轮播
- `Tooltip` — 悬浮提示
- `ContextMenu` — 右键/长按菜单
- `DragHandle` — 拖拽手柄
- `Stepper` — 步骤条
- `Pagination` — 分页器
- `TreeSelect` — 树选择器
- `Cascader` — 级联选择

### Keyboard Shortcuts

| Shortcut | Context | Action |
|----------|---------|--------|
| `Ctrl+S` | [页面/表单] | [保存/提交] |
| `Esc` | [弹窗/抽屉] | [关闭] |

### Loading States for Controls

| Control | Loading Indicator | Timeout Behavior |
|---------|------------------|-----------------|
| [button] | spinner / disabled + 文案变化 | [重试/显示错误] |

---

## Modal / Dialog / Toast Specifications (mandatory)

<!--
 必填项：每个弹窗类元素必须有完整规格。
-->

### Modals / Dialogs

| # | Name | Trigger | Title | Content | Buttons | Close Method | Overlay | Animation |
|---|------|---------|-------|---------|---------|-------------|---------|-----------|
| 1 | [name] | [trigger] | [title] | [body] | [btn1: label + action + style] | X / Esc / overlay / none | dismiss / prevent | fade / slide / scale |

### Drawers / Side Panels

| # | Name | Trigger | Position | Width | Content | Close Method |
|---|------|---------|----------|-------|---------|-------------|
| 1 | [name] | [trigger] | left/right/bottom | [px/%] | [content] | [method] |

### Toast Notifications

| # | Name | Trigger | Type | Message | Duration | Action | Position |
|---|------|---------|------|---------|----------|--------|----------|
| 1 | [name] | [when] | success/error/warning/info | [text] | [ms] / manual | [action] | top-right / etc |

### Confirmation Dialogs (destructive actions)

| # | Name | Trigger | Title | Body | Confirm | Cancel | On Confirm | On Cancel |
|---|------|---------|-------|------|---------|--------|-----------|-----------|
| 1 | [name] | [trigger] | [title] | [warning] | [确认文案] | [取消文案] | [action] | [close] |

---

## Visual Specification (mandatory)

<!--
 必填项：链接设计系统，定义颜色、字体、间距。
 新功能必须指定使用哪些现有组件。
-->

### Default Design Principles (from toss-style)

> 新功能设计默认参考 [toss-style-design-system](https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/toss-style-design-system.mdc) 的设计原则。
> 如有自定义设计系统，以项目自身为准，但以下原则作为基础约束。

**排版层级（Typography Hierarchy）**
- 标题层级清晰：H1 > H2 > H3，字号递减，粗细递减
- 正文行高 1.5-1.6，标题行高 1.2-1.3
- 中文优先使用系统默认字体（PingFang SC / Microsoft YaHei）

**颜色克制（Color Restraint）**
- 主色不超过 3 个，辅助色不超过 2 个
- 背景色与前景色对比度 >= 4.5:1（WCAG AA）
- 错误色用 red，成功色用 green，警告色用 amber/yellow

**间距节奏（Spacing Rhythm）**
- 基础间距单位 4px 或 8px
- 组件内间距 8-16px，组件间间距 16-24px，区块间距 32-48px
- 保持垂直节奏一致性

**卡片与表面（Cards & Surfaces）**
- 卡片圆角统一（8px / 12px / 16px 三选一）
- 卡片阴影层级：resting < hover < active
- 表面层级：background < surface < overlay

**暗色模式（Dark Mode）**
- 背景色从白变深灰（#121212 / #1a1a1a）
- 文字色从黑变浅灰（#e0e0e0）
- 强调色保持一致但降低饱和度

**无障碍（Accessibility）**
- 所有交互元素必须可键盘操作
- 图片必须有 alt 属性
- 表单必须有关联 label
- 焦点指示器清晰可见

**常见错误（反模式）**
- ❌ 使用超过 5 种颜色
- ❌ 字号层级超过 4 级
- ❌ 间距不一致（如 7px、13px 等非标准值）
- ❌ 忽略暗色模式适配
- ❌ 按钮/链接没有 hover 和 active 状态

### Design System Reference

- **Component Library**: [如 Ant Design 5.x / Element Plus / shadcn/ui / Tailwind]
- **Design Tokens**: [token 文件链接]
- **Design Principles**: [toss-style-design-system](https://github.com/PatrickJS/awesome-cursorrules/blob/main/rules/toss-style-design-system.mdc) -- 默认参考
- **Figma/Sketch**: [设计稿链接]

### Color Specification

| Element | Color | Token | Usage |
|---------|-------|-------|-------|
| [element] | [#hex] | [token] | [where] |

### Typography

| Element | Font | Size | Weight | Line Height | Usage |
|---------|------|------|--------|-------------|-------|
| [H1/H2/body/caption] | [family] | [px/rem] | [weight] | [px/rem] | [context] |

### Spacing & Layout

| Context | Value | Token |
|---------|-------|-------|
| Component gap | [px] | [token] |
| Section margin | [px] | [token] |
| Page padding | [px] | [token] |

### Responsive Breakpoints

| Breakpoint | Width | Layout Behavior |
|-----------|-------|----------------|
| Mobile | < 768px | [behavior] |
| Tablet | 768-1024px | [behavior] |
| Desktop | > 1024px | [behavior] |

### Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|------------|---------------|
| Color contrast >= 4.5:1 | [how] |
| Keyboard navigation | [tab order, focus] |
| Screen reader labels | [aria-*] |
| Focus indicators | [outline style] |

---

## Error, Empty & Loading States (mandatory)

<!--
 必填项：每个屏幕必须有这三种状态的规格。
 没有 loading/empty/error 规格的页面是不完整的。
-->

### Error States

| # | Scenario | Error Type | Display | Message | Recovery | Severity |
|---|---------|-----------|---------|---------|----------|----------|
| 1 | [scenario] | network / validation / permission / not-found / server | inline / toast / page | [msg] | [action] | critical / warning / info |

### Empty States

| # | Scenario | Display | Message | CTA Button | CTA Action |
|---|---------|---------|---------|-----------|-----------|
| 1 | [scenario] | illustration + text | [msg] | [label] | [action] |

### Loading States

| # | Scenario | Display | Threshold | Timeout Behavior |
|---|---------|---------|-----------|-----------------|
| 1 | [scenario] | skeleton / spinner / progress | [ms] | [behavior] |

---

## Field Validation Rules (mandatory)

<!--
 必填项：上方每个字段的完整校验矩阵。
 前端实时校验；后端保存/提交时校验。
-->

### Frontend Validation (real-time)

| Field | Event | Rule | Error Message | Severity |
|-------|-------|------|---------------|----------|
| [field] | onBlur / onChange / onSubmit | [rule] | [msg] | error / warning |

### Backend Validation (on save/submit)

| Field | Rule | HTTP Status | Error Response |
|-------|------|------------|---------------|
| [field] | [rule] | 400/409/422 | `{"field":"[name]","code":"[code]","message":"[msg]"}` |

### Cross-Field Validation

| Rule | Fields | Condition | Error Message |
|------|--------|-----------|---------------|
| [name] | [f1, f2] | [condition] | [msg] |

---

## TDD Test Scenario Mapping (mandatory)

<!--
 必填项：每个验收标准必须映射至少一个测试场景。
 没有测试的验收标准 = 不存在的功能。
 使用 Gherkin 格式确保清晰度。
-->

### Test Scenarios by User Story

#### User Story 1 — [Title]

| # | Scenario | Given | When | Then | Test Type | Priority | Spec Ref |
|---|---------|-------|------|------|-----------|----------|----------|
| TS-1.1 | [name] | [precondition] | [action] | [result] | E2E / Integration / Unit | P1/P2/P3 | US-1-AC-1 |

#### User Story 2 — [Title]

| # | Scenario | Given | When | Then | Test Type | Priority | Spec Ref |
|---|---------|-------|------|------|-----------|----------|----------|
| TS-2.1 | [name] | [precondition] | [action] | [result] | E2E / Integration / Unit | P1/P2/P3 | US-2-AC-1 |

### UI / Visual Regression Tests

| # | Component | Scenario | Viewport | Spec Ref |
|---|----------|---------|----------|----------|
| VR-1 | [component] | [capture what] | desktop / mobile / both | [section] |

### API Contract Tests

| # | Endpoint | Method | Request | Expected Response | Status | Spec Ref |
|---|---------|--------|---------|-------------------|--------|----------|
| CT-1 | [path] | GET/POST/PUT/DELETE | [body] | [schema] | [code] | FR-001 |

### Data Validation Tests

| # | Field | Input | Expected Behavior | Spec Ref |
|---|-------|-------|-------------------|----------|
| DV-1 | [field] | [invalid] | [error + state] | Validation Rule |

---

## Out of Scope

- [排除项 + 理由]
- [排除项 + 理由]

### Future Considerations

- [后续可能考虑的功能]

---

## Dependencies & Risks

### Dependencies

- **Technical**: [平台/基础设施要求]
- **External**: [第三方集成]
- **Team**: [跨团队协作]

### Risks & Mitigations

| Risk | Probability | Impact | Mitigation | Owner |
|------|------------|--------|-----------|-------|
| [risk] | High/Med/Low | High/Med/Low | [action] | [name] |

---

## Open Questions

| # | Question | Owner | Deadline | Status |
|---|---------|-------|----------|--------|
| 1 | [question] | [name] | [date] | Open |

---

## Assumptions

- [关于用户、环境、依赖的假设]
- [关于范围边界的假设]

---

## PRD Self-Assessment

### Strongest Section
[哪个部分最有信心？为什么？]

### Weakest Section
[哪个部分最薄弱？为什么？]

### Top Assumptions to Validate

| # | Assumption | Section | Risk if Wrong | Validation Method |
|---|-----------|---------|---------------|-------------------|
| 1 | [statement] | [section] | [impact] | [how to test] |

### Recommended Next Step
[在 stakeholder review 之前，最重要的下一步是什么？]

---

*End of Feature Specification*
