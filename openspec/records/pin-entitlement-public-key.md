---
record: pin-entitlement-public-key
task: 安全加固——发行公钥钉入编译期常量，packaged 模式禁止替换
date: 2026-10-07
# 下面两个字段只在「远程同步」尚无法收口时填写；回填成 PASS 后必须整段删除。
sync_reason: 本 PR 尚未合并，merge SHA 还不存在；合并后由 docs-only PR 回填
sync_backfill_owner: 下一个会话
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

| 远程同步 | PENDING |
|---|
