## 1. 规格与实现

- [x] 1.1 agnes-image 适配器请求体 `extra_body.response_format` 契约 + b64_json 直出（`agnes-image.js`）
- [x] 1.2 回归测试 4 用例（extra_body 契约 / b64_json 请求与返回形状 / 缺失 fail closed / url 默认契约）

## 2. 验证与交付

- [x] 2.1 适配器 28 用例通过；eslint + git diff --check PASS
- [x] 2.2 真实 App E2E（debug profile + 真实 agnes-image）：DB 2938 success（34s）、segment-0_image_retry_*.png 落盘、UI「图片已重新生成。」——该验证同时驱动本修复（2026-08-16，会话 01a00929）
- [x] 2.3 QM-1 `electron-builder --win --dir` exit 0；asar 含 `electron\services\adapters\agnes-image.js`；verify-worktree-deps 9 项 OK
- [x] 2.4 双模型审查（antigravity 区域资格不可用 → 降级记录；Claude reviewer 0C/2M/4m 全部闭环 → review.md）
- [x] 2.5 推送 codex/fix-agnes-image-params → PR #901 → CI 16 项全绿（+Gate Result，release skipping）→ squash 合并 6a097527
- [x] 2.6 三同步归档：openspec archive（2026-08-16-fix-agnes-image-b64-json）+ CCG task 归档 + spec delta 同步入 openspec/specs/agnes-image-b64-json
