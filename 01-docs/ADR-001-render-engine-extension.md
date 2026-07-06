# ADR-001: RenderEngine 扩展方案

## 日期
2026-07-03

## 状态
已采纳

## 背景
Multi-Publish 需要将 OpenMontage 的视频创作能力集成到桌面客户端。现有 render-engine.js 只支持 Explainer 一种 Composition，参数硬编码。

## 决策
采用 Composition 参数传递方案，不在 Electron 主进程中维护 Composition 注册表：

1. **render-engine.js** 定义 COMPOSITIONS 常量（与 remotion-composer Root.tsx 同步），通过 listCompositions() 暴露给渲染进程
2. **composition 参数**由渲染进程（CreateView.vue）选择，通过 IPC 透传到 render-engine
3. **compositionArgs** 与 props 合并后写入临时 JSON，各 composition 组件从 props 中提取自己的参数
4. **renderMode/outputFormat** 作为独立参数，render-engine 根据值添加 --still/--sequence 标记

## 方案对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **A. Composition 参数传递**（已选） | 简单、松耦合、向后兼容 | 需手动同步 Root.tsx 的 composition 列表 |
| B. Electron 维护 composition 注册表 | 自动检测、无需同步 | 复杂、需解析 TSX 文件、性能开销 |

## 影响
- 新增 composition 时：需更新 render-engine.js 的 COMPOSITIONS 常量（仅 1 处）
- 向后兼容：composition 默认 Explainer，旧调用不受影响
- IPC 协议：扩展 render:start 参数，新增 render:list-compositions / render:list-profiles
