# Review Checklist（增强版）

## P0

### IPC Handler 完整性
- preload 的 ipcRenderer.invoke 都有对应的 ipcMain.handle

### Preload Sandbox 兼容性
- 修改 preload 后必须在 sandbox:true 和 sandbox:false 两种模式下验证
- preload.js 禁止 require 子目录文件（sandbox 模式下会加载失败），必须内联或使用绝对路径
- 验证 `window.electronAPI` 在两种模式下均可用，IPC 调用能到达主进程

### JS 语法正确性
- node --check 必须通过所有 JS 文件

### TS 迁移一致性
- .ts 文件必须包含 .js 对应 handler

## P1

### 测试覆盖
- 新增代码至少有一个测试

### FUSE 截断检测
- 测试文件行数未异常减少

## P2

### E2E 测试
- 新功能考虑补充 E2E

### 测试计数基线
- 当前 696 tests，CI 跟踪变化

