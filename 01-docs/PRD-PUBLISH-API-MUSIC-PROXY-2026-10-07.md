# PRD：视频号音乐库 + API 轨代理接线（publish-api-parity-b）

> **立项日期**: 2026-10-07
> **状态**: 待评审（PR 待建）
> **决策记录**: 2026-07 用户指定对标产品逆向目录作为取证来源（仓库 `01-docs/rpa-api-publish/evidence/`）
> **本文档为实施版**：按「数据校验 → 流程 → 功能逻辑 → 交互逻辑 → 显示项 → 提示文字」六维度逐项展开到可执行粒度。

---

## 一、背景与问题

### 1.1 视频号没有音乐库查询能力

发布链 `shipinhao-video.js` 只能发视频、存草稿，**投稿时无法选配 BGM**。对标产品有完整的音乐库检索（search / recommend / hot 三模式），我们缺这一环。

### 1.2 配了代理就废掉 API 轨

平台链全程用 axios 发请求，**不经过 Electron 的 BrowserWindow session**。因此桌面侧
`rpa-view-manager._configureProxy()` 里的 `session.setProxy()` 对 API 轨完全无效。
该处为此写了 `hasAccountProxy ⇒ 关闭 API 轨、强制退回 RPA`——宁可慢，也不让用户
以为走了代理其实没走。

代价是：**配了代理的账号只能走慢得多的 RPA 轨**，失去分片上传、签名、精确错误码。

### 1.3 一个未声明的依赖（潜在运行期崩溃）

`src/proxy-manager.js` 早已 `require('https-proxy-agent')` / `require('http-proxy-agent')`，
但这两个包**从未出现在 `package.json` 的 dependencies 里**，只靠传递依赖侥幸可用。
传递依赖一旦被上游移除，就是运行期 `MODULE_NOT_FOUND`。

---

## 二、范围

| # | 内容 | 取证强度 |
|---|---|---|
| ① | 视频号音乐库查询（`shipinhao-music.js`） | 端点 / 请求体 / 模式值 / 响应结构**全部有切片** |
| ③ | API 轨代理接线（`proxy-wiring.js`）+ 补快手链漏掉的 `agents` + 依赖声明 | HTTP 层 `agents` 支持早已存在 |

**不在本 PRD 范围**：B站长图文、知乎草稿/图片（取证不足，见 §七）；汽车之家 / 得物等新平台。

---

## 三、① 视频号音乐库 · 功能逻辑

### 3.1 取证基线（全部来自对标产品 bundle，无推测）

| 项 | 取值 |
|---|---|
| 端点 | `channels.weixin.qq.com/cgi-bin/mmfinderassistant-bin/post/get_bgm_list` |
| `_rid` | `678ddecb-` + 新 GUID 前 10 位（每次请求随机） |
| Referer | `https://channels.weixin.qq.com/platform/post/finderNewLifeCreate` |
| Origin | `https://channels.weixin.qq.com` |
| Content-Type | `application/json; charset=UTF-8` |

**三种模式**：

| mode | 请求体差异 |
|---|---|
| `search` | `type=104` + `query` |
| `recommend` | `type=103` + `recommendThumbUrlList: []` |
| `hot`（默认） | `type=3` |

**公共请求体**：`currentPage` / `lastBuffer` / `pageSize` / `timestamp` / `_log_finder_uin: ""` /
`_log_finder_id` / `rawKeyBuff: null` / `pluginSessionId: null` / `scene: 7` / `reqScene: 7`

**响应**：`{ errCode, errMsg, data: { totalCount, [items] } }`

### 3.2 条目归一化

平台返回两种形态，对外统一为 `{ id, name, authorName, image, playUrl, durationSeconds }`：

| 形态 | 平台字段 | 归一化 |
|---|---|---|
| A（`listenItem` 包裹） | `listenItem.musicSid` → 缺失回落 `playableInfo.listenId` | `id` |
| | `playableInfo.title` / `.author` / `.cover` | `name` / `authorName` / `image` |
| | `listenItem.url` | `playUrl` |
| | `playableInfo.duration` | `durationSeconds`（**不换算**，取证未见 ×1000） |
| B（扁平） | `url` **或** `playUrl` | `playUrl` |
| | `duration`（毫秒） | `durationSeconds` = `(ms/1e3).toFixed(1)` |

> **单位不一致是平台侧事实**，不是我们的疏漏。形态 A 不换算是因为取证里它就是原值；
> 猜它也是毫秒会把 180 秒的歌显示成 0.18 秒。宁可少转也不臆造。

### 3.3 数据校验（六道，缺一不发请求或直接拒绝）

| 校验 | 触发条件 | 行为 |
|---|---|---|
| cookie 非空 | 缺 → 抛 `missing cookie (fail-closed)` | **零请求** |
| User-Agent 非空 | 缺 → 抛 `missing User-Agent (fail-closed)` | **零请求** |
| mode 合法 | 不在 `hot/recommend/search` → 抛 `unknown mode` | 零请求 |
| search 需 query | `mode=search` 且 query 为空/纯空白 → 抛 `requires a non-empty query` | 零请求 |
| currentPage 正整数 | 非正整数 → 回落 `1` | 用默认值 |
| pageSize 正整数 | 非正整数 → 回落 `5` | 用默认值 |

**未知 mode 为什么 fail-closed**：宁可不出这个查询，也不拿一个猜的 `type` 去平台换一个
「HTTP 200 但内容不对」的响应——那会把「查错了」伪装成「没有结果」。

### 3.4 流程

```
调用方
  └─> listBgm({ mode, query, currentPage, pageSize, lastBuffer })
        ├─ _assertPreconditions()        ← 缺 cookie / UA 就在这里抛出，一个请求都不发
        ├─ 校验 mode（白名单）            ← 未知模式抛错
        ├─ 校验 search 的 query           ← 空则抛错
        ├─ 归一化分页参数                 ← 非法值回落默认
        ├─ 组装 body（按 mode 置 type + query/recommendThumbUrlList）
        ├─ POST get_bgm_list?_rid=<随机>
        ├─ 读 errCode / errMsg / data.totalCount / data.list
        ├─ 逐条 _normalizeItem()，过滤 null / 非对象
        └─ 返回 { mode, items, total, page, pageSize, hasMore, lastBuffer }
```

### 3.5 显示项（前端应呈现的字段）

| 字段 | 用途 | 缺省显示 |
|---|---|---|
| `name` | 曲名（列表主文案） | 必显，无值显示「未知音乐」 |
| `authorName` | 作者 | 有值才显，无值不占位 |
| `durationSeconds` | 时长 | 格式化为 `M:SS`，超过 1 小时用 `H:MM:SS` |
| `image` | 封面 | 无值用默认音符占位图 |
| `playUrl` | 试听 | 仅作 `<audio>` 源，**不作为可点击文案** |
| `id` | 投稿回填（BGM 选择结果） | 不直接显示 |
| `total` | 结果总数 | 显示「共 N 首」 |
| `hasMore` | 是否还有下一页 | 为 `false` 时隐藏「加载更多」 |

### 3.6 提示文字（统一走 i18n key，此处给中文文案与场景）

| 场景 | 文案 |
|---|---|
| 空结果（search 有词但无匹配） | `没有找到「{query}」相关的音乐，换个词试试` |
| 空结果（hot / recommend 首屏无数据） | `暂时没有可用的音乐` |
| 加载更多 | `加载中…` |
| 加载失败可重试 | `音乐列表加载失败，点击重试` |
| 缺 cookie | `账号未登录或登录态已失效，请重新登录视频号` |
| 缺 User-Agent | `网络环境异常，请重启应用后重试` |
| 未选音乐直接投稿 | `未选择背景音乐，视频将以原声发布`（**提示而非阻断**，见 4.4） |
| 投稿成功回填 | `已配乐：{name}` |
| 投稿失败但已选音乐 | `已选「{name}」但发布失败：{reason}` |

### 3.7 交互逻辑

1. **入口**：发布表单的视频号，在「封面」下方增设「背景音乐」区（可折叠，默认折叠）。
2. **展开**：点击展开后并行发起 `recommend` 与 `hot` 两个查询（同一接口不同 `type`），任一成功即渲染。
3. **搜索**：输入框防抖 500ms → `mode=search` + `query`；**回车立即触发**，不等防抖。
4. **选择**：单击选中（单选），再次点击取消选中；选中项高亮并显示在折叠标题上。
5. **分页**：滚动到底触发下一页，传 `lastBuffer` 而非 `currentPage+1`（取证中 `lastBuffer` 是平台游标）。
6. **与草稿的关系**：草稿保存时**只存 `id`**，不存整份音乐对象——平台侧以 id 为准。
7. **无音乐兜底**：拉取失败不阻断发布，降级为无配乐投稿，并显示 §3.6 的提示。

---

## 四、③ API 轨代理 · 功能逻辑

### 4.1 数据校验

| 校验 | 行为 |
|---|---|
| proxy 缺 host 或 port | 视为**未配代理**，opts 原样返回，不创建 `clients` |
| proxy 完整 | 生成 `agents = { httpAgent, httpsAgent }` 挂到 `opts.clients.agents` |
| 凭据特殊字符 | 用户名 / 密码 `encodeURIComponent`（沿用 `proxy-manager.js` 既有安全修复，防 `@` `:` 破坏 URL 解析） |
| 调用方已有 clients | `Object.assign` 合并，**不覆盖**既有条目 |

### 4.2 流程

```
调用方 opts + 账号 proxy
  └─> attachProxyAgents(opts, proxy)
        ├─ hasUsableProxy? 否 → 原样返回 opts（零侵入）
        └─ 是 → createProxyAgent(proxy)
                 └─ opts.clients.agents = { httpAgent, httpsAgent }
                      └─ publishViaApi → adapter.execute(taskData, cookie, opts)
                           └─ _chain(cookie, opts.clients)
                                └─ Object.assign(摊进链构造参数)
                                     └─ createHttpClient({ agents })
```

### 4.3 关键约束（**本 PR 不放开闸门**）

`rpa-view-manager` 里的 `hasAccountProxy ⇒ 关闭 API 轨` **保持不变**。

理由：放开它会把已有账号的发布轨从 **RPA 换成 API**。虽然 API 更快，但链不一样了——
那些账号当初可能正因为「代理 + API 轨不兼容」才选择 RPA。**这是行为变更，须由实际账号
实测代理下 API 轨稳定后单独决策**，不在本 PR 内。

因此本 PR 的净效果是：**能力备好、默认不生效**（`opts.proxy` 不传即完全不介入）。

### 4.4 显示项与提示文字

| 场景 | 文案 |
|---|---|
| 账号配了代理，当前走 RPA | `该账号配置了代理，发布走浏览器模式（较慢）` |
| 未来放开闸门后 | `该账号将通过代理 IP 发布` |
| 代理认证失败（HTTP 407） | `代理认证失败，请检查代理账号密码` |
| 代理超时 | `代理响应超时，请稍后重试或更换代理` |

---

## 五、②④ 为何不在本 PR（取证边界）

| 项 | 已取证 | 缺 | 硬做的后果 |
|---|---|---|---|
| B站长图文 | 端点、draft/submit 切换、Referer | **请求体字段名、响应结构** | minified bundle 参数被压成单字母，字段映射无法还原 → 只能猜 |
| 知乎草稿/图片 | 三个 URL | 请求头、请求体、响应结构 | 同上 |

硬做出来的代码**能配上全套测试、能全绿**，但线上一个都发不出去，且比不做更糟——
用户会以为功能可用。**缺取证就不做，这是本仓的既有纪律。**

---

## 六、验证与门禁

- 引擎全量 Vitest **34 文件 / 294 用例全通过**
- 第二层 119 独立脚本仅两项存量失败（与 main 同 `exit=1`：NAS 无 POSIX 权限 / Windows 路径断言，环境产物）
- 四项门禁 `exit=0`：max-lines / debt-budget / brand-residue / gate-record
- 新增回归锁 `shipinhao-music.test.js` 21 例、`proxy-wiring.test.js` 8 例
- **逐条变异验证**：硬编码 search 的 type → 模式映射锁红；删 UA 校验 → fail-closed 锁红；
  撤掉快手链的 agents → 结构锁红；撤掉依赖声明 → 依赖锁红

---

## 七、遗留与解锁条件

| 项 | 解锁条件 |
|---|---|
| B站长图文 | 抓包或切片给出 `article/submit` 的**请求体字段与响应结构** |
| 知乎草稿/图片 | 同上，另需请求头 |
| 代理闸门放开 | 用真实账号实测「代理 + API 轨」稳定后再单独决策 |
| 音乐库回填投稿体 | 取证未见投稿体的 BGM 字段，待抓包确认后再接 |
