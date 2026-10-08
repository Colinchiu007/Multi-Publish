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

## 4c-b. 文本轨的可见性前提（CCG 双审 i1/i2，2026-10-09 修正）

上面 4c 的初版实现有一个 Critical 缺陷，被 CCG 深评抓出（`.adversarial/ccg-deep-320e8f2b/`）：
它只查 `count() > 0` 然后读 `.first.inner_text()`，**从不查可见性**。

- 失败场景（不是理论风险）：创作者中心是 SPA，未打开的 modal/verify 容器以
  `v-show` 形式常驻 DOM，默认文案正是「请完成验证」。按初版实现，用户**每次**
  草稿保存都会在流程入口被判 `XHS_RISK_BLOCKED` 而中止——本功能的验收口径是
  "内容进真实草稿箱"，误判等于整个功能不可用。
- 修正后的三条硬规则：
  1. **必须可见**：`_visible_texts()` 只收 `is_visible()` 为真的元素文案；
     选择器轨（占位 `RISK_OVERLAY_SELECTOR`）同样走可见性，不再是 `count()>0`。
  2. **必须逐个扫描，且有上限**：`[class*="modal"]` 真实会命中多个节点，
     风控层不在 DOM 首位时读 `.first` 必漏判（i2）；改为按序扫描可见元素，
     上限 `RISK_HOST_SCAN_LIMIT = 8`，防止整页模板把 `inner_text` 成本放大到拖垮发布链。
  3. **词表只收强指认短语**：删掉裸「滑块」与「拖动滑块」——封面裁剪弹窗的
     「拖动滑块调整比例」是控件说明，不是风控；真实滑块验证必然同容器共现
     「安全验证/验证码」，收紧不损失召回。
     注：这是对源证据（`publish-risk.js` 的 `RISK_RE`）的**有意收窄**，理由与
     双面用例已写进 `xiaohongshu_selectors.py` 注释，不是无意识漂移。
- 用例（先红后绿）：隐藏模板不判风控 `test_hidden_risk_template_is_not_risk`；
  第 2 位可见容器仍被抓到 `test_risk_wording_in_second_visible_host_is_caught`；
  裁剪文案不判风控 + 真验证判风控；扫描截断到上限
  `test_visible_hosts_beyond_scan_limit_are_not_read`。
- 判定记录：i1、i2 均 `upheld`（含 prosecution/defense/rationale 三列，可复核）。

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

## 4f. CCG 双审其余三项（i3/i4/i5，2026-10-09）

i1/i2 见 §4c-b。另外三条同样全部 `upheld`，且各自有可验证的落点：

**i3（等待上限被顺手收紧）—— 成立，已修。**
改造前是 `sleep(30)` 后解析一次，等效容忍度 30s；PR-1 把上传控件那一处换成轮询时
用了 `NAVIGATE_READY_TIMEOUT_S = 10s`，等于**同时**改了"怎么等"和"最多等多久"。
更糟的是常量被错配：`UPLOAD_FALLBACK_WAIT_TIMEOUT_S`（名字就是"上传兜底"）当时被
喂给了编辑器就绪，而上传路径拿到 10s。这与 4e 自己声明的准则"上限沿用原时长，
只收紧快路径"直接矛盾。
修法：两个等待的常量对调回来——上传控件 30s（原容忍度）+ 编辑器就绪 10s，
`fail-closed` 与"命中即返回"的快路径收益全部保留。
验证：`test_upload_ceiling_keeps_the_original_tolerance` 钉住 30s；
`test_upload_path_uses_the_upload_fallback_ceiling` 给两个常量传不同哨兵值
（0.05 / 9.99），看失败留痕里出现哪个，从而证明**映射**归属，而不是抠 `timeout_s=` 源码字面量。

**i4（守卫的格式化耦合）—— 半成立，按两半分别裁。**
`'label="编辑器"' in src`、`"未就绪" in src` 这类断言确实是同一失效类：日志措辞从
"未就绪"改成"尚未就绪"就假红，而产品行为毫无变化。4e 已承认本 PR 因字面量假红过两次，
却仍留着第三处。已从 `test_p4_wait_until` 移除，改由行为用例承担
（`test_editor_ready_timeout_leaves_a_reason_in_logs` 挂 loguru sink 断言警告里点名等待对象；
本仓日志是 loguru，`caplog` 抓不到，这一点也写进了测试注释）。
`==30.0`/`==10.0` 的值棘轮则**不成立**：断的是生效值而非源码位置，搬文件不会假红，
删掉反而失去"上限被悄悄改掉"的防线——保留，并由上面的哨兵值用例补上"映射"这一维。

**i5（§4e③ 声明的系统洞未修）—— 成立，已修。**
`.github/workflows/gui-test.yml` 此前只跑 `test_video_provider_imports.py` 一个文件，
"python-backend 回归不参与合并阻断"正是 PR-1 漏检的根因；4e 把它写成"待办"却没动 workflow。
现在新增 `Verify publisher RPA/DOM regressions` 步骤，显式纳入 5 个发布器测试文件
（xiaohongshu DOM 加固 / p4 等待守卫 / new_publishers / douyin publisher / douyin rpa_fields）。
同时补装 `pytest-asyncio`：本地依赖树里有、workflow 里从未声明，
不装则 CI 会**静默跳过全部 async 用例**——那会比没有门禁更危险（绿色但恒真）。
全量套件暂不纳入：本环境有 2 项既有失败（ASR 下载、story2video manifest），已在
`origin/main` 基线 worktree 复现，与本轨无关；另有 2 项（frame_html 模板路径、
llm_service ollama dummy key）单独跑为绿、全量跑为红，属同进程用例串扰。
把它们混进本域门禁只会让流水线长期红、降低门禁可信度，故留待各自域处理。

**本域门禁实测**：上述 5 文件在本地 90 passed；发布器 + 邻近套件全绿；
`node scripts/check-debt-budget.js` 通过（`filesOver500` 99 < 基线 101）。
**这句当时就无效**：它参照的是总数棘轮，而真正逐文件判定的是
`.github/scripts/check-max-lines.js`（见 4g ①），当时 511 行已越闸，CI 直接红。
5 种破坏（删可见性 / 词表放回裸「滑块」/ 只读首个元素 / 上传 `timeout_s` 误用 10s 常量 /
超时留痕改名或删除）各自跑红，恢复后全绿——其中第 ④ 种是补强：只断错误文案里数字的
旧写法会**假绿**（文案与 `timeout_s` 可以各用各的常量），因此加了轮询次数断言。

## 4g. 合并前 CI 抓出的两处"本地验错门禁"（PR-3，2026-10-09）

PR #3192 的 CI 有两项红，都不是发布逻辑错，而是**我本地参照了错的闸**：

**① `债务熔断检查`：`NEW_OVER_LIMIT: xiaohongshu.py 511 行 >= 500`。**
- 4e 里我引的是 `scripts/check-debt-budget.js`（`filesOver500` 总数棘轮，基线 101、允许回落），
  据此写下"xiaohongshu.py 保持 499 行不触闸"。真正阻断的是
  `.github/scripts/check-max-lines.js`：**逐文件**判定——不在挂账清单里的超限文件直接红，
  与总数无关。两把闸名字都像"债务熔断"、语义不同，取错一把等于没验。
  这也是本轨第 N 次撞上同一失效类：**判据看着在，实际不作用**。
- 处置：按本仓既有范式拆分（先例 `xiaohongshu_auth.py`），新增 `xiaohongshu_dom.py`
  承载底层控件操作（纯函数），发布器降至 446 行。
- **拆法约束（不能改成 mixin 的原因）**：风控选择器/词表/扫描上限与上传等待上限必须由
  发布器在调用处读取后**传参**。若 mixin 在自己模块里 `import` 这些常量，
  `monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", ...)` 与 `xhs.UPLOAD_FALLBACK_WAIT_TIMEOUT_S`
  就只改到发布器的命名空间，被测代码读的仍是 mixin 模块那份——测试照跑、patch 照失效，
  配上"能力声称存在"的文档就是假绿的完美形态。守卫里加了一条结构断言钉死它：
  `xiaohongshu_dom.py` 不得出现 `xiaohongshu_selectors` 的 import。
- 守卫同步改口径：`wait_until(` 的实现现在在 DOM 模块，"实现在哪"与"谁在调用"必须
  **两头分别断言**；只断 union 会在任一头被删时假绿。

**② `QG Static`：`STEP_NOT_FAIL_FAST gui-test.yml::Verify publisher RPA/DOM regressions`。**
- `scripts/check-step-failfast.js` 只看步骤级 `shell:` 行，读不到 workflow 级
  `defaults.run.shell: bash`，于是按最严口径判我不 fail-fast；另外我把
  `pip install pytest-asyncio` 和 `pytest` 写在同一 run 块里，`pytest-asyncio` 这个字面量
  正好命中它的"测试命令"正则，被算作第 2 条。
- 处置不是放宽门禁，而是按仓内惯例（其余 4 个多命令步骤都显式声明）补
  `shell: bash`，并把依赖声明收进 `pyproject.toml` 的新 `[test]` extra，run 块只留一条
  pytest。顺带关掉另一个洞：`pytest-asyncio` 此前只活在 workflow 文本里，仓库不声明，
  本地缺它时 `@pytest.mark.asyncio` 用例是**静默不收集**（0 收集 = 绿），比没有门禁更危险。

**破坏-恢复验证（6 种，全部跑过并恢复）**：
① DOM 模块自带常量 import → 守卫红；② 删掉 `wait_until` 轮询 → 守卫红；
③ 发布器不再经由 DOM 轮询 → 守卫红；④ 抹掉编辑器等待 label → 日志留痕行为用例红；
⑤ overlay 常量写死空占位 → 新增的"overlay 轨独立成立"用例红；⑥ 整条 overlay 轨删除 → 同一用例红。
其中 ⑤⑥ 是补出来的：破坏验证发现原有 risk 用例同时给了「安全验证」文案，文本轨会顺手兜住，
把 overlay 轨整条删掉**照样绿**——占位轨（Tier2 回填后要承担纯图形验证码这类无文案的层）
此前没有任何独立保护。新用例 `test_overlay_selector_alone_blocks_without_risk_wording`
只放可见容器、文案刻意避开词表，并反向自证该文案匹配不到文本轨。

**回归**：发布轨 5 文件 91 passed（较拆分前 +1 为新增用例）；全量
`packages/python-backend` 2822 passed / 4 failed，4 项仍是 4e/1.13 已归因的本分支未触碰的
既有/环境失败（`test_aggregation_video`、`test_frame_html`、`test_llm_service`、
`test_pipeline_loader`，已在 `origin/main` 基线 worktree 复现）；
`check-max-lines.js` ✅、`check-step-failfast.js` ✅（含其 `.test.js` 6/6）。
拆分本身是行为保持改动：90 项既有行为用例在改动后一次未变地全绿，只有静态守卫按新契约重订。

## 4h. 运行态取证（tab CDP，免扫码）：API 草稿链在 permit 步就断（2026-10-09）

按用户口径「后面用 tab 的 CDP 真实运行态验证」，对**正在运行的桌面实例**做了零依赖
CDP 驱动（`GET /json/list` 取 renderer target → Node 原生 `WebSocket` 连
`webSocketDebuggerUrl` → `Runtime.evaluate`）。没有新装依赖、没有 `pnpm exec`（它会
隐式装包、破坏 worktree 依赖），也没有启动第二个应用。

可达性事实：renderer 上挂了 431 个 `electronAPI` 键，含
`probeXiaohongshuDraftChain` / `draftSave` / `draftList` / 风控挂起一族；小红书账号
`has_cookies: true`、`status: active`、`last_validated` 为当日（凭证在桌面加密存储里，
Python 明文轨仍被策略硬阻，见 4d）。注意 preload 是**位置参数**
`probeXiaohongshuDraftChain(accountId, opts)`，传对象会被判"accountId 非法"。

探针两次调用（均只走草稿链，绝不点公开发布）：
- 不带媒体 → `XHS_NO_IMAGE`「至少需要 1 张图片：小红书不支持纯文字笔记」。分派正确。
- 带一张本地临时图 → `XHS_PERMIT_NO_FILE_ID`「permit: 响应缺 file_id」，且
  `chainDetail` 给出平台真实回包骨架：`topKeys=[success, data, code]`，
  `dataKeys=[result, uploadTempPermits]`。

**结论（直接影响验收）**：小红书 **API 轨**的草稿链**今天走不通**，断点在第 1 步取 permit，
根本走不到存草稿。代码读的是 `info.file_id`
（`packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js`），平台回的是
`uploadTempPermits`；全仓 grep `uploadTempPermits` **零命中**，说明这是刚取到的新契约
证据，不是既有已知项。

**这条断裂不影响 2.4 的验收路径（差点写错）**：我一度把它写成"桌面队列存草稿被阻塞"，
据代码核对后撤回——`apps/desktop/electron/services/publisher-router.js` 的
`ROUTE_TABLE.xiaohongshu = {mode:'rpa_vm'}`，桌面发布队列走 `RpaViewManager`
（WebContents `executeJavaScript` DOM 轨，上传/点草稿都在页面里做），
**不经过** `api-publish-engine` 的草稿链；后者今天只被诊断探针 IPC
（`ipc-handlers/xiaohongshu-draft-probe.js`）和引擎适配器注册表
（`src/adapters/xiaohongshu.js` ← `src/index.js`）触达。所以 permit 断裂的实际影响面是
"将来把路由切成 API 轨"这一选项，而不是本 change 的验收路径。把它当成验收阻塞，
就会得出"必须先把草稿箱验收改成修 permit"这个错误结论。

**为什么不在本轮直接修**：探针为安全只回传白名单字段（键名，不含值），我据此只知道
`uploadTempPermits` 这个键存在，不知道它是数组还是对象、项内有无 `file_id`。
按键名猜形状写出来的解析器，就是本轨一直在清的"能力声称存在、实际从不触发"的第二种
形态。2.7 的正确顺序：先在本地（gitignored，不入库）扩一处完整回包 dump 取到结构，
再按结构 TDD 解析器与它自己的 PR——且该修复属 API 轨范围，需用户确认是否纳入。

红线复核：探针未点击任何公开发布入口；回包只落本地；账号与 cookie 名称不入库、不入 PR。

## 5. 剩余工作（必须完成才算验收）

| 项 | 状态 | 阻塞 |
|----|------|------|
| 2.3a 端点模式常量回填 | 已完成（源证据） | — |
| PR-3 行数门禁拆分 + CI fail-fast 修正 | 已完成（4g） | — |
| 2.1 活体取证 runbook 脚本 | 已就绪（脚本+自检通过，未执行） | 执行需**用户登录小红书**（headed 浏览器扫码） |
| 2.2 真实选择器取证 | 待办 | 同上 |
| 2.3b `RISK_OVERLAY_SELECTOR` / `DRAFT_BOX_ITEM_SELECTOR` 回填 | 待办 | 依赖 2.1/2.2 |
| 2.4 真实草稿箱活体验收 | 待办 | 依赖 2.1/2.2/2.3b（(b) 路走 `rpa_vm`，与 4h 的 API permit 断裂无关） |
| 2.6 运行态取证（tab CDP，免扫码） | 已完成 | 取到 API 轨 permit 契约断裂证据（4h） |
| 2.7 API 轨 permit 契约修正 | 待办（范围外，待用户确认） | 需先取 permit 完整回包结构，禁止按键名猜 |
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
