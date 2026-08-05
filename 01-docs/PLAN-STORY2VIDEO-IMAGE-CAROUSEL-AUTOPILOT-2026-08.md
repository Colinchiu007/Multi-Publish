# 图片轮播全自动、音色目录与图片拒绝恢复计划（2026-08-03）

> **状态：实施计划与验收基线，不是交付成功报告。** 稳定机器 ID 始终为 `story2video-compose`；产品外显名称由 i18n 决定，默认中文“图片轮播”，英文“Image Carousel”。

## 需求来源与未决项审计

- 本任务可核验的上下文只有当前会话可见内容：现有记录为 **1 条**包含实质要求的用户消息及 **2 条**图像附件标记。系统不提供可核验的最近 20 轮完整对话，因此不得声称已读取、总结或归档 20 轮需求，也不得补造会话历史。
- 用户清单第 11 项为空，保持 `TBD`，不据此新增功能、数据收集或外部调用。
- 下列计划描述目标合同和验证项；provider 能力、PR、打包、真实凭据和发布状态必须以实时证据确认，不能由本文推断为已完成。

## 交付边界

1. `story2video-compose` 保持历史、IPC、项目清单和执行器的稳定机器 ID；i18n 只改变显示名称、类别、六阶段和状态，默认语言为 `zh`。
2. 图片轮播启动固定使用 `{ autoAdvance: true, checkpointPolicy: 'none' }`，连续执行 `split → domain_enrich → optimize → generate_assets → compose → publish`；未启用发布时第六阶段显示 `skipped`，不提供人工 checkpoint、继续或推进。
3. 运行态仅显示条目式阶段清单及可读摘要，**不显示 S2V 百分比进度**；保留取消、真实失败和 `needs_user_input` 状态。
4. 分句语言默认 `auto`；音调、并发数和创意强度从图片轮播表单隐藏，使用版本化、可审计、可回滚的受控默认值。
5. 图片风格保留为最终视觉输出控制；提示词风格保留为提示词的写法/组织控制。两项不得合并或互相回退。
6. 运营后台根目录为 `D:\Data\projects\ops-center`；本任务不接入其运行时配置分发，不能将本地默认值写成 OpsCenter 已交付能力。

## 分层实施顺序

### A. 自动编排、阶段清单与 i18n（P1）

- `apps/desktop/src/main.js`：挂载既有 i18n 实例；默认中文、英文回退。
- `apps/desktop/src/i18n/pipeline-labels.js` 与 locale 资源：集中定义所有 registry 名称、类别、阶段、状态和操作 label key，禁止 slug 标题化。
- `apps/desktop/src/views/CreateView.vue`：图片轮播强制传递 `autoAdvance=true`、`checkpointPolicy='none'`；隐藏 checkpoint、音调、并发数和创意强度；默认分句语言 `auto`；从 snapshot 顶层合并 `stages` 渲染六项清单。
- `apps/desktop/electron/services/pipeline-engine.js` 与 `story2video-text-config.js`：保证图片轮播无人工暂停，同时保持非图片轮播的通用 checkpoint 合同不变。

### B. TTS 音色目录与 owner-scoped 偏好（P1）

- 新增/扩展可信音色目录服务：优先经 `ModelProviderManager.callAdapter(providerId, 'listVoices')` 读取具备能力且已认证的 provider/model；静态内置音色也规范化为 catalog。
- 缓存、capability 版本、刷新时间、状态与用户默认选择写入当前用户作用域的 SQLite `settings`。默认键为 `user + providerId + modelId + voiceId`；历史项目始终读取自己版本化运行快照。
- 目录状态统一为 `ready`、`cached`、`refreshing`、`stale`、`unavailable`、`unsupported`。仅在显式刷新或缓存失效时访问 provider；刷新失败只可回退到仍兼容的最后一次成功缓存或静态内置目录，并明确状态。没有合法回退时禁用选择，绝不伪造音色或接受任意 ID。
- settings、run 和项目 manifest 禁止保存 API Key、Bearer token、原始 provider 错误体、原始 prompt、音频字节或 renderer 文件路径。

### C. ElevenLabs 用户克隆与 Doubao 槽位边界（P2）

- ElevenLabs：仅当 provider/model capability 数据和专用 adapter 的上传、创建、轮询、删除合同均有官方证据和实现验证时，允许用户新增、删除和设为默认。
- 克隆源音频：用户授权后由可信主进程完成路径、格式、大小、时长和 `Buffer` 完整性校验；仅在远端 `cloneVoice` 成功后，才写入用户私有、owner-scoped 的 `userData/voice-clone-samples/<owner-hash>/<storage-id>` 受控目录。SQLite 只保存最小 clone 元数据、所有者、默认选择及受限相对目录/样本计数；不得保存源路径、源文件名、绝对路径、data URL 或音频字节。失败、取消或校验失败不得创建长期样本目录。
- 文件格式、大小、时长、模型与端点必须来自版本化 provider/model capability 数据，禁止创造跨供应商固定阈值。
- Doubao：当前已注册/已验证的配置与 TTS adapter 合同不等于个人槽位已同步到本地。UI 只提示用户先到供应商官方控制台创建/管理，再刷新目录；只有官方 API 证据和已验证 `listVoices` adapter 存在时才展示并允许选择返回项。否则显示 `unsupported`/`unavailable`，不创建、不复制、不伪造槽位。

### D. 图片内容政策拒绝恢复（P1）

- `provider-error.js` 仅增加可识别的 `CONTENT_POLICY` 分类；不得把任意 400/403、认证、限流、网络、超时、配置或未知错误误判成内容拒绝。
- 每场景最多 **5 次总图片尝试**（首次加最多 4 次安全化重写）；场景之间隔离计数与 prompt。重写只降低可疑内容风险，不扩大主题。
- 审计仅记录场景序号、尝试序号、结果类别、provider/model、提示词版本哈希和非敏感安全摘要，绝不持久化原始 prompt、密钥或完整 provider 错误体。
- 第 5 次明确拒绝后进入 `needs_user_input`，显示“可能存在内容风险，请修改文案后重新启动”。这不是可继续 checkpoint：用户必须取消旧 run，并以修改后的文案新建 run；禁止 `resume`/`advance` 原 run、占位图或 `allowPartialAssets` 静默成功。

### E. 文档与已确认 UE 实施（P1）

- 同步 PRD、视频 PRD、架构和本计划，区分目标合同、当前实现基线、外部能力和待验收项。
- 按已确认的 UE 方案把**既有**配置组织为“基础 / 外观 / 声音 / 高级 / 发布”五个可折叠区，初始只展开“基础”。本次只做渐进披露、阶段清单和错误可见性，不删除任何现有能力；前端用户音色文件管理仍属于用户作用域，OpsCenter 不接入。

## 验证矩阵

| 范围 | 正常路径 | 异常/隐私边界 |
|------|----------|---------------|
| i18n 与自动编排 | 默认中文、英文切换、稳定 ID、六阶段从启动连续到完成/跳过 | 未知 ID 原样回退；图片轮播无 manual/guided checkpoint；通用 pipeline 不回归 |
| 阶段清单 | `pending/running/completed/skipped/failed/needs_user_input` | snapshot 顶层 `stages` 缺失/错误摘要；不得渲染 S2V 百分比 |
| 音色目录 | `listVoices`、内置 catalog、缓存、刷新、用户/provider/model 默认恢复 | provider 未配置、刷新失败、缓存失效、跨模型不匹配、无合法回退 |
| ElevenLabs 克隆 | 授权后新增、删除、设默认、owner-scoped 元数据/偏好 | 源音频仅内存临时处理并释放；无原始字节/路径落盘；capability 限制驱动校验 |
| Doubao 槽位 | 有正式 API 和 adapter 时刷新/选择 | 无证据时控制台提示 + `unsupported`/`unavailable`；绝不声称已同步 |
| 内容政策 | 明确拒绝后安全重写成功 | 5 次耗尽、取消旧 run + 新建 run、429/auth/network 不重试、无原始 prompt 审计、无占位成功 |
| 打包与 UI | Vue build、目标视觉用例、Electron IPC | QM-1 打包、真实窗口与 provider 外部验收均以实际证据记录，未验证不标成功 |

## UE 实施状态

- UE item 15 已确认并进入当前实现任务；快速模式只影响 Story2Video 创作端首屏和折叠布局，不改变其他流水线。
- 路由动态 import 错误必须有可见占位、重试和刷新动作，避免 Electron renderer 因 chunk/import 失败呈现空白。
- 真实供应商目录、个人音色槽位、用户克隆上传、敏感词降级和运营后台运行时分发仍为外部/后续验收边界。

## 外部依赖与未完成边界

- `D:\Data\projects\ops-center` 的配置分发、鉴权、版本和回滚需要独立设计与端到端验收；本任务不实现连接。
- ElevenLabs、Doubao、MiniMax、MiMo 等 provider 的目录、克隆、文件限制和配额必须以当前官方文档、实际 adapter 与真实凭据验证；本地 mock 不能替代外部能力验收。
- 不扩大为云端历史、云分享、旧 orchestrator 会员配额或被排除的 `image/remix/gallery/audio/batch` 模式。