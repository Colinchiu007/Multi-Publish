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
   - **生产：`MP_CLOUD_KMS_KEYRING`（密钥环 JSON 文件路径，ADR-0007）**。服务端读取的唯一口径是
     `createKmsFromEnv()`：配了环路径 ⇒ 密钥环（支持轮转）；没配 ⇒ 退回 `MP_CLOUD_KMS_LOCAL_KEY`
     开发单密钥，并落一条 `KMS_LOCAL_ONLY` warn（静默跑在单密钥上 = 「生产必须有 KMS」这条前置条件没人看得见）。
     **「配了但值为空白」不等于「没配」**：`MP_CLOUD_KMS_KEYRING=` 或全空格一律当场 `KMS_CONFIG_INVALID`。
     早先按 `env[KEYRING_ENV] || ""` 判空会让一次空值赋值静默退回开发单密钥 —— 那是 PRD §8.4 明令禁止的
     「降级成用固定密钥」，而现场只剩一条 warn。回归锁 `test/cloud-accounts-keyring-hardening.test.js` H1。
     环缺失 / JSON 坏 / `activeKeyId` 不在 `keys` 里 / 密钥不是 32 字节 hex ⇒ 同样构造期 `KMS_CONFIG_INVALID`。
   - ~~生产必须对接云 KMS；换 `keyId` 后旧信封解不开，因此轮转必须是「新写入用新 key、存量按需重加密」~~
     → **2026-09-27 按 ADR-0007 纠正**：那段写于只有 `createLocalKms` 的时期，两个判断都已过时。
     其一，生产实现现在就是仓库里的文件密钥环，**不需要**外部云 KMS（抽象层只有 `{wrap, unwrap}` 两个方法，
     将来接 Vault / 阿里云 KMS 只换 provider，`envelope-crypto.js` 一行不用改）。
     其二，「换 key 后旧信封解不开」的根因是**旧实现没有记录信封用的是哪把密钥**；密钥环把 key id 前缀写进
     `encryptedDataKey` 自己，因此轮转是无损的：新写入用新 active、存量按各自登记的 id 解，
     **旧密钥永远不得从环里删除**（删了才等于销毁数据）。存量重加密由此不再是轮转的前置条件。
   - **生效时机**：KMS 实例在首次使用时构造并永久缓存，轮转后**必须重启业务 API 进程**，新写入才用新 active。
   - **权限与并发**：环文件与其临时文件必须以 `0600` 创建（属主 = 服务运行账户 UID `1001`），POSIX 下 rename 后
     fsync 父目录；轮转用 `proper-lockfile` 互斥，竞争即 `KMS_KEYRING_LOCKED` 且不写盘。
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
- 真机端到端（真实业务库 + 真实 Logto 身份 + 真实第三方平台凭证）同步一轮：**未执行**。
- 八平台 `platform_uid` 线级取证（小红书/知乎 SSR 是否真直出身份属性、快手 `userId` 是否等于平台原生主键）：
  **未执行**；未取到可信 uid 的平台走 `uid-unavailable` 跳过上行，不会污染合并键。
- ~~生产 KMS 实现尚未编写~~ → **已落地（2026-09-27，ADR-0007）**：文件密钥环 `src/cloud-accounts/keyring-kms.js`
  + 轮转 CLI `scripts/rotate-cloud-kms-key.js`。仍**未在生产现场执行**下列步骤，因此"本特性不得对真实用户开启"
  这条前置条件要到 §5.1 的 SOP 真跑过一遍之后才解除。

### 5.1 主密钥初始化与轮转 SOP（生产，逐条实测后才算完成）

`<ring>` 指部署机上 UID `1001` 可读的持久卷路径，例如 `/var/lib/mulpub/cloud-kms-keyring.json`。

1. **初始化**（一次性）：生成一把 32 字节随机密钥并写成第一版环，`activeKeyId` 取一个有名字的事件标签
   （如 `2026-09`）。为什么不自动生成日期标签：轮转必须是一次可被追溯命名的事件，出事故时要能回答
   "这批信封是哪次轮转之前写的"。
   环必须 **0600 / 属主 = 服务运行账户**（`writeKeyringFile` 建临时文件时就以 `wx` + `0o600` 创建，
   rename 会把这份权限带到目标；Linux 默认 umask 022 下"先建后 chmod"会留一个全局可读窗口）：
   ```bash
   install -d -o 1001 -g 1001 -m 750 /var/lib/mulpub
   install -o 1001 -g 1001 -m 600 /dev/null /var/lib/mulpub/cloud-kms-keyring.json
   # 再用一次性脚本写入第一版内容。**不要用 root 跑初始化或轮转** —— 写出 root 属主后服务读不到自己的密钥环
   ```
2. 把 `MP_CLOUD_KMS_KEYRING=<ring>` 写进服务环境，重启；`GET /api/v1/ready` 必须仍 ready，
   且日志里**不得**出现 `KMS_LOCAL_ONLY`（出现了就说明路径没生效，仍在单密钥上跑）。
   若这一行配成了空值，服务会在构造期直接 `KMS_CONFIG_INVALID`——这是设计行为，不是回归。
3. **备份环文件**（与 `.masterkey` 同级纪律）：环丢了 = 全部云端凭证不可解，且无法通过重加密救回。
   权限按第 1 步收敛；备份副本同样 0600、放在服务账户之外、**不进仓库**。
4. **轮转**（定期 / 密钥疑似泄露 / 人员变动时）：
   ```bash
   node packages/api-publish-engine/scripts/rotate-cloud-kms-key.js --ring <ring> --key-id 2026-10 --dry-run
   node packages/api-publish-engine/scripts/rotate-cloud-kms-key.js --ring <ring> --key-id 2026-10
   ```
   先演练（`--dry-run` 与真跑同一把校验口径、**一个字节都不写**；选项值缺失或被下一个 flag 顶替一律报错——
   否则 `--key-id --dry-run` 会被读成"用 `--dry-run` 当密钥名"并真的执行一次轮转），再执行。
   **生效时机**：服务端的 KMS 实例首次使用时构造并永久缓存，所以轮转之后正在跑的进程仍会用旧 active
   继续封装，**必须重启业务 API 进程**才切换。这不是数据风险（旧 key 不删 ⇒ 新旧信封都解得开），
   但"轮转完就以为换完了"是运维误判，CLI 输出里也写了这条提示。
   **旧密钥永远不得从环里删除** —— 它是解开旧信封的唯一途径。
   **并发轮转必须避免**：轮转是 read-modify-write，`rotateKeyring` 用 `proper-lockfile` 锁住环文件，
   竞争者直接 `KMS_KEYRING_LOCKED` 失败且不写盘（后一次 rename 整把丢掉前一次的新密钥 = 那批信封永久不可解）。
5. **轮转后验收（必做，不可省略）**：挑一个在**上一次轮转之前**镜像上去的账号，
   走一次 `POST /api/v1/me/accounts/sync` 取凭证，必须返回该凭证而不是 `CREDENTIAL_DECRYPT_FAILED`。
   这一步是唯一能证明"旧信封仍可解"的现场证据；单测锁住了实现，锁不住"生产用的其实是另一份环"。
6. 失败回滚：把轮转前的备份文件放回原路径并重启即可（信封里登记的是写入当时的 key id，
   回滚不需要改数据库）。

回归锁：`test/cloud-accounts-keyring-kms.test.js`（15 例，含"轮转后用真 envelope-crypto 跑一整轮、
旧信封仍解得开"）、`test/cloud-accounts-keyring-hardening.test.js`（10 例，评审 4 条 Critical 的逐条锁：
空白配置不降级 / 0600 权限 / 轮转持锁 / DK 清零 + 信封前缀字节边界）、
`test/cloud-accounts-kms-rotate-cli.test.js`（7 例，含 `--dry-run` 零写入与 flag 吞值）。
- 视觉基线：`accounts-list` 视图因命令栏新增按钮必然产生 diff；基线只能取自 CI 产物后回填（QM-4 第 7 条），
  本 PR 内**未回填**。
- ~~`POST /api/v1/me/accounts/sync` 的响应现在含明文凭证，**`Cache-Control: no-store` 未加**~~ → **已收口**
  （PR `cloud-sync-no-store`）：按本文件原设想落地——头加在 `_handleCloudAccounts` 的三处出线上，
  `_json` 只多一个可选参数、不全局加头；出站头由 `test/cloud-accounts-no-store.test.js` 以真 HTTP 链路锁定。原「在补上之前，本特性不得部署到任何会缓存响应的网关后面」这条前置条件随本项收口而解除。
- ~~`ipc-handlers/cloud-account.js` 无直接单测~~ → **已补**（`ipc-handlers/cloud-account.test.js`，20 例）：
  五种「身份取不到」形态逐条断言**服务层零调用**、四条通道拒外部 sender、异常不逃逸、`confirm` 不臆造、
  `apiClient` 缺失时保持 `null`、广播静默失败不阻断。三条变异反证见 CHANGELOG「测试」段；
  **仍待做**：真机 Electron 窗口内的 IPC 全链路往返（与下方 flag 开启态基线是同一轮 dogfood）。

CI 侧已有的等价证据：`business-api-postgres` job 用真实 PostgreSQL 16 跑 dry-run + apply + 断言 `005` 进 ledger +
幂等重跑 + 真 SQL 用例，这是「迁移可用」的证据，**不等于**上面任何一条已执行。
