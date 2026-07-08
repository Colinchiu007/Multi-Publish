## 预存基础设施问题

### INFRA-001：jest 30 子包 testRunner 解析失败
- **症状**：pip install jest-circus@30.4.2 --save-dev 后仍报 Module jest-circus/build/runner.js not found
- **根因**：jest 30 的 jest-config/build/index.js:1679 使用 equire.resolve('jest-circus/runner') 从自身上下文解析路径，随后在 esolve() 函数中用 indNodeModule() 从子包 rootDir 验证该路径，但 indNodeModule() 无法定位 hoisted 的 node_modules 中的文件
- **影响**：@multi-publish/shared-utils 和 @multi-publish/rpa-engine 的 jest 测试无法运行
- **绕过**：从项目根目录 
ode_modules/.cache/jest-resolve/ 可正常 resolve；或将 testRunner 指向绝对路径（需自定义 resolver）
- **修复方向**：等待 jest 30 补丁，或降级到 jest 29，或升级到 jest 31
