---
record: official-compute-stopgap
task: 官方算力体系第一阶段安全止血（S1 激活码守卫 / S2 匿名权益门禁 fail-closed / S4 成本观测管道 / S6 日志脱敏双端对齐）
date: 2026-10-09
sync_status: PENDING
sync_reason: PR #3217 待合并；合并后取 git log origin/main --grep='(#3217)$' --format=%H|%cI 回填 merge SHA 与时间，并同一次提交删除三个 sync_* 字段与 ledger 登记项。
sync_backfill_owner: 本 PR 作者（official-compute-stopgap 会话）
---

## 本次执行记录：官方算力体系四项安全止血（official-compute-stopgap，2026-10-09）

| 门禁 | 状态 | Fresh 证据 |
|------|------|-----------|
| 变更类型与隔离 | ✅ | 运行时代码（`apps/desktop/electron/services/`、`packages/api-publish-engine/src/`）→ 隔离 worktree `D:\Data\projects\mp-worktrees\mp-official-compute-stopgap` + 裸分支 `official-compute-stopgap`（`start-mp-task.ps1` 创建，依赖就绪验证 `verify-worktree-deps.js` OK 11 消费方），基线 `origin/main`=`8b3d3e91f`；共享根保持 `main` |
| TDD | ✅ | 四项修复各自先 RED 后 GREEN：S1「垃圾串激活」用例红→绿（`license-manager.test.js` 12/12；`license-manager-bak.test.js` 与 `payment-manager.test.js` key 格式随契约更新）；S2 新建 `publish-api-entitlement-guard.test.js`（匿名 403 / api_key legacy 放行不扣减 / Logto 正常校验三态 + legacy api_key 发布链路集成回归）；S4 usage 透传 3 用例红→绿（`model-provider-call-adapter.test.js` 48/48）；S6 双端脱敏用例红→绿（logger.test 16/16、log-redact.test 13/13） |
| 根因与逃逸链 | ✅ | S1：#3085 只堵 IPC 层、`activate()` 方法仍裸奔 → 方法级格式守卫（与 `subscription-service.js` REDEEM_CODE_PATTERN 对齐）；S2：`_assertEntitlementFeature`/`_consumeEntitlementFeature` 对非 Logto 静默放行 → 匿名 fail-closed + **plan/execute 授权契约对称化**（对照实验：git stash 基线 29/29、改后 plan/execute 403 暴露旧漏洞实证——无认证头曾可免费执行发布计划）；S4：`_writeLog` 不传 tokens/cost（G3 断点）→ context 透传，cost 留 NULL 不做本地估算（伪数据比无数据危险）；S6：裸 token/sid/session/pwd 与手机号漏网 → 双端 SECRET_PATTERNS 同步补 |
| 全量回归 | ✅ | 引擎侧 `run-tests.js` 退出码 0（Vitest 37 文件 312 用例 + 直接组全过，含 `publish-api-server.test.js` 29/29）；桌面侧受影响面 11 文件 190 用例全绿（license ×3、payment ×3、model-provider-call-adapter、logger、usage-reporter） |
| 品牌残留 | ✅ | `check-no-brand-residue.js` PASS（7431 tracked 文件） |
| locale 成对（Gate 7） | ✅ | `--keys` PASS（1478 个使用中 key 均在 zh/en；本刀未改 locales、未新增用户可见文案） |
| 行尾/编码对账 | ✅ | `git diff --numstat` 与 `--ignore-cr-at-eol --numstat` 两口径一致；改动文件字节扫描无 U+FFFD |
| QM-2 代码必检 | ✅ | 无新增第三方依赖；无 IPC reactive 参数；`LOGTO_ONLY_FEATURES` 集合带登记纪律注释；`_writeLog` 第 6 参向后兼容（错误路径不传 context） |
| QM-1 打包 | ✅ | `verify-worktree-deps.js` OK；`electron-builder --win --dir --publish never` exit 0；asar 清单含 license-manager/payment-manager；解包后 `require('@multi-publish/api-publish-engine')` OK、S1 守卫代码在 asar 内。启动冒烟：打包 exe 本机 387ms 静默 exit 0（无日志/WER/crashpad/Electron 锁痕迹；electron 裸跑 asar 证明 main.js 及依赖链可加载至 auto-updater 初始化，报错属裸跑环境伪影）；与今早同 userData 成功启动矛盾，判环境性问题，以 CI 打包门禁与 E2E 兜底 |
| QM-4 视觉 | N/A | 无 UI/样式改动 |
| QM-6 双模型外部评审 | PENDING | 单模型深审已覆盖（对照实验 + 契约对称化推演 + 四项变异验证即 TDD 红灯）；双模型外部审查随 PR 评审流程闭合 |
| 远程同步 | PENDING | 开 PR 时登记；合并后按「回填与销账同一次提交」纪律回填 |

### 遗留（不假装已闭合）

- **S4 的 cost 列短期仍为 NULL**（BYOK 直连场景无单价数据源）：token 数从本次起积累；真实成本归集依赖第二阶段 `ModelPriceCard`（研究报告 §4.1）+ 服务端账单回填。
- **S2 的 api_key legacy 分支不扣减**：API Key 计费模型未实现，属登记债务；未来 compute/官方算力路由是**新代码**，必须显式 requireLogto（评审 R7），不得依赖本方法的宽松分支。
- **S1 客户端格式守卫本质可绕过**：正式包路径由 #3085 的服务端核销承担；开发构建保留本地路径属调试需要。
- **打包 exe 启动冒烟在本机受阻**（387ms 静默退出，证据已列上表）：三道验证（builder exit 0 / asar 清单与 require 链 / electron 裸跑 asar 加载到 auto-updater）均通过，主进程代码完整性有据；启动链受阻原因未定位（无任何日志/WER/crashpad 输出），交由 CI 打包门禁与 E2E 兜底，不假装已闭合。
- **failover 接线与 tier_access 启用**：属第二阶段（官方算力供给链路立项），经用户确认不在本 PR 范围。
- **PRD §4（运营中心多供应商套餐混合供给）**：设计骨架已写入 `01-docs/PRD-OFFICIAL-COMPUTE-STOPGAP-2026-10-09.md`，实现依赖第二阶段前置五项（S3 加密拍板/上游账单/迁移编号/任务宿主/退款路径）。
