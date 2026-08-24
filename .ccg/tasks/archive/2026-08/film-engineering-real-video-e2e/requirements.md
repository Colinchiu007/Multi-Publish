# Requirements

## Goal

在已登录 profile 的真实模型配置下验证“视频创作 -> 电影工程”和 Story2Video 主流程，确认实际 MP4 成片，并修复 E2E 暴露的问题。

## Acceptance

- 电影工程能加载工程、浏览分镜、导出提示词和应用剧本，且不复现“提交的数据不符合要求”。
- Story2Video 使用真实 provider 图片、视频、LLM、TTS 路径产生可由 ffprobe 解码的 MP4。
- 失效克隆音色重克隆后，新 ID 跨运行写回 owner registry 和偏好，避免重复克隆。
- 图片轮播的 `zoompan` 合成在低速机器上不因过短超时而误杀持续输出的 ffmpeg。
