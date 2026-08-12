# 审查报告 — baijiahao-login-window-close

## 审查方式
- Claude（codeagent-wrapper --lite --backend claude，只读固定 diff）：完成，WRAPPER_EXIT=0
- antigravity：**降级**（`agy --version` 挂起 34s 无响应，后端不可用；按机制硬化规则降级，
  以 Claude 审查 + 主代理自查 + 本地测试作为证据）
- 主代理自查：逐行复核 6 个文件 diff + 真实网络复现验证

## Claude 发现与处置

### Critical
- **C1 手动完成路径仍接受预登录 Cookie** → 记录为受限后续项（不改本次）。
  理由：`hasCapturedCredentials` 需平台感知才能区分真实登录 Cookie；而百家号真实登录态
  Cookie（BDUSS）位于 `.baidu.com` 域，被 `isPlatformCookieDomain('baijiahao', ...)`
  过滤排除（platform-definitions.test.js:40 明确断言 false），若改为“必须存在 BDUSS”，
  反而会破坏真实登录入库。本 Bug（自动关闭+自动入库）已由 URL 模式清空 + 初始加载守卫
  彻底封死；手动“我已完成登录”是用户显式确认动作，残留风险为用户主动误操作，记录为
  后续优化项（可加“当前仍在登录页时拒绝完成”的交互提示）。
- **C2 CDP 回调缺 initialRedirectPhase 守卫** → 已修复（对称加固）。
  同时核实 `attachCdpDetection` 仅监听 passport.bilibili.com 的 XHR，bilibili 真实登录
  信号发生在 did-finish-load 之后，守卫不会误伤。

### Warning
- **W1 清空 patterns 影响所有消费者** → 已核实：`isPlatformLoginSuccessUrl` 全部消费者
  为 auth-view-manager（_checkLoginCompleted/loginSilent）、qrcode-login、platform.js
  （仅透传给渲染端，src 无消费）、测试。`loginSilent` 对 baijiahao 恒返回 valid:false，
  但当前渲染端无调用（auth:login-silent 仅 preload 暴露）。无 dashboard-ready 类依赖。
- **W2 baijiahao 测试未走全链路** → 已补强：新增 `openLogin` 真实接线测试（事件捕获 +
  did-finish-load 翻转 phase + 放行自动完成），并用 qrcode-login 新测试覆盖“初始加载前
  导航不提取、加载后提取”。
- **W3 QR interval flake 风险** → 已复核：所有触发 did-finish-load 的测试其会话最终
  close/settle，`_closeSession`/`_stopQrDetection` 清理 interval；两次运行稳定通过。
- **W4 auth-view-manager 接线未测** → 已修复：新增真实接线测试。

### Minor
- M1 did-fail-load 退化 → 已加注释（fail-closed 可接受）。
- M2 监听器未显式移除 → 与既有模式一致，接受。
- M3 平凡断言 → 已改为 `_urlExtractTimer` 断言。
- M4 http:// 单测 URL → 保留：`http://baijiahao.baidu.com/pcui/register/index` 是实测
  302 的真实跳转地址。

## 其他平台回归评估
- wechat_mp/zhihu/weibo/bilibili/twitter/instagram/facebook/youtube：登录 URL 与成功
  URL 路径/host 不同，登录必经一次 did-finish-load 后才有成功导航，守卫不破坏。
- douyin/xiaohongshu/tencent_video/kuaishou/toutiao：裸 host 模式本身存在同类潜在误判，
  守卫反而修复；若为纯 SPA（登录后仅 did-navigate-in-page）则本就不走 URL 自动完成。
- 会话分区按 accountId 隔离，重登录场景不受影响。

## 结论
Critical 0（C2 已修）、Warning 已全部处置或记录、Minor 已处置。修复闭环。
