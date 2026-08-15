# story2video-compose-observability Specification

## Purpose
TBD - created by archiving change story2video-compose-observability. Update Purpose after archive.
## Requirements
### Requirement: 合成生命周期可关联

Story2Video compose 引擎 SHALL 为每次合成生成稳定的 composeId，并在合成开始、阶段开始/结束、最终成功和最终失败的结构化日志 meta 中携带该字段。日志 SHALL 使用 logger meta，不得使用 composeId 改写既有 pipeline progress 或 IPC 数据结构。

#### Scenario: 成功合成可串联

- **WHEN** 一次 compose 成功完成
- **THEN** compose_started、至少一个 compose_stage_started、对应的 compose_stage_succeeded 与 compose_succeeded 事件共享同一非空 composeId

#### Scenario: 失败合成可定位阶段

- **WHEN** compose 在片段、拼接、旁白、BGM、WebM、校验或持久化阶段失败
- **THEN** 记录 compose_failed，其 meta 包含同一 composeId、失败 stage、安全错误摘要和可用错误码

### Requirement: FFmpeg 阶段记录可诊断结果

每个 compose 内的 FFmpeg 阶段 SHALL 记录 ffmpeg_started，并最终记录恰当的 ffmpeg_succeeded、ffmpeg_failed 或 ffmpeg_timeout。事件 meta SHALL 包含 composeId、stage、operation、输入数量、timeout、耗时、输出 basename 和输出字节数（可用时）。

#### Scenario: FFmpeg 超时可与一般失败区分

- **WHEN** FFmpeg 返回 ETIMEDOUT 或 killed + SIGTERM timeout 语义
- **THEN** 记录 ffmpeg_timeout 而非 ffmpeg_failed，且记录 timeoutMs、signal、killed、elapsedMs 和安全 stderr 摘要

#### Scenario: FFmpeg 未写出产物

- **WHEN** FFmpeg 命令正常返回但预期输出文件缺失或为空
- **THEN** 记录 ffmpeg_output_missing，包含 composeId、stage、operation、输出 basename、输出字节数和安全 stderr 摘要，并使该阶段失败

### Requirement: 分块拼接具备块级观测

chunked concat SHALL 为每一块记录 merge_chunk_started 与 merge_chunk_succeeded 或 merge_chunk_failed，并保留既有 merge_l{level}_chunk_{n} created 文本日志。块级 meta SHALL 包含 composeId、level、chunkIndex、totalChunks、输入数量、耗时和输出字节数。

#### Scenario: 长块仍在工作时有心跳

- **WHEN** 任何分块 FFmpeg 合并持续超过 10 秒
- **THEN** 记录 merge_chunk_heartbeat 和 ffmpeg_heartbeat，包含 elapsedMs、outputBytes、outputGrowing；连续 30 秒没有输出增长时以 WARN 级别标记 stalled

### Requirement: 合成诊断日志保护隐私

Story2Video compose observability 日志 SHALL NOT 记录完整绝对路径、完整 FFmpeg 参数、素材文本、prompt、token、密钥或未截断 stderr。路径仅可记录 basename；stderr 仅可作为经过路径替换和长度截断的摘要写入 meta。

#### Scenario: 失败日志不暴露素材目录

- **WHEN** 任何 FFmpeg 或 compose 阶段错误包含本地绝对路径
- **THEN** 结构化日志中的 error/stderr 不包含该完整路径