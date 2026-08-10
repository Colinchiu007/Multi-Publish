# 质量节拍强制卡点（ci-hardening 模板）

> **违反以下任何一条，代码不允许提交。**

## 提交前自检清单（必须全部勾选）

### 代码变更类
- [ ] 新增/修改的函数有异常处理（try-catch 或 .catch()）
- [ ] 无硬编码路径/密钥/URL（使用环境变量或配置）
- [ ] 无 console.log 在生产代码中（仅允许开发调试）
- [ ] 无 `waitForTimeout` 等硬编码等待
- [ ] require/import 路径的目标文件真实存在

### 测试类
- [ ] 新增功能有对应测试用例（正常+异常+边界）
- [ ] 所有测试通过（{{TEST_COMMAND}}）
- [ ] 分支覆盖率 ≥ {{COVERAGE_THRESHOLD}}%（低于则需补充测试）
- [ ] 手动验证核心功能可用

### 文档类
- [ ] CHANGELOG.md 已更新（如有用户可见变更）
- [ ] 架构/接口变更已更新对应文档
- [ ] 新增环境变量已在 .env.example 中声明

### 安全类
- [ ] 无敏感信息泄露（密钥/Token/密码）
- [ ] 用户输入有校验/转义
- [ ] Electron 安全配置完整（contextIsolation/nodeIntegration，仅 Electron 项目）

### CI 类
- [ ] 本地通过 ≠ 交付通过：push 后确认 CI（quality-gate）通过，失败必须修复后重推
- [ ] 运行时代码/CI 变更走分支 + PR，禁止直接改 {{DEFAULT_BRANCH}}
- [ ] 改 workflow 前全仓 grep 契约测试（.github/scripts/ 与 */tests/ 都可能有），改后本地跑通

---

## 本次执行记录

> 每次提交前追加：`## <日期> <任务> 提交前自检` + 逐项勾选 + 验证证据（file:line / 命令输出）。
