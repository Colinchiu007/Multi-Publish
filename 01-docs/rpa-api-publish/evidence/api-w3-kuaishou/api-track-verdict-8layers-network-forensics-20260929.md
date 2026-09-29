# engine-w3 6.3 API 轨活体裁决——八层证据链 + 网络级取证（2026-09-28/29）

> 裁决结论（**定案**）：**API 轨未通过（spike not-go）**。八层中七层本地缺陷已修复合并（含网络级
> 取证驱动的 complete 请求头对齐），真实链已推进到 `upload/complete`；服务端对该请求的**裸 400
> （无响应体）**在**头部级对齐逐字穷尽后仍然存在**（第 11 轮活体终验实证，见下），根因收敛到
> **传输层**（TLS 指纹 / HTTP 协议版本 / QUIC）——Node axios（OpenSSL + HTTP/1.1）无法复刻
> Chrome（BoringSSL + HTTP/2-3）。**API 轨对快手当前不可用，DOM 轨为正确架构**（每轮兜底发布成功）。
>
> **登录门前置的解除记录**：第 10 轮曾因「主动操作登录门」（`useLoginGate`）拦截而 `signed_out`
> 无法触发；应用重启后身份态自动恢复 `authenticated`（`user.sub=hc2y714slpby`，`source: online`）
> ⇒ 登录门正常放行，**不构成长期阻塞**（该门为产品决策，非缺陷）。

## 活体发布时间线（用户授权 CDP 代操作，间隔均 ≥18min）

| 轮次 | 时间 | API 轨表现 | 暴露层 | 修复 PR |
|---|---|---|---|---|
| 1 | 18:43 | `taskData.video.path required` | ① 形状翻译（裸 article 直传） | #2578 |
| 2 | 22:01 | `no signer injected` | ② 链缺省不走注册表 ③ registry 命令名不匹配 | #2580 |
| 3 | 22:48 | `bridge not injected` | ④ provider require 解析到门面（双模块陷阱） | #2582 |
| 4 | 23:31 | `missing sessionKey` | ⑤ opts 不传 accountId ⑥ bindSignerCookie 零调用方 | #2585 |
| 5 | 00:20 | **签名 ✓ 分片上传 ✓** → `upload/complete HTTP 400` | ⑦ 服务端契约差异（待取证） | #2594（诊断增强） |
| 6 | 02:13 | 同（400 无体确认） | ⑦ 确认（响应体为空） | — |
| 7 | 07:33 | 同（诊断增强上线） | ⑦ 请求级诊断 | #2616 / #2619 |
| 8 | 10:07 | 同（诊断可见：Content-Type 默认注入） | ⑦ 根因：axios 注入 form-urlencoded | #2612 / #2621 |
| 9 | 14:41 | 同（无 Cookie + 短 Referer 后仍 400） | ⑦ 边缘级拒绝确认 | #2630 |
| 10 | 20:06 | 登录门拦截（`signed_out`，未触发） | ⑧ 应用身份登录门 | — |
| 11 | **21:45** | **逐字对齐后仍 `upload/complete HTTP 400`** → **传输层定案** | ⑦ 终局 | #2653（sec-ch-ua×3 + 捕获 UA） |

**第 11 轮（终验）出站请求头逐字证据**（app 日志 `API publish kuaishou` 诊断载荷，与真实浏览器一致）：

```
Accept:            application/json, text/plain, */*
Content-Type:      null（已移除，避免 axios 默认注入 form-urlencoded）
User-Agent:        …Chrome/150.0.7871.114…（与捕获的浏览器 UA 同）
Referer:           https://cp.kuaishou.com/
sec-ch-ua:         "Not;A=Brand";v="8", "Chromium";v="150"
sec-ch-ua-mobile:  ?0
sec-ch-ua-platform:"Windows"
Cookie:            已移除（跨 registrable domain 不可带，单测证 wire 已剔除）
→ 响应：HTTP 400 / content-length: 0 / 无 X-KSLOGID / 无 CORS 头（边缘级拒绝）
         alt-svc: quic=":8443"（该边缘支持 QUIC/HTTP3）
```

⇒ 请求与真实浏览器**逐字一致仍被拒**，故头部不再有可收敛空间；差异只能在**连接/协议层**。

每轮 DOM 轨兜底发布成功（作品 ID：3xvsedz34m82ppi / 3xfs9s628wkrp44 / 3xwdmnvysinp94e /
3xu9x8aypjhsque / 3xnvb9cqf6b23de / 3xh9ks8utgmqx9c / 3xcm2eirufjcgcg / 3x67aq378avwzac /
3xsed6zvzpmqtkg / 3ximt6fbg9abpsc / 3xxqqt4k9xnspcy）。

## 网络级取证（新增方法，可复用）

`capture-ks-upload-network.js`（`.agent_context/w3livefix-staging/`）：发布流期间挂所有
`cp.kuaishou.com` 目标的 CDP `Network` 域，捕获上传端点全量请求（URL / headers / postData）。

**实测捕获 42 条**，真实浏览器完整序列：
`tips/show → config → domain/list → cover/profile → upload/pre → fragment(OPTIONS+POST) →
upload/complete(200) → upload/finish → cover/view → frameUpload → recTag`。

真实的 `upload/complete` 请求（链 400 的同端点为 200）：
- URL：`https://upload.kuaishouzt.com/api/upload/complete?fragment_count=1&upload_token=…`
- 方法 POST、**空 body**、**无 Content-Type**
- 头部：`Referer: https://cp.kuaishou.com/`（短）、`Accept: application/json, text/plain, */*`、
  `sec-ch-ua` ×3（`"Not;A=Brand";v="8", "Chromium";v="150"` / `?0` / `"Windows"`）、UA Chrome/150
- **无 Cookie**（上传域跨 registrable domain，同源策略不可带）
- 响应头含 `X-KSLOGID` / `Access-Control-Allow-Origin` / `Content-Type: application/json`（真到应用层）

链的 400 响应头**无 X-KSLOGID、无 CORS 头**（`content-length: 0`）⇒ **边缘级拒绝**，未达应用逻辑。

## 八层缺陷的根因与修复（全部 TDD + QM-1 + CI 全绿合并）

1. **形状翻译**（#2578）：RpaView API-first 裸传 article（扁平 video_path），适配器契约要 `taskData.video.path`（嵌套）→ 共享翻译器 `api-task-data.js`
2. **链缺省注册表**（#2580）：构造器文档契约「缺省走进程内注册表」从未实现 → `_sign` 回退 `registry.sign`
3. **registry 命令名**（#2580）：`ns-sig3-browser` 实现传 Tier-A 名，桌面注册的是带后缀本名 → 按注册名透传
4. **provider 双模块解析**（#2582）：`require('.../src/signer')` 解析到门面（不导出 `browserPageProvider`）→ `setBridge` 静默跳过（注册日志假绿）→ 直指 `src/signer/index`
5. **sessionKey 下传**（#2585）：签名页多账号隔离 fail-closed → opts 携带 `accountId`
6. **cookie 预绑**（#2585）：`bindSignerCookie` 零生产调用方（cookieStore 恒空）→ API-first 分支求签前预绑
7. **complete 400**（#2612/#2621/#2630/#2653，四轮收敛）：
   - 分片 Content-Type `application/stream` 为过时读数 → `application/octet-stream`；complete 补 `Accept`（#2612）
   - **axios 对 `data:''` 默认注入 `Content-Type: application/x-www-form-urlencoded`** → 服务端表单解析器拒绝空 urlencoded body（裸 400）→ 显式 `'Content-Type': null` 移除（#2621，**请求级诊断定案**）
   - 上传域跨域不可带 `kuaishou.com` Cookie + Referer 短形态 → 无 Cookie + 短 Referer（#2630）
   - 头部与捕获请求逐字一致：`sec-ch-ua` ×3 + 捕获 UA Chrome/150（#2653）
   - **仍未通过**：头部差异穷尽后 400 不变 ⇒ 传输层差异（TLS 指纹 / HTTP 版本 / QUIC）为剩余候选，Node axios 无法复刻
8. **应用身份登录门**（#2645 等并行切片引入）：未登录触发主动操作（发布）→ `useLoginGate` 弹「需要登录」确认框，`identityStore.isAuthenticated=false` 时拒绝。**属产品决策，非缺陷**；但改变了「活体裁决」的前置条件（见下节）

**诊断方法学（本链条的可复用产出）**：报错只有状态码时无法定位契约差异 → 诊断信息必须走
**错误消息本体**（链的 logger 在桌面装配里是 console，stdout 不可见；错误消息经 rpa-view-manager
的 catch 必落应用日志），携带完整出站 URL + 请求头（cookie 脱敏为长度）+ 响应头。

## 6.3 任务裁决

**保持未勾**（spike not-go）：API 轨未完成发布。裁决证据完整——八层中七层已修复（每层独立 PR +
回归锁），第 7 层已把**头部级差异穷尽**，剩余候选为传输层；第 8 层为产品登录门（非缺陷）。

## 终局与后续（2026-09-29 定案）

**登录门阻塞已解除**：第 10 轮的 `signed_out` 经应用重启后自动恢复为 `authenticated`
（`user.sub=hc2y714slpby`、`source: online`）⇒ 登录门正常放行，第 11 轮终验得以执行。
（登录门是产品决策、非缺陷；当时状态为会话未加载而非不可登录。）

**终局**：第 11 轮以**与真实浏览器逐字一致的请求头**重试完整链，仍在 `upload/complete` 得到
裸 400 ⇒ 头部级无剩余可收敛空间，差异在连接/协议层。**API 轨对快手当前不可用，DOM 轨为正确架构**
（11 轮全部兜底发布成功）。

**建议的后续路径**（如需继续投入 API 轨，按性价比排序）：
1. **不再投入头部级取证**（已穷尽；本链共 4 轮、多 PR 归零于同一 400）
2. 若必须走 API：改为**借浏览器传输**——在同一受信会话内用 `fetch` 发上传域请求（CDP 驱动或页面内
   `fetch`），即"用浏览器的 TLS/HTTP2/3 栈发链的请求"，而非 Node axios
3. **保留 DOM 轨为快手默认发布路径**（11/11 成功、含风控兜底与回查），API 轨仅在具备浏览器传输
   能力时再评估

**复跑入口（脚本已留档，`.agent_context/w3livefix-staging/`）**：`drive-publish-step1/2/4.js`
（导航→注入→发布）、`capture-ks-upload-network.js`（网络取证）、`probe-renderer-health.js`
（空白页自愈 reload）、`probe-identity2/3.js`（身份态）、`dismiss-modals.js`（模态遮挡清理）。
应用重启后页面可能空白，先跑 `probe-renderer-health.js` 触发 reload 再驱动。

## 附：同场验证的修复

- ImpactTracker `scheduleImpactTracking` 正常调度 + 基线快照落库（缺陷②，#2578）
- PublishMonitor kuaishou 干净 skipped（缺陷③，#2578）
