## 1. 规格与基线

- [x] 1.1 完成运行日志、run-state、调用链与 MiMo 官方中文文档的基线差异审计，确认待办仅为默认音色契约。
- [x] 1.2 创建 CCG task 与 OpenSpec change，并记录 `run_1787475502069_9888` 根因。

## 2. TDD 实现

- [x] 2.1 在 `mimo-tts.test.js` 增加未传音色和空字符串音色的最终请求体断言，运行定向测试并确认其因现有 `default` 值失败。
- [x] 2.2 将 MiMo 适配器默认音色改为 `mimo_default`，运行适配器定向测试确认全部通过（26/26）。

## 3. 交付验证

- [x] 3.1 运行 `node --check`、`git diff --check`、`node scripts/verify-worktree-deps.js` 和变更文件 lint。
- [x] 3.2 执行 Electron 目录构建、ASAR require 链和打包启动冒烟，确认无配置、插件或 ASAR 路径错误（`build:vue`、`electron-builder --win --dir --publish never`、ASAR require、8 秒启动均通过）。
- [x] 3.3 完成本地/双模型审查记录 QM-5 逃逸链，并在无法调用外部 wrapper 时记录降级原因（见 `review.md`）。
- [x] 3.4 创建并合并 PR #1140（`https://github.com/Colinchiu007/Multi-Publish/pull/1140`；head `50539f97d`；merge `40f32a88b7a2e20cf1b5bb32538a039351162a76`），所有 required checks 通过，`origin/main` 已核验包含 merge SHA；运行中的旧实例需重启后加载修复。
