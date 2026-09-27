# 生产 KMS 采用文件密钥环（多密钥 + active 指针 + 自描述信封），不引入云 KMS 服务

## 状态

已接受（2026-09-27）。落地：`packages/api-publish-engine/src/cloud-accounts/keyring-kms.js`、
`scripts/rotate-cloud-kms-key.js`；选择口径唯一实现 `createKmsFromEnv()`（`src/cloud-accounts/index.js`）。

## 背景

ADR-0003 定了「云端凭证用信封加密，主密钥托管在服务端 KMS 抽象层之后」，但它只交付了接口与
一个**开发用**实现 `createLocalKms`：主密钥是环境变量 `MP_CLOUD_KMS_LOCAL_KEY` 里的**单个** 32 字节 hex。
OPS §5 当时如实登记：「生产 KMS 实现尚未编写；在这一项落地前，本特性不得对真实用户开启。」

单密钥形态的致命处不在"强度"，而在**它没有轮转路径**：

- ADR-0003 把 `keyId` 定成 `user:${userId}`，只用来绑 AAD（防跨归属串解），**不标识主密钥版本**；
- 所以一旦换掉那个环境变量，库里每一份 `encryptedDataKey` 都解不开 ——
  `unwrap` 认证失败 ⇒ `KMS_UNAVAILABLE` ⇒ 下行逐条 `undecryptable`；
- 而凭证不可恢复（服务端从来没有任何途径重新导出它），后果是**全部用户全部平台重新扫码**。

也就是说：用本地单密钥上线，等于把"永久不能再换主密钥"当成前提。这不可接受 ——
密钥泄露、员工离职、机器被拖走，任何一种情况都需要能换。

## 备选方案

| 方案 | 说明 | 为什么不选 |
| --- | --- | --- |
| A. 云 KMS（阿里云 KMS / AWS KMS / Vault Transit） | 主密钥托管在外部服务，`wrap/unwrap` 走 API | 需要新增第三方依赖、长期凭证与网络出口；AGENTS.md 原则「能不用第三方服务就不用」。且本部署形态是单台 ECS + Docker Compose，没有多实例共享根密钥的需求。作为**未来的可替换项**保留（见下） |
| B. 继续用单环境变量 + 「换密钥前先全量重加密」 | 理论最省 | 重加密需要读明文 DK 再写回，等于要求一次"把所有凭证解一遍"的全局操作，失败一半就处于半新半旧的不可解释状态；运维窗口内无法回滚 |
| C. 数据库表存密钥 | 环进 Postgres | 把根密钥和它保护的数据放进同一个备份域，一次库文件泄露=两坏；且启动期需要库先于 KMS 可用， readiness 变成鸡生蛋 |
| **D. 文件密钥环（采纳）** | `{version, activeKeyId, keys:{id:hex}}` 一个 JSON 文件，路径由 `MP_CLOUD_KMS_KEYRING` 指定 | —— |

## 决策

采纳 D，具体三条：

1. **信封自描述密钥版本**：`encryptedDataKey` 的字节里前置 `[idLen:1][keyId…]`，之后才是
   `iv | authTag | ciphertext`。因此**不需要新增数据库列**就能同时存在多把主密钥，
   旧信封永远按自己登记的那把去解。
2. **轮转 = 追加 + 移指针，从不删除旧密钥**。`rotateKeyring()` 拒绝同名 id、拒绝凭空造环，
   写盘走 `src/atomic-rename.js` 的原子替换（本包内 API Key 存储与密钥环共用这一把 rename 语义）。
3. **提供方选择只有一处实现**：`createKmsFromEnv()` —— 配了 `MP_CLOUD_KMS_KEYRING` 用密钥环，
   否则退回开发单密钥并**落一条 `KMS_LOCAL_ONLY` warn**。调用点不得各写一份判断。
   构造期一律 fail closed（`KMS_CONFIG_INVALID`）：环缺失 / JSON 坏 / `activeKeyId` 不在 `keys` 里 /
   密钥不是 32 字节 hex，都不许"先起来再在首次使用时炸"，因为那时现场只剩一个 503。

## 后果

- 生产开启本特性前必须：初始化环 → 把文件放到 UID `1001` 可读的持久卷 → 配 `MP_CLOUD_KMS_KEYRING`
  → 重启并验收（SOP 见 `01-docs/OPS-CLOUD-ACCOUNT-SYNC-2026-09-27.md` §5）。
- **环文件本身成为新的"不可丢失物"**：它与 `.masterkey` 同级，备份与访问控制沿用 OPS 已有的主密钥纪律；
  环丢了 = 全部云端凭证不可解，后果与主密钥丢失一致。这是把风险从"轮转 impossibility"换成
  "一个可备份、可审计的文件"，是净收益，但不是零风险。
- 接云 KMS 时**只需换一个 provider**：抽象层只有 `{ wrap(dataKey, keyId), unwrap(wrapped, keyId) }`，
  `envelope-crypto.js` 一行不用改（有一条接口同形断言把这个边界钉住，改了签名立刻变红）。
- AAD 仍绑 `user:${userId}`：密钥环 id 只决定用哪把主密钥，**不构成第二层归属隔离**，
  两者不得混为一谈（跨用户串解仍由 AAD 拦）。
- 未覆盖：环文件的静态加密依赖文件系统权限（部署时可叠一层 LUKS/实例角色，属运维范畴，本 PR 不做）。
- 由外部评审追加的四条约束（都不是可选项，破其中任一条就把"可轮转"变成"可静默损坏"）：
  1. **空白值 ≠ 未配置**：`MP_CLOUD_KMS_KEYRING` 存在但为空白必须当场失败，不得退回单密钥；
  2. **环文件权限从创建那一刻就是 0600**（临时文件同样），POSIX 下 rename 后 fsync 父目录；
  3. **轮转是 read-modify-write，必须持锁**（`proper-lockfile`，与 API Key 存储同口径），竞争即失败；
  4. **`rotateKeyring` 的返回值不含密钥材料**（只给 `{activeKeyId, keyIds}`），KMS 交出的明文 DK 用后即清。
- 生效时机是运维最容易误判的一点：KMS 实例永久缓存 active，**轮转后必须重启进程**才切换新写入用的密钥；
  在此之前新信封仍写在旧 key id 上（可解，但没有达到"已轮换"的预期状态）。CLI 与 OPS §5.1 都写了这条。
