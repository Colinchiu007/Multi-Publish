# 设计

## 事件模型

所有事件使用 logger 的第四参数传递 meta：event、composeId、stage、operation、elapsedMs、outputBytes 等字段。日志消息保持简短可读，机器检索以 event 为准。

## 生命周期

compose_started → compose_stage_started/ffmpeg_started → ffmpeg_succeeded 或 ffmpeg_failed/ffmpeg_timeout → compose_stage_succeeded 或 compose_stage_failed → compose_succeeded/compose_failed。

## 分块

每块记录 merge_chunk_started、周期性 merge_chunk_heartbeat、merge_chunk_succeeded 或 merge_chunk_failed。心跳默认每 10 秒，首版只读取输出文件大小；输出 30 秒未增长时将 heartbeat 提升为 WARN。

## 安全

只记录 basename、输入数量、时长、字节数、PID、退出码、signal、错误码和截断 stderr。禁止记录完整 FFmpeg args、绝对路径、prompt、音频文本和凭据。
