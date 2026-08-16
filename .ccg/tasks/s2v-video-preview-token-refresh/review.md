# Review — s2v-video-preview-token-refresh

## 审查方式（机制硬化：先探测双模型，不可用降级）

- 按 CCG 并行发起 antigravity + Claude 固定 diff 审查（`codeagent-wrapper.exe --lite`，只读 diff `C:/tmp/s2v-token-refresh-review-diff.txt`，禁扫描/命令/编辑）。
- **antigravity 失败（地区不可用）**：`Error: Your current account is not eligible for Antigravity, because it is not currently available in your location.`（wrapper exit 1）→ 按机制硬化降级：Claude 报告 + 主代理自查。
- Claude wrapper exit 0，报告保存于 `C:/tmp/s2v-review-claude.md`。

## Claude 审查结果（triage）

### Critical
无。

### Warning（2 项，均已修复 + 回归测试）
1. **previousUrl 未校验即 revoke**（story2video.js:344）：任意字符串被直接交给 `revoke`，可能误逐出同 registry 的活跃令牌（分段图/音频/视频共享 128 条注册表）。
   → 修复：新增 `isLocalMediaTokenUrl(value, sampleUrl)`：同源（与新签发 URL 比较）+ `/media/[A-Za-z0-9_-]{16,128}` 路径校验；非本地/异源/非媒体路径一律不调 revoke。
   → 测试：原「file:// 仍转发 revoke」用例改为断言 revoke 不被调用；新增「同源非媒体路径 → revoke 不被调用」用例。
2. **player.load() 早于 Vue 应用新 src**（ResultView.vue:844）：同步调用时 `<video>` 仍持有旧（过期）URL。
   → 修复：`await this.$nextTick()` 后再 `player.load()`。
   → 测试：既有自愈用例（`await w.vm.handleError()` 后断言）覆盖该路径。

### Info（接受为后续项，本次不扩大范围）
- `catch (_)` 静默吞掉 revoke 失败：调试期可加日志，本次按 best-effort 语义保留（正常 URL 无副作用）。
- 自愈一次性（`videoReloadAttempted` 仅 loadVideoPath/loadProject 重置）：TTL 15 分钟二次过期会再次弹窗，属产品可接受行为（测试按设计固化）。
- 两次快速 error 可能双签发（状态位未同步）：无害，token 无副作用。
- 分段图/音频 URL 只做 revoke 透传、无自愈 error 处理：超出本次范围（主视频误报为报障场景）。
- publisher.js null/undefined 不对称：handler `typeof === 'string'` 守卫兜底，无实际风险。

## 主代理自查

- 修复与 TDD 红绿闭环：先加测试（7 failed）→ 实现 → 全绿。
- 契约保持：文案 `story2video.videoPreviewFailed` / `preview_missing` 未改；run 终态未改；1 参调用方（SceneAssetSelection.vue、preload.test.js、publisher.test.js）字节级兼容（conditional forward）。
- JS 中文注释避免 CJK 基线漂移（publisher.js/handler 注释为英文）；CJK scan PASS 1502 条。
- eslint：仅存量 `publish.js:156 no-useless-assignment`（HEAD 同报，不扩大范围）。
- 定向：ResultView 57 + IPC 26 + preload 349 + build-preload 3 = 435 用例绿。
- QM-1 打包与本文件记录，见交付记录。
