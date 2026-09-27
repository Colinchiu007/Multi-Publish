# 运维手册 · 账号云镜像同步（【同步云端】）

关联：`01-docs/PRD-CLOUD-ACCOUNT-SYNC-2026-09-27.md`（完整契约）、`docs/adr/0001..0006`（决策）、
`openspec/changes/add-cloud-account-sync/`（规格与任务清单）。
本文件只写**上线/回滚必须知道的运维事实**，功能行为以 PRD 为准。

## 1. 组件与依赖

| 组件 | 位置 | 新增依赖 |
| --- | --- | --- |
| 业务 API（云镜像面） | `packages/api-publish-engine/src/auth/publish-api-cloud-accounts.js` + `src/cloud-accounts/*` | 无新增第三方包（用 Node 内置 `crypto`） |
| 数据库 | PostgreSQL（`BUSINESS_DATABASE_URL`，库 `multi_publish_api`） | 迁移 `migrations/postgresql/005_cloud_accounts.sql` |
| 主密钥 | KMS 接口 `wrap/unwrap` | 生产必须托管；仓库内只有 `createLocalKms` 开发实现 |
| 运营开关 | ops-center `feature_flags` 表 + 运行时下发 | 种子新增 `account_cloud_sync`（默认关） |
| 桌面端 | `apps/desktop/electron/services/cloud-account-*.js`、`ipc-handlers/cloud-account.js` | 无 |

## 2. 发布顺序（必须按序，颠倒会出现可见故障）

1. **先迁移，后发 API**。
   `assertReady()` 现对「未跑 005 的存量库」fail-closed：API 先上而迁移未跑，`/api/v1/ready` 会报
   `MIGRATION_PENDING` 而非静默降级，整个业务 API  readiness 变红。
   ```bash
   # 迁移（幂等；advisory lock 内先探测 identity_schema_migrations，最小权限口径）
   cd packages/api-publish-engine
   BUSINESS_DATABASE_URL=postgres://... node scripts/migrate-postgres.js
   # 校验 ledger 已含 005
   ```
   迁移角色**必须**具备 `SELECT` 既有 ledger 的权限；`005` 只需建表权限一次。
   回滚前须知：`005` 只新增表，不改动既有表，因此**回滚 API 镜像不需要回滚数据库**（旧版本 API 不认识新表即可）。

2. **配置主密钥（KMS）**。
   - 开发/本机：`MP_CLOUD_KMS_LOCAL_KEY`（64 位 hex，即 32 字节）。缺失或非法 → 构造期不抛错，
     首次使用时抛 `KMS_UNAVAILABLE`（503），且不写入任何明文。
   - **生产禁止使用 `createLocalKms`**：主密钥落进环境变量等于把整个镜像库的解密能力放在一台机器上。
     生产必须实现 `wrap(keyId, plaintext, aad)/unwrap(...)` 对接云 KMS（KMS 侧根密钥不可导出、按 `keyId` 轮转），
     并把 `keyId` 与审计日志绑定。轮转口径：AAD 绑 `keyId`，换 `keyId` 后旧信封**解不开**，
     因此轮转必须是「新写入用新 key、存量按需重加密」，不得直接替换根密钥。
   - KMS 不可用时接口返回 `KMS_UNAVAILABLE`，桌面端文案为「云端加密服务未就绪，本次未上传任何凭证」——
     这条路径**不会**把凭证以明文暂存在服务端，也不需要人工清理。

3. **Nginx 路由**。云镜像面在 `/api/v1/me/accounts*` 前缀下，必须落在业务 API 的
   `location /api/v1/` 反代内。按 AGENTS.md「Nginx 反向代理路由分离合同」，禁止用宽匹配
   `location /api/` 把 Logto 内部路径也导到业务 API；发布后必须跑
   `node packages/api-publish-engine/scripts/production-smoke.js` 验证路径守卫与鉴权未被打穿。

4. **打开功能开关（灰度）**。开关是**双条件**：`enabled = true` **且** `value = "true"`。
   运行时下发只取 `enabled=1` 的行并把 `value` 按 `value_type` 解析（见
   `ops-center/backend/services/feature_flag_service.py::list_runtime_feature_flags`），
   只把 `enabled` 打开而 `value` 仍是 `"false"`，桌面端拿到的仍是 `false`。
   ```text
   运营中心 → 功能开关 → account_cloud_sync
     value_type = boolean
     value      = true
     enabled    = true
   ```
   该 key 已进 `SEED_FLAGS`，存量部署会在下次启动时**增量补齐**（只补缺行、不改运营已改过的行）。
   桌面端在拿到运行时策略后才渲染【同步云端】按钮；拿不到 = 不显示（默认关）。

5. **打开顺序建议**：单个内部账号 → 观察服务端日志与 `credential_digest` 一致性 → 小流量 → 全量。
   回滚 = 关掉 `account_cloud_sync`（按钮即消失，已在途批次会在当前条完成后自然收口），无需回滚 API 或数据库。

## 3. 可观测性与排障

| 现象 | 第一落点 | 判读 |
| --- | --- | --- |
| 按钮不出现 | ops-center 运行时下发（`opsCenterSyncRuntime` 的 `featureFlags.account_cloud_sync`） | 双条件都满足才为真；缺键按关处理 |
| 摘要区显示「无法获取云端账号信息」 | API 日志 `CLOUD_ACCOUNTS_NOT_CONFIGURED` / `BUSINESS_USER_REPOSITORY_NOT_CONFIGURED` | 业务库未接或迁移未跑 |
| 每条都 `kmsUnavailable` | `KMS_CONFIG_INVALID` / `KMS_UNAVAILABLE` | 主密钥未配或与 `keyId` 不匹配 |
| 个别账号「未能确认账号身份，已跳过」(`uid-unavailable`) | `apps/desktop/electron/publishers/platform-uid.js` 的三通道（json/html/cookie） | 该平台本轮没拿到可信 `platform_uid`，**不上行**（不做猜测合并） |
| 「云端未接受该账号」 | 服务端逐条 `results[i].errorCode` | 原始码只进该行 `data-error-code` 属性，界面上不直出；按码查 PRD §7.5 码表 |
| 长时间停在「同步中 x/y」 | 并发 3、单账号 20s、整批 180s（`MP_CLOUD_SYNC_CONCURRENCY` / `MP_CLOUD_SYNC_ACCOUNT_TIMEOUT_MS` / `MP_CLOUD_SYNC_TOTAL_TIMEOUT_MS`） | 超时按失败计入，不重试；调参只在排障时用 |

日志红线：主进程与服务端都**禁止**打印凭证内容或明文信封字段（`iv/ciphertext/tag/encryptedDataKey`）。

## 4. 数据边界与合规

- 上行只含白名单字段（`ACCOUNT_FIELD_NOT_ALLOWED` 契约）+ **明文凭证过 TLS**；
  `credential_digest` **只由服务端计算**，桌面端提交的同名值一律丢弃（防两侧口径漂移）。
- **下行同样携带明文凭证**（`POST /sync` 由服务端解密后回传，PRD §7.3）。这决定了三件运维事实：
  1. 该端点的日志、代理与任何中间层**都不得缓存或记录响应体**。现在应用侧自己就把它声明死了：云账号面的
     **每一条**出站应答都带 `Cache-Control: no-store`（`publish-api-cloud-accounts.js` 的 `NO_STORE`，
     接在三处出线点上，新增路由自动继承），不再依赖"Nginx 恰好没缓存"这条运维巧合；代理与网关侧仍应保持
     `/api/v1/` 不缓存，但那是纵深防御而非唯一屏障。出站头由 `test/cloud-accounts-no-store.test.js` 以真
     HTTP 链路锁定（含反证：摘掉合并或摘掉 503 实参都会立刻变红）。
  2. 主密钥（`MP_CLOUD_KMS_LOCAL_KEY`）一旦泄露 = 全量凭证可解，其轮转与销毁流程必须在生产开启前落地；
  3. 解密 AAD 绑定 `(userId, platform, platformUid)`，即便仓储错返他人行也解不出明文（有回归用例）。
- 「断开云端」只删云端镜像与写墓碑，**不反向删除本机账号或本机凭证**；墓碑只阻止恢复，不阻止重新登录。
- 恢复回本机的账号登录状态强制 `unverified`，必须本机自证一次才可能变 `active`。
- **读不到云端全集的当轮一条都不上行**（PRD §7.3 fail closed）：宁可这一轮不同步，也不能凭空墓碑集合
  把用户已删除的账号复活——运维若看到某用户"同步一直失败且码为 `CLOUD_ENVELOPE_INVALID`/`SYNC_TIMEOUT`"，
  应查网关与业务 API 版本，而不是让用户重复点击。
- 用户同意点：弹窗的隐私提示行（`cloudDigestPrivacy`）在摘要态恒显示，首次同步前必然被看到。

## 5. 本期**未执行**的运维事项（如实登记，不得当作已完成）

- 生产 ECS 发布与 `production-smoke.js` 实跑：**未执行**（无可用的生产目标）。
- 真机 Electron 内 IPC 往返 → **部分执行（2026-09-27）**：五个云镜像通道在真实窗口里全部可达，
  信封形状、fail-closed 语义、二次确认守卫、空闲中止、进度不发虚均已实测（PRD §16.2）。
  **成功路径仍未执行**：线上构建不含该面，且本机第二实例的后端端口 8299 固定、被第一实例占用，
  绑定失败后无限重启 ⇒ 读到的 `localCount` 来自别人的后端。要有真机成功链证据，须先部署带云镜像面的
  业务 API（或本机起一套业务 API + Postgres + 同一 Logto 租户）。
- ~~八平台 `platform_uid` 线级取证 **未执行**~~ → **2026-09-27 已执行**（真机 Electron 主进程内、真凭证解密、
  出站层记录真实请求）。结论：合并键覆盖率实测 **2/8**（bilibili、toutiao 取到原生 uid），
  douyin/zhihu/xiaohongshu/wechat_mp 端点可达（含 200）但提不到可信身份属性，kuaishou 按
  `uidSource: cookie` 不发请求也未取到。全部走 `uid-unavailable` 跳过上行，未污染合并键。
  细节与逐平台表见 PRD §16.1。附带发现：wechat_mp 真源写 `active` 而线级证据是 `loginpage → 302`，
  属登录判定家族的既有问题，已登记。
- 生产 KMS 实现：仓库内只有 `createLocalKms`（开发/测试用），**生产实现尚未编写**。
  在这一项落地前，本特性不得对真实用户开启。
- 视觉基线：`accounts-list` 视图因命令栏新增按钮必然产生 diff；基线只能取自 CI 产物后回填（QM-4 第 7 条），
  本 PR 内**未回填**。
- **生产网关的缓存行为：2026-09-27 实测，结论是「线上还没跑到本特性」，不是「验证通过」**。对已部署实例做只读探测（不带任何凭证）：
  | 请求 | 结果 | 读法 |
  | --- | --- | --- |
  | `GET /api/v1/health` | `200`，body `{"status":"ok","version":"1.0.0","platforms":10}` | 业务 API 活着，nginx `1.24.0` 在前 |
  | `GET /api/v1/me/accounts/digest` | `401 Valid API key required`，**响应头没有 `Cache-Control`** | 该面走的是通用 Key 鉴权短路，云账号面与 `applyCloudAccountNoStore` 前置守卫都不在场 ⇒ **部署的构建早于本特性** |
  | `GET /api/users` | `401 auth.authorization_header_missing`（Logto 的错误体形状） | nginx 路由分离合同生效：`/api/v1/` → 业务 API，其余 → Logto |
  | `GET /api/v1/ready` | `200`，`database/schema/oidc/jwks/introspection` 全 ready | 部署侧身份链完整 |

  口径：`no-store` 是**应用合同**，只有部署后从线级证据才能确认生产网关没把它吃掉；本轮拿到的是"尚未部署"的证据，
  因此「生产网关缓存行为」这条**仍开放**，且必须排在「生产 ECS 发布」之后做（顺序见 §2）。
  部署后复跑：`curl -sSD- -o /dev/null https://<host>/api/v1/me/accounts/digest | grep -i cache-control`，
  期望在 401 上就能看到 `no-store`（守卫在鉴权之前），看不到即说明部署的仍是旧构建或 nginx 改写了头。
- 主进程侧新增一条可观测信号（`cloud-sync-residuals`）：恢复成功后写登录态失败会落 `restore-status-failed ... reason=<reason>`。
  此前这类失败**完全静默**（返回值被丢弃，只有 throw 才记日志），所以线上看到这条 warn 不是新故障，是新暴露的旧断链；
  它意味着该账号的 `unverified` 没有落进真源，下一次定期检测的结论将决定它的显示状态。
- ~~`POST /api/v1/me/accounts/sync` 的响应现在含明文凭证，**`Cache-Control: no-store` 未加**~~ → **已收口**
  （PR `cloud-sync-no-store`）：按本文件原设想落地——头加在 `_handleCloudAccounts` 的三处出线上，
  `_json` 只多一个可选参数、不全局加头；出站头由 `test/cloud-accounts-no-store.test.js` 以真 HTTP 链路锁定。原「在补上之前，本特性不得部署到任何会缓存响应的网关后面」这条前置条件随本项收口而解除。
- ~~`ipc-handlers/cloud-account.js` 无直接单测~~ → **已补**（`ipc-handlers/cloud-account.test.js`，20 例）：
  五种「身份取不到」形态逐条断言**服务层零调用**、四条通道拒外部 sender、异常不逃逸、`confirm` 不臆造、
  `apiClient` 缺失时保持 `null`、广播静默失败不阻断。三条变异反证见 CHANGELOG「测试」段；
  **仍待做**：真机 Electron 窗口内的 IPC 全链路往返（与下方 flag 开启态基线是同一轮 dogfood）。

CI 侧已有的等价证据：`business-api-postgres` job 用真实 PostgreSQL 16 跑 dry-run + apply + 断言 `005` 进 ledger +
幂等重跑 + 真 SQL 用例，这是「迁移可用」的证据，**不等于**上面任何一条已执行。
