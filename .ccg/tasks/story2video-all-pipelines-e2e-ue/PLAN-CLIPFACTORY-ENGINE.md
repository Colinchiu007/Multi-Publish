# clip-factory（视频切片工厂）真实引擎设计（2026-08-06）

## 目标
输入一个长视频 → 场景检测提取精彩片段 → 逐段剪辑 → 合并导出高亮短片。全部本地 FFmpeg 完成（不依赖外部模型），符合"纯本地可做"档位。

## 输入/输出
- 输入：`params.video`（本地视频文件，经 story2video-paths.resolveReadableMediaFile 校验）
- 输出：合并后的 mp4（导出到可持久化目录，saveRun 复制进项目）

## 阶段（stageDefs）
| 阶段 | 类型 | 实现 |
|---|---|---|
| analyze | clipfactory_analyze | ffprobe 时长 + ffmpeg `select='gt(scene,0.3)',metadata=print` 解析场景边界 → segments[{start,end,score}]（上限 8 段、最短 2s、总时长 ≤60s） |
| extract | clipfactory_extract | 逐段 `ffmpeg -ss start -i in -t dur -c:v libx264 -preset veryfast -c:a aac clip_N.mp4`（并发 2） |
| caption | clipfactory_caption | 校验/透传，为每段生成标题「精彩片段 N」（预留 LLM 增强位） |
| export | clipfactory_export | ffmpeg concat demuxer 合并 → output.mp4；output { videoPath, segments } |

## 复用/新增
- `findFfmpeg`/`findFfprobe`（media-tool-paths.js，打包资源优先）
- 新 `clipfactory-stages.js`：registerClipFactoryStages（4 个自定义类型 + 默认 provider 无需模型）
- pipeline-engine stageDefs（clip-factory 4 阶段，checkpointRequired=false）
- container.setup 注册
- saveRun 泛化：resolve 视频路径兼容 context.export.videoPath；AUTO_PIPELINES += 'clip-factory'

## 测试
- clipfactory-stages.test.js：analyze 解析 ffmpeg 输出、extract/export 命令组装（mock execFile）、输入缺失报错
- 真实 E2E：用 ffmpeg 生成 20s 测试视频（含明显场景变化）→ UI/引擎驱动 → 输出 mp4 + ffprobe

## 前端（随引擎后）
- clip-factory 需要视频输入：CreateView 新增"媒体自动流水线"类别（显示视频页签、路由到 orchestrated start 带 params.video）
