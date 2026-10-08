# PRD-小红书 DOM/RPA 轨加固（真实草稿箱验收）

> **立项日期**: 2026-10-04 | **最后更新**: 2026-10-09 | **状态**: PR-1 已合并，PR-2 端点回填进行中
> **归属 change**: `openspec/changes/rpa-xiaohongshu-dom-hardening/`
> **关联 PR**: #2885（PR-1，squash `e413cbc7`）· #3183（PR-2 端点回填）

## 1. 验收目标（用户拍板）

**存入小红书创作者中心的真实草稿箱**，不做真实公开发布。

这一目标把「成功」的定义从"页面看起来提交了"收紧为"草稿箱里确实出现了这一条"，
因此确认机制是本需求的主体，而非收尾装饰。

## 2. 为什么不走 API 直发链

小红书 API 直发链已判 not-go（签名外包 + 传输层墙，见 `PRD-API-PUBLISH-ENGINE.md`
与 api-publish-engine-w3 §6.3）。本需求只加固 **DOM/RPA 轨**：用应用内受控浏览器
驱动创作者中心页面，与真人操作同形。

**合规红线**：运行时严禁请求任何外包签名/求签农场域名。本需求不新增任何外部端点，
所有导航目标均为小红书官方域名。

## 3. 已交付（PR-1，#2885）

| 能力 | 行为 |
|------|------|
| 草稿 fail-closed | `draft=true` 找不到草稿入口 → 一律报 `XHS_DRAFT_ENTRY_MISSING` 并**阻止任何公开发布点击**（修旧代码"草稿误公开发布"） |
| 确认才成功 | 三级回退：XHR 响应 `code==0` → 显式 success URL 跳转 → 草稿箱回查命中；均无 → `XHS_UNCONFIRMED` 失败，**不伪造 success、不伪造 url** |
| 选择器回退链 | 标题/正文/草稿按钮/发布按钮/上传完成/标签 均配多候选，命中即停，抗小改版 |
| 富文本写入 | `contenteditable` 上 `fill()` 抛错时回退 `dispatchEvent(input/change)` |
| 标签处理 | 逐个 `type` + 选下拉/回车，替换覆盖式 `fill`（旧行为只留最后一个标签） |
| 错误归一 | `[XHS:<CODE>]` 前缀编码 outcome，登录过期与风控**绝不降级换号** |
| 可桩 seam | `_execute_flow(page, monitor, ...)` 接收注入对象，零真实浏览器即可单测核心分支 |
| 文件规模 | 拆为 `xiaohongshu.py` / `xiaohongshu_selectors.py` / `xiaohongshu_auth.py`，均 <500 行（债务熔断面） |

## 4. 端点回填与确认通道武装（PR-2，#3183）

PR-1 合并后，`DRAFT_SAVE_RESPONSE_PATTERNS` 仍是空占位，导致
`xiaohongshu.py` 中 `if DRAFT_SAVE_RESPONSE_PATTERNS:` 守卫恒假 ——
**最稳的 XHR 主确认通道从未注册**，实际只剩占位选择器的草稿箱回查在兜底，
页面即便成功提交笔记也只能报 `XHS_UNCONFIRMED`。

**证据源（本仓内，非外部）**：`packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js`
的三步草稿链终步

```
POST https://edith.xiaohongshu.com/web_api/sns/v2/note   → { code: 0, data: { note_id, draft_id } }
```

其配套测试明确断言真实端点即此、`/api/publish` 不存在。创作者中心页面点「存草稿」
打的是同一端点，故 DOM/RPA 轨据此武装：

```python
DRAFT_SAVE_RESPONSE_PATTERNS: list[str] = ["/web_api/sns/v2/note"]
```

**关键边界（假阳性红线）**：上传链的 `…/api/media/v1/upload/web/permit` 与
`ros-upload.xiaohongshu.com` 同样返回 `code==0`。若把它们纳入确认模式，
草稿尚未真正提交就会被判成功 —— 比"漏报"更危险。因此确认模式**只含笔记提交终步**，
并有回归测试固化（仅 permit 成功 ⇒ 必须仍判未确认）。

现有 `_resp_success`（判 `code==0`）与 `_extract_url`（读嵌套 `data` 的
`draft_id/note_id/id/url`）本就与真实响应形状匹配，故本次只补数据、不改逻辑。

## 4b. 调用链现状（2026-10-09 取证，直接影响验收方式）

本次加固的是 **python Playwright 发布器**，但它在今天的桌面端不可达：

- `server.py:736` 把 `draft` 透传给 `publisher_mgr`，桌面端唯一调用 `/api/publish` 的地方是
  `publisher-router.js:683` 的 `BackendPublisher`；而 `publisher-router.js:44` 的
  `ROUTE_TABLE.xiaohongshu = { mode: 'rpa_vm' }` ⇒ **桌面发布队列走 Electron WebContents RPA，不经过 python 发布器**。
- 用户实际触达的草稿能力在 `rpa-view-platforms.js:_publish_xiaohongshu`（L1309）：图文模式自
  2026-09-29 起**硬编码 `draftOnly: true`**（L1328，用户当时指定"只落草稿箱不点发布"），
  视频模式保持原发布链路。该分支 2026-10-07 已加两道守卫：标题/正文写入失败 ⇒
  `PUBLISH_DRAFT_CONTENT_NOT_FILLED` 拒绝报成功；草稿落库判据从含裸「草稿」的正则
  （常驻文案恒真、等于没有判据）收紧为「已保存/保存成功/编辑于+时间量词」。
- 两条路径的**确认强度不同**：桌面路径是 DOM 文案正则；python 路径经本次 #3183 才具备
  XHR 端点主确认（`/web_api/sns/v2/note` + `code==0`）+ 草稿箱回查兜底。

结论与口径修正：

1. "存进小红书真实草稿箱"这条验收目标，**在桌面路径上已存在并有防假成功守卫**；
   本次 change 交付的是同一目标在 python RPA 轨上的等价能力与更强的确认通道。
2. 因此 2.4 活体验收要**双路覆盖**：(a) 用探针验 python 轨（本 change 的加固对象）；
   (b) 用桌面真实队列发一条图文，确认草稿箱出现本次条目（用户实际路径）。
3. 遗留决策（**不在本 change 范围，需用户拍板**）：是否把 `ROUTE_TABLE.xiaohongshu`
   切到 `backend`（或 `api-then-dom`）让桌面吃到本次加固。切换前提是 2.4 活体证据到手，
   否则等于把已验证的桌面路径换成未验证路径。

## 4c. 风控归一武装（文本轨，2026-10-09 追加）

同一类静默失效的第二处：`RISK_OVERLAY_SELECTOR` 为空占位时
`_risk_present()` 直接 `return False` ⇒ PR-1 能力表里"风控归一 `XHS_RISK_BLOCKED`、
且不降级换号"这条**实际从不触发**。

- 修法：`_risk_present` 改为双轨——占位选择器（仍待 2.2 活体回填）**或**
  "浮层容器 + 容器内风控文案"。文案口径取自本仓桌面轨已实战使用的风控词表
  （`publish-risk.js` 的 `RISK_RE`），属源证据非活体取证。
- **双条件是刻意的**：只在 `modal/dialog/overlay/verify/captcha` 容器内匹配，
  避免页面常驻文案（侧栏「草稿箱」「验证封面」之类）误判成风控而阻断正常发布。
  误判风控比漏判更有害——它会直接中止用户的草稿保存。
- 默认常量非空由测试钉死（`test_text_track_constants_arming`），与 2.3a 的
  "默认模式非空"断言同一思路：把静默失效变成红。
- 新增 4 项用例：风控文案 → `XHS_RISK_BLOCKED` 且不点发布；无常驻浮层不判风控；
  浮层内良性文案不判风控；常量默认值非空。

## 4d. Python 轨认证已被策略硬阻（2026-10-09 用户实跑暴露）

用户按 §6 运行探针，崩溃于 `legacy_auth_policy.require_legacy_plaintext_auth()`：
`RuntimeError: 旧 Python 明文认证持久化已停用，请使用桌面端加密账号存储`。

调用链是 `XiaoHongShuPublisher._ensure_browser()` →
`xiaohongshu_auth._restore_auth_data()`（第 1 行）→ 策略守卫。该守卫除非同时满足
两个 `MULTI_PUBLISH_*` 迁移环境变量 **且** 非生产环境，否则无条件抛错；
`_save_auth_data()` 与 `_restore_cookies_legacy()` 同样受此门。

结论与影响口径：

- **这不是探针 bug，是仓库既定策略**（Python 明文认证持久化已停用，登录态归桌面加密
  账号存储）。我们不应为了跑取证而放宽这两个环境变量——那等于在验收脚本里绕过一条
  安全红线。
- 因此 §4b 的判断要再加一层：Python 轨不仅**无生产调用方**（桌面发布被 `ROUTE_TABLE`
  派到 `rpa_vm`），在正常构建下也**无法恢复登录态**。它的 DOM 链只能通过"探针自持
  persistent profile + headed 扫码"这种方式被验证。
- 修法：新增 `open_probe_browser()`，直接 `launch_persistent_context` 到账号 profile
  目录，绕开 `_ensure_browser` 的认证恢复；结束后也不调 `_save_auth_data`
  （登录态由 profile 目录自身留存）。gitignored，不入库。
- 验收含义：**2.4 活体验收的正面证据必须来自桌面轨**（`rpa-view-platforms.js`
  的 `draftOnly:true` 路径 → 草稿箱可见）。Python 轨的活体取证只用于回填选择器/端点，
  不代表用户实际使用的链路。

## 4e. PR-1 引入的回归：上传控件轮询被删 ⇒ 无媒体草稿（Bug 反哺，2026-10-09）

发现方式不是功能测试，而是**静态守卫变红**：`test_p4_wait_until.py` 断言
`xiaohongshu.py` 里 `wait_until(` 出现 ≥ 2 次，PR-1 合并后只剩 1 次。

**① 根因**：PR-1 把"导航后轮询上传控件可见"（`upload_input_ready = await wait_until(...)`）
替换成一次性 `_resolve_visible(page, "upload_input")`。`_resolve_visible` 不等待，
SPA 首屏未挂载时返回 `(None, None)`，而调用处是
`if file_input is not None: await set_input_files(...)` —— 条件不满足就**什么都不做且不报错**。

**② 逃逸链**：这条静默跳过逃过了所有测试。PR-1 的单测用 `_base_page()`（控件恒可见）
且 `media_paths=[]`，从未构造"延迟挂载"场景；后面的 `_await_editor_ready` 轮询会让页面
最终看起来"就绪"，于是流程继续填标题、点存草稿 —— 产出**没有媒体的草稿**。
用户的验收口径是草稿箱里内容完整，这属于缺陷交付而非失败交付，因此连错误码都不会出现。

**③ 系统性漏洞**（两条，都已处理）：
- `packages/python-backend` 的 pytest **不在任何 CI workflow 里**（`gui-test.yml` 只跑
  `test_video_provider_imports.py`），所以守卫变红不阻断 PR —— tasks 1.9 的
  "全量回归通过"是在本地未复跑该文件的前提下勾掉的。
- 守卫自身用**源码字面量**断言（`"UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0" in src`、
  `"改为轮询编辑器就绪" in src`）。PR-1 把常量定义移到 `xiaohongshu_selectors.py`、
  日志措辞也改了，于是同一个守卫又出现两处**假红**，掩盖了它抓到的真红。

**④ 修复 + 回归保护**：`_await_upload_input()` 恢复条件轮询（沿用
`NAVIGATE_READY_TIMEOUT_S`/`NAVIGATE_READY_POLL_INTERVAL_S`），且把"有媒体但控件始终不挂载"
从静默跳过改为 `CODE_UPLOAD_FAILED` **fail-closed**（不完整的草稿不进草稿箱）；纯文本草稿
路径不等待、不受影响。上传控件与编辑器两处轮询收敛到共用 `_await_control()`（也顺带把
`xiaohongshu.py` 压回 499 行，不触债务熔断的 ≥500 行文件数基线）。
新增 4 项用例：延迟挂载必须等到并真正上传、始终不挂载必须 fail-closed 且不点存草稿、
无媒体不白等、等待常量必须真的被发布器引用。
守卫本身也被修：`wait_until(` 出现次数改成**调用图断言**（`_await_control` 存在且被
`await` ≥ 2 次 + 两个 label 存在），因为把两处重复轮询收敛成一个共享 helper 是改进，
按次数断言会把它误判成回退；`UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0` 的字面量子串改为
断言**生效常量值**（常量已被 PR-1 移到 selectors 模块）。
破坏-恢复验证（两种破坏都跑过）：
① 删掉轮询只留一次性解析 → 行为用例 `test_late_mount_...` 变红；
② 回退成"两处各自 wait_until"的旧形状 → 守卫变红。恢复后发布轨 51 项全绿。

**⑤ 防止再发**：把"一次性解析 = 静默跳过"记为本轨的反模式；`_resolve_visible` 的返回值
在**必须发生**的动作（上传媒体、点存草稿）上不允许 `if ... is not None` 直接吞掉，
必须显式给出失败码。本条同时说明：验收前必须在本地实跑
`cd packages/python-backend && pytest`，不能依赖 CI 兜底。

## 5. 剩余工作（必须完成才算验收）

| 项 | 状态 | 阻塞 |
|----|------|------|
| 2.3a 端点模式常量回填 | 已完成（源证据） | — |
| 2.1 活体取证 runbook 脚本 | 已就绪（脚本+自检通过，未执行） | 执行需**用户登录小红书**（headed 浏览器扫码） |
| 2.2 真实选择器取证 | 待办 | 同上 |
| 2.3b `RISK_OVERLAY_SELECTOR` / `DRAFT_BOX_ITEM_SELECTOR` 回填 | 待办 | 依赖 2.1/2.2 |
| 2.4 真实草稿箱活体验收 | 待办 | 依赖上面全部 |
| 3.2 change 归档 | 待办 | 两 PR 合并 + 活体验收通过 |

当前端点属**源证据而非活体证据**：`/web_api/sns/v2/note` 是否确为创作者中心
存草稿时的实际 XHR，仍需 2.4 活体复核。在那之前本能力视为「已具备确认通道，
未活体验收」。

## 6. 取证 runbook（2.1 已就绪，2.2 待执行）

探针脚本落在 gitignored 的 `.agent_context/tier2/`（不入库，产物含账号信息）：
`xhs_tier2_probe.py` + `RUNBOOK.md` + `_smoke.py`（零浏览器自检，已 PASS）。

流程：headed `launch_persistent_context`（与 `server.py` 同 `MULTI_PUBLISH_DATA_DIR`
解析口径，可 `--account-id` 复用已登录 profile）→ 扫码登录 → 发布页逐候选统计
`count/visible` → 人工「存草稿」（`--mode manual`，脚本只观察不代点）→ 捕获 note
端点 `code==0` → 草稿箱列表逐候选取证 → 落 `EVIDENCE.md` / `evidence.json` /
`network.json`。

内置守卫：只 watch 笔记提交终步，`permit` 的 `code==0` 在探针侧同样**不**算命中
（防"草稿未提交即判成功"）；`publish_button` 仅取证、脚本绝不点击，守住"只存草稿
不公开发布"的验收红线。若 `--mode drive` 命中，则说明现有回退链可用，但该模式会
真实存一条草稿，用完需人工删除。

用实测值替换 2.3b 的选择器占位，并把 `DRAFT_SAVE_RESPONSE_PATTERNS` 从源证据升级
为活体证据；随后 2.4 以"草稿箱人工可见本次条目"为通过口径。
