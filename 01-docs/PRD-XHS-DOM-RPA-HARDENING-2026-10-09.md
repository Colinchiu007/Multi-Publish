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

## 5. 剩余工作（必须完成才算验收）

| 项 | 状态 | 阻塞 |
|----|------|------|
| 2.3a 端点模式常量回填 | 已完成（源证据） | — |
| 2.1 / 2.2 活体取证 runbook + 真实选择器取证 | 待办 | **需用户登录小红书**（headed 浏览器扫码） |
| 2.3b `RISK_OVERLAY_SELECTOR` / `DRAFT_BOX_ITEM_SELECTOR` 回填 | 待办 | 依赖 2.1/2.2 |
| 2.4 真实草稿箱活体验收 | 待办 | 依赖上面全部 |
| 3.2 change 归档 | 待办 | 两 PR 合并 + 活体验收通过 |

当前端点属**源证据而非活体证据**：`/web_api/sns/v2/note` 是否确为创作者中心
存草稿时的实际 XHR，仍需 2.4 活体复核。在那之前本能力视为「已具备确认通道，
未活体验收」。

## 6. 取证 runbook（2.1，待执行）

在用户登录态下跑 headed 发布器：`login()` 扫码 → 同 context 走存草稿 →
`ResponseMonitor` dump 全部 XHR 的 url + 响应体 → 与草稿箱截图一并落 evidence 文档
→ 用实测值替换 2.3b 的选择器占位，并把 `DRAFT_SAVE_RESPONSE_PATTERNS`
从源证据升级为活体证据。
