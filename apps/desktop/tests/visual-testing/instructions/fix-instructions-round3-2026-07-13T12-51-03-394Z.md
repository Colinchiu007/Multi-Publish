# Agent 修复指令 (Round 3)

**时间**: 2026-07-13T12:51:03.394Z
**需修复项**: 7

---

## 🔴 Fix 1: monitor-dashboard

- **类型**: LAYOUT_REGRESSION
- **严重度**: HIGH
- **路由**: `/monitor`
- **像素差异**: 75.2%

**指令**:
页面 "monitor-dashboard" 像素差异 75.2%，大面积布局变更。
请用 view_image 查看截图和 diff 图，定位缺失/错位的组件并修复。

- 截图: `tests\visual-testing\screenshots\monitor-dashboard-current.png`
- 差异图: `tests\visual-testing\reports\pixel-diff\monitor-dashboard-1783947009895.png`

---

## 🔴 Fix 2: comments

- **类型**: LAYOUT_REGRESSION
- **严重度**: HIGH
- **路由**: `/comments`
- **像素差异**: 66.2%

**指令**:
页面 "comments" 像素差异 66.2%，大面积布局变更。
请用 view_image 查看截图和 diff 图，定位缺失/错位的组件并修复。

- 截图: `tests\visual-testing\screenshots\comments-current.png`
- 差异图: `tests\visual-testing\reports\pixel-diff\comments-1783947052267.png`

---

## 🔴 Fix 3: sidebar-platforms

- **类型**: FUNCTIONAL_FAILURE
- **严重度**: HIGH

**指令**:
功能测试 "sidebar-platforms" 失败: .cohere-platform-item: 0/3
请检查对应组件的逻辑和路由配置。


---

## 🔴 Fix 4: accounts-add-dialog

- **类型**: FUNCTIONAL_FAILURE
- **严重度**: HIGH

**指令**:
功能测试 "accounts-add-dialog" 失败: 弹窗未出现
请检查对应组件的逻辑和路由配置。


---

## 🔴 Fix 5: publish-form

- **类型**: FUNCTIONAL_FAILURE
- **严重度**: HIGH

**指令**:
功能测试 "publish-form" 失败: 页面内容为空
请检查对应组件的逻辑和路由配置。


---

## 🔴 Fix 6: calendar-grid

- **类型**: FUNCTIONAL_FAILURE
- **严重度**: HIGH

**指令**:
功能测试 "calendar-grid" 失败: .calendar-grid > *: 0/28
请检查对应组件的逻辑和路由配置。


---

## 🔴 Fix 7: model-provider-filter

- **类型**: FUNCTIONAL_FAILURE
- **严重度**: HIGH

**指令**:
功能测试 "model-provider-filter" 失败: .cohere-filter-chip: 0/5
请检查对应组件的逻辑和路由配置。


---

## 修复后验证

```bash
cd apps/desktop && npm run test:fix-loop
```

或重新运行强制闭环:
```bash
cd apps/desktop && node tests/visual-testing/autonomous-enforce-loop.js
```
