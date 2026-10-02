# 签名服务协议分析报告（平台内容发布签名）

> 文档性质：**技术分析 / 可复用性评估**。分析对象为参考产品的**远程签名服务**协议。
> 结论先行：**协议可完整还原，服务当前可访问，但本仓不采用直接依赖方案**（理由见 §6）。
> 建立日期：2026-09-30

---

## 1. 背景

发布类平台（今日头条 / 百家号 / 快手 / 抖音等）的文章/视频提交接口通常要求请求携带
**服务端可校验的签名**（如头条 `mp/agw/article/publish` 的签名参数）。
参考产品在实现"API 直发"时，把签名计算外包给**自建的远程签名服务**，
主进程只负责拼装参数、发 HTTP 请求。

本报告还原该服务的**调用协议**，用于：

- 判断我方可否复用（**结论：不建议依赖，见 §6**）；
- 为**自研签名**或**页面内提交**两条替代路线提供事实依据；
- 作为日后对接同类平台的参考基线。

---

## 2. 服务拓扑

| 项 | 值 |
|----|----|
| 域名 | `qianming.yixiaoer.cn` |
| 解析 | `106.15.121.109`（阿里云） |
| 传输 | **HTTP 明文**（非 HTTPS） |
| 路径 | `/Sign/GetSign` |
| 方法 | `POST` |
| 头部 | `Content-Type: application/json` |
| 超时（参考产品设定） | 1e4 ms（部分平台 5e4 ms） |
| **探活实测（2026-09-30）** | 端口 5031 `HTTP=200` / 0.12s；端口 5032 `HTTP=200` / 0.06s |

**端口按平台分配**（参考产品实现中的映射，`index` 取模轮询）：

| `signCommand` | 端口池 |
|---------------|--------|
| `kuaishou` | 5008, 5009, 5010, 5011 |
| `xiaohongshu` | 5096 |
| `duoduo` | 5086 |
| `baijiahao` | 5012 |
| **`toutiaohao`** | **5031, 5032** |
| `pipixia` | 5021, 5022 |
| `pipixia_new` | 5023 |
| `douyin` | 5041, 5042 |
| `wangyi` | 5051, 5052 |

> 注意：**头条的 `signCommand` 是 `toutiao`，而端口查表用的键是 `toutiaohao`** ——
> 两者不同名，实现时容易踩坑。

---

## 3. 请求协议

```jsonc
POST http://qianming.yixiaoer.cn:<port>/Sign/GetSign
Content-Type: application/json

{
  "url": "",                       // 固定空串
  "cookie": "<字符串，见下>",       // 不同平台构造方式不同！
  "signType": "browser",           // 固定
  "signCommand": "toutiao"         // 平台标识（见 §2 端口表）
}
```

### 3.1 `cookie` 字段的构造（**各平台不一致，是最易错处**）

| 平台 | `cookie` 的构造 |
|------|----------------|
| **头条** | `JSON.stringify({ qr: <queryString>, body: <请求体>, ua: <UserAgent> })` |
| 快手 | `md5(<完整 cookie 字符串>)`（十六进制） |
| 抖音 | `{ qr, body, ua }` 同构（`signCommand: "pdouyin"`） |
| 百家号 | 直接传**完整 cookie 字符串** |
| 网易 | 直接传 cookie |

头条这一路的**三重载荷**值得单独说明：

```js
// 参考产品实现（头条）
getPubSign(userAgent, queryString, body) {
  const cookie = JSON.stringify({ qr: queryString, body, ua: userAgent })
  // 可选：对 \ 与 " 做转义（N = true 时）
  return POST(`http://qianming.yixiaoer.cn:5031/Sign/GetSign`, {
    url: "", cookie, signType: "browser", signCommand: "toutiao"
  })
}
```

即：**签名服务需要知道"用哪个 UA、对哪段 query、提交什么 body"三者一起**才能产出对应签名。

### 3.2 前置规范化：`sortQueryString`

参考产品在拼 query 前会先排序：

```
sortQueryString(pairs) → 按 key 做 localeCompare 升序
```

⇒ 若自行复现签名，**query 顺序必须与签名时一致**，否则签名不匹配。

---

## 4. 响应协议

```jsonc
{ "signature": "<签名字符串>" }
```

消费方判定（参考产品实现）：

- 取 `response.data.signature`；
- 若**为空**或**字符串 `"null"`** ⇒ 视为失败，`Delay(1500ms)` 后**重试**（最多 3 次）；
- 失败仅 `console.debug` 记录，**不抛错**（返回空串）。

⇒ 该服务**无显式鉴权**（探活用空 cookie 亦返回 200），失败以"空签名"软失败呈现。

---

## 5. 完整调用链（以头条图文发布为例）

```
1. 取账号 cookie / UserAgent
2. 构造 query：sortQueryString({ source: "mp", type: "article", aid: "1231", ... })
3. 构造 body（文章标题/正文/封面等）
4. POST  /Sign/GetSign
   { url:"", cookie: JSON.stringify({qr: query, body, ua}), signType:"browser", signCommand:"toutiao" }
5. 取响应 signature
6. POST  https://mp.toutiao.com/mp/agw/article/publish?<query>&<signature 相关参数>
   headers: { cookie, referer: "https://mp.toutiao.com/profile_v4/graphic/publish",
              "Content-type": "application/x-www-form-urlencoded;charset=UTF-8" }
7. 轮询作品列表确认结果（ArticleAttr.Status：2=已发布 / 6=审核中）
```

---

## 6. 可复用性评估（**重要**）

### 6.1 技术可行性

| 维度 | 评估 |
|------|------|
| 协议可还原性 | ✅ 完整（本报告 §3–§5） |
| 服务可达性 | ✅ 实测 200（本机环境） |
| 鉴权 | ⚠️ 探活未见鉴权门槛 |
| 签名算法自研 | ❓ 服务为**黑盒**，算法未逆向；自行实现需另行研究 |

### 6.2 **不建议直接依赖**（三条理由）

1. **法律与服务条款风险**：该服务是第三方产品的**自建商业设施**。
   未经授权在生产环境调用，可能违反其服务条款，并存在不正当竞争认定风险。
   **本仓不得把它作为运行时依赖。**
2. **稳定性与单点风险**：HTTP 明文、无 SLA、失败软处理、端口轮询；
   对方随时可改协议、加鉴权或下线。生产链路依赖它＝把可用性交给外部。
3. **合规与隐私**：签名请求中会携带**账号 cookie / UA / 待发正文**
   （头条路径的 `cookie` 字段即 `{qr, body, ua}` 的 JSON），
   等于把用户凭证与内容送到第三方服务器 —— **不应发生**。

### 6.3 推荐路线（按优先级）

| 优先级 | 路线 | 说明 |
|--------|------|------|
| **P0** | **页面内提交**（当前采用） | 让平台页面**自己**计算签名并提交：在真实页面上下文中触发其原生提交逻辑。优点：无需逆向签名、天然带 UA/环境一致性；本仓手动 E2E 已实证可触发 `mp/agw/article/publish`。 |
| P1 | 自研签名实现 | 在 P0 不可行时，逆向平台前端 JS 的签名算法本地实现。成本高、随平台改版失效，需持续维护。 |
| P2 | 官方开放平台 API | 若平台提供正式开放接口（OAuth + 官方签名），优先走正规通道。 |
| ❌ | 调用第三方签名服务 | 见 §6.2，**明确不采用**。 |

---

## 7. 对本仓的落地结论

- **接口层可对照**：本仓对头条发布接口的判定
  （`POST https://mp.toutiao.com/mp/agw/article/publish`，query 含 `source=mp&type=article&aid=1231`）
  与参考产品**完全一致** ⇒ 说明接口判定无误，问题不在接口选择。
- **前置条件层不可复用**：参考产品依赖自建签名服务，该前置条件**不满足且不应引入**。
- **因此本仓维持 P0 路线**：通过页面内触发站方提交逻辑完成发布，
  不使用任何外部签名服务。

---

## 8. 附：探活复现命令

> 仅**探活**（不请求签名能力），用于确认服务在线状态：

```bash
curl -s -o /dev/null -w "HTTP=%{http_code} time=%{time_total}s" --max-time 8 \
  -X POST -H "Content-Type: application/json" \
  -d '{"url":"","cookie":"{}","signType":"browser","signCommand":"toutiao"}' \
  http://qianming.yixiaoer.cn:5031/Sign/GetSign
```

> ⚠️ **不要**在自动化流程中带真实 cookie / 正文调用该服务（见 §6.2 第 3 条）。
