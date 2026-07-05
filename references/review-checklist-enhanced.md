# Review Checklist（增强版）

## P0

### IPC Handler 完整性
- preload 的 ipcRenderer.invoke 都有对应的 ipcMain.handle

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

### 窄屏响应式布局
- 修改涉及布局的组件时，检查窄屏下内容是否重叠或溢出
- 使用 flex-wrap / min-width / media query 等响应式方案
