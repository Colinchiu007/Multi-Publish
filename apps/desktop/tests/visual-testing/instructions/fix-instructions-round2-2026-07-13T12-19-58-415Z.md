# Agent 修复指令 (Round 2)

**时间**: 2026-07-13T12:19:58.415Z
**需修复项**: 2

---

## 🔴 Fix 1: home-baseline

- **类型**: ROUTE_OR_CRASH
- **严重度**: HIGH
- **路由**: `/`
- **像素差异**: 100.0%

**指令**:
页面 "home-baseline" (路由 /) 像素差异 100.0%，截图几乎完全不同。
可能原因: 路由跳转错误、应用崩溃、dev server 未运行正确应用。
请用 view_image 查看 tests\visual-testing\screenshots\home-baseline-current.png 确认实际页面内容。

- 截图: `tests\visual-testing\screenshots\home-baseline-current.png`

---

## 🔴 Fix 2: accounts-list

- **类型**: ROUTE_OR_CRASH
- **严重度**: HIGH
- **路由**: `/accounts`
- **像素差异**: 100.0%

**指令**:
页面 "accounts-list" (路由 /accounts) 像素差异 100.0%，截图几乎完全不同。
可能原因: 路由跳转错误、应用崩溃、dev server 未运行正确应用。
请用 view_image 查看 tests\visual-testing\screenshots\accounts-list-current.png 确认实际页面内容。

- 截图: `tests\visual-testing\screenshots\accounts-list-current.png`

---

## 修复后验证

```bash
cd apps/desktop && npm run test:fix-loop
```

或重新运行强制闭环:
```bash
cd apps/desktop && node tests/visual-testing/autonomous-enforce-loop.js
```
