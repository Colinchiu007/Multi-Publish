# Review: s2v-video-carousel-blend（2026-08-11）

## 审查方式
- 双模型审查：antigravity 后端因地区限制不可用（已探测：Eligibility check failed）→ 降级为「主代理深度自审 + Claude 独立审查」。
- 审查对象：git diff（20 文件，+1950/-63），含 story2video-text-config / story2video-stages / story2video-compose-engine / pipeline-engine / CreateView.vue / 测试 / 文档。

## 主代理自审结论（初稿，待 Claude 结论合并）
### Critical
- 无。

### Warning
- W1（已修复）：CHANGELOG.md 首次编辑被截断 → git checkout 恢复后重新插入。
- W2（已修复）：text-config 变量名 video 与媒体输入字段冲突 → 更名 videoConfig。
- W3（已加固）：AI 视频短于旁白时 -shortest 会截断旁白 → _encodeVideoSegmentOnce 增加 -stream_loop -1；再补 -fflags +genpts 兼容 provider mp4 时间戳不连续。
- W4（设计边界）：ai-judged 全部被剔除时回退保留最高 excitement 单场景，实际占比可能超出 maxRatio（单场景超长场景）——PRD 已明示「至少 1 个」兜底语义，属文档化偏差。

### Info
- I1：downloadVideoToFile 跟随重定向无跳数上限——与 videogen-stages 既有实现一致，URL 来源为已配置 provider 响应，风险可控。
- I2：视频场景估算时长基于 split.targetSeconds，真实占比以 TTS 时长为准（PRD 明示「约」）。
- I3：视频生成串行（并发 1）且 maxScenes 默认 3，极端场景（10 分钟/场景 × 3）generate_assets 阶段可能耗时较长——前端阶段详情有进度显示。

## 待 Claude 审查结果合并
（占位）

## Claude 独立审查结论（2026-08-11，antigravity 不可用降级）
- 结论：架构方向正确、normalizer 白名单与钳制算法质量较高、向后兼容处理细致；无 Critical。
- Warning 处理：
  - W1 默认视频模型解析（多模态 capability_models.video）→ 已修复（resolveVideoGeneratorConfig）。
  - W2 视频调用绕过 withModelBudget → 已修复（generate_assets 视频路径套 withModelBudget + withAssetTransientRetry）。
  - W3 getVideoStatus 错误响应不终止轮询 → 已修复（code<0/success=false 立即 break + 可读错误）。
  - W4 下载后未校验 → 已修复（size>0 + ffprobe 视频流校验，失败回退图片）。
  - W5 下载无重定向/协议/大小限制 → 已修复（http/https 白名单、≤5 跳、maxBytes 截断）。
  - W6 compose 视频 100MB vs 512MB 矛盾 → 已修复（videoPath 按 512MB 校验）。
  - W7 e2e-full-pipeline.test.js 阶段列表 → 已同步 7 阶段。
  - W9 视频片段 2x 工作分辨率重编码 → 已修复（workScale=1 直编）。
  - W8 index 强转 → 评估为可接受（Number() + isInteger 校验，数值字符串兼容）。
- Info 处理：I2（targetSeconds 接线 stageOptions.split.target_duration）、I4（max_tokens 随场景数放大）、I5（'true'/1 布尔兼容）、I7（视频生成尺寸长边封顶 1280）、I8（i18n/BoardStageIndicator 补 select_video_scenes）、I10（generate_assets 复用 videoPlan provider/model）；I3/I6/I11/I12/I13 记录为设计边界/文档化偏差。
- 审查后修复的测试：stages 视频分支新增 W3/W5 回归用例（getVideoStatus 错误终止、HTTP 404 下载回退）；修复测试 harness 的 assetGenerator 注入与 execFile 导入缺失。
