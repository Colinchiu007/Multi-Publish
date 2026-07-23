# Remotion 合成能力接入 Multi-Publish — PRD

> **边界说明（2026-07-22）**：本文只描述 Remotion 快速渲染路径，不定义
> `story2video-compose` 的阶段契约。Story2Video 已在 CreateView 中走 Electron
> `StageExecutor` + `Story2VideoComposeEngine`（ffmpeg）链路；两条路径共享发布入口，
> 但不共享合成器实现。详见 `PRD-video-creation.md` 和 `architecture-video-integration.md`。

## 背景
现有视频合成依赖 ECS 服务端，4G 内存只能串行排队。需要利用用户本地算力，零服务器开销。

## 目标用户
Multi-Publish 桌面客户端用户（自媒体创作者）

## P0 功能
1. 在桌面客户端直接完成"输入文案→渲染视频→预览→发布"全流程
2. 渲染进度实时显示，支持取消
3. 渲染完成后可播放和下载

## 验收标准
1. 用户在创作页输入文案 → 点击生成 → 进度条上涨 → 渲染完成 → 预览视频
2. 整个过程不依赖 ECS（除素材存储）
3. 已打包或锁定的 Remotion 运行资源、依赖或 Chromium 缺失时明确阻断并给出修复指引；应用运行时不执行在线安装
4. 渲染可取消

## 排除项
- 不改造现有发布流程
- 本文不定义 Story2Video 前端；其迁移和验收以 `PRD-video-creation.md` 为准
- 不修改 OpenMontage 源码
