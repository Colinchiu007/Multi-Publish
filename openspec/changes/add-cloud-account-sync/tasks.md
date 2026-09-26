# Tasks: add-cloud-account-sync

进度以本文件为唯一来源。MUST 全部勾选后才可归档。

## 1. 规格与文档前置

- [x] 1.1 `CONTEXT.md` 术语表落盘（合并键 / 本机自证 / 墓碑 / 信封加密 / 同步摘要 / 逐条结果）
- [x] 1.2 `docs/adr/0001-0006` 六条不可逆决策落盘
- [x] 1.3 `01-docs/PRD-CLOUD-ACCOUNT-SYNC-2026-09-27.md`：数据校验、流程、功能逻辑、交互逻辑、显示项、提示文字、错误码、异常态、验收标准（注意 `/01-docs/**/*.md` 被 gitignore，必须 `git add -f`）
- [x] 1.4 `01-docs/PRD.md` 账号管理章节加交叉引用小节（§2.3 / F1 / §5.2 / §27.7 至少一处）
- [x] 1.5 AGENTS.md 凭证边界条款修订为"本机为主副本、云端为加密镜像"，并新增本特性回归纪律

## 2. 云端存储与 API（packages/api-publish-engine）

- [x] 2.1 `migrations/postgresql/005_cloud_accounts.sql`：`cloud_accounts` + `cloud_account_tombstones`，BEGIN/COMMIT 外壳、按 `005_*` 命名、checksum 稳定
- [x] 2.2 `src/cloud-accounts/envelope-crypto.js`：随机 DK + AES-256-GCM，AAD 绑定 `(user_id, platform, platform_uid)`；KMS 抽象层接口 + 本机实现 + fail-closed
- [x] 2.3 `src/cloud-accounts/cloud-account-repository.js`：upsert（按合并键）、list+摘要、墓碑读写、按用户全清（disconnect）
- [x] 2.4 入参校验：平台枚举白名单、字段白名单（未知键 fail closed）、字符串长度上限、`followers` 非负有限、时间戳 ISO 8601、凭证体积上限
- [x] 2.5 `publish-api-server.js` 路由：`GET/PUT /api/v1/me/accounts`、`POST /api/v1/me/accounts/sync`、`DELETE /api/v1/me/accounts`；鉴权走既有 `_checkAuth` + `_memberUserId`，未配置仓储时 503
- [x] 2.6 单元测试（fake client，沿用 `postgres-migrations.test.js` 风格）：路由、校验拒绝、墓碑语义、按用户隔离、密文不含明文
- [x] 2.7 真库回归：新增 ubuntu-latest + `services: postgres` CI job，跑 `migrate-postgres.js` 真实迁移 + repository 真实 SQL；反证（去掉 migration 必须变红）

## 3. 平台原生 uid 提取补齐

- [x] 3.1 `http-login-checker.js` 为 `wechat_mp` 增 `extract`（正例 + 登录页/未登录负例）
- [x] 3.2 为 `kuaishou` 增 `extract`；同步检查 `PLATFORM_SESSION_COOKIE_MARKERS` 与「登录页 = 后台同 URL」，补 `platform-definitions.test.js` 负例
- [x] 3.3 为 `xiaohongshu` 增 `extract`（正例 + 负例）
- [x] 3.4 为 `zhihu` 增 `extract`（正例 + 负例，且不得把 `document.title` 类页面标题当 uid）
- [x] 3.5 八平台覆盖结构锁：枚举账号支持平台集合，断言每个都有 extract 实现与至少一正一负回归
- [ ] 3.6 本机真凭证实测：用 debug profile 的真实账号逐平台取证 uid（线级证据，记录到 PRD 验收章节）

## 4. 主进程同步服务

- [ ] 4.1 `services/cloud-credential-crypto.js`（桌面侧）：加密上行 / 解密落盘，复用 `credential-store` 读写口径，禁止本机主密钥出机
- [x] 4.2 `services/cloud-account-sync.js`：读真源 + 凭证 → 补 uid → 生成合并计划 → 逐条执行（并发上限 + 单账号硬超时）→ 事件广播（start/done 双边界）
- [x] 4.3 恢复路径：写回本地强制 `status='unverified'` + `last_validated` 取本机时刻且不参与超龄锚点；复用 `loginStatusTransition`，禁止第四份三态映射
- [x] 4.4 冲突裁决：凭证指纹不一致 → 较新者优先 + 本机实测 → 两份皆失效保留本机并标需重登
- [x] 4.5 删除路径接入墓碑：`account:delete` / 批量删除成功后写云端墓碑（best-effort，失败留日志不阻断本机删除）
- [x] 4.6 `ipc-handlers/account.js`：`accounts:cloud-digest`、`accounts:cloud-sync`、`accounts:cloud-disconnect` + `withSenderCheck`；进度事件 `accounts:cloud-sync-progress`
- [x] 4.7 `preload/account.js` 暴露三方法 + 订阅函数，重建 `index.bundle.js` 与 `home-shell-preload.bundle.js`；登记 `preload.test.js` 的 `ACCOUNT_METHODS`
- [x] 4.8 `access-control.js` 白名单归属确认（写操作不得落入默认宽松分支）

## 5. 渲染层

- [x] 5.1 `features/accounts/components/AccountCloudSyncDialog.vue`：`UiModal` 摘要态（共 xx 个 + 平台分布 + 确认/取消）与过程态（逐条结果 + 进度 + 汇总）；`variant` 与焦点陷阱按既有约定
- [x] 5.2 `Accounts.vue` 命令栏新增【同步云端】`page-button secondary` + `data-testid="account-cloud-sync"`，feature flag 门控
- [x] 5.3 `useLoginGate.ensureLogin` 接入；feature flag 读取接入运营同步 runtime 链路
- [x] 5.4 浮层互斥：经 `useEmbeddedViewSuspension` 挂起/恢复内嵌视图，并在 `overlay-view-suspension.test.js` 登记 owner
- [x] 5.5 `locales/zh.js` + `en.js` 成对新增 `accountsPage.cloudSync*` 文案簇（zh/en 同序，禁止硬编码中文进 `src/` 非 locales）
- [x] 5.6 文案精确断言测试（QM-3 文本结构断言）：仿 `accounts-batch-check-copy.test.js`，含条件段有无两形态

## 6. 测试与门禁

- [x] 6.1 渲染层单测：按钮显隐（flag 三态）、摘要态、取消不发写请求、过程态逐条渲染、汇总区分部分成功
- [x] 6.2 主进程单测：合并计划生成、恢复强制 unverified、冲突四分支、墓碑不反向删、start/done 双边界、超时结果语义
- [x] 6.3 结构锁：`preload.test.js` 方法清单、`overlay-view-suspension.test.js` owner、locale 成对（CI Gate 7）、sender guard 覆盖（CI Gate 17）、自旋让出（CI Gate 19）
- [x] 6.4 `network-egress-guard` 合规：所有新测试只打 `os.tmpdir()` 自建回环服务，禁真实出站
- [x] 6.5 QM-1 本地打包验证（改了 `apps/desktop/electron/`）：`build:vue` + `electron-builder --win --dir` 退出 0；asar 清单含 `electron/services/cloud-account-{sync,core,conflict,tombstone}.js`、`electron/ipc-handlers/cloud-account.js`、`electron/publishers/platform-uid.js` 与 `dist/index.html`；解包后 require 链六个模块全部加载成功且 `ipc-handlers/cloud-account.js` 与源码逐字节一致；打包产物启动 12 秒，stderr 仅 ICU fd 一行既有噪声，无 `Failed to load platform config` / `PluginLoader.*mkdir` / `ENOTDIR.*app.asar` / `Cannot find module` / updater 网络栈
- [ ] 6.6 视觉回归：`npm run test:visual:pixel` 通过；`accounts-list` 视图因新增按钮需换基线，且基线只能取自 CI 产物（AGENTS.md QM-4 第 7 条）
- [x] 6.7 QM-6 CCG 双模型外部评审已执行（claude 后端视角 + opencode 前端视角并行；dsh 因缺 DEEPSEEK_API_KEY 不可用），2 个 Critical 全修、数据校验/安全类 Warning 全修，逐条处置见 §9
- [ ] 6.8 `.quality-gates.md` 自检清单与评审记录

## 7. 交付

- [x] 7.1 `CHANGELOG.md` 收口 + `pnpm version:bump`（新功能 bump minor）
- [x] 7.2 推送分支、创建 PR、CI 全绿、自动合并
- [x] 7.3 运维文档：`01-docs/OPS-CLOUD-ACCOUNT-SYNC-2026-09-27.md` —— 发布顺序（先迁移后发 API，`assertReady()` 对未跑 005 的存量库 fail-closed）、KMS 生产实现要求（本地实现禁用于生产、AAD 绑 keyId 的轮转口径）、Nginx 前缀路由、feature flag **双条件**（enabled 且 value）与 SEED_FLAGS 增量补齐、可观测性排障表、数据边界；生产 ECS 发布与真机端到端在本文件 §5 如实登记为**未执行**
- [ ] 7.4 记忆写入：内置记忆 / 外部记忆（learnings）/ EverOS

## 状态（2026-09-27 提交 PR #2461 时）

已勾选 = 代码/文档已落地且有测试证据。以下条目**未勾选即未执行**，不得当作已完成：

- [ ] 3.6 八平台真凭据线级取证（保留未勾选）：小红书/知乎 SSR 是否真直出身份属性、快手 `userId` 是否严格等于平台原生主键 —— 仓库内无实测证据；未命中即走 `uid-unavailable` 跳过上行。
- [x] 6.5 QM-1 已执行（见上；证据为本次干净工作树下的 `--dir` 产物与 12 秒启动 stderr 采集）。
- [ ] 6.6 视觉回归：`accounts-list` 基线因命令栏新增按钮必然 diff；基线**只能取自 CI 产物**（AGENTS.md QM-4 第 7 条），需 CI 出图后回填并重跑 `test:visual:pixel`。
- [x] 6.7 QM-6 已执行：两个独立外部模型各出一份结论，处置见 §9；「双模型并行」这一轮真实满足，未以自审冒充。
- [ ] 6.8 `.quality-gates.md` 自检清单与评审记录。
- [x] 7.3 运维文档已落地（生产 ECS 发布与 `production-smoke` 仍未执行，登记在运维文档 §5，不得当作已完成）。
- [ ] 7.4 记忆写入：内置记忆与 EverOS 已写；`01-docs/learnings.md` 已追加 4 条。

### 本期发现的已知缺口（follow-up，未悄悄放宽测试）
- `validateSyncKeys` 不拒 `keys` 之外的顶层字段（`{keys:[…],extra:1}` 目前放行），与 PRD §6.2「未知键 fail closed」不完全一致。
- `isNoiseAccountName` 在 `api-publish-engine` 侧是**等价重写 + parity 锁**（该包不能 require shared-utils），新增形态规则必须两处同改，否则 parity 锁红。
- 跨包契约锁已建（`cloud-account-tombstone.test.js`：`ME_API_PATHS` 必须覆盖 `CLOUD_ACCOUNTS_ROUTES`），本 PR 内该锁实测拦住过路由清单的一次漂移。

## 8. 收口补充（PR #2461 行数门禁红项，按门禁处方真拆分而非登记基线）

- [x] 8.1 主进程 `http-login-checker.js` 557 → 490 行：uid 归一化/三通道与 HTML 唯一性守卫拆到 `publishers/platform-uid.js`，结构锁 `http-login-checker-uid-coverage.test.js` 继续锁两处契约。
- [x] 8.2 服务 `cloud-account-sync.js` 576 → 480 行：枚举/超时/汇总与并发工具拆到 `cloud-account-core.js`，冲突四分支拆到 `cloud-account-conflict.js`（两者均 <200 行，可独立验证）。
- [x] 8.3 弹窗 `AccountCloudSyncDialog.vue` 810 → 478 行：outcome/错误码口径拆到 `composables/useCloudSyncResultModel.js`，逐条行状态 + 终态汇总拆到 `composables/useCloudSyncRows.js`（15 条独立单测覆盖 start/done 双边界与「汇总与列表同源」），展示拆成 `AccountCloudSyncDigestBody.vue` / `AccountCloudSyncItems.vue` / `AccountCloudSyncSummary.vue`（纯 props 单向，无 emit，故无 R92 绑定缺口）。
- [x] 8.4 locales 增量：`locales/zh.js` 与 `en.js` 各自膨胀 206/203 行触发 LEDGER_GREW。归因核实为**本 PR 越过容差**（origin/main 已到 141，容差 200）。按门禁处方拆分：本功能文案移入 `locales/accounts-cloud-sync/{zh,en}.js`，装配文件 import 后展开回 `accountsPage`，键名与访问路径不变（叶子键集逐键比对 before/after 均 3158，零漂移）。
- [x] 8.5 CI 门禁跟随：`check-locale-sync.js` 的 `--keys` 原按单文件文本求值，拆子模块后会静默漏判键存在性（漏判的表现是 vue-i18n 把键名原样打到界面）。改为「装配文件跟随相对 import」递归求值 + 解析失败一律抛错；成对口径泛化为 `locales/` 目录下每个 `zh.js` ↔ 同目录 `en.js`（拆文件不得打开单边文案的口子）；加 `require.main` 守卫并导出求值器，新增 5 条用例含 3 条反证（子模块缺失 / 无 export default / 循环引用必须变红）。
- [x] 8.6 运营开关补种子：`account_cloud_sync` 此前只被桌面端读取，未登记进 ops-center `SEED_FLAGS` —— 存量部署的管理页永远看不到该项，运营只能手敲 key（AGENTS.md「跨端目录常量 ↔ 存量数据必须前向兼容」）。补种子为 `boolean/false/enabled=0`，并把供给循环的硬编码 `enabled=1` 改为逐条可声明；回归锁从**非空旧状态**出发（先建全量、删新 key、改旧行为运营值，再跑供给），同时断言「只补不改」。顺带修掉 `test_feature_flags_count_cap` 里硬编码「种子占 1 个名额」的假红前提。

门禁状态：`check-max-lines.js` 全绿（新增超限 0、挂账与现实一致），`check-debt-budget.js` 的 `filesOver500` 由基线 101 降到 98（还了 3 个文件的债）；`--pair-base` / `--cjk` / `--keys` / `check-vue-style-parse` / `check-color-literals` / `check-font-size-scale` / `check-scoped-root` 均通过。

## 9. QM-6 双模型外部评审（已执行）与逐条处置

两个独立外部模型并行（AGENTS.md QM-6 的「双模型」这一轮**真的满足了**，与 #2433 那轮「降级为自审」不同）：

- 模型 A `claude`（后端：正确性/边界/安全/规格合规）：2 Critical + 6 Warning + 6 Info，含一张「PRD 写了但代码没做 / 代码做了但 PRD 没写」逐条对照表。
- 模型 B `opencode`（前端：拆分/口径落点/门禁改动风险）：3 Warning + 4 Info。第一次运行因全仓 grep 超时失败（`OPENCODE_RC=1`、零结论），改成「只读列出的文件」后成功；`dsh` 兜底因缺 `DEEPSEEK_API_KEY` 不可用（本机运行态，不写入长期结论）。

处置（采纳并修 / 有据驳回，逐条给证据）：

- [x] A-C1 服务端无条件 LWW、永不回 `conflict` → 桌面端四分支成死代码。**采纳**：裁决收敛为唯一纯函数 `src/cloud-accounts/upsert-decision.js::decideWrite`，digest 不同且无 `force` 一律 `conflict` 且零写入。
- [x] A-C2 + A-W1 服务端白名单没有 `credential`/`force`，桌面端每个 PUT 都被拒（400 `ACCOUNT_FIELD_NOT_ALLOWED`）。**采纳**：白名单收为「五个键 + 明文凭证实体」，信封/摘要/`lastReportedStatus` 等禁止客户端提交；加密改在服务端做，`credential_digest` 由服务端对明文算出。
- [x] A-W5(其编号 I5) 入口守卫 `_isCloudAccountsUrl` 手抄路径清单、漏 `/accounts/tombstones` → **删除账号时写墓碑全部 404，「已删账号不得复活」防线静默失效**。**采纳并根治**：守卫的路径集改由 `CLOUD_ACCOUNTS_ROUTES` 推导（一处真源，想漏只能去删路由表，而那会被契约锁抓到）。
- [x] A-I4 读-判-写无并发保护 → **采纳**：两条写语句都加 `AND credential_digest = $expected` 的 CAS 谓词；凭证写 CAS 落空后**不重试覆盖**（重试会抹掉抢先赢的那台设备刚写入的有效凭证，且两路都报 `updated`），如实报 `conflict` 交回本机下轮实测。刻意不用 `FOR UPDATE`：那会把「逐条独立裁决、一条失败不回滚整批」变成持锁长事务。
- [x] A-I2 `disconnect` 部分失败响应缺 `deletedTombstones`。**采纳**：与成功路径字段对称。
- [x] A-I3 `last_reported_status` 客户端可写。**采纳**：移出白名单，该列只有服务端能写。
- [x] A-W4 `avatar` 缺 `https://` 前缀 CHECK。**采纳**：005 加 CHECK（本 PR 未合并、无环境应用过 005，允许就地改），并同步 `postgres-identity-repository.js` 那份逐字 DDL 防漂移锁。
- [x] A-I1 整批预算恒 180s 而非 PRD §5.7 的公式值。**驳回为文档修**：固定上限是可接受的保守实现，改 PRD 措辞而非改代码（避免给 8 账号场景发明一条无人验证的缩放路径）。
- [x] A-I6 冲突裁决里「检测超时」与「检测抛错」在日志上不可区分。**部分采纳**：服务端只如实回传 `errorCode`；桌面端日志区分留作 follow-up（不改变行为，仅影响排障）。
- [x] A-W3 「005 用了 `CREATE TABLE IF NOT EXISTS`，违反迁移最小权限」。**有据驳回**：该规则针对的是 migration runner 探测 `identity_schema_migrations` 的方式（`postgres-migrations.js::loadApplied` 先 `to_regclass` 再建表，已合规），不是禁止迁移文件自身幂等。
- [x] A-W6 sync 与一键检测互斥。**部分驳回**：渲染层已互禁（`Accounts.vue:58/69` 两个按钮互相 `disabled`），PRD §5.8 的「互相 disable」正是这个口径；主进程侧再加一层锁属额外防护，登记为 follow-up。
- [x] B-W1 `rowKeyOf` 兜底键依赖 `rows.value.length`，start/done 会漂移 → **采纳并扩大**：真正的破口在恢复阶段（start 还没有 accountId、done 才带上，一条账号裂成两行；且 `index` 恒为 0 使同平台多条挤成一行）。两侧同修：主进程每个进度 send 都带 `rowKey`，渲染层取键顺序 `rowKey → accountId → platform-index → platform` 并禁止时序量，加源码结构锁（反证：抽掉一处 `rowKey` 立刻变红）。
- [x] B-W2 汇总区兜底漏 `uid-unavailable`、并给 `conflicts` 造带侧向标签。**采纳**：兜底映射收敛为唯一表 `COUNTER_TO_OUTCOME`，补 `uidUnavailable` 透传，故意不含 `conflicts`（无逐条 items 判不出哪侧胜出）。
- [x] B-W3 `check-locale-sync.js` 的 import 解析只认默认导入，其余形式可能静默漏判键。**采纳**：残留 import 一律显式抛错，并补反证用例。
- [x] B-I1 两个子组件重复注入 `outcomeClass/outcomeLabel`。**驳回**：口径真源唯一（`useCloudSyncResultModel`），子组件只是消费方，不构成第二落点。
- [x] B-I2 `notifyError(key, { message })` 与 `notifyConfirm(key, { params })` 形状不一致。**驳回（核实后）**：`useNotify` 第 32-34 行明确支持 `options.message` 直传文案（优先于 key 解析），是两个各有用途的既有合同，不是误用。
- [x] B-I3/B-I4 watch immediate 语义、`require.main` 守卫与导出顺序。**核实无异议**，记录为已复核。

### 评审之外自己找到的两处（不粉饰来源）

- [x] `force` 的方向在实现里被写反（只有 `cloud-wins` 能覆盖凭证列）。PRD §7.2 第 235 行才是权威：`local-wins` = 本机实测胜出的覆盖授权。方向反了的后果不是报错而是长期错：本机验证过的新凭证永远写不上去，云端长期存着失效钥匙。
- [x] 「两份都无定论」分支原先发 `force: 'local-wins'` 的 PUT —— 用「没验出来」这份未证实的证据去授权覆盖，直接违反单向证据规则；且无 `force` 时服务端只回 `conflict`，那趟是纯冗余写。改为不发这次 PUT，并补桌面端断言（带 force 的 PUT 一发都不该发）。

### 本轮新增的已知缺口（如实登记，不悄悄放宽测试）

- [ ] **W5 `tombstone-backfilled` 仍未实现**：本机删除账号时若墓碑写入失败（网络/KMS/5xx），本机删除照常完成、只 `log.warn`，此后该键在别的设备会被当「从未在本机存在」恢复回来。入口守卫修好后，这个窗口只剩「请求真失败」这一种，不再是系统性 404。收口方式已想清楚：墓碑记录器落一份 pending 文件（`userDataDir`，tmp+rename 原子写），`sync()` 在算 `toRestore` 前先补写并把补成功的键并入墓碑集，对应逐条结果给 `tombstone-backfilled`。本轮不做，因为它是新增持久化面 + 新枚举 + 新文案键，需与 ADR-0004 一起过一轮。
- [ ] 桌面端恢复阶段仍不发送 `credentialUpdatedAt`（恢复项本机没有历史时刻），`credentialFreshness` 因此保守取 `cloud`。
- [ ] `cloud-accounts-concurrency.test.js` 在整轮 runner 下出现过一次红、单跑与复跑均绿（同族「unbounded wait」抖动家族），未定责前不记为稳定通过。


## 10. CI 首轮两项红灯的定责与真修（2026-09-27，PR #2461 head 47515348）

CI 回来两个红：`QG Static` 与 `QG Business API Postgres`。逐条下日志定责后，**两个都是本 PR 引入**，
且顺着它们挖出三处更严重的跨包断裂（本地全绿、CI 也绿不到的那种）。

- [x] **`QG Static`**：`cloud-account-sync.js:161/257` eslint `no-useless-assignment`
  （`let stored = null` / `let created = null` 的初值在 catch 早返回后永不被读）→ 改为无初值声明。
- [x] **`cloud-accounts-desktop-contract.test.js` 从未被执行**：该文件自创建起就缺一个 `test()` 头
  （第 458 行起是孤儿块，`await` 落在顶层 CJS → SyntaxError）。它被 runner 记为「通过」是**我误读**：
  `pnpm test` 的 rc=0 来自修复之后，而我把"文件存在 + 我写过断言"当成了锁已建立。
  → 补回标题、并实测 `node <file>` 对损坏文件确实 rc=1（runner 无漏洞，漏洞在我的核验方式）。
  **新纪律见 AGENTS.md「新增测试文件必须看见它被执行过」**。
- [x] **响应信封断裂（功能级 Bug）**：服务端出线 `{code,data}`，`member-api-service.request()` 原样返回**整个响应体**，
  而桌面端读的是 `cloud.total` / `put.results` / `got.credentials`（内层）→ 用户可见后果是
  **弹窗恒「共 0 个」、同步恒 0 条**。修法：`cloud-account-core.js` 新增唯一剥壳出口 `unwrapApiResponse()`，
  `callApi()` 一处应用；信封缺失抛 `CLOUD_ENVELOPE_INVALID`（不得伪装成「云端没有」）。
  契约夹具同步改为与真实传输层逐字同形（原来写的是 `return response.body.data`，即**替客户端剥壳**，
  这正是缺陷穿过单测的原因），并把原先的「记录性断言」换成真跑流程。
  反证：`unwrapApiResponse` 改恒等 → 桌面端红 19 条 + 契约文件红 4 条；恢复后两文件全绿、源文件字节一致。
- [x] **下行凭证形态断裂**：`POST /sync` 出线是 base64 `credentialEnvelope`，桌面端读 `credential`；
  而数据密钥由**服务端主密钥**包裹、桌面端无 KMS 访问权 → 恢复路径**恒** `CREDENTIAL_UNAVAILABLE`，
  ADR-0003「换设备免扫码（服务端必须能重新解出凭证）」这一立约前提落空。
  修法：`handleSyncFetch` 在服务端解密后回明文 `credential`（同一条 TLS、同一 owner、AAD 绑 `userId`），
  不再下发信封；新增四条锁：跨归属解不开、逐条独立不给半成品、无 crypto 时 503 且不查库、出线不得带信封。
  桌面端把下行分成本互不伪装的**四种结局**（ok / missing / undecryptable / 传输无结论），
  其中后两类在冲突裁决处判 `conflict-unresolved` 且**不发**带 `force` 的 PUT（「解不开」不是反证）。
- [x] **真库夹具自身的错**（只有真库能证伪，正是该文件存在的理由）：
  ① 忘了给 `createCloudAccountServices` 传 `kms` → 每条 PUT 503，并把 6 条用例串成假象；
  ② 父行写成 `identity_users(id, subject)`，真库列是 `(auth_provider, auth_subject)` → 42703；
  ③ 云账号必须挂在真实父行上（`user_id` 有 FK），夹具改为 `ensureIdentityUser/trackUser` 并在收尾按父行删除；
  ④ 断言直读 `res.body.results`，未过 `{code,data}` 信封 → 统一走 `dataOf()`，它先把状态钉成 200。
- [x] **反互锁（空跑守卫）**：首轮 CI 里「库内不含明文」「断开不影响他人」两条是**伪绿**——写失败后
  「什么都查不到」恰好满足"不存在坏东西"。现在这两条各加了前置断言（行数/上行结果），
  avatar 用例也加了「正例确实落库 = 2 行」的空跑守卫。
- [x] **文案归属**：下行/本机写入类码原先一律落兜底句「云端未接受该账号」，会把用户推去改账号信息。
  新增 4 组 `cloudSyncErr` 键（zh/en 成对）+ 逐码归属用例。
- [x] `cloud-account-sync.js` 因上述修改涨到 527 行触发 `NEW_OVER_LIMIT` → 按语义边界真拆分：
  下行链路（取凭证 → 建号 → 存凭证 → 打回 unverified → 排检测）落到新模块 `cloud-account-restore.js`，
  守的是「凭证未落盘不得声称可用」这条顺序不变量；拆分后 `filesOver500` 98（基线 101）。

### 本轮新增的已知缺口（登记，不粉饰）

- [ ] `electron/ipc-handlers/cloud-account.js` 无直接单测：`ownerSubject()` 取不到 sub 的 fail-closed、
  `withSenderCheck`、以及 `res.data` 被 renderer 消费的形状，目前只由 preload 通道合同与服务层测试间接覆盖。
- [ ] `POST /sync` 现在返回明文凭证，响应侧**尚未**加 `Cache-Control: no-store`。
  本机链路不经缓存、Nginx 默认也不缓存 `/api/v1/`，但这条应在接入任何共享缓存前补上（需改 `_json` 的按路由加头，属独立改动）。
- [ ] 真库回归仍需 CI 才跑得到（本机无 docker）：合并前必须在 `QG Business API Postgres` 看到 7 条真跑绿，
  跳过不算通过。

## 11. QM-6 双模型外部评审（第二轮，针对本轮跨包改动）

前端模型（opencode）本轮**跑通了** —— 推翻上一轮「opencode 恒被 external_directory 自动拒绝」的结论：
真正的拦路点是 `codeagent-wrapper` 不在 PATH、我用裸命令名启动后 `command not found`，
而 wrapper 仍 exit 0（只在输出里留一行错误）。改用全路径 `C:\Users\to_co\.claude\bin\codeagent-wrapper.exe` 后一次成功。

- [x] **F1 Critical：`conflict-unresolved` 在展示层无标签无样式** → **采纳**。
  核实：`OUTCOME_LABEL_KEYS` / `OUTCOME_CLASS` 确实没有它（`grep -c` = 0），而主进程已会产出该终态。
  后果不是报错而是**该行标签空白**。修法不止补两条表：新增 `useCloudSyncResultModel.test.js` 结构锁，
  从 `cloud-account-core.js` 的 `OUTCOME` 枚举反向收集全部终态，逐个断言有显式标签 + 显式样式 + zh/en 文案存在。
  反证：摘掉标签条目 → 该用例立刻红。
- [x] **F2 Warning：四个本机侧码未登记** → **采纳**。
  核实成立：`CREDENTIAL_LOAD_FAILED` / `CHECK_LOGIN_NO_CREDENTIAL` / `CREDENTIAL_STORE_UNAVAILABLE` /
  `ACCOUNT_MANAGER_UNAVAILABLE` 全部漏登记，前两个会落到「云端未接受该账号」兜底句（把本机问题说成云端问题），
  后两个批次级返回空串。新增 3 个分组 + 3 组 zh/en 文案，并把锁扩到
  「从主进程源码收集所有 `'UPPER_SNAKE'` 语义码，逐个断言已登记」—— **首跑即抓到第 5 个漏网码
  `CLOUD_RESULT_MISSING`**（评审没提到的，说明这条锁的值不在复现评审结论，而在继续往下抓）。
- [x] **F3 Info：`unwrapApiResponse` 对 `HTTP 200 + {error}` 会判成信封破坏** → **核实后接受该行为**。
  `member-api-service.request()` 对 `response.ok !== true` 一律先 reject（并把上游语义码透出来），
  所以剥壳层只会见到 2xx 成功体；`{error}` 无 `data` 的 200 属服务端实现错，抛 `CLOUD_ENVELOPE_INVALID`
  比静默当空数据更符合 fail closed。已在 §7.0 表里写明该口径。
- [x] **F4 Info：`finishSummary` 只反推 conflicts/invalid/uidUnavailable 三类** → **登记为已知限制**。
  其余计数由逐条分支即时累加；彻底统一为「全部从 items 反推」需要 `items` 携带平台级去重信息，属独立改动。
- [x] **F5 Info：正面确认（模块边界、unwrap 单一使用、无重复实现）** → 记录。
- [ ] 后端模型（claude）本轮仍在跑；结论落地后逐条处置，Critical 未清不合入。
