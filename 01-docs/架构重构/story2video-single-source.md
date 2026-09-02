# story2video 单源收敛设计（Stage 2 域收敛，2026-09-02）

## 概述

story2video 相关代码当前分散在多个模块中，存在重复逻辑。本文档定义单一事实来源的收敛方案。

## 当前分散状态

| 模块 | 文件 | 行数 | 重复内容 |
|------|------|------|---------|
| 前端视图 | `CreateView.vue` | 6,422 | 状态枚举、阶段归一化、元数据管理（已提取至 src/domain/） |
| 主进程引擎 | `story2video-compose-engine.js` | ~800 | 流水线编排逻辑 |
| 主进程服务 | `story2video-project-service.js` | ~500 | 项目 CRUD |
| 主进程处理器 | `story2video.js` | ~1,200 | IPC handler |
| 主进程路径 | `story2video-paths.js` | ~200 | 文件路径管理 |
| Python 后端 | `video_compose.py` | ~300 | 视频合成 |
| Remotion | `Story2VideoSlideshow.tsx` | ~400 | 渲染 |

## 已完成的收敛工作

| 工作 | 状态 |
|------|------|
| pipeline-constants 提取 | ✅ Stage 1.3 |
| pipeline-normalizer 提取 | ✅ Stage 1.3 |
| Ed25519 运行时验签 | ✅ Stage -1.6 |
| 容器守卫 (sidecar cleanup) | ✅ Stage 1.4 |

## 收敛计划

### 第一阶段：配置收敛
- 将分散的 story2video 配置统一到 `src/domain/` 下
- 消除 CreateView.vue 中残留的内联常量

### 第二阶段：引擎收敛
- 将 compose-engine 中的纯逻辑提取到独立模块
- 统一流水线编排接口

### 第三阶段：渲染收敛
- 统一 Python 和 Remotion 两端的输出格式
- 建立统一的输出规范

## 当前模块依赖关系

```
CreateView.vue (前端)
  └── src/domain/pipeline-constants.js
  └── src/domain/pipeline-normalizer.js
  └── src/api/electron-bridge.js (IPC)

story2video-compose-engine.js (主进程)
  └── story2video-project-service.js
  └── story2video-paths.js
  └── prompt-bridge.js
  └── splitter-bridge.js
  └── aligner-bridge.js

story2video.js (IPC handler)
  └── story2video-compose-engine.js
  └── story2video-project-service.js

video_compose.py (Python)
  └── ffmpeg
  └── TTS providers

Story2VideoSlideshow.tsx (Remotion)
  └── 独立渲染管线
```
