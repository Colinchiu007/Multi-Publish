## Why

最新的 27 场景 Story2Video 任务在 compose/publish/finalize 全部成功后，结果页仍弹出“当前操作未能完成，请稍后再试”。实机复现确认成片、旁白和全部场景素材均可解码，说明这是完成通知/结果页加载的误报，而不是任务失败。用户会因此误以为白等了 21 分钟并可能重复创作。

## What Changes

- 调整编排完成顺序：完成事件与结果页可进入状态在项目持久化完成之后发出，消除“项目清单尚未写入/媒体尚未复制完”的窗口。
- 隔离结果页加载错误边界：项目读取、成片 URL、旁白 URL、每个场景素材 URL 分别容错；任一附加预览失败不再把整个项目判为失败。
- 主视频播放失败只提示“视频预览加载失败”，不再显示任务级“当前操作未能完成”文案。
- 补齐回归测试：完成事件时序、项目持久化失败降级、附加资源失败隔离、视频 error 文案。

## Capabilities

### New Capabilities

- `story2video-result-success-error-boundary`: 定义 Story2Video 完成后结果页的可用性契约、完成事件时序与预览错误隔离规则。

### Modified Capabilities

- `video-creation-failure-diagnostics`: 新增“预览/结果页失败不得改写 run 终态”约束。

## Impact

- `apps/desktop/electron/services/pipeline-engine.js`：完成事件与 `_finalizeRun` 持久化顺序。
- `apps/desktop/electron/tests/pipeline-engine.test.js`：新增完成时序与持久化失败回归。
- `apps/desktop/src/views/ResultView.vue`：结果页加载/视频播放错误隔离。
- `apps/desktop/src/views/ResultView.test.js`：新增附加资源失败与视频 error 回归。
- `apps/desktop/src/locales/zh.js` / `en.js`：新增预览失败提示（成对）。
