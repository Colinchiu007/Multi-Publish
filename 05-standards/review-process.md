# Code Review Process — PROJECT-003 Multi-Publish

## 评审级别

| 级别 | 触发条件 | 要求 |
|------|----------|------|
| **L1 自审** | 每次 commit | 自己看一遍代码 |
| **L2 合并评审** | feature → develop | 至少 1 人 review（AI 自动执行） |
| **L3 发布评审** | develop → main | 全面 review（安全、性能、兼容性） |

## L1 自审 Checklist

- [ ] 代码能跑吗？（本地测试通过）
- [ ] 测试通过了吗？（`npm test` / `pytest`）
- [ ] 有错误处理吗？（关键路径 try/catch）
- [ ] 有日志吗？（`logger.info` / `console.log` 进度）
- [ ] 没有 `console.log` 泄露到生产代码？
- [ ] 没有硬编码的密码/密钥？

## L2 合并评审 Checklist

- [ ] 功能符合 PRD 描述
- [ ] 命名规范一致（camelCase/PascalCase）
- [ ] 无死代码/注释代码
- [ ] 新模块有对应 import/export
- [ ] 不影响已有功能（回归）
- [ ] CI 绿灯（build + test）

## L3 发布评审 Checklist

- [ ] **安全**: 无敏感信息泄露、Cookie 加密正确
- [ ] **性能**: RPA 操作有随机延迟（防封禁）
- [ ] **兼容性**: Electron 打包不缺失文件
- [ ] **版本**: `package.json` version = tag 号
- [ ] **文档**: PRD 已更新
- [ ] **更新**: `latest.yml` 版本号一致

## 自动化检查

```bash
# JS/Node.js
npm test -w @multi-publish/rpa-engine -w @multi-publish/shared-utils

# Python (后续添加)
cd packages/python-backend && python -m py_compile src/server.py

# 构建
npm run build:win -w @multi-publish/desktop
```

## 问题分类

| 级别 | 说明 | 是否阻塞合并 |
|------|------|-------------|
| **Critical** | 安全漏洞、数据丢失、导致崩溃 | ✅ 必须修复 |
| **Major** | 功能不完整、错误处理缺失 | ⚠️ 建议修复 |
| **Minor** | 代码风格、命名、注释 | 📝 记录后修复 |
