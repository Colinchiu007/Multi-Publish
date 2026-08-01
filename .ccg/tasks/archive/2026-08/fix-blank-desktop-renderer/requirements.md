# Electron 开发窗口空白渲染

## 现象

- Windows 开发版 Electron 已能打开名为“社媒管家”的原生窗口。
- 窗口内容区保持空白，未显示 Vue 应用。
- Vite 服务确认监听在 `http://127.0.0.1:5174/`。

## 已知背景

- 先前的 GPU 子进程启动失败已通过开发模式的 ANGLE SwiftShader 和进程内 GPU 回退缓解。
- `window.js` 已临时增加开发模式下 `console-message` 和 `render-process-gone` 日志，用于获取渲染错误。
- 修复必须避免影响打包版的 GPU/安全配置，并保留 preload sandbox。

## 验收标准

1. 开发版窗口中可见 Vue 根界面，而非空白内容区。
2. 根因由实际控制台、网络或渲染进程日志证明。
3. 相关自动化测试、静态检查和实际开发启动验证通过。
