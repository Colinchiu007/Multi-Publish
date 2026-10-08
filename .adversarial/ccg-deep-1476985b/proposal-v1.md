# 变更提案（自动生成，待对抗评审）

- base: `origin/main`
- head: `1476985bdd5f10ba5ecf5dae89e50742a54a9b90`
- 采集模式: `diff`
- 变更规模: 1073 行

## 变更内容

```diff
diff --git a/.github/workflows/gui-test.yml b/.github/workflows/gui-test.yml
index 6639dba2c..9bec53687 100644
--- a/.github/workflows/gui-test.yml
+++ b/.github/workflows/gui-test.yml
@@ -61,11 +61,26 @@ jobs:
         run: python -m pip install "git+https://github.com/Colinchiu007/content-aggregator-shared.git"
 
       - name: Install Python backend runtime and test dependencies
-        run: python -m pip install -e "packages/python-backend[web,video,aggregation]" pytest
+        run: python -m pip install -e "packages/python-backend[web,video,aggregation,test]"
 
       - name: Verify optional Python provider imports
         run: python -m pytest packages/python-backend/tests/test_video_provider_imports.py -q
 
+      - name: Verify publisher RPA/DOM regressions
+        # 此前的系统洞：python-backend 只有 provider import 参与阻断，发布器回归测试
+        # （含静态守卫）只在本地实跑，守卫变红依旧无声合入。发布器套件全部纳入本步骤。
+        # pytest-asyncio 现由 [test] extra 声明安装，不再在此临时 pip install：
+        # 缺它时 @pytest.mark.asyncio 用例会静默不收集，门禁绿而用例是空的。
+        working-directory: packages/python-backend
+        shell: bash
+        run: |
+          python -m pytest \
+            tests/test_xiaohongshu_dom_hardening.py \
+            tests/test_p4_wait_until.py \
+            tests/test_new_publishers.py \
+            tests/test_douyin_publisher.py \
+            tests/test_douyin_rpa_fields.py -q
+
       - name: Verify Python backend imports
         working-directory: packages/python-backend/src
         run: python -c "import server, uvicorn, yaml; print('Python backend entrypoint imports ready')"
diff --git a/01-docs/PRD-XHS-DOM-RPA-HARDENING-2026-10-09.md b/01-docs/PRD-XHS-DOM-RPA-HARDENING-2026-10-09.md
index d59023c93..16bf0a9b9 100644
--- a/01-docs/PRD-XHS-DOM-RPA-HARDENING-2026-10-09.md
+++ b/01-docs/PRD-XHS-DOM-RPA-HARDENING-2026-10-09.md
@@ -87,15 +87,264 @@ DRAFT_SAVE_RESPONSE_PATTERNS: list[str] = ["/web_api/sns/v2/note"]
    切到 `backend`（或 `api-then-dom`）让桌面吃到本次加固。切换前提是 2.4 活体证据到手，
    否则等于把已验证的桌面路径换成未验证路径。
 
+## 4c. 风控归一武装（文本轨，2026-10-09 追加）
+
+同一类静默失效的第二处：`RISK_OVERLAY_SELECTOR` 为空占位时
+`_risk_present()` 直接 `return False` ⇒ PR-1 能力表里"风控归一 `XHS_RISK_BLOCKED`、
+且不降级换号"这条**实际从不触发**。
+
+- 修法：`_risk_present` 改为双轨——占位选择器（仍待 2.2 活体回填）**或**
+  "浮层容器 + 容器内风控文案"。文案口径取自本仓桌面轨已实战使用的风控词表
+  （`publish-risk.js` 的 `RISK_RE`），属源证据非活体取证。
+- **双条件是刻意的**：只在 `modal/dialog/overlay/verify/captcha` 容器内匹配，
+  避免页面常驻文案（侧栏「草稿箱」「验证封面」之类）误判成风控而阻断正常发布。
+  误判风控比漏判更有害——它会直接中止用户的草稿保存。
+- 默认常量非空由测试钉死（`test_text_track_constants_arming`），与 2.3a 的
+  "默认模式非空"断言同一思路：把静默失效变成红。
+- 新增 4 项用例：风控文案 → `XHS_RISK_BLOCKED` 且不点发布；无常驻浮层不判风控；
+  浮层内良性文案不判风控；常量默认值非空。
+
+## 4c-b. 文本轨的可见性前提（CCG 双审 i1/i2，2026-10-09 修正）
+
+上面 4c 的初版实现有一个 Critical 缺陷，被 CCG 深评抓出（`.adversarial/ccg-deep-320e8f2b/`）：
+它只查 `count() > 0` 然后读 `.first.inner_text()`，**从不查可见性**。
+
+- 失败场景（不是理论风险）：创作者中心是 SPA，未打开的 modal/verify 容器以
+  `v-show` 形式常驻 DOM，默认文案正是「请完成验证」。按初版实现，用户**每次**
+  草稿保存都会在流程入口被判 `XHS_RISK_BLOCKED` 而中止——本功能的验收口径是
+  "内容进真实草稿箱"，误判等于整个功能不可用。
+- 修正后的三条硬规则：
+  1. **必须可见**：`_visible_texts()` 只收 `is_visible()` 为真的元素文案；
+     选择器轨（占位 `RISK_OVERLAY_SELECTOR`）同样走可见性，不再是 `count()>0`。
+  2. **必须逐个扫描，且有上限**：`[class*="modal"]` 真实会命中多个节点，
+     风控层不在 DOM 首位时读 `.first` 必漏判（i2）；改为按序扫描可见元素，
+     上限 `RISK_HOST_SCAN_LIMIT = 8`，防止整页模板把 `inner_text` 成本放大到拖垮发布链。
+  3. **词表只收强指认短语**：删掉裸「滑块」与「拖动滑块」——封面裁剪弹窗的
+     「拖动滑块调整比例」是控件说明，不是风控；真实滑块验证必然同容器共现
+     「安全验证/验证码」，收紧不损失召回。
+     注：这是对源证据（`publish-risk.js` 的 `RISK_RE`）的**有意收窄**，理由与
+     双面用例已写进 `xiaohongshu_selectors.py` 注释，不是无意识漂移。
+- 用例（先红后绿）：隐藏模板不判风控 `test_hidden_risk_template_is_not_risk`；
+  第 2 位可见容器仍被抓到 `test_risk_wording_in_second_visible_host_is_caught`；
+  裁剪文案不判风控 + 真验证判风控；扫描截断到上限
+  `test_visible_hosts_beyond_scan_limit_are_not_read`。
+- 判定记录：i1、i2 均 `upheld`（含 prosecution/defense/rationale 三列，可复核）。
+
+## 4d. Python 轨认证已被策略硬阻（2026-10-09 用户实跑暴露）
+
+用户按 §6 运行探针，崩溃于 `legacy_auth_policy.require_legacy_plaintext_auth()`：
+`RuntimeError: 旧 Python 明文认证持久化已停用，请使用桌面端加密账号存储`。
+
+调用链是 `XiaoHongShuPublisher._ensure_browser()` →
+`xiaohongshu_auth._restore_auth_data()`（第 1 行）→ 策略守卫。该守卫除非同时满足
+两个 `MULTI_PUBLISH_*` 迁移环境变量 **且** 非生产环境，否则无条件抛错；
+`_save_auth_data()` 与 `_restore_cookies_legacy()` 同样受此门。
+
+结论与影响口径：
+
+- **这不是探针 bug，是仓库既定策略**（Python 明文认证持久化已停用，登录态归桌面加密
+  账号存储）。我们不应为了跑取证而放宽这两个环境变量——那等于在验收脚本里绕过一条
+  安全红线。
+- 因此 §4b 的判断要再加一层：Python 轨不仅**无生产调用方**（桌面发布被 `ROUTE_TABLE`
+  派到 `rpa_vm`），在正常构建下也**无法恢复登录态**。它的 DOM 链只能通过"探针自持
+  persistent profile + headed 扫码"这种方式被验证。
+- 修法：新增 `open_probe_browser()`，直接 `launch_persistent_context` 到账号 profile
+  目录，绕开 `_ensure_browser` 的认证恢复；结束后也不调 `_save_auth_data`
+  （登录态由 profile 目录自身留存）。gitignored，不入库。
+- 验收含义：**2.4 活体验收的正面证据必须来自桌面轨**（`rpa-view-platforms.js`
+  的 `draftOnly:true` 路径 → 草稿箱可见）。Python 轨的活体取证只用于回填选择器/端点，
+  不代表用户实际使用的链路。
+
+## 4e. PR-1 引入的回归：上传控件轮询被删 ⇒ 无媒体草稿（Bug 反哺，2026-10-09）
+
+发现方式不是功能测试，而是**静态守卫变红**：`test_p4_wait_until.py` 断言
+`xiaohongshu.py` 里 `wait_until(` 出现 ≥ 2 次，PR-1 合并后只剩 1 次。
+
+**① 根因**：PR-1 把"导航后轮询上传控件可见"（`upload_input_ready = await wait_until(...)`）
+替换成一次性 `_resolve_visible(page, "upload_input")`。`_resolve_visible` 不等待，
+SPA 首屏未挂载时返回 `(None, None)`，而调用处是
+`if file_input is not None: await set_input_files(...)` —— 条件不满足就**什么都不做且不报错**。
+
+**② 逃逸链**：这条静默跳过逃过了所有测试。PR-1 的单测用 `_base_page()`（控件恒可见）
+且 `media_paths=[]`，从未构造"延迟挂载"场景；后面的 `_await_editor_ready` 轮询会让页面
+最终看起来"就绪"，于是流程继续填标题、点存草稿 —— 产出**没有媒体的草稿**。
+用户的验收口径是草稿箱里内容完整，这属于缺陷交付而非失败交付，因此连错误码都不会出现。
+
+**③ 系统性漏洞**（两条，都已处理）：
+- `packages/python-backend` 的 pytest **不在任何 CI workflow 里**（`gui-test.yml` 只跑
+  `test_video_provider_imports.py`），所以守卫变红不阻断 PR —— tasks 1.9 的
+  "全量回归通过"是在本地未复跑该文件的前提下勾掉的。
+- 守卫自身用**源码字面量**断言（`"UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0" in src`、
+  `"改为轮询编辑器就绪" in src`）。PR-1 把常量定义移到 `xiaohongshu_selectors.py`、
+  日志措辞也改了，于是同一个守卫又出现两处**假红**，掩盖了它抓到的真红。
+
+**④ 修复 + 回归保护**：`_await_upload_input()` 恢复条件轮询（沿用
+`NAVIGATE_READY_TIMEOUT_S`/`NAVIGATE_READY_POLL_INTERVAL_S`），且把"有媒体但控件始终不挂载"
+从静默跳过改为 `CODE_UPLOAD_FAILED` **fail-closed**（不完整的草稿不进草稿箱）；纯文本草稿
+路径不等待、不受影响。上传控件与编辑器两处轮询收敛到共用 `_await_control()`（也顺带把
+`xiaohongshu.py` 压回 499 行，不触债务熔断的 ≥500 行文件数基线）。
+新增 4 项用例：延迟挂载必须等到并真正上传、始终不挂载必须 fail-closed 且不点存草稿、
+无媒体不白等、等待常量必须真的被发布器引用。
+守卫本身也被修：`wait_until(` 出现次数改成**调用图断言**（`_await_control` 存在且被
+`await` ≥ 2 次 + 两个 label 存在），因为把两处重复轮询收敛成一个共享 helper 是改进，
+按次数断言会把它误判成回退；`UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0` 的字面量子串改为
+断言**生效常量值**（常量已被 PR-1 移到 selectors 模块）。
+破坏-恢复验证（两种破坏都跑过）：
+① 删掉轮询只留一次性解析 → 行为用例 `test_late_mount_...` 变红；
+② 回退成"两处各自 wait_until"的旧形状 → 守卫变红。恢复后发布轨 51 项全绿。
+
+**⑤ 防止再发**：把"一次性解析 = 静默跳过"记为本轨的反模式；`_resolve_visible` 的返回值
+在**必须发生**的动作（上传媒体、点存草稿）上不允许 `if ... is not None` 直接吞掉，
+必须显式给出失败码。本条同时说明：验收前必须在本地实跑
+`cd packages/python-backend && pytest`，不能依赖 CI 兜底。
+
+## 4f. CCG 双审其余三项（i3/i4/i5，2026-10-09）
+
+i1/i2 见 §4c-b。另外三条同样全部 `upheld`，且各自有可验证的落点：
+
+**i3（等待上限被顺手收紧）—— 成立，已修。**
+改造前是 `sleep(30)` 后解析一次，等效容忍度 30s；PR-1 把上传控件那一处换成轮询时
+用了 `NAVIGATE_READY_TIMEOUT_S = 10s`，等于**同时**改了"怎么等"和"最多等多久"。
+更糟的是常量被错配：`UPLOAD_FALLBACK_WAIT_TIMEOUT_S`（名字就是"上传兜底"）当时被
+喂给了编辑器就绪，而上传路径拿到 10s。这与 4e 自己声明的准则"上限沿用原时长，
+只收紧快路径"直接矛盾。
+修法：两个等待的常量对调回来——上传控件 30s（原容忍度）+ 编辑器就绪 10s，
+`fail-closed` 与"命中即返回"的快路径收益全部保留。
+验证：`test_upload_ceiling_keeps_the_original_tolerance` 钉住 30s；
+`test_upload_path_uses_the_upload_fallback_ceiling` 给两个常量传不同哨兵值
+（0.05 / 9.99），看失败留痕里出现哪个，从而证明**映射**归属，而不是抠 `timeout_s=` 源码字面量。
+
+**i4（守卫的格式化耦合）—— 半成立，按两半分别裁。**
+`'label="编辑器"' in src`、`"未就绪" in src` 这类断言确实是同一失效类：日志措辞从
+"未就绪"改成"尚未就绪"就假红，而产品行为毫无变化。4e 已承认本 PR 因字面量假红过两次，
+却仍留着第三处。已从 `test_p4_wait_until` 移除，改由行为用例承担
+（`test_editor_ready_timeout_leaves_a_reason_in_logs` 挂 loguru sink 断言警告里点名等待对象；
+本仓日志是 loguru，`caplog` 抓不到，这一点也写进了测试注释）。
+`==30.0`/`==10.0` 的值棘轮则**不成立**：断的是生效值而非源码位置，搬文件不会假红，
+删掉反而失去"上限被悄悄改掉"的防线——保留，并由上面的哨兵值用例补上"映射"这一维。
+
+**i5（§4e③ 声明的系统洞未修）—— 成立，已修。**
+`.github/workflows/gui-test.yml` 此前只跑 `test_video_provider_imports.py` 一个文件，
+"python-backend 回归不参与合并阻断"正是 PR-1 漏检的根因；4e 把它写成"待办"却没动 workflow。
+现在新增 `Verify publisher RPA/DOM regressions` 步骤，显式纳入 5 个发布器测试文件
+（xiaohongshu DOM 加固 / p4 等待守卫 / new_publishers / douyin publisher / douyin rpa_fields）。
+同时补装 `pytest-asyncio`：本地依赖树里有、workflow 里从未声明，
+不装则 CI 会**静默跳过全部 async 用例**——那会比没有门禁更危险（绿色但恒真）。
+全量套件暂不纳入：本环境有 2 项既有失败（ASR 下载、story2video manifest），已在
+`origin/main` 基线 worktree 复现，与本轨无关；另有 2 项（frame_html 模板路径、
+llm_service ollama dummy key）单独跑为绿、全量跑为红，属同进程用例串扰。
+把它们混进本域门禁只会让流水线长期红、降低门禁可信度，故留待各自域处理。
+
+**本域门禁实测**：上述 5 文件在本地 90 passed；发布器 + 邻近套件全绿；
+`node scripts/check-debt-budget.js` 通过（`filesOver500` 99 < 基线 101）。
+**这句当时就无效**：它参照的是总数棘轮，而真正逐文件判定的是
+`.github/scripts/check-max-lines.js`（见 4g ①），当时 511 行已越闸，CI 直接红。
+5 种破坏（删可见性 / 词表放回裸「滑块」/ 只读首个元素 / 上传 `timeout_s` 误用 10s 常量 /
+超时留痕改名或删除）各自跑红，恢复后全绿——其中第 ④ 种是补强：只断错误文案里数字的
+旧写法会**假绿**（文案与 `timeout_s` 可以各用各的常量），因此加了轮询次数断言。
+
+## 4g. 合并前 CI 抓出的两处"本地验错门禁"（PR-3，2026-10-09）
+
+PR #3192 的 CI 有两项红，都不是发布逻辑错，而是**我本地参照了错的闸**：
+
+**① `债务熔断检查`：`NEW_OVER_LIMIT: xiaohongshu.py 511 行 >= 500`。**
+- 4e 里我引的是 `scripts/check-debt-budget.js`（`filesOver500` 总数棘轮，基线 101、允许回落），
+  据此写下"xiaohongshu.py 保持 499 行不触闸"。真正阻断的是
+  `.github/scripts/check-max-lines.js`：**逐文件**判定——不在挂账清单里的超限文件直接红，
+  与总数无关。两把闸名字都像"债务熔断"、语义不同，取错一把等于没验。
+  这也是本轨第 N 次撞上同一失效类：**判据看着在，实际不作用**。
+- 处置：按本仓既有范式拆分（先例 `xiaohongshu_auth.py`），新增 `xiaohongshu_dom.py`
+  承载底层控件操作（纯函数），发布器降至 446 行。
+- **拆法约束（不能改成 mixin 的原因）**：风控选择器/词表/扫描上限与上传等待上限必须由
+  发布器在调用处读取后**传参**。若 mixin 在自己模块里 `import` 这些常量，
+  `monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", ...)` 与 `xhs.UPLOAD_FALLBACK_WAIT_TIMEOUT_S`
+  就只改到发布器的命名空间，被测代码读的仍是 mixin 模块那份——测试照跑、patch 照失效，
+  配上"能力声称存在"的文档就是假绿的完美形态。守卫里加了一条结构断言钉死它：
+  `xiaohongshu_dom.py` 不得出现 `xiaohongshu_selectors` 的 import。
+- 守卫同步改口径：`wait_until(` 的实现现在在 DOM 模块，"实现在哪"与"谁在调用"必须
+  **两头分别断言**；只断 union 会在任一头被删时假绿。
+
+**② `QG Static`：`STEP_NOT_FAIL_FAST gui-test.yml::Verify publisher RPA/DOM regressions`。**
+- `scripts/check-step-failfast.js` 只看步骤级 `shell:` 行，读不到 workflow 级
+  `defaults.run.shell: bash`，于是按最严口径判我不 fail-fast；另外我把
+  `pip install pytest-asyncio` 和 `pytest` 写在同一 run 块里，`pytest-asyncio` 这个字面量
+  正好命中它的"测试命令"正则，被算作第 2 条。
+- 处置不是放宽门禁，而是按仓内惯例（其余 4 个多命令步骤都显式声明）补
+  `shell: bash`，并把依赖声明收进 `pyproject.toml` 的新 `[test]` extra，run 块只留一条
+  pytest。顺带关掉另一个洞：`pytest-asyncio` 此前只活在 workflow 文本里，仓库不声明，
+  本地缺它时 `@pytest.mark.asyncio` 用例是**静默不收集**（0 收集 = 绿），比没有门禁更危险。
+
+**破坏-恢复验证（6 种，全部跑过并恢复）**：
+① DOM 模块自带常量 import → 守卫红；② 删掉 `wait_until` 轮询 → 守卫红；
+③ 发布器不再经由 DOM 轮询 → 守卫红；④ 抹掉编辑器等待 label → 日志留痕行为用例红；
+⑤ overlay 常量写死空占位 → 新增的"overlay 轨独立成立"用例红；⑥ 整条 overlay 轨删除 → 同一用例红。
+其中 ⑤⑥ 是补出来的：破坏验证发现原有 risk 用例同时给了「安全验证」文案，文本轨会顺手兜住，
+把 overlay 轨整条删掉**照样绿**——占位轨（Tier2 回填后要承担纯图形验证码这类无文案的层）
+此前没有任何独立保护。新用例 `test_overlay_selector_alone_blocks_without_risk_wording`
+只放可见容器、文案刻意避开词表，并反向自证该文案匹配不到文本轨。
+
+**回归**：发布轨 5 文件 91 passed（较拆分前 +1 为新增用例）；全量
+`packages/python-backend` 2822 passed / 4 failed，4 项仍是 4e/1.13 已归因的本分支未触碰的
+既有/环境失败（`test_aggregation_video`、`test_frame_html`、`test_llm_service`、
+`test_pipeline_loader`，已在 `origin/main` 基线 worktree 复现）；
+`check-max-lines.js` ✅、`check-step-failfast.js` ✅（含其 `.test.js` 6/6）。
+拆分本身是行为保持改动：90 项既有行为用例在改动后一次未变地全绿，只有静态守卫按新契约重订。
+
+## 4h. 运行态取证（tab CDP，免扫码）：API 草稿链在 permit 步就断（2026-10-09）
+
+按用户口径「后面用 tab 的 CDP 真实运行态验证」，对**正在运行的桌面实例**做了零依赖
+CDP 驱动（`GET /json/list` 取 renderer target → Node 原生 `WebSocket` 连
+`webSocketDebuggerUrl` → `Runtime.evaluate`）。没有新装依赖、没有 `pnpm exec`（它会
+隐式装包、破坏 worktree 依赖），也没有启动第二个应用。
+
+可达性事实：renderer 上挂了 431 个 `electronAPI` 键，含
+`probeXiaohongshuDraftChain` / `draftSave` / `draftList` / 风控挂起一族；小红书账号
+`has_cookies: true`、`status: active`、`last_validated` 为当日（凭证在桌面加密存储里，
+Python 明文轨仍被策略硬阻，见 4d）。注意 preload 是**位置参数**
+`probeXiaohongshuDraftChain(accountId, opts)`，传对象会被判"accountId 非法"。
+
+探针两次调用（均只走草稿链，绝不点公开发布）：
+- 不带媒体 → `XHS_NO_IMAGE`「至少需要 1 张图片：小红书不支持纯文字笔记」。分派正确。
+- 带一张本地临时图 → `XHS_PERMIT_NO_FILE_ID`「permit: 响应缺 file_id」，且
+  `chainDetail` 给出平台真实回包骨架：`topKeys=[success, data, code]`，
+  `dataKeys=[result, uploadTempPermits]`。
+
+**结论（直接影响验收）**：小红书 **API 轨**的草稿链**今天走不通**，断点在第 1 步取 permit，
+根本走不到存草稿。代码读的是 `info.file_id`
+（`packages/api-publish-engine/src/publish/platforms/xiaohongshu-draft.js`），平台回的是
+`uploadTempPermits`；全仓 grep `uploadTempPermits` **零命中**，说明这是刚取到的新契约
+证据，不是既有已知项。
+
+**这条断裂不影响 2.4 的验收路径（差点写错）**：我一度把它写成"桌面队列存草稿被阻塞"，
+据代码核对后撤回——`apps/desktop/electron/services/publisher-router.js` 的
+`ROUTE_TABLE.xiaohongshu = {mode:'rpa_vm'}`，桌面发布队列走 `RpaViewManager`
+（WebContents `executeJavaScript` DOM 轨，上传/点草稿都在页面里做），
+**不经过** `api-publish-engine` 的草稿链；后者今天只被诊断探针 IPC
+（`ipc-handlers/xiaohongshu-draft-probe.js`）和引擎适配器注册表
+（`src/adapters/xiaohongshu.js` ← `src/index.js`）触达。所以 permit 断裂的实际影响面是
+"将来把路由切成 API 轨"这一选项，而不是本 change 的验收路径。把它当成验收阻塞，
+就会得出"必须先把草稿箱验收改成修 permit"这个错误结论。
+
+**为什么不在本轮直接修**：探针为安全只回传白名单字段（键名，不含值），我据此只知道
+`uploadTempPermits` 这个键存在，不知道它是数组还是对象、项内有无 `file_id`。
+按键名猜形状写出来的解析器，就是本轨一直在清的"能力声称存在、实际从不触发"的第二种
+形态。2.7 的正确顺序：先在本地（gitignored，不入库）扩一处完整回包 dump 取到结构，
+再按结构 TDD 解析器与它自己的 PR——且该修复属 API 轨范围，需用户确认是否纳入。
+
+红线复核：探针未点击任何公开发布入口；回包只落本地；账号与 cookie 名称不入库、不入 PR。
+
 ## 5. 剩余工作（必须完成才算验收）
 
 | 项 | 状态 | 阻塞 |
 |----|------|------|
 | 2.3a 端点模式常量回填 | 已完成（源证据） | — |
+| PR-3 行数门禁拆分 + CI fail-fast 修正 | 已完成（4g） | — |
 | 2.1 活体取证 runbook 脚本 | 已就绪（脚本+自检通过，未执行） | 执行需**用户登录小红书**（headed 浏览器扫码） |
 | 2.2 真实选择器取证 | 待办 | 同上 |
 | 2.3b `RISK_OVERLAY_SELECTOR` / `DRAFT_BOX_ITEM_SELECTOR` 回填 | 待办 | 依赖 2.1/2.2 |
-| 2.4 真实草稿箱活体验收 | 待办 | 依赖上面全部 |
+| 2.4 真实草稿箱活体验收 | 待办 | 依赖 2.1/2.2/2.3b（(b) 路走 `rpa_vm`，与 4h 的 API permit 断裂无关） |
+| 2.6 运行态取证（tab CDP，免扫码） | 已完成 | 取到 API 轨 permit 契约断裂证据（4h） |
+| 2.7 API 轨 permit 契约修正 | 待办（范围外，待用户确认） | 需先取 permit 完整回包结构，禁止按键名猜 |
 | 3.2 change 归档 | 待办 | 两 PR 合并 + 活体验收通过 |
 
 当前端点属**源证据而非活体证据**：`/web_api/sns/v2/note` 是否确为创作者中心
diff --git a/openspec/changes/rpa-xiaohongshu-dom-hardening/tasks.md b/openspec/changes/rpa-xiaohongshu-dom-hardening/tasks.md
index da57b0c8b..ad557b132 100644
--- a/openspec/changes/rpa-xiaohongshu-dom-hardening/tasks.md
+++ b/openspec/changes/rpa-xiaohongshu-dom-hardening/tasks.md
@@ -8,8 +8,26 @@
 - [x] 1.6 标签逐个 type + 选下拉，替换覆盖式 fill（红→绿：多标签全保留）
 - [x] 1.7 错误归一 login_expired / risk_blocked / transient（对齐 outcomeOfResult，risk/login 不降级不换号）（红→绿）
 - [x] 1.8 确认才成功骨架：ResponseMonitor.watch_patterns(<草稿端点占位>) + 草稿箱回查兜底；无确认→failure，删除盲 sleep success + 假 url（红→绿）
-- [x] 1.9 全量回归 `cd packages/python-backend && pytest`（含既有 test_new_publishers/test_douyin 不破）
+- [x] 1.9 全量回归 `cd packages/python-backend && pytest`（含既有 test_new_publishers/test_douyin 不破）— **此项原判定不成立**：`test_p4_wait_until.py` 的静态守卫在 PR-1 合并后即为红，而 python-backend pytest 不在任何 CI workflow（`gui-test.yml` 只跑 `test_video_provider_imports.py`），故未阻断；1.12 修复后重跑全量 = 2762 passed / 3 failed，3 项（`test_frame_html`、`test_llm_service`、`test_pipeline_loader`）与 `test_aggregation_video` 均属本分支未触碰的既有/环境依赖失败（`git diff origin/main --name-only` 验证），发布轨 0 失败
 - [x] 1.10 代码审查（对照 AGENTS.md 阶段 6：require 路径/错误处理/无外部端点）+ commit + PR + CI + autoMerge（已完成：PR #2885 squash 合并 e413cbc7，CI 全绿含 Gate 12/债务熔断/lint）
+- [x] 1.11 补 1.7 的静默失效：`RISK_OVERLAY_SELECTOR` 空占位使 risk 归一从不触发 ⇒ `_risk_present` 加"浮层容器 + 容器内风控文案"双条件文本轨（口径取本仓 `publish-risk.js` RISK_RE，源证据），默认常量非空由测试钉死；新增 4 项用例（红→绿）。**判定口径由 1.13 修正为三条件**（容器 + 可见 + 强指认文案）
+- [x] 1.12 修 PR-1 引入的回归（静态守卫抓出）：上传控件的一次性 `_resolve_visible` 在 SPA 晚挂载下**静默跳过媒体**并照样存草稿 ⇒ 产出无媒体草稿。`_await_upload_input()` 恢复条件轮询并把"有媒体却等不到控件"改为 `CODE_UPLOAD_FAILED` fail-closed；两处轮询收敛到共用 `_await_control()`（`xiaohongshu.py` 保持 499 行，不触 ≥500 行债务熔断基线）；新增 4 项用例（延迟挂载必须等到并上传、等不到必须 fail-closed 且不点草稿、无媒体不白等、常量必须被发布器引用）；守卫 `test_p4_wait_until` 由"字面量/次数"改为调用图 + 生效常量值断言（旧断言在 PR-1 把常量移入 selectors 模块后产生两处假红）；两种破坏（删轮询 / 拆掉共用 helper）均验证变红，恢复后发布轨 51 项全绿
+- [x] 1.13 CCG 深评（`320e8f2b`）五项全部裁决并落地（判定记录 `.adversarial/ccg-deep-320e8f2b/adjudication.json`，含 prosecution/defense/verdict/rationale）：
+  - **i1 Critical（upheld）**：文本轨只查 `count()>0` 不查可见性 ⇒ SPA 常驻的隐藏 modal 模板（默认文案就是「请完成验证」）会让**每次**草稿保存误判 `XHS_RISK_BLOCKED` 并中止；裸「滑块」还命中封面裁剪弹窗。改为"容器 + 可见 + 强指认文案"三条件，词表删裸「滑块」「拖动滑块」（真实滑块验证必共现「安全验证/验证码」，收紧不损召回）。用例 `test_hidden_risk_template_is_not_risk`/`test_bare_slider_crop_wording_is_not_risk`/`test_real_slider_verify_still_caught`（先红后绿）
+  - **i2（upheld）**：每 host 只读 `.first` ⇒ 风控层不在 DOM 首位即漏判。改为按序扫描可见元素并设 `RISK_HOST_SCAN_LIMIT=8`（防整页模板放大 `inner_text` 成本）。用例 `test_risk_wording_in_second_visible_host_is_caught`/`test_visible_hosts_beyond_scan_limit_are_not_read`
+  - **i3（upheld）**：1.12 把上传等待上限从原 30s 顺手改成 `NAVIGATE_READY_TIMEOUT_S=10s`，且把名为"上传兜底"的 30s 常量喂给了编辑器就绪——同时违反本轨自述"上限沿用原时长"。两常量对调回原位，fail-closed 与快路径收益保留。用例 `test_upload_ceiling_keeps_the_original_tolerance` + `test_upload_path_uses_the_upload_fallback_ceiling`（双哨兵值证映射，不抠源码字面量）
+  - **i4（半成立，分别裁）**：`'label="编辑器"'`/`"未就绪"` 源码字面量断言确为格式化耦合（本 PR 已因此假红两次），已从守卫移除并改由 loguru sink 行为用例承担（`test_editor_ready_timeout_leaves_a_reason_in_logs`；本仓非 stdlib logging，`caplog` 抓不到）；`==30.0/==10.0` 值棘轮指控不成立（断生效值、重构不假红），保留
+  - **i5（upheld）**：§4e③ 承认的系统洞（python-backend 回归不进 CI）此前只写在待办里，`gui-test.yml` 仅跑 `test_video_provider_imports.py`。新增 `Verify publisher RPA/DOM regressions` 步骤纳入 5 个发布器测试文件，并显式 `pip install pytest-asyncio`（workflow 从未声明该依赖，不装则 CI **静默跳过全部 async 用例**＝绿色但恒真）。全量套件不纳入：2 项既有失败已在 `origin/main` 基线 worktree 复现（ASR 下载、story2video manifest），另 2 项单跑为绿全量为红属用例串扰
+  - 1.9 的失败清单据此修正：全量重跑 2818 passed / 4 failed，其中 `test_aggregation_video`、`test_pipeline_loader` 在 main 基线 worktree 同样失败，`test_frame_html`、`test_llm_service` 单独运行为绿（同进程串扰），发布轨 0 失败；5 文件 CI 集本地 90 passed；`check-debt-budget.js` 通过（`filesOver500` 99 < 基线 101，`xiaohongshu.py` 507 行）
+  - **破坏-恢复验证（5 种破坏各自变红，非只写不验）**：① `_visible_texts` 去掉 `is_visible()` → 隐藏模板用例红；② 词表放回裸「滑块」/「拖动滑块」 → 裁剪文案用例红；③ 每 host 只取首个可见元素 → 第 2 位命中用例红；④ 上传等待 `timeout_s` 改回 `NAVIGATE_READY_*` → 轮询次数用例红（仅看错误文案的旧写法会假绿，故补此道）；⑤ 超时留痕改成不点名等待对象 / 整条删除 → loguru sink 行为用例红
+
+- [x] 1.14 PR #3192 CI 抓出两处"本地验错门禁"，均已修（详见 PRD §4g）：
+  - **① 逐文件行数闸**：1.12/1.13 引的是 `scripts/check-debt-budget.js`（`filesOver500` 总数棘轮，允许回落），据此写"507 行不触闸"；真正阻断的是 `.github/scripts/check-max-lines.js`，**逐文件**判 `NEW_OVER_LIMIT`（不在挂账清单里的新超限文件直接红，与总数无关）——1.12 那句"保持 499 行"的判据从一开始就是错的。按本仓既有范式拆出 `xiaohongshu_dom.py`（纯函数承载 `resolve_visible/await_control/set_field/add_tags/set_cover/visible_texts/risk_present`），发布器 446 行。
+  - **拆法约束（为什么不是第二个 mixin）**：风控选择器/词表/上限与上传等待常量必须由发布器在调用处读取后**传参**。mixin 若在自己模块 import 常量，`monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR"/"UPLOAD_FALLBACK_WAIT_TIMEOUT_S", ...)` 只改到发布器命名空间、被测代码仍读 mixin 那份 ⇒ patch 静默失效，正是本轨反复清理的"能力声称存在但从不触发"。守卫新增结构断言：`xiaohongshu_dom.py` 不得 import `xiaohongshu_selectors`。
+  - **守卫改两头断言**：`wait_until(` 实现现居 DOM 模块，发布器侧改断 `await dom.await_control(` + `await self._await_control(` ≥2；只断文件并集会在任一头被删时假绿。
+  - **② CI 步骤 fail-fast 闸**：`scripts/check-step-failfast.js` 判 1.13-i5 新增步骤为"会吞失败的多命令步骤"——它只看步骤级 `shell:`，读不到 workflow 级 `defaults.run.shell: bash`；且 `pip install pytest-asyncio` 里的字面量命中其测试命令正则被算作第 2 条。修法按仓内惯例：步骤显式 `shell: bash`，依赖声明收进 `pyproject.toml` 新 `[test]` extra（`pytest>=8.0` + `pytest-asyncio>=0.24`），run 块只留一条 pytest。i5 的"显式 pip install"口径据此作废（依赖只活在 workflow 文本里，本地缺它时 async 用例 0 收集＝绿但恒真）。
+  - **破坏-恢复验证（6 种，逐条实跑变红后恢复）**：① DOM 模块自带常量 import → 守卫红；② 删 `wait_until` 轮询 → 守卫红；③ 发布器不再经由 DOM 轮询 → 守卫红；④ 抹掉编辑器等待 label → loguru sink 行为用例红；⑤ overlay 常量写死空占位 / ⑥ overlay 轨整条删除 → **新增**用例 `test_overlay_selector_alone_blocks_without_risk_wording` 红。⑤⑥ 是补出来的：原 risk 用例同时给了「安全验证」文案，文本轨会顺手兜住，删掉整条占位轨照样绿——占位轨（Tier2 回填后承担无文案的纯图形验证码层）此前无独立保护。
+  - 回归：发布轨 5 文件 91 passed（+1 为新用例）；全量 2822 passed / 4 failed，4 项仍是 1.13 已归因的既有/环境失败；`check-max-lines.js` ✅、`check-step-failfast.js` 与其 `.test.js` 6/6 ✅
 
 ## 2. PR-2 · Tier2 活体取证回填（需用户登录小红书）
 
@@ -19,6 +37,8 @@
 - [ ] 2.3b 回填 selector 链与 RISK_OVERLAY_SELECTOR / DRAFT_BOX_ITEM_SELECTOR（需 2.1/2.2 活体取证）
 - [ ] 2.4 真实草稿箱活体验收（**双路覆盖**）：(a) 探针跑 python 轨存草稿 → 草稿箱出现本次条目；(b) 桌面真实队列发一条图文（`rpa-view-platforms.js` 的 `draftOnly:true` 用户路径）→ 草稿箱出现本次条目。均记录证据（截图/响应）。2026-10-09 调用链取证见 design.md「调用链取证」：`ROUTE_TABLE.xiaohongshu=rpa_vm`，桌面当前不经 python 发布器
 - [ ] 2.5 补 PR、更新 design 取证结论、openspec validate、回写 PRD/techdoc 相关小节
+- [x] 2.6 运行态取证（tab CDP，免扫码）——**取到 API 轨契约断裂证据**：对正在运行的桌面实例用零依赖 raw CDP（`/json/list` → Node 原生 `WebSocket` → `Runtime.evaluate`）调 `xiaohongshu:probe-draft-chain`（preload 为**位置参数** `(accountId, opts)`，传对象被判"accountId 非法"）。带媒体即回 `XHS_PERMIT_NO_FILE_ID`「permit: 响应缺 file_id」，`chainDetail.dataKeys=[result, uploadTempPermits]`；全仓 grep `uploadTempPermits` 零命中 ⇒ **API 轨**草稿链断在第 1 步取 permit。影响面核对后收窄：`publisher-router.js` 的 `ROUTE_TABLE.xiaohongshu={mode:'rpa_vm'}`，桌面队列走 WebContents DOM 轨、不经 api-publish-engine，故**不阻塞 2.4(b)**（我一度写成"2.4 被阻塞"，据代码撤回——PRD §4h 留了这条误判与纠证）。不直接修的原因：探针只回白名单**键名**不回值，按键名猜 `uploadTempPermits` 的形状写出的解析器就是下一个"从不触发"的能力（PRD §4h）
+- [ ] 2.7 API 轨 permit 契约修正（**范围外，需用户确认是否纳入**）：先在本地（gitignored，不入库）扩一处完整 permit 回包 dump 取到数组/对象形状与项内字段 → 按实测结构修 `xiaohongshu-draft.js` permit 解析（独立 change + TDD + 自己的 PR）
 
 ## 3. 收口
 
diff --git a/packages/python-backend/pyproject.toml b/packages/python-backend/pyproject.toml
index 666f965db..c1297e7b4 100755
--- a/packages/python-backend/pyproject.toml
+++ b/packages/python-backend/pyproject.toml
@@ -32,6 +32,13 @@ video = [
 asr = [
     "faster-whisper>=1.0.0",
 ]
+test = [
+    # 发布器回归测试此前只靠 CI 里临时 `pip install`，仓库内无声明：本地环境缺
+    # pytest-asyncio 时 @pytest.mark.asyncio 用例会「0 收集 / 静默跳过」而不是报错，
+    # 门禁看着是绿的其实是空的。声明进 extra 后装 [..,test] 即得同一套依赖。
+    "pytest>=8.0",
+    "pytest-asyncio>=0.24",
+]
 all = [
     "multi-publish-backend[web,video,asr]",
 ]
diff --git a/packages/python-backend/src/multi_publish/publishers/xiaohongshu.py b/packages/python-backend/src/multi_publish/publishers/xiaohongshu.py
index 9aeba0d21..cb1993304 100644
--- a/packages/python-backend/src/multi_publish/publishers/xiaohongshu.py
+++ b/packages/python-backend/src/multi_publish/publishers/xiaohongshu.py
@@ -10,7 +10,8 @@
   可在假对象下单测核心分支。
 - 合规红线：运行时不请求任何外部远程求签服务（禁引入外包签名农场域名）。
 
-常量见 xiaohongshu_selectors.py；认证持久化见 xiaohongshu_auth.py。
+常量见 xiaohongshu_selectors.py；认证持久化见 xiaohongshu_auth.py；
+底层控件操作（纯函数）见 xiaohongshu_dom.py。
 实现参照 douyin.py 的「先查 API 响应、再 URL、再 DOM」三级回退确认范式。
 """
 
@@ -22,7 +23,8 @@ import os
 from loguru import logger
 
 from multi_publish.models import PlatformType, PublishPhase, PublishResult
-from multi_publish.publishers.base import BasePublisher, PublisherConfig, ResponseMonitor, wait_until
+from multi_publish.publishers import xiaohongshu_dom as dom
+from multi_publish.publishers.base import BasePublisher, PublisherConfig, ResponseMonitor
 from multi_publish.publishers.xiaohongshu_auth import XiaohongshuAuthMixin
 from multi_publish.publishers.xiaohongshu_selectors import (
     CODE_DRAFT_ENTRY_MISSING,
@@ -37,7 +39,12 @@ from multi_publish.publishers.xiaohongshu_selectors import (
     DRAFT_BOX_ITEM_SELECTOR,
     DRAFT_BOX_URL,
     DRAFT_SAVE_RESPONSE_PATTERNS,
+    NAVIGATE_READY_POLL_INTERVAL_S,
+    NAVIGATE_READY_TIMEOUT_S,
+    RISK_HOST_SCAN_LIMIT,
     RISK_OVERLAY_SELECTOR,
+    RISK_TEXT_HOSTS,
+    RISK_TEXT_PATTERN,
     SELECTOR_FALLBACKS,
     UPLOAD_FALLBACK_POLL_INTERVAL_S,
     UPLOAD_FALLBACK_WAIT_TIMEOUT_S,
@@ -216,10 +223,17 @@ class XiaoHongShuPublisher(BasePublisher, XiaohongshuAuthMixin):
 
         await self._report_progress(PublishPhase.UPLOADING, "上传媒体文件...", 30)
         if media_paths:
+            file_input = await self._await_upload_input(page)
+            if file_input is None:
+                return PublishResult(
+                    success=False, platform="xiaohongshu",
+                    error=_coded(
+                        CODE_UPLOAD_FAILED,
+                        f"上传控件在 {UPLOAD_FALLBACK_WAIT_TIMEOUT_S}s 内未挂载，已停止而非静默跳过媒体",
+                    ),
+                )
             try:
-                file_input, _ = await self._resolve_visible(page, "upload_input")
-                if file_input is not None:
-                    await file_input.set_input_files(media_paths)
+                await file_input.set_input_files(media_paths)
             except Exception as e:
                 return PublishResult(
                     success=False, platform="xiaohongshu",
@@ -351,94 +365,65 @@ class XiaoHongShuPublisher(BasePublisher, XiaohongshuAuthMixin):
 
     async def _resolve_visible(self, page, key: str):
         """按候选回退链解析首个可见 locator，返回 (locator, selector) 或 (None, None)。"""
-        for sel in self._candidates_for(key):
-            try:
-                loc = page.locator(sel).first
-                if await loc.is_visible():
-                    return loc, sel
-            except Exception:
-                continue
-        return None, None
+        return await dom.resolve_visible(page, self._candidates_for(key))
 
     async def _set_field(self, page, key: str, text: str) -> bool:
         """标题/正文填写：优先原生 fill，contenteditable 回退 evaluate + dispatch 事件。"""
-        loc, _ = await self._resolve_visible(page, key)
-        if loc is None:
-            return False
-        try:
-            await loc.click()
-        except Exception:
-            pass
-        try:
-            await loc.fill(text)
-            return True
-        except Exception:
-            try:
-                await loc.evaluate(
-                    "(el, t) => { el.textContent = t;"
-                    " el.dispatchEvent(new Event('input', { bubbles: true }));"
-                    " el.dispatchEvent(new Event('change', { bubbles: true })); }",
-                    text,
-                )
-                return True
-            except Exception as e:
-                logger.warning(f"[小红书] 字段 {key} 填写失败: {e}")
-                return False
+        return await dom.set_field(page, self._candidates_for(key), text, label=key)
 
     async def _add_tags(self, page, tags: list[str]) -> None:
         """逐个 type + 尽力选下拉首个候选（修覆盖式 fill 只留最后一个）。"""
-        loc, _ = await self._resolve_visible(page, "tag_input")
-        if loc is None:
-            logger.debug("未找到标签输入框，跳过标签")
-            return
-        for tag in tags[:5]:
-            try:
-                await loc.click()
-                await loc.type(tag, delay=50)
-                sugg, _ = await self._resolve_visible(page, "tag_suggestion")
-                if sugg is not None:
-                    await sugg.click()
-                else:
-                    await loc.press("Enter")
-            except Exception as e:
-                logger.debug(f"[小红书] 标签 {tag} 添加失败（不影响草稿保存）: {e}")
+        await dom.add_tags(
+            page,
+            tag_candidates=self._candidates_for("tag_input"),
+            suggestion_candidates=self._candidates_for("tag_suggestion"),
+            tags=tags,
+        )
 
     async def _set_cover(self, page, cover_path: str) -> None:
-        try:
-            btn, _ = await self._resolve_visible(page, "cover_upload")
-            if btn is None:
-                return
-            await btn.click()
-            await asyncio.sleep(2)
-            inp, _ = await self._resolve_visible(page, "cover_input")
-            if inp is not None:
-                await inp.set_input_files(cover_path)
-        except Exception as e:
-            logger.warning(f"封面上传失败（不影响发布）: {e}")
+        await dom.set_cover(
+            page,
+            upload_candidates=self._candidates_for("cover_upload"),
+            input_candidates=self._candidates_for("cover_input"),
+            cover_path=cover_path,
+        )
 
-    async def _await_editor_ready(self, page) -> None:
-        """上传完成标志未命中时，轮询编辑器就绪（标题框可见），上限沿用原 30s。"""
-        ready = await wait_until(
-            lambda: self._title_visible(page),
-            timeout_s=UPLOAD_FALLBACK_WAIT_TIMEOUT_S,
-            interval_s=UPLOAD_FALLBACK_POLL_INTERVAL_S,
+    async def _await_control(self, page, key: str, *, label: str, timeout_s: float, interval_s: float):
+        """轮询候选链中首个可见控件，返回 locator 或 None；超时留痕但不臆断失败。"""
+        return await dom.await_control(
+            page, self._candidates_for(key), label=label, timeout_s=timeout_s, interval_s=interval_s
         )
-        if not ready:
-            logger.warning(
-                f"编辑器在 {UPLOAD_FALLBACK_WAIT_TIMEOUT_S}s 内未就绪（站点结构变化或上传未完成），继续尝试填写"
-            )
 
-    async def _title_visible(self, page) -> bool:
-        loc, _ = await self._resolve_visible(page, "title_input")
-        return loc is not None
+    async def _await_upload_input(self, page):
+        """上传控件必须真等：一次性解析在 SPA 晚挂载下返回 None，会静默跳过媒体照存草稿。
+
+        上限沿用原 30s 上传兜底时长（常量名即其来历），只收紧快路径、不放宽容忍度。
+        """
+        return await self._await_control(
+            page, "upload_input", label="上传控件",
+            timeout_s=UPLOAD_FALLBACK_WAIT_TIMEOUT_S, interval_s=UPLOAD_FALLBACK_POLL_INTERVAL_S,
+        )
+
+    async def _await_editor_ready(self, page) -> None:
+        await self._await_control(
+            page, "title_input", label="编辑器",
+            timeout_s=NAVIGATE_READY_TIMEOUT_S, interval_s=NAVIGATE_READY_POLL_INTERVAL_S,
+        )
 
     async def _risk_present(self, page) -> bool:
-        if not RISK_OVERLAY_SELECTOR:
-            return False
-        try:
-            return await page.locator(RISK_OVERLAY_SELECTOR).count() > 0
-        except Exception:
-            return False
+        """风控双轨逻辑见 xiaohongshu_dom.risk_present；四个常量必须在此处读取后传参，
+        否则 monkeypatch 本模块同名常量会静默失效（见该模块 docstring）。"""
+        return await dom.risk_present(
+            page,
+            overlay_selector=RISK_OVERLAY_SELECTOR,
+            hosts=RISK_TEXT_HOSTS,
+            pattern=RISK_TEXT_PATTERN,
+            limit=RISK_HOST_SCAN_LIMIT,
+        )
+
+    async def _visible_texts(self, page, sel: str) -> list[str]:
+        """该选择器命中的可见元素文案（上限 RISK_HOST_SCAN_LIMIT，防整页扫描）。"""
+        return await dom.visible_texts(page, sel, limit=RISK_HOST_SCAN_LIMIT)
 
     @staticmethod
     def _is_login_redirect(url: str) -> bool:
diff --git a/packages/python-backend/src/multi_publish/publishers/xiaohongshu_dom.py b/packages/python-backend/src/multi_publish/publishers/xiaohongshu_dom.py
new file mode 100644
index 000000000..684f8d315
--- /dev/null
+++ b/packages/python-backend/src/multi_publish/publishers/xiaohongshu_dom.py
@@ -0,0 +1,145 @@
+"""小红书 DOM 轨的底层控件操作（纯函数，无状态）。
+
+从 xiaohongshu.py 拆出，满足新代码单文件行数门禁（.github/scripts/check-max-lines.js）。
+
+为什么是**纯函数**而不是第二个 mixin：本轨的关键常量（风控选择器、风控词表、上传
+等待上限）必须在发布器模块命名空间里读取，然后作为参数传进来——这样
+``monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", ...)`` 才会真正改变行为。若把
+这些逻辑做成 mixin 并让它自己 import 常量，patch 发布器模块的同名常量会静默失效：
+能力看起来还在，实际已不响应任何配置。这正是 rpa-xiaohongshu-dom-hardening 要防的
+"静默失效"类，不能由拆分本身重新引入。
+"""
+
+from __future__ import annotations
+
+import asyncio
+import re
+
+from loguru import logger
+
+from multi_publish.publishers.base import wait_until
+
+
+async def visible_texts(page, sel: str, *, limit: int) -> list[str]:
+    """该选择器命中的**可见**元素文案，最多读取 limit 个元素。
+
+    上限是硬需要：`[class*="modal"]` 这类宿主选择器在 SPA 模板页可命中整页元素，
+    逐元素 inner_text 会把发布链路拖死。真实风控层是页面上最靠前的可见容器之一。
+    """
+    try:
+        loc = page.locator(sel)
+        total = min(await loc.count(), limit)
+    except Exception:
+        return []
+    out: list[str] = []
+    for i in range(total):
+        item = loc.nth(i)
+        try:
+            if await item.is_visible():
+                out.append((await item.inner_text()) or "")
+        except Exception:
+            continue
+    return out
+
+
+async def risk_present(page, *, overlay_selector: str, hosts: list[str], pattern: str, limit: int) -> bool:
+    """风控判定双轨：占位选择器（Tier2 待回填）+ 浮层内可见文案（本仓已实战口径）。
+
+    两轨都要求元素**可见**：SPA 常驻的隐藏 modal 模板自带默认风控文案，
+    不可见也当风控就会每次发布误判并中止草稿保存——误判比漏判更有害。
+    """
+    if overlay_selector and await visible_texts(page, overlay_selector, limit=limit):
+        return True
+    for host in hosts:
+        for text in await visible_texts(page, host, limit=limit):
+            if re.search(pattern, text, re.I):
+                logger.warning(f"[小红书] 可见浮层文案命中风控口径: {text[:60]!r}")
+                return True
+    return False
+
+
+async def resolve_visible(page, candidates: list[str]):
+    """按候选回退链解析首个可见 locator，返回 (locator, selector) 或 (None, None)。"""
+    for sel in candidates:
+        try:
+            loc = page.locator(sel).first
+            if await loc.is_visible():
+                return loc, sel
+        except Exception:
+            continue
+    return None, None
+
+
+async def await_control(page, candidates: list[str], *, label: str, timeout_s: float, interval_s: float):
+    """轮询候选链中首个可见控件，返回 locator 或 None；超时留痕但不臆断失败。
+
+    返回 None 只表示"没等到"，是否中止由调用方决定（媒体上传必须中止，编辑器就绪可降级）。
+    """
+    async def visible() -> bool:
+        loc, _ = await resolve_visible(page, candidates)
+        return loc is not None
+
+    if not await wait_until(visible, timeout_s=timeout_s, interval_s=interval_s):
+        logger.warning(f"{label}在 {timeout_s}s 内未就绪（站点结构变化或首屏未完成）")
+        return None
+    loc, _ = await resolve_visible(page, candidates)
+    return loc
+
+
+async def set_field(page, candidates: list[str], text: str, *, label: str) -> bool:
+    """标题/正文填写：优先原生 fill，contenteditable 回退 evaluate + dispatch 事件。"""
+    loc, _ = await resolve_visible(page, candidates)
+    if loc is None:
+        return False
+    try:
+        await loc.click()
+    except Exception:
+        pass
+    try:
+        await loc.fill(text)
+        return True
+    except Exception:
+        try:
+            await loc.evaluate(
+                "(el, t) => { el.textContent = t;"
+                " el.dispatchEvent(new Event('input', { bubbles: true }));"
+                " el.dispatchEvent(new Event('change', { bubbles: true })); }",
+                text,
+            )
+            return True
+        except Exception as e:
+            logger.warning(f"[小红书] 字段 {label} 填写失败: {e}")
+            return False
+
+
+async def add_tags(page, *, tag_candidates: list[str], suggestion_candidates: list[str], tags: list[str]) -> None:
+    """逐个 type + 尽力选下拉首个候选（修覆盖式 fill 只留最后一个）。"""
+    loc, _ = await resolve_visible(page, tag_candidates)
+    if loc is None:
+        logger.debug("未找到标签输入框，跳过标签")
+        return
+    for tag in tags[:5]:
+        try:
+            await loc.click()
+            await loc.type(tag, delay=50)
+            sugg, _ = await resolve_visible(page, suggestion_candidates)
+            if sugg is not None:
+                await sugg.click()
+            else:
+                await loc.press("Enter")
+        except Exception as e:
+            logger.debug(f"[小红书] 标签 {tag} 添加失败（不影响草稿保存）: {e}")
+
+
+async def set_cover(page, *, upload_candidates: list[str], input_candidates: list[str], cover_path: str) -> None:
+    try:
+        btn, _ = await resolve_visible(page, upload_candidates)
+        if btn is None:
+            return
+        await btn.click()
+        await asyncio.sleep(2)
+        inp, _ = await resolve_visible(page, input_candidates)
+        if inp is not None:
+            await inp.set_input_files(cover_path)
+    except Exception as e:
+        logger.warning(f"封面上传失败（不影响发布）: {e}")
diff --git a/packages/python-backend/src/multi_publish/publishers/xiaohongshu_selectors.py b/packages/python-backend/src/multi_publish/publishers/xiaohongshu_selectors.py
index f41bc8aee..a6997586b 100644
--- a/packages/python-backend/src/multi_publish/publishers/xiaohongshu_selectors.py
+++ b/packages/python-backend/src/multi_publish/publishers/xiaohongshu_selectors.py
@@ -73,6 +73,28 @@ DRAFT_BOX_ITEM_SELECTOR = '[class*="draft"] [class*="title"]'
 # 风控/验证弹层选择器（Tier2 取证回填），命中即判 risk_blocked 并停止。
 RISK_OVERLAY_SELECTOR = ""
 
+# 风控文本轨（与上面的占位选择器并行）：占位为空时 `if not RISK_OVERLAY_SELECTOR`
+# 会让 risk 归一恒假——即 PR-1 声称交付的 risk_blocked 实际从不触发。本轨用"浮层容器
+# + 浮层内文案"双条件判定，文案口径取自本仓桌面轨已实战使用的风控词表
+# （apps/desktop/electron/services/publish-risk.js 的 RISK_RE），属源证据非活体取证。
+# 只在浮层/弹窗/验证容器内匹配，避免页面常驻文案（如侧栏「草稿箱」「验证封面」）误判。
+RISK_TEXT_HOSTS: list[str] = [
+    '[class*="modal"]',
+    '[class*="dialog"]',
+    '[class*="overlay"]',
+    '[class*="verify"]',
+    '[class*="captcha"]',
+]
+# 词表只收"风控语境的强指认短语"，不收裸「滑块」「验证」这类单词：封面裁剪、图片旋转
+# 等良性可见弹窗同样含「拖动滑块调整比例」，裸词会误判风控并中止用户的草稿保存（误判
+# 比漏判更有害）。真实滑块验证必然同时出现「安全验证/验证码」，不会因收紧词表而漏判。
+RISK_TEXT_PATTERN = (
+    r"安全验证|请完成验证|验证码|操作频繁|账号存在风险|风控|risk control"
+)
+# 单个宿主容器内最多扫描的可见元素数，防止 `[class*="modal"]` 命中整页模板时逐元素
+# inner_text 拖垮发布链路。真实风控层是页面上最靠前的可见容器之一。
+RISK_HOST_SCAN_LIMIT = 8
+
 CREATOR_URL = "https://creator.xiaohongshu.com/"
 
 # 机器可读错误码前缀，便于上层 outcomeOfResult 归一（risk/login 绝不降级换号）。
diff --git a/packages/python-backend/tests/test_p4_wait_until.py b/packages/python-backend/tests/test_p4_wait_until.py
index efa99c836..1446dadc3 100644
--- a/packages/python-backend/tests/test_p4_wait_until.py
+++ b/packages/python-backend/tests/test_p4_wait_until.py
@@ -6,7 +6,6 @@
 改为条件轮询（判据 + 具名上限 + 超时原因），上限沿用原时长，只让快路径提前返回。
 """
 import asyncio
-import io
 import os
 import time
 
@@ -81,11 +80,32 @@ def test_sleep_never_crosses_deadline():
 
 
 def test_xiaohongshu_publisher_no_longer_blind_sleeps():
-    src = io.open(os.path.join(PUBLISHERS_DIR, "xiaohongshu.py"), encoding="utf-8").read()
+    src = open(os.path.join(PUBLISHERS_DIR, "xiaohongshu.py"), encoding="utf-8").read()
+    # 轮询实现已按行数门禁拆到 xiaohongshu_dom.py（发布器侧只留传参适配器），
+    # 所以"实现在哪"和"谁在调用"必须分两头断言：只看一头都会在另一头被删时假绿。
+    dom = open(os.path.join(PUBLISHERS_DIR, "xiaohongshu_dom.py"), encoding="utf-8").read()
     assert "await asyncio.sleep(30)" not in src, "上传兜底仍是无条件 sleep(30)"
     assert "await asyncio.sleep(3)" not in src, "导航后仍是无条件 sleep(3)"
-    assert src.count("wait_until(") >= 2
-    # 上限沿用原时长，只收紧快路径，不放宽容忍度
-    assert "UPLOAD_FALLBACK_WAIT_TIMEOUT_S = 30.0" in src
-    # 超时必须有原因留痕
-    assert "改为轮询编辑器就绪" in src and "编辑器在" in src
+    # 两处控件必须各自真等：上传控件 + 编辑器（标题框）。少一处就会退化成静默跳过媒体。
+    # 断言调用图而非 `wait_until(` 出现次数：两处轮询共用一个 _await_control 是改进，
+    # 按次数断言会把这种收敛误判成回退。
+    assert "wait_until(" in dom, "条件轮询实现被删除——回退为脆弱等待"
+    assert "await dom.await_control(" in src, "发布器不再经由 DOM 模块轮询"
+    assert src.count("await self._await_control(") >= 2, "上传控件与编辑器就绪各自须有一处轮询调用"
+    for helper in ("_await_upload_input", "_await_editor_ready", "_await_control"):
+        assert f"async def {helper}(" in src, f"就绪轮询 {helper} 被删除"
+    # 常量必须由发布器读取后传参：DOM 模块若自己 import 选择器常量，
+    # monkeypatch 发布器模块的同名常量就会静默失效——能力声称存在但配置不再起作用，
+    # 正是本轨反复清理的"静默失效"类，所以在此钉死结构而不是只靠注释。
+    assert "xiaohongshu_selectors" not in dom, "DOM 模块不得自带常量 import，否则 patch 发布器常量失效"
+    # 上限沿用原时长，只收紧快路径，不放宽容忍度。
+    # 断言生效值而非常量子串：常量定义已由 xiaohongshu.py 移到 xiaohongshu_selectors.py，
+    # 依赖文件内字面量会让守卫在纯重构后假红（值对、位置变）。
+    from multi_publish.publishers import xiaohongshu as xhs
+
+    assert xhs.UPLOAD_FALLBACK_WAIT_TIMEOUT_S == 30.0
+    assert xhs.NAVIGATE_READY_TIMEOUT_S == 10.0
+    # 「超时须留原因」「哪个常量喂给哪个等待」属行为性质，交由
+    # tests/test_xiaohongshu_dom_hardening.py 的行为用例断言（caplog / 错误文案哨兵值）。
+    # 本守卫不再抠 label 与日志措辞的字面量——改引号或换个说法就假红，正是 PR-1
+    # 那次守卫假红的同一失效类（CCG i4）。
diff --git a/packages/python-backend/tests/test_xiaohongshu_dom_hardening.py b/packages/python-backend/tests/test_xiaohongshu_dom_hardening.py
index 0d28b5421..6def9c470 100644
--- a/packages/python-backend/tests/test_xiaohongshu_dom_hardening.py
+++ b/packages/python-backend/tests/test_xiaohongshu_dom_hardening.py
@@ -9,7 +9,10 @@
 
 from __future__ import annotations
 
+import re
+
 import pytest
+from loguru import logger
 
 from multi_publish.models import PlatformType
 from multi_publish.publishers import xiaohongshu as xhs
@@ -28,6 +31,10 @@ class FakeLocator:
         return self
 
     async def is_visible(self):
+        calls = self._page.visibility_calls
+        calls[self._sel] = calls.get(self._sel, 0) + 1
+        if self._sel in self._page.visible_after:
+            return calls[self._sel] > self._page.visible_after[self._sel]
         return self._sel in self._page.visible
 
     async def count(self):
@@ -66,6 +73,9 @@ class FakeLocator:
 class FakePage:
     def __init__(self):
         self.visible: set[str] = set()
+        # 延迟挂载：selector -> 需要前 N 次可见性查询返回 False（模拟 SPA 控件晚到）
+        self.visible_after: dict[str, int] = {}
+        self.visibility_calls: dict[str, int] = {}  # 每个 selector 被查询可见性的次数
         self.counts: dict[str, int] = {}
         self.not_fillable: set[str] = set()
         self.item_texts: dict[str, list[str]] = {}
@@ -215,7 +225,28 @@ class TestErrorNormalization:
     async def test_risk_overlay_maps_risk_blocked(self, publisher, monkeypatch):
         monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", '[class*="verify"]', raising=False)
         page = _base_page()
-        page.counts['[class*="verify"]'] = 1
+        # 选择器轨同样要求可见：仅存在于 DOM 的验证容器不算风控
+        page.visible.add('[class*="verify"]')
+        page.item_texts['[class*="verify"]'] = ["请完成安全验证"]
+        result = await _flow(publisher, page, FakeMonitor(), draft=True)
+        assert result.success is False
+        assert xhs.CODE_RISK_BLOCKED in (result.error or "")
+
+    @pytest.mark.asyncio
+    async def test_overlay_selector_alone_blocks_without_risk_wording(self, publisher, monkeypatch):
+        """overlay 占位轨必须独立成立，而不是被文本轨顺手兜住。
+
+        与上一条的分工：上一条同时给了「安全验证」文案，文本轨也能判真，所以把
+        overlay 轨整条删掉它照样绿（本轮破坏验证实测到的假绿）。占位轨的本职是
+        Tier2 回填后那些**没有可匹配文案**的风控层（纯图形/拼图验证码），
+        所以这里只放一个可见容器、文案刻意避开词表。
+        """
+        monkeypatch.setattr(xhs, "RISK_OVERLAY_SELECTOR", '[class*="verify"]', raising=False)
+        page = _base_page()
+        page.visible.add('[class*="verify"]')
+        page.item_texts['[class*="verify"]'] = ["请按提示操作"]
+        # 反向自证：这条文案必须匹配不到文本轨，否则本用例并没有单独钉住 overlay 轨
+        assert not re.search(xhs.RISK_TEXT_PATTERN, "请按提示操作", re.I)
         result = await _flow(publisher, page, FakeMonitor(), draft=True)
         assert result.success is False
         assert xhs.CODE_RISK_BLOCKED in (result.error or "")
@@ -315,3 +346,210 @@ class TestTier2EndpointArming:
         result = await _flow(publisher, page, monitor, draft=True)
         assert result.success is False
         assert xhs.CODE_UNCONFIRMED in (result.error or "")
+
+
+class TestRiskTextTrack:
+    """风控文本轨：占位选择器为空时，risk 归一不得静默失效（与端点空占位同一类缺陷）。"""
+
+    @pytest.mark.asyncio
+    async def test_modal_with_risk_wording_maps_risk_blocked(self, publisher):
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = ["请完成安全验证，拖动滑块完成下方拼图"]
+        result = await _flow(publisher, page, FakeMonitor(), draft=True)
+        assert result.success is False
+        assert xhs.CODE_RISK_BLOCKED in (result.error or "")
+        assert PUBLISH_SEL not in page.clicked  # 风控下不得继续动作
+
+    @pytest.mark.asyncio
+    async def test_risk_wording_without_overlay_host_is_not_risk(self, publisher):
+        # 无常驻浮层时，标题/正文里出现「验证」二字不得误判风控
+        page = _base_page()
+        result = await _flow(publisher, page, FakeMonitor(), draft=True)
+        assert xhs.CODE_RISK_BLOCKED not in (result.error or "")
+
+    @pytest.mark.asyncio
+    async def test_benign_modal_text_is_not_risk(self, publisher):
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = ["笔记标题", "草稿箱", "封面"]
+        assert await publisher._risk_present(page) is False
+
+    def test_text_track_constants_arming(self):
+        # 默认值必须非空：否则本轨与 2.3a 的空占位同样恒假
+        assert xhs.RISK_TEXT_HOSTS
+        assert xhs.RISK_TEXT_PATTERN
+
+    @pytest.mark.asyncio
+    async def test_hidden_risk_template_is_not_risk(self, publisher):
+        """CCG i1（Critical）：SPA 常驻的隐藏 modal 模板带默认风控文案，不得误判风控。
+
+        误判风控会直接中止用户草稿保存，比漏判更有害 —— 可见性是文本轨的硬前提。
+        """
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.counts[host] = 1  # 在 DOM 里，但不可见
+        page.item_texts[host] = ["请完成验证，拖动滑块继续"]
+        assert await publisher._risk_present(page) is False
+
+    @pytest.mark.asyncio
+    async def test_risk_wording_in_second_visible_host_is_caught(self, publisher):
+        """CCG i2：`[class*="modal"]` 命中多个容器时，风控层不在 DOM 首位也必须抓到。"""
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = ["笔记封面", "账号存在风险，请完成安全验证"]
+        assert await publisher._risk_present(page) is True
+
+    @pytest.mark.asyncio
+    async def test_bare_slider_crop_wording_is_not_risk(self, publisher):
+        """CCG i1 另一半：可见裁剪弹窗里的「拖动滑块」是控件说明，不是风控。
+
+        词表曾含裸「滑块」与「拖动滑块」，封面裁剪等良性容器会误判风控并中止草稿
+        保存；收紧为强指认短语后，真实滑块验证仍靠同容器内的「安全验证」命中。
+        """
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = ["裁剪封面：拖动滑块调整比例"]
+        assert await publisher._risk_present(page) is False
+
+    @pytest.mark.asyncio
+    async def test_real_slider_verify_still_caught(self, publisher):
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = ["安全验证：拖动滑块完成拼图"]
+        assert await publisher._risk_present(page) is True
+
+    def test_host_scan_limit_is_imported_and_bounded(self):
+        """CCG i1 衍生：整页 modal 模板下扫描必须有上限，否则 inner_text 拖垮发布链路。"""
+        assert hasattr(xhs, "RISK_HOST_SCAN_LIMIT")
+        assert 0 < xhs.RISK_HOST_SCAN_LIMIT <= 16
+
+    @pytest.mark.asyncio
+    async def test_visible_hosts_beyond_scan_limit_are_not_read(self, publisher):
+        page = _base_page()
+        host = xhs.RISK_TEXT_HOSTS[0]
+        page.visible.add(host)
+        page.item_texts[host] = [f"文案{i}" for i in range(xhs.RISK_HOST_SCAN_LIMIT + 5)]
+        assert await publisher._visible_texts(page, host) == [
+            f"文案{i}" for i in range(xhs.RISK_HOST_SCAN_LIMIT)
+        ]
+
+
+class TestUploadReadinessPoll:
+    """PR-1 回归保护：上传控件晚挂载时绝不静默跳过媒体。
+
+    静态守卫 test_p4_wait_until 要求 xiaohongshu.py 里保留两处条件等待
+    （上传控件 + 编辑器），PR-1 把上传控件那一处换成了一次性 `_resolve_visible`，
+    守卫变红——而它是对的：SPA 下首屏没挂载就解析 ⇒ file_input 为 None ⇒
+    `if file_input is not None` 静默不传图，随后照样填标题存草稿，
+    产出的是"无媒体草稿"。用户验收口径是草稿箱里内容完整，这属于缺陷交付。
+    """
+
+    @pytest.mark.asyncio
+    async def test_late_mount_upload_input_is_awaited_then_used(self, publisher, monkeypatch):
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_WAIT_TIMEOUT_S", 2.0, raising=False)
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_POLL_INTERVAL_S", 0.01, raising=False)
+        sel = publisher._candidates_for("upload_input")[0]
+        page = _base_page()
+        page.visible_after[sel] = 2  # 前两次查询不可见，第三次起可见
+        page.visible.add(DRAFT_SEL)
+        result = await _flow(publisher, page, FakeMonitor(), media_paths=["a.jpg"])
+        assert page.uploaded == [["a.jpg"]], f"延迟挂载的上传控件未被等待，媒体被静默跳过: {result.error}"
+
+    @pytest.mark.asyncio
+    async def test_media_requested_but_upload_input_never_appears_fails_closed(
+        self, publisher, monkeypatch
+    ):
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_WAIT_TIMEOUT_S", 0.05, raising=False)
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_POLL_INTERVAL_S", 0.01, raising=False)
+        page = _base_page()
+        page.visible.add(DRAFT_SEL)
+        result = await _flow(publisher, page, FakeMonitor(), media_paths=["a.jpg"])
+        assert result.success is False
+        assert xhs.CODE_UPLOAD_FAILED in (result.error or "")
+        assert page.uploaded == []
+        # 红线：传不上图就不该继续把空媒体草稿存进草稿箱
+        assert DRAFT_SEL not in page.clicked
+
+    def test_upload_ceiling_keeps_the_original_tolerance(self):
+        """CCG i3：等待改为条件轮询后，上限必须沿用改造前的 30s 上传兜底时长。
+
+        只收紧快路径（命中即返回），不放宽容忍度也不额外收紧——把 30s 换成 10s
+        会把慢网首屏判成上传失败，属于另一种常态化误伤。
+        """
+        assert xhs.UPLOAD_FALLBACK_WAIT_TIMEOUT_S == 30.0
+
+    @pytest.mark.asyncio
+    async def test_upload_path_uses_the_upload_fallback_ceiling(self, publisher, monkeypatch):
+        """CCG i3 的可验证面：失败留痕里的上限就是上传路径实际生效的那个常量。
+
+        两个等待常量取不同哨兵值，谁出现在错误文案里就证明映射归谁——比在源码里
+        抠 `timeout_s=...` 字面量稳（重排参数/换调用形式都不会假红，也不会假绿）。
+        """
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_WAIT_TIMEOUT_S", 0.05, raising=False)
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_POLL_INTERVAL_S", 0.01, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_TIMEOUT_S", 9.99, raising=False)
+        page = _base_page()
+        page.visible.add(DRAFT_SEL)
+        result = await _flow(publisher, page, FakeMonitor(), media_paths=["a.jpg"])
+        assert "0.05" in (result.error or ""), f"上传等待未使用 UPLOAD_FALLBACK_* 上限: {result.error}"
+        assert "9.99" not in (result.error or "")
+
+    @pytest.mark.asyncio
+    async def test_upload_wait_poll_count_matches_its_own_ceiling(self, publisher, monkeypatch):
+        """i3 的第二道：轮询次数证"真正生效的上限"归属，只盯错误文案会被骗过。
+
+        若 `timeout_s=` 与消息各用各的常量（消息对、等待错），上一条仍会绿。
+        0.05s / 0.01s ≈ 6 次查询；误用 9.99s 上限则是 ~1000 次。
+        """
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_WAIT_TIMEOUT_S", 0.05, raising=False)
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_POLL_INTERVAL_S", 0.01, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_TIMEOUT_S", 9.99, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_POLL_INTERVAL_S", 0.01, raising=False)
+        page = _base_page()
+        page.visible.add(DRAFT_SEL)
+        await _flow(publisher, page, FakeMonitor(), media_paths=["a.jpg"])
+        sel = publisher._candidates_for("upload_input")[0]
+        calls = page.visibility_calls.get(sel, 0)
+        assert 1 <= calls < 50, f"上传轮询 {calls} 次与 0.05s 上限不符（疑似用错等待常量）"
+
+    @pytest.mark.asyncio
+    async def test_editor_ready_timeout_leaves_a_reason_in_logs(self, publisher, monkeypatch):
+        """CCG i4：超时留痕用行为断言，不再靠源码里的字面措辞（措辞一改就假红）。
+
+        本仓日志走 loguru（非 stdlib logging），caplog 抓不到，故挂一个临时 sink。
+        """
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_TIMEOUT_S", 0.05, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_POLL_INTERVAL_S", 0.01, raising=False)
+        page = FakePage()  # 标题控件始终不可见 ⇒ 编辑器就绪轮询必然超时
+        page.visible.add(DRAFT_SEL)
+        messages: list[str] = []
+        sink_id = logger.add(lambda m: messages.append(str(m)), level="WARNING")
+        try:
+            await _flow(publisher, page, FakeMonitor(), media_paths=[])
+        finally:
+            logger.remove(sink_id)
+        assert any("编辑器" in m for m in messages), f"编辑器超时未留原因: {messages}"
+
+    @pytest.mark.asyncio
+    async def test_text_only_draft_skips_upload_wait(self, publisher, monkeypatch):
+        # 无媒体时不该为上传控件白等（纯图文/正文草稿仍是合法路径）
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_WAIT_TIMEOUT_S", 30.0, raising=False)
+        monkeypatch.setattr(xhs, "UPLOAD_FALLBACK_POLL_INTERVAL_S", 0.01, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_TIMEOUT_S", 0.05, raising=False)
+        monkeypatch.setattr(xhs, "NAVIGATE_READY_POLL_INTERVAL_S", 0.01, raising=False)
+        page = _base_page()
+        page.visible.add(DRAFT_SEL)
+        result = await _flow(publisher, page, FakeMonitor(), media_paths=[])
+        assert page.uploaded == []
+        assert xhs.CODE_UPLOAD_FAILED not in (result.error or "")
+
+    def test_upload_poll_constant_is_imported_in_publisher(self):
+        # 静默失效守卫：等待时长常量必须真的被发布器引用，而不是只存在于选择器表里
+        assert hasattr(xhs, "NAVIGATE_READY_TIMEOUT_S")
+        assert hasattr(xhs, "NAVIGATE_READY_POLL_INTERVAL_S")

```

> 这是机械生成的变更提案，不代表任何设计意图。评审方请只针对上述内容挑刺。