# 前端开发指南

## 适用范围

- Vue 组件
- 页面与路由
- 渲染层状态管理
- 视觉回归相关改动

## 规则

- 改 UI 前先确认是否会影响现有视觉基线
- 新交互优先保持现有信息架构，不轻易换布局
- 涉及 IPC 时，必须校验 renderer 与 preload 的契约
- 修改模板后要确认没有编译错误和残留绑定

## 参考入口

- `AGENTS.md`
- `.quality-rhythm/SKILL.md`
- `apps/desktop/src/`
- `apps/desktop/tests/visual-testing/`
