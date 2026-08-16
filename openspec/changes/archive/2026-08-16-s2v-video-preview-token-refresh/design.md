# Design

## 背景与根因

结果页主视频 `<video :src="videoSrc">`（`apps/desktop/src/views/ResultView.vue`）使用本地媒体服务 URL（`http://127.0.0.1:<port>/media/<token>`）。令牌特性（`apps/desktop/electron/services/story2video-media-server.js`）：

- TTL 默认 15 分钟（`DEFAULT_TOKEN_TTL_MS`）；
- 注册表上限 128 条，满则 FIFO 逐出最旧（`_enforceCapacity`）；
- 生产代码无任何 `revoke()` 调用，旧令牌只靠过期/逐出释放。

历史「编辑并重新合成」会话中每次 `resolveLocalUrl()`（主视频、旁白、每场景 image1/image2/备用图/视频）都新建令牌；编辑动作（重试、重新生成、换素材、重新合成）持续推高注册表，主视频令牌（最早创建、最旧）最容易被逐出，或会话超过 15 分钟直接过期 → `<video>` 拉流 404 → `error` → `handleError()` 弹「视频预览加载失败，成片文件仍已保存」。

## 修改方案

### 1. 渲染端自愈状态机（ResultView.vue）

- 新增 data `videoReloadAttempted = false`。
- `handleError()`：
  - 无 `videoPath` 或 `videoReloadAttempted === true` → 展示 `VIDEO_PREVIEW_FAILED` 弹窗；
  - 否则：`videoSrc = await resolveLocalUrl(videoPath, videoSrc)` → `$refs.videoPlayer?.load()` → `videoReloadAttempted = true`；`resolveLocalUrl` 抛错同样直接弹窗（不吞错误）。
- 成功加载新成片路径（`loadVideoPath` / `loadProject` / 重合成成功路径）时重置 `videoReloadAttempted = false`。
- 错误处理纪律：自愈分支的异常走既有 `showStory2VideoNotification` 路径，不静默吞错。

### 2. previousUrl 回收（IPC + 渲染端透传）

- `resolveLocalUrl(filePath, previousUrl)`：透传第二参数到 `story2videoCreateShareUrl(filePath, previousUrl)`。
- 替换点传旧值：`loadVideoPath`（旧 `videoSrc`）、`loadProject`（主视频旧 `videoSrc`、旁白旧 `audioSrc`）、`refreshSegmentImageUrls`（旧 `segment.imageUrl` / `alternateImageUrls[0]` / `segment.videoUrl`）、`trimVideo` 裁剪预览（旧 `trimmedSrc`）。
- IPC handler `story2video:create-share-url`：签名改为 `(_event, filePath, previousUrl)`；签发成功后 `typeof previousUrl === 'string' && previousUrl && typeof mediaServer.revoke === 'function'` 时调用 `mediaServer.revoke(previousUrl)`。`revoke` 内部经 `tokenFromPath` 校验，非 `/media/<token>` 格式返回 false，不影响签发结果。
- preload `story2videoCreateShareUrl: (filePath, previousUrl) => ipcRenderer.invoke('story2video:create-share-url', filePath, previousUrl)`；`pnpm run build:preload` 重建 `index.bundle.js`。

### 3. 明确不做

- 不修改 `DEFAULT_TOKEN_TTL_MS`、`MAX_REGISTRY_ENTRIES`（安全/容量语义保持不变）；
- 不新增 locale 文案（复用 `story2video.videoPreviewFailed`）；
- 不改写 run 终态 / 项目状态（沿既有「预览失败不污染完成记录」契约）。

## 测试映射

- 渲染端：`ResultView.test.js` 自愈状态机（一次成功不弹窗、二次失败弹窗、无路径直接弹、成功加载后重置标记、resolveLocalUrl 传旧视频 URL）。
- 主进程：`story2video.test.js` create-share-url 传/不传 previousUrl；`preload.test.js`/`build-preload.test.js` bundle 同步。
- 门禁：`pnpm run build:preload` + `test:preload:sandbox`；QM-1 打包；CJK 基线扫描（无新增硬编码文案）。
