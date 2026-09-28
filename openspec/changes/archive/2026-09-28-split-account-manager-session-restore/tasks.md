# Tasks: split-account-manager-session-restore

> 进度以本文件为唯一来源。勾选前必须实际执行并把输出留痕到 `.quality-gates.md`。

## 0. 前置

- [x] T0.1 隔离 worktree 已建且依赖就绪（`git worktree list` + `node scripts/verify-worktree-deps.js` rc=0）
- [x] T0.2 `openspec change validate split-account-manager-session-restore --strict` 通过

## 1. 特征测试（先于任何移动）

- [x] T1.1 在**未改动**的 `account-manager.js` 上为 6 个函数写特征测试：`restoreCookies`（逐条 set 参数默认值 / 部分失败计数与两条 warn / 不抛异常）、`restoreLocalStorage`（非对象与空对象短路、正常路径调 `executeJavaScript`）、`buildLocalStorageRestoreScript`（JSON 整体序列化，断言不出现字符串拼接注入形态）、`_electronSession`（electron 缺失/形状不符 → null）、`getAccountPartitionCookies`（accountId 非法 → `[]` fail-closed；session 形状不符 → `[]`；异常 → warn + `[]`；按 `isPlatformCookieDomain` 过滤）、`mergeCookies`（`name+domain` 去重、前者优先、非数组入参不炸）
- [x] T1.2 实测 T1.1 在改动前**全绿**，记录测试数与输出
- [x] T1.3 对 T1.1 至少 3 条做变异反证（改优先级 / 去掉 `isSafePathSegment` 校验 / 去掉失败计数），必须各自变红

## 2. 平移

- [x] T2.1 新建 `apps/desktop/electron/publishers/account-session-restore.js`：逐字搬入 6 个函数体（不改逻辑、不改日志前缀 `AccountManager`），文件头注释写明「从 account-manager.js 拆出」的两条理由（对齐 `account-name-write.js` 先例）
- [x] T2.2 新模块只 require 无环依赖：`../services/logger`（模块对象）、`@multi-publish/shared-utils/src/platform-definitions`；**禁止** require `./account-manager`
- [x] T2.3 `getAccountPartitionCookies` 的 `isSafePathSegment` 经 deps 注入；在 `account-manager.js` 调用点绑定，对外签名保持 `(platform, accountId)`
- [x] T2.4 `account-manager.js` 删除 6 个函数定义并改为引入；`module.exports` 名字集合与拆分前逐字一致（用一条断言比对导出名清单）
- [x] T2.5 新模块的 `test` 文件命名与位置符合本仓约定，且被 vitest 实际收集执行（必须看见它出现在通过清单里、测试数 >0，不接受只 `node --check`）

## 3. 验证

- [x] T3.1 T1.1 那套特征测试移动后仍全绿（同一组断言，一字不改）
- [x] T3.2 `pnpm exec vitest run electron/publishers/` 全绿
- [x] T3.3 desktop 全量回归；已知既有 flake（`feedback.test.js` EPERM symlink）须单独定责，不得认领也不得放行
- [x] T3.4 `node .github/scripts/check-max-lines.js` rc=0；记录 `account-manager.js` 行数变化与剩余余量；**不得**改基线数字掩盖
- [x] T3.5 结构合同锁生效：新模块 require 列表不含 `./account-manager`；`account-manager.js` 内不再出现这 6 个函数定义
- [x] T3.6 QM-1 本地打包 —— 证据：`.quality-gates.md` 本单记录行「QM-1 打包 | PASS」（先 build:vue 再 --dir --config.electronDist）
- [x] T3.7 QM-6 —— 证据：同记录行「QM-6 双模型外部评审 | 部分完成（如实登记）」：claude 0 Critical/1 Warning/8 Info 并采纳 2 条；opencode 因 wrapper external_directory 不可用，登记为降级而非谎称双模型通过
- [x] T3.8 QM-4 视觉 —— 证据：同记录行「QM-4 视觉回归 | N/A（已给判据）」：diff 全为 Node 侧 .js 与 markdown，无 .vue/.css

## 4. 收口

- [x] T4.1 文档回写 —— 证据：main 上 CHANGELOG 第 7 条「refactor(accounts): 会话凭证恢复侧从 account-manager.js 拆出」、learnings「纯平移重构的两个沉默失败面」、.quality-gates 本单记录均在位
- [x] T4.2 PR #2514 已合入 main（e2223ef8）。本单在 main 内容上重跑复验：「account-manager.js」1168 行、新模块「account-session-restore.js」132 行、特征测试 + 登录态回写测试共 31 例全绿（2 files passed）；并确认 account-manager 内保留的同名符号是 2 行委托 「sessionRestore.getAccountPartitionCookies(...)」（不含 fromPartition，故非重复实现）。
- [x] T4.3 已随本 PR 归档为 archive/2026-09-28-split-account-manager-session-restore，并把 2 条 ADDED Requirement 逐字并入 openspec/specs/desktop/spec.md（7 → 13 条，原字节逐字为前缀，raw 与 --ignore-cr-at-eol 同为纯插入）
- [ ] T4.4 登记第二步：资料刷新簇（`extractAccountInfo` 等，需同步改 `http-login-checker.js` 与 `account-manager-extract-info.test.js` 两处消费方）
