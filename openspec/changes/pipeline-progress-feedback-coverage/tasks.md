## 1. P0: Story2Video 核心阶段

- [x] 1.1 扩展 `normalizeStageProgress`：校验并透传 `messageKey`/`messageParams`/`summaryKey`/`summaryParams`，非法结构 fail-closed；补 `stage-executor.test.js`。
- [x] 1.2 `story2video-stages.js` 的 optimize 逐场景调用统一 `onProgress`，补 100% summary，保留 `context.optimize_progress`；补 `story2video-stages.test.js`。
- [x] 1.3 `story2video-stages.js` 的 generate_assets 接入统一 `onProgress`，按图片/视频/TTS 合计计数上报，补完成 summary，保留 `context.assets_progress`；补测试。
- [x] 1.4 finalize_assets 补 TTS 完成后的 100% + summary；补手动素材模式测试。

## 2. P1: 渲染与本地化契约

- [x] 2.1 `StageProgress.vue` 按 messageKey/summaryKey 优先本地化，key 缺失降级 raw message/summary；补 en 渲染测试。
- [x] 2.2 `zh.js`/`en.js` 成对新增 Story2Video 与通用阶段进度模板，运行 locale sync/CJK 门禁。
- [x] 2.3 统一 `detail.kind` 为 scene/resource/image/video/tts/platform/segment，补契约断言。

## 3. P2: 其余流水线反馈基线

- [x] 3.1 explainer 各阶段 messageKey 化并补完成 summary。
- [x] 3.2 talking-head 的 upload/transcribe/captions/render 接入开始、子步骤（可计数时）和完成摘要。
- [x] 3.3 cinematic、clip-factory、documentary、localization-dub 接入开始与完成反馈，循环阶段按项计数。
- [x] 3.4 podcast-repurpose、videogen、smoketest 接入开始与完成反馈，循环阶段按项计数。
- [x] 3.5 为每个改造执行器补至少一条运行中与一条完成态回归测试，确保失败/重试/检查点语义不变；cinematic、clip-factory、documentary、localization-dub、podcast-repurpose、smoketest 已补独立生命周期或逐项明细断言。

## 4. 质量门禁与交付

- [x] 4.1 运行受影响 Vitest：12 个文件、317 项通过（含 stage-executor、Story2Video、各流水线和 StageProgress）。
- [x] 4.2 运行 locale pair/CJK 扫描、Vite build、`node scripts/verify-worktree-deps.js`：全部通过；Vite 仅有既有 chunk/comment warnings。
- [x] 4.3 运行 QM-1 Electron 打包与 ASAR 清单检查：`electron-builder --win --x64 --publish never` 通过，ASAR/EXE 均生成；Playwright 资源目录缺失为既有环境 warning，未阻断打包。
- [x] 4.4 完成独立审查并更新 review.md；内部双探针完成交叉核验。antigravity wrapper 因地区资格不可用，Claude wrapper 在本机无输出后终止，均记录为降级证据。
- [ ] 4.5 `openspec validate` 已通过；PR/CI/远程合并状态待提交分支推送并建立 PR 后核对，再归档 OpenSpec change 与 CCG task。
