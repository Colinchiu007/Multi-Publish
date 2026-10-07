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