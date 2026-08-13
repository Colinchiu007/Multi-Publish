## 1. 主进程背景服务（TDD：先测试后实现）

- [ ] 1.1 编写 `apps/desktop/electron/services/pipeline-card-backgrounds.test.js`：缓存命中复用、无 provider fallback、生成成功（mock callAdapter）、下载 SSRF 拒绝（非 HTTPS/私有地址）、content-type/大小校验、force 刷新、非法 name、并发上限、批量上限、manifest 读写、本地服务 token/越界/404
- [ ] 1.2 实现 `apps/desktop/electron/services/pipeline-card-backgrounds.js`（provider 解析 / 提示词表 / 生成 / 安全下载 / 磁盘缓存 / loopback 静态服务 / 并发与超时）
- [ ] 1.3 运行服务单测通过

## 2. IPC 层

- [ ] 2.1 编写 `apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.test.js`：注册通道、入参校验（非法 name/批量上限）、无 provider 返回、部分成功返回、withSenderCheck
- [ ] 2.2 实现 `apps/desktop/electron/ipc-handlers/pipeline-card-backgrounds.js` 并在 `ipc-handlers/index.js` 注册
- [ ] 2.3 preload `publish.js` 增加 `pipelineCardBackgrounds`；`access-control.js` PUBLIC_METHODS 增加；`src/api/publisher.js` 增加封装（含 access-control.test.js 更新）
- [ ] 2.4 运行 ipc/preload 相关测试通过

## 3. 前端组件与样式（TDD）

- [ ] 3.1 编写 `apps/desktop/src/views/video-creation/PipelineSelector.test.js`：渲染背景层、加载态、无 provider fallback 渐变、aria/键盘保留、失败单卡降级
- [ ] 3.2 实现 `PipelineSelector.vue` 背景获取/渲染/降级/提示逻辑
- [ ] 3.3 `pipeline-selector.css`：显式断点 1-5 列、背景层/遮罩/shimmer/入场与悬停动效、reduced-motion
- [ ] 3.4 `CreateView.vue` 加 `create-page--pipeline-list` modifier；`create-view.css` 容器放宽
- [ ] 3.5 locales zh/en 新增 `pipelines.selector.*`（成对）；渲染端无新硬编码中文
- [ ] 3.6 运行 CreateView/PipelineSelector/既有 Story2Video 前端套件回归通过

## 4. 质量与文档

- [ ] 4.1 本地全量门禁：lint/类型/前端单测 + 主进程服务测试 + CI 相关脚本（locale-sync 检查）
- [ ] 4.2 更新 `01-docs/PRD.md`（视频创作首页卡片 UI 规格：数据校验/流程/功能逻辑/交互逻辑/显示项/提示文字）、`CHANGELOG.md`、`01-docs/learnings.md`、`01-docs/i18n-glossary.md`、`.quality-gates.md`
- [ ] 4.3 双模型审查（antigravity+claude）或降级记录；修复 Critical/Warning
- [ ] 4.4 桌面可见 UI 验证（dev 启动 + 主窗口 handle/标题）与 MiniMax 生成 smoke（有 Key 时）
- [ ] 4.5 提交分支、推送、创建 PR、核对 CI、合并回 main；三同步归档（openspec archive + CCG task 归档 + learnings）
