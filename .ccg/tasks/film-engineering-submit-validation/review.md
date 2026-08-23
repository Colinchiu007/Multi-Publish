# Review — 修复电影工程参数校验/详情抽屉/IPC 克隆

## 结论

双模型外部审查（opencode + Claude）均无 Critical；opencode 评分 93/100，推荐 PASS；Claude 的 1 个 Warning（OpenSpec 契约数字）已修复，其余为 Info/建议。本地真实打包 Electron E2E 24/24 通过，未出现“提交的数据不符合要求”或 “An object could not be cloned”。

## 根因与逃逸链

- 根因：`apps/desktop/electron/ipc-handlers/film-engineering.js` 的 `withKit` 原为 `fn(...args)`，而内部 handler 全部遵循 `(_e, ...params)` 签名，导致合法业务参数整体左移进 `_e`，实际参数为 undefined，触发 `VALIDATION_ERROR`。该行为由 commit `a3a93913e` 引入。
- 逃逸链：
  - 单元测试：旧 IPC 测试只覆盖无参数通道、非法入参/数量边界，没有合法参数正向转发断言。
  - 集成测试：composable 测试 mock 的 IPC 返回成功，未覆盖真实主进程 handler 的位置错位。
  - E2E：此前只有路由/组件级测试，没有真实打包 Electron 窗口进入电影工程，因此首屏错误未被发现。
  - 审查盲区：`withKit` 的无参数闭包与带参数 handler 混用，无契约测试锁定。

## 修复内容

- `withKit` 改为 `fn(event, ...args)`，一次修复 list-shots/get-shot/copy-text/copy-texts/export 五个同步参数化通道。
- `FilmEngineeringView.vue` 点击分镜时先打开详情抽屉，再加载 `getShot` 数据。
- `useFilmEngineering.js` 对导出/生成负载做 `JSON.parse(JSON.stringify(list))`，消除 Vue 响应式代理导致的 IPC 克隆失败。

## 回归保护

- IPC 合法参数转发：list-shots/get-shot/copy-text/copy-texts/export，红测确认旧实现失败。
- Renderer 纯 JSON：export/generate 负载 `structuredClone` 断言。
- 真实 E2E：`apps/desktop/tests/e2e/film-engineering-real.js` 覆盖入口、kit、场景、详情、复制、批量复制、JSON/Markdown 导出、剧本套用、方法论、生成入口。

## 外部审查

### opencode

- 结论：PASS，93/100。
- 无 Critical；建议清理 preload 行尾噪声、`onOpenShot` 可加 catch、`_e` 可改 `_event`。
- 已确认 IPC 回归测试在旧实现下必红，composable 的 structuredClone 测试直接覆盖 QM-2 契约。

### Claude

- 结论：无 Critical；W1 为 spec 数字 20000 与实现 50000 不一致，已修复为 50000。
- W2：电影工程 E2E 为 opt-in 脚本，未接入 `pnpm test:e2e`；当前按手动/发布前门禁保留。
- Info：JSON 深拷贝有 `undefined`/BigInt 语义损耗；快速连点详情可能显示旧内容；generate-selected 无 IPC 成功路径断言；id 未 trim；preload bundle 仅 stat-dirty。

## 验证结果

- `vitest run electron/ipc-handlers/film-engineering.test.js src/composables/useFilmEngineering.test.js`：2 files / 37 tests passed。
- 外部审查期间运行电影工程 service/E2E 套件：10 files / 136 tests passed（Claude 报告）。
- 真实打包 E2E：24/24 PASS，证据 `D:\Temp\multi-publish-film-engineering-e2e-1787460133425`，截图 2 张，生成产物 `D:\Temp\story2video\assets\default\img_0000.png`（ffmpeg 离线占位图）。
- ASAR：app.asar 含 `electron/ipc-handlers/film-engineering.js`、`electron/preload/index.bundle.js`、`FilmEngineeringView-*`；抽取后语法检查通过，`@multi-publish/rpa-engine` require 通过。
- 启动存活：打包 EXE 12 秒存活，stderr 为空。
- `openspec validate fix-film-engineering-ipc-event-forwarding --type change --strict --no-interactive`：valid。
- `node --check`、`git diff --check`、`node scripts/verify-worktree-deps.js`：通过。

## 剩余风险/未覆盖

- 临时 profile 未配置外部图片 Provider，生成入口走的是 `ffmpeg-placeholder` 真实 fallback，未验证第三方图片模型真实出图。
- 电影工程 E2E 是 opt-in 脚本，未纳入 CI 自动运行。
- 本机 Windows 计划任务 `Session Isolation Write Guard` 已注册但未运行；`pre-code-edit-guard.ps1` 与共享主目录 clean 检查通过，本任务未在共享根写运行时文件。
- 当前尚未创建/合并 PR，remoteStatus 待提交后记录。
