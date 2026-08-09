# Proposal: electron-tests 迁移到 GitHub 官方 runner（A/B/C）

## Why

electron-tests（electron-ci.yml）当前跑在阿里云 ECS 自托管 runner（`[self-hosted, linux, x64]`）上，带来三个问题：① 单机排队——PR 的 electron-tests 常 queued 30-40 分钟拿不到 runner；② 生产隔离——该 ECS（39.105.42.85）同时承载 Logto + 业务 API，20 分钟全量测试 + Electron 与生产服务抢资源；③ 运维成本——dnf 依赖、xvfb、runner 更新、磁盘水位均需维护。而 gui-test.yml 已在 GitHub ubuntu-latest 上用 xvfb 跑通 Electron GUI 门禁，证明 GitHub 官方 runner 完全可承载。

## What Changes

- A（迁移）：`electron-ci.yml` `runs-on` 改为 `ubuntu-latest`；系统依赖 `dnf`→`apt`（安装 xvfb + build-essential）；新增 `@electron/rebuild better-sqlite3`（Electron ABI 原生模块，gui-test 既有步骤）；timeout 30→45；保留 checksum pin、npmmirror 镜像、`SKIP_NATIVE_MEDIA_TOOL_TESTS=1`、单 worker vitest、xvfb 冒烟、失败诊断、build vue、check:deps/check:circular。
- B（职责精简与文档化）：工作流头注释明确职责边界——本 job 是「Linux 平台确定性回归（跨平台互补）」，与 Quality Gate（windows 全 workspace 单测）互补而非重复；Electron GUI 深度门禁归 gui-test。
- C（验证与收尾）：以本 PR 自身 CI 运行作为迁移验证（新 electron-ci 在 ubuntu-latest 上跑全流程）；ECS 自托管 runner 保留配置但不再必需，注明可移除。

## Capabilities

- **New Capabilities**: `ci-electron-github-runner`（CI 运行环境迁移契约：GitHub 官方 runner 承载 electron-tests 的条件与边界）

## Impact

- 代码：`.github/workflows/electron-ci.yml`（运行环境/系统依赖/原生模块重建）
- 文档：CHANGELOG、learnings
- 无产品代码变更；无 secrets/内网依赖（npmmirror 为公网）；无 workflow 契约测试锁定旧结构
