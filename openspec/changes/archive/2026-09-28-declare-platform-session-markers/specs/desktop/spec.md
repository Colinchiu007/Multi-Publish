# desktop (delta: declare-platform-session-markers)

## ADDED Requirements

### Requirement: 会话标记键名必须由自建匿名基线与真实登录视图的差集取证

凡新增或修改 `PLATFORM_SESSION_COOKIE_MARKERS` 中的键，MUST 同时满足三条并有可复跑证据：

1. **该键在真实登录视图分区内存在**（`auth-auth-<平台>-<ts>` 的 `Network/Cookies`，只读查询）；
2. **该键不在自建匿名基线内**——基线 MUST 由与主进程同版本的 Electron、复刻 `configureUserAgentFallback`
   的 UA 净化、在全新隔离分区访问该平台「登录页 + 创作者首页」实测得到；
3. **该键语义上是会话票据或用户身份**，MUST NOT 是设备/埋点/验证码/CSRF/SSO 中间态标识。

取证过程 MUST NOT 读取或输出 Cookie 值（`SELECT` 列表禁止含 `value`/`encrypted_value`），MUST NOT 解密
`credential-store`。测试夹具 MUST 由实测产物程序化生成，MUST NOT 手工抄录。

匿名基线的有效性 MUST 自证：基线内 MUST 出现该平台公认的匿名 Cookie（如知乎 `d_c0`、B 站 `buvid3`、
小红书 `a1`/`webId`、抖音 `ttwid`），否则该次 A−B 差集不得作为声明依据（页面未渲染会造出虚高差集）。

#### Scenario: 标记必须既在登录视图独有、又不被匿名基线命中

- **GIVEN** 某平台的一次真实登录视图 Cookie 名集合 A 与自建匿名基线名集合 B
- **WHEN** 断言该平台的标记表
- **THEN** 每个声明的键 MUST ∈A 且 MUST ∉B
- **AND** A−B 的差集 MUST 被逐字钉住，使平台改埋点时立即变红

#### Scenario: 匿名基线不得判为已登录，登录视图必须判为已登录

- **GIVEN** 实测得到的匿名 Cookie 集合与登录视图 Cookie 集合
- **WHEN** 调用 `hasPlatformSessionCookie(platform, cookies)`
- **THEN** 匿名集合 MUST 返回 `false`
- **AND** 登录视图集合 MUST 返回 `true`
- **AND** 任一侧出现「标记存在但值为空白/缺席」时 MUST 返回 `false`

#### Scenario: 基线未真正渲染时不得作为声明依据

- **GIVEN** 一次匿名探测返回 0 条该平台域内 Cookie，或缺少该平台公认的匿名 Cookie
- **WHEN** 有人据此计算 A−B 并提议新标记
- **THEN** 该提议 MUST 被拒绝，MUST 重新取得基线后再取证

### Requirement: 形态正向契约必须随标记集泛化并携带负控

`SESSION_MARKER_SHAPE` 类形态规则是标记的**必要条件而非充分条件**。泛化该规则时 MUST 同步新增：

- 一组**形态可拒**的负控断言，样本 MUST 取自实测匿名名单而非既有黑名单自身；
- 一组**墓碑断言**，列出「形态上像票据但实测匿名也会种」的键，并声明其 MUST NOT 出现在任何平台标记表中。

#### Scenario: 泛化不得放行设备标识

- **WHEN** 用泛化后的形态规则测试 `uuid` `guid` `buvid3` `ttwid` `s_v_web_id` 等设备/埋点名
- **THEN** 全部 MUST 不匹配

#### Scenario: 形态放过的键由实测墓碑拦住

- **WHEN** 某键形态上匹配规则（如 `csrf_session_id`）但匿名基线证明其未登录即存在
- **THEN** 该键 MUST NOT 进入任何平台标记表，并由墓碑断言锁定

### Requirement: 收紧登录门禁必须同时提供可归因现场

凡让某平台从「未声明标记（门禁恒过）」变为「声明标记（门禁实际将拦）」，同一变更 MUST 让**拒绝路径**留下
Cookie **名字**现场：名字投影 MUST 收敛到 shared-utils 的单一实现（`sessionCookieNames`），
禁止在 `auth-view-manager` / `qrcode-login` / `credential-saver` / `account-manager` 各写一份。
日志 MUST NOT 含 Cookie 值。

#### Scenario: 已声明标记被拒时留下名字现场

- **GIVEN** 某平台已声明标记，且一次采集的 Cookie 未命中任何标记
- **WHEN** 该采集被拒绝
- **THEN** MUST 输出一条含 `names=` 的日志，且名字来自共用的名字投影
- **AND** 日志 MUST NOT 含任何 Cookie 值

#### Scenario: 名字投影不出值、不炸、有上界

- **WHEN** 以空值、`null`、非数组、或 60 条 Cookie 调用 `sessionCookieNames`
- **THEN** MUST 分别返回 `[]` / `[]` / `[]` / 长度 40
- **AND** 输出 MUST NOT 含任何值内容

## ADDED Requirements

### Requirement: 裸域名成功模式的会话标记缺口清单只能缩小

`PLATFORM_SESSION_COOKIE_MARKERS` 的待取证清单（由 `platform-definitions.test.js` 的裸域名/标记缺口棘轮锁
按形态自动计算）MUST 只能缩小，新增即红。本变更将其从
`['bilibili','douyin','facebook','instagram','xiaohongshu','youtube','zhihu']`
缩小为 `['facebook','instagram','youtube','zhihu']`。

其中 **zhihu MUST 保持不声明 Cookie 标记**：实测其登录视图内 `.zhihu.com` 域不含任何会话 Cookie，
A−B 唯一独有项为验证码票据；给它声明 Cookie 标记会把每次真实登录判成失败。该「刻意不声明」MUST 由断言锁定，
以免被后人当作遗漏而随手补上。

#### Scenario: 三个平台的裸域名成功模式被会话标记封住

- **GIVEN** 未登录访问 `https://creator.douyin.com/`（实测停在原 URL 且不跳登录路径）
- **WHEN** 判定登录完成或采集凭证
- **THEN** douyin / bilibili / xiaohongshu MUST 因未命中非空标记而判为未登录

#### Scenario: 知乎不得因补账而被声明 Cookie 标记

- **WHEN** 有人为知乎声明 `PLATFORM_SESSION_COOKIE_MARKERS`
- **THEN** 棘轮锁与「知乎刻意不声明」断言 MUST 变红，并要求改用 localStorage 侧取证
