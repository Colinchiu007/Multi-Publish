## Why

结果页 / 历史记录「编辑并重新合成」场景中，主视频预览 URL 是本地媒体服务签发的短生命令牌（默认 TTL 15 分钟、注册表上限 128 条、满则逐出最旧），且分段/素材/主视频在编辑过程中反复签发新 URL 时从不回收旧令牌。用户编辑会话超过令牌寿命或令牌被容量逐出后，`<video>` 拉流 404 触发 `error`，页面直接弹出「视频预览加载失败，成片文件仍已保存」——此时成片与项目实际完好，属可自愈的令牌失效误报，误导用户认为成片损坏。

## What Changes

- 结果页主视频 `error` 自愈：首次失败时用同一成片路径重新签发本地预览 URL 并重载播放器一次；重载成功后不弹任何提示，仅二次失败才展示既有「视频预览加载失败，成片文件仍已保存」隔离文案（文案与 run 终态语义均不变）。
- 旧令牌回收：`story2video:create-share-url` 增加可选 `previousUrl` 参数，主进程签发新 URL 成功后回收匹配本地媒体令牌的旧 URL；渲染端在替换主视频、旁白、分段素材、裁剪预览 URL 时传入旧值，防止注册表膨胀逐出。
- preload 源码与 `index.bundle.js` 同步更新；IPC 参数向后兼容（不传 `previousUrl` 行为与现状完全一致）。
- 补齐回归测试：渲染端自愈状态机、IPC revoke、preload/bundle 同步、打包后 sandbox 可用性。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `story2video-result-success-error-boundary`: 结果页主视频播放错误从「直接提示」升级为「先自愈重载，仍失败才提示」；新增本地媒体预览 URL 替换时回收旧令牌的契约。

## Impact

- `apps/desktop/src/views/ResultView.vue` + `ResultView.test.js`（渲染端自愈状态机与 previousUrl 透传）
- `apps/desktop/electron/ipc-handlers/story2video.js` + `story2video.test.js`（IPC 可选参数与 revoke）
- `apps/desktop/electron/preload/publish.js` + `preload/index.bundle.js`（`pnpm run build:preload` 同步）+ `preload.test.js`
- 不新增用户可见文案（复用 `story2video.videoPreviewFailed`）；不修改媒体服务 TTL / 容量默认值；不改写 run 终态或项目状态。
