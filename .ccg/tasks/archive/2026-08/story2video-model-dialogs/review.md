# Story2Video 模型提示弹窗 — 审查记录

日期：2026-08-02
范围：当前工作树中 Story2Video 模型配置提示、Node 22 HTTPS DNS 固定下载兼容，以及运行期错误弹窗覆盖。

## 本地审查结论

- **Critical：0**
- **Warning：0（本次变更）**
- **Info：2**
  1. 按 CCG 要求尝试并行启动 antigravity/Claude 只读审查，但运行环境在进程创建前以“可能向未验证第三方传输私有仓库代码”为由阻止；未绕过该策略，也没有导出代码或 diff。此项未计为外部审查通过。
  2. `npm run check:ts` 与 `npm run lint` 均有与本次改动无关的既有基线问题：前者跨项目存在大量 JSDoc/类型声明错误，后者为 15 errors / 84 warnings；本次改动文件中只命中 `asset-generator.js:131` 的既有 `no-empty`，本次实际差异位于 303-312 行，未混入修复。

## 发现并关闭的遗漏

本地调用链审查发现：`applyOrchestrationOutcome()` 在“编排成功但没有可预览视频路径”时直接写入 `orchestrationError`，没有走应用内弹窗。先新增测试复现（CreateView 57 项中 1 项失败），再改为复用 `setOrchestrationError()`；最终聚焦回归为 95/95。

## 质量证据

- TDD RED：`npm.cmd run test -- src/views/CreateView.test.js`，新增“完成但缺少可预览视频时使用应用内弹窗”稳定失败，原因是弹窗状态保持 `{ visible: false }`。
- 聚焦 GREEN：`npm.cmd run test -- electron/services/asset-generator-provider.test.js electron/services/model-provider-minimax-fixed-model.test.js electron/services/story2video-stages.test.js src/views/CreateView.test.js`，4 files / 95 tests 通过。
- Vue 构建：`npm.cmd run build:vue` 通过，1830 modules transformed；仅有既有动态导入和包体积 warning。
- 静态语法：`node --check apps/desktop/electron/services/asset-generator.js` 与 `node --check apps/desktop/electron/services/story2video-stages.js` 通过。
- 差异完整性：`git diff --check` 通过；`01-docs/learnings.md` 仅追加 R90 的 6 行，无历史尾随空白格式噪声。
- 真实桌面验收（本轮先前已完成）：打包 Windows 应用中实际调用 SenseNova LLM、MiniMax Image 和 MiniMax TTS，得到项目 `run_1785675469178_5zv8`；最终 MP4 为 720x1280、9.764 秒，随包 ffprobe 验证含 H.264 视频流和 AAC 音频流，完整解码通过。发布阶段因未选择平台而明确 skipped。

## 变更范围复核

- 缺模型、输入模式、启动/状态轮询/推进/失败且无预览视频的 Story2Video 错误均经 `setOrchestrationError()` 显示 `UiModal`；非 Story2Video 的既有原生 `alert()` 未改动。
- Node 22 的 `lookup(..., { all: true })` 仅返回此前已验证的单个公网地址数组，默认模式继续返回 address/family；未放宽 HTTPS、地址分类、DNS 重绑定、重定向或响应体大小限制。
- 唯一已启用且保存 API Key 的 MiniMax 图片模型未显式设为默认时仍可作为默认回退，固定模型 `image-01` 的既有实现和测试保持不变。