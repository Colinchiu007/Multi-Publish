---
record: pin-entitlement-public-key
task: 安全加固——发行公钥钉入编译期常量，packaged 模式禁止替换
date: 2026-10-07
---

## 本次执行记录：钉死发行公钥（pin-entitlement-public-key，2026-10-07）

> 分支：`pin-entitlement-public-key`；worktree：沙箱内无法执行（无 Windows + Git Bash）
> 变更类型：**🔐 安全/合规变更**（信任根加固）⇒ 走完整质量节拍，Phase 2.3 `/cso` 口径
> 规模：2 文件 / +120 行 ⇒ **M（中等）**，未走轻量模式
> `classify-docs-only.js --base=origin/main --head=HEAD` → **docs-only=false**（files=0，改运行时代码）

## 缺陷

`identity-public.json` 被打包进 `<安装目录>/resources/config/`
（`package.json` 的 `extraResources: [{ from: "../../config", to: "config" }]`）——
位于 **app.asar 之外**的普通文件，**用户可编辑**。

而该文件同时提供两个字段：

| 字段 | 作用 | 可否被替换 |
|---|---|---|
| `entitlementPublicKey` | 验证服务端签名权益快照 | ❌ **可改** |
| `businessApiUrl` | 权益服务地址（实测 `https://auth.iart.work`） | ❌ **可改** |

**两条替换路径**（这是关键，之前只看到一条）：

1. 改配置文件 `entitlementPublicKey` / `businessApiUrl`
2. 改**进程环境变量** —— `CONFIG_ENV_OVERRIDE_KEYS = RUNTIME_ENV_KEYS.filter(k => k !== 'IDENTITY_AUTH_ENABLED')`
   **包含 `ENTITLEMENT_PUBLIC_KEY` 与 `BUSINESS_API_URL`**

原实现的 `validateEntitlementPublicKey` **只校验格式**：

```js
key = crypto.createPublicKey(value)          // 能解析
if (key.asymmetricKeyType !== 'rsa') throw  // 是 RSA
```

换一把**自己生成的、格式完全合法的** RSA 公钥，照样放行。

⇒ 完整伪造链：同时替换公钥与 API 地址 → 起假 `/api/v1/me` 返回自签「永久 Pro」
→ 本地验签通过 → UI 显示 Pro。

## 逃逸分析

`identity-runtime-config.test.js` 原有 15 条用例，**全测格式校验与字段白名单**，
**零覆盖「这把公钥是否是正确的」** —— 格式合法 ≠ 正确。覆盖率与缺陷无关的老例子。

## 修法

把发行公钥作为**编译期常量**钉进代码（`PINNED_ENTITLEMENT_PUBLIC_KEYS`），
packaged 模式下要求配置**与环境变量**提供的公钥与之逐字节一致，否则 `IDENTITY_CONFIG_INVALID`。
校验放在 `mergeEnvironment` **之后**，一次覆盖两条替换路径。

**三个口子一起堵**：
- 改 `entitlementPublicKey` ⇒ 启动即失败
- 改环境变量 `ENTITLEMENT_PUBLIC_KEY` ⇒ 同上
- 只改 `businessApiUrl` 指向假服务器 ⇒ 假签名验不过钉死的公钥

### 三个设计决策

1. **只钉公钥，不钉 keyId**。`entitlementKeyId` 允许运维在不重发安装包的前提下轮换
   （现有测试 fixture 即用 `entitlement-key-1` 而非发行配置的 `entitlement-2026-07-24`）。
   钉 keyId 会让 15 个现有用例全红且破坏运维能力。
   **新公钥轮换走发版，在常量数组追加条目。**
2. **`options.isPackaged` 显式注入**，不直接 `require('electron')` —— 保证可测。
3. **仅 packaged 强制**。未打包运行需要本地测试密钥；且利用这一点的前提是攻击者
   自己编译整个应用（门槛 + 签名成本高），只影响自己。

**规范化只处理空白**（`CRLF → LF` + `trim`），不做任何宽松解析——
Windows 与 Linux 的 PEM 行尾必须一致，否则正式包在 Windows 上会误杀自己。

## 验证（沙箱无 vitest，node 直驱真实模块）

6/6 全对：packaged+自签公钥（配置/环境两条路径）抛错、packaged+未内置 keyId 抛错、
packaged+真实公钥通过、**packaged+仅 CRLF 差异仍通过**（防止写成恒抛）、
非 packaged+自定义公钥通过、身份未启用时不越权拦截。

**两次变异验证**：

| 变异 | 结果 |
|---|---|
| 摘掉整个校验（还原成修复前） | ❌ 3 条攻击路径全红被抓住 |
| 校验存在但 `if (false)` 永不抛（恒真锁） | ❌ 3 条红 |

**两条正向路径在变异下仍绿** ⇒ 门禁不是恒抛。

**现有 15 个用例零破坏**：node 直驱复现其 fixture 形态
（`keyId=entitlement-key-1` + 未传 `isPackaged`）确认仍放行。

## CCG 判定与 SELF-REVIEW

`node scripts/ccg-review-decider.js` → **DUAL**（变更 163 行但命中 auth/加密敏感内容 3 处）。
落地 `.ccg/reviews/630767d76999abecc80a8e702d9a20bd64f9c9e1.json`。

**双模型后端（claude + opencode）在沙箱内均不可用**，按判定器自身指示降级为
SELF-REVIEW，结论记入 `.quality-gates.md`。

### SELF-REVIEW 抓出的一处真问题（已修复）

原判定写作 `isPackaged !== true`，会被 `1` / `'true'` / `{}` 这类**非布尔真值静默降级为宽松**，
与 `license:activate`(#3085) 的 `!== false` 严格不等口径不一致。

已改为显式白名单：只有 `false` / `undefined` / `null` 放行，其余非布尔真值抛
`IDENTITY_CONFIG_INVALID`。取舍是**误拒的代价是启动失败（可查可修），
误放行的代价是验签被绕过**。

补 4 条 `it.each` 回归（`1` / `'true'` / `{}` / `[]`），node 直驱 7/7 全对。

### 评估后不修改的两项

- 公钥前导空格/尾部换行被放行：`trim()` 造成的空白等价，非安全问题（`trim` 正为 CRLF 而设）
- 配置文件不存在时跳过校验：该分支直接返回，身份未启用时本就无公钥，**既有设计非本 PR 引入**

### 诚实声明

**双模型外部评审未能实际执行**，本次结论全部来自 agent 自审 + 变异验证，
**不等价于外部交叉审查**。有可用后端时应补跑。

## 过程中一处自身失误

验证脚本第一次跑抛 `logtoScopes 缺少 profile` —— 那是我**脚本漏字段**，
不是代码问题。补上 `profile` 后重跑通过。
**这里没有让「红色」蒙混过关，而是先判断红的是代码还是验证。**

## 遗留

- `businessApiUrl` 仍可配置（**刻意保留**：运维需要在测试/生产间切换）。
  公钥钉死后它不可用于伪造。
- 桌面端功能门禁仍只读本地 `licenseManager`（渲染层 37 处调用点）——
  已识别的架构遗留，本 PR 不动，属独立工程项。
- 新公钥轮换需发版，属可接受代价（低频操作）。

| 远程同步 | PASS —— PR #3102 squash 合并，merge SHA `8b3d3e91`；quality-gate 11/11 全绿 |
|---|

---

## 第二轮 CI 失败与修复（2026-10-08）

**第一轮的判断错了。** 当时我定位到「分支没 rebase、跑的是旧代码混合态」，
rebase 后从 4 红降到 1 红——**我以为问题解决了，其实那 1 条一直存在，只是被其他失败盖住了。**

### 失败详情

```
FAIL electron/services/identity/identity-runtime-config.test.js
  > 发行公钥不可被替换（2026-10-07 加固） > 非 packaged（开发态）⇒ 允许自定义公钥
AssertionError: expected '-----BEGIN PUBLIC KEY-----\nMIIBIjANB…' to be '-----BEGIN PUBLIC KEY-----\nMIIBIjANB…'
  at identity-runtime-config.test.js:265
Tests  1 failed | 14428 passed | 3 skipped (14432)
```

### 根因：我的测试写错了，实现是对的

`forged` 长度 451，`realKey` 450 —— **差一个尾换行**。
解析侧 `requiredString` 会 `trim()`，返回值必然比 `forged` 少一个尾换行，
所以 `expect(env.ENTITLEMENT_PUBLIC_KEY).toBe(forged)` **恒不成立**。

改为按规范化后比较：`toBe(forged.trim())`。

### 顺带发现：两条测试是恒真的

`packaged + 配置换成攻击者自签公钥` 那条只传了 `entitlementPublicKey: forged`，
但 `keyId` 仍用 fixture 默认的 `realKeyId` 之外的路径时，被拒原因可能是
**「keyId 未内置」而非「公钥与内置不一致」**——**换成任何被拒的公钥都会绿**。

已改为显式传 `entitlementKeyId: realKeyId`，让断言锁定**正确的原因**；
并加一条前置断言 `expect(forged).not.toBe(realKey)` 防测试自欺。

dev 态那条也补了**反断言** `not.toBe(realKey.trim())`——
否则「被静默换回真实公钥」这种失效也发现不了。

### 变异验证（新测试必须有牙齿）

| 变异 | 结果 |
|---|---|
| 取消 dev 态豁免 | ❌ 2 条红 |
| **伪造公钥被静默换回真实公钥**（模拟"不生效但放行"） | ❌ 1 条红 |
| 还原 | ✅ 5/5 |

第二条变异正是旧测试的盲区所在。

### 排查方法上的教训

1. **本轮 `check-runs` / `actions` / `check-suites` REST 端点整体 404**（连 main HEAD 也查不到），
   但 `commits/<sha>`、`rate_limit`、`pulls/<n>` 正常 ⇒ **端点问题，不是权限也不是 commit 问题**。
   **改用 GraphQL `statusCheckRollup` 拿到 CI 状态。** 遇到端点 404 时先做对照实验
   （查一个确定存在的 commit），再决定是否换路径。
2. **CI 日志归档有窗口期**：job 失败后一段时间内 `GET /actions/jobs/<id>/logs` 能拉到
   完整日志（8.7MB），过期后只剩 **162 字节占位**。**要拉必须第一时间拉。**
3. **Windows runner 的 vitest 日志是纯文本不是 zip**，`zipfile.ZipFile` 会抛异常——
   先 `file` 一下再决定怎么解。

## 收尾补记（2026-10-08）

- 分支 rebase 到最新 main（`4e8092bd` → `a43287ac`）。冲突仅在 `.quality-gates.md`
  （追加型文档，双方都往末尾加内容），保留双方内容后完成。
- rebase 后重跑本地验证：公钥加固逻辑 **5/5** 全过（packaged 拒收自签公钥、
  dev 态放行且拿到的是 forged 而非真实公钥、非布尔 `isPackaged` 抛错、
  身份未启用时不越权拦截）。
- 七个门禁全过，含 `check-max-lines`，且 `auth-service.js` 未被触碰。

- **本环境无法本地判定 `QG Static` 的真实失败点**，三条理由：
  1. 失败 job 的日志归档已过期（只返回 162 字节占位）
  2. 本地跑 `stage-remotion-runtime.test.js` 是 `MODULE_NOT_FOUND`
     （缺 pnpm workspace 链接）——属**沙箱假红**，与 CI 上的失败不是同一回事
  3. main 自身的 CI 也在跑（rollup=PENDING），无法据此判断红因归属

  ⇒ 只能靠「job 一失败就立刻抓日志」定位，不要靠本地猜测。
  本轮我曾因猜测连错三次（先怀疑 `parseEntitlementPublicKeys` 断言、再猜
  `restore()` 该不该拆、再猜 `.snap` 扩展名判定），全部被数据否掉。
