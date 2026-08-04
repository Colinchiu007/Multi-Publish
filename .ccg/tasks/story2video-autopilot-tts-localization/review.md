# Review: Story2Video 图片轮播自动化与 TTS 音色

日期：2026-08-03
分支：`codex/story2video-autopilot-tts-localization`

## 审查范围

- 图片轮播流水线自动执行、中文/英文名称和阶段清单。
- TTS provider/model 音色目录、用户默认音色、ElevenLabs 前台用户音色克隆。
- owner 隔离、SQLite 最小元数据、主进程文件选择与 IPC/preload 边界。
- 图片生成敏感内容失败后的安全化重试与 `needs_user_input` 终态。
- Vue UI、视觉回归、Electron 打包和 ASAR/资源闭包。
- PRD、架构文档、质量门禁记录与 CCG 任务材料。

## 外部双模型审查

按 CCG 要求并行尝试了两个 wrapper，但当前环境不提供可用后端：

- antigravity：`agy command not found in PATH`，wrapper 退出状态 1。
- Claude：wrapper 启动后以状态 1 退出，未产生审查报告。

因此不把外部审查标记为通过，也不伪造模型结论。原始错误曾短暂写入任务目录的 `.out` 文件，确认后已删除。

## 本地 Luna 审查

### Critical

- 之前发现的 TTS clone catalog wiring 问题已解决：`apps/desktop/electron/ipc-handlers/tts-voice-catalog.js` 将 owner-scoped `TtsVoiceCloneService` 注入 `TtsVoiceService`；组合回归覆盖 create → catalog → select → preference。

### Warning

- Doubao 个人音色严格保持官方控制台边界；未伪造未验收的 provider connector 或个人音色列表。
- 用户音色文件完全属于桌面端前台用户功能；不写入 OpsCenter，不暴露音频字节、base64、绝对路径或跨 owner 数据。
- 全量 TypeScript 与 desktop lint 仍有既有基线失败；本次新增文件无诊断，不将基线失败归因于本次变更。

### Info

- 后续新增 provider 时应先补官方文档合同、模型能力矩阵和持久化目录种子，再接入 clone adapter。
- 用户确认后再执行 `01-docs/UX-IMAGE-CAROUSEL-CONFIGURATION-PROPOSAL-2026-08.md` 的 UE 简化方案；本次不提前扩大范围。

## 验证结论

- 受影响测试集：22 个文件、367 个用例通过；桌面完整 workspace：354 个测试文件、6065 个用例通过。
- 复现命令均从 `apps/desktop` 执行并以退出码 0 结束：`npx vitest run --config vitest.config.js src/views/ProjectLibrary.test.js electron/services/asset-generator.test.js electron/services/tts-voice-clone-service.test.js`；`npm test`。
- 根目录 CI 等价命令 `npm run test --workspaces --if-present` 以退出码 0 结束；包含桌面、AI tester、API、Remotion、RPA、shared-utils 和 Story2Video workspace。
- preload sandbox true/false、Vue build、像素视觉 17/17、目标文件 ESLint、Windows QM-1 均通过。
- 最终打包窗口可见，`window.electronAPI` 存在，TTS capability 在 public license 下正确拒绝且不崩溃。
- ASAR 解包后真实 require `@multi-publish/rpa-engine` 成功；媒体资源和 `resources/playwright-browsers/chromium-1228` 均存在。

## 结论

本地审查无未关闭 Critical；外部双模型审查因环境不可用而保持 `UNAVAILABLE`，交付时必须如实披露。变更可进入提交/PR 阶段，但 CI 仍是最终合并门禁。

## Quality Gate 失败的 QM-5 反思（2026-08-03）

### 第一性原因

远端 Gate 4 暴露了三类测试合同问题：

1. `ProjectCard.vue` 已依赖 `useI18n()`，但 `ProjectLibrary.test.js` 的挂载 helper 没有安装 i18n 插件。
2. `asset-generator.test.js` 把 Edge TTS 参数数组的最后一项误当成输出路径；当前实现按 `script、文本、音色、输出路径、rate、pitch` 顺序传参。
3. TTS 克隆两项失败只在 workspace 全量 runner 中出现，单文件串行和三次重复均通过；业务实现的补偿删除、`remote_deleted` 重试状态和 owner 隔离未复现回归。

### 测试逃逸链

1. 旧的 ProjectLibrary 测试未随组件新增依赖更新，单组件测试因自身安装了 i18n 而未暴露问题。
2. AssetGenerator 安全测试只验证了输出路径语义，却使用了脆弱的“最后一个参数”索引；新增速率/音调参数后没有同步更新断言。
3. PR 前只运行了受影响的新测试，没有用与 CI 相同的 workspace runner 复跑完整桌面测试；因此全量 runner 的 TTS 时序/模块状态敏感性未提前暴露。

### 系统性漏洞

- Vue 测试缺少统一的 `mount` 插件合同，导致组件依赖变更需要逐文件人工同步。
- CLI/子进程安全测试按参数位置断言，未按稳定业务语义断言。
- 全量 workspace 测试与单文件测试的证据没有在发布前形成双层矩阵。

### 修复与回归保护

- `ProjectLibrary.test.js` 使用统一 `mountProjectLibrary()` 安装真实 `@/i18n` 实例，10/10 通过且无 unhandled error。
- `asset-generator.test.js` 按 `tts_0000.mp3` 输出路径模式查找参数，再验证安全 run id、无路径穿越和文件名合同。
- TTS clone test 在桌面配置下串行重复三次，22/22 用例每次通过；业务补偿逻辑保持 fail-closed，不用放宽断言掩盖失败。
- 三个受影响测试文件合计 40/40 通过；随后仍需完成完整 desktop workspace 和远端 Quality Gate 复跑。

### 预防措施

1. 新增 Vue composable/plugin 依赖时，测试 helper 必须集中提供真实插件并补导出完整性断言。
2. 子进程/IPC 测试按命名参数或业务路径匹配，禁止依赖“最后一项参数”等位置性假设。
3. PR 合入前同时运行受影响测试、完整 `apps/desktop` workspace 测试和远端必需门禁；任一 Quality Gate 失败都必须记录根因、逃逸链和回归保护。
## GUI CI 失败的 QM-5 反思（2026-08-03）

### 第一性原因

PR #352 的 `gui-test` 仍把旧产品合同写死在 `route-functional-suite.js`：用内部英文名 `Story2Video` 识别流水线，并点击已删除的“启动编排”按钮；当前产品合同已改为稳定流水线 ID `story2video-compose`、中文“图片轮播”/英文“Image Carousel”和“启动流水线”。

### 测试逃逸链

1. 组件测试覆盖了本地化标题和启动逻辑，但没有执行真实 Browser GUI runner。
2. Vue 构建与像素视觉回归只验证渲染/布局，不验证 E2E helper 的用户可见文案合同。
3. 推送前只跑了受影响 Vitest，未把 `route-functional-suite.js` 的浏览器路径作为发布前聚焦门禁。
4. 代码审查关注自动化流程和 IPC 行为，没有逐项反查旧选择器、旧按钮文案和排序断言。
5. 因此错误直到远端 `gui-test` 才暴露，CI 269/270 检查未能完成。

### 系统性漏洞

GUI helper 缺少“稳定 ID + 用户可见文案 + 首卡排序”三件套合同测试；本地化改名时没有静态扫描旧文案，也没有在推送前运行 route functional suite。

### 修复与回归保护

- `PipelineBrowser.vue` 与实际 `/create` 卡片都暴露 `data-pipeline-id`，组件测试锁定该稳定选择器。
- E2E 改为按 `data-pipeline-id="story2video-compose"` 定位，按中英文用户可见名称断言，并点击“启动流水线”；同时锁定图片轮播必须为首张卡片。
- `PipelineBrowser.test.js`、`CreateView.test.js` 增加稳定选择器回归；单独 create 路由和受影响 Vitest 均通过。

### 预防措施

1. 本地化 UI 的 E2E 只能依赖稳定 `data-*`/状态 class，并同时断言用户可见文案；禁止用内部枚举文本冒充 UI 合同。
2. 流水线排序有产品语义时，helper 必须同时断言首项 ID，不能只断言目标卡片存在。
3. 任何修改 Vue 文案、按钮或流水线展示时，合并前必须运行受影响 Vitest、`npm run build:vue` 和 route functional GUI 合同；远端 `gui-test` 未通过不得合并。
