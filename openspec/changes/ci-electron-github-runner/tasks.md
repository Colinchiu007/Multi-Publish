# Tasks: ci-electron-github-runner

## 1. workflow 迁移

- [x] electron-ci.yml：runs-on ubuntu-latest；apt 装 xvfb/build-essential/python3；@electron/rebuild better-sqlite3；timeout 45；保留 checksum/mirror/SKIP/单 worker/冒烟/诊断/build/deps/circular
- **测试目标**：本 PR 自身 CI 的 electron-tests job 通过（C 验证）

## 2. 职责边界文档

- [x] 工作流头注释（4 点）；CHANGELOG、learnings
- **测试目标**：无（文档核对）

## 3. 门禁与交付

- [ ] 本 PR CI（Quality Gate + electron-tests on ubuntu-latest + gui-test 等）通过
- [ ] claude 审查（antigravity 降级记录）
- [ ] 合并；归档三同步；记忆更新
