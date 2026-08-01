# Review: 修复 Electron 开发窗口空白

## 根因

- Electron 内部 DOM 与 `capturePage` 均正常（根节点可见、HTML 完整）。
- `PrintWindow` 实际窗口合成输出只有 body 背景渐变，没有 UI 层。
- 开发启动参数 `--in-process-gpu` 配合 ANGLE SwiftShader 时，Windows 窗口合成表面不提交 UI。
- 显式 `--disable-gpu --disable-gpu-compositing` 走软件合成后，窗口输出包含完整 UI（品牌色 #5048E5 等可见）。

## 修复

- 新增 `scripts/dev-launcher.js`，集中构造开发 Electron 参数。
- `scripts/dev.js` 使用软件合成参数，移除 `--in-process-gpu`。
- 新增 `electron/tests/dev-launcher.test.js` 回归测试。

## 验证

- `node --check` 全部通过。
- 48 个相关测试通过（window 46 + dev-launcher 2）。
- 真实 `npm run dev` 启动后，`PrintWindow` 捕获窗口含完整 UI。
- 未跟踪/既有生成产物（preload bundle、dist-electron-dir-verify）未纳入提交。

## 遗留

- resize 事件触发 `authViewManager._onWindowResize is not a function` 未捕获异常，与空白窗口无关，待后续单独处理。
