# 修复 generate_assets 阶段断点续传不跳过已生成资源

## 问题描述
视频创作流水线在运行到图片和旁白阶段时，已生成部分图片和旁白语音资源。
中断后从断点继续时，系统没有跳过已有的生成资源，而是重新生成图片和旁白语音。

## 根因分析
1. _saveRunningCheckpoint(run) 在阶段执行之前被调用（pipeline-engine.js:2232），此时 context 中没有 generate_assets.resume 数据
2. generate_assets 阶段执行期间，资产逐一生成，但断点续传数据（context.generate_assets.resume）只在阶段失败时才写入（story2video-stages.js:3373-3400）
3. 如果 App 在阶段执行中被强杀/崩溃，磁盘上只有步骤 1 的 running 快照（没有断点数据）
4. 恢复时加载该快照，resumeCompleted Map 为空，所有资源重新生成

## 修复方案
在 generate_assets 阶段执行期间，每完成一个资产（图片/旁白/视频），立即更新 context.generate_assets.resume 并保存 running checkpoint。
这样即使 App 在阶段中途崩溃，磁盘上的 running 快照也包含已完成资产的断点数据。

## 涉及文件
- apps/desktop/electron/services/pipeline-engine.js
- apps/desktop/electron/services/story2video-stages.js
