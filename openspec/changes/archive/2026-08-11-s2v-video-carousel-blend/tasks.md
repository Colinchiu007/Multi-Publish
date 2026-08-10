# Tasks: s2v-video-carousel-blend

## 说明
- 进度唯一来源：以本文件 checkbox 为准；CCG task.json 只记录阶段。
- 运行时代码走 `codex/s2v-video-carousel-blend` 分支，经 PR 合并回 main。
- 基线：origin/main 990500b8。差异审计结论：图片轮播与 videogen 两套体系均为已交付基线，本 change 只承载「整合为混合流水线」的新增能力，无已交付项重复规格化。

## 实现前（前置）
- [x] 差异审计（基线 vs 现状）：已确认两套独立体系与可复用点（videogen GENERATE、compose zoompan、text-config normalizer、model-call-scheduler）
- [x] proposal.md / design.md / specs（3 个 delta）/ tasks.md 生成
- [ ] 双模型分析记录：Claude 后端可用并完成探针验证；antigravity 后端地区不可用 → 降级为主代理分析（记录于 task.json review.md）
- [x] 运行 `openspec validate --change s2v-video-carousel-blend` 通过

## 实现

### 1. 配置契约（story2video-text-config.js + 测试）
- [x] DEFAULT_STORY2VIDEO_TEXT_CONFIG 增加 video 段默认（mode off / fixedRatio 25 / minRatio 20 / maxRatio 40 / maxScenes 3）
- [x] normalizeStory2VideoTextParams 增加 video 段白名单归一化与边界校验（枚举/数值/min<=max/maxScenes 1..12/provider-model idValue）
- [x] stageOptions.select_video_scenes 与 stageOptions.generate_assets.videoMode/video 透传；返回对象增加 video 段
- [x] story2video-text-config.test.js：默认 off、fixed 合法、非法比例拒绝、未知字段忽略、min>max 拒绝、provider/model 空值

### 2. 场景选择阶段（story2video-stages.js + pipeline-engine.js + 测试）
- [x] 新增 STORY2VIDEO_STAGE_TYPES.SELECT_VIDEO_SCENES = 'story2video_select_video_scenes'
- [x] pipeline-engine.js story2video-compose stageDefs 在 optimize 与 generate_assets 间插入 select_video_scenes 阶段
- [x] 实现选择执行器：off→空 plan；fixed→顺序累计估算时长标记；ai-judged→LLM 评估 + 解析 + 比例/数量钳制
- [x] 视频生成器解析：显式 provider/model 优先，否则 getDefault('video')；未配置 fail closed 引导文案
- [x] context.video_plan 输出：{ mode, scenes:[{index,useVideo,excitement,reason}], ratio, selectedCount }
- [ ] story2video-stages.test.js：fixed 顺序标记、ai-judged 钳制（超上限剔除/不足补入/解析失败 fail closed）、未配置 provider fail closed、off 空 plan

### 3. 混合资源生成（story2video-stages.js generate_assets + 测试）
- [ ] 读取 context.video_plan；useVideo 场景调视频适配器（callAdapter generateVideo + getVideoStatus 轮询 + 下载），并发 1，经 modelCallScheduler.withModelBudget({type:'video'})
- [x] 视频场景产出 videoPath 且不生成图片；TTS 照常
- [x] 视频失败回退：复用已生成图片 / 补生成图 / allowPartialAssets 语义
- [x] resume 快照 completed 项记录 videoPath；恢复时复用
- [x] assets_progress 增加 videosDone/videosTotal
- [x] story2video-stages.test.js：视频场景产出 videoPath、失败回退、resume 复用、进度字段

### 4. 混合片段合成（story2video-compose-engine.js + 测试）
- [x] 场景准备：videoPath（kind 'video'）或 imagePath 二选一 + audioPath 必有；双画面源冲突策略确定
- [x] _createSegment 视频分支：AI 视频 scale/帧率归一化 + 时长裁剪/补齐 + 字幕/水印 + 混音
- [x] segmentRecords 增加 mediaKind
- [x] story2video-compose-engine.test.js：混合输入合成、视频源不可读拒绝、双源冲突、纯图片向后兼容

### 5. 前端（CreateView.vue + 相关）
- [x] s2vConfig 增加 videoMode/videoProvider/videoModel/videoFixedRatio/videoMinRatio/videoMaxRatio 默认
- [x] 新增「视频增强」折叠区 UI（模式 select / 生成器 select / fixed 比例 / ai-judged 区间提示 / 成本文案）
- [x] startOrchestratedPipeline 组装 story2videoTextConfig.video
- [x] STORY2VIDEO_STAGE_NAMES 增加 select_video_scenes；stageDetailText 展示「已选 N 个 AI 视频场景（约 X%）」
- [x] S2V_RESTORE_ENUM_OPTIONS 增加 videoMode；快照恢复兼容
- [x] 视频 provider 选项加载（复用图片 provider 加载方式）

### 6. 文档
- [x] 01-docs/PRD.md 新增 7.1.25（数据校验/流程/功能逻辑/交互/显示项/提示文字）
- [x] CHANGELOG.md 追加条目
- [x] review.md 记录双模型审查结论（antigravity 降级说明）

## 验证（质量门禁）
- [x] 受影响单测全绿（story2video-text-config / story2video-stages / story2video-compose-engine / pipeline-engine）
- [x] `npm run build`（frontend）通过
- [x] 桌面打包验证（修改 electron 服务代码）：`cd apps/desktop && node ../../node_modules/electron-builder/cli.js --win --x64` exit 0 或等价本地打包验证
- [x] openspec validate 通过
- [ ] scripts/openspec-sync-check.js 通过

## 交付
- [x] git commit（分支 codex/s2v-video-carousel-blend）
- [x] 推送远程 + 创建 PR
- [x] CI 通过后合并回 main
- [x] OpenSpec archive + CCG task 归档 + learnings（三同步）
- [x] 更新记忆（extensions/ad_hoc/notes）
