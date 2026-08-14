## Context

见 proposal.md（Why/What）。当前应用已有：PIPELINES 注册表（apps/desktop/electron/services/pipeline-engine.js:52，registerPipeline/registerStageExecutor 支持扩展）、StageExecutor 阶段执行器、story2video-stages.js 的注册模式（container.setup.js:150 调用）、IPC withSenderCheck 模式（ipc-handlers/pipeline.js）、前端 PipelineSelector + CreateView（路由 /create）、i18n pipeline-labels + locales zh/en 成对门禁（CI Gate 7）。上游语料：Higgsfield 公开 API（fnf-api-gw.higgsfield.ai，无需登录）可读全部素材元数据含完整真实提示词；OSideMedia/higgsfield-ai-prompt-skill（MIT）提供提示词架构方法论（HELL-GRIND.md 等）。

## Goals / Non-Goals

Goals：
- 数据层：film-kit 精选版入库（<=5MB，含 162 场景树/代表性分镜提示词/引用注册表/方法论），全量语料本地归档 + 仓库内可复现脚本。
- 引擎层：kit 加载 fail-closed、分镜查询、一键复制文本组装、剧本套用引擎（确定性模板 + 可选 LLM 润色）。
- 集成层：film-engineering 流水线（4 阶段）+ IPC（6 通道）+ 前端路由 /film-engineering 三栏视图。
- 质量：全部新逻辑有单测；不改动 story2video 既有行为；i18n 成对；OpenSpec 全流程。

Non-Goals：
- 不下载/不入库 115,451 个素材的媒体文件（数十 GB）；不做 95 分钟整片自动生成。
- 不新增第三方运行时依赖；不接入 AI 视频 provider 直连（V1 图片生成复用 assetGenerator，AI 视频留 V2）。
- 不修改既有流水线（story2video-compose 等）行为；不修改 prompt-engine 服务端。

## Decisions

D1. kit 数据放 `apps/desktop/electron/film-kit/`（随主进程打包）而非独立 package。
   - 理由：数据是 Electron 服务消费的静态资产，跟随 apps/desktop 打包（files glob 覆盖）；独立 package 需要 pnpm workspace + 发布链路，收益低。
   - 备选：packages/film-engineering —— 仅当未来 ops-center 也要消费才升级。

D2. 剧本套用引擎默认确定性模板（无 LLM 也能工作），LLM 增强可选。
   - 理由：提示词组装必须可离线测试（fail-closed 文化）；真实语料本身是模板库；LLM 润色只在 PromptBridge 就绪且用户开启时发生（fail-open 降级并标记 llmEnhanced:false）。
   - 备选：强制 LLM 生成 —— 离线不可测、依赖网络、违背项目网络边界铁律。

D3. 分镜代表性提示词选取：每文件夹取 created_at 最大的 completed 视频 job（无视频取图片 job）。
   - 理由：文件夹内最后生成 = 最终稿概率最高；视频优先符合"分镜生成"诉求。
   - 备选：随机/首个 —— 无收敛依据。

D4. generateSelectedShots 复用 assetGenerator（story2video 资产生成服务），不新建生成通道。
   - 理由：避免重复建设；provider 配置/限额/错误处理全部复用。
   - 备选：直接调 provider —— 重复轮子，风险高。

D5. IPC 全部走 withSenderCheck + 纯 JSON 参数 + {code, message} fail-closed 返回。
   - 理由：与既有 ipc-handlers 模式一致；防 renderer 越权与参数注入。

D6. 前端新增独立路由 /film-engineering（三栏视图），不塞进 CreateView。
   - 理由：流水线卡片仍是入口之一（PipelineSelector 注册 film-engineering 卡片），但"浏览真实工程 + 复制 + 套用"是独立工作流，独立路由更清晰；CreateView 保持聚焦。

D7. token 引用解析优先级：job id 精确匹配（Assets 文件夹）> input_images id 匹配 > unknown。
   - 理由：语料中引用令牌指向素材 job；unknown 保留原文并标注，不丢信息。

## Risks / Trade-offs

- [语料下载慢/API 限流] → 后台重试+退避；kit 只依赖精选子集；脚本支持断点续跑（按文件夹粒度）。
- [平台 CDN URL 失效] → kit 记录 URL + 精选图本地下载双轨；前端失败显示占位 + 来源链接。
- [模板化套用质量机械] → 模板从真实语料归纳（非凭空设计）+ 用户可编辑结果 + 可选 LLM 润色。
- [kit 数据过大拖慢打包] → 精选版上限 5MB；图片用 min 版；CI 检查 kit 体积门禁。
- [版权边界] → 只使用公开 API 可见元数据与精选小图；电影视频本体不入库；文档标注来源与 MIT/社区许可。

## Migration Plan

- 部署：随 apps/desktop 主进程发布（新增文件 + PIPELINES 注册 + IPC 注册），无 schema 迁移、无 DB 变更。
- 回滚：移除 PIPELINES 条目与注册调用即可完全禁用；film-kit 目录删除不影响既有功能。
- 兼容：所有 IPC 新通道独立命名；前端路由懒加载；旧版本不受影响。

## Open Questions

- AI 视频 provider 直连生成（V2）：等 V1 图片生成路径稳定后再设计，不影响本 change 规格。
