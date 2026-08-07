# 图片轮播自动流水线、TTS 音色与多语言实施计划

> 状态：实施前计划。稳定机器 ID 始终为 `story2video-compose`，产品显示名以 i18n 决定。

## 交付边界

1. 将创作页中的所有已注册流水线名称、类别、阶段与关键操作改为 locale key；默认语言保持中文。
2. 将 `story2video-compose` 外显名称改为中文“图片轮播”、英文“Image Carousel”，但不修改内部 ID、历史记录或 IPC 合同。
3. Story2Video 启动固定使用 `autoAdvance: true` 与 `checkpointPolicy: 'none'`；运行中显示阶段清单，保留取消和真实失败/人工处理状态。
4. 隐藏音调、并发数和创意强度，按受控默认值执行；分句语言默认 `auto`。运营值只从受控持久化设置读取，暂不声称已接入独立 OpsCenter。
5. 增加 TTS 音色目录服务：按 provider/model 缓存到 SQLite `settings` 表、保存用户选择、只在缓存失效或显式刷新时调用已注册 adapter 的 `listVoices`；不存 API Key。
6. 对各供应商声明能力：内置列表、平台个人槽位、调用时克隆、无克隆。只有实现了官方 API 合同的 provider 才显示“添加克隆音色”；未实现的能力必须明确提示而非假成功。
7. 只对可识别的图片内容拒绝执行安全重写重试。每场景最多 5 次总生成尝试；耗尽后进入 `needs_user_input`，不使用占位图掩盖失败。
8. 更新 PRD、架构、测试矩阵与 CCG 审查记录；用户清单第 11 项保留待澄清。

## 分层实现顺序

### A. 文案、自动策略与进度 UI

- `apps/desktop/src/main.js`：挂载既有 i18n 实例。
- `apps/desktop/src/i18n/pipeline-labels.js`：集中注册流水线、类别、阶段与状态 label key，禁止依赖 slug 标题化。
- `apps/desktop/src/locales/{zh,en}.js`：补齐默认中文、英文回退资源。
- `apps/desktop/src/views/CreateView.vue`：使用 locale label；对 Story2Video 强制全自动、隐藏检查点/高级调试入口、把进度展示为阶段清单并正确合并 snapshot 的 `stages`。
- `apps/desktop/electron/services/pipeline-engine.js` 与 `story2video-text-config.js`：默认 `language=auto`，保留历史运行快照语义。

### B. TTS 音色目录与用户偏好

- 新增 `apps/desktop/electron/services/tts-voice-catalog.js`：定义白名单 provider/model 能力、缓存规范化、默认音色和克隆入口类型。
- 新增 `apps/desktop/electron/services/tts-voice-service.js`：通过 `ModelProviderManager.callAdapter(providerId, 'listVoices')` 同步音色；缓存和偏好写入当前用户的 SQLite `settings` 记录；provider 不支持/未配置时 fail closed。
- 仅允许非敏感元数据（provider、model、voice ID、显示名、来源、刷新时间、clone 文件受控相对路径）；任何 API Key、Bearer token、原始文件字节和远程错误体不得进入 settings、run 或项目 manifest。
- 新增受控音色库 IPC/preload/renderer API；创作页的语音区域先选择模型，再呈现匹配音色下拉框并恢复上次合法选择。
- “个人槽位”仅向 Doubao 等平台管理型能力显示官方控制台提示；“调用时文件克隆”只有在 adapter 已实现的 API 合同、文件校验和用户同意都具备时启用。未实现的 provider 按能力说明显示禁用/待接入状态。

### C. 图片内容拒绝处理

- `provider-error.js` 增加明确的 `CONTENT_POLICY` 分类；不把所有 400/403 误判为内容拒绝。
- 新增 `story2video-image-retry.js`：仅接受结构化拒绝或严格允许的 provider 安全信号；生成可审计但不泄露敏感原文的安全化重写 prompt；最多 5 次总尝试。
- `asset-generator.js` 保留每次尝试的非敏感元数据并拒绝把内容拒绝降级成 ffmpeg 占位图。
- `story2video-stages.js` 将耗尽结果转为 `needs_user_input` checkpoint，提供场景序号、尝试次数和用户可操作建议。

## 测试矩阵

| 范围 | 正常路径 | 异常/边界 |
|---|---|---|
| i18n | 默认中文、英文切换、所有 registry 名称 | 未知 ID 的安全回退 |
| 自动编排 | `none + autoAdvance` 连续完成 | 手工 checkpoint 仅适用于非 Story2Video；取消仍可用 |
| UI 清单 | completed/running/pending/failed 状态 | snapshot 顶层 `stages`、无列表、错误提示 |
| TTS 目录 | cached catalog、refresh、合法默认偏好 | 未配置 provider、失效 voice、非法 cache、跨模型不匹配 |
| 个人槽位 | 平台提示和已缓存槽位可选择 | 不支持 upload 的 provider 不出现错误入口 |
| 图片拒绝 | 首次拒绝后安全重写成功 | 5 次耗尽、429/auth/network 不重试、并发场景隔离、无占位图 |
| 打包/视觉 | Vue build、目标前端视觉用例 | Electron IPC、QM-1 打包和真实窗口证据 |

## 外部依赖与未完成边界

- 独立运营后台仓库是 `D:\Data\projects\ops-center`，当前 Multi-Publish 未发现运行时配置分发 API。此 PR 只消费本地受控运营设置契约；OpsCenter 写入/分发必须在其仓库另立任务、确定鉴权和版本回滚后接入。
- ElevenLabs、MiniMax、MiMo、Doubao 的创建/克隆 API 以及配额/文件限制必须在每个 adapter 实现前按对应官方文档和真实凭据验收；没有完整 adapter 与文件安全测试时不可在 UI 宣称“可克隆”。
- 用户清单第 11 项没有内容，保持 TBD/审计限制；最近 20 轮记录不可重建，不得补造历史需求。
- UE item 15 仅为 `UX-IMAGE-CAROUSEL-CONFIGURATION-PROPOSAL-2026-08.md` 中的待确认建议，用户确认前不得声称实施。
- OpsCenter 当前无已确认租户/音色同步 API，且受保护仓库禁止本任务写入；未来跨仓库接入必须另立租户边界、版本、鉴权、失效、回滚与审计合同，不臆造 endpoint 或字段。
- Doubao 仅保留官方控制台提示；无后端 connector 时桌面不持有高权限 secret，也不展示伪造个人音色列表。


- 音色克隆样本的上传、保存、删除、设默认全部在桌面端前台及 owner-scoped userData/SQLite 完成；OpsCenter 不接收或管理用户音频样本，仅用于运营默认值与未来后台高权限凭据/目录同步。
