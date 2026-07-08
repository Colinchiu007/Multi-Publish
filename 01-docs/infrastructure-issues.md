## 预存基础设施问题

### INFRA-001：jest 30 子包 testRunner 解析失败

**根因**: jest-resolve.findNodeModule() 使用 basedir=rootDir(apps/desktop) 查找 jest-circus/runner，但 jest-circus 仅安装在根 node_modules/。Jest 30 不预装 jest-circus，导致 require.resolve 失败。

**修复选项**:
1. 在 apps/desktop 安装 jest-circus@30.4.2（有 peer dep 冲突）
2. 调整 rootDir 为项目根目录 + 修改所有 moduleNameMapper 路径
3. 创建根级 jest.config.js 作为统一入口
4. 降级 Jest 到 v29（默认内置 jest-circus）
