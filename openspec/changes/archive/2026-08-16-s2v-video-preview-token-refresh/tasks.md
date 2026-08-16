# Tasks

## 实现

- [ ] T1 主进程：`story2video:create-share-url` 支持可选 `previousUrl` 并在成功后 revoke（`apps/desktop/electron/ipc-handlers/story2video.js`）
- [ ] T2 渲染端自愈状态机 + previousUrl 透传（`apps/desktop/src/views/ResultView.vue`）：`handleError` 先自愈一次、替换点传旧 URL、成功加载后重置标记
- [ ] T3 preload 签名同步并重建 bundle（`apps/desktop/electron/preload/publish.js` + `pnpm run build:preload` → `index.bundle.js`）

## 测试

- [ ] T4 `apps/desktop/electron/ipc-handlers/story2video.test.js`：传 previousUrl → revoke 被调用且新 URL 正常返回；不传 → revoke 不调用；非本地媒体 URL → 签发成功且 revoke 忽略（spec 场景2/3）
- [ ] T5 `apps/desktop/src/views/ResultView.test.js`：① 主视频 error 首次自愈（以旧 videoSrc 为 previousUrl 重新签发、重载、不弹窗）；② 二次 error 弹 `videoPreviewFailed`（spec 场景1/2 映射）；③ 无 videoPath 直接弹（spec 场景3）；④ 成功加载后重置自愈标记；⑤ refreshSegmentImageUrls 替换时传旧 URL
- [ ] T6 `apps/desktop/electron/preload.test.js` + `electron/tests/build-preload.test.js`：story2videoCreateShareUrl 第二可选参数、bundle 与源码 API 一致
- [ ] T7 CI 门禁自检：`pnpm run build:preload` + `test:preload:sandbox` + `check-locale-sync --cjk`（复用既有文案，无新增 CJK）+ 相关 vitest 文件全绿

## 交付

- [ ] T8 双模型/降级审查：Critical/Warning/Info 报告写入 `.ccg/tasks/s2v-video-preview-token-refresh/review.md`，Critical 修复后复审
- [ ] T9 QM-1 本地打包：`electron-builder --win --dir` exit 0
- [ ] T10 openspec validate + task.json 关联 + 三同步归档（merge 后）
