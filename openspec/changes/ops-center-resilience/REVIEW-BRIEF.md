# QM-6 外部双家族评审请求：运营中心远程化韧性（ops-center-resilience）

仓库（隔离 worktree，请直接读文件）：
`D:\Data\projects\mp-worktrees\mp-ops-center-resilience-impl`
分支：`ops-center-resilience-impl`（**未提交**，改动在工作区。用 `git status` / `git diff` 看全貌）

## 这次改了什么（一句话）

让桌面端在**连不上运营中心**时仍可用（L1内存→L2本地快照→L3打包种子三层降级），
不让网络抖动误伤付费用户（权益宽限期），并让运营方**能验证配置是否真的生效**
（config_version + config_hash + 客户端 ACK + 生效聚合）。

契约单一真源：`openspec/changes/ops-center-resilience/design.md`
PRD：`01-docs/PRD-OPS-CENTER-RESILIENCE-2026-10-08.md`

## 重点评审文件

**服务端（Python）**
- `ops-center/backend/services/runtime_service.py`（`RUNTIME_BLOCKS` / `compute_config_hash` / `resolve_config_version`）
- `ops-center/backend/services/resilience_service.py`（新增：ACK / 降级事件 / 生效聚合，含全部入参校验）
- `ops-center/backend/routers/runtime.py`（新增 `POST /api/v1/runtime/ack`、`GET /api/v1/runtime/rollout`）
- `ops-center/backend/routers/telemetry.py`（新增 `POST /api/v1/telemetry/degradation` + summary）
- `ops-center/backend/models.py`（新增 3 张表）
- `ops-center/backend/tests/test_runtime_resilience_api.py`（47 项）

**客户端（JS）**
- `apps/desktop/electron/services/ops-runtime-snapshot.js`（新增：L2/L3 + canonicalJson/config_hash 单一真源 + 种子校验）
- `apps/desktop/electron/services/ops-resilience-reporter.js`（新增：降级队列 + ACK + 失败分类）
- `apps/desktop/electron/services/ops-center-sync.js`（**只做接线**）
- `apps/desktop/electron/services/identity/entitlement-service.js`（**唯一改动 fail-closed 语义的地方**）
- `apps/desktop/package.json`（`build.files` 增加 `resources/**/*`）
- `.github/scripts/check-ops-seed.js` + `.test.js`（种子门禁 + 接线锁）

## 请重点挑这些刺

1. **权益宽限期的安全边界**（`entitlement-service.js` 的 `_applyGrace`）：
   - 判据真的是「**没拿到有效响应**」而不是「请求失败」吗？有没有哪条路径让**已停用/已退订**的账号借宽限继续用？
   - 它用 `verifyEntitlementToken(token, { now: exp - 1 })` 让过期令牌走既有验签路径。这个手法有没有可被利用的地方？
   - 72h 宽限 + `source='grace'` 禁 `onlineOnly`，够不够？

2. **跨端契约**：`compute_config_hash` 的 Python 与 JS 两份实现（`runtime_service.py` 与 `ops-runtime-snapshot.js`）是否真的一致？
   有没有哪条输入会让两边算出不同 hash（数字格式、Unicode 归一化、缺键处理、NaN…）？

3. **SQLite 并发**：`resolve_config_version` 每次 bootstrap 都写库（版本号自愈式分配）。
   - 高并发拉取下会不会爆唯一约束？降级路径吞异常会不会掩盖真问题？
   - 每次 GET 都写库合理吗？

4. **种子会进安装包**：`content_policy.word_list` 被剔除即可，但还有没有**别的**字段不该进包（密钥、限流、封号名单、用户数据、URL/内网拓扑）？

5. **ACK/降级遥测**：客户端会不会把打不上的数据无限重试？队列有没有上限？断连期会不会误报/漏报？

6. **测试有效性**：有没有「断言恒真 / 夹具替对方剥壳 / 只测 mock 不测真实路径」的伪保护？
   特别看 `ops-center-sync.resilience.test.js` 的夹具顺序是否与 `bootstrap/phase1-context.js` 的生产顺序同构。

7. **破坏性变更**：bootstrap 响应新增两个字段会不会影响旧客户端？`getRuntimeState()` 的 IPC 契约动了吗？

## 输出格式

按仓库 CTO 评审口径分类输出，每条必须带 `文件:行号` 与具体修复建议：

```
🔴 CRITICAL | 文件:行号 | 描述 | 修复建议
🟠 MAJOR   | 文件:行号 | 描述 | 修复建议
🟢 MINOR   | 文件:行号 | 描述 | 修复建议
```

**不要客气，不要为了平衡而凑数**；没问题就明说没问题，但请说明你**实际验证过什么**（读了哪些文件、跑了哪些命令）。
不要修改任何文件，只评审。