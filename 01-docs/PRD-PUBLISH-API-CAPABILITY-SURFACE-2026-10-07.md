# PRD：发布 API 能力面收敛（publish-api-capability-surface）

> **立项日期**: 2026-10-07
> **状态**: 待评审（PR #3010，draft）
> **决策确认**: 2026-10-07 用户指令「用目标模式来做，把剩余的工作全部完成」——
> 实施前先核查 `01-docs/rpa-api-publish/evidence/`，据此把 6 项候选收敛为 3 项可做 + 3 项
> 明确不可做（见 §五），**不编造端点**。

---

## 一、背景与问题

### 1.1 对外 HTTP 发布接口无法表达媒体

`packages/api-publish-engine/src/publish-api-server.js` 的 `/api/v1/publish` 与
`/api/v1/batch-publish` 在请求体解析阶段硬编码：

```js
var taskData = { title: body.title || "", content: body.content || "", tags: body.tags || [] };
```

`video` / `images` 在此被丢弃。而适配器侧对 `taskData.video.path` 是 **fail-closed** 硬校验
（`adapters/kuaishou.js` 与 `publish/platforms/kuaishou-video.js` 中的
`kuaishou(-video): taskData.video.path required`，缺即
`{success:false, code:data_error}`）。两边一对：

> **抖音 / 快手 / 视频号 / B站 / 百家号的视频与图文发布，在 HTTP 入口全部不可达。**

桌面端之所以一直能用，只因 `publisher-router.js` 的 API 直调分支直接调库、绕过了 HTTP 层。

### 1.2 形状翻译存在多份实现，且已出过事故

`apps/desktop/electron/services/api-task-data.js` 的 `buildApiTaskData` 是形状翻译的
单一实现（2026-09-28 从 publisher-router 的内联映射提取）。该文件注释记录了事故根因：

> RpaView 的 API-first 分支曾把裸 `article` 直接传给 `publishViaApi`——适配器契约要求
> `taskData.video.path`（嵌套对象）而 `article` 是扁平 `video_path` 字段，kuaishou/bilibili
> API 轨全部 fail-closed 并静默回退 DOM 轨（`live-acceptance-pass-20260928.md` 残余①）。

HTTP 面若另写一份映射，就等于埋下**第三份**实现，把这次事故重新放大。

### 1.3 三处在绿灯下长期存在的静默失效

| 位置 | 失效形态 | 危害 |
|---|---|---|
| `adapters/tiktok.js` | `dryRun` 被完全忽略；拿不到 `upload_url` 时 `return {success:true}` | 会拿着没有的凭证真外发；上层只认 `success`，「什么都没发」被记成一次成功发布并**扣掉发布额度** |
| `upload/providers/http-config.js` | 22 个平台标注 `uploadType:"chunk"`，实现却是整文件 `fs.readFileSync` + 单次 POST | 标注与实现不符 ⇒ 任何据该字段判断「支持分片」的下游都得出错误结论 |
| `publish-api-server.js` | `_parseBody` 无体积上限、畸形 JSON 静默返回 `{}` | 超大请求体一路带进业务逻辑 |

### 1.4 能力面安全控制失效

`src/auth/publish-api-capabilities.js` 的矩阵校对守卫：

```js
if (CAPABILITY_MATRIX[parsed.platform][parsed.method] === null) { /* 404 */ }
```

`parsed.method` 来自 `PATH_TO_METHOD`（值为 `poiRecommend`），而矩阵键名写作 `poi`
⇒ 读到 `undefined`，**永不等于 `null`**，守卫形同虚设。实测同为「矩阵标 null」的能力：

```
permission-check → 404 CAPABILITY_NOT_SUPPORTED   （正确）
poi              → 400 COOKIE_REQUIRED           （错误：等于宣称「能力存在，只缺 cookie」）
```

### 1.5 发布权限预检 fail-open

`douyin-capabilities.js` 的 `publishPermission` 对无法识别的响应一律
`allowed: true`（`status_code === undefined` 落到末尾分支）。风控换壳、字段改名、
网关兜底返 `{}` 全会放行——而该模块存在的全部理由就是把失败点前移到零字节上传。

### 1.6 publishMode 三态闸门在 RpaView 侧完全失效

`apps/desktop/electron/services/rpa-view-manager.js` 的 API-first 分支只读
`apiRouter.shouldUseApi`（由 `has_api` 派生），**完全无视 `publishMode` 字段**。
实跑核对 `config/platforms.yaml`：

| 平台 | has_api | publishMode | RpaView 实际走向 |
|---|---|---|---|
| youtube | true | dom-only | ⚠ 走 API 轨（与配置矛盾） |
| twitter | true | dom-only | ⚠ 走 API 轨 |
| facebook | true | dom-only | ⚠ 走 API 轨 |

且 `api-only` 的契约（「任何非成功结果都停报，不降级」，`publish-mode.js:6`）未实现——
catch 无条件落 RPA。更糟的是 `Promise.race` 超时后 API 发布并未取消，降级时后台还挂着
一次 API 发布，**可能重复发稿**。

---

## 二、目标与范围

### 2.1 可做（已完成，PR #3010）

| 项 | 目标 |
|---|---|
| A | HTTP 媒体契约：`video_path` / `cover_path` / `images` 可用，并新增 `video_url` / `cover_url` / `image_urls`（服务端拉取） |
| B | 形状翻译收敛：`buildApiTaskData` 权威实现下沉到引擎包，desktop 改薄转发，三路共用 |
| C | 抖音预检改 fail-closed；登录失效统一 401 |
| D | URL 媒体模式的四道防线：SSRF（含 DNS 解析结果校验与**地址钉住**）/ 体积上限 / 临时文件生命周期 / 失败不留痕 |
| E | 能力面 no-store、失败日志、OpenAPI 收录、矩阵键名与 `EXPOSED_CAPABILITIES` 同源、守卫 fail-closed |
| F | RpaView 读三态总闸；`api-only` 停报不降级；小红书体裁判据改用权威形状 |

### 2.2 明确不可做（取证不足，禁止编造端点）

| 项 | 取证结论 |
|---|---|
| 视频号音乐库检索 | 切片只有函数名 `getShipinhaoMusicList`，**无端点路径** |
| per-tab 代理 | 切片**零命中** |
| 小红书 `execute()` | **已由 main #3009 实现**（PR #3009，2026-10-07 09:11），本 PRD 编写时的「不可做」裁决被推翻，见 §2.3 更正 |

### 2.3 小红书：一处已更正的裁决错误（2026-10-07 09:11 后）

**初版裁决**：不可做。依据是取证切片 §2.7：

> `x-s/x-t` 生成算法完全依赖外包签名服务，无反推本地公式的已知路径。
> 本地 `getXiaohongshuSign` 为**未验证近似**。裁决：小红书链保持 **Tier-B 待验证**。

**这个裁决错了。** 那句话约束的是「**反推本地公式**」这一条技术路线，
不是「不存在可行签名方案」。main 的 #3009 走了第三条路：
`xiaohongshu.x-s-browser` → `browserPageProvider`，**在进程内执行平台自己的签名 JS**，
既不需要反推公式，也不依赖外部签名服务。

教训：把「某条实现路线不通」当成「能力不可达」是过度推论。取证切片描述的是
参考产品的实现路径，不是可行解的完备集。

本 PRD 随之调整：小红书 `execute()` 从「明确不可做」移出，
其实现归属 main #3009，不在本 PR 范围内。

`01-docs/rpa-api-publish/evidence/yx-kuaishou-w3-slices.txt` §2.7 合规止步判据：

> `x-s/x-t` 生成算法完全依赖外包签名服务，无反推本地公式的已知路径。
> 本地 `getXiaohongshuSign` 为**未验证近似**。
> 裁决：小红书链保持 **Tier-B 待验证**，不阻塞快手链。

本地实现为 `MD5(ts + "MirAR" + JSON(body))`（`src/signer-local.js` 的 `getXiaohongshuSign`），纯本地拼的近似值。
补 `execute()` 等于把未验证公式接进真实发稿链。`src/signer/index.js` 的「Tier-B 备选 command」注释亦标注
「Tier-B 备选 command（本地公式不变，spike S0 验证后决定走哪个）」。

**解锁条件**：先跑 S0 活体验证签名可用，或接入外部签名服务，之后再谈接线。

---

## 三、接口契约变更

### 3.1 请求体（`/api/v1/publish` 与 `/api/v1/batch-publish` 共享）

采用与桌面端 `article` **逐字段一致**的扁平形状，不为 HTTP 另造一套：

```jsonc
{
  "platform": "kuaishou",          // 必填
  "title": "标题", "content": "正文", "tags": ["a"], "cookie": "…",

  // 媒体：本地路径（服务端可解析）
  "video_path": "/abs/path/v.mp4", "cover_path": "/abs/path/c.png",
  "images": ["/abs/path/1.png"],

  // 媒体：URL（服务端拉取到临时目录）
  "video_url": "https://…/v.mp4",  "cover_url": "https://…/c.png",
  "image_urls": ["https://…/1.png"],

  "draft": true, "aiGenerated": false,
  "duration": 30, "width": 1080, "height": 1920
}
```

**互斥**：`*_path` 与 `*_url` 同时给出返回 400，不做隐式仲裁——两种写法指向不同资源，
静默取其一会让调用方以为控制的是另一个。

### 3.2 媒体语义决策（冻结）

媒体来源为**服务端本地路径或 http(s) URL**，不做其他隐式解析。适配器以
`fs.readFileSync(taskData.video.path)` 读文件，故 URL 必须先落盘再进平台链。

### 3.3 URL 模式的四道防线

1. **SSRF**：私有/保留网段、localhost、URL 内嵌凭据、非 http(s)，以及 **DNS 解析结果
   逐个校验**（混入私网即整体拒绝，不「挑一个安全的」）+ **把已校验地址钉到连接上**
   （消除 rebinding 的 TOCTOU 窗口）+ 重定向逐跳重校验 + 跳数上限 5
2. **体积上限**：默认 512 MiB，边收边计数，不信任 `Content-Length`
3. **临时文件生命周期**：`mkdtemp` 独立目录 + 显式 `cleanup()`（幂等）
4. **失败不留痕**：中途失败删半截文件；批量部分失败清理已完成项

---

## 四、平台登录态判定矩阵

新增 `LOGIN_DETECTION`（**独立于 `CAPABILITY_MATRIX`**——矩阵键名与
`EXPOSED_CAPABILITIES` 是对齐的一套词汇，混入元信息会引入第二套词汇，正是
`poi` 事故的同类）：

| 平台 | 可判定登录失效 | 依据 |
|---|---|---|
| bilibili | ✅ | `NOT_LOGIN(-101)`、`-1025`、`-1026` |
| kuaishou | ✅ | `result == 109` |
| tencent_video | ✅ | `LOGIN_EXPIRED_CODES = [300333, 300334]`（`shipinhao-capabilities.js:28`） |
| douyin | ❌ | 切片只证到业务码 `status_code = 110`（风控），**登录失效码无取证** |
| xiaohongshu | ❌ | 无取证 |
| baijiahao | ❌ | 无取证 |

标 false 的平台在 cookie 失效时只返回通用 400——**这是已知且如实声明的缺口**。
无取证时把任意非零码猜成「未登录」比不判更危险：会诱导客户端无谓地换号重试。

---

## 五、验证与门禁

- 引擎全量 Vitest **34 文件 / 294 用例全通过**；第二层 119 脚本仅两项存量失败
  （与 `main` 同样 `exit=1`：`cloud-accounts-keyring-hardening` 需 POSIX 权限、
  `plugin-loader-runtime-path` 是 Windows 路径断言，均为沙箱环境产物）
- desktop 全量：`main` 基线 379 失败 vs 本分支 378，逐条 diff **零新增**
- 四项门禁 `exit=0`：max-lines / debt-budget / brand-residue / gate-record
- 每个回归锁做**红绿对照**（改坏→红→改回→绿），8 个锁逐一实测

---

## 六、遗留与解锁条件

| 项 | 解锁条件 |
|---|---|
| 视频号音乐库检索 | 补 `getShipinhaoMusicList` 的端点路径取证切片 |
| per-tab 代理 | 补代理相关取证切片（当前零命中） |
| ~~小红书 `execute()`~~ | **已解锁**：main #3009 用 `browserPageProvider` 走通了签名（见 §2.3 更正） |
| 抖音登录态判定 | 补登录失效业务码取证 |

---

## 七、并发与归属说明

`b52c735a`（能力面子系统，约 1000 行）由**另一会话**在同一 worktree 产出，仅抽查 3 处
未经完整人工评审；`68bbe8ba` 是对其未提交在制品的回收提交。PR 以 draft 提出正是为此。