# ci-electron-github-runner Specification

## Purpose
定义 electron-tests 在 GitHub 官方 runner 上运行的环境契约：ubuntu-latest + xvfb + Electron ABI 原生模块重建 + 确定性单 worker vitest，替代阿里云 ECS 自托管 runner，消除排队与生产资源竞争。
## Requirements
### Requirement: GitHub 官方 runner 承载 electron-tests
electron-tests job SHALL 运行于 `ubuntu-latest`（GitHub 官方 runner），SHALL 通过 apt 安装 xvfb 与 build-essential，SHALL 在安装 Electron 后执行 `@electron/rebuild -f -w better-sqlite3` 重建原生模块（Electron ABI），SHALL 保留 checksum pin、npmmirror 镜像与 `SKIP_NATIVE_MEDIA_TOOL_TESTS=1`，SHALL 设置 timeout-minutes=45。工作流头注释 SHALL 说明该 job 为 Linux 平台确定性回归（与 Quality Gate windows 全 workspace 单测跨平台互补），并注明不再依赖 ECS 自托管 runner。

#### Scenario: 迁移后 CI 正常
- **WHEN** 本变更的 PR 触发 electron-tests
- **THEN** job 在 ubuntu-latest 上完成：单 worker vitest（20min 预算）、xvfb Electron 冒烟（30s 存活）、check:deps 与 check:circular，无 self-hosted 排队

#### Scenario: 原生模块可用
- **WHEN** 冒烟测试启动 Electron 加载 better-sqlite3
- **THEN** @electron/rebuild 已按 Electron ABI 重建，模块加载不报 NODE_MODULE_VERSION 错误

### Requirement: 职责边界文档化
electron-ci 工作流 SHALL 在头部注释说明：Electron GUI 深度门禁由 gui-test.yml（同 ubuntu-latest + xvfb）承担；本 job 的 vitest 为 Linux 平台确定性回归，与 Quality Gate（windows）互补而非重复。

#### Scenario: 注释存在
- **WHEN** 查看 electron-ci.yml 头部
- **THEN** 注释包含 ubuntu-latest 迁移、linux 确定性回归、gui-test 边界与 ECS runner 不再必需四点

