# Design: declare-platform-session-markers

## 1. 取证方法：把「必须等用户登录」变成「负向证据可自建」

补会话标记的历史卡点是「需逐平台 DevTools 真实登录态取证」。本设计把它拆成两半，其中**一半可以自建**：

- **B 侧（负向，自建）**：用仓库里与主进程同版本的 `node_modules/electron/dist/electron.exe`（实测 43.1.1 /
  Chrome 150.0.7871.114），`session.fromPartition('persist:probe-<平台>')` 开全新隔离分区、
  `show:false` + `backgroundThrottling:false`，依次访问该平台的**登录页与创作者首页**，然后
  `cookies.get({})` 取「不登录也会种」的名字。UA 必须复刻 `startup-compat.configureUserAgentFallback`
  的 token 白名单净化（剔除 `Electron/x` 与产品 token），否则风控发的 Cookie 集与真实应用不一致。
  userData 经 `ELECTRON_USER_DATA_DIR` 指到临时目录，不触碰共享调试 profile。
- **A 侧（正向，历史现场）**：`<debug-profile>/session/Partitions/auth-auth-<平台>-<Date.now()>/Network/Cookies`，
  用 `node:sqlite` 以 `readOnly` 打开，SELECT 列表**不含** `value`/`encrypted_value`。

两条关键约束（都是本次实测踩出来的）：

1. **分区选择**：`account-<id>` 分区常年 0 条 Cookie（凭证只在开标签时从加密 `credential-store` 回填），
   登录视图 `auth-auth-*` 才是现场。
2. **基线有效性自证**：B 侧必须包含该平台公认的匿名 Cookie，否则说明页面根本没渲染、A−B 是虚高的假差集。
   实测见证：知乎 `d_c0`、B 站 `buvid3`、小红书 `a1`/`webId`、抖音 `ttwid`/`s_v_web_id`/`bit_env` 全部命中。

标记候选 = **A 独有 ∧ 匿名基线没有 ∧ 语义上是会话票据/用户身份**。三条同时成立才进表。

## 2. 实测数据（2026-09-27）

| 平台 | A 分区 | A 域内名字 | B 匿名 | A−B | 选定标记 | 落选理由 |
|---|---|---|---|---|---|---|
| douyin | `auth-auth-douyin-1790348243918` | 40 | 17 | 25 | `sessionid` `sessionid_ss` `sid_tt` `uid_tt` | `passport_mfa_token`（MFA 阶段≠登录完成）、`odin_tt`/`d_ticket`/`n_mh`（设备与 passport 流程产物）、`is_staff_user`/`has_biz_token`（账号属性非票据）、`sid_guard`/`session_tlb_tag`/`ssid_ucp_v1`（分片提示，冗余） |
| bilibili | `auth-auth-bilibili-1790348729411` | 14 | 13 | 5 | `SESSDATA` `DedeUserID` | `sid`（值即 session id 但形态弱）、`bili_jct`/`DedeUserID__ckMd5`（CSRF/校验副产物） |
| xiaohongshu | `auth-auth-xiaohongshu-1790348418152` | 16 | 11 | 6 | `access-token-creator.xiaohongshu.com` `x-user-id-creator.xiaohongshu.com` | `customerClientId`（client 标识，语义近设备）、`galaxy_creator_session_id`/`galaxy.creator.beaker.session.id`（子系统会话，覆盖面窄）、`customer-sso-sid`（SSO 中间态） |
| zhihu | `auth-auth-zhihu-1790352605579` | 8 | 13 | **1** | **不声明** | A−B 唯一项 `captcha_ticket_v2` 是验证码票据；`z_c0` 在 A/B 两侧都不存在 |

**A 侧现场身份的依据**：账号 `created_at` 与分区时间戳配对——douyin 晚 2 分 37 秒、xiaohongshu 晚 42 秒、
bilibili 晚 69 秒、zhihu 晚 37 秒。这只证明**强相关**，不证明「凭证就是从该分区采进库的」；因此正向锁定
不依赖这条推断，而是依赖 §3 的行为断言 + 上线后 `names=` 现场日志继续采集。

### 2.1 一条被实测否证的假设

过程中曾断言「抖音匿名访问登录页也会种**空值** `sessionid`，所以纯名字判据不成立」。重测后：
`sessionid` **不在**匿名基线里。该断言当时来自一个并未真实存在的中间产物文件（凭空引用的夹具），
不是测量结果。**空值风险由实现本身承担**：`hasPlatformSessionCookie` 要求 `value.trim().length > 0`。

### 2.2 形态规则的泛化与其边界

既有契约 `SESSION_MARKER_SHAPE`（AGENTS.md「枚举式黑名单必须配结构化正向契约」的落地）拒绝了本次三个键：
`uid_tt`（无 `user_?id`）、`SESSDATA`（`(session|sess)` 后要求分隔符）、`x-user-id-creator…`（`-` 不在
`_?` 允许集内）。泛化为：

```
/user[-_.]?id|(^|[._-])(st|sid|auth|token|tk)([._-]|$)|(^|[._-])sess|session_?id|(^|[._-])uid([._-]|$)/i
```

泛化必须带负控，且负控样本取自实测名单而非黑名单自身：

- **形态可拒**（进负控断言）：`uuid` `guid` `buvid3/4` `buvid_fp` `ttwid` `s_v_web_id` `_uuid` `b_nut`
  `d_ticket` `webId` `gid` `clientid` 等 40 项——`uid` 前面不是分隔符即不匹配。
- **形态不可拒、但实测匿名也会种**（进「墓碑」断言，禁止进表）：`passport_csrf_token(_default)`
  `csrf_session_id` `passport_auth_mix_state`。这三项在形态上确实像票据，靠形态挡不住，
  充分性由 A−B 承担。`bili_ticket` 最初被误放进这一类，实测其形态**不**匹配（`ticket` ≠ `tk`），
  已归入上一类。

## 3. 测试策略

- `platform-definitions.test.js` 新增 `session-marker evidence contract` describe：夹具由脚本
  从实测产物（`probe-B-*.json` + 分区只读查询）**直接生成**，不手抄；每个平台锁三条：
  ①A−B 差集逐字 `toEqual`（平台改埋点即红）②匿名基线判未登录 ③登录视图判已登录；外加
  「每个声明的标记 ∈A 且 ∉B」的数据驱动交叉核对。知乎锁「A−B 恰为 `['captcha_ticket_v2']`」+ 仍不声明。
- 值空白/缺席不算证据（同名空值 Cookie 是「假成功」的典型形态）。
- `sessionCookieNames` 单测：去重、限量 40、非数组安全、**值不得出现在输出里**。
- 连带修正既有断言：把 douyin/xiaohongshu 当作「未声明标记」代表的用例改锚到 zhihu；
  webview-manager 批量保存夹具补 douyin 会话 Cookie。

## 4. 未覆盖与后续

- 三平台**正向**仍缺「新登录一次后 `hasCapturedCredentials` 实际命中」的真机验证；已让 reject 路径输出
  `names=`，下次真实登录即可核对标记集是否过窄（这是本次坚持同步补可诊断性的原因）。
- 知乎需要 localStorage 侧取证（先例：视频号 `finder_username`）。注意从 leveldb 离线抠键名不可靠：
  键名后紧跟 UTF-16LE 值，ASCII 截取会把值首字符并进键名（实测 `cid`→`cidY`），必须走 CDP 实时取证。
- instagram / facebook / youtube 需要各登录一次。
