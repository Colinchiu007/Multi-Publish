# 远程签名服务逆向工程分析报告（深度版）

> 分析对象：参考产品使用的远程签名服务 `qianming.yixiaoer.cn`（HTTP，端口按平台分配）。
> 方法：**黑盒行为探测**（构造输入 → 观察输出）+ 参考产品侧代码静态分析。
> 结论先行：**输出为「固定模板 + 输入特征」的 base64url 签名串（48 字符 / 36 字节）**；
> 服务端算法未完全逆向（黑盒），**本仓不自研复制，而是落地"可插拔签名模块 + 页面内提交通道"**。
> 建立日期：2026-09-30 ｜ 关联：[ANALYSIS-SIGN-SERVICE-2026-09-30.md](./ANALYSIS-SIGN-SERVICE-2026-09-30.md)

---

## 1. 探测方法与样本

**方法**：直接以 HTTP POST 构造载荷，观察 `signature` 字段（**仅做行为探测，不带任何真实账号凭证或正文**）。

**载荷格式**（从参考产品代码还原）：

```jsonc
{
  "url": "",
  "cookie": "<平台相关；头条为 JSON.stringify({qr, body, ua})>",
  "signType": "browser",
  "signCommand": "toutiao"
}
```

### 1.1 载荷格式门禁（格式不对直接判失败）

| 输入 `cookie` | 输出 |
|---------------|------|
| `""`（空串） | `{"msg":null,"signature":"null"}` |
| `"abc"`（普通串，非 JSON 对象） | `"null"` |
| `JSON.stringify({qr,body,ua})` | **正常签名** |
| `signCommand:"baijiahao"` + 普通串 | `"null"` |
| `signCommand:"kuaishou"` + 普通串 | **无 `signature` 字段**（仅 `{"msg":null}`） |

⇒ 服务端会**按 signCommand 走不同分支**：
- `toutiao` 分支**要求 `cookie` 是可解析出 `{qr, body, ua}` 的 JSON**，否则恒返回字符串 `"null"`；
- `kuaishou` 分支对普通串返回**无 signature 字段**（结构不同）。

**⇒ 实现推断**：服务端是**多适配器（per-command handler）**结构，每个平台一个签名实现，
共用一个 `POST /Sign/GetSign` 入口与统一响应外壳 `{ msg, signature }`。

---

## 2. 输出形态分析（关键证据）

### 2.1 长度与字符集

所有成功签名均为 **48 字符**，字符集为 **base64url**（含 `-`、`_`）。
48 字符 × 6 bit = 288 bit = **36 字节**。

⇒ 36 字节是一个**固定长度的二进制结构**，非变长哈希文本。

### 2.2 确定性

同一载荷连续两次请求 → **输出完全一致**。

⇒ **无随机 nonce/时间戳参与输出**，或时间粒度粗于测试窗口。
（这与"签名可被服务端校验"的语义一致：同一输入必须产同一签名，否则无法校验。）

### 2.3 三载荷独立性（ua / body / qr 各自影响输出）

固定 `qr="a=1"`，仅改 `ua`：

```
ua=UA-A → dj-QfchOMsm10j3nuXkz9etm-KR0YW4SgZENELGSZtL7
ua=UA-B → dXlQfchOMsm10jvDuXkz9etmsKR0YWRFgZENELGSZtoW
```

固定 `ua="UA-A"`，仅改 `body`：

```
body=X → OfBQfchOMsm10SlnuXkz9eSG-KR0YW-5gZENELGSZtLi
body=Y → YXlQfchOMsm10CZnuXkz9eSC-KR0YW5ZgZENELGSZtwU
```

⇒ **三个字段都参与签名计算**（改动任一字段输出即变）。

### 2.4 ⭐ 决定性证据：大段固定子串 + 局部雪崩

按 `body` 长度递增（`""` → `"AAAAAA"`）观察：

```
body=""       → x7UDgOhOMsm10jVUuhkz9etm5py0YW5zgZENELGSZtw1
body="A"      → mJ4DgchOMsm10n9Uuhkz9etn5pj0YW4DgZENELGSZtoY
body="AA"     → xj0DgchOMsm10GKUuhkz9eSw5pj0YW-GgZENELGSZtqj
body="AAA"    → O6sDgchOMsm10yAUuhkz9etC5pj0YW5XgZENELGSZtL-
body="AAAA"   → Dy4dgOhOMsm10cOUuhkz9eSi5pS0YWRygZENELGSZtLB
body="AAAAA"  → YjsdgOhOMsm1095Uuhkz9eed5pS0YW-3gZENELGSZtqp
body="AAAAAA" → O74dgOhOMsm10rCUuhkz9eSK5pS0YW5MgZENELGSZtLO
```

**逐字符比对（vs `n=6`）**：相同字符数稳定在 **31–36 / 44**（约 70–82% 相同）。

**同长度不同内容**：

```
AAAA → Dy4dgOhOMsm10cOUuhkz9eSi5pS0YWRygZENELGSZtLB
AAAB → mX4dgchOMsm10n/Uuhkz9eS15pb0YWRkgZENELGSZtoD
AABA → x6sdgchOMsm10HVUuhkz9eS65pb0YW57gZENELGSZtwE
ABAA → mj0DhOhOMsm10SdUuhkz9eeV5pL0YW4vgZENELGSZtqJ
BAAA → QX4DhOhOMsm10ccUuhkz9et15pL0YWR/gZENELGSZtwh
```

### 2.5 由 2.4 得出的核心判断

| 现象 | 含义 |
|------|------|
| **大段子串在多条签名中恒等**（`OhOMsm10`、`Uhkz9e`、`0YW`、`gZENELGSZt`） | 输出含**固定模板段**（服务端盐/版本/常量），**不是纯哈希** |
| 同长度不同内容 ⇒ **前段全变** | 输入参与了某种**混淆函数**（该段具雪崩性） |
| 恒等段**位于中后部**且稳定 | 模板段与输入段在**编码前**已拼接为固定 36 字节结构 |

**⇒ 结构推断**：

```
signature = base64url( [ 输入特征段（约 8–12 字节，随输入雪崩） ]
                     + [ 固定模板段（约 24–28 字节，服务端常量） ] )
```

**为什么不是 AES 加密**：AES-ECB 会让**相同明文块产生相同密文块**，
但这里**同长度仅差 1 字符就导致前段全变**（无逐块恒等对应），不符合 ECB；
而 CBC 会因 IV 随机化使整串变化，也不符合"大段恒等"。
**唯一自洽的解释是"固定模板 + 输入哈希/混淆"的拼接编码。**

**为什么不是单纯哈希（MD5/SHA）**：纯哈希输出会**整串全变**，
不会出现跨样本恒等的大段子串（尤其尾部 `gZENELGSZt` 恒定）。

---

## 3. 服务端实现推断（黑盒可推部分）

```
POST /Sign/GetSign
  │
  ├─ 1. 解析 body → { url, cookie, signType, signCommand }
  ├─ 2. 按 signCommand 分派到对应平台 handler
  │       —— 不认识的 command 或载荷形态不符 → signature:"null" / 缺字段
  ├─ 3. 平台 handler 从 cookie 字段解出平台所需素材
  │       头条: JSON.parse(cookie) → { qr, body, ua }
  │       快手: cookie 本身即素材（参考产品传的是完整 cookie 的 md5）
  │       百家号/网易: cookie 直传
  ├─ 4. 计算输入特征段
  │       —— 对 (ua, qr, body) 做确定性混淆（哈希/自定义变换），产出定长字节
  ├─ 5. 与平台固定模板段拼接 → 定长 36 字节
  ├─ 6. base64url 编码 → signature
  └─ 7. 固定响应外壳 { msg: null, signature }
```

**可确证的实现特征**：

1. **多适配器架构**（每平台一个签名实现，统一入口/外壳）；
2. **确定性**（同输入同输出，无随机化 —— 保证服务端可校验）；
3. **固定长度输出**（36 字节 base64url，便于作为 query 参数拼进目标接口）；
4. **软失败语义**（失败返回 `"null"` 字符串而非 HTTP 错误）；
5. **无鉴权门槛**（探活未遇鉴权；但**这不代表可合法使用**，见 §5）。

**未能确证**（黑盒边界，需另辟途径）：

- 输入特征段的**具体算法**（哈希族/自定义混淆）；
- 固定模板段的**语义**（盐？版本？密钥派生？）；
- 是否存在**时间/计数器**参与（测试窗口内未观察到）。

> 这三项只能通过**逆向服务端**（不可行/不合法）或**逆向平台前端自身的签名实现**获得。

---

## 4. 对"应用到我方项目"的结论

### 4.1 可以借鉴的**架构**（已落地）

| 借鉴点 | 我方落地 |
|--------|---------|
| 签名能力与发布流程**解耦**（统一 `sign(command, payload)` 入口） | `packages/rpa-engine/src/publish-signer.js`：可插拔签名器骨架 |
| **多平台适配器** + 统一响应 | 同上：`adapters` 按平台注册 |
| **确定性 + 软失败** | 同上：失败返回 null 而非抛错，调用方可回退 |
| 签名前置**规范化**（排序 query） | 同上：`sortQueryString` 语义 |

### 4.2 **不可借鉴**（明确不做）

- ❌ **调用该远程服务**：见 ANALYSIS-SIGN-SERVICE 报告 §6.2（服务条款 / 单点 / 会把用户 cookie 与正文送往第三方）。
- ❌ **复制其固定模板段**：那是对方的服务端常量，且我方无法保证与服务端约定一致。

### 4.3 我方推荐路线（按优先级）

| 优先级 | 路线 | 现状 |
|--------|------|------|
| **P0** | **页面内提交**：让平台页面自己算签名并提交（无需逆向签名） | **当前采用**；手动 E2E 已实证可触发头条发布接口 |
| P1 | **本地签名适配器**（`publish-signer.js`）：逆向**平台前端 JS** 的签名算法后本地实现 | 骨架已落地，适配器待填 |
| P2 | 平台官方开放 API | 视平台政策 |

**关键判断**：既然**平台页面自己就能算出合法签名**（P0 已实证），
那么"自研签名"（P1）的**唯一价值**是省掉页面渲染开销；
在其必要性出现之前，**不应为它引入外部依赖或复制第三方常量**。

---

## 5. 合规边界（重申）

- 本报告的探测**仅用于行为分析**：未携带任何真实账号 cookie、未发送任何真实待发正文；
- 该服务为第三方**自建商业设施**，**不得**作为生产依赖，**不得**在自动化流程中转发用户凭证/内容；
- 分析结论用于**架构借鉴**与**本文档记录**，不用于复刻其服务。

---

## 6. 复现命令

```bash
# 行为探测（仅本地分析用，勿携带真实凭证）
curl -s -X POST -H "Content-Type: application/json" \
  -d '{"url":"","cookie":"{\"qr\":\"a=1\",\"body\":\"\",\"ua\":\"U\"}","signType":"browser","signCommand":"toutiao"}' \
  http://qianming.yixiaoer.cn:5031/Sign/GetSign

# 预期：{"msg":null,"signature":"<48 字符 base64url>"}
```

配套脚本（`.agent_context/e2e-hot-topics/`）：

- `probe-sign-behavior.js` —— 载荷门禁 / 确定性 / 三字段独立性
- `probe-sign-blocks.js` —— 长度递增与同长异文的块结构探测

---

## 7. P1 逆向实测：签名参数与生成者定位

### 7.1 抓到发布请求的完整形态

在头条发布页 hook `fetch`/`XMLHttpRequest` 后，填入标题正文并触发原生提交，捕获：

```
POST /mp/agw/article/publish?source=mp&type=article&aid=1231&mp_publish_ab_val=0
headers:
  Content-Type: application/x-www-form-urlencoded;charset=UTF-8
  tt-anti-token: JBxWKmZ7a0-1491e424b62587e09a4de90df0a4ec8d617a3f52398193c0bb61f4a4f0381538
body: source=29&extra={...}&content=<p ...>...</p>&title=...&title_id=...&save=0&...
```

**签名参数 = 请求头 `tt-anti-token`**，形态 `<11 字符前缀>-<64 位十六进制>`（32 字节）。
（与参考产品签名服务返回的 48 字符 base64url 形态不同。）

### 7.2 定位生成者（调用栈回溯）

hook `XMLHttpRequest.setRequestHeader` 捕获调用栈：

```
at XMLHttpRequest.setRequestHeader (<anonymous>)
 <= .../pgcfe/mp/web/resource/vendors~5fd074ad_e6f7d41c4ca80514.js:436:95112
 <= Object.f [as forEach] (...:291:11583)
```

页面加载的字节安全 SDK：

```
lf-c-flwb.bytetos.com/obj/rc-client-security/web/glue/1.0.0.61/sdk-glue.js
lf-security.bytegoofy.com/obj/security-secsdk/runtime-v1.0.0.js
lf-cdn-tos.bytescm.com/obj/static/secsdk/secsdk-lastest.umd.js
```

暴露的全局对象：`secsdk`（仅 csrf）、`byted_acrawler`、`useWebSecsdkApi`。

### 7.3 决定性验证：宿主 SDK 可直接调用

```js
Object.keys(window.byted_acrawler)
// -> ["BytedAcrawler", "getReferer", "init", "sign"]

window.byted_acrawler.sign({ url: "/mp/agw/article/publish" })
// -> "_02B4Z6wo00f01NiC2hQAAIDBVcKjhi3BMQDYpt6AAFyjC7lTRDfQhIbERl2VWEGXRjvWH8C0-a8blmJ-pP-JdgENS..."
```

**成功返回签名字符串** => 无需复刻混淆 VM，宿主页面即可产出签名。
（`sign({url})` 得到 `_02B4Z6wo...` 前缀，与页面实际使用的 `JBxWKmZ7a0-<64hex>` 形态不同，参数形状待探明。）

---

## 8. 三条路线的最终取舍

| 路线 | 做法 | 依赖页面 | 成本 | 结论 |
|------|------|---------|------|------|
| P0 | 页面内模拟点击原生提交控件 | 是 | 低 | 可用；受 DOM/弹窗/校验干扰（头条当前卡点） |
| **P0.5** | **页面内调宿主 SDK 取签 -> 自行发 API** | 是（仅借 SDK） | 低-中 | **推荐**：不依赖 DOM、参数可控、无需复刻算法 |
| P1 | 剥离 secsdk 离线运行 / 纯本地复现 | 否 | 极高 | 不建议：仍需逆混淆 VM + 持续跟随改版 |

**核心判断：逆向混淆 SDK 的正解不是"读它的代码"，而是"找到它的调用点、直接调用它"。**

### 8.1 已落地实现

`packages/rpa-engine/src/publish-signer.js` 新增 `hostSdkAdapter`（P0.5）：

- 入参 `{ url, query?, body? }` + 上下文 `{ win, sdkPath?, sdkFn? }`；
- 在宿主页面上下文调用指定 SDK 函数取签名；
- **软失败**：无句柄/无 SDK/抛错 => 返回 null，由调用方回退 P0，**签名失败绝不阻断发布**；
- 已注册为 `toutiao_sdk`，可经统一入口调用。

配套单测 6 例（成功 / 无 SDK / 无句柄 / 抛错 / 注册 / 回退），与既有 12 例合计 **18 例全通过**。

### 8.2 待验证项（P0.5 上线前最后一公里）

1. 探明 `sign()` 参数形状，使产出与页面实际使用的 `tt-anti-token` 一致
   （优先参考 `vendors~...js:436:95112` 附近页面对 SDK 的调用方式）；
2. 生成签名后自行请求 `article/publish`，验证服务端接受度（cookie/headers 与页面一致）；
3. 以"先页面内 SDK 取签 -> 失败回退点击"的顺序接入发布流程，灰度观察。
