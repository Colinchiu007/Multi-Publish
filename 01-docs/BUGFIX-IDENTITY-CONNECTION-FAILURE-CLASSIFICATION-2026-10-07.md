# BUGFIX：企业网络下连接失败的分类、文案与诊断（2026-10-07）

> 与 `apps/desktop/electron/services/identity/` 下的改动同批提交。
> 关注点：**不是文案措辞，而是失败分类错误导致的状态机走错**。

## 背景

应用自身账号（Logto OIDC + 本地回调）链路存在三处缺陷，三者叠加使「公司代理 / 杀毒软件 HTTPS 扫描环境下的登录失败」表现为：
用户看到「暂时无法获取访问凭证，请稍后重试」——把网络环境问题误报为账号问题，且反复重试可能触发风控。

## 缺陷 1：TLS/证书类错误码全部漏判（行为缺陷，非文案）

`auth-diagnostics.js` 的 `isNetworkError()` 关键字表只含 DNS / 连接 / 超时一类，
**未覆盖任何 TLS 或证书校验错误码**：

```
UNABLE_TO_VERIFY_LEAF_SIGNATURE   CERT_HAS_EXPIRED
SELF_SIGNED_CERT_IN_CHAIN         DEPTH_ZERO_SELF_SIGNED_CERT
ERR_TLS_CERT_ALTNAME_INVALID      ERR_SSL_WRONG_VERSION_NUMBER
EPROTO                            UND_ERR_SOCKET
```

后果不止于提示不准，而是**控制流走错**。`auth-service.getAccessToken` 三分支：

| 分支 | 条件 | 行为 |
|---|---|---|
| 1 | `isNetworkError` | → `offline_authenticated`，**保留登录态** |
| 2 | `isSessionRejected` | → 清除本地会话 |
| 3 | 兜底 | → `status: 'error'` |

TLS 失败因漏判落到第 3 支：**登录态未保住**，且提示与真实原因无关。

修复后新增 `classifyNetworkError()`（`tls` / `dns` / `timeout` / `proxy` / `connection`）
与 `networkErrorCode()` 细分码，使不同原因进入不同分支并给出不同引导。

## 缺陷 2：`useLoginGate` 文案归因错误且状态合并

`useLoginGate.js` 将 `disabled` 与 `error` 两种状态合并处理，并使用
`loginGate.disabledMessage`：

> 当前身份服务未配置，无法登录。请在主进程配置身份服务后重试。

这是**开发者文案**——普通用户既不知道「主进程」是什么，也无法执行该操作。
而实际触发条件通常只是断网、服务临时故障或代理拦截。

仓库已有唯一映射 `utils/identity-error-messages.js`
（`resolveIdentityStatusNoteKey` / `resolveIdentityErrorMessageKey`），
`ProfileMenu.vue` 与 `MemberCenter.vue` 均已接入，**`useLoginGate` 是唯一未接入的调用点**。
本次改为复用，并启用此前完全未使用的 `error.code`。

## 缺陷 3：诊断信息无法外发

`ipc-handlers/identity.js` 的 `safeError()` 仅回传 `error.code`，
**cause 链在主进程即中断**；`auth-service` 也从未留存原始 error。
`describeErrorChain` 生成的完整链条只进主进程日志，用户与支持侧都拿不到。

修复：
- `auth-service` 保留 `_lastError` 引用（只存引用不深拷贝，净增 0 行）
- 新增 `identity:diagnostic-report` 通道（preload 与 handler 同步注册，
  满足 `tests/ipc-contract.test.js` 的静态扫描合同）
- 报告在主进程组装并脱敏；**脱敏复用 `ipc-handlers/account.js` 的既有正则**，
  避免两套规则漂移导致「已脱敏」报告泄漏令牌

## 失败细分与引导文案

单一 `IDENTITY_NETWORK_UNAVAILABLE` 覆盖所有网络失败，导致 DNS 失败、TLS 被拦、超时
显示同一句「稍后重试」，而这三者需要的动作完全相反。现拆为：

| 细分码 | 典型触发 | 引导要点 |
|---|---|---|
| `IDENTITY_NETWORK_TLS_BLOCKED` | 企业代理、杀毒软件 HTTPS 扫描 | **请勿关闭证书校验**（会使凭证暴露给中间设备）；请 IT 加白名单 |
| `IDENTITY_NETWORK_DNS_FAILED` | 未联网、路由器 DNS 异常 | 检查网络连接，重启路由器 |
| `IDENTITY_NETWORK_TIMEOUT` | 网络较慢、服务繁忙 | 稍后重试；持续超时可换网络 |
| `IDENTITY_NETWORK_UNAVAILABLE` | 连接被拒 / 中断 | 稍后重试 |

### 安全红线

TLS 文案**必须先告诫、再给替代动作**。企业网络被拦截时，用户最可能的自发行为是
「按提示关闭证书校验」——那是把登录凭证明文暴露给中间设备，属于安全事故而非体验问题。
仅写「请勿关闭」而不给替代路径，用户仍会选择关闭。

## 诊断信息入口

新增 `IdentityDiagnostics.vue`，由 `ProfileMenu.vue` 与 `MemberCenter.vue` 共用：

- 默认收起；展开才发起 IPC（避免每次失败多一次跨进程往返），结果缓存不重复请求
- 复制成功 / 失败均有提示，失败给出手动复制兜底
- 无障碍：`aria-expanded` / `aria-controls` 完整，加载态用 `role="status"`
- 文案独立为 `src/locales/identity-diagnostics/`，不再喂 `zh.js` / `en.js` 这两个挂账大文件

## 验证

- vitest 6 文件 **121 项全绿**
- `check-locale-sync --keys` PASS（1450 key）
- `check-css-var-defined` 涉及文件 0 告警
- `check-max-lines` `auth-service.js` 499 行未触发门禁
- eslint 零告警
- 脱敏红线覆盖 7 类凭证及嵌套 cause

## 未采纳的方案

**接入既有 `DiagnosticsReporter` 自动上报**：其 taxonomy 为视频创作流水线专用
（`split` / `compose` / `generate_assets`），身份错误不属于任何阶段；上报白名单只保留
`cause_id` 分类枚举，**会丢失 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` 这类根因码**；
`diagnostics_queue` 以 `run_id` 唯一且限定三态 run，身份失败无 run。若要接入需新建
独立通道并同步改服务端，范围显著大于本次改动。一键复制作为主路径保留。

## 遗留

`check-max-lines` 在 sparse checkout 环境会报 `ops-center/*` 的 `STALE_LEDGER_ENTRY`，
系该目录未被检出所致，与本改动无关。
