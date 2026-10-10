# PRD：小红书草稿箱发布（xhs-draft-publish，2026-10-07）

> 需求来源：热门选题 E2E ——「其中小红书比较特殊，只需要实现放在小红书草稿箱就行」

## 1. 背景与问题

热门选题一键生成视频/图文后要「能发的都发」。7 个平台中 6 个已有可用发布链，
**小红书此前是唯一一条走不通的链路**，根因有三处（均已实证）：

| # | 缺陷 | 证据 |
|---|---|---|
| 1 | 签名是占位实现 | `signer-local.js` 的 `getXiaohongshuSign` = `md5(ts + "MirAR" + body)`，与平台算法无关 |
| 2 | 签名被塞进 query | `adapters/xiaohongshu.js` 写 `params = { sign: {X-s, X-t} }`，对象会被序列化成 `sign=[object Object]` |
| 3 | 端点不存在 | 该 adapter 打 `/api/publish`；平台真实提交通道见 §2 |

另：`signer-assembly.js` 里小红书标着 `verified: false`、`moduleId: -1`，
注释写「x-s 依赖外包签名服务，本波只留 provider 槽不激活链」——**该链路从未真正启用过**。

## 2. 平台接口（公开资料实证）

### 2.1 三步发布

```
1. POST https://creator.xiaohongshu.com/api/media/v1/upload/web/permit
   body: { file_name, file_size, media_type }
   resp: { code:0, data:{ file_id, token, cos_key } }

2. PUT  https://ros-upload.xiaohongshu.com/{file_id}
   headers: X-Cos-Security-Token: <token>
   body: 图片二进制

3. POST https://edith.xiaohongshu.com/web_api/sns/v2/note
   headers: Cookie + Authorization: AT <token> + 小红书签名头
   body: { title, desc, image_list:[{file_id}], draft }
```

### 2.2 认证

| 凭据 | 用途 |
|---|---|
| Cookie `a1` | 签名必需（fail-closed 校验项） |
| Cookie `web_session` | 会话 |
| Cookie `access-token-creator.xiaohongshu.com` | `Authorization: AT <token>` |

### 2.3 签名（X-s / XYW_ 形态）

```
X-s = "XYW_" + hex(AES-128-CBC(
         base64("x1={md5('url=' + fullUri)};x2={envFlags};"
                "x3={a1};x4={timestampMs};"),
         key = 7cc4adla5ay0701v, iv = 4uzjr7mbsibcaldp))
```

配套请求头：`x-t`（毫秒时间戳）、`x-s-common`（设备指纹）、
`x-b3-traceid`(16 hex)、`x-xray-traceid`(32 hex)。

**关键取舍：只实现 `XYW_`，不实现 `XYS_`。** 公开资料显示老 `XYS_` 形态已被小红书
数据接口以 **HTTP 406** 拒绝，只有 `XYW_` 可用（Go 版独立实现
`tamnd/xiaohongshu-cli` 同样只走 `XYW_`，两者常量互相印证）。

## 3. 方案选择

| 方案 | 评估 |
|---|---|
| A. 移植算法到 JS | XYW_ 本质是纯 AES-128-CBC，Node 内置 `crypto` 一等公民，约 150 行；无 IPC、无额外进程 |
| B. Python bridge 调用 xhshow | 需拉起常驻 Python 服务、加 IPC 往返；算法本身不依赖浏览器/VM 环境，bridge 是纯开销 |

**选定 A**（算法取自开源实现，载体用 JS）。与既有 kuaishou 的隐藏浏览器抽签不同：
**不开任何窗口**，因而不会引入 `wechat_mp` / `baijiahao` 那类隐藏窗口原生崩溃面。

## 4. 功能需求

| # | 需求 | 验收 |
|---|---|---|
| FR-1 | 生成真实 `XYW_` 格式 X-s | 与参考实现逐字节等价（交叉校验脚本钉住） |
| FR-2 | 签名失败 fail-closed | 缺 `a1` 抛错，**不得**退回占位签名 |
| FR-3 | 签名以独立 header 下发 | 不得出现 `sign=` query 参数 |
| FR-4 | 三步链路（permit → PUT → note） | 顺序与端点严格按 §2.1 |
| FR-5 | **默认草稿**（`draft: true`） | 内容落创作者中心草稿箱，不公开发布 |
| FR-6 | 无图片 fail-closed | 平台不支持纯文字笔记 |
| FR-7 | 业务错误码如实上报 | `code != 0` 抛错，**不得**当成功 |
| FR-8 | 不创建 BrowserWindow | 求签不触碰隐藏窗口（安全不变量） |

## 5. 非功能需求

- 纯本地计算：签名只依赖 `node:crypto`，不引入新依赖
- 平台兼容性：`envFlags` / `webBuild` 等指纹常量集中单点维护，平台改版时改一处
- 可解密调试：保留 `x-s` 解码能力定位签名不匹配

## 6. 落地范围

| 文件 | 变更 |
|---|---|
| `packages/api-publish-engine/src/signer-local.js` | 真实 XYW_ 实现（替换 md5 占位） |
| `packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js` | **新增**：三步草稿箱发布链 |
| `packages/api-publish-engine/src/adapters/xiaohongshu.js` | 重写：修端点 + 修签名结构 + 加草稿语义 |
| `apps/desktop/electron/signer/signer-assembly.js` | 小红书改 `localAlgorithm` 形态（不开窗） |
| `apps/desktop/electron/tests/signer-xhs-local.test.js` | **新增**：激活与安全不变量 |
| `packages/api-publish-engine/tests/signer-local-xyw.test.js` | **新增**：签名契约 |
| `packages/api-publish-engine/tests/signer-local-xyw-crosscheck.js` | **新增**：与参考实现交叉校验 |

## 7. 风险与遗留

| 风险 | 处置 |
|---|---|
| 平台改签名算法 | 常量单点维护；签名头是唯一收敛点，改版只动一处 |
| `envFlags` 失配导致 406/签名不匹配 | 默认取常规桌面 Chrome 取值；失配时有明确报错而非静默成功 |
| 草稿箱接口无公开文档 | 依据 `xhs-mcp` / `openclaw-xiaohongshu-skill` 等公开实现的端点与字段形态；真机验证为最终判据 |
| **尚未真机验证** | 本 PR 完成的是实现 + 契约测试 + 交叉校验；**草稿箱真机写入待验证**，未验证前不得宣称可用 |

---

# 增补：XYS_ 签名页升级 + note 页内整发（2026-10-10 增补）

> 增补来源：#3215（签名代差根因）+ #3257（页内整发机制）。原 PRD 第 3 章的技术选型 A（本地 XYW_ 纯算法）
> 已被真机取证推翻，本章为现行有效方案。

## 8. 签名代差根因（真机取证结论）

### 8.1 事实链

| # | 事实 | 取证方式 |
|---|---|---|
| 1 | 真机浏览器 x-s 是 **XYS_ 前缀**（约 300 字符） | CDP attach 签名页抓 28 条请求（`.agent_context/xhs-real-signature-sample.json`）|
| 2 | 页内生成入口是 `window._webmsxyw(url, data)` | CDP `Runtime.evaluate typeof` 直证 |
| 3 | 返回形态为 Base64 JSON 信封 `{signSvn:"56", signType:"x2", appId:"ugc", signVersion:"1", payload:<hex>}`，长度 664 | 页内调用解码 |
| 4 | 本地 XYW_（AES-128-CBC 定长 hex，~420 字符）是**旧协议仿制**，与信封结构完全不同 | 结构对比 |
| 5 | note 端点（edith `/web_api/sns/v2/note`）只认新签名：带页内签名+登录态后响应从 406 变 **业务层响应** | probe 全链真机 |
| 6 | 原记载「XYS_ 已被 406 拒、只有 XYW_ 可用」**已失效** | 本文件 8.1-1/5 与其矛盾，以本章为准 |

### 8.2 对第 3 章选型的修订

- **选项 A（本地 XYW_ 纯算法）作废**：签名格式代差不可用参数修补弥合。
- **现行方案 C（页内求签，browser 形态）**：隐藏 sandbox BrowserWindow 加载 `creator.xiaohongshu.com`，
  页内执行 `window._webmsxyw` 取真签名——与浏览器行为逐字节一致，随平台升级自动跟随。
- 本地 `signXiaohongshuLocal`（XYW_ AES）保留为**降级路径**（轻接口登录巡检仍可用），note 链不再直连。

## 9. 页内整发机制（pageInpage，本 PR #3257）

### 9.1 数据校验

| 校验 | 规则 | 失败行为 |
|---|---|---|
| accountId | 与 credential-diagnostics 同款正则 `^[a-zA-Z0-9_-]+$` | 主进程侧 fail-closed 返回 `stage:validate` |
| a1 cookie | 缺失即抛 `XHS_MISSING_A1`（链入口） | 不发起任何请求 |
| Authorization | 缺失即抛 `XHS_MISSING_AUTHORIZATION` | 同上 |
| images | 空数组抛 `XHS_NO_IMAGE`（平台不支持纯文字） | 同上 |
| title | 非空，超 20 字截断 | — |
| sendNote 返回 status>=400 | 抛 `XiaohongshuDraftError`（携带 httpStatus） | 中止链路，探针如实回传 |
| sendNote 返回 code!==0 | `assertBusinessOk` 抛业务错误（bizCode/bizMsg 入 chainDetail） | 同上 |
| draft 锁 | probe 通道**锁死 true**（#3215 审查 i2），调用方传 draft:false 被忽略 | — |

### 9.2 流程（页内路径）

```
probe 调用（renderer → IPC xiaohongshu:probe-draft-chain）
  → 阶段1 凭据解密（DPAPI，主进程内）
  → 阶段2 签名器装配（browserPageProvider 桥，fail-closed → stage=signer-bridge）
  → 阶段2.5 页内整发准备：
       bindSignerCookie("xiaohongshu", accountId, cookie)   ← cookie in-proc 注入页 session
       asm.getOrCreatePage(...)                             ← 取签名页句柄（按账号隔离）
       构造 sendNote = 页内 executeJavaScript(fetch(url, {headers, body, credentials:"include"}))
       任一步失败 → 降级回 http 路径（pageInpage=undefined，只进日志不阻断）
  → 阶段3 链执行：permit(GET) → ros-upload(PUT) → note（pageInpage.sendNote 页内整发）
       note 失败语义与 http 路径一致（业务码入 chainDetail 回传）
```

### 9.3 功能逻辑要点

- **签名页按账号隔离**：`platform::accountId` 键复用页实例；挂起/异常页下次求签自动重建（自愈）。
- **降级三层**：页内整发准备失败 → http 路径；签名页连续失败 ≥3 次 → degraded 拒签（await 自愈/手动 resetState）；
  localAlgorithm（XYW_）仅剩登录巡检等轻接口使用。
- **零回归**：`pageInpage` 缺失时 `submitNote` 行为与 #3215 前完全一致（单测钉住）。
- **noteOrigin**：`creator`/`edith` 双路由在页内路径同样生效（A/B 对照保留）。

### 9.4 交互逻辑（探针回传面）

| 字段 | 说明 |
|---|---|
| `data.stage` | `validate` / `credentials` / `signer-bridge` / `publish`——失败发生在哪一段 |
| `data.errorCode` | `XHS_*` 系列错误码 / 平台 bizCode |
| `data.chainDetail` | `{bizCode, bizMsg, topKeys, dataKeys, successFlag}`——键名级诊断，不含响应值 |
| `data.failedEndpoint` | 失败端点（origin+path，query 剥离） |
| `data.noteId/draftId` | 成功时的产物标识（非凭据，可回传） |

### 9.5 显示项与提示文字

| 场景 | 提示 |
|---|---|
| 凭据缺失 | `缺发布链硬凭据: <cookie 名列表>` |
| 签名页未就绪 | `签名器装配失败: <原因>`（stage=signer-bridge）|
| 业务拒绝 | `note 失败：code=<bizCode> <bizMsg>`（message 经 sanitizeMessage 脱敏）|
| 页内整发准备失败 | 仅日志 `inpage-prep-failed`（自动降级 http，不打断用户）|

### 9.6 安全边界（延续 #3172/#3215 五轮审查确立）

- cookie/Authorization 值**永不回传** renderer（白名单 12 键：bizCode/键名数组/布尔旗标级）
- 探针 draft 锁死 true，公开发布走产品正式通道
- 页内脚本只回签名与响应 JSON，不回 DOM/源码（extractor 合规边界）
- prewarm/求签 IPC 保持 isTrustedSender 校验（Gate 17）

## 10. 真机验证现状与遗留

| 项 | 状态 |
|---|---|
| permit + ros-upload | ✅ 真机通过（#3215）|
| note 签名（页内 XYS_） | ✅ 签名关已过（业务层响应替代 406/401）|
| note 业务受理 | ⚠️ `code:-1`（无 msg）——**端点域不匹配**：edith 不吃 creator 会话（401 实证），creator 域同名端点 404 |
| 下一刀 | 抓登录后「手动存草稿」的真实页面交互流量（CDP 拦截）→ 定位真实草稿保存端点与参数 → 替换 NOTE_PATH → 全链闭环 |
