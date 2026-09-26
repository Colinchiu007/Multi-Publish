# D2 快手发布按钮选择器 — 代码取证结论（2026-09-27）

## 背景
t6d/t6g/t6h：确认 `platform-selectors.js` kuaishou `publish_btn` 的 7 个候选是否选择器漂移、是否需刷新（2.2/2.3）。
活体登录被快手 passport jigsaw 滑块风控物理阻断（用户不在电脑前，不可远程代解），故转既往 live DOM 取证。

## 关键纠正
生产日志 `publishButtons=7` / `DIAG[pubBtn=7]`（rpa-view-platforms.js L278/L471）= **配置的选择器个数**
（`sel.publish_btn.length`），**不是页面实采按钮数**。此前"生产找到 7 个按钮"是误读。

## 证据链（登录态有效时采集）
来源：`01-docs/evidence/rpa-dom-2026-09-23/` + `.agent_context/staging/rpa-dom-dumps/`

1. **deep-kuaishou（登录有效，URL=`cp.kuaishou.com/article/publish/video?tabType=1`）**
   - 唯一含"发布"文本的可见元素 = `<span>` text=`"发布作品"`（顶部导航，body 采到"命运石 发布作品 首页…"）。
   - `pubButtons` 只有这 1 个 span；无独立"发布"提交 `<button>`。
   - `dialogBtns`：`el-button confirm__btn ... is-disabled`「确定」（草稿弹窗，disabled）。

2. **d3-1 / d4-1（同为 tabType=1 上传落地页）**
   - 表单在"上传视频"拖拽态，**编辑表单的提交按钮尚未渲染**。
   - d4-1 `btns` 仅 2 个 ICP 备案链接；d3-1 `pubBtns=[]`（`/发布|投稿/` 且 `len<15` 无命中）。

3. **探针查询语义**（dump3/dump4/d5）：`button,[role=button],a` + `/发布|投稿/` → 上传落地页无提交钮，故空。
   d5（不限标签，`/^(发布|发 布|发表|提交|立即投稿|发布作品|下一步|确定)$/`）对 kuaishou **无输出**（缺 d5-kuaishou.json）。

## 核心判定
### ① 已知误匹配已被机制化修掉并有回归保护
`span:has-text("发布")`（候选#4）在上传落地页会命中顶部导航"发布作品"span（`containsAny`），
点击后不发发布请求——正是既往 bug。但：
- 解析器 `rpa-selector-utils.js#buildResolveElementCode` 已实现优先级：
  `exactInteractive > exactLeaf > containsInteractive > containsAny` + **tag/class 约束**（`button:has-text` 不会退化成任意 span）。
- 回归测试 `rpa-selector-utils.test.js` 的 fixture **逐字复现**快手场景
  （"在粉丝浏览高峰期发布"/"发布成功次数"/`<button>发布</button>`），断言按钮优先。
→ 该漂移/误匹配不是待办，已在 main 落地并锁测试。

### ② 真实提交钮 DOM 仍无正向证据 → 不可臆测改码
所有取证都在**上传落地页**（未上传完成/编辑前），从未采到编辑表单提交按钮的真实 tag/class。
补一个更精确的候选需要：有效登录 + 实传视频 + 填表后的编辑页——正是被滑块阻断的活体条件。

## 决定性新证据（2026-09-27 追加）——有效登录态下仍失败
来源：`shared-user-data/logs/app-2026-09-22/23.log`（`RpaView [kuaishou]`）。
**关键事实：09-22/09-23 快手账号是真实登录态（`checkLoginStatus ... cookies=14`，deep 快照含账号名"命运石"），发布却仍失败。**

失败时序（每次一致，数十次复现）：
```
publish config=... publishButtons=7
file input hasVideo=true → uploading file... → file uploaded
uploading cover... → DIAG[publish2] pubBtn=7 → publishing... → verifying...
[WARN] publish signal lacked platform ID; endpoint=.../article/publish/video responses=0
```

### 根因判读
快手属 `STRICT_PUBLISH_ID_PLATFORMS`，成功需 `responseId`（点击触发的发布 API 响应里的工作 ID）。
`responses=0` = **点击发布按钮后没有任何发布 API 请求被触发**（network capture 零命中）。
即：`publishing...` 找到了一个元素并 `.click()`（否则会报 `publish btn not found`），但该点击是空操作。

**两个候选根因（均与 responses=0 自洽，日志无法二选一）：**
- (A) `publish_btn` 选择器命中**非提交元素**（如顶部导航 `<span>发布作品</span>`），点击不触发发布；
- (B) 在**视频服务端上传未完成**前就尝试发布（`file uploaded`→`publishing` 仅 ~18s，早于 `_waitForVideoUploadComplete` 的 25s 稳定期）——
  编辑页真正的"发布"提交钮此时尚未渲染或处于 disabled，点击空转。
  （注：这批日志产 code 早于现 main，时序判定需用当前代码复核。）

### ⚠️ 重读产线日志的时效限定（重读 main 后回注）
当前 main `rpa-view-platforms.js` L310-345 **已有**「先上传 → `_waitForVideoUploadComplete` → 等编辑器表单就绪（`formReady`）→ 再填字段/发布」的守卫
（L310-312 注释明确写旧顺序先填字段必 timeout）。而上述 09-22/23 失败日志正是**该守卫入主之前的旧代码**产生的。
→ **不得用这批旧日志断言现 main 仍失败**。现 main 的快手发布是否成功，唯一可信证据是**当前代码的活体 E2E**（即 t9/6.3）——
需真实登录 + 真实上传一个视频 + 真实发布（会向用户账号发布一件作品，有副作用，必须用户在场同意）。

### 对结论的修正
之前判断"D2 仅登录阻断、非选择器漂移"**不完整**：现在有有效登录态产线证据表明 D2 是**确凿的功能性缺陷**。
但 (A)/(B) 归因 + 精确修 2.2/2.3，仍需**视频上传完成后的编辑页活体观测**（真实提交钮 DOM + 点击是否触发请求）——
该活体条件仍被 passport 滑块登录阻断（用户不在电脑前）。因此仍**不臆测改码**。

## 结论 / 处置
- **不改动** `platform-selectors.js` kuaishou `publish_btn`。现有 7 候选 + 解析器优先级 + 回归测试已覆盖已知误匹配。
- 2.2/2.3（刷新选择器/负例测）**保持 PENDING-活体**：需用户在场完成 passport 登录（人眼+鼠标过滑块）后，
  用本会话已验证的 **CDP DOM 域绕反调试冻结** 方案，在"视频上传完成后的编辑页"实采提交钮 DOM，再定夺。
- 若强行盲改，等于用猜测替换已测试的现状，违反"不臆测改码"。

## 可复用取证手段（已验证）
快手 `cp.kuaishou.com` 对 `Runtime.evaluate` 做反调试冻结（SPA 挂载后 evaluate/截图 timeout），
但 **CDP DOM 域**（`DOM.getDocument`/`querySelectorAll`/`getOuterHTML`）走渲染器 C++ 侧、不执行页面 JS，可读已解析 DOM。
`passport.kuaishou.com` 页 Runtime 不冻结。探针：`.agent_context/w3livefix-staging/probe-d2-dom.js`。
